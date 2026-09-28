// C09 I126 — the width a nested child is laid out and addressed at is the width
// it is drawn at.
//
// **Read against the renderer, not against a formula.** The witness is a kind
// that records the `ctx.width` it was drawn at, so every row compares the
// block library's answer with what the frame actually did — a table of expected
// widths written here would be a second derivation that agrees with the first.
//
// The arrangements are §7i's classification table, one per row: each container
// kind, and the two nestings where two narrowings compose. The controls are the
// arrangements where the answer was already right, so a version that answered
// every child one column narrower fails them.
import { describe, expect, it } from "vitest";

import { block, childWidths, contentWidth, hasChildren, type Block } from "../../src/data/viewmodel/index.js";
import { rows as inkRows } from "../../src/presentation/blocks/paint.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import { blockWidthInEntry } from "../../src/shell/entry-layout.js";
import { measurable } from "../support/render.js";

const SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu");
const plain = (line: string): string => line.replace(SGR, "");

/** A notice `n` cells long: one row at `n` and wider, two at `n − 1`. */
const note = (id: string, n: number): unknown => ({ kind: "notice", id, tone: "info", text: "x".repeat(n) });

/** A kind that draws one row and records the width it was handed. */
function witness(): { definition: BlockDefinition; drawnAt: () => number | undefined } {
  let drawnAt: number | undefined;
  return {
    drawnAt: () => drawnAt,
    definition: {
      kind: "probe",
      measure: () => 1,
      // Three cells of content, so a child aligned off `left` is placed at its
      // content width rather than its cell's (C04 I101).
      width: () => 3,
      render: (_b, ctx) => {
        drawnAt = ctx.width;
        return inkRows(["p"]);
      },
    },
  };
}

const P = { kind: "probe", id: "p" };

/** C04's division alone — `childWidths` down the path — which is what the shell asked before I126. */
function c04Width(b: Block, width: number, id: string): number | null {
  const at = contentWidth(b, width);
  if (b.id === id) return at;
  if (!hasChildren(b)) return null;
  const widths = childWidths(b, at);
  for (const [i, child] of b.children.entries()) {
    const found = c04Width(child, widths[i] ?? at, id);
    if (found !== null) return found;
  }
  return null;
}
const W = 40;

/**
 * §7i's rows. `bar` says whether the arrangement narrows past C04's
 * `childWidths` — the cells where two widths could disagree — and the rest are
 * the controls.
 */
const ARRANGEMENTS: readonly Readonly<{ name: string; bar: boolean; block: unknown }>[] = [
  { name: "row group, a share", bar: false, block: { kind: "group", id: "g", direction: "row", children: [P, note("n", 5)] } },
  {
    name: "row group, aligned right",
    bar: true,
    block: { kind: "group", id: "g", direction: "row", align: ["right"], children: [P, note("n", 5)] },
  },
  { name: "panel", bar: false, block: { kind: "panel", id: "k", title: "t", children: [P] } },
  { name: "split, left pane", bar: false, block: { kind: "split", id: "s", height: 3, children: [P, note("n", 5)] } },
  {
    name: "split, right pane with a bar",
    bar: true,
    block: {
      kind: "split",
      id: "s",
      height: 2,
      children: [note("l", 3), { kind: "group", id: "c", direction: "column", children: [P, note("a", 3), note("b", 3)] }],
    },
  },
  { name: "scroll without a bar", bar: false, block: { kind: "scroll", id: "b", height: 9, children: [P, note("a", 3)] } },
  {
    name: "scroll with a bar",
    bar: true,
    block: { kind: "scroll", id: "b", height: 2, children: [P, note("a", 3), note("b", 3)] },
  },
  {
    name: "scroll with a bar, in a split's right pane",
    bar: true,
    block: {
      kind: "split",
      id: "s",
      height: 4,
      children: [note("l", 3), { kind: "scroll", id: "b", height: 2, children: [P, note("a", 3), note("b", 3)] }],
    },
  },
  {
    name: "split, in a scroll with a bar",
    bar: true,
    block: {
      kind: "scroll",
      id: "b",
      height: 2,
      children: [{ kind: "split", id: "s", height: 1, children: [P, note("r", 3)] }, note("a", 3), note("b", 3)],
    },
  },
];

describe("C09 I126 — a nested child's width is the width it is drawn at", () => {
  it("T1.87 (C09 I126, I115, C26 I3): a scroll with a bar lays its elements out at the width it draws its children at", () => {
    const m = measurable();
    // Three notices of 40 cells at 40: one row each fits nothing in a box of
    // two, so the bar takes a column and each notice wraps to two rows at 39.
    const box = block({ kind: "scroll", id: "b", height: 2, children: [note("a", W), note("b", W), note("c", W)] } as never);
    const rows = m.renderToLines(box, W).map(plain);
    // The frame: the first child's text wraps, so its second row is still `a`'s.
    expect(rows[0]?.trim().startsWith("x"), `|${rows[0] ?? ""}|`).toBe(true);
    expect(rows[1]?.trim().startsWith("x"), `|${rows[1] ?? ""}| — a's second row`).toBe(true);
    expect(m.measure(block(note("a", W) as never), W - 1), "the premise: a wraps at the bar's width").toBe(2);

    const els = m.registry.elementsOf(box, W);
    expect(els.map((e) => [e.id, e.rows.from, e.rows.to])).toEqual([
      ["a", 0, 2],
      ["b", 2, 4],
      ["c", 4, 6],
    ]);
    // The bar is the box's column and a pointer on it is in the box.
    expect(els.map((e) => [e.cols.from, e.cols.to])).toEqual([
      [0, W],
      [0, W],
      [0, W],
    ]);

    // **The control**: tall enough for no bar, the same children are one row
    // each — so the row above is about the bar and not about the notices.
    const open = block({ kind: "scroll", id: "b", height: 3, children: [note("a", W), note("b", W), note("c", W)] } as never);
    expect(m.registry.elementsOf(open, W).map((e) => [e.id, e.rows.from, e.rows.to])).toEqual([
      ["a", 0, 1],
      ["b", 1, 2],
      ["c", 2, 3],
    ]);
  });

  it.each(ARRANGEMENTS)(
    "T1.88 (C09 I126, C22 I117, C04 I133): $name — the width the library answers for the child is the width it was drawn at",
    ({ block: shape, bar }) => {
      const w = witness();
      const m = measurable({ definitions: [w.definition as BlockDefinition<never>] });
      const b = block(shape as never);
      m.renderToLines(b, W);
      const drawn = w.drawnAt();
      expect(drawn, "the witness was drawn").toBeDefined();
      expect(blockWidthInEntry(m.registry, [b], W, "p")?.inner).toBe(drawn);
      // **The premise the row is indexed on**: where §7i says a narrowing lies
      // past C04's division, the width that division alone gives disagrees with
      // the frame, and where it does not, the two agree — so each arrangement is
      // shown to respond to the thing under test before it is asserted against.
      expect(c04Width(b, W, "p") === drawn, "C04's division alone agrees with the frame").toBe(!bar);
    },
  );
});
