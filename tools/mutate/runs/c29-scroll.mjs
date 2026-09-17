// C29 1.5 — `scroll`'s child ranges on the engine. Mutated.
//
// **The ranges are one solve and everything reads them**: `measure` through
// `contentHeight`, `elements` as each child's rows, `render` as what the offset
// selects. So a rule dropped from the box shows up in three places or in none,
// and the rows below ask which.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/scroll.test.ts test/contract/scroll-follow.test.ts " +
  "test/contract/sequence.test.ts test/edge/blocks.test.ts test/contract/view-model.test.ts";
const F = "src/presentation/blocks/kinds/containers.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: F,
    // Every child measures zero, so the content never exceeds the interior:
    // no residue row, no offset, every range empty. A pass where this is not
    // seen is a pass that cannot see a scroll at all.
    from: "        measure: (cw: number) => measureChild(child, cw),\n        render: () => [],",
    to: "        measure: () => 0,\n        render: () => [],",
    why: "every row reads a scroll's content height, its residue or its child ranges; children of zero height show in all three",
  },
  mutations: [
    {
      // **The full width lost.** A scroll insets nothing — its box is bounding
      // rows, not a border (C04 I49) — so measuring its children two columns
      // narrow is the panel's arm answering for this kind, and anything that
      // wraps is a row taller than the frame draws.
      name: "a scroll insets its children like a panel",
      file: F,
      from: "    width: { kind: \"fixed\", n: normaliseWidth(width) },",
      to: "    width: { kind: \"fixed\", n: insetWidth(normaliseWidth(width)) },",
      // **This survived 5,494 rows.** Two columns only change an answer where a
      // wrap straddles them, and no scroll fixture had a child that wrapped at
      // one width and not the other. T2.148 is that fixture.
      expect: "T2.148",
    },
    {
      // **`align.x: "stretch"` removed.** The children declare no width, so
      // without it each takes its natural — 0 — and a box of width 0 measures 0
      // by C29 I14: every range collapses and the content is zero rows.
      name: "a scroll's children are measured at their natural width",
      file: F,
      from: "    height: { kind: \"fit\" },\n    align: { x: \"stretch\" },",
      to: "    height: { kind: \"fit\" },",
      expect: "T2.18",
    },
    {
      // **A column turned into a row.** The children stop stacking, so every
      // range starts at 0 and the content is the tallest child rather than the
      // sum — which is C29 I2 read off the wrong axis and makes the offset
      // select all of them or none.
      name: "a scroll's children sit side by side",
      file: F,
      from: "    direction: \"column\",\n    width: { kind: \"fixed\", n: normaliseWidth(width) },",
      to: "    direction: \"row\",\n    width: { kind: \"fixed\", n: normaliseWidth(width) },",
      expect: "T2.18",
    },
    {
      // **A `gapBefore` row counted.** C04 §3a's sequence is the document's top
      // level, a panel's children and a column group's children; a scroll is
      // none of them and never counted one. This is the shared builder reached
      // for because the two shapes look alike — and it adds a row to every
      // scroll holding a gap child.
      // **This survived too**, and the two are one gap: nothing asserted what a
      // scroll does with a gap child, in either direction.
      name: "a scroll counts a gapBefore row",
      file: F,
      from: "    children: block.children.map((child, i) => ({\n      id: `c${String(i)}`,\n      children: {\n        kind: \"paint\" as const,\n        natural: 0,",
      to: "    children: block.children.map((child, i) => ({\n      id: `c${String(i)}`,\n      ...(child.gapBefore === true ? { padding: { t: 1 } } : {}),\n      children: {\n        kind: \"paint\" as const,\n        natural: 0,",
      expect: "T2.149",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
