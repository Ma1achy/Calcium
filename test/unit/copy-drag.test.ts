// C14 §6f — the drag: a gesture belongs to where it started.
import { describe, expect, it } from "vitest";

import {
  autoscrollBand,
  autoscrollFor,
  beginDrag,
  cellsPast,
  clampToContainer,
  containerAt,
  VIEWPORT,
} from "../../src/shell/drag-selection.js";
import type { BoxSpan } from "../../src/shell/drag-selection.js";
import { blocksTouched, keyOf } from "../../src/shell/semantic-selection.js";
import type { BlockSpan, Caret } from "../../src/shell/semantic-selection.js";

/** One entry: prose, then a scroll box over rows 2..9, then prose. */
const BOXES: readonly BoxSpan[] = Object.freeze(
  [
    { entryId: "e1", blockId: "box", from: 2, to: 10 },
    // An inner scrollable, so *innermost* is a choice and not the only answer.
    { entryId: "e1", blockId: "inner", from: 4, to: 7 },
  ].map((b) => Object.freeze(b)),
);

const SPANS: readonly BlockSpan[] = Object.freeze(
  [
    { key: keyOf("e1", "lede"), from: 0, to: 2 },
    { key: keyOf("e1", "box"), from: 2, to: 10 },
    { key: keyOf("e1", "tail"), from: 10, to: 12 },
  ].map((sp) => Object.freeze(sp)),
);
const ORDER = Object.freeze(["e1"]);

const at = (row: number): Caret => Object.freeze({ entryId: "e1", row });

describe("C14 §6f — the container is the anchor's, for the whole gesture", () => {
  it("T1.44 (C14 I44): the gesture binds at the press and does not follow the pointer", () => {
    const drag = beginDrag(at(5), BOXES);
    // Innermost, not outermost and not first-written: row 5 is inside both boxes
    // and the narrower one wins.
    expect(drag.container).toEqual({ kind: "box", entryId: "e1", blockId: "inner" });

    // The pointer leaves for the prose below, and the gesture does not go with
    // it — every step names the container the press chose.
    const rect = { from: 4, to: 7 };
    expect(autoscrollFor(drag, 11, rect)?.container).toEqual(drag.container);
    expect(autoscrollFor(drag, 40, rect)?.container).toEqual(drag.container);
    // And back inside: still the same container, which is what *for the whole
    // gesture* means when the pointer returns.
    expect(autoscrollFor(drag, 0, rect)?.container).toEqual(drag.container);

    // **The control, in the same fixture** (`R-SEL-012`'s own table): the wheel
    // takes the innermost scrollable *under the pointer*, and at row 11 that is
    // the transcript. So the row can tell *the anchor decides* from *the pointer
    // decides*, rather than asserting one against nothing.
    expect(containerAt(at(11), BOXES), "the wheel's answer differs here").toBe(VIEWPORT);
    expect(containerAt(at(3), BOXES)).toEqual({ kind: "box", entryId: "e1", blockId: "box" });

    // A caret in another entry is in none of this entry's boxes, however its
    // rows line up — the box arm carries the entry for exactly this reason.
    expect(containerAt({ entryId: "e2", row: 5 }, BOXES)).toBe(VIEWPORT);
  });
});

describe("C14 §6f — three bands, and a scroll nobody is driving", () => {
  it("T1.45 (C14 I45): the bands pin both boundaries, and the step survives a still pointer", () => {
    // 0, 1, 2, 4, 5, 40 — the two boundaries rather than the middle of each
    // band, since a fixture inside every band agrees with any thresholds.
    expect([0, 1, 2, 4, 5, 40].map(autoscrollBand)).toEqual([null, 120, 60, 60, 30, 30]);
    expect(autoscrollBand(-3), "inside the rect is not a slow scroll").toBeNull();

    // The rect is `[from, to)`, so the first cell outside on either side is one
    // past — which is what makes the first band an edge and not an empty case.
    expect([cellsPast(3, 4, 7), cellsPast(4, 4, 7), cellsPast(6, 4, 7), cellsPast(7, 4, 7)]).toEqual(
      [1, 0, 0, 1],
    );
    expect(cellsPast(11, 4, 7), "and it grows by one per cell").toBe(5);

    const drag = beginDrag(at(5), BOXES);
    const rect = { from: 4, to: 7 };

    // **The continuation**: the step is a function of where the pointer *is*,
    // not of a report having arrived. Asked twice with nothing in between —
    // which is the state a terminal leaves a held, still pointer in, since it
    // reports motion only when the cell changes — it answers the same step both
    // times. A motion-driven implementation has nothing to answer with here and
    // passes every other row in this file.
    const first = autoscrollFor(drag, 9, rect);
    const again = autoscrollFor(drag, 9, rect);
    expect(first, "held and still is still scrolling").not.toBeNull();
    expect(again).toEqual(first);
    expect(first?.afterMs, "three cells past").toBe(60);

    // Direction is the side, and one row a tick — the band is the rate.
    // Four cells above `from: 4`, so the middle band — and up.
    expect(autoscrollFor(drag, 0, rect)).toEqual({ container: drag.container, rows: -1, afterMs: 60 });
    expect(autoscrollFor(drag, -2, rect)?.afterMs, "six above is the fast band").toBe(30);
    expect(autoscrollFor(drag, 5, rect), "inside is no scroll at all").toBeNull();
  });
});

describe("C14 §6f — a container passed through", () => {
  it("T1.49 (C14 I51, R-SEL-015): an upward drag inside one entry takes the blocks between", () => {
    const down = [...blocksTouched(at(1), at(11), SPANS, ORDER)].sort();
    expect(down, "downward: lede, box, tail").toEqual([keyOf("e1", "box"), keyOf("e1", "lede"), keyOf("e1", "tail")].sort());
    // **The same pair, reversed** — the press below and the pointer above.
    expect([...blocksTouched(at(11), at(1), SPANS, ORDER)].sort(), "upward: the same set").toEqual(down);

    // The control: across two entries the ends were already ordered, so the
    // row above is about the one-entry arm and not about direction in general.
    const two = Object.freeze(["e0", "e1"]);
    const spans2 = [...SPANS, { key: keyOf("e0", "p"), from: 0, to: 3 }];
    expect([...blocksTouched(at(11), { entryId: "e0", row: 1 }, spans2, two)]).toHaveLength(4);
  });

  it("T1.48 (C14 I50, R-SEL-013): a caret is clamped into the drag's box", () => {
    const drag = beginDrag(at(3), BOXES);
    expect(drag.container, "anchored in the outer box").toEqual({ kind: "box", entryId: "e1", blockId: "box" });
    const order = ["e0", "e1", "e2"];

    // **The control: unclamped, the prose below is reached.** Without this the
    // rows below are passed by an extend that never reaches anything.
    expect([...blocksTouched(at(3), at(11), SPANS, ORDER)], "unclamped: the tail joins").toContain(keyOf("e1", "tail"));

    expect(clampToContainer(at(6), drag, BOXES, order), "inside: unchanged").toEqual(at(6));
    expect(clampToContainer(at(11), drag, BOXES, order), "below: the last row").toEqual(at(9));
    // The boundary itself: row 10 is the box's exclusive end and already outside
    // — the mutation pass found `> to` passing every row above.
    expect(clampToContainer(at(10), drag, BOXES, order), "the first row past the end").toEqual(at(9));
    expect(clampToContainer(at(0), drag, BOXES, order), "above: the first row").toEqual(at(2));
    expect(clampToContainer({ entryId: "e2", row: 0 }, drag, BOXES, order), "a later entry: the last row").toEqual(at(9));
    expect(clampToContainer({ entryId: "e0", row: 5 }, drag, BOXES, order), "an earlier entry: the first row").toEqual(at(2));
    expect(
      [...blocksTouched(at(3), clampToContainer(at(11), drag, BOXES, order), SPANS, ORDER)],
      "clamped: the box and nothing else",
    ).toEqual([keyOf("e1", "box")]);

    // A viewport drag is never clamped — C14 I46's *passed through, taken whole*.
    const loose = beginDrag(at(0), BOXES);
    expect(clampToContainer(at(11), loose, BOXES, order)).toEqual(at(11));
  });

  it("T1.46 (C14 I46): taken whole, and it does not scroll", () => {
    // Anchored in the prose above the box, extended to the prose below it.
    const drag = beginDrag(at(0), BOXES);
    expect(drag.container, "the anchor is in no box").toBe(VIEWPORT);

    // **Taken whole.** `R-SEL-014`'s first clause, and it is C14 I36 already — the
    // extend touches one row of the box and takes all of it. Stated here so the
    // rule reads against the tree, and marked as old rather than new.
    const touched = blocksTouched(at(1), at(3), SPANS, ORDER);
    expect([...touched].sort()).toEqual([keyOf("e1", "box"), keyOf("e1", "lede")].sort());

    // **The clause this MR wrote**: the box is scenery for the whole gesture.
    // With the pointer inside the box's own rows the autoscroll still names the
    // viewport, so passing through cannot scroll what it passes through.
    const rect = { from: 0, to: 12 };
    expect(autoscrollFor(drag, 5, rect), "inside the region, so nothing scrolls").toBeNull();
    expect(autoscrollFor(drag, 14, rect)?.container, "and the parent is what moves").toBe(VIEWPORT);

    // The same drag anchored *inside* the box gives the other answer, which is
    // what makes the one above a decision rather than the only thing possible.
    expect(beginDrag(at(8), BOXES).container).toEqual({
      kind: "box",
      entryId: "e1",
      blockId: "box",
    });
  });
});
