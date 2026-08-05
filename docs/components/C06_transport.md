# C06 — Transport

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L0 data |
| **Depends on** | C21 process runner (same layer, acyclic). **Not C05** — `streams` arrives on the `Invocation`; the caller reads the manifest |
| **Consumed by** | L4 execution pipeline · C07 adapters (consume its output) |
| **Source** | A01 D13, D16–D19, B1–B8 · A01 §5 wiring · A02 §2, §6 |
| **Status** | Draft |

---

## 1. Purpose

C06 runs a tool and reports what happened. That is the whole job, and the discipline that makes it work is that **C06 reports, C07 interprets.**

C06 never constructs a `ViewDocument`, never maps an exit code to a status, never synthesises an error envelope. It returns exit code, parsed stdout, raw stdout, stderr, duration, and whether it was cancelled or timed out. Everything downstream is C07's judgement. Splitting it this way is what lets transport be tested with no view model in sight, and lets adapters be tested with no process in sight.

It is also where the framework's build modes live. **Three implementations, not two:**

| Implementation | Used by | Behaviour |
|---|---|---|
| `EmulatedTransport` | `npm run dev` | A stateful, animated world generates envelopes on demand (C08) |
| `FixtureTransport` | `npm test` | Replays a recorded corpus. No clock, no randomness, no world |
| `SubprocessTransport` | Production | Spawns the far side |

**Tests never run against the emulator.** An animated world serving tests becomes the thing the tests agree with, and then emulator drift silently masks a regression — which is the fiction problem C08's provenance model exists to prevent, reintroduced through the side door. The emulator is for looking at; the corpus is for asserting against.

Selection is per verb (D13), which is what allows a verb to migrate to native without touching anything else, and per-mode by one factory taking one mode value:

```typescript
type TransportMode = "emulated" | "fixture" | "subprocess";
function createTransport(deps: TransportDeps): VerbTransport;   // mode is a field of deps
```

**C06 does not read the environment** (I18). `PRISM_TUI_TRANSPORT` is resolved by the *app's* entry point — `prism-tui` and `docker-tui` each read their own and pass a constructed router through `TuiConfig.transport`. Calcium ships no binary, and a variable named for one consumer has no business inside a framework that claims to serve others. It is also what keeps SS10 true: the only file under `src/` that touches `process.env` is C02's, reading an injected record.

Nothing else in the codebase branches on mode.

---

## 2. Public interface

```typescript
type Invocation = Readonly<{
  verb:      string;
  argv:      readonly string[];       // ["ps", "--mine"] — "--json" appended by transport
  streams:   boolean;                 // from the manifest
  timeoutMs: number;                  // 0 = unbounded (live views)
  signal:    AbortSignal;
}>;

type RawResult = Readonly<{
  argv:       readonly string[];      // exactly what was spawned, including --json
  exitCode:   number | null;          // null iff killed by signal
  signal:     string | null;
  stdout:     unknown;                // parsed JSON, or undefined if unparseable
  stdoutRaw:  string;                 // always retained, parsed or not
  stderr:     string;
  durationMs: number;
  parseError: string | null;
  cancelled:  boolean;
  timedOut:   boolean;
  overflowed: boolean;                // the runner's buffer bound was crossed (C21 I5)
}>;

type RawPatch =
  | Readonly<{ kind: "data";      value: unknown }>
  | Readonly<{ kind: "malformed"; line: string }>
  | Readonly<{ kind: "degraded";  reason: string }>
  | Readonly<{ kind: "end";       result: RawResult }>;

interface VerbTransport {
  invoke(inv: Invocation): Promise<RawResult>;
  stream(inv: Invocation): AsyncIterable<RawPatch>;
}

interface TransportRouter {
  for(verb: string): VerbTransport;
  readonly busy: boolean;
  readonly inFlight: string | null;   // verb name, for the refusal message
}

type Clock = Readonly<{
  now:      () => number;                                   // durationMs
  schedule: (fn: () => void, ms: number) => Disposable;     // the §4 ladder
}>;

function createSubprocessTransport(opts: {
  binary: string;
  runner: ProcessRunner;              // C21, declared in `data/process/types.ts`
  clock:  Clock;
  env?: Readonly<NodeJS.ProcessEnv>;
  cwd?: () => string;                 // live — pass-through `cd` moves it
}): VerbTransport;

type FixtureHandler = (inv: Invocation) =>
  | RawResult
  | AsyncIterable<RawPatch>;

function createFixtureTransport(corpus: readonly Fixture[]): VerbTransport;
function createEmulatedTransport(handler: FixtureHandler): VerbTransport;

/** Discriminated on mode, so a mode cannot be constructed without its dependency. */
type TransportDeps =
  | Readonly<{ mode: "subprocess"; binary: string; runner: ProcessRunner; clock: Clock;
               env?: Readonly<NodeJS.ProcessEnv>; cwd?: () => string }>
  | Readonly<{ mode: "fixture";    corpus: readonly Fixture[] }>
  | Readonly<{ mode: "emulated";   handler: FixtureHandler }>;

function createRouter(opts: {
  default: VerbTransport;
  overrides?: Readonly<Record<string, VerbTransport>>;
}): TransportRouter;
```

`createEmulatedTransport` takes a **handler function**, not a world object. Calcium must not reference an app type, and a closure keeps the fixture world entirely on the app side (C08) while the framework supplies only the interface.

`cwd` is a function, not a value. The shell's working directory changes when the user runs `cd` (C18 built-in), and a captured string would spawn every subsequent verb in the original directory.

`overflowed` is C21's fact, reported and not interpreted — the far side emitted more bytes than the runner would hold, so `stdoutRaw` is a prefix of what it wrote rather than the whole of it. **It is not `meta.truncated`.** That field says the fallback adapter capped rows (C07 I13), and the two claims share nothing but a shape: one is about blocks the adapter chose not to build, the other about bytes that never reached it. C07 §4 carries the open question of whether and how this reaches a document; C06's part is to say it happened.

`clock` is injected for the same reason C03's `schedule` is. `durationMs` needs the time twice and the §4 ladder needs two 2 s timers, and both are ambient reads that SS1 permits only in `src/shell/session.ts`. Injected, T3.5 asserts each rung of the ladder against a counter instead of sleeping through four seconds per case.

### `Fixture`

```typescript
type Fixture = Readonly<{
  id:         string;
  verb:       string;
  argv:       readonly string[];
  provenance: "recorded" | "derived" | "authored";
  capturedAt: string | null;          // ISO; null iff authored
  cliVersion: string | null;
  note?:      string;                 // required for authored
  result:     RawResult | readonly RawPatch[];
}>;
```

**Declared here rather than in C08**, per A02 §1: the type belongs to the layer that consumes it structurally. `createFixtureTransport` reads it, and it is expressed in `RawResult` and `RawPatch` — so declaring it in C08 would put a cycle inside L0 data, C06 importing `Fixture` while C08 imports the types it is made of. C08 keeps every *rule* about it: the authored-note requirement, the ratio report, recording, redaction, `record --diff`.

`createFixtureTransport` implements C08 §4 route 1 only — exact `verb` + `argv` match. Routes 2 and 3 belong to the handler. **On a miss it throws**, naming the verb and argv, because the alternative is a test asserting against a fixture that is not in the corpus and passing.

**Replay does not rewrite the stored result.** The `argv` a recorded fixture carries is the argv the far side was actually invoked with, and §3 explains why that is the honest thing to report rather than a rewritten one. It is also the plainer reading of C08 I2: byte-for-byte means the stored record, not the stored record with a field substituted. A rewrite is normalisation at replay time under another name.

The fixture's own `argv` — the `Fixture.argv` field, not `result.argv` — remains the *match key*, and is the invocation form without `--json`. Two argvs in one type reads like duplication and is not: one is what the corpus is indexed by, the other is what happened.

---

## 3. Invocation

`--json` is appended by the transport, never typed by the user (D16). A user who types `--json` explicitly is asking to see the contract, and C07 renders it raw — but that is C07's decision, and C06 appends regardless so the payload is always machine-shaped.

Spawning uses an **argv array**, never a shell string (D18). No quoting, no word splitting, no injection surface. The shell is never in the loop.

### Exit and signal reporting

C06 reports faithfully and interprets nothing:

- Normal exit → `exitCode` set, `signal` null.
- Killed → `exitCode` null, `signal` set.

**`argv` is what was actually spawned, and replay reports the recorded value verbatim.**

D49 settles what `meta.argv` means: it answers what actually ran, without re-running it. That is a **historical fact about the data**, not a reproduction hint — and a recording captured a real invocation, so replay reports that invocation.

An earlier draft had the fixture transport rewrite `argv` to what *would* have been spawned. It cannot know the binary, so it produced a command missing its first element; giving it one would have manufactured an argv for a command that never ran — a fiction dressed as a fact, and configuration the transport otherwise does not need.

The case that looks like an objection is the informative one. A corpus recorded against `docker` and replayed in an app that now spawns `podman` reports `docker`, because `docker` is where the data came from, and the mismatch is a signal the corpus is stale. `meta.transport` already disambiguates: `"fixture"` beside `["docker","ps","--json"]` reads correctly as replayed data from that command. The two fields together are honest; the rewrite made one of them lie.

Synthesis remains where there is nothing recorded to report: the emulated transport's world-generated results, and the results C06 constructs itself for a cancellation or a miss. Those describe an invocation that is happening now, not one that happened once.

- `stdout` is the parsed JSON when parseable, `undefined` otherwise, with `parseError` explaining why. `stdoutRaw` is retained either way, so C07 can always fall back to a `raw` block.
- `stderr` is captured separately and never merged into stdout (B3, A01 single-owner stdout).

The mapping of exit codes to document status (B4) lives in C07.

---

## 4. Cancellation and timeout

One escalation ladder, used by both paths:

```
SIGINT   → wait 2 s
SIGTERM  → wait 2 s
SIGKILL
```

Cancellation begins at `SIGINT` because a well-behaved far side cleans up on it (B8). A timeout takes the same ladder — a `SIGINT` to an already-unresponsive process is harmless, and one path is worth more than a marginally faster kill.

**Whatever was produced before the process died is retained.** A cancelled `--logs` tail keeps the lines it already showed; `cancelled` or `timedOut` is set so C07 can mark the document `partial`. Output is never discarded because the process ended badly.

`timeoutMs: 0` disables the timeout entirely, which is what live views use — a `--watch` that dies after thirty seconds is not a watch.

---

## 5. Streaming

For `streams: true` tools, stdout is NDJSON, one patch per line.

| Line | Emitted |
|---|---|
| Parses as JSON | `{ kind: "data", value }` |
| Does not parse | `{ kind: "malformed", line }`, and counted |
| Malformed exceeds **10%** of lines seen, minimum 10 lines | `{ kind: "degraded", reason }` once; subsequent lines continue to arrive as `malformed` patches, and C07 composes them into a `raw` block |
| Process exits | `{ kind: "end", result }` — always last, always emitted |

The 10-line floor matters: without it, one malformed line in the first three trips degradation on a healthy stream.

**Degradation is a property of arrival order, not of content.** The ratio is running, so the same hundred lines degrade or do not depending on where the malformed ones fall. Nine at the front trip it at line ten; nine at the back never do.

That is intended. A far side emitting a banner, an HTML error page or a stack trace front-loads its garbage, and nine bad lines at the start is strong evidence the stream is not NDJSON at all — while nine scattered through a hundred is a far side with a few odd rows. The rule should treat those differently, and a content-only rule cannot. The point is to stop early, not to characterise the whole stream.

**Degradation is sticky.** Once tripped, later well-formed lines do not un-trip it: raw text has already been emitted, and switching back mid-stream would interleave two renderings of one stream. This is a different claim from "it fires once" — a rule that emitted one `degraded` patch and then resumed parsing would satisfy that and still produce the interleaving.

The `degraded` patch carries a reason and nothing else. It had a `remaining` field, and the field was a fiction: the trip fires on a completed line, completing a line clears the buffer, so `remaining` was a partial line that was empty in almost every case. Redefining it as everything after the trip would mean buffering the rest of the stream, which contradicts streaming outright. What actually carries the remainder is the `malformed` patches that follow.

**`end` is emitted on every path**, including cancellation, timeout and spawn failure. A consumer awaiting the terminal patch never hangs.

Partial lines are buffered across chunk boundaries. A JSON object split across two reads is one patch, not two malformed ones.

---

## 6. Concurrency

**One non-streaming invocation at a time** (A01 D). A second `invoke` while one is in flight rejects with a named error naming the running verb; L4 renders the refusal.

Streams are exempt — a `--watch` is a subscription, not a command, and holding one must not block the prompt.

The guard lives here rather than in L4 because it is mechanical and because the router is the only place that sees every invocation.

### Router state machine

| From ↓ / call → | `invoke` | `stream` | invocation settles |
|---|---|---|---|
| **idle** | → busy (T1.1) | → idle, stream registered (T1.9) | — |
| **busy** | reject, stays busy (T3.1) | → busy, stream registered (T3.2) | → idle (T1.2) |

Settling covers success, failure, cancellation and timeout alike — every path releases the guard (T3.3).

---

## 7. Invariants

- **I1** — C06 never references `ViewDocument`, `Block` or any C04 type. Verified on the module graph.
- **I2** — C06 interprets nothing: no exit-code mapping, no envelope synthesis, no status.
- **I3** — Spawning always uses an argv array. No string is ever passed to a shell.
- **I4** — `--json` is appended exactly once, even if the user supplied it.
- **I5** — stderr is never merged into stdout.
- **I6** — `stdoutRaw` is retained regardless of parseability.
- **I7** — Output produced before death is retained on cancel, timeout and crash.
- **I8** — The escalation ladder is `SIGINT → SIGTERM → SIGKILL` on 2 s timers, for both cancellation and timeout.
- **I9** — `stream` always emits exactly one `end` patch, last, on every termination path.
- **I10** — Partial lines are buffered across chunk boundaries.
- **I11** — A single NDJSON line exceeding **1 MB** is emitted as `malformed` and its buffer released. Buffering is bounded; a far side emitting an unterminated stream cannot exhaust memory.
- **I12** — Degradation requires both ≥10% malformed and ≥10 lines seen, and it is evaluated on every completed line, so it depends on arrival order. It is **sticky**: once tripped, later well-formed lines do not un-trip it, and every subsequent line arrives as `malformed`.
- **I13** — At most one non-streaming invocation is in flight; every settlement path releases the guard.
- **I14** — Transport selection is per verb; `for()` is total and falls back to the default.
- **I15** — All three implementations satisfy the same interface and are substitutable in every test that does not concern spawning.
- **I16** — `FixtureTransport` reads no clock and holds no world state; it replays a corpus and nothing else.
- **I17** — The test runner selects `fixture`. Nothing in the test suite selects `emulated` *as a source of expected values*: `EmulatedTransport` is constructed only over a fixed handler, to assert interface parity (I15), and C08's world never appears in a test path (C08 I14). The qualifier is load-bearing — without it I17 and I15 contradict each other, since parity cannot be asserted for an implementation no test may construct.
- **I18** — C06 reads no environment. `createTransport` takes `mode` as a parameter, and no module under `src/` resolves `PRISM_TUI_TRANSPORT`.
- **I19** — Time enters C06 only through injected `now` and `schedule`. No ambient clock, no ambient timer.
- **I20** — **No transport rewrites a result it did not construct.** `createFixtureTransport` replays a stored `RawResult` verbatim, `argv` included; `createEmulatedTransport` reports what its handler produced. Synthesis is confined to results C06 builds itself — a cancellation, an abort before dispatch — where there is nothing to report and the argv describes an invocation happening now. Whoever produces a result owns its `argv`; the transport carrying it does not.
- **I21** — `timeoutMs: 0` schedules no timer at all. Not a very large timeout — none, asserted on the absence of the `schedule` call, because a timer armed with 0 and cleared later satisfies the weaker reading and kills every live view.
- **I22** — `cwd` is read at spawn, never captured at construction. A captured string spawns every subsequent verb in the directory the session started in, which is the one bug a pass-through `cd` is guaranteed to produce.
- **I23** — `createEmulatedTransport` takes a handler closure and C06 references no app type. The world stays app-side behind a function, which is what lets `prism-tui` and `docker-tui` each have one without the framework knowing either exists.
- **I24** — The parity suite compares the **complete** `RawResult`, not a chosen subset, on both the settled path and inside the terminal `end` patch. Fields that cannot match across transports are named individually with a reason, and that list is closed: a field is exempt by being on it, never by not being looked at.

---

## 8. Commitments

1. C06 reports; C07 interprets. No view model, no status mapping, no envelopes (I1, I2).
2. `--json` is appended by transport, exactly once (I4).
3. Spawning uses an argv array; the shell is never in the loop (I3).
4. stdout and stderr stay separate; raw stdout is always retained (I5, I6).
5. One escalation ladder for cancellation and timeout (I8).
6. Partial output is retained on every abnormal termination (I7).
7. `timeoutMs: 0` means unbounded, for live views (I21).
8. Streaming emits exactly one `end`, always last (I9).
9. Malformed-line degradation needs 10% *and* a 10-line floor, depends on arrival order by design, and is sticky once tripped (I12).
10. One non-streaming invocation at a time; streams are exempt (I13).
11. Transport is selected per verb, defaulting when unmapped (I14).
12. Three implementations behind one interface, selected by one mode value; nothing else branches on mode. The **app's** entry point resolves `PRISM_TUI_TRANSPORT` and passes a constructed router through `TuiConfig.transport`; Calcium has no binary and reads no environment (I18).
13. Tests run against the recorded corpus, never the emulator's world, so emulator drift cannot mask a regression (I17).
14. `cwd` is read at spawn time so pass-through `cd` is honoured (I22).
15. The **emulated** transport takes a handler closure; Calcium references no app type. The fixture transport takes a corpus (I23).
16. Line buffering is bounded at 1 MB (I11).
17. All three implementations are substitutable in every test that does not concern spawning (I15).
18. The fixture transport replays and nothing else — no clock, no world state (I16).
19. Time enters only through injected `now` and `schedule` (I19).
20. Replay reports what was recorded, verbatim (I20). `meta.argv` is a historical fact about the data — what actually ran — not a reproduction hint, so a corpus recorded against one binary says so even when the app now spawns another. `meta.transport` disambiguates; the two fields together are honest.
21. The parity suite compares the complete `RawResult` (I24). A suite that picks fields is a suite with holes exactly where nobody looked.

---

## 9. Tests

Six tiers. Every cell of the §6 transition table is covered. `ProcessRunner` is faked throughout tiers 1–3.

### Tier 1 — unit

- **T1.1**: `invoke` from idle → `busy` true, `inFlight` names the verb.
- **T1.2**: invocation resolves → `busy` false.
- **T1.3** (I4): argv `["ps","--mine"]` → spawned argv is `["ps","--mine","--json"]`.
- **T1.4** (I4): argv already containing `--json` → appended once, not twice.
- **T1.5** (I3): the runner receives an array; no code path builds a command string.
- **T1.6**: exit 0 with valid JSON → `stdout` parsed, `parseError` null, `stdoutRaw` populated.
- **T1.7** (I6): exit 0 with unparseable stdout → `stdout` undefined, `parseError` set, `stdoutRaw` intact.
- **T1.8** (I5): output on both streams → `stdout` and `stderr` are separate and neither contains the other.
- **T1.9**: `stream` from idle → registered without setting `busy`.
- **T1.10** (I14): `for("ps")` with an override returns it; `for("unmapped")` returns the default.
- **T1.11**: exit 2 → reported as 2 with no interpretation; no envelope is constructed.
- **T1.12**: killed by signal → `exitCode` null, `signal` set.

### Tier 2 — contract / interface

- **T2.1** (I15): the full tier-1 and tier-3 suites run against **all three** transports; every assertion that does not concern spawning holds for each. The emulated case is constructed over a fixed handler returning a constant envelope.

  **This is not a D43 violation, and it looks like one.** D43 forbids tests *agreeing with an animated world* — asserting on values the emulator invents, so that drift in the world silently becomes the expected result. This suite asserts that three transports behave identically at the interface, over a handler that returns a fixed envelope; nothing here treats the emulator as a source of truth about the far side. Stated because the alternative reading — see `emulated` in the `describe.each`, remember D43, narrow the suite back to two — is the same silent narrowing I15's "does not concern spawning" clause exists to prevent.

  **The suite compares the complete `RawResult`, not a chosen subset** (I24). A suite that picks fields is a suite with holes exactly where nobody looked. `argv` was the first such hole: it survived here and was found from C08's side, because the three transports were compared on `stdout`, `exitCode` and the shape of the patch sequence, and never on the field they actually disagreed about.

  Comparison is field-complete in both places a `RawResult` appears — the settled return of `invoke`, and the `result` inside the terminal `end` patch. The second is the easier one to forget: `data`, `malformed` and `degraded` patches are compared whole already, so the streaming side reads as covered while carrying the same gap one level down.

  Fields that cannot match are **named individually with a reason**, and the list is closed. A field is exempt by being on it, never by not being looked at — which is the same discipline the scan allow-lists take, and for the same reason: a rule that narrows to what it happens to cover stops seeing what it does not.

  `overflowed` is the first field added after the mechanism was built, and it is the mechanism's own test: field-completeness meant the fixture and emulated transports had to have an answer the day C21 gave the subprocess one. Neither can overflow — no buffer bound is crossed replaying a recording — so both report what was recorded, which for anything not recorded from an overflowing child is `false`. Asserted rather than left to default: an absent field and a `false` one read identically at a call site and differently in a comparison, and that is exactly the hole `argv` fell through.
- **T2.7** (I16): a source scan finds no clock read and no mutable module state in `fixture.ts`; replaying the same corpus twice yields deep-equal results.
- **T2.8** (I17): a source scan finds no `emulated` mode selection in `test/`, and no test imports C08's world.
- **T2.9** (I18): a source scan finds no `PRISM_TUI_TRANSPORT` anywhere in `src/`.
- **T2.2** (I1): the module graph contains no import of C04 or anything above L0.
- **T2.3** (I2): a source scan finds no exit-code mapping table and no `ErrorLike` construction in `transport/`.
- **T2.4** (I9): for a matrix of terminations — clean exit, non-zero exit, cancel, timeout, spawn failure, malformed stream — exactly one `end` patch is emitted, and it is last.
- **T2.5**: `AsyncIterable` contract — early `break` by the consumer terminates the child and still settles.
- **T2.6** (I13): after a hundred invocations across every settlement path, `busy` is false.

### Tier 3 — edge cases

- **T3.1**: `invoke` while busy → rejects with an error naming the in-flight verb; the running invocation is unaffected.
- **T3.2**: `stream` while busy → permitted.
- **T3.3** (I13): the guard releases on success, non-zero exit, throw, cancel, timeout and spawn failure — six cases.
- **T3.4** (I7): cancel mid-stream after forty lines → forty are retained, `cancelled` true.
- **T3.5** (I8): cancel → `SIGINT`; unresponsive for 2 s → `SIGTERM`; unresponsive again → `SIGKILL`. Fake clock, asserting each step and its timing.
- **T3.6**: cancel on a process that exits cleanly on `SIGINT` → no `SIGTERM`, no `SIGKILL`.
- **T3.7**: timeout takes the same ladder, with `timedOut` set and `cancelled` false.
- **T3.8**: `timeoutMs: 0` → no timer is ever scheduled.
- **T3.9**: `AbortSignal` already aborted at call time → no spawn occurs at all.
- **T3.10** (I10): a JSON object split across three chunks → one `data` patch.
- **T3.11** (I10): a chunk boundary falling inside a multi-byte UTF-8 sequence → no mojibake, no spurious malformed line.
- **T3.12** (I12): 9 malformed lines out of 100, **arriving after the stream is established** → no degradation. 11 out of 100 → degraded.
- **T3.12b** (I12): the same 9 out of 100, **clustered at the front** → degraded at line ten. T3.12 and T3.12b are a pair and the file says so: deleting either makes the rule look order-independent, and the next reader "simplifies" the survivor into a claim about content.
- **T3.13** (I12): 3 malformed out of 5 (60%, below the floor) → no degradation.
- **T3.14**: degradation fires once, not per subsequent malformed line.
- **T3.14b** (I12): a degraded stream that then emits fifty well-formed lines → still degraded, and all fifty arrive as `malformed`. Distinct from T3.14: a rule that emitted one `degraded` patch and resumed parsing passes T3.14 and interleaves two renderings of one stream.
- **T3.15**: stream emitting zero lines then exiting → only `end`.
- **T3.16** (I11): a single NDJSON line of 10 MB → emitted as `malformed` once the 1 MB cap trips; the buffer is released; subsequent lines parse normally.
- **T3.16b** (I11): an unterminated stream writing continuously with no newline → memory stays bounded at the cap.
- **T3.17**: binary not found → `end` with a spawn failure, `exitCode` null, guard released, no throw escaping.
- **T3.18**: the far side writes JSON to stderr and nothing to stdout → `stdout` undefined, `stderr` populated. C06 reports the mismatch, does not repair it (B3).
- **T3.19**: trailing newline absent on the final NDJSON line → still parsed.
- **T3.20** (I14, D13): `for("ps")` returns fixture while `for("promote")` returns subprocess, in one session.
- **T3.21** (I3): argv containing shell metacharacters (`;`, `|`, `$(…)`, backticks) → passed literally, no expansion, no injection.
- **T3.22**: `cwd` changes between two invocations → the second spawns in the new directory.
- **T3.23**: an invocation with no matching fixture → throws, naming verb and argv. A miss is never a plausible failure, or a test asserts against a fixture that is not there and passes.
- **T3.24** (I15): cancel mid-stream against the *fixture* transport → the lines already yielded are retained and `cancelled` is set, exactly as T3.4 asserts for subprocess. The fixture transport honours `signal`, or T3.4 becomes spawn-concerned by accident and the shared suite narrows.

### Tier 4 — integration

- **T4.1** (with C21): the escalation ladder issues real signals through the runner, verified on a child that ignores `SIGINT`.
- **T4.2** (with C05): `local: true` never reaches the transport; `streams: true` selects `stream` over `invoke`.
- **T4.3** (with C07): a `RawResult` from either transport adapts to a valid document, and both produce the same document for equivalent input.
- **T4.4** (with C07): a degraded stream produces a document whose `raw` block is composed from the `malformed` patches that follow the `degraded` one — which is what actually arrives, the `degraded` patch itself carrying only a reason.
- **T4.5** (with L4): the concurrency refusal surfaces as a notice naming the running verb, and the prompt stays usable.
- **T4.6** (with L4): a `cd` built-in followed by a verb → the verb spawns in the new directory.

### Tier 5 — e2e

Real subprocesses.

- **T5.1**: a real binary emitting a large document → parsed, rendered, within the latency budget.
- **T5.2**: a real streaming binary at 1,000 lines/s for sixty seconds → no memory growth beyond the block cap, no dropped `end`.
- **T5.3**: Ctrl-C during a real long-running verb → child dies within the ladder's bounds and partial output is retained.
- **T5.4**: killing the far side externally mid-invocation → `end` with signal, guard released, session survives.
- **T5.5**: the same session running one verb on fixtures and another on a real binary, interleaved.
- **T5.6**: the whole suite with `PRISM_TUI_TRANSPORT=fixture` and no far side installed at all — the standalone-build guarantee, tested.

### Tier 6 — fail-on-revert

- **T6.1** (I2): adding exit-code interpretation to C06 → T2.3 fails.
- **T6.2** (I1): importing `ViewDocument` → T2.2 fails.
- **T6.3** (I3): building a shell string → T1.5 and T3.21 fail.
- **T6.4** (I9): an early-return path that skips `end` → T2.4 fails on that termination.
- **T6.5** (I7): discarding buffered output on cancel → T3.4 fails.
- **T6.6** (I12): dropping the 10-line floor → T3.13 fails.
- **T6.6b** (I12): making degradation un-sticky — resuming parsing after the notice — → T3.14b fails, and one stream renders as data and raw text interleaved. T3.14 does not catch it.
- **T6.7** (I13): releasing the guard only on success → T3.3 fails on five of six paths.
- **T6.8** (I10): parsing per chunk rather than per line → T3.10 and T3.11 fail.
- **T6.9** (I4): appending `--json` unconditionally without the dedupe → T1.4 fails.
- **T6.10** (I15): a fixture-only or subprocess-only behaviour → T2.1 fails on the shared suite.
- **T6.15** (I15): narrowing the shared suite from three transports to two → T2.1 fails on the missing case, rather than passing with less covered.
- **T6.16** (I18): reading `process.env` in `createTransport` → T2.9 and SS10 fail.
- **T6.17** (I19): reading `Date.now()` for `durationMs` → SS1 fails, and T3.5's ladder assertions become four-second sleeps.
- **T6.11** (I14): making transport selection global → T3.20 fails, and with it the incremental-migration property.
- **T6.12**: capturing `cwd` at construction → T3.22 fails.
- **T6.13** (I11): removing the line cap → T3.16b fails on unbounded growth.
- **T6.14**: typing the fixture transport against an app-defined world → the module-graph test in T2.2 fails.
- **T6.18** (I24): narrowing the parity comparison to a chosen subset of `RawResult` → T2.1 fails on the field-completeness check, rather than passing with a hole. This is the revert that already happened once: the suite compared `stdout` and `exitCode`, `argv` diverged, and nothing went red until C08 recorded and replayed the same invocation.
- **T6.19** (I20): rewriting a stored field at replay — `argv` being the one it was — → T2.1 fails on parity and C08 T2.7 fails on byte-for-byte. A fixture-backed document then reports a command that never ran.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Spawning mechanics, stdio wiring, signal delivery | C21 |
| Exit-code → status mapping, envelope synthesis | C07 |
| Turning `RawPatch` into `ViewPatch` | C07 |
| The fixture world's content | C08 (app) |
| Deciding a verb is `local` | C05 |
| Rendering the concurrency refusal | L4 |
| A daemon or warm process pool | Parking lot — measure first |
