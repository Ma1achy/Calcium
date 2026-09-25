// C22 §6n — notifications, bytes in through stdin (ruling 27, `R-NTF-001`).
//
// **Bytes in, bytes out**, as §6m's rows: the reader's opt-in is the
// environment, a focus report is the terminal's own `ESC [ O`, and every
// assertion reads what reached the terminal.
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const ESC = "\u001b";
const BEL = "\u0007";
const FOCUS_ON = `${ESC}[?1004h`;
const PUSH = `${ESC}[22;2t`;
const POP = `${ESC}[23;2t`;
const OUT = `${ESC}[O`;
const IN = `${ESC}[I`;

const wait = (ms: number) => async () => {
  await new Promise((r) => setTimeout(r, ms));
  return { schema: "tui.view/1", status: "ok", blocks: [{ kind: "tip", id: "t", text: "done" }] };
};
const asking = async (_argv: readonly string[], ctx: { ask: (o: unknown) => Promise<unknown> }) => {
  await ctx.ask({ question: "which branch?", choices: [{ key: "a", label: "main", default: true }] });
  return { schema: "tui.view/1", status: "ok", blocks: [] };
};

async function session(notify: string | undefined) {
  vi.useFakeTimers();
  const stdin = fakeStdin();
  const tool = (name: string) => ({ name, local: true, summary: name, args: [], flags: [] });
  const s = await buildSession(
    {
      stdin: stdin as never,
      env: {
        TERM: "xterm-256color",
        LANG: "en_GB.UTF-8",
        TERM_PROGRAM: "WezTerm",
        ...(notify === undefined ? {} : { CALCIUM_NOTIFY: notify }),
      },
      manifest: { schema: "tui.manifest/1", binary: "prism", version: "1.0.0", tools: ["slow", "quick", "branch"].map(tool) },
      localHandlers: { slow: wait(45_000), quick: wait(2_000), branch: asking },
    } as never,
    { columns: 80, rows: 24 },
  );
  const step = async (ms = 0): Promise<void> => {
    s.clock.advance(ms);
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  };
  const send = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await step();
  };
  /** One key at a time, as a reader types. */
  const type = async (text: string): Promise<void> => {
    for (const ch of text) await send(ch);
  };
  const since = (mark: number): string => s.stdout.output.slice(mark);
  await step();
  return { ...s, step, send, type, since };
}

/** The same keystrokes, with or without the reader's opt-in. */
async function script(s: Awaited<ReturnType<typeof session>>) {
  const marks: Record<string, string> = {};
  // A long settle before any focus report: never reported is focused.
  await s.type("/slow\r");
  let at = s.stdout.output.length;
  await s.step(45_000);
  marks.beforeFocus = s.since(at);

  await s.send(OUT);
  at = s.stdout.output.length;
  await s.type("/slow\r");
  await s.step(45_000);
  marks.long = s.since(at);

  at = s.stdout.output.length;
  await s.type("/quick\r");
  await s.step(2_000);
  marks.short = s.since(at);

  at = s.stdout.output.length;
  await s.type("/slow\r");
  await s.step(45_000);
  marks.second = s.since(at);

  at = s.stdout.output.length;
  await s.send(IN);
  marks.back = s.since(at);

  await s.send(OUT);
  at = s.stdout.output.length;
  await s.type("/branch\r");
  await s.step(50);
  marks.question = s.since(at);
  return marks;
}

describe("C22 §6n — a session that reaches a reader who left", () => {
  it("T4.105 (C22 I126, C22 I127, C22 I128, C22 I129, C01 I23, C01 I24, C16 I61, C02 I16, C02 I17): the rungs, the focus gate and the title stack", async () => {
    try {
      const s = await session("bell,system,title");
      const opened = s.stdout.output;
      expect(opened, "focus reporting, because a rung is opted in").toContain(FOCUS_ON);
      const m = await script(s);

      expect(m.beforeFocus, "no report yet, so the reader may be looking").not.toContain(BEL);
      expect(m.beforeFocus).not.toContain(`${ESC}]9;`);

      // Bell, then system in linear's words, then the pushed title — one fact, in order.
      const done = `${BEL}${ESC}]9;prism: entry 2: /slow — succeeded, 45s${BEL}${PUSH}${ESC}]2;• prism · done${BEL}`;
      expect(m.long, "every opted rung, in order").toContain(done);
      expect(m.short, "the short row earns nothing").not.toContain(`${ESC}]9;`);
      expect(m.second, "a second fact while away writes a title").toContain(`${ESC}]2;• prism · done${BEL}`);
      expect(m.second, "and pushes nothing — one push per absence").not.toContain(PUSH);
      expect(m.back, "the reader returns and the title comes back").toContain(POP);
      expect(m.question, "a question while away").toContain(`${ESC}]9;prism: question: which branch? 1 main${BEL}`);
      expect(m.question).toContain(`${ESC}]2;• prism · waiting${BEL}`);
      const painted = s.screen();

      // **The control, and C22 I129 in one comparison**: the same keystrokes with
      // nothing opted in write none of those bytes, take no focus reporting —
      // and paint exactly the same screen, so a notification moved nothing.
      vi.useRealTimers();
      const q = await session(undefined);
      expect(q.stdout.output).not.toContain(FOCUS_ON);
      const quiet = await script(q);
      for (const [k, bytes] of Object.entries(quiet)) {
        expect(bytes, k).not.toContain(`${ESC}]9;`);
        expect(bytes, k).not.toContain(`${ESC}]2;`);
        expect(bytes, k).not.toContain(PUSH);
      }
      expect(q.screen(), "the same screen, rung or no rung").toEqual(painted);
    } finally {
      vi.useRealTimers();
    }
  });
});
