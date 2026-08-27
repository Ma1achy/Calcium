// The arm seam, mutated — C12 I59, I61, I64, I65, §3ak.7.
//
// **One run for the seam rather than one per family**, because the families
// share the decisions and differ only in the marks: `positionalDecisions` is
// mutated once and every family that reads it is under the same row. Named for
// the seam and not the curve for that reason — it grows as the seven land.
//
// **The pass's own claim is what is under test here.** Step 3 says `figureOf`
// is the terminal's computation *moved*, so a decision changed inside it must
// change the terminal's frame — and where it does not, the member has no
// consumer yet and that is F84's class rather than a licence.
//
// **Two rows are about the seam and not about a renderer.** The `orientation`
// and run-break rows mutate a shared decision that the terminal reads *through*
// its own rasteriser, which is the only place a shared layer can be wrong in a
// way both arms agree about.
//
// **The stated survivor's condition expired and the thing it promised did not
// happen** (F286). It read: *`Figure.frame` is not mutated, because nothing reads
// the member; it closes when the SVG walks the figure.* The SVG walks the figure.
// The member is still unread — walking a figure and reading every member of one
// are different events, and the deferral named the one that was easy to check.
//
// Measured, it is three members and not one: `identity`, `frame` and `legend` are
// written by every emitter and read by neither arm, and they are exactly D10, D9
// and D13 — the terminal features the second arm has never been given. So they
// are **owed** rather than dead, and `U1a` is where that is asserted, because a
// mutation on them would fail nothing by construction and read as coverage.
//
// **And the command below used to be six terminal suites** (F287). A run named
// for the seam could tell *caught* from *survived* and could not tell *both arms
// moved* from *the terminal moved*, which is the whole of U1a's claim. Worse than
// that: `plot-curve-figure.test.ts` asserts the **figure**, so a row it catches
// has proved the figure changed and not that either renderer noticed.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
// **The baseline is in the command, and a survivor is what put it there.**
// Severing the column arm's read-back survived four suites — and the reason was
// not coverage of the *rule* but of the *fixture*: `categoricalColumnForm` is
// reached only by `orientation: "vertical"`, which the catalogue constructs
// eleven times and those four suites construct **zero** times. The corpus had
// the subject and the run did not ask it.
//
// So the run is gated by the pass's own gate. It costs about seven seconds a
// mutation; a seam mutation that survives for want of a fixture is a green run
// that means nothing, which is what F256 says about every zero-moved.
//
// **Both arms are in it now, and the two rendering gates with them.** A seam
// mutation has three places it can be caught and the report says which: a figure
// suite (the decision moved), a terminal gate (that arm consumed it), an SVG
// gate (so did the other). A row expecting `G…` or `SB…` is a row that has
// proved a renderer read the member, which no figure assertion can.
const CMD =
  "npx vitest run test/unit/plot-curve-figure.test.ts test/unit/plot.test.ts " +
  "test/unit/plot-y-axis.test.ts test/unit/plot-bar-values.test.ts " +
  "test/unit/plot-arm-unification.test.ts test/unit/plot-svg-path.test.ts " +
  "test/golden/plot.test.ts test/golden/terminal-baseline.test.ts " +
  "test/golden/svg-baseline.test.ts";
const FIGURE = "src/presentation/plot/figure.ts";
const DEFINITION = "src/presentation/plot/definition.ts";
const FURNITURE = "src/presentation/plot/furniture.ts";
const HEATMAP = "src/presentation/plot/heatmap.ts";
const SVG = "src/presentation/plot/svg.ts";
const ROLES = "src/presentation/plot/roles.ts";
const GLYPHROW = "src/presentation/plot/glyph-row.ts";
const DERIVE = "src/presentation/plot/derive.ts";
const STACK = "src/presentation/plot/stack.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 180_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT — the render did not return` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: DEFINITION,
    from: "      : figure.value;",
    to: "      : { range: data, ticks: [data.min, data.max], step: 0 };",
    why: "the terminal stops reading the shared axis and furnishes two raw bounds instead. If this survives, nothing downstream reads the figure and every row below is a claim about a value nobody takes",
  },
  mutations: [
    {
      // **The row that proves the SVG gate is in the command at all** (F287).
      // Nothing in `figure.ts` moves, so no figure assertion can see this: the
      // text marks are emitted exactly as before and the arm stops turning them
      // into elements. Under the old six-suite command it was uncatchable.
      name: "THE ARM: every text mark is clipped out of existence",
      file: SVG,
      // Re-anchored: the branch split on whether the label names a box
      // (F306), so the clip is `slot` and the gate reads it by that name.
      from: "      if (slot.bottom - slot.top < SVG_FONT_SIZE) continue;",
      to: "      if (slot.bottom - slot.top < SVG_FONT_SIZE * 100) continue;",
      expect: "U3",
    },
    {
      // **`absent` is a role and not a gap**, so the arm that draws a circle at
      // the fallback position draws the plausible wrong figure the role exists
      // to refuse. Swapped rather than deleted, so the branch still exists and
      // the mutation is a wrong *answer* rather than a missing one.
      name: "THE ARM: the absent datum draws, and the outlier does not",
      file: SVG,
      // Re-anchored: the test moved from the role's name to `GLYPH_SHAPE`, so
      // the partition has one statement and both arms answer to it (§3ak.21).
      from: "      if (GLYPH_SHAPE[m.role] === \"none\") continue;",
      to: "      if (m.role === \"outlier\") continue;",
      expect: "SB",
    },
    {
      // **`Figure.orientation` has exactly one consumer and this is it.** The
      // terminal reads `block.orientation` for itself, so a member of the shared
      // type is carried for one arm — which is why the row expects an SVG gate:
      // a terminal suite cannot tell this mutation from a no-op.
      name: "THE ARM: the projector stops reading the figure's orientation",
      file: SVG,
      from: "  const sideways = figure.orientation === \"horizontal\";",
      to: "  const sideways = false;",
      expect: "SB",
    },
    {
      // **The rung `U6b`'s tally is mostly about**: moving the stacking floor up
      // one rung turns the 24-to-8 colour edge from 45 pure `colour` cells into
      // an edge that moves geometry. The trace is a record and this is what a
      // record is for — the frames still render, every suite that asserts a
      // 24-bit frame still passes, and the ladder is a different shape.
      name: "THE RUNG: the plot stacks at 8-bit, not at the colour floor",
      file: DEFINITION,
      from: "  return caps.colourDepth === 1 && block.series.length > 1; // cells-ok — a series count",
      to: "  return caps.colourDepth <= 8 && block.series.length > 1; // cells-ok — a series count",
      expect: "U6b",
    },
    {
      // **`quartileRange`'s two arms collapsed into one.** A forest plot's
      // interval can reach past its observed range, so taking the boxplot arm
      // clips every confidence bound to the whiskers — still an interval, still
      // drawn, and narrower than the study reported.
      name: "THE INTERACTION: a forest plot takes the boxplot's extent",
      file: FIGURE,
      from: "    ? seriesRange(block.series, block)\n    : quartileRange(qs, block.form === \"forest\");",
      to: "    ? seriesRange(block.series, block)\n    : quartileRange(qs, false);",
      expect: "FD2",
    },
    {
      // **`absent` collapsed into `point`.** `normalisedSummary` falls `centre`
      // back to the median, so a row with no estimate becomes a mark at a
      // position the data never had — the plausible wrong figure the role exists
      // to refuse.
      name: "THE DEFECT: a forest row with no estimate draws a point anyway",
      file: FIGURE,
      // Re-anchored twice. First the role moved into the estimate's own literal
      // when the forest gained its pooled arm and its weight (§3ak.13); then the
      // three-way test left the loop entirely, because `forestRow` had the same
      // expression written out again and the terminal's answer for `absent` came
      // out of `row[NaN]` rather than a statement (§3ak.22, F299).
      from: "  if (!Number.isFinite(q.centre ?? q.median)) return \"absent\";",
      to: "  if (!Number.isFinite(q.centre ?? q.median)) return \"point\";",
      expect: "FD3",
    },
    {
      // The median given the mean's role. Both are a single mark on the box and
      // the terminal draws them with different glyphs — so this is the seam
      // saying one thing and the reader being told another, with every count
      // agreeing.
      name: "a median is emitted under the mean's role",
      file: FIGURE,
      from: "        marks.push(dot(centre, sm.median, \"median\", i));",
      to: "        marks.push(dot(centre, sm.median, \"mean\", i));",
      expect: "FD1",
    },
    {
      // The connector emitted after its ends rather than before, which is
      // `mergedRow`'s order and the order a reader resolves an overlap in.
      name: "a dumbbell's connector is drawn over its own ends",
      file: FIGURE,
      from: "        marks.push({ mark: { kind: \"polyline\", points: [[x, at(va)], [x, at(vb)]] }, layer: \"series\" });\n        marks.push(dot(x, at(va), \"point\", 0), dot(x, at(vb), \"point\", 1));",
      to: "        marks.push(dot(x, at(va), \"point\", 0), dot(x, at(vb), \"point\", 1));\n        marks.push({ mark: { kind: \"polyline\", points: [[x, at(va)], [x, at(vb)]] }, layer: \"series\" });",
      expect: "FD4",
    },
    {
      // Every strip at depth zero: a flame with all its frames on the base row,
      // which is a legible figure of a tree one level deep.
      name: "every strip lands at the root's depth",
      file: FIGURE,
      from: "            y: r.depth / (deepest + 1), // cells-ok — a depth",
      to: "            y: 0,",
      expect: "FT2",
    },
    {
      // The nodes family's identity taken from the graph arm for a tree, which
      // names nothing — `hierarchy` and `graph` are different fields and a tree
      // has no `graph`.
      name: "a tree's identity is read from the graph arm",
      file: FIGURE,
      from: "      : flatten(root).map((f) => f.label),",
      to: "      : [],",
      expect: "FN1",
    },
    {
      // **THE RULE INTERACTION.** A matrix's rows are named `""` by the gutter
      // and `row N` by the overflow notice, and the positional families invent
      // `series N` — three answers to *what is this row called*. Taking the
      // positional one puts a name in every matrix gutter that nothing else in
      // the frame agrees with.
      name: "THE INTERACTION: a matrix row takes the positional families' name",
      file: FIGURE,
      // Widened: `fieldFigure` emits the matrix's cell shape verbatim, so this
      // line alone matches two emitters (C12 §3ak.29).
      from: "    extent,\n    identity: block.series.map((sr) => sr.label ?? \"\"),",
      to: "    identity: identityOf(block),",
      expect: "FM4",
    },
    {
      // **The origin honouring dropped**, which flips every matrix vertically —
      // a plausible figure of the same data upside down.
      //
      // *The first form of this row swapped `FACING_MATRIX` for `FACING_DEFAULT`
      // and could never be caught: `facingOf` consults its fallback only when
      // `origin` is `null`, and all seven matrix forms declare `"top-left"`. The
      // constant is dead at every call site (F273), and the mutation indicted
      // the constant rather than the test.*
      name: "THE DEFECT: a matrix stops honouring its origin and draws flipped",
      file: FIGURE,
      // Widened: `fieldFigure` emits the matrix's cell shape verbatim, so this
      // line alone matches two emitters (C12 §3ak.29).
      from: "    orientation: ORIENTATION_UNUSED,\n    facing: facingOf(block, FACING_MATRIX),",
      to: "    facing: FACING_DEFAULT,",
      expect: "FM3",
    },
    {
      // The ramp read up the page rather than up the map — every colour
      // inverted, and every cell still a colour from the right ramp.
      name: "the matrix's reading is inverted, so the ramp runs backwards",
      file: FIGURE,
      // Widened: `fieldFigure` emits the matrix's cell shape verbatim, so this
      // line alone matches two emitters (C12 §3ak.29).
      from: "            // place the facing does not reach.\n            value: normalisedOf(v, extent, false),",
      to: "            value: normalisedOf(v, extent, true),",
      expect: "FM2",
    },
    {
      // The grid transposed by row: every cell in row 0. Still a rect in the
      // unit square, still one per reading.
      name: "every matrix row lands on the first one",
      file: FIGURE,
      // Widened: `fieldFigure` emits the matrix's cell shape verbatim, so this
      // line alone matches two emitters (C12 §3ak.29).
      from: "            y: seriesIndex / rows, // cells-ok — a row count\n            w: 1 / cols, // cells-ok — a column count\n            h: 1 / rows, // cells-ok — a row count\n            fill: true,\n            // **`invert: false`, and both arms already say so**: a matrix reads",
      to: "            y: 0, // cells-ok — a row count\n            w: 1 / cols, // cells-ok — a column count\n            h: 1 / rows, // cells-ok — a row count\n            fill: true,\n            // **`invert: false`, and both arms already say so**: a matrix reads",
      expect: "FM2",
    },
    {
      // The read-back severed: the ramp's domain computed a second time, which
      // is where a matrix and its own legend come to disagree about what the
      // darkest cell means.
      name: "the ramp's domain is computed again instead of read back",
      file: HEATMAP,
      from: "  const range = matrixFigure(block).extent;",
      to: "  const range = seriesRange(block.series, { ...block, yMin: 0 });",
      expect: "golden",
    },
    {
      // **THE RULE INTERACTION** (§3ak.7). `identity` is *what the figure's slots
      // are named* — a curve's series, a bar's categories — and taking the series
      // here gives a bar chart a gutter naming its own legend, with every count
      // still agreeing.
      name: "THE INTERACTION: the bar family's identity is the series, as a curve's is",
      file: FIGURE,
      from: "    identity: block.categories ?? [],",
      to: "    identity: identityOf(block),",
      expect: "FB1",
    },
    {
      // **D11**: the terminal defaults horizontal, the SVG arm defaulted
      // vertical, and the same block drew on its side in one of them. No
      // rasterisation difference accounts for it.
      name: "THE DEFECT: the bar family's default orientation flips",
      file: FIGURE,
      // Re-anchored onto the extracted `orientationOf`, which the bar and
      // distribution families now share — the sweep found the duplicate.
      from: "  return block.orientation === \"vertical\" ? \"vertical\" : \"horizontal\";",
      to: "  return block.orientation === \"horizontal\" ? \"horizontal\" : \"vertical\";",
      expect: "FB3",
    },
    {
      // The baseline from the data's own floor rather than zero — which is what
      // made `[10, 25, 15]` draw nothing for its first category, the frame this
      // rule exists for.
      name: "the baseline is the data's floor, so the smallest bar is empty",
      file: FIGURE,
      from: "  return Math.min(0, dataMin);",
      to: "  return dataMin;",
      expect: "FB2",
    },
    {
      // Bars stacked in one slot instead of spread across the categories: every
      // rect at x = 0, which is a plausible figure — one column, N bars — and a
      // chart of a different thing.
      name: "every category's rect lands in the first slot",
      file: FIGURE,
      // Re-anchored: the rect became one line when the family gained its
      // stem-and-head split, so a bar, a lollipop's stem and a histogram bin are
      // one expression (F280).
      from: "              : { kind: \"rect\", x, y: 0, w, h: top, fill: true },",
      to: "              : { kind: \"rect\", x: seriesIndex / per / n, y: 0, w, h: top, fill: true },",
      expect: "FB4",
    },
    {
      // **The height as the value rather than as the fraction.** Unnormalised,
      // every rect is out of the unit square — and nothing in the type says so,
      // which is why the row is here rather than in a comment.
      name: "the rect's height is the raw value, not the normalised one",
      file: FIGURE,
      from: "        const top = normalisedOf(v, value.range, false);",
      to: "        const top = v;",
      expect: "FB4",
    },
    {
      // **The read-back severed by re-nicing** — F210's defect restored at the
      // family next door: the columns drawn against a range the gutter does not
      // describe. *The first form of this row passed a block with `yMin`/`yMax`
      // stripped, which is a no-op for every fixture that declares neither; it
      // survived, and the survivor was the mutation rather than the test.*
      name: "the column arm nices the figure's range a second time",
      file: DEFINITION,
      from: "  const axis = figure.value;",
      to: "  const axis = valueAxisOf(figure.value.range, ticksFor(areaRows), block, block.yScale);",
      expect: "golden",
    },
    {
      // **A bubble's size channel scaled against the wrong maximum.** `sizes` is
      // the second series read positionally, and `bubbleRows` divides by
      // `max(1, …finite)`. Dividing by the *value* series' maximum keeps every
      // bubble a plausible size and makes none of them the size it is.
      name: "the size channel is normalised against the value series",
      file: FIGURE,
      from: "    const maxSize = Math.max(1, ...finite);",
      to: "    const maxSize = Math.max(1, value.range.max);",
      expect: "FS3",
    },
    {
      // **F271 silently corrected**, which is the mutation this family most
      // needs: dropping the channel from the figure is the *right* chart and the
      // wrong commit — no frame moves, the two arms disagree at step 4, and
      // nothing announces it. The row exists so the divergence cannot be made by
      // accident.
      name: "THE DIVERGENCE: the figure quietly stops drawing the size channel",
      file: FIGURE,
      // **Two lines, because one is ambiguous** — both families iterate the
      // series identically and the sweeper said so. An ambiguous anchor reports
      // as SURVIVED, which routes to *write a test* rather than *fix the anchor*
      // (F219).
      from: "    block.series.forEach((series, seriesIndex) => {\n      const span = Math.max(1, series.values.length - 1); // cells-ok — a sample count",
      to: "    block.series.slice(0, 1).forEach((series, seriesIndex) => {\n      const span = Math.max(1, series.values.length - 1); // cells-ok — a sample count",
      expect: "FS3",
    },
    {
      // **An absent size becomes a zero radius**, which the terminal draws as a
      // single dot — so *no size given* and *size zero* stop being different
      // statements at the seam that exists to keep them apart.
      name: "a missing size is a zero radius rather than an absence",
      file: FIGURE,
      from: "          ? undefined\n          : Math.abs(size) / maxSize;",
      to: "          ? 0\n          : Math.abs(size) / maxSize;",
      expect: "FS3",
    },
    {
      // **The SVG arm's old constant, moved into the shared layer.** Five ticks
      // regardless of height is what `plotToSvg` passed, and it is half of D2 —
      // so this row is the disagreement restored from the other side.
      //
      // **It read `CAUGHT ELSEWHERE` from the day it was written, and that was
      // the finding.** `T1.12` names real rows in `plot.test.ts` and none of
      // them fired: the tick count was caught by twenty golden frames and both
      // baselines and by no assertion whose subject it is. A whole-frame gate
      // reports that a picture moved, not which decision moved it. `U1a3` is
      // that assertion, and the coincidence it pins is why the disagreement
      // survived measurement — at height 12, the catalogue's commonest, the
      // derived count *is* five.
      name: "the tick count is a constant again, as the second arm had it",
      file: FIGURE,
      // Re-anchored when the duplicate derivation the sweeper found was
      // extracted to `axisOver` — one place, one anchor.
      from: "    : valueAxisOf(extent, ticksFor(plotAreaRows(block)), block, block.yScale);",
      to: "    : valueAxisOf(extent, 5, block, block.yScale);",
      expect: "U1a3",
    },
    {
      // **D4**: the scale dropped, which is what the second arm did by never
      // passing it. A log axis then picks linear ticks and every label is a real
      // number at a real row.
      name: "the scale is not passed, so a log axis gets linear ticks",
      file: FIGURE,
      from: "    : valueAxisOf(extent, ticksFor(plotAreaRows(block)), block, block.yScale);",
      to: "    : valueAxisOf(extent, ticksFor(plotAreaRows(block)), block);",
      expect: "FC9",
    },
    {
      // **THE RULE INTERACTION** (§3ak.7 C9). `orientation` is a block member
      // that means something else on the bar and distribution families, so
      // reading it here turns a line plot on its side in the arm that takes the
      // figure and leaves it upright in the arm that does not.
      name: "THE INTERACTION: the family's orientation is read from the block",
      file: FIGURE,
      // Two lines: the matrix family says `orientation: "vertical"` too — and
      // means nothing by it — so one line is ambiguous, which reports as
      // SURVIVED rather than as a bad anchor (F219).
      // Re-anchored when the three vacuous families took `ORIENTATION_UNUSED`:
      // the literal is `positionalDecisions`' alone now, and it means something.
      from: "    orientation: \"vertical\",",
      to: "    orientation: orientationOf(block),",
      expect: "FC7",
    },
    {
      // **C12 I4 and C12 I14**: the adjacency test gone, so a run spans the hole a
      // non-finite value leaves and the curve connects across a gap the terminal
      // breaks at. Plausible in every frame — a line where a line belongs.
      name: "a run spans the gap a non-finite sample leaves",
      file: FIGURE,
      from: "    if (v === null || !Number.isFinite(v)) { run = null; return; }",
      to: "    if (v === null || !Number.isFinite(v)) { return; }",
      expect: "FC2",
    },
    {
      // **C12 I61**: the inversion applied in the shared layer instead of by each
      // arm. Both arms then invert twice or not at all, and the figure is
      // upside down in exactly one of them.
      name: "THE INTERACTION: the marks arrive already inverted",
      file: FIGURE,
      from: "    const pt: Pt = [i / span, normalisedOf(v, range, false)];",
      to: "    const pt: Pt = [i / span, normalisedOf(v, range, true)];",
      expect: "FC1",
    },
    {
      // The legend's order, which is `mergedRow`'s: a claim about the data reads
      // after the thing it is a claim about (C04 I52, §3ag).
      name: "an annotation's entry leads the legend it is a claim about",
      file: FIGURE,
      from: "  return [\n    ...candles,\n    ...identityOf(block).map((label, i) => ({",
      to: "  return [\n    ...candles,\n    ...annotations,\n    ...identityOf(block).map((label, i) => ({",
      expect: "FC3",
    },
    {
      // **One identity list** (§3ak.7 C4): segments replace the series where a
      // form has them, so ignoring them lets the legend name a set the gutter
      // does not.
      name: "segments stop replacing the series, so two lists exist again",
      file: FIGURE,
      from: "    ? segs.map((sg) => sg.label)",
      to: "    ? block.series.map((sr, i) => sr.label ?? `series ${String(i + 1)}`)",
      expect: "FC6",
    },
    {
      // **The second door to the palette, reopened.** `legendEntries`' own
      // recorded defect: the swatch resolved from a different index than the
      // figure, so the legend named a colour nothing was drawn in.
      name: "THE DEFECT: the swatch is chosen from slot one, not the series' own",
      file: FURNITURE,
      from: "      : markOf(slot.seriesIndex ?? 0, ctx.capabilities),",
      to: "      : markOf(0, ctx.capabilities),",
      expect: "FC3",
    },
    {
      // Every series folded into one mark list with no slot, which is the
      // colour channel collapsing: one figure, one ref, and the legend still
      // naming four.
      name: "the marks carry no series slot, so every curve is series one",
      file: FIGURE,
      from: "        marks.push({ mark: { kind: \"polyline\", points }, layer: \"series\", seriesIndex });",
      to: "        marks.push({ mark: { kind: \"polyline\", points }, layer: \"series\", seriesIndex: 0 });",
      expect: "FC8",
    },
    {
      // **The role table's whole subject: six characters for seven roles is
      // legitimate and a seventh collapse is not.** `U7b` asserts the mark roles
      // are pairwise distinct with `mean`/`target` as the one recorded pair, so
      // giving the outlier the diamond is the defect the record exists to make
      // findable — and it is one the frame gates would report as 28 moved
      // baseline frames with no statement about why.
      name: "THE RECORD: an outlier is drawn with the mean's diamond",
      file: ROLES,
      from: "      outlier: g.dotted,",
      to: "      outlier: g.diamond,",
      expect: "U7b",
    },
    {
      // **A mean landing on the median given the ordinary mean's mark.** A cell
      // holds one glyph, so *they coincide* becomes *it is missing* — C04 I53's
      // subject, and the reason `meanOnMedian` sits beside the record rather than
      // inside it. No U row can see this: it is a frame fact, which is what a
      // baseline gate is for.
      name: "THE RUNG: a coincident mean loses its own mark",
      file: ROLES,
      from: "    meanOnMedian: g.diamondTee,",
      to: "    meanOnMedian: g.diamond,",
      expect: "baseline",
    },
    {
      // **A dumbbell's two ends told apart by tone alone.** The shape is what
      // survives the colour floor, which is the same argument `candleHollow`
      // makes one form along — so this is a 1-bit defect that every coloured
      // frame agrees with.
      name: "THE RUNG: a dumbbell's far end takes the near end's mark",
      file: ROLES,
      from: "    pairedPoint: g.hollow,",
      to: "    pairedPoint: g.filled,",
      expect: "baseline",
    },
    {
      // **A cap as wide as the box it caps**, which is the arm's own stated
      // reason for halving the slot: it reads as a second box edge rather than
      // as the whisker's end. `U7e`'s first version could not see this — it
      // counted every `<rect>` in the document and asked for two distinct
      // widths, satisfied by the box, the gutter and the page ground — and it
      // survived exactly this mutation before it was repointed at the spans.
      name: "THE ARM: a cap spans the whole slot",
      file: SVG,
      from: "        cap: () => { across(m.x, m.y, halfSlot / 2, 1, ink); },",
      to: "        cap: () => { across(m.x, m.y, halfSlot, 1, ink); },",
      expect: "U7e",
    },
    {
      // **The guard on the estimate, and only one of its two directions can be
      // measured.** `forestRow` asks `marksACell` before drawing, so severing it
      // stops every forest estimate being drawn and the frames say so.
      //
      // **The other direction cannot be measured and the row says so rather than
      // implying it.** Making the guard always true does not restore the old
      // defect: `at(undefined)` is `NaN`, `atX(NaN)` is `NaN`, and
      // `row[NaN] = mark` sets a property on an array rather than a cell, so the
      // terminal draws nothing for an absent estimate whatever the role says
      // (F299). That mutation survives every gate here, which is why it is not a
      // row — a survivor with no assertion behind it reads as coverage.
      //
      // **The guard keeps its place on asymmetry**: one branch against a mark at
      // a position the data never had, the first time anything clamps that
      // fallback. **The arm where the role does bite is the other one** —
      // `at(x, NaN)` yields a circle at `cx="NaN"`, so `GLYPH_SHAPE`'s `none` is
      // load-bearing in the SVG and the row above proves it.
      name: "THE RECORD: the terminal stops drawing a forest estimate at all",
      file: GLYPHROW,
      from: "  if (marksACell(role)) {",
      to: "  if (!marksACell(role)) {",
      expect: "baseline",
    },
    // **The seam's newest half, and the only rows whose subject is a *call***
    // (C12 I70, §3ak.27, F317). Every row above mutates a decision inside the
    // shared layer; these three switch the derivation off at the point of
    // application, which is the thing that was missing for the length of the
    // pass while `derive.ts` sat in the tree looking correct.
    //
    // **Each must be caught by BOTH gates**, and that is what the row is for. A
    // terminal gate alone means the second arm never had the derivation — which
    // is precisely the state F317 found; an SVG gate alone means the terminal
    // stopped applying it. The report names which fired.
    {
      name: "THE CALL: a histogram draws its samples rather than its bins",
      file: DERIVE,
      from: '    case "histogram": {\n      if (block.series.length === 0) return block;',
      to: '    case "histogram": {\n      if (true) return block;',
      expect: "baseline",
    },
    {
      name: "THE CALL: an ecdf draws its samples rather than its cumulative fraction",
      file: DERIVE,
      from: '    case "ecdf":\n      return {',
      to: '    case "ecdf":\n      return block ?? {',
      expect: "baseline",
    },
    {
      name: "THE CALL: a density plot draws its samples rather than its estimate",
      file: DERIVE,
      from: "      const { series: ds, range } = densitySeries(s, 100, block.bandwidth);",
      to: "      const { series: ds, range } = { series: s, range: { min: 0, max: 1 } };",
      expect: "baseline",
    },
    {
      // **The second arm's call site, mutated on its own.** The three above
      // switch the derivation off for both arms at once; this leaves the
      // terminal deriving and takes it away from the SVG, which reconstructs
      // F317's exact state. A gate that cannot tell those apart cannot say the
      // seam has two consumers.
      name: "THE SEAM: only the terminal derives, which is the state this rule was written about",
      file: SVG,
      from: "  const block = drawnBlock(given);",
      to: "  const block = given;",
      expect: "SB",
    },
    // **The three the sweep did not see** (F322, §3ak.29). Each lived in
    // `heatmapFormRows` and each is `Plot → Plot` with no width and no
    // capability — the shape, not the file, is what makes them one class.
    //
    // **They expect a terminal gate and not both**, and that is the honest
    // reading rather than a weaker one: the second arm refuses all three forms
    // today, so an SVG gate has nothing to say until the arms open. The row
    // that will change here is the one to watch — when `contour` draws, this
    // mutation starts moving SVG frames too, and a row still expecting only the
    // terminal is a row that stopped asking the second half.
    {
      name: "THE CALL: a field is drawn with the caller's own row labels, or none",
      file: DERIVE,
      from: '    case "contour":\n      return fieldAxes(block);',
      to: '    case "contour":\n      return block;',
      expect: "baseline",
    },
    {
      name: "THE CALL: a quiver has no scalar field, so there is nothing under the arrows",
      file: DERIVE,
      from: "      return fieldAxes(fieldIsMagnitude(block) && block.vectors !== undefined",
      to: "      return fieldAxes(false && block.vectors !== undefined",
      expect: "baseline",
    },
    {
      name: "THE CALL: a calendar renders as the pre-calendar matrix it always drew",
      file: DERIVE,
      from: '    case "calendar":',
      to: '    case "calendar":\n      if (true) return block;',
      expect: "baseline",
    },
    {
      // **The wiring, and it is a separate row on purpose.** The three above
      // sever the derivation; this leaves it intact and stops the terminal
      // calling it — F317's defect in the mirror, and the class a seam-level
      // row cannot reach because it passes on the day nothing calls the
      // mechanism.
      name: "THE SEAM: the field renderer takes the block it was given",
      file: HEATMAP,
      from: "  const block = drawnBlock(raw);",
      to: "  const block = raw;",
      expect: "baseline",
    },
    // **The ramp, which is a figure decision two sentences said was not**
    // (F324, §3ak.30). The first is the shipped defect put back: this arm
    // guessing a literal while the terminal reads the table. The second severs
    // the table itself, so **both** arms lose the ramp — which is what says the
    // member has two consumers and not one.
    {
      name: "THE ARM: the second arm guesses its ramp again, as it did for the length of the pass",
      file: SVG,
      from: "  const map = figure.ramp === null ? undefined : COLORMAPS[figure.ramp];",
      to: '  const map = COLORMAPS[block.colormap ?? "viridis"];',
      expect: "U9",
    },
    {
      name: "THE SEAM: a form's default ramp is dropped, so only a declared one survives",
      file: FIGURE,
      from: "  return block.colormap ?? RAMP_DEFAULT[block.form];",
      to: "  return block.colormap ?? null;",
      expect: "baseline",
    },
    // **The residue, drawn** (§3ak.29, F325, F326). These expect an **SVG** gate
    // and not the terminal's: the geometry crosses and the raster does not, so
    // the terminal never reads what these sever. That is I71's blind spot said
    // as a row — an unmoved terminal baseline proves nothing was disturbed and
    // not that the arms agree.
    {
      name: "THE ARM: a contour draws its painted field and none of its iso-lines",
      file: FIGURE,
      from: "      for (const [from, to] of contourSegments(block.series, contourLevels(block, extent))) {",
      to: "      for (const [from, to] of []) {",
      expect: "SB",
    },
    {
      name: "THE ARM: the crossings are the cell corners, so every iso-line is a staircase",
      file: FIGURE,
      from: "  const d = b - a;\n  if (d === 0) return 0.5;",
      to: "  const d = b - a;\n  if (true) return 0.5;",
      expect: "SB",
    },
    {
      name: "THE ARM: a still cell draws an arrow, which `atan2(0, 0)` points east",
      file: FIGURE,
      from: "      const mag = Math.hypot(u, v);\n      if (mag === 0) return;",
      to: "      const mag = Math.hypot(u, v) || 1;",
      expect: "SB",
    },
    {
      name: "THE CHANNEL: every arrow is one colour, so the magnitude is drawn nowhere",
      file: FIGURE,
      from: "        : { value: (mag - colourBy.min) / (colourBy.max - colourBy.min) };",
      to: "        : {};",
      expect: "SB",
    },
    {
      name: "THE RECORD: a matrix's identities go back on the x axis, naming nothing",
      file: SVG,
      from: "      if (valueOnX || axis === null) {",
      to: "      if (valueOnX) {",
      expect: "SB",
    },
    {
      // **The residue's third form.** `within` is a fraction of a band and
      // `eighths` is how many of a cell's eight sub-rows that buys; severing the
      // first leaves both arms with a flat strip and the colour intact, which is
      // the half of the form that was never the problem.
      name: "THE ARM: a horizon's fold loses its within-band height",
      file: FIGURE,
      from: "    return { band, sign, within: size > 0 ? Math.min(1, scaled - band) : 0 };",
      to: "    return { band, sign, within: 1 };",
      expect: "baseline",
    },
    {
      // **And the clamp `G6` found missing.** A sample past the caller's pin
      // lands in the deepest band with `scaled − band > 1`; the terminal never
      // showed it because `horizonGrid` takes `min(h · 8, …)` a line later.
      name: "THE ARM: the fold is unclamped, so a pinned sample draws past the area",
      file: FIGURE,
      from: "within: size > 0 ? Math.min(1, scaled - band) : 0 };",
      to: "within: size > 0 ? scaled - band : 0 };",
      expect: "G6",
    },
    // **Family 8's aggregating three** (§3ak.33). The fold is one function at
    // two arguments, so severing the figure's argument is the only way to take
    // it from one arm and not the other — which is what these ask.
    {
      name: "THE FOLD: the stack is resampled to one column, so every band is a line",
      file: FIGURE,
      from: "  const bands = cols === 0 ? [] : stackBands(block.series, cols, centred); // cells-ok — a sample count",
      to: "  const bands = cols === 0 ? [] : stackBands(block.series, 1, centred); // cells-ok — a sample count",
      expect: "SB",
    },
    {
      name: "THE AXIS: the stack takes the series' range rather than the fold's",
      file: FIGURE,
      from: "  const pinned: Plot = { ...block, yMin: block.yMin ?? span.min, yMax: block.yMax ?? span.max };",
      to: "  const pinned: Plot = block;",
      expect: "SB",
    },
    // **These three moved from `figure.ts` to `stack.ts`, and that is the fix
    // rather than a rename** (F329, §3ak.34). Mutating the fold now moves both
    // arms, which is what one implementation means; while there were two, the
    // same mutation moved one and the row named the gate that watches it.
    {
      name: "THE BASELINE: a waterfall's bars all start at zero, so it is a bar chart",
      file: STACK,
      from: "    return { from: isTotal ? 0 : from, to: running, drawn: v !== null && Number.isFinite(v) };",
      to: "    return { from: 0, to: running, drawn: v !== null && Number.isFinite(v) };",
      expect: "SB",
    },
    {
      name: "THE TOTAL: a total bar adds instead of restarting, so the sum is drawn twice",
      file: STACK,
      from: "      running = isTotal ? v : running + v;",
      to: "      running = running + v;",
      expect: "SB",
    },
    {
      // **The mutation no baseline can catch, which is why the row exists.** No
      // fixture has a null, so this is the bounds walk's convention restored and
      // every frame in the corpus is byte-identical either way. T1.102
      // constructs the state.
      name: "THE NULL: a reading that is absent moves the running total anyway",
      file: STACK,
      from: "    if (v !== null && Number.isFinite(v)) {",
      to: "    if (true) {",
      expect: "T1.102",
    },
    {
      // **And the arm calls it rather than holding a copy** (F329). This is the
      // structural half: sever the call and `waterfallFigure` has no fold at all.
      name: "THE CALL: the second arm walks its own fold rather than calling the shared one",
      file: FIGURE,
      from: "  const { bars, min: lo, max: hi } = block.form === \"gantt\"\n    ? ganttBars(values, block.offsets ?? [])\n    : waterfallBars(values, block.totals ?? []);",
      to: "  const { bars, min: lo, max: hi } = { bars: [], min: 0, max: 0 };",
      expect: "SB",
    },
    {
      // **Family 8's residue** (§3ak.34). A gantt's task and a waterfall's step
      // are one emitter, so the mutations that separate them are about the two
      // arithmetics and the extent, not about the mark.
      name: "THE ORIGIN: a gantt's tasks all start at the axis floor, so it is a bar chart",
      file: STACK,
      from: "    const from = offsets[i] ?? 0;",
      to: "    const from = 0;",
      expect: "SB",
    },
    {
      name: "THE FLOOR: a gantt zero-anchors like a bar, so a project starting late starts at zero",
      file: FIGURE,
      from: '      : block.form === "gantt" || block.form === "timeline"\n        ? data\n        : { min: baselineOf(data.min), max: data.max };',
      to: "      : { min: baselineOf(data.min), max: data.max };",
      expect: "G6",
    },
    {
      name: "THE CENTRE: a funnel's bars are anchored rather than centred, so it is a bar chart",
      file: FIGURE,
      from: "        mark: { kind: \"rect\", x: i / n, y: (1 - share) / 2, w: 1 / n, h: share, fill: true }, // cells-ok — a category count",
      to: "        mark: { kind: \"rect\", x: i / n, y: 0, w: 1 / n, h: share, fill: true }, // cells-ok — a category count",
      expect: "SB",
    },
    {
      // **A funnel's reading is a share, so an axis under it labels positions
      // nothing is drawn at** (I73, F330). The record and the emitter must agree,
      // and `FV1` is what compares them against the frames.
      name: "THE SHARE: a funnel gets a value axis, and its bars are widths",
      file: FIGURE,
      from: "      });\n    });\n  }\n  return { ...decisions, value: null, marks };\n}",
      to: "      });\n    });\n  }\n  return { ...decisions, marks };\n}",
      expect: "SB",
    },
    {
      // **The slot the frame found** (F331). Mutating it collapses every
      // categorical row onto one colour, which is the state eight frames were in.
      name: "THE SLOT: a categorical row takes the series' colour rather than its own",
      file: FIGURE,
      from: "  return per > 1 ? seriesIndex : ROW_IS_AN_IDENTITY[form] ? category : 0; // cells-ok — a series count",
      to: "  return per > 1 ? seriesIndex : 0; // cells-ok — a series count",
      expect: "U10",
    },
    {
      // **And the other direction**: a histogram's bins are one distribution, so
      // giving them slots draws eight colours for one thing — the defect
      // `ROW_IS_AN_IDENTITY` was written against, arriving on the arm that had
      // never read it.
      name: "THE BINS: every categorical row takes its own colour, including a histogram's",
      file: FIGURE,
      from: "  return per > 1 ? seriesIndex : ROW_IS_AN_IDENTITY[form] ? category : 0; // cells-ok — a series count",
      to: "  return per > 1 ? seriesIndex : category; // cells-ok — a series count",
      expect: "SB",
    },
    {
      // **The last two of family 8's residue** (§3ak.35). A timeline's events are
      // instants and a bullet's rows are three scales, so what these mutate is
      // the pin and the per-row range rather than a mark.
      name: "THE PIN: a timeline's marks and its labels come from two ranges",
      file: FIGURE,
      from: "  const lo = block.yMin ?? range?.min;\n  const hi = block.yMax ?? range?.max;",
      to: "  const lo = block.yMin;\n  const hi = block.yMax;",
      expect: "SB",
    },
    {
      name: "THE SHARED SCALE: a bullet's rows are put on one axis, which is what the form forbids",
      file: FIGURE,
      from: "    const own = { min: q.min, max: q.max };",
      to: "    const own = { min: qs[0]?.min ?? 0, max: qs[0]?.max ?? 1 };",
      expect: "G6",
    },
    {
      name: "THE TRACK: a timeline's rule stops at its first and last event",
      file: FIGURE,
      from: "        mark: { kind: \"polyline\", points: [[centre, 0], [centre, 1]] },",
      to: "        mark: { kind: \"polyline\", points: [[centre, 0], [centre, 0.5]] },",
      expect: "SB",
    },
    {
      // **A reading with no ramp** (commitment 68). Dropping it restores the old
      // `continue`, and every band comes out at full ink — the bullet is the
      // first mark that could ever have shown it.
      name: "THE DENSITY: a reading with no ramp is dropped, so four bands are one",
      file: SVG,
      from: "          opacity = ` fill-opacity=\"${n(0.15 + 0.85 * Math.max(0, Math.min(1, m.value)))}\"`;",
      to: "          opacity = \"\";",
      expect: "SB",
    },
    {
      // **The facets** (§3ak.36). A composition is whatever its children are, so
      // what these mutate is the composing rather than any figure.
      name: "THE COLUMN: a refused child collapses the ones after it leftwards",
      file: SVG,
      from: "    x += width;",
      to: "    if (child !== null) x += width;",
      expect: "U11",
    },
    {
      name: "THE INHERITANCE: a composition refuses when any child does, rather than when none draws",
      file: SVG,
      from: "  return drawn === 0 ? null : parts.join(\"\"); // cells-ok — a facet count",
      to: "  return drawn === facets.length ? parts.join(\"\") : null; // cells-ok — a facet count",
      expect: "U11",
    },
    {
      name: "THE ID: two facets share a clip path, because the child keeps its own id",
      file: SVG,
      from: "      { ...facet, id: `${block.id}-f${String(i)}` }, // cells-ok — a facet index",
      to: "      facet, // cells-ok — a facet index",
      expect: "SB",
    },
    {
      // **The gutter is a share and the text in it is not** (I63). Dropping the
      // scale clips every child's labels, which the SVG baseline sees as bytes
      // and a reader sees as `.00`.
      name: "THE GUTTER: a child's gutter is a share of its own column, so its labels clip",
      file: SVG,
      from: "      { ...layout, width, gutter: Math.min(0.5, layout.gutter * (width > 0 ? layout.width / width : 1)) },",
      to: "      { ...layout, width },",
      expect: "SB",
    },
    {
      name: "THE FILL: a stacked band is an outline, so the reader integrates two curves",
      file: FIGURE,
      from: "        mark: { kind: \"polyline\", points: [...lower, ...upper.reverse()], closed: true, fill: true },",
      to: "        mark: { kind: \"polyline\", points: [...lower, ...upper.reverse()], closed: true },",
      expect: "SB",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
