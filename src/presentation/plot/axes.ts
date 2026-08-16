/**
 * Y-labels, the x-axis rule, and x-labels (C12 §3).
 *
 * The glyphs come from C09's set — `bottomLeft`, `horizontal`, `vertical` are
 * already the `└─│` / `+-|` pair §6's table names, so no glyph rôle is added
 * here. A new rôle would need a fallback decided for it (C09 §4); reusing the
 * box-drawing ones needs nothing, and an axis *is* box drawing.
 */
import type { AmbiguousWidth } from "../text.js";
import { cells, truncate } from "../text.js";
import type { Plot } from "../../data/viewmodel/index.js";
import type { Range } from "./scale.js";
import { rowOf } from "./scale.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/** A y-label and the plot-area row it sits on. */
export type YLabel = Readonly<{ row: number; text: string }>;

/**
 * A value, formatted per `yFormat`.
 *
 * `number` trims trailing zeroes rather than fixing a precision, because a loss
 * curve and an epoch count share the format and want different amounts of it.
 *
 * **`default` is the numeric arm and is now unreachable from a validated
 * document** (C04 I41). It stays because this function is called with
 * `Plot["yFormat"]` including `undefined`, which is the real default — not
 * because an unknown string should quietly become a number, which is what it
 * used to mean and what let a typo render plain values in silence.
 */
/**
 * The same value as a **readout** rather than as a tick label (F175).
 *
 * **A tick is a mark on a scale and a readout is the answer**, so `100%` is
 * right on an axis and `45%` throws away the digit a bar exists to show:
 * `docker stats` sends `45.2%` and the cell drew `45%`. This component's
 * recurring class a third time, after the two ramps — a rule correct next door,
 * carried into a geometry it does not fit.
 *
 * **A named entry point rather than an optional argument, and the frame is why.**
 * The first fix made `formatValue` honour its existing `places` for the percent
 * arms, which reads as the minimal change and is wrong: `yLabels` **already
 * passes `places`**, so every percent axis in the corpus gained a decimal, the
 * gutter widened by two cells and every plot lost them. Nothing in the diff of
 * the function said so; the golden frames did.
 *
 * The *enum* stays shared on purpose (C04 I50c) — a bar's number and a y-label
 * ask the same question about the unit coming in. Precision is not a property
 * of the unit, which is what the sharing argument never covered.
 */
export function formatReadout(v: number, format: Plot["yFormat"]): string {
  if (!Number.isFinite(v)) return "—";
  if (format === "percent") return `${v.toFixed(READOUT_PLACES)}%`;
  if (format === "fraction") return `${(v * 100).toFixed(READOUT_PLACES)}%`;
  return formatValue(v, format);
}

/** Decimals in a readout. One — enough for a reading, short of noise. */
const READOUT_PLACES = 1;

export function formatValue(v: number, format: Plot["yFormat"], places?: number): string {
  if (!Number.isFinite(v)) return "—";

  switch (format) {
    // **Named for the unit in, not the unit out** (C04 I41, F31). Both arms end
    // in a per-cent sign, so the rendered form cannot distinguish them; the
    // producer's value can. `fraction` is the old `percent` — the arithmetic
    // never moved, the name did.
    case "fraction":
      return `${Math.round(v * 100)}%`;
    case "percent":
      return `${Math.round(v)}%`;
    case "bytes":
      return formatBytes(v);
    case "duration":
      return formatDuration(v);
    default:
      return places === undefined ? formatNumber(v) : formatNumber(v, places);
  }
}

/** The most decimals `toFixed` will be asked for. See `decimalsFor`. */
const MAX_DECIMALS = 20;

/** Beyond this magnitude a fixed-point label is longer than it is useful. */
const EXPONENTIAL_ABOVE = 1e15;

/**
 * **A shared precision is kept, and a lone number's is trimmed** (§3d, F177).
 *
 * `Number(v.toFixed(2))` and `String` between them strip the trailing zero, so
 * three labels formatted to one precision came out at three: `0.2 · 0.15 · 0.1`,
 * which is the exact thing an axis's shared precision exists to prevent — the
 * eye compares the digit count before it compares the value. The prose said
 * *the three share one precision* and the arithmetic did share it; the string
 * did not.
 *
 * The discriminator is whether the caller **named** a precision. `yLabels` does,
 * from the tick step; a single value does not and wants `1284` rather than
 * `1284.00`. Same shape as `formatReadout` beside `formatValue` — an intent the
 * caller states rather than one inferred downstream.
 */
function formatNumber(v: number, places?: number): string {
  const wanted = Math.min(MAX_DECIMALS, Math.max(0, places ?? decimalsFor(Math.abs(v))));
  if (Math.abs(v) >= EXPONENTIAL_ABOVE) return v.toExponential(1);
  if (places !== undefined) {
    const held = v.toFixed(wanted);
    // A non-zero value that rounds to zero has been labelled as something it is
    // not — the same guard as below, which the fixed path also needs.
    return Number(held) === 0 && v !== 0 ? v.toExponential(1) : held;
  }
  if (Number.isInteger(v)) return String(v);

  const fixed = Number(v.toFixed(wanted));
  // A non-zero value that rounds to zero has been labelled as something it is
  // not. `5e-324` is the case, and it arrives from a fuzz corpus rather than from
  // a metric — but a plot whose floor reads `0` when it is not zero is wrong in
  // the direction a reader cannot detect.
  if (fixed === 0 && v !== 0) return v.toExponential(1);
  return String(fixed);
}

/**
 * Decimal places for a magnitude — two significant figures' worth.
 *
 * Small values want decimals a large one would waste: `0.0372` shown as `0.04`
 * has lost the digit it was shown for, and `1284.37` to four places has gained
 * three nobody asked about.
 *
 * **Clamped, because `toFixed` throws above 100 digits.** A denormal span of
 * `5e-324` asks for 325, and the RangeError propagated out of the renderer — I2
 * says no series input throws, and this is series input by way of a label. Found
 * by T2.3's fuzz corpus, which is what a denormal entry is in it for.
 */
function decimalsFor(magnitude: number): number {
  if (!Number.isFinite(magnitude) || magnitude === 0) return 0;
  const wanted = 1 - Math.floor(Math.log10(magnitude));
  return Math.min(MAX_DECIMALS, Math.max(0, wanted));
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

function formatBytes(v: number): string {
  const sign = v < 0 ? "-" : "";
  let n = Math.abs(v);
  let unit = 0;
  while (n >= 1024 && unit < BYTE_UNITS.length - 1) { // cells-ok — a unit ladder index
    n /= 1024;
    unit += 1;
  }
  return `${sign}${formatNumber(unit === 0 ? Math.round(n) : Number(n.toFixed(1)))} ${BYTE_UNITS[unit] ?? "B"}`;
}

/** Seconds to a duration. The same ladder A01 A.3's messages use — `2m 10s`. */
function formatDuration(v: number): string {
  const total = Math.round(Math.abs(v));
  const sign = v < 0 ? "-" : "";
  if (total < 60) return `${sign}${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds === 0 ? `${sign}${minutes}m` : `${sign}${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${rest}m`;
}

/**
 * Heckbert's `nicenum` — a magnitude rounded to something a reader expects.
 *
 * 1, 2, 2.5, 5 or 10 times a power of ten. **2.5 is in the set and Heckbert's
 * original is not**: without it a span of 100 over five ticks picks 20, and
 * `0 · 25 · 50 · 75 · 100` — the canonical example — is unreachable. The cost is
 * one more admissible step; the gain is the interval a reader of percentages
 * already has in their head.
 */
function niceNumber(rough: number, round: boolean): number {
  // **Zero, not one, and the caller's guard is the single place that decides.**
  // A rough step of `0` means the span is below what a float can divide — half
  // of `Number.MIN_VALUE` underflows — and answering `1` there snapped a range
  // of `5e-324 … 1e-323` to `0 … 1`, swamping the data with a scale a billion
  // orders too wide. It did not hang and every number was finite, which is why
  // returning a plausible constant is worse than returning nothing (F178).
  if (!Number.isFinite(rough) || rough <= 0) return 0;
  const exponent = Math.floor(Math.log10(rough));
  const fraction = rough / 10 ** exponent;
  const nice = round
    ? fraction < 1.5
      ? 1
      : fraction < 2.25
        ? 2
        : fraction < 3.5
          ? 2.5
          : fraction < 7.5
            ? 5
            : 10
    : fraction <= 1
      ? 1
      : fraction <= 2
        ? 2
        : fraction <= 2.5
          ? 2.5
          : fraction <= 5
            ? 5
            : 10;
  return nice * 10 ** exponent;
}

/** How far past the ceiling a rounded-down step may run before it is cut. */
const TICK_OVERRUN = 4;

/** Ticks equal to their step within a whisker, so `0.1 * 3` still lands on `0.3`. */
const TICK_EPSILON = 1e-9;

export type Axis = Readonly<{ range: Range; ticks: readonly number[]; step: number }>;

/**
 * A nice axis over `range`, at most `maxTicks` of them (§3d).
 *
 * **The bounds snap outward and a declared bound never moves** (C04 I29). That
 * is the rule interaction this function exists for: loose labelling extends the
 * range so the ends are round, and a pinned axis exists so two plots can be
 * compared — a pin that silently grew would defeat exactly what it is for. So
 * the snap is applied **per end**, to whichever the data supplied, and a pinned
 * end keeps its own label whether or not it is a multiple of the step.
 *
 * **The tick count is a result and `maxTicks` is a ceiling**, which is the whole
 * of the density rule: the step is chosen from `span / (maxTicks - 1)` and then
 * rounded, so rounding *up* returns fewer ticks than asked for and rounding down
 * never returns more than one extra. A caller that wanted exactly N would be
 * back to dividing the range into N intervals, which is the thing nice numbers
 * replaces.
 *
 * **Not a `yTicks` member on `Plot`.** It would be geometry and it would widen
 * the type correctly (C04 §—, step 3's ruling), and no surface has asked: the
 * ceiling here is derived from the height, which is the space the ticks are
 * competing for. The member arrives with the surface that needs a different one.
 */
export function niceAxis(
  range: Range,
  maxTicks: number,
  pin: Pick<Plot, "yMin" | "yMax">,
): Axis {
  const span = range.max - range.min;
  const wanted = Math.max(2, Math.floor(maxTicks));
  // **A span that is not finite has no nice step**, and reaching for one is how
  // this hung: `niceNumber(Infinity)` falls back to 1, which against bounds of
  // ±10³⁰⁰ is a loop of 2×10³⁰⁰ iterations. Found by T2.3's fuzz corpus — the
  // same corpus, and the same class, as the `toFixed` RangeError `decimalsFor`
  // is clamped for. The ends are the honest answer: they are the only two values
  // anyone can name (F178).
  if (!(span > 0) || !Number.isFinite(span)) {
    return { range, ticks: span > 0 ? [range.min, range.max] : [range.min], step: 0 };
  }

  const step = niceNumber(span / (wanted - 1), true);
  // **A step of zero is not a fine step, it is no step** — and it is reachable:
  // a denormal span underflows `10 ** exponent` to zero, so `niceNumber` returns
  // `0`, `Math.floor(min / 0) * 0` is `NaN`, and the axis hands a `NaN` range to
  // the rasteriser. There `drawLine` compares `x === ex` to stop, `NaN` is equal
  // to nothing, and the loop does not terminate.
  //
  // **The invariant it breaks is two modules away** — C12 I2, *no series input
  // throws or hangs* — which is the class the walk's own note names: a decision
  // leaves a state behind, and the rule forbidding that state lives somewhere
  // else. Nothing in a rule-interaction table for this function reaches it
  // (F178).
  if (!(step > 0) || !Number.isFinite(step)) {
    return { range, ticks: [range.min, range.max], step: 0 };
  }

  const min = pin.yMin === undefined ? Math.floor(range.min / step) * step : range.min;
  const max = pin.yMax === undefined ? Math.ceil(range.max / step) * step : range.max;

  const first = Math.ceil(min / step - TICK_EPSILON);
  const last = Math.floor(max / step + TICK_EPSILON);
  const ticks: number[] = [];
  const at = (v: number): void => {
    const previous = ticks[ticks.length - 1]; // cells-ok — an array index, not a width
    if (previous === undefined || Math.abs(v - previous) > step * TICK_EPSILON) ticks.push(v);
  };

  at(min);
  // **Bounded by the ceiling, not by the arithmetic.** `last - first` is a
  // quotient of two floats and the loop trusted it; the guard above stops the
  // infinite case and this stops the merely enormous one — a step rounded down
  // against a wide range yields more ticks than asked for, and the caller's
  // ceiling is the number that is supposed to govern.
  //
  // **Counted, not walked**, and that distinction is the whole guard: `k += 1`
  // on a float of magnitude 10³⁰⁰ leaves `k` exactly where it was, so a loop
  // written over the tick values themselves does not terminate at all — it is
  // not slow, it never advances. The counter is a small integer by construction.
  const count = Math.min(Math.max(0, last - first), wanted * TICK_OVERRUN);
  for (let i = 0; i <= count; i += 1) {
    const v = (first + i) * step;
    if (v > min && v < max) at(v);
  }
  at(max);

  return { range: { min, max }, ticks, step };
}

/**
 * The y-labels for a plot area of `rows` rows (I15).
 *
 * Max, midpoint and min, at the top, middle and bottom rows — **and they collapse
 * from the middle outward** when the height cannot hold three: two at `height: 2`,
 * one at `height: 1`. §3 made three unconditional while T3.2 renders `height: 1`
 * with axes, so the section contradicted its own test; the midpoint is the one to
 * lose first, because the extremes bound the data and the midpoint is
 * interpolation between them.
 *
 * A constant series has `min === max`, and all the labels then show that value —
 * §4's rule, and the reason this reads the range rather than the data.
 *
 * **The three share one precision, taken from the span.** Formatting each on its
 * own magnitude is what a single-value formatter does, and against a range of
 * 0.86 to 0.087 it produced `0.86`, `0.4737`, `0.0874` — a midpoint with four
 * digits where its siblings have two, driving the label column two cells wider
 * for precision nobody asked for. Three labels on one axis are one measurement
 * shown three times, so they are formatted as one. Found by reading a rendered
 * frame, which is what D39's goldens are for.
 */
export function yLabels(
  range: Range,
  rows: number,
  format: Plot["yFormat"],
  pin: Pick<Plot, "yMin" | "yMax"> = {},
): readonly YLabel[] {
  const h = Math.max(1, Math.floor(rows));
  const axis = niceAxis(range, ticksFor(h), pin);
  // **Precision from the step, which is the smallest gap** (§3d). It was taken
  // from the *span* before, which is the same number divided by the tick count —
  // right when there were three labels and wrong the moment there are five, and
  // wrong in the direction that drops a digit two adjacent ticks differ by.
  const places = axis.step > 0 ? stepDecimals(axis.step) : undefined;
  const at = (v: number): string => formatValue(v, format, places);

  if (h === 1) return [{ row: 0, text: at(axis.range.max) }];

  // **One label per row, and the top and bottom ends are the ones kept.** Two
  // ticks resolving to one row is a label overwritten by another with no way to
  // tell which won, so the row is the key — and the ends bound the data where an
  // interior tick interpolates between them (I15's own argument, one step along).
  // **The ends first, then interior ticks that do not abut one.** This is the
  // density rule with the ceiling above it: `ticksFor` picks the *step*, and how
  // many survive is a result. Read from the frame — a five-tick ceiling over
  // eight rows put `50%` and `25%` on adjacent rows, because `rowOf` rounds and
  // eight rows cannot evenly host five ticks. Two labels touching read as one
  // two-line label, and dropping the interior one loses nothing the ends do not
  // already bound.
  const taken: number[] = [0, h - 1];
  const byRow = new Map<number, string>([
    [0, at(axis.range.max)],
    [h - 1, at(axis.range.min)],
  ]);
  for (const v of axis.ticks) {
    const row = rowOf(v, axis.range, h);
    if (taken.some((t) => Math.abs(t - row) < MIN_LABEL_GAP)) continue;
    taken.push(row);
    byRow.set(row, at(v));
  }

  return [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([row, text]) => ({ row, text }));
}

/**
 * The decimals a **step** needs, which is not the decimals a magnitude wants.
 *
 * `decimalsFor` answers *two significant figures of this number*, and it is
 * right for a lone value: `0.0372` to two places has lost the digit it was shown
 * for. Asked about a step it over-answers — a step of `5` comes back as one
 * place, so an integer axis drew `40.0 · 35.0 · 30.0`, a decimal on every label
 * that no tick could ever use.
 *
 * The step is exact by construction — 1, 2, 2.5, 5 or 10 times a power of ten —
 * so the question has an exact answer: the fewest places that write it back
 * unchanged. Read from a frame at height 20, where the ladder is long enough for
 * the spurious digit to be obvious and the common height of 8 hides it.
 */
function stepDecimals(step: number): number {
  for (let d = 0; d < MAX_DECIMALS; d += 1) {
    if (Number(step.toFixed(d)) === step) return d;
  }
  return MAX_DECIMALS;
}

/** Rows between two labels. One blank line, or the pair reads as one label. */
const MIN_LABEL_GAP = 2;

/**
 * The tick ceiling for a plot area of `h` rows (§3d).
 *
 * **A ceiling on the step's coarseness, not the number drawn.** How many survive
 * is decided by the abut rule in `yLabels`, which is where the density actually
 * resolves; this only says how fine a step to reach for.
 *
 * **Two bounds, and the lower one wins.** The gap rule says how many labels this
 * height could admit at all; a third of the rows says how fine a step is worth
 * asking for. Half plus one gives five over the common height of eight, and the
 * frame showed why that is too fine: `rowOf` rounds, eight rows cannot evenly
 * host five ticks, and `50%` and `25%` landed on rows 4 and 5. A third alone is
 * too coarse the other way — it drops the midpoint at height five, where the gap
 * rule would happily seat it at row 2.
 *
 * The complaint nice numbers answers was never *too few*: it was `23.4` where
 * `25` belongs.
 */
export function ticksFor(h: number): number {
  // How many labels the gap rule could possibly admit at this height…
  const admissible = Math.floor((h - 1) / MIN_LABEL_GAP) + 1;
  // …and how fine a step is worth reaching for, which is coarser.
  return Math.max(2, Math.min(admissible, Math.max(3, Math.floor(h / 3) + 1)));
}

/** The widest label, which is the label column's width. */
export function labelWidth(labels: readonly YLabel[], ambiguous: AmbiguousWidth = "narrow"): number {
  let widest = 0;
  for (const label of labels) widest = Math.max(widest, cells(label.text, ambiguous));
  return widest;
}

/**
 * The three x-labels, laid out at left, centre and right of the plot area.
 *
 * Truncated to a third each and **separated by at least one cell** (T3.8).
 * "Never overlapping" is not enough: at width 22 a seven-cell left label and a
 * centred one both wanted cell 7, and `epoch 0epoch …` reads as a single long
 * label rather than as two that ran out of room. A label that cannot keep its
 * gap is dropped rather than butted against its neighbour — saying less is
 * better than saying something else.
 */
export function xLabelRow(
  labels: readonly [string, string, string] | undefined,
  width: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): string {
  const w = Math.max(0, Math.floor(width));
  if (labels === undefined || w === 0) return "";

  const third = Math.max(1, Math.floor(w / 3));
  const [left, centre, right] = labels.map((l) => truncate(l, third, caps));

  const row: string[] = Array.from({ length: w }, () => " ");
  let free = 0; // the first cell no label has claimed

  const place = (text: string, ideal: number): void => {
    if (text === "") return;
    const wide = cells(text, caps.ambiguousWidth);
    const start = Math.max(free, Math.min(ideal, w - wide));
    if (start + wide > w) return; // no room with its gap — dropped, not butted
    [...text].forEach((ch, i) => {
      row[start + i] = ch;
    });
    free = start + wide + 1;
  };

  place(left ?? "", 0);
  place(centre ?? "", Math.floor((w - cells(centre ?? "", caps.ambiguousWidth)) / 2));
  place(right ?? "", w - cells(right ?? "", caps.ambiguousWidth));

  return row.join("").replace(/\s+$/, "");
}
