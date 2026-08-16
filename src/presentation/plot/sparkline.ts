/**
 * `sparkline` — one row of ramp glyphs (C12 §2, A01 A.2).
 *
 * **This is the export C11 calls**, and the reason it is a function rather than a
 * block: `Cell.spark` puts a series inside a table cell, a cell is not a block,
 * and reaching it through C09's registry would drag block dispatch into a cell.
 * So values and a width in, one row of glyphs out — same layer, acyclic, no
 * registry, no `ctx`. C12's own `form: "sparkline"` renderer calls this too, so
 * `b.spark(…)` and a `spark` column produce the same glyphs.
 *
 * **A sparkline is not braille.** One ramp glyph per sample, one sample per cell.
 * There is no subcell resolution to spend, which is why eight samples need eight
 * cells and no fewer — the fact whose absence let a five-sample sparkline be
 * drawn inside a twelve-cell table cell in three separate surface specs.
 */
import { cells } from "../text.js";
import { ladderFor, RAMP_STEPS } from "./ramp.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/**
 * The cell a position with no reading draws (I4, C12 §4).
 *
 * **A marker rather than a blank, and the row is right-anchored is why.** A
 * leading blank already means *fewer samples than cells*; a blank at a gap would
 * mean *a sample that is missing*. One character, two meanings — and the case is
 * ordinary rather than exotic, because a stalled fetch is bursty and a gap at
 * the window's left edge is where it lands. `ratatui` reached the same finding
 * from the other side and its sentence is the one to keep: **a missing sample is
 * not a zero.**
 *
 * **ASCII in every ramp, and that is a measurement.** It must be one cell under
 * both width conventions and collide with no step of `▁▂▃▄▅▆▇█`, `.:-=+*#@` or
 * the braille ramp `ladderFor` returns at `wide`. `·` `∅` `⋮` `◌` are all
 * `East_Asian_Width=Ambiguous`, and `text.ts`'s table deliberately covers only
 * *the part that is drawn as geometry* — so `cells()` calls them one cell at
 * `wide` by a documented ruling, and choosing one would be wrong on a CJK
 * terminal or force a range that table's own test excludes.
 *
 * **Absence has no tier because it is not a magnitude.** The same character
 * whichever ramp is in use, which is also what makes a `spark` column read the
 * same on both terminals.
 */
const ABSENT = "?";

/**
 * The two things a row draws that its caller decides.
 *
 * **Both are the same question asked twice — what is a cell of *this* thing?**
 * A sparkline cell is a column of a vertical axis, so its ramp fills bottom-up
 * and its absence is a marker, because a blank there is already the padding. A
 * grid cell has neither: the ramp spreads and absence is blank (C12 I17, §3a).
 * Passing them rather than branching on a form keeps the two decisions where the
 * argument for them is.
 */
export type RowStyle = Readonly<{ ramp: string | null; absent: string }>;

/**
 * One row of ramp glyphs against **a range supplied from outside**.
 *
 * The shared internal §2 promises: `sparkline` computes a range over its own
 * window and calls this, and the heatmap passes the range of the whole matrix —
 * which is the only difference between a matrix and a stack of unrelated
 * sparklines, and the reason it is a parameter rather than a computation.
 *
 * **It does not special-case an empty window, and `sparkline` does.** A series
 * with no readings is *empty* to a block — the line form draws the empty message
 * — but a **row** of a matrix with no readings is a container that reported
 * nothing, which is a row of markers and not a row of blanks (§6a A3). One
 * function cannot hold both meanings, so the guard stays with the caller that
 * has one.
 */
export function rampRow(
  values: readonly (number | null)[],
  width: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  range: Readonly<{ min: number; max: number }>,
  style: RowStyle = { ramp: null, absent: ABSENT },
): string {
  const w = Math.max(0, Math.floor(width));
  if (w === 0) return "";

  const window = values.slice(Math.max(0, values.length - w)); // cells-ok — a position count
  // **The axis, not a ramp** (I21). A sparkline cell is a column of a vertical
  // axis, so `height` is what it draws and what it asks for.
  const ramp = [...(style.ramp ?? ladderFor("height", caps).steps)];
  const middle = Math.floor((RAMP_STEPS - 1) / 2);

  const glyph = (v: number | null): string => {
    if (v === null || !Number.isFinite(v)) return style.absent;
    if (range.max === range.min) return ramp[middle] ?? " ";
    // Clamped rather than dropped, for `rowOf`'s reason: a pinned range exists
    // so two plots can be compared, and a value above the ceiling belongs
    // pressed against it rather than in a hole.
    const t = (v - range.min) / (range.max - range.min);
    const step = Math.round((t < 0 ? 0 : t > 1 ? 1 : t) * (RAMP_STEPS - 1));
    return ramp[step] ?? " ";
  };

  const drawn = window.map(glyph).join("");
  return " ".repeat(Math.max(0, w - cells(drawn, caps.ambiguousWidth))) + drawn;
}

/**
 * The last `width` values as one row of exactly `width` cells (I13).
 *
 * **`width` is the window, and 8 is not a constant.** A01 A.2 says "the last 8
 * points", which is the instance where the width is 8 — C11's `spark` column
 * declares a minimum of 8 with no flex, but a planner distributing residual can
 * make it wider, so 8 is a floor rather than an assumption.
 *
 * **Normalised over the window it shows**, not over the whole series: a range
 * pinned on a block cannot reach here, because a cell has no block. C12 §2
 * records why the signature therefore has three parameters and not four — the
 * block form's `yMin`/`yMax` reach the shared scaling core instead, and a fourth
 * argument would be one this function's only caller could never supply.
 *
 * Right-anchored when there are fewer values than cells, because the window is
 * of the *last* points: a series three samples into an eight-cell column reads
 * as three samples so far, growing rightward, rather than as a stretched curve
 * that will change shape as it fills.
 */

export function sparkline(
  values: readonly (number | null)[],
  width: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): string {
  const w = Math.max(0, Math.floor(width));
  if (w === 0) return "";

  // **The window is of POSITIONS, not of readings** (I4, I13). It was
  // `values.filter(Number.isFinite)` and then a slice, which is why a gap closed
  // and the row came back a glyph shorter — `[1,2,3,NaN,7,8,9]` drew six cells
  // for seven positions, and the extra leading blank is indistinguishable from
  // the right-anchor padding that means *fewer samples than cells*.
  //
  // **The line form never had this**: `finiteSamples` keeps each value's index
  // precisely so the curve breaks across the gap. So one block kind's two forms
  // disagreed about the same array, and I4 as written — *filtered before
  // scaling* — was satisfied by both.
  //
  // **A gap is `null` in a document and may be `NaN` from a fixture** (C04
  // I46a): one guard answers both, because `Number.isFinite(null)` is `false`.
  const window = values.slice(Math.max(0, values.length - w)); // cells-ok — a position count
  const readings = window.filter((v): v is number => v !== null && Number.isFinite(v));
  if (readings.length === 0) return " ".repeat(w); // cells-ok — a position count

  // **Normalised over the window it shows** (§2), which is the one thing the
  // heatmap does differently: it passes the whole matrix's range instead, and
  // that is what makes its rows comparable to each other.
  //
  // No division by the range (I3). A constant window has no normalised position,
  // and `rampRow` answers the middle step, which is the flat line the plot form
  // draws for the same input.
  const drawn = rampRow(window, w, caps, {
    min: Math.min(...readings),
    max: Math.max(...readings),
  });
  // The padding is `rampRow`'s, measured with `cells()` and never `.length`
  // (A03 SS23) — the way the measurer measures, or a table cell containing one
  // would disagree with its planned width. `ladderFor` is what makes that agree
  // on a wide terminal: the block ramp is two cells per glyph there, so the fix
  // was the glyphs and the measurement together.
  return drawn;
}
