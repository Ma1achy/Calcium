/**
 * `tape` — a row of peers you navigate, which slides rather than sheds.
 *
 * C04 §3ao, C04 I124, C04 I125, C04 I126, §095. The window's arithmetic is `tape-window.ts`; this
 * file is the parts it measures and the row it draws.
 */
import type { CallState, Tape } from "../../../data/viewmodel/index.js";
import { atLeastOne, normaliseWidth } from "../../../data/viewmodel/index.js";
import { cells, stripControl, truncate } from "../../text.js";
import { CALL_STATE_GLYPH, glyphFor, glyphs, spinnerFrameAt } from "../glyphs.js";
import { clampSpans, focusStyle, paint, rows, selectionStyle, tone, type Span } from "../paint.js";
import { tapeWindow, type TapeMarks } from "../tape-window.js";
import type { BlockDefinition, NavElement, RenderContext, Rendered } from "../types.js";
import { glyphTick } from "../ramp.js";

/**
 * Two spaces between members, as `pills` uses between chips — one is too close
 * to read, and the marks stand in the same rhythm so `«2  count` and
 * `seams  arm` are one row rather than two conventions.
 */
const TAPE_GAP = 2;

/** The current member's lead — `› `, the mark of the item in a row you navigate. */
const LEAD_CELLS = 2;

/** The spinner a running member draws, and it is the design's own (§095, §030). */
const TAPE_SPINNER = "agent";

type Member = Tape["members"][number];

/**
 * A member's text at a given rung of the ladder.
 *
 * **The state part follows §030's call grammar rather than a rule of its own.**
 * A settled member reads `duration · outcome` — `2:53 ✓` — and a running one
 * puts the spinner *in* the duration slot and its elapsed time after it —
 * `✦ 4:02`. That is one sentence of the design read twice, not two orderings.
 */
function memberText(
  member: Member,
  detail: boolean,
  ctx: Pick<RenderContext, "capabilities" | "tick" | "motion">,
): string {
  const label = stripControl(member.label);
  // **A state this build does not know carries no mark, and does not throw.**
  // `state` is not checked by `validateDocument` — a tape arriving from the far
  // side can name anything — and indexing the glyph map with it gave
  // `undefined`, which `glyphFor` threw on: a block's own field reaching the
  // renderer as a crash, which C09 §7d's sweep is what found.
  const state: CallState | undefined = member.state;
  const slot = state === undefined ? undefined : CALL_STATE_GLYPH[state];
  const running = state === "running";
  const mark =
    slot === undefined
      ? ""
      : running
        ? spinnerFrameAt(ctx.capabilities, glyphTick(ctx.tick, ctx.motion), TAPE_SPINNER)
        : glyphFor(slot, ctx.capabilities);
  const shown = detail ? stripControl(member.detail ?? "") : "";
  const tail = running ? [mark, shown] : [shown, mark];
  const parts = [label, ...tail].filter((p) => p !== "");
  return parts.join(" ");
}

/** Every member's text at one rung, and the current's lead priced into its width. */
function texts(
  block: Tape,
  detail: boolean,
  ctx: Pick<RenderContext, "capabilities" | "tick" | "motion">,
): readonly string[] {
  return block.members.map((m) => memberText(m, detail, ctx));
}

function widthsOf(
  list: readonly string[],
  current: number,
  caps: RenderContext["capabilities"],
): readonly number[] {
  return list.map((t, i) => cells(t, caps.ambiguousWidth) + (i === current ? LEAD_CELLS : 0));
}

/**
 * The ladder and the window together — one answer, because rule 1 is a
 * statement about their order (C04 I126).
 *
 * **Every detail goes before one member goes offscreen**, and once the window
 * has slid they stay gone: bringing them back at a narrower window trades a
 * member for a clock, which is what rule 1 forbids and what keeps the ladder
 * monotonic.
 */
function layout(
  block: Tape,
  width: number,
  ctx: Pick<RenderContext, "capabilities" | "tick" | "motion">,
  held: number,
) {
  const room = normaliseWidth(width);
  const n = block.members.length; // cells-ok — a count of members
  const current = block.members.findIndex((m) => m.id === block.current);
  const caps = ctx.capabilities;
  const set = glyphs(caps);
  const marks: TapeMarks = { left: set.tapeLeft, right: set.tapeRight, gap: TAPE_GAP };
  const measure = (t: string): number => cells(t, caps.ambiguousWidth);

  const whole = (list: readonly string[]): boolean => {
    let used = 0;
    list.forEach((t, i) => {
      used += cells(t, caps.ambiguousWidth) + (i > 0 ? TAPE_GAP : 0);
    });
    return used + (current >= 0 ? LEAD_CELLS : 0) <= room;
  };

  const rich = texts(block, true, ctx);
  const detail = whole(rich);
  const list = detail ? rich : texts(block, false, ctx);
  const at = current < 0 ? 0 : current;
  const window =
    n === 0
      ? { from: 0, to: 0, before: 0, after: 0 }
      : tapeWindow(widthsOf(list, current, caps), room, at, held, marks, measure);
  return { room, list, window, current, marks, measure };
}

/**
 * The start the window settles on, for the shell to persist (C26 I25, §7a).
 *
 * **The same `layout` the renderer runs, so there is one window and not two.**
 * A renderer cannot write view state, so the answer has to be asked for from
 * outside — and asking for it by recomputing the ladder in the shell would be
 * the second rounding C26 §7a exists to prevent.
 *
 * **The tick is not an input to the width**, which is why one is not taken: a
 * spinner's frames are a single cell each at every rung (C09 I44), so the
 * running member's text is the same width whichever frame is showing. T1.50
 * asserts that rather than leaving it to be assumed, because a set with a wide
 * frame in it would make the persisted start disagree with the drawn one on
 * exactly the frames nobody looks at.
 */
export function tapeStart(
  block: Tape,
  width: number,
  capabilities: RenderContext["capabilities"],
  held: number,
): number {
  return layout(block, width, { capabilities, tick: 0 }, held).window.from;
}

function tapeElements(block: Tape, width: number): readonly NavElement[] {
  // **Every member declares an element, drawn or not** (C04 I124). A tape slides
  // rather than sheds, so a member off the end is still there — and an element
  // that vanished with the window would orphan the focus that §095's whole
  // argument is about. The offscreen ones carry a zero-width column range.
  const out: NavElement[] = [];
  const w = normaliseWidth(width);
  for (const m of block.members) {
    out.push(
      Object.freeze({
        id: m.id,
        level: "cell" as const,
        rows: Object.freeze({ from: 0, to: 1 }),
        cols: Object.freeze({ from: 0, to: w }),
        copy: stripControl(m.label),
      }),
    );
  }
  return Object.freeze(out);
}

export const tapeDefinition: BlockDefinition<Tape> = {
  kind: "tape",

  // §7a — the labels, space-joined, and **every member** rather than the window
  // (C09 I86). What a reader copies is the row, and nothing is lost from it.
  copy: (block) => block.members.map((m) => stripControl(m.label)).join(" "),

  // One row, at every width. The window is what changes, never the height —
  // which is the measurement contract holding across a kind whose content moves.
  measure: (): number => atLeastOne(1), // cells-ok — a row count

  width: (block: Tape, width: number): number => {
    const w = normaliseWidth(width);
    let used = 0;
    block.members.forEach((m, i) => {
      used += cells(stripControl(m.label), "narrow") + (i > 0 ? TAPE_GAP : 0); // narrow-ok — `width` is pure in (block, width) as `measure` is (C09 I42)
    });
    return Math.max(1, Math.min(w, used));
  },

  elements: tapeElements,

  render(block: Tape, ctx: RenderContext): Rendered {
    ctx.probe?.gauge("tape.members", block.members.length); // cells-ok — a count of members
    // **The held start, clamped at read** (C26 I25, C04 I48). The store keeps a
    // member index here where a scroll box keeps a row, because the unit is *how
    // far this container is scrolled* and the container is what knows what that
    // means; `tapeWindow` bounds it into the members, as `offsetOf` bounds a
    // box's against its ceiling.
    const { room, list, window, current } = layout(
      block,
      ctx.width,
      ctx,
      ctx.scrollOffsets?.[block.id] ?? 0,
    );
    const set = glyphs(ctx.capabilities);
    const held = ctx.focus !== null && ctx.focus.blockId === block.id ? ctx.focus.rowId : null;
    const selected = new Set(
      (ctx.focus?.selected ?? []).filter((s) => s.blockId === block.id).map((s) => s.rowId),
    );
    const spans: Span[] = [];
    const gap = (): void => {
      if (spans.length > 0) spans.push({ text: " ".repeat(TAPE_GAP) }); // cells-ok
    };
    const muted = tone("muted", ctx.theme, ctx.capabilities);

    if (window.before > 0) {
      spans.push({ text: `${set.tapeLeft}${String(window.before)}`, style: muted });
    }
    for (let i = window.from; i < window.to; i += 1) {
      const member = block.members[i];
      if (member === undefined) continue;
      gap();
      if (i === current) {
        spans.push({ text: `${glyphFor("current", ctx.capabilities)} `, style: tone("accent", ctx.theme, ctx.capabilities) });
      }
      const id = member.id;
      const on = id === held && !selected.has(id) ? "focusGround" : selected.has(id) ? "selection" : undefined;
      const name = i === current ? "accent" : "default";
      const style =
        id === held
          ? {
              ...tone("accent", ctx.theme, ctx.capabilities, on),
              ...(selected.has(id) ? selectionStyle : focusStyle)(ctx.theme, ctx.capabilities),
            }
          : selected.has(id)
            ? { ...tone(name, ctx.theme, ctx.capabilities, on), ...selectionStyle(ctx.theme, ctx.capabilities) }
            : tone(name, ctx.theme, ctx.capabilities);
      // **A member wider than the whole width truncates** (C04 I126, C4): a tape
      // with nothing in it says less than a tape with one truncated name.
      spans.push({ text: truncate(list[i] ?? "", room, ctx.capabilities), style });
    }
    if (window.after > 0) {
      gap();
      spans.push({ text: `${String(window.after)}${set.tapeRight}`, style: muted });
    }

    return rows([paint(clampSpans(spans, room, ctx.capabilities))]);
  },
};
