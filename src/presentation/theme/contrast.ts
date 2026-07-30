/**
 * C10 §4 — contrast, at load and never at render.
 *
 * The algorithm is named because "validated" without a named ratio is
 * unimplementable: WCAG 2.1 relative luminance over linearised sRGB, and
 * `(L₁ + 0.05) / (L₂ + 0.05)` with the lighter value as L₁.
 *
 * Every tone is checked against **both** `bg` and `bgElev`. Text lands on both —
 * `bg` is the transcript, `bgElev` is every panel, overlay and confirm — and a
 * floor checked against one of them has a gap in the place nobody inspects. Dark
 * `muted` was the case in point: 2.52 on `bg`, 2.31 on `bgElev`. `bgDeep` is
 * excluded because it carries no text; if a surface ever paints text on it, that
 * surface is wrong or the exclusion is.
 */

import type { PaletteSpec, ThemeError, ThemeTokens } from "./types.js";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Only `#rrggbb`. Not `#rgb`, and emphatically not `#rrggbbaa` — terminals have
 * no alpha, and accepting a channel that silently does nothing is worse than
 * rejecting it (T3.9).
 */
export function isHex(value: string): boolean {
  return HEX.test(value);
}

export function channels(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function linearise(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

export function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Floors, by slot. Two slots are deliberately recessive and say so:
 * `muted` is the quietest thing that must still be readable, and a `comment`
 * that met 4.5 would not be a comment.
 */
const FLOORS: Readonly<Record<string, number>> = Object.freeze({
  dim: 3,
  muted: 2.5,
  comment: 3,
});

export const DEFAULT_FLOOR = 4.5;

export function floorFor(slot: string): number {
  return FLOORS[slot] ?? DEFAULT_FLOOR;
}

/** The two surfaces text lands on. `bgDeep` is not one of them, by decision. */
export function textSurfaces(tokens: ThemeTokens): readonly (readonly [string, string])[] {
  return [
    ["bg", tokens.surfaces.bg],
    ["bgElev", tokens.surfaces.bgElev],
  ];
}

/**
 * §4a — the two diff surfaces, and the twelve slots that land on them.
 *
 * **A separate pairing rather than two more entries in `textSurfaces`.**
 * `textSurfaces` drives *every* `meaning` slot, so adding these there would bind
 * all ten tones and all nine `syntax` slots to a diff background — and seven of
 * the tones never appear on one.
 *
 * It is worth being exact about what that costs, because the obvious claim is
 * wrong: **against the shipped tokens the widened check passes.** All seven clear
 * their floors against both diff surfaces with room to spare, the tightest being
 * `dim` at 4.74. So the widening is not caught by a failure today — which is
 * precisely why it is worth a rule. What it does is bind seven slots to a
 * constraint they do not have to satisfy, so a *later* theme is rejected for a
 * failure nobody can see, and the fix will look like weakening the check.
 *
 * That is C10 §4's own argument for excluding `bgDeep` — do not validate against
 * a surface no text meets — applied in the mirror: do not validate a slot against
 * a surface that slot never lands on. The scope of a floor is where the text goes.
 *
 * Twelve, because the background covers the whole row: the nine `syntax` slots in
 * the text, and the three tones the gutter uses. Narrowing it to `syntax` would
 * leave the numbers and the marker unchecked on the surface they are drawn on,
 * which is C10 T2.14b's other direction.
 */
const DIFF_SURFACES = Object.freeze(["diffAdd", "diffRemove"]);

const DIFF_SLOTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  syntax: Object.freeze([
    "keyword", "string", "comment", "number", "key", "type", "function", "operator", "punctuation",
  ]),
  tone: Object.freeze(["ok", "error", "muted"]),
});

/** The pairing, exposed so the suite can assert its shape rather than its results. */
export function diffPairs(tokens: ThemeTokens): readonly (readonly [string, string, string, string])[] {
  const out: (readonly [string, string, string, string])[] = [];
  for (const surface of DIFF_SURFACES) {
    const hex = (tokens.surfaces as Readonly<Record<string, string>>)[surface];
    if (hex === undefined || !isHex(hex)) continue;
    for (const [palette, slots] of Object.entries(DIFF_SLOTS)) {
      for (const slot of slots) {
        const value = tokens.palettes[palette]?.slots[slot];
        if (value === undefined || !isHex(value)) continue;
        out.push([palette, slot, surface, hex]);
      }
    }
  }
  return Object.freeze(out);
}

function validateDiffSurfaces(tokens: ThemeTokens): readonly ThemeError[] {
  const errors: ThemeError[] = [];

  for (const [palette, slot, surface, hex] of diffPairs(tokens)) {
    const value = tokens.palettes[palette]?.slots[slot];
    if (value === undefined) continue;

    const floor = floorFor(slot);
    const measured = ratio(value, hex);
    if (measured >= floor) continue;

    errors.push({
      path: `palettes.${palette}.${slot}`,
      message:
        `"${slot}" is ${measured.toFixed(2)} : 1 against ${surface} (${hex}), ` +
        `below its floor of ${floor} : 1 — a diff background is a surface text ` +
        `lands on, so the background moves rather than the slot`,
    });
  }

  return errors;
}

/**
 * Every failure, not the first. A theme with four bad tones should be fixed in
 * one pass, and a validator that stops at the first turns that into four.
 */
export function validateTokens(tokens: ThemeTokens): readonly ThemeError[] {
  const errors: ThemeError[] = [];
  const surfaces = Object.entries(tokens.surfaces);

  for (const [name, value] of surfaces) {
    if (!isHex(value)) {
      errors.push({
        path: `surfaces.${name}`,
        message: `"${value}" is not a 24-bit hex colour; write it as #rrggbb (terminals have no alpha)`,
      });
    }
  }

  const bgs = isHex(tokens.surfaces.bg) && isHex(tokens.surfaces.bgElev) ? textSurfaces(tokens) : [];

  for (const [paletteName, palette] of Object.entries(tokens.palettes)) {
    errors.push(...validatePalette(paletteName, palette, bgs, tokens.surfaces.bg));
  }

  errors.push(...validateDiffSurfaces(tokens));

  return Object.freeze(errors);
}

function validatePalette(
  paletteName: string,
  palette: PaletteSpec,
  bgs: readonly (readonly [string, string])[],
  bg: string,
): readonly ThemeError[] {
  const errors: ThemeError[] = [];
  const seen = new Map<string, string>();

  for (const [slot, value] of Object.entries(palette.slots)) {
    const path = `palettes.${paletteName}.${slot}`;

    if (!isHex(value)) {
      errors.push({
        path,
        message: `"${value}" is not a 24-bit hex colour; write it as #rrggbb (terminals have no alpha)`,
      });
      continue;
    }

    // I17. Within one palette, a slot that renders as another slot bought
    // nothing — the ninth `syntax` slot exists precisely because keys had
    // nowhere to go, and a `key` that renders as `number` would not have
    // given them one.
    const twin = seen.get(value);
    if (twin !== undefined) {
      errors.push({
        path,
        message: `"${slot}" and "${twin}" are both ${value}; two slots of one palette must not render as one another`,
      });
    } else {
      seen.set(value, slot);
    }

    if (palette.carries === "decoration") continue;

    // I9 — no tone resolves to the variant's own background. It is not a
    // contrast failure so much as an invisible one, and the ratio test would
    // catch it anyway; naming it separately is what makes the error readable.
    if (value.toLowerCase() === bg.toLowerCase()) {
      errors.push({ path, message: `"${slot}" is the background colour, so it renders as nothing` });
      continue;
    }

    const floor = floorFor(slot);
    for (const [surfaceName, surface] of bgs) {
      const measured = ratio(value, surface);
      if (measured < floor) {
        errors.push({
          path,
          message:
            `"${slot}" is ${measured.toFixed(2)} : 1 against ${surfaceName} (${surface}), ` +
            `below its floor of ${floor} : 1`,
        });
      }
    }
  }

  if (palette.carries === "meaning" && palette.monochrome === "typographic") {
    for (const slot of Object.keys(palette.slots)) {
      if (palette.classes?.[slot] === undefined) {
        errors.push({
          path: `palettes.${paletteName}.classes.${slot}`,
          message:
            `a "meaning" palette declares its typographic fallback per slot (I15); ` +
            `"${slot}" has no class, so it would carry nothing at 1-bit`,
        });
      }
    }
  }

  return errors;
}
