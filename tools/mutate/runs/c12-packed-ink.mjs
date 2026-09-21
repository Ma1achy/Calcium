// C12 I132 — the painter writes one packed integer per sample and the colour
// records are built once after the surfaces. Mutated.
//
// **The goldens see the colour; the counts see the cost.** A pass that never
// runs, or runs before anything is pending, leaves the mark in the frame and
// every 24-bit mesh golden moves. A record built per write with the pass
// left in place is byte-identical — it is the shape this cut replaced — and
// only the count of records says it happened; T1.144 reads that count against
// the writes on a fixture whose samples are written twice.
//
// **The control drops the shade on the packed arm**: every lit sample takes
// the map's colour at full intensity, and the mesh goldens move on the first
// shaded frame.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-3d.test.ts test/unit/plot-colormaps.test.ts test/golden/plot-meshes.test.ts";
const S3 = "src/presentation/plot/scatter3.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const PASS =
  "  let records = 0;\n" +
  "  for (let i = 0; i < ink.length; i += 1) { // cells-ok — a sample index\n" +
  "    if (ink[i] === PENDING_INK) {\n" +
  "      ink[i] = { kind: \"rgb\", hex: packedHex(inkRgb[i] as number) };\n" +
  "      records += 1;\n" +
  "    }\n" +
  "  }\n";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: S3,
    from: "      inkRgb[i] = k >= 1 ? p : shadePacked(p, k);",
    to: "      inkRgb[i] = p;",
    why: "no sample is shaded on the packed arm; every 24-bit mesh golden moves on its first lit face",
  },
  mutations: [
    {
      // **The pass dropped**: the mark reaches the compose as a colour with an
      // empty hex, on every surface sample of every 24-bit frame.
      name: "PASS-DROPPED: no record is built and the pending mark reaches the frame",
      file: S3,
      from: PASS,
      to: "  let records = 0;\n",
      expect: "24bit",
    },
    {
      // **A record per write, the pass left counting**: byte-identical, and
      // the pass finds nothing pending, so `plot3d.ink` reads zero.
      name: "RECORD-PER-WRITE: the painter builds the record itself and the pass finds nothing",
      file: S3,
      from: "      inkRgb[i] = k >= 1 ? p : shadePacked(p, k);\n      ink[i] = PENDING_INK;",
      to: "      inkRgb[i] = k >= 1 ? p : shadePacked(p, k);\n      ink[i] = { kind: \"rgb\", hex: packedHex(inkRgb[i] as number) };",
      expect: "T1.144",
    },
    {
      // **The writes counted per triangle rather than per write**: the count
      // no longer exceeds the records on the two-sheet fixture.
      name: "PAINTS-UNCOUNTED: the painter does not count its writes",
      file: S3,
      from: "  const painter = (i: number, z: number, v: number | undefined, si: number, intensity: number, edge: boolean): void => {\n    paints += 1;",
      to: "  const painter = (i: number, z: number, v: number | undefined, si: number, intensity: number, edge: boolean): void => {\n    paints = 1;",
      expect: "T1.144",
    },
    {
      // **The pass moved before the surfaces loop**: nothing is pending yet,
      // so every surface sample keeps its mark into the frame — the same
      // fault as the pass dropped, reached by an order rather than an absence.
      name: "PASS-BEFORE-SURFACES: the records are built before any surface has drawn",
      file: S3,
      from: PASS,
      to: "  let records = 0;\n",
      also: [{
        file: S3,
        from: "  const raster: RasterFrame = { stamp: scene.stamp, projected: 0 };\n",
        to: "  const raster: RasterFrame = { stamp: scene.stamp, projected: 0 };\n" + PASS.replace("  let records = 0;\n", "").replace("records += 1", "records += 1"),
      }],
      expect: "24bit",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
