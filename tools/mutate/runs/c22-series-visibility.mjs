// C22 I78, C12 I116, C04 I99 — the series toggle: the store, the plot-declared
// keymap that writes it, the ninth render-key axis, and the member underneath.
//
// **The `⌃a` class is the one to watch** (F769): a key whose effect writes a
// store the frame is served from before it moved. That is M1 and M6 below, and
// the row that catches each is the frame row and not the writer row — T4.17r
// passes with the axis gone, which is why the two are separate mutations.
//
// Run by hand on landing (2026-09-05); every row named died and the control was
// green. A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/series-visibility.test.ts test/unit/plot-hidden.test.ts " +
  "test/unit/router-dispatch.test.ts";
const SESSION = "src/shell/session.ts";
const CONSTRUCT = "src/shell/construct.ts";
const DEFINITION = "src/presentation/plot/definition.ts";
const FURNITURE = "src/presentation/plot/furniture.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const VISIBILITY = "src/presentation/plot/visibility.ts";

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
    file: CONSTRUCT,
    from: "    stores.seriesVisibility.set(entryId, plot.id, index, !hiddenNow);",
    to: "    void hiddenNow;",
    why: "the writer removed — T4.17r, T4.17s and T4.18g fail; a run in which the store can lose its only writer and stay green cannot see the seam at all",
  },
  mutations: [
    {
      // **The axis dropped.** The writer works, the store holds the toggle, and
      // the frame is served from before it — T4.17r passes and only the frame row
      // sees it (C22 T6.94).
      name: "the ninth axis dropped from the slot",
      file: SESSION,
      from: "${cursorKey}\\u0000${framesKey}\\u0000${seriesKey}${animated}",
      to: "${cursorKey}\\u0000${framesKey}${animated}",
      expect: "T4.17s",
    },
    {
      // **The keymap never merged.** `plotDefinition.keymap` declares the digits
      // and nothing hands them to the router, so `2` is a character everywhere.
      name: "the block keymap never synced at dispatch",
      file: CONSTRUCT,
      from: "    syncBlockKeymap();\n    const binding = keymap.resolve(target, e.key);",
      to: "    const binding = keymap.resolve(target, e.key);",
      expect: "T4.17r",
    },
    {
      // **The member honoured by the legend and not by the area** — the frame
      // says *hidden* in the swatch and draws the curve anyway (C12 T6.93).
      name: "the hidden filter removed from overlaidRows",
      file: DEFINITION,
      from: "    seriesHidden(block, index, ctx) ? [] : [{ s, index }]);",
      to: "    [{ s, index }]);",
      expect: "T1.127",
    },
    {
      // **The swatch keeps the series' own mark.** The curve is gone and the
      // legend does not say so, which is the toggle a reader cannot undo by eye.
      name: "the hollow arm removed from the legend",
      file: FURNITURE,
      from:
        "      (slot.role === \"series\" && seriesHidden(block, slot.seriesIndex ?? 0, ctx)) || slot.hidden === true\n" +
        "        ? g.hollow\n" +
        "      : slot.role === \"rising\"",
      to: "      slot.role === \"rising\"",
      expect: "T1.127",
    },
    {
      // **`hidden` accepted on a `bar`**, where it means nothing and reads as not
      // yet implemented (F207; C04 T6.86).
      name: "the form gate removed from the validator",
      file: VALIDATE,
      from: '  if (typeof form === "string" && HAS_HIDEABLE_SERIES[form as PlotForm] === false) {',
      to: "  if (false) {",
      expect: "T3.68",
    },
    {
      // **The field with no writer's shape, arriving from the other side**: the
      // store is written and keyed and never reaches the renderer (C22 I71).
      name: "the store not threaded into the render context",
      file: SESSION,
      from: "          seriesVisibility: graph.seriesVisibility.forEntry(entry.id),\n",
      to: "",
      expect: "T4.17s",
    },
    {
      // **The override ignored**: the member wins and the reader's toggle is
      // recorded, keyed, threaded and inert — every row about the block passes.
      name: "the override ignored by the reader",
      file: VISIBILITY,
      from: "  if (override !== undefined) return override;\n",
      to: "",
      expect: "T1.128",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
