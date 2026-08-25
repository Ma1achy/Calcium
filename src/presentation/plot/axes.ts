/**
 * Y-labels, the x-axis rule, and x-labels (C12 §3).
 *
 * The glyphs come from C09's set — `bottomLeft`, `horizontal`, `vertical` are
 * already the `└─│` / `+-|` pair §6's table names, so no glyph rôle is added
 * here. A new rôle would need a fallback decided for it (C09 §4); reusing the
 * box-drawing ones needs nothing, and an axis *is* box drawing.
 */
import { normalisedOf } from "../../data/viewmodel/range.js";
import type { AmbiguousWidth } from "../text.js";
import { cells, truncate } from "../text.js";
import type { Plot, ScaleType } from "../../data/viewmodel/index.js";
import type { Range } from "./scale.js";
import { rowOf, FACING_DEFAULT, type Facing } from "./scale.js";
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
  // **The numeric arm, which F175's fix did not reach** (F182). `decimalsFor`
  // gives two significant figures — `45.2` came out `45` and `12.4` came out
  // `12`, which is the digit this whole function exists to keep, on the arm a
  // block with no `yFormat` takes. The fix landed on the two arms the finding
  // was *found* on rather than on the class it named.
  //
  // **What the producer sent, short of noise** — not a fixed precision and not
  // a significant-figure count. `1284` stays `1284`, `0.023` stays `0.023`,
  // `12.75` stays `12.75`; a value that genuinely needs sixteen digits is float
  // noise and is capped. A floor of one decimal was tried first and rounded
  // `12.75` to `12.8`, which is the same digit loss one order down.
  if (format === undefined || format === "number") {
    return formatValue(v, format, decimalsNeeded(v));
  }
  return formatValue(v, format);
}

/** Decimals in a readout of a percentage. One — a reading, short of noise. */
const READOUT_PLACES = 1;

/**
 * Significant figures a readout keeps — **a cap on meaning, not on length**.
 *
 * A flat decimal cap cannot serve both ends of the scale: six places is right
 * for `0.023` and six places of a computed sine is `55.827460`, which is float
 * noise printed with confidence. Four significant figures gives `55.83`,
 * `12.75`, `45.2`, `0.023` and `1284` — each keeping what it has and none
 * inventing. Found by reading a catalogue frame, which is where the six showed.
 */
const READOUT_FIGURES = 4;

/**
 * The decimals a value needs to survive the round trip, capped.
 *
 * **Read off the shortest representation rather than derived from the
 * magnitude.** `decimalsFor` answers *how many digits does an axis label at this
 * scale want* — two significant figures — which is right for a tick and drops
 * the digit a readout exists to show: `45.2` came out `45` and `12.75` came out
 * `12.8`. The producer sent those digits and a readout is the answer (F175,
 * F182).
 */
function decimalsNeeded(v: number): number {
  const text = String(v);
  const dot = text.indexOf(".");
  if (dot === -1 || text.includes("e") || text.includes("E")) return 0; // cells-ok — a decimal count
  const has = text.length - dot - 1; // cells-ok — a decimal count
  // The places four significant figures leaves at this magnitude, floored at
  // zero — `decimalsFor`'s arithmetic with a wider target, since two figures is
  // a tick's question and a readout is the answer.
  const afford = v === 0
    ? 0
    : Math.max(0, READOUT_FIGURES - 1 - Math.floor(Math.log10(Math.abs(v)))); // cells-ok — a decimal count
  return Math.min(has, afford); // cells-ok — a decimal count
}

/**
 * Several readings of **one quantity**, formatted at one precision (F177).
 *
 * `formatReadout` answers for a lone value and trims what it does not need, so
 * four readings side by side come out at four precisions —
 * `O 12.4  H 13.1  L 12  C 12.9`. That is exactly what F177 records of an axis's
 * labels: *the eye compares the digit count before it compares the value*, and
 * `L 12` reads as a coarser measurement rather than as the same one.
 *
 * **A set rather than an argument**, the same shape `formatReadout` takes beside
 * `formatValue`: the caller states that these values are one quantity, and that
 * is a claim only the caller can make. A plot's several *series* are not one —
 * a price and its volume share a readout row and share no precision.
 *
 * The non-numeric arms already fix their own: `percent` and `fraction` at
 * `READOUT_PLACES`, `bytes` and `duration` on their unit ladders.
 */
export function readoutSet(
  values: readonly (number | undefined)[],
  format: Plot["yFormat"],
): readonly string[] {
  if (format !== undefined && format !== "number") {
    return values.map((v) => (v === undefined ? "—" : formatReadout(v, format)));
  }
  const finite = values.filter((v): v is number => v !== undefined && Number.isFinite(v));
  const places = finite.reduce((most, v) => Math.max(most, decimalsNeeded(v)), 0); // cells-ok — a decimal count
  return values.map((v) =>
    v === undefined || !Number.isFinite(v) ? "—" : formatValue(v, format, places));
}

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
  axis: Axis,
  rows: number,
  format: Plot["yFormat"],
  facing: Facing = FACING_DEFAULT,
): readonly YLabel[] {
  const h = Math.max(1, Math.floor(rows));
  // **The axis is handed in, and that is the whole of the fix.** This function
  // used to take a `Range` and nice it itself, which made two nicings of one
  // axis: `positionalForm` niced the data to get the range the curve is
  // rasterised against, and this niced *that* to get the range the gutter is
  // labelled against. `niceAxis` is not idempotent — a second pass sees the
  // widened span, picks a coarser step and widens again — so at 12 of 23 heights
  // for one ordinary series the two disagreed, and the frame read `15` on the
  // row holding `12.4`.
  //
  // **The previous remedy is what built it.** The comment that stood here
  // recorded the same class found once before — *a log axis picked log ticks in
  // `positionalForm` and was labelled linearly* — and fixed it by threading the
  // scale in so both nicings would agree. Two computations that agree about
  // scale are still two computations, and they were left free to disagree about
  // range. One axis, computed where the data is measured and passed down, is
  // the answer that has no second half to keep in step (F210).
  // **Precision from the step, which is the smallest gap** (§3d). It was taken
  // from the *span* before, which is the same number divided by the tick count —
  // right when there were three labels and wrong the moment there are five, and
  // wrong in the direction that drops a digit two adjacent ticks differ by.
  const at = (v: number): string => formatValue(v, format, placesFor(axis));

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
  // **The gutter labels both ends of the area, and the facing swaps which
  // value each end carries** (C12 §3ac A1). Row 0 held the maximum and row
  // `h − 1` the minimum as literals, with only the interior ticks through
  // `rowOf` — so a downward facing drew a scale whose ends disagreed with its
  // own ticks, in the one place a reader goes to settle a disagreement.
  //
  // **Asking `rowOf` for the two rows is the other repair and it is wrong**:
  // a constant range collapses both to the centre row, and the map keyed on the
  // row then holds one label where I3 requires three. T1.5 is what said so. The
  // rows are the area's ends by definition; only the values move.
  const taken: number[] = [0, h - 1];
  const byRow = new Map<number, string>([
    [0, at(facing.y === "down" ? axis.range.min : axis.range.max)],
    [h - 1, at(facing.y === "down" ? axis.range.max : axis.range.min)],
  ]);
  for (const v of axis.ticks) {
    const row = rowOf(v, axis.range, h, facing);
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

/**
 * Every tick's label, at the axis's own precision — **the strings, beside the
 * numbers that produced them** (C12 I59, §3ak).
 *
 * `yLabels` answers *which rows carry a label*, which is a question about cells
 * and belongs to the terminal. This answers *what a tick says*, which is a
 * question about the axis and belongs to both arms — and the two were computed
 * in different places from different inputs, so the SVG printed `String(tick)`
 * and got `1` where the terminal's uniform precision gives `1.0`, and
 * `0.6000000000000001` where it gives `0.6`.
 *
 * **The precision is `stepDecimals` and not `decimalsFor`**, which is `yLabels`'
 * own ruling and the reason this function is here rather than in the figure: a
 * step is exact by construction, so the question has an exact answer, and asking
 * a magnitude formatter instead put a decimal on every label of an integer axis.
 * One derivation, read by both.
 */
export function tickLabels(axis: Axis, format: Plot["yFormat"]): readonly string[] {
  return axis.ticks.map((v) => formatValue(v, format, placesFor(axis)));
}

/**
 * An axis's precision — **one derivation, and it was two for a commit.**
 *
 * `tickLabels` landed with its own copy of `yLabels`' line, under a comment
 * saying *one derivation, read by both*. Two identical lines is not only the
 * duplication the comment denied: the mutation harness replaces by string, so
 * an anchor on that line matched **twice**, and `anchors.mjs` did not report it
 * because the sweep checks whether an anchor **exists** and not whether it is
 * **unique** (F219).
 */
function placesFor(axis: Axis): number | undefined {
  return axis.step > 0 ? stepDecimals(axis.step) : undefined;
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
  facing: Facing = FACING_DEFAULT,
): string {
  return xAxis(labels, width, caps, facing).text;
}

/**
 * An x-label row and the plot-area columns its labels are anchored to.
 *
 * **`tickColumns` and not `ticks`, because `Axis.ticks` are values.** One is a
 * set of numbers on the scale and the other a set of cells on the row, and the
 * two would have shared a name in a component that converts between them all
 * day. MG24 found it as a name collision; it is a conflation either way.
 */
export type XAxis = Readonly<{
  text: string;
  tickColumns: readonly number[];
  /**
   * The area column the value **0** lands in, or `null` where the abscissa has
   * no such column (C12 §3ad B2).
   *
   * **Returned here rather than computed by the consumer**, because a crossing
   * axis and the `0` caption must be in the same cell and there is exactly one
   * placement that can put them there. It is the same expression the ticks go
   * through, including `columnAt` — so a candlestick's zero column is a candle's
   * column and not the curve's rule (§3d.1, §3ad A8).
   *
   * `null` for the captions arm (three words have no domain), for a domain that
   * does not strictly straddle zero, and where the column is not strictly
   * interior to the area — at the edge, `"zero"` and `"edge"` name the same
   * place (§3ad A4, A7, A10).
   */
  zeroColumn: number | null;
}>;

/**
 * The same row, **with the columns the ticks belong on** (§3f).
 *
 * **The anchors come out of the placement rather than beside it.** The tick
 * columns are derivable — first sample, centre, last — and deriving them is how
 * the mark ends up a cell away from the label it marks: the placement clamps a
 * label that would collide with its neighbour, and it drops one that cannot
 * keep its gap at all. A tick under a label that was never drawn marks nothing,
 * and a tick one column off reads as a different sample. So `place` records
 * where each label actually landed, and a label that is dropped contributes no
 * tick.
 *
 * The anchor is the label's own reference point, not its start: the left label
 * begins at its tick, the centre label straddles it, and the right label ends
 * on it — which is what makes the three read as marks on one scale rather than
 * three captions.
 */
export function xAxis(
  labels: readonly [string, string, string] | undefined,
  width: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  facing: Facing = FACING_DEFAULT,
): XAxis {
  const w = Math.max(0, Math.floor(width));
  if (labels === undefined || w === 0) return { text: "", tickColumns: [], zeroColumn: null };

  const third = Math.max(1, Math.floor(w / 3));
  // **The caller's own three captions reverse with the data** (§3ac B4). A
  // caption names the samples it sits under, and leaving them put under a
  // reversed curve is the one furniture defect a reader cannot detect from the
  // frame: both halves look right and only their pairing is wrong.
  const faced = facing.x === "left" ? [labels[2], labels[1], labels[0]] : labels;
  const [left, centre, right] = faced.map((l) => truncate(l, third, caps));

  const row: string[] = Array.from({ length: w }, () => " ");
  const tickColumns: number[] = [];
  let free = 0; // the first cell no label has claimed

  const place = (text: string, ideal: number, anchor: (wide: number) => number): void => {
    if (text === "") return;
    const wide = cells(text, caps.ambiguousWidth);
    const start = Math.max(free, Math.min(ideal, w - wide));
    if (start + wide > w) return; // no room with its gap — dropped, not butted
    [...text].forEach((ch, i) => {
      row[start + i] = ch;
    });
    tickColumns.push(start + anchor(wide));
    free = start + wide + 1;
  };

  place(left ?? "", 0, () => 0);
  place(
    centre ?? "",
    Math.floor((w - cells(centre ?? "", caps.ambiguousWidth)) / 2),
    (wide) => Math.floor((wide - 1) / 2),
  );
  place(right ?? "", w - cells(right ?? "", caps.ambiguousWidth), (wide) => wide - 1);

  // **No zero column: three captions are not a scale** (§3ad A7). The
  // horizontal half of a crossing axis is unaffected — the halves are
  // independent, which is what makes this a `null` rather than a refusal.
  return { text: row.join("").replace(/\s+$/, ""), tickColumns, zeroColumn: null };
}

/**
 * How many x ticks a width could carry.
 *
 * **`ticksFor`'s shape, in the other dimension and with the other constant.** A
 * y label owns a whole row and abuts its neighbour a row away; an x label is
 * several cells wide on a row it shares with every other label, so the spacing
 * that matters is *cells per label* rather than rows between them. Eight is one
 * `-1234.5` plus the gap, which is the widest a formatted number gets before the
 * placement starts dropping them anyway.
 */
const X_LABEL_PITCH = 8;

/**
 * Where a value sits along the x domain, as a fraction (C12 I41, §3d.1).
 *
 * **The x axis transforms where the y axis cannot, and the asymmetry is real
 * rather than an inconsistency.** A y value *is* the datum, so placing it under
 * a log scale needs the rasteriser to plot `log(v)` — which this component does
 * not do, and `yScale: "log"` therefore picks log ticks and draws them at linear
 * rows (F189). An x sample is placed by its **index**, evenly, and the domain is
 * what declares which value that index carries: under `xMin: 1, xMax: 1000,
 * xScale: "log"`, sample *i* of *n* holds `1000 ^ (i / (n − 1))` and already
 * sits at `i / (n − 1)` of the width. Placing a tick at `log(v) / log(max/min)`
 * is what makes the label agree with the sample beneath it.
 *
 * **`symlog` falls back to linear, and that is stated rather than silent.** Its
 * transform is piecewise — linear inside a threshold and logarithmic outside —
 * and the threshold is not on the scale value, so there is nothing here to read
 * it from. `niceSymlogAxis` still chooses the tick *values*; only their spacing
 * is linear, which is wrong near the origin and is the one arm of this function
 * that does not agree with its samples.
 */
function xPositionOf(value: number, range: Range, scale?: ScaleType): number {
  // **The shared coordinate** (C04 §3ak). This read `span <= 0 ? 0`, which puts
  // every tick of a constant range at the axis's left edge; mid-ramp is the
  // family's answer and the one C04's table gives.
  const linear = normalisedOf(value, { min: range.min, max: range.max }, false);
  const isLog = scale === "log" || scale === "log2" || scale === "ln"
    || (typeof scale === "object" && "log" in scale);
  if (!isLog || range.min <= 0 || range.max <= 0) return linear;
  const lo = Math.log(range.min);
  const hi = Math.log(range.max);
  return hi === lo ? 0 : (Math.log(Math.max(value, Number.MIN_VALUE)) - lo) / (hi - lo);
}

export function xTicksFor(width: number): number {
  return Math.max(2, Math.min(9, Math.floor(Math.max(0, width) / X_LABEL_PITCH) + 1)); // cells-ok — a label count
}

/**
 * The numeric x axis: nice numbers over a domain, and the columns they land on
 * (C12 I41, §3d.1).
 *
 * **The domain is passed as its own pin, and that is load-bearing.** §3d's rule
 * is *a derived bound snaps outward and a declared one never moves* — right for
 * the ordinate, where the range exists to contain the data. Here the domain
 * *is* the geometry: sample 0 is drawn in column 0 and sample n−1 in column
 * w−1, so a range that snapped outward would put its own top tick at the right
 * edge where the last sample already is, and every label would name a value one
 * step along from the sample under it. Nice numbers **inside** the domain, ends
 * not forced to be ticks — which is what `ax.plot(y)` does: 0 5 10 15 20 over
 * 0…23.
 *
 * **Through `axisFor` and never `niceAxis`**, for the defect `yLabels` records
 * at the top of its own body: the ticks were picked by the dispatcher and the
 * labels written by the linear arm, so a log axis was labelled linearly and
 * neither half was wrong on its own.
 *
 * The placement is `xAxis`'s, verbatim: a label that cannot keep its one-cell
 * gap is dropped, **and a dropped label contributes no tick** — the anchor comes
 * out of the placement rather than beside it, so a mark never survives the label
 * it was marking.
 */
export function xTickRow(
  range: Range,
  width: number,
  format: Plot["yFormat"],
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  scale?: ScaleType,
  facing: Facing = FACING_DEFAULT,
  /**
   * Where a normalised position lands, **because the form owns that** (C12 I37,
   * I41). A curve spreads its samples across the width; a candlestick
   * left-aligns them at a fixed pitch, and I37 measured that the two agree at
   * the dense end and separate at the sparse one — four bars in forty-four
   * columns put the last candle at column 20 and the curve's rule at 43. A tick
   * placed by the curve's rule would point between candles.
   */
  columnAt?: (t: number) => number | null,
): XAxis {
  const w = Math.max(0, Math.floor(width));
  if (w === 0 || !Number.isFinite(range.min) || !Number.isFinite(range.max)) {
    return { text: "", tickColumns: [], zeroColumn: null };
  }
  const axis = axisFor(range, xTicksFor(w), { yMin: range.min, yMax: range.max }, scale);
  // **`stepDecimals` and not `decimalsFor`**, which is §3d's own rule — *one
  // precision per axis, from the step, and it is the step's own decimals*.
  // `decimalsFor` answers a different question (how many digits does a value at
  // this magnitude want) and gives a step of 5 one decimal, so an index axis
  // came out `0.0 5.0 10.0` where the reference draws `0 5 10`. The rule was
  // already written and `yLabels` already followed it.
  const decimals = axis.step > 0 ? stepDecimals(axis.step) : undefined;

  const row: string[] = Array.from({ length: w }, () => " ");
  const tickColumns: number[] = [];
  let free = 0; // the first cell no label has claimed

  for (const value of axis.ticks) {
    const text = formatValue(value, format, decimals);
    const wide = cells(text, caps.ambiguousWidth); // cells-ok — a label width
    const t = xPositionOf(value, axis.range, scale);
    // **`columnAt` gets the unflipped position and flips inside** (§3ac B3).
    // It maps a position to a *bar*, and `candleColumn` already faces its own
    // placement — handing it `1 − t` as well would flip the axis twice and draw
    // it the way it started.
    const at = columnAt?.(t) ?? Math.round((facing.x === "left" ? 1 - t : t) * (w - 1)); // cells-ok — a column index
    if (at === null || at < 0) continue; // cells-ok — a column index
    // Centred on its own tick, then held inside the row and clear of its
    // neighbour — the same three clamps `xAxis` applies to its three captions.
    const ideal = at - Math.floor((wide - 1) / 2); // cells-ok — a column position
    const start = Math.max(free, Math.min(ideal, w - wide)); // cells-ok — a column position
    if (start < 0 || start + wide > w) continue; // cells-ok — no room with its gap
    // **The tick is the label's own anchor and not the value's column.** A
    // label pushed right to clear its neighbour is describing where it now is;
    // a mark left behind at the value's column points at a label that moved.
    const anchor = start + Math.floor((wide - 1) / 2); // cells-ok — a column position
    [...text].forEach((ch, i) => { row[start + i] = ch; }); // cells-ok — a column position
    tickColumns.push(anchor);
    free = start + wide + 1; // cells-ok — a column position
  }

  // **The zero column, through the same expression the ticks took** (§3ad B2).
  // Two conditions and they are not one condition: the domain must *strictly*
  // straddle zero — `min < 0 && max > 0` excludes an index domain, whose zero is
  // sample 0, and a degenerate one — and the column must be strictly inside the
  // area, because at the edge `"zero"` and `"edge"` name the same place and a
  // rule at column 0 abuts the gutter's border (§3ad A4, A10, A15).
  const straddles = axis.range.min < 0 && axis.range.max > 0;
  const zero = straddles
    ? columnAt?.(xPositionOf(0, axis.range, scale))
      ?? Math.round((facing.x === "left" ? 1 - xPositionOf(0, axis.range, scale) : xPositionOf(0, axis.range, scale)) * (w - 1)) // cells-ok — a column index
    : null;
  const zeroColumn = zero !== null && zero !== undefined && zero > 0 && zero < w - 1 ? zero : null; // cells-ok — a column index

  return { text: row.join("").replace(/\s+$/u, ""), tickColumns, zeroColumn };
}

// --- log / time / symlog axes -----------------------------------------------

function logBase(scale: ScaleType): number {
  if (scale === "log") return 10;
  if (scale === "log2") return 2;
  if (scale === "ln") return Math.E;
  if (typeof scale === "object" && "log" in scale) return scale.log;
  return 10;
}

/**
 * Log-scale axis: ticks at powers of the base, with dense subdivision.
 *
 * `1 · 2 · 5 · 10 · 20 · 50` for base 10, `1 · 2 · 4 · 8 · 16` for base 2.
 */
export function niceLogAxis(
  range: Range,
  maxTicks: number,
  scale: ScaleType,
): Axis {
  const base = logBase(scale);
  if (range.min <= 0 || range.max <= 0 || !Number.isFinite(range.min) || !Number.isFinite(range.max)) {
    return { range, ticks: [range.min, range.max], step: 0 };
  }

  const logMin = Math.log(range.min) / Math.log(base);
  const logMax = Math.log(range.max) / Math.log(base);

  const minPow = Math.floor(logMin);
  const maxPow = Math.ceil(logMax);

  const ticks: number[] = [];
  const wanted = Math.max(2, Math.floor(maxTicks));

  const subdivisions = base === 10 ? [1, 2, 5] : base === 2 ? [1] : [1];
  for (let p = minPow; p <= maxPow && ticks.length < wanted * 2; p++) { // cells-ok — a tick count
    for (const sub of subdivisions) {
      const v = sub * Math.pow(base, p);
      if (v >= range.min && v <= range.max && ticks.length < wanted * 2) { // cells-ok — a tick count
        ticks.push(v);
      }
    }
  }

  if (ticks.length === 0) ticks.push(range.min, range.max); // cells-ok — a tick count

  while (ticks.length > wanted) ticks.splice(1, 1); // cells-ok — a tick count

  return { range, ticks, step: 0 };
}

/**
 * Symlog axis: linear near zero, logarithmic outside.
 *
 * The linear threshold defaults to 1.
 */
export function niceSymlogAxis(
  range: Range,
  maxTicks: number,
  _scale: ScaleType,
): Axis {
  const threshold = 1;
  const ticks: number[] = [];
  const wanted = Math.max(2, Math.floor(maxTicks));

  if (range.min < -threshold) {
    let v = -threshold;
    while (v >= range.min && ticks.length < wanted) { // cells-ok — a tick count
      ticks.push(v);
      v *= 10;
    }
    ticks.reverse();
  }

  const linearStep = threshold / Math.max(1, Math.floor(wanted / 4));
  for (let v = Math.max(range.min, -threshold); v <= Math.min(range.max, threshold); v += linearStep) {
    if (ticks.length < wanted * 2) ticks.push(Math.round(v * 1e9) / 1e9); // cells-ok — a tick count
  }

  if (range.max > threshold) {
    let v = threshold;
    while (v <= range.max && ticks.length < wanted * 2) { // cells-ok — a tick count
      ticks.push(v);
      v *= 10;
    }
  }

  const unique = [...new Set(ticks)].sort((a, b) => a - b);
  return { range, ticks: unique, step: 0 };
}

/** Round time intervals: seconds, minutes, hours, days. */
const TIME_STEPS = [
  1, 2, 5, 10, 15, 30, 60,
  120, 300, 600, 900, 1800, 3600,
  7200, 14400, 21600, 43200, 86400,
  172800, 604800, 2592000,
];

/**
 * Time-scale axis: ticks at round time boundaries.
 *
 * Values are assumed to be seconds (Unix timestamps or durations).
 */
export function niceTimeAxis(
  range: Range,
  maxTicks: number,
): Axis {
  const span = range.max - range.min;
  if (span <= 0 || !Number.isFinite(span)) {
    return { range, ticks: [range.min], step: 0 };
  }

  const wanted = Math.max(2, Math.floor(maxTicks));
  const rough = span / (wanted - 1);

  let step = TIME_STEPS[TIME_STEPS.length - 1]!; // cells-ok — index into constant array
  for (const s of TIME_STEPS) {
    if (s >= rough) { step = s; break; }
  }

  const first = Math.ceil(range.min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= range.max && ticks.length < wanted * 2; v += step) { // cells-ok — a tick count
    ticks.push(v);
  }

  if (ticks.length === 0) ticks.push(range.min); // cells-ok — a tick count

  return { range, ticks, step };
}

/**
 * Dispatch to the appropriate axis algorithm for a scale type.
 */
export function axisFor(
  range: Range,
  maxTicks: number,
  pin: Pick<Plot, "yMin" | "yMax">,
  scale?: ScaleType,
): Axis {
  if (scale === undefined || scale === "linear") return niceAxis(range, maxTicks, pin);
  if (scale === "time") return niceTimeAxis(range, maxTicks);
  if (scale === "symlog") return niceSymlogAxis(range, maxTicks, scale);
  if (scale === "log" || scale === "log2" || scale === "ln" || (typeof scale === "object" && "log" in scale)) {
    return niceLogAxis(range, maxTicks, scale);
  }
  return niceAxis(range, maxTicks, pin);
}
