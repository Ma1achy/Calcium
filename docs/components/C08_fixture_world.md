# C08 — Fixture world

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` (harness) + `prism-tui` (world). Same split as C05 and C07 |
| **Layer** | L0 data (harness) · L5 app (world) |
| **Depends on** | C06 (`Invocation`, `RawResult`, `RawPatch`, `FixtureHandler`) · C05 (`Manifest`, for the `__manifest__` endpoint) |
| **Consumed by** | C06's fixture transport · the demo build · every adapter test |
| **Source** | A01 S20–S24, §5, §6 · A02 §6 |
| **Status** | Draft |

---

## 1. Purpose

C08 is the emulated far side. With it, the whole application runs, demos and tests with no Python, no cluster, no config and no network — which is what makes the package genuinely standalone (S20) and what turns the wiring step into flipping a default.

**The trap this component exists to avoid.** A hand-authored fixture is written against a schema, so it agrees with that schema by construction. It will keep agreeing forever, including after the real tool's output has diverged — the adapter passes green against a fiction while the live system is broken. This is precisely the failure mode of authoring a fake to match a contract rather than exercising the real one, and it is worth being blunt about because a fixture world is the most natural place in the whole project to reintroduce it.

**So fixtures are recordings, not compositions.** The primary corpus is captured from the real CLI and replayed byte-for-byte. Authoring is reserved for the cases recording cannot reach, and those are marked as such and counted.

**And the corpus is what tests run against — never the world** (C06 I17). The world is animated so that live views, progress bars, sparklines and follow-tail behaviour are exercised while developing; the corpus is static so that assertions have something fixed to be true about. Letting the world serve tests would make the world the thing tests agree with, which is the same fiction one level up.

---

## 1a. What is kit and what is app

The generic half is everything the docker reference app would want identically; the app half is the domain.

| Half | Package | Contains |
|---|---|---|
| **Harness** | `tui-kit` | `Fixture` type and provenance model · the record/verify tooling · redaction · the seeded RNG · the resolver · mode handling |
| **World** | `prism-tui` | Runs, deployments, model versions, secrets · their transitions · the seed corpus ported from the mockup |

Without this split every consuming app reimplements recording and determinism, which is the machinery most likely to be got wrong.

```typescript
// harness — tui-kit
function createFixtureHandler(opts: {
  fixtures: readonly Fixture[];
  world?:   WorldDriver;
  mode?:    "frozen" | "stepped" | "live";
  clock?:   () => number;             // required iff mode === "live"
  manifest: Manifest;                 // answers the B6 endpoint
}): FixtureHandler & { advance(deltaMs: number): void };

// world — the app implements this
interface WorldDriver {
  query(inv: Invocation): RawResult | AsyncIterable<RawPatch> | null;   // null = cannot answer
  advance(deltaMs: number): void;
  reset(seed: number): void;
}
```

`WorldDriver` is where the mutable cell lives. **Transitions are pure; the cell holding the current world is not.** `experiment submit` computes `next = submit(current, inv)` with a pure function and then assigns — so every transition is testable in isolation while the handler still satisfies C06's stateful-looking signature.

`clock` is injected and required only in `live` mode. C08's own modules read no clock (I4); the demo build supplies one at the boundary, exactly as C03 takes an injected `schedule`.

The harness answers `__manifest__` from the supplied manifest, so a fixture-backed session satisfies B6 like any other far side.

## 2. Fixture provenance

Every fixture carries where it came from. This is the component's central invariant.

| Provenance | Meaning | Trust |
|---|---|---|
| `recorded` | Captured from a real `prism <verb> --json` run. Stored verbatim | Authoritative |
| `derived` | A recording with values substituted — timestamps, UUIDs, hostnames — under a documented transform. Every world-generated response is `derived`: shape from a recording, values from world state | Structurally authoritative |
| `authored` | Written by hand. Only for states the real system cannot easily produce: rare failures, race conditions, malformed output | **Suspect** |

```typescript
type Fixture = Readonly<{
  id:         string;
  verb:       string;
  argv:       readonly string[];
  provenance: "recorded" | "derived" | "authored";
  capturedAt: string | null;          // ISO; null iff authored
  cliVersion: string | null;          // the far side's version at capture
  note?:      string;                 // required for authored — why recording was impossible
  result:     RawResult | readonly RawPatch[];
}>;
```

An `authored` fixture without a `note` fails the build. The friction is intentional: authoring should feel slightly worse than recording.

**The authored ratio is reported.** A build prints the count per verb, and a verb whose fixtures are majority-authored is flagged. Not a failure — some verbs are genuinely hard to record — but visible, because the drift risk concentrates exactly there.

### Recording

```
prism-tui fixtures record --verb=ps --argv="--mine --status=running"
```

Runs the real CLI, captures stdout, stderr, exit code and timing, writes a fixture with `provenance: "recorded"`. Secrets, tokens and absolute home paths are scrubbed on the way in by a redaction pass, and the redaction is applied to *values*, never to structure.

**Re-recording is the drift check, and it scopes the work before it starts.**

```
$ prism-tui record --against /path/to/prism --scenario healthy
$ prism-tui record --diff

  ps/list-mine                 ✗  3 field mismatches
      data[].loss_history      missing in actual  →  actual has data[].metrics.loss[]
      data[].age_minutes       missing in actual  →  actual has data[].created_at
      count                    present in both, differs in type

  serving/list                 ✓  matches
  validate/failure             ✗  1 field mismatch

  14 verbs · 11 match · 3 with deltas
```

Structural differences only — new fields, removed fields, changed types. Value changes are expected and never reported.

**Every delta is one adapter line.** The reconciliation step is: run the diff, patch the adapters it names, re-run until clean, replace the authored corpus with the recorded one. Printing the count first is the point — it turns integration from an unbounded archaeology exercise into a job with a visible finish line.

`record --diff` also runs in CI once integrated, so an envelope change fails the MR that made it rather than the session that hits it. This is the same signal the conformance suite (A01 §6) provides, from the opposite direction: conformance asks whether the far side still satisfies the contract, re-recording asks whether the fixtures still resemble the far side.

---

## 3. The world

Replaying fixtures alone gives a static demo. The world adds state so the tool feels alive: a run progresses through epochs, a queued job starts, a deployment's request rate moves.

```typescript
type World = Readonly<{
  runs:        readonly Run[];
  deployments: readonly Deployment[];
  modelVersions: readonly ModelVersion[];
  secrets:     readonly Secret[];
  clock:       number;                // ms since world start
  seed:        number;
}>;

function createWorld(opts: { seed: number; scenario?: string }): World;
function advance(world: World, deltaMs: number): World;
function query(world: World, inv: Invocation): RawResult | AsyncIterable<RawPatch>;
```

`advance` is pure — same world, same delta, same result. That is what makes a demo reproducible and a test deterministic.

The seed state is ported from the existing HTML mockup: the run set, the deployment set, and the log, event, pod and pipeline generators (S22). It is a translation, not new work — but every `Math.random()` in it becomes a draw from the seeded generator, because a fixture world that is randomised is a fixture world whose golden tests are flaky.

### Modes

| Mode | Clock | Used by |
|---|---|---|
| `frozen` | Never advances | Adapter tests, golden frames |
| `stepped` | Advances only on explicit `advance()` | Integration tests, streaming tests |
| `live` | Advances on a real timer | The demo build |

`frozen` is the default. A test that wants motion asks for it.

### Mutations

Verbs that change things change the world: `experiment submit` adds a queued run, `promote` adds a deployment, `serving scale` alters replicas, `cancel` transitions a run. Without this, the demo cannot show a workflow — and the workflow is what a demo is for.

Mutations are pure transitions returning a new world, and they are the one place fixtures cannot be pure recordings, since the response depends on prior state. They are `derived`: the response *shape* comes from a recording, the values from the world. A `derived` response that does not structurally match its source recording is a bug, and T2.8 checks it.

---

## 4. Query resolution

```
1  an exact fixture matches verb + argv          → replay it
2  the world can answer the verb                 → generate from world state
3  otherwise                                     → a recorded generic failure for that verb
```

Route 3 matters: an unfixtured verb returns a plausible failure rather than hanging or throwing, so the demo degrades instead of breaking mid-presentation.

---

## 5. Invariants

- **I1** — Every fixture declares provenance; `authored` requires a `note`.
- **I2** — Recorded fixtures are replayed byte-for-byte. No normalisation at replay time.
- **I3** — The world is deterministic: `createWorld(seed)` then any sequence of `advance` produces an identical world for the same seed.
- **I4** — No `Math.random`, no `Date.now`, no ambient clock anywhere in C08. Lint-enforced. `live` mode takes an injected `clock`; the ban is on *ambient* time, not on time.
- **I5** — `advance` and every mutation are pure, returning new values.
- **I6** — Default mode is `frozen`.
- **I7** — Every query returns something. No verb hangs, throws or returns nothing.
- **I8** — Fixtures contain no secrets, tokens or absolute home paths; redaction runs at capture.
- **I9** — The world half is app-side. `tui-kit`'s harness imports nothing from `prism-tui`; the coupling is the `WorldDriver` interface alone.
- **I10** — Every `derived` response is structurally identical to the recording it derives from — same keys, same types, different values.
- **I11** — The harness answers `__manifest__` (B6) from the supplied manifest.
- **I12** — The world's output satisfies the same contract the real CLI does (A01 B1–B8), so an adapter cannot pass against fixtures and fail against reality for contract reasons.
- **I13** — All three transports are substitutable: any test not concerning spawning passes against each (C06 I14).
- **I14** — The world backs `EmulatedTransport` only. No test path reaches it.
- **I15** — `record --diff` reports structural deltas only, and prints a count before any work begins.

---

## 6. Commitments

1. Fixtures are recorded from the real CLI; authoring is the exception, marked, justified and counted.
2. An authored fixture without a note fails the build; the authored ratio is reported per verb.
3. `fixtures record --verify` re-runs recordings against the current CLI and reports structural drift.
4. The world is seeded and fully deterministic; nothing in C08 reads a clock or a random source.
5. `advance` and mutations are pure transitions.
6. Three modes — frozen, stepped, live — with frozen the default.
7. Mutating verbs mutate the world, so a demo can show a workflow end to end.
8. Every query returns something; an unfixtured verb degrades to a plausible failure.
9. Capture redacts values, never structure.
10. C08 is app-side; the framework's only coupling is the handler closure.
11. World output satisfies the same boundary contract as the real CLI, including the `__manifest__` endpoint.
12. The world backs development only; tests run against the recorded corpus.
13. `record --diff` scopes the reconciliation before it starts — every delta is one adapter line.
14. The harness is `tui-kit`; the world is the app's. Apps implement `WorldDriver` and get recording, determinism and redaction for free.
15. World transitions are pure; only the cell holding the current world is mutable.
16. `live` mode takes an injected clock; nothing in C08 reads ambient time.

---

## 7. Tests

Six tiers. **No state machine** in the A02 §7 sense: the world holds state, but its transitions are a data model rather than a lifecycle — there is no operation that is legal in one state and illegal in another. The harness's mode is fixed at construction. §3's operations are therefore covered by property tests rather than a transition table.

### Tier 1 — unit

- **T1.1** (I3): `createWorld({seed: 42})` twice → deeply equal worlds.
- **T1.2** (I3): the same seed and the same `advance` sequence → identical final world, run for a thousand steps.
- **T1.3** (I3): different seeds → different worlds, but both structurally valid.
- **T1.4** (I5): `advance` returns a new world; the input is unchanged and still frozen.
- **T1.5**: a running run advances epochs over time; loss decreases monotonically; it reaches `succeeded` at its epoch total.
- **T1.6**: a queued run transitions to running after its scheduled delay.
- **T1.7**: each mutating verb produces the documented world change — six cases.
- **T1.8** (I6): a world created with no mode is `frozen`; `advance` is required for any motion.
- **T1.9** (I7): a verb with no fixture and no world support → a failure result, not a throw.
- **T1.10**: §4 resolution order — a verb with both a fixture and world support replays the fixture.
- **T1.11**: `WorldDriver.query` returning `null` → the resolver falls through to the generic failure.
- **T1.12** (I5): a mutation computes a new world purely, then the cell is assigned; the previous world value is unchanged and still usable.
- **T1.13** (I4): `mode: "live"` without a `clock` → construction throws; with one, `advance` is driven by it and by nothing else.

### Tier 2 — contract / interface

- **T2.1** (I1): every fixture in the corpus has a provenance; every `authored` one has a non-empty note. Build-time.
- **T2.2** (I12, the important one): every fixture — recorded and authored alike — satisfies the A01 B1–B8 boundary contract, asserted by the **same** conformance suite that runs against the real CLI. Fixtures are held to the contract, not merely to a schema.
- **T2.3** (I4): a source scan finds no `Math.random`, `Date.now`, `new Date()` or `performance.now` in C08.
- **T2.4** (I13): the C06 tier-1 and tier-3 suites pass against the fixture transport.
- **T2.5** (I8): no fixture matches the secret, token or home-path patterns.
- **T2.6** (I9): the module graph shows `tui-kit` importing nothing from `prism-tui`.
- **T2.7** (I2): each recorded fixture's stored bytes equal what replay emits.
- **T2.8** (I10): every `derived` response is structurally identical to its source recording — key sets and types compared, values ignored.
- **T2.9** (I11): `__manifest__` through the fixture handler returns the supplied manifest and satisfies C05's parser.
- **T2.10** (I9): the module graph shows the `tui-kit` harness importing nothing from `prism-tui`; the reference app supplies its own `WorldDriver` and reuses the harness unchanged.

### Tier 3 — edge cases

- **T3.1**: `advance` with delta 0 → world unchanged.
- **T3.2**: `advance` with a very large delta → runs complete rather than overshooting into invalid states.
- **T3.3**: `advance` with a negative delta → rejected, not silently reversed.
- **T3.4**: cancelling an already-succeeded run → the documented refusal, matching the real CLI's.
- **T3.5**: promoting a run that is not a succeeded candidate → the refusal shape from the recorded fixture.
- **T3.6**: two mutations against the same base world → independent results; neither observes the other.
- **T3.7**: a streaming query cancelled mid-iteration → terminates, and the world is untouched.
- **T3.8**: a fixture whose `result` is a patch array → replayed as a stream with a terminal `end`.
- **T3.9**: an empty world (`scenario: "empty"`) → every list verb returns its empty state; no verb throws.
- **T3.10**: a world at scale — 10,000 runs — → a list query returns within 50 ms, matching the Page Down budget in A02 §7 since both bound a single interaction.
- **T3.11**: a recorded fixture from an older `cliVersion` → replays, and the version mismatch is reported by `--verify`, not at replay.
- **T3.12**: an authored fixture describing a malformed stream → the adapter's degradation path is exercised. This is a case recording genuinely cannot reach, and is why `authored` exists at all.

### Tier 4 — integration

- **T4.1** (with C06, C07): every fixture adapts to a valid document passing C04's validator.
- **T4.2** (with C07): a fixture and a real recording of the same verb produce documents that differ only in values, never in block structure.
- **T4.3** (with C06): `stepped` mode plus a streaming verb → patches arrive in order, `end` last.
- **T4.4** (with L4): a full demo scenario — submit, watch progress, promote, scale — runs entirely on fixtures.
- **T4.5**: switching a single verb from fixture to subprocess mid-session (D13) → both render through the same adapter.

### Tier 5 — e2e

- **T5.1**: the whole application starts, runs every verb and exits cleanly with no Python installed. The standalone guarantee.
- **T5.2**: the demo scenario in `live` mode for five minutes → progress is visible, the world stays consistent, memory is flat.
- **T5.3**: golden frames captured against a frozen seeded world are byte-identical across a hundred runs. If this flakes, determinism is broken somewhere.
- **T5.4** (drift, I15): `record --against` then `record --diff` against a real CLI reports zero structural differences, and prints the verb count either way. Run in CI where a far side is available; skipped otherwise with the skip recorded, not silent.

### Tier 6 — fail-on-revert

- **T6.1** (I4): reintroducing `Math.random` in a generator → T2.3 fails, and T5.3 flakes.
- **T6.2** (I1): an authored fixture landing without a note → T2.1 fails.
- **T6.3** (I12): a fixture that satisfies the adapter but violates the boundary contract → T2.2 fails. **This is the test that stops the fiction problem.**
- **T6.4** (I5): mutating the world in place → T1.4 and T3.6 fail.
- **T6.5** (I2): normalising a recording at replay → T2.7 fails.
- **T6.6** (I6): defaulting to `live` → T5.3 flakes and T1.8 fails.
- **T6.12** (I14): a test reaching the world → T2.4b fails, and emulator drift starts masking regressions.
- **T6.7** (I9): `tui-kit` importing a C08 type → T2.6 fails.
- **T6.8** (I7): a query path that throws on an unknown verb → T1.9 fails.
- **T6.9** (I10): a world response that adds or drops a field relative to its recording → T2.8 fails. This is the drift the fiction problem hides behind.
- **T6.10** (I9): moving the harness into `prism-tui` → T2.10 fails, and the reference app loses recording.
- **T6.11** (I4): reading ambient time in live mode rather than the injected clock → T1.13 and T5.3 fail.

---

## 8. Out of scope

| Not here | Where |
|---|---|
| The transport interface and replay mechanics | C06 |
| Turning results into documents | C07 |
| The real CLI's behaviour | The far side |
| The conformance suite's definition | A01 §6 — C08 reuses it rather than defining its own |
| Prism's adapters | `prism-tui`, alongside but separate |
| Recording from a live cluster | Recording runs against whatever CLI is configured; where it points is the operator's problem |
