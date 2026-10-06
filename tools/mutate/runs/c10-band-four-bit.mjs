// C10 I61 — at 4-bit a band keeps one curated ground and one ink. Mutated
// (C10 T6.107–T6.108), plus the reference measurement T2.64 reads and one
// curated value moved to where it would fail the page constraint.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/band-four-bit.test.ts";
const RESOLVE = "src/presentation/theme/resolve.ts";
const CONTRAST = "src/presentation/theme/contrast.ts";
// The curated pairs moved into the registry by C10 I62 and are generated here.
const TABLE = "src/presentation/theme/four-bit.generated.ts";

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
    file: RESOLVE,
    from: "    if (band !== undefined) return styleOf({ kind: \"ansi16\", index: band.ground });",
    to: "    if (band !== undefined) return styleOf({ kind: \"ansi16\", index: band.ground + 1 });",
    why: "every band's ground one index off — T1.51 reads the curated ground",
  },
  mutations: [
    {
      name: "INK-FLAT: the resolver ignores the band's ink at 4-bit (T6.107)",
      file: RESOLVE,
      from: "    if (band !== undefined) return styleOf({ kind: \"ansi16\", index: band.ink });\n",
      to: "",
      expect: "T1.51",
    },
    {
      name: "GROUND-FLAT: the resolver ignores the band's ground at 4-bit (T6.107)",
      file: RESOLVE,
      from: "    if (band !== undefined) return styleOf({ kind: \"ansi16\", index: band.ground });\n",
      to: "",
      expect: "T1.51",
    },
    {
      name: "NO-PAIR-CHECK: validateBands accepts a band with no 4-bit pair (T6.108)",
      file: CONTRAST,
      from: "    if (pair === undefined) {\n      errors.push({",
      to: "    if (pair === undefined && false) {\n      errors.push({",
      expect: "T2.63",
    },
    {
      name: "SAME-INDEX: validateBands accepts a pair whose ground is its ink",
      file: CONTRAST,
      from: "    } else if (pair.ground === pair.ink) {",
      to: "    } else if (pair === undefined) {",
      expect: "T2.63",
    },
    {
      name: "PAGE-UNMEASURED: the focus band is not held against the page",
      file: CONTRAST,
      from: '  if (focus !== undefined) hold("focusGround.page", ratio(hex(focus.ground), page), FOCUS_VS_PAGE);\n',
      to: "",
      expect: "T2.64",
    },
    {
      name: "NAVY: hcDark's focus ground moved to navy, 1.31 against the page",
      file: TABLE,
      from: "    focusGround: Object.freeze({ ground: 12, ink: 15 }),",
      to: "    focusGround: Object.freeze({ ground: 4, ink: 15 }),",
      expect: "T2.64",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
