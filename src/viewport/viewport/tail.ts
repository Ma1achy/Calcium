/**
 * The tail comparison — written once, and written here (C14 I5).
 *
 * **Three places ask *are we at the bottom*, and this is the layer all three
 * can reach.** C14 sets `followTail` from it (I5: derived from where the viewport
 * ended up, never from which way the reader scrolled); L4's `document-view.ts`
 * and `ScrollOffsets` ask it of a block offset against a ceiling (C04 I97), and
 * read it through `shell/tail.ts`. The drift the one copy forbids is `>=`
 * becoming `>` in one of them — a box that stops following one row early, and
 * nothing that reads the three files together.
 *
 * **In C14 and not beside its two L4 readers, because imports go down only**
 * (A02 §1). The helper lived in `shell/tail.ts` with C14's `topRow >= maxTop()`
 * recorded as the third copy it could not reach: L2 may not import L4. I5 is
 * where the rule is stated, so the component that owns the invariant holds the
 * comparison and the shell reads it — inside C14's own directory rather than
 * loose under `src/viewport/`, which would sit beside three component
 * directories without being one.
 *
 * **`>=` and not `>`**: a value the caller left past the end is the bottom too.
 * The shell spells *stay at the bottom* as `TAIL = ∞` and clamps at read (C04
 * §3c cell 4), and C14's `#setTop` clamps before this is asked (I2), so on both
 * sides a held value past every ceiling resolves here to *at the tail*.
 */
export function atTail(offset: number, last: number): boolean {
  return offset >= last;
}
