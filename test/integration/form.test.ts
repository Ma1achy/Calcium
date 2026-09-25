// C22 I118 — the shell lends a form field the prompt's editor (C04 §3ar, C16 I60, C26 I29, C17 I29).
//
// **Bytes in, through stdin**, for split.test's reason: the borrow's life is
// decided after each event in the read loop (`reconcileField`), so a row that
// called an effect directly would test the mechanism and miss the wiring. The
// form sits in a split's left pane on purpose — `⌥←` inside a field is word
// motion there, and the divider it would otherwise move is one key away.
import { describe, expect, it, vi } from "vitest";

import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const ESC = "\u001b";
const DOWN = `${ESC}[B`;
const F1 = `${ESC}OP`;
const ALT_LEFT = `${ESC}[1;3D`;
const BACKSPACE = "\u007f";
const paste = (text: string): string => `${ESC}[200~${text}${ESC}[201~`;
const press = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}M`;
const release = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}m`;

const META = {
  verb: "form",
  adapter: "passthrough",
  exitCode: 0,
  durationMs: 0,
  truncated: false,
  argv: [] as string[],
  stderr: "",
  transport: "local",
  origin: "user",
};

/** §105's form, without the error, so `port`'s hint is the one it keeps. */
const FORM = {
  kind: "form",
  id: "f",
  fields: [
    { id: "name", label: "name", value: "prism-serve" },
    { id: "port", label: "port", value: "80" },
    { id: "replicas", label: "replicas", value: "3", hint: "0 stops the service" },
  ],
  buttons: [
    { id: "save", label: "save", submit: true, action: { kind: "fill", label: "save", command: "serve" } },
    { id: "cancel", label: "cancel" },
  ],
};

/** The form in a split's left pane — the divider is what `⌥←` must not reach. */
const BLOCKS = [{ kind: "split", id: "s", height: 8, children: [FORM, { kind: "raw", id: "notes", text: "notes" }] }];

async function seeded() {
  const built = await buildGraph();
  built.graph.lifecycle.acquire();
  built.graph.transcript.append(
    { schema: "tui.view/1", command: "/form", status: "ok", blocks: BLOCKS, meta: META } as never,
    { streaming: true },
  );
  const type = (bytes: string): void => void built.stdin.emit(bytes);
  const esc = async (): Promise<void> => {
    // C16 holds a lone `Esc` for 50 ms (§2); the window has to elapse.
    built.stdin.emit(ESC);
    built.clock.advance(80);
    await new Promise((r) => setTimeout(r, 80));
  };
  const at = () => built.graph.focus.current;
  const focused = (): string => {
    const f = at();
    return f.at === "liveBlock" ? f.element?.elementId ?? "" : "prompt";
  };
  const inside = (): boolean => {
    const f = at();
    return f.at === "liveBlock" && f.mode === "interact";
  };
  const entry = () => built.graph.transcript.entries[0];
  const form = () =>
    (entry()?.doc.blocks[0] as { children: readonly { fields?: readonly { id: string; value?: string }[] }[] } | undefined)
      ?.children[0];
  const value = (id: string): string | undefined => form()?.fields?.find((f) => f.id === id)?.value;
  const divider = () => (entry()?.doc.blocks[0] as { divider?: number } | undefined)?.divider;
  return { ...built, type, esc, focused, inside, value, divider, entry };
}

/** A painting session holding the same entry, and the screen. */
async function painted() {
  vi.useFakeTimers();
  const stdin = fakeStdin();
  const session = await buildSession(
    {
      stdin: stdin as never,
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "form", local: true, summary: "a form", args: [], flags: [] }],
      },
      localHandlers: { form: () => ({ schema: "tui.view/1", status: "ok", blocks: [FORM] }) },
    } as never,
    { columns: 60, rows: 24 },
  );
  const step = async (ms = 0): Promise<void> => {
    session.clock.advance(ms);
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  };
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await step();
  };
  await step();
  await type("/form\r");
  await step(50);
  const rows = (): readonly string[] => session.screen().rows.map((r) => r.trimEnd());
  /** Screen row and column of `text`'s first cell, 1-based, as SGR 1006 reports them. */
  const where = (text: string): Readonly<{ row: number; col: number }> => {
    const all = rows();
    const row = all.findIndex((r) => r.includes(text));
    return { row: row + 1, col: (all[row] ?? "").indexOf(text) + 1 };
  };
  return { ...session, step, type, rows, where };
}

describe("C22 I118 — a form in a session", () => {
  it("T4.99 (C22 I118, C16 I60, C26 I29, C17 I29, C04 §3ar F1–F5): a field entered, edited, committed and discarded", async () => {
    const s = await seeded();
    // The reader's own line, with the caret mid-line: *given back* is a claim
    // about a state, not a string (C17 I28).
    s.graph.editor.setText("my draft", 3);
    s.type(DOWN);
    s.type(DOWN);
    expect(s.focused(), "↓↓ from the prompt reaches `port`").toBe("port");

    // F1 — entered, and the line is taken whole.
    s.type("\r");
    expect(s.inside(), "⏎ on a field enters it").toBe(true);
    expect(s.graph.editor.text, "the field's value, loaded").toBe("80");
    expect(s.graph.fieldHeld()?.text, "the reader's line, held").toBe("my draft");

    // F2 — the editor's keys, and `⌥←` is word motion, not the divider.
    s.type(BACKSPACE);
    s.type(BACKSPACE);
    s.type("8080");
    expect(s.graph.editor.text).toBe("8080");
    s.type(ALT_LEFT);
    expect(s.graph.editor.cursor, "⌥← is word-left inside a field").toBe(0);
    expect(s.divider(), "and the split the form sits in did not move").toBeUndefined();
    expect(s.value("port"), "nothing is written before ⏎").toBe("80");

    // F4 — written, and the next field entered with the line still held.
    s.type("\r");
    expect(s.value("port"), "⏎ writes the value into the block").toBe("8080");
    expect(s.focused()).toBe("replicas");
    expect(s.inside(), "and enters the next field").toBe(true);
    expect(s.graph.editor.text).toBe("3");
    expect(s.graph.fieldHeld()?.text, "the reader's line is still held").toBe("my draft");
    // A stack per field (C17 I29): undo cannot reach what `port` held.
    s.type("\u001a");
    expect(s.graph.editor.text, "⌃z in `replicas` has nothing of `port`'s to undo").toBe("3");

    // F5 — `esc` discards, and the line comes back exactly.
    s.type("9");
    await s.esc();
    expect(s.value("replicas"), "esc writes nothing").toBe("3");
    expect(s.focused(), "and focus stays on the field").toBe("replicas");
    expect(s.inside()).toBe(false);
    expect(s.graph.fieldHeld(), "the borrow is over").toBeNull();
    expect([s.graph.editor.text, s.graph.editor.cursor], "text and caret given back").toEqual(["my draft", 3]);

    // F4's end — from the last field to the default button, never pressing it.
    s.type("\r");
    s.type("\r");
    expect(s.focused(), "⏎ from the last field lands on the default button").toBe("save");
    expect(s.inside()).toBe(false);
    expect(s.graph.editor.text, "no submit was pressed, so the prompt is the reader's").toBe("my draft");

    // The frame: the field draws the draft, and the prompt row does not — it
    // draws the held line, which here is the empty one the reader left.
    const p = await painted();
    try {
      // Three: this session submitted `/form`, so the first `↓` is history's.
      for (let i = 0; i < 3; i += 1) await p.type(DOWN);
      await p.type("\r");
      await p.type("0");
      expect(p.rows().some((r) => r.includes("port        800▌")), "the field draws the draft and its caret").toBe(true);
      expect(p.rows().filter((r) => r.startsWith("❯")).at(-1), "the prompt row draws the held line").toBe("❯");
      // The owner line names a field and its two keys, not a plot's orbit.
      const owner = p.rows().at(-1) ?? "";
      expect(owner, "the owner is a field").toMatch(/^field\b/u);
      expect(owner).toContain("keep");
      expect(owner).toContain("discard");
      expect(owner).not.toContain("orbit");
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.100 (C22 I118, C04 §3ar F6, F7): the borrow ends before a pointer's move or an action, and it writes", async () => {
    const p = await painted();
    try {
      // Three: this session submitted `/form`, so the first `↓` is history's.
      for (let i = 0; i < 3; i += 1) await p.type(DOWN);
      await p.type("\r");
      await p.type(BACKSPACE);
      await p.type(BACKSPACE);
      await p.type("8080");
      // F6 — a press on `save` moves focus there, which is a blur: written.
      const save = p.where("save");
      expect(save.row > 0 && save.col > 0, "save is on the screen").toBe(true);
      await p.type(press(save.col, save.row));
      await p.type(release(save.col, save.row));
      // F7's construction: the first click focuses and presses nothing, so no
      // action can dispatch while the field holds the line.
      expect(p.rows().filter((r) => r.startsWith("❯")).at(-1), "the first click pressed nothing").toBe("❯");
      expect(p.rows().some((r) => r.includes("port        8080")), "the typed value was kept").toBe(true);
      expect(p.rows().some((r) => r.includes("▌")), "and the field is no longer being edited").toBe(false);
      // F7 — the second click presses it, and the submit reads what was typed.
      await p.type(press(save.col, save.row));
      await p.type(release(save.col, save.row));
      expect(
        p.rows().some((r) => r.startsWith("❯ serve --name prism-serve --port 8080 --replicas 3")),
        "the fill carries the value typed, not the one before the edit",
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.101 (C22 I118, C16 I60, C04 §3ar F3, F9): a refused paste, and a key the field does not own passed to global", async () => {
    const s = await seeded();
    s.type(DOWN);
    s.type(DOWN);
    s.type("\r");
    // F9 — a line break refuses the whole paste, and it says why.
    s.type(paste("a\nb"));
    expect(s.graph.editor.text, "nothing was inserted").toBe("80");
    const said = JSON.stringify(s.entry()?.doc.blocks ?? []);
    expect(said, "the refusal is stated on the entry").toContain("A field is one line");
    // A one-line paste is one edit.
    s.type(paste("00"));
    expect(s.graph.editor.text).toBe("8000");
    // F3 — `↓` is not a field's key: passed, bound at no rung it can reach,
    // and dropped, so the field keeps focus.
    s.type(DOWN);
    expect(s.focused(), "↓ does not leave a field").toBe("port");
    expect(s.inside()).toBe(true);
    expect(s.graph.editor.text).toBe("8000");

    // **`F1` is the key that tells a pass from a reject** (C16 I60,
    // R-KEY-004): a pass reaches the `global` fallback, which a reject would
    // withhold, and every other key above draws the same frame either way.
    // A session that has settled `/form`, since the help is a command and the
    // seeded entry above is still streaming.
    const p = await painted();
    try {
      // Three: this session submitted `/form`, so the first `↓` is history's.
      for (let i = 0; i < 3; i += 1) await p.type(DOWN);
      await p.type("\r");
      await p.type(F1);
      await p.step(50);
      // The keymap's own row, since the entry's heading scrolls off above it.
      expect(p.rows().some((r) => r.includes("helpKeymap")), "F1 answers inside a field").toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
