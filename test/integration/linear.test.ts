// C22 §6m — a session on the linear route, bytes in through stdin (§107, ruling 29).
//
// **Bytes in, bytes out.** The route is chosen by the environment, as a reader
// would choose it, and every assertion reads what reached the terminal — the
// stream is the interface, so a row that read a store would test the mechanism
// and miss the rendering.
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin, MODES } from "../support/fake-terminal.js";

const ESC = "\u001b";
const ENV = { TERM: "xterm-256color", LANG: "en_GB.UTF-8", CALCIUM_RENDER_MODE: "linear" };

/** A verb that asks §6m.3's question and says what it was told. */
const asking = async (_argv: readonly string[], ctx: { ask: (o: unknown) => Promise<{ key: string; text?: string }> }) => {
  // After a moment, so the reader has typed a draft by the time it asks.
  await new Promise((r) => setTimeout(r, 100));
  const a = await ctx.ask({
    question: "which branch?",
    choices: [
      { key: "a", label: "feat/c26" },
      { key: "b", label: "main", default: true },
      { key: "r", label: "reply…", reply: true },
    ],
  });
  return { schema: "tui.view/1", status: "ok", blocks: [{ kind: "tip", id: "chose", text: `chose ${a.text ?? a.key}` }] };
};

async function linear(size = { columns: 60, rows: 24 }, route: "linear" | "rich" = "linear") {
  vi.useFakeTimers();
  const stdin = fakeStdin();
  const session = await buildSession(
    {
      stdin: stdin as never,
      env: route === "linear" ? ENV : { TERM: ENV.TERM, LANG: ENV.LANG },
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "branch", local: true, summary: "pick a branch", args: [], flags: [] }],
      },
      localHandlers: { branch: asking },
    } as never,
    size,
  );
  const step = async (ms = 0): Promise<void> => {
    session.clock.advance(ms);
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  };
  /** One key at a time, as a reader types — a chunk would redraw once. */
  const type = async (text: string): Promise<void> => {
    for (const ch of text) {
      stdin.emit(ch);
      await step();
    }
  };
  await step();
  const since = (mark: number): string => session.stdout.output.slice(mark);
  /**
   * The lines written. **An erase ends a line as a newline does** — each redraw
   * of the input line is its own line, and one that is not split off reads as
   * the prefix of the event after it. Caret moves are read out.
   */
  const lines = (bytes: string): string[] =>
    bytes
      .split(/\r\n|\r\u001b\[2K/u)
      .map((l) => l.replace(/\u001b\[\d+G/gu, ""))
      .filter((l) => l !== "");
  return { ...session, stdin, step, type, since, lines };
}

describe("C22 §6m — a linear session", () => {
  it("T4.102 (C22 I119, C22 I120, C22 I123, C01 I22): no frame, ruling 29's lines, the input line erased and redrawn", async () => {
    const s = await linear();
    try {
      // C01 I22 — none of a frame's modes, and paste still taken.
      const opened = s.stdout.output;
      for (const never of [MODES.altScreenOn, MODES.mouseOn, MODES.cursorHide, MODES.syncOn]) {
        expect(opened, `no ${JSON.stringify(never)}`).not.toContain(never);
      }
      expect(opened).toContain(MODES.pasteOn);

      // C22 I123 — a draft is the one line edited in place: erased, rewritten, the
      // caret put back by column, and never a row addressed.
      const typed = s.stdout.output.length;
      await s.type("abc");
      const drawn = s.since(typed);
      expect(drawn.endsWith(`\r${ESC}[2K> abc${ESC}[6G`), "the line, and the caret after `c`").toBe(true);
      expect(drawn, "no cursor-addressed repaint").not.toMatch(/\u001b\[\d+;\d+H/u);
      // **A commit that changes nothing writes nothing.**
      const still = s.stdout.output.length;
      await s.step(200);
      expect(s.since(still), "an idle commit").toBe("");

      // C22 I120 — a local verb settles at once: its start and completion as one
      // event, then the body; and the draft typed before it comes back after.
      await s.type("\u007f\u007f\u007f/capabilities\r");
      await s.step(50);
      const mark = s.stdout.output.length;
      await s.type("xy");
      const out = s.lines(s.stdout.output.slice(0, mark));
      const at = out.indexOf("entry 1 of 1: /capabilities");
      expect(at, "the start").toBeGreaterThan(-1);
      expect(out.slice(at, at + 4)).toEqual([
        "entry 1 of 1: /capabilities",
        "entry 1: /capabilities — succeeded, 11 rows",
        "table",
        "field  value  source",
      ]);
      expect(s.since(mark).endsWith(`> xy${ESC}[5G`), "the input line after the event").toBe(true);

      // C22 I119 — a resize writes no frame: at most the line, and here it fits.
      const before = s.stdout.output.length;
      s.resize({ columns: 40, rows: 10 });
      await s.step();
      expect(s.lines(s.since(before)).every((l) => l === "> xy"), "only the input line").toBe(true);
    } finally {
      vi.useRealTimers();
    }

    // C22 I119 — and **opened** below the rich route's 60 × 16 floor, linear opens:
    // the gate at open is a second site, and the resize above cannot reach it.
    const small = await linear({ columns: 40, rows: 10 });
    try {
      expect(small.stdout.output, "no fallback").not.toMatch(/too small/iu);
      await small.type("ok");
      expect(small.stdout.output.endsWith(`> ok${ESC}[5G`), "the input line, drawn").toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.103 (C22 I122, C22 I124, C16 I44): a numbered question, its guard stated, answered by its number", async () => {
    const s = await linear();
    try {
      // Submitting takes the line (C23 I28); what is typed while the verb runs
      // is the draft the question must hold and give back.
      await s.type("/branch\r");
      await s.type("abc");
      await s.step(150);
      const asked = s.lines(s.stdout.output);
      expect(asked, "the numbered line").toContain("question: which branch? 1 feat/c26, 2 main, 3 reply…");
      // C16 I44 — a key held across the question's arrival must not answer
      // it, and in linear the cue is the only place that can say so.
      const cue = "answer 1 to 3 (ready in a moment): ";
      expect(s.stdout.output.endsWith(`\r\n${cue}${ESC}[${String(cue.length + 1)}G`), "the cue, armed").toBe(true);

      // The first `2` is refused, and the refusal is the cue losing its clause.
      const refused = s.stdout.output.length;
      await s.type("2");
      await s.step(50);
      expect(s.lines(s.since(refused)), "refused, and said so").toEqual(["answer 1 to 3: "]);

      // `2` answers the second choice — not `b`, which is main's own key.
      const mark = s.stdout.output.length;
      await s.type("2");
      await s.step(50);
      const answered = s.lines(s.since(mark));
      expect(answered[0]).toBe("answer: main");
      expect(answered, "and the verb read it").toContain("note: chose b");
      expect(s.stdout.output.endsWith(`> abc${ESC}[6G`), "the draft given back, caret where it was").toBe(true);
    } finally {
      vi.useRealTimers();
    }

    // C22 I122 — **the number is linear's.** The same question on the rich route,
    // where no number is drawn: `2` answers nothing, twice over so the guard
    // is not what refused it, and `b` — main's own key — still does.
    const rich = await linear(undefined, "rich");
    try {
      await rich.type("/branch\r");
      await rich.step(150);
      await rich.type("22");
      await rich.step(50);
      expect(rich.stdout.output, "a digit answered nothing").not.toContain("chose");
      await rich.type("b");
      await rich.step(50);
      expect(rich.stdout.output, "the question was open, and its own key answers it").toContain("chose b");
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.104 (C22 I125, C02 I15): /capabilities shows the route first", async () => {
    const s = await linear();
    try {
      await s.type("/capabilities\r");
      await s.step(50);
      const out = s.lines(s.stdout.output);
      const header = out.indexOf("field  value  source");
      expect(out[header + 1], "the route, stated by the environment").toBe("renderMode  linear  stated");
      // Every field after it, each with its source.
      const fields = out.slice(header + 1, header + 12).map((l) => l.split("  ")[0]);
      expect(fields).toEqual([
        "renderMode",
        "colourDepth",
        "unicode",
        "ambiguousWidth",
        "backgroundPolarity",
        "synchronisedUpdate",
        "bracketedPaste",
        "mouse",
        "imageProtocol",
        "keyboardProtocol",
        "altScreen",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
