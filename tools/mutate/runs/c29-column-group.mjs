// C29 1.2, 1.3 and 1.4 — `group` in both directions and `panel`, on the
// engine. Mutated.
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
  "test/unit/blocks-measure-once.test.ts test/edge/blocks.test.ts test/contract/view-model.test.ts";
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
    from: "  return solveHeight(groupMeasureBox(block, width, { kind: \"grow\" }, measureChild), normaliseWidth(width));",
    to: "  return 0;",
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
      from: '...(column ? { align: { x: "stretch" as const } } : {}),',
      to: "",
      expect: "T2.18",
    },
    {
      // **Re-pointed when phase 2a landed the replacement** (F1224). It used to
      // drop the `padding: { t: 1 }` from a wrapper box built around a
      // `gapBefore` child — the shape arriving one kind early. There is no
      // wrapper: the block carries its own padding and `measureChild` returns
      // it, so the spacing enters the engine through the leaf's height. The
      // defect that reaches is a leaf answering the *kind's* height rather than
      // the block's, which is a column short by every child's edges while every
      // other number balances.
      name: "a child's leaf measures without its own padding",
      file: F,
      // The row group builds the same leaf, so the anchor carries the `natural`
      // line above it — the one thing the two sites do not share.
      from:
        "      natural: widthChild === undefined ? 0 : widthChild(child, at),\n" +
        "      measure: (cw: number) => (measureChild === undefined ? 0 : measureChild(child, cw)),",
      to:
        "      natural: widthChild === undefined ? 0 : widthChild(child, at),\n" +
        "      measure: (cw: number) => (measureChild === undefined ? 0 : measureChild(child, cw) - (child.padding?.t ?? 0) - (child.padding?.b ?? 0)),",
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
      from: 'return solveHeight(groupMeasureBox(block, width, { kind: "grow" }, measureChild), normaliseWidth(width));',
      to: 'return solveHeight(groupMeasureBox(block, width, { kind: "fit", min: 1 }, measureChild), normaliseWidth(width));',
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
      // **Two call sites now**, the column's and the row's, and the `also`
      // carries the second: 1.3 moved the row's width arm onto the same box, so
      // a mutation naming one would leave the other holding the rule.
      from: '      return layout(groupMeasureBox(block, w, { kind: "fit", min: 1 }, undefined, widthChild), w).rect.width;\n    }',
      to: '      return layout(groupMeasureBox(block, w, { kind: "grow" }, undefined, widthChild), w).rect.width;\n    }',
      also: [
        {
          file: F,
          from: '    return layout(groupMeasureBox(block, w, { kind: "fit", min: 1 }, undefined, widthChild), w).rect.width;\n  },',
          to: '    return layout(groupMeasureBox(block, w, { kind: "grow" }, undefined, widthChild), w).rect.width;\n  },',
        },
      ],
      expect: "T3.69",
    },
    {
      // **A row given the whole width rather than each child its share.** The
      // children are `FIXED` at what `childWidths` divided, and dropping that
      // makes every one `FIT` — measured at its own content rather than at its
      // cell, so a wrapping child in a narrow column is the wrong height.
      name: "a row's children are not fixed at their divided share",
      file: F,
      from: '          width: { kind: "fixed" as const, n: widths[i] ?? 1 },\n',
      to: "",
      // **T1.32 and not T2.18e.** The sharpest row is not a height row at all:
      // a `FIT` child is measured at its content width *and* rendered at its
      // cell, so the registry answers `(block, width)` twice for one child and
      // C09 I61 fires before any assertion about a row count does.
      expect: "T1.32",
    },
    {
      // **The gutter dropped from the row.** `childGap` is the one cell between
      // adjacent cells (C04 I103), and `n` children have `n - 1` of them
      // (C29 I7) — so the width arm's sum is short by the gutters and a row of
      // fixed shares answers narrower than it draws.
      name: "a row of fixed shares answers without its gutters",
      file: F,
      // Re-anchored 2026-09-17 (C04 I121): the gutter is a field now, declared
      // on both axes and defaulting to 0 down, so the box reads `childGapOf`.
      from: "    childGap: childGapOf(block),",
      to: "    childGap: 0,",
      expect: "T3.69",
    },
    {
      // **A row treated as a sequence, and the rule it tests inverted** (F1224,
      // C04_PADDING_WALK A4). A row's children used to ignore `gapBefore`
      // outright; a padded child is a box like any other now, and draws its own
      // edges wherever it sits. So this no longer adds spacing a row refuses —
      // it adds it a *second* time, on top of what `measureChild` already
      // returned, which is the double count the engine must not make.
      name: "a row group counts a child's padding twice",
      file: F,
      from: '          id: `c${String(i)}`,\n          width: { kind: "fixed" as const, n: widths[i] ?? 1 },',
      to: '          id: `c${String(i)}`,\n          ...(child.padding === undefined ? {} : { padding: child.padding }),\n          width: { kind: "fixed" as const, n: widths[i] ?? 1 },',
      expect: "T2.18",
    },
    {
      // **The panel's border is padding of one on every side** (1.4). Removing
      // it takes the frame's two rows and two columns out of the measurement
      // while the frame is still drawn, which is C09 I1 by two.
      name: "a panel's border costs nothing",
      file: F,
      from: "    padding: { l: 1, r: 1, t: 1, b: 1 },",
      to: "",
      expect: "T2.18",
    },
    {
      // **An empty panel is still two rows** (C04 I17) — the border is content,
      // unlike an empty group. It falls out of the content's `min` of one
      // rather than needing a clause, and this is the clause it replaced.
      name: "an empty panel loses its content row",
      file: F,
      from: '  const content: Size = own.kind === "fit" ? { kind: "fit", min: 1 } : { kind: "grow", min: 1 };',
      to: '  const content: Size = own.kind === "fit" ? { kind: "fit" } : { kind: "grow" };',
      // **T3.11 and not T2.18.** The floor's subject is the panel at width 2,
      // where the inset is 0 and `insetWidth` floors at 1 — the row named for
      // exactly that, determined by applying the mutation by hand. T3.8 and
      // T3.67 fall over with it, one width apart.
      expect: "T3.11",
    },
    {
      // **A panel's children measured at the panel's width rather than the
      // inset one.** Two columns wider than they are drawn, so anything that
      // wraps is short a row — the drift `insetWidth` exists to prevent, and
      // the reason C04 owns the widths rather than each container inventing
      // them (C04 §3).
      name: "a panel's children are measured at the outer width",
      file: F,
      from: "  const inner = insetWidth(normaliseWidth(width));",
      to: "  const inner = normaliseWidth(width);",
      // **T3.69 and not T3.67.** I43's corpus sweep is blind to this: measuring
      // the child outside the border changes the answered *width* and leaves the
      // *height* identical at both widths, so the identity holds while the
      // number is wrong. The row that sees it is the one asserting the number,
      // and it needed a notice whose wrap straddles the two columns.
      expect: "T3.69",
    },
    {
      // **The panel's content fitting when a height was asked for.** `FIT`
      // takes the children's naturals rather than the inset width, so a
      // wrapping child is measured narrow and the panel is too tall — and
      // every number in it is self-consistent.
      name: "a panel's content fits rather than filling when asked for a height",
      file: F,
      from: '  const content: Size = own.kind === "fit" ? { kind: "fit", min: 1 } : { kind: "grow", min: 1 };',
      to: '  const content: Size = { kind: "fit", min: 1 };',
      // **T1.33 and not T3.67.** The height arm's own measurement stays
      // self-consistent — it is short by the same amount in both halves — so
      // I43's identity holds and the row that sees it is the one comparing the
      // measured height against the rendered rows.
      expect: "T1.33",
    },
    {
      // **The unplaceable children kept.** `placeable` drops the children a row
      // has no room for, left to right and never by size, and a child that
      // cannot be placed contributes to neither the rendered rows nor the
      // measured height — the only one of the three available answers that
      // keeps them agreeing (C04 I42).
      name: "a row measures children it cannot place",
      file: F,
      from: "  const children = column ? block.children : block.children.slice(0, placeable(block, w));",
      to: "  const children = block.children;",
      expect: "T3.70",
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
