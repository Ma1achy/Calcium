// C13 tier 4 — integration. Against C04, and against the components above.
//
// **Three of these were deferred on C14 and `todo-expiry` expired them when it
// landed**, which is the notification nobody would otherwise send. What is left
// waited on C16 and on L4 — both built at 2026-09-03 — assertions about focus and about `/clear`, neither of
// which has a component yet.
import { describe, expect, it } from "vitest";
import { pipelineHarness, settled } from "../support/execution.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import { appendPatch, docOf, tableWithDetails } from "../support/transcript.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { W, measureSequence, rowsDoc } from "../support/viewport.js";

describe("C13 integration", () => {
  it("T4.1 (with C04): a hundred patches leave a document that still validates", () => {
    const s = createTranscriptStore();
    const id = s.append(docOf(1, "seed"), { streaming: true });

    for (let i = 0; i < 100; i += 1) {
      const r = s.patch(id, appendPatch(`p${i}`));
      expect(r, `patch ${i}`).toMatchObject({ ok: true });
    }

    const entry = s.entries.find((e) => e.id === id);
    expect(entry?.doc.blocks).toHaveLength(101);
    expect(entry?.rev).toBe(100);
    // C13 never re-validates after append — `applyPatch` is total over valid
    // documents — so this is the assertion that the assumption holds.
    expect(validateDocument(entry?.doc).ok).toBe(true);
  });

  it("T4.1b (with C04): a merge stream leaves the document valid and rows identical", () => {
    const s = createTranscriptStore();
    const id = s.append(tableWithDetails(3, 1), { streaming: true });
    const first = () => {
      const b = s.entries.find((e) => e.id === id)?.doc.blocks[0];
      return b && "rows" in b ? b.rows[0] : undefined;
    };
    const before = first();

    for (let i = 0; i < 50; i += 1) {
      s.patch(id, {
        op: "merge",
        blockId: "t",
        rows: [{ id: "t-r2", cells: { name: { text: `tick ${i}` } } }],
      });
    }

    // C04 I9 — untouched rows keep reference identity, which is what stops a
    // `--watch` tick collapsing an expanded row or moving the viewport.
    expect(first()).toBe(before);
    expect(validateDocument(s.entries.find((e) => e.id === id)?.doc).ok).toBe(true);
  });

  it("T4.2 (with C04): incremental patching equals adapting the whole output at once", () => {
    // C07 T4.5 from this side: a streamed verb applied tick by tick must reach
    // the same document as one built in a single pass, or a `--watch` and a
    // one-shot of the same command disagree about what the far side said.
    const streamed = createTranscriptStore();
    const whole = createTranscriptStore();

    const id = streamed.append(docOf(1, "b"), { streaming: true });
    for (let i = 1; i <= 20; i += 1) {
      const r = streamed.patch(id, appendPatch(`b${i}`, `line ${i}`));
      expect(r, `tick ${i}`).toMatchObject({ ok: true });
    }
    streamed.settle(id);

    whole.append(docOf(21, "b"));

    expect(streamed.entries[0]?.doc.blocks).toEqual(whole.entries[0]?.doc.blocks);
    expect(streamed.blockCount).toBe(whole.blockCount);
  });

  it("T4.3 (with C14): append emits a change granular enough to measure one entry", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: W, height: 10, measureSequence });
    for (let i = 0; i < 20; i += 1) store.append(rowsDoc(3, `d${i}`));

    // One cached height per entry and no more: a bare "something changed" would
    // have forced a remeasure of all twenty on every one of them.
    expect(viewport.stats.cacheSize).toBe(20);

    store.append(rowsDoc(3, "one-more"));
    expect(viewport.stats.cacheSize).toBe(21);
  });

  it("T4.4 (with C14): eviction shifts no visible content — the anchor is an id", () => {
    // 60 entries × 3 blocks = 180, so the cap has to sit below that or nothing is
    // evicted and the test asserts about a case it never reaches.
    const store = createTranscriptStore({ cap: 90 });
    const viewport = createViewport(store, { width: W, height: 5, measureSequence });
    for (let i = 0; i < 40; i += 1) store.append(rowsDoc(3, `d${i}`));
    // Detached, but reading near the *end* — so what gets trimmed is above the
    // visible region and the anchored entry survives. Anchoring inside content
    // that is itself about to be evicted is T3.8's case, not this one, and the
    // two claims are different: this is "the top moving does not move the middle".
    viewport.scrollToBottom();
    viewport.scrollBy(-8);
    const before = viewport.visible();
    const dropped = store.droppedBlocks;

    for (let i = 40; i < 50; i += 1) store.append(rowsDoc(3, `d${i}`));

    expect(store.droppedBlocks).toBeGreaterThan(dropped);

    // An index would mean something different after every eviction; an id
    // resolves to the same content or to nothing.
    expect(viewport.visible().entries).toEqual(before.entries);
  });

  it("T4.5 (with C14, C11): a merge on a table leaves the scroll position unmoved", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: W, height: 6, measureSequence });
    const table = store.append(tableWithDetails(4, 0), { streaming: true });
    store.append(rowsDoc(40, "below"));
    viewport.scrollToTop();
    viewport.scrollBy(12);
    const before = viewport.visible();

    for (let i = 0; i < 30; i += 1) {
      store.patch(table, {
        op: "merge",
        blockId: "t",
        rows: [{ id: "t-r1", cells: { name: { text: `tick ${i}` } } }],
      });
    }

    // A merge that changes a cell changes no height, so nothing moves at all —
    // and C04 I9's reference identity is what stops the row collapsing.
    expect(viewport.visible().entries).toEqual(before.entries);
    expect(viewport.scroll.topRow).toBe(12);
  });
  // T4.6 is resolved from C16's side, against real instances of both components:
  // `test/integration/router.test.ts`. Kept as a pointer rather than duplicated,
  // because the assertion needs a router to ask and this file has none.
  it("T4.7 (with C23, C20): /clear empties the transcript and leaves history intact", async () => {
    // **The two stores answer different questions** — what is on screen, and
    // what was typed — and C13 I16 is that clearing one does not clear the
    // other. Conflating them is how `/clear` destroys work.
    //
    // Asserted through the pipeline rather than by calling `clear()`, because
    // the claim is about the *command*: `/clear` is a local handler and C23
    // holds the registry, so C13 alone cannot show it.
    const h = pipelineHarness({
      history: [
        { command: "/ps", ts: 1, exitCode: 0 },
        { command: "/tail", ts: 2, exitCode: 0 },
      ],
    });

    h.pipeline.submit("/ps");
    await settled();
    expect(h.transcript.entries.length, "something to clear").toBeGreaterThan(0);

    h.pipeline.submit("/clear");
    await settled();

    // The `/clear` entry itself is what remains: the command ran and said so.
    expect(
      h.transcript.entries.map((e) => e.doc.command),
      "emptied, then its own notice",
    ).toEqual(["/clear"]);

    h.pipeline.submit("/history");
    await settled();
    const listing = h.transcript.entries.at(-1);
    expect(
      JSON.stringify(listing?.doc.blocks),
      "C20 is untouched — both commands are still there",
    ).toContain("/tail");
  });

  it("T4.10 (C13 §6, C14 I-cache): a shell patch on a settled entry invalidates the cached height", () => {
    // **The case the origin gate creates and nothing else could.** Before it, a
    // settled entry could never change, so C14's cache slot for one was correct
    // forever. Now the shell can patch it — a refusal notice, an expansion — and
    // the height moves.
    //
    // C14 keys on `(entryId, rev, width)` and invalidates from the returned
    // `rev`, so it should hold unchanged. **Asserted rather than assumed**,
    // because a fast path treating settled as static would read as a correct
    // optimisation until this op existed, and would be wrong silently: a stale
    // height is a viewport describing a document it no longer holds.
    const transcript = createTranscriptStore();
    const viewport = createViewport(transcript, { width: W, height: 40, measureSequence });

    const id = transcript.append(rowsDoc(3, "e"), { streaming: true });
    transcript.settle(id);

    // Measured and cached. `totalRows` is the sum C14 keeps per entry, so it is
    // the value a stale slot would hold.
    const before = viewport.scroll.totalRows;
    expect(before, "the entry has a height").toBeGreaterThan(0);

    // The shell says something about it. One block more, so the height moves.
    const out = transcript.patch(id, appendPatch("refused"), "shell");
    expect(out).toMatchObject({ ok: true });

    expect(viewport.scroll.totalRows, "the cache did not serve a height for a document that changed")
      .toBeGreaterThan(before);
  });
});
