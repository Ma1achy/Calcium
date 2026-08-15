/**
 * The dark variant. A01 Appendix A.1 is the catalogue; this is the shipping copy
 * of it, and C10 T2.4 recomputes every ratio from these values rather than
 * reading the ones recorded there.
 *
 * 24-bit hex only (I13). The curated 4-bit map is not token data and lives in
 * `four-bit.ts`, which is SS19's single named exception.
 */

import { DARK_FOUR_BIT } from "./four-bit.js";
import type { ThemeTokens } from "./types.js";

export const DARK: ThemeTokens = Object.freeze({
  name: "prism",
  variant: "dark",

  // **Inherits, and that is a decision rather than a default** (I25). A dark
  // theme in a dark terminal is what `"terminal"` is for, and painting would
  // destroy a translucent or blurred terminal for no legibility gained.
  background: "terminal",

  surfaces: Object.freeze({
    bg: "#1a1a1a",
    bgElev: "#222222",
    bgDeep: "#141414",
    border: "#2c2c2c",
    borderStrong: "#3a3a3a",

    // §4a — the two text-bearing diff surfaces. Authored against the check
    // rather than before it, and A01 A.1 records all 48 measured ratios.
    diffAdd: "#002600",
    diffRemove: "#490000",

    // §4b — the selection wash. `tone.default` measures 7.25 : 1 against it,
    // over its 4.5 floor. `tone.muted` is NOT paired with it and the figures are
    // why someone might think it should be: on light it measures 2.14–2.42
    // against every candidate, under muted's own 2.5 floor. Ghost text is muted
    // and is drawn *after* the buffer's last cluster, so it is adjacent to a
    // selection and never inside one — the scope of a floor is where the text
    // goes (C10 §4a's own argument).
    selection: "#264057",
  }),

  palettes: Object.freeze({
    tone: Object.freeze({
      carries: "meaning",
      monochrome: "typographic",
      // `muted` moved from #5a5a5a, which measured 2.52 against bg and 2.31
      // against bgElev — not "de-emphasised" but struggling, on the surface
      // every panel paints. It now carries the thinnest margin in the table,
      // 2.61 against a floor of 2.5.
      slots: Object.freeze({
        default: "#d4d4d4",
        dim: "#8a8a8a",
        muted: "#626262",
        ok: "#87b86c",
        warn: "#d4b35a",
        error: "#d47867",
        info: "#7faecf",
        accent: "#e8a87c",
        meta: "#b89cd2",
        identifier: "#7fb8b8",
      }),
      // §3's three classes. Ten legible monochrome styles do not exist, and
      // pretending otherwise gives `meta` and `identifier` an underline nobody
      // notices. This is only lossless because D29 holds: a failed row is `✗`
      // *and* red, so at 1-bit it is `✗` and bold.
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
        c1: "#e69f00",
        c2: "#56b4e9",
        c3: "#3cbf9a",
        c4: "#f0e442",
        c5: "#8fa8ff",
        c6: "#f07a3c",
        c7: "#e4a3c4",
        c8: "#cfcfcf",
      }),
    }),
    syntax: Object.freeze({
      carries: "meaning",
      monochrome: "typographic",
      // `key` is Atom One's attribute red rather than its attr colour, which is
      // the same value as `number`. The ninth slot exists because YAML keys had
      // nowhere to go; one that renders as `number` would not have given them
      // one (A01 A.1).
      slots: Object.freeze({
        keyword: "#c678dd",
        string: "#98c379",
        comment: "#676e7d",
        number: "#d19a66",
        key: "#e06c75",
        type: "#e5c07b",
        function: "#61afef",
        operator: "#56b6c2",
        punctuation: "#abb2bf",
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

    // Decoration: exempt from the floors, collapses to the foreground at 1-bit,
    // and lint-restricted to declared art (I15, SS21). The values are the
    // mockup's, untouched — art is not text, and a rule applied where it buys
    // nothing is a rule people learn to ignore.
    spectrum: Object.freeze({
      carries: "decoration",
      monochrome: "foreground",
      slots: Object.freeze({
        "0": "#e8736b",
        "1": "#e89866",
        "2": "#e8c95e",
        "3": "#a3d066",
        "4": "#66c890",
        "5": "#5fb5d4",
        "6": "#7a8fe0",
        "7": "#c187d4",
        outline: "#e8e8e8",
      }),
    }),
  }),

  fourBit: DARK_FOUR_BIT,
});
