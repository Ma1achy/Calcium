/**
 * The scrollbar's column — C09 §7f, §021.
 *
 * **One column, one box-drawing family, and twice the resolution it looks.** A
 * track and a thumb are the same shape at two weights, which is what rules out
 * a block on a hairline: *a light line and a heavy line are one thing at two
 * weights — which is what a track and a thumb ARE.*
 *
 * Nothing here reads a capability for itself (C09 I3); the set arrives as an
 * argument, resolved from the context's capabilities by the renderer.
 */
import type { ScrollbarSet } from "./glyphs.js";

/**
 * The bar's column, or `null` where a bar could not move (I92).
 *
 * `rows` is the gutter's height, `content` the total rows and `offset` how many
 * are hidden above. **Content that fits draws nothing**: a bar that is always
 * full says *there is more* to a reader who glances at it, which is the one
 * thing it exists to say.
 *
 * The arithmetic is §021's own figure read back — four offsets at twelve rows
 * fix the position count, the thumb's length, the rounding and where the last
 * offset lands (§7f's table). Nothing here is a choice that figure left open.
 */
export function scrollbarColumn(
  rows: number,
  content: number,
  offset: number,
  set: ScrollbarSet,
): readonly string[] | null {
  const height = Math.max(0, Math.floor(rows)); // cells-ok — a row count
  if (height === 0) return null;
  const viewport = height;
  const total = Math.max(0, Math.floor(content)); // cells-ok — a row count
  // **A bar that cannot move is decoration**, and the equal case is the one
  // that matters: content exactly filling its viewport is content that fits.
  if (total <= viewport) return null;

  const positions = set.half ? height * 2 : height;
  // **`max(1, …)`, because a thumb of zero is a bar with no thumb in it.** A
  // very long document over a short gutter rounds the proportion to nothing,
  // and the floor on the ratio is what keeps the mark on the screen.
  const thumb = Math.max(1, Math.floor((positions * viewport) / total));
  const maxOffset = total - viewport;
  const at = Math.min(Math.max(0, Math.floor(offset)), maxOffset); // cells-ok — a row index
  // **Floor, and the last offset lands at the end rather than being clamped
  // there** (§7f): `28 ÷ 28 × 17` is 17 exactly, so the clamp below is a guard
  // on the arithmetic and never the thing that puts the thumb at the bottom.
  const start = Math.min(
    positions - thumb,
    Math.floor((at / maxOffset) * (positions - thumb)),
  );

  const inThumb = (p: number): boolean => p >= start && p < start + thumb;
  const out: string[] = [];
  for (let row = 0; row < height; row += 1) {
    if (!set.half) {
      out.push(inThumb(row) ? set.thumb : set.track);
      continue;
    }
    const top = inThumb(row * 2);
    const bottom = inThumb(row * 2 + 1);
    // **The track runs through the half-row forms**, which is what makes them a
    // weight change rather than a block on a hairline.
    out.push(top && bottom ? set.thumb : bottom ? set.thumbStart : top ? set.thumbEnd : set.track);
  }
  return Object.freeze(out);
}
