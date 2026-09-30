// C15 I32 — a panel a question closes is `displaced`, and its owner brings it
// back (review batch 3, M8 item 7).
//
// **Driven as bytes, and answered as a reader answers.** The owner here is
// `keys.ts`, which learns of the displacement from C15's change stream and of
// the resolution the same way; a row calling its effects directly would pass on
// the day the subscription was never registered.
import { describe, expect, it } from "vitest";

import { MENU_ID } from "../../src/interaction/completion/index.js";
import { SEARCH_ID } from "../../src/interaction/history/index.js";
import { buildGraph } from "../support/session.js";
import type { Graph } from "../../src/shell/construct.js";

const YES_NO = [
  { key: "y", label: "yes" },
  { key: "n", label: "no", default: true as const },
];

/** One byte at a time: a run arriving together is a paste (C16 §7). */
function type(stdin: { emit(s: string): void }, text: string): void {
  for (const ch of text) stdin.emit(ch);
}

const menuRows = (graph: Graph): readonly string[] => {
  const layer = graph.overlays.stack.find((l) => l.id === MENU_ID);
  if (layer === undefined) return [];
  const table = layer.content.find((b) => b.kind === "table");
  if (table === undefined || table.kind !== "table") return [];
  return table.rows.map((r) => String(r.cells["value"]?.text ?? ""));
};

/**
 * Ask, and answer `y` as a reader would.
 *
 * `→` first: it is neutral at a choice question — it moves the selection and
 * answers nothing — so it ends C16 I44's arrival guard whichever form of it is
 * built, and `y` is then an answer rather than a refused activation. The row is
 * about what the answer leaves behind, not about the guard.
 */
async function askAndAnswer(graph: Graph, stdin: { emit(s: string): void }, between?: () => void): Promise<void> {
  const answer = graph.confirm.ask({ question: "stop it?", choices: YES_NO });
  await new Promise((r) => setTimeout(r, 0));
  const closed = (): boolean => !graph.overlays.stack.some((l) => l.id === MENU_ID || l.id === SEARCH_ID);
  expect(graph.overlays.top?.id, "the question is up").not.toBe(MENU_ID);
  expect(closed(), "and it closed the panel").toBe(true);
  between?.();
  expect(closed(), "and nothing brought it back while the question is up").toBe(true);
  stdin.emit("\u001b[C");
  stdin.emit("y");
  await expect(answer).resolves.toEqual({ key: "y" });
}

describe("C15 I32 — a displaced panel is held and restored", () => {
  it("T4.14 (C15 I32): a typed menu and a requested one with a row selected are displaced by a question and restored by its answer; a changed draft is the control", async () => {
    // D1–D2: a typed menu, holding no selection.
    {
      const { graph, stdin } = await buildGraph();
      graph.lifecycle.acquire();
      type(stdin, "/h");
      expect(menuRows(graph), "two candidates open it").toEqual(["/help", "/history"]);

      // **Another owner's removal while the question is up is not the
      // resolution.** An advisory layer comes and goes under its own owner —
      // any removal reaches the subscription — and the menu must wait for the
      // blocking layer, or it is drawn under a question that still owns input.
      await askAndAnswer(graph, stdin, () => {
        using _advisory = graph.overlays.push({
          id: "advisory",
          kind: "overlay",
          placement: { kind: "anchored", row: 2, prefer: "below" },
          content: [],
          blocking: false,
          dismissal: "escape",
        });
      });
      expect(graph.overlays.top?.id, "restored on the answer's dispatch").toBe(MENU_ID);
      expect(menuRows(graph)).toEqual(["/help", "/history"]);
      expect(graph.editor.text, "the draft is the reader's").toBe("/h");
    }

    // D3: a requested menu with the second row selected.
    {
      const { graph, stdin } = await buildGraph();
      graph.lifecycle.acquire();
      type(stdin, "/h");
      stdin.emit("\t");
      await new Promise((r) => setTimeout(r, 0));
      stdin.emit("\u001b[B");
      expect(menuRows(graph)).toEqual(["/help", "/history"]);

      await askAndAnswer(graph, stdin);
      expect(graph.overlays.top?.id).toBe(MENU_ID);
      // **The selection is asserted by what `⏎` does with it**: a menu holding
      // none lets the prompt answer `⏎` and submits `/h`, and one holding row 0
      // accepts `/help`. Only the held selection accepts `/history`.
      stdin.emit("\r");
      expect(graph.editor.text.trim(), "the selection came back with it").toBe("/history");
    }

    // D5, the control: the draft changed under the question.
    {
      const { graph, stdin } = await buildGraph();
      graph.lifecycle.acquire();
      type(stdin, "/h");
      expect(graph.overlays.top?.id).toBe(MENU_ID);

      // Keys go to the question, so no reader reaches this — the row writes the
      // draft directly, as a stand-in for any writer.
      await askAndAnswer(graph, stdin, () => graph.editor.setText("/"));
      expect(graph.overlays.top, "a list built for another line is not shown").toBeNull();
      type(stdin, "q");
      expect(graph.editor.text).toBe("/q");
      expect(menuRows(graph), "and the next keystroke builds from the new line").not.toContain("/history");
    }
  });

  it("T4.15 (C15 I32): the reverse search is restored from C20's state, and the chip preview needs no holding", async () => {
    // D7: C20 holds the query; the owner holds only that it was displaced.
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();
    stdin.emit("\u0012");
    type(stdin, "zz");
    expect(graph.overlays.top?.id, "⌃r raised the search").toBe(SEARCH_ID);
    const query = graph.history.searchState;
    expect(query, "and C20 holds what was typed").not.toBeNull();

    await askAndAnswer(graph, stdin);
    expect(graph.overlays.top?.id, "restored").toBe(SEARCH_ID);
    expect(graph.history.searchState, "with C20's own state, untouched").toEqual(query);

    // D8, the control: the chip preview is a projection of the caret and holds
    // nothing, so it is back on the answer's batch with no help from the owner.
    const second = await buildGraph();
    second.graph.lifecycle.acquire();
    const lines = Array.from({ length: 6 }, (_, i) => `alpha ${String(i)}`).join("\n");
    second.stdin.emit(`\u001b[200~${lines}\u001b[201~`);
    expect(second.graph.overlays.top?.id, "a chip under the caret previews").toBe("chip-preview");
    await askAndAnswer(second.graph, second.stdin);
    expect(second.graph.overlays.top?.id, "back on the answer's batch").toBe("chip-preview");
  });
});
