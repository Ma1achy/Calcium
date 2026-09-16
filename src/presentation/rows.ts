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
import { cells, soloUnit } from "./text.js";

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
const EMPTY_STATE: readonly Code[] = [];

/** The tokeniser's `getEndCode`, rule for rule. */
function endOf(code: string): string {
  // `38;…` and `48;…` first, from the bytes: the codes a plot row carries a cell (I75).
  if (code.charCodeAt(3) === CC_8 && code.charCodeAt(1) === CC_BRACKET) {
    const c2 = code.charCodeAt(2);
    if (c2 === CC_3) return FG_CLOSE;
    if (c2 === CC_4) return BG_CLOSE;
  }
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

const hasCode = (state: readonly Code[], code: string): boolean => {
  for (let k = 0; k < state.length; k += 1) if ((state[k] as Code).code === code) return true; // cells-ok — a code count
  return false;
};
const hasEnd = (state: readonly Code[], end: string): boolean => {
  for (let k = 0; k < state.length; k += 1) if ((state[k] as Code).end === end) return true; // cells-ok — a code count
  return false;
};

/** Every code ending in `end` removed, the order of the rest kept — `filter` in place. */
function dropEnd(state: Code[], end: string): void {
  let kept = 0;
  for (let k = 0; k < state.length; k += 1) { // cells-ok — a code count
    const held = state[k] as Code;
    if (held.end !== end) {
      state[kept] = held;
      kept += 1;
    }
  }
  state.length = kept; // cells-ok — a code count
}

/**
 * The tokeniser's `reduceAnsiCodesIncremental`, one code at a time, **into the
 * list it is given** (C09 I75): the reset empties it, an end code removes
 * every code it ends, the two intensity codes accumulate, and every other code
 * replaces the one of its kind. The list is the arm's own and is reused across
 * a row; a fresh list per code was an allocation per sequence (F1180).
 */
function apply(state: Code[], c: Code): void {
  if (c.code === SGR_RESET) {
    state.length = 0; // cells-ok — a code count
    return;
  }
  if (END_CODES.has(c.code)) {
    dropEnd(state, c.code);
    return;
  }
  if (isIntensity(c)) {
    if (!hasCode(state, c.code)) state.push(c);
    return;
  }
  dropEnd(state, c.end);
  state.push(c);
}

/** `to` copied over `from` in place — the shown state takes the live one without a new list. */
function copyState(into: Code[], from: readonly Code[]): void {
  into.length = from.length; // cells-ok — a code count
  for (let k = 0; k < from.length; k += 1) into[k] = from[k] as Code; // cells-ok — a code count
}

/**
 * The sequences Ink writes between a character styled `from` and one styled
 * `to` — `diffAnsiCodes`, serialised by `ansiCodesToString`, which joins the
 * distinct codes in first-occurrence order. **Linear scans over two short
 * lists and no `Set`** (C09 I75): the codes not carried into `to` are reduced
 * as `apply` reduces them — into a list made only when there is one — then
 * undone in reverse, each end written once; the codes `to` adds are written
 * in its order. The transition a plot row makes at every cell, one colour
 * replacing another, writes the new code and allocates nothing but the string.
 */
function between(from: readonly Code[], to: readonly Code[]): string {
  let out = "";
  let closing: Code[] | null = null;
  for (let k = 0; k < from.length; k += 1) { // cells-ok — a code count
    const c = from[k] as Code;
    if (isIntensity(c) ? hasCode(to, c.code) : hasEnd(to, c.end)) continue;
    closing ??= [];
    apply(closing, c);
  }
  if (closing !== null) {
    for (let k = closing.length - 1; k >= 0; k -= 1) { // cells-ok — a code count
      const end = (closing[k] as Code).end;
      let written = false;
      for (let m = k + 1; m < closing.length; m += 1) { // cells-ok — a code count
        if ((closing[m] as Code).end === end) {
          written = true;
          break;
        }
      }
      if (!written) out += end;
    }
  }
  for (let k = 0; k < to.length; k += 1) { // cells-ok — a code count
    const c = to[k] as Code;
    if (hasCode(from, c.code)) continue;
    if (closing !== null && hasEnd(closing, c.code)) continue;
    out += c.code;
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

/** The index of the `;` ending the parameter that starts at `from`, or `last` — the `m` — when it is the final one. */
function paramEnd(row: string, from: number, last: number): number {
  for (let k = from; k < last; k += 1) if (row.charCodeAt(k) === CC_SEMI) return k; // cells-ok — code units in a byte scan, not a width
  return last;
}

/** Whether the parameter `[from, to)` is exactly the digits `a` and, when given, `b`. */
function paramIs(row: string, from: number, to: number, a: number, b: number): boolean {
  return b === -1
    ? to - from === 1 && row.charCodeAt(from) === a // cells-ok — code units in a byte scan, not a width
    : to - from === 2 && row.charCodeAt(from) === a && row.charCodeAt(from + 1) === b; // cells-ok — code units in a byte scan, not a width
}

const CC_2 = 0x32;
const CC_3 = 0x33;
const CC_4 = 0x34;
const CC_5 = 0x35;
const CC_8 = 0x38;

/**
 * `splitCompoundSGRSequences`, read in place (C09 I75): the SGR from `at` to
 * `last` applied to `live` one part at a time, `38;5;n` and `48;2;r;g;b` kept
 * whole under `ESC [`, a sequence with one parameter applied as the bytes it
 * is. The parts were an array of strings from a `split`, each `slice`d and
 * `join`ed and `map`ped under the prefix — five arrays a sequence, and a plot
 * row carries a truecolour sequence a cell (F1180).
 */
function applySequence(row: string, at: number, last: number, live: Code[]): void {
  const first = at + 2;
  let end = paramEnd(row, first, last);
  if (end === last) {
    const code = row.slice(at, last + 1);
    apply(live, { code, end: endOf(code) });
    return;
  }
  let from = first;
  for (;;) {
    let to = end;
    // `38`/`48` then `5` then one more: three parts; then `2` then four more: five.
    if (end < last && paramIs(row, from, end, CC_3, CC_8) || end < last && paramIs(row, from, end, CC_4, CC_8)) {
      const next = paramEnd(row, end + 1, last);
      if (paramIs(row, end + 1, next, CC_5, -1) && next < last) {
        to = paramEnd(row, next + 1, last);
      } else if (paramIs(row, end + 1, next, CC_2, -1) && next < last) {
        const e2 = paramEnd(row, next + 1, last);
        if (e2 < last) {
          const e3 = paramEnd(row, e2 + 1, last);
          if (e3 < last) to = paramEnd(row, e3 + 1, last);
        }
      }
    }
    const code = `${CSI}${row.slice(from, to)}m`;
    apply(live, { code, end: endOf(code) });
    if (to >= last) return;
    from = to + 1;
    end = paramEnd(row, from, last);
  }
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
  // **A unit of the rasterised alphabets cannot have joined the `m`** (C09 I74):
  // the row's tail was sliced and segmented after every SGR before a braille
  // or box unit, which is every SGR in a plot row.
  if (Number.isNaN(next) || next < 0x300 || soloUnit(next)) return 0;
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
  // **Confirmed against the row, materialised only on divergence** (F1208).
  // The normal form of a row a renderer already wrote in diff form *is* that
  // row, and on `live:line` that is 59,494 of 82,913 calls — each of which
  // built a second copy of a row it was going to return unchanged. So `op` is
  // how many code units of `row` the output has been confirmed to equal, and
  // `out` stays empty until a piece arrives that `row` does not carry at `op`.
  // Every span appended is a slice of `row` itself, so *the positions agreeing*
  // is the whole comparison for those — only `between`'s built sequence needs
  // its bytes checked.
  let out = "";
  let op = 0; // cells-ok — code units confirmed, not a width
  let diverged = false;
  const live: Code[] = []; // the state after every sequence read so far — one list, reduced in place (I75)
  const shown: Code[] = []; // the state written at the last visible character — copied from `live` at each transition
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
      if (next === CC_CLOSE_BRACKET) {
        const found = osc(row, i);
        if (found !== null) {
          last = found.end;
          if (found.link) {
            const code = row.slice(i, last + 1);
            apply(live, { code, end: endOf(code) });
          }
        }
      } else if (next === CC_BRACKET) {
        last = sgrEnd(row, i);
        if (last !== -1) applySequence(row, i, last, live);
      }
      if (last !== -1) {
        if (diverged) out += row.slice(runStart, i);
        else if (op === runStart) op = i;
        else {
          diverged = true;
          out = row.slice(0, op) + row.slice(runStart, i);
        }
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
      const diff = between(shown, live);
      if (diverged) out += diff;
      else if (row.startsWith(diff, op)) op += diff.length; // cells-ok — code units
      else {
        diverged = true;
        out = row.slice(0, op) + diff;
      }
      copyState(shown, live);
      changed = false;
    }
    seen = true;
    i += 1;
  }

  if (diverged) out += row.slice(runStart);
  else if (op === runStart) op = n;
  else {
    diverged = true;
    out = row.slice(0, op) + row.slice(runStart);
  }
  if (seen) {
    const tail = between(shown, EMPTY_STATE);
    if (diverged) out += tail;
    else if (row.startsWith(tail, op)) op += tail.length; // cells-ok — code units
    else {
      diverged = true;
      out = row.slice(0, op) + tail;
    }
  }
  // Nothing diverged and every code unit is accounted for, so the normal form
  // is the row: `trimEnd` is the only thing left that can change it.
  if (diverged) return out.trimEnd();
  // `out` was never built, and what it would hold is `row`'s first `op` units —
  // `n` of them in every path that reaches here, so the slice is the row.
  return (op === n ? row : row.slice(0, op)).trimEnd();
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
