/**
 * Faceted forms — smallmultiples and pairplot.
 *
 * These delegate to other forms' renderers via the FORM_ROWS table,
 * so they are built last.
 */
import type { Plot } from "../../data/viewmodel/index.js";
import type { RenderContext } from "../blocks/types.js";

type FormRenderer = (block: Plot, width: number, ctx: RenderContext) => readonly string[];

/**
 * Small multiples: divide width by facet count, render each child.
 */
export function smallMultiplesRows(
  facets: readonly Plot[],
  width: number,
  ctx: RenderContext,
  formRows: Readonly<Record<string, FormRenderer>>,
): readonly string[] {
  const n = facets.length; // cells-ok — a facet count
  if (n === 0) return [];

  const facetWidth = Math.max(1, Math.floor(width / n));
  const rendered = facets.map((f) => {
    const renderer = formRows[f.form];
    return renderer ? renderer(f, facetWidth, ctx) : [];
  });

  const maxRows = rendered.reduce((m, r) => Math.max(m, r.length), 0); // cells-ok — a row count
  const rows: string[] = [];

  for (let i = 0; i < maxRows; i++) {
    let row = "";
    for (const facetRows of rendered) {
      const cell = facetRows[i] ?? "";
      row += cell.padEnd(facetWidth);
    }
    rows.push(row.slice(0, width));
  }
  return rows;
}
