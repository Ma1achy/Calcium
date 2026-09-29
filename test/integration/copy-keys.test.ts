// C14 §6a, §6e — the copy mode's keys in a real session (review batch 4, M10
// items 2, 5, 6 and 7).
//
// The rows a model suite cannot reach, because each is about the **chain**: the
// keymap's row, the session's handler, the held view's geometry and the frame.
// The kill buffer is read back the way a reader reads it — `esc` out and `⌃y`
// into the prompt — and one session per copy, because the buffer is shared by
// every kill and a second copy of nothing would read the first.
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { styledScreenFrom } from "../support/styled-screen.js";
import { createEditor, type LineEditor } from "../../src/interaction/editor/editor.js";
import type { TuiConfig } from "../../src/shell/types.js";

const ESC = "\u001b";
const DOWN = `${ESC}[B`;
const UP = `${ESC}[A`;
const SHIFT_DOWN = `${ESC}[1;2B`;
const SHIFT_RIGHT = `${ESC}[1;2C`;
const CTRL_V = "\u0016";
const CTRL_Y = "\u0019";
const ENTER_MODE = `${ESC}V`;

const settle = async (): Promise<void> => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};

const tool = (name: string) => ({ name, local: true, summary: name, args: [], flags: [] });

/** Sixty numbered rows in one block, so what is on screen names where the view is. */
const TALL = Array.from({ length: 60 }, (_, i) => `row-${String(i).padStart(2, "0")}`).join("\n");

const HANDLERS: NonNullable<TuiConfig["localHandlers"]> = {
  tall: () => ({ schema: "tui.view/1", command: "tall", status: "ok", blocks: [{ kind: "raw", id: "t", text: TALL } as never] }),
  note: () => ({ schema: "tui.view/1", command: "note", status: "ok", blocks: [{ kind: "text", id: "t", text: "two words" } as never] }),
  ruled: () => ({ schema: "tui.view/1", command: "ruled", status: "ok", blocks: [{ kind: "rule", id: "r", label: "" } as never] }),
  cells: () => ({
    schema: "tui.view/1",
    command: "cells",
    status: "ok",
    blocks: [{ kind: "raw", id: "c", text: "ABCDEFGHIJ\nKLMNOPQRST\nUVWXYZ0123" } as never],
  }),
};

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [tool("tall"), tool("note"), tool("ruled"), tool("cells")],
};

const SIZE = { columns: 100, rows: 30 };

async function session() {
  const stdin = fakeStdin();
  const built = await buildSession({ manifest: MANIFEST, localHandlers: HANDLERS, stdin: stdin as never }, SIZE);
  const step = async (ms = 0): Promise<void> => {
    built.clock.advance(ms);
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
  };
  const press = async (keys: string, ms = 0): Promise<void> => {
    stdin.emit(keys);
    await step(ms);
  };
  // **The owner line by its first chip, and the mode by the header** — not by
  // `the screen is frozen`, which is a chip the line sheds before the count.
  const footer = (): string => [...built.screen().rows].reverse().find((r) => /^copy {2}/u.test(r))?.trimEnd() ?? "<not in copy mode>";
  const inMode = (): boolean => (built.screen().rows[0] ?? "").includes("COPY");
  /** The prompt's rows — between the last two rules — after `⌃y` has yanked into it. */
  const yanked = async (): Promise<string> => {
    await press(CTRL_Y);
    const rows = built.screen().rows;
    const rules = rows.flatMap((r, i) => (/^─+$/u.test(r.trim()) ? [i] : []));
    const [x, y] = rules.slice(-2);
    return rows.slice((x ?? 0) + 1, y).map((r) => r.trimEnd()).join("\n");
  };
  await step();
  return { ...built, stdin, step, press, footer, inMode, yanked };
}

/** SGR 1006, 1-based — `Cb` 0 is button 1 down, 32 the same button moving. */
const pressAt = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}M`;
const moveTo = (col: number, row: number): string => `${ESC}[<32;${String(col)};${String(row)}M`;
const releaseAt = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}m`;

/** Each `row-NN` on screen, by the screen row it is on. */
const numbered = (rows: readonly string[]): ReadonlyMap<number, number> => {
  const out = new Map<number, number>();
  rows.forEach((r, i) => {
    const m = /row-(\d\d)/u.exec(r);
    if (m !== null) out.set(Number(m[1]), i);
  });
  return out;
};

describe("C14 §6a — the keys in a real session", () => {
  it("T3.14 (C14 I37, §6a): ↓ and ⇧↓ keep the view still while the caret is on screen, the press past the last row scrolls it by one, ↑ back scrolls it back, and ↑ at the first row scrolls nothing", async () => {
    vi.useFakeTimers();
    try {
      const s = await session();
      await s.press("/tall\r");
      // To the top, so the caret — seeded at the entry's first row — starts on
      // screen with sixty rows below it.
      for (let i = 0; i < 6; i += 1) await s.press(`${ESC}[5~`);
      const top = numbered(s.screen().rows);
      expect(top.has(0), "the fixture starts with row-00 on screen").toBe(true);
      const last = Math.max(...top.keys());
      expect(last, "and the block runs past the screen").toBeLessThan(59);

      await s.press(ENTER_MODE);
      // **Still while the caret is on screen**. The entry is a card, so the
      // caret starts on its head, one row above `row-00`: `last + 1` presses
      // put it on `row-<last>`, the last visible row, and nothing has moved.
      for (let i = 0; i <= last; i += 1) await s.press(DOWN);
      expect(numbered(s.screen().rows), "the caret on the last row moves nothing").toEqual(top);

      // **One more is past the edge, and the view moves by exactly one.**
      await s.press(DOWN);
      const once = numbered(s.screen().rows);
      expect(once.get(last + 1), "the caret's row came on").toBe(top.get(last));
      for (const [n, at] of once) expect(at, `row-${String(n)} moved up by one`).toBe((top.get(n) ?? at + 1) - 1);

      // **The shifted arrow is the same move**, and extends on the way.
      await s.press(SHIFT_DOWN);
      expect(numbered(s.screen().rows).get(last + 2), "⇧↓ past the edge scrolls too").toBe(top.get(last));

      // **Back up past the top edge**: to the head, `last + 3` rows up, and the
      // view follows it until the head is on screen again.
      for (let i = 0; i < last + 3; i += 1) await s.press(UP);
      const back = numbered(s.screen().rows);
      expect(back.has(0), "↑ back to the first row scrolled it on").toBe(true);
      const firstRow = back.get(0) ?? -1;
      // **The transcript's first row clamps the caret and nothing scrolls.**
      await s.press(UP);
      expect(numbered(s.screen().rows).get(0), "↑ at the first row scrolls nothing").toBe(firstRow);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T3.15 (C14 I59): y and ⏎ with nothing selected leave the kill buffer untouched, keep the mode up and toast nothing selected; a rule alone toasts the selection copies no text", async () => {
    vi.useFakeTimers();
    try {
      const s = await session();
      await s.press("/note\r");
      await s.press(ENTER_MODE);
      await s.press("y");
      expect(s.inMode(), "y on nothing stays").toBe(true);
      expect(s.screen().rows.some((r) => r.includes("nothing selected")), "and says so").toBe(true);
      await s.press("\r");
      expect(s.inMode(), "⏎ on nothing stays — it would discard the mode for nothing").toBe(true);
      await s.press(ESC, 100);
      expect(s.inMode(), "nothing was selected, so one esc leaves").toBe(false);
      expect(await s.yanked(), "the kill buffer was never written").not.toMatch(/two words/u);

      // **A selection that copies no text** is a selection: the same two facts,
      // in its own words.
      // The card's head copies its command, so the rule is taken alone: onto its
      // row, and one extend from there, which the entry's end clamps.
      const r = await session();
      await r.press("/ruled\r");
      await r.press(ENTER_MODE);
      await r.press(DOWN);
      await r.press(SHIFT_DOWN);
      expect(r.footer(), "the selection copies nothing, so there is no count").not.toMatch(/\d+ chars?/u);
      expect(r.footer(), "a rule alone is a selection the next esc clears").toContain("esc clear");
      await r.press("\r");
      expect(r.inMode(), "⏎ stays").toBe(true);
      expect(r.screen().rows.some((row) => row.includes("the selection copies no text"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.40 (C14 I59, C14 I47, R-BLK-838): a then ⏎ copies and leaves with a toast naming the destination; a then y copies and stays; ⏎ with nothing selected stays", async () => {
    vi.useFakeTimers();
    try {
      // `⏎` — the copy, and out.
      const s = await session();
      await s.press("/note\r");
      await s.press(ENTER_MODE);
      await s.press("a");
      await s.press("\r");
      expect(s.inMode(), "⏎ left the mode").toBe(false);
      // **Where it went is this session's truth** (C14 I61): no OSC 52 and no
      // tool on an empty `PATH`, so the file, by name.
      expect(s.screen().rows.some((r) => r.includes("no clipboard here — saved to /state/copy.txt")), "and said where the text went").toBe(true);
      expect(await s.yanked()).toContain("two words");

      // `y` — the same copy, and the mode stays.
      const y = await session();
      await y.press("/note\r");
      await y.press(ENTER_MODE);
      await y.press("a");
      await y.press("y");
      expect(y.inMode(), "y stays").toBe(true);
      expect(y.screen().rows.some((r) => r.includes("saved to /state/copy.txt"))).toBe(true);
      await y.press(ESC, 100);
      await y.press(ESC, 100);
      expect(await y.yanked()).toContain("two words");

      // **The control**: `⏎` with nothing selected stays, which is what makes
      // the first leave the copy's doing.
      const c = await session();
      await c.press("/note\r");
      await c.press(ENTER_MODE);
      await c.press("\r");
      expect(c.inMode()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.41 (C14 I60, C14 I43, C14 I55): ⌃V, ⇧→ ×3, ⇧↓ draws RECT 4×2 and cells, not source, washes four cells on two rows with the rail on the first; y copies the eight cells with no escape; ⌃V restores block mode", async () => {
    vi.useFakeTimers();
    try {
      const s = await session();
      await s.press("/cells\r");
      await s.press(ENTER_MODE);
      await s.press("a");
      const blocks = s.footer();
      expect(blocks, "the block selection before the rectangle — the card's head and its three rows").toMatch(/\d+ chars · 4 rows · 1 entry/u);

      // Off the card's head and onto the body's first row, then the rectangle.
      await s.press(DOWN);
      await s.press(CTRL_V);
      expect(s.footer(), "the rectangle at the caret").toContain("RECT 1×1");
      for (let i = 0; i < 3; i += 1) await s.press(SHIFT_RIGHT);
      await s.press(SHIFT_DOWN);
      const footer = s.footer();
      expect(footer).toContain("RECT 4×2");
      expect(footer).toContain("cells, not source");
      expect(footer, "the count is the rectangle's, not the blocks'").toContain("9 chars · 2 rows · 1 entry");

      // **What is drawn**: the rail on the rectangle's first row, and the
      // ground over its four cells and not the fifth.
      const rows = s.screen().rows;
      const first = rows.findIndex((r) => r.includes("ABCDEFGHIJ"));
      const second = rows.findIndex((r) => r.includes("KLMNOPQRST"));
      expect(rows[first]?.[0], "the rail leads the rectangle's first row").toBe("▌");
      expect(rows[second]?.[0], "and only its first").toBe(" ");
      const g = styledScreenFrom(s.stdout.chunks, SIZE);
      for (const row of [first, second]) {
        const col = (rows[row] ?? "").indexOf(row === first ? "A" : "K");
        const grounds = [0, 1, 2, 3, 4].map((k) => g[row]?.[col + k]?.style.bg ?? "");
        expect(grounds.slice(0, 4).every((bg) => bg !== ""), `row ${String(row)}: four cells washed`).toBe(true);
        expect(grounds[4], `row ${String(row)}: the fifth is not`).toBe("");
      }
      const third = rows.findIndex((r) => r.includes("UVWXYZ0123"));
      const col3 = (rows[third] ?? "").indexOf("U");
      expect(g[third]?.[col3]?.style.bg, "the row below is not washed").toBe("");

      // `y` copies the cells and stays.
      await s.press("y");
      expect(s.inMode(), "y stays").toBe(true);

      // `⌃V` off: block mode's footer, with the block set it found.
      await s.press(CTRL_V);
      expect(s.footer()).toBe(blocks);

      await s.press(ESC, 100);
      await s.press(ESC, 100);
      const text = await s.yanked();
      expect(text, "the cells, as two lines").toContain("ABCD");
      expect(text).toContain("KLMN");
      expect(text, "and nothing past the rectangle").not.toMatch(/ABCDE|UVWX/u);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.42 (C14 I60, C14 I49): a rectangle drag held past the region's bottom — the ticks move the rectangle's head, and y copies every row they reached", async () => {
    vi.useFakeTimers();
    // **The copy at the seam it lands on**, as T4.37c reads it: the prompt a
    // yank draws into is capped and would show the tail of whatever was copied.
    const copyText = vi.spyOn(Object.getPrototypeOf(createEditor()) as LineEditor, "copyText");
    try {
      const s = await session();
      await s.press("/tall\r");
      for (let i = 0; i < 6; i += 1) await s.press(`${ESC}[5~`);
      await s.press(ENTER_MODE);
      await s.press(CTRL_V);
      const rows = s.screen().rows;
      const at = rows.findIndex((r) => r.includes("row-05"));
      const col = (rows[at] ?? "").indexOf("row-05");
      const before = numbered(rows);
      const crossed = Math.max(...before.keys()) - 5 + 1;
      expect(at > 0 && col > 0, "the fixture drew the press's row").toBe(true);

      // Press on `r`, drag four cells right and far below the region, hold.
      s.stdin.emit(pressAt(col + 1, at + 1));
      await s.step();
      s.stdin.emit(moveTo(col + 4, 99));
      await s.step(400);
      s.stdin.emit(releaseAt(col + 4, 99));
      await s.step();
      expect(Math.max(...numbered(s.screen().rows).keys()), "the ticks scrolled").toBeGreaterThan(Math.max(...before.keys()));

      copyText.mockClear();
      await s.press("y");
      const copies = copyText.mock.calls.map(([text]) => text);
      expect(copies, "one copy").toHaveLength(1);
      const lines = (copies[0] ?? "").split("\n");
      // **Cells, four wide, from the pressed column** — the pointer's column
      // reached the rectangle, and every row is the same four cells.
      expect(new Set(lines), "every row is `row-`, the four cells from the press").toEqual(new Set(["row-"]));
      // **And more rows than the pointer crossed**: only the ticks' extend can
      // take the rows scrolled in after the pointer left the region.
      expect(lines.length, "the rows the ticks reached").toBeGreaterThan(crossed);
    } finally {
      copyText.mockRestore();
      vi.useRealTimers();
    }
  });
});
