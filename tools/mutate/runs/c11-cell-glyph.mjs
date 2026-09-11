// C11 I23 — a bar or spark cell's glyph, mutated.
//
// **The mark was never drawn and four goldens recorded the absence** (F1104).
// `cells.ts` pushed `valueBar(cell.bar, planned.width, …)` and returned forty
// lines above the line that reads `cell.glyph`, while C04 I6 obliges the mark at
// construction and `examples/docker` reserved two cells for it. The survivor on
// the first automated sweep — *the glyph slot is not reserved* — was right: its
// subject was inert.
//
// The suite is the unit rows **and the goldens**, because the frame is what says
// the mark arrived: T1.26 asserts the cell and the ten golden frames assert that
// nothing else moved with it.
//
// The control is the early return restored. The two mutations are the plausible
// half-fixes: the lead drawn *beside* the plan rather than inside it, which puts
// every column after it two cells right, and the drop guard I23 asked for in its
// first form and the frame falsified.
//
// Anchors and expectations run by hand on 2026-09-11.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/table.test.ts test/golden/states.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const FILE = "src/presentation/table/cells.ts";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FILE,
    from: "      const { lead, room } = seriesLead(cell, planned.width, ctx);\n      const style = tone(cell.tone ?? \"accent\", ctx.theme, ctx.capabilities);\n      if (lead !== \"\") spans.push({ text: lead, style });\n      spans.push({ text: valueBar(cell.bar, room, ctx.capabilities), style });",
    to: "      const style = tone(cell.tone ?? \"accent\", ctx.theme, ctx.capabilities);\n      spans.push({ text: valueBar(cell.bar, planned.width, ctx.capabilities), style });",
    why: "the shipped behaviour restored — T1.26 fails on the mark and all ten golden frames move back; a run that cannot see the absence cannot see the invariant that ends it",
  },
  mutations: [
    {
      // **The plausible half-fix.** The mark appears, every assertion about it
      // passes, and the cell is two cells wider than the column planned — so
      // every column to its right starts two cells late and the header
      // disagrees with the rows beneath it (I21). Only a width assertion sees it.
      name: "the lead is drawn beside the plan rather than inside it",
      file: FILE,
      from: "      spans.push({ text: valueBar(cell.bar, room, ctx.capabilities), style });",
      to: "      spans.push({ text: valueBar(cell.bar, planned.width, ctx.capabilities), style });",
      expect: "T1.26",
    },
    {
      // I23's first form, which the frame falsified: at a planned width of 3 a
      // toned cell draws `▲ …` where an untoned one draws `10…` for 101.2, and
      // C12 I20 already ruled that a truncated number is a different number.
      name: "the mark is dropped on a width that holds it",
      file: FILE,
      from: "  return room >= 0 ? { lead, room } : { lead: \"\", room: width };",
      to: "  return room > 0 ? { lead, room } : { lead: \"\", room: width };",
      expect: "T1.27",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
