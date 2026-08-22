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
 * The transmit-and-create-a-virtual-placement escape.
 *
 * `f=100` is PNG, which is the only format the codec reads; `q=2` suppresses the
 * terminal's reply, for C02's own reason — this framework does not run
 * interactive probes and a response would arrive as input nobody asked for.
 * `U=1` says the placement is addressed by Unicode placeholders rather than
 * drawn at the cursor, which is the whole distinction from iTerm2 and sixel.
 */
export function transmit(id: number, png: string, cols: number, rows: number): string {
  const esc = String.fromCharCode(27);
  const opts = `a=T,f=100,t=d,i=${String(id)},U=1,c=${String(cols)},r=${String(rows)},q=2`;
  return `${esc}_G${opts};${png}${esc}\\`;
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
