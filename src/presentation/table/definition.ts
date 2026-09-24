/**
 * `tableDefinition` — the pair C09's registry holds, and the one that must agree
 * to the row (C09 I1).
 *
 * **Registered, not privileged** (I16, T2.5). This definition is not in
 * `blocks/defaults.ts`: it reaches the registry through the same public
 * `register` an app-defined kind uses, and deleting that call removes the kind
 * with no fallback path. C12 and C25 do the same, and three registrants is what
 * makes the extension mechanism real rather than a claim (C09 §3).
 *
 * The height, from C11 §5:
 *
 *     height = 1 (header)
 *            + rows
 *            + Σ over expanded rows of measureChild(detailBlocks, width − 2)
 *
 * `width − 2` is `insetWidth`, C04's function, not an arithmetic expression
 * repeated here. C04 §5's comment names this exact case: C11 measured its detail
 * at `w - 2` while nothing said so, and a second component writing `w - 1` is a
 * drift that shows only once a child wraps.
 */
import { NO_SPAN } from "../../data/viewmodel/index.js";
import { atLeastOne, insetWidth, normaliseWidth, sequenceHeight } from "../../data/viewmodel/index.js";
import type { Block, MeasureFn, Table, TableRow } from "../../data/viewmodel/index.js";
import { cells } from "../text.js";
import { fitRow, rowCells } from "../rows.js";
import { glyphCells, glyphFor } from "../blocks/glyphs.js";
import { background, based, clampSpans, focusStyle, groundSequence, paint, selectionStyle, tone, withBackground, type Span } from "../blocks/paint.js";
import type { BlockDefinition, NavElement, Rendered, RenderContext, Windowed } from "../blocks/types.js";
import { decimalEnds, decimalPoints, emptySpans, headerSpans, markedSeriesColumns, rowSpans } from "./cells.js";
import { columnAlignments, groupingColumns, unknownColumns } from "./kind.js";
import { detailBlocks, isExpandable } from "./detail.js";
import { planColumns, type PlannedColumns } from "./plan.js";
import { sortedRows } from "./sort.js";

/**
 * The columns the plan is made from: the declarations, with every number or
 * duration column's `minWidth` raised to its widest bare value (C11 I31,
 * `R-TBL-005`).
 *
 * **The planner stays pure** (I7) and I10 does the work: a column whose
 * `minWidth` equals its longest value is shown whole or dropped, never cut —
 * *half a number is a different number*. Bare and not grouped, because I28
 * decides grouping from the plan. A cell's glyph lead counts, since it is
 * drawn inside the planned width (I23).
 *
 * **Memoised on the block**, which is immutable: `measure`, `width`, `render`
 * and the row detail each plan, and four walks of every cell for one answer is
 * the cost this avoids. A window's block is a new object whose declarations
 * already carry the table's figure (`window` pins it), so its own walk can only
 * agree.
 */
const EFFECTIVE = new WeakMap<Table, Table["columns"]>();

function effectiveColumns(block: Table): Table["columns"] {
  const known = EFFECTIVE.get(block);
  if (known !== undefined) return known;
  const numbers = unknownColumns(block);
  // **Under `wide`**, since `measure` receives no capabilities and every reader
  // must plan the same columns. For a minimum that is the safe direction:
  // over-counting drops the column one width early, and under-counting cuts a
  // number, which is the defect itself.
  const ambiguous = "wide";
  const columns = block.columns.map((c) => {
    if (!numbers.has(c.key)) return c;
    let widest = 0;
    for (const row of block.rows) {
      const cell = row.cells[c.key];
      if (cell === undefined || cell.text.trim() === "") continue;
      const lead = cell.glyph === undefined ? 0 : glyphCells(cell.glyph) + 1;
      widest = Math.max(widest, lead + cells(cell.text.trim(), ambiguous));
    }
    return widest > c.minWidth ? { ...c, minWidth: widest } : c;
  });
  EFFECTIVE.set(block, columns);
  return columns;
}

/** The one plan every reader takes (I31): `measure`, `width`, `render`, `window` and the row detail. */
function plannedColumns(block: Table, width: number): PlannedColumns {
  return planColumns(effectiveColumns(block), width);
}

/**
 * Whether the action bar is drawn (I17).
 *
 * **The data decides, never focus.** `measure` does not receive focus at all
 * (C04 §5), so a bar whose *presence* followed focus would give a block two
 * heights for one document — and focus moves without `rev` moving, so C14's
 * cache would keep answering with the old one. C09 I1 broken in the one way
 * measurement cannot catch, because each half is right on its own.
 */
function hasActionBar(block: Table): boolean {
  // **The pin first, because a window's slice is not the document** (I18). A
  // presence derived from `rows` moves in both directions under a slice: one
  // that drops the only row declaring `actions` loses two rows the parent
  // counted, and one that keeps a row mid-table draws a bar where the parent
  // has data. `window` is the only writer (MG27).
  return block.actionBar ?? block.rows.some((r) => (r.actions ?? []).length > 0); // cells-ok
}

/** Whether the header row is drawn. `showHeader` defaults to true (C04 §3). */
function hasHeader(block: Table): boolean {
  return block.showHeader !== false;
}

/**
 * Whether there is anything to lay out in columns.
 *
 * False for a table with no rows *and* for a table with no columns: with nothing
 * to put in them, N blank rows say less than the empty message does (T3.1). Both
 * cases then measure and render the same single message row, which is what keeps
 * the two halves agreeing about a shape neither was designed for.
 */
function hasBody(block: Table): boolean {
  return block.columns.length > 0 && block.rows.length > 0; // cells-ok
}

/** The rows an expanded row's detail occupies at this width. */
function detailHeight(
  block: Table,
  row: TableRow,
  width: number,
  measureChild: MeasureFn,
): number {
  if (row.expanded !== true) return 0;
  // **The gutter comes off here and nowhere else** (I15). Four callers ask for a
  // detail's height — `measure`, `unitsOf`, `window` and the render — and a
  // subtraction at each of them is four chances to disagree by two cells, which
  // is the disagreement `measure(block, width) == rows rendered` forbids. It was
  // three of four for one commit, and `window-height` caught it at 353 of 42.
  const inner = bodyWidth(width);
  const plan = plannedColumns(block, inner);
  // A sequence, so a detail block declaring `gapBefore` contributes its blank row
  // here exactly as it would at a document's top level (C04 §3a).
  return sequenceHeight(detailBlocks(block, row, plan), insetWidth(inner), measureChild);
}

/**
 * A table's divisible units, in **display** order (C11 §5a).
 *
 * **The units are not rows**, which is the whole of why a window here is more
 * than a slice: the header is one unit, a row *with its detail* is one, and the
 * gap-plus-bar is one. A range that ends inside an expanded row gets the whole
 * row and the surplus hangs past `to`, which is what `Windowed.dropRows` is for
 * (C09 I26, F428).
 *
 * **Display order, because the range is in display space.** `measure` walks
 * `block.rows` and `render` walks `sortedRows`, and the counts agree — so a
 * slice taken in declaration order passes C09 I26 exactly while showing different
 * rows than the reader asked for (C09 §6b, F426's shape one kind over).
 */
type Unit = Readonly<{ rows: number; row: TableRow | null; bar: boolean }>;

function unitsOf(block: Table, width: number, measureChild: MeasureFn): readonly Unit[] {
  const out: Unit[] = [];
  if (hasHeader(block)) out.push({ rows: 1, row: null, bar: false });
  for (const row of sortedRows(block)) {
    out.push({ rows: 1 + detailHeight(block, row, width, measureChild), row, bar: false });
  }
  if (hasActionBar(block)) out.push({ rows: 2, row: null, bar: true });
  return out;
}

/**
 * The gutter this block reserves on every row, for the focus mark (I15, §5b).
 *
 * **Reserved and not conditional**, because `measure` sees no focus: a column
 * that appeared with the mark would put the measurer and the render in
 * disagreement on exactly the frames a reader is looking at. Derived from the
 * glyph rather than written as a number, so the ASCII rung cannot make the two
 * halves disagree — C09 §4's 1:1 rule is what lets `measure` be correct without
 * seeing a capability.
 *
 * **One column, and the second is owed to a glyph slot rather than to this
 * component**: §044's `▌` carries selected elements, and `▌` is the `live`
 * slot which `containers.ts` already draws on a live panel's title (F161).
 *
 * **Exported for the suite, which is the one consumer and deliberately so.**
 * Twenty rows about this block's geometry need the number; twenty literal `2`s
 * is the copied-constant shape that drifts the first time the glyph changes
 * width, and C09 §4's 1:1 rule is exactly what a literal would stop honouring.
 */
export const GUTTER_CELLS = glyphCells("focus") + 1;

/** The width the plan and every clamp see — never `ctx.width` (I15). */
function bodyWidth(width: number): number {
  return Math.max(1, width - GUTTER_CELLS);
}

export const tableDefinition: BlockDefinition<Table> = {
  kind: "table",

  // §7a — *a table as TSV with its header* (C09 I86, `R-SEL-004`).
  //
  // **Built from `rowCopyText`, which is what stops this being a second
  // source.** The private `copyTextOf` this seam replaces said `table` was
  // *deliberately absent, because C11 already declares a richer `copy` per row
  // and a second answer here would be two sources for one fact* — a correct
  // argument about sources and the wrong conclusion about granularity. A row's
  // copy and the block's are one source at two sizes, and the block having none
  // is why a `scroll` holding a table copied blank.
  //
  // Every **declared** column, including the ones a width dropped — the whole
  // point of taking the source. The sort, the marker column and the residue row
  // are this component's and do not appear.
  copy: (block) =>
    [
      block.columns.map((c) => c.label).join("\t"),
      ...block.rows.map((r) => rowCopyText(block, r)),
    ].join("\n"),

  elements: tableElements,

  /**
   * C09 §2c — the planned columns and their gaps, when that is what every row
   * is. The action bar, the empty message and an expanded row's detail are
   * clamped to the width rather than to the columns — so a table with any of
   * those fills, and only a table that is columns all the way down answers
   * narrower. An overflowed plan (the last kept column truncated) is the width
   * by construction. **A flex column is the plan's business, not a guard
   * here**: the plan hands it the residual, so an uncapped flex column sums to
   * the width on its own, and a `maxWidth`-capped one sums to less — which is
   * the truth, and a guard returning the width for it would have lied. The
   * mutation pass found the guard redundant on its first run (F818).
   */
  width(block: Table, width: number): number {
    const w = normaliseWidth(width);
    if (!hasBody(block) || hasActionBar(block) || block.rows.some((row) => row.expanded === true)) return w;
    const plan = plannedColumns(block, bodyWidth(w));
    if (plan.overflowed) return w;
    // **The gutter is part of the answer** (I15): it is drawn on every row, so a
    // width that left it out would be narrower than what `render` emits.
    let total = GUTTER_CELLS;
    plan.visible.forEach((column, i) => { total += column.width + (i > 0 ? plan.gap : 0); });
    return Math.max(1, Math.min(w, total));
  },

  measure(block: Table, width: number, measureChild: MeasureFn): number {
    const w = normaliseWidth(width);
    const header = hasHeader(block) ? 1 : 0;

    // An empty table measures 1 + 1 — header plus the empty message, never zero
    // (C11 §5, T1.10). C04's T3.4 asserts the same thing from the other side.
    if (!hasBody(block)) return atLeastOne(header + 1);

    let total = header + block.rows.length; // cells-ok
    for (const row of block.rows) total += detailHeight(block, row, w, measureChild);
    // I17 — a blank separator and a label row when any row has actions. Two,
    // because every surface drawing a bar draws a blank above it and the gap
    // cannot come from `gapBefore`: that applies *between* blocks in a sequence
    // (C04 §3a), and a table cannot ask the sequence for a gap after itself.
    // `measure` has no focus to consult and must not need one.
    if (hasActionBar(block)) total += 2;

    return atLeastOne(total);
  },

  /**
   * Rows `[from, to)` as a smaller table (C09 I25, C09 I26; C11 §5a).
   *
   * **Four things a window could change, and only two of them want a field.**
   * The question is not *does a window change this* but *does a window change
   * what this is derived from*:
   *
   * - **The column plan does not move.** `planColumns(cols, width)` takes no
   *   rows — C11 §3 plans from declarations, never from cell content — which is
   *   the structural reason `table` needs no width pin where `keyValue` did.
   * - **The header is a declared flag** and was expressible all along.
   * - **The action bar is a presence derived from the rows**, so it is pinned:
   *   a slice moves it in both directions (I18).
   * - **The display order is derived from the rows too**, through `kindOf`, and
   *   re-deriving it can reverse the slice — so the rows are handed over already
   *   ordered and `presorted` stops the second sort (I19, F429).
   *
   * **A window never holds zero rows** (I20). Both ends of a table can be asked
   * for alone: `[0, 1)` is the header, and a bodyless table measures
   * `header + 1` with the surplus *after* the header; `[n−2, n)` is the gap and
   * the bar, and a bar whose existence derives from the rows cannot be drawn
   * beside none. So the nearest row unit is kept and charged to whichever
   * residual it falls outside.
   */
  window(
    block: Table,
    width: number,
    from: number,
    to: number,
    measureChild: MeasureFn,
  ): Windowed {
    const w = normaliseWidth(width);
    // **`tableDefinition.measure` by name, never `this.measure`.** A definition's
    // members are extracted and called free — `navigation-conformance.ts` reads
    // `registry.get(kind)?.window` and invokes it — and `this` is then
    // undefined. The measurement suite calls it as `definition.window?.(…)`,
    // which binds, so the first form passed every window in that file and threw
    // on the first call from the second consumer. The other kinds are arrow
    // properties and have no `this` to lose.
    const total = tableDefinition.measure(block, w, measureChild);
    const lo = Math.max(0, Math.min(Math.trunc(from), total - 1)); // cells-ok
    const hi = Math.max(lo + 1, Math.min(Math.trunc(to), total)); // cells-ok

    // A bodyless table is one message row under a header: there is nothing to
    // divide, so it is kept whole and both ends are slack. The same answer
    // `windowSequence` gives a kind that declares no window at all.
    if (!hasBody(block)) {
      return Object.freeze({ block, skipRows: lo, dropRows: total - hi }); // cells-ok
    }

    const units = unitsOf(block, w, measureChild);
    const tops: number[] = [];
    let cursor = 0; // cells-ok — a row cursor, not a width
    for (const unit of units) {
      tops.push(cursor);
      cursor += unit.rows;
    }
    const bottomOf = (i: number): number => (tops[i] ?? 0) + (units[i]?.rows ?? 0);

    let first = units.length - 1; // cells-ok — a unit index, not a width
    let last = 0;
    for (let i = 0; i < units.length; i += 1) { // cells-ok — a unit index, not a width
      if (bottomOf(i) > lo && (tops[i] ?? 0) < hi) {
        first = Math.min(first, i);
        last = Math.max(last, i);
      }
    }

    // **I20 — extend to the nearest row rather than return a bodyless block.**
    // Widening only ever moves `first` down or `last` up, so both residuals stay
    // non-negative by construction.
    if (!units.slice(first, last + 1).some((u) => u.row !== null)) {
      const rowIndices = units.map((u, i) => (u.row === null ? -1 : i)).filter((i) => i >= 0);
      const firstRow = rowIndices[0] ?? 0;
      const lastRow = rowIndices[rowIndices.length - 1] ?? 0; // cells-ok — an index, not a width
      if (last < firstRow) last = firstRow;
      else first = lastRow;
    }

    const kept = units.slice(first, last + 1);
    const wholeAligns = columnAlignments(block);
    return Object.freeze({
      block: {
        ...block,
        rows: kept.map((u) => u.row).filter((r): r is TableRow => r !== null),
        showHeader: first === 0 && hasHeader(block),
        actionBar: kept.some((u) => u.bar),
        presorted: true,
        // **The window pins each column's alignment, resolved over the whole
        // table** (I27, I18, I19). A derived alignment reads *the values
        // present*, so a slice that dropped the only non-numeric value in a
        // numeric-looking column re-classifies it — and where F429's version of
        // that reverses an order, this one flips a column from `left` to
        // `decimal` between two scroll positions, with every count, every width
        // and every `skipRows` correct. I18 pins the action bar's presence and
        // I19 pins the sort for exactly this shape; this is the third instance
        // of one argument rather than a new mechanism. A resolved alignment is
        // an ordinary declaration by the time the renderer sees it, so no field
        // is added to `Table`.
        // **And each number column's effective minimum** (I31), for the same
        // reason: resolved over the slice, a window whose rows are narrower
        // than the table's widest number would plan the column narrower and
        // start every column after it at a different cell on scroll.
        columns: effectiveColumns(block).map((c) => {
          if (c.align !== undefined) return c;
          const align = wholeAligns.get(c.key);
          // Every column key is in the map by construction; the guard is what
          // `exactOptionalPropertyTypes` wants rather than a case that arises.
          return align === undefined ? c : { ...c, align };
        }),
      },
      skipRows: lo - (tops[first] ?? 0), // cells-ok
      dropRows: bottomOf(last) - hi, // cells-ok
    });
  },

  render(block: Table, ctx: RenderContext): Rendered {
    const width = normaliseWidth(ctx.width);
    // **The reserved focus column** (I15, §5b). Every row of the block is inset
    // by it — header, body, detail and action bar alike — so the columns beneath
    // stay one axis and nothing moves when a row gains or loses focus. The plan
    // and every clamp see `inner`, never `width`.
    const inner = bodyWidth(width);
    const probe = ctx.probe;
    // **Rows and columns separately, because they are different failures.** A
    // table slow in `plan` is wide — the plan is a function of the declarations
    // and the width and never reads a cell (C11 §3) — and one slow in `rows` is
    // deep. The same duration means opposite things.
    if (probe?.on === true) {
      probe.gauge("table.rows", block.rows.length); // cells-ok — a count of items, not a display width
      probe.gauge("table.columns", block.columns.length); // cells-ok — a count of items, not a display width
    }
    let plan;
    {
      using _p = probe?.span("table.plan") ?? NO_SPAN;
      plan = plannedColumns(block, inner);
    }
    const focused = ctx.focus !== null && ctx.focus.blockId === block.id ? ctx.focus.rowId : null;
    // **The extent is the entry's, kept to this block** (I14). The pairs are
    // filtered by *their* block id and not gated on `ctx.focus.blockId`, because
    // a selection whose head sits in a sibling block still names rows here —
    // gating on the head would paint nothing in every block but one (T6.17).
    const selected = new Set(
      (ctx.focus?.selected ?? []).filter((s) => s.blockId === block.id).map((s) => s.rowId),
    );
    // The wash is applied to the whole row — gaps, marker and data runs alike —
    // so a selected row reads as one thing, *selected* rather than *highlighted*
    // (C22 §6e's own distinction for the prompt). The ink under it is `default`,
    // decided in `rowSpans`; this adds the ground.
    const wash = selectionStyle(ctx.theme, ctx.capabilities);
    // **Focus has a ground of its own** (C10 I47, R-SEL-006, §4k). The head was
    // `accent` over nothing and the extent `default` over the wash, so the two
    // facts were told apart by ink on one ground; they are told apart by two
    // grounds now, and the head keeps `accent` as the ink — which is what
    // carries focus at 1-bit, where a ground answers `NO_STYLE` and a table has
    // no column to put a mark in (C11 I15, C09 I83).
    const focusGround = focusStyle(ctx.theme, ctx.capabilities);
    const grounded = (spans: readonly Span[], ground: Span["style"]): readonly Span[] =>
      spans.map((s) => ({ ...s, style: { ...(s.style ?? {}), ...ground } }));

    // **Every part is a row** (C09 I73). There was a `finishTable` here that
    // answered rows when they all were and lifted them into a column of `Text`
    // when one was not; a detail child is the only part that could be the
    // second, and since F1209 it cannot be.
    const parts: string[] = [];
    // **The lead takes the row's ground** (§5c, I14, I15). It used to be painted
    // on the page, on the argument that *a ground running under the gutter
    // would make the two one block of colour, which is the frame §044 does not
    // draw* — and §044 draws exactly that frame: its focused-and-selected row is
    // one run of `bg-selection` opening with `▸ `. Four more figures agree
    // across three grounds (§082, §072, §043, §071). The sentence was true about
    // a risk and false about its source, and R-SEL-006 is silent on the mark's
    // cell. The header has always run its ground gutter-inclusive (I24, §073)
    // and one block cannot hold two answers about one column.
    const blank = " ".repeat(GUTTER_CELLS); // cells-ok — the reserved gutter
    const lead = (marked: boolean): readonly Span[] =>
      marked
        ? [{ text: `${glyphFor("focus", ctx.capabilities)} `, style: tone("accent", ctx.theme, ctx.capabilities) }]
        : [{ text: blank }];
    /** One exit, so no emitted row can forget the gutter (I15). */
    const emit = (spans: readonly Span[], marked = false, ground: Span["style"] | null = null): void => {
      const row = [...lead(marked), ...clampSpans(spans, inner, ctx.capabilities)];
      if (ground === null) {
        parts.push(paint(row));
        return;
      }
      // **A ground runs to the block's edge, so the row is padded to it** — the
      // header's arithmetic (I24), for the same reason and on the same guard:
      // the pad exists only to give the ground cells to paint, so it is taken
      // here where a ground is known and nowhere else. Reading §082's frame is
      // what found this: the ground opened under the mark correctly and stopped
      // at the last column, which the mask shows and a string assertion about
      // the mark cannot.
      const drawn = row.reduce((n, sp) => n + cells(sp.text, ctx.capabilities.ambiguousWidth), 0);
      const tail = Math.max(0, width - drawn); // cells-ok — the row's own residue
      parts.push(paint(grounded(tail === 0 ? row : [...row, { text: " ".repeat(tail) }], ground)));
    };

    if (hasHeader(block)) {
      // **`bgElev` across the whole row, gutter included** (I24, §073, §072).
      // §073 names this *the one place a full-width ground is right* and gives
      // the reason the rule turns on: the header is a **surface the rows sit
      // under**, not a status. So the ground runs to the block's edge rather
      // than stopping where the last label ends — a ground that stopped at the
      // text would say *these words* are the surface, where the claim is that
      // the row is.
      //
      // It degrades to nothing and loses nothing: at one bit
      // `resolveBackground` answers `NO_STYLE`, the header is `muted` text over
      // the page as it always was, and the header never carried a fact — the
      // column names are the carrier and they are still drawn.
      const elev = background("surface.bgElev", ctx.theme, ctx.capabilities);
      if (elev.background === undefined) {
        // **No ground, so no padding either**, and the difference matters: the
        // pad exists only to give the ground cells to paint. Padding anyway
        // would put trailing blanks on every monochrome frame in the corpus for
        // a surface that is not there — which is what the first draft did, and
        // four goldens that carry no colour at all moved to say so.
        emit(headerSpans(block, plan, ctx, columnAlignments(block)));
      } else {
        const spans = clampSpans(
          headerSpans(block, plan, ctx, columnAlignments(block), "bgElev"),
          inner,
          ctx.capabilities,
        );
        const drawn = spans.reduce((n, sp) => n + cells(sp.text, ctx.capabilities.ambiguousWidth), 0);
        const tail = Math.max(0, inner - drawn); // cells-ok — the row's own residue
        parts.push(
          paint(
            [
              { text: blank },
              ...spans,
              ...(tail === 0 ? [] : [{ text: " ".repeat(tail) }]),
            ].map((sp) => ({ text: sp.text, style: withBackground(sp.style, elev) })),
          ),
        );
      }
    }

    if (!hasBody(block)) {
      emit(emptySpans(block, inner, ctx));
      return parts;
    }

    // Sorting is a permutation, so this changes the order of what follows and
    // nothing about how much of it there is — which is why `measure` above does
    // not sort at all (I8, T1.13).
    //
    // **The span covers the loop and not each row**, which is a deliberate
    // trade: a span costs 74 ns and a row's spans cost rather less than a plot's
    // frame, so one per row would report the instrument. The per-row figure that
    // is wanted is `table.rows` above divided into this.
    using _rows = probe?.span("table.rows") ?? NO_SPAN;
    // **Once per render, not once per row** (I23). The glyph slot is the
    // column's allowance, so the answer is a property of the block; deriving it
    // inside the loop would be quadratic and memoising it would be state (I11).
    const marked = markedSeriesColumns(block);
    // **Once per block, not once per row** (I26): `rowSpans` holds the whole
    // table, so taking the decimal points there would walk every cell for every
    // row — the same reason the marked set is hoisted here.
    // **Once per block, beside the points and the marked set** (I26, I27). A
    // column's alignment is derived from its own cells, so `rowSpans` could take
    // it every time it draws a row — the same walk once per row, which is the
    // reason the other two are already hoisted here.
    const aligns = columnAlignments(block);
    // **The grouping set before the points, because the points measure what
    // will be drawn** (I28, I26). A separator is part of an integer part, so
    // the order is plan, then grouping, then points.
    const grouping = groupingColumns(
      block,
      aligns,
      new Map(plan.visible.map((c) => [c.key, c.width])),
      (text) => cells(text, ctx.capabilities.ambiguousWidth),
    );
    const points = decimalPoints(block, plan, ctx.capabilities.ambiguousWidth, aligns, grouping);
    // The columns a missing cell draws `—` in, and where a decimal column's
    // values end (I29), once per block.
    const unknown = unknownColumns(block);
    const ends = decimalEnds(block, plan, ctx.capabilities.ambiguousWidth, aligns, grouping);
    for (const row of sortedRows(block)) {
      const expandable = isExpandable(row, plan);
      const isHead = focused !== null && focused === row.id;
      // **The head is told from the extent by its own ground**, not by ink
      // inside a shared one (I14 as amended, R-SEL-006).
      const isSelected = !isHead && selected.has(row.id);
      // **One expression, and it answers both halves** (C10 I48, F1240): which
      // ground the row takes, and which ground its inks resolve against. Two
      // expressions is how the gate and the painter stopped agreeing — a row
      // washed with one surface and inked for another is exactly the value the
      // contrast gate measures as wrong.
      //
      // **Selection wins the ground where both hold** (R-SEL-006), and the head
      // keeps `▸`. **`has` and never a size**: `selected` *absent* is C26 I16's
      // head-alone sentinel and any *present* extent is a real selection, one
      // element included — a test on the size paints a real single-row selection
      // as focus and calls that the sentinel (I14, T2.12).
      const on = isSelected || (isHead && selected.has(row.id))
        ? "selection"
        : isHead
          ? "focusGround"
          : undefined;
      const spans = rowSpans(block, row, plan, ctx, { expandable, on, marked, points, aligns, grouping, unknown, ends });
      // **The ground goes to `emit`, not to the spans** (§5c). Applied here it
      // stopped at the gutter, which is the divergence: the reserved column is
      // part of the row it leads, so the ground has to be put on where the
      // gutter is known and that is the one exit.
      const ground = on === "selection" ? wash : on === "focusGround" ? focusGround : null;
      emit(spans, isHead, ground);

      if (row.expanded !== true) continue;
      // **A count, not a span.** Each detail child goes through `renderChild`,
      // which the registry decoration already enters, so every one of them is
      // its own node in the tree with its own kind and id. What the tree cannot
      // say is how many rows were expanded at once, which is the thing a reader
      // changes.
      probe?.count("table.detail.rows");

      // Indented by two cells, and the children are rendered at the width they
      // were *measured* at. `paddingLeft` plus a `width` of the whole leaves a
      // content box of exactly `insetWidth`, so the two halves see one number.
      // **The detail's rows padded left by the inset** (C09 I73), one part per
      // row; a child that answers an element is its padded box, as before.
      const inset = inner - insetWidth(inner); // cells-ok — the detail's own indent, inside the gutter
      const pad = " ".repeat(inset);
      // **The detail sits on `bgElev`, the block's whole width, gutter
      // included** (I25, §082 `R-BLK-941`). `based` and not a span pass,
      // because a child has already painted its own line and the ground has to
      // survive every reset inside it — which is the mechanism `shell/paint.ts`
      // has used for the session's base colour since F889, moved down to L1 so
      // there is one of it. **A blank line stays blank**: a ground on a row the
      // detail did not draw would run past the detail's own extent, and I25's
      // second half — *the rows below carry on underneath* — is the half §082
      // rests on, because a ground that leaked downward draws the pushed frame
      // the section refuses.
      // **No ground, so no padding either** — the header's own guard, and for
      // its reason (I24): the pad exists only to give the ground cells to
      // paint, and padding a monochrome frame puts trailing blanks in the
      // corpus for a surface that is not there.
      const detailElev = background("surface.bgElev", ctx.theme, ctx.capabilities);
      const elevBase =
        detailElev.background === undefined
          ? ""
          : groundSequence("surface.bgElev", ctx.theme, ctx.capabilities);
      detailBlocks(block, row, plan, ctx.capabilities).forEach((child) => {
        // **Cut to the width** (F1211): a detail child answering a row wider
        // than its inset used to become a padded Ink box, which wrapped.
        for (const line of ctx.renderChild(child, insetWidth(inner))) {
          if (line === "") {
            // **A blank line stays blank** (I25): a ground on a row the detail
            // did not draw runs past the detail's own extent, and *the rows
            // below carry on underneath* is the half §082 rests on.
            parts.push("");
            continue;
          }
          const body = fitRow(pad + line, inner);
          if (elevBase === "") {
            parts.push(`${blank}${body}`);
            continue;
          }
          const tail = Math.max(0, inner - rowCells(body)); // cells-ok — the row's own residue
          const [drawn] = based([`${blank}${body}${" ".repeat(tail)}`], elevBase);
          parts.push(drawn ?? `${blank}${body}`);
        }
      });
    }

    // **The action bar** (I17, §5). Present because the data says so; empty
    // because nothing is focused. Every S-series figure that draws one — S02,
    // S03, S05, S06, S14 — has been drawing this row, and until now nothing
    // produced it: `TableRow.actions` existed and no code read it.
    if (hasActionBar(block)) {
      const row = focused === null ? undefined : block.rows.find((r) => r.id === focused);
      const labels = (row?.actions ?? []).map((a) => a.label).join("   ");
      parts.push("");
      emit([{ text: labels, style: tone("meta", ctx.theme, ctx.capabilities) }]);
    }

    return parts;
  },
};



/**
 * C26 §5 — what a table offers to keyboard and pointer, from one declaration.
 *
 * **This replaced `focusableRowIds`, which is deleted** — C26 commitment 11. Two
 * parallel mechanisms are the defect the spec names by name, because the
 * roadmap's constraint on the mouse work is *one source, or they will disagree*,
 * and a function left standing is the second source however few callers it has.
 *
 * It answered *which rows*, in drawn order, for one kind at one level. This
 * answers *what is here and where*, for any kind at any level, which is what a
 * pointer needs and what a keyboard needed all along.
 *
 * **The offsets are `measure`'s arithmetic and must stay its arithmetic.**
 * `header + Σ(1 + detailHeight(row))`, walked in `sortedRows` order because
 * focus follows what the reader sees. A second summation here that agreed today
 * would disagree the first time either changed — so the same `detailHeight` is
 * called, with the same injected `measureChild` (C26 §8b.3).
 *
 * **A row's element spans its detail.** The detail belongs to the row that
 * expanded it, so a pointer landing in the detail resolves to the row rather
 * than to nothing — and the ranges stay disjoint, which C26 I6 requires at a
 * level.
 *
 * **The action bar is not an element.** C11 I17 makes its *presence* follow the
 * data and its *content* follow focus; it is a readout of the focused row, not
 * somewhere focus can be. Giving it one would put a place to stand inside the
 * thing that describes where you are standing.
 */
/**
 * A row's source text, for `y` (C26 §5c).
 *
 * **Every declared column, in declared order, at no width.** The columns this
 * width dropped are in it and the truncation is not: the painted row is a
 * rendering and this is the data it was rendered from. `planColumns` is
 * deliberately not consulted — a copy that changed with the terminal's size
 * would be the defect rather than a feature.
 *
 * Tab-separated, because that is what pastes into a spreadsheet and into every
 * shell tool that takes columns. A `spark` cell contributes its `text`, which
 * is what the surface wrote there; the sparkline itself is a rendering.
 */
function rowCopyText(block: Table, r: TableRow): string {
  return block.columns.map((c) => r.cells[c.key]?.text ?? "").join("\t");
}

/**
 * What this width could not show of a row, or `null` when it showed everything
 * (C26 §5 `detail`, C15 §2a).
 *
 * **Two ways a rendering loses a cell, and both come from the plan** (C11 §3):
 * a column the plan dropped, and a cell wider than the column it was planned
 * into. Both are decided by `planColumns(columns, width)` — declarations and a
 * width, never focus — so this is as pure as `elements` itself and answers the
 * same for the frame and for the peek. A dropped column with an empty cell is
 * nothing lost; a renderer-supplied column (`role: "expand"`) is nothing the
 * data owns.
 *
 * **Known limit, stated rather than absorbed**: the cut test is `cells(text)` at
 * the default ambiguous width against the planned width, and reads `text`
 * alone. A cell whose glyph costs the column its last cell, or whose text is
 * wide under the terminal's ambiguous-width setting, may be cut by the painter
 * without declaring a detail here.
 */
function rowDetail(block: Table, r: TableRow, width: number): Block | null {
  // **The same plan the render draws** (I15): the gutter comes off here too, or
  // this answers *what was lost* against a plan two cells wider than the one on
  // screen, and a row that fits would declare a detail for a column it shows.
  const plan = plannedColumns(block, bodyWidth(width));
  const planned = new Map(plan.visible.map((v) => [v.key, v.width]));
  const dropped = new Set(plan.dropped);
  const rows: { label: string; value: string }[] = [];
  for (const column of block.columns) {
    if (column.role === "expand") continue;
    const text = r.cells[column.key]?.text ?? "";
    if (text === "") continue;
    const w = planned.get(column.key);
    // The plan's widths are declared in cells under the default convention and
    // this compares against them; the painter's own cut is at the terminal's
    // convention, which is the limit stated above.
    const lost = dropped.has(column.key) || (w !== undefined && cells(text, "narrow") > w); // narrow-ok — the plan's own convention
    if (lost) rows.push({ label: column.label === "" ? column.key : column.label, value: text });
  }
  if (rows.length === 0) return null; // cells-ok — a row count, not a width
  return Object.freeze({ kind: "keyValue" as const, id: `${block.id}-${r.id}-detail`, rows: Object.freeze(rows) });
}

export function tableElements(
  block: Table,
  width: number,
  measureChild: MeasureFn,
): readonly NavElement[] {
  const w = normaliseWidth(width);
  if (!hasBody(block)) return Object.freeze([]);

  const out: NavElement[] = [];
  let row = hasHeader(block) ? 1 : 0; // cells-ok — a row cursor, not a width

  for (const r of sortedRows(block)) {
    const height = 1 + detailHeight(block, r, w, measureChild);
    const action = r.actions?.[0];
    const detail = rowDetail(block, r, w);
    out.push(
      Object.freeze({
        id: r.id,
        level: "row" as const,
        rows: Object.freeze({ from: row, to: row + height }),
        cols: Object.freeze({ from: 0, to: w }),
        ...(action === undefined ? {} : { activate: action }),
        copy: rowCopyText(block, r),
        ...(detail === null ? {} : { detail }),
      }),
    );
    row += height;
  }
  return Object.freeze(out);
}
