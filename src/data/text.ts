/**
 * `stripControl` — the one control-character filter, at the layer both halves
 * can reach.
 *
 * It began in `presentation/text.ts` beside `cells()`, which is where it is
 * used most: every renderer strips before it measures or draws (C09 I14). C07
 * needs it too, and for a different reason — a tool's JSON reaching a block
 * carries whatever the tool put in it, and stripping at render would mean a
 * transcript, a `/debug` dump and a golden frame each hold text the block was
 * never supposed to contain (C07 T3.14). That is a boundary defence, and a
 * boundary defence that runs at the far end is not one.
 *
 * L0 data cannot import L1 (MG7), so the shared thing lives here and
 * `presentation/text.ts` re-exports it. **A second implementation was the
 * alternative and is the worse one**: two filters over one rule diverge in the
 * cases nobody writes tests for, and the one with fewer tests is the one that
 * stops matching. The same argument DEPENDENCIES.md makes about a width
 * library, applied one layer down.
 *
 * Nothing else moves. `cells()`, `truncate()` and the Unicode data stay where
 * the measurers are, because only L1 measures.
 */

/**
 * C0 except tab and newline — tab is expanded rather than dropped, and a
 * newline is a break the wrapper acts on — plus delete and C1. A tool's output
 * cannot inject an escape sequence into the frame, so this runs on the way in
 * rather than being trusted not to happen.
 *
 * A code-point test rather than a character class, because writing the class
 * means writing the escape character into a file that is not
 * `terminal/escapes.ts` (C01 I1, A03 SS14). The range is the same either way;
 * only one of the two forms can be written here.
 */
function isControl(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a) return false; // tab, newline
  return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f);
}

/** Every text field passes through here before it is measured or rendered. */
export function stripControl(text: string): string {
  let clean = true;
  for (const ch of text) {
    if (isControl(ch.codePointAt(0) ?? 0)) {
      clean = false;
      break;
    }
  }
  if (clean) return text;

  let out = "";
  for (const ch of text) {
    if (!isControl(ch.codePointAt(0) ?? 0)) out += ch;
  }
  return out;
}
