// C04 I128, C09 I111, C11 I30 — a trend cell's arrow is derived: its direction
// from the readings, its tone from the column's polarity, and its ASCII half
// `V` rather than disclosure's `v` (question 38). Mutated at each joint.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/table.test.ts test/contract/blocks.test.ts test/contract/view-model.test.ts";
const CELLS = "src/presentation/table/cells.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";
const CONSTRUCT = "src/data/viewmodel/construct.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
    file: GLYPHS,
    from: '  trendUp: "\\u2191",',
    to: '  trendUp: "\\u2197",',
    why: "the rising arrow drawn as a diagonal — T2.174 names the character",
  },
  mutations: [
    {
      name: "the arrow is ok whatever the polarity says",
      file: CELLS,
      from: '    tone: wants === "neutral" ? undefined : (wants === "higher") === up ? "ok" : "error",',
      to: '    tone: wants === "neutral" ? undefined : "ok",',
      expect: "T1.39",
    },
    {
      name: "a reading that held draws an arrow",
      file: CELLS,
      from: '  if (to === from) return { mark: "", tone: undefined };\n',
      to: "",
      expect: "T1.39",
    },
    {
      name: "trendDown's ASCII half back to disclosure's v",
      file: GLYPHS,
      from: '  trendDown: "V",',
      to: '  trendDown: "v",',
      expect: "T2.174",
    },
    {
      name: "block() accepts a trend cell carrying a second answer",
      file: CONSTRUCT,
      from: "    if (second.length > 0) {",
      to: "    if (second.length < 0) {",
      expect: "T2.133",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
