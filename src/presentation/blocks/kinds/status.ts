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
import { background, fit, paint, rows, slot as surface, tone, withBackground, type Span } from "../paint.js";
import type { BlockDefinition, RenderContext } from "../types.js";
import type { Style } from "../../theme/index.js";

/**
 * The word, in a gap in the rule — `─── ERROR ───`.
 *
 * **No square brackets, and they shipped because a figure was read literally.**
 * The design drew ` ERROR ` and `[▲ plot failed to render: …]`, and in both the
 * brackets were *annotation*: they marked which cells carry a painted
 * background. They were never characters. **When the paint slot exists, the word
 * and its two spaces are what gets painted — white on red — and the paint is
 * what the brackets were drawing.** Until then it is the error tone in a gap and
 * nothing else.
 *
 * Seven cells either way, so the width ladder's arithmetic is unchanged.
 */
const TAG = " ERROR ";

/** Through `cells()` and never `.length`, because the measurer uses `cells()` (SS23). */
const TAG_CELLS = cells(TAG); // narrow-ok — ` ERROR ` is ASCII, so the two conventions agree

/** A rule needs at least one dash each side of the tag to read as one. */
const TAG_WITH_RULE = TAG_CELLS + 2;

/** One cell inside each border. Dropped before the border is. */
const PAD = 1;

const SECOND = 1000;

/**
 * The fewest rows a failure can be *stated* in (C22 I69, C04 I67).
 *
 * **Three, because three is where the ladder first draws a border** — below it
 * the box is a bare message line and a reader cannot tell a contained failure
 * from a block that happens to say something red. It is exported because the
 * shell reserves it: a `rule` measures one row, so a `rule` whose renderer gave
 * way has one row until something asks for more, and this is the number it asks
 * for.
 *
 * **Not four.** The tag row costs the fourth and the ladder already gives it up
 * at three deliberately — a floor is the least that says *something failed
 * here*, not the height the figure would prefer.
 */
export const ERROR_MIN_ROWS = 3;

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
type Frame = Readonly<{ border: boolean; pad: boolean; tag: boolean }>;

export function heightRung(height: number, tagged: boolean): Frame {
  if (height >= 6) return { border: true, pad: true, tag: tagged };
  if (height >= 4) return { border: true, pad: false, tag: tagged };
  if (height === 3) return { border: true, pad: false, tag: false };
  return { border: false, pad: false, tag: false };
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
 * width 11 a padded box holds ` ERROR ` exactly, and at 9 it does not while a
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

/**
 * The tag row, as spans — **the word and its two spaces painted, nothing else**.
 *
 * One painted run in the whole figure (C09 §3a). The rule either side carries
 * the error tone as foreground; the tag carries `surfaces.errorInk` on
 * `surfaces.errorGround`, which C10 checks as a pair at the meaning floor.
 */
function tagRow(
  tagFit: TagFit,
  width: number,
  rule: string,
  ink: Style,
  tone: Style | undefined,
): readonly Span[] {
  const painted: Span = { text: TAG, style: ink };
  if (tagFit === "bare") return [painted];
  const dashes = width - TAG_CELLS; // cells-ok — a cell count
  const left = Math.floor(dashes / 2);
  return [
    { text: rule.repeat(left), ...(tone === undefined ? {} : { style: tone }) }, // cells-ok — a cell count
    painted,
    { text: rule.repeat(dashes - left), ...(tone === undefined ? {} : { style: tone }) }, // cells-ok — a cell count
  ];
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
    // **The error tone belongs to the states that failed, and `loading` did
    // not.** Painting the message red in all three drew *loading* as a failure —
    // caught by looking at the image, because nothing asserts a tone per state
    // and the arithmetic is identical either way. §3a already says loading has
    // no error and therefore no rule and no tag; the tone follows the same fact.
    const failed = block.state !== "loading";
    const ink = failed ? tone("error", ctx.theme, ctx.capabilities) : undefined;
    // **The tag's pair, both halves from `surfaces`** (C10 §4a). A ground taken
    // without its matched ink borrows a foreground nothing measured against it,
    // which is I21's rule from the other direction — so the two are resolved
    // together here exactly as C10 checks them together.
    const tagInk = withBackground(
      surface("surface.errorInk", ctx.theme, ctx.capabilities),
      background("surface.errorGround", ctx.theme, ctx.capabilities),
    );

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

    // **The interior is the remainder and the group is centred inside it.** The
    // height ladder says which furniture it can afford and the width ladder
    // takes some of that back — a box too narrow for a border loses two rows —
    // and every row the furniture gives up belongs to the content, or `render`
    // draws fewer rows than `measure` committed. Reading a frame found that at
    // width 9 the box drew four against a measured six, with every count in this
    // file agreeing the whole time.
    const interior = Math.max(1, height - (frame.border ? 2 : 0)); // cells-ok — a row count
    const tagRows = frame.tag && tagFit !== "none" ? 1 : 0;
    // At one row the message wins: a countdown without its cause is a number
    // nobody can act on, and the cause without the countdown is still the fact.
    //
    // **The precedence is stated, not left to the clamp.** With the activity
    // line unconditional the row count still came out right — the final
    // `slice(0, height)` cut it — so the message won by truncation rather than
    // by rule, and a mutation removing the condition changed nothing. A guard
    // that is also the mechanism is a guard nothing can be wrong about.
    //
    // **And at one row `loading` inverts it, because it has no cause.** The rung
    // above is a correct sentence about the *failed* states — the message is the
    // error and the countdown is secondary — and `loading`'s message is not an
    // error, it is a label the panel title already carries. Reading the frame is
    // what said so: `b.live` drew `loading` over `⠋ loading`, the word twice,
    // with every count agreeing. All the information in a waiting box is that it
    // is still waiting, and that lives entirely in the line that moves (F235).
    const lineWins = block.state === "loading";
    const lineRows = line !== "" && (interior - tagRows >= 2 || lineWins) ? 1 : 0;
    const forMessage = Math.max(0, interior - tagRows - lineRows); // cells-ok — a row count
    const body =
      forMessage === 0
        ? []
        : wrapCells(`${mark}${stripControl(block.message)}`, textWidth).slice(0, forMessage);

    // **The whole group is centred, not the message inside the leftover.** The
    // two are the same picture at the full figure's six rows, which is why this
    // was invisible until a twenty-row box was drawn: the tag pinned under the
    // top border, the message floating in the middle, and a gap between them
    // that reads as two figures rather than one. An odd row goes below — text a
    // little high reads as deliberate and a little low reads as dropped.
    //
    // The ladder's `pad` still decides the **horizontal** gutter; the vertical
    // padding it used to name is this slack, and computing it removes the case
    // where the two disagreed.
    const group = tagRows + body.length + lineRows; // cells-ok — a row count
    const slack = Math.max(0, interior - group); // cells-ok — a row count
    const above = Math.floor(slack / 2);

    /** Content rows are the error tone; the border and the blanks are not. */
    const span = (text: string, painted: boolean): readonly Span[] =>
      painted && ink !== undefined ? [{ text, style: ink }] : [{ text }];

    /** A row of spans framed by the border and gutter, at the interior width. */
    const framed = (inner: readonly Span[]): readonly Span[] =>
      frame.border
        ? [
            { text: `${g.vertical}${" ".repeat(gutter)}` }, // cells-ok — a cell count
            ...inner,
            { text: `${" ".repeat(gutter)}${g.vertical}` }, // cells-ok — a cell count
          ]
        : inner;

    const boxed = (text: string, painted: boolean): readonly Span[] =>
      framed(
        span(
          frame.border ? fit(text, textWidth, ctx.capabilities) : truncate(text, width, ctx.capabilities),
          painted,
        ),
      );

    const edge = (left: string, right: string): readonly Span[] => [
      { text: `${left}${g.horizontal.repeat(rowWidth)}${right}` }, // cells-ok — a cell count
    ];

    const out: (readonly Span[])[] = [];
    if (frame.border) out.push(edge(g.topLeft, g.topRight));
    for (let i = 0; i < above; i += 1) out.push(boxed("", false));
    if (tagRows === 1) {
      out.push(framed(tagRow(tagFit, textWidth, g.horizontal, tagInk, ink)));
    }
    for (const row of body) out.push(boxed(row, true));
    // **The activity line takes the default tone, not the error tone** — the
    // error already said what went wrong, and this says what is happening now.
    if (lineRows === 1) out.push(boxed(line, false));
    for (let i = 0; i < slack - above; i += 1) out.push(boxed("", false));
    if (frame.border) out.push(edge(g.bottomLeft, g.bottomRight));

    // **No clamp, and removing it is what made two mutations mean something.**
    // `out.slice(0, height)` was here as a guard and was doing the work: with
    // the activity line admitted unconditionally the assembly produced one row
    // too many and the slice cut it, so the message won by truncation rather
    // than by rule and the mutation that removed the rule changed nothing. A
    // guard that is also the mechanism is a guard nothing can be wrong about
    // (A03 §2).
    //
    // The count is exact by construction — `slack` is the remainder and the
    // group is bounded by `forMessage` — and T3.38 is what asserts it, over
    // seven heights and three states.
    return rows(out.map((spans) => paint(spans)));
  },
};
