/**
 * C22 §6l.4 D — an entry's layout: the card's header at the width, its body
 * two cells in under the hook (I83).
 *
 * **One function, called from both sides of the measurer/renderer seam.** C14
 * measures an entry through the wrapper `construct.ts` injects and `session.ts`
 * renders it through `visibleRows`; each used to take `(blocks, width)` and
 * agree by construction. The indent makes the body's width `width − 2`, which
 * is a number the two could each be right about while disagreeing — so the
 * split into runs happens here, once, and both call it (§6l.2 row 12).
 *
 * **No C09 change.** The hook is a prefix the shell draws in the gutter it
 * reserved — the mechanism `AGENT_TUI_DESIGN.md` §9c said the block library
 * does not have, put where the entry is composed rather than in the kinds. A
 * document whose first block is not a `step` notice lays out as it always did
 * (§6l.2 row 13), and a `step` header with no body hangs no hook (row 14).
 */

import type { Block } from "../data/viewmodel/index.js";
import { glyphFor } from "../presentation/blocks/index.js";
import type { BlockRegistry, NavElement } from "../presentation/blocks/index.js";
import { paint as paintSpans, tone } from "../presentation/blocks/paint.js";
import { renderSequenceToLines } from "../presentation/render-lines.js";

/** The body's indent under the hook, in cells — `⎿ ` and the blanks beneath it. */
export const BODY_INDENT = 2;

/** One vertical run of an entry: blocks laid out down the screen at one width. */
export type EntryRun = Readonly<{
  blocks: readonly Block[];
  width: number;
  /** Cells the run sits in from the entry's left edge; an indented run hangs under the hook. */
  indent: number;
}>;

/** Whether a document begins as a card — a `step` notice at block 0 (C23 I54). */
export function isCard(blocks: readonly Block[]): boolean {
  const head = blocks[0];
  return head !== undefined && head.kind === "notice" && head.glyph === "step";
}

/**
 * The runs an entry's blocks lay out as, at `width`.
 *
 * A card with a body is two runs; everything else is one. The body's width has
 * a floor of one so a pathological width cannot go negative — the size gate
 * keeps this unreachable, and a clamp is cheaper than a claim about the gate.
 */
export function entryLayout(blocks: readonly Block[], width: number): readonly EntryRun[] {
  if (!isCard(blocks) || blocks.length < 2) {
    return [Object.freeze({ blocks, width, indent: 0 })];
  }
  return [
    Object.freeze({ blocks: blocks.slice(0, 1), width, indent: 0 }),
    Object.freeze({ blocks: blocks.slice(1), width: Math.max(1, width - BODY_INDENT), indent: BODY_INDENT }),
  ];
}

/** The rows an entry's blocks take — C14's `measureSequence`, through the layout. */
export function measureEntry(
  measureSequence: (blocks: readonly Block[], width: number) => number,
  blocks: readonly Block[],
  width: number,
): number {
  let rows = 0;
  for (const run of entryLayout(blocks, width)) rows += measureSequence(run.blocks, run.width);
  return rows;
}

/**
 * The entry's elements, lifted into entry space (C26 §5) — rows by the runs
 * above, columns by the run's indent. A body element that answered its
 * block-local columns would sit two cells left of where the frame draws it,
 * which is F756's shape one level up.
 */
export function elementsOfEntry(
  registry: Pick<BlockRegistry, "elementsIn" | "measureSequence">,
  blocks: readonly Block[],
  width: number,
): readonly Readonly<{ blockId: string; element: NavElement }>[] {
  const out: Readonly<{ blockId: string; element: NavElement }>[] = [];
  let top = 0;
  for (const run of entryLayout(blocks, width)) {
    for (const { blockId, element } of registry.elementsIn(run.blocks, run.width)) {
      out.push({
        blockId,
        element: Object.freeze({
          ...element,
          rows: Object.freeze({ from: top + element.rows.from, to: top + element.rows.to }),
          cols: Object.freeze({
            from: run.indent + element.cols.from,
            to: run.indent + element.cols.to,
          }),
        }),
      });
    }
    top += registry.measureSequence(run.blocks, run.width);
  }
  return Object.freeze(out);
}

/** A run's share of a window `[from, to)` over the whole entry. */
export type EntryPiece = Readonly<{
  run: EntryRun;
  windowed: Readonly<{ blocks: readonly Block[]; skipRows: number }>;
  /** The first run-local row the window reaches — where the hook decision is made. */
  localFrom: number;
  /** Rows the window takes from this run. */
  take: number;
}>;

/**
 * Rows `[from, to)` of an entry, as one windowed piece per run the window
 * touches (C14 I25 through the layout). A run the window misses entirely
 * contributes nothing, so a card scrolled to its body renders no header.
 */
export function windowEntry(
  layout: readonly EntryRun[],
  from: number,
  to: number,
  registry: Pick<BlockRegistry, "windowSequence" | "measureSequence">,
): readonly EntryPiece[] {
  const pieces: EntryPiece[] = [];
  let offset = 0;
  for (const run of layout) {
    const height = registry.measureSequence(run.blocks, run.width);
    const lo = Math.max(from, offset);
    const hi = Math.min(to, offset + height);
    if (lo < hi) {
      pieces.push(
        Object.freeze({
          run,
          windowed: registry.windowSequence(run.blocks, run.width, lo - offset, hi - offset),
          localFrom: lo - offset,
          take: hi - lo,
        }),
      );
    }
    offset += height;
  }
  return Object.freeze(pieces);
}

type RenderOptions = Parameters<typeof renderSequenceToLines>[3];

/**
 * The gutter a body row carries: the hook on the run's first row, muted, and
 * blanks on every row after — both `BODY_INDENT` cells, because C09 I5 keeps
 * `continuation`'s two forms 1:1 by cell.
 */
export function bodyGutter(run: EntryRun, row: number, options: RenderOptions): string {
  if (run.indent === 0) return "";
  if (row !== 0) return " ".repeat(run.indent);
  const hook = glyphFor("continuation", options.capabilities);
  return `${paintSpans([{ text: hook, style: tone("muted", options.theme, options.capabilities) }])} `;
}

/**
 * The window's rows, rendered run by run through C09's one implementation and
 * prefixed with the gutter. `faults` is the C09 I1 comparison the caller notes,
 * **one per run whose rows disagree**: rows C09 produced against rows `measure`
 * committed, before slicing. Per run rather than summed — a header that drew
 * its one row would otherwise be added to a body that over-drew, and the report
 * would name figures no block produced (T4.54 reads the figures).
 */
export function renderEntryPieces(
  registry: BlockRegistry,
  pieces: readonly EntryPiece[],
  options: RenderOptions,
): Readonly<{ rows: readonly string[]; faults: readonly Readonly<{ drawn: number; expected: number }>[] }> {
  const rows: string[] = [];
  const faults: Readonly<{ drawn: number; expected: number }>[] = [];
  for (const piece of pieces) {
    const rendered = renderSequenceToLines(registry, piece.windowed.blocks, piece.run.width, options);
    const expected = registry.measureSequence(piece.windowed.blocks, piece.run.width);
    if (rendered.length !== expected) faults.push(Object.freeze({ drawn: rendered.length, expected }));
    const slice = rendered.slice(piece.windowed.skipRows, piece.windowed.skipRows + piece.take);
    slice.forEach((line, i) => {
      rows.push(`${bodyGutter(piece.run, piece.localFrom + i, options)}${line}`);
    });
  }
  return Object.freeze({ rows: Object.freeze(rows), faults: Object.freeze(faults) });
}
