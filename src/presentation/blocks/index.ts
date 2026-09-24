/**
 * C09 — the registry and nineteen default kinds.
 *
 * The obligation that dominates every decision here: **`measure(block, w)`
 * equals the number of rows `render(block)` occupies at width `w`** (I1). C14
 * virtualises on measured heights without rendering, so a divergence does not
 * produce a wrong-looking block — it produces a viewport that drifts as the
 * user scrolls, which is far harder to diagnose. Every kind's two halves are
 * written as a pair and tested as a pair.
 */

export { DEFAULT_DEFINITIONS } from "./defaults.js";
export { ANIMATES, animationIntervalOf, tickIntervalOf } from "./animation.js";
// The floor the shell reserves for a contained failure (C22 I69, C04 I67).
export { countdown, elapsed, statusDetailRows, statusRowsFor } from "./kinds/status.js";
export { age } from "./kinds/containers.js";
export { tapeStart } from "./kinds/tape.js";
export {
  glyphs,
  type GlyphCaps,
  glyphFor,
  glyphCells,
  spinnerFrames,
  spinnerIntervalMs,
  spinnerSetNames,
  barStyleNames,
  GLYPH_DOMAINS,
  GLYPH_SET_DOMAINS,
  GLYPH_SUBSTITUTIONS,
  GLYPH_TOKENS,
  FREE_WIDTH_SLOTS,
  SUBSTITUTIONS,
  type GlyphSet,
} from "./glyphs.js";
export { DEFAULT_MAX_BLOCK_ROWS, createBlockRegistry, windowRefused } from "./registry.js";
// C25 renders code inside a diff line and does not tokenise (C25 §4). The
// tokeniser and its memo stay C09's; what crosses the seam is the token stream.
export {
  DEFAULT_LANGUAGES,
  registerGrammar,
  sliceTokens,
  tokenise,
  tokenisationCount,
  UNSLOTTED,
  type Token,
} from "./kinds/code.js";
export type {
  AnyBlockDefinition,
  BlockDefinition,
  BlockFault,
  BlockRegistry,
  MeasureMemo,
  FocusState,
  NavElement,
  Motion,
  RenderContext,
  Rendered,
  RenderContextInput,
} from "./types.js";
