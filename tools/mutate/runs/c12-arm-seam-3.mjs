// The arm seam, mutated — shard 3 of 3, rows 61–90 of ninety.
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
// rows 61 to 90; the rest are in `c12-arm-seam-1.mjs` and `c12-arm-seam-2.mjs`. A thematic partition would have
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
      // **`SB` could not see this and the pass said so** (F336). Every facet
      // fixture names its children `f1 … f4`, and a curve facet emits **no clip
      // path at all** — `smallmultiples/default` has zero where `bar/default`
      // has five — so the guard had no instance and the mutation survived
      // reporting nothing. `U11` constructs two `bar` children with one id.
      name: "THE ID: two facets share a clip path, because the child keeps its own id",
      file: SVG,
      from: "      { ...facet, id: `${block.id}-f${String(i)}` }, // cells-ok — a facet index",
      to: "      facet, // cells-ok — a facet index",
      expect: "U11",
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
      // **The colour key** (§3ak.37). Continuous where the reading is, discrete
      // where the data is — a horizon's bands are a quantisation and not a
      // resolution, so its key is one swatch per band.
      name: "THE KEY: a form with a ramp draws no key, which is the cell that was open",
      file: SVG,
      from: "  if (figure.ramp !== null && figure.extent !== null && label !== undefined) {",
      to: "  if (false && figure.ramp !== null && figure.extent !== null && label !== undefined) {",
      expect: "SB",
    },
    {
      name: "THE BANDS: a horizon's key is a gradient, so it claims a continuity the figure has not got",
      file: SVG,
      from: '      const bands = block.form === "horizon" ? horizonBandCount(block) : 0; // cells-ok — a band count',
      to: "      const bands = 0; // cells-ok — a band count",
      expect: "SB",
    },
    {
      // **A key with no scale beside it is decoration** (§3). Dropping the
      // bounds leaves a bar naming nothing, and `terminalRamp`'s SVG twin wants
      // the bracketing.
      name: "THE BRACKET: the key loses its bounds, so it is a bar naming nothing",
      file: SVG,
      from: '        parts.push(text(left - 4, "end", lo), ...bar, text(right + 4, "start", hi + levels));',
      to: "        parts.push(...bar);",
      expect: "AD8",
    },
    {
      // **I49's sentence is about a legend and not about a terminal** (F338).
      // Reverting to the bounds alone is what the arm shipped for the whole
      // campaign, and the `ramp` column read `agree` through all of it.
      //
      // **Planted in `svg.ts` and not in `levelCaption`, which is where the
      // first draft put it** (F348). A mutation in the shared function moves
      // **both** arms, so they still agree and `AD1` still passes — the run
      // reported `CAUGHT ELSEWHERE`, by a golden frame, for a mutation whose
      // whole subject is one arm having a thing the other has not. An arm-seam
      // mutation is arm-local or it is testing something else.
      name: "THE LEVELS: the key names the two readings it runs between and not the ones its lines are",
      file: SVG,
      // Re-anchored 2026-09-04: the caption takes the separator, not the caps —
      // the image arm has no width convention to hand it (G4, F665).
      from: "      const levels = levelCaption(block, extent, IMAGE_SEPARATOR);",
      to: '      const levels = "";',
      expect: "AD1",
    },
    {
      // **The two halves of a diverging map are the two directions** (F341), so
      // a linear ramp over the bands shows a cold end the figure never enters.
      // `keyReadings` cannot see it and `svg-baseline` can — which is the
      // division of labour the record is built on.
      name: "THE HALF: a horizon's key ramps linearly across the bands the figure folds",
      file: SVG,
      from: "              horizonBandT({ band: i, sign: 1 }, bands, map.kind === \"diverging\")),",
      to: "              bands === 1 ? 1 : i / (bands - 1)),",
      expect: "SB",
    },
    {
      // **`seriesIndex` is the colour slot and cannot also be the shape**
      // (§3ak.42, F344). Reverted, the ends carry the *pair position* in the
      // member documented as `refOf`'s index, so four rows draw two inks and
      // nothing says which row is which — the terminal draws four.
      // Named THE PAIR and not THE CHANNEL: the quiver row already has that
      // name, and two rows one report cannot tell apart is a legibility defect in
      // the instrument rather than in the code (F354's neighbour).
      name: "THE PAIR: a dumbbell's ends take the colour slot, so its rows take none",
      file: FIGURE,
      from: "        marks.push(dot(x, at(va), \"point\", i), dot(x, at(vb), \"paired\", i));",
      to: "        marks.push(dot(x, at(va), \"point\", 0), dot(x, at(vb), \"paired\", 1));",
      expect: "FD4",
    },
    {
      // **A clip contains and does not communicate** (F343). Reverted to the
      // tenth, `petal_length` starts at x ≈ −2.8 and the rectangle removes its
      // head — `betal_length`, a different word, with nothing to say so.
      name: "THE ROOM: the gutter is a tenth of the width whatever its labels are",
      file: SVG,
      // **Re-anchored, and the ambiguity is the finding** (§3ak.49): the right
      // margin is now grown by the same expression on the other side of the
      // box, so the old one-line anchor matches twice and mutates whichever
      // comes first. The gutter's own preceding line is what tells them apart.
      from: "  for (const l of labels) widest = Math.max(widest, l.length); // cells-ok \u2014 a character count\n"
        + "  if (widest === 0) return 0; // cells-ok \u2014 a character count\n"
        + "  return Math.min(layout.width / 3, widest * SVG_FONT_SIZE * SVG_EM_MAX) + LABEL_GAP;",
      to: "  return 0;",
      expect: "G6c5",
    },
    {
      // **Past the cap the arm still cuts, and the head is what a reader
      // needs.** Cutting from the front keeps the label inside its room and
      // loses the part that names it — the shipped defect with a marker on it.
      name: "THE END: a label past the cap is cut at the head rather than the tail",
      file: SVG,
      from: "  return `${text.slice(0, chars - 1)}\\u2026`; // cells-ok — a character count",
      to: "  return `\\u2026${text.slice(text.length - chars + 1)}`; // cells-ok — a character count",
      expect: "G6c5",
    },
    {
      // **A label taller than the box it names** (F345), which is the same rule
      // across the text rather than along it. Reverted, fourteen ranks of 9.2 px
      // each carry a 12 px glyph.
      name: "THE RANK: a node's label is the figure's type size whatever its box is",
      file: SVG,
      from: "  return Math.min(SVG_FONT_SIZE, rankHeight * 0.8);",
      to: "  return SVG_FONT_SIZE;",
      expect: "G6e9",
    },
    {
      // **`layout` was read at one site in one renderer** (F342), so
      // `bar-stacked.svg` and `bar-normalised.svg` were byte-identical while the
      // terminal drew three figures. Reverted, this arm draws grouped for all
      // four values of the field again — and **no column of the disagreement
      // record moves**, which is why the row is on the marks.
      name: "THE ARRANGEMENT: every bar layout draws the grouped figure",
      file: FIGURE,
      from: "  return layout === \"stacked\" || layout === \"normalised\" ? layout : \"grouped\";",
      to: '  return "grouped";',
      expect: "FB7",
    },
    {
      // **A category's total is the last band's upper bound.** Dividing by the
      // range instead makes `normalised` a second spelling of `stacked` — every
      // row the length it already was, which is the picture the field exists to
      // change.
      name: "THE SHARE OF ONE: a normalised bar is a share of the range and not of its own column",
      file: FIGURE,
      from: "        const by = normalised ? 1 / total : 1;",
      to: "        const by = 1;",
      expect: "FB7",
    },
    {
      // **The fold's rule for a negative, which the bar row did not have**
      // (F351). Reverted here, `stackBands` stops clamping and both consumers
      // lose it at once — which is what an extraction buys over a copy.
      name: "THE CLAMP: a negative reading contributes its own sign to a stack",
      file: STACK,
      from: "  return v === null || v === undefined || !Number.isFinite(v) ? 0 : Math.max(0, v);",
      to: "  return v === null || v === undefined || !Number.isFinite(v) ? 0 : v;",
      expect: "FB8",
    },
    {
      // **I67 names three gated members and the third resolver could not see the
      // field** (F347, §3ak.40). Reverted, `axes: false` and — the reachable half
      // — a block that says nothing draw value labels this arm's terminal frame
      // has no furniture for. `G1e` asks all three resolvers in one expression,
      // which is what a rule whose subject is a **set** needs: asserting the
      // repaired one alone is how two of three came to obey it.
      name: "THE FIELD: `axes` reaches two resolvers of the three it gates",
      file: FIGURE,
      from: "  if (block.axes !== true && !IS_MATRIX[block.form]) return null;",
      to: "  if (block.axes === false && !IS_MATRIX[block.form]) return null;",
      expect: "G1e",
    },
    {
      // **The same override, narrowed to the form it was written for** (F352).
      // `heatmap/default` sets `axes: true`, so the one variant this clause was
      // written for is the one that never needed it — and `utilisation/default`
      // loses its four row labels in this arm alone. `AD1` is the row, because
      // the cell is `identityLabels` and the terminal does not move.
      name: "THE FAMILY: a matrix's gutter override is keyed on one form of five",
      file: FIGURE,
      from: "  return block.axes === true || IS_MATRIX[block.form];",
      to: '  return block.axes === true || block.form === "heatmap";',
      expect: "AD1",
    },
    {
      name: "THE FILL: a stacked band is an outline, so the reader integrates two curves",
      file: FIGURE,
      from: "        mark: { kind: \"polyline\", points: [...lower, ...upper.reverse()], closed: true, fill: true },",
      to: "        mark: { kind: \"polyline\", points: [...lower, ...upper.reverse()], closed: true },",
      expect: "SB",
    },  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
