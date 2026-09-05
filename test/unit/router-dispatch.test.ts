/**
 * C16 §4, §5, §7 — dispatch, the ladder, and the arming machine.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createFocusStore } from "../../src/interaction/router/focus.js";
import { createKeymap, defaultKeymap } from "../../src/interaction/router/keymap.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";
import { createRouter, type Placed, type RouterDeps } from "../../src/interaction/router/router.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";
import { addr } from "../support/focus.js";

const key = (name: string, mods: Partial<Key> = {}): InputEvent => ({
  kind: "key",
  key: { name, ctrl: false, meta: false, shift: false, sequence: name, ...mods },
});
const ctrlC = key("c", { ctrl: true });
const click = (
  row: number,
  col = 0,
  button: Extract<InputEvent, { kind: "mouse" }>["button"] = "button0",
): InputEvent => ({
  kind: "mouse",
  row,
  col,
  button,
  press: true,
  shift: false,
  meta: false,
  ctrl: false,
  motion: false,
});

/** A `Placed` box, for the rows that ask whether a layer covers the region. */
const box = (
  id: string,
  at: Readonly<{ top: number; left: number; height: number; width: number }>,
): Placed => ({
  layer: { id, kind: "overlay", dismissable: true },
  ...at,
});

function harness(over: Partial<RouterDeps> = {}, start = 1_000) {
  let t = start;
  const calls: string[] = [];
  const layer = { top: null as Placed["layer"] | null, placed: [] as Placed[] };
  const deps: RouterDeps = {
    overlayAnswerCallback: () => null,
    overlayTop: () => layer.top,
    overlayRegion: () => ({ width: 80, height: 24 }),
    placed: () => layer.placed,
    popLayer: () => void calls.push("pop"),
    copyMode: () => false,
    exitCopyMode: () => void calls.push("exitCopy"),
    liveEntry: () => ({ id: "e1" }),
    entryAtRow: (row) => (row < 5 ? { id: `row${String(row)}`, rowOffset: row } : null),
    inFlight: () => null,
    // §5's subscription rung. **Defaulted here rather than left out**: the
    // ladder reads these on every Ctrl-C, so a double that omits them makes
    // every arming row throw — which is how the five exit-confirm rows found
    // the new dep before any of them was about a stream.
    liveStreams: () => 0,
    cancelNewestStream: () => false,
    cancel: () => void calls.push("cancel"),
    signalShellChild: () => void calls.push("sigint"),
    region: () => ({ top: 1, height: 10 }),
    mouseEnabled: () => true,
    promptHasText: () => false,
    clearPrompt: () => void calls.push("clearPrompt"),
    raiseExitConfirm: () => void calls.push("exitConfirm"),
    ...over,
  };
  const focus = createFocusStore();
  const router = createRouter({ focus, keymap: createKeymap([]), now: () => t, deps });
  return { router, focus, calls, layer, advance: (ms: number) => (t += ms) };
}

describe("C16 §4 — dispatch", () => {
  it("T1.7 (I4): the first consumer wins and the second is not called", () => {
    const { router } = harness();
    const second = vi.fn(() => true);
    router.register("prompt", () => true);
    router.register("prompt", second);

    expect(router.dispatch(key("a"))).toBe(true);
    expect(second, "no broadcast, no bubbling past the first consumer").not.toHaveBeenCalled();
  });

  it("T1.8 (I5): an unconsumed event is dropped, and no lower target sees it", () => {
    const { router } = harness();
    const lower = vi.fn(() => true);
    router.register("liveBlock", lower);

    expect(router.dispatch(key("a")), "prompt has focus, nothing consumes").toBe(false);
    expect(lower).not.toHaveBeenCalled();
  });

  it("T2.8: register returns a disposable that removes the handler mid-session", () => {
    const { router } = harness();
    const h = vi.fn(() => true);
    const sub = router.register("prompt", h);
    router.dispatch(key("a"));
    sub.dispose();
    router.dispatch(key("a"));
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("T3.15: a throwing handler is contained and the event reads as unconsumed", () => {
    const { router } = harness();
    router.register("prompt", () => {
      throw new Error("boom");
    });
    const after = vi.fn(() => true);
    router.register("prompt", after);

    expect(() => router.dispatch(key("a"))).not.toThrow();
    expect(after, "the next handler still gets its turn").toHaveBeenCalled();
  });

  it("the dispatch chain is asserted as a sequence, not as steps", () => {
    // A03 §2's ordered-structure rule applied to the chain. Testing each stage
    // in isolation cannot see that global runs *after* activeTarget and only
    // when nothing consumed — which is the whole of §4.
    const { router } = harness();
    router.dispatch(key("a"));
    expect(router.lastStages).toEqual(["arming", "target:prompt", "global", "dropped"]);
  });

  it("T1.12c (I8): the global fallback does not run beneath a non-dismissable layer", () => {
    const { router, layer } = harness();
    const globalHandler = vi.fn(() => true);
    router.register("global", globalHandler);

    layer.top = { id: "menu", kind: "overlay", dismissable: true };
    expect(router.dispatch(key("t")), "dismissable: a theme switch is harmless").toBe(true);
    expect(globalHandler).toHaveBeenCalledTimes(1);

    layer.top = { id: "confirm", kind: "overlay", dismissable: false };
    expect(router.dispatch(key("t"))).toBe(false);
    expect(globalHandler, "modal: nothing reaches past it").toHaveBeenCalledTimes(1);
    expect(router.lastStages).toContain("modal-blocked");
  });
});

describe("C16 §5 — the ladder, as handlers on their targets", () => {
  it("T1.11 (I7): a verb in flight cancels, ahead of everything else", () => {
    const { router, calls, layer } = harness({ inFlight: () => "app" });
    layer.top = { id: "confirm", kind: "overlay", dismissable: false };

    expect(router.dispatch(ctrlC)).toBe(true);
    expect(calls, "not the confirm, not the view — the promote").toEqual(["cancel"]);
  });

  it("T1.11b (§5): a live subscription is cancelled below the layer rungs and above the prompt's", () => {
    // **The rung the ladder had no state for.** C23 I6 releases the submission
    // guard for a `streams: true` verb so the prompt stays usable, and rungs 1
    // and 2 read `inFlight` — which *is* that guard. So a `--watch` left every
    // rung declining: Ctrl-C cleared the prompt and the child ran on.
    let live = 2;
    const stream = {
      inFlight: () => null,
      liveStreams: () => live,
      cancelNewestStream: (): boolean => {
        if (live === 0) return false;
        live -= 1;
        return true;
      },
    };

    // **Below the layer rungs**: a modal over a running stream still takes the
    // key, which is the copy-mode ordering applied to the new rung.
    const modal = harness({ ...stream, promptHasText: () => true });
    modal.layer.top = { id: "confirm", kind: "overlay", dismissable: false };
    expect(modal.router.dispatch(ctrlC)).toBe(true);
    expect(modal.calls, "the confirm consumed it; nothing was cancelled").toEqual([]);

    // **Above the prompt rungs**: a running stream outranks a half-typed line,
    // so the input is *not* cleared while one is live.
    const typed = harness({ ...stream, promptHasText: () => true });
    expect(typed.router.dispatch(ctrlC)).toBe(true);
    expect(typed.calls, "the stream, not the prompt").toEqual([]);
    expect(live, "and the newest of the two is gone").toBe(1);

    // **A second press takes the next-newest rather than falling through**, so
    // `n` streams cost `n` presses and the count is the whole rule.
    expect(typed.router.dispatch(ctrlC)).toBe(true);
    expect(live).toBe(0);

    // With none left, the ladder resumes: the prompt's own rung clears the text.
    expect(typed.router.dispatch(ctrlC)).toBe(true);
    expect(typed.calls, "and only now does the prompt get the key").toEqual(["clearPrompt"]);
  });

  it("T1.11c (§5): the exit confirm does not arm while a subscription is live", () => {
    // Otherwise the key that stops a runaway `--watch` is also the key that
    // closes the session — and two presses to stop two streams would arm and
    // then raise. The arming machine is pre-dispatch, so this is its own guard
    // rather than a consequence of the rung above.
    let live = 1;
    const h = harness({
      liveStreams: () => live,
      cancelNewestStream: (): boolean => (live > 0 ? ((live -= 1), true) : false),
    });

    expect(h.router.dispatch(ctrlC), "cancels, does not arm").toBe(true);
    expect(h.router.dispatch(ctrlC), "nothing live now: this one arms").toBe(true);
    expect(h.calls, "and no confirm has been raised").toEqual([]);

    // The control: with nothing ever live, two Ctrl-Cs raise it. Without this
    // the row passes against a ladder that can no longer arm at all.
    const control = harness({});
    control.router.dispatch(ctrlC);
    control.router.dispatch(ctrlC);
    expect(control.calls).toEqual(["exitConfirm"]);
  });

  it("T3.11: a piped shell child takes SIGINT when no verb is in flight", () => {
    const { router, calls } = harness({ inFlight: () => "shell" });
    expect(router.dispatch(ctrlC)).toBe(true);
    expect(calls).toEqual(["sigint"]);
  });

  it("T1.12, T1.12b (I8): a confirm is a no-op, and nothing beneath it moves", () => {
    const { router, calls, layer } = harness({ copyMode: () => true });
    layer.top = { id: "confirm", kind: "overlay", dismissable: false };

    expect(router.dispatch(ctrlC), "consumed").toBe(true);
    expect(calls, "copy mode is untouched and no layer popped").toEqual([]);
  });

  it("T1.30 (I8): a full-region layer blocks step 3; a one-row dismissable overlay does not", () => {
    // **The defect this clause closes, and its control.** `PgUp` over a pushed
    // view fell through to `global` and scrolled the transcript underneath the
    // thing filling the screen — word for word what §4 says step 3 exists to
    // prevent. The guard tested `dismissable`, which is modality; a view is
    // dismissable, because `Esc` pops it.
    //
    // The control is the row above it in the same table: a completion menu is
    // dismissable *and* small, and scrolling beneath one costs nothing. Without
    // the control this passes for a router that skips step 3 whenever any layer
    // is open, which is the rule §4 spends a paragraph rejecting.
    const { router, calls, layer } = harness();
    const globalKey = key("pageup");
    router.register("global", () => (calls.push("global"), true));

    layer.top = { id: "menu", kind: "overlay", dismissable: true };
    layer.placed = [box("menu", { top: 4, left: 10, height: 6, width: 30 })];
    expect(router.dispatch(globalKey)).toBe(true);
    expect(calls).toEqual(["global"]);

    calls.length = 0;
    layer.top = { id: "dash", kind: "view", dismissable: true };
    layer.placed = [box("dash", { top: 0, left: 0, height: 24, width: 80 })];
    expect(router.dispatch(globalKey)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("T1.31 (I8): coverage is read from the box, not from the kind", () => {
    // **The proxy passes every test written about views.** A layer that is not a
    // view but spans the region blocks step 3, and a view whose box was clamped
    // smaller does not — neither case is expressible by a kind test, and the
    // second is the one that would be silently wrong.
    const { router, calls, layer } = harness();
    router.register("global", () => (calls.push("global"), true));

    layer.top = { id: "wide", kind: "overlay", dismissable: true };
    layer.placed = [box("wide", { top: 0, left: 0, height: 24, width: 80 })];
    expect(router.dispatch(key("pageup"))).toBe(false);

    calls.length = 0;
    layer.top = { id: "small-view", kind: "view", dismissable: true };
    layer.placed = [box("small-view", { top: 0, left: 0, height: 8, width: 80 })];
    expect(router.dispatch(key("pageup"))).toBe(true);
    expect(calls).toEqual(["global"]);
  });

  it("a dismissable overlay pops; a view beneath is reached only when it is the top", () => {
    const { router, calls, layer } = harness();
    layer.top = { id: "menu", kind: "overlay", dismissable: true };
    router.dispatch(ctrlC);
    expect(calls).toEqual(["pop"]);

    layer.top = { id: "dash", kind: "view", dismissable: true };
    router.dispatch(ctrlC);
    expect(calls).toEqual(["pop", "pop"]);
  });

  it("T1.14: Ctrl-C in the live block returns focus to the prompt, keeping the buffer", () => {
    const { router, focus, calls } = harness({ promptHasText: () => true });
    focus.enterLiveBlock("e1", addr("r3"));

    expect(router.dispatch(ctrlC)).toBe(true);
    expect(focus.current).toEqual({ at: "prompt" });
    expect(calls, "the input the user cannot see is not cleared").toEqual([]);
  });

  it("the ladder's order is FOCUS_ORDER's, asserted where two rungs are both live", () => {
    // The pairwise form again: each rung firing in isolation is true under any
    // permutation. A confirm over copy mode is the pair the reorder turned on.
    const { router, calls, layer } = harness({ copyMode: () => true });
    layer.top = { id: "menu", kind: "overlay", dismissable: true };
    router.dispatch(ctrlC);
    expect(calls, "overlay beats copy mode").toEqual(["pop"]);
  });
});

describe("C16 §7 — the arming machine observes before dispatch", () => {
  it("T1.9, T1.10: Ctrl-C at an empty prompt arms; a second within 500 ms raises", () => {
    const { router, calls, advance } = harness();
    router.dispatch(ctrlC);
    expect(calls, "armed, no confirm yet").toEqual([]);

    advance(499);
    router.dispatch(ctrlC);
    expect(calls).toEqual(["exitConfirm"]);
  });

  it("T3.9: 501 ms between two Ctrl-Cs disarms, and the second arms afresh", () => {
    const { router, calls, advance } = harness();
    router.dispatch(ctrlC);
    advance(501);
    router.dispatch(ctrlC);
    expect(calls).toEqual([]);
  });

  it("T3.8, T3.8c: any input disarms — including one a handler consumes", () => {
    // **The negative case in the same test as the positive one.** A machine
    // living in a handler disarms on unconsumed keys and silently fails on
    // consumed ones, which is a two-keystroke window nothing tests by accident.
    const { router, calls, advance } = harness();
    const consuming = vi.fn(() => true);
    router.register("prompt", consuming);

    router.dispatch(ctrlC);
    router.dispatch(key("a"));
    expect(consuming, "the key really was consumed").toHaveBeenCalled();

    advance(10);
    router.dispatch(ctrlC);
    expect(calls, "disarmed by the consumed key, so this only re-arms").toEqual([]);
  });

  it("T3.8b: a paste disarms, and so does a click", () => {
    for (const between of [
      { kind: "paste", text: "hello" } as InputEvent,
      click(2),
    ]) {
      const { router, calls, advance } = harness();
      router.dispatch(ctrlC);
      router.dispatch(between);
      advance(10);
      router.dispatch(ctrlC);
      expect(calls, `${between.kind} must disarm`).toEqual([]);
    }
  });

  it("T3.10: three rapid Ctrl-Cs raise one confirm, not two", () => {
    const { router, calls, advance } = harness();
    router.dispatch(ctrlC);
    advance(10);
    router.dispatch(ctrlC);
    advance(10);
    router.dispatch(ctrlC);
    expect(calls).toEqual(["exitConfirm"]);
  });
});

describe("C16 §4 — mouse routes by position", () => {
  it("T1.3c, T1.3d (I3): a click resolves by position, not by focus", () => {
    const { router, layer, focus } = harness();
    focus.enterLiveBlock("e1", addr("r0"));

    router.dispatch(click(3));
    expect(router.lastStages, "row 3 of the region is row 2 of the transcript").toContain(
      "viewport:row2",
    );

    layer.placed = [
      { layer: { id: "confirm", kind: "overlay", dismissable: false }, top: 2, left: 10, height: 3, width: 20 },
    ];
    router.dispatch(click(3, 12));
    expect(router.lastStages, "inside the placed region, both axes").toContain("layer:confirm");

    router.dispatch(click(3, 4));
    expect(router.lastStages, "same row, left of the layer — Placed.left is load-bearing")
      .toContain("viewport:row2");
  });

  it("T3.12c (I20): both rungs test a region row, and the header is not the region's first", () => {
    // **The case the row above cannot distinguish.** Its layer covers region
    // rows 2 to 4 and terminal rows 3 to 5, and the click is at 3 — inside both
    // readings, so it passed while this rung compared a terminal row to
    // `Placed.top` and the transcript rung one line below subtracted
    // `region.top`. Two adjacent lines in two coordinate systems.
    //
    // A layer on the region's first row is the discriminating case: it is the
    // frame's second row, and the frame's first is the header.
    const { router, layer } = harness();
    layer.placed = [
      { layer: { id: "menu", kind: "overlay", dismissable: true }, top: 0, left: 0, height: 1, width: 40 },
    ];

    router.dispatch(click(0, 4));
    expect(router.lastStages, "the header is chrome, not the layer").toContain("chrome");

    router.dispatch(click(1, 4));
    expect(router.lastStages, "and the region's first row is the layer").toContain("layer:menu");
  });

  it("T1.3o (I31, §4a row j): a horizontal wheel is a wheel, and nobody's click", () => {
    // **The shipped test named two directions of four.** `wheelUp || wheelDown`
    // was complete when the decoder produced only those; the day it produced
    // `wheelLeft` (I30) a horizontal wheel fell through to the entry rung and
    // was routed to `liveBlock` as a click on the block under the pointer.
    const { router } = harness();
    const taken: string[] = [];
    router.register("liveBlock", (e) => {
      if (e.kind === "mouse") taken.push(e.button);
      return e.kind === "mouse" && !e.button.startsWith("wheel");
    });

    // The control: a click at the same row reaches the entry and is consumed.
    expect(router.dispatch(click(3, 0, "button0"))).toBe(true);
    expect(taken).toEqual(["button0"]);

    for (const button of ["wheelLeft", "wheelRight"] as const) {
      expect(router.dispatch(click(3, 0, button)), `${button} is consumed by nothing`).toBe(false);
      expect(router.lastStages, `${button} is offered as a wheel, then to the viewport`).toEqual([
        "arming",
        "mouse",
        "viewport:row2",
        "viewport:wheel",
      ]);
    }
    // Offered to the entry — as a wheel, which the handler declined — and not
    // as a click: the handler saw the two wheels and consumed neither.
    expect(taken).toEqual(["button0", "wheelLeft", "wheelRight"]);
  });

  it("T1.3p (I31, §4a row i): an uncovered wheel goes to the entry first, and to global when it declines", () => {
    const { router, layer } = harness();
    const seen: string[] = [];
    let boxTakes = false;
    router.register("liveBlock", (e) => {
      seen.push(`liveBlock:${e.kind === "mouse" ? e.button : "key"}`);
      return boxTakes;
    });
    router.register("global", (e) => {
      seen.push(`global:${e.kind === "mouse" ? e.button : "key"}`);
      return true;
    });

    // Over an entry that declines — prose — the transcript takes it.
    router.dispatch(click(3, 0, "wheelDown"));
    expect(seen).toEqual(["liveBlock:wheelDown", "global:wheelDown"]);

    // Over an entry that takes it — a `scroll` under the pointer — global never runs.
    seen.length = 0;
    boxTakes = true;
    router.dispatch(click(3, 0, "wheelDown"));
    expect(seen).toEqual(["liveBlock:wheelDown"]);

    // Below the transcript there is no entry to offer it to: straight to C14.
    seen.length = 0;
    router.dispatch(click(8, 0, "wheelDown"));
    expect(seen).toEqual(["global:wheelDown"]);
    expect(router.lastStages).toEqual(["arming", "mouse", "viewport:wheel"]);

    // T3.12b's half, kept: a layer covering the point takes it and nothing else sees it.
    seen.length = 0;
    layer.placed = [
      { layer: { id: "menu", kind: "overlay", dismissable: true }, top: 2, left: 0, height: 1, width: 40 },
    ];
    router.dispatch(click(3, 4, "wheelDown"));
    expect(seen).toEqual([]);
    expect(router.lastStages).toContain("layer:menu");
  });

  it("T1.3q (I8, §4a): a layer that must be answered takes the mouse as it takes the keys", () => {
    // **The keyboard path had two gates and this table had none.** A click beside
    // a confirm reached the entry under it, and a wheel scrolled the transcript
    // beneath one — the defect I8 was widened to close, arriving by the pointer.
    const { router, layer } = harness();
    const seen: string[] = [];
    router.register("liveBlock", () => (seen.push("liveBlock"), true));
    router.register("global", () => (seen.push("global"), true));
    layer.top = { id: "confirm", kind: "overlay", dismissable: false };
    layer.placed = [
      { layer: layer.top, top: 5, left: 10, height: 3, width: 20 },
    ];

    expect(router.dispatch(click(3, 0)), "consumed, and nothing happens").toBe(true);
    expect(router.dispatch(click(3, 0, "wheelDown"))).toBe(true);
    expect(router.dispatch(click(12, 0)), "chrome too").toBe(true);
    expect(seen).toEqual([]);
    expect(router.lastStages).toEqual(["arming", "mouse", "modal"]);

    // On the layer itself the click is the layer's, as before.
    router.register("overlay", () => (seen.push("overlay"), true));
    router.dispatch(click(6, 12));
    expect(seen).toEqual(["overlay"]);

    // A dismissable layer is not modal: the entry beneath is reachable.
    layer.top = { id: "menu", kind: "overlay", dismissable: true };
    layer.placed = [];
    router.dispatch(click(3, 0));
    expect(seen).toEqual(["overlay", "liveBlock"]);
  });

  it("T3.12 (I3): mouse events are dropped when the capability is absent", () => {
    const { router } = harness({ mouseEnabled: () => false });
    expect(router.dispatch(click(3))).toBe(false);
    expect(router.lastStages).toEqual(["arming", "mouse"]);
  });

  it("T3.12b: a wheel goes to the viewport with no layer, and to the layer with one", () => {
    const { router, layer } = harness();
    router.dispatch(click(3, 0, "wheelUp"));
    expect(router.lastStages).toContain("viewport:wheel");

    layer.placed = [
      { layer: { id: "menu", kind: "overlay", dismissable: true }, top: 0, left: 0, height: 9, width: 40 },
    ];
    router.dispatch(click(3, 0, "wheelUp"));
    expect(router.lastStages).toContain("layer:menu");
  });

  it("a click below the transcript region is chrome, not the last entry", () => {
    const { router } = harness();
    router.dispatch(click(50));
    expect(router.lastStages).toContain("chrome");
  });
});

describe("C16 — the subscription audit", () => {
  it("router.ts registers no callback on a change stream", () => {
    // resetFocus() is a call by ruling (I2), and the reason generalises: C13
    // emits `append` then `evict` for one append(), so a consumer reading deltas
    // as current state sees a half-applied store. That cost C14 a blank screen
    // every assertion passed.
    const src = readFileSync("src/interaction/router/router.ts", "utf8");
    expect(src).not.toContain("subscribe");
    expect(src, "every dep is a pull").not.toMatch(/\.on\s*\(/);
  });
});

describe("C16 — the dispatch trace, run against the implementation", () => {
  it("the sequence resolved by hand in the spec pass agrees with the code", () => {
    // **The artefact, not a paraphrase of it.** Step 1's walk resolved twenty-six
    // events against the spec on paper and found three defects there. This runs
    // the same sequence against the code: the invariants constrain each dispatch
    // and none constrains the sequence, which is where C13's and C14's defects
    // lived.
    //
    // Read the column, not the assertion. A trace that agreed with a wrong
    // implementation would still read wrongly to a person.
    const { router, focus, layer, calls, advance } = harness({
      promptHasText: () => true,
    });
    const seen: string[] = [];
    const step = (label: string, e: InputEvent): void => {
      router.dispatch(e);
      seen.push(`${label} → ${router.lastStages.filter((s) => s !== "arming").join(",")}`);
    };

    step("p", key("p"));
    layer.top = { id: "menu", kind: "overlay", dismissable: true };
    step("down (menu open)", key("down"));
    layer.top = null;
    step("down (menu gone)", key("down"));
    focus.enterLiveBlock("e1", addr("r1"));
    step("s (block keymap)", key("s"));
    step("ctrl-c (live block)", ctrlC);
    step("click row 2", click(3));
    step("wheel", click(3, 0, "wheelUp"));
    layer.top = { id: "dash", kind: "view", dismissable: true };
    step("f (pushed view)", key("f"));
    layer.top = { id: "confirm", kind: "overlay", dismissable: false };
    step("ctrl-c (confirm)", ctrlC);
    step("t (global, under confirm)", key("t"));
    layer.top = null;
    advance(10);

    expect(seen).toEqual([
      "p → target:prompt,global,dropped",
      "down (menu open) → target:overlay,global,dropped",
      "down (menu gone) → target:prompt,global,dropped",
      "s (block keymap) → target:liveBlock,global,dropped",
      "ctrl-c (live block) → target:liveBlock",
      "click row 2 → mouse,viewport:row2",
      // **The entry under the pointer is offered the wheel first** (§4a row i):
      // a `scroll` block is a second thing a wheel can mean. The harness's
      // `liveBlock` handler binds nothing, so the wheel falls to the viewport.
      "wheel → mouse,viewport:row2,viewport:wheel",
      "f (pushed view) → target:pushedView,global,dropped",
      "ctrl-c (confirm) → target:overlay",
      "t (global, under confirm) → target:overlay,modal-blocked",
    ]);

    // Read the outcomes too, not only the routing.
    expect(focus.current, "ctrl-c returned focus and kept the buffer").toEqual({ at: "prompt" });
    expect(calls, "no pop under the confirm, no prompt cleared").toEqual([]);
  });
});

describe("C26 §8b.8 — interaction mode is vacuous, and this is the row that says so", () => {
  /**
   * **The premise the ⏎ ruling rests on, asserted rather than described — and
   * inverted once.**
   *
   * §8b.8 rules that `⏎` does not enter interaction, because the mode has
   * nothing in it. This row used to assert the first of two facts behind that:
   * *no block declares keys* — `mergeBlock` had no caller in `src/`. **It fired
   * on 2026-09-05**, when `construct.ts`'s `syncBlockKeymap` became the first
   * caller for the plot's digit keymap (C12 I116, C22 I78), which is exactly
   * what it was written to do. So it now asserts the other fact, the one the
   * ruling actually needs: **merging the one producer's keymap leaves
   * `interaction` with no binding**, because no digit collides with a built-in
   * (C16 I27) and every one lands at `liveBlock`.
   *
   * **This row fails the day a producer's key lands at `interaction`**, which is
   * when `⏎`'s second effect and I14's first level go live and it is inverted
   * again.
   */
  it("T2.6a (C26 §8b.8, C22 I78): one caller merges a block keymap, and it puts nothing at interaction", () => {
    // `mergeBlock` is the only route a `BlockKeymap` reaches the router by.
    // Counted over `src/` and not over the tree, because a test calling it is
    // not a producer.
    const callers = ["keymap.ts", "router.ts", "construct.ts", "session.ts", "keys.ts"]
      .map((f) => {
        for (const dir of ["src/interaction/router/", "src/shell/"]) {
          try {
            return readFileSync(`${dir}${f}`, "utf8");
          } catch {
            /* the file lives in the other directory */
          }
        }
        return "";
      })
      .join("\n")
      // The declaration itself is not a call. Dropping the interface line is
      // what makes this a producer count rather than a mention count.
      .split("\n")
      .filter((l) => l.includes("mergeBlock(") && !l.includes("mergeBlock(blockKeymap"))
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"));

    expect(
      callers.map((l) => l.trim()),
      "exactly one production caller — `syncBlockKeymap` in construct.ts (C22 I78)",
    ).toEqual(["withdrawBlockKeymap = keymap.mergeBlock(declared);"]);

    // **The half the ruling rests on now.** The one producer is the plot's
    // digits; merged over the real default table they collide with nothing, so
    // the mode is still empty and `⏎`'s second effect is still uncommitted.
    const plot = block({
      kind: "plot", id: "p", form: "line", height: 5,
      series: Array.from({ length: 9 }, (_, i) => ({ values: [i, i + 1] })),
    }) as Plot;
    const declared = plotDefinition.keymap?.(plot) ?? [];
    expect(declared.map((b) => b.key.name), "nine digits, one per series").toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    );
    const map = createKeymap(defaultKeymap);
    const before = map.entries().length;
    map.mergeBlock(declared);
    const merged = map.entries().slice(before);
    expect(merged.map((b) => b.target), "every digit at liveBlock — none collides").toEqual(
      Array.from({ length: 9 }, () => "liveBlock"),
    );
    // `⌃c` on the mode is a router handler, not a keymap row (T2.6b), so the
    // table has **zero** rows at this target before and after the merge.
    expect(
      map.entries().filter((b) => b.target === "interaction").map((b) => b.action),
      "the mode has no bindings",
    ).toEqual([]);
  });

  it("T2.6b (C26 §8b.8, I14): the interaction target binds ⌃c and nothing else", () => {
    // The other half. A mode reachable with one binding takes every key from the
    // prompt and is left only by cancellation — which is why the ruling refuses
    // to enter it, rather than the reader discovering it.
    const { router, focus } = harness();
    focus.enterLiveBlock("e1", addr("r1"));
    focus.setMode("interact");

    expect(router.dispatch(ctrlC), "⌃c leaves interaction").toBe(true);
    expect(focus.current, "and stays on the row, per the two-level shape").toEqual({
      at: "liveBlock",
      entryId: "e1",
      element: addr("r1"),
      anchor: null,
      mode: "navigate",
    });

    // Every other key falls through: there is nothing on the target to take it.
    focus.setMode("interact");
    for (const k of [key("s"), key("escape"), key("enter"), key("a")]) {
      expect(router.dispatch(k), `\`${k.kind === "key" ? k.key.name : "?"}\` is unbound here`).toBe(
        false,
      );
    }
    expect(focus.current.at === "liveBlock" && focus.current.mode, "still in the mode").toBe(
      "interact",
    );
  });
});
