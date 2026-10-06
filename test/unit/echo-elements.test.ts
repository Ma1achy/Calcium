// C26 I33 — the echo's chips lead the entry's elements (ruling 104 c, F1521).
//
// **The rows are negative, and that is the arithmetic every reader already
// does.** An element's rows are in the entry's block space and a reader places
// one at `chromeRows + rows.from`; a chip in the echo sits above the blocks, so
// its rows are its echo row less the echo's height. The second half of the row
// goes through a built graph, because *ahead of the document's* is a property
// of the list `elementsOf` hands navigation, not of `echoElements` alone.
import { describe, expect, it } from "vitest";
import { ECHO_BLOCK, echoElements, echoRows } from "../../src/shell/echo.js";
import { buildGraph } from "../support/session.js";
import { FULL_CAPS } from "../support/render.js";
import { addr } from "../support/focus.js";
import type { Key, InputEvent } from "../../src/interaction/router/types.js";

const press = (k: { name: string; ctrl?: boolean }): InputEvent => {
  const key: Key = { name: k.name, ctrl: k.ctrl ?? false, meta: false, shift: false, sequence: k.name };
  return { kind: "key", key };
};

const FIRST = "aa\nbb\ncc";
const SECOND = "zz";
const COMMAND = `echo ${FIRST} ${SECOND}\nnext`;
const ECHO = [
  { from: 5, to: 5 + FIRST.length, ordinal: 1, kind: "paste" as const, name: "pasted", lines: 3 },
  { from: 6 + FIRST.length, to: 6 + FIRST.length + SECOND.length, ordinal: 2, kind: "paste" as const, name: "pasted", lines: 1 },
];

describe("C26 I33 — echo elements", () => {
  it("T1.167 (C26 I33, C22 I154): echoElements places each chip as a cell element above the blocks, with its content as copy and detail, and select-all skips them", async () => {
    const drawn = echoRows(COMMAND, ECHO, 80, FULL_CAPS);
    expect(drawn?.rows, "a two-row echo: the chips' row and `next`").toHaveLength(2);

    const elements = echoElements(COMMAND, ECHO, 80, FULL_CAPS);
    expect(elements.map((e) => e.blockId)).toEqual([ECHO_BLOCK, ECHO_BLOCK]);
    expect(new Set(elements.map((e) => e.element.id)).size, "ids distinct").toBe(2);
    for (const [i, e] of elements.entries()) {
      const content = [FIRST, SECOND][i];
      expect(e.element.level).toBe("cell");
      expect(e.element.rows, `chip ${String(i)}: its echo row less the echo's height`).toEqual({ from: -2, to: -1 });
      expect(e.element.cols, `chip ${String(i)}: the chip's cells`).toEqual({ from: drawn?.chips[i]?.from, to: drawn?.chips[i]?.to });
      expect(e.element.copy).toBe(content);
      expect(e.element.detail).toMatchObject({ kind: "code", text: content });
    }
    expect(echoElements(COMMAND, undefined, 80, FULL_CAPS), "no echo, no elements").toEqual([]);

    // **Through a built graph**: ahead of a table's rows, and `⌃a` anchors on the table.
    const { graph } = await buildGraph();
    const entry = graph.transcript.append({
      schema: "tui.view/1",
      command: COMMAND,
      status: "ok",
      blocks: [
        {
          kind: "table",
          id: "t1",
          columns: [{ key: "name", label: "Name", align: "left", priority: 10, minWidth: 12, sortable: false }],
          rows: [
            { id: "a1", cells: { name: { text: "alpha" } } },
            { id: "b1", cells: { name: { text: "beta" } } },
          ],
        },
      ],
      meta: { verb: "rows", adapter: "passthrough", exitCode: 0, durationMs: 0, truncated: false, argv: [], stderr: "", transport: "local", origin: "user", echo: ECHO },
    } as never);
    graph.router.dispatch(press({ name: "down" }));
    expect(graph.focusedElements().map((e) => e.element.id), "the chips lead").toEqual(["chip-0", "chip-1", "a1", "b1"]);
    expect(graph.focus.current, "`↓` from the prompt lands on the first chip").toMatchObject({ at: "liveBlock", entryId: entry, element: addr("chip-0", ECHO_BLOCK) });

    graph.router.dispatch(press({ name: "a", ctrl: true }));
    expect(graph.focus.current, "select-all is the document's elements").toMatchObject({
      element: addr("b1", "t1"),
      anchor: addr("a1", "t1"),
    });
  });
});
