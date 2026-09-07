// C09 §6b — the slice seam, mutated.
//
// **The run for a seam that did not exist for the life of the project.** C04 §3c
// trace 1 named the missing operation, C09 §8a D7 measured the over-draw, I34's
// cap partly paid for it and T2.28b asserted the disagreement on purpose — four
// records and no watch, which is F856. So the rows below are new and the first
// question to ask of them is whether they can fail at all.
//
// The mutations are the ways `windowChild` is quietly wrong: a slice taken when
// the caller cannot pay for it, a floor or a cap ignored, an atomic kind sliced
// anyway, and the container going back to drawing every overlapping child whole
// — which is F855 exactly as it shipped.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/scroll.test.ts test/contract/blocks.test.ts " +
  "test/revert/blocks.test.ts";
const REGISTRY = "src/presentation/blocks/registry.ts";
const CONTAINERS = "src/presentation/blocks/kinds/containers.ts";

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
    file: REGISTRY,
    from: "  windowChild = (block: Block, width: number, from: number, to: number): Windowed | null => {",
    to: "  windowChild = (block: Block, _width: number, _from: number, _to: number): Windowed | null => {\n    return null;\n    // eslint-disable-next-line no-unreachable\n    const width = 0, from = 0, to = 0;",
    why:
      "a seam that never slices cannot satisfy a row about slicing — T2.125 asserts the six rows " +
      "a follow box shows and T2.28b the equality, so a pass where this survives is a pass that " +
      "never reached the container at all",
  },
  mutations: [
    {
      // **The half a container cannot pay.** `windowSequence` drops the surplus
      // rows itself; an Ink subtree has no equivalent, so a slice with its
      // overhang attached is the same over-draw in smaller form.
      name: "the residual guard dropped — a slice is taken when it costs slack",
      file: REGISTRY,
      from: "    if (out.skipRows !== 0 || out.dropRows !== 0) return null;",
      to: "",
      expect: "T6.102",
    },
    {
      // The floor pads outside the definition, so a window over the definition's
      // rows is not a window over the block's (I33). `windowSequence` refuses a
      // floored block on the same line one function over.
      name: "a floored block is windowed",
      file: REGISTRY,
      from: "    if (floorOf(block) > 0) return null;",
      to: "",
      expect: "T2.124",
    },
    {
      // The cap's marker row is the registry's, drawn beside the definition's
      // rows — so a slice of the capped form is short by one and nothing says so.
      name: "a capped block is windowed",
      file: REGISTRY,
      from: "    if (form === null || form.capped !== null) return null;",
      to: "    if (form === null) return null;",
      expect: "T2.124",
    },
    {
      // **The container half, and it is F855.** Filter by overlap, then draw each
      // survivor whole: a six-row box over a thirty-line screen measures 7 and
      // paints 32, with `follow` inert and the residue counting against a window
      // nobody applied.
      name: "every overlapping child is drawn whole again, as it shipped",
      file: CONTAINERS,
      from:
        "        from === 0 && to === height ? r.child : (ctx.windowChild(r.child, width, from, to)?.block ?? r.child);",
      to: "        r.child;",
      expect: "T2.125",
    },
    {
      // The slice taken from the child's own top rather than the window's — the
      // box then shows the head of every child whatever the offset, which is a
      // follow box that never follows.
      name: "the slice always starts at the child's first row",
      file: CONTAINERS,
      from: "      const from = Math.max(0, offset - r.from); // cells-ok — a row index",
      to: "      const from = 0; // cells-ok — a row index",
      expect: "T2.125",
    },
    {
      // The slice run to the child's end rather than the window's — right at the
      // tail, wrong everywhere else, and the box over-draws below.
      name: "the slice always runs to the child's last row",
      file: CONTAINERS,
      from: "      const to = Math.min(height, offset + interior - r.from); // cells-ok — a row index",
      to: "      const to = height; // cells-ok — a row index",
      expect: "T2.28b",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
