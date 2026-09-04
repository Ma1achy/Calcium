/**
 * The keeper of I21's fourth admitted case — **the picture cell** (§4c.1).
 *
 * `Style` has one `background` channel and I21 shuts the door on it: a palette
 * slot painted behind text is a slot nothing measured a floor for. Three
 * framework channels are admitted past that, and each carries its own argument
 * for why the floor has nothing to constrain. `wash` and a valued span are the
 * first two, and both are unforgeable by *shape* — they return a `Span` whose
 * text they built themselves, blank, so there is no way to hand the colour to a
 * glyph.
 *
 * **The picture cell cannot borrow that argument, and the file it would have
 * borrowed it from says why.** `sankey.ts`'s half-block and `scatter3.ts`'s
 * braille both *always* draw a glyph — measured off the shipped 24-bit goldens,
 * every background-bearing sankey cell is `▀` and `sankey.ts`'s own header says
 * the glyph "carries bar against ribbon at every depth". It is the half that
 * survives when colour does not, so a blank `Span` would erase the drawing. The
 * remedy I21 was owed — a `wash`-shaped `pictureCell(ref)` — is unbuildable at
 * both sites for that reason and for two more, and §4c.1 has the table.
 *
 * **So the admission moves from the text to the alphabet, and the reason gets
 * stronger rather than weaker.** A contrast floor is a property of *ink on a
 * ground*: one colour in front, one behind, a reader recovering a character out
 * of an open set. A picture cell has no front and no behind. Its glyph is a
 * **fill** — a block element or a braille pattern, whose *shape* is the
 * geometry — and the two colours are two **regions of one cell**, lying side by
 * side. Nothing occludes anything, so there is no pair to measure. That reason
 * survives the glyph being non-blank, which *carries no text* never could.
 *
 * The alphabet is what makes it checkable, and it is the whole of the widening:
 * a caller may put a fill in a painted cell and may not put a word there.
 */

/**
 * A glyph a cell may carry while also carrying a background (I21, §4c.1).
 *
 * The three ranges, and why each is in:
 *
 * - **`U+0020`**, the blank. A painted cell with nothing drawn in it is
 *   `wash`'s own case arriving through this door; admitting it costs nothing
 *   and refusing it would make an empty region a special case at both sites.
 * - **`U+2580`–`U+259F`, Block Elements.** The halves, eighths, quadrants and
 *   shades — `sankey.ts`'s `█ ▀ ▄ ▒` and `scatter3.ts`'s `▀ ▁▂▃▅▆▇ ▌` and its
 *   sixteen quadrant masks. Every one is a fill by construction: the codepoint
 *   *is* which fraction of the cell is covered.
 * - **`U+2800`–`U+28FF`, Braille Patterns.** `foldBraille`'s `0x2800 + mask`,
 *   the whole 256 of it. The dots are samples, not letters.
 *
 * **What is deliberately out**, because a refusal list is where the ruling
 * shows: the box-drawing set `U+2500`–`U+257F` and the arrows `U+2190`–`U+21FF`
 * both appear over backgrounds elsewhere in the golden corpus, and both are
 * marks whose shape a reader *reads* rather than fills — a `→` in a quiver is
 * closer to a character than to a region. They are not admitted here because
 * this rule governs two named constructors and neither emits them; the day one
 * does, that is a ruling to take rather than a range to widen quietly.
 *
 * And the ASCII fill set — `#`, `=`, `-`, which `sankeyAlphabet` falls to on a
 * terminal declaring `ascii` or `wide` — is **not** admitted, which is the
 * ruling rather than an oversight. `cellOf` never passes a lower owner on that
 * arm, so no ASCII cell ever carries a background; putting the brand on the
 * background *channel* rather than on the alphabet is what lets the set stay
 * this narrow. A brand over the alphabet would have had to let `-` through.
 */
export function isPictureGlyph(glyph: string): boolean {
  if ([...glyph].length !== 1) return false;
  const cp = glyph.codePointAt(0);
  if (cp === undefined) return false;
  return cp === 0x20 || (cp >= 0x2580 && cp <= 0x259f) || (cp >= 0x2800 && cp <= 0x28ff);
}

/**
 * Refuse a glyph that may not carry a background (I21, §4c.1).
 *
 * **It throws, and what the throw leaves behind is nothing.** Both call sites —
 * `sankeyArea` and `scatter3.ts`'s `mixedRows` — are pure builders over local
 * arrays, so an abandoned row is discarded with the call and no store is left
 * half-written. That is the question CLAUDE.md asks of any ruling that throws,
 * and here it has the easy answer.
 *
 * **No input the tree produces can reach it**, which is measured rather than
 * hoped: the glyph set the two constructors emit into a background-bearing cell
 * was read off every shipped 24-bit and 8-bit golden and every member is
 * admitted (T1.36). So this is an assertion about a *later* caller, not a path
 * a user takes — and that is exactly why a green suite is what removing it
 * looks like, which T6.92 is written to say.
 */
export function assertPictureGlyph(glyph: string, site: string): void {
  if (isPictureGlyph(glyph)) return;
  throw new Error(
    `${site}: a cell carrying a background may carry only a fill glyph (C10 I21) — ` +
      `${JSON.stringify(glyph)} is not one. A background is admitted for a picture cell ` +
      `because its two colours are two regions of one cell rather than ink on a ground; ` +
      `a glyph a reader reads has no measured floor against it.`,
  );
}
