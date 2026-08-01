# C22 — Composition root and session

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L4 shell |
| **Depends on** | Everything below. It is the only component that may |
| **Consumed by** | The app's entry point · C23 (receives a subset of the graph, by interface — §3a step 10) |
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
  localHandlers?:     Readonly<Record<string, LocalHandler>>;   // §2a
  commandPolicy?:     CommandPolicy;
  completionSources?: readonly CompletionSource[];
  chrome?:            Readonly<{ header: ChromeFn; footer: ChromeFn }>;
  blocks?:            readonly BlockDefinition[];
  transport?:         TransportRouter;

  debug?:   Readonly<{ retainPayloads?: number }>;   // off by default; 50 when enabled without a count

  env?:      Readonly<NodeJS.ProcessEnv>;  // the app's; `{}` degrades to ASCII (I20)
  clock?:    () => number;
  fs?:       FileSystem;
  stateDir?: string;                       // default ~/.prism; the app resolves PRISM_TUI_STATE_DIR (I20)
  openUrl?: (url: URL) => Promise<void>;   // default: the OS handler, http/https only
  stdout?: NodeJS.WriteStream;
  stdin?:  NodeJS.ReadStream;
}>;

type ChromeFn = (ctx: ChromeContext) => readonly Block[];   // §6

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
  readDir(path: string): Promise<readonly Readonly<{ name: string; directory: boolean }>[]>;   // §2b
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

### 2b. `readDir`, and the completion sources nobody built

§2 above says the default for `completionSources` is manifest-derived, and §3a's `3 → 3` pair reasons about building the manifest before them. **Nothing built them.** `frameworkSources` is C19's export — verb, flag name, flag value, positional, path and executable — and construction registered `config.completionSources` alone, which defaults to the empty list. So `Tab` in a real session produced no candidates and therefore no menu, while C19's own tiers passed on every source.

Fifth instance this stretch of *a component built it, C22 was supposed to wire it, nothing did*, after the read loop, the effect table, the local handlers and the submit row's two steps.

Two of the six sources need to read a directory, and `FileSystem` had no way to. `ReadDir` is C19's seam (C19 I17) and C22 is the only file that may reach `node:fs` (I10), so the method joins the injected filesystem rather than being constructed beside it: a second filesystem route would put two of them in the graph, which is what I10 exists to prevent. C20's `HistoryFs` is a narrower subset and is unaffected.

### 2a. `localHandlers` — the route that did not exist

C23 §2 says an app registers its own local handlers alongside the framework's, and C23 I27 fails construction when a manifest verb marked `local` has none. Both are right, and **nothing carried the app's handlers into the pipeline**: `Pipeline.register` is reachable only after `start()` returns, and step 10 calls `seal()` before it does. So a manifest declaring any local verb could not start a session at all — the framework refused a configuration it gave no way to complete, and the refusal was the correct half of a pair whose other half was missing.

Found by running the fixture manifest through a real session for the first time. It declares two — `guide` and `debug dump` — and construction refused them by name, which is I27 working.

They arrive as config because that is where everything an app supplies arrives, and they are registered at step 10 **before** `seal()`, which is what makes the reconciliation see them. Registering after the seal would be a second window in which the two records can differ, and the seal exists to close the first.

`stateDir` defaults to `~/.prism`. It is injected for a concrete reason: standalone development would otherwise append to the developer's real history and read their real config, which makes a clean-clone run neither clean nor repeatable.

**`env` is the environment record, and the app supplies it** (I20). C02 takes one (`detectCapabilities(env, overrides)`) and C21 takes one (`ProcessRunnerDeps.env`, for `$SHELL`), and **no file under `src/` reads `process.env`** — not even C02, which is allow-listed for it and does not use the allowance. So the record enters through config, from the app's entry point, along with `stateDir` and `transport`.

It is optional and defaults to `{}`, which costs something worth naming: an app that omits it gets a capability record for a terminal that declares nothing, so the shell degrades to ASCII and no colour. That is the right default — it is the safe direction, and the alternative is a fifth required field, which I17 forbids for a reason R01 §1 tests. It is not the right *silence*, so C02's warnings surface on the restored primary screen (C02 §2) and an empty record is one of them.

**`PRISM_TUI_STATE_DIR` is resolved by the app's entry point, not here** (I20). An earlier draft of this section had C22 read it, which contradicts A03 SS10 — the scan bans `process.env` across all of `src/` with a one-file allow-list, C02's, because an exception list is the thing that grows. C06 I18 settled the same question for `PRISM_TUI_TRANSPORT` and the reasoning transfers whole: a variable named for one consumer has no business inside a framework that claims to serve others, and `tui-kit` ships no binary to read it from. `prism-tui` reads its own variable and passes the resolved path through `TuiConfig.stateDir`, exactly as it passes a constructed router through `TuiConfig.transport`.

This is a structural interaction rather than an oversight, which is why it survived review: §2 is about what C22 owns and SS10 is about what `src/` may read, both correct on their own, and the sentence sat in the one cell where they meet.

**`FileSystem` structurally satisfies C20's `HistoryFs`, and that is the direction the dependency runs.** C20 declares the narrow seam it needs — four methods, no `mkdir`, no `exists` — because an L3 component reaching up to L4 for a type is the edge A02 Seam 4 exists to prevent; this interface is a superset, so the injected `fs` is passed straight down with no adapter. `appendFileSync` is the one synchronous member and it exists for C20 I18: `beforeRelease` is synchronous (C01 I5), and without it the append in flight at exit — the command just submitted — is lost.

`openUrl` is injected for the same reason as `clock` and `fs`: it is a side effect, and a component that shells out to `xdg-open` cannot be unit-tested. C23 scheme-checks before calling it (C23 §3a).

`clock` and `fs` are injectable because **every component below refuses to read them ambiently** — C03, C08, C13, C16, C17, C19, C20 each say so. C22 is where the real ones enter, and where a test substitutes fakes for the entire graph at once.

---

## 3. Construction order

**`createTui` runs step 1 and nothing else.** Validation is eager — it needs nothing constructed, and a bad config should fail at the call site rather than on `start()` — so `createTui` throws for a missing required field (T2.7) and otherwise returns an instance in the `created` state. **Steps 2 to 12 run inside `start()`.**

Three things depend on that split, and none of them is served by constructing eagerly: §9's `created` state has to be a state where something exists and nothing is built; `stop` from `created` must find no lifecycle and nothing acquired (T1.9); and `TuiConfig.manifest` may be a path, so step 3 reads a file and a constructor cannot await.

```
 1  validate config                      → invalid: throw before anything is acquired
 2  detect capabilities                     C02
 3  build registries: blocks, adapters,
    manifest, completion sources            C09, C07, C05, C19  — manifest first
 4  seal the three that have a seal          C05, C07, C09 obligations
 5  construct stores: transcript, viewport,
    overlays, history, editor, theme         C13, C14, C15, C20, C17, C10
 6  construct the process runner             C21
 7  construct the lifecycle, passing
    onFatal and beforeRelease                C01 — installs signal handlers
 8  construct the frame scheduler             C03
8a  wire the cross-layer effects C22 owns:
    resize → viewport, resume → invalidate   A02 Seam 4
 9  construct the input router                C16
10  construct the execution pipeline          C23 — seals the local registry
11  register every handler                    C16, and 10's submit
12  construct the decoder and wire the
    read loop                                 C16, C01 — startup step 8's mechanism
```

**Step 11 is four handlers and an effect table, and it was two handlers.** `prompt` took `Enter` and `global` took the five scroll keys; nothing inserted a printable character into the editor, and none of `defaultKeymap`'s fourteen bindings was executed anywhere — the action names appeared in C16's table and in no other file in the tree. A keymap is data that documents behaviour (C16 §6), so `/help` rendered fourteen bindings of which two did anything, which is the structurally-absent class arriving in the most visible place in the product.

The effect table lives in `src/shell/keys.ts`, and it is **not** `src/shell/actions.ts`: that file is C23's block-action dispatch, a different thing wearing the same word, and each names the other so the collision is not tidied into one file later. The table is total over C16's `KeyAction` union (C16 I19), so a bound action with no effect and an effect with no binding are both compile errors rather than a `/help` entry that does nothing.

| Target | What the handler owns |
|---|---|
| `prompt` | printable keys and pastes into C17; `Enter` submits; the eight bound actions — newline ×3, `complete`, `acceptGhostOrForward`, `historyPrev`, `historyNext`, `reverseSearch` |
| `overlay` | the six bound actions — `menuNext` ×2, `menuPrev`, `menuAccept`, `dismiss`, `searchOlder` |
| `liveBlock` | the block keymap C16 merges while the block is live (C16 §6), dispatched through C23 §3a |
| `global` | scroll, which was already here |

**Step 12 is the courier, and it was missing from this list while startup step 8 named its effect.** C16's decoder is `push(chunk) / poll() / nextDeadline()` and owns no timer; C01 delivers raw bytes through `onInput` and interprets none (C01 I18). Neither is wired to the other by existing, and nothing else in the tree is allowed to read stdin — so "accept input" was a step with a name and no mechanism, and a session built from this document decoded nothing while every component it needed was finished and tested. It is last because it is the moment the shell becomes live: a byte arriving before step 11 reaches a router with no handlers.

The step does three things, and the third is the one with no other home:

```
decoder = createDecoder({ capabilities, now })
lifecycle.onInput(chunk => { for (e of decoder.push(chunk)) dispatch(e) })
after every push and every wake-up: arm a timer for decoder.nextDeadline()
```

**One commit per decoded batch, in the read loop, and no handler commits.** C16 I11 says L4 commits and does not say where; two places is what that leaves open, and a scroll went through a handler that committed and would have gone through a loop that committed too. The rule is the same trade this project has taken every time it has arisen — construction over discipline: a handler that forgets to commit is a keystroke that changes state and draws no frame, nothing checks for it, and the symptom is a UI that intermittently does not respond. One commit at the end of the batch cannot be forgotten by a handler that does not have the duty.

A batch is what one `push` returned, so a two-hundred-line paste is one commit rather than two hundred. C03 would coalesce the paints, but each of the two hundred would still schedule, and the reason the loop batches at all is that the decoder already told us they are one event.

**The wake-ups are C22's because the decoder owns no timer and C01 owns no clock.** Three of C16's rules are timeouts — the 50 ms escape window, the 30 ms paste heuristic, the 500 ms exit arming — and each reports its moment through `nextDeadline()` rather than firing it. Without a scheduled `poll()`, a lone `Esc` is delivered only when the *next* key arrives, which is a keystroke that appears to do nothing until you press another one. The timer is `config.schedule`, the same injected one the identity loop takes (I10).

Three orderings are load-bearing and the rest are incidental. §3a walks every pair.

**5 and 6 before 7.** The lifecycle's `beforeRelease` closes over the history store and the process runner. C01's signal handlers exit the process after releasing (C01 §Signals), so cleanup that has not been wired by then never runs at all.

**7 before any acquire.** C01 registers its handlers at construction, which is what closes the window where terminal state is held with nothing to release it (C01 I3).

**4 before 11.** A registry sealed after input is accepted could serve a different answer to the same question at two points in one session — the drift C05, C07 and C09 each seal against.

### 3a. The pairs, walked

**Indexed by pairs of steps whose ordering rules could both apply, not one row per step.** A row governed by a single rule restates that rule and finds nothing; every defect below lived in a cell where two correct statements overlap. This is the structural half of the artefact — no event passes between two construction steps, so a sequence trace cannot reach any of it — and §8a is the event-mediated half.

| Pair | What the later step closes over | If they swap | Kind |
|---|---|---|---|
| 1 → 2 | nothing | Nothing breaks: C02 acquires nothing and emits nothing, so an invalid config is still rejected before any state exists | **incidental** |
| 2 → 3 | the capability record | Block definitions are built against a default record, and a Unicode terminal gets a table in ASCII beside a sparkline that is not — C02 §1's whole reason for existing | **constitutive** |
| 3 → 3 | the manifest, by the completion sources | The default completion sources are manifest-derived (§2), so building them first yields sources over an empty tool list that never refill | **constitutive** |
| 3 → 4 | the built registries | Sealing an unbuilt registry seals nothing | **constitutive** |
| 2 → 5 | the capability record | C10, C14 and C17 each take it; same failure as 2 → 3 | **constitutive** |
| 4 → 11 | the sealed registries | **I3.** A registry answering differently at two points in one session | **load-bearing** |
| 5, 6 → 7 | the history store and the runner, via `beforeRelease` | **I1.** Cleanup is wired after the handlers that would call it, so it never runs on a signal path — and nothing fails, because the explicit paths still work | **load-bearing** |
| 7 → 8 | `lifecycle.acquired` and `writer` | C03 takes both (`FrameSchedulerOptions`); there is no scheduler to construct | **constitutive** |
| 7 → acquire | the registered handlers | **I2.** C01's crash window reopens | **load-bearing** |
| 9 → 10 | the router, by the pipeline | C23's submit row ends `router.resetFocus()` (A02 Seam 4, C16 I2) | **constitutive** |
| 10 → 11 | the pipeline, by the submit handler | **The cycle, and the defect this table found.** See below | **load-bearing in effect** |
| 10 → 9 | the pipeline, by the router's `inFlight` and `cancel` pulls | **The second direction of 9 → 10, and it does not reopen the cycle.** See below | **constitutive, deferred by the pull** |
| 5 → 11 | C15, by `raiseExitConfirm` | The Ctrl-C and Ctrl-D rungs have nothing to raise; C16's ladder answers and nothing appears | **constitutive** |
| 5, 8 → 8a | the viewport and the scheduler, by the resize subscription | Nothing, in effect: it is placed at the earliest point both halves exist, and the cost of placing it later is a resize arriving during construction and being dropped | **incidental** |
| 8 → 11 | the scheduler, by the scroll handler | C14 moves and nothing paints — the frame is one scroll behind until an unrelated commit catches it up | **constitutive** |

**10 → 9 arrived with C23's walk, and the table is what settled it.** C16's Ctrl-C rungs 1 and 2 now read `C23.inFlight` rather than `C06.busy` (C16 §5, C23 §8a A1), and cancellation goes through C23 rather than `runner.killAll` — because killing the child does not settle the entry, and I10 says a cancelled submission settles `partial` with its output retained. So the router needs the pipeline, and the pipeline already needed the router for `resetFocus`.

Read as construction that is a cycle, and it is the one §3a found once already. **It is not, because `RouterDeps` is seventeen pulls and no subscriptions** (C16 §2) — `inFlight` is an eighteenth of the same kind. The closure is written at step 9 and evaluated when a key arrives, which is after step 11 and after startup step 8 admits input. Nothing calls it in between.

**The mutation pass measured this rather than arguing it.** Rewriting the pull as a value captured at step 9 does not fail one test — it fails **fourteen**, because the capture evaluates `pipeline` inside the dead zone and construction throws. The wrong shape is unbuildable rather than silently wrong, which is the whole of the argument below.

**And the shape fails loudly if that ever stops being true.** `pipeline` is a `const` declared at step 10, so a call between 9 and 10 is a `ReferenceError` from the temporal dead zone rather than a `null`. The tempting alternative — `let pipeline = null`, assigned at 10 — reads as more defensive and is worse: it would answer `null` silently, and a silent `null` here means Ctrl-C taking a lower rung and clearing the prompt over a running verb, which is A1's defect restored by the fix for it. The binding that cannot be read early is the one to keep.

`signalShellChild` stays on the runner. Rung 2 forwards `SIGINT` to a child and changes no entry state; the transport observes the exit through its normal path.

**The 9 / 10 / 11 split is a correction.** The step list read "9 construct the input router and register every handler · 10 construct the execution pipeline", and both halves are correct read alone. Together they require the prompt's submit handler — registered at 9 — to close over a pipeline that does not exist until 10, while the pipeline closes over the router for `resetFocus`. A construction cycle, invisible to a reader checking either statement on its own, and it would have surfaced during the build as a `undefined is not a function` on the first Enter.

Registration is therefore its own step. I3 is unharmed: it says sealed *before input is accepted*, which is startup step 8, not before the router exists.

**The incidental pair is written out on purpose.** One row, saying that 1 → 2 carries no weight, is what stops the list being tidied into "the three that matter" — after which the next reader has no way to tell a pair nobody checked from a pair that was checked and found free. The same move as recording a pending enforcement rule rather than deleting it.

**Four registries are built and three of them seal.** C19's is the exception, and it is not an oversight in C19: `register` returns a `Disposable`, because a dynamic completion source is meant to come and go within a session (C19 §2). There is nothing to seal, and adding a seal would contradict the interface.

The step list said "seal all four registries" against a line naming three components, `C05, C07, C09` — the two halves of one entry disagreeing, with the count in the half a reader skims. What made it visible was writing the code: `completion.seal()` does not compile.

**What step 10 hands over, and the correction it took.** C23 receives each
collaborator as its owning component's own interface — the transcript store, the
scheduler, the transport router, the adapter and block registries, the manifest,
the editor, the overlays, the theme, the history store, the runner and the
lifecycle — plus `resetFocus`, `stop`, the clock and the opener. It does **not**
receive `Graph`. That type is C22's, and handing it over would give the pipeline
every store including the ones it must not touch; the narrowness lives in each
component's interface, which is where it already is, rather than in thirteen new
consumer-named wrappers that would then have to be kept in step with their owners.

`Consumed by` above used to read "receives the constructed graph", and the
imprecision is what would have licensed the wider reading the first time C23
needed one more collaborator.

**Session state is the part that was wrong rather than merely vague.** The seam
handed over `session: SessionSnapshot`, evaluated once at step 10 — and §5's store
deliberately freezes a *fresh* object per write, so the value the pipeline held
could never change. C23 I12 says a submission is refused once `stopping` is set,
and against a snapshot captured before `stop()` can ever have run, `stopping` is
false forever: the invariant was unobservable, and its test T3.15 could not have
been written. Nothing supplied `ExecutionWrites` either, though §5 names those
four fields as C23's.

So step 10 hands over `session: () => SessionSnapshot` and `writes: ExecutionWrites`
— a live read and exactly §5's four rows, which keeps one-writer-per-field
structural rather than documented. Passing the whole `SessionStore` would have put
`beginStopping` and the identity loop's `refresh` within the pipeline's reach,
which is the two-writer problem §5 exists to prevent.

**And there was no wiring for a real C23 at all** (I22). `resolveConfig` passed
`pipeline` through undefaulted, so `constructGraph` returned `pipeline: null` in
production: the injected factory is a test seam that was never given a default.
That is worse than a narrow seam, and it is why this is recorded as a correction
to what C22 already committed to supply rather than as a widening.
`resolveConfig` now defaults it to `createExecutionPipeline`, `config.pipeline`
stays the injection point, and `Graph.pipeline` is a `Pipeline` rather than a
`Pipeline | null` — the `?.` at the submit handler was the shape that made the
missing wire look intentional.

**The default is what found the next one, and that is the argument for it.** A
`Manifest` reaches `createTui` as an object, and `parseManifest` is the only
thing that appends `tui-kit`'s six verbs (C05 §3) — so a hand-built manifest
satisfying the type arrives without them, while C23 registers their handlers
regardless. `/help` and `/clear` are then installed and unclassifiable, which is
exactly what C23 I27's reconciliation reports. **It could not report it while
`pipeline` was `null`**, because the two records were never compared: the seam
with no default was also hiding the defect that the seam's own consumer exists to
catch.

Construction refuses that manifest by name (I23) rather than appending the six
here. Appending would put a second producer beside `parseManifest` and make
`appTools` wrong, and C05 §3's whole argument is that a `parseManifest` returning
something not yet a manifest is the seam-shaped defect — *valid at one call site
and incomplete at another*. This is that defect arriving through the object
literal rather than through the function.

**And C23's registry is the fourth seal, at step 10.** C23 §2's `LocalRegistry` takes the local handlers — `tui-kit`'s own plus the app's — and it cannot seal at step 4 because the app's handlers arrive with the pipeline. So I3's "every registry" means the three at step 4 and C23's at step 10, and commitment 4 counts the seals rather than the registries, which is the number the invariant is actually about.


### 3c. The sequences C22 owns

A02 Seam 4's rows whose owner is C22, in one place. **The Effect names are Seam
4's exactly**, because SP4 compares the two tables by that key and "Scroll" here
against "Scrolling" there is drift no cheap check sees through.

| Effect | Sequence | Where |
|---|---|---|
| Scroll | `viewport.pageUp()` etc → `scheduler.commit("input")` — C14 moves, C22 commits (C14 I12) | §3 step 11 |
| Resize | C01's `onResize` snapshot → `viewport.resize()` → `scheduler.commit("resize")`; C14 captures its anchor before dropping the cache (C14 I8) | §3 step 8a |
| Resume from `SIGCONT` | C01's `onResume` → `scheduler.invalidate()` — the same call an orchestrated `resume()` makes, because C01 sets no contamination flag (C01 §Signals) | §3 step 8a |
| Terminal too small | size gate → the layout-engine-free fallback → `onResize` → resume the normal frame, state intact | §4, §8b |
| Shutdown | `session.stopping = true` → `lifecycle.release()` (which runs `beforeRelease`) → diagnostics → exit | §8, §8a |

**This section did not exist until SP4 was written, and its absence is the finding
underneath the six Seam 4 defects.** C23 has a §4 listing what it orchestrates;
C22 had nothing equivalent, so five of Seam 4's twelve rows had no counterpart to
be compared against — half a table checked against half a convention. The `Where`
column is what makes that honest rather than a fourth copy: the sequences are
specified in §3, §4 and §8 as they always were, and this table indexes them.

**The identity notice is C23's, on a signal from here, and it is not in the table
above for that reason.** §7's transitions say a notice reaches the transcript, and
C23 §1 says C23 is the only component that appends. Both are correct where they
stand, so it was a ruling rather than a defect: **C22 signals, C23 appends** —
the identity loop produces a *fact* and not an entry, which is every other Seam 4
row's shape. Letting the loop reach the transcript would have made C22 an appender
and undone the single-appender rule for one notice.

Landing it closed a hole worth more than the row. C23 §3b had two mechanisms and
both *patch*; `meta.origin` is a field on an appended document, so `origin:
"refresh"` had no producer and read as reserved while being unreachable. The
identity notice is the third mechanism and the only one that appends, which is the
cell that value was reserved for.

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

**Step 8 is `lifecycle.acquire()` plus construction step 12, and nothing else.** C01 attaches the stdin listener as part of acquiring (C01 I18), so there is no separate "start listening" call to forget or to make twice; the shell's part is the decoder, the dispatch and the wake-ups.

**The suspension sequence, in order** (A02 Seam 4, C01 I18, C16 I18):

```
suspend:   lifecycle.suspend()      → the listener is dropped, before handoff
           runner.handoff(...)         the child owns the terminal
resume:    lifecycle.resume()       → the listener is re-attached
           decoder.reset()             whatever it half-decoded belongs to the child
           scheduler.invalidate()
```

**`decoder.reset()` is on the resume path and cannot be anywhere else.** C01 knows the terminal came back and holds no decoder; C16 holds the state and cannot see the gap, because a gap in bytes is what a slow link looks like (C16 I18). Only this file knows both. Without it, the first keystroke after a `vim` session completes a sequence begun before it started.

The ordering is asserted rather than the outcome (C01 T4.4b). "The child received its keystrokes" passes wherever the parent's listener happens to lose the race and fails intermittently elsewhere — the same shape as `killAll` before release, where only the order is checkable.

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

The header and footer are **app-supplied functions from a chrome context to blocks** (hook 5, F5). `tui-kit` owns the frame's structure — one row each, fixed position, never scrolling — and the app decides what goes in them.

```typescript
type ChromeFn = (ctx: ChromeContext) => readonly Block[];

type ChromeContext = Readonly<{
  session: SessionSnapshot;
  now:     number;      // C22's injected clock, sampled once per frame
  columns: number;      // handed down from C01, never read
}>;
```

**It took a snapshot alone, and could not render what it is specified to render.** Two more of the same class as §3a's and §8a's, both structural, and both found by writing the default:

- **The clock.** S01 §4 sources the header's clock from "Injected clock", the snapshot carries no time, and A03 SS1 forbids reading one. A `now` field on the snapshot would be the wrong repair — it ticks per frame while every other field changes on an event, so I11's one-writer-per-field would be satisfied by a writer that fires sixty times a second. Time is a property of the frame, not of the session.
- **The width.** S01 §4's whole elision table is width-driven — version drops below 90, identity at 100 then 70, clock at 80 — and a function given only the session cannot know any of it. C22 hands `columns` down, as everything above L0 is handed it (C01 I13).

`now` is sampled **once per frame** and the same value goes to header and footer, for C01 I12's reason one layer up: a header and a footer that read the clock separately can straddle a second boundary and disagree.

The default chrome renders name, binary and clock. Prism's renders cluster, identity, health and clock (`t01` §The header).

The prompt is `❯ ` and its gutter is `{ first: 2, cont: 2 }`, passed to C17's `displayRows` (D24a, C17 §2). C22 owns that number because C22 owns the frame; C17 must not assume one.

---

## 7. Health and identity

Identity is fetched at startup and refreshed on a five-minute cadence against the injected clock. **That loop covers identity only** — any live part in the banner or elsewhere is driven by C23 §3b, so there is one refresh mechanism rather than two (C24 §5). Two transitions commit a notice to the transcript rather than only changing the header:

**Token under one day** — `Token expires in 14h — run /login to refresh`. **C22 signals and C23 appends it** (C23 §3b), with `origin: "refresh"`; the loop produces the fact and never reaches the transcript.

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

### 8a. The shutdown trace

Five callers × six points construction can have reached. **This is the event-mediated half** — every cell is two rules meeting because something happened in between — and it found the two things below that §3a's table structurally cannot see.

**Two of the five callers never run `stop()`, and the function all five share is `beforeRelease`.**

`signal` and `fault` are entirely C01's: `signalExit` and `fault` call `releaseInternal` — which runs `beforeRelease` once, guarded by C01's own `beforeReleaseRan` — write diagnostics, and `process.exit` with 128 + signal or 1. C01 exposes no signal hook; `onFatal` is for a failed acquire and returns `never`. So on those two paths §8's step 1 does not happen, step 3 is C01's write to stderr and step 4 is C01's exit code.

An earlier I4 said *shutdown is one function with five callers* and T2.1 asserted it **by identity**, which cannot pass: three callers share `stop` and five share `beforeRelease`. Both readings of "one function" are defensible in isolation, which is exactly why the sentence survived — and the test written against the wrong one would have been the first thing to fail during the build, after the seam was already shaped around it.

**`session.stopping` is therefore never set on the signal and fault paths, and that is safe for one reason only:** `process.exit` runs synchronously inside the handler, so no submission can interleave between the release and the exit. It is written down because the obvious improvement — making a signal path do anything asynchronous — removes the reason without touching the flag.

| Caller | ↓ reached | nothing | after 5–6 | after 7 | after acquire | first paint | running |
|---|---|---|---|---|---|---|---|
| `/exit` (C23) | | n/a — needs a prompt | n/a | n/a | n/a | n/a | four steps |
| Ctrl-D confirm (C16) | | n/a | n/a | n/a | n/a | n/a | four steps |
| double Ctrl-C (C16) | | n/a | n/a | n/a | n/a | n/a | four steps |
| signal (C01) | | no handlers yet — the process dies with the default disposition, terminal untouched | same | `beforeRelease`, no bytes released, exit 128+n | full release, exit 128+n | same | same |
| fault (C22 → `stop`, or C01) | | `stop` from `created`: nothing acquired, no lifecycle, no cleanup (T1.9) | **the named cell** — see below | `beforeRelease` runs, release emits nothing, stack to stderr | full release, then the stack | `beforeRelease` runs, terminal restored, stack on the primary screen (T3.16) | four steps |

**The named cell — a fault after the stores, before the lifecycle.** Nothing is acquired and no cleanup is needed, and **the code knows it without a flag** because there is no lifecycle to release: the variable is undefined precisely because construction has not reached step 7. The absence is structural, not recorded.

This is also where I7 has to be read carefully. Cleanup lives only inside `beforeRelease` (I5), `beforeRelease` only runs through the lifecycle, so a fault before step 7 flushes nothing — and I7 says history flushes on *every* path. Both hold, and the reason is an ordering fact rather than an exception: **nothing can be appended to history before input is accepted**, which is startup step 8, four steps after the lifecycle exists. A flush before step 7 would have nothing to write. If anything ever appends earlier — a startup notice, a restored session — that is the day I7 and I5 genuinely conflict, and this paragraph is what makes it visible then rather than a silent empty file.

**Three further cells, each resolved by something that already exists:**

- **`stop()` twice, from two callers.** C01's `beforeReleaseRan` guard makes cleanup once-only and `releaseInternal` returns early when released, so C22's own idempotency (T1.10) covers the four steps and C01 covers the cleanup. Two guards, two different things, neither duplicating the other.
- **`stop()` while a handoff is in flight.** `beforeRelease` reaches `runner.live`, and a handed-off child is deliberately not in it (T3.4). C21's own comment is the authority.
- **`SIGWINCH` after release.** C01's `onWinch` returns unless the state is `acquired`, so a resize racing shutdown is inert. **C22 adds no guard of its own** — a second one would be two owners for one condition, which is the thing A02 §4 exists to prevent.

### 8b. The size gate, at rest

A third table, small, and structural rather than event-mediated: the gate's state is not reached by a sequence but held.

| Gate | Acquired | Where the fallback is drawn | Sink |
|---|---|---|---|
| passes at launch | yes | nowhere | — |
| fails at launch | **no** | the primary screen | raw `stdout`, before step 5 |
| fails mid-session | yes | inside the alternate screen | the scheduler, through `lifecycle.writer` |
| fails, then `stop()` | no | left where it is on the primary screen | — |

**The fallback has two sinks and §4 describes one.** "Layout-engine-free" is one rule and "the gate defers rather than aborts" is another; the cell where they meet is that a too-small terminal at launch never enters the alternate screen at all, so the fallback goes to the real screen — while the same fallback mid-session must go through the scheduler or it will be overwritten by the next frame. One renderer, two callers, and the renderer must take its writer rather than reach for one.

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
- **I3** — Every registry that has a seal is sealed before input is accepted: C05's, C07's and C09's at step 4, and C23's local registry at step 10, because the app's handlers arrive with the pipeline. C19's completion sources are the fourth registry built and the one with no seal — `register` returns a `Disposable` by design (C19 §2), so a dynamic source may come and go within a session.
- **I3b** — The framework's completion sources are registered at construction, ahead of the app's, and `FileSystem.readDir` is what two of them take. §2's "manifest-derived completion" was a default nothing built: `Tab` produced no candidates in any real session while every C19 tier passed (§2b).
- **I3a** — The app's local handlers arrive through `TuiConfig.localHandlers` and are registered at step 10 before `seal()`. I3 says the app's handlers arrive with the pipeline, and until §2a there was no route for them: a manifest declaring a local verb could not start, because C23 I27 correctly refused a registry the config had no way to fill.
- **I4** — **`beforeRelease` is the function all five callers share**, and it is what makes cleanup once-only. `/exit`, Ctrl-D confirm and double Ctrl-C additionally run `stop`'s four steps in order, idempotently; `signal` and `fault` are C01's, which releases, writes diagnostics and exits with 128 + signal or 1 — C01 exposes no signal hook, so `stop` cannot run there. An earlier wording said *one function, five callers* without saying which function, and the two readings are both defensible, which is how it survived.
- **I4a** — `session.stopping` is not set on the signal and fault paths, and nothing may make either of them asynchronous. `process.exit` inside the handler is what stops a submission interleaving; the flag is unnecessary only for as long as that is true.
- **I5** — Cleanup runs inside `beforeRelease` and nowhere else; it can therefore never run twice.
- **I6** — Release precedes diagnostics on every path.
- **I7** — History flushes on every path, faults included. A fault before the lifecycle exists flushes nothing and does not violate this: nothing can be appended before input is accepted, which is four steps later. The day anything appends earlier, I7 and I5 conflict for real (§8a).
- **I7a** — `createTui` runs step 1 — validation — and returns; steps 2 to 12 run inside `start()`. §9's `created` state, T1.9's "nothing acquired" and a manifest given as a path all require it, and validation is the one step that can be eager because it needs nothing constructed.
- **I8** — A failed size gate does not abort construction; session state survives until a resize.
- **I9** — The too-small render uses no layout engine, and it takes its writer rather than reaching for one: at launch it draws to the primary screen because the terminal is never acquired, and mid-session it draws through the scheduler or the next frame overwrites it (§8b).
- **I10** — Clock and filesystem enter the graph only here.
- **I11** — Session state has exactly one writer per field, and the two fields with no writer say so. `cluster` and `version` are set at construction and never written after; a field absent from §5's table would read identically to a field nobody writes, and only one of those is a claim.
- **I12** — `cwd` reaches C21 as a function, never a captured value.
- **I13** — Chrome is app-supplied; `tui-kit` owns only the frame's structure. It receives the session, the frame's `now` and `columns` — a snapshot alone cannot render the clock S01 §4 specifies or apply its width elisions, and neither belongs on the snapshot: one ticks per frame and the other is C01's to hand down.
- **I13a** — `now` is sampled once per frame and both chrome functions receive the same value. Two independent reads can straddle a second boundary and print a header and a footer that disagree — C01 I12's rule, one layer up.
- **I14** — C22 never auto-logins.
- **I15** — An offline cluster degrades the session; system commands keep working.
- **I16** — `stopped` is terminal.
- **I17** — `createTui` requires exactly four fields; every other has a working default. The count is the ergonomic claim R01 §1 tests — a working TUI built from the README without asking a question — and a fifth required field is a spec change rather than a convenience.
- **I18** — Banner and identity fetches are non-blocking: input is accepted before either completes, and neither can delay the first frame. A shell that will not take a keystroke until a network call returns is a shell that hangs on a bad DNS entry.
- **I19** — Identity refresh runs on C22's injected clock at a five-minute interval, and expiry never discards the command that hit it. The command is retained across re-login and resubmitted by the user, not automatically — a session that silently re-ran a verb after an auth gap would re-run it against whatever the credentials now authorise.
- **I20** — `tui-kit` reads no environment, variable or record. `PRISM_TUI_STATE_DIR` arrives as `TuiConfig.stateDir`, `PRISM_TUI_TRANSPORT` as `TuiConfig.transport` (C06 I18), and the process environment itself as `TuiConfig.env`, which C22 hands to C02 and C21. A03 SS10's allow-list names one file and that file does not use it — no module under `src/` touches `process.env`.
- **I21** — `beforeRelease` is synchronous and returns `undefined`, never a thenable. `killAll()`'s promise is deliberately not awaited: its signals are delivered synchronously and only the reaping is deferred, and awaiting it would make the handler `async`, which C01 I5 forbids because a signal handler cannot await.
- **I22** — `pipeline` has a working default, as every other optional field does (I17). `config.pipeline` remains the injection point C22's own tests construct a graph through, and a graph always carries a `Pipeline` — an injection seam with no default is a missing wire that only the tests hold together.
- **I23** — A `Manifest` reaching construction carries `tui-kit`'s own six verbs, or construction fails naming them. `parseManifest` is the only thing that appends them (C05 §3); an object satisfying the type is one nobody parsed, and C23 would register handlers for verbs nothing can classify to.
- **I24** — Raw bytes reach the decoder through `lifecycle.onInput` and through nothing else, and the decoder's deadlines are polled on C22's injected schedule. C22 is the only file that may read stdin, for the reason it is the only one that may read the clock: two readers of one stream is two half-decoded sequences, and the second reader is invisible to the first. The wake-ups are here because C16 owns no timer and C01 owns no clock, so a decoder without them delivers a lone `Esc` on the next keystroke rather than after its window (§3 step 12).
- **I25** — A suspension is bracketed by `suspend()` before the handoff and `resume()` then `decoder.reset()` after it. The listener's removal is C01's, in the transition; the reset is C22's, because only this file knows both that the terminal came back and that a decoder is holding a sequence the child interrupted (C01 I18, C16 I18).
- **I26** — Step 11 registers a handler for every focus target that has bindings, and the effect table in `keys.ts` is total over C16's `KeyAction` union. A binding `/help` renders is therefore one dispatch executes, by construction rather than by agreement (C16 I19).
- **I27** — Exactly one `commit("input")` per decoded batch, issued by the read loop; no handler commits. Two committers is one frame too many for a scroll and none for whichever handler forgets, and only the second is invisible (C16 I11).

---

## 11. Commitments

1. Four required config fields; every other has a working default, `pipeline` included (I17, I22).
2. Clock, filesystem, opener and state directory are injected here and nowhere else; `stateDir` defaults to `~/.prism` and the **app's entry point** resolves `PRISM_TUI_STATE_DIR` (I10, I20).
3. Stores and the runner precede the lifecycle, which precedes any acquire (I1, I2). §3a walks every pair, including the ones that carry no weight.
3a. Handler registration is its own step, after the pipeline: the submit handler closes over the pipeline and the pipeline closes over the router (I3, A02 Seam 4).
3b. `createTui` validates and returns; steps 2 to 12 run inside `start()` (I7a).
3d. The framework's six completion sources are registered at construction, before the app's, and read directories through the injected filesystem (I3b).
3c. The app's local handlers arrive as config and are registered before `seal()`, so I27's reconciliation sees them. Without the route the framework refused a configuration it offered no way to complete (I3a).
4. Four registries seal before input is accepted — C05's, C07's and C09's at construction, and C23's with the pipeline. C19's is the one with no seal, by its own design (I3).
5. Gates are TTY, config, then size; the size gate defers rather than aborts, and a manifest-declared one-shot verb bypasses the TTY gate (I8).
6. The too-small render is layout-engine-free (I9).
7. Banner fetches are non-blocking and input is accepted before they finish (I18).
8. Session state is nine fields — seven with one writer each, and `cluster` and `version` set at construction with none. Nothing else lives here (I11).
9. `cwd` is exposed as a function so `cd` moves subsequent verbs (I12).
10. Chrome is app-supplied and takes session, `now` and `columns`; the prompt gutter is C22's to pass, not C17's to assume (I13, I13a).
11. Identity refreshes every five minutes; expiry warns and offers inline re-login with the failed command retained (I19).
12. Cleanup is `beforeRelease` and all five callers reach it; the three explicit callers additionally run `stop`'s four ordered steps, and the signal and fault paths are C01's, which cannot be given more (I4, I4a, I5).
12a. `beforeRelease` is synchronous and returns no thenable; `killAll()`'s promise is not awaited and `drain()` is used rather than `flush()` (I21, C01 I5, C20 I18).
13. Release precedes diagnostics; history flushes on every path (I6, I7).
14. An offline cluster degrades rather than ends the session (I15).
14a. Step 12 wires the read loop: bytes reach the decoder through `lifecycle.onInput` and nowhere else, and its deadlines are polled on the injected schedule. Startup step 8 had a name and no mechanism until this step existed (I24).
14b. A suspension is `suspend()` → handoff → `resume()` → `decoder.reset()`, and the ordering is asserted rather than the outcome (I25, C01 I18, C16 I18).
14c. Step 11 registers a handler per bound target and an effect table total over C16's action union, in `keys.ts` — which is not C23's `actions.ts`, and each says so (I26).
14d. One `commit("input")` per decoded batch, issued by the loop; no handler commits (I27).
15. `stopped` is terminal (I16).

---

## 12. Tests

Six tiers. Every cell of the §9 table is covered. Tiers 1–4 use fake clock, fake filesystem and a fake terminal stream throughout.

### Tier 1 — unit

- **T1.1**: `start` with valid config → running; every component constructed once.
- **T1.2** (I1): construction order is asserted on an event log — stores and runner before lifecycle.
- **T1.3** (I2): the lifecycle's handler registration precedes the first acquire.
- **T1.4** (I3): all four seals are closed before the input router accepts anything — C05's, C07's and C09's, and C23's local registry, which is the one a test counting only the construction-time ones would miss. C19's engine has no `seal`, and the test asserts that too: a count is the wrong assertion when one member of the set does not belong to it.
- **T1.4b** (I3, commitment 3a): the submit handler is registered after the pipeline exists, and the pipeline holds the router. Asserted on the event log: no handler registration precedes step 10. The construction cycle §3a found fails here rather than at the first Enter.
- **T1.4d** (I22): a config omitting `pipeline` still yields a graph carrying a sealed `Pipeline`, and an injected factory is still used. Both halves, because a default that ignored `config.pipeline` would satisfy the first and remove the seam.
- **T1.4k** (I3b): a constructed graph's completion engine answers a bare prefix with the manifest's verbs, and a path prefix with what the injected `readDir` returns. Both, because a registration that wired only the manifest source satisfies the first — and the two filesystem sources are the ones with a dependency to forget.
- **T1.4j** (I3a): a manifest declaring a local verb constructs when `localHandlers` supplies it, and fails naming the verb when it does not. Both halves: the failure alone is what shipped, and it read as the check working rather than as a route that did not exist.
- **T1.4e** (I23): a hand-built `Manifest` fails construction naming all six missing verbs; the parsed one is accepted. The second half is the control — without it the check is indistinguishable from refusing every manifest.
- **T1.4f** (I24, commitment 14a): a byte written to the fake stdin after `start()` reaches the router as the decoded event, and the same byte written before `acquire()` reaches nothing. The test is the whole path — stream to `onInput` to `push` to `dispatch` — because each half of it existed and passed its own tests while the two were never joined.
- **T1.4h** (I26): every `defaultKeymap` binding, pressed through a real decoder into a constructed graph, produces its documented effect — fourteen cases, driven from the table rather than listed. A hand-written list is the shape that let fourteen bindings go unexecuted while every test passed.
- **T1.4i** (I27): a paste of two hundred lines → exactly one `commit("input")`; a scroll key → exactly one, issued by the loop and not by the handler. Both halves, because a handler that also commits passes the first.
- **T1.4g** (I24): a lone `Esc` with no following byte → the key is dispatched when its window elapses on the injected schedule, not when the next key arrives. A decoder wired without wake-ups passes T1.4f and delivers `Esc` on the next keystroke, which is a key that appears to do nothing until you press another one.
- **T1.5**: `createTui` with only the four required fields → every default applied and functional.
- **T1.6** (I10): a fake clock and filesystem reach every component that takes one — asserted per component.
- **T1.7** (I5): on every exit path, `killAll` and `drain` each run **exactly once** — the double-flush regression, tested directly.
- **T1.8**: `stop("exit")` from running → §8's **four** steps in order, exit code 0. An earlier draft of this line said five, against a §8 and an I4 that both say four; the count is asserted against the list rather than restated, so the two cannot drift again.
- **T1.9**: `stop` from created → stopped without acquiring anything.
- **T1.10** (I4): `stop` twice → the second is a no-op; no double release, no double flush.
- **T1.11** (I11): each session field is written only by its documented writer — a spy per field, all nine. `cluster` and `version` are asserted as **never written after construction**, which is the half a table with seven rows could not state.

### Tier 2 — contract / interface

- **T2.1** (I4, I5): **every exit path runs the same cleanup, exactly once** — `killAll` and `drain` each observed once, per path, whatever function got there. The property rather than the mechanism, because the mechanism differs: three callers reach `stop` and two are C01's, so no single function is shared by all five and an identity assertion has nothing to be about. The original line asserted `stop` by identity across all five and could not have passed, C01 exposing no signal hook (§8a). Identity is still asserted where it holds — the three explicit callers share one `stop` — but it is the weaker claim, and writing the property first is what stops the seam being reshaped to fit an assertion.
- **T2.1b** (I4a): the signal and fault handlers are synchronous end to end — no `await` between the release and the exit, asserted on the source rather than by timing, because the failure is a submission interleaving and a test cannot make one land in the gap reliably.
- **T2.2** (I6): on all five paths, the last release byte precedes the first diagnostic byte.
- **T2.3** (I7): history is flushed on all five paths, including a thrown exception.
- **T2.4** (I10): a source scan finds no ambient clock or `fs` reference anywhere in `tui-kit` outside C22.
- **T2.5**: every hook in A02 §6 has a default except `theme`, and each default is exercised.
- **T2.6** (I12, TL6): `SpawnOptions.cwd` is a function; a `@ts-expect-error` rejects a string, and the function form is exercised beside it so the rule is not "nothing compiles". A captured string is correct at capture and wrong for every verb after the first `cd` — and the failure is silent, because the verb runs, just somewhere else.
- **T2.6b** (→ C01 I14): the lifecycle cannot be constructed without `onFatal` (TL7). A failed alternate screen is the only fatal case in the system, so it is the one failure that cannot have undefined handling; optional in the type, every consumer omits it and finds out when nothing can be rendered.
- **T2.7** (I7a): config validation rejects each missing required field with a named error, from `createTui` itself and before `start()` is ever called — so a bad config fails at the call site and nothing is constructed.
- **T2.8** (I21, C01 I5): `beforeRelease()` returns `undefined` — not a thenable, checked as `typeof result?.then !== "function"` rather than by awaiting, since awaiting a non-thenable passes. This is the mechanism behind the floating `killAll()`: nothing in this tree flags a floating promise and nothing flags the `await` that would "fix" it, and the resulting `async` handler fails only when a signal arrives during shutdown.
- **T2.9** (I20, SS44): the source scan finds no `PRISM_TUI_*` anywhere in `src/` — **the rule imported from the enforcement tool, not restated** (C01 T2.10's shape). SS44 matches the prefix rather than the variable, because a rule per variable is a list that grows one incident at a time and the third would be written after it shipped.
- **T2.9b** (I20): SS10's allow-list has one entry and C02 does not spend it, so the honest count of environment readers under `src/` is zero. Asserted rather than folded into SS10 by narrowing its scope: an allow-list denies by default, and a file added to `terminal/` later should argue its way on rather than inherit an allowance nobody re-examined.

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
- **T3.15** (I7, §8a): a fault during construction, after stores but before the lifecycle → nothing acquired, no cleanup attempted, error surfaced. The assertion is that the code reaches this **without a flag** — a spy shows no `beforeRelease` was constructed to call, rather than a boolean saying not to.
- **T3.15b** (I9, §8b): a failed size gate at launch draws the fallback to the **primary screen** and no alternate-screen sequence is emitted; the same fallback mid-session draws through the scheduler. One renderer, two writers, asserted on both.
- **T3.16**: a fault during the first paint → `beforeRelease` runs, terminal restored, stack on the primary screen.
- **T3.17**: `SIGKILL` — documented as unrecoverable; the test asserts the documentation exists rather than the behaviour.
- **T3.18**: a `beforeRelease` that throws → logged, release still completes (C01 I5 from this side).

### Tier 4 — integration

- **T4.1** (with C01, C21): the `suspend` → `handoff` → `resume` → `invalidate` sequence runs in order; C01's raw-mode guard never fires.
- **T4.1b** (I25, with C01, C16): the same sequence with the input path in it — the listener is dropped before `handoff` is called, `decoder.reset()` runs after `resume()`, and a partial escape sequence written before the suspension does not combine with the first byte written after it. One event log, asserted as an order; the last clause is what a test of the ordering alone would leave open, since a reset placed correctly and doing nothing keeps the order intact.
- **T4.2** (with C10, C03): a theme switch triggers exactly one `invalidate`, issued by C22 and not by C10.
- **T4.3** (with C14, C03): a scroll issues exactly one `commit("input")`, issued by C22 and not by C14.
- **T4.4** (with C15, C13): popping a view appends nothing — C15 writes nothing and C22 composes nothing. A trace here would freeze the block the pop returns to and clear the selection A01 D7 preserves.
- **T4.5** (with C20, C17): a history recall calls `setText`; C20 never touches the editor.
- **T4.6** (with C18, C21): a `cd` built-in updates session `cwd`, and the next spawn lands there.
- **T4.7** (with C19, C17): ghost text is composited into the prompt without entering the buffer.
- **T4.8** (with C16, C06): Ctrl-C during a pass-through forwards `SIGINT`; during a verb it cancels.
- **T4.9** (with C17): the gutter C22 passes matches the prompt it renders, so `displayRows` equals the rendered height.
- **T4.11** (I13a): header and footer receive the same `now` within one frame, asserted with a clock that advances on every read — a fake returning a fresh value per call, so two reads cannot agree by accident. A monotonic fake would pass whether the value were sampled once or twice, which is the setup where both readings agree (A03 §2).
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
- **T6.15** (I20): resolving `PRISM_TUI_STATE_DIR` inside `src/` → T2.9 fails on SS44, which is fabricated against both the C06 form and the C22 one — the second copied from the draft that actually shipped it.
- **T6.16** (I11): dropping `cluster` or `version` from §5's table → T1.11 loses a field silently, because a field with no row and a field with no writer are the same absence to a reader. The count in commitment 8 is what fails.
- **T6.17** (I21, C20 I18): calling `flush()` rather than `drain()` in `beforeRelease` → T1.7 and T2.3 fail, and the command the user has just typed is the one entry lost, because Node does not wait for a pending promise at exit.
- **T6.18** (I3, commitment 3a): registering the submit handler at step 9, beside the others → T1.4b fails. **Structural guard as well** (A02 17a): the handler would close over a pipeline that is `undefined` at registration, so the shape that prevents it is the ordering itself, and T1.4b is what makes the ordering visible rather than a comment.
- **T6.19** (I4): asserting `stop` by identity across all five callers → T2.1 fails on the signal path, where C01 owns the release and offers no hook. The revert is the *original spec wording*, which is why the entry exists: the test written against it is unsatisfiable, and a green suite would have meant the seam was reshaped to fit an assertion rather than the other way round.
- **T6.20** (I4a): making the signal or fault path asynchronous — an `await` anywhere between release and exit → T2.1b fails. Nothing else objects, and `session.stopping` is not set on those paths, so a submission could interleave where today none can.
- **T6.21** (I9): giving the fallback renderer its own writer instead of taking one → T3.15b fails, and the launch-time fallback either writes into an alternate screen that was never entered or the mid-session one is overwritten by the next frame.
- **T6.22** (I7a): constructing steps 2–11 in `createTui` → T1.9 fails, because `stop` from `created` now has a lifecycle to release; and a manifest given as a path cannot be read at all, since a constructor cannot await.
- **T6.23** (I13a): reading the clock once per chrome function instead of once per frame → T4.11 fails. **Structural guard as well** (A02 17a): `ChromeContext` carries `now` as a value, so a second read has nothing to read from — the shape is what prevents it, and T4.11 is what stops the shape being widened back to a function.
- **T6.24** (I13): putting `now` on `SessionSnapshot` → T1.11 fails, because a field written on every frame has no writer §5's table can name.

---

## 12a. Unowned and unbuilt: theme persistence

**`/theme light` does not survive a restart, and no component's spec claims the job.**

C10 T4.5 and T4.6 have asserted it since C10, deferred on `L4` — waiting four layers on work that was never assigned. Nothing in the tree writes a theme choice to disk, and §2's config has no field for one. That is different from an unbuilt component: a deferral naming C23 was waiting for something scheduled, and these were waiting for something nobody had agreed to do.

**It is C22's, and it is small.** C22 already owns `stateDir`, already resolves config at construction, and already holds the theme store. Persisting one value is C20's shape — a store with a file behind it — with one field and no format question worth having.

**It is not C23's branch's work.** C23 is the last component and its branch already carries the largest expiry in the project; adding an unspecified feature to turn two deferrals green is scope creep with a green suite as its justification. The two rows now name **C22** and say the feature does not exist, which leaves them findable rather than silently waiting — the shape `PENDING_RULES` uses: named, assigned, and failing the day someone claims it is done.

Recorded here rather than in a note, because the last three things handed over as notes were never landed (`docs/notes/`, third instance).

---

## 13. Out of scope

| Not here | Where |
|---|---|
| Running a command | C23 |
| The narrative of execution | C23 — B02 was dropped and its content is C23's |
| Every component's own construction | The component |
| The auth flow itself | The far side; C22 displays and offers |
| Prism's chrome content | `prism-tui` |
| Multi-cluster sessions | Phase 2 |
