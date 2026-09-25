// C22 I117 — the shell keeps a split's panes (C04 §3aq, C26 I28, C16 I59).
//
// **Bytes in, through stdin**, because the pane rule lives in the effects and
// the pull runs in the read loop after them (C26 I24): a row calling the router
// directly would test the mechanism and miss the wiring. Two harnesses, for
// peek.test's reason — `buildGraph` for focus and the stores, `buildSession`
// for what reaches the screen.
import { describe, expect, it, vi } from "vitest";

import { splitPaneKey } from "../../src/data/viewmodel/index.js";
import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const ESC = "\u001b";
const DOWN = `${ESC}[B`;
const UP = `${ESC}[A`;
const LEFT = `${ESC}[D`;
const RIGHT = `${ESC}[C`;
const ALT_LEFT = `${ESC}[1;3D`;
const ALT_RIGHT = `${ESC}[1;3C`;

/** SGR 1006 — `Cb` 0 is button 1 down, 32 the same button reported moving. */
const press = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}M`;
const moveTo = (col: number, row: number): string => `${ESC}[<32;${String(col)};${String(row)}M`;
const release = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}m`;

const META = {
  verb: "split",
  adapter: "passthrough",
  exitCode: 0,
  durationMs: 0,
  truncated: false,
  argv: [] as string[],
  stderr: "",
  transport: "local",
  origin: "user",
};

const table = (id: string, row: string) => ({
  kind: "table",
  id,
  columns: [{ key: "name", label: "Name", align: "left", priority: 10, minWidth: 12, sortable: false }],
  rows: [{ id: row, cells: { name: { text: row } } }],
});

/** A table, §105's split — a five-row tree over three rows beside five lines of code — and a table. */
const BLOCKS = [
  table("before", "above"),
  {
    kind: "split",
    id: "s",
    height: 3,
    children: [
      {
        kind: "tree",
        id: "files",
        nodes: [
          {
            id: "src",
            label: "src",
            expanded: true,
            children: [
              { id: "a", label: "alpha.ts" },
              { id: "b", label: "bravo.ts" },
              { id: "c", label: "charlie.ts" },
              { id: "d", label: "delta.ts" },
            ],
          },
        ],
      },
      { kind: "code", id: "code", language: "typescript", text: "export function layout() {\n  one;\n  two;\n  three;\n}" },
    ],
  },
  table("after", "below"),
];

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

async function seeded() {
  const built = await buildGraph();
  built.graph.lifecycle.acquire();
  built.graph.transcript.append(
    { schema: "tui.view/1", command: "/split", status: "ok", blocks: BLOCKS, meta: META } as never,
    { streaming: true },
  );
  built.graph.editor.clear();
  const type = (bytes: string): void => void built.stdin.emit(bytes);
  const focused = (): string => {
    const at = built.graph.focus.current;
    return at.at === "liveBlock" ? at.element?.elementId ?? "" : "prompt";
  };
  const split = () => built.graph.transcript.entries[0]?.doc.blocks[1] as { divider?: number } | undefined;
  const entryId = built.graph.transcript.entries[0]?.id ?? "";
  /** The pane's offset, resolved as the renderer clamps it — the tree is five rows in three. */
  const offset = (side: number): number =>
    built.graph.scrollOffsets.resolved(entryId, splitPaneKey("s", side), { ceiling: 2 });
  return { ...built, type, focused, split, offset };
}

/** A painting session holding the same entry, and the rows the split drew. */
async function painted() {
  vi.useFakeTimers();
  const stdin = fakeStdin();
  const session = await buildSession(
    {
      stdin: stdin as never,
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "split", local: true, summary: "a split", args: [], flags: [] }],
      },
      localHandlers: { split: () => ({ schema: "tui.view/1", status: "ok", blocks: BLOCKS }) },
    } as never,
    { columns: 60, rows: 24 },
  );
  const step = async (ms = 0): Promise<void> => {
    session.clock.advance(ms);
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
  };
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await step();
  };
  await step();
  await type("/split\r");
  await step(50);
  /** The screen rows holding the split, by its first code line. */
  const rows = (): readonly string[] => {
    const all = session.screen().rows;
    const at = all.findIndex((r) => r.includes("export function"));
    return at < 0 ? [] : all.slice(at, at + 3);
  };
  const top = (): number => session.screen().rows.findIndex((r) => r.includes("export function"));
  /**
   * The divider's column: the cell before the blank before the code pane's
   * first line. Not *the first bar on the row* — the card's gutter and the
   * tree's guides are bars too, and a reader that took the first one measured
   * the gutter (read off the frame).
   */
  const dividerCol = (row: string): number => row.indexOf(" export") - 1;
  return { ...session, step, type, rows, top, dividerCol };
}

describe("C22 I117 — a split in a session", () => {
  it("T4.96 (C22 I117, C26 I28, C04 §3aq E1–E3): the arrows keep to a pane and cross it on ←→", async () => {
    const s = await seeded();
    s.type(DOWN);
    expect(s.focused(), "↓ from the prompt enters the table above").toBe("above");
    for (const want of ["src", "a", "b", "c", "d"]) {
      s.type(DOWN);
      expect(s.focused(), `↓ walks the left pane — ${want}`).toBe(want);
    }
    // The pull (C26 I24): `d` is the fifth content row of a three-row pane, so
    // the window starts at 2 — by the minimum, not re-centred.
    // Resolved against its ceiling: a pane pulled to its end is held as the
    // store's `TAIL`, as a scroll box's is (C04 I97), and reads as the ceiling.
    expect(s.offset(0), "the left pane pulled by the minimum").toBe(2);

    // E1 — the right pane is passed over.
    s.type(DOWN);
    expect(s.focused(), "↓ from the left pane's last row skips the right pane").toBe("below");
    // E2 — entered from below on the left pane.
    s.type(UP);
    expect(s.focused(), "↑ from under the split lands on the left pane's last").toBe("d");

    // E3 — across the divider, and back to the row nearest on screen. The code
    // pane's first line is on the split's first screen row, and with the left
    // pane scrolled 2 that row shows `b`.
    s.type(RIGHT);
    expect(s.focused(), "→ lands on the code pane").toBe("code");
    s.type(LEFT);
    expect(s.focused(), "← lands on the tree row on the same screen row").toBe("b");
    // And ↑ inside the right pane never climbs into the left.
    s.type(RIGHT);
    s.type(UP);
    expect(s.focused(), "↑ from the code pane leaves the split upwards").toBe("above");

    // The frame: the divider's thumb moved with the left pane's offset.
    const p = await painted();
    try {
      const col = p.dividerCol(p.rows()[0] ?? "");
      const before = p.rows().map((r) => r[col]);
      expect(before.join(""), "the divider carries the left pane's bar").toMatch(/[┃╽╿]/u);
      for (let i = 0; i < 7; i += 1) await p.type(DOWN);
      const after = p.rows().map((r) => r[col]);
      expect(after, "focus pulled the pane, and the thumb moved").not.toEqual(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.97 (C22 I117, C16 I59, C04 §3aq E4, E7): ⌥←→ move the divider, and stay word motion in the prompt", async () => {
    const s = await seeded();
    s.type(DOWN);
    s.type(DOWN);
    expect(s.focused()).toBe("src");
    expect(s.split()?.divider, "no divider held before the key").toBeUndefined();
    s.type(ALT_RIGHT);
    const first = s.split()?.divider ?? -1;
    expect(first, "⌥→ writes the divider").toBeGreaterThan(1);
    s.type(ALT_RIGHT);
    expect(s.split()?.divider, "one cell per press").toBe(first + 1);
    s.type(ALT_LEFT);
    expect(s.split()?.divider, "and back").toBe(first);
    expect(s.focused(), "focus stays on its element through all three").toBe("src");

    // E7 — at the prompt the chord is word motion and the split does not move.
    s.graph.focus.toPrompt();
    s.graph.editor.setText("hello world");
    s.type(ALT_LEFT);
    expect(s.graph.editor.cursor, "⌥← is word-left in the prompt").toBe(6);
    expect(s.split()?.divider, "the divider did not move").toBe(first);

    // The frame: one column to the right.
    const p = await painted();
    try {
      await p.type(DOWN);
      await p.type(DOWN);
      await p.type(DOWN);
      const at = p.dividerCol(p.rows()[0] ?? "");
      await p.type(ALT_RIGHT);
      expect(p.dividerCol(p.rows()[0] ?? ""), "the divider is one column right on the screen").toBe(at + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.98 (C22 I117, C04 §3aq E5): the pointer drags the divider", async () => {
    const p = await painted();
    try {
      const row = p.top() + 1;
      const col = p.dividerCol(p.rows()[0] ?? "") + 1;
      expect(col > 1 && row > 0, "the split is on the screen").toBe(true);
      await p.type(press(col, row));
      await p.type(moveTo(col + 5, row));
      await p.type(release(col + 5, row));
      expect(p.dividerCol(p.rows()[0] ?? "") + 1, "five columns right").toBe(col + 5);
      // After the release a motion moves nothing.
      await p.type(moveTo(col + 8, row));
      expect(p.dividerCol(p.rows()[0] ?? "") + 1, "the drag ended on release").toBe(col + 5);
      // And focus never left the prompt: a letter lands there.
      await p.type("q");
      expect(p.screen().rows.map((r) => r.trimEnd()), "the prompt took the key").toContain("❯ q");
    } finally {
      vi.useRealTimers();
    }
  });
});
