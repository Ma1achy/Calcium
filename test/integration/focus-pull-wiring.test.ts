// C26 I24, I25 — the pull, in a session (§7a, §021, §095).
//
// **The rows that call the mechanism are next door, in `test/unit/focus-pull`,
// and they cannot see this.** `pullIntoView` is a distance and `tapeStart` is a
// window; both are green against a build where nothing calls either. What is
// asserted here is the edge — focus writes an offset, and nothing writes focus
// back — and it is read off the screen, because that is the only place the two
// halves meet.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TuiConfig } from "../../src/shell/types.js";

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [
    { name: "deep", local: true, summary: "eight rows in a box of two", args: [], flags: [] },
    { name: "tail", local: true, summary: "the same box, following", args: [], flags: [] },
    { name: "strip", local: true, summary: "a tape of seven", args: [], flags: [] },
  ],
};

const NAMES = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL"];

/** Eight children in a box of two, so the window has somewhere to be pulled from. */
const BOX = {
  kind: "scroll",
  id: "box",
  height: 2,
  children: NAMES.map((t, i) => ({ kind: "raw", id: `r${String(i)}`, text: t })),
} as const;

const doc = (command: string, blocks: readonly unknown[]): unknown => ({
  schema: "tui.view/1",
  command,
  status: "ok",
  blocks,
});

/** The current is an argument, so one session can walk the strip. */
const stripDoc = (current: string): unknown =>
  doc("strip", [
    {
      kind: "tape",
      id: "strip",
      members: NAMES.slice(0, 7).map((n) => ({ id: n, label: n, state: "succeeded" })),
      current,
    },
  ]);

const handlers: NonNullable<TuiConfig["localHandlers"]> = {
  deep: () => doc("deep", [BOX]) as never,
  // **The same box, opening at its tail** (C04 I97). The offset an untouched
  // follow box reads is the ceiling and not the zero the store holds, which is
  // the state `ScrollOffsets.resolved` exists for.
  tail: () => doc("tail", [{ ...BOX, follow: true }]) as never,
  strip: ((argv: readonly string[]) => stripDoc(argv[0] ?? "ALPHA")) as never,
};

const DOWN = "[B";
const PAGE_UP = "[5~";
/** `⌥↑`/`⌥↓` — `scroll.up`/`scroll.down`, which never ask where focus is. */
const META_UP = "[1;3A";
const META_DOWN = "[1;3B";

const drive = async (
  size?: { columns: number; rows: number },
): Promise<
  Readonly<{
    type: (bytes: string) => Promise<void>;
    rows: () => string;
    resize: (next: { columns: number; rows: number }) => void;
    stop: () => Promise<void>;
  }>
> => {
  const stdin = fakeStdin();
  const session = await buildSession(
    {
      manifest: MANIFEST,
      localHandlers: handlers,
      stdin: stdin as unknown as NodeJS.ReadStream,
    },
    size,
  );
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  };
  return {
    type,
    rows: () => session.screen().rows.join("\n"),
    resize: session.resize,
    stop: async () => {
      await session.tui.stop("exit");
    },
  };
};

/**
 * **The box's own residue row is the instrument** (C04 I49). `⋯ N above, M
 * below` is the offset, drawn, so the window's position is read off the screen
 * rather than out of the store — and a build that wrote the offset and never
 * rendered it would fail here while passing an assertion on `get`.
 */
const aboveIn = (frame: string): number => {
  const row = frame.split("\n").find((r) => r.includes("above,")) ?? "";
  const n = /(\d+) above/u.exec(row);
  return n === null ? -1 : Number(n[1]);
};

describe("C26 §7a — the pull, wired", () => {
  /**
   * **Asserted as a pair, and the pair is the row.** *Focus is unchanged by a
   * scroll* is satisfied by a build where scrolling does nothing at all, and
   * *the window follows focus* is satisfied by a build where scrolling moves
   * focus too. Neither half alone separates the design from its two opposites.
   */
  it("T4.31 (C26 I24, §7a, §021): scrolling does not move focus, and the next focus move pulls the window back", async () => {
    const { type, rows, stop } = await drive();
    const above = (): number => aboveIn(rows());

    await type("/deep\r");
    await type(DOWN); // the card's head is the first element (C09 I47)
    await type(DOWN); // and now the box's first child

    expect(rows(), "the box opens at its top").toContain("ALPHA");
    expect(above(), "with nothing above it").toBe(0);

    // **Walk focus down past the window.** Each step is one row, so the window
    // moves by one — the minimum, one row for one row.
    await type(DOWN);
    expect(above(), "the second row is still inside a box of two").toBe(0);
    await type(DOWN);
    expect(above(), "and the third pulled it by one, not to the row").toBe(1);
    await type(DOWN);
    expect(above(), "one row for one row").toBe(2);

    // **Scroll the box away from the focused row.** `PgUp` goes to the viewport
    // you are inside, which here is the box.
    await type(PAGE_UP);
    expect(above(), "the reader scrolled off the focused row").toBeLessThan(2);

    // **Focus did not move with it**, which is the refusal — and the
    // discriminator is the next move's *destination*. Focus is on the fourth
    // row; `↓` takes it to the fifth and pulls the window to 3. A build where
    // the scroll dragged focus along would have focus at the window's own top,
    // and `↓` would reach the row below it, already inside the window it
    // scrolled to: nothing would move and `above` would still read what the
    // page left.
    await type(DOWN);
    expect(above(), "the next focus move pulled the window back to where focus was").toBe(3);

    await stop();
  });

  /**
   * **The follow box, which is the state a mutation could not reach without
   * it** (C04 I97, C26 I24). An untouched following box sits at its tail and
   * the store holds nothing, so `get` reads `0` — the top — where `resolved`
   * reads the ceiling. The two answers reach the frame as two different
   * windows the moment focus enters, and no row in the tree constructed a
   * following box with focus in it.
   */
  it("T4.33 (C26 I24, §7a, C04 I97): a following box is pulled from where it is drawn", async () => {
    const { type, rows, stop } = await drive();
    const above = (): number => aboveIn(rows());

    await type("/tail\r");
    expect(above(), "untouched and following, the box opens at its tail").toBe(6);

    await type(DOWN); // the card's head
    await type(DOWN); // into the box, on its first child
    expect(above(), "entering it pulls the window to the focused row").toBe(0);

    await stop();
  });

  /**
   * **The tape's half, and it measures less than it reads as.** The held start
   * and one recomputed from the head differ only where the current moves
   * *backwards*, and in this build a tape's `current` is producer data that
   * changes by a far-side patch alone — no key moves it — so a session cannot
   * construct the case. T1.50 measures it against `tapeStart` directly, where
   * the held start is an argument.
   *
   * What is left here is the path and the ceiling, and the ceiling is the arm
   * with somewhere to fail: a start written while the terminal was narrow
   * survives a widening unless something clamps it, which is C04 I48's
   * `content − interior` in the tape's unit.
   */
  it("T4.32 (C26 I25, §7a, C04 I125): a tape keeps its window across a resize and gives it back when the room returns", async () => {
    const { type, rows, resize, stop } = await drive({ columns: 100, rows: 30 });

    // The row with the current's lead — the command echo also says GOLF.
    const tapeRow = (): string => rows().split("\n").find((r) => r.includes("›")) ?? "";

    await type("/strip GOLF\r");
    expect(tapeRow(), "wide, the whole tape is there").toContain("ALPHA");
    expect(tapeRow(), "and nothing is hidden").not.toMatch(/«\d/u);

    resize({ columns: 30, rows: 30 });
    await type(META_DOWN);
    await type(META_UP);
    const narrow = tapeRow();
    expect(narrow, "narrow, the window slid to the current").toMatch(/«\d/u);
    expect(narrow, "which is the last member").toContain("GOLF");
    expect(narrow, "and the head is offscreen, not shed").not.toContain("ALPHA");

    resize({ columns: 100, rows: 30 });
    await type(META_DOWN);
    await type(META_UP);
    const wide = tapeRow();
    expect(wide, "the room came back and so did the tape").toContain("ALPHA");
    expect(wide, "with no mark beside empty space").not.toMatch(/«\d/u);

    await stop();
  });
});
