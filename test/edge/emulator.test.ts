// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9), tier 3.
import { describe, expect, it } from "vitest";

import { createEmulator } from "../../src/data/emulator/emulator.js";
import { cells } from "../../src/presentation/text.js";
import { readFileSync } from "node:fs";

import { b } from "../../src/shell/builders/index.js";
import {
  ASCII_CAPS,
  FULL_CAPS,
  MONO_CAPS,
  MONO_UNICODE_CAPS,
  measurable,
  visible,
} from "../support/render.js";

const feed = async (
  term: ReturnType<typeof createEmulator>,
  ...chunks: readonly (string | Uint8Array)[]
): Promise<void> => {
  for (const chunk of chunks) await term.write(chunk);
};

describe("C27 terminal emulator — tier 3", () => {
  it("T3.1 (C27 I6): a wide cluster at the last column wraps rather than splitting", async () => {
    const term = createEmulator({ cols: 6, rows: 4 });
    await feed(term, "abcde漢");
    const lines = term.snapshot("t").lines;
    expect(lines[0]?.text).toBe("abcde");
    expect(lines[1]?.text).toBe("漢");
    for (const line of lines) expect(cells(line.text)).toBeLessThanOrEqual(6);
    term.dispose();
  });

  it("T3.2 (C27 I9): an unknown DCS and an unknown CSI change no cell", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await feed(term, "one \u001bPunknown\u001b\\\u001b[?9999ztwo");
    expect(term.snapshot("t").lines[0]?.text).toBe("one two");
    term.dispose();
  });

  it("T3.3 (C27 I4): a chunk split inside an escape is still one run", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await feed(term, "\u001b[3", "1mred\u001b[0m");
    const line = term.snapshot("t").lines[0];
    expect(line?.text).toBe("red");
    expect(line?.runs).toEqual([{ from: 0, to: 3, fg: { kind: "ansi16", index: 1 } }]);
    term.dispose();
  });

  it("T3.4 (C27 I4): a chunk split inside a wide cluster's bytes yields one character", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    const bytes = new TextEncoder().encode("漢");
    await feed(term, bytes.slice(0, 2), bytes.slice(2));
    expect(term.snapshot("t").lines[0]?.text).toBe("漢");
    term.dispose();
  });

  it("T3.5 (C27 I7): scrollback 0 keeps at most the screen", async () => {
    const term = createEmulator({ cols: 20, rows: 4, scrollback: 0 });
    for (let i = 1; i <= 12; i += 1) await term.write(`line ${String(i)}\r\n`);
    const snap = term.snapshot("t");
    expect(snap.lines.length).toBeLessThanOrEqual(4);
    expect(term.dropped).toBeGreaterThan(0);
    term.dispose();
  });

  it("T3.6 (C27 I12): write after dispose throws, naming dispose", async () => {
    const term = createEmulator({ cols: 10, rows: 2 });
    await term.write("x");
    term.dispose();
    await expect(term.write("y")).rejects.toThrow(/dispose/u);
  });

  it("T3.7 (C27 I12): snapshot after dispose throws rather than returning the last value", async () => {
    const term = createEmulator({ cols: 10, rows: 2 });
    await term.write("x");
    term.dispose();
    expect(() => term.snapshot("t")).toThrow(/dispose/u);
    expect(() => {
      term.resize(20, 2);
    }).toThrow(/dispose/u);
  });

  it("T3.8 (C27 I4): a grid with nothing drawn is rows of empty lines", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await feed(term, "\u001b[?1049h");
    const snap = term.snapshot("t");
    expect(snap.screen).toBe("grid");
    expect(snap.lines).toHaveLength(4);
    expect(snap.lines.every((l) => l.text === "" && l.runs === undefined)).toBe(true);
    term.dispose();
  });

  it("T3.9 (C27 I10): a resize to the same size changes nothing", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await feed(term, "content\r\n");
    const before = term.snapshot("t");
    term.resize(20, 4);
    expect(term.snapshot("t")).toEqual(before);
    term.dispose();
  });

  it("T3.10 (C27 I3): a hundred unawaited writes all land, in order", async () => {
    const term = createEmulator({ cols: 20, rows: 4, scrollback: 200 });
    const writes = [];
    for (let i = 0; i < 100; i += 1) writes.push(term.write(`line ${String(i)}\r\n`));
    await Promise.all(writes);
    const texts = term.snapshot("t").lines.map((l) => l.text);
    expect(texts[0]).toBe("line 0");
    expect(texts[99]).toBe("line 99");
    term.dispose();
  });

  it("T3.11 (C27 I2): a lone surrogate becomes the ASCII stand-in", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await feed(term, `a${String.fromCharCode(0xd800)}b`);
    const text = term.snapshot("t").lines[0]?.text ?? "";
    for (let i = 0; i < text.length; i += 1) {
      const unit = text.charCodeAt(i);
      expect(unit >= 0xd800 && unit <= 0xdfff).toBe(false);
    }
    term.dispose();
  });
});

describe("C04 — the terminal kind, spec-first rows", () => {
  it.todo("T3.78 (C04 I112): a terminal measures the same with cursor present and absent at every position; a cursor naming a missing line or a column at cols is refused — not deferred on a component: lands with the Terminal type");
  it.todo("T3.79 (C04 I110): text ending mid-surrogate is refused as malformed; a line of only styled blanks is admitted — not deferred on a component: lands with the Terminal type");
});

describe("C09 · C10 — the terminal block and a literal colour", () => {
  it("T3.73 (C09 I56): the definition strips nothing", () => {
    const code = readFileSync("src/presentation/blocks/kinds/terminal.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/[^\n]*/gu, "");
    expect(code).not.toContain("stripControl");
    // And the text it is handed reaches the frame: the ASCII stand-in the
    // emulator writes is a character like any other here.
    const painted = measurable({}).renderToLines(b.terminal(20, [{ text: "a?b" }]), 20);
    expect(visible(painted[0] ?? "")).toContain("a?b");
  });

  it("T3.74 (C09 I56): the cursor cell is inverse at every arm", () => {
    const block = b.terminal(20, [{ text: "abc" }], { cursor: { line: 0, col: 1 } });
    for (const capabilities of [FULL_CAPS, ASCII_CAPS, MONO_CAPS, MONO_UNICODE_CAPS]) {
      const line = measurable({ capabilities }).renderToLines(block, 20)[0] ?? "";
      // SGR 7 is the mark, and at 1-bit it is the only one distinguishing the
      // cell — a colour would have gone.
      expect(line, JSON.stringify(capabilities.colourDepth)).toMatch(/\u001b\[(?:[0-9;]*;)?7(?:;[0-9;]*)?m/u);
    }
  });

  it("T3.72 (C10 I38): at 1-bit the attributes stay and the colour goes", () => {
    const block = b.terminal(20, [
      {
        text: "loud",
        runs: [
          {
            from: 0,
            to: 4,
            fg: { kind: "rgb", hex: "#0ac81e" },
            bold: true,
            italic: true,
            underline: true,
            inverse: true,
          },
        ],
      },
    ]);
    const line = measurable({ capabilities: MONO_CAPS }).renderToLines(block, 20)[0] ?? "";
    expect(line).not.toMatch(/38;[25]/u);
    for (const attribute of ["1", "3", "4", "7"]) {
      expect(line, attribute).toMatch(new RegExp(`\\u001b\\[(?:[0-9;]*;)?${attribute}(?:;[0-9;]*)?m`, "u"));
    }
  });
});

describe("C21 — the PTY port, spec-first rows", () => {
  it.todo("T3.19 (C21 I16): spawnPty throwing leaves no child, no handle and no listener, with the factory spy never called — not deferred on a component: lands with spawnPty");
});

describe("C23 — the shell route as a live screen, spec-first rows", () => {
  it.todo("T3.62 (C23 I66): a running shell command then the ladder's first rung → the child receives SIGINT, the card settles cancelled, and the block holds the lines written before the press — the row F844 was written for — not deferred on a component: lands with the route's cancel");
  it.todo("T3.63 (C23 I63): a spawnPty that throws → the card settles failed naming the error and spawnShell is never called — not deferred on a component: lands with the route's arm choice");
});
