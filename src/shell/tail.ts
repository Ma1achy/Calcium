/**
 * The tail — one comparison, written once (C04 I97, C-view I48, C14 I5).
 *
 * **Three places asked *are we at the bottom* and two of them were in this
 * layer.** `document-view.ts` compared a block offset against the last offset
 * from which the tail still fills the region; `ScrollOffsets` needed the same
 * question in rows, against a ceiling the renderer clamps to; and C14's
 * viewport holds `#followTail = topRow >= maxTop()`. The drift between them is
 * `>=` becoming `>` in one copy — a box that stops following one row early, and
 * nothing that reads the three files together.
 *
 * **In `shell/` (L4) and not `viewport/` (L2), and the reason is who calls it.**
 * Both callers are L4, and the one L2 candidate is C14's own invariant with its
 * own `topRow`/`maxTop` pair — folding it in is C14's edit, recorded here as the
 * third instance rather than made from outside. A loose file under
 * `src/viewport/` would also sit beside three component directories without
 * being one, which is how a helper gets mistaken for a component.
 *
 * **`TAIL` is `∞`, and that is a mechanism rather than a flag.** The scroll
 * offset is clamped at read (C04 §3c cell 4), so a held value past every
 * ceiling is the bottom however the content grows — with nothing written on a
 * patch, which is what C23 I47 requires of view state. A flag would need a
 * writer on every append; the number needs none.
 */

/** *Stay at the bottom.* Past every ceiling, so the clamp at read resolves it. */
export const TAIL = Number.POSITIVE_INFINITY;

/**
 * Whether `offset` is the bottom, against the last offset from which the tail
 * still fills the region. `>=` and not `>`: a value the caller left past the end
 * is the bottom too (C04 §3c cell 4).
 */
export function atTail(offset: number, last: number): boolean {
  return offset >= last;
}

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
