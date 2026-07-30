// C14 tier 3 — edge. Degenerate sizes, resize, and the anchor under eviction.
//
// Three of these were read as frames before they were written as assertions, and
// two of those are here because the frame disagreed with what the numbers implied.
import { describe, expect, it } from "vitest";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { W, emptyDoc, measureSequence, renderEntry, rowsDoc, wrappingDoc } from "../support/viewport.js";

const mk = (height: number, cap?: number, width = W) => {
  const store = createTranscriptStore(cap === undefined ? {} : { cap });
  const viewport = createViewport(store, { width, height, measureSequence });
  return { store, viewport };
};

describe("C14 edge — degenerate shapes", () => {
  it("T3.1: an empty transcript → empty range, topRow 0, no throw", () => {
    const { viewport } = mk(10);
    const r = viewport.visible();

    expect(r.entries).toEqual([]);
    expect(r.topRow).toBe(0);
    // Both edges at once: `End` on an empty screen must not move, and `atTop`
    // must not report false because there is nothing to be at the top of.
    expect(r.atTop).toBe(true);
    expect(r.atBottom).toBe(true);
  });

  it("T3.2: scroll to bottom while already following → no movement", () => {
    const { store, viewport } = mk(4);
    store.append(rowsDoc(20, "a"));
    const before = viewport.scroll.topRow;

    viewport.scrollToBottom();
    expect(viewport.scroll.topRow).toBe(before);
  });

  it("T3.3: viewportHeight of 0 → empty range, no division by zero", () => {
    const { store, viewport } = mk(0);
    store.append(rowsDoc(10, "a"));

    expect(viewport.visible().entries).toEqual([]);
    // I2's range with `viewportHeight` 0 is `[0, totalRows]`, so following the
    // tail legitimately lands at `totalRows`. A zero-height viewport is a
    // transient during a resize, and coming back from it at the bottom is right.
    expect(viewport.scroll.topRow).toBeLessThanOrEqual(viewport.scroll.totalRows);
    expect(viewport.scroll.topRow).toBeGreaterThanOrEqual(0);
  });

  it("T3.4: viewportHeight of 1 → exactly one row visible", () => {
    const { store, viewport } = mk(1);
    store.append(rowsDoc(10, "a"));

    const r = viewport.visible();
    expect(r.entries.reduce((n, e) => n + e.takeRows, 0)).toBe(1);
  });

  it("T3.5: one entry taller than the viewport scrolls within itself at every offset", () => {
    const { store, viewport } = mk(4);
    store.append(rowsDoc(12, "big"));
    viewport.scrollToTop();

    for (let top = 0; top <= 8; top += 1) {
      const r = viewport.visible();
      expect(r.entries, `top ${top}`).toHaveLength(1);
      expect(r.entries[0], `top ${top}`).toMatchObject({ skipRows: top, takeRows: 4 });
      viewport.scrollBy(1);
    }
  });

  it("T3.6b: a transcript of nothing but zero-height entries → no rows, no throw", () => {
    const { store, viewport } = mk(6);
    for (let i = 0; i < 5; i += 1) store.append(emptyDoc(`e${i}`));

    expect(viewport.scroll.totalRows).toBe(0);
    expect(viewport.visible().entries).toEqual([]);
  });
});

describe("C14 edge — resize", () => {
  it("T3.7 (I7): a row offset exceeding its entry's new height clamps within it", () => {
    // Narrowing makes text wrap, so an entry gets taller, not shorter. The case
    // I7 is about is the reverse: widening, where the anchored row may no longer
    // exist. It clamps to that entry's last row rather than spilling into the next.
    const { store, viewport } = mk(3, undefined, 20);
    store.append(rowsDoc(2, "a"));
    store.append(wrappingDoc("long"));
    // Content *below* the anchor, or the clamp is what the assertion measures:
    // once the text stops wrapping the whole transcript would fit the screen,
    // and I2 would force topRow to 0 for reasons that have nothing to do with I7.
    store.append(rowsDoc(20, "tail"));
    viewport.scrollToTop();
    viewport.scrollBy(5);
    const anchored = viewport.anchor;

    // The anchor is deep inside the wrapping entry, at a row that will not exist
    // once the text stops wrapping.
    expect(anchored).not.toBeNull();
    expect(anchored?.rowOffset ?? 0).toBeGreaterThan(0);

    viewport.resize({ width: 200, height: 3 });

    const i = store.entries.findIndex((e) => e.id === anchored?.id);
    const height = measureSequence(store.entries[i]?.doc.blocks ?? [], 200);
    // Never spilling: topRow stays inside the anchored entry's own rows.
    const rowsBefore = store.entries
      .slice(0, i)
      .reduce((n, e) => n + measureSequence(e.doc.blocks, 200), 0);
    expect(viewport.scroll.topRow).toBeGreaterThanOrEqual(rowsBefore);
    expect(viewport.scroll.topRow).toBeLessThanOrEqual(rowsBefore + Math.max(0, height - 1));
  });

  it("T3.11: fifty rapid resizes → the final state is correct for the final width", () => {
    // Width-sensitive entries, or the test resizes nothing: `raw` measures one
    // row at every width, so a transcript of `rowsDoc`s alone makes this vacuous.
    const { store, viewport } = mk(6);
    for (let i = 0; i < 6; i += 1) store.append(wrappingDoc(`d${i}`));
    viewport.scrollToTop();
    viewport.scrollBy(5);

    for (let i = 0; i < 50; i += 1) viewport.resize({ width: i % 2 === 0 ? 40 : 100, height: 6 });
    viewport.resize({ width: W, height: 6 });

    // No accumulated drift: the total is what a fresh measurement says it is.
    const expected = store.entries.reduce((n, e) => n + measureSequence(e.doc.blocks, W), 0);
    expect(viewport.scroll.totalRows).toBe(expected);
    expect(viewport.visible().entries.reduce((n, e) => n + e.takeRows, 0)).toBe(6);
  });

  it("T3.12 (I8): a height-only resize invalidates no cached height", () => {
    const { store, viewport } = mk(6);
    for (let i = 0; i < 4; i += 1) store.append(rowsDoc(3, `d${i}`));
    const before = viewport.stats.cacheSize;
    expect(before).toBeGreaterThan(0);

    viewport.resize({ width: W, height: 12 });

    // Dragging a terminal's bottom edge must not cost a remeasure per frame.
    expect(viewport.stats.cacheSize).toBe(before);
  });
});

describe("C14 edge — the anchor", () => {
  it("T3.8 (I6): the anchored entry is evicted → content, not a blank screen", () => {
    // **The frame-read defect.** With an index that assumed an append is a pure
    // tail push, this produced totalRows 0 and an empty range over a transcript
    // holding three entries — and an assertion on "the anchor falls forward"
    // reports that as a pass, because topRow really is 0.
    const { store, viewport } = mk(4, 9);
    for (let i = 0; i < 3; i += 1) store.append(rowsDoc(3, `c${i}`));
    viewport.scrollToTop();
    viewport.scrollBy(1);
    const anchored = viewport.anchor?.id;

    for (let i = 3; i < 6; i += 1) store.append(rowsDoc(3, `c${i}`));

    expect(store.entries.some((e) => e.id === anchored)).toBe(false);
    expect(viewport.scroll.totalRows).toBeGreaterThan(0);
    const r = viewport.visible();
    expect(r.entries.length).toBeGreaterThan(0);
    expect(r.entries.reduce((n, e) => n + e.takeRows, 0)).toBe(4);
  });

  it("T3.9: eviction below the cap while detached → visible content is unchanged", () => {
    const { store, viewport } = mk(4, 400);
    for (let i = 0; i < 10; i += 1) store.append(rowsDoc(3, `d${i}`));
    viewport.scrollToTop();
    viewport.scrollBy(12);
    const before = viewport.visible();

    store.append(rowsDoc(3, "new"));

    expect(viewport.visible().entries).toEqual(before.entries);
  });

  it("T3.10: eviction while following → still at the bottom", () => {
    const { store, viewport } = mk(4, 12);
    for (let i = 0; i < 20; i += 1) {
      store.append(rowsDoc(3, `d${i}`));
      expect(viewport.scroll.followTail, `after ${i}`).toBe(true);
      expect(viewport.visible().atBottom, `after ${i}`).toBe(true);
    }
  });

  it("T3.13: a patch shrinking the transcript → topRow clamps rather than exceeding it", () => {
    const { store, viewport } = mk(4);
    const id = store.append(rowsDoc(20, "a"), { streaming: true });
    viewport.scrollToBottom();
    viewport.scrollBy(-2);

    store.patch(id, { op: "replace", blockId: "a-0", block: { kind: "raw", id: "a-0", text: "x" } });

    const max = Math.max(0, viewport.scroll.totalRows - 4);
    expect(viewport.scroll.topRow).toBeLessThanOrEqual(max);
  });
});

describe("C14 edge — the frame agrees with the range", () => {
  it("T3.19: the rows the range selects are the rows C09 draws, at every offset", () => {
    // The drift check in miniature, and the reason the walk is a step: a range
    // that is arithmetically self-consistent can still select rows that are not
    // the ones on screen. This slices the real render by the real range.
    const { store, viewport } = mk(4);
    store.append(rowsDoc(6, "a"));
    store.append(rowsDoc(6, "b"));
    viewport.scrollToTop();

    for (let top = 0; top <= 8; top += 1) {
      const drawn: string[] = [];
      for (const ve of viewport.visible().entries) {
        const entry = store.entries.find((e) => e.id === ve.id);
        if (entry === undefined) continue;
        drawn.push(...renderEntry(entry.doc.blocks, W).slice(ve.skipRows, ve.skipRows + ve.takeRows));
      }

      expect(drawn, `top ${top}`).toHaveLength(4);
      // Row `top` of the whole transcript is the first row on screen.
      const all = store.entries.flatMap((e) => renderEntry(e.doc.blocks, W));
      expect(drawn, `top ${top}`).toEqual(all.slice(top, top + 4));

      viewport.scrollBy(1);
    }
  });
});
