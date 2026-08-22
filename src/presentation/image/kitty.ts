/**
 * The kitty arm — transmit once by digest, place with Unicode placeholders
 * (C09 I36, C04 I73).
 *
 * **The text stream owns the layout and the image follows it.** A placeholder is
 * an ordinary character carrying its own row and column as combining diacritics,
 * so the grid still knows where everything is: the image scrolls because the text
 * does, it can sit inside a bordered block, and the row count is the block's
 * rather than the image's.
 *
 * **Transmission rides with placement, and that is a ruling rather than a
 * shortcut.** `a=T` at a stable id **replaces** the image at that id, so emitting
 * it on every render is idempotent — and Ink writes nothing when nothing changes
 * (F248), so the payload goes out when the frame moves and not on a timer. A
 * session-level once-per-digest set is an *optimisation* on top of that, not a
 * correctness requirement, which is why phase 1 does not owe a seam for it.
 *
 * **The failure this shape avoids is the one that is hard to notice**: placement
 * without transmission draws nothing at all, and a reader would blame the image.
 */
import { deflateSync } from "node:zlib";
import { digestOf } from "../../data/viewmodel/digest.js";
import type { Image } from "../../data/viewmodel/types.js";
import type { Pixels } from "./codec.js";

/** The placeholder. One cell wide by `cells()` and by Ink's layout (F247). */
export const PLACEHOLDER = String.fromCodePoint(0x10eeee);

/**
 * kitty's row/column encoding, as combining characters.
 *
 * **A prefix of the standard table, and the bound is stated rather than left to
 * overflow.** Forty entries cover forty rows and forty columns, which is past any
 * height a transcript block declares; beyond it `placementRows` refuses rather
 * than wrapping, because a wrapped diacritic addresses the *wrong part of the
 * image* and draws a plausible wrong picture instead of an error.
 */
const DIACRITICS: readonly number[] = Object.freeze([
  0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f, 0x0346, 0x034a,
  0x034b, 0x034c, 0x0350, 0x0351, 0x0352, 0x0357, 0x035b, 0x0363, 0x0364, 0x0365,
  0x0366, 0x0367, 0x0368, 0x0369, 0x036a, 0x036b, 0x036c, 0x036d, 0x036e, 0x036f,
  0x0483, 0x0484, 0x0485, 0x0486, 0x0487, 0x0592, 0x0593, 0x0594, 0x0595, 0x0597,
]);

export const MAX_PLACEHOLDER_SPAN = DIACRITICS.length; // cells-ok — a diacritic count

/**
 * A 24-bit image id derived from the block's digest (C04 I73 §3g.2).
 *
 * **Derived rather than allocated, which is what makes duplication free**: two
 * blocks holding one image agree on the id without anything holding a table, so
 * the second transmission replaces the first with identical bytes.
 *
 * **The collision case is worth naming because its failure is the quiet one.**
 * The space is 24 bits here — the foreground colour carries the id and a third
 * diacritic for the high byte is not used — so two *different* images whose
 * digests collide in 24 bits would place one and draw the other. **The failure is
 * the wrong image drawn rather than nothing drawn**, which is the harder one to
 * notice: nothing drawn sends a reader to the image, and the wrong one sends them
 * nowhere. At 2^24 it is unlikely rather than impossible, and the expiry is the
 * third diacritic, which widens this to 32 bits.
 */
export function imageId(digest: string): number {
  let h = 0;
  for (const ch of digest) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0; // cells-ok — a hash accumulator
  // Never 0: kitty treats id 0 as "unspecified" and would allocate its own.
  return (h % 0xff_ff_fe) + 1; // cells-ok — a 24-bit id
}

/**
 * **The picture's identity, which is not the image's** (C04 I74).
 *
 * `digest` is the *data's* — that is what §3g.2 specifies and what the decode
 * memo needs, since two blocks holding one image should decode once. **An
 * overlay makes the transmitted picture a function of two things**, and keying
 * on the data alone is a measured defect rather than an inefficiency: two blocks
 * of one image with different overlays share a digest, the second is found in
 * the sent set, nothing is transmitted, and **both placements draw the first
 * block's overlay**. That is the wrong picture rather than no picture, which is
 * the failure this whole arm is built to avoid.
 *
 * One function and two callers — the renderer's id and the shell's sent set —
 * because two computations of one figure is how they would come to disagree.
 */
export function imageKey(block: Image): string {
  return block.overlay === undefined
    ? block.digest
    : digestOf(`${block.digest}\u0000${JSON.stringify(block.overlay)}`);
}

/** The largest escape kitty accepts for a direct transmission, in bytes. */
const CHUNK = 4096; // cells-ok — a byte count

/**
 * A transmission, **chunked**, because one escape has a length limit.
 *
 * **Found by building the composited arm and true of the arm that shipped.**
 * Direct transmission (`t=d`) caps an escape at 4096 bytes, and the payload
 * continues in further escapes carrying `m=1` until a final `m=0`. Phase 1
 * emitted one escape with the whole payload, which is correct for the 70-byte
 * corpus fixture and wrong for every real image — and the failure is *nothing
 * drawn*, which no in-repo test can see because no in-repo test has a terminal.
 *
 * **A protocol claim, in the plane-16 class** (C09 §4c): it is not measurable
 * here and the first real-terminal test is where it is checked. The chunked form
 * is correct under both readings, which is why it is taken now — an unchunked
 * escape is wrong if the limit is real and merely verbose if it is not.
 */
function chunked(opts: string, body: string): string {
  const esc = String.fromCharCode(27);
  // The options ride on the first escape only; continuations carry `m` alone,
  // which is the format's rule and the reason `m=1` cannot be folded into
  // `opts` for the single-chunk case.
  // `ESC_G` (2) + `,m=1` (4) + `;` (1) + `ESC\\` (2). Counted rather than
  // rounded: a reserve one byte short puts every first chunk at 4097, which is
  // over a limit written down four lines above it.
  const room = Math.max(1, CHUNK - opts.length - 9); // cells-ok — a byte count
  const parts: string[] = [];
  for (let i = 0; i < body.length; i += room) parts.push(body.slice(i, i + room)); // cells-ok — a byte index
  if (parts.length === 0) parts.push(""); // cells-ok — a chunk count
  let out = "";
  for (const [i, part] of parts.entries()) {
    const more = i < parts.length - 1 ? 1 : 0; // cells-ok — a flag
    const head = i === 0 ? `${opts},m=${String(more)}` : `m=${String(more)}`;
    out += `${esc}_G${head};${part}${esc}\\`;
  }
  return out;
}

/**
 * The transmit-and-create-a-virtual-placement escape.
 *
 * `f=100` is PNG, which is the only format the codec reads; `q=2` suppresses the
 * terminal's reply, for C02's own reason — this framework does not run
 * interactive probes and a response would arrive as input nobody asked for.
 * `U=1` says the placement is addressed by Unicode placeholders rather than
 * drawn at the cursor, which is the whole distinction from iTerm2 and sixel.
 */
export function transmit(id: number, png: string, cols: number, rows: number): string {
  const opts = `a=T,f=100,t=d,i=${String(id)},U=1,c=${String(cols)},r=${String(rows)},q=2`;
  return chunked(opts, png);
}

/**
 * The same placement from **raw pixels**, which is what an overlay forces.
 *
 * **Raw rather than a re-encoded PNG, and that is a ruling.** Compositing
 * happens after the decode, so the bytes on hand are RGBA; emitting a PNG would
 * mean writing an encoder — a compressor, five filter heuristics and a CRC — to
 * hand the terminal something it will immediately decompress. `f=32` with
 * `s`/`v` is the format's own answer, and `o=z` puts the bytes through the
 * `node:zlib` the codec already depends on, so this costs no dependency row.
 *
 * **The cost is stated**: raw RGBA deflates worse than a PNG of the same picture,
 * because a PNG filters before it deflates. This arm is `kitty`'s and `kitty` is
 * a local terminal, so the bytes are a pipe write rather than a network one.
 */
export function transmitRgba(id: number, px: Pixels, cols: number, rows: number): string {
  const z = deflateSync(Buffer.from(px.data));
  const opts =
    `a=T,f=32,t=d,o=z,s=${String(px.width)},v=${String(px.height)},` +
    `i=${String(id)},U=1,c=${String(cols)},r=${String(rows)},q=2`;
  return chunked(opts, z.toString("base64"));
}

/**
 * One placeholder cell: the character, its row, its column, and the id in the
 * foreground colour.
 *
 * **The id travels as a colour because the cell has nowhere else to put it.**
 * The two diacritics are spent on position, so the terminal reads the image from
 * the 24-bit foreground — which is why this arm needs no palette from C10 and
 * why C10 owns no part of it.
 */
export function placeholderCell(id: number, row: number, col: number): string {
  const esc = String.fromCharCode(27);
  const r = (id >> 16) & 0xff; // cells-ok — a colour byte
  const g = (id >> 8) & 0xff; // cells-ok — a colour byte
  const b = id & 0xff; // cells-ok — a colour byte
  const mark =
    PLACEHOLDER +
    String.fromCodePoint(DIACRITICS[row] ?? 0x0305) +
    String.fromCodePoint(DIACRITICS[col] ?? 0x0305);
  return `${esc}[38;2;${String(r)};${String(g)};${String(b)}m${mark}${esc}[39m`;
}

export type Placement = Readonly<{ rows: readonly string[] }> | Readonly<{ fault: string }>;

/**
 * The grid of placeholders a block of `rows` x `cols` occupies.
 *
 * **Refused past the table rather than wrapped**, because a wrapped diacritic is
 * a cell that addresses the wrong part of the image — a plausible wrong picture,
 * which is the failure mode this arm is built to avoid.
 */
export function placementRows(id: number, cols: number, rows: number): Placement {
  if (cols < 1 || rows < 1) return { fault: `a placement is at least 1x1 — got ${String(cols)}x${String(rows)}` };
  if (cols > MAX_PLACEHOLDER_SPAN || rows > MAX_PLACEHOLDER_SPAN) {
    return {
      fault:
        `a placement of ${String(cols)}x${String(rows)} exceeds the ${String(MAX_PLACEHOLDER_SPAN)} ` +
        `positions this encoding carries — a wrapped diacritic addresses the wrong part of the image`,
    };
  }
  const out: string[] = [];
  for (let r = 0; r < rows; r += 1) { // cells-ok — a row index
    let line = "";
    for (let c = 0; c < cols; c += 1) line += placeholderCell(id, r, c); // cells-ok — a column index
    out.push(line);
  }
  return { rows: Object.freeze(out) };
}

/** Base64 for the transmit payload. The bytes are the block's, unchanged. */
export function payload(png: Uint8Array): string {
  return Buffer.from(png).toString("base64");
}

/** Unused today and named so the codec's `Pixels` type stays reachable from here. */
export type KittySource = Pixels;
