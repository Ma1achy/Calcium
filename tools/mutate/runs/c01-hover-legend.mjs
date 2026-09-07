// C01 I21, C16 §4a (hover and legend rows), C12 I117 — hover as an opt-in mode
// and the legend that clicks: the mode switch, the decoder's `none`, the hover
// arm that must not focus, the arming machine that must not disarm, and the
// legend's inverse.
//
// Run by hand on landing (2026-09-05): every row named died and the control
// killed T4.73 and T4.73b. **The decoder mutation is the one to read**: it
// kills T1.3r and T4.72c — the row that pushes SGR bytes through the real
// decoder — and *not* T4.72, which constructs `InputEvent`s and so cannot see
// what the decoder does to `Cb = 35`. A graph-level row tests the router and
// the frame row tests the system; both are kept for that reason.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/lifecycle.test.ts test/unit/router-decode.test.ts " +
  "test/unit/router-dispatch.test.ts test/unit/session-mouse.test.ts test/unit/plot-legend-hit.test.ts";
const LIFECYCLE = "src/terminal/lifecycle.ts";
const DECODE = "src/interaction/router/decode.ts";
const ROUTER = "src/interaction/router/router.ts";
const CONSTRUCT = "src/shell/construct.ts";
const DEFINITION = "src/presentation/plot/definition.ts";

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
    from: "    const series = sample === null ? legendUnder(hit.id, under, e.col) : null;",
    to: "    const series = null;",
    why: "the legend arm removed — T4.73 and T4.73b fail; a run in which the third writer can vanish and stay green cannot see the seam",
  },
  mutations: [
    {
      // **Hover moves focus** (§4a row q). The readout follows and so does the
      // highlight — every store-level index assertion passes, and T4.72's focus
      // arm and T4.72c's cursor row are what see it.
      name: "the hover arm focuses the plot before aiming",
      file: CONSTRUCT,
      from:
        "      return () => {\n        stores.cursorPositions.set(over.id, under.block.id, sample);\n        scheduler.commit(\"input\");\n      };\n",
      to:
        "      return () => {\n        focus.enterLiveBlock(over.id, Object.freeze({ blockId: under.blockId, elementId: under.element.id }));\n        stores.cursorPositions.set(over.id, under.block.id, sample);\n        scheduler.commit(\"input\");\n      };\n",
      expect: "T4.72",
    },
    {
      // **The legend's origin off by the swatch's width** (C12 I117, T6.94): a
      // click on the swatch answers nothing and a click two cells into the label
      // answers the entry — inside the bounds, on the wrong cells.
      name: "the right legend's column origin off by two",
      file: DEFINITION,
      from: "    placement === \"right\" ? { col: pad + layout.width, row: lid, width: layout.reserved ?? 0 }\n",
      to: "    placement === \"right\" ? { col: pad + layout.width + 2, row: lid, width: layout.reserved ?? 0 }\n",
      expect: "T1.129",
    },
    {
      // **1003 with hover off** (C01 I21, T6.22): every session floods, and the
      // default stops being what shipped. T1.1, T1.2 and T1.20 die with the
      // control arm — the row that exists for this mutation.
      name: "the tracking pair chosen unconditionally",
      file: LIFECYCLE,
      from: "  const mouseMode = opts.hover === true ? MOUSE_ANY : MOUSE;\n",
      to: "  const mouseMode = MOUSE_ANY;\n",
      expect: "T1.29 (control)",
    },
    {
      // **`3` folded onto `button3`** (C16 I30): a hover decodes as a second
      // button's drag and `pointerEffect` records it and does nothing. T1.3r
      // and the frame row T4.72c see it; the graph-level T4.72 cannot.
      name: "the decoder names no button `button3`",
      file: DECODE,
      from: "          : low === 3\n            ? \"none\"\n            : (`button${low}` as const);\n",
      to: "          : (`button${low}` as const);\n",
      expect: "T1.3r",
    },
    {
      // **A hover disarms `⌃c`** (§4a row t): the double-press exit is
      // unreachable while a hand rests on the mouse.
      name: "the arming machine disarms on a hover",
      file: ROUTER,
      from: "    if (e.kind === \"mouse\" && e.button === \"none\") return null;\n    armedAt = null;\n",
      to: "    armedAt = null;\n",
      expect: "T3.8d",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
