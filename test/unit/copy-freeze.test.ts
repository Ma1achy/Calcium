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
import { copyTextOf } from "../../src/shell/semantic-selection.js";
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
    const mode = { caret: id, entries: new Set([id]) };
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
