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
 *
 * **That conditional has fired once and the answer was *the surface*** (C10 I34,
 * §4f, F632). The SVG plot arm painted its page in `bgDeep` and wrote every
 * label on it; measured across the three shipped themes, light failed twelve
 * slots there — `tone.muted` at 2.44 under its own 2.5 — while every one of them
 * clears against `bg`. The page is `surface.bg` now. **The exclusion is not the
 * watcher**, and nothing here can be: C10 T2.27 asserts the arm's page is a hex
 * some member of `textSurfaces` holds, which closes that ground rather than the
 * class of grounds.
 *
 * **And the same conditional on the other axis, also fired** (C10 I35, §4g,
 * F652, F653). A floor is an ink paired with a ground, and the table above is
 * written over the `meaning` palettes because those were the inks it knew about.
 * `categorical` is `decoration` and the framework paints it as text at ten sites
 * in both plot arms — so it was exempt from a check over every surface, and read
 * as exempt from every floor. `decorationTextPairs` is the fourth named pairing;
 * the two wider arms are refused by measurement below.
 */

import type { PaletteSpec, ThemeError, ThemeTokens } from "./types.js";
import { TONES } from "../../data/viewmodel/index.js";

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
  /**
   * **Lowered deliberately, and the whole argument is in C10 §4d and I32.**
   *
   * Not repeated here, because a floor lowered in a comment is a floor nobody
   * can find later and C10's case for the meaning/decoration split is that a
   * floor is a promise the *theme* makes. The two things a reader meeting this
   * number needs are the trade and where it is written down:
   *
   * **`tone.error` is also the `status` tag's ground, and on a dark page the two
   * constraints have no common solution.** Measured over the whole 8-bit cube at
   * step 4 — 262,144 candidates, not reds — **zero** colours are both legible on
   * `bgElev` and dark enough to hold white at 4.5, on dark and on high-contrast
   * alike; on light, 81,907 are, which is why light clears 4.5 unaided.
   *
   * So this buys `#c62828` holding white at **5.62 : 1** in the tag, and costs
   * the message text **2.83** against `bgElev` — the binding surface, with `bg`
   * at 3.10 — which is `muted`'s existing standard rather than body text's.
   *
   * **The alternative is shipped and is not this**: high-contrast takes a light
   * ground with dark ink and needs no exception. Lightening the red to satisfy
   * this number would undo a decision rather than repair an oversight, and §4d
   * carries the figures that say which.
   */
  error: 2.5,
});

export const DEFAULT_FLOOR = 4.5;

export function floorFor(slot: string): number {
  return FLOORS[slot] ?? DEFAULT_FLOOR;
}

/**
 * The two surfaces text lands on. `bgDeep` is not one of them, by decision.
 *
 * **Exported for a second reason since C10 I34**: a renderer that paints its own
 * page must paint it in a surface this function holds, and C10 T2.27 asserts
 * that against the returned pairs rather than against a hex literal. So the
 * failure it catches is *this ground is not a text surface*, whatever the theme
 * happens to make that ground — the class, not the instance.
 */
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

/**
 * §4b — the selection wash, and exactly one slot lands on it.
 *
 * **`tone.default` alone, and the narrowness is the same decision `DIFF_SLOTS`
 * makes rather than a smaller version of it.** The prompt's text is `default`;
 * ghost text is `muted` and is drawn *after* the buffer's last cluster, so it is
 * adjacent to a selection and never inside one.
 *
 * **The measured figures, because they are what would tempt a widening.** On the
 * light theme `muted` is 2.14–2.42 : 1 against every candidate wash, under its own
 * 2.5 floor — so pairing it would reject a theme for a failure nobody can see, and
 * the fix would look like weakening the check. That is C10 §4's argument for
 * excluding `bgDeep`, in the mirror: do not validate a slot against a surface that
 * slot never lands on.
 */
const SELECTION_SLOTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  tone: Object.freeze(["default"]),
});

/**
 * §4d — the error tag, and it is the one pairing where **both** sides are new.
 *
 * `diffPairs` and `selectionPairs` each check existing palette slots against a
 * new ground. This checks a ground against **its own ink**, because the tag has
 * no slot it could borrow: `tone.error` is authored as a foreground for a dark
 * page and is the wrong brightness to sit behind text, which is I21's rule
 * arriving from the other direction.
 *
 * **A ground with no ink of its own is how a floor gets missed**, so the two
 * land together and are checked together. At the meaning floor, because a tag
 * reading *this failed* is meaning rather than decoration.
 */
export function errorTagPairs(
  tokens: ThemeTokens,
): readonly (readonly [string, string, string, string])[] {
  const ground = tokens.surfaces.errorGround;
  const ink = tokens.surfaces.errorInk;
  if (!isHex(ground) || !isHex(ink)) return Object.freeze([]);
  return Object.freeze([["errorInk", ink, "errorGround", ground] as const]);
}

/**
 * The tag's own check, and it is **not** folded into `validateDiffSurfaces`.
 *
 * That function reads its value from `tokens.palettes[palette].slots[slot]` and
 * `continue`s when it finds nothing — so a pair whose foreground lives in
 * `surfaces` would be skipped in silence, which is a check that cannot fire
 * dressed as one that passes (A03 §2). Written the first way and caught here:
 * both sides come from `surfaces`, so both are read from `surfaces`.
 */
function validateErrorTag(tokens: ThemeTokens): readonly ThemeError[] {
  const errors: ThemeError[] = [];
  for (const [inkName, ink, groundName, ground] of errorTagPairs(tokens)) {
    const measured = ratio(ink, ground);
    if (measured >= DEFAULT_FLOOR) continue;
    errors.push({
      path: `surfaces.${inkName}`,
      message:
        `"${inkName}" (${ink}) is ${measured.toFixed(2)} : 1 against ${groundName} ` +
        `(${ground}), below the ${DEFAULT_FLOOR} : 1 meaning floor — the tag says ` +
        `something failed, so it carries meaning rather than decoration, and the ` +
        `pair moves together because neither half is measured without the other`,
    });
  }
  return errors;
}

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

/**
 * §4b's pairing, and it is a **sibling** of `diffPairs` rather than two more
 * entries in it.
 *
 * Widening `diffPairs` was the first attempt and four rows refused it — one
 * asserting its size, one its slot list, and one stating outright that
 * `tone.default` must not be in the diff pairing. They were right: `diffPairs`
 * means *the diff surfaces' pairing*, and a function whose name says one thing
 * and whose contents say two is how a check stops being readable. The same
 * argument `DIFF_SLOTS` already makes about `textSurfaces`, one level down.
 */
export function selectionPairs(
  tokens: ThemeTokens,
): readonly (readonly [string, string, string, string])[] {
  const hex = tokens.surfaces.selection;
  if (!isHex(hex)) return Object.freeze([]);

  const out: (readonly [string, string, string, string])[] = [];
  for (const [palette, slots] of Object.entries(SELECTION_SLOTS)) {
    for (const slot of slots) {
      const value = tokens.palettes[palette]?.slots[slot];
      if (value === undefined || !isHex(value)) continue;
      out.push([palette, slot, "selection", hex]);
    }
  }
  return Object.freeze(out);
}

/**
 * §4g — a `decoration` palette painted as **text**, and it is the fourth named
 * pairing rather than an entry in any of the first three (I35).
 *
 * **`validatePalette` skips a decoration palette entirely**, which was an
 * exemption from the check over *every* surface and was read as an exemption
 * from every floor. `categorical` is a decoration palette and the framework
 * paints it as text: a callout at a line's end takes its series' colour (F382),
 * a treemap tile's label is the page's ground **over** a categorical fill, and
 * the outline, graph-node, flame-frame, pie-legend and terminal callout sites do
 * the same — **ten sites in four figure families and both arms**, none of them
 * art and none of them measured.
 *
 * **F652 and F653 are one pairing because `ratio` is symmetric.** A slot on the
 * page and the page's ground on that slot are the same two colours; C10 §4f.1
 * printed the same three figures twice and they were read as two findings.
 *
 * **Not vacuous, and the figures say so**: light `c4` is 4.74 against `bgElev`,
 * 5% over its floor and the tightest margin the framework ships — and the
 * palette has no luminance discipline of its own, the worst pair *within*
 * `categorical` measuring **1.00** on all three themes because it is authored
 * for hue. **The wide arm is refused by measurement, not by taste**: deleting
 * the `decoration` skip binds `spectrum` too and rejects the light theme on 7 of
 * its 9 stops, worst 2.36 — which is I31's own measurement from the colormap's
 * side, that a floor deletes the low end a ramp exists to have.
 *
 * **Derived from the slots the framework can resolve** (`REQUIRED_SLOTS`, I30),
 * so it grows with `refOf` and not with a theme's ambition — and it inherits
 * I30's limit: a ninth slot a theme declares is painted by nothing and checked
 * by nothing.
 */
export function decorationTextPairs(
  tokens: ThemeTokens,
): readonly (readonly [string, string, string, string])[] {
  const out: (readonly [string, string, string, string])[] = [];
  for (const [surfaceName, hex] of textSurfaces(tokens)) {
    if (!isHex(hex)) continue;
    for (const slot of REQUIRED_SLOTS["categorical"] ?? []) {
      const value = tokens.palettes["categorical"]?.slots[slot];
      if (value === undefined || !isHex(value)) continue;
      out.push(["categorical", slot, surfaceName, hex]);
    }
  }
  return Object.freeze(out);
}

/**
 * §4g's check, and it is **not** folded into `validateDiffSurfaces` for the
 * reason `validateErrorTag` is not: that function's message says *the background
 * moves rather than the slot*, which is true of a diff row and false here. The
 * ground is `bg`, every other floor is already measured against it, and the half
 * that can move is the slot. A shared message would give the wrong advice at
 * exactly the moment someone is reaching for the quick fix (SS23's argument, one
 * layer down).
 */
function validateDecorationText(tokens: ThemeTokens): readonly ThemeError[] {
  const errors: ThemeError[] = [];
  for (const [palette, slot, surfaceName, hex] of decorationTextPairs(tokens)) {
    const value = tokens.palettes[palette]?.slots[slot];
    if (value === undefined) continue;
    const measured = ratio(value, hex);
    // **Written as the positive form rather than as `>= DEFAULT_FLOOR` and
    // `continue`**, which is how `validateErrorTag` two functions up says the
    // same thing — and a second copy of that line makes *its* mutation anchor
    // ambiguous (F219; MA4 caught it on the first full run). An anchor is a
    // claim about uniqueness in the tree, so a function added elsewhere can
    // falsify one without touching the run file that holds it.
    if (measured < DEFAULT_FLOOR) {
      errors.push({
        path: `palettes.${palette}.${slot}`,
        message:
          `"${slot}" is ${measured.toFixed(2)} : 1 against ${surfaceName} (${hex}), ` +
          `below the ${DEFAULT_FLOOR} : 1 meaning floor — a decoration palette is ` +
          `exempt from the check over every surface and not from a floor, and this ` +
          `slot is the only thing naming its series where the framework paints it ` +
          `as text (C10 I35, §4g), so the slot moves rather than the surface`,
      });
    }
  }
  return errors;
}

function validateDiffSurfaces(tokens: ThemeTokens): readonly ThemeError[] {
  const errors: ThemeError[] = [];

  for (const [palette, slot, surface, hex] of [...diffPairs(tokens), ...selectionPairs(tokens)]) {
    const value = tokens.palettes[palette]?.slots[slot];
    if (value === undefined) continue;

    const floor = floorFor(slot);
    const measured = ratio(value, hex);
    if (measured >= floor) continue;

    errors.push({
      path: `palettes.${palette}.${slot}`,
      message:
        `"${slot}" is ${measured.toFixed(2)} : 1 against ${surface} (${hex}), ` +
        `below its floor of ${floor} : 1 — a background is a surface text ` +
        `lands on, so the background moves rather than the slot`,
    });
  }

  return errors;
}

/**
 * Every failure, not the first. A theme with four bad tones should be fixed in
 * one pass, and a validator that stops at the first turns that into four.
 */

/**
 * Every palette family the framework itself resolves against, and the slots it
 * asks for (I30, F172).
 *
 * **The theme is checked here because a document cannot be.** `resolve` returns
 * `NO_STYLE` when a palette is missing *and* when a decoration palette collapses
 * at 1-bit, so *this reference does not exist* and *this reference means nothing
 * here* are one value to every caller — a span painted in the default
 * foreground, legible, plausible, and not what the block asked for. Nothing
 * downstream can tell them apart and nothing downstream should have to: the set
 * of references **the framework can produce** is closed, so it is checkable once,
 * against the theme, at the moment the theme is resolved.
 *
 * **What it cannot reach, stated because an unrecorded limit reads as strength.**
 * An *app* writing `continuous.s99` against a family that exists is still
 * silent — `ColourRef` is `` `${string}.${string}` `` and published. What this
 * closes is the case F172 was filed for: a family that is not there at all,
 * which is what the first thing written against a new palette hits.
 *
 * **Derived rather than restated where the vocabulary has a value.** `TONES` is
 * C04's, so a tone added without a theme slot fails here rather than rendering
 * uncoloured. `syntax` and `categorical` are listed, and
 * `theme-required.test.ts` holds them to the real vocabularies by equality —
 * the arm `MARK_EXEMPTIONS` and `RAMP_VOCABULARIES` both have.
 */
export const REQUIRED_SLOTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  tone: TONES,
  categorical: Object.freeze(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]),
  syntax: Object.freeze([
    "keyword", "string", "comment", "number", "key",
    "type", "function", "operator", "punctuation",
  ]),
});

/**
 * The families and slots a theme must carry (I30).
 *
 * **At resolve time, which is where C10 already refuses a palette whose slots
 * render as one another.** A theme that cannot answer a reference the framework
 * will make is a theme that paints the wrong thing on every frame, and the
 * failure it produces without this — an uncoloured span — is indistinguishable
 * from a correct one at a glance and from a deliberate one at any distance.
 */
function validateRequiredSlots(tokens: ThemeTokens): readonly ThemeError[] {
  const errors: ThemeError[] = [];
  for (const [family, slots] of Object.entries(REQUIRED_SLOTS)) {
    const palette = tokens.palettes[family];
    if (palette === undefined) {
      errors.push({
        path: `palettes.${family}`,
        message:
          `the framework resolves \`${family}.*\` and this theme declares no such palette ` +
          `(C10 I30) — every reference to it would return no style, which renders as the ` +
          `default foreground and is indistinguishable from a block that asked for one`,
      });
      continue;
    }
    for (const slot of slots) {
      if (palette.slots[slot] !== undefined) continue;
      errors.push({
        path: `palettes.${family}.${slot}`,
        message:
          `the framework resolves \`${family}.${slot}\` and this theme has no such slot ` +
          `(C10 I30) — it would paint as the default foreground, silently`,
      });
    }
  }
  return Object.freeze(errors);
}

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

  errors.push(...validateRequiredSlots(tokens));
  errors.push(...validateDiffSurfaces(tokens));
  errors.push(...validateErrorTag(tokens));
  errors.push(...validateDecorationText(tokens));
  errors.push(...validateVariant(tokens));

  return Object.freeze(errors);
}

/**
 * §5a — `variant` against the theme's own background (I28).
 *
 * **The field was a second record of a derivable fact and nothing checked it.**
 * `luminance(surfaces.bg)` answers the same question, so a theme declaring
 * `light` over `#000000` loaded, resolved and cleared every floor: I9 compares
 * tones *to* `bg` and has no opinion about what `bg` is.
 *
 * **The threshold is the mid-point of the luminance range, and it is a coarse
 * instrument on purpose.** This is not asking whether a theme is *readable* —
 * every floor above does that — but whether it is describing itself. A theme
 * sitting near 0.5 is legitimately either, and its declaration is the answer
 * rather than the question, which is why `variant` is kept and not derived.
 * Measured against the shipped set: dark `#1a1a1a` is 0.011 and light `#fafafa`
 * is 0.961, so both clear it by an order of magnitude and the check has room to
 * be wrong in neither direction.
 */
function validateVariant(tokens: ThemeTokens): readonly ThemeError[] {
  const bg = tokens.surfaces.bg;
  if (!isHex(bg)) return [];

  const measured = luminance(bg);
  const declares = measured >= 0.5 ? "light" : "dark";
  if (declares === tokens.variant) return [];

  return [
    {
      path: "variant",
      message:
        `declares "${tokens.variant}" and its background is ${bg}, whose relative ` +
        `luminance is ${measured.toFixed(3)} — that is a ${declares} ground`,
    },
  ];
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
