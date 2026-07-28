# C07 — Adapter registry

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` (registry, fallback, mapping) + app (the adapters) |
| **Layer** | L0 data |
| **Depends on** | C04 view model · C06 transport types. Both same layer, acyclic |
| **Consumed by** | L4 execution pipeline |
| **Source** | A01 D11, D12, D15, B4, B5 · A01 §5 wiring · A02 §2, §6 |
| **Status** | Draft |

---

## 1. Purpose

C07 turns what a tool produced into what the screen shows. It is where C06's faithful report becomes a `ViewDocument` — exit codes become statuses, payloads become blocks, failures become envelopes.

Three properties do the real work.

**Adapters are pure.** A JSON fixture in, a document out, no clock, no I/O, no terminal. The entire presentation layer of every verb is therefore testable in milliseconds without a cluster or a subprocess.

**The fallback always renders.** Any JSON becomes something legible, so a tool that ships on the far side tomorrow is usable tomorrow — unstyled, but usable. Without this, every new verb is blocked on TypeScript and the parallel-build claim is a lie.

**Adapters are disposable.** An adapter exists to absorb the gap between what a tool emits today and what the view model wants. As the far side converges the adapter shrinks, and when a tool emits `tui.view/1` directly the adapter is deleted and the identity path takes over. Deleting one is a success (D11).

---

## 2. Resolution order

Three routes, tried in order. This ordering is what makes disposability mechanical rather than aspirational.

```
1  stdout parses as a valid tui.view/1 document   → use it directly, no adapter
2  a registered adapter exists for the verb        → use it
3  otherwise                                       → fallback adapter
```

Route 1 means a far side that converges needs no code change at all: delete the adapter, and the identity path picks it up on the next run. Route 3 means an unadapted verb still works.

---

## 3. Public interface

```typescript
type AdapterContext = Readonly<{
  command:           string;          // as typed, for doc.command
  verb:              string | null;
  width:             number;          // some adapters choose column sets by width
  userRequestedJson: boolean;         // the user typed --json explicitly
}>;

type StreamContext = AdapterContext & Readonly<{ seq: number }>;

type Adapter = Readonly<{
  schema:      "tui.view/1";
  adapt:       (raw: RawResult, ctx: AdapterContext) => ViewDocument;
  adaptPatch?: (patch: RawPatch, ctx: StreamContext) => ViewPatch | null;   // null = ignore
}>;

interface AdapterRegistry {
  register(verb: string, adapter: Adapter): void;
  seal(): void;
  adapt(raw: RawResult, ctx: AdapterContext): ViewDocument;
  adaptPatch(patch: RawPatch, ctx: StreamContext): ViewPatch | null;
  readonly sealed: boolean;
}

function createFallbackAdapter(): Adapter;
```

The registry seals at the end of composition, matching C05's manifest store and C09's block registry. Late registration would let a document rendered early in a session differ from the same document rendered later, which is the kind of inconsistency nobody thinks to look for.

---

## 4. Status and error mapping

C06 reports; C07 decides. The mapping, in precedence order:

Evaluated top to bottom; **the first match wins**. `cancelled` outranks `timedOut` when both are set — a user-initiated stop during a timeout is still a stop.

| Condition | Status | Document |
|---|---|---|
| `cancelled` | `partial` | Whatever was produced, plus a muted "cancelled" notice |
| `timedOut` | `error` | `TIMEOUT` envelope naming the elapsed budget |
| `exitCode === 0` | `ok` | Adapter output |
| `exitCode === 1` | `error` | Envelope parsed from stdout; if absent, synthesised from stderr |
| `exitCode === 2` | `error` | Usage block from the manifest, plus stderr as `raw` |
| `signal !== null` | `error` | `KILLED_BY_SIGNAL` envelope |
| anything else | `error` | `UNEXPECTED_EXIT` envelope, stderr as `raw` |

**Cancellation produces `partial`, not `error`.** A01 B4 maps exit 130 to `error` while A01's cancellation rule says partial output is retained as `partial`; those conflict, and `partial` is right — the user asked for the stop, so it is not a failure, and the lines already shown stay useful. The `cancelled` flag from C06 is authoritative; exit 130 merely corroborates it. *(This corrects A01 §4 B4.)*

`ErrorLike` requires only `message` (C04, F3). Where the far side supplies `code`, `stage`, `details` or `remediation` they are carried through; `remediation` naming a runnable command becomes a `fill` action. A failed `promote` and a failed `validate` therefore render identically, because the same code renders both.

### Explicit `--json`

When `userRequestedJson`, the document is a single `code` block containing pretty-printed stdout, whatever the verb. The user is inspecting the contract; rendering it would defeat the request (A01 O3).

---

## 5. The fallback adapter

Total over any JSON. Never throws, never returns an empty document.

| Input shape | Rendering |
|---|---|
| Object with scalar fields | `rule` (verb name) + `keyValue` |
| Array of uniform objects | `table`, columns from the union of keys, capped at 8 by first appearance |
| Object containing one array of uniform objects | `keyValue` for the scalars, `table` for the array |
| Anything else | `code` block, pretty-printed JSON |
| Unparseable stdout | `raw` block of `stdoutRaw` |
| Empty stdout, exit 0 | `notice` — completed with no output |

Caps: **8 columns** and **2,000 rows** per generated table. The row cap matters because D40 bounds *blocks* per document, and a 50 MB payload is one enormous table block that the block cap never touches. Truncation sets `meta.truncated` and appends a notice naming the row count dropped. Column dropping at narrow widths is a separate, later mechanism (C11) — the two compose: C07 bounds what enters the block, C11 decides what fits on screen.

Nested objects render as their JSON text inside a cell rather than being flattened. Flattening invents structure the tool did not declare, and a wrong table is worse than an honest blob.

---

## 6. Streaming

`adaptPatch` maps C06's `RawPatch` to C04's `ViewPatch`:

| `RawPatch` | `ViewPatch` |
|---|---|
| `data` | Adapter's mapping, or `append` of a fallback block |
| `malformed` | `null` — ignored, already counted by C06 |
| `degraded` | `append` of a `raw` block carrying the remainder |
| `end` | `status` patch, plus any terminal blocks |

An adapter without `adaptPatch` still streams: each `data` patch goes through the fallback, which appends a block. Streaming therefore works before anyone writes a stream adapter.

---

## 7. Failure containment

An adapter is app code and may throw. It must not take down the session (A02 §7).

```
adapter throws → log → re-adapt through the fallback
              → append a muted notice recording the adapter failure
              → document status unchanged
```

The notice is muted rather than an error because the *command* may have succeeded perfectly; it is the presentation that failed, and the user should still see their data.

---

## 8. Registry state machine

| From ↓ / call → | `register` | `seal` | `adapt` |
|---|---|---|---|
| **open** | → open (T1.1) | → sealed (T1.2) | works (T3.1) |
| **sealed** | throw (T3.2) | no-op (T3.3) | works (T1.3) |

---

## 9. Invariants

- **I1** — Adapters are pure: no I/O, no clock, no randomness. Same `RawResult` and context produce a deeply equal document.
- **I2** — Resolution order is identity → registered → fallback, always.
- **I3** — The fallback is total: any JSON, any malformed stdout, produces a valid non-empty document.
- **I4** — `adapt` never throws. An adapter's throw is contained and re-adapted.
- **I5** — Every produced document passes C04's validator, including on every failure path.
- **I6** — `error` is present iff status is `error`; `cancelled` yields `partial`, never `error`.
- **I7** — Adapter `schema` mismatch is a **startup** failure, never a runtime surprise.
- **I8** — A sealed registry cannot be registered against.
- **I9** — `userRequestedJson` produces a `code` block for every verb, with no per-verb exception.
- **I10** — C07 imports nothing from `terminal/`, `presentation/` or above.
- **I11** — No adapter is required for a verb to be usable.

---

## 10. Commitments

1. Resolution is identity → registered → fallback; the identity path makes adapter deletion mechanical.
2. Adapters are pure and fixture-tested with no process and no terminal.
3. The fallback renders any JSON legibly and is total.
4. Streaming works with no stream adapter, via the fallback.
5. Cancellation yields `partial`; A01 B4 is corrected accordingly.
6. `ErrorLike` needs only `message`; every verb's failure renders through one path.
7. Fallback tables are capped at 8 columns and 2,000 rows; truncation is recorded, never silent.
8. Explicit `--json` yields a `code` block, with no exceptions.
9. An adapter throwing is contained, re-adapted through the fallback, and recorded in a muted notice.
10. The registry seals at composition end, matching C05 and C09.
11. Schema mismatch fails at startup, naming the offending adapter.
12. Every produced document is valid per C04, on every path.
13. Deleting an adapter because the far side converged is a success, not a regression.

---

## 11. Tests

Six tiers. Every cell of the §8 transition table is covered.

### Tier 1 — unit

- **T1.1**: `register` in open state → the adapter is used for that verb.
- **T1.2**: `seal` → `sealed` true; previously registered adapters still resolve.
- **T1.3**: `adapt` after seal → works normally.
- **T1.4** (I2): stdout that is a valid `tui.view/1` document, with a registered adapter also present → the identity path wins; the adapter is not called.
- **T1.5** (I2): stdout that is not a document, adapter registered → the adapter is called.
- **T1.6** (I2): no adapter registered → the fallback is called.
- **T1.7**: each row of the §4 mapping table — seven cases, asserting status and document shape.
- **T1.8** (I6): `cancelled` with forty lines of output → `partial`, forty lines retained, cancelled notice appended.
- **T1.9** (I6): `cancelled` with no output → `partial` with only the notice; not `error`.
- **T1.10**: `timedOut` → `error` with a `TIMEOUT` envelope naming the budget.
- **T1.11**: exit 1 with a parseable envelope → carried through, `remediation` becoming a fill action.
- **T1.12**: exit 1 with no envelope → synthesised from stderr, `message` non-empty.
- **T1.13** (I9): `userRequestedJson` → a single `code` block, for a verb with and without an adapter.
- **T1.14**: each fallback shape in §5 — six cases.
- **T1.15**: fallback table column cap — an array whose objects have twenty distinct keys → eight columns, chosen by first appearance.
- **T1.16** (§6): each `RawPatch` kind maps as documented; `malformed` yields null.
- **T1.17**: an adapter with no `adaptPatch` → `data` patches append fallback blocks.

### Tier 2 — contract / interface

- **T2.1** (I1): every registered adapter, called a hundred times on the same fixture, returns deeply equal documents and performs no I/O.
- **T2.2** (I1): a source scan finds no `Date`, `Math.random`, `process` or `fs` reference in `adapters/`.
- **T2.3** (I5): a corpus spanning every §4 row × every §5 shape → every produced document passes C04's validator.
- **T2.4** (I3): a fuzz corpus of a thousand arbitrary JSON values through the fallback → a valid non-empty document each time, no throw.
- **T2.5** (I7): an adapter declaring `schema: "tui.view/2"` → registry construction fails, naming the verb.
- **T2.6** (I10): the module graph shows no import from `terminal/` or above.
- **T2.7** (I11): with the registry entirely empty, a document is produced for every tool in the manifest.

### Tier 3 — edge cases

- **T3.1**: `adapt` before `seal` → works.
- **T3.2** (I8): `register` after `seal` → throws.
- **T3.3**: `seal` twice → no-op.
- **T3.4** (I4): an adapter that throws → fallback output plus a muted notice; status is unchanged from what the exit code implied.
- **T3.5** (I4): an adapter that returns `undefined` → treated as a throw.
- **T3.6** (I4): an adapter that returns a structurally invalid document → rejected by the validator, contained as a throw.
- **T3.7** (I4): an adapter that throws *and* the fallback throws → a minimal hand-built error document is produced. The last-resort path.
- **T3.8**: stdout is `null` → fallback produces a `code` block, not a crash.
- **T3.9**: stdout is a bare scalar (`42`, `"x"`, `true`) → `code` block.
- **T3.10**: stdout is an empty array → `table` with the empty message, not a blank document.
- **T3.11**: an array of *non-uniform* objects → `code` block, not a ragged table. The fallback never invents structure.
- **T3.12**: an array of objects with a nested object field → the nested value renders as JSON text in the cell.
- **T3.13**: a 50 MB parsed payload → `truncated` set, row cap of 2,000 applied, a notice names the dropped count, and the block cap (D40) is respected.
- **T3.13b**: an array of 100,000 uniform objects → one table of 2,000 rows, not 100,000, and adaptation completes within budget.
- **T3.20**: `cancelled` and `timedOut` both set → `partial`, per the §4 precedence.
- **T3.14**: stdout containing ANSI escape sequences → stripped or escaped, never emitted into a block. A tool that colours its own JSON cannot inject styling.
- **T3.15**: an envelope whose `details` contains a circular structure → contained; `message` still renders.
- **T3.16**: `remediation` that is not a runnable command → rendered as text, no fill action.
- **T3.17**: an adapter registered for a verb absent from the manifest → registration succeeds and is simply never reached.
- **T3.18**: `end` patch arriving with `cancelled` → status patch is `partial`.
- **T3.19**: a `degraded` patch followed by more `data` patches → the raw block is appended once, and later data still appends.

### Tier 4 — integration

- **T4.1** (with C06): a `RawResult` from both transports produces the same document for equivalent input.
- **T4.2** (with C06): a cancelled real invocation produces `partial` with retained output, end to end.
- **T4.3** (with C04): every document from the T2.3 corpus passes the block-measurement contract at seven widths.
- **T4.4** (with C05): an exit-2 document's usage block is generated from the manifest, not hardcoded.
- **T4.5** (with C13): a streamed sequence of patches applied in order yields a document identical to adapting the same content in one shot. Stream and one-shot converge.
- **T4.6** (with L4): deleting a registered adapter while the far side emits `tui.view/1` changes nothing observable — the disposability property, tested directly.

### Tier 5 — e2e

- **T5.1**: a session with an empty registry runs every tool in the manifest and renders each legibly.
- **T5.2**: a verb whose adapter is removed mid-development → rendering degrades to fallback, session unaffected.
- **T5.3**: a real streaming verb for sixty seconds with no `adaptPatch` → blocks append correctly throughout.
- **T5.4**: a deliberately broken adapter shipped in a build → the muted notice appears, the data still renders, no session loss.

### Tier 6 — fail-on-revert

- **T6.1** (I2): checking registered adapters before the identity path → T1.4 fails, and adapter deletion stops being mechanical.
- **T6.2** (I3): a fallback branch that throws on an unexpected shape → T2.4 fails.
- **T6.3** (I4): letting an adapter's throw propagate → T3.4 fails and the session dies.
- **T6.4** (I6): mapping `cancelled` to `error` → T1.8 and T1.9 fail.
- **T6.5** (I1): reading the clock inside an adapter → T2.1 and T2.2 fail.
- **T6.6** (I9): special-casing a verb under `--json` → T1.13 fails.
- **T6.7** (I5): a failure path that skips validation → T2.3 fails.
- **T6.8** (I11): making a verb require an adapter → T2.7 fails.
- **T6.9** (§5): flattening nested objects into columns → T3.12 fails.
- **T6.10** (I7): deferring schema checks to first use → T2.5 fails.

---

## 12. Out of scope

| Not here | Where |
|---|---|
| Running anything | C06, C21 |
| The block vocabulary and measurement | C04, C09 |
| What any specific verb's document looks like | The S-series |
| The fixture world | C08 (app) |
| Prism's adapters | `prism-tui` |
| Deciding a verb streams | C05 |
