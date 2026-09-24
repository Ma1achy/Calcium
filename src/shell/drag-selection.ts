/**
 * The drag's model (C14 §6f, `R-SEL-012`, `R-SEL-013`, `R-SEL-014`).
 *
 * **Separate from `semantic-selection.ts` because the subjects are.** That file
 * is a caret, an anchor and a set of blocks, and none of it knows about time or
 * about containers. This is both: which scrollable a gesture belongs to, and how
 * often a scroll that nobody is driving should happen. Keeping them apart is why
 * the selection's own rules stay expressible without a clock anywhere near them.
 *
 * Pure. The ticker that calls {@link autoscrollFor} lives in `session.ts`, which
 * is the one file allowed to read a clock (A03 SS1).
 */

import type { Caret } from "./semantic-selection.js";

/**
 * A scrollable the drag can belong to (C14 I44).
 *
 * Two arms and not a nullable block id: *the transcript* is a real answer and
 * the common one, and `null` meaning it would make every reader write the same
 * comment. The box arm carries the entry as well as the block for the reason
 * `keyOf` exists — a block id is unique within its document and a transcript
 * holds many (C04 I14).
 */
export type DragContainer =
  | Readonly<{ kind: "viewport" }>
  | Readonly<{ kind: "box"; entryId: string; blockId: string }>;

/** One scrollable block's entry-local rows, `[from, to)`. */
export type BoxSpan = Readonly<{
  entryId: string;
  blockId: string;
  from: number;
  to: number;
}>;

/**
 * A drag in flight — the container it bound to at the press, and where it began.
 *
 * The container is a field rather than something re-derived because that *is*
 * the rule (C14 I44): a value recomputed per motion report would be right about
 * the pointer and wrong about the gesture.
 */
export type Drag = Readonly<{ container: DragContainer; anchor: Caret }>;

/** What one tick of the autoscroll does, and when the next is due. */
export type AutoscrollStep = Readonly<{
  container: DragContainer;
  /** `-1` up, `+1` down — one row, because the band is the rate. */
  rows: number;
  /** `R-SEL-013`'s band, in milliseconds. */
  afterMs: number;
}>;

export const VIEWPORT: DragContainer = Object.freeze({ kind: "viewport" });

/**
 * The scrollable a caret sits in — the **innermost**, which is what *where you
 * start decides what you can address* means (`R-SEL-014`, C14 I46).
 *
 * Innermost is the narrowest containing span rather than the last one written,
 * so the answer does not depend on the order the spans were built in. With no
 * box containing the caret the answer is the transcript, which is the case for
 * almost every drag and is not a fallback.
 */
export function containerAt(caret: Caret, boxes: readonly BoxSpan[]): DragContainer {
  let best: BoxSpan | null = null;
  for (const box of boxes) {
    if (box.entryId !== caret.entryId) continue;
    if (caret.row < box.from || caret.row >= box.to) continue;
    if (best === null || box.to - box.from < best.to - best.from) best = box;
  }
  if (best === null) return VIEWPORT;
  return Object.freeze({ kind: "box", entryId: best.entryId, blockId: best.blockId });
}

/**
 * The caret a drag may extend to (C14 I50, `R-SEL-013`): *the selection extends
 * to the container's end and does not spill into the parent*.
 *
 * A viewport drag is unclamped — passing through a box takes it whole (I46). A
 * box drag's caret is held inside the box's rows: above it or in an earlier
 * entry goes to its first row, below it or in a later entry to its last.
 * `order` is the entries' document order, which is what *earlier* means when
 * the pointer has crossed into another entry.
 */
export function clampToContainer(
  caret: Caret,
  drag: Drag,
  boxes: readonly BoxSpan[],
  order: readonly string[],
): Caret {
  const c = drag.container;
  if (c.kind === "viewport") return caret;
  const box = boxes.find((b) => b.entryId === c.entryId && b.blockId === c.blockId);
  if (box === undefined) return caret;
  const first = Object.freeze({ entryId: box.entryId, row: box.from });
  const last = Object.freeze({ entryId: box.entryId, row: box.to - 1 });
  if (caret.entryId !== box.entryId) {
    return order.indexOf(caret.entryId) < order.indexOf(box.entryId) ? first : last;
  }
  if (caret.row < box.from) return first;
  if (caret.row >= box.to) return last;
  return caret;
}

/**
 * Begin a gesture — bind it to the anchor's container, once (C14 I44).
 *
 * This is `R-PTR-005`'s mechanism on a container instead of an element: an
 * identity taken at the press and held to the release. The pointer decides
 * everything else about the drag and not this.
 */
export function beginDrag(anchor: Caret, boxes: readonly BoxSpan[]): Drag {
  return Object.freeze({ container: containerAt(anchor, boxes), anchor });
}

/**
 * How far past a rect a coordinate is, on one axis — `0` inside it.
 *
 * The rect is `[from, to)`, so the first cell outside on either side is **one**
 * past, which is what makes the first band's *up to one cell* the edge case
 * rather than the empty case.
 */
export function cellsPast(value: number, from: number, to: number): number {
  if (value < from) return from - value;
  if (value >= to) return value - to + 1;
  return 0;
}

/**
 * `R-SEL-013`'s bands — milliseconds per row, or `null` inside the rect.
 *
 * *Three, because two is too coarse to control and a continuous ramp is
 * impossible to stop where you meant.*
 */
export function autoscrollBand(past: number): number | null {
  if (past <= 0) return null;
  if (past <= 1) return 120;
  if (past <= 4) return 60;
  return 30;
}

/**
 * What the autoscroll should do for a pointer at `pointerRow` (C14 I45, I46).
 *
 * **The container is the drag's and never the pointer's**, which is the whole of
 * `R-SEL-012` at the place it could go wrong: the pointer is what supplies the
 * distance, so taking the container from the same event reads as consistent and
 * hands the gesture to whatever it happens to be over.
 *
 * `null` is *no scroll*, which is the pointer inside the rect. The caller stops
 * when the container cannot move — `R-SEL-013`'s *stops at the container's end,
 * rather than rubber-banding* — because the ceiling is the renderer's and is
 * deliberately not here (`ScrollOffsets`' own rule).
 *
 * The same function answers the horizontal axis: the bands are the bands, and
 * the caller passes columns instead of rows.
 */
export function autoscrollFor(
  drag: Drag,
  pointerRow: number,
  rect: Readonly<{ from: number; to: number }>,
): AutoscrollStep | null {
  const afterMs = autoscrollBand(cellsPast(pointerRow, rect.from, rect.to));
  if (afterMs === null) return null;
  return Object.freeze({
    container: drag.container,
    rows: pointerRow < rect.from ? -1 : 1,
    afterMs,
  });
}
