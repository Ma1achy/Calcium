/**
 * `rule`, `notice`, `tip`, `progress`, `pills`, `raw`.
 *
 * Six kinds whose measure is arithmetic over one field. Each pair is written
 * together and reviewed together (commitment 3): the two halves share a
 * `layout` function so that the only way they can disagree is if someone edits
 * one of them and not the call.
 */
import type { AmbiguousWidth } from "../../text.js";
import { atLeastOne, normaliseWidth } from "../../../data/viewmodel/index.js";
import type { Glyph, Notice, Pills, Progress, Raw, Rule, Tip, Tone } from "../../../data/viewmodel/index.js";
import { cells, stripControl, truncate, truncateParts, wrapCells } from "../../text.js";
import type { Run } from "../../runs.js";
import { runLines, runsOf, runsText, sliceRuns, wrapRuns } from "../../runs.js";
import { NO_STYLE, rampStyle } from "../../theme/index.js";
import { animateT, effectiveTick, extentT } from "../ramp.js";
import { barStyle, glyphFor, glyphCells, glyphs, headMark } from "../glyphs.js";
import { background, clampSpans, focusStyle, pad, paint, paintRuns, rows, selectionStyle, tone, withBackground, type Span } from "../paint.js";
import type { BlockDefinition, NavElement, RenderContext, Windowed, Rendered } from "../types.js";

/** Chips in a `pills` row are separated by two spaces — one is too close to read. */
const CHIP_GAP = 2;

/**
 * The width prose actually wraps at, given a glyph or marker in front of it.
 *
 * C04 §3's `ceil(len / w)` assumes the whole width is available to the text,
 * and it is not: an `error` notice always carries a glyph (C04 I6), so it
 * always has two fewer columns than the formula supposes. Both halves call this
 * rather than either restating it.
 */
function proseWidth(width: number, prefix: number): number {
  return normaliseWidth(normaliseWidth(width) - prefix);
}

/**
 * The tokens whose gutter carries a leading cell, and why there is exactly one.
 *
 * **`continuation` is the only token that names a relationship rather than a
 * state** (C09 §4), and a subordination mark drawn flush left is not
 * subordinate to anything: `⎿ queued` sat in the same two-cell gutter as the
 * prompt's `❯`, so the two texts aligned and the notice read as the prompt's
 * *sibling* — the one relationship the mark exists to deny. Every assertion
 * passed with it wrong; only a frame-read says otherwise.
 *
 * **A gutter and not a field, and the replacement has since landed.** An
 * `indent` on `Notice` was the second spacing field `Gap`'s note was waiting
 * for, and that note has now been answered the way it asked: `gapBefore` became
 * `padding` (C04 §3a), a replacement rather than an addition. **The ruling here
 * is unchanged and is worth restating now that a general `padding.l` exists**:
 * the depth belongs to the mark, which already knows it is a mark, and a
 * horizontal padding declared per notice would be a second author of the same
 * gutter — the duplication R19 refused, one level down.
 *
 * **Two cells, because that is where the command's text starts.** The mark
 * belongs under the first cell of the line it is subordinate to, and
 * `PROMPT_GUTTER.first` is 2 — so the mark lands beneath the command's first
 * character and its own text one gutter further in, which is the figure
 * `AGENT_TUI_DESIGN.md` §A1 draws. One cell was the first attempt and it puts
 * the mark *between* the two columns, subordinate to neither.
 *
 * **The constant is in L4 and this is L1, so it is a literal and a test holds
 * the two together** (T2.99). A number written here and satisfied in
 * `shell/config.ts` is exactly the deferral shape this project keeps finding —
 * a condition recorded in one file and met in another, with nobody holding
 * both halves — so the coupling is asserted rather than described.
 */
const GLYPH_INDENT: ReadonlyMap<Glyph, number> = new Map<Glyph, number>([
  ["continuation", 2],
]);

/**
 * The tokens drawn on **every** row rather than on the first — a rail (C09 I41,
 * C04 I95).
 *
 * **A property of the token, as the indent above is.** A quotation's gutter runs
 * the height of what it quotes; a status mark sits on the line it is about. That
 * difference belongs to the mark, which already knows which it is, so the block
 * schema learns nothing and `measure` still receives no capability.
 *
 * **The geometry cannot move**, which is what makes this safe: `prefixCells`
 * already subtracts the gutter from every row's width so the continuation rows
 * hang under the text, and those columns are reserved and blank on rows 1..n
 * whether or not anything is drawn in them. A rail fills them.
 *
 * **The frame is the only instrument that separates the two.** A quotation
 * carrying an ordinary glyph draws its mark once and its remaining rows under a
 * blank — same rows, same width, same reserved columns, every count agreeing.
 * `continuation`'s indent one property along, found the same way.
 */
const GLYPH_RAIL: ReadonlySet<Glyph> = new Set<Glyph>(["quote"]);

/**
 * Whether this notice is a call's head — one block-level element with or
 * without an `action` (C09 I47, F831). A call's head is the line a reader acts on — `⏎`
 * folds its body, `y` copies its invocation — and `noticeElements`' gate,
 * *no action, no element*, is right for every other notice: a muted status line
 * is not a place to stand.
 *
 * **The test is the call state, not the glyph token.** It used to be
 * `glyph === "step"`, and that slot is gone: above the monochrome rung the head
 * mark is `running`'s `●` for every state, which a muted `running` notice could
 * also hold, and at 1 bit it is five different tokens. A predicate over the
 * character would have answered differently at different capabilities, which is
 * a focus ring that changes shape when the terminal does. `state` is on the
 * block, is capability-free, and is present on exactly the notices that are
 * call heads.
 *
 * It is also **one committed row, fitted rather than wrapped** (C09 I46), for
 * the same reason and by the same test: a head that wraps is two heads to a
 * reader skimming the gutter, so the run its spans mark `elide` gives way
 * first, from its end, and the whole row last. `measure` answers 1 without a
 * capability; the fitting happens where the capabilities are, in `render`.
 */
const isCallHead = (block: Notice): boolean => block.state !== undefined;

/** Whether a notice stands in the focus ring (I47): an action, or a call state. */
function declaresElement(block: Notice): boolean {
  return block.action !== undefined || isCallHead(block);
}

/**
 * The exact string a glyph draws on a notice's first row.
 *
 * **The one place the lead exists**, because `prefixCells` below is its cell
 * count and the two disagreeing is how the hanging indent slips: the first row
 * would carry the extra cell and every continuation row would not, or the
 * reverse, and both are frames that measure correctly and are wrong.
 */
function glyphLead(glyph: Glyph, caps: RenderContext["capabilities"]): string {
  return `${" ".repeat(GLYPH_INDENT.get(glyph) ?? 0)}${glyphFor(glyph, caps)} `;
}

/**
 * The cells a leading glyph and its trailing space occupy.
 *
 * Takes the *token*, not a character, and needs no capabilities: both
 * renderings are the same width by C09 §4's 1:1 rule, which is what lets
 * `measure` be correct without seeing a capability record (C04 §5). The
 * indent is a property of the token too, so it costs the measurer nothing.
 */
function prefixCells(glyph: Glyph | undefined): number {
  if (glyph === undefined) return 0;
  return glyphCells(glyph) + 1 + (GLYPH_INDENT.get(glyph) ?? 0);
}

// --- rule ------------------------------------------------------------------

export const ruleDefinition: BlockDefinition<Rule> = {
  kind: "rule",

  measure: () => 1,

  render(block: Rule, ctx: RenderContext): Rendered {
    const g = glyphs(ctx.capabilities);
    const width = normaliseWidth(ctx.width);
    // **The label before the clamp, which is the whole point of the gauge**
    // (C28 I45). `stripControl` walks every character the application supplied;
    // the truncation below is what makes the *drawn* row a constant, and it is
    // therefore what hides an unbounded label from every downstream figure. A
    // rule measures 1 at every width and every label, so nothing else in the
    // report can say why a frame full of them is slow.
    ctx.probe?.gauge("rule.label", block.label.length); // cells-ok — an input size, not a display width
    const label = stripControl(block.label);
    // **Three tiers, and the fill is the whole axis** (C09 I40, C04 I94). The
    // lead stays two cells and the label stays in its column, so `measure` is 1
    // at every tier and the tiers differ where the eye already is.
    //
    // **The blank fill is drawn rather than dropped**: spaces to the width, so
    // `meta` stays at the right edge and the row is exactly the width at every
    // tier — a tier that shortened the row would put a second geometry on a kind
    // whose whole claim is that it has one.
    //
    // **An empty label takes the weight back.** I21 says an empty label draws an
    // unbroken line, and at tier 3 the two rules meet in one cell: a two-cell
    // lead with nothing after it is not a rule at all.
    const weight = block.level === 1 ? g.heavyHorizontal : g.horizontal;
    const fillChar = block.level === 3 && label !== "" ? " " : weight;
    const meta = block.meta === undefined || block.meta === "" ? "" : ` ${stripControl(block.meta)}`;

    // `\u2500\u2500 label \u2500\u2500\u2500\u2500 meta`. The fill takes what the two ends leave; the
    // label truncates before the fill goes negative, so the row is exactly the
    // width at every width.
    // **An empty label draws an unbroken line** (I21). The spaces either side
    // of the label are what set it apart from the fill; with no label they are
    // a two-cell gap at the left of a rule that is a boundary rather than a
    // heading. Found by reading C19's menu edge in a frame — the block was
    // present, the row was exactly the width, and every assertion held.
    const lead = label === "" ? weight.repeat(2) : `${weight.repeat(2)} `;
    const gap = label === "" ? 0 : 1;
    const room = width - cells(lead, ctx.capabilities.ambiguousWidth) - gap - cells(meta, ctx.capabilities.ambiguousWidth);
    // The label's spans ride inside `kept` and the marker sits outside them
    // (C04 I86); with no spans the pieces coalesce to the one span this always
    // painted, so a plain rule's bytes are unchanged.
    const { kept, suffix } = truncateParts(label, Math.max(0, room), ctx.capabilities);
    const shown = kept + suffix;
    const fill = Math.max(0, width - cells(lead, ctx.capabilities.ambiguousWidth) - cells(shown, ctx.capabilities.ambiguousWidth) - gap - cells(meta, ctx.capabilities.ambiguousWidth));

    const dim = tone("dim", ctx.theme, ctx.capabilities);
    const accent = tone("accent", ctx.theme, ctx.capabilities);
    return rows([
      paint(
        clampSpans(
          [
            { text: lead, style: dim },
            ...paintRuns(
              [...sliceRuns(runsOf(block.label, block.spans), 0, kept.length), { text: suffix }], // cells-ok
              accent,
              ctx,
            ),
            { text: `${" ".repeat(gap)}${fillChar.repeat(fill)}`, style: dim },
            { text: meta, style: tone("meta", ctx.theme, ctx.capabilities) },
          ],
          width,
          ctx.capabilities,
        ),
      ),
    ]);
  },
};

// --- notice ----------------------------------------------------------------

/**
 * The rows a notice occupies — **the one layout function both halves call**
 * (commitment 3, C04 I90).
 *
 * **Runs first, then the wrap** (C04 I86, §3am): the spans are cut from the
 * text by offset, each run is stripped on its own, and the wrapper slices the
 * runs by each row's source `start` — never by adding up row lengths, which
 * drift by one unit at every dropped break space. With no valued span this is
 * `wrapCells(stripControl(text), width)` row for row; with one, the valued run
 * is an atom the wrapper keeps whole (C09 §5), which is the one way a span
 * reaches geometry — so `measure` goes through here and not through
 * `wrapCells`, or the two halves would disagree by a row exactly where a token
 * moved.
 */
function noticeRows(
  block: Notice,
  width: number,
  caps?: RenderContext["capabilities"],
): readonly (readonly Run[])[] {
  const runs = runsOf(block.text, block.spans);
  const budget = proseWidth(width, prefixCells(block.glyph));
  if (isCallHead(block)) {
    // One row by construction (I46). Without capabilities — the measurer's
    // call — the runs are returned unfitted: a row count of one is the whole of
    // what `measure` needs, and the marker's width is a capability's to say.
    return [caps === undefined ? runs : fitRuns(runs, budget, caps)];
  }
  return wrapRuns(runs, budget);
}

/**
 * The fitter (C09 I46, C04 I105): the runs marked `elide` shorten first, the
 * last of them first, each from its end through `truncate`; the whole row is
 * cut only when every elide run is down to its marker. A run outside the mark
 * is byte-identical to what it was for as long as any of the argument remains.
 */
function fitRuns(runs: readonly Run[], budget: number, caps: RenderContext["capabilities"]): readonly Run[] {
  const width = (r: Run): number => cells(r.text, caps.ambiguousWidth);
  let excess = runs.reduce((n, r) => n + width(r), 0) - budget;
  if (excess <= 0) return runs;
  const out = [...runs];
  for (let i = out.length - 1; i >= 0 && excess > 0; i -= 1) { // cells-ok — an array index
    const run = out[i];
    if (run === undefined || run.elide !== true) continue;
    const have = width(run);
    // At least the marker: an argument reduced to `…` still says *there was
    // one*, where an empty run leaves two separators touching.
    const shortened = { ...run, text: truncate(run.text, Math.max(1, have - excess), caps, "end") };
    out[i] = shortened;
    excess -= have - width(shortened);
  }
  if (excess <= 0) return out;
  // The whole row last, sliced against `kept` so the spans ride inside it and
  // the marker sits outside them (C04 I86) — `rule`'s label does the same.
  const { kept, suffix } = truncateParts(runsText(out), budget, caps);
  return [...sliceRuns(out, 0, kept.length), { text: suffix }]; // cells-ok — a code-unit length
}

/**
 * One block-level element — the whole notice — exactly when it carries an
 * `action` (C04 §3, C26 §5; arc 6 §5). A notice is the button: `activate` is
 * the action itself and `copy` the text from the data (C26 I17). Without an
 * action the list is **empty**, not a place to stand — a reader stepping `↓`
 * through a transcript of notices would otherwise stop on every one of them.
 * The rows are `noticeRows`' own, so the element is where the block is drawn.
 */
function noticeElements(block: Notice, width: number): readonly NavElement[] {
  // **Or it is a call head** (I47): a call's head stands in the
  // ring whether or not the composer gave it a fold to toggle; `activate` is
  // the action when there is one and absent otherwise.
  if (!declaresElement(block)) return Object.freeze([]);
  const w = normaliseWidth(width);
  return Object.freeze([
    Object.freeze({
      id: block.id,
      level: "block" as const,
      rows: Object.freeze({ from: 0, to: atLeastOne(noticeRows(block, w).length) }), // cells-ok — a row count
      cols: Object.freeze({ from: 0, to: w }),
      ...(block.action === undefined ? {} : { activate: block.action }),
      copy: block.text,
    }),
  ]);
}

/**
 * How many cells of the head a trail covers (C09 I90, §7e).
 *
 * **Three, and the design names no number.** §026 costs its own example at one
 * cell and at three — *about two repaints per cell at a one-cell band, four at
 * three* — so three is the wider of the two figures the design itself works
 * with. Decided rather than specified, and recorded as such.
 */
const TRAIL_CELLS = 3;

/**
 * The head colour each form arrives in (C04 §5c, C04 I123).
 *
 * **`fade`'s head is a decided value.** §026 says *the newest character IS the
 * ground and emerges toward the ink*, and a `Ramp` is closed to `Tone` so no
 * member can hold a colour value (C10 I16) — there is no tone that names the
 * surface. `muted` is the dimmest legal head and is what *emerges toward the
 * ink* reads as through this mechanism; the design's own word is *the ground*,
 * and the gap is parked rather than papered over.
 */
const TRAIL_HEAD: Readonly<Record<"hotEdge" | "fade" | "hue" | "ripple", Tone>> = Object.freeze({
  hotEdge: "accent",
  fade: "muted",
  hue: "accent",
  ripple: "accent",
});

/**
 * The trail's band, laid over the head of a streaming notice (C09 I90, I91, §7e).
 *
 * **Derived here because only here knows the width** (C04 I122). The block says
 * it is streaming; which cells are in the band is this layer's arithmetic, and
 * a producer writing the span would be writing an offset it cannot compute.
 *
 * **Over the text, so chrome is whole by construction** (`R-BLK-198`). The rows
 * handed in are the wrapped *text*; the head mark is added by the caller after
 * this runs, so there is no rule for the renderer to remember — a header has no
 * position in the stream, so it exists complete or not at all.
 *
 * **The target is the run's own ink** (C04 I123, `R-BLK-196`): `hotEdge` and
 * `fade` cool to whatever tone the run already carries, `hue` to the block's
 * body tone. A trail whose target is fixed repaints a dim run to white, which
 * is a defect that reads as a styling choice.
 *
 * **Geometry is untouched**: this restyles cells that are drawn anyway, so
 * `measure` is the same number with a trail and without one.
 */
function withTrail(
  wrapped: readonly (readonly Run[])[],
  block: Notice,
  ambiguous: AmbiguousWidth,
  colourDepth: number,
): readonly (readonly Run[])[] {
  if (block.streaming !== true) return wrapped;
  const form = block.trail ?? "hotEdge";
  // **At 1-bit the four colour forms draw nothing rather than something else**
  // (I91). Substituting a mark would spend a cell the block never reserved, and
  // substituting bold for every form would make four names one.
  if (colourDepth === 1 && form !== "weight") return wrapped;

  const last = wrapped.length - 1; // cells-ok — an array index
  const line = wrapped[last];
  if (line === undefined) return wrapped;
  const text = runsText(line);
  const total = cells(text, ambiguous);
  if (total === 0) return wrapped;

  // Where the band starts, in code units: walk back from the end until the tail
  // is `TRAIL_CELLS` wide. A whole band on a short line is the whole line —
  // "never reaching further than the text" (I90).
  let start = text.length; // cells-ok — a code-unit cursor
  while (start > 0 && cells(text.slice(start - 1), ambiguous) <= TRAIL_CELLS) start -= 1; // cells-ok — a code-unit cursor
  if (start >= text.length) return wrapped; // cells-ok — a code-unit comparison

  const head = sliceRuns(line, 0, start);
  const band = sliceRuns(line, start, text.length - start); // cells-ok — a code-unit length
  if (band.length === 0) return wrapped; // cells-ok — a run count

  const banded: Run[] = [];
  let at = 0; // graphemes-ok — the run's place in its ramped span
  const of = band.reduce((n, r) => n + [...r.text].length, 0); // cells-ok — a cluster count
  for (const run of band) {
    if (form === "weight") {
      banded.push({ ...run, attrs: { ...run.attrs, bold: true } });
      continue;
    }
    const target = form === "hue" ? block.tone : (run.tone ?? block.tone);
    const ramp = {
      fill: "gradient" as const,
      from: TRAIL_HEAD[form],
      to: target,
      ...(form === "ripple" ? { animate: "ripple" as const } : {}),
    };
    const count = [...run.text].length; // cells-ok — a cluster count
    banded.push({ ...run, ramp: { ramp, at, of, ordinal: 0 } });
    at += count; // graphemes-ok — a cluster cursor
  }

  const out = [...wrapped];
  out[last] = [...head, ...banded];
  return out;
}

export const noticeDefinition: BlockDefinition<Notice> = {
  kind: "notice",

  // §7a — prose copies as its text (I86, `R-SEL-004`). The tone is a
  // rendering and the wrap is the frame's; neither reaches the source.
  copy: (block) => block.text,

  measure: (block: Notice, width: number): number => atLeastOne(noticeRows(block, width).length), // cells-ok

  // C09 §2c — the hanging indent plus the longest wrapped row. Every row still
  // fits at that width, so the wrap is the same wrap and the height holds (I43).
  width: (block: Notice, width: number): number => {
    const w = normaliseWidth(width);
    let longest = 0;
    for (const row of noticeRows(block, w)) longest = Math.max(longest, cells(runsText(row))); // narrow-ok — `width` is pure in (block, width) as `measure` is (C09 I42), and narrow is the measurer's convention
    return Math.max(1, Math.min(w, prefixCells(block.glyph) + longest));
  },

  elements: noticeElements,

  render(block: Notice, ctx: RenderContext): Rendered {
    // **Focused: the notice's own tone over the FOCUS ground** (C09 I83, C10
    // I47, R-SEL-006). This was `accent` over the *selection* ground, which
    // dropped the notice's tone to avoid drawing a focused `info` notice as an
    // unfocused `accent` one — a workaround for focus and selection sharing one
    // ground. They no longer do: `focusGround` is focus's own channel, so the
    // tone stays the notice's, which is the design's *colour is declared, not
    // inherited* (§017). **The geometry does not move** — no column is reserved
    // here, because a notice has no rows to point at and the mark belongs to the
    // block that does (C11 I15, §5b), and a reservation here shifted a head two
    // cells while leaving its `⎿` body behind (T1.48). The
    // id tested is the one the session writes — the element's, which is the
    // block's (`noticeElements`, `focusFor`) — and only a notice that declares
    // an element (an action, or a call state — I47) can reach this arm.
    const focused =
      declaresElement(block) && ctx.focus !== null && ctx.focus.blockId === block.id && ctx.focus.rowId === block.id;
    // **The ink is resolved against the ground it lands on** (C10 I48): a
    // focused notice keeps its own tone and takes the value the theme composed
    // for `focusGround`, which on a banded theme is the band's single ink.
    const style = focused
      ? { ...tone(block.tone, ctx.theme, ctx.capabilities, "focusGround"), ...focusStyle(ctx.theme, ctx.capabilities) }
      : tone(block.tone, ctx.theme, ctx.capabilities);
    const prefix = prefixCells(block.glyph);
    // **The band, over the wrapped text and before the glyph is added** (I90,
    // §7e): chrome is composed whole, and putting the derivation here is what
    // makes that structural rather than a rule the row below has to remember.
    const wrapped = withTrail(
      noticeRows(block, ctx.width, ctx.capabilities),
      block,
      ctx.capabilities.ambiguousWidth,
      ctx.capabilities.colourDepth,
    );
    // **The wrapped rows, not the text's length** (C28 I45). `noticeRows` is
    // what the cost is in and `wrapped` is already here, so the gauge is free —
    // and it is the number that moves when a notice gets slow, because the wrap
    // is per row and the text is walked once.
    ctx.probe?.gauge("notice.rows", wrapped.length); // cells-ok — a count of rows, not a display width
    // **Separately, because two inputs grow independently.** A one-row notice
    // with two hundred spans and a two-hundred-row notice with none are the same
    // number under either gauge alone, and they are not the same cost.
    ctx.probe?.gauge("notice.spans", block.spans?.length ?? 0); // cells-ok — a count of runs
    // The block's colormap reaches the painter by name; a valued run reads it
    // there and nowhere else (C04 I90).
    const paintCtx = { theme: ctx.theme, capabilities: ctx.capabilities, tick: ctx.tick, ...(block.colormap === undefined ? {} : { colormap: block.colormap }) };

    // A hanging indent: the glyph sits on the first row and the continuation
    // aligns under the text rather than under the glyph. That alignment is why
    // the prefix comes out of every row's width, not only the first.
    //
    // **A rail is the exception, and it costs no geometry** (I41): the columns
    // are already reserved on every row, so `quote` fills what was blank there.
    const rail = block.glyph !== undefined && GLYPH_RAIL.has(block.glyph);
    return rows(
      wrapped.map((line, index) =>
        paint([
          {
            text:
              (index === 0 || rail) && block.glyph !== undefined
                ? glyphLead(
                    // **The head mark is resolved here and nowhere else** (I45):
                    // the block carries the call's state and the character is a
                    // function of whether tone can carry it. Geometry is
                    // untouched — every candidate is one cell with no indent.
                    block.state !== undefined ? headMark(block.state, ctx.capabilities) : block.glyph,
                    ctx.capabilities,
                  )
                : " ".repeat(prefix),
            style,
          },
          ...paintRuns(line, style, paintCtx),
        ]),
      ),
    );
  },
};

// --- tip -------------------------------------------------------------------

/**
 * A tip's actions are part of its text, not a second row: S08's `next: /test …`
 * is one line. So both halves lay out the same joined string.
 */
function tipText(block: Tip): string {
  const actions = (block.actions ?? []).map((a) => a.label).join("   ");
  const text = stripControl(block.text);
  return actions === "" ? text : `${text}   ${actions}`;
}

export const tipDefinition: BlockDefinition<Tip> = {
  kind: "tip",

  // §7a — as `notice` (I86).
  copy: (block) => block.text,

  measure: (block: Tip, width: number): number =>
    atLeastOne(wrapCells(tipText(block), normaliseWidth(width)).length), // cells-ok

  render(block: Tip, ctx: RenderContext): Rendered {
    const style = tone("dim", ctx.theme, ctx.capabilities);
    const wrapped = wrapCells(tipText(block), normaliseWidth(ctx.width));
    // C28 I45 — the wrap is the cost and the rows are already here. `tipText`
    // folds the actions into the text, so this counts what was drawn rather
    // than what the block declared.
    ctx.probe?.gauge("tip.rows", wrapped.length); // cells-ok — a count of rows, not a display width
    return rows(wrapped.map((line) => paint([{ text: line, style }])));
  },
};

// --- progress --------------------------------------------------------------

export const progressDefinition: BlockDefinition<Progress> = {
  kind: "progress",

  measure: () => 1,

  render(block: Progress, ctx: RenderContext): Rendered {
    const width = normaliseWidth(ctx.width);
    // **Resolved here, per render, and never stored on the block** — the same
    // rule `glyphs()` follows: a block names a style and the terminal decides
    // which arm of it is drawn, so one document is correct on both terminals.
    const bar = barStyle(ctx.capabilities, block.style);
    // **The bar clamps and the number does not** (I28). `100/100` and `150/100`
    // drawing identically is the same defect `examples/docker`'s CPU bar was
    // built around — a bar that stops at its ceiling draws a busy thing exactly
    // like a saturated one — and a progress bar reporting `100%` on an overshoot
    // says *complete* about something that is not.
    //
    // A `total` of zero has no proportion at all: an empty bar and `0%`, which
    // is a floor rather than a measurement.
    const total = block.total > 0 ? block.total : 0;
    const fraction = total === 0 ? 0 : Math.max(0, block.current / total);
    const fill = Math.min(1, fraction);
    const percent = `${Math.round(fraction * 100)}%`;

    // The same clamp and the same reason as `rule` (C28 I45): `stripControl`
    // walks the whole label, `truncate` throws most of it away, and `measure`
    // is 1 either way.
    ctx.probe?.gauge("progress.label", block.label.length); // cells-ok — an input size, not a display width
    const labelRoom = Math.max(0, Math.floor(width / 3));
    const labelColumn = pad(
      truncate(stripControl(block.label), labelRoom, ctx.capabilities),
      labelRoom,
    );

    // The bar takes the residual (\u00a73), which is what makes this one row at any
    // width rather than one row at most widths. It can reach zero, and a bar of
    // no cells is still a row: the label and the percentage carry the meaning.
    const barWidth = Math.max(0, width - cells(labelColumn, ctx.capabilities.ambiguousWidth) - cells(percent, ctx.capabilities.ambiguousWidth) - 2);
    const filled = Math.round(fill * barWidth);

    // **The ramp varies over the axis, and only the `on` cells take it** (I52).
    // Cell `i` samples `i / (barWidth − 1)` whether or not it is filled, so a
    // bar at 30% is the first third of the bar at 100% and a cell painted once
    // keeps its colour as the bar fills. The other answer — the filled length —
    // moves every painted cell on every patch for no information (C04 I108).
    const accent = tone("accent", ctx.theme, ctx.capabilities);

    // **The painted rung, and the predicate is the ground rather than the
    // depth** (I96, §034, `R-BLK-234`). §034 draws the same 62% twice and says
    // which is which: *the ground is the extent and the glyphs are the 1-bit
    // rung*. So `painted` is a channel choice over the alphabet `style` already
    // named, and it falls back **into** that alphabet — `resolveBackground`
    // answers `NO_STYLE` without colour (C10 I8), so a 1-bit terminal and a
    // theme carrying no `meterFill` reach the glyphs by one predicate rather
    // than by a number compared in two places.
    //
    // **Both surfaces are structural**, which is why a bar may take them at all:
    // §072 forbids mixing structural and semantic grounds, and a bar drawn in
    // `ok` or `warn` would be a status painted as an extent.
    const meter = background("surface.meterFill", ctx.theme, ctx.capabilities);
    const well = background("surface.bgDeep", ctx.theme, ctx.capabilities);
    const painted = block.painted === true && meter.background !== undefined;
    const onGlyph = painted ? " " : bar.on;
    const onInk = painted ? withBackground(accent, meter) : accent;
    const muted = tone("muted", ctx.theme, ctx.capabilities);
    const offInk = painted
      ? withBackground(tone("default", ctx.theme, ctx.capabilities), well)
      : muted;

    const onCells: Span[] =
      block.ramp === undefined
        ? [{ text: onGlyph.repeat(filled), style: onInk }]
        : Array.from({ length: filled }, (_, i) => {
            const t = animateT(block.ramp?.animate, extentT(i, barWidth), effectiveTick(ctx.tick, ctx.capabilities), barWidth, i);
            const sampled = block.ramp === undefined ? undefined : rampStyle(block.ramp, t, i, ctx.theme, ctx.capabilities);
            // **The ramp survives the rung and I52 is untouched**: the ink still
            // varies along the axis and still takes the `on` cells only. What
            // moves is that the cell beneath it is a space — and the ground is
            // merged *under* the sample rather than over it, so a ramp does not
            // lose the track it is painted on. §034 carries `rmp-sweepbar` on
            // the painted bar, so the pairing is the design's.
            const ink = sampled === undefined ? onInk : { ...onInk, ...sampled };
            return { text: onGlyph, style: painted ? withBackground(ink, meter) : ink };
          });

    return rows([
      paint(
        clampSpans(
          [
            { text: `${labelColumn} `, style: tone("default", ctx.theme, ctx.capabilities) },
            ...onCells,
            {
              text: (painted ? " " : bar.off).repeat(barWidth - filled),
              style: offInk,
            },
            // **`muted`, and it was `meta`** (I96). All five of §034's bars read
            // their percent in `c-muted`, painted and drawn alike; the tree drew
            // `meta` from the day the kind landed and no row named the tone.
            { text: ` ${percent}`, style: muted },
          ],
          width,
          ctx.capabilities,
        ),
      ),
    ]);
  },
};

// --- pills -----------------------------------------------------------------

/**
 * One logical row that may wrap (C04 §3). The chips are laid out once, and both
 * halves read the same layout — a `pills` block whose measurer counted cells
 * while its renderer packed chips would disagree at exactly the widths where a
 * chip lands on a boundary.
 */
function chipRows(
  block: Pills,
  width: number,
  ambiguous: AmbiguousWidth = "narrow",
): readonly (readonly string[])[] {
  const limit = normaliseWidth(width);
  const out: string[][] = [];
  let line: string[] = [];
  let used = 0;

  for (const chip of block.chips) {
    const text = stripControl(chip.label);
    const w = cells(text, ambiguous);
    const needed = line.length === 0 ? w : w + CHIP_GAP; // cells-ok
    if (used + needed > limit && line.length > 0) { // cells-ok
      out.push(line);
      line = [];
      used = 0;
    }
    line.push(text);
    used += line.length === 1 ? w : w + CHIP_GAP; // cells-ok
  }

  if (line.length > 0) out.push(line); // cells-ok
  return out;
}

/**
 * One element per chip (C26 §5) — **the second kind to declare `elements`, so
 * the seam is exercised by something its author did not write.**
 *
 * **Why pills, of the kinds that could have gone second.** A chip carries an
 * optional `action`, and filter pills are the one place C04 §3 permits `exec`
 * (A01 D8) — so this is the kind whose elements have something for `⏎` to do,
 * where `keyValue` and `steps` would be places to stand and nothing more. The
 * seam is only tested by a consumer that uses both halves of it.
 *
 * **`level: "cell"`, because chips are the items of one logical row** (C04
 * I20) and two of them share a row on screen. There is no row-level element
 * above them — C26 I1 says a level exists only where a declaration reports one
 * — and the keyboard walks the flat list in reading order, so `↓` steps chip to
 * chip across the wrap. Per-level disjointness (C26 I6) is what two chips on
 * one line have to satisfy, and their columns are disjoint by construction:
 * `chipRows` places them `CHIP_GAP` apart.
 *
 * **The id is the index, not the label.** Chips carry no id, two chips may share
 * a label (the renderer's `byLabel` map already collapses them), and C26 I6
 * needs uniqueness within the declaration. The cost is that a chip inserted
 * ahead of the focused one moves focus to a neighbour on refresh — recorded
 * rather than solved, because a label-keyed id would be *wrong* rather than
 * *approximate* on a duplicate.
 *
 * **`copy` is the label from the data** (C26 I17), not the painted text: the
 * two are the same characters today, and the row `clampSpans` truncates at a
 * narrow width is the one where they part.
 *
 * The geometry is `chipRows`'s own — the same call `measure` and `render` make,
 * at the default ambiguous width `measure` uses — so a chip is where the row it
 * was measured into says it is. A lone chip wider than the terminal is clamped
 * to the width for containment (C26 I4), as its paint is.
 */
function pillsElements(block: Pills, width: number): readonly NavElement[] {
  const w = normaliseWidth(width);
  const out: NavElement[] = [];
  let index = 0; // cells-ok — a chip counter, not a width
  chipRows(block, w).forEach((line, row) => {
    let col = 0;
    for (const text of line) {
      const chip = block.chips[index];
      // `chipRows` measured the line under the default convention, so the
      // element is where the row it was measured into says it is (C02 I9).
      const cw = cells(text, "narrow"); // narrow-ok — `chipRows`' own default, so the geometry matches the measure
      const from = Math.min(col, w);
      const action = chip?.action;
      out.push(
        Object.freeze({
          id: `chip-${String(index)}`,
          level: "cell" as const,
          rows: Object.freeze({ from: row, to: row + 1 }),
          cols: Object.freeze({ from, to: Math.max(from, Math.min(w, col + cw)) }),
          ...(action === undefined ? {} : { activate: action }),
          copy: text,
        }),
      );
      col += cw + CHIP_GAP; // cells-ok
      index += 1;
    }
  });
  return Object.freeze(out);
}

export const pillsDefinition: BlockDefinition<Pills> = {
  kind: "pills",

  // §7a — the labels, space-joined (I86). A row of peers is a row of words;
  // the shedding, the active mark and the tones are all this component's.
  copy: (block) => block.chips.map((c) => c.label).join(" "),

  measure: (block: Pills, width: number): number =>
    atLeastOne(chipRows(block, width).length), // cells-ok

  // C09 §2c — the widest chip row: its chips and the gaps between them. A row
  // that overflows the width is clamped to it by the renderer, so it fills.
  width: (block: Pills, width: number): number => {
    const w = normaliseWidth(width);
    let widest = 0;
    for (const row of chipRows(block, w)) {
      let used = 0;
      row.forEach((text, i) => { used += cells(text) + (i > 0 ? CHIP_GAP : 0); }); // narrow-ok — `width` is pure in (block, width) as `measure` is (C09 I42), and narrow is the measurer's convention
      widest = Math.max(widest, used);
    }
    return Math.max(1, Math.min(w, widest));
  },

  elements: pillsElements,

  render(block: Pills, ctx: RenderContext): Rendered {
    ctx.probe?.gauge("pills.chips", block.chips.length); // cells-ok — a count of items, not a display width
    const byLabel = new Map(block.chips.map((chip) => [stripControl(chip.label), chip]));
    // **Focus, and it read `ctx.focus` nowhere before this** (C11 I14, F764's
    // neighbour): a focused chip drew as an unfocused one in every frame, so a
    // reader stepping through a `pills` row saw nothing move. The head is
    // `accent` and a selected chip is `default` over the wash — the table's rule,
    // one kind over. Chips are addressed by position (`chip-N`, `pillsElements`),
    // so the counter below walks the lines in the order the elements were placed.
    const head = ctx.focus !== null && ctx.focus.blockId === block.id ? ctx.focus.rowId : null;
    const selected = new Set(
      (ctx.focus?.selected ?? []).filter((s) => s.blockId === block.id).map((s) => s.rowId),
    );
    let index = 0; // cells-ok — a chip counter, not a width

    return rows(
      chipRows(block, ctx.width).map((line) => {
        const spans: Span[] = [];
        for (const text of line) {
          const chip = byLabel.get(text);
          const id = `chip-${String(index)}`;
          index += 1;
          const name = chip?.active === true ? "accent" : (chip?.tone ?? "muted");
          if (spans.length > 0) spans.push({ text: " ".repeat(CHIP_GAP) }); // cells-ok
          // **The head is `accent` over the selection ground** (C26 §7), where
          // the table's head is `accent` alone. `active` already spends
          // `accent` as data, so a focused inactive chip beside an active one
          // was the same colour twice (F769: `pills-focus-24bit`, `running`
          // and `exited` both `38;2;232;168;124`); the ground is a channel no
          // chip datum uses. A selected chip is `default` over the same ground,
          // so head and extent differ by ink; at 1-bit both are reverse video
          // and the head is bold.
          // **Selection wins the ground where both facts hold** (R-SEL-006,
          // C10 I47): a head inside a real extent takes the wash and keeps
          // `accent` as the ink. `has` and never a size — `selected` absent is
          // C26 I16's head-alone sentinel, and any present extent is a real
          // selection, one element included (C11 I14).
          // **The ground is named once and the ink resolves against it**
          // (C10 I48, F1240). `accent` stays the head's ink here and is not
          // C11 I14's drop-to-one-ink rule wearing the same shape: a pill row
          // has no reserved gutter, so accent **is** focus's carrier rather
          // than a tone spent to say *selected*. What changes is that a
          // selected pill keeps its own tone instead of being forced to
          // `default`, and every one of these inks is now the value the theme
          // composed for the ground underneath it.
          const on = id === head && !selected.has(id) ? "focusGround" : selected.has(id) ? "selection" : undefined;
          const style =
            id === head
              ? {
                  ...tone("accent", ctx.theme, ctx.capabilities, on),
                  ...(selected.has(id) ? selectionStyle : focusStyle)(ctx.theme, ctx.capabilities),
                }
              : selected.has(id)
                ? { ...tone(name, ctx.theme, ctx.capabilities, on), ...selectionStyle(ctx.theme, ctx.capabilities) }
                : tone(name, ctx.theme, ctx.capabilities);
          spans.push({ text, style });
        }
        // Clamped like every other row: a single chip wider than the terminal
        // would otherwise be wrapped by Ink into rows the measurer never
        // counted, which at width 1 is nine rows for one chip.
        return paint(clampSpans(spans, normaliseWidth(ctx.width), ctx.capabilities));
      }),
    );
  },
};

// --- raw -------------------------------------------------------------------

/**
 * The escape hatch, and it is load-bearing: anything unmodellable becomes a
 * `raw` block and still renders (C04 §3). Never wrapped — a height of "the
 * lines it has" is what makes an unrecognised envelope cheap to virtualise.
 */
function rawLines(block: Raw): readonly string[] {
  return stripControl(block.text).split("\n");
}

export const rawDefinition: BlockDefinition<Raw> = {
  kind: "raw",

  // §7a — verbatim, which is what `raw` means (I86). This is also the
  // fallback every unregistered kind resolves through, and carrying the JSON
  // is the honest degradation there for the reason §6's fallback gives.
  copy: (block) => block.text,

  measure: (block: Raw): number => atLeastOne(rawLines(block).length), // cells-ok

  // C09 §2c — the longest line. A line wider than the width is truncated to it
  // by the renderer, which is what the clamp says.
  width: (block: Raw, width: number): number => {
    const w = normaliseWidth(width);
    let longest = 0;
    for (const line of rawLines(block)) longest = Math.max(longest, cells(line)); // narrow-ok — `width` is pure in (block, width) as `measure` is (C09 I42), and narrow is the measurer's convention
    return Math.max(1, Math.min(w, longest));
  },

  /**
   * C09 I25 — rows `[from, to)`, as a smaller `raw` (C14 §4a).
   *
   * `logs`' shape and `logs`' argument: nothing here is derived from lines
   * outside the slice — no tokens, no wrapping, no column — so the window is a
   * slice of the text and needs no pin. `rawLines` splits on `\n` with no
   * trailing-newline rule, so a slice joined on `\n` is exactly the rows the
   * whole block would have drawn there. A line is one row and nothing can hang
   * past `to` (I26).
   */
  window: (block: Raw, _width: number, from: number, to: number): Windowed => {
    const lines = rawLines(block);
    const lo = Math.max(0, Math.min(Math.trunc(from), lines.length - 1)); // cells-ok
    const hi = Math.max(lo + 1, Math.min(Math.trunc(to), lines.length)); // cells-ok
    return Object.freeze({
      block: { ...block, text: lines.slice(lo, hi).join("\n") },
      skipRows: 0,
      dropRows: 0,
    });
  },

  render(block: Raw, ctx: RenderContext): Rendered {
    ctx.probe?.gauge("raw.lines", block.text.split("\n").length); // cells-ok — a count of items, not a display width
    const width = normaliseWidth(ctx.width);
    // The runs cut per line, as `rawLines` cuts the text — one `\n` rule for
    // both halves. A truncated line keeps the runs inside `kept` and paints the
    // marker outside every span (C04 I86); `raw` carries no tone, so the pieces
    // differ only where a span says so and a plain line is the bytes it was.
    const lines = runLines(runsOf(block.text, block.spans));
    const paintCtx = { theme: ctx.theme, capabilities: ctx.capabilities, tick: ctx.tick, ...(block.colormap === undefined ? {} : { colormap: block.colormap }) };
    return rows(
      rawLines(block).map((line, i) => {
        const { kept, suffix } = truncateParts(line, width, ctx.capabilities);
        const shown = sliceRuns(lines[i] ?? [], 0, kept.length); // cells-ok — a code-unit length
        return paint([
          ...paintRuns(shown, NO_STYLE, paintCtx),
          { text: suffix },
          { text: pad("", width - cells(kept, ctx.capabilities.ambiguousWidth) - cells(suffix, ctx.capabilities.ambiguousWidth)) },
        ]);
      }),
    );
  },
};
