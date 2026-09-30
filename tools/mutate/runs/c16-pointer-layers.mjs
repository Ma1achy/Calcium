// C16 I74 and I47 — the pointer over layers, mutated (review batch 3, M8).
//
// **Each of these reads as a working pointer when broken.** A hit test that
// takes the bottom layer is right wherever layers do not overlap, which is
// almost everywhere; a peek filtered out of `placed` leaves a wheel that still
// scrolls something; a dismissal on any button still dismisses on the primary
// one. So each mutation names the row that sees the difference.
//
// The control is T6.61: the tree before C15 I31 reached L4, where `placed` asks
// the keys' predicate and a peek is invisible to the pointer.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/router-dispatch.test.ts test/unit/session-mouse.test.ts " +
  "test/integration/pointer-layers.test.ts";
const ROUTER = "src/interaction/router/router.ts";
const CONSTRUCT = "src/shell/construct.ts";
const COMPOSITE = "src/shell/composite.ts";
const KEYS = "src/shell/keys.ts";

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
    from: ".filter((p) => takesPointer(p, gesture)),\n",
    to: ".filter((p) => p.layer.kind !== \"peek\" && takesPointer(p, gesture)),\n",
    why: "T6.61 — L4's `placed` filtered by the keys' predicate again: the peek is invisible to the pointer and the wheel over it scrolls the transcript",
  },
  mutations: [
    {
      // T6.60 (C16 I74) — the bottom layer of an overlap takes the gesture.
      name: "the hit test takes the bottom layer",
      file: ROUTER,
      from: '    const covering = [...deps.placed(wheel ? "wheel" : "press")].reverse().find(\n',
      to: '    const covering = [...deps.placed(wheel ? "wheel" : "press")].find(\n',
      expect: "T1.189",
    },
    {
      // T6.62 (C16 I47) — any non-wheel press dismisses.
      name: "a right press dismisses",
      file: ROUTER,
      from: '      const primary = e.button === "button0" && !e.motion && !e.shift && !e.ctrl && !e.meta;\n',
      to: "      const primary = true;\n",
      expect: "T1.192",
    },
    {
      // C16 I47 — a drag beside the panel dismisses: the motion clause dropped.
      name: "a drag beside the panel dismisses",
      file: ROUTER,
      from: '      const primary = e.button === "button0" && !e.motion && !e.shift && !e.ctrl && !e.meta;\n',
      to: '      const primary = e.button === "button0" && !e.shift && !e.ctrl && !e.meta;\n',
      expect: "T1.192",
    },
    {
      // C16 I74 — a keyed layer whose scroller declines lets the wheel through.
      name: "a keyed layer declines the wheel to the base",
      file: ROUTER,
      from: '      if (covering.layer.kind !== "peek") return true;\n      stages.push("layer:declined");\n',
      to: '      stages.push("layer:declined");\n',
      expect: "T1.190",
    },
    {
      // C16 I74 — a peek that cannot scroll swallows the wheel: the transcript
      // beneath a peek that fits never moves.
      name: "a peek that fits consumes the wheel",
      file: ROUTER,
      from: '      if (covering.layer.kind !== "peek") return true;\n      stages.push("layer:declined");\n',
      to: '      return true;\n',
      expect: "T1.191",
    },
    {
      // C16 I74 — L4's scroller claims a peek that fits, so the base never
      // gets the wheel from a built session.
      name: "L4 scrolls a peek that is not cut",
      file: CONSTRUCT,
      // Re-anchored for C22 I141: the row offset is now the fallback after a
      // layer's first overflowing box, and this is its guard.
      from: "    if (!placed.truncated) return false;\n",
      to: "",
      expect: "T4.93",
    },
    {
      // C16 I74 — the offset is written and nothing reads it: the compositor
      // draws the peek from its top.
      name: "the compositor ignores the layer's offset",
      file: COMPOSITE,
      from: "  const from = Math.min(deps.layerScroll?.(p.layer.id) ?? 0, Math.max(0, lines.length - p.height));\n",
      to: "  const from = 0;\n",
      expect: "T4.93",
    },
    {
      // C16 I74, §3d Q2 — the wheel's window survives the keys moving the
      // selection: the chosen row stays out of view.
      name: "the keys do not take the window back",
      file: KEYS,
      from: "    if (wheeled !== null && wheeled.at !== selection.at) wheeled = null;\n",
      to: "",
      expect: "T4.92",
    },
    {
      // C16 I74, C19 I20 — a selection scrolled out of view is still drawn,
      // at a row index past the slice. Re-anchored for C19 I29: the index is
      // the current's, the selection or the first candidate, and never null.
      // Re-anchored 2026-09-30 (F1487): the count argument became the window's
      // own; the mutation is unchanged.
      name: "a selection out of the window is still marked",
      file: KEYS,
      from: "    return menuBlocks(slice, at < 0 || at >= w.shown ? null : at, fits <= 0 ? remainder : candidates.length - w.shown);\n",
      to: "    return menuBlocks(slice, Math.min(Math.max(at, 0), w.shown - 1), fits <= 0 ? remainder : candidates.length - w.shown);\n",
      expect: "T4.92",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
