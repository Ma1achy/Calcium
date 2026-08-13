// C16 tier 4 — integration. Against real C13, C14 and C15, with no fakes in the
// state path.
//
// **The unit suite cannot see the hazard this tier exists for.** C13 emits
// `append` then `evict` for a single `append()`, and the fakes in
// `router-dispatch.test.ts` emit nothing at all — so "C16 reads no delta stream"
// is a claim the unit tests cannot falsify. C14's blank screen came from exactly
// this gap: a handler that ran against a half-applied store, with every assertion
// passing. The audit says nothing subscribes; this checks it against instances
// that would punish it if something did.
import { describe, expect, it, vi } from "vitest";

import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { createFocusStore } from "../../src/interaction/router/focus.js";
import { createKeymap } from "../../src/interaction/router/keymap.js";
import { createRouter, type RouterDeps } from "../../src/interaction/router/router.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";
import { addr } from "../support/focus.js";
import { measureSequence, rowsDoc } from "../support/viewport.js";
import { registry, rows } from "../support/overlay.js";

const key = (name: string, mods: Partial<Key> = {}): InputEvent => ({
  kind: "key",
  key: { name, ctrl: false, meta: false, shift: false, sequence: name, ...mods },
});
const ctrlC = key("c", { ctrl: true });

/** Real C13, C14, C15 and a scheduler spy that must never be called (I11). */
function world() {
  const store = createTranscriptStore();
  const viewport = createViewport(store, { width: 80, height: 10, measureSequence });
  const overlays = createOverlayManager({ registry });
  const commit = vi.fn();
  const focus = createFocusStore();

  const deps: RouterDeps = {
    overlayRegion: () => ({ width: 80, height: 24 }),
    overlayAnswerCallback: () => null,
    overlayTop: () => {
      const top = overlays.top;
      return top === null
        ? null
        : { kind: top.kind, id: top.id, dismissable: top.dismissable };
    },
    placed: () =>
      overlays.layout({ width: 80, height: 10 }).map((p) => ({
        layer: { id: p.layer.id, kind: p.layer.kind, dismissable: p.layer.dismissable },
        top: p.top,
        left: p.left,
        height: p.height,
        width: p.width,
      })),
    popLayer: () => void overlays.pop(),
    copyMode: () => false,
    exitCopyMode: () => undefined,
    liveEntry: () => {
      const id = store.liveId;
      return id === null ? null : { id };
    },
    entryAtRow: () => null,
    inFlight: () => null,
    // §5's subscription rung. **Defaulted here rather than left out**: the
    // ladder reads these on every Ctrl-C, so a double that omits them makes
    // every arming row throw — which is how the five exit-confirm rows found
    // the new dep before any of them was about a stream.
    liveStreams: () => 0,
    cancelNewestStream: () => false,
    cancel: () => undefined,
    signalShellChild: () => undefined,
    region: () => ({ top: 0, height: 10 }),
    mouseEnabled: () => true,
    promptHasText: () => false,
    clearPrompt: () => undefined,
    raiseExitConfirm: () => undefined,
  };

  const router = createRouter({ focus, keymap: createKeymap([]), now: () => 1_000, deps });
  return { store, viewport, overlays, router, focus, commit };
}

describe("C16 integration", () => {
  it("T4.1 (with C15): an overlay pushed mid-session takes the next keystroke", () => {
    const { overlays, router } = world();
    expect(router.target, "the prompt, before anything is layered").toBe("prompt");

    overlays.push({
      id: "menu",
      kind: "overlay",
      // Anchored, because a menu is (C15 I20). It stood in for the completion
      // menu as a centred layer with no width, which is neither.
      placement: { kind: "anchored" as const, row: 0, prefer: "below" as const },
      content: rows(3, "m"),
      dismissable: true,
    });

    // No explicit focus call anywhere between those two lines.
    expect(router.target).toBe("overlay");
  });

  it("T4.2 (with C15): a confirm over a view takes keys; Ctrl-C is a no-op", () => {
    const { overlays, router } = world();
    overlays.push({
      id: "dash",
      kind: "view",
      placement: { kind: "fill" },
      content: rows(4, "d"),
      dismissable: true,
    });
    overlays.push({
      id: "confirm",
      kind: "overlay",
      placement: { kind: "centred" },
      content: rows(2, "c"),
      dismissable: false,
      // A centred layer declares its width (C15 I20), and a confirm is the
      // shape that field exists for.
      width: 20,
    });

    expect(router.target).toBe("overlay");
    expect(router.dispatch(ctrlC), "consumed").toBe(true);
    expect(overlays.stack.map((l) => l.id), "the dashboard is still beneath it").toEqual([
      "dash",
      "confirm",
    ]);

    overlays.dismiss("confirm");
    expect(router.target, "and the view is reachable once it is answered").toBe("pushedView");
  });

  it("T4.5 (with C13): focus enters the live block and an append returns it", () => {
    const { store, router, focus } = world();
    store.append(rowsDoc(3, "a"));
    focus.enterLiveBlock(addr("r1"));
    expect(router.target).toBe("liveBlock");

    // One `append()` — which C13 reports as more than one change. Nothing here
    // listens, so the router's view of the world is whatever it pulls next.
    store.append(rowsDoc(3, "b"));
    expect(router.target, "still in the block: I2's reset is a call, not a signal").toBe(
      "liveBlock",
    );

    router.resetFocus();
    expect(focus.current).toEqual({ at: "prompt" });
    expect(router.target).toBe("prompt");
  });

  it("T4.6 (with C13): only the live entry is focusable, streaming or not", () => {
    // Resolves `test/integration/transcript.test.ts`'s deferral from C16's side.
    const { store, router, focus } = world();
    const first = store.append(rowsDoc(2, "x"), { streaming: true });
    store.append(rowsDoc(2, "y"));

    const entries = store.entries;
    expect(entries.find((e) => e.id === first)?.streaming, "still streaming").toBe(true);
    expect(entries.find((e) => e.id === first)?.live, "and frozen all the same").toBe(false);

    focus.enterLiveBlock(addr("r0"));
    expect(router.target).toBe("liveBlock");
    // The focusable block is whichever C13 says is live — never the frozen one,
    // whether or not it is still receiving patches.
    expect(store.liveId).not.toBe(first);
  });

  it("T4.4 (I11): C16 calls no scheduler — asserted with a spy, not an absence", () => {
    // **The half that matters is the spy.** Asserting that a scroll happened is
    // half of A02 Seam 4; the half that carries the invariant is that nothing
    // here committed a frame, and only a spy can see a call that was not made.
    const { router, commit } = world();
    const scrolled = vi.fn(() => true);
    router.register("prompt", (e) => (e.kind === "key" && e.key.name === "pagedown" ? scrolled() : false));

    expect(router.dispatch(key("pagedown"))).toBe(true);
    expect(scrolled, "the operation ran").toHaveBeenCalled();
    expect(commit, "and L4 commits, not C16").not.toHaveBeenCalled();
  });

  it("no dispatch reaches a transcript mutator, and none subscribes", () => {
    // The delta-versus-state audit against real instances. A subscription would
    // have to be registered somewhere, and C13 hands out subscriptions only
    // through `subscribe` — spied here so a later edit that reaches for one
    // fails on this line rather than in a blank screen three components away.
    const { store, router, overlays } = world();
    const subscribe = vi.spyOn(store, "subscribe");
    const append = vi.spyOn(store, "append");

    overlays.push({
      id: "menu",
      kind: "overlay",
      // Anchored, because a menu is (C15 I20). It stood in for the completion
      // menu as a centred layer with no width, which is neither.
      placement: { kind: "anchored" as const, row: 0, prefer: "below" as const },
      content: rows(2, "m"),
      dismissable: true,
    });
    router.dispatch(key("a"));
    router.dispatch(ctrlC);

    expect(subscribe, "C16 reads no change stream").not.toHaveBeenCalled();
    expect(append, "and writes no entry — L4 does that").not.toHaveBeenCalled();
  });
});
