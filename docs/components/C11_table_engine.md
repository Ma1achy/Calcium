# C11 — Table engine

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
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

`focusableRowIds` is here rather than in §5 because C16 imports it: focus is rendered by C11 and owned by C16 (I15), so the router needs the ordered list of rows it may move between, and that list is a function of the block alone.

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
7  clamp each column to maxWidth where declared; redistribute what that frees
8  if no column is flex, residual width is left unused — the table renders
   narrower than the terminal rather than stretching columns arbitrarily
```

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

**The indicator is ` ↑` / ` ↓` appended to the active column's header** (A01 Appendix A.4). Its two characters are C09's, not C11's: C09 §4 owns both renderings of every character that enters a frame and the 1:1 width rule that makes ASCII degradation height-preserving, so they are a rôle in its glyph set (`^` and `v`) rather than a literal here. The indicator is appended *inside* the column's planned width, so a header whose label then exceeds that width truncates — geometry is the plan's, and an indicator that widened a column would make the header disagree with the rows beneath it.

---

## 5. Expansion and focus

`expanded` is per-row state in the block. Expanding patches the document (C04 §4); it is never external state, which is what keeps `measure` pure.

```
height = 1 (header)
       + rows
       + Σ over expanded rows of measureChild(detailBlocks, width − 2)
```

Empty tables measure `1 + 1` — header plus the empty message, never zero.

Detail is indented by 2 cells, so it measures at `width − 2`. Detail blocks are measured through the injected `measureChild`, so a row can expand to reveal a plot, a progress bar and actions without C11 knowing what those are.

**Focus is rendered, not owned.** `ctx.focus` names the focused row; C11 renders it distinctly and surfaces its actions. Which row has focus, and what the arrow keys do, is C16's. C11 exposes `focusableRowIds` so the router has something to move between.

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
- **I13** — Column priority is declared by the surface, never inferred by C11. A table engine guessing which column matters would guess differently as data changed, and the drop order would stop being reviewable.
- **I14** — Missing values sort last in both directions. Not first when ascending and last when descending — last either way, because a null is an absence of rank rather than the bottom of one, and a reader sorting to find the worst case should not find blanks.
- **I15** — Focus is rendered by C11 and owned by C16. C11 holds no focus state; it draws what it is handed, which is what keeps I11 true for the one piece of state a table most looks like it should own.
- **I16** — The expand marker is drawn only into a column declaring `role: "expand"`, and `planColumns` never reads `role`. A table declaring no such column shows no marker; C11 neither synthesises a column nor reserves a gutter, because either would change width arithmetic the surfaces already state.
- **I12** — C11 registers through C09's public `register`; it is not privileged.

---

## 7. Commitments

1. No horizontal scroll at any width (I1).
2. Columns drop by priority, lowest first; display order is preserved (I4).
3. The highest-priority column always survives, truncated if necessary (I3, I5).
4. Every dropped column is reachable in the expanded detail, and dropping makes every row expandable (I2).
5. Column priorities are declared by the surface, not by C11 (I13).
6. A column declaring its longest value as `minWidth` is never truncated (I10).
7. Sort is stable, type-aware, height-neutral, and pairs details with parents (I8).
8. Missing values sort last in both directions (I14).
9. Expansion is block state; detail measures through `measureChild` (I9).
10. Focus is rendered here and owned by C16 (I15).
11. C11 holds no state and registers through the public mechanism (I11, I12).
12. Golden frames at 80 / 100 / 120 / 160 pin the layouts (D39) (→ A01 §3).
13. The expand marker fills a column the surface declared, and planning ignores `role` (I16).
14. `planColumns` is pure, total and holds no cache (I7, I11).

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
- **T1.17** (I16): a `role: "expand"` column draws `expand` collapsed, `collapse` expanded, and blank on a row that is not expandable at this width. The same table with the role removed draws that column's cell data and no marker anywhere.

### Tier 2 — contract / interface

- **T2.1** (I7): `planColumns` over a fuzz corpus — zero columns, one column, fifty columns, zero width, negative width, duplicate priorities — returns a valid plan, never throws.
- **T2.2** (I6): no plan in the corpus contains a negative or fractional width.
- **T2.3** (I9): the C09 generic measurement suite passes for `table` at all seven widths, flat and with every expansion combination on a five-row fixture.
- **T2.4** (I2): for every width where a column drops, that column's key appears in every row's expanded detail.
- **T2.8** (I2, the gap): a table whose rows declare **no** `detail`, rendered at a width where two columns drop → every row is expandable and the dropped values are present. Without this, narrow terminals silently destroy data.
- **T2.5** (I12): `table` is registered via `registry.register`, and removing that call removes the kind entirely — no built-in fallback path.
- **T2.9** (I16): the plan for a column set is deeply equal with and without `role: "expand"`, at every width in the corpus — planning cannot see the role.
- **T2.6** (I11): a source scan finds no mutable module state in `table/` (A03 SS24).
- **T2.7** (I7, I11): calling `planColumns` twice on the same input returns deeply equal plans that are **not the same object** — the absence of a cache, asserted rather than assumed. A memo added later fails this, which is the point: it is a decision to revisit deliberately, not to reach for.

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
- **T3.15**: two rows sharing an `id` → rejected by C04's `validateDocument`. Three things address a row by id and all three are ambiguous without it: `merge` upserts by row id (C04 I9), `ctx.focus` names a row by id (I15), and a rendered row is keyed by it. An earlier draft cited C04 I8, which is `applyPatch` purity and says nothing about identity.

  **This check does not exist yet, and C04 I14 is not it.** I14 covers *block* ids, nested children included, and `validateDocument` implements exactly that — table rows are not blocks, so two rows sharing an `id` currently validate clean. Row-id uniqueness is C04's to add, on the same reasoning as I14 and beside it; C11 cannot check it without duplicating a boundary rule one layer up (C09 I6's argument, one directory over). Raised from here because C11 is the first component to depend on it.
- **T3.18**: no column declares `flex` and the table is narrower than the terminal → residual width is unused; columns are not stretched.
- **T3.19** (I16): a table with a data column keyed `expand` and no `role` → the cell's own text renders and no marker is drawn. The collision a reserved key would have caused, asserted rather than avoided by convention.
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

### Tier 5 — e2e

- **T5.1** (D39): golden frames at 80 / 100 / 120 / 160 for a representative table, flat and expanded, in both themes. **The layouts are reviewed, not emergent** — priority alone produces arrangements nobody designed.
- **T5.2**: resizing a real terminal from 160 to 60 and back → columns drop and return, the same set at the same widths, no flicker, no lost data.
- **T5.3**: at 60 columns, every field dropped from the header is present in an expanded row.
- **T5.4**: keyboard navigation through a 200-row table — focus moves, expands, collapses — with no drift between focus position and viewport.

### Tier 6 — fail-on-revert

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
- **T6.10** (I12): making `table` a privileged built-in → T2.5 fails, and the extension path stops being exercised by the framework itself.
- **T6.11**: lexical sort on a numeric column → T1.14 fails.
- **T6.13** (I16): recognising the expand column by `key === "expand"` rather than by `role` → T3.19 fails, and a far side returning a field of that name loses it.
- **T6.14** (I16): letting `planColumns` widen or reserve for a `role: "expand"` column → T2.9 fails, and every drop table in the S-series is off by the same two cells.
- **T6.15** (I11): memoising `planColumns` on `(columns, width)` → T2.7 fails, and T2.6's scan finds the cache.

---

## 9. Out of scope

| Not here | Where |
|---|---|
| Which columns a surface declares, and their priorities | The S-series |
| Arrow keys, expand keybindings, focus movement | C16 |
| Action dispatch on a focused row | C11 renders them; C16 fires them |
| Scroll position and virtualisation | C14 |
| Tone → colour | C10 |
| Filter pills | A separate `pills` block (C09) |
