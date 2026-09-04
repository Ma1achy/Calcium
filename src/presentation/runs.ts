/**
 * Runs — the styled pieces a renderer builds from a text member and its spans
 * (C04 §3am, I83–I88; C09).
 *
 * **A `TextSpan` is an input in code units; a run is what the renderer paints.**
 * `runsOf` turns `(text, spans)` into pieces that concatenate to the text, with
 * the three attributes a span may carry on the pieces it covers. Everything
 * after that — wrapping, truncating, painting — works on runs and never looks
 * at an offset again, which is what keeps one arithmetic in one place.
 *
 * **The slicer is the one `code` already had.** `sliceTokens` sliced a token
 * stream by code-unit offset against rows that are exact slices of the source;
 * `sliceRuns` is that function over any `{ text }` and `sliceTokens` now calls
 * it, so a span and a syntax token are cut by the same arithmetic (C04 I84).
 *
 * **Order of operations, and it is the whole of the control-character ruling.**
 * Offsets address the text *as written*; `stripControl` deletes characters and
 * would shift every offset after one. So the text is cut into runs first, by the
 * offsets, and each run is stripped on its own — a deletion inside one run moves
 * nothing outside it, and the runs still concatenate to `stripControl(text)`,
 * which is what the measurer wrapped (C09 I1).
 */
import type { TextSpan } from "../data/viewmodel/index.js";
import { stripControl } from "../data/text.js";
import { clusterEnds, placeableClusters, wrapCellsParts, type AmbiguousWidth } from "./text.js";

/** What a span contributes to a `Style` — and nothing a palette resolves (C10 I33). */
export type SpanAttrs = Readonly<{ bold?: boolean; italic?: boolean; underline?: boolean }>;

export type Run = Readonly<{ text: string; attrs?: SpanAttrs }>;

/**
 * A boundary that falls inside a grapheme cluster is moved to the cluster's end
 * (C04 I84). Painting SGR between a base and its combining mark, or between the
 * members of a ZWJ sequence, changes what the terminal composes, and a changed
 * composition is a changed width. Moving the boundary one cluster along keeps
 * the cluster whole, and nothing measured moves.
 */
function snapUp(offset: number, ends: readonly number[]): number {
  if (ends.length === 0) return offset; // cells-ok — an array count
  for (const end of ends) {
    if (end >= offset) return end;
  }
  return ends[ends.length - 1] ?? offset; // cells-ok — an array index
}

/** The other direction: a `from` inside a cluster moves back to where the cluster begins. */
function snapDown(offset: number, ends: readonly number[]): number {
  if (ends.length === 0) return offset; // cells-ok — an array count
  let at = 0;
  for (const end of ends) {
    if (end > offset) return at;
    at = end;
  }
  return at;
}

function attrsOf(span: TextSpan): SpanAttrs | undefined {
  const attrs: { bold?: boolean; italic?: boolean; underline?: boolean } = {};
  if (span.bold === true) attrs.bold = true;
  if (span.italic === true) attrs.italic = true;
  if (span.underline === true) attrs.underline = true;
  return Object.keys(attrs).length === 0 ? undefined : attrs; // cells-ok — a key count
}

/**
 * `(text, spans)` as runs that concatenate to `stripControl(text)`.
 *
 * Total over any input the gate accepted: spans are clamped to the text, a span
 * whose snapped boundaries meet is dropped, and one that would overlap the run
 * before it after snapping starts where that run ends.
 */
export function runsOf(text: string, spans: readonly TextSpan[] | undefined): readonly Run[] {
  if (spans === undefined || spans.length === 0) { // cells-ok — an array count
    const clean = stripControl(text);
    return clean === "" ? [] : [{ text: clean }];
  }

  const ends = clusterEnds(text);
  const out: Run[] = [];
  let at = 0;
  const push = (piece: string, attrs: SpanAttrs | undefined): void => {
    const clean = stripControl(piece);
    if (clean === "") return;
    out.push(attrs === undefined ? { text: clean } : { text: clean, attrs });
  };

  for (const span of spans) {
    // Outward: `from` back to its cluster's start, `to` on to its cluster's end.
    const from = Math.max(at, snapDown(Math.min(span.from, text.length), ends)); // cells-ok — offsets
    const to = Math.min(text.length, snapUp(Math.min(span.to, text.length), ends)); // cells-ok — offsets
    if (to <= from) continue;
    push(text.slice(at, from), undefined);
    push(text.slice(from, to), attrsOf(span));
    at = to;
  }
  push(text.slice(at), undefined);
  return out;
}

/** The runs, joined — `stripControl(text)` by construction. */
export function runsText(runs: readonly Run[]): string {
  let out = "";
  for (const run of runs) out += run.text;
  return out;
}

/**
 * The pieces covering `[start, start + length)` of the runs' text, in order.
 *
 * Generic over anything carrying a `text`, so a syntax token and a span run are
 * cut by one arithmetic; the other members ride along unchanged.
 */
export function sliceRuns<T extends Readonly<{ text: string }>>(
  runs: readonly T[],
  start: number,
  length: number,
): readonly T[] {
  const out: T[] = [];
  let at = 0;

  for (const run of runs) {
    const size = run.text.length; // cells-ok — a code-unit cursor
    const from = Math.max(start, at);
    const to = Math.min(start + length, at + size);
    if (to > from) out.push({ ...run, text: run.text.slice(from - at, to - at) });
    at += size;
    if (at >= start + length) break;
  }

  return out;
}

/** The runs, cut at every `\n` — one list per line, as `tokenLines` does for tokens. */
export function runLines(runs: readonly Run[]): readonly (readonly Run[])[] {
  const out: Run[][] = [[]];
  for (const run of runs) {
    run.text.split("\n").forEach((piece, index) => {
      if (index > 0) out.push([]);
      if (piece !== "") {
        out[out.length - 1]?.push(run.attrs === undefined ? { text: piece } : { text: piece, attrs: run.attrs }); // cells-ok — an array index
      }
    });
  }
  return out;
}

/**
 * The runs wrapped to `width`, each row's runs sliced by the row's source
 * `start` (C04 I86).
 *
 * The unfittable-cluster substitution is applied to the runs **before** the
 * wrap, so that every row `wrapCellsParts` returns is an exact slice of the
 * text it was given and the offsets line up; the wrapper's own substitution
 * then has nothing left to replace. Row texts and row count are exactly
 * `wrapCells(stripControl(text), width)`'s, which is what the measurer counted.
 */
export function wrapRuns(
  runs: readonly Run[],
  width: number,
  ambiguous: AmbiguousWidth = "narrow",
): readonly (readonly Run[])[] {
  const placed = runs.map((run) => ({ ...run, text: placeableClusters(run.text, width) }));
  const text = runsText(placed);
  return wrapCellsParts(text, width, ambiguous).map((row) =>
    sliceRuns(placed, row.start, row.text.length), // cells-ok — a code-unit length
  );
}
