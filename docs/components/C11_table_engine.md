# C11 — Table engine

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L1 presentation |
| **Depends on** | C04 (`Table`, `TableRow`, `Cell`, `Measure`) · C09 (registers into its registry; `cells()`; `measureChild`) · C10 (`resolveTone`) |
| **Consumed by** | C09's registry · every surface with a table |
| **Source** | A01 D38, D39 · A01 Appendix A.4 · A02 §2 |
| **Status** | Draft |

---

## 1. Purpose

The table carries most of what the tool shows, and it is the only block with real internal structure — columns that must fit, rows that expand, a sort order, a focused row. C11 exists because folding that into C09 would make the block library half table logic.

It registers into C09's registry through the public `register` mechanism, exactly as an app-defined kind would. That is deliberate: the framework's own largest renderer using the extension path is what proves the path is real.

The governing constraint is **no horizontal scroll, ever** (D38). Horizontal scrolling in a terminal is miserable — it hides data behind a gesture nobody discovers, and it breaks the relationship between a row and its neighbours. So a table that does not fit sheds columns, and everything it sheds remains reachable.

---

## 2. Public interface

```typescript
import type { ColumnDef } from "…/viewmodel";   // C04 — shape, not plan

type PlannedColumns = Readonly<{
  visible:    readonly Readonly<{ key: string; width: number }>[];
  dropped:    readonly string[];      // in original column order
  gap:        number;
  overflowed: boolean;                // true iff the last kept column was truncated
}>;

function planColumns(cols: readonly ColumnDef[], width: number): PlannedColumns;
function focusableRowIds(block: Table): readonly string[];

const tableDefinition: BlockDefinition<Table>;   // registered into C09
```

`Table`, `TableRow`, `Cell` and `ColumnDef` are declared in **C04**, which owns every block shape (C04 commitment 11). `PlannedColumns` and `planColumns` belong here: they are the *plan*, derived from the shape and a width, and they are what C11 actually owns.

An earlier draft placed `ColumnDef` here on the reasoning that it "describes planning rather than content". It does not — it is a field of `Table`, so C04 could not declare `Table` without it, and an L0 → L1 dependency was the consequence. The import above is C11 reaching *down*, which is the direction that holds.

`focusableRowIds` is here rather than in §5 because C16 imports it: focus is rendered by C11 and owned by C16 (I14), so the router needs the ordered list of rows it may move between, and that list is a function of the block alone.

**It is the one instance of what C26 generalises, and C26 replaces it rather than joining it.** `elements(block, width)` is the same edge — a block declaring what it offers to whatever owns focus — at four scope levels for every kind instead of one level for this one, and returning positions so a pointer can resolve against the same declaration the keyboard walks. Two parallel mechanisms would be the defect: the roadmap's constraint on the mouse work is *one source, or they will disagree*, and a `focusableRowIds` left standing beside `elements` is exactly the second source. Named here because this file is where someone adding the second one would be working. `docs/components/C26_navigation.md` §5, C26 commitment 11.

`planColumns` is **pure and not memoised**. It is called on every render and on every resize, and it must be cheap — which is an argument for it being cheap, not for it holding a cache.

Three reasons, and the first two are structural. C11 owns no state (I11), and T2.6 scans `table/` for mutable module state — a memo table is the state that scan exists to find. Measured heights are already cached one layer up, on `(entryId, rev, width)` (C14 I3), which is where the repeated work actually accumulates. And there is no measurement behind the optimisation: T3.16 asserts sub-millisecond planning at 10,000 rows, and a cache added to satisfy a budget that is already met is complexity bought with nothing.

If a cache is ever wanted, its shape is settled and it is not a per-registry closure that grows with every resize: C05's, a `WeakMap` keyed on the **columns object** rather than on its content (C05 §3a). A content key of `(columns, width)` is precisely what C05:173 argues against — two column sets differing only in a field the key ignores would share a plan, a bug that passes every other test in §8.

**This reversal was ruled and unrecorded.** It was settled during C11's planning, the sequence moved to C08, and this section still read "pure and memoised on `(columns, width)`" — verbatim from C11's initial commit — when implementation began. A ruling that lands nowhere is invisible; the remedy is that a spec edit follows a ruling immediately, whether or not the code does.

---

## 3. Column planning

```
1  gap = 2 cells between adjacent columns
2  sort candidates by priority descending, ties broken by original order
3  greedily admit while  Σ minWidth + (n−1)·gap  ≤  width
4  the highest-priority column is always admitted, even if it alone exceeds width
5  restore admitted columns to their original order for display
6  distribute residual width to flex columns, evenly, remainder to the leftmost
7  clamp each *flex* column to maxWidth where declared; redistribute what that
   frees
8  if no column is flex, residual width is left unused — the table renders
   narrower than the terminal rather than stretching columns arbitrarily
```

**Step 7 says *flex* and it used to say *each column*, and the difference is 26
declarations** (I22, F1032). A column with no `flex` is allocated its `minWidth` by
step 6 and never grows, so a ceiling on its growth is a ceiling on nothing: measured
over five column shapes at every width from 1 to 200, **1,000 plans compared with and
without `maxWidth` on the non-flex columns, 0 differing** — against a control where the
same cap on a *flex* column moves it from 59 cells to 20. `maxWidth` without `flex` is
the A03 §2 vacuity class arriving in a declaration instead of a rule: it reads as a
constraint, it is accepted, and there is nowhere for it to fire.

The old wording is what a surface author reads before writing one. In the one consumer
in the tree, **26 of 26 `maxWidth` declarations are on columns with no `flex`**, across
four surfaces — and a fifth surface found it, wrote *"`maxWidth` was doing nothing …
it caps a growth that never happens"* in a comment beside the columns it had just
rewritten, and asserted `maxWidth === undefined` on every one of them. That discovery
reached one file. It is CLAUDE.md's deferral shape with the halves swapped: the surface
that found the condition did not know it was writing the spec's correction, so the
workaround stayed local and the other four surfaces still declare the field.

**This is a wording change and not a behaviour change.** `planColumns` has always
clamped flex columns only, and it is right to: a non-flex column sits at `minWidth`,
`maxOf` floors a cap at `minOf` (T3.4), so a clamp could only ever be a no-op. What
changes is that the sentence now forbids what the code already refuses. Making
`maxWidth` *imply* growth is the other repair and it is deliberately not taken here:
it would move every layout in every surface that declares one, which is 26 of them,
and it contradicts step 8's decision to leave residual width unused rather than
stretch columns nobody asked to stretch. T1.25 pins the current answer so that
reversal is a decision rather than a drift.

**Step 3's `while` is a bound on the loop, not a filter over it.** Admission **stops** at the first column that does not fit; it does not skip that column and carry on to narrower ones. The two readings survive every reading of this sentence and differ by one cell in practice: at width 80, S03's admitted set reaches 72 cells through `age`, `kind` at 10 would take it to 84 and is refused, and `mr` at 6 needs exactly 80 and fits — so a skipping planner shows `mr` at a width whose drop table says `mr` goes. S03 §3's table at 80 is what pins it, and C11 T4.1 asserts it.

It is also the better rule to be held to. A lower-priority column appearing at a width where a higher-priority one was refused is a drop order nobody chose, and D38's promise is that the order is reviewable.

Step 4 is what stops the degenerate case: at width 20 with a 40-cell column, the table renders one truncated column rather than nothing. `overflowed` records it so a caller can react.

Step 5 matters for usability — dropping the `owner` column must not reorder `uuid` and `status`. Priority governs survival, never position.

### Dropped columns are not lost

**Every dropped column appears in the row's expanded detail** (D38). No field is ever unreachable; it is one keystroke further away. C11 synthesises a `keyValue` block from the dropped columns and prepends it to whatever `detail` the row already carries.

**A row becomes expandable when columns drop, whether or not it declared a `detail`.** Otherwise the promise is empty: a row with no detail is not expandable, so at narrow widths its dropped fields would be genuinely unreachable — precisely the outcome D38 exists to prevent. Expandability is therefore derived, not declared: `expandable = detail !== undefined || dropped.length > 0`.

That is the property that makes aggressive dropping safe. Without it, narrowing a terminal would silently destroy information.

### The expand marker is a declared column, filled here

Every surface with an expandable table declares an `expand` column — priority 100, `minWidth` 1 — and records its source as "synthesised by C11" (S03 §3, S05 §3, S06 §5, R01 §5). Its one cell is inside those surfaces' drop arithmetic, so it is an ordinary column for planning purposes and must stay one; a gutter reserved by C11 would move every documented total.

What was missing is how C11 recognises it. It is **`role: "expand"` on `ColumnDef`** (C04 §3), and nothing else:

- A column with `role: "expand"` takes its cell content from C11: the `expand` or `collapse` glyph token (C09 §4) according to `expanded`, and blank when the row is not expandable at this width.
- A column without the role is data, whatever its key. Matching on `key === "expand"` was the alternative and it fails twice over — a reserved string in an engine that is otherwise generic, and a silent collision the day a far side returns a field called `expand`.
- `planColumns` does not read `role`. The role governs cell content; priority and width govern layout. That separation is why adding it changed no drop table.

**A table with no `role: "expand"` column shows no marker, even when rows are expandable.** That is the honest consequence and it is left visible rather than patched: C07's fallback declares no such column (C07 §5), so a fallback table whose columns drop is expandable with nothing on screen saying so. The remedy belongs in the shape table that builds those columns, not in a planner guessing where a marker would look right.

### Priorities are the app's

C11 supplies the mechanism. Which columns matter is a surface decision — Prism's `ps` ordering (always `glyph · uuid · family · status`, then `metric · age`, then `kind · owner · mr`) lives in its surface spec, not here.

**Status never truncates.** A truncated status is worse than an absent one, because a half-word reads as a different word. C11 enforces this generically: a column declaring `minWidth` equal to its longest possible value is either shown whole or dropped.

---

## 4. Sort

Sort is view state on the block (C04 §3), so it survives freezing and is recorded in the rule header.

- **Stable.** Equal keys retain input order, so re-sorting on a second column preserves the first as a tiebreak.
- **Detail rows follow their parent.** Reordering pairs, never rows — the mockup's client-side sort had to solve this and it is easy to get wrong (A01 Appendix A.2).
- **Height-neutral.** Sorting reorders rows without changing their number or expansion, so measured height is invariant under sort. C14 therefore never needs to remeasure after a sort.
- **Type-aware.** Numeric columns sort numerically, durations by magnitude, everything else lexically by grapheme. `12m` before `2h`, not after.
- **Missing values sort last** in both directions. A column of mostly-empty cells should not bury the populated ones under either arrow.

**The indicator is ` ▴` / ` ▾` appended to the active column's header** (A01 Appendix A.4, §078/§081, R-BLK-626/637/639 — the design's marks, which replaced `↑`/`↓` in M4; both pairs are `East_Asian_Width=Ambiguous`, measured, so the set's wholesale collapse to ASCII at `wide` is unchanged). Its two characters are C09's, not C11's: C09 §4 owns both renderings of every character that enters a frame and the 1:1 width rule that makes ASCII degradation height-preserving, so they are a rôle in its glyph set (`^` and `v`) rather than a literal here. The indicator is appended *inside* the column's planned width, so a header whose label then exceeds that width truncates — geometry is the plan's, and an indicator that widened a column would make the header disagree with the rows beneath it.

**And the indicator is not the only way a header can widen** (I21). The sentence above
names the thing C11 *appends*; the padding is the thing C11 *completes*, and the two
are separate causes of one symptom. C09's `fit` — which the header used — takes
`Pick<TerminalCapabilities, "unicode">`, so it cannot ask about `ambiguousWidth`: it
forwards the record it is handed to `truncate`, which reads the field structurally and
cuts at the session's convention, and then pads at `"narrow"` unconditionally. The one
function whose reason for existing is that truncation and padding cannot disagree
therefore disagrees with itself, by one cell per Ambiguous character. `rowSpans` pads
at `ctx.capabilities.ambiguousWidth`, so at `ambiguousWidth: "wide"` a header carrying
`Δt` and `°C` began its `note` column at cell **36** where both rows beneath it began
it at **34**, and `clampSpans` cut the surplus off the end — leaving a truncation
marker in a header where nothing was too long for its column. Every line was 44 cells
before and after, which is why no assertion about a row's width could see it (F1019).

---

## 5. Expansion and focus

`expanded` is per-row state in the block. Expanding patches the document (C04 §4); it is never external state, which is what keeps `measure` pure.

```
height = 1 (header)
       + rows
       + Σ over expanded rows of measureChild(detailBlocks, width − 2)
       + 2 (a blank and the action bar, when any row declares actions)
```

Empty tables measure `1 + 1` — header plus the empty message, never zero.

Detail is indented by 2 cells, so it measures at `width − 2`. Detail blocks are measured through the injected `measureChild`, so a row can expand to reveal a plot, a progress bar and actions without C11 knowing what those are.

**Focus is rendered, not owned.** `ctx.focus` names the focused row; C11 renders it distinctly and surfaces its actions. Which row has focus, and what the arrow keys do, is C16's. C11 exposes `focusableRowIds` so the router has something to move between.

**The selection is rendered the same way, and it is one more state of the same rule.** `ctx.focus.selected` names the extent (C26 I16) as `(blockId, rowId)` pairs over the *entry's* element list: every block in the entry is handed the same list and keeps the pairs naming itself, so a table holding three selected rows paints three from one pass and a table holding none of them — the head being in a sibling block — paints nothing. A selected row that is not the head is painted `tone.default` over `surface.selection`, the editor's own wash (C10 §4b), because it is the same meaning — the rows `y` will copy — and one slot carries one meaning. The head keeps focus's `accent`, which is what makes it distinguishable inside its own extent; the wash is *selected*, the accent is *here*. **A one-element extent is therefore drawn exactly as no selection, with no branch on the count**: the head is painted as the head and there is nothing else to paint, which is I16's sentinel measured on the render side. Where the wash has no colour (`colourDepth: 1`) the row is reverse video — the rung `shell/paint.ts`'s `selectionStyle` already takes for the prompt: an attribute survives the depth where a colour does not, and a gutter mark would cost a cell I14 forbids and I15 refuses to reserve.

**Measured before this landed** (F764, arc3 Lane A): after `↓ ⇧↓ ⇧↓` the frame showed the head in `accent` and the two rows above it in `default` — the extent had one reader, `y`. And `pills` read `ctx.focus` nowhere: `render` consulted `active` and `tone` only, so a focused chip was invisible in every frame. Both are the same omission — `FocusState` carried the head and nothing painted anything but a table row — and both close here: a chip is painted `accent` when it is the head and washed when it is selected, on the rule above.

**A row declares a `detail` iff the plan lost something a reader would want back** (C26 §5, C15 §2a; 2026-09-05):
a non-empty cell's column was dropped by the plan, or a visible cell is wider than its planned width and was
cut. The detail is a `keyValue` of column label → full text, and it is **absent** when nothing was lost — a
peek over a row that fits would say nothing. Measured over the corpus at 80 columns: **13 of 20 tables cut
something, 50 of 80 rows**; docker's real `/ps` drops `ports` on every row. Width is measured with
`cells(text, "narrow")` — the stated limit, because the plan's own measure is the one the detail answers to.

### The action bar (I17)

A trailing row carrying the **focused row's** actions — `⏎ detail  ␣ expand  ≡ logs  ⚡ events` in S03 §2, and the equivalent in S02, S05, S06 and S14.

**Its presence follows the data and its content follows focus, and the split is forced rather than chosen.** `render` sees focus through `ctx`; `measure` does not, which is what lets a focused row be toned without changing a width (§cells). A bar that appeared only when something was focused would make a block's height vary with focus — and focus changes without the document changing, so `rev` does not move and C14's cache returns a height for a frame that no longer exists. **That is C09 I1 broken in the one way the cache cannot see**, because both halves are individually correct and disagree only after a keystroke that touched no data.

So the bar is drawn whenever **any** row declares `actions`, and its label row is blank when nothing is focused. A blank row that is always there costs a row on a table with affordances; a row that comes and goes costs a corrupted frame.

**Two rows, not one, and the figures are what said so.** Every surface drawing a bar — S03, S05, S06's two, S14, S15 — draws a blank line between the last data row and the labels, and the fixtures modelled that as a separate `pills` block carrying `gapBefore`. The separation cannot come from `gapBefore` once the bar is C11's: that field applies *between* blocks in a sequence (C04 §3a), and a table cannot ask the sequence for a gap after itself. So the blank is inside the table, as an expanded row's `gapBefore` children already are. The first draft of this section said `+ 1`; six figures said otherwise, which is the composition answering a question rather than the spec assuming one.

**It is C11's and cannot be the surface's.** A surface composing its own bar would need to know which row has focus, and a block has no focus — that is precisely what I14 puts in C16. Every S-series figure drawing one has been drawing something nothing produced: `TableRow.actions` existed, this section said C11 "surfaces its actions", and no code read the field. **The fifth of specified, agreed and structurally absent, and the worst hidden** — the other four were missing values or missing verbs, and this one was a field that existed, so nothing looked.

---

### 5b. The two gutter columns — the reservation I15 refused, and the fixtures that overturn it

**I15 says C11 neither synthesises a column nor reserves a gutter, because either would change
width arithmetic the surfaces already state.** That is the invariant the design overturns, and
it took two wrong rulings to find it: the mark was put on the notice (C09 I83's first form) and
then proposed for the entry, and the fixtures refuse both.

**Measured by column, across four fixtures.** §044 is the argument in three adjacent rows of one
table:

| row | col 0 | col 2 | col 4 | content |
|---|---|---|---|---|
| neither selected nor focused | — | — | `●` | 6 |
| **selected** | `▌` | — | `●` | 6 |
| selected **and** focused | `▌` | `▸` | `✗` | 6 |

Two gutter columns, reserved on all three rows, spent on none, one and both, **and the content
edge never moves**. (Only the focus column is built here — see the end of this section for why
the copy column is owed rather than taken.) §012 draws a focused table row with `▸` at 2 and a call-head entry with `●`
at 2 in the same fixture; §081 draws a real transcript whose head sits at column 0 and whose
table, inside that entry, puts its focused `▸` at 4 against values at 6 — the same offset,
inside the table's own gutter; §003 draws a whole transcript of unfocused heads with nothing
reserved.

**So the reservation is the block's and not the entry's, and that is what keeps the left edge
straight.** A call head keeps its own edge and reserves nothing, because it has no rows to
misalign against; a table reserves both columns on every row, so nothing inside it moves when a
row gains or loses a fact. **A width that followed focus would be the defect** — `measure` sees
no focus by construction (I17 one axis over), so a column that appeared with the mark would put
the measurer and the render in disagreement on exactly the frames a reader is looking at.

**What I15 keeps.** Its reason was never *a gutter is wrong*; it was *the S-series figures state
drop totals and a gutter moves them*. That is still true and is paid rather than dodged: the
reservation is four cells, the S-series figures move by four, and the movers are named before
the golden run rather than explained after it. What I15 continues to refuse is the thing it was
written against — **a synthesised `role: "expand"` column**, which is a column of the *plan* and
would take part in width distribution. These two are outside the plan entirely, as the detail
indent is.

**One column lands here and the second is owed, with the file that owes it.** §044's legend is
explicit — *`▌` carries selected elements; `▸` carries focus* — so R-SEL-006's *selected takes
selectionGround and no mark* means no **focus** mark, and selection does have one. But `▌`'s
glyph slot is `live`, and `live` **has a real reader**: `containers.ts:113` draws `▌ <title>`
on a live panel. Taking it for a selected row would be F161's shared mark with two real
consumers, which is the hazard rather than the remedy. The selection mark needs a slot of its
own, and a glyph slot is the glyph table's business — M4's. **So this block reserves the focus
column now, two cells, and the copy column lands with the slot.** A column reserved and never
filled is furniture, and a second reservation now would spend the S-series' movers twice.

### 5c. The ground runs under the gutter — the row is one thing

**The reserved column is part of the row, not a margin beside it.** Where a row takes a ground
— `surface.focusGround` for the head, `surface.selection` for the extent — that ground begins at
the block's own left edge and runs under the reserved gutter, so the mark sits **on** the row's
ground rather than on the page beside it.

**Measured across every design figure that has a mark on a grounded row**, reading the registry's
own projection rather than the plain-text fixture:

| figure | the mark's span | the ground |
|---|---|---|
| §082, the focused expanded row (R-BLK-941) | `c-accent bg-focusGround` `▸ ` | `focusGround` |
| §044, focused inside a selection | `c-accent bold bg-selection focus-indicator` `▸ ` | `selection` |
| §072, a focused row — a wash plus a persistent mark | `c-accent bg-focusGround` `▸ ` | `focusGround` |
| §043, focused and remembered | `bg-pick` / `bg-focusGround` over ` ▸ … ` | `pick`, `focusGround` |
| §071, `/ps` with a picked row | `c-pickInk bold bg-pick` `▸ ` | `pick` |

Five figures, three grounds, and not one draws the mark outside. What **is** outside on every one
of them is the *entry's* lead — C09's `⎿` and its indent — which belongs to the block above and
never to this one.

**This corrects a claim in the renderer, and the claim cited §044 for its opposite.** `definition.ts`
carried *the lead is painted on the page, not on the row's ground … a ground that ran under the
gutter would make the two one block of colour, which is the frame §044 does not draw.* §044 draws
exactly that frame: its focused-and-selected row is one span run of `bg-selection` that opens with
`▸ `. The sentence was true about a risk and false about its source, which is why it survived
being read — and R-SEL-006, the rule the comment reached for, is silent on the mark's **cell** and
speaks only about which ground wins.

**At 1-bit the band runs the whole row, and that is the rung to look at.** The guard is the
header's — *no ground, so no padding either* — and it asks whether the **surface** resolved, not
whether colour is available: `selection` and `focusGround` answer **inverse** at `colourDepth: 1`
rather than `NO_STYLE`, so a focused or selected row is a full-width reverse-video band there and
its `▸` is inverted with it. That is R-SEL-006's own rung drawn exactly — *at 1-bit the selection
becomes reverse video while the focus mark persists* — and the mark persists as a mark, not as an
un-inverted cell: it is still the only glyph in the gutter and still the thing that says *here*
inside an extent. Where a surface genuinely does not resolve, `bgElev` on a theme that inherits it,
nothing is padded and nothing is drawn (I24, I25, `R-COL-004`).

**The block already answered this once, the other way.** The header row takes `bgElev` *across the
whole row, gutter included* (I24, §073) on the reasoning that a header is a surface the rows sit
under, so a ground stopping at the text would say *these words* are the surface. That argument is
about grounds, not about headers, and a body row's ground is the same claim about the same row.
One block cannot hold two answers about the same column.

**The mark is never in the state glyph's column**, and §003 is why the rule has to be stated:
its line 6 draws `▸ thinking · 4s` with the triangle sitting where `●` sits on the lines around
it. That is **disclosure**, not focus — one glyph with two meanings and two real consumers,
which is F161's hazard arriving with the consumers it was missing. Focus's column is its own.

## 5a. The window (C09 §2a)

**A table divides, and its units are not rows.** The header is one unit, each row *with its
detail* is one, and the gap-plus-bar is one. `window` walks them in **display** order, keeps every
unit the range touches, and pays the difference at both ends — `skipRows` before the first and
`dropRows` after the last (C09 I26). The unit heights are not a function of `(block, width)`, so
the seam is handed `measureChild` (C09 I26a): a detail's height is a child's.

Two fields make that expressible, and each says a different kind of thing.

**`actionBar` is a presence, not a width.** `keyValue` pins `keyWidth` and `patch` pins
`numberWidth` because a slice of narrower values would draw a narrower column and every row would
shift sideways as the reader scrolls. A bar does not get narrower — it is there or it is not. And
because `hasActionBar` is `rows.some(r => r.actions)`, a window moves it in **both** directions: a
slice dropping the only row that declares `actions` loses two rows the parent counted, and a
mid-table slice that happens to keep one draws a bar in the middle of a scrolled table. Present on
the block it is the answer; absent, the rows are asked. **Stripping `actions` to suppress it is not
the same change** — that removes the row's affordances (C26).

**`presorted` says the rows are already in `sort`'s order.** It exists because `sortedRows` is not
idempotent over a slice: `kindOf` decides a column's comparator from **the values present**, so a
window that drops the one non-numeric value in a numeric-looking column re-classifies it and
reorders its own rows — `2 · 10 · abc` renders `10 · 2 · abc` whole and `2 · 10` windowed, with
every count and every height correct (F429). The window sorts, slices, and sets the flag.

**`sort` itself is kept.** The indicator is drawn from it (§4), and a table that lost its arrow the
moment a reader scrolled would be a visible regression in the one place a reader looks to know why
the rows are in this order. Setting the sorted column `sortable: false` would suppress the re-sort
and keep the indicator with no new field at all — and it is wrong for the reason stripping
`actions` is wrong: `sortable` is an affordance, and a window may not change what a table offers.

**A window never holds zero rows.** Both ends of a table can be asked for alone — `[0, 1)` is the
header, `[n−2, n)` is the gap and the bar — and a bodyless window is a different block: C11 §5's
empty-table rule fires and it measures `header + 1`, while a bar whose existence derives from the
rows cannot be drawn without one. So the nearest row unit is kept and paid for in whichever
residual it falls outside: `dropRows` at the top, `skipRows` at the bottom.

**Neither field is a producer's to set** (MG27, `BUILDER_OMISSIONS`). Both describe what a *parent*
derived, and a hand-built table setting either would assert something its own rows do not justify —
`numberWidth`'s argument, one kind over (C25 I21a).

---

## 6. Invariants

- **I1** — No horizontal scroll is ever emitted, at any width.
- **I2** — Every dropped column appears in the expanded detail of every row, **and every row is expandable whenever any column has dropped**, regardless of whether it declared a `detail`.
- **I3** — At least one column is always visible; the highest-priority column is never dropped.
- **I4** — Column display order is the declared order; priority governs survival only.
- **I5** — `Σ visible widths + gaps ≤ width`, except when `overflowed`, where the single kept column is truncated to `width`.
- **I6** — No planned width is negative or non-integer.
- **I7** — `planColumns` is pure and total.
- **I8** — Sort is stable, height-neutral, and keeps detail rows with their parents.
- **I9** — Measured height equals rendered height, including expanded details (C09 I1).
- **I10** — A column whose `minWidth` equals its longest value is shown whole or dropped, never truncated.
- **I11** — C11 owns no state. Sort order, expansion and focus all arrive as data.
- **I12** — Column priority is declared by the surface, never inferred by C11. A table engine guessing which column matters would guess differently as data changed, and the drop order would stop being reviewable.
- **I13** — Missing values sort last in both directions. Not first when ascending and last when descending — last either way, because a null is an absence of rank rather than the bottom of one, and a reader sorting to find the worst case should not find blanks.
- **I14** — Focus is rendered by C11 and owned by C16. C11 holds no focus state; it draws what it is handed, which is what keeps I11 true for the one piece of state a table most looks like it should own. **The selection is the same rule with one more state**: a row named in `ctx.focus.selected` and not the head takes the selection wash — reverse video at 1-bit; a one-element extent draws byte-identical to no selection, with no branch on the count; a block whose id no pair names paints nothing. **A row on a ground keeps every cell's own tone, resolved against that ground** (C10 I48, R-THM-001, R-THM-003). The first form of this invariant dropped a focused or selected row to **one ink** — `accent` under focus, `default` under selection — and dropped a span's tone with it, arguing that a row which kept them would read as two things on the one occasion it must read as one. **That argument was about a resolver that could not answer**: there was one ink per slot and it was the page's, so a `failed` cell on a selection ground could take its own tone or take a legible one and not both. The resolver takes the ground now, so it is `inkOn`'s composed value that lands — the band's single ink where the theme declares a band, which is the one-ink reading kept exactly where it was ever true, and the theme's composed `tone.error` where it does not. So §4k.2 row 1's third clause holds: **failure keeps its glyph, its word and its tone**, on the ground selection took (F1240). Focus and selection change the **ground** and the mark, and no geometry: no extra row and no width (§5, §5b). **The ground runs under the reserved gutter** (§5c): the mark is on the row's ground, not on the page beside it, which is what five design figures draw across three different grounds and what this block's own header row has always done (I24). **The head's ground is `surface.focusGround` and the extent's is `surface.selection`** (R-SEL-006, C10 I47, §4k) — two grounds for two facts, where this invariant's first form gave both the selection wash and told them apart by ink alone. The mark R-SEL-006 gives focus lands in this block's own reserved gutter (I15, §5b), beside the copy column `▌` carries, both reserved on every row whatever its state. **Selection wins the ground where both facts hold** and the head keeps `▸`, which is R-SEL-006 stated as one row rather than two. **The sentinel is distinguished by kind and never by size**: `ctx.focus.selected` **absent** is C26 I16's head-alone sentinel, and any **present** extent is a real selection, one element included — so a real single-row selection takes the selection ground, where a test on the extent's size would have painted it as focus and called that the sentinel.
- **I15** — *(R-SEL-006, C10 I47, §5b)* The expand marker is drawn only into a column declaring `role: "expand"`, and `planColumns` never reads `role`. A table declaring no such column shows no marker, and **C11 never synthesises a column**, because a synthesised column is a column of the *plan* and would take part in width distribution the surfaces already state. **It does reserve a gutter column, and that clause is new**: a focus column for `▸`, outside the plan as the detail indent is, **reserved on every row of the block — header, body and residue alike — whatever that row's state**, so the columns beneath it stay one axis. **Reserved on every row and grounded with it** (§5c): the column is part of the row it leads, so a row's ground opens at the block's edge and the mark lands on it. **A second column, for the selection mark `▌`, is owed and is not taken here**: `▌`'s slot is `live` and `containers.ts:113` already draws it on a live panel's title, so the mark needs a slot of its own and a slot is M4's. A column reserved and never filled is furniture. A width that followed focus would put `measure` and the render in disagreement on exactly the frames a reader is looking at, which is I17's argument one axis over. The reservation costs two cells and it is paid rather than dodged — the S-series drop totals move by two and the movers are named before the golden run. **The fixtures are what overturned the old clause**: §044 draws three adjacent rows reserving both columns and spending none, one and both with the content edge fixed, and §012, §081 and §003 all draw an unfocused call head at its own edge with nothing reserved — so the reservation is the block's, not the entry's (→ I14, C09 I83, C10 §4k).
- **I16** — C11 registers through C09's public `register`; it is not privileged.
- **I17** — The action bar's **presence** depends on the data and never on focus: a blank separator and a label row whenever any row declares `actions`, with the labels blank when nothing is focused. A height that varied with focus would move without `rev` moving, so C14's cache could not invalidate it — I9 broken in the one way measurement cannot catch, since `measure` never sees focus at all.
- **I18** — The action bar's presence is `actionBar` when the block declares it and `rows.some(r => r.actions)` otherwise. **A window declares it and a producer does not**: the presence is derived from the rows, so a slice moves it in both directions — losing two rows the parent counted, or drawing a bar in the middle of a scrolled table. I17 is unchanged by this: the pin is computed from the parent's data at the moment the window is taken, so presence still never follows focus.
- **I19** — A window's rows are in **display** order and carry `presorted`, and `sortedRows` returns a `presorted` block's rows untouched. Without it the slice re-derives its own comparator — `kindOf` reads the values present — and a window can reverse its own rows while every count and every height stays correct, which is the one failure C09 I26 cannot see.
- **I20** — A window of a table holds at least one row. A bodyless window is a different block: the empty-table rule fires and it measures `header + 1`, and an action bar whose existence derives from the rows cannot be drawn beside none. The row that makes it non-empty is paid for in `skipRows` or `dropRows` according to which end it falls outside.
- **I21** — Every drawn row of a table begins each column at the same cell, **the header included**. The header is truncated *and* padded at the session's `ambiguousWidth`, which is the convention the plan's cells are spent in and the one the rows beneath it use; a header measured at a different convention widens a column for one line of the frame and the frame then answers twice about where a column starts. Width totals are blind to it — the row is clamped back to the plan's total either way — so the property is over the *offsets*, not the sum.
- **I22** — `maxWidth` constrains a **flex** column and nothing else. A column with no `flex` is allocated exactly its `minWidth`, so a declared ceiling on it can never fire: the plan is deeply equal with and without one, at every width. C11 neither refuses the declaration nor honours it — a planner must stay total (I7) and has nowhere to report (SS33) — so the rule is stated here and asserted, and a change that made `maxWidth` imply growth fails T1.25 rather than silently relaying out every table that declares one.
- **I23** — **A cell whose text a `bar` or `spark` replaces still draws its glyph, as a lead run inside the planned width, and the series takes the rest.** C04 I6 obliges a glyph on any `Cell` toned `error` or `warn` and enforces it at construction, so a surface drawing a load bar **must** supply one; the bar and spark branches returned before the line that reads it, and four golden frames recorded the absence — two of them at ASCII, where the tone is the only other carrier and there is none. That is C12 I25 arriving here: *two things a reader must tell apart differ by mark or by name, never by tone alone*, and a 59% bar against a 61% one differs by a cell of fill and by nothing else. **The lead is inside the planned width rather than beside it**, which is how an ordinary cell already spends a glyph — *part of the cell's width, not an addition to it* — and what keeps C04 I50c's *takes the planned width* a statement about the cell. **And it is spent per column, not per cell**: in a column where any row draws a series beside a mark, every cell that draws a series spends the lead — the mark where it has one and **blank where it does not**. C12 I20 has already ruled this of the other allowance in the same cell — *the number's allowance belongs to the chart rather than to the row*, because *taken per row it inverts: 99 draws 37 and 100 draws 36, a larger value and a shorter bar, each run scaled against what its own label left, every count in both rows right.* A per-row lead reproduces that exactly: a container at 59% would draw its run in ten cells and one at 61% in eight, so the two runs are not comparable and the band boundary is where the axis changes. **The run is the axis** (I20), and an axis that changes length down a column is not one. C12 I13 and I20's *exactly `width` cells and one row* is preserved by construction, because the two runs are measured with `cells()` and sum to the plan. **The separator is unconditional here where it is conditional there**: an ordinary cell omits the space when its text is empty, so a glyph-only column stays one cell wide, and a bar cell always has a series after the mark. **The mark is dropped only when it does not fit** — at a planned width below the lead itself — and never on a judgement about how narrow is too narrow. *The ruling here first read: where the plan leaves no room for both, the glyph goes and the series keeps the column, because a mark would replace the quantity with a severity. The implementation falsified it.* Rendered at 3, a toned cell draws `▲ …` where an untoned one draws `10…` for a value of 101.2 — and C12 I20 has already ruled on that comparison in its other arm, dropping a number wider than its column because **a truncated number is a different number**. `10…` is not the quantity the clause was written to protect; `▲` is the one thing at that width that is true. The clause was a judgement C11 cannot make anyway, since how a series degrades is C12's (I20, I13) and reaching for it would put the decision in two components. **The lead is two cells at every convention**, because C09 I48 makes both renderings of every slot one cell — so `cells()` here states the rule rather than measuring a variable, and a token leaving `AMBIGUOUS_TOKENS` is caught by C09 T2.5 rather than by a row here that cannot currently differ. `spark` has no toned consumer in the tree today and is written the same way rather than left as the next instance (→ FINDINGS F1104).
- **I24** — *(§073, §072, C09 I95, C10 I48, `R-COL-004`)* **The header row takes `bgElev` across the block's whole width, and it is the one ground in the table that follows no fact.** **Amended by §5c and I25**, which is the clause that moved: *the one full-width ground* was true when a body row's ground stopped short of the reserved gutter and an expanded detail took none, and neither is so now — every ground this block paints runs the block's whole width, gutter included, and what is left distinguishing the header is that it takes one **unconditionally**, where a row's ground follows focus, selection or expansion. §073 names it exactly — *a table header: the one place a full-width ground is right* — and gives the reason the rule turns on: *it is a SURFACE the rows sit under, not a status*, which is §072's test applied to a thing rather than to a fact. So the ground runs from column zero to the block's edge, gutter included, rather than stopping where the last label ends: a ground that stopped at the text would say *these words* are the surface where the claim is that the **row** is. The labels keep `muted` and resolve **on** the ground (C10 I48), so a theme repainting a tone on `bgElev` is honoured here rather than measured elsewhere and drawn flat. **It degrades to nothing and loses nothing**, which is what makes it admissible under `R-COL-004`: at one bit `resolveBackground` answers `NO_STYLE`, the header is `muted` text over the page exactly as it has always been, and the header was never a carrier for anything — the column names are the carrier, and they are still there. **This moves C09 I95's declared set from three kinds to four**, which is what that invariant was written to make visible: `table` joins `patch`, `status` and `image`, and it joins by a spec edit rather than by a renderer quietly starting to paint.
- **I25** — *(§082 `R-BLK-942`, §5c, I24, I9, C10 I48)* **An expanded row's detail sits on `surface.bgElev`, the block's whole width, gutter included.** R-BLK-942 says it in one line — *the detail sits on bgElev, the inside ground, which is the same one block scope already uses, and the rows below carry on underneath* — and the second half is the load-bearing part: the detail is **in** the transcript, under the row it belongs to, with the table continuing beneath it. That is §082's whole argument against a pushed view, and the ground is what makes it legible without a frame: *inside this row* is said by a surface rather than by a border, so nothing is drawn that a 1-bit terminal would have to keep. **It degrades to nothing and loses nothing** (`R-COL-004`, I24's own test): at one bit `resolveBackground` answers `NO_STYLE`, the detail is its own inks over the page, and the carrier for *this belongs to that row* was never the ground — it is the two-cell indent, which is geometry and survives every rung. **The ground is the row's, not the child's**: `detailBlocks` returns blocks and a child renders itself, so the ground is applied where the detail's lines are placed into the table's parts, which is also the only place that knows the gutter. **Expansion is the third fact a row's ground can follow**, after focus and selection, and unlike those two it is block state rather than context (I9) — so an expanded row that is neither focused nor selected still paints, and `measure` is untouched because a ground is not a row.
- **I26** — *(§099 `R-EXA-099`, `R-SEC-099`, C04 I30)* **A column may align on the decimal point, and `align: "right"` cannot do it.** §099 states the defect in one line — *align: r lines up the LAST character, which puts `0.0372` and `3e-4` in different places* — and the tree has exactly two arms, `"left" | "right"`, so the figure the section draws has no expression here at all.

  **The rule, and it is one sentence: split at the point, right-align the integer part to the column's point and left-align the rest after it.** A value with no point is **all** integer part, so it ends where the point sits — which is the section's own *an integer aligns where its point would be, so `1284` ends exactly where `0.941`'s point is*. It is also what makes `3e-4` land correctly without a rule of its own: it has no `.`, so it is an integer part four cells wide and ends at the point like `1284` does. Checked against §099's figure, that reproduces all four rows.

  **The point is derived, not authored, and *the column declares where the point sits* is satisfied by the column owning it.** The alternative — an integer on `ColumnDef` — is a number the author counts and the planner can contradict: a column that yields width under `R-TBL-005` would carry a declared point outside its own frame, and nothing could report the disagreement. So the point is the widest integer part among the column's cells, which is a property the column has rather than one it is told.

  **It is computed once per block, beside `markedSeriesColumns`.** `rowSpans` holds the whole `Table`, so it could take the column every time it draws a row — which is the same walk once per row, and the reason the marked-column set is already hoisted to the caller. One more member on the same options record rather than a second traversal.

  **Width is unchanged and so is `measure`.** Alignment distributes the padding a cell already had inside the width the planner solved; it never asks for more. The row count is untouched — which is §099's own *height never feeds back into width*, holding from the other side.

  **And a column with no room for the alignment falls back as a COLUMN, to `right`.** This clause replaces a first draft that said a narrow column *truncates exactly as any other does*, which was true and not the case that arises: a decimal column needs `max(integer) + max(fraction)` cells, and below that every cell's lead gets clamped to its **own** slack — so the lead varies with the value's length and the points drift by a cell. Measured on §099's own four values in an 8-cell column, `0.0372` and `0.941` came out one cell apart, which reads as a defect rather than as a degradation and is worse than either alignment. **The counts were all correct and the frame was wrong**, which is why this was found by drawing it. So the decision is the column's: it either has room for `max(integer) + max(fraction)` and aligns, or it has none and right-aligns like any other number column. `right` and not `left`, because §099's objection to `right` is that it misaligns *points*, which a column with no room for them does not have to begin with.

- **I27** — *(§078 `R-TBL-001`, `R-TBL-002`, I26, I12, I18, I19)* **A column with no declared alignment takes the one its values imply, and a declared one is honoured unchanged.** `R-TBL-001` is stated as a fact about what happens — *numbers INLINE-END-ALIGN, text INLINE-START-ALIGNS … so digits line up by place value and you can compare a column by its SHAPE without reading it* — and `align` was **required**, so every producer that builds columns out of data had to answer before it had seen any value. Three of the four do it by writing `left` unconditionally: `src/data/viewmodel/markdown.ts` `columnsOf`, `src/shell/builders/index.ts` `col` and `src/data/adapters/fallback.ts` `columnsFor`. A column of numbers therefore left-aligns in most of the places C11's columns come from, and the rule held only for hand-authored ones.

  **So the field becomes optional and the answer is derived from the cells, which is I26's ruling one level up.** The decimal point is *the widest integer part among the column's cells … a property the column has rather than one it is told*, because a declared one is a number the planner can contradict with nothing to report the disagreement. The kind of value a column holds is the same sentence about the same record: an author's `left` on a column of numbers is a claim the data falsifies, and nothing reports that either.

  **The classification already existed, under the sort's name.** `kindOf` reads every non-missing value in the column and answers `numeric | duration | text`, with the agreement rule stated — *one `AUC 0.912` in a column of numbers makes the whole column text, because a comparator that returns null for some of its input is a comparator with no defined order*. That rule serves alignment for a reason of its own rather than by inheritance: a column whose values disagree about their kind **has** no kind, and the safe reading of a mixed column is the one that treats it as prose. So the function moves out of `sort.ts` — it is no longer only about ordering — and both readers take it from the same place.

  **The answers, and there are four because the numeric arm splits.** `text → "left"`, `duration → "right"`, and a numeric column takes `"decimal"` when any of its values carries a point and `"right"` when none does. **§078 draws both numeric cases in one table and that is what settles it**: its `rows` column is `184`, `88`, `1,204`, `120` and sits flush to the column's inline end, while its `metric` column is `0.0372`, `0.941` and aligns on the point. One answer cannot be right for both, and the difference is legible in the cells themselves — a column whose numbers all lack a point has nothing to align on.

  **This invariant's first form said `numeric → "decimal"` always, on the argument that `decimal` is a refinement of `right` and never a departure, and the frame falsified it.** Rendered in a six-cell column, `1204 / 88 / 120` came out `"1204  "` where `right` gives `"  1204"`. The values agree with each other under both — the claim was right about *that* — and what differs is where the column's **slack** sits: `decimal` left-aligns everything from the point on, so a column wider than its widest value pads on the right and stops being flush. §099's own figure has a ragged right edge for exactly this reason, on purpose. So the refinement claim was true of the values and false of the column, and `R-TBL-001`'s *compare a column by its SHAPE without reading it* is about the column. **The claim was checkable and it was checked**, which is what T1.32 is now the record of rather than the assertion of.

  **A declared alignment is left alone, and that is what keeps this inside the kit's scope.** `src/data/adapters/fallback.ts` is C07, which `AUTHORITY.md` leaves untouched; its explicit `left` still means `left`, and nothing reaches into it. What changes is every column that never named one — which is most of them, because `col()`'s own comment already treats the field as a default in the same breath as `priority: 50` and `minWidth: 8`: *a surface that cares sets them, and one that does not gets a column that survives planning.*

  **The window pins it, which is the third instance of one argument rather than a new mechanism.** `kindOf` reads *the values present*, so a slice that dropped the only non-numeric value in a numeric-looking column re-classifies it (F429) — and where sort's version of that reverses an order, this one flips a column from `left` to `decimal` **between two scroll positions**, with every count and every width correct. I18 pins the action bar's presence and I19 pins the sort for exactly this shape, so `window` resolves each column's alignment from the **whole** table's rows and hands the slice columns that already carry it. No new field on `Table`: a resolved `align` is an ordinary declaration by the time the renderer sees it, and the pinning is the window writing what the producer left open.

  **The header takes the resolved alignment too, and that rule already shipped — what changes is which value it reads.** `headerSpans` right-aligns a column's label when the column is `right`, because a header that kept `left` over right-aligned values would put the label at one end and every value beneath it at the other, and I21's *every drawn row begins each column at the same cell* would hold while the frame read as two tables. A column that declared nothing simply has an answer there now.

  **`decimal` is deliberately excluded from that, and this is the one place the header and the rows part company.** A decimal column's right edge is **ragged on purpose** — everything from the point on is left-aligned after it (I26, §099's figure) — so the column's inline end is not where its data is, and a header pushed there would sit past every value it names. Measured rather than argued: including it moved six `design-surfaces` goldens, all of them §099's own side-by-side figure, and in each the label left its own column. Left is what the header has always taken there and what that golden recorded.

  **`measure` is untouched and so is I12.** Alignment distributes padding inside a width the planner already solved (I26) — no column asks for more, no row count moves. And priority is still declared by the surface: what is read from the data is the **kind** of a column's values, never which column matters, so C11 is not the table engine guessing which column a reader cares about that I12 refuses to be.

- **I28** — *(§078 `R-TBL-004`, `R-TBL-005`, I27, I26, C04 I86)* **A numeric column groups its thousands, and it is a property of the column rather than of a cell.** §078 states both halves of the rule in one line — *thousands are grouped, units travel with the value: `1,204` and `184` · `2m` and `41m` · `4.2s` and `0.02s`. A units row in the header is a row you have to look back at* — and the two halves land in different places. **The unit half is already satisfied and by a shape rather than by code**: the unit travels *in the cell's text*, `src/presentation/table/sort.ts` `asDuration` parses `12m`, `1h 12m` and `2h ago` back out of it *since the unit carries the magnitude*, and no units row exists anywhere in the render. What the rule forbids there is a header row, and there is none to remove. The grouping half is what is built here.

  **The separator is settled and there was nothing to park.** Measured over `docs/design/language/fixtures/*.txt`: **29 grouped occurrences of 14 distinct numerals**, a comma every time, against **one** ungrouped numeral in a numeric table column — §099's `steps 1284`, in a section citing neither `R-TBL-001` nor `R-TBL-004`, where the figure's subject is the decimal point and its own prose makes `1284` load-bearing for that instead. Every other ungrouped four-digit figure in the corpus is prose, a diff line number, an MR id, a codepoint, or a value in a mixed-kind **text** column — §075's `context.cap 50000`, inline-start-aligned beside `qwen3-coder-next`, which is `R-TBL-001` holding rather than this rule breaking.

  **Which columns group is one predicate with three clauses, computed once per block beside the alignments and the points, and each clause is all-or-nothing over the column.** That shape is not a convenience: a column that grouped some of its rows and not others would put `1,204` above `41208`, which is worse than grouping neither and is exactly the comparison `R-TBL-001` says a reader makes by shape without reading.

  1. **The column is numeric** (I27). A year, an id, a port and a line number are all digits and none of them groups, and the repository cannot tell them apart — but it does not have to, because the only ones it groups are the ones its own values classify as quantities, and a column holding one non-numeric value is text by I27's agreement rule and never reaches this at all.
  2. **No cell in the column carries `spans`.** `Cell.spans` are **code-unit offsets into `text`** (C04 §3am, C04 I83), and grouping splices characters into that string — so every offset past the first separator would address a different character. `cells.ts` already states the constraint from the other side, about the glyph lead: *a lead of `glyph + " "` is prepended as a piece, never spliced into the string the offsets address.* **No producer in `src/` writes `spans` on a table cell today**, so this clause forbids nothing that happens; it is here because the field exists and a producer may use it tomorrow, and the failure would be silent — a run landing on the wrong characters, with every width correct.
  3. **Every cell's grouped form fits its planned width.** §078's fifth rule is explicit that *a number column never truncates, because half a number is a different number*, and grouping makes a value wider: a column whose `minWidth` was measured against `41208` has five cells and `41,208` needs six. So a column that cannot afford the separators draws without them, which is the whole column stepping back rather than one cell being cut. This is the one clause that can change with the width, and it changes the column and not a row.

  **The point is taken from the grouped text, not the bare text** (I26). `decimalPoints` measures the widest **integer part** in cells, and a separator is part of that — so measuring before grouping would put the column's point one cell left of where its own values sit, for each separator. The order is: plan, then the grouping set, then the points over what will actually be drawn.

  **`measure` is untouched.** Grouping happens inside a width the planner already solved, and clause 3 is what makes that true rather than hoped: a column that would need more cells does not take them, it stops grouping. No row count moves and no column widens, so I9 holds and *appearance animates, geometry never does* is not approached.

---

## 7. Commitments

1. No horizontal scroll at any width (I1).
2. Columns drop by priority, lowest first; display order is preserved (I4).
3. The highest-priority column always survives, truncated if necessary (I3, I5).
4. Every dropped column is reachable in the expanded detail, and dropping makes every row expandable (I2).
5. Column priorities are declared by the surface, not by C11 (I12).
6. A column declaring its longest value as `minWidth` is never truncated (I10).
7. Sort is stable, type-aware, height-neutral, and pairs details with parents (I8).
8. Missing values sort last in both directions (I13).
9. Expansion is block state; detail measures through `measureChild` (I9).
10. Focus is rendered here and owned by C16, and the selection is painted the same way as one more state (I14).
11. C11 holds no state and registers through the public mechanism (I11, I16).
12. Golden frames at 80 / 100 / 120 / 160 pin the layouts (D39) (→ A01 §3).
13. The expand marker fills a column the surface declared, and planning ignores `role` (I15).
14. `planColumns` is pure, total and holds no cache (I7, I11).
15. A table with actions on any row draws one trailing bar; its presence follows the data and its content follows focus (I17).
16. **A window pins the bar's presence, because a presence is as derived as a width** (I18). Both directions: a slice can lose a bar the parent counted and a slice can draw one the parent put somewhere else. Set by `window` and by no producer (→ C09 I25a, MG27).
17. **A window's rows are in display order and are not sorted again** (I19). `sortedRows` is not idempotent over a slice — `kindOf` reads the values present — so a window that re-sorted could reverse itself with every count correct (→ FINDINGS F429).
18. **A window holds at least one row, and both ends of a table are paid for** (I20). The header alone is bodyless and the bar alone cannot exist, so the nearest row is kept and charged to `skipRows` or `dropRows` (→ C09 I26).
19. **The header is padded at the same convention as the rows beneath it** (I21). Where a column begins is a property of the frame and not of a row, and the total is blind to it (→ FINDINGS F1019).
20. **A ceiling applies to a column that can grow, and only to one** (I22). `maxWidth` without `flex` is accepted and inert; the rule is stated rather than enforced, and pinned so that reversing it is a decision (→ FINDINGS F1032, F50).
21. **A bar or spark cell draws its glyph, inside the width the column planned, and the column spends the lead on every series it holds** (I23). C04 obliges the mark and this is where it is spent; the series takes what the mark leaves, the slot is blank on a row with no mark so the runs down a column stay one axis (C12 I20), and the mark is dropped only where it does not fit (→ C04 I6, C12 I25, FINDINGS F1104).
22. **The block reserves a gutter column and spends it per row** (I15, I14, R-SEL-006, §5b). I15 refused a reserved gutter on the grounds that it moves width arithmetic the surfaces state; the arithmetic moves by two cells and is paid, because the alternative the fixtures rule out is a width that follows focus. What I15 still refuses is a synthesised column of the *plan*. The focus column sits outside the plan as the detail indent does, on every row of the block, so nothing inside it moves when a row gains or loses a fact. The selection mark's column is owed, and owed to a **glyph slot** rather than to this component: `▌` is `live`, and a live panel's title already draws it.
23. **A ground runs the block's whole width, gutter included, and an expanded row's detail takes `bgElev`** (I24, I25, §5c, `R-BLK-942`, `R-SEL-006`). The mark is on the row's ground rather than beside it, which is what §044, §082, §072, §043 and §071 draw across three grounds; the detail is inside the transcript with the rows carrying on underneath, which is §082's case against a pushed view.
24. **A column can align on its decimal point** (I26, §099, `R-EXA-099`). `align` was `"left" | "right"`, and §099's complaint is exactly that: *align: r lines up the LAST character*, so `0.0372` and `3e-4` sit in different places. Split at the point, right-align the integer part to the column's point, left-align the rest; a value with no point is all integer part and ends where the point sits, which is what puts `1284` under `0.941`'s point and needs no special case for `3e-4`. The point is **derived** from the widest integer part rather than authored, because a declared one is a number the planner can contradict with nothing to report it.
25. **A column that declares no alignment takes the one its values imply, and the window pins it** (I27, §078, `R-TBL-001`, `R-TBL-002`). `align` was required, so three of the four producers that build columns out of data answered `left` before seeing a value and every derived numeric column was left-aligned. The field is optional now and the default is derived from the cells on I26's argument — a declared kind is a claim the data can falsify with nothing to report it — reusing the sort's existing `numeric | duration | text` classification and its agreement rule. The numeric arm splits on whether any value carries a point, because §078 draws both cases in one table — `rows` flush to the inline end, `metric` on the point — and a first form that made every numeric column `decimal` was falsified by the frame, which put the column's slack after the number. A declared alignment is honoured, so C07's adapter keeps its `left` untouched. The window resolves the alignment over the whole table before slicing, which is I18 and I19's argument a third time: a slice that re-derived it could flip a column between two scroll positions with every count correct (→ FINDINGS F429).
26. **A numeric column groups its thousands, all-or-nothing** (I28, §078, `R-TBL-004`). The separator is the design's own — 29 grouped occurrences of 14 distinct numerals across the fixtures, a comma every time. Three clauses, each over the whole column because a column grouping some rows and not others puts `1,204` above `41208`: the column is numeric (I27); no cell carries `spans`, which are code-unit offsets that splicing would shift; and every grouped form fits the planned width, because §078 is explicit that a number column never truncates. The point is taken from the grouped text, since a separator is part of an integer part (I26). The rule's other half — the unit travels with the value — is already satisfied by shape: the unit is in the cell's text, `asDuration` reads it back out, and the header row the rule forbids does not exist.

---

## 8. Tests

Six tiers. No state machine — C11 is pure over the block.

### Tier 1 — unit

- **T1.1**: eight columns at width 160 → all visible, widths sum with gaps to ≤ 160.
- **T1.2**: the same at 120, 100, 80 → columns drop lowest-priority-first; the surviving set is exactly the documented one at each width.
- **T1.3** (I4): dropping a middle-priority column leaves the rest in declared order.
- **T1.4** (I3): width 20 with a 40-cell highest-priority column → one column, `overflowed` true.
- **T1.5** (I5): at every width from 20 to 200, the width sum invariant holds.
- **T1.6**: flex columns absorb residual width evenly; the remainder goes to the leftmost.
- **T1.7**: `maxWidth` clamps, and the freed width redistributes to other flex columns.
- **T1.8** (I10): a column with `minWidth` equal to its longest value is dropped rather than shrunk.
- **T1.9**: measurement — header + rows for a flat table; + detail for each expanded row.
- **T1.10**: an empty table measures 2, not 0.
- **T1.11** (I8): sorting is stable — equal keys retain input order across a hundred shuffles.
- **T1.12** (I8): sorting a table with three expanded rows → each detail immediately follows its parent.
- **T1.13** (I8): measured height before and after sort is identical.
- **T1.14**: numeric sort orders `2`, `10`, `100` correctly, not lexically.
- **T1.15**: duration sort orders `45s`, `12m`, `2h`, `3d` correctly.
- **T1.16**: missing values sort last ascending *and* descending.
- **T1.17** (I15): a `role: "expand"` column draws `expand` collapsed, `collapse` expanded, and blank on a row that is not expandable at this width. The same table with the role removed draws that column's cell data and no marker anywhere.
- **T1.18** (I17): a table whose rows declare actions measures two rows taller than the same table without them, and **measures the same with focus on a row, with focus elsewhere and with no focus at all**. The three-way equality is the assertion — a bar drawn only when focused satisfies the first half exactly.
- **T1.20** (I19): the whole block sorts to `bravo · alpha · charl` because one cell reads `abc`; the window `[0, 3)` renders the same two rows in the same order, and **the same window with `presorted` cleared renders them reversed** — same count, same height, same `skipRows`. The control is the row: without it the assertion passes against an implementation that never pinned anything.
- **T1.21** (I18): a window covering the bar declares `actionBar: true` although its slice holds no `actions`, and a mid-table window whose slice **does** hold the row with `actions` declares `false`. Both directions, because a pin asserted in one is satisfied by a renderer that always says yes.
- **T1.22** (I20): `[0, 1)` keeps a row and charges it to `dropRows`, and renders the header rather than the empty message; `[n−1, n)` keeps a row and charges it to `skipRows`, with `showHeader: false`. Neither end of a table is a row, and the two are paid at opposite ends.
- **T1.23** (I14): a table handed `selected` naming `a`, `b`, `c` with the head on `c` paints `a` and `b` in `default` over the selection wash — a span carrying its own tone inside `b` included, because the mutation that kept span tones on a selected row failed nothing until a fixture had one — and `c` in `accent`, and the row above `a` unwashed — **which rows, not how many**, because a wash on the wrong three rows satisfies every count. Handed the same pairs under a block id that is not its own it paints exactly what it paints with no focus. And `selected` naming the head alone is **byte-identical** to `selected` absent: the sentinel, measured. At `colourDepth: 1` the two washed rows carry `7` (reverse video) and the head does not.
- **T1.24** (I14): `pills` paints the focused chip `accent`, a selected one washed, and the same chip under another block's focus in its own tone. The control is the frame at HEAD, where a focused chip drew as an unfocused one.
- **T1.25** (I22): `planColumns` over five column shapes at every width from 1 to 200 — 1,000 plans — is **deeply equal** with and without `maxWidth` on the columns that declare no `flex`. The control is the same cap on a *flex* column, where the plan does move (20 cells against 59), so the row cannot pass by measuring a function that ignores `maxWidth` altogether. A change that made `maxWidth` imply growth fails this, which is the point: it is a decision to revisit deliberately, as T2.7 is for the cache.
- **T1.26** (I23): a table cell carrying `bar`, `tone: "error"` and `glyph: "warn"` in a column planned at 17 → **exactly 17 cells**, carrying the mark and the whole number, with the mark its own run so a span's offsets stay offsets into the text. The control is a table holding no marked cell at all, where the same value draws a run two longer — which is what says the lead was taken from the series rather than added to the column. Asserted at `colourDepth: 1`, because the tone is unavailable there and the mark is the whole of what separates a busy container from a quiet one.
- **T1.28** (I23): a two-row table, one cell marked and one not, in one column → **both runs are the same length**, and the unmarked cell's lead is blank. The assertion is the equality rather than either number: a per-cell lead gives the marked row a shorter run, every count right, and C12 I20's *99 draws 37 and 100 draws 36* is the same defect in the other allowance. The control is the same table with neither cell marked — both runs two longer, so the row cannot pass by measuring a column that reserves nothing.
- **T1.27** (I23): the same cell at every planned width from 1 to 20 → **exactly the planned width at all twenty**, and the mark is present at every width that holds it and absent at the one that does not. The boundary is where the lead stops fitting and nowhere else: at 3 the cell is `▲ …` against an untoned `10…`, which is C12 I20's own ruling in the other arm — a truncated number is a different number — and the row is a sweep rather than a chosen width because a single one is the judgement this invariant stopped making.
- **T1.29** (I14, §5c): a focused row's ground **opens at the block's edge and covers the focus mark's cell** — the mark's span carries the same background as the cells beside it, at `focusGround` and again with the row inside a selection at `selection`, so the assertion is over the ground rather than over one of them. The control is the row at rest, whose gutter carries no background at all: without it the row passes against a renderer that grounds every gutter unconditionally. At `colourDepth: 1` the mark keeps `accent` and there is no ground to run under it, which is the rung the divergence never reached.
- **T1.30** (I25): an expanded row's detail lines carry `surface.bgElev` across the block's whole width, gutter included, and **the row after the detail carries no ground** — the second half is the assertion §082 rests on, because a ground that leaked past the detail would draw the pushed frame the section exists to refuse. The control is the same table with `expanded` cleared, where those lines are absent entirely rather than merely unpainted. Asserted with the row **not** focused, so the detail's ground is shown to follow expansion rather than to be the head's ground spilling downward.
- **T1.19** (I17): the bar carries the focused row's action labels; with focus on a different row it carries that row's; with no focus it is blank and the height is unchanged. The blank case is what stops the row being conditional in the renderer while looking unconditional in the measurer.
- **T1.31** (I27, §078): one table, four columns declaring no alignment — integers, decimals, durations `12m`/`1h 12m`/`2h ago`, and a mixed column holding `200`, `404` and `timeout` — resolve to `right`, `decimal`, `right` and `left`, which is §078's own table: `rows` flush and `metric` on the point. The mixed column is the row that matters: it is the agreement rule doing alignment's work rather than the sort's, and a classifier that took the majority would right-align it. **The control is a fifth column declaring `left` over the same integers**, which stays `left` — without it the row passes against an implementation that ignores a declaration, and that is exactly what would reach into C07's adapter.
- **T1.32** (I27, I26): a column of integers declaring no alignment renders **byte-identical** to the same column declaring `align: "right"`, at every width from 20 to 120 — the derivation's integer arm asserted against the thing it is supposed to equal. **The control is one fractional value added to the column, where the two must differ and the derived rendering must equal a declared `decimal` instead.** That control is what overturned this invariant's first form: it was written expecting equality throughout, and the difference it found — the column's slack landing after the number rather than before it — is the whole of why the numeric arm splits.
- **T1.35** (I28, §078): a numeric column of `1204`, `41208`, `88` and `10000` renders `1,204`, `41,208`, `88` and `10,000`, and the same values in a column holding one `timeout` render bare — the second half is the clause doing the work, because that column is text by I27 and never reaches the grouping at all. **The control is the same numeric column one cell too narrow for its separators**, which draws bare: without it the row passes against an implementation that groups and then truncates, which is §078's *half a number is a different number*.
- **T1.36** (I28, C04 I86): a numeric column whose cells carry `spans` draws **ungrouped**, and the spans still address the characters they named — asserted on the run boundaries rather than on the text, because a row checking only the text passes against an implementation that groups and shifts every offset silently. The control is the same column with the spans removed, which groups: without it the row cannot tell the clause from a grouping that never fires.
- **T1.37** (I28, I26): a `decimal` column of `1204.5` and `88.25` puts its point where the **grouped** integer part ends, so `1,204.5` and `88.25` align on their points with the separator inside the measurement. The control is the same column with grouping suppressed by clause 3, where the point moves left by one cell — which is the defect this would otherwise be, and it is invisible to every width assertion.
- **T1.34** (I27, C04 §…): a markdown table — the producer that hardcoded `left` and never read a row — with a `rows` column of `1204` and `88` renders them **flush to the column's inline end**, and its header stays where a left column's does. This is the only row in the tier that goes through a producer rather than a hand-built block, and it is the answer to the awkward measurement: the derivation moved **no** golden frame, because every table in that corpus either declares its alignment or holds text. A change that fails nothing is a finding about the tests, and this is the row that was missing rather than a licence.
- **T1.33** (I27, I19, F429): a four-row table whose `status` column holds `200`, `404`, `503` and `timeout`, windowed to its first three rows → the column renders **left**-aligned, the whole table's answer, and not the `decimal` its slice alone would derive. The control is the whole table rendered unwindowed, which must agree. The defect this pins is invisible to every count: the slice's widths, heights and `skipRows` are all correct and the column has silently changed shape between two scroll positions.

### Tier 2 — contract / interface

- **T2.1** (I7): `planColumns` over a fuzz corpus — zero columns, one column, fifty columns, zero width, negative width, duplicate priorities — returns a valid plan, never throws.
- **T2.2** (I6): no plan in the corpus contains a negative or fractional width.
- **T2.3** (I9): the C09 generic measurement suite passes for `table` at all seven widths, flat and with every expansion combination on a five-row fixture.
- **T2.4** (I2): for every width where a column drops, that column's key appears in every row's expanded detail.
- **T2.8** (I2, the gap): a table whose rows declare **no** `detail`, rendered at a width where two columns drop → every row is expandable and the dropped values are present. Without this, narrow terminals silently destroy data.
- **T2.5** (I16): `table` is registered via `registry.register`, and removing that call removes the kind entirely — no built-in fallback path.
- **T2.9** (I15): the plan for a column set is deeply equal with and without `role: "expand"`, at every width in the corpus — planning cannot see the role.
- **T2.6** (I11): a source scan finds no mutable module state in `table/` (A03 SS24).
- **T2.7** (I7, I11): calling `planColumns` twice on the same input returns deeply equal plans that are **not the same object** — the absence of a cache, asserted rather than assumed. A memo added later fails this, which is the point: it is a decision to revisit deliberately, not to reach for.

- **T2.10** (I12): one dataset under **two declarations** drops in two different orders. This is the only shape that reaches the invariant: rows asserting *columns drop lowest-priority-first* pass identically whether the number came from the surface or from a heuristic over the data, because the data is the same in both worlds — and an engine inferring priority would give the same answer twice.
- **T2.10b** (I12): nothing under `src/presentation/table/` **writes** a priority; every mention is a read of `column.priority`. The behavioural row is blind to a heuristic that happens to agree with the declaration on this corpus, and a guessing engine would guess differently as data changed, so the drop order would stop being reviewable.
- **T2.11** (I15, I14, §5b): the focus gutter column is reserved on **every** row — header, body and residue — whatever its state. One table is rendered four ways — nothing, focused, selected, focused and selected — and the **content column is the same integer in all four**, which is the assertion; the marks differ and the edge does not. A reservation that appeared with the fact renders identically in the focused frame and differs only here, so a row asserting the mark's presence proves nothing about the mechanism.
- **T2.12** (I14, C26 I16): the sentinel is distinguished by **kind**. `selected` absent paints the head on the focus ground; `selected` naming the head **alone** paints it on the selection ground and keeps `▸` — a real one-element selection, which R-SEL-006 requires and a test on the extent's size would have painted as focus. The two are asserted **different**, which is the row that the previous form of T1.23 had backwards.

- **T2.13** (I14, C10 I48, §4k.2 row 1, F1240): **a focused row and a selected row keep every cell's own tone.** On a table whose `state` cell is `tone: "error"`, the failed cell's ink at 24-bit is the theme's composed `tone.error` **for the ground the row took** — `surface.focusGround` under focus, `surface.selection` under selection — and not `accent` or `default`; a span's own tone survives the same way. Asserted through `inkOn` rather than against a hex, so the row is the rule and not the theme's current values. **And on a banded theme it is the band's single ink**, which is the same rule and not an exception (R-THM-003).
- **T2.14** (I26, §099): §099's own four-row figure, drawn back — `0.0372`, `0.941`, `3e-4`, `1284` in one `align: "decimal"` column → every point sits in the same cell, `1284` **ends** in that cell, and `3e-4` ends there too with no rule of its own. The section's figure is the fixture, so an alignment that is self-consistent and different fails here rather than passing as a variant. The control is the same four under `align: "right"`, where the points are in **three** different columns — which is the defect §099 names, asserted rather than described.
- **T2.15** (I26, C04 I30, `R-TBL-005`): the derived point and the fallback — the column's point is the widest integer part over its own cells, so adding a row with a wider integer moves every other cell and nothing else; and a column with fewer than `max(integer) + max(fraction)` cells **right-aligns every cell**, which is asserted as the whole column agreeing rather than as any one cell's position. That second half is the row the frame produced: the first implementation clamped each lead to its own slack and drifted by a cell, which every count agreed with. `measure` is asserted equal across `left`, `right` and `decimal` on the same table, so alignment never asks for width.

### Tier 3 — edge cases

- **T3.1**: zero columns → renders the empty message; does not throw.
- **T3.2**: one column wider than the terminal → truncated, `overflowed` true, still readable.
- **T3.3**: all columns sharing one priority → dropped in reverse declared order, deterministically.
- **T3.4**: a column whose `minWidth` exceeds `maxWidth` → `minWidth` wins, silently. An earlier draft said "logged", which nothing at L1 can do: SS33 bans `console.*` across `src/` and C11 is handed no debug sink. A contradictory `ColumnDef` is a surface defect and belongs to whatever validates surfaces, not to a planner that must stay total (I7).
- **T3.5**: a cell containing CJK text → planned width counts 2 cells per glyph (C09 `cells()`).
- **T3.6**: a cell containing a ZWJ emoji → counted as one cluster; truncation never splits it.
- **T3.7**: a cell longer than its planned width → truncated with the capability-correct marker, and measurement is unaffected.
- **T3.8**: a row with `detail` but `expanded: false` → detail contributes nothing to height.
- **T3.9**: every row expanded on a 500-row table → measurement completes within budget and the total is exact.
- **T3.10**: detail containing a nested table → measured through `measureChild`; no recursion into C11's own planner with the outer width.
- **T3.11**: detail containing a block kind registered by the app → measured correctly, proving the injection is generic.
- **T3.12**: `sort` naming a non-existent column → ignored, original order retained, no throw.
- **T3.13**: `sort` on a non-sortable column → ignored.
- **T3.14**: a table where every cell in a column is empty → the column still plans, and sorting on it is a stable no-op.
- **T3.15**: two rows sharing an `id` → rejected by C04's `validateDocument`. Three things address a row by id and all three are ambiguous without it: `merge` upserts by row id (C04 I9), `ctx.focus` names a row by id (I14), and a rendered row is keyed by it. An earlier draft cited C04 I8, which is `applyPatch` purity and says nothing about identity.

  **This check does not exist yet, and C04 I14 is not it.** I13 covers *block* ids, nested children included, and `validateDocument` implements exactly that — table rows are not blocks, so two rows sharing an `id` currently validate clean. Row-id uniqueness is C04's to add, on the same reasoning as I13 and beside it; C11 cannot check it without duplicating a boundary rule one layer up (C09 I6's argument, one directory over). Raised from here because C11 is the first component to depend on it.
- **T3.18**: no column declares `flex` and the table is narrower than the terminal → residual width is unused; columns are not stretched.
- **T3.19** (I15): a table with a data column keyed `expand` and no `role` → the cell's own text renders and no marker is drawn. The collision a reserved key would have caused, asserted rather than avoided by convention.
- **T3.20** (I21): at `ambiguousWidth: "wide"`, a table whose column labels carry an Ambiguous character (`Δt` left-aligned, `°C` right-aligned) → the header and both rows beneath it begin every left-aligned column at the same cell, and each column's extent holds that column's text. Asserted as the whole frame at once, because a header compared against one row is an assertion both lines could be wrong in. **The total sees nothing**: every line is 44 cells before and after, so the row that would have caught this is the one nobody writes. The second arm is the control — ASCII labels over the same data at the same width move nothing — so the subject is the label rather than the renderer, and `°C` rather than `µs` because U+00B5 is *not* Ambiguous and a fixture using it left the `padStart` site covered by a character that cannot move.
- **T3.21** (I23): the same toned cell at `"narrow"` and at `"wide"` in a column planned at 17 → 17 cells at both, with the mark present and the value whole at both. **Not *the series is two shorter*, which is arithmetic rather than an observation** once the cell is 17 and ends with the same number — the first draft asserted it and it cannot fail. The three that are independent are the width, the mark and the value: a fix that made room by dropping the number would hold the first two. **Stated blind spot**: the lead cannot currently differ between the two, because C09 I48 resolves an Ambiguous slot to its ASCII half at `"wide"` so every glyph is one cell either way — the row asserts the cell holds its plan across a convention change, and the day a token's two renderings differ in width it is C09 T2.5 that goes red, not this. Written because the arm it covers is the one C12 I24's four crooked gutters were made of, and a row here that could not fail at all would be the vacuity A03 §2 names.
- **T3.16**: 10,000 rows → planning stays sub-millisecond; measurement is linear.
- **T3.17**: width changes between measure and render → the plan is the new width's. With no cache there is nothing to go stale, and this asserts the property the memo key was there to protect: a second call at a different width plans for that width, and the first plan is not retained anywhere.

### Tier 4 — integration

- **T4.1** (with C09): registration, measurement and rendering behave identically to a built-in kind under the generic suite.
- **T4.2** (with C09, C02): under `unicode: "ascii"`, planned widths and measured heights match the Unicode case exactly.
- **T4.3** (with C10): the same table in both themes and at all four colour depths has identical geometry.
- **T4.4** (with C14): expanding a row shifts subsequent blocks by exactly the measured delta; no drift over fifty expand/collapse cycles.
- **T4.5** (with C14): sorting does not change scroll position, because height is invariant.
- **T4.6** (with C16): `focusableRowIds` matches the rendered rows in order, so arrow navigation lands where the user sees focus.
- **T4.7** (with C04): expanding patches the document rather than mutating external state; the frozen block records its expansion.
- **T4.8** (with C22, C26 I16): in a painting session, `↓ ⇧↓ ⇧↓` over a four-row table leaves `alpha` and `bravo` washed, `charlie` in `accent` and `delta` in `default` — read from the screen, per row, against the tones the theme resolves. Then `↓` collapses: `delta` is the head and nothing is washed. **The row this seam exists for**: T1.23 passes with `focusFor` returning the head alone, because the renderer is handed the list by the test; only a frame from a session can say whether anything writes it (C22 I58's pairing rule).

### Tier 5 — e2e

- **T5.1** (D39): golden frames at 80 / 100 / 120 / 160 for a representative table, flat and expanded, in both themes. **The layouts are reviewed, not emergent** — priority alone produces arrangements nobody designed.
- **T5.2**: resizing a real terminal from 160 to 60 and back → columns drop and return, the same set at the same widths, no flicker, no lost data.
- **T5.3**: at 60 columns, every field dropped from the header is present in an expanded row.
- **T5.4**: keyboard navigation through a 200-row table — focus moves, expands, collapses — with no drift between focus position and viewport.

### Tier 6 — fail-on-revert
- **T6.19** (I15, §5b): dropping the gutter column fails **T2.11** on the content column, in all four frames at once — which is what distinguishes it from a revert that dropped only the mark and left the reservation.
- **T6.20** (I14, C26 I16): testing the extent by size rather than by presence — `selected.size > 1` — fails **T2.12**: a one-element selection paints as focus and the sentinel is pinned in the test instead of in the type.
- **T6.21** (I15, §5b, C09 I82): emitting the header outside `emit` — its own `paint(clampSpans(...))` — fails **T2.11** on the header's column against the body's. **The row did not catch it on the mutation pass's first run** (F1237), and the finding is the shape rather than the gap: T2.11 held `Name` in a set it compared *across* the four focus states, and a header that leaves the reservation moves in all four **together**, so a comparison indexed by state is blind to it by construction. A comment saying the header is in the set is not an assertion that it is. What catches it is the header's edge against the body's, taken inside each frame.
- **T6.22** (I15, §5b): dropping the reserved lead from a detail child's row — `fitRow(pad + line, inner)` without `blank` — fails **T2.11** on the detail's own indent. **This survived two forms of the row** (F1238): the measurement invariant counts rows and says nothing about a column, so T2.3 cannot see it; and an assertion that the reserved cells are blank is satisfied by a frame that never reserved them, because the detail's *own* indent is spaces too. Two blank mechanisms abut, and slicing cannot tell which one it is holding. The column is what moves — a detail row starts strictly right of the row it belongs to — and that is the assertion.
- **T6.23** (I14, R-STA-002): giving focus the selection ground — `isHead ? wash` — fails **T2.12**. This is the mechanism the tree had before the design: one ground, with ink to tell focus and selection apart, which is why `focusGround` shipped with a contrast gate and no reader.
- **T6.24** (I15, §5b): taking a detail's height at the outer width — `const inner = width` inside `detailHeight` — fails **T2.3**, the generic measurement suite at seven widths flat and expanded. The subtraction is done **once, there**, because four callers ask for a detail's height and a subtraction at each is four chances to disagree by two cells; it was three of four for one commit and `window-height` reported 353 failures of 42.

Anchors in `tools/mutate/runs/c11-focus-gutter.mjs`, with its control removing the lead from `emit` — the mechanism rather than a value, because `GUTTER_CELLS` is derived from a glyph's width and could legitimately move. Six mutations, six caught; two of them only after the rows they indicted were rewritten.

- **T6.1** (I1): introducing horizontal scroll → T1.5's width invariant fails.
- **T6.2** (I2): dropping a column without adding it to detail → T2.4 fails.
- **T6.12** (I2): keeping expandability tied to a declared `detail` → T2.8 fails, and dropped fields become unreachable.
- **T6.3** (I4): reordering columns by priority for display → T1.3 fails.
- **T6.4** (I3): allowing every column to drop → T1.4 fails and the table renders empty.
- **T6.5** (I8): an unstable sort → T1.11 fails.
- **T6.6** (I8): sorting rows without their details → T1.12 fails — the mockup's original bug.
- **T6.7** (I9): ignoring expanded detail in measurement → T2.3 and T4.4 fail with viewport drift.
- **T6.8** (I10): truncating a status column → T1.8 fails.
- **T6.9** (I11): caching sort order in module state → T2.6 fails.
- **T6.10** (I16): making `table` a privileged built-in → T2.5 fails, and the extension path stops being exercised by the framework itself.
- **T6.11**: lexical sort on a numeric column → T1.14 fails.
- **T6.13** (I15): recognising the expand column by `key === "expand"` rather than by `role` → T3.19 fails, and a far side returning a field of that name loses it.
- **T6.14** (I15): letting `planColumns` widen or reserve for a `role: "expand"` column → T2.9 fails, and every drop table in the S-series is off by the same two cells.
- **T6.15** (I11): memoising `planColumns` on `(columns, width)` → T2.7 fails, and T2.6's scan finds the cache.
- **T6.17** (I14): `focusFor` returning the head alone → **T4.8**'s three-row assertion fails and T1.23 passes, which is the split that says the field had no writer. Washing the head as well → T1.23's head assertion fails and its byte-identical control fails with it, because a one-element extent now differs from none. Comparing `selected` against the block's id before filtering → a selection whose head sits in a sibling block paints nothing in the table, and T1.23's sibling arm fails.
- **T6.18** (I23): restoring the early `return` in the `bar` branch before the glyph is read → T1.26 fails on the mark and the golden `table-value-bar` moves, which is the shipped behaviour this replaces. Handing `valueBar` the full `planned.width` while still drawing the lead → the cell is 19 cells in a 17-cell column and T1.26's length assertion fails, which is the plausible half-fix: the mark appears and the row beneath it starts two cells right. Dropping the mark on a width that holds it — the `room > 0` guard the first draft of I23 asked for — → T1.27's sweep fails at 3, which is the ruling the implementation falsified. Spending the lead per cell rather than per column → **T1.28 fails and T1.26 passes**, which is the split that says the defect is between two rows and not inside one; it is also the whole of what I23's second form did, and what the `examples/docker` constant it was read against already said it should not (→ C12 I20).
- **T6.16** (I17): drawing the bar only when a row is focused → T1.18's three-way equality fails. The revert is the plausible one — a blank row looks like waste, and removing it is correct in every frame the reader is looking at. What it breaks is a frame after a keystroke that changed no data, which is where C14 answers from a cache `rev` never invalidated.

---

- **T6.25** (I14, F1240): restoring the drop-to-one-ink map in `rowSpans` — forcing a focused or selected row to `accent` / `default` and stripping its runs' tones — → **T2.13 fails**, and the composition frame for case 1 moves at all three rungs.

- **T6.27** (I28): grouping per cell rather than per column → T1.35's mixed arm fails while its first arm passes, which is the split that says the property is between two rows. Measuring the point before grouping → **T1.37 alone**, and no width assertion anywhere moves. Dropping clause 3 → T1.35's control fails and the column truncates a number. Dropping clause 2 → T1.36 fails on the run boundaries and passes on the text, which is the silent half.
- **T6.26** (I27): four mutations, run by hand on landing, and each fell to the row it should. Making the numeric arm `decimal` unconditionally — the invariant's first form — → **T1.31 and T1.32**. Making it `right` unconditionally → **T1.31 and T1.32** again; the two are separated by *which* assertion falls rather than by which row, T1.32's sweep under the first and its control under the second, and that is what the row text says rather than what the run reports. Dropping the window's pin so a slice re-derives → **T1.33 alone**, which is F429's shape isolated to the one row that can see it. Honouring the derived kind **over** a declared `align` → **T1.31, T1.32 and T1.33 together**, because every fixture here declares something somewhere; T1.31's control is the one that names the property, which is what keeps C07 untouched.

## 9. Out of scope

| Not here | Where |
|---|---|
| Which columns a surface declares, and their priorities | The S-series |
| Arrow keys, expand keybindings, focus movement | C16 |
| Action dispatch on a focused row | C11 renders them; C16 fires them |
| Scroll position and virtualisation | C14 |
| Tone → colour | C10 |
| Filter pills | A separate `pills` block (C09) |
