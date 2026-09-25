// C04 I132–I134, C26 I28, C16 I59, C22 I117 — the split (§3aq, §105).
//
// **Most of these draw a plausible split.** A divider with no blank after it,
// a right pane with no bar, a track where a thumb should be — each is a frame
// a reader accepts at a glance, which is why T1.57 asserts literals worked by
// hand from §105's figure rather than properties of them.
//
// The keyboard half is the other risk: `↓` that runs off the left pane into
// the right is the defect §3aq E1 exists to forbid, and it reads as ordinary
// document order.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const KIND = "src/presentation/blocks/kinds/split.ts";
const MEASURE = "src/data/viewmodel/measure.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const REGISTRY = "src/presentation/blocks/registry.ts";
const LAYOUT = "src/shell/entry-layout.ts";
const KEYS = "src/shell/keys.ts";
const CONSTRUCT = "src/shell/construct.ts";
const FILES = "test/unit/split.test.ts test/integration/split.test.ts";

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
    // **A change every row can see** (F1254): the box one row taller than its
    // height, so the measure and the drawn rows part at every width.
    file: KIND,
    from: "  measure: (block: Split) => block.height,",
    to: "  measure: (block: Split) => block.height + 1,",
    why: "measure is height + 1 at every width, so T1.56's measure sweep fails at each of its four widths",
  },
  mutations: [
    {
      // §3aq S2 — the walk's finding: the blank column after the divider.
      name: "THE WALK'S FINDING: no blank column after the divider",
      file: KIND,
      from: '}])} ${right.rows[i] ?? ""}${tail}`,',
      to: '}])}${right.rows[i] ?? ""}${tail}`,',
      expect: "T1.57",
    },
    {
      // Ruling 22 — the divider is the left pane's bar, never a column beside it.
      name: "the divider is always bare track",
      file: KIND,
      from: "scrollbarColumn(height, left.content, left.offset, set) ?? Array.from({ length: height }, () => set.track);",
      to: "Array.from({ length: height }, () => set.track); void left.offset;",
      expect: "T1.57",
    },
    {
      // §3aq S3 — the right pane overflows and draws no bar.
      name: "the right pane draws no bar",
      file: KIND,
      from: "    const bar = right.bar ? scrollbarColumn(height, right.content, right.offset, set) : null;",
      to: "    const bar = null as readonly string[] | null; void right.bar;",
      expect: "T1.57",
    },
    {
      // §3aq S7 — the accent on either pane.
      name: "the divider is accent with focus anywhere",
      file: KIND,
      from: "    const dividerInk = ink(holds(block, left.child, ctx));",
      to: "    const dividerInk = ink((ctx.focus ?? null) !== null); void holds;",
      expect: "T1.58",
    },
    {
      // §3aq S6 — the pane addressed to the split draws no ground.
      name: "a focused empty pane is not lit",
      file: KIND,
      from: "      const lit = ctx.focus?.blockId === block.id && ctx.focus.rowId === p.child.id;",
      to: "      const lit = false as boolean;",
      expect: "T1.58",
    },
    {
      // §3aq S1 — the default divider.
      name: "the default divider is half the width, not half of w − 2",
      file: MEASURE,
      from: "  const held = block.divider ?? Math.floor((w - 2) / 2);",
      to: "  const held = block.divider ?? Math.floor(w / 2);",
      expect: "T1.57",
    },
    {
      // §3aq S4 — clamped so the right pane keeps a cell.
      name: "the clamp leaves no right pane",
      file: MEASURE,
      from: "  const left = Math.min(Math.max(1, Math.trunc(held)), w - 3);",
      to: "  const left = Math.min(Math.max(1, Math.trunc(held)), w - 2);",
      expect: "T1.57",
    },
    {
      // §3aq S5 — below four columns.
      name: "three columns still split",
      file: MEASURE,
      from: "  if (w < 4) return { left: w, right: null };",
      to: "  if (w < 3) return { left: w, right: null };",
      expect: "T1.57",
    },
    {
      // C04 I132 — exactly two.
      name: "three children validate",
      file: VALIDATE,
      from: 'b["children"].length !== 2) {',
      to: 'b["children"].length < 2) {',
      expect: "T1.56",
    },
    {
      // §3aq S6 — a pane with no elements is unreachable.
      name: "no fallback element for a pane without elements",
      file: REGISTRY,
      from: "            if (out.length === before) { // cells-ok — a count of elements",
      to: "            if (out.length === before && out.length < 0) { // cells-ok — a count of elements",
      expect: "T1.58",
    },
    {
      // C26 I28 — the lift drops the pane.
      name: "the entry layout drops the pane",
      file: LAYOUT,
      from: "        ...(pane === undefined",
      to: "        ...(pane === undefined || pane !== undefined",
      expect: "T4.96",
    },
    {
      // §3aq E1 — the defect the section exists to forbid.
      name: "↓ runs from the left pane into the right",
      file: KEYS,
      from: "  if (from?.pane !== undefined && from.pane.split === to.pane.split) return to.pane.side !== from.pane.side;",
      to: "  if (from?.pane !== undefined && from.pane.split === to.pane.split) return false;",
      expect: "T4.96",
    },
    {
      // §3aq E2 — a split entered on the pane the direction reaches first.
      name: "a split is entered from below on the right pane",
      file: KEYS,
      from: "  return to.pane.side !== 0;",
      to: "  return false;",
      expect: "T4.96",
    },
    {
      // The step that consults the rule at all.
      name: "rowDown ignores passedOver",
      file: KEYS,
      from: "      const next = elements.slice(i + 1).find((q) => !passedOver(elements[i], q));",
      to: "      const next = elements.slice(i + 1).find(() => true);",
      expect: "T4.96",
    },
    {
      // §3aq E3 — nearest *on screen*, so the pane's scroll is part of the row.
      name: "crossing the divider ignores the pane's offset",
      file: KEYS,
      from: "    const shift = deps.paneOffset(pane.split, side);",
      to: "    const shift = 0; void side;",
      expect: "T4.96",
    },
    {
      // §3aq E4 — the chord's direction.
      name: "⌥→ moves the divider left",
      file: KEYS,
      from: "    dividerRight: () => nudgeDivider(1),",
      to: "    dividerRight: () => nudgeDivider(-1),",
      expect: "T4.97",
    },
    {
      // C26 I24 — focus pulls the pane.
      name: "focus does not pull the pane",
      file: CONSTRUCT,
      from: "      if (next !== held) stores.scrollOffsets.set(entry.id, key, next, box);",
      to: "      void next; void held; void key; void box;",
      expect: "T4.96",
    },
    {
      // §3aq E5 — the drag places the divider under the pointer.
      name: "the drag places the divider one cell short",
      file: CONSTRUCT,
      from: "      return () => placeDivider(drag.entryId, drag.split, e.col - drag.left);",
      to: "      return () => placeDivider(drag.entryId, drag.split, e.col - drag.left - 1);",
      expect: "T4.98",
    },
    {
      // §3aq E5 — a release ends the drag.
      name: "a release does not end the drag",
      file: CONSTRUCT,
      from: "        dividerDrag = null;\n        return () => undefined;",
      to: "        return () => undefined;",
      expect: "T4.98",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
