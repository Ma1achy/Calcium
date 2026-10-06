// C16 I68 — `>` opens the action palette only as the line's first character, and a
// `>`-led line never reaches C18 (§6c "The palette's way in", ruling 45, ruling 67).
//
// **Bytes into stdin**, as `completion-as-you-type.test.ts` does: the menu opens
// through the prompt's printable arm and `⏎` meets it through the router, and a
// row calling the effects directly would pass on a session where neither is wired.
//
// Fail-on-revert, each naming the change:
//
//   - The submit arm's `>` guard removed (C22 T6.132) → T4.109 fails: `> notes`
//     reaches `pipeline.submit`, and C18 hands it to the shell as a redirect.
//   - `contextAt`'s `>` test moved after the tokeniser → T1.176 fails: `> notes`
//     is `[operator, word]` and its slot is C18's.
//   - `applyCandidate` inserting an action row instead of running it → T1.177
//     fails: the line reads `>agent.1` and no handler is called.
//   - The palette's rows reading the row's `action` instead of the effective one
//     → T1.177 and T1.178 fail: `queue.drop` is offered with no handler.
import { describe, expect, it, vi } from "vitest";

import { contextAt, MENU_ID } from "../../src/interaction/completion/index.js";
import type { ReservedKeyAction } from "../../src/interaction/router/types.js";
import type { Graph } from "../../src/shell/construct.js";
import type { TuiConfig } from "../../src/shell/types.js";
import { buildGraph } from "../support/session.js";

const TAB = "\t";
const ENTER = "\r";
const ESC = "\u001b";
const paste = (text: string): string => `${ESC}[200~${text}${ESC}[201~`;

/** The menu's rows, value and detail, or `[]` when the top layer is not the menu. */
const menuRows = (graph: Graph): readonly Readonly<{ value: string; detail: string }>[] => {
  const layer = graph.overlays.top;
  if (layer === null || layer.id !== MENU_ID) return [];
  const table = layer.content.find((b) => b.kind === "table");
  if (table === undefined || table.kind !== "table") return [];
  return table.rows.map((r) => ({
    value: String(r.cells["value"]?.text ?? ""),
    detail: String(r.cells["detail"]?.text ?? ""),
  }));
};

/** The palette source's own answer: every row, unfiltered by a prefix. */
const paletteOf = (graph: Graph) => graph.completion.suggest(contextAt(">", 1, null));

async function world(overrides: Partial<TuiConfig> = {}) {
  const built = await buildGraph(overrides);
  built.graph.lifecycle.acquire();
  /** One byte at a time: a run arriving together is a paste (C16 §7). */
  const type = async (text: string): Promise<void> => {
    for (const ch of text) built.stdin.emit(ch);
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
  };
  return { ...built, type };
}

const AGENTS = [
  "agent.1", "agent.2", "agent.3", "agent.4", "agent.5", "agent.6", "agent.7", "agent.8", "agent.9",
  "agent.next", "agent.previous",
] as const satisfies readonly ReservedKeyAction[];

describe("C16 §6c — the palette's way in (review batch 2, M6, ruling 45)", () => {
  it("T1.176 (C16 I68): contextAt answers the action slot for a >-led line and C18's slot for every other", () => {
    const at = (input: string, cursor = input.length) => contextAt(input, cursor, null);
    // P1, P2, P4, P5: the palette, with the prefix after the `>` and its spaces.
    expect(at(">")).toMatchObject({ slot: { kind: "action" }, prefix: "", replace: { start: 1, end: 1 } });
    expect(at(">page.u")).toMatchObject({ slot: { kind: "action" }, prefix: "page.u", replace: { start: 1, end: 7 } });
    expect(at("> notes"), "P4 — the line C18 would hand to the shell").toMatchObject({
      slot: { kind: "action" },
      prefix: "notes",
      replace: { start: 2, end: 7 },
      tokens: [],
    });
    expect(at(">>notes")).toMatchObject({ slot: { kind: "action" }, prefix: ">notes" });
    // The cursor mid-query: the prefix is what sits before it.
    expect(at(">page.up", 5)).toMatchObject({ slot: { kind: "action" }, prefix: "page", replace: { start: 1, end: 5 } });
    // A cursor before the `>`: the line is still an action's, and there is no slot.
    expect(at(">ab", 0).slot.kind).toBe("none");
    // P6, P7 — the controls: a `>` that is not the first code unit is C18's, and
    // the slot is what it was before this commit, not `action`.
    expect(at("ls > notes").slot.kind).not.toBe("action");
    expect(at("ls > notes").tokens.map((t) => t.kind), "C18 still reads the redirect").toContain("operator");
    expect(at(" > notes").slot.kind).not.toBe("action");
  });

  it("T1.177 (C16 I68): > opens the menu over the actions, Tab then ⏎ runs one, Tab's unique match inserts, and a handler-less reserved action is not offered", async () => {
    {
      const w = await world();
      await w.type(">page.");
      expect(w.graph.overlays.top?.id, "the menu opens as you type, with no Tab").toBe(MENU_ID);
      const rows = menuRows(w.graph);
      expect(rows.map((r) => r.value).sort()).toEqual(["page.down", "page.up"]);
      expect(rows.find((r) => r.value === "page.up")?.detail, "each row carries its chord").toBe("⌥↑");

      // Q3: one candidate is inserted whole, with no delimiter after it.
      await w.type("u");
      await w.type(TAB);
      expect(w.graph.editor.text).toBe(">page.up");
      const pageUp = vi.spyOn(w.graph.viewport, "pageUp");
      const before = w.graph.transcript.entries.length;
      await w.type(ENTER);
      expect(pageUp, "⏎ on an exact name runs its effect").toHaveBeenCalledTimes(1);
      expect(w.graph.editor.text, "and the line was the query: it goes").toBe("");
      expect(w.graph.transcript.entries.length, "no entry — nothing was submitted").toBe(before);
    }
    {
      // Q2: a menu with a selection runs the selected row on ⏎.
      const spies = Object.fromEntries(AGENTS.map((id) => [id, vi.fn(() => undefined)]));
      const w = await world({ keyActions: spies });
      await w.type(">agent.");
      await w.type(TAB);
      expect(w.graph.overlays.top?.id, "Tab: the requested menu").toBe(MENU_ID);
      const chosen = menuRows(w.graph)[0]?.value;
      expect(chosen).toBeDefined();
      await w.type(ENTER);
      const calls = AGENTS.map((id) => [id, spies[id]?.mock.calls.length ?? 0] as const).filter(([, n]) => n > 0);
      expect(calls, "the selected row's handler, once, and no other").toEqual([[chosen, 1]]);
      expect(w.graph.editor.text, "run, not inserted").toBe("");
      expect(w.graph.overlays.top, "and the menu is gone").toBeNull();
    }
    {
      // Q5: a reserved action is the application's; with no handler it is not offered.
      const w = await world();
      await w.type(">queue.");
      expect(menuRows(w.graph)).toEqual([]);
      expect(w.graph.completion.ghost(contextAt(">queue.", 7, null)), "not even as ghost text").toBeNull();
    }
    {
      const drop = vi.fn(() => undefined);
      const w = await world({ keyActions: { "queue.drop": drop } });
      await w.type(">queue.drop");
      await w.type(ENTER);
      expect(drop, "with one, `>queue.drop` ⏎ calls it").toHaveBeenCalledTimes(1);
    }
  });

  it("T1.178 (C16 I68): the palette's rows are the actions the prompt reaches, each with its chords", async () => {
    for (const kitty of [false, true]) {
      const w = await world(kitty ? { capabilities: { keyboardProtocol: "kitty" } as never } : {});
      const rows = paletteOf(w.graph);
      const values = rows.map((r) => r.value);
      expect(new Set(values).size, "one row per action").toBe(values.length);
      // What the prompt takes first is not the row's action from the prompt.
      expect(values, "⏎ submits at the prompt").not.toContain("confirm");
      expect(values, "? is typed at the prompt").not.toContain("help.question");
      expect(values, "reserved, no handler").not.toContain("queue.drop");
      expect(values.filter((v) => v.startsWith("agent.")), "reserved, no handler").toEqual([]);
      for (const id of ["help.f1", "page.up", "page.down", "transcript.top", "transcript.bottom"]) {
        expect(values, `${id} is reached from the prompt`).toContain(id);
      }
      // A `prompt` row's action: `move.left` is the caret's at the prompt.
      expect(values).toContain("move.left");
      const top = rows.find((r) => r.value === "transcript.top")?.detail ?? "";
      expect(top, "the base chord on both profiles").toContain("⌃home");
      if (kitty) expect(top, "and the enhanced one where it can be sent").toContain("⌘↑");
      else expect(top, "and not where it cannot").not.toContain("⌘");
      expect(rows.every((r) => r.delimiter === ""), "a name ends the line").toBe(true);
    }
  });

  it("C22 T4.109 (C16 I68): `> notes` ⏎ submits nothing, appends one warn notice and keeps the line; `ls > notes` is submitted", async () => {
    const w = await world();
    const submit = vi.spyOn(w.graph.pipeline, "submit").mockImplementation(() => undefined as never);
    await w.type("> notes");
    const before = w.graph.transcript.entries.length;
    await w.type(ENTER);
    expect(submit, "never handed to C23, so never to C18 or the shell").not.toHaveBeenCalled();
    const added = w.graph.transcript.entries.slice(before);
    expect(added, "one notice").toHaveLength(1);
    const said = JSON.stringify(added[0]?.doc.blocks ?? []);
    expect(said).toContain("notes");
    expect(said).toContain('"warn"');
    expect(w.graph.editor.text, "the reader's text is kept").toBe("> notes");

    // **The control**: a guard refusing every line with a `>` in it passes the
    // half above alone. The redirect the reader wrote is theirs.
    w.graph.editor.clear();
    await w.type("ls > notes");
    await w.type(ENTER);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("ls > notes");

    // **P8 — the guard reads the resolved line.** Five lines pasted become a chip,
    // so the buffer's first character is the chip and not `>`; what C18 would be
    // handed begins `>` all the same.
    w.graph.editor.clear();
    w.stdin.emit(paste("> notes\nb\nc\nd\ne"));
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
    expect(w.graph.editor.text.startsWith(">"), "the buffer holds a chip, not the text").toBe(false);
    expect(w.graph.editor.resolved.startsWith("> notes")).toBe(true);
    await w.type(ENTER);
    expect(submit, "the chip's `>` is caught too").toHaveBeenCalledTimes(1);
  });
});
