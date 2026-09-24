// C14 §6f tier 4 — the drag in a real session.
//
// The row the model-level suite cannot reach, because the claim is about the
// **chain**: C16's mouse table, the mode's rung, the row-to-caret translation
// and the ticker. Each half passes on its own with the seam between them
// unbuilt, which is the shape a unit suite agrees with.
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
  tools: [
    {
      name: "say",
      local: true,
      summary: "prints a block",
      args: [],
      flags: [],
    },
  ],
};

/** Twelve distinct rows a call, so what is on screen names where we are. */
let said = 0;
const SAYS: NonNullable<TuiConfig["localHandlers"]> = {
  say: () => ({
    schema: "tui.view/1",
    command: "say",
    status: "ok",
    blocks: [
      {
        kind: "raw",
        id: "t",
        text: Array.from(
          { length: 12 },
          (_, i) => `e${String(said)}-line-${String(i)}`,
        ).join("\n"),
      } as never,
    ],
  }),
};

/** SGR 1006 — `Cb` 0 is button 1 down, 32 the same button reported moving. */
const press = (col: number, row: number): string =>
  `[<0;${String(col)};${String(row)}M`;
const moveTo = (col: number, row: number): string =>
  `[<32;${String(col)};${String(row)}M`;
const release = (col: number, row: number): string =>
  `[<0;${String(col)};${String(row)}m`;

describe("C14 §6f — the drag in a real session", () => {
  it("T4.37 (C14 I44, I45): a drag past the region autoscrolls, and keeps going with the pointer still", async () => {
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const { screen, clock } = await buildSession({
        manifest: MANIFEST,
        localHandlers: SAYS,
        stdin: stdin as never,
      });
      await vi.advanceTimersByTimeAsync(0);
      await settle();

      const step = async (ms: number): Promise<void> => {
        clock.advance(ms);
        await vi.advanceTimersByTimeAsync(ms);
        await settle();
      };

      for (let i = 0; i < 6; i += 1) {
        said = i;
        stdin.emit("/say\r");
        await step(0);
      }

      /** The top of what is drawn — the fingerprint a scroll moves. */
      const view = (): string =>
        screen()
          .rows.map((r) => r.trim())
          // The transcript's own rows: the header and the two rules are drawn
          // at every scroll position and would make this fingerprint constant.
          .filter((r) => /-line-/u.test(r))
          .slice(0, 2)
          .join(" | ");

      // Detached and with room below, so there is somewhere to autoscroll to.
      // At the tail nothing can move and every assertion below would pass on a
      // ticker that never fired.
      for (let i = 0; i < 3; i += 1) {
        stdin.emit("[5~");
        await step(0);
      }
      const parked = view();

      // **The control first**: with no mode up, the same two reports scroll
      // nothing. So a moved view below is the drag's doing rather than a
      // session that drifts on its own.
      stdin.emit(press(4, 4));
      stdin.emit(moveTo(4, 99));
      await step(400);
      expect(view(), "no mode up, no autoscroll").toBe(parked);
      stdin.emit(release(4, 99));
      await step(0);

      // `⌥⇧V` — ESC V, the base route for `selection.semantic`.
      stdin.emit("V");
      await step(0);
      const entered = view();

      // Press inside the transcript, then drag far below it — the pointer has
      // left the container, which is the state the bands exist for.
      stdin.emit(press(4, 4));
      await step(0);
      stdin.emit(moveTo(4, 99));
      await step(0);
      const armed = view();

      // **The continuation, and it is the row's reason for existing.** No
      // further report is emitted: the clock alone advances. A terminal reports
      // motion when the pointer changes cell and not while it sits still, so an
      // implementation that scrolled on the report rather than on a ticker
      // passes every unit row in this component and stands still here.
      await step(400);
      const scrolled = view();
      expect(scrolled, "held and still, and it kept scrolling").not.toBe(armed);

      // `R-SEL-013`'s *stops on release*: the ticker goes with the gesture.
      stdin.emit(release(4, 99));
      await step(0);
      const stopped = view();
      await step(600);
      expect(view(), "and it stops when the button does").toBe(stopped);
      expect(stopped, "the whole gesture moved the view").not.toBe(entered);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.37b (C14 I48, R-SEL-013): esc and ⌃c end the drag and its autoscroll", async () => {
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const { screen, clock } = await buildSession({
        manifest: MANIFEST,
        localHandlers: SAYS,
        stdin: stdin as never,
      });
      await vi.advanceTimersByTimeAsync(0);
      await settle();
      const step = async (ms: number): Promise<void> => {
        clock.advance(ms);
        await vi.advanceTimersByTimeAsync(ms);
        await settle();
      };
      for (let i = 0; i < 6; i += 1) {
        said = i;
        stdin.emit("/say\r");
        await step(0);
      }
      const view = (): string =>
        screen()
          .rows.map((r) => r.trim())
          .filter((r) => /-line-/u.test(r))
          .slice(0, 2)
          .join(" | ");
      // Detached with room below, as T4.37 — at the tail nothing could move.
      for (let i = 0; i < 3; i += 1) {
        stdin.emit("\u001b[5~");
        await step(0);
      }

      /** Enter the mode, drag below the container, and see it scroll. */
      const armedAndScrolling = async (why: string): Promise<void> => {
        stdin.emit("\u001bV");
        await step(0);
        stdin.emit(press(4, 4));
        await step(0);
        stdin.emit(moveTo(4, 99));
        await step(0);
        const armed = view();
        // **The control, each time**: with no key, the held pointer scrolls.
        await step(200);
        expect(view(), `${why}: the drag is scrolling before the key`).not.toBe(armed);
      };

      // `esc` — the lone byte, past C16's disambiguation window.
      await armedAndScrolling("esc");
      stdin.emit("\u001b");
      await step(100);
      const afterEsc = view();
      await step(600);
      expect(view(), "esc stopped the autoscroll").toBe(afterEsc);
      stdin.emit(release(4, 99));
      await step(0);
      // Out of the mode before the second arm: esc once more leaves it.
      stdin.emit("\u001b");
      await step(100);
      for (let i = 0; i < 3; i += 1) {
        stdin.emit("\u001b[5~");
        await step(0);
      }

      // `⌃c` — leaves the mode, and the transcript it hands back holds still.
      await armedAndScrolling("⌃c");
      stdin.emit("\u0003");
      await step(0);
      const afterExit = view();
      await step(600);
      expect(view(), "⌃c stopped the autoscroll").toBe(afterExit);
    } finally {
      vi.useRealTimers();
    }
  });
});
