/**
 * The light variant — Atom One Light, not Solarized (`j22`'s wording is wrong
 * and A01 Appendix A wins).
 *
 * **Nine of these values are not the mockup's.** They were authored there and
 * never validated: six tones missed 4.5 : 1 against `#fafafa`, and `muted`
 * missed 2.5. Hue and saturation are held; lightness is the minimum change that
 * clears the floor against both `bg` and `bgElev`. T2.4 recomputes every one of
 * them, so restoring the mockup's values fails the suite rather than passing
 * review.
 */

import { LIGHT_FOUR_BIT } from "./four-bit.js";
import type { ThemeTokens } from "./types.js";

export const LIGHT: ThemeTokens = Object.freeze({
  name: "prism",
  variant: "light",

  surfaces: Object.freeze({
    bg: "#fafafa",
    bgElev: "#f0f0f0",
    bgDeep: "#e8e8e8",
    border: "#d3d3d3",
    borderStrong: "#c8c8c8",

    // §4a — the two text-bearing diff surfaces. Authored against the check
    // rather than before it, and A01 A.1 records all 48 measured ratios.
    diffAdd: "#d2ffd2",
    diffRemove: "#fff0f0",
  }),

  palettes: Object.freeze({
    tone: Object.freeze({
      carries: "meaning",
      monochrome: "typographic",
      slots: Object.freeze({
        default: "#383a42",
        dim: "#696c77",
        muted: "#94959c", // was #a0a1a7 — 2.47, under its own 2.5 floor
        ok: "#3c793c", // was #50a14f — 3.07
        warn: "#916301", // was #c18401 — 3.06
        error: "#cd2d1e", // was #e45649 — 3.51
        info: "#0173a5", // was #0184bc — 4.00
        accent: "#1f60f0", // was #4078f2 — 3.88
        meta: "#a626a4",
        identifier: "#07768c", // was #0997b3 — 3.30
      }),
      classes: Object.freeze({
        default: "normal",
        dim: "deemphasised",
        muted: "deemphasised",
        ok: "emphasised",
        warn: "emphasised",
        error: "emphasised",
        info: "normal",
        accent: "emphasised",
        meta: "normal",
        identifier: "normal",
      }),
    }),

    syntax: Object.freeze({
      carries: "meaning",
      monochrome: "typographic",
      slots: Object.freeze({
        keyword: "#a626a4",
        string: "#3c793c",
        comment: "#86888f",
        number: "#916301",
        key: "#a8432c",
        // `number` and `type` were the same hue at different lightness, and
        // correcting both to the floor collapsed them onto #916301. The
        // correction created the collision, so only recomputation could have
        // found it — this darker gold is not an arbitrary choice.
        type: "#7a5401",
        function: "#1f60f0",
        operator: "#0173a5",
        punctuation: "#383a42",
      }),
      classes: Object.freeze({
        keyword: "emphasised",
        string: "normal",
        comment: "deemphasised",
        number: "normal",
        key: "normal",
        type: "normal",
        function: "normal",
        operator: "normal",
        punctuation: "deemphasised",
      }),
    }),

    spectrum: Object.freeze({
      carries: "decoration",
      monochrome: "foreground",
      // Several of these are the tone values as they were *before* the
      // correction above. That is not an oversight: `spectrum` is decorative
      // and exempt, and the welcome art is not text.
      slots: Object.freeze({
        "0": "#e45649",
        "1": "#d19a66",
        "2": "#c18401",
        "3": "#50a14f",
        "4": "#0997b3",
        "5": "#0184bc",
        "6": "#4078f2",
        "7": "#a626a4",
        outline: "#383a42",
      }),
    }),
  }),

  fourBit: LIGHT_FOUR_BIT,
});
