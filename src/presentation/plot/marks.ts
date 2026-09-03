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
import type { PlotForm, Series } from "../../data/viewmodel/index.js";
import type { ColourRef } from "../theme/index.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth" | "colourDepth">;
/** Choosing the ladder needs the alphabet; choosing *within* it needs the depth. */
type Alphabet = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/**
 * The categorical palette's slots, in order (C10, roadmap 51).
 *
 * **Here beside `markOf` because they are two halves of one ladder** — category
 * *i* is `CATEGORY_REFS[i]` and `markOf(i)` together, and a reader comparing a
 * legend to a figure is comparing the same slot in both channels. It lived in
 * `definition.ts` while the legend, which needs it, lives in `furniture.ts`, and
 * `definition.ts` imports `furniture.ts`.
 */
export const CATEGORY_REFS: readonly ColourRef[] = Object.freeze([
  "categorical.c1",
  "categorical.c2",
  "categorical.c3",
  "categorical.c4",
  "categorical.c5",
  "categorical.c6",
  "categorical.c7",
  "categorical.c8",
]);

/**
 * The slot for category `index`.
 *
 * **`Plot.palette` was removed rather than typed, and the measurement is why.**
 * The field shipped as a bare `string` beside `colormap?: ColormapName`, so
 * `palette: "tab-10"` compiled and resolved to nothing at render — F172's shape,
 * one field along from the clause that refuses it. C04 I55's remedy was a
 * literal union, and building it turned up something better: there is only one
 * palette a plot may draw a series from.
 *
 * `tone` and `syntax` carry **meaning** — a series taking `tone.error` says
 * something is wrong about series three — and C10 I16 closes `spectrum` to
 * declared art, with a third consumer stated as a four-place spec change. What
 * remains is `categorical`, which is the palette for exactly this. **A field
 * with one legal value is not a choice**, and typing it would have made the
 * defect unreachable while leaving a knob that turns nothing.
 *
 * It was also *inert*: settable, carried through the builder — which is why MG24
 * counted it consumed — and read by no renderer. A name-based seam check cannot
 * tell *named* from *acted on*, and that is a real blind spot rather than an
 * oversight here.
 */
export function refOf(index: number): ColourRef {
  return CATEGORY_REFS[index % CATEGORY_REFS.length] ?? "categorical.c1"; // cells-ok — a palette size
}

/**
 * A **series'** colour: its declared `tone` if it has one, else its slot (F382).
 *
 * **This existed twice under one name, and the copies disagreed.** `refOf(index)`
 * above is the slot and knows nothing about a series; `definition.ts` had a
 * private `refOf(series, index)` that read `series.tone` first. The terminal's
 * curve renderer imported the second and the legend the first, so a series
 * declaring a tone was **drawn in that tone and named in its slot colour** —
 * `tone.ok` green on the line, `categorical.c1` orange in the swatch.
 *
 * `legendEntries`' own comment says *a legend whose swatch is a different colour
 * from the thing it names is worse than none*, four lines from the call that
 * makes it one. Both functions read as correct; which one a call site got
 * depended on which module it imported from.
 *
 * **Shared rather than fixed in place**, because the SVG arm had the third
 * answer — it used the slot for both, so it agreed with itself and ignored
 * `tone` altogether. One resolver is what makes three call sites unable to
 * disagree.
 */
export function seriesRefOf(series: Pick<Series, "tone"> | undefined, index: number): ColourRef {
  const tone = series?.tone;
  return tone === undefined ? refOf(index) : `tone.${tone}`;
}

/** The depth at or above which the categorical palette separates its entries. */
const CATEGORY_COLOUR_FLOOR = 4;

/**
 * **Textures, not the shade ramp** — §3b of the spec says so and this ladder
 * opened `█ ▒ ▓ ░`, which is the ramp with the ends swapped.
 *
 * The cost is not aesthetic. A 1-bit waffle of 65 / 15 / 12 drew `█` then `▒`
 * then `▓`: apparent density falling, then rising, against a magnitude that
 * only falls. A ramp used for identity does not merely fail to encode
 * magnitude — it encodes a *wrong* one, and a reader has no way to know the
 * axis is not there.
 *
 * Quadrant and checker blocks carry no order: `▚` and `▞` tile into diagonal
 * stripes running opposite ways, and the four three-quarter blocks tile into
 * patterns that differ by which corner is open. All are U+2580–U+259F and so
 * `East_Asian_Width=Ambiguous`, which is what `WIDE_MARKS` below is for.
 */
const UNICODE_MARKS: readonly string[] = Object.freeze([
  "█", "▚", "▞", "▙", "▟", "▛", "▜", "▖",
]);

// Braille, because U+2800–U+28FF is Neutral and survives a wide terminal intact.
const WIDE_MARKS: readonly string[] = Object.freeze([
  "⣿", "⡇", "⢶", "⠉", "⠒", "⢤", "⡋", "⣘",
]);

/**
 * Same correction. This was `# = - : . + * o`, and `RAMP_ASCII` is `.:-=+*#@` —
 * the first five marks were the ramp read backwards.
 *
 * `#` stays as the first, because it is ASCII's only solid and it is what
 * `markOf` returns above the colour floor. The rule §3b states is against a
 * *monotone density sequence*, not against any character a ramp also contains:
 * one glyph on its own carries no ordering.
 */
const ASCII_MARKS: readonly string[] = Object.freeze([
  "#", "/", "\\", "x", "o", "v", "~", "%",
]);

/** The eight marks for a capability set, most contrasting first. */
/**
 * The separator between the parts of a legend, a level list or a compound
 * category label — `·` where the terminal has it, `-` where it does not.
 *
 * **A mark, and it reached a frame** (C12 I54, §3af). `·` is written into five
 * plot strings and every one of them passes `checkMarks`, correctly: `·` is in
 * that rule's `PROSE_MARKS` and its comment records the blind spot with its
 * figure — *106 literals carry prose punctuation and this passes every one … a
 * real and much larger question, and not this rule's.*
 *
 * **`degradesToAscii` is the instrument that does see it**, because it is a
 * contract on a rendered document and has no opinion about whether a codepoint
 * is punctuation. Two instruments, two subjects, and the weaker one was the one
 * being run. The five plot sites are fixed through here; the wider hundred are
 * counted where the blind spot is declared.
 *
 * Spaced, so `+2 more - a - b` reads as a list rather than as arithmetic.
 */
export function partSeparator(caps: Pick<TerminalCapabilities, "unicode">): string {
  return caps.unicode === "ascii" ? " - " : " \u00b7 ";
}

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
/**
 * Whether a row of this form is a **thing with a name**, or a slice of an axis.
 *
 * **C12 I38's partition, and the axis a rule about colour was missing.** Colour
 * names an identity. A band called `control` is one the caller chose; a bin
 * called `[15.4, 24.1)` is a cut this renderer made in a continuous axis, and a
 * lag is an offset — so eight bins are one distribution and drew eight colours,
 * claiming eight things where there is one.
 *
 * **Not `SHARES_CELLS`, which reads as though it answers this.** That record is
 * indexed by *form* and its `bar: true` is about *layers inside one bar*, so a
 * plain bar and a stacked one share an entry and want opposite answers from it.
 * Two records, two questions: which channel separates the things in one cell,
 * and whether a row is a thing at all.
 *
 * **Total over `PlotForm`**, so the thirty-fifth form declares which it is or
 * does not compile — §3h's reason for the other record, and the same one here:
 * a rule remembered per form is a rule that lapses on the thirty-fifth.
 */
/**
 * Whether this form's abscissa is a **position** — an index across the area —
 * rather than a category, a band or a figure of its own.
 *
 * **C12 I41's scope, stated as data.** These are the forms that map sample *i*
 * to a column and draw a frame with nothing under it; everything else either
 * labels its own columns (the categorical vertical arm, through `columnLabels`)
 * or has no cartesian abscissa at all.
 *
 * **`bar` and the rest of the categorical family are `false` for a reason worth
 * writing down**: a horizontal bar's bottom axis is a *value* axis, not a
 * position axis, and it does not exist either. That is a different missing
 * thing, named here so it is a known gap rather than an omission this record
 * quietly implies is covered.
 *
 * Total over `PlotForm`, so the thirty-fifth form declares which it is.
 */
export const HAS_POSITION_AXIS: Readonly<Record<PlotForm, boolean>> = Object.freeze({
  // **The abscissa is a projected x, not a sample index** (C12 I87). Two
  // samples adjacent in the array land wherever the camera puts them.
  plot3d: false,
  // Sample index across the area — one column per position (C12 I41).
  line: true, scatter: true, step: true, ecdf: true, density: true,
  slope: true, bubble: true, stackedarea: true, streamgraph: true,
  // One row or column per category; the vertical arm labels its own columns.
  bar: false, histogram: false, boxplot: false, violin: false, ridgeline: false,
  forest: false, dumbbell: false, lollipop: false, dotplot: false, funnel: false,
  gantt: false, waterfall: false, timeline: false, bullet: false, autocorrelation: false,
  // A matrix labels its rows and its columns from `categories`, not from a scale.
  heatmap: false, calendar: false, correlation: false, confusion: false,
  spectrogram: false, latency: false, density2d: false, utilisation: false,
  // **A field is sampled over a domain, not a set of categories** (C12 I49).
  // These were `false` on the matrix's row and it was the wrong reason: a
  // heatmap's columns come from `categories`, and a field's column *is* a
  // position along an axis, so it has one and it is drawn.
  contour: true, quiver: true,
  // No cartesian abscissa at all — a disc, a polygon, a mosaic, a tree.
  pie: false, radar: false, waffle: false, flame: false, icicle: false, treemap: false,
  tree: false,
  graph: false,
  // One row, no furniture.
  sparkline: false, horizon: false,
  // Composition: each facet answers this for itself.
  smallmultiples: false, pairplot: false,
});

export const ROW_IS_AN_IDENTITY: Readonly<Record<PlotForm, boolean>> = Object.freeze({
  // **A `Point3Series` is a thing the caller named** (C04 I76). Whether colour
  // *carries* that identity is `colourBy`'s decision and a different question —
  // this record asks whether a row is a thing at all.
  plot3d: true,
  // **The two the renderer cuts.** `binValues` makes the bins and the lags are
  // offsets into one series — neither is anything the caller named.
  histogram: false, autocorrelation: false,
  // One row, column or band per name the caller supplied.
  bar: true, boxplot: true, violin: true, ridgeline: true, forest: true, dumbbell: true,
  lollipop: true, dotplot: true, funnel: true, gantt: true, waterfall: true,
  timeline: true, bullet: true, utilisation: true,
  // Segments and layers in one figure — their identity is the segment's, and
  // these forms never reach the row default at all.
  pie: true, radar: true, waffle: true, flame: true, icicle: true, treemap: true,
  // **A tree's row is a position and not a name the caller gave.** Inert either
  // way — the form has no categorical palette at all (C12 I57) — and `false` is
  // the honest answer if it ever becomes live, on `contour`'s and `quiver`'s
  // reason one family along.
  tree: false,
  graph: false,
  // A curve is not a row. These have no per-row category axis, so the entry is
  // stated rather than meaningful — which is what a total record costs and why
  // it is worth it: nothing here is answered by omission.
  line: true, scatter: true, step: true, ecdf: true, density: true,
  streamgraph: true, stackedarea: true, slope: true, bubble: true,
  heatmap: true, calendar: true, correlation: true, confusion: true,
  spectrogram: true, latency: true, density2d: true,
  // **And the two field forms, for the same reason one rung along.** A field
  // row is a slice of the ordinate — a position — where a matrix row is a
  // thing the caller named. These were `true` on the matrix's row, and the
  // frame is what said otherwise: the y gutter read `row0 … row5` where a
  // reader wanted a scale, and there was no x axis at all (C12 I49).
  contour: false, quiver: false,
  sparkline: true, horizon: true,
  smallmultiples: true, pairplot: true,
});

export const SHARES_CELLS: Readonly<Record<PlotForm, boolean>> = Object.freeze({
  // **The depth buffer keeps one of two** (C12 I89). Two clouds' samples land
  // in one cell and the nearer wins it, so nothing in the picture says which
  // series the cell belongs to — which is what makes the legend load-bearing
  // rather than polite, and what makes this entry observable at all.
  plot3d: true,
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
  streamgraph: true, stackedarea: true, slope: true, bubble: true,
  // One row per category, named in the gutter.
  boxplot: false, violin: false, ridgeline: false, forest: false, dumbbell: false,
  lollipop: false, dotplot: false, funnel: false, gantt: false, waterfall: false,
  flame: true, icicle: true, treemap: true, tree: true, graph: true,
  autocorrelation: false, timeline: false, bullet: false, utilisation: false,
  // One row per series, named in the gutter, and a scale legend beneath.
  heatmap: false, calendar: false, correlation: false, confusion: false,
  spectrogram: false, latency: false, density2d: false,
  // **The levels share cells and the rows do not, and this record is about the
  // rows.** A contour names each row in its gutter, which is what §3t says this
  // partition turns on; the level ladder is a different question and I25
  // answers it with a dash rather than with a mark from here.
  // A quiver's arrows sit one per cell in a labelled row, same answer.
  contour: false, quiver: false,
  // A single series, no categories to separate.
  sparkline: false, horizon: false,
  // Composition: each facet is its own figure and answers this itself.
  smallmultiples: false, pairplot: false,
});
