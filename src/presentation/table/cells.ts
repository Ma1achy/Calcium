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
import { fit, padStart, paintRuns, tone, type Span } from "../blocks/paint.js";
import { runsOf, runsText, sliceRuns } from "../runs.js";
import { sparkline, valueBar } from "../plot/index.js";
import { cells, stripControl, truncate, truncateParts } from "../text.js";
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

    // The expand marker is the one cell C11 fills rather than reads (I15). A row
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

    // **A `spark` cell is C12's, and it arrives as a function rather than a
    // block** (C12 §2). A cell is not a block, so it cannot come through C09's
    // registry, and rendering it as a `plot` would drag block dispatch into a cell.
    // The import is the one sideways edge inside L1 that this file makes — legal
    // because A02 §1 forbids cycles rather than sideways edges, and kept
    // one-directional by MG22.
    //
    // Exactly `planned.width` cells and exactly one row (C12 I13), so a column
    // holding one is the same height as a column without and the planner is
    // indifferent to it. Which is why this returns before the truncation below:
    // the series is already the width, and truncating it would drop the most
    // recent samples — the ones it was shown for.
    if (cell?.spark !== undefined) {
      spans.push({
        text: sparkline(cell.spark, planned.width, ctx.capabilities),
        style: tone(cell.tone ?? "accent", ctx.theme, ctx.capabilities),
      });
      return;
    }

    // **A `bar` cell is the same seam as `spark`** (C12 §3b, C12 I20): exactly
    // `planned.width` cells and one row, so it returns before the truncation
    // below for the same reason — the run is already the width, and truncating
    // it would shorten the axis rather than the text.
    //
    // C04 I50c refuses a cell carrying both, so the order of these two branches
    // decides nothing.
    if (cell?.bar !== undefined) {
      spans.push({
        text: valueBar(cell.bar, planned.width, ctx.capabilities),
        style: tone(cell.tone ?? "accent", ctx.theme, ctx.capabilities),
      });
      return;
    }

    const textRuns = cell === undefined ? [] : runsOf(cell.text, cell.spans);
    const text = runsText(textRuns);
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
    // **The glyph is its own run, so a span's offsets stay offsets into `text`**
    // (C04 §3am cell 7): a lead of `glyph + " "` is prepended as a piece, never
    // spliced into the string the offsets address.
    const lead = glyph !== "" && text !== "" ? `${glyph} ` : glyph;
    const body = lead + text;
    const bodyRuns = lead === "" ? textRuns : [{ text: lead }, ...textRuns];

    // **Focus is rendered, never owned** (I14). It changes the tone and nothing
    // else — no marker, no extra row, no width. `measure` receives no focus at
    // all (C04 §5), so a focused row that occupied a different number of cells
    // or rows would be I9 broken by whichever row the user happened to be on.
    const style = options.focused
      ? tone("accent", ctx.theme, ctx.capabilities)
      : tone(cell?.tone ?? "default", ctx.theme, ctx.capabilities);

    // The end a cell truncates from is the surface's (C04 I30) — a path keeps its
    // filename, a config key its leaf, an image its tag. C11 reads the field and
    // never infers it: a column of paths and a column of prose are
    // indistinguishable from their contents.
    const from = column?.truncateFrom ?? "end";
    // `truncateParts` with the surface's end: `kept` is an exact slice of the
    // body from `start`, so the runs are cut against it and the marker — at
    // either end — is painted outside every span (C04 I86).
    const parts = truncateParts(body, planned.width, ctx.capabilities, from);
    const cut = parts.prefix + parts.kept + parts.suffix;
    const short = Math.max(0, planned.width - cells(cut, ctx.capabilities.ambiguousWidth));
    const pieces = [
      { text: column?.align === "right" ? " ".repeat(short) : "" },
      { text: parts.prefix },
      ...sliceRuns(bodyRuns, parts.start, parts.kept.length), // cells-ok — a code-unit length
      { text: parts.suffix },
      { text: column?.align === "right" ? "" : " ".repeat(short) },
    ];

    spans.push(...paintRuns(pieces, style));
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
