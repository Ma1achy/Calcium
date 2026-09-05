// A registry, a theme and a capability record — what every C09 test needs
// before it can assert anything about a row.
//
// Assembled once here rather than per file so that "the same block in both
// themes" and "the same block in both unicode modes" are one argument apart
// (T4.2, T2.2).
import {
  createBlockRegistry,
  type BlockDefinition,
  type BlockFault,
  type BlockRegistry,
} from "../../src/presentation/blocks/index.js";
import { defaultTheme, loadTheme, type ResolvedTheme } from "../../src/presentation/theme/index.js";
import { renderToLines, type RenderOptions } from "../../src/presentation/render-lines.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { DITHER_ASCII, HALF_BLOCK } from "../../src/presentation/image/index.js";

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
  backgroundPolarity: "unknown",
  synchronisedUpdate: true,
  bracketedPaste: true,
  mouse: true,
  imageProtocol: "none",
  keyboardProtocol: "none",
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
 * 1-bit **with Unicode** — the rung every 1-bit claim is actually about.
 *
 * `MONO_CAPS` is `{colourDepth: 1, unicode: "ascii"}`, so it moves two
 * capabilities at once and **nothing rendered this one**. C12 I6's stacking and
 * C12 I17's *the glyph is the channel at every depth* were both measured only
 * where Unicode had also been removed — a fixture where two things change is a
 * fixture that cannot say which one the behaviour follows.
 *
 * Found by the C12 audit (`docs/notes/CALCIUM_C12_AUDIT.md` §3).
 */
export const MONO_UNICODE_CAPS: TerminalCapabilities = Object.freeze({
  ...MONO_CAPS,
  unicode: "full",
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
/**
 * The sink every harness registry gets unless the test asks for silence
 * (C09 I29, T3.35).
 *
 * **A containment that reports nothing hides the bugs it exists to survive.**
 * Two of C09's catches shipped reporting nothing at all, and a suite could go
 * green with a caught throw in it — which is what this makes impossible for
 * every test that does not opt out.
 */
export const LOUD = (fault: BlockFault): void => {
  throw new Error(
    `a C09 containment swallowed a ${fault.member} fault in \`${fault.kind}\`: ` +
      `${String(fault.error)}. A boundary that hides what it catches is worse than none — ` +
      "pass `onError: QUIET` where the containment is the subject.",
  );
};

/**
 * For the rows whose subject **is** the containment.
 *
 * Named and counted rather than defaulted to: an exemption a reader can grep is
 * an exemption; a silent default is the state this replaced.
 */
export const QUIET = (): void => undefined;

export function registry(
  definitions: readonly BlockDefinition<never>[] = [],
  onError: (fault: BlockFault) => void = LOUD,
  maxBlockRows?: number,
): BlockRegistry {
  const r = createBlockRegistry(maxBlockRows === undefined ? { onError } : { onError, maxBlockRows });
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
    /** The registry's row cap (C14 I24); the default is C09's. A suite about a definition's arithmetic raises it. */
    maxBlockRows?: number;
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
    cursorPositions?: RenderOptions["cursorPositions"];
    /** Per-plot live cameras (C12 I83), so a row can move one without rebuilding the block. */
    cameras?: RenderOptions["cameras"];
    /**
     * Caller-owned scratch (C12 I107). A row that supplies a counting one reads
     * the **build count** off it, which is what PR10 asserts instead of a time.
     */
    scratch?: RenderOptions["scratch"];
    /**
     * What a swallowed containment does here (C09 I29). `LOUD` by default —
     * pass `QUIET` where the throw is the subject rather than a surprise.
     */
    onError?: (fault: BlockFault) => void;
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
  ) => Readonly<{ block: Block; skipRows: number; dropRows: number }> | undefined;
}> {
  const r = registry(options.definitions ?? [], options.onError ?? LOUD, options.maxBlockRows);
  const render: RenderOptions = {
    theme: options.theme ?? DARK_THEME,
    capabilities: options.capabilities ?? FULL_CAPS,
    tick: options.tick ?? 0,
    ...(options.focus === undefined ? {} : { focus: options.focus }),
    ...(options.cursorPositions === undefined ? {} : { cursorPositions: options.cursorPositions }),
    ...(options.cameras === undefined ? {} : { cameras: options.cameras }),
    ...(options.scratch === undefined ? {} : { scratch: options.scratch }),
  };

  return {
    measure: (block, width) => r.measure(block, width),
    renderToLines: (block, width) => renderToLines(r, block, width, render),
    kinds: r.kinds,
    registry: r,
    window: (block, width, from, to) => {
      const definition = r.get(block.kind);
      // **`r.measure` is the child seam** (C09 I26a). Handing the suite's own
      // measurer here rather than a stub is what keeps the property honest for a
      // kind whose unit boundaries are a child's height.
      return definition?.window?.(block, width, from, to, r.measure);
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

/**
 * A terminal on the **dither** rung of C09's glyph axis (C09 I37, §8b).
 *
 * `FULL_CAPS` used to mean *the dither*, because the dither was the only arm
 * below `kitty`. It now means the **half block**, so a row that wants braille
 * has to say so — and `ambiguousWidth` is the gate to say it with. The other two
 * change something else: `colourDepth: 4` drops below C10 I31's overlay floor,
 * which is a different test's subject, and `unicode: "ascii"` takes the ramp
 * rather than braille.
 */
export const DITHER_CAPS: TerminalCapabilities = Object.freeze({
  ...FULL_CAPS,
  ambiguousWidth: "wide",
});

/**
 * Whether a row carries **any** of the glyph axis's alphabets (C09 §8b, F411).
 *
 * **Built from the ladder's own constants rather than a literal range**, and the
 * reason is that three sibling rows each held their own `/[⠀-⣿]/`: the day a rung
 * landed above braille they reported *the picture is not drawn* for a frame full
 * of picture. `image-overlay.test.ts`'s header already records this class about
 * SGR — *a matcher that sees one encoding cannot tell the rung is absent from
 * the rung is a different escape* — and the glyph half repeated it three times.
 *
 * **A fourth alphabet must be added here**, and the cost of forgetting is the
 * failure this replaces: an absence reported where there is a picture. There is
 * no equality arm to gate that, so it is written down instead — braille is a
 * range and cannot be an exported string, which is what stops this being
 * derived outright.
 *
 * **A picture is a *run* of the alphabet and not one character of it**, which
 * the first draft got wrong: the ASCII ramp is `.:-=+*#@`, so any caption
 * carrying a hyphen satisfied a membership test and the matcher was vacuous on
 * exactly the rung it was widened to cover. Four consecutive is the threshold —
 * a box rule is `─` and not `-`, so furniture does not reach it.
 */
export function drawsPicture(line: string, run = 4): boolean {
  const alphabet = new Set([HALF_BLOCK, ...[...DITHER_ASCII].filter((c) => c.trim() !== "")]);
  let streak = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0) ?? 0;
    streak = alphabet.has(ch) || (cp >= 0x2800 && cp <= 0x28ff) ? streak + 1 : 0;
    if (streak >= run) return true;
  }
  return false;
}
