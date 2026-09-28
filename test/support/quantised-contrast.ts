// C10 I68 — the floor measured below 24-bit, ink and ground as the resolver
// paints them. The instrument T2.74 and T2.75 read; the lists they hold it to
// are `quantised-shortfalls.ts`.
import { ANSI16_HEX } from "../../src/presentation/theme/colormap.js";
import { DEFAULT_FLOOR, decorationTextPairs, floorFor, ratio, textGrounds } from "../../src/presentation/theme/contrast.js";
import { cubeHexOf } from "../../src/presentation/theme/quantise.js";
import { resolve, resolveBackground, resolveHueBand } from "../../src/presentation/theme/resolve.js";
import type { ColourRef, ColourValue, ResolvedTheme } from "../../src/presentation/theme/types.js";

/**
 * **The floor measured at the rungs below 24-bit, ink and ground both as the
 * resolver paints them** (C10 I68). C10 §4c.3 named the question — *a complete
 * 8-bit floor is quantised-against-quantised* — and left it unasked, so C10 I26's
 * *provable at 8-bit* was provable and never proved.
 *
 * **The scope is the 24-bit gate's, cell for cell**: every `textGrounds` row
 * held to `max(floorFor(slot), floor)` as `validateHighContrast` holds it, every
 * `decorationTextPairs` cell to `DEFAULT_FLOOR` as `validateDecorationText`
 * does, and at 8-bit each hue band's ink on its ground to `DEFAULT_FLOOR` (C10 I54).
 * A cell the gate does not check at 24-bit is not checked here either, so a
 * shortfall is always the rung's doing and never a wider scope's.
 *
 * **Both halves come from the resolver**, because that is what reaches the
 * screen: the ink through `resolve(ref, theme, caps, ground)`, composed on its
 * ground (C10 I48) and a band's one ink where there is one (C10 I61), and the ground
 * through `resolveBackground`. At 8-bit an index maps back through the cube the
 * standard fixes; at 4-bit through `ANSI16_HEX`, the reference palette C10 I61
 * measures bands against, since a terminal's low sixteen are the user's.
 *
 * **A ground the resolver does not paint at 4-bit is the page**, because that
 * is what shows through: `focusGround` has no entry in any curated map, so on
 * every theme without a 4-bit band the ink lands on the page's index. An ink or
 * a page with no colour at all is the terminal's own pair and is not a cell.
 *
 * **Here and not in `src/`, because nothing in `src/` may call it yet.** It is
 * not part of `validateTokens`: at 4-bit for `bandFourBitShortfalls`' reason —
 * the ratios are a claim about a reference palette — and at 8-bit because the
 * list is not empty, and a load gate over it would refuse every shipped theme.
 * C10 I68 holds both lists by equality instead (T2.74, T2.75). The day the
 * 8-bit list is empty it can become a load gate, and then it moves to
 * `resolve.ts` beside `validatePaintedFloors` with a caller.
 */
export function quantisedShortfalls(
  theme: ResolvedTheme,
  depth: 8 | 4,
): readonly Readonly<{ path: string; measured: number; need: number }>[] {
  const tokens = theme.tokens;
  const caps = Object.freeze({ colourDepth: depth });
  const hexOf = (colour: ColourValue | undefined): string | null => {
    if (colour === undefined) return null;
    if (depth === 4) return colour.kind === "ansi16" ? (ANSI16_HEX[colour.index] ?? null) : null;
    return colour.kind === "ansi256" ? cubeHexOf(colour.index) : null;
  };
  const page = hexOf(resolveBackground("surface.bg", theme, caps).background);
  const out: { path: string; measured: number; need: number }[] = [];
  const hold = (ground: string, ref: ColourRef, need: number): void => {
    const ink = hexOf(resolve(ref, theme, caps, ground).colour);
    const under = hexOf(resolveBackground(`surface.${ground}`, theme, caps).background) ?? (depth === 4 ? page : null);
    if (ink === null || under === null) return;
    const measured = ratio(ink, under);
    if (measured < need) out.push({ path: `${ground}.${ref}`, measured: Math.round(measured * 100) / 100, need });
  };

  for (const [ground, , refs] of textGrounds(tokens)) {
    for (const ref of refs) {
      hold(ground, ref as ColourRef, Math.max(floorFor(ref.slice(ref.indexOf(".") + 1)), tokens.floor ?? 0));
    }
  }
  for (const [palette, slot, ground] of decorationTextPairs(tokens)) hold(ground, `${palette}.${slot}`, DEFAULT_FLOOR);

  // A hue band has no 4-bit form (C10 I55, PARKED 21), so it is an 8-bit cell only.
  if (depth === 8) {
    for (const name of Object.keys(tokens.hues ?? {})) {
      const band = resolveHueBand(theme, name, caps);
      const ink = hexOf(band?.ink.colour);
      const ground = hexOf(band?.ground.background);
      if (ink === null || ground === null) continue;
      const measured = ratio(ink, ground);
      if (measured < DEFAULT_FLOOR) out.push({ path: `hueBand.${name}`, measured: Math.round(measured * 100) / 100, need: DEFAULT_FLOOR });
    }
  }
  return Object.freeze(out);
}
