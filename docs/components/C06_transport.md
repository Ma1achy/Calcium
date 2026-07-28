# C06 — Transport

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
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

Selection is per verb (D13), which is what allows a verb to migrate to native without touching anything else, and per-mode by one factory reading one environment variable:

```typescript
type TransportMode = "emulated" | "fixture" | "subprocess";
function createTransport(mode: TransportMode, deps: TransportDeps): VerbTransport;
// PRISM_TUI_TRANSPORT; default "subprocess"
```

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
}>;

type RawPatch =
  | Readonly<{ kind: "data";      value: unknown }>
  | Readonly<{ kind: "malformed"; line: string }>
  | Readonly<{ kind: "degraded";  reason: string; remaining: string }>
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

function createSubprocessTransport(opts: {
  binary: string;
  runner: ProcessRunner;              // C21
  env?: Readonly<NodeJS.ProcessEnv>;
  cwd?: () => string;                 // live — pass-through `cd` moves it
}): VerbTransport;

type FixtureHandler = (inv: Invocation) =>
  | RawResult
  | AsyncIterable<RawPatch>;

function createFixtureTransport(corpus: readonly Fixture[]): VerbTransport;
function createEmulatedTransport(handler: FixtureHandler): VerbTransport;

function createRouter(opts: {
  default: VerbTransport;
  overrides?: Readonly<Record<string, VerbTransport>>;
}): TransportRouter;
```

`createEmulatedTransport` takes a **handler function**, not a world object. `tui-kit` must not reference an app type, and a closure keeps the fixture world entirely on the app side (C08) while the framework supplies only the interface.

`cwd` is a function, not a value. The shell's working directory changes when the user runs `cd` (C18 built-in), and a captured string would spawn every subsequent verb in the original directory.

---

## 3. Invocation

`--json` is appended by the transport, never typed by the user (D16). A user who types `--json` explicitly is asking to see the contract, and C07 renders it raw — but that is C07's decision, and C06 appends regardless so the payload is always machine-shaped.

Spawning uses an **argv array**, never a shell string (D18). No quoting, no word splitting, no injection surface. The shell is never in the loop.

### Exit and signal reporting

C06 reports faithfully and interprets nothing:

- Normal exit → `exitCode` set, `signal` null.
- Killed → `exitCode` null, `signal` set.
`argv` on the result is what was spawned, or for a fixture transport what *would* have been spawned — so a fixture-backed document reports the same reproducible command.

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
| Malformed exceeds **10%** of lines seen, minimum 10 lines | `{ kind: "degraded", … }` once, then the remainder is forwarded as raw text |
| Process exits | `{ kind: "end", result }` — always last, always emitted |

The 10-line floor matters: without it, one malformed line in the first three trips degradation on a healthy stream.

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
- **I12** — Degradation requires both ≥10% malformed and ≥10 lines seen.
- **I13** — At most one non-streaming invocation is in flight; every settlement path releases the guard.
- **I14** — Transport selection is per verb; `for()` is total and falls back to the default.
- **I15** — `FixtureTransport` and `SubprocessTransport` satisfy the same interface and are substitutable in every test.

---

## 8. Commitments

1. C06 reports; C07 interprets. No view model, no status mapping, no envelopes.
2. `--json` is appended by transport, exactly once.
3. Spawning uses an argv array; the shell is never in the loop.
4. stdout and stderr stay separate; raw stdout is always retained.
5. One escalation ladder for cancellation and timeout.
6. Partial output is retained on every abnormal termination.
7. `timeoutMs: 0` means unbounded, for live views.
8. Streaming emits exactly one `end`, always last.
9. Malformed-line degradation needs 10% *and* a 10-line floor.
10. One non-streaming invocation at a time; streams are exempt.
11. Transport is selected per verb, defaulting when unmapped.
12. Three implementations behind one interface, selected by one environment variable; nothing else branches on mode.
13. Tests run against the recorded corpus, never the emulator, so emulator drift cannot mask a regression.
14. `cwd` is read at spawn time so pass-through `cd` is honoured.
15. The fixture transport takes a handler closure; `tui-kit` references no app type.
16. Line buffering is bounded at 1 MB.

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

- **T2.1** (I15): the full tier-1 and tier-3 suites run against both transports; every assertion that does not concern spawning holds for both.
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
- **T3.12** (I12): 9 malformed lines out of 100 → no degradation. 11 out of 100 → degraded.
- **T3.13** (I12): 3 malformed out of 5 (60%, below the floor) → no degradation.
- **T3.14**: degradation fires once, not per subsequent malformed line.
- **T3.15**: stream emitting zero lines then exiting → only `end`.
- **T3.16** (I11): a single NDJSON line of 10 MB → emitted as `malformed` once the 1 MB cap trips; the buffer is released; subsequent lines parse normally.
- **T3.16b** (I11): an unterminated stream writing continuously with no newline → memory stays bounded at the cap.
- **T3.17**: binary not found → `end` with a spawn failure, `exitCode` null, guard released, no throw escaping.
- **T3.18**: the far side writes JSON to stderr and nothing to stdout → `stdout` undefined, `stderr` populated. C06 reports the mismatch, does not repair it (B3).
- **T3.19**: trailing newline absent on the final NDJSON line → still parsed.
- **T3.20** (I14, D13): `for("ps")` returns fixture while `for("promote")` returns subprocess, in one session.
- **T3.21** (I3): argv containing shell metacharacters (`;`, `|`, `$(…)`, backticks) → passed literally, no expansion, no injection.
- **T3.22**: `cwd` changes between two invocations → the second spawns in the new directory.

### Tier 4 — integration

- **T4.1** (with C21): the escalation ladder issues real signals through the runner, verified on a child that ignores `SIGINT`.
- **T4.2** (with C05): `local: true` never reaches the transport; `streams: true` selects `stream` over `invoke`.
- **T4.3** (with C07): a `RawResult` from either transport adapts to a valid document, and both produce the same document for equivalent input.
- **T4.4** (with C07): a degraded stream produces a document containing the remaining output as a `raw` block.
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
- **T6.7** (I13): releasing the guard only on success → T3.3 fails on five of six paths.
- **T6.8** (I10): parsing per chunk rather than per line → T3.10 and T3.11 fail.
- **T6.9** (I4): appending `--json` unconditionally without the dedupe → T1.4 fails.
- **T6.10** (I15): a fixture-only or subprocess-only behaviour → T2.1 fails on the shared suite.
- **T6.11** (I14): making transport selection global → T3.20 fails, and with it the incremental-migration property.
- **T6.12**: capturing `cwd` at construction → T3.22 fails.
- **T6.13** (I11): removing the line cap → T3.16b fails on unbounded growth.
- **T6.14**: typing the fixture transport against an app-defined world → the module-graph test in T2.2 fails.

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
