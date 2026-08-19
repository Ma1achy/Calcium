/**
 * Faceted forms — `smallmultiples` and `pairplot`.
 *
 * These delegate to other forms' renderers via `FORM_ROWS`, so they are built
 * last and are the only place in C12 that composes rows **another renderer has
 * already painted**.
 *
 * **That is the whole difficulty, and this file got it wrong twice in one
 * function.** `padEnd` and `slice` count UTF-16 code units; a painted row
 * carries SGR sequences that occupy no columns at all. One colour run is
 * fourteen bytes and zero cells, so:
 *
 *   - `padEnd(facetWidth)` sees a 29-byte string as wider than 26 and pads
 *     nothing. A facet short of its column never got its gap.
 *   - `slice(0, width)` cuts at 80 *bytes*, which at 24-bit was 40 visible
 *     cells — and the cut landed mid-escape, so the tail of the row was a
 *     literal `[38;5` and every later facet was gone. The catalogue frame showed
 *     one facet of three and the top border of the other two, which is the
 *     shape of that cut rather than of a missing renderer.
 *
 * `paint.ts` states the rule this broke: *every kind builds plain text rows
 * first and styles them last*. This composes rows that are already styled, so
 * it cannot follow that order — and does not have to, because `displayCells`,
 * `fitStyled` and `sliceCells` are the sanctioned way to measure and window a
 * line that carries SGR. `sliceCells` is cited to C09 I20 §5a and was written
 * for exactly this: *compositing a layer over a painted row*.
 *
 * **The note that said otherwise was wrong in both directions.** It read
 * *SS14 rejects measuring escapes in L1, and it is right to*. SS14 forbids
 * escape **literals on the write path** — its own comment says so, and it lists
 * the two files allowed to hold them. Measuring is the inverse direction. The
 * function this file needed already existed, in this layer, written against
 * this case, and the belief that it was forbidden is what kept it unused.
 */
import type { Plot } from "../../data/viewmodel/index.js";
import type { RenderContext } from "../blocks/types.js";
import { SGR_RESET } from "../../terminal/escapes.js";
import { displayCells, fitStyled, sliceCells } from "../text.js";
import { plotAreaRows, plotHeight } from "./height.js";

type FormRenderer = (block: Plot, width: number, ctx: RenderContext) => readonly string[];

/**
 * The column each facet gets, left to right.
 *
 * **The remainder is distributed rather than dropped.** `floor(80 / 3)` is 26
 * and three of those is 78, so the old arithmetic left two columns permanently
 * blank at the right edge — legal under C12 I10, which forbids only *exceeding* the
 * width, and visible as a ragged edge in every faceted frame. The first
 * `width % n` facets take one extra column, which is the ordinary way to divide
 * a row and makes the composition exactly `width`.
 */
export function facetWidths(width: number, n: number): readonly number[] {
  if (n <= 0) return []; // cells-ok — a facet count
  const base = Math.max(1, Math.floor(width / n));
  const extra = width - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * A facet resized to the height the parent has for it.
 *
 * **The parent owns the layout, and reconciling without this mutilates the
 * figure.** A parent declaring 5 rows whose children each declare 5 gets
 * children of 8 — their own height plus their own frame — so cutting to the
 * declaration took the bottom border off every facet. Honouring C12 I1 by
 * removing the last three rows of a drawing is obeying the letter of the
 * invariant and breaking what it protects.
 *
 * The child's furniture is whatever its own form declares, so the height handed
 * back is the parent's budget minus that. A child too small to hold its own
 * furniture keeps one area row and `composeRows` does the rest — there is no
 * height at which a frame and a curve both fit in two rows, and a form that
 * says so is better than one that silently drops the curve.
 */
function facetAt(f: Plot, rows: number): Plot {
  const furniture = plotHeight(f) - plotAreaRows(f);
  return { ...f, height: Math.max(1, rows - furniture) }; // cells-ok — a row count
}

/** Small multiples: divide width across the facets, render each child into its column. */
export function smallMultiplesRows(
  facets: readonly Plot[],
  width: number,
  areaRows: number,
  ctx: RenderContext,
  formRows: Readonly<Record<string, FormRenderer>>,
): readonly string[] {
  const n = facets.length; // cells-ok — a facet count
  if (n === 0) return [];

  const ambiguous = ctx.capabilities?.ambiguousWidth ?? "narrow";
  const widths = facetWidths(width, n);
  const rendered = facets.map((f, i) => {
    const renderer = formRows[f.form];
    return renderer ? renderer(facetAt(f, areaRows), widths[i]!, ctx) : [];
  });

  const maxRows = rendered.reduce((m, r) => Math.max(m, r.length), 0); // cells-ok — a row count
  const rows: string[] = [];

  for (let i = 0; i < maxRows; i++) {
    let row = "";
    for (const [f, facetRows] of rendered.entries()) {
      const cell = facetRows[i] ?? "";
      const w = widths[f]!;
      // A facet with no row at this index contributes blanks rather than
      // nothing: a short facet must not pull the ones after it leftwards.
      row += cell === "" ? " ".repeat(w) : fitStyled(cell, w, SGR_RESET, ambiguous);
    }
    rows.push(displayCells(row, ambiguous) > width ? sliceCells(row, 0, width, ambiguous) : row);
  }
  return rows;
}
