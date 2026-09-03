// C26 §5 — the second kind to declare `elements`, and the sweep run over it.
//
// **A seam exercised only by its author's kind is a seam tested against one
// shape.** `table` declared elements first and every generic predicate was
// checked against rows: full-width, one per line, in order. Chips are none of
// those — several to a line, wrapping, each its own width — so this is where the
// predicates meet a geometry they were not written beside. The corpus holds the
// shapes that move a chip: a wrap, a label wider than the terminal, a duplicate
// label, and chips with and without actions.
import { describe, expect, it } from "vitest";

import { checkElements, formatElementReport } from "../../src/testing/navigation-conformance.js";
import type { NavigableRegistry } from "../../src/testing/navigation-conformance.js";
import { measurable } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { buildGraph } from "../support/session.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";

const key = (name: string): Key => ({ name, ctrl: false, meta: false, shift: false, sequence: name });
const press = (name: string): InputEvent => ({ kind: "key", key: key(name) });

const FILTER = block({
  kind: "pills",
  id: "filters",
  chips: [
    { label: "all", active: true },
    { label: "running", action: { kind: "exec", label: "running", command: "ps --status running" } },
    { label: "stopped", action: { kind: "fill", label: "stopped", command: "ps --status stopped" } },
    { label: "exited" },
  ],
});

const PILLS_CORPUS: readonly Block[] = Object.freeze([
  FILTER,
  // Wraps at every width in the sweep: fourteen chips of six cells.
  block({
    kind: "pills",
    id: "many",
    chips: Array.from({ length: 14 }, (_, i) => ({ label: `chip${String(i).padStart(2, "0")}` })),
  }),
  // A label wider than the narrowest sweep width, alone on its line.
  block({ kind: "pills", id: "wide", chips: [{ label: "x".repeat(30) }, { label: "y" }] }),
  // Two chips with one label — the id must not be the label (C26 I6).
  block({ kind: "pills", id: "twins", chips: [{ label: "same" }, { label: "same" }, { label: "other" }] }),
]);

const nav = (): NavigableRegistry => measurable().registry as unknown as NavigableRegistry;

describe("C26 §5 — pills under the conformance sweep", () => {
  it("T2.16b (C26 I4, I5, I6): the pills corpus is clean, and it is a corpus", () => {
    const report = checkElements(nav(), PILLS_CORPUS);
    expect(report.failures, formatElementReport(report)).toEqual([]);
    expect(report.checked, "elements were actually walked").toBeGreaterThan(40);
    expect(report.kinds, "the kind under test is the one covered").toContain("pills");
  });

  it("T2.16c: one element per chip, in reading order, with the chip's own action and label", () => {
    const registry = nav();
    const elements = registry.elementsOf(FILTER, 80);
    expect(elements.map((e) => e.id)).toEqual(["chip-0", "chip-1", "chip-2", "chip-3"]);
    expect(elements.map((e) => e.level)).toEqual(["cell", "cell", "cell", "cell"]);
    // All on one row at 80 columns, two cells apart.
    expect(elements.map((e) => e.rows.from)).toEqual([0, 0, 0, 0]);
    expect(elements.map((e) => e.cols.from)).toEqual([0, 5, 14, 23]);
    expect(elements[1]?.activate).toEqual({ kind: "exec", label: "running", command: "ps --status running" });
    expect(elements[0]?.activate, "a chip with no action is a place to stand — no member").toBeUndefined();
    expect("activate" in (elements[0] ?? {})).toBe(false);
    expect(elements.map((e) => e.copy)).toEqual(["all", "running", "stopped", "exited"]);

    // **At a width that wraps, the chips move rows and the list stays in order**
    // — the case `table` could never produce.
    // Ten columns: `all` + the two-cell gap + `running` is twelve, so nothing
    // shares a line. (At twelve they do, which is what the first draft of this
    // row assumed they would not — the arithmetic was the fixture's, not a defect.)
    const narrow = registry.elementsOf(FILTER, 10);
    expect(narrow.map((e) => e.rows.from), "one chip per row at ten columns").toEqual([0, 1, 2, 3]);
    expect(narrow.map((e) => e.cols.from)).toEqual([0, 0, 0, 0]);
  });

  it("T2.16d (C26 I6): duplicate labels are distinct elements", () => {
    const ids = nav().elementsOf(PILLS_CORPUS[3] as Block, 80).map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("C26 §5, §5c — focus lands, `y` copies, `⏎` fires", () => {
  const doc = {
    schema: "tui.view/1",
    command: "/ps",
    status: "ok",
    blocks: [FILTER],
    meta: {
      verb: "ps",
      adapter: "passthrough",
      exitCode: 0,
      durationMs: 0,
      truncated: false,
      argv: [],
      stderr: "",
      transport: "local",
      origin: "user",
    },
  };

  it("T3.46: ↓ enters on the first chip and steps chip to chip", async () => {
    const { graph } = await buildGraph();
    const id = graph.transcript.append(doc as never);
    graph.router.dispatch(press("down"));
    expect(graph.focus.current).toEqual({
      at: "liveBlock",
      entryId: id,
      element: { blockId: "filters", elementId: "chip-0" },
      anchor: null,
      mode: "navigate",
    });
    graph.router.dispatch(press("down"));
    expect(graph.focus.current.at === "liveBlock" && graph.focus.current.element?.elementId).toBe("chip-1");
  });

  it("T3.47 (C26 I17): `y` on a chip copies its label into the one clipboard", async () => {
    const { graph } = await buildGraph();
    graph.transcript.append(doc as never);
    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("y"));
    // The kill buffer is C17's; `⌃y` at the prompt is how it is read back.
    graph.router.dispatch(press("escape"));
    graph.editor.yank();
    expect(graph.editor.text).toBe("running");
  });

  it("T3.48 (C23 I37): `⏎` on a chip dispatches the chip's own action", async () => {
    const { graph } = await buildGraph();
    graph.transcript.append(doc as never);
    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("down"));
    // The third chip's action is a `fill`, which lands in the prompt (A01 D8).
    graph.router.dispatch(press("enter"));
    expect(graph.editor.text).toBe("ps --status stopped");
  });
});
