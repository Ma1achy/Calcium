/**
 * The 1-bit stacked-strip layout (C12 §5).
 *
 * At `colourDepth: 1` there is no tone, and A01 D29 forbids carrying information
 * by colour alone — so a multi-series line plot cannot overlay its curves. Two
 * braille curves in one grid with no colour produce a picture nobody can read,
 * and there is no dash pattern that survives a 2×4 dot cell. So each series gets
 * a horizontal strip and they share the x-axis.
 *
 * **The total must not change** (I7), which is the whole reason this is arithmetic
 * in a file rather than a loop in the renderer: a strip layout that sums to
 * `height − 1` breaks C09 I1 for every multi-series plot, and it breaks it
 * silently, one row at a time, on the surfaces that show two series.
 */

/**
 * `n` strips summing to exactly `height`.
 *
 * The remainder goes to the first strip. Distributing it round-robin would give a
 * more even layout and a less predictable one; the first series is the one a
 * reader looks at, so it is the one to give the spare rows to.
 *
 * When `n` exceeds `height` there are not enough rows to give each series one,
 * and this returns `null` rather than a list of zeroes — a zero-height strip is a
 * series silently dropped, which is exactly what I8 forbids. The caller renders
 * the first series plus a legend instead.
 */
export function stripHeights(height: number, n: number): readonly number[] | null {
  const h = Math.max(1, Math.floor(height));
  const count = Math.floor(n);
  if (count <= 0) return [];
  if (count > h) return null;

  const base = Math.floor(h / count);
  const remainder = h - base * count;
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? remainder : 0));
}
