// C12 I130 — a vertex is projected once per frame: one vertex object per mesh
// vertex under smooth shading, the projection held on it under the geometry
// record's frame stamp, `plot3d.project` counting. Mutated.
//
// **The frame cannot show the cut.** Projecting at every corner is the same
// double from the same expression, so the goldens hold 458 frames of either.
// What the row sees is the count — T1.142's cube, whose drawn faces and
// distinct vertices are known by hand — and the one picture a wrong stamp
// draws: the second camera's frame taken from the first camera's records.
//
// **Left out, with its reason.** The stamp advancing by two instead of one
// changes nothing observable: any stamp above the last is new to every vertex.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-3d.test.ts test/unit/plot-surface3d.test.ts test/golden/plot-meshes.test.ts";
const SF = "src/presentation/plot/surface3.ts";
const SC = "src/presentation/plot/scatter3.ts";

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

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SF,
    from: "  L.stamps[k] = shown ? frame.stamp : -frame.stamp;\n  frame.projected += 1;",
    to: "  L.stamps[k] = shown ? frame.stamp : -frame.stamp;\n  frame.projected += 2;",
    why: "the count doubles and no byte of any frame moves; only T1.142's hand-counted cube sees it",
  },
  mutations: [
    {
      // **Every corner projects.** The record is written and never read; the
      // frame is byte-identical and the smooth cube counts three per drawn
      // face, which is the flat figure.
      name: "ALWAYS-PROJECT: the record on the vertex is never read back",
      file: SF,
      from: "  if (held === frame.stamp) return true;",
      to: "  if (held === frame.stamp && frame.stamp < 0) return true;",
      expect: "T1.142",
    },
    {
      // **The stamp never advances.** Under a scratch the held geometry's
      // vertices carry the first camera's records under the same stamp the
      // second render uses, so the second frame is the first camera's.
      name: "STAMP-STUCK: every render is frame one",
      file: SC,
      from: "  stamp += 1;\n  for (const b of built) b.frame = stamp;",
      to: "  stamp = 1;\n  for (const b of built) b.frame = stamp;",
      expect: "T1.142",
    },
    {
      // **One vertex object per corner under smooth shading.** Each face gets
      // its own objects, no record is shared, and the smooth count equals the
      // flat count.
      name: "CORNER-PER-FACE: smooth shading builds a vertex object per corner",
      file: SF,
      from: "        let j = slotOf[k] as number;\n        if (j < 0) {",
      to: "        let j = slotOf[k] as number;\n        if (j < 0 || !flat) {",
      expect: "T1.142",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
