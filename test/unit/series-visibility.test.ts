// C22 I78 — the series toggle's store, its block-declared writer, and the
// ninth render-key axis.
//
// **The first store whose writer is a keymap the block declares** (C12 I116,
// C16 I27): `plotDefinition.keymap` binds `1`–`9`, `syncBlockKeymap` in
// `construct.ts` merges them while the plot holds focus, and nine `toggleSeriesN`
// effects reach `toggleSeriesBlock`. The rows are C22 I71's three, applied to this
// field: the store alone, the writer alone (a key press, asserted on the store),
// and the pair through a frame — with the axis mutation named in T6.94.
import { describe, expect, it } from "vitest";

import { SeriesVisibility } from "../../src/shell/series-visibility.js";
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

const ESC = "\u001b";
const DOWN = `${ESC}[B`;
const UP = `${ESC}[A`;

/** A two-series line plot — focusable because it can take a cursor (C12 I85). */
const plot = (id: string, second: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: "plot",
  id,
  form: "line",
  height: 8,
  axes: true,
  series: [
    { label: "train", values: [10, 20, 30, 40, 50] },
    { label: "val", values: [90, 80, 70, 60, 55], ...second },
  ],
});
const one = (id: string): Record<string, unknown> => ({
  kind: "plot", id, form: "line", height: 5, axes: true,
  series: [{ label: "train", values: [1, 2, 3] }],
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

describe("C22 I78 — the store alone", () => {
  it("T1.32: absent is the block's own, false is a state, and every override is in the key", () => {
    const v = new SeriesVisibility();
    expect(v.get("e", "p", 0), "nothing overridden").toBeUndefined();
    expect(v.forEntry("e"), "an empty record, not undefined").toEqual({});
    expect(v.key("e")).toBe("");

    // **`false` is kept**, which is where this differs from `ScrollOffsets`'
    // zeros: an override to *shown* over a producer's *hidden* is a different
    // frame from no override, so keying them the same serves the wrong frame.
    v.set("e", "p", 1, false);
    expect(v.get("e", "p", 1)).toBe(false);
    expect(v.key("e"), "shown is a state, not the absent one").toBe("p=1s");

    v.set("e", "p", 0, true);
    v.set("e", "b", 2, true);
    expect(v.key("e"), "sorted at both levels, so a Map's order cannot key one state two ways")
      .toBe("b=2h,p=0h+1s");
    expect(v.forEntry("e")).toEqual({ p: { 0: true, 1: false }, b: { 2: true } });
  });

  it("T3.36: eviction drops one entry and clear drops all, and neither reaches a neighbour", () => {
    const v = new SeriesVisibility();
    v.set("e1", "p", 0, true);
    v.set("e2", "p", 0, true);
    v.delete("e1");
    expect(v.get("e1", "p", 0)).toBeUndefined();
    expect(v.get("e2", "p", 0), "the neighbour survives").toBe(true);
    expect(v.size).toBe(1);
    v.clear();
    expect(v.size).toBe(0);
  });
});

describe("C22 I78 — the writer alone", () => {
  it("T4.17r (C16 I27, C22 I78): 2 on a focused two-series plot toggles the second series, both ways", async () => {
    const { graph } = await buildGraph();
    const id = graph.transcript.append(doc([plot("p")]) as never);

    expect(graph.liveElements().map((e) => e.blockId), "the plot is focusable").toEqual(["p"]);
    // **From the prompt the digit is a character**: the keymap is merged only
    // while the plot holds focus (A01 D4), so nothing is written here.
    graph.router.dispatch(press("2"));
    expect(graph.seriesVisibility.forEntry(id), "nothing written from the prompt").toEqual({});

    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("2"));
    expect(graph.seriesVisibility.get(id, "p", 1), "series 2 hidden").toBe(true);
    graph.router.dispatch(press("2"));
    expect(graph.seriesVisibility.get(id, "p", 1), "shown again — recorded, not erased").toBe(false);

    // **The horizontal pair still moves the crosshair** beside the digits.
    graph.router.dispatch(press("right"));
    expect(graph.cursorPositions.get(id, "p"), "→ still lands on the first sample").toBe(0);
    graph.router.dispatch(press("1"));
    expect(graph.seriesVisibility.forEntry(id)).toEqual({ p: { 0: true, 1: false } });
  });

  it("T4.17r (cont.): a one-series plot declares no 2, and a producer's hidden is overridden to shown", async () => {
    const { graph } = await buildGraph();
    const id = graph.transcript.append(doc([one("q"), plot("p", { hidden: true })]) as never);
    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("2"));
    expect(graph.seriesVisibility.forEntry(id), "2 is unbound on a one-series plot — nothing written").toEqual({});
    graph.router.dispatch(press("1"));
    expect(graph.seriesVisibility.get(id, "q", 0)).toBe(true);

    // Down to the second plot: its keymap replaces the first's.
    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("2"));
    expect(graph.seriesVisibility.get(id, "p", 1), "the effective state was hidden (the member), so the toggle shows it").toBe(false);
  });

  it("T4.18g (C22 §6c): the store joins the eviction subscription — clear takes it", async () => {
    const { graph } = await buildGraph();
    graph.transcript.append(doc([plot("p")]) as never);
    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("2"));
    expect(graph.seriesVisibility.size).toBe(1);
    graph.transcript.clear();
    expect(graph.seriesVisibility.size, "dropped with the rendered rows").toBe(0);
  });
});

describe("C22 I78 — the pair, through a frame", () => {
  it("T4.17s (C12 I116, C22 I78): 2 removes the series' ink and marks its legend row; 2 again restores the frame", async () => {
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
          plot: () => ({ schema: "tui.view/1", status: "ok", blocks: [plot("p")] }),
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
    expect(before, "both series named, neither hollow").toMatch(/█ val/u);
    expect(before).not.toMatch(/○/u);

    // **Read the frame, not the store** (C12 §3aq B1): the legend row is what a
    // reader sees, and the ink is what they came for.
    await type("2");
    const hidden = built.screen().text.join("\n");
    expect(hidden, "the legend marks the hidden series").toMatch(/○ val/u);
    expect(hidden, "and still names the other one as before").toMatch(/█ train/u);
    expect(hidden).not.toBe(before);
    // The frame lost ink and gained none, outside the one legend cell.
    const inkCells = (s: string) => [...s.replace(/○/gu, "█")].filter((c) => c !== " " && c !== "\n").length; // cells-ok — a count
    expect(inkCells(hidden)).toBeLessThan(inkCells(before));

    // B2 — back, byte for byte.
    await type("2");
    expect(built.screen().text.join("\n"), "the override to shown draws the first frame").toBe(before);

    // B6 — out of the plot, the keymap is withdrawn and `1` is a character at the
    // prompt. Two presses: the first lands on the card's head (C09 I47).
    await type(UP);
    await type(UP);
    await type("1");
    const after = built.screen().text.join("\n");
    expect(after, "no series toggled from the prompt").not.toMatch(/○/u);
    expect(after, "the digit went to the prompt").toMatch(/1/u);

  });
});
