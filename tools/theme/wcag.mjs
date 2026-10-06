/**
 * The WCAG arithmetic the theme tools share — luminance, contrast, and the
 * least move that clears a floor.
 *
 * One module because two tools compose inks by it: the generator, for a derived
 * palette's residue, and the one-shot compositions that land a theme's promise
 * on a ground. A second copy of `clearFloor` would be a second answer to *the
 * least that clears* (C10 I46).
 */
/** WCAG relative luminance and contrast, the same arithmetic `contrast.ts` uses. */
export const chan = (hex, i) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
export const lum = (hex) => {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(chan(hex, 0)) + 0.7152 * f(chan(hex, 1)) + 0.0722 * f(chan(hex, 2));
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/**
 * **Where the derivation falls short of a floor, it pays for itself.**
 *
 * The registry carries no syntax palette, so it composes no ink for syntax on a
 * diff ground either — and three derived slots land marginally under 4.5 : 1 there
 * (`nord.keyword` 4.31 and `nord.function` 4.15 on `diffAdd`, `mono.keyword` 4.32
 * on `diffRemove`). These are the derivation's residue rather than a design defect:
 * the design is silent about syntax, and a silence cannot be violated.
 *
 * So the ink is walked away from the ground, one step of 1/255 per channel at a
 * time, until it clears — the smallest move that satisfies the check, which is how
 * `tokens-dark.ts` describes authoring its own values: *against the check rather
 * than before it*. It stops at black or white and returns null rather than
 * pretending, so a floor that cannot be met is an error and not a silent pass.
 */
export function clearFloor(ink, ground, floor) {
  const up = lum(ink) > lum(ground);
  let current = ink;
  for (let step = 0; step < 255; step += 1) {
    if (contrast(current, ground) >= floor) return step === 0 ? ink : current;
    const parts = [0, 1, 2].map((i) => {
      const v = Number.parseInt(current.slice(1 + i * 2, 3 + i * 2), 16);
      return Math.max(0, Math.min(255, v + (up ? 1 : -1)));
    });
    const next = `#${parts.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    if (next === current) return null;
    current = next;
  }
  return null;
}
