// C15 tier 6 — fail-on-revert. Each names the change that makes it fail.
//
// The form is "removing X → T fails", and it is worth stating why the form
// matters here in particular: T6.2 arrived in the spec naming two tests that
// could not have failed. `push(view)` is rejected onto any non-empty stack, so
// I2 holds by construction and a sort removed entirely is a sort nothing
// notices — a fail-on-revert test that cannot fire, which is A03's vacuity
// class one level up from the rules it was written for.
import { describe, expect, it } from "vitest";

import { createOverlayManager, place, sortLayers } from "../../src/viewport/overlay/index.js";
import type { Layer, Region } from "../../src/viewport/overlay/index.js";
import { REGION, anchored, centred, placeIn, registry, rowsOf, view } from "../support/overlay.js";

describe("C15 revert — the placement rules", () => {
  it("T6.1 (I7): clamping to the room before flipping → T3.5 fails", () => {
    // The revert: `min(height, roomBelow)` before considering the other side.
    // Eight rows with two below and twelve above becomes a two-row menu, and
    // the frame is a menu "inexplicably tiny" near the bottom of the screen.
    const [p] = placeIn([anchored("menu", 8, { row: 12, prefer: "below" })]);
    expect(p?.height).toBe(8);
    expect(p!.top).toBeLessThan(12);
  });

  it("T6.2 (I2): removing the sort → T2.8 fails, and only T2.8", () => {
    // Not T1.4 or T5.3, which was this test's original claim. Neither can
    // construct a stack in the wrong order, so both pass under push order
    // alone. The revert is detectable only against a hand-built stack.
    const wrong: readonly Layer[] = [centred("confirm", 3), view("dash")];
    expect(sortLayers(wrong).map((l) => l.id)).toEqual(["dash", "confirm"]);

    // And the demonstration that push cannot reach it.
    const m = createOverlayManager({ registry });
    m.push(centred("confirm", 3));
    expect(() => m.push(view("dash"))).toThrow();
  });

  it("T6.7 (I6): an off-by-one in clamping → T2.2 fails", () => {
    const region: Region = { width: 10, height: 3 };
    for (const p of place([centred("c", 9, { width: 40 })], region, registry)) {
      expect(p.top + p.height).toBeLessThanOrEqual(region.height);
      expect(p.left + p.width).toBeLessThanOrEqual(region.width);
    }
  });

  it("T6.12 (I16): measuring at region.width → T1.14 fails", () => {
    const narrow = 20;
    const layer = {
      ...centred("c", 0, { width: narrow }),
      content: [
        {
          kind: "notice" as const,
          id: "c-0",
          tone: "info" as const,
          text: "a line long enough to wrap at twenty columns and not at sixty",
        },
      ],
    };
    expect(placeIn([layer])[0]?.height).toBe(
      registry.measureSequence(layer.content, narrow),
    );
  });

  it("T6.13 (I6): omitting left → T1.15 fails, and C16 cannot hit-test", () => {
    const [p] = placeIn([centred("c", 3, { width: 30 })]);
    expect(p?.left).toBe(15);
    // The consequence, stated as the assertion: a point inside the confirm
    // resolves to it, and one outside does not.
    const covers = (col: number) => col >= p!.left && col < p!.left + p!.width;
    expect(covers(20)).toBe(true);
    expect(covers(2)).toBe(false);
  });

  it("T6.15 (I17): computing the sides from row ± 1 → T3.5b fails", () => {
    // The revert this exists for: `row + 1` is right exactly when the anchor is
    // one row tall, and a two-row prompt is the first caller for which it is
    // not. Both the wrong answers produce a self-consistent `Placed`.
    const [p] = placeIn([anchored("menu", 8, { row: 18, rows: 2, prefer: "below" })]);
    expect(rowsOf(p!)).not.toContain(18);
    expect(rowsOf(p!)).not.toContain(19);
  });

  it("T6.16 (I18): dropping the clamp's floor → T3.8 and T3.8b fail", () => {
    // `floor(1 × 0.5)` is zero, so the region loses its overlays entirely
    // rather than showing them badly.
    const region: Region = { width: 60, height: 1 };
    expect(placeIn([centred("confirm", 3)], region)).toHaveLength(1);
    expect(placeIn([anchored("m", 3, { row: 0, prefer: "below" })], region)).toHaveLength(1);
  });
});

describe("C15 revert — the stack rules", () => {
  it("T6.3 (I1): allowing nested views → T3.3 fails", () => {
    const m = createOverlayManager({ registry });
    m.push(view("dash"));
    expect(() => m.push(view("logs"))).toThrow();
    expect(m.stack.filter((l) => l.kind === "view")).toHaveLength(1);
  });

  it("T6.4 (I3): letting Esc dismiss a confirm → T1.9 fails", () => {
    const m = createOverlayManager({ registry });
    m.push(centred("confirm", 3, { dismissable: false }));
    expect(m.pop()).toBeNull();
    expect(m.stack).toHaveLength(1);
  });

  it("T6.11 (I3): making pop search downwards → T1.9b fails", () => {
    // A stray keypress answering a question the user did not read is T6.4. This
    // is its neighbour: a stray keypress closing something else entirely, while
    // the question stays open over a screen that changed underneath it.
    const m = createOverlayManager({ registry });
    m.push(centred("menu", 3));
    m.push(centred("confirm", 3, { dismissable: false }));

    m.pop();
    expect(m.stack.map((l) => l.id)).toEqual(["menu", "confirm"]);
  });

  it("T6.14 (I14): widening LayerUpdate to dismissable → T1.13 fails", () => {
    const m = createOverlayManager({ registry });
    m.push(centred("confirm", 3, { dismissable: false }));
    // @ts-expect-error — the restriction's only possible form.
    m.update("confirm", { dismissable: true });
    expect(m.stack[0]?.dismissable).toBe(false);
  });

  it("T6.6 (I9): C15 writes no transcript trace — it emits and L4 composes", () => {
    const m = createOverlayManager({ registry });
    const changes: string[] = [];
    m.subscribe((c) => changes.push(`${c.kind}:${c.id}`));

    m.push(view("logs"));
    m.pop();

    // What L4 composes the one-line trace from (A01 D7). The manager has no
    // idea what a logs view was showing, which is the reason the trace is not
    // its job.
    expect(changes).toEqual(["push:logs", "pop:logs"]);
  });

  it("T6.9 (I5): caching layout across regions → T2.1 fails after a resize", () => {
    const m = createOverlayManager({ registry });
    m.push(centred("c", 4));

    const wide = m.layout(REGION);
    const narrow = m.layout({ width: 30, height: 10 });
    expect(narrow[0]?.width).not.toBe(wide[0]?.width);
    expect(m.layout(REGION)).toEqual(wide);
  });
});
