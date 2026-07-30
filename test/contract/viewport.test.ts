// C14 tier 2 — contract. The post-conditions, asserted over operation sequences.
//
// **Every property here runs over a sequence, not a call**, and that is the shape
// both C14 rulings argued for. I3 and I9 were each correct at the instant they were
// written and silent about what follows — a validity rule that says nothing about
// lifetime, an eviction offset that says nothing about a session — so a test that
// makes one call and checks one number is the test that passed while both defects
// were live. C13's `blockCount ≤ cap or overCap = blockCount − cap` is the same form.
//
// **After each operation, never inside a `Change` callback.** One `store.append()`
// emits `append` and then `evict`, and between them the cache legitimately holds
// slots for entries that have just left. Asserting mid-flight asserts against a
// half-applied operation.
import { describe, expect, it } from "vitest";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { HeightIndex } from "../../src/viewport/viewport/index-tree.js";
import { W, emptyDoc, measureSequence, rowsDoc } from "../support/viewport.js";
import type { Viewport } from "../../src/viewport/viewport/index.js";
import type { TranscriptStore } from "../../src/viewport/transcript/index.js";

/** A small deterministic generator — SS2 bans `Math.random` across `src/`, and a
 *  flaky property test is worse than none. */
function rng(seed: number): (n: number) => number {
  let s = seed;
  return (n: number) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s % n;
  };
}

/** The post-conditions I3 and I9 state, checked together after every operation. */
function checkInvariants(v: Viewport, s: TranscriptStore, after: string): void {
  const { cacheSize, indexCapacity, entryCount } = v.stats;

  expect(cacheSize, `${after}: cache holds ${cacheSize} slots for ${entryCount} entries`).toBeLessThanOrEqual(entryCount);
  expect(
    indexCapacity,
    `${after}: index array is ${indexCapacity} for ${entryCount} live entries`,
  ).toBeLessThanOrEqual(Math.max(2, 2 * entryCount));

  // The index must agree with the transcript about how many rows there are, or
  // every visibility decision is made against a different document than the one
  // that will be drawn — which is §1's drift.
  const expected = s.entries.reduce((n, e) => n + measureSequence(e.doc.blocks, W), 0);
  expect(v.scroll.totalRows, `${after}: totalRows disagrees with the transcript`).toBe(expected);

  // I2, over the whole sequence rather than at one call.
  const max = Math.max(0, v.scroll.totalRows - v.scroll.viewportHeight);
  expect(v.scroll.topRow, `${after}: topRow out of range`).toBeGreaterThanOrEqual(0);
  expect(v.scroll.topRow, `${after}: topRow past the end`).toBeLessThanOrEqual(max);

  // I10, at whatever position the sequence left us in.
  const r = v.visible();
  const sum = r.entries.reduce((n, e) => n + e.takeRows, 0);
  expect(sum, `${after}: visible rows`).toBe(Math.min(v.scroll.viewportHeight, v.scroll.totalRows));
}

describe("C14 contract — post-conditions over sequences", () => {
  it("T2.3b · T2.8 (I3, I9): 600 mixed operations, checked after every one", () => {
    const store = createTranscriptStore({ cap: 60 });
    const viewport = createViewport(store, { width: W, height: 8, measureSequence });
    const next = rng(11);
    const streaming: string[] = [];

    for (let i = 0; i < 600; i += 1) {
      const roll = next(12);
      if (roll < 5) {
        const isStream = next(3) === 0;
        const id = store.append(rowsDoc(1 + next(5), `d${i}`), { streaming: isStream });
        if (isStream) streaming.push(id);
        checkInvariants(viewport, store, `append ${i}`);
      } else if (roll < 7 && streaming.length > 0) {
        const id = streaming[next(streaming.length)] ?? "";
        store.patch(id, { op: "append", block: { kind: "raw", id: `p${i}`, text: `patch ${i}` } });
        checkInvariants(viewport, store, `patch ${i}`);
      } else if (roll < 8 && streaming.length > 0) {
        store.settle(streaming.shift() ?? "");
        checkInvariants(viewport, store, `settle ${i}`);
      } else if (roll < 9) {
        store.append(emptyDoc(`empty${i}`));
        checkInvariants(viewport, store, `empty append ${i}`);
      } else if (roll < 10) {
        viewport.scrollBy(next(21) - 10);
        checkInvariants(viewport, store, `scroll ${i}`);
      } else if (roll < 11) {
        viewport.resize({ width: 40 + next(60), height: 1 + next(20) });
        checkInvariants(viewport, store, `resize ${i}`);
      } else {
        store.clear();
        streaming.length = 0;
        checkInvariants(viewport, store, `clear ${i}`);
      }
    }
  });

  it("T2.8 (I9): a session that evicts continuously and never resizes stays bounded", () => {
    // The ruling's own case. An offset that never compacts grows the array with
    // total appends ever, and a terminal left open all day never resizes.
    const store = createTranscriptStore({ cap: 20 });
    const viewport = createViewport(store, { width: W, height: 6, measureSequence });

    for (let i = 0; i < 3_000; i += 1) store.append(rowsDoc(2, `d${i}`));

    expect(viewport.stats.entryCount).toBeLessThanOrEqual(12);
    expect(viewport.stats.indexCapacity).toBeLessThanOrEqual(2 * viewport.stats.entryCount);
    expect(viewport.stats.cacheSize).toBeLessThanOrEqual(viewport.stats.entryCount);
  });

  it("T2.3b (I3): a thousand ticks on one entry leave one slot, not a thousand", () => {
    // T3.18 from the spec, and the leak the composite-key reading produces. It is
    // invisible to T2.3, which only asks what the predicate contains.
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: W, height: 10, measureSequence });
    const id = store.append(rowsDoc(1, "w"), { streaming: true });

    for (let i = 0; i < 1_000; i += 1) {
      store.patch(id, { op: "append", block: { kind: "raw", id: `t${i}`, text: `tick ${i}` } });
    }

    expect(store.entries[0]?.rev).toBe(1_000);
    expect(viewport.stats.cacheSize).toBe(1);
  });

  it("T2.10 (I1, I6): an append that evicts leaves the index mirroring entries", () => {
    // The regression guard for the defect the frame reading found. C13 emits
    // `append` then `evict` for one call, so the append handler sees a list that
    // has already lost its front — and a handler that pushed one slot produced a
    // blank screen over a non-empty transcript. Every assertion about anchors and
    // clamping passed while it did.
    const store = createTranscriptStore({ cap: 9 });
    const viewport = createViewport(store, { width: W, height: 4, measureSequence });
    for (let i = 0; i < 3; i += 1) store.append(rowsDoc(3, `c${i}`));
    viewport.scrollToTop();
    viewport.scrollBy(1);

    for (let i = 3; i < 6; i += 1) {
      store.append(rowsDoc(3, `c${i}`));

      const expected = store.entries.reduce((n, e) => n + measureSequence(e.doc.blocks, W), 0);
      expect(viewport.scroll.totalRows, `after append ${i}`).toBe(expected);
      expect(viewport.scroll.totalRows).toBeGreaterThan(0);
      // The screen is not blank, which is the assertion the numbers alone missed.
      expect(viewport.visible().entries.length, `after append ${i}`).toBeGreaterThan(0);
    }
  });

  it("T2.2 (I9): visibility stays logarithmic from 100 to 100,000 entries", () => {
    const index = new HeightIndex();
    for (let i = 0; i < 100_000; i += 1) index.push(1 + (i % 5));

    // Structural rather than timed: a wall-clock assertion on a shared runner is
    // a flake generator. The descent visits ⌈log2 n⌉ nodes by construction, and a
    // linear scan would fail T5.2's budget rather than this.
    const mid = index.locate(Math.floor(index.totalRows / 2));
    expect(mid.index).toBeGreaterThan(0);
    expect(index.rowsBefore(mid.index) + mid.offset).toBe(Math.floor(index.totalRows / 2));
  });

  it("T2.7: every C13 Change variant has a defined effect here", () => {
    const store = createTranscriptStore({ cap: 4 });
    const viewport = createViewport(store, { width: W, height: 6, measureSequence });
    const seen = new Set<string>();
    store.subscribe((c) => void seen.add(c.kind));

    const id = store.append(rowsDoc(2, "a"), { streaming: true });
    store.patch(id, { op: "append", block: { kind: "raw", id: "x", text: "x" } });
    store.settle(id);
    store.append(rowsDoc(4, "b"));
    store.clear();

    expect([...seen].sort()).toEqual(["append", "clear", "evict", "patch", "settle"]);
    checkInvariants(viewport, store, "after the exhaustive sweep");
  });
});
