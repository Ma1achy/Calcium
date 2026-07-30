// C14 tier 5 — e2e. Sessions rather than operations.
//
// T5.3 is the one a six-line test cannot stand in for: a log tail arriving while
// someone reads something further up. Every unit test here passes with a viewport
// that recomputes `topRow` from an index; a session does not.
import { describe, expect, it } from "vitest";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { W, measureSequence, renderEntry, rowsDoc } from "../support/viewport.js";

describe("C14 e2e", () => {
  it("T5.1: a 10,000-block transcript scrolled top to bottom → rows match at every screenful", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: W, height: 20, measureSequence });
    for (let i = 0; i < 500; i += 1) store.append(rowsDoc(20, `d${i}`));

    const all = store.entries.flatMap((e) => renderEntry(e.doc.blocks, W));
    expect(all).toHaveLength(10_000);
    expect(viewport.scroll.totalRows).toBe(10_000);

    viewport.scrollToTop();
    let screens = 0;
    while (!viewport.visible().atBottom) {
      const r = viewport.visible();
      const drawn: string[] = [];
      for (const ve of r.entries) {
        const entry = store.entries.find((e) => e.id === ve.id);
        if (entry === undefined) continue;
        drawn.push(...renderEntry(entry.doc.blocks, W).slice(ve.skipRows, ve.skipRows + ve.takeRows));
      }
      expect(drawn, `screen at ${r.topRow}`).toEqual(all.slice(r.topRow, r.topRow + 20));
      viewport.pageDown();
      screens += 1;
      if (screens > 1_000) break;
    }
    expect(screens).toBeGreaterThan(400);
  }, 30_000);

  it("T5.3: a log tail at speed while scrolled up reading → the view does not move", () => {
    const store = createTranscriptStore({ cap: 200_000 });
    const viewport = createViewport(store, { width: W, height: 20, measureSequence });
    const tail = store.append(rowsDoc(5, "tail"), { streaming: true });
    store.append(rowsDoc(200, "reading"));

    viewport.scrollToTop();
    viewport.scrollBy(60);
    const before = viewport.visible();
    const beforeTop = viewport.scroll.topRow;

    // A thousand lines into an entry *above* the viewport.
    for (let i = 0; i < 1_000; i += 1) {
      store.patch(tail, { op: "append", block: { kind: "raw", id: `l${i}`, text: `line ${i}` } });
    }

    expect(viewport.visible().entries).toEqual(before.entries);
    expect(viewport.scroll.topRow).toBe(beforeTop + 1_000);
    // And the cache did not grow with the stream, which is the other ruling.
    expect(viewport.stats.cacheSize).toBeLessThanOrEqual(viewport.stats.entryCount);
  }, 30_000);

  it("T5.4: the same, then End → snaps to the bottom and resumes following", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: W, height: 10, measureSequence });
    const tail = store.append(rowsDoc(5, "tail"), { streaming: true });
    // Enough rows to have somewhere to scroll *before* scrolling: with five rows
    // in a ten-row viewport, `maxTop` is 0 and staying at the bottom is correct,
    // so the detach below would assert nothing.
    for (let i = 0; i < 50; i += 1) {
      store.patch(tail, { op: "append", block: { kind: "raw", id: `pre${i}`, text: `pre ${i}` } });
    }

    viewport.scrollToTop();
    viewport.scrollBy(2);
    expect(viewport.scroll.followTail).toBe(false);

    for (let i = 0; i < 100; i += 1) {
      store.patch(tail, { op: "append", block: { kind: "raw", id: `l${i}`, text: `line ${i}` } });
    }
    expect(viewport.scroll.followTail).toBe(false);

    viewport.scrollToBottom();

    expect(viewport.scroll.followTail).toBe(true);
    expect(viewport.visible().atBottom).toBe(true);
    store.patch(tail, { op: "append", block: { kind: "raw", id: "after", text: "after" } });
    expect(viewport.visible().atBottom).toBe(true);
  });

  it("T5.5: a long session that appends, evicts, streams and resizes stays consistent", () => {
    const store = createTranscriptStore({ cap: 400 });
    const viewport = createViewport(store, { width: W, height: 14, measureSequence });
    let seed = 3;
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };

    for (let i = 0; i < 1_500; i += 1) {
      const roll = next(10);
      if (roll < 6) store.append(rowsDoc(1 + next(6), `d${i}`));
      else if (roll < 8) viewport.scrollBy(next(31) - 15);
      else if (roll < 9) viewport.resize({ width: 40 + next(80), height: 5 + next(20) });
      else viewport.scrollToBottom();
    }

    expect(viewport.stats.indexCapacity).toBeLessThanOrEqual(
      Math.max(2, 2 * viewport.stats.entryCount),
    );
    expect(viewport.stats.cacheSize).toBeLessThanOrEqual(viewport.stats.entryCount);
    const r = viewport.visible();
    expect(r.entries.reduce((n, e) => n + e.takeRows, 0)).toBe(
      Math.min(viewport.scroll.viewportHeight, viewport.scroll.totalRows),
    );
  }, 30_000);
});
