// C09 I131, §7d — the trust boundary at the writer: a whole session frame's bytes.
//
// **Bytes in, bytes out.** The registry's sweep reads a block's rendered lines;
// this reads what the session wrote to the terminal, chrome and heads and the
// error box included, because a field that reaches the frame through a path the
// registry does not draw is invisible to every row above the writer.
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const ESC = "\u001b";
const BEL = "\u0007";
const C1_CSI = "\u009b";
const RLO = "\u202e";

/**
 * The payload's discriminators: sequences the writer's vocabulary has no member
 * for. OSC 52 writes the reader's clipboard, OSC 0 sets the title by a door the
 * writer never uses (it writes OSC 2), and `CSI 6 n` asks the terminal a
 * question whose answer arrives as typed input.
 */
const PAYLOAD = `${ESC}]52;c;cHduZWQ=${BEL}${ESC}]0;owned${BEL}${ESC}[6n${C1_CSI}31m${RLO}evil`;

/**
 * **`terminal/escapes.ts`'s vocabulary, as shapes** — every sequence it can
 * produce: SGR, the DEC modes, cursor position and column, erase line and
 * display, the cursor shape, the title stack, the kitty keyboard pair, and OSC 2
 * and OSC 9 terminated by `BEL`. Anchored at the ESC being read (`y`).
 */
const VOCABULARY: readonly RegExp[] = [
  /\u001b\[[0-9;]*m/y,
  /\u001b\[\?[0-9;]+[hl]/y,
  /\u001b\[[0-9;]*[HG]/y,
  /\u001b\[2[JK]/y,
  /\u001b\[[0-9]+ q/y,
  /\u001b\[2[23];2t/y,
  /\u001b\[(?:>3u|<u)/y,
  /\u001b\][29];[^\u0000-\u001f\u007f-\u009f]*\u0007/y,
];

/** Every ESC in `bytes` that does not open a vocabulary sequence, with a little context. */
function strangers(bytes: string): string[] {
  const out: string[] = [];
  for (let at = bytes.indexOf(ESC); at >= 0; at = bytes.indexOf(ESC, at + 1)) {
    const known = VOCABULARY.some((shape) => {
      shape.lastIndex = at;
      return shape.test(bytes);
    });
    if (!known) out.push(JSON.stringify(bytes.slice(at, at + 16)));
  }
  return out;
}

describe("C09 §7d — the writer", () => {
  it("T4.107 (C09 I131, C09 I127, R-TRU-001): every ESC a poisoned session writes opens a sequence of escapes.ts's vocabulary, no C1 is written, and raw bidi only on the typed line", async () => {
    vi.useFakeTimers();
    const stdin = fakeStdin();
    const tool = (name: string) => ({ name, local: true, summary: name, args: [], flags: [] });
    const show = () =>
      Promise.resolve({
        schema: "tui.view/1",
        status: "ok",
        blocks: [
          { kind: "raw", id: "r", text: `raw ${PAYLOAD}` },
          {
            kind: "patch",
            id: "p",
            path: `src/a${PAYLOAD}.ts`,
            language: "typescript",
            hunks: [{ header: `@@ -1 +1 @@ ${PAYLOAD}`, lines: [{ kind: "add", text: `line ${PAYLOAD}`, newNo: 1 }] }],
          },
          {
            kind: "table",
            id: "t",
            columns: [{ key: "name", label: `Name ${PAYLOAD}` }],
            rows: [{ id: "r1", cells: { name: { text: `cell ${PAYLOAD}` } } }],
          },
        ],
      });
    const boom = () => Promise.reject(new Error(`failed ${PAYLOAD}`));
    const s = await buildSession(
      {
        stdin: stdin as never,
        env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8", COLORTERM: "truecolor" },
        manifest: { schema: "tui.manifest/1", binary: "prism", version: "1.0.0", tools: ["show", "boom"].map(tool) },
        localHandlers: { show, boom },
      } as never,
      { columns: 120, rows: 60 },
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
    // **A typed command carrying an override** — the one byte a reader's own
    // keyboard can put in a head, since the decoder drops C0 and C1 on input.
    await type(`/show ${RLO}gpj.exe\r`);
    await type("/boom\r");
    await step();
    const bytes = s.stdout.output;
    vi.useRealTimers();

    // **The control first** (`test/support/README.md`): the payload arrived and
    // was drawn, as text. Without this, a session that drew nothing reads clean.
    expect(bytes, "the payload reached the frame, shown as an escape").toContain("^[]52;c;cHduZWQ=^G");
    expect(bytes, "the typed override reached the head, shown").toContain("<U+202E>gpj.exe");
    expect(bytes, "the error's message reached the frame").toContain("failed ^[]52;");

    expect(strangers(bytes), "an ESC opening a sequence outside the writer's vocabulary").toEqual([]);
    const c1 = [...bytes].filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp >= 0x80 && cp <= 0x9f;
    });
    expect(c1.map((ch) => (ch.codePointAt(0) ?? 0).toString(16)), "a C1 code point in the written bytes").toEqual([]);
    // **Raw bidi only on the reader's own typed line** (C09 I131's stated
    // exception). The prompt being edited and the command echo `commandRows`
    // draws both write the typed text unneutralised; neither is a block, so the
    // registry never sees them. Each raw character is attributed to the row it
    // was written on — the text since the last cursor move — and **the set of
    // sites is compared by equality**, so the day the typed line is neutralised
    // this row fails and asks to be tightened to *none*.
    const sites = new Set<string>();
    for (const hit of bytes.matchAll(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu)) {
      const at = hit.index;
      const moved = Math.max(bytes.lastIndexOf("H", at), bytes.lastIndexOf("G", at));
      const row = bytes.slice(moved + 1, at).replace(/\u001b\[[0-9;]*m/gu, "");
      sites.add(row.startsWith("\u276f /show ") ? "the typed line" : `elsewhere: ${JSON.stringify(row.slice(-40))}`);
    }
    expect([...sites], "raw bidi written somewhere other than the reader's own typed line").toEqual(["the typed line"]);
    for (const needle of [`${ESC}]52`, `${ESC}]0;`, `${ESC}[6n`]) {
      expect(bytes.includes(needle), `${JSON.stringify(needle)} written`).toBe(false);
    }
  });
});
