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

/**
 * One copy from a fresh session over prose, a scroll box and prose (C14 I50,
 * I51). **One per session**: the kill buffer is shared by `y`, `⌃U` and every
 * kill, and `copyText("")` leaves it alone, so a second copy in the same
 * session reads the first whenever it copies nothing — measured, a subject and
 * its control both read the box that way.
 */
async function copiedFromBoxed(
  from: (rowOf: (text: string) => number) => number,
  to: (rowOf: (text: string) => number) => number,
): Promise<string> {
  const stdin = fakeStdin();
  const { screen, clock } = await buildSession({
    manifest: {
      ...(MANIFEST as Exclude<typeof MANIFEST, string>),
      tools: [
        ...(MANIFEST as Exclude<typeof MANIFEST, string>).tools,
        { name: "boxed", local: true, summary: "a box between prose", args: [], flags: [] },
      ],
    },
    localHandlers: {
      ...SAYS,
      boxed: () =>
        ({
          schema: "tui.view/1",
          command: "boxed",
          status: "ok",
          blocks: [
            { kind: "code", id: "lede", language: "text", text: "LEDEPROSE" },
            {
              kind: "scroll",
              id: "box",
              height: 2,
              children: [
                { kind: "raw", id: "r1", text: "ALPHA" },
                { kind: "raw", id: "r2", text: "BRAVO" },
                { kind: "raw", id: "r3", text: "CHARLIE" },
              ],
            },
            { kind: "raw", id: "tail", text: "TAILPROSE" },
          ],
        }) as never,
    },
    stdin: stdin as never,
  });
  const step = async (ms: number): Promise<void> => {
    clock.advance(ms);
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
  };
  await step(0);
  stdin.emit("/boxed\r");
  await step(0);
  const rowOf = (text: string): number => screen().rows.findIndex((r) => r.includes(text)) + 1;
  const a = from(rowOf);
  const b = to(rowOf);
  expect(a > 0 && b > 0, "the fixture drew both ends").toBe(true);
  stdin.emit("\u001bV");
  await step(0);
  stdin.emit(press(6, a));
  await step(0);
  stdin.emit(moveTo(6, b));
  await step(0);
  stdin.emit(release(6, b));
  await step(0);
  stdin.emit("y");
  await step(0);
  stdin.emit("\u0003");
  await step(0);
  stdin.emit("\u0019");
  await step(0);
  const rows = screen().rows;
  const rules = rows.flatMap((r, i) => (/^─+$/u.test(r.trim()) ? [i] : []));
  const [x, y] = rules.slice(-2);
  return rows.slice((x ?? 0) + 1, y).join("\n");
}

/** SGR 1006 — `Cb` 0 is button 1 down, 32 the same button reported moving. */
const press = (col: number, row: number): string =>
  `[<0;${String(col)};${String(row)}M`;
const moveTo = (col: number, row: number): string =>
  `[<32;${String(col)};${String(row)}M`;
const release = (col: number, row: number): string =>
  `[<0;${String(col)};${String(row)}m`;

describe("C14 §6f — the drag in a real session", () => {
  it.todo("T4.37f (C14 I54, R-THM-003): in hcDark a selected failed head draws its own mark and esc restores ● — not deferred on a component: specified before the axis exists");

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

  it("T4.37c (C14 I49, R-SEL-013): a tick extends the selection to the container's edge", async () => {
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

      /** The prompt's rows: between the last two full-width rules. */
      const prompt = (): string => {
        const rows = screen().rows;
        const rules = rows.flatMap((r, i) => (/^─+$/u.test(r.trim()) ? [i] : []));
        const [a, b] = rules.slice(-2);
        return rows.slice((a ?? 0) + 1, b).map((r) => r.trimEnd()).join("\n").replace(/^❯ ?/u, "");
      };

      /** The entry a screen row (1-based) shows, from its `eN-line-` text. */
      const entryOnRow = (row: number): string | null => /e(\d+)-line-/u.exec(screen().rows[row - 1] ?? "")?.[1] ?? null;
      /** The entry on the transcript's last drawn row. */
      const lastEntryOnScreen = (): string | null => {
        const ids = screen().rows.flatMap((r) => /e(\d+)-line-/u.exec(r)?.[1] ?? []);
        return ids.at(-1) ?? null;
      };
      const edges: { pressed: string | null; bottom: string | null }[] = [];

      /** Enter, drag from `(4,4)` to `row`, hold, release, `y`, leave, yank. */
      const copied = async (row: number, holdMs: number): Promise<string> => {
        for (let i = 0; i < 3; i += 1) {
          stdin.emit("\u001b[5~");
          await step(0);
        }
        stdin.emit("\u001bV");
        await step(0);
        stdin.emit(press(4, 4));
        await step(0);
        const pressed = entryOnRow(4);
        stdin.emit(moveTo(4, row));
        await step(holdMs);
        edges.push({ pressed, bottom: lastEntryOnScreen() });
        stdin.emit(release(4, row));
        await step(0);
        stdin.emit("y");
        await step(0);
        stdin.emit("\u0003");
        await step(0);
        stdin.emit("\u0019");
        await step(0);
        const text = prompt();
        stdin.emit("\u0015"); // ⌃U — the next arm starts from an empty line
        await step(0);
        return text;
      };

      // **The subject first, on an empty kill buffer.** `copyText("")` leaves
      // the buffer alone on purpose, so a control run first would leave its own
      // copy there and an empty selection here would yank it — measured: the
      // row passed against the unfixed tick in that order.
      //
      // Below the transcript and held still: only the ticks can select anything.
      const ticked = await copied(99, 400);
      expect(ticked.trim(), "the ticks extended the selection").not.toBe("");
      // **And to the edge they scrolled toward.** Not-empty alone is passed by a
      // tick extending to the top edge once prose is selectable (C14 I51) — the
      // mutation pass measured exactly that survivor. The bottom row's entry
      // after the ticks is what the correct edge takes, and it must differ from
      // the press's or the assertion is about nothing.
      const [edge] = edges;
      expect(edge?.bottom != null && edge.bottom !== edge.pressed, "the ticks scrolled past the press's entry").toBe(true);
      expect(ticked, "the entry at the bottom edge was taken").toContain(`e${String(edge?.bottom)}-line-`);

      // **The control: a drag inside the transcript copies through these keys**,
      // so an empty prompt above would be the selection's and not the instrument's.
      expect((await copied(20, 0)).trim(), "in-container: the copy reaches the prompt").not.toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.37d (C14 I50, R-SEL-013): a drag begun in a box does not select the prose below", async () => {
    vi.useFakeTimers();
    try {
      // **The control: a viewport drag from the lede to the tail copies the
      // tail** (T4.37e), so its absence below is the clamp's.
      const whole = await copiedFromBoxed((r) => r("LEDEPROSE"), (r) => r("TAILPROSE"));
      expect(whole, "viewport drag: the tail is copied").toContain("TAILPROSE");

      const fromBox = await copiedFromBoxed((r) => r("ALPHA"), (r) => r("TAILPROSE"));
      expect(fromBox, "the box was copied").toContain("ALPHA");
      expect(fromBox, "and the prose below it was not").not.toContain("TAILPROSE");
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.37e (C14 I51, R-SEL-003, R-SEL-004): prose joins a drag, in either direction", async () => {
    vi.useFakeTimers();
    try {
      // **The control: the card head was selectable before either repair**, so
      // the instrument can show a copy and the rows below are about the prose.
      const head = await copiedFromBoxed((r) => r("● boxed"), (r) => r("ALPHA"));
      expect(head, "head to box: the box is copied").toContain("ALPHA");

      const down = await copiedFromBoxed((r) => r("LEDEPROSE"), (r) => r("TAILPROSE"));
      for (const text of ["LEDEPROSE", "ALPHA", "TAILPROSE"]) expect(down, `downward: ${text}`).toContain(text);
      const up = await copiedFromBoxed((r) => r("TAILPROSE"), (r) => r("LEDEPROSE"));
      for (const text of ["LEDEPROSE", "ALPHA", "TAILPROSE"]) expect(up, `upward: ${text}`).toContain(text);
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
