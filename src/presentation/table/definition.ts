/**
 * `tableDefinition` — the pair C09's registry holds, and the one that must agree
 * to the row (C09 I1).
 *
 * **Registered, not privileged** (I12, T2.5). This definition is not in
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
import { clampSpans, paint } from "../blocks/paint.js";
import type { BlockDefinition, RenderContext } from "../blocks/types.js";
import { emptySpans, headerSpans, rowSpans } from "./cells.js";
import { detailBlocks, isExpandable } from "./detail.js";
import { planColumns } from "./plan.js";
import { sortedRows } from "./sort.js";

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

  measure(block: Table, width: number, measureChild: MeasureFn): number {
    const w = normaliseWidth(width);
    const header = hasHeader(block) ? 1 : 0;

    // An empty table measures 1 + 1 — header plus the empty message, never zero
    // (C11 §5, T1.10). C04's T3.4 asserts the same thing from the other side.
    if (!hasBody(block)) return atLeastOne(header + 1);

    let total = header + block.rows.length; // cells-ok
    for (const row of block.rows) total += detailHeight(block, row, w, measureChild);

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
 * The rows C16 may move focus between, in the order they are drawn (T4.6).
 *
 * Sorted, because focus follows what the user sees: arrow keys moving through the
 * declared order while the screen shows another would land somewhere the reader
 * did not point at. **C11 holds no focus state** (I15) — this is a question about
 * the block, answered from the block.
 */
export function focusableRowIds(block: Table): readonly string[] {
  return sortedRows(block).map((row) => row.id);
}
