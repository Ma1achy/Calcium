// C26 §5, §5c — the plot's `copy` and the mosaic's rectangles, mutated.
//
// **Two kinds, one seam, and the mutations are the ones the rows were written
// against.** A plot's element had no `copy`, so `y` on a focused plot did
// nothing and said nothing — `copyElement` filters `undefined` and returns
// early; dropping the member is the shipped state. Swapping the separator is
// the convention drifting from `rowCopyText`'s. The mosaic is the one kind whose
// `cols` are not `0..width`: handing every child the full width passes
// containment, order and stability and is wrong about which child a pointer
// lands on, which is why the exact row asserts numbers.
//
// Anchors and expectations are Lane C's, each run by hand on 2026-09-05 against
// the two files in CMD: every mutation killed exactly the rows named.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/block-elements.test.ts test/contract/navigation-mosaic.test.ts";
const PLOT = "src/presentation/plot/definition.ts";
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
    file: PLOT,
    from: "      ...(copy === undefined ? {} : { copy }),\n",
    to: "",
    why: "the shipped state — no `copy` on the plot's element, so `y` is a silent no-op; T2.25, T2.26 and T3.49 fail, and a run that cannot see it cannot see the seam",
  },
  mutations: [
    {
      name: "comma-separated rather than tab",
      file: PLOT,
      // The header's join only — the rows' is the same text, and an anchor
      // matching twice is ambiguous (MA4). Either half drifting kills T2.26.
      from: "  const header = series.map((s, i) => s.label ?? `series ${String(i + 1)}`).join(\"\\t\");",
      to: "  const header = series.map((s, i) => s.label ?? `series ${String(i + 1)}`).join(\",\");",
      expect: "T2.26",
    },
    {
      name: "every mosaic child full-width",
      file: CONTAINERS,
      from: "cols: Object.freeze({ from: rect.left, to: rect.left + rect.width }),",
      to: "cols: Object.freeze({ from: 0, to: normaliseWidth(width) }),",
      expect: "T2.28",
    },
    {
      name: "two children's rectangles swapped",
      file: CONTAINERS,
      from: "        const rect = rects[i];\n        if (rect === undefined) return [];\n        return [\n          Object.freeze({\n            id: child.id,",
      to: "        const rect = rects[i === 0 ? 1 : i === 1 ? 0 : i];\n        if (rect === undefined) return [];\n        return [\n          Object.freeze({\n            id: child.id,",
      expect: "T2.27",
    },
    {
      name: "the unparsable arm throws instead of declaring nothing",
      file: CONTAINERS,
      from: "    if (!parsed.ok) return Object.freeze([]);",
      to: '    if (!parsed.ok) throw new Error("unparsable");',
      expect: "T2.29",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
