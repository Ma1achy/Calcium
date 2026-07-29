/**
 * A planned row, as spans.
 *
 * Plain text first, styled last — `paint.ts`'s rule, and the reason every width
 * decision above is taken on unstyled strings. Widths come from the plan; nothing
 * here measures anything the planner did not already account for.
 *
 * **`cells()` and never `.length`** (C09 I6, A03 SS23). The planner and the
 * renderer must agree to the cell, and `fit` is where truncation and padding meet
 * in one place so they cannot disagree.
 */
import { glyphFor, glyphs } from "../blocks/glyphs.js";
import { fit, pad, padStart, tone, type Span } from "../blocks/paint.js";
import { stripControl, truncate } from "../text.js";
import type { Cell, ColumnDef, Table, TableRow } from "../../data/viewmodel/index.js";
import type { RenderContext } from "../blocks/types.js";
import type { PlannedColumns } from "./plan.js";

/** The gap between columns, as a span. */
function gapSpan(gap: number): Span {
  return { text: " ".repeat(Math.max(0, gap)) };
}

/**
 * The header row: labels, dim, with the sort indicator on the active column.
 *
 * The indicator is appended inside the column's planned width (C11 §4), so a
 * label that no longer fits truncates rather than pushing the row wider than the
 * plan. The columns beneath it are the authority on where each column starts.
 */
export function headerSpans(
  block: Table,
  plan: PlannedColumns,
  ctx: RenderContext,
): readonly Span[] {
  const g = glyphs(ctx.capabilities);
  const dim = tone("muted", ctx.theme, ctx.capabilities);
  const byKey = new Map<string, ColumnDef>(block.columns.map((c) => [c.key, c]));

  const spans: Span[] = [];
  plan.visible.forEach((planned, index) => {
    if (index > 0) spans.push(gapSpan(plan.gap));

    const column = byKey.get(planned.key);
    const label = stripControl(column === undefined ? planned.key : column.label);
    const indicator =
      block.sort !== undefined && block.sort.key === planned.key
        ? ` ${block.sort.direction === "desc" ? g.sortDesc : g.sortAsc}`
        : "";

    const text =
      column?.align === "right"
        ? padStart(truncate(label + indicator, planned.width, ctx.capabilities), planned.width)
        : fit(label + indicator, planned.width, ctx.capabilities);

    spans.push({ text, style: dim });
  });

  return spans;
}

/**
 * One row's cells, in plan order.
 *
 * `expandable` arrives as an argument rather than being derived here: it is a
 * property of the row *and the plan together* (`detail.ts`), and a cell builder
 * recomputing it would be a second answer to the question I2 turns on.
 */
export function rowSpans(
  block: Table,
  row: TableRow,
  plan: PlannedColumns,
  ctx: RenderContext,
  options: Readonly<{ expandable: boolean; focused: boolean }>,
): readonly Span[] {
  const byKey = new Map<string, ColumnDef>(block.columns.map((c) => [c.key, c]));
  const spans: Span[] = [];

  plan.visible.forEach((planned, index) => {
    if (index > 0) spans.push(gapSpan(plan.gap));

    const column = byKey.get(planned.key);
    const cell: Cell | undefined = row.cells[planned.key];

    // The expand marker is the one cell C11 fills rather than reads (I16). A row
    // that cannot be opened leaves the column blank rather than drawing a marker
    // that does nothing when pressed.
    if (column?.role === "expand") {
      const marker = options.expandable
        ? glyphFor(row.expanded === true ? "collapse" : "expand", ctx.capabilities)
        : "";
      spans.push({
        text: fit(marker, planned.width, ctx.capabilities),
        style: tone("dim", ctx.theme, ctx.capabilities),
      });
      return;
    }

    const text = stripControl(cell === undefined ? "" : cell.text);
    const glyph = cell?.glyph === undefined ? "" : glyphFor(cell.glyph, ctx.capabilities);

    // The glyph is part of the cell's width, not an addition to it: a status
    // column declaring `minWidth` for "succeeded" plus its glyph is the surface
    // saying so (S03 §3), and a glyph added outside the plan would put every
    // column after it one cell right of its header.
    //
    // The separating space belongs to the pair, not to the glyph. S03's `glyph`
    // column is a glyph alone in a single cell, and a space appended
    // unconditionally made it two cells in a one-cell column — so it truncated,
    // and the frame showed `…` where every status glyph should have been. A
    // detail visible only in a golden, which is what D39 is for.
    const body = glyph === "" || text === "" ? glyph + text : `${glyph} ${text}`;

    // **Focus is rendered, never owned** (I15). It changes the tone and nothing
    // else — no marker, no extra row, no width. `measure` receives no focus at
    // all (C04 §5), so a focused row that occupied a different number of cells
    // or rows would be I9 broken by whichever row the user happened to be on.
    const style = options.focused
      ? tone("accent", ctx.theme, ctx.capabilities)
      : tone(cell?.tone ?? "default", ctx.theme, ctx.capabilities);

    // The end a cell truncates from is the surface's (C04 I32) — a path keeps its
    // filename, a config key its leaf, an image its tag. C11 reads the field and
    // never infers it: a column of paths and a column of prose are
    // indistinguishable from their contents.
    const from = column?.truncateFrom ?? "end";
    const cut = truncate(body, planned.width, ctx.capabilities, from);
    const fitted = column?.align === "right" ? padStart(cut, planned.width) : pad(cut, planned.width);

    spans.push({ text: fitted, style });
  });

  return spans;
}

/** The empty message, fitted — never a zero-row table (T1.10, T3.1). */
export function emptySpans(block: Table, width: number, ctx: RenderContext): readonly Span[] {
  const message = stripControl(block.emptyMessage ?? "Nothing to show.");
  return [
    {
      text: truncate(message, width, ctx.capabilities),
      style: tone("muted", ctx.theme, ctx.capabilities),
    },
  ];
}
