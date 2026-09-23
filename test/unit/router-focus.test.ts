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
import { readdirSync, readFileSync } from "node:fs";
import { addr, placed } from "../support/focus.js";

const base: FocusInputs = {
  overlayTop: null,
  copyMode: false,
  attachedChild: false,
  liveEntry: { id: "e1" },
  stored: { at: "prompt" },
};

const at = (over: Partial<FocusInputs> = {}): FocusTarget =>
  activeTarget({ ...base, ...over });

describe("C16 §3 — activeTarget", () => {
  it("T1.3 (I15, R-COR-002): each of the seven conditions resolves to its documented target", () => {
    expect(at({ overlayTop: { kind: "overlay" } })).toBe("overlay");
    expect(at({ copyMode: true })).toBe("copyMode");
    expect(at({ overlayTop: { kind: "view" } })).toBe("pushedView");
    expect(at({ stored: { at: "liveBlock", entryId: "e1", element: addr("r1"), anchor: null, mode: "interact" } })).toBe("interaction");
    expect(at()).toBe("prompt");
    expect(at({ stored: { at: "liveBlock", entryId: "e1", element: addr("r1"), anchor: null, mode: "navigate" } })).toBe("liveBlock");
    // **`liveBlock` and not `global`, amended in M5** (R-COR-002, C16 §3a W1).
    // The row read `global`, so with focus stored in the transcript the owner was
    // `global` while nothing ran and `liveBlock` the moment an entry appeared —
    // a content arrival moving the keyboard's owner, which is the one thing
    // R-COR-002 forbids. Standing in the transcript is not a thing that stops
    // being true because the last command finished.
    expect(
      at({ stored: { at: "liveBlock", entryId: "e1", element: null, anchor: null, mode: "navigate" }, liveEntry: null }),
    ).toBe("liveBlock");
  });

  it("T1.3g (R-COR-002, C16 §3a W1): an arrival changes the drawing and never the owner", () => {
    // **The row the ladder had no shape for.** Every assertion above names the
    // owner for a *state*; this names it across a *transition*, which is the only
    // way a rule about what an arrival may not do can be checked at all. The two
    // calls differ on `liveEntry` alone.
    const inTranscript = { at: "liveBlock", entryId: "e1", element: null, anchor: null, mode: "navigate" } as const;
    const quiet = at({ stored: inTranscript, liveEntry: null });
    const arrived = at({ stored: inTranscript, liveEntry: { id: "e2" } });
    expect(arrived, "content arrived and the owner did not move").toBe(quiet);

    // **And the control, which is the other half of R-COR-002**: a *question*
    // arriving is an ownership request and must raise the rung, so an arrival
    // that is one does move the owner. A row asserting only the first half would
    // pass on an `activeTarget` that ignored its inputs entirely.
    expect(at({ stored: inTranscript, overlayTop: { kind: "overlay" } }), "a question is an ownership request").toBe(
      "overlay",
    );
  });

  it("T1.3d (C26 I2): interaction outranks the prompt and yields to every layer", () => {
    // **The rung's position, asserted as a comparison rather than as a slot.**
    // Its index in FOCUS_ORDER is what gives C16 §5 a rung, so a change here is
    // a change to the ladder — and the ladder has no list of its own to catch it.
    const interacting = { at: "liveBlock", entryId: "e1", element: addr("r1"), anchor: null, mode: "interact" } as const;
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
    store.enterLiveBlock("e1", addr("r1"));
    store.setMode("interact");
    expect(store.current).toEqual({ at: "liveBlock", entryId: "e1", element: addr("r1"), anchor: null, mode: "interact" });
    store.focusRow("e1", addr("r2"));
    expect(store.current, "the mode does not travel").toEqual({
      at: "liveBlock",
      entryId: "e1",
      element: addr("r2"),
      anchor: null,
      mode: "navigate",
    });
  });

  it("T1.3g (C26 I2): entry is into navigation, and setMode is a no-op at the prompt", () => {
    // Landing in interaction would hand the block every key before the reader
    // has seen where focus went. And `setMode` refuses at the prompt for
    // `focusRow`'s reason: a mode arriving from a stale handler would change
    // what every keystroke means with no keystroke behind it.
    const store = createFocusStore();
    store.enterLiveBlock("e1", addr("r1"));
    expect(store.current).toEqual({ at: "liveBlock", entryId: "e1", element: addr("r1"), anchor: null, mode: "navigate" });
    store.toPrompt();
    store.setMode("interact");
    expect(store.current, "no way in through setMode").toEqual({ at: "prompt" });
  });

  it("T1.3e (C26 I2): a frozen entry is not interactable, however the mode was left", () => {
    // **Freezing is a mode exit nobody signals** (C26 §8a, the live-block
    // freeze). The mode is stored, so it outlives the entry; answering
    // `interaction` here would hand every key to a block the reader cannot act
    // on and the prompt would stop receiving them. The gate is `liveEntry`.
    //
    // **It is no longer the same gate the `liveBlock` row had**, and the split is
    // the point (M5, R-COR-002): being *inside* a block is a thing you cannot be
    // once it has settled, where *standing in the transcript* is not. So the mode
    // is refused and the rung is kept — `liveBlock`, one position of `scope`,
    // rather than a fall to `global`.
    expect(
      at({ stored: { at: "liveBlock", entryId: "e1", element: addr("r1"), anchor: null, mode: "interact" }, liveEntry: null }),
    ).toBe("liveBlock");
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
      stored: { at: "liveBlock", entryId: "e1", element: addr("r9"), anchor: null, mode: "navigate" },
    };
    const first = activeTarget(inputs);
    for (let i = 0; i < 1000; i += 1) expect(activeTarget(inputs)).toBe(first);
    expect(inputs.stored, "the input is not mutated").toEqual({
      at: "liveBlock",
      entryId: "e1",
      element: addr("r9"),
      anchor: null,
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
    //
    // **`global` is reachable by dispatch and not by `activeTarget`, and M5 is
    // where those stopped being the same claim.** They were one while the fall
    // through the bottom of `activeTarget` was how `global` got its turn; now
    // `dispatch` runs it explicitly below the ladder, and R-COR-002 took the fall
    // away (W1). The vacuity the row exists to catch is unchanged — a target no
    // input can reach — so the assertion keeps its shape and names the one member
    // whose reachability is dispatch's rather than derivation's.
    const reached = new Set<FocusTarget>([
      // **`child` is produced, not named** — the rule above, applied to the rung
      // M5 added. An attached child is the top of the ladder, and a member added
      // to the union without a state that answers it is the vacuity this row
      // exists to catch.
      at({ attachedChild: true }),
      at({ overlayTop: { kind: "overlay" } }),
      at({ copyMode: true }),
      at({ overlayTop: { kind: "panel" } }),
      at({ overlayTop: { kind: "view" } }),
      at({ stored: { at: "liveBlock", entryId: "e1", element: addr("r1"), anchor: null, mode: "interact" } }),
      at(),
      at({ stored: { at: "liveBlock", entryId: "e1", element: addr("r1"), anchor: null, mode: "navigate" } }),
      at({ stored: { at: "liveBlock", entryId: "e1", element: null, anchor: null, mode: "navigate" }, liveEntry: null }),
    ]);
    expect([...FOCUS_ORDER].filter((t) => t !== "global").sort()).toEqual([...reached].sort());
    expect(reached.has("global"), "no derivation answers `global` any more").toBe(false);
    // And it is dispatched, which is what stops the line above retiring a rung
    // rather than re-homing one: `run("global", e)` is in `dispatch`'s tail.
    expect(
      readFileSync("src/interaction/router/router.ts", "utf8"),
      "`global` is run below the ladder, by name",
    ).toContain('run("global", e)');
    // **`child` is highest, amended in M5.** §103's ladder reads
    // `child · copy · question · substate · inside · scope`, and a captured child
    // sits above the question rung because the keys are not the host's to route:
    // an overlay the host raised over an attached PTY does not take that PTY's
    // keyboard. `overlay` keeps its place as the highest *host* rung.
    expect(FOCUS_ORDER[0], "an attached child is highest (§103)").toBe("child");
    expect(FOCUS_ORDER[1], "overlay is the highest host rung").toBe("overlay");
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
    focus.enterLiveBlock("e1", addr("r3"));
    expect(focus.current).toEqual({ at: "liveBlock", entryId: "e1", element: addr("r3"), anchor: null, mode: "navigate" });

    focus.reset();
    expect(focus.current).toEqual({ at: "prompt" });
  });

  it("T1.3b2 (I2): nothing resets it but the call", () => {
    // The test that separates a call from a subscription. A router that quietly
    // subscribed to C13 would pass T1.3b and fail this, because there is no
    // subscription here to fire — the store holds no reference to a transcript
    // at all, which is the structural half of the same claim.
    const focus = createFocusStore();
    focus.enterLiveBlock("e1", addr("r3"));
    expect(Object.keys(focus).some((k) => k.includes("subscribe"))).toBe(false);
    expect(focus.current, "unchanged without reset()").toEqual({ at: "liveBlock", entryId: "e1", element: addr("r3"), anchor: null, mode: "navigate" });
  });

  it("a push does not clear it, and neither does a pop (A01 D7)", () => {
    // The store has no notion of a layer, which is exactly why this holds: only
    // reset() moves it, and a pop appends nothing to call reset() from.
    const focus = createFocusStore();
    focus.enterLiveBlock("e1", addr("r7"));
    // …a view is pushed and popped elsewhere in the system…
    expect(focus.current).toEqual({ at: "liveBlock", entryId: "e1", element: addr("r7"), anchor: null, mode: "navigate" });
  });

  it("focusRow moves the row inside the live block and is a no-op at the prompt", () => {
    const focus = createFocusStore();
    focus.focusRow("e1", addr("r2"));
    expect(focus.current, "not a way into the live block").toEqual({ at: "prompt" });

    focus.enterLiveBlock("e1", null);
    focus.focusRow("e1", addr("r2"));
    expect(focus.current).toEqual({ at: "liveBlock", entryId: "e1", element: addr("r2"), anchor: null, mode: "navigate" });
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

  it("T1.3j (C26 §4e row 5, §8b.8): nothing in `src/` can put focus into interact", () => {
    // **The vacuity, asserted rather than described.** §10 promises this row and
    // every other row here *constructs* `mode: "interact"` on the store shape —
    // which tests `activeTarget`'s ordering correctly and says nothing about
    // whether the state is reachable. It is not: `setMode` has one caller, the
    // `⌃c` rung, and it passes `"navigate"`.
    //
    // So the `interaction` rung of the ladder is dead code, `⏎`'s entry arm is
    // uncommitted for a measured reason (§8b.8), and the mode indicator's second
    // value has nothing to display (roadmap 29).
    //
    // **It expires by itself.** The day anything sets `"interact"`, this fails
    // and the prose that rests on the vacuity has to be re-derived rather than
    // quietly surviving.
    const dir = new URL("../../src/", import.meta.url);
    const files: string[] = [];
    const walk = (at: URL): void => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, at);
        if (entry.isDirectory()) walk(next);
        else if (entry.name.endsWith(".ts")) files.push(readFileSync(next, "utf8"));
      }
    };
    walk(dir);

    const entering = files.filter((text) => /setMode\(\s*["']interact["']/u.test(text));

    expect(entering, "no caller puts the store into interact").toEqual([]);
  });

  it("the stored value is frozen, so a consumer cannot move focus by mutation", () => {
    const focus = createFocusStore();
    focus.enterLiveBlock("e1", addr("r1"));
    expect(Object.isFrozen(focus.current)).toBe(true);
  });
});
