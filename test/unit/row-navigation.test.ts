// C26 §8c — along a row of elements, and leaving it (review batch 4, M14.1;
// ruling 80, D10).
//
// **One document holding every row shape the walk classified** (§8c.2): a
// tape, a table whose rows are one element each, and a split whose two panes
// each hold a row of chips. The panes overlap on screen by construction, which
// is the cell where *one row* and I28 meet.
import { describe, expect, it } from "vitest";

import { buildGraph } from "../support/session.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";

const key = (name: string): Key => ({ name, ctrl: false, meta: false, shift: false, sequence: name });
const press = (name: string): InputEvent => ({ kind: "key", key: key(name) });

const chips = (prefix: string): readonly unknown[] =>
  [0, 1].map((i) => ({ label: `${prefix}${String(i)}`, action: { kind: "fill", label: "x", command: `/${prefix}${String(i)}` } }));

const DOC = {
  schema: "tui.view/1",
  command: "/rows",
  status: "ok",
  meta: { verb: "rows", adapter: "passthrough", exitCode: 0, durationMs: 0, truncated: false, argv: [], stderr: "", transport: "local", origin: "user" },
  blocks: [
    {
      kind: "tape",
      id: "strip",
      members: ["m0", "m1", "m2", "m3", "m4"].map((id) => ({ id, label: id, state: "succeeded" })),
      current: "m2",
    },
    {
      kind: "table",
      id: "t",
      columns: [{ key: "name", label: "Name", align: "left", priority: 10, minWidth: 12, sortable: false }],
      rows: [
        { id: "a", cells: { name: { text: "alpha" } } },
        { id: "b", cells: { name: { text: "bravo" } } },
      ],
    },
    {
      kind: "split",
      id: "s",
      height: 2,
      children: [
        { kind: "pills", id: "L", chips: chips("l") },
        { kind: "pills", id: "R", chips: chips("r") },
      ],
    },
  ],
};

const where = (graph: Awaited<ReturnType<typeof buildGraph>>["graph"]): string => {
  const at = graph.focus.current;
  return at.at === "liveBlock" ? `${at.element?.blockId ?? ""}/${at.element?.elementId ?? ""}` : at.at;
};

describe("C26 §8c — a row of elements", () => {
  it("C26 T1.164 (I30, I28): ←/→ step a row's elements in order, stop at its ends, and cross a split only at the row's end", async () => {
    const { graph } = await buildGraph();
    graph.transcript.append(DOC as never);
    const go = (name: string): string => {
      graph.router.dispatch(press(name));
      return where(graph);
    };

    expect(go("down"), "↓ enters on the tape's first member").toBe("strip/m0");
    // **Along the tape, in member order** — where `→` used to do nothing.
    expect(go("right")).toBe("strip/m1");
    expect(go("right")).toBe("strip/m2");
    expect(go("right")).toBe("strip/m3");
    expect(go("right")).toBe("strip/m4");
    expect(go("right"), "the row's end outside a split is a stop").toBe("strip/m4");
    expect(go("left")).toBe("strip/m3");

    // A table's rows are one element each: nothing shares their row.
    expect(go("down"), "↓ leaves the tape").toBe("t/a");
    expect(go("right"), "a row of one has nowhere to go").toBe("t/a");

    // **The split, where the two rules meet** (§8c.2 row 4, row 6).
    expect(go("down")).toBe("t/b");
    expect(go("down"), "a split is entered on its left pane").toBe("L/chip-0");
    expect(go("right"), "along the left pane's row first").toBe("L/chip-1");
    expect(go("right"), "and across the divider at its end").toBe("R/chip-0");
    expect(go("right")).toBe("R/chip-1");
    expect(go("right"), "the right pane's end is a stop").toBe("R/chip-1");
    expect(go("left")).toBe("R/chip-0");
    // **Back across at its start, to the left pane's element nearest on
    // screen** (C26 I28) — its first. Were a split one wide row, `←` would have
    // stepped to the left pane's *last* chip instead.
    expect(go("left"), "and back across at its start").toBe("L/chip-0");
  });

  it("C26 T1.165 (I30, D10): ↓ and ↑ leave the row and land on the first element of the row they enter", async () => {
    const { graph } = await buildGraph();
    graph.transcript.append(DOC as never);
    const go = (name: string): string => {
      graph.router.dispatch(press(name));
      return where(graph);
    };

    go("down");
    go("right");
    go("right");
    expect(go("right")).toBe("strip/m3");
    // **`↓` leaves the row** rather than walking it — the old step was `m4`.
    expect(go("down"), "↓ from m3 is the next row, not the next member").toBe("t/a");
    expect(go("down"), "a table still steps a row at a time").toBe("t/b");
    expect(go("up")).toBe("t/a");
    // **And `↑` lands on the row's first element**, not on the member nearest
    // in element order — which is `m4`, the one a reading-order step reaches.
    expect(go("up"), "↑ into the tape lands on m0").toBe("strip/m0");
    // From the first row of the live entry, `↑` leaves for the prompt (C26 I21) —
    // from any member of it, because the row is the first row.
    go("right");
    go("right");
    expect(go("up"), "↑ from m2 leaves").toBe("prompt");
  });

  it("C26 T1.167 (I30, §8c.6, F1449): ↓ and ↑ enter a row on the element drawn nearest the column they left", async () => {
    // **Every row shape the column rule meets** (§8c.6's table): a mosaic's
    // grid, a row of three over a row of two whose cells do not line up, and a
    // full-width row between two grid rows. Each row is entered from a cell
    // that is not its first, so the old rule — *the first element of the row
    // it enters* — answers differently at every step below.
    const pills = (id: string, labels: readonly string[]): unknown => ({
      kind: "pills",
      id,
      chips: labels.map((label) => ({ label, action: { kind: "fill", label: "x", command: `/${label}` } })),
    });
    const notice = (id: string): unknown => ({
      kind: "notice", id, tone: "info", text: id, action: { kind: "fill", label: "x", command: `/${id}` },
    });
    const { graph } = await buildGraph();
    graph.transcript.append({
      ...DOC,
      blocks: [
        { kind: "mosaic", id: "m", height: 4, areas: "ab/cd", children: ["a", "b", "c", "d"].map(notice) },
        pills("three", ["aaaa", "bbbb", "cccc"]),
        pills("two", ["xxxxxxx", "y"]),
        DOC.blocks[1],
        pills("after", ["p", "q"]),
      ],
    } as never);
    const go = (name: string): string => {
      graph.router.dispatch(press(name));
      return where(graph);
    };

    expect(go("down"), "the grid is entered at its first cell").toBe("m/a");
    expect(go("right")).toBe("m/b");
    // **The cell below, not the next row's first** (F1449).
    expect(go("down"), "↓ from the second column keeps it").toBe("m/d");
    expect(go("up"), "and ↑ returns to it").toBe("m/b");
    expect(go("down")).toBe("m/d");

    // Past every cell's end — the grid's second column starts at half the
    // width, right of the whole chip row — the row's last.
    expect(go("down"), "↓ from the grid's second column lands on the row's last").toBe("three/chip-2");
    expect(go("down"), "and again, from a cell right of the shorter row").toBe("two/chip-1");
    // Three over two, cells that do not line up: the first of the row whose
    // drawn columns end past the focused one's start.
    expect(go("up"), "↑ from the second cell of two").toBe("three/chip-1");
    expect(go("down"), "the middle cell lands on the cell under its left edge").toBe("two/chip-0");

    // **No goal column**: a full-width row between two grid rows resets it.
    expect(go("down"), "a table row spans the width").toBe("t/a");
    go("down");
    expect(go("down"), "and the next grid row is entered from column 0").toBe("after/chip-0");
  });
});
