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
    if (first < 0) {
      // **A row with no edge is not an empty row.** The tiles family draws its
      // names inside the figure and frames nothing, so skipping these reported
      // the terminal's treemap as having no labels while it was drawing six —
      // a disagreement invented by the parser. Found by reading the extraction
      // beside the frame it came from.
      for (const w of l.matchAll(WORD)) identity.push(w[0]);
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

  // The x row is the first line below the border that is not itself frame.
  const xRow = below.find((l) => !RULE_ONLY.test(l) && l.trim() !== "");
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
  const out: { body: string; clipped: boolean }[] = [];
  for (const m of svg.matchAll(/<text\s([^>]*)>([^<]*)<\/text>/gu)) {
    out.push({
      body: (m[2] ?? "").trim(),
      // **A clipped label names a thing; an unclipped one names a value.** The
      // tiles and nodes families clip every label to its own rectangle, which is
      // what lets a label stop itself without font metrics — so the attribute
      // that exists for hazard 4 also partitions the two kinds of text this arm
      // draws.
      clipped: (m[1] ?? "").includes("clip-path="),
    });
  }
  return out;
}

/** The SVG's decisions, read out of its elements. Private: `svgArm` is the seam. */
function svgDecisions(svg: string | null): ArmDecisions {
  if (svg === null) return NOTHING;
  const all = texts(svg).filter((t) => t.body !== "");
  return {
    drawn: true,
    numericLabels: all.filter((t) => !t.clipped && NUMERIC.test(t.body)).map((t) => t.body),
    identityLabels: all.filter((t) => t.clipped || !NUMERIC.test(t.body)).map((t) => t.body),
    // **The ground is not a border.** `<rect width="100%">` paints the page; a
    // border would be a stroked rectangle round the plot area, and this arm
    // draws none.
    border: /<rect[^>]*width="100%"[^>]*stroke=/u.test(svg),
    interiorRules: [...svg.matchAll(/<line\s/gu)].length,
    legend: false,
  };
}

export function svgArm(block: Plot, theme: ResolvedTheme): ArmDecisions {
  return svgDecisions(plotToSvg(block, theme, SVG_DEFAULT_LAYOUT));
}
