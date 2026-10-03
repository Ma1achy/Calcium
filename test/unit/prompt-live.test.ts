// C22 I145 — the prompt stays live under a layer that says so (ruling 23,
// §6l.9b, C15 I34).
//
// **Driven as bytes through the decoder.** `promptUnderMenu` is read by the
// router's precedence, so a row calling it after setting a field by hand would
// pass on the day nothing updated the field — which is T6.146's mutation.
import { describe, expect, it } from "vitest";

import { MENU_ID } from "../../src/interaction/completion/index.js";
import { SEARCH_ID } from "../../src/interaction/history/index.js";
import { buildGraph } from "../support/session.js";

const ESC = String.fromCharCode(27);

/** One byte at a time: a run arriving together is a paste (C16 §7). */
function type(stdin: { emit(s: string): void }, text: string): void {
  for (const ch of text) stdin.emit(ch);
}

describe("C22 I145 — promptUnderMenu reads promptLive", () => {
  it("T1.177 (C22 I145, C15 I34): a menu with no selection is live and takes a letter into the editor; Tab makes it not live on the same layer; a chip preview is live; a reverse search is not", async () => {
    const fresh = async () => {
      const built = await buildGraph();
      built.graph.lifecycle.acquire();
      return built;
    };

    // `/h` is `help` and `history`, so a menu opens with nothing selected.
    const menu = await fresh();
    type(menu.stdin, "/h");
    expect(menu.graph.overlays.top?.id).toBe(MENU_ID);
    expect(menu.graph.overlays.top?.promptLive, "no selection: a display").toBe(true);
    expect(menu.graph.promptUnderMenu()).toBe(true);

    // `Tab` selects (a display leaves `↓` to history, C19 I20), and the field
    // moves on the same layer before the next key.
    const layer = menu.graph.overlays.top;
    menu.stdin.emit("\t");
    await new Promise((r) => setTimeout(r, 0));
    expect(menu.graph.overlays.top?.id, "the same layer").toBe(MENU_ID);
    expect(menu.graph.overlays.top?.content, "and the selection redrew it").not.toBe(layer?.content);
    expect(menu.graph.overlays.top?.promptLive, "a choice being made").toBe(false);
    expect(menu.graph.promptUnderMenu()).toBe(false);

    // A live menu hands a letter to the editor.
    const letter = await fresh();
    type(letter.stdin, "/hi");
    expect(letter.graph.editor.text, "the letter reached the editor").toBe("/hi");

    // A reverse search composes its own query: the prompt is not live.
    const search = await fresh();
    search.stdin.emit("\u0012");
    expect(search.graph.overlays.top?.id).toBe(SEARCH_ID);
    expect(search.graph.overlays.top?.promptLive ?? false).toBe(false);
    expect(search.graph.promptUnderMenu()).toBe(false);

    // A chip preview has no selection to hold, so it is live while it is up.
    const chip = await fresh();
    const paste = Array.from({ length: 6 }, (_, i) => `alpha ${String(i)}`).join("\n");
    chip.stdin.emit(`${ESC}[200~${paste}${ESC}[201~`);
    await new Promise((r) => setImmediate(r));
    expect(chip.graph.overlays.top?.owner).toEqual({ rung: "substate", name: "preview" });
    expect(chip.graph.overlays.top?.promptLive).toBe(true);
    expect(chip.graph.promptUnderMenu()).toBe(true);
  });
});
