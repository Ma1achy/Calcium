// C15 tier 5 — e2e. Five rows, all live; this header said *entirely deferred*
// until 2026-09-03, two of them on a premise that had been false for some time.
//
// Every one of C15's tier-5 claims is about a layer *and its input*: a menu that
// flips and shows every candidate, a search that stacks over it and hands focus
// back, a view that takes the keys and gives them back on `esc`. C15 supplies
// geometry and a stack; none of those sentences can be written without the
// router that routes to it and the shell that pushes it — so every row here
// drives `node test/support/fixture.mjs session` through a real PTY.
//
// A tier-5 file asserting something C15 can do alone would look like coverage
// and be tier 1 in a different directory.
import { describe, expect, it } from "vitest";

import { createOverlayManager, takesInput } from "../../src/viewport/overlay/index.js";
import type { OverlayManager } from "../../src/viewport/overlay/index.js";
import { MENU_ID, menuLayer } from "../../src/interaction/completion/index.js";
import { SEARCH_ID } from "../../src/interaction/history/index.js";
import { createFocusStore } from "../../src/interaction/router/focus.js";
import { createKeymap, defaultKeymap } from "../../src/interaction/router/keymap.js";
import { createRouter, type RouterDeps } from "../../src/interaction/router/router.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
import { registry } from "../support/overlay.js";
import { openWith } from "../support/history.js";
import { interactivePty, PROMPT, promptRow } from "../support/pty.js";

const escape = (): InputEvent => ({
  kind: "key",
  key: { name: "escape", ctrl: false, meta: false, shift: false, sequence: "\u001b" },
});

/** The shell's half of the router, reduced to what a stack of two layers needs. */
function routerDeps(overlays: OverlayManager): RouterDeps {
  return {
    overlayRegion: () => ({ width: 80, height: 24 }),
    keyReleasesReported: () => false,
    // **The `child` rung's second source** (C16 I49). Required rather than
    // optional, so a harness that means to attach one has to say so.
    childAttached: () => false,
    overlayWouldResolve: () => null,
    overlayAnswerCallback: () => null,
    overlayTop: () => {
      const top = overlays.top;
      return top === null ? null : { kind: top.kind, id: top.id, blocking: top.blocking, dismissal: top.dismissal };
    },
    placed: () =>
      overlays.layout({ width: 80, height: 24 }).filter(takesInput).map((p) => ({
        layer: { id: p.layer.id, kind: p.layer.kind, blocking: p.layer.blocking, dismissal: p.layer.dismissal },
        top: p.top,
        left: p.left,
        height: p.height,
        width: p.width,
      })),
    popLayer: () => void overlays.pop(),
    nativeSelection: () => false,
    exitNativeSelection: () => undefined,
    liveEntry: () => null,
    entryAtRow: () => null,
    inFlight: () => null,
    // C16's subscription rung (C23 §8a). Neither double runs a stream, so the
    // rung must be unable to fire — a `0` that answered `1` would swallow the
    // Ctrl-C these rows are about.
    liveStreams: () => 0,
    cancelNewestStream: () => false,
    cancel: () => undefined,
    signalShellChild: () => undefined,
    region: () => ({ top: 0, height: 24 }),
    mouseEnabled: () => true,
    promptHasText: () => false,
    clearPrompt: () => undefined,
    raiseExitConfirm: () => undefined,
  };
}

describe("C15 e2e — layers under real input", () => {
  // The flip is asserted as geometry in T3.5 and T3.5b. What is left here is
  // that it is *the completion menu* flipping, at a real terminal height, with
  // every candidate visible — which needs C19 to produce the candidates and the
  // shell to own the prompt they sit above.
  it("T5.1: a completion menu near the bottom flips above the prompt and shows every candidate", async () => {
    // **C15's half of C19 T5.3, and worth having twice.** That row asks whether
    // the engine's candidates reach the screen; this one asks whether the layer
    // C15 placed is where C15 said it was — the prompt still carries what was
    // typed, so the menu took none of its rows, and the header is untouched, so
    // it took none of the frame's either.
    //
    // The two are the same session and different subjects, which is what the
    // region ruling made checkable: a layer's box is the viewport's, and the
    // drawer adds the region's top (S01 §3a).
    const pty = interactivePty("node test/support/fixture.mjs session", {
      cols: 60,
      rows: 16,
    });
    try {
      await pty.waitFor(/❯/, 15_000);
      pty.type("/ps --status=");
      pty.type("\t");

      await pty.waitFor(/running/, 15_000);
      await pty.waitFor(/queued/, 15_000);
      // The prompt below it, still holding the line — the layer floated.
      await pty.waitFor(/❯ \/ps --status=/, 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);
  // T5.2, written on the commit C20 landed. C15 §3's "overlays nest freely" is
  // the sentence under test and reverse-i-search over a completion menu is the
  // case it was written for — three components' worth of state, and the only
  // tier where the search is a real search rather than a `rows(3)` stand-in.
  it("T5.2: reverse-i-search over a completion menu — both stacked, keys to the search, esc returns to the menu", async () => {
    const overlays = createOverlayManager({ registry });
    const focus = createFocusStore();
    const router = createRouter({
      focus,
      keymap: createKeymap(defaultKeymap),
      now: () => 1_000,
      deps: routerDeps(overlays),
    });

    overlays.push(menuLayer([{ value: "--status" }, { value: "--since" }], 0, 0, { row: 20, rows: 1 }));
    // **`panel`, because the menu is one** (C15 §2c, I27). The completion menu
    // is a prompt substate rather than a question, so the target it answers at
    // is the substate rung's.
    expect(router.target).toBe("panel");

    const { store } = await openWith();
    for (const c of ["/ps --status=running", "/logs digit-42"]) store.append(c, 0);
    store.searchOpen("/p");
    overlays.push(store.searchLayer({ row: 20, rows: 1 }));

    // Both layers, the search on top, and every keystroke going to it.
    expect(overlays.stack.map((l) => l.id)).toEqual([MENU_ID, SEARCH_ID]);
    store.searchType("digit");
    overlays.update(SEARCH_ID, { content: store.searchLayer({ row: 20, rows: 1 }).content });
    expect(store.searchState?.hit?.command).toBe("/logs digit-42");

    // Both are placed, neither escapes the region, and the search is drawn over
    // the menu — C15 sorts by kind and then by push order.
    const placed = overlays.layout({ width: 80, height: 24 });
    expect(placed.map((p) => p.layer.id)).toEqual([MENU_ID, SEARCH_ID]);
    for (const p of placed) expect(p.top + p.height).toBeLessThanOrEqual(24);

    // `Esc` — one row in C16's table, dispatched to whatever is on top. The
    // handler is L4's and is written here as L4 will write it: read the action
    // from the keymap, and let the layer on top decide what it means. That is
    // the seam C20 §5 names when it says the bindings are C16's.
    const keymap = createKeymap(defaultKeymap);
    // **`panel`, both times** (C15 I27, M8). The menu and the search are
    // panels, so this is the target they answer at and the target the binding
    // is declared on — `escape → dismiss` is bound at `overlay` as well, and a
    // handler reading the wrong one of the two resolves nothing.
    router.register("panel", (e) => {
      if (e.kind !== "key") return false;
      const binding = keymap.resolve("panel", e.key);
      if (binding?.action !== "dismiss") return false;
      if (overlays.top?.id === SEARCH_ID) store.searchEnd("cancel");
      overlays.pop();
      return true;
    });

    expect(router.dispatch(escape()), "consumed").toBe(true);
    expect(overlays.stack.map((l) => l.id)).toEqual([MENU_ID]);
    expect(router.target, "the menu is still there, and still has the keys").toBe("panel");
    expect(store.searchState).toBeNull();
  });
  // **T5.3 and T5.5 were written about a push and outlive it** (C22 §13a,
  // R-EXA-082, F1253). They asserted that a view verb covered the transcript and
  // took the keys, and that `esc` popped the layer leaving nothing behind — the
  // ruling C22 §13a took, and the ruling the design overturns: a verb's result
  // has no prompt and no context of its own, so it is an entry.
  //
  // **Re-aimed rather than struck, and they are stronger for it.** The old pair
  // asserted an absence — the transcript is *not* on screen, nothing was
  // appended — and an absence is what a broken session also produces. The pair
  // below asserts what is there: both entries at once, and a prompt that still
  // has the keys.
  it("T5.3 (C22 §13a, R-EXA-082): a streaming verb lands in the transcript beside the entry before it, and the prompt keeps the keys", async () => {
    const pty = interactivePty("node test/support/fixture.mjs session", { cols: 80, rows: 20 });
    try {
      await pty.waitFor(PROMPT, 15_000);
      // Something in the transcript first, so "beside it" has a referent.
      pty.type("/ps --mine\r");
      await pty.waitFor(/a3f9b21/, 15_000);
      expect(pty.frame.join("\n")).toContain("/ps --mine");

      pty.type("/ps --watch\r");
      await pty.waitForFrame((f) => f.join("\n").includes("watching"), 15_000);

      // **Both, at once** — the claim the old row made in reverse. The record is
      // the product, so the work that used to take the screen is an entry under
      // the work before it.
      const both = pty.frame.join("\n");
      expect(both, "the entry before it is still on screen").toContain("/ps --mine");
      expect(both, "and the new one is its own entry, with its command echoed").toContain("--watch");

      // **The prompt keeps the keys**, which is what *no frame of its own* means
      // at the keyboard: a printable reaches the prompt while the stream runs.
      // The old row asserted the opposite and used T5.5 as its control; there is
      // one claim now and it needs none.
      pty.type("still-here");
      await pty.waitForFrame((f) => promptRow(f).includes("still-here"), 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);
  // C01 already delivers the SIGWINCH snapshot this needs; what is missing is
  // the thing that composes a frame from it, so the blocker is L4 alone. Naming
  // C01 alongside it made this expire the moment the rule ran, which is TD2
  // doing exactly what it is for.
  it("T5.4: resizing with layers open — they reposition, none escapes the region, no blank frames", async () => {
    // **The row the region ruling is really about.** A layer\u2019s box is clamped
    // to the viewport region, and the viewport region is what a resize changes;
    // if the drawer wrote a box that escaped it, the frame would be refused and
    // the fallback drawn \u2014 which is exactly what "blank frames" would look like
    // from out here (C22 I30).
    const pty = interactivePty("node test/support/fixture.mjs session", {
      cols: 100,
      rows: 24,
    });
    try {
      await pty.waitFor(/\u276f/, 15_000);
      pty.type("/ps --status=");
      pty.type("\t");
      await pty.waitFor(/queued/, 15_000);

      // Narrower and much shorter, down to the size gate\u2019s minimum. The menu
      // is anchored to a prompt whose row has moved and sized against a region
      // that has shrunk by eight rows.
      pty.resize(60, 16);
      await pty.waitFor(/\u276f \/ps --status=/, 15_000);

      // **The session is still live afterwards**, which is the half a test of
      // the redrawn frame alone would miss: a refused frame draws the fallback
      // and takes no further input, and both look like "it resized fine" in a
      // single snapshot.
      //
      // The menu is accepted rather than escaped, and the first draft of this
      // row did the latter and found two things. An `Esc` followed immediately
      // by a printable is decoded as that key with `meta` \u2014 the 50 ms window
      // (C16 §2) \u2014 so the dismissal never fired. And with the menu still open
      // every printable was dropped, because `activeTarget` is `overlay` and
      // the overlay handler consumes only bound keys: the interaction C22 \u00a76a\u2019s
      // trace named and did not own, arriving in a real session.
      pty.type("\r");
      await pty.waitFor(/--status=running/, 15_000);
      pty.type(" --mine\r");
      await pty.waitFor(/--mine/, 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);
  // **The trace was ruled out, not deferred.** S12 §3 records it: an earlier
  // draft had C23 write `logs a3f9b21 — 1,284 lines … (esc 14:24:08)` and it
  // could not be built — the trace is an entry, an entry freezes its
  // predecessor, and the frozen block is the one A01 D7 returns focus to.
  it("T5.5 (C23 §4, C22 §13a, B03 §2): esc over a streaming entry takes nothing away, because there is nothing to pop", async () => {
    const pty = interactivePty("node test/support/fixture.mjs session", { cols: 80, rows: 20 });
    try {
      await pty.waitFor(PROMPT, 15_000);
      pty.type("/ps --mine\r");
      await pty.waitFor(/a3f9b21/, 15_000);
      pty.type("/ps --watch\r");
      await pty.waitForFrame((f) => f.join("\n").includes("watching"), 15_000);

      pty.type("\u001b");
      await new Promise((r) => setTimeout(r, 400));

      // **B03 §2, with the premise gone.** The old row asserted that `esc`
      // removed a layer and left the transcript exactly as it had been; there is
      // no layer, so what it asserts now is that `esc` is inert over the
      // transcript — both entries still there afterwards. That is the half of
      // B03 §2 that survives a world with no push, and it is the half that says
      // a reader cannot lose the record by pressing the key that used to.
      const after = pty.frame.join("\n");
      expect(after, "the entry before it").toContain("/ps --mine");
      expect(after, "and the streaming one").toContain("watching");

      // And the prompt still has the keys — the control that the session is
      // live rather than wedged, which an assertion about what is on screen
      // cannot supply on its own.
      pty.type("still-here");
      await pty.waitForFrame((f) => promptRow(f).includes("still-here"), 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);
});
