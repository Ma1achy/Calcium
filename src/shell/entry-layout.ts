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
import { glyphForMask, LINE_DOWN, LINE_LEFT, LINE_RIGHT, LINE_UP } from "../presentation/plot/linedraw.js";
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
 * One gutter column per level of nesting, and it is the body's indent (C22 I89,
 * §6l.8 rows 23–25). A nested card's head sits where its parent's body text
 * does; its own body is one unit further in. Held to `BODY_INDENT` by T1.49
 * drawing both, because two constants agreeing is not the claim.
 */
export const GUTTER_UNIT = BODY_INDENT;

/**
 * What one gutter column draws on a row (C22 I88, I89): the hook under a head,
 * the bar continuing a line past body rows, the tree's branch and elbow at a
 * nested head, or nothing — under the last child, where no line continues.
 */
export type GutterCell = "hook" | "bar" | "branch" | "elbow" | "blank";

/** A gutter column's cell on the run's first row and on every row after. */
export type GutterColumn = Readonly<{ first: GutterCell; rest: GutterCell }>;

const NO_GUTTER: readonly GutterColumn[] = Object.freeze([]);

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
  /** Cells the run sits in from the entry's left edge — `gutter.length × GUTTER_UNIT`. */
  indent: number;
  /** The entry's closing blank row (I85): one row, no blocks, drawn empty. */
  blank: boolean;
  /** The columns drawn before every row of the run, outermost first (I88, I89). */
  gutter: readonly GutterColumn[];
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
 * A nested card (C22 I89): a `group` column whose first block is a `step`
 * notice. The composer builds one per child call (C23 I62); the layout reads the
 * shape and never a flag, so a producer cannot declare a card it did not draw.
 */
function nestedCard(block: Block): Block extends infer B ? (B & { kind: "group" }) | null : never {
  if (block.kind !== "group" || block.direction !== "column") return null;
  return isCard(block.children) ? block : null;
}

/**
 * The runs an entry's blocks lay out as, at `width`.
 *
 * A card with a body is two runs; everything else is one. The body's width has
 * a floor of one so a pathological width cannot go negative — the size gate
 * keeps this unreachable, and a clamp is cheaper than a claim about the gate.
 */
export function entryLayout(blocks: readonly Block[], width: number): readonly EntryRun[] {
  const gap = Object.freeze({ blocks: [], width, indent: 0, blank: true, gutter: NO_GUTTER });
  // **An entry with no blocks reserves no blank** (I85): the closing row
  // separates content, and a pending entry that is only its command line has
  // nothing to close — it is one row until its first block lands (T4.10).
  if (blocks.length === 0) {
    return [Object.freeze({ blocks, width, indent: 0, blank: false, gutter: NO_GUTTER })];
  }
  if (!isCard(blocks) || blocks.length < 2) {
    return [Object.freeze({ blocks, width, indent: 0, blank: false, gutter: NO_GUTTER }), gap];
  }
  return [
    Object.freeze({ blocks: blocks.slice(0, 1), width, indent: 0, blank: false, gutter: NO_GUTTER }),
    ...bodyRuns(cardBody(blocks.slice(1)), width, NO_GUTTER, 1),
    gap,
  ];
}

/** A run under `gutter` columns, at the width those columns leave. */
function bodyRun(blocks: readonly Block[], width: number, gutter: readonly GutterColumn[]): EntryRun {
  const indent = gutter.length * GUTTER_UNIT;
  return Object.freeze({ blocks, width: Math.max(1, width - indent), indent, blank: false, gutter });
}

/**
 * A card body's runs (I88, I89): its plain blocks under the hook and then the
 * bar, and each nested card as a head run under a tree glyph followed by its own
 * body one column further in.
 *
 * **Recurses exactly once.** `depth` is the body's: the top card's body is 1 and
 * may hold cards; a child's body is 2 and a `step` column inside it is body
 * text — *three levels is a composition problem wearing a rendering problem's
 * clothes* (§6l.8 row 24), and a layout that drew it would hide the finding.
 *
 * **The tree's glyphs are the plot's line table** (`glyphForMask`, F293), not
 * new `Glyph` tokens: it already flattens to ASCII at `ascii || wide`, which is
 * the width tier the glyph table lacked until C09 I48, and a gutter is chrome
 * rather than a figure, so `corners` is fixed `"sharp"` — the function the
 * measurer and renderer share must not depend on a theme.
 */
function bodyRuns(
  body: readonly Block[],
  width: number,
  outer: readonly GutterColumn[],
  depth: number,
): readonly EntryRun[] {
  const cards = depth < 2 ? body.filter((b) => nestedCard(b) !== null) : [];
  const last = cards[cards.length - 1];
  // **The line ends only where the body does.** `└─` says *nothing continues
  // below*, and a body row after the last child would draw the bar under it —
  // an elbow with a line through it. So the last child takes the elbow only
  // when it is also the body's last block; followed by text it is a branch,
  // and the parent's bar runs past its body as it runs past any other row.
  const tail = body[body.length - 1];
  const runs: EntryRun[] = [];
  let plain: Block[] = [];
  // The body's first run hangs under the hook; every later run continues the bar.
  const lead = (): GutterCell => (runs.length === 0 ? "hook" : "bar");
  const flush = (): void => {
    if (plain.length === 0) return; // cells-ok — a block count
    runs.push(bodyRun(plain, width, [...outer, { first: lead(), rest: "bar" }]));
    plain = [];
  };
  for (const b of body) {
    // **Read at this depth, not only counted at it**: the first cut filtered
    // `cards` by depth and read every block as a card in the loop, and a
    // grandchild drew a third gutter column — found by the frame, not a count.
    const card = depth < 2 ? nestedCard(b) : null;
    if (card === null) {
      plain.push(b);
      continue;
    }
    flush();
    // **One child keeps `⎿` — a tree of one is a corner** (row 23); with
    // siblings, `├─` for every child but the last and `└─` for the last.
    const closes = b === last && b === tail;
    const cell: GutterCell = cards.length === 1 && runs.length === 0 ? "hook" : closes ? "elbow" : "branch"; // cells-ok — a card count
    const [head, ...rest] = card.children;
    if (head !== undefined) runs.push(bodyRun([head], width, [...outer, { first: cell, rest: cell }]));
    if (rest.length > 0) { // cells-ok — a block count
      // The parent's line continues past a child's body and stops under the
      // last child (row 25): nothing below it to connect to.
      const through: GutterColumn = closes ? { first: "blank", rest: "blank" } : { first: "bar", rest: "bar" };
      runs.push(...bodyRuns(cardBody(rest), width, [...outer, through], depth + 1));
    }
  }
  flush();
  return runs;
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
  command?: string,
): readonly Readonly<{ blockId: string; element: NavElement }>[] {
  const out: Readonly<{ blockId: string; element: NavElement }>[] = [];
  // **The head copies the invocation** (I90): `y` on a card's head yields what
  // ran, and `⌃a y` yields it first, followed by the body's own copies through
  // C26 I16's one aggregator. Every other element's `copy` is its block's — a
  // nested head included, whose invocation the parent's command does not name.
  const headId = command !== undefined && isCard(blocks) ? blocks[0]?.id : undefined;
  let top = 0;
  for (const run of entryLayout(blocks, width)) {
    for (const { blockId, element } of registry.elementsIn(run.blocks, run.width)) {
      out.push({
        blockId,
        element: Object.freeze({
          ...element,
          ...(blockId === headId && command !== undefined ? { copy: command } : {}),
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
 * One gutter cell's text, `GUTTER_UNIT` cells wide (I88, I89): `HOOK_INDENT`
 * blanks, then the glyph or glyphs, muted, padded to the unit. Every glyph is
 * one cell at both width conventions — `continuation` is Neutral (C09 I5) and
 * `glyphForMask` flattens to ASCII where box drawing would double (F293) — so
 * the geometry the measurer committed is the geometry drawn.
 */
function gutterCell(cell: GutterCell, options: RenderOptions): string {
  if (cell === "blank") return " ".repeat(GUTTER_UNIT);
  const caps = options.capabilities;
  const glyphs =
    cell === "hook"
      ? glyphFor("continuation", caps)
      : cell === "bar"
        ? glyphForMask(LINE_UP | LINE_DOWN, "sharp", caps)
        : `${glyphForMask(cell === "branch" ? LINE_UP | LINE_DOWN | LINE_RIGHT : LINE_UP | LINE_RIGHT, "sharp", caps)}${glyphForMask(LINE_LEFT | LINE_RIGHT, "sharp", caps)}`;
  const painted = paintSpans([{ text: glyphs, style: tone("muted", options.theme, caps) }]);
  const pad = GUTTER_UNIT - HOOK_INDENT - [...glyphs].length; // cells-ok — every gutter glyph is one cell by construction (C09 I5, F293)
  return `${" ".repeat(HOOK_INDENT)}${painted}${" ".repeat(Math.max(0, pad))}`;
}

/**
 * The gutter a body row carries (I88, I89): each column's `first` cell on the
 * run's first row and its `rest` on every row after — the hook, then the bar
 * down the body; a tree glyph at a nested head; the parent's bar or nothing
 * past a child's body. Always `run.indent` cells, so I83 holds by construction.
 */
export function bodyGutter(run: EntryRun, row: number, options: RenderOptions): string {
  if (run.gutter.length === 0) return ""; // cells-ok — a column count
  return run.gutter.map((column) => gutterCell(row === 0 ? column.first : column.rest, options)).join("");
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
