/**
 * PNG in, pixels out (C04 I73, C09 I36).
 *
 * **Internal, and the ledger's own test is what decided it.** Nothing in the
 * runtime dependencies decodes an image — `sharp` is a devDependency whose row
 * says in as many words that it is not in the dependency graph of anything a
 * consumer installs — and the dither arm needs pixels. A PNG decoder is chunk
 * walking, `inflate`, and five filter types: the *sixty lines internal* side of
 * `DEPENDENCIES.md`'s test rather than the *a layout engine* side.
 *
 * **`node:zlib` is a builtin**, so this adds nothing to the graph.
 *
 * **JPEG is refused for phase 1**, and the reason is the ledger's argument
 * applied honestly in the other direction: Huffman plus an inverse DCT is a
 * decoder, not a function. The expiry is a symbol rather than a sentence —
 * `decodeJpeg` below — so the deferral can be grepped. PNG is what matplotlib
 * writes, which is the reference this phase serves.
 *
 * **GIF is the second format, and it is `gif.ts`'s** (C04 I93). This file keeps
 * the PNG walk and gains the front door: `decodeImage` reads the signature and
 * dispatches, so the two decoders share a result type and nothing above them
 * asks which format it holds.
 */
import { inflateSync } from "node:zlib";
import { decodeGif, isGifSignature } from "./gif.js";

/** Straight RGBA, four bytes per pixel, alpha composited by the caller. */
export type Pixels = Readonly<{
  width: number;
  height: number;
  data: Uint8Array;
}>;

/**
 * **A refusal carries the extent when it has one** (C09 I38, §8b G7, F413).
 *
 * The IHDR is filled in the chunk walk and every refusal below it happens with
 * `w` and `h` already in hand — so *this cannot be rasterised* and *how big is
 * it* are separable, and the protocol arm needs only the second. `size` is
 * absent exactly when the failure is a failure to find a picture at all: no
 * signature, no IHDR, a zero dimension.
 */
export type Refused = Readonly<{ ok: false; fault: string; size?: Readonly<{ width: number; height: number }> }>;

/**
 * A GIF's frames, every one a full logical screen, and the delay each shows for
 * in milliseconds (C04 I93, C09 I39). Present on a decode **only when there is
 * more than one frame**, so a still — PNG or one-frame GIF — is `pixels` alone
 * and every consumer that never asked about animation reads it unchanged.
 */
export type Animation = Readonly<{ frames: readonly Pixels[]; delays: readonly number[] }>;

/**
 * `pixels` is what a still consumer draws — for a GIF it is frame 0, so the
 * geometry, the identity and the kitty arm's plain transmission all see one
 * picture and only the arms that animate look past it.
 */
export type Decoded = Readonly<{ ok: true; pixels: Pixels; animation?: Animation }> | Refused;

const SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * The codec's front door: **the signature chooses the decoder** (C04 I93).
 *
 * Six bytes for a GIF and eight for a PNG, and nothing else is read before the
 * choice — a signature check is what separates *this is not an image we read*
 * from *this image is broken*, and the second is each decoder's to phrase.
 */
export function decodeImage(bytes: Uint8Array): Decoded {
  if (isGifSignature(bytes)) {
    const gif = decodeGif(bytes);
    if (!gif.ok) return gif;
    const first = gif.frames[0];
    if (first === undefined) return { ok: false, fault: "a GIF with no frames" };
    return gif.frames.length > 1 // cells-ok — a frame count
      ? { ok: true, pixels: first, animation: { frames: gif.frames, delays: gif.delays } }
      : { ok: true, pixels: first };
  }
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) { // cells-ok — a byte count
    return { ok: false, fault: "not a PNG or a GIF — neither the eight-byte signature nor the six-byte one matches" };
  }
  return decodePng(bytes);
}

/** Bytes per pixel by colour type, at bit depth 8. */
const CHANNELS: Readonly<Record<number, number>> = Object.freeze({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 });

/**
 * The bytes a PNG's chunks carry, walked once.
 *
 * **Ancillary chunks are skipped rather than assumed absent** — F248 measured an
 * eight-by-four PNG from `sharp` arriving as `IHDR pHYs IDAT IEND`, so a decoder
 * that expected `IDAT` to follow `IHDR` would fail on the first real file it saw.
 */
export function decodePng(bytes: Uint8Array): Decoded {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) { // cells-ok — a byte count
    return { ok: false, fault: "not a PNG — the eight-byte signature does not match" };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8; // cells-ok — a byte offset
  let header: { w: number; h: number; depth: number; colour: number; interlace: number } | null = null;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  let alpha: Uint8Array | null = null;

  while (at + 8 <= bytes.length) { // cells-ok — a byte offset
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4] ?? 0, bytes[at + 5] ?? 0, bytes[at + 6] ?? 0, bytes[at + 7] ?? 0);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      header = {
        w: view.getUint32(at + 8),
        h: view.getUint32(at + 12),
        depth: bytes[at + 16] ?? 0,
        colour: bytes[at + 17] ?? 0,
        interlace: bytes[at + 20] ?? 0,
      };
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") alpha = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    at += 12 + length; // cells-ok — a byte offset
  }

  if (header === null) return { ok: false, fault: "no IHDR chunk" };
  const { w, h, depth, colour, interlace } = header;
  if (w < 1 || h < 1) return { ok: false, fault: `IHDR declares ${String(w)}x${String(h)}` };
  // **Refused with the reason, not silently mishandled.** Each of these is a
  // real PNG this cannot read, and a decoder that guessed would produce a wrong
  // picture rather than an error — the failure mode this phase is most careful
  // about (C09 I36).
  // **From here the extent is known and travels with the refusal** (F413).
  const size = { width: w, height: h };
  if (interlace !== 0) {
    return { ok: false, fault: "interlaced PNG (Adam7) — phase 1 reads progressive only", size };
  }
  if (depth !== 8) return { ok: false, fault: `bit depth ${String(depth)} — phase 1 reads 8-bit only`, size };
  const channels = CHANNELS[colour];
  if (channels === undefined) {
    return { ok: false, fault: `colour type ${String(colour)} is not a PNG colour type`, size };
  }
  if (idat.length === 0) return { ok: false, fault: "no IDAT chunk — nothing to decode", size }; // cells-ok — a chunk count

  let raw: Uint8Array;
  try {
    raw = new Uint8Array(inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c)))));
  } catch {
    return { ok: false, fault: "IDAT does not inflate — the image data is corrupt", size };
  }

  const stride = w * channels; // cells-ok — a byte count
  const got = raw.length; // cells-ok — a byte count
  const need = (stride + 1) * h; // cells-ok — a byte count
  if (got < need) {
    return { ok: false, fault: `inflated to ${String(got)} bytes where ${String(need)} were needed`, size };
  }

  // **Unfiltered in place, row by row**, because every filter but `None` reads
  // the row above *after* it has itself been unfiltered — which is why this is a
  // sequential pass and not a map.
  const flat = new Uint8Array(stride * h);
  for (let y = 0; y < h; y += 1) { // cells-ok — a row index
    const filter = raw[y * (stride + 1)] ?? 0;
    const src = y * (stride + 1) + 1; // cells-ok — a byte offset
    const dst = y * stride; // cells-ok — a byte offset
    for (let i = 0; i < stride; i += 1) { // cells-ok — a byte offset
      const x = raw[src + i] ?? 0;
      const a = i >= channels ? (flat[dst + i - channels] ?? 0) : 0;
      const b = y > 0 ? (flat[dst - stride + i] ?? 0) : 0;
      const c = y > 0 && i >= channels ? (flat[dst - stride + i - channels] ?? 0) : 0;
      flat[dst + i] = unfilter(filter, x, a, b, c);
    }
  }

  return { ok: true, pixels: toRgba(flat, w, h, colour, channels, palette, alpha) };
}

/** The five filter types (PNG §9.2). `Paeth` is the only one with a predicate. */
function unfilter(kind: number, x: number, a: number, b: number, c: number): number {
  switch (kind) {
    case 0:
      return x;
    case 1:
      return (x + a) & 0xff;
    case 2:
      return (x + b) & 0xff;
    case 3:
      return (x + ((a + b) >> 1)) & 0xff;
    default: {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const near = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      return (x + near) & 0xff;
    }
  }
}

/** Every colour type widened to RGBA, so one dither serves all five. */
function toRgba(
  flat: Uint8Array,
  w: number,
  h: number,
  colour: number,
  channels: number,
  palette: Uint8Array | null,
  trns: Uint8Array | null,
): Pixels {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) { // cells-ok — a pixel index
    const s = i * channels; // cells-ok — a byte offset
    const d = i * 4; // cells-ok — a byte offset
    if (colour === 3 && palette !== null) {
      const idx = (flat[s] ?? 0) * 3; // cells-ok — a byte offset
      out[d] = palette[idx] ?? 0;
      out[d + 1] = palette[idx + 1] ?? 0;
      out[d + 2] = palette[idx + 2] ?? 0;
      out[d + 3] = trns?.[flat[s] ?? 0] ?? 255;
      continue;
    }
    if (colour === 0 || colour === 4) {
      const g = flat[s] ?? 0;
      out[d] = g;
      out[d + 1] = g;
      out[d + 2] = g;
      out[d + 3] = colour === 4 ? (flat[s + 1] ?? 255) : 255;
      continue;
    }
    out[d] = flat[s] ?? 0;
    out[d + 1] = flat[s + 1] ?? 0;
    out[d + 2] = flat[s + 2] ?? 0;
    out[d + 3] = colour === 6 ? (flat[s + 3] ?? 255) : 255;
  }
  return { width: w, height: h, data: out };
}

/**
 * **The expiry, as a symbol rather than a sentence.**
 *
 * `decodeJpeg` does not exist. When it does, the refusal in `decodePng`'s header
 * expires and `Image` accepts a second format — and until then this comment is
 * what a grep for the deferral finds, which is the whole reason it is written as
 * a name (CLAUDE.md, *a deferral states its blocker as a symbol*).
 */
export const DECODE_JPEG_IS_NOT_BUILT = "decodeJpeg";
