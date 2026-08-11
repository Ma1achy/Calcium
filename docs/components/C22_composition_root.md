# C22 — Composition root and session

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
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
  capabilities?: Partial<TerminalCapabilities> | undefined;   // C02's overrides, wired (I49)
  clock?:    () => number;
  fs?:       FileSystem;
  stateDir?: string;                       // default .calcium, beside the project; the app resolves its own (I20)
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

`stateDir` defaults to **`.calcium`** — the framework's own name, and a path relative to where the shell was launched.

**The name was one consumer's.** It read `~/.prism`, in a framework that claims to serve others, so every app that did not override it wrote its history and its theme preference into `prism-tui`'s directory and two apps shared one file. The argument against that was already in this section, twenty lines down: §141 refuses `PRISM_TUI_STATE_DIR` inside `src/` because *a variable named for one consumer has no business inside a framework that claims to serve others*. Correct, applied to the environment variable, and not applied to the constant three files away — F84's shape.

**And the tilde was never expanded, so the old default never meant what six documents said it meant.** `fs.mkdir` has no shell in it: `~` is an ordinary path segment, so `~/.prism` created a directory *literally named* `~` in whatever directory the shell was launched from. Measured, not inferred. The path was therefore already relative and the tilde was decoration on top of it; dropping it makes the documented behaviour and the actual behaviour the same statement rather than adding expansion machinery to reach a home directory nothing had ever written to.

**So state is per project, and that is the behaviour rather than a side effect.** History and the theme preference belong to the directory the shell was opened in, the way a repository's own dotfiles do. It also makes the injection argument structural instead of advisory: standalone development cannot append to the developer's real history, because there is no single real history to append to.

**The argument against it was already in this section**, twenty lines down: §141 refuses `PRISM_TUI_STATE_DIR` inside `src/` because *a variable named for one consumer has no business inside a framework that claims to serve others*. That reasoning is right, it was applied to the environment variable, and it was not applied to the constant three files away — **a correct sentence justifying the scope it was attached to and silent about the identical case beside it**, which is F84's shape (MG24 scoped to `export interface` for a true reason about a different question).

It is still injected, for the reason it always was: standalone development would otherwise append to the developer's real history and read their real config, which makes a clean-clone run neither clean nor repeatable. **The default is what an app gets when it says nothing, and that is exactly when it must not name somebody else.**

**`env` is the environment record, and the app supplies it** (I20). C02 takes one (`detectCapabilities(env, overrides)`) and C21 takes one (`ProcessRunnerDeps.env`, for `$SHELL`), and **no file under `src/` reads `process.env`** — not even C02, which is allow-listed for it and does not use the allowance. So the record enters through config, from the app's entry point, along with `stateDir` and `transport`.

It is optional and defaults to `{}`, which costs something worth naming: an app that omits it gets a capability record for a terminal that declares nothing, so the shell degrades to ASCII and no colour. That is the right default — it is the safe direction, and the alternative is a fifth required field, which I17 forbids for a reason R01 §1 tests. It is not the right *silence*, so C02's warnings surface on the restored primary screen (C02 §2) and an empty record is one of them.

**`capabilities` is C02's `overrides` argument, and it had no producer** (I49). C02 §2
takes `detectCapabilities(env, overrides)`; I4 makes a valid override win unconditionally,
including for `altScreen`; commitment 5 says config overrides win; T3.4, T3.5 and T1.9 test
them, and T5.5 asserts one reaching the wire. Every one of those was satisfied while
`construct.ts` called `detectCapabilities(config.env)` with one argument — so the parameter
was **reachable from a test fixture and from nothing an application can call.** The two
callers in the repository are that fixture and this line.

That is A03 §2's vacuity class arriving through a **parameter** rather than an export:
C24 I16 is written about exported declarations and MG25 scans free functions and constants,
so neither could see an argument that nothing supplies.

**The consumer that found it is S12, the degradation showcase**, and it found it at the one
depth that matters most. Four of the five depths are reachable by environment —
`COLORTERM=truecolor` gives 24, `xterm-256color` gives 8, `xterm` gives 4, `LANG=C` gives
ASCII. **1-bit is reachable by none of them**: the only rule producing `colourDepth: 1` is
the `dumb` gate, and that gate also clears `altScreen`, which C02 I7 makes the sole hard
refusal. So the depth the whole degradation claim rests on could not be produced by any
application, and the framework's own e2e row for it composes the frame by hand.

The field takes the same untrusted-input treatment C02 already gives it: an unknown key is
ignored, an out-of-range value is rejected with a warning, and the warnings surface where
C02's always do.

**`| undefined` on the annotation is load-bearing.** This tree compiles with
`exactOptionalPropertyTypes`, under which an optional property and a property that may be
undefined are different types — so an application computing the value conditionally could
not supply the field at all: neither `capabilities: maybe` nor a spread type-checks, and
only a cast gets past. Every other optional field on `TuiConfig` has the narrower shape and
none has yet been wanted conditionally, which is why fifteen fields carry a defect one of
them has. It is the consumer's problem exclusively: every internal caller passes a literal.

**`PRISM_TUI_STATE_DIR` is resolved by the app's entry point, not here** (I20). An earlier draft of this section had C22 read it, which contradicts A03 SS10 — the scan bans `process.env` across all of `src/` with a one-file allow-list, C02's, because an exception list is the thing that grows. C06 I18 settled the same question for `PRISM_TUI_TRANSPORT` and the reasoning transfers whole: a variable named for one consumer has no business inside a framework that claims to serve others, and Calcium ships no binary to read it from. `prism-tui` reads its own variable and passes the resolved path through `TuiConfig.stateDir`, exactly as it passes a constructed router through `TuiConfig.transport`.

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
| `overlay` | the six bound actions — `menuNext` ×2, `menuPrev`, `menuAccept`, `dismiss`, `searchOlder` — and, for a layer that is chrome for the prompt, everything else forwarded to the `prompt` handler (I51) |
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
thing that appends Calcium's six verbs (C05 §3) — so a hand-built manifest
satisfying the type arrives without them, while C23 registers their handlers
regardless. `/help` and `/clear` are then installed and unclassifiable, which is
exactly what C23 I27's reconciliation reports. **It could not report it while
`pipeline` was `null`**, because the two records were never compared: the seam
with no default was also hiding the defect that the seam's own consumer exists to
catch.

**Refusing it was right about the danger and wrong about the remedy, and the
first consumer is what showed the difference.** Construction refused such a
manifest by name (I23) rather than appending the six here, reasoning that
appending would put a second producer beside `parseManifest` and make `appTools`
wrong — and that reasoning still holds. What it missed is that **the refusal
left no accepted input at all.** `parseManifest` is exported from none of the
three entry points, so the advice in the refusal names a function the reader
cannot reach; and the `string` arm, which was supposed to be the working path,
passed `readFile`'s string straight into a function that requires a record, with
no `JSON.parse` between them. It had never run. `createTui` could not be called
from the public surface by either route, and every one of C22's own harnesses
reached through the package boundary for `parseManifest` to construct at all —
so nothing inside the package could see it. docker-tui found it on its first
start (R01; `examples/docker/FINDINGS.md` F7).

**Both arms now go through `parseManifest`, which is the resolution rather than
a compromise.** The single-producer argument is untouched: construction appends
nothing and derives nothing, it *parses*, and the one function that may add the
six is still the only one that does. What changes is that the object arm stops
demanding a value only that function can produce.

    const raw = typeof config.manifest === "string"
      ? JSON.parse(await config.fs.readFile(config.manifest))   // the missing step
      : config.manifest;
    const parsed = parseManifest(raw);

An author writes `{ schema, binary, version, tools }` — their own verbs, which is
all they know — and that document is a valid input to `parseManifest` already,
because the parser reads `raw["tools"]` as the app's tools and *derives*
`appTools` from them. **`TuiConfig.manifest` is therefore typed
`ManifestDocument | string`, not `Manifest | string`** (I23a): a `Manifest` is
the parser's *output*, and asking an author to supply one was asking for the
result before the call.

Handing back an already-parsed `Manifest` fails loudly instead of silently, and
for free: its `tools` carries the framework's six, I6 refuses duplicate names,
and the parse error says so. C05 §3 called that property "worth more than the
tidiness" about apps shadowing `clear`, and it covers this case with no rule
added.

**And a loud runtime failure was not enough, which took a broken merge to
establish.** `ManifestDocument` was `Omit<Manifest, "appTools">`, and a
`Manifest` has every member of that type and one more — so it is structurally
assignable, and `manifest: parsedManifest` compiles clean at every call site.
The field's type accepted precisely the value construction throws on.

That is not a hypothetical. `test/support/fixture.mjs` — tier 5's only session
harness — passed `parsed.value`, with a comment explaining why it had to.
**Forty-four of a hundred and one tier-5 rows failed and the branch merged**,
because three harnesses were converted with the fix and this fourth was
`.mjs` importing from `dist/`, invisible to the search that found the others,
in the one tier `npm test` excludes.

So the input type **structurally excludes** the output's extra member:

```ts
export type ManifestDocument = Omit<Manifest, "appTools"> & {
  readonly appTools?: never;
};
```

A hand-written document omits `appTools` and satisfies it unchanged; a parsed
`Manifest` does not, and says so at the call site rather than at `start()`.
**This is the temporal-dead-zone argument in a type** (§3a's `const pipeline`,
and the `Exclude`-to-empty rules elsewhere): where a wrong call can be made
unbuildable, a runtime refusal is a worse version of the same protection,
because it needs a test to have been run against it and the type does not.

The general form is worth stating because C24 will meet it again: **a derived
type whose relationship to its source is "one field fewer" is assignable from
its source, so `Omit` alone never expresses *this is the input, not the
output*.** Every input/output pair in the public surface wants checking against
that.

**I23's refusal is deleted rather than kept beside the parse.** With both arms
parsed it can no longer fire — a guard whose condition has become unreachable is
A03 §2's vacuity class, and one that reads as a second line of defence is worse
than none, because the next reader trusts it. C23 I27's reconciliation is the
real check and is unaffected.

**A malformed document is reported, not thrown.** `JSON.parse` on a file the
author wrote is a *user* error, and a raw `SyntaxError` escaping construction
names a position in a string nobody can see. It becomes a `ManifestError` with
the path, on the same channel as every other thing wrong with a manifest.

**And C23's registry is the fourth seal, at step 10.** C23 §2's `LocalRegistry` takes the local handlers — Calcium's own plus the app's — and it cannot seal at step 4 because the app's handlers arrive with the pipeline. So I3's "every registry" means the three at step 4 and C23's at step 10, and commitment 4 counts the seals rather than the registries, which is the number the invariant is actually about.


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

**Gate 1 refuses before construction, and that is not gate 4's rule** (I36). Gate 4 defers — the graph is built, the fallback is drawn, and a resize continues from step 5 with session state intact (I8) — because a terminal that is too small can become big enough while the session waits. **A pipe cannot become a terminal.** There is no event to wait for and nothing for a constructed graph to do, so the reasoning does not transfer, and §4's own ordering already puts gate 1 three steps ahead of construction. The distinction is asserted rather than left to the ordering, because "the gate runs first" and "nothing is constructed" are different claims and only the second is what matters: a gate that ran first and then built the graph anyway would open a history file and spawn an identity loop for a process that is about to exit.

**What "print help" means, and it is not `/help`** (I37). The only help in the tree is C23's local handler, which renders keybindings from the keymap (C23 I26) — `↑↓ rows`, `⏎ drill in`, `esc prompt`. That is the right answer for someone at a prompt and the wrong register entirely for `prism | cat`, where there is no prompt and no keyboard. The non-TTY help is **CLI usage**: the binary, what it is, and that it wants a terminal.

It must be **non-empty**, and that is the half worth stating. A gate that exits 0 having printed nothing is indistinguishable from a hang to the script that invoked it, and indistinguishable from a working gate to a test that only asserts the exit code.

> **`oneShot` has no subject, and T3.5b cannot be written.** `parse.ts` produces the field and `types.ts` documents it as *bypasses the TTY gate*; nothing outside the parser reads it, and the reason is one level down — **`createTui(config)` takes no argv.** §4 step 1 is "parse argv, check stdout is a TTY", and no argv parsing happens at startup at all, so the exception above has nothing to be an exception for. T3.5b is recorded as unwritable rather than written against a fabricated argv, because an assertion nobody can satisfy and an assertion nobody has written look identical once the suite is green — which §4's T3.5 note already records about a different row.
>
> **How it resolves**: `oneShot` reaches C22 through `config`, with the app parsing argv. That is what every other environment-derived value in this project does — C06 I18 settled exactly that pattern for `PRISM_TUI_TRANSPORT`, and §12a's theme persistence is the same shape. C22 growing an argv parser is the alternative and it is the wrong one: the framework would then own a CLI surface it has no other reason to have.


Gates 1, 2 and 4 are `t01`'s. **Gate 4 does not block construction** — the graph is built, the fallback is drawn, and a resize continues from step 5 with session state intact. The too-small render is C22's, deliberately layout-engine-free, because it must work in a terminal too small for the layout engine to produce a sane answer. The 60 × 16 threshold is C22's number and not C02's: C02 §8 assigns it to L4 explicitly, on the grounds that a minimum size is an app policy rather than a terminal capability. An earlier draft cited it as `C02 §Size`, a section C02 has never had — a dangling reference, and A03 §9a records what happens to those when a renumber gives them something to resolve against.

Step 7 is non-blocking, so the banner completes visibly over the first second rather than delaying the prompt. Input is accepted at 8, not after 7 — a dev can type while the banner is still filling in.

**Step 7 had a name and no mechanism, which is step 12's shape in the same list** (I44). §3a records that happening once already — *"accept input" was a step with a name and no mechanism, and a session built from this document decoded nothing while every component it needed was finished and tested* — and it happened twice. Nothing in `src/` fired anything at step 7; `TuiConfig` had no field to fire; T3.10 and T3.11 describe a banner fetch degrading and **were never written**, because there was nothing to write them against. S02 specifies the entry in detail and cites this step; a consumer that reached for it found three documents agreeing about a thing no code did.

**The seam is a document, not a banner renderer** — S02 §1 is explicit that the welcome is an ordinary `ViewDocument` appended like any command's output, so `/clear` removes it and it scrolls away. So `config.greeting` is `() => ViewDocument | Promise<ViewDocument>`, C22 fires it at step 7 and does not await it, and **C23 appends it**: A02 Seam 4's row again, the same shape as the identity loop, where C22 produces a fact and C23 is the only component that appends.

It goes through C23's ordinary append, which is what makes a live part in it driven (C23 I33a) and what makes the entry an entry rather than chrome. **A greeting that never resolves leaves the prompt usable and no entry appears; one that throws is contained and the session continues** — T3.10 and T3.11, writable at last.

**A live greeting ticks until the entry is evicted or the transcript is cleared, and not until the first command** (C23 I9, I33). An app that wants launch to be cheap omits `every` and gets a one-shot; that is the app's decision, not a lifecycle this must implement. The alternative — releasing a part when a newer entry freezes it — is the row C24 §5 deleted against I9, and re-introducing it here would kill a `--watch` the moment anyone typed.

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

### 4a. The frame is a named unit, and `session.ts` calls it (I54)

**Nothing in the tree composed a frame as a value.** The composition existed only inside a private method returning `void`:

```
guard on acquired → #composed() → viewport.resize(width, region.height)
  → paint(frame, deps)               ← FrameError falls back to drawFallback
  → cursorFor(frame, deps) → cursorSequence(null) → assemble → write
```

`lines` was a local. It was never returned, never yielded, never handed to anything.

**The class is one level up from the one every rule here can see.** Every prior instance of *a complete mechanism unreachable across a seam* is **a member nobody could call**; this is **a sequence nobody named**, and no rule that walks members reaches it — MG24 counts consumers of exported members, MG25 and MG27 compare declared shapes against builders, and all three are satisfied by a tree in which every member is consumed and the only thing missing is the order they go in. **A private method is the perfect hiding place**, because the composition *is* consumed — sixty times a second — by the one caller inside the class.

So it is `composeFrame`, and `session.ts` calls it. **Not a second implementation**: the value of a consumer reading a frame is that it is the frame the shell draws, and the render chain is about to gain output diffing, render caching, block windowing and a cap. A copy would diverge on the first of those and say nothing. A03's **SS48** carries it — a `paint(` call under `src/shell/` outside the unit that owns it — and the row landed with the extraction rather than ahead of it (commitment 14b): **one composition, one caller**.

**What the extraction does not decide.** Where the seam falls between *compose a frame* and *put it on a terminal* is a separate question and is not answered here. The write is C01's writer and the fallback is a side effect; the unit is the composition, and the boundary is where it was.

**Every comment survives the move**, and they are the most careful in the file: the size read once by `compose` so a resize between compose and paint is the next frame's problem, the fallback rather than a short frame, the viewport resized from the composed frame before its rows are read (I34), and the cursor sequence embedded in the single write so it cannot straddle C03's synchronised-update window.

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

The header and footer are **app-supplied functions from a chrome context to blocks** (hook 5, F5). Calcium owns the frame's structure — one row each, fixed position, never scrolling — and the app decides what goes in them.

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

The prompt is `❯ ` at `unicode: full` or `bmp`, `> ` at `ascii`, and its gutter is `{ first: 2, cont: 2 }`, passed to C17's `displayRows` (D24a, C17 §2). C22 owns that number because C22 owns the frame; C17 must not assume one.

**Both forms are two cells, and that is a requirement rather than a coincidence** (I52, C09 I22). `commandRows` draws the prompt and `construct.ts` calls the same function for `chromeRows` — the height C14 virtualises against — so a prompt whose ASCII form were a different width would make the measurer and the composer describe the same row differently, with `PROMPT_GUTTER.first` right for one of them. That is C09 I1's divergence in the one place both sides are the framework's own, and it is why the prompt takes a **pair** rather than a free-form config field: a `TuiConfig` prompt would be a string an app supplies, unmeasured, on the row the reader types into (F122).

---

## 6a. The drawer, walked by hand

The component has structure **and** state, so it takes both artefact shapes.
Taking the trace alone because the cursor is the obvious state machine is how the
structural half goes unexamined — and the structural half is where five of these
seven live.

### The classification table — which rule owns a cell

Indexed by rule interaction rather than by input: every row is a cell where two
correct statements overlap. A row governed by one rule restates it and finds
nothing.

| # | The cell | Rule A | Rule B | Ruling |
|---|---|---|---|---|
| 1 | Inside a layer's box, no glyph from its blocks | the base already painted it | the layer owns its box | **The layer**, blank. Every cell of the box is written, background included |
| 2 | Inside two layers' boxes | bottom-first order | the top layer wins | The later-pushed one |
| 3 | Inside the lower layer's box only, with a higher layer also placed | the lower owns it | the higher was drawn after | **The lower.** Each layer composites onto the accumulated rows, never onto the base again |
| 4 | Outside every box | the base owns it | — | The base, untouched — no reset, no bytes |
| 5 | A `fill` view's box, and also a header row | a view fills the region | header and footer are untouched | Unreachable once the region is the viewport's; the header is not in the region (§3a of S01) |
| 6 | Past the box's right edge, layer content still going | C15 clamped the width | C09 rendered at that width | Cut to the box. C09 emitting a wider row is a C09 defect and must not be absorbed here |
| 7 | Past the box's bottom edge, content still going | C15 reports `truncated` | C15 clips no content | Cut by the drawer — the split, both halves |
| 8 | A box of zero width or zero height | splice the window | there is no window | **No-op.** Not two slices and two resets, which puts SGR bytes into a frame with no cells to carry them |
| 9 | A box escaping the region | C15 clamps (I6) | the drawer honours the box | The drawer **refuses the frame** and the fallback is drawn. Not a clip: a clip repairs the symptom and hides a placement defect, and this is `heightsSum`'s shape — a claim about the frame rather than a restatement of the clamp |

**Row 3 is the one that would have shipped.** The natural loop builds each row as
`splice(baseRow, layer)` and stores it, which is correct for one layer and
discards the previous layer for two — a menu under a search would vanish
entirely, with the search drawn perfectly. Nothing about it looks wrong, no
invariant of C15's is violated, and the first time two layers overlap will be in
front of a user (§4 caution 2, C15). The remedy is one word: the rows accumulate.

### The sequence trace — which cursor the next frame draws

Event-mediated, because focus moves. Two rules meet in every row: *the focused
layer's cursor if it has one* and *the prompt's if focus is `prompt`*.

| # | Sequence | Frame draws |
|---|---|---|
| 1 | nothing open | the prompt's, from `editor.cursorCell` |
| 2 | menu pushed by `Tab` | hidden — a requested menu has the keys, and nothing is typed into one |
| 2a | menu opened by typing (C19 I20) | **the prompt's** — the menu takes no keys until `Tab` enters it, and the row is what the user is typing |
| 3 | menu dismissed | the prompt's again |
| 4 | search pushed over a menu | the search's — it is on top and text is being entered |
| 5 | search cancelled, menu still open | hidden again, by row 2 |
| 6 | a confirm over a search | hidden. The search below still holds text, and the confirm owns the keys |
| 7 | a layer dismissed by the same key batch that is about to commit | the post-batch stack's — one commit per batch (I27) makes this automatic, and only because the commit is at the batch rather than in the handler |
| 8 | the prompt is windowed (S01 §3) and the cursor is above the window | **hidden** |

**Row 8 is the second finding, and it is arithmetic rather than focus.**
`cursorCell.row` indexes the editor's full layout; the painted prompt shows only
`cap` of those rows. Drawing at `cursorCell.row` unmodified puts the terminal
cursor in the transcript whenever the prompt is windowed — a wrong position on a
correct frame. So the row is translated into the window and hidden when it falls
outside it, which is honest: the cursor is genuinely not on the screen, and a
cursor clamped to the window's edge would claim it was.

**One interaction the trace found and does not own.** With a menu open,
`activeTarget` is `overlay`, the overlay handler consumes only bound keys, and
C16 drops the rest — so a printable key does nothing while the menu is up. The
cursor hiding is consistent with that: the prompt is not taking keys, and saying
so is the point of I19. If typing is later allowed to filter an open menu, the
cursor rule has to move with it, and this is where to look.

**Typing was later allowed, and the rule moved — row 2a is where it went** (I51,
C19 §8c). The paragraph above is the whole reason this was cheap: it named the
mechanism, the consequence and the place to look, so the only work left was
measuring which of the three was still true. All three were. What it could not
say, because nothing had asked yet, is that the character is not taken by the
menu but **dropped by nobody** — step 3's `global` binds no printable key either
— so allowing typing is a route that has to be built rather than a precedence to
adjust.

---

## 6b. The write, walked by hand

The frame is composed whole and **written as a difference** against the last frame
this session put on this screen. `docs/notes/TUI_NOTE_render_chain_baseline.md` has
the measurement that makes it worth doing: 25.7 KB reach the terminal per frame
regardless of what changed, and 10.2 KB of that with an empty transcript.

**The invalidation story already existed and had no consumer.** `contaminated` is
C03's, set eagerly at commit time for a resize (C03 I7) and by `invalidate()` on
resume, on handoff and on a theme change. `frame-scheduler.ts` even reasons about
*"diffing against a screen whose contents nobody knows"* — a sentence that only means
something if diffing is the normal case. Until this, `render` and `repaint` were the
same function, so the whole mechanism reached nothing.

The write has structure — which rows differ — **and** state — what the screen already
holds — so it takes both artefact shapes.

### The classification table — which rows go on the wire

| # | The cell | Rule A | Rule B | Ruling |
|---|---|---|---|---|
| 1 | Row equal, nothing else true | skip it | — | Skipped. The screen holds it |
| 2 | **Every** row equal | skip them all | the cursor may still have moved | **Hide and cursor, no rows.** An empty diff is a legitimate write rather than a skipped one — the cursor is the frame's too |
| 3 | `contaminated`, frame identical to the last | skip them all | the screen's contents are unknown | **Contamination wins.** It is a claim about the screen, not about the frame, and the two are only usually the same |
| 4 | Previous record is a different size | rows compare | the screen is a different shape | **Full write.** A resize contaminates already (C03 I7), so this is defence and not a path — and it is what makes keeping a record across a resize safe rather than lucky |
| 5 | Row differs only in SGR bytes | strings compare | the glyphs are identical | **Rewritten.** String equality is the rule, and it errs towards writing |
| 6 | An overlay opened or closed | rows differ where the box is | overlays take no rows (I29) | Ordinary diff. Nothing special |
| 7 | Row *i* unchanged, row *i−1* changed and ends with a live attribute | skip *i* | SGR is terminal state, not per-row | **Skipped — and every written row carries a leading reset.** See below |

**Row 7 is the one the walk was written for, and the ruling did not survive
measurement.** The reasoning is sound: with a full frame the rows go out in order, so
each inherits the last one's SGR state; a diff writes them out of order, so a row can
inherit a state that was never above it. The remedy — reset each written row — follows.

Then the frame was read. **Zero of fifty composed rows end with a live attribute**:
every block renderer closes its own styling and `fitStyled` pads with plain spaces. So
the rule as first written forbids nothing, and would read exactly like a rule that
holds — A03 §2's vacuity class arriving in a *remedy* rather than in a check.

**What keeps the prefix is the asymmetry, and both figures are recorded.** Four bytes
per changed row against a colour that bleeds down every row below it and survives the
frame, on the day a renderer stops closing its own. The property the diff would
otherwise depend on is asserted nowhere; the prefix is what makes the writer
independent of it. A justification the next reader checks and cannot reproduce is one
they delete, so this one says which argument it rests on.

### The sequence trace — what the screen holds

| # | Sequence | Written |
|---|---|---|
| 1 | acquire → first frame | Everything. There is no record |
| 2 | keystroke | The prompt's rows, and whatever the transcript moved |
| 3 | `SIGWINCH` | Everything — C03 set `contaminated` at commit (I7) |
| 4 | `SIGWINCH` *during* a write | The **next** frame, whole. The flag is set eagerly and read at the top of the next `writeFrame` |
| 5 | `SIGCONT` after a suspend | Everything — `onResume` → `invalidate` (§3, construct step 8a) |
| 6 | A handoff returns | Everything — C23 invalidates (C23 §4) |
| 7 | A theme change | Everything — the sequence is L4's (A02 Seam 4) |
| 8 | A stream commit coalesced with an input one | One frame, one diff. Coalescing is C03's and sits above this |
| 9 | `paint` refuses and the fallback is drawn | The record is dropped: the fallback put something else on the screen |
| 10 | **The write itself throws** | The screen holds a *prefix* of a frame, and no record describes it |

**Row 10 is the second finding, and it is why the record is cleared before the write
rather than merely set after it.** *Set the record after the write returns* is the
obvious rule and it is not enough: on a throw the record still holds the frame
**before** the failed one, which is a frame the screen no longer shows. The next diff
would then compare against a screen that never existed and skip precisely the rows the
partial write got wrong. So the record is dropped before the bytes go out and restored
only when they have all gone — which makes a throw a full repaint by construction
rather than by a handler someone must remember to write.

This is the rejection-path question CLAUDE.md asks of any ruling that throws: a
decision leaves state, and the invariant that forbids the resulting state is usually
not in the component that took the decision.

---

## 6c. The rendered lines are cached, walked by hand

`visibleRows` calls `renderSequenceToLines` for every visible entry on every
frame, and nothing keeps the result — only `measure` is cached, by C14. The
measurement says what that costs: a keystroke against a 250-line patch is 160 ms
and against 5,000 lines 2.8 s, **linear in the lines the block holds and flat in
the rows the screen shows** (`docs/notes/TUI_NOTE_render_chain_baseline.md`).

**Alone this is not a fix, and saying so is the point of stating it here.** It
makes the *second* frame free while the first still renders every line, so it
converts continuous lag into one long stall. Landing it and reporting the problem
solved is the failure mode the ordering exists to prevent; §6d is the stage that
fixes it.

### The key, and `(entryId, rev, width)` is not it

The obvious key is C14's, and C14's `HeightCache` says in its own header why
**theme and capabilities are deliberately absent**: C09 §4 makes capability
substitutions 1:1 by cell count and C10 T4.1 asserts geometry is identical across
themes, so a theme switch invalidates the *frame* and not one cached height.

None of that transfers, because **this caches appearance and that caches
geometry**. Two axes are added and each is measured rather than assumed:

- **Focus.** `visibleRows` passes `focus: focusFor(graph, entry.id)` into the
  render, and C11 draws the focused row in a different tone (C11 I14). Two frames
  of one entry at one `rev` and one width differ. `focusFor` returns non-null only
  for the live entry, so at most one slot is ever affected — which is what makes
  a per-slot discriminator cheap rather than a reason to clear.
- **The theme's identity, carried in the key rather than hooked.** `ResolvedTheme.name`
  already changes on a variant switch **and** on an override, and C10 I11 already
  depends on exactly that for its own memo. So this needs no invalidation call and
  cannot be left out of one — the fact travels with the value. An `invalidate`
  hook someone must remember to add at a fourth call site is the shape this
  project keeps finding unwired.

### The sequence trace — event-mediated, because a document changes under it

| # | Sequence | Which rules meet | Ruling |
|---|---|---|---|
| 1 | append, render, patch the same entry, render | validity by `rev` | Re-rendered. One slot per entry, so the old value is overwritten rather than kept beside |
| 2 | two patches inside one `stream` window | C03 coalesces at 33 ms | One render, at the later `rev`. The cache never sees the intermediate, because the frame does not |
| 3 | `settle(id, doc)` | C13 moves `rev` (C13 I13) | Re-rendered — the same arm C14 gives it, and for the reason C14 records: a bare settle costs a lookup that returns the same value |
| 4 | focus moves between two rows of one table | focus, not `rev` | Re-rendered. `rev` and width are unchanged, so this is the axis that would otherwise serve a stale frame |
| 5 | focus moves to an entry that is not live | `focusFor` returns null for it | Nothing re-renders. The discriminator must normalise *no focus* to one value, or a session alternates between two keys for one appearance |
| 6 | `/theme dark` | `ResolvedTheme.name` moves | Every slot's key changes. No hook, no clear |
| 7 | a width change | width | Every slot's key changes, exactly as C14's does |
| 8 | evict, then the same id appended again | C13 ids are not reused | Deleted on evict; a fresh id could not collide in any case |
| 9 | `/clear` | | Cleared |
| 10 | **a `steps` block animating through `ctx.tick`** | the key has no `tick` axis | **Not reachable, and recorded because it is one line from being reachable.** `visibleRows` passes no `tick`, so every transcript render is at 0. The day it is threaded, an animating entry serves its first frame forever and no assertion here would fail — so either the key gains the axis or live entries stop being cached, and this row is where that decision is owed |

**Row 10 is A03 §2's shape pointed at a cache.** A key that omits an axis nothing
currently varies is indistinguishable from a key that is complete, and the
difference appears the day someone threads one value through one call.

---

## 7. Health and identity

**Identity comes from the app, through `config.identity`.** C22 owns the cadence
and the state; where the fact comes from is the far side's business (§13), so the
source is a seam and not a mechanism here — the same shape and the same
justification as `pipeline` (I22), and it defaults the same way, to a fetcher
returning `null`.

**It was a stub with no seam, and that is why the mechanism above could not
fire.** The loop was constructed with `fetch: () => Promise.resolve(null)` and a
comment saying *until the app supplies one*, and there was no field through which
an app could. So the expiry notice had **two** things between it and a reader —
the fetcher that could never return a token, and a `notify` that discarded the
text — and either alone is enough to make the whole of §7's first transition
unreachable. Two independent blockers on one path is the shape a single fix reads
as closing and does not: removing one leaves the behaviour exactly as it was, and
the commit that removes it looks like the one that fixed the bug.

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
- **I13** — Chrome is app-supplied; Calcium owns only the frame's structure. It receives the session, the frame's `now` and `columns` — a snapshot alone cannot render the clock S01 §4 specifies or apply its width elisions, and neither belongs on the snapshot: one ticks per frame and the other is C01's to hand down.
- **I13a** — `now` is sampled once per frame and both chrome functions receive the same value. Two independent reads can straddle a second boundary and print a header and a footer that disagree — C01 I12's rule, one layer up.
- **I14** — C22 never auto-logins.
- **I15** — An offline cluster degrades the session; system commands keep working.
- **I16** — `stopped` is terminal.
- **I17** — `createTui` requires exactly four fields; every other has a working default. The count is the ergonomic claim R01 §1 tests — a working TUI built from the README without asking a question — and a fifth required field is a spec change rather than a convenience.
- **I18** — Banner and identity fetches are non-blocking: input is accepted before either completes, and neither can delay the first frame. A shell that will not take a keystroke until a network call returns is a shell that hangs on a bad DNS entry.
- **I19** — Identity refresh runs on C22's injected clock at a five-minute interval, and expiry never discards the command that hit it. The command is retained across re-login and resubmitted by the user, not automatically — a session that silently re-ran a verb after an auth gap would re-run it against whatever the credentials now authorise.
- **I20** — Calcium reads no environment, variable or record. `PRISM_TUI_STATE_DIR` arrives as `TuiConfig.stateDir`, `PRISM_TUI_TRANSPORT` as `TuiConfig.transport` (C06 I18), and the process environment itself as `TuiConfig.env`, which C22 hands to C02 and C21. A03 SS10's allow-list names one file and that file does not use it — no module under `src/` touches `process.env`.
- **I21** — `beforeRelease` is synchronous and returns `undefined`, never a thenable. `killAll()`'s promise is deliberately not awaited: its signals are delivered synchronously and only the reaping is deferred, and awaiting it would make the handler `async`, which C01 I5 forbids because a signal handler cannot await.
- **I22** — `pipeline` has a working default, as every other optional field does (I17). `config.pipeline` remains the injection point C22's own tests construct a graph through, and a graph always carries a `Pipeline` — an injection seam with no default is a missing wire that only the tests hold together.
- **I23** — Every manifest reaching the stores has been through `parseManifest`, whichever arm of `config.manifest` supplied it. Restated: it previously said construction *refuses* a manifest lacking Calcium's six verbs, which was right about the danger and left no accepted input — `parseManifest` is exported nowhere, and the path arm handed `readFile`'s string to a function requiring a record. Construction still appends nothing and derives nothing; it parses, and the one function that may add the six remains the only one that does. An already-parsed `Manifest` handed back now fails on I6's duplicate check, loudly and for free.
- **I23a** — `TuiConfig.manifest` is `ManifestDocument | string`. A `Manifest` is the parser's *output* — it carries `appTools`, which the parser derives — so requiring one from an author was requiring the result before the call. An author supplies `{ schema, binary, version, tools }`: their own verbs, which is all they can know.
- **I23b** — `ManifestDocument` structurally excludes `appTools`, so a parsed `Manifest` is **not assignable** to `TuiConfig.manifest` and the mistake is a compile error rather than a `ConstructionError`. `Omit<Manifest, "appTools">` alone does not do this: a `Manifest` has every member of it and one more, so the type accepted exactly the value I23's parse refuses. That gap merged, took tier 5 down by forty-four rows, and was reported green — a runtime refusal only protects code that has been run, and the harness that had not been run was the one that broke. Where a wrong call can be made unbuildable it must be, which is §3a's `const pipeline` argument applied to a type rather than to a binding.
- **I24** — Raw bytes reach the decoder through `lifecycle.onInput` and through nothing else, and the decoder's deadlines are polled on C22's injected schedule. C22 is the only file that may read stdin, for the reason it is the only one that may read the clock: two readers of one stream is two half-decoded sequences, and the second reader is invisible to the first. The wake-ups are here because C16 owns no timer and C01 owns no clock, so a decoder without them delivers a lone `Esc` on the next keystroke rather than after its window (§3 step 12).
- **I25** — A suspension is bracketed by `suspend()` before the handoff and `resume()` then `decoder.reset()` after it. The listener's removal is C01's, in the transition; the reset is C22's, because only this file knows both that the terminal came back and that a decoder is holding a sequence the child interrupted (C01 I18, C16 I18).
- **I26** — Step 11 registers a handler for every focus target that has bindings, and the effect table in `keys.ts` is total over C16's `KeyAction` union. A binding `/help` renders is therefore one dispatch executes, by construction rather than by agreement (C16 I19).
- **I27** — Exactly one `commit("input")` per decoded batch, issued by the read loop; no handler commits. Two committers is one frame too many for a scroll and none for whichever handler forgets, and only the second is invisible (C16 I11).
- **I28** — The layer region is the viewport region, and it is the same `{ width, height }` the frame computed for the transcript. A drawer adds `region.top` to every `Placed.top` and the router subtracts it from every mouse row (C16 I20), so one number is translated in one direction in each direction of travel. Widening it to the whole terminal costs nothing that any check can see — §3's sum holds at every width with every layer misplaced — and puts a pushed view over the header, the prompt and the footer (C15 T4.4, S01 §3a).
- **I29** — Layers are composited **onto the accumulated rows**, bottom-first in the order `layout()` returned them, and each writes every cell of its own box including the ones its blocks produced no glyph for. Compositing each layer onto the base rows instead is correct for one layer and discards the one beneath it for two; writing only the glyphs leaves the prompt showing through the gaps in a menu. Neither is visible until two layers overlap or a layer is narrower than its content, and both read as defects in the component that produced the content (§6a).
- **I30** — A box that escapes the region refuses the frame rather than being clipped into it. C15's clamp is what makes this unreachable, which is why it is asserted rather than assumed: a clip repairs the symptom and leaves a placement defect drawing something plausible, and one row past the last row scrolls the alternate screen (S01 §3, `heightsSum`'s shape).
- **I31** — **A state change that happens outside a decoded batch commits when it happens.** I27's rule covers the synchronous effects of a keystroke and nothing else: an asynchronous continuation has no batch to be counted in, so a completion menu pushed when its source settles, or an identity refreshed on its five-minute cadence, changes state that no frame is composed from. The symptom is the one the read loop's `arm()` already names for the decoder's own deadlines — *a key that appears to do nothing until you press another one* — arriving one layer up, where the trigger is not a key at all and the next keystroke is what reveals it. Every such producer takes an injected commit and calls it; the reason is `"completion"`, whose window is zero because the screen is already wrong by the time it fires (C03 I2).
- **I32** — The read loop re-arms its deadline on **every** chunk, including one that decodes to no events. An empty batch is not an absence of work: a lone `Esc` is held for C16's 50 ms disambiguation window and emits nothing at all, so it is precisely the state that needs a wake. Guarding the loop with an early return on `events.length === 0` puts that guard above the arming and reproduces the symptom the arming was written to prevent — a key that appears to do nothing until you press another one. The commit stays inside the non-empty branch, because nothing changed and nothing needs drawing.
- **I33** — **The transcript draws each entry with the command that produced it**, as frame chrome above the entry's blocks. It is *the displayed command* — `entry.doc.command`, the line the user typed — and never `meta.argv`, which is the spawned form (`widget ps --json`) and is `/debug`'s to show. It is **not a block**: an adapter did not produce it, `--json` must not contain it, and it must not count toward C13's cap. Its rows are supplied to C14 through `chromeRows` (C14 I20) so that the height the index virtualises against is the height the composer draws; computing it in one place and not the other is a viewport that is arithmetically self-consistent about a document it is not showing. **Without this the transcript is results with no record of what produced them** — three tables and no way to tell which command made which — and C23 I15's *displayed command* had nothing to constrain, which is A03 §2's vacuity class arriving at the level of an invariant.
- **I34** — **The viewport's height is the composed frame's region height, set from the frame and nowhere else.** C14 is told what to be as tall as (C14 I22), and only the compose step knows the answer: the region is `rows − header − footer − promptRows` (S01 §3), and the prompt's height changes with what is typed rather than with the terminal. So the value is pushed in `#render`, from the frame just composed and before the visible rows are read — one owner, and the one that has the number.
  - **The resize handler must not also set it.** Two writers with different ideas of the same quantity is the defect this replaces, not a redundancy: `onResize` had the terminal's height and ran on SIGWINCH, so the viewport was three rows too tall from the first frame and stayed that way. The handler keeps the width — that is what invalidates the cache (C14 I8) — and issues its commit; the height comes from the frame.
  - **Setting it per frame is safe because C14 refuses a resize to the size it holds** (C14 I21). Without that guard this is a `Change` per frame arriving back at the thing that composed the frame. The guard is C14's and is argued there on its own terms; this invariant depends on it rather than justifying it.
  - **Why nothing could see it.** `heightsSum` compares the frame with itself, C14's I10 compares the viewport with itself, and `paint`'s transcript region kept the first `region.height` rows of whatever it was handed — so a viewport three rows too tall produced a coherent frame describing a document whose last three rows no key could reach. The paint now refuses an over-long selection instead of trimming it (I35), which is what makes the mistake say something.
- **I35** — The transcript region **refuses** a row selection longer than the region rather than truncating it. With I34 held it is unreachable, which is exactly why it is asserted: silently keeping the first `region.height` rows is what let a mis-sized viewport look correct, and a truncation that repairs the symptom leaves the component that chose the rows believing it was obeyed. Same shape as I30 for a box that escapes the region.
- **I36** — Gate 1 **refuses before construction**: a non-TTY stdout prints usage and exits 0 with nothing built, nothing acquired and no byte of escape emitted. It is not gate 4's deferral (I8), and the difference is the event: a terminal too small can become big enough, and a pipe cannot become a terminal. Asserted as *nothing was constructed* rather than as *the gate ran first* — a gate that ran first and built the graph anyway would open a history file and start an identity loop for a process about to exit.
- **I37** — The non-TTY help is **CLI usage and not `/help`**, and it is non-empty. `/help` renders keybindings from the keymap (C23 I26), which is the right answer at a prompt and the wrong register for a pipe, where there is neither. The non-empty half is the one a test forgets: exiting 0 having printed nothing is indistinguishable from a hang to the caller and from a working gate to an assertion about the exit code.
- **I38** — **The completion spinner is read at paint time and armed at request time, and both halves are needed.** C19 answers `spinning` — the earliest source call still in flight is older than 500 ms — and until now no file under `src/shell` read it, so C19 §7's spinner had an implementation on one side of the seam and none on the other. Two separate mechanisms, because the wrong implementations fail differently and both look right: the frame composes the indicator from a **fresh read on every paint**, so a value cached at request time can never become true; and the request **arms a wake** at the threshold, so the frame that first shows it is one nothing else would have drawn. Without the wake the spinner appears only when the user next types — the *key that appears to do nothing until you press another one*, which is C22 I32's symptom arriving through a different timer. It is **appearance and never geometry**: the glyph is painted into the prompt's last row over padding it does not lengthen, so `measure` never sees it and the prompt's height is the same whether a request is in flight or not.
- **I39** — **A keystroke cancels a pending completion**, and until now nothing did. C19 §7 commits that a keystroke during a pending request supersedes it — the old sequence abandoned, the spinner cleared, nothing arriving late to overwrite the buffer — and C19 holds the whole mechanism: `cancel()` invalidates the token, and a superseded request already resolves with no candidates (C19 I13). What was missing is the caller. No file under `src/shell` called `cancel()`, so typing after a `Tab` on a slow source left the request live, and a menu opened a second and a half later for a prefix the user had moved past. The same shape as I38 and found by the row I38 unblocked: a component complete on its own side of a seam, with nothing on the other. The printable and paste paths cancel; the guard in the effect table does not cover it, because that one compares the shell's own sequence and a printable keystroke does not advance it.
- **I40** — **The theme variant is persisted by C22 and repaired on read.** `/theme <variant>` writes it to `${stateDir}/theme` at the moment of the change rather than at exit, because a session killed by `SIGKILL` runs no shutdown path and a preference that survives a clean exit and not a crash is one people stop trusting. On construction the file is read; anything that is not one of the two variants is treated as absent, the base theme is retained, and **a notice is committed** — C20's precedent, where history repairs a corrupt file at open rather than failing. The notice is the half that matters: without it "absent" and "corrupt" look identical to a user who chose light and got dark. It is C22's and not C10's because C10 is a pure function over tokens and this is session state with a filesystem behind it; a store reaching a disk from L1 is MG23's neighbourhood.
- **I41** — **A pushed view holds one piece of state: its row offset.** `n` and `p` compute a hunk's first row from the offset; `g` and `G` set it. A view holding an offset *and* a hunk index has two cursors for one position — `G` leaves the index pointing at the hunk the reader scrolled away from, so `p` jumps upward from a place nothing on screen explains — and no test that drives one motion at a time can see it (C25 §3c A4).
- **I42** — **A pushed view rewindows from the live block on every motion, and is dismissed with `anchorEvicted` when its entry goes.** A snapshot taken at push time shows a diff the entry no longer holds, and `expand` produces exactly such a patch one keystroke earlier. C15 supplies the reason code and cannot detect the condition — it subscribes to nothing and holds no entry ids (C15 I10) — so the owner watches the transcript, and `Esc` never meets a dangling view because the view is gone before it (C25 §3c A6).
- **I43** — The identity source is `config.identity`, defaulting to a fetcher that returns `null`, and **C22 signals the notice rather than writing it** — the loop hands its text to C23, which appends (C23 I19). Both halves are the invariant: a seam with no default is a wire only the tests hold together (I22), and a signal delivered to a discarding callback is a mechanism that passes every test of its own and reaches nobody.
- **I44** — §4 step 7 fires `config.greeting` and does not await it, and C23 appends what it returns through the ordinary append path. A rejection or a hang leaves the prompt usable and produces no entry; nothing about startup waits on it. The step existed in the list, in T3.10 and T3.11, and in S02's `Source` row, and **no code fired anything** — step 12's shape a second time in the same list, and the reason S02's welcome could be specified in detail by three documents and reachable by none. Appending through C23 rather than rendering here is A02 Seam 4: C22 produces a fact, C23 is the only component that appends, and a live part in the greeting is driven because it took the same route every other document takes (C23 I33a).
- **I45** — **A verb's result is a view when its declaration says so; the decision is taken before step 3, and the view is pushed where the pending entry would have been.** Pushed before the transport is invoked and filled after it, so the ordering C23 I3 protects is unchanged and a slow verb is not a blank screen; a failure renders into the view rather than into a transcript that has nothing to show. Read from the manifest at step 2, never from the document the adapter returns: C23 I3 appends the pending entry before the transport runs and C13 has no delete, so an adapter-side decision could only produce a view *and* the entry B03 §2 says a push does not leave. The party is the one `ToolDef.interactive` already names — the app author — because a view is a handoff of input ownership and detection is not available for either.
- **I46** — **A pushed view is owned by a shell-side component holding one offset, and C15 holds none.** The owner windows at **block boundaries** and hands C15 a smaller sequence, which is C25 I18's shape generalised: C15 measures the result through the same registry as everything else, so there is no second height codepath and `Placed` gains no scroll offset. A plot is atomic within that window and always will be — C12 I1 puts its series out of the height's reach, so *granular where the kind divides, atomic where it does not* is the ceiling, and row-granular scroll is not on the path. C15 §183 moved this duty to the owner deliberately, to avoid a second scroll model beside C14's (A01 D3). I41 and I42 were written for the patch view and are the general shape: one piece of state, rewindowed from what the host holds rather than snapshotted at push time. A view whose parts tick releases them **at the pop**, not when a later fetch discovers the layer has gone.
- **I47** — **A pushed view whose content C15 truncated says so on screen.** I46's window falls on block boundaries and the projection emits at least one block whatever its height, so a block taller than the region is shown cut and cannot be scrolled — the offset indexes blocks, and with one block there is no second offset to move to. The owner's remedy is to split, and splitting has a floor: a leaf with no children to split by has no smaller form that is still that leaf, so a producer can promise zero unreachable rows for every document whose leaves fit and not in general. **The two are one ruling and neither half is sufficient** — split alone leaves a silent residue, and the indicator alone leaves a document nothing can cross. `Placed.truncated` carries the fact already and C19's menu reads it (C19 §5); the duty here is to read it for a view. Content stopping mid-object with no indicator is indistinguishable from content ending, which is why this is not decoration.
- **I48** — **A verb declared both `view` and `streams` runs into the view, and its patches are applied through the owner.** The owner gains `patch(view: ViewPatch)` over C04's `applyPatch` — the same function C13 calls, so there is no second answer to what a patch means — and keeps `putBlock` for the refresh driver, whose contract is total where this one reports C13's three arms. The route releases the submission guard **before** its loop and registers its canceller in the live-stream set **before** awaiting it, exactly as the entry route does (C23 I6, C16 §5); omitting the second here loses the session rather than a cancellation, because the view's loop is the only thing on screen. **A view has no settlement**: `end`, a malformed patch and a failure each append a notice and leave the view open, because the stream ending is not the reader having finished with it and B03 §2 makes the pop the reader's. A **cancelled** view pops; a finished one does not. **An append holds the window at the bottom if it was at the bottom**, and leaves it alone otherwise — a follow whose window never moves shows its first screen for ever, and a window that moves under a reader who scrolled up is the same fault reversed.
- **I49** — **C02's capability overrides have a producer, and it is `TuiConfig.capabilities`.** The parameter, its validation, its precedence rule (C02 I4) and its e2e row all existed while nothing an application could call supplied it; `construct.ts` passed one argument and the only other caller was a test fixture reaching in by deep import. A parameter with no producer passes every test written about it, which is why this survived: A03 §2's vacuity class reached through an argument, where C24 I16 is written about exports and MG25 scans functions and constants. **The measured consequence is that `colourDepth: 1` was unreachable by any application** — the only rule producing it is the `dumb` gate, which also clears `altScreen`, and C02 I7 makes that the one refusal that stops the shell. Overrides are still C02's to validate; C22's duty is to hand them over and to surface the warnings where it surfaces C02's others.
- **I50** — **Ghost text is composited into the prompt, and it is appearance rather than geometry.** T4.7 has claimed this since C22 was written and nothing implemented it: `ghost()` had exactly one caller in the tree — the accept path in `keys.ts`, which *inserts* it — so the suggestion existed, was computed on every keystroke, and was invisible until the key that consumed it. `test/contract/editor.test.ts` recorded the other half as deferred *"when C22 lands"*; C22 landed and the row was never written, which is a deferral expressed as a comment and therefore one that could not expire.
- **I51** — **An overlay that is chrome for the prompt forwards what it does not bind to the `prompt` handler.** C19's menu is the case: `activeTarget` answers `overlay` for anything on the stack (C16 §3), the overlay handler consumes only its six actions, and step 3's `global` binds no printable key — so a character typed while the menu is up is dropped, measured against a control with no layer open. A menu that opens by itself (C19 I19) cannot live with that, because it would stop typing at the moment it appeared — and a menu the user requested must not either, since C19 §8's keystroke cell narrows it in place and that cell is unreachable while the character never arrives. So the forward is the menu's, whichever opened it, and **while it holds no selection the prompt's bindings resolve first** (C19 I20). **The decision is C22's rather than C16's**: the ladder is right, and which layers are an extension of the prompt is a fact about this shell's composition — L4 is where the menu's and the search's identities are both known. C20's reverse search is the same shape and is not wired here: its `type()` has no caller in `src/`, so a query typed after `⌃R` is dropped exactly as the character was, and the rules for narrowing to a hit are C20 §5's.
- **I52** — **The prompt has a form per capability and both are `PROMPT_GUTTER.first` cells wide.** It is resolved where it is drawn, in `commandRows`, which takes the capability because the measurer calls it too — resolving at module scope would read a capability before C02 has detected one. The width equality is asserted rather than commented: it is the one substitution in the tree that a *measurement* depends on, so a second form of unequal width is the measure/render divergence class arriving on the input line (C09 I22, F122).

  It follows I38's shape exactly and for the same reason. The ghost is **read fresh at paint** rather than captured when it was computed, and it is drawn into padding the prompt already has: it never lengthens a row, so `measure` does not see it, `promptRows` is the same number with a suggestion and without one, and a suggestion that would not fit is simply not drawn. **A suggestion that changed the prompt's height would move the viewport underneath it on every keystroke** — the geometry defect I38 exists to forbid, arriving through the other affordance that lives in the same row.

  **The spinner wins the row when both would draw.** They occupy the same cells — immediately after the text — and both are true at once whenever a `Tab` is in flight over a prefix that also has a static suggestion. Showing a stale suggestion beside *still thinking* states two things, one of which is about to stop being true; the spinner is the one the reader needs.

- **I53** — **The greeting is a producer and is handed the producer context** (C23 I40, C07 §3). It returns a document and was told nothing, which is the same omission the local route had at four other sites; a producer told nothing decides anyway, from a worse copy of the fact. It falls out of the producer ruling rather than extending it.
- **I54** — **The frame composition is a named unit and `session.ts` calls it. There is no second composition, and a scan says so.** The class no rule here could see: every prior instance of a mechanism unreachable across a seam was *a member nobody could call*, and this was *a sequence nobody named* — MG24, MG25 and MG27 are all satisfied by a tree where every member is consumed and only the order is missing. It matters now rather than in the abstract because the render chain gains diffing, caching, windowing and a cap as one change, and a copy would diverge on the first of them in silence (F126, C24 I25).
- **I55** — **The frame is written as a difference against the last frame this session put on this screen, and whole whenever no record describes it.** Four things leave no record: the first frame, a `contaminated` write, a refused frame that drew the fallback, and a record whose size differs from the frame's. `contaminated` is a claim about the *screen* rather than about the frame, so a repaint happens even when the composed rows are identical to the last (§6b table row 3) — and until this invariant existed `render` and `repaint` were the same function, so C03's whole invalidation mechanism reached nothing.
- **I56** — **The record is dropped before the bytes go out and restored only when they have all gone.** Setting it after the write returns is the obvious rule and leaves the fault case wrong: a write that throws puts a *prefix* of a frame on the screen, and a record surviving the throw describes the frame *before* it — so the next diff compares against a screen that never existed and skips exactly the rows the partial write got wrong. Clearing first makes a throw a full repaint by construction rather than by a handler someone must remember to add (§6b trace row 10).
- **I57** — **Every row the diff writes carries a leading reset, and the rule rests on asymmetry rather than on a live defect.** Measured at the time of writing, **0 of 50 composed rows end with a live SGR attribute** — every renderer closes its own styling and `fitStyled` pads with plain spaces — so a rule justified as *otherwise colour bleeds* would forbid nothing and read exactly like a rule that holds (A03 §2, in a remedy rather than in a check). What keeps it: four bytes per changed row, against a colour bleeding down every row below it and surviving the frame, on the day a renderer stops closing its own. A diff writes rows out of order, so a row can inherit a state that was never above it; nothing else asserts the property that would make the prefix unnecessary (§6b table row 7).
- **I58** — **An entry's rendered lines are cached on `(entryId, rev, width, focus, theme identity)`, one slot per entry.** The first three are C14's and the last two are the difference between caching *appearance* and caching *geometry*: `HeightCache` records that theme and capabilities are deliberately absent from it because C09 §4 and C10 T4.1 make height theme-invariant, and neither argument reaches colour. Focus enters because C11 draws the focused row in another tone (C11 I14) and `visibleRows` passes it in; the theme enters as `ResolvedTheme.name`, which already moves on a variant switch and on an override and which C10 I11 already relies on for the same purpose — carried in the key rather than through an invalidation call, because a hook at a fourth call site is the shape this tree keeps finding unwired. One slot per entry makes the cache bounded by the entry count by construction rather than by an eviction rule, which is the argument C14 §4 makes for the same shape.
- **I59** — **The cache makes the second frame free and the first no cheaper, and that is why it is not the fix.** A 5,000-line block still renders every line the first time it is drawn at a width, so this stage on its own converts continuous lag into one long stall. It is recorded as an invariant rather than as a note because the failure mode is *reporting the problem solved* — §6d is what bounds the first frame, and the ordering is the finding (F90).
- **I60** — **`ctx.tick` is not in the key and no transcript render receives one.** `visibleRows` passes no tick, so every entry renders at 0; a `steps` block animating in the transcript would serve its first frame for the life of the session and nothing here would fail. The invariant is the *pair*: the axis is absent **and** the value is constant, so the day one is threaded the other is owed — either the key gains it or live entries stop being cached (§6c trace row 10, A03 §2).
---

## 11. Commitments

1. Four required config fields; every other has a working default, `pipeline` included (I17, I22).
2. Clock, filesystem, opener and state directory are injected here and nowhere else; `stateDir` defaults to `.calcium` — the framework's name, never a consumer's, and relative to the launch directory because the tilde it used to carry was never expanded — and the **app's entry point** resolves its own variable (I10, I20).
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
11a. The identity source is injected with a working default, and the notice it produces is handed to C23 rather than written here (I23).
12. Cleanup is `beforeRelease` and all five callers reach it; the three explicit callers additionally run `stop`'s four ordered steps, and the signal and fault paths are C01's, which cannot be given more (I4, I4a, I5).
12a. `beforeRelease` is synchronous and returns no thenable; `killAll()`'s promise is not awaited and `drain()` is used rather than `flush()` (I21, C01 I5, C20 I18).
13. Release precedes diagnostics; history flushes on every path (I6, I7).
14. An offline cluster degrades rather than ends the session (I15).
14a. Step 12 wires the read loop: bytes reach the decoder through `lifecycle.onInput` and nowhere else, and its deadlines are polled on the injected schedule. Startup step 8 had a name and no mechanism until this step existed (I24).
14b. A suspension is `suspend()` → handoff → `resume()` → `decoder.reset()`, and the ordering is asserted rather than the outcome (I25, C01 I18, C16 I18).
14c. Step 11 registers a handler per bound target and an effect table total over C16's action union, in `keys.ts` — which is not C23's `actions.ts`, and each says so (I26).
14d. One `commit("input")` per decoded batch, issued by the loop; no handler commits (I27).
14e. The layer region is the viewport region; the drawer adds its top and the router subtracts it (I28, C16 I20, S01 §3a).
14i. Each entry is drawn with the command the user typed, as chrome that is measured but is not a block (I33, C14 I20).
14j. The viewport's height is pushed from the composed frame's region, per frame and from one place; the resize handler owns the width alone, and an over-long selection refuses the frame (I34, I35, C14 I21, C14 I22).
14k. Gate 1 refuses before construction and prints CLI usage, not the keymap (I36, I37).
14h. The read loop re-arms on every chunk; an empty batch is a pending deadline rather than no work (I32).
14g. Anything that settles outside a decoded batch commits when it settles — the completion menu and the identity refresh are the two live producers, and I27's per-batch rule does not reach either (I31).
14f. Layers composite onto the accumulated rows, bottom-first, each writing every cell of its box; a box escaping the region refuses the frame (I29, I30).
15. `stopped` is terminal (I16).
17. The theme variant persists through `${stateDir}/theme`, written on the change and repaired on read: a file that is not a known variant leaves the base theme standing and commits a notice (I40).
18. C22 owns the pushed view: one piece of state, rewindowed from the live block, dismissed on eviction with the reason C15 declares and cannot detect (I41, I42).
16a. A keystroke during a pending completion cancels it, so nothing arrives late to a prompt that has moved on. C19 holds the mechanism; L4 is the caller that was missing (I39).
16. The completion spinner is composed from a fresh read of C19's `spinning` on every paint, and a request arms a wake at the threshold so a frame exists to show it. Appearance, never geometry (I38).
19. A verb's result is a view when its tool or one of its flags declares it, decided before the pending entry exists — so `Esc` finds no entry to touch and selection survives because nothing appended (I45, §13a).
20. A pushed view's offset belongs to its owner and never to C15, and its parts are released at the pop (I46, §13a).
21. A view whose content C15 truncated reports it on screen, because a block taller than the region is shown cut and cannot be scrolled — and splitting, the owner's half of the remedy, has a floor at a leaf with no children (I47, §13a).
22. A verb that is both a view and a stream patches through the view's owner, releases the guard before its loop and registers its canceller before awaiting it; its stream ending appends a notice rather than closing the view, and only a cancellation pops one (I48, §13a).
23. C02's capability overrides reach C02, because a parameter no application can supply is tested and unreachable at once (I49, §2).
24. **Ghost text reaches the frame**, composited into the prompt as appearance and never as geometry: the spinner wins the row, a suggestion that does not fit is dropped rather than truncated, and `measure` never sees it (I50, C19 I7).
25. A layer that is chrome for the prompt does not stop typing. What the overlay handler does not bind is forwarded to the prompt's, because the alternative is measured and is not "the menu takes the key" but "nobody does" (I51, C19 I20).
26. The prompt is a capability pair of equal cell width, resolved where it is drawn and not at module scope, because the function that draws it is the function that measures it (I52, C09 I22).
27. **The frame goes to the terminal as a difference**, whole whenever no record describes the screen — which `contaminated` is the existing and until now unconsumed statement of (I55, §6b).
28. The record is cleared before the write and restored after it completes, so a write that throws repaints rather than diffing against a screen that never existed (I56, §6b).
29. Each written row opens with a reset, kept on the asymmetry between four bytes and a colour that survives the frame, with the measurement that shows it is currently inert recorded beside it (I57, §6b).

30. An entry's rendered lines are cached on `(entryId, rev, width, focus, theme identity)`, one slot per entry — the two axes C14's height cache deliberately omits are the two this one cannot (I58, C10 I11).
31. **This stage makes the second frame free and the first no cheaper**, so it is not the fix and the spec says so where someone would otherwise stop (I59, F90).
32. No transcript render receives a `tick`, and the key has no axis for one; threading either obliges the other (I60).
---

## 12. Tests

Six tiers. Every cell of the §9 table is covered. Tiers 1–4 use fake clock, fake filesystem and a fake terminal stream throughout.

### Tier 1 — unit

- **T1.1**: `start` with valid config → running; every component constructed once.
- **T1.2** (I1): construction order is asserted on an event log — stores and runner before lifecycle.
- **T1.3** (I2): the lifecycle's handler registration precedes the first acquire.
- **T1.19** (I40): `/theme light` writes the variant, and a session constructed against the same `stateDir` opens light. Driven through two real sessions over one fake filesystem rather than by reading the file — the file's contents are an implementation detail and the claim is that the choice survives.
- **T1.19b** (I40): a `theme` file holding something that is not a variant → the base theme is retained **and a notice is in the transcript**. Two assertions because either alone passes against the other's defect: retaining silently satisfies the first, and a notice beside a switched theme satisfies the second. The control is a valid file, which must produce no notice.
- **T1.18** (I38): a request with a slow source shows no spinner before the threshold and one after it, on a fake clock, **read off the composed frame** rather than off the engine, and the frame carrying it arrives with **no further input** — and the prompt's height and the frame's widths are identical in both, which is the half that says it is appearance. The two mutations fail differently and both must: reading `spinning` once at request time and caching it → the spinner never appears; dropping the wake → it appears only on the frame the *next keystroke* draws, so the assertion that a frame arrives with no further input is what carries it.
- **T1.4** (I3): all four seals are closed before the input router accepts anything — C05's, C07's and C09's, and C23's local registry, which is the one a test counting only the construction-time ones would miss. C19's engine has no `seal`, and the test asserts that too: a count is the wrong assertion when one member of the set does not belong to it.
- **T1.4b** (I3, commitment 3a): the submit handler is registered after the pipeline exists, and the pipeline holds the router. Asserted on the event log: no handler registration precedes step 10. The construction cycle §3a found fails here rather than at the first Enter.
- **T1.4d** (I22): a config omitting `pipeline` still yields a graph carrying a sealed `Pipeline`, and an injected factory is still used. Both halves, because a default that ignored `config.pipeline` would satisfy the first and remove the seam.
- **T1.4e** (I43): a session given an `identity` fetcher returning a token inside one day of expiry → **the notice reaches the transcript**, carrying `origin: "refresh"`. Asserted on the appended document rather than on `warned`, because `warned` flips whether or not anything is delivered — which is exactly the state this row was written against.
- **T1.4f** (I43): a config omitting `identity` → the loop still runs, health settles, and nothing is appended. The default is a fetcher, not an absent loop.
- **T1.4k** (I3b): a constructed graph's completion engine answers a bare prefix with the manifest's verbs, and a path prefix with what the injected `readDir` returns. Both, because a registration that wired only the manifest source satisfies the first — and the two filesystem sources are the ones with a dependency to forget.
- **T1.4j** (I3a): a manifest declaring a local verb constructs when `localHandlers` supplies it, and fails naming the verb when it does not. Both halves: the failure alone is what shipped, and it read as the check working rather than as a route that did not exist.
- **T1.4e** (I23): a hand-built `Manifest` fails construction naming all six missing verbs; the parsed one is accepted. The second half is the control — without it the check is indistinguishable from refusing every manifest.
- **T1.4f** (I24, commitment 14a): a byte written to the fake stdin after `start()` reaches the router as the decoded event, and the same byte written before `acquire()` reaches nothing. The test is the whole path — stream to `onInput` to `push` to `dispatch` — because each half of it existed and passed its own tests while the two were never joined.
- **T1.4h** (I26): every `defaultKeymap` binding, pressed through a real decoder into a constructed graph, produces its documented effect — fourteen cases, driven from the table rather than listed. A hand-written list is the shape that let fourteen bindings go unexecuted while every test passed.
- **T1.4i** (I27): a paste of two hundred lines → exactly one `commit("input")`; a scroll key → exactly one, issued by the loop and not by the handler. Both halves, because a handler that also commits passes the first.
- **T1.4m** (I23, I23a): a session constructed from **the public entry point only** — `import { createTui } from "@fmx/calcium"`, a `ManifestDocument` literal of the app's own verbs, no deep import anywhere in the test — starts, and `/help` lists the framework's six alongside it. The constraint is the test: every existing construction harness reaches through the package boundary for `parseManifest`, so each tests a route no consumer has, and that is why both arms of `config.manifest` could be broken with the suite green. The row fails if either the `JSON.parse` or the object-arm parse is removed.
- **T1.4n** (I23): the path arm — a `manifest.json` on the fake filesystem — constructs, and a file containing malformed JSON produces a `ManifestError` naming the file rather than a `SyntaxError` escaping `start()`.
- **T1.4o** (I23b): a **type-level** row — `const m: TuiConfig["manifest"] = parseManifest(doc).value` does not compile, asserted with an `@ts-expect-error` that fails if the assignment ever becomes legal again. It is the only shape that can hold I23b: the defect it guards is a call that type-checks, so no runtime assertion can be written against it, and the previous type passed every runtime test of the refusal while permitting the call.
- **T1.4l** (I23): an already-parsed `Manifest` handed back to `createTui` fails on I6's duplicate-name check, naming a framework verb. The refusal that used to be C22's is C05's now, and this is the row that says it still happens.
- **T1.4g** (I24): a lone `Esc` with no following byte → the key is dispatched when its window elapses on the injected schedule, not when the next key arrives. A decoder wired without wake-ups passes T1.4f and delivers `Esc` on the next keystroke, which is a key that appears to do nothing until you press another one.
- **T1.5**: `createTui` with only the four required fields → every default applied and functional.
- **T1.6** (I10): a fake clock and filesystem reach every component that takes one — asserted per component.
- **T1.7** (I5): on every exit path, `killAll` and `drain` each run **exactly once** — the double-flush regression, tested directly.
- **T1.8**: `stop("exit")` from running → §8's **four** steps in order, exit code 0. An earlier draft of this line said five, against a §8 and an I4 that both say four; the count is asserted against the list rather than restated, so the two cannot drift again.
- **T1.9**: `stop` from created → stopped without acquiring anything.
- **T1.10** (I4): `stop` twice → the second is a no-op; no double release, no double flush.
- **T1.12** (I28, §6a): the region handed to `layout()` has the same height as the transcript region, and `promptAnchor.row` equals that height — the anchor sits one row past the region's bottom edge because the prompt is not in the viewport. Asserted at the anchor, not only at the drawn frame: this is the one conversion where a region row and a terminal row differ by exactly the header's height, and at the frame an off-by-one reads as a rounding choice.
- **T1.14** (I32): a lone `Esc` reaches the router without a second keystroke — the byte is written, the injected schedule is advanced past the window, and the event arrives. The control is that no event arrives *before* the window elapses, because a test that only asserts arrival passes against a decoder that emits `Esc` immediately and breaks every arrow key.
- **T1.13** (I31): a completion source that settles after its keystroke's batch has ended commits a frame of its own, and an identity refresh does the same. Asserted as a commit count rising with no further input, because the alternative — asserting the menu is on the stack — passes against the defect: the layer was always there, and only the frame was missing.
- **T1.12b** (I29, §6a row 3): two overlapping layers → the lower one's cells outside the upper's box survive. The natural loop discards them and draws the upper perfectly, so a menu under a search vanishes entirely with nothing else wrong.
- **T1.12c** (I29, §6a row 1): a layer whose content is narrower and shorter than its box → every cell of the box is the layer's, and the prompt beneath shows through nowhere. Asserted against a small layer, because a full-bleed one passes whatever the loop does.
- **T1.12f** (I35): a transcript row selection longer than the region → `FrameError`, rather than the first `region.height` rows being kept. Constructed by hand for the same reason as T1.12d: I34 makes it unreachable through a real viewport, and it is exactly the state the shipped code was in for the whole life of the component.
- **T1.12d** (I30): a `Placed` box escaping the region → `FrameError`, and the fallback is drawn. Constructed by hand, because C15's clamp makes it unreachable through `layout()` — which is the reason to assert it rather than the reason not to.
- **T1.12e** (§6a trace row 8): a windowed prompt whose cursor is above the window → the cursor is hidden, not clamped to the window's edge. `cursorCell.row` indexes the full layout and the painted prompt shows `cap` of those rows, so the unmodified row puts the terminal cursor in the transcript.
- **T1.11** (I11): each session field is written only by its documented writer — a spy per field, all nine. `cluster` and `version` are asserted as **never written after construction**, which is the half a table with seven rows could not state.

### Tier 2 — contract / interface

- **T2.1** (I4, I5): **every exit path runs the same cleanup, exactly once** — `killAll` and `drain` each observed once, per path, whatever function got there. The property rather than the mechanism, because the mechanism differs: three callers reach `stop` and two are C01's, so no single function is shared by all five and an identity assertion has nothing to be about. The original line asserted `stop` by identity across all five and could not have passed, C01 exposing no signal hook (§8a). Identity is still asserted where it holds — the three explicit callers share one `stop` — but it is the weaker claim, and writing the property first is what stops the seam being reshaped to fit an assertion.
- **T2.1b** (I4a): the signal and fault handlers are synchronous end to end — no `await` between the release and the exit, asserted on the source rather than by timing, because the failure is a submission interleaving and a test cannot make one land in the gap reliably.
- **T2.2** (I6): on all five paths, the last release byte precedes the first diagnostic byte.
- **T2.3** (I7): history is flushed on all five paths, including a thrown exception.
- **T2.4** (I10): a source scan finds no ambient clock or `fs` reference anywhere in Calcium outside C22.
- **T2.5**: every hook in A02 §6 has a default except `theme`, and each default is exercised.
- **T2.6** (I12, TL6): `SpawnOptions.cwd` is a function; a `@ts-expect-error` rejects a string, and the function form is exercised beside it so the rule is not "nothing compiles". A captured string is correct at capture and wrong for every verb after the first `cd` — and the failure is silent, because the verb runs, just somewhere else.
- **T2.6b** (→ C01 I14): the lifecycle cannot be constructed without `onFatal` (TL7). A failed alternate screen is the only fatal case in the system, so it is the one failure that cannot have undefined handling; optional in the type, every consumer omits it and finds out when nothing can be rendered.
- **T2.7** (I7a): config validation rejects each missing required field with a named error, from `createTui` itself and before `start()` is ever called — so a bad config fails at the call site and nothing is constructed.
- **T2.8** (I21, C01 I5): `beforeRelease()` returns `undefined` — not a thenable, checked as `typeof result?.then !== "function"` rather than by awaiting, since awaiting a non-thenable passes. This is the mechanism behind the floating `killAll()`: nothing in this tree flags a floating promise and nothing flags the `await` that would "fix" it, and the resulting `async` handler fails only when a signal arrives during shutdown.
- **T2.9** (I20, SS44): the source scan finds no `PRISM_TUI_*` anywhere in `src/` — **the rule imported from the enforcement tool, not restated** (C01 T2.10's shape). SS44 matches the prefix rather than the variable, because a rule per variable is a list that grows one incident at a time and the third would be written after it shipped.
- **T2.9b** (I20): SS10's allow-list has one entry and C02 does not spend it, so the honest count of environment readers under `src/` is zero. Asserted rather than folded into SS10 by narrowing its scope: an allow-list denies by default, and a file added to `terminal/` later should argue its way on rather than inherit an allowance nobody re-examined.

### Tier 3 — edge cases

- **T3.30** (I41): `G` then `p` moves to the hunk before the *last* one, not to the hunk before the one the reader started on. The sequence that separates one cursor from two — either alone passes with a stale hunk index.
- **T3.31** (I42): the entry is patched while its view is open → the next `n` windows the **new** block. The control is that the view's content changed at all; a snapshot passes every single-motion assertion.
- **T3.32** (I42): the entry is evicted while its view is open → the layer is dismissed with `anchorEvicted`, and `Esc` afterwards reaches the prompt rather than a dangling view.
- **T3.1**: every illegal transition in §9 throws with a named error — two cases.
- **T3.19**: `stop` sets `session.stopping` before releasing, so a submission racing shutdown is refused.
- **T3.2**: `start` twice → no-op, nothing constructed twice.
- **T3.3**: `stop` during construction → nothing acquired, no cleanup attempted.
- **T3.4**: `stop` while a handed-off child is running → `beforeRelease` signals every handle in `runner.live` and **the handed-off child is not among them**, then the terminal is released.

  **The original line asserted the opposite and was unsatisfiable.** It read "the child is killed inside `beforeRelease`", and C21 deliberately does not track a handed-off child in `live` (`runner.ts`, the comment under `handoff`): that child runs in *this* process group, so signalling the group would kill the session along with it. The child receives the signal from the OS, on the same delivery that reached this process — which is why the row still ends with the terminal released and no orphan, and why the assertion is about what `beforeRelease` reaches rather than about the child's fate.

  Written as a consequence rather than an oversight, because the two read identically once the test is green: an assertion nobody can satisfy and an assertion nobody has written yet both show up as a missing test.
- **T3.5** (I36, I37): non-TTY stdout → usage printed and **non-empty**, exit 0, and no escape sequence anywhere in the stream — folded over every byte written, not matched against a prefix.
- **T3.5c** (I36): the same, with a spy on construction → **nothing is built**. On T3.8's precedent: the claim is what did not happen, and an ordering assertion cannot make it.
- **T3.5b**: non-TTY stdout with a `oneShot` verb → **unwritable, and this is the record of why**: `createTui(config)` takes no argv, so §4 step 1's parse does not happen and `oneShot` has no subject. It resolves by `oneShot` arriving through `config` with the app parsing argv (C06 I18, §12a), not by C22 growing a CLI surface.
- **T3.6**: missing config → `config init` dispatched; the shell opens afterwards.
- **T3.7** (I8): terminal 44 × 12 at launch → fallback drawn, graph constructed; resizing to 100 × 30 continues to a normal frame with state intact.
- **T3.8** (I9): the fallback renders with no call into the block registry or layout — asserted by a spy.
- **T3.9**: shrinking below minimum mid-session → fallback replaces the frame; scrollback and history survive.
- **T3.10** (I44): a greeting that never resolves → the prompt is usable and input is accepted; no entry appears. **Rewritten from "a banner fetch … renders as unavailable at its timeout"**, which described a section-level renderer C22 does not have and never did — the row was unwritable for as long as the step it tested had no mechanism, and it was the *row* that had drifted, not the code.
- **T3.11** (I44): a greeting that rejects → the session continues, the prompt is usable, and no entry appears. The failure this rules out is a startup that dies because an app's welcome could not reach its far side.
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
- **T4.7b** (I51, C19 I20): a printable key dispatched through the router with the completion menu open reaches C17, and `Enter` submits rather than accepting. **The control is the same key with no layer open**, because the defect is a dropped character and a row asserting only that the buffer is unchanged agrees with both.
- **T4.8** (with C16, C06): Ctrl-C during a pass-through forwards `SIGINT`; during a verb it cancels.
- **T4.9** (with C17): the gutter C22 passes matches the prompt it renders, so `displayRows` equals the rendered height.
- **T4.11** (I13a): header and footer receive the same `now` within one frame, asserted with a clock that advances on every read — a fake returning a fresh value per call, so two reads cannot agree by accident. A monotonic fake would pass whether the value were sampled once or twice, which is the setup where both readings agree (A03 §2).
- **T4.10** (with C13, C20): `/clear` empties the transcript and leaves history intact.
- **T4.12** (I34, with C14): a document taller than the region, scrolled to the bottom → **the document's last row is on the frame**, at three prompt heights: one row, three rows, and a prompt long enough to hit S01 §3's half-terminal cap. Asserted from the painted frame rather than from a spy on `resize`, because `TuiInstance` exposes no graph and a value read at the seam is not the claim — the claim is that the last row can be reached. Three heights and not one: at a one-row prompt the terminal's height and the region's differ by a constant, so a `rows − 3` written anywhere agrees with the right answer exactly there.
- **T4.16** (I58): one entry, drawn twice with nothing changed → the registry's `renderSequence` is called **once**. Asserted with a counting registry rather than by timing, because a timing assertion under contention is a flake and the claim is *it did not render again*, not *it was faster*.
- **T4.17** (I58): one entry, a width change and then focus entering the block and moving between two rows → a render for each. Three sub-cases and not one, because a key missing any single axis passes every assertion about the others; **two rows and not one**, because with a single row *focused* and *unfocused* are the only states and a key that merely knew whether anything is focused would pass. **`rev` is named as not driven** — it needs a stream or a `settle(id, doc)`, neither reachable from a local handler, and a second invocation makes a new entry rather than a new revision. It is C14's axis and not one this cache had to decide; the row says so rather than letting its title imply coverage.
- **T4.17d** (I58, C10 I11): `/theme light` → a render. **Its own session, because focus is stateful**: written as a fourth step of T4.17 it failed against working code, since after two `↓` the keys are going to the live block and the command never reached the prompt. `light` and not `dark` because the session starts dark and `setVariant` is correctly a no-op for the active variant (C10 T3.6) — the first draft failed on that too. Both are the fixture not responding to the thing under test, and the number each produced was indistinguishable from a key that omits the theme.
- **T4.18a** (I58): `delete` drops one slot and leaves its neighbours. **The class, not the wiring**, and the row says so.
- **T4.18b** (I58): `/clear` through the real graph drops every slot, asserted on **`size`** rather than on a render count. The first version of this row was inert and removing the arm left it green: an evicted or cleared entry is gone from the transcript and `visibleRows` never asks for it again, so a render count cannot see an eviction at all. The claim is about memory, and `Viewport.stats` is the precedent for making a cache's size observable (C14 T2.3b).
- **The `evict` arm's wiring is not drivable and the gap is named rather than papered over.** C13's cap is 100,000 blocks (C13 I17) and `construct.ts` passes no cap — `createTranscriptStore` accepts one and only `retainPayloads` is threaded through — so reaching an eviction through the real graph would take 100,001 appends. `clear` exercises the same subscription in the same wiring; the `evict` branch inside it is covered by reading. A citation reads as coverage, and this is where that would have happened.
- **T4.19** (I59): a 2,000-line block drawn for the first time renders every line, and the second frame renders none — **the stall stated as a test**, so a later reader who finds this stage and stops has an executable statement of what it did not do.
- **T4.13** (I55): a keystroke into a settled session writes **fewer bytes than the frame it produced**, and the screen folded from every write equals the frame `paint` composed. Two assertions and neither is sufficient alone: the byte count alone is satisfied by a diff that drops rows, and the screen equality alone is satisfied by writing everything. The screen comes from `test/support/screen.ts`, which is verified against its own control before anything is read through it.
- **T4.14** (I55): a `SIGWINCH` writes the frame **whole** even when the composed rows are identical to the last — the terminal is resized to the size it already holds, so C14 refuses the resize (C14 I21) and the rows cannot differ, and `contaminated` is the only thing that can produce the repaint. The row that makes contamination a claim about the *screen* rather than about the frame.
- **T4.15** (I56): a write that throws, then a successful frame → the successful frame is **whole**. Asserted with `FakeStdout.throwOn`, which is what makes the fault path constructible at all; without I56 the record survives the throw and the next frame diffs against a screen holding a prefix of a frame nobody has.

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
- **T6.25** (I28): widening the layer region back to the whole terminal → T1.12 and T1.12d fail, and a pushed view covers the header, the prompt and the footer. Nothing in §3's arithmetic can see it.
- **T6.29** (I32): moving the empty-batch guard back above `arm()` → T1.14 fails, and `Esc` does nothing until the next key. Every unit test of C16's decoder passes throughout: it reports the deadline correctly and nobody polls it.
- **T6.28** (I31): dropping the commit from the completion continuation → T1.13 fails, and the menu appears only when the next key is pressed. Every unit test of C19, C15 and C16 passes throughout, because each half is correct and no frame is composed between them.
- **T6.26** (I29): compositing each layer onto the base rows instead of the accumulated ones → T1.12b fails, and the lower of two layers vanishes with the upper drawn correctly.
- **T6.27** (I29): writing only the glyphs a layer's blocks produced → T1.12c fails, and text bleeds through a menu in a way that reads as a C09 defect.
- **T6.32** (I36): moving the gate below `constructGraph` → T3.5c fails. T3.5 still passes — the usage still prints and the process still exits 0 — so the ordering claim needs the spy or nothing states it.
- **T6.33** (I37): pointing the gate at `/help` → T3.5 fails on the register, and a piped invocation answers with `↑↓ rows` and `esc prompt` for a caller that has no keyboard.
- **T6.30** (I34): restoring the terminal's height as the viewport's — either in `#render` or by putting `resize` back in the `onResize` handler → T4.12 fails, and C04 T5.1 fails at the foot of the document. **The third instance of one class**, and the two before it were both found by a row rather than by reading: `overlayRegion` was set to `size.rows` and a pushed view covered the header, `promptRows` was composed from one record and painted from another and a wrapped prompt drew as a lone `⋯`. Each is a value that is the terminal's where the spec says the region's, self-consistent everywhere until something compares the two.
- **T6.31** (I35): restoring the truncation in the transcript region → T1.12f fails, and T6.30's defect goes back to being invisible. It is the pair that matters: the refusal is what makes a mis-sized viewport observable, and neither the refusal nor the drift test existed while the defect did.
- **T6.32** (I38): composing the indicator from C19's `pending` rather than `spinning` → T1.18 fails at *not yet*, and the spinner appears the instant `Tab` is pressed, which is the one thing C19 §7's threshold exists to prevent. **This is the read half's mutation, and it is not the one the invariant was first written against.** Caching the value at request time turns out not to be expressible: `#paintDeps` is rebuilt on every render, so a cache inside it *is* a fresh read, and the mutation fails nothing. Recorded as a fact about the shell rather than repaired — the same disposal as C03 T5.4's width — and the wording above names *a fresh read on every paint* because that is what the code does, while the assertion that can fail is about the threshold.
- **T6.35** (I40): writing the variant at exit instead of on the change → T1.19 still passes on a clean stop and the preference is lost to every crash, so the row drives the write and then constructs a second session **without stopping the first**.
- **T6.37** (I51): removing the forward → T4.7b fails, and typing stops the moment the menu appears — which the as-you-type menu makes unavoidable and `Tab` alone made survivable.
- **T6.36** (I40): treating an unreadable `theme` file as fatal, or as silently absent → T1.19b fails on the notice or on the session opening at all. The two halves of C20's repair, arriving one component up.
- **T6.34** (I39): removing the `cancel()` from the printable path → C19 T5.2 fails on its last assertion, and a menu opens for a prefix the user has typed past. The effect table's own `mine !== seq` guard does not cover it: a printable keystroke does not advance that sequence, which is why the guard looked like the mechanism and was not.
- **T6.33** (I38): dropping the wake armed at the threshold → T1.18 fails at *drawn by nothing the user did*, on the frame that arrives with no further input, and the spinner appears only once the user types again. The same symptom as an unarmed decoder deadline (I32), through a different timer — which is why it is a separate row rather than a second clause.
- **T6.41** (I58): dropping `focus` from the key → T4.17's focus case fails, and moving the selection down a table leaves the highlight where it was until something else moves the entry's `rev`. The mutation nothing else catches: `rev`, width and theme are all unchanged, so every other row agrees.
- **T6.42** (I58): dropping the theme identity from the key → T4.17's theme case fails, and `/theme light` repaints the chrome while the transcript keeps its dark colours. C03's `invalidate` still fires, which is what makes this survivable-looking: the *frame* is repainted from a cache that was not.
- **T6.43** (I58): keying on `(entryId, rev)` alone — C14's key minus width, which is the key F90 proposed → T4.17's width case fails, and a resize redraws the transcript at the old wrapping.
- **T6.44** (I59): deleting T4.19 → nothing fails, and that is the point of the row: it is the only executable statement that this stage leaves the first frame alone.
- **T6.45** (I58): removing the `clear` arm from the subscription → T4.18b fails. **It did not fail the row this replaced**, which asserted a render count: the mutation was applied, the suite stayed green, and the survivor is what said the assertion was about the wrong thing.
- **T6.38** (I55): handing C03 the same callback for `render` and `repaint` — which is what the tree did before this — → T4.14 fails, and a `SIGWINCH`, a `SIGCONT`, a handoff and a theme change all diff against a screen nobody knows. The mutation is a deletion of two lines and it restores a state in which C03's entire invalidation mechanism, and the comment in `frame-scheduler.ts` reasoning about it, reach nothing.
- **T6.39** (I56): setting the record after the write instead of clearing it before → T4.15 fails. Nothing else does: every frame on a healthy path is identical under both orders, so this is a row about the fault path or it is not a row at all.
- **T6.40** (I55): converting to CUP's 1-based form at the call site as well as inside `cursorTo` → T4.12 fails with the screen lagging its input by exactly one frame. **Found by a test rather than by reading**, and `escapes.ts` had already written the warning: *one place to be off by one, and it is the place with the test*. Every row landed one down and one right, and the frame produced was internally consistent.
- **T6.24** (I13): putting `now` on `SessionSnapshot` → T1.11 fails, because a field written on every frame has no writer §5's table can name.

---

## 12a. Theme persistence

**`/theme light` survives a restart, and it is C22's.**

It was unowned for four components. C10 T4.5 and T4.6 asserted persistence and were deferred on `L4` — waiting four layers on work nobody had agreed to do — and this section recorded the assignment without doing it, on the grounds that it was C23's branch and C23 was already carrying the project's largest expiry. That reasoning expired with the branch: an acknowledged-backlog entry surviving the completion of the layer it was deferred within is exactly the accumulation TD0's equality exists to prevent.

**It is C22's rather than C10's, and that is the load-bearing half.** C10 resolves themes and is a pure function over tokens; persistence is session state with a filesystem behind it. A store reaching a disk from L1 is MG23's neighbourhood, and the shape already exists one layer up — C20's history is a store with a file behind it through the injected `fs` (I10), and `stateDir` is already injected for exactly this kind of thing.

One value, one file: `${stateDir}/theme`, holding the variant.

**A corrupt file keeps the base theme and commits a notice** (I40). That is C20's precedent rather than a new decision — history repairs a corrupt file at open rather than failing — and the reasoning transfers whole: a session that refuses to start because a preference file has a stray byte in it has made a preference into a dependency. Anything that is not one of the two variants is treated as absent, and the notice is what stops "absent" and "corrupt" looking the same to a user who chose light and got dark.

**The write is on the change, not on exit.** A session killed by `SIGKILL` runs no shutdown path (C01 §5's ninth row), and a preference that survives a clean exit and not a crash is one people stop trusting. `/theme` is rare enough that a write per invocation costs nothing worth measuring.

---

---

## 13a. A verb whose result is a view — the ruling §13 reserved

§13 held this open through four stretches and warned that **a partial producer is the most
likely thing to be mistaken for a resolution**. It was right to wait: C25's fullscreen patch
looked like a producer and answers none of the questions below, and the first attempt at
this ruling read S3's drawing as an *affordance* and had to be withdrawn against
`B03_drill_chain.md` §2 (FINDINGS F21b).

The concrete case is docker-tui's S3 — `⏎` on a `ps` row `fill`s the prompt with
`/ps <uuid> --watch`, and the next `⏎` submits it. The general rule falls out of it; it was
not reasoned in the abstract, because S1 was drawn that way and contradicted I9.

### What makes a verb's result a view

**A01 D4's test, and the framework already has it**: *live vs pushed is decided by input
ownership — a pushed view takes letter keys while the prompt would otherwise hold focus, so
the prompt must go.* S3 binds `n`/`p`, `L` and `d`; S12 binds `l`, `g`, `G` and `/`. Nothing
new is invented here. What was missing was never the test — it was **who applies it, and
when**.

### Who decides, and why it cannot be the adapter

**The manifest, read before the verb runs.** Not the adapter, and this is forced rather
than preferred:

- **C23 I3 — the pending entry is appended before the transport is invoked** (`§4` step 3
  before step 4). By the time an adapter has seen a result and could say *this wants the
  screen*, its entry is in the transcript.
- **C13 has no delete, and C23 §8a A4 already ruled that it must not gain one.** So the
  entry cannot be withdrawn.
- **B03 §2 says a push leaves the transcript untouched.**

Those three cannot hold together with an adapter-side decision. The tier must therefore be
known **before step 3**, and the only thing known before a verb runs is its declaration.

This is the same argument, and the same party, as `ToolDef.interactive`: *"the app author is
the only party who can know this. Detection is not available."* A view is a handoff of input
ownership exactly as a TTY handoff is, so it is declared where that one is.

**Both a tool and a flag may declare it, and the invocation is a view if either does.** One
rule, two declaration sites, because the surfaces need both: `/dashboard` is a verb, while
S12's `--logs` and S3's `--watch` are flags on `ps`, and a verb-level field alone cannot
express a tool whose tier depends on how it was invoked. C05 I20 holds the field and its
refusals.

### What `Esc` does to the source entry

**Nothing, because there is no source entry.** The decision precedes step 3, so no pending
entry is ever appended: the transcript is untouched in the strong sense B03 §2 means, and
`↑⏎` re-runs the line from history like any other.

Selection survives for a reason already in the tree rather than a new one — **C16 I2 resets
focus only on append**, and no append happens. A01 D7 is satisfied by the absence, which is
what B03 means by *"reversing a push touches the transcript exactly as much as making one
did."*

**The command is still recorded in history**, which is not a contradiction: history is
C20's line store and not the transcript, and a view the reader cannot re-open from `↑` would
be a surface reachable exactly once.

### Who owns the scroll offset

**The view's owner, which is a shell-side component, and C15 gains nothing.** C15 §183 is
already explicit — *"A view's content is already the region's worth, and C15 does not scroll
it. The owner windows it"* — and says why: an offset there is a second scroll model beside
C14's, which A01 D3 spent a decision avoiding.

What did not exist is an owner for a document that is not a patch. `patch-view.ts` owns one
for `Patch` blocks and refuses everything else (`its `open` returns a refusal for any other
kind`), so the ruling names its sibling: a **document view**, holding I41's one piece of
state — a row offset — over a `ViewDocument`'s blocks.

I41 and I42 were written for the patch view and are now the general shape: one offset and no
second cursor; rewindowed from what the host holds rather than snapshotted.

### What is on screen while the verb runs

**The view is pushed at step 3's moment and its content is replaced when the document
arrives.** Neither §13's three questions nor the fourth asks this, and it falls out of the
answers: step 3 exists so that *something is on screen before the transport is invoked*
(C23 I3), and ruling the pending entry away removes that without saying what takes its
place. A consequence between two rulings, owned by neither — so it is ruled here rather
than discovered when a slow verb looks like a hung terminal.

The view replaces the entry **one for one**, and the ordering is unchanged: pushed before
step 4, filled after it. C15's `update` is the mechanism and needs nothing new — it is what
the part-refresh driver already uses on this host (C23 §3b), and §2's transition table has
four states of which `update` changes none.

Three things follow, and each closes a hole the pending entry used to cover:

- **A failing verb renders its error into the view**, because the view is where the reader
  is looking and the transcript has nothing to show them. `Esc` still pops, and still
  appends nothing.
- **A cancelled view pops**, which is the one case where the reader gets no record at all.
  That is deliberate and is the cost B03 §2 already names: *"a logs excursion leaves no
  transcript record, because the push that opened it left none either."*
- **The push cannot be deferred until the document is in hand.** That reading is tempting
  and wrong for the same reason step 3 precedes step 4 — feedback that waits for the work
  is feedback the slow case never gets, and the slow case is the only one that needs it.

### How a view windows what it holds

**C25 I18's shape, already ruled — cited rather than invented.** *"A window is a `Patch`,
not a list of rows. `Layer.content` is `Block[]`, so the owner of a pushed view cannot hand
C15 a slice of rendered output — it hands back a smaller block, and C15 measures and draws
it through the same registry as everything else."* The document view is that sentence with
`Patch` replaced by a block sequence: the owner holds the whole document and an offset, and
puts on the layer the blocks that fit.

**The window falls on block boundaries.** A block is included or it is not, and I46's one
piece of state indexes blocks rather than rows.

**And the window is measured as a sequence, not a block at a time.** A rendered sequence
separates its blocks, so *n* blocks occupy *n* rows more than the sum of their heights — and
a projection that adds `measure(block)` one at a time packs nearly twice what the region
holds, which C15 then cuts in silence. The registry has `measureSequence` for this and C14
is already given it; the document view was handed the per-block one and nobody noticed
until a surface arrived whose blocks were numerous enough for the error to be visible.

**It was invisible for the same reason S3's granularity was**: with four blocks the
discrepancy is four rows against a region with room to spare, and with 103 it is 103. A
defect proportional to a count that every existing surface kept small reads as correct until
one does not — and no arithmetic finds it, because both sides of the comparison are the
code's own. It was found by reading a frame and seeing a blank row between every block.

**The plot is atomic for windowing, permanently.** C12 I1 makes a plot's height a function
of the block alone and puts the series deliberately out of reach — *"a 200-epoch run's block
is the same height as a 10-epoch one"* — so reducing a plot's data changes nothing about its
height, and reducing its `height` **rescales the curve** rather than windowing it. There is
no version of this that yields the top half of a plot.

So the upgrade path is **granular where the kind divides, atomic where it does not**, and it
is written that way on purpose: *row-granular scroll* is a promise C12 I1 forbids for the one
block S3 leads with, and a spec that offered it would be describing something no
implementation can deliver.

**Per-kind reducers are shape-available and unwritten.** `table`, `keyValue` and `panel`
divide at rows and children with no mid-row slicing and no measurer change — which is why
this is not the mid-row option, whose cost lands on the measurer, the one thing that must
never drift. But `windowPatch` needed a dedicated file and a concept of indivisible *units*
to get right, and each further reducer is that work again. They are deferred until a
consumer forces one, in the same way and for the same reason as everything else here.

**The deferral is measured rather than assumed.** S3 filled measures **30 rows at 120 and at
80**, and a view fills the region (C15 §4), so at any realistic terminal height nothing is
out of view and the granularity is invisible for this surface:

```
width 120: TOTAL 26  [keyValue#container-head=2  panel#cpu=14  panel#io=7  panel#details=3]
width  80: TOTAL 26  [keyValue#container-head=2  panel#cpu=14  panel#io=7  panel#details=3]
```

**26 as declared, 30 once the parts fill**, and the difference is not slack: `details` is
declared holding the framework's `loading…` placeholder and grows to four rows of key-values
when its one-shot fetch returns. So the figure a measurer sees before anything ticks is not
the figure the terminal shows, and for a surface near the region's height the safe one is
the larger. Both are read from the built application — 26 through the same registry C15
measures with, 30 counted off a replayed capture at each width.

**The figure was 21 and named three blocks that were never built** (`memnet-panel`,
`ports`). It was an estimate of the drawing, taken before S3 existed, and it survived into a
sentence beginning *measured rather than assumed*. The built surface has four blocks, three
of them bordered panels, and an eight-row plot. The conclusion is unchanged and the margin
it had was half what this claimed.

And the attempts before *that* returned **13**, measured against a registry holding no plot
definition (`registry.ts` — *"`table`, `plot` and `patch` are not here"*). The same fault
recurred while correcting this passage: a fresh probe answered **17**, because
`createBlockRegistry()` alone still has no plot and the shell registers it separately at
`construct.ts:297`. A probe built on the framework's defaults is measuring a different
application than the one that runs, and the number it returns is plausible every time.

### The block that does not fit, and the pair that makes it honest

**S3 was the surface where the granularity was invisible, and it is not the general case.**
docker-tui's `/inspect --raw` is the first consumer with more content than region — a real
`docker inspect` is **245 rows against a 37-row region** — and it found that the ceiling
above has a floor beneath it.

Two rules meet here and neither is wrong on its own. The window falls on block boundaries
(I46), and the projection emits **at least one block whatever its height**, because a block
taller than the region would otherwise window to nothing and an empty view is
indistinguishable from a broken one. Together they mean **a single tall block is shown, cut,
and unscrollable**: the offset indexes blocks, so with one block there is no second offset
to move to and the motion is *refused* rather than unhelpful. The reader presses a
documented key and nothing happens.

**The consumer's half is to split, and splitting has a floor.** An app that emits one block
per top-level key takes the unreachable rows from 208 to 77; splitting a second level
wherever a block still overflows takes them to 0, at 103 blocks. But the rule does not
terminate: a leaf with no children to split by — a `Config.Env` of 300 variables, **302
rows** — has no smaller form that is still that leaf, and one block per string is 300 blocks
with the structure gone. So a producer can promise zero unreachable rows **for every document
whose leaves fit**, and not in general.

**So the ruling is a pair, and neither half is sufficient.** The owner splits what it can,
and the view **reports what it could not**: when C15 places the layer truncated, the view
says so on screen. `Placed.truncated` already carries the fact — C19's menu reads it and
draws `N more` (C19 §5) — and until this consumer the document view cited that field as the
mechanism reporting its overflow without ever reading it.

The failure mode is why the second half is load-bearing rather than decorative: **content
stopping mid-object with no indicator is indistinguishable from content ending.** A reader
who is told the frame was cut goes looking; a reader who is not, stops. Stating the two as
one ruling is deliberate — split alone leaves a silent residue, and the indicator alone
leaves a document nothing can cross.

**A comment citing a mechanism is evidence its author knew of the mechanism, not evidence
the file uses it.** That is the general form of how this was missed, and it is worth the
sentence: the file named `Placed.truncated`, named what it was for, and had no consumer of
it, which reads exactly like a file that reads it.

### The obligations a route carries, and the one that is not yet built

**`runIntoView` was written new rather than derived, and inherited whichever
obligations its author noticed.** That is not a remark about care: `declareLive`,
`release` and `cancelInFlight` were each entry-only, each found one at a time, and each
looked like an isolated oversight. Three samples of one cause. The entry route's
obligations are therefore enumerated against the view route rather than recalled, and the
`n/a` rows carry reasons — *"the view route does not need that"* is the assumption that
produced the first three.

Two of those reasons are worth keeping here, because both are rulings rather than notes:

- **`resetFocus` is not called, and calling it would be a defect.** It exists because an
  append freezes the previous entry and focus must not remain in a frozen block. The view
  route appends nothing and freezes nothing, and A01 D7 requires the selection to survive
  the push and be intact on the pop. The absence is the invariant, not an omission.
- **A cancelled view pops rather than settling**, since there is no entry to settle. The
  reader gets no record, which is the cost B03 §2 already names for a logs excursion.

**`view` with `streams` is the fourth route, and it is now built** (I48). It was reserved
here through one stretch, refused loudly at run time rather than silently, and taken by the
first consumer concrete enough to force it: docker-tui's S9 `/logs`, where `docker logs -f`
is a stream with no natural end and A01 D4's test makes it a view.

The reservation was right and the refusal was the right shape. Both are kept below, because
*what it refused to guess* is the useful record — the pair currently fell to the
non-streaming path, blocked until the process exited, and **held the submission guard for
the whole of it**, which is precisely what C23 I6 exists to prevent. A silent version of
that would have been found by a reader watching a shell stop accepting input.

**Three obligations have no equivalent on this route, and the ruling on each is what makes
it a route rather than a copy.**

- **The patch has nowhere to go.** `streamInto` calls `transcript.patch(id, view)`; the
  owner has `putBlock(id, block)`, which replaces an existing block and refuses one it does
  not hold — so a stream's first `append` would be refused and every `/logs` patch with it.
  The owner therefore gains **`patch(view: ViewPatch)`, applied through C04's `applyPatch`**:
  the same pure function C13 itself calls, so the view and the transcript cannot disagree
  about what a patch means. This is I46's *no second height codepath* argument pointed at
  patching. `putBlock` stays and is not merged with it — the refresh driver holds a total
  contract that returns `false`, and `patch` reports C13's three-armed outcome because that
  is what the streaming loop branches on.
- **A view cannot settle, and must not pop when the stream ends.** `docker logs` without
  `-f` ends immediately, and a view that popped on `end` would flash and vanish before
  anything could be read: **the stream ending is not the reader having finished with it**,
  and B03 §2 already makes the pop the reader's. So `end`, a malformed patch and a stream
  failure all collapse to the same shape — *append a notice, stop consuming, leave the view*
  — and only the wording differs. `refresh.settled` still fires, because the stall machinery
  is per-host and only `transcript.settle` has no counterpart here.
- **An append keeps the window at the bottom when the window was at the bottom.** A follow
  whose window does not move shows its first screen and nothing after it, so the output the
  reader asked to watch — and the terminal notice above it — are both below the fold for
  ever. **Only when it was already at the bottom**: a reader who has scrolled up is reading,
  and moving the window under them is the same failure in the other direction. This is tail
  semantics, and it belongs to the owner rather than the route, because the owner is what
  knows where the window is.

  It is ruled here because **neither walk artefact reaches it.** A rule about what a frame
  *contains* is invisible to a table indexed by obligations and to a trace indexed by
  events — the fifth recorded blind spot, and the third surface it has caught. Found by
  reading a frame in which a stopped container's follow showed twenty-six lines of start-up
  and no sign that anything had happened since.
- **The subscription is keyed by `DOCUMENT_VIEW_ID`.** There is no entry and so no pending
  id, and this is the name `refresh` already uses for the view host, so `liveStreams`, the
  refresh registry and the overlay agree without a fourth. C15 I1 makes it unique while it
  exists.

**And one obligation is a severity higher here than on the entry route.** Registering the
canceller in `liveStreams` before the loop is awaited gives the verb C16 §5's newest-first
rung. Omit it on an entry and a Ctrl-C fails to cancel; omit it here and Ctrl-C falls past
the rung and **quits the session**, because the view's loop is the only thing on screen. The
asymmetry that falls out of the same rung: **a cancelled view pops and a finished one does
not** — Ctrl-C is the reader saying stop, `end` is the far side saying it.

### What the decision leaves behind when it throws

Asked because a ruling's rejection path is where it leaves state, and neither a trace nor a
table indexes it (C13's `settle(id, doc)` is the measured case).

- **A refused declaration throws at parse**, where C05 I19 already puts `interactive`'s
  refusals — before a session exists, so there is no half-built state to leave.
- **A push that fails leaves no entry**, because none was appended. This is the property
  that makes the ruling safe rather than merely tidy: the failure mode of an adapter-side
  decision would have been an orphaned pending entry that nothing could settle or remove —
  C23 I9's forbidden state, two components from the decision that produced it.
- **The owner's `putBlock` is total.** It patches the held document and reprojects the window, and a reprojection that threw after the document had been updated would leave the owner holding a document no frame ever displayed — the same two-step hazard as C13's `settle(id, doc)`, in a component two removed from the driver that called it. So it reprojects into a local, assigns both, and returns `false` rather than throwing; the driver's existing `false → release(host)` covers the other side.
- **A pop while parts are in flight** is the one real hazard, and it belongs to the producer
  rather than to this ruling: release must happen at the pop and not one tick later, or a
  fetch resolves into a layer that has gone. C23 I33's teardown set gains the trigger.

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
| ~~A verb whose result is a pushed view~~ | **Taken — §13a.** Reserved through four stretches and settled by the first consumer concrete enough to force it: docker-tui's S3, a live single-container view reached the way S12's logs view is. The row stays in the table, struck through rather than deleted, because *what it refused to guess* is the useful record |
