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
import { pairFor, sparkline, valueBar } from "../plot/index.js";
import { cells, stripControl, truncate, truncateParts } from "../text.js";
import type { AmbiguousWidth } from "../text.js";
import type { Cell, ColumnDef, Table, TableRow } from "../../data/viewmodel/index.js";
import type { RenderContext } from "../blocks/types.js";
import type { PlannedColumns } from "./plan.js";
import type { Alignment } from "./kind.js";
import { displayText, isMissing } from "./kind.js";

/** The gap between columns, as a span. */
function gapSpan(gap: number): Span {
  return { text: " ".repeat(Math.max(0, gap)) };
}

/**
 * The lead a series cell spends on its column's glyph slot (I23).
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
 * **The slot belongs to the column and is blank on a row with no mark.** Spent
 * per cell it gives one column two run lengths — a container at 59% drawing its
 * run in ten cells and one at 61% in eight — so the runs stop being comparable
 * exactly at the band boundary. C12 I20 has already ruled this of the other
 * allowance in the same cell: *the number's allowance belongs to the chart
 * rather than to the row*, because taken per row it inverts, 99 drawing 37 and
 * 100 drawing 36 with every count right. The run is the axis, and an axis that
 * changes length down a column is not one.
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
  reserved: boolean,
  width: number,
  ctx: RenderContext,
): Readonly<{ lead: string; room: number }> {
  if (!reserved) return { lead: "", room: width };
  // The mark where the cell has one, and the same number of cells blank where it
  // does not — which is what keeps every run in the column one axis.
  const mark = cell.glyph === undefined ? " " : glyphFor(cell.glyph, ctx.capabilities);
  const lead = `${mark} `;
  const room = width - cells(lead, ctx.capabilities.ambiguousWidth);
  return room >= 0 ? { lead, room } : { lead: "", room: width };
}

/**
 * The columns whose glyph slot is reserved: those where **any** row draws a
 * series beside a mark (I23).
 *
 * Computed once per render and handed down, rather than derived per row — a
 * per-row scan over `block.rows` would be quadratic, and a memo would be state
 * C11 is not allowed to hold (I11).
 */
/**
 * Where each `align: "decimal"` column's point sits, in cells (C11 I26, §099).
 *
 * **Derived rather than authored**, which is I26's ruling: a declared point is a
 * number the planner can contradict when a column yields width under
 * `R-TBL-005`, with nothing able to report the disagreement. The column's point
 * is the widest **integer part** among its own cells, so it is a property the
 * column has rather than one it is told.
 *
 * **Computed once per block, beside `markedSeriesColumns`.** `rowSpans` holds
 * the whole table and could take this every time it draws a row, which is the
 * same walk once per row — the reason the marked set is already hoisted.
 */
export function decimalPoints(
  block: Table,
  plan: PlannedColumns,
  ambiguous: AmbiguousWidth,
  /** Each column's resolved alignment (I27), from `columnAlignments`. */
  aligns: ReadonlyMap<string, Alignment>,
  /** The columns that group their thousands (I28), from `groupingColumns`. */
  grouping: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  return new Map([...decimalColumns(block, plan, ambiguous, aligns, grouping)].map(([k, c]) => [k, c.point]));
}

/**
 * Where each aligned decimal column's values **end** — its point plus its widest
 * fraction (C11 I29). A missing number's dash sits there, under the last digit,
 * which is where §078 draws it; the column's edge is further right whenever the
 * column is wider than its values.
 */
export function decimalEnds(
  block: Table,
  plan: PlannedColumns,
  ambiguous: AmbiguousWidth,
  aligns: ReadonlyMap<string, Alignment>,
  grouping: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  return new Map([...decimalColumns(block, plan, ambiguous, aligns, grouping)].map(([k, c]) => [k, c.end]));
}

/** The one walk `decimalPoints` and `decimalEnds` read: each aligned column's point and end. */
function decimalColumns(
  block: Table,
  plan: PlannedColumns,
  ambiguous: AmbiguousWidth,
  aligns: ReadonlyMap<string, Alignment>,
  grouping: ReadonlySet<string>,
): ReadonlyMap<string, Readonly<{ point: number; end: number }>> {
  const points = new Map<string, Readonly<{ point: number; end: number }>>();
  const widthOf = new Map(plan.visible.map((c) => [c.key, c.width]));
  for (const column of block.columns) {
    // **The resolved alignment, not the declared one** (I27). A numeric column
    // that declared nothing resolves to `decimal`, so it takes a point here
    // exactly as a declared one does — which is the whole of what makes the
    // default a refinement of `right` rather than a second behaviour.
    if (aligns.get(column.key) !== "decimal") continue;
    const room = widthOf.get(column.key);
    if (room === undefined) continue;
    let int = 0;
    let frac = 0;
    for (const row of block.rows) {
      const cell = row.cells[column.key];
      if (cell === undefined) continue;
      // **Measured over the text that will be DRAWN, not the bare value**
      // (I28). A separator is part of an integer part, so taking the point
      // first would put the column's point one cell left of where its own
      // values sit, once per separator — and every width assertion would still
      // be correct, which is what makes it worth a row of its own (T1.37).
      const text = displayText(cell.text, grouping.has(column.key));
      const whole = integerPart(text);
      int = Math.max(int, cells(whole, ambiguous));
      frac = Math.max(frac, cells(text.slice(whole.length), ambiguous)); // cells-ok — a code-unit offset
    }
    // **A column too narrow to hold the alignment falls back as a COLUMN**
    // (I26). Clamping each cell's lead to its own slack instead produced a
    // column whose points drift by one — `0.0372` and `0.941` a cell apart,
    // which reads as a defect rather than as a degradation, and is worse than
    // either alignment. Found by reading the frame; the counts were all correct.
    if (int + frac > room) continue;
    points.set(column.key, { point: int, end: int + frac });
  }
  return points;
}

/**
 * The part of a value before its point — the whole of it when there is none.
 *
 * **No point is all integer part**, and that is what makes §099's figure come
 * out without a case for each shape: `1284` ends where the point sits because
 * its integer part is four cells, and `3e-4` does the same for the same reason
 * rather than for a rule of its own.
 */
function integerPart(text: string): string {
  const at = text.indexOf(".");
  return at < 0 ? text : text.slice(0, at); // cells-ok — a code-unit offset
}

export function markedSeriesColumns(block: Table): ReadonlySet<string> {
  const marked = new Set<string>();
  for (const row of block.rows) {
    for (const [key, cell] of Object.entries(row.cells)) {
      if (cell === undefined || cell.glyph === undefined) continue;
      if (cell.bar !== undefined || cell.spark !== undefined) marked.add(key);
    }
  }
  return marked;
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
  /** Each column's resolved alignment (I27), from `columnAlignments`. */
  aligns: ReadonlyMap<string, Alignment>,
  /**
   * The ground the row is painted on — a surface name (I24, C10 I48).
   *
   * **Passed rather than assumed**, on `rowSpans`' own argument: *which ground
   * did this row take* is one question, and two answers to it is how the ink
   * and the ground stopped agreeing (F1240). The caller that paints the row is
   * the caller that names it here.
   */
  on?: string,
): readonly Span[] {
  const g = glyphs(ctx.capabilities);
  const dim = tone("muted", ctx.theme, ctx.capabilities, on);
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

    // **The header takes the column's *resolved* alignment, and the rule is the
    // one that already shipped** (I27, I21). A header that kept `left` over a
    // column its values right-align would put the label at one end and every
    // value beneath it at the other — I21's *every drawn row begins each column
    // at the same cell* holding while the frame reads as two tables. What I27
    // changes is only which value is read: a column that declared nothing now
    // has an answer here.
    //
    // **`decimal` is deliberately not included**, which is where this differs
    // from `rowSpans` below. A decimal column's right edge is **ragged on
    // purpose** — the fraction side is left-aligned after the point (I26, and
    // §099's own figure) — so the column's inline end is not where its data is,
    // and a header pushed there would sit past every value it names. Left is
    // the answer it has always had and the one §099's golden recorded.
    const align = aligns.get(planned.key);
    const text =
      align === "right"
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
  options: Readonly<{
    expandable: boolean;
    /**
     * **The ground this row is painted on** (C10 I48, I14) — a surface name,
     * absent being the page. One value, chosen by the caller that also picks
     * the wash, because *which ground did this row take* is one question and
     * two answers to it is how the ink and the ground stopped agreeing (F1240).
     */
    on?: string | undefined;
    /** The columns reserving a glyph slot (I23), from `markedSeriesColumns`. */
    marked: ReadonlySet<string>;
    /** Where each decimal column's point sits (I26), from `decimalPoints`. */
    points?: ReadonlyMap<string, number> | undefined;
    /** Each column's resolved alignment (I27), from `columnAlignments`. */
    aligns: ReadonlyMap<string, Alignment>;
    /** The columns that group their thousands (I28), from `groupingColumns`. */
    grouping: ReadonlySet<string>;
    /** The columns whose missing cells draw the absent mark (I29), from `unknownColumns`. */
    unknown?: ReadonlySet<string>;
    /** Where each aligned decimal column's values end (I29), from `decimalEnds`. */
    ends?: ReadonlyMap<string, number> | undefined;
  }>,
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
      // Stated rather than relied on — the day a token's ASCII half stops being
      // one cell this is a two-cell glyph in a one-cell column, and the site
      // that decides that is in a different component (C09 I21). **`AMBIGUOUS_TOKENS`
      // is gone**: the vocabulary takes its ASCII rung whole at `wide` now, so
      // the condition is about the half rather than about the member (C09 I48).
      spans.push({
        text: fitAt(marker, planned.width, ctx),
        style: tone("dim", ctx.theme, ctx.capabilities, options.on),
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
      const { lead, room } = seriesLead(cell, options.marked.has(planned.key), planned.width, ctx);
      const style = tone(cell.tone ?? "accent", ctx.theme, ctx.capabilities, options.on);
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
      const { lead, room } = seriesLead(cell, options.marked.has(planned.key), planned.width, ctx);
      const style = tone(cell.tone ?? "accent", ctx.theme, ctx.capabilities, options.on);
      if (lead !== "") spans.push({ text: lead, style });
      spans.push({ text: valueBar(cell.bar, room, ctx.capabilities), style });
      return;
    }

    // **A missing number is the absent mark** (I29, §078 `R-TBL-003`): *0 is a
    // measurement; blank is a rendering failure*. Muted, at the inline end,
    // which is where §078 draws it in both its decimal and its duration column —
    // and the mark `pairFor` gives a bar's missing value, so one fact keeps one
    // character. A cell with a glyph is not missing: the glyph is its content.
    if (
      options.unknown?.has(planned.key) === true &&
      (cell === undefined || (isMissing(cell.text) && cell.glyph === undefined))
    ) {
      // In an aligned decimal column the values end short of the column's edge,
      // and the dash ends where they do; everywhere else, at the edge.
      const end = Math.min(planned.width, options.ends?.get(planned.key) ?? planned.width);
      spans.push({
        text: pad(padStart(pairFor(ctx.capabilities).absent, end), planned.width),
        style: tone("muted", ctx.theme, ctx.capabilities, options.on),
      });
      return;
    }

    // **A run keeps its own tone, and the ground decides what that tone inks
    // as** (I14 as amended, C10 I48). The first form of this dropped a span's
    // tone on a focused or selected row, arguing that a row which kept it would
    // read as two things on the one occasion it must read as one. That was true
    // of a resolver with one ink per slot: there was the page's value or a
    // legible one and not both. The resolver takes the ground now, so a span's
    // tone resolves *against* the wash — the band's single ink where the theme
    // declares a band, which is the one-ink reading kept exactly where it was
    // ever true, and the theme's composed value where it does not (F1240).
    // **Grouped where the column groups** (I28). `spans` are code-unit offsets
    // into `text` and grouping splices into it, so a column with any span does
    // not group at all — clause 2 — and `runsOf` is therefore never handed a
    // string the offsets no longer address.
    const textRuns =
      cell === undefined
        ? []
        : runsOf(displayText(cell.text, options.grouping.has(planned.key)), cell.spans);
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

    // **Focus is rendered, never owned** (I14). It changes the ground and the
    // mark and no geometry — no extra row, no width. `measure` receives no
    // focus at all (C04 §5), so a focused row that occupied a different number
    // of cells or rows would be I9 broken by whichever row the user happened to
    // be on.
    //
    // **The cell keeps its own tone whatever the row's state**, and `on` is
    // what makes that legible: the ink is resolved against the ground the
    // caller laid, so §4k.2 row 1's third clause holds — failure keeps its
    // glyph, its word and its tone, on the ground selection took.
    const style = tone(cell?.tone ?? "default", ctx.theme, ctx.capabilities, options.on);

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
    // **The decimal arm splits the padding rather than putting it at one end**
    // (I26, §099). The integer part is right-aligned to the column's point and
    // everything from the point on is left-aligned after it; a value with no
    // point is all integer part and so **ends** at the point, which is what puts
    // `1284` under `0.941`'s point with no case of its own. The lead is clamped
    // to what the cell actually has, so a cut cell cannot push itself past its
    // own width.
    const align = options.aligns.get(planned.key);
    const point = align === "decimal" ? options.points?.get(planned.key) : undefined;
    // **A decimal column that could not align falls back to `right`, not left**
    // — the convention for numbers, and §099's complaint about `right` is that
    // it misaligns *points*, which a column with no room for them has anyway.
    const rightish = align === "right" || align === "decimal";
    const pointLead =
      point === undefined
        ? undefined
        : Math.max(0, Math.min(short, point - cells(integerPart(cut), ctx.capabilities.ambiguousWidth))); // cells-ok — a cell budget
    const pieces = [
      { text: pointLead !== undefined ? " ".repeat(pointLead) : rightish ? " ".repeat(short) : "" },
      { text: parts.prefix },
      ...sliceRuns(bodyRuns, parts.start, parts.kept.length), // cells-ok — a code-unit length
      { text: parts.suffix },
      { text: pointLead !== undefined ? " ".repeat(short - pointLead) : rightish ? "" : " ".repeat(short) },
    ];

    spans.push(...paintRuns(pieces, style, { ...ctx, on: options.on }));
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
