/**
 * C16 §4, §5, §7 — dispatch, the ladder, and the arming machine.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createFocusStore } from "../../src/interaction/router/focus.js";
import { createKeymap, defaultKeymap } from "../../src/interaction/router/keymap.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";
import { INTERCEPTS, interceptVerdict, type InterceptId } from "../../src/interaction/router/intercepts.js";
import { createRouter, type Placed, type RouterDeps } from "../../src/interaction/router/router.js";
import { OWNER_RUNGS, type InputEvent, type Key } from "../../src/interaction/router/types.js";
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
    keyReleasesReported: () => false,
    overlayWouldResolve: () => null,
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
    // **Consumed, not dropped** (M5, §103, R-OWN-001): a blocking layer REJECTS
    // the key rather than letting it fall, and a reject spends the event exactly
    // as a handle does. The invariant this row is about — *nothing reaches past
    // it* — is the `calls`/spy assertion beside this line and is unchanged; the
    // boolean was only ever a proxy for it, and the proxy is what moved.
    expect(router.dispatch(key("t"))).toBe(true);
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

  it("T1.39 (I39): every intercept declares a verdict at every rung, by equality", () => {
    // **By equality against `OWNER_RUNGS`, not by a count.** A length check is
    // passed by a table with the right number of wrong keys, and the rung this
    // work added is exactly the case that would slip: `question` was the missing
    // row and there were five others present. The type already refuses a partial
    // table at compile time — this is the row that still fires when a rung is
    // added with an `as`, when a table is assembled rather than written, or when
    // `OWNER_RUNGS` grows and the record is widened with an index signature.
    for (const id of Object.keys(INTERCEPTS) as InterceptId[]) {
      const declared = Object.keys(INTERCEPTS[id]).filter((k) => k !== "idle" && k !== "why");
      expect(declared.sort(), `${id}: every rung, no omissions`).toEqual([...OWNER_RUNGS].sort());
      for (const rung of OWNER_RUNGS) {
        expect(interceptVerdict(id, rung), `${id} at ${rung}`).toBeTypeOf("string");
      }
    }
  });

  it("T1.40 (I40): ⌥↑ scrolls with a question open, and the question stays open and unanswered", () => {
    // **Three assertions, because each alone passes a router doing the wrong
    // thing.** *The transcript scrolled* is passed by one that also answered the
    // question; *the question is still open* by one that dropped the key on the
    // floor; *unanswered* by one that popped the layer. The defect this replaces
    // satisfied the second and the third.
    // The question's own answer callback, recording every event it is *offered*
    // and declining all of them. Empty is the assertion: the callback was never
    // reached, which is stronger than it having declined.
    const offered: string[] = [];
    const { router, calls, layer } = harness({
      overlayAnswerCallback: () => (e: InputEvent) => (
        offered.push(e.kind === "key" ? e.key.name : "mouse"), false
      ),
    });
    layer.top = { id: "confirm", kind: "overlay", dismissable: false };
    router.register("global", () => (calls.push("scroll"), true));
    router.register("overlay", () => (calls.push("overlay"), true));

    expect(router.dispatch(key("up", { meta: true })), "consumed").toBe(true);
    expect(calls, "the viewport scrolled and the question's handler never ran").toEqual(["scroll"]);
    expect(offered, "the question was never even offered the key").toEqual([]);
    expect(layer.top?.id, "the question is still open").toBe("confirm");
    // **The question's rung is never reached** — the stage names the viewport
    // the ladder resolved, and `prompt` is the transcript's. A stages read is the
    // only way to tell that from a handler that declined.
    expect(router.lastStages).toEqual([
      "arming",
      "intercept:page-scroll:question:handle",
      "intercept:scroll:transcript",
    ]);

    // **The control, and it is the reason this is not a test of "⌥↑ is special".**
    // `⌃c` is a reserved route at the same rung with the other verdict, so it
    // takes the other road: `reject` resolves at the **owning rung**, where
    // `handle` short-circuits to the viewport. Without this row the assertions
    // above are equally passed by a router that sends every intercept to the
    // scroller, which would answer the question by scrolling it.
    //
    // The ladder's own `overlay` handler is what runs, not a test double —
    // §5's question branch — so the assertion is the destination rather than a
    // spy: nothing scrolled, and the event was spent at the rung.
    calls.length = 0;
    expect(router.dispatch(ctrlC)).toBe(true);
    expect(router.lastStages, "the owner's road, not the viewport's").toEqual([
      "arming",
      "intercept:interrupt:question:reject",
      "reject",
    ]);
    expect(calls, "an interrupt does not scroll").toEqual([]);
    expect(layer.top?.id, "and it did not dismiss the question either").toBe("confirm");
  });

  it("T1.40b (I40): ⌥↑ in copy mode is rejected and the frozen screen does not move", () => {
    const { router, calls } = harness({ copyMode: () => true });
    router.register("global", () => (calls.push("scroll"), true));

    expect(router.dispatch(key("up", { meta: true })), "consumed, not dropped").toBe(true);
    expect(calls, "a frozen screen is a picture; scrolling it would scroll the picture").toEqual([]);
    expect(router.lastStages).toEqual(["arming", "intercept:page-scroll:copy:reject", "reject"]);
  });

  it("T1.30 (I8, I40): a full-region layer blocks the global keymap; the reserved routes still pass", () => {
    // **Amended, and the row had been pinning the defect rather than the rule**
    // (I40). It asserted that `PgUp` under a full-region layer is dropped — and
    // that is the state in which a reader cannot page the transcript to read
    // what the layer is asking about. `page-scroll` is one of §103's three
    // reserved routes; no rung may claim it, so it is read before the ladder and
    // reaches the viewport whatever is on top.
    //
    // **What I8 still holds is the whole of its subject bar those routes**, and
    // that is what the control is now: an ordinary `global` binding under the
    // same layer is still dropped. The two keys differ only in being reserved,
    // so the row distinguishes *the layer is not modal* from *this route is
    // unclaimable* — which one boolean over one key could not.
    const { router, calls, layer } = harness();
    // **The reserved key is `⌥↑`, not `PgUp`** (I40). `PgUp` is in no binding
    // and no rule in the registry; it is the repo's own key and I8 still holds
    // every bit of it, which is what makes it the control here.
    const reserved = key("up", { meta: true });
    const ordinary = key("pageup");
    router.register("global", (e) => (
      calls.push(e.kind === "key" ? e.key.name : "mouse"), true
    ));

    // The row above it in the same table: a completion menu is dismissable *and*
    // small, and everything reaches past one. Without it this passes for a
    // router that skips the guard whenever any layer is open.
    layer.top = { id: "menu", kind: "overlay", dismissable: true };
    layer.placed = [box("menu", { top: 4, left: 10, height: 6, width: 30 })];
    expect(router.dispatch(reserved)).toBe(true);
    expect(router.dispatch(ordinary)).toBe(true);
    expect(calls).toEqual(["up", "pageup"]);

    calls.length = 0;
    layer.top = { id: "dash", kind: "view", dismissable: true };
    layer.placed = [box("dash", { top: 0, left: 0, height: 24, width: 80 })];

    // The reserved route reaches the viewport scroller, ahead of the ladder.
    expect(router.dispatch(reserved), "consumed").toBe(true);
    expect(calls, "a reader under a full-region layer can still page").toEqual(["up"]);
    expect(router.lastStages).toEqual([
      "arming",
      "intercept:page-scroll:substate:handle",
      "intercept:scroll:transcript",
    ]);

    // **Consumed, not dropped** (M5, §103, R-OWN-001): a blocking layer REJECTS
    // an ordinary key rather than letting it fall, and a reject spends the event
    // exactly as a handle does. The invariant this row is about — *nothing
    // reaches past it* — is the `calls` assertion beside this line and is
    // unchanged; the boolean was only ever a proxy for it.
    calls.length = 0;
    expect(router.dispatch(ordinary)).toBe(true);
    expect(calls, "and every other global binding is still held").toEqual([]);
    expect(layer.top?.id, "the layer is not dismissed by either").toBe("dash");
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
    // **Consumed, not dropped** (M5, §103, R-OWN-001): a blocking layer REJECTS
    // the key rather than letting it fall, and a reject spends the event exactly
    // as a handle does. The invariant this row is about — *nothing reaches past
    // it* — is the `calls`/spy assertion beside this line and is unchanged; the
    // boolean was only ever a proxy for it, and the proxy is what moved.
    expect(router.dispatch(key("pageup"))).toBe(true);

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
        // Read before the ladder, and **declared `handle` at every rung but
        // `copy`** (I40): a horizontal wheel is still a wheel to the table (M5,
        // W4), and `handle` routes it to its pointer-hit owner ahead of the
        // ladder rather than letting it fall through to the same place.
        "intercept:wheel:scope:handle",
        "intercept:wheel",
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
    expect(router.lastStages).toEqual(["arming", "intercept:wheel:scope:handle",
        "intercept:wheel", "mouse", "viewport:wheel"]);

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
    expect(router.dispatch(click(12, 0)), "chrome too").toBe(true);
    expect(seen, "a click beside a confirm still reaches nothing beneath it").toEqual([]);
    expect(router.lastStages).toEqual(["arming", "mouse", "modal"]);

    // **The wheel is carved out, and it is the one gesture that is** (I40, §103).
    // The gate is right about every other: a click moves focus, a drag selects,
    // a press arms — each changes state under a question nobody has answered.
    // A wheel changes none, it moves the viewport so the reader can see, and
    // holding it here is the layer blocking comprehension of its own question.
    // The click assertion above is the control and is what the row was measured
    // on; this is the exception it now carries, not a weakening of it.
    seen.length = 0;
    expect(router.dispatch(click(3, 0, "wheelDown")), "consumed").toBe(true);
    expect(seen, "the viewport moves beneath an unanswered confirm").toEqual(["liveBlock"]);
    expect(layer.top?.id, "and the confirm is neither answered nor dismissed").toBe("confirm");

    // On the layer itself the click is the layer's, as before.
    seen.length = 0;
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
      "ctrl-c (live block) → intercept:interrupt:scope:handle,target:liveBlock",
      "click row 2 → mouse,viewport:row2",
      // **The entry under the pointer is offered the wheel first** (§4a row i):
      // a `scroll` block is a second thing a wheel can mean. The harness's
      // `liveBlock` handler binds nothing, so the wheel falls to the viewport.
      "wheel → intercept:wheel:scope:handle,intercept:wheel,mouse,viewport:row2,viewport:wheel",
      "f (pushed view) → target:pushedView,global,dropped",
      "ctrl-c (confirm) → intercept:interrupt:scope:handle,target:overlay",
      "t (global, under confirm) → target:overlay,modal-blocked,reject",
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

describe("C16 §4a row t — a hover is not an input that disarms", () => {
  it("T3.8d: a hover between two Ctrl-Cs leaves the window armed; a click in its place disarms", () => {
    const hover: InputEvent = { ...(click(2) as Extract<InputEvent, { kind: "mouse" }>), button: "none", motion: true };
    {
      const { router, calls, advance } = harness();
      router.dispatch(ctrlC);
      router.dispatch(hover);
      advance(10);
      router.dispatch(ctrlC);
      expect(calls, "a hand resting on the mouse did not close the window").toEqual(["exitConfirm"]);
    }
    {
      // The control, by the same clock: the click that T3.8b already asserts.
      const { router, calls, advance } = harness();
      router.dispatch(ctrlC);
      router.dispatch(click(2));
      advance(10);
      router.dispatch(ctrlC);
      expect(calls, "a click disarms").toEqual([]);
    }
  });
});

describe("C16 §5 — Ctrl-D, and the one thing C16 stores", () => {
  const ctrlD = key("d", { ctrl: true });

  it("T1.90 (I16): Ctrl-D with text is consumed and discarded — never EOF, never a delete", () => {
    // **A keystroke that sometimes ends the session and sometimes edits the
    // line is one nobody presses twice**, so the row asserts both halves of the
    // discard: no exit confirm is raised, and the prompt is not touched. The
    // second is the one that would go unnoticed — a delete-forward here looks
    // like a working editor until the day the buffer is empty.
    const h = harness({ promptHasText: () => true });
    expect(h.router.dispatch(ctrlD), "consumed").toBe(true);
    expect(h.calls, "no exit, and the buffer untouched").toEqual([]);
  });

  it("T1.90b (I16): Ctrl-D on an empty prompt opens a confirm rather than exiting", () => {
    // Dispatched only when the buffer is empty — and what it dispatches *to* is
    // a confirm. A route that exited here would satisfy "dispatched only when
    // empty" exactly, which is why the two clauses are one row.
    // Two presses inside the window, as Ctrl-C takes: the arming machine is
    // shared, which is the half worth asserting — C16's own walk found an
    // arming machine that answered for one event kind of three, and a
    // per-key copy is exactly what that looks like from outside.
    const h = harness({ promptHasText: () => false });
    expect(h.router.dispatch(ctrlD), "consumed").toBe(true);
    expect(h.calls, "the first press arms and does not exit").toEqual([]);
    h.advance(100);
    expect(h.router.dispatch(ctrlD), "consumed").toBe(true);
    expect(h.calls, "a confirm, not an exit").toEqual(["exitConfirm"]);
  });

  it("T1.90c (I16): Ctrl-D never cancels a stream, where Ctrl-C does", () => {
    // The asymmetry that keeps them two keys. Ctrl-C's subscription rung
    // outranks a half-typed line; Ctrl-D has never been a cancel, and a rung
    // that took both would be invisible to every row above.
    let cancels = 0;
    const h = harness({
      promptHasText: () => false,
      liveStreams: () => 1,
      cancelNewestStream: () => {
        cancels += 1;
        return true;
      },
    });
    h.router.dispatch(ctrlD);
    expect(cancels, "Ctrl-D is not a cancel").toBe(0);

    const c = harness({
      promptHasText: () => false,
      liveStreams: () => 1,
      cancelNewestStream: () => {
        cancels += 1;
        return true;
      },
    });
    c.router.dispatch(ctrlC);
    expect(cancels, "and Ctrl-C is, on the same state").toBe(1);
  });

  it("T1.91 (I1): focus is one stored location, and everything else is derived per dispatch", () => {
    // **`StoredFocus` is a *location*, not a resolved element**, and that is
    // the whole of the invariant: C15, C14 and C13 are consulted on every
    // dispatch, so a store holding anything resolved would be a second source
    // that goes stale exactly when the transcript changes underneath it.
    const h = harness();
    const stored = h.focus.current;
    expect(Object.keys(stored), "a location, and nothing else").toEqual(["at"]);
    expect(stored.at).toBe("prompt");

    // Derived, shown by changing what the *deps* answer and reading focus
    // again with nothing stored having changed. A cached resolution would give
    // the old answer here and no assertion above would notice.
    const before = h.focus.current;
    h.layer.top = { id: "L1" } as unknown as Placed["layer"];
    expect(h.focus.current, "the store did not move").toEqual(before);

    // And the structural half: one stored field, over the declaration, so a
    // second one cannot be added without this failing.
    const types = readFileSync("src/interaction/router/types.ts", "utf8");
    const union = /export type StoredFocus =([\s\S]*?)\n\n/.exec(types);
    expect(union, "StoredFocus' declaration").not.toBeNull();
    const body = union![1]!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(body, "every arm is a location keyed by `at`").toMatch(/at:\s*"prompt"/u);
    expect(body).toMatch(/at:\s*"liveBlock"/u);
  });

  // **The section gesture's row lives with the owners that answer it** — C16
  // I33's claim is about all three, and this file has none of them. It is
  // `T1.3v` in `session-keys.test.ts`, which holds the keymap and the ladder in
  // one place. The id moved too: `T1.3q` was already this file's mouse-modality
  // row above, and §9b row k cites it meaning that one.
});

describe("C16 §3a — the global-intercept table and the child rung (M5)", () => {
  /** Put the router in each rung in turn, by the inputs `activeTarget` reads. */
  const atRung = (rung: string) => {
    const over: Partial<RouterDeps> =
      rung === "child"
        ? { inFlight: () => "shell" }
        : rung === "copy"
          ? { copyMode: () => true }
          : // A question is an overlay *awaiting an answer*, which is the line §5
            // draws and the target name does not.
            rung === "question"
            ? { overlayAnswerCallback: () => () => true }
            : {};
    return harness(over);
  };

  it("T1.32 (R-OWN-001, §103): all three reserved routes are read before the ladder, from inside every rung", () => {
    // **Three, and the wheel is the one a table gets written without.** §103
    // names `interrupt · page-scroll · the wheel` together, and the wheel is not
    // a key — so a classifier reading `InputEvent.key` alone is complete over
    // two thirds of its subject and green. C16 §3a W4 is the row: the tree had
    // one intercept, hand-rolled, and no table.
    const routes: readonly [string, InputEvent][] = [
      ["interrupt", ctrlC],
      ["page-scroll", key("up", { meta: true })],
      ["page-scroll", key("down", { meta: true })],
      ["wheel", click(3, 0, "wheelUp")],
    ];


    // **Every rung, including the two that reject.** A rejection is delivery: the
    // intercept decided, which is the thing being asserted, and a rung that could
    // *claim* one ahead of the table is what "read before the ladder" forbids.
    for (const rung of ["child", "copy", "question", "substate", "inside", "scope"]) {
      for (const [id, event] of routes) {
        const { router, layer, focus } = atRung(rung);
        // The rung-specific state each one needs, set here so the row constructs
        // what it claims rather than asserting against a default prompt.
        if (rung === "question") layer.top = { id: "confirm", kind: "overlay", dismissable: false };
        if (rung === "substate") layer.top = { id: "dash", kind: "view", dismissable: true };
        if (rung === "inside") {
          focus.enterLiveBlock("e1", addr("r1"));
          focus.setMode("interact");
        }
        router.dispatch(event);
        const seen = router.lastStages.find((s) => s.startsWith(`intercept:${id}`));
        expect(seen, `${id} is read at the ${rung} rung — stages were ${router.lastStages.join(",")}`).toBeDefined();
      }
    }
  });

  it("T1.92 (I40): PgUp is the ladder's at every rung, and produces no intercept stage", () => {
    // **`PgUp` is not a reserved route and its absence is asserted** (I40). It
    // occurs in no binding and no rule in the registry, so it is the repo's own
    // key and belongs to the ladder — to the `scroll` box you are inside, else
    // the transcript. Dropping it from the list above without this line would
    // leave the split resting on nothing: a table that reserved it again would
    // pass every row here.
    for (const rung of OWNER_RUNGS) {
      const { router } = atRung(rung);
      router.dispatch(key("pageup"));
      expect(
        router.lastStages.find((st) => st.startsWith("intercept:")),
        `PgUp is the ladder's at the ${rung} rung — stages were ${router.lastStages.join(",")}`,
      ).toBeUndefined();
    }
  });


  it("T1.33 (R-OWN-002, §103): a bare esc reaches the child; only ⌥esc detaches", () => {
    // **The row that decides whether a full-screen program in a child is usable.**
    // `esc` is how vi leaves insert mode and how every curses application cancels,
    // so an `esc` the host consumed to pop a rung is one that program can never
    // receive. §103: the child *takes all but host.detach*.
    const { router } = harness({ inFlight: () => "shell" });
    const hostEscape = vi.fn(() => true);
    router.register("global", hostEscape);

    expect(router.target, "an attached child is the top rung").toBe("child");
    expect(router.dispatch(key("escape")), "consumed by the child, not by the host").toBe(true);
    expect(hostEscape, "nothing above the child acted on it").not.toHaveBeenCalled();
    expect(router.lastStages).toContain("child:esc-to-child");

    // **And the control, which is the half that makes the row a rule rather than
    // a block on `esc`**: the detach chord is *not* the child's, so it takes the
    // ordinary path. Without this the assertion above is satisfied by a router
    // that swallows every escape and can never be left.
    const detach = harness({ inFlight: () => "shell" });
    detach.router.dispatch(key("escape", { meta: true }));
    expect(detach.router.lastStages, "⌥esc is the host's").not.toContain("child:esc-to-child");
  });
});

describe("C16 §7 and §4a — the epoch, the question guard and pointer commit (M7)", () => {
  /** A question: a non-dismissable top layer with an answer callback and a vocabulary. */
  const withQuestion = (opts: Partial<RouterDeps> = {}) => {
    const q = { open: false };
    const h = harness({
      overlayTop: () => (q.open ? { kind: "overlay" as const, id: "confirm", dismissable: false } : null),
      overlayAnswerCallback: () => (q.open ? (): boolean => true : null),
      // `y` and `⏎` resolve; an arrow moves the selection and `x` does nothing.
      // The vocabulary is the question's, which is the whole reason the router
      // asks rather than deciding (C16 I25, I44).
      overlayWouldResolve: () =>
        q.open
          ? (e: InputEvent): boolean =>
              e.kind === "key" && (e.key.name === "y" || e.key.name === "enter")
          : null,
      ...opts,
    });
    return { ...h, q };
  };

  it("T1.98 (I43, I44, R-BLK-786): a question arriving guards the router and moves the epoch", () => {
    const { router, q } = withQuestion();
    const epoch0 = router.ownerEpoch;
    expect(router.ownerArmed, "nothing is guarded before one arrives").toBe(false);

    q.open = true;
    expect(router.ownerEpoch, "every owner transition increments the generation").toBe(epoch0 + 1);
    expect(router.ownerArmed).toBe(true);
  });

  it("T1.98b (I43, I44): unguarded, an activation is handled and the epoch does not move", () => {
    // **The control, and without it T1.98 is a restatement of *nothing
    // happened*.** A router that guarded everything, or nothing, passes one of
    // the two rows; only the pair pins the guard to a question arriving.
    const { router, q } = withQuestion();
    q.open = true;
    const epoch = router.ownerEpoch;
    router.dispatch(key("x")); // a neutral key ends the guard
    expect(router.ownerArmed).toBe(false);
    expect(router.dispatch(key("y")), "the question takes it").toBe(true);
    expect(router.lastStages).not.toContain("question-guard");
    expect(router.ownerEpoch, "no owner changed, so the generation did not move").toBe(epoch);
  });

  it("T1.99 (I44, R-BLK-788): with no release reporting the first activation is refused and the guard ends", () => {
    const { router, q } = withQuestion();
    q.open = true;

    expect(router.dispatch(key("y")), "refused, and consumed — never dropped").toBe(true);
    expect(router.lastStages).toEqual(["arming", "question-guard", "reject"]);

    expect(router.dispatch(key("y")), "the second is the reader's own").toBe(true);
    expect(router.lastStages).not.toContain("question-guard");
  });

  it("T1.99b (I44): a neutral key is handled and ends the guard", () => {
    // An arrow under a question that has just arrived is how a reader reads what
    // arrived. Guarding it would close the failure I40 opened on the scroll side.
    const { router, q } = withQuestion();
    q.open = true;

    expect(router.dispatch(key("down")), "neutral: the question's, unrefused").toBe(true);
    expect(router.lastStages).not.toContain("question-guard");
    expect(router.ownerArmed).toBe(false);
    expect(router.dispatch(key("y"))).toBe(true);
    expect(router.lastStages).not.toContain("question-guard");
  });

  it("T1.99c (I43, I44, §4a W8): a rung change that is not a question arriving guards nothing", () => {
    // Trace 19, and the row a single field cannot pass: the epoch moves on every
    // transition and the guard is a question's alone, so the keystroke after a
    // question closes is the reader typing and is not refused.
    const { router, q } = withQuestion();
    q.open = true;
    router.dispatch(key("y")); // spend the guard on the arrival
    const epoch = router.ownerEpoch;

    q.open = false;
    expect(router.ownerEpoch, "the fall moves the generation too").toBe(epoch + 1);
    expect(router.ownerArmed, "and guards nothing").toBe(false);
  });

  it("T1.99d, T1.99e (I44, R-BLK-788): with releases reported the guard waits for the key to lift", () => {
    const { router, q } = withQuestion({ keyReleasesReported: () => true });
    // **The key is held first, and that is what the guard is for.** With
    // releases reported the router knows whether anything is down when the
    // question arrives; with nothing down there is nothing to wait for, which
    // T1.99f is the control for.
    router.dispatch(key("y"));
    q.open = true;

    // **All three refused, not just the first.** *Wait for the held key to lift*
    // is an instruction only a terminal that says when it lifted can be given,
    // and this one does.
    for (const n of [1, 2, 3]) {
      expect(router.dispatch(key("y")), `refused ${String(n)}`).toBe(true);
      expect(router.lastStages, `refused ${String(n)}`).toContain("question-guard");
    }

    router.dispatch({ kind: "key", event: "release", key: { name: "y", ctrl: false, meta: false, shift: false, sequence: "y" } });
    expect(router.ownerArmed, "the key lifted").toBe(false);
    expect(router.dispatch(key("y"))).toBe(true);
    expect(router.lastStages).not.toContain("question-guard");
  });

  it("T3.20 (I44, §4a W9): the guard reads no clock", () => {
    // **The assertion a 500 ms window fails**, and it fails in both directions:
    // it would let this one through and it would refuse the one in T1.99b.
    const { router, q, advance } = withQuestion({ keyReleasesReported: () => true });
    router.dispatch(key("y"));
    q.open = true;
    advance(3_600_000);
    expect(router.dispatch(key("y")), "an hour later, still held, still refused").toBe(true);
    expect(router.lastStages).toContain("question-guard");
  });

  it("T1.99f (I44, R-BLK-788): with releases reported and nothing held, a question guards nothing", () => {
    // *Wait for the held key to lift* presupposes a held key. This is the
    // control that makes T1.99d an assertion about a **held** key rather than
    // about questions in general, and it is the row that keeps the precise arm
    // from collapsing into the conservative one.
    const { router, q } = withQuestion({ keyReleasesReported: () => true });
    router.dispatch(key("x"));
    router.dispatch({ kind: "key", event: "release", key: { name: "x", ctrl: false, meta: false, shift: false, sequence: "x" } });
    q.open = true;
    expect(router.ownerArmed, "nothing was down when it arrived").toBe(false);
    expect(router.dispatch(key("y"))).toBe(true);
    expect(router.lastStages).not.toContain("question-guard");
  });

  it("T1.100, T1.101 (I45, I46, R-OWN-003): press arms, release commits, and nothing else does", () => {
    const { router } = harness();
    const epoch = router.ownerEpoch;

    // The control first: a release with nothing armed commits nothing.
    expect(router.commitPointer("a"), "no press, no commit").toBe(false);

    router.armPointer("a");
    expect(router.commitPointer("b"), "a release elsewhere cancels").toBe(false);
    expect(router.commitPointer("a"), "and the cancel was not a miss — the arm is gone").toBe(false);

    router.armPointer("a");
    expect(router.commitPointer("a"), "the armed identity, same epoch").toBe(true);
    expect(router.commitPointer("a"), "and once only — the release spent it").toBe(false);
    expect(router.ownerEpoch, "arming and committing move no owner").toBe(epoch);
  });

  it("T1.101b (I46): a drag cancels the arm, and coming back does not restore it", () => {
    // Where the arm parts company with a selection: a selection is resolved
    // afresh on every motion and survives an excursion (§4a trace 4); an
    // activation is a commitment a drag revokes (trace 15).
    const { router } = harness();
    router.armPointer("a");
    router.dispatch({ ...(click(1, 1) as Extract<InputEvent, { kind: "mouse" }>), motion: true });
    expect(router.commitPointer("a"), "the drag took it back").toBe(false);
  });

  it("T1.102 (I45, R-OWN-002): an arm does not survive the owner it was armed under", () => {
    // Trace 16: the element is still there and still under the pointer, and the
    // owner it was armed under is gone. The epoch is what carries that.
    const { router, q } = withQuestion();
    router.armPointer("a");
    q.open = true;
    expect(router.commitPointer("a")).toBe(false);
  });

  it("T1.102b (I46): resetFocus cancels the arm", () => {
    const { router } = harness();
    router.armPointer("a");
    router.resetFocus();
    expect(router.commitPointer("a")).toBe(false);
  });
});
