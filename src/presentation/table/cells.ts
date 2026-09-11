/**
 * A planned row, as spans.
 *
 * Plain text first, styled last — `paint.ts`'s rule, and the reason every width
 * decision above is taken on unstyled strings. Widths come from the plan; nothing
 * here measures anything the planner did not already account for.
 *
 * **`cells()` and never `.length`** (C09 I6, A03 SS23). The planner and the
 * renderer must agree to the cell, and `fitAt` is where truncation and padding
 * meet in one place so they cannot disagree.
 */
import { glyphFor, glyphs } from "../blocks/glyphs.js";
import { pad, padStart, paintRuns, tone, type Span } from "../blocks/paint.js";
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
 * The lead a `bar` or `spark` cell spends on its glyph (I23).
 *
 * **C04 I6 obliges the mark and this is where it is paid for.** A cell toned
 * `error` or `warn` carries a glyph, enforced at construction, so a surface
 * drawing a load bar must supply one — and both series branches used to return
 * before the line that reads it, so no bar cell has ever drawn one. Four golden
 * frames recorded the absence and two are ASCII, where the tone is the only
 * other carrier and there is none (F1104).
 *
 * **Inside the planned width, never beside it** — the same rule the text path
 * states, *part of the cell's width, not an addition to it*. The series is then
 * handed what the mark leaves, so C12 I13 and I20's *exactly `width` cells and
 * one row* holds by construction and C04 I50c's *takes the planned width* stays
 * a claim about the cell.
 *
 * **The separator is unconditional here where the text path makes it
 * conditional**: there an empty text would leave a glyph-only column two cells
 * wide, and here there is always a series after the mark.
 *
 * **The mark is dropped only where it does not fit**, and never on a judgement
 * about how narrow is too narrow. That clause was in I23's first form and the
 * frame falsified it: at a planned width of 3 a toned cell draws `▲ …` where an
 * untoned one draws `10…` for a value of 101.2, and C12 I20 has already ruled on
 * that comparison in its other arm — a truncated number is a different number.
 * How a series degrades is C12's (I20, I13), so reaching for it here would put
 * one decision in two components.
 *
 * **The lead is two cells at every convention**, because C09 I48 resolves an
 * Ambiguous slot to its ASCII half at `"wide"` and both renderings of every slot
 * are one cell. `cells()` states that rule rather than measuring a variable —
 * a literal 2 here would be the second source, and C09 T2.5 is what goes red the
 * day a token's two renderings differ.
 */
function seriesLead(
  cell: Cell,
  width: number,
  ctx: RenderContext,
): Readonly<{ lead: string; room: number }> {
  if (cell.glyph === undefined) return { lead: "", room: width };
  const lead = `${glyphFor(cell.glyph, ctx.capabilities)} `;
  const room = width - cells(lead, ctx.capabilities.ambiguousWidth);
  return room >= 0 ? { lead, room } : { lead: "", room: width };
}

/**
 * Exactly `width` cells **at the session's convention** — truncated if long,
 * padded if short (I21).
 *
 * **This is C09's `fit` with the one argument it cannot take.** `fit`'s parameter
 * is `Pick<TerminalCapabilities, "unicode">`, so it cannot ask about
 * `ambiguousWidth`; it forwards the record it is handed to `truncate` — which
 * reads the field structurally and cuts at the session's convention — and then
 * calls `pad` with no convention at all, whose default is `"narrow"`. The two
 * halves of the one function that exists to make truncation and padding agree
 * therefore measure differently, and the disagreement is one cell per Ambiguous
 * character at `ambiguousWidth: "wide"`.
 *
 * It reaches a frame here and nowhere else in C11, because a column label is
 * far-side text: `Δt`, `°C`, `µs`, `±`, a box rule in a heading. `rowSpans`
 * below already pads at `ctx.capabilities.ambiguousWidth`, so an over-padded
 * header is a header that starts its columns one cell to the right of every row
 * beneath it — one frame, two answers to where a column starts (F1019).
 *
 * The right form is already in the tree three components over: C12's
 * `furniture.ts` and `circle.ts` write `pad(truncate(text, w, caps), w,
 * ambiguous)` at every site. This is that expression, named once for C11's three
 * callers. Widening `fit` itself is C09's to do and closes the class — its third
 * caller is `blocks/kinds/status.ts`.
 */
function fitAt(text: string, width: number, ctx: RenderContext): string {
  return pad(truncate(text, width, ctx.capabilities), width, ctx.capabilities.ambiguousWidth);
}

/**
 * The header row: labels, dim, with the sort indicator on the active column.
 *
 * The indicator is appended inside the column's planned width (C11 §4), so a
 * label that no longer fits truncates rather than pushing the row wider than the
 * plan. The columns beneath it are the authority on where each column starts.
 *
 * **And the indicator is not the only way a header can widen** (I21). §4's
 * sentence names it because an indicator is the thing C11 appends; the padding
 * is the thing C11 completes, and a pad measured at a convention the row beneath
 * does not use widens the column for the header alone. Both go through `fitAt`.
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
        ? padStart(
            truncate(label + indicator, planned.width, ctx.capabilities),
            planned.width,
            ctx.capabilities.ambiguousWidth,
          )
        : fitAt(label + indicator, planned.width, ctx);

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
  options: Readonly<{ expandable: boolean; focused: boolean; selected?: boolean }>,
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
      // `fitAt` and not `fit` for the reason above, even though the internal
      // glyph table cannot reach it today: `glyphFor` collapses `expand` and
      // `collapse` to `>` and `v` at `ambiguousWidth: "wide"` (C09 I48), so the
      // marker is one cell under both conventions and the two padders agree.
      // Stated rather than relied on — the day a token leaves `AMBIGUOUS_TOKENS`
      // this is a two-cell glyph in a one-cell column, and the site that decides
      // that is in a different component (I21).
      spans.push({
        text: fitAt(marker, planned.width, ctx),
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
      const { lead, room } = seriesLead(cell, planned.width, ctx);
      const style = tone(cell.tone ?? "accent", ctx.theme, ctx.capabilities);
      // The mark is its own run for the reason the text path gives: a span's
      // offsets stay offsets into the series rather than into a spliced string.
      if (lead !== "") spans.push({ text: lead, style });
      spans.push({ text: sparkline(cell.spark, room, ctx.capabilities), style });
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
      const { lead, room } = seriesLead(cell, planned.width, ctx);
      const style = tone(cell.tone ?? "accent", ctx.theme, ctx.capabilities);
      if (lead !== "") spans.push({ text: lead, style });
      spans.push({ text: valueBar(cell.bar, room, ctx.capabilities), style });
      return;
    }

    const spanned = cell === undefined ? [] : runsOf(cell.text, cell.spans);
    // **A focused row drops a span's tone as it drops the cell's** (I14, C09
    // §5): focus replaces `cell.tone` with `accent` below, and a span's `tone`
    // is the same claim at a finer grain — a row that kept it would read as two
    // things on the one occasion it must read as one. Attributes and a value
    // are not claims about the foreground and survive.
    // A selected row drops them the same way (I14): its ink is `default`, the
    // one slot C10 §4b measured over the wash, and a span's own tone would be
    // a second claim on the one occasion the row must read as one thing.
    const textRuns = options.focused || options.selected === true
      ? spanned.map((run) => {
          if (run.tone === undefined) return run;
          const { tone: _focusTakesIt, ...rest } = run;
          return rest;
        })
      : spanned;
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
    //
    // **Selected is the same rule, one more state** (I14): `default` ink, and
    // the caller lays the wash over the whole row. `focused` wins where both
    // hold — the head is painted as the head.
    const style = options.focused
      ? tone("accent", ctx.theme, ctx.capabilities)
      : options.selected === true
        ? tone("default", ctx.theme, ctx.capabilities)
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

    spans.push(...paintRuns(pieces, style, ctx));
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
