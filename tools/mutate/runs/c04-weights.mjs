// Roadmap 38 — weights on a `row` group.
//
// **Two of these are invisible to every test that existed**, and they are the
// same shape: proportional-versus-off-the-top and by-cost-versus-by-position are
// *identical under an equal split*, so the whole suite before this entry agrees
// with both. Only a row comparing weighted to unweighted, and one whose largest
// weight is last, can tell them apart.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
// **The survivor count is the verdict, not the label**: a mutation naming a
// symbol the file no longer has "catches" by throwing.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/edge/view-model.test.ts test/unit/view-model.test.ts " +
  "test/contract/view-model.test.ts test/integration/blocks.test.ts";
const MEASURE = "src/data/viewmodel/measure.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const BUILDERS = "src/shell/builders/index.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **The gutter taken proportionally.** Right at every equal split and wrong
    // at every uneven one, so it passes every row that existed before this
    // entry — and T3.16 is the only shape that separates them.
    name: "the gutter is taken proportionally, not off the top",
    file: MEASURE,
    from: "  const budget = w - gaps;",
    to: "  const budget = w;",
    expect: "T3.17",
  },
  {
    // **Placement by cost rather than by position.** Same shape: identical
    // under equal weights, and it changes which child survives at a narrow
    // width — so the rendered set would depend on a number rather than on the
    // order the author wrote.
    name: "a narrow row drops by size rather than by position",
    file: MEASURE,
    from: "  for (const each of widths) {",
    to: "  for (const each of [...widths].sort((a, z) => a - z)) {",
    expect: "T3.18",
  },
  {
    // **The remainder spent on the leftmost child** — the walk's own first
    // ruling, corrected by the code because it makes `[1, 1]` differ from
    // absent. T3.16 is what catches it, which is the row that exists for the
    // gutter.
    name: "the remainder goes to the leftmost child",
    file: MEASURE,
    from: "  return block.children.map((_child, i) =>\n    normaliseWidth(Math.floor((budget * (weights[i] ?? 1)) / total)),\n  );",
    to: "  const shares = block.children.map((_child, i) =>\n    normaliseWidth(Math.floor((budget * (weights[i] ?? 1)) / total)),\n  );\n  const spent = shares.reduce((sum, s) => sum + s, 0);\n  return shares.map((s, i) => (i === 0 ? s + (budget - spent) : s));",
    expect: "T3.16",
  },
  {
    // **Absent weights stop meaning an equal split**, which would break every
    // existing `column` call site and is the regression half of T3.16.
    name: "absent weights are not an equal split",
    file: MEASURE,
    from: "  const weights = block.flex ?? block.children.map(() => 1);",
    to: "  const weights = block.flex ?? block.children.map((_c, i) => i + 1);",
    expect: "T3.16",
  },
  {
    // **A zero weight accepted at construction**, so a value with two readings
    // and no use enters a published type.
    name: "a zero weight is constructible",
    file: BUILDERS,
    from: "      if (!Number.isFinite(weight) || weight <= 0) {",
    to: "      if (false) {",
    expect: "T1.20",
  },
  {
    // **And accepted by the validator**, which is the arm a document arriving
    // from a fixture or a far side takes — no constructor in between.
    name: "the validator accepts a zero weight",
    file: VALIDATE,
    from: "    if (typeof weight !== \"number\" || !Number.isFinite(weight) || weight <= 0) {",
    to: "    if (false) {",
    expect: "T1.20",
  },
  {
    // **A length mismatch inferred rather than refused**, which is the framework
    // choosing a layout.
    name: "a short weight list is padded",
    file: BUILDERS,
    from: "    if (flex.length !== children.length) {",
    to: "    if (false) {",
    expect: "T1.20",
  },
];

const EXPECTED_SURVIVORS = new Map();

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: MEASURE,
    from: "export function groupChildWidths(block: Group, width: number): readonly number[] {",
    to: "export function groupChildWidths(_block: Group, _width: number): readonly number[] {\n  throw new Error(`control`);\n}\nfunction unusedGroupChildWidths(block: Group, width: number): readonly number[] {",
    why:
      "no group can compute a child's width at all — if this survives, nothing in the set " +
      "reaches the width rule and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
