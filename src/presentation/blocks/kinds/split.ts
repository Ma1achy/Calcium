/**
 * The split — two peer panes, and the divider is a control (C04 §3aq, C04 I132,
 * C04 I133, C04 I134, §105).
 *
 * **The divider is the left pane's bar.** Ruling 22 puts each box's bar in its
 * own last column, and the left pane's last column is the divider — §105 draws
 * one column there and §021's thumb in it. So a left pane that fits draws bare
 * track and one that overflows draws its position, and there is never a second
 * column beside it. The right pane draws its own bar in its own last column, as
 * a scroll box does: *two bars is legal when they are two documents* (§021).
 *
 * **The blank cell after the divider is the figure's** (`│ export`): the bar
 * sits against its own content and the blank keeps it off the other pane's.
 *
 * Nothing here reads a capability for itself (C09 I3), and the panes' offsets
 * arrive as view state under `splitPaneKey`, clamped at read (C04 I48).
 */
import { descendants, normaliseWidth, splitPaneKey, splitPanes } from "../../../data/viewmodel/index.js";
import type { Block, Split } from "../../../data/viewmodel/index.js";
import { scrollbarSet } from "../glyphs.js";
import { scrollbarColumn } from "../scrollbar.js";
import { based, groundSequence, paint, tone } from "../paint.js";
import { fitRow, rowCells } from "../../rows.js";
import type { BlockDefinition, RenderContext, Rendered } from "../types.js";

/** Rows `[0, height)` of a pane at `offset`, each cut and padded to `width`. */
function paneRows(child: Block, width: number, content: number, height: number, offset: number, ctx: RenderContext): string[] {
  const to = Math.min(content, offset + height);
  // **Sliced, never drawn whole past the box** (C09 I58, F855): the child's
  // own `window` where it has one, and the rendered rows cut otherwise — a
  // row is a string, so cutting the list is exact where a kind declines.
  const whole = offset === 0 && to === content;
  const piece = whole ? null : ctx.windowChild(child, width, offset, to);
  const drawn = whole
    ? ctx.renderChild(child, width)
    : piece !== null
      ? ctx.renderChild(piece.block, width)
      : ctx.renderChild(child, width).slice(offset, to);
  const out: string[] = [];
  for (let i = 0; i < height; i += 1) { // cells-ok — a row count
    const row = fitRow(drawn[i] ?? "", width);
    out.push(row + " ".repeat(Math.max(0, width - rowCells(row))));
  }
  return out;
}

/** The pane's offset, clamped at read and never corrected at write (C04 I48). */
function offsetOf(block: Split, side: number, content: number, ctx: RenderContext): number {
  const held = ctx.scrollOffsets?.[splitPaneKey(block.id, side)] ?? 0;
  return Math.min(Math.max(0, Math.trunc(held)), Math.max(0, content - block.height));
}

/**
 * Whether focus is inside `child` — on the pane's own element, which names the
 * split (§3aq S6), or on any block within it.
 */
function holds(block: Split, child: Block, ctx: RenderContext): boolean {
  const focus = ctx.focus ?? null;
  if (focus === null) return false;
  if (focus.blockId === block.id) return focus.rowId === child.id;
  if (focus.blockId === child.id) return true;
  for (const d of descendants(child)) if (d.id === focus.blockId) return true;
  return false;
}

export const splitDefinition: BlockDefinition<Split> = {
  kind: "split",

  // The panes that answered, one newline apart — a scroll's rule (§7a, I86).
  copy: (block, copyChild) =>
    block.children
      .map(copyChild)
      .filter((t): t is string => t !== null && t !== "")
      .join("\n"),

  /** `height` at every width (C04 I132): the bars say where, and there is no residue row. */
  measure: (block: Split) => block.height,

  render(block: Split, ctx: RenderContext): Rendered {
    const w = normaliseWidth(ctx.width);
    const panes = splitPanes(block, w, ctx.measureChild);
    ctx.probe?.gauge("split.rows", panes.reduce((n, p) => n + p.content, 0));
    const set = scrollbarSet(ctx.capabilities);
    const height = block.height;
    const ink = (lit: boolean) => tone(lit ? "accent" : "muted", ctx.theme, ctx.capabilities);

    const drawn = panes.map((p) => {
      const offset = offsetOf(block, p.side, p.content, ctx);
      const rowsOf = paneRows(p.child, p.width, p.content, height, offset, ctx);
      // **A pane addressed to the split is lit as a region** (§3aq S6, C09
      // I100, `R-FOC-004`): the focus names the container, so the child
      // cannot light itself, and the ground goes behind its whole extent.
      const lit = ctx.focus?.blockId === block.id && ctx.focus.rowId === p.child.id;
      const ground = lit ? groundSequence("surface.focusGround", ctx.theme, ctx.capabilities) : "";
      return { ...p, offset, rows: ground === "" ? rowsOf : [...based(rowsOf, ground)] };
    });

    const left = drawn[0];
    const right = drawn[1];
    if (left === undefined) return [];
    // **Below four columns the left pane draws alone** (§3aq S5) — the right is
    // placed by neither half, so `splitPanes` did not return it.
    if (right === undefined) return left.rows;

    // **The divider**: the left pane's bar where it overflows, bare track where
    // it fits (§3aq S1, S2), in accent while focus is inside that pane (S7).
    const divider =
      scrollbarColumn(height, left.content, left.offset, set) ?? Array.from({ length: height }, () => set.track);
    const dividerInk = ink(holds(block, left.child, ctx));
    const bar = right.bar ? scrollbarColumn(height, right.content, right.offset, set) : null;
    const barInk = ink(holds(block, right.child, ctx));

    const out: string[] = [];
    for (let i = 0; i < height; i += 1) { // cells-ok — a row count
      const tail = bar === null ? "" : paint([{ text: bar[i] ?? "", style: barInk }]);
      out.push(
        `${left.rows[i] ?? ""}${paint([{ text: divider[i] ?? "", style: dividerInk }])} ${right.rows[i] ?? ""}${tail}`,
      );
    }
    return out;
  },
};
