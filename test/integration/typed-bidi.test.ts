// C17 I36, C22 I33, §5g — the reader's own bidi characters, read through a terminal.
//
// **Read by an emulator, not by a model of one.** `screen.ts` folds code units
// onto a grid, which is exactly the reading that cannot see this defect: a raw
// U+2066 is one code unit to it and a cell of its own to xterm, where `cells()`
// says zero (F1403). So the bytes go through `@xterm/headless` and the row and
// the cursor are the emulator's.
import xterm from "@xterm/headless";
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

// Escapes, never literals (A03 SS69).
const LRI = "\u2066";
const RLO = "\u202e";
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const LEFT = "\u001b[D";
const COLUMNS = 80;
const ROWS = 24;

/** Every row the emulator holds after `bytes`, and where it left the cursor. */
async function read(bytes: string): Promise<{ rows: string[]; cursor: { x: number; y: number } }> {
  const term = new xterm.Terminal({ cols: COLUMNS, rows: ROWS, allowProposedApi: true });
  await new Promise<void>((done) => term.write(bytes, done));
  const buf = term.buffer.active;
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y += 1) rows.push(buf.getLine(buf.baseY + y)?.translateToString(true) ?? "");
  const cursor = { x: buf.cursorX, y: buf.cursorY };
  term.dispose();
  return { rows, cursor };
}

describe("C17 §5g — the typed line through a terminal", () => {
  it("T4.10 (C17 I36, C22 I33, C09 I131): through a built session read by @xterm/headless, the prompt row and the echo draw the forms of U+2066 and U+202E, the cursor stands either side of each, and the verb is handed both raw", async () => {
    // **The bytes are taken under fake timers and read under real ones**: the
    // emulator parses on its own timer, and a fake clock never fires it.
    const taken: string[] = [];
    const handed: { argv: readonly string[]; command: string }[] = [];
    const typed = `/show a${LRI}b${RLO}c`;
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const show = (argv: readonly string[], ctx: { command: string }) => {
        handed.push({ argv, command: ctx.command });
        return { schema: "tui.view/1", status: "ok", blocks: [{ kind: "raw", id: "r", text: "shown" }] };
      };
      const s = await buildSession(
        {
          stdin: stdin as never,
          env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8", COLORTERM: "truecolor" },
          manifest: {
            schema: "tui.manifest/1",
            binary: "prism",
            version: "1.0.0",
            tools: [{ name: "show", local: true, summary: "show", args: [], flags: [] }],
          },
          localHandlers: { show },
        } as never,
        { columns: COLUMNS, rows: ROWS },
      );
      const step = async (): Promise<void> => {
        await vi.advanceTimersByTimeAsync(50);
        for (let i = 0; i < 4; i += 1) await Promise.resolve();
      };
      const type = async (text: string): Promise<void> => {
        for (const ch of text) {
          stdin.emit(ch);
          await step();
        }
      };
      await step();
      await type(typed);
      taken.push(s.stdout.output);
      for (let i = 0; i < 4; i += 1) {
        stdin.emit(LEFT);
        await step();
        taken.push(s.stdout.output);
      }
      stdin.emit("\r");
      await step();
      await step();
      taken.push(s.stdout.output);
    } finally {
      vi.useRealTimers();
    }

    {
      // **The prompt row, as the terminal holds it.**
      const typing = await read(taken[0] ?? "");
      const prompt = typing.rows[typing.cursor.y] ?? "";
      expect(prompt, "the cursor's row is the prompt, and it shows both forms").toContain("/show a<U+2066>b<U+202E>c");
      expect(BIDI.test(prompt), "and carries neither character").toBe(false);
      const lri = prompt.indexOf("<U+2066>");
      const rlo = prompt.indexOf("<U+202E>");
      expect(typing.cursor.x, "at the end, past `c`").toBe(rlo + 9);

      // **The cursor either side of each character**, moved by the reader's key.
      const stops: number[] = [];
      for (const bytes of taken.slice(1, 5)) {
        const now = await read(bytes);
        expect(now.cursor.y, "still on the prompt row").toBe(typing.cursor.y);
        stops.push(now.cursor.x);
      }
      expect(stops, "after U+202E, on its `<`, after U+2066, on its `<`").toEqual([rlo + 8, rlo, lri + 8, lri]);

      // **The echo**, above the entry once the line is submitted.
      const after = await read(taken[5] ?? "");
      const echo = after.rows.find((r) => r.includes("\u276f /show a"));
      expect(echo, "the echo row").toBeDefined();
      expect(echo, "the echo shows both forms").toContain("/show a<U+2066>b<U+202E>c");
      expect(after.rows.some((r) => BIDI.test(r)), "no row of the screen carries a bidi character").toBe(false);

      // **The command is the reader's** (§5g row 8): handed to the verb raw.
      expect(handed.map((h) => h.command), "the verb's command, as typed").toEqual([typed]);
      expect(handed[0]?.argv.join(" "), "and its argument").toBe(`a${LRI}b${RLO}c`);
    }
  });
});
