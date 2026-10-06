// C11 I34 — the header's labels muted and bold, and the sort indicator accent
// and bold as a span of its own (T6.38).
//
// **Three ways to break it, one per carrier**: the labels' weight, the
// indicator's weight, and the indicator folded back into the label's span.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass, strip } from "../mutate.mjs";

const ROOT = process.cwd();
const CELLS = "src/presentation/table/cells.ts";
const FILES = "test/contract/table.test.ts test/revert/table.test.ts";

const CONTROL = {
  // **A change the corpus can see** (F1254): the indicator in the label's tone
  // is the one thing both rows say it is not.
  file: CELLS,
  from: '  const mark = { ...tone("accent", ctx.theme, ctx.capabilities, on), bold: true };',
  to: '  const mark = { ...tone("muted", ctx.theme, ctx.capabilities, on), bold: true };',
  why: "the indicator takes the label's tone — if this survives, the rows are not reading the indicator",
};

const MUTATIONS = [
  {
    name: "T6.38: the labels at regular weight",
    file: CELLS,
    from: '  const head = { ...tone("muted", ctx.theme, ctx.capabilities, on), bold: true };',
    to: '  const head = { ...tone("muted", ctx.theme, ctx.capabilities, on) };',
    expect: "T2.17",
  },
  {
    name: "T6.38: the indicator at regular weight",
    file: CELLS,
    from: '  const mark = { ...tone("accent", ctx.theme, ctx.capabilities, on), bold: true };',
    to: '  const mark = { ...tone("accent", ctx.theme, ctx.capabilities, on) };',
    expect: "T2.17",
  },
  {
    name: "T6.38: the indicator inside the label's span",
    file: CELLS,
    from: '    const found = indicator === "" ? -1 : text.indexOf(labelled);',
    to: "    const found = -1;",
    expect: "T6.38",
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
