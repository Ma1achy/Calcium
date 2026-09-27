/**
 * The curated ANSI16 pair per band, per high-contrast theme (C10 I61).
 *
 * **Curated, not derived**, and the search is why: over every index
 * combination, hcDark has pairs that meet C10 I45's four band constraints
 * against the reference palette and hcLight has none. hcLight's focus band must
 * sit near a white page with a 7 : 1 ink, and every light ground holding black
 * at 7 : 1 reads under 2 : 1 against white — silver is closest, at 1.82. That
 * shortfall is C10 T2.64's one exemption.
 *
 * **Hand-written beside the `fourBit` maps**, and it moves with them when the
 * 4-bit palettes are ported into the design registry; the generator lends it to
 * `tokens.generated.ts` the way it lends `fourBit`.
 */
import type { BandFourBit } from "./types.js";

export const BAND_FOUR_BIT: Readonly<Record<"hcDark" | "hcLight", BandFourBit>> = Object.freeze({
  // Blue beneath white for focus, the nearest to `#234f92`; yellow beneath black
  // for selection, the nearest to `#efc51c`.
  hcDark: Object.freeze({
    focusGround: Object.freeze({ ground: 12, ink: 15 }),
    selection: Object.freeze({ ground: 11, ink: 0 }),
  }),
  // Silver beneath black for focus — 1.82 : 1 against the page, the one
  // shortfall; purple beneath white for selection, the nearest to `#46176d`.
  hcLight: Object.freeze({
    focusGround: Object.freeze({ ground: 7, ink: 0 }),
    selection: Object.freeze({ ground: 5, ink: 15 }),
  }),
});
