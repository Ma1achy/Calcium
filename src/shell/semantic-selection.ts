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
import { sliceCells } from "../presentation/text.js";
import type { AmbiguousWidth } from "../presentation/text.js";
import { sgrPattern } from "../terminal/escapes.js";

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
  // **Ordered by row inside one entry, not only by entry** (C14 I51). With
  // both ends in one entry the pair kept press-then-pointer order, so an upward
  // drag clipped low at the press and high at the pointer and took nothing.
  const forward = a < b || (a === b && from.row <= to.row);
  const [lo, hi] = forward ? [from, to] : [to, from];
  const [loI, hiI] = forward ? [a, b] : [b, a];

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
 * A press — put the caret where the pointer is and start a new selection
 * (C14 §6f, I37).
 *
 * **The old blocks go, and that is derived rather than chosen.** I37 says the
 * range is re-derived from the pair on every step and `R-SEL-015` says the count
 * is always the size of what return would copy right now; a press that kept the
 * previous set would make the count the union of two gestures, which no release
 * could produce. The anchor goes with it, for `escape`'s reason.
 */
export function placeCaret(mode: SemanticMode, caret: Caret): SemanticMode {
  return mode === null ? null : frozen(caret, null, new Set<string>());
}

/**
 * A motion with the button held — extend from the anchor to here (C14 §6f).
 *
 * {@link extendCaret} with the caret given rather than stepped: a pointer names
 * a position and a key names a delta, and everything after that is the same
 * function, including the anchor being planted by the **first** extend so a
 * press alone selects nothing.
 */
export function extendTo(
  mode: SemanticMode,
  caret: Caret,
  spans: readonly BlockSpan[],
  order: readonly string[],
): SemanticMode {
  if (mode === null || mode.caret === null) return mode;
  const anchor = mode.anchor ?? mode.caret;
  return frozen(caret, anchor, blocksTouched(anchor, caret, spans, order));
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
  return copyParts(mode, loaded, copySequence).join("\n\n");
}

/** Each contributing entry's text, in document order — the one walk `copyTextOf` and `sizeOf` share. */
function copyParts(
  mode: SemanticMode,
  loaded: readonly Readonly<{ id: string; blocks: readonly Block[] }>[],
  copySequence: (blocks: readonly Block[]) => string,
): readonly string[] {
  if (mode === null) return [];
  const selected = mode.blocks;
  return loaded
    .map((e) => copySequence(e.blocks.filter((b) => selected.has(keyOf(e.id, b.id)))))
    .filter((t) => t !== "");
}

/**
 * How much `⏎` would copy right now — the count the footer draws (C14 I38,
 * I55, `R-SEL-015`).
 *
 * **Over the copy text, not the block set**: a block that copies nothing adds
 * nothing, and an entry whose blocks all decline is not counted, so the number
 * is the size of the paste. `chars` is code points including line breaks — the
 * `wc -m` reading of what lands on the clipboard; `rows` its lines. `null` when
 * nothing is selected, or when what is selected copies nothing.
 */
export function sizeOf(
  mode: SemanticMode,
  loaded: readonly Readonly<{ id: string; blocks: readonly Block[] }>[],
  copySequence: (blocks: readonly Block[]) => string,
): Readonly<{ chars: number; rows: number; entries: number }> | null {
  if (mode === null || mode.blocks.size === 0) return null;
  const parts = copyParts(mode, loaded, copySequence);
  if (parts.length === 0) return null; // cells-ok — an entry count
  const text = parts.join("\n\n");
  let chars = 0;
  for (const _ of text) chars += 1;
  return Object.freeze({ chars, rows: text.split("\n").length, entries: parts.length }); // cells-ok — counts, not widths
}

/**
 * A cursor — a caret with a column (C14 §6e).
 *
 * The block selection needs no column: its unit is the block, and a block has
 * no columns. The rectangle does, and it is a second shape rather than a field
 * on {@link Caret} for the reason §6c gives about granularity — a caret that
 * always carried a column would make *the selection's unit is the block* a
 * sentence with a spare coordinate in it.
 */
export type Cursor = Readonly<{ entryId: string; row: number; column: number }>;

/**
 * A rectangular selection — cells inside **one** block (`R-SEL-007`, C14 I42).
 *
 * Rows are the entry's own, as {@link Caret}'s are, and both ends are inclusive:
 * the reader put the head somewhere and the cell under it is theirs.
 */
export type CellRect = Readonly<{
  /** The block it started in, and the only one it can ever cover. */
  key: string;
  fromRow: number;
  toRow: number;
  fromColumn: number;
  toColumn: number;
}>;

/**
 * The rectangle between an anchor and a head, **clipped** to the anchor's block
 * (`R-SEL-007`, C14 I42).
 *
 * **A clip, not a containment test, and the two read as one sentence.** *Never
 * crosses a block boundary* is satisfied by refusing — a head that has left the
 * block gives no rectangle — and that behaves as the rule's opposite: the
 * selection empties while the reader extends past the edge and returns when they
 * come back. Clipping selects to the last row and stays there. The two differ on
 * every extend that leaves, which is most of them.
 *
 * **A head in another entry has no row in this one's space**, so the direction
 * comes from the transcript's order: later clamps to the block's last row,
 * earlier to its first. An order resolving neither entry clamps to the anchor's
 * own row — *clips to where it started* taken to its limit, and never a
 * rectangle somewhere the reader has not been.
 *
 * `null` is the one refusal, and it is *the anchor is in no block*: with nothing
 * to clip to there is no region it started in.
 */
export function rectBetween(
  anchor: Cursor,
  head: Cursor,
  spans: readonly BlockSpan[],
  order: readonly string[],
): CellRect | null {
  const span = spans.find(
    (sp) => entryOf(sp.key) === anchor.entryId && sp.from <= anchor.row && anchor.row < sp.to,
  );
  if (span === undefined) return null;

  const raw = rowOfHead(anchor, head, order);
  const headRow = Math.min(Math.max(raw, span.from), span.to - 1);
  const anchorRow = Math.min(Math.max(anchor.row, span.from), span.to - 1);

  return Object.freeze({
    key: span.key,
    fromRow: Math.min(anchorRow, headRow),
    toRow: Math.max(anchorRow, headRow),
    fromColumn: Math.min(anchor.column, head.column),
    toColumn: Math.max(anchor.column, head.column),
  });
}

/** The head's row in the anchor's coordinate space, or the edge it lies past. */
function rowOfHead(anchor: Cursor, head: Cursor, order: readonly string[]): number {
  if (head.entryId === anchor.entryId) return head.row;
  const a = order.indexOf(anchor.entryId);
  const h = order.indexOf(head.entryId);
  if (a === -1 || h === -1) return anchor.row;
  return h > a ? Infinity : -Infinity;
}

/**
 * What a rectangular copy takes — the rendered cells, with the ink off
 * (`R-SEL-007`, C14 I43).
 *
 * `lines` are the **frame's** lines for the rectangle's entry, indexed
 * entry-locally, which is what *cells, not source* means: this is the single
 * exception `R-SEL-004` names to copy taking the source, and the rule requires
 * it to be explicit rather than discovered in a paste.
 *
 * **The window is `sliceCells` and not a substring**, the same walk `paint`
 * uses, so a cluster straddling either edge is blanked rather than halved (C09
 * I9) — half a double-width glyph is a row one cell wide, and a copy is not the
 * place to invent one. On a painted line the two are not close: three characters
 * from column 2 of a line whose ink opens at column 0 are three bytes of the
 * escape.
 *
 * **And the style comes off**, because a clipboard is text and an escape
 * sequence in it is the rendering arriving where the content was asked for. The
 * *order* of the slice and the strip is not a rule here and reads as though it
 * were: `sliceCells` skips escapes when it counts cells, so both orders give the
 * same string (C14 I43).
 */
export function cellTextOf(
  rect: CellRect | null,
  lines: readonly string[],
  ambiguous: AmbiguousWidth = "narrow",
): string {
  if (rect === null) return "";
  const sgr = sgrPattern();
  const out: string[] = [];
  for (let row = rect.fromRow; row <= rect.toRow; row += 1) {
    const line = lines[row] ?? "";
    out.push(sliceCells(line, rect.fromColumn, rect.toColumn + 1, ambiguous).replace(sgr, ""));
  }
  return out.join("\n");
}
