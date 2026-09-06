// C16 I31 — the pointer's gesture table onto the key effects, mutated.
//
// **Every mutation here leaves a click that lands inside the bounds and on the
// wrong thing**, which is why each expectation names *which* element a row
// asserts rather than that one was focused (C16 §4a). The control is the wheel
// test restored to the two directions it named when the decoder produced only
// two — the shipped line, under which a horizontal wheel is routed as a click.
//
// Anchors and expectations are Lane W's, each run by hand on 2026-09-05 with
// the source restored and compared after every run (no harness run; the pass
// through `tools/mutate` is owed). Measured kills, 44 rows in the two files:
//   control  → T1.3o alone (1 of 44). T4.66's `wheelLeft` half survives it,
//              because the pointer arm declines a horizontal wheel on its own
//              — the control is the router's row, not the session's.
//   cols     → T4.63 alone (the second chip is unreachable; `chip-0` wins)
//   liveId   → T4.62 (+ T4.62b, T4.62c, T4.64, T4.65, T4.66, T4.66b, T4.67 —
//              eight: the settled entry and the box entry are never the hit)
//   again    → T4.64 alone (the second click re-focuses; the prompt stays empty)
//   chrome   → T4.62b (+ eight more: every click lands one command line low)
//   offset   → T4.66b alone (`n1` where `n3`; `n3` where `n5`)
//   align    → T4.62c (+ seven graph-level rows: ten blank rows above the
//              transcript, and C14 answers `null` for a row past `totalRows`)
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/session-mouse.test.ts test/unit/router-dispatch.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/interaction/router/router.ts",
    from: '    const wheel = e.button.startsWith("wheel");\n',
    to: '    const wheel = e.button === "wheelUp" || e.button === "wheelDown";\n',
    why: "the shipped test named two of four wheel directions — T1.3o fails on `wheelLeft` reaching `liveBlock` as a click, and a run that cannot see it restored cannot see the ruling",
  },
  mutations: [
    {
      name: "the find by rows alone — cols ignored",
      file: "src/shell/construct.ts",
      from: "      if (col < p.element.cols.from || col >= p.element.cols.to) continue;\n",
      to: "",
      expect: "T4.63",
    },
    {
      name: "the hit entry replaced by `liveId` — the settled entry can never be clicked",
      file: "src/shell/construct.ts",
      from: "    const hit = entryAtRegionRow(e.row - deps.frame.region().top);\n    if (hit === null) return null;\n",
      to: "    const hit0 = entryAtRegionRow(e.row - deps.frame.region().top);\n    if (hit0 === null) return null;\n    const hit = { id: stores.transcript.liveId ?? hit0.id, rowOffset: hit0.rowOffset };\n",
      expect: "T4.62",
    },
    {
      name: "the click-again branch dropped — a row can be reached and never acted on",
      file: "src/shell/construct.ts",
      from: "      return at.mode === \"interact\" ? null : keys.table.rowActivate;\n",
      to: "      return at.mode === \"interact\" ? null : () => focus.focusRow(hit.id, address);\n",
      expect: "T4.64",
    },
    {
      name: "the chrome subtraction dropped — every click lands one command line low",
      file: "src/shell/construct.ts",
      from: "    const blockRow = hit.rowOffset - chromeRowsOf(entry, width);\n",
      to: "    const blockRow = hit.rowOffset;\n",
      expect: "T4.62b",
    },
    {
      name: "the scroll offset translation dropped — the child above the pointer, by exactly the offset",
      file: "src/shell/construct.ts",
      from: "        row = blockRow + Math.min(Math.max(0, Math.trunc(held)), Math.max(0, content - block.height));\n",
      to: "        row = blockRow;\n",
      expect: "T4.66b",
    },
    {
      name: "the frame's bottom alignment ignored — C14 is asked from the region's top",
      file: "src/shell/construct.ts",
      // Re-anchored when the subtraction became `paint.ts`'s exported
      // `blankRowsAbove` (C14 I19, F755) — the click side alone ignores it here,
      // so the frame and the click disagree and T4.62c reads the difference.
      // Applied by hand on re-anchoring; the harness was not run in that lane.
      from: "    return stores.viewport.entryAtRow(regionRow - blankRowsAbove(viewportHeight, totalRows));\n",
      to: "    return stores.viewport.entryAtRow(regionRow + 0 * blankRowsAbove(viewportHeight, totalRows));\n",
      expect: "T4.62c",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
