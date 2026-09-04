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
 * kitty's row/column encoding, as combining characters — **all 297 of them.**
 *
 * **It shipped as a 40-entry prefix, and the sentence justifying that is true
 * about the axis it names and silent about the other one** (F379). It read:
 * *forty entries cover forty rows and forty columns, which is past any height a
 * transcript block declares.* Correct about **height** — a block declares one,
 * and it is small. The bound also governs **width**, and a block's width is the
 * terminal's: sixty, eighty, a hundred and thirty columns.
 *
 * So `placementRows` refused every image wider than forty cells and the renderer
 * fell back to the dither, silently and by design — the fallback is deliberate
 * and correct, and it fired on everything. **The arm was built, specified,
 * asserted by IK2 and had never drawn a pixel**, because the first image anyone
 * would place is wider than forty cells. MG24's shape (F84): a correct sentence
 * attached to a decision it does not constrain, and review checks whether a
 * justification is true.
 *
 * **Measured in a real kitty**, which is the only thing that could have said so:
 * `imageProtocol` detected as `kitty`, the transmission wired, the placement
 * refused at 60×14, and the frame showed braille. Every probe before it measured
 * this repository's write path rather than a terminal's response to it.
 *
 * **The table is kitty's own**, from `gen/rowcolumn-diacritics.txt`, which
 * records its own derivation: `UnicodeData.txt` for Unicode 6.0.0, combining
 * class 230, less the nineteen common accents. **Not derivable** — combining
 * class 230 alone gives 510 code points and a different order, so the exclusions
 * are a curation and guessing them would place a diacritic that addresses the
 * wrong part of the image. The forty already here are this list's exact prefix,
 * which is what confirms the truncation was a truncation.
 */
const DIACRITICS: readonly number[] = Object.freeze([
  0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f, 0x0346, 0x034a,
  0x034b, 0x034c, 0x0350, 0x0351, 0x0352, 0x0357, 0x035b, 0x0363, 0x0364, 0x0365,
  0x0366, 0x0367, 0x0368, 0x0369, 0x036a, 0x036b, 0x036c, 0x036d, 0x036e, 0x036f,
  0x0483, 0x0484, 0x0485, 0x0486, 0x0487, 0x0592, 0x0593, 0x0594, 0x0595, 0x0597,
  0x0598, 0x0599, 0x059c, 0x059d, 0x059e, 0x059f, 0x05a0, 0x05a1, 0x05a8, 0x05a9,
  0x05ab, 0x05ac, 0x05af, 0x05c4, 0x0610, 0x0611, 0x0612, 0x0613, 0x0614, 0x0615,
  0x0616, 0x0617, 0x0657, 0x0658, 0x0659, 0x065a, 0x065b, 0x065d, 0x065e, 0x06d6,
  0x06d7, 0x06d8, 0x06d9, 0x06da, 0x06db, 0x06dc, 0x06df, 0x06e0, 0x06e1, 0x06e2,
  0x06e4, 0x06e7, 0x06e8, 0x06eb, 0x06ec, 0x0730, 0x0732, 0x0733, 0x0735, 0x0736,
  0x073a, 0x073d, 0x073f, 0x0740, 0x0741, 0x0743, 0x0745, 0x0747, 0x0749, 0x074a,
  0x07eb, 0x07ec, 0x07ed, 0x07ee, 0x07ef, 0x07f0, 0x07f1, 0x07f3, 0x0816, 0x0817,
  0x0818, 0x0819, 0x081b, 0x081c, 0x081d, 0x081e, 0x081f, 0x0820, 0x0821, 0x0822,
  0x0823, 0x0825, 0x0826, 0x0827, 0x0829, 0x082a, 0x082b, 0x082c, 0x082d, 0x0951,
  0x0953, 0x0954, 0x0f82, 0x0f83, 0x0f86, 0x0f87, 0x135d, 0x135e, 0x135f, 0x17dd,
  0x193a, 0x1a17, 0x1a75, 0x1a76, 0x1a77, 0x1a78, 0x1a79, 0x1a7a, 0x1a7b, 0x1a7c,
  0x1b6b, 0x1b6d, 0x1b6e, 0x1b6f, 0x1b70, 0x1b71, 0x1b72, 0x1b73, 0x1cd0, 0x1cd1,
  0x1cd2, 0x1cda, 0x1cdb, 0x1ce0, 0x1dc0, 0x1dc1, 0x1dc3, 0x1dc4, 0x1dc5, 0x1dc6,
  0x1dc7, 0x1dc8, 0x1dc9, 0x1dcb, 0x1dcc, 0x1dd1, 0x1dd2, 0x1dd3, 0x1dd4, 0x1dd5,
  0x1dd6, 0x1dd7, 0x1dd8, 0x1dd9, 0x1dda, 0x1ddb, 0x1ddc, 0x1ddd, 0x1dde, 0x1ddf,
  0x1de0, 0x1de1, 0x1de2, 0x1de3, 0x1de4, 0x1de5, 0x1de6, 0x1dfe, 0x20d0, 0x20d1,
  0x20d4, 0x20d5, 0x20d6, 0x20d7, 0x20db, 0x20dc, 0x20e1, 0x20e7, 0x20e9, 0x20f0,
  0x2cef, 0x2cf0, 0x2cf1, 0x2de0, 0x2de1, 0x2de2, 0x2de3, 0x2de4, 0x2de5, 0x2de6,
  0x2de7, 0x2de8, 0x2de9, 0x2dea, 0x2deb, 0x2dec, 0x2ded, 0x2dee, 0x2def, 0x2df0,
  0x2df1, 0x2df2, 0x2df3, 0x2df4, 0x2df5, 0x2df6, 0x2df7, 0x2df8, 0x2df9, 0x2dfa,
  0x2dfb, 0x2dfc, 0x2dfd, 0x2dfe, 0x2dff, 0xa66f, 0xa67c, 0xa67d, 0xa6f0, 0xa6f1,
  0xa8e0, 0xa8e1, 0xa8e2, 0xa8e3, 0xa8e4, 0xa8e5, 0xa8e6, 0xa8e7, 0xa8e8, 0xa8e9,
  0xa8ea, 0xa8eb, 0xa8ec, 0xa8ed, 0xa8ee, 0xa8ef, 0xa8f0, 0xa8f1, 0xaab0, 0xaab2,
  0xaab3, 0xaab7, 0xaab8, 0xaabe, 0xaabf, 0xaac1, 0xfe20, 0xfe21, 0xfe22, 0xfe23,
  0xfe24, 0xfe25, 0xfe26, 0x10a0f, 0x10a38, 0x1d185, 0x1d186, 0x1d187, 0x1d188, 0x1d189,
  0x1d1aa, 0x1d1ab, 0x1d1ac, 0x1d1ad, 0x1d242, 0x1d243, 0x1d244
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
  // `ESC_G` (**3**) + `,m=1` (4) + `;` (1) + `ESC\\` (2) = 10.
  //
  // **This said `ESC_G` (2) and reserved 9, and the sentence beside it named the
  // exact failure that causes** (F381): *a reserve one byte short puts every
  // first chunk at 4097, which is over a limit written down four lines above
  // it.* Measured: 4097. `ESC_G` is three characters — escape, underscore, G —
  // and the count that carries the arithmetic dropped the escape itself.
  //
  // **It was invisible until the alignment below was fixed**, because a
  // transmission that never decoded drew nothing for a different reason. Two
  // defects in six lines, the second masking the first.
  //
  // **Rounded down to a multiple of four, and this is what made the arm draw**
  // (F381). kitty decodes the base64 **per chunk** rather than concatenating
  // first, so a chunk whose length is not a multiple of 4 corrupts everything
  // after it. The reserve above gives 4042 bytes, which is not — so a payload
  // that fitted one escape drew, and a payload needing two drew **nothing**.
  //
  // Measured in a real kitty by bisecting the raster: one chunk drew, two chunks
  // drew nothing, and the escape was well-formed under every reading available
  // in this repository — 9 chunks, `m=1` through `m=0`, the right box. No
  // assertion here can see it, because the corruption is inside a base64 body
  // the terminal is the only reader of.
  const room = Math.max(4, Math.floor((CHUNK - opts.length - 10) / 4) * 4); // cells-ok — a byte count
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
 * An animated image, **uploaded once and animated by the terminal** (C09 I39).
 *
 * **The roadmap priced the wrong design.** It said *every tick is an image
 * upload where the orbit's tick is a text frame*, which is true of retransmitting
 * a frame at a stable id on every wake — measured 2026-09-04 through this file's
 * own `transmitRgba`: **75 bytes a tick for an 8x8 and 29,662 for a 320x240
 * gradient, 297 KB/s at 10 fps**, for as long as the image is on screen. kitty's
 * animation protocol makes that zero: frame 0 goes as the placement's own
 * transmission, every later frame as `a=f` with its gap in `z`, and one `a=a`
 * starts the loop — **116,509 bytes once** for the same four-frame 320x240,
 * against 296,620 every second. The session's wake is **not armed** for an
 * image on this arm, because nothing here has anything to advance.
 *
 * **Raw pixels, for `transmitRgba`'s reason**: the frames are composited RGBA
 * already and a terminal reads no GIF, so the choice is a PNG encoder or `f=32`,
 * and `f=32` with `o=z` costs nothing this file does not already pay.
 *
 * **Two protocol readings are unmeasured here and stated** (§4c's plane-16
 * class): that `v=1` on `a=a` loops for ever, and that a terminal without the
 * animation extension ignores `a=f` and `a=a` and keeps frame 0 — which is the
 * still the other ruling would have drawn on purpose, so the degradation is the
 * alternative rather than a failure. `q=2` suppresses the reply either way.
 */
export function transmitAnimation(
  id: number,
  frames: readonly Pixels[],
  delays: readonly number[],
  cols: number,
  rows: number,
): string {
  const esc = String.fromCharCode(27);
  const first = frames[0];
  if (first === undefined) return "";
  let out = transmitRgba(id, first, cols, rows);
  for (let k = 1; k < frames.length; k += 1) { // cells-ok — a frame count
    const px = frames[k];
    if (px === undefined) continue;
    const z = deflateSync(Buffer.from(px.data));
    const opts =
      `a=f,i=${String(id)},f=32,o=z,s=${String(px.width)},v=${String(px.height)},` +
      `z=${String(Math.max(1, Math.round(delays[k] ?? 0)))},q=2`;
    out += chunked(opts, z.toString("base64"));
  }
  // The root frame's gap is set by editing frame 1, then the loop is started.
  out += `${esc}_Ga=a,i=${String(id)},r=1,z=${String(Math.max(1, Math.round(delays[0] ?? 0)))},q=2${esc}\\`;
  out += `${esc}_Ga=a,i=${String(id)},s=3,v=1,q=2${esc}\\`;
  return out;
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
