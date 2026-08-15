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
import { rampFor, RAMP_STEPS } from "./ramp.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

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
  values: readonly number[],
  width: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): string {
  const w = Math.max(0, Math.floor(width));
  if (w === 0) return "";

  const finite = values.filter((v) => Number.isFinite(v));
  const window = finite.slice(Math.max(0, finite.length - w)); // cells-ok — a sample count
  if (window.length === 0) return " ".repeat(w); // cells-ok — a sample count

  const ramp = [...rampFor(caps)];
  const min = Math.min(...window);
  const max = Math.max(...window);

  // No division by the range (I3). A constant window has no normalised position,
  // and the middle step is the flat line the plot form draws for the same input.
  const middle = Math.floor((RAMP_STEPS - 1) / 2);
  const glyph = (v: number): string => {
    if (max === min) return ramp[middle] ?? " ";
    const t = (v - min) / (max - min);
    const step = Math.round(t * (RAMP_STEPS - 1));
    return ramp[step] ?? " ";
  };

  const drawn = window.map(glyph).join("");
  // `cells()` and never `.length` (A03 SS23), and the padding must be measured
  // the way the measurer measures or a table cell containing one would disagree
  // with its planned width.
  //
  // **The sentence that used to be here said *every ramp glyph is one cell wide
  // in both modes*, and it is not true of the unicode ramp.** `▁▂▃▄▅▆▇█` are all
  // `East_Asian_Width=Ambiguous`, which means the **terminal** decides: one cell
  // in a Western locale, two in a CJK one or under tmux's
  // `utf8-ambiguous-width double`. `cells()` returns 1 for every one of them and
  // has no ambiguous handling at all, so on such a terminal the framework's
  // measurement and the drawn frame disagree by a factor of two — and because
  // C11 calls this for a **table cell**, what breaks is column alignment for
  // every row below, not a chart looking odd.
  //
  // **Fixed now, and in two places.** `rampFor` returns the braille ramp when
  // the capability says wide — every glyph of which is narrow — and the padding
  // below measures with the capability, so the two agree whichever ramp came
  // back. Measuring alone would not have been enough: it would have padded the
  // wide ramp correctly to a width no table cell could hold.
  return " ".repeat(Math.max(0, w - cells(drawn, caps.ambiguousWidth))) + drawn;
}
