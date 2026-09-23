/**
 * Semantic copy mode's model (C14 §6a, C16 §5d, `R-SEL-003`, `R-SEL-005`,
 * `R-SEL-008`, `R-SEL-015`).
 *
 * **Pure, and separate from `session.ts` for a reason that is not tidiness.**
 * The one rule this mode has that nothing else in the tree has is C16 I51's
 * asymmetry — `esc` clears then leaves, `⌃c` only leaves — and the surface that
 * would otherwise show it is the footer's mode label, which is **parked** on a
 * word the design does not supply (C14 §6a). A rule whose only observation point
 * is unbuilt is a rule nothing can be written against, which is A03 §2's class
 * arriving by scheduling rather than by wording. So the transition is a function
 * and the state is its argument.
 *
 * `null` is *not in the mode*, and it is the same value as *no selection*
 * deliberately: `R-SEL-005` says a selection is state **within** a rung rather
 * than a rung of its own, so the pair that cannot exist — not in the mode, three
 * entries selected — has no representation here rather than a guard against it.
 */

import type { Block } from "../data/viewmodel/index.js";

/**
 * An entry plus a row within it (C14 I36, §6c).
 *
 * **The row is the entry's own and never the viewport's.** A viewport row moves
 * when anything above it changes height — C14 I6's argument about the anchor —
 * and the caret has to survive a resize, because a resize re-lays the held
 * document (C14 I31).
 */
export type Caret = Readonly<{ entryId: string; row: number }>;

/** One block's entry-local rows, `[from, to)` — what an extend intersects. */
export type BlockSpan = Readonly<{ key: string; from: number; to: number }>;

/** The caret, the anchor, and the blocks a copy would take (`R-SEL-015`). */
export type SemanticSelection = Readonly<{
  /** Where the reader is. `null` when the transcript is empty. */
  caret: Caret | null;
  /**
   * Where the extend began, or `null` with none in flight (C14 I37).
   *
   * Planted by the first extend rather than by entering, so a plain arrow can
   * move the caret without selecting on the way — and the range is re-derived
   * from the pair on every step, so over-shooting and coming back gives what
   * going there directly gives.
   */
  anchor: Caret | null;
  /**
   * **Block keys, and the split from the caret is what makes atomicity a rule**
   * (`R-SEL-003`, C14 I36). With the caret at the block too, *all of it or none
   * of it* would be a property of the type: satisfied by construction, violable
   * by nothing, asserted by no row. The caret is a row and this is a block, so
   * the map between them — intersection, never containment — is the rule.
   */
  blocks: ReadonlySet<string>;
}>;

/**
 * One block's address across the transcript.
 *
 * A block id is unique within its document and a transcript holds many (C04
 * I14), so the entry is part of the key. `\u0000` cannot appear in either half.
 */
export const keyOf = (entryId: string, blockId: string): string => `${entryId}\u0000${blockId}`;

/** The entry half of a key — what the copy groups by. */
export const entryOf = (key: string): string => key.slice(0, key.indexOf("\u0000"));

/** The mode, or `null` when it is not up. */
export type SemanticMode = SemanticSelection | null;

const frozen = (
  caret: Caret | null,
  anchor: Caret | null,
  blocks: ReadonlySet<string>,
): SemanticSelection => Object.freeze({ caret, anchor, blocks });

/** Enter, seeded with a caret. A second call is a no-op (C16 §5d D3). */
export function enter(mode: SemanticMode, caret: Caret | null): SemanticMode {
  return mode ?? frozen(caret, null, new Set<string>());
}

/**
 * `esc` — clear the selection if there is one, otherwise leave (C16 I51, §5d D1/D2).
 *
 * The reader presses one key twice and the footer says which press they are on.
 * `⌃c` does **not** come through here: it is `null` directly, because the
 * ladder's rung answers *cancel the innermost thing* and a rung that also tidied
 * up would be answering two questions (C16 I23).
 */
export function escape(mode: SemanticMode): SemanticMode {
  if (mode === null) return null;
  // The anchor goes with the selection: a cleared selection has no extend in
  // flight, and an anchor left standing would make the next `⇧↓` re-derive a
  // range from where the last one started (C14 I37).
  return mode.blocks.size === 0 ? null : frozen(mode.caret, null, new Set<string>());
}

/**
 * Every block of one entry, as keys (`R-SEL-008`).
 *
 * The unit changed and the rule's sentence did not: *the entry under the caret*
 * still means the entry, and what goes into the set is its blocks (C14 I38).
 */
const blocksOfEntry = (
  entryId: string,
  spans: readonly BlockSpan[],
): readonly string[] => spans.filter((sp) => entryOf(sp.key) === entryId).map((sp) => sp.key);

/** `a` — take the entry under the caret (`R-SEL-008`). */
export function selectCaret(mode: SemanticMode, spans: readonly BlockSpan[]): SemanticMode {
  if (mode === null || mode.caret === null) return mode;
  return frozen(
    mode.caret,
    mode.anchor,
    new Set([...mode.blocks, ...blocksOfEntry(mode.caret.entryId, spans)]),
  );
}

/**
 * `A` — take every loaded entry (`R-SEL-008`).
 *
 * *Says what it did, because the window is not the record*: the spans are the
 * **held** document's, not the session's, and `⌃a` is deliberately unbound
 * because a key that silently produces a clipboard of megabytes is a trap.
 */
export function selectAll(mode: SemanticMode, spans: readonly BlockSpan[]): SemanticMode {
  return mode === null ? null : frozen(mode.caret, mode.anchor, new Set(spans.map((sp) => sp.key)));
}

/**
 * The blocks a row range **touches**, taken whole (`R-SEL-003`, C14 I36).
 *
 * **Intersection, never containment, and that is the whole rule.** A range
 * reaching one row of a ten-row table takes the table; the two answers differ
 * for every block taller than the range, which is the case the rule was written
 * about and the case a containment test gets wrong silently — it returns fewer
 * blocks and every one it returns is right.
 *
 * The range is inclusive of both caret and anchor rows, because both are places
 * the reader is looking at rather than a half-open interval they chose.
 */
export function blocksTouched(
  from: Caret,
  to: Caret,
  spans: readonly BlockSpan[],
  order: readonly string[],
): ReadonlySet<string> {
  const a = order.indexOf(from.entryId);
  const b = order.indexOf(to.entryId);
  if (a === -1 || b === -1) return new Set<string>();
  const [lo, hi] = a <= b ? [from, to] : [to, from];
  const [loI, hiI] = a <= b ? [a, b] : [b, a];

  const out = new Set<string>();
  for (const sp of spans) {
    const i = order.indexOf(entryOf(sp.key));
    if (i < loI || i > hiI) continue;
    // Entries strictly between the two ends are taken whole; the ends are
    // clipped by their own row, and one entry holding both ends is clipped by
    // both — which is the arm a two-entry fixture never reaches.
    const lowRow = i === loI ? lo.row : -Infinity;
    const highRow = i === hiI ? hi.row : Infinity;
    if (sp.to > lowRow && sp.from <= highRow) out.add(sp.key);
  }
  return out;
}

/**
 * A plain arrow — move the caret, touch nothing else (C14 I37).
 *
 * Without this the mode has no way to put the caret anywhere without selecting
 * on the way, and the anchor stays where it was so an extend already in flight
 * is not silently re-based.
 */
export function moveCaret(
  mode: SemanticMode,
  delta: number,
  spans: readonly BlockSpan[],
  order: readonly string[],
): SemanticMode {
  if (mode === null || mode.caret === null) return mode;
  return frozen(step(mode.caret, delta, spans, order), mode.anchor, mode.blocks);
}

/**
 * A shifted arrow — plant the anchor if there is none, move, and **re-derive**
 * the whole range from the pair (C14 I37).
 *
 * Re-deriving rather than accumulating is what makes an over-shoot recoverable:
 * three down and two up is one down, by equality and not by size, which is
 * `R-SEL-015`'s *the count is always the size of what return would copy right
 * now* said for a keyboard.
 */
export function extendCaret(
  mode: SemanticMode,
  delta: number,
  spans: readonly BlockSpan[],
  order: readonly string[],
): SemanticMode {
  if (mode === null || mode.caret === null) return mode;
  const anchor = mode.anchor ?? mode.caret;
  const caret = step(mode.caret, delta, spans, order);
  return frozen(caret, anchor, blocksTouched(anchor, caret, spans, order));
}

/**
 * One row up or down, crossing into the neighbouring entry at its edge.
 *
 * Clamped at both ends of the transcript: a caret that fell off would have to be
 * `null`, and `null` is *the transcript is empty* here (C14 I36).
 */
function step(
  caret: Caret,
  delta: number,
  spans: readonly BlockSpan[],
  order: readonly string[],
): Caret {
  const heightOf = (entryId: string): number =>
    spans.reduce((h, sp) => (entryOf(sp.key) === entryId ? Math.max(h, sp.to) : h), 0);
  let { entryId, row } = { entryId: caret.entryId, row: caret.row + delta };
  let i = order.indexOf(entryId);
  if (i === -1) return caret;
  while (row < 0 && i > 0) {
    i -= 1;
    entryId = order[i] as string;
    row += heightOf(entryId);
  }
  while (row >= heightOf(entryId) && i < order.length - 1) {
    row -= heightOf(entryId);
    i += 1;
    entryId = order[i] as string;
  }
  const height = heightOf(entryId);
  return Object.freeze({ entryId, row: Math.min(Math.max(row, 0), Math.max(0, height - 1)) });
}

/**
 * How many **blocks** a copy right now would take (`R-SEL-015`, C14 I38).
 *
 * The rule counts what a copy would take, and an entry count reports a
 * half-taken entry as a whole one — the number wrong in exactly the direction
 * the rule exists to prevent.
 */
export const count = (mode: SemanticMode): number => mode?.blocks.size ?? 0;

/**
 * What `y` takes — the selected blocks, in document order, entries one blank
 * line apart (C14 §6a, `R-SEL-004`).
 *
 * **Document order is the transcript's, not the selection's.** `blocks` is a set
 * and a set has no order; taking the order from the transcript is what makes a
 * copy of three entries paste as the session read, whichever order the reader
 * selected them in — and within an entry the blocks keep the document's order
 * for the same reason.
 *
 * **One blank line is the entry separator and nothing inside an entry may
 * produce one** (C09 I86). That is why a block declining contributes no line at
 * all rather than an empty one, and why this joins on `"\n\n"` over entries
 * while `copySequence` joins on `"\n"` within one.
 *
 * An entry whose selected blocks all decline is dropped rather than contributing
 * a blank paragraph — the same rule one level up, and the case a selection of a
 * `rule` alone produces.
 */
export function copyTextOf(
  mode: SemanticMode,
  loaded: readonly Readonly<{ id: string; blocks: readonly Block[] }>[],
  copySequence: (blocks: readonly Block[]) => string,
): string {
  if (mode === null) return "";
  const selected = mode.blocks;
  return loaded
    .map((e) => copySequence(e.blocks.filter((b) => selected.has(keyOf(e.id, b.id)))))
    .filter((t) => t !== "")
    .join("\n\n");
}
