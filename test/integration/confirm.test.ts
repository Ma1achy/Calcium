// C23 I36 / C16 I25 tier 4 — the confirm, against a real C15 and a real router.
//
// **Built from the real overlay manager rather than a flat layer list**, and that
// is the point of the tier rather than tidiness. The thing under test is whether
// rung 4 *routes* to the answer handler — a fake whose `top` is whatever the test
// last assigned cannot tell a router that routes from one that reads a field, and
// the refresh suite's `views` map could not express the finding it was written
// for, for exactly this reason.
//
// Every assertion below drives `router.dispatch(...)` with a decoded key. None
// calls the answer handler directly: a test that calls the mechanism verifies the
// mechanism and says nothing about the wiring, which is the shape that has caught
// three times in this repository.
//
// Fail-on-revert, and each names the change rather than the assertion:
//
//   - Deleting the two routing lines from rung 4 (`router.ts`, C16 I25) → all
//     nine fail, four of them by 5s timeout, which is the hang I25 is about.
//   - Moving those lines **below** `if (!top.dismissable) return true` → the same
//     nine, T4.3 by timeout.
//   - Moving them below `if (!isCtrlC(e)) return false` but above the
//     `dismissable` clause → eight fail and **T4.3 passes**. That asymmetry is
//     the finding: the two clauses drop and hang different keys, so a rule naming
//     only one of them reads as satisfied while the other is live. I25's first
//     wording said "before the `⌃c` clause" and this mutation is what corrected
//     it.
//   - `dismissable: true` on the confirm layer (`confirm.ts`) → T4.1 and T4.9
//     fail, and **the other seven pass**. A paste reaches `global` past a centred
//     box satisfying neither clause of C16 I8's guard. That seven survive is the
//     point: every key-path assertion is blind to the flag, because the answer
//     handler consumes keys before the guard is reached. The flag is load-bearing
//     for exactly what the handler declines, and only T4.9 can see it.

import { describe, expect, it, vi } from "vitest";

import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { createFocusStore } from "../../src/interaction/router/focus.js";
import { createKeymap, defaultKeymap } from "../../src/interaction/router/keymap.js";
import { createRouter, type RouterDeps } from "../../src/interaction/router/router.js";
import { createConfirmHost } from "../../src/shell/confirm.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";
import { measureSequence } from "../support/viewport.js";
import { registry } from "../support/overlay.js";

const key = (name: string, mods: Partial<Key> = {}): InputEvent => ({
  kind: "key",
  key: { name, ctrl: false, meta: false, shift: false, sequence: name, ...mods },
});
const ctrlC = key("c", { ctrl: true });

const YES_NO = [
  { key: "y", label: "yes" },
  { key: "n", label: "no", default: true as const },
];

/** Real C13, C14, C15, a real confirm host and a real router. */
function world(over: Partial<RouterDeps> = {}) {
  const store = createTranscriptStore();
  const viewport = createViewport(store, { width: 80, height: 10, measureSequence });
  const overlays = createOverlayManager({ registry });
  const focus = createFocusStore();
  const invalidate = vi.fn();
  const globalSeen: InputEvent[] = [];
  let cancels = 0;

  const confirm = createConfirmHost({ capabilities: { unicode: "full" }, overlays, invalidate });

  const deps: RouterDeps = {
    overlayRegion: () => ({ width: 80, height: 24 }),
    overlayAnswerCallback: confirm.answerHandler,
    overlayTop: () => {
      const top = overlays.top;
      return top === null ? null : { kind: top.kind, id: top.id, dismissable: top.dismissable };
    },
    placed: () => overlays.layout({ width: 80, height: 24 }),
    popLayer: () => void overlays.pop(),
    copyMode: () => false,
    exitCopyMode: () => undefined,
    liveEntry: () => null,
    entryAtRow: () => null,
    inFlight: () => null,
    liveStreams: () => 0,
    cancelNewestStream: () => false,
    cancel: () => void (cancels += 1),
    signalShellChild: () => undefined,
    promptHasText: () => false,
    clearPrompt: () => undefined,
    region: () => ({ top: 0, height: 10 }),
    mouseEnabled: () => false,
    raiseExitConfirm: () => undefined,
    ...over,
  } as unknown as RouterDeps;

  const router = createRouter({ focus, keymap: createKeymap(defaultKeymap), now: () => 0, deps });

  // A global binding that must not fire while a question is open (C16 I8).
  router.register("global", (e) => {
    globalSeen.push(e);
    return false;
  });

  return {
    overlays,
    confirm,
    router,
    invalidate,
    globalSeen,
    viewport,
    store,
    cancels: () => cancels,
  };
}

describe("ctx.ask — routed, not called (C23 I36, C16 I25)", () => {
  it("T4.1 (C16 I25): a real accelerator keystroke resolves the promise", async () => {
    const w = world();
    const answer = w.confirm.ask({ question: "Stop api-gateway?", choices: YES_NO });

    // The layer is genuinely on C15's stack, and modal by its own flag.
    expect(w.overlays.top?.id).toBe("confirm");
    expect(w.overlays.top?.dismissable).toBe(false);

    // **Through the router.** This is the line the mutation removes.
    expect(w.router.dispatch(key("y"))).toBe(true);
    await expect(answer).resolves.toBe("y");

    // Answering pops it — the owner's disposal, not the router's.
    expect(w.overlays.top).toBeNull();
  });

  it("T4.2 (C23 I36): Esc resolves with the default rather than cancelling", async () => {
    const w = world();
    const answer = w.confirm.ask({ question: "Stop api-gateway?", choices: YES_NO });
    expect(w.router.dispatch(key("escape"))).toBe(true);
    await expect(answer).resolves.toBe("n");
  });

  it("T4.3 (C23 I36, C16 I25): ⌃c resolves with the default, and is not consumed into silence", async () => {
    const w = world();
    const answer = w.confirm.ask({ question: "Stop api-gateway?", choices: YES_NO });

    expect(w.router.dispatch(ctrlC)).toBe(true);

    // **The assertion the rung's old behaviour passes.** `⌃c` at a
    // non-dismissable top returned true and did nothing (C16 I8), so "consumed" and
    // "the layer is gone" are both satisfiable without the question ever being
    // answered. The promise is the only thing that tells them apart.
    await expect(answer).resolves.toBe("n");
    expect(w.overlays.top).toBeNull();
  });

  it("T4.4 (C23 I36): arrows move the selection and Enter takes it", async () => {
    const w = world();
    const answer = w.confirm.ask({ question: "Stop api-gateway?", choices: YES_NO });

    // Default is `n` (index 1); up moves to `y`.
    expect(w.router.dispatch(key("up"))).toBe(true);
    expect(w.router.dispatch(key("return"))).toBe(true);
    await expect(answer).resolves.toBe("y");
  });

  it("T4.5 (C16 I8): PgUp does not reach `global` while a question is open", async () => {
    const w = world();

    // Control: with nothing open, the binding is reached.
    w.router.dispatch(key("pageup"));
    const before = w.globalSeen.length;
    expect(before).toBeGreaterThan(0);

    const answer = w.confirm.ask({ question: "Stop api-gateway?", choices: YES_NO });
    w.router.dispatch(key("pageup"));
    expect(w.globalSeen.length).toBe(before);

    // **The outcome, and not the mechanism that produced it.** This asserted
    // `modal-blocked` first and failed: the stages are `arming, target:overlay`,
    // because the answer handler consumes every key at rung 4 and dispatch never
    // reaches step 3's guard. Both mechanisms give the right answer and the
    // assertion named the one that does not run — so it would have gone red on a
    // correct refactor and stayed green if the handler started declining keys.
    // C16 I8's guard is the backstop for what the handler declines (mouse), which is
    // why `dismissable: false` is still load-bearing; see T4.9.
    expect(w.router.lastStages).toEqual(["arming", "target:overlay"]);

    w.router.dispatch(key("n"));
    await answer;
  });

  it("T4.6 (C16 I25): an unbound key is consumed and the question stays open", async () => {
    const w = world();
    const answer = w.confirm.ask({ question: "Stop api-gateway?", choices: YES_NO });

    expect(w.router.dispatch(key("q"))).toBe(true);
    expect(w.overlays.top?.id).toBe("confirm");

    w.router.dispatch(key("y"));
    await expect(answer).resolves.toBe("y");
  });

  it("T4.7 (C16 I25): the callback comes from the top layer only", async () => {
    const w = world();
    const answer = w.confirm.ask({ question: "Stop api-gateway?", choices: YES_NO });

    // A menu pushed over the question: the question is no longer top, so its
    // handler must not answer. C15 `pop()`'s reason, inverted.
    w.overlays.push({
      id: "menu",
      kind: "overlay",
      placement: { kind: "centred" },
      content: [],
      dismissable: true,
    });

    w.router.dispatch(key("y"));
    let settled = false;
    void answer.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    w.overlays.pop();
    w.router.dispatch(key("y"));
    await expect(answer).resolves.toBe("y");
  });

  it("T4.9 (C16 I8, C23 I36): the flag is the backstop for what the handler declines", async () => {
    const w = world();
    const answer = w.confirm.ask({ question: "Stop api-gateway?", choices: YES_NO });

    // A paste is not a key, so the answer handler returns false and the event
    // falls through rung 4 to step 3 — which is where `dismissable: false` earns
    // its place. With the flag `true` and a centred box this reaches `global`,
    // and that is the whole reason the ruling could not be built as written.
    w.router.dispatch({ kind: "paste", text: "xyz" });
    expect(w.globalSeen).toHaveLength(0);
    expect(w.router.lastStages).toContain("modal-blocked");

    w.router.dispatch(key("n"));
    await answer;
  });

  it("T4.10 (C16 I25): ⌃c answers the question rather than cancelling the verb", async () => {
    // **The state the other rows could not construct.** `world()` reports
    // `inFlight: () => null`, and a local verb awaiting `ctx.ask` is in flight
    // for the whole time its question is up — so rung 1 took `⌃c` and the
    // question never saw it. T4.3 passed throughout, because its harness was the
    // one arrangement where both readings agree.
    //
    // Found by a frame-read and by nothing else: the container was untouched and
    // the layer was gone, which is what a test asserts, and the frame showed the
    // submitted line had **disappeared** — cancellation discards the entry.
    const w = world({ inFlight: () => "local" });
    const cancelled = w.cancels;

    const answer = w.confirm.ask({ question: "Stop api-gateway?", choices: YES_NO });
    expect(w.router.dispatch(ctrlC)).toBe(true);

    await expect(answer).resolves.toBe("n");
    expect(cancelled(), "the verb must not be cancelled — it was waiting for us").toBe(0);
    expect(w.router.lastStages).toContain("question");
  });

  it("T4.11 (C16 I25): with no question open, ⌃c still cancels a running verb", async () => {
    // The control. Without it the row above is satisfied by a router that never
    // cancels anything, which is the rung C16 §5 spends a paragraph on.
    const w = world({ inFlight: () => "local" });
    expect(w.router.dispatch(ctrlC)).toBe(true);
    expect(w.cancels()).toBe(1);
    expect(w.router.lastStages).toContain("cancel");
  });

  it("T4.8 (C23 I36): resolves with a choice on every path, never null", async () => {
    for (const k of [key("y"), key("n"), key("escape"), ctrlC, key("return")]) {
      const w = world();
      const answer = w.confirm.ask({ question: "q?", choices: YES_NO });
      w.router.dispatch(k);
      const got = await answer;
      expect(typeof got).toBe("string");
      expect(["y", "n"]).toContain(got);
    }
  });
});
