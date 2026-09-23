// C14 §6b tier 4 — the freeze in a real session.
//
// The two rows the graph-level suite cannot reach, because both are about what
// the **session** does with the hold: the clipboard reads the view (I33), and
// the ticker stops because the document cannot hold it (I35).
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TuiConfig } from "../../src/shell/types.js";

const settle = async (): Promise<void> => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [{ name: "work", local: true, summary: "a running step", args: [], flags: [] }],
};

/** A spinner, inside a panel — the shape `b.live` builds (C22 T4.35's fixture). */
const SPINNING: NonNullable<TuiConfig["localHandlers"]> = {
  work: () => ({
    schema: "tui.view/1",
    command: "work",
    status: "ok",
    blocks: [
      {
        kind: "panel",
        id: "p",
        title: "build",
        children: [{ kind: "steps", id: "s", steps: [{ label: "building", state: "active" }] }],
      } as never,
    ],
  }),
};

describe("C14 §6b — the freeze in a real session", () => {
  it("T4.34 (C14 I35): the ticker stops with the mode and moves again after the exit", async () => {
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const { screen, clock } = await buildSession({
        manifest: MANIFEST,
        localHandlers: SPINNING,
        stdin: stdin as never,
      });
      await vi.advanceTimersByTimeAsync(0);
      await settle();
      stdin.emit("/work\r");
      await vi.advanceTimersByTimeAsync(0);
      await settle();

      const step = async (ms: number): Promise<void> => {
        clock.advance(ms);
        await vi.advanceTimersByTimeAsync(ms);
        await settle();
      };
      // The braille cell, not the row's first character — inside a panel that
      // is the border, which is furniture rather than the subject.
      const cell = (): string => {
        const row = screen().rows.find((r) => r.includes("building"));
        if (row === undefined) return "<absent>";
        return /[⠀-⣿]/u.exec(row)?.[0] ?? "<none>";
      };

      // **The control first**: the spinner is moving before the mode is entered,
      // so a frozen cell below is the mode's doing and not a dead fixture.
      const before: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        await step(150);
        before.push(cell());
      }
      expect(before.join(""), "the cell is on the screen").not.toContain("<absent>");
      expect(new Set(before).size, "it moves with no mode up").toBeGreaterThan(1);

      // `⌥⇧V` — ESC V, the base route for `selection.semantic`.
      stdin.emit("V");
      await step(0);
      const during: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        await step(150);
        during.push(cell());
      }
      expect(new Set(during).size, "the ticker is stopped while the mode is up").toBe(1);

      // `esc` leaves with no selection open, and the ticker re-arms out of the
      // frame the exit commits.
      stdin.emit("");
      await step(0);
      const after: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        await step(150);
        after.push(cell());
      }
      expect(new Set(after).size, "and it moves again on the far side").toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
