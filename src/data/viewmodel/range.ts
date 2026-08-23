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

/**
 * A value's position on its axis in `[0, 1]`, `0` at the top — **the shared
 * layer's coordinate** (C12 §3aj hazards 1 and 4).
 *
 * **The gate's rule, applied to the one function that had both stages in it**:
 * the shared layer produces normalised coordinates and each renderer does its
 * own rounding, so the terminal path's arithmetic is unchanged by construction.
 * `rowOf` is now that rounding and nothing else.
 *
 * **The clamp is here and not at the renderer**, because an out-of-range value
 * clamping to the edge is a statement about the *pin* rather than about cells
 * (C04 I29): the sample is pressed against the bound it exceeded, and a
 * rasteriser that received `1.4` would have to know that rule to draw it.
 *
 * **A flat line is deliberately not this function's case.** It has no direction
 * to reverse and its cell answer is `floor(last / 2)`, which is not
 * `round(0.5 · last)` at an even height — see `rowOf`.
 *
 * **It lives in L0, and that is hazard 4's seam rather than a filing decision.**
 * *A shared layout that calls `cells()` cannot serve the image path, and that is
 * discovered as a wrong-looking image rather than as an error.* Here it is
 * discovered as neither: `data/` may not import `presentation/`, so `cells()` is
 * not reachable from this file and a shared layer that reached for it **would
 * not compile**. The architecture already held the guarantee the hazard asks
 * for; the shared coordinate only had to be put where it applies.
 *
 * **`invert` is a boolean rather than a `Facing`** because §3ac rules `Facing`
 * *the renderer's* vocabulary — `origin` is the caller's and `Facing` is the
 * renderer's — so L0 holding it would contradict the ruling that put it there.
 */
export function normalisedOf(v: number, range: PinnedRange, invert: boolean): number {
  const span = range.max - range.min;
  // **Mid-ramp at a zero span** (C04 §3ak). `pinnedRange` already collapses a
  // constant field to `{v, v}` because `{v, v+1}` *puts a field that never
  // varied at the bottom of the scale, which says all minimum about data that
  // says nothing* — and this function then computed `0 / 0`.
  //
  // **The clamp could not repair it.** `NaN < 0` is false and `NaN > 1` is
  // false, so it passed through both arms: a guard written as a range check
  // does not catch a value that fails every comparison. `plotToSvg` on a flat
  // series emitted `<path d="M89.6 NaN L352 NaN L614.4 NaN"/>` — well-formed,
  // painting nothing, and past every containment assertion there is.
  //
  // **0.5 rather than 0, and it is the only renderer-independent answer.** `0`
  // means *the floor* to a position and *the coldest colour* to a field, and
  // neither reads as *every value is the same*. It is what `strip.ts` and
  // `image/overlay.ts` already do, each with its reason written down.
  //
  // **A renderer's degenerate *rounding* is still its own** (C12 §3aj hazard 1):
  // `rowOf` guards before it calls here, because `Math.floor(0.5 · last)` and
  // `Math.round(0.5 · last)` differ at every even height.
  const t = span === 0 ? 0.5 : (v - range.min) / span;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return invert ? 1 - clamped : clamped;
}
