/**
 * C22 §6a — layers, drawn over the four regions.
 *
 * C15 has placed layers correctly since it landed and **nothing composited
 * one**. `overlays.layout()` was called twice in the whole tree — once for
 * C16's mouse hit-testing, once for the completion menu's own remainder count —
 * and neither drew a `Placed`. So the completion menu, reverse search and the
 * exit confirm were all invisible, and the frame's arithmetic could not see it:
 * a layer floats above the four regions rather than taking rows from them, so
 * `heightsSum` holds at every width with every layer missing (S01 §3a).
 *
 * **Three rules, and each has a failure that reads as something else.**
 *
 * **1. Every cell of a box is written, background included** (I29). The prompt
 * or the transcript beneath has already painted those cells, so a loop writing
 * only the glyphs a layer's blocks produced leaves the old content showing in
 * the gaps — and the symptom is text bleeding through a menu, which reads as a
 * C09 defect rather than a compositing one.
 *
 * **2. Layers composite onto the accumulated rows** (I29), bottom-first in the
 * order `layout()` returned them, so the top layer wins each cell it covers and
 * the one beneath keeps the cells it does not. Compositing each layer onto the
 * *base* rows instead is correct for one layer and discards the lower of two: a
 * menu under a search vanishes entirely, with the search drawn perfectly. The
 * walk's row 3, and the one that would have shipped.
 *
 * **3. A box that escapes the region refuses the frame** (I30). C15's clamp
 * makes it unreachable, which is the reason to assert it rather than the reason
 * not to — `heightsSum`'s shape. A clip would repair the symptom and leave a
 * placement defect drawing something plausible, and one row past the last row
 * scrolls the alternate screen.
 *
 * The split with C15 is that C15 clamps the box and reports `truncated`, and
 * this honours the box and cuts the content past it (C15 §4). Neither re-decides
 * the other's half.
 */

import { renderSequenceToLines } from "../presentation/render-lines.js";
import type { RenderScratch } from "../presentation/blocks/types.js";
import { sliceCells } from "../presentation/text.js";
import { SGR_RESET } from "../terminal/escapes.js";
import { FrameError, exact } from "./paint.js";
import type { Placed } from "../viewport/overlay/index.js";
import type { BlockRegistry } from "../presentation/blocks/index.js";
import type { ResolvedTheme } from "../presentation/theme/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";

export type CompositeDeps = Readonly<{
  registry: BlockRegistry;
  theme: ResolvedTheme;
  capabilities: TerminalCapabilities;
  /** Where the viewport region starts, in frame rows. C15 knows nothing of it. */
  regionTop: number;
  /** The region C15 placed against — its own coordinates (I28). */
  region: Readonly<{ width: number; height: number }>;
  /**
   * The session's render scratch (C12 I107).
   *
   * **A layer is the other place a 3D plot renders**, and it is the one the
   * reference app's `/live` uses. Threading it here and not in `session.ts`
   * alone is what makes the invariant true of both hosts rather than of the
   * transcript — the same gap C23 §3b commits about *its* two hosts, one store
   * along.
   */
  scratch?: RenderScratch;
}>;

/**
 * The frame's rows with every layer drawn over them.
 *
 * `rows` is the painted frame — exactly `size.rows` strings of `size.columns`
 * cells — and the result is the same shape. Nothing here changes a height:
 * layers take no rows.
 */
export function composite(
  rows: readonly string[],
  placed: readonly Placed[],
  deps: CompositeDeps,
): readonly string[] {
  if (placed.length === 0) return rows;

  const columns = deps.region.width;
  // **Accumulated, not per-layer** (I29). Every layer composites onto what the
  // layers below it left, which is what makes "the top layer wins each cell"
  // and "the lower keeps the rest of its box" the same sentence.
  const out = [...rows];

  for (const p of placed) {
    if (p.height <= 0 || p.width <= 0) continue; // §6a row 8 — nothing to write

    // I30. Not clipped into range: C15 owns the clamp, and a drawer that
    // quietly repaired a box would leave a placement defect drawing something
    // plausible for as long as nobody looked at it.
    if (
      p.top < 0 ||
      p.left < 0 ||
      p.top + p.height > deps.region.height ||
      p.left + p.width > deps.region.width
    ) {
      throw new FrameError(
        `layer ${p.layer.id} escapes the region: ` +
          `[${String(p.top)}, ${String(p.top + p.height)}) × ` +
          `[${String(p.left)}, ${String(p.left + p.width)}) ` +
          `in ${String(deps.region.height)} × ${String(deps.region.width)}`,
      );
    }

    const body = layerRows(p, deps);
    for (let i = 0; i < p.height; i += 1) {
      const frameRow = deps.regionTop + p.top + i;
      const base = out[frameRow];
      if (base === undefined) continue;
      out[frameRow] = spliceRow(base, body[i] ?? "", p.left, p.width, columns);
    }
  }

  return Object.freeze(out);
}

/**
 * A layer's content as exactly `height` rows of exactly `width` cells.
 *
 * Rendering is C09's, through the one implementation — a second render here
 * would be C09 I1's divergence in the place that moves the whole frame. Rows
 * past the box are cut (C15 reported `truncated`; cutting is this side's half
 * of the split) and rows short of it are blank ones, because a box is written
 * whole (I29).
 */
function layerRows(p: Placed, deps: CompositeDeps): readonly string[] {
  const lines =
    p.layer.content.length === 0
      ? []
      : renderSequenceToLines(deps.registry, p.layer.content, p.width, {
          theme: deps.theme,
          capabilities: deps.capabilities,
          ...(deps.scratch === undefined ? {} : { scratch: deps.scratch }),
        });

  const out: string[] = [];
  for (let i = 0; i < p.height; i += 1) out.push(exact(lines[i] ?? "", p.width));
  return out;
}

/**
 * One row, with `width` cells at `left` replaced by the layer's.
 *
 * **The two resets are load-bearing in both directions.** Without the first the
 * base row's colour bleeds into the layer; without the second the layer's bleeds
 * into whatever of the base follows it. `sliceCells` re-opens the base's own
 * style on the tail, so the row after the layer draws as it was written rather
 * than in the terminal's default (C09 I20).
 */
function spliceRow(
  base: string,
  body: string,
  left: number,
  width: number,
  columns: number,
): string {
  const head = left === 0 ? "" : sliceCells(base, 0, left);
  const tail = left + width >= columns ? "" : sliceCells(base, left + width, columns);
  const row = `${head}${SGR_RESET}${body}${SGR_RESET}${tail}`;
  // Squared off against the frame's one width, as every other row is. A splice
  // that measured right three times and wrong once puts the frame a cell into a
  // row nobody counted (C09 I20).
  return exact(row, columns);
}
