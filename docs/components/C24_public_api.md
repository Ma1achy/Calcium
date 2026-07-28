# C24 — Public API

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L4 shell — the façade over everything below |
| **Depends on** | C04 C05 C07 C09 C10 C22 C23 · re-exports from each |
| **Consumed by** | Every consuming app — `prism-tui`, the docker reference app, anything else |
| **Source** | Scratchpad 3 · A02 §6 hooks · A01 D41–D48 |
| **Status** | Draft |

---

## 1. Purpose

Twenty-three components, and a consumer touches five things: `createTui`, the block builders, an adapter signature, a manifest, and theme tokens. **Eleven of the twenty-three are invisible to them** — terminal, transcript, viewport, overlays, input, editor, parser, completion, history, process runner, frame scheduler — and that is the measure of whether the layering worked.

C24 is the façade. It exists as a component rather than as an implicit consequence of what happens to be exported, because **every export is a compatibility obligation**, and a surface that accretes by accident cannot be kept.

The test it serves: Phase 1 is done when someone who is not its author builds a working TUI from the README without asking a question.

---

## 2. Entry points

Three, split by what ships to production.

```
tui-kit             runtime — createTui, builders, types, defaultTheme
tui-kit/testing     adapter harness, document assertions, fakes
tui-kit/fixtures    recording tooling and the Fixture model
```

`testing` and `fixtures` are dev-only. One entry with everything would drag a golden-frame differ into every production install for nothing.

---

## 3. The runtime surface

```typescript
// entry
export function createTui(config: TuiConfig): TuiInstance;
export type { TuiConfig, TuiInstance, SessionSnapshot, ChromeFn, StopReason };

// blocks — the type a consumer returns
export type {
  Block, Rule, Notice, KeyValue, Table, TableRow, Cell, Steps, Logs, Events,
  Plot, Series, Progress, Code, Diff, Pills, Tip, Panel, Group, Raw,
  Tone, Action, ErrorLike, ViewDocument, ViewPatch,
};

// builders — §4
export { b };

// adapters — the extension point they use most
export type { Adapter, AdapterContext, StreamContext, RawResult, RawPatch };

// manifest — written by hand
export type { Manifest, ToolDef, FlagDef, ArgDef, ArgType, ValidationResult };

// theming
export type { ThemeTokens, ThemeSet, PaletteSpec, ColourRef, Style };
export { defaultTheme };

// hooks
export type { CompletionSource, CompletionContext, Candidate, Slot };
export type { CommandPolicy, Classification, ParseResult };
export type { BlockDefinition, Measure, MeasureFn, RenderContext, BlockKeymap };
export type { TransportRouter, VerbTransport, Invocation, ViewRefresh };
export type { WorldDriver };

// utilities a custom block kind needs
export { cells, truncate, planColumns };
```

**`planColumns` is public** because a custom table-like kind needs it and it is pure. `cells` and `truncate` likewise — a kind that measured width itself would be wrong in a different way from every other kind.

### What is deliberately absent

`TerminalLifecycle`, `FrameScheduler`, `TranscriptStore`, `Viewport`, `OverlayManager`, `InputRouter`, `LineEditor`, `HistoryStore`, `ProcessRunner`, `AdapterRegistry`, `BlockRegistry`.

A consumer never constructs, inspects or drives any of them. If one is ever needed, that is a signal the layering has a gap — not a request to widen the export list.

---

## 4. Builders

The API's quality is mostly this, because an adapter is the thing a consumer writes a hundred times and a block is what an adapter returns.

```typescript
export const b: {
  rule(label: string, meta?: string): Rule;
  notice: {
    (tone: Tone, text: string, glyph?: string): Notice;
    ok(text: string): Notice;  warn(text: string): Notice;
    error(text: string): Notice;  info(text: string): Notice;
  };
  kv(rows: Record<string, string | CellInput>): KeyValue;
  table(spec: { columns: ColumnDef[]; rows: TableRow[]; showHeader?: boolean;
                emptyMessage?: string; id?: string }): Table;
  col(key: string, spec: Omit<ColumnDef, "key" | "label"> & { label?: string }): ColumnDef;
  row(id: string, cells: Record<string, string | CellInput>,
      opts?: { detail?: Block[]; actions?: Action[] }): TableRow;
  steps(steps: StepInput[]): Steps;
  logs(lines: LogLine[]): Logs;
  events(events: EventLine[]): Events;
  plot(spec: { series: Series[]; height?: number; axes?: boolean }): Plot;
  spark(values: number[]): Plot;
  progress(spec: { label: string; current: number; total: number }): Progress;
  code(language: string, text: string, opts?: { wrap?: boolean }): Code;
  diff(rows: DiffRow[]): Diff;
  pills(chips: ChipInput[]): Pills;
  tip(text: string, actions?: Action[]): Tip;
  panel(title: string, children: Block[]): Panel;
  group(direction: "row" | "column", children: Block[]): Group;
  raw(text: string): Raw;
  spinner(label: string): Steps;

  // cell shorthands
  id(text: string): Cell;   ok(text: string): Cell;   warn(text: string): Cell;
  error(text: string): Cell;  dim(text: string): Cell;  meta(text: string): Cell;

  // actions
  fill(label: string, command: string): Action;
  exec(label: string, command: string): Action;
  open(label: string, url: string): Action;

  live(spec: LiveSpec): Block;                        // §5
};
```

**Builders return frozen blocks directly**, not descriptions. Deferred construction would buy call-site error messages at the cost of a second type family every consumer must learn — and the error messages are recoverable later by carrying a source hint on the validator.

**Ids are generated unless supplied.** They matter only for blocks a consumer will address with a `replace` or `merge` patch; supply one then, and otherwise ignore them. Row ids come from data (`b.row(r.uuid, …)`), ids are never rendered, and golden frames therefore never see them.

**A bare string is a cell with default tone.** `{ family: "digit-classifier" }` and `{ status: b.warn("degraded") }` in the same object, because most cells carry no tone and paying `{ text: … }` for all of them is the noise this removes.

**Nothing is inferred from field names.** A builder that guessed a tone from a key called `status` would work for four verbs and fail silently on the fifth.

---

## 5. `b.live` — failure isolation as a primitive

A02 §7 specifies the pattern precisely; assembling one by hand means wiring an interval, backoff, staleness, error rendering and teardown. Nobody does that five times correctly, so the isolation would be specified and not shipped.

```typescript
type LiveSpec = Readonly<{
  id:     string;
  every?: number;                                  // omit → one-shot, no retry
  fetch?: () => Promise<unknown>;
  stream?: () => AsyncIterable<unknown>;           // → stall detection
  render: (data: unknown) => readonly Block[];
  renderError?:   (err: ErrorLike, retryInMs: number | null) => readonly Block[];
  renderLoading?: () => readonly Block[];
  staleAfter?: number;                             // default 2 × every
}>;
```

Everything in A02 §7 comes free:

| Free | From |
|---|---|
| Independent failure — siblings unaffected | A02 §7 rule 1 |
| Error rendered in place at the part's own size | rule 1 |
| Backoff doubling from `every`, capped at 5 min | the one backoff rule |
| Staleness marker past `staleAfter` | C23 §3b |
| Stagger offset so no two parts tick together | C23 I20 |
| Teardown on freeze, settle or pop | C23 §3b |
| Muted placeholder while first loading | S02's pattern |

**Behaviour is fixed; rendering is overridable.** `renderError` and `renderLoading` are replaceable so an app can match its own voice. Backoff, isolation and teardown are not — a guarantee you can switch off is not one.

**`b.live` works wherever a block does**, in a transcript entry or a pushed view, and C23 drives both. That replaces two mechanisms with one: S02's banner sections and S13's panels now run on the same code, and C22's identity loop goes back to being about identity.

---

## 6. Animation

A block is data at every instant (C04 I1). A consumer callback returning frames would break patching, measurement caching and golden frames together.

**So animation lives in block kinds, never in consumer callbacks.** A kind's `render` may read `ctx.tick`; its `measure` may not (C09 I14) — appearance animates, geometry never does. `Measure` simply does not receive `tick`, so the type makes it unavailable rather than forbidden.

`b.spinner`, `b.progress`, `b.steps` and `b.spark` animate. A custom animated kind registers a `BlockDefinition` whose `render` reads `tick`.

**Animation and liveness are orthogonal.** A spinner inside a `b.live` part animates at C03's spinner cadence while its data refreshes at `every`, and neither knows about the other.

---

## 7. `tui-kit/testing`

The adapter story is "pure function, fixture in, document out". The assertions that make that worth anything would otherwise be reimplemented badly by each consumer, or not at all.

```typescript
export function expectDocument(doc: ViewDocument): DocumentAssertions;

interface DocumentAssertions {
  isValid(): this;                                 // C04 validateDocument
  measuresCorrectly(widths?: number[]): this;      // C09 T2.1, default 7 widths
  rendersAt(widths: number[]): this;               // no overflow, no negative widths
  degradesToAscii(): this;                         // C09 T2.2 — heights unchanged
  degradesTo1Bit(): this;                          // B04 B4.3 — glyph or word carries it
  hasNoColourOnlyDistinction(): this;              // D29
  matchesGolden(name: string): this;
}

export function adaptFixture(id: string, adapter: Adapter): ViewDocument;
export function fakeClock(): FakeClock;
export function fakeFs(): FileSystem;
export function fakeTerminal(size?: TerminalSize): FakeTerminal;
export function withCapabilities(caps: Partial<TerminalCapabilities>): TestContext;
```

**`degradesTo1Bit` is the one that earns the module.** It is B04's compliance sweep — every distinction carried by a glyph or a word — and no consumer would write it themselves, which is exactly how the colour axis starts losing information invisibly.

---

## 8. Startup validation

`createTui` checks the graph before the session opens, and the severity of each check is chosen deliberately.

| Condition | Severity |
|---|---|
| Missing required config field | **Error** — construction throws |
| Adapter declaring a schema the renderer does not support | **Error** — a startup failure, never a runtime surprise (C07 I7) |
| Theme failing a contrast floor | **Error** — a session where failures cannot be seen is worse than no session (C10 §4) |
| Duplicate `(target, key)` binding | **Error** (C16 I8) |
| Registered adapter for a verb absent from the manifest | **Warning** — dead code and probably a typo, but not worth refusing a build over |
| Custom block kind shadowing a default | **Error** (C09 T3.18) |
| Palette declaring `meaning` without a typographic fallback | **Error** (C10 §2 — a `meaning` palette without a typographic fallback is rejected at load) |

The adapter/manifest mismatch is a warning rather than an error because a manifest can legitimately shrink between versions and an app that refuses to start when the far side drops a verb is worse than one that says so.

---

## 9. Invariants

- **I1** — Every export is used by **the union of** `prism-tui` and the reference app. Neither alone exercises the whole surface — docker touches no `spectrum`, no `WorldDriver` and only part of the manifest schema. An export used by neither is removed.
- **I2** — The eleven components in §3's absent list are not reachable from any entry point.
- **I3** — Builders return frozen blocks; there is no second description type.
- **I4** — A generated id is stable within one document and never rendered.
- **I5** — No builder infers a tone, glyph or action from a field name.
- **I6** — `b.live`'s behaviour is not configurable; only its renderings are.
- **I7** — `measure` never receives `tick`; animation cannot affect geometry.
- **I8** — `testing` and `fixtures` are absent from the production bundle.
- **I9** — Startup validation severities are those of §8, and each cites the spec that set it.
- **I10** — The runtime entry exports no function that performs I/O except `createTui`.
- **I11** — The reference app lives in its own repository and consumes `tui-kit` as a published dependency, so the unused-export scan runs against `prism-tui` plus the app's declared import manifest, refreshed on each version bump. It is a reported signal, not a build gate.

---

## 10. Commitments

1. Three entry points; `testing` and `fixtures` never reach production.
2. Eleven of twenty-three components are invisible to consumers, and that is the measure of the layering.
3. Every export is a compatibility obligation; an export used by neither app is removed. The claim is about the union of the two, since neither exercises the whole surface alone.
4. Builders return frozen blocks, not descriptions.
5. Ids are generated unless supplied, matter only for patched blocks, and are never rendered.
6. A bare string is a cell; nothing is inferred from field names.
7. `b.live` gives A02 §7's whole pattern by default, with fixed behaviour and overridable rendering.
8. `b.live` works identically in a transcript entry and a pushed view, driven by C23 in both.
9. Animation lives in block kinds; `measure` cannot see `tick`.
10. `tui-kit/testing` ships the assertions, so no consumer reimplements them.
11. Startup validation errors on anything that would render a session wrong, and warns on anything merely suspect.
12. `planColumns`, `cells` and `truncate` are public because a custom block kind cannot be written without them.

---

## 11. Tests

### Tier 1 — unit

- **T1.1**: each builder produces a block passing `validateBlock` — twenty cases.
- **T1.2**: an omitted id is generated and unique within a document; a supplied one is preserved.
- **T1.3**: a bare string cell and a `b.warn(...)` cell in one row both produce valid cells.
- **T1.4**: `b.live` without `every` produces a one-shot part; with `every`, a periodic one; with `stream`, a streaming one.
- **T1.5**: `b.live`'s default `renderError` produces the A02 §7 shape.
- **T1.6**: `b.spinner` advances with `tick`; its measured height does not.
- **T1.7**: each §8 condition produces its documented severity — seven cases.
- **T1.8**: `expectDocument().isValid()` passes a valid document and fails an invalid one with a named reason.

### Tier 2 — contract

- **T2.1** (I2): a module-graph test proves none of the eleven absent components is reachable from any entry point.
- **T2.2** (I1): every export is referenced by `prism-tui` or by the reference app's declared import manifest — an unused-export scan over the union.
- **T2.3** (I8): the production bundle contains no `testing` or `fixtures` module.
- **T2.4** (I3): no exported builder returns anything but a frozen block — a type-level test.
- **T2.5** (I7): `Measure`'s signature does not include `tick` — a compile-level test.
- **T2.6** (I10): a source scan finds no I/O in the runtime entry outside `createTui`.
- **T2.7** (I5): a source scan finds no field-name-keyed tone or glyph table in `builders/`.
- **T2.8**: every block kind in C04's union has a builder — exhaustive over the type.

### Tier 3 — edge cases

- **T3.1**: `b.table` with zero columns → valid block, empty message rendered.
- **T3.2**: `b.row` with a duplicate id in one table → rejected by validation (C11 T3.15).
- **T3.3**: `b.kv` with 200 rows → valid; measurement linear.
- **T3.4**: `b.live` with both `fetch` and `stream` → construction throws; they are exclusive.
- **T3.5**: `b.live` with neither → throws.
- **T3.6**: `b.live` with `staleAfter` below `every` → warns; staleness would fire every tick.
- **T3.7**: a custom `BlockDefinition` whose `measure` closes over a clock → caught by C09's scan, not here, but asserted end to end.
- **T3.8**: `b.code` defaults to `wrap: false`; S10's usage sets true.
- **T3.9**: `b.notice.error` with no glyph → a glyph is supplied automatically, satisfying D29 (C04 I5).
- **T3.10**: nesting `b.panel` inside `b.group` inside `b.panel` → valid, measured correctly.
- **T3.11**: an adapter registered for an absent verb → warning at startup, session opens.
- **T3.12**: a theme failing contrast → construction throws before the terminal is acquired.

### Tier 4 — integration

- **T4.1** (with C22): `createTui` with only the four required fields produces a usable session.
- **T4.2** (with C09): every builder's output measures correctly at seven widths.
- **T4.3** (with C23): a `b.live` part in a transcript entry and one in a pushed view are driven by the same code path.
- **T4.4** (with C23): a failing `b.live` part leaves its siblings rendering.
- **T4.5** (with C10): `defaultTheme` passes every contrast floor at every colour depth.
- **T4.6** (with C07): an adapter written using only the public surface produces a document indistinguishable from one written against internals.
- **T4.7** (with the reference app): the docker app compiles against the public entry only — no deep imports.

### Tier 5 — e2e

- **T5.1**: the README's example lives in a compiled fixture that CI type-checks and runs; the README includes it by reference. Typed verbatim from a clean clone it produces a running shell. **The example is not an excerpt of the reference app** — that repo is separate, so nothing else keeps it compiling.
- **T5.2**: the docker reference app, built against the public surface, wraps real `docker ps` and `docker images`.
- **T5.3**: an adapter with a deliberate bug → contained, fallback rendering, session survives (A02 §7 from the consumer's side).
- **T5.4**: a `b.live` panel whose fetch fails → error rendered in place, backoff visible, siblings unaffected, recovery on success.
- **T5.5**: `degradesTo1Bit` run over every document the reference app produces → passes.

### Tier 6 — fail-on-revert

- **T6.1** (I2): exporting one of the eleven absent components → T2.1 fails, and the layering starts leaking.
- **T6.2** (I3): a builder returning a description → T2.4 fails, and consumers learn two type families.
- **T6.3** (I5): inferring a tone from a field name → T2.7 fails, and the fifth verb breaks silently.
- **T6.4** (I6): making backoff configurable → the isolation guarantee becomes optional.
- **T6.5** (I7): passing `tick` to `measure` → T2.5 fails, and a spinner shifts the viewport.
- **T6.6** (I8): `testing` reachable from the runtime entry → T2.3 fails.
- **T6.7** (I1): an export nothing consumes → T2.2 fails, and the surface starts accreting.
- **T6.8** (§8): erroring on an adapter/manifest mismatch → T3.11 fails, and a shrunk manifest stops the app starting.

---

## 12. Out of scope

| Not here | Where |
|---|---|
| What any export does | The component that owns it |
| The README's prose | Implementation |
| The reference app | Its own spec |
| Prism's adapters, manifest and theme | `prism-tui` |
| Versioning and release policy | Implementation |
