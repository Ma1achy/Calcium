/**
 * C16 §4, §5, §7 — dispatch, the ladder, and the arming machine.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createFocusStore } from "../../src/interaction/router/focus.js";
import { createKeymap, defaultKeymap } from "../../src/interaction/router/keymap.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";
import { createDecoder } from "../../src/interaction/router/decode.js";
import {
  INTERCEPTS,
  interceptOf,
  interceptVerdict,
  isExactCtrlC,
  type InterceptId,
} from "../../src/interaction/router/intercepts.js";
import { createRouter, type Placed, type Refusal, type RouterDeps } from "../../src/interaction/router/router.js";
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
  layer: { id, kind: "overlay", blocking: false, dismissal: "escape" },
  ...at,
});

function harness(over: Partial<RouterDeps> = {}, start = 1_000, keymap = createKeymap([])) {
  let t = start;
  const calls: string[] = [];
  // **Its own list, not `calls`** (C16 I62): a refusal is an explanation, not an
  // action, and a row asserting what acted must not have to subtract it.
  const refusals: Refusal[] = [];
  // `generation` is C16 I73's pull, moved by a row that raises or removes an
  // owner the rung cannot see.
  const layer = { top: null as ReturnType<RouterDeps["overlayTop"]>, placed: [] as Placed[], generation: 0 };
  const deps: RouterDeps = {
    keyReleasesReported: () => false,
    ownerGeneration: () => layer.generation,
    // **The `child` rung's second source** (C16 I49). Required rather than
    // optional, so a harness that means to attach one has to say so.
    childAttached: () => false,
    overlayWouldResolve: () => null,
    overlayAnswerCallback: () => null,
    overlayTop: () => layer.top,
    overlayRegion: () => ({ width: 80, height: 24 }),
    placed: () => layer.placed,
    // C16 I74 — each layer's scroller, logged; `false` is *nothing to scroll*.
    scrollLayer: (id, notches) => (calls.push(`scroll:${id}:${String(notches)}`), true),
    // C16 I75 — the escape's detach, logged.
    detachChild: () => void calls.push("detach"),
    popLayer: () => void calls.push("pop"),
    nativeSelection: () => false,
    semanticSelection: () => false,
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
    refused: (r) => void refusals.push(r),
    ...over,
  };
  const focus = createFocusStore();
  const router = createRouter({ focus, keymap, now: () => t, deps });
  return { router, focus, calls, refusals, layer, advance: (ms: number) => (t += ms) };
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

    layer.top = { id: "menu", kind: "overlay", blocking: false, dismissal: "escape" };
    expect(router.dispatch(key("t")), "dismissable: a theme switch is harmless").toBe(true);
    expect(globalHandler).toHaveBeenCalledTimes(1);

    layer.top = { id: "confirm", kind: "overlay", blocking: true, dismissal: "answer" };
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
    // **A panel on top, where this was a confirm** (review batch 2, I62). A
    // question rejects the interrupt before rung 1 is read, so under one the
    // verb is *not* cancelled — T4.81b. A panel's rung handles it, and rung 1 is
    // still ahead of the panel's own pop: the promote, not the pop.
    const { router, calls, layer } = harness({ inFlight: () => "app" });
    layer.top = { id: "menu", kind: "panel", blocking: false, dismissal: "escape" };

    expect(router.dispatch(ctrlC)).toBe(true);
    expect(calls, "not the panel's pop — the promote").toEqual(["cancel"]);
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
    // key, which is the native-selection ordering applied to the new rung.
    const modal = harness({ ...stream, promptHasText: () => true });
    modal.layer.top = { id: "confirm", kind: "overlay", blocking: true, dismissal: "answer" };
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

  it("T1.12, T1.12b (I8, I62): a confirm refuses ⌃c once, and nothing beneath it moves", () => {
    const { router, calls, refusals, layer } = harness({ nativeSelection: () => true });
    layer.top = { id: "confirm", kind: "overlay", blocking: true, dismissal: "answer" };

    expect(router.dispatch(ctrlC), "consumed").toBe(true);
    expect(calls, "native selection is untouched and no layer popped").toEqual([]);
    expect(refusals, "refused once, at the question").toEqual([{ rung: "question", cause: "intercept" }]);
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
      const declared = Object.keys(INTERCEPTS[id]).filter(
        (k) => k !== "idle" && k !== "why" && k !== "exception",
      );
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
    layer.top = { id: "confirm", kind: "overlay", blocking: true, dismissal: "answer" };
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
      "intercept:page-scroll:question:global-intercept",
      "intercept:scroll:transcript",
    ]);

    // **The control, and it is the reason this is not a test of "⌥↑ is special".**
    // `⌃c` is a reserved route at the same rung with the other verdict, so it
    // takes the other road: `reject` consumes it and runs no rung (I62), where
    // `global-intercept` takes the route's exception. Without this row the
    // assertions above are equally passed by a router that sends every
    // intercept to the scroller, which would answer the question by scrolling it.
    //
    // *It read "`reject` resolves at the owning rung"* until review batch 2, and
    // that was the defect: the rung it resolved at answered the question.
    calls.length = 0;
    expect(router.dispatch(ctrlC)).toBe(true);
    expect(router.lastStages, "the refusal's road, not the viewport's").toEqual([
      "arming",
      "intercept:interrupt:question:reject",
      "reject",
    ]);
    expect(calls, "an interrupt does not scroll").toEqual([]);
    expect(offered, "and the question was not offered it").toEqual([]);
    expect(layer.top?.id, "and it did not dismiss the question either").toBe("confirm");
  });

  it("T1.41f (I51, I62, §5d D5): ⌃c in semantic copy mode is refused — consumed, and no rung runs", () => {
    // **Inverted in review batch 2** (ruling 59). This asserted `["exitSemantic"]`
    // — the ladder reaching the mode's exit — and §103 has COPY MODE reject the
    // interrupt. A handler registered at the target is the probe: a reject that
    // still ran the owning rung would reach it.
    const { router, calls, refusals } = harness({ semanticSelection: () => true });
    router.register("semanticSelection", () => (calls.push("rung"), true));

    expect(router.dispatch(key("c", { ctrl: true }))).toBe(true);
    expect(calls, "the mode's rung is not run").toEqual([]);
    expect(refusals, "and the refusal is handed on, once").toEqual([{ rung: "copy", cause: "intercept" }]);
  });

  it("T1.41g (I50): the `copy` rung's intercepts answer for both modes, not just the handoff", () => {
    // I50's point stated where it could fail: every rule written over the
    // ladder reads `RUNG_OF`, so `page-scroll`'s `reject` at `copy` covers this
    // mode without a second row. A target mapped to a rung of its own would
    // fall through here and scroll a screen that is deliberately still.
    const { router, calls } = harness({ semanticSelection: () => true });
    router.register("global", () => (calls.push("scroll"), true));

    expect(router.dispatch(key("up", { meta: true })), "consumed, not dropped").toBe(true);
    expect(calls).toEqual([]);
    expect(router.lastStages).toEqual(["arming", "intercept:page-scroll:copy:reject", "reject"]);
  });

  it("T1.40b (I40): ⌥↑ in native selection is rejected and the frozen screen does not move", () => {
    const { router, calls } = harness({ nativeSelection: () => true });
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
    layer.top = { id: "menu", kind: "overlay", blocking: false, dismissal: "escape" };
    layer.placed = [box("menu", { top: 4, left: 10, height: 6, width: 30 })];
    expect(router.dispatch(reserved)).toBe(true);
    expect(router.dispatch(ordinary)).toBe(true);
    expect(calls).toEqual(["up", "pageup"]);

    calls.length = 0;
    // **`blocking: true`, declared** (M8, C15 I26). A full-region layer owns
    // input, and under the old predicate the box said so on its behalf. A
    // fixture left at `false` is a full-region layer that blocks nothing, which
    // is now a thing the type can say and this row does not mean.
    //
    // **The kind was `view` and is `overlay`** (R-EXA-082, F1254): what this row
    // is about is a layer whose *box* covers the region, which is a placement
    // and never was a kind — the whole of why `coversRegion` was replaced by a
    // declared `blocking`.
    layer.top = { id: "dash", kind: "overlay", blocking: true, dismissal: "escape" };
    layer.placed = [box("dash", { top: 0, left: 0, height: 24, width: 80 })];

    // The reserved route reaches the viewport scroller, ahead of the ladder.
    expect(router.dispatch(reserved), "consumed").toBe(true);
    expect(calls, "a reader under a full-region layer can still page").toEqual(["up"]);
    expect(router.lastStages).toEqual([
      "arming",
      // **`question`, where it was `scope`** (C16 I63, review batch 2). An
      // overlay that declares no owner is a question, and the footer, the guard
      // and the epoch always said so; the intercept table alone said `scope`,
      // because it asked whether an answer callback was registered. One rung
      // now, and the reader can still page from it.
      "intercept:page-scroll:question:global-intercept",
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

  it("T1.31 (I8, C15 I26): modality is read from `blocking`, not from the box", () => {
    // **The geometry is now irrelevant, and both boxes are built to disagree
    // with their flags so that a row whose numbers agree cannot pass by
    // accident.** A full-region layer that declares it blocks nothing lets the
    // global keymap through; a one-row layer that declares it owns input holds
    // it. Neither is expressible by a coverage test, and under the old
    // predicate each is wrong in the opposite direction.
    const { router, calls, layer } = harness();
    router.register("global", () => (calls.push("global"), true));

    // Spans the region, blocks nothing — a peek-shaped thing drawn large.
    layer.top = { id: "wide", kind: "overlay", blocking: false, dismissal: "answer" };
    layer.placed = [box("wide", { top: 0, left: 0, height: 24, width: 80 })];
    expect(router.dispatch(key("pageup"))).toBe(true);
    expect(calls, "a full-region layer that owns no input holds no key").toEqual(["global"]);

    // One row, and it owns input — §101's typed reply, the combination the
    // coverage test could never answer for.
    calls.length = 0;
    layer.top = { id: "reply", kind: "overlay", blocking: true, dismissal: "answer" };
    layer.placed = [box("reply", { top: 20, left: 0, height: 1, width: 80 })];
    // **Consumed, not dropped** (M5, §103, R-OWN-001): a blocking layer REJECTS
    // the key rather than letting it fall, and a reject spends the event exactly
    // as a handle does. The invariant this row is about — *nothing reaches past
    // it* — is the `calls` assertion beside this line.
    expect(router.dispatch(key("pageup"))).toBe(true);
    expect(calls, "and a one-row layer that does own it holds every key").toEqual([]);
  });

  it("a panel pops on ⌃c; an overlay does not", () => {
    // **Amended in review batch 2** (I62, I63). This popped an escapable
    // *overlay* on `⌃c`, which was the ladder's `overlay` handler's second
    // clause. An overlay's rung is `question`, which rejects the interrupt, so
    // the clause is gone; what pops is the substate, a panel.
    const { router, calls, layer } = harness();
    layer.top = { id: "dash", kind: "panel", blocking: false, dismissal: "escape" };
    router.dispatch(ctrlC);
    expect(calls).toEqual(["pop"]);

    layer.top = { id: "menu", kind: "overlay", blocking: false, dismissal: "escape" };
    router.dispatch(ctrlC);
    expect(calls, "the overlay is not popped").toEqual(["pop"]);
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
    // permutation. **A panel over the live block** is the pair now: an overlay
    // over native selection was, and both of those rungs refuse `⌃c` (I62), so
    // neither can show an order by acting.
    const { router, focus, calls, layer } = harness();
    focus.enterLiveBlock("e1", addr("r3"));
    layer.top = { id: "dash", kind: "panel", blocking: false, dismissal: "escape" };
    router.dispatch(ctrlC);
    expect(calls, "the panel beats the live block").toEqual(["pop"]);
    expect(focus.current.at, "and focus stayed where it was").not.toBe("prompt");
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
      { layer: { id: "confirm", kind: "overlay", blocking: true, dismissal: "answer" }, top: 2, left: 10, height: 3, width: 20 },
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
      { layer: { id: "menu", kind: "overlay", blocking: false, dismissal: "escape" }, top: 0, left: 0, height: 1, width: 40 },
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
        "intercept:wheel:scope:global-intercept",
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
    expect(router.lastStages).toEqual(["arming", "intercept:wheel:scope:global-intercept",
        "intercept:wheel", "mouse", "viewport:wheel"]);

    // T3.12b's half, kept: a layer covering the point takes it and nothing else sees it.
    seen.length = 0;
    layer.placed = [
      { layer: { id: "menu", kind: "overlay", blocking: false, dismissal: "escape" }, top: 2, left: 0, height: 1, width: 40 },
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
    layer.top = { id: "confirm", kind: "overlay", blocking: true, dismissal: "answer" };
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

    // **An escapable layer is not modal, and a click beside it is still not
    // passed down** (I47, R-BLK-779): *a click off it CLOSES it, and the click
    // stops there*. One gesture, one effect — the dismissal is the effect.
    seen.length = 0;
    layer.top = { id: "menu", kind: "overlay", blocking: false, dismissal: "escape" };
    layer.placed = [];
    expect(router.dispatch(click(3, 0)), "consumed by the dismissal").toBe(true);
    expect(seen, "and nothing beneath it is reached").toEqual([]);
    expect(router.lastStages).toEqual(["arming", "mouse", "dismiss"]);

    // **Non-modality survives on the wheel**, which is where this row now reads
    // it: the gesture that moves a viewport without changing state, under an
    // escapable top exactly as under a blocking one (I40).
    seen.length = 0;
    layer.top = { id: "menu", kind: "overlay", blocking: false, dismissal: "escape" };
    layer.placed = [];
    expect(router.dispatch(click(3, 0, "wheelDown")), "consumed").toBe(true);
    expect(seen, "the viewport moves beneath a menu").toEqual(["liveBlock"]);
    expect(layer.top?.id, "and the menu is not dismissed by a wheel").toBe("menu");
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
      { layer: { id: "menu", kind: "overlay", blocking: false, dismissal: "escape" }, top: 0, left: 0, height: 9, width: 40 },
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
    layer.top = { id: "menu", kind: "overlay", blocking: false, dismissal: "escape" };
    step("down (menu open)", key("down"));
    layer.top = null;
    step("down (menu gone)", key("down"));
    focus.enterLiveBlock("e1", addr("r1"));
    step("s (block keymap)", key("s"));
    step("ctrl-c (live block)", ctrlC);
    step("click row 2", click(3));
    step("wheel", click(3, 0, "wheelUp"));
    layer.top = { id: "dash", kind: "panel", blocking: false, dismissal: "escape" };
    step("f (panel)", key("f"));
    layer.top = { id: "confirm", kind: "overlay", blocking: true, dismissal: "answer" };
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
      "wheel → intercept:wheel:scope:global-intercept,intercept:wheel,mouse,viewport:row2,viewport:wheel",
      "f (panel) → target:panel,global,dropped",
      // A question refuses the interrupt and runs no rung (I62, I63). It read
      // `scope:handle,target:overlay` — the table's second derivation.
      "ctrl-c (confirm) → intercept:interrupt:question:reject,reject",
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
  it("T2.6a (C26 §8b.8, I26, C22 I78): one caller merges a block keymap, and it puts nothing at interaction", () => {
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
    // they land at `liveBlock` and the inside's rows are the framework's alone.
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
    // **Each digit twice, at `liveBlock` and at `interaction`** (C16 I27, C26
    // I2). None collides, so each keeps its `liveBlock` row and gains the
    // block's inside — without which entering the plot to orbit it would take
    // its series toggles away, silently.
    expect(new Set(merged.map((b) => b.target)), "both targets, no third").toEqual(
      new Set(["liveBlock", "interaction"]),
    );
    expect(merged.filter((b) => b.target === "liveBlock").map((b) => b.key.name)).toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    );
    // **The mode's rows are the inside's own, and the merge adds none**
    // (C26 I26, I27, §102). The row read *the mode has no bindings*, and that
    // was the state §8b.8's refusal rested on — §102 put the camera family
    // here, since *KEYBOARD CONTROLS APPEAR ONLY INSIDE* leaves them no other
    // target. What this row still measures is what it was written for: the one
    // production merge contributes nothing to it.
    const framework = map
      .entries()
      .slice(0, before)
      .filter((b) => b.target === "interaction")
      .map((b) => b.action);
    // `copyElement` is the inside's `copy` (C16 §6c, ruling 65): the element
    // the reader is inside is what copy takes. Once, because this map is the
    // default profile's and the `⌃⇧C` row is enhanced-only.
    expect(framework.sort(), "the inside's own, and the merge adds none of them").toEqual(
      // `keepField` is the held field's `⏎` (C22 I118, C22 I133): the field is
      // the rung's other owner, and a framework row, not a merge.
      ["cameraReset", "copyElement", "dollyIn", "dollyIn", "dollyOut", "exitInside", "insideDown", "insideLeft", "insideRight", "insideUp", "keepField", "orbitToggle"],
    );
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
    h.layer.top = { id: "L1" } as unknown as ReturnType<RouterDeps["overlayTop"]>;
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
  const atRung = (rung: string, answered: string[] = []) => {
    const over: Partial<RouterDeps> =
      rung === "child"
        ? { childAttached: () => true }
        : rung === "copy"
          ? { nativeSelection: () => true }
          : // The question's callback would answer anything it is offered, and
            // records what it was offered — which is how a cell sees a rung
            // that ran when it should not have.
            rung === "question"
            ? { overlayAnswerCallback: () => (e: InputEvent) => (answered.push(e.kind), true) }
            : {};
    return harness({ promptHasText: () => true, ...over });
  };

  it("T1.166 (I64, R-OWN-001, §103): the reserved routes by outcome, three routes over every rung", () => {
    // **By outcome, where this was a stage-only row** (review batch 2, I64). It
    // was T1.32 and asserted that an `intercept:<id>` stage appeared at every
    // rung — which a router refusing every intercept, or scrolling on every one,
    // passes equally. Three routes × six rungs, each cell the thing that
    // happened: who was offered the event, whether anything scrolled, and
    // whether a refusal was handed on. The id moved because this spec's T1.32
    // is I24's.
    //
    // **The wheel is the one a table gets written without.** §103 names
    // `interrupt · page-scroll · the wheel` together, and the wheel is not a key.
    const routes: readonly [string, InputEvent][] = [
      ["interrupt", ctrlC],
      ["page-scroll", key("up", { meta: true })],
      ["wheel", click(3, 0, "wheelUp")],
    ];
    const TARGET_OF = {
      child: "child",
      copy: "nativeSelection",
      question: "overlay",
      substate: "panel",
      inside: "interaction",
      scope: "prompt",
    } as const;
    // What each cell must read as — `offered` is whether the rung's own
    // handlers saw the event, `scrolled` how many times the scroller ran.
    const expected: Record<string, Record<string, Readonly<{ offered: boolean; scrolled: number; refused: number; did: readonly string[] }>>> = {
      interrupt: {
        child: { offered: true, scrolled: 0, refused: 0, did: [] },
        copy: { offered: false, scrolled: 0, refused: 1, did: [] },
        question: { offered: false, scrolled: 0, refused: 1, did: [] },
        substate: { offered: true, scrolled: 0, refused: 0, did: ["pop"] },
        inside: { offered: true, scrolled: 0, refused: 0, did: ["navigate"] },
        scope: { offered: true, scrolled: 0, refused: 0, did: ["clearPrompt"] },
      },
      "page-scroll": Object.fromEntries(
        OWNER_RUNGS.map((r) => [r, r === "copy"
          ? { offered: false, scrolled: 0, refused: 1, did: [] }
          : { offered: false, scrolled: 1, refused: 0, did: [] }]),
      ),
      wheel: Object.fromEntries(
        OWNER_RUNGS.map((r) => [r, r === "copy"
          ? { offered: false, scrolled: 0, refused: 1, did: [] }
          : { offered: false, scrolled: 1, refused: 0, did: [] }]),
      ),
    };

    for (const rung of OWNER_RUNGS) {
      for (const [id, event] of routes) {
        const answered: string[] = [];
        const { router, layer, focus, calls, refusals } = atRung(rung, answered);
        if (rung === "question") layer.top = { id: "confirm", kind: "overlay", blocking: true, dismissal: "answer" };
        if (rung === "substate") layer.top = { id: "dash", kind: "panel", blocking: false, dismissal: "escape" };
        if (rung === "inside") {
          focus.enterLiveBlock("e1", addr("r1"));
          focus.setMode("interact");
        }
        // The probe passes everywhere but at the child, which consumes what it
        // is handed exactly as an attached surface does (I49).
        const offered: string[] = [];
        router.register(TARGET_OF[rung], (e) => (offered.push(e.kind), rung === "child"), { first: true });
        let scrolled = 0;
        router.register("global", () => ((scrolled += 1), true));

        router.dispatch(event);
        const did = [...calls, ...(rung === "inside" && focus.current.at === "liveBlock" && focus.current.mode === "navigate" ? ["navigate"] : [])];
        const want = expected[id]?.[rung];
        const where = `${id} at ${rung} — stages ${router.lastStages.join(",")}`;
        expect(router.lastStages.some((st) => st.startsWith(`intercept:${id}:${rung}:`)), `${where}: read before the ladder`).toBe(true);
        expect(offered.length > 0, `${where}: offered to the rung`).toBe(want?.offered);
        expect(scrolled, `${where}: scrolled`).toBe(want?.scrolled);
        expect(refusals.length, `${where}: refused`).toBe(want?.refused);
        expect(did, `${where}: what acted`).toEqual(want?.did);
        // A question's own callback is never offered a reserved route: it
        // either refuses (interrupt) or is stepped over (the other two).
        expect(answered, `${where}: the question was offered nothing`).toEqual([]);
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

  it("T1.200 (I40, C22 I143): the page-scroll intercept is ⌥↑/⌥↓ exactly — ⌥⇧ and ⌃⌥ arrows are the ladder's at every rung", () => {
    // **The predicate read *meta and an arrow***, so `⌥⇧↓` — the chip
    // preview's own scroll chord (`R-KEY-010`) — paged the transcript and never
    // reached the panel (F1442). The row is the
    // pair: the exact chord still intercepts, so the refusal below is not a
    // route that intercepts nothing.
    const stage = (rung: string, e: InputEvent): string | undefined => {
      const { router } = atRung(rung);
      router.dispatch(e);
      return router.lastStages.find((st) => st.startsWith("intercept:"));
    };
    for (const rung of OWNER_RUNGS.filter((r) => r !== "copy")) {
      for (const name of ["up", "down"]) {
        expect(stage(rung, key(name, { meta: true })), `⌥${name} at ${rung}`).toMatch(/^intercept:page-scroll\b/u);
        expect(stage(rung, key(name, { meta: true, shift: true })), `⌥⇧${name} at ${rung}`).toBeUndefined();
        expect(stage(rung, key(name, { meta: true, ctrl: true })), `⌃⌥${name} at ${rung}`).toBeUndefined();
      }
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
      overlayTop: () => (q.open ? { kind: "overlay" as const, id: "confirm", blocking: true, dismissal: "answer" } : null),
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

  // **The epoch is read through what it is for** (I73): a pointer arm taken in
  // one epoch commits only in that epoch, so an arm that survives is an epoch
  // that did not move. The getter these rows read went private with I73.

  it("T1.98 (I43, I44, R-BLK-786): a question arriving guards the router and kills an arm taken before it", () => {
    const { router, q } = withQuestion();
    expect(router.ownerArmed, "nothing is guarded before one arrives").toBe(false);
    router.armPointer("a");

    q.open = true;
    expect(router.ownerArmed).toBe(true);
    expect(router.commitPointer("a"), "every owner transition moves the epoch").toBe(false);
  });

  it("T1.98b (I43, I44): unguarded, an activation is handled and an arm survives it", () => {
    // **The control, and without it T1.98 is a restatement of *nothing
    // happened*.** A router that guarded everything, or nothing, passes one of
    // the two rows; only the pair pins the guard to a question arriving.
    const { router, q } = withQuestion();
    q.open = true;
    router.dispatch(key("x")); // a neutral key ends the guard
    expect(router.ownerArmed).toBe(false);
    router.armPointer("a");
    expect(router.dispatch(key("y")), "the question takes it").toBe(true);
    expect(router.lastStages).not.toContain("question-guard");
    expect(router.commitPointer("a"), "no owner changed, so the epoch did not move").toBe(true);
  });

  it("T1.99 (I44, I69, R-BLK-788): with no release reporting an activation is refused, and one past the grace and the gap answers", () => {
    const { router, q, advance } = withQuestion();
    q.open = true;
    expect(router.ownerArmed).toBe(true);

    expect(router.dispatch(key("y")), "refused, and consumed — never dropped").toBe(true);
    expect(router.lastStages).toEqual(["arming", "question-guard", "reject"]);
    // **The second is refused too** (I69): it arrived inside the grace, and a
    // held key's repeat is a second press this terminal cannot tell apart.
    expect(router.dispatch(key("y"))).toBe(true);
    expect(router.lastStages).toContain("question-guard");

    advance(1_000);
    expect(router.dispatch(key("y")), "the reader's own, after a pause").toBe(true);
    expect(router.lastStages).not.toContain("question-guard");
  });

  it("T1.160 (cont., I61, I44): a focus report is never routed — the guard still refuses the key after it", () => {
    const { router, q } = withQuestion();
    q.open = true;
    router.dispatch(key("x"));
    const before = router.lastStages;
    // Returning to the window with a question waiting is not an answer, and not
    // the neutral key that would end the guard.
    const again = withQuestion();
    again.q.open = true;
    expect(again.router.dispatch({ kind: "focus", focused: true }), "not routed").toBe(false);
    expect(again.router.ownerArmed, "the guard is untouched").toBe(true);
    expect(again.router.dispatch(key("y")), "refused, as the first activation").toBe(true);
    expect(again.router.lastStages).toEqual(["arming", "question-guard", "reject"]);
    // And a focus report leaves the last dispatch's stages as they were.
    router.dispatch({ kind: "focus", focused: false });
    expect(router.lastStages).toEqual(before);
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
    router.dispatch(key("x")); // end the guard on the arrival
    router.armPointer("a");

    q.open = false;
    expect(router.commitPointer("a"), "the fall moves the epoch too").toBe(false);
    expect(router.ownerArmed, "and guards nothing").toBe(false);

    // **And a question gone takes its guard with it** (I73): closed with the
    // guard still live, a guard left behind would refuse a row's `⏎` at `scope`.
    const closed = withQuestion();
    closed.q.open = true;
    expect(closed.router.ownerArmed).toBe(true);
    closed.q.open = false;
    expect(closed.router.ownerArmed, "nothing is guarded once the question is gone").toBe(false);
  });

  it("T1.99d, T1.99e (I44, R-BLK-788): with releases reported the guard waits for the key to lift", () => {
    const { router, q, advance } = withQuestion({ keyReleasesReported: () => true });
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
      // **An hour before the third, and it changes nothing** — T3.20's
      // surviving half (I69): this arm reads no clock.
      if (n === 3) advance(3_600_000);
      expect(router.dispatch(key("y")), `refused ${String(n)}`).toBe(true);
      expect(router.lastStages, `refused ${String(n)}`).toContain("question-guard");
    }

    router.dispatch({ kind: "key", event: "release", key: { name: "y", ctrl: false, meta: false, shift: false, sequence: "y" } });
    expect(router.ownerArmed, "the key lifted").toBe(false);
    expect(router.dispatch(key("y"))).toBe(true);
    expect(router.lastStages).not.toContain("question-guard");
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

    // The control first: a release with nothing armed commits nothing.
    expect(router.commitPointer("a"), "no press, no commit").toBe(false);

    router.armPointer("a");
    expect(router.commitPointer("b"), "a release elsewhere cancels").toBe(false);
    expect(router.commitPointer("a"), "and the cancel was not a miss — the arm is gone").toBe(false);

    router.armPointer("a");
    expect(router.commitPointer("a"), "the armed identity, same epoch").toBe(true);
    expect(router.commitPointer("a"), "and once only — the release spent it").toBe(false);
    // Arming and committing move no owner: a second arm commits as the first did.
    router.armPointer("a");
    expect(router.commitPointer("a")).toBe(true);
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

describe("C16 §4a — the dismissing click and the scroll order (M8)", () => {
  const PANEL = { id: "menu", kind: "panel", blocking: false, dismissal: "escape" } as const;

  it("T1.103 (I47, R-BLK-854, R-BLK-855): a press beside a panel closes it and reaches no target", () => {
    // *The thing you meant to hit was covered a moment ago*, so a press that
    // closed the panel **and** activated what was underneath would act on
    // something the reader could not see when they decided to press. One
    // gesture, one effect.
    const { router, layer, calls } = harness();
    const seen: string[] = [];
    router.register("liveBlock", () => (seen.push("liveBlock"), true));
    router.register("panel", () => (seen.push("panel"), true));

    layer.top = PANEL;
    layer.placed = [{ layer: PANEL, top: 5, left: 10, height: 3, width: 20 }];

    expect(router.dispatch(click(3, 0)), "consumed by the dismissal").toBe(true);
    expect(calls, "and it is the layer that was closed").toEqual(["pop"]);
    expect(seen, "nothing beneath it was reached").toEqual([]);
    expect(router.lastStages).toEqual(["arming", "mouse", "dismiss"]);
  });

  it("T1.103b (I47, I8): a press on the panel is the panel's; beside a blocking layer it is neither", () => {
    // **The three cells are what separate *dismisses* from *acts* from *does
    // neither*.** A row holding one of them passes for a router that answers
    // the same way in all three.
    const { router, layer, calls } = harness();
    const seen: string[] = [];
    router.register("liveBlock", () => (seen.push("liveBlock"), true));
    router.register("panel", () => (seen.push("panel"), true));

    // On it: the panel's, and it is not closed.
    layer.top = PANEL;
    layer.placed = [{ layer: PANEL, top: 5, left: 10, height: 3, width: 20 }];
    // Region top is 1, so terminal row 7 is region row 6 — inside [5, 8).
    expect(router.dispatch(click(7, 12)), "consumed").toBe(true);
    expect(seen).toEqual(["panel"]);
    expect(calls, "acting on a panel does not close it").toEqual([]);

    // Beside a blocking layer: I8's answer, which is that nothing happens at
    // all — no dismissal, because an owner is waiting.
    seen.length = 0;
    const question = { id: "q", kind: "overlay", blocking: true, dismissal: "answer" } as const;
    layer.top = question;
    layer.placed = [{ layer: question, top: 5, left: 10, height: 3, width: 20 }];
    expect(router.dispatch(click(3, 0)), "consumed").toBe(true);
    expect(seen, "and nothing beneath it").toEqual([]);
    expect(calls, "closes nothing").toEqual([]);
    expect(router.lastStages).toEqual(["arming", "mouse", "modal"]);
  });

  it("T1.104 (I48, I74, C15 I23, R-BLK-779): a wheel over a panel is its scroller's, and over nothing is the viewport's", () => {
    // *One ordering does both jobs*: the layer order decides which viewport a
    // wheel moves exactly as it decides which layer a key reaches.
    //
    // **The panel's scroller, by id, and no handler** (I74, §3d P2). This row
    // registered a `panel` handler answering `true` and read that as the panel
    // taking the wheel; the tree's handler answers `false` for every pointer
    // event, so the wheel was dropped. A fixture that supplied the behaviour.
    const { router, layer, calls } = harness();
    const seen: string[] = [];
    router.register("panel", () => (seen.push("panel"), true));
    router.register("liveBlock", () => (seen.push("liveBlock"), true));
    router.register("global", () => (seen.push("global"), true));

    layer.top = PANEL;
    layer.placed = [{ layer: PANEL, top: 5, left: 10, height: 3, width: 20 }];

    expect(router.dispatch(click(7, 12, "wheelDown")), "consumed").toBe(true);
    expect(calls, "the panel's own scroller, one notch down").toEqual(["scroll:menu:1"]);
    expect(seen, "no rung handler, and the transcript beneath it does not move").toEqual([]);
    expect(router.lastStages).toContain("layer:menu");

    // **The control is one row outside it**, which is what makes the row about
    // the box rather than about a panel being open at all. Above it rather
    // than below, because the harness's transcript ends at region row 4.
    seen.length = 0;
    expect(router.dispatch(click(4, 12, "wheelDown")), "consumed").toBe(true);
    expect(seen, "outside the panel: the entry under the pointer").toEqual(["liveBlock"]);

    // The peek is a third case now (C15 I31): T1.191 is its row.
  });
});

describe("C16 I53 — the repeat policy through dispatch", () => {
  const withEvent = (e: InputEvent, event: "press" | "repeat"): InputEvent =>
    e.kind === "key" ? { ...e, event } : e;
  const altUp = key("up", { meta: true });
  const left = key("left");

  it("T1.159f (I53, R-KEY-002): a ⌥↑ repeat through dispatch meets the page policy bound at global", () => {
    const h = harness({}, 1_000, createKeymap(defaultKeymap));
    let pages = 0;
    let lefts = 0;
    h.router.register("global", (e) => (e.kind === "key" && e.key.meta && e.key.name === "up" ? ((pages += 1), true) : false));
    h.router.register("prompt", (e) => (e.kind === "key" && e.key.name === "left" ? ((lefts += 1), true) : false));

    // **The control: an undeclared binding acts on every repeat** (T1.159d's
    // rule, through the router). Without it the rows below are passed by a
    // router that absorbs every repeat.
    h.router.dispatch(withEvent(left, "press"));
    h.advance(100);
    h.router.dispatch(withEvent(left, "repeat"));
    expect(lefts, "undeclared: the repeat at 100 ms acts").toBe(2);

    // **The page policy — 250 / 90 — found at `global`, where ⌥↑ is bound.**
    h.router.dispatch(withEvent(altUp, "press"));
    expect(pages, "the press acts").toBe(1);
    h.advance(100);
    h.router.dispatch(withEvent(altUp, "repeat"));
    expect(pages, "100 ms: inside the delay, absorbed").toBe(1);
    h.advance(160);
    h.router.dispatch(withEvent(altUp, "repeat"));
    expect(pages, "260 ms: past the delay, it acts").toBe(2);
    h.advance(40);
    h.router.dispatch(withEvent(altUp, "repeat"));
    expect(pages, "40 ms later: under the 90 ms rate, absorbed").toBe(2);
    h.advance(60);
    h.router.dispatch(withEvent(altUp, "repeat"));
    expect(pages, "100 ms after the last act: it acts, and only once").toBe(3);
  });
});

describe("C16 §3b — a reject consumes and explains; one rung; two verdict vocabularies (review batch 2, M5)", () => {
  it("T1.164 (I62, §103, ruling 59): ⌃c at a question, at semantic copy mode and at native selection is consumed, offered to nothing and refused once", () => {
    // **The callback would resolve on anything it is offered**, and records
    // what it was offered. T1.40's control declined every key, so a reject that
    // still ran the owning rung left it green; this one answers, so the same
    // defect is an answer recorded.
    const cells = [
      { rung: "question", over: {} },
      { rung: "copy", over: { semanticSelection: () => true } },
      { rung: "copy", over: { nativeSelection: () => true } },
    ] as const;
    for (const cell of cells) {
      const offered: string[] = [];
      const { router, calls, refusals, layer } = harness({
        ...cell.over,
        overlayAnswerCallback: () => (e: InputEvent) => (offered.push(e.kind), true),
        promptHasText: () => true,
      });
      if (cell.rung === "question") layer.top = { id: "confirm", kind: "overlay", blocking: true, dismissal: "answer" };
      for (const target of ["overlay", "nativeSelection", "semanticSelection"] as const) {
        router.register(target, () => (calls.push(`rung:${target}`), true), { first: true });
      }
      const where = `at ${cell.rung} (${Object.keys(cell.over).join() || "question"})`;

      expect(router.dispatch(ctrlC), `${where}: consumed`).toBe(true);
      expect(offered, `${where}: the answer callback was offered nothing`).toEqual([]);
      expect(calls, `${where}: no rung ran, no exit, no clear`).toEqual([]);
      expect(refusals, `${where}: refused once`).toEqual([{ rung: cell.rung, cause: "intercept" }]);
      expect(router.lastStages.at(-1)).toBe("reject");
    }

    // **The control**: the same key at a prompt holding text is not refused —
    // the scope rung handles it and clears the line. Without it every assertion
    // above is passed by a router that refuses `⌃c` everywhere.
    const control = harness({ promptHasText: () => true });
    expect(control.router.dispatch(ctrlC)).toBe(true);
    expect(control.calls).toEqual(["clearPrompt"]);
    expect(control.refusals).toEqual([]);
  });

  it("T1.165 (I62): refused is called once for an intercept's reject and a blocking top, and never for a handler's reject or the guard", () => {
    const confirm = { id: "confirm", kind: "overlay", blocking: true, dismissal: "answer" } as const;

    // An intercept's `reject`: once.
    const intercept = harness();
    intercept.layer.top = confirm;
    intercept.router.dispatch(ctrlC);
    expect(intercept.refusals, "intercept").toEqual([{ rung: "question", cause: "intercept" }]);

    // A blocking top no rung took: once, after `modal-blocked`.
    const blocked = harness();
    blocked.layer.top = confirm;
    blocked.router.dispatch(key("t"));
    expect(blocked.router.lastStages.slice(-2)).toEqual(["modal-blocked", "reject"]);
    expect(blocked.refusals, "blocked").toEqual([{ rung: "question", cause: "blocked" }]);

    // A handler's own `reject`: it has explained for itself, so never.
    const own = harness({ overlayAnswerCallback: () => () => "reject" });
    own.layer.top = confirm;
    own.router.dispatch(key("t"));
    expect(own.router.lastStages.at(-1), "consumed as a reject").toBe("reject");
    expect(own.router.lastStages, "and not by the blocking step").not.toContain("modal-blocked");
    expect(own.refusals, "handler").toEqual([]);

    // The question guard: its explanation is the armed mark (I44), never.
    const guarded = harness({ overlayWouldResolve: () => () => true });
    guarded.layer.top = confirm;
    guarded.router.dispatch(key("y"));
    expect(guarded.router.lastStages, "the guard refused it").toContain("question-guard");
    expect(guarded.refusals, "guard").toEqual([]);
  });
  it("T1.167 (I63): the rung, the guard on arrival and the intercept stage agree for a question and a substate", () => {
    // **The three readers that disagreed** (§3b S13). The question here has no
    // answer callback, which is the cell where the intercept table used to say
    // `scope` while the footer and the guard said `question`.
    const cells = [
      { name: "a declared question", top: { id: "q", kind: "overlay", blocking: true, dismissal: "answer", owner: { rung: "question" } }, rung: "question", armed: true },
      { name: "a declared substate", top: { id: "m", kind: "panel", blocking: false, dismissal: "escape", owner: { rung: "substate" } }, rung: "substate", armed: false },
      // The control: an overlay that declares nothing is a question in all three.
      { name: "an undeclared overlay", top: { id: "o", kind: "overlay", blocking: false, dismissal: "escape" }, rung: "question", armed: true },
    ] as const;
    for (const cell of cells) {
      const { router, layer } = harness();
      layer.top = cell.top;
      expect(router.rung, `${cell.name}: the rung`).toBe(cell.rung);
      expect(router.ownerArmed, `${cell.name}: the guard on arrival`).toBe(cell.armed);
      router.dispatch(key("up", { meta: true }));
      const stage = router.lastStages.find((st) => st.startsWith("intercept:"));
      expect(stage?.split(":")[2], `${cell.name}: the intercept's rung`).toBe(cell.rung);
    }
  });
  it("T1.169 (I65): a release answers nothing — y answers Q1, and y's release leaves Q2 open", () => {
    // **The callback ignores `event`, as the question's does** (`classify`
    // reads the key's name). Q1's answer chains Q2, which is the verb raising a
    // follow-up — so `y`'s release arrives at a question that did not exist
    // when `y` was pressed.
    const answered: string[] = [];
    const question = (id: string) =>
      ({ id, kind: "overlay", blocking: true, dismissal: "answer", owner: { rung: "question" } }) as const;
    const h = harness({
      keyReleasesReported: () => true,
      overlayAnswerCallback: () => (e: InputEvent) => {
        if (e.kind !== "key" || e.key.name !== "y") return false;
        answered.push(h.layer.top?.id ?? "none");
        h.layer.top = h.layer.top?.id === "q1" ? question("q2") : null;
        return true;
      },
    });
    h.layer.top = question("q1");

    h.router.dispatch({ ...key("y"), event: "press" } as InputEvent);
    expect(answered, "y answers Q1").toEqual(["q1"]);
    expect(h.layer.top?.id, "and the verb raised Q2").toBe("q2");

    h.router.dispatch({ ...key("y"), event: "release" } as InputEvent);
    expect(answered, "the release answered nothing").toEqual(["q1"]);
    expect(h.layer.top?.id, "Q2 is open").toBe("q2");
    expect(h.router.lastStages.at(-1)).toBe("release-dropped");

    // **The control**: at `child`, a release is delivered — application
    // surfaces are what native release events exist for.
    const child = harness({ keyReleasesReported: () => true, childAttached: () => true });
    const got: string[] = [];
    child.router.register("child", (e) => (got.push(e.kind === "key" ? String(e.event) : e.kind), true));
    child.router.dispatch({ ...key("y"), event: "release" } as InputEvent);
    expect(got, "the child hears the release").toEqual(["release"]);
  });
});

describe("C16 I67 — ⌃c is recognised exactly (review batch 2, M6)", () => {
  it("T1.172 (C16 I67): the predicate over kitty ⌃⇧C, ⌥⌃c, ⌘⌃c and 0x03, through interceptOf and through dispatch's stages at a scope rung, an empty prompt and a question", () => {
    // **Decoded, not written by hand**, for the two chords whose shape is the
    // claim: kitty's `⌃⇧C` is `CSI 99;6u` and base `⌃c` is `0x03`, and a row
    // that built `{ shift: true }` itself would assert the predicate against a
    // key no terminal sends.
    const decoded = (bytes: string, keyboardProtocol: "kitty" | "none"): InputEvent => {
      const d = createDecoder({
        capabilities: { bracketedPaste: true, mouse: true, keyboardProtocol },
        now: () => 0,
      });
      const [e] = d.push(new TextEncoder().encode(bytes));
      if (e === undefined) throw new Error(`no event for ${JSON.stringify(bytes)}`);
      return e;
    };
    const KITTY_CTRL_SHIFT_C = decoded("\u001b[99;6u", "kitty");
    const BASE_CTRL_C = decoded("\u0003", "none");
    expect(KITTY_CTRL_SHIFT_C, "the fixture is the chord: `c` with ctrl and shift").toMatchObject({
      kind: "key",
      key: { name: "c", ctrl: true, shift: true },
    });
    const KEYS: readonly (readonly [string, InputEvent, boolean])[] = [
      ["⌃c", ctrlC, true],
      ["0x03", BASE_CTRL_C, true],
      ["kitty ⌃⇧C", KITTY_CTRL_SHIFT_C, false],
      ["⌥⌃c", key("c", { ctrl: true, meta: true }), false],
      ["⌘⌃c", key("c", { ctrl: true, super: true }), false],
    ];
    for (const [label, e, interrupt] of KEYS) {
      expect(interceptOf(e), `${label} through interceptOf`).toBe(interrupt ? "interrupt" : null);

      // An empty prompt: the arming machine's rung.
      {
        const { router, calls } = harness();
        router.dispatch(e);
        const stages = router.lastStages.filter((s) => s.startsWith("intercept:interrupt"));
        expect(stages.length > 0, `${label} at an empty prompt: an interrupt stage`).toBe(interrupt);
        if (!interrupt) expect(calls, `${label} arms nothing`).toEqual([]);
      }
      // A scope rung: focus in the transcript, a block owning the keys.
      {
        const { router, focus } = harness();
        focus.enterLiveBlock("e1", null);
        router.dispatch(e);
        const stages = router.lastStages.filter((s) => s.startsWith("intercept:interrupt"));
        expect(stages.length > 0, `${label} at a scope rung`).toBe(interrupt);
      }
      // A question: the intercept's reject is what reaches it for `⌃c`.
      {
        // An answer callback is what makes the top a question's rung (T1.40).
        const { router, layer } = harness({ overlayAnswerCallback: () => () => false });
        layer.top = { id: "confirm", kind: "overlay", blocking: true, dismissal: "answer" };
        router.dispatch(e);
        expect(
          router.lastStages.includes("intercept:interrupt:question:reject"),
          `${label} at a question`,
        ).toBe(interrupt);
      }
    }
    // **The predicate is the table's**, so the ladder and the classifier cannot
    // hold a different answer for the same key.
    expect(isExactCtrlC({ name: "c", ctrl: true, meta: false, shift: false, sequence: "" })).toBe(true);
  });
});

describe("C16 I69–I73 — the timed guard, its explanation, focus-out and the generation (review batch 3, M7)", () => {
  const enter = key("enter");
  /**
   * A question on a terminal with no release reporting, arrived at `t = 0`.
   * `at(ms)` moves the clock to `ms` after the arrival, which is how ruling 52's
   * schedule reads.
   */
  const arrived = (opts: Partial<RouterDeps> = {}) => {
    const q = { open: false, replace: false };
    const bump = { generation: (): void => undefined };
    const h = harness({
      overlayTop: () => (q.open ? { kind: "overlay" as const, id: "confirm", blocking: true, dismissal: "answer" } : null),
      // `q.replace` is a verb asking a second question from the first's answer,
      // inside the answer's dispatch — the owner moves and the rung does not.
      overlayAnswerCallback: () =>
        q.open
          ? (): boolean => {
              if (q.replace) bump.generation();
              return true;
            }
          : null,
      overlayWouldResolve: () =>
        q.open ? (e: InputEvent): boolean => e.kind === "key" && (e.key.name === "y" || e.key.name === "enter") : null,
      ...opts,
    });
    bump.generation = () => void (h.layer.generation += 1);
    const origin = 1_000;
    const at = (ms: number): void => void h.advance(origin + ms - h.advance(0));
    q.open = true;
    // The first read stamps the arrival (I69) — L4's overlay subscription does
    // this at the push, and a row reads the router as that subscription does.
    void h.router.ownerArmed;
    return { ...h, q, at };
  };
  const refused = (router: ReturnType<typeof harness>["router"]): boolean => router.lastStages.includes("question-guard");

  it("T1.181 (I69, §3c): activations each within 250 ms of the last are refused past the grace; one after a 300 ms gap answers", () => {
    const { router, at } = arrived();
    for (const ms of [100, 700, 740, 900, 1100]) {
      at(ms);
      router.dispatch(enter);
      expect(refused(router), `+${String(ms)}`).toBe(true);
    }
    at(1400);
    router.dispatch(enter);
    expect(refused(router), "+1400, 300 ms after the last").toBe(false);
  });

  it("T1.182 (I69, §3c — ruling 52's row): a key held across the arrival, a 660 ms first repeat, then 30 Hz repeats — none answers", () => {
    // **The row the person asked for.** X11's default delay is 660 ms and its
    // rate 25–30 Hz; the first form of ruling 52 — a 250 ms window from the
    // arrival — answered at the first repeat, and T6.54 is that form mutated.
    const { router, at } = arrived();
    for (let ms = 660; ms <= 3000; ms += 33) {
      at(ms);
      router.dispatch(enter);
      expect(refused(router), `+${String(ms)}`).toBe(true);
    }
    expect(router.ownerArmed, "still guarded while the key repeats").toBe(true);
    // The control: the key lifts — no event says so here — and the reader's
    // next press, after a pause, answers.
    at(3400);
    router.dispatch(enter);
    expect(refused(router)).toBe(false);
  });

  it("T1.183 (I69, §3c): a first ⏎ at +2000 answers; at +400 and +700 refused, and at +1000 answered", () => {
    const quiet = arrived();
    quiet.at(2000);
    quiet.router.dispatch(enter);
    expect(refused(quiet.router), "a reader who read first").toBe(false);

    // **The cost, stated** (§3c S5b): a reader faster than the grace pays one
    // refusal per 250 ms of haste.
    const fast = arrived();
    for (const [ms, expected] of [[400, true], [700, true], [1000, false]] as const) {
      fast.at(ms);
      fast.router.dispatch(enter);
      expect(refused(fast.router), `+${String(ms)}`).toBe(expected);
    }
  });

  it("T1.184 (I69, §3c): a neutral arrow ends the timed guard, and so does ⌃c, which still meets its intercept's reject", () => {
    const arrow = arrived();
    arrow.at(100);
    expect(arrow.router.dispatch(key("right"))).toBe(true);
    expect(refused(arrow.router)).toBe(false);
    arrow.at(120);
    arrow.router.dispatch(enter);
    expect(refused(arrow.router), "the arrow was the boundary").toBe(false);

    // **An intercept's key is a key** (§3c S11): it stops the OS repeating the
    // one before it, which is the boundary the guard waits for. The intercept's
    // own verdict is untouched — a question rejects the interrupt (I62).
    const interrupt = arrived();
    interrupt.at(100);
    expect(interrupt.router.dispatch(ctrlC)).toBe(true);
    expect(refused(interrupt.router)).toBe(false);
    expect(interrupt.refusals, "the intercept's reject, explained once").toEqual([{ rung: "question", cause: "intercept" }]);
    interrupt.at(120);
    interrupt.router.dispatch(enter);
    expect(refused(interrupt.router), "and the guard ended on it").toBe(false);
  });

  it("T1.185 (I70): ownerRefused is null before a refusal and the same key after the first and the second; nextDeadline follows the grace and the gap", () => {
    const { router, at } = arrived();
    expect(router.ownerRefused).toBeNull();
    expect(router.nextDeadline(), "the grace, from the arrival").toBe(1_750);

    at(100);
    router.dispatch(key("y"));
    const first = router.ownerRefused;
    expect(first).toEqual({ key: expect.objectContaining({ name: "y" }), untilRelease: false });
    expect(router.nextDeadline(), "inside the grace the grace decides").toBe(1_750);

    at(600);
    router.dispatch(enter);
    // **The first refused key, not the latest** — the frame changes once.
    expect(router.ownerRefused).toEqual(first);
    expect(router.nextDeadline(), "and after it the gap").toBe(1_850);

    at(900);
    expect(router.ownerArmed, "lapsed at its deadline with no event").toBe(false);
    expect(router.ownerRefused).toBeNull();
    expect(router.nextDeadline()).toBeUndefined();

    // The release-reporting arm waits on an event, so it reports no deadline.
    const held = harness({ keyReleasesReported: () => true });
    held.router.dispatch(key("y"));
    held.layer.top = { kind: "overlay", id: "confirm", blocking: true, dismissal: "answer" };
    expect(held.router.ownerArmed).toBe(true);
    expect(held.router.nextDeadline()).toBeUndefined();
  });

  it("T1.186 (I72, §3c): a focus-out clears held keys and the pointer arm, with no stages", () => {
    const { router, q } = withQuestionReleases();
    router.dispatch(enter); // down, and no release will reach us
    router.dispatch(key("x"));
    const before = router.lastStages;
    router.armPointer("a");

    expect(router.dispatch({ kind: "focus", focused: false }), "not routed").toBe(false);
    expect(router.lastStages, "and the last dispatch's stages stand").toEqual(before);
    expect(router.commitPointer("a"), "the button's release is not coming either").toBe(false);

    q.open = true;
    expect(router.ownerArmed, "nothing is held any more, so nothing is guarded").toBe(false);
    router.dispatch(key("y"));
    expect(refused(router)).toBe(false);

    // **And a guard already waiting on a key-up ends** (§3c S8): the release
    // it waits for will be delivered to another window.
    const waiting = withQuestionReleases();
    waiting.router.dispatch(enter);
    waiting.q.open = true;
    expect(waiting.router.ownerArmed).toBe(true);
    waiting.router.dispatch({ kind: "focus", focused: false });
    expect(waiting.router.ownerArmed, "the focus-out ended it").toBe(false);
  });

  it("T1.186 (cont., I72): the control — without the focus-out, the key held elsewhere guards the question", () => {
    const { router, q } = withQuestionReleases();
    router.dispatch(enter);
    q.open = true;
    expect(router.ownerArmed).toBe(true);
    router.dispatch(key("y"));
    expect(refused(router)).toBe(true);
  });

  it("T1.187 (I73, §3c): the generation moving twice with the rung the same at both reads kills a pointer arm; the control commits", () => {
    const { router, layer } = harness();
    router.armPointer("a");
    // A question raised and answered between the press and the release: C15's
    // count moves twice and no read of the router falls in between.
    layer.generation += 1;
    layer.generation += 1;
    expect(router.commitPointer("a")).toBe(false);

    router.armPointer("b");
    expect(router.commitPointer("b"), "the control: nothing moved").toBe(true);
  });

  it("T1.188 (I73, §3c): at the question rung, a generation change within one dispatch guards afresh", () => {
    const replaced = arrived();
    replaced.at(2000);
    expect(replaced.router.ownerArmed, "the first question's guard has lapsed").toBe(false);
    replaced.q.replace = true;
    replaced.router.dispatch(enter);
    expect(refused(replaced.router), "the first question answered").toBe(false);
    expect(replaced.router.ownerArmed, "and the second arrived guarded").toBe(true);

    const same = arrived();
    same.at(2000);
    same.router.dispatch(enter);
    expect(same.router.ownerArmed, "the control: no owner moved").toBe(false);
  });

  /** A question on a terminal that reports releases, not yet open. */
  function withQuestionReleases() {
    const q = { open: false };
    const h = harness({
      keyReleasesReported: () => true,
      overlayTop: () => (q.open ? { kind: "overlay" as const, id: "confirm", blocking: true, dismissal: "answer" } : null),
      overlayAnswerCallback: () => (q.open ? (): boolean => true : null),
      overlayWouldResolve: () =>
        q.open ? (e: InputEvent): boolean => e.kind === "key" && (e.key.name === "y" || e.key.name === "enter") : null,
    });
    return { ...h, q };
  }
});

describe("C16 I74, I47 — the pointer over layers (review batch 3, M8)", () => {
  const PANEL = { id: "menu", kind: "panel", blocking: false, dismissal: "escape" } as const;
  const SEARCH = { id: "search", kind: "panel", blocking: false, dismissal: "escape" } as const;
  const PEEK = { id: "peek", kind: "peek", blocking: false, dismissal: "focus" } as const;
  const mouseAt = (row: number, col: number, over: Partial<Extract<InputEvent, { kind: "mouse" }>>): InputEvent => ({
    ...(click(row, col) as Extract<InputEvent, { kind: "mouse" }>),
    ...over,
  });

  it("T1.189 (I74, §3d): two overlapping layers — a press and a wheel over the overlap go to the top one; the lower alone reaches the lower", () => {
    const { router, layer, calls } = harness();
    const seen: string[] = [];
    router.register("panel", () => (seen.push("panel"), true));
    layer.top = SEARCH;
    // Draw order, bottom first: the menu, then the search over its right half.
    // Region top is 1, so terminal row 7 is region row 6 — inside both.
    layer.placed = [
      { layer: PANEL, top: 5, left: 10, height: 3, width: 20 },
      { layer: SEARCH, top: 5, left: 20, height: 3, width: 20 },
    ];

    router.dispatch(click(7, 25));
    expect(router.lastStages, "the press names the top one").toContain("layer:search");
    router.dispatch(click(7, 25, "wheelDown"));
    expect(calls, "and the wheel asks the top one's scroller").toEqual(["scroll:search:1"]);

    calls.length = 0;
    router.dispatch(click(7, 12, "wheelUp"));
    expect(calls, "where only the lower covers, the lower").toEqual(["scroll:menu:-1"]);
  });

  it("T1.190 (I74, §3d): a wheel over a keyed layer is consumed whether scrollLayer answers true or false; a horizontal wheel asks no scroller", () => {
    for (const answers of [true, false]) {
      const asked: string[] = [];
      const { router, layer } = harness({ scrollLayer: (id) => (asked.push(id), answers) });
      const seen: string[] = [];
      for (const t of ["panel", "liveBlock", "global"] as const) router.register(t, () => (seen.push(t), true));
      layer.top = PANEL;
      layer.placed = [{ layer: PANEL, top: 5, left: 10, height: 3, width: 20 }];

      expect(router.dispatch(click(7, 12, "wheelDown")), `consumed, scroller answering ${String(answers)}`).toBe(true);
      expect(asked).toEqual(["menu"]);
      expect(seen, "no rung handler and nothing beneath").toEqual([]);

      asked.length = 0;
      expect(router.dispatch(click(7, 12, "wheelLeft")), "a horizontal wheel is consumed").toBe(true);
      expect(asked, "and asks no scroller").toEqual([]);
      expect(seen).toEqual([]);
    }
  });

  it("T1.191 (I74, C15 I31, §3d): over a peek a wheel asks its scroller, and the base takes it when the peek declines; a press reaches the entry beneath", () => {
    for (const answers of [true, false]) {
      const asked: string[] = [];
      const { router } = harness({
        scrollLayer: (id) => (asked.push(id), answers),
        // L4's seam, as `construct.ts` builds it: the peek for the wheel only.
        placed: (gesture) => (gesture === "wheel" ? [{ layer: PEEK, top: 2, left: 0, height: 3, width: 40 }] : []),
      });
      const seen: string[] = [];
      router.register("liveBlock", () => (seen.push("liveBlock"), true));

      expect(router.dispatch(click(3, 5, "wheelDown"))).toBe(true);
      expect(asked, "the peek's own scroller").toEqual(["peek"]);
      expect(seen, answers ? "a peek that scrolled keeps the wheel" : "a peek that declined leaves it to the entry beneath").toEqual(
        answers ? [] : ["liveBlock"],
      );

      seen.length = 0;
      asked.length = 0;
      router.dispatch(click(3, 5));
      expect(seen, "a press over the peek is the row's").toEqual(["liveBlock"]);
      expect(asked).toEqual([]);
    }
  });

  it("T1.192 (I47, §3d): beside an escapable panel a right, a middle, a modified press and a drag are inert; the unmodified primary press dismisses", () => {
    const cases: readonly [string, Partial<Extract<InputEvent, { kind: "mouse" }>>][] = [
      ["right", { button: "button2" }],
      ["middle", { button: "button1" }],
      ["⇧", { shift: true }],
      ["⌃", { ctrl: true }],
      ["⌥", { meta: true }],
      ["drag", { motion: true }],
    ];
    for (const [name, over] of cases) {
      const { router, layer, calls } = harness();
      const seen: string[] = [];
      for (const t of ["panel", "liveBlock", "global"] as const) router.register(t, () => (seen.push(t), true));
      layer.top = PANEL;
      layer.placed = [{ layer: PANEL, top: 5, left: 10, height: 3, width: 20 }];
      expect(router.dispatch(mouseAt(3, 0, over)), `${name}: consumed`).toBe(true);
      expect(calls, `${name}: closes nothing`).toEqual([]);
      expect(seen, `${name}: reaches nothing`).toEqual([]);
    }
    // The control: the primary click.
    const { router, layer, calls } = harness();
    layer.top = PANEL;
    layer.placed = [{ layer: PANEL, top: 5, left: 10, height: 3, width: 20 }];
    router.dispatch(click(3, 0));
    expect(calls).toEqual(["pop"]);
  });
});

describe("C16 I75 — the host escape is a reserved route (review batch 3, M9 item 4)", () => {
  const ESCAPE = key("]", { ctrl: true });
  const TAKES_ALL = (): boolean => true;

  it("T1.193 (I75, §3e): a child handler consuming every key, registered either side of another: the escape detaches and neither is offered it; its release is consumed; at the prompt it takes handle", () => {
    // **Both registration orders** (§3e H1, H2). The composition root's
    // handler stood ahead of the surface host's and the escape held by that
    // order alone; a consuming handler registered first took it.
    for (const order of ["consumer first", "consumer second"] as const) {
      const h = harness({ childAttached: () => true }, 1_000, createKeymap(defaultKeymap));
      const offered: string[] = [];
      const consumer = (e: InputEvent): boolean => {
        if (e.kind === "key") offered.push(`consumer:${e.key.name}`);
        return TAKES_ALL();
      };
      const other = (e: InputEvent): boolean => {
        if (e.kind === "key") offered.push(`other:${e.key.name}`);
        return false;
      };
      if (order === "consumer first") {
        h.router.register("child", consumer);
        h.router.register("child", other);
      } else {
        h.router.register("child", other);
        h.router.register("child", consumer);
      }
      expect(h.router.target, `${order}: the child holds the keys`).toBe("child");

      expect(h.router.dispatch(ESCAPE), `${order}: consumed`).toBe(true);
      expect(h.calls, `${order}: detached once`).toEqual(["detach"]);
      expect(offered, `${order}: and no handler at the rung it escapes was offered it`).toEqual([]);
      expect(h.router.lastStages).toContain("intercept:host-detach:child:global-intercept");
      expect(h.router.lastStages).toContain("intercept:detach");

      // H6: the release — its press was the host's, so the child is not
      // handed the other half.
      expect(h.router.dispatch({ ...ESCAPE, event: "release" } as InputEvent), `${order}: the release, consumed`).toBe(true);
      expect(h.calls, `${order}: and it detaches nothing`).toEqual(["detach"]);
      expect(offered, `${order}: nor reaches a handler`).toEqual([]);

      // The control: an ordinary key is the child's, and the first handler
      // registered takes it — the rung is unchanged for every other key.
      h.router.dispatch(key("a"));
      expect(offered[0], `${order}: \`a\` reaches the rung`).toBe(order === "consumer first" ? "consumer:a" : "other:a");
      expect(h.calls).toEqual(["detach"]);
    }

    // H7: no child. `handle`, and the ladder runs as for any key.
    const idle = harness({}, 1_000, createKeymap(defaultKeymap));
    const prompt: string[] = [];
    idle.router.register("prompt", (e) => (e.kind === "key" && void prompt.push(e.key.name), false));
    idle.router.dispatch(ESCAPE);
    expect(idle.router.lastStages).toContain("intercept:host-detach:scope:handle");
    expect(idle.calls, "nothing to detach").toEqual([]);
    expect(prompt, "the prompt's rung was offered it").toEqual(["]"]);
  });

  it("T1.194 (I75, I64, §3e): the chord is the keymap's: a rebound host.detach row moves the intercept; the enhanced profile adds the meta escape; the table row", () => {
    // The keymap's `child` rows, asked the way the router asks them.
    const detachesIn = (bindings: Parameters<typeof createKeymap>[0], profile?: "enhanced-terminal") => {
      const km = createKeymap(bindings, profile);
      return (k: Key): boolean => km.resolve("child", k)?.action === "hostDetach";
    };
    const base = detachesIn(defaultKeymap);
    expect(interceptOf(key("]", { ctrl: true }), base), "⌃] under the base profile").toBe("host-detach");
    expect(interceptOf(key("escape", { meta: true }), base), "⌥esc is not a chord here (T1.106b)").toBeNull();
    expect(interceptOf(key("]", { ctrl: true })), "no keymap asked: no escape").toBeNull();

    const enhanced = detachesIn(defaultKeymap, "enhanced-terminal");
    expect(interceptOf(key("escape", { meta: true }), enhanced), "⌥esc under the enhanced profile").toBe("host-detach");

    // **Rebound**: the intercept follows the row, so the border and `/help`,
    // which read the same rows, cannot name a chord the router does not take.
    const rebound = detachesIn([
      ...defaultKeymap.filter((b) => b.action !== "hostDetach"),
      { target: "child", key: { name: "g", ctrl: true }, action: "hostDetach" },
    ]);
    expect(interceptOf(key("g", { ctrl: true }), rebound)).toBe("host-detach");
    expect(interceptOf(key("]", { ctrl: true }), rebound), "the old chord is an ordinary key").toBeNull();

    // `⌃c` is still the interrupt whatever the escape is: the ⌃c arm is read first.
    expect(interceptOf(ctrlC, () => true)).toBe("interrupt");

    // The table row: the detach at `child`, `handle` everywhere else.
    for (const rung of OWNER_RUNGS) {
      expect(interceptVerdict("host-detach", rung), rung).toBe(rung === "child" ? "global-intercept" : "handle");
    }
    expect(interceptVerdict("host-detach", null), "idle").toBe("handle");
    expect(INTERCEPTS["host-detach"].exception).toBe("detach");
  });
});
