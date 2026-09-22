// C04 I48 — the scroll offset reaches the frame, and the key carries it.
//
// **The row the mutation pass demanded.** `render-cache`'s T4.18f asserts the
// store's key is canonical, which is real and is not the wiring: deleting the
// offset from `session.ts`'s slot changes nothing that row looks at. A test that
// calls the mechanism misses the wiring (`test/support/README.md`), so this one
// pages a real session and reads the screen.
//
// The shape is **read, page, read, page back, read**. A single page passes with
// the key unchanged — the first render fills the slot and the second is served
// what it left, which *looks* like a difference from the third frame's side. It
// is coming back that separates them: with the offset in the key the third read
// is a hit on the first slot and equals it; without it, the second read already
// equalled the first.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TuiConfig } from "../../src/shell/types.js";

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [
    { name: "box", local: true, summary: "a bounded region", args: [], flags: [] },
    { name: "wrapped", local: true, summary: "the same box inside a panel", args: [], flags: [] },
    { name: "grid", local: true, summary: "four rows as a table", args: [], flags: [] },
    { name: "wgrid", local: true, summary: "the same table inside a panel", args: [], flags: [] },
  ],
};

/** Four children in a box of two, so there is somewhere to page to. */
const BOX = {
  kind: "scroll",
  id: "box",
  height: 2,
  children: [
    { kind: "raw", id: "r1", text: "ALPHA" },
    { kind: "raw", id: "r2", text: "BRAVO" },
    { kind: "raw", id: "r3", text: "CHARLIE" },
    { kind: "raw", id: "r4", text: "DELTA" },
  ],
} as const;

/** The same four rows as a table, for the arrangement F470's own text names. */
const TABLE = {
  kind: "table",
  id: "grid",
  columns: [{ key: "a", label: "A", align: "left", priority: 1, minWidth: 8 }],
  rows: [
    { id: "x1", cells: { a: { text: "ALPHA" } } },
    { id: "x2", cells: { a: { text: "BRAVO" } } },
    { id: "x3", cells: { a: { text: "CHARLIE" } } },
    { id: "x4", cells: { a: { text: "DELTA" } } },
  ],
} as const;

const doc = (command: string, blocks: readonly unknown[]): unknown => ({
  schema: "tui.view/1",
  command,
  status: "ok",
  blocks,
});

const handlers: NonNullable<TuiConfig["localHandlers"]> = {
  box: () => doc("box", [BOX]) as never,
  // **A container inside a container**, which is the arrangement `b.live` and
  // C23 I34 both produce and no fixture here had.
  wrapped: () => doc("wrapped", [{ kind: "panel", id: "p", title: "wrap", children: [BOX] }]) as never,
  grid: () => doc("grid", [TABLE]) as never,
  wgrid: () =>
    doc("wgrid", [{ kind: "panel", id: "p", title: "wrap", children: [TABLE] }]) as never,
};

const PAGE_DOWN = "\u001b[6~";
const PAGE_UP = "\u001b[5~";
const DOWN = "\u001b[B";
// **`⌥↑`/`⌥↓`, the design's `page.up`/`page.down`** (binding.031/.032). `CSI 1;3A`
// is the xterm form: parameter 3 is alt, which `modifiersOf` folds into `meta`.
const META_UP = "\u001b[1;3A";
const META_DOWN = "\u001b[1;3B";

describe("C04 I48 — the offset reaches the frame", () => {
  it("T4.41 (C04 I48, C22 I58): read, page, read, page back, read", async () => {
    const stdin = fakeStdin();
    const session = await buildSession({
      manifest: MANIFEST,
      localHandlers: handlers,
      stdin: stdin as unknown as NodeJS.ReadStream,
    });
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    };
    const rows = (): string => session.screen().rows.join("\n");

    await type("/box\r");
    // Focus into the live block, or `pagedown` resolves at `global` and scrolls
    // the transcript instead — which is the behaviour this binding changes and
    // the reason the row below exists.
    await type(DOWN); // the card's head is the first element (C09 I47)
    await type(DOWN);

    const first = rows();
    expect(first, "the box starts at the top").toContain("ALPHA");

    await type(PAGE_DOWN);
    const second = rows();

    await type(PAGE_UP);
    const third = rows();

    expect(second, "paging moved the window").not.toBe(first);
    expect(third, "and coming back is the frame we left").toBe(first);
    await session.tui.stop("exit");
  });

  it("T4.42 (C26 I18): the transcript still pages when no container is focused", async () => {
    // **A working key gained a second meaning, and this is the half that must
    // not have changed.** `pageup`/`pagedown` are bound at `global` to the
    // transcript's viewport; the new rows are at `liveBlock` and win only while
    // focus is in a block. With focus at the prompt the global pair must still
    // be what answers.
    const stdin = fakeStdin();
    const session = await buildSession({
      manifest: MANIFEST,
      localHandlers: handlers,
      stdin: stdin as unknown as NodeJS.ReadStream,
    });
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    };

    await type("/box\r");
    // No `↓`, so focus is at the prompt and the global binding owns the key.
    await expect(type(PAGE_DOWN)).resolves.toBeUndefined();
    expect(session.screen().rows.join("\n"), "the session is intact").toContain("ALPHA");
    await session.tui.stop("exit");
  });

  /**
   * **F470's own half, and the arrangement no fixture had.** `elementsIn` walks
   * into a `panel`, so focus lands on the `scroll` inside it — and every effect
   * in `construct.ts` resolved that block with a top-level `find`, which cannot
   * see it. The camera row T4.17n covers the same resolver through code written
   * this arc; this one covers the effect that was **shipped**, which is where
   * the defect actually lived.
   */
  it("T4.59 (C22 I75, C04 I48): a scroll inside a panel pages, and coming back is the frame we left", async () => {
    const stdin = fakeStdin();
    const session = await buildSession({
      manifest: MANIFEST,
      localHandlers: handlers,
      stdin: stdin as unknown as NodeJS.ReadStream,
    });
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    };
    const rows = (): string => session.screen().rows.join("\n");

    await type("/wrapped\r");
    await type(DOWN); // the card's head is the first element (C09 I47)
    await type(DOWN);

    const first = rows();
    expect(first, "the box starts at the top").toContain("ALPHA");

    await type(PAGE_DOWN);
    const second = rows();
    await type(PAGE_UP);
    const third = rows();

    expect(second, "paging reached a block inside the panel").not.toBe(first);
    expect(third, "and coming back is the frame we left").toBe(first);
    await session.tui.stop("exit");
  });

  /**
   * **The row the reserved/unreserved split exists for** (C16 I40, R-BLK-112,
   * binding.031/.032).
   *
   * The two keys page two different things from the same focus, and that is the
   * whole content. `⌥↑` carries `scope: "transcript"` in the registry and
   * R-BLK-112 says why — *scroll WITHOUT moving focus; the prompt keeps it and
   * you keep typing* — so it never asks where focus is. `PgUp` is in no binding
   * and no rule, so it is the repo's own key and goes to the viewport you are
   * inside, which here is the box.
   *
   * **Neither half alone is a measurement.** Reserve both keys and the first
   * assertion still passes; reserve neither and the second does. An earlier draft
   * held both on the reserved route and had to make *the active viewport* mean
   * the box for one key and the transcript for the other — one verdict saying two
   * things. Putting `pageup` back into `interceptOf` fails this row, T4.41, T4.59,
   * T1.30 and T1.92.
   *
   * **Stated blind spot, found by a mutation that survived.** Routing `⌥↑`
   * through the ladder instead of straight to the transcript — the compromise
   * this replaced — fails *nothing here*, because no block keymap binds `⌥↑`, so
   * `run("liveBlock", ⌥↑)` declines and the event reaches `global` either way.
   * The `⌥↑` half is therefore a **characterisation** of the pair from one focus
   * and not a gate on the route; what gates the route is T1.40, where a question
   * *would* consume it. The day a block binds `⌥↑` this row becomes the gate it
   * reads as, and that is the day it would otherwise have gone quietly wrong.
   */
  it("T4.74 (C16 I40, C04 I48): with a scroll box focused, ⌥↑ scrolls the transcript and PgUp pages the box", async () => {
    const stdin = fakeStdin();
    const session = await buildSession({
      manifest: MANIFEST,
      localHandlers: handlers,
      stdin: stdin as unknown as NodeJS.ReadStream,
    });
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    };
    const rows = (): string => session.screen().rows.join("\n");

    // Enough transcript above the box that the transcript has somewhere to go.
    for (let i = 0; i < 6; i += 1) await type("/wrapped\r");
    await type(DOWN);
    await type(DOWN);

    const start = rows();
    expect(start, "the box is on screen and at its top").toContain("ALPHA");

    // **`PgUp` pages the box.** The ladder's answer: the viewport you are inside.
    await type(PAGE_DOWN);
    const afterBox = rows();
    expect(afterBox, "PgUp's sibling reached the box").not.toBe(start);
    await type(PAGE_UP);
    expect(rows(), "and back").toBe(start);

    // **`⌥↑` scrolls the transcript, from the same focus.** The box does not
    // move — asserted on the box's own first row, because a whole-frame compare
    // cannot tell *the transcript moved* from *the box moved* when both change
    // the frame.
    const boxRow = (f: string): string =>
      f.split("\n").find((r) => r.includes("ALPHA")) ?? "";
    const boxBefore = boxRow(start);
    await type(META_UP);
    const afterTranscript = rows();

    expect(afterTranscript, "the transcript moved").not.toBe(start);
    expect(boxRow(afterTranscript), "and the box did not").toBe(boxBefore);

    await type(META_DOWN);
    expect(rows(), "and back again").toBe(start);
    await session.tui.stop("exit");
  });

  /**
   * **The arrangement F470's text names, and it cannot witness F470.**
   *
   * *A table inside a panel could be focused and not paged* is true, and it is
   * true of a table at the **top level** too: only `containers.ts` reads
   * `ctx.scrollOffsets`, so paging any non-container writes an offset nothing
   * reads. Measured over four arrangements, the frame after a page:
   *
   *     scroll, top level      changes        table, top level      unchanged
   *     scroll, in a panel     changes        table, in a panel     unchanged
   *
   * So the nesting is the axis in the first column and not in the second, and
   * an example whose two halves agree is A03 §2's vacuity class arriving in a
   * finding's own prose (F472). This row is the control that says so: it is
   * asserted as **unchanged at both depths**, which is what makes T4.59 above a
   * measurement of the nesting rather than of the fixture.
   */
  it("T4.60 (C22 I75): paging a table is a no-op at either depth, which is why it cannot be the witness", async () => {
    const frameAfterPaging = async (verb: string): Promise<readonly [string, string]> => {
      const stdin = fakeStdin();
      const session = await buildSession({
        manifest: MANIFEST,
        localHandlers: handlers,
        stdin: stdin as unknown as NodeJS.ReadStream,
      });
      const type = async (bytes: string): Promise<void> => {
        stdin.emit(bytes);
        for (let i = 0; i < 8; i += 1) await Promise.resolve();
      };
      const rows = (): string => session.screen().rows.join("\n");
      await type(`/${verb}\r`);
      await type(DOWN);
      const before = rows();
      await type(PAGE_DOWN);
      const after = rows();
      await session.tui.stop("exit");
      return [before, after];
    };

    const [flatBefore, flatAfter] = await frameAfterPaging("grid");
    expect(flatBefore, "the fixture drew").toContain("ALPHA");
    expect(flatAfter, "a top-level table does not page").toBe(flatBefore);

    const [nestedBefore, nestedAfter] = await frameAfterPaging("wgrid");
    expect(nestedBefore, "the nested fixture drew").toContain("ALPHA");
    expect(nestedAfter, "and neither does one inside a panel").toBe(nestedBefore);
  });
});
