// C15 tier 3 — edge cases. The flip, the clamps, the degenerate regions.
//
// Three of these are read as **frames** rather than as numbers, and that is not
// belt and braces. The two-row-prompt defect (T3.5b) produces a `Placed` that is
// inside the region, non-negative and untruncated while the menu sits on the
// line it belongs to: every assertion about the numbers agrees, because the
// numbers do agree with each other. Only the drawn frame disagrees.
import { describe, expect, it } from "vitest";

import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import { OverlayError } from "../../src/viewport/overlay/index.js";
import type { OverlayChange, Region } from "../../src/viewport/overlay/index.js";
import { REGION, anchored, centred, frame, placeIn, registry, rowsOf, view, peek } from "../support/overlay.js";

const manager = () => createOverlayManager({ registry });

describe("C15 edge — the stack's refusals", () => {
  it("T3.1: pop on empty → null, no throw", () => {
    expect(manager().pop()).toBeNull();
  });

  it("T3.2: dismiss with an unknown id → no-op", () => {
    const m = manager();
    m.push(centred("a", 3));
    m.dismiss("nothing-of-the-sort");
    expect(m.stack.map((l) => l.id)).toEqual(["a"]);
  });

  it("T3.3 (I1): push(view) while a view exists → rejected, stack unchanged", () => {
    const m = manager();
    m.push(view("dash"));
    expect(() => m.push(view("logs"))).toThrow(OverlayError);
    expect(m.stack.map((l) => l.id)).toEqual(["dash"]);
  });

  it("T3.4 (I1): push(view) while overlays exist → rejected", () => {
    const m = manager();
    m.push(centred("confirm", 3));
    expect(() => m.push(view("dash"))).toThrow(OverlayError);
    expect(m.hasView).toBe(false);
  });

  it("T3.4b (I1, §2a): push(view) while only a peek exists → rejected, as onto any non-empty stack", () => {
    const m = manager();
    m.push(peek("p", 1, { row: 5, prefer: "below" }));
    expect(() => m.push(view("dash"))).toThrow(OverlayError);
    expect(m.hasView).toBe(false);
    expect(m.stack.map((l) => l.id)).toEqual(["p"]);
  });

  it("T3.14: twenty nested overlays keep LIFO order", () => {
    const m = manager();
    for (let i = 0; i < 20; i += 1) m.push(centred(`o${i}`, 2));
    expect(m.stack).toHaveLength(20);
    for (let i = 19; i >= 0; i -= 1) expect(m.pop()?.id).toBe(`o${i}`);
  });

  it("T3.15: disposing twice is a no-op the second time", () => {
    const m = manager();
    const handle = m.push(centred("a", 3));
    m.push(centred("b", 3));

    handle[Symbol.dispose]();
    handle[Symbol.dispose]();
    expect(m.stack.map((l) => l.id)).toEqual(["b"]);
  });

  it("T3.16: a disposable for a layer already popped removes nothing else", () => {
    const m = manager();
    const handle = m.push(centred("a", 3));
    m.pop();
    m.push(centred("b", 3));

    handle[Symbol.dispose]();
    expect(m.stack.map((l) => l.id)).toEqual(["b"]);
  });

  it("T3.17 (I14): update with an unknown id → false, and it does not push", () => {
    const m = manager();
    const changes: OverlayChange[] = [];
    m.subscribe((c) => changes.push(c));

    expect(m.update("absent", { content: [] })).toBe(false);
    expect(m.stack).toEqual([]);
    expect(changes).toEqual([]);
  });
});

describe("C15 edge — the flip", () => {
  it("T3.5 (I7): two rows below and twelve above → flips above at full height", () => {
    // The control: this layer does not fit below. Without it the test passes
    // against a layer that fits either way and asserts nothing about flipping.
    const height = 8;
    const anchorRow = 12;
    expect(REGION.height - (anchorRow + 1)).toBeLessThan(height);
    expect(anchorRow).toBeGreaterThanOrEqual(height);

    const [p] = placeIn([anchored("menu", height, { row: anchorRow, prefer: "below" })]);
    expect(p?.height).toBe(height);
    expect(p?.truncated).toBe(false);
    expect(rowsOf(p!)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("T3.5b (I17): a two-row prompt — the menu touches neither of its rows", () => {
    // The defect this exists for: with a single-row anchor, *both* preferences
    // overlap a two-row prompt. Anchor 18 preferring below starts the menu on
    // row 19; anchor 19 preferring above ends it on row 18. Each produces a
    // `Placed` whose every number is consistent with every other.
    const prompt = { row: 18, rows: 2 } as const;
    const [p] = placeIn([anchored("menu", 8, { ...prompt, prefer: "below" })]);

    expect(rowsOf(p!)).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    expect(rowsOf(p!)).not.toContain(18);
    expect(rowsOf(p!)).not.toContain(19);

    // Read as a frame, because the numbers above are exactly what the wrong
    // answer also satisfies.
    const drawn = frame([p!]);
    expect(drawn[17]?.startsWith("m")).toBe(true);
    expect(drawn[18]).toBe(".".repeat(REGION.width));
    expect(drawn[19]).toBe(".".repeat(REGION.width));
  });

  it("T3.6 (I7): neither side fits → the larger one, clamped and truncated", () => {
    const region: Region = { width: 60, height: 12 };
    // `maxHeightFraction: 1`, deliberately. At the default the fraction clamp
    // caps a nine-row layer to six *before* placement, six fits above, and the
    // "neither side fits" branch is never reached — the first version of this
    // test asserted against a layer the other clamp had already resolved.
    const layer = {
      ...anchored("menu", 9, { row: 7, prefer: "below" }),
      maxHeightFraction: 1,
    };

    // The control: neither side has room for it.
    expect(7).toBeLessThan(9); // above the anchor
    expect(region.height - 8).toBeLessThan(9); // below it

    const [p] = placeIn([layer], region);
    expect(p?.truncated).toBe(true);
    expect(p?.height).toBe(7);
    expect(rowsOf(p!)).not.toContain(7);
  });

  it("T3.10: an anchor row outside the region is clamped, not vanished", () => {
    const [p] = placeIn([anchored("menu", 4, { row: 40, prefer: "below" })]);
    expect(p).toBeDefined();
    expect(p!.top).toBeGreaterThanOrEqual(0);
    expect(p!.top + p!.height).toBeLessThanOrEqual(REGION.height);
  });
});

describe("C15 edge — the clamps", () => {
  it("T3.7: taller than maxHeightFraction → clamped and truncated", () => {
    const tall = centred("help", 16);

    // The control: the same layer is untruncated in a region tall enough for
    // it. A fixture that is always truncated turns this into a tautology.
    const roomy: Region = { width: 60, height: 60 };
    expect(placeIn([tall], roomy)[0]?.truncated).toBe(false);

    const [p] = placeIn([tall]);
    expect(p?.height).toBe(10);
    expect(p?.truncated).toBe(true);
  });

  it("T3.7b (I7): the fraction clamp precedes placement, the fit clamp follows it", () => {
    // Twelve rows of content, a twenty-row region: the fraction caps it at ten
    // before either side is considered. Ten fits above row 12 and does not fit
    // below it, so the flip happens on the capped height — which is what "flip
    // before clamp" means once the two clamps are told apart.
    const [p] = placeIn([anchored("menu", 12, { row: 12, prefer: "below" })]);
    expect(p?.height).toBe(10);
    expect(rowsOf(p!)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("T3.8 (I17, I18): a one-row region places one row, over its anchor", () => {
    const region: Region = { width: 60, height: 1 };
    const [p] = placeIn([anchored("menu", 4, { row: 0, prefer: "below" })], region);

    expect(p?.height).toBe(1);
    expect(p?.top).toBe(0);
    expect(p?.truncated).toBe(true);
  });

  it("T3.8b (I18): floor(1 × 0.5) is zero, and the layer is still placed", () => {
    const region: Region = { width: 60, height: 1 };
    expect(placeIn([centred("confirm", 3)], region)).toHaveLength(1);
  });

  it("T3.9 (I16): a layer wider than the region is clamped, and left stays zero", () => {
    const [p] = placeIn([centred("wide", 3, { width: 200 })]);
    expect(p?.width).toBe(REGION.width);
    expect(p?.left).toBe(0);
  });

  it("T3.12: centring rounds down, in regions of even and odd height", () => {
    const even = placeIn([centred("c", 4)], { width: 60, height: 20 })[0];
    const odd = placeIn([centred("c", 4)], { width: 60, height: 21 })[0];
    expect(even?.top).toBe(8);
    expect(odd?.top).toBe(8);
  });
});

describe("C15 edge — nothing to draw", () => {
  it("T3.13 (I15, I5): a zero-height overlay is omitted and not dismissed", () => {
    const m = manager();
    m.push({ ...centred("menu", 0), content: [] });
    const changes: OverlayChange[] = [];
    m.subscribe((c) => changes.push(c));

    expect(m.layout(REGION)).toEqual([]);
    expect(m.stack.map((l) => l.id)).toEqual(["menu"]);
    expect(changes).toEqual([]);
  });

  it("T3.19 (I15): a menu narrowed to no candidates — omitted, still on the stack", () => {
    const m = manager();
    m.push(anchored("menu", 5, { row: 10, prefer: "below" }));
    expect(m.layout(REGION)).toHaveLength(1);

    m.update("menu", { content: [] });
    expect(m.layout(REGION)).toEqual([]);
    expect(m.top?.id).toBe("menu");
  });

  it("T3.18 (I14, I5): update changes only the updated layer's placement", () => {
    const m = manager();
    m.push(anchored("a", 3, { row: 2, prefer: "below" }));
    m.push(anchored("b", 3, { row: 12, prefer: "below" }));

    const before = m.layout(REGION);
    m.update("b", { placement: { kind: "anchored", row: 4, prefer: "below" } });
    const after = m.layout(REGION);

    expect(after[0]).toEqual(before[0]);
    expect(after[1]?.top).not.toBe(before[1]?.top);
  });
});
