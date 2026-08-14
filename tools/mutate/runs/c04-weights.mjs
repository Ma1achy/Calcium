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
  "test/contract/view-model.test.ts test/integration/blocks.test.ts " +
  "examples/docker/test/banner.test.ts";
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
    from: "  const budget = w - gaps - fixed;",
    to: "  const budget = w - fixed;",
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
    from: "    return normaliseWidth(Math.floor((budget * share) / weights));",
    to: "    const each = normaliseWidth(Math.floor((budget * share) / weights));\n    const spent = shares.reduce((sum, s) => sum + (isCells(s) ? 0 : Math.floor((budget * s) / weights)), 0);\n    return i === 0 ? each + (budget - spent) : each;",
    expect: "T3.16",
  },
  {
    // **Absent weights stop meaning an equal split**, which would break every
    // existing `column` call site and is the regression half of T3.16.
    name: "absent weights are not an equal split",
    file: MEASURE,
    from: "  const shares = block.flex ?? block.children.map(() => 1);",
    to: "  const shares = block.flex ?? block.children.map((_c, i) => i + 1);",
    expect: "T3.16",
  },
  {
    // **A zero weight accepted at construction**, so a value with two readings
    // and no use enters a published type.
    name: "a zero weight is constructible",
    file: BUILDERS,
    from: "          : !Number.isFinite(share) || share <= 0;",
    to: "          : false;",
    expect: "T1.20",
  },
  {
    // **And accepted by the validator**, which is the arm a document arriving
    // from a fixture or a far side takes — no constructor in between.
    name: "the validator accepts a zero weight",
    file: VALIDATE,
    from: "    if (typeof share !== \"number\" || !Number.isFinite(share) || share <= 0) {",
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
  {
    // **The weighted shares computed over the whole budget** rather than over
    // what the fixed children left — which makes a cell count a suggestion, and
    // is right at exactly one width per row.
    name: "the weights divide the budget the fixed children already took",
    file: MEASURE,
    from: "  const budget = w - gaps - fixed;",
    to: "  const budget = w - gaps;",
    expect: "T3.20",
  },
  {
    // **A fixed share treated as a weight**, which is the state before this
    // half: the banner's whale drifts with the terminal.
    name: "a cell count is read as a weight",
    file: MEASURE,
    from: "    if (isCells(share)) return normaliseWidth(share.cells);",
    to: "",
    expect: "T3.20",
  },
  {
    // **Fixed children placed first.** The rendered set would depend on a
    // declaration rather than on the order the author wrote — C04 I42's rule a
    // second time (C04 I42), and the fixture puts the fixed child last for that reason.
    name: "a fixed child is placed before the others",
    file: MEASURE,
    from: "  const widths = groupChildWidths(block, width);\n  let used = 0;",
    to: "  const shares = block.flex ?? [];\n  const order = block.children\n    .map((_c, i) => i)\n    .sort((a, z) => (typeof shares[a] === \"object\" ? -1 : 0) - (typeof shares[z] === \"object\" ? -1 : 0));\n  const all = groupChildWidths(block, width);\n  const widths = order.map((i) => all[i] ?? 1);\n  let used = 0;",
    expect: "T3.21",
  },
  {
    // **`{cells: 0}` accepted**, on the same argument as a zero weight: a share
    // that names something the grid has no reading for.
    name: "a zero cell count is constructible",
    file: BUILDERS,
    from: "          ? !Number.isInteger(share.cells) || share.cells <= 0",
    to: "          ? false",
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
