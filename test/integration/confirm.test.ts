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
//   - `blocking: false, dismissal: "escape"` on the confirm layer (`confirm.ts`) → T4.1 and T4.9
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
import { measureSequence, rowsDoc } from "../support/viewport.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { block } from "../../src/data/viewmodel/construct.js";
import { createChoiceSelection, defaultStart } from "../../src/shell/choice-selection.js";
import type { Choice } from "../../src/shell/local/registry.js";
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
function world(
  over: Partial<RouterDeps> = {},
  overlayRegion = { width: 80, height: 24 },
  anchorAt = { row: 8, rows: 1 },
) {
  const store = createTranscriptStore();
  const viewport = createViewport(store, { width: 80, height: 10, measureSequence });
  // **The registry measures `table`, because the choices are one** (C09 §3).
  // `support/overlay.ts`'s default does not register it, so an unregistered
  // kind measures as `raw` — one row for a two-choice list — and the height
  // C15 places is a row short of what the frame draws. The two numbers agreed
  // everywhere until a row compared them.
  const measured = measurable({ definitions: [tableDefinition] });
  const overlays = createOverlayManager({
    registry: { measureSequence: (b, w) => measured.registry.measureSequence(b, w) },
  });
  const focus = createFocusStore();
  const invalidate = vi.fn();
  const globalSeen: InputEvent[] = [];
  let cancels = 0;
  let refusals = 0;

  // **A real line, not a stub** (F1153's rule about a fixture supplying the
  // behaviour): T1.69 asserts the text the reply carries, so the harness must
  // hold one the row can set and watch cleared.
  let draft = "";
  let held = "";
  const confirm = createConfirmHost({
    overlays,
    anchor: () => anchorAt,
    draft: () => draft,
    holdDraft: () => {
      held = draft;
      draft = "";
    },
    restoreDraft: () => {
      draft = held;
      held = "";
    },
    overlayRegion: () => overlayRegion,
    invalidate,
  });

  const deps: RouterDeps = {
    overlayRegion: () => ({ width: 80, height: 24 }),
    overlayAnswerCallback: confirm.answerHandler,
    overlayWouldResolve: confirm.resolvesHandler,
    // **Releases reported, and nothing held**, so a question arrives unguarded
    // (C16 I44's precise arm). It was `false`, and every row spent the guard on
    // a neutral `x` — which is now a refusal that draws `answer this first`
    // (C23 I82), so the rows about what a key means would be reading a question
    // that had already refused once. T4.78 and T4.79 own the guard and say
    // `false` themselves.
    keyReleasesReported: () => true,
    // **The cast below is why this has to be written out** (C16 I49). The other
    // four `RouterDeps` sites are checked, so a required dep forces each of
    // them; this one is `as unknown as RouterDeps`, so a missing field is a
    // `TypeError` at the first dispatch rather than an error at the build.
    childAttached: () => false,
    // C16 I73 — the stack's own count, for the cast's reason above.
    // C16 I74 — no layer here has anything to scroll.
    scrollLayer: () => false,
    // C16 I75 — the escape's detach; nothing here attaches a child.
    detachChild: () => undefined,
    ownerGeneration: () => overlays.generation,
    overlayTop: () => {
      const top = overlays.top;
      return top === null ? null : { kind: top.kind, id: top.id, blocking: top.blocking, dismissal: top.dismissal };
    },
    placed: () => overlays.layout({ width: 80, height: 24 }),
    popLayer: () => void overlays.pop(),
    nativeSelection: () => false,
    semanticSelection: () => false,
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
    // L4's routing, as `construct.ts` does it (C16 I62): a refusal at the
    // question is the question's to explain.
    refused: (r: { rung: string | null }) => {
      refusals += 1;
      if (r.rung === "question") confirm.refuse();
    },
    ...over,
  } as unknown as RouterDeps;

  // The router's clock, moved by the rows that own C16 I69's timed guard.
  const clock = { t: 0 };
  const router = createRouter({ focus, keymap: createKeymap(defaultKeymap), now: () => clock.t, deps });

  // A global binding that must not fire while a question is open (C16 I8) —
  // **and the viewport's own paging, which now must** (C16 I40). The two live in
  // one handler because that is where they live in the tree: `page-scroll`'s
  // route is `target: "global"` in `defaultKeymap`, and `shell/keys.ts` sends it
  // to `viewport.pageUp/pageDown`. A row asserting the reserved route reached
  // `global` and stopping there would be asserting the wiring and calling it the
  // scroll; this calls the same method the shell does, so the assertion is the
  // transcript's offset and not a spy's length.
  router.register("global", (e) => {
    globalSeen.push(e);
    if (e.kind !== "key") return false;
    if (e.key.name === "up" && e.key.meta) return viewport.pageUp(), true;
    if (e.key.name === "down" && e.key.meta) return viewport.pageDown(), true;
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
    refusals: () => refusals,
    clock,
  };
}

/**
 * Present a question (C16 I44, R-BLK-788, M7).
 *
 * **Unguarded, because this world reports key releases and holds none.** It
 * used to report none, so the conservative arm guarded every question and this
 * spent the guard on a neutral `x` — and since C23 I82 a neutral key is a
 * refusal that draws `answer this first`, so every row reading the question
 * afterwards was reading one that had already refused. T4.78 and T4.79 are the
 * rows that own the guard, and they build the other world.
 */
const present = (
  w: ReturnType<typeof world>,
  opts: Parameters<typeof w.confirm.ask>[0],
): ReturnType<typeof w.confirm.ask> => w.confirm.ask(opts);

describe("ctx.ask — routed, not called (C23 I36, C16 I25)", () => {
  it("T4.1 (C16 I25): a real accelerator keystroke resolves the promise", async () => {
    const w = world();
    const answer = present(w, { question: "Stop api-gateway?", choices: YES_NO });

    // The layer is genuinely on C15's stack, and modal by its own flag.
    expect(w.overlays.top?.id).toBe("confirm");
    expect(w.overlays.top?.dismissal).toBe("answer");

    // **Through the router.** This is the line the mutation removes.
    expect(w.router.dispatch(key("y"))).toBe(true);
    await expect(answer).resolves.toEqual({ key: "y" });

    // Answering pops it — the owner's disposal, not the router's.
    expect(w.overlays.top).toBeNull();
  });

  it("T4.2 (C23 I36): Esc resolves with the default rather than cancelling", async () => {
    const w = world();
    const answer = present(w, { question: "Stop api-gateway?", choices: YES_NO });
    expect(w.router.dispatch(key("escape"))).toBe(true);
    await expect(answer).resolves.toEqual({ key: "n" });
  });

  it("T4.81 (C16 I62, C23 I36, ruling 59): ⌃c at an open question leaves it open, unanswered and saying so", async () => {
    // **Inverted in review batch 2.** This was T4.3, *⌃c resolves with the
    // default*, and it was the specified behaviour: the intercept table said
    // `reject` and the dispatch ran the owning rung, whose answer callback
    // classified `⌃c` as `resolve`. §103 has a QUESTION reject the interrupt
    // (ruling 59), so the refusal is what is asserted — and the promise is still
    // the only thing that tells *refused* from *answered and popped late*.
    const w = world();
    const answer = present(w, { question: "Stop api-gateway?", choices: YES_NO });

    expect(w.router.dispatch(ctrlC), "consumed").toBe(true);
    expect(w.router.lastStages).toEqual(["arming", "intercept:interrupt:question:reject", "reject"]);

    let settled = false;
    void answer.then(() => (settled = true));
    await Promise.resolve();
    expect(settled, "the question is not answered").toBe(false);
    expect(w.overlays.top?.id, "and it is still up").toBe("confirm");
    // **And it says so** (C23 I82): a refusal nothing on screen reports is a
    // key swallowed. Read from the frame, on the question's own row.
    const row = frameOf(w.overlays).find((l) => l.includes("Stop api-gateway?"));
    expect(row, "the notice is beside the question").toContain("answer this first");

    // The control: an answer still answers it.
    w.router.dispatch(key("n"));
    await expect(answer).resolves.toEqual({ key: "n" });
  });

  it("T4.4 (C23 I36): arrows move the selection and Enter takes it", async () => {
    const w = world();
    const answer = present(w, { question: "Stop api-gateway?", choices: YES_NO });

    // Default is `n` (index 1); up moves to `y`.
    expect(w.router.dispatch(key("up"))).toBe(true);
    expect(w.router.dispatch(key("return"))).toBe(true);
    await expect(answer).resolves.toEqual({ key: "y" });
  });

  it("T4.5 (C16 I8, I40): ⌥↑ scrolls the transcript with a question open, and the question is neither answered nor dismissed", async () => {
    // **This row asserted the defect.** It read *PgUp does not reach `global`
    // while a question is open* and passed, because the confirm's answer handler
    // took the key at the ladder's question rung — so a reader asked to approve
    // something could not scroll back to read what it was. `page-scroll` is one
    // of §103's three reserved routes; no rung may claim one, and the intercept
    // table is read before the ladder.
    //
    // **Three assertions, because each alone is passed by a router doing the
    // wrong thing.** *The transcript moved* is passed by one that also answered
    // the question; *the question is still open* by one that dropped the key;
    // *unanswered* by one that popped the layer. The old row satisfied the last
    // two, which is why it read as correct for as long as it did.
    const w = world();
    for (let i = 0; i < 12; i += 1) w.store.append(rowsDoc(4, `e${String(i)}`));
    w.viewport.scrollToBottom();

    const answer = present(w, { question: "Stop api-gateway?", choices: YES_NO });
    expect(w.overlays.top?.id, "the question is up").toBe("confirm");

    const before = w.viewport.scroll.topRow;
    expect(before, "there is somewhere to scroll from").toBeGreaterThan(0);

    expect(w.router.dispatch(key("up", { meta: true })), "consumed").toBe(true);
    expect(w.viewport.scroll.topRow, "the transcript moved").toBeLessThan(before);
    expect(w.overlays.top?.id, "and the question is still up").toBe("confirm");

    // Unanswered: the promise has not settled. `await Promise.resolve()` gives a
    // resolution a turn to land, which is what tells *not yet* from *never*.
    let settled = false;
    void answer.then(() => (settled = true));
    await Promise.resolve();
    expect(settled, "nothing was answered by scrolling").toBe(false);

    // **The control, and it is what keeps this a test of the reserved route
    // rather than of "the question stopped taking keys".** An ordinary key still
    // goes to the question: `y` answers it.
    w.router.dispatch(key("y"));
    await expect(answer).resolves.toEqual({ key: "y" });
  });

  it("T4.78 (C16 I44, I69, R-BLK-786, R-BLK-788): a newly presented question refuses an activation and says so", async () => {
    // **The row the eight above spend their guard to get out of the way of.**
    // On a terminal that does not report key releases nothing can tell a key
    // already in flight from a deliberate one, so activations are refused for
    // the grace and the gap (C16 I69) — and refused is not dropped: the verdict
    // is `reject`, the question is still open, and it is still unanswered.
    const w = world({ keyReleasesReported: () => false });
    const answer = w.confirm.ask({ question: "Stop api-gateway?", choices: YES_NO });

    expect(w.router.ownerArmed, "the question arrived, so it is guarded").toBe(true);
    expect(w.router.dispatch(key("y")), "consumed").toBe(true);
    expect(w.router.lastStages).toEqual(["arming", "question-guard", "reject"]);
    expect(w.overlays.top?.id, "still open").toBe("confirm");
    expect(w.router.ownerArmed, "and a refusal extends the guard rather than spending it").toBe(true);

    // After a pause, the reader's own `y` answers.
    w.clock.t += 1_000;
    expect(w.router.dispatch(key("y"))).toBe(true);
    expect(w.router.lastStages).not.toContain("question-guard");
    await expect(answer).resolves.toEqual({ key: "y" });
  });

  it("T4.79 (C16 I44): a neutral key ends the guard without answering", async () => {
    // The control for T4.78, and the half that keeps the guard from being a
    // mode: an arrow under a question that has just arrived reaches the
    // question, moves its selection, and leaves it open — which is how a reader
    // reads what they are being asked before answering it.
    const w = world({ keyReleasesReported: () => false });
    const answer = w.confirm.ask({ question: "Stop api-gateway?", choices: YES_NO });

    expect(w.router.dispatch(key("down")), "neutral, and the question's").toBe(true);
    expect(w.router.lastStages).not.toContain("question-guard");
    expect(w.overlays.top?.id, "unanswered").toBe("confirm");

    expect(w.router.dispatch(key("y")), "and the next key answers, unrefused").toBe(true);
    expect(w.router.lastStages).not.toContain("question-guard");
    await expect(answer).resolves.toEqual({ key: "y" });
  });

  it("T4.5b (C16 I8): an ordinary global binding is still held under a question", async () => {
    // **The other half of I8, unchanged and now load-bearing.** T4.5 gives up
    // exactly the routes that move a viewport without changing state; everything
    // else I8 ever held, it still holds. Without this row T4.5 is equally passed
    // by a router that stopped consulting the ladder at all.
    const w = world();

    // Control: with nothing open, the binding is reached.
    w.router.dispatch(key("pageup"));
    const before = w.globalSeen.length;
    expect(before).toBeGreaterThan(0);

    const answer = present(w, { question: "Stop api-gateway?", choices: YES_NO });
    w.router.dispatch(key("q"));
    expect(w.globalSeen.length, "an unbound key is the question's, not global's").toBe(before);
    // **A `reject` now, where it was consumed with no stage** (C23 I82): the
    // question refused it and said so, and the router records the verdict.
    expect(w.router.lastStages).toEqual(["arming", "target:overlay", "reject"]);

    w.router.dispatch(key("n"));
    await answer;
  });

  it("T4.6 (C16 I25): an unbound key is consumed and the question stays open", async () => {
    const w = world();
    const answer = present(w, { question: "Stop api-gateway?", choices: YES_NO });

    expect(w.router.dispatch(key("q"))).toBe(true);
    expect(w.overlays.top?.id).toBe("confirm");

    w.router.dispatch(key("y"));
    await expect(answer).resolves.toEqual({ key: "y" });
  });

  it("T4.7 (C16 I25): the callback comes from the top layer only", async () => {
    const w = world();
    const answer = present(w, { question: "Stop api-gateway?", choices: YES_NO });

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
      blocking: false,
      dismissal: "escape",
    });

    w.router.dispatch(key("y"));
    // **Released, as this world's terminal would say** (C16 I44, I73). The menu
    // going is an owner change at the `question` rung, so the question is
    // guarded afresh against a key held across it — and a `y` whose release
    // never arrives is held for ever.
    w.router.dispatch({ kind: "key", event: "release", key: { name: "y", ctrl: false, meta: false, shift: false, sequence: "y" } });
    let settled = false;
    void answer.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    w.overlays.pop();
    w.router.dispatch(key("y"));
    await expect(answer).resolves.toEqual({ key: "y" });
  });

  it("T4.9 (C16 I8, C23 I36): the flag is the backstop for what the handler declines", async () => {
    const w = world();
    const answer = present(w, { question: "Stop api-gateway?", choices: YES_NO });

    // A paste is not a key, so the answer handler returns false and the event
    // falls through rung 4 to step 3 — which is where `blocking: true, dismissal: "answer"` earns
    // its place. With the flag `true` and a centred box this reaches `global`,
    // and that is the whole reason the ruling could not be built as written.
    w.router.dispatch({ kind: "paste", text: "xyz" });
    expect(w.globalSeen).toHaveLength(0);
    expect(w.router.lastStages).toContain("modal-blocked");

    w.router.dispatch(key("n"));
    await answer;
  });

  it("T4.81b (C16 I62, I7): ⌃c at a question with a local verb in flight cancels nothing", async () => {
    // **The state the other rows could not construct**, kept from T4.10.
    // `world()` reports `inFlight: () => null`, and a local verb awaiting
    // `ctx.ask` is in flight for the whole time its question is up — so rung 1
    // took `⌃c` and the question never saw it; cancellation discards the entry,
    // and a frame-read found the submitted line had **disappeared**.
    //
    // **Amended in review batch 2** (ruling 59): T4.10 asserted `⌃c` *answered*
    // the question instead. It now does neither — the question is open, the verb
    // is waiting, and the refusal is the table's, before rung 1 is read (I7).
    const w = world({ inFlight: () => "local" });
    const cancelled = w.cancels;

    const answer = present(w, { question: "Stop api-gateway?", choices: YES_NO });
    expect(w.router.dispatch(ctrlC)).toBe(true);

    expect(cancelled(), "the verb must not be cancelled — it was waiting for us").toBe(0);
    let settled = false;
    void answer.then(() => (settled = true));
    await Promise.resolve();
    expect(settled, "and the question is not answered for it").toBe(false);
    expect(w.router.lastStages).toEqual(["arming", "intercept:interrupt:question:reject", "reject"]);

    w.router.dispatch(key("n"));
    await answer;
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
    void present(w, { question: "Remove 6 containers?", choices: YES_NO });

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
    void present(w, { question: "Remove 6 containers?", choices: YES_NO });

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
    void present(w, { question: "Remove 6 containers?", choices: YES_NO });

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
    void present(w, {
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
    void present(w, {
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
    // produced until now: `blocking: true, dismissal: "answer"` with `anchored`. Placement is a
    // live parameter and escapability is a construction one (C15 I14, and
    // `LayerUpdate` excludes it deliberately) — so moving the box must not
    // move the flag. The symptom of getting this wrong is "the shell froze",
    // three components from the cause.
    const w = world();
    const answer = present(w, { question: "q?", choices: YES_NO, placement: "anchored" });
    expect(w.overlays.top?.dismissal).toBe("answer");
    expect(w.overlays.pop(), "the router cannot take it").toBeNull();
    expect(w.overlays.top?.id).toBe("confirm");

    w.router.dispatch(key("escape"));
    return expect(answer).resolves.toEqual({ key: "n" });
  });

  it("T4.28 (entry 16 R2, C15 I8): a question that does not fit keeps its choices", () => {
    // **The defect a frame found and no assertion could.** `composite.ts` writes
    // `lines[0 … height)`, so a box that does not fit loses its tail — and this
    // box's tail is the answers. Measured on an ordinary 24-row terminal with a
    // twenty-row payload: the question and ten rows of detail were drawn, and
    // no `[y]`, no `[n]` and no bottom border. The keys still worked and
    // nothing on screen said so.
    //
    // So the payload is dropped rather than marked: an appended indicator is
    // the first row lost. `…` costs the reader what they could not read anyway.
    const w = world({}, { width: 80, height: 12 });
    void present(w, {
      question: "Remove 6 stopped containers?",
      detail: block({
        kind: "raw",
        id: "d",
        text: Array.from({ length: 20 }, (_, i) => `row ${String(i)}`).join("\n"),
      }),
      choices: YES_NO,
    });

    const placed = w.overlays.layout({ width: 80, height: 12 })[0];
    if (placed === undefined) throw new Error("unreachable");
    const r = measurable({ definitions: [tableDefinition] });
    const all = placed.layer.content.flatMap((b) => r.renderToLines(b, placed.width).map(visible));
    const drawn = all.slice(0, placed.height);

    expect(drawn.some((l) => l.includes("[n]")), "the answers are on the frame").toBe(true);
    expect(drawn.some((l) => l.includes("...")), "and the payload says it was dropped").toBe(true);
    expect(all.length, "nothing is cut at all").toBeLessThanOrEqual(placed.height);
    expect(drawn.some((l) => l.includes("row 0")), "the payload itself is gone").toBe(false);
  });

  it("T4.29 (entry 16 R2): a question that fits keeps its payload", () => {
    // T4.19's control, and it cannot be folded in: dropping the detail
    // unconditionally satisfies every assertion above.
    const w = world();
    void present(w, {
      question: "Remove 1 container?",
      detail: block({ kind: "raw", id: "d", text: "dtui-quiet" }),
      choices: YES_NO,
    });

    const drawn = frameOf(w.overlays);
    expect(drawn.some((l) => l.includes("dtui-quiet"))).toBe(true);
    expect(drawn.some((l) => l.includes("..."))).toBe(false);
  });

  it("T4.30 (entry 16, C15 I7): the anchored question flips when there is no room above", () => {
    // **The flip is a field of the anchored arm and always was**, which is what
    // step 3's check came back with: `Placement` carries `prefer` inside
    // `{kind: "anchored"}` and nowhere else, so a centred layer has no flip to
    // express and the type already says so. Nothing to build — the confirm
    // inherited it the moment it could be anchored, which is what this asserts
    // rather than a mechanism of its own.
    // **A prompt near the top, which is a fresh session and not a contrivance:**
    // two rows above the anchor and twenty-one below. The first draft used the
    // default anchor and a tall payload, and the box went *above* anyway —
    // because the truncation collapse fires first and the short form fits. Two
    // rules meeting, and the fixture agreed with the wrong one.
    const w = world({}, { width: 80, height: 24 }, { row: 2, rows: 1 });
    void present(w, { question: "q?", choices: YES_NO, placement: "anchored" });

    const placed = w.overlays.layout({ width: 80, height: 24 })[0];
    if (placed === undefined) throw new Error("unreachable");
    expect(placed.top, "below the anchor's own row").toBeGreaterThan(2);
  });

  it("T4.31 (entry 16 R1, C23 I36): one store, two starts, and the fallback is the safe end", () => {
    // **The mutation this row exists for is a store that opens at 0.** It
    // passes every navigation assertion, every single-choice case and every
    // menu row, and puts a destructive verb's confirm on `yes`. A safety defect
    // where the difference the entry expected — modular wrap against
    // stop-at-edge — turned out not to exist at all: the two copies of the
    // cycling agreed exactly, so the start is the whole of what is shared.
    // **Real `Choice` values, not the narrow shape `defaultStart` reads.** The
    // signature takes `{ default?: true }` because that is all it looks at, and
    // a bare literal of exactly that shape is a fixture that cannot be a
    // choice — `tsc`'s excess-property check is what said so. A fixture must be
    // the thing under test (`test/support/README.md`).
    const marked: readonly Choice[] = [
      { key: "y", label: "yes" },
      { key: "n", label: "no", default: true },
    ];
    const markedFirst: readonly Choice[] = [
      { key: "y", label: "yes", default: true },
      { key: "n", label: "no" },
    ];
    const unmarked: readonly Choice[] = [
      { key: "y", label: "yes" },
      { key: "n", label: "no" },
    ];
    expect(defaultStart(marked)).toBe(1);
    expect(defaultStart(markedFirst)).toBe(0);
    expect(defaultStart(unmarked), "unmarked falls to the last").toBe(1);

    // The menu's start, in the same store: `null` is a display and does not
    // move, which was a guard written twice before it was one.
    const display = createChoiceSelection(3, null);
    display.next();
    display.prev();
    expect(display.at, "a display has no selection to move").toBeNull();

    const chosen = createChoiceSelection(3, 0);
    chosen.prev();
    expect(chosen.at, "and a real one wraps, in both directions").toBe(2);
    chosen.next();
    expect(chosen.at).toBe(0);
  });

  it("T4.32 (C23 I36): what opens is what Esc resolves with", () => {
    // *The marked one, else the last* was written twice — once for where the
    // selection opens and once for what `Esc` answers — and two records of one
    // fact disagree eventually. A question that opens on `no` and escapes to
    // `yes` is the worst possible pair, so they share one function now and this
    // is the row that says the pair is the claim rather than either half.
    const w = world();
    const answer = present(w, {
      question: "Remove 6 containers?",
      choices: [{ key: "y", label: "yes" }, { key: "n", label: "no" }],
    });
    const drawn = frameOf(w.overlays);
    expect(drawn.find((l) => l.includes("[n]")), "opens on the last").toContain("•");

    w.router.dispatch(key("escape"));
    return expect(answer, "and escapes to it").resolves.toEqual({ key: "n" });
  });

  it("T4.33 (entry 16): the whole entry, read at 24 rows with a twenty-row payload", () => {
    // **The frame both defects lived in, and neither assertion saw.** At this
    // size the payload does not fit: before step 3 the reader was shown the
    // question and ten rows of detail with no `[y]`, no `[n]` and no bottom
    // border, and before step 1 the marker was a character L4 spelled. Every
    // number was self-consistent throughout.
    //
    // One row for the whole entry, because each piece is satisfied by the half
    // that is easy: a marker on the right row says nothing about whether the
    // choices are drawn, and choices being drawn says nothing about which one
    // is marked.
    const w = world({}, { width: 80, height: 24 });
    void present(w, {
      question: "Remove 6 stopped containers?",
      detail: block({
        kind: "raw",
        id: "d",
        text: Array.from({ length: 20 }, (_, i) => `container-${String(i)}`).join("\n"),
      }),
      choices: YES_NO,
    });

    const placed = w.overlays.layout({ width: 80, height: 24 })[0];
    if (placed === undefined) throw new Error("unreachable");
    const r = measurable({ definitions: [tableDefinition] });
    const all = placed.layer.content.flatMap((b) => r.renderToLines(b, placed.width).map(visible));

    expect(all.length, "the box fits the rows it was given").toBeLessThanOrEqual(placed.height);
    expect(all.some((l) => l.includes("...")), "the payload says it was dropped").toBe(true);
    expect(all.some((l) => l.includes("container-0")), "and is gone").toBe(false);

    const marked = all.find((l) => l.includes("[n]"));
    expect(marked, "the safe answer is drawn").toBeDefined();
    expect(marked, "and it is the one marked").toContain("•");
    expect(all.find((l) => l.includes("[y]"))).not.toContain("•");
    expect(all[all.length - 1] ?? "", "and the box closes").toMatch(/[└+]/u);
  });

  it("T4.8 (C23 I36): resolves with a choice on every path, never null", async () => {
    // **`⌃c` is not a path** (ruling 59): it is refused, and T4.81 asserts what
    // that leaves.
    for (const k of [key("y"), key("n"), key("escape"), key("return")]) {
      const w = world();
      const answer = present(w, { question: "q?", choices: YES_NO });
      w.router.dispatch(k);
      const got = await answer;
      // **A key on every path, and no `text` on any of them** (I36, I73). None
      // of these choices opens a typed reply, so `text` being absent is the
      // record that nothing was composed — not a default that would make the
      // reply's own arm indistinguishable from an escape.
      expect(typeof got.key).toBe("string");
      expect(["y", "n"]).toContain(got.key);
      expect(got.text, "nothing was composed under any of them").toBeUndefined();
    }
  });
});

describe("C23 I82 — a question refuses once and says so (review batch 2, M5)", () => {
  it("T4.82 (C23 I82, R-HON-004, ruling 60): the first refused key adds the notice with one update and one invalidate; the second changes nothing", async () => {
    const w = world();
    const answer = present(w, { question: "Stop api-gateway?", choices: YES_NO });
    const updates: string[] = [];
    using _sub = w.overlays.subscribe((c) => void (c.kind === "content" && updates.push(c.id)));
    const before = frameOf(w.overlays);
    expect(before.join("\n"), "the control: nothing refused yet").not.toContain("answer this first");
    w.invalidate.mockClear();

    // The first refusal: one update, one invalidate, and the frame says why.
    expect(w.router.dispatch(key("q")), "consumed").toBe(true);
    expect(updates, "one C15 update").toEqual(["confirm"]);
    expect(w.invalidate, "one invalidate").toHaveBeenCalledTimes(1);
    const first = frameOf(w.overlays);
    const row = first.find((l) => l.includes("Stop api-gateway?"));
    expect(row, "on the question's own row").toContain("answer this first");
    expect(first.length, "and it took no row of its own").toBe(before.length);

    // The second: consumed, and nothing at all.
    expect(w.router.dispatch(key("q")), "consumed").toBe(true);
    expect(updates, "no second update").toEqual(["confirm"]);
    expect(w.invalidate, "no second invalidate").toHaveBeenCalledTimes(1);
    expect(frameOf(w.overlays), "the same lines").toEqual(first);

    // The notice stays with the question and is not an answer: `n` answers.
    w.router.dispatch(key("n"));
    await expect(answer).resolves.toEqual({ key: "n" });
  });

  it("T4.82b (C23 I82, entry 16 R2): at 12 rows the choices are still drawn after the notice lands", () => {
    const w = world({}, { width: 80, height: 12 });
    void present(w, {
      question: "Remove 6 stopped containers?",
      detail: block({ kind: "raw", id: "d", text: Array.from({ length: 4 }, (_, i) => `row ${String(i)}`).join("\n") }),
      choices: YES_NO,
    });
    w.router.dispatch(key("q"));

    const placed = w.overlays.layout({ width: 80, height: 12 })[0];
    if (placed === undefined) throw new Error("unreachable");
    const r = measurable({ definitions: [tableDefinition] });
    const all = placed.layer.content.flatMap((b) => r.renderToLines(b, placed.width).map(visible));
    const drawn = all.slice(0, placed.height);
    expect(drawn.join("\n"), "the refusal is drawn").toContain("answer this first");
    expect(drawn.some((l) => l.includes("[n]")), "and so are the answers").toBe(true);
    expect(all.length, "nothing is cut").toBeLessThanOrEqual(placed.height);
  });

  it("T4.73 (C23 I82, ruling 60): the inspection and the reply state are never refused", async () => {
    const letter = key("q");

    // The inspection: its only key is `esc`, and a reader reading is not refused.
    const inspecting = world();
    void present(inspecting, {
      question: "Apply the patch?",
      detail: block({ kind: "raw", id: "d", text: "diff" }),
      choices: [
        { key: "n", label: "no", default: true },
        { key: "s", label: "show full diff", inspect: true },
      ],
    });
    inspecting.router.dispatch(key("s"));
    expect(JSON.stringify(inspecting.overlays.top?.content), "suspended").toContain("confirm-source");
    inspecting.router.dispatch(letter);
    expect(JSON.stringify(inspecting.overlays.top?.content), "no notice in the inspection").not.toContain(
      "answer this first",
    );

    // The reply state: a letter is composition, passed to the prompt.
    const replying = world();
    void present(replying, {
      question: "Why?",
      choices: [
        { key: "n", label: "no", default: true },
        { key: "r", label: "reply…", reply: true },
      ],
    });
    replying.router.dispatch(key("r"));
    expect(replying.confirm.composing, "composing a reply").toBe(true);
    replying.router.dispatch(letter);
    expect(JSON.stringify(replying.overlays.top?.content), "no notice while composing").not.toContain(
      "answer this first",
    );

    // The control: the same letter at the choice state draws it.
    const choosing = world();
    void present(choosing, { question: "Apply?", choices: YES_NO });
    choosing.router.dispatch(letter);
    expect(JSON.stringify(choosing.overlays.top?.content)).toContain("answer this first");
  });
});

describe("C23 I88 — the inspection scrolls in a built session, owed at the spec commit", () => {
  it.todo(
    "T4.88 (C23 I88, C22 I141, C22 I142): an approval overflowing its region; show full diff; down three times puts line 4 first in the prompt slot, the question unresolved, and the last row names the scroll keys — not deferred on a component: the row lands with the code commit of review batch 4's shell lane, group A (C22 §6q)",
  );
});
