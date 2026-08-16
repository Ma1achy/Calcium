// Fixtures for C10's suite. The shipped themes are the subject of most of it —
// a theme that cannot ship failing its own rule is the point of T2.4 — so these
// helpers mostly exist to build *broken* ones.
import { defaultTheme, loadTheme, type ThemeSet, type ThemeStore, type ThemeTokens } from "../../src/presentation/theme/index.js";
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
