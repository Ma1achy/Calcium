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

  // **The light theme paints, because it cannot work otherwise** (I25). It sets
  // dark foregrounds and, inheriting, emits nothing behind them — so on a dark
  // terminal it is dark-on-dark, and the name is the lie. This is the one arm of
  // I25 the shipped set exercises.
  background: "surface",

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

    // §4b — the selection wash. `tone.default` measures 8.18 : 1 against it,
    // over its 4.5 floor. `tone.muted` is NOT paired with it and the figures are
    // why someone might think it should be: on light it measures 2.14–2.42
    // against every candidate, under muted's own 2.5 floor. Ghost text is muted
    // and is drawn *after* the buffer's last cluster, so it is adjacent to a
    // selection and never inside one — the scope of a floor is where the text
    // goes (C10 §4a's own argument).
    selection: "#c9ddf5",
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

    /**
     * **`n` distinct things, no order, no judgement** — the third axis, beside
     * `tone` and the change axis (roadmap 51).
     *
     * `tone` structurally cannot carry this: every member is a judgement, so a
     * categorical value would be a sixth judgement meaning *no judgement*. C12
     * cycled series through `["accent", "info", "ok", "warn"]` for want of one,
     * which told the reader that series three was good and series four wanted
     * attention — D29's *no information by colour alone* inverted into
     * information that is not there.
     *
     * **`carries: "decoration"`, and that is the whole point.** A meaning palette
     * collapses to the class it declared at 1-bit; this one collapses to the
     * foreground, because there is nothing to preserve. **The 1-bit rung is
     * vacuous by construction rather than unavailable**: C12 forces stacked
     * strips at `colourDepth === 1` for a multi-series plot, so nothing ever asks
     * for a colour to distinguish series there — the distinction is spatial and
     * the palette has no subject.
     *
     * **Eight, capped, and the cap is the ruling.** More categories than the
     * palette distinguishes is refused at construction (C04 I47's disposal),
     * because silently reusing a colour is a segmentation that lies — and that
     * is measured rather than argued: `index % 4` shipped.
     *
     * Okabe-Ito, adjusted per theme against its own background. The canonical
     * set is designed for print on white: its black is 1.21 against this ground
     * and its blue 3.36, so the two are replaced by a neutral and a lighter
     * blue. Every slot clears 6.2 here, measured.
     */
    categorical: Object.freeze({
      carries: "decoration",
      monochrome: "foreground",
      slots: Object.freeze({
        c1: "#8a5f00",
        c2: "#00688f",
        c3: "#00674a",
        c4: "#7a6a00",
        c5: "#0043a8",
        c6: "#9c3b00",
        c7: "#8f3f6d",
        c8: "#4a4a4a",
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
