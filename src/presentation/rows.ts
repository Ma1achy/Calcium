/**
 * A row in the form Ink's output layer writes it (C09 I72).
 *
 * **Why a second implementation of a dependency's serialiser exists.** Every
 * row a kind draws used to go into a `Text`, through a mount, Yoga's measure
 * and `@alcalzone/ansi-tokenize` twice — once to lay the cells, once to read
 * them back — to come out as the same characters with the SGR rewritten into a
 * canonical form: each sequence read into a style state and re-emitted only
 * where the state differs between one visible character and the next, the
 * open state undone after the last, trailing blanks trimmed (F1168). The rows
 * arm keeps the bytes and skips the rest, and keeping the bytes means writing
 * the form down. T1.46 holds this against the tokeniser's own serialiser over
 * the block corpus and ten thousand seeded rows; T2.143 holds the arm against
 * Ink over the corpus rendered both ways; the goldens hold every frame.
 *
 * **The code pairs are `ansi-styles`' table**, which is what the tokeniser
 * reads its end codes from: `1` and `2` close with `22`, `3` with `23`, `4`
 * with `24`, `53` with `55`, `7`/`8`/`9` with `27`/`28`/`29`, every foreground
 * with `39`, every background with `49`, and `0` with itself. A code the table
 * does not know closes with `0` — that is the tokeniser's rule and it is kept,
 * because a row carrying `5` must come out as Ink would have written it, not
 * as a terminal would have preferred.
 *
 * **What is faithfully odd.** An empty `ESC [ m` is a style, not a reset; a
 * hyperlink's closing `ESC ] 8 ; ; BEL` is a style that closes itself; a
 * compound sequence is split into its parts under the `ESC [` prefix whatever
 * escape byte opened it; a combining mark immediately after a sequence's final byte is
 * dropped, because the tokeniser walks graphemes and the mark clustered with
 * the `m`. Each of these is what the frame held before the arm existed, and a
 * normaliser that corrected any of them would move a golden.
 *
 * The one escape byte this file writes is read from `escapes.ts`'s reset, so
 * the table of sequences stays where SS14 puts it.
 */
import { SGR_RESET } from "../terminal/escapes.js";
import { cells } from "./text.js";

/** A code as the tokeniser holds it: the sequence, and the sequence that ends it. */
type Code = Readonly<{ code: string; end: string }>;

const ESC = SGR_RESET.charAt(0);
const CSI = `${ESC}[`;
const OSC = `${ESC}]`;
const BEL = "\x07";
const ST = `${ESC}\\`;
const C1_ST = "\x9c";
const LINK_PREFIX = `${OSC}8;`;
const LINK_END_BEL = `${LINK_PREFIX};${BEL}`;
const LINK_END_ST = `${LINK_PREFIX};${ST}`;
const LINK_END_C1 = `${LINK_PREFIX};${C1_ST}`;
const FG_CLOSE = `${CSI}39m`;
const BG_CLOSE = `${CSI}49m`;
const BOLD = `${CSI}1m`;
const DIM = `${CSI}2m`;

const CC_ESC = 0x1b;
const CC_CSI_8BIT = 0x9b;
const CC_BRACKET = 0x5b; // [
const CC_CLOSE_BRACKET = 0x5d; // ]
const CC_BEL = 0x07;
const CC_C1_ST = 0x9c;
const CC_BACKSLASH = 0x5c;
const CC_M = 0x6d;
const CC_SEMI = 0x3b;
const CC_0 = 0x30;
const CC_9 = 0x39;

/** `ansi-styles`' `codes`: start → end, the table the tokeniser's end codes come from. */
const CLOSE_OF: ReadonlyMap<number, number> = new Map<number, number>([
  [0, 0],
  [1, 22], [2, 22], [3, 23], [4, 24], [53, 55], [7, 27], [8, 28], [9, 29],
  ...[30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97].map((n): [number, number] => [n, 39]),
  ...[40, 41, 42, 43, 44, 45, 46, 47, 100, 101, 102, 103, 104, 105, 106, 107].map((n): [number, number] => [n, 49]),
]);

const END_OF_START: ReadonlyMap<string, string> = new Map(
  [...CLOSE_OF].map(([start, end]) => [`${CSI}${start}m`, `${CSI}${end}m`]),
);
const END_CODES: ReadonlySet<string> = new Set([...CLOSE_OF.values()].map((end) => `${CSI}${end}m`));

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The tokeniser's `getEndCode`, rule for rule. */
function endOf(code: string): string {
  if (END_CODES.has(code)) return code;
  const mapped = END_OF_START.get(code);
  if (mapped !== undefined) return mapped;
  if (code.startsWith(LINK_PREFIX)) {
    if (code.endsWith(ST)) return LINK_END_ST;
    if (code.endsWith(C1_ST)) return LINK_END_C1;
    return LINK_END_BEL;
  }
  const body = code.slice(2);
  if (body.startsWith("38")) return FG_CLOSE;
  if (body.startsWith("48")) return BG_CLOSE;
  const close = CLOSE_OF.get(parseInt(body, 10));
  return close === undefined ? SGR_RESET : `${CSI}${close}m`;
}

const isIntensity = (c: Code): boolean => c.code === BOLD || c.code === DIM;

/** The tokeniser's `reduceAnsiCodesIncremental`, one code at a time, into a fresh list. */
function applied(state: readonly Code[], c: Code): Code[] {
  if (c.code === SGR_RESET) return [];
  if (END_CODES.has(c.code)) return state.filter((held) => held.end !== c.code);
  if (isIntensity(c)) {
    return state.some((held) => held.code === c.code) ? state.slice() : [...state, c];
  }
  const kept = state.filter((held) => held.end !== c.end);
  kept.push(c);
  return kept;
}

/** `undoAnsiCodes`: the state reduced, reversed, each code replaced by its end. */
function undone(codes: readonly Code[]): readonly string[] {
  let state: Code[] = [];
  for (const c of codes) state = applied(state, c);
  return state.reverse().map((c) => c.end);
}

/**
 * The sequences Ink writes between a character styled `from` and one styled
 * `to` — `diffAnsiCodes`, serialised by `ansiCodesToString`, which joins the
 * distinct codes in first-occurrence order.
 */
function between(from: readonly Code[], to: readonly Code[]): string {
  const endsInTo = new Set(to.map((c) => c.end));
  const startsInTo = new Set(to.map((c) => c.code));
  const startsInFrom = new Set(from.map((c) => c.code));
  const closing = undone(
    from.filter((c) => (isIntensity(c) ? !startsInTo.has(c.code) : !endsInTo.has(c.end))),
  );
  const opening = to.filter((c) => !startsInFrom.has(c.code)).map((c) => c.code);
  let out = "";
  const written = new Set<string>();
  for (const code of [...closing, ...opening]) {
    if (written.has(code)) continue;
    written.add(code);
    out += code;
  }
  return out;
}

/** Index of the `m` closing an SGR that opens at `at`, or −1 when the bytes are not one. */
function sgrEnd(row: string, at: number): number {
  for (let i = at + 2; i < row.length; i += 1) { // cells-ok — code units in a byte scan, not a width
    const c = row.charCodeAt(i);
    if (c === CC_M) return i;
    if (c === CC_SEMI || (c >= CC_0 && c <= CC_9)) continue;
    return -1;
  }
  return -1;
}

/** Index of the byte terminating an OSC whose payload starts at `from`, or −1. */
function oscEnd(row: string, from: number): number {
  for (let i = from; i < row.length; i += 1) { // cells-ok — code units in a byte scan, not a width
    const c = row.charCodeAt(i);
    if (c === CC_BEL || c === CC_C1_ST) return i;
    if (c === CC_ESC && i + 1 < row.length && row.charCodeAt(i + 1) === CC_BACKSLASH) return i + 1; // cells-ok — code units in a byte scan, not a width
  }
  return -1;
}

/**
 * The tokeniser's `parseLinkCode`, then `parseOSCSequence`: the index of the
 * sequence's last byte and whether it is a hyperlink (a style) or another
 * control (dropped), or `null` when no terminator follows.
 */
function osc(row: string, at: number): Readonly<{ end: number; link: boolean }> | null {
  if (row.startsWith("8;", at + 2)) {
    const params = row.indexOf(";", at + 4);
    if (params !== -1) {
      const end = oscEnd(row, params + 1);
      if (end !== -1) return { end, link: true };
    }
  }
  const end = oscEnd(row, at + 2);
  return end === -1 ? null : { end, link: false };
}

/** `splitCompoundSGRSequences`: the parts, `38;5;n`/`48;2;r;g;b` kept whole, each under `ESC [`. */
function partsOf(sequence: string): readonly string[] {
  if (!sequence.includes(";")) return [sequence];
  const params = sequence.slice(2, -1).split(";");
  const out: string[] = [];
  for (let i = 0; i < params.length; i += 1) { // cells-ok — code units in a byte scan, not a width
    const p = params[i] as string;
    if ((p === "38" || p === "48") && i + 2 < params.length && params[i + 1] === "5") { // cells-ok — code units in a byte scan, not a width
      out.push(params.slice(i, i + 3).join(";"));
      i += 2;
    } else if ((p === "38" || p === "48") && i + 4 < params.length && params[i + 1] === "2") { // cells-ok — code units in a byte scan, not a width
      out.push(params.slice(i, i + 5).join(";"));
      i += 4;
    } else {
      out.push(p);
    }
  }
  return out.map((p) => `${CSI}${p}m`);
}

/**
 * How many code units after `last` — a sequence's final byte — the tokeniser
 * swallows: a mark that clusters with that byte is inside the grapheme the
 * sequence ended in, and the walk skips every grapheme that starts inside a
 * sequence. Nothing clusters with `\x07` or `\x9c`; only a code point at or
 * above U+0300 can cluster with `m` or `\`, so the segmenter runs for those alone.
 */
function swallowed(row: string, last: number): number {
  const c = row.charCodeAt(last);
  if (c !== CC_M && c !== CC_BACKSLASH) return 0;
  const next = row.charCodeAt(last + 1);
  if (Number.isNaN(next) || next < 0x300) return 0;
  const cluster = GRAPHEMES.segment(row.slice(last)).containing(0);
  return cluster === undefined ? 0 : cluster.segment.length - 1; // cells-ok — code units in a byte scan, not a width
}

/**
 * The row as Ink's output layer would have written it (I72): the same visible
 * characters, the SGR rewritten to the state-diff form, the open state closed
 * after the last, trailing blanks trimmed; an OSC control dropped and a
 * hyperlink kept as a style. `normaliseRow(row)` equals the row `renderToString`
 * yields for a `Text` holding it, byte for byte, which T1.46 and T2.143 hold.
 */
export function normaliseRow(row: string): string {
  let out = "";
  let live: Code[] = []; // the state after every sequence read so far
  let shown: readonly Code[] = []; // the state written at the last visible character
  let changed = false; // a sequence was read since the last visible character
  let seen = false; // a visible character has been written
  let runStart = 0; // where the pending verbatim run begins
  const n = row.length; // cells-ok — code units in a byte scan, not a width
  let i = 0;

  while (i < n) {
    const c = row.charCodeAt(i);
    if (c === CC_ESC || c === CC_CSI_8BIT) {
      const next = row.charCodeAt(i + 1);
      let last = -1;
      let codes: readonly string[] | null = null;
      if (next === CC_CLOSE_BRACKET) {
        const found = osc(row, i);
        if (found !== null) {
          last = found.end;
          codes = found.link ? [row.slice(i, last + 1)] : [];
        }
      } else if (next === CC_BRACKET) {
        last = sgrEnd(row, i);
        if (last !== -1) codes = partsOf(row.slice(i, last + 1));
      }
      if (codes !== null) {
        out += row.slice(runStart, i);
        for (const code of codes) live = applied(live, { code, end: endOf(code) });
        changed = true;
        i = last + 1 + swallowed(row, last);
        runStart = i;
        continue;
      }
    }
    // A visible character — an unparsed escape byte included, as the tokeniser
    // treats it. The state's difference is written once, before the first
    // character that shows it, and the run of characters after it is copied.
    if (changed) {
      out += between(shown, live);
      shown = live;
      changed = false;
    }
    seen = true;
    i += 1;
  }

  out += row.slice(runStart);
  if (seen) out += between(shown, []);
  return out.trimEnd();
}

/**
 * The row with every sequence `normaliseRow` reads removed — SGR, OSC and
 * hyperlink, the swallowed mark with them — so what is left is what Ink's
 * grid holds a cell for (C09 I73).
 */
function visibleOf(row: string): string {
  let out = "";
  let runStart = 0;
  const n = row.length; // cells-ok — code units in a byte scan, not a width
  let i = 0;
  while (i < n) {
    const c = row.charCodeAt(i);
    if (c === CC_ESC || c === CC_CSI_8BIT) {
      const next = row.charCodeAt(i + 1);
      let last = -1;
      if (next === CC_CLOSE_BRACKET) {
        const found = osc(row, i);
        if (found !== null) last = found.end;
      } else if (next === CC_BRACKET) {
        last = sgrEnd(row, i);
      }
      if (last !== -1) {
        out += row.slice(runStart, i);
        i = last + 1 + swallowed(row, last);
        runStart = i;
        continue;
      }
    }
    i += 1;
  }
  return out + row.slice(runStart);
}

/**
 * Where a row ends, measured as Ink's grid measures it: one cell per visible
 * grapheme and two for a wide one, the sequences taking none (C09 I73).
 * **Narrow for the ambiguous**, because Ink reads the width through
 * `string-width`, which is narrow — this is the pinned pair T2.16 holds.
 */
export function rowCells(row: string): number {
  return cells(visibleOf(row)); // narrow-ok — Ink reads a row's width through `string-width`, which is narrow for the ambiguous; this is T2.16's pinned pair (C09 I73)
}

/** A row written at a column of a composed line (C09 I73). */
export type Piece = Readonly<{ x: number; row: string }>;

/**
 * One line of Ink's output grid, from the rows written into it (C09 I73):
 * each piece normalised, placed after a pad of unstyled spaces that runs from
 * where the previous piece ended to this piece's column, and the line
 * normalised again so the transitions across pieces are the ones Ink emits
 * between adjacent characters. Pieces are in column order and do not overlap;
 * `null` when one would, because the grid overwrites and this does not.
 */
export function composeRow(pieces: readonly Piece[]): string | null {
  let out = "";
  let cursor = 0;
  for (const piece of pieces) {
    const row = normaliseRow(piece.row);
    if (row === "") continue;
    if (piece.x < cursor) return null;
    if (piece.x > cursor) out += " ".repeat(piece.x - cursor);
    out += row;
    cursor = piece.x + rowCells(row);
  }
  return normaliseRow(out);
}

/** A block of rows written at a column and a row of the grid (C09 I73). */
export type Placed = Readonly<{ x: number; top: number; width: number; rows: readonly string[] }>;

/**
 * The lines of a grid `height` tall holding every placed block (C09 I73) —
 * `composeRow` per line over the pieces that reach it. `null` when a row is
 * wider than its block's cell or two blocks would overlap on a line, which is
 * where Ink's grid overwrites and clips and this arm declines.
 */
export function placeRows(placed: readonly Placed[], height: number): readonly string[] | null {
  const lines: string[] = [];
  for (let y = 0; y < height; y += 1) { // cells-ok — a row index
    const pieces: Piece[] = [];
    for (const p of placed) {
      const row = p.rows[y - p.top];
      if (row === undefined || row === "") continue;
      if (rowCells(row) > p.width) return null;
      pieces.push({ x: p.x, row });
    }
    const line = composeRow(pieces);
    if (line === null) return null;
    lines.push(line);
  }
  return lines;
}
