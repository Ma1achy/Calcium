// C12 §3aj — the shared-geometry split, and the case the corpus cannot construct.
//
// **This run exists because the gate passed against a broken refactor** (F256).
// §3aj reads *zero golden frames change*; moving the flat-line answer into the
// normalised layer changes it at every even row count, and **0 golden frames and
// 0 of 1780 catalogue frames moved** — measured by counting the branch, which is
// never taken by either corpus.
//
// So these mutations are aimed at the split itself rather than at a picture, and
// the killer is a unit row rather than a golden. A run whose mutations are all
// caught by goldens would be re-measuring what the goldens already cover.
//
// **A third row was written and removed rather than declared an expected
// survivor.** *`rowOf` normalises for itself again* leaves every frame
// byte-identical by construction, so nothing can catch it — and a permanently
// surviving row turns this pass's one-bit signal off for good. A survivor has
// three dispositions and *expected* is not one of them; the structural
// commitment is prose in §3aj, where it can be read.
//
// Anchors checked for uniqueness before the pass (F219), atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SCALE = "src/presentation/plot/scale.ts";
// **The shared coordinate lives in L0**, where `cells()` is not reachable — that
// is §3aj hazard 4's seam, structural rather than asserted.
const SHARED = "src/data/viewmodel/range.ts";
const SVG = "src/presentation/plot/svg.ts";
// **Where two of these defects now live.** Step 4 moved the marks across the
// seam, so a mutation aimed at *how a family computes its own coordinate* has to
// follow — the coordinate is the shared layer's and only the rasterisation is
// still this arm's (C12 §3ak.10).
const FIGURE = "src/presentation/plot/figure.ts";

// **The goldens are in the file list on purpose.** They cannot catch the flat
// line — that is the finding — and their presence is what makes each row's
// `expect` a claim about *which* instrument caught it.
//
// **And for two commits they were not in it.** The list said `test/golden/
// plots.test.ts`; the files are `plot.test.ts` and `plot-forms.test.ts`, and
// **vitest drops a path that resolves to nothing whenever another one does** —
// no warning, no non-zero exit, three files run where four were named. So every
// row's `expect` was a claim about an instrument set that did not include the
// goldens, and the comment above argued *from* their presence. Found by a
// missing file in a different list, not by anything watching this one.
const FILES =
  "test/unit/plot-shared-geometry.test.ts test/unit/plot-svg-path.test.ts " +
  "test/unit/plot-svg-colour.test.ts test/golden/plot.test.ts test/golden/plot-forms.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SHARED,
    from: "  return invert ? 1 - clamped : clamped;",
    to: "  return clamped;",
    why: "the vertical facing ignored — every `origin` that flips the ordinate draws upside down",
  },
  mutations: [
    {
      // **Hazard 1, exactly as §3aj states it.** The rounding stage moves and
      // the flat line lands one cell off at every even height. **No frame in
      // either corpus catches this**, which is why the run is here.
      name: "the flat-line answer moves into the normalised layer",
      file: SCALE,
      from: "  if (range.max === range.min) return Math.floor(last / 2);",
      to: "  if (range.max === range.min) return Math.round(0.5 * last);",
      expect: "G0",
    },
    {
      // **The zero span back to `0 / 0`** (C04 §3ak). The clamp cannot repair a
      // NaN — `NaN < 0` and `NaN > 1` are both false — so it passes through
      // both arms and the SVG emits a well-formed `<path>` that paints
      // nothing. **Past every containment assertion, every element count and
      // the empty-marks refusal**, which is why the row reads the coordinate
      // rather than the picture.
      name: "the shared coordinate divides by a zero span again",
      file: SHARED,
      from: "  const t = span === 0 ? 0.5 : (v - range.min) / span;",
      to: "  const t = (v - range.min) / span;",
      expect: "G9",
    },
    {
      // **The other plausible answer, and C04's own table calls it wrong**:
      // `{v, v+1}` *puts a field that never varied at the bottom of the scale,
      // which says all minimum about data that says nothing*. Five files in
      // `plot/` open-code exactly this, which is what made it a missing ruling
      // rather than a bug.
      name: "a constant field is drawn at the floor rather than mid-ramp",
      file: SHARED,
      from: "  const t = span === 0 ? 0.5 : (v - range.min) / span;",
      to: "  const t = span === 0 ? 0 : (v - range.min) / span;",
      expect: "G9",
    },
    {
      // **The clamp moved to the renderer.** A normalised coordinate outside
      // `[0, 1]` makes the rasteriser responsible for C04 I29, which it has no
      // way to know — and in cells `Math.round` hides it inside the grid at
      // most heights.
      name: "the shared layer emits an unclamped coordinate",
      file: SHARED,
      from: "  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;",
      to: "  const clamped = t;",
      expect: "G2",
    },
    {
      // **Hazard 3 violated at its own boundary**: a gutter sized to content is
      // where font metrics come back, and it is the *only* thing that makes an
      // SVG label need measuring. The layout stops being size-independent.
      name: "the image path sizes its gutter to the output rather than by fraction",
      file: SVG,
      from: "  return { ...SVG_DEFAULT_LAYOUT, width: Math.max(1, width), height: Math.max(1, height) };",
      to: "  return { ...SVG_DEFAULT_LAYOUT, width: Math.max(1, width), height: Math.max(1, height), gutter: 8 / Math.max(1, width) };",
      expect: "G3",
    },
    {
      // **The shared coordinate abandoned by the image path.** Every frame still
      // looks like a plot — the curve is monotone in the value either way — and
      // the two paths now disagree about where a sample sits, which is the
      // divergence §3aj exists to prevent.
      name: "the image path normalises for itself instead of the shared layer",
      file: SVG,
      from: "    const y = top + (bottom - top) * normalisedOf(v, range, true);",
      to: "    const y = top + (bottom - top) * (1 - (v - range.min) / Math.max(1, range.max - range.min));",
      expect: "G5",
    },
    {
      // **The label anchored at the start.** It runs into the plot area rather
      // than sitting against the gutter — the failure hazard 4 says is
      // discovered as a wrong-looking image, caught here at the seam.
      name: "a label is anchored at its start and needs its width to sit right",
      file: SVG,
      from: "        `<text x=\"${n(box.left - 6)}\" y=\"${n(y + SVG_FONT_SIZE / 3)}\" text-anchor=\"end\" ` +",
      to: "        `<text x=\"${n(box.left - 6)}\" y=\"${n(y + SVG_FONT_SIZE / 3)}\" ` +",
      expect: "G5c",
    },
    {
      // **The matrix family's coordinate open-coded.** Every cell is still
      // coloured and the picture still reads as a field. `continuousColour`
      // clamps for its own reasons, so an out-of-range value draws the same —
      // the difference is the **span**: `Math.max(1, span)` squashes a density
      // field over `0..0.3` into the bottom third of the map. The first fixture
      // had a span of 6 and could not see it.
      //
      // **Re-anchored when the marks crossed the seam** (§3ak.10). The open-coded
      // span was `marks()`' own loop; the cell's reading is now a member of the
      // mark — `value`, normalised, spent on a ramp at each arm's own depth — so
      // the defect is one file down and identical in shape. Both arms would take
      // it now, which is the point of moving it.
      name: "the matrix family normalises its colour for itself",
      file: FIGURE,
      from: "            value: normalisedOf(v, extent, false),",
      to: "            value: (v - extent.min) / Math.max(1, extent.max - extent.min),",
      expect: "G6",
    },
    {
      // **The bar baseline taken from the plot area.** Correct for every plot
      // whose data does not cross zero, which is most of them — and wrong in
      // the one place a bar chart says something: a bar of `-3` grows *down*
      // from the baseline rather than up from the floor.
      //
      // **This row's first form survived, and the survivor was about the
      // source.** `normalisedOf(range.min, …)` is `1` by construction, so the
      // expression it mutated was `box.bottom` written the long way round —
      // dead arithmetic wearing the shared layer's clothes.
      name: "a bar's baseline is the area's floor rather than zero",
      file: SVG,
      from: "      const base = box.top + (box.bottom - box.top) * normalisedOf(zero, range, true);",
      to: "      const base = box.bottom;",
      expect: "G6",
    },
    {
      // **The palette open-coded again**, which is the shape the arm shipped
      // with: five literals where C10 has eight slots. The picture still reads
      // as a chart and every curve is still a curve — the difference is that
      // the legend and the figure name different colours for series six.
      name: "a series takes a colour this file chose",
      file: SVG,
      from: "    const ink = inkOf(refOf(si), theme);",
      to: '    const ink = "#6ea8fe";',
      expect: "TC4",
    },
    {
      // **The wrap point, and it is the whole of F-this-commit.** `% 5` is
      // indistinguishable from `% 8` on every fixture with five series or
      // fewer, which is every fixture the per-form corpus has.
      //
      // **Re-anchored, and the survivor is what asked for it** (§3ak.10). TC2's
      // fixture is eight *curve* series, and the curve family left this loop for
      // the marks walk — so the mutation stayed in real, reachable code and
      // stopped being on the path the test exercises.
      //
      // **The anchor sweep cannot see that.** `anchors.mjs` asks whether the text
      // still matches, and it does: the bar family still runs this loop. Only
      // running the pass says the row went quiet, and the reading it routes to is
      // *write a test* when the answer is *the subject moved* — F219's
      // misrouting arriving from the opposite direction, from an anchor that is
      // unique and present rather than duplicated.
      name: "the slot index wraps at five rather than at the palette's size",
      file: SVG,
      from: "        ? inkOf(refOf(d.seriesIndex), theme)",
      to: "        ? inkOf(refOf(d.seriesIndex % 5), theme)",
      expect: "TC2",
    },
    {
      // **A slot that is in the theme and says the wrong thing.** Every
      // membership check passes — `tone.error` is C10's — and the axis labels
      // now tell the reader something is wrong with the scale. *Which palette*
      // and *which slot* are two claims, and only the second catches this.
      name: "the furniture takes a tone that carries meaning",
      file: SVG,
      from: 'const LABEL: ColourRef = "tone.muted";',
      to: 'const LABEL: ColourRef = "tone.error";',
      expect: "TC1",
    },
    {
      // **The arm's one rung unpinned.** At depth 4 every slot resolves to an
      // `ansi16` index, `inkOf` returns `undefined`, and the renderer skips
      // every element it was going to paint. **The output is still valid SVG**
      // — an empty frame is a well-formed document — so nothing about parsing
      // it says anything, and only a row that counts elements can.
      name: "the SVG arm degrades like the terminal instead of pinning truecolour",
      file: SVG,
      from: "const SVG_CAPS = Object.freeze({ colourDepth: 24 as const });",
      to: "const SVG_CAPS = Object.freeze({ colourDepth: 4 as const });",
      expect: "TC5b",
    },
    {
      // **The candles dropped again**, which is how the arm shipped: a `line`
      // carrying `ohlc` takes the curve family, finds `series: []` and draws a
      // furnished plot with an axis running 0 to 1 while the terminal draws
      // three candles over 8 to 16. **G7's partition cannot see this** — the
      // form *is* claimed — and neither can a corpus with one variant per form.
      name: "a block whose datum is ohlc is drawn by the curve family",
      file: SVG,
      from: "  if (block.ohlc !== undefined) return null;",
      to: "  if (false) return null;",
      expect: "G8a",
    },
    {
      // **Furniture with no ink.** `seriesRange` returns null, the fallback
      // furnishes 0..1, and the output is five gridlines over an empty box —
      // valid SVG, and a plot of a range the block never had.
      name: "an empty series is furnished with a range nobody declared",
      file: SVG,
      from: "  if (body.length === 0) return null;",
      to: "  if (body.length < 0) return null;",
      expect: "G8c",
    },
    {
      // **The ordinate unflipped.** All four `origin` values drew identically
      // before this clause, so the mutation restores a state in which the two
      // arms disagree about which way up the data goes — and every assertion
      // about *where the ink is* still passes, because the ink is somewhere
      // legal.
      name: "a non-default origin is drawn with the default facing",
      file: SVG,
      from: "  if (block.origin !== undefined && block.origin !== ORIGIN_DEFAULT[block.form]) return null;",
      to: "  if (block.origin === undefined) return null;",
      expect: "G8e",
    },
    {
      // **A node sized to its own layer's share.** The first version did this
      // and a node alone in its layer spanned the whole figure — a leaf drawn
      // as wide as the root, inside the area, with every box in the right
      // layer. The frame is what showed it and no row could.
      name: "a node is sized by its own layer rather than by the busiest",
      file: SVG,
      from: "    const across = (transposed ? h : w) / busiest; // cells-ok — a node count",
      to: "    const across = (transposed ? h : w) / Math.max(1, row.length); // cells-ok — a node count",
      expect: "G6e1",
    },
    {
      // **A sparse layer stretched instead of centred**, the other half of the
      // same defect: a single-node layer left-aligned while its children sit
      // under the middle.
      name: "a sparse layer is not centred in its axis",
      file: SVG,
      from: "    const offset = ((transposed ? h : w) - across * row.length) / 2; // cells-ok — a node count",
      to: "    const offset = 0; // cells-ok — a node count",
      expect: "G6e2",
    },
    {
      // **The default layout chosen rather than read.** `chooseLayout` returns
      // the first of `["topDown", "leftRight", "outline"]` that fits and an SVG
      // has no budget, so `topDown` is the terminal's answer. Family 1's
      // orientation came out transposed by picking what read naturally.
      name: "the tree's default layout is not the terminal's",
      file: SVG,
      from: '      const wanted = block.treeLayout ?? "topDown";',
      to: '      const wanted = block.treeLayout ?? "leftRight";',
      expect: "G6e3",
    },
    {
      // **A dummy node given a box.** The pipeline inserts them to carry an
      // edge across a layer, so a box there is a node the graph does not have —
      // and it draws in the right place with the right colour.
      name: "a routing waypoint is drawn as a node",
      file: SVG,
      from: "      if (label === \"\") continue;",
      to: "      if (false) continue;",
      expect: "G6e6",
    },
    {
      // **The flame and the icicle transposed**, which is family 1's own
      // mistake one family along: `hierarchyStripRows` takes an `inverted`
      // flag and the terminal passes `false` for a flame and `true` for an
      // icicle. Both figures still draw, inside the area, with every band the
      // right width — the only difference is which end the root is at.
      name: "a flame and an icicle grow the same way",
      file: SVG,
      from: '    const inverted = block.form === "icicle";',
      to: '    const inverted = block.form !== "icicle";',
      expect: "G6d3",
    },
    {
      // **The tiles unsorted.** Nesting is drawn by depth ordering — a parent
      // painted, then its children over it — so an unsorted walk puts a parent
      // over its own children and the figure loses its structure while every
      // rectangle stays in the right place.
      name: "a treemap paints its nodes in walk order rather than by depth",
      file: SVG,
      from: "      const placed = [...tiles(root, 1 / Math.max(w, h))].sort((a, b) => a.depth - b.depth);",
      to: "      const placed = tiles(root, 1 / Math.max(w, h));",
      expect: "G6d1",
    },
    {
      // **The inset as a constant.** One pixel at every output size rather
      // than one pixel's *worth* of the unit square: correct at the size it was
      // tuned for and a different figure at every other, which is exactly what
      // `svgLayout`'s fractions exist to prevent (§3aj hazard 3).
      name: "the treemap's inset stops being a proportion",
      file: SVG,
      from: "      const placed = [...tiles(root, 1 / Math.max(w, h))].sort((a, b) => a.depth - b.depth);",
      to: "      const placed = [...tiles(root, 0.004)].sort((a, b) => a.depth - b.depth);",
      expect: "G6d4",
    },
    {
      // **A value axis over a figure whose readings are areas.** Furnished out
      // of `seriesRange([]) ?? {0, 1}`, so it draws 0 · 0.25 · 0.5 · 0.75 · 1
      // beside tiles — which is what the frame caught and no row did.
      name: "the tiles family gets a value axis",
      file: SVG,
      // Re-anchored twice, and the second time is the seam arriving. First when
      // the decision moved into `HAS_VALUE_AXIS` (C12 I60), because three
      // renderers had reached the same wrong answer separately. Now the record
      // is applied by the *emitter* — `figure.value` is already `null` for the
      // three families — so this arm has no lookup left to get wrong and the
      // mutation is against the read instead (§3ak.10).
      from: "  if (axis !== null && rule !== undefined && label !== undefined) {",
      to: "  if (rule !== undefined && label !== undefined) {",
      expect: "G6d6",
    },
    {
      // **This row replaces one that survived, and the survivor was right.**
      //
      // *A form with its own geometry falls back to a family instead of
      // refusing* used to disable `svgFamilyOf(block.form) === null → null` and
      // be caught by G7. It stopped being catchable the moment G8c landed:
      // `marks()` switches on the family and returns `[]` for an unclaimed one,
      // so the empty-marks clause refuses the same block a few lines later and
      // **no fixture can tell the two apart**. Two guards, one ruling.
      //
      // Removed rather than declared an expected survivor — the same call this
      // run made for `rowOf` — and the guard that keeps the two from being
      // confused is G7b instead: **a claimed form must put ink on the page.**
      // That is the arm that will stop agreeing, because a family claimed in
      // `SVG_FAMILY` before its branch exists in `marks()` refuses *as though
      // the form were unclaimed*, and every family in the completion plan does
      // exactly that on its first commit.
      //
      // **Re-anchored to the routing, which is what the row was always about**
      // (§3ak.10). It used to blank the curve family's path because that was the
      // only way to say *this family has no branch*; the walk makes the sentence
      // literal — a family absent from the disjunction falls through to a loop
      // that does not claim it and emits nothing. The mutation is now the exact
      // shape the row predicted every family's first commit would have.
      name: "a claimed family draws no marks, and the refusal reads as unclaimed",
      file: SVG,
      from: '  if ((family === "curve" || family === "scatter" || family === "matrix") && "marks" in figure) {',
      to: '  if ((family === "scatter" || family === "matrix") && "marks" in figure) {',
      expect: "G7b",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
