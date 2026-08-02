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
  Plot, Series, Progress, Code, Comparison, Patch, Hunk, Pills, Tip, Panel, Group, Raw,
  Tone, Glyph, Action, ErrorLike, ViewDocument, ViewPatch,
};

// builders — §4
export { b };
export type {
  BlockOpts, ColumnDef, CellInput, KeyValueInput, StepInput, LogLine,
  EventLine, ChipInput, ComparisonRow,
};

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
export type { TransportRouter, VerbTransport, Invocation };
export type { WorldDriver };

// utilities a custom block kind needs
export { cells, truncate, planColumns };
```

**`planColumns` is public** because a custom table-like kind needs it and it is pure. `cells` and `truncate` likewise — a kind that measured width itself would be wrong in a different way from every other kind.

**The builder-argument types are exported because §4's signatures name them.** A list that exports `b.table` and not `ColumnDef` gives a consumer a function whose parameter they cannot annotate, and the workaround — `Parameters<typeof b.table>[0]["columns"][number]` — is the shape of an omission rather than a design. Six of the seven are introduced by the builders themselves and exist nowhere else; `ColumnDef` is C04's and was absent from this list while `TableRow`, `Series` and `Hunk` were on it, which is the same omission caught by consistency rather than by use.

### What is deliberately absent

`TerminalLifecycle`, `FrameScheduler`, `TranscriptStore`, `Viewport`, `OverlayManager`, `InputRouter`, `LineEditor`, `HistoryStore`, `ProcessRunner`, `AdapterRegistry`, `BlockRegistry`.

A consumer never constructs, inspects or drives any of them. If one is ever needed, that is a signal the layering has a gap — not a request to widen the export list.

**Three published-and-unconsumed members were ruled against this list, and all three drop.** MG24 holds them in `UNCONSUMED_MEMBERS` — an interface member with no consumer anywhere in the tree — and *available* is not an argument for *exported*. The list above is the instrument: an export whose owner is one of the eleven is interior by construction.

| Member | Owner | Ruling |
|---|---|---|
| `Keymap.mergeBlock` | `Keymap`, which is `InputRouter`'s | **Drop.** `BlockKeymap` is already in the hooks above — a consumer *declares* a block keymap, and merging it into the live block is the router's work on the other side of that declaration. Exporting the merge would hand a consumer the router's job while the router stays absent. |
| `ThemeStore.applyOverrides` | `ThemeStore`, which a consumer never holds | **Drop**, and the finding is not an export. Overrides would arrive as a `TuiConfig` field, and no such field is specified — this is a missing ruling at the shell, in the place theme *persistence* was before C22 I40, rather than a surface that wants widening. |
| `ExecutionWrites.setRetained` | C22 session state | **Drop.** `SessionSnapshot` already carries the readable half of the session; the writable half is the shell driving itself, and a consumer that could write it could contradict the shell. |

None of the three moves the export list, and all three stay in `UNCONSUMED_MEMBERS` naming their owner — this ruling says they are not public, not that they are finished.

**`ViewRefresh` is off the hooks list until C23 drives it.** It is the declaration type for C23 §3b's part refresh, and §3b implements two of its three mechanisms: stall detection and the identity notice have drivers, and part refresh does not. `ViewRefresh`, `assignOffsets` and `backoffOf` are a complete producer whose only consumer is a unit test. Exporting the declaration type of a mechanism nothing runs is A03 §2's vacuity class arriving as an export — a consumer declares a refreshing part, everything type-checks, and nothing ever fires. It returns with `b.live` (§5) and not before.

**No `b.hunk`, and no diff parser.** `Patch` is exported as a block shape, but nothing here turns two texts into hunks. That is the app's problem — hunks arrive from a diff tool or already structured from the far side, and the framework renders them.

Two reasons, and the second is the load-bearing one. A `b.hunk` helper would invite hand-constructing diffs, which is not a thing anyone should do. And a diff algorithm shipped here would be a fourth runtime dependency or a few hundred lines of internal code that is wrong about rename detection quietly — the same bar DEPENDENCIES.md sets for everything else, applied to something the framework does not need in order to render.

---

## 4. Builders

The API's quality is mostly this, because an adapter is the thing a consumer writes a hundred times and a block is what an adapter returns.

**`b` is the ergonomic layer over C04's constructors, not a second implementation** (C04 §4b). C04's constructors enforce the shape invariants — deep freeze (C04 I1), a glyph on `error` and `warn` tones (C04 I6), `height` present for `form: "line"` — and take a complete block. `b` adds the convenience: generated ids, bare strings accepted where a `Cell` is wanted, action helpers, sensible omissions.

**`b` never freezes or validates directly.** It delegates both. Freezing here as well would give C04 I1 two enforcement points, and the one that drifts is always the one with fewer tests — a block frozen twice is indistinguishable from a block frozen once, right up until one of the two paths stops doing it.

```typescript
/** What every block-returning builder accepts, and the only declaration of it. */
export type BlockOpts = Readonly<{ id?: string; gapBefore?: boolean }>;

export const b: {
  rule(label: string, meta?: string, opts?: BlockOpts): Rule;
  notice: {
    (tone: Tone, text: string, glyph?: Glyph, opts?: BlockOpts): Notice;
    ok(text: string, opts?: BlockOpts): Notice;
    warn(text: string, opts?: BlockOpts): Notice;
    error(text: string, opts?: BlockOpts): Notice;
    info(text: string, opts?: BlockOpts): Notice;
  };
  kv(rows: Record<string, string | KeyValueInput>, opts?: BlockOpts): KeyValue;
  table(spec: BlockOpts & { columns: ColumnDef[]; rows: TableRow[];
                            showHeader?: boolean; emptyMessage?: string }): Table;
  col(key: string, spec?: Partial<Omit<ColumnDef, "key">>): ColumnDef;
  seq(blocks: readonly Block[]): readonly Block[];      // §4a
  row(id: string, cells: Record<string, string | CellInput>,
      opts?: { detail?: Block[]; actions?: Action[] }): TableRow;
  steps(steps: StepInput[], opts?: BlockOpts): Steps;
  logs(lines: LogLine[], opts?: BlockOpts): Logs;
  events(events: EventLine[], opts?: BlockOpts): Events;
  plot(spec: BlockOpts & { series: Series[]; height: number;
                           axes?: boolean }): Plot;
  spark(values: number[], opts?: BlockOpts): Plot; // the sparkline path; height 1
  progress(spec: BlockOpts & { label: string; current: number;
                               total: number }): Progress;
  code(language: string, text: string,
       opts?: BlockOpts & { wrap?: boolean }): Code;
  comparison(rows: ComparisonRow[], opts?: BlockOpts): Comparison;
  patch(spec: BlockOpts & { path: string; language: string; hunks: Hunk[];
                            layout?: "unified" | "split" }): Patch;
  pills(chips: ChipInput[], opts?: BlockOpts): Pills;
  tip(text: string, actions?: Action[], opts?: BlockOpts): Tip;
  panel(title: string, children: Block[],
        opts?: BlockOpts & { footer?: string }): Panel;
  group(direction: "row" | "column", children: Block[],
        opts?: BlockOpts): Group;
  raw(text: string, opts?: BlockOpts): Raw;
  spinner(label: string, opts?: BlockOpts): Steps;

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

**`BlockOpts` is one type, declared once, and every block-returning builder takes
it.** This paragraph and the one on `gapBefore` below used to commit to something
the signatures could not express: only `b.table` took an `id`, and *nothing* took
a `gapBefore`. So "an explicit `gapBefore` always wins" (I15), T2.9's explicit
`false` and `true` per builder, and T2.11's explicit `true` on a first block were
all unwritable — three tests and an invariant resting on an argument that did not
exist. `b.panel` had the same shape of hole against `footer`, which S12 §2 and
S13 §2 both draw and C04's `Panel` has carried since.

The seventeen positional builders take `opts?` last. **`b.table`, `b.plot`,
`b.progress`, `b.patch` and `b.panel` spread `BlockOpts` into the spec object
they already take** rather than growing a second bag beside it — two places for
one set of fields is the drift a shared type prevents, and it is the argument
that gives the tree one block-id counter rather than two. `b.code` and `b.panel`
intersect it with the option that is theirs alone.

**A post-modifier was rejected, and §4a is why.** `b.at(block, { gapBefore })`
would leave the signatures alone, and it cannot work: the default is a
*preference* until `b.seq` resolves it, and `b.at(block, { gapBefore: false })`
is indistinguishable from a block whose default happened to be false. `b.seq`
could not tell *the consumer said no gap* from *no gap decided yet*. An argument
is set-or-absent at construction, which is exactly the distinction the marker
records.

**`b.kv` narrows rather than discarding.** `KeyValue` rows are
`{ label; value: string; tone? }` — no glyph, no spark — so a `CellInput`
carrying either has nowhere to put it. `b.kv` takes `KeyValueInput`
(`{ text: string; tone?: Tone }`) instead: the cell shorthands set only `text`
and `tone` and still pass, and a hand-written literal with a `glyph` is a compile
error under excess property checking. Silently dropping the field would be a
parameter that accepts what it cannot honour — the vacuity class arriving as an
argument type.

**A bare string is a cell with default tone.** `{ family: "digit-classifier" }` and `{ status: b.warn("degraded") }` in the same object, because most cells carry no tone and paying `{ text: … }` for all of them is the noise this removes.

**`gapBefore` has a default per kind, and that is why adapters rarely set it.**
C04 §3a puts vertical rhythm in the block; if every adapter had to think about it,
half of them would not, and the surfaces would render dense while the specs drew
them spaced. So the builders decide: `b.table`, `b.plot`, `b.panel`, `b.rule`,
`b.steps`, `b.kv`, `b.comparison`, `b.patch`, `b.code` and `b.tip` set `gapBefore`
when they are not the first block in the sequence they are built into; `b.pills`,
`b.notice`, `b.progress`, `b.logs`, `b.events`, `b.raw`, `b.spark`, `b.group` and
`b.spinner` do not — a second `pills` row belongs against the first, and a run of
notices is a list rather than a set of sections.

**Nineteen builders return blocks, and this paragraph names nineteen** — `b.live`
is the twentieth and is deferred with §5, so it takes its default when it lands.
It named fifteen, and two of those — `b.keyValue` and `b.diff` — are builders that do not
exist: the `comparison` rename reached §3, the renderer and the goldens and not
this sentence, and `b.kv` never had the name it was listed under. A prose list
paired with T2.9's enumeration is what makes that a failing test rather than a
paragraph nobody re-reads. The four that were simply missing are `b.patch`,
`b.spark`, `b.group` and `b.spinner`, and three of them needed a ruling rather
than a lookup:

- **`b.group` does not gap**, because it is a layout wrapper rather than a
  section. Gapping the group *and* the first child that carries its own default
  produces two blank rows where the surfaces draw one.
- **`b.spark` does not gap.** It is `b.plot`'s inline form at height 1, and it
  appears beside the thing it summarises rather than below it.
- **`b.spinner` does not gap, and `b.steps` does** — though both return `Steps`.
  This is the case that shows **the default belongs to the builder and not to
  the block kind**: a spinner is one transient line reporting on what precedes
  it, and a `steps` list is a section. I15 says "per its kind" and means per
  builder; a default keyed on `block.kind` could not express this row.

The cell shorthands, `b.col`, `b.row` and the action helpers return no block, so
they have no default and T2.9 does not enumerate them.

**A default is not a policy.** Every builder takes an explicit `gapBefore` that
wins, and a document assembled without builders has whatever its author wrote.
The defaults exist so that the common case matches what the S-series draws, not
so that the framework owns a surface's rhythm.

### 4a. `b.seq` — where "not the first block" lives

This paragraph said the builders set `gapBefore` "when they are not the first
block in the sequence they are built into", and **a builder cannot know its
position**. Worse, C04 §3a has already ruled against position meaning anything:
*"The first block's gap is a leading blank row, not a special case. Dropping it
would make the field mean two things depending on position, and a document
assembled by concatenating two others would render differently from either."*
`sequenceHeight` implements exactly that, with no index test.

Both statements are correct and they overlap, which is the class the by-hand
walk exists for. **The resolution came from asking who holds the rule today, and
the answer is nobody.** The whole of `src/` sets `gapBefore` in one file —
`shell/local/handlers.ts`, three times, by hand, chosen per position — and
`test/support/surfaces.ts` hand-authors the same pattern for every S-series
figure. Nothing strips a first block's gap anywhere. The rule that S02's figure
depends on ("every block after the logo carries `gapBefore`", six gaps for seven
blocks) has been **discipline rather than mechanism** since it was written.

So it gains one:

```typescript
seq(blocks: readonly Block[]): readonly Block[];
```

`b.seq` is the only point that sees a sequence. It clears the gap on the first
block and leaves the rest, and that is the sole place position means anything —
C04 §3a's ruling is untouched, because the blocks it returns are honest about
themselves and measure identically wherever they are concatenated.

**The default is a preference until `b.seq` resolves it.** A builder records that
its gap was defaulted rather than asked for, so an explicit `gapBefore: true` on
the first block survives — §4's "an explicit value always wins" has to hold at
position 0 too, and it is the only position where the two can disagree. The
marker is private to `b`; it is not a field on the block, because C04 owns block
shapes and a builder inventing one would be the second enforcement point I15's
own reasoning rejects.

**`b.seq` is the convenience, never the only path.** A consumer who drops one
builder's output into an array of their own has positions `b.seq` never sees, so
`gapBefore` stays settable on every builder. A sequence assembler that made the
field private would trade a hand-authored gap for an unreachable one.

**Nothing is inferred from field names.** A builder that guessed a tone from a key called `status` would work for four verbs and fail silently on the fifth.

---

## 5. `b.live` — failure isolation as a primitive

> **Specified, not shipped.** `b.live` is not in the first release of this
> surface, and neither is `ViewRefresh` (§3). The mechanism it rests on is C23
> §3b's *part refresh*, and C23 implements two of §3b's three: stall detection
> and the identity notice have drivers, part refresh has none. `assignOffsets`
> and `backoffOf` are a complete producer with no consumer in `src/` — the class
> MG24 exists for, arriving one level below where MG24 looks. So this section
> describes work, not code, and a reader should not take the table below as a
> list of things that currently happen. It ships when the driver does.

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

**So animation lives in block kinds, never in consumer callbacks.** A kind's `render` may read `ctx.tick`; its `measure` may not (C09 I18) — appearance animates, geometry never does. `Measure` simply does not receive `tick`, so the type makes it unavailable rather than forbidden.

`b.spinner`, `b.progress`, `b.steps` and `b.spark` animate. A custom animated kind registers a `BlockDefinition` whose `render` reads `tick`.

**Animation and liveness are orthogonal.** A spinner inside a `b.live` part animates at C03's spinner cadence while its data refreshes at `every`, and neither knows about the other.

---

## 7. `tui-kit/testing`

The adapter story is "pure function, fixture in, document out". The assertions that make that worth anything would otherwise be reimplemented badly by each consumer, or not at all.

```typescript
export function expectDocument(doc: ViewDocument): DocumentAssertions;

interface DocumentAssertions {
  isValid(): this;                                 // C04 validateDocument
  measuresCorrectly(widths?: number[]): this;      // C09 T2.1, default 7 widths — wraps C04's conformance suite
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

**`renderToLines` is not part of this surface, and used to be.** It takes a `BlockRegistry` — one of the eleven §3 keeps unreachable — so no consumer could construct one and call it, and exporting it named an absent component in this entry's declarations for nothing. It lives in `presentation/render-lines.ts`, where `shell/paint.ts` was already depending on it for real frame composition; the public way to assert about a rendered document is `expectDocument`. **The general form is worth keeping:** a helper written in a dev-only module because a test was its first caller becomes a production dependency the moment a second caller is not a test, and no layer rule objects, because the layers were never crossed.

**`measuresCorrectly` is a wrapper, not an implementation.** The conformance suite it runs is written with C04 — parameterised over a registry and a corpus, and deliberately free of anything test-runner-specific, returning failures as data so the caller asserts. C09's registry-completeness test, this method, and the reference app all drive the same code. It lives in `test/support/` until C09 exists to consume it, then moves here unchanged.

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
- **I2** — The eleven components in §3's absent list are not reachable from any entry point. **This was unfalsifiable until the entry points existed** — `src/index.ts` was `export {}`, so the claim held over a surface with no exports — and its first real run found `BlockRegistry` named in `tui-kit/testing`, where `renderToLines` took one as a parameter. The sharper half of that finding was not the naming: `createBlockRegistry` is exported from no entry, so the two functions were uncallable by any consumer. An export nothing can invoke is A03 §2's vacuity class reached through the surface rather than through a rule.
- **I3** — Builders return frozen blocks; there is no second description type.
- **I4** — A generated id is stable within one document and never rendered.
- **I5** — No builder infers a tone, glyph or action from a field name.
- **I6** — `b.live`'s behaviour is not configurable; only its renderings are.
- **I7** — `measure` never receives `tick`; animation cannot affect geometry.
- **I8** — `testing` and `fixtures` are absent from the production bundle. MG26 is the mechanical form, and it was false on the day it could first be checked: `shell/paint.ts`, `shell/composite.ts` and `shell/session.ts` imported `renderSequenceToLines` from `../testing/index.js`, so the built runtime entry reached `dist/testing/index.js` and both conformance suites behind it. **Nothing was mislayered** — L4 importing L1 is downward whichever directory it lands in — so no existing rule was wrong to stay silent. The helper had been written where its first caller was, and its first caller was a test. It is `presentation/render-lines.ts` now.
- **I9** — Startup validation severities are those of §8, and each cites the spec that set it.
- **I10** — The runtime entry exports no function that performs I/O except `createTui`.
- **I11** — The reference app lives in its own repository and consumes `tui-kit` as a published dependency, so the unused-export scan runs against `prism-tui` plus the app's declared import manifest, refreshed on each version bump. It is a reported signal, not a build gate.
- **I12** — `b.live` behaves identically in a transcript entry and in a pushed view. C23 drives both, so the difference between them is placement and input ownership (D4) and never the block's own lifecycle — a live block that worked in one and not the other would make D3's two renderings two implementations.
- **I13** — `tui-kit/testing` ships the document assertions, so no consumer reimplements them. `degradesTo1Bit` is the one that earns the module: it is B04's compliance sweep, and no consumer would write it themselves, which is exactly how the colour axis starts losing information invisibly.
- **I14** — `planColumns`, `cells` and `truncate` are public because a custom block kind cannot satisfy C09 I1 without them. A consumer measuring width with `.length` disagrees with the measurer, and the disagreement is silent.
- **I15** — Every block-returning `b.*` builder sets a `gapBefore` default **of its own** (§4), and an explicit `gapBefore` always wins over it — at every position, including the first, which is the only one where the two can disagree. The explicit value arrives through `BlockOpts`, which every one of them accepts; before that argument existed the invariant was unwritable as a test, and so was the half of §4 that promised it. The default is the builder's and not the block kind's: `b.steps` gaps and `b.spinner` does not, and both return `Steps`. A builder with no default is a kind whose rhythm silently depends on which adapter wrote it.
- **I16** — No entry point exports a type that declares work for the framework to perform unless something in `src/` performs it. `ViewRefresh` is the measured case: a consumer could declare a refreshing part, type-check, and never be called — A03 §2's vacuity class reached through the export list rather than through a rule. MG25 is the mechanical form, over free functions and constants; a declaration type is caught by the producer it belongs to appearing there.
- **I17** — `b.seq` is the only place a block's position changes what it carries, and it changes it at construction rather than at measurement (§4a). C04 §3a's ruling stands: a block measures the same wherever it is concatenated. Before this, no code anywhere stripped a first block's gap — the rule every S-series figure depends on was discipline, and the one file in `src/` that set `gapBefore` set it by hand, per position.

---

## 10. Commitments

1. Three entry points; `testing` and `fixtures` never reach production (I8).
2. Eleven of twenty-three components are invisible to consumers, and that is the measure of the layering (I2).
3. Every export is a compatibility obligation; an export used by neither app is removed. The claim is about the union of the two, since neither exercises the whole surface alone (I1).
4. Builders return frozen blocks, not descriptions (I3).
5. Ids are generated unless supplied, matter only for patched blocks, and are never rendered (I4).
6. A bare string is a cell; nothing is inferred from field names (I5).
7. `b.live` gives A02 §7's whole pattern by default, with fixed behaviour and overridable rendering (I6).
8. `b.live` works identically in a transcript entry and a pushed view, driven by C23 in both (I12).
9. Animation lives in block kinds; `measure` cannot see `tick` (I7).
10. `tui-kit/testing` ships the assertions, so no consumer reimplements them (I13).
11. Startup validation errors on anything that would render a session wrong, and warns on anything merely suspect (I9).
12. `planColumns`, `cells` and `truncate` are public because a custom block kind cannot be written without them (I14).
13. Every block-returning builder sets a `gapBefore` default of its own, and an explicit value always wins (I15, §4).
14. Nothing is exported that declares work no code performs; *available* is not an argument for *exported*, and neither is *specified* (I16, §3).
15. `b.seq` holds the rule that a first block does not gap, and it is the only place a block's position changes what it carries (I17, §4a).

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
- **T2.9** (I15): every `b.*` builder is enumerated and asserted to set the §4 default for its kind; a builder added without a row fails. For each, an explicit `gapBefore: false` and `true` overrides the default.
- **T2.11** (I17): `b.seq` clears a defaulted gap on the first block and on no other, and an **explicit** `gapBefore: true` on the first block survives it. The second half is the one that can be wrong: a `seq` that clears index 0 unconditionally passes every test written about the common case.
- **T2.7** (I5): a source scan finds no field-name-keyed tone or glyph table in `builders/`.
- **T2.8**: every block kind in C04's union has a builder — exhaustive over the type.
- **T2.10** (I16): MG25 — every exported value in `src/` is referenced by another `src/` module, or named in an allow-list that is **compared by equality**. A new test-only export fails until it is named, which is the arm the rule needs rather than the list: an allow-list checked by membership is one where the thirty-fourth entry arrives behind the thirty-first unread. Shown to fire against fabricated files.

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
- **T6.12** (I15): dropping a builder's `gapBefore` default → T2.9 fails on that kind. Without the enumeration the surfaces render dense while the S-series draws them spaced, which is the gap the audit found.
- **T6.2** (I3): a builder returning a description → T2.4 fails, and consumers learn two type families.
- **T6.3** (I5): inferring a tone from a field name → T2.7 fails, and the fifth verb breaks silently.
- **T6.4** (I6): making backoff configurable → the isolation guarantee becomes optional.
- **T6.5** (I7): passing `tick` to `measure` → T2.5 fails, and a spinner shifts the viewport.
- **T6.6** (I8): `testing` reachable from the runtime entry → T2.3 fails.
- **T6.7** (I1): an export nothing consumes → T2.2 fails, and the surface starts accreting.
- **T6.8** (§8): erroring on an adapter/manifest mismatch → T3.11 fails, and a shrunk manifest stops the app starting.
- **T6.13** (I17): `b.seq` clearing the first block's gap unconditionally → T2.11's second half fails, and an author who asked for a leading blank row silently does not get one.
- **T6.9** (I16): MG25's allow-list compared by membership rather than by equality → its fabricated-file test fails. Membership passes for every list that has ever been too permissive, which is the failure this project has now found four times — SS40's directory scope, CP6's hand-written surfaces, MG24's constant-dominated form, and this one, pre-empted.

---

## 12. Out of scope

| Not here | Where |
|---|---|
| What any export does | The component that owns it |
| The README's prose | Implementation |
| The reference app | Its own spec |
| Prism's adapters, manifest and theme | `prism-tui` |
| Versioning and release policy | Implementation |
