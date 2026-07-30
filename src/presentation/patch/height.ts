/**
 * C25 §2 — height, and the layout that decides it.
 *
 * **I1 is the invariant that carries load.** C14 virtualises on measured height
 * without rendering, so measurement and the rendered row count coming apart is a
 * viewport that drifts rather than a block that looks wrong.
 *
 * I2a is the weaker one, and it is weaker because drawing the illustration proved
 * the original could not hold: I2 claimed height was independent of width, §3
 * chooses the layout by width, and split pairs a removed line with its added
 * counterpart on one row. Nine rows and eleven, from one block. Each statement was
 * correct alone and the three were jointly unsatisfiable — the second instance of
 * a defect class A03 §2 names and does not check.
 *
 * So height is exact at every width and **constant within a layout**, stepping
 * once at the breakpoint by exactly what pairing saves. Nothing wraps, and that
 * survives as its own claim (I2) because its reason is alignment rather than
 * arithmetic.
 */
import type { Hunk, Patch } from "../../data/viewmodel/index.js";

/**
 * Whether an elision is one, and it lives here because it decides a **row count**.
 *
 * `collapsedBefore: 0` is absent (T3.8): a collapse of nothing is not a collapse,
 * and a marker for it claims there is hidden content to reveal. Keeping the
 * predicate on the measurement side is what lets `height.ts` import the view model
 * and nothing else — the property T6.5 asserts, because a `measure` that could
 * reach the tokeniser is a `measure` that eventually does.
 */
export function isCollapsed(count: number | undefined): boolean {
  return count !== undefined && count > 0;
}

/** §3's breakpoint. Unified below, split at and above. */
export const SPLIT_AT = 100;

export type Layout = "unified" | "split";

/**
 * The layout a patch renders in. An explicit `layout` wins, so a surface can force
 * unified where it knows the width is a lie — a patch inside a panel has less than
 * the frame's width, and the block is told the width it actually has.
 */
export function layoutFor(block: Pick<Patch, "layout">, width: number): Layout {
  return block.layout ?? (width >= SPLIT_AT ? "split" : "unified");
}

/**
 * The rows a hunk's lines occupy in split layout.
 *
 * Each maximal run of consecutive changed lines pairs up: `max(removes, adds)`
 * rows, a removed line beside its added counterpart, and the shorter side padded
 * with blanks. A `context` line is one row in both layouts.
 *
 * **This reads the same field `lines.length` reads and allocates nothing**, which
 * is what keeps `measure` as cheap in split as in unified — C09 I1 is affordable
 * only because measuring never touches content.
 */
export function pairedRows(lines: Hunk["lines"]): number {
  let rows = 0;
  let removes = 0;
  let adds = 0;

  const flush = (): void => {
    rows += Math.max(removes, adds);
    removes = 0;
    adds = 0;
  };

  for (const line of lines) {
    if (line.kind === "context") {
      flush();
      rows += 1;
      continue;
    }
    if (line.kind === "remove") removes += 1;
    else adds += 1;
  }
  flush();

  return rows;
}

/** The rows one hunk occupies: its header, its lines, and its collapse marker. */
export function hunkRows(hunk: Hunk, layout: Layout): number {
  const body = layout === "split" ? pairedRows(hunk.lines) : hunk.lines.length; // cells-ok — a line count, not a width
  return 1 + body + (isCollapsed(hunk.collapsedBefore) ? 1 : 0);
}

/**
 * The whole block: one path header, then every hunk.
 *
 * A patch with no hunks is its header alone, which is one row rather than zero —
 * "nothing changed" is a statement worth a row, and a zero-height block is a block
 * C14 cannot scroll to.
 */
export function patchHeight(block: Patch, width: number): number {
  const layout = layoutFor(block, width);
  let rows = 1;
  for (const hunk of block.hunks) rows += hunkRows(hunk, layout);

  // The tail is the block's row, not a hunk's (C04 §3). One row on the same terms
  // as every `collapsedBefore`, and a patch with no hunks and a `collapsedAfter` is
  // a header and a marker — two rows, and a legitimate shape: it says the file is
  // unchanged and states how much of it there is.
  if (isCollapsed(block.collapsedAfter)) rows += 1;

  return rows;
}
