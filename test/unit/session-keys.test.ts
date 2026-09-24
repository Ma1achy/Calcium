// C22 §3 steps 11 and 12 — the handlers, the effect table, and the read loop.
//
// **The gap these close was invisible from every green test in the tree.**
// `construct.ts` registered two handlers: `prompt`, which tested for a key name
// the decoder has never produced, and `global` for scroll. None of
// `defaultKeymap`'s fourteen bindings was executed anywhere — each action name
// appeared in `keymap.ts` and in no other file — and nothing read stdin at all.
// Every component involved was finished and had its own passing suite.
import { describe, expect, it, vi } from "vitest";

import { defaultKeymap } from "../../src/interaction/router/keymap.js";
import { MENU_ID } from "../../src/interaction/completion/index.js";
import { SEARCH_ID } from "../../src/interaction/history/index.js";
import { buildGraph, COPY_MODES } from "../support/session.js";
import { createKeyEffects } from "../../src/shell/keys.js";
import { createFocusStore } from "../../src/interaction/router/focus.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";
import type { Graph } from "../../src/shell/construct.js";

import { producerContext } from "../support/producer-context.js";
import { navElement } from "../support/focus.js";
import type { Action } from "../../src/data/viewmodel/index.js";
import type { NavElement } from "../../src/presentation/blocks/index.js";
const key = (k: { name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): Key => ({
  name: k.name,
  ctrl: k.ctrl ?? false,
  meta: k.meta ?? false,
  shift: k.shift ?? false,
  sequence: k.name,
});

const press = (k: Parameters<typeof key>[0]): InputEvent => ({ kind: "key", key: key(k) });

/**
 * C14's four scroll operations, recording which was called (C16 I23).
 *
 * Named methods rather than a `Proxy` over a real viewport: the claim is which
 * *action* fired, and a real viewport clamps — `scrollToTop` on a document that
 * already sits at the top is indistinguishable from nothing happening, which is
 * the state a fresh graph is in.
 */
function recordingViewport(): {
  calls: string[];
  viewport: { pageUp(): void; pageDown(): void; scrollToTop(): void; scrollToBottom(): void };
} {
  const calls: string[] = [];
  return {
    calls,
    viewport: {
      pageUp: () => void calls.push("pageUp"),
      pageDown: () => void calls.push("pageDown"),
      scrollToTop: () => void calls.push("scrollToTop"),
      scrollToBottom: () => void calls.push("scrollToBottom"),
    },
  };
}

/** A dismissable layer, so `activeTarget` resolves to `overlay` (C16 §3). */
function openOverlay(graph: Graph): void {
  graph.overlays.push({
    id: "probe",
    kind: "overlay",
    placement: { kind: "centred" },
    content: [],
    blocking: false,
    dismissal: "escape",
    // Declared, because a centred layer must be (C15 I20).
    width: 20,
  });
}

/**
 * A child surface, so the `child` rung has a subject (C16 I49).
 *
 * **Nothing is cleared first, and that is the measurement C22 I110 bought.**
 * Until the child's blocks became an entry the attach pushed a `kind: "view"`
 * layer, C15 refused a view onto a non-empty stack, and a peek left by an
 * earlier binding in this walk made the attach throw — so the helper opened by
 * emptying the stack. The entry route touches no layer at all.
 */
function attachChild(graph: Graph): void {
  graph.surface.open({
    schema: "calcium.child-surface/1",
    id: "probe-child",
    keymap: [],
    render: () => [],
    onAction: () => undefined,
  });
}

/**
 * A panel, which is anchored, non-blocking and closed by `escape` — and refused
 * in any other combination (C15 I27). The menu's four rows and the search's one
 * answer here rather than at `overlay` since M8.
 */
function openPanel(graph: Graph): void {
  graph.overlays.push({
    id: "probe-panel",
    kind: "panel",
    placement: { kind: "anchored", row: 20, rows: 1, prefer: "above" },
    content: [],
    blocking: false,
    dismissal: "escape",
  });
}

/** A table block, so the live entry has rows to focus (C11 `focusableRowIds`). */
const TABLE = {
  kind: "table" as const,
  id: "t",
  columns: [
    { key: "name", label: "Name", align: "left" as const, priority: 10, minWidth: 4, sortable: false },
  ],
  rows: [
    { id: "r1", cells: { name: { text: "api" } } },
    { id: "r2", cells: { name: { text: "worker" } } },
  ],
};

/** A complete document carrying a table, for the rows that need a live block. */
const LIVE_DOC = {
  schema: "tui.view/1",
  command: "/ps",
  status: "ok",
  blocks: [TABLE] as unknown[],
  meta: {
    verb: "ps",
    adapter: "passthrough",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: [] as string[],
    stderr: "",
    transport: "local",
    origin: "user",
  },
};


/**
 * Focus in the live block, reached the way a user reaches it (C16 I22).
 *
 * Through the keystroke rather than by setting the store: the store is not on
 * `Graph` and should not be, and entering by the real path is what makes this
 * setup a claim about the mechanism rather than about a field.
 */
function enterLive(graph: Graph): void {
  if (graph.transcript.liveId === null) {
    graph.transcript.append(
      {
        schema: "tui.view/1",
        command: "/ps",
        status: "ok",
        blocks: [TABLE],
        meta: {
          verb: "ps",
          adapter: "passthrough",
          exitCode: 0,
          durationMs: 0,
          truncated: false,
          argv: [],
          stderr: "",
          transport: "local",
          origin: "user",
        },
      } as never,
      { streaming: true },
    );
  }
  graph.editor.clear();
  graph.router.dispatch(press({ name: "down" }));
}

/**
 * Focus **inside** a block, reached the way a reader reaches it (C26 I26, §102).
 *
 * `enterLive`'s argument one rung up: through the keystrokes rather than by
 * calling `setMode`, so the setup is a claim about the mechanism. The block has
 * to be one with an inside — a plot with a camera, which is what declares
 * `viewState` — because `⏎` on a table row dispatches its `activate` instead.
 */
function enterInside(graph: Graph): void {
  if (!graph.transcript.entries.some((e) => e.doc.command === "/plot")) {
    graph.transcript.append(
      {
        schema: "tui.view/1",
        command: "/plot",
        status: "ok",
        blocks: [{ kind: "plot", id: "camera-plot", form: "line", height: 3, camera: { azimuth: 0 }, series: [{ label: "s", values: [1, 2, 3] }] }],
        meta: {
          verb: "plot",
          adapter: "passthrough",
          exitCode: 0,
          durationMs: 0,
          truncated: false,
          argv: [],
          stderr: "",
          transport: "local",
          origin: "user",
        },
      } as never,
      { streaming: true },
    );
  }
  graph.editor.clear();
  graph.focus.reset();
  graph.router.dispatch(press({ name: "down" }));
  graph.router.dispatch(press({ name: "enter" }));
}

describe("C22 §3 step 11 — the effect table", () => {
  it("T1.4h (C22 I26): every binding in the table is consumed at its target", async () => {
    // **Derived from `defaultKeymap`, never listed here.** A hand-written list
    // is the shape that let fourteen bindings go unexecuted while every test
    // passed: the list agrees with itself, and the table it was copied from is
    // free to grow a row nobody dispatches. `/help` renders that row.
    const { graph } = await buildGraph();
    graph.lifecycle.acquire();

    expect(defaultKeymap.length, "the table is not empty, so this is not vacuous").toBeGreaterThan(0);

    const base = defaultKeymap.filter((b) => b.profile !== "enhanced-terminal");
    // **The enhanced routes are skipped, and the skip is checked rather than
    // asserted** (C16 I35, I36, M6). This graph is a default-terminal session,
    // so a route that resolves only under the Kitty protocol reaches no handler
    // here — correctly. What the walk would lose is the *action*, and it loses
    // nothing: I36 requires every action to have a base route, so each skipped
    // row's effect is still exercised by the row that carries it. Asserted,
    // because a skip nobody checks is a hole shaped like a decision.
    for (const b of defaultKeymap) {
      if (b.profile !== "enhanced-terminal") continue;
      expect(
        base.some((r) => r.action === b.action),
        `${b.action} is skipped here and covered by its default-terminal route`,
      ).toBe(true);
    }

    for (const b of base) {
      if (b.target === "overlay") openOverlay(graph);
      if (b.target === "panel") openPanel(graph);
      // **The `child` rung needs a child** (C16 I49). Without one `activeTarget`
      // answers `prompt` and `⌃]` is typed into the editor — the row would fail
      // for a reason that has nothing to do with whether its effect exists,
      // which is the argument `pushedView` made one target earlier.
      if (b.target === "child") attachChild(graph);
      // `liveBlock` needs both halves of what `activeTarget` reads: a live
      // entry in C13 and focus stored there (C16 §3).
      if (b.target === "liveBlock") enterLive(graph);
      // **The inside needs a block that has one** (C26 I26, §102). `enterLive`'s
      // table declares no view state, so `⏎` there dispatches a row action and
      // leaves the mode alone — the row would fail for a reason that has nothing
      // to do with whether its effect exists, which is `child`'s argument above.
      if (b.target === "interaction") enterInside(graph);
      // **The `copy` rung's two targets, and they were unreachable** (C16 I50).
      // `FRAME` hard-wired both flags to `false`, so no row at either could
      // resolve — and `nativeSelection`'s `escape` row passed anyway, consumed
      // by whatever layer the previous iteration had left open. The second
      // target arriving at the same rung is what made that visible, which is
      // the argument for walking a table rather than listing it.
      COPY_MODES.native = b.target === "nativeSelection";
      COPY_MODES.semantic = b.target === "semanticSelection";
      const consumed = graph.router.dispatch(press(b.key));
      expect(consumed, `${b.target}:${b.key.name} -> ${b.action} reached no handler`).toBe(true);
      if (b.target === "overlay") graph.overlays.dismiss("probe");
      // **Every layer, not just the probe.** `reverseSearch` is a *prompt*
      // binding that pushes one, and nothing here was taking it back down — so
      // `activeTarget` became `overlay` for every row after it and stayed
      // there. Latent until C17's editing bindings arrived, because they are
      // the first prompt rows that follow it: the loop was leaving state it
      // claimed to have reset, and the failure named the new binding rather
      // than the leak.
      while (graph.overlays.top !== null) graph.overlays.dismiss(graph.overlays.top.id);
      COPY_MODES.native = false;
      COPY_MODES.semantic = false;
      graph.editor.clear();
    }
  });

  it("T2.14 (C16 I21): every editing operation C17 exposes is reached by some binding", async () => {
    // **The mechanism the vocabulary rests on.** C17's public surface is the
    // action vocabulary, so this asks the editor which of its methods the
    // keymap can reach — rather than comparing two lists that were written from
    // each other. A count would have passed against the union that had no
    // editing action in it at all, which is the state this row was written in:
    // every mechanism satisfied, the vocabulary they were total over
    // incomplete, and backspace doing nothing at a real prompt.
    //
    // The non-editing surface is an **explicit exception list with its reason**
    // rather than a narrower selector, so a method added to C17 joins the
    // covered set or this list deliberately (`allow-list rather than narrow
    // scope`).
    const NOT_EDITING = new Set([
      // Geometry and measurement — the frame's, not a key's.
      "layout",
      "displayRows",
      "cursorCell",
      // The clipboard primitive `copy` is written in terms of, and the
      // transcript's `y` writes through it — so it *is* reached by a binding,
      // just not by one at this target. C16 §5a row A4 is why `copyElement`
      // lives on `liveBlock` and cannot be bound here.
      "copyText",
      // Readers of the selection, not operations on it (C17 §5b). `extend` and
      // `selectAll` are the bound half and are covered above; these two are
      // what step 3's copy and entry 23's wash will read.
      "selection",
      "selected",
      // Diagnostics, and C16's `lastStages` precedent.
      "undoDepth",
      "redoDepth",
      "killBuffer",
      // State the shell drives directly: `insert` is the printable path in the
      // handler rather than a bound action, `setText` is how history and
      // completion write a whole line, and `clear` is submission's (Seam 4).
      "insert",
      "setText",
      "clear",
      // **The borrow, and it is excluded on the invariant's own words** (C17
      // I28, §101). `snapshot` is a read like `selection`; `restore` is
      // explicitly *not an edit* — that is the half of I28 T1.50 asserts, and
      // a key that could reach it would put the reader's held line back
      // whenever they pressed it, which is not an editing operation but a
      // second owner's undo. The driver is the question (C23 I73), and the
      // question is not a binding at this target.
      "snapshot",
      "restore",
      // **Roadmap 30's two, and each is excluded for its own reason.**
      // `resolved` is a *read* like `text` — the buffer with chips expanded, for
      // the submission site — and not an editing operation at all. `insertChip`
      // is driven by the shell like `insert` above it, and by an event kind this
      // table does not index: a **paste**, in the same handler, which is why a
      // scan over key bindings cannot see it.
      "resolved",
      "insertChip",
      // **A reader, and the one a projection asks** (C17 I27, §5d). It answers
      // which chip the caret is on and edits nothing; its caller is C22's
      // preview, which is derived from the caret rather than bound to a key —
      // so a scan over key bindings cannot see it and should not.
      "chipAt",
      // Construction rather than an edit — it records no undo unit and
      // `createEditor` is its only caller (C17 §5).
      "seed",
      // Accessors.
      "text",
      "cursor",
      "lines",
      "constructor",
    ]);

    const { graph } = await buildGraph();
    graph.lifecycle.acquire();

    const called = new Set<string>();
    const real = graph.editor;
    const spy = new Proxy(real, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          called.add(String(prop));
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    }) as typeof real;

    const effects = createKeyEffects({
      submit: () => undefined,
      focusTranscript: () => undefined,
      // C16 I49 — the child's one exit. Counted here rather than stubbed
      // silent, because this harness is the one that walks every action.
      detachChild: () => undefined,
      editor: spy,
      pageBlock: graph.pageBlock,
      orbitBlock: graph.orbitBlock,
      tiltBlock: graph.tiltBlock,
      dollyBlock: graph.dollyBlock,
      resetCamera: graph.resetCamera,
      toggleOrbit: graph.toggleOrbit,
      toggleSeries: graph.toggleSeries,
      completion: graph.completion,
      overlays: graph.overlays,
      history: graph.history,
    enterNativeSelection: () => undefined,
    enterSemanticSelection: () => undefined,
    escapeSemanticSelection: () => undefined,
    selectEntryUnderCaret: () => undefined,
    selectAllLoadedEntries: () => undefined,
    copySelectedEntries: () => undefined,
    moveSemanticCaret: () => undefined,
    exitNativeSelection: () => undefined,
      manifest: null,
      viewport: recordingViewport().viewport,
      anchor: () => ({ row: 10, rows: 1 }),
      overlayRegion: () => ({ width: 80, height: 24 }),
      redraw: () => undefined,
      focus: createFocusStore(),
      // A stand-in, and it must not supply the behaviour: this suite drives the
      // editing bindings, and whether `enter` on a row reaches C23's dispatcher
      // is a wiring question a file that builds its own deps cannot answer.
      // T4.x in session.test.ts is where that is asserted. So the elements
      // declare no `activate` — an absent member, not an `undefined` one.
      liveElements: () => [
        { blockId: "b1", element: navElement("row-0", 0) },
        { blockId: "b1", element: navElement("row-1", 1) },
      ],
      liveEntryId: () => null,
      // The focused entry is the live one throughout this suite (C26 I21): no
      // row here moves between entries, so the two lists are one list.
      focusedElements: () => [
        { blockId: "b1", element: navElement("row-0", 0) },
        { blockId: "b1", element: navElement("row-1", 1) },
      ],
      focusedEntryId: () => null,
      neighbourEntry: () => null,
      cursorBlock: () => undefined,
      rerunEntry: () => undefined,
      onAction: () => undefined,
      schedule: (fn: () => void) => {
        fn();
        return { [Symbol.dispose]: () => undefined };
      },
    });

    // Every prompt binding, through the table dispatch uses.
    for (const b of defaultKeymap) {
      if (b.target !== "prompt") continue;
      const effect = effects.table[b.action];
      expect(effect, `${b.action} has no effect`).toBeDefined();
      effect?.();
    }

    // The surface, read off the editor rather than listed here.
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(real));
    const editing = surface.filter((n) => !NOT_EDITING.has(n));
    expect(editing.length, "the surface was read, not assumed").toBeGreaterThan(5);

    // **No exceptions.** `undo` and `redo` were the one entry this list held,
    // and the reason it held them was that `⌃_` is the same byte as `⌃⇧-` and
    // the decoder maps 0x01 to 0x1a and stops. That argued against `⌃_` rather
    // than against binding at all: `⌃z` and `⌥z` reach both, and the list is
    // now empty — which is the state it should be kept in.
    const unreached = editing.filter((n) => !called.has(n));

    expect(unreached, "a C17 editing method no key can reach").toEqual([]);
  });

  it("T1.4l (C09 I13): a constructed graph can render all twenty-five kinds", async () => {
    // **`table`, `plot` and `patch` register through the public mechanism, and
    // nobody called it.** `defaults: true` ships C09's sixteen; the other
    // three came from C11, C12 and C25 and no composition root registered them,
    // so a stock session had no renderer for a table and every one fell through
    // to the fallback — which draws the block's JSON. The framework's own
    // `/history` returns a table, so it rendered its own output as source.
    //
    // Asserted as the three by name rather than as a count: a count passes
    // against any three, and these are the three the framework itself produces.
    const { graph } = await buildGraph();
    for (const kind of ["table", "plot", "patch"]) {
      expect(graph.blocks.kinds, `${kind} has no renderer`).toContain(kind);
    }
    // **Fifteen defaults plus these three, and the split moved with `scroll`** --
    // which is why this was read rather than swept: the sentence said *fourteen*
    // and the total said 17, and a kind added to C09's defaults changes both
    // numbers by one in different places.
    //
    // **A hand-maintained total, and that is the finding rather than the fix.**
    // It cannot be derived here: `graph.blocks.kinds` is the registry's own
    // answer, so comparing it to itself proves nothing, and the union is a type.
    // C04 T2.10 holds the derivable half -- a literal list checked against
    // `BlockKind` at compile time, where adding a kind is a type error. This row
    // is the runtime half and it can only count.
    expect(graph.blocks.kinds.length, "C09's twenty-two and the three registered").toBe(25);
  });

  it("T2.15 (C16 I22): ↓ into the live block, ↑ and Esc back out — as one sequence", async () => {
    // **A sequence, not four cases.** The defect it replaces was an entry with
    // no exit — `enterLiveBlock` had no caller and nothing bound `Esc` at the
    // live block — and every case-at-a-time test passes against that: each
    // assertion sets up the state it then checks. Only a walk that has to
    // *arrive* somewhere can see there is no way back.
    const { graph } = await buildGraph();
    graph.lifecycle.acquire();
    graph.transcript.append(LIVE_DOC as never, { streaming: true });
    graph.history.append("/ps --mine", 0);

    const down = (): void => void graph.router.dispatch(press({ name: "down" }));
    const up = (): void => void graph.router.dispatch(press({ name: "up" }));

    // History first, because entering is what `↓` does *after* its end.
    up();
    expect(graph.editor.text, "↑ walks history").toBe("/ps --mine");
    expect(graph.router.target, "still the prompt").toBe("prompt");

    down();
    expect(graph.router.target, "↓ restores the draft — still history's").toBe("prompt");

    down();
    expect(graph.router.target, "↓ past the end enters the live block").toBe("liveBlock");

    // Between rows, then out of the top.
    down();
    up();
    up();
    expect(graph.router.target, "↑ from the first row returns to the prompt").toBe("prompt");

    // And `Esc`, the route S01's footer advertises.
    down();
    expect(graph.router.target).toBe("liveBlock");
    graph.router.dispatch(press({ name: "escape" }));
    expect(graph.router.target, "Esc returns from anywhere in the block").toBe("prompt");
  });

  it("T2.15b (C16 I22): a live entry with no focusable row is not entered", async () => {
    // A notice has no rows, so entering would put focus where `activeTarget`
    // says `liveBlock`, every key would resolve against a target with no
    // bindings, and they would all be dropped.
    const { graph } = await buildGraph();
    graph.lifecycle.acquire();
    graph.transcript.append(
      { ...LIVE_DOC, blocks: [{ kind: "raw", id: "r", text: "no rows here" }] } as never,
      { streaming: true },
    );

    graph.router.dispatch(press({ name: "down" }));
    expect(graph.router.target, "nothing to focus, so ↓ does nothing").toBe("prompt");

    // **The control**, because a clause that never fires and a clause that
    // always no-ops are the same green: the same sequence against an entry that
    // does have rows enters.
    graph.transcript.append(LIVE_DOC as never, { streaming: true });
    graph.router.dispatch(press({ name: "down" }));
    expect(graph.router.target, "and a table is entered").toBe("liveBlock");
  });

  it("T1.4h2 (C22 I26): the effects that are observable from outside, each asserted", async () => {
    const { graph } = await buildGraph();
    graph.lifecycle.acquire();

    // C17 — a bound newline, and the plain typing that is not in the table at
    // all. A printable key was the other half of step 11 that did not exist.
    graph.router.dispatch(press({ name: "j", ctrl: true }));
    expect(graph.editor.text, "insertNewline").toBe("\n");

    graph.editor.clear();
    for (const ch of "ls -l") {
      graph.router.dispatch({
        kind: "key",
        key: { name: ch, ctrl: false, meta: false, shift: false, sequence: ch },
      });
    }
    expect(graph.editor.text, "printables reach C17").toBe("ls -l");

    // C17 I5 — a paste is one edit and one undo unit, which is why the handler
    // takes the `paste` kind rather than a run of keys.
    graph.editor.clear();
    graph.router.dispatch({ kind: "paste", text: "a\nb\nc" });
    expect(graph.editor.text).toBe("a\nb\nc");
    graph.editor.undo();
    expect(graph.editor.text, "one undo unit, not three").toBe("");

    // C20 — history, and the overlay a reverse search raises.
    graph.history.append("git push", 0);
    graph.editor.clear();
    graph.router.dispatch(press({ name: "up" }));
    expect(graph.editor.text, "historyPrev").toBe("git push");

    graph.router.dispatch(press({ name: "r", ctrl: true }));
    expect(graph.overlays.top?.id, "reverseSearch raises C20's layer").toBe(SEARCH_ID);
    expect(graph.overlays.top?.id).not.toBe(MENU_ID);
  });

  it("T1.4h3a (C20 §7, F97): a search narrows as you type, and backspace widens it", async () => {
    // **The row F97 did not have.** `searchType` and `searchBackspace` were
    // declared, implemented and covered by `test/revert/history.test.ts` — which
    // calls the store *directly*, so it proved the machine worked and said
    // nothing about whether a keystroke reached it. Nothing did: the overlay
    // handler forwarded printable keys only for the completion menu, so `⌃r`
    // opened a search whose query could never become non-empty.
    //
    // **This dispatches a key rather than calling the store**, which is the
    // whole difference — a test that calls the mechanism verifies the mechanism
    // and never the wiring.
    const { graph } = await buildGraph();
    graph.history.append("git push origin", 0);
    graph.history.append("npm test", 0);

    graph.router.dispatch(press({ name: "r", ctrl: true }));
    expect(graph.overlays.top?.id).toBe(SEARCH_ID);
    expect(graph.history.searchState?.query, "opens empty").toBe("");

    graph.router.dispatch(press({ name: "p" }));
    graph.router.dispatch(press({ name: "u" }));
    expect(graph.history.searchState?.query, "the keystrokes reached C20").toBe("pu");
    expect(graph.history.searchState?.hit?.command, "and narrowed to the match").toContain(
      "git push",
    );

    graph.router.dispatch(press({ name: "backspace" }));
    expect(graph.history.searchState?.query, "backspace widens it").toBe("p");
  });

  it("T1.4h4 (C16 I21): each editing action's effect, not merely that C17 was called", async () => {
    // **T2.14 asks which method a binding reaches and this asks what it does.**
    // Rewiring `killWordLeft` to `killTo("wordRight")` passes T2.14 exactly —
    // the same method is called — so every motion's *direction* was untested
    // until this row. A mutation that fails nothing is a finding about the
    // tests, and this is the finding.
    const { graph } = await buildGraph();
    graph.lifecycle.acquire();
    const ed = graph.editor;

    const press = (name: string, mods: { ctrl?: boolean; meta?: boolean } = {}): void => {
      graph.router.dispatch({
        kind: "key",
        key: {
          name,
          ctrl: mods.ctrl ?? false,
          meta: mods.meta ?? false,
          shift: false,
          sequence: name,
        },
      });
    };

    ed.setText("git push origin", 15);
    press("backspace");
    expect(ed.text, "backspace removes behind the cursor").toBe("git push origi");

    ed.setText("git push origin", 3);
    press("delete");
    expect(ed.text, "delete removes in front of the cursor").toBe("gitpush origin");

    ed.setText("git push origin", 15);
    press("w", { ctrl: true });
    expect(ed.text, "⌃w kills the word to the left").toBe("git push ");
    expect(ed.killBuffer, "and it is in the kill buffer").toBe("origin");

    ed.setText("git push origin", 4);
    press("d", { meta: true });
    expect(ed.text, "⌥d kills the word to the right — the other direction").toBe("git  origin");

    ed.setText("git push origin", 9);
    press("u", { ctrl: true });
    expect(ed.text, "⌃u kills to the start").toBe("origin");

    ed.setText("git push origin", 4);
    press("k", { ctrl: true });
    expect(ed.text, "⌃k kills to the end").toBe("git ");

    press("y", { ctrl: true });
    expect(ed.text, "⌃y puts back what ⌃k took").toBe("git push origin");

    ed.setText("git push origin", 15);
    press("a", { ctrl: true });
    expect(ed.cursor, "⌃a to the line's start").toBe(0);
    press("e", { ctrl: true });
    expect(ed.cursor, "⌃e to its end").toBe(15);

    press("b", { meta: true });
    expect(ed.cursor, "⌥b one word left, not right").toBe(9);
    press("f", { meta: true });
    expect(ed.cursor, "⌥f back the other way").toBe(15);

    press("left");
    expect(ed.cursor, "← one character").toBe(14);
    press("left", { ctrl: true });
    expect(ed.cursor, "⌃← one word").toBe(9);
    press("right", { ctrl: true });
    expect(ed.cursor, "⌃→ the other way").toBe(15);

    press("home");
    expect(ed.cursor).toBe(0);
    press("end");
    expect(ed.cursor).toBe(15);

    // **Undo and redo are each other's inverse**, so a check that asks which
    // method was called cannot see them swapped — the same reading the
    // `killWordLeft`/`wordRight` mutation exposed. Only the text after each
    // says which way round they are.
    ed.setText("", 0);
    ed.insert("alpha");
    ed.insert(" beta");
    const typed = ed.text;
    press("z", { ctrl: true });
    expect(ed.text, "⌃z undoes, it does not redo").not.toBe(typed);
    const undone = ed.text;
    press("z", { meta: true });
    expect(ed.text, "⌥z puts it back").toBe(typed);
    expect(undone, "and the two are not the same state").not.toBe(typed);
  });

  it("T1.4h3 (C16 I17): Enter submits, and it is `enter` rather than `return`", async () => {
    // **The handler named a key the decoder does not produce**, so Enter did
    // not submit — C16 I17's rule ("a key the keymap can name must be a key the
    // decoder produces") arriving one file over, in a handler. Invisible
    // because no decoded event had ever reached the router.
    const submitted: string[] = [];
    const { graph } = await buildGraph({
      pipeline: () => ({
        submit: (line: string) => void submitted.push(line),
        seal: () => undefined,
        sealed: true,
        liveStreams: 0,
        faults: [],
        cancelNewestStream: () => false,
        inFlight: null,
        cancel: () => undefined,
        register: () => undefined,
        onAction: () => undefined,
        identityNotice: () => undefined,
        visibilityChanged: () => undefined,
      resized: () => undefined,
        producerContext: () => producerContext(),
    greeting: () => undefined,
    // **The reservation, and the stub must not answer for it** (C22 I99). A
    // fake returning an id would let a row assert an order this pipeline never
    // arranged; `null` is the seam's own degradation and `greeting` appends,
    // which is what these rows measured before I99 and still measure.
    reserveGreeting: () => null,
    abandonGreeting: () => undefined,
      dispose: () => undefined,
      }),
    });
    graph.lifecycle.acquire();

    graph.editor.setText("ps --mine");
    graph.router.dispatch(press({ name: "enter" }));

    expect(submitted, "the line reached C23").toEqual(["ps --mine"]);
  });
});

describe("C22 §3 step 12 — the read loop", () => {
  it("T1.4q (C22 I24): a byte reaches the router only once the terminal is acquired", async () => {
    const { graph, stdin } = await buildGraph();

    stdin.emit("a");
    expect(graph.editor.text, "nothing is listening before acquire()").toBe("");

    graph.lifecycle.acquire();
    stdin.emit("hi");
    expect(graph.editor.text, "stream → onInput → push → dispatch").toBe("hi");
  });

  it("T1.4i (C22 I27): one commit per decoded batch, and no handler commits", async () => {
    const { graph, stdin } = await buildGraph({}, { columns: 100, rows: 30 });
    graph.lifecycle.acquire();

    // A scroll: the handler moves C14 and the loop commits. Two committers is
    // the defect this rule closes, and it would show up here as two.
    const commit = vi.spyOn(graph.scheduler, "commit");
    stdin.emit("[5~");
    expect(commit.mock.calls, "a scroll is one commit").toEqual([["input"]]);

    // A bracketed paste of two hundred lines is one decoded event and therefore
    // one commit. Two hundred would each schedule, which is the reason the loop
    // batches rather than committing per event.
    commit.mockClear();
    const lines = Array.from({ length: 200 }, (_, i) => `line ${String(i)}`).join("\n");
    stdin.emit(`[200~${lines}[201~`);

    expect(commit.mock.calls, "two hundred lines are one commit").toEqual([["input"]]);
    // **Two hundred lines are one chip now** (roadmap 30), so the buffer holds a
    // single sentinel and the content is behind it. The claim this row makes is
    // *all of them arrived*, and `resolved` is where that is still true —
    // asserting `text` would now be asserting the chip threshold by accident.
    expect(graph.editor.text.length, "the buffer holds one grapheme").toBe(1);
    expect(graph.editor.resolved.split("\n"), "and all of them arrived").toHaveLength(200);
  });

  // ~~**T1.4h4**~~ — **struck with the document view** (C22 §13a, R-EXA-082, F1253). It
  // asserted that `viewPop` released the view's parts *before* dismissing it — the wiring
  // rather than the mechanism, which is a distinction worth keeping even though this
  // instance of it has gone. There is no pushed view to pop and no parts registered
  // against one; a run's parts are its entry's, and C13 evicts them with the entry.

  it("T1.14 (C22 I32): a lone Esc reaches the router without a second keystroke", async () => {
    // **The empty batch is the one that needs a wake.** `Esc` is held for
    // C16's 50 ms window and decodes to *nothing*, so the early return on an
    // empty batch sat above `arm()` and the deadline was never scheduled — the
    // key arrived when the next one did, which is the symptom the arming was
    // written to prevent. Every unit test of the decoder passed throughout: it
    // reports its deadline correctly and nobody polled it.
    const { graph, stdin, clock } = await buildGraph({}, { columns: 100, rows: 30 });
    graph.lifecycle.acquire();
    openOverlay(graph);

    stdin.emit("\u001b");
    expect(graph.overlays.top?.id, "nothing before the window closes").toBe("probe");

    // **A real wait, and 80 ms of one.** The harness injects a real `schedule`
    // and a fixed clock, so the wake is a real timer; the window is a constant
    // (C16 §2's 50 ms) rather than a race, which is what makes a bounded sleep
    // honest here. The assertion above is the control that keeps it so: a
    // decoder emitting `Esc` immediately would satisfy the arrival below and
    // break every arrow key.
    clock.advance(80);
    await new Promise((r) => setTimeout(r, 80));

    expect(graph.overlays.top, "the layer was dismissed with no second key").toBeNull();
  });

  it("T1.13 (C22 I31): a completion that settles after its batch commits a frame of its own", async () => {
    // **Asserted as a commit after the batch, not as a layer on the stack.**
    // The layer was always on the stack — that is precisely why every unit test
    // of C19, C15 and C16 passed while Tab did nothing at a real prompt. The
    // menu appeared on the next keystroke, fully formed, because that keystroke
    // brought the frame the continuation never asked for.
    const { graph, stdin } = await buildGraph({}, { columns: 100, rows: 30 });
    graph.lifecycle.acquire();

    const commit = vi.spyOn(graph.scheduler, "commit");
    // **Against the framework's own verbs**, because this harness's manifest
    // declares no tools — a probe asking for an app's flag would come back
    // empty, and an empty result about the *manifest* wears the shape of a
    // finding about the wiring. The empty path commits too, so the insertion
    // below is what keeps this from passing vacuously.
    stdin.emit("/hel");
    const duringBatch = commit.mock.calls.length;

    stdin.emit("\t");
    const afterTab = commit.mock.calls.length;
    expect(afterTab, "the keystroke's own commit").toBeGreaterThan(duringBatch);

    // The source settles on a microtask; nothing else happens in between, and
    // no further input arrives.
    await new Promise((r) => setTimeout(r, 0));

    expect(
      commit.mock.calls.slice(afterTab),
      "and the continuation commits its own, with no key pressed",
    ).toContainEqual(["completion"]);
    // **`/hel` is a unique match, so §5 rule 3 inserts it whole with its
    // delimiter** (C19 I16) — this row used to assert a menu here, because the
    // shell opened one in every case: `commonPrefix` was computed on every
    // request and read by nothing outside C19's own tests. The frame the
    // continuation commits is the claim; what it drew is now the completed
    // verb rather than a menu over a set of one.
    expect(graph.editor.text, "the unique match, inserted whole").toBe("/help ");
    expect(graph.overlays.top, "and no menu over a set of one").toBeNull();
  });
});

describe("C26 §8b.6/§8b.7 — focus is an address, through the key effects", () => {
  /**
   * Two blocks whose element ids collide, which is the state the defect needed.
   *
   * **The ids collide by construction rather than by choice**: `tableOf` numbers
   * its rows `r1..rn`, so any document holding two tables has them. A fixture
   * that invented distinct ids would agree with the defect and with the fix.
   */
  const collidingEffects = () => {
    const focus = createFocusStore();
    const fired: Action[] = [];
    const effects = createKeyEffects({
      editor: {},
      completion: {},
      overlays: {},
      history: { entries: [], append: () => undefined, next: () => null },
      visibilityChanged: () => undefined,
      resized: () => undefined,
      manifest: null,
      viewport: recordingViewport().viewport,
      anchor: () => ({ row: 10, rows: 1 }),
      overlayRegion: () => ({ width: 80, height: 24 }),
      redraw: () => undefined,
      focus,
      liveElements: () => [
        // **Both `r1`s carry an action, and they differ.** With only the second
        // one armed, *the focused element's action* and *the first action in the
        // list* are the same object and the assertion cannot tell them apart —
        // the mutation firing the first survived against exactly that fixture.
        { blockId: "a", element: navElement("r1", 0, { kind: "fill", label: "a/r1", command: "a/r1" }) },
        { blockId: "a", element: navElement("r2", 1) },
        { blockId: "b", element: navElement("r1", 2, { kind: "fill", label: "b/r1", command: "b/r1" }) },
        { blockId: "b", element: navElement("r2", 3) },
      ],
      liveEntryId: () => "e1",
      focusedEntryId: () => "e1",
      focusedElements: () => [
        { blockId: "a", element: navElement("r1", 0, { kind: "fill", label: "a/r1", command: "a/r1" }) },
        { blockId: "a", element: navElement("r2", 1) },
        { blockId: "b", element: navElement("r1", 2, { kind: "fill", label: "b/r1", command: "b/r1" }) },
        { blockId: "b", element: navElement("r2", 3) },
      ],
      neighbourEntry: () => null,
      cursorBlock: () => undefined,
      rerunEntry: () => undefined,
      onAction: (action: Action) => void fired.push(action),
      schedule: (fn: () => void) => {
        fn();
        return { [Symbol.dispose]: () => undefined };
      },
    } as unknown as Parameters<typeof createKeyEffects>[0]);
    return { effects, focus, fired };
  };

  it("T1.15 (C26 I10): ↓ walks past a colliding id instead of restarting at it", () => {
    const { effects, focus } = collidingEffects();

    // Down from the prompt enters at the first element, then walks.
    effects.table["historyNext"]?.();
    effects.table["rowDown"]?.();
    effects.table["rowDown"]?.();
    expect(focus.current, "the third element, in the second block").toEqual({
      at: "liveBlock",
      entryId: "e1",
      element: { blockId: "b", elementId: "r1" },
      anchor: null,
      mode: "navigate",
    });

    // **The step the flat namespace could not take.** `rows.indexOf("r1")`
    // answered 0 here — the *first* block's `r1` — so the next `↓` went back to
    // the second element and the reader could never reach the second table.
    effects.table["rowDown"]?.();
    expect(focus.current, "forward, not back to the first block").toEqual({
      at: "liveBlock",
      entryId: "e1",
      element: { blockId: "b", elementId: "r2" },
      anchor: null,
      mode: "navigate",
    });
  });

  it("T1.16 (C26 I10): ⏎ fires the focused element's action, not the first id match", () => {
    const { effects, focus, fired } = collidingEffects();
    focus.enterLiveBlock("e1", { blockId: "b", elementId: "r1" });

    effects.table["rowActivate"]?.();
    expect(fired, "the second block's action, which is the focused one").toEqual([
      { kind: "fill", label: "b/r1", command: "b/r1" },
    ]);
  });

  it("T1.17 (C26 I10): ↑ leaves only from a real first element, never from a stale one", () => {
    // The two dispositions that used to differ: `indexOf` answered −1 both for
    // "the first row" and for "a row the block no longer has", so `↑` left to
    // the prompt in a case where `↓` restarted at the top. Resolution falls
    // forward before the edge is tested, so the two agree.
    const { effects, focus } = collidingEffects();

    focus.enterLiveBlock("e1", { blockId: "b", elementId: "gone" });
    effects.table["rowUp"]?.();
    expect(focus.current, "fell forward into block b, then stepped up").toEqual({
      at: "liveBlock",
      entryId: "e1",
      element: { blockId: "a", elementId: "r2" },
      anchor: null,
      mode: "navigate",
    });

    focus.enterLiveBlock("e1", { blockId: "a", elementId: "r1" });
    effects.table["rowUp"]?.();
    expect(focus.current, "and a real first element does leave").toEqual({ at: "prompt" });
  });

  it("T1.18 (C26 I19, §4c): the ends belong to the entry's sequence, not to a block", () => {
    // **The row the boundary never had, and its absence is why the asymmetry
    // read as `table`'s.** The fixture holds two blocks deliberately: with one,
    // the entry's ends and the block's ends are the same cells and every reading
    // of *what `↓` does at the edge* agrees.
    const { effects, focus } = collidingEffects();

    // The head. `↑` at the entry's first element leaves to its neighbouring
    // scope — the prompt is what is beyond that end.
    focus.enterLiveBlock("e1", { blockId: "a", elementId: "r1" });
    effects.table["rowUp"]?.();
    expect(focus.current, "the head has a neighbour").toEqual({ at: "prompt" });

    // The tail. Nothing is beyond it, so `↓` stops — and this is a *stop*
    // rather than a trap, because `Esc` is bound at this target.
    focus.enterLiveBlock("e1", { blockId: "b", elementId: "r2" });
    effects.table["rowDown"]?.();
    expect(focus.current, "the tail has none, so focus does not move").toEqual({
      at: "liveBlock",
      entryId: "e1",
      element: { blockId: "b", elementId: "r2" },
      anchor: null,
      mode: "navigate",
    });

    // **And the seam between the two blocks is not an end at all** — the half
    // T1.15 carries from the other direction. Asserted here too, because the
    // ruling is about which cells are ends and a row about the ends that never
    // looks at a non-end passes for an implementation where every block edge is
    // one.
    focus.enterLiveBlock("e1", { blockId: "a", elementId: "r2" });
    effects.table["rowDown"]?.();
    expect(focus.current, "steps into the next block").toMatchObject({
      element: { blockId: "b", elementId: "r1" },
    });
  });
});

describe("C26 §5c — the transcript's selection and semantic copy", () => {
  /** A live block whose elements carry source text no rendering would produce. */
  const copyEffects = () => {
    const focus = createFocusStore();
    const kill: string[] = [];
    const effects = createKeyEffects({
      editor: { copyText: (t: string) => void kill.push(t) },
      completion: {},
      overlays: {},
      history: { entries: [], append: () => undefined, next: () => null },
      visibilityChanged: () => undefined,
      resized: () => undefined,
      manifest: null,
      viewport: recordingViewport().viewport,
      anchor: () => ({ row: 10, rows: 1 }),
      overlayRegion: () => ({ width: 80, height: 24 }),
      redraw: () => undefined,
      focus,
      liveElements: () => [
        { blockId: "a", element: navElement("r1", 0, undefined, "web\t3\trunning") },
        { blockId: "a", element: navElement("r2", 1, undefined, "api\t1\tstopped") },
        { blockId: "a", element: navElement("r3", 2, undefined, "db\t2\trunning") },
      ],
      liveEntryId: () => "e1",
      focusedEntryId: () => "e1",
      focusedElements: () => [
        { blockId: "a", element: navElement("r1", 0, undefined, "web\t3\trunning") },
        { blockId: "a", element: navElement("r2", 1, undefined, "api\t1\tstopped") },
        { blockId: "a", element: navElement("r3", 2, undefined, "db\t2\trunning") },
      ],
      neighbourEntry: () => null,
      cursorBlock: () => undefined,
      rerunEntry: () => undefined,
      onAction: () => undefined,
      schedule: (fn: () => void) => {
        fn();
        return { [Symbol.dispose]: () => undefined };
      },
    } as unknown as Parameters<typeof createKeyEffects>[0]);
    return { effects, focus, kill };
  };

  it("T1.42 (§5c): y copies the element's source, into the one clipboard", () => {
    const { effects, kill } = copyEffects();

    effects.table["historyNext"]?.(); // ↓ from the prompt, onto the first row
    effects.table["copyElement"]?.();

    expect(kill, "the declared source, through the editor's clipboard").toEqual([
      "web\t3\trunning",
    ]);
  });

  it("T1.43 (C26 §5c, C17 I21): ⇧↓ extends and y copies the range, newline-joined", () => {
    const { effects, focus, kill } = copyEffects();

    effects.table["historyNext"]?.();
    effects.table["extendRowDown"]?.();
    effects.table["extendRowDown"]?.();

    // **The anchor has not moved**, which is C17 T1.23's assertion one level
    // up and the defect the shape was built against: an extension that moved
    // the anchor is right on the first keystroke and wrong on the second.
    expect(focus.current).toEqual({
      at: "liveBlock",
      entryId: "e1",
      element: { blockId: "a", elementId: "r3" },
      anchor: { blockId: "a", elementId: "r1" },
      mode: "navigate",
    });

    effects.table["copyElement"]?.();
    expect(kill).toEqual(["web\t3\trunning\napi\t1\tstopped\ndb\t2\trunning"]);
  });

  it("T1.44 (§5c): an unshifted motion collapses the range", () => {
    const { effects, focus, kill } = copyEffects();

    effects.table["historyNext"]?.();
    effects.table["extendRowDown"]?.();
    effects.table["rowDown"]?.();

    expect(focus.current, "the anchor is gone").toEqual({
      at: "liveBlock",
      entryId: "e1",
      element: { blockId: "a", elementId: "r3" },
      anchor: null,
      mode: "navigate",
    });

    effects.table["copyElement"]?.();
    expect(kill, "one row, not three").toEqual(["db\t2\trunning"]);
  });

  it("T1.45 (§5c): ⇧↑ stops at the first element rather than leaving the block", () => {
    // **Unshifted `↑` exits to the prompt** (C26 I13, the reader stepping out).
    // Extending is a gesture *inside* the block, and one that walked out would
    // take the selection with it and leave nothing to copy.
    const { effects, focus } = copyEffects();

    effects.table["historyNext"]?.();
    effects.table["extendRowUp"]?.();

    expect(focus.current.at, "still in the block").toBe("liveBlock");
  });
});

// **T1.3v is struck with the target and its nine actions** (R-EXA-082, F1254).
//
// It was C16 I33's measured instance: `tab` is one binding at `pushedView` and
// a different one at `liveBlock`, and the section gesture reaches whichever
// owner is up. There were three owners — the patch view, the document view and
// the profiler's deck — and the row's whole value was that a shared target with
// several owners is where a *silence* is indistinguishable from a refusal. All
// three are gone: a run's detail expands in place, a verb's result is an entry,
// and the profiler's deck is an entry.
//
// **I33 is amended rather than retired** (C16 I33): its live subject is
// `panel`, whose owners are a completion menu, a reverse search and a command
// palette, and the rule is the same one — an owner that cannot answer says so
// rather than doing nothing. The row that would assert it is M15's, where the
// second panel owner lands; there is one today, so writing it now would be a
// row about a union with one member.

describe("C26 §5c — the call's head under ⏎ and y, owed at the spec commit", () => {
  it.todo(
    "T1.47 (C26 I23, §5c h1–h4): ⏎ on a running card's head toggles the body scroll's collapsed and submits nothing, twice; y on the head yields the command and ⌃a y yields the command then the body's sources; ⇧⏎ is refused while running and re-runs once settled — not deferred on a component: the head element lands with C2–C4 of the call grammar",
  );
});

describe("C22 §6 — a keystroke cancels a pending completion (I39)", () => {
  it("T1.13c (C22 I39): typing after Tab cancels the request rather than letting it land", async () => {
    // **C19 held the whole mechanism and nothing in `src/shell` was the
    // caller.** `cancel()` invalidates the token and a superseded request
    // already resolves with no candidates (C19 I13) — so typing after a `Tab`
    // on a slow source left the request live, and a menu opened a second and a
    // half later for a prefix the user had moved past.
    //
    // Not covered by the effect table's `mine !== seq` guard, which is why that
    // guard looked like the mechanism: it compares the shell's *own* sequence,
    // and a printable keystroke does not advance it.
    const { graph, stdin } = await buildGraph({}, { columns: 100, rows: 30 });
    graph.lifecycle.acquire();

    const cancel = vi.spyOn(graph.completion, "cancel");

    stdin.emit("/hel");
    const afterTyping = cancel.mock.calls.length;
    expect(afterTyping, "every printable keystroke supersedes").toBeGreaterThan(0);

    stdin.emit("\t");
    const afterTab = cancel.mock.calls.length;

    // The keystroke *after* the request is the case the invariant is about.
    stdin.emit("p");
    expect(
      cancel.mock.calls.length,
      "a keystroke during a pending request cancels it",
    ).toBeGreaterThan(afterTab);
  });

  it("T1.13d (C22 I39): a paste cancels too — the printable path is not the only caller", async () => {
    // Both call sites, because one of them is enough to make the row pass and
    // a paste is the one that arrives as a block of text rather than a key.
    const { graph, stdin } = await buildGraph({}, { columns: 100, rows: 30 });
    graph.lifecycle.acquire();

    stdin.emit("\t");
    const cancel = vi.spyOn(graph.completion, "cancel");
    stdin.emit("\u001b[200~pasted\u001b[201~");

    expect(cancel, "a paste supersedes a pending request as a keystroke does").toHaveBeenCalled();
  });
});

/**
 * C26 I26, I27 — the way in, the way out, and the arrows inside (§102, §018).
 */
describe("the inside (C26 I26, I27, §102)", () => {
  const insideEffects = () => {
    const focus = createFocusStore();
    const fired: Action[] = [];
    const moves: string[] = [];
    const withView = (id: string, row: number): NavElement =>
      Object.freeze({ ...navElement(id, row), viewState: true });
    const elements = [
      // **A plain element beside the one with an inside**, so *enters* and
      // *enters on everything* are separable: with only the plot in the list,
      // a build that ignored the declaration would pass every row here.
      { blockId: "a", element: navElement("row", 0, { kind: "fill", label: "a", command: "a" }) },
      { blockId: "p", element: withView("plot", 1) },
    ];
    const effects = createKeyEffects({
      editor: {},
      completion: {},
      overlays: {},
      history: { entries: [], append: () => undefined, next: () => null },
      visibilityChanged: () => undefined,
      resized: () => undefined,
      manifest: null,
      viewport: recordingViewport().viewport,
      anchor: () => ({ row: 10, rows: 1 }),
      overlayRegion: () => ({ width: 80, height: 24 }),
      redraw: () => undefined,
      focus,
      liveElements: () => elements,
      liveEntryId: () => "e1",
      focusedEntryId: () => "e1",
      focusedElements: () => elements,
      neighbourEntry: () => null,
      orbitBlock: (d: number) => void moves.push(`orbit${String(d)}`),
      tiltBlock: (d: number) => void moves.push(`tilt${String(d)}`),
      cursorBlock: (d: number) => void moves.push(`cursor${String(d)}`),
      rerunEntry: () => undefined,
      onAction: (action: Action) => void fired.push(action),
      schedule: (fn: () => void) => {
        fn();
        return { [Symbol.dispose]: () => undefined };
      },
    } as unknown as Parameters<typeof createKeyEffects>[0]);
    return { effects, focus, fired, moves };
  };

  it("T1.160 (C26 I26, §102): ⏎ on an element declaring view state enters, and esc leaves", () => {
    const { effects, focus, fired } = insideEffects();
    focus.enterLiveBlock("e1", { blockId: "p", elementId: "plot" });

    effects.table["rowActivate"]?.();
    expect(focus.current, "the way IN — ⏎ enter (§102)").toMatchObject({ mode: "interact" });
    expect(fired, "entering is not an action; nothing fired").toEqual([]);

    effects.table["exitInside"]?.();
    expect(focus.current, "esc out (§102)").toMatchObject({ mode: "navigate" });
  });

  it("T1.161 (C26 I26): ⏎ on an element that declares none dispatches its activate instead", () => {
    // **The control, and the whole of §018's *arrowing down a document past
    // three sliders*** read from the entry side: without it the row above
    // passes against a build that enters on every element, which would put an
    // ordinary table row into a mode with no way to act.
    const { effects, focus, fired } = insideEffects();
    focus.enterLiveBlock("e1", { blockId: "a", elementId: "row" });

    effects.table["rowActivate"]?.();
    expect(focus.current, "no inside declared, so no mode change").toMatchObject({ mode: "navigate" });
    expect(fired, "the element's own action").toEqual([{ kind: "fill", label: "a", command: "a" }]);
  });

  it("T2.172 (C26 I27, C16 I28, §102): the inside's arrows drive what the element declared", () => {
    const { effects, moves } = insideEffects();

    // §102's control row: `←→ orbit   ↑↓ tilt`. The horizontal arrow reaches
    // both writers and each resolves the focused block itself — a kind has a
    // camera **or** a cursor, never both, which is what makes one action total.
    effects.table["insideLeft"]?.();
    expect(moves).toEqual(["orbit-1", "cursor-1"]);

    moves.length = 0; // cells-ok — a recorded-call count, not a width
    effects.table["insideRight"]?.();
    expect(moves).toEqual(["orbit1", "cursor1"]);

    // **The vertical arm is what says the resolution is by declaration and not
    // by key**: a crosshair runs along one axis, so `↑`/`↓` reach the camera
    // alone. A build that routed all four arrows to both writers passes the two
    // rows above and fails here.
    moves.length = 0; // cells-ok — a recorded-call count, not a width
    effects.table["insideUp"]?.();
    effects.table["insideDown"]?.();
    expect(moves).toEqual(["tilt1", "tilt-1"]);
  });
});
