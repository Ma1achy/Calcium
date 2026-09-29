// C26 I32 — the pull re-runs on a layout change unless the box was scrolled by
// hand since focus arrived (review batch 4, M14.5; D15).
//
// **Each row asserts both halves of the latch**, because each half alone is
// satisfied by one of the two defects. *A patch re-pulls* is satisfied by a
// pull that fires on every viewport change, which undoes a reader's scroll a
// frame later (T4.31's defect). *A scroll survives a patch* is satisfied by the
// old key, which never re-pulled at all.
import { describe, expect, it } from "vitest";

import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
import type { TuiConfig } from "../../src/shell/types.js";

const REGION = { top: 1, left: 1, height: 20 };
/**
 * **Through the reader, not `router.dispatch`**: the pull runs after the keys
 * a read delivered (C26 I24), and a dispatch straight to the router skips it,
 * so a row driven that way measures a pull that never ran.
 */
const KEYS = { down: "\u001b[B", pagedown: "\u001b[6~" } as const;
/**
 * A wheel-down at a terminal row and a transcript column. **Dispatched to the
 * router**, because the latch is set by the wheel's own effect and the pull it
 * gates runs on the patch that follows, not on this event.
 */
const wheel = (row: number, col: number): InputEvent => ({
  kind: "mouse",
  row,
  col: REGION.left + col,
  button: "wheelDown",
  press: true,
  shift: false,
  meta: false,
  ctrl: false,
  motion: false,
});

const META = {
  verb: "box",
  adapter: "passthrough",
  exitCode: 0,
  durationMs: 0,
  truncated: false,
  argv: [] as string[],
  stderr: "",
  transport: "local",
  origin: "user",
};
const doc = (blocks: readonly unknown[]) => ({ schema: "tui.view/1", command: "/box", status: "ok", blocks, meta: META });

/** A box of two over `ids`, one row each. */
const box = (id: string, ids: readonly string[]) => ({
  kind: "scroll",
  id,
  height: 2,
  children: ids.map((c) => ({ kind: "raw", id: c, text: c.toUpperCase() })),
});
const EIGHT = ["n0", "n1", "n2", "n3", "n4", "n5", "n6", "n7"];
/** Four new children ahead of the focused one, so its rows move by four. */
const AHEAD = ["x0", "x1", "x2", "x3"];

async function graphAt80() {
  const built = await buildGraph({}, { columns: 80, rows: 30 });
  built.graph.lifecycle.acquire();
  built.graph.viewport.resize({ width: 80, height: REGION.height });
  const type = async (bytes: string): Promise<void> => {
    built.stdin.emit(bytes);
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  };
  const term = (transcriptRow: number): number => {
    const { totalRows } = built.graph.viewport.scroll;
    return REGION.top + Math.max(0, REGION.height - totalRows) + transcriptRow;
  };
  return { ...built, term, type };
}

describe("C26 I32 — re-pull and the latch", () => {
  it("C26 T4.35 (I32): a resize that moves the focused child re-pulls its box", async () => {
    // **Children whose height is the width's**: a notice of ninety cells is
    // one row at 120 columns and two at 60, so the same focused child sits at
    // row 3 and then at row 6 — outside a window that has not moved.
    const text = (i: number): string => `${String(i)} ${"lorem ipsum dolor ".repeat(5)}`.slice(0, 90);
    const stdin = fakeStdin();
    const handlers: NonNullable<TuiConfig["localHandlers"]> = {
      wide: (() => ({
        schema: "tui.view/1",
        command: "wide",
        status: "ok",
        blocks: [
          {
            kind: "scroll",
            id: "box",
            height: 2,
            children: [0, 1, 2, 3, 4, 5].map((i) => ({ kind: "notice", id: `w${String(i)}`, tone: "info", text: text(i) })),
          },
        ],
      })) as never,
    };
    const session = await buildSession(
      {
        manifest: {
          schema: "tui.manifest/1",
          binary: "prism",
          version: "1.0.0",
          tools: [{ name: "wide", local: true, summary: "notices that wrap", args: [], flags: [] }],
        },
        localHandlers: handlers,
        stdin: stdin as unknown as NodeJS.ReadStream,
      },
      { columns: 120, rows: 24 },
    );
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    };
    const above = (): number => {
      const row = session.screen().rows.find((r) => r.includes("above,")) ?? "";
      const n = /(\d+) above/u.exec(row);
      return n === null ? -1 : Number(n[1]);
    };
    await type("/wide\r");
    await type("\u001b[B"); // the card's head
    for (let i = 0; i < 4; i += 1) await type("\u001b[B"); // w0 … w3
    const wide = above();
    expect(wide, "one row a child: w3 at row 3 pulls the window to 2").toBe(2);

    session.resize({ columns: 60, rows: 24 });
    // A resize is a frame the scheduler composes on its own clock, not a key.
    await new Promise((r) => setTimeout(r, 50));
    // At 60 columns each child is two rows, so w3 is rows 6–7 and the window
    // that stood at 2 shows w1. Re-pulled, it starts where w3 does.
    expect(above(), "the resize re-pulled the box to w3").toBe(6);
    await session.tui.stop("exit");
  });

  it("C26 T4.36 (I32): a patch that moves the focused child re-pulls its box", async () => {
    const { graph, type } = await graphAt80();
    const id = graph.transcript.append(doc([box("s", EIGHT)]) as never);
    const offset = (): number => graph.scrollOffsets.get(id, "s");
    for (let i = 0; i < 4; i += 1) await type(KEYS.down);
    expect(offset(), "n3 pulls the box of two to 2").toBe(2);

    const r = graph.transcript.patch(id, { op: "replace", blockId: "s", block: box("s", [...AHEAD, ...EIGHT]) } as never, "shell");
    expect(r.ok, "the patch applied").toBe(true);
    // n3 is child 7 now: the minimum that shows it starts at 6.
    expect(offset(), "the patch re-pulled the box to n3").toBe(6);
  });

  it("C26 T4.37 (I32, D15): a page key latches the box until focus moves, and the wheel latches only the box under it", async () => {
    const { graph, type } = await graphAt80();
    const id = graph.transcript.append(doc([box("s", EIGHT)]) as never);
    const offset = (): number => graph.scrollOffsets.get(id, "s");
    for (let i = 0; i < 4; i += 1) await type(KEYS.down);
    expect(offset()).toBe(2);

    // **The reader moves the window**, and a patch then leaves it there.
    await type(KEYS.pagedown);
    const paged = offset();
    expect(paged, "PgDn moved the box").toBeGreaterThan(2);
    graph.transcript.patch(id, { op: "replace", blockId: "s", block: box("s", [...AHEAD, ...EIGHT]) } as never, "shell");
    expect(offset(), "latched: the patch did not drag the box back to n3").toBe(paged);

    // **Focus moves, so the latch is dropped**, and the next patch re-pulls.
    await type(KEYS.down); // n4, child 8
    expect(offset(), "the move pulled").toBe(7);
    graph.transcript.patch(id, { op: "replace", blockId: "s", block: box("s", ["y0", ...AHEAD, ...EIGHT]) } as never, "shell");
    expect(offset(), "and a patch follows again").toBe(8);

    // ---- per box -----------------------------------------------------------
    // Two boxes: focus in `a`, the wheel over `b`. The entry's chrome is row 0,
    // `a` rows 1–2 with its residue at 3, a gap at 4, so `b`'s first row is 5.
    // Asserted rather than trusted: `a` must not move under the wheel.
    const two = await graphAt80();
    const two2 = two.graph.transcript.append(doc([box("a", EIGHT), box("b", EIGHT.map((x) => `b${x}`))]) as never);
    for (let i = 0; i < 4; i += 1) await two.type(KEYS.down);
    expect(two.graph.scrollOffsets.get(two2, "a")).toBe(2);
    expect(two.graph.router.dispatch(wheel(two.term(5), 2)), "the wheel over b").toBe(true);
    expect(two.graph.scrollOffsets.get(two2, "a"), "the wheel was not over a").toBe(2);
    expect(two.graph.scrollOffsets.get(two2, "b"), "b moved").toBeGreaterThan(0);
    two.graph.transcript.patch(two2, { op: "replace", blockId: "a", block: box("a", [...AHEAD, ...EIGHT]) } as never, "shell");
    expect(two.graph.scrollOffsets.get(two2, "a"), "a, never scrolled by hand, still follows").toBe(6);

    // **And the wheel latches the box it is over**, when focus is in it: the
    // wheel over `a` moves it, and the next patch leaves it where it went.
    expect(two.graph.router.dispatch(wheel(two.term(1), 2)), "the wheel over a").toBe(true);
    const wheeled = two.graph.scrollOffsets.get(two2, "a");
    expect(wheeled, "a moved under the wheel").not.toBe(6);
    two.graph.transcript.patch(two2, { op: "replace", blockId: "a", block: box("a", ["z0", ...AHEAD, ...EIGHT]) } as never, "shell");
    expect(two.graph.scrollOffsets.get(two2, "a"), "latched: the patch did not pull a back").toBe(wheeled);
  });
});
