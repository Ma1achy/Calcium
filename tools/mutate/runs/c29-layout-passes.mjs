// C29 — the five passes and the distribution. Mutated.
//
// **The rows this run exists for are the ones a frame cannot see.** The clamping
// round count (I5), the counted no-op alignment (I8) and the leftover policy
// (I4) are all invisible in a composed frame: a fixed point reached in n + 1
// rounds draws what one reached in n draws, an ignored alignment draws what no
// alignment draws, and one cell of eighty is a cell nobody looks at. A run whose
// every mutation is observable in the output would say nothing about them.
//
// **Two of these put back a defect that was in the tree during this step** — the
// zero-width box keeping its rows' height (I14) and the clipping container
// shrinking its child to fit (I15, F1222). The second is the one worth the file:
// it survived every assertion about a number and was caught by a row that built
// the mechanism and gave it something to do.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/layout-engine.test.ts";
const S = "src/presentation/layout/solve.ts";
const D = "src/presentation/layout/distribute.ts";
const C = "src/presentation/layout/compose.ts";
// **`largestRemainder` lives at L0**, because `mosaicRects` takes the same rule
// and cannot import upward (1.7, F1219). The two rows below follow it there;
// what they assert is unchanged.
const M = "src/data/viewmodel/mosaic.ts";

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
    file: S,
    // Pass 1 never descends, so every container's natural width is its own
    // padding and every FIT box collapses. Sixteen of the seventeen rows read a
    // solved rectangle or a composed row, so a pass where nothing is measured
    // cannot observe a kill.
    //
    // **A change the corpus can see**, which is the property a control needs:
    // it is not a magnitude, and it fires on the first row rather than on a
    // margin.
    from: "  for (const child of node.children) fitWidth(child);",
    to: "  for (const child of node.children) child.natW = 0;",
    why: "every row but T1.17 reads a solved rectangle or a composed row; a pass where pass 1 measures nothing sees no kill",
  },
  mutations: [
    {
      // **The leftover spent unconditionally** — largest remainder with the
      // policy ignored. C04 I42's group spends nothing, and the reason once
      // written against changing that was false (F1219), so the arm that
      // survives is the one a reader would delete as redundant.
      name: "the leftover is always handed out, whatever the policy says",
      file: M,
      from: '  if (spend === "none" || left <= 0) return given;',
      to: "  if (left <= 0) return given;",
      expect: "T1.4",
    },
    {
      // **Ties broken by the sort's own order.** `[40, 39]` and `[39, 40]` sum
      // the same and every total agrees; only declaration order makes the frame
      // a pure function of the tree, which is what a byte-exact golden needs.
      name: "a tie in the fractional parts is broken by the later child",
      file: M,
      from: "    .sort((a, b) => (b.frac === a.frac ? a.i - b.i : b.frac - a.frac));",
      to: "    .sort((a, b) => (b.frac === a.frac ? b.i - a.i : b.frac - a.frac));",
      expect: "T1.4",
    },
    {
      // **The clamping loop run once.** The widths still come out right on the
      // common case, because a second round only matters when the first pinned
      // a child — so this is killed by the *counter* and by nothing else
      // (I5, §8a A4).
      name: "clamping takes one round and stops",
      file: D,
      from: "    for (let round = 0; round < n; round += 1) {\n      const pot = budget - total(); // cells-ok — a cell count",
      to: "    for (let round = 0; round < 1; round += 1) {\n      const pot = budget - total(); // cells-ok — a cell count",
      expect: "T1.5",
    },
    {
      // **Clamping applied after distribution** rather than before: a child
      // pinned at `max` keeps its surplus instead of returning it to the pot.
      // The sizes are then short of the budget and nobody is over their
      // ceiling, which reads as a correct answer.
      name: "a child pinned at max keeps its surplus",
      file: D,
      from: "          sizes[i] = demands[i]!.max;\n          pinned[i] = true;\n          anyPinned = true;",
      to: "          sizes[i] = want;\n          pinned[i] = true;\n          anyPinned = true;",
      expect: "T1.5",
    },
    {
      // **The floor crossed.** A deficit taken past `min` makes every child fit
      // and the container never clips — which is the answer §6 gives and this
      // pass refuses (I6): a cell never goes below its minimum, and dropping is
      // a decision rather than an arithmetic outcome.
      //
      // **Re-anchored, and the first anchor is the finding.** It named a second
      // guard that pinned any child whose cut crossed its `min`, and the
      // mutation survived — not because the row was weak but because **the
      // floor was defended twice and neither half was observable**: removing
      // either left the other holding. The guard was the unreachable one (a
      // largest remainder over `room` never hands a child more than its room),
      // so it is gone and this names the clamp that remains. The row it needed
      // also had to be built: FIXED children have no room at all, so the
      // shrink loop never runs on them.
      name: "a deficit is taken in full, past the room there is",
      file: D,
      from: '      const take = largestRemainder(room, Math.min(need, available), "largest-remainder");',
      to: '      const take = largestRemainder(room, need, "largest-remainder");',
      expect: "T1.6",
    },
    {
      // **`GROW` treated as `FIT` in pass 1** — the answer §8a A1 rules out.
      // It makes a growing child's content decide its parent's width, which is
      // the behaviour `GROW` exists to refuse, and the two modes then differ
      // only in pass 2: the same size arriving twice.
      name: "GROW contributes its content to a FIT parent",
      file: S,
      from: '    case "grow":\n    case "percent":\n      return size.min ?? 0;',
      to: '    case "grow":\n    case "percent":\n      return Math.max(size.min ?? 0, content);',
      expect: "T1.3",
    },
    {
      // **Centring rounding up**, so the leftover cell goes left. Every
      // assertion about *the child is inside the box* still holds and the frame
      // is one column out.
      name: "integer centring rounds up",
      file: S,
      from: '  if (align === "c") return Math.floor(slack / 2); // cells-ok — a cell count',
      to: '  if (align === "c") return Math.ceil(slack / 2); // cells-ok — a cell count',
      expect: "T1.8",
    },
    {
      // **The no-op alignment not counted** (I8, §8a A6). Nothing in any frame
      // changes: the alignment was already doing nothing. This is the cell that
      // gets reported as a bug, and the counter is the whole of the remedy.
      name: "an alignment with no slack is silently ignored",
      file: S,
      from: "  if (slack <= 0) {\n    counts.alignNoOp += 1;\n    return 0;\n  }",
      to: "  if (slack <= 0) {\n    return 0;\n  }",
      expect: "T1.8",
    },
    {
      // **Stretch moved back to pass 4 on a column's width** — F1221's own
      // defect. Pass 3 then wraps at the unstretched width and the committed
      // height is a width the frame does not use.
      name: "a column's cross-axis stretch is ignored in pass 2",
      file: S,
      from: '      const stretch = node.box.align?.x === "stretch";\n      const room = node.box.clip?.x === true ? Number.POSITIVE_INFINITY : inner;',
      to: "      const stretch = false;\n      const room = node.box.clip?.x === true ? Number.POSITIVE_INFINITY : inner;",
      expect: "T1.9",
    },
    {
      // **`FIXED` stretched** (I9, §8a A5). An explicit size losing to an
      // inherited one, which is the rule that has no exceptions.
      name: "stretch overrides an explicit FIXED on the cross axis",
      file: S,
      from: '    case "fixed":\n      return size.n;\n    case "fit":\n      return stretch ? clamp(inner, lo(size), hi(size))',
      to: '    case "fixed":\n      return stretch ? inner : size.n;\n    case "fit":\n      return stretch ? clamp(inner, lo(size), hi(size))',
      expect: "T1.9",
    },
    {
      // **Aspect allowed to grow** (I10, §8a A9). It overflows a box that
      // already fits, and the box's own numbers stay self-consistent.
      //
      // **This survived two passes, and the second survival is the interesting
      // one.** The first was F459's shape — a ratio already asking for *less*
      // than the box had, where both arms agree. The row written to fix that
      // declared a FIXED height, and it survived too: **with a FIXED height the
      // width half resolves the whole ratio in pass 2 and pass 4's half has
      // nothing left to do.** A box declaring both axes cannot say which half
      // ran. The row that reaches this one has a FIT height.
      name: "aspect grows the axis as well as shrinking it",
      file: S,
      from: "    node.h = Math.min(node.h, Math.max(0, Math.round(node.w / aspect))); // cells-ok — a cell count",
      to: "    node.h = Math.max(0, Math.round(node.w / aspect)); // cells-ok — a cell count",
      expect: "T1.10",
    },
    {
      // **Aspect's width half moved out of pass 2** — F1220 D1, restored. The
      // width shrinks after pass 3 has wrapped, so `measure` returns the height
      // for a width the frame does not use: C09 I1 false by construction.
      name: "aspect does not resolve on the width axis",
      file: S,
      from: '  if (aspect !== undefined && aspect > 0 && height.kind === "fixed") {',
      to: "  if (false && aspect !== undefined && aspect > 0) {",
      expect: "T1.10",
    },
    {
      // **Aspect's width half allowed to grow.** The mirror of the row above,
      // on the axis pass 2 owns, and it needs its own row for the same reason:
      // the shrinking case agrees with both arms.
      name: "aspect's width half grows as well as shrinking",
      file: S,
      from: "    node.w = Math.min(node.w, Math.max(0, Math.round(aspect * height.n))); // cells-ok — a cell count",
      to: "    node.w = Math.max(0, Math.round(aspect * height.n)); // cells-ok — a cell count",
      expect: "T1.10",
    },
    {
      // **A zero-width box keeping its rows' height** (I14) — the defect that
      // was in the tree. A `rows` leaf's row count does not depend on its
      // width, so nothing else in pass 3 notices, and `measure` answers 1 for a
      // box that draws nothing.
      name: "a box solved to width 0 keeps its content's height",
      file: S,
      from: "  node.natH = node.w === 0 ? 0 : naturalOf(node.box.height ?? FIT, content + (leaf === undefined ? pad : 0));",
      to: "  node.natH = naturalOf(node.box.height ?? FIT, content + (leaf === undefined ? pad : 0));",
      expect: "T1.14",
    },
    {
      // **The clipping container imposing its size again** — F1222, restored.
      // Every number in the solved tree is defensible and the frame is blank:
      // the child was shrunk to fit, so there is nothing outside the box to
      // clip and nowhere for the offset to move to.
      name: "a clipping container shrinks its child to fit",
      file: S,
      from: "  if (!clipped) return room;\n  // Surplus still distributes — a clipping container with slack is an ordinary\n  // container. Only the deficit is refused.\n  return Math.max(room, demands.reduce((a, d) => a + d.base, 0));",
      to: "  return room;",
      expect: "T1.15",
    },
    {
      // **Text re-wrapped at the parent's width rather than its own.** They
      // agree whenever the child fills its parent, which is most of the corpus,
      // and disagree exactly where padding or a sibling narrows the child — the
      // case pass 3 exists for.
      name: "the wrap happens before the width is solved",
      file: S,
      from: "      const wrapping = node.box.overflow?.x === \"wrap\" && node.w > 0;",
      to: "      const wrapping = node.box.overflow?.x === \"wrap\" && node.natW > 0;",
      expect: "T1.11",
    },
    {
      // **The composer reading the unwrapped rows.** `measure` still returns
      // pass 3's number and `compose` still returns that many lines — the count
      // agrees and the *content* is the original long row, cut. C09 I1 read as
      // a row count alone is satisfied by this.
      name: "compose reads the leaf's own rows rather than the wrap pass 3 committed",
      file: S,
      from: "        leaf:\n          node.leaf.kind === \"rows\" && node.wrapped !== undefined\n            ? { kind: \"rows\" as const, rows: node.wrapped }\n            : node.leaf,",
      to: "        leaf: node.leaf,",
      expect: "T1.12",
    },
    {
      // **A padded leaf's padding dropped** — the defect the first consumer
      // found (1.2). Every pass would otherwise need an arm asking whether the
      // padding it was about to apply belonged to a box with a leaf in it, and
      // the arm that was written skipped it. **The row that should have caught
      // it was vacuous**: T1.12's corpus held a padded leaf and asserted only
      // that `measure` equalled the composed count, which is true of any two
      // agreeing wrong numbers.
      name: "a leaf's padding is not inside it",
      file: S,
      from: "  if (!isLeaf(box.children) || !padded(box)) return box;",
      to: "  if (true) return box;",
      expect: "T1.7",
    },
    {
      // **The content not stretched into what the padding left.** The wrapper
      // is the right shape and the leaf takes its natural size inside it, so a
      // wrapping child is measured at a width the box does not give it — and
      // the box's own height is right for the wrong wrap.
      name: "a padded leaf's content takes its natural width rather than the inner one",
      file: S,
      from: '    align: { x: "stretch" },',
      to: "",
      expect: "T1.7",
    },
    {
      // **The content not filling a box that has a size of its own.** Putting
      // padding round something means the something occupies what is left —
      // and where the box is `FIT` the content already decides the size, so
      // the two arms agree on every box that derives its own height. The case
      // that separates them is a `FIXED` height, where the content must be
      // handed the interior rather than its natural.
      //
      // **`GROW` and not a stretch**, because height is the wrapper's main
      // axis and stretch is a cross-axis rule (C29 I9).
      name: "a padded leaf's content keeps its natural height inside a sized box",
      file: S,
      from: '        ...(fills ? { height: { kind: "grow" as const } } : {}),\n',
      to: "",
      expect: "T1.7",
    },
    {
      // **`overflow` left on the outer box.** It describes what the *content*
      // does when it does not fit, and the content is on the inside of the
      // padding — so a padded box declaring `wrap` stops wrapping, silently,
      // and its rows are cut instead.
      name: "overflow stays on the frame rather than travelling to the content",
      file: S,
      from: "        ...(overflow === undefined ? {} : { overflow }),\n",
      to: "",
      expect: "T1.7",
    },
    {
      // **The clip window not intersected with the ancestor's.** A nested clip
      // then shows what its grandparent already cut away, and every rectangle
      // in the solved tree is unchanged.
      // **Also a weak row on its first pass**: T1.15 had only single-level
      // clips, where a replaced window and an intersected one are the same
      // rectangle. A clip inside a clip is the cell where they differ.
      name: "a clip replaces its ancestor's window rather than intersecting it",
      file: C,
      from: "  const inner = clip === undefined ? window : intersect(window, {",
      to: "  const inner = clip === undefined ? window : ({",
      expect: "T1.15",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
