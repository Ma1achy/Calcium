/**
 * A pinned range, resolved — **one function, two families** (C04 I29, I74).
 *
 * **C12 had already ruled this and the image block did not know.** `seriesRange`
 * carries the sentence F253 was found by measuring: *a pinned axis exists so two
 * plots can be compared, and a range that grew to fit an outlier would defeat
 * the only reason to pin one.* An overlay's colour scale is the same mechanism
 * on the same kind of datum — a scalar field over a grid, read through a
 * colormap — so it is the same members and the same resolution, not a second
 * pair that happens to rhyme.
 *
 * **`heatmap.ts` is where the equivalence is written down**: *on a field those
 * two pin the **value** range — the levels and the colour scale*. A field form
 * spends `yMin`/`yMax` on the reading rather than on the ordinate, and an
 * overlay is a field form that happens to sit over a picture.
 */

/** A resolved range. Empty when `min === max` — a constant, not an error. */
export type PinnedRange = Readonly<{ min: number; max: number }>;

/** What a caller may pin. Independently optional, which is the family's rule. */
export type RangePin = Readonly<{ yMin?: number; yMax?: number }>;

/**
 * Whether a span is float noise rather than signal (C12 T3.7).
 *
 * `[1, 1 + ε, 1 + 2ε]` is not constant — `min !== max`, so I3's guard does not
 * catch it — and a linear scale over a span of 4×10⁻¹⁶ amplifies the last bit of
 * three doubles into a curve that spans the plot area and looks like a trend. It
 * is the most misleading output this component can produce, because nothing about
 * it looks degenerate.
 *
 * A few ULPs of the larger magnitude is the threshold. Genuinely small ranges are
 * unaffected: a denormal span of 5×10⁻³²⁴ against a magnitude of 10⁻³²³ is many
 * orders above its own noise floor and scales normally.
 *
 * **It moved here with `pinnedRange` rather than being left behind.** A comment
 * explaining a function that is no longer in the file is the deferral class in
 * its smallest form: still true, still readable, and about nothing a reader of
 * this file can see.
 */
function isNoise(lo: number, hi: number): boolean {
  const magnitude = Math.max(Math.abs(lo), Math.abs(hi));
  return hi - lo <= 8 * Number.EPSILON * magnitude;
}

/**
 * The data's extent with the caller's pins applied.
 *
 * **A pinned bound replaces rather than widens.** Out-of-range values clamp at
 * the reader; widening here would defeat the only reason to pin.
 *
 * **A reversed pin collapses to a constant rather than throwing** (C12 I2), and
 * so does a genuinely constant extent. **The collapse is not a floor**: a
 * constant field is drawn at the *middle* of the ramp by every reader in this
 * tree, because *no variation* is what it says — reading it as *all minimum*
 * puts a picture at the cold end of a scale it never touched.
 */
export function pinnedRange(min: number, max: number, pin: RangePin): PinnedRange {
  const lo = pin.yMin ?? min;
  const hi = pin.yMax ?? max;
  if (hi < lo) return { min: lo, max: lo };
  return isNoise(lo, hi) ? { min: lo, max: lo } : { min: lo, max: hi };
}

/**
 * The one range a **set** of fields must share, or the residual lies (F253).
 *
 * **The field is what makes a shared scale expressible and this is what makes it
 * correct.** A consumer composing three `b.image` blocks by hand can write
 * `yMin`/`yMax` on each; computing them is the part nobody should do three times
 * and the part where a fourth panel arrives and one call site is missed.
 *
 * **Non-finite values are skipped rather than poisoning the extent** — the same
 * reading `seriesRange` gives a `null` sample — and a set with nothing finite in
 * it resolves to `0..0`, which every reader draws as *no variation*.
 */
export function sharedRange(fields: readonly (readonly (readonly number[])[])[]): PinnedRange {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let seen = false;
  for (const field of fields) {
    for (const row of field) {
      for (const v of row) {
        if (!Number.isFinite(v)) continue;
        seen = true;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  return seen ? pinnedRange(min, max, {}) : { min: 0, max: 0 };
}
