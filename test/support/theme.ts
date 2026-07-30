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

/** The shipped pair, loaded. Throws rather than handing a test a null. */
export function store(variant: "dark" | "light" = "dark"): ThemeStore {
  const loaded = loadTheme(defaultTheme, variant);
  if (!loaded.ok) {
    throw new Error(`the shipped theme must load: ${loaded.error.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
  }
  return loaded.value;
}

/** A deep, mutable copy of one variant, for breaking one field at a time. */
export function mutable(variant: "dark" | "light" = "dark"): Record<string, unknown> {
  return structuredClone({
    ...defaultTheme[variant],
    fourBit: { ...defaultTheme[variant].fourBit },
  }) as unknown as Record<string, unknown>;
}

/** A theme set with one tone replaced, for the rejection paths. */
export function withTone(slot: string, value: string, variant: "dark" | "light" = "dark"): ThemeSet {
  const base = defaultTheme[variant];
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

  return variant === "dark" ? { dark: broken, light: defaultTheme.light } : { dark: defaultTheme.dark, light: broken };
}
