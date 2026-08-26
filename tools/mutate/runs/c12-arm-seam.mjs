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
      from: "    identity: block.series.map((sr) => sr.label ?? \"\"),",
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
      from: "    facing: facingOf(block, FACING_MATRIX),",
      to: "    facing: FACING_DEFAULT,",
      expect: "FM3",
    },
    {
      // The ramp read up the page rather than up the map — every colour
      // inverted, and every cell still a colour from the right ramp.
      name: "the matrix's reading is inverted, so the ramp runs backwards",
      file: FIGURE,
      from: "            value: normalisedOf(v, extent, false),",
      to: "            value: normalisedOf(v, extent, true),",
      expect: "FM2",
    },
    {
      // The grid transposed by row: every cell in row 0. Still a rect in the
      // unit square, still one per reading.
      name: "every matrix row lands on the first one",
      file: FIGURE,
      from: "            y: seriesIndex / rows, // cells-ok — a row count",
      to: "            y: 0,",
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
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
