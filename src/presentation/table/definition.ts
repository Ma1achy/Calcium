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
import type { MeasureFn, Table, TableRow } from "../../data/viewmodel/index.js";
import { clampSpans, paint, tone } from "../blocks/paint.js";
import type { BlockDefinition, NavElement, RenderContext } from "../blocks/types.js";
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
  return block.rows.some((r) => (r.actions ?? []).length > 0); // cells-ok
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

  render(block: Table, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    const plan = planColumns(block.columns, width);
    const focused = ctx.focus !== null && ctx.focus.blockId === block.id ? ctx.focus.rowId : null;

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

      lines.push(
        createElement(
          Text,
          { key: `row-${row.id}` },
          textOf(
            paint(
              clampSpans(
                rowSpans(block, row, plan, ctx, {
                  expandable,
                  focused: focused !== null && focused === row.id,
                }),
                width,
                ctx.capabilities,
              ),
            ),
          ),
        ),
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
    out.push(
      Object.freeze({
        id: r.id,
        level: "row" as const,
        rows: Object.freeze({ from: row, to: row + height }),
        cols: Object.freeze({ from: 0, to: w }),
        ...(action === undefined ? {} : { activate: action }),
        copy: rowCopyText(block, r),
      }),
    );
    row += height;
  }
  return Object.freeze(out);
}
