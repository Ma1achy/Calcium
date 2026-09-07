/**
 * The overlay's refusal, **shared by both gates** (C04 I74, §3h.2).
 *
 * `b.image` throws and `validateDocument` refuses, and the two must be refusing
 * the same thing — the mosaic's lesson one section over, where a gate that
 * landed with the builder and not with the validator produced an invariant that
 * was true on one side and vacuous on the other.
 *
 * **The first fault, not all of them**, and for `parseAreas`' reason: a ragged
 * matrix has no column count, so every rule after it reports about a shape that
 * does not exist.
 */
import { pinnedRange, type PinnedRange } from "./range.js";
import type { ImageOverlay } from "./types.js";

/** The map an overlay takes when it names none. Stated in one place. */
export const DEFAULT_OVERLAY_COLORMAP = "inferno";

/**
 * `null` when the value is a legal overlay, otherwise the first fault.
 *
 * Takes `unknown` because the validator's subject is an inbound document and the
 * builder's is an author's argument, and neither is typed at the point of use.
 */
export function overlayFault(value: unknown, names: ReadonlySet<string>): string | null {
  if (typeof value !== "object" || value === null) {
    return `"overlay" is an object with a "values" matrix — got ${JSON.stringify(value)}`;
  }
  const o = value as Record<string, unknown>;
  const values = o["values"];
  if (!Array.isArray(values) || values.length === 0) {
    return `"overlay.values" is a non-empty array of rows (C04 I74)`;
  }
  const width = Array.isArray(values[0]) ? (values[0] as unknown[]).length : -1; // cells-ok — a column count
  if (width < 1) return `"overlay.values[0]" is a non-empty row (C04 I74)`;
  for (const [r, row] of (values as unknown[]).entries()) {
    if (!Array.isArray(row) || row.length !== width) {
      // **Ragged is refused rather than padded.** A short row silently shifts
      // every value after it into the wrong cell, which draws a plausible mask
      // over the wrong part of the picture — the same failure class the
      // placeholder encoding refuses a wrap for.
      return (
        `"overlay.values" is rectangular — row ${String(r)} has ` +
        `${String(Array.isArray(row) ? row.length : 0)} against ${String(width)} (C04 I74)`
      );
    }
    for (const [c, v] of (row as unknown[]).entries()) {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return `"overlay.values[${String(r)}][${String(c)}]" is a finite number — got ${JSON.stringify(v)}`;
      }
    }
  }
  const map = o["colormap"];
  if (map !== undefined && (typeof map !== "string" || !names.has(map))) {
    return `"overlay.colormap" names no colormap: ${JSON.stringify(map)} (C10 §6)`;
  }
  // **Independently optional, and a reversed pin is not refused** — both are the
  // plot family's rulings rather than this one's (C04 I29). `yMin: 0` alone is
  // the single-panel case, and a reversed pin collapses to a constant range at
  // `pinnedRange` because C12 I2 says no series input throws and a pin is series
  // input by another route.
  for (const key of ["yMin", "yMax"] as const) {
    const v = o[key];
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v))) {
      return `"overlay.${key}" is a finite number — got ${JSON.stringify(v)}`;
    }
  }
  const alpha = o["alpha"];
  if (alpha !== undefined && (typeof alpha !== "number" || !(alpha >= 0 && alpha <= 1))) {
    return `"overlay.alpha" is between 0 and 1 — got ${JSON.stringify(alpha)}`;
  }
  return null;
}

/**
 * The scale an overlay is read on: declared, or its own extent.
 *
 * **Derived here rather than in the renderer**, so the dither arm and the
 * composited arm cannot disagree about what a value means — two computations of
 * one figure is how the two arms would come to draw different pictures from the
 * same numbers, and there is no frame in which both are visible at once.
 */
export function overlayRange(overlay: ImageOverlay): PinnedRange {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let seen = false;
  for (const row of overlay.values) {
    for (const v of row) {
      if (!Number.isFinite(v)) continue;
      seen = true;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  // **The family's resolver, not a second one that rhymes.** A constant field
  // collapses to `{v, v}` and every reader in this tree draws a zero span at the
  // *middle* of the ramp — the first draft returned `{v, v + 1}`, which is the
  // bottom, and said *all minimum* about a picture that varies nowhere.
  return pinnedRange(seen ? min : 0, seen ? max : 0, overlay);
}
