// C14 tier 4 — integration. Against C09 and C13, with no fakes in the height path.
//
// **T4.1 is the drift test and the reason the rest of the suite is worth having.**
// C14 decides visibility from measured heights without rendering (I1); if measure
// and render disagree by one row anywhere, the viewport is wrong in a way that
// looks like content jumping as you scroll past it, three components from the cause.
import { describe, expect, it } from "vitest";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { measureSequence, renderEntry, rowsDoc, wrappingDoc } from "../support/viewport.js";
import { doc } from "../support/blocks.js";
import { CORPUS } from "../support/blocks.js";

const WIDTHS = [40, 60, 80, 100, 120, 160, 200] as const;

describe("C14 integration", () => {
  it("T4.1 (with C09): summed measured heights equal the rows drawn, at seven widths", () => {
    const failures: string[] = [];

    for (const width of WIDTHS) {
      const store = createTranscriptStore();
      const viewport = createViewport(store, { width, height: 12, measureSequence });
      // The real corpus, one block per entry, so every registered kind's measurer
      // is exercised against its own renderer through the viewport's arithmetic.
      for (const b of CORPUS) store.append(doc({ blocks: [b] }));

      const measured = viewport.scroll.totalRows;
      const drawn = store.entries.reduce(
        (n, e) => n + renderEntry(e.doc.blocks, width).length,
        0,
      );
      if (measured !== drawn) failures.push(`width ${width}: measured ${measured}, drew ${drawn}`);
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("T4.1b (with C09): every visible range selects exactly the rows on screen", () => {
    for (const width of [40, 80, 160] as const) {
      const store = createTranscriptStore();
      const viewport = createViewport(store, { width, height: 5, measureSequence });
      for (const b of CORPUS.slice(0, 8)) store.append(doc({ blocks: [b] }));

      const all = store.entries.flatMap((e) => renderEntry(e.doc.blocks, width));
      viewport.scrollToTop();

      for (let top = 0; top + 5 <= all.length; top += 1) {
        const drawn: string[] = [];
        for (const ve of viewport.visible().entries) {
          const entry = store.entries.find((e) => e.id === ve.id);
          if (entry === undefined) continue;
          drawn.push(
            ...renderEntry(entry.doc.blocks, width).slice(ve.skipRows, ve.skipRows + ve.takeRows),
          );
        }
        expect(drawn, `width ${width}, top ${top}`).toEqual(all.slice(top, top + 5));
        viewport.scrollBy(1);
      }
    }
  });

  it("T4.3 (with C13): each Change produces the documented invalidation", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: 80, height: 10, measureSequence });

    const a = store.append(rowsDoc(3, "a"), { streaming: true });
    expect(viewport.stats.cacheSize).toBe(1);

    // `patch` — one entry remeasured, and its slot replaced rather than added to.
    store.patch(a, { op: "append", block: { kind: "raw", id: "a-x", text: "x" } });
    expect(viewport.stats.cacheSize).toBe(1);

    // `settle` — content did not change, so nothing is invalidated.
    const beforeSettle = viewport.stats.cacheSize;
    store.settle(a);
    expect(viewport.stats.cacheSize).toBe(beforeSettle);

    // `append` — one more entry measured, nothing already measured invalidated.
    store.append(rowsDoc(2, "b"));
    expect(viewport.stats.cacheSize).toBe(2);

    // `clear` — everything.
    store.clear();
    expect(viewport.stats.cacheSize).toBe(0);
  });

  it("T4.4 (with C13): a merge on a --watch leaves topRow unmoved", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: 80, height: 6, measureSequence });
    const watch = store.append(rowsDoc(4, "w"), { streaming: true });
    store.append(rowsDoc(30, "cmd"));
    viewport.scrollToTop();
    viewport.scrollBy(10);
    const before = viewport.visible();

    for (let i = 0; i < 20; i += 1) {
      store.patch(watch, { op: "append", block: { kind: "raw", id: `t${i}`, text: `tick ${i}` } });
    }

    // The rows on screen are the same rows. Only what is below them moved.
    expect(viewport.visible().entries).toEqual(before.entries);
  });

  it("T4.5 (with C10): geometry is identical across widths for a wrapping entry", () => {
    // C10 T4.1 asserts geometry does not depend on theme, which is why theme is
    // absent from I3's predicate. This is the other half: width is the only thing
    // that changes a height, so it is the only thing in the predicate besides `rev`.
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: 40, height: 6, measureSequence });
    store.append(wrappingDoc("w"));

    const narrow = viewport.scroll.totalRows;
    viewport.resize({ width: 200, height: 6 });
    const wide = viewport.scroll.totalRows;

    expect(narrow).toBeGreaterThan(wide);
    expect(wide).toBe(measureSequence(store.entries[0]?.doc.blocks ?? [], 200));
  });

  it.todo(
    "T4.7 (with C01): a SIGWINCH snapshot drives one resize and the anchor is captured before the cache is dropped — waits on C22",
  );
  it.todo(
    "T4.8 (with C03, L4): a scroll causes L4 to issue one commit('input'), and a spy asserts C14 never calls the scheduler — waits on C22",
  );
});
