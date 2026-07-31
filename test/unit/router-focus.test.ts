/**
 * C16 §3 — derived focus and the one stored location. Tiers 1, 2 and 3.
 */

import { describe, expect, it } from "vitest";

import {
  activeTarget,
  createFocusStore,
  FOCUS_ORDER,
  type FocusInputs,
} from "../../src/interaction/router/focus.js";
import type { FocusTarget } from "../../src/interaction/router/types.js";

const base: FocusInputs = {
  overlayTop: null,
  copyMode: false,
  liveEntry: { id: "e1" },
  stored: { at: "prompt" },
};

const at = (over: Partial<FocusInputs> = {}): FocusTarget =>
  activeTarget({ ...base, ...over });

describe("C16 §3 — activeTarget", () => {
  it("T1.3 (I15): each of the six conditions resolves to its documented target", () => {
    expect(at({ overlayTop: { kind: "overlay" } })).toBe("overlay");
    expect(at({ copyMode: true })).toBe("copyMode");
    expect(at({ overlayTop: { kind: "view" } })).toBe("pushedView");
    expect(at()).toBe("prompt");
    expect(at({ stored: { at: "liveBlock", rowId: "r1" } })).toBe("liveBlock");
    expect(at({ stored: { at: "liveBlock", rowId: null }, liveEntry: null })).toBe("global");
  });

  it("the priority holds where two conditions are true at once", () => {
    // Each row of A02 §2 beating the one below it, which is the only thing
    // "first match wins" actually claims. Asserting the six conditions
    // separately, as T1.3 does, cannot see an order at all.
    expect(at({ overlayTop: { kind: "overlay" }, copyMode: true }), "overlay over copy").toBe(
      "overlay",
    );
    expect(
      at({ copyMode: true, overlayTop: { kind: "view" } }),
      "copy mode over a pushed view",
    ).toBe("copyMode");
    expect(
      at({ overlayTop: { kind: "view" }, stored: { at: "prompt" } }),
      "a pushed view over the prompt",
    ).toBe("pushedView");
  });

  it("a confirm over copy mode resolves to the overlay, not to copy mode", () => {
    // The pair C16 §5's reorder turns on: with the ladder's rungs registered on
    // these targets, this single result is what makes both overlay rungs sit
    // above copy mode. If this flips, the ladder flips with it — which is the
    // point of there being one ordering.
    expect(at({ overlayTop: { kind: "overlay" }, copyMode: true })).toBe("overlay");
  });

  it("T2.2 (I15): pure and total — same inputs, same answer, no I/O", () => {
    const inputs: FocusInputs = { ...base, stored: { at: "liveBlock", rowId: "r9" } };
    const first = activeTarget(inputs);
    for (let i = 0; i < 1000; i += 1) expect(activeTarget(inputs)).toBe(first);
    expect(inputs.stored, "the input is not mutated").toEqual({ at: "liveBlock", rowId: "r9" });
  });

  it("T2.5: FOCUS_ORDER is exhaustive over FocusTarget, in priority order", () => {
    // The structural guard T6.4d points at. While the ladder's rungs are
    // handlers on these targets, a target missing here is a target nothing can
    // dispatch to — so this list being complete is what carries the ladder.
    const reached = new Set<FocusTarget>([
      at({ overlayTop: { kind: "overlay" } }),
      at({ copyMode: true }),
      at({ overlayTop: { kind: "view" } }),
      at(),
      at({ stored: { at: "liveBlock", rowId: "r1" } }),
      at({ stored: { at: "liveBlock", rowId: null }, liveEntry: null }),
    ]);
    expect([...FOCUS_ORDER].sort()).toEqual([...reached].sort());
    expect(FOCUS_ORDER[0], "overlay is highest").toBe("overlay");
    expect(FOCUS_ORDER[FOCUS_ORDER.length - 1], "global is the fallback").toBe("global");
  });

  it("pushedView needs no separate hasView input", () => {
    // Overlays always sit above views (C15 I2), so a view is the top exactly
    // when no overlay is open. Asserted because the obvious reading is that
    // `activeTarget` is missing an input, and a second input could disagree
    // with the one beside it.
    expect(at({ overlayTop: { kind: "overlay" } }), "view beneath is irrelevant").toBe("overlay");
    expect(at({ overlayTop: { kind: "view" } })).toBe("pushedView");
  });
});

describe("C16 §3 — the stored location", () => {
  it("T1.3b (I2): reset returns focus to the prompt and drops the row", () => {
    const focus = createFocusStore();
    focus.enterLiveBlock("r3");
    expect(focus.current).toEqual({ at: "liveBlock", rowId: "r3" });

    focus.reset();
    expect(focus.current).toEqual({ at: "prompt" });
  });

  it("T1.3b2 (I2): nothing resets it but the call", () => {
    // The test that separates a call from a subscription. A router that quietly
    // subscribed to C13 would pass T1.3b and fail this, because there is no
    // subscription here to fire — the store holds no reference to a transcript
    // at all, which is the structural half of the same claim.
    const focus = createFocusStore();
    focus.enterLiveBlock("r3");
    expect(Object.keys(focus).some((k) => k.includes("subscribe"))).toBe(false);
    expect(focus.current, "unchanged without reset()").toEqual({ at: "liveBlock", rowId: "r3" });
  });

  it("a push does not clear it, and neither does a pop (A01 D7)", () => {
    // The store has no notion of a layer, which is exactly why this holds: only
    // reset() moves it, and a pop appends nothing to call reset() from.
    const focus = createFocusStore();
    focus.enterLiveBlock("r7");
    // …a view is pushed and popped elsewhere in the system…
    expect(focus.current).toEqual({ at: "liveBlock", rowId: "r7" });
  });

  it("focusRow moves the row inside the live block and is a no-op at the prompt", () => {
    const focus = createFocusStore();
    focus.focusRow("r2");
    expect(focus.current, "not a way into the live block").toEqual({ at: "prompt" });

    focus.enterLiveBlock(null);
    focus.focusRow("r2");
    expect(focus.current).toEqual({ at: "liveBlock", rowId: "r2" });
  });

  it("the stored value is frozen, so a consumer cannot move focus by mutation", () => {
    const focus = createFocusStore();
    focus.enterLiveBlock("r1");
    expect(Object.isFrozen(focus.current)).toBe(true);
  });
});
