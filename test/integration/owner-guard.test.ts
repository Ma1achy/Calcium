// C16 I69, I70 — the question guard through a built session, read from the
// frame (review batch 3, M7).
//
// **Bytes in, the frame out**, for linear.test's reason: the guard's
// explanation is a chip on the owner line, and its lapse is a frame no key
// draws — the wake's. A row reading the router would test the mechanism and
// miss both. The pointer's rows (T4.75, T4.77, T4.90) are in
// `test/unit/session-mouse.test.ts`, beside the geometry they share.
//
// The terminal is `xterm-256color` with no kitty protocol, so no release is
// reported and the guard is the timed arm (C16 I69).
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

/** A verb that asks at once, so the `⏎` submitting it is the key held across the arrival. */
const asking = async (_argv: readonly string[], ctx: { ask: (o: unknown) => Promise<{ key: string }> }) => {
  const a = await ctx.ask({
    question: "which branch?",
    choices: [
      { key: "a", label: "feat/c26" },
      { key: "b", label: "main", default: true },
    ],
  });
  return { schema: "tui.view/1", status: "ok", blocks: [{ kind: "tip", id: "chose", text: `chose ${a.key}` }] };
};

async function rich() {
  vi.useFakeTimers();
  const stdin = fakeStdin();
  const session = await buildSession(
    {
      stdin: stdin as never,
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "branch", local: true, summary: "pick a branch", args: [], flags: [] }],
      },
      localHandlers: { branch: asking },
    } as never,
    { columns: 100, rows: 24 },
  );
  /** The injected clock and the scheduler's timers, moved together. */
  const step = async (ms = 0): Promise<void> => {
    session.clock.advance(ms);
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  };
  const type = async (text: string): Promise<void> => {
    for (const ch of text) {
      stdin.emit(ch);
      await step();
    }
  };
  await step();
  const text = (): readonly string[] => session.screen().text;
  /** The owner line: the footer's row naming the question rung. */
  const ownerLine = (): string => text().find((l) => l.includes("question")) ?? "";
  return { ...session, stdin, step, type, text, ownerLine };
}

const READY = "ready in a moment";
const REFUSED = "⏎ refused: pause, then press ⏎";

describe("C16 I69, I70 — the guard through the frame (review batch 3, M7)", () => {
  it("T4.76 (C16 I44, I69, I70, R-BLK-788, R-INT-008): a held ⏎ with no release reporting is refused for the whole hold, and the owner line names it after the first refusal", async () => {
    const s = await rich();
    try {
      // `⏎` submits a verb that asks at once: the key is down across the arrival.
      await s.type("/branch\r");
      expect(s.ownerLine(), "the question is up, and guarded").toContain(READY);
      expect(s.ownerLine()).not.toContain(REFUSED);

      // X11's first repeat at 660 ms, then 30 Hz, for a second and a half.
      await s.step(660);
      for (let ms = 660; ms <= 2_160; ms += 33) {
        s.stdin.emit("\r");
        await s.step(33);
      }
      expect(s.text().join("\n"), "never answered").not.toContain("chose");
      // **Read from the frame**: the refused key changed it.
      expect(s.ownerLine(), "the refused key, named").toContain(REFUSED);

      // The key lifts, the reader pauses, and presses it deliberately.
      await s.step(1_000);
      await s.type("\r");
      expect(s.text().join("\n"), "the default answered").toContain("chose b");
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.91 (C16 I69, I70, C22 §6): the mark, the refusal chip unchanged by a second refusal, and the wake's frame at the deadline with no input", async () => {
    const s = await rich();
    try {
      await s.type("/branch");
      await s.type("\r");
      expect(s.ownerLine(), "arrived, and nothing refused").toContain(READY);

      await s.step(100);
      await s.type("\r");
      const first = s.ownerLine();
      expect(first, "the first refusal names the key and the way out").toContain(REFUSED);
      expect(first).not.toContain(READY);

      await s.step(100);
      await s.type("\r");
      expect(s.ownerLine(), "a second refusal changes nothing").toBe(first);

      // No input from here. The guard lapses at the grace's end (750 ms from
      // the arrival; the last refusal's gap closes at 450), and the frame at
      // that moment is the wake's — nothing else would draw it.
      await s.step(549);
      expect(s.ownerLine(), "one millisecond before the deadline").toContain(REFUSED);
      await s.step(2);
      expect(s.ownerLine(), "the wake drew the lapse").not.toContain(REFUSED);
      expect(s.ownerLine()).not.toContain(READY);
      expect(s.text().join("\n"), "and answered nothing").not.toContain("chose");
    } finally {
      vi.useRealTimers();
    }
  });
});
