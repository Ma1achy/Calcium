// C29 I22 and I23's floats and frames, mutated (F1235).
//
// **Every row this pass tests reads a placement, and the solved tree agrees
// either way.** A float takes no space, so the tree it is declared in is
// identical with and without it — T1.39 asserts exactly that — and no assertion
// about a rect can tell whether the mechanism ran. A row like that can be green
// because the resolution is right, or because the fixture cannot see it.
//
// **Two mutations are §10's own design, put back.** The nudge into the frame
// and the attachment against the flow rect are what the document says and what
// the build overturned; both are here to ask whether the rows can now see the
// difference. The second is the sharper one: at `offset 0` the flow rect and
// the composited rect are equal, so a fixture written there passes both.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
// The engine has one test file — `grep -rl presentation/layout test/` returns
// one path — so the corpus is named rather than guessed at.
const CMD = "npx vitest run test/unit/layout-engine.test.ts";

const TYPES = "src/presentation/layout/types.ts";
const COMPOSE = "src/presentation/layout/compose.ts";
const FLOATS = "src/presentation/layout/floats.ts";
const FRAMES = "src/presentation/layout/frames.ts";
const SOLVE = "src/presentation/layout/solve.ts";

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
    file: TYPES,
    from: "  isLeaf(box.children) ? [] : box.children.filter((c) => c.floating !== undefined);",
    to: "  isLeaf(box.children) ? [] : [];",
    why: "no float is ever found, so the product is empty at every width and every row about a placement fails at its first assertion",
  },
  mutations: [
    {
      // **A float in the flow** — the thing `takes no space` means, and the
      // failure a row count cannot see: the page widens to the float's content
      // and its siblings move down.
      name: "a float is laid out with its siblings",
      file: TYPES,
      from: "  isLeaf(box.children) ? [] : box.children.filter((c) => c.floating === undefined);",
      to: "  isLeaf(box.children) ? [] : box.children;",
      expect: "T1.39",
    },
    {
      // **Skipped downward as well as upward** — the natural implementation,
      // which reads the flag inside the sizing pass and gives every float a
      // size of zero. It satisfies every assertion about the flow tree exactly
      // as well as the right answer does (walk C4).
      name: "a float's own subtree is skipped too",
      file: SOLVE,
      from: "  const root = solveSize(rest, frameWidth, counts);",
      to: "  const root = solveSize(rest, 0, counts);",
      expect: "T1.39",
    },
    {
      // **§10's attachment, put back**: the flow rect rather than the
      // composited one. Invisible at `offset 0`, which is every fixture written
      // without thinking about it.
      name: "attachment resolves against the flow rect",
      file: COMPOSE,
      from: "  if (!walk.byId.has(node.id)) walk.byId.set(node.id, { rect: own, window });",
      to: "  if (!walk.byId.has(node.id)) walk.byId.set(node.id, { rect: { x: node.rect.x, y: node.rect.y, w: node.rect.width, h: node.rect.height }, window });",
      expect: "T1.40",
    },
    {
      // **§10's step order, put back**: nudge into the frame, then clip to the
      // ancestor. The tooltip is moved to the one place it cannot be drawn, and
      // every assertion about it being *inside the frame* still passes.
      name: "the nudge targets the frame rather than the clip window",
      file: FLOATS,
      from: '  const window = (floating.clipTo ?? "attachedAncestor") === "none" ? frame : target.window;',
      to: "  const window = frame;",
      expect: "T1.41",
    },
    {
      // **`offset` applied after the nudge**, which §10's *applied last* reads
      // as. It re-pushes the float outside the window the nudge had just fitted
      // it into (walk C8).
      name: "the offset is applied after the nudge",
      file: FLOATS,
      from: "  const x = nudge(wanted.x, size.w, window.x, window.x + window.w);",
      to: "  const x = nudge(wanted.x, size.w, window.x, window.x + window.w) + (floating.offset?.x ?? 0);",
      expect: "T1.43",
    },
    {
      // **A clamp rather than the minimum shift.** *Containment is not
      // correctness*: the origin is inside the window too, and a row asserting
      // only that the float fits agrees with this.
      name: "the nudge clamps to the window's origin rather than shifting the minimum",
      file: FLOATS,
      from: "  if (v + size > hi) return hi - size;",
      to: "  if (v + size > hi) return lo;",
      expect: "T1.43",
    },
    {
      // **An unresolvable attachment throws.** C29 I16's fault exactly — it
      // abandons every float already placed, and the two that were resolvable
      // were resolvable.
      name: "an unresolvable attachment throws rather than omitting",
      file: FLOATS,
      from: "  if (target === undefined) return undefined;",
      to: '  if (target === undefined) throw new Error("no such box");',
      expect: "T1.42",
    },
    {
      // **The named positions unordered.** Two things claiming one cell with
      // the winner decided by declaration order, which is the integer z-index
      // §10 refuses arriving by omission rather than by design.
      name: "the layers are not ordered by name",
      file: FLOATS,
      from: "  return [...placed].sort((a, b) => rank[a.layer] - rank[b.layer]);",
      to: "  return placed;",
      expect: "T1.44",
    },
    {
      // **A float may attach to a float placed after it**, so a cycle resolves
      // against a rect that does not exist yet — here, by seeding the index
      // with every float before any is placed.
      name: "a float attaches to one not yet placed",
      file: FLOATS,
      from: "  for (const found of sites.floats) {",
      to: "  for (const f of sites.floats) byId.set(f.float.solved.id, { rect: { x: 0, y: 0, w: 1, h: 1 }, window: frame });\n  for (const found of sites.floats) {",
      expect: "T1.42",
    },
    {
      // **The ring floors like a stack**, which is the collapse C29 I23 exists to
      // prevent: `⌃⇥` stops at the last tab instead of cycling, and every index
      // but the last agrees.
      name: "the ring floors at its last tab rather than cycling",
      file: FRAMES,
      from: "  ring.tabs.length === 0 ? ring : Object.freeze({ tabs: ring.tabs, at: wrap(ring.at + 1, ring.tabs.length) }); // cells-ok — a tab count",
      to: "  ring.tabs.length === 0 ? ring : Object.freeze({ tabs: ring.tabs, at: Math.min(ring.at + 1, ring.tabs.length - 1) }); // cells-ok — a tab count",
      expect: "T1.45",
    },
    {
      // **The stack cycles like a ring**, the same collapse from the other end:
      // `esc` at the base wraps to the top instead of stopping.
      name: "the stack wraps at its base rather than flooring",
      file: FRAMES,
      from: "  stack.frames.length <= 1 ? stack : Object.freeze({ frames: stack.frames.slice(0, -1) }); // cells-ok — a frame count",
      to: "  Object.freeze({ frames: stack.frames.slice(0, -1) }); // cells-ok — a frame count",
      expect: "T1.45",
    },
    {
      // **`debug` under everything rather than over it**, which is what the
      // profiler's overlay does today as a `kind: "view"` — correct for a full
      // view of a report and wrong for an annotation layer (walk A8).
      name: "debug composites below the other layers",
      file: FRAMES,
      from: '  const rank: Record<LayerName, number> = { float: 0, overlay: 1, debug: 2 };',
      to: '  const rank: Record<LayerName, number> = { debug: 0, float: 1, overlay: 2 };',
      expect: "T1.46",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
