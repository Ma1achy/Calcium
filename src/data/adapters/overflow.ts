/**
 * C07 §4 — an overflowed `RawResult` reaches the document as a notice (I22).
 *
 * **One block, two producers.** The registry appends it in `finish`, so every
 * route through C07 carries it; C23's `shell` route builds its document without
 * the registry and appends the same block. Both call this so the sentence, the
 * tone and the id rule are one implementation rather than two that drift.
 *
 * **Not `meta.truncated`.** That field says the fallback capped rows (I13);
 * this says the far side emitted more bytes than C21 would hold. For as long as
 * C07 §4 read *not yet made*, the shell route wrote `truncated: child.overflowed`
 * — one field meaning two things, and nothing drawing either.
 */
import { block } from "../viewmodel/construct.js";
import type { Block } from "../viewmodel/types.js";

export const OVERFLOW_NOTICE_ID = "overflowed";

/** The figure is not carried on the `RawResult`, so the sentence does not name it. */
export const OVERFLOW_NOTICE_TEXT =
  "Output was cut: the far side emitted more than the runner holds, and only what arrived before the bound is shown.";

/**
 * The overflow notice, with an id free of `taken`.
 *
 * **The id steps aside for a collision** (C04 I14). A far side or an adapter may
 * already have used `overflowed`; a duplicate id fails validation, and in
 * `finish` a validation failure becomes the last-resort document — so a notice
 * with a fixed id would replace the whole result with *"Could not render this
 * result"*. Suffixed until free.
 *
 * **The block alone, for the route that has no list to append to.** C23's
 * stream route learns of the cut on the `end` patch, after every other block has
 * already been patched into the entry, so it appends this through the
 * transcript rather than composing a document — the third producer of the one
 * block, on the same sentence and the same id rule.
 */
export function overflowNotice(taken: Iterable<string>): Block {
  const ids = new Set(taken);
  let id = OVERFLOW_NOTICE_ID;
  for (let n = 2; ids.has(id); n += 1) id = `${OVERFLOW_NOTICE_ID}-${String(n)}`;
  return block({ kind: "notice", id, tone: "warn", glyph: "warn", text: OVERFLOW_NOTICE_TEXT });
}

/**
 * `blocks` with the overflow notice appended, or `blocks` unchanged when nothing
 * overflowed.
 */
export function withOverflowNotice(blocks: readonly Block[], overflowed: boolean): readonly Block[] {
  if (!overflowed) return blocks;
  return [...blocks, overflowNotice(blocks.map((b) => b.id))];
}
