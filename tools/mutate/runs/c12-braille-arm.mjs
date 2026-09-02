// C12 I100 — the braille arm, and whether a row can tell a fill from a plausible
// stipple.
//
// **The second mutation is F489, restored.** It is not a hypothesis: the arm
// shipped with `half ? undefined : densityGlyph(…)` at the surface's second
// channel, correct while *not half* meant *the glyph arm* and wrong the moment
// there was a third rung. The picture it produced was a stipple — not blank, not
// corrupt, and exactly what a reader half-expecting braille to stipple a fill
// would accept. Only BR6's histogram separates the two, which is why that row is
// eight numbers and a ratio rather than a count of inked cells.
//
// **Which rows this reaches, stated.** Five mutations across BR1, BR4, BR5 and
// BR6. **BR2 and BR3 have none of their own**: BR2's subject — that all four dot
// rows are reachable — is the control's subject, so a mutation for it *is* the
// control; and BR3 asserts that a cell's colour is a sample's rather than a mean,
// where the mutation that would test it (take the farthest sample rather than the
// nearest) changes nothing observable, because `writeDepth` has already refused
// every sample that lost. A cell holding two clouds' winners occurs only along a
// silhouette, and a row built on that would be asserting a coincidence.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-braille-arm.test.ts";
const SCATTER = "src/presentation/plot/scatter3.ts";

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
    file: SCATTER,
    // The arm keeps its name and takes the half rung's grid, so every figure is
    // rasterised at a quarter of the samples and folded into braille anyway.
    from: '    : arm === "braille" ? sampleGrid(w, rows, "braille")',
    to: '    : arm === "braille" ? sampleGrid(w, rows, "half")',
    why: "BR2 asserts all four dot rows are reachable and BR4 measures the marker's box; a run where halving the grid survives is reading neither",
  },
  mutations: [
    {
      // **The tier table is not doubled**, so every marker draws at a quarter of
      // the area it has one rung over — and the near tier, whose whole job is to
      // be the biggest, comes out the size the far tier is today. The picture is
      // still a scatter, which is why the row measures a box rather than looking
      // for marks.
      name: "the dot grid reuses the half rung's marker tiers",
      file: SCATTER,
      from: "      const [bw, bh] = (half ? RASTER_TIER : BRAILLE_TIER)[tier] as readonly [number, number];",
      to: "      const [bw, bh] = RASTER_TIER[tier] as readonly [number, number];",
      expect: "BR4",
    },
    {
      // **F489 as it shipped.** The surface's second channel is the *glyph*
      // arm's — the colour carries the field and a density glyph carries the
      // shading, which only means anything where a cell is one sample. Written
      // as `!half` it fires on the dot grid too, `brailleRows` reads those marks
      // as the frame's and withholds them from the grid, and a fill comes out
      // stippled with its bottom dot row set 3 times against 76.
      name: "the surface writes its density glyph on the dot grid too",
      file: SCATTER,
      from: "      mark[i] = sub ? undefined : densityGlyph(k, ctx.capabilities);",
      to: "      mark[i] = half ? undefined : densityGlyph(k, ctx.capabilities);",
      expect: "BR6",
    },
    {
      // **The frame is drawn twice** — once as the glyph it writes into `mark`
      // and once as dots, because its samples are no longer withheld from the
      // grid. Every axis line becomes braille and the box glyphs vanish, which
      // is §6m row 2 inverted.
      name: "the frame's samples light the dot grid as well",
      file: SCATTER,
      from: "      if (mark[i] === undefined && Number.isFinite(depth.z[i])) setDot(dots, x, y);",
      to: "      if (Number.isFinite(depth.z[i])) setDot(dots, x, y);",
      expect: "BR1",
    },
    {
      // **The floor goes** and `unicode: "ascii"` gets braille, which that
      // terminal cannot draw at all — the arm degrading rather than refusing is
      // the ruling (§6m row 6), and degrading to *nothing legible* is not it.
      name: "the arm ignores its own capability floor",
      file: SCATTER,
      from: '  if (ps === "braille" && caps.unicode !== "ascii") return "braille";',
      to: '  if (ps === "braille") return "braille";',
      expect: "BR5",
    },
    {
      // **The blank braille glyph is emitted** where a space belongs. It
      // measures one cell either way, so no layout assertion sees it — what it
      // costs is that an empty frame reads as ink-less texture, and every other
      // sparse raster in this component emits a space.
      name: "an empty cell emits U+2800 rather than a space",
      file: SCATTER,
      from: '        line.push({ text: " " });',
      to: '        line.push({ text: "\\u2800" });',
      expect: "BR1",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
