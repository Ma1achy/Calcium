# C09 — Block library

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L1 presentation |
| **Depends on** | C04 (types, measurement contract) · C10 (`resolveTone` — same layer, acyclic) · `terminal/escapes.ts` (`sgr`, at run time — §3) · `TerminalCapabilities` injected |
| **Consumed by** | C11 C12 (register through it) · C13 C14 (measurement) · C15 (overlays render blocks) · L4 |
| **Source** | A01 D35–D37, F1 · A02 §2, §5 · C04 §5 |
| **Status** | Draft |

---

## 1. Purpose

C09 is where a `Block` becomes rows on a screen. It owns the **registry** — the pairing of each block kind with a `measure` and a `render` — and ships **sixteen** default kinds; `table`, `plot` and `patch` bring the union to **nineteen**.

The registry lives here rather than in C04 because `render` needs theme (L1) and capabilities (L0 terminal), and a registry at L0 data would import upward and sideways. C04 owns the schema and the measurement *contract*; C09 owns the implementations that satisfy it.

The obligation that dominates every decision in this component: **`measure(block, w)` must equal the number of rows `render(block)` occupies at width `w`.** C14 virtualises on measured heights without rendering, so a divergence does not produce a wrong-looking block — it produces a viewport that drifts as the user scrolls, which is far harder to diagnose. Every kind's two halves are written as a pair and tested as a pair.

---

## 2. Public interface

```typescript
type FocusState = Readonly<{
  blockId: string;
  rowId:   string | null;             // null = the block itself is focused
}>;

type RenderContext = Readonly<{
  width:        number;
  theme:        ResolvedTheme;        // C10
  capabilities: TerminalCapabilities; // C02, injected
  focus:        FocusState | null;    // C11 / C15 use it; most kinds ignore it
  tick:         number;               // monotonic animation counter — see below
  measureChild: MeasureFn;            // Seam 1, on the render side — see below
  renderChild:  (block: Block, width: number) => ReactElement;
}>;

function cells(text: string): number;          // grapheme-aware display width
function graphemes(text: string): readonly string[];   // the cluster stream, for C17
function clusterWidth(cluster: string): number;        // one cluster's cells
function truncate(
  text: string,
  width: number,
  caps: TerminalCapabilities,
  from?: "start" | "end",          // default "end" — removes from the end, keeps the start
): string;

// The two that operate on a line that already carries SGR (§5a).
function fitStyled(text: string, width: number, reset: string): string;
function sliceCells(text: string, from: number, to: number): string;

interface BlockDefinition<B extends Block = Block> {
  kind:    string;
  measure: Measure<B>;                // contract from C04; receives measureChild
  render:  (block: B, ctx: RenderContext) => ReactElement;
  // §2a — a valid smaller block covering rows [from, to). Optional: a kind that
  // does not divide omits it and is atomic by having no member.
  window?: (block: B, width: number, from: number, to: number) => Windowed<B>;
  // C26 §5 — what this block offers to keyboard and pointer, from ONE declaration.
  // Optional on the same argument as `window?` above, and it is the same decision
  // rather than a second one that agrees: an absent member cannot be deleted by a
  // later edit while a branch returning `[]` can. Pure in (block, width) and never
  // in focus, which is what keeps C11 I14 true by signature. UNBUILT.
  elements?: (block: B, width: number, measureChild: MeasureFn) => readonly NavElement[];
  // §2c — the columns the content occupies at `width`, in [1, width]. Optional on the same
  // argument again: a kind whose drawing is its width declares nothing, and the registry
  // answers the width for it.
  width?: (block: B, width: number, widthChild: WidthFn) => number;
}

type Windowed<B extends Block = Block> = Readonly<{
  block:    B;       // a real block of the same kind, measured the ordinary way
  skipRows: number;  // leading rows of it the caller drops
}>;

interface BlockRegistry {
  register(def: BlockDefinition): void;
  get(kind: string): BlockDefinition | undefined;
  seal(): void;
  measure(block: Block, width: number): number;
  render(block: Block, ctx: RenderContext): ReactElement;
  measureSequence(blocks: readonly Block[], width: number): number;
  // C14 §4b — the slice of a sequence that fills rows [from, to), on block boundaries
  // where a kind declares no `window`; the rows skipped before the first kept block.
  windowSequence(blocks: readonly Block[], width: number, from: number, to: number):
    Readonly<{ blocks: readonly Block[]; skipRows: number }>;
  renderSequence(blocks: readonly Block[], ctx: RenderContext): ReactElement;
  // C26 §5 — one block's elements, block-local; and a sequence's, lifted in BOTH axes.
  elementsOf(block: Block, width: number): readonly NavElement[];
  elementsIn(blocks: readonly Block[], width: number):
    readonly Readonly<{ blockId: string; element: NavElement }>[];
  readonly kinds: readonly string[];
  readonly sealed: boolean;
}

function createBlockRegistry(opts: { defaults?: boolean }): BlockRegistry;
```

**`FocusState.selected` is the selection's extent** (C26 I16) as `(blockId, rowId)` pairs over the
*entry's* element list, head included, **absent** when the extent is the head alone. Every block in the
entry is handed the same list and keeps the pairs naming itself, so a block that does not hold the head
still paints its selected rows from one value (C11 I14). Absent and `[]` draw alike and key alike
(C22 I58). Added 2026-09-05 with the writer (`focusFor`) and the axis, per C22 I71.

`measure` on the registry is the dispatcher, and it passes **itself** as each definition's `measureChild`. That is how `panel`, `group` and a table's expanded detail measure children whose kind they do not know, without any kind importing the registry.

`measure` and `render` on the registry are the dispatching entry points. An unregistered kind resolves to the `raw` definition rather than throwing — a document referencing an unknown kind still renders, degraded.

**`measureSequence` and `renderSequence` are where `gapBefore` is applied** (C04
§3a). A block's own height never includes the gap before it, so a sequence —
a document's top level, a `panel`'s children, a `column` group's children — is
`Σ measure(b, w)` plus one row per block declaring `gapBefore`. Stated once, on
the registry, because every composer needs the same arithmetic and a composer
that inserted spacing of its own would make a document's height unknowable from
the document (C23 §2). A `row` group is not a sequence: its children sit side by
side, so a gap before one of them is ignored rather than being an error.

**`elementsIn` lifts a block's elements into the sequence's coordinates in both axes, and the
origins are the painter's.** `elementsOf` answers block-local `rows` and `cols` (C26 §5);
`elementsIn` adds each block's top row **and left column**, then descends into a container that
declares no elements of its own (I30). The origins are read from the functions the renderers
place children with, never restated: a `panel`'s children begin one row below its top border
and one column in from its left rail — none when the width is under three and the rails are
dropped — at `insetWidth`; a `column` group's follow one another down at column 0, `gapBefore`
counted as `measureSequence` counts it; a `row` group's sit side by side at `childWidths` plus
`ROW_GUTTER` between each pair, only the first `placeable` of them, and a `gapBefore` there is
ignored as the renderer ignores it; a `mosaic`'s cells are `mosaicRects`' `left` and `top`, and
a `scroll`'s children are content rows from its top (C26 I3). **Measured before the rule** (F756,
F757): the walk lifted rows and never columns, so two 39-wide tables in an 80-column `row` group
both answered `cols [0, 39)` and a click at column 50 focused the first; and it reset every
child of a container to the *container's* top, so a `panel`'s table answered its rows one above
where the frame drew them and a second table in a `column` group overlapped the first. Every
one of those lists satisfied C26 §5's four predicates block by block, which is why the
predicates are also asserted over the lifted list (C26 §5, T2.29–T2.31).

**`renderChild` and `measureChild` are Seam 1 on the render side, and the registry passes itself for both.** A container renders children whose kind it does not know, for the same reason it measures them, and neither may import the registry (I7). `measureChild` is on the context because a container's *frame* has to be as tall as its contents: `panel` draws a border column of `measureChild(child, w - 2)` rows beside children rendered at that width, and the title lives in the top border (S13), which is why the border is drawn rather than delegated to a box-drawing option. That makes I1 visible instead of silent in the one place a violation would otherwise hide — a `panel` whose measurer and renderer disagree draws a border that does not close. **`footer` sits in the bottom border for the same reason `title` sits in the top**, and changes nothing about measurement: the row is drawn either way, so this is a use for a row that already exists rather than a new one. S12 §2 and S13 §2 both draw it, and neither can put those keys in the frame's footer — a pushed view leaves header and footer untouched (C15 T4.4).

**Animation state arrives through `ctx.tick`.** `steps` shows a spinner, and a renderer must stay pure, so the frame index cannot come from a clock inside the block. `tick` is a monotonic counter incremented by C03's `spinner` commit; a renderer computes `frames[tick % frames.length]`. Nothing else in C09 reads it, and `measure` never does — animation must never change height.

**There is no `onAction` on the context, and for the life of the project there was one.** `onAction: (a: Action) => void` sat in this listing as a required member, and the measurement is the same shape as F85's: **no renderer under `blocks/kinds/` read it**, the only writers were two no-op defaults in `render-lines.ts` (`options.onAction ?? (() => undefined)`), and both product call sites — `shell/paint.ts` and `shell/composite.ts` — omitted it, so the no-op was what every real frame rendered against. The route an action actually takes never touched the context: C11 renders a row's actions and C16 fires them (C11 §9), `enter` on a focused row reaches C23's dispatcher through `KeyDeps.onAction` (C23 I37), and C23 owns the dispatch. F21 recorded the gap — *no keystroke reaches the dispatcher* — and the roadmap closed it with the `enter → rowActivate` route, which is the route that made this member's emptiness permanent rather than pending. **A required member with no reader is a field every caller must invent a value for** (F58b, F85), and the only value anyone ever supplied was a stub; removing it makes supplying one fail to compile rather than fail to matter. The supplier-exclusivity clause C23 §3a and I16 carry is about the dispatcher, not about a context field, and reads that way now.

**And for the life of the project nothing incremented it, which this section asserted the whole
time.** *A monotonic counter incremented by C03's `spinner` commit* described a chain with three
links and none of them was joined: `commit("spinner")` was called from six test files and nowhere
in `src/`; C22's `visibleRows` omitted `tick` from the render options, so every block in the
transcript rendered at `?? 0`; and the line cache had no tick axis, so a supplied one was served
the held lines. Measured over ten real frames of a real session, `steps` drew **one distinct
spinner glyph** where the same block through the test harness drew **ten** (F227).

**Patching the omission alone moved nothing** — two of the three were each sufficient, so the
obvious repair was indistinguishable from doing nothing until the cache admitted the axis too.

**Two of the three were already recorded** — C22 I60 and its §6c trace row 10, correctly and as
a coupled pair, and filed as a hypothetical because from inside a cache they are one. The link
recorded nowhere was C03's, and it is the one that made the other two look dormant. **The sentence
above is C09's own**, and it asserted a chain this component cannot see the far end of.

**Fixed in C22, and this paragraph was left in the present tense for one commit** — along with
§3a's and I32's, and C03 §3's. The repair belonged to the component that held the wiring, so
C22's four statements of the defect were rewritten and the two components that hold the *subject*
— C03 declares the counter, C09 consumes it — went on describing it as current. **Which is the
half a reader meets**: nobody looking up how `status` animates opens C22. F233.

**Which kinds animate is C09's fact, and `blocks/animation.ts` is where it is stated.** `ANIMATES`
is a `Readonly<Record<BlockKind, boolean>>` and never a `Set` — a record is checked for
exhaustiveness in **both** directions, so a kind added to the union without an entry is a type
error and an entry naming a kind that no longer exists is one too. A `Set` of two strings compiles
with either missing, which is F228's class: a hand-maintained list beside a generated one, where
the hand-maintained list is the one that reads as authoritative. Two entries today — `status` and
`steps` — and nothing else in C09 reads `ctx.tick`.

**`animationIntervalOf` descends into containers, and the mutation pass is the only thing that
said so.** Removing the descent survived every row until the fixture put the spinner inside a
`panel` — which is not a contrived arrangement but exactly what `b.live` builds, because `Panel`
is the only kind with a title and the title is where a live part says what state it is in. **The
fixture was testing a shape the framework does not produce.** The interval comes from the block's
own set through the same lookup as its frames, so a caller cannot hold one set's frames against
another's tick.

**This module shipped with no text in this spec at all** — 78 lines and three exports in C09's own
directory, documented only by a test row in C22's list, because the commit that added it was a C22
repair (F233).

### 2a. `window` — a block reduced to a valid smaller block

**The transcript virtualises at *entry* granularity and then renders each entry
whole.** A 5,000-line patch renders 5,000 lines, keeps thirty, and with
highlighting tokenises all 5,000 first — per keystroke, at 2.8 seconds a frame
(`docs/notes/TUI_NOTE_render_chain_baseline.md`). `window` is what bounds it.

**A window is a block, never a list of rows** (C25 I18's rule, generalised).
`Layer.content` and `TranscriptEntry.doc.blocks` are both `Block[]`, so nobody
can hand back a slice of rendered output — they hand back a smaller block, which
the registry measures and draws through the same path as everything else. That
is what keeps I1 whole and stops a second height codepath appearing.

**`windowPatch` proves the shape and not the contract.** `presentation/patch/window.ts`
returns a valid smaller `Patch`, which is the part that generalises. But its
window is *a slice plus sticky headers* (C25 I18): the path header and each
touched hunk's header are forced, and they cost rows the full rendering already
counted. A transcript window may not do that — C14 measured the entry at its full
height and addresses rows inside it, so an inserted row makes the rendered entry
disagree with the index, which is drift three components from its cause.

**So the seam returns a block *and* a residual offset.** The caller renders the
returned block and drops `skipRows` leading rows. Three things fall out and each
would otherwise be a defect:

- **An indivisible unit is expressible.** A run of changed lines in a split patch
  is one unit (C25 I19); a window opening inside it returns the whole unit and a
  `skipRows` that steps over what the caller did not ask for.
- **A sticky header is expressible.** A `table`'s header row and a `patch`'s path
  row are part of what makes the smaller block *valid*; they are paid for in
  `skipRows` rather than smuggled into the caller's row count.
- **Exactness survives both.** The rows the caller keeps are the rows the full
  rendering would have produced, which is what makes the window invisible.

**The height property carries `skipRows`, or it is not the property:**

```
measure(w.block, width) − w.skipRows  ===  to − from
```

Not `measure(...) === to − from`, which is the form the seam invites and which is
false for every window that costs slack. It is checked **generically over every
kind that declares `window`** by `src/testing/measurement-conformance.ts` — the
same suite a consumer runs for `measure`/`render` — so an app's own arm is held
to it too. Without that, a consumer's window can be silently short and the frame
describes a document nobody holds.

**And the residual is a pair, because slack falls at both ends.** `skipRows` is
leading only — its own sentence says *the leading rows of it the caller drops* —
and that was sufficient for every kind that took the seam first: `patch`'s slack
is a path header and a hunk header, which lead; `logs` and `keyValue` have units
of one row and cannot overhang at all. **`table` is the first kind whose last
unit can hang past `to`** — a range ending inside an expanded row gets the whole
row, and the surplus is at the end (F428). So the identity is:

```
measure(w.block, width) − w.skipRows − w.dropRows  ===  to − from
```

**This names a drop the consumer has always made.** `session.ts` renders the
window and writes `rows.slice(0, ve.takeRows)`: trailing rows past the viewport's
own count have been discarded on every frame since the seam landed, and no
contract said they could be. The weaker repair is worse than either — relaxing
the identity to `≥` would let every wrong answer inside the bounds pass, which is
the one thing the property exists to prevent.

**And `window` takes `measureChild`, for the reason `elements` already states one
member below it.** A table row's offset is `header + Σ(1 + detailHeight(row))`
and `detailHeight` measures the expanded detail through the child seam, so the
unit boundaries are **not a function of `(block, width)` alone** and a window
that guessed them would slice at the wrong row. The sentence was already
written — the right kind, the right quantity, the right reasoning — on the
neighbouring member; `logs`, `patch` and `keyValue` have units of one row and
never needed it, so nothing connected the two, and `table` could not divide for
want of a parameter rather than for want of a rule.

**A plot has no `window` and never will.** C12 I1 makes a plot's height a
function of the block alone: reducing its series changes nothing and reducing its
`height` rescales the curve rather than windowing it. **Atomicity is expressed by
the absence of a member**, not by a branch — a branch is something a later edit
removes, and an absent member is not.

**No block renderer reads the environment.** Capabilities arrive through `ctx`, never from `process.env` — C02's I5 extends here, and a renderer probing for itself is the bug that produces a table in ASCII beside a sparkline in Unicode.

### 2b. The cap — the registry's bound on one block's rows

**Ruled in C14 §4b, held here because the code is the registry's.** `createBlockRegistry({
maxBlockRows })` — default `DEFAULT_MAX_BLOCK_ROWS`, 2 000 — is the most rows one block may
occupy, and the registry applies it **before any definition sees the block**: `measure`,
`render`, `elementsOf` and `windowSequence` each resolve a block to its *capped form* first.

**The capped form is the kind's own `window`, which is why no kind implements the cap.**
For a block whose `definition.measure` exceeds the cap, the form is
`window(block, w, 0, cap, measureChild).block` with `capped: { shown, total }` attached, where
`shown` is the form's own measured rows and `total` the block's. `measure` answers `shown + 1`;
`render` draws the form and then one row — `… 2,000 of 50,000 rows`, `tone("muted")`, `~` on an
ASCII terminal — clamped to the width so it is one row at every width the measurer counted. A
kind with no `window` has no capped form (C14 I26), so `plot` is exactly as atomic as I27 says,
and a block within the cap is returned **by reference**, so nothing downstream can observe the
cap on a block it does not touch.

**`capped` is view state on `lineRange`'s argument** (I25a, C04 I82): written by the registry,
read by the registry, refused from a far side. It is attached *after* the definition's window
and re-attached by `windowSequence` when a window reaches the marker row, because a window may
build a fresh block — `patch`'s does — and a field a kind can drop is not view state. The
registry reads it through a cast until C04 names the field (a request is recorded, not assumed).

**The composition, in the registry's own terms.** `windowSequence` measures the capped form,
windows it for `[from, min(to, shown))`, strips `capped` when `to ≤ shown` and carries it when
`to > shown`; a window over the marker alone asks for `[shown − 1, shown)` and charges the
content row to `skipRows`, because no kind's window returns zero rows (C11 I20). The floor (I33)
applies after the cap. The gap (C04 §3a) is the sequence's and survives the spread.

**What the measurement said and what it did not**, because a bound owes its figures (C14 §4b):
paint is ~0.25 ms a row for every kind and linear with no knee, so the default is a policy —
fifty screens, and `MAX_ROWS`'s figure — rather than a number the table chose; and the
whole-block `measure` the roadmap named as the cost is 0.6 ms for a 50 000-row `table` and
cannot be bounded by a marker that must say *of 50 000*. `code`'s first paint tokenises the whole
text whatever the window, 1 696 ms at 50 000 rows, and a `code` window opening at line 0 could cut
its text because nothing precedes the slice — owed here, to `kinds/code.ts`, and not built around.

---

### 2c. `width` — the content width, and the two kinds of answer

```typescript
type WidthFn = (block: Block, width: number) => number;   // the registry's `width`, handed to containers
interface BlockDefinition<B extends Block = Block> {
  // …
  width?: (block: B, width: number, widthChild: WidthFn) => number;
}
```

**`width(block, w)` is the columns the block's content occupies when rendered at `w`**, in
`[1, normaliseWidth(w)]`, pure in `(block, width)` as `measure` is (I2). It is the answer C04 I45
said no seam gave, and C04 §3 *Both axes* is its first consumer: a group aligning a child `centre`
or `right` renders it at this width and offsets it by the remainder.

**Two kinds of answer, and the absent member is the second.** A kind whose content has an edge —
text, chips, a table with no flex column, a bordered box around such things — answers with the
edge. A kind whose drawing *is* its width — a `rule`, a `progress` bar, a `plot` frame, an `image`
scaled to its cell, a `scroll` box — has nothing narrower to report, and **declares no member**:
the registry answers `normaliseWidth(w)` for it, and every alignment of it is a no-op that C04 I101
states. Optional on `window?`'s argument: an absent member cannot be deleted by a later edit while
a branch returning `w` can.

**The contract that makes it safe to render at**: `measure(b, width(b, w)) === measure(b, w)`
(I43). A block is the same height at its content width, so a group that renders a child narrower
than its cell has not changed the row the child was measured for. The kinds that answer keep it by
construction — a `notice` reports its longest wrapped row, so every row still fits; a `raw` its
longest line; a `pills` block its widest chip row; a `keyValue` with no bar its key column, gap and
longest value; a `code` block its longest row; a `table` its planned columns and gaps when it has
rows, no action bar and no expanded row — a flex column is the plan's business, since the plan hands
it the residual and an uncapped one sums to the width on its own while a `maxWidth`-capped one does
not; a `column` group whose children are all
`left` the widest child, and a `row` group whose shares are all `{cells}` their sum and gutters; a
`panel` two more than its widest child, or its title or footer plus their furniture, whichever is
wider (I44). A `keyValue` with a bar fills because the bar absorbs the residual; a `table` with an
action bar, an expanded row or no rows fills because those rows are clamped to the cell rather than
to the columns. A guard for a flex column was written and the mutation pass found it redundant on
its first run — the plan already answers, and the guard would have answered wrongly for a capped
flex column (F818).

**A container answers only when its layout does not depend on the width it is given** — the
clause the build added. A weighted `row` rendered at its own sum re-divides that sum, so its
children land at different allocations and the picture is a different one; a `column` holding a
`right` child would move that child when the column's cell shrank to the widest one. Both fill.
A fixed-share `row` and an all-`left` `column` render identically at their content width, which is
the property I43 guards on the vertical axis and this sentence guards on the horizontal.

The registry's `width(block, w)` clamps whatever a definition returns into `[1, normaliseWidth(w)]`
and reports a value outside it through `onError` (I8's shape): a definition that answers wider than
its cell has described a block the cell cannot hold.

## 3. The nineteen kinds

Each is a `measure`/`render` pair. The measurement column restates C04 §3 as an obligation on the implementation.

| Kind | Measure | Notes on render |
|---|---|---|
| `rule` | 1 | Label, optional meta, then a fill to `width`. **An empty label draws an unbroken line** (I21) |
| `notice` | `ceil(cells(text) / w)` | Glyph, then wrapped text; `error`/`warn` require the glyph (C04 I5). **Declares one block-level element — the whole notice, `activate: action`, `copy: text` — exactly when `action` is present or its glyph is in `GLYPH_ELEMENT`** (C04, C26 §5, I47), none otherwise; under focus the glyph and text go `accent` over the selection ground (C26 §7) |
| `keyValue` | rows | Two columns; key column sized to the longest key, capped at 20 |
| `table` | delegated to C11 | Registered by C11, not here |
| `steps` | steps | Spinner frame while active; tick or cross when settled |
| `status` | `height` | **A bordered box the registry draws, never the definition** (I31). One of three contents — a failed render, a first fetch in flight, a backoff counting down. **Two ladders, one on each axis**, and neither may change the row count. No `window` (I27) |
| `logs` | lines | **Never wrapped.** Timestamp and level are fixed-width; the **message** takes the residual and truncates. Predictable height is what makes a tail scroll smoothly |
| `events` | events | Timestamp, type, message on one row; message truncated |
| `plot` | delegated to C12 | Registered by C12 |
| `progress` | 1 | Label, bar, percentage; bar takes the residual width. **The bar is bounded by its cells and the number is not** — see below |
| `code` | lines, or wrapped lines when `wrap`; **the lines in `lineRange`** when a window set one | Syntax highlighting via the **`syntax` palette** (C10 §2), not tones — eight roles do not fit ten semantic slots. Truncates by default; wraps when `wrap: true`. **Windows by source line with `text` kept whole and `lineRange` pinned** (I25a, C04 I82) |
| `comparison` | rows + 1 | Field, a, b, comparator; three equal columns |
| `pills` | `ceil(totalCells / w)` | One logical row that may wrap |
| `tip` | `ceil(cells(text) / w)` | Dim, with fill actions |
| `panel` | children + 2 | Border, title and footer; children measured at `w - 2` |
| `scroll` | `height`, plus one residue row when the content overflows | A bounded box: `height` rows of content, and the marker is chrome the container adds on top (C04 I47, C04 I49). **Declares `elements` at block level and no `window`** — a region whose height is declared cannot measure less without becoming a different box |
| `mosaic` | `height`, exactly | A declared grid of absolutely positioned cells (C04 I71). **Not a bounded box in `scroll`'s sense**: every cell bounds its own child, so I1 holds through an over-tall child rather than diverging (I35) |
| `group` | sum or max of children | `column` sums children measured at `w`; `row` takes the max of children measured at `floor((w - gaps) / n)`, one cell of gutter between each pair (C04 §3) |
| `raw` | lines | Pre-formatted, emitted as-is with control characters stripped. **Windows by line**, with no pin — nothing is derived from lines outside the slice (I25) |

**Every measure in this table is floored at 1** for a block that is present (C04 I17). `ceil(cells("") / w)` is 0, and an empty `notice` still renders as a row; the floor is a rule over the table rather than a clause in three of its entries. The one legitimate zero is a container with no children, which is the absence of content rather than empty content.

**Container widths are C04 §3's, not each measurer's invention** — `panel` and a table's expanded detail at `w - 2`, a `column` group at `w`, a `row` group at the equal split. A measurer that passes `w` through unchanged to a child agrees with nothing that renders, and it is the failure mode I1 cannot catch on its own, because it only shows once a child wraps.

`table`, `plot` and `patch` are declared in C04's union but registered by C11, C12 and C25. C09 owns the registry and sixteen kinds; those three are large enough to be their own components and register into the same registry as an app-defined kind would — which is the proof that the extension mechanism is real rather than privileged.

That it is three rather than one matters. A single privileged exception is indistinguishable from a special case; three components using the same public `register`, each removable by deleting its call, is the mechanism being exercised rather than described.

### 3a. `status` — one box, three contents

**Three states a block can be in that are not drawn normally**, and one implementation:

```
error       an operation failed and nothing more is coming. Terminal
retrying    the far side failed and a backoff is counting down. Not a bug
loading     no data yet, first fetch in flight. Not a failure at all
```

**A call that fails or retries composes one of these under its head, and nothing composes a red line instead** (F827). The call grammar's states are RUNNING, WAITING, DONE, FAILED, RETRYING, DENIED and CANCELLED; the two that carry a body of their own carry this kind — the error rule, the mark, the message, at the block's committed height — and the head above it is kept, because *what ran* is the first thing a reader needs and the error is the second. The shell's composer is the one place a notice is written by hand — by literal or by builder call (A03 SS56, widened; C23), which is F406's class closed as a class rather than as twelve sites.

**`error` read *the definition's renderer threw. A bug.* and that was narrower than the kind**
(F406). `retrying`'s own line has always said *the far side failed*, so this was never scoped to
renderer faults — and the narrow gloss is why the framework's own error documents were built out of
`notice` for twelve call sites: a spawn that cannot find its binary, a transport that times out, a
one-shot fetch that will not be retried. Each is terminal, none is a bug, and each drew a red line
of text beside a kind that draws the figure above.

```
┌─────────────────────────────────────────┐
│                                         │
│  ───────────── ERROR ─────────────      │
│  ▲ plot failed to render:               │
│    Cannot read properties of undefined  │
│                                         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐          retrying is the error box
│                                         │          plus one line — compositional,
│  ───────────── ERROR ─────────────      │          not a third rendering
│  ▲ connection refused                   │
│  ⠋ retrying in 8s (attempt 2)           │
│                                         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐          loading has no error, so no
│                                         │          rule and no tag
│                                         │
│            ⠋ loading (4s)               │
│                                         │
└─────────────────────────────────────────┘
```

**The registry draws it and the definition never does.** For `error` the reason is not size: a
kind whose renderer is broken cannot be trusted to draw its own failure, and a `renderError` on
`BlockDefinition` would have the boundary calling into the thing it is containing. For `loading`
and `retrying` the reason is that there is nothing to draw — a definition with no data has no
picture. A per-kind hook that drew a plot's axes while loading was considered and refused: it is
nicer, and it costs a hook on every definition to buy what the border already says — *the block is
here and it is this size.*

**`LiveSpec.renderError` and `LiveSpec.renderLoading` are a different member and survive.** They
are the *consumer's* overrides for a live part's fetch, ruled deliberately overridable by C24 §5,
and they have nothing to do with a broken definition. Only their defaults become this block.

**The cost, stated**: a plot with `plotFrame: "rule"` still gets a box, and a loading plot shows
no axes. Both are deliberate.

#### The rung a box inside a border needs

**The height ladder couples the tag to the border, and that made every option wrong for a box
inside a panel** (F406). The tag first appears at the rung where the border already has, so *tag
without border* was not expressible — and a `status` that a live part puts inside `b.live`'s own
panel is framed already. Measured, at 72 cells:

```
h=2, today                              h=4, the tag's first rung
┌ always failing ──────────────┐        ┌ always failing ──────────────┐
│▲ ECONNREFUSED 127.0.0.1:9999 │        │┌────────────────────────────┐│
│⠋ retrying in 6s (attempt 2)  │        ││────────── ERROR ───────────││
└──────────────────────────────┘        ││▲ ECONNREFUSED 127.0.0.1:99…││
                                        │└────────────────────────────┘│
   no tag: reads as a red line          └──────────────────────────────┘
                                           the tag, at two nested borders
```

**C23 I51 chose the left one and its reason was right about both options** — *at 3 the box spends a
row on a second border inside the first and at 4 it buys the ERROR tag at two nested borders*
(F234). What it could not choose is the figure, because the figure is neither:

```
framed, three rows
┌ always failing ──────────────────────────────────┐
│───────────────── ERROR ──────────────────────────│
│▲ ECONNREFUSED 127.0.0.1:9999                     │
│⠋ retrying in 6s (attempt 2)                      │
└──────────────────────────────────────────────────┘
```

**So `framed` is a second ladder on the same axis, not a rung on the first.** A framed box draws no
border at any height — its container has one — and spends the rows it saves on the tag and the
content: the tag at two rows for the failed states, which is *tag + message*, and a third row buys
`retrying` its activity line. **`loading` is unchanged at every height**, because it has no tag to
gain and its whole content is the line that moves.

**Who sets it is the same answer `height` has**: whoever puts the box inside a bordered container
knows, and a consumer holding one does not. It is not on `b.status` (C24 I30, §4b) and MG27 holds
that with a reason keyed `status.framed`.

**The stated cost**: a framed box has no border of its own, so at `H ≤ 1` there is no evidence the
height was honoured — the same clause the free-standing ladder carries at `H ≤ 2`, one rung lower
because the border was never this box's to draw.

#### The two ladders, and neither may change the row count

**The height ladder allocates rows; the width ladder decides what goes in them.** `measure` has
already answered and the box is bound by that number (I11, I31), so a width decision that removed
a row would break I1 through the one path built to preserve it. **Where the width ladder drops the
tag row, the row is given to the message** rather than left blank — a third of a three-row box
saying nothing is worse than a longer message.

**Height.** The furniture is two borders, two blanks and the tag row, so the full figure needs
**six**. Padding is dropped as a pair, because one blank and not the other reads as an off-by-one
rather than as a decision.

```
H ≥ 6   border · blank · tag · content ×(H−5) · blank · border
H = 5   border · tag · content ×2 · border          the blanks go, together
H = 4   border · tag · content · border
H = 3   border · content · border                   the tag row goes
H = 2   content · content                           the border goes
H = 1   content, truncated
```

**At `H ≤ 2` the border is gone, and §6's argument goes with it.** *The border is the evidence the
height was honoured* — a bare message with blanks below is indistinguishable from a block that
under-drew — and that argument holds at three rows and above. At two and one there is nowhere to
put a border, so the evidence is unavailable rather than withheld, and the ladder says so here
rather than leaving a reader to notice.

**At `H = 1` the message wins and the retry line is dropped.** A countdown without its cause is a
number nobody can act on; the cause without the countdown is still the fact. It also makes `error`
and `retrying` degrade to the same figure at one row, which is honest — at one row they are the
same fact.

**Width, and this ladder was missing.** ` ERROR ` is **7 cells**; a rule needs at least one dash
each side, so it needs **9**. Padding is one cell inside each border. The content width is `W − 4`
padded, `W − 2` bordered bare, `W` unbordered — and **padding is dropped before the border, the
border before content.**

```
W ≥ 13   bordered, padded     content ≥ 9    ───  ERROR  ───
W 11–12  bordered, padded     content 7–8     ERROR , no rule
W 9–10   bordered, bare       content 7–8     ERROR , no rule
W 3–8    bordered, bare       content 1–6    no tag row — ▲ carries it
W ≤ 2    unbordered           content W      the message, truncated
```

**A height ladder cannot reach this.** Every rung above is a *structural* interaction — two rules
both holding at rest, with no event between them — and the figure was indexed on height alone,
so a `group: row` handing a block five columns would have drawn a tag that does not fit and a
rule with no room to be one. That is C19's lesson in the other axis, and it is why this component
carries a classification table below as well as the ladders.

#### Animation

**`status` animates, full stop — no state-dependent branch.** `retrying` is the error box plus a
spinner line, so a rule excluding `error` from animating breaks the state composed out of it and
then needs a per-state exception where a simple rule would do. **`error` being visually static is
a consequence of its content, not a rule**: an error box with no spinner in it draws the same
bytes every tick, so the diff writes nothing and the stickiness is free.

**It names its set and the interval comes from the set.** `spinner?: SpinnerName`, defaulting to
what `steps` resolves to — `DEFAULT_SET`, `braille`, 80 ms — so the same glyph means *waiting* in
`steps`, in loading and in retrying without a second decision. `spinnerIntervalMs(name)` is the
same lookup as `spinnerFrames`, so frames and interval cannot come from different sets.
**`braille` is width-stable on both conventions** and does not fall to ASCII at
`ambiguousWidth: "wide"`; seven of the sixteen sets do, and a consumer naming one of those gets
its ASCII pair, which is a tier rather than a refusal.

**The spinner comes from `tick` and the numbers come from fields.** An elapsed counter cannot come
from `tick` — C03 coalesces and drops commits under load, so tick and wall-clock are not in a
fixed ratio — and it cannot come from a clock, which this layer may not read. So `retryInMs`,
`attempt` and `elapsedMs` are written by whoever holds the clock, exactly as `retryInMs` already
is. Two sources for two things, because one is appearance and the other is a measurement.

**`RenderContext.tick` advances, and for the life of the project it did not** (F227). All three
links are joined: C03's commit is raised from C22's ticker, `visibleRows` supplies the counter,
and the line cache carries a `tick` axis **per kind**, so an entry holding nothing animated keys
exactly as it did (C22 I60) (C22 I60a). The kind is written against a working counter and degrades to
a still frame without one — which is what it did, and the degradation is the reason a suite of
sixteen spinner sets stayed green over it.

**Who constructs one, and at what height** — three producers, and two of them were absent for as
long as the kind existed. The registry supplies the number `measure` already committed when a
renderer gives way (I31); C23's two framework defaults **choose** theirs, at 2 for `loading` and
`retrying` and 1 for `error`, because both land inside a `panel` that already draws a border and
because `error` has no activity line to put in a second row (C23 I51, F234). **`elapsedMs` and
`attempt` had no writer anywhere in `src/`** until C23 I52, so two of `activityLine`'s three arms
were unreachable from any session while sixteen spinner sets shipped fully tested — the same
shape as the counter above, one field down.

**The observable cadence is `max(set, window)`.** The braille default declares 80 ms and C03's
`spinner` window is 100, so the default runs at 10 fps rather than 12.5 — C03 §3's trade, applied
unconditionally, and written down in C22 I60a because neither half mentioned the other.

#### 3a-bis. The height the message needs, and the width it does not get

**Height fits the content; width never does, and the asymmetry is the ruling.** A block does not
choose its width — the region does. A 40-column terminal, a `group: row` handing out
`floor((w − gaps) / n)`, a panel's border taking two cells: there is nothing to expand into, and a
block wider than its region is I1's over-draw in the other axis. **So: wrap to the width you have,
grow the height to fit the wrap.**

The mechanism is C04's `minHeight`, which already exists and already works — the registry takes
`max(definitionRows, floor)` on both sides of I1 (I33) and the shell issues the request after the
frame (C22 I69). **Only the number was wrong**: it was the constant `ERROR_MIN_ROWS` whatever the
box had to say, so a long message was cut with no mark.

**`rowsFor` wraps at the top rung's content width, and that dissolves a fixed point.** The rung
decides the padding, the padding decides the content width, the width decides the wrap, and the
wrap decides the rung. Wrapping at `width − 4` — the narrowest width any rung offers — makes the
answer an over-estimate in the safe direction: every lower rung is *wider*, so it wraps to fewer
lines and the granted height still shows all of them. At worst one row of slack, which the render
centres and reads as deliberate.

```
n    = wrapCells(`${mark}${message}`, width − 4).length,  capped
rows = n + 2 (border) + tagRows + lineRows
```

`n + 3` for `error`, whose activity line is empty. **The vertical blanks are not in the sum**:
they are slack the render computes, so they appear when the message is short and give way as it
grows, which is what the ladder already does with them. Counting them would make a two-line
failure seven rows rather than five.

**Which rung applies changes, and that is the point.** The ladder was indexed on the height a
block happened to have; now the block asks for the height its content needs. A `rule` throwing
asks for five and draws the full figure; a block in a three-row region asks for five, cannot have
it, and draws the `H = 3` rung. **The low rungs stop being the common case and become the refused
case**, which is where they earn themselves.

**The cap is four message lines and it is load-bearing twice** (F238, F239). Measured, four holds
a three-frame stack trace at 80 columns and a path and nothing else at 40 — so it binds at exactly
the width where the room is least, and it is *not* width-scaled because the cap is a property of
the reader rather than of the terminal. The second reason is containment: a bounded container
draws an over-tall child **whole** and C25 I1 is knowingly false there (C04 §3c trace 1, T2.28b),
so capping the box at seven rows bounds that divergence by a number instead of by the length of an
exception.

**A cut carries its mark.** `wrapCells(...).slice(...)` dropped the remainder in silence at every
height, not only at the cap — the same class as F230 one level down. The mark comes from
`truncate`, so it is `…` at unicode and `~` at `ascii` and is capability-resolved rather than a
literal (I22). **A message of exactly the cap carries no mark**, because a truncation that did not
happen sends the reader to the sink for text already on screen.

#### Degradation

```
24 · 8-bit   the tag, the rule and the message in the error tone; the border
             and the blank rows unpainted, and the activity line in the DEFAULT
             tone — the error already said what went wrong
4-bit        the same tone, curated — ansi16 index 9
1-bit        tone("error") resolves to { bold: true }. TWO CHANNELS, the mark and
             bold — not `inverse`, which C10 already answered differently and
             which is written nowhere in the tree
ascii        ┌─┐ → + - |  ·  ▲ → !  ·  the spinner's own ASCII arm
```

**The separator is a parenthesis, not `·`.** A middle dot has no ASCII substitution and the
ascii arm drew it unchanged — C09 I22's class, caught by T4.4 rather than by reading. `(` and `)`
are one cell under both width conventions and need no arm, which is cheaper than a `GlyphSet`
member for one separator.

**The mark is `▲`, and it is the glyph set's `warning` rather than a character chosen for the
figure.** `⚠` is in no file in this repository — the figures above carried it until the
implementation was read against them, which is F161's class in a drawing rather than in a
count. `glyphs().warning` is `▲` at unicode and `!` at ascii, both one cell, and a figure that
names a mark the tree does not have is a figure nobody can build.

**The tag is painted and nothing else is.** `surfaces.errorGround` and `surfaces.errorInk` are
**one pair, minted together and checked together** (C10 §4a): white on `#c62828` at **5.62 : 1**
on dark and light, and inverted to black on `#ff0000` at **5.25 : 1** on high contrast, where
white-on-red measures 4.00 and would fail. Both halves live in `surfaces` because the tag has no
palette slot it could borrow — `tone.error` is authored as a foreground for a dark page and is
the wrong brightness to sit behind text, which is C10 I21's rule from the other direction. **A
ground with no ink of its own borrows a foreground nothing measured against it**, so neither
arrives alone.

**And the pair degrades together — which is a rule about the pair and not about a depth, and this
paragraph used to say it as one** (F240). An ink left behind on a ground that vanished is a
foreground nothing measured against anything, C10 I21's rule read from the other direction, so the
two halves arrive together or neither arrives. That reason is right and it says nothing about
*which rungs have a ground to arrive with*, and the two lower ones differ:

- **At 1-bit there is nothing to arrive.** C10 I8 vanishes every surface, so the tag carries no
  styling and is distinguishable by being the one run that does not — non-bold between two bold
  rules. Distinction by absence is the only channel left, and the `▲` and the word carry the rest.
- **At 4-bit the pair arrives whole.** Surfaces have a rung there, and the only other text-bearing
  ones — `diffAdd` and `diffRemove` — are curated at exactly that depth. **The ground is
  `tone.error`'s own index**, per theme, by the same equality that makes it `tone.error`'s hex at
  24-bit (C10 §4d, I32), and the ink is the half that reads on it; C10 I26 makes the floor
  best-effort at this rung, so the choice is a human one and no ratio is claimed.

**Read the frame for why the first wording could not stand.** With no arm at 4-bit the rule, the
mark and the message are all bright red and the word `ERROR` is plain default — the one unmarked
run inside a red box, which inverts *the tag is painted and nothing else is* at the one depth where
that sentence had a rung to be true on. At 1-bit the same mechanism reads correctly, because there
everything else is bold and absence is the only thing left to be.

#### §3a classification table — the cells where two rules meet

Structural rather than event-mediated, because the box has structure and no events.

| | the two rules | the answer |
|---|---|---|
| 1 | the height ladder allocates the tag row × the width ladder drops it | the row goes to the message. The row **count** is never a width decision (I1, I31) |
| 2 | `H = 1` × `retrying`, which has two content lines | the message. A countdown without its cause is unactionable |
| 3 | `H ≤ 2` × §6's *the border is the evidence* | the evidence is unavailable, and the ladder says so rather than leaving it to be noticed |
| 4 | a message wider than the box × the truncation marker | `fit`, which every single-row kind already ends at, and its capability-appropriate marker |
| 5 | `W ≤ 10` × the tag | no tag row; `▲` on the message row is the only marker, and at 1-bit it is one of the two channels rather than a decoration |
| 6 | `colourDepth: 1` × *only the tag is painted* | tag and message both resolve to `{ bold: true }`, so the **brackets** are what distinguish them. The paint carries no information at one bit and the glyphs do |
| 7 | a narrow-only set × `ambiguousWidth: "wide"` × `unicode: "ascii"` | one answer — the set's own ASCII pair — reached by two routes, and `spinnerFrames` already resolves both |
| 8 | a `spinner` naming a set that does not exist | the default, never a throw. A spinner is decoration and a session that will not start because a set was misspelled is worse than one that spins the wrong way |
| 9 | `measure` threw × the message is empty | the box draws, the tag says ` ERROR `, the content row is blank. A box about nothing is still the honest report that something failed |
| 10 | `status` × `window` | omitted (I27). A bounded box has its border at both ends and cannot measure less without becoming a different box — `scroll`'s argument, and the same one |

### What a renderer emits, and what Ink is for

**A renderer emits SGR. It never sets an Ink colour prop.** C10 resolves a tone
to a `Style` whose colour names its own depth (C10 I24), and the renderer
switches on `colour.kind` to write `38;2;r;g;b`, `38;5;n` or a 30–37 / 90–97
index. The sequence itself comes from `terminal/escapes.ts`, which A03 SS14
already names as the one module permitted an escape literal — and an SGR
sequence is an escape literal, so this follows from the rule that exists rather
than needing a new one.

Ink's `color` prop is refused for two reasons, and the second is the one worth
writing down. It re-derives the depth from the string's *format*, discarding the
tag I15 exists to carry — two answers to one question, and the wrong one wins
because it is the one Ink acts on. And the colour library behind it decides how
much colour to emit from its own environment detection, which reports **no colour
at all under a test runner**: goldens would pass in monochrome forever while
production rendered truecolour, which is a suite verifying a rendering nobody
ships. A03 SS37 makes the prop unwritable rather than discouraged.

**A container whose two halves disagree draws a frame that does not close.** That
is the reason `measureChild` is on the render context, and it is worth more than
the requirement that prompted it. `panel` draws its own border because S13 puts
the title inside it, and drawing the border means sizing the border column — from
`measureChild`, because the frame must be as tall as the contents are *measured*
to be. So the container contract checks itself: a child whose measurer and
renderer disagree by a row produces a border with a gap in it, in the frame, at
the moment it happens. Everywhere else in the system an I1 violation is silent
until a viewport drifts six screenfuls later, which is why this one is stated
here rather than left as an implementation detail — a future container that
delegated its frame to a layout engine would lose the property without anything
failing.

**This is the first runtime dependency from L1 on L0-terminal**, and it is
required rather than merely allowed. Everything at L1 has so far touched
`terminal/` through injected data and type-only imports; `presentation/blocks/*`
importing `escapes.sgr` at run time is a new edge. It is legal — A03 MG1 forbids
*upward* imports and L1 → L0 is downward — and it does not weaken the
parallel-build property, which is L0's two halves not importing each other. It is
recorded here so that a later tidying of the import is recognisable as wrong.
A03 asserts it stays the only one: nothing in `src/presentation/` imports from
`src/terminal/` beyond `escapes.js` and type-only capability imports.

**Ink paints; it does not lay text out.** C09 breaks and truncates every line
itself, through `cells()`, and hands Ink strings that already fit. Ink's own
wrapping and truncation are not usable here: its truncation marker is `…`
unconditionally, which is not the 1:1 ASCII substitution §4 requires, and a
renderer that let Ink decide where a line breaks would be measuring one layout
and rendering another.

**C09 relies on Ink's layout width agreeing with `cells()`, and the agreement is
asserted rather than assumed.** Ink still computes width for box sizing and
alignment, using its own implementation; `cells()` is ours, because a width
library would not be the implementation the measurer uses (DEPENDENCIES.md). Two
implementations of one number is exactly the drift I6 exists to prevent, and here
it cannot be removed — only pinned. T2.16 pins it over the adversarial corpus. A
divergence is a finding about **which of the two is right**, reported before it is
worked around; it is not a tolerance to widen.

### Wrapping versus truncation

The distinction is deliberate and per-kind.

**Wrapped** — `notice`, `tip`, `pills`. Prose and chips, where losing the tail loses meaning.
**Truncated** — `logs`, `events`, table cells. Structured lines where the leading text carries the information and predictable height matters more than completeness.
**Fitted, by token** — a `notice` carrying `step`. A call's head is one committed row (I46): a head that wraps is two heads to a reader skimming the gutter, and the design's rule is that the argument elides from the tail before anything else does — `petal_leng…` is not a word, and neither is a verb cut in half. The composer marks the argument's span `elide`, and the fitter shortens that run first through `truncate(…, "end")` and the whole row last. The kind stays wrapped; the token is what is fitted, on I41's argument.
**Caller's choice** — `code`. A JSON dump truncates harmlessly; a YAML manifest does not, because a truncated manifest is a *different manifest* that someone will read as the real one. Only the producer knows which it is, so `wrap` is a field rather than a policy.

Nothing wraps that a viewport would rather measure cheaply.


### The bar clamps and the number does not

**One ruling for two behaviours that disagreed.** `progress` clamped a ratio above 1 to 100%, and
`examples/docker`'s CPU bar deliberately overflows — `CPUPerc` is per-core-normalised, so 780% is
an ordinary reading on an eight-core host and a bar that stops at 100 draws a busy container
identically to a saturated one (DASHBOARD_WALK A4).

That argument is not about docker. **`100/100` and `150/100` drawing identically is the same
defect wherever it happens**, and a progress bar reporting `100%` on an overshoot says *complete*
about something that is not.

So the two halves are ruled separately, which is what makes them agree:

```
the bar     clamped to its own width — it has no cells past the last one
the number  the true fraction, uncapped:  150 of 100  →  a full bar and `150%`
```

A `total` of zero has no proportion at all; the bar is empty and the percentage reads `0%`,
which is a floor rather than a measurement and is recorded here so it is not rediscovered as a
defect.

---

### `rule` — three tiers, and the axis is the fill

A heading has a level and `rule` drew one figure, so `Rule.level` arrives with the
question of what three forms are (C04 I94, §3an). The answer is **one axis**: the lead
stays two cells, the label stays in the column every other block starts at, and only the
fill changes.

| tier | lead | fill | unicode | ascii |
|---|---|---|---|---|
| 1 | 2 cells, heavy | `heavyHorizontal` | `━━ Interface ━━━━━…` | `== Interface =====…` |
| 2 | 2 cells, light | `horizontal` | `── Interface ─────…` | `-- Interface -----…` |
| 3 | 2 cells, light | space | `── Interface` | `-- Interface` |

**The fill is drawn rather than dropped**, as spaces — so the row is exactly the width at
every tier, `meta` stays at the right edge in all three, and `measure` is 1 throughout.
A tier that shortened the row would put a second geometry on a kind whose whole claim is
that it has one.

**An empty label never takes the blank fill.** I21 says an empty label draws an unbroken
line, and at tier 3 the two rules meet in one cell: a two-cell lead with nothing after it
is not a rule at all. So the fill falls back to the tier's own weight exactly when the
label is empty — heavy at tier 1, light at 2 and 3.

**Both marks are pairs the table already holds**, which is why no character is authored
here: `heavyHorizontal` is `━`/`=` and `horizontal` is `─`/`-`, resolved through
`glyphs(ctx.capabilities)` like every other rule character (SS47).

## 4. Capability fallbacks

Every substitution is **1:1 by column count** (C04 §5). This is the constraint that keeps measurement honest under degradation.

| Unicode | ASCII | Cells |
|---|---|---|
| `─ │ ┌ ┐ └ ┘ ├ ┤` | `- \| + + + + + +` | 1 |
| `…` | `~` | 1 |
| `↑ ↓` | `^ v` | 1 |
| `▁▂▃▄▅▆▇█` | `.:-=+*#@` | 1 |
| Braille plot | Block plot | same grid |

### The `Glyph` vocabulary

C09 owns both renderings of every glyph a block can name (C04 §5). A block names the slot; this table is the only place either character exists.

| `Glyph` | Unicode | ASCII | Rôle |
|---|---|---|---|
| `ok` | `✓` | `+` | Succeeded, healthy, valid |
| `warn` | `▲` | `!` | A warning that does not suppress success |
| `error` | `✗` | `x` | Failed |
| `info` | `ℹ` | `i` | Informational, no judgement |
| `pending` | `◌` | `.` | Not started |
| `working` | `◐` | `%` | Starting, connecting, installing — in progress |
| `running` | `●` | `*` | Running, steady state |
| `queued` | `○` | `o` | Accepted, not yet running |
| `cancelled` | `⊘` | `/` | Stopped by request |
| `expand` | `▸` | `>` | A collapsed row |
| `collapse` | `▾` | `v` | An expanded row |
| `live` | `▌` | `\|` | The live-state gutter (D6) |
| `bullet` | `•` | `-` | A list marker with no status meaning |
| `quote` | `⎸` | `>` | A quotation's gutter — a **rail**, drawn on every row (C04 I95) |
| `nested` | `⁃` | `~` | A list item nested deeper than the indent shows (C04 I96) |
| `continuation` | `⎿` | `` ` `` | A line subordinate to the one above — the entry's own state, under its command |
| `step` | `⬤` | `*` | A step in a sequence of work — a call's head (`AGENT_TUI_DESIGN.md` §9c, §10). **U+2B24 is `East_Asian_Width=Neutral`, one cell under both conventions, and has no emoji presentation** — it is absent from `emoji-variation-sequences.txt` 17.0.0, where U+23FA `⏺`, the mark this row carried until F823, has both a text-style and an emoji-style sequence and draws two cells wherever a font prefers the emoji form. `running`'s `●` is Ambiguous and is a *state*, where this names a *position in a sequence* and does not change as the step runs or settles. The ASCII half is the design's `*` (§A6); it is shared with `running`, and I5 is about cell count, not uniqueness (F824) |

**Why this is a closed union and not a string.** While the field was free, C09 emitted a block-supplied character verbatim — so the 1:1 guarantee held for the glyphs C09 chose and silently did not hold for the ones an adapter wrote. That is a guarantee that is mostly-true, and mostly-true fails only under `LANG=C`, only for the users least able to describe what they are seeing. It also drifted immediately: before tokenisation the tree carried `✗`, `✖`, `*`, `+` and `▲` in glyph positions, across five files, for three rôles.

**`working` is distinct from `running` and `pending`**, and is in the vocabulary because S11 and S15 illustrate it — `◐ connecting`, `◐ mlflow starting`, `◐ layers installing`. Three states looked like two until the surfaces were read.

#### `continuation`, and the two questions a status token never had to answer

**It is the only token whose eligibility depends on the entry rather than the block**, so it is the only one where a consumer count is not an argument on its own (F161). Two blocks are in the position and both share a shape — a `muted` notice that is its entry's first block, saying what the *entry* is doing rather than what the far side emitted, drawn directly under the command line:

| consumer | where | why it can take the mark |
|---|---|---|
| the stall notice | `refresh.ts`, `no output for Nm` | `muted` obliges no glyph (I6), and the entry is streaming, so its command chrome is on screen above |
| the queued notice | `execution.ts`'s `enqueue`, `queued behind X` | `command` is the typed line, so `commandRows` draws it; the notice is the only block beneath |

**And two that read as consumers and are not, each for a measured reason rather than a judgement.** This is the half worth writing down, because both were named as consumers before anyone looked:

- **F15's fault notice cannot take it, for two independent reasons and neither is the obvious one.** Its `command` is `""`, and `commandRows` opens with `if (command === "") return []` — so there is no line above for a continuation to hang from, and the mark would subordinate the notice to whatever entry happens to precede it, which is a different submission. Its glyph slot is also already `error`. A reader checking either reason alone would still have got the right answer and the wrong rule.
- **The cancelled notice cannot take it either**: `warn` is in `GLYPH_REQUIRED_TONES`, so C04 I6 has already spent the slot. Same shape as the stall notice in every other respect, which is what makes it the instructive one.

**And it is a glyph slot rather than a prefix on the text, which is the whole reason it fits.** `notice` puts the glyph on the first row and indents every continuation row under the *text* (§3's hanging gutter), so a multi-row result sits beneath its mark instead of under a lone character. `docs/design/AGENT_TUI_DESIGN.md` §A1 reached the same mechanism from the other end — *a prefix reserving its columns, which `noticeDoc` already does* — and that is corroboration for the mechanism only. Its own consumer is a tool result in an application stopped at step 0, so it is written down and it is not a count.

**The indent, found by reading the frame and by nothing else — and closed.** The mark first landed flush left, in the same two-cell gutter the prompt uses, so its text and the command's text aligned and the notice read as the prompt's *sibling*:

```
❯ /ps --all
⎿ queued behind /logs        ← wrong: the one relationship the mark exists to deny
```

**Every assertion passed with it wrong**, because a claim about two rows is invisible to a suite indexed by blocks. It is now indented by two, which puts the mark beneath the command's first character and its own text one gutter further in — the figure `AGENT_TUI_DESIGN.md` §A1 draws:

```
❯ /ps --all
  ⎿ queued behind /logs
```

**A gutter, not a field, and the alternative is what decided it.** An `indent` on `Notice` is the second spacing field `Gap`'s own note has been waiting for — *whoever writes the second spacing field is reading this line* — and roadmap 38 rules that change a **replacement** of `gapBefore` rather than an addition beside it. So the option that is not a public type is also the one that is not entry 38 in disguise: the depth belongs to the mark, which already knows it is a mark, and the block schema learns nothing. `glyphLead` and `prefixCells` derive from one map, so the first row and its continuations cannot disagree about the width.

**Two, because `PROMPT_GUTTER.first` is two** — and one cell was the first attempt, which puts the mark *between* the two columns, subordinate to neither. The constant is L4 and the renderer is L1, so the number is a literal with the coupling asserted rather than described (T2.99, over the rendered rows rather than over the two constants).

**And a golden frame carries it now**, which is the other half of the finding: golden was unchanged when the mark landed, because no frame in the suite held one of these notices. A green golden run reads as coverage. `test/golden/continuation.test.ts` renders the *entry* — chrome plus blocks — at two widths and both unicode modes, with the `warn` notice beside it so the two gutters differing is visible rather than described.

**On the character, measured rather than chosen.** `⎿` is `East_Asian_Width=Neutral` — **one cell under both conventions**. The corner a reader would reach for instead is not: `└` and `╰` are Ambiguous and draw two cells wide, as do `▲` and `⋯` already in these tables. That does not buy anything *today*, because `glyphs()` discards the whole Unicode set at `ambiguousWidth: "wide"` and this table follows `unicode` alone — so it is a property of the character and not yet an argument. It is recorded because §4's own note says a third set of narrow survivors is *the better answer the day someone measures one*, and this is a measurement, filed where that note can find it.

The ASCII half is `` ` ``, which is `tree(1)`'s rendering of the same hook in its ASCII mode — a precedent rather than a preference, and degradation preserving meaning rather than appearance.

#### `step`, and the mark that measured right and was wrong

**`⏺` U+23FA was measured with `cells()` before its row was written, and the measurement answered the wrong question** (F823). East Asian Width is silent about presentation: U+23FA is a base in `emoji-variation-sequences.txt` — `23FA FE0E ; text style` and `23FA FE0F ; emoji style` — so a terminal whose font prefers the emoji form draws it two cells wide whatever the locale says, and every table in `text.ts` reports one. `⬤` U+2B24 has the same width status by every one of those tables and no variation sequence, which is why it is the mark: the argument for it is presentation alone, and an argument that rests on a property nothing measured is a sentence. So the check exists (I45): a table of variation-sequence bases derived from the Unicode file, with its version named, beside the Ambiguous and Wide tables that were themselves rebuilt from the property rather than from recollection (§5). **It is a test-time refusal and never a runtime branch.** Terminals disagree about presentation, and `cells()` counting it would be a guess dressed as a measurement — the check refuses a character from the tables, it does not resize one. T2.71 checked spinner frames against a seventeen-character list written from memory that opened with `·`, which is Ambiguous and has no emoji form at all; it runs over the derived table now, and I45 runs over both glyph tables and every spinner set.

**The vocabulary has a width tier, because ten of its seventeen members needed one** (F825, I48). `glyphFor` read `unicode` alone where the internal set collapses wholesale at `ambiguousWidth: "wide"` and the spinner sets carry a per-set `narrowOnly`. Measured 2026-09-06 at both arms: `▲ ◌ ◐ ● ○ ⊘ ▸ ▾ ▌ •` are two cells at `wide` against a one-cell ASCII half, and T2.5b asserted I5 at `narrow` only — so more than half the table broke the 1:1 rule under the other convention and the row was green. A member measured Ambiguous resolves to its ASCII half at `wide`; the seven Neutral members — `✓ ✗ ℹ ⎸ ⁃ ⎿ ⬤` — do not move. The finding that raised it named one member; the count was taken before the finding was written, and the class is the ruling.

**And the separator between a head's fields is a slot** (F828, I49). `toolCallHeader` joined verb, elapsed and outcome with a literal `·`, which is non-ASCII and Ambiguous — two cells at `wide`, and the contract row for the card asserted it at the ASCII arm. `status.ts` chose parentheses and the residue row chose a comma for exactly this reason, each with the reason written beside it; the head was composed after both. `GlyphSet.separator` is `·` / `-`, resolved by the composer, which takes capabilities.

#### A rail — the one token property that changes what rows 1..n carry

`GLYPH_INDENT` established that a **property of the token** can change what a gutter
draws without the block schema learning anything, and `GLYPH_RAIL` is the second such
property. A rail token is drawn on **every** row of its notice rather than on the first.

**The geometry does not move, and that is what makes it safe.** `prefixCells` already
subtracts the gutter from every row's width — the hanging indent depends on it — so the
columns are reserved on rows 1..n whether or not anything is drawn in them. The rail
fills columns that were already blank; `measure` is unchanged, needs no capability, and
C09 I1 holds by construction rather than by a second argument.

**One member, one frame-read.** A quotation carrying an ordinary glyph draws its mark on
row 0 and nothing beneath it:

```
⎸ the first row of a quotation that      ⎸ the first row of a quotation that
  wraps onto a second                    ⎸ wraps onto a second
   ← a glyph                              ← a rail
```

Every count agrees in both frames — same rows, same width, same reserved columns — so no
assertion about geometry separates them, and a suite indexed by blocks reports the left
one as a working gutter. It is the same class as `continuation`'s indent, found the same
way.

**The set is here rather than on the token's declaration** for the reason `GLYPH_INDENT`
gives: whether a mark repeats is a rendering property, and C04 owns the vocabulary while
C09 owns both renderings.

**Anything outside the vocabulary is text, not a glyph.** `↗ open`, `⊘ cancel`, `⬡ pods` and `≡ logs` are action labels and footer hints — text that happens to begin with a character, never a glyph slot — and their behaviour under ASCII is the app's. That is what keeps this table's guarantee absolute rather than nearly absolute.

**No substitution may change cell count.** `…` → `...` would be three cells where the measurer assumed one, and every log line's truncation point would shift — silently, only for users with a non-UTF-8 locale.

Where no 1:1 substitution exists, the *content budget* changes at measure time instead, which requires the measurer to see capabilities. **No default kind requires this**, and adding one that does is a design decision, not an implementation detail.

Colour degradation is C10's; C09 names a palette slot and renders whatever style comes back. `code` is the only kind that names anything outside the `tone` palette.

---

### The rule is about who can substitute, and the framework exempted itself

§4 says a glyph is a **slot** and never a character, because substitution is 1:1 by
column count and **only the renderer knows the capability**. That argument is about
*where the knowledge is*, not about who owns the character — and it was written about
what a **block** carries. The framework's own authored text was never held to it.

Measured over `src/`, excluding comments (F122):

| | |
|---|---|
| string literals carrying a non-ASCII character | 164 |
| …prose punctuation only — em dash, `§`, `·` | 106 |
| …reported by SS47 | **58** as measured; 54 today, the six defects fixed and `ℹ` reclassified |
| …of those, the glyph table itself | 43 |
| …carrying their own ASCII form already | 5 |
| …a developer's report, never a frame | 4 |
| **…drawn verbatim into a frame** | **6** |

**Four working sites are what make this a defect rather than a wish.** `text.ts`
resolves `caps.unicode === "ascii" ? "~" : "…"`, `patch/collapse.ts` carries a pair,
`patch/definition.ts` picks its rule character, `plot/ramp.ts` has a whole ASCII ramp.
The mechanism is not missing. **It is applied in four places and skipped in six**, and
a discipline holding four times in ten is what a scan is for rather than a rule.

**Three of the six bypass a function that already holds their fallback.**
`spinnerFrames(caps)` returns an ASCII set and `shell/paint.ts` hardcodes `⠋` two files
away; `GLYPH_TABLE.expand` is `["▸", ">"]` and `shell/confirm.ts` writes `▸`;
`collapse.ts` carries `["⋯", "..."]` and `paint.ts` declares its own `⋯`. For those
there was nothing to rule — there was a function nobody called. F55 filed this as
*wanting a ruling*, and half of it wanted a call.

**The other three are the ruling, and they divide by where the text is authored.**

- **The capability is in hand.** `paint.ts`'s spinner sits inside a function holding
  `deps`. One line.
- **The function is shared with the measurer.** The prompt is drawn by `commandRows`,
  which `construct.ts` also calls for `chromeRows` — so its two forms must be **1:1 by
  cell count** (I22) or `measure` and the composer describe the same row differently.
  `❯ ` and `> ` are both two cells, and `PROMPT_GUTTER.first` is that number.
- **The text is authored above the renderer.** `loading…` is built by a builder,
  `… n more` by C19, `▸` by C15's caller. These are **unsubstitutable by construction**:
  the string is fixed at L3 or L4 and the capability is known at L1. C09's answer already
  exists and is the glyph slot — so a mark in framework text is a slot, or it is ASCII.

**`…` gets no slot, and that is the interesting refusal.** I5 requires 1:1 by cell count
and the ASCII ellipsis is three cells; the pair that satisfies it is `["…", "~"]`, which
`text.ts` already uses for truncation and which reads as a marker rather than as an
elision anywhere else. So `loading…` becomes a notice carrying the `pending` glyph — the
mark it actually wanted — and `… n more` becomes ASCII. **A vocabulary that admits every
character its callers reach for stops being a vocabulary**, and the refusal is what keeps
the 1:1 rule true.

## 4c. `image` — four rungs on two axes, and the dither is the one every terminal reaches

**Two capability arms, not four**, and that is what this simplifies:

```
imageProtocol: "kitty"                    the protocol arm
"none" | "iterm2" | "sixel"               the DITHER arm
```

**The protocol axis is two arms; the glyph axis below it is three rungs**, and keeping them
apart is what stops the ladder reading as four protocols. The protocol axis asks *can the
terminal draw pixels*; the glyph axis asks *what can a cell be spent on* — and the answers are
independent, which is the same two-ladders-on-two-axes shape the `status` block arrived at (§3a).

```
                        kitty            real pixels, placed by digest
    glyph axis   ┌─     half blocks      two colours a cell — the picture is COLOUR
                 │      braille 2x4      eight dots a cell — the picture is SHAPE
                 └─     ascii ramp       `.:-=+*#@`, where the alphabet is nine glyphs
```

### iTerm2 and sixel are refused for composition, and the reason is not the obvious one

**Sixel draws at a cursor position and does not participate in the grid at all** — no placeholders,
so it does not scroll with the content above it, and a block that does not scroll with its
transcript is not a block.

**iTerm2 is the one whose refusal needs its reason stated correctly.** Its inline images take a
declared cell size, occupy cells and scroll — so *draws at the cursor and does not participate* is
false of it, and a refusal resting on that would be reversed by the first reader who checked.
**What iTerm2 lacks is per-cell addressability.** A kitty placeholder is ordinary text: any row is
independently re-emittable, and text can sit *inside* the rectangle. An iTerm2 image is one escape
at one cursor position, so a row-level rewrite of its region destroys it and nothing can be drawn
into it.

**That is a fit argument and it settles a measurement by construction.** F248 asked whether images
and the frame diff compose and measured Ink re-emitting the whole frame — safe for placeholders,
and *fatal* for one blob, because a full-frame rewrite re-emits the image's rows as text. Recorded
here so a later reader can argue with it rather than assume nobody tried.

### The transmission cannot ride in the frame, and the build is what said so

**The ruling this section shipped with was that transmission rides with placement.** `a=T` at a
stable id *replaces*, so emitting it on every render is idempotent; Ink writes nothing when nothing
changes (F248); therefore no session state and no seam. Every step of that is true and the
conclusion is false.

**Ink strips APC escapes.** Measured through `renderToString`:

```
APC alone         in=27  out=0   ""
APC then text     in=29  out=2   "xy"
SGR then text     in=20  out=20  survives unchanged
```

Its tokeniser understands SGR and discards `ESC _G … ESC \` — so a transmission placed in a `Text`
node does not reach the terminal, and the placeholders that follow address an image that was never
sent. **The failure is nothing drawn**, which is at least the loud one.

**So the transmission is L4's, through the privileged write handle `terminal/lifecycle.ts` already
owns.** `transmitImage` is that seam, and it is prefixed to the frame's bytes at the composition
root — **only the placeholders travel through Ink**, as ordinary text.

**Three measured properties are what made it safe, and each was taken before it was built on.**

- **Ink is not in the byte path at all.** `composeFrame` returns bytes and `session.ts` writes
  them in one call; Ink is used only through `renderToString`, per block, to produce the *lines*.
- **The diff baseline is `lines` and the write is `write`** — separate records — so a prefix on
  the byte stream cannot desynchronise the next frame's diff. Measured across two identical
  sessions: every frame after the prefixed one is byte-identical.
- **Every frame reaches an absolute address before any row content** — `HOME` or `cursorTo(i, 0)`
  — so a cursor the escape might have moved is corrected by the next byte written. Three frames,
  every one addressed before content.

**The transmission leads the frame rather than following it**, because placeholders addressing an
image that has not been sent draw nothing; and it is never interleaved, because an escape between
an address and its row leaves that row unaddressed — stated as a property and measured rather than
drawn.

**It transmits on entry into the document rather than into the viewport.** The session-scoped set
of sent digests is what makes that affordable: each transmits once, so an image scrolled into view
later costs nothing at the moment it appears. Keying on the windowed set instead would put a
payload in a frame where nothing else changed.

**And `session.ts` is the only path that writes block rows**, which is what makes one seam
sufficient: `drawFallback` writes a fixed message with no blocks, and C03's sink writes its own
control bytes.

**This is the third ruling this phase that the implementation falsified** — after the mosaic's clip
and `graph`'s clamp — and the shape is the same each time: a chain of true statements whose
conclusion is about a mechanism nobody had run.

### The dither is built first, because most terminals are not kitty

**A feature that shows nothing at `imageProtocol: "none"` is a feature most readers never see.**

| arm | what it draws |
|---|---|
| `kitty` | the protocol — transmit once by digest, place with placeholders |
| half block | `▀`, the top pixel in the foreground and the bottom in the background |
| dither, unicode | braille 2x4, monochrome, nine intensity levels per cell |
| dither, `ascii` | `.:-=+*#@`, ordered by the same matrix |
| 1-bit | the same dither — **colour was never the carrier here** |

**The 1-bit row is not a further degradation.** Every other kind loses colour at 1-bit and keeps
its shape; a dither *is* shape, so it is unchanged. Worth stating because C10 I8 vanishes surfaces
at 1-bit and a reader would expect this to vanish with them.

### The half block, and the three gates that decide it

**Braille spends a cell on shape and half blocks spend it on colour**, and for a photograph
that is not a close trade. A braille cell carries eight dots at one bit; `▀` carries **two
pixels at twenty-four**. Against braille the half block loses three quarters of the vertical
resolution and one half of the horizontal, and buys 2^48 against 2^8 — so a gradient that
braille can only stipple arrives as a gradient, and a photograph stops being a texture.

**It is the wrong trade for a line drawing**, and that is not a defect to fix. A diagram is
shape, and braille's eight dots resolve a one-pixel rule that a half block averages away.
Both are correct about different pictures and neither is chosen per image: the ladder is a
*capability* ladder, so it takes the richest rung the terminal can honour and the content
never votes.

**Three gates, and each excludes the rung for its own reason.**

**Ambiguous width, which is the one that would have shipped.** `▀` is
`East_Asian_Width=Ambiguous` — measured by `cells()` itself, `narrow=1` and `wide=2` — so a
terminal declaring `ambiguousWidth: "wide"` draws every cell of the picture at double width
and the image is twice as wide as `imageCells` measured it. **Braille is not ambiguous**
(`⣿` measures 1 at both), which is exactly why the existing arm never met this and why the
new one must. `art.ts`'s `eligible` and `mermaid.ts`'s `useAscii` are the same switch, and
this is the **third** consumer to need it (C02 I9, A03 SS50).

**Colour depth, because the rung's whole claim is two colours a cell.** At `colourDepth: 4`
there are sixteen and at 1 there are none, so below 8 the arm has nothing the dither lacks
and has paid three quarters of the resolution for it. **`>= 8`**, and at 8 both channels go
through `nearestAnsi256` — the same funnel C10's colormap already uses, so the 8-bit picture
is the 24-bit one quantised rather than a second rendering.

**The overlay, and this is the structural interaction.** A dithered image with an overlay
puts the picture in the *glyph* and the field in the *foreground*, which works because the
two channels are independent. A half block has **already spent both colour channels on the
picture**, so there is nowhere for the field to go. Unlike 1-bit — where C10 I31's honest
answer is to draw the picture plain, because the cell has nothing left at all — here there
is a rung that can carry it. **So a block with an `overlay` skips the half block and takes
braille**, and it is the field rather than the terminal that decides.

**Neither of the two artefacts this component's walks use would have found that gate**, and
the reason is worth recording. *Has an overlay* and *the terminal is 24-bit* both hold at
rest with no event between them, so a sequence trace has no row for it however long it runs;
it is the **classification table**'s shape, and the table is what was drawn (CLAUDE.md,
*rule interactions come in two kinds*). The trace would have agreed with the code and been
right about every sequence in it.

### The matrix, designed here because it is designed nowhere

`CALCIUM_IMAGES_NOTE.md` says *the braille dither is already designed — the 3D renderer's
ordered-dither over a 2x4 Bayer matrix*. **There is no 3D renderer**, no such design in any file,
and the roadmap lists 3D plots under *deliberately not doing*. The note's own preface records it.

**An 8x8 ordered Bayer matrix supplies the threshold**, indexed in **dot** space rather than cell
space, so the pattern shifts inside a cell as well as between cells. **The pattern varying with
position is the whole point** — a flat threshold turns a gradient into stripes, and the offset
breaks them into texture. Nine levels per braille cell, because eight dots plus empty is nine.

**8x8 rather than 4x4, and the frame is what chose it.** The note's *2x4 Bayer matrix* was taken as
a 4x4 and built, and it has a defect only a figure shows: **its y-period is 4 and a braille cell is
4 dots tall**, so a flat region resolves identically in every cell row and reads as one repeated
glyph. Measured against the recursive 8x8 at three levels on a flat field, the two frames were
**identical** — the extra 48 thresholds bought nothing, which is the number that undercut the
upgrade. Measured *between* quadrant boundaries they separate: at **0.28** the 4x4 draws one glyph
everywhere and the 8x8 resolves two, and at 0.3 and 0.55 the 8x8 varies between cell rows where the
4x4 cannot. **Sixty-four thresholds against sixteen is a level resolution the eye can see**, and
the case that shows it is the one a first reading would not have tested.

**The rasteriser is not written twice.** `plot/raster.ts` already holds `BRAILLE_DOTS = {x: 2,
y: 4}`, the standard bit assignment, `createGrid`, `setDot` and `foldBraille` — *one grid, two
folders*. The dither sets dots and folds; no braille code is added.

### The ramp is a third ladder axis, and widening the record is the check

C12's `LadderAxis` is two axes today and `Serves` is a `Record` over it. Adding a dither axis makes
**every existing ladder fail to compile until it answers**, which is what stops a dither ramp being
indexed as a density ramp. They look interchangeable and are not: a density ramp encodes a
magnitude at a position, a dither ramp encodes a **threshold against a position-varying offset**.
**The type is what tells them apart, because the eye does not.**

### A GIF is the same block with more than one frame, and the frame is never geometry

**`Image.data` takes GIF bytes beside PNG, and the six-byte signature chooses the decoder** (C04
I93, I39). `decodeImage` is the codec's front door; `decodePng` is unchanged behind it and
`decodeGif` (`image/gif.ts`) is the second decoder — LZW, interlacing, global and local colour
tables, transparency and the three disposal methods, **299 lines in-tree** on `decodePng`'s own
argument (`omggif` at 38.5 KB was the alternative, and a dependency row for a function is the
*layout engine* side of the ledger's test). **Every frame is composited onto the logical screen**
before anything above the codec sees it, so `frames[k]` is *the screen while frame k shows* and
not the sub-rectangle the file stored; disposal is applied before the next frame is drawn, method 2
clears to transparent (the background colour the format names is honoured by no viewer), method 3
restores. **Delays are milliseconds and the short ones are clamped**: under `MIN_DELAY_MS` (20) a
delay becomes `DEFAULT_DELAY_MS` (100), which is what browsers do for the `0` and `1` hundredths
most files carry; browsers draw the line at 10 ms and this at 20, because 20 ms is 50 fps and over
C03's 30 fps ceiling, so a file asking for it has frames skipped by the delta arithmetic either way.

**Measured against a second decoder, not against itself.** The fixtures are written by `sharp` and
compared frame by frame with `sharp`'s own composited pages — eight frames, zero differing pixels
— and each fixture's bytes are scanned to show it carries what its row claims (a local table, a
sub-rectangle with a transparent index, the interlace bit). The first transcription of one blob
carried a stray character and the decoder refused it as *LZW minimum code size 0*: a real fixture
wrongly copied is the instrument-before-subject class arriving by another door, and the script
that compared the constants to the generator's output is what caught it.

**The frame is view state and it enters the block through the context** (C04 I93, C22 I77).
`RenderContext.frames` names the frame each image is on, by block id; the shell's `Frames` store
writes it on the animation wake, and the block reads it in exactly one place — **below the
protocol arm**, where the rasterising arms take their pixels. `measure` never receives it (I8):
`height` is declared and every frame shares the logical screen, so a GIF measures as its first
frame does at every width (C04 T2.39), and `imageCells` reads the extent, which a corrupt frame
does not take away (`decodeGif` reads the screen before any frame, as `decodePng` reads the IHDR).
Absent is frame 0, so a PNG never notices the field; out of range wraps.

**The kitty arm uploads every frame once and the terminal animates — ruled on the figures.** The
roadmap priced the protocol arm as *every tick is an image upload where the orbit's tick is a text
frame*, and that is true of the design it imagined — a retransmission at the stable id on every
wake — and was measured before it was ruled on: **75 bytes a tick for an 8x8 GIF and 29,662 for a
320x240 gradient, 297 KB/s at 10 fps**, for as long as the image is on screen. kitty's animation
protocol makes the per-tick figure **zero**: frame 0 goes as the placement's own `a=T` (raw RGBA,
`f=32,o=z`, since the terminal reads no GIF — `f=100` is PNG and would draw nothing), every later
frame as `a=f` carrying its gap in `z`, one `a=a` sets the root frame's gap and one starts the loop
— **116,509 bytes once** for four 320x240 frames against 296,620 every second. So `transmitImage`
sends the frames, `#sentImages` keeps it to once per digest as for a PNG, and **the session's wake
is not armed for an image on this arm**: `visibleRows` gathers animated images only when
`imageProtocol` is not `kitty`. The alternative — *frame 0 on kitty, animate only where we
rasterise* — is what this degrades to on a terminal without the animation extension, which is why
it was not chosen: a design whose failure mode is the other design costs nothing to prefer. **Two
protocol readings are stated as unmeasured** (the plane-16 class above): that `v=1` on `a=a` loops
for ever, and that a terminal without `a=f` keeps frame 0. Ghostty 1.3.1, the one terminal measured
in this repository, does not implement the animation extension, so the first real-terminal read of
this arm is owed there and the degraded picture is what it should show.

**The wake is the orbit's** (C22 I77). One timer path, one stamp, and each animation reads its own
elapsed time from it — the frame store walks whole delays and keeps the remainder, so a GIF beside a
33 ms orbit shows each frame for its own delay and a spinner beside a GIF does not move it. The
timer is armed for the earliest frame change on screen, floored at the `stream` rate, so a 500 ms
GIF costs two wakes a second and not thirty; a still — PNG or one-frame GIF — arms **nothing**.
Frame 0 after a loop keys as untouched, on `ScrollOffsets`' zero rule, because it draws what frame
0 drew.

### The blind spot, and it has now been measured

**Three width implementations matter and two are reachable here** — `cells()`, which every
`measure` uses, and Ink's, which lays out the box. F247 measured both agreeing at n = 1, 2, 4, 8.
**The third is the terminal's own guarantee about a plane-16 private-use character**, and it is not
measurable in this repository. **The first real-terminal test is where it is checked**, and until
then two of three is not three.

**It was checked on 2026-08-31, in Ghostty 1.3.1, and it holds.** Twenty placeholder cells
advanced the cursor twenty columns; sixteen cells of a placement row for an image the terminal had
actually received advanced it sixteen. **Both forms, because the first alone is the weaker claim** —
an untransmitted id measures a bare private-use glyph, and only the second measures an image *cell*,
which is what the geometry is about. `docs/catalogue/images/real/README.md` holds the run.

**Three of three, on one terminal and one font.** The font is part of the measurement rather than a
note about the machine, so a repeat elsewhere is a new reading and not a confirmation of this one.

## 4a. Syntax tokenisation

C10 defines a `syntax` palette; this is where the tokens come from. `Code` is `{kind, id, language, text, wrap}` — text and a language name, no spans — so something has to turn one into the other, and it is not the adapter.

**Tokenisation happens at render, never in the adapter.** Adapters are pure and must not do work proportional to content length (C07): a manifest arriving over a transport should not be highlighted on the way in, because most documents are never scrolled to. Results are **memoised on `(text, language)`**, which is what keeps a re-render of the same block free.

**Measurement ignores syntax entirely.** Tokens change appearance, never line count, so `measure` never tokenises. This keeps I1 cheap and has a consequence worth stating: a `code` block measures identically whether or not its language is registered, so a language shipping tomorrow does not reflow yesterday's transcript.

**An unregistered language renders as plain text, not an error** — the same principle as C07's fallback adapter. A language nobody has registered is readable today and highlighted whenever someone registers it.

### `hljs` class → palette slot

`lowlight` emits a hast AST carrying highlight.js class names. The mapping is explicit rather than derived, because a derived mapping silently changes when the upstream grammar does:

| `hljs` class | Slot |
|---|---|
| `hljs-keyword` | `syntax.keyword` |
| `hljs-string` | `syntax.string` |
| `hljs-comment` | `syntax.comment` |
| `hljs-number`, `hljs-literal` | `syntax.number` |
| `hljs-attr`, `hljs-attribute` | `syntax.key` |
| `hljs-type`, `hljs-built_in` | `syntax.type` |
| `hljs-title`, `hljs-function` | `syntax.function` |
| `hljs-operator` | `syntax.operator` |
| `hljs-punctuation` | `syntax.punctuation` |
| anything else | the default tone — **never dropped** |

The fallback is a fallback, not a filter. An unmapped class renders its text in the default tone; it never renders as nothing, which is the failure mode where a grammar update makes half a file invisible.

Only the languages actually needed are registered — `createLowlight({ yaml, json })` — rather than highlight.js's full set, which is most of the package's weight and none of its value here.

---

### Grammars arrive, and three things had to be true for that sentence

§4a has always said a `code` block *"measures identically whether or not its language is
registered — a grammar shipping tomorrow does not reflow yesterday's transcript"*, and that
an unregistered language is *"readable today and highlighted whenever someone registers
it"*. The constructor shipped with `createLowlight({ json, yaml })` and **no registration
path**, so *whenever someone registers it* had no someone (F93).

Nothing caught it because C09 was built when the only consumers were `docker inspect` and an
nginx config. **Two grammars satisfied every test, and no test could distinguish *we ship
two* from *we ship two for now*** — the promises are prose, and no rule checks prose against
behaviour.

**Three changes, and F93 named one of them.**

**1 · A default set, chosen by a rule so the next one is an argument rather than a taste.**
A grammar ships if a *terminal user plausibly reads it in this window*: the formats a CLI
emits (`json`, `yaml`, `xml`, `ini`, `diff`, `markdown`), the ones it is configured by
(`dockerfile`, `sql`, `css`), the shell they are typed into (`bash`), and the languages CLIs
are written in (`typescript`, `javascript`, `python`, `go`, `rust`, `java`). Sixteen,
**measured at 121 KB against the package's 9.2 MB** — the recorded objection is to the 384,
and it survives: the full set is most of the weight and none of the value. What changed is
that *"actually needed"* had been measured against two consumers.

**2 · `registerGrammar`, and it clears the memo — which is the half that makes the promise
true.** `tokenise` memoises on `(language, text)` and caches the *fallback* for an
unregistered language, so a grammar registered afterwards would leave every block already
rendered as plain text until the 256-entry cap happened to clear. **Exposing registration
without invalidating the memo satisfies F93 and leaves §4a's sentence false**, which is the
walk's finding: two correct rules — memoise for speed, fall back to text — overlapping in
one cell that neither is about.

**3 · The slot map, which is the same asymmetry one level down.** `SLOTS` maps thirteen
`hljs-` classes and was written for two grammars. Measured over the sixteen, on a sample of
each:

| | runs | uncoloured |
|---|---|---|
| `json` | 13 | 0 |
| `markdown` | 4 | **4 — nothing highlights at all** |
| `xml` | 11 | 8 |
| the sixteen together | 152 | 59 |

Shipping the set without extending the map ships two grammars that do not work: `markdown`
is indistinguishable from not registering it, and `diff`'s `hljs-addition` and
`hljs-deletion` — the whole point of a diff — fall through. **You could register a grammar
and could not register a slot**, which is *exported block kinds with unexported grammars*
one layer further in.

The map gains eight entries onto the nine slots that exist, each by rôle rather than by
name: a section heading is the structural anchor a `keyword` is, a list bullet is
`punctuation`, inline code and a template substitution are `string`, a shell variable is a
name and so is `key`, an element name and a CSS selector name a kind and so are `type`, and
a decorator or shebang is `keyword`.

**Three classes are left unmapped on purpose, and one of them is a ruling already taken.**
`hljs-params` is ordinary identifiers, which are meant to be plain. `hljs-strong` and
`hljs-emphasis` are *appearance*, and §4a maps rôles to slots — a bold run has no colour
rôle. And **`hljs-addition` / `hljs-deletion` get no slot because C04's change-axis ruling
says a change is a marker and never a tone** (F30, F49, F81): colouring a `+` line green
here is the exact thing that ruling refused, and a real diff is C25's, where the marker
column is.

## 5. Unicode measurement

`cells(text)` is the shared width function every measurer uses. Naïve length is wrong in five ways, all of which appear in real output:

| Input | Cells |
|---|---|
| CJK, fullwidth forms | 2 per glyph |
| Combining marks | 0 — folded into the base |
| Emoji with ZWJ sequences | 2 for the cluster, not per code point |
| Variation selectors | 0 |
| Control characters | Stripped before measuring |

Iterating code units is the defect this exists to prevent. `cells()` is grapheme-aware, shared by every kind, and tested independently, because a per-kind width calculation would be wrong in a different way in each.

**The cluster stream is exported for C17, and this is the `cells()` argument one layer down.** The editor's cursor is a grapheme index, so it needs where a cluster *ends* rather than how wide a string is — a different question with the same answer underneath. Constructing a second `Intl.Segmenter` in the editor would be two answers to "where does a cluster end", agreeing today and diverging on whichever ZWJ sequence the two Unicode versions disagree about; it is also a per-call cost on a module that already builds exactly one segmenter for the whole tree, deliberately (§5). `clusterWidth` comes with it because C17's layout walks clusters and asks each its width, which is what `cells()` does internally and cannot expose by returning a total.

### The Ambiguous set is the property, not a recollection of it

**The authority is `EastAsianWidth-17.0.0.txt`, dated 2025-07-24**, taken from `unicode.org/Public/UCD/latest/ucd/`. `isAmbiguous` is every `; A` row of that file — 179 ranges over 138,739 code points — generated rather than typed, because the table that stood there was written by hand and nothing had ever checked it against its source.

**This reverses a rule that was written down and argued for** (F665). The old table began at U+2010 and called the omission deliberate: *most of the property is Cyrillic, Greek and Latin letters that no terminal draws two cells wide, so the test of a range's inclusion is whether the tree draws from it.* Both halves fail, and the way they fail is the point.

- The premise is false **about the capability it is attached to**. `ambiguousWidth: "wide"` is set when the terminal applies the wide convention (C02 I9), and an emulator that applies it applies it to the *property* — Latin-1, Greek and Cyrillic included. A sentence about whether fonts have wide forms answered a question about glyph design; the capability asks about a width convention.
- The inclusion test is indexed to the wrong corpus. `cells()` measures what it is handed, and most of that is far-side text — an adapter's error message, a log line, a column of units. *Does the tree draw from this range* is a question about the `Glyph` tables (§4); `§` `·` `×` `°` `±` `π` `Σ` arrive from outside them. (`µ` is **Neutral** and belongs on neither list — checked rather than assumed, which is the habit this whole entry is about.)

**The cost was one-directional and it is I1's hazard.** A row measured at *n* cells that draws *n+1* wraps, and a wrapped line scrolls the alternate screen. Measured against the property before the change, at `ambiguousWidth: "wide"`: **138,132 code points measured one cell where the property says two.** Three of them — `§` `·` `×` — are members of A03 SS47's `PROSE_MARKS`, the one set exempted from the substitution rule *because it is prose*, and therefore the one set that reaches a frame unconverted. **Seven of those ten marks are Ambiguous and three were in the gap**; `«` and `»` are Neutral and were right, and `⚠` is Neutral and is over-counted by the deviation below.

**The deviation is recorded rather than inherited.** `DRAWN_AS_GEOMETRY` keeps the nine blocks the framework draws its own geometry from whole, even where the property says Neutral: **625 code points are Ambiguous for no reason but that list** (576 Neutral, 49 Wide). The deviation errs in the harmless direction, since an over-count pads a row and an under-count wraps it. **The premise it used to rest on is false at HEAD, and it was checked rather than inherited.** It read *§4c's gates read this answer — `halfBlockEligible`, C12's line-draw and ramp arms — so classifying those glyphs Ambiguous is what makes the wide-convention gate fire at all*, and it named its own retirement: *the day one takes the capability directly, its range is dead.* They already do. `isAmbiguous` has exactly **one** caller in the tree — `clusterCells` — and every gate named there reads `caps.ambiguousWidth` directly. The list is not dead, but what survives is the smaller, measurable claim above rather than a gate that depends on it. U+2B00..U+2B1F has **no Ambiguous member at all** in the property and is deviation entire.

**The largest consequence, stated so it is re-checkable rather than rediscovered**: the property makes the private use areas Ambiguous — U+E000..U+F8FF and the two supplementary planes, 137,468 code points — so a consumer's icon font measures two cells under the wide convention. That is what the property says and what a wide-convention terminal does; it is not something measured here on a real emulator.

### The Wide set is the property too, and its errors were in the default mode

**Same file, same revision, same method** — `EastAsianWidth-17.0.0.txt`, 2025-07-24. `isWide` is now every `; W` and `; F` row of it, sorted and merged: **123 ranges over 182,876 code points**. Wide and Fullwidth are one table because they are one answer; the distinction is about where a glyph came from, not how many cells it takes.

**This is the more dangerous half, and the reason is the mode.** `isAmbiguous`'s gap only showed at `ambiguousWidth: "wide"`. `isWide`'s showed at **narrow** — the default, and the convention every golden frame in the tree is rendered in. Measured against the property before the change:

| direction | code points | runs | where |
|---|---|---|---|
| `W`/`F` measuring **one** cell — an under-count | **8,619** | 65 | Tangut and components 7,529 · Kana Extended/Supplement and Nushu 687 · Tai Xuan Jing and counting rods 110 · Yijing hexagrams 64 · enclosed ideographic supplement 61 · Hangul Jamo Extended-A 29 · ideographic marks and Kana Extended-B 25 · ~35 singletons, `⌚` `⏰` `⚡` `⚪` `⛄` `✅` `✨` `❌` `❗` `➕` `⭐` `⭕` `🀄` among them |
| **not** `W`/`F` measuring **two** — an over-count | **369** | 51 | unassigned gaps the coarse blocks swallowed (U+2FD6..U+2FEF, U+31E6..U+31EE, U+A4C7..U+A4CF); 302 text-presentation emoji of plane 1 |

An under-count is I1's hazard: a row measured at *n* cells that draws *n+1* wraps, and a wrapped line scrolls the alternate screen. **The 369 in the other direction had to be checked rather than argued**, because narrowing a glyph a terminal draws wide would be the same hazard introduced by the repair: of the 369, **none has `Emoji_Presentation=Yes`** (`emoji-data.txt`, 17.0.0, 2025-07-25). The text-presentation emoji are one cell until a variation selector asks for the emoji form, which `clusterCells` already answers two for.

**The two tables overlapped, which the property's classes cannot, and the repair is a derivation rather than an addition.** `0x3041..0x33ff` claimed U+3248..U+324F, which the property calls Ambiguous — eight code points measuring **two at narrow where they should measure one**, an over-count sitting inside an under-counting table. Unioning a generated Wide table on top of the old blocks satisfies every row about the 8,619 and keeps all eight; deriving both tables from one file makes the disagreement impossible, because the property's classes are disjoint and `WIDE_RANGES ∩ AMBIGUOUS_RANGES = ∅` by construction (measured: 0). T1.28c is the row that refuses the union.

**Where the property meets `DRAWN_AS_GEOMETRY`, the property wins — and the ordering is not what says so.** 49 code points of the geometry blocks are `W`: `⛄` `⚡` `⛔` `◽` `⚽` and the zodiac. They are two cells under both conventions. Swapping the two tests in `clusterCells` so the Ambiguous arm runs first **fails no row in the suite** — at narrow the Ambiguous arm is short-circuited by the convention and at wide both arms answer two — so a sentence resting on the order would forbid nothing. What settles it is that a glyph the property already calls Wide measures two under *every* convention, which is the whole of what the deviation was buying for it. The deviation's own figure is therefore **576** Neutral code points, not 625.

**Swept against the property after the change, the remaining disagreements are exactly the recorded deviations and nothing else.**

| mode | under-counts | over-counts | what they are |
|---|---|---|---|
| `narrow` (before) | 8,619 | 395 | |
| `narrow` (after) | **0** | 748 | 722 zero-width (combining marks, ZWJ, BOM, variation selectors — the property is not a width table for `Mn`) · 26 regional indicators, a lone one drawn as a two-cell placeholder |
| `wide` (before) | 8,570 | 963 | |
| `wide` (after) | **0** | 1,324 | the same 722 and 26, plus `DRAWN_AS_GEOMETRY`'s 576 |

**And the population this is indexed to is far-side text, not the tree's own literals.** The request that raised this said `⚡` appears 26 times in `src/` and `test/`; measured, it is **6** — one docstring, four a test fixture's action label, one a spinner corpus — and 36 in the whole repository, nearly all prose that never reaches a frame. **That count is not the argument in either direction.** Resting the case on it is exactly how the old table's comment went wrong: `cells()` measures whatever a far side hands it, and a container name, a log line, a commit subject or a unit column may carry any of these.

Truncation is also grapheme-aware: a cut never lands inside a cluster, and a double-width glyph that would straddle the boundary is dropped rather than half-drawn.

**Wrapping is not truncation, and it had been treating an unplaceable cluster as though it were.** A cluster that does not fit the remaining width moves whole to the next row; a cluster wider than the *whole* line cannot be placed at all, and the wrap dropped it — at a usable width of 1, every CJK glyph and every emoji simply left the output. Both halves called the same function, so `measure` and `render` agreed and I1 held: the frame was arithmetically consistent and describing content it did not hold, which is the failure I1 cannot see.

It is substituted by a one-cell `?` (I19). Three answers were available and two are worse: placing it anyway overflows the row into one nobody counted, which is the alternate-screen scroll C09 exists to prevent, and a blank loses the fact that anything was there. `?` is one cell in every capability mode, which matters because `measure` receives no capabilities and so cannot choose a marker the way `truncate` does.

**How narrow this has to be, measured rather than assumed.** A cluster is at most 2 cells, so the substitution needs a usable width of exactly 1. Three of the four ways to reach it are degenerate — a 2-column terminal, a `notice` with a glyph at width 3, `panel` nesting at 2 columns a level. The fourth is not: a `row` group hands each child `floor((w − (n−1)) / n)`, floored to 1, which is 1 whenever `w ≤ 2n − 1` — sixty children at 120 columns, twenty at 40. **The boundary is child count, not terminal width.** No in-tree adapter builds a row group today, so it is latent rather than live; it is reachable through C24's public `group(direction, children)` at an ordinary terminal size as soon as an app builds one from a data list, which is R01 R4.4's reuse claim. Recorded with the figures so nobody restores the drop on the grounds that it only fires at width 1.

### Runs — a span's offsets against the wrap, the cut and the cluster

A `TextSpan` (C04 §3am) addresses a text member by UTF-16 code-unit offset, and this is the
renderer's half of that contract: four mechanisms, each an existing function given the one
property a span needs from it, and none of them a second arithmetic over the same string.

**Wrapping carries a source offset, and `wrapCells` is its projection.** `wrapCellsParts(text,
width)` returns `{ text, start }[]`, where every row is an exact contiguous slice of the source
beginning at `start`; `wrapCells` is `wrapCellsParts(stripControl(text), …)` with the starts
dropped, so the two cannot disagree about rows. The offset exists because the rows do **not**
concatenate to the source — a break drops the space it broke at, and `"the quick brown fox
jumps"` at 10 gives rows summing to 18 units of 19 — so a consumer slicing spans by prefix sums
of row lengths is one unit early at the second row and at every row after it (C04 I86). `runsOf`
cuts the text into runs by the offsets and strips control characters *per run*, in that order,
because `stripControl` deletes and would move every offset after the character; `wrapRuns`
applies the unplaceable-cluster substitution before wrapping (`placeableClusters`), so the rows
are exact slices of what the wrapper was given and a substituted cluster keeps its span (I19).

**A boundary inside a cluster snaps outward, at both ends.** The gate refuses a surrogate split
and can see no other cluster interior (C04 I84), so `clusterEnds(text)` — the ascending code-unit
offsets at which clusters end, empty for printable ASCII where every index is a boundary — is
what the renderer consults: a `from` inside a cluster moves **back to the cluster's start**, a
`to` inside one moves **on to its end**. Outward rather than inward, because a span that named
part of a cluster meant the cluster; and width-preserving by construction, because the cluster
is painted whole and `cells()` measures it as one either way. Painting SGR between a base and
its combining mark, or between the members of a ZWJ sequence, changes what the terminal
composes, and a changed composition is a changed width — the failure I1 cannot see. A span whose
two boundaries meet after snapping is dropped rather than emitted empty.

**Runs are painted coalesced by style reference, so a row with no span is byte-identical to the
row it was.** `withSpan(style, attrs)` spreads at most `bold`, `italic` and `underline` onto the
block's resolved tone and returns `style` *itself* when there is nothing to add; `paintRuns`
merges adjacent runs whose style is the same reference, so an unspanned row paints as the single
span it always was and a spanned one breaks into exactly the pieces its attributes require. That
is what let the mechanism land without moving a golden frame: a `paint` that closed and reopened
the same style between two plain pieces would draw the same picture in different bytes, and the
golden gate's no-move is the evidence that it does not.

**The truncation marker is measured, and it had not been.** `truncateParts` returns `{ kept,
prefix, suffix, start }` — the exact kept slice, the marker and its padding at whichever end
`from` names, and `kept`'s code-unit offset into the source, `0` from the end and `length −
kept.length` from the start — so a caller slices its spans against `kept` and paints the marker
in the block's tone and never inside a span (C04 I86). It reserved `limit − 1` cells for the
marker where `truncate` measured the cluster: at `ambiguousWidth: "wide"` the ellipsis is two
cells, so `kept + suffix` came to `limit + 1` — F292's shape, a row one cell wider than it was
measured, one function along from where F292 found it. Both now read `clusterCells(marker)`,
which is the drift a shared helper exists to prevent (I9).

**A run carries a tone or a value, and each reaches colour through its owner's resolver — never
through a value of its own** (C04 I89, C04 I90, C10 §4e). `Run` gains `tone?` and `value?`
beside `attrs`, copied from the span by `runsOf` and carried through `sliceRuns`, `runLines` and
`wrapRuns` unchanged. `paintRuns(runs, style, ctx)` takes the block's resolved style *and* the
render context, and for each run: a `tone` **replaces** the block's style with `tone(run.tone,
theme, caps)` — the same call the block made, memoised by C10, so two adjacent runs of one tone are
one reference and coalesce as plain runs do; the attributes then spread on top by `withSpan`; and a
`value` paints the run's **background** from the block's `colormap` through `continuousColour`,
the resolver heatmap and image already use, so the ladder is the colormap's — `undefined` below
8-bit, and a run whose only member is `value` then coalesces with its neighbours by reference and
a 4-bit frame is byte-identical with and without it (C10 I31). Foreground stays whatever the tone
(the span's or the block's) resolved. **The colormap reaches `paintRuns` by name on the context**
(`ctx.colormap`), looked up in `COLORMAPS` there and nowhere else in this component; the gate has
already refused a `value` on a block with no map, so a run with `value` and a context with no
`colormap` cannot arise and is painted plain rather than thrown on.

**A focused table row paints its span tones as it paints its cell tones: not at all.** C11 I14
replaces `cell.tone` with `accent` for the focused row, and a span's `tone` is the same kind of
claim at a finer grain, so `cells.ts` drops `tone` from the runs of a focused row before painting.
The alternative — inline code keeping its colour inside a focused row — makes the row read as two
things, and focus is the one time a row must read as one. Attributes and a `value` survive focus,
because neither is a claim about the foreground.

**A row that fills exactly and is followed by a space breaks at that space, and the break space is
in no row** (C04 I86). The overflow check fires on the space — a row is exactly full when a
one-cell space does not fit — and the break-point search then looked *backwards* for a space
inside the row, so the last word moved down though the row it left fitted: `"aa bb cc dd"` at 5
gave `aa` / `bb` / `cc dd` where `aa bb` / `cc dd` fits twice exactly (F591). The overflowing
space **is** the break, whether or not the row has an earlier break point; the arm that ruled the
no-break-point half of this (`"abcdef gh"` at 6 began the next row with the space, F590) is that
same rule with the search's answer ignored, and is one arm rather than two. **Two guards, and each
is another rule already stated meeting this one.** A row *already ending* in a space is at its
second space or later, where the break was the first one and the surplus is the next row's
content — `"abc   def"` at 5 keeps `" def"`, so the arm asks that the row not end in a space. And
a break falling **strictly inside an atom is not a break** (C04 I90), which is `breakPoint`'s own
test applied at this position: an atom too wide for any row is cut at a cluster boundary as an
unbroken token is, and a cluster-boundary cut drops nothing, so `"aaa bbb ccc"` at 7 valued whole
is `aaa bbb` / `" ccc"` and not `ccc` — the space is content inside the value, and swallowing it
is a break inside the atom wearing a break space's clothes (F593). The general property the two
findings instance is that **no row could have taken the first word of the next row**, and it is
swept over a corpus at every width from 1 to 40 rather than pinned at the two strings that found
it (T3.10b2): a row breaking early is invisible to a per-row width assertion, because a short row
fits.

**A valued run is a wrap unit, and the wrapper learns one property rather than gaining a sibling**
(C04 I90). `wrapCellsParts(text, width, ambiguous, atoms)` takes an optional list of `[from, to)`
code-unit intervals into the text it is given, and never places a break **strictly inside** one:
a space inside an atom is not a break point, and where a full line has no break point outside its
atoms the break moves to the **start of the atom the next cluster would extend** — provided
something precedes that atom on the row. An atom that begins a row and still does not fit is
broken at a cluster boundary as any unbroken token is, which is C04 I90's *a value wider than the row
is broken as text is*. An explicit newline inside an atom breaks, because it is the author's.
`wrapRuns` computes the atoms from the runs' `value` members over the **placed** text (the
substitution is per run, so a `?` for a two-unit cluster moves no other run's offsets) and passes
them; `wrapCells` passes none, so every caller that is not a run caller is unchanged.
**`notice`'s `measure` and `render` now share `noticeRows`**, which is `wrapRuns(runsOf(text,
spans), proseWidth)` for both — the file's own *one layout function for the pair* rule, applied to
the one wrapping text member. The height is therefore the same with and without every span member
except `value`, and differs with `value` exactly when a valued run would otherwise straddle a row:
measured, `"aa bb cc dd"` at 5 is **two** rows plain (`aa bb` / `cc dd`, both exactly full) and
three with `bb cc` valued, since the atom cannot straddle the break the plain wrapper takes —
before F591 the plain answer was also three and the example showed nothing, which is what a
fixture that does not respond to the thing under test looks like; `"x(abcde)yz"` at 6 is two rows plain and
**three** with `abcde` valued, and `"The cat sat on the mat ."` at 12 with a value per token is
two rows either way, because prose already breaks at the spaces between tokens. **A single-word
valued token never changes the count** unless the row around it has no space at all — the
interaction is between `value` and the *no-break-point* arm, not the ordinary one.

**Markdown's inline code is a `tone: "identifier"` span** (C04 §3am.1, roadmap 11 residue ii).
Of `TONES`, `identifier` is the slot the tree uses for a name one can refer back to — a container
name, an ID, a port, an image — and `meta` is the slot for timestamps, percentages and secondary
detail; a backtick run in an agent's markdown is a flag, a path, a symbol or a command, which is
the first kind. The backticks are gone from the text and the span sits at the offsets of what they
enclosed; a backtick run inside emphasis is one span carrying both the attribute and the tone
(§3am cell 12's adjacent-disjoint rule); an unclosed backtick, and an empty pair, are literal
characters exactly as an unpaired `*` is. Fences are untouched.

---

## 5a. A line that already carries SGR

`cells()` is wrong for a rendered line, and wrong in a way that looks right.
`stripControl` drops the ESC byte because it is a control character and keeps
`[38;5;241m`, which is ordinary printable text — so a themed row measures eleven
cells too wide per colour change. C22's frame padded every chrome row to eighty
*counted with the escapes*, which made the visible row about thirty-eight and
left the previous frame showing across the rest of it. `displayCells` and
`fitStyled` are that answer, and they live here rather than in C22 because this
is where display width is decided (I1, I6).

**`sliceCells` is the same question asked from the other end, and the frame
cannot composite without it.** Drawing a layer over a painted row means keeping
cells `[0, left)` of that row, writing the layer's cells, and keeping cells
`[left + width, columns)`. `fitStyled` answers the first. The third has no
expression as a `slice`: a cut by code unit lands inside an escape, `[38;5`
reaches the terminal as literal text, the SGR is never terminated, and the colour
bleeds down every row below — which is worse than the mis-measurement, because it
survives the frame.

So the tail is taken by the same grapheme walk, with two rules that are the whole
reason it is not a substring:

- **The skipped prefix's SGR is carried forward.** A style opened before `from`
  is still in effect at `from`; a tail that dropped it draws in the terminal's
  default colour, which reads as the layer having bled rather than as the base
  having lost its style.
- **A cluster straddling either boundary is dropped and its cell blanked**, never
  halved — I9's rule, applied to a window rather than to a cut. Half a
  double-width glyph is a row one cell wide, and a row wider than it was measured
  wraps into a row nobody counted.

I20's composition law is what makes the splice provably width-preserving, and it
is stated as a law rather than as three cases because the failure it prevents is
arithmetic: three pieces that each measure right and together measure `columns +
1` put the frame one cell into the next row.

---

## 6. Registry state machine

| From ↓ / call → | `register` | `seal` | `measure` / `render` |
|---|---|---|---|
| **open** | → open (T1.1) | → sealed (T1.2) | works (T3.1) |
| **sealed** | throw (T3.2) | no-op (T3.3) | works (T1.3) |

Sealing matches C05's manifest store and C07's adapter registry. A kind registered mid-session would let a block measured before registration differ from the same block measured after — drift that only appears on scrollback.

---

## 6b. The walk — which kinds can be windowed, and the one that cannot

**Two artefacts, because the question has both shapes.** The classification table asks which kinds
divide, which is structural and holds at rest. The trace asks what a *scroll* does — two windows of
one block, and whether they agree — which is event-mediated and is where C25 I21a's defect lived.

**Measured first** (F423, F424): the seam is built and wired at `session.ts`, and painting the top
forty rows of a 50 000-row block costs **0.65 ms** for the kind that declares a window and
**913.79 ms** for the kind that does not. 1 400×, with every assertion passing and the frame correct.

### The table — what each kind derives from rows outside the slice

| kind | derived from the whole | verdict |
|---|---|---|
| `logs` | nothing — the level column is a constant and the message takes the residual | **windows**, exactly |
| `patch` | the gutter, via `numberWidth` | **windows**, with the width **pinned** (C25 I21a) |
| `keyValue` | the key column, via `widest` | **windows**, with the width **pinned** — the same argument one kind over |
| `table` | **two things, and only one was recorded.** `planColumns` reads the column definitions and the width, never the rows (F134) — so the *column* layout is safe. But `hasActionBar` is `rows.some(r => r.actions)`, and it costs **two rows** of height | **not yet** — four interactions, below |
| `code` | **the parse** | **windows**, with the **text kept whole** and `lineRange` pinned (C14 §4a, C04 I82) — see below for why a *sliced* text cannot |
| `plot` | the whole series | atomic, permanently (C12 I1) |

**`widest` and `numberWidth` are the same problem and `tokenise` is not**, which is the ruling this
walk exists to make. A width can travel with a window: the block says what its parent measured and
the renderer prefers that over deriving. **A parse cannot travel**, because it is not a number
attached to the block — it is a function of every character before the slice. **What can travel is
the text the parse is a function of**, and that is the ruling C14 §4a added: the window carries the
whole `text` and a line range, so nothing is re-derived from a slice because there is no slice.

### Why a sliced `code` text is refused, measured — and what the window carries instead

`tokenise` runs over the whole text. Slicing lines out changes what they *are*:

```
a block comment opening at line 2 and closing at line 11, tokenised whole
    slots present:  comment  keyword  null  number
the same lines 4–7, tokenised as a window
    slots present:           keyword  null  number
```

**Lines that are commented out come back as live code.** And `measure` never tokenises (C09 §3,
T2.13), so the height is identical — **C09 I26's equality holds perfectly while the colours are
wrong**, and no geometric assertion can see it. Containment is not correctness.

**The fix is not a wider slice.** A comment can open at line 1 of a 50 000-line file, so any bounded
context is a guess; carrying the lexical continuation means a field on `Code` holding a highlighter's
internal mode, which is a public type carrying another library's state. **The fix is no slice**
(C14 §4a, ruled 2026-09-03): the window keeps `text` whole — the same string, so the tokeniser's memo
hits on every frame — and sets `lineRange: [from, to)` in source lines (C04 I82). `render` tokenises
the whole text, as it always did, and produces only the rows in range; `measure` counts only those
lines. The pin is two integers rather than a mode, and the parse is identical to the whole block's
by construction rather than by context. Units are source lines, so a window never opens inside a
wrapped line and the surplus is `skipRows`/`dropRows` (I26). Measured on the pass that built it: a
40-row window of a 2 000-line `code` block paints **40 rows** where it painted 2 000, and a
comment opening above the window keeps its slot on the rows inside (C14 T1.18).

### What `table` owes — two fields, one parameter and a residual

Written down before it was attempted, because four interactions in one window is where a rushed
change earns its defect. **The question to ask of each is not *does a window change this* but
*does a window change what this is derived from*** — the first needs a field, the second often
does not, and the six answers are not the same.

| what it derives | derived from | what a window moves | verdict |
|---|---|---|---|
| the column plan | `columns` and `width` | **neither** | **Nothing.** `planColumns(cols, width)` takes no rows at all: C11 §3 plans from *declarations* — `minWidth`, `maxWidth`, `flex`, `priority` — and never from cell content. **That is the structural reason `table` needs no width pin where `keyValue` did**, and it is a fact about the signature rather than a finding that cleared it |
| the header | `showHeader` | neither — a declared flag | Expressible today, and the only one of the six that was |
| the empty message | `rows.length > 0` | what it is derived from | **Nothing, once a window never goes bodyless** — the two mirror cases below |
| the action bar's **presence** | `rows.some(r => r.actions)` | what it is derived from | **A field**, and it declares a *presence* rather than a width: `Table.actionBar` (C11 I18) |
| the display **order** | `sortedRows`, through `kindOf(rows, key)` | what it is derived from, **and the derived thing changes** | **A field**, and the one nobody had named: `Table.presorted` (C11 I19, F429) |
| an expanded row's unit | `detailHeight`, through `measureChild` | neither — the unit travels with its row | **A parameter and a residual**, not a field: `window` takes `measureChild` (I26a) and the surplus is paid by `dropRows` (I26) |

**Row 5 is measured rather than reasoned, and it is the one that inverts an assumption.**
`sortedRows` looks like a permutation, so slicing the sorted order and letting `render` sort the
slice again looks idempotent. It is not: `kindOf` decides a column's comparator **from the values
present**, so a window that drops the one non-numeric value in a numeric-looking column
re-classifies it. Measured, a sortable column of `2 · 10 · abc` ascending — the whole block
classifies as text and renders `10 · 2 · abc`; its first two rows, windowed, classify as numeric
and render **`2 · 10`**. Reversed, with every count and every height correct. F426's shape one
kind over, reached by a fix that looked like the obvious one.

### The two mirror cases, and each is paid at a different end

**Neither end of a table is a row, and both ends can be asked for alone.**

- `[0, 1)` is the header. A window holding no rows is *bodyless*, C11 §5's empty-table rule fires,
  and it measures `header + 1` against a range of 1 — with the surplus **after** the header, where
  `skipRows` cannot reach.
- `[n−2, n)` is the gap and the bar. A window holding no rows cannot draw a bar at all, because the
  bar's existence is derived from the rows it would describe.

**So a window never goes bodyless.** It keeps the nearest row unit and pays for it in whichever
residual the row falls outside — `dropRows` for the header case, `skipRows` for the bar. The other
way round for the first was to render the empty message and drop it, which costs the same row and
puts a sentence on a frame that is false about the document it came from.

**And the pin is an argument rather than a memory.** `actionBar` is recomputed from the block
`window` was handed, so there is no moment at which it describes the previous document; a `true`
carried across a patch that removed the last `actions` would be a two-row lie surviving into the
next frame. MG27 is what keeps a producer from writing one (`BUILDER_OMISSIONS`).

### The table trace — a window, and then something happens

| # | window | then | rules that meet | ruling |
|---|---|---|---|---|
| T1 | `[10, 20)` of a sorted table | the reader sorts on another column | I8's height-neutrality · the range is in **display** space | Height-neutrality says C14 need not remeasure; the window's *contents* change completely, because the range addresses drawn rows. Both correct, about different things — and a window caching its rows against `rev` alone would still be right, since a sort moves `rev` and does not move the height |
| T2 | any | a row **above** the window expands | I9 | Everything below shifts by the detail's height, so the same viewport offset is now a different range. The window is re-taken per frame and carries no `from` of its own |
| T3 | one covering the bar | the last `actions` are patched away | I17 · the pin | The parent loses two rows and `rev` moves. The pin is recomputed, so it cannot be the stale half of a pair |
| T4 | `[0, 1)`, then `[0, 2)` | the reader scrolls one row | C11 §5 · I26 | The first is bodyless-by-range and the second is not, so the residual moves while the block gains a row. **A row asserting one offset passes against a residual that is simply wrong** — the sweep is what catches it, as C25 T3.20 already says for `keyValue` |

### The trace — two windows of one block, and whether they agree

| # | first window | then | rules that meet | ruling |
|---|---|---|---|---|
| B1 | rows 0–40 | scroll to 200–240 | I25 · the kind's own layout | **The drift is a difference between two windows**, so a row asserting one window against a constant passes against a pin that is simply wrong. C25 T3.20 says the sweep and not one offset; `keyValue`'s row copies it |
| B2 | any | the window covers the whole block | `windowSequence` | The block is passed through unsliced and carries **no pin** — and that is correct, because deriving from the whole block is what the pin would have said. Asserting the *field* rather than the effective width reports this as drift; the observable is what the renderer will use |
| B3 | any | the kind declares no `window` | I25 | Kept whole, paid out of `skipRows`. Silent by design, and F424 is the finding that nothing reports which kinds declined |
| B4 | rows spanning a detail block | scroll one row | C25 I19's shape in `table` | An expanded row is an indivisible unit taller than one row, so a boundary inside it is `skipRows`, not a shorter slice — the accounting `windowRows` already reasons through |

---

## 7. Invariants

- **I1** — For every registered kind, `measure(b, w)` equals the row count of `render(b, ctx)` at width `w`. The system's most load-bearing invariant.
- **I2** — `measure` is pure and total (C04 §5). No I/O, no clock, no throw on any input. **A `minHeight` floor does not weaken this and cannot, because no definition sees it**: the registry applies it (I33), so `definition.measure` is a function of `(block, width)` exactly as before, and a kind cannot consult a floor even by accident.
- **I3** — No renderer reads the environment. Capabilities and theme arrive through `ctx`.
- **I4** — No renderer emits a colour directly; all styling comes from `resolve` against a declared palette slot.
- **I5** — Every capability substitution is 1:1 by cell count.
- **I6** — `cells()` is the single width implementation; no kind computes width independently. **Its Ambiguous set is `East_Asian_Width=Ambiguous` derived from the property with the file's version named, plus a listed deviation for the blocks the framework draws geometry from** — a hand-recalled table is a claim about terminals nobody measured, and the one it replaced under-counted 138,132 code points at `ambiguousWidth: "wide"` (§5, C02 I9).
- **I7** — Container kinds measure children only through the injected `measureChild`. No kind imports the registry.
- **I8** — `measure` never reads `ctx.tick`. Animation changes appearance, never geometry.
- **I9** — Truncation never splits a grapheme cluster or leaves half a double-width glyph. **It takes the end it removes from as a parameter** — `"end"` by default, keeping the start; `"start"` keeps the tail and puts the marker at the head. Both are exactly `width` cells, both place one 1-cell marker, and neither splits a cluster: the two directions share one implementation for the same reason there is one `cells()`, because a second walk over the same grapheme stream would round differently at the boundary. Which end a column removes from is C04's `truncateFrom` (C04 I32) and the surfaces' decision; a middle truncation is not in the union — it spends its marker between two kept halves, which is different arithmetic, and it arrives with a clause here or not at all.
- **I10** — An unregistered kind renders through `raw`, never throws.
- **I11** — **A renderer throwing is contained, and the containment includes the row count.** That block renders as an error block of exactly `measure(b, w)` rows — the message on the first, blank rows below — so I1 holds through the error path as well as through the ordinary one, and the rest of the frame is unaffected in **position** as well as in content. A containment that restores the content and not the contract is not containment: measured against a real `plot` of `height: 20` the error block drew **1**, and `[raw, throws(20), raw]` measured **22** against **3** rendered — so the frame padded bottom-aligned and read as a shorter transcript while C14 went on scrolling the block as twenty rows (F223). **A definition that throws in either half renders this block**: a contained `measure` answers 1 (T3.14) and the render is *replaced* rather than truncated to it, because a fifth of a drawing with nothing saying so is the same failure one level down — measured too, at 4 of 5 rows dropped by the caller's own clamp. **The message is fitted to the committed height, never the height to the message.** Compute, so no retry (A02 §7 rule 2).
- **I12** — A sealed registry cannot be registered against.
- **I13** — Every kind in C04's union has a registered default definition. Asserted exhaustively over the type.
- **I14** — Whether a kind wraps or truncates is fixed per kind, not per block, so height stays a function of block and width. `code` is the one exception and it is explicit: the producer chooses through `wrap`, which is a field of the block and therefore visible to `measure`.
- **I15** — Renderers emit SGR through `terminal/escapes.ts`, switching on the depth tag; no renderer sets an Ink colour prop. This is the framework's only runtime L1 → L0-terminal edge, and it is deliberate: two ways of colouring a cell means two ways of degrading it, and only one of them would honour C10.
- **I16** — Ink's layout width agrees with `cells()`. C09 hands Ink pre-broken lines, so Ink's own idea of how wide a string is must match the measurer's or a line it considers too long wraps and adds a row nothing counted. Asserted (T2.16), never assumed — a silent disagreement here breaks I1 for every kind at once.
- **I17** — `gapBefore` is applied by the sequence, never by the block (C04 §3a, C04 I19). `measure` never counts it; `measureSequence` and every container do.
- **I18** — Control characters are stripped from every text field before measurement and render, by C09 and not by its callers. A far side's output cannot inject escape sequences into the frame: `\x1b[2J` cannot clear the screen, a cursor-position query cannot get its answer typed into the prompt, and a stray `\r` cannot make a measured row and a rendered row disagree. Stripping happens once, at the last point before both, so measurement and render cannot see different text.
- **I19** — Wrapping never deletes a cluster. A cluster wider than the line it must fit into is **substituted** by a one-cell `?`, never dropped: a row that silently loses a glyph is a frame that is arithmetically consistent and describing different content than it holds. Substitution rather than overflow, because a row wider than it was measured wraps into a row nobody counted — the one failure I1 exists to prevent. C17 I20 answers the same question the other way and says why: a block renders someone's data, an editor holds what the user typed.
- **I20** — A cell window over a styled line composes and preserves width: for every `0 ≤ a ≤ b`, `displayCells(sliceCells(t, 0, a)) + displayCells(sliceCells(t, a, b))` equals `displayCells(sliceCells(t, 0, b))`. The window carries the skipped prefix's SGR forward, so a tail draws in the style that was in effect where it starts, and it never splits a cluster or half-draws a double-width glyph — I9's rule over a window rather than a cut. This is what makes compositing a layer into a painted row width-preserving by construction rather than by three separate measurements happening to agree: three pieces that each measure right and together measure `columns + 1` put the frame one cell into a row nobody counted (§5a).
- **I21** — A `rule` with an empty label draws an unbroken line. The lead, the label and the fill are separated by spaces that exist to set a label apart from the line; with no label they are a two-cell gap at the left of a rule that is a boundary rather than a heading. Found by reading a frame — C19's menu edge (C19 I23) is the first unlabelled rule in the tree, and every assertion about it was about width and about the block being present, both of which held.
- **I22** — **Every non-ASCII character the framework draws is resolved against the capability, on the same terms as a block's glyph.** §4's argument is about where the knowledge lives, so it does not stop at the block schema: a mark in the framework's own text is a `Glyph` slot, or it is a pair resolved where the capability is in hand, or it is ASCII. A substitution used by a function the *measurer* also calls is 1:1 by cell count, as I5 requires of the vocabulary — the prompt is that function, and its cell count is `PROMPT_GUTTER.first`. Enforced by SS47 with a per-site allow-list, because the rule was already true of four sites and false of six, and a discipline with that record is not one a sentence fixes (F122).

- **I23** — **A grammar can be registered after construction, and registering one invalidates the memo.** §4a promised that an unregistered language is readable now and highlighted *whenever someone registers it*; the constructor shipped with a fixed pair and no registration path, so the promise had no mechanism (F93). The invalidation is half the invariant rather than an implementation note: `tokenise` caches the plain-text fallback under the same key, so registration without it leaves every block already rendered flat until an unrelated cap eviction. **Measurement is unaffected by both**, which is what makes registration safe at any time — tokens change appearance and never line count (I8, T2.13).
- **I24** — **A grammar in the default set has its emitted classes mapped, or the omission has a reason.** Shipping a grammar whose classes `SLOTS` does not carry is indistinguishable from not shipping it — measured: `markdown` emitted four runs and coloured none. Three classes are unmapped deliberately: `hljs-params` is ordinary identifiers, `hljs-strong` and `hljs-emphasis` are appearance rather than a rôle, and **`hljs-addition` / `hljs-deletion` are a change axis, which C04's ruling says is a marker and never a tone** (F30, F81).
- **I25** — **A kind that divides declares `window`, and a window is a valid block of the same kind plus a residual offset.** `window(b, w, from, to)` returns `{ block, skipRows }`; the caller renders `block` and drops `skipRows` leading rows, and what remains is exactly what the full rendering would have put at rows `[from, to)`. The offset is not a convenience — it is what makes an indivisible unit (C25 I19) and a sticky header (C25 I18) expressible without inventing a row C14 never measured, which is drift three components from its cause. **A window is a block and never a list of rows**, because `Block[]` is what both consumers hold and a slice of rendered output would be a second height codepath.
- **I25a** — **A kind whose layout is derived from its rows pins that layout into the window; a kind whose *parse* is pins the whole text and a line range, because a parse cannot be sliced.** **One arm slices without loss: a window opening at line 0.** Nothing precedes the slice, so the parse of the first `to` lines is the whole block's over those lines by construction, and the window hands back the sliced `text` with no `lineRange` — the tokeniser runs over `to` lines rather than all of them (measured: 1 696 ms first paint of a 500-row window of a 50 000-line block against 196 ms steady, the cost a capped `code` block paid once per entry under C14 §4b). Every window opening later pins. `patch` pins `numberWidth` and `keyValue` pins `keyWidth`, because a window whose slice happens to hold shorter values would draw a narrower column and every row would shift sideways as the reader scrolls — measured at 14 cells against 3 for `keyValue`, and 4 against 1 for `patch` (C25 I21a). **`code` was refused on the other half of the same sentence, and the refusal was about slicing the text rather than about windowing**: `tokenise` is a function of every character before the slice, so a window carrying only the sliced text is a different *parse* rather than a narrower column — lines inside a block comment come back as live code, and `measure` never tokenises, so I26 holds while the rendering is wrong (F426). A width travels with a window; a parse does not. **So the text travels instead** (C14 §4a, C04 I82): `code`'s window keeps `text` whole — the same string reference — and pins the source-line range `[from, to)` in `lineRange`; `measure` and `render` both honour it, tokenisation runs over the whole text, and only the rows in range are produced. The pin is a range rather than a highlighter's mode, which is what the earlier refusal could not find a field for.
- **I26** — **`measure(window(b, w, from, to, measureChild).block, w) − skipRows − dropRows === to − from`, checked generically over every kind that declares `window`.** The form without the residuals is the one the seam invites and it is false for any window that costs slack. **Both terms, because slack falls at both ends**: `skipRows` is leading only, and `table` is the first kind whose last unit can hang past `to` (F428). The consumer has always dropped the trailing rows — `session.ts` writes `rows.slice(0, ve.takeRows)` — so `dropRows` names an operation the seam already relied on and could not state. Relaxing the identity to `≥` was the other option and it is the worse one: containment is satisfied by every wrong answer inside the bounds. Enforced by `measurement-conformance.ts` rather than per kind, so an application's own arm is held to it — without that a consumer's window is silently short and the frame describes a document nobody holds. It is I1's rule over a window rather than over a block.
- **I26a** — **`window` receives `measureChild`, on `elements`' argument and for the same quantity.** A kind whose unit boundaries depend on a child's height cannot compute them from `(block, width)` alone — a table row's offset is `header + Σ(1 + detailHeight(row))` — and a window that guessed would slice at the wrong row while I26's arithmetic still balanced. Supplied by the registry, so a kind cannot reach for its own (A02 Seam 1).
- **I27** — **A kind that does not divide has no `window` member, and that is how atomicity is expressed.** `plot` is the case and it is permanent: C12 I1 makes height a function of the block alone, so reducing the series changes nothing and reducing `height` rescales the curve. An absent member cannot be deleted by a later edit; a branch returning the block unchanged can, and reads as an oversight either way.
- **I28** — **A progress bar clamps its fill and never its number.** The bar has no cells past its last one; the percentage is the true fraction, so `150` of `100` draws a full bar and reads `150%`. Clamping both makes `100/100` and `150/100` one picture, which is the same objection `examples/docker`'s CPU bar was built around and the reason the two now agree rather than each being defensible about its own quantity. A `total` of zero has no proportion: an empty bar and `0%`, which is a floor and not a measurement. **A negative `current` is floored for the same reason** — `repeat()` with a negative count throws, so the block would not render at all (I2). Found by the mutation pass, which is where a guard with no fixture behind it shows up.
- **I29** — **Every containment reports what it swallowed, through a sink supplied at construction.** `createBlockRegistry({ onError })`, called by all **three** catches — `measure`, `render` and `elements` — with the block, the member and the error. **Four, when this was written**: the ownership question carried a catch of its own, and I30 folded it into `elements` because the two are one answer, so the fourth is gone rather than unreported. The implementation is the first thing that could disprove the count, and it did. A containment that reports nothing hides the bugs it exists to survive, and both of the two that shipped reported nothing at all: `measure`'s catch is bare, and `render`'s discards the error the moment it has read the message off it. **T3.14 has said `logged` for as long as the row has existed and nothing anywhere logged** — an effect named in a test row with no mechanism, satisfied by the half of the sentence that was true (F223). L4 wires the sink to C23's record of what the pipeline's bare catches swallowed (C23 I48), which exists and is already drained; the test harness supplies one that fails the run, and that is what makes a caught throw a red suite rather than a quiet frame.
- **I30** — **`elementsOf` and the ownership question are one answer about one block.** A throwing `elements` makes *that* block atomic for the dispatch (C26 I12) and leaves its children reachable: ownership is decided by what resolution **returned**, never by whether the member is declared. The two catches disagreed — `elementsOf` caught the throw and answered *no elements*, while the ownership question answered *it owns them, do not descend* — and the pair costs a whole subtree rather than a block: measured, a container whose `elements` threw yielded **0 elements against a control's 4**, with nothing said and `↓` skipping the lot (F224). I11's class in a different member, and it is stated here rather than left to C26 because the invariant is C26's and the mechanism is this file's.
- **I31** — **The `status` box occupies exactly `measure(b, w)` rows, and its two ladders live on different axes: height allocates rows, width decides what fills them.** The row count is never a width decision, because `measure` has already answered and I1 is what the whole error path exists to preserve — so where the width ladder drops the tag row, the row goes to the message rather than going blank. **The height ladder needs six rows for the full figure** — two borders, two blanks and the tag row — and the padding is dropped as a pair, the tag row next, the border after that; at one row the **failed** states keep the message and drop the retry line, because a countdown without its cause is a number nobody can act on — and **`loading` inverts it, keeping the line that moves.** That clause was a correct sentence about `error` and `retrying`, applied to all three: a waiting box has no cause, its message is a label the panel above already carries, and the whole of what it says is that it is still waiting. Wired up at two rows it drew `loading` over `⠋ loading` — the word twice, with `measure` saying 2 and `render` drawing 2 and no assertion about rows, wrapping or precedence able to fail (F235). **The precedence stays a rule and not a truncation**: the message's row floor is zero rather than one, because a floor of one would put it back and let the final clamp cut it, which is the defect this rung's own note records having fixed once already. **The width ladder was missing and would have shipped broken**: ` ERROR ` is 7 cells and a rule needs 9, against a `group: row` that can hand a block five columns. It is a *structural* interaction — two rules both holding at rest, no event between them — and a figure indexed on height cannot reach one however many rungs it has (C19 §8a's lesson in the other axis). **`H ≤ 2` has no border and therefore no evidence the height was honoured**; that is stated rather than left to be noticed, because it is the one place the argument for the border does not hold. **`framed` is a second ladder on this axis and not a rung on it** (F406): a box whose container already draws a border spends none of its own rows on one, so the tag arrives at **two** rows — *tag and message* — and a third buys `retrying` its activity line. The coupling of tag to border was what made a box inside `b.live`'s panel choose between reading as a red line and drawing two nested frames; §3a has both measured. `loading` is unchanged at every height under either ladder, because it has no tag to gain.
- **I32** — **`status` animates unconditionally, its interval belongs to its set, and its numbers are fields rather than either.** No state-dependent branch: `retrying` is the error box plus a spinner line, so excluding `error` from animating breaks the state composed out of it and needs a per-state exception where a simple rule would do — and `error` drawing the same bytes every tick makes its stickiness free rather than a mechanism. The set is named by the block and defaults to what `steps` resolves to, so one glyph means *waiting* in three places; `spinnerIntervalMs` is the same lookup as `spinnerFrames`, so a caller cannot hold one set's frames against another's tick. **`retryInMs`, `attempt` and `elapsedMs` are supplied, never derived** — `tick` cannot carry a duration because C03 coalesces and drops commits under load, and this layer may not read a clock, so the only honest source is whoever holds one. **The counter advances, and for the life of the project it did not** (F227) — C03's commit is raised from C22's ticker, `visibleRows` supplies it, and the line cache carries the axis per kind. The kind was written against a working counter and drew a still frame instead, which is why sixteen tested spinner sets and a green suite said nothing: **`error` drawing the same bytes every tick is indistinguishable from `error` drawing them because nothing moved.** The property that makes stickiness free is the one that hid the break. **A consumer may now own one** (C24 I30, §4b) and the sentence above is unchanged by it: `b.status` relays the three numbers the driver hands a `renderError` and derives everything else, so `elapsedMs` and `spinner` stay the framework's and the ladders below never see a height a consumer chose. *An overridable rendering that could only render worse was the defect; the members that decide geometry were never the part an app wanted.*

- **I33** — **The registry applies C04's `minHeight` floor on both sides, so I1 holds by construction.** `measure` returns `max(definition.measure(…), block.minHeight ?? 0)` and `render` wraps a floored element in a box with the same minimum, which pads a short child and leaves a tall one alone. **Padding and never bounding is the whole of it**, and the alternative was measured: a fixed height drops an over-full box's **first** row rather than its last, and `overflowY: "hidden"` does not change that — so a bound would silently behead a block that grew. **A block carrying a floor is not windowed** (C04 I68). I26's identity is about rows the *definition* can produce, and `windowSequence` derives its `to` from the floored height — so a `window` that can only reach the definition's own rows breaks the identity from outside the definition. Kept whole and paid out of `skipRows`, as a kind declaring no `window` already is. **The floor is applied outside the definition** so that I2 survives it and `scroll`'s §3c purity argument is not reopened.
- **I34** — **The contained box asks for the height its message needs at the width it was given, capped at four message lines, and marks a cut.** Height fits and width does not: a block does not choose its width, the region does, and a block wider than its region is I1's over-draw in the other axis (§3a-bis). The request wraps at the **top rung's** content width — `width − 4`, the narrowest any rung offers — which dissolves the fixed point between the rung, its padding and the wrap by erring in the safe direction: every lower rung is wider, wraps to fewer lines, and still shows all of them, at a cost of at most one row of slack that the render centres. `rows = n + 2 + tagRows + lineRows`, and **the vertical blanks are not summed** — they are slack, appearing when the message is short and giving way as it grows, which is what the ladder already does with them; counting them would make a two-line failure seven rows rather than five. **The cap is measured rather than chosen** (F238): four lines holds a three-frame stack trace at 80 columns and a path and nothing else at 40, so it binds where the room is least — and it is not width-scaled, because how much a reader takes in before going to the sink is a property of the reader. **It is also a containment bound** (F239): a bounded container draws an over-tall child whole and C25 I1 is knowingly false there (C04 §3c trace 1, T2.28b), so seven rows bounds that divergence by a number rather than by the length of an exception. **A cut carries its mark** through `truncate`, so `…` at unicode and `~` at `ascii` (I22) — and **a message of exactly the cap carries none**, because a truncation that did not happen sends the reader to the sink for text already on screen. **One layout function serves `render` and the request**, on `cells()`'s argument: a second walk over the same arithmetic rounds differently at the boundary.
- **I35** — **A mosaic's cell bounds its own child, and the two properties that do it are not interchangeable.** The cell is `overflow: "hidden"` **and** its content carries `flexShrink: 0`, in that pairing: a relative child in a cell shorter than itself is **squashed by flex before it can overflow**, so the clip alone changes nothing and the child draws rows from the *middle* of itself — measured at `row2, row5` out of six, the same mechanism F244 §5 found under `scroll`'s bottom-anchored precedent. **The row count agrees in all three arms**, so the frame is the only instrument that separates them, and the failure is at its worst on the block that most needs reading: a bare cell drew an error box's fragment and its bottom border, which looks like a complete box. **So C04 §3c trace 1's divergence does not transfer** — F239 is `scroll`'s, whose need is a windowed slice at an arbitrary offset and whose seam genuinely does not exist; a mosaic needs a clip at the child's own row 0, which is exactly what Ink offers. `measure` equals the rendered count through an over-tall child and through a throwing one, and C25 I1 holds rather than being knowingly false. **The width axis is the geometry's guarantee and not the clip's, and the build is what said so.** F244 §4 measured an absolutely positioned child running past its parent's width — 60 cells at width 40, every count agreeing — and the remedy looked like `overflowX: "hidden"` on the container, which is what the group renderer already carries. **It does not compose.** Ink keeps a stack of clipping regions and applies `clips.at(-1)`, the *innermost*, so a cell that clips its own child **shadows** the container's clip instead of intersecting with it: three 1-wide cells in a container of 1 draw `"A"` when only the container clips and `"ABC"` once the cells clip too. Since every cell must clip — the first half of this invariant — the container's clip is shadowed everywhere it matters. **So `mosaicRects` clamps** and a cell with no room is zero-wide and not drawn, which is the only one of three answers keeping both axes of I1; the container's clip stays as the cheap arm of a rule enforced by the arithmetic. **The ruling named an operation that does not do what it appears to** — C23 §8a A4's class arriving from the implementation rather than the walk, and the reachable case is the floor of 1 per grid line, which asks a three-column grid for three cells at any width including one.
- **I36** — **An image has two arms and the dither is the first of them.** `imageProtocol: "kitty"` takes the protocol; `"none"`, `"iterm2"` and `"sixel"` take an ordered dither. **Two arms rather than four, and the refusals are for composition rather than effort.** Sixel draws at a cursor and does not participate in the grid. **iTerm2 does participate** — declared cell size, occupies cells, scrolls — and what it lacks is **per-cell addressability**: a kitty placeholder is ordinary text so any row is independently re-emittable and text can sit inside the rectangle, while an iTerm2 image is one escape at one cursor position that a row-level rewrite destroys. **That settles F248's diff measurement by construction**, since a full-frame rewrite is safe for placeholders and fatal for one blob. **The transmission does not travel in the frame**: Ink strips APC escapes — an `ESC _G` in a `Text` node renders to nothing — so the escape is written by **`transmitImage`**, prefixed to the frame's bytes at the composition root, and only the placeholders go through Ink as text. **Three measured properties make that safe**: Ink is not in the byte path, the diff baseline is `lines` rather than the write, and every frame reaches an *absolute* address before any row content — so a cursor the escape might have moved is corrected by the next byte. It **leads** the frame rather than following it, because placeholders for an unsent image draw nothing; it transmits on entry into the **document** rather than the viewport, keyed by digest so one image sends once; and `session.ts` is the only path that writes block rows, which is what makes one seam sufficient (§4c). **The dither is built first because most terminals are `"none"`** and a feature that shows nothing there is one most readers never see; **1-bit is not a further degradation**, because a dither is shape and colour was never its carrier. **The matrix is designed here because it is designed nowhere** — the note citing *the 3D renderer's ordered dither* cites a renderer the roadmap refuses — and it is an **8x8** Bayer threshold indexed in **dot** space over the 2x4 subcell grid, nine levels per cell, **varying with position so a gradient reads as texture rather than banding**. **8x8 rather than the 4x4 the note implies, and the frame chose it**: a 4x4's y-period equals a braille cell's height, so a flat region resolves identically in every cell row — and while the two are frame-identical at quarter levels, at 0.28 the 4x4 draws one glyph where the 8x8 resolves two. `plot/raster.ts` is reused rather than reimplemented. **The ramp is a third ladder axis**, and widening the `Serves` record is the check that a dither ramp cannot be indexed as a density ramp: one encodes a magnitude at a position, the other a threshold against a position-varying offset, and the type tells them apart because the eye does not (§4c).
- **I37** — **The glyph axis is three rungs and a half block is the top one, gated on three things rather than on the terminal alone.** Below `kitty`, a cell is spent on colour or on shape: `▀` carries **two pixels at full colour**, braille carries **eight dots at one bit**, and the ASCII ramp carries nine glyphs. The half block is taken when `unicode` is not `ascii`, `ambiguousWidth` is not `wide`, `colourDepth` is at least **8**, and the block has **no `overlay`** — otherwise the dither. **Each gate has its own reason and none is a proxy for another.** `▀` is `East_Asian_Width=Ambiguous`, measured by `cells()` at `narrow=1` and `wide=2`, so a `wide` terminal draws the picture at double the width `imageCells` measured — the third consumer of `art.ts`'s switch and the first where braille's non-ambiguity is why the hazard is new (C02 I9, A03 SS50). Below `colourDepth: 8` the rung's whole claim is unfunded, and at 8 both channels go through `nearestAnsi256` so the picture is the 24-bit one quantised rather than a second rendering. **The overlay gate is the structural one**: the dither puts the picture in the glyph and the field in the foreground, and a half block has spent both colour channels on the picture — so unlike 1-bit, where C10 I31 draws the picture plain because nothing is left, there is a rung that can still carry the field and the block takes it. **A sequence trace cannot reach that gate** — *has an overlay* and *is 24-bit* both hold at rest with no event between them — which is why the artefact drawn for it was a classification table (§4c, → C04 I73, C10 I31).
- **I38** — **A refusal to decode is drawn as the refusal, with the reason the decoder computed.** `decodePng` returns a `fault` for every rejection it makes — *not a PNG*, *interlaced PNG (Adam7)*, *bit depth 16*, *IDAT does not inflate* — and the block drew `alt` for all of them, so a reader was told the same nothing about a corrupt file and about a format this phase names as unbuilt. The **rasterising arms** draw a **`status` at `error`** carrying the fault, `alt` beneath it as the caption it always was, at the height the block committed and no more — **the arms, and not the block** (F413): the protocol arm needs the decoder only for `imageCells`'s aspect, and `decodePng` reads the IHDR before it refuses, so the extent survives what the rasteriser cannot. A picture the terminal can decode is drawn rather than described. `error` is the state and not `retrying`, because no attempt is coming: this is the widened gloss doing its work — *an operation failed and nothing more is coming* (§3a) — and the box the shell returns from twelve sites is the same box here. **The fault is not a verdict about the picture, only about this decoder**, and that is why it cannot gate the block: at the protocol arm the terminal decodes, the transmission is the bytes unchanged, and the identity is a hash of them. `Decoded`'s failure arm carries `size` so geometry and rasterising can want different things (→ C04 I73, C09 §8b G7).
- **I39** — **A GIF is an image with more than one frame; the frame is view state read below the protocol arm, and on kitty the terminal animates.** The six-byte signature chooses `decodeGif` beside `decodePng` behind one front door (`decodeImage`), every frame is composited onto the logical screen before anything above the codec sees it, and delays under 20 ms are shown at 100 (§4c). **`measure` never sees the frame** (I8, C04 I93): `height` is declared and every frame shares the screen, so a GIF measures as its first frame does at every width, and the rasterising arms draw `frames[ctx.frames[id] ?? 0]` while the protocol arm ignores the field. **The kitty ruling is the measured one**: retransmitting a frame per tick would cost 75 bytes an 8x8 and 29,662 bytes a 320x240 per tick — 297 KB/s at 10 fps — where the animation protocol (`a=T` for frame 0 as raw RGBA, `a=f` per later frame with its gap, one `a=a` to start the loop) uploads once — 116,509 bytes for four 320x240 frames — and costs nothing per tick, so on that arm the shell arms **no wake**; a terminal without the extension keeps frame 0, which is the alternative ruling drawn by accident rather than a failure. **The fixtures are real and compared to a second decoder**: written by `sharp`, decoded pixel for pixel against `sharp`'s composited pages, with each blob's bytes scanned for the feature its row claims (→ C04 I93, C22 I77, C09 §4c).
- **I40** — **A `rule`'s three tiers differ in one thing — the fill — and the row is exactly the width at every one of them.** The lead is two cells and the label's column is fixed, so the tiers differ where the eye already is; tier 3's fill is **drawn as spaces** rather than dropped, which keeps `meta` at the right edge and keeps `measure` a constant 1 (I1). **An empty label never takes the blank fill**: I21's unbroken line and tier 3's absent one meet in one cell, and a two-cell lead with nothing after it is not a rule — so the fill falls back to the tier's own weight there, heavy at 1 and light at 2 and 3. Every character is a pair the vocabulary already holds, resolved through `glyphs(ctx.capabilities)`, so nothing is authored in the renderer (→ C04 I94, A03 SS47).
- **I41** — **A rail is a glyph drawn on every row of its notice, and it is a property of the token rather than of the block.** `GLYPH_RAIL` sits beside `GLYPH_INDENT` for the same reason: the schema learns nothing, and `measure` still receives no capability. **The geometry cannot move**, because `prefixCells` already subtracts the gutter from every row's width to hang the indent — so a rail fills columns that were reserved and blank, and I1 holds by construction rather than by an argument about it. **The frame is the only instrument that separates a rail from a glyph**: both draw the same rows at the same width with the same reserved columns, and a quotation whose mark appears once and whose remaining rows sit under a blank passes every count. `continuation`'s indent one property along, found the same way (→ C04 I95, C04 I96).
- **I42** — **A kind may declare `width(block, w)`, the columns its content occupies at `w`, and one that does not fills.** The answer is in `[1, normaliseWidth(w)]` and pure in `(block, width)` as `measure` is (I2); the registry clamps a definition's answer into the range and reports the excursion. Absent is the second answer, not a missing one: a `rule`, a `progress`, a `plot`, an `image`, a `scroll` and a `mosaic` are their width, and the registry answers `normaliseWidth(w)` for them (§2c, → C04 I101).
- **I43** — **A block is the same height at its content width**: `measure(b, width(b, w)) === measure(b, w)` for every block and width. This is what lets a container render a child at `width(child, cell)` inside a cell measured at `cell` without the row moving, and every declaring kind keeps it by construction — a `notice` answers its longest wrapped row, so no row re-wraps (§2c).
- **I44** — **The kinds that answer are named, with the case in which each fills.** `notice`, `raw`, `pills`, `keyValue` (no bar), `code`, `table` (rows present, no action bar, no expanded row — its plan, flex columns included), `group` (a `row` whose shares are all `{cells}` sums them and the gutters; a `column` whose children are all `left` takes the widest), `panel` (its widest child plus the border, or its title or footer plus their furniture). A `keyValue` with a bar fills because the bar absorbs the residual; a weighted `row` and a `column` with an aligned child fill because their layout depends on the width — rendered at their own sum they would be a different layout (§2c). Every other kind declares no member. The list is the record a reader checks against the registry, and a kind added to one and not the other is the SP-class disagreement between spec and tree (§2c).
- **I45** — **No character in either glyph table or any spinner set is a base of an emoji variation sequence.** The set is derived from `emoji-variation-sequences.txt` with its Unicode version named, held in `text.ts` beside the Ambiguous and Wide tables, and consulted by a test-time refusal only — `cells()` never counts presentation, because terminals disagree about it and a width that guesses is worse than one that is wrong the same way everywhere. `⏺` U+23FA is in the set and `⬤` U+2B24 is not, which is the whole of F823 (§4).
- **I46** — **A `notice` carrying `step` measures one row and is fitted, not wrapped, and the run marked `elide` shortens first.** The fitter truncates the elide run from its end through `truncate` until the row fits, and only then the row; verb, duration and outcome are never shortened while any of the argument remains. A property of the token, as the indent and the rail are (I41), so the kind's wrap policy and `measure`'s signature are unchanged (§3, C04 I85).
- **I47** — **A `notice` whose glyph is in `GLYPH_ELEMENT` declares one block-level element whether or not it carries an `action`.** `activate` is the block's `action` when present and absent otherwise; `copy` is the text unless the consumer overrides it. `step` is the one member: a call's head is the line a reader acts on, and the gate that keeps a muted status line out of the focus ring is right for every other token (F831; → C26 §5).
- **I48** — **A member of the `Glyph` vocabulary measured Ambiguous resolves to its ASCII half at `ambiguousWidth: "wide"`, so I5 holds under both conventions.** `glyphFor` takes both fields; `glyphCells` still needs no capability because the two renderings of a slot are one cell at either arm. Ten members moved on the day the tier landed and seven Neutral ones did not (F825, §4).
- **I49** — **The separator between a head's fields is `GlyphSet.separator`, `·` at unicode and `-` at ASCII, one cell at both arms, and no composer joins fields with a literal.** The residue row's comma and the status box's parentheses are the two earlier answers to the same question; this is the third and it is a slot because the head is the one place a reader sees it twice per line (F828).

## 8. Commitments

1. C09 owns the registry; C04 owns the schema and the measurement contract (I13).
2. Fourteen kinds ship here; `table` and `plot` register from C11 and C12 through the public mechanism (I13).
3. `measure` and `render` are written and tested as a pair, per kind (I1).
4. Wrapping versus truncation is a per-kind decision, documented in §3, except `code`, where the producer chooses via `wrap`. `code` names `syntax` slots; every other kind names `tone` slots (I14).
5. Every capability substitution is 1:1 by cell count (I5).
6. `cells()` is grapheme-aware and shared; no kind measures width for itself (I6).
7. Truncation is grapheme-aware, never leaves a half-drawn glyph, and takes the end it removes from as a parameter (I9).
8. Renderers receive capabilities and theme through context and read no environment (I3).
9. An unregistered kind degrades to `raw`; a throwing renderer is contained to its block (I10, I11).
10. The registry seals at composition end (I12).
11. Adding a kind whose measurer needs capabilities is a design decision, not an implementation detail (I2).
12. Renderers emit SGR through `terminal/escapes.ts`, switching on the depth tag; no renderer sets an Ink colour prop. This is the first runtime L1 → L0-terminal edge, and it is required rather than tolerated (I15).
13. Ink paints pre-broken lines. Its layout width must agree with `cells()`, and the agreement is asserted (T2.16), never assumed (I16).
14. No renderer emits a colour. Every style comes from `resolve` against a declared palette slot, so degradation, theme switching and the 1-bit collapse happen in one place instead of once per kind (I4). Enforced by SS17 and, for the Ink-prop route, SS37.
15. **Control characters are stripped from every text field before measurement and render** (I18). This is the only thing standing between a far side's output and the frame: a tool that emits an escape sequence cannot clear the screen, move the cursor, or query the terminal and have the reply arrive as typed input. It belongs in the summary because a reader deciding whether to trust the framework with untrusted output will not find it by reading fifteen invariants.
16. **Wrapping substitutes a cluster it cannot place rather than dropping it** (I19). It dropped, and both halves called the same function, so `measure` and `render` agreed and nothing failed — a frame arithmetically consistent and describing content it did not hold. The reach is a fact about child count rather than terminal width (§5).
17. **A line that already carries SGR is measured, fitted and windowed here, not by its caller** (I20, §5a). `displayCells` and `fitStyled` exist because `cells()` counts an escape as printable text; `sliceCells` exists because the frame cannot draw a layer over a painted row without taking a cell window out of one, and a `slice` by code unit cuts inside an escape and bleeds colour down every row below. Three answers to "how wide is this line" is I1's divergence in the one place that moves the whole frame.
18. **A `rule` with no label draws an unbroken line** (I21). The spaces around the label exist to set it apart from the fill, and with no label they are a gap in a boundary — found by reading a frame, which is the only instrument that reaches it: the block is present, the row is exactly the width, and every existing assertion holds.
19. **The framework substitutes its own marks, not only its blocks'** (I22). §4's rule is about who knows the capability, and it was written about what a block carries; six framework-authored characters reached the frame unresolved while four sites next to them did it correctly. Three of the six bypassed a function that already held their ASCII form, so half of what read as a missing mechanism was a mechanism not called (F55, F122).
20. **A grammar registers at any time and the transcript reflows for nobody** (I23). The promise was in §4a from the beginning and the constructor took a fixed pair; the memo is why exposing registration alone would not have made it true (F93).
21. **A shipped grammar's classes are mapped or the gap has a reason** (I24). Two of sixteen were measured as shipping nothing, and the change axis is refused a slot on C04's ruling rather than on this file's judgement.
22. A kind that divides declares `window`; a window is a valid block of the same kind plus a residual offset, and never a list of rows (I25, C25 I18).
23. The window's height property carries the offset and is checked generically, so an application's own arm is held to it (I26).
24. A kind that does not divide omits the member rather than branching, which is how `plot` stays atomic permanently (I27, C12 I1).
25. **A progress bar clamps its fill and never its number**, so an overshoot is visible rather than reported as completion (I28, §4).
26. **A containment restores the contract it broke** (I11). The error path is bound by the number `measure` has already committed, because a per-block boundary that changes the block's height turns a contained renderer into a frame describing a document nobody holds — which is the failure I1 is the most load-bearing invariant against. It shipped as one row against a measured twenty, and the test that covered it asserted the shifted position as the expectation (F223).
27. **A containment reports what it swallowed** (I29). Both catches that shipped reported nothing, and the test row covering one of them had said `logged` from the beginning — so the boundary hid the bugs it exists to survive, and a suite could go green with a caught throw in it (F223).
28. **The two element answers are one answer** (I30). Ownership is read from what resolution returned rather than from whether the member is declared, so a throwing `elements` costs its own block and never its children — 0 against a control's 4 (F224).
29. **A degradation ladder is owed on every axis the figure varies along, not on the one it was drawn against** (I31, §3a). The `status` box was specified with a height ladder and no width ladder, and the missing one is the axis that wraps: ` ERROR ` is 7 cells, a rule needs 9, and a `row` group hands out `floor((w − gaps) / n)`. Both ladders are rulings taken before the code, and the second exists because a classification table was run beside the height trace rather than instead of it.
30. **A kind that composes one state out of another animates unconditionally** (I32). `retrying` is `error` plus a line, so any rule that excludes `error` needs an exception the moment the composition is drawn — and the still frame it was meant to buy is already free, because identical bytes write no diff.
31. **A floor set above the registry is honoured on both sides of the pair, by the registry** (I33), and the field it honours is C04's (→ C04 I67). One number reaches `measure` and the element's padding through one line each, so a floored block cannot measure one height and draw another — which is the failure I1 exists for, arriving through the mechanism added to serve it.
32. **A contained failure asks for the height its message needs and marks what it cannot show** (I34). Height fits the content and width never does — the region owns the width, so a block that grew into it would be I1's over-draw in the other axis. The request is capped at four message lines, measured rather than chosen, and the cap is what bounds the divergence a bounded container already has (→ C04 I49, FINDINGS F238 · F239).
33. **A mosaic's cell bounds its child with two properties rather than one, and the frame is what says so** (I35). `flexShrink: 0` before `overflow: "hidden"`, because a squashed child never overflows and draws its own middle; the container clips the width separately, because I1 is rows only. `measure` equals the rendered count through an over-tall child and a throwing one, so C25 I1 holds here where §3c's trace leaves it knowingly false (→ C04 I71, FINDINGS F244).
34. **An image degrades to an ordered dither before it degrades to nothing, and both refusals are stated with reasons that survive checking** (I36). The dither is the first arm because most terminals are not kitty; iTerm2 is refused for per-cell addressability rather than for a participation it actually has; and the dither ramp is a third ladder axis so the type refuses what the eye would accept (→ C04 I73, FINDINGS F248).

35. **The glyph axis is a ladder of three and its top rung is gated on the block as well as the terminal** (I37). A half block spends a cell on two full colours where braille spends it on eight dots, so a photograph arrives as a photograph and a diagram is better served one rung down — and the ladder takes the richest rung the terminal honours rather than asking the content. `▀` is ambiguous-width where braille is not, which is why the hazard is new at exactly this rung; and a block carrying an `overlay` skips it, because both colour channels are already the picture (→ C02 I9, C10 I31, A03 SS50).
36. **An image that cannot be decoded says which refusal it is** (I38). The decoder computes a reason for every rejection and the block discarded all of them, so *a corrupt file* and *a format phase 1 does not read* arrived as the same `alt`. It draws the `status` box the rest of the framework draws, at `error`, with `alt` kept beneath as the caption — and the fault is scoped to **this** decoder, not to the picture (→ C04 I73, C09 §8b G7).

37. **A kind whose layout is derived from its rows pins that layout into its window, and a kind whose parse is pins the whole text and a range** (I25a). `patch` pins `numberWidth`, `keyValue` pins `keyWidth`, and both are one sentence: a window says what its *parent* measured rather than deriving it from the slice, or every row shifts sideways as the reader scrolls. `code` cannot pin a parse — `tokenise` reads every character before the slice, so a *sliced* text is a different parse and lines inside a block comment render as live code, invisible to I26 because `measure` never tokenises — so its window keeps `text` whole and pins `lineRange` instead, and the parse is the whole block's by construction (→ C25 I21a, C12 I1, C04 I82, C14 §4a, FINDINGS F426).
38. **The window's residual is a pair, and `window` is handed `measureChild`** (I26, I26a). Slack falls at both ends: `skipRows` is leading only, and `table` is the first kind whose last unit can hang past `to`. The consumer has been dropping trailing rows on every frame — `session.ts` writes `rows.slice(0, ve.takeRows)` — so `dropRows` states an operation the seam already depended on, rather than granting a new one; and the identity keeps its equality, because relaxing it to `≥` would pass every wrong answer inside the bounds (→ FINDINGS F428).
39. **A kind pins a *presence* as readily as a width, and `table` pins two things and re-sorts nothing** (C11 I18, I19, I20). The action bar exists or does not, so a window moves it in **both** directions; the display order is not idempotent under slicing, because `kindOf` reads the values present and a slice can re-classify its own column. Neither field is a producer's, on `numberWidth`'s argument (→ C11 §5a, C25 I21a, FINDINGS F429).
40. **A span's offsets meet the wrap, the cut and the cluster through the functions that already own them, and each gains one property rather than a sibling** (I1, I9, I19). Rows carry a source `start` and `wrapCells` projects them; a boundary inside a cluster snaps outward at both ends and the width does not move; runs coalesce by style reference so an unspanned row's bytes are unchanged; and `truncateParts` measures its marker as `truncate` does, which closed a one-cell overshoot at `ambiguousWidth: "wide"` (§5, → C04 §3am, C04 I84, C04 I86, C10 I33).
41. **An animated image is the image block with a frame index from the context, and the kitty arm hands the terminal every frame once** (I39). The signature chooses the decoder, the frames are composited in the codec, `measure` never sees the frame, and the wake is the orbit's — a still arms nothing. The protocol ruling was taken on measured bytes rather than on the roadmap's estimate, and its degradation on a terminal without the animation extension is the ruling it replaced (→ C04 I93, C22 I77).
42. **A rule's tiers move one thing and the empty label is the cell where two rules meet** (I40, I21). The fill carries the level and nothing else does, so `measure` is untouched and the label stays where a reader is already looking; tier 3 draws its fill as spaces rather than shortening the row, and an empty label takes the weight back because a lead with nothing after it is not a rule (→ C04 I94).
43. **A gutter that repeats is a property of the mark, and the frame is what said so** (I41). `GLYPH_RAIL` beside `GLYPH_INDENT`: the columns are already reserved on every row for the hanging indent, so a rail costs no geometry and the block schema learns nothing — and a mark drawn once with its remaining rows blank agrees with every count there is (→ C04 I95).
41. **A run's tone and value reach colour through the resolvers that already own them, and the one span member that is geometry is carried by the wrapper as one property** (I1, I9, → C04 I89, C04 I90, C10 I31, C10 I33). A tone replaces the block's style through the memoised `tone()` call the block made; a value paints a background through `continuousColour` and says nothing below 8-bit; `wrapCellsParts` takes atoms and `notice` measures and renders through one `noticeRows`; a focused table row drops span tones as it drops cell tones; markdown's inline code is the `identifier` tone (§5).
42. **A block can say how wide its content is, and the seam is optional the way `window` is** (I42). The registry answers for the kinds that do not, so no consumer branches on the member's presence.
43. **A block is the same height at its content width** (I43). The property is asserted over the catalogue's corpus rather than argued per kind, because a kind that re-wraps at its own reported width would pass every per-kind sentence.
44. **The answering kinds are a list in the spec and a set in the registry, and the test compares them** (I44). Stated with the case in which each fills, so a reader can tell a deliberate absence from a forgotten member.
45. **The head mark is `⬤` U+2B24 with `*` beneath it, and the check that would have refused `⏺` exists and is derived from the Unicode data** (I45). A width measured before the row was written could not reach a presentation defect, so the instrument that can is a table with a version and not a list from memory (F823, F824).
46. **A call's head is one committed row and the argument gives way first** (I46). Fitted by token rather than by kind, so `notice` stays prose everywhere else and `measure` learns nothing.
47. **A call's head is an element, by token** (I47). `GLYPH_ELEMENT` beside `GLYPH_INDENT` and `GLYPH_RAIL` — the third property of a mark that changes what a notice does without the schema learning it (F831).
48. **The `Glyph` vocabulary carries a width tier and I5 is asserted at both conventions** (I48). Ten of seventeen members were two cells at `wide` against a one-cell ASCII half with T2.5b green, because the row ran at one arm (F825).
49. **A head's separator is a slot** (I49). The composer takes capabilities and joins with `glyphs(caps).separator`; the literal `·` it carried was non-ASCII at the ASCII arm and two cells at `wide` (F828).

---

## 8b. The glyph axis — a classification table, and why it is not a trace

**Every gate on this ladder holds at rest.** *The block has an overlay*, *the terminal declares
`wide`*, *the depth is 4* — none of them is reached by anything happening, so a sequence trace has
no row for any of them however long it runs and would have agreed with the code on every sequence
in it. The artefact is a **classification table**, and it is indexed by the cells where **two**
rules could both claim the answer (CLAUDE.md, *rule interactions come in two kinds*).

| # | the two rules that meet | must draw | the answer a reader would give, and why it is wrong |
|---|---|---|---|
| G1 | protocol arm × `ambiguousWidth: "wide"` | **protocol** | *gate the ladder on `wide`* demotes a terminal that draws real pixels. **Resolved by measurement**: the placeholder is a plane-16 private-use code point carrying combining diacritics, and `cells()` measures it **1 at both conventions** — the gate has no subject on this rung |
| G2 | protocol arm × `overlay` | **protocol**, the field composited into the pixels before transmission | already ruled (C04 §3h.2); recorded here so the row is not re-opened |
| G3 | **placement refused** × half block eligible | **half block** | *fall back to the dither* — which is what the code did, and it is **two rungs** rather than one. A kitty terminal is non-`ascii` and at least 8-bit **by construction**, so the refusal path lands on the rung the terminal least needs. FINDINGS **F409** |
| G4 | `unicode: "ascii"` × `colourDepth: 24` | **ASCII ramp** | *colour outbids the alphabet*. It does not: `▀` is not ASCII, so the unicode gate is a question of what can be **drawn** and depth is a question of what can be **spent** |
| G5 | `overlay` × 24-bit, narrow, full unicode | **braille** | *the richest rung the terminal honours* — the terminal honours it and the **block** cannot use it, because both colour channels are already the picture and the field has nowhere to go |
| G6 | `overlay` × `unicode: "ascii"` | **ASCII ramp**, field in the foreground | unchanged, and it is the row that shows G5 is about channels rather than about rungs: a ramp glyph has a free foreground exactly as braille does |
| G7 | **bytes do not decode** × protocol arm | **the picture** — the terminal decodes, and the fault gates only the arms that rasterise | *the fault box, everywhere*, which is what F410 shipped and it was half right. The reason must reach a reader, and the block is the wrong place to gate: **measured, the protocol arm needs the decoder for exactly one thing** and the refusal does not take it away. FINDINGS **F413** |
| G8 | `ambiguousWidth: "wide"` × 24-bit, no overlay | **braille** | nothing better is available, and the loss is worth naming: colour is present and unusable, which is the only rung where the terminal has more than the ladder can take |
| G9 | a **1-pixel-tall** image × half block eligible | **half block**, both halves resolving to row 0 **by the arithmetic** | *index `y*2+1`*, off the end of the image — and that is a **point-sampling** implementation's hazard, which this is not. The ruling first said *clamped to the last row* and credited a guard: measured over 1.24 billion coordinates, **not one of `sampleRgb`'s four clamps ever binds**, because the coordinates are fractions of the image's own extent. Right about the cell, wrong about the mechanism — FINDINGS **F412** |
| G10 | **protocol arm** × an image with more than one frame | **every frame uploaded once**, the terminal loops, **no wake** | *transmit the current frame each tick at the stable id* — the design the roadmap priced, and the figures refuse it: 29,662 bytes a tick for a 320x240 where the animation protocol is 116,509 once. And *frame 0 only* is what the chosen design already degrades to on a terminal without `a=f`, so it is not a second option but the first one's failure mode (I39) |
| G11 | **placement refused** (G3) × an animated image at `kitty` | **half block, frame 0, still** | *the half block animates it* — it cannot, because the wake is not armed on the protocol arm and the store never advances; the rung is reached only past `MAX_PLACEHOLDER_SPAN`, so the picture is 298+ cells wide and the loss is a still where a still was already the honest answer. Recorded rather than repaired: arming the wake on the refusal path would mean the block telling the shell which arm it took, and no seam carries that |
| G12 | **bytes do not decode** (G7) × a GIF at the protocol arm | **nothing drawn**, the fault box on every rasterising arm | *fall through to the bytes as for a PNG* — which is what the code does and is honest about: `f=100` with GIF data is a placement the terminal cannot decode, exactly as a corrupt PNG is, and the G7 argument (the terminal's decoder reads what ours refuses) has no GIF instance because the terminal reads no GIF at all. §4c's loud failure, and the same one the PNG path already has |

### G7's other half — measurable after all, and the answer moves the refusal

**Our decoder refuses interlaced and 16-bit PNGs by name** — *phase 1 reads progressive only*,
*phase 1 reads 8-bit only* — and those refusals are about **our** decoder. At the protocol arm the
picture is decoded by the **terminal**. So the question is not *can kitty read this*; it is
**what does the protocol arm need the decoder for**, and that is answerable here.

**Three pixel reads exist in the tree, and only one is on the protocol path.**

| site | what it reads | what it needs |
|---|---|---|
| `imageCells` | `pixelsOf` | `px.width / px.height` — the **aspect**, and nothing else |
| `image.ts` `render` | `pixelsOf` | real RGBA, to rasterise a glyph per cell |
| `transmitImage` | `decodePng` | real RGBA, **and only for a composited overlay** |

**The identity needs nothing.** `imageKey` is the byte digest, `imageId` hashes that string, and
`payload` is the bytes unchanged — so a transmission is expressible for a picture we cannot read.

**And the aspect survives every refusal, by the decoder's own order.** `decodePng` reads the IHDR
in its chunk walk and refuses *after*: interlace and depth are checked with `w` and `h` already in
hand. The only failures that take the extent are *not a PNG* and *no IHDR chunk* — which are
failures to find a picture at all, not failures to rasterise one.

**So the refusal belongs on the arms that rasterise, not on the block.** A 16-bit or interlaced
PNG places and draws at `kitty`, and refuses — with its reason, in the `status` box — at the half
block and the dither, which genuinely cannot read it. `Decoded`'s failure arm carries `size` so
the geometry has what it needs without the pixels it does not.

**The composited overlay is the one genuine pixel need on the path, and it already degrades
correctly**: `transmitImage` falls through to the plain bytes, keeping the picture and losing the
field, with its reason written where it happens. That is unchanged.

**What is left for a terminal is a conformance question rather than an architecture one**:
whether a given terminal's decoder does read Adam7 and 16-bit. If one does not, the failure is a
placement addressing an image that failed to load — *nothing drawn*, §4c's loud one — and the
remedy would be a capability, not a re-gate on our own decoder's opinion.

**Measured in Ghostty 1.3.1 on 2026-08-31: it reads both.** A 16-bit PNG and an Adam7 PNG both
answer `OK` to a real transmission, so the two files this repository refuses by name draw on a
terminal that decodes them — which is the whole of what moving the refusal off the block buys.

**And the reading is only evidence because a control failed.** A probe that answers `OK` to
everything measures nothing: `palette.png` with 64 bytes of its IDAT inverted — *IDAT does not
inflate*, by our own decoder — came back `EINVAL: invalid data`. The path reports failure when
there is one.

**One thing the measurement needed that the framework does not do**, and it is F414: the shipped
transmission sets `q=2`, which suppresses **every** reply including errors. That is right today,
because `decode.ts` has no APC arm and a reply would arrive in the editor as a lone `ESC` and
literal text — but it means a failed transmission is silent at the protocol level as well as on
screen, and the terminal *will* say what went wrong if asked.

## 8a. The fitted height — a table and a trace

**A classification table is primary.** Message length against width against rung is structure at
rest: no event separates *this message is four lines* from *this width cannot hold the tag*. The
trace is short and covers the one thing that is event-mediated, which is that the request lands a
frame later than the fault.

### The table

| # | cell | two rules meeting | ruling |
|---|---|---|---|
| D1 | a message needing more lines than the cap | `rowsFor` caps × the render slices | the box is `cap + 3`, and **the render marks the cut** — the cap is a silent truncation until it does |
| D2 | a message of **exactly** the cap | the cap × the mark | **no mark.** An off-by-one draws `…` on a complete message, which claims a truncation that did not happen and sends the reader to the sink for text already on screen — worse than a silent cut |
| D3 | a width too narrow for the tag | `widthRung` drops it × the request sums it | `tagRows` comes **from `widthRung`**, so the sum follows the ladder rather than assuming a tag |
| D4 | a width too narrow for a border | `heightRung` × `widthRung`'s affordability arm | no border, no tag, `rows = n` — and the wrap width is `width`, not `width − 4`, which the top-rung rule over-estimates safely |
| D5 | `width − 4 ≤ 0` | the top-rung width × `wrapCells`' own floor | `wrapCells` clamps to 1, so a one-cell column wraps to one character per line — the cap is what stops that being a hundred rows |
| D6 | a granted height larger than the viewport | the floor × `windowSequence` | **the transcript keeps a floored block whole and pays from `skipRows`** (I33). It is the *viewport's* rule and D7 is a different mechanism |
| D7 | a floored block inside a **bounded container** | the floor × `scroll`'s declared height | **Neither clipped nor kept whole: over-drawn**, measured at `measure=4, rendered=8`. C04 §3c trace 1 already rules it — *taking a child's top `n` rows needs a windowing seam `RenderContext` does not have* — with C25 I1 knowingly false there and T2.28b holding it open. **The first draft of this row cited I33 and was wrong**: a real invariant, governing a real mechanism, and not the one in the cell (F239) |
| D8 | the `measure`-fault path | `#measured`'s text × `rowsFor` | its message is `${kind} failed to measure` with no detail, so `n` is 1 and the box is 4. The fitting applies to both halves and is only *interesting* for `render` |
| D9 | a floor already held from an earlier frame | the new number × `reserveNeeded` | `(block.minHeight ?? 0) < req.rows` still refuses, so a re-fit at the same width is a no-op and termination is unchanged |
| D10 | a `loading` or `retrying` box | the activity line × the sum | `lineRows` is the same emptiness test the render uses, so there is no second rule — but **nothing constructs one through this path today**, and that is stated rather than left to look like coverage |

### The trace

| # | sequence | rules meeting | outcome |
|---|---|---|---|
| E1 | throw → request → patch → `rev` → frame 2 | the fit at frame 1's width × the floor applied at frame 2's | **the ruling already taken** (F230): frame 1 is the committed height, frame 2 the fitted one |
| E2 | a **width change** between the two frames | the fitted number × the new width | the floor is a row count and rows do not rescale. A narrower frame 2 wraps to more lines than the floor allows and cuts — **with a mark**, which is why D1 is not optional. A re-fit at the new width is a second request, and `reserveNeeded` allows it because the number grew |
| E3 | the far side replaces the block between the frames | the request's `rev` × the new document | dropped, unchanged (C22 I69) |
| E4 | two blocks in one entry throw with **different** fitted heights | one patch per block × `rev` per patch | two requests, two frames, converging — measured for the constant case (T4.56) and the number does not change the shape |

## 9. Tests

Six tiers. Every cell of the §6 transition table is covered.

### Tier 1 — unit

- **IF8** (C22 I77): `Frames.advance` is a function of elapsed time — four wakes of 25 ms and one of 100 leave the index, the remainder and `due` where one wake of 200 does; a full loop is frame 0 and keys as untouched; a minute idle lands where the clock says; a still and a zero advance are no-ops. In `test/edge/image-frames.test.ts` beside the rows that consume it.
- **IF9** (I39): `transmitAnimation` is one `a=T` as raw RGBA, one `a=f` per later frame carrying its delay in `z`, an `a=a` for the root frame's gap and an `a=a,s=3` to run — every escape under 4096 bytes — and on the 8x8 fixture the whole upload is under ten ticks of retransmission.
- **T1.1**: `register` in open state → `get` returns it, `kinds` includes it.
- **T1.2**: `seal` → `sealed` true, existing kinds still resolve.
- **T1.3**: `measure`/`render` after seal → work normally.
- **T1.4**: each of the sixteen kinds measures its documented height on a canonical fixture — **one case per registered kind, and the set is compared to `DEFAULT_DEFINITIONS` by equality**. A hand-written list is what this row was, and it drifted: `scroll` shipped as a default and was in neither the table above nor this row's fourteen cases, so the kind with no documented height also had no case asserting one (F228). The row already guarded the other direction — every listed kind must have a fixture, added after a rename made seven entries pass against `undefined` — and a guard in one direction is what let the other drift.
- **T1.5**: `keyValue` key column caps at 20 cells; longer keys truncate, values still align.
- **T1.6**: `logs` line longer than `w` → one row, ending in the truncation marker.
- **T1.6b**: a `code` block with `wrap: false` truncates; the same content with `wrap: true` wraps, and both measure to their rendered height.
- **T1.7**: `notice` text longer than `w` → wraps, and measurement matches the wrap count.
- **T1.8**: `panel` measures children at `w - 2`, not `w`.
- **T1.8b** (C04): a `panel` with a `footer` measures identically to one without, and renders its text in the bottom border with the border closing at the same width. Both halves, because a footer that changed the height would be a new row rather than a use of the existing one — and a height change is the failure `panel` reports as a border that does not close.
- **T1.9**: `group` in `column` sums children; in `row` takes the max.
- **T1.10** (I10): a block of unknown kind → renders via `raw`, no throw.
- **T1.11** (I18): text containing `\x1b[31m` → stripped; the frame carries no injected styling.
- **T1.12**: `steps` renders a spinner frame while active and a settled glyph after.
- **T1.13** (§5): the five ways naïve length is wrong — CJK, fullwidth, combining marks, ZWJ clusters, variation selectors — each a different wrong answer from `.length`.
- **T1.14** (I18): control characters are stripped before measuring, so a measured row and a rendered row cannot disagree.
- **T1.27** (I6, C02 I9, §5): the Ambiguous set against its source. Every one of the 44 Latin-1 characters the property calls Ambiguous is **two cells at `wide` and one at `narrow`** — the fabricated violation is any table whose lowest range starts at U+2010, which reports 1 for all 44. **T1.27b is its control**: the other 52 Latin-1 characters are Neutral and one cell under both conventions, so a repair that admits the *block* rather than the *property* satisfies T1.27 and fails here. **T1.27c** accounts SS47's `PROSE_MARKS` one mark at a time rather than by a total — the finding said four of eight and the correction said five of ten, and the property says seven of ten are Ambiguous with three of them (`§` `·` `×`) in the gap, `«` `»` Neutral and right, and `⚠` Neutral and over-counted by the geometry deviation. **T1.27d** asserts that deviation where it is claimed, so a generated table dropped in without it fails here rather than in fifteen golden frames; **T1.27e** pins U+E0100..U+E01EF at zero, the over-count the derivation itself created before `isZeroWidth` grew the range (F665).
- **T1.15**: an empty string is zero cells. The floor at 1 is a rule over the block table (§3), not a property of the width function.
- **T3.20** (I21): a `rule` with an empty label renders as an unbroken line at its full width, with a labelled rule beside it as the control. Reachable only by rendering: the block is present, `measure` says one row, and the row is exactly the width in both.
- **T1.16** (I20, §5a): `sliceCells` over a line carrying SGR — the window measures exactly `to − from` cells by `displayCells`, the escapes in the skipped prefix are re-emitted at its head, and a cut that lands mid-escape is impossible because the escape is copied whole. The failure is not a wrong width: it is `[38;5` reaching the terminal as text with the SGR never terminated, so the colour bleeds down every row below.
- **T1.16b** (I20): a double-width cluster straddling either boundary is dropped and its cell blanked, in both directions — the window is still exactly `to − from` cells and never `to − from ± 1`. Asserted at the left edge as well as the right, because the two are different code paths and only the right one resembles `truncate`.
- **T1.16c** (I20): the composition law over a styled line, for every split point — `sliceCells(t, 0, a)` and `sliceCells(t, a, b)` measure `b` together. A property over the splits rather than three chosen ones, because the case that breaks it is whichever `a` lands inside a cluster and no chosen `a` is that one by construction.
- **T1.17** (I9, I19, C04 I84, C04 I86): the four mechanisms of §5's *Runs* — `wrapCellsParts`'s rows are exact source slices from `start` with the break space in no row, and equal `wrapCells`'s; `runsOf` concatenates to `stripControl(text)` with a control character inside a span; a boundary inside a ZWJ family snaps outward and a span that collapses onto one boundary is dropped; `truncateParts` reports `start` from either end and, at `ambiguousWidth: "wide"`, `kept` plus a two-cell marker fits the limit. **Covered today by `test/unit/spans.test.ts` §*C09 — runs*, whose rows cite C04 I84 and C04 I86 and carry no C09 number** — the number is owed to those rows, not to a second file.

- **T1.19** (I9, C04 I89, C04 I90): the tone-and-value half of §5's *Runs* — `runsOf` copies `tone` and `value` onto the run and `sliceRuns`, `runLines` and `wrapRuns` carry them; `wrapCellsParts` with an atom never breaks strictly inside it — a space inside the atom is skipped, a full row with no outside break point breaks at the atom's start when something precedes it, and an atom wider than the row is broken as text **and drops nothing**, since a cluster-boundary cut is not a break space (`"aaa bbb ccc"` at 7 valued whole is `aaa bbb` / `" ccc"`, F593); a row that fills exactly and is followed by a space breaks **at that space** whether or not it has an earlier break point (F590, F591), and the plain answer for `"aa bb cc dd"` at 5 is two rows where the valued one is three; `wrapRuns` derives the atoms from `value` alone, so a bold run is not one. Asserted on the row texts and starts, beside the plain wrapper's answer for the same string.

### Tier 2 — contract / interface

**The generic suite. Runs over every registered kind, including app-registered ones**, so a consumer's custom block is held to the same contract as the defaults.

- **T2.1** (I1, the headline): for every kind × the fixture corpus × widths {40, 60, 80, 100, 120, 160, 200}, `measure` equals the rendered row count. The most valuable test in the system.
- **T2.2** (I1): the same, under `unicode: "ascii"`.
- **T2.3** (I2): `measure` called a hundred times returns the same value and performs no I/O.
- **T2.4** (I2): the malformed corpus from C04 T2.3 — empty, null-ish, 10,000-character, adversarial — measures without throwing, for every kind.
- **T2.5** (I5): for every substitution in §4, `cells(unicode) === cells(ascii)`.
- **T2.6** (I13): every member of C04's `Block` union has a registered definition. **This is a composition-level test** — it runs after C11, C12 and C25 have registered, since C09 alone supplies fourteen of the seventeen.
- **T2.13** (§4a): `measure` performs no tokenisation — a spy on the tokeniser records zero calls across the fixture corpus, and a `code` block measures identically with its language registered and unregistered.
- **T2.14** (§4a): a YAML fixture produces the documented slots; every `hljs` class in the table maps to its slot, and an unmapped class renders in the default tone rather than being dropped.
- **T2.15** (§4a): a block whose `language` is unregistered renders as plain text with no error raised.
- **T2.12** (I8): for every kind, `measure` returns the same value across a hundred `tick` values.
- **T2.7** (I3): a source scan finds no `process.env` read in `blocks/`.
- **T2.8** (I4): a source scan finds no hex, ANSI or named colour in `blocks/`; `syntax` slots appear only in the `code` renderer.
- **T2.9** (I6): a source scan finds no width computation outside `cells()` — no `.length` on a display string.
- **T2.11** (I7): the module graph shows no kind importing the registry; container kinds resolve children solely through `measureChild`.
- **T2.16** (§3): over the adversarial corpus — CJK, ZWJ sequences, variation selectors, combining marks — `cells(s)` equals the width Ink lays `s` out at. The one number two implementations compute, held to agreement rather than assumed into it.
- **T2.17** (I4, §3): a source scan finds no `color=` or `backgroundColor=` prop in `src/presentation/` (A03 SS37), and no import from `src/terminal/` beyond `escapes.js` and type-only capability imports.
- **T2.20** (I26): the row property has a subject — a window of the **right size and the wrong rows**. T2.15 shortens a window and `window-height` fires; this reverses the content and keeps the count, and `window-rows` fires while `window-height` does not. That is the shape of every real failure at this seam: a different parse (F426), a slice in declaration order, a comparator re-derived from the slice (F429).
- **T2.22** (I25, I26, C14 I23): `code` and `raw` declare `window`, and the I26 identity and the row-for-row comparison hold over both at every offset — a `code` block with a block comment spanning lines, a wrapped one whose every line is three rows, a `raw` block with a trailing newline and blank lines. The row that pinned *code and raw do not window* is rewritten as this one on the day it expired (C14 §4a).
- **T2.21** (I26a): `tableDefinition.window` handed the registry's measurer and handed a stub returning 1 cuts in different places — `dropRows` of 2 against 1 for the same range. Asserting the signature would pass against a window that accepted the parameter and ignored it, which is how `table` came to be unwindowable for want of one (F428).
- **T2.18** (I17, C04 I25): a sequence measures `Σ` its blocks plus one row per `gapBefore`, and renders exactly that many; a `row` group ignores the field.
- **T2.109** (I40, I41, I1): the headline row at the two new members — a `rule` at each of the three tiers measures 1 and renders exactly 1 row of exactly the width at every width of the sweep and in both alphabets, `meta` landing at the right edge in all three; and a notice carrying a rail measures exactly what the same notice measures without it, at every width, while the rendered rows differ only in the reserved columns.
- **T2.110** (I42): the sealed registry answers `width(b, w) === normaliseWidth(w)` for a `rule`, a `progress`, a `plot`, an `image`, a `scroll` and a `mosaic` at 40 and at 7; and a definition returning `w + 5` is clamped to `w` with `onError` called once naming the kind.
- **T2.111** (I44): the set of default definitions declaring `width` equals `{notice, raw, pills, keyValue, code, table, group, panel}` — compared by equality, so a member added or dropped on either side fails the row.
- **T2.112** (I45): every character in `GLYPH_TABLE`'s unicode column, `UNICODE`'s slots and every spinner set's frames is absent from the derived emoji-variation set; the control asserts `⏺` U+23FA **is** in it, so an empty table cannot pass the row. T2.71 in `spinners.test.ts` runs over the same set in place of its hand list.
- **T2.113** (I46): a `step` notice whose text overflows the width measures 1 and renders 1 row at 80, 40 and 20 cells in both alphabets; with the argument span marked `elide`, the argument ends in the marker and the verb, duration and outcome are intact; without the span the row is cut from its end. The control is the same text under `info`, which wraps to two rows.
- **T2.114** (I47): `elementsIn` over a `step` notice with no `action` yields one element spanning the block with `copy` equal to the text and no `activate`; with an `action`, `activate` is that action; an `info` notice with no `action` yields none.
- **T2.115** (I48): T2.5b's assertion — `cells(unicode) === cells(ascii)` — over the whole vocabulary at **both** `ambiguousWidth` arms, through `glyphFor` at `WIDE_CAPS`; the ten Ambiguous members resolve to their ASCII half at wide and the seven Neutral ones do not, compared by equality against the two named sets so a member moving between them fails the row.
- **T2.116** (I49): `glyphs(caps).separator` is one cell at both arms and both alphabets; a source scan finds no `" · "` literal in `src/shell/`.
- **T2.10**: golden frames for every kind at four widths in both themes and both unicode modes.

### Tier 3 — edge cases

- **IF1** (C04 I93): a PNG, a two-frame GIF, a one-frame GIF and neither are four answers from `decodeImage` — a still has no `animation`, a GIF's `pixels` is its frame 0, and `decodePng`'s own refusal wording is untouched behind the front door (HB8 reads it).
- **IF2** (I39): every fixture decodes pixel for pixel to `sharp`'s composited pages, **eight frames compared and the count asserted**; each fixture's bytes are scanned for what its row claims — A's local table, B's sub-rectangles and transparent index, C's interlace bit, D's per-frame tables. Its control flips a byte of LZW data, which must change or refuse the frame.
- **IF3** (I39): B's bytes carry delays of 0, 1 and 5 hundredths and arrive as 100, 100 and 50 ms; clearing C's interlace bit permutes its rows, so the flag is read rather than assumed.
- **IF4** (I39): disposal 2, reached by patching B's control byte at an offset the scan finds, leaves frame 2's rectangle transparent under frame 3 where frame 3 does not paint; disposal 3 restores frame 1's dot. Its control is the unpatched bytes — disposal 1 — where the same cell is opaque.
- **IF5** (I39, I38): a header cut short refuses with no extent; a zero logical screen refuses; a forbidden LZW code size refuses **with the extent**, and the block draws that reason in the `status` box.
- **IF6** (C04 I93, I39): the half-block arm, read in colour — frame 0 is `38;2;255;0;0` and never green, frame 1 the reverse, no field is frame 0, index 2 of two wraps to 0.
- **IF7** (I39): the dither arm draws a different picture at frame 2 than at frame 0 with the same row count; the kitty arm's placeholders are identical at both; `framesOf` answers the delays for the GIF and `null` for a still.
- **IF10** (I39): `transmitImage` at `kitty` sends a GIF as `a=f` frames and never under `f=100`, a PNG beside it as its bytes, neither twice, nothing off the protocol arm, and an overlaid GIF composites into every frame.
- **C04 T2.39**'s GIF half (C04 I93): `measure` and `imageCells` of the GIF equal the PNG of its first frame at widths 1, 2, 3, 8, 40 and 120, and the rows drawn at frames 0, 1, 2 and 7 all equal `measure`. Landed here rather than in `owed-gate.test.ts` because before the decoder a GIF fell to `alt` and measured 1 where the PNG measured 3.
- **T3.1**: `measure` before `seal` → works.
- **T3.53** (I33, → C04 I67): `measure` returns `max(definition.measure(…), minHeight)`. A block already taller keeps its own number, which is the arm a floor-always-wins implementation passes the other rows with.
- **T3.54** (I33, I1): **the render pads and never bounds.** A one-row block with a floor of three draws three; a four-row block with a floor of three draws **four, first row included**. The second half is the row that matters — a fixed height drops an over-full box's *first* row, measured, and `overflowY: "hidden"` does not change it.
- **T3.60** (I34): the box grows to hold its message and the tag survives, at 40 and 80 columns — **and at 30, which is the width that discriminates.** A fitter wrapping at `width` rather than the top rung's `width − 4` is self-consistent almost everywhere: below six rows the rung has no gutter, so the two agree. It parts company only where the under-estimate still lands in the padded rung, and there the last line is cut while every count agrees.
- **T3.61** (I34, I1): `statusRowsFor` and `render` agree at the granted height, over five widths and three messages. **I1's pair asserted directly**, because the request is a promise about what `render` will draw and a disagreement floors a block to a height the box does not fill.
- **T3.62** (I34, I22): a cut carries `…` at unicode and `~` at `ascii`, and the ascii frame carries no codepoint — the mark is the framework's and is resolved, not written.
- **T3.63** (I34): a message of **exactly** the rows available carries no mark, with the row above it as the other side of the boundary. A mark claiming a truncation that did not happen sends the reader to the sink for text already on screen. **The fixture's lines nearly fill the row**, because with short ones the overflow joins into the last kept row and fits — nothing is lost and correctly nothing is marked, which is what the first fixture measured instead.
- **T3.64** (I34): the request follows the width ladder rather than assuming a tag — **asserted as a figure, after three properties failed to see it.** A row count cannot: the box takes the uncounted row as a blank and `measure` still agrees. Nor can the blank count: at eight columns the extra row turns the gutter on, narrowing the content and growing the wrap to eat it. Nor can a fit boundary: two rows below the granted height removes the *border*, which is furniture rather than slack.
- **T3.55** (I33, I2): no definition sees the floor. `scrollDefinition.measure` returns the same number for a block with a floor and one without, so §3c's purity argument is not reopened by a mechanism that never reaches it.
- **T3.2** (I12): `register` after `seal` → throws.
- **T3.3**: `seal` twice → no-op.
- **T3.4** (I5, the classic): a `logs` line truncated under ASCII → the marker is `~`, one cell, and the row count matches Unicode's. The `...` regression, tested directly.
- **T3.5** (I9): truncating inside a ZWJ emoji sequence → the whole cluster is dropped, never split.
- **T3.6** (I9): a double-width CJK glyph straddling the boundary → dropped, and the residual cell is blank rather than half-drawn.
- **T3.7**: a combining mark immediately after the truncation point → does not orphan onto the next base.
- **T3.8**: width 1 → every kind returns ≥1 and renders something.
- **T3.9**: width 0 → treated as 1; no division by zero, no infinite loop.
- **T3.10**: text exactly `w`, `w-1`, `w+1` cells → 1, 1, 2 rows for wrapped kinds.
- **T3.10b2** (C04 I86, §5): the sweep — over fourteen strings at every width from 1 to 40, **no row could have taken the first word of the next row**, counted only where the join is legitimate (the rows are separated by exactly one source space, the next opens on content rather than whitespace, and its first word is whole rather than the head of a cut token). This is the property F590 and F591 are each one instance of, and it is a sweep rather than two pinned strings because **a row that breaks early is invisible to T3.10b**: a short row fits. Measured before the arm: 161 violating joins over 102 of the 560 pairs; after, 0. The same sweep carries the two properties the arm must not move — **no row overflows** (T3.10b over 560 pairs rather than 4) and **every row is an exact slice from its `start`** (C04 I86, on the ASCII members, since a substituted cluster is deliberately not a slice).
- **T3.11**: `panel` at width 2 → children measured at 0, clamped to 1; no negative width reaches a child.
- **T3.12**: `group` nested five deep → correct total, no stack overflow.
- **T3.31** (I23): tokenise a `dockerfile` block before registering the grammar — one run, no slot — then register it and tokenise the same text again. The second call is highlighted. **The memo is the subject**: without the invalidation the second call returns the first's answer, and every assertion about `registerGrammar` existing still passes. The control is that `measure` returns the same row count across both, or the invariant's other half is untested.
- **T3.32** (I24): for every grammar in the default set, a sample tokenises to at least one slotted run — asserted over the set rather than per grammar, because the failure this catches is *a grammar added later whose classes nobody checked*. `markdown` is the row that fails today. The three deliberate omissions are named in a list the test reads, so an omission that starts being mapped is a stale entry rather than a silent pass.
- **T3.30** (I22): a session at `unicode: "ascii"` draws a frame with no character above U+007F — asserted over the whole frame rather than per site, because a per-site row is a restatement of the fix and the seventh site is what this must catch. The controls are the frame at `full` still carrying `❯`, and the two forms measuring the same number of cells.
- **T3.13** (I11): a renderer that throws → that block renders as an error block **of exactly `measure(b, w)` rows**, carrying the thrown message; sibling blocks render normally. **The sibling below it is `lines[3]` and not `lines[2]`, and the reason is the fixture rather than the code**: `broken("render")` measures 2, so the row below sits at 3 the moment the error block is the height it was measured at. The old expectation was the position the frame took *because* the error block was one row — a number that read as an assertion about containment and was an assertion about the defect (F223).
- **T3.14** (I11, I29): a *measurer* that throws → contained, block treated as height 1, **the block replaced by the error block at that height**, and the throw reported through `onError`. A throwing measurer must not break virtualisation. **The reporting clause had no mechanism until F223** — the row said `logged` and nothing logged — which is why it now names I29 rather than sitting as an adverb nothing can fail.
- **T3.15**: `pills` whose chips exceed `w` → wraps, and the wrap count is measured correctly.
- **T3.16**: `code` containing tabs → expanded to a fixed stop before measuring, so measure and render agree.
- **T3.17**: a `notice` of 10,000 characters at width 80 → 125 rows, measured and rendered.
- **T3.18**: an app registering a kind that shadows a default → rejected, not silently overriding.
- **T3.33** (I11): a definition measuring 1, 2, 5 and 20 with a throwing renderer → the error block is 1, 2, 5 and 20 rows. All four, because the defect answered 1 to all four and one height cannot tell a bound from a constant.
- **T3.34** (I11): `[raw, throws(20), raw]` → `measureSequence` and the rendered row count agree, and the trailing `raw` is read **from the frame** at the row the measurement put it. Measured before the fix at 22 against 3 (F223); the frame is the assertion because every count agreed the whole time.
- **T3.35** (I29): a registry built with a sink that throws → a caught render error fails the run. The control is a suite with no throw in it staying green, or the row asserts the harness rather than the boundary.
- **T3.36** (I30, C26 I12): a leaf whose `elements` throws contributes no element and its siblings keep theirs — two blocks of three answering, which is what the containment means here.
- **T3.37** (I30): a *container* whose `elements` throws keeps its children reachable, with the same container declaring no `elements` as the control. **The control is the row**: both arms must find the children, and the defect answered 0 against the control's 4.
- **T3.38** (I31): a `status` block measuring 1, 2, 3, 4, 5, 6 and 20 renders exactly that many rows, at each of the three states. **All seven, because the ladder has six rungs and one height cannot tell a bound from a constant** — the same argument T3.33 makes about the error path it replaces.
- **T3.39** (I31): the height ladder's six rungs draw what §3a says — border and blanks at 6, blanks gone at 5, tag gone at 3, border gone at 2, message alone at 1. **Read from the frame**, because every rung is arithmetically self-consistent and only the figure distinguishes them.
- **T3.40** (I31): the width ladder's five rungs at a fixed height — rule and tag at 13, bare tag at 11 and at 9, no tag row at 8, unbordered at 2. **The row count is identical across all five**, which is the half a width assertion does not reach on its own.
- **T3.41** (I31): where the width ladder drops the tag row, that row carries message text rather than being blank. Asserted on a message long enough to need it, so the row is not blank for a second reason.
- **T3.42** (I31): `retrying` at `H = 2` draws the message and the retry line; at `H = 1` the message alone. The dropped line is the assertion, not the kept one.
- **T3.42a** (I31, F235): `loading` at `H = 1` draws the **activity line** and no message, which is the other half of the same rung and the half that shipped wrong. Asserted on a message the row would show if it were kept, so the assertion is *this row is the spinner's* rather than *the box is one row* — and the row count is asserted beside it, because the defect it stands against had the right count and the wrong contents.
- **T3.43** (I32): the same block at ten successive `tick` values draws ten distinct spinner frames, in **all three states** — `error` included, which is what says the kind animates unconditionally rather than by state.
- **T3.44** (I32): the default set resolves to what `steps` resolves to, asserted against `spinnerFrames(caps)` rather than against a literal; a named set uses its own frames **and its own interval**; an unknown name is the default and never a throw.
- **T3.45** (I32): `FULL_CAPS` and `WIDE_CAPS` give the default the same frames, and a `narrowOnly` set gives its ASCII pair at `wide`. **Both routes to the ASCII pair, because a set can reach it by width or by `unicode: "ascii"`** and one assertion cannot tell which fired.
- **T3.46** (I31, §3a): the tag is the only painted run — **exactly one** background introducer in the whole frame at 24-, 8- and 4-bit — and the pair moves together at every rung, so a ground with no ink and an ink with no ground are both failures. At 1-bit neither arrives and the `▲` and the word are what carry it. **The depths are asserted apart and were not**: one arm covering 4 and 1 together stated a forced absence at a rung that has a ground (F240).
- **T3.47** (I31, §3a): the ASCII arm draws `+ - |` and `!`, and **no box-drawing codepoint appears in the frame** — asserted over the whole frame rather than over the corners, because a border is four glyphs and a mistake is usually one of them.
- **T2.10a** (I34, I11): **golden frames for the contained failure**, three messages × three widths × three variants, both frames of the two-frame path. **There were none**, through three commits about this path: nothing in `test/golden/` rendered a definition that throws, so golden passed each time on the absence of a subject rather than the absence of a change. Frame 1 is recorded too, because F230's ruling makes the short box a specified state rather than a transient.
- **T3.48** (I31): `status` declares no `window`, and `windowSequence` keeps it whole and pays for it out of `skipRows` — `plot`'s and `scroll`'s case, and the same assertion.

- **T3.65** (I19, C04 I86): the bytes rows for the same mechanisms — a span across a wrap, a span straddling a cut with the marker outside it in both directions, a boundary inside a cluster, a substituted cluster at width 1 — are C04 T3.62–T3.65 in `test/edge/spans.test.ts`, asserted on the painted row and never on a count, because every height assertion passes for a span sliced one unit early. C09's number is owed to them on T1.17's terms.

- **T3.66** (I1, C04 I89, C04 I90, C10 I31): **the frames** — `"The cat sat on the mat ."` with a value per token at width 12 and at 80 paints one `48;5` background per token at 8-bit and none between them, two rows at 12 and one at 80, and the same document at 4-bit is byte-identical to the unvalued one; `"x(abcde)yz"` at 6 is two rows plain and three valued, and the valued row is the whole token; a `tone: "identifier"` span on a table cell paints the identifier colour on an unfocused row and the accent colour, unbroken, on the focused one; `measure` equals the rendered row count in every case.
- **T3.67** (I43): over every block in the catalogue's corpus and widths 7…80, `measure(b, width(b, w)) === measure(b, w)` — the property, with the failing block and width in the message.
- **T3.68** (I42, I44): a `notice` of nine cells answers 9 at 40 and 7 at 7; a `raw` of lines 3, 12 and 5 answers 12; a `pills` row of two chips answers the chips plus the gap; a `keyValue` with a bar answers the cell; a `table` with an uncapped flex column, or with an action bar, or with no rows answers the cell; one with a `maxWidth`-capped flex column answers its plan, which is narrower; and one with none of those answers its planned columns and gaps.
- **T3.69** (I44): a `row` group of a nine-cell `notice` and a twelve-cell `raw` with shares `{cells: 9}, {cells: 12}` at 40 answers `9 + 1 + 12`, and the same two under weights `1, 1` answers 40; a `column` group of the two answers 12, and with the `raw` aligned `right` answers 40; a `panel` around the column answers 14, and around a title of twenty cells answers **25** — the walk said 24 and the build said five cells of furniture, not four: `railPart` truncates to `inner − 3` and wraps the title in a space each side, so the row asserts the border at the answered width carries the whole title and one cell narrower does not, rather than trusting either count.
- **T3.70** (I42): a `row` group at a width that drops its second child answers only the first child's width — the unplaced child is measured by neither half and counted by neither (C04 §3).

### Tier 4 — integration

- **C22 T4.17o, T4.17q** (C22 I77) — the wake, in `test/edge/image-frames.test.ts`, runnable since the validator accepted a GIF (F619, the gate landed with F628): a still arms no wake in 990 ms; a 100/200 ms GIF renders six times in 990 ms and not thirty, seeing frames `1 0 1 0 1 0`; at `kitty` the same document arms nothing; beside an 80 ms spinner the frame does not move at 80 ms and has at 120.
- **T4.1** (with C11, C12): `table` and `plot` register through the public mechanism and satisfy the T2 suite identically to built-ins.
- **T4.2** (with C10): the same block in both themes produces identical row counts.
- **T4.3** (with C10): under `colourDepth: 1`, every tone resolves to a typographic style and status remains distinguishable by glyph alone (D29).
- **T4.4** (with C02): a `TERM=dumb` capability record drives every kind to its ASCII fallback consistently — no kind renders Unicode while another renders ASCII.
- **T4.5** (with C14): summed measured heights of a visible range equal the viewport height exactly.
- **T4.6** (with C14): expanding a table row shifts subsequent blocks by exactly the measured delta.
- **T4.7** (with C04): every document in C07's adaptation corpus measures and renders without error.

### Tier 5 — e2e

- **T5.1**: a session rendering every kind at four terminal widths, visually inspected against golden frames.
- **T5.2**: scrolling a 10,000-block transcript top to bottom → on-screen row counts match measured heights at every screenful. The drift test.
- **T5.3**: the same under `LANG=C` — ASCII throughout, no mojibake, no drift.
- **T5.4**: a real `--logs` tail at 1,000 lines/s → rows stay aligned, no reflow, no jitter.

### Tier 6 — fail-on-revert

- **T6.85** (I39): `decodeImage` never dispatching to `decodeGif` → IF1 fails, every GIF refused as *not a PNG*; disposal never applied → **IF4** fails while IF2's disposal-1 fixtures all pass, which is why IF4 patches the byte; interlace read as progressive, the transparent index painted, or the KwKwK case dropped → **IF2** fails against `sharp`'s pages; the delay clamp removed → IF3; the renderer reading frame 0 regardless of the context → **IF6**'s green arm fails while every row count passes; a GIF sent under `f=100` → IF10; later frames not uploaded → IF9. `tools/mutate/runs/c09-gif.mjs`, with `canvas[d + 3] = 0` as its control.
- **T6.1** (I1): a measurer that under-counts wrapped lines by one → T2.1 fails at the wrapping width.
- **T6.75** (I33): the `max` removed from `registry.measure` → T3.53 fails, and T4.49's second frame draws the one-row figure again — which is the defect as it shipped.
- **T6.76** (I33, I1): the padding removed from `registry.render` → T3.54 fails. `measure` returns the floor and the element draws its own height, which is an I1 violation created by the mechanism built to keep I1 whole.
- **T6.2** (I5): changing the ASCII ellipsis to `...` → T2.5 and T3.4 fail.
- **T6.3** (I6): using `.length` for display width → T2.9 fails, and T3.6 fails on CJK.
- **T6.4** (I3): reading `process.env` in a renderer → T2.7 fails.
- **T6.5** (I4): emitting a colour directly → T2.8 fails.
- **T6.6** (I9): truncating by code unit → T3.5 and T3.6 fail.
- **T6.7** (I11): letting a renderer's throw propagate → T3.13 fails and the frame dies. **The kind must be registered**, and for ten months it was not: the fixture's `explodes` block fell through to `raw` (I10), rendered as its own JSON, measured 1, and satisfied both assertions — so the row passed with the containment deleted (F226). A revert row about a catch has to reach the catch.
- **T6.8** (I11): letting a measurer's throw propagate → T3.14 fails and scrolling breaks. Same fixture, same defect, and `measure` answering **1** is what made it invisible — the contained height and the `raw` fallback's height are the same number.
- **T6.9** (I13): adding a union member without a definition → T2.6 fails at build time.
- **T6.10** (§3): wrapping `logs` instead of truncating → T5.4 shows reflow and T2.1 fails at narrow widths.
- **T6.14** (§3): ignoring `wrap` on `code` → T1.6b fails, and a YAML manifest renders truncated.
- **T6.11** (I18): passing control characters through → T1.11 fails.
- **T6.12** (I8): reading `tick` inside a measurer → T2.12 fails, and a spinner starts shifting the viewport.
- **T6.13**: a renderer calling a clock for its spinner frame → T2.7's environment scan fails, and golden frames flake. **It covers where the frame index is computed and not whether the counter moves**, which is why a shipped `steps` drew one glyph across ten frames with this row green (F227): every test supplies `tick` through `measurable({ tick })`, so the mechanism is called and the wiring is not. The row is right and its reach is narrower than its subject.
- **T6.15** (§3): setting an Ink colour prop instead of emitting SGR → T2.17 fails, and every golden frame renders monochrome while production renders truecolour.
- **T6.17** (I17): counting `gapBefore` inside `measure` instead of at the sequence → a block measures differently in a document than in a panel, and T2.18 fails.
- **T6.16** (§3): letting Ink wrap or truncate rather than pre-breaking through `cells()` → T2.1 fails at the wrapping widths, and T3.4's ASCII marker becomes `…` again.
- **T6.18** (I20): dropping the skipped prefix's SGR from `sliceCells` → T1.16 fails, and a layer composited over a themed row leaves the row's tail drawn in the terminal's default colour, which reads as the layer having bled rather than as the base having lost its style.
- **T6.19** (I20): windowing by `slice` on code units instead of by cells → T1.16 and T1.16c fail; a frame composited from three pieces measures `columns + 1` and wraps into a row nobody counted.
- **T6.86** (I6, §5): dropping `AMBIGUOUS_RANGES` and leaving `isAmbiguous` the hand-written geometry blocks alone → **T1.27 fails on all 44 rows and T1.27c on `§` `·` `×`, while T1.27b and T1.27d pass** — the state the table shipped in, and the two that stay green are what says the row is about the property rather than about Latin-1. Admitting Latin-1 as a *block* (`cp >= 0xa0 && cp <= 0xff`) instead → **T1.27 passes and T1.27b fails**, which is the over-shooting repair the control exists for. Removing U+E0100..U+E01EF from `isZeroWidth` → T1.27e fails at two cells, and a combining mark widens every cluster that carries one.
- **T6.87** (I43): making `notice.width` return the text's unwrapped cells → T3.67 fails on a wrapped notice, which is the case the property exists for.
- **T6.88** (I44): declaring `width` on `rule` returning `w` → T2.111 fails on the set; the clamp and T2.110 still pass, which is why the row is an equality over names.
- **T6.20** (I19): dropping a cluster wider than the line, as both wrappers did → T3.9d and T3.9e fail, and CJK leaves the output at a usable width of 1 with every measurement still agreeing.
- **T6.21** (I11): the error path returning one row regardless of what `measure` committed — **the code as it shipped** — → T3.33 and T3.34 both fail. A revert row restoring a defect that happened rather than one imagined, which is the strongest form this tier takes.
- **T6.22** (I29): a catch that swallows without calling the sink → T3.35 fails, and a run with a caught throw in it goes green.
- **T6.23** (I30): deciding ownership from the member's declaration rather than from what resolution returned → T3.37 fails, and a `scroll` whose `elements` throws takes its whole subtree out of the focus walk with nothing said.
- **T6.24** (I31): letting the width ladder drop a row instead of reassigning it → T3.40 fails, and a narrow `status` block is shorter than `measure` committed. **The row count moving with the width is I1's divergence reintroduced through the path built to prevent it.**
- **T6.25** (I31): labelling the height ladder's top rung `≥ 5` → T3.39 fails at exactly five rows. **The rung as it was first written**: two borders, two blanks and a tag row is six, and the figure was specified at five for as long as it existed on paper — caught by drawing it rather than by any assertion, which is why this row exists at all.
- **T6.77** (I9, C04 I86): restoring `limit − 1` in `truncateParts` → T1.17's wide arm fails, `kept + suffix` at `limit + 1`; slicing wrapped spans by prefix sums of row lengths → C04 T3.62 fails on the second row, one unit early, and C04 T6.83 shows the reverted arithmetic beside the ruled one; `paintRuns` closing and reopening the same style between two plain pieces → every golden frame moves while drawing the same picture, which is the gate's no-move read as a row rather than as luck.
- **T6.84** (C04 I89, C04 I90): `paintRuns` ignoring `run.tone` → C04 T2.35's rendering half fails on the run's colour while every attribute row still passes; ignoring `run.value` → C04 T2.36's rendering half fails on the missing `48`; `wrapRuns` passing no atoms → T1.19 and T3.66 fail on `"x(abcde)yz"`, and `notice`'s measure still equals its render because both go through `noticeRows` — which is the row that says the pair was kept honest by sharing the function and not by two sides agreeing; `notice.measure` restored to `wrapCells(stripControl(text))` → T3.66's `measure` arm fails at 6 by one row, with every frame still drawn; `cells.ts` keeping a span tone on a focused row → T3.66's focus arm fails on a `38` inside the accent run.
- **T6.89** (I45): restoring `step: ["⏺", "*"]` → T2.112 fails on U+23FA, and A03 SS57 fails on the same character; emptying the derived table → T2.112's control fails, which is the row that says the table has members.
- **T6.90** (I46): fitting the row from its end before the elide run → T2.113 fails on the verb being cut while the argument is whole; wrapping a `step` notice like any other → T2.113 fails on the row count at 20 cells.
- **T6.91** (I47): removing `step` from `GLYPH_ELEMENT` → T2.114 fails, and a card's head leaves the focus ring while its body's scroll children stay in it — the frame as it shipped.
- **T6.92** (I48): `glyphFor` reading `unicode` alone → T2.115 fails at `WIDE_CAPS` on all ten Ambiguous members while T2.5b at narrow still passes, which is why the row runs both arms.
- **T6.93** (I49): the composer joining with a literal `" · "` → T2.116's scan fails, and the card's contract rows at the ASCII arm draw a character the alphabet does not have.
- **T6.26** (I32): excluding `error` from animating → T3.43 fails, and `retrying` — which is `error` plus a line — loses its spinner. A per-state branch is the exception the composition immediately needs.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Tone → colour resolution, themes, degradation | C10 |
| Column priority, sort, expand rows | C11 |
| Braille rasterisation, axes, series scaling | C12 |
| Which blocks a verb produces | C07, and the S-series |
| Scroll state and virtualisation | C14 |
| Focus and action dispatch | C11, C15, C16 |
