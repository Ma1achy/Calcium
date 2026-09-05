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
import { Box, Text } from "ink";
import { createElement, type ReactElement } from "react";
import { atLeastOne, insetWidth, normaliseWidth, sequenceHeight } from "../../data/viewmodel/index.js";
import type { Block, MeasureFn, Table, TableRow } from "../../data/viewmodel/index.js";
import { cells } from "../text.js";
import { clampSpans, paint, selectionStyle, tone, type Span } from "../blocks/paint.js";
import type { BlockDefinition, NavElement, RenderContext, Windowed } from "../blocks/types.js";
import { emptySpans, headerSpans, rowSpans } from "./cells.js";
import { detailBlocks, isExpandable } from "./detail.js";
import { planColumns } from "./plan.js";
import { sortedRows } from "./sort.js";

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
  const plan = planColumns(block.columns, width);
  // A sequence, so a detail block declaring `gapBefore` contributes its blank row
  // here exactly as it would at a document's top level (C04 §3a).
  return sequenceHeight(detailBlocks(block, row, plan), insetWidth(width), measureChild);
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

export const tableDefinition: BlockDefinition<Table> = {
  kind: "table",

  elements: tableElements,

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
    return Object.freeze({
      block: {
        ...block,
        rows: kept.map((u) => u.row).filter((r): r is TableRow => r !== null),
        showHeader: first === 0 && hasHeader(block),
        actionBar: kept.some((u) => u.bar),
        presorted: true,
      },
      skipRows: lo - (tops[first] ?? 0), // cells-ok
      dropRows: bottomOf(last) - hi, // cells-ok
    });
  },

  render(block: Table, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    const plan = planColumns(block.columns, width);
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
    const washed = (spans: readonly Span[]): readonly Span[] =>
      spans.map((s) => ({ ...s, style: { ...(s.style ?? {}), ...wash } }));

    const lines: ReactElement[] = [];

    if (hasHeader(block)) {
      lines.push(
        createElement(
          Text,
          { key: "header" },
          textOf(paint(clampSpans(headerSpans(block, plan, ctx), width, ctx.capabilities))),
        ),
      );
    }

    if (!hasBody(block)) {
      lines.push(
        createElement(
          Text,
          { key: "empty" },
          textOf(paint(clampSpans(emptySpans(block, width, ctx), width, ctx.capabilities))),
        ),
      );
      return createElement(Box, { flexDirection: "column", width }, lines);
    }

    // Sorting is a permutation, so this changes the order of what follows and
    // nothing about how much of it there is — which is why `measure` above does
    // not sort at all (I8, T1.13).
    for (const row of sortedRows(block)) {
      const expandable = isExpandable(row, plan);
      const isHead = focused !== null && focused === row.id;
      // **The head is never washed** — it keeps `accent`, which is what makes it
      // distinguishable inside its own extent, and what makes a one-element
      // extent draw exactly as no selection with no branch on the count (I14).
      const isSelected = !isHead && selected.has(row.id);
      const spans = clampSpans(
        rowSpans(block, row, plan, ctx, { expandable, focused: isHead, selected: isSelected }),
        width,
        ctx.capabilities,
      );

      lines.push(
        createElement(Text, { key: `row-${row.id}` }, textOf(paint(isSelected ? washed(spans) : spans))),
      );

      if (row.expanded !== true) continue;

      // Indented by two cells, and the children are rendered at the width they
      // were *measured* at. `paddingLeft` plus a `width` of the whole leaves a
      // content box of exactly `insetWidth`, so the two halves see one number.
      lines.push(
        createElement(
          Box,
          {
            key: `detail-${row.id}`,
            flexDirection: "column",
            width,
            paddingLeft: width - insetWidth(width),
          },
          detailBlocks(block, row, plan, ctx.capabilities).flatMap((child, index) => {
            const drawn = createElement(
              Box,
              { key: child.id === "" ? String(index) : child.id },
              ctx.renderChild(child, insetWidth(width)),
            );
            return child.gapBefore === true
              ? [createElement(Text, { key: `gap-${index}` }, " "), drawn]
              : [drawn];
          }),
        ),
      );
    }

    // **The action bar** (I17, §5). Present because the data says so; empty
    // because nothing is focused. Every S-series figure that draws one — S02,
    // S03, S05, S06, S14 — has been drawing this row, and until now nothing
    // produced it: `TableRow.actions` existed and no code read it.
    if (hasActionBar(block)) {
      const row = focused === null ? undefined : block.rows.find((r) => r.id === focused);
      const labels = (row?.actions ?? []).map((a) => a.label).join("   ");
      lines.push(createElement(Text, { key: "actions-gap" }, " "));
      lines.push(
        createElement(
          Text,
          { key: "actions" },
          textOf(
            paint(
              clampSpans(
                [{ text: labels, style: tone("meta", ctx.theme, ctx.capabilities) }],
                width,
                ctx.capabilities,
              ),
            ),
          ),
        ),
      );
    }

    return createElement(Box, { flexDirection: "column", width }, lines);
  },
};

/**
 * A painted row, or a space.
 *
 * Ink drops an empty `Text`, so a blank row measured and not drawn is a
 * disagreement of one — `paint.ts`'s `rows()` handles this for the kinds that
 * emit a flat list of strings, and a table interleaves rows with detail boxes, so
 * it applies the same floor itself.
 */
function textOf(line: string): string {
  return line === "" ? " " : line;
}

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
  const plan = planColumns(block.columns, width);
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
