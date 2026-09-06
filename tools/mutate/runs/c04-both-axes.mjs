/**
 * C04 §3 *Both axes* and C09 §2c — the mutation pass for C04 I100–I103 and for
 * C09 I42–I44 (C04 T6.87–T6.89, C09 T6.87–T6.88, and the rows they name).
 *
 * Every anchor is a line the landing round wrote; the control empties the one
 * placement function both walks read, so a green control would mean nothing in
 * the set reaches a placement and every kill below is unearned.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/view-model.test.ts test/edge/view-model.test.ts " +
  "test/revert/view-model.test.ts test/contract/block-window.test.ts test/edge/blocks.test.ts " +
  "test/revert/blocks.test.ts";
const MEASURE = "src/data/viewmodel/measure.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const CONTAINERS = "src/presentation/blocks/kinds/containers.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";
const REGISTRY = "src/presentation/blocks/registry.ts";
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
    // T6.87 (C04 I100) — the paired form parsed horizontal-first.
    name: "align parsed horizontal-first",
    file: MEASURE,
    from: "  return { v: entry.slice(0, dash) as Valign, h: entry.slice(dash + 1) as Halign };",
    to: "  return { h: entry.slice(0, dash) as Halign, v: entry.slice(dash + 1) as Valign };",
    expect: "T3.72",
  },
  {
    // T6.88 (C04 I102) — the floor dropped from the measure.
    name: "minRows dropped from the measure",
    file: MEASURE,
    from: "  return Math.max(content, block.minRows ?? 0);",
    to: "  return content;",
    expect: "T2.111",
  },
  {
    // T6.88's other half — the floor dropped from the render while the measure keeps it.
    name: "minRows dropped from the render only",
    file: CONTAINERS,
    from: "        ...(block.minRows === undefined ? {} : { minHeight: block.minRows }),",
    to: "",
    expect: "T3.72",
  },
  {
    // T6.89 (C04 I103) — the element walk places every row child at the top: F816 restored.
    name: "element walk ignores the vertical placement",
    file: REGISTRY,
    from: "            place(child, top + (at?.top ?? 0), col + (at?.left ?? 0), at?.width ?? share);",
    to: "            place(child, top, col + (at?.left ?? 0), at?.width ?? share);",
    expect: "T3.74",
  },
  {
    // C09 I42 — the registry answers the width for every kind.
    name: "registry width always answers the cell",
    file: REGISTRY,
    from: "    if (answer === undefined) return w;",
    to: "    if (answer === undefined) return w;\n    if (w >= 0) return w;",
    expect: "T3.68",
  },
  {
    // C09 T6.87 (I43) — a notice answers its unwrapped cells; the clamp reports it and LOUD throws.
    name: "notice width is the unwrapped text",
    file: SIMPLE,
    from: "    for (const row of noticeRows(block, w)) longest = Math.max(longest, cells(runsText(row)));",
    to: "    longest = cells(block.text); for (const row of noticeRows(block, w)) longest = Math.max(longest, cells(runsText(row)));",
    expect: "T6.87",
  },
  {
    // C04 I101 R2 — the child rendered at its cell rather than its content width.
    name: "aligned child rendered at the cell width",
    file: CONTAINERS,
    from: "            ctx.renderChild(child, at.width),",
    to: "            ctx.renderChild(child, widths[index] ?? 1),",
    expect: "T3.69",
  },
  {
    // C04 I101 — the horizontal offset never applied.
    name: "horizontal offset zeroed",
    file: MEASURE,
    from: '      left: offsetIn(cellWidth, contentWidth, axes.h === "left" ? "start" : axes.h === "centre" ? "middle" : "end"),',
    to: "      left: 0,",
    expect: "T3.69",
  },
  {
    // C04 I100 table row 7 — the odd remainder rounded up instead of down.
    name: "centre rounds up",
    file: MEASURE,
    from: "  return at === \"end\" ? slack : Math.floor(slack / 2);",
    to: "  return at === \"end\" ? slack : Math.ceil(slack / 2);",
    expect: "T3.70",
  },
  {
    // C09 §2c — a column with an aligned child answers the widest child.
    name: "aligned column answers the widest child",
    file: CONTAINERS,
    from: '      if (block.children.some((_child, i) => axesOf(block.align?.[i]).h !== "left")) return w;',
    to: "",
    expect: "T3.69",
  },
  {
    // C04 I100 table row 14 — any string accepted.
    name: "align vocabulary unchecked",
    file: VALIDATE,
    from: "    if (typeof entry !== \"string\" || !(ALIGN_ENTRIES as readonly string[]).includes(entry)) {",
    to: "    if (typeof entry !== \"string\") {",
    expect: "T2.110",
  },
  {
    // C04 I102 — a fraction or zero of a row accepted.
    name: "minRows accepts any number",
    file: VALIDATE,
    from: "  if (typeof minRows !== \"number\" || !Number.isInteger(minRows) || minRows < 1) {",
    to: "  if (typeof minRows !== \"number\") {",
    expect: "T2.111",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: MEASURE,
    from: "  const heights = placed.map((child, i) => measureChild(child, widths[i] ?? 1));",
    to: "  const heights = placed.map((child, i) => measureChild(child, widths[i] ?? 1));\n  if (heights.length >= 0) throw new Error(\"control\");",
    why:
      "no group can place a child at all — if this survives, nothing in the set reaches a " +
      "placement and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));
const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
