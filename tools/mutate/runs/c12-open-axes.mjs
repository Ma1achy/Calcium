// C12 I143 — a plot that names no frame draws the rule style, open at the
// right (T6.118).
//
// **Four ways to break it**: the one constant set back, the layout's default
// restated in place, the figure's default restated in place (the second arm's
// answer), and the rule's bottom edge closed with a corner.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass, strip } from "../mutate.mjs";

const ROOT = process.cwd();
const FIGURE = "src/presentation/plot/figure.ts";
const DEFINITION = "src/presentation/plot/definition.ts";
const FURNITURE = "src/presentation/plot/furniture.ts";
const FILES = "test/contract/plot.test.ts test/revert/plot.test.ts test/unit/plot-mutations.test.ts";

const CONTROL = {
  // **A change the corpus can see** (F1254): with `axes` read backwards no
  // plot that asked for furniture draws any.
  file: FIGURE,
  from: 'return block.axes === true ? block.plotFrame ?? DEFAULT_PLOT_FRAME : "none";',
  to: 'return block.axes === false ? block.plotFrame ?? DEFAULT_PLOT_FRAME : "none";',
  why: "the border is drawn for a plot with no axes — if this survives, the rows are not reading the frame",
};

const MUTATIONS = [
  {
    name: "T6.118: the default set back to box",
    file: FIGURE,
    from: 'export const DEFAULT_PLOT_FRAME: FrameStyle = "rule";',
    to: 'export const DEFAULT_PLOT_FRAME: FrameStyle = "box";',
    expect: "T2.131",
  },
  {
    name: "the layout's default restated as box",
    file: DEFINITION,
    from: "{ ...layout, style: block.plotFrame ?? DEFAULT_PLOT_FRAME }",
    to: '{ ...layout, style: block.plotFrame ?? "box" }',
    expect: "T2.131",
  },
  {
    name: "the figure's default restated as box",
    file: FIGURE,
    from: 'return block.axes === true ? block.plotFrame ?? DEFAULT_PLOT_FRAME : "none";',
    to: 'return block.axes === true ? block.plotFrame ?? "box" : "none";',
    expect: "T2.131",
  },
  {
    name: "T6.118: the rule's bottom edge closed with a corner",
    file: FURNITURE,
    from: 'layout.frame !== true ? "" : style === "rule" ? g.horizontal : g.bottomRight',
    to: 'layout.frame !== true ? "" : g.bottomRight',
    expect: "T2.131",
  },
];

const { read, write } = fsIo(ROOT);

const named = () => {
  const hit = [{ name: "control", ...CONTROL }, ...MUTATIONS].find((m) => read(m.file).includes(m.to));
  return hit === undefined ? "the clean tree" : hit.name;
};
const run = () => {
  const label = named();
  let out;
  try {
    out = execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const both = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    out = e.killed === true ? `${both}\nTIMED OUT after 300000ms` : both;
  }
  const fails = [...new Set(strip(out).split("\n").filter((l) => /^\s*FAIL\s/u.test(l)).map((l) => l.trim()))];
  console.log(`── ${label}: ${String(fails.length)} FAIL line(s)`);
  for (const l of fails) console.log(`   ${l}`);
  return out;
};

const results = runPass({ read, write, run, control: CONTROL, mutations: MUTATIONS });

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
