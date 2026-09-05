/**
 * C22 §6l.4 D and §6l.6 — an entry's layout: the card's header at the width,
 * its body four cells in under a hook at the header's text column (I83, I84),
 * and one blank row closing every entry (I85).
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
import { block as rebuild } from "../data/viewmodel/index.js";
import { glyphFor } from "../presentation/blocks/index.js";
import type { BlockRegistry, NavElement } from "../presentation/blocks/index.js";
import { paint as paintSpans, tone } from "../presentation/blocks/paint.js";
import { renderSequenceToLines } from "../presentation/render-lines.js";

/**
 * The hook's column: the header's text column (C22 I84, §6l.6 row 16).
 *
 * **One unit, two cells, and a subordinate mark sits under its parent's text.**
 * `PROMPT_GUTTER.first` is the same figure one file over, and C09's own lead for
 * `continuation` in a notice is the same figure again (T2.99); T1.44 holds this
 * one to C09's by drawing both forms and comparing the mark's index, because
 * two constants agreeing is not the claim — one column on one screen is.
 * The hook sat at column 0 until §6l.6, under the header's *mark*, and the frame
 * that showed a notice's `⎿` at 2 beside a card's at 0 is what moved it.
 */
export const HOOK_INDENT = 2;

/** The body's indent under the hook, in cells — the hook's column, the mark, and its trailing space. */
export const BODY_INDENT = HOOK_INDENT + 2;

/**
 * The blank row that closes every entry (I85). The entry's own, so C14 measures
 * it through the wrapper and the frame draws it through the same layout — a
 * composer adding spacing of its own is the C04 I25 shape one layer up.
 */
export const ENTRY_GAP = 1;

/** One vertical run of an entry: blocks laid out down the screen at one width, or the closing blank. */
export type EntryRun = Readonly<{
  blocks: readonly Block[];
  width: number;
  /** Cells the run sits in from the entry's left edge; an indented run hangs under the hook. */
  indent: number;
  /** The entry's closing blank row (I85): one row, no blocks, drawn empty. */
  blank: boolean;
}>;

/** A run's rows — the blank's one, or the sequence's measured height. */
function runRows(
  measureSequence: (blocks: readonly Block[], width: number) => number,
  run: EntryRun,
): number {
  return run.blank ? ENTRY_GAP : measureSequence(run.blocks, run.width);
}

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
  const gap = Object.freeze({ blocks: [], width, indent: 0, blank: true });
  // **An entry with no blocks reserves no blank** (I85): the closing row
  // separates content, and a pending entry that is only its command line has
  // nothing to close — it is one row until its first block lands (T4.10).
  if (blocks.length === 0) {
    return [Object.freeze({ blocks, width, indent: 0, blank: false })];
  }
  if (!isCard(blocks) || blocks.length < 2) {
    return [Object.freeze({ blocks, width, indent: 0, blank: false }), gap];
  }
  return [
    Object.freeze({ blocks: blocks.slice(0, 1), width, indent: 0, blank: false }),
    Object.freeze({
      blocks: cardBody(blocks.slice(1)),
      width: Math.max(1, width - BODY_INDENT),
      indent: BODY_INDENT,
      blank: false,
    }),
    gap,
  ];
}

/**
 * The body's blocks with the first one's leading gap dropped (C23 I57): the hook
 * marks the body's first row, so a `gapBefore` there would draw a blank under
 * the mark — which is what `/ps --all` drew, C24 §4 giving a `table` a default
 * gap and C04 §3a drawing a leading gap as a row.
 *
 * **In the layout, not on the document, and the reason is a WeakMap.** A live
 * part is declared by *object identity* (`builders/live.ts`'s `declarations`
 * keyed by the block), so clearing the gap by copying the block on the stored
 * document drops its declaration and it never ticks (F821). `entryLayout` is
 * rebuilt from the current `doc.blocks` on every frame and is read by the
 * measurer and the renderer but never by the identity-keyed driver, so the copy
 * lives one frame and the declaration on the original survives. Measure and
 * render agree because both reach the body through this one function (I83).
 */
export function cardBody(blocks: readonly Block[]): readonly Block[] {
  const [first, ...rest] = blocks;
  if (first === undefined || first.gapBefore !== true) return blocks;
  const { gapBefore: _gap, ...cleared } = first;
  return [rebuild(cleared as Block), ...rest];
}

/** The rows an entry's blocks take — C14's `measureSequence`, through the layout. */
export function measureEntry(
  measureSequence: (blocks: readonly Block[], width: number) => number,
  blocks: readonly Block[],
  width: number,
): number {
  let rows = 0;
  for (const run of entryLayout(blocks, width)) rows += runRows(measureSequence, run);
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
    top += runRows(registry.measureSequence, run);
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
    const height = runRows(registry.measureSequence, run);
    const lo = Math.max(from, offset);
    const hi = Math.min(to, offset + height);
    if (lo < hi) {
      pieces.push(
        Object.freeze({
          run,
          windowed: run.blank
            ? { blocks: [], skipRows: 0 }
            : registry.windowSequence(run.blocks, run.width, lo - offset, hi - offset),
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
 * The gutter a body row carries: `HOOK_INDENT` blanks, the hook, muted, and a
 * space on the run's first row; blanks on every row after — both `BODY_INDENT`
 * cells, because C09 I5 keeps `continuation`'s two forms 1:1 by cell.
 */
export function bodyGutter(run: EntryRun, row: number, options: RenderOptions): string {
  if (run.indent === 0) return "";
  if (row !== 0) return " ".repeat(run.indent);
  const hook = glyphFor("continuation", options.capabilities);
  const lead = " ".repeat(HOOK_INDENT);
  return `${lead}${paintSpans([{ text: hook, style: tone("muted", options.theme, options.capabilities) }])} `;
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
    if (piece.run.blank) {
      // The closing blank (I85): `take` is 0 or 1, and an empty row measures as
      // one row wherever C09 is asked, so there is nothing to compare.
      for (let i = 0; i < piece.take; i += 1) rows.push("");
      continue;
    }
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
