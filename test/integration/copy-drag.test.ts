// C14 §6f tier 4 — the drag in a real session.
//
// The row the model-level suite cannot reach, because the claim is about the
// **chain**: C16's mouse table, the mode's rung, the row-to-caret translation
// and the ticker. Each half passes on its own with the seam between them
// unbuilt, which is the shape a unit suite agrees with.
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { createEditor, type LineEditor } from "../../src/interaction/editor/editor.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { ProfileReport } from "../../src/index.js";
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
  // **`esc` twice, where this pressed `⌃c`** (C16 I62, ruling 59): copy mode
  // refuses the interrupt. The first clears the selection and the second leaves
  // (C16 I51); each waits out the decoder's lone-`Esc` window.
  stdin.emit("\u001b");
  await step(100);
  stdin.emit("\u001b");
  await step(100);
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
  it("T4.37f (C14 I54, R-THM-005): in hcDark a selected failed head draws its own mark, and esc restores ●", async () => {
    vi.useFakeTimers();
    try {
      // The head's first cell, read off the screen: the glyph lead is the mark
      // and one space, immediately before the text.
      const headIn = async (variant: "hcDark" | "dark"): Promise<{ before: string; selected: string; after: string }> => {
        const stdin = fakeStdin();
        const { screen, clock } = await buildSession({
          manifest: {
            ...(MANIFEST as Exclude<typeof MANIFEST, string>),
            tools: [
              ...(MANIFEST as Exclude<typeof MANIFEST, string>).tools,
              { name: "heads", local: true, summary: "one failed call head", args: [], flags: [] },
            ],
          },
          localHandlers: {
            ...SAYS,
            heads: () =>
              ({
                schema: "tui.view/1",
                command: "heads",
                status: "ok",
                blocks: [{ kind: "notice", id: "h", tone: "error", glyph: "work-unit", text: "HEADTEXT", state: "failed" }],
              }) as never,
          },
          stdin: stdin as never,
        });
        const step = async (ms = 0): Promise<void> => {
          clock.advance(ms);
          await vi.advanceTimersByTimeAsync(ms);
          await settle();
        };
        const mark = (): string => {
          const row = screen().rows.find((r) => r.includes("HEADTEXT")) ?? "";
          return [...row.slice(0, row.indexOf("HEADTEXT"))].at(-2) ?? "";
        };
        await step();
        if (variant === "hcDark") {
          stdin.emit("/theme hcDark\r");
          await step();
        }
        stdin.emit("/heads\r");
        await step();
        const before = mark();
        const at = screen().rows.findIndex((r) => r.includes("HEADTEXT")) + 1;
        stdin.emit("\u001bV");
        await step();
        stdin.emit(press(6, at));
        await step();
        stdin.emit(moveTo(7, at));
        await step();
        stdin.emit(release(7, at));
        await step();
        const selected = mark();
        // The lone byte, past C16's disambiguation window: the first clears
        // the selection and the second leaves (C14 I48).
        stdin.emit("\u001b");
        await step(100);
        stdin.emit("\u001b");
        await step(100);
        return { before, selected, after: mark() };
      };
      const hc = await headIn("hcDark");
      expect(hc.before, "hcDark, not selected: the page's ●").toBe("●");
      expect(hc.selected, "hcDark, selected: the state's own mark").toBe("✗");
      expect(hc.after, "hcDark, after esc: ● again — the axis responds both ways").toBe("●");
      // The control: `dark` does not band its selection.
      const dark = await headIn("dark");
      expect([dark.before, dark.selected, dark.after], "dark: ● throughout").toEqual(["●", "●", "●"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.37h (C14 I54, C10 I66): in hcDark at 1 bit selecting the failed head and clearing it costs the render cache no focus miss; at 24 bits each misses", async () => {
    // **The only row that sees the 1-bit half of C10 I66.** At 1 bit every
    // head already takes its state's mark, so the frame is the same whether or
    // not `washed` keys the cache; what differs is whether the entry is
    // rendered again for a picture that did not change. The profiler's miss
    // counts are that reading — the cache's own, over the whole session.
    vi.useFakeTimers();
    try {
      const run = async (depth: 1 | 24): Promise<{ marks: readonly string[]; focusMisses: number }> => {
        const stdin = fakeStdin();
        let seen: ProfileReport | null = null;
        const { screen, clock, tui } = await buildSession({
          manifest: {
            ...(MANIFEST as Exclude<typeof MANIFEST, string>),
            tools: [{ name: "heads", local: true, summary: "one failed call head", args: [], flags: [] }],
          },
          localHandlers: {
            heads: () =>
              ({
                schema: "tui.view/1",
                command: "heads",
                status: "ok",
                blocks: [{ kind: "notice", id: "h", tone: "error", glyph: "work-unit", text: "HEADTEXT", state: "failed" }],
              }) as never,
          },
          capabilities: { colourDepth: depth },
          profile: { tier: "counters", onReport: (r: ProfileReport) => void (seen = r) },
          stdin: stdin as never,
        });
        const step = async (ms = 0): Promise<void> => {
          clock.advance(ms);
          await vi.advanceTimersByTimeAsync(ms);
          await settle();
        };
        const mark = (): string => {
          const row = screen().rows.find((r) => r.includes("HEADTEXT")) ?? "";
          return [...row.slice(0, row.indexOf("HEADTEXT"))].at(-2) ?? "";
        };
        await step();
        stdin.emit("/theme hcDark\r");
        await step();
        stdin.emit("/heads\r");
        await step();
        const at = screen().rows.findIndex((r) => r.includes("HEADTEXT")) + 1;
        stdin.emit("\u001bV");
        await step();
        const marks = [mark()];
        stdin.emit(press(6, at));
        await step();
        stdin.emit(moveTo(7, at));
        await step();
        stdin.emit(release(7, at));
        await step();
        marks.push(mark());
        // One lone byte, past the disambiguation window: it clears the selection (C14 I48).
        stdin.emit("\u001b");
        await step(100);
        marks.push(mark());
        await tui.stop("exit");
        const report = seen as ProfileReport | null;
        if (report === null) throw new Error("no report arrived");
        return { marks, focusMisses: report.misses["render"]?.focus ?? 0 };
      };
      const mono = await run(1);
      expect(mono.marks, "1 bit: the state's own mark throughout").toEqual(["✗", "✗", "✗"]);
      expect(mono.focusMisses, "1 bit: the selection keys nothing").toBe(0);
      // The control: at 24 bits the band is painted, the mark moves, and the
      // selection and its clearing each miss — the counter responds.
      const truecolour = await run(24);
      expect(truecolour.marks, "24 bits: ●, then the state's mark under the band, then ●").toEqual(["●", "✗", "●"]);
      expect(truecolour.focusMisses, "24 bits: the selection and its clearing").toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

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
    // **The copy itself, at the seam it lands on**, rather than the prompt a
    // yank draws it into. The prompt is capped at fifteen rows and elides the
    // head with `⋯`, so reading it showed the last entry's tail whatever was
    // copied above that — and the row's control read the same text as its
    // subject. Every editor shares one prototype, so a spy on it hears the
    // session's own editor.
    const copyText = vi.spyOn(Object.getPrototypeOf(createEditor()) as LineEditor, "copyText");
    try {
      /**
       * One gesture in a fresh session (the kill buffer is per session, and a
       * copy of nothing leaves it holding whatever came before — measured: the
       * control read the subject's text back through `⌃U`'s kill). Six calls,
       * up three pages, visual mode, press at `(4,4)`, drag to `row`, hold,
       * release, `y`.
       */
      const gesture = async (row: number, holdMs: number) => {
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
        /** The entries whose lines a screen shows, top to bottom. */
        const entries = (): string[] => screen().rows.flatMap((r) => /e(\d+)-line-/u.exec(r)?.[1] ?? []);
        for (let i = 0; i < 3; i += 1) {
          stdin.emit("\u001b[5~");
          await step(0);
        }
        stdin.emit("\u001bV");
        await step(0);
        stdin.emit(press(4, 4));
        await step(0);
        const pressed = /e(\d+)-line-(\d+)/u.exec(screen().rows[3] ?? "");
        stdin.emit(moveTo(4, row));
        await step(holdMs);
        const bottom = entries().at(-1) ?? null;
        stdin.emit(release(4, row));
        await step(0);
        copyText.mockClear();
        stdin.emit("y");
        await step(0);
        const copies = copyText.mock.calls.map(([text]) => text);
        return { pressed, bottom, copies };
      };

      /**
       * **The copy the fixture predicts** for entries `from..to`: an entry's
       * twelve lines, the second and later each led by its command, joined by
       * the blank line that separates entries (`R-SEL-004`). The first entry
       * starts at the pressed row, which is its body's first line.
       */
      const expected = (from: number, to: number): string =>
        Array.from({ length: to - from + 1 }, (_, k) => {
          const lines = Array.from({ length: 12 }, (_l, i) => `e${String(from + k)}-line-${String(i)}`).join("\n");
          return k === 0 ? lines : `say\n${lines}`;
        }).join("\n\n");
      /** The entries a copy carries, in order — the block set the selection ended with. */
      const entriesOf = (text: string): string[] => [...new Set([...text.matchAll(/e(\d+)-line-/gu)].map((m) => m[1] ?? ""))];

      // **The control first**: a drag that stays inside the transcript, with no
      // hold, copies through the same keys — so an empty or short copy below is
      // the selection's, not the instrument's. And it must stop short of the
      // edge the ticks reach, or the subject's assertions are about nothing.
      const inside = await gesture(20, 0);
      expect(inside.pressed?.[0], "the press lands on an entry's first line").toBe("e0-line-0");
      expect(inside.copies, "in-container: one copy, exactly the entries the drag crossed").toEqual([expected(0, 1)]);

      // **The subject**: below the transcript and held still, so only the ticks
      // can select anything past the pointer's last row.
      const ticked = await gesture(99, 400);
      const pressed = Number(ticked.pressed?.[1]);
      const bottom = Number(ticked.bottom);
      // **To the edge they scrolled toward.** Not-empty alone is passed by a
      // tick extending to the top edge once prose is selectable (C14 I51) — the
      // mutation pass measured exactly that survivor. The bottom row's entry
      // after the ticks is what the correct edge takes, and it must differ from
      // the press's or the assertion is about nothing.
      expect(bottom > pressed, "the ticks scrolled past the press's entry").toBe(true);
      expect(ticked.copies, "one copy, exactly press to edge").toEqual([expected(pressed, bottom)]);
      expect(entriesOf(ticked.copies[0] ?? ""), "the block set: every entry from the press to the edge").toEqual(
        Array.from({ length: bottom - pressed + 1 }, (_, k) => String(pressed + k)),
      );
      expect(entriesOf(ticked.copies[0] ?? "").length, "and more than the drag inside reached").toBeGreaterThan(
        entriesOf(inside.copies[0] ?? "").length,
      );
    } finally {
      copyText.mockRestore();
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

  it("T4.37b (C14 I48, R-SEL-013): esc ends the drag and its autoscroll; ⌃c, refused, ends nothing", async () => {
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

      // **`⌃c` — refused, so it ends nothing** (C14 I48 amended, C16 I62,
      // ruling 59). It used to leave the mode, and leaving is what ended the
      // gesture; R-SEL-013 names release, esc and the container's end, and a
      // refused key performs none of them. The held pointer keeps scrolling.
      await armedAndScrolling("⌃c");
      stdin.emit("\u0003");
      await step(0);
      const afterRefusal = view();
      await step(600);
      expect(view(), "⌃c is refused and the drag goes on").not.toBe(afterRefusal);
    } finally {
      vi.useRealTimers();
    }
  });
});
