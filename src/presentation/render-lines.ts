/**
 * A block, and the terminal rows it actually occupies (C09).
 *
 * **This lived in `src/testing/` and it was never a testing utility.** A test
 * was its first caller, so it was written where the caller was — and then
 * `shell/paint.ts`, `shell/composite.ts` and `shell/session.ts` came to depend
 * on `renderSequenceToLines` for real frame composition. The package declares
 * `@fmx/calcium/testing` dev-only and C24 I8 says it is absent from a production
 * bundle; tracing the built runtime entry found three edges into
 * `dist/testing/index.js`, dragging both conformance suites in behind them.
 *
 * Nothing was wrong with the code and the layering was never violated — L1
 * importing L0 and L4 importing L1 are both downward. **The defect was
 * entirely one of address**, and it was invisible until C24 gave the tree an
 * entry point to trace from: with no `src/index.ts`, there was no production
 * bundle to be absent from.
 *
 * It sits in `presentation/` because that is what it is — the render path
 * expressed as lines, beside the registry that drives it. `src/testing/` keeps
 * the two conformance suites, which a consumer genuinely runs.
 */
import { Box, Text, renderToString } from "ink";
import { createElement } from "react";
import type { Block } from "../data/viewmodel/index.js";
import type { BlockRegistry, RenderContext, RenderContextInput } from "./blocks/index.js";
import type { ResolvedTheme } from "./theme/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";

/**
 * Everything a render needs that is not the registry or the block. Defaulted
 * so a caller asserting about geometry does not have to assemble a theme.
 */
/** One cell, below the block, so a blank final row still ends in a newline. */
const SENTINEL = ".";

export type RenderOptions = Readonly<{
  theme: ResolvedTheme;
  capabilities: TerminalCapabilities;
  tick?: number;
  focus?: RenderContext["focus"];
  /** Per-container scroll offsets, in rows (C04 I48). Absent is none. */
  scrollOffsets?: RenderContext["scrollOffsets"];
  /** Per-plot cursor positions, in sample indices. Absent is no cursor. */
  cursorPositions?: RenderContext["cursorPositions"];
  /** Per-plot live cameras (C12 I83). Absent is each block's own. */
  cameras?: RenderContext["cameras"];
  /** Per-image frame indices (C04 I93, C22 I77). Absent is frame 0. */
  frames?: RenderContext["frames"];
  /** Per-plot series overrides (C04 I99, C22 I78). Absent is each block's own `hidden`. */
  seriesVisibility?: RenderContext["seriesVisibility"];
  /**
   * Caller-owned scratch (C12 I107). Absent is a miss on every lookup, which is
   * the same frame at the same cost — a cache whose absence changes a picture
   * is not a cache, and PR10's control asserts exactly that.
   */
  scratch?: RenderContext["scratch"];
}>;

/**
 * The rows a block occupies at `width`.
 *
 * This is the right-hand side of C09 I1: `measure(block, w)` must equal
 * `renderToLines(registry, block, w).length`. Ink renders to a string
 * synchronously with no terminal, no stdout and no event listeners, so this is
 * a pure function of its arguments — which is what allows it in a unit test
 * rather than only behind a PTY.
 */
export function renderToLines(
  registry: BlockRegistry,
  block: Block,
  width: number,
  options: RenderOptions,
): readonly string[] {
  const ctx: RenderContextInput = {
    width,
    theme: options.theme,
    capabilities: options.capabilities,
    focus: options.focus ?? null,
    ...(options.scrollOffsets === undefined ? {} : { scrollOffsets: options.scrollOffsets }),
    ...(options.cursorPositions === undefined ? {} : { cursorPositions: options.cursorPositions }),
    ...(options.cameras === undefined ? {} : { cameras: options.cameras }),
    ...(options.frames === undefined ? {} : { frames: options.frames }),
    ...(options.seriesVisibility === undefined ? {} : { seriesVisibility: options.seriesVisibility }),
    ...(options.scratch === undefined ? {} : { scratch: options.scratch }),
    tick: options.tick ?? 0,
  };

  // Counted against a sentinel row rather than by splitting the output.
  //
  // Ink trims a blank row's trailing space, so an empty container — which
  // occupies no rows — and an empty `notice` — which occupies one blank row, the
  // case C04 I17 exists for — both paint the empty string. Splitting cannot tell
  // them apart, and the harness would have to be wrong about one of them.
  //
  // A row appended below the block gives every real row a newline to its right,
  // so the count is the number of newlines before the sentinel: zero for the
  // container, one for the notice.
  const painted = renderToString(
    createElement(
      Box,
      { flexDirection: "column" },
      registry.render(block, ctx),
      createElement(Text, { key: "sentinel" }, SENTINEL),
    ),
    { columns: width },
  );

  const lines = painted.split("\n");
  return lines.slice(0, Math.max(0, lines.length - 1)); // cells-ok — rows, not columns
}

/**
 * The rows a *sequence* of blocks occupies — a document's top level.
 *
 * The other side of `measureSequence`: `gapBefore` is the only thing in C04's
 * vocabulary that produces vertical space, and the surfaces are drawn with it,
 * so composing a surface and counting rows is how an illustration becomes a
 * checkable claim rather than a picture (docs/surfaces/HEIGHT_AUDIT.md).
 */
export function renderSequenceToLines(
  registry: BlockRegistry,
  blocks: readonly Block[],
  width: number,
  options: RenderOptions,
): readonly string[] {
  const ctx: RenderContextInput = {
    width,
    theme: options.theme,
    capabilities: options.capabilities,
    focus: options.focus ?? null,
    ...(options.scrollOffsets === undefined ? {} : { scrollOffsets: options.scrollOffsets }),
    ...(options.cursorPositions === undefined ? {} : { cursorPositions: options.cursorPositions }),
    ...(options.cameras === undefined ? {} : { cameras: options.cameras }),
    ...(options.frames === undefined ? {} : { frames: options.frames }),
    ...(options.seriesVisibility === undefined ? {} : { seriesVisibility: options.seriesVisibility }),
    ...(options.scratch === undefined ? {} : { scratch: options.scratch }),
    tick: options.tick ?? 0,
  };

  const painted = renderToString(
    createElement(
      Box,
      { flexDirection: "column" },
      registry.renderSequence(blocks, ctx),
      createElement(Text, { key: "sentinel" }, SENTINEL),
    ),
    { columns: width },
  );

  const lines = painted.split("\n");
  return lines.slice(0, Math.max(0, lines.length - 1)); // cells-ok — rows, not columns
}
