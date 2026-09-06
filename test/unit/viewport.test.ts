// C14 tier 1 — unit. The visibility arithmetic and the scroll model.
//
// **Naming, because `live` means three things and they meet here.** C08 has a
// `live` handler mode, C13 has the live entry, S01 draws the live gutter. "The live
// entry's marker" could mean four things and reads as unambiguous to whoever writes
// it — which is the defect the C14 spec pass found under the name "the marker",
// arriving through a word where SP3 structurally cannot see it. So: **the live
// entry** is C13's newest; **the live gutter** is the `▌` C14 marks and S01 draws;
// **the eviction marker** is C13's synthetic entry. Never "the marker" alone.
import { describe, expect, it } from "vitest";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { W, emptyDoc, measureSequence, rowsDoc, sumMeasure } from "../support/viewport.js";

const mk = (height: number, cap?: number) => {
  const store = createTranscriptStore(cap === undefined ? {} : { cap });
  const viewport = createViewport(store, { width: W, height, measureSequence });
  return { store, viewport };
};

describe("C14 unit — visibility", () => {
  it("T1.1 (I10): takeRows sum to viewportHeight exactly", () => {
    const { store, viewport } = mk(6);
    store.append(rowsDoc(4, "a"));
    store.append(rowsDoc(4, "b"));
    store.append(rowsDoc(4, "c"));

    const r = viewport.visible();
    expect(r.entries.reduce((n, e) => n + e.takeRows, 0)).toBe(6);
  });

  it("T1.2: an entry straddling the top edge → skipRows set, takeRows reduced", () => {
    const { store, viewport } = mk(4);
    store.append(rowsDoc(6, "a"));
    store.append(rowsDoc(6, "b"));
    viewport.scrollToTop();
    viewport.scrollBy(2);

    const first = viewport.visible().entries[0];
    expect(first).toMatchObject({ skipRows: 2, takeRows: 4 });
  });

  it("T1.3: an entry straddling BOTH edges → one entry, both numbers correct", () => {
    // Read as a frame during the C14 walk: a 12-row entry, a 4-row viewport, five
    // rows above and three below. The single-entry range is the whole screen.
    const { store, viewport } = mk(4);
    store.append(rowsDoc(12, "big"));
    viewport.scrollToTop();
    viewport.scrollBy(5);

    const r = viewport.visible();
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ skipRows: 5, takeRows: 4 });
    expect(r.atTop).toBe(false);
    expect(r.atBottom).toBe(false);
  });

  it("T1.4: totalRows < viewportHeight → topRow 0, atTop and atBottom both true", () => {
    const { store, viewport } = mk(10);
    store.append(rowsDoc(2, "small"));

    const r = viewport.visible();
    expect(r.topRow).toBe(0);
    expect(r.atTop).toBe(true);
    expect(r.atBottom).toBe(true);
    expect(r.entries.reduce((n, e) => n + e.takeRows, 0)).toBe(2);
  });

  it("T1.16 (I18): exactly one visible entry reports live, and it is C13's liveId", () => {
    const { store, viewport } = mk(20);
    store.append(rowsDoc(2, "a"));
    store.append(rowsDoc(2, "b"));
    const live = store.append(rowsDoc(2, "c"));

    const r = viewport.visible();
    const marked = r.entries.filter((e) => e.live);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.id).toBe(live);
    expect(store.liveId).toBe(live);
  });

  it("T1.16b (I18): the live entry scrolled out of view marks nothing", () => {
    const { store, viewport } = mk(3);
    store.append(rowsDoc(10, "a"));
    store.append(rowsDoc(2, "live"));
    viewport.scrollToTop();

    expect(viewport.visible().entries.some((e) => e.live)).toBe(false);
  });
});

describe("C14 unit — heights", () => {
  it("T2.9 (I1): an entry's height is measureSequence, not the sum of its blocks", () => {
    // The two differ by exactly one row per `gapBefore` (C09 I17), and the
    // summation is what a reader writes. The fixture declares a gap so the two
    // functions disagree — a corpus without one lets the wrong choice pass.
    const gapped = rowsDoc(4, "gapped", 2);
    expect(measureSequence(gapped.blocks, W)).toBe(sumMeasure(gapped.blocks, W) + 1);

    const { store, viewport } = mk(20);
    store.append(gapped);
    expect(viewport.scroll.totalRows).toBe(measureSequence(gapped.blocks, W));
    expect(viewport.scroll.totalRows).not.toBe(sumMeasure(gapped.blocks, W));
  });

  it("T3.6: a zero-height entry consumes no row and does not break the index", () => {
    const { store, viewport } = mk(10);
    store.append(rowsDoc(2, "a"));
    store.append(emptyDoc("nothing"));
    const b = store.append(rowsDoc(2, "b"));

    const r = viewport.visible();
    expect(viewport.scroll.totalRows).toBe(4);
    // Reported entries are the ones that occupy rows. A `takeRows: 0` entry
    // would satisfy I10's sum while putting something on screen that is not there.
    expect(r.entries.map((e) => e.id)).toEqual([store.entries[0]?.id, b]);
    expect(r.entries.reduce((n, e) => n + e.takeRows, 0)).toBe(4);
  });
});

describe("C14 unit — scrolling", () => {
  it("T1.5: scroll up by 5 from detached → topRow decreases by 5, still detached", () => {
    const { store, viewport } = mk(4);
    store.append(rowsDoc(30, "a"));
    viewport.scrollToBottom();
    viewport.scrollBy(-5);
    const before = viewport.scroll.topRow;
    viewport.scrollBy(-5);

    expect(viewport.scroll.topRow).toBe(before - 5);
    expect(viewport.scroll.followTail).toBe(false);
  });

  it("T1.6 (I5): scroll up by 1 while following → followTail off", () => {
    const { store, viewport } = mk(4);
    store.append(rowsDoc(30, "a"));
    expect(viewport.scroll.followTail).toBe(true);

    viewport.scrollBy(-1);
    expect(viewport.scroll.followTail).toBe(false);
  });

  it("T1.6b (I5): followTail is derived from position, not from direction", () => {
    // A scroll up that cannot move — because the transcript is shorter than the
    // screen — has not detached anything. Tracking a flag per keystroke rather
    // than deriving it from where the viewport landed gets this wrong.
    const { store, viewport } = mk(10);
    store.append(rowsDoc(3, "a"));

    viewport.scrollBy(-1);
    expect(viewport.scroll.followTail).toBe(true);
  });

  it("T1.7: End from detached → bottom, followTail on", () => {
    const { store, viewport } = mk(4);
    store.append(rowsDoc(30, "a"));
    viewport.scrollToTop();
    viewport.scrollToBottom();

    expect(viewport.scroll.followTail).toBe(true);
    expect(viewport.visible().atBottom).toBe(true);
  });

  it("T1.8 (I17): a page moves exactly viewportHeight − 1, both ways", () => {
    const { store, viewport } = mk(10);
    store.append(rowsDoc(100, "a"));
    viewport.scrollToTop();

    viewport.pageDown();
    expect(viewport.scroll.topRow).toBe(9);
    viewport.pageDown();
    expect(viewport.scroll.topRow).toBe(18);
    viewport.pageUp();
    expect(viewport.scroll.topRow).toBe(9);
  });

  it("T1.9 (I2): scrolling past either end clamps, and topRow is never negative", () => {
    const { store, viewport } = mk(4);
    store.append(rowsDoc(10, "a"));

    viewport.scrollBy(-1000);
    expect(viewport.scroll.topRow).toBe(0);
    viewport.scrollBy(1000);
    expect(viewport.scroll.topRow).toBe(6);
  });

  it("T1.10 (I4): an entry above the viewport grows while detached → nothing moves", () => {
    // The single most noticeable correctness property in the component, and it
    // was read as a frame before it was written as an assertion: the same four
    // rows stay on screen while `topRow` shifts by exactly what was added above.
    const { store, viewport } = mk(4);
    const watch = store.append(rowsDoc(5, "watch"), { streaming: true });
    store.append(rowsDoc(10, "cmd"));
    viewport.scrollToTop();
    viewport.scrollBy(8);

    const before = viewport.visible();
    const beforeTop = viewport.scroll.topRow;

    for (let i = 0; i < 3; i += 1) {
      store.patch(watch, {
        op: "append",
        block: { kind: "raw", id: `w-t${i}`, text: `tick ${i}` },
      });
    }

    const after = viewport.visible();
    expect(after.entries).toEqual(before.entries);
    expect(viewport.scroll.topRow).toBe(beforeTop + 3);
  });

  it("T1.11: the same while following → the viewport tracks the bottom", () => {
    const { store, viewport } = mk(4);
    const live = store.append(rowsDoc(10, "a"), { streaming: true });
    expect(viewport.scroll.followTail).toBe(true);

    store.patch(live, { op: "append", block: { kind: "raw", id: "extra", text: "extra" } });

    expect(viewport.visible().atBottom).toBe(true);
    expect(viewport.scroll.topRow).toBe(viewport.scroll.totalRows - 4);
  });

  it("T1.12 (I3): a theme change invalidates nothing — there is nowhere for it to enter", () => {
    // C09 §4 makes capability substitutions 1:1 by cell count and C10 T4.1 asserts
    // geometry is identical across themes, so the key excludes both by construction.
    const { store, viewport } = mk(4);
    store.append(rowsDoc(10, "a"));
    const before = viewport.stats.cacheSize;

    // There is no `setTheme`: the absence is the assertion. A theme reaching C14
    // would have to arrive through `ViewportOptions`, which carries width, height
    // and the measurer and nothing else.
    expect(Object.keys(viewport)).not.toContain("setTheme");
    expect(viewport.stats.cacheSize).toBe(before);
  });
});

describe("C14 unit — entryAtRow (I19)", () => {
  // **Spec'd in C14 §10 and in no file** for as long as the method existed
  // (F754). Every row names *which* entry and *which* offset: a non-null answer
  // one row off passes every assertion about there being an answer.

  /** SS2 bans `Math.random` across `src/`, and a flaky property is worse than none. */
  const rng = (seed: number): ((n: number) => number) => {
    let s = seed;
    return (n: number) => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s % n;
    };
  };

  it("T2.11 (I19): over a seeded corpus, entryAtRow agrees with visible() for every region row", () => {
    const next = rng(19);
    let checked = 0;
    for (let trial = 0; trial < 40; trial += 1) {
      const height = 3 + next(10);
      const { store, viewport } = mk(height);
      const n = 1 + next(6);
      for (let i = 0; i < n; i += 1) store.append(rowsDoc(1 + next(7), `e${String(trial)}-${String(i)}`));
      viewport.scrollToTop();
      viewport.scrollBy(next(viewport.scroll.totalRows + 2));

      // Asserted against `visible()`, not a hand-rolled walk: the entry whose
      // `skipRows`/`takeRows` span covers the row, at `skipRows + (row − start)`.
      const seen = viewport.visible();
      let start = 0;
      for (const v of seen.entries) {
        for (let row = start; row < start + v.takeRows; row += 1) {
          expect(viewport.entryAtRow(row), `trial ${String(trial)} row ${String(row)}`).toEqual({
            id: v.id,
            rowOffset: v.skipRows + (row - start),
          });
          checked += 1;
        }
        start += v.takeRows;
      }
      // Every row the selection does not fill is nobody's.
      for (let row = start; row < height; row += 1) expect(viewport.entryAtRow(row)).toBeNull();
    }
    expect(checked, "the subject, before the claim").toBeGreaterThan(100);
  });

  it("T2.12 (I19): a thousand calls leave scroll, anchor and stats identical", () => {
    const { store, viewport } = mk(4);
    store.append(rowsDoc(6, "a"));
    store.append(rowsDoc(6, "b"));
    viewport.scrollToTop();
    viewport.scrollBy(3);
    const scroll = { ...viewport.scroll };
    const anchor = viewport.anchor === null ? null : { ...viewport.anchor };
    const stats = { ...viewport.stats };
    for (let i = 0; i < 1000; i += 1) viewport.entryAtRow(i % 6);
    expect(viewport.scroll).toEqual(scroll);
    expect(viewport.anchor).toEqual(anchor);
    expect(viewport.stats).toEqual(stats);
  });

  it("T3.1b (I19): empty, negative, and below a short transcript → null, never the last entry", () => {
    const empty = mk(10);
    expect(empty.viewport.entryAtRow(0)).toBeNull();

    const { store, viewport } = mk(10);
    const a = store.append(rowsDoc(2, "a"));
    expect(viewport.entryAtRow(0), "the first entry's first row").toEqual({ id: a, rowOffset: 0 });
    expect(viewport.entryAtRow(1), "and its last").toEqual({ id: a, rowOffset: 1 });
    expect(viewport.entryAtRow(2), "the row past it").toBeNull();
    expect(viewport.entryAtRow(9), "the region's last row").toBeNull();
    expect(viewport.entryAtRow(10), "the row past the region").toBeNull();
    expect(viewport.entryAtRow(-1)).toBeNull();
    expect(viewport.entryAtRow(0.5), "a fractional row is no row").toBeNull();
  });

  it("T3.1c (I19): an entry begun above the top edge answers with the rows already scrolled, and the boundary is the next entry's row 0", () => {
    const { store, viewport } = mk(4);
    const a = store.append(rowsDoc(6, "a"));
    const b = store.append(rowsDoc(6, "b"));
    viewport.scrollToTop();
    viewport.scrollBy(2);
    expect(viewport.visible().entries[0]).toMatchObject({ id: a, skipRows: 2, takeRows: 4 });

    expect(viewport.entryAtRow(0), "region row 0 is a's row 2, not its row 0").toEqual({ id: a, rowOffset: 2 });
    expect(viewport.entryAtRow(3), "region row 3 is a's last row").toEqual({ id: a, rowOffset: 5 });
    expect(viewport.entryAtRow(4), "past the region, though a document row exists there").toBeNull();

    viewport.scrollBy(2); // topRow 4: a's rows 4–5, then b's 0–1
    expect(viewport.entryAtRow(1), "a's last row").toEqual({ id: a, rowOffset: 5 });
    expect(viewport.entryAtRow(2), "the boundary: b's first row, offset 0").toEqual({ id: b, rowOffset: 0 });
    expect(viewport.entryAtRow(3)).toEqual({ id: b, rowOffset: 1 });
  });
});
