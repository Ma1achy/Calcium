// C29 1.2 — the `column` group on the engine. Mutated.
//
// **The move is a refactor with a byte-exact gate**, so every row here asks a
// question the golden gate already answers — and that is the point of running
// it anyway: the golden gate says *no frame moved*, and it cannot say *this
// declaration is the one carrying the rule*. A column's three rules are now
// three fields on a `Box`, and a field that could be deleted without a test
// noticing is a rule the engine is not actually holding.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/sequence.test.ts test/contract/block-window.test.ts " +
  "test/unit/blocks-measure-once.test.ts test/edge/blocks.test.ts";
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
    // A column measures nothing. Every row below reads a column group's height
    // or a window over one, so a pass where the arm answers zero cannot observe
    // a kill.
    from: "    return solveHeight(columnMeasureBox(block, width, { kind: \"grow\" }, measureChild), widths[0] ?? width);",
    to: "    return 0;",
    why: "every row reads a column group's measured height or a window over one; an arm answering zero sees no kill",
  },
  mutations: [
    {
      // **`align.x: "stretch"` removed** — the field carrying *every child gets
      // the container's width*. Without it a C29 column gives a `FIT` child its
      // natural width, so a child that wraps is measured at a width the column
      // does not give it (C29 I9).
      name: "a column's children are measured at their natural width",
      file: F,
      from: '    align: { x: "stretch" },\n    children: block.children.map',
      to: "    children: block.children.map",
      expect: "T2.18",
    },
    {
      // **The `gapBefore` wrapper's padding dropped** — the field carrying *a
      // gap child takes one blank row above it*. This is the shape `gapBefore`
      // is replaced by in phase 2, arriving one kind early.
      name: "a gapBefore child gets no blank row",
      file: F,
      from: "      ...(child.gapBefore === true ? { padding: { t: 1 } } : {}),",
      to: "",
      expect: "T2.18",
    },
    {
      // **The floor of one lost.** `groupRows` and `atLeastOne` were two clamps
      // in sequence and are now one `min` on a `FIT` size — so a column of
      // children that all measure zero measures zero rather than one, which is
      // the *empty* group's answer and a different thing (C04 I17).
      // **This survived, and the survival is F1223.** It looked unreachable —
      // C04 I17 says every measurer returns at least 1 — until its one
      // exception was read: an empty container measures 0, so a column holding
      // nothing but an empty group sums to zero. No row constructed that, and
      // constructing it found `render` floored at `minRows` and at nothing
      // else, so the group measured 1 and drew 0 with C09 I1 green everywhere
      // else.
      name: "a column of empty children measures zero rather than one",
      file: F,
      from: "    height: { kind: \"fit\", min: Math.max(1, block.minRows ?? 0) },",
      to: "    height: { kind: \"fit\", min: block.minRows ?? 0 },",
      expect: "T2.18",
    },
    {
      // **The render arm's floor, the half F1223 was actually about.** The
      // measurer's answer is unchanged, so every assertion about a height
      // passes and the frame is one row short.
      name: "the column render arm floors at minRows and nothing else",
      file: F,
      from: "        const floor = placed.length === 0 ? 0 : Math.max(1, block.minRows ?? 0); // cells-ok — a row count",
      to: "        const floor = block.minRows ?? 0; // cells-ok — a row count",
      expect: "T2.18",
    },
    {
      // The same, in the other direction.
      name: "the row render arm floors at minRows and nothing else",
      file: F,
      from: "      const floor = placed.length === 0 ? 0 : Math.max(1, block.minRows ?? 0); // cells-ok — a row count\n      return placeRows(blocks, Math.max(tallest, floor));",
      to: "      return placeRows(blocks, Math.max(tallest, block.minRows ?? 0));",
      expect: "T2.18",
    },
    {
      // **`minRows` no longer floors the height** (C04 I102). The same `min`,
      // the other half of it.
      name: "minRows does not pad the group",
      file: F,
      from: "    height: { kind: \"fit\", min: Math.max(1, block.minRows ?? 0) },",
      to: "    height: { kind: \"fit\", min: 1 },",
      // **T2.140 and not T1.33.** T1.33 sweeps every container kind for
      // *measure equals rendered rows*, and a group that measures its content
      // rather than `minRows` satisfies that exactly: both halves are short by
      // the same amount. The row that sees it is the one that asserts the pad.
      expect: "T2.140",
    },
    {
      // **The height arm asking the width question.** `FIT` takes the root's
      // natural width, which without a `widthChild` is 0 — and a box of width 0
      // measures 0 by C29 I14, so the column's height collapses. The two arms
      // build the same shape and differ in exactly this field.
      name: "the height arm takes the box's natural width rather than the one it was given",
      file: F,
      from: 'return solveHeight(columnMeasureBox(block, width, { kind: "grow" }, measureChild), widths[0] ?? width);',
      to: 'return solveHeight(columnMeasureBox(block, width, { kind: "fit", min: 1 }, measureChild), widths[0] ?? width);',
      // **T2.138 and not T2.18e.** The column collapses to its floor of one, and
      // T2.18e's own columns are one and three rows — the window sweep is what
      // has a column tall enough for the collapse to be visible at every
      // boundary it checks.
      expect: "T2.138",
    },
    {
      // **The width arm asking the height question.** `GROW` fills what it is
      // given, so `width` answers the full width for every column — and C09 §2c
      // says a container answers only when its layout does not depend on the
      // width, which is the whole point of the arm.
      name: "the width arm fills rather than fitting its widest child",
      file: F,
      from: 'return layout(columnMeasureBox(block, w, { kind: "fit", min: 1 }, undefined, widthChild), w).rect.width;',
      to: 'return layout(columnMeasureBox(block, w, { kind: "grow" }, undefined, widthChild), w).rect.width;',
      expect: "T3.69",
    },
    {
      // **The non-left guard removed.** A column holding a `right` child would
      // move it when the column's cell shrank, so every such column fills — a
      // rule that lives outside the engine because it is about what the *frame*
      // does, not what the box measures (C04 §3 table row 11a).
      name: "a column with a non-left child answers its widest rather than filling",
      file: F,
      from: '      if (block.children.some((_child, i) => axesOf(block.align?.[i]).h !== "left")) return w;',
      to: "",
      expect: "T3.69",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
