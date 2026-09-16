// C12 I136 — no double crosses the shade's call boundary: the inputs and the
// answer travel through the lane on the depth record. Mutated.
//
// **A slot is a component, one store along.** PR15 holds every painted
// sample's intensity to `shade` over the row's own interpolation, and T1.148
// holds the lane's layout on the public record after a draw — so a slot
// written or read out of place is the crossed component PR15 was written for.
//
// **Left out, with their reasons.** The answer returned as a double instead
// of written to the lane is byte-identical, and the return's boxing is the
// heap sample's to see; the lane allocated per sample instead of per render
// is the same. T6.112 records both.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-surface3d.test.ts test/unit/plot-3d.test.ts test/golden/plot-meshes.test.ts";
const SF = "src/presentation/plot/surface3.ts";

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
    from: "        blend(a.v, b.v, c.v, ua, ub, uc),\n        series,\n        lane[LANE_INTENSITY] as number,",
    to: "        blend(a.v, b.v, c.v, ua, ub, uc),\n        series,\n        lane[LANE_DEPTH] as number,",
    why: "the fill hands the painter the depth as the intensity; PR15 and T1.148 read the intensity, and the goldens move",
  },
  mutations: [
    {
      // **A normal component into a view-position slot at the fill**: the
      // crossed component PR15 was written for, one store along.
      name: "FILL-SLOT-CROSSED: the fill writes the normal's x into the view position's x slot",
      file: SF,
      from: "      lane[LANE_VX] = a.vx * ua + b.vx * ub + c.vx * uc;",
      to: "      lane[LANE_VX] = a.nx * ua + b.nx * ub + c.nx * uc;",
      expect: "PR15",
    },
    {
      // **The depth slot left unwritten by the thin stroke**: the previous
      // sample's depth attenuates the next, and the thin half of PR15 reads
      // every sample against its own t.
      name: "THIN-DEPTH-UNWRITTEN: the thin stroke leaves the depth slot to the previous sample",
      file: SF,
      from: "    lane[LANE_VZ] = z;\n    lane[LANE_DEPTH] = z;\n    shadeAt(lane, light, span);\n    paint(\n      py * grid.width + px, // cells-ok — a sample offset\n      z,\n      p.v === undefined",
      to: "    lane[LANE_VZ] = z;\n    shadeAt(lane, light, span);\n    paint(\n      py * grid.width + px, // cells-ok — a sample offset\n      z,\n      p.v === undefined",
      expect: "PR15 thin",
    },
    {
      // **The answer written to the depth slot**: the readers take slot 7,
      // which now holds whatever the previous render left — zero.
      name: "ANSWER-SLOT-MOVED: shadeAt writes its answer over the depth",
      file: SF,
      from: "  lane[LANE_INTENSITY] = i < 0 ? 0 : i > 1 ? 1 : i;\n}",
      to: "  lane[LANE_DEPTH] = i < 0 ? 0 : i > 1 ? 1 : i;\n}",
      expect: "T1.148",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
