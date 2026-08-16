/**
 * `valueBar` — a quantity against a scale, drawn as a run (C12 §3b, I20).
 *
 * **The `fill` encoding, and it is the fourth axis.** Position is a dot at a
 * coordinate, height is how full a cell is, density is how much ink a cell
 * carries — and fill is **how much of a run is covered**. The run *is* the axis
 * here, which is why it is the part that gives up width to the number rather
 * than the other way round.
 *
 * **This is not `progress`, and the tree said so before the spec did.**
 * `examples/docker` hand-wrote nine lines of it because `b.progress` answers
 * *how far through* and the app needed *how much* — FINDINGS gap 3. A `total`
 * is reached; a scale's top may be exceeded and may not be knowable.
 *
 * **A function rather than a block, for `sparkline`'s reason** (§2): a cell is
 * not a block, the measured consumer is a table cell, and rendering it through
 * C09's registry would drag block dispatch into a cell.
 */
import type { BarSpec } from "../../data/viewmodel/index.js";
import { cells, truncate } from "../text.js";
import { formatReadout } from "./axes.js";
import { pairFor } from "./ramp.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/** The narrowest run worth drawing. Below it the number is the whole cell. */
const MIN_RUN = 3;


/**
 * One row of exactly `width` cells (I20).
 *
 * **The number takes what it needs and the run takes the residual**, which is
 * `progress`'s rule and follows from the encoding: the run is the axis, so it is
 * the part that may shrink. Below `MIN_RUN` there is no run worth drawing and
 * the number is the cell — a two-cell bar is not a bar, it is a decoration that
 * looks like data.
 *
 * **The fill clamps and the number does not** (C09 I28). A per-core CPU
 * percentage has no knowable ceiling, so `101.2` of `100` fills the run and
 * keeps counting — a bar that stopped at its ceiling would draw a busy container
 * exactly like a saturated one, which is the defect this ruling exists to avoid
 * and the one `progress` had until this session.
 */
export function valueBar(
  spec: BarSpec,
  width: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): string {
  const w = Math.max(0, Math.floor(width));
  if (w === 0) return "";

  // **`fill`, and it is a pair rather than a ladder** (I21): the run is the
  // axis, so a value picks how many rather than which. `pairFor` is where the
  // capability is read, which is what stops the app threading a flag (F43).
  const mark = pairFor(caps);
  // **Exactly `w` cells, both directions** (I20). Padding alone is right until
  // the number is wider than the cell — a five-cell column holding `1000.5%` —
  // and a row one cell over is a row the terminal wraps, adding a line no
  // measurer counted. Truncation is `text.ts`'s so the ellipsis and the width
  // agree with the planner's.
  const pad = (text: string): string => {
    const fitted = truncate(text, w, caps);
    return fitted + " ".repeat(Math.max(0, w - cells(fitted, caps.ambiguousWidth)));
  };

  // **Absent is a mark, not an empty run** (I20, C04 I50c). This is C12 I4's
  // rule arriving in the one geometry where an empty drawing is a legible
  // *value*: a blank grid cell means nothing was reported, and a blank run means
  // zero. The same question, answered per geometry.
  if (spec.value === null || !Number.isFinite(spec.value)) return pad(mark.absent);

  // **A readout, not a tick** (F175). A bar exists to say *how much*, and
  // `45.2%` rounded to `45%` throws away the digit the reader opened the
  // surface for. `formatReadout` is a named intent rather than an argument,
  // because `yLabels` already passes a `places` and the minimal-looking fix
  // widened every percent axis in the corpus by two cells.
  const number = formatReadout(spec.value, spec.format);
  const run = w - cells(number, caps.ambiguousWidth) - 1;
  if (run < MIN_RUN) return pad(number);

  const min = spec.min ?? 0;
  const span = spec.max - min;
  // No division by a zero span (C12 I3's rule, one form over): a scale with no
  // extent has no proportion, and the run is empty rather than full — an empty
  // run is *zero of nothing*, which is the honest reading.
  const t = span <= 0 ? 0 : (spec.value - min) / span;
  const fill = Math.round(Math.min(1, Math.max(0, t)) * run);

  return pad(`${mark.filled.repeat(fill)}${mark.empty.repeat(run - fill)} ${number}`);
}
