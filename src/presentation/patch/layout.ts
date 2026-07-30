/**
 * C25 §2 — the four columns, and what each is owed.
 *
 * ```
 *   ┌── oldNo ──┬── newNo ──┬─ marker ─┬── text ──────────┐
 *   │        18 │        18 │          │ spec:            │
 *   │        21 │           │    -     │   app: volatil…  │
 *   └───────────┴───────────┴──────────┴──────────────────┘
 * ```
 *
 * **Two number columns rather than one**, and the marker in a column of its own.
 * Both are decisions a reader would otherwise infer the wrong way from `oldNo?`
 * and `newNo?` being optional: one column forces a choice on every changed line
 * and loses the correspondence a diff exists to show, and a marker inside the text
 * shifts every changed line one cell against its context and destroys the
 * alignment that makes a diff scannable.
 *
 * The number columns are sized from the widest number the patch actually carries,
 * so a hunk at 18–24 costs two cells and one at 998–1002 costs four. Fixed width
 * would waste cells at every scale but one.
 */
import { cells } from "../text.js";
import type { Patch } from "../../data/viewmodel/index.js";
import type { Layout } from "./height.js";

/** A space between columns, and the marker's own cell. */
const GAP = 1;
const MARKER = 1;

/**
 * The floor below which the gutter stops being worth its cells.
 *
 * A diff at eight columns is not a diff, and the honest failure is to drop the
 * gutter and keep the text rather than to render four columns of chrome and a
 * single `…`. That was C12's finding one component over: carrying the furniture
 * separately left it in place at width 1 and the content rendered as an ellipsis.
 */
const MIN_TEXT = 8;

export type PatchLayout = Readonly<{
  layout: Layout;
  /** Width of each number column. Zero when the gutter was dropped. */
  numbers: number;
  /** Whether the marker column is drawn. */
  marker: boolean;
  /** Cells before the text starts, on one side. */
  gutter: number;
  /** Cells the text gets, on one side. */
  text: number;
  /** The full width the row is padded to, so the background covers it. */
  width: number;
}>;

/** The widest line number in the patch, as cells. */
export function numberWidth(block: Patch): number {
  let widest = 1;
  for (const hunk of block.hunks) {
    for (const line of hunk.lines) {
      for (const no of [line.oldNo, line.newNo]) {
        if (no === undefined) continue;
        const w = cells(String(no));
        if (w > widest) widest = w;
      }
    }
  }
  return widest;
}

/**
 * The columns, at a width.
 *
 * **Everything is decided here and nothing re-derived downstream**, which is what
 * makes the clamp reliable: a row built from these numbers is exactly `width`
 * cells, so the background covers it and the terminal has nothing to wrap. C12
 * needed the same funnel for the same reason.
 *
 * **The marker is never dropped.** The numbers go when the width cannot carry
 * them; the marker stays at every width, because I4 makes it the thing that
 * carries the add/remove distinction when nothing else does and D29 rests on it.
 * Two tiers, and the narrow one is a marker and whatever text fits.
 */
export function patchLayout(block: Patch, width: number, layout: Layout): PatchLayout {
  const full = Math.max(1, Math.floor(width));
  const sides = layout === "split" ? 2 : 1;
  // A split layout spends one cell on the separator between the two halves.
  const separator = layout === "split" ? 1 : 0;
  const perSide = Math.floor((full - separator) / sides);

  const columns = layout === "split" ? 1 : 2;
  const wide = numberWidth(block);

  const withNumbers = columns * (wide + GAP) + MARKER + GAP;
  if (perSide - withNumbers >= MIN_TEXT) {
    return {
      layout,
      numbers: wide,
      marker: true,
      gutter: withNumbers,
      text: perSide - withNumbers,
      width: full,
    };
  }

  const markerOnly = MARKER + GAP;
  return {
    layout,
    numbers: 0,
    marker: true,
    gutter: markerOnly,
    text: Math.max(0, perSide - markerOnly),
    width: full,
  };
}
