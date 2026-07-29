/**
 * C24 §7 — expectDocument, adaptFixture, fakes. Dev-only.
 *
 * What is here so far is the half C09 needs: a registry rendered to the rows it
 * actually occupies, which is the other side of every measurement assertion. It
 * lives in `src/` rather than in `test/` because C24 §7 ships it — the
 * conformance suite is a thing consumers run against their own registered
 * kinds, not a thing this repo keeps to itself.
 */
import { Box, Text, renderToString } from "ink";
import { createElement } from "react";
import type { Block } from "../data/viewmodel/index.js";
import type { BlockRegistry, RenderContext } from "../presentation/blocks/index.js";
import type { ResolvedTheme } from "../presentation/theme/index.js";
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
  onAction?: RenderContext["onAction"];
}>;

/**
 * The rows a block occupies at `width`.
 *
 * This is the right-hand side of I1: `measure(block, w)` must equal
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
  const ctx: RenderContext = {
    width,
    theme: options.theme,
    capabilities: options.capabilities,
    focus: options.focus ?? null,
    tick: options.tick ?? 0,
    onAction: options.onAction ?? (() => undefined),
    // The registry replaces both of these with itself; they are here because
    // the type requires them, and a caller should not have to know that.
    measureChild: registry.measure,
    renderChild: () => {
      throw new Error("renderChild is supplied by the registry");
    },
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
  return lines.slice(0, Math.max(0, lines.length - 1));
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
  const ctx: RenderContext = {
    width,
    theme: options.theme,
    capabilities: options.capabilities,
    focus: options.focus ?? null,
    tick: options.tick ?? 0,
    onAction: options.onAction ?? (() => undefined),
    measureChild: registry.measure,
    renderChild: () => {
      throw new Error("renderChild is supplied by the registry");
    },
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
  return lines.slice(0, Math.max(0, lines.length - 1));
}
