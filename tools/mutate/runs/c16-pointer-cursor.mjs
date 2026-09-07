// C16 §4a, C12 §3s, C26 §7 — the pointer's crosshair and the block-level focus paint, mutated.
//
// **Two writers of one store, and the pointer's half is geometry.** The keys
// never held a column; the pointer does, in block coordinates, and the plot area
// is narrower than the block by the gutter, a legend and the alignment pad. Every
// mutation below produces a plot that still focuses, still stores an index and
// still draws a crosshair — inside the bounds and on the wrong sample — which is
// why the rows that catch them name a column and an index and not a change.
//
// **Run by hand on landing (arc4 Lane R)**, each mutation applied, its suite
// run, and the source restored; the kills reported in the lane's report. The
// harness is not run by a lane — `COMMON.md` — so this file is the record the
// next pass runs.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/session-mouse.test.ts test/unit/render-focus.test.ts " +
  "test/unit/interaction-catalogue.test.ts test/unit/cursor-positions.test.ts";
const CONSTRUCT = "src/shell/construct.ts";
const DEFINITION = "src/presentation/plot/definition.ts";
const FURNITURE = "src/presentation/plot/furniture.ts";
const CONTAINERS = "src/presentation/blocks/kinds/containers.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";

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
    // The brief's named mutation: the block column read as an area column. At
    // five samples in 75 cells the gutter's four cells are inside every
    // sample's basin except the tie's and the gutter's own — so T4.70 carries
    // both, and T4.70b's one-sample-per-column fixture catches it at every
    // column.
    name: "the gutter, the pad and the legend are not subtracted",
    file: DEFINITION,
    from: "  const x = Math.floor(col) - pad - legend - layout.gutter; // cells-ok — an area column",
    to: "  const x = Math.floor(col); // cells-ok — an area column",
    expect: "T4.70",
  },
  {
    // The far end: `null` outside the area becomes the nearest sample, so a
    // click on the gutter stores 0 and a click on the right border stores n-1.
    name: "outside the area is the nearest sample rather than nothing",
    file: DEFINITION,
    from: "  if (x < 0 || x >= layout.areaWidth) return null; // cells-ok — an area column",
    to: "",
    expect: "T4.70",
  },
  {
    // The click focuses and does not aim: the state the keys already reached.
    name: "a click focuses the plot and leaves the crosshair",
    file: CONSTRUCT,
    from: "    return aim === null ? land : () => { land(); aim(); };",
    to: "    return land;",
    expect: "T4.70",
  },
  {
    // The second click falls through to `rowActivate`, which fires nothing on a
    // plot — so the crosshair stays where the first click put it.
    name: "a click on the focused plot is ⏎ rather than the crosshair",
    file: CONSTRUCT,
    from: "      if (aim !== null) return aim;\n      // Click again is `⏎`",
    to: "      // Click again is `⏎`",
    expect: "T4.71",
  },
  {
    // Motion extends the (empty) selection instead of aiming.
    name: "a drag over the focused plot is ⇧↓ rather than the crosshair",
    file: CONSTRUCT,
    from: "      if (onFocused && aim !== null) return aim;\n",
    to: "",
    expect: "T4.71",
  },
  {
    // The layout never learns about focus, so the frame stays muted.
    name: "reserving drops the focused flag",
    file: DEFINITION,
    from: "  const focused = focus !== null && focus.blockId === block.id && focus.rowId === block.id",
    to: "  const focused = false",
    expect: "T1.25",
  },
  {
    // The frame's painters read the flag but answer muted anyway.
    name: "frameTone ignores the flag",
    file: FURNITURE,
    from: '  return tone(layout.focused === true ? "accent" : "muted", ctx.theme, ctx.capabilities);',
    to: '  return tone("muted", ctx.theme, ctx.capabilities);',
    expect: "T1.25",
  },
  {
    // Any focus on the block would light the frame — a row's id, or the
    // `rowId: null` form no session writes (F802). T1.25 holds both as controls.
    name: "a row focus on the plot lights the frame",
    file: DEFINITION,
    from: "  const focused = focus !== null && focus.blockId === block.id && focus.rowId === block.id",
    to: "  const focused = focus !== null && focus.blockId === block.id",
    expect: "T1.25",
  },
  {
    name: "the residue row is dim under focus",
    file: CONTAINERS,
    from: '      const dim = tone(held ? "accent" : "dim", ctx.theme, ctx.capabilities);',
    to: '      const dim = tone("dim", ctx.theme, ctx.capabilities);',
    expect: "T1.26",
  },
  {
    name: "the head chip loses the ground",
    file: SIMPLE,
    from: '              ? { ...tone("accent", ctx.theme, ctx.capabilities), ...selectionStyle(ctx.theme, ctx.capabilities) }',
    to: '              ? tone("accent", ctx.theme, ctx.capabilities)',
    expect: "T1.24",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: CONSTRUCT,
    from: "    if (!cursorable(plot)) return null;\n    const { from, to } = under.element.cols;",
    to: "    return null;\n    const { from, to } = under.element.cols;",
    why:
      "the pointer never aims — if this survives, no row asks the store after a click and " +
      "every mutation above is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
