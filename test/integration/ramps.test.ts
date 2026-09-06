// C09 §5 *Ramps*, C22 I60 — a shimmer through the session.
//
// **The same chain T4.35 measures for a spinner, with a block that animates by
// content rather than by kind**: the ticker fires, `commit("spinner")` reaches
// C03, `visibleRows` asks `animationIntervalOf`, finds the shimmer and keys the
// slot on the tick. The screen fold strips SGR, so a colour-only animation is
// invisible there; the row reads the **writes** — C22's diff writer emits only
// changed cells, so a rewritten head shows up as bytes and an untouched plain
// entry as their absence.
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import type { TuiConfig } from "../../src/shell/types.js";
import { fakeStdin } from "../support/fake-terminal.js";

const settle = async (): Promise<void> => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [{ name: "glow", local: true, summary: "a shimmering head over a plain line", args: [], flags: [] }],
};

const HANDLERS: NonNullable<TuiConfig["localHandlers"]> = {
  glow: () => ({
    schema: "tui.view/1",
    command: "glow",
    status: "ok",
    blocks: [
      {
        kind: "raw",
        id: "moving",
        text: "SHIMMER-HEAD",
        spans: [{ from: 0, to: 12, ramp: { fill: "gradient", from: "default", to: "accent", animate: "shimmer" } }],
      } as never,
      { kind: "raw", id: "still", text: "PLAIN-LINE-BELOW" } as never,
    ],
  }),
};

describe("C09 §5 — a shimmer through the session", () => {
  it("T4.8 (C09 I54, C22 I60): a shimmer on a head re-renders each spinner commit while a plain entry beside it is written once — read from the writes, not the folded screen", async () => {
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const { screen, clock, stdout } = await buildSession({
        manifest: MANIFEST,
        localHandlers: HANDLERS,
        stdin: stdin as never,
      });
      await vi.advanceTimersByTimeAsync(0);
      await settle();
      stdin.emit("/glow\r");
      await vi.advanceTimersByTimeAsync(0);
      await settle();
      expect(screen().text.join("\n")).toContain("SHIMMER-HEAD");
      expect(screen().text.join("\n")).toContain("PLAIN-LINE-BELOW");

      const step = async (ms: number): Promise<void> => {
        clock.advance(ms);
        await vi.advanceTimersByTimeAsync(ms);
        await settle();
      };
      // Four steps, the first discarded: 150 ms lands inside the first window and
      // reads as a hold rather than a tick (T4.36's own note). The three that
      // remain are each past the cadence and C03's window, and the writes after
      // each are the frame's difference from the last.
      const all: string[] = [];
      for (let i = 0; i < 4; i += 1) {
        const before = stdout.chunks.length;
        await step(150);
        all.push(stdout.chunks.slice(before).join(""));
      }
      const deltas = all.slice(1);
      const colours = deltas.map((d) => new Set([...d.matchAll(/38;(?:2;\d+;\d+;\d+|5;\d+)/gu)].map((m) => m[0])));
      // Each tick rewrote coloured cells, and the pictures differ tick to tick.
      for (const c of colours) expect(c.size).toBeGreaterThan(0);
      expect(deltas[0]).not.toBe(deltas[1]);
      expect(deltas[1]).not.toBe(deltas[2]);
      // The plain entry was written once, on arrival, and never again.
      for (const d of deltas) expect(d).not.toContain("PLAIN-LINE-BELOW");
      expect(screen().text.join("\n")).toContain("PLAIN-LINE-BELOW");
    } finally {
      vi.useRealTimers();
    }
  });
});
