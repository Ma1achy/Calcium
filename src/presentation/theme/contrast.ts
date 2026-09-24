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
   *
   * **RETIRED — and the reasoning above was right about a constraint that no
   * longer binds** (C10 I32, amended against the design registry, R-THM-001).
   * The exception existed because ONE value had to be both legible on `bgElev`
   * and dark enough to hold white, and the cube says no such value exists on a
   * dark page. The registry does not ask one value to do both: `tone.error` and
   * `surfaces.errorGround` are authored separately, so dark's tone moves from
   * `#c62828` to `#f05a5a` — **2.83 against `bgElev` becomes 4.78** — while the
   * ground keeps `#c62828` and keeps holding white at 5.62.
   *
   * **Measured over all ten shipped themes before this was removed**, because a
   * floor deleted on one theme's evidence is a floor deleted on a guess: the
   * tightest is `dark` on `bgElev` at **4.78** and every other theme has more
   * room. `FLOORS` is now empty of tone exceptions and `DEFAULT_FLOOR` governs.
   */
});

export const DEFAULT_FLOOR = 4.5;

/** A selection band against the page (R-THM-003) — the ground is its only carrier. */
export const BAND_VS_PAGE = 3;
/** A focus band against the page (R-THM-003) — relaxed, because the focus mark carries focus. */
export const FOCUS_VS_PAGE = 2;
/** The two bands against each other (R-THM-003) — they can be adjacent rows. */
export const BAND_VS_BAND = 3;

/**
 * **The ink a named surface actually takes for a colour reference.**
 *
 * A theme may compose a different value for a `(ground, ref)` pairing
 * (`ThemeTokens.composed`, R-THM-001), and every floor is a claim about the pair
 * that lands — so measuring the flat slot against a ground the theme composes
 * away is asserting something the renderer never draws.
 *
 * **Exported because three checks in this file and four test rows all need it**,
 * and the alternative is five copies of one lookup. That is the same argument
 * `keySlot` makes in `keymap.ts`: a second formatter is a second thing to drift —
 * and it was measured here, in the direction the argument predicts. The three
 * checks were patched one at a time because each was found only when the previous
 * one went green, and the tests reimplement the ratio loop rather than call
 * `validateTokens`, so they kept the birthday clause the src had already lost.
 */
export function inkOn(tokens: ThemeTokens, ref: string, surfaceName: string): string {
  // **A band answers for every ref, and it answers first** (R-THM-003). The band
  // ink is the ink for everything drawn on that surface, so it outranks both a
  // per-slot composition and the flat slot — a band whose ratio a later
  // composition could undercut would be a promise held everywhere except where
  // somebody was specific, which is the failure mode inverted rather than fixed.
  const band = tokens.bandInk?.[surfaceName];
  if (band !== undefined) return band;
  const composed = tokens.composed?.[`surface.${surfaceName}`]?.[ref];
  if (composed !== undefined) return composed;
  const [family, slot] = ref.split(".");
  return (family === undefined || slot === undefined ? undefined : tokens.palettes[family]?.slots[slot]) ?? "";
}

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
  const focus = tokens.surfaces["focusGround"];
  return [
    ["bg", tokens.surfaces.bg],
    ["bgElev", tokens.surfaces.bgElev],
    // **The focus ground is a text surface, and leaving it out was the third
    // instance of one class** (R-THM-004). A focused region washes its whole
    // extent — head and body — so every meaning ink lands here, including a code
    // body's. Measured when it was added: seven inks short across `dark` and
    // `light`, and sixteen of nineteen in each high-contrast theme, none of it
    // reported by anything, because a floor whose scope is a list is silent about
    // whatever is not on the list. `nord`'s diff grounds and `hcLight`'s `bgElev`
    // were the first two, found the same way — by widening the scope, never by a
    // failure.
    //
    // `bgDeep` is still excluded and still for its own reason: no text lands on it.
    ...(focus === undefined ? [] : [["focusGround", focus] as const]),
  ];
}

/**
 * Every ground a renderer paints text on, with the refs that land on it (C10
 * I60, R-THM-004) — the floor's whole scope, as one table.
 *
 * `textSurfaces`' three page grounds take every meaning slot; the diff grounds
 * take §4a's twelve (`DIFF_SLOTS`); `bgDeep` takes the prompt chip's `tone.meta`
 * (`R-BLK-628`). **`bgDeep` was excluded on the premise that no text lands on it**,
 * and the chip had been painting there the whole time: 6.38 and 6.51 : 1 against
 * the high-contrast themes' 7, reported by nothing, because the scope was a list.
 * A03 SS67 now requires every ground a renderer names beside text to be a ground
 * here or an entry on its exclusion list, so the next one fails the build.
 */
export function textGrounds(
  tokens: ThemeTokens,
): readonly (readonly [surface: string, ground: string, refs: readonly string[]])[] {
  const meaning = Object.entries(tokens.palettes)
    .filter(([, palette]) => palette.carries === "meaning")
    .flatMap(([name, palette]) => Object.keys(palette.slots).map((slot) => `${name}.${slot}`));
  const flatten = (slots: Readonly<Record<string, readonly string[]>>): readonly string[] =>
    Object.entries(slots).flatMap(([palette, names]) => names.map((slot) => `${palette}.${slot}`));
  const surfaces = tokens.surfaces as Readonly<Record<string, string | undefined>>;
  const rows: (readonly [string, string, readonly string[]])[] = textSurfaces(tokens).map(
    ([name, hex]) => [name, hex, meaning] as const,
  );
  for (const name of DIFF_SURFACES) {
    const hex = surfaces[name];
    if (hex !== undefined) rows.push([name, hex, flatten(DIFF_SLOTS)]);
  }
  const deep = surfaces["bgDeep"];
  if (deep !== undefined) rows.push(["bgDeep", deep, flatten(CHIP_SLOTS)]);
  return Object.freeze(rows);
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

/** The prompt chip's ink on its well (`R-BLK-628`, `R-BLK-116`) — `bgDeep`'s one text slot. */
const CHIP_SLOTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  tone: Object.freeze(["meta"]),
});

const DIFF_SLOTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  syntax: Object.freeze([
    "keyword", "string", "comment", "number", "key", "type", "function", "operator", "punctuation",
  ]),
  tone: Object.freeze(["ok", "error", "muted"]),
});

/**
 * §4b — the selection wash, and the floor it always had.
 *
 * **`tone.default` is the pairing every theme has whether it says so or not.**
 * The prompt's text is `default` and no theme composes it away, so it is the one
 * ref that cannot be derived from a theme's own declarations — a pairing read
 * only off `composed` would be empty for a theme that composes nothing, which is
 * a scope that shrinks to nothing exactly where a theme is plainest.
 *
 * Everything else on this ground is derived: see `selectionPairs` (C10 I49).
 */
const SELECTION_BASE: Readonly<Record<string, readonly string[]>> = Object.freeze({
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
/**
 * §073's chosen pair, and it is `errorTagPairs`' shape exactly (C10 I51).
 *
 * **Both sides come from `surfaces`, so both are read from `surfaces`.**
 * `validateDiffSurfaces` takes its foreground from
 * `tokens.palettes[palette].slots[slot]` and `continue`s when it finds nothing,
 * so a pair whose ink lives in `surfaces` would be skipped **in silence** — a
 * check that cannot fire dressed as one that passes (A03 §2). The error tag was
 * written that way once and caught; this one is written from the correction.
 *
 * At the meaning floor, because a chosen affordance reads *this is the one*.
 */
export function pickPairs(
  tokens: ThemeTokens,
): readonly (readonly [string, string, string, string])[] {
  const ground = tokens.surfaces.pick;
  const ink = tokens.surfaces.pickInk;
  // **Absent is a rung, not a defect** — a theme with no chosen ground sends the
  // button to its brackets (C09 I102), which is the carrier that survives one
  // bit anyway. Both halves are asked, because half a pair is the state this
  // invariant exists to refuse.
  if (ground === undefined || ink === undefined) return Object.freeze([]);
  if (!isHex(ground) || !isHex(ink)) return Object.freeze([]);
  return Object.freeze([["pickInk", ink, "pick", ground] as const]);
}

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
function validateSurfacePair(
  pairs: readonly (readonly [string, string, string, string])[],
  why: string,
): readonly ThemeError[] {
  const errors: ThemeError[] = [];
  for (const [inkName, ink, groundName, ground] of pairs) {
    const measured = ratio(ink, ground);
    if (measured >= DEFAULT_FLOOR) continue;
    errors.push({
      path: `surfaces.${inkName}`,
      message:
        `"${inkName}" (${ink}) is ${measured.toFixed(2)} : 1 against ${groundName} ` +
        `(${ground}), below the ${DEFAULT_FLOOR} : 1 meaning floor — ${why}, and the ` +
        `pair moves together because neither half is measured without the other`,
    });
  }
  return errors;
}

/**
 * **Two pairs, one walk** (C10 I51). `pick`/`pickInk` arrived with exactly
 * `errorGround`/`errorInk`'s shape — a ground with its own ink, neither half
 * borrowable — so a second copy of this loop would be a second place for the
 * floor to drift. The message's middle clause is what differs and it is the
 * argument for the floor, which is the part worth keeping per pair.
 */
function validateSurfacePairs(tokens: ThemeTokens): readonly ThemeError[] {
  return [
    ...validateSurfacePair(
      errorTagPairs(tokens),
      "the tag says something failed, so it carries meaning rather than decoration",
    ),
    ...validateSurfacePair(
      pickPairs(tokens),
      "a chosen affordance reads *this is the one*, which is meaning rather than decoration",
    ),
  ];
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

  // **The pairing is derived from the theme's own compositions** (C10 I49,
  // §4b.1). A composed `(ground, ref)` value is the design saying *this ref
  // lands on this ground* — nobody repaints a slot for a surface it never
  // meets — so the scope rule is unchanged and its premise is read off the
  // design instead of off this tree's prompt.
  //
  // **It had to be derived rather than widened by hand, and the reason is what
  // this closes.** The list was `tone.default` alone on an argument that was
  // right about the prompt and not about the transcript; meanwhile the
  // generator's `^`-anchored selector match dropped seven declared values,
  // every one of them on this ground and six of them `muted`. A list nobody
  // edits cannot notice a value nobody delivered. Derived, the two move
  // together: a composition that arrives enters the check on the same commit,
  // and one that stops being declared leaves it.
  const refs = new Set<string>();
  for (const [palette, slots] of Object.entries(SELECTION_BASE)) {
    for (const slot of slots) refs.add(`${palette}.${slot}`);
  }
  for (const ref of Object.keys(tokens.composed?.["surface.selection"] ?? {})) refs.add(ref);

  const out: (readonly [string, string, string, string])[] = [];
  for (const ref of [...refs].sort()) {
    const [palette, slot] = ref.split(".");
    if (palette === undefined || slot === undefined) continue;
    // **The flat slot must exist, and a composition for a slot the palette does
    // not carry is not a pairing.** `inkOn` would answer with the composed value
    // and the pair would read as measured, on a ref no palette can resolve.
    const value = tokens.palettes[palette]?.slots[slot];
    if (value === undefined || !isHex(value)) continue;
    out.push([palette, slot, "selection", hex]);
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
    // The same composition `validatePalette` honours, for the same reason: the
    // ink this ground takes is the one that lands on it.
    //
    // **Through `inkOn` rather than reading `composed` directly**, which is the
    // fourth time that lookup has been written out and the second time a copy of
    // it has been left behind by a change: a band (R-THM-003) answers for every
    // ref on its surface and a direct read of `composed` cannot see one, so this
    // check would have measured a flat categorical slot against a band the
    // renderer never paints it on.
    const ink = inkOn(tokens, `${palette}.${slot}`, surfaceName) || value;
    const measured = ratio(ink, hex);
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

    // **A floor lives wherever a pair is formed**, so a theme feature that changes
    // which ink meets a ground has to reach every one of them or it silently holds
    // a slot to a pairing that is never drawn. There are three such sites — this,
    // `validatePalette` and `validateDecorationText` — and composition was missed
    // at two of them when it landed, then bands were missed at all three, because
    // each site had its own copy of the lookup.
    //
    // **So none of them has one now.** `inkOn` is the single answer to *what ink
    // does this ground take*, and a fourth site added tomorrow gets every
    // mechanism by calling it rather than by being remembered.
    const ink = inkOn(tokens, `${palette}.${slot}`, surface) || value;

    const floor = floorFor(slot);
    const measured = ratio(ink, hex);
    if (measured >= floor) continue;

    // **The remedy changed with composition and the sentence had to.** It read
    // *the background moves rather than the slot*, which was the only answer when
    // an ink was one value everywhere; a theme may now move the ink on this ground
    // alone, and that is the cheaper of the two.
    errors.push({
      path: `palettes.${palette}.${slot}`,
      message:
        `"${slot}" is ${measured.toFixed(2)} : 1 against ${surface} (${hex})` +
        `${ink === value ? "" : ` (composed as ${ink})`}, below its floor of ` +
        `${floor} : 1 — a background is a surface text lands on, so the background ` +
        `moves, or this theme composes a different ink for this ground`,
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
    errors.push(...validatePalette(paletteName, palette, bgs, tokens.surfaces.bg, tokens));
  }

  errors.push(...validateRequiredSlots(tokens));
  errors.push(...validateDiffSurfaces(tokens));
  errors.push(...validateSurfacePairs(tokens));
  errors.push(...validateDecorationText(tokens));
  errors.push(...validateBands(tokens));
  errors.push(...validateHighContrast(tokens));
  errors.push(...validateVariant(tokens));

  return Object.freeze(errors);
}

/**
 * **The four contrasts a band declares, checked as stated** (R-THM-003).
 *
 * Not one rule with four consequences but four separate claims, because they bind
 * for four different reasons and a reader meeting a failure needs the reason, not
 * the number. The rule text carries them in the same order and the same words.
 *
 * **Why they are not all the same figure.** The ink keeps the theme's declared
 * ratio because that is the promise. The selection band keeps 3 : 1 against the
 * page because the ground is selection's *only* carrier — R-SEL-006 gives
 * selection the ground and focus the mark, so a selection band that does not read
 * is a fact with nothing carrying it. The focus band keeps only 2 : 1 against the
 * page because the focus mark already carries focus at the declared ratio and the
 * band need only read as an extent. And the two bands keep 3 : 1 from each other
 * because they can be adjacent rows, which is the pair a reader actually compares.
 *
 * **It follows that the focus band is the one nearer the page** and selection the
 * one further from it — a consequence of the constraints rather than a choice, and
 * the reason `hcDark`'s selection is the bright band while `hcLight`'s is the dark
 * one. Measured before the values were written: the previous grounds sat at
 * 1.01 : 1 from each other in `hcLight`, separated by hue alone.
 */
export function validateBands(tokens: ThemeTokens): readonly ThemeError[] {
  const bands = tokens.bandInk;
  if (bands === undefined) return Object.freeze([]);
  const bg = tokens.surfaces.bg;
  if (!isHex(bg)) return Object.freeze([]);
  const errors: ThemeError[] = [];
  const promised = tokens.floor ?? DEFAULT_FLOOR;

  // **The band's name IS the surface's name** (I45). This read *`focusGround` if
  // the name is `focusGround`, otherwise `selection`* — correct for the two
  // entries that exist and wrong for a third the moment there is one, silently:
  // its ink would have been measured against the selection wash, and the gate
  // would have passed or failed for a ground the band never lands on. A lookup
  // written for a two-member population and keyed by exclusion answers wrongly
  // for the third member and reports nothing.
  //
  // `surfaces` is a closed record and `Object.entries` hands back `string`, so
  // the lookup is the one place the two cannot be joined by the type. `bandInk`
  // is keyed by `SurfaceName`, which is what makes the cast safe, and T2.55 is
  // what holds it: a third band measured against its own ground in both
  // directions — a bad one reported, a good one silent.
  const grounds = tokens.surfaces as Readonly<Record<string, string | undefined>>;
  const groundOf = (name: string): string | undefined => {
    const v = grounds[name];
    return v !== undefined && isHex(v) ? v : undefined;
  };
  const say = (path: string, got: number, need: number, what: string): void => {
    errors.push({
      path,
      message:
        `${got.toFixed(2)} : 1, below the ${need} : 1 a band declares — ${what}`,
    });
  };

  for (const [name, ink] of Object.entries(bands)) {
    const ground = groundOf(name);
    if (ground === undefined || !isHex(ink)) continue;
    const measured = ratio(ink, ground);
    if (measured < promised) {
      say(`bandInk.${name}`, measured, promised,
        "a band's ink is the ink for everything on it, so this is the theme's promise for the whole band");
    }
  }

  const focus = bands["focusGround"] === undefined ? undefined : groundOf("focusGround");
  const selection = bands["selection"] === undefined ? undefined : groundOf("selection");

  if (selection !== undefined) {
    const measured = ratio(selection, bg);
    if (measured < BAND_VS_PAGE) {
      say("surfaces.selection", measured, BAND_VS_PAGE,
        "the ground is selection's only carrier, so a selection band that does not read is a fact with nothing carrying it");
    }
  }
  if (focus !== undefined) {
    const measured = ratio(focus, bg);
    if (measured < FOCUS_VS_PAGE) {
      say("surfaces.focusGround", measured, FOCUS_VS_PAGE,
        "the focus mark already carries focus, so the band need only read as an extent — but it must read as one");
    }
  }
  if (focus !== undefined && selection !== undefined) {
    const measured = ratio(focus, selection);
    if (measured < BAND_VS_BAND) {
      say("surfaces.focusGround", measured, BAND_VS_BAND,
        "the two bands can be adjacent rows, and telling them apart by hue alone is the failure a high-contrast theme exists to prevent");
    }
  }
  return Object.freeze(errors);
}

/**
 * **R-THM-002 — a theme that promises more than the floor is held to what it
 * promised.**
 *
 * The high-contrast themes are named for a ratio and shipped without one. 7 : 1
 * lived in a roadmap entry and in a single contract row, which is a claim about
 * the tokens as they stood rather than a constraint on the ones that follow —
 * and it went stale the way that shape always does: porting the themes to the
 * registry left `hcLight` at 6.55 : 1 on `bgElev` for eight refs, below a
 * promise nothing could read.
 *
 * **A separate function rather than a term inside `floorFor`, because it is a
 * different kind of claim.** `FLOORS` is per slot and says what a *slot* needs;
 * this is per theme and says what a *theme* undertakes, over every pair in
 * `textGrounds` — every ground it paints text on and the inks that land there
 * (C10 I60). Folding one into the other would
 * make `floorFor(slot)` answer differently depending on a theme it is not given,
 * and four call sites would have to start passing one.
 *
 * **The greater of the two, so a declared floor can only raise.** A theme
 * declaring `2` would otherwise weaken `muted`'s own 2.5 — a promise that
 * promises less is not a promise, and the shape A03 §2 calls vacuous.
 *
 * **Composition is honoured**, as everywhere else: a floor is a claim about the
 * pair that lands, and `hcLight` keeps this promise precisely *by* composing
 * four darker inks for its elevated ground rather than moving the ground.
 */
export function validateHighContrast(tokens: ThemeTokens): readonly ThemeError[] {
  const promised = tokens.floor;
  if (promised === undefined) return Object.freeze([]);
  if (!isHex(tokens.surfaces.bg) || !isHex(tokens.surfaces.bgElev)) return Object.freeze([]);

  const errors: ThemeError[] = [];
  // **Over the whole table** (C10 I60): the diff grounds and the chip's well are
  // grounds this theme paints text on, and a promise kept only on the page is
  // the promise the scope-as-a-list broke three times.
  for (const [surface, ground, refs] of textGrounds(tokens)) {
    if (!isHex(ground)) continue;
    for (const ref of refs) {
      const [paletteName, slot] = ref.split(".") as [string, string];
      const need = Math.max(promised, floorFor(slot));
      const ink = inkOn(tokens, ref, surface);
      if (!isHex(ink)) continue;
      const measured = ratio(ink, ground);
      if (measured < need) {
        errors.push({
          path: `palettes.${paletteName}.${slot}`,
          message: `"${slot}" is ${measured.toFixed(2)} : 1 against ${surface} (${ground}), below the ${need} : 1 this theme declares — a theme named for a ratio keeps it on every surface it paints, or it composes an ink for that ground`,
        });
      }
    }
  }
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
  /**
   * **The whole token set, where this took `composed` alone.** A floor is a claim
   * about the ink a ground actually takes, and that answer now has more than one
   * source — a band (R-THM-003) as well as a composition. Narrowing the parameter
   * to the one mechanism that existed when it was written is what made bands
   * invisible here; `inkOn` is the answer, and it needs the set.
   */
  tokens: ThemeTokens,
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
      // **Measure the ink this ground actually takes, not the flat slot.** Where
      // the theme composes a different value for `(ground, ref)` that value is
      // what lands, and holding the flat one to a floor it is never drawn at is
      // the containment-is-not-correctness shape: an assertion about a pairing
      // the renderer does not produce. `nord.info` is the case — 4.64 : 1 on
      // `bg`, 3.74 on `bgElev`, and `#95b5d5` on `bgElev`, which is 4.72.
      const ink = inkOn(tokens, `${paletteName}.${slot}`, surfaceName) || value;
      const measured = ratio(ink, surface);
      if (measured < floor) {
        const via = ink === value ? "" : ` (composed as ${ink})`;
        errors.push({
          path,
          message:
            `"${slot}" is ${measured.toFixed(2)} : 1 against ${surfaceName} (${surface})${via}, ` +
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
