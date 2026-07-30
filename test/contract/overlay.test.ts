// C15 tier 2 — contract. The properties, over sequences rather than calls.
//
// T2.4 is the one that matters and the reason it is a sequence: every C15
// invariant constrains a single call, and none of them constrains the history.
// C12, C13 and C14 each hid a defect in exactly that gap — a rule right at the
// moment it was written and silent about the path that follows.
import { describe, expect, it } from "vitest";

import { createOverlayManager, place, sortLayers } from "../../src/viewport/overlay/index.js";
import type { Layer, Region } from "../../src/viewport/overlay/index.js";
import { REGION, anchored, centred, placeIn, registry, rows, view } from "../support/overlay.js";

const manager = () => createOverlayManager({ registry });

/** Deterministic, so a failure is reproducible without a seed in the message. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

describe("C15 contract — placement is a function", () => {
  it("T2.1 (I5): a hundred calls on one stack and region are deeply equal", () => {
    const m = manager();
    m.push(view("dash"));
    m.push(anchored("menu", 5, { row: 10, prefer: "below" }));
    m.push(centred("confirm", 3, { width: 30 }));

    const first = m.layout(REGION);
    for (let i = 0; i < 100; i += 1) expect(m.layout(REGION)).toEqual(first);
  });

  it("T2.1b (I5): update is what makes T2.1 assertable", () => {
    // With content as a thunk the same stack and region could legitimately
    // return two answers, and the assertion above would be about C15's code
    // rather than its output. Layers hold values; the stack is what changes.
    const m = manager();
    m.push(anchored("menu", 5, { row: 10, prefer: "below" }));
    const before = m.layout(REGION);

    m.update("menu", { content: rows(9, "menu") });
    expect(m.layout(REGION)).not.toEqual(before);
    expect(m.layout(REGION)).toEqual(m.layout(REGION));
  });

  it("T2.3 (I4): a layer's content is Block[], and a React element is rejected", () => {
    const element = { type: "div", props: {}, key: null } as const;
    // **Annotated `Layer`, and that is the whole test.** Without the annotation
    // the object literal has no contextual type, nothing is checked, and the
    // `@ts-expect-error` below reports an unused directive — which is how the
    // first version of this passed while asserting nothing about I4.
    const layer: Layer = {
      id: "react",
      kind: "overlay",
      placement: { kind: "centred" },
      // @ts-expect-error — I4: a layer carries blocks, so it is themed,
      // degradable and measurable like everything else in the transcript.
      content: [element],
      dismissable: true,
    };
    expect(layer.content).toHaveLength(1);
  });

  it("T2.2 (I6): over a corpus of stacks × regions, nothing leaves the region", () => {
    const rand = lcg(20260731);
    let checked = 0;
    for (let n = 0; n < 400; n += 1) {
      const region: Region = {
        width: 1 + Math.floor(rand() * 400),
        height: 1 + Math.floor(rand() * 200),
      };
      const stack: Layer[] = [];
      if (rand() < 0.4) stack.push(view("dash"));
      const count = Math.floor(rand() * 4);
      for (let i = 0; i < count; i += 1) {
        const height = 1 + Math.floor(rand() * 30);
        stack.push(
          rand() < 0.5
            ? anchored(`o${i}`, height, {
                row: Math.floor(rand() * 210) - 5,
                rows: 1 + Math.floor(rand() * 4),
                prefer: rand() < 0.5 ? "above" : "below",
              })
            : centred(`o${i}`, height, { width: 1 + Math.floor(rand() * 420) }),
        );
      }

      for (const p of place(stack, region, registry)) {
        checked += 1;
        expect(p.top, `top ${JSON.stringify(region)}`).toBeGreaterThanOrEqual(0);
        expect(p.left).toBeGreaterThanOrEqual(0);
        expect(p.top + p.height).toBeLessThanOrEqual(region.height);
        expect(p.left + p.width).toBeLessThanOrEqual(region.width);
      }
    }

    // The control. A corpus that placed nothing satisfies every assertion above
    // and reports four hundred regions of coverage.
    expect(checked).toBeGreaterThan(300);
  });

  it("T2.8 (I2): a hand-built stack with an overlay beneath a view is sorted", () => {
    // Unreachable through `push` — a view onto a non-empty stack is rejected —
    // which is why the sort is otherwise a piece of code nobody would notice
    // removing. Placement being pure over a stack it is handed is what makes
    // this constructible at all.
    const stack: readonly Layer[] = [centred("confirm", 3), view("dash")];
    expect(sortLayers(stack).map((l) => l.id)).toEqual(["dash", "confirm"]);
    expect(placeIn(stack).map((p) => p.layer.id)).toEqual(["dash", "confirm"]);
  });

  it("T2.9 (I17): an overlay never covers its anchor's own rows", () => {
    const rand = lcg(31072026);
    let checked = 0;
    let degenerate = 0;
    for (let n = 0; n < 400; n += 1) {
      const region: Region = { width: 60, height: 2 + Math.floor(rand() * 60) };
      const row = Math.floor(rand() * region.height);
      const span = 1 + Math.floor(rand() * 5);
      const height = 1 + Math.floor(rand() * 20);
      const layer = anchored("m", height, {
        row,
        rows: span,
        prefer: rand() < 0.5 ? "above" : "below",
      });

      const [p] = place([layer], region, registry);
      if (p === undefined) continue;

      const above = Math.min(row, region.height);
      const below = region.height - (row + span);
      // I17 is qualified: with no room on either side there is nowhere else to
      // be, and covering the anchor beats vanishing (T3.8).
      if (above <= 0 && below <= 0) {
        degenerate += 1;
        continue;
      }

      checked += 1;
      for (let r = p.top; r < p.top + p.height; r += 1) {
        expect(r >= row && r < row + span, `covered anchor row ${r}`).toBe(false);
      }
    }

    // The control, and it guards a real risk: the exemption above is a
    // `continue`, so a corpus drifting entirely into the degenerate case would
    // assert nothing and pass. Both counts are checked, because a corpus with
    // no degenerate cases is not exercising the exemption either.
    expect(checked).toBeGreaterThan(300);
    expect(degenerate).toBeGreaterThan(0);
  });
});

describe("C15 contract — the stack over a history", () => {
  it("T2.4 (I1, I2, I14): a thousand random operations, asserted after every step", () => {
    const rand = lcg(15);
    const m = manager();
    let seq = 0;

    for (let step = 0; step < 1000; step += 1) {
      const ids = m.stack.map((l) => l.id);
      const roll = rand();

      try {
        if (roll < 0.35) {
          m.push(centred(`o${(seq += 1)}`, 1 + Math.floor(rand() * 6)));
        } else if (roll < 0.45) {
          m.push(view(`v${(seq += 1)}`));
        } else if (roll < 0.65) {
          m.pop();
        } else if (roll < 0.8 && ids.length > 0) {
          m.dismiss(ids[Math.floor(rand() * ids.length)]!);
        } else if (ids.length > 0) {
          m.update(ids[Math.floor(rand() * ids.length)]!, {
            content: rows(1 + Math.floor(rand() * 5), "u"),
          });
        }
      } catch {
        // A rejected `push(view)` is a legitimate outcome, not a failure — and
        // the invariants below must hold across it, which is the point of
        // asserting inside the loop rather than after it.
      }

      const views = m.stack.filter((l) => l.kind === "view");
      expect(views.length, `step ${step}`).toBeLessThanOrEqual(1);

      const firstOverlay = m.stack.findIndex((l) => l.kind === "overlay");
      const lastView = m.stack.map((l) => l.kind).lastIndexOf("view");
      if (firstOverlay !== -1 && lastView !== -1) expect(lastView).toBeLessThan(firstOverlay);

      expect(new Set(m.stack.map((l) => l.id)).size).toBe(m.stack.length);
      expect(m.top).toBe(m.stack.at(-1) ?? null);
      expect(m.hasView).toBe(views.length > 0);
    }
  });

  it("T2.7: every OverlayChange variant is emitted, including both dismiss reasons", () => {
    const m = manager();
    const kinds: string[] = [];
    const reasons: string[] = [];
    m.subscribe((c) => {
      kinds.push(c.kind);
      if (c.kind === "dismiss") reasons.push(c.reason);
    });

    m.push(centred("a", 3));
    m.update("a", { content: rows(2, "a") });
    m.pop();
    m.push(centred("b", 3));
    m.dismiss("b");
    m.push(centred("c", 3));
    // The second reason is emitted by a caller passing it, which is the whole
    // of I10: C15 records the reason and never derives it.
    m.dismiss("c", "anchorEvicted");

    expect(new Set(kinds)).toEqual(new Set(["push", "pop", "content", "dismiss"]));
    expect(reasons).toEqual(["explicit", "anchorEvicted"]);
  });
});
