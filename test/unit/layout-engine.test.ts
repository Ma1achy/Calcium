// C29 — the layout engine's sizing core, one row per invariant.
//
// The walk that ruled them is `docs/notes/C29_LAYOUT_WALK.md`; its three defects
// are F1220's and F1221's, and they are I10, I13 and I9 here.
//
// **A row governed by one rule is a restatement of that rule** (CLAUDE.md), so
// where a row can be, it constructs the cell where two rules meet: I3's growing
// child in a fitting row, I5's second clamping round, I9's column whose cross
// axis is width.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compose,
  distribute,
  layout,
  layoutCounted,
  measure,
  type Box,
  type SolvedBox,
} from "../../src/presentation/layout/index.js";
import { DEFAULT_WIDTHS } from "../../src/testing/measurement-conformance.js";
import { art } from "../../src/presentation/art.js";
import { widthRung } from "../../src/presentation/blocks/kinds/status.js";
import { cells } from "../../src/presentation/text.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { sourceOf } from "../support/source.js";
import { REGION, anchored, centred, placeIn } from "../support/overlay.js";
import { block } from "../../src/data/viewmodel/index.js";
import type { MeasureMemo } from "../../src/presentation/blocks/index.js";

const rows = (id: string, ...lines: string[]): Box => ({ id, children: { kind: "rows", rows: lines } });

const find = (solved: SolvedBox, id: string): SolvedBox => {
  if (solved.id === id) return solved;
  for (const child of solved.children) {
    const hit = find(child, id);
    if (hit.id === id) return hit;
  }
  return solved;
};

/** Every rectangle of a solved tree, parent first. */
const rects = (solved: SolvedBox): { id: string; x: number; y: number; w: number; h: number }[] => [
  { id: solved.id, x: solved.rect.x, y: solved.rect.y, w: solved.rect.width, h: solved.rect.height },
  ...solved.children.flatMap(rects),
];

describe("C29 — the sizing core", () => {
  it("T1.1 (C29 I1): every dimension is a whole number of cells, and cells() is the width authority", () => {
    const tree: Box = {
      id: "row",
      direction: "row",
      width: { kind: "fixed", n: 80 },
      childGap: 1,
      children: [
        { id: "a", width: { kind: "grow" }, children: { kind: "rows", rows: ["a"] } },
        { id: "b", width: { kind: "grow" }, children: { kind: "rows", rows: ["b"] } },
        { id: "c", width: { kind: "grow" }, children: { kind: "rows", rows: ["c"] } },
      ],
      spend: "largest-remainder",
    };
    const solved = layout(tree, 80);
    // 80 less two gaps is 78, which does not divide by three without a remainder
    // — the case where a float model would leave 26.
    for (const r of rects(solved)) {
      expect(Number.isInteger(r.x), `${r.id}.x`).toBe(true);
      expect(Number.isInteger(r.y), `${r.id}.y`).toBe(true);
      expect(Number.isInteger(r.w), `${r.id}.w`).toBe(true);
      expect(Number.isInteger(r.h), `${r.id}.h`).toBe(true);
    }
    expect(solved.children.map((c) => c.rect.width)).toEqual([26, 26, 26]);

    // **The width authority, and it is the half a `.length` model gets wrong.**
    // Two wide characters are four cells and two units.
    expect(measure({ ...rows("cjk", "日本"), overflow: { x: "wrap" } }, 3)).toBe(2);
    expect(layout(rows("cjk", "日本"), 80).rect.width).toBe(4);
  });

  it("T1.2 (C29 I2): a FIT parent sums along its axis and maxes across it, padding and gaps included", () => {
    const column: Box = {
      id: "col",
      padding: { l: 2, r: 1, t: 1, b: 1 },
      childGap: 1,
      children: [rows("one", "aaaa"), rows("two", "bb"), rows("three", "cccccc")],
    };
    // Across the axis: the widest child, 6, plus l+r.
    expect(layout(column, 200).rect.width).toBe(9);
    // Along it: three rows, two gaps, t+b.
    expect(measure(column, 200)).toBe(7);

    const row: Box = { ...column, direction: "row" };
    // Along the axis now: 4 + 2 + 6, two gaps, l+r.
    expect(layout(row, 200).rect.width).toBe(17);
    // Across it: the tallest child is one row, plus t+b.
    expect(measure(row, 200)).toBe(3);
  });

  it("T1.3 (C29 I3): GROW and PERCENT contribute min to a FIT parent, and min defaults to 0", () => {
    // The cell where two rules meet: *a parent derives from its children* and
    // *GROW takes a share of what is left*. Neither may go first.
    const withGrow: Box = {
      id: "fit",
      direction: "row",
      childGap: 1,
      children: [
        rows("solid", "0123456789"),
        { id: "elastic", width: { kind: "grow" }, children: { kind: "rows", rows: ["would be very wide indeed"] } },
      ],
    };
    // The growing child contributes nothing, so the row is its non-growing
    // child plus the gap — **not** the growing child's own content.
    expect(layout(withGrow, 200).rect.width).toBe(11);

    const kids = withGrow.children as readonly Box[];
    const withMin: Box = {
      ...withGrow,
      children: [kids[0]!, { ...kids[1]!, width: { kind: "grow", min: 4 } }],
    };
    expect(layout(withMin, 200).rect.width).toBe(15);

    // PERCENT does the same, and for the same reason: in a FIT parent there is
    // no parent size to take a percentage of yet (§8a A2).
    const withPercent: Box = {
      ...withGrow,
      children: [kids[0]!, { id: "share", width: { kind: "percent", p: 0.5, min: 4 }, children: { kind: "rows", rows: [""] } }],
    };
    expect(layout(withPercent, 200).rect.width).toBe(15);
  });

  it("T1.4 (C29 I4): largest remainder, ties by declaration order, and the leftover is a declared policy", () => {
    const demands = [0, 0, 0].map(() => ({ base: 0, min: 0, max: Number.POSITIVE_INFINITY, weight: 1 }));
    // 80 across three equal shares: 26 each and two cells over.
    expect(distribute(demands, 80, "largest-remainder").sizes).toEqual([27, 27, 26]);
    // **The same arithmetic, the other policy.** A group spends nothing — this
    // is the pair C04 I42 rules, and the reason once written against changing
    // it was false (F1219).
    expect(distribute(demands, 80, "none").sizes).toEqual([26, 26, 26]);

    // Ties by declaration order: two equal fractional parts, and the earlier
    // child takes the cell. Without a total order the frame is the sort's.
    const pair = [
      { base: 0, min: 0, max: Number.POSITIVE_INFINITY, weight: 1 },
      { base: 0, min: 0, max: Number.POSITIVE_INFINITY, weight: 1 },
    ];
    expect(distribute(pair, 79, "largest-remainder").sizes).toEqual([40, 39]);
    expect(distribute(pair, 79, "none").sizes).toEqual([39, 39]);
  });

  it("T1.5 (C29 I5): clamping precedes distribution and reaches a fixed point in at most n rounds, counted", () => {
    // §8a A4's own case: a child pinned at max leaves its surplus in the pot,
    // which raises every other share and can pin a second.
    const capped = [
      { base: 0, min: 0, max: 10, weight: 1 },
      { base: 0, min: 0, max: Number.POSITIVE_INFINITY, weight: 1 },
      { base: 0, min: 0, max: Number.POSITIVE_INFINITY, weight: 1 },
    ];
    const two = distribute(capped, 80, "largest-remainder");
    // **Asserted on the count, not on the widths** — a fixed point reached in
    // n + 1 rounds draws exactly what one reached in n draws.
    expect(two.rounds).toBe(2);
    expect(two.sizes[0]).toBe(10);
    expect(two.sizes.reduce((a, b) => a + b, 0)).toBe(80);
    expect(two.rounds).toBeLessThanOrEqual(capped.length);

    // Nothing to pin: one round and done.
    const free = capped.map((d) => ({ ...d, max: Number.POSITIVE_INFINITY }));
    expect(distribute(free, 80, "largest-remainder").rounds).toBe(1);

    // Two ceilings, and the bound still holds.
    const twoCaps = [
      { base: 0, min: 0, max: 5, weight: 1 },
      { base: 0, min: 0, max: 10, weight: 1 },
      { base: 0, min: 0, max: Number.POSITIVE_INFINITY, weight: 1 },
    ];
    const solved = distribute(twoCaps, 90, "largest-remainder");
    expect(solved.sizes).toEqual([5, 10, 75]);
    expect(solved.rounds).toBeLessThanOrEqual(twoCaps.length);

    // The counter reaches the engine, where a frame assertion cannot see it.
    const counted = layoutCounted(
      {
        id: "row",
        direction: "row",
        width: { kind: "fixed", n: 80 },
        children: [
          { id: "a", width: { kind: "grow", max: 10 }, children: { kind: "rows", rows: [""] } },
          { id: "b", width: { kind: "grow" }, children: { kind: "rows", rows: [""] } },
        ],
      },
      80,
    );
    expect(counted.counts.rounds).toContain(2);
  });

  it("T1.6 (C29 I6): min is a hard floor, the container clips, and no child is dropped", () => {
    const tree: Box = {
      id: "tight",
      direction: "row",
      width: { kind: "fixed", n: 40 },
      children: [
        { id: "a", width: { kind: "fixed", n: 20 }, children: { kind: "rows", rows: ["aaaaaaaaaaaaaaaaaaaa"] } },
        { id: "b", width: { kind: "fixed", n: 20 }, children: { kind: "rows", rows: ["bbbbbbbbbbbbbbbbbbbb"] } },
        { id: "c", width: { kind: "fixed", n: 20 }, children: { kind: "rows", rows: ["cccccccccccccccccccc"] } },
      ],
      clip: { x: true },
    };
    const solved = layout(tree, 40);
    // **No child is removed.** Dropping is a decision; this is an arithmetic
    // outcome, and a cell that cannot fit is drawn as much of itself as there
    // is room for.
    expect(solved.children).toHaveLength(3);
    expect(solved.children.map((c) => c.rect.width)).toEqual([20, 20, 20]);
    const drawn = compose(solved);
    expect(drawn).toHaveLength(1);
    // The container clips: forty cells of the sixty asked for, and the third
    // child's are the ones outside.
    expect(drawn[0]).toBe(`${"a".repeat(20)}${"b".repeat(20)}`);

    // **The case where the floor is asked to give way**, which the FIXED row
    // above cannot reach: FIXED has no room at all, so the shrink never runs.
    // Three FIT children of natural 20 and `min` 8 in twelve columns want 60
    // and can give back 36 — a deficit of 48 against 36 of room.
    const elastic: Box = {
      id: "elastic",
      direction: "row",
      width: { kind: "fixed", n: 12 },
      children: [1, 2, 3].map((n) => ({
        id: `e${String(n)}`,
        width: { kind: "fit", min: 8 },
        children: { kind: "rows" as const, rows: ["x".repeat(20)] },
      })),
    };
    const squeezed = layout(elastic, 12);
    // Every child at its floor and nothing below it; the container carries the
    // twelve cells of deficit that are left, and clips.
    expect(squeezed.children.map((c) => c.rect.width)).toEqual([8, 8, 8]);
    expect(squeezed.rect.width).toBe(12);
    expect(compose(squeezed)[0]).toHaveLength(12);
  });

  it("T1.7 (C29 I7): n children have n − 1 gaps, a zero child keeps its gap, and padding clamps with them", () => {
    const withZero: Box = {
      id: "row",
      direction: "row",
      childGap: 1,
      children: [rows("a", "aa"), { id: "gone", width: { kind: "fixed", n: 0 }, children: { kind: "rows", rows: [""] } }, rows("b", "bb")],
    };
    const solved = layout(withZero, 80);
    // Two gaps for three children, and the zero child keeps its own: `aa`, gap,
    // nothing, gap, `bb` — **two adjacent blanks, which is correct** (§8a A7).
    // A row whose gaps appear and disappear with its contents' widths jitters.
    expect(solved.rect.width).toBe(6);
    expect(find(solved, "b").rect.x).toBe(4);
    expect(compose(solved)[0]).toBe("aa  bb");

    // **Padding on a LEAF is inside it too**, and this is the row that was
    // vacuous. T1.12's corpus held a padded leaf and asserted only that
    // `measure` equalled the composed count — true of any two agreeing wrong
    // numbers — and the padding was dropped for every leaf in the tree until a
    // column group asked for a blank row above a child.
    const padLeaf: Box = {
      id: "note",
      padding: { l: 2, r: 1, t: 1, b: 2 },
      children: { kind: "rows", rows: ["abc"] },
    };
    expect(layout(padLeaf, 80).rect.width).toBe(6);
    expect(measure(padLeaf, 80)).toBe(4);
    expect(compose(layout(padLeaf, 80))).toEqual(["", "  abc", "", ""]);

    // And the content is measured at what the padding left it, not at the box.
    const padWrap: Box = {
      id: "wrapped",
      width: { kind: "fixed", n: 10 },
      padding: { l: 4, r: 4 },
      overflow: { x: "wrap" },
      children: { kind: "rows", rows: ["aa bb cc"] },
    };
    expect(measure(padWrap, 10)).toBe(3);

    // **And the content fills what the padding left, rather than taking its
    // natural size inside it.** The two agree whenever the content is wider
    // than the inner — which both rows above are — so the case that separates
    // them is a leaf narrower than its box whose height depends on its width.
    const painted: Box = {
      id: "plot",
      width: { kind: "fixed", n: 20 },
      height: { kind: "fixed", n: 5 },
      padding: { l: 2, r: 2, t: 1, b: 1 },
      children: {
        kind: "paint",
        natural: 4,
        measure: (w: number) => Math.max(1, Math.ceil(24 / Math.max(1, w))),
        render: (w: number, h: number) => Array.from({ length: h }, () => "#".repeat(Math.max(0, w))),
      },
    };
    // Sixteen columns inside, not the four it asks for: 24 / 16 is two rows.
    expect(find(layout(painted, 20), "plot\u00b7content").rect.width).toBe(16);
    // And three rows of the five, so `render` is given the box it was left.
    expect(find(layout(painted, 20), "plot\u00b7content").rect.height).toBe(3);
    expect(compose(layout(painted, 20))).toEqual(["", `  ${"#".repeat(16)}`, `  ${"#".repeat(16)}`, `  ${"#".repeat(16)}`, ""]);

    // **Padding wider than the box clamps, and `childGap` clamps with it** —
    // the inner size reaches 0 rather than going negative (§8a A8).
    const squeezed: Box = {
      id: "squeezed",
      width: { kind: "fixed", n: 2 },
      padding: { l: 5, r: 5 },
      childGap: 1,
      children: [rows("x", "x"), rows("y", "y"), rows("z", "z")],
    };
    const tight = layout(squeezed, 2);
    expect(tight.rect.width).toBe(2);
    for (const r of rects(tight)) expect(r.w).toBeGreaterThanOrEqual(0);
    expect(find(tight, "x").rect.width).toBe(0);
  });

  it("T1.8 (C29 I8): alignment acts on slack, centring rounds down, and a no-op alignment is counted", () => {
    const centred: Box = {
      id: "box",
      width: { kind: "fixed", n: 11 },
      align: { x: "c" },
      children: [rows("mark", "ab")],
    };
    // Nine cells of slack: four to the left, five to the right — **the leftover
    // cell goes right.**
    expect(find(layout(centred, 11), "mark").rect.x).toBe(4);
    expect(find(layout({ ...centred, align: { x: "r" } }, 11), "mark").rect.x).toBe(9);
    expect(find(layout({ ...centred, align: { x: "l" } }, 11), "mark").rect.x).toBe(0);

    // **The cell that gets reported as a bug** (§8a A6): a GROW sibling
    // consumes the slack by definition, so the field is set and nothing
    // happens. The engine answers with a number rather than with its source.
    const eaten: Box = {
      id: "row",
      direction: "row",
      width: { kind: "fixed", n: 20 },
      align: { x: "c" },
      children: [{ id: "elastic", width: { kind: "grow" }, children: { kind: "rows", rows: [""] } }],
    };
    const counted = layoutCounted(eaten, 20);
    expect(find(counted.solved, "elastic").rect.width).toBe(20);
    expect(counted.counts.alignNoOp).toBeGreaterThan(0);
    // And where the slack exists, nothing is counted.
    expect(layoutCounted(centred, 11).counts.alignNoOp).toBe(0);
  });

  it("T1.9 (C29 I9): stretch resolves where its cross axis is solved, over FIT only, silent against GROW", () => {
    // **A row's cross axis is height, so stretch is pass 4.**
    const row: Box = {
      id: "row",
      direction: "row",
      height: { kind: "fixed", n: 5 },
      align: { y: "stretch" },
      children: [rows("short", "a"), { id: "fixed", height: { kind: "fixed", n: 2 }, children: { kind: "rows", rows: ["b"] } }],
    };
    const solvedRow = layout(row, 80);
    expect(find(solvedRow, "short").rect.height).toBe(5);
    // **FIXED is never stretched** — an explicit size beats an inherited one.
    expect(find(solvedRow, "fixed").rect.height).toBe(2);

    // **Silent against GROW, not an error** — the default for a mosaic row is
    // stretch, so an error would fire on the default (§8a A5).
    const growing: Box = {
      ...row,
      children: [{ id: "elastic", height: { kind: "grow" }, children: { kind: "rows", rows: ["a"] } }],
    };
    expect(find(layout(growing, 80), "elastic").rect.height).toBe(5);

    // **F1221 — a column's cross axis is WIDTH, so stretch is pass 2.** Pass 3
    // wraps at the stretched width; a stretch applied in pass 4 would leave the
    // height standing at the unstretched one, and measure would return a count
    // compose does not emit.
    const column: Box = {
      id: "col",
      width: { kind: "fixed", n: 60 },
      align: { x: "stretch" },
      children: [
        {
          id: "prose",
          overflow: { x: "wrap" },
          children: { kind: "rows", rows: ["the quick brown fox jumps over the lazy dog and keeps going"] },
        },
      ],
    };
    const solvedColumn = layout(column, 60);
    expect(find(solvedColumn, "prose").rect.width).toBe(60);
    expect(measure(column, 60)).toBe(compose(solvedColumn).length);
    expect(measure(column, 60)).toBe(1);
    // Unstretched, the same tree is still the fixed 60 it declared — the
    // stretch changes the *child*, which is where the wrap happens.
    const unstretched: Box = {
      id: "col",
      width: { kind: "fixed", n: 60 },
      children: column.children as readonly Box[],
    };
    expect(find(layout(unstretched, 60), "prose").rect.width).toBeLessThan(60);
  });

  it("T1.10 (C29 I10): aspect is pass 2 on width and pass 4 on height, shrinks only, and loses without slack", () => {
    // **F1220 D1.** With a FIXED height the width is knowable in pass 2, which
    // is where widths are decided — and pass 3 then wraps at the final width,
    // so the height measure returns is the height the frame draws.
    const shrunk: Box = {
      id: "panel",
      width: { kind: "grow" },
      height: { kind: "fixed", n: 8 },
      aspect: 4,
      overflow: { x: "wrap" },
      children: { kind: "rows", rows: ["one two three four five six seven eight nine ten"] },
    };
    const solved = layout(shrunk, 100);
    expect(solved.rect.width).toBe(32);
    expect(measure(shrunk, 100)).toBe(compose(solved).length);

    // The height half, in pass 4: a wide box with no fixed height takes the
    // ratio out of its height.
    const tall: Box = { id: "img", width: { kind: "fixed", n: 40 }, height: { kind: "fixed", n: 30 }, aspect: 2, children: { kind: "rows", rows: [] } };
    expect(measure(tall, 40)).toBe(20);

    // **Only ever shrinks, and the case that says so is the one where the ratio
    // asks for MORE than the box has.** A ratio that already asks for less
    // agrees with every rule, including the one being tested.
    //
    // **The height half needs a height pass 2 did not already settle.** With a
    // FIXED height the width half resolves the whole ratio in pass 2 and pass 4
    // has nothing left to do — so a box declaring both is the input where the
    // two arms agree, and it says nothing about which one ran. A FIT height is
    // the case: 40 wide at 2:1 implies 20 rows against the one row of content,
    // and growing would overflow a box that already fits (§8a A9).
    const shortBox: Box = { id: "short", width: { kind: "fixed", n: 40 }, aspect: 2, children: { kind: "rows", rows: ["one row"] } };
    expect(measure(shortBox, 40)).toBe(1);

    // And the width half: a height of 30 at 4:1 implies 120 columns against the
    // 20 declared, and the width stays where it was.
    const narrowBox: Box = { id: "narrow", width: { kind: "fixed", n: 20 }, height: { kind: "fixed", n: 30 }, aspect: 4, children: { kind: "rows", rows: [] } };
    expect(layout(narrowBox, 20).rect.width).toBe(20);

    const wide: Box = { id: "img", width: { kind: "fixed", n: 10 }, height: { kind: "fixed", n: 4 }, aspect: 10, children: { kind: "rows", rows: [] } };
    expect(layout(wide, 10).rect.width).toBe(10);
    expect(measure(wide, 10)).toBe(1);
  });

  it("T1.11 (C29 I11): the passes run in order, and one re-fit suffices because text wraps at its solved width", () => {
    const paragraph = "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
    const tree: Box = {
      id: "col",
      width: { kind: "grow" },
      children: [{ id: "prose", overflow: { x: "wrap" }, children: { kind: "rows", rows: [paragraph] } }],
    };
    // **The height is a function of the solved width and of nothing else.** A
    // height taken before pass 2 would be the same at every width.
    const heights = [20, 40, 80].map((w) => measure(tree, w));
    expect(heights[0]).toBeGreaterThan(heights[1]!);
    expect(heights[1]).toBeGreaterThan(heights[2]!);

    // And the height the engine committed is the height it draws, at each one —
    // which is what makes a second re-fit unnecessary rather than merely
    // skipped.
    for (const w of [20, 40, 80]) {
      expect(compose(layout(tree, w)).length).toBe(measure(tree, w));
    }
  });

  it("T1.12 (C29 I12): measure stops after pass 4 and equals the composed row count, over the corpus", () => {
    const corpus: Box[] = [
      rows("plain", "one", "two"),
      { id: "padded", padding: { t: 1, b: 2, l: 3, r: 1 }, children: { kind: "rows", rows: ["x"] } },
      {
        id: "row",
        direction: "row",
        childGap: 2,
        children: [rows("l", "left", "l2"), rows("r", "right")],
      },
      {
        id: "wrapping",
        width: { kind: "grow" },
        overflow: { x: "wrap" },
        children: { kind: "rows", rows: ["a paragraph long enough to wrap at every width the gates use"] },
      },
      {
        id: "nested",
        childGap: 1,
        padding: { l: 2 },
        children: [
          { id: "head", children: { kind: "rows", rows: ["title"] } },
          { id: "body", direction: "row", childGap: 1, children: [rows("c1", "aa", "bb"), { id: "c2", width: { kind: "grow" }, overflow: { x: "wrap" }, children: { kind: "rows", rows: ["some text that will wrap when it is narrow"] } }] },
        ],
      },
      {
        id: "painted",
        width: { kind: "grow" },
        children: {
          kind: "paint",
          natural: 12,
          measure: (w: number) => Math.max(1, Math.ceil(24 / Math.max(1, w))),
          render: (w: number, h: number) => Array.from({ length: h }, () => "#".repeat(Math.max(0, w))),
        },
      },
    ];
    for (const box of corpus) {
      for (const width of DEFAULT_WIDTHS) {
        expect(compose(layout(box, width)).length, `${box.id} at ${String(width)}`).toBe(measure(box, width));
      }
    }

    // **The half that would not be vacuous if the two disagreed**: every row the
    // wrap produced is inside the frame, so the count is not merely consistent
    // with itself.
    const prose = corpus[3]!;
    const drawn = compose(layout(prose, 40)).filter((row) => row !== "");
    expect(drawn.length).toBe(measure(prose, 40));
    expect(drawn.join(" ").replace(/\s+/gu, " ").trim()).toBe(
      "a paragraph long enough to wrap at every width the gates use",
    );
  });

  it("T1.13 (C29 I13): the tree and the width are the only inputs", () => {
    const tree: Box = {
      id: "root",
      direction: "row",
      width: { kind: "grow" },
      childGap: 1,
      align: { x: "c", y: "stretch" },
      spend: "largest-remainder",
      children: [
        { id: "a", width: { kind: "grow", max: 12 }, children: { kind: "rows", rows: ["a"] } },
        { id: "b", width: { kind: "percent", p: 0.25 }, children: { kind: "rows", rows: ["b"] } },
        { id: "c", width: { kind: "grow" }, overflow: { x: "wrap" }, children: { kind: "rows", rows: ["and some prose to wrap"] } },
      ],
    };
    // No clock, no random, no hashing of ids, no memory of a previous frame.
    for (const width of DEFAULT_WIDTHS) {
      expect(layout(tree, width)).toEqual(layout(tree, width));
      expect(compose(layout(tree, width))).toEqual(compose(layout(tree, width)));
      expect(layoutCounted(tree, width).counts).toEqual(layoutCounted(tree, width).counts);
    }
    // And a solve at one width leaves nothing behind that changes another.
    const eighty = compose(layout(tree, 80));
    layout(tree, 40);
    expect(compose(layout(tree, 80))).toEqual(eighty);
  });

  it("T1.14 (C29 I14): the degenerate sizes are answers — 0 measures 0 and a zero child is kept", () => {
    const tree: Box = {
      id: "row",
      direction: "row",
      width: { kind: "grow" },
      children: [rows("a", "aaa"), rows("b", "bbb")],
    };
    expect(measure(tree, 0)).toBe(0);
    expect(compose(layout(tree, 0))).toEqual([]);
    // **Kept in the tree**, which is the distinction I6 and I7 both rest on.
    expect(layout(tree, 0).children).toHaveLength(2);
    expect(layout(tree, 0).children.map((c) => c.rect.width)).toEqual([0, 0]);

    // A box with no children and no rows is one answer too.
    expect(measure({ id: "empty", children: [] }, 80)).toBe(0);
    expect(measure({ id: "none", children: { kind: "rows", rows: [] } }, 80)).toBe(0);
  });

  it("T1.15 (C29 I15): clipping is per axis with a childOffset, and a clip never changes a measured height", () => {
    const inner: Box = {
      id: "long",
      children: { kind: "rows", rows: ["row0", "row1", "row2", "row3", "row4"] },
    };
    const window: Box = {
      id: "window",
      height: { kind: "fixed", n: 2 },
      clip: { y: true, offset: { x: 0, y: 2 } },
      children: [inner],
    };
    // The child is placed at a negative offset and the container clips: one
    // mechanism for mosaic cells, scroll blocks and attached terminals.
    expect(compose(layout(window, 80))).toEqual(["row2", "row3"]);
    // Scrolled further, the same box shows a different window and the same
    // number of rows.
    const later = { ...window, clip: { y: true, offset: { x: 0, y: 3 } } };
    expect(compose(layout(later, 80))).toEqual(["row3", "row4"]);

    // **A clip never changes a measured height** — the height was committed
    // before anything was drawn, and shortening it would make C09 I1 false one
    // frame later.
    expect(measure(window, 80)).toBe(2);
    expect(measure(later, 80)).toBe(2);
    const unclipped: Box = { id: "window", height: { kind: "fixed", n: 2 }, children: [inner] };
    expect(measure(unclipped, 80)).toBe(2);

    // **A clip inside a clip sees its ancestor's window and not its own.** The
    // inner box asks for four columns starting at 2; the outer already cut
    // everything past column 3, so one column of the four survives — a clip
    // that replaced the window rather than intersecting it would draw all four.
    const nested: Box = {
      id: "outer",
      width: { kind: "fixed", n: 3 },
      clip: { x: true },
      children: [
        {
          id: "middle",
          direction: "row",
          padding: { l: 2 },
          clip: { x: true },
          children: [rows("deep", "abcd")],
        },
      ],
    };
    expect(compose(layout(nested, 3))).toEqual(["  a"]);

    // Per axis: clipping y leaves x alone.
    const across: Box = {
      id: "across",
      width: { kind: "fixed", n: 3 },
      clip: { x: true, offset: { x: 1, y: 0 } },
      children: [rows("wide", "abcdef")],
    };
    expect(compose(layout(across, 80))).toEqual(["bcd"]);
  });

  it("T1.16 (C29 I16): the engine never throws, so measure stays pure and total", () => {
    // **A contradictory declaration is refused at construction, never at
    // layout** (§8a A10): a throw mid-pass abandons a half-solved tree and
    // reaches the frame as a fault rather than as a layout. So the engine's
    // half of the ruling is that no input reaches a throw.
    const hostile: Box[] = [
      { id: "negative-padding", padding: { l: -4, r: -4, t: -2, b: -2 }, children: { kind: "rows", rows: ["x"] } },
      { id: "negative-gap", direction: "row", childGap: -3, children: [rows("a", "a"), rows("b", "b")] },
      { id: "backwards", width: { kind: "fit", min: 40, max: 4 }, children: { kind: "rows", rows: ["x"] } },
      { id: "percent-over", direction: "row", children: [
        { id: "p1", width: { kind: "percent", p: 0.5 }, children: { kind: "rows", rows: ["a"] } },
        { id: "p2", width: { kind: "percent", p: 0.5 }, children: { kind: "rows", rows: ["b"] } },
        { id: "p3", width: { kind: "percent", p: 0.5 }, children: { kind: "rows", rows: ["c"] } },
      ] },
      { id: "zero-aspect", aspect: 0, width: { kind: "fixed", n: 10 }, children: { kind: "rows", rows: ["x"] } },
      { id: "negative-aspect", aspect: -2, width: { kind: "fixed", n: 10 }, children: { kind: "rows", rows: ["x"] } },
      { id: "huge", width: { kind: "fixed", n: 1e6 }, children: { kind: "rows", rows: ["x"] } },
      { id: "deep", children: [{ id: "d1", children: [{ id: "d2", children: [{ id: "d3", children: { kind: "rows", rows: ["x"] } }] }] }] },
    ];
    for (const box of hostile) {
      for (const width of [-10, 0, 1, 7.5, 80, 1e6]) {
        expect(() => measure(box, width), `${box.id} at ${String(width)}`).not.toThrow();
        expect(() => compose(layout(box, width)), `${box.id} at ${String(width)}`).not.toThrow();
        expect(Number.isInteger(measure(box, width)), `${box.id} at ${String(width)}`).toBe(true);
      }
    }
    // And §8a A11's own case is an arithmetic outcome rather than a refusal:
    // three PERCENT(0.5) children shrink toward their minima, then clip. **The
    // parent has to be sized for the case to exist at all** — in a FIT parent
    // PERCENT contributes its min, so the row above is 0 wide and never reaches
    // a deficit (I3, §8a A2).
    const overSubscribed: Box = { ...hostile[3]!, width: { kind: "fixed", n: 30 } };
    const solved = layout(overSubscribed, 30);
    expect(solved.rect.width).toBe(30);
    expect(solved.children).toHaveLength(3);
    expect(solved.children.reduce((a, c) => a + c.rect.width, 0)).toBe(30);
    expect(measure(overSubscribed, 30)).toBe(1);
  });

  it("T1.30 (C29 I18, §7b): Box's field set by equality, and the two owners the engine does not take", () => {
    // **The field set by equality, and the row survives the build inverted.**
    // It asserted the *absence* of `representations` and now asserts its
    // presence in the same way, because neither an absence nor a presence check
    // on one field is structural — what catches a fifth field arriving is the
    // equality. It did its job on the way past: adding `representations` turned
    // this row red with nothing else in the suite moving.
    const types = readFileSync("src/presentation/layout/types.ts", "utf8");
    const box = /export type Box = Readonly<\{([\s\S]*?)\n\}>;/u.exec(types);
    expect(box, "the Box declaration is findable").not.toBeNull();
    const members = [...(box?.[1] ?? "").matchAll(/^\s{2}(\w+)\??:/gmu)].map((m) => m[1]);
    expect(members.sort(), "every field Box declares, by equality").toEqual(
      [
        "align",
        "aspect",
        "children",
        "childGap",
        "clip",
        "direction",
        "height",
        "id",
        "overflow",
        "padding",
        "representations",
        "spend",
        "width",
      ].sort(),
    );

    // **And the two owners the engine does NOT take answer, through a call
    // rather than a grep.** `art()` chooses at the document layer because a
    // variant is a different block; `widthRung` computes inside a definition
    // because a `paint` leaf is opaque to the engine. Those two stay where they
    // are, and neither is retrofitted to the list the engine now reads.
    const wide = art({ id: "a", text: "fallback", variants: { ascii: "WIDE FORM" } }, FULL_CAPS, 40);
    expect(wide.kind, "a form that fits is the variant").toBe("raw");
    const narrow = art({ id: "a", text: "fallback", variants: { ascii: "WIDE FORM" } }, FULL_CAPS, 4);
    expect(narrow.kind, "and one that does not falls to the text").toBe("notice");

    // `widthRung` is the leaf family's shape: features off, no list anywhere.
    const roomy = widthRung(40, { border: true, pad: true, tag: true });
    const tight = widthRung(4, { border: true, pad: true, tag: true });
    expect(roomy.frame.border, "the border survives at forty").toBe(true);
    expect(tight.frame.pad, "and the padding is shed at four").toBe(false);
  });

  it("T1.31 (C29 I18, §7b, C09 I72): a variant's minimum is measured from the form, never declared beside it", () => {
    // **The row a declared `min` would pass.** Two forms of the same content
    // whose widest rows differ by one cell must select differently at exactly
    // that one width — which is true of a measurement and true of a hand-written
    // number only until the form is edited. So the assertion is on `cells()` of
    // the chosen form, and the pair brackets the boundary.
    const eight = "12345678";
    const nine = "123456789";
    expect(cells(eight)).toBe(8);
    expect(cells(nine)).toBe(9);

    const pick = (variant: string, width: number): string =>
      (art({ id: "a", text: "fb", variants: { ascii: variant } }, FULL_CAPS, width) as { text: string }).text;

    expect(pick(nine, 9), "at its own width the form is taken").toBe(nine);
    expect(pick(nine, 8), "one cell under it, the fallback").toBe("fb");
    expect(pick(eight, 8), "and the shorter form still fits there").toBe(eight);
  });

  it("T1.32 (C29 I19, \u00a77d, C15 I5): Placement's anchored arm declares no column, and an anchored layer lands flush left at any width", () => {
    // **The field set by equality, and here the equality is the whole row.**
    // A column added beside `row` would be **silently inert** for any layer
    // that declares no width: `resolveWidth` gives such a layer the region's
    // width, and step 7's clamp then returns its `left` to zero. So no
    // assertion about a placed result could see the field arrive, and the type
    // is the only place the refusal is visible (walk A3).
    //
    // **A cross-component source assertion**, declared in
    // `test/unit/source-subjects.test.ts` so a C15 lane can look itself up
    // (F1070).
    const types = sourceOf("src/viewport/overlay/types.ts");
    const anchoredArm = /kind: "anchored";([\s\S]*?)\n {4}\}>/u.exec(types);
    expect(anchoredArm, "the anchored arm is findable").not.toBeNull();
    const members = [...(anchoredArm?.[1] ?? "").matchAll(/^\s{6}(\w+)\??:/gmu)].map((m) => m[1]);
    expect(members.sort(), "every field the anchored arm declares, by equality").toEqual(
      ["prefer", "row", "rows"].sort(),
    );

    // And the behaviour behind it, through a call. A narrow anchored layer is
    // flush left; only `centred` computes a column at all.
    const narrow = placeIn([anchored("a", 2, { row: 5, prefer: "below" }, { width: 10 })]);
    expect(narrow[0]?.width, "the layer got the width it asked for").toBe(10);
    expect(narrow[0]?.left, "and an anchored layer is flush left whatever its width").toBe(0);
    const middle = placeIn([centred("c", 2, { width: 10 })]);
    expect(middle[0]?.left, "centred is the one placement that computes a column").toBe(
      Math.floor((REGION.width - 10) / 2),
    );
  });

  it("T1.33 (C29 I19, \u00a77d): the nudge is the vertical axis's, and the horizontal is delivered by the width clamp", () => {
    // **\u00a710 states one rule for two axes and the tree has one axis of it.**
    // Removing step 7's `left` clamp outright leaves C15's unit and contract
    // suites wholly green \u2014 measured \u2014 and the reason is constructive rather
    // than corpus-shaped: `resolveWidth` bounds the width by the region, an
    // anchored layer takes `left = 0`, and a centred one takes
    // `floor((region.width - width) / 2)`, which is already inside
    // `[0, region.width - width]`. **No input reaches the clamp**, so it is a
    // guard and not a mechanism, and this row asserts the property it guards
    // together with the thing that actually delivers it.
    const wide = placeIn([centred("w", 2, { width: REGION.width + 20 })]);
    expect(wide[0]?.width, "the width clamp is what bounds the horizontal (C15 I16)").toBe(REGION.width);
    expect((wide[0]?.left ?? 0) + (wide[0]?.width ?? 0), "so no layer reaches past the region").toBe(
      REGION.width,
    );

    // The vertical nudge, which **is** a mechanism: an anchor past the bottom
    // edge has no room below, and the layer is shifted inside rather than drawn
    // off the end.
    const past = placeIn([anchored("p", 3, { row: REGION.height + 4, prefer: "below" })]);
    expect(past[0]?.top ?? -1, "the top is inside the region").toBeGreaterThanOrEqual(0);
    expect((past[0]?.top ?? 0) + (past[0]?.height ?? 0), "and so is the bottom edge").toBeLessThanOrEqual(
      REGION.height,
    );

    // And the asymmetry the design does not state: the vertical flips before it
    // clamps, so a layer with no room below its anchor lands *above* it \u2014 a
    // move the horizontal has no equivalent of, because there is no `prefer`
    // across columns.
    const flipped = placeIn([anchored("f", 6, { row: REGION.height - 1, prefer: "below" })]);
    expect((flipped[0]?.top ?? 0) + (flipped[0]?.height ?? 0), "it went above the anchor").toBeLessThanOrEqual(
      REGION.height - 1,
    );
    expect(flipped[0]?.truncated, "and it fitted there, so nothing was clipped").toBe(false);
  });

  // **The spec commit's rows, before the field exists** (SP9). C29 I21: a
  // sticky child is excluded from its container's scroll offset and drawn last.
  it.todo(
    "T1.37 (C29 I21, \u00a77c, F1234): a clipping container at an offset draws its sticky header at its own edge and its body from the offset, and the same tree without the field draws the body alone — read as a frame, because a sticky child's rect is its flow rect either way — not deferred on a component: Box.sticky is not built",
  );
  it.todo(
    "T1.38 (C29 I21, \u00a77c, F1234): a sticky child declared before its scrolling siblings is drawn over by none of them — the paint-order half, which no assertion about a position can see — not deferred on a component: Box.sticky is not built",
  );

  it("T1.34 (C29 I20, \u00a77e, C22 I100, C09 I61): the engine declares no cache, and the memo holds one slot per block", () => {
    // **The engine's own sources, by equality over the directory.** An absence
    // check on one file is satisfied by a cache in the next one along, and the
    // claim is about the component rather than about `solve.ts`.
    const files = readdirSync("src/presentation/layout").filter((f) => f.endsWith(".ts"));
    expect(files.sort(), "every source the engine has, by equality").toEqual(
      ["compose.ts", "distribute.ts", "index.ts", "solve.ts", "types.ts"].sort(),
    );
    for (const f of files) {
      const text = sourceOf(`src/presentation/layout/${f}`);
      expect(/\b(?:new\s+(?:Weak)?Map\b|memo)/u.test(text), `${f} declares no cache`).toBe(false);
    }

    // **The memo's shape, through a call.** One memo across three asks: 80, 60,
    // 80. A map over widths and a single slot agree on every ask that does not
    // revisit a width \u2014 which is every ask a static run makes \u2014 so the third
    // ask is the whole of the assertion.
    const kit = measurable({ capabilities: FULL_CAPS });
    const subject = block({
      kind: "panel",
      id: "pn",
      title: "a panel",
      children: [
        block({
          kind: "notice",
          id: "nt",
          tone: "info",
          text: "a line of prose long enough to wrap at sixty columns and not at eighty, which is the point of it",
        }),
      ],
    });
    const memo: MeasureMemo = new WeakMap();
    const ask = (w: number): number => kit.registry.measureSequence([subject], w, memo);

    ask(80);
    expect(memo.get(subject)?.width, "the slot carries the width it was asked at").toBe(80);
    ask(60);
    expect(memo.get(subject)?.width, "and the next ask replaces it rather than joining it").toBe(60);
    ask(80);
    expect(memo.get(subject)?.width, "so returning to a width is a miss, not a hit").toBe(80);

    // **And what the slot holds is the committed figure** (C09 I61): the same
    // number the render path uses, not a natural size with the cap applied
    // after each read. Asserted against the public measure rather than against
    // a constant, so it moves with the definition.
    expect(memo.get(subject)?.rows, "the stored rows are the ones the registry answers").toBe(ask(80));
  });

  it("T1.35 (C29 I18, \u00a77b): pass 2 takes the first form that fits and the last regardless, before the children are distributed", () => {
    // Three forms of one row, nine, five and two cells wide, with a fallback of
    // one. **Each form's minimum is its own pass-1 width** and nothing declares
    // a number (C09 I72), so the selection boundaries are the forms' own widths.
    const ladder = (): Box => ({
      id: "rung",
      representations: [rows("wide", "123456789"), rows("mid", "12345"), rows("narrow", "12")],
      children: { kind: "rows", rows: ["!"] },
    });

    const drawn = (w: number): readonly string[] => compose(layout(ladder(), w)).map((r) => r.trimEnd());
    expect(drawn(9), "at its own width the preferred form stands").toEqual(["123456789"]);
    expect(drawn(8), "one cell under it, the next form").toEqual(["12345"]);
    expect(drawn(5), "and at exactly five it is still that one").toEqual(["12345"]);
    expect(drawn(4), "under five, the third").toEqual(["12"]);
    expect(drawn(1), "and under every form, the box's own children \u2014 the fallback is structural").toEqual(["!"]);

    // **The ordering half, which is the load-bearing one.** A chooser running
    // after distribution would hand the slack of one form to the children of
    // another: here the row's two children are distributed inside the chosen
    // form, so the widths belong to the form that was actually taken.
    const shared: Box = {
      id: "outer",
      direction: "row",
      width: { kind: "fixed", n: 20 },
      representations: [
        {
          id: "two",
          direction: "row",
          children: [
            { id: "a", width: { kind: "grow" }, children: { kind: "rows", rows: ["aaaaaaaaaaaaaaa"] } },
            { id: "b", width: { kind: "grow" }, children: { kind: "rows", rows: ["bbbbbbbbbbbbbbb"] } },
          ],
        },
      ],
      children: { kind: "rows", rows: ["fallback"] },
    };
    const solved = layout(shared, 20);
    expect(solved.children.map((c) => c.rect.width), "the grown children share the chosen form's width").toEqual([
      10, 10,
    ]);
    expect(solved.id, "and the id is the box's, not the form's").toBe("outer");
  });

  it("T1.36 (C29 I18, \u00a77b, C09 I72): a form's minimum is its own fitted width, and the content is the form's", () => {
    // **The row a declared `min` would pass.** Two forms whose widest rows
    // differ by one cell must select differently at exactly that one width —
    // true of a measurement and true of a hand-written number only until the
    // form is edited.
    const pick = (form: string, w: number): readonly string[] =>
      compose(layout({ id: "p", representations: [rows("f", form)], children: { kind: "rows", rows: ["\u00b7"] } }, w)).map(
        (r) => r.trimEnd(),
      );
    expect(pick("123456789", 9), "at its own width the form is taken").toEqual(["123456789"]);
    expect(pick("123456789", 8), "one cell under it, the fallback").toEqual(["\u00b7"]);
    expect(pick("12345678", 8), "and the shorter form still fits there").toEqual(["12345678"]);

    // **The content is the form's and the id is the box's** — direction,
    // padding and children all travel with the chosen form, and the solved tree
    // answers to the outer name whichever was taken.
    const box: Box = {
      id: "outer",
      representations: [{ id: "roomy", padding: { l: 2 }, children: { kind: "rows", rows: ["ab"] } }],
      children: { kind: "rows", rows: ["x"] },
    };
    const roomy = layout(box, 10);
    expect(roomy.id, "the outer id survives the choice").toBe("outer");
    expect(compose(roomy).map((r) => r.trimEnd()), "the form's padding is applied").toEqual(["  ab"]);
    const tight = layout(box, 1);
    expect(tight.id, "and the same id when the fallback is taken").toBe("outer");
    expect(compose(tight).map((r) => r.trimEnd()), "with no padding, because that was the form's").toEqual(["x"]);
  });

  it("T1.17 (C29 I17): the module header names the clay port and the version read, and DEPENDENCIES.md carries the refusal", () => {
    // **Asserted on the source**, because a licence condition nobody reads is
    // how one gets found at publication. Zlib's only real condition is the
    // acknowledgement.
    for (const file of ["index.ts", "types.ts", "distribute.ts", "solve.ts"]) {
      const source = readFileSync(`src/presentation/layout/${file}`, "utf8");
      expect(source, file).toMatch(/nicbarker\/clay/u);
    }
    const barrel = readFileSync("src/presentation/layout/index.ts", "utf8");
    expect(barrel).toMatch(/Zlib/u);
    expect(barrel).toMatch(/v0\.14/u);

    // **The refusal is a row rather than a silence**: *we wrote our own* and
    // *we considered theirs and measured why not* read identically from
    // outside, and only one of them survives being asked.
    const deps = readFileSync("DEPENDENCIES.md", "utf8");
    const row = deps.split("\n").find((line) => line.includes("nicbarker/clay"));
    expect(row, "DEPENDENCIES.md § What is deliberately NOT a dependency").toBeDefined();
    expect(row).toMatch(/Not installed|layout engine/u);
    expect(deps).not.toMatch(/"clay":/u);
  });
});
