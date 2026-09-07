// Fixtures for C10's suite. The shipped themes are the subject of most of it —
// a theme that cannot ship failing its own rule is the point of T2.4 — so these
// helpers mostly exist to build *broken* ones.
import { defaultTheme, loadTheme, resolve, type ColourRef, type ResolvedTheme, type ThemeSet, type ThemeStore, type ThemeTokens } from "../../src/presentation/theme/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

export const DEPTHS = [1, 4, 8, 24] as const;

export const TONES = [
  "default",
  "dim",
  "muted",
  "ok",
  "warn",
  "error",
  "info",
  "accent",
  "meta",
  "identifier",
] as const;

export const SYNTAX_SLOTS = [
  "keyword",
  "string",
  "comment",
  "number",
  "key",
  "type",
  "function",
  "operator",
  "punctuation",
] as const;

export const SURFACES = [
  "bg",
  "bgElev",
  "bgDeep",
  "border",
  "borderStrong",
  // §4a. Written out rather than derived from `Surfaces`, for T2.18's reason: a
  // list taken from the type it checks agrees with itself on any addition.
  "diffAdd",
  "diffRemove",
] as const;

/** Only the depth is read; the rest is here so a call site reads honestly. */
export function caps(colourDepth: TerminalCapabilities["colourDepth"]): Readonly<Pick<TerminalCapabilities, "colourDepth">> {
  return { colourDepth };
}

/**
 * A store opened on a **named** theme — any name the set holds (C10 I27).
 *
 * Throws rather than handing a test a null.
 */
export function store(name: string = "dark"): ThemeStore {
  const loaded = loadTheme(defaultTheme, name);
  if (!loaded.ok) {
    throw new Error(`the shipped theme must load: ${loaded.error.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
  }
  return loaded.value;
}

/** A deep, mutable copy of one shipped theme, for breaking one field at a time. */
export function mutable(name: string = "dark"): Record<string, unknown> {
  const tokens = defaultTheme[name];
  if (tokens === undefined) throw new Error(`no shipped theme named "${name}"`);
  return structuredClone({
    ...tokens,
    fourBit: { ...tokens.fourBit },
  }) as unknown as Record<string, unknown>;
}

/** A theme set with one tone replaced, for the rejection paths. */
export function withTone(slot: string, value: string, name: string = "dark"): ThemeSet {
  const base = defaultTheme[name];
  if (base === undefined) throw new Error(`no shipped theme named "${name}"`);
  const broken = {
    ...base,
    palettes: {
      ...base.palettes,
      tone: {
        ...base.palettes["tone"]!,
        slots: { ...base.palettes["tone"]!.slots, [slot]: value },
      },
    },
  } as ThemeTokens;

  // **The whole set with one member replaced**, keyed by name — the two-theme
  // spelling of this was a ternary over `dark`/`light` (C10 I27).
  return Object.freeze({ ...defaultTheme, [name]: broken });
}

/**
 * A slot's channels at 24-bit, **taken from C10 rather than written down**.
 *
 * G5b matched `#6ea8fe` by hand — the literal the SVG arm's own `SERIES_INK`
 * used to hold — and the row went red the day the arm started resolving
 * `categorical.c1` instead. That is the correct failure and the reason this is
 * a helper: **a test that names a colour is a third source of truth**, and it
 * drifts exactly the way the second one did.
 */
export function rgbOf(ref: ColourRef, theme: ResolvedTheme): readonly [number, number, number] {
  const { colour } = resolve(ref, theme, { colourDepth: 24 });
  if (colour === undefined || colour.kind !== "rgb") throw new Error(`no rgb for ${ref}`);
  const h = colour.hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ] as const;
}

/** Every hex the theme's tokens hold — surfaces and every palette slot. */
export function themeHexes(theme: ResolvedTheme): ReadonlySet<string> {
  const out = new Set<string>();
  for (const hex of Object.values(theme.tokens.surfaces as Readonly<Record<string, string>>)) out.add(hex.toLowerCase());
  for (const palette of Object.values(theme.tokens.palettes)) {
    for (const hex of Object.values(palette.slots)) out.add(hex.toLowerCase());
  }
  return out;
}
