// C14 tier 3 — edge. Degenerate sizes, resize, and the anchor under eviction.
//
// Three of these were read as frames before they were written as assertions, and
// two of those are here because the frame disagreed with what the numbers implied.
import { describe, expect, it } from "vitest";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { W, emptyDoc, measureSequence, renderEntry, rowsDoc, wrappingDoc } from "../support/viewport.js";
import { measurable } from "../support/render.js";
import type { Block } from "../../src/data/viewmodel/index.js";

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

  it("T3.12c (§5 step 6): a following viewport resized shorter is still at the tail", () => {
    // **Step 6 was written and never built.** `resize` went straight to
    // `#restoreFromAnchor`, which for a follower (`anchor === null`) only clamps
    // `topRow` into the new bounds — so shrinking the region left `topRow` where
    // it was and the transcript's last rows slid off the bottom, one per row
    // lost. `#afterContent` has the same two-branch shape ten lines away, which
    // is exactly what makes the omission read as a finished step.
    //
    // It stayed invisible while `resize` fired only on `SIGWINCH`: one event
    // deep, and a tail that drifts after a resize reads as the terminal's doing.
    // L4 now sets the height per frame (C22 I34), where it compounds.
    const { store, viewport } = mk(10);
    for (let i = 0; i < 8; i += 1) store.append(rowsDoc(3, `d${i}`));
    expect(viewport.scroll.followTail, "the control: following to begin with").toBe(true);

    const lastRow = viewport.scroll.totalRows - 1;
    const bottomOf = (): number => viewport.scroll.topRow + viewport.scroll.viewportHeight - 1;
    expect(bottomOf(), "the tail is on screen").toBe(lastRow);

    // Shrinking, which is what a growing prompt does to the region.
    for (const height of [9, 8, 7, 4]) {
      viewport.resize({ width: W, height });
      expect(viewport.scroll.followTail, `still following at ${String(height)}`).toBe(true);
      expect(bottomOf(), `the last row is still the last row at ${String(height)}`).toBe(lastRow);
      expect(viewport.visible().atBottom, `atBottom at ${String(height)}`).toBe(true);
    }
  });

  it("T3.12b (I21): a resize to the size already held does nothing and emits nothing", () => {
    // **From a detached viewport with a captured anchor**, and that is the whole
    // setup. From a tail-following one at the top of a short transcript, steps 1
    // and 4 capture and restore the same value and the row passes with the guard
    // removed — the convenient state is the one where both readings agree.
    const { store, viewport } = mk(6);
    for (let i = 0; i < 8; i += 1) store.append(rowsDoc(3, `d${i}`));
    viewport.scrollToTop();
    viewport.scrollBy(4);
    expect(viewport.anchor, "detached, with something to lose").not.toBeNull();

    const changes: string[] = [];
    using _sub = viewport.subscribe((c) => void changes.push(c.kind));
    const before = { scroll: viewport.scroll, anchor: viewport.anchor, stats: viewport.stats };

    viewport.resize({ width: W, height: 6 });

    // **The emit is the half that matters.** A `Change` says the view moved, and
    // L4 answers a change by composing a frame — while L4 now sets the height
    // from the frame it just composed (C22 I34), so without this guard that is
    // one frame per frame. The state assertions are the corroboration; the empty
    // `changes` is the claim.
    expect(changes, "no change for a resize that is not one").toEqual([]);
    expect(viewport.scroll).toEqual(before.scroll);
    expect(viewport.anchor).toEqual(before.anchor);
    expect(viewport.stats).toEqual(before.stats);
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
  it("T3.5b: the rows the range selects are the rows C09 draws, at every offset", () => {
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

  it("T3.19 (I23): a `code` window never opens inside a wrapped source line — the unit is the line", () => {
    // **Units are source lines, not rows** (C14 §4a, C04 I82). Every line here
    // is 50 cells and the width is 20, so each wraps to exactly three rows; a
    // window landing inside one keeps the whole line and pays the surplus in
    // `skipRows`/`dropRows`, which is `table`'s expanded-row shape one kind over
    // (C09 I26). Asserted through the registry's `windowSequence` rather than
    // the definition alone, because that is the seam the transcript takes.
    const r = measurable();
    const line = (i: number): string => `const value${String(i)} = "${"x".repeat(35)}";`.slice(0, 50);
    const block = {
      kind: "code",
      id: "wrapped",
      language: "typescript",
      wrap: true,
      text: Array.from({ length: 5 }, (_, i) => line(i)).join("\n"),
    } as Block;
    expect(r.measure(block, 20), "five lines of three rows").toBe(15);

    // A window of one row over a block whose every line wraps to three → one
    // unit, and the two residuals sum to the other two rows.
    const one = r.window(block, 20, 4, 5);
    expect(one?.skipRows, "row 4 is the middle row of line 1").toBe(1);
    expect(one?.dropRows).toBe(1);
    expect(r.measure(one?.block as Block, 20), "one unit").toBe(3);
    expect((one?.block as { lineRange?: readonly [number, number] }).lineRange).toEqual([1, 2]);

    // Opening in the middle of a wrapped line: the whole line is kept and the
    // surplus above `from` is charged to `skipRows`.
    const mid = r.window(block, 20, 4, 7);
    expect(mid?.skipRows, "one row of line 1 above the window").toBe(1);
    expect(mid?.dropRows, "two rows of line 2 past it").toBe(2);
    expect(r.measure(mid?.block as Block, 20) - (mid?.skipRows ?? 0) - (mid?.dropRows ?? 0), "C09 I26").toBe(3);

    // **And the rows are the ones the whole rendering put there**, so the
    // arithmetic above is not merely self-consistent (C09 §2a).
    const full = r.renderToLines(block, 20);
    const kept = r.renderToLines(mid?.block as Block, 20);
    expect(kept.slice(mid?.skipRows, kept.length - (mid?.dropRows ?? 0))).toEqual(full.slice(4, 7));
  });
});
