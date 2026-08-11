// C04 I41 — `yFormat` names the unit that arrives (F31).
//
// **Four parts to one ruling, and each is a place the rename could be half
// done**: the arithmetic on both arms, the builder that now carries the field,
// and the two validation paths. A rename that lands in three of the four leaves
// a tree that compiles, renders, and is wrong by a factor of 100 in one place.
//
// The pair worth naming is the first two. Each arm alone is a restatement of its
// own rule — `fraction` multiplies, `percent` does not — and a suite indexed by
// arms tests each against itself and agrees. T1.12b is the row that sends one
// value through both, which is the only shape that can see them swapped.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMDS = [
  "npx vitest run test/unit/plot.test.ts",
  "npx vitest run test/unit/view-model.test.ts",
  'npx vitest run test/contract/builders.test.ts -t "T2.12c"',
];

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () =>
  CMDS.map((c) => {
    try {
      return execSync(`${c} 2>&1`, { cwd: ROOT, encoding: "utf8" });
    } catch (e) {
      return `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
  }).join("\n");

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/presentation/plot/axes.ts",
    from: '    case "fraction":\n      return `${Math.round(v * 100)}%`;',
    to: '    case "fraction":\n      return "";',
    why: "T1.12 asserts `fraction` renders `97%`; an arm returning nothing cannot satisfy it, so a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The rename done backwards** — the arithmetic left on the name it used
      // to have. Every per-arm assertion still passes on its own terms; only a
      // row that sends one value through both arms can see it.
      name: "the arms are swapped — `percent` multiplies and `fraction` does not",
      file: "src/presentation/plot/axes.ts",
      from: '    case "fraction":\n      return `${Math.round(v * 100)}%`;\n    case "percent":\n      return `${Math.round(v)}%`;',
      to: '    case "fraction":\n      return `${Math.round(v)}%`;\n    case "percent":\n      return `${Math.round(v * 100)}%`;',
      expect: "T1.12b",
    },
    {
      // The half-done rename: the new arm added, the old one never renamed, so
      // `fraction` falls through to the numeric default and renders `0.84`.
      name: "`fraction` is dropped, leaving it to the numeric default",
      file: "src/presentation/plot/axes.ts",
      from: '    case "fraction":\n      return `${Math.round(v * 100)}%`;',
      to: "",
      expect: "T1.12",
    },
    {
      // C24 §4's omission restored. The block-level rows all pass — C12 has
      // honoured the field all along — so this is invisible to everything except
      // a row that goes through the builder and reads the axis.
      name: "b.plot withholds `yFormat` again",
      file: "src/shell/builders/index.ts",
      from: "      ...(yFormat === undefined ? {} : { yFormat }),\n",
      to: "",
      expect: "T2.12c",
    },
    {
      // **The constructor's half.** The validator still rejects a raw document,
      // so the fixture path is covered and the built path is not — which is the
      // asymmetry §3 warns about, and it is why T1.16b asserts both.
      name: "the constructor stops checking the arm",
      file: "src/data/viewmodel/construct.ts",
      from: "      checkPlotFormat(block);\n",
      to: "",
      expect: "T1.16b",
    },
    {
      // The validator's half, the other way round.
      name: "the validator stops checking the arm",
      file: "src/data/viewmodel/validate.ts",
      from: '    if (format !== undefined && !(isString(format) && Y_FORMATS.has(format))) {',
      to: "    if (false) {",
      expect: "T1.16b",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
