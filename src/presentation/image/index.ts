/** The image codec and its dither (C04 §3g, C09 §4c). */
/**
 * **`decodePng` is named here for `examples/plots/tools/fixtures.mjs`, and that
 * is the whole of why the line survives** (F1000, for F625).
 *
 * F625 recorded it as a barrel line whose consumers had dropped to `codec.ts`
 * itself and tests, and MG25 stayed green because `decodeImage` calls it one
 * screen below in the file that declares it. Measured at HEAD the premise does
 * not hold: the fixture generator imports it **through this barrel**, out of
 * `dist/`, to put an eight-file PNG corpus through the decoder that will read it
 * — six that must read and two, `interlaced.png` and `depth16.png`, that must
 * refuse. Deleting the line breaks that script, and `decodeImage` cannot stand
 * in: the point of those two fixtures is a *PNG-specific* refusal, which the
 * dispatching front door would report as a dispatch. Five test files want it for
 * the same reason (`image-dither`, `image-halfblock`, `image-overlay`,
 * `image-frames`, `plot-svg-path`).
 *
 * **And it was not the line worth the finding.** Ten of the nineteen names this
 * barrel exports have no consumer under `src/` — serving tests and tools is what
 * a component barrel is for — and three have no consumer anywhere through any
 * route: `DECODE_JPEG_IS_NOT_BUILT`, `HALF_BLOCK_LOWER` and `HalfCell`. Those
 * three are the residue, and no rule reaches them: MG25 walks `export function`
 * and `export class`, so two constants and a type alias are outside its subject
 * rather than inside its blind spot. `test/unit/public-surface-barrels.test.ts`
 * records the set and compares it **by equality**, so wiring one or deleting one
 * is a failure until someone says which — the arm every list in this repository
 * that went stale was missing.
 */
export {
  decodeImage,
  decodePng,
  DECODE_JPEG_IS_NOT_BUILT,
  type Animation,
  type Decoded,
  type Pixels,
} from "./codec.js";
export { decodeGif, DEFAULT_DELAY_MS, MIN_DELAY_MS } from "./gif.js";
export { bayer, ditherAscii, ditherBraille, DITHER_ASCII, luminance } from "./dither.js";
export { HALF_BLOCK, HALF_BLOCK_LOWER, halfBlockEligible, halfBlockRows, type HalfCell } from "./halfblock.js";
