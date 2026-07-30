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
