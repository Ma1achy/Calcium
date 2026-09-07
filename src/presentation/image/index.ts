/** The image codec and its dither (C04 §3g, C09 §4c). */
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
