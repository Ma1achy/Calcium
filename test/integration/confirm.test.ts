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
import { CONFIRM_WIDTH, createConfirmHost } from "../../src/shell/confirm.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";
import { measureSequence } from "../support/viewport.js";
import { registry } from "../support/overlay.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { ASCII_CAPS, measurable, visible } from "../support/render.js";
import type { OverlayManager } from "../../src/viewport/overlay/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

/**
 * The confirm's layer, rendered — the frame rather than the blocks.
 *
 * Read through C09's registry with `table` registered, because the claim being
 * checked is about columns lining up and about a glyph a slot resolves. A
 * structural assertion on the block sees the marker on the right row and cannot
 * see either.
 */
function frameOf(overlays: OverlayManager, caps?: TerminalCapabilities): readonly string[] {
  const layer = overlays.top;
  if (layer === null) throw new Error("no layer to read");
  const r = measurable({
    definitions: [tableDefinition],
    ...(caps === undefined ? {} : { capabilities: caps }),
  });
  return layer.content.flatMap((b) => r.renderToLines(b, 72).map(visible));
}

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

  const confirm = createConfirmHost({ overlays, anchor: () => ({ row: 8, rows: 1 }), invalidate });

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
      // **Anchored, because a menu is** (C15 I20 made the placement a
      // decision rather than a default). This stands in for the completion
      // menu while the row is about routing; it was centred with no width,
      // which is neither what a menu is nor a placeable layer.
      placement: { kind: "anchored" as const, row: 0, prefer: "below" as const },
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

  it("T4.12 (C23 I36, entry 16 R1): the marker opens on the default, not on the first", () => {
    // **The mutation this row exists for**, and it is a safety defect rather
    // than a navigation one: every assertion about arrows moving agrees with an
    // index that opens at 0, and a destructive verb's confirm then sits on
    // `yes`. `confirm.ts` puts the safe choice last by convention, so `yes`
    // first and `no` marked default is the arrangement where the two readings
    // disagree — an ordering where the default is already first passes both.
    const w = world();
    void w.confirm.ask({ question: "Remove 6 containers?", choices: YES_NO });

    const drawn = frameOf(w.overlays);
    expect(drawn.find((l) => l.includes("[n]")), "the default carries the marker").toContain("•");
    expect(drawn.find((l) => l.includes("[y]")), "and nothing else does").not.toContain("•");
  });

  it("T4.13 (C09 I22, F122, entry 16 A5): the choices are a block, and no glyph is written here", () => {
    // **The seam this deletes.** `ConfirmDeps` carried `capabilities` for one
    // reason — a `raw` block holds text, so a marker written at L4 could never
    // be substituted — and a cell holds a slot instead. The assertion is on the
    // ASCII rendering rather than on the type: a file that stopped taking the
    // capability and still spelled `•` would compile and would draw `•` on a
    // `LANG=C` terminal.
    const w = world();
    void w.confirm.ask({ question: "Remove 6 containers?", choices: YES_NO });

    const ascii = frameOf(w.overlays, ASCII_CAPS);
    expect(ascii.find((l) => l.includes("[n]"))).toContain("-");
    expect(ascii.join("\n"), "the Unicode marker never reaches an ASCII terminal").not.toContain("•");
  });

  it("T4.14 (entry 16 A5): the labels align whether or not a row is marked", () => {
    // **The frame, not the arithmetic.** A glyph is part of a cell's width
    // rather than an addition to it, so a marker sharing the key's cell shifts
    // the selected row two columns left of the others — self-consistent in
    // every count, and visible only by reading the rows against each other.
    // The `raw` form got this by padding with a space; the marker's own column
    // is what replaces that.
    const w = world();
    void w.confirm.ask({ question: "Remove 6 containers?", choices: YES_NO });

    const drawn = frameOf(w.overlays);
    const at = (needle: string): number => {
      const line = drawn.find((l) => l.includes(needle));
      return line === undefined ? -1 : line.indexOf(needle);
    };
    expect(at("[y]"), "both keys start in the same column").toBe(at("[n]"));
    expect(at("[y]")).toBeGreaterThan(0);
  });

  it("T4.15 (C23 I36, entry 16 R1): an unmarked question falls back to the last choice", () => {
    // **`confirm.ts:83`'s argument, asserted rather than described.** Every
    // caller in this repository marks a default, so the fallback only ever runs
    // for a caller that forgot — and the whole claim is that forgetting should
    // be safe. It was first written as a mutation exemption on the grounds that
    // the state is unreachable; it is reachable in one line, and an exemption
    // for a constructible state is a gap wearing a reason.
    const w = world();
    void w.confirm.ask({
      question: "Remove 6 containers?",
      choices: [
        { key: "y", label: "yes" },
        { key: "n", label: "no" },
      ],
    });

    const drawn = frameOf(w.overlays);
    expect(drawn.find((l) => l.includes("[n]")), "the last, which is the safe one").toContain("•");
    expect(drawn.find((l) => l.includes("[y]"))).not.toContain("•");
  });

  it("T4.16 (entry 16 A5): the key column fits the widest accelerator", () => {
    // Two-character keys are legal — `AskOptions` puts no width on `key` — and a
    // floor taken from one of them truncates whichever is longer. That reads as
    // a rendering flicker rather than as a width defect, which is C19's own
    // argument for putting its glyph in the floor (`menu.ts:39`).
    const w = world();
    void w.confirm.ask({
      question: "Which?",
      choices: [
        { key: "y", label: "yes" },
        { key: "no", label: "no", default: true as const },
      ],
    });

    const drawn = frameOf(w.overlays);
    expect(drawn.join("\n"), "`[no]` is whole").toContain("[no]");
    const at = (n: string): number => drawn.find((l) => l.includes(n))?.indexOf(n) ?? -1;
    expect(at("yes"), "and the labels still line up").toBe(at("no ") === -1 ? at("no") : at("no "));
  });

  it("T4.17 (entry 16 A3, A6, C15 I20): placement is a parameter, and width is not derived from it", () => {
    // **Both arms in one row, because either alone is satisfied by a constant.**
    // A confirm that is always centred passes an assertion about `left`; one
    // that is always anchored passes an assertion about the anchor. And the
    // widths are the claim's other half: the centred arm declares one, without
    // which C15 refuses it (I20), and the anchored arm declares none, which is
    // how a layer says *the whole region* — the menu's argument, since a
    // question anchored to the prompt is chrome for the prompt.
    const c = world();
    void c.confirm.ask({ question: "q?", choices: YES_NO });
    expect(c.overlays.top?.placement).toEqual({ kind: "centred" });
    expect(c.overlays.top?.width).toBe(CONFIRM_WIDTH);

    const a = world();
    void a.confirm.ask({ question: "q?", choices: YES_NO, placement: "anchored" });
    expect(a.overlays.top?.placement).toEqual({
      kind: "anchored",
      row: 8,
      rows: 1,
      prefer: "above",
    });
    expect(a.overlays.top?.width, "the whole region, as the menu does").toBeUndefined();
  });

  it("T4.18 (entry 16 A6, C15 I14): the anchored question is still not escapable", () => {
    // **The pairing the walk's A6 names**, and the cell nothing in the tree
    // produced until now: `dismissable: false` with `anchored`. Placement is a
    // live parameter and escapability is a construction one (C15 I14, and
    // `LayerUpdate` excludes it deliberately) — so moving the box must not
    // move the flag. The symptom of getting this wrong is "the shell froze",
    // three components from the cause.
    const w = world();
    const answer = w.confirm.ask({ question: "q?", choices: YES_NO, placement: "anchored" });
    expect(w.overlays.top?.dismissable).toBe(false);
    expect(w.overlays.pop(), "the router cannot take it").toBeNull();
    expect(w.overlays.top?.id).toBe("confirm");

    w.router.dispatch(key("escape"));
    return expect(answer).resolves.toBe("n");
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
