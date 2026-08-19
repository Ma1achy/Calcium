/**
 * Category marks — the channel a form falls back to when colour cannot carry it.
 *
 * **C12 I29 in the direction it degrades.** Colour leads: two segments, two layers,
 * two series are told apart by tone wherever the terminal has enough of it. Where
 * it does not, they must still be told apart, and I25 is the rule — *by mark or
 * by name, never by tone alone*.
 *
 * **A ladder of eight**, matching `CATEGORY_LIMIT`, so a mark exists for every
 * category the palette admits and the two ladders index alike: category *i* is
 * `CATEGORY_REFS[i]` and `markOf(i)` together, and a reader comparing a legend to
 * a figure is comparing the same slot in both.
 *
 * **Not the shade ramp.** `░ ▒ ▓` encode a value along an axis (§3c) and spending
 * them on identity is the vocabulary mismatch `ramp.ts` was written about — the
 * same one that put a gauge's shaded track behind a comparison bar. These are
 * chosen for *contrast between neighbours* rather than for ordering: a stack is
 * adjacent bands and the reader is separating them, not reading a magnitude off
 * them.
 *
 * Three arms, because the block elements U+2580–U+259F are all
 * `East_Asian_Width=Ambiguous` and a "wide" terminal draws them two cells — the
 * rung that has now produced four defects in this component.
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import type { PlotForm } from "../../data/viewmodel/index.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth" | "colourDepth">;
/** Choosing the ladder needs the alphabet; choosing *within* it needs the depth. */
type Alphabet = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/** The depth at or above which the categorical palette separates its entries. */
const CATEGORY_COLOUR_FLOOR = 4;

const UNICODE_MARKS: readonly string[] = Object.freeze([
  "█", "▒", "▓", "░", "▙", "▟", "▚", "▞",
]);

// Braille, because U+2800–U+28FF is Neutral and survives a wide terminal intact.
const WIDE_MARKS: readonly string[] = Object.freeze([
  "⣿", "⡇", "⢶", "⠉", "⠒", "⢤", "⡋", "⣘",
]);

const ASCII_MARKS: readonly string[] = Object.freeze([
  "#", "=", "-", ":", ".", "+", "*", "o",
]);

/** The eight marks for a capability set, most contrasting first. */
export function categoryMarks(caps: Alphabet): readonly string[] {
  if (caps.unicode === "ascii") return ASCII_MARKS;
  return caps.ambiguousWidth === "wide" ? WIDE_MARKS : UNICODE_MARKS;
}

/**
 * The mark for category `index`, beside `refOf`'s colour for the same slot.
 *
 * **Uniform above the floor, and that is I29 rather than laziness.** Where colour
 * separates the categories it is the carrier and a varying mark would be a second
 * encoding of one fact — which is what made a stacked bar's `░▒▓` read as a
 * magnitude it did not have. `plotMarks: "always"` is the opt-out, for a
 * colour-blind reader or for print.
 */
export function markOf(index: number, caps: Caps, always = false): string {
  const marks = categoryMarks(caps);
  const first = marks[0] ?? "#";
  if (!always && caps.colourDepth >= CATEGORY_COLOUR_FLOOR) return first;
  return marks[index % marks.length] ?? first; // cells-ok — a ladder length
}

/**
 * Whether a form's categories occupy the **same cells**, so only a mark can
 * separate them — or its own labelled row, where the gutter already does.
 *
 * **Measured, not assumed.** Run over every form, I25's sweep as first written
 * failed nine and eight of them were right: `boxplot`, `dumbbell`, `lollipop`,
 * `dotplot`, `funnel`, `gantt`, `waterfall` and `ridgeline` each name their
 * category in the gutter, and a rule demanding a distinct glyph there would have
 * `lollipop` drawing four different dots for nobody's benefit.
 *
 * **The same partition the legend wants**, and for the same reason: a legend is
 * load-bearing exactly where the gutter is not. Total over `PlotForm`, so a new
 * member declares which it is or does not compile — one of the four tables that
 * used to be silent about a thirty-fifth form.
 */
export const SHARES_CELLS: Readonly<Record<PlotForm, boolean>> = Object.freeze({
  // The geometric family: segments and polygons in one figure, no gutter at all.
  pie: true, radar: true, waffle: true,
  // Layers inside one bar, and one row per category — the row is labelled and
  // the *layers* inside it are not, which is why these are here.
  bar: true, histogram: true,
  // Overlaid curves sharing a scale. Below the colour floor `positionalForm`
  // stops overlaying and stacks into labelled strips, which is a different
  // chart rather than a degraded one — but the shared-cell case is what the
  // partition is about, and above the floor these do share.
  line: true, scatter: true, step: true, ecdf: true, density: true,
  streamgraph: true, stackedarea: true,
  // One row per category, named in the gutter.
  boxplot: false, violin: false, ridgeline: false, forest: false, dumbbell: false,
  lollipop: false, dotplot: false, funnel: false, gantt: false, waterfall: false,
  flame: false, icicle: false,
  // One row per series, named in the gutter, and a scale legend beneath.
  heatmap: false, calendar: false, correlation: false, confusion: false,
  spectrogram: false, latency: false, density2d: false,
  // A single series, no categories to separate.
  sparkline: false, horizon: false,
  // Composition: each facet is its own figure and answers this itself.
  smallmultiples: false, pairplot: false,
});
