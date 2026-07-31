# C22 — Composition root and session

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L4 shell |
| **Depends on** | Everything below. It is the only component that may |
| **Consumed by** | The app's entry point · C23 (receives the constructed graph) |
| **Source** | A01 §5 · A02 §3, §4, §6 · `t01` · the obligations deferred by C01, C05, C07, C09, C10, C14, C15, C16, C17, C19, C20, C21 |
| **Status** | Draft |

---

## 1. Purpose

C22 builds the object graph, owns the state that belongs to no component, and owns the session's beginning and end.

It exists because twelve components deliberately do not reach for each other. Every "L4 orchestrates" note in the specs below resolves here — not as a convenience, but because the alternative is L0's two halves importing each other and L1 importing the terminal (A02 Seam 4).

The two things it must get exactly right are **ordering** and **shutdown**. Both are the kind of correctness that is invisible when right and produces a corrupted terminal when wrong.

---

## 2. Configuration

```typescript
type TuiConfig = Readonly<{
  name:     string;
  binary:   string;
  manifest: Manifest | string;
  theme:    ThemeSet;

  adapters?:          Readonly<Record<string, Adapter>>;
  commandPolicy?:     CommandPolicy;
  completionSources?: readonly CompletionSource[];
  chrome?:            Readonly<{ header: ChromeFn; footer: ChromeFn }>;
  blocks?:            readonly BlockDefinition[];
  transport?:         TransportRouter;

  debug?:   Readonly<{ retainPayloads?: number }>;   // off by default; 50 when enabled without a count

  clock?:    () => number;
  fs?:       FileSystem;
  stateDir?: string;                       // default ~/.prism; the app resolves PRISM_TUI_STATE_DIR (I20)
  openUrl?: (url: URL) => Promise<void>;   // default: the OS handler, http/https only
  stdout?: NodeJS.WriteStream;
  stdin?:  NodeJS.ReadStream;
}>;

type ChromeFn = (s: SessionSnapshot) => readonly Block[];

type StopReason = "exit" | "eof" | "interrupt" | "signal" | "fault";

type Identity = Readonly<{
  user: string; email: string;
  groups: readonly string[];
  expiresAt: number | null;           // ms; null = no expiry known
}>;

interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  appendFileSync(path: string, data: string): void;   // the exit path only — C20 §2, I18
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

function createTui(config: TuiConfig): TuiInstance;

interface TuiInstance {
  start(): Promise<void>;
  stop(reason: StopReason): Promise<number>;   // resolves with the exit code
  readonly session: SessionSnapshot;
}
```

Four required fields. Every optional one has a working default: the fallback adapter, the `/` prefix policy, manifest-derived completion, default chrome, no extra blocks, subprocess transport, real clock and filesystem.

`debug.retainPayloads` turns on C13's raw-payload retention (C13 §5a) so `/debug` can show what an adapter was actually given. Absent, nothing is retained. Present without a count, the default is 50 — a number rather than "all" because doubling memory against a 100,000-block cap is how a debug mode becomes one nobody turns on.

`stateDir` defaults to `~/.prism`. It is injected for a concrete reason: standalone development would otherwise append to the developer's real history and read their real config, which makes a clean-clone run neither clean nor repeatable.

**`PRISM_TUI_STATE_DIR` is resolved by the app's entry point, not here** (I20). An earlier draft of this section had C22 read it, which contradicts A03 SS10 — the scan bans `process.env` across all of `src/` with a one-file allow-list, C02's, because an exception list is the thing that grows. C06 I18 settled the same question for `PRISM_TUI_TRANSPORT` and the reasoning transfers whole: a variable named for one consumer has no business inside a framework that claims to serve others, and `tui-kit` ships no binary to read it from. `prism-tui` reads its own variable and passes the resolved path through `TuiConfig.stateDir`, exactly as it passes a constructed router through `TuiConfig.transport`.

This is a structural interaction rather than an oversight, which is why it survived review: §2 is about what C22 owns and SS10 is about what `src/` may read, both correct on their own, and the sentence sat in the one cell where they meet.

**`FileSystem` structurally satisfies C20's `HistoryFs`, and that is the direction the dependency runs.** C20 declares the narrow seam it needs — four methods, no `mkdir`, no `exists` — because an L3 component reaching up to L4 for a type is the edge A02 Seam 4 exists to prevent; this interface is a superset, so the injected `fs` is passed straight down with no adapter. `appendFileSync` is the one synchronous member and it exists for C20 I18: `beforeRelease` is synchronous (C01 I5), and without it the append in flight at exit — the command just submitted — is lost.

`openUrl` is injected for the same reason as `clock` and `fs`: it is a side effect, and a component that shells out to `xdg-open` cannot be unit-tested. C23 scheme-checks before calling it (C23 §3a).

`clock` and `fs` are injectable because **every component below refuses to read them ambiently** — C03, C08, C13, C16, C17, C19, C20 each say so. C22 is where the real ones enter, and where a test substitutes fakes for the entire graph at once.

---

## 3. Construction order

```
 1  validate config                      → invalid: throw before anything is acquired
 2  detect capabilities                     C02
 3  build registries: blocks, adapters,
    completion sources, manifest            C09, C07, C19, C05
 4  seal all four registries                C05, C07, C09 obligations
 5  construct stores: transcript, viewport,
    overlays, history, editor, theme         C13, C14, C15, C20, C17, C10
 6  construct the process runner             C21
 7  construct the lifecycle, passing
    onFatal and beforeRelease                C01 — installs signal handlers
 8  construct the frame scheduler             C03
 9  construct the input router and
    register every handler                    C16
10  construct the execution pipeline          C23
```

Three orderings are load-bearing and the rest are incidental:

**5 and 6 before 7.** The lifecycle's `beforeRelease` closes over the history store and the process runner. C01's signal handlers exit the process after releasing (C01 §Signals), so cleanup that has not been wired by then never runs at all.

**7 before any acquire.** C01 registers its handlers at construction, which is what closes the window where terminal state is held with nothing to release it (C01 I3).

**4 before 9.** A registry sealed after input is accepted could serve a different answer to the same question at two points in one session — the drift C05, C07 and C09 each seal against.

---

## 4. Startup

```
 1  parse argv, check stdout is a TTY     → not a TTY: print help, exit 0
                                            unless the verb declares one-shot output
 2  load app config                       → missing or no context: dispatch config init
 3  construct the graph (§3)
 4  check terminal size                   → below 60 × 16: fallback render, await resize
 5  acquire the terminal                     C01
 6  first paint: empty frame
 7  fire banner fetches, non-blocking
 8  accept input
```

**Gate 1 has one exception.** A verb whose manifest entry declares `oneShot: true` — `/dashboard --once` is the only one in v1 — writes a single frame to stdout and exits, with no alternate screen and no session. Piping is its entire purpose, so refusing it for not being a TTY would refuse the use case. The exception is declared in the manifest rather than special-cased by name, so a second such verb needs no change here.

Gates 1, 2 and 4 are `t01`'s. **Gate 4 does not block construction** — the graph is built, the fallback is drawn, and a resize continues from step 5 with session state intact. The too-small render is C22's, deliberately layout-engine-free, because it must work in a terminal too small for the layout engine to produce a sane answer. The 60 × 16 threshold is C22's number and not C02's: C02 §8 assigns it to L4 explicitly, on the grounds that a minimum size is an app policy rather than a terminal capability. An earlier draft cited it as `C02 §Size`, a section C02 has never had — a dangling reference, and A03 §9a records what happens to those when a renumber gives them something to resolve against.

Step 7 is non-blocking, so the banner completes visibly over the first second rather than delaying the prompt. Input is accepted at 8, not after 7 — a dev can type while the banner is still filling in.

---

## 5. Session state

The state that belongs to no component.

```typescript
type SessionSnapshot = Readonly<{
  cwd:       string;
  env:       Readonly<Record<string, string>>;   // `export` overrides
  lastUuid:  string | null;                      // for `$_`
  identity:  Identity | null;
  cluster:   string;
  health:    "live" | "degraded" | "offline" | "expiring";
  version:   string;
  retained:  string | null;           // a command held for retry after re-login
  stopping:  boolean;                 // set by stop(); C23 refuses submissions once true
}>;
```

| Field | Written by | Read by |
|---|---|---|
| `cwd`, `env` | C23, applying a `builtin` result (C18) | C21 via `SpawnOptions.cwd` |
| `lastUuid` | C23, after a verb returns one | C18's `$_` expansion |
| `identity`, `health` | C22's refresh loop | Chrome, and the notices in §7 |
| `retained` | C23, on an auth failure; cleared on a successful retry | C23's retry handler |
| `stopping` | C22, at `stop()` | C23, to refuse late submissions |
| `cluster`, `version` | **nobody — set at construction, never written after** | Chrome (S01 §2) |

**Nine fields, seven of them mutable.** An earlier draft counted six and named neither `cluster` nor `version` in this table, which left I11 — exactly one writer per field — with nothing to say about two of the nine. That is A03 §2's vacuity class in a state table: a field absent from an ownership table reads exactly like a field nobody writes, and only one of those is a claim.

`cluster` and `version` are the ones nobody writes, and they are declared so rather than dropped from the type. Both come from config, both are read by chrome — S01 §2 reads `session.cluster` and commits that cluster never elides — and both are constant for the life of a session: a second cluster is a second session (§13), and the version cannot change under a running process. So the row is `nobody`, and T1.11 asserts it as an absence of writes rather than skipping the two fields it cannot name a writer for.

`cwd` is exposed to C21 as a **function**, not a value (C21 I11), so a `cd` between two verbs actually moves the second one.

Nothing else lives here. The candidates I expected — verb concurrency, exit arming, the prompt/liveBlock focus bit — are already owned by C06, C16 and C16 respectively, and duplicating them would create exactly the two-writers problem A02 §4 exists to prevent.

---

## 6. Chrome

The header and footer are **app-supplied functions from a session snapshot to blocks** (hook 5, F5). `tui-kit` owns the frame's structure — one row each, fixed position, never scrolling — and the app decides what goes in them.

The default chrome renders name, binary and clock. Prism's renders cluster, identity, health and clock (`t01` §The header).

The prompt is `❯ ` and its gutter is `{ first: 2, cont: 2 }`, passed to C17's `displayRows` (D24a, C17 §2). C22 owns that number because C22 owns the frame; C17 must not assume one.

---

## 7. Health and identity

Identity is fetched at startup and refreshed on a five-minute cadence against the injected clock. **That loop covers identity only** — any live part in the banner or elsewhere is driven by C23 §3b, so there is one refresh mechanism rather than two (C24 §5). Two transitions commit a notice to the transcript rather than only changing the header:

**Token under one day** — `Token expires in 14h — run /login to refresh`.

**Token expired** — the next verb fails with the auth envelope. **C23 detects it during adaptation and appends the notice**, because it is an execution outcome and C23 owns the transcript. C22 owns only the state: it holds the failed command in `session.retained` and sets `health`. `retry` re-runs the retained command through C23's normal path.

Neither ever auto-logins; that would open a browser without being asked (`t01`).

An unreachable cluster sets `health: "offline"` and nothing else. Verbs fail with their own transport envelopes and system commands keep working — a dev on a train still wants `git log`, and the session should not become useless because the platform is not there.

---

## 8. Shutdown

**One function, five callers** (`t01`): `/exit`, Ctrl-D confirm, double Ctrl-C confirm, signal, fault.

```
1  set session.stopping = true      C23 refuses further submissions
2  lifecycle.release()              runs beforeRelease, then restores the terminal
3  print diagnostics, if any        only now, on the restored primary screen
4  exit with the caller's code
```

with `beforeRelease` — supplied by C22 at construction — doing:

```
a  killAll()                        C21 — SIGKILL, no grace, not awaited
b  history.drain()                  C20 — the synchronous append
```

### `beforeRelease` is synchronous, and the floating promise is deliberate

C01 I5 requires it synchronous and non-throwing, because a signal handler cannot await. Both calls are chosen to hold under that constraint, and each is a case where the synchronous-looking thing is the wrong one:

**`killAll()` returns a `Promise` and is called without `await`.** It delivers every `SIGKILL` in a synchronous loop and then awaits only the *reaping* (C21 §killAll). So by the time it returns its promise, every live child has already been signalled — which is the part that must happen before the terminal is released — and what is abandoned is the wait for exit statuses nothing here reads. **The assertion is therefore the observable one: every handle in `runner.live` was signalled before the first release byte.** Asserting that a promise settled would assert the part that does not matter and would require the await that breaks I5.

**And the promise is defended, because "fixing" it breaks I5 invisibly.** There is no `no-floating-promises` rule in this tree — typescript-eslint was rejected during C02 at 87 packages — so nothing flags the promise and nothing flags the fix either. The next reader adds `await`, `beforeRelease` becomes `async`, and the failure appears only when a signal arrives during shutdown: the path least likely to be exercised and most likely to matter. A comment at the site is a habit; what carries it is **T2.8, which asserts `beforeRelease()` returns `undefined` and not a thenable**, and T6.14, which names the edit.

**`drain()`, not `flush()`.** C20 ships both, and `flush()` is `async` (C20 §2, I18): the append still in flight at exit is the command the user has just typed, and Node does not wait for a pending promise at process end. `drain()` is the synchronous member `FileSystem.appendFileSync` exists for. Calling `flush()` here would satisfy the reading of step b and lose exactly the entry the step is written to save.

**Cleanup runs through `beforeRelease` and nowhere else.** An earlier draft had C22 call `killAll` and flush directly on the explicit paths and treated `beforeRelease` as a no-op afterwards — but C01 I5 runs it once before the *first* release, which had not yet happened, so both ran twice. A double history flush duplicates entries. One path, five callers, no special case.

**Step 3 before step 4** is the rule that makes a crash debuggable: a stack printed onto the alternate screen is discarded when the screen is released, so the dev sees a flash and an empty shell. Restoring first puts the trace in the real scrollback where it can be read and pasted.

History flushes on **every** path including faults. Losing a session's history to a crash is a small loss that feels large.

---

## 9. State machine

| From ↓ / call → | `start` | `stop` |
|---|---|---|
| **created** | → running, or → stopped if a gate fails (T1.1) | → stopped (T1.9) |
| **running** | no-op (T3.2) | → stopped (T1.8) |
| **stopped** | throw (T3.1) | no-op (T1.10) |

**The session has no suspended state.** Handoff suspension is transient and belongs to C23's sequence (C23 §4); `SIGTSTP` is C01's and never surfaces here. Adding one would create a state nothing observes and two owners for the same condition.

`stopped` is terminal, matching C01's released state. A second session constructs a new instance.

---

## 10. Invariants

- **I1** — Stores and the process runner are constructed before the lifecycle, so `beforeRelease` can reach them.
- **I2** — The lifecycle is constructed before any acquire.
- **I3** — Every registry is sealed before input is accepted.
- **I4** — Shutdown is one function with five callers, idempotent, and runs its four steps in order.
- **I5** — Cleanup runs inside `beforeRelease` and nowhere else; it can therefore never run twice.
- **I6** — Release precedes diagnostics on every path.
- **I7** — History flushes on every path, faults included.
- **I8** — A failed size gate does not abort construction; session state survives until a resize.
- **I9** — The too-small render uses no layout engine.
- **I10** — Clock and filesystem enter the graph only here.
- **I11** — Session state has exactly one writer per field, and the two fields with no writer say so. `cluster` and `version` are set at construction and never written after; a field absent from §5's table would read identically to a field nobody writes, and only one of those is a claim.
- **I12** — `cwd` reaches C21 as a function, never a captured value.
- **I13** — Chrome is app-supplied; `tui-kit` owns only the frame's structure.
- **I14** — C22 never auto-logins.
- **I15** — An offline cluster degrades the session; system commands keep working.
- **I16** — `stopped` is terminal.
- **I17** — `createTui` requires exactly four fields; every other has a working default. The count is the ergonomic claim R01 §1 tests — a working TUI built from the README without asking a question — and a fifth required field is a spec change rather than a convenience.
- **I18** — Banner and identity fetches are non-blocking: input is accepted before either completes, and neither can delay the first frame. A shell that will not take a keystroke until a network call returns is a shell that hangs on a bad DNS entry.
- **I19** — Identity refresh runs on C22's injected clock at a five-minute interval, and expiry never discards the command that hit it. The command is retained across re-login and resubmitted by the user, not automatically — a session that silently re-ran a verb after an auth gap would re-run it against whatever the credentials now authorise.
- **I20** — `tui-kit` reads no environment variable. `PRISM_TUI_STATE_DIR` is resolved by the app's entry point and arrives as `TuiConfig.stateDir`, exactly as `PRISM_TUI_TRANSPORT` arrives as `TuiConfig.transport` (C06 I18). A03 SS10's allow-list stays at one file.
- **I21** — `beforeRelease` is synchronous and returns `undefined`, never a thenable. `killAll()`'s promise is deliberately not awaited: its signals are delivered synchronously and only the reaping is deferred, and awaiting it would make the handler `async`, which C01 I5 forbids because a signal handler cannot await.

---

## 11. Commitments

1. Four required config fields; every other has a working default (I17).
2. Clock, filesystem, opener and state directory are injected here and nowhere else; `stateDir` defaults to `~/.prism` and the **app's entry point** resolves `PRISM_TUI_STATE_DIR` (I10, I20).
3. Stores and the runner precede the lifecycle, which precedes any acquire (I1, I2).
4. All four registries seal before input is accepted (I3).
5. Gates are TTY, config, then size; the size gate defers rather than aborts, and a manifest-declared one-shot verb bypasses the TTY gate (I8).
6. The too-small render is layout-engine-free (I9).
7. Banner fetches are non-blocking and input is accepted before they finish (I18).
8. Session state is nine fields — seven with one writer each, and `cluster` and `version` set at construction with none. Nothing else lives here (I11).
9. `cwd` is exposed as a function so `cd` moves subsequent verbs (I12).
10. Chrome is app-supplied; the prompt gutter is C22's to pass, not C17's to assume (I13).
11. Identity refreshes every five minutes; expiry warns and offers inline re-login with the failed command retained (I19).
12. Shutdown is one function, five callers, four ordered steps, with cleanup solely inside `beforeRelease` (I4, I5).
12a. `beforeRelease` is synchronous and returns no thenable; `killAll()`'s promise is not awaited and `drain()` is used rather than `flush()` (I21, C01 I5, C20 I18).
13. Release precedes diagnostics; history flushes on every path (I6, I7).
14. An offline cluster degrades rather than ends the session (I15).
15. `stopped` is terminal (I16).

---

## 12. Tests

Six tiers. Every cell of the §9 table is covered. Tiers 1–4 use fake clock, fake filesystem and a fake terminal stream throughout.

### Tier 1 — unit

- **T1.1**: `start` with valid config → running; every component constructed once.
- **T1.2** (I1): construction order is asserted on an event log — stores and runner before lifecycle.
- **T1.3** (I2): the lifecycle's handler registration precedes the first acquire.
- **T1.4** (I3): all four registries report `sealed` before the input router accepts anything.
- **T1.5**: `createTui` with only the four required fields → every default applied and functional.
- **T1.6** (I10): a fake clock and filesystem reach every component that takes one — asserted per component.
- **T1.7** (I5): on every exit path, `killAll` and `drain` each run **exactly once** — the double-flush regression, tested directly.
- **T1.8**: `stop("exit")` from running → §8's **four** steps in order, exit code 0. An earlier draft of this line said five, against a §8 and an I4 that both say four; the count is asserted against the list rather than restated, so the two cannot drift again.
- **T1.9**: `stop` from created → stopped without acquiring anything.
- **T1.10** (I4): `stop` twice → the second is a no-op; no double release, no double flush.
- **T1.11** (I11): each session field is written only by its documented writer — a spy per field, all nine. `cluster` and `version` are asserted as **never written after construction**, which is the half a table with seven rows could not state.

### Tier 2 — contract / interface

- **T2.1** (I4): for each of the five callers, the same shutdown function runs — asserted by identity, not by behaviour.
- **T2.2** (I6): on all five paths, the last release byte precedes the first diagnostic byte.
- **T2.3** (I7): history is flushed on all five paths, including a thrown exception.
- **T2.4** (I10): a source scan finds no ambient clock or `fs` reference anywhere in `tui-kit` outside C22.
- **T2.5**: every hook in A02 §6 has a default except `theme`, and each default is exercised.
- **T2.6** (I12): `SpawnOptions.cwd` is a function; a compile-level test rejects a string.
- **T2.7**: config validation rejects each missing required field with a named error, before construction.
- **T2.8** (I21, C01 I5): `beforeRelease()` returns `undefined` — not a thenable, checked as `typeof result?.then !== "function"` rather than by awaiting, since awaiting a non-thenable passes. This is the mechanism behind the floating `killAll()`: nothing in this tree flags a floating promise and nothing flags the `await` that would "fix" it, and the resulting `async` handler fails only when a signal arrives during shutdown.
- **T2.9** (I20): a source scan finds no `process.env` and no `PRISM_TUI_STATE_DIR` anywhere in `src/`, C02's one allow-listed file excepted. The C06 T2.9 shape, for the second variable.

### Tier 3 — edge cases

- **T3.1**: every illegal transition in §9 throws with a named error — two cases.
- **T3.19**: `stop` sets `session.stopping` before releasing, so a submission racing shutdown is refused.
- **T3.2**: `start` twice → no-op, nothing constructed twice.
- **T3.3**: `stop` during construction → nothing acquired, no cleanup attempted.
- **T3.4**: `stop` while a handed-off child is running → `beforeRelease` signals every handle in `runner.live` and **the handed-off child is not among them**, then the terminal is released.

  **The original line asserted the opposite and was unsatisfiable.** It read "the child is killed inside `beforeRelease`", and C21 deliberately does not track a handed-off child in `live` (`runner.ts`, the comment under `handoff`): that child runs in *this* process group, so signalling the group would kill the session along with it. The child receives the signal from the OS, on the same delivery that reached this process — which is why the row still ends with the terminal released and no orphan, and why the assertion is about what `beforeRelease` reaches rather than about the child's fate.

  Written as a consequence rather than an oversight, because the two read identically once the test is green: an assertion nobody can satisfy and an assertion nobody has written yet both show up as a missing test.
- **T3.5**: non-TTY stdout → help printed, exit 0, no escape sequence emitted.
- **T3.5b**: non-TTY stdout with a `oneShot` verb → one frame to stdout, exit 0, no alternate screen, no session constructed.
- **T3.6**: missing config → `config init` dispatched; the shell opens afterwards.
- **T3.7** (I8): terminal 44 × 12 at launch → fallback drawn, graph constructed; resizing to 100 × 30 continues to a normal frame with state intact.
- **T3.8** (I9): the fallback renders with no call into the block registry or layout — asserted by a spy.
- **T3.9**: shrinking below minimum mid-session → fallback replaces the frame; scrollback and history survive.
- **T3.10**: a banner fetch that never resolves → the prompt is usable; the section renders as unavailable at its timeout.
- **T3.11**: a banner fetch that throws → that section degrades; the others still render.
- **T3.12** (I14): an expired token → a notice with an inline re-login offer; no browser opens.
- **T3.13**: `retry` after a successful re-login → the retained command re-runs unchanged.
- **T3.14** (I15): cluster unreachable at startup → `health: "offline"`, session opens, a system command still runs.
- **T3.15**: a fault during construction, after stores but before the lifecycle → nothing acquired, no cleanup needed, error surfaced.
- **T3.16**: a fault during the first paint → `beforeRelease` runs, terminal restored, stack on the primary screen.
- **T3.17**: `SIGKILL` — documented as unrecoverable; the test asserts the documentation exists rather than the behaviour.
- **T3.18**: a `beforeRelease` that throws → logged, release still completes (C01 I5 from this side).

### Tier 4 — integration

- **T4.1** (with C01, C21): the `suspend` → `handoff` → `resume` → `invalidate` sequence runs in order; C01's raw-mode guard never fires.
- **T4.2** (with C10, C03): a theme switch triggers exactly one `invalidate`, issued by C22 and not by C10.
- **T4.3** (with C14, C03): a scroll issues exactly one `commit("input")`, issued by C22 and not by C14.
- **T4.4** (with C15, C13): popping a view appends nothing — C15 writes nothing and C22 composes nothing. A trace here would freeze the block the pop returns to and clear the selection A01 D7 preserves.
- **T4.5** (with C20, C17): a history recall calls `setText`; C20 never touches the editor.
- **T4.6** (with C18, C21): a `cd` built-in updates session `cwd`, and the next spawn lands there.
- **T4.7** (with C19, C17): ghost text is composited into the prompt without entering the buffer.
- **T4.8** (with C16, C06): Ctrl-C during a pass-through forwards `SIGINT`; during a verb it cancels.
- **T4.9** (with C17): the gutter C22 passes matches the prompt it renders, so `displayRows` equals the rendered height.
- **T4.10** (with C13, C20): `/clear` empties the transcript and leaves history intact.

### Tier 5 — e2e

PTY harness.

- **T5.1**: launch, run three commands, `/exit` → terminal byte-identical to a control run (C01 T5.1 from the session's side).
- **T5.2**: the same for Ctrl-D, double Ctrl-C, `SIGTERM` and a thrown exception.
- **T5.3**: a crash mid-session → the stack is readable in the primary-screen scrollback afterwards.
- **T5.4**: a session with two children running, killed with `SIGTERM` → both reaped, history flushed, terminal restored.
- **T5.5**: launch in a 40 × 10 terminal, resize to 120 × 40 → fallback then a working session, no corruption.
- **T5.6**: launch with no far side installed and `PRISM_TUI_TRANSPORT=fixture` → fully usable session.
- **T5.7**: fifty launch/exit cycles → no descriptor leak, no handler leak, terminal clean each time.

### Tier 6 — fail-on-revert

- **T6.1** (I1): constructing the lifecycle before the stores → T1.2 fails, and cleanup silently stops running on signal paths.
- **T6.2** (I2): acquiring before handler registration → T1.3 fails, reopening C01's crash window.
- **T6.3** (I3): sealing after input is accepted → T1.4 fails.
- **T6.4** (I4): a second shutdown path → T2.1 fails.
- **T6.5** (I6): printing before release → T2.2 and T5.3 fail, and crash traces vanish.
- **T6.6** (I7): flushing history only on clean exit → T2.3 fails.
- **T6.13** (I5): calling cleanup directly as well as in `beforeRelease` → T1.7 fails on the duplicate flush.
- **T6.7** (I8): aborting on a failed size gate → T3.7 fails, and a small terminal cannot start the tool at all.
- **T6.8** (I9): using the block registry for the fallback → T3.8 fails, and the fallback breaks in exactly the terminals it exists for.
- **T6.9** (I10): reading an ambient clock anywhere below → T2.4 fails and golden frames flake.
- **T6.10** (I12): passing `cwd` as a string → T2.6 and T4.6 fail.
- **T6.11** (I14): auto-login on expiry → T3.12 fails and a browser opens unasked.
- **T6.12** (A02 Seam 4): letting C10, C14 or C15 cause their own cross-layer effect → T4.2, T4.3 or T4.4 fails.
- **T6.14** (I21): adding `await` to the `killAll()` call in `beforeRelease` → T2.8 fails on the returned thenable. The revert is the plausible one — a reader who sees a floating promise and tidies it — and nothing else in the tree objects: typescript-eslint was rejected during C02, so there is no `no-floating-promises` rule to flag the promise or the fix. Without T2.8 the edit is green until a signal arrives mid-shutdown.
- **T6.15** (I20): resolving `PRISM_TUI_STATE_DIR` inside `src/` → T2.9 and A03 SS10 fail, and SS10's allow-list gains its second entry.
- **T6.16** (I11): dropping `cluster` or `version` from §5's table → T1.11 loses a field silently, because a field with no row and a field with no writer are the same absence to a reader. The count in commitment 8 is what fails.
- **T6.17** (I21, C20 I18): calling `flush()` rather than `drain()` in `beforeRelease` → T1.7 and T2.3 fail, and the command the user has just typed is the one entry lost, because Node does not wait for a pending promise at exit.

---

## 13. Out of scope

| Not here | Where |
|---|---|
| Running a command | C23 |
| The narrative of execution | B02 |
| Every component's own construction | The component |
| The auth flow itself | The far side; C22 displays and offers |
| Prism's chrome content | `prism-tui` |
| Multi-cluster sessions | Phase 2 |
