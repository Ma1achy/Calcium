// C22 I76 — the crosshair's writer, and the seventh render-key axis.
//
// **`cursorPositions` was the counter-example the camera was built against**
// (C22 I71): read in one place, written by nothing in `src/`, in no key. The
// plot-interaction suite injected it directly into the render context and passed
// for as long as it did, which is why nothing noticed — a field a test supplies
// is a field whose writer is never asked for.
//
// The rows are I71's three, applied to this field: the store alone, the writer
// alone (a key press, asserted on the store), and the pair through a frame.
import { describe, expect, it } from "vitest";

import { CursorPositions } from "../../src/shell/cursor-positions.js";
import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";

const key = (k: { name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): Key => ({
  name: k.name,
  ctrl: k.ctrl ?? false,
  meta: k.meta ?? false,
  shift: k.shift ?? false,
  sequence: k.name,
});
const press = (name: string): InputEvent => ({ kind: "key", key: key({ name }) });

const DOWN = "[B";
const RIGHT = "[C";
const LEFT = "[D";

/**
 * A line plot with samples, which is what declares its element (C12 I85).
 *
 * **No camera.** I85 once gated the element on the camera alone, and this
 * fixture reached a line plot through `camera: {}` because that was the only
 * constructible route to a focusable 2D plot; I85 now widens to *camera or
 * cursor* — a positional form with at least one sample — so the ordinary line
 * plot below is focusable on its own, and `↓` lands on it because it can take a
 * crosshair, not because it can be turned.
 */
const plot = (id: string, values: readonly number[]): Record<string, unknown> => ({
  kind: "plot",
  id,
  form: "line",
  height: 5,
  axes: true,
  series: [{ label: "train", values }],
});

const META = {
  verb: "plot",
  adapter: "passthrough",
  exitCode: 0,
  durationMs: 0,
  truncated: false,
  argv: [] as string[],
  stderr: "",
  transport: "local",
  origin: "user",
};
const doc = (blocks: readonly unknown[]) => ({ schema: "tui.view/1", command: "/plot", status: "ok", blocks, meta: META });

describe("C22 I76 — the store alone", () => {
  it("T1.31: absent is no crosshair, zero is the first sample, and both are in the key", () => {
    const c = new CursorPositions();
    expect(c.get("e", "p"), "nothing aimed").toBeUndefined();
    expect(c.forEntry("e"), "an empty record, not undefined").toEqual({});
    expect(c.key("e")).toBe("");

    // **Zero is kept**, which is where this differs from `ScrollOffsets`: a
    // cursor at 0 draws a crosshair and no cursor draws none, so keying them
    // the same would serve the wrong frame to one of them.
    c.set("e", "p", 0);
    expect(c.get("e", "p")).toBe(0);
    expect(c.key("e"), "zero is a state, not the absent one").toBe("p=0");

    c.set("e", "b", 3);
    c.set("e", "a", 1);
    expect(c.key("e"), "sorted, so a Map's order cannot key one state two ways").toBe("a=1,b=3,p=0");
    expect(c.forEntry("e")).toEqual({ p: 0, b: 3, a: 1 });
  });

  it("T3.35: eviction drops one entry and clear drops all, and neither reaches a neighbour", () => {
    const c = new CursorPositions();
    c.set("e1", "p", 2);
    c.set("e2", "p", 4);
    c.delete("e1");
    expect(c.get("e1", "p")).toBeUndefined();
    expect(c.get("e2", "p"), "the neighbour survives").toBe(4);
    expect(c.size).toBe(1);
    c.clear();
    expect(c.size).toBe(0);
  });
});

describe("C22 I76 — the writer alone", () => {
  it("T4.17h (C16 I28, C22 I76): → and ← move the focused plot's cursor, clamped to the samples", async () => {
    const { graph } = await buildGraph();
    const id = graph.transcript.append(doc([plot("p", [10, 20, 30])]) as never);

    // The element is asserted before the keystroke, as render-cache T4.17f
    // does: a row that pressed `→` and found nothing could be failing for
    // either reason.
    expect(graph.liveElements().map((e) => e.blockId), "the plot is focusable").toEqual(["p"]);
    graph.router.dispatch(press("down"));
    expect(graph.cursorPositions.get(id, "p"), "no crosshair until a key asks").toBeUndefined();

    graph.router.dispatch(press("right"));
    expect(graph.cursorPositions.get(id, "p"), "a first → lands on the first sample").toBe(0);
    graph.router.dispatch(press("right"));
    expect(graph.cursorPositions.get(id, "p")).toBe(1);
    for (let i = 0; i < 5; i += 1) graph.router.dispatch(press("right"));
    expect(graph.cursorPositions.get(id, "p"), "clamped at the last sample — the effect knows n").toBe(2);
    for (let i = 0; i < 5; i += 1) graph.router.dispatch(press("left"));
    expect(graph.cursorPositions.get(id, "p"), "and at the first").toBe(0);
  });

  it("T4.17i (C16 I28): a first ← lands on the last sample, and a non-plot is a no-op", async () => {
    const { graph } = await buildGraph();
    const id = graph.transcript.append(
      doc([
        {
          kind: "table",
          id: "t",
          columns: [{ key: "n", label: "N", align: "left", priority: 1, minWidth: 2, sortable: false }],
          rows: [{ id: "r1", cells: { n: { text: "x" } } }],
        },
        plot("p", [1, 2, 3, 4]),
      ]) as never,
    );
    graph.router.dispatch(press("down"));
    // Focus is on the table's row: the horizontal pair has no subject there.
    graph.router.dispatch(press("right"));
    expect(graph.cursorPositions.forEntry(id), "nothing written for a table").toEqual({});

    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("left"));
    expect(graph.cursorPositions.get(id, "p"), "← from nowhere appears at the far end").toBe(3);
  });

  it("T4.17j: two plots in one document keep their own cursors", async () => {
    const { graph } = await buildGraph();
    const id = graph.transcript.append(doc([plot("p1", [1, 2, 3]), plot("p2", [4, 5, 6])]) as never);
    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("right"));
    graph.router.dispatch(press("right"));
    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("right"));
    // **Different values on purpose**: equal ones would pass a store keyed on
    // the entry alone.
    expect(graph.cursorPositions.forEntry(id)).toEqual({ p1: 1, p2: 0 });
  });

  it("T4.17k (C16 §4a, C22 I76): the pointer is the second writer of the same store, and the key's clamp holds after it", async () => {
    const { graph } = await buildGraph({}, { columns: 80, rows: 30 });
    graph.viewport.resize({ width: 80, height: 20 });
    const id = graph.transcript.append(doc([plot("p", [10, 20, 30, 40, 50])]) as never);
    // The harness's region starts at terminal row 1 and bottom-aligns a short
    // transcript (session-mouse T4.62): the plot entry closes with a blank (C22
    // I85), so ten rows in twenty put transcript row 3 — an area row of the plot
    // — at terminal row 1 + 10 + 3.
    expect(graph.viewport.scroll.totalRows).toBe(10);
    const click = (col: number): InputEvent => ({
      kind: "mouse", row: 1 + 10 + 3, col, button: "button0", press: true, shift: false, meta: false, ctrl: false, motion: false,
    });
    expect(graph.router.dispatch(click(41))).toBe(true);
    expect(graph.cursorPositions.get(id, "p"), "the pointer wrote the store").toBe(2);
    graph.router.dispatch(press("right"));
    expect(graph.cursorPositions.get(id, "p"), "→ continues from the pointer's index").toBe(3);
    graph.router.dispatch(click(78));
    expect(graph.cursorPositions.get(id, "p")).toBe(4);
    graph.router.dispatch(press("right"));
    expect(graph.cursorPositions.get(id, "p"), "and the key's clamp still holds at the last sample").toBe(4);
    expect(graph.cursorPositions.key(id), "one axis in the render key, whoever wrote it").toBe("p=4");
  });

  it("T4.18f (C22 §6c): the store joins the eviction subscription — clear takes it", async () => {
    // The `evict` arm is not drivable through the graph (render-cache T4.18a's
    // note: the cap is 100,000 blocks); `clear` runs the same callback.
    const { graph } = await buildGraph();
    graph.transcript.append(doc([plot("p", [1, 2, 3])]) as never);
    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("right"));
    expect(graph.cursorPositions.size).toBe(1);
    graph.transcript.clear();
    expect(graph.cursorPositions.size, "dropped with the rendered rows").toBe(0);
  });
});

describe("C22 I76 — the pair, through a frame", () => {
  it("T4.17p (C16 I28, C22 I76): a keystroke moves the crosshair and the readout on screen follows it", async () => {
    const stdin = fakeStdin();
    const built = await buildSession(
      {
        stdin: stdin as never,
        manifest: {
          schema: "tui.manifest/1",
          binary: "prism",
          version: "1.0.0",
          tools: [{ name: "plot", local: true, summary: "a plot", args: [], flags: [] }],
        },
        localHandlers: {
          plot: () => ({ schema: "tui.view/1", status: "ok", blocks: [plot("p", [10, 20, 30, 40, 50])] }),
        },
      } as never,
      { columns: 80, rows: 24 },
    );
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      await Promise.resolve();
      await Promise.resolve();
    };
    await type("/plot\r");
    await Promise.resolve();
    await type(DOWN); // the card's head is the first element (C09 I47)
    await type(DOWN);
    const before = built.screen().text.join("\n");
    expect(before, "no readout without a cursor").not.toMatch(/train: \d/);

    // **Read the frame, not the store** (C12 I37): the readout row is what a
    // reader sees, and it names the sample under the crosshair.
    await type(RIGHT);
    expect(built.screen().text.join("\n"), "the first sample").toMatch(/train: 10/);
    await type(RIGHT);
    const after = built.screen().text.join("\n");
    expect(after, "the second sample").toMatch(/train: 20/);
    expect(after, "and the first is gone").not.toMatch(/train: 10/);
    // **The key axis is what made the second frame differ** — with the cursor
    // out of the slot string the cache would have served `train: 10` again,
    // which is a correct stale frame and the symptom I71 named.
    await type(LEFT);
    expect(built.screen().text.join("\n"), "back to the first").toMatch(/train: 10/);
  });
});
