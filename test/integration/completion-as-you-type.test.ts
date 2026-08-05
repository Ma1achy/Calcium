// C19 §6a — the menu that opens without `Tab`, and C22 I51's route to it.
//
// **Driven as bytes through the decoder, never as calls on the effects.** The
// mechanism under test is a precedence between two router targets: with a layer
// on the stack `activeTarget` answers `overlay`, and a row calling
// `keys.afterEdit()` directly would pass on the day nothing dispatched to it —
// which is the state the shell was in before this file existed, measured rather
// than supposed.
import { describe, expect, it } from "vitest";

import { MENU_ID } from "../../src/interaction/completion/index.js";
import { buildGraph } from "../support/session.js";
import type { CompletionSource } from "../../src/interaction/completion/index.js";
import type { Graph } from "../../src/shell/construct.js";

/** One byte at a time: a run arriving together is a paste (C16 §7). */
function type(stdin: { emit(s: string): void }, text: string): void {
  for (const ch of text) stdin.emit(ch);
}

const menuRows = (graph: Graph): readonly string[] => {
  const layer = graph.overlays.top;
  if (layer === null || layer.id !== MENU_ID) return [];
  const table = layer.content.find((b) => b.kind === "table");
  if (table === undefined || table.kind !== "table") return [];
  return table.rows.map((r) => String(r.cells["value"]?.text ?? ""));
};

describe("C19 §6a — the menu opens as you type", () => {
  it("T3.20 (C19 I19): two static candidates open it, one closes it and the ghost carries it", async () => {
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();

    // `/h` is `help` and `history`; `/he` is `help` alone. **The one-candidate
    // case is the control, not a courtesy** — a threshold of one draws the same
    // word twice, on the prompt and under it, and passes any row that asks only
    // whether the menu appeared.
    type(stdin, "/h");
    expect(
      graph.overlays.top?.id,
      "two candidates, and no Tab was pressed",
    ).toBe(MENU_ID);
    expect(menuRows(graph)).toEqual(["/help", "/history"]);

    type(stdin, "e");
    expect(graph.overlays.top, "one candidate is ghost text's case").toBeNull();
    expect(graph.editor.text, "and the buffer has only what was typed").toBe(
      "/he",
    );
  });

  it("T3.21 (C19 I22): backspace widens a typed menu rather than dismissing it", async () => {
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();

    type(stdin, "/hi");
    expect(graph.overlays.top, "one candidate: no menu").toBeNull();

    stdin.emit("\u007f");
    // **The opposite answer to T3.12b, on the same key.** A requested menu is
    // dismissed by a keystroke that does not extend the prefix, because
    // widening it would mean running a dynamic source on a keystroke (C19 I3). A
    // typed menu costs a filter over an array, so it comes back.
    expect(graph.editor.text).toBe("/h");
    expect(menuRows(graph), "widened, not dismissed").toEqual([
      "/help",
      "/history",
    ]);
  });

  it("T2.1a (C19 I3): a keystroke runs no dynamic source", async () => {
    // **The boundary, asserted rather than assumed.** The obvious
    // implementation of §6a calls the engine's request path on every keystroke,
    // which runs the dynamic sources (C19 I3) — and every assertion about the candidate
    // set agrees with both. This one does not: the source throws if it is ever
    // reached, so a keystroke that consults it fails here and nowhere else.
    let calls = 0;
    const tripwire: CompletionSource = {
      id: "tripwire",
      slots: [
        "verb",
        "flagName",
        "flagValue",
        "positional",
        "path",
        "executable",
        "none",
      ],
      dynamic: true,
      complete: () => {
        calls += 1;
        throw new Error("a dynamic source ran on a keystroke");
      },
    };

    const { graph, stdin } = await buildGraph({
      completionSources: [tripwire],
    });
    graph.lifecycle.acquire();

    type(stdin, "/h");
    expect(calls, "no keystroke reaches a dynamic source").toBe(0);
    expect(graph.overlays.top?.id, "and the static menu opened anyway").toBe(
      MENU_ID,
    );

    // The fixture responds to the thing under test: `Tab` does reach it, so a
    // zero above is a fact about the keystroke path rather than about the
    // source never being registered at all.
    stdin.emit("\t");
    await new Promise((r) => setTimeout(r, 0));
    expect(calls, "Tab still runs it — the control").toBe(1);
  });

  it("T3.22 (C19 I21): Tab over a typed menu runs the dynamic sources and updates the layer", async () => {
    // **Two things that both look like they happen anyway.** The keymap binds
    // `overlay`/`tab` to `menuNext`, so the implementation that does nothing
    // about this moves a highlight and never reaches a source again — the app's
    // own candidates unreachable the day the menu learns to open itself. And
    // `complete` finding the menu already up must `update` it: C15 throws on a
    // duplicate id, inside a promise continuation, where the failure is an
    // unhandled rejection rather than a red row.
    let calls = 0;
    const { graph, stdin } = await buildGraph({
      completionSources: [
        {
          id: "spy",
          slots: ["verb"],
          dynamic: true,
          complete: () => {
            calls += 1;
            return [];
          },
        },
      ],
    });
    graph.lifecycle.acquire();

    type(stdin, "/h");
    expect(calls, "the typed menu opened without it").toBe(0);

    const pushes: string[] = [];
    graph.overlays.subscribe(
      (c) => void (c.kind === "push" && pushes.push(c.id)),
    );

    stdin.emit("\t");
    await new Promise((r) => setTimeout(r, 0));

    expect(calls, "Tab still means Tab").toBe(1);
    expect(pushes, "updated in place, never pushed a second time").toEqual([]);
    expect(menuRows(graph), "and the same set is still up").toEqual([
      "/help",
      "/history",
    ]);

    // **The recorder is shown to record.** An empty array is what a
    // subscription that never fires produces too, and the two are
    // indistinguishable without this: dismissing and typing again is a push,
    // and it has to arrive here or the assertion above proves nothing.
    graph.overlays.dismiss(MENU_ID);
    type(stdin, "x");
    type(stdin, "\u007f");
    expect(pushes, "the fixture responds to a real push").toEqual([MENU_ID]);
  });

  it("T3.23, T3.24 (C19 I19): Esc holds for the token, and Tab asks again", async () => {
    const { graph, stdin, clock } = await buildGraph();
    graph.lifecycle.acquire();

    type(stdin, "/h");
    expect(graph.overlays.top?.id).toBe(MENU_ID);

    // **The window has to elapse, and typing through it is a different key.**
    // C16 holds a lone `Esc` for 50 ms (§2) because `Esc` then `i` is `Alt-i`,
    // so a row that types straight through the window never sends `Esc` at all
    // — and it fails looking exactly like a suppression that did not work.
    stdin.emit("\u001b");
    clock.advance(80);
    await new Promise((r) => setTimeout(r, 80));
    expect(graph.overlays.top, "Esc dismissed it").toBeNull();

    type(stdin, "i");
    expect(
      graph.overlays.top,
      "dismissed, and the next character does not undo it",
    ).toBeNull();
    expect(graph.editor.text).toBe("/hi");

    stdin.emit("\t");
    await new Promise((r) => setTimeout(r, 0));
    expect(
      graph.editor.text,
      "an explicit request is the user asking again",
    ).toBe("/history ");
  });
});

describe("C22 I51 — a menu that opens by itself does not stop typing", () => {
  it("T4.7b: a printable key reaches C17 with the menu open, and Enter submits", async () => {
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();

    type(stdin, "/h");
    expect(graph.overlays.top?.id, "the layer that takes the keys").toBe(
      MENU_ID,
    );
    expect(graph.router.target, "and C16 routes to it, correctly").toBe(
      "overlay",
    );

    // **The defect this row exists for is a dropped character**, so the control
    // is the same key with nothing open: without it, an assertion that the
    // buffer changed is satisfied by a shell where the menu never opened.
    type(stdin, "i");
    expect(graph.editor.text, "typed through the layer above it").toBe("/hi");

    type(stdin, "s");
    expect(graph.editor.text).toBe("/his");

    stdin.emit("\r");
    // Enter belongs to the prompt while the menu holds no selection (C19 I20).
    // With the menu answering it, this would accept a candidate instead.
    expect(graph.editor.text, "the line was submitted, not completed").toBe("");
  });

  it("T4.7b (control): the same key with no layer open", async () => {
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();

    type(stdin, "x");
    expect(graph.overlays.top, "nothing static matches, so no menu").toBeNull();
    expect(graph.editor.text, "and the character lands").toBe("x");
  });
});
