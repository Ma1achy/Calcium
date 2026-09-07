/**
 * The tail — one comparison, written once (C04 I97, C-view I48, C14 I5).
 *
 * **Three places ask *are we at the bottom*, and two of them are in this
 * layer.** `document-view.ts` compares a block offset against the last offset
 * from which the tail still fills the region; `ScrollOffsets` asks the same
 * question in rows, against a ceiling the renderer clamps to; and C14's
 * viewport sets `followTail` from it (I5). The drift between them is `>=`
 * becoming `>` in one copy — a box that stops following one row early, and
 * nothing that reads the three files together.
 *
 * **The comparison itself is C14's** (`viewport/viewport/tail.ts`), because
 * imports go down only: this file is L4 and C14 is L2, so the one place all
 * three readers can reach is the component whose invariant states the rule.
 * `atTail` is re-exported here so the two L4 readers keep one import beside
 * `TAIL` and `followTail`, which are this layer's — they spell what the store
 * holds and how a reader moves, and C14 has no use for either.
 *
 * **`TAIL` is `∞`, and that is a mechanism rather than a flag.** The scroll
 * offset is clamped at read (C04 §3c cell 4), so a held value past every
 * ceiling is the bottom however the content grows — with nothing written on a
 * patch, which is what C23 I47 requires of view state. A flag would need a
 * writer on every append; the number needs none.
 */

import { atTail } from "../viewport/viewport/tail.js";

export { atTail };

/** *Stay at the bottom.* Past every ceiling, so the clamp at read resolves it. */
export const TAIL = Number.POSITIVE_INFINITY;

/**
 * Where a reader goes when the tail moves under them: the new bottom if they
 * had the old one, and where they were if not. *Were we at the end before this
 * arrived* is the question tail semantics turn on — a reader who has scrolled up
 * is reading, and moving the window under them is the same failure as never
 * moving it (C-view I48).
 */
export function followTail(offset: number, lastBefore: number, lastAfter: number): number {
  return atTail(offset, lastBefore) ? lastAfter : offset;
}
