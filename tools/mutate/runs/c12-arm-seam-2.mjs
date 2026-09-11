// The arm seam, mutated — shard 2 of 3, rows 31–60 of ninety.
// C12 I59, I61, I64, I65, §3ak.7.
//
// **The split is a bound and not a taxonomy** (F1105). One file carried all
// ninety, at about twenty seconds a pass in this container and twenty-two
// hundred and thirty-seven seconds measured — eighty-three per cent of
// `sweep.mjs`'s forty-five-minute bound on the only regime its author could
// see — and it was killed at the bound on a runner with nothing caught and
// one file restored from the snapshot. Raising the bound was refused: a
// shard runs thirty-odd runs against a three-hundred-minute job, so a bound
// that admits this one breaks the shard. `shardOf` is round-robin over the
// sorted names, so three adjacent files land in three different jobs.
//
// **The membership rule is position in that list, not the family.** This is
// rows 31 to 60; the rest are in `c12-arm-seam-1.mjs` and `c12-arm-seam-3.mjs`. A thematic partition would have
// been a judgement about which family a row belongs to, and a name that
// becomes the membership rule is how the odd member goes in unexamined — so
// the shards are numbered and the boundary is stated rather than inferred.
// A new row goes in whichever shard is furthest under the bound.
//
// **The command is the same twelve suites in all three, and so is the
// control.** Narrowing a shard to the suites its own rows name would be
// faster and is F287's defect re-introduced one level down: a command
// covering one arm makes every row in it inherit the gap at once, and no
// reading of a `from`/`to` shows it. The control is `runPass`'s proof that
// the pass can see a kill at all, so each shard pays one.
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
// **`plot-mutations.test.ts` is in this list because a row's `expect` is a claim
// about an instrument, and this run could not invoke that one** (F336). `THE
// NULL` survived a whole pass while the row written against it — `T1.102`, which
// fails by hand in one second — sat in a file the command does not name. A
// `caught` against a corpus that is short is the defect the path list exists to
// prevent, one step further along than it was checking.
//
// **The comment is above the string and not inside it**, because `testPathsOf`
// collapses `"…" + "…"` and a comment between the two halves stops it: putting
// this note in the middle made the file it documents invisible to the check that
// found it.
// **`plot-shared-geometry.test.ts` joined for `G1e`** (F347), which is F336's
// own remedy applied the moment the anchor check named it: a row expecting an
// instrument this command cannot invoke reports `CAUGHT ELSEWHERE` at best and
// `SURVIVED` at worst, and either reads as a fact about the code.
const CMD =
  "npx vitest run test/unit/plot-curve-figure.test.ts test/unit/plot.test.ts " +
  "test/unit/plot-y-axis.test.ts test/unit/plot-bar-values.test.ts " +
  "test/unit/plot-arm-unification.test.ts test/unit/plot-svg-path.test.ts " +
  "test/golden/plot.test.ts test/golden/terminal-baseline.test.ts " +
  "test/unit/plot-mutations.test.ts test/unit/plot-arm-disagreement.test.ts " +
  "test/unit/plot-shared-geometry.test.ts test/golden/svg-baseline.test.ts";
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
      from: "      paired: g.hollow,",
      to: "      paired: g.filled,",
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
    },  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
