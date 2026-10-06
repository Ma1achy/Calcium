/**
 * `stripControl` — the one control-character filter, at the layer both halves
 * can reach.
 *
 * It began in `presentation/text.ts` beside `cells()`, which is where it is
 * used most: every renderer strips before it measures or draws (C09 I18). C07
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

/**
 * The bidi format characters (C04 I110, C09 I128, ruling 71): the Arabic letter
 * mark U+061C, the marks U+200E and U+200F, the embeddings and overrides
 * U+202A–U+202E, and the isolates U+2066–U+2069.
 *
 * **Not controls by `isControl`'s test, and that is why they are named.** They
 * are printable by category (`Cf`), so a filter over C0 and C1 passes them
 * whole, and an override reorders every cell after it on the row — a path that
 * reads `txt.exe` and is `exe.txt`. The marks are on the list too, which is the
 * stricter answer and has a cost the ruling states: legitimate right-to-left
 * text shows its marks.
 */
export function isBidiFormat(cp: number): boolean {
  return (
    cp === 0x061c ||
    cp === 0x200e ||
    cp === 0x200f ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069)
  );
}

/**
 * The visible form of one code unit, or `null` when it is shown as itself
 * (C09 I128) — the one table `neutraliseControl` and a span's re-basing both
 * read, so the two cannot disagree about how long a replacement is.
 *
 * `cat -v`'s convention for C0, DEL and C1 — `^[`, `^?`, `M-^[` — and
 * `<U+202E>` for a bidi format character. Every character this answers for is
 * in the BMP, so a code unit is the whole question and a surrogate is never
 * split.
 */
export function controlForm(unit: number): string | null {
  if (unit === 0x09 || unit === 0x0a) return null; // tab, newline
  if (unit < 0x20) return `^${String.fromCharCode(unit + 0x40)}`;
  if (unit === 0x7f) return "^?";
  if (unit >= 0x80 && unit <= 0x9f) return `M-^${String.fromCharCode(unit - 0x40)}`;
  if (isBidiFormat(unit)) return `<U+${unit.toString(16).toUpperCase().padStart(4, "0")}>`;
  return null;
}

/**
 * A control **shown** rather than deleted (C09 I128, `R-TRU-001`: content is
 * *escaped*).
 *
 * `stripControl` deletes, and a deleted escape leaves its printable residue —
 * `[2J` — which reads as text a tool meant to print. This leaves `^[[2J`, which
 * reads as what it is. The output is printable ASCII wherever the input was
 * not, so it measures the same at every rung, and it is idempotent: nothing it
 * writes is a character it rewrites. A clean string is returned as itself,
 * which is the common case and allocates nothing.
 */
export function neutraliseControl(text: string): string {
  let i = 0;
  while (i < text.length && controlForm(text.charCodeAt(i)) === null) i += 1;
  if (i === text.length) return text;
  let out = text.slice(0, i);
  for (; i < text.length; i += 1) {
    out += controlForm(text.charCodeAt(i)) ?? text[i];
  }
  return out;
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
