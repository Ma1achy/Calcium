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
      const consumed = graph.router.dispatch(press(b.key));
      expect(consumed, `${b.target}:${b.key.name} -> ${b.action} reached no handler`).toBe(true);
      if (b.target === "overlay") graph.overlays.dismiss("probe");
      graph.editor.clear();
    }
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
});
