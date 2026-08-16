/**
 * C10 §5, §6 — loading, switching, overriding.
 *
 * There is no sealed state. Themes switch at runtime by design, which is the
 * difference between this and C05, C07 and C09.
 *
 * **C10 triggers no repaint** (I7). It exposes the change and L4 calls
 * `scheduler.invalidate()` afterwards — the same orchestration as
 * `lifecycle.resume()` (A02 §4), keeping L1 unaware of L0-terminal.
 */

import type { Result } from "../../data/viewmodel/index.js";
import { isHex, validateTokens } from "./contrast.js";
import { clearResolutionCache, validatePaintedFloors } from "./resolve.js";
import type { ResolvedTheme, ThemeError, ThemeSet, ThemeTokens } from "./types.js";

export type Overrides = Readonly<{
  palettes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  surfaces?: Readonly<Record<string, string>>;
}>;

export interface ThemeStore {
  readonly current: ResolvedTheme;
  /** Every theme this set holds, in declaration order — `/theme`'s values (I27). */
  readonly names: readonly string[];
  /**
   * Switch by **name** (I27). No-op if it is already active; the cache is kept
   * (T3.6).
   *
   * **Throws on a name the set does not hold**, rather than no-opping. A caller
   * reaches this having validated against `names` — `/theme`'s `enum` is those
   * names — so an unknown one is a programmer error, and the silent version
   * would report a theme change that did not happen. Nothing is mutated before
   * the check, so the throw leaves no half-applied state.
   */
  setTheme(name: string): void;
  /** Empty means applied. Non-empty means nothing changed at all (I4). */
  applyOverrides(overrides: Overrides): readonly ThemeError[];
}

function identity(tokens: ThemeTokens, serial: number): string {
  return serial === 0 ? `${tokens.name}/${tokens.variant}` : `${tokens.name}/${tokens.variant}#${serial}`;
}

function resolved(tokens: ThemeTokens, serial: number): ResolvedTheme {
  return Object.freeze({ name: identity(tokens, serial), variant: tokens.variant, tokens });
}

/**
 * **Both variants are validated at load**, not the one being opened. A session
 * that starts dark and fails the moment someone types `/theme light` has
 * validated nothing useful — the point of checking at load rather than at render
 * is that the failure arrives before anyone is depending on it.
 */
export function loadTheme(
  set: ThemeSet,
  /**
   * Which theme opens. **Defaults to the set's first key rather than to
   * `"dark"`** (I27): a literal here would be a name this component invented,
   * and an app whose set does not carry it would fail on a value it never wrote.
   */
  opening?: string,
): Result<ThemeStore, readonly ThemeError[]> {
  // **Both validators, every theme in the set** (I26, I27). `validatePaintedFloors`
  // is a no-op for a theme that inherits, so it costs nothing on the arm every
  // session runs and is the whole of the check on the arm that paints. Driven
  // off the set's own keys, which is what makes a theme added later join the
  // checks rather than pass them by.
  const names = Object.keys(set);
  const errors = names.flatMap((name) => [
    ...validateTokens(set[name]!).map((e) => ({ ...e, path: `${name}.${e.path}` })),
    ...validatePaintedFloors(set[name]!).map((e) => ({ ...e, path: `${name}.${e.path}` })),
  ]);

  // **The set itself, not a theme in it.** An empty set has no theme to open and
  // no error a token check could produce, so it is refused here — the one
  // failure `validateTokens` cannot see, because it is about the collection.
  if (names.length === 0) {
    errors.push({ path: "", message: "a theme set declares at least one theme" });
  }

  const first = names[0];
  const opened = opening ?? first;
  if (first !== undefined && opened !== undefined && !(opened in set)) {
    errors.push({
      path: opened,
      message: `no theme named "${opened}"; this set declares ${names.join(", ")}`,
    });
  }

  if (errors.length > 0) return Object.freeze({ ok: false as const, error: Object.freeze(errors) });

  let serial = 0;
  let tokens: ThemeSet = set;
  /** Which key is active — the switch's subject, and overrides' (I27). */
  let activeName = opened!;
  let current = resolved(set[opened!]!, serial);

  const store: ThemeStore = {
    get current(): ResolvedTheme {
      return current;
    },

    get names(): readonly string[] {
      return Object.freeze([...Object.keys(tokens)]);
    },

    setTheme(next: string): void {
      const wanted = tokens[next];
      if (wanted === undefined) {
        throw new Error(`no theme named "${next}"; this set declares ${Object.keys(tokens).join(", ")}`);
      }
      // **By name and not by variant.** Two dark themes are a legitimate pair,
      // so comparing polarity would refuse a real switch — and `identity()`
      // already distinguishes them, since the name is its first component.
      if (next === activeName) return;
      activeName = next;
      // One assignment (I10). Swapping tokens field by field would let a render
      // that started before the switch finish on a theme half of which is the
      // other one — a frame nobody could reproduce from a bug report.
      current = resolved(wanted, serial);
      clearResolutionCache();
    },

    applyOverrides(overrides: Overrides): readonly ThemeError[] {
      // **Overrides land on the active theme only**, and *per variant* was the
      // two-theme spelling of that (§5a.2 row 7). A value chosen against a dark
      // ground is not a value for a light one — applying it to both would reject
      // a legitimate dark override for failing a light floor it was never meant
      // to meet, and the user would have no way to say what they meant.
      const active = activeName;
      const patched = merge(tokens[active]!, overrides);
      const merged: ThemeSet = { ...tokens, [active]: patched };

      // Validated as a set, not per field (T3.3): an override that changes `bg`
      // can put previously-valid tones under the floor, and applying the good
      // half of it would leave a theme nobody authored.
      const failures = [
        ...validateTokens(patched).map((e) => ({ ...e, path: `${active}.${e.path}` })),
        ...validatePaintedFloors(patched).map((e) => ({ ...e, path: `${active}.${e.path}` })),
        ...malformed(overrides),
      ];

      // I4 — the current theme is left exactly as it was, reference and all.
      // Silently accepting an override that makes `error` invisible produces a
      // session where failures cannot be seen: the single worst outcome a theme
      // system can have.
      if (failures.length > 0) return Object.freeze(failures);

      serial += 1;
      tokens = merged;
      current = resolved(patched, serial);
      clearResolutionCache();
      return Object.freeze([]);
    },
  };

  return Object.freeze({ ok: true as const, value: store });
}

/**
 * An override naming a slot the palette does not have is ignored rather than
 * rejected (T3.1). A theme file written for a newer palette should not stop a
 * session opening — the same leniency C05 applies to unknown manifest fields,
 * and for the same reason.
 */
function merge(tokens: ThemeTokens, overrides: Overrides): ThemeTokens {
  const palettes: Record<string, ThemeTokens["palettes"][string]> = {};

  for (const [name, palette] of Object.entries(tokens.palettes)) {
    const patch = overrides.palettes?.[name];
    if (patch === undefined) {
      palettes[name] = palette;
      continue;
    }

    const slots: Record<string, string> = { ...palette.slots };
    for (const [slot, value] of Object.entries(patch)) {
      if (slot in slots) slots[slot] = value;
    }
    palettes[name] = Object.freeze({ ...palette, slots: Object.freeze(slots) });
  }

  const surfaces: Record<string, string> = { ...tokens.surfaces };
  for (const [name, value] of Object.entries(overrides.surfaces ?? {})) {
    if (name in surfaces) surfaces[name] = value;
  }

  return Object.freeze({
    ...tokens,
    palettes: Object.freeze(palettes),
    surfaces: Object.freeze(surfaces) as ThemeTokens["surfaces"],
  });
}

/**
 * A malformed value in an override is an error even when the slot it names is
 * unknown. Ignoring it would mean `{ tone: { okay: "red" } }` — a typo and a
 * colour name — passing silently twice over.
 */
function malformed(overrides: Overrides): readonly ThemeError[] {
  const errors: ThemeError[] = [];

  for (const [palette, slots] of Object.entries(overrides.palettes ?? {})) {
    for (const [slot, value] of Object.entries(slots)) {
      if (!isHex(value)) {
        errors.push({
          path: `override.${palette}.${slot}`,
          message: `"${value}" is not a 24-bit hex colour; write it as #rrggbb`,
        });
      }
    }
  }

  for (const [name, value] of Object.entries(overrides.surfaces ?? {})) {
    if (!isHex(value)) {
      errors.push({
        path: `override.surfaces.${name}`,
        message: `"${value}" is not a 24-bit hex colour; write it as #rrggbb`,
      });
    }
  }

  return errors;
}
