// C14 tier 6 — fail-on-revert. Each names the change that makes it fail.
//
// Four of these guard defects that were live in this component's first draft, and
// three of those four are the shape A03 §2 records: the rule is right and the
// moment is missing. The fourth is a Fenwick node born holding zero.
import { describe, expect, it } from "vitest";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { HeightIndex } from "../../src/viewport/viewport/index-tree.js";
import { HeightCache } from "../../src/viewport/viewport/cache.js";
import { W, measureSequence, rowsDoc, sumMeasure, wrappingDoc } from "../support/viewport.js";

describe("C14 fail-on-revert", () => {
  it("T6.1 (I4): recomputing topRow from an index rather than the anchor → the view jumps", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: W, height: 4, measureSequence });
    const watch = store.append(rowsDoc(5, "watch"), { streaming: true });
    store.append(rowsDoc(10, "cmd"));
    viewport.scrollToTop();
    viewport.scrollBy(8);
    const before = viewport.visible();

    store.patch(watch, { op: "append", block: { kind: "raw", id: "grow", text: "grow" } });

    // Keeping `topRow` across a content change is the revert, and it reads as the
    // simpler implementation: the number did not change, so why recompute it?
    // Because the rows it points at did.
    expect(viewport.visible().entries).toEqual(before.entries);
    expect(viewport.scroll.topRow).toBe(9);
  });

  it("T6.2 (I3): adding theme to the validity predicate → every toggle remeasures", () => {
    // The predicate takes an id, a rev and a width. There is no seam for a theme
    // to arrive through: `ViewportOptions` carries width, height and the measurer.
    const cache = new HeightCache();
    cache.set("e1", 0, 80, 7);

    expect(cache.get("e1", 0, 80)).toBe(7);
    expect(cache.get("e1", 1, 80)).toBeUndefined();
    expect(cache.get("e1", 0, 81)).toBeUndefined();
  });

  it("T6.14 (I3): reading the predicate as a composite map key → a slot per tick", () => {
    // T2.3 still passes when this reverts, which is why T2.3b exists. The leak is
    // invisible to any test that asks only what the predicate contains.
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: W, height: 8, measureSequence });
    const id = store.append(rowsDoc(1, "w"), { streaming: true });

    for (let i = 0; i < 500; i += 1) {
      store.patch(id, { op: "append", block: { kind: "raw", id: `t${i}`, text: `t${i}` } });
    }

    expect(store.entries[0]?.rev).toBe(500);
    expect(viewport.stats.cacheSize).toBe(1);
  });

  it("T6.15 (I9): keeping the front offset and never rebuilding → the index outgrows the transcript", () => {
    const store = createTranscriptStore({ cap: 20 });
    const viewport = createViewport(store, { width: W, height: 6, measureSequence });

    for (let i = 0; i < 2_000; i += 1) store.append(rowsDoc(2, `d${i}`));

    // Without the rebuild this is 2,000-ish against a dozen live entries, and
    // nothing else in the suite notices: every number it reports stays correct.
    expect(viewport.stats.indexCapacity).toBeLessThanOrEqual(2 * viewport.stats.entryCount);
  });

  it("T6.16 (I1): summing measure instead of calling measureSequence → short by one row per gap", () => {
    // The most likely single defect in this component, because the summation is
    // what a reader writes. The fixture declares a gap so the two disagree.
    const gapped = rowsDoc(4, "g", 2);
    expect(measureSequence(gapped.blocks, W)).toBe(sumMeasure(gapped.blocks, W) + 1);

    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: W, height: 20, measureSequence });
    store.append(gapped);

    expect(viewport.scroll.totalRows).toBe(measureSequence(gapped.blocks, W));
  });

  it("T6.17 (I1, I6): treating an append as a pure tail push → a blank screen over a full transcript", () => {
    // **The defect the frame reading found, and the one no assertion here caught.**
    // C13 emits `append` then `evict` for one call, so the append handler sees a
    // list that has already lost its front and gained the eviction marker. Pushing
    // one slot desynchronises the index, and the symptom was `totalRows` of 0 —
    // which every assertion about anchors and clamping reports as a pass, because
    // topRow really is 0 and the range really is consistent with it.
    const store = createTranscriptStore({ cap: 9 });
    const viewport = createViewport(store, { width: W, height: 4, measureSequence });
    for (let i = 0; i < 3; i += 1) store.append(rowsDoc(3, `c${i}`));
    viewport.scrollToTop();
    viewport.scrollBy(1);

    for (let i = 3; i < 8; i += 1) {
      store.append(rowsDoc(3, `c${i}`));

      const expected = store.entries.reduce((n, e) => n + measureSequence(e.doc.blocks, W), 0);
      expect(viewport.scroll.totalRows, `append ${i}`).toBe(expected);
      expect(viewport.visible().entries.length, `append ${i}`).toBeGreaterThan(0);
    }
  });

  it("T6.18 (I9): a Fenwick node born holding zero → totals wrong at some lengths only", () => {
    // Growth, not arithmetic. Slot `n` covers `lsb(n)` slots ending at `n`, and
    // all of them were added before that node existed — `#add` walks upward
    // through nodes that are already there, so it cannot have reached it. Created
    // as 0, the node is short by everything underneath, and the error only shows
    // when a prefix sum crosses it: right at some lengths, wrong at others.
    const failures: string[] = [];
    for (let n = 1; n <= 64; n += 1) {
      const index = new HeightIndex();
      let expected = 0;
      for (let i = 0; i < n; i += 1) {
        const h = i % 3; // includes zeros, which is how T3.6 surfaced it
        index.push(h);
        expected += h;
      }
      if (index.totalRows !== expected) {
        failures.push(`n=${n}: total ${index.totalRows}, expected ${expected}`);
      }
      // And every prefix, since the defect hides in the ones that do not cross
      // the broken node.
      let running = 0;
      for (let i = 0; i < n; i += 1) {
        if (index.rowsBefore(i) !== running) {
          failures.push(`n=${n} prefix ${i}: ${index.rowsBefore(i)}, expected ${running}`);
        }
        running += index.at(i);
      }
    }

    expect(failures.slice(0, 10), failures.slice(0, 10).join("\n")).toEqual([]);
  });

  it("T6.7 (I8): invalidating on a height-only resize → resizing becomes needlessly expensive", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: W, height: 6, measureSequence });
    for (let i = 0; i < 5; i += 1) store.append(wrappingDoc(`d${i}`));
    const before = viewport.stats.cacheSize;

    viewport.resize({ width: W, height: 30 });
    expect(viewport.stats.cacheSize).toBe(before);

    // And a width change must still drop everything, or the opposite defect ships.
    viewport.resize({ width: 30, height: 30 });
    expect(viewport.scroll.totalRows).toBe(
      store.entries.reduce((n, e) => n + measureSequence(e.doc.blocks, 30), 0),
    );
  });

  it("T6.12 (I12): C14 calling the frame scheduler → L2 gains a dependency on L0-terminal", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: W, height: 4, measureSequence });

    // C14 reports a change and L4 commits, matching the C01 and C10 pattern. The
    // surface is the assertion: there is no scheduler to call and nowhere to
    // inject one.
    expect(Object.keys(viewport)).not.toContain("commit");
    expect(typeof viewport.subscribe).toBe("function");
  });
});
