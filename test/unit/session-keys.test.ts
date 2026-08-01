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
import { buildGraph } from "../support/session.js";
import { createKeyEffects } from "../../src/shell/keys.js";
import { createFocusStore } from "../../src/interaction/router/focus.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";
import type { Graph } from "../../src/shell/construct.js";

const key = (k: { name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): Key => ({
  name: k.name,
  ctrl: k.ctrl ?? false,
  meta: k.meta ?? false,
  shift: k.shift ?? false,
  sequence: k.name,
});

const press = (k: Parameters<typeof key>[0]): InputEvent => ({ kind: "key", key: key(k) });

/** A dismissable layer, so `activeTarget` resolves to `overlay` (C16 §3). */
function openOverlay(graph: Graph): void {
  graph.overlays.push({
    id: "probe",
    kind: "overlay",
    placement: { kind: "centred" },
    content: [],
    dismissable: true,
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

describe("C22 §3 step 11 — the effect table", () => {
  it("T1.4h (C22 I26): every binding in the table is consumed at its target", async () => {
    // **Derived from `defaultKeymap`, never listed here.** A hand-written list
    // is the shape that let fourteen bindings go unexecuted while every test
    // passed: the list agrees with itself, and the table it was copied from is
    // free to grow a row nobody dispatches. `/help` renders that row.
    const { graph } = await buildGraph();
    graph.lifecycle.acquire();

    expect(defaultKeymap.length, "the table is not empty, so this is not vacuous").toBeGreaterThan(0);

    for (const b of defaultKeymap) {
      if (b.target === "overlay") openOverlay(graph);
      // `liveBlock` needs both halves of what `activeTarget` reads: a live
      // entry in C13 and focus stored there (C16 §3).
      if (b.target === "liveBlock") enterLive(graph);
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
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          called.add(String(prop));
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    }) as typeof real;

    const effects = createKeyEffects({
      editor: spy,
      completion: graph.completion,
      overlays: graph.overlays,
      history: graph.history,
      manifest: null,
      anchor: () => ({ row: 10, rows: 1 }),
      overlayRegion: () => ({ width: 80, height: 24 }),
      redraw: () => undefined,
      focus: createFocusStore(),
      liveRows: () => ["row-0", "row-1"],
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

  it("T1.4l (C09 I13): a constructed graph can render all seventeen kinds", async () => {
    // **`table`, `plot` and `patch` register through the public mechanism, and
    // nobody called it.** `defaults: true` ships C09's fourteen; the other
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
    expect(graph.blocks.kinds.length, "and C09's fourteen are still there").toBe(17);
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
        inFlight: null,
        cancel: () => undefined,
        register: () => undefined,
        onAction: () => undefined,
        identityNotice: () => undefined,
      }),
    });
    graph.lifecycle.acquire();

    graph.editor.setText("ps --mine");
    graph.router.dispatch(press({ name: "enter" }));

    expect(submitted, "the line reached C23").toEqual(["ps --mine"]);
  });
});

describe("C22 §3 step 12 — the read loop", () => {
  it("T1.4f (C22 I24): a byte reaches the router only once the terminal is acquired", async () => {
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
    expect(graph.editor.text.split("\n"), "and all of them arrived").toHaveLength(200);
  });

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
    // finding about the wiring. The empty path commits too, so the menu below
    // is what keeps this from passing vacuously.
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
    expect(graph.overlays.top?.id, "the menu it drew").toBe(MENU_ID);
  });
});
