// C14 I63, I64 — a press on the transcript's bar, through a built graph
// (review batch 4, shell lane, C22 §6q.2).
//
// The harness frame's region is `{ top: 1, left: 1, height: 20, width: 80 }`,
// so the bar is terminal column 81 and region row r is terminal row 1 + r.
import { describe, expect, it } from "vitest";

import type { InputEvent } from "../../src/interaction/router/types.js";
import { buildGraph } from "../support/session.js";

const BAR = 81;
const TOP = 1;
const HEIGHT = 20;

const press = (row: number, col: number, isPress = true): InputEvent => ({
  kind: "mouse",
  row,
  col,
  button: "button0",
  press: isPress,
  shift: false,
  meta: false,
  ctrl: false,
  motion: false,
});

const doc = (verb: string, n: number) =>
  ({
    schema: "tui.view/1",
    command: `/${verb}`,
    status: "ok",
    blocks: [
      {
        kind: "code",
        id: "c",
        language: "text",
        text: Array.from({ length: n }, (_, i) => `${verb} ${String(i)}`).join("\n"),
      },
    ],
    meta: {
      verb,
      adapter: "passthrough",
      exitCode: 0,
      durationMs: 0,
      truncated: false,
      argv: [],
      stderr: "",
      transport: "local",
      origin: "user",
    },
  }) as never;

async function seeded() {
  const built = await buildGraph();
  built.graph.lifecycle.acquire();
  // **Sixty-one lines, not sixty**: at sixty `maxTop` is 38, a multiple of
  // h − 1 = 19, so every row's target is whole and round cannot be told from
  // floor — the mutation pass found T4.46 blind to exactly that.
  built.graph.transcript.append(doc("filler", 61));
  const scroll = () => built.graph.viewport.scroll;
  const maxTop = () => Math.max(0, scroll().totalRows - scroll().viewportHeight);
  return { ...built, scroll, maxTop };
}

describe("C14 I63, I64 — a press on the transcript's bar", () => {
  it("T4.46 (C14 I63, C16 §4a): a press on the bar at the first, a middle and the last region rows puts topRow at round(r × maxTop / (h − 1)); focus is unmoved and nothing is armed", async () => {
    const { graph, scroll, maxTop } = await seeded();
    // **The region's rows index the press, the viewport's scroll prices it**:
    // the harness's viewport is sized apart from its frame (24 against 20), so
    // the row reads the two figures where `barJump` reads them.
    const max = maxTop();
    expect(max, "the transcript overflows, so the bar is drawn").toBeGreaterThan(0);
    const focus = graph.focus.current;

    // **Every row, then the top again**: the ends are exact under any rounding,
    // so a row that rounds is only found by sweeping the rows between.
    const rows = [...Array.from({ length: HEIGHT }, (_, r) => r), 0];
    const wants = rows.map((r) => Math.round((r * max) / (HEIGHT - 1)));
    expect([wants[0], wants[HEIGHT - 1]], "the first row is the top and the last the bottom").toEqual([0, max]);
    expect(
      wants.slice(0, HEIGHT).some((w, r) => w !== Math.floor((r * max) / (HEIGHT - 1))),
      "some row rounds up, so the sweep can tell round from floor",
    ).toBe(true);
    for (const [i, r] of rows.entries()) {
      const want = wants[i]!;
      expect(graph.router.dispatch(press(TOP + r, BAR)), `row ${String(r)} consumed`).toBe(true);
      expect(scroll().topRow, `row ${String(r)}`).toBe(want);
      expect(graph.focus.current, "focus did not move").toEqual(focus);
      // **Nothing armed**: the release commits nothing — the view and focus
      // stay where the press left them.
      graph.router.dispatch(press(TOP + r, BAR, false));
      expect([scroll().topRow, graph.focus.current]).toEqual([want, focus]);
    }

    // **The control: a column in from the bar** is an ordinary press, and the
    // jump is the bar's alone.
    graph.router.dispatch(press(TOP + HEIGHT - 1, BAR - 1));
    graph.router.dispatch(press(TOP + HEIGHT - 1, BAR - 1, false));
    expect(scroll().topRow, "no jump off the bar").toBe(0);
  });

  it("T4.47 (C14 I64, I5): a press on the last row follows the tail and an append keeps the bottom; on the first row it detaches and an append leaves the view", async () => {
    const { graph, scroll, maxTop } = await seeded();

    graph.router.dispatch(press(TOP, BAR));
    expect([scroll().topRow, scroll().followTail], "the first row: the top, detached").toEqual([0, false]);
    graph.transcript.append(doc("more", 10));
    expect(scroll().topRow, "an append leaves the view (C14 I4)").toBe(0);

    graph.router.dispatch(press(TOP + HEIGHT - 1, BAR));
    expect([scroll().topRow, scroll().followTail], "the last row: the bottom, following").toEqual([maxTop(), true]);
    graph.transcript.append(doc("again", 10));
    expect(scroll().topRow, "an append keeps the bottom (C14 I5)").toBe(maxTop());
  });
});
