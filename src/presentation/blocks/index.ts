/**
 * C09 — the registry and fourteen default kinds.
 *
 * The obligation that dominates every decision here: **`measure(block, w)`
 * equals the number of rows `render(block)` occupies at width `w`** (I1). C14
 * virtualises on measured heights without rendering, so a divergence does not
 * produce a wrong-looking block — it produces a viewport that drifts as the
 * user scrolls, which is far harder to diagnose. Every kind's two halves are
 * written as a pair and tested as a pair.
 */

export { DEFAULT_DEFINITIONS } from "./defaults.js";
export {
  glyphs,
  glyphFor,
  glyphCells,
  spinnerFrames,
  GLYPH_SUBSTITUTIONS,
  GLYPH_TOKENS,
  SUBSTITUTIONS,
  type GlyphSet,
} from "./glyphs.js";
export { createBlockRegistry } from "./registry.js";
export type { BlockDefinition, BlockRegistry, FocusState, RenderContext } from "./types.js";
