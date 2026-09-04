/**
 * `rule`, `notice`, `tip`, `progress`, `pills`, `raw`.
 *
 * Six kinds whose measure is arithmetic over one field. Each pair is written
 * together and reviewed together (commitment 3): the two halves share a
 * `layout` function so that the only way they can disagree is if someone edits
 * one of them and not the call.
 */
import type { AmbiguousWidth } from "../../text.js";
import type { ReactElement } from "react";
import { atLeastOne, normaliseWidth } from "../../../data/viewmodel/index.js";
import type { Glyph, Notice, Pills, Progress, Raw, Rule, Tip } from "../../../data/viewmodel/index.js";
import { cells, stripControl, truncate, truncateParts, wrapCells } from "../../text.js";
import type { Run } from "../../runs.js";
import { runLines, runsOf, sliceRuns, wrapRuns } from "../../runs.js";
import { NO_STYLE } from "../../theme/index.js";
import { barStyle, glyphFor, glyphCells, glyphs } from "../glyphs.js";
import { clampSpans, pad, paint, paintRuns, rows, tone, type Span } from "../paint.js";
import type { BlockDefinition, NavElement, RenderContext, Windowed } from "../types.js";

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
 * **A gutter and not a field.** An `indent` on `Notice` is the second spacing
 * field `Gap`'s note has been waiting for — *whoever writes the second spacing
 * field is reading this line* — and roadmap 38 rules that change a
 * *replacement* of `gapBefore` rather than an addition beside it. So the
 * smaller change is the one that is not a public type at all: the depth belongs
 * to the mark, which already knows it is a mark, and the block schema learns
 * nothing.
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

  render(block: Rule, ctx: RenderContext): ReactElement {
    const g = glyphs(ctx.capabilities);
    const width = normaliseWidth(ctx.width);
    const label = stripControl(block.label);
    const meta = block.meta === undefined || block.meta === "" ? "" : ` ${stripControl(block.meta)}`;

    // `\u2500\u2500 label \u2500\u2500\u2500\u2500 meta`. The fill takes what the two ends leave; the
    // label truncates before the fill goes negative, so the row is exactly the
    // width at every width.
    // **An empty label draws an unbroken line** (I21). The spaces either side
    // of the label are what set it apart from the fill; with no label they are
    // a two-cell gap at the left of a rule that is a boundary rather than a
    // heading. Found by reading C19's menu edge in a frame — the block was
    // present, the row was exactly the width, and every assertion held.
    const lead = label === "" ? g.horizontal.repeat(2) : `${g.horizontal.repeat(2)} `;
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
            { text: `${" ".repeat(gap)}${g.horizontal.repeat(fill)}`, style: dim },
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
function noticeRows(block: Notice, width: number): readonly (readonly Run[])[] {
  return wrapRuns(runsOf(block.text, block.spans), proseWidth(width, prefixCells(block.glyph)));
}

export const noticeDefinition: BlockDefinition<Notice> = {
  kind: "notice",

  measure: (block: Notice, width: number): number => atLeastOne(noticeRows(block, width).length), // cells-ok

  render(block: Notice, ctx: RenderContext): ReactElement {
    const style = tone(block.tone, ctx.theme, ctx.capabilities);
    const prefix = prefixCells(block.glyph);
    const wrapped = noticeRows(block, ctx.width);
    // The block's colormap reaches the painter by name; a valued run reads it
    // there and nowhere else (C04 I90).
    const paintCtx = { theme: ctx.theme, capabilities: ctx.capabilities, ...(block.colormap === undefined ? {} : { colormap: block.colormap }) };

    // A hanging indent: the glyph sits on the first row and the continuation
    // aligns under the text rather than under the glyph. That alignment is why
    // the prefix comes out of every row's width, not only the first.
    return rows(
      wrapped.map((line, index) =>
        paint([
          {
            text:
              index === 0 && block.glyph !== undefined
                ? glyphLead(block.glyph, ctx.capabilities)
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

  measure: (block: Tip, width: number): number =>
    atLeastOne(wrapCells(tipText(block), normaliseWidth(width)).length), // cells-ok

  render(block: Tip, ctx: RenderContext): ReactElement {
    const style = tone("dim", ctx.theme, ctx.capabilities);
    return rows(
      wrapCells(tipText(block), normaliseWidth(ctx.width)).map((line) =>
        paint([{ text: line, style }]),
      ),
    );
  },
};

// --- progress --------------------------------------------------------------

export const progressDefinition: BlockDefinition<Progress> = {
  kind: "progress",

  measure: () => 1,

  render(block: Progress, ctx: RenderContext): ReactElement {
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

    return rows([
      paint(
        clampSpans(
          [
            { text: `${labelColumn} `, style: tone("default", ctx.theme, ctx.capabilities) },
            {
              text: bar.on.repeat(filled),
              style: tone("accent", ctx.theme, ctx.capabilities),
            },
            {
              text: bar.off.repeat(barWidth - filled),
              style: tone("muted", ctx.theme, ctx.capabilities),
            },
            { text: ` ${percent}`, style: tone("meta", ctx.theme, ctx.capabilities) },
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

  measure: (block: Pills, width: number): number =>
    atLeastOne(chipRows(block, width).length), // cells-ok

  elements: pillsElements,

  render(block: Pills, ctx: RenderContext): ReactElement {
    const byLabel = new Map(block.chips.map((chip) => [stripControl(chip.label), chip]));

    return rows(
      chipRows(block, ctx.width).map((line) => {
        const spans: Span[] = [];
        for (const text of line) {
          const chip = byLabel.get(text);
          const name = chip?.active === true ? "accent" : (chip?.tone ?? "muted");
          if (spans.length > 0) spans.push({ text: " ".repeat(CHIP_GAP) }); // cells-ok
          spans.push({ text, style: tone(name, ctx.theme, ctx.capabilities) });
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

  measure: (block: Raw): number => atLeastOne(rawLines(block).length), // cells-ok

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

  render(block: Raw, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    // The runs cut per line, as `rawLines` cuts the text — one `\n` rule for
    // both halves. A truncated line keeps the runs inside `kept` and paints the
    // marker outside every span (C04 I86); `raw` carries no tone, so the pieces
    // differ only where a span says so and a plain line is the bytes it was.
    const lines = runLines(runsOf(block.text, block.spans));
    const paintCtx = { theme: ctx.theme, capabilities: ctx.capabilities, ...(block.colormap === undefined ? {} : { colormap: block.colormap }) };
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
