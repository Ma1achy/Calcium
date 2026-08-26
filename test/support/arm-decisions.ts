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
  /**
   * Is a **colour ramp** drawn — a continuous key, as against a discrete one.
   *
   * **The sixth column, and the record had five** (F316). The paired sheet shows
   * a ramp under every matrix-family terminal frame and none under any SVG, and
   * `heatmap.legend` reads `agree` because both arms answer `false` — the SVG
   * having none, the terminal because its ramp is *coloured spaces* and the
   * reader took stripped text. **A rule table is exhaustive over the rules you
   * stated and blind to one you did not**, so this is an axis the record lacked
   * rather than a reader to widen.
   */
  ramp: boolean;
  /**
   * Does the frame **say that data was withheld** — a drop, a truncation.
   *
   * The seventh column, and its disposition is `legitimate` (F318). The terminal
   * withholds because a cell is a quantum: a heatmap past its width drops leading
   * columns and says `· N older not shown`, a form with more rows than it has
   * says `+N more` (C12 I8). The second arm scales its box across whatever it is
   * given and has **nothing to drop** — not *has not implemented dropping*. So
   * the two differ and always will, and the row fails the day the SVG grows a
   * drop rule of its own, which is the seam leaking the other way.
   */
  notice: boolean;
}>;

const NOTHING: ArmDecisions = Object.freeze({
  drawn: false, numericLabels: [], identityLabels: [], border: false, interiorRules: 0, legend: false,
  ramp: false, notice: false,
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
const LEGEND_TAIL = /\s{2,}(?:[^\s\w]{1,3}\s+[A-Za-z][\w.\-…]*(?: [A-Za-z][\w.\-…]*)*(?:\s+[\d.]+%?)?\s*)+$/u;

/**
 * A **colour ramp**, on either arm: three or more adjacent swatches carrying
 * different colours, bracketed by the two readings they run between.
 *
 * **Bracketed is what makes it a legend rather than the figure.** A heatmap's
 * own cells are runs of background-coloured spaces too, so *a run of swatches*
 * matches the picture; what only the key has is a number at each end — Granite's
 * `Min ▮▮▮▮▮ Max`, and the terminal's own comment says the bounds bracket the bar
 * so that the two numbers name the two ends they sit against.
 *
 * **This reader takes the frame with its colours in it, and that is the whole
 * finding** (F316, F297's sixth instance). The ramp *is* spaces, so a reader on
 * stripped text sees `0.19          100 · 16 older not shown` and an entirely
 * blank figure above it — reporting `false` for a thing plainly on the page, and
 * `agree` for a cell where one arm draws a key and the other draws nothing.
 *
 * **Stated limit**: a figure row of background-coloured cells with a reading at
 * each end would match. None exists — measured over 362 cells, the eleven forms
 * that answer `true` are the matrix family plus `contour`, `quiver` and
 * `horizon`, and every one of them draws a key — and `AD6` holds the case that
 * would collapse it: the heatmap's own cells, same alphabet, no bounds.
 */
const BG = /\x1b\[48;2;(\d+;\d+;\d+)m/gu;
const BOUND = /-?[\d.,]+\s*[%a-zA-Z]{0,3}/u;

export function terminalRamp(raw: string): boolean {
  BG.lastIndex = 0;
  const runs: { colours: Set<string>; from: number; to: number }[] = [];
  let current: { colours: Set<string>; from: number; to: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = BG.exec(raw)) !== null) {
    // A swatch is the background sequence plus the single cell it paints, so
    // two swatches are adjacent when the next match begins one cell on.
    const adjacent = current !== null && m.index === current.to;
    if (adjacent && current !== null) { current.colours.add(m[1]!); current.to = BG.lastIndex + 1; }
    else { current = { colours: new Set([m[1]!]), from: m.index, to: BG.lastIndex + 1 }; runs.push(current); }
  }
  return runs.some((r) => {
    if (r.colours.size < 3) return false; // cells-ok — a swatch count
    const before = stripSgr(raw.slice(0, r.from)).trim();
    const after = stripSgr(raw.slice(r.to)).trim();
    return BOUND.test(before) && BOUND.test(after);
  });
}

/**
 * The same question of an SVG: a gradient, or three adjacent equal rects in a
 * progression, with text at both ends.
 *
 * **Measured before the column existed: 0 of 181 frames.** The arm has no ramp
 * at all — no `<linearGradient>`, no `<defs>` — so this returns `false` for the
 * whole corpus today, which is what makes the cell an open disagreement rather
 * than a reader defect.
 */
export function svgRamp(svg: string): boolean {
  if (/<(?:linearGradient|defs)\b/u.test(svg)) return true;
  // **Bracketing, not adjacency — and the two drafts before this one are why.**
  //
  // The first asked for three consecutive `<rect>` of differing fill in document
  // order. That is a *discrete* key: **96 of 362 cells**, every `line` with a
  // three-entry legend.
  //
  // The second added geometry and reported **0**, which is the right answer for
  // the wrong reason. A heatmap draws 450 touching rects of differing fill, so it
  // *is* a run of swatches; what saved the reader was sorting every row's cells
  // into one list by `x`, which interleaves the rows and breaks every run at its
  // second element. A single-row matrix would have gone straight through, and a
  // cell reading `false` because the sort was wrong is indistinguishable from one
  // reading `false` because the arm has no ramp.
  //
  // **What separates a key from a figure is that a key is bracketed by its
  // bounds** — Granite's `Min ▮▮▮▮▮ Max`, which is the terminal side's own test.
  // So: a run along one row, and a `<text>` beside each end of it.
  const swatches = [...svg.matchAll(/<rect\b[^>]*\/?>/gu)].map((r) => r[0]).flatMap((el) => {
    const num = (k: string): number | null => {
      const m = new RegExp(`\\b${k}="(-?[\\d.]+)"`, "u").exec(el);
      return m === null ? null : Number(m[1]);
    };
    const fill = /\bfill="([^"]+)"/u.exec(el)?.[1];
    const x = num("x"), y = num("y"), w = num("width"), h = num("height");
    return fill === undefined || x === null || y === null || w === null || h === null
      ? [] : [{ fill, x, y, w, h }];
  });

  const labels = [...svg.matchAll(/<text\b[^>]*\bx="(-?[\d.]+)"[^>]*\by="(-?[\d.]+)"[^>]*>[^<]+<\/text>/gu)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

  const byRow = new Map<string, { fill: string; x: number; y: number; w: number; h: number }[]>();
  for (const sw of swatches) {
    const key = `${String(Math.round(sw.y))}:${String(Math.round(sw.h))}`;
    const bucket = byRow.get(key) ?? [];
    bucket.push(sw);
    byRow.set(key, bucket);
  }

  for (const row of byRow.values()) {
    row.sort((a, b) => a.x - b.x);
    let from = 0;
    for (let i = 1; i <= row.length; i += 1) { // cells-ok — an element index
      const a = row[i - 1]!;
      const b = row[i];
      if (b !== undefined
        && Math.abs(b.x - (a.x + a.w)) <= 1 && Math.abs(a.w - b.w) <= 1 && a.fill !== b.fill) continue;
      const run = row.slice(from, i);
      from = i;
      if (run.length < 3) continue; // cells-ok — a swatch count
      const head = run[0]!;
      const tail = run[run.length - 1]!;
      // **Beside the bar, not merely near it.** A bound *names the end it sits
      // against*, so it is centred on the swatch's own band within one text
      // line. Measured: with a slack of `2 · h` the `latency` figure fired — 90
      // touching cells 92 px tall, with `p50 · p90 · p99` a hundred pixels below
      // them landing inside the window. A key is a bar and a figure is not.
      const mid = head.y + head.h / 2;
      const band = (l: { y: number }): boolean => Math.abs(l.y - mid) <= SVG_FONT_ROW;
      if (labels.some((l) => band(l) && l.x < head.x) && labels.some((l) => band(l) && l.x > tail.x + tail.w)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Does the frame say something was withheld — `+N more`, `N older not shown`.
 *
 * **One predicate for both halves of the same statement.** C12 I8's notice and the
 * matrix's drop notice are the same claim in two vocabularies, and a column that
 * saw only one would report the axis as covered while missing the other.
 */
const WITHHELD = /\+\d+\s+more\b|\b\d+\s+older not shown\b/u;

export function saysWithheld(text: string): boolean {
  return WITHHELD.test(stripSgr(text));
}

/** Escape sequences out, so a reader that wants text gets text and nothing else. */
export function stripSgr(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/gu, "");
}

/**
 * **Takes the frame with its colours in it** (F316). This used to be handed
 * stripped lines by every caller, which is a decision about what the reader may
 * see made at the call site — and it cost the ramp column: the heatmap's key is
 * background-coloured spaces, so stripped text shows a blank figure and no key.
 * The reader strips what it needs and keeps what it needs.
 */
export function terminalDecisions(raw: readonly string[]): ArmDecisions {
  const rows = raw.filter((l) => stripSgr(l).length > 0);
  if (rows.length === 0) return NOTHING;
  const ramp = rows.some((l) => terminalRamp(l));
  const notice = rows.some((l) => saysWithheld(l));
  const lines = rows.map(stripSgr);

  let bottom = -1;
  for (const [i, l] of lines.entries()) if (BOTTOM.test(l) && RULE_ONLY.test(l)) bottom = i;
  const border = lines.some((l) => TOP.test(l) && RULE_ONLY.test(l)) && bottom >= 0;

  const area = bottom >= 0 ? lines.slice(0, bottom) : lines;
  const below = bottom >= 0 ? lines.slice(bottom + 1) : [];

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

  // **The lines below the border carry a `below` legend**, and they were never
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
    ramp,
    notice,
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
    ramp: svgRamp(svg),
    // **`false` for every document this arm can produce, and that is the claim.**
    // The terminal withholds because a cell is a quantum; this arm scales its box
    // across whatever it is given and has nothing to drop (F318). Written as a
    // predicate over the text rather than as a constant, so it answers the day
    // the arm grows one and the `legitimate` row fails as it should.
    notice: saysWithheld(svg),
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
