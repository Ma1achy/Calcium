// C09 I134 — a bounded box crops what it cannot slice (review batch 4, M14.6, D16).
//
// **Each defect draws a box that looks like a box.** A refused child kept
// whole over-draws by a few rows and pushes the residue down; a crop taken
// from the child's top draws the right count and the wrong rows; pads counted
// from the measure are right whenever render and measure agree.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const BOX = "src/presentation/blocks/kinds/containers.ts";
const FILES = "test/contract/scroll.test.ts test/revert/blocks.test.ts test/unit/blocks-measure-once.test.ts";

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
    // **A change every row can see**: a child the window holds whole draws
    // nothing, so every box is short and every residue moves up.
    file: BOX,
    from: "      if (from === 0 && to === height) return { child: r.child, rendered: ctx.renderChild(r.child, width) };",
    to: "      if (from === 0 && to === height) return { child: r.child, rendered: [] };",
    why: "a wholly held child draws no rows, so T3.130's held rows and T3.76's plot rows disagree",
  },
  mutations: [
    {
      // **THE DEFECT (F1334)**: the kept-whole arm — a refused child drawn
      // whole, the residue pushed below the box.
      name: "THE DEFECT: a child windowChild refuses is drawn whole",
      file: BOX,
      from: "        rendered: slice === null ? ctx.renderChild(r.child, width).slice(from, to) : ctx.renderChild(slice.block, width),",
      to: "        rendered: ctx.renderChild(slice === null ? r.child : slice.block, width),",
      expect: "T3.130",
    },
    {
      // **The crop top-aligned**: the right number of rows, taken from the
      // child's start rather than from where the window holds it.
      name: "the crop takes the child's first rows rather than the held ones",
      file: BOX,
      from: "ctx.renderChild(r.child, width).slice(from, to)",
      to: "ctx.renderChild(r.child, width).slice(0, to - from)",
      expect: "T3.130",
    },
    {
      // **The slice ignored where it is offered** — a sliceable kind cropped
      // like an atomic one. Equal wherever the slice is exact, which is always:
      // an expected survivor, named below with its reason.
      name: "a sliceable child is cropped rather than sliced",
      file: BOX,
      from: "        rendered: slice === null ? ctx.renderChild(r.child, width).slice(from, to) : ctx.renderChild(slice.block, width),",
      to: "        rendered: ctx.renderChild(r.child, width).slice(from, to),",
      expect: null,
    },
    {
      // **The pads counted from the measure** — right whenever the render
      // agrees with the measure, which is every kind that keeps C09 I1.
      name: "the pads are counted from the children's measures rather than the rows drawn",
      file: BOX,
      from: "    const drawn = pieces.reduce((n, p) => n + p.rendered.length, 0);",
      to: "    const drawn = shown.reduce((n, r) => n + ctx.measureChild(r.child, width), 0);",
      expect: "T3.130",
    },
  ],
});

console.log(report(results));

// **Named rather than excused**: each entry says why the mutation cannot fail
// anything, and the day it is caught the pass fails as a stale exemption.
const EXPECTED_SURVIVORS = new Map([
  [
    "a sliceable child is cropped rather than sliced",
    "**equivalent in every frame, by C09 I58 itself**: a kind's slice is exact, so its render is " +
      "the whole render's rows [from, to) and the crop draws the same bytes. What the slice buys " +
      "since I134 is cost — a 2 000-line `logs` in a six-row box renders six rows rather than two " +
      "thousand — and no row in this repository measures what a box renders to draw itself",
  ],
]);
for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

// Printed and exited on, not merely computed (F768).
const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
