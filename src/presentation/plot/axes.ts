/**
 * Y-labels, the x-axis rule, and x-labels (C12 §3).
 *
 * The glyphs come from C09's set — `bottomLeft`, `horizontal`, `vertical` are
 * already the `└─│` / `+-|` pair §6's table names, so no glyph rôle is added
 * here. A new rôle would need a fallback decided for it (C09 §4); reusing the
 * box-drawing ones needs nothing, and an axis *is* box drawing.
 */
import { cells, truncate } from "../text.js";
import type { Plot } from "../../data/viewmodel/index.js";
import type { Range } from "./scale.js";
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

function formatNumber(v: number, places = decimalsFor(Math.abs(v))): string {
  if (Number.isInteger(v) && Math.abs(v) < EXPONENTIAL_ABOVE) return String(v);
  if (Math.abs(v) >= EXPONENTIAL_ABOVE) return v.toExponential(1);

  const fixed = Number(v.toFixed(Math.min(MAX_DECIMALS, Math.max(0, places))));
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
export function yLabels(range: Range, rows: number, format: Plot["yFormat"]): readonly YLabel[] {
  const h = Math.max(1, Math.floor(rows));
  const span = range.max - range.min;
  const places = span === 0 ? undefined : decimalsFor(span);
  const at = (v: number): string => formatValue(v, format, places);
  const top = at(range.max);
  const bottom = at(range.min);

  if (h === 1) return [{ row: 0, text: top }];
  if (h === 2) {
    return [
      { row: 0, text: top },
      { row: 1, text: bottom },
    ];
  }

  const mid = Math.floor((h - 1) / 2);
  return [
    { row: 0, text: top },
    { row: mid, text: at((range.min + range.max) / 2) },
    { row: h - 1, text: bottom },
  ];
}

/** The widest label, which is the label column's width. */
export function labelWidth(labels: readonly YLabel[]): number {
  let widest = 0;
  for (const label of labels) widest = Math.max(widest, cells(label.text));
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
  caps: Pick<TerminalCapabilities, "unicode">,
): string {
  const w = Math.max(0, Math.floor(width));
  if (labels === undefined || w === 0) return "";

  const third = Math.max(1, Math.floor(w / 3));
  const [left, centre, right] = labels.map((l) => truncate(l, third, caps));

  const row: string[] = Array.from({ length: w }, () => " ");
  let free = 0; // the first cell no label has claimed

  const place = (text: string, ideal: number): void => {
    if (text === "") return;
    const wide = cells(text);
    const start = Math.max(free, Math.min(ideal, w - wide));
    if (start + wide > w) return; // no room with its gap — dropped, not butted
    [...text].forEach((ch, i) => {
      row[start + i] = ch;
    });
    free = start + wide + 1;
  };

  place(left ?? "", 0);
  place(centre ?? "", Math.floor((w - cells(centre ?? "")) / 2));
  place(right ?? "", w - cells(right ?? ""));

  return row.join("").replace(/\s+$/, "");
}
