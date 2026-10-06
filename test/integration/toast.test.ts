// C22 §6l.13 — the toast through a session (§105, §012, C26 I17).
//
// **Fake timers, with the injected clock advanced beside them** — copy-freeze's
// pattern, because `schedule` is ambient and a session built by `createTui`
// takes the real one. The toast reads no clock (its lifetime is the scheduled
// expiry), so the two cannot disagree about it; the clock is advanced anyway
// so the header's time of day is not the one thing frozen.
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const table = {
  kind: "table",
  id: "t",
  columns: [{ key: "name", label: "Name", align: "left", priority: 10, minWidth: 12, sortable: false }],
  rows: [
    { id: "a", cells: { name: { text: "alpha" } } },
    { id: "b", cells: { name: { text: "beta" } } },
  ],
};

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

describe("C22 §6l.13 — the toast in a session", () => {
  it("T4.95 (C22 I116): y toasts, the expiry returns the tail, a second toast disposes the first timer", async () => {
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const { screen, clock, tui } = await buildSession(
        {
          stdin: stdin as never,
          manifest: {
            schema: "tui.manifest/1",
            binary: "prism",
            version: "1.0.0",
            tools: [{ name: "rows", local: true, summary: "two rows", args: [], flags: [] }],
          },
          localHandlers: { rows: () => ({ schema: "tui.view/1", status: "ok", blocks: [table] }) },
        } as never,
        { columns: 80, rows: 24 },
      );
      const step = async (ms: number): Promise<void> => {
        clock.advance(ms);
        await vi.advanceTimersByTimeAsync(ms);
        await settle();
      };
      const type = async (bytes: string): Promise<void> => {
        stdin.emit(bytes);
        await step(0);
      };
      const footer = (): string => screen().text.slice(-3).join("\n");

      await step(0);
      await type("/rows\r");
      await step(50);
      // The control: the tail is the working directory before anything is copied.
      expect(footer(), "the cwd, before").toContain("/work");

      // `↓` onto the card's head, `↓` onto the first row, `y`.
      await type("\x1b[B");
      await type("\x1b[B");
      await type("y");
      await step(50);
      expect(footer(), "what says so").toContain("✓ copied 1 line");
      expect(footer(), "in place of the tail").not.toContain("/work");

      // E1 — alive at the edge of its lifetime and gone at it.
      await step(1_900);
      expect(footer(), "still live 1950 ms in").toContain("copied 1 line");
      await step(100);
      expect(footer(), "expired at 2000").not.toContain("copied");
      expect(footer(), "and the tail returns").toContain("/work");

      // E2 — a second toast 1500 ms after the first. At 2100 ms the first's
      // expiry has passed and the second's has not: an undisposed first timer
      // clears it here.
      await type("y");
      await step(1_500);
      await type("y");
      await step(600);
      expect(footer(), "the first expiry cleared nothing").toContain("copied 1 line");
      await step(1_500);
      expect(footer(), "the second's own expiry does").not.toContain("copied");

      // E3 — stopping with a toast live leaves no timer behind. The frame the
      // raise committed drains first, so the one timer left is the expiry's:
      // measured, stopping straight after the key leaves the scheduler's own
      // pending window armed as well, and the row would be about C03.
      await type("y");
      await step(50);
      expect(footer(), "live when the session stops").toContain("copied 1 line");
      await tui.stop("exit");
      await settle();
      expect(vi.getTimerCount(), "nothing armed after the release").toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
