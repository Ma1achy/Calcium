// C14 §6b tier 1 — the freeze. A held view over a record that keeps moving.
//
// The shape every row shares: **the difference is the subject.** A hold that
// stopped the store and a hold that holds the view produce the same screen, and
// only an assertion naming both sides tells them apart — which is why each row
// asserts the record *and* the view rather than the picture.
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import { doc } from "../support/blocks.js";
import { buildGraph } from "../support/session.js";
import {
  blocksTouched,
  copyTextOf,
  count,
  enter,
  extendCaret,
  keyOf,
  moveCaret,
  type BlockSpan,
  type SemanticMode,
} from "../../src/shell/semantic-selection.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const entryDoc = (id: string, text = id) =>
  doc({ command: id, blocks: [block({ kind: "notice", id, tone: "info", text })] });

describe("C14 §6b — the freeze", () => {
  it("T1.30 (C14 I31, §6b A1, A2): the held view keeps the entries and the heights it was frozen at, while the record takes the fourth", async () => {
    const { graph } = await buildGraph();
    for (const id of ["e1", "e2", "e3"]) graph.transcript.append(entryDoc(id));
    graph.viewport.scrollToBottom();

    graph.freezeView({ width: 100, height: 20 });
    const heldRows = graph.viewport.scroll.totalRows;

    graph.transcript.append(entryDoc("e4"));

    // The record took it, so nothing stopped working.
    expect(graph.transcript.entries.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
    // The view did not, and neither did the heights measured over it — A2: an
    // index rebuilt from the record under a held document describes a document
    // nobody is looking at.
    expect(graph.documentEntries.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(graph.viewport.scroll.totalRows).toBe(heldRows);

    graph.thawView();
    expect(graph.documentEntries.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(graph.viewport.visible().entries.some((v) => v.id === "e4")).toBe(true);
  });

  it("T1.31 (C14 I31, §6b A4): a resize re-measures the held document and the arriving entry still does not appear", async () => {
    const { graph } = await buildGraph();
    // One long line per entry: one row at 100 columns, several at 24. The same
    // trick T3.14 uses, because a width is only observable through a document
    // whose height depends on it.
    for (const id of ["e1", "e2"]) graph.transcript.append(entryDoc(id, "x ".repeat(45).trim()));
    graph.viewport.scrollToBottom();

    graph.freezeView({ width: 100, height: 20 });
    const wide = graph.viewport.scroll.totalRows;
    graph.transcript.append(entryDoc("e3", "x ".repeat(45).trim()));

    graph.viewport.resize({ width: 24, height: 20 });
    // Width invalidates the held index — the hold is over content, not geometry.
    expect(graph.viewport.scroll.totalRows).toBeGreaterThan(wide);
    // And the arriving entry is still not in it, which is the half that says
    // the re-measure was of the *held* document.
    expect(graph.documentEntries.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(graph.viewport.visible().entries.some((v) => v.id === "e3")).toBe(false);
  });

  it("T1.32 (C14 I32, §6b A3): scroll moves under the hold and the document does not", async () => {
    const { graph } = await buildGraph({}, { columns: 100, rows: 12 });
    for (let i = 0; i < 40; i += 1) graph.transcript.append(entryDoc(`e${String(i)}`));
    graph.viewport.scrollToBottom();

    graph.freezeView({ width: 100, height: 6 });
    const before = graph.viewport.scroll.topRow;
    const held = graph.documentEntries.map((e) => e.id);

    graph.viewport.scrollBy(-3);

    // Both halves, because either alone is satisfied by the mode doing nothing:
    // a scroll that happened **and** a document that did not move.
    expect(graph.viewport.scroll.topRow).toBe(before - 3);
    expect(graph.documentEntries.map((e) => e.id)).toEqual(held);
  });

  it("T1.33 (C14 I33, §6b A6): the copy over the held entries and over the record give different text after a patch", async () => {
    const { graph } = await buildGraph();
    const id = graph.transcript.append(entryDoc("e1", "before"), { streaming: true });
    graph.freezeView({ width: 100, height: 20 });

    // **`documentEntries` is the seam the session reads**, so a mutation on the
    // choice has this row to fail against. The first draft read a held list the
    // graph published beside it and computed the answer itself; the mutation
    // survived with a textually perfect anchor, and the repair was to give the
    // question one owner rather than to rewrite the row.
    expect(
      graph.transcript.patch(id, {
        op: "replace",
        blockId: "e1",
        block: block({ kind: "notice", id: "e1", tone: "info", text: "after" }),
      }).ok,
      "the record takes the patch while the view is held",
    ).toBe(true);

    // **Read after the patch, and the first draft read it before.** C13 rebuilds
    // the entries array on every write, so a reference captured at freeze time
    // holds the old blocks whichever document it came from — and the mutation
    // that made this getter answer the record survived against a row that could
    // not tell them apart.
    const held = graph.documentEntries;
    const mode = {
      caret: { entryId: id, row: 0 },
      anchor: null,
      blocks: new Set([keyOf(id, "e1")]),
    };
    const textOf = (entries: readonly { id: string; doc: { blocks: readonly Block[] } }[]): string =>
      copyTextOf(
        mode,
        entries.map((e) => ({ id: e.id, blocks: e.doc.blocks })),
        graph.blocks.copySequence,
      );

    // **The row that pays for the ruling** (§6b A6). A paint-path freeze holds
    // the screen correctly and copies the record, and these two are the extent
    // of the disagreement — with nothing telling the reader it happened.
    expect(textOf(held)).toBe("before");
    expect(textOf(graph.transcript.entries)).toBe("after");
  });

  it("T1.34 (C14 I34): the buffered count is the difference, and it is zero before the freeze and after the thaw", async () => {
    const { graph } = await buildGraph();
    graph.transcript.append(entryDoc("e1"));
    expect(graph.bufferedEntries, "nothing is held, so nothing is waiting").toBe(0);

    graph.freezeView({ width: 100, height: 20 });
    expect(graph.bufferedEntries).toBe(0);

    graph.transcript.append(entryDoc("e2"));
    graph.transcript.append(entryDoc("e3"));
    expect(graph.bufferedEntries).toBe(2);

    graph.thawView();
    expect(graph.bufferedEntries).toBe(0);
  });
});

// C14 §6c — the caret, the anchor and the granularity atomicity needs.
//
// **The fixture is two entries of unequal block heights**, because that is where
// the touching rule bites: a range of one row inside a ten-row block and a range
// covering all ten give the same answer, and a containment test gets it wrong by
// returning fewer blocks every one of which is right.
describe("C14 §6c — the caret and the anchor", () => {
  // e1: a 10-row block then a 2-row one. e2: two 1-row blocks.
  const SPANS: readonly BlockSpan[] = [
    { key: keyOf("e1", "big"), from: 0, to: 10 },
    { key: keyOf("e1", "tail"), from: 10, to: 12 },
    { key: keyOf("e2", "a"), from: 0, to: 1 },
    { key: keyOf("e2", "b"), from: 1, to: 2 },
  ].map((sp) => Object.freeze(sp));
  const ORDER = ["e1", "e2"];
  const keys = (m: SemanticMode): readonly string[] => [...(m?.blocks ?? [])].sort();

  it("T1.36 (C14 I36, §6c): a range touching one row of a block takes it whole, and a containment fixture tells the two rules apart", () => {
    // One row inside the tall block.
    expect([...blocksTouched({ entryId: "e1", row: 3 }, { entryId: "e1", row: 4 }, SPANS, ORDER)])
      .toEqual([keyOf("e1", "big")]);
    // All ten of it — the same answer, which is atomicity.
    expect([...blocksTouched({ entryId: "e1", row: 0 }, { entryId: "e1", row: 9 }, SPANS, ORDER)])
      .toEqual([keyOf("e1", "big")]);
    // Reaching past it takes the next one whole too.
    expect(
      [...blocksTouched({ entryId: "e1", row: 9 }, { entryId: "e1", row: 10 }, SPANS, ORDER)].sort(),
    ).toEqual([keyOf("e1", "big"), keyOf("e1", "tail")].sort());
    // Across entries: everything between the ends, and the ends clipped by
    // their own rows — `e2`'s second block is below row 0 and is not taken.
    expect(
      [...blocksTouched({ entryId: "e1", row: 11 }, { entryId: "e2", row: 0 }, SPANS, ORDER)].sort(),
    ).toEqual([keyOf("e1", "tail"), keyOf("e2", "a")].sort());

    // **The control that distinguishes the two rules.** Against one-row blocks
    // touching and containing agree, so a fixture of them cannot tell them
    // apart — this is the same range over `e2`, where both answer the same.
    expect([...blocksTouched({ entryId: "e2", row: 0 }, { entryId: "e2", row: 0 }, SPANS, ORDER)])
      .toEqual([keyOf("e2", "a")]);
  });

  it("T1.37b (C14 I36): the caret's row is entry-local, so what is above it does not move which block it names", () => {
    // The same caret against a layout with a taller entry above: `e2` row 0 is
    // `e2`'s first block either way. A viewport row would name a different one.
    const taller: readonly BlockSpan[] = [
      Object.freeze({ key: keyOf("e1", "big"), from: 0, to: 40 }),
      ...SPANS.filter((sp) => sp.key !== keyOf("e1", "big") && sp.key !== keyOf("e1", "tail")),
    ];
    expect([...blocksTouched({ entryId: "e2", row: 0 }, { entryId: "e2", row: 0 }, SPANS, ORDER)])
      .toEqual([...blocksTouched({ entryId: "e2", row: 0 }, { entryId: "e2", row: 0 }, taller, ["e1", "e2"])]);
  });

  it("T1.38b (C14 I37): an extend that over-shoots and returns equals the direct one, and a plain arrow moves without selecting", () => {
    // **Row 8, not row 0, and the mutation pass is why.** The tall block is ten
    // rows, so an extend starting at the top stays inside it for every step the
    // row takes — accumulating instead of re-deriving, and extending on a plain
    // arrow, both survived against a fixture where the set never changed. A
    // corpus chosen for a property may not have it; two rows down from here the
    // selection crosses a block boundary, which is the only place either rule
    // is observable.
    const start = enter(null, { entryId: "e1", row: 8 });
    const down = (m: SemanticMode, n: number): SemanticMode => {
      let out = m;
      for (let i = 0; i < n; i += 1) out = extendCaret(out, 1, SPANS, ORDER);
      return out;
    };
    // **The anchor is planted by the first extend, not by entering.**
    expect(start?.anchor, "no extend is in flight on entry").toBeNull();
    expect(down(start, 1)?.anchor).toEqual({ entryId: "e1", row: 8 });
    expect(keys(down(start, 1)), "one down is still inside the tall block").toEqual([
      keyOf("e1", "big"),
    ]);
    expect(keys(down(start, 3)), "three down has reached the one below it").toEqual(
      [keyOf("e1", "big"), keyOf("e1", "tail")].sort(),
    );

    // Three down, two up — by equality against one down, not by size. The set
    // has to *shrink*, which is what an accumulating extend cannot do.
    let there = down(start, 3);
    there = extendCaret(there, -1, SPANS, ORDER);
    there = extendCaret(there, -1, SPANS, ORDER);
    expect(keys(there)).toEqual(keys(down(start, 1)));

    // A plain arrow moves the caret and touches neither the anchor nor the set
    // — moved far enough to cross the boundary, so an arrow that also extended
    // would show it.
    const moved = moveCaret(down(start, 1), 2, SPANS, ORDER);
    expect(moved?.caret).toEqual({ entryId: "e1", row: 11 });
    expect(moved?.anchor).toEqual({ entryId: "e1", row: 8 });
    expect(keys(moved)).toEqual(keys(down(start, 1)));

    // And it crosses into the next entry at the edge, clamping at the end.
    const top = enter(null, { entryId: "e1", row: 0 });
    expect(moveCaret(top, 12, SPANS, ORDER)?.caret).toEqual({ entryId: "e2", row: 0 });
    expect(moveCaret(top, 99, SPANS, ORDER)?.caret).toEqual({ entryId: "e2", row: 1 });
  });

  it("T1.39 (C14 I38): the count is blocks, asserted where a block count and an entry count disagree", () => {
    const start = enter(null, { entryId: "e1", row: 0 });
    // An extend stopping inside `e1` takes one of its two blocks: 1 either way,
    // so this half agrees with the wrong rule and is here as the pair's control.
    expect(count(extendCaret(start, 1, SPANS, ORDER))).toBe(1);
    // Reaching past the tall block takes both: 2, where an entry count still
    // reads 1. This is the half that tells them apart.
    let far = start;
    for (let i = 0; i < 11; i += 1) far = extendCaret(far, 1, SPANS, ORDER);
    expect(count(far)).toBe(2);
  });
});

// C14 §6d — the selection's ground.
// Spec-first: the rows land with the code in this MR's second commit.
describe("C14 §6d — the selection's ground", () => {
  it.todo(
    "T1.40 (C14 I39, I40): one row per selected block carries the ground, at its first row, and the cache holds the unwashed lines — not deferred on a component: the wash lands in this MR's code commit",
  );
  it.todo(
    "T1.40b (C14 I41): selected wins the ground and focus keeps its mark, read as frames at colour and at 1-bit — not deferred on a component: the wash lands in this MR's code commit",
  );
});
