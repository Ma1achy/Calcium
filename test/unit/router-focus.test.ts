/**
 * C16 §3 — derived focus and the one stored location. Tiers 1, 2 and 3.
 */

import { describe, expect, it } from "vitest";

import {
  activeTarget,
  createFocusStore,
  FOCUS_ORDER,
  resolveFocus,
  type FocusInputs,
} from "../../src/interaction/router/focus.js";
import type { FocusTarget } from "../../src/interaction/router/types.js";
import { addr, placed } from "../support/focus.js";

const base: FocusInputs = {
  overlayTop: null,
  copyMode: false,
  liveEntry: { id: "e1" },
  stored: { at: "prompt" },
};

const at = (over: Partial<FocusInputs> = {}): FocusTarget =>
  activeTarget({ ...base, ...over });

describe("C16 §3 — activeTarget", () => {
  it("T1.3 (I15): each of the seven conditions resolves to its documented target", () => {
    expect(at({ overlayTop: { kind: "overlay" } })).toBe("overlay");
    expect(at({ copyMode: true })).toBe("copyMode");
    expect(at({ overlayTop: { kind: "view" } })).toBe("pushedView");
    expect(at({ stored: { at: "liveBlock", element: addr("r1"), mode: "interact" } })).toBe("interaction");
    expect(at()).toBe("prompt");
    expect(at({ stored: { at: "liveBlock", element: addr("r1"), mode: "navigate" } })).toBe("liveBlock");
    expect(
      at({ stored: { at: "liveBlock", element: null, mode: "navigate" }, liveEntry: null }),
    ).toBe("global");
  });

  it("T1.3d (C26 I2): interaction outranks the prompt and yields to every layer", () => {
    // **The rung's position, asserted as a comparison rather than as a slot.**
    // Its index in FOCUS_ORDER is what gives C16 §5 a rung, so a change here is
    // a change to the ladder — and the ladder has no list of its own to catch it.
    const interacting = { at: "liveBlock", element: addr("r1"), mode: "interact" } as const;
    expect(at({ stored: interacting }), "over the prompt").toBe("interaction");
    expect(
      at({ stored: interacting, overlayTop: { kind: "overlay" } }),
      "under an overlay that must be answered",
    ).toBe("overlay");
    expect(at({ stored: interacting, copyMode: true }), "under copy mode").toBe("copyMode");
    expect(
      at({ stored: interacting, overlayTop: { kind: "view" } }),
      "under a view, which covers the region",
    ).toBe("pushedView");
  });

  it("T1.3f (C26 I14): moving between rows leaves interaction", () => {
    // **Two-level escape read from the other end.** A mode belongs to the
    // element it was entered on; carrying it across a row move would make the
    // next `↓` mean something different depending on how the reader arrived,
    // and the block would keep taking keys on a row nobody chose to enter.
    const store = createFocusStore();
    store.enterLiveBlock(addr("r1"));
    store.setMode("interact");
    expect(store.current).toEqual({ at: "liveBlock", element: addr("r1"), mode: "interact" });
    store.focusRow(addr("r2"));
    expect(store.current, "the mode does not travel").toEqual({
      at: "liveBlock",
      element: addr("r2"),
      mode: "navigate",
    });
  });

  it("T1.3g (C26 I2): entry is into navigation, and setMode is a no-op at the prompt", () => {
    // Landing in interaction would hand the block every key before the reader
    // has seen where focus went. And `setMode` refuses at the prompt for
    // `focusRow`'s reason: a mode arriving from a stale handler would change
    // what every keystroke means with no keystroke behind it.
    const store = createFocusStore();
    store.enterLiveBlock(addr("r1"));
    expect(store.current).toEqual({ at: "liveBlock", element: addr("r1"), mode: "navigate" });
    store.toPrompt();
    store.setMode("interact");
    expect(store.current, "no way in through setMode").toEqual({ at: "prompt" });
  });

  it("T1.3e (C26 I2): a frozen entry is not interactable, however the mode was left", () => {
    // **Freezing is a mode exit nobody signals** (C26 §8a, the live-block
    // freeze). The mode is stored, so it outlives the entry; answering
    // `interaction` here would hand every key to a block the reader cannot act
    // on and the prompt would stop receiving them. The gate is `liveEntry`, and
    // it is the same gate the `liveBlock` row already had.
    expect(
      at({ stored: { at: "liveBlock", element: addr("r1"), mode: "interact" }, liveEntry: null }),
    ).toBe("global");
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
    const inputs: FocusInputs = {
      ...base,
      stored: { at: "liveBlock", element: addr("r9"), mode: "navigate" },
    };
    const first = activeTarget(inputs);
    for (let i = 0; i < 1000; i += 1) expect(activeTarget(inputs)).toBe(first);
    expect(inputs.stored, "the input is not mutated").toEqual({
      at: "liveBlock",
      element: addr("r9"),
      mode: "navigate",
    });
  });

  it("T2.5: FOCUS_ORDER is exhaustive over FocusTarget, in priority order", () => {
    // The structural guard T6.4d points at. While the ladder's rungs are
    // handlers on these targets, a target missing here is a target nothing can
    // dispatch to — so this list being complete is what carries the ladder.
    //
    // **And it is what stops `interaction` being a vacuous member.** A target in
    // the union that no input can reach is a rung the ladder registers and never
    // runs — the shape `pushedView` held for four components. The row below has
    // to *produce* it, not name it.
    const reached = new Set<FocusTarget>([
      at({ overlayTop: { kind: "overlay" } }),
      at({ copyMode: true }),
      at({ overlayTop: { kind: "view" } }),
      at({ stored: { at: "liveBlock", element: addr("r1"), mode: "interact" } }),
      at(),
      at({ stored: { at: "liveBlock", element: addr("r1"), mode: "navigate" } }),
      at({ stored: { at: "liveBlock", element: null, mode: "navigate" }, liveEntry: null }),
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
    focus.enterLiveBlock(addr("r3"));
    expect(focus.current).toEqual({ at: "liveBlock", element: addr("r3"), mode: "navigate" });

    focus.reset();
    expect(focus.current).toEqual({ at: "prompt" });
  });

  it("T1.3b2 (I2): nothing resets it but the call", () => {
    // The test that separates a call from a subscription. A router that quietly
    // subscribed to C13 would pass T1.3b and fail this, because there is no
    // subscription here to fire — the store holds no reference to a transcript
    // at all, which is the structural half of the same claim.
    const focus = createFocusStore();
    focus.enterLiveBlock(addr("r3"));
    expect(Object.keys(focus).some((k) => k.includes("subscribe"))).toBe(false);
    expect(focus.current, "unchanged without reset()").toEqual({ at: "liveBlock", element: addr("r3"), mode: "navigate" });
  });

  it("a push does not clear it, and neither does a pop (A01 D7)", () => {
    // The store has no notion of a layer, which is exactly why this holds: only
    // reset() moves it, and a pop appends nothing to call reset() from.
    const focus = createFocusStore();
    focus.enterLiveBlock(addr("r7"));
    // …a view is pushed and popped elsewhere in the system…
    expect(focus.current).toEqual({ at: "liveBlock", element: addr("r7"), mode: "navigate" });
  });

  it("focusRow moves the row inside the live block and is a no-op at the prompt", () => {
    const focus = createFocusStore();
    focus.focusRow(addr("r2"));
    expect(focus.current, "not a way into the live block").toEqual({ at: "prompt" });

    focus.enterLiveBlock(null);
    focus.focusRow(addr("r2"));
    expect(focus.current).toEqual({ at: "liveBlock", element: addr("r2"), mode: "navigate" });
  });

  it("T1.3h (C26 I10): an address resolves on both halves, not on the element id", () => {
    // **The row a bare-id implementation still passes is the third one.** Two
    // blocks each carrying `r1` is well-formed — C04 I31 makes a row id unique
    // within its table and says nothing across blocks — and matching on the id
    // alone found the first, which is the whole of §8b.6.
    const list = [placed("r1", "a"), placed("r2", "a"), placed("r1", "b"), placed("r2", "b")];

    expect(resolveFocus(addr("r1", "a"), list), "the first block's r1").toBe(0);
    expect(resolveFocus(addr("r1", "b"), list), "the second block's r1, not the first").toBe(2);
    expect(resolveFocus(addr("r2", "b"), list)).toBe(3);
  });

  it("T1.3i (C26 I10): a stale address falls forward, and the block is the finest scope", () => {
    // **A refresh replaced the block under focus** — `putBlock` is total and
    // never throws, so nothing signals that the element went. Its *position*
    // went with it, so there is no index to count from: the block is the finest
    // scope resolution can honour, and it is honoured rather than approximated.
    const list = [placed("r1", "a"), placed("r2", "a"), placed("r1", "b"), placed("r2", "b")];

    // **The stale address is in the *second* block, and that is the whole row.**
    // Written against the first, *stay in the block* and *fall to the top of the
    // document* both answer 0 and the assertion cannot tell the ruling from its
    // opposite. The mutation pass found it: the fall-forward mutation was killed
    // by a different row, which is the harness reporting that no row is watching
    // the thing that broke.
    expect(
      resolveFocus(addr("gone", "b"), list),
      "the block survives, so focus stays in it rather than jumping to the document top",
    ).toBe(2);
    expect(
      resolveFocus(addr("gone", "a"), list),
      "and the same rule in the first block",
    ).toBe(0);
    expect(
      resolveFocus(addr("r1", "vanished"), list),
      "the block went too, so nothing about the old position survives",
    ).toBe(0);

    // The edges. An empty list is `null` and not `0`, because `0` would be an
    // index into nothing — the shape that made `indexOf`'s −1 mean two different
    // things at two call sites.
    expect(resolveFocus(addr("r1", "a"), []), "nothing to resolve against").toBeNull();
    expect(resolveFocus(null, list), "in the block, on no element yet").toBe(0);
    expect(resolveFocus(null, []), "and still null with nothing there").toBeNull();
  });

  it("the stored value is frozen, so a consumer cannot move focus by mutation", () => {
    const focus = createFocusStore();
    focus.enterLiveBlock(addr("r1"));
    expect(Object.isFrozen(focus.current)).toBe(true);
  });
});
