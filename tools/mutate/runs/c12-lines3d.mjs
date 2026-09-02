// C12 I93 and C04 I78 — the polyline carrier. Mutated.
//
// **Three of these nine put a rule back the way it was written for one
// carrier**, which is the walk's own finding as a mutation: the extent over the
// clouds alone, the refusal reading `points3` only, and the completeness walk
// covering one member. Each is a diff of a few characters, each leaves a legal
// frame, and each was the shipped behaviour until a second carrier existed.
//
// **And two are about a tie.** `writeDepth` compared a `double` against its own
// `Float32Array` slot, so the identical value won about half the time (F454);
// `strokeSeg` rounded where every other writer floors, so the two were rarely
// naming the same cell to begin with (F453). Both mutations restore a defect
// that no assertion about depths can see, because the depths are equal.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-lines3d.test.ts";
const S = "src/presentation/plot/scatter3.ts";
const P = "src/presentation/plot/project3.ts";
const V = "src/data/viewmodel/validate.ts";

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
    file: S,
    // Every stroke dropped. Nine of the nine rows below read a rendered path or
    // a refusal about one, so a pass in which no path can be removed cannot
    // observe a kill.
    from: "  for (const st of scene.strokes) {\n    // **One glyph a sample on the marker arm**",
    to: "  for (const st of [] as typeof scene.strokes) {\n    // **One glyph a sample on the marker arm**",
    why: "every row reads a drawn path or a refusal about one; a pass where no path draws sees nothing",
  },
  mutations: [
    {
      // **The extent over the clouds alone** (C12 §6g row 1) — the rule exactly
      // as it was written for one carrier. A lines-only block then normalises
      // against `extentOf([])`'s unit cube: on screen, inside the box, and at
      // the wrong scale.
      name: "the extent is taken from the clouds alone",
      file: S,
      from: "  for (const l of paths) for (const p of l.points) all.push(p);",
      to: "  for (const l of [] as typeof paths) for (const p of l.points) all.push(p);",
      expect: "LN1",
    },
    {
      // **The refusal reading one carrier** (C04 I78, §6g row 2). A wireframe
      // is a complete document and this rejects it.
      name: "the form is refused unless it has points3",
      file: V,
      from: '  if (form === "scatter3d" && CARRIERS_3D.every((k) => b[k] === undefined)) {',
      to: '  if (form === "scatter3d" && pts === undefined) {',
      expect: "T2.4g",
    },
    {
      // **The completeness walk over one carrier** (C04 I78, §6g row 3). It
      // passes `T3.53` and every row derived from it, because those are about
      // the other member.
      name: "the value walk covers points3 only",
      file: V,
      from: '  walkPoints3(lns, "lines3", by, at, e);',
      to: '  walkPoints3(undefined, "lines3", by, at, e);',
      expect: "T3.55",
    },
    {
      // **The tie, restored** (F454). A `double` compared against its own
      // `Float32Array` slot: the identical value wins whenever the rounding
      // went up, so the draw order is decided by the last bits of a number
      // nothing reads.
      name: "the depth test compares wider than the buffer stores",
      file: P,
      from: "  const q = Math.fround(z);\n  if (!(q < (d.z[i] as number))) return false;\n  d.z[i] = q;",
      to: "  const q = z;\n  if (!(q < (d.z[i] as number))) return false;\n  d.z[i] = q;",
      expect: "LN3",
    },
    {
      // **The other rasterisation convention** (F453). `round` puts a sample
      // over `[i - 0.5, i + 0.5)` where every other writer here uses
      // `[i, i + 1)`, so a path drifts off its own markers.
      name: "a stroke's samples are rounded rather than floored",
      // **`strokeSeg` moved to `project3.ts`** when the surface's degenerate arm
      // became its third caller (C12 I94). Same two lines, one file down.
      file: P,
      from: "    const px = Math.floor(x0 + (x1 - x0) * t); // cells-ok — a sample coordinate\n    const py = Math.floor(y0 + (y1 - y0) * t); // cells-ok — a sample coordinate",
      to: "    const px = Math.round(x0 + (x1 - x0) * t); // cells-ok — a sample coordinate\n    const py = Math.round(y0 + (y1 - y0) * t); // cells-ok — a sample coordinate",
      expect: "LN3",
    },
    {
      // **The frame back in front** (F452, §6g). It drew first for the whole of
      // step 4 under a comment saying the order did not decide occlusion.
      name: "the frame is drawn before the data",
      file: S,
      from: "  for (const d of drawn) {\n    const tier = tierOf(d.depth, nearD, farD);",
      to: "  const early = frameOf(block, scene, grid, rows, depth, ctx, (i, m) => { ink[i] = frameInk; mark[i] = m; glyph[i] = -1; });\n  void early;\n  for (const d of drawn) {\n    const tier = tierOf(d.depth, nearD, farD);",
      expect: "LN6",
    },
    {
      // **One colour a segment** (C12 I93, §6g row 7) — the reading taken at
      // the near end rather than per sample, so a segment crossing the figure
      // is drawn in the colour of the end nearest the reader.
      name: "a segment takes one colour for its whole length",
      file: S,
      from: "      ink[i] = colourOf(block, ctx, { depth: z, value: v, series: st.series }, scene.identities, span);",
      to: "      ink[i] = colourOf(block, ctx, { depth: st.a.depth, value: st.va, series: st.series }, scene.identities, span);",
      expect: "LN2",
    },
    {
      // **`closed` at one point**, which draws a zero-length segment: one
      // sample inked where the open path draws nothing.
      //
      // **The two-point half is not here and the absence is the finding.**
      // `n >= 2` kills nothing and cannot: a retraced segment walks the
      // *identical* samples, because `floor(x0 + (x1 - x0) * t)` under
      // reversal is `floor(x1 + (x0 - x1) * (1 - t))` — the same number. So
      // the clause has two halves and only one of them is observable; the
      // other buys a redundant stroke and no picture. Measured 2026-09-02.
      name: "`closed` connects last to first at any length",
      file: S,
      from: "    const last = l.closed === true && n >= 3 ? n : n - 1; // cells-ok — a segment count",
      to: "    const last = l.closed === true && n >= 1 ? n : n - 1; // cells-ok — a segment count",
      expect: "T3.56",
    },
    {
      // **A line encoded as a tier code** (C12 I93, §6g row 5). `glyphRows`
      // reads `glyph` before `mark`, so the path comes out as marker glyphs and
      // the `% clouds.length` decode gives them the wrong series.
      name: "a line writes a tier code rather than a glyph",
      file: S,
      from: "      mark[i] = glyphMark;\n      glyph[i] = -1;",
      to: "      mark[i] = glyphMark;\n      glyph[i] = st.series;",
      expect: "LN4",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
