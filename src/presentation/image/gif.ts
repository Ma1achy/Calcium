/**
 * GIF in, frames out (C04 I93, C09 I39).
 *
 * **In-tree, on `decodePng`'s own argument.** A GIF decoder is a block walk,
 * LZW and a compositor — the *two hundred lines internal* side of
 * `DEPENDENCIES.md`'s test, and `omggif` at 38.5 KB would be a dependency row
 * for a function. `node:zlib` is not even needed: GIF's LZW is its own.
 *
 * **Every frame is a full logical screen.** The format stores each frame as a
 * sub-rectangle with a disposal rule about the frame before it, so a frame on
 * its own is not a picture; what the renderer wants is *the screen after frame
 * k*, and that is what `frames[k]` holds. The compositing happens here, once,
 * rather than in every arm that draws.
 *
 * **Delays are milliseconds and the short ones are clamped**, which is the one
 * place this decoder departs from the bytes. The format stores hundredths of a
 * second and a great many files store `0` or `1`, meaning *as fast as you can*;
 * browsers show those at 100 ms. A delay under `MIN_DELAY_MS` becomes
 * `DEFAULT_DELAY_MS` here for the same reason — a frame the eye cannot see is a
 * wake the session cannot afford — and the two constants are exported so the
 * test asserts against the rule rather than a literal.
 */
import type { Pixels, Refused } from "./codec.js";

export type GifDecoded =
  | Readonly<{ ok: true; frames: readonly Pixels[]; delays: readonly number[] }>
  | Refused;

/**
 * Under this, a delay is read as *unspecified* rather than as a rate.
 *
 * Browsers put the line at 10 ms and this puts it at 20, and the difference is
 * deliberate: 20 ms is 50 frames a second, over the 30 fps ceiling C03's
 * `stream` window already enforces, so a file asking for it would have its
 * frames skipped by the delta arithmetic either way.
 */
export const MIN_DELAY_MS = 20;
/** What a clamped delay becomes — the figure browsers use. */
export const DEFAULT_DELAY_MS = 100;

/**
 * The floor, applied once. The scanner's descriptor and the decoder's delay list
 * both clamped with the same expression, and a mutation removing the scanner's
 * copy survived IF3 because the decoder's still held — a rule with two copies is
 * tested against one of them (F778). One function, both callers.
 */
function clampDelay(ms: number): number {
  return ms < MIN_DELAY_MS ? DEFAULT_DELAY_MS : ms;
}

const TRAILER = 0x3b;
const EXTENSION = 0x21;
const IMAGE = 0x2c;
const GRAPHIC_CONTROL = 0xf9;

/** The little-endian sixteen-bit read the format uses everywhere. */
const u16 = (bytes: Uint8Array, at: number): number => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);

/** Skip a run of sub-blocks — length byte, body, until a zero length. */
function skipSubBlocks(bytes: Uint8Array, at: number): number {
  let p = at;
  while (p < bytes.length) { // cells-ok — a byte offset
    const n = bytes[p] ?? 0;
    p += 1 + n;
    if (n === 0) break;
  }
  return p;
}

/** The rows of an interlaced frame, in the order the stream carries them. */
function interlaceOrder(height: number): number[] {
  const out: number[] = [];
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]] as const) {
    for (let y = start; y < height; y += step) out.push(y);
  }
  return out;
}

/**
 * LZW, as the format specifies it: variable code width from `min + 1` to 12,
 * a clear code that resets the table and an end code that ends the stream.
 *
 * `null` for a stream that names a code the table does not hold — the one
 * corruption LZW can detect — and a short stream is tolerated, because the
 * pixels it did not write stay transparent rather than becoming a refusal.
 */
function lzw(minCodeSize: number, data: Uint8Array, pixels: number): Uint8Array | null {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const prefix = new Int32Array(4096).fill(-1);
  const suffix = new Uint8Array(4096);
  for (let i = 0; i < clear; i += 1) suffix[i] = i;
  const stack = new Uint8Array(4097);
  const out = new Uint8Array(pixels);
  let op = 0;
  let codeSize = minCodeSize + 1;
  let next = end + 1;
  let previous = -1;

  let bits = 0;
  let held = 0;
  let pos = 0;
  const read = (): number => {
    while (held < codeSize) {
      if (pos >= data.length) return -1; // cells-ok — a byte offset
      bits |= (data[pos] ?? 0) << held;
      pos += 1;
      held += 8;
    }
    const code = bits & ((1 << codeSize) - 1);
    bits >>>= codeSize;
    held -= codeSize;
    return code;
  };

  /** Write one table entry's string and return its first byte. */
  const emit = (code: number): number => {
    let sp = 0;
    let c = code;
    while (c >= clear) {
      stack[sp] = suffix[c] ?? 0;
      sp += 1;
      c = prefix[c] ?? -1;
    }
    const first = c;
    stack[sp] = first;
    sp += 1;
    for (let i = sp - 1; i >= 0 && op < pixels; i -= 1) {
      out[op] = stack[i] ?? 0;
      op += 1;
    }
    return first;
  };

  while (op < pixels) {
    const code = read();
    if (code < 0 || code === end) break;
    if (code === clear) {
      codeSize = minCodeSize + 1;
      next = end + 1;
      previous = -1;
      continue;
    }
    if (previous === -1) {
      if (code >= clear) return null;
      emit(code);
      previous = code;
      continue;
    }
    let first: number;
    if (code < next) {
      first = emit(code);
    } else if (code === next) {
      // The KwKwK case: the string is the previous one plus its own first byte.
      first = emit(previous);
      if (op < pixels) {
        out[op] = first;
        op += 1;
      }
    } else {
      return null;
    }
    if (next < 4096) {
      prefix[next] = previous;
      suffix[next] = first;
      next += 1;
      if (next === 1 << codeSize && codeSize < 12) codeSize += 1;
    }
    previous = code;
  }
  return out;
}

/**
 * The frames a GIF's bytes carry, each composited onto the logical screen.
 *
 * **Disposal is applied before the next frame rather than after this one**,
 * which is the reading every browser settled on: `frames[k]` is the screen as it
 * stands while frame k is showing, so the frame's own disposal has not happened
 * yet when it is captured. Method 2 clears the frame's rectangle to transparent
 * — not to the background colour, which the format names and no viewer honours
 * — and method 3 restores the screen from before the frame.
 */
export function decodeGif(bytes: Uint8Array): GifDecoded {
  if (bytes.length < 13 || !isGifSignature(bytes)) { // cells-ok — a byte count
    return { ok: false, fault: "not a GIF — the six-byte signature does not match" };
  }
  const width = u16(bytes, 6);
  const height = u16(bytes, 8);
  if (width < 1 || height < 1) {
    return { ok: false, fault: `logical screen declares ${String(width)}x${String(height)}` };
  }
  const size = { width, height };
  const packed = bytes[10] ?? 0;
  let at = 13; // cells-ok — a byte offset
  let global: Uint8Array | null = null;
  if ((packed & 0x80) !== 0) {
    const n = 3 << ((packed & 7) + 1); // cells-ok — a byte count
    global = bytes.subarray(at, at + n);
    at += n; // cells-ok — a byte offset
  }

  const canvas = new Uint8Array(width * height * 4);
  const frames: Pixels[] = [];
  const delays: number[] = [];
  // The Graphic Control Extension that precedes the next image, if any.
  let control = { disposal: 0, transparent: -1, delay: 0 };
  // What the previous frame asked to happen before the next one is drawn.
  let previous: { left: number; top: number; w: number; h: number; disposal: number; saved: Uint8Array | null } | null = null;

  while (at < bytes.length) { // cells-ok — a byte offset
    const kind = bytes[at] ?? TRAILER;
    at += 1; // cells-ok — a byte offset
    if (kind === TRAILER) break;
    if (kind === EXTENSION) {
      const label = bytes[at] ?? 0;
      at += 1; // cells-ok — a byte offset
      if (label === GRAPHIC_CONTROL) {
        const flags = bytes[at + 1] ?? 0;
        const hundredths = u16(bytes, at + 2);
        const ms = hundredths * 10;
        control = {
          disposal: (flags >> 2) & 7,
          transparent: (flags & 1) !== 0 ? (bytes[at + 4] ?? -1) : -1,
          delay: clampDelay(ms),
        };
      }
      at = skipSubBlocks(bytes, at);
      continue;
    }
    if (kind !== IMAGE) return { ok: false, fault: `unknown block introducer 0x${kind.toString(16)}`, size };

    const left = u16(bytes, at);
    const top = u16(bytes, at + 2);
    const w = u16(bytes, at + 4);
    const h = u16(bytes, at + 6);
    const flags = bytes[at + 8] ?? 0;
    at += 9; // cells-ok — a byte offset
    let table = global;
    if ((flags & 0x80) !== 0) {
      const n = 3 << ((flags & 7) + 1); // cells-ok — a byte count
      table = bytes.subarray(at, at + n);
      at += n; // cells-ok — a byte offset
    }
    if (table === null) return { ok: false, fault: "a frame with no colour table, global or local", size };
    const interlaced = (flags & 0x40) !== 0;
    const minCodeSize = bytes[at] ?? 0;
    at += 1; // cells-ok — a byte offset
    const chunks: Uint8Array[] = [];
    while (at < bytes.length) { // cells-ok — a byte offset
      const n = bytes[at] ?? 0;
      at += 1; // cells-ok — a byte offset
      if (n === 0) break;
      chunks.push(bytes.subarray(at, at + n));
      at += n; // cells-ok — a byte offset
    }
    if (minCodeSize < 2 || minCodeSize > 11) {
      return { ok: false, fault: `LZW minimum code size ${String(minCodeSize)} is outside 2..11`, size };
    }
    const indices = lzw(minCodeSize, Buffer.concat(chunks), w * h);
    if (indices === null) return { ok: false, fault: "LZW stream names a code the table does not hold", size };

    // **The previous frame's disposal, now that the next frame is here.**
    if (previous !== null) {
      if (previous.disposal === 2) {
        for (let y = previous.top; y < Math.min(height, previous.top + previous.h); y += 1) { // cells-ok — a row index
          const row = y * width * 4; // cells-ok — a byte offset
          canvas.fill(0, row + previous.left * 4, row + Math.min(width, previous.left + previous.w) * 4);
        }
      } else if (previous.disposal === 3 && previous.saved !== null) {
        canvas.set(previous.saved);
      }
    }
    const saved = control.disposal === 3 ? canvas.slice() : null;

    const order = interlaced ? interlaceOrder(h) : null;
    for (let row = 0; row < h; row += 1) { // cells-ok — a row index
      const y = top + (order === null ? row : (order[row] ?? row));
      if (y >= height) continue;
      for (let x = 0; x < w; x += 1) { // cells-ok — a column index
        const px = left + x;
        if (px >= width) break;
        const index = indices[row * w + x] ?? 0;
        if (index === control.transparent) continue;
        const d = (y * width + px) * 4; // cells-ok — a byte offset
        const s = index * 3; // cells-ok — a byte offset
        canvas[d] = table[s] ?? 0;
        canvas[d + 1] = table[s + 1] ?? 0;
        canvas[d + 2] = table[s + 2] ?? 0;
        canvas[d + 3] = 255;
      }
    }
    frames.push({ width, height, data: canvas.slice() });
    // A frame with no control block before it has no delay: read as unspecified.
    delays.push(clampDelay(control.delay));
    previous = { left, top, w, h, disposal: control.disposal, saved };
    control = { disposal: 0, transparent: -1, delay: 0 };
  }

  if (frames.length === 0) return { ok: false, fault: "no image descriptor — nothing to decode", size }; // cells-ok — a frame count
  return { ok: true, frames, delays };
}

/** `GIF87a` or `GIF89a` — the sniff the codec's front door uses. */
export function isGifSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false; // cells-ok — a byte count
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  return sig === "GIF87a" || sig === "GIF89a";
}
