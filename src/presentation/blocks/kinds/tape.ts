/**
 * `tape` — a row of peers you navigate, which slides rather than sheds.
 *
 * C04 §3ao, C04 I124, C04 I125, C04 I126, §095. The window's arithmetic is `tape-window.ts`; this
 * file is the parts it measures and the row it draws.
 */
import type { CallState, Tape } from "../../../data/viewmodel/index.js";
import { atLeastOne, normaliseWidth } from "../../../data/viewmodel/index.js";
import { cells, stripControl, truncate } from "../../text.js";
import { CALL_STATE_GLYPH, glyphCells, glyphFor, glyphs, spinnerFrameAt } from "../glyphs.js";
import { clampSpans, focusShapeStyle, paint, rows, selectionStyle, tone, type Span } from "../paint.js";
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
  // `validateDocument` refuses one now (C04 I144), and the sentence here that
  // said it was *not checked* is superseded. The guard stays for a tape built
  // without the gate, where indexing the glyph map gave `undefined` and
  // `glyphFor` threw on it — a block's own field reaching the renderer as a
  // crash, which C09 §7d's sweep is what found.
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

/**
 * The row's width at an unbounded width, **every part at its widest** (C04 I147).
 *
 * `width` takes no capability (C09 I42), so it cannot know the convention the
 * row will be drawn at, and a width disagreement has a safe direction: over. So
 * labels and details are measured at `wide`, a settled state's mark at its
 * reservation (`glyphCells` — one cell at either arm, by the 1:1 rule), and a
 * running member's spinner at one cell (C09 I44). The joins inside a member are
 * `memberText`'s `join(" ")` over its non-empty parts.
 *
 * **It counted labels at `narrow` and the gaps, and nothing else**, so a tape of
 * three members answered 17 and, laid out at 17, drew `«1  › arm ⋅  1»`: every
 * detail, every mark and the current's lead were drawn and not counted.
 */
function naturalWidth(block: Tape): number {
  const ambiguous = "wide" as const; // the widest convention: `width` cannot see the terminal's
  const current = block.members.findIndex((m) => m.id === block.current);
  let used = 0;
  block.members.forEach((m, i) => {
    const slot = m.state === undefined ? undefined : CALL_STATE_GLYPH[m.state];
    const parts = [
      cells(stripControl(m.label), ambiguous),
      cells(stripControl(m.detail ?? ""), ambiguous),
      slot === undefined ? 0 : m.state === "running" ? 1 : glyphCells(slot),
    ].filter((n) => n > 0);
    const text = parts.reduce((a, n) => a + n, 0) + Math.max(0, parts.length - 1); // cells-ok — measured cells and the joins between them
    used += text + (i === current ? LEAD_CELLS : 0) + (i > 0 ? TAPE_GAP : 0);
  });
  return used;
}

/** One piece of the drawn row: a residue mark, a gap, the current's lead, or a member's text. */
type Piece = Readonly<{
  text: string;
  role: "before" | "after" | "gap" | "lead" | "member";
  /** The member a lead or a text belongs to; `-1` for the rest. */
  member: number;
}>;

/**
 * **The row as pieces, before any style** — one answer for `render` and for
 * `tapeMemberCols`, so the columns the pointer is told are the cells the row
 * draws rather than a second reading of the ladder (C04 I124, C26 §7a).
 */
function piecesOf(
  block: Tape,
  width: number,
  ctx: Pick<RenderContext, "capabilities" | "tick" | "motion">,
  held: number,
): Readonly<{ room: number; current: number; pieces: readonly Piece[] }> {
  const { room, list, window, current } = layout(block, width, ctx, held);
  const set = glyphs(ctx.capabilities);
  const pieces: Piece[] = [];
  const gap = (): void => {
    if (pieces.length > 0) pieces.push({ text: " ".repeat(TAPE_GAP), role: "gap", member: -1 }); // cells-ok
  };
  if (window.before > 0) pieces.push({ text: `${set.tapeLeft}${String(window.before)}`, role: "before", member: -1 });
  for (let i = window.from; i < window.to; i += 1) {
    if (block.members[i] === undefined) continue;
    gap();
    if (i === current) pieces.push({ text: `${glyphFor("current", ctx.capabilities)} `, role: "lead", member: i });
    // **A member wider than the whole width truncates** (C04 I126, C4): a tape
    // with nothing in it says less than a tape with one truncated name.
    pieces.push({ text: truncate(list[i] ?? "", room, ctx.capabilities), role: "member", member: i });
  }
  if (window.after > 0) {
    gap();
    pieces.push({ text: `${String(window.after)}${set.tapeRight}`, role: "after", member: -1 });
  }
  return { room, current, pieces };
}

/**
 * Each member's drawn columns `[from, to)`, in member order (C04 I124; review
 * batch 4 M14.2, D11).
 *
 * **A pure helper beside `tapeStart`, not a parameter on `elements`.** A
 * member's columns move with the held start, and the held start is view state,
 * so geometry in `elements` would move without `rev` moving — the cache C26 I3
 * exists to keep. The shell asks this where it holds the start, as it asks
 * `tapeStart`; that reader is batch 4's shell lane, queued behind this one.
 *
 * The current's lead is the current's — a press on `›` is a press on the
 * member — while a gap and a residue mark are nobody's, and a member off either
 * end is empty: at `0` before the window and at the width after it. Cut at the
 * width, as `clampSpans` cuts the row.
 */
export function tapeMemberCols(
  block: Tape,
  width: number,
  capabilities: RenderContext["capabilities"],
  held: number,
): readonly Readonly<{ from: number; to: number }>[] {
  const { room, pieces } = piecesOf(block, width, { capabilities, tick: 0 }, held);
  const drawn = new Map<number, { from: number; to: number }>();
  let cursor = 0;
  for (const piece of pieces) {
    const next = cursor + cells(piece.text, capabilities.ambiguousWidth);
    if (piece.member >= 0) {
      // The lead comes first and the text extends it: one run per member.
      const range = drawn.get(piece.member);
      drawn.set(piece.member, { from: range?.from ?? Math.min(room, cursor), to: Math.min(room, next) });
    }
    cursor = next;
  }
  const first = Math.min(...drawn.keys());
  return Object.freeze(
    block.members.map((_, i) =>
      Object.freeze(drawn.get(i) ?? (i < first ? { from: 0, to: 0 } : { from: room, to: room })),
    ),
  );
}

function tapeElements(block: Tape, width: number): readonly NavElement[] {
  // **Every member declares an element, drawn or not** (C04 I124). A tape slides
  // rather than sheds, so a member off the end is still there — and an element
  // that vanished with the window would orphan the focus that §095's whole
  // argument is about. **Every member carries the row's whole width**, and the
  // sentence that said the offscreen ones carry a zero-width range described a
  // helper that did not exist: a member's drawn columns move with the held
  // start, which is view state, so here they would be geometry moving without
  // `rev` (C26 I3). They are `tapeMemberCols`'s answer.
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

  width: (block: Tape, width: number): number =>
    Math.max(1, Math.min(normaliseWidth(width), naturalWidth(block))),

  elements: tapeElements,

  render(block: Tape, ctx: RenderContext): Rendered {
    ctx.probe?.gauge("tape.members", block.members.length); // cells-ok — a count of members
    // **The held start, clamped at read** (C26 I25, C04 I48). The store keeps a
    // member index here where a scroll box keeps a row, because the unit is *how
    // far this container is scrolled* and the container is what knows what that
    // means; `tapeWindow` bounds it into the members, as `offsetOf` bounds a
    // box's against its ceiling.
    const { room, current, pieces } = piecesOf(block, ctx.width, ctx, ctx.scrollOffsets?.[block.id] ?? 0);
    const held = ctx.focus !== null && ctx.focus.blockId === block.id ? ctx.focus.rowId : null;
    const selected = new Set(
      (ctx.focus?.selected ?? []).filter((s) => s.blockId === block.id).map((s) => s.rowId),
    );
    const muted = tone("muted", ctx.theme, ctx.capabilities);
    const spans: Span[] = pieces.map((piece): Span => {
      if (piece.role === "gap") return { text: piece.text };
      if (piece.role === "before" || piece.role === "after") return { text: piece.text, style: muted };
      if (piece.role === "lead") return { text: piece.text, style: tone("accent", ctx.theme, ctx.capabilities) };
      const id = block.members[piece.member]?.id ?? "";
      const on = id === held && !selected.has(id) ? "focusGround" : selected.has(id) ? "selection" : undefined;
      const name = piece.member === current ? "accent" : "default";
      const style =
        id === held
          ? {
              ...tone("accent", ctx.theme, ctx.capabilities, on),
              ...(selected.has(id) ? selectionStyle : focusShapeStyle)(ctx.theme, ctx.capabilities),
            }
          : selected.has(id)
            ? { ...tone(name, ctx.theme, ctx.capabilities, on), ...selectionStyle(ctx.theme, ctx.capabilities) }
            : tone(name, ctx.theme, ctx.capabilities);
      return { text: piece.text, style };
    });

    return rows([paint(clampSpans(spans, room, ctx.capabilities))]);
  },
};
