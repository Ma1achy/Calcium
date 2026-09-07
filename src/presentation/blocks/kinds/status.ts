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
 * The rung at which the ladder first draws a border, kept as prose rather than a
 * constant (C09 I34).
 *
 * **`ERROR_MIN_ROWS = 3` lived here and its own reason expired.** It read *it is
 * exported because the shell reserves it: a `rule` measures one row, so a `rule`
 * whose renderer gave way has one row until something asks for more, and this is
 * the number it asks for* — and the shell no longer asks for a number, it is
 * handed one. `statusRowsFor` computes what the message needs at the width in
 * hand, so a floor that is three rows whatever the box has to say has no caller
 * and, on this repository's own rule, no reason to be exported.
 *
 * **The fact it stated is still true and still load-bearing**: below three rows
 * the box is a bare message line and a reader cannot tell a contained failure
 * from a block that happens to say something red. That is why `heightRung`
 * gives the border up at three and not at four — it is the least that says
 * *something failed here*. It is a property of the ladder, and the ladder is
 * where it now lives.
 */

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

/** The height the full figure needs — two borders, two blanks and the tag row. */
export const FULL_FIGURE_ROWS = 6;

export function heightRung(height: number, tagged: boolean, framed = false): Frame {
  // **A second ladder on the same axis, not a rung on this one** (C09 §3a, F406).
  // The ladder below couples the tag to the border — the tag first appears at the
  // rung where the border already has — so a box whose container draws one had
  // three options and no figure: read as a red line, draw a second border with no
  // tag, or draw the tag at two nested borders. C23 I51 chose the first, and its
  // reason was right about the other two.
  //
  // Framed, the border is never this box's to draw, so the rows go to the tag and
  // the content: **two are tag and message**, and a third buys `retrying` its
  // activity line. The ordering below is unchanged and so is `loading`, which has
  // no tag to gain under either ladder.
  //
  // **`H ≤ 1` has no border and therefore no evidence the height was honoured** —
  // the same clause the free-standing ladder carries at `H ≤ 2`, one rung lower
  // because the border was never this box's.
  if (framed) return { border: false, pad: false, tag: tagged && height >= 2 };
  if (height >= FULL_FIGURE_ROWS) return { border: true, pad: true, tag: tagged };
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

/**
 * The seconds the retry line draws — **exported for the same reason `elapsed` is**
 * (C23 I52, F407).
 *
 * The driver rewrites a backing-off box once a second, and a write that changes
 * nothing observable is still a `rev` bump: it invalidates C14's height cache and
 * tells the transcript a document changed when it did not. So the guard compares
 * *what would be drawn*, and `Math.round` is why that is a different question
 * from *did the clock move* — 11 600 ms and 11 400 ms are two clocks and one
 * figure.
 *
 * **Rounding, not flooring, and it is `elapsed`'s opposite on purpose.** A
 * counter that has run for 4.9 s has run for four whole seconds and says `4s`; a
 * retry 4.9 s away is about to be five and says `5s`, because the number a reader
 * is waiting on should not sit at zero for a second before firing.
 */
export function countdown(ms: number): number {
  return Math.round(ms / SECOND); // cells-ok — a second count
}

/**
 * `4s`, `47s`, `2m 14s` — minutes past 99, because three digits read worse.
 *
 * **Exported so the writer can ask whether the figure moved**, not so anyone
 * else formats a duration. C23's counter patches the transcript once a second
 * and a patch that changes nothing observable is still a `rev` bump — it
 * invalidates C14's height cache and says the document changed when it did not.
 * The guard has to compare *what would be drawn*, and this is the only thing
 * that knows: `elapsed` is deliberately coarser than its input below one second
 * and past ninety-nine, so a clock comparison and a figure comparison disagree
 * in exactly the cases the guard exists for (C23 I52, F234).
 */
export function elapsed(ms: number): string {
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
    // **Through `countdown`, which the driver also calls** (C23 I52, F407). The
    // countdown was written once at the failure and never again, so it stood at
    // its opening value for the whole backoff and then jumped — measured over
    // 26 seconds: `12` for a dozen frames, then `24`. The driver rewrites it now,
    // and it has to ask *would the figure change* rather than *did the clock
    // move*, which only the function that draws the number can answer.
    return `${mark} retrying in ${String(countdown(block.retryInMs))}s${attempt}`;
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

/**
 * The most message rows a contained failure will ask for (C09 I34, F238).
 *
 * **Four, and it is a measurement rather than a taste.** Wrapping
 * `plot failed to render: …` at the top rung's content width, a typical message
 * is **1** line at 120 columns, **2** at 80 and **3** at 40; a path is **4** at
 * 40; a three-frame stack trace is **3** at 80 and **6** at 40. So four holds a
 * whole stack trace at 80 and **a path and nothing else at 40** — the cap binds
 * at exactly the width where the message matters most and the room is least.
 *
 * **Not width-scaled.** How much a reader takes in before going to the sink is a
 * property of the reader, not of the terminal, and a rule with a second axis is
 * one more thing to get wrong. The cost is stated instead: at 40 columns a
 * capped stack trace shows the error and one frame, at 80 the error and two, and
 * the frames kept are the outermost — the ones that name the failing call.
 *
 * **And it is a containment bound, which is the stronger argument** (F239). A
 * bounded container draws an over-tall child **whole** and C25 I1 is knowingly
 * false for that case (C04 §3c trace 1, T2.28b). Uncapped, a fitted box would
 * make that divergence as large as an exception is long; at four lines the box
 * is at most seven rows and the worst over-draw is a number.
 */
export const MESSAGE_LINE_CAP = 4;

/**
 * The wrapped message, cut to the rows available, **with a mark when it is cut**.
 *
 * **The silent slice is what this replaces**, and it was silent at every height
 * rather than only at the cap: `wrapCells(...).slice(0, forMessage)` dropped the
 * remainder and said nothing, which is F230's class one level down.
 *
 * **The mark comes from `truncate` and is therefore capability-resolved** — `…`
 * at unicode and `~` at `ascii` (C09 I22) — rather than a literal this file
 * writes and cannot substitute. The overflow is *joined* into the last kept row
 * before truncating, so the marker lands on a row that genuinely overflows
 * rather than being appended to one that fits.
 *
 * **A message of exactly `forMessage` rows carries no mark**, and the asymmetry
 * is deliberate: a mark claiming a truncation that did not happen sends the
 * reader to the sink for text already on screen, which is worse than a silent
 * cut because it is confidently wrong.
 *
 * **And that off-by-one is impossible here rather than guarded against**, which
 * is stronger and was found by a mutation surviving. At equality the two
 * branches are the *same function*: `slice(0, n - 1)` plus `join` of a
 * single-element tail is the original list, and `truncate` of a row that already
 * fits returns it unchanged. So `<=` and `<` compute the same body, the pass
 * could not kill the difference, and the reason is that there is none. The
 * property does not rest on the comparison — it rests on the join degenerating
 * to identity — and a row asserting the comparison would be asserting a rule
 * with nothing to be wrong about (A03 §2).
 */
function bodyOf(
  text: string,
  textWidth: number,
  forMessage: number,
  caps: RenderContext["capabilities"],
): readonly string[] {
  if (forMessage === 0) return [];
  const lines = wrapCells(text, textWidth);
  if (lines.length <= forMessage) return lines; // cells-ok — a row count, not a width
  const kept = lines.slice(0, forMessage - 1);
  // Joined rather than sliced: the marker has to sit on a row that overflows.
  // Two short tail rows that fit together lose only their line break, which is
  // no text lost and correctly no mark.
  kept.push(truncate(lines.slice(forMessage - 1).join(" "), textWidth, caps));
  return kept;
}

/**
 * The rows this box needs to say what it has to say, at the width it was given
 * (C09 I34, §3a-bis).
 *
 * **Height fits and width does not.** A block does not choose its width — the
 * region does, and a block wider than its region is I1's over-draw in the other
 * axis. So the message is wrapped to the width in hand and the *height* grows to
 * fit the wrap.
 *
 * **Wrapped at the top rung's content width, which dissolves a fixed point.**
 * The rung decides the padding, the padding decides the content width, the width
 * decides the wrap, and the wrap decides the rung. `width − 4` is the narrowest
 * content width any rung offers, so this errs in the safe direction: every lower
 * rung is *wider*, wraps to fewer lines, and still shows all of them. The cost
 * is at most one row of slack, which the render centres and which reads as
 * deliberate.
 *
 * **The vertical blanks are not in the sum.** They are slack the render
 * computes, appearing when the message is short and giving way as it grows —
 * which is what the ladder already does with them. Counting them would make a
 * two-line failure seven rows rather than five.
 */
export function statusRowsFor(
  block: Status,
  width: number,
  caps: RenderContext["capabilities"],
): number {
  const w = normaliseWidth(width);
  // The **top** rung deliberately, not the rung this block currently has: the
  // question is how tall the good figure needs to be, and the answer is read
  // from the furniture that figure draws.
  const rung = widthRung(
    w,
    // **The block's own ladder, because the two allocate rows differently.** A
    // framed box spends none on a border, so the width left for the message is
    // not the free-standing figure's — asking the wrong ladder here would size a
    // box against furniture it does not draw.
    heightRung(FULL_FIGURE_ROWS, block.state !== "loading", block.framed === true),
  );
  const rowWidth = rung.frame.border ? Math.max(1, w - 2) : w; // cells-ok — a cell count
  const textWidth = Math.max(1, rowWidth - 2 * (rung.frame.pad ? PAD : 0)); // cells-ok — a cell count

  const g = glyphs(caps);
  const mark = block.state === "error" || block.state === "retrying" ? `${g.warning} ` : "";
  // Tick zero: the *emptiness* of the line is a function of the state and the
  // fields, never of which frame the spinner is on, so any tick answers it.
  const line = activityLine(block, spinnerFrames(caps, block.spinner), 0);

  const wrapped = wrapCells(`${mark}${stripControl(block.message)}`, textWidth).length; // cells-ok — a row count
  const rows = Math.min(MESSAGE_LINE_CAP, Math.max(1, wrapped)); // cells-ok — a row count
  const tagRows = rung.frame.tag && rung.tag !== "none" ? 1 : 0;
  const lineRows = line === "" ? 0 : 1;
  return rows + (rung.frame.border ? 2 : 0) + tagRows + lineRows; // cells-ok — a row count
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
    const rung = widthRung(width, heightRung(height, block.state !== "loading", block.framed === true));
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
    const body = bodyOf(`${mark}${stripControl(block.message)}`, textWidth, forMessage, ctx.capabilities);

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
