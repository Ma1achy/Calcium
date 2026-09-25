// C04 §3ap — the tree (§105): the twisty is content, the guides are decoration.
//
// **The expected frames are literals, drawn before the assertion and read off
// §105's figure.** An expectation computed with the renderer's own indent
// formula agrees with any formula; a picture does not.
import { describe, expect, it } from "vitest";

import { applyPatch, block, validateDocument } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { glyphFor } from "../../src/presentation/blocks/glyphs.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS } from "../support/render.js";
import { doc } from "../support/blocks.js";
import type { Block, Tree, TreeNode, ViewDocument } from "../../src/data/viewmodel/index.js";
import type { FocusState } from "../../src/presentation/blocks/types.js";

const registry = createBlockRegistry({ defaults: true });

const frame = (b: Block, width: number, caps = FULL_CAPS, focus: FocusState | null = null): readonly string[] =>
  renderSequenceToLines(registry, [b], width, { theme: DARK_THEME, capabilities: caps, focus, scrollOffsets: {} }).map(
    (l) => l.replace(/\x1b\[[0-9;]*m/gu, "").trimEnd(),
  );

/** §105's own tree. */
const FIGURE: readonly TreeNode[] = [
  {
    id: "src",
    label: "src",
    expanded: true,
    children: [
      {
        id: "interaction",
        label: "interaction",
        expanded: true,
        children: [
          { id: "parser", label: "parser", children: [{ id: "decode", label: "decode.ts" }] },
          { id: "frame", label: "frame.ts", aside: "4.1 kB" },
        ],
      },
      { id: "data", label: "data", children: [] },
    ],
  },
  { id: "package", label: "package.json", aside: "1.2 kB" },
];

const tree = (nodes: readonly TreeNode[] = FIGURE): Tree => block({ kind: "tree", id: "t", nodes }) as Tree;

const errorsOf = (b: Block): readonly string[] => {
  const r = validateDocument(doc({ blocks: [b] }));
  return r.ok ? [] : r.error;
};

describe("C04 §3ap — tree", () => {
  it("T1.52 (C04 I129): node ids, visibility and each node's own flag", () => {
    expect(errorsOf(tree()), "§105's tree validates").toEqual([]);

    // **A duplicate at depth zero and at depth two** — per block, at any depth,
    // not per level.
    const shallow = tree([{ id: "a", label: "a" }, { id: "a", label: "b" }]);
    const deep = tree([
      { id: "x", label: "x", children: [{ id: "y", label: "y", children: [{ id: "x", label: "again" }] }] },
    ]);
    expect(errorsOf(shallow).join("\n")).toMatch(/node id "a" appears 2 times \(C04 I129\)/u);
    expect(errorsOf(deep).join("\n")).toMatch(/node id "x" appears 2 times \(C04 I129\)/u);

    // L6, L7 — `children: []` is a folder with nothing in it; `expanded` on a
    // leaf is ignored.
    const open = glyphFor("collapse", FULL_CAPS);
    const shut = glyphFor("expand", FULL_CAPS);
    expect(frame(tree([{ id: "e", label: "empty", children: [] }]), 20)).toEqual([`${shut} empty`]);
    expect(frame(tree([{ id: "e", label: "empty", expanded: true, children: [] }]), 20)).toEqual([`${open} empty`]);
    expect(frame(tree([{ id: "l", label: "leaf", expanded: true }]), 20)).toEqual(["  leaf"]);

    // L8 — collapse `src` over an expanded `interaction`: the child is hidden
    // and its flag kept, so expanding `src` again shows it expanded.
    const d0 = doc({ blocks: [tree()] });
    const shutSrc = applyPatch(d0, { op: "expand", blockId: "t", rowId: "src", expanded: false });
    expect(shutSrc.ok).toBe(true);
    const hidden = (shutSrc as { doc: ViewDocument }).doc.blocks[0] as Block;
    expect(frame(hidden, 40), "only the roots").toEqual([`${shut} src`, "  package.json                    1.2 kB"]);
    const again = applyPatch((shutSrc as { doc: ViewDocument }).doc, {
      op: "expand",
      blockId: "t",
      rowId: "src",
      expanded: true,
    });
    const restored = (again as { doc: ViewDocument }).doc.blocks[0] as Block;
    expect(frame(restored, 40), "the subtree as the reader left it").toEqual(frame(tree(), 40));
  });

  it("T1.53 (C04 I130): §105's figure, then the ladder rung by rung", () => {
    const o = glyphFor("collapse", FULL_CAPS);
    const c = glyphFor("expand", FULL_CAPS);
    // L1 — §105's figure at 40 columns.
    expect(frame(tree(), 40)).toEqual([
      `${o} src`,
      `│  ${o} interaction`,
      `│  │  ${c} parser`,
      "│  │    frame.ts                  4.1 kB",
      `│  ${c} data`,
      "  package.json                    1.2 kB",
    ]);
    // Still guided at 24: `frame.ts` at depth two needs 6 + 2 + 8 + 2 + 6 = 24.
    expect(frame(tree(), 24)[3]).toBe("│  │    frame.ts  4.1 kB");
    // L2 — at 23 the guided row no longer fits, and **the guides go first**:
    // two-cell steps, every aside still drawn.
    expect(frame(tree(), 23)).toEqual([
      `${o} src`,
      `  ${o} interaction`,
      `    ${c} parser`,
      "      frame.ts   4.1 kB",
      `  ${c} data`,
      "  package.json   1.2 kB",
    ]);
    // L3 — at 21 `frame.ts`'s row would need 22, so the asides go.
    expect(frame(tree(), 21)).toEqual([
      `${o} src`,
      `  ${o} interaction`,
      `    ${c} parser`,
      "      frame.ts",
      `  ${c} data`,
      "  package.json",
    ]);
    // **And as a group**, which the figure cannot show: at 21 `package.json`'s
    // aside needs 22 as well, so both go under either rule. Constructed here —
    // `pkg`'s aside fits alone at 20, and it goes because `a-longer-name`'s
    // does not. The mutation pass found the figure could not separate them.
    const group = tree([
      { id: "f", label: "a-longer-name", aside: "4.1 kB" },
      { id: "p", label: "pkg", aside: "1 kB" },
    ]);
    expect(frame(group, 23), "both fit at 23").toEqual(["  a-longer-name  4.1 kB", "  pkg              1 kB"]);
    expect(frame(group, 20), "one does not fit, so neither is drawn").toEqual(["  a-longer-name", "  pkg"]);

    // L4 — a long name at depth two. At 20 it needs 4 + 2 + 16 = 22, so the
    // indent is capped at 20 − 2 − 16 = 2 for the block: the name is whole,
    // and **no row starts right of a deeper one's parent** — `k` and its
    // parent `interaction` share a column rather than inverting.
    const long = tree([
      {
        id: "src",
        label: "src",
        expanded: true,
        children: [
          {
            id: "interaction",
            label: "interaction",
            expanded: true,
            children: [{ id: "k", label: "a-sixteen-cell-n" }],
          },
        ],
      },
    ]);
    expect(frame(long, 20)).toEqual([`${o} src`, `  ${o} interaction`, "    a-sixteen-cell-n"]);
    // At 19 the cap is 1, and it is one number: `interaction` takes it too.
    expect(frame(long, 19)).toEqual([`${o} src`, ` ${o} interaction`, "   a-sixteen-cell-n"]);
    // L5 — the widest name alone is wider than the row: the cap is zero and
    // the name truncates with a mark; nothing is shed.
    const cut = frame(long, 12);
    expect(cut).toEqual([`${o} src`, `${o} interacti…`, "  a-sixteen…"]);

    // The rows are the visible nodes at every width — the ladder moves cells.
    for (const w of [8, 12, 16, 20, 21, 23, 24, 40, 80]) {
      expect(frame(tree(), w), `width ${String(w)}`).toHaveLength(6);
      expect(registry.measure(tree(), w), `measure at ${String(w)}`).toBe(6);
    }
  });

  it("T1.54 (C04 I131): the twisty is the disclosure pair, never focus", () => {
    for (const caps of [FULL_CAPS, ASCII_CAPS]) {
      const rows = frame(tree(), 40, caps);
      expect(rows[0]?.startsWith(`${glyphFor("collapse", caps)} `), "expanded").toBe(true);
      expect(rows[4]?.includes(`${glyphFor("expand", caps)} data`), "collapsed").toBe(true);
      expect(rows.join("\n"), "focus's mark is not the twisty").not.toContain(glyphFor("focus", caps));
      // **Focused and collapsed at once** — the row a single slot cannot draw.
      const focused = frame(tree(), 40, caps, { blockId: "t", rowId: "data" } as FocusState);
      expect(focused[4]?.includes(`${glyphFor("expand", caps)} data`)).toBe(true);
      expect(focused.join("\n")).not.toContain(glyphFor("focus", caps));
    }
    expect(glyphFor("expand", FULL_CAPS)).not.toBe(glyphFor("focus", FULL_CAPS));
  });

  it("T1.55 (C04 I129): op expand reaches a node at any depth", () => {
    const d0 = doc({ blocks: [tree()] });
    const nodesOf = (d: ViewDocument): readonly TreeNode[] => (d.blocks[0] as Tree).nodes;

    const top = applyPatch(d0, { op: "expand", blockId: "t", rowId: "package", expanded: true });
    expect(top.ok).toBe(true);
    expect(nodesOf((top as { doc: ViewDocument }).doc)[1]?.expanded, "depth zero").toBe(true);

    const deep = applyPatch(d0, { op: "expand", blockId: "t", rowId: "parser", expanded: true });
    expect(deep.ok).toBe(true);
    const parser = nodesOf((deep as { doc: ViewDocument }).doc)[0]?.children?.[0]?.children?.[0];
    expect(parser?.id).toBe("parser");
    expect(parser?.expanded, "depth two").toBe(true);
    // And the sibling path is untouched — only the path to the node is rebuilt.
    expect(nodesOf((deep as { doc: ViewDocument }).doc)[1]).toBe(nodesOf(d0)[1]);

    const none = applyPatch(d0, { op: "expand", blockId: "t", rowId: "nosuch", expanded: true });
    expect(none.ok).toBe(false);
    expect(JSON.stringify(none)).toMatch(/no row or node \\"nosuch\\" in block \\"t\\"/u);

    const neither = applyPatch(doc({ blocks: [block({ kind: "raw", id: "r", text: "x" })] }), {
      op: "expand",
      blockId: "r",
      rowId: "x",
      expanded: true,
    });
    expect(neither.ok).toBe(false);
    expect(JSON.stringify(neither)).toMatch(/is a raw, which has no rows or nodes/u);
  });
});
