// C16 I74 — the wheel over a layer goes to that layer's scroller, through a
// built session (review batch 3, M8).
//
// **The wheel arrives as bytes where the frame is the witness.** A peek's
// scroller is a row offset the compositor reads, so T4.93 is read off a
// painted frame; the menu's is a window `keys.ts` draws into the layer's
// content, so T4.92 reads the content through the graph, as
// `overlay-displaced.test.ts` does.
import { describe, expect, it } from "vitest";

import { MENU_ID } from "../../src/interaction/completion/index.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const tool = (name: string) => ({ name, local: false, summary: "x", args: [], flags: [] });

/** A wheel notch at a terminal cell, as C16 receives it. */
const wheel = (row: number, col: number, button: "wheelUp" | "wheelDown"): InputEvent => ({
  kind: "mouse",
  row,
  col,
  button,
  press: true,
  shift: false,
  meta: false,
  ctrl: false,
  motion: false,
});

describe("C16 I74 — the wheel over a layer, through the graph (review batch 3, M8)", () => {
  it("T4.92 (C16 I74, C19 I20): a wheel over a truncated menu moves its window, selection stays null, and the transcript does not move", async () => {
    // Thirty tools behind `/`: the menu's placement holds nine, so its window
    // cuts — shown before it is asserted against.
    const tools = Array.from({ length: 30 }, (_, i) => tool(`alpha${String(i).padStart(2, "0")}`));
    const { graph, stdin } = await buildGraph({
      manifest: { schema: "tui.manifest/1", binary: "prism", version: "1.0.0", tools },
    } as never);
    graph.lifecycle.acquire();
    stdin.emit("/");
    const menu = () => graph.overlays.stack.find((l) => l.id === MENU_ID);
    const rows = (): readonly { text: string; selected: boolean }[] => {
      const table = menu()?.content.find((b) => b.kind === "table");
      if (table === undefined || table.kind !== "table") return [];
      return table.rows.map((r) => ({ text: String(r.cells["value"]?.text ?? ""), selected: r.cells["value"]?.glyph === "bullet" }));
    };
    expect(rows().map((r) => r.text)[0], "the window opens at the first").toBe("/alpha00");
    const placed = graph.overlays.layout({ width: 80, height: 24 }).find((p) => p.layer.id === MENU_ID);
    expect(placed, "the menu is placed").toBeDefined();
    const shown = rows().length;
    expect(shown, "and cut").toBeLessThan(30);

    // Region top is the harness frame's row 1; a notch over the menu's middle.
    const row = 1 + (placed?.top ?? 0) + 2;
    const topRow = graph.viewport.scroll.topRow;
    expect(graph.router.dispatch(wheel(row, 5, "wheelDown")), "consumed").toBe(true);
    expect(rows().map((r) => r.text)[0], "the window moved three candidates").toBe("/alpha03");
    expect(rows().some((r) => r.selected), "and chose nothing (C19 I20)").toBe(false);
    expect(graph.editor.text, "the line is untouched").toBe("/");
    expect(graph.viewport.scroll.topRow, "the transcript beneath did not move").toBe(topRow);

    graph.router.dispatch(wheel(row, 5, "wheelUp"));
    expect(rows().map((r) => r.text)[0], "and back").toBe("/alpha00");
    graph.router.dispatch(wheel(row, 5, "wheelUp"));
    expect(rows().map((r) => r.text)[0], "clamped at the first").toBe("/alpha00");

    // §3d Q2: the keys own the window once they move the selection. `Tab`
    // makes the menu a choice — under a display `↓` is the prompt's history
    // (C19 I20) — and the wheel then scrolls the chosen row out of view.
    stdin.emit("\t");
    await new Promise((r) => setTimeout(r, 0));
    const chosen = rows().find((r) => r.selected)?.text;
    expect(chosen, "Tab chose a row").toBeDefined();
    graph.router.dispatch(wheel(row, 5, "wheelDown"));
    graph.router.dispatch(wheel(row, 5, "wheelDown"));
    graph.router.dispatch(wheel(row, 5, "wheelDown"));
    expect(rows().some((r) => r.selected), "the wheel scrolled the choice out of view").toBe(false);
    stdin.emit("\u001b[B");
    const next = rows().find((r) => r.selected)?.text;
    expect(next, "↓ moved the choice, and the window came back to it").toBeDefined();
    expect(next).not.toBe(chosen);
  });

  it("T4.93 (C16 I74, C15 I31): a wheel over a truncated peek scrolls the peek, and over a peek that fits moves the transcript", async () => {
    // Twenty cut columns: the focused row's detail is twenty key–value rows,
    // more than half the region holds. Row `b` has one short cell and no detail
    // beyond it, so its peek is `c0` alone and fits.
    const columns = Array.from({ length: 20 }, (_, i) => ({
      key: `c${String(i)}`,
      label: `Col${String(i).padStart(2, "0")}`,
      align: "left",
      priority: 20 - i,
      minWidth: 12,
      sortable: false,
    }));
    const long = (i: number) => `value-${String(i)}-${"w".repeat(30)}`;
    const table = {
      kind: "table",
      id: "t",
      columns,
      rows: [
        { id: "a", cells: Object.fromEntries(columns.map((c, i) => [c.key, { text: long(i) }])) },
        { id: "b", cells: { c0: { text: "bravo-is-longer-than-twelve" } } },
      ],
    };
    const stdin = fakeStdin();
    const s = await buildSession(
      {
        stdin: stdin as never,
        manifest: {
          schema: "tui.manifest/1",
          binary: "prism",
          version: "1.0.0",
          tools: [
            { name: "filler", local: true, summary: "filler", args: [], flags: [] },
            { name: "rows", local: true, summary: "rows", args: [], flags: [] },
          ],
        },
        localHandlers: {
          // Forty lines above the table, so the transcript has somewhere to
          // scroll: a wheel reaching it is then visible, and one withheld is not
          // withheld vacuously.
          filler: () => ({
            schema: "tui.view/1",
            status: "ok",
            blocks: [{ kind: "code", id: "f", language: "text", text: Array.from({ length: 40 }, (_, i) => `filler ${String(i)}`).join("\n") }],
          }),
          rows: () => ({ schema: "tui.view/1", status: "ok", blocks: [table] }),
        },
      } as never,
      { columns: 80, rows: 30 },
    );
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 20));
    };
    // One byte at a time: a run arriving together is a paste (C16 §7).
    for (const ch of "/filler\r/rows\r") {
      stdin.emit(ch);
      await flush();
    }
    // A click on row `a` focuses it (C16 §4a), and focus is what the peek follows.
    const rowA = s.screen().text.findIndex((l) => l.includes("value-0-"));
    expect(rowA, "row a is on screen").toBeGreaterThanOrEqual(0);
    stdin.emit(`\u001b[<0;8;${String(rowA + 1)}M\u001b[<0;8;${String(rowA + 1)}m`);
    await flush();
    const text = (): readonly string[] => s.screen().text;
    const peekTop = text().findIndex((l) => l.includes("Detail"));
    expect(peekTop, "the peek is on screen").toBeGreaterThanOrEqual(0);
    expect(text().some((l) => l.includes("Col00")), "at its top").toBe(true);
    expect(text().some((l) => l.includes("Col19")), "and cut").toBe(false);

    const sgrWheel = (row0: number, col0: number, down: boolean): string =>
      `\u001b[<${down ? "65" : "64"};${String(col0 + 1)};${String(row0 + 1)}M`;
    const outside = text().slice(0, peekTop).join("\n");
    stdin.emit(sgrWheel(peekTop + 3, 10, true));
    await flush();
    expect(text().some((l) => l.includes("Detail")), "the peek's own rows moved: its title is gone").toBe(false);
    expect(text().slice(0, peekTop).join("\n"), "and the transcript above it did not").toBe(outside);
    // Up again: the peek's title comes back, and the transcript — which has
    // forty lines above to scroll to — still does not move.
    stdin.emit(sgrWheel(peekTop + 3, 10, false));
    await flush();
    expect(text()[peekTop], "the peek's title is back").toContain("Detail");
    stdin.emit(sgrWheel(peekTop + 3, 10, false));
    await flush();
    expect(text().slice(0, peekTop).join("\n"), "clamped, and still consumed: the transcript did not move").toBe(outside);

    // The control: row `b`'s peek fits, so it declines the wheel and the
    // transcript beneath it scrolls.
    const rowB = text().findIndex((l) => l.includes("bravo-is"));
    expect(rowB, "row b is on screen").toBeGreaterThanOrEqual(0);
    stdin.emit(`\u001b[<0;8;${String(rowB + 1)}M\u001b[<0;8;${String(rowB + 1)}m`);
    await flush();
    const fitsTop = text().findIndex((l) => l.includes("Detail"));
    expect(fitsTop, "row b's peek is on screen").toBeGreaterThanOrEqual(0);
    const before = text().slice(0, fitsTop).join("\n");
    stdin.emit(sgrWheel(fitsTop + 1, 10, false));
    await flush();
    expect(text().slice(0, fitsTop).join("\n"), "the wheel reached the transcript").not.toBe(before);
  });
});

describe("C22 §6q — the wheel reaches a box in a layer, where the layer is drawn, owed at the spec commit", () => {
  it.todo(
    "T4.114 (C22 I141, C16 I74): a chip preview over a 40-line paste; a wheel notch down over the panel moves the box by WHEEL_ROWS; the layer dismissed and pushed again opens at its top — not deferred on a component: the row lands with the code commit of review batch 4's shell lane, group A (C22 §6q)",
  );
  it.todo(
    "T4.115 (C22 I142, C23 I74): an approval replacing the prompt, suspended; a wheel over the prompt's rows moves the box, and one over the region's middle moves and answers nothing — not deferred on a component: the row lands with the code commit of review batch 4's shell lane, group A (C22 §6q)",
  );
});
