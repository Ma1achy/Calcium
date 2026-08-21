/**
 * The high-contrast theme — the first shipped set authored **to** the floors
 * (roadmap 24, C10 §5a).
 *
 * **Every other theme in this repository was adjusted until it passed.** The
 * light variant's nine corrected values say so in their own comments: authored
 * in a mockup, measured afterwards, moved the minimum distance that cleared
 * 4.5 : 1. That is how a floor becomes a target — the corrected value sits *at*
 * the boundary, and nothing distinguishes a theme that meets its floor from one
 * designed for it.
 *
 * These values were **solved for**. Each slot names a hue and a saturation, and
 * the lightness is the lowest one meeting this theme's own promise against both
 * grounds. That promise is **7 : 1**, WCAG AAA for body text, and it is nowhere
 * expressible in the framework: `FLOORS` is a module constant naming the
 * *minimum* every theme must clear, so a theme that promises more has no way to
 * say so and no way to be held to it. T2.24 is where the promise is checked,
 * and §5a.6 records what a per-theme floor would take.
 *
 * **`muted` is the token this theme exists to answer.** It measured 2.14–2.42
 * on the light variant against every candidate selection wash — under its own
 * 2.5 floor — and that was recorded during the selection work as a reason *not*
 * to pair it. A high-contrast theme cannot carry a slot at 2.4 : 1, so here it
 * meets 7.93 and is still visibly quieter than `default` at 21 and `dim` at
 * 12.4. **Recessive and readable are not in tension at this ground**; they were
 * in tension on `#fafafa`, where the headroom below the floor is 1.5 units of
 * ratio and above it is 18.
 *
 * **What this theme cannot promise, stated rather than discovered.** The floor
 * is provable at 24-bit and against the cube's defined RGB at 8-bit (I26). At
 * **4-bit it is not provable at all** — `surface.bg` is index 0 and the tones
 * are the bright half, and every one of those is whatever the emulator's palette
 * says. So the 4-bit map keeps the promise this depth *can* keep, which is
 * **distinctness** (I17), and the contrast claim stops one rung above it. That
 * is the rung an accessibility theme most owes and the one it can least
 * guarantee, and pretending otherwise would be a claim about a colour this
 * process cannot see — the same argument `four-bit.ts` already makes about diff
 * backgrounds.
 *
 * **The diff surfaces keep the framework's floors and not this theme's**, and
 * the arithmetic is why. At 7 : 1 the darkest of the twelve slots that land on a
 * diff row admits a ground of luminance 0.006 — `#001500`, twenty-one units of
 * one channel — which is not a signal, it is a rounding error with a hue. So
 * they are authored to §4a's floors, which is what I23 already assumes: the
 * background is the third signal and the marker and toned gutter carry the
 * distinction alone.
 */

import { HIGH_CONTRAST_FOUR_BIT } from "./four-bit.js";
import type { ThemeTokens } from "./types.js";

export const HIGH_CONTRAST: ThemeTokens = Object.freeze({
  name: "high-contrast",
  variant: "dark",

  // **It paints, and that is not a preference here** (I25). A contrast promise
  // is a claim about a *pair*, so a theme that owns one end and assumes the
  // other is promising a ratio against a colour it cannot see. Transparency is
  // a real reason to inherit and it is the reason `--no-bg` exists; a reader
  // who turns this theme's background off has turned the promise off with it,
  // and the notice says so.
  background: "surface",

  surfaces: Object.freeze({
    // Pure black, because every ratio below is measured against it and it is the
    // one ground with no headroom spent before the first token is placed.
    bg: "#000000",
    bgElev: "#121212",
    bgDeep: "#1c1c1c",

    // Borders carry no text, so no floor applies (§4, I19). They are bright
    // enough to be structure rather than suggestion, which is what a
    // high-contrast reader is asking for.
    border: "#767676",
    borderStrong: "#a6a6a6",

    // §4a's floors, not this theme's 7 : 1 — see the header. Solved for the
    // brightest ground on which all twelve slots still clear their own floors.
    diffAdd: "#003300",
    diffRemove: "#3b0000",

    // §4b — `tone.default` is the only slot paired with it, and white on this
    // measures far above its 4.5 floor.
    selection: "#00405c",

    // §4d — the error tag's pair, **and it inverts**.
    //
    // This theme's `tone.error` is `#ff7171`, a *light* red, and the ground is
    // that value by equality like every other theme (I32). White on it is
    // **2.67 : 1** and would fail; `#3d0000` on it is **6.55**. So the ink
    // flips, and the ground still measures **7.85** against this theme's black
    // page.
    //
    // **This is the alternative C10 §4d names, shipped.** A light ground with
    // dark ink clears the meaning floor on both sides and needs no lowered floor
    // at all — dark declines it to keep a red that reads as a failure rather
    // than a warning, and that is a preference rather than a constraint. A
    // single ink chosen once would have failed here and read as this theme's
    // fault; the pair per theme is what makes it a choice.
    errorGround: "#ff7171",
    errorInk: "#3d0000",
  }),

  palettes: Object.freeze({
    tone: Object.freeze({
      carries: "meaning",
      monochrome: "typographic",
      slots: Object.freeze({
        // 21.00 — the maximum available, and the reason the ground is pure black.
        default: "#ffffff",
        // 12.42, solved at target 11: below `default` and unmistakably readable.
        dim: "#c7c7c7",
        // 7.93 at target 7 — the quietest slot in the theme, and still AAA.
        muted: "#9f9f9f",
        ok: "#0ab827", // 7.90
        warn: "#c99700", // 7.91
        error: "#ff7171", // 7.85 — this theme's own promise is stricter than the floor
        info: "#2ea5fa", // 7.88
        accent: "#b887fc", // 7.91
        meta: "#eb68f7", // 7.86
        identifier: "#0eb2a5", // 7.93
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
        keyword: "#e46dfb", // 7.88
        string: "#0fb80f", // 7.88
        // 7.93, and this is the second half of `muted`'s answer: a comment whose
        // floor is 3 elsewhere is at AAA here. It stays recessive by being grey
        // among colour, not by being dim.
        comment: "#9f9f9f",
        number: "#f87c00", // 7.87
        key: "#fb7289", // 7.87
        type: "#bb9c00", // 7.87
        function: "#5fa0fb", // 7.91
        operator: "#0aafbe", // 7.89
        // 14.59 at target 13 — punctuation is structure and is read as often as
        // the words between it.
        punctuation: "#d7d7d7",
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

    /**
     * **Absent until F172's gate ran, and every multi-series plot paid for it.**
     * The framework resolves `categorical.c1`–`c8` for a plot's series and for a
     * `pills` chip; this theme declared no such palette, so `resolve` returned
     * `NO_STYLE` and eight series drew in one colour — the default foreground —
     * on the theme a reader chooses when they most need to tell things apart.
     * Silent, because a missing palette and a decoration palette collapsed at
     * one bit are the same value to every caller (C10 I30, FINDINGS F179).
     *
     * **The same eight as the dark variant, and that is a ruling rather than a
     * copy.** They are Okabe–Ito, chosen for distinguishability under the three
     * common colour-vision deficiencies — which is precisely the property this
     * theme exists to maximise, and a set solved for luminance alone would be
     * worse at it. The ground differs by `#1a1a1a` against `#000000`, which
     * raises every ratio rather than lowering it.
     *
     * **Decoration, so no floor applies** (§2, and `resolve.ts` skips the
     * contrast gate for `carries !== "meaning"`). Stated here rather than
     * discovered: a categorical slot is never the only carrier — C12 stacks its
     * series at one bit and C09 pairs a chip with its text — so the exemption is
     * D29 holding, not a floor being waived.
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
    spectrum: Object.freeze({
      carries: "decoration",
      monochrome: "foreground",
      // Decorative and exempt from every floor (§2). These are the tone values
      // at full saturation — art on a black ground, where the constraint is
      // separation rather than legibility.
      slots: Object.freeze({
        "0": "#ff7171",
        "1": "#f87c00",
        "2": "#c99700",
        "3": "#0ab827",
        "4": "#0eb2a5",
        "5": "#2ea5fa",
        "6": "#b887fc",
        "7": "#eb68f7",
        outline: "#ffffff",
      }),
    }),
  }),

  fourBit: HIGH_CONTRAST_FOUR_BIT,
});
