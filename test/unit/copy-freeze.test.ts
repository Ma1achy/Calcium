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
import { washedRowsOf, washRow, washSelectedRows } from "../../src/shell/paint.js";
import { FULL_CAPS, themeFor } from "../support/render.js";
import { paint, tone } from "../../src/presentation/blocks/paint.js";

const THEME = themeFor("dark");
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
//
// **Here and not at the session**, because the harness's screen model replays
// the frame into a grid and drops every SGR: a read one layer up can see a row
// move and cannot see a ground. `session-paint.test.ts` reads `paint()`'s return
// for the same reason.
describe("C14 §6d — the selection's ground", () => {
  // **Two entries in the spans, and the second is not decoration.** With only
  // one entry's blocks here, `selected.has(sp.key)` is false for everything and
  // the entry filter is never reached — the mutation that drops it survived
  // against exactly that fixture.
  const spans = [
    { key: keyOf("e1", "l"), from: 0, to: 3 },
    { key: keyOf("e1", "m"), from: 3, to: 6 },
    { key: keyOf("e2", "l"), from: 0, to: 3 },
  ].map((sp) => Object.freeze(sp));
  const both = new Set([keyOf("e1", "l"), keyOf("e1", "m")]);

  it("T1.40 (C14 I39): the rows taking the ground are the blocks' first rows and no others", () => {
    // **The set, not a count.** A body-wide wash and a first-row wash are both
    // *some rows are styled*; only the set tells them apart, and the third
    // clause is *never on every cell of its body*.
    expect([...washedRowsOf(spans, both, "e1", 0, 6)].sort((a, b) => a - b)).toEqual([0, 3]);

    // One block selected, and it is the second — so the answer is not *the
    // first row of the entry*, which every one-block fixture would accept.
    expect([...washedRowsOf(spans, new Set([keyOf("e1", "m")]), "e1", 0, 6)]).toEqual([3]);

    // A window beginning below a block's first row shows its body, and a body
    // takes no ground.
    expect([...washedRowsOf(spans, both, "e1", 4, 2)]).toEqual([]);

    // **Another entry's selection is not this entry's**, and the spans hold both
    // so the filter is actually reached: `e2`'s block is selected and `e1` is
    // being drawn, and `e2`'s block starts at row 0 — the same row `e1`'s does,
    // which is what makes a dropped filter invisible without this.
    expect([...washedRowsOf(spans, new Set([keyOf("e2", "l")]), "e1", 0, 6)]).toEqual([]);
    expect([...washedRowsOf(spans, new Set([keyOf("e2", "l")]), "e2", 0, 6)]).toEqual([0]);
  });


  it("T1.40c (C14 I40): the wash is a new array, and the lines the cache holds are untouched", () => {
    // **The stored copy, by identity and by content.** The caller has already
    // written `lines` into the render cache, whose nine axes do not include the
    // selection — so a wash that reached them would serve a selected frame to a
    // later unselected read, which is a *correct* frame and the symptom whose
    // report says *it froze*.
    const lines = Object.freeze(["one", "two", "three"]);
    const before = [...lines];
    const shown = washSelectedRows(lines, new Set([1]), THEME, FULL_CAPS, 6);

    expect([...lines], "the stored copy is byte-for-byte what it was").toEqual(before);
    expect(shown, "and the frame's copy is a different array").not.toBe(lines);
    expect(shown[1]).not.toBe(lines[1]);
    expect(shown[0], "rows nothing selected are the same strings").toBe(lines[0]);

    // Nothing selected is the identity, which is every frame outside the mode.
    expect(washSelectedRows(lines, new Set(), THEME, FULL_CAPS, 6)).toBe(lines);
  });

  it("T1.40b (C14 I41): the mark survives the wash, and 1-bit is reverse video", () => {
    const marked = "▸ x";
    const colour = washRow(marked, THEME, FULL_CAPS, 6);
    // The mark is still in the text — the wash changed the ground under it,
    // which is the precedence as an order rather than as a case in a table.
    expect(colour).toContain("▸ x");
    expect(colour, "a ground, at colour").toMatch(/\[4[0-9;]/u);

    // 1-bit: `selectionStyle` answers `inverse`, so the row is SGR 7 and the
    // mark is still there — neither fact rests on colour alone.
    const mono = washRow(marked, THEME, { ...FULL_CAPS, colourDepth: 1 }, 6);
    expect(mono, "SGR 7").toContain("[7m");
    expect(mono).toContain("▸ x");
  });

  it.todo("T1.40e (C14 I53, R-THM-003): on a banded theme the wash carries the band's ink — not deferred on a component: specified before the wash is changed");

  it("T1.40d (C14 I52, R-SEL-003): a styled row is grounded to its end, and an inner ground does not displace the wash", () => {
    // Every printed cell, paired with the SGR sequence most recently written
    // before it. A wash opened once lasts to the first inner reset; this asks
    // the row cell by cell rather than asking whether a ground appears at all,
    // which T1.40b already answers and which a one-cell wash satisfies.
    const SGR = /\x1b\[[0-9;]*m/uy;
    const governed = (out: string): { text: string; last: string }[] => {
      const cellsOut: { text: string; last: string }[] = [];
      let last = "";
      for (let i = 0; i < out.length; ) {
        SGR.lastIndex = i;
        const m = SGR.exec(out);
        if (m !== null) {
          last = m[0];
          i += m[0].length;
          continue;
        }
        const ch = String.fromCodePoint(out.codePointAt(i)!);
        cellsOut.push({ text: ch, last });
        i += ch.length;
      }
      return cellsOut;
    };
    for (const caps of [FULL_CAPS, { ...FULL_CAPS, colourDepth: 1 as const }]) {
      // The control: an unstyled row, which one opening already covers.
      const plain = governed(washRow("plain", THEME, caps, 8));
      const opening = plain[0]!.last;
      expect(opening, "the wash opens with a sequence").not.toBe("");
      expect(plain.every((c) => c.last === opening), "control: an unstyled row").toBe(true);

      // A toned border, a plain run, a bold toned word and a span with its own
      // ground — the focused row's case, which sits below the selection.
      const styled =
        paint([
          { text: "╭─", style: tone("muted", THEME, caps) },
          { text: " x " },
          { text: "ok", style: { ...tone("ok", THEME, caps), bold: true } },
        ]) + "\x1b[48;2;1;2;3mG\x1b[49m";
      const out = governed(washRow(styled, THEME, caps, 12));
      expect(out.map((c) => c.text).join(""), "the row's text is untouched").toBe("╭─ x okG    ");
      const bare = out.filter((c) => c.last !== opening).map((c) => c.text);
      expect(bare, `cells not under the wash at colourDepth ${caps.colourDepth}`).toEqual([]);
    }
  });
});
