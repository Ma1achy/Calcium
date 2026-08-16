// A registry, a theme and a capability record — what every C09 test needs
// before it can assert anything about a row.
//
// Assembled once here rather than per file so that "the same block in both
// themes" and "the same block in both unicode modes" are one argument apart
// (T4.2, T2.2).
import {
  createBlockRegistry,
  type BlockDefinition,
  type BlockRegistry,
} from "../../src/presentation/blocks/index.js";
import { defaultTheme, loadTheme, type ResolvedTheme } from "../../src/presentation/theme/index.js";
import { renderToLines, type RenderOptions } from "../../src/presentation/render-lines.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

export function themeFor(variant: "dark" | "light"): ResolvedTheme {
  const loaded = loadTheme(defaultTheme, variant);
  if (!loaded.ok) throw new Error(`the shipped theme does not load: ${JSON.stringify(loaded.error)}`);
  return loaded.value.current;
}

export const DARK_THEME = themeFor("dark");
export const LIGHT_THEME = themeFor("light");

/** A full-capability terminal: truecolour, Unicode, everything available. */
export const FULL_CAPS: TerminalCapabilities = Object.freeze({
  colourDepth: 24,
  unicode: "full",
  ambiguousWidth: "narrow",
  synchronisedUpdate: true,
  bracketedPaste: true,
  mouse: true,
  imageProtocol: "none",
  altScreen: true,
});

/** `LANG=C`: ASCII glyphs throughout, and the `~` truncation marker. */
export const ASCII_CAPS: TerminalCapabilities = Object.freeze({
  ...FULL_CAPS,
  unicode: "ascii",
});

/** `TERM=dumb`-ish: no colour at all, so every tone is typographic (D29). */
export const MONO_CAPS: TerminalCapabilities = Object.freeze({
  ...ASCII_CAPS,
  colourDepth: 1,
});

/**
 * A registry, with extra kinds registered through the public `register`.
 *
 * The parameter is `BlockDefinition<never>[]` so a caller can pass
 * `tableDefinition`, whose `B` is `Table`, without a cast at every call site:
 * `BlockDefinition<B>` is invariant in `B` — `B` appears in both `measure`'s and
 * `render`'s parameters — so `<Table>` is not assignable to `<Block>`. The
 * registry stores `<Block>` and `defaults.ts` casts at its own collection point
 * for the same reason; this is that cast, once, here.
 */
export function registry(definitions: readonly BlockDefinition<never>[] = []): BlockRegistry {
  const r = createBlockRegistry({});
  for (const definition of definitions) r.register(definition as unknown as BlockDefinition);
  return r;
}

/**
 * The `MeasurableRegistry` the conformance suite takes, bound to a theme and a
 * capability record.
 *
 * The suite is declared structurally so it does not import C09 (it moves to
 * `src/testing/` at C24); this is the adapter, and it is the only place the two
 * meet.
 */
export function measurable(
  options: Readonly<{
    theme?: ResolvedTheme;
    capabilities?: TerminalCapabilities;
    tick?: number;
    /**
     * Kinds registered through C09's public `register`, on top of the fourteen
     * defaults. `table`, `plot` and `patch` are **not** defaults — C11, C12 and
     * C25 register them, which is what proves the extension path (C09 §3) — so a
     * suite that wants one passes it here.
     *
     * The option that could have been inert. An unregistered kind still renders,
     * as `raw`, and still produces rows — so a test that registers `table`, draws
     * one and counts lines passes whether or not the option arrived.
     * `support-harness.test.ts` asserts on `kinds` and on content only the real
     * renderer emits, with a default that genuinely lacks the kind.
     */
    definitions?: readonly BlockDefinition<never>[];
    focus?: RenderOptions["focus"];
  }> = {},
): Readonly<{
  measure: (block: Block, width: number) => number;
  renderToLines: (block: Block, width: number) => readonly string[];
  kinds: readonly string[];
  registry: BlockRegistry;
  /**
   * A kind's window, dispatched (C09 I25, I26).
   *
   * **Present here so the conformance suite can check it at all.** The suite
   * takes a structural shape rather than C09's registry — a consumer's registry
   * is not C09's — so the window has to arrive the same way `measure` does, or
   * the height property is declared and checked nowhere.
   */
  window: (
    block: Block,
    width: number,
    from: number,
    to: number,
  ) => Readonly<{ block: Block; skipRows: number }> | undefined;
}> {
  const r = registry(options.definitions ?? []);
  const render: RenderOptions = {
    theme: options.theme ?? DARK_THEME,
    capabilities: options.capabilities ?? FULL_CAPS,
    tick: options.tick ?? 0,
    ...(options.focus === undefined ? {} : { focus: options.focus }),
  };

  return {
    measure: (block, width) => r.measure(block, width),
    renderToLines: (block, width) => renderToLines(r, block, width, render),
    kinds: r.kinds,
    registry: r,
    window: (block, width, from, to) => {
      const definition = r.get(block.kind);
      return definition?.window?.(block, width, from, to);
    },
  };
}

/** Display cells of a rendered row, with SGR sequences discounted. */
export function visible(line: string): string {
  const esc = String.fromCharCode(27);
  return line
    .split(`${esc}[`)
    .map((part, index) => (index === 0 ? part : part.slice(part.indexOf("m") + 1)))
    .join("");
}
