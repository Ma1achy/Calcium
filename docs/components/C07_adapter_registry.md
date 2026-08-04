# C07 — Adapter registry

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` (registry, fallback, mapping) + app (the adapters) |
| **Layer** | L0 data |
| **Depends on** | C04 view model · C06 transport types · C05 `ToolDef`, for the exit-2 usage block. All same layer, acyclic |
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
  transport:         "emulated" | "fixture" | "subprocess" | "local";
  origin:            "user" | "action" | "agent" | "refresh";
  tool:              ToolDef | null;  // from C05 — the usage block's only source
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

### The registry owns `meta`

An adapter returns a `ViewDocument`, and the registry **overwrites its `meta`** from the `RawResult` and the context, keeping only `resultId`, `adapter` and `truncated` from what the adapter supplied.

This is not tidying. `meta.origin` and `meta.transport` are required by C04 (I13), and neither is derivable from a `RawResult` — so a `meta` assembled by the adapter is a `meta` that an app author has to get right a hundred times, once per verb, with I5 depending on all hundred. Provenance is the framework's to state: it knows what ran, how it ran and who asked. The adapter knows only what came back.

**The three exceptions are the three the registry cannot know**, and the line between them and the rest is exactly that. `resultId` is a *declaration* that this command produced an identifier (C04 §meta), which requires knowing which field of an arbitrary envelope is "the" one. `truncated` is a statement about the blocks — the fallback's row cap fires inside the adapter, and a registry reading it off the outside would have to re-derive it from a document it did not build. `adapter` names what ran; the registry knows the registered name, but a composite adapter that delegates is the one that knows which branch answered.

`meta.exitCode` is required and finite while `RawResult.exitCode` is null on two paths. Three values, each with one cause:

| `RawResult` | `meta.exitCode` | Cause |
|---|---|---|
| `exitCode` non-null | it | The process ran and exited |
| `signal` recognised | `128 + signum` | Killed — A01 D54, C01 §Signals (130, 143, 129) |
| `signal` unrecognised | `128` | Killed; the number is not derivable from the name |
| both null | `-1` | **The process never started** |

**`-1` means "never started", not "unknown".** It has exactly two producers and they are one condition: a spawn failure, and an invocation whose signal was already aborted so nothing was spawned at all (C06 §3). A real child's exit never carries both null — one of code and signal is always set — so there is no third meaning hiding in the sentinel. A value standing for two unrelated conditions is unreadable a year later; this one stands for one.

**The two producers share the code and split on status**, which is the mapping working rather than a collision. An aborted invocation carries `cancelled`, so it takes the first row of §4 and settles as `partial`; a spawn failure carries neither flag and falls to the last row as `UNEXPECTED_EXIT`. Nothing was started in both cases, and only one of them is a failure — an abort rendering as an error would be the same class of wrong that A01 B4 held before it was corrected.

---

## 4. Status and error mapping

C06 reports; C07 decides. The mapping, in precedence order:

Evaluated top to bottom; **the first match wins**. `cancelled` outranks `timedOut` when both are set — a user-initiated stop during a timeout is still a stop.

| Condition | Status | Document |
|---|---|---|
| `cancelled` | `partial` | Whatever was produced, plus a muted "cancelled" notice. Includes the invocation aborted before anything was spawned — nothing ran, and nothing failed |
| `timedOut` | `error` | `TIMEOUT` envelope naming the elapsed budget |
| `exitCode === 0` | `ok` | Adapter output |
| `exitCode === 1` | `error` | Envelope parsed from stdout; if absent, synthesised from stderr |
| `exitCode === 2` | `error` | Usage block from the manifest, plus stderr as `raw` |
| `signal !== null` | `error` | `KILLED_BY_SIGNAL` envelope |
| anything else | `error` | `UNEXPECTED_EXIT` envelope, stderr as `raw` |

**Cancellation produces `partial`, not `error`.** The user asked for the stop, so it is not a failure, and the lines already shown stay useful. The `cancelled` flag from C06 is authoritative; exit 130 merely corroborates it.

*A01 B4 once mapped exit 130 to `error`, contradicting A01's own cancellation rule. It now reads as this section does and cites it. The correction has landed; what remains here is the reasoning, because the rule is easier to re-break than to re-derive.*

`ErrorLike` requires only `message` (C04, F3). Where the far side supplies `code`, `stage`, `details` or `remediation` they are carried through; `remediation` naming a runnable command becomes a `fill` action. A failed `promote` and a failed `validate` therefore render identically, because the same code renders both.

### Open: `RawResult.overflowed`

C21 bounds each stream at 8 MiB and reports `overflowed` when the bound is crossed; C06 carries it as a `RawResult` field. Whether it reaches the document, and under which name, is C07's decision and is not yet made.

**An overflowed child is not a truncated document.** `meta.truncated` says the fallback capped rows; `RawResult.overflowed` says the far side emitted more bytes than the runner would hold. The remedies differ — widen a cap or write an adapter in one case, reconsider what the far side is being asked to emit in the other. If both need surfacing, they need two fields, or one field with a reason.

Recorded as a distinction rather than as a task, so whoever takes it starts from the difference instead of rediscovering it. The temptation is to `||` the two together in `authoritativeMeta`, which compiles, passes review, and makes one field mean two things — and I13's line about the three fields the registry cannot know stops being true, because it would then be computing one of them.

### Explicit `--json`

When `userRequestedJson`, the document is a single `code` block containing pretty-printed stdout, whatever the verb. The user is inspecting the contract; rendering it would defeat the request (A01 O3).

---

## 5. The fallback adapter

Total over any JSON. Never throws, never returns an empty document.

| Input shape | Rendering |
|---|---|
| Object with scalar fields | `rule` (verb name) + `keyValue` |
| Array of uniform objects | `table`, columns from the union of keys, capped at 8 by first appearance, each column's `minWidth` **measured from its own widest value** and capped at 24 |
| Object containing one array of uniform objects | `keyValue` for the scalars, `table` for the array |
| Anything else | `code` block, pretty-printed JSON |
| Unparseable stdout | `raw` block of `stdoutRaw` |
| Empty stdout, exit 0 | `notice` — completed with no output |

Caps: **8 columns** and **2,000 rows** per generated table. The row cap matters because D40 bounds *blocks* per document, and a 50 MB payload is one enormous table block that the block cap never touches. Truncation sets `meta.truncated` and appends a notice naming the row count dropped. Column dropping at narrow widths is a separate, later mechanism (C11) — the two compose: C07 bounds what enters the block, C11 decides what fits on screen.

Nested objects render as their JSON text inside a cell rather than being flattened. Flattening invents structure the tool did not declare, and a wrong table is worse than an honest blob.

### `minWidth` is measured, not defaulted

**A generated column asks for the width of its own widest value, capped at 24 cells.** This replaces a uniform `minWidth: 3`, which was not a conservative default but a discarding of information the fallback already holds: it has every row in hand when it builds the columns.

Everything else follows from it. Columns ask for what they need, the total exceeds a narrow terminal, columns drop by priority, dropped columns reach the expand row, rows become expandable — and D38's guarantee stops being vacuously true. Under the uniform minimum nothing ever dropped, because every column squeezed to three cells instead, so no row was ever expandable and the promise that a shed column stays reachable held only because nothing was shed.

It needs no domain knowledge. It is measurement of what a column contains, never interpretation of what it means: the header is included, because a column narrower than its own label is unreadable whatever its values; `cells()` is not available at L0, so the width is a code-unit count and C11 plans the real one from the content (C09 I6 — one width implementation, and this is not it).

The 24-cell cap is a judgement and the only one here. A single 200-character field would otherwise force every other column out by priority, which is the failure mode of asking for what you need without a ceiling. 24 is wide enough for a URL fragment, a timestamp or an image tag, and beyond it truncation is the honest answer.

**Two things deliberately unchanged, both of which the reading might have suggested moving.**

- **Priority stays `MAX_COLUMNS - i`.** Field order is a fair proxy — the earlier keys of a JSON object tend to be the identifying ones — and nothing better is available without knowing what the fields mean. C11 I12 forbids the engine guessing; the same reasoning forbids the adapter guessing.
- **No column is `flex`.** With content-derived widths a table narrower than the terminal is *correct*: nothing needs the residual, because every column already has what it asked for. C11 §3 step 8 rejects stretching columns arbitrarily, and that reasoning holds here unchanged.

Lowering the column cap was the alternative and it is worse: fields are lost *and* the survivors still get three cells each. Legibility and reachability both improve from the width change; only reachability improves from the cap.

### The fallback declares the expand column

**A generated table's first column is `role: "expand"`, `minWidth` 1.** C11 draws the marker only into a column a surface declared, and it will not synthesise one or reserve a gutter, because either would move width arithmetic the surfaces state (C11 I15) — that invariant is right, and it keeps a surface in control of its own column set. But *something* has to declare the column, and for a generated table the producer is this adapter.

Without it the affordance is invisible: at 80 cells three of docker's fields drop, every row becomes expandable, and nothing on screen says so. Under the old uniform `minWidth` this could not arise, because nothing ever dropped — the measured widths are what made it visible.

**It does not count toward the eight-column cap.** The cap bounds *fields* — how much of an unknown object to show — and a marker is not a field. Making the affordance cost a field would be hiding data in order to reveal that data is hidden, so a seven-field payload renders seven fields plus a marker, and an eleven-field payload renders eight plus a marker.

**It is declared unconditionally, not when something drops.** Whether anything drops depends on the width, and a column set is built once before any width is known — so a conditional column would mean either re-deriving the columns per render, which no other producer does, or guessing. S03 §3 does the same thing: the column is always present and the glyph is per-row, which is what C11's "blank when the row is not expandable" rule is for.

### Resolved: the list shape was illegible, and D38 was satisfied vacuously

**The risk below was read on the commit that registered `table` (C11), and it was real.** The finding was against this section's defaults, exactly as recorded, and it was worse than "the columns come out narrow". The remedy is the measured `minWidth` above; what follows is what the reading found, kept because the reasoning is the reason for that rule.

Every generated column got `minWidth: 3`, no `flex`, no `maxWidth`, and `priority = MAX_COLUMNS - i`. Two consequences, and the second is the one that matters:

- **Nothing is legible.** At 80, 120 and 160 cells, R01 §4's seven-column docker payload renders in 33 cells: `ID` at 3, `Names` at 3, and both `State` and `Status` as the header `St…`. The two fields R01 §4 exists to distinguish are indistinguishable, and the residual 127 cells at 160 are unused because no column is `flex` (C11 §3 step 8).
- **Nothing is ever dropped, so nothing is ever reachable.** Every column squeezes to three cells rather than shedding, so `planColumns` returns an empty `dropped` at every width above about 27 — and since C11 derives expandability from `detail !== undefined || dropped.length > 0`, **no row is expandable**. D38's promise that a shed column stays reachable holds because nothing is shed. The mechanism designed to keep information reachable is inert precisely where the table is least readable.

A table that sheds columns into an expand row is legible and complete. That one was neither, and it passed every structural assertion in §8 while being both — which is why the finding needed a rendered frame and a reader, and why §5's risk was recorded as a risk rather than as a test.

**Resolved by measuring `minWidth` from the content**, above. Two other candidates were considered: a `flex` last column, which uses the residual without making any column legible at a narrow width and without causing a single drop; and a lower column cap, which loses fields while leaving the survivors at three cells each. Neither is the change. Both legibility and reachability improve from the width; only reachability improves from the cap.

**The original risk, as recorded before the read:** the list shape's legibility was asserted structurally but unproven visually until C11 registered `table`. If the rendered output were not legible without an adapter, the finding would be about this shape table and not about C11 — which is how it turned out.

This is recorded as a risk rather than as a deferred test because of who carries it. Commitment 3 and I11 say a verb shipping tomorrow is usable tomorrow; a list is the majority shape a far side returns; and the claim is currently unproven for exactly that shape. `test/golden/fallback-docker.test.ts` asserts what can be asserted now — docker's own field order preserved, `Status` prose and `State` machine-readable both surviving unread, `Names` comma-joined and unsplit — and C09 §2 renders an unregistered kind as `raw`, so a snapshot taken today would capture a JSON blob and read to a later reviewer as reviewed.

**Reading that output was a named step in C11's plan, not a side effect of a deferral expiring.** The distinction mattered: an `it.todo` reads as work waiting on C11, and this was C07's risk carried on C11's schedule. The 8-column cap, the row cap, the choice not to split `Names`, and the decision to render a nested object as JSON text are all decisions in this section that only a rendered table could evaluate — and of those four, it is the uniform `minWidth` that the reading indicted, not the caps. `Names` unsplit and nested-as-JSON both read correctly; there was simply not enough width given to any column for a reader to reach them.

---

## 6. Streaming

`adaptPatch` maps C06's `RawPatch` to C04's `ViewPatch`:

| `RawPatch` | `ViewPatch` |
|---|---|
| `data` | Adapter's mapping, or `append` of a fallback block |
| `malformed`, before `degraded` | `null` — ignored, already counted by C06. The line is **retained** in case `degraded` is next |
| `degraded` | `append` of a `raw` block, seeded with the retained line if the immediately preceding patch was `malformed` |
| `malformed`, after `degraded` | extends that `raw` block |
| `end` | `status` patch, plus any terminal blocks |

**`malformed` is read twice, and which reading applies depends on whether `degraded` has arrived.** Before it, a stray unparseable line among good ones is noise and is dropped. After it, the `malformed` patches *are* the remainder — they are what carries the rest of the stream as text.

**The line that trips degradation arrives before the notice, and one line of retention is what keeps it.** C06 classifies a line and *then* tests the ratio (C06 §5), so the patch that pushed the stream over the threshold is emitted as `malformed` immediately before the `degraded` one. Read by arrival order alone it falls on the "dropped" side of the rule — and it is the first line of the remainder, so dropping it would make I12 false by exactly one line, silently, in every degraded stream.

`adaptPatch` therefore holds the most recent `malformed` line, and seeds the `raw` block with it when `degraded` is the very next patch. One patch of lookbehind rather than a buffer: the fix belongs here rather than in C06, because reordering C06's emission would change a landed component's observable stream for a consumer that can just as well remember one line.

An earlier draft had `degraded` carry a `remaining` string and this table append a raw block from it. The field was a fiction: C06 trips degradation on a completed line, and completing a line clears the buffer, so `remaining` was a partial line that was empty in almost every case (C06 §5). Redefining it as everything after the trip would have meant buffering the rest of the stream inside a streaming transport.

C06's degradation is sticky (C06 I12), so a `data` patch never follows a `degraded` one. `adaptPatch` still handles the combination rather than asserting against it — the mapping is total over the patch type, and a total function needs no invariant to hold.

An adapter without `adaptPatch` still streams: each `data` patch goes through the fallback, which appends a block. Streaming therefore works before anyone writes a stream adapter.

### 6a. `seq` counts patches within one invocation, and the caller supplies it

`StreamContext.seq` is the **position of this patch inside this stream**, from `0`. It is the whole of what the §3 interface carries about stream identity, and it does two jobs — which is why a caller that pins it to a constant breaks two things at once rather than none:

- **It namespaces the generated block ids.** A fallback block for patch *n* is prefixed `s`*n*, and C04 I14 requires block ids to be unique within a document. Every patch of one stream sharing a `seq` therefore makes the *second* patch collide with the first, and C13 refuses it.
- **`seq === 0` is the per-stream reset.** One `PatchAdapter` outlives many streams — degradation, the remainder and the one-line lookbehind are its state — so the first patch of a new stream is the signal to clear them. A verb that degraded once must not open its next invocation already degraded.

**Both failures are silent in the direction that matters** (I15). With `seq` pinned to `0` the reset fires on *every* patch, so C06 I12's stickiness is defeated at this seam: `degraded` is cleared before the next `malformed` arrives, the lookbehind is dropped with it, and the remainder never reaches the document — while I12 holds perfectly inside C06 and every unit test here passes, because a test that constructs its own `StreamContext` supplies the counter correctly by construction. It is reachable only from the one caller, and only by a stream with more than one patch.

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
- **I12** — A degraded stream's remainder reaches the document **whole**. `malformed` patches are dropped before `degraded` arrives and compose the `raw` block after it, except the one immediately preceding the notice — the line that tripped degradation, which seeds the block. C06 supplies no other carrier for the remainder (C06 §5).
- **I13** — The registry owns `meta`. An adapter's `meta` is overwritten from the `RawResult` and the context, `resultId`, `adapter` and `truncated` excepted — the three the registry cannot know. No adapter can produce a document with absent or wrong provenance, which is what makes I5 hold without every app author holding it up.
- **I14** — `meta.exitCode` is finite on every path. `-1` means the process never started and means nothing else.
- **I15** — `seq` is the patch's position within its stream, counted by the caller from `0` (§6a). It namespaces the generated block ids and its zero value is the per-stream reset, so a constant `seq` is an id collision *and* a reset that never stops firing.
- **I16** — The registry owns `doc.command` as well as `meta`, on every route including identity. `AdapterContext.command` is the line the user typed, and it is what the transcript draws (C22 I33, C23 I15); a far side's own `command` field is overwritten rather than trusted, for I13's reason — provenance is the framework's to state. The identity route passed it through until C22 drew the command at all, and the symptom was a transcript showing `ps --json`, the spawned form carrying a flag D16 appends and the user never wrote.

---

## 10. Commitments

1. Resolution is identity → registered → fallback; the identity path makes adapter deletion mechanical (I2).
2. Adapters are pure and fixture-tested with no process and no terminal (I1).
3. The fallback renders any JSON legibly and is total (I3).
4. Streaming works with no stream adapter, via the fallback (I11).
5. Cancellation yields `partial`, including an invocation aborted before anything was spawned. A01 B4 was corrected accordingly and now cites §4 (I6).
6. Every verb's failure renders through one path, because `ErrorLike` needs only `message` — the shape is C04's (→ C04 I28).
7. Fallback truncation is recorded, never silent — `meta.truncated` says so, and the caps themselves are §-level defaults rather than contract (I13).
8. Explicit `--json` yields a `code` block, with no exceptions (I9).
9. An adapter throwing is contained, re-adapted through the fallback, and recorded in a muted notice (I4).
10. The registry seals at composition end, matching C05 and C09 (I8).
11. Schema mismatch fails at startup, naming the offending adapter (I7).
12. Every produced document is valid per C04, on every path (I5).
13. Deleting an adapter because the far side converged is a success, not a regression (I2, I11).
14. A degraded stream's remainder is composed from the `malformed` patches that follow the notice, plus the one that preceded it; C06 carries it nowhere else (I12, §6).
15. The registry owns `meta`, so no adapter states provenance and none can state it wrongly (I13).
16. `meta.exitCode` is finite on every path, and `-1` has one documented cause (I14).
17. `seq` is supplied by the caller and counts patches within one invocation; it is both the id namespace and the per-stream reset (I15, §6a).
18. The registry owns `doc.command` as well as `meta`; the typed line is what is displayed, on every route (I16).

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
- **T1.18** (I13): an adapter returning a document whose `meta` claims `origin: "agent"`, `transport: "local"` and a wrong `argv` → all three are overwritten from the context and the `RawResult`; the adapter's `resultId`, `adapter` and `truncated` survive.
- **T1.19** (I14): each `meta.exitCode` case — an exit code, `SIGTERM` → 143, an unrecognised signal name → 128, both null → −1.
- **T1.20** (I14, §4): an invocation aborted before spawn → `partial` with `meta.exitCode` −1, not an error. Same code as a spawn failure, opposite status.

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
- **T3.19**: a `degraded` patch followed by more `malformed` patches → the raw block is appended once and extended by each subsequent line, so the remainder reaches the document. The reachable case, C06's degradation being sticky.
- **T3.19b**: `malformed` patches *before* any `degraded` one → dropped, no raw block. The same patch kind, read the opposite way, and the §6 table is the only thing saying which reading applies.
- **T3.19c** (I12): the `malformed` patch immediately preceding `degraded` → seeds the raw block rather than being dropped. Driven by a real `createNdjsonReader` over a stream that degrades, not by hand-built patches, because the ordering under test is C06's and a fabricated sequence would assert the rule against itself.

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
- **T6.11** (I13): letting an adapter's `meta` through unmodified → T1.18 fails, and provenance becomes whatever a hundred adapters happened to write.
- **T6.12** (I15): a caller passing a constant `seq` → C23's T1.7b fails on the sequence *and* on the blocks that reached the entry. Named here as well as in C23 because the number is spent here and supplied there: nothing in this component can detect it, since every test constructs its own `StreamContext` and supplies the counter correctly by construction.
- **T6.12** (I12): dropping the `malformed` patch that precedes `degraded` → T3.19c fails, and every degraded stream loses its first remainder line silently.

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
