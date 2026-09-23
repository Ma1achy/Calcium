// §079's table, as a corpus — every tone and every surface, at every theme.
//
// **The colour axis the golden corpus has never had.** Every other lines
// corpus strips SGR and says why: these frames are about *what is drawn*, and a
// snapshot carrying shape and colour together changes when either does, so
// neither is protected. That argument is right about a frame of blocks and it
// is what left §079 — *tones and surfaces* — with nothing to compare against:
// its whole subject is the values, and a frame that strips them draws ten rows
// of the same swatch.
//
// So this corpus records the **resolved value** rather than a painted row. It
// is a picture of the table §079 draws, in the one form that can be read back:
// the slot, what `resolve` answers for it, and at one bit the weight that
// answers instead — which is §074's claim, that the tone still reads when the
// colour is gone.
//
// **The slot lists are derived, not written.** `TONES` is the view model's own
// record, and the surfaces are the union of every theme's own keys — so a slot
// the registry adds arrives in the frame on the next `make themes` rather than
// waiting for someone to remember this file. That is the difference between a
// corpus and a list, and `corpus.test.ts` is the precedent.
import { TONES } from "../../src/data/viewmodel/index.js";
import { REGISTRY_THEMES } from "../../src/presentation/theme/tokens.generated.js";
import type { ResolvedTheme, Style, ThemeTokens } from "../../src/presentation/theme/index.js";

/** The ten, in the registry's own order. */
export const THEME_NAMES: readonly string[] = Object.freeze(Object.keys(REGISTRY_THEMES));

/**
 * Every surface slot any theme declares, in first-seen order.
 *
 * **The union rather than the `Surfaces` type**, and the gap between the two is
 * a measurement this frame makes rather than an accident of how it is written.
 * `Surfaces` declares eleven members; the projection assigns twenty-four, and
 * `resolve`'s surface arm casts to `Record<string, string>` and indexes by
 * slot — so `meterFill`, `link`, `chosen`, `pick`, `skipGround` and the four
 * posture grounds all resolve at run time and none of them can be named through
 * the published type. Deriving the list from the data is what puts them in the
 * frame; taking it from the type would have drawn the eleven and said nothing.
 */
export const SURFACE_SLOTS: readonly string[] = Object.freeze(
  [...new Set(
    THEME_NAMES.flatMap((n) =>
      Object.keys((REGISTRY_THEMES[n] as ThemeTokens).surfaces as Readonly<Record<string, string>>),
    ),
  )],
);

/** A theme, resolved — the shape `resolve` takes, built from the projection. */
export function themeFor(name: string): ResolvedTheme {
  const tokens = REGISTRY_THEMES[name] as ThemeTokens;
  return Object.freeze({ name, variant: tokens.variant, tokens });
}

/**
 * One resolved style, as a cell.
 *
 * **The weight is printed even where it is absent**, because §074's claim is
 * about the whole ladder: *emphasised → bold, normal → plain, deemphasised →
 * faint*. A column that showed only the bold rows would be satisfied by a
 * resolver that returned bold for everything.
 */
export function cellOf(style: Style): string {
  // **Both channels, and the first draft read one.** `resolveBackground` sets
  // `background` and never `colour`, so a reader asking for `colour` answered
  // `—` for every surface at every rung — a whole column of *nothing resolves*
  // over values the projection holds. The frame is what said so: twenty-four
  // empty cells in a row is not a theme, and no assertion here would have
  // noticed, because a resolver that is total is total about `NO_STYLE` too.
  const value = style.colour ?? style.background;
  const colour =
    value === undefined
      ? "—"
      : value.kind === "rgb"
        ? value.hex
        : `${value.kind === "ansi256" ? "x" : "a"}${String(value.index)}`;
  const weight = style.bold === true ? "bold" : style.dim === true ? "faint" : "plain";
  return `${colour.padEnd(8, " ")} ${weight}`;
}

export const TONE_SLOTS: readonly string[] = TONES;
