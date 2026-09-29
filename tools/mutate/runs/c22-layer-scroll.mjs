// C22 I141 and I142 — a scroll box inside a layer, and where the pointer finds
// the layer (review batch 4, shell lane, §6q).
//
// **Every one of these still draws a layer.** A painter handed no offsets draws
// the box at its top, which is a correct frame for an unscrolled box; a pointer
// hit-testing C15's placement of a replacing question still finds *a* layer
// wherever the two placements overlap; a namespace kept across a push is an
// offset that happens to be right when it was zero. So each names the row that
// sees the difference.
//
// **The control** is the scroller's box arm removed: a layer with an
// overflowing box falls back to the row offset, so no box ever moves and every
// positive arm of T4.114 and T4.115 fails. If it survives, nothing below
// reaches the store.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONSTRUCT = "src/shell/construct.ts";
const COMPOSITE = "src/shell/composite.ts";
const SESSION = "src/shell/session.ts";
const FILES =
  "test/unit/session-composite.test.ts test/integration/pointer-layers.test.ts test/integration/confirm.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CONSTRUCT,
    from: "    const box = firstOverflowingBox(placed.layer.content, placed.width);\n    if (box !== null) {\n",
    to: "    const box = firstOverflowingBox(placed.layer.content, placed.width);\n    if (box === undefined) {\n",
    why: "the scroller's box arm never taken: every wheel falls to the row offset, and no box moves",
  },
  mutations: [
    {
      // T6.142 (I141) — the compositor renders a layer with no offsets.
      name: "the compositor's layer painter is handed no offsets",
      file: COMPOSITE,
      from: "deps, deps.layerView?.(p.layer.id) ?? UNSCROLLED);",
      to: "deps, UNSCROLLED);",
      expect: "T1.174",
    },
    {
      // I141, F1302 — the prompt slot's painter renders with no offsets, so an
      // inspection's box draws its top whatever the store holds.
      name: "F1302: the prompt slot's painter is handed no offsets",
      file: SESSION,
      from: "      graph.layerView(layer.id),\n",
      to: "      { offsets: {}, key: \"\", focus: null },\n",
      expect: "T4.88",
    },
    {
      // T6.143 (I142) — the pointer's layers are C15's placements again.
      name: "the pointer hit-tests a replacing question where C15 placed it",
      file: CONSTRUCT,
      from: "        stores.overlays.layout(frame.overlayRegion()),\n        confirm.replacing,\n",
      to: "        stores.overlays.layout(frame.overlayRegion()),\n        null,\n",
      expect: "T4.115",
    },
    {
      // I141 — the namespace outlives its layer, so a preview pushed again
      // opens where the last one was left.
      name: "the layer's namespace is kept across a pop and a push",
      file: CONSTRUCT,
      from: "    stores.scrollOffsets.delete(layerKey(change.id));\n",
      to: "",
      expect: "T4.114",
    },
    {
      // I141 — a notch moves one row, not WHEEL_ROWS.
      name: "a notch moves the box one row",
      file: CONSTRUCT,
      from: "      const next = Math.min(box.geometry.ceiling, Math.max(0, held + notches * WHEEL_ROWS));\n",
      to: "      const next = Math.min(box.geometry.ceiling, Math.max(0, held + notches));\n",
      expect: "T4.114",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
