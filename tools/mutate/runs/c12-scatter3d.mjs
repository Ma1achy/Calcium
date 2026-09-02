// C12 I87, I88 and I89 — the 3D scatter's two arms, its tier and its key. Mutated.
//
// **Two rows do not appear here and both absences are findings.**
//
// *F442* — the raster arm reading drawn-ness off the colour rather than off the
// depth buffer. The mutation is one line and it kills **nothing**, because
// `halfBlockEligible` needs `colourDepth >= 8` and `CONTINUOUS_FLOOR` is 8: two
// thresholds in two components that happen to agree, so no capability in the
// corpus reaches the arm with an absent colour. Listing it as an expected kill
// would be a row asserting a coincidence.
//
// **And two survivors came out of the first pass, both the same defect in the
// rows rather than in the code** (F446). SC7 asserted *both clouds appear* and
// SC8 asserted *one reading, one colour* — two counts, each satisfied by every
// wrong answer, neither saying **which**. They identify now: the contested cell
// against the near cloud's own colour, and the zero span against
// `continuousColour(map, 0.5)`. Containment is not correctness, twice, in rows
// written by someone holding that sentence.
//
// *F445* — the tier's block hung off its sample rather than centred on it. It
// kills nothing either, and three attempts to build a row that catches it all
// failed for the same reason: at the mid and far tiers the two placements are
// arithmetically identical, and every fixture that can be made symmetric enough
// to assert against has a degenerate depth span and so never reaches the near
// tier at all. The instrument that caught it is `make refdiff` — an independent
// renderer of the same geometry — and the honest record is that the suite does
// not reach it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-scatter3d.test.ts";
const P = "src/presentation/plot/scatter3.ts";
const F = "src/presentation/plot/figure.ts";
const T = "src/data/viewmodel/types.ts";
const U = "src/presentation/plot/furniture.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: P,
    // The blank cell. Every row here reads a frame, so a run in which the
    // picture cannot be emptied is a run that cannot observe a kill.
    from: 'if (!t && !b) line.push({ text: " " });',
    to: "if (true as boolean) { line.push({ text: \" \" }); continue; }",
    why: "every row reads a frame; a pass where blanking the raster survives cannot see a kill",
  },
  mutations: [
    {
      // **The arm chosen by taste rather than by capability** (C12 I87). The
      // raster runs everywhere, including at 4-bit and under `unicode: "ascii"`,
      // where `HALF_BLOCK` is not in the repertoire and the colour is gone.
      name: "the raster arm runs at every capability",
      file: P,
      from: '  const half = block.plotStyle !== "marker" && halfBlockEligible(ctx.capabilities, false);',
      to: "  const half = true as boolean;",
      expect: "SC1",
    },
    {
      // **The sparse raster's third glyph gone** (F443). A cell inked only below
      // becomes `HALF_BLOCK` with a foreground, so the terminal paints the top
      // half in the mark's colour — a solid bar where there is one sample.
      name: "the lower half block is the upper one",
      file: P,
      from: "      else if (!t) line.push(span(HALF_BLOCK_LOWER, ink[bi]));",
      to: "      else if (!t) line.push(span(HALF_BLOCK, ink[bi]));",
      expect: "SC1",
    },
    {
      // **The tier collapsed** (C12 I88). Every point takes the middle row of
      // the marker table and the middle block size, so depth stops reading on
      // both arms and reads on neither below the colour floor.
      name: "every sample is the middle tier",
      file: P,
      from: "  const t = (depth - near) / (far - near);\n  return Math.min(TIERS - 1, Math.max(0, Math.floor(t * TIERS)));",
      to: "  const t = (depth - near) / (far - near);\n  void t;\n  return 1;",
      expect: "SC3",
    },
    {
      // **The glyph arm loses the tier and keeps the series**, which is the
      // shape a reader would write if the two channels were confused: the mark
      // separates the clouds and says nothing about depth. At one bit that is
      // the whole picture gone.
      name: "the marker row is the series rather than the tier",
      file: P,
      from: "      const tier = Math.floor(g / MARKER3_COLUMNS); // cells-ok — a tier index",
      to: "      const tier = 0; // cells-ok — a tier index",
      expect: "SC4",
    },
    {
      // **The depth test dropped on the raster arm** — the last sample written
      // wins the cell rather than the nearest, so a cloud behind another draws
      // over it. `writeDepth` still runs and the buffer is still right; only
      // the picture is wrong, which is why a row about the buffer cannot see it.
      name: "the last sample wins the cell, not the nearest",
      file: P,
      from: "          if (writeDepth(depth, px, py, d.depth)) { // cells-ok — a sample offset",
      to: "          if (true as boolean) { // cells-ok — a sample offset",
      expect: "SC7",
    },
    {
      // **`colourBy` ignored** (C12 I89) — every arm takes the depth ramp, so
      // `"series"` loses the categorical palette and `"value"` loses the field.
      name: "colourBy always reads depth",
      file: P,
      from: '  const by = block.colourBy ?? "depth";',
      to: '  const by = "depth" as NonNullable<Plot["colourBy"]>;',
      expect: "SC6",
    },
    {
      // **The identity gate dropped** (C12 I89, F444). `identityOf` answers the
      // cloud labels whatever `colourBy` says, so a depth-ramped scatter draws a
      // categorical key naming a channel the picture does not use — which is the
      // two-rules-in-two-places failure the single rule exists to prevent.
      name: "the cloud labels are identities under every colourBy",
      file: F,
      from: '    if (block.colourBy !== "series") return [];',
      to: "    if (false as boolean) return [];",
      expect: "SC6",
    },
    {
      // **The legend's count reimplemented** (F444). This is the code that was
      // there: correct on every form with two carriers, and blind to the third.
      // It is the mutation that says the single rule is load-bearing rather than
      // tidy.
      name: "the legend counts series rather than identities",
      file: U,
      from: "  const count = identityOf(block).length; // cells-ok — a series count",
      to: "  const count = (block.segments?.length ?? 0) || block.series.length; // cells-ok — a series count",
      expect: "SC6",
    },
    {
      // **`STYLE_ARMS` inherits the neighbour's** (C12 I87, F441), which is the
      // whole class this commit is about: a total record forces an answer and
      // cannot check it, so the wrong answer is the one next door.
      //
      // **Re-anchored when the entry stopped being `[]`** (F482), and it still
      // bites in both directions: the built arm becomes refused and two unbuilt
      // ones become accepted, which is exactly the pair SC2 now asserts.
      name: "scatter3d takes scatter's style arms",
      file: T,
      from: '  scatter3d: ["marker"],',
      to: '  scatter3d: ["braille", "line"],',
      expect: "SC2",
    },
    {
      // **The value ramp's zero span goes to the floor rather than mid-ramp**
      // (C04 I74, C12 I89) — the field family's rule, re-derived wrongly, which
      // is what happens when a rule is restated instead of read.
      name: "a zero value span reads at the ramp's floor",
      file: P,
      from: "  return hi > lo ? (v - lo) / (hi - lo) : 0.5;",
      to: "  return hi > lo ? (v - lo) / (hi - lo) : 0;",
      expect: "SC8",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
