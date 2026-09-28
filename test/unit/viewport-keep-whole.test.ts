// C14 I56 — an entry kept whole (M9 item 3, walk row L10).
//
// **The control first, in the same history.** Without it *the append did not
// move the held entry* is satisfied by a viewport that never followed at all.
import { describe, expect, it } from "vitest";

import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { measureSequence, rowsDoc, W } from "../support/viewport.js";

function world(height: number) {
  const store = createTranscriptStore({});
  const viewport = createViewport(store, { width: W, height, measureSequence });
  return { store, viewport };
}

describe("C14 I56 — an entry kept whole", () => {
  it("T1.76 (C14 I56, I5, I6): a held entry is not scrolled off by an append below it; the reader ends the hold; the release returns to the tail", () => {
    // **The control**: nothing held, a 3-row append moves the top by 3.
    {
      const { store, viewport } = world(10);
      store.append(rowsDoc(4, "before"));
      store.append(rowsDoc(10, "child"));
      const top = viewport.scroll.topRow;
      store.append(rowsDoc(3, "after"));
      expect(viewport.scroll.topRow, "an unheld viewport follows the tail").toBe(top + 3);
      expect(viewport.scroll.followTail).toBe(true);
    }

    // **Held**: the same append leaves the child's first row on the top row.
    const { store, viewport } = world(10);
    store.append(rowsDoc(4, "before"));
    const child = store.append(rowsDoc(10, "child"));
    const childTop = viewport.scroll.topRow;
    expect(childTop, "the child fills the viewport exactly").toBe(4);
    const hold = viewport.keepWhole(child);
    expect(viewport.scroll.topRow, "taking the hold moves nothing").toBe(childTop);
    expect(viewport.scroll.followTail).toBe(true);

    store.append(rowsDoc(3, "after"));
    expect(viewport.scroll).toEqual({ topRow: childTop, viewportHeight: 10, totalRows: 17, followTail: false });
    expect(viewport.anchor, "anchored on the held entry's first row (C14 I6)").toEqual({ id: child, rowOffset: 0 });
    expect(viewport.visible().atBottom, "and not at the bottom, so not following (C14 I5)").toBe(false);

    store.append(rowsDoc(2, "later"));
    store.append(rowsDoc(5, "later still"));
    expect(viewport.scroll.topRow, "two more appends do not move it").toBe(childTop);
    expect(viewport.visible().entries.map((e) => [e.id, e.skipRows, e.takeRows])).toEqual([[child, 0, 10]]);

    // **The release** gives back the tail the hold took.
    hold[Symbol.dispose]();
    expect(viewport.scroll.followTail).toBe(true);
    expect(viewport.scroll.topRow).toBe(24 - 10);
    expect(viewport.anchor).toBeNull();
    // A second release is inert.
    hold[Symbol.dispose]();
    expect(viewport.scroll.topRow).toBe(14);

    // **The reader ends it**: held, detached by an append, then scrolled —
    // the release leaves the viewport where the reader put it.
    {
      const w = world(10);
      w.store.append(rowsDoc(4, "before"));
      const id = w.store.append(rowsDoc(10, "child"));
      const h = w.viewport.keepWhole(id);
      w.store.append(rowsDoc(3, "after"));
      w.viewport.scrollBy(-2);
      const put = w.viewport.scroll.topRow;
      expect(put).toBe(2);
      w.store.append(rowsDoc(3, "more"));
      expect(w.viewport.scroll.topRow, "a detached reader stays put (C14 I4)").toBe(put);
      h[Symbol.dispose]();
      expect(w.viewport.scroll.topRow, "the release does not move a reader who moved").toBe(put);
      expect(w.viewport.scroll.followTail).toBe(false);
    }

    // **A reader at the bottom after the hold's detach**: `End` ends the hold,
    // so a later append follows the tail rather than pulling them back up.
    {
      const w = world(10);
      w.store.append(rowsDoc(4, "before"));
      const id = w.store.append(rowsDoc(10, "child"));
      const h = w.viewport.keepWhole(id);
      w.store.append(rowsDoc(3, "after"));
      w.viewport.scrollToBottom();
      w.store.append(rowsDoc(3, "more"));
      expect(w.viewport.scroll.followTail, "the tail, not the held entry").toBe(true);
      expect(w.viewport.scroll.topRow).toBe(20 - 10);
      h[Symbol.dispose]();
    }

    // **A held entry the tail does not threaten**: short enough that the
    // tail keeps it whole, so the hold never acts and the viewport follows.
    {
      const w = world(10);
      w.store.append(rowsDoc(4, "before"));
      const id = w.store.append(rowsDoc(3, "child"));
      const h = w.viewport.keepWhole(id);
      w.store.append(rowsDoc(3, "after"));
      expect(w.viewport.scroll.followTail).toBe(true);
      expect(w.viewport.scroll.topRow).toBe(0);
      h[Symbol.dispose]();
      expect(w.viewport.scroll.topRow, "and the release has nothing to give back").toBe(0);
    }
  });
});
