/**
 * What each arm **decides**, extracted from what each arm **drew**.
 *
 * The unification pass's step 1: *measure the disagreements before designing the
 * type*. This is the extraction that measurement runs on, and its one rule is
 * that **both sides come out of output, never out of a copy of the logic**.
 *
 * **Why not call the terminal's decision functions.** `axisFor`, `yLabels`,
 * `legendPlacement` and the rest *are* what the terminal decides, and reading
 * them would be quicker. But the pass's claim is that a decision made in two
 * places gets two answers — and a sweep that asks each arm's own function has
 * asked the same question twice rather than compared two answers. Worse, those
 * functions are what step 3 moves into `figureOf`; a sweep written against them
 * would keep passing across the move whatever the frames did. So the terminal
 * side is a frame read and the SVG side is an element read, and the two cannot
 * agree by construction.
 *
 * **The instrument's own blind spots, stated because an unrecorded limit reads
 * as strength:**
 *
 *   - `numericLabels` does not separate the two axes. A `line` frame yields its
 *     y ticks and its x ticks in one list. The disagreements this sweep exists
 *     for are *which numbers* and *how many*, and both survive the merge; a
 *     per-axis split would need the terminal's own axis functions, which is
 *     exactly what the paragraph above refuses.
 *   - A numeric **identity** reads as a value. `autocorrelation` labels its rows
 *     by lag — `0 1 2 3 4` — and nothing in a frame says those are indices
 *     rather than readings. The row is still a true record of what was drawn.
 *   - In-area text is matched by shape, `[A-Za-z]…`, so a form whose *data* is
 *     letters would be read as labels. No form in the corpus draws letters as
 *     data; the day one does, this comment is where to look.
 */
import { plotToSvg, SVG_DEFAULT_LAYOUT } from "../../src/presentation/plot/svg.js";
import type { Plot } from "../../src/data/viewmodel/index.js";
import type { ResolvedTheme } from "../../src/presentation/theme/types.js";

/**
 * The **vertical** frame edges, both alphabets — what separates gutter from area.
 *
 * Vertical only, and that is a fix rather than a simplification. A class holding
 * the horizontal run as well matches the `-` that opens `-0.5`, so the first
 * edge on a row whose gutter holds a negative tick is found *inside the label*
 * and the gutter reads empty. `autocorrelation` labels `-0.5`, so the instrument
 * would have reported a missing label as a disagreement — evidence manufactured
 * by the parser, which is the failure this sweep exists to detect rather than
 * commit.
 */
const EDGE = /[│┤├┼|+]/u;
const TOP = /^\s*[┌+]/u;
const BOTTOM = /^\s*[└+]/u;
/** A row that is *only* frame — the border itself, rather than a row with edges. */
const RULE_ONLY = /^[\s┌┐└┘├┤┬┴┼─│+|-]+$/u;
/** A label shaped like a name rather than a reading. */
const WORD = /[A-Za-z][A-Za-z0-9_.-]*/gu;
const NUMERIC = /^-?[\d.,]+\s*[%a-zA-Z]{0,3}$/u;

export type ArmDecisions = Readonly<{
  /** Did the arm put anything on the page at all. */
  drawn: boolean;
  /** Every label that reads as a number, in the order drawn. Ticks, mostly. */
  numericLabels: readonly string[];
  /** Every label that names something — a category, a series, a node, a tile. */
  identityLabels: readonly string[];
  /** Is there a border around the plot area. */
  border: boolean;
  /** Rules drawn **across the plot area**, which is not the same as tick stubs on a border. */
  interiorRules: number;
  /** Is a legend drawn — entries beside the figure rather than on it. */
  legend: boolean;
}>;

const NOTHING: ArmDecisions = Object.freeze({
  drawn: false, numericLabels: [], identityLabels: [], border: false, interiorRules: 0, legend: false,
});

/**
 * The terminal's decisions, read out of its frame.
 *
 * **The bottom border is the seam.** Everything above it is the plot area and
 * its gutters; everything below is the x-axis row and whatever notice follows. A
 * form with no border — the heatmap and the treemap draw none — has no seam, and
 * then every row is area, which is the honest answer rather than a guess.
 */
/**
 * A row that is a **legend** — a run of swatch-and-name pairs.
 *
 * **The terminal reader could only see a legend on the right** (F297, fourth
 * instance and the first on this side). Its whole test was *text past the last
 * frame edge on a row*, which only `left` and `right` produce: `legend: "above"`
 * put `alpha beta gamma` into `identityLabels` and reported `legend: false`, and
 * `legend: "below"` was invisible in both. Measured against the second arm, which
 * draws all four placements, those two variants could never agree whatever either
 * renderer did — the reader was reporting different facts about the same figure.
 *
 * So both sides now ask the **same** structural question, which is also what a
 * legend *is* in either medium: a swatch and a name. Here that is a block glyph
 * followed by a word, repeated; in the SVG it is a square `<rect>` followed by a
 * `<text>`.
 *
 * **Stated limit**: the swatch class is the 24-bit and ASCII alphabet, which is
 * what this instrument compares at (§2). Below the colour floor `markOf` reaches
 * for shapes — `▚`, `▞` — and those are in the class; a rung that grew a sixth
 * mark would need adding, and `U6` is where that would be noticed.
 */
const SWATCH = /[\u2588\u28ff#\u259a\u259e\u2593\u2592\u2591\/\\]/u;
const LEGEND_ROW = /^(?:\s*[\u2588\u28ff#\u259a\u259e\u2593\u2592\u2591\/\\]\s+[A-Za-z][\w.-]*)+\s*$/u;

function isLegendRun(text: string): boolean {
  const t = text.trim();
  return t !== "" && SWATCH.test(t) && LEGEND_ROW.test(t);
}

/**
 * A legend **beside** a figure, on the same row (F307, F297's fifth instance).
 *
 * The two tests above find a legend that **is** a row, or text past a frame
 * edge. The proportion family has neither: a pie, a radar and a waffle draw no
 * border at any width and put their key on the same rows as the disc. So
 * `legend: false` was reported for twenty cells where the terminal draws one,
 * and the names went into `identityLabels` — the reader inventing a
 * disagreement in both directions at once, which is what F297 was.
 *
 * **`LEGEND_GAP` is the structural signal, and it is the terminal's own.**
 * `segmentLegend` prefixes every entry with two spaces, so the tail is *at
 * least two spaces, then swatch-and-name pairs to the end of the row* — where a
 * figure's own glyphs run edge to edge and its labels are single words.
 *
 * **The swatch class cannot be a character list here**, and the radar is why:
 * its swatch is `dashSwatch`, two braille cells of `⠒`, and adding that
 * codepoint to `SWATCH` would make every braille curve in the corpus a
 * candidate. So the tail asks the *shape* — one to three non-word glyphs — and
 * the two-space gap is what keeps it from matching a figure.
 *
 * **Stated limit**: a form drawing a word inside its area, preceded by two
 * spaces, at the end of a row, is indistinguishable from a one-entry legend.
 * `AD1` is where that would show, because it compares 46 forms and the cell
 * would move.
 */
const LEGEND_TAIL = /\s{2,}(?:[^\s\w]{1,3}\s+[A-Za-z][\w.\-]*(?:\s+[\d.]+%?)?\s*)+$/u;

export function terminalDecisions(lines: readonly string[]): ArmDecisions {
  const rows = lines.filter((l) => l.length > 0);
  if (rows.length === 0) return NOTHING;

  let bottom = -1;
  for (const [i, l] of rows.entries()) if (BOTTOM.test(l) && RULE_ONLY.test(l)) bottom = i;
  const border = rows.some((l) => TOP.test(l) && RULE_ONLY.test(l)) && bottom >= 0;

  const area = bottom >= 0 ? rows.slice(0, bottom) : rows;
  const below = bottom >= 0 ? rows.slice(bottom + 1) : [];

  const numeric: string[] = [];
  const identity: string[] = [];
  let legend = false;

  for (const l of area) {
    if (RULE_ONLY.test(l)) continue;
    const first = l.search(EDGE);
    // **A swatch-and-name run is a legend wherever it sits** — above the frame,
    // below it, or past the right edge (F297).
    if (isLegendRun(l)) { legend = true; continue; }
    // **A legend beside the figure is stripped before the identity scan**, or
    // its names are counted twice — once as a legend and once as the labels the
    // gutter shows (F307).
    const tail = LEGEND_TAIL.exec(l);
    const body = tail === null ? l : l.slice(0, tail.index);
    if (tail !== null) legend = true;
    if (first < 0) {
      // **A row with no edge is not an empty row.** The tiles family draws its
      // names inside the figure and frames nothing, so skipping these reported
      // the terminal's treemap as having no labels while it was drawing six —
      // a disagreement invented by the parser. Found by reading the extraction
      // beside the frame it came from.
      for (const w of body.matchAll(WORD)) identity.push(w[0]);
      continue;
    }
    const head = l.slice(0, first).trim();
    if (head !== "") (NUMERIC.test(head) ? numeric : identity).push(head);

    // **The last edge is the right frame**, and anything past it is furniture
    // outside the figure — which is where the terminal puts a vertical legend.
    let last = -1;
    for (let i = l.length - 1; i >= 0; i -= 1) if (EDGE.test(l[i]!)) { last = i; break; }
    if (last >= 0 && l.slice(last + 1).trim() !== "") legend = true;
  }

  // **The rows below the border carry a `below` legend**, and they were never
  // scanned for one (F297). The x row is the first line that is neither frame
  // nor legend — checking the legend first is what keeps a swatch run from being
  // read as the abscissa.
  for (const l of below) if (isLegendRun(l)) legend = true;
  const xRow = below.find((l) => !RULE_ONLY.test(l) && l.trim() !== "" && !isLegendRun(l));
  for (const x of xRow === undefined ? [] : xRow.trim().split(/\s{2,}/u)) {
    if (x !== "") (NUMERIC.test(x) ? numeric : identity).push(x);
  }

  return {
    drawn: true,
    numericLabels: numeric,
    identityLabels: identity,
    border,
    // **Interior rules only, and the terminal draws none.** Its ticks are stubs
    // *on* the border — `┬` and `┴`, or `+` in ASCII — where the SVG's are lines
    // spanning the area. Counting the border's stubs here would report the arms
    // agreeing about a thing neither does the same way, and in ASCII it would
    // count the corners too.
    interiorRules: area.filter((l) => RULE_ONLY.test(l) && !TOP.test(l) && !BOTTOM.test(l)).length,
    legend,
  };
}

/** Every `<text>` element's body, paired with whether it is clipped to a shape. */
function texts(svg: string): readonly Readonly<{ body: string; clipped: boolean }>[] {
  const out: { body: string; clipped: boolean; y: number; x: number }[] = [];
  for (const m of svg.matchAll(/<text\s([^>]*)>([^<]*)<\/text>/gu)) {
    const attrs = m[1] ?? "";
    out.push({
      x: Number(/\bx="([-\d.]+)"/u.exec(attrs)?.[1] ?? 0),
      y: Number(/\by="([-\d.]+)"/u.exec(attrs)?.[1] ?? 0),
      body: (m[2] ?? "").trim(),
      // **A clipped label names a thing; an unclipped one names a value.** The
      // tiles and nodes families clip every label to its own rectangle, which is
      // what lets a label stop itself without font metrics — so the attribute
      // that exists for hazard 4 also partitions the two kinds of text this arm
      // draws.
      clipped: attrs.includes("clip-path="),
    });
  }
  // **Reading order, because that is the question the other side answers**
  // (F307, and F297's own ruling one reader along). `terminalDecisions` walks
  // rows top to bottom and takes what each row holds left to right; document
  // order here is *emission* order, which for a ring is the category order and
  // for the terminal is neither. The five names of a radar came back as the same
  // set in two orders, and the matrix compares arrays.
  //
  // **A row is a band, not a line**, since two labels at the same height sit at
  // different baselines by a pixel or two — the same tolerance the terminal gets
  // for free from having rows at all.
  const band = (v: number): number => Math.round(v / SVG_FONT_ROW);
  return [...out].sort((a, b) => band(a.y) - band(b.y) || a.x - b.x);
}

/** The height a label's row occupies, for banding two labels onto one line. */
const SVG_FONT_ROW = 14;

/** The SVG's decisions, read out of its elements. Private: `svgArm` is the seam. */
function svgDecisions(svg: string | null): ArmDecisions {
  if (svg === null) return NOTHING;
  const all = texts(svg).filter((t) => t.body !== "");
  const legendNames = svgLegendNames(svg);
  return {
    drawn: true,
    // **The legend's names are not identity labels, on the terminal reader's own
    // terms** (F297). That side puts anything past the last frame edge into
    // `legend` and never into `identityLabels`, so counting the SVG's legend
    // entries as identities compared a gutter against a gutter *plus a legend* —
    // and `line.identityLabels` went **12/70 to 70/70** the moment this arm grew
    // one. The arm was right and the reader was asymmetric.
    numericLabels: all.filter((t) => !legendNames.has(t.body) && !t.clipped && NUMERIC.test(t.body)).map((t) => t.body),
    identityLabels: all.filter((t) => !legendNames.has(t.body) && (t.clipped || !NUMERIC.test(t.body))).map((t) => t.body),
    // **The ground is not a border.** `<rect width="100%">` paints the page; a
    // border would be a stroked rectangle round the plot area, and this arm
    // draws none.
    border: svgBorder(svg),
    interiorRules: svgInteriorRules(svg),
    legend: legendNames.size > 0, // cells-ok — a legend entry count
  };
}

/**
 * Every `<line>` this arm drew, as four numbers.
 *
 * **The reader stops guessing an encoding here** (F297). `border` was
 * `/<rect[^>]*width="100%"[^>]*stroke=/` — a stroked full-page rectangle — which
 * is what a border *would have been* had this arm ever drawn one, and it never
 * had. The day it did, drawing four `<line>`s, the reader reported `false` and
 * the matrix reported the disagreement as open. `interiorRules` counted **every**
 * `<line>`, so the four border edges arrived as four interior rules and that cell
 * did not close either.
 *
 * **An instrument that anticipates an implementation measures the
 * anticipation**, which is the frame reader's blind spot one arm along (F285):
 * that one was calibrated to a capability rung, this one to an encoding nobody
 * had written yet. Both read as correct until the subject exists.
 *
 * So these two ask a **geometric** question instead — where is the line, not what
 * tag drew it — and the box is the lines' own bounding box rather than a layout
 * constant, so a different `SvgLayout` cannot silently move the answer.
 */
/**
 * The names this arm's legend draws — **a swatch and the text beside it**.
 *
 * **`legend` was hardcoded `false` here**, so the cell could never have closed
 * whatever the arm did: the third instance of a reader written before its
 * subject, in one file (F297). The other two were `border` asking for a stroked
 * `<rect width="100%">` and `interiorRules` counting every `<line>`.
 *
 * **A legend entry is structurally a swatch and a name**, which is what the
 * terminal draws too — `█ alpha` — so this is the entry's shape rather than a
 * guess at markup: a small square `<rect>` immediately followed by a `<text>`.
 * Squareness is the discriminator, because every other `<rect>` this arm emits
 * is a bar, a tile, a matrix cell or the page ground, and none of those is a
 * font-sized square by construction.
 */
function svgLegendNames(svg: string): ReadonlySet<string> {
  const out = new Set<string>();
  const pair = /<rect x="[-\d.]+" y="[-\d.]+" width="([\d.]+)" height="([\d.]+)"[^>]*\/>\s*<text[^>]*>([^<]*)<\/text>/gu;
  for (const m of svg.matchAll(pair)) {
    if (m[1] !== m[2]) continue;
    const body = (m[3] ?? "").trim();
    if (body !== "") out.add(body);
  }
  return out;
}

function svgLines(svg: string): readonly (readonly [number, number, number, number])[] {
  const out: (readonly [number, number, number, number])[] = [];
  for (const m of svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/gu)) {
    out.push([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const);
  }
  return out;
}

/** The bounding box of every line, which is the plot area this arm drew into. */
function svgBox(ls: readonly (readonly [number, number, number, number])[]): Readonly<{
  left: number; right: number; top: number; bottom: number;
}> {
  const xs = ls.flatMap((l) => [l[0], l[2]]);
  const ys = ls.flatMap((l) => [l[1], l[3]]);
  return {
    left: Math.min(...xs), right: Math.max(...xs),
    top: Math.min(...ys), bottom: Math.max(...ys),
  };
}

/**
 * A border, on the terminal reader's own terms: **something along the top and
 * something along the bottom.**
 *
 * `terminalDecisions` asks for a `RULE_ONLY` row opening with `┌` and one with
 * `└`, and `RULE_ONLY` admits spaces — so `   ┌            ┐`, which is the whole
 * of what `plotFrame: "corners"` draws, counts. Two corner marks are a border
 * there, so two corner segments are a border here, and the four styles line up:
 * `box` and `grid` have both edges, `rule` has a bottom and no top, `corners`
 * has segments at both.
 */
function svgBorder(svg: string): boolean {
  const ls = svgLines(svg);
  if (ls.length === 0) return false;
  const b = svgBox(ls);
  const flat = (l: readonly [number, number, number, number], y: number): boolean =>
    l[1] === l[3] && l[1] === y;
  return ls.some((l) => flat(l, b.top)) && ls.some((l) => flat(l, b.bottom));
}

/**
 * A rule **across the plot area**, which is not an edge of it — the same
 * distinction `terminalDecisions` draws when it skips `RULE_ONLY` rows.
 */
function svgInteriorRules(svg: string): number {
  const ls = svgLines(svg);
  if (ls.length === 0) return 0; // cells-ok — a count of SVG elements
  const b = svgBox(ls);
  const onEdge = (l: readonly [number, number, number, number]): boolean =>
    (l[1] === l[3] && (l[1] === b.top || l[1] === b.bottom)) ||
    (l[0] === l[2] && (l[0] === b.left || l[0] === b.right));
  return ls.filter((l) => !onEdge(l)).length; // cells-ok — a count of SVG elements
}

export function svgArm(block: Plot, theme: ResolvedTheme): ArmDecisions {
  return svgDecisions(plotToSvg(block, theme, SVG_DEFAULT_LAYOUT));
}
