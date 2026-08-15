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
import { cells, stripControl, truncate, wrapCells } from "../../text.js";
import { barStyle, glyphFor, glyphCells, glyphs } from "../glyphs.js";
import { clampSpans, fit, pad, paint, rows, tone, type Span } from "../paint.js";
import type { BlockDefinition, RenderContext } from "../types.js";

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
 * The cells a leading glyph and its trailing space occupy.
 *
 * Takes the *token*, not a character, and needs no capabilities: both
 * renderings are the same width by C09 §4's 1:1 rule, which is what lets
 * `measure` be correct without seeing a capability record (C04 §5).
 */
function prefixCells(glyph: Glyph | undefined): number {
  return glyph === undefined ? 0 : glyphCells(glyph) + 1;
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
    const shown = truncate(label, Math.max(0, room), ctx.capabilities);
    const fill = Math.max(0, width - cells(lead, ctx.capabilities.ambiguousWidth) - cells(shown, ctx.capabilities.ambiguousWidth) - gap - cells(meta, ctx.capabilities.ambiguousWidth));

    const dim = tone("dim", ctx.theme, ctx.capabilities);
    return rows([
      paint(
        clampSpans(
          [
            { text: lead, style: dim },
            { text: shown, style: tone("accent", ctx.theme, ctx.capabilities) },
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

export const noticeDefinition: BlockDefinition<Notice> = {
  kind: "notice",

  measure: (block: Notice, width: number): number =>
    atLeastOne(
      wrapCells(stripControl(block.text), proseWidth(width, prefixCells(block.glyph))).length, // cells-ok
    ),

  render(block: Notice, ctx: RenderContext): ReactElement {
    const style = tone(block.tone, ctx.theme, ctx.capabilities);
    const prefix = prefixCells(block.glyph);
    const wrapped = wrapCells(stripControl(block.text), proseWidth(ctx.width, prefix));

    // A hanging indent: the glyph sits on the first row and the continuation
    // aligns under the text rather than under the glyph. That alignment is why
    // the prefix comes out of every row's width, not only the first.
    return rows(
      wrapped.map((line, index) =>
        paint([
          {
            text:
              index === 0 && block.glyph !== undefined
                ? `${glyphFor(block.glyph, ctx.capabilities)} `
                : " ".repeat(prefix),
            style,
          },
          { text: line, style },
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
    const total = block.total > 0 ? block.total : 1;
    const ratio = Math.min(1, Math.max(0, block.current / total));
    const percent = `${Math.round(ratio * 100)}%`;

    const labelRoom = Math.max(0, Math.floor(width / 3));
    const labelColumn = pad(
      truncate(stripControl(block.label), labelRoom, ctx.capabilities),
      labelRoom,
    );

    // The bar takes the residual (\u00a73), which is what makes this one row at any
    // width rather than one row at most widths. It can reach zero, and a bar of
    // no cells is still a row: the label and the percentage carry the meaning.
    const barWidth = Math.max(0, width - cells(labelColumn, ctx.capabilities.ambiguousWidth) - cells(percent, ctx.capabilities.ambiguousWidth) - 2);
    const filled = Math.round(ratio * barWidth);

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

export const pillsDefinition: BlockDefinition<Pills> = {
  kind: "pills",

  measure: (block: Pills, width: number): number =>
    atLeastOne(chipRows(block, width).length), // cells-ok

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

  render(block: Raw, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    return rows(rawLines(block).map((line) => fit(line, width, ctx.capabilities)));
  },
};
