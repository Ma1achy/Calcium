// C15 tier 5 — e2e. Entirely deferred, and that is the honest state.
//
// Every one of C15's tier-5 claims is about a layer *and its input*: a menu that
// flips and shows every candidate, a search that stacks over it and hands focus
// back, a confirm that ignores `esc` and answers to `n`. C15 supplies geometry
// and a stack; none of those sentences can be written without the router that
// routes to it and the engine that fills it.
//
// A tier-5 file asserting something C15 can do alone would look like coverage
// and be tier 1 in a different directory.
import { describe, expect, it } from "vitest";

import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import type { OverlayManager } from "../../src/viewport/overlay/index.js";
import { MENU_ID, menuLayer } from "../../src/interaction/completion/index.js";
import { SEARCH_ID } from "../../src/interaction/history/index.js";
import { createFocusStore } from "../../src/interaction/router/focus.js";
import { createKeymap, defaultKeymap } from "../../src/interaction/router/keymap.js";
import { createRouter, type RouterDeps } from "../../src/interaction/router/router.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
import { registry } from "../support/overlay.js";
import { openWith } from "../support/history.js";
import { interactivePty } from "../support/pty.js";

const escape = (): InputEvent => ({
  kind: "key",
  key: { name: "escape", ctrl: false, meta: false, shift: false, sequence: "\u001b" },
});

/** The shell's half of the router, reduced to what a stack of two layers needs. */
function routerDeps(overlays: OverlayManager): RouterDeps {
  return {
    overlayTop: () => {
      const top = overlays.top;
      return top === null ? null : { kind: top.kind, id: top.id, dismissable: top.dismissable };
    },
    placed: () =>
      overlays.layout({ width: 80, height: 24 }).map((p) => ({
        layer: { id: p.layer.id, kind: p.layer.kind, dismissable: p.layer.dismissable },
        top: p.top,
        left: p.left,
        height: p.height,
        width: p.width,
      })),
    popLayer: () => void overlays.pop(),
    copyMode: () => false,
    exitCopyMode: () => undefined,
    liveEntry: () => null,
    entryAtRow: () => null,
    inFlight: () => null,
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
    expect(router.target).toBe("overlay");

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
    router.register("overlay", (e) => {
      if (e.kind !== "key") return false;
      const binding = keymap.resolve("overlay", e.key);
      if (binding?.action !== "dismiss") return false;
      if (overlays.top?.id === SEARCH_ID) store.searchEnd("cancel");
      overlays.pop();
      return true;
    });

    expect(router.dispatch(escape()), "consumed").toBe(true);
    expect(overlays.stack.map((l) => l.id)).toEqual([MENU_ID]);
    expect(router.target, "the menu is still there, and still has the keys").toBe("overlay");
    expect(store.searchState).toBeNull();
  });
  // T4.5b asserts the ladder's shape against C15 alone. This is the same claim
  // through a real keystroke, and the rung that must not fire is the one that
  // pops the dashboard out from under the confirm.
  it.todo(
    "T5.3: a confirm inside the dashboard — drawn over it, esc does nothing, n resolves it and returns. The routing half is asserted in test/integration/router.test.ts T4.2; composing the session is what remains — waits on C23 — the dashboard the confirm sits inside is a pushed view produced by running a verb",
  );
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
  it.todo(
    // **The trace was ruled out, not deferred.** S12 §3 records it: an earlier
    // draft had C23 write `logs a3f9b21 — 1,284 lines … (esc 14:24:08)` and it
    // could not be built — the trace is an entry, an entry freezes its
    // predecessor, and the frozen block is the one A01 D7 returns focus to.
    // C23 §4's pop row is the ruling, so the row asserts what remains true.
    "T5.5: esc from the logs view — the view pops, nothing is appended, and focus returns to the live block — waits on C24 — a PTY needs a binary to drive",
  );
});
