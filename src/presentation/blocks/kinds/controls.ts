/**
 * §018's two focus shapes that are not rows — a choice and a continuous control
 * (C09 I105, I106, `R-FOC-002`, `R-FOC-003`).
 *
 * **Their own file because they share one mechanism and nothing else does.**
 * §018's whole argument is that *the channel never changes and the TARGET
 * follows the SHAPE* — so what these two have in common is not a rendering but a
 * discipline: one wash over the whole shape, and everything else on a channel
 * the wash does not touch. Put beside the `pills` row in `simple.ts` they would
 * read as variants of it, and a tape has already had to be separated from a
 * pill row for exactly that reason (C04 §3ao).
 */
import { normaliseWidth } from "../../../data/viewmodel/index.js";
import type { Choice, Control } from "../../../data/viewmodel/index.js";
import { cells, stripControl, truncate } from "../../text.js";
import { glyphs } from "../glyphs.js";
import { clampSpans, focusStyle, paint, rows, tone, type Span } from "../paint.js";
import type { BlockDefinition, NavElement, RenderContext, Rendered } from "../types.js";

/** The capability record the two shapes read: the glyph arm and the width convention. */
type Caps = RenderContext["capabilities"];

/** The gap between an option and the next, and between a control's parts. */
const GAP = 2;

// --- choice ----------------------------------------------------------------

/**
 * The mark an option draws, which is a function of `chosen` **and of nothing
 * else** (I105, §018).
 *
 * *The MARK carries chosen — `●` against `○`, `✓` against `✗` — and the WASH
 * carries focus.* All four are the registry's own records, so nothing here
 * chooses a character; `exclusive` picks which pair, and the pair is the only
 * thing it picks.
 */
function markOf(block: Choice, chosen: boolean, caps: Caps): string {
  const g = glyphs(caps);
  return block.exclusive === true ? (chosen ? g.filled : g.hollow) : (chosen ? g.tick : g.cross);
}

/** Every option's drawn text — the mark, a space, the label. The shape is both. */
function optionText(block: Choice, index: number, caps: Caps): string {
  const option = block.options[index];
  if (option === undefined) return "";
  return `${markOf(block, option.chosen === true, caps)} ${stripControl(option.label)}`;
}

/**
 * Where each option sits on the row.
 *
 * One row, because §018 draws both forms on one — a checkbox is a lone option
 * and a radio group is a run of them — and a row that wrapped would make *the
 * label is part of it* a claim about a rectangle rather than about a run.
 */
function optionColumns(block: Choice, width: number, caps: Caps): readonly (readonly [number, number])[] {
  const w = normaliseWidth(width);
  const out: [number, number][] = [];
  let col = block.label === undefined ? 0 : cells(stripControl(block.label), caps.ambiguousWidth) + GAP;
  block.options.forEach((_, i) => {
    const text = optionText(block, i, caps);
    const from = Math.min(col, w);
    const to = Math.max(from, Math.min(w, col + cells(text, caps.ambiguousWidth)));
    out.push([from, to]);
    col = to + GAP;
  });
  return out;
}

/**
 * The geometry the elements are placed into, under the **measurer's**
 * convention (C02 I9).
 *
 * `elements` is a function of (block, width) like `measure` is, so it has no
 * capability record to ask; `pillsElements` resolves the same way and for the
 * same reason. A frame drawn `wide` moves the columns, and the element list
 * says where the row it was *measured* into put them.
 */
const NARROW = Object.freeze({ ambiguousWidth: "narrow", unicode: "full" }) as unknown as Caps;

function choiceElements(block: Choice, width: number): readonly NavElement[] {
  return optionColumns(block, width, NARROW).map(([from, to], i) =>
    Object.freeze({
      id: block.options[i]?.id ?? `option-${String(i)}`,
      level: "cell" as const,
      rows: Object.freeze({ from: 0, to: 1 }),
      cols: Object.freeze({ from, to }),
      copy: optionText(block, i, NARROW),
    }),
  );
}

export const choiceDefinition: BlockDefinition<Choice> = {
  kind: "choice",

  copy: (block) => block.options.map((o) => `${o.chosen === true ? "[x]" : "[ ]"} ${o.label}`).join("  "),

  measure: () => 1,

  width: (block: Choice, width: number): number => {
    const w = normaliseWidth(width);
    const cols = optionColumns(block, w, NARROW); // narrow-ok — `width` is pure in (block, width) as `measure` is (C09 I42)
    const last = cols.at(-1);
    return Math.max(1, Math.min(w, last === undefined ? 1 : last[1]));
  },

  elements: choiceElements,

  render(block: Choice, ctx: RenderContext): Rendered {
    ctx.probe?.gauge("choice.options", block.options.length); // cells-ok — a count of options, not a width
    const head = ctx.focus !== null && ctx.focus.blockId === block.id ? ctx.focus.rowId : null;
    const spans: Span[] = [];
    if (block.label !== undefined) {
      spans.push({ text: stripControl(block.label), style: tone("muted", ctx.theme, ctx.capabilities) });
      spans.push({ text: " ".repeat(GAP) }); // cells-ok — a fixed gap
    }
    block.options.forEach((option, i) => {
      if (i > 0) spans.push({ text: " ".repeat(GAP) }); // cells-ok — a fixed gap
      const focused = option.id === head;
      // **The wash and the mark are two channels, and this is the line that
      // keeps them apart** (I105). `focusGround` comes from `focused` alone and
      // the mark from `chosen` alone, so *focused and NOT chosen* is a cell the
      // build can reach — a ground read off `chosen` draws the other three
      // correctly and loses the one §018 wrote the sentence for.
      //
      // **One span for the mark and the label together**, because *the label is
      // part of it*: a wash over one of them is a second shape.
      const style = focused
        ? { ...tone("default", ctx.theme, ctx.capabilities, "focusGround"), ...focusStyle(ctx.theme, ctx.capabilities) }
        : tone("default", ctx.theme, ctx.capabilities);
      spans.push({ text: optionText(block, i, ctx.capabilities), style });
    });
    return rows([paint(clampSpans(spans, normaliseWidth(ctx.width), ctx.capabilities))]);
  },
};

// --- control ---------------------------------------------------------------

/** Where the handle sits, clamped — `Progress`' rule, one kind along (C09 I28). */
function position(block: Control): number {
  return Math.max(0, Math.min(1, block.at));
}

/** Is the reader driving this control, rather than standing beside it (I106)? */
function isInside(block: Control, ctx: RenderContext): boolean {
  return ctx.focus !== null && ctx.focus.blockId === block.id && ctx.focus.inside === true;
}

/**
 * The track: `├──────●────────┤`, and heavy with a painted handle inside.
 *
 * **The weight is the carrier that survives the ASCII rung** (I106). The
 * handle's two arms are one character there — `*` for both — and the track's
 * are two, `-` against `=`; §018 names the weight first for that reason, and a
 * carrier matrix reading the handle alone would find one carrier and be right.
 */
function track(block: Control, room: number, ctx: RenderContext): string {
  const g = glyphs(ctx.capabilities);
  const inside = isInside(block, ctx);
  const line = inside ? g.heavyHorizontal : g.horizontal;
  const handle = inside ? g.handleInside : g.filled;
  const span = Math.max(0, room - 3); // cells-ok — the two tees and the handle
  const before = Math.round(position(block) * span);
  return `${g.teeLeft}${line.repeat(before)}${handle}${line.repeat(span - before)}${g.teeRight}`;
}

export const controlDefinition: BlockDefinition<Control> = {
  kind: "control",

  copy: (block) => `${block.label}  ${block.value}`,

  measure: () => 1,

  // **No `width`, because a control fills** (C09 I42). §018 draws the track
  // taking the residual between the label and the value, so the block's natural
  // width *is* the width it is given — and a declaration saying so is the
  // registry's default written out, which is a second record of one number.

  elements: (block: Control, width: number): readonly NavElement[] => [
    Object.freeze({
      id: block.id,
      level: "block" as const,
      rows: Object.freeze({ from: 0, to: 1 }),
      cols: Object.freeze({ from: 0, to: normaliseWidth(width) }),
      copy: `${block.label}  ${block.value}`,
    }),
  ],

  render(block: Control, ctx: RenderContext): Rendered {
    ctx.probe?.gauge("control.label", block.label.length); // cells-ok — an input size, not a display width
    const width = normaliseWidth(ctx.width);
    const focused = ctx.focus !== null && ctx.focus.blockId === block.id;
    // **One wash over label, track and value** (I106, §018): *a CONTROL takes a
    // WASH over ALL of it — label, track and value*. A ground on the track alone
    // is a control drawn as three things, and it satisfies every assertion that
    // only asks whether focus changed anything.
    const on = focused ? "focusGround" : undefined;
    const label = truncate(stripControl(block.label), Math.max(0, Math.floor(width / 3)), ctx.capabilities);
    const value = stripControl(block.value);
    const used = cells(label, ctx.capabilities.ambiguousWidth) + cells(value, ctx.capabilities.ambiguousWidth) + GAP * 2;
    const room = Math.max(3, width - used); // cells-ok — the track's residual
    const base = tone("default", ctx.theme, ctx.capabilities, on);
    const spans: Span[] = [
      { text: label, style: base },
      { text: " ".repeat(GAP), style: base }, // cells-ok — a fixed gap
      { text: track(block, room, ctx), style: base },
      { text: " ".repeat(GAP), style: base }, // cells-ok — a fixed gap
      // **The value is `info` at every state, and that is the invariant** (I106).
      // *The VALUE is INFO and it never changes*: it is data, and the control is
      // what has states. It takes the ground so the wash is unbroken across the
      // shape, and keeps its own ink so the reading does not become chrome.
      { text: value, style: tone("info", ctx.theme, ctx.capabilities, on) },
    ];
    const lit = focused
      ? spans.map((s) => ({ ...s, style: { ...s.style, ...focusStyle(ctx.theme, ctx.capabilities) } }))
      : spans;
    return rows([paint(clampSpans(lit, width, ctx.capabilities))]);
  },
};
