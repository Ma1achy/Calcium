// C04 I145, C04 I146 and C09 I135 — the finished bar, its gate, and its alphabet
// (review batch 4, M16.2, M16.3, M16.4).
//
// **Each defect draws a bar that reads as a bar.** A finished bar measuring 1
// is a full bar, which is what every bar did; a quantity that finishes when it
// should persist takes a saturated host off the screen; a braille bar that
// floors its eighths is one dot short and nobody counts dots.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const KIND = "src/presentation/blocks/kinds/simple.ts";
const GATE = "src/data/viewmodel/validate.ts";
const FILES = [
  "test/contract/blocks.test.ts",
  "test/contract/bars.test.ts",
  "test/contract/view-model.test.ts",
  "test/revert/view-model.test.ts",
  "test/revert/blocks.test.ts",
].join(" ");

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 600000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change every row can see**: no alphabet is ever named, so every bar
    // draws the default block and the table, the frames and T1.80 disagree.
    file: KIND,
    from: "    const bar = barStyle(ctx.capabilities, alphabet);",
    to: "    const bar = barStyle(ctx.capabilities, alphabet === undefined ? \"ascii\" : \"ascii\");",
    why: "every bar draws ASCII, so T2.226's alphabets and T2.227's frames fail at every row",
  },
  mutations: [
    {
      // **THE DEFECT (C04 I145)**: a finished bar measures 1 — the full bar
      // every bar drew. The render is emptied, so C09 I1 fails too.
      name: "THE DEFECT: a finished bar still measures one row",
      file: KIND,
      from: "  measure: (block: Progress) => (finished(block) ? 0 : 1),",
      to: "  measure: () => 1,",
      expect: "T1.80",
    },
    {
      name: "a finished bar still renders its row",
      file: KIND,
      from: "    if (finished(block)) return [];",
      to: "",
      expect: "T1.80",
    },
    {
      // **A capacity finishes** — a full disk vanishes at the moment it matters.
      name: "every declared quantity finishes, capacity included",
      file: KIND,
      from: "  return (block.quantity === \"progress\" || block.quantity === \"count\") && block.total > 0",
      to: "  return block.quantity !== undefined && block.total > 0",
      expect: "T1.80",
    },
    {
      // **D25 reversed**: an undeclared bar finishes, and examples/docker's
      // CPU bar goes at 100%.
      name: "an undeclared quantity finishes",
      file: KIND,
      from: "  return (block.quantity === \"progress\" || block.quantity === \"count\") && block.total > 0",
      to: "  return block.quantity !== \"capacity\" && block.total > 0",
      expect: "T1.80",
    },
    {
      name: "a total of zero is finished",
      file: KIND,
      from: "&& block.total > 0 && block.current >= block.total;",
      to: "&& block.current >= block.total;",
      expect: "T1.80",
    },
    {
      name: "finished only past the total, not at it",
      file: KIND,
      from: "&& block.total > 0 && block.current >= block.total;",
      to: "&& block.total > 0 && block.current > block.total;",
      expect: "T1.80",
    },
    {
      // **C04 I146**: the checks the arm never had, one at a time.
      name: "painted is not checked",
      file: GATE,
      from: "    if (b[\"painted\"] !== undefined && typeof b[\"painted\"] !== \"boolean\") {",
      to: "    if (b[\"painted\"] === null) {",
      expect: "T2.151",
    },
    {
      name: "quantity drops out of the union checks",
      file: GATE,
      from: "    for (const [field, union] of PROGRESS_UNIONS) {",
      to: "    for (const [field, union] of PROGRESS_UNIONS.slice(1)) {",
      expect: "T2.151",
    },
    {
      name: "style is not checked",
      file: GATE,
      from: "    if (b[\"style\"] !== undefined && !isString(b[\"style\"])) {",
      to: "    if (b[\"style\"] === null) {",
      expect: "T2.151",
    },
    {
      // **THE DEFECT (C09 I135)**: segmented back to slant, §035's specimens
      // over the registry's rule.
      name: "THE DEFECT: segmented work draws slant",
      file: KIND,
      from: "  if (granularity === \"segmented\") return style === undefined || style === \"braille\" ? \"posts\" : style;",
      to: "  if (granularity === \"segmented\") return style === undefined ? \"slant\" : style;",
      expect: "T2.226",
    },
    {
      name: "braille on segmented work stands",
      file: KIND,
      from: "  if (granularity === \"segmented\") return style === undefined || style === \"braille\" ? \"posts\" : style;",
      to: "  if (granularity === \"segmented\") return style === undefined ? \"posts\" : style;",
      expect: "T2.226",
    },
    {
      name: "posts on continuous work stand",
      file: KIND,
      from: "  if (granularity === \"continuous\") return style === undefined || style === \"posts\" ? \"block\" : style;",
      to: "  if (granularity === \"continuous\") return style === undefined ? \"block\" : style;",
      expect: "T2.226",
    },
    {
      // **The steps dropped** — braille back to whole cells.
      name: "braille draws whole cells",
      file: KIND,
      from: "    const steps = painted ? undefined : bar.steps;",
      to: "    const steps = undefined as readonly string[] | undefined;",
      expect: "T2.227",
    },
    {
      name: "a painted braille bar draws eighths",
      file: KIND,
      from: "    const steps = painted ? undefined : bar.steps;",
      to: "    const steps = bar.steps;",
      expect: "T2.227",
    },
    {
      name: "eighths floored rather than rounded",
      file: KIND,
      from: "    const eighths = steps === undefined ? 0 : Math.round(fill * barWidth * 8);",
      to: "    const eighths = steps === undefined ? 0 : Math.floor(fill * barWidth * 8);",
      expect: "T2.227",
    },
    {
      name: "the step index is off by one",
      file: KIND,
      from: "steps[(eighths % 8) - 1]",
      to: "steps[eighths % 8]",
      expect: "T2.227",
    },
    {
      // **The partial cell first** on the ramped path — the right glyphs, the
      // wrong order.
      name: "the ramped partial cell is drawn first rather than last",
      file: KIND,
      from: "partial !== undefined && i === filled - 1 ? partial : whole",
      to: "partial !== undefined && i === 0 ? partial : whole",
      expect: "T2.227",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
