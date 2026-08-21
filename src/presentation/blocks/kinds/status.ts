/**
 * `status` — one box, three contents (C09 §3a, C09 I31, C09 I32).
 *
 * The kind the registry draws in place of a block that cannot draw itself: a
 * thrown renderer, a first fetch in flight, a backoff counting down. **The
 * definition never draws its own failure** — a kind whose renderer is broken
 * cannot be trusted to, and a `renderError` on `BlockDefinition` would have the
 * boundary calling into the thing it is containing.
 *
 * **Two ladders on two axes, and neither may change the row count.** Height
 * allocates rows; width decides what fills them. `measure` has already answered
 * and the box is bound by that number (C09 I11), so a width decision that
 * removed a row would reintroduce I1's divergence through the one path built to
 * preserve it.
 */
import type { ReactElement } from "react";
import { normaliseWidth } from "../../../data/viewmodel/index.js";
import type { Status } from "../../../data/viewmodel/index.js";
import { cells, stripControl, truncate, wrapCells } from "../../text.js";
import { glyphs, spinnerFrames } from "../glyphs.js";
import { fit, paint, rows, tone, type Span } from "../paint.js";
import type { BlockDefinition, RenderContext } from "../types.js";

/** `[ERROR]`. The number both width rungs are measured against. */
const TAG = "[ERROR]";

/** Through `cells()` and never `.length`, because the measurer uses `cells()` (SS23). */
const TAG_CELLS = cells(TAG); // narrow-ok — `[ERROR]` is ASCII, so the two conventions agree

/** A rule needs at least one dash each side of the tag to read as one. */
const TAG_WITH_RULE = TAG_CELLS + 2;

/** One cell inside each border. Dropped before the border is. */
const PAD = 1;

const SECOND = 1000;

/**
 * The height rungs (C09 I31).
 *
 * The full figure is two borders, two blanks and the tag row, so it needs
 * **six** — it was specified at five for as long as it existed on paper, and
 * only drawing it said otherwise. Padding is dropped as a pair, because one
 * blank and not the other reads as an off-by-one rather than as a decision.
 *
 * **`loading` has no error, so it has no tag row at any height** — the figure
 * says so and the ladder honours it. That row goes to the content on the same
 * rule the width ladder uses: a blank third of a box is worse than a longer
 * message.
 */
type Frame = Readonly<{ border: boolean; pad: boolean; tag: boolean; content: number }>;

export function heightRung(height: number, tagged: boolean): Frame {
  const tag = (n: number): number => (tagged ? 0 : n);
  if (height >= 6) return { border: true, pad: true, tag: tagged, content: height - 5 + tag(1) };
  if (height === 5) return { border: true, pad: false, tag: tagged, content: 2 + tag(1) };
  if (height === 4) return { border: true, pad: false, tag: tagged, content: 1 + tag(1) };
  if (height === 3) return { border: true, pad: false, tag: false, content: 1 };
  if (height === 2) return { border: false, pad: false, tag: false, content: 2 };
  return { border: false, pad: false, tag: false, content: 1 };
}

/**
 * What the tag row can hold at this width (C09 I31).
 *
 * **This ladder was missing and would have shipped broken.** The figure was
 * indexed on height alone, and width is the axis that wraps: a `row` group hands
 * out `floor((w − gaps) / n)`, so a block can be given five columns and would
 * have drawn a tag that does not fit. A structural interaction — two rules both
 * holding at rest — which a ladder indexed on height cannot reach however many
 * rungs it has.
 */
export type TagFit = "rule" | "bare" | "none";

/** The content width left once the border and the padding have been paid for. */
function inner(width: number, border: boolean, pad: boolean): number {
  return Math.max(1, (border ? width - 2 : width) - (pad ? 2 * PAD : 0)); // cells-ok — a cell count
}

function fitFor(content: number, tagged: boolean): TagFit {
  if (!tagged) return "none";
  if (content >= TAG_WITH_RULE) return "rule";
  return content >= TAG_CELLS ? "bare" : "none";
}

/**
 * The width ladder, and it decides the **furniture** as well as the tag.
 *
 * **Affordability comes first, and reading a frame is what said so.** A border
 * is two cells and a gutter is two more, so a bordered padded row is five cells
 * of furniture — drawn at width 3 it is a row wider than the frame, which Ink
 * *wraps*, and the block renders ten rows against a measured six. That is I1's
 * divergence arriving through the one path built to prevent it, and no
 * arithmetic in this file could see it: every count agreed. The height ladder
 * alone decided the border, and the width ladder only ever spoke about the tag.
 *
 * **Then padding may be dropped to save the tag**, which buys two cells: at
 * width 11 a padded box holds `[ERROR]` exactly, and at 9 it does not while a
 * bare one does. Dropping it is worth more than the breathing room, because the
 * tag is the only thing on the row that says what kind of box this is.
 */
export function widthRung(width: number, frame: Frame): Readonly<{ frame: Frame; tag: TagFit }> {
  const border = frame.border && width >= 3;
  const canPad = border && width >= 5;
  const padded = frame.pad && canPad;

  const withPad = fitFor(inner(width, border, padded), frame.tag);
  const without = fitFor(inner(width, border, false), frame.tag);
  const pad = padded && !(withPad === "none" && without !== "none");
  const tag = pad ? withPad : without;

  return { frame: { ...frame, border, pad }, tag };
}

/** `4s`, `47s`, `2m 14s` — minutes past 99, because three digits read worse. */
function elapsed(ms: number): string {
  const s = Math.floor(ms / SECOND);
  if (s < 1) return "";
  return s <= 99 ? `${String(s)}s` : `${String(Math.floor(s / 60))}m ${String(s % 60)}s`;
}

/**
 * The trailing line, or none.
 *
 * `retrying` takes the countdown and the attempt; `loading` takes the elapsed
 * counter. **Three numbers on one line is one too many**, so retrying does not
 * also carry elapsed — the countdown is the actionable one and the attempt is
 * the history. Below one second `loading` shows no counter, because a fast load
 * must not flash one.
 */
export function activityLine(block: Status, frames: readonly string[], tick: number): string {
  const mark = frames[tick % frames.length] ?? ""; // cells-ok — a frame count, not a width
  if (block.state === "retrying") {
    if (block.retryInMs === undefined) return "";
    // **Parentheses rather than a middle dot, and T4.4 is what said so.** `·` has
    // no ASCII substitution, so the ascii arm drew it unchanged — C09 I22's
    // class, a mark the framework draws and cannot substitute. `(`, `)` and the
    // digits are one cell under both width conventions and need no arm at all,
    // which is cheaper than adding a `GlyphSet` member for one separator.
    const attempt = block.attempt === undefined ? "" : ` (attempt ${String(block.attempt)})`;
    return `${mark} retrying in ${String(Math.round(block.retryInMs / SECOND))}s${attempt}`;
  }
  if (block.state === "loading") {
    const since = block.elapsedMs === undefined ? "" : elapsed(block.elapsedMs);
    return since === "" ? `${mark} loading` : `${mark} loading (${since})`;
  }
  return "";
}

/** The tag row at its rung, filled to `width`. */
function tagRow(tagFit: TagFit, width: number, rule: string): string {
  if (tagFit === "bare") return TAG;
  const dashes = width - TAG_CELLS; // cells-ok — a cell count
  const left = Math.floor(dashes / 2);
  return `${rule.repeat(left)}${TAG}${rule.repeat(dashes - left)}`; // cells-ok — a cell count
}

export const statusDefinition: BlockDefinition<Status> = {
  kind: "status",

  /**
   * The declared height and nothing else (C09 I31).
   *
   * **`measure` never reads `ctx` and this kind is why it must not**: the box is
   * bound by a number the caller already committed, so a measurer free to
   * recompute is a measurer free to disagree with it.
   */
  measure: (block: Status): number => Math.max(1, Math.floor(block.height)), // cells-ok — a row count

  // No `window` (C09 I27, C09 I31) — a bounded box has its border at both ends
  // and cannot measure less without becoming a different box. `scroll`'s
  // argument, and the same one.

  render(block: Status, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    const g = glyphs(ctx.capabilities);
    const height = Math.max(1, Math.floor(block.height)); // cells-ok — a row count
    const rung = widthRung(width, heightRung(height, block.state !== "loading"));
    const frame = rung.frame;
    const tagFit = rung.tag;
    const ink = tone("error", ctx.theme, ctx.capabilities);

    const rowWidth = frame.border ? Math.max(1, width - 2) : width; // cells-ok — a cell count
    const gutter = frame.pad ? PAD : 0;
    const textWidth = Math.max(1, rowWidth - 2 * gutter); // cells-ok — a cell count

    // **The mark is one of the two channels at one bit**, where the tone resolves
    // to `{ bold: true }` and carries no colour at all (C09 §3a).
    const mark = block.state === "error" || block.state === "retrying" ? `${g.warning} ` : "";
    // **The block's set, and `spinnerFrames` resolves an unknown name to the
    // default rather than throwing** — a spinner is decoration, and a session
    // that will not start because a set was misspelt is worse than one that
    // spins the wrong way. The interval is `spinnerIntervalMs(block.spinner)`
    // and belongs to whoever schedules the tick, which is not this layer.
    const line = activityLine(block, spinnerFrames(ctx.capabilities, block.spinner), ctx.tick);

    // **The content count is the remainder, not a rung.** The height ladder says
    // which furniture it can afford and the width ladder takes some of that back
    // — a box too narrow for a border loses two rows of it — and every row the
    // furniture gives up belongs to the content, or `render` draws fewer rows
    // than `measure` committed. Reading a frame is what found this: at width 9
    // the box drew four rows against a measured six, and every count in this
    // file agreed with every other the whole time.
    const furniture =
      (frame.border ? 2 : 0) + (frame.pad ? 2 : 0) + (frame.tag && tagFit !== "none" ? 1 : 0); // cells-ok — a row count
    const available = Math.max(1, height - furniture); // cells-ok — a row count
    // At one row the message wins: a countdown without its cause is a number
    // nobody can act on, and the cause without the countdown is still the fact.
    const forMessage = Math.max(1, available - (line === "" ? 0 : 1)); // cells-ok — a row count
    const body = wrapCells(`${mark}${stripControl(block.message)}`, textWidth).slice(0, forMessage);
    const content = [...body];
    while (content.length < forMessage) content.push(""); // cells-ok — a row count

    /** Content rows are the error tone; the border and the blanks are not. */
    const span = (text: string, painted: boolean): readonly Span[] =>
      painted ? [{ text, style: ink }] : [{ text }];

    const boxed = (text: string, painted: boolean): readonly Span[] =>
      frame.border
        ? [
            { text: `${g.vertical}${" ".repeat(gutter)}` }, // cells-ok — a cell count
            ...span(fit(text, textWidth, ctx.capabilities), painted),
            { text: `${" ".repeat(gutter)}${g.vertical}` }, // cells-ok — a cell count
          ]
        : span(truncate(text, width, ctx.capabilities), painted);

    const edge = (left: string, right: string): readonly Span[] => [
      { text: `${left}${g.horizontal.repeat(rowWidth)}${right}` }, // cells-ok — a cell count
    ];

    const out: (readonly Span[])[] = [];
    if (frame.border) out.push(edge(g.topLeft, g.topRight));
    if (frame.pad) out.push(boxed("", false));
    if (frame.tag && tagFit !== "none") out.push(boxed(tagRow(tagFit, textWidth, g.horizontal), true));
    for (const row of content) out.push(boxed(row, true));
    // **The activity line takes the default tone, not the error tone** — the
    // error already said what went wrong, and this says what is happening now.
    if (line !== "" && available > forMessage) out.push(boxed(line, false));
    if (frame.pad) out.push(boxed("", false));
    if (frame.border) out.push(edge(g.bottomLeft, g.bottomRight));

    // The remainder above makes this exact; the clamp is the guard, not the
    // mechanism, and a block that needed it would be a defect this kind exists
    // to make impossible (C09 I1, I31).
    return rows(out.slice(0, height).map((spans) => paint(spans)));
  },
};
