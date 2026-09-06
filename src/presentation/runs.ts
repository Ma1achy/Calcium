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
import type { TextSpan, Tone, Ramp } from "../data/viewmodel/index.js";
import { stripControl } from "../data/text.js";
import { clusterEnds, placeableClusters, wrapCellsParts, type AmbiguousWidth, type Atom, graphemes } from "./text.js";

/** What a span contributes to a `Style` — and nothing a palette resolves (C10 I33). */
export type SpanAttrs = Readonly<{ bold?: boolean; italic?: boolean; underline?: boolean }>;

/**
 * A run: the text, and the three things a span may say about it.
 *
 * `tone` names a slot and `value` a reading (C04 I89, I90); neither is a
 * colour, and `paintRuns` resolves each through the resolver its owner already
 * has. `value` is the one member the wrapper reads — a valued run is an atom
 * (C09 §5) — which is why it rides on the run and not only on the style.
 */
export type Run = Readonly<{ text: string; attrs?: SpanAttrs; tone?: Tone; value?: number; elide?: true; ramp?: RunRamp }>;

/**
 * A run's place in its ramped span (C09 I51): `at` is the grapheme index of the
 * run's first cluster within the span, `of` the span's cluster count, and
 * `ordinal` the span's position among the member's ramped spans — the unit a
 * `palette` cycles over, because on text the identity is the span (C04 §3am.2).
 * **All three come from the span and never from the run** — a span wrapped
 * across two rows is two runs, and the second continues from where the first
 * stopped.
 */
export type RunRamp = Readonly<{ ramp: Ramp; at: number; of: number; ordinal: number }>;

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

/** A run carrying what its span said — and no member the span did not set. */
function runOf(text: string, span: TextSpan, ordinal: number): Run {
  const attrs = attrsOf(span);
  return {
    text,
    ...(attrs === undefined ? {} : { attrs }),
    ...(span.tone === undefined ? {} : { tone: span.tone }),
    ...(span.value === undefined ? {} : { value: span.value }),
    // A boundary the fitter reads and the painter never does (C04 I105).
    ...(span.elide === true ? { elide: true as const } : {}),
    // The extent is the span's drawn text, counted in clusters (C09 I51).
    ...(span.ramp === undefined ? {} : { ramp: { ramp: span.ramp, at: 0, of: graphemes(text).length, ordinal } }), // cells-ok — a cluster count
  };
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
  let ramped = 0;
  const push = (piece: string, span: TextSpan | undefined): void => {
    const clean = stripControl(piece);
    if (clean === "") return;
    if (span === undefined) {
      out.push({ text: clean });
      return;
    }
    out.push(runOf(clean, span, ramped));
    if (span.ramp !== undefined) ramped += 1;
  };

  for (const span of spans) {
    // Outward: `from` back to its cluster's start, `to` on to its cluster's end.
    const from = Math.max(at, snapDown(Math.min(span.from, text.length), ends)); // cells-ok — offsets
    const to = Math.min(text.length, snapUp(Math.min(span.to, text.length), ends)); // cells-ok — offsets
    if (to <= from) continue;
    push(text.slice(at, from), undefined);
    push(text.slice(from, to), span);
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
export function sliceRuns<T extends Readonly<{ text: string; ramp?: RunRamp }>>(
  runs: readonly T[],
  start: number,
  length: number,
  mode: "cut" | "wrap" = "cut",
): readonly T[] {
  const out: T[] = [];
  let at = 0;

  for (const run of runs) {
    const size = run.text.length; // cells-ok — a code-unit cursor
    const from = Math.max(start, at);
    const to = Math.min(start + length, at + size);
    if (to > from) out.push(rampSliced({ ...run, text: run.text.slice(from - at, to - at) }, run, from - at, to - at, mode));
    at += size;
    if (at >= start + length) break;
  }

  return out;
}

/**
 * A sliced run's place in its ramp (C09 I51). The clusters dropped before the
 * slice advance `at`; a **cut** — truncation — also drops what is after it from
 * `of`, so the extent is what is drawn and the marker takes the last cluster's
 * colour. A **wrap** keeps `of`: the rest of the span is on the next row.
 */
function rampSliced<T extends Readonly<{ text: string; ramp?: RunRamp }>>(
  sliced: T,
  run: T,
  from: number,
  to: number,
  mode: "cut" | "wrap",
): T {
  const ramp = run.ramp;
  if (ramp === undefined) return sliced;
  const before = from === 0 ? 0 : graphemes(run.text.slice(0, from)).length; // cells-ok — a cluster count
  const after = to >= run.text.length || mode === "wrap" ? 0 : graphemes(run.text.slice(to)).length; // cells-ok — a cluster count
  return { ...sliced, ramp: { ramp: ramp.ramp, at: ramp.at + before, of: ramp.of - after, ordinal: ramp.ordinal } };
}

/** The runs, cut at every `\n` — one list per line, as `tokenLines` does for tokens. */
export function runLines(runs: readonly Run[]): readonly (readonly Run[])[] {
  const out: Run[][] = [[]];
  for (const run of runs) {
    run.text.split("\n").forEach((piece, index) => {
      if (index > 0) out.push([]);
      if (piece !== "") {
        out[out.length - 1]?.push({ ...run, text: piece }); // cells-ok — an array index
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
 * then has nothing left to replace. With no valued run, row texts and row
 * count are exactly `wrapCells(stripControl(text), width)`'s.
 *
 * **A valued run is an atom** (C04 I90, C09 §5): its interval over the placed
 * text is handed to the wrapper, which breaks nowhere strictly inside it. The
 * atoms are computed after the substitution, per run, so a `?` standing in for
 * a two-unit cluster moves no other run's offsets. This is the one place a
 * span reaches geometry, and `notice` measures through this function for that
 * reason.
 */
export function wrapRuns(
  runs: readonly Run[],
  width: number,
  ambiguous: AmbiguousWidth = "narrow",
): readonly (readonly Run[])[] {
  const placed = runs.map((run) => ({ ...run, text: placeableClusters(run.text, width) }));
  const text = runsText(placed);
  return wrapCellsParts(text, width, ambiguous, atomsOf(placed)).map((row) =>
    sliceRuns(placed, row.start, row.text.length, "wrap"), // cells-ok — a code-unit length
  );
}

/** The `[from, to)` intervals of the valued runs, over the runs' concatenated text. */
export function atomsOf(runs: readonly Run[]): readonly Atom[] {
  const out: Atom[] = [];
  let at = 0;
  for (const run of runs) {
    const to = at + run.text.length; // cells-ok — a code-unit cursor
    if (run.value !== undefined) out.push({ from: at, to });
    at = to;
  }
  return out;
}
