// C26 §8c — along a row, and the window that follows (review batch 4, shell
// lane, group C; C26 I30–I32, C22 I146; ruling 80, D10, D15).
//
// **Every mutation names the row that reads the state it would leave.** The
// four items meet in two ways — which elements are a row is structural, and
// what a key, a patch or a press does to focus, the window and the latch is a
// sequence — so the rows are split the same way.
//
// **The control** is T6.1, `→` back to the old `crossPane(1)`: outside a
// split it does nothing, so T1.164 fails at the tape's second member.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const KEYS = "src/shell/keys.ts";
const CONSTRUCT = "src/shell/construct.ts";
const TAPE = "src/presentation/blocks/kinds/tape.ts";
const FILES = [
  "test/unit/row-navigation.test.ts",
  "test/unit/tape-anchor.test.ts",
  "test/integration/tape-focus.test.ts",
  "test/integration/focus-repull.test.ts",
  "test/integration/box-bar.test.ts",
  "test/contract/focus-carrier.test.ts",
  "test/contract/navigation-pills.test.ts",
].join(" ");

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
    // T6.1 (C26 I30).
    file: KEYS,
    from: "    elementRight: () => alongRow(1),",
    to: "    elementRight: () => crossPane(1),",
    why: "T6.1 — `→` as the old crossPane: outside a split it does nothing, and T1.164 fails at m1",
  },
  mutations: [
    {
      // T6.2 (C26 I30, D10).
      name: "↓ walks the row rather than leaving it",
      file: KEYS,
      from: "      const at = elements.findIndex((q, k) => k > i && !passedOver(here, q) && (here === undefined || !oneRow(here, q)));",
      to: "      const at = elements.findIndex((q, k) => k > i && !passedOver(here, q));",
      expect: "T1.165",
    },
    {
      name: "↑ walks the row rather than leaving it",
      file: KEYS,
      from: "          if (q !== undefined && !passedOver(here, q) && (here === undefined || !oneRow(here, q))) {",
      to: "          if (q !== undefined && !passedOver(here, q)) {",
      expect: "T1.165",
    },
    {
      // §8c.3 row 5 — entering lands on the row's first element.
      name: "↑ into a row lands on its last element",
      file: KEYS,
      from: "        for (let k = reach - 1; reach > 0 && k >= 0; k -= 1) {",
      to: "        for (let k = reach - 1; false; k -= 1) {",
      expect: "T1.165",
    },
    {
      // §8c.2 row 4 — a split is not a wide row.
      name: "one row across a split's panes",
      file: KEYS,
      from: "  a.pane?.split === b.pane?.split &&\n  a.pane?.side === b.pane?.side &&\n",
      to: "",
      expect: "T1.164",
    },
    {
      // I28 — the divider at the row's end.
      name: "the row's end does not cross the divider",
      file: KEYS,
      from: "    crossPane(direction === 1 ? 1 : 0);\n  };",
      to: "  };",
      expect: "T1.164",
    },
    {
      // T6.3 (C26 I31, ruling 80).
      name: "the window anchored on current whatever has focus",
      file: TAPE,
      from: "  const at = focusedAt >= 0 ? focusedAt : current < 0 ? 0 : current;",
      to: "  const at = current < 0 ? 0 : current;",
      expect: "T1.166",
    },
    {
      name: "the render drawn at current's anchor while the helpers take focus's",
      file: TAPE,
      from: "piecesOf(block, ctx.width, ctx, ctx.scrollOffsets?.[block.id] ?? 0, held);",
      to: "piecesOf(block, ctx.width, ctx, ctx.scrollOffsets?.[block.id] ?? 0, null);",
      expect: "T1.166",
    },
    {
      name: "the persisted start taken at current's anchor",
      file: CONSTRUCT,
      from: "        const next = tapeStart(block, at.inner, detection.capabilities, held, focusedMemberOf(entry.id, block.id));",
      to: "        const next = tapeStart(block, at.inner, detection.capabilities, held);",
      expect: "T4.34",
    },
    {
      // T6.4 (C26 I31, M14.2).
      name: "a press on a tape tested against the row's whole width",
      file: CONSTRUCT,
      from: '      if (block === null || block.kind !== "tape") return p.element.cols;',
      to: '      if (block === null || block.kind !== "tape" || true) return p.element.cols;',
      expect: "T4.34",
    },
    {
      name: "the pointer's columns asked at current's anchor",
      file: CONSTRUCT,
      from: "                focusedMemberOf(entry.id, block.id),\n              ),",
      to: "                null,\n              ),",
      expect: "T4.34",
    },
    {
      // T6.5 (C26 I32).
      name: "the pull keyed on the focus address alone",
      file: CONSTRUCT,
      from: "pulledTo.rev === entry.rev && pulledTo.width === width) return;",
      to: "true) return;",
      expect: "T4.36",
    },
    {
      // T6.6 (C26 I32, D15).
      name: "the latch never set",
      file: CONSTRUCT,
      from: "    latched.add(`${entryId}\\u0000${key}`);",
      to: "",
      expect: "T4.37",
    },
    {
      name: "the latch outlives a focus move",
      file: CONSTRUCT,
      from: "    if (pulledTo?.where !== where) latched.clear();\n",
      to: "",
      expect: "T4.37",
    },
    {
      name: "a page key does not latch",
      file: CONSTRUCT,
      from: "    latch(entryId, block.id);\n    scheduler.commit(\"input\");\n  };",
      to: "    scheduler.commit(\"input\");\n  };",
      expect: "T4.37",
    },
    {
      name: "the wheel does not latch",
      file: CONSTRUCT,
      from: "    latch(entryId, blockId);\n",
      to: "",
      expect: "T4.37",
    },
    {
      // C22 T6.147 (I146).
      name: "a press on the bar focuses the child",
      file: CONSTRUCT,
      from: '    if (!e.shift && !e.motion && under.block.kind === "scroll") {',
      to: '    if (!e.shift && !e.motion && under.block.kind === "scroll-") {',
      expect: "T4.118",
    },
    {
      name: "the bar resolved at the outermost box alone",
      file: CONSTRUCT,
      from: '      if (child === undefined || child.kind !== "scroll") return null;\n      const childDrawn',
      to: "      return null;\n      const childDrawn",
      expect: "T4.118",
    },
    {
      name: "the bar's jump does not latch",
      file: CONSTRUCT,
      from: "          latch(entryId, target.id);\n",
      to: "",
      expect: "T4.118",
    },
    {
      name: "the bar read one column in",
      file: CONSTRUCT,
      from: "col === left + contentWidth && visible >= 0",
      to: "col === left + contentWidth - 1 && visible >= 0",
      expect: "T4.118",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
