/**
 * C27 §3 — the cell walk: a buffer's lines as text plus runs.
 *
 * **This file never imports the emulator package** (C27 I11). It takes the
 * structural minimum of the buffer API, so the walk is testable against a hand
 * built buffer and the dependency is confined to one file.
 */
import type { ColourValue, TerminalLine, TerminalRun } from "../viewmodel/types.js";

/** The cell members the walk reads — `IBufferCell`'s shape, structurally. */
export type CellLike = Readonly<{
  getChars(): string;
  getWidth(): number;
  getFgColor(): number;
  getBgColor(): number;
  isFgRGB(): boolean;
  isBgRGB(): boolean;
  isFgPalette(): boolean;
  isBgPalette(): boolean;
  isFgDefault(): boolean;
  isBgDefault(): boolean;
  isBold(): number;
  isDim(): number;
  isItalic(): number;
  isUnderline(): number;
  isInverse(): number;
  isStrikethrough(): number;
}>;

export type LineLike = Readonly<{
  readonly length: number;
  getCell(x: number): CellLike | undefined;
}>;

/**
 * A C0 or C1 control, or an unpaired surrogate.
 *
 * **The second half is not decoration**: a chunk split inside a wide character's
 * bytes can leave a lone surrogate in a cell, and a lone surrogate in a document
 * is a string that cannot be serialised faithfully (C04 T3.79).
 */
const isForbidden = (cp: number): boolean =>
  cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0xd800 && cp <= 0xdfff);

/**
 * The stand-in for a character that cannot be carried.
 *
 * **ASCII, and that is a ruling** (C27 I2). U+FFFD was the obvious choice and
 * SS47 refused it, correctly: a mark the framework draws needs a `Glyph` slot
 * with an ASCII rung, and C27 is L0 with no capabilities in hand to resolve one.
 * A question mark measures 1 cell at every arm, needs no slot, and is what every
 * transcoder puts in the same position.
 */
const UNREPRESENTABLE = "?";

/** C27 I2 — the walk's own gate, ahead of C04's (C04 I110). */
export function containText(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    out += isForbidden(cp) ? UNREPRESENTABLE : ch;
  }
  // A lone surrogate is not iterated as a code point above, so it survives the
  // loop as a code unit; the second pass catches exactly that.
  let safe = "";
  for (let i = 0; i < out.length; i += 1) {
    const unit = out.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = out.charCodeAt(i + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) {
        safe += UNREPRESENTABLE;
        continue;
      }
      safe += out[i] ?? "";
      safe += out[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      safe += UNREPRESENTABLE;
      continue;
    }
    safe += out[i] ?? "";
  }
  return safe;
}

/** A cell's foreground or background as a `ColourValue`, or undefined for the default. */
function colourOf(
  value: number,
  rgb: boolean,
  palette: boolean,
  isDefault: boolean,
): ColourValue | undefined {
  if (isDefault) return undefined;
  if (rgb) return { kind: "rgb", hex: `#${value.toString(16).padStart(6, "0")}` };
  if (palette) return value < 16 ? { kind: "ansi16", index: value } : { kind: "ansi256", index: value };
  return undefined;
}

type Style = Omit<TerminalRun, "from" | "to">;

const styleOf = (cell: CellLike): Style => {
  const fg = colourOf(cell.getFgColor(), cell.isFgRGB(), cell.isFgPalette(), cell.isFgDefault());
  const bg = colourOf(cell.getBgColor(), cell.isBgRGB(), cell.isBgPalette(), cell.isBgDefault());
  return {
    ...(fg === undefined ? {} : { fg }),
    ...(bg === undefined ? {} : { bg }),
    ...(cell.isBold() ? { bold: true } : {}),
    ...(cell.isDim() ? { dim: true } : {}),
    ...(cell.isItalic() ? { italic: true } : {}),
    ...(cell.isUnderline() ? { underline: true } : {}),
    ...(cell.isInverse() ? { inverse: true } : {}),
    ...(cell.isStrikethrough() ? { strike: true } : {}),
  };
};

const plain = (s: Style): boolean => Object.keys(s).length === 0;

const sameColour = (a: ColourValue | undefined, b: ColourValue | undefined): boolean => {
  if (a === undefined || b === undefined) return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind === "rgb" ? a.hex === (b as { hex: string }).hex : (a as { index: number }).index === (b as { index: number }).index;
};

const sameStyle = (a: Style, b: Style): boolean =>
  sameColour(a.fg, b.fg) &&
  sameColour(a.bg, b.bg) &&
  a.bold === b.bold &&
  a.dim === b.dim &&
  a.italic === b.italic &&
  a.underline === b.underline &&
  a.inverse === b.inverse &&
  a.strike === b.strike;

/**
 * One buffer line as text and maximal runs (C27 I5, I6).
 *
 * **Trailing default-styled blanks are trimmed and a styled blank is kept**: a
 * `vim` tilde row and a bar drawn in reverse video are background, and trimming
 * them would lose the only thing on the row.
 */
export function lineOf(line: LineLike): TerminalLine {
  type Piece = Readonly<{ text: string; style: Style }>;
  const pieces: Piece[] = [];
  for (let x = 0; x < line.length; x += 1) {
    const cell = line.getCell(x);
    if (cell === undefined) continue;
    // A wide cluster's second cell has width 0 and no characters: the cluster
    // itself already carries both columns, so the filler contributes nothing
    // (C27 I6). Emitting it would put an empty string in the text.
    if (cell.getWidth() === 0) continue;
    const chars = cell.getChars();
    pieces.push({ text: chars === "" ? " " : chars, style: styleOf(cell) });
  }
  while (pieces.length > 0) {
    const last = pieces[pieces.length - 1];
    if (last === undefined) break;
    if (last.text.trim() !== "" || !plain(last.style)) break;
    pieces.pop();
  }
  let text = "";
  const runs: TerminalRun[] = [];
  for (const piece of pieces) {
    const from = text.length;
    const safe = containText(piece.text);
    text += safe;
    if (plain(piece.style)) continue;
    const open = runs[runs.length - 1];
    if (open !== undefined && open.to === from && sameStyle(open, piece.style)) {
      runs[runs.length - 1] = { ...open, to: text.length };
      continue;
    }
    runs.push({ from, to: text.length, ...piece.style });
  }
  return runs.length === 0 ? { text } : { text, runs };
}
