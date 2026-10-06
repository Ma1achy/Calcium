// C14 I57 and I58 — the reserved column and the rail, through a session.
//
// **The chain, not the mechanism**: the frame's geometry, the viewport's
// width, the wash and the pointer are four components, and each passes alone
// with the column unreserved or the translation missing.
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { styledScreenFrom } from "../support/styled-screen.js";
import { BODY_INDENT } from "../../src/shell/entry-layout.js";
import type { TuiConfig } from "../../src/shell/types.js";

const ESC = "\u001b";
const settle = async (): Promise<void> => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};
/** SGR 1006, 1-based on the wire; the decoder hands L4 a 0-based column. */
const click = (col0: number, row0: number): string =>
  `${ESC}[<0;${String(col0 + 1)};${String(row0 + 1)}M${ESC}[<0;${String(col0 + 1)};${String(row0 + 1)}m`;

const COLUMNS = 80;
/** The transcript at 80: the terminal less the margin and the rail (C14 I57). */
const TRANSCRIPT = 78;
const BODY = TRANSCRIPT - BODY_INDENT;

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [
    { name: "pick", local: true, summary: "a choice and two notices", args: [], flags: [] },
    { name: "rows", local: true, summary: "a table of three", args: [], flags: [] },
  ],
};
const HANDLERS: NonNullable<TuiConfig["localHandlers"]> = {
  pick: () =>
    ({
      schema: "tui.view/1",
      command: "pick",
      status: "ok",
      blocks: [
        // Exactly the body's width, and one more: the first fits on one row at
        // 78 and would at 79; the second wraps at 78 and would not at 79.
        { kind: "notice", id: "a", tone: "info", text: "A".repeat(BODY) },
        { kind: "notice", id: "b", tone: "info", text: "B".repeat(BODY + 1) },
        { kind: "choice", id: "c", exclusive: true, options: [{ id: "x", label: "alpha" }, { id: "y", label: "beta" }] },
      ],
    }) as never,
  rows: () =>
    ({
      schema: "tui.view/1",
      command: "rows",
      status: "ok",
      blocks: [
        {
          kind: "table",
          id: "t",
          columns: [{ key: "name", label: "Name", align: "left", priority: 10, minWidth: 12, sortable: false }],
          rows: ["alpha", "beta", "gamma"].map((n) => ({ id: n, cells: { name: { text: `${n}-row` } } })),
        },
      ],
    }) as never,
};

describe("C14 §6d — the rail, in a session", () => {
  it("T4.39 (C14 I57, I58, C22 I109): column 0 is reserved on every transcript row, the rail marks the selected block's first row, and the pointer is translated by the column", async () => {
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const size = { columns: COLUMNS, rows: 22 };
      const { screen, clock, stdout } = await buildSession({ manifest: MANIFEST, localHandlers: HANDLERS, stdin: stdin as never }, size);
      const step = async (ms = 0): Promise<void> => {
        clock.advance(ms);
        await vi.advanceTimersByTimeAsync(ms);
        await settle();
      };
      const styled = () => styledScreenFrom(stdout.chunks, size);
      await step();
      stdin.emit("/pick\r");
      await step();

      const rows = screen().rows;
      const rules = rows.flatMap((r, i) => (/^─+$/u.test(r.trim()) ? [i] : []));
      const [top, bottom] = [rules[0]! + 1, rules.at(-2)!];
      const transcript = rows.slice(top, bottom);

      // **Column 0 is blank on every transcript row** — the echo, the head,
      // the body and the blank rows above — and the head's mark is in column 1.
      expect(transcript.map((r) => r[0]), "column 0 of every transcript row").toEqual(transcript.map(() => " "));
      expect(rows.find((r) => r.includes("● pick"))?.indexOf("● pick"), "the head mark in column 1").toBe(1);
      expect(rows.find((r) => r.includes("/pick"))?.indexOf("❯ /pick"), "the echo in column 1").toBe(1);
      expect(rows[bottom + 1]?.indexOf("❯"), "the prompt's ❯ in column 0").toBe(0);

      // **The transcript is 78 wide.** `BODY` cells fit a card's body on one
      // row, ending at column 78; one more wraps. At 79 neither would wrap.
      const aRows = rows.filter((r) => r.includes("A".repeat(10)));
      expect(aRows, "exactly the body's width is one row").toHaveLength(1);
      expect(aRows[0]!.lastIndexOf("A"), "and it ends in the last transcript column").toBe(COLUMNS - 2);
      expect(rows.filter((r) => r.includes("B")).length, "one more wraps").toBe(2);

      // **The prompt keeps the content width**, 79: the gutter takes two and the
      // cursor's cell one (C17), so 76 typed cells fit one row and 77 do not. At
      // the transcript's 78 the break would be one cell earlier.
      const promptRows = (): number => {
        const rs = screen().rows;
        const rr = rs.flatMap((r, i) => (/^─+$/u.test(r.trim()) ? [i] : []));
        return rr.at(-1)! - rr.at(-2)! - 1;
      };
      stdin.emit("x".repeat(76));
      await step();
      expect(promptRows(), "76 typed cells are one prompt row").toBe(1);
      stdin.emit("x");
      await step();
      expect(promptRows(), "77 are two").toBe(2);
      stdin.emit("\u0015"); // ⌃U — the prompt back to empty
      await step();

      // **The pointer is translated by the column.** `beta`'s first cell is in
      // terminal column `c`, so its element begins at transcript column `c − 1`.
      // A press on `c − 1` is on the gap before it and focuses nothing; the
      // untranslated pointer would read it as `beta`'s first cell.
      const choiceRow = screen().rows.findIndex((r) => r.includes("○ beta"));
      const c = screen().rows[choiceRow]!.indexOf("○ beta");
      const grounded = (): readonly number[] =>
        styled()[choiceRow]!.flatMap((cell, i) => (cell.style.bg === "" ? [] : [i]));
      expect(grounded(), "nothing is focused yet").toEqual([]);
      stdin.emit(click(c - 1, choiceRow));
      await step();
      expect(grounded(), "a press on the gap focuses nothing").toEqual([]);
      stdin.emit(click(c, choiceRow));
      await step();
      expect(grounded(), "a press on beta's first cell focuses beta, and only beta").toEqual(
        Array.from({ length: "○ beta".length }, (_, i) => c + i),
      );
      // A press on column 0 is on no element: focus stays where it was.
      stdin.emit(click(0, choiceRow));
      await step();
      expect(grounded(), "column 0 is the rail's, not a block's").toEqual(
        Array.from({ length: "○ beta".length }, (_, i) => c + i),
      );

      // **The rail**: into semantic copy mode, one block selected.
      const before = screen().rows.slice(top, bottom).map((r) => r.slice(1));
      stdin.emit(`${ESC}V`);
      await step();
      stdin.emit(`${ESC}[1;2A`);
      await step();
      const now = screen().rows;
      const railed = now.flatMap((r, i) => (i >= top && i < bottom && r[0] !== " " ? [i] : []));
      expect(railed, "one row takes the rail").toHaveLength(1);
      expect(now[railed[0]!]![0], "and it is the rail").toBe("▌");
      expect(now[railed[0]!]!.slice(1, 3), "the selected row's own lead is untouched").not.toContain("▌");
      const g = styled();
      expect(g[railed[0]!]![0]!.style.attrs, "the rail is never inverse").not.toContain(7);
      expect(g[railed[0]!]![1]!.style.bg, "the row beside it is washed").not.toBe("");
      // The block rows themselves are unchanged by the mode: the rail is beside them.
      expect(now.slice(top, bottom).map((r) => r.slice(1)), "column 1 onward is the same document").toEqual(before);

      stdin.emit(ESC);
      await step(100);
      stdin.emit(ESC);
      await step(100);
      expect(screen().rows.slice(top, bottom).map((r) => r[0]), "leaving clears the rail").toEqual(transcript.map(() => " "));

      // **An element selection takes the rail too** (C14 I58): C11 washes the
      // table's rows and knows nothing of the frame, so the rail beside them is
      // the frame's, from the entry's elements. A fresh session, since focus is
      // in the choice above: ↓ onto the card's head, ⇧↓ twice — the head and
      // the first two rows, the extent C26 I16 names.
      const stdin2 = fakeStdin();
      const second = await buildSession({ manifest: MANIFEST, localHandlers: HANDLERS, stdin: stdin2 as never }, { columns: COLUMNS, rows: 22 });
      const step2 = async (): Promise<void> => {
        await vi.advanceTimersByTimeAsync(0);
        await settle();
      };
      await step2();
      stdin2.emit("/rows\r");
      await step2();
      expect(second.screen().rows.some((r) => r[0] === "▌"), "no rail before a selection").toBe(false);
      stdin2.emit(`${ESC}[B`);
      await step2();
      stdin2.emit(`${ESC}[1;2B`);
      await step2();
      stdin2.emit(`${ESC}[1;2B`);
      await step2();
      const led = second.screen().rows.flatMap((r) => (r[0] === "▌" ? [r.slice(1).trim()] : []));
      expect(led.map((r) => /● rows|(alpha|beta|gamma)-row/u.exec(r)?.[0]), "the head and two rows, and nothing else").toEqual([
        "● rows",
        "alpha-row",
        "beta-row",
      ]);
      expect(led.find((r) => r.includes("beta"))?.includes("▸") ?? false, "the focused row keeps its mark").toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
