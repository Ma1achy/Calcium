/**
 * The menu, as blocks.
 *
 * C19 §6 — see spec. An anchored C15 overlay with `Block[]` content (I8), so it
 * is themed, degrades to ASCII and measures through the same registry as the
 * transcript. C19 renders no chrome of its own.
 *
 * **This file is deliberately outside SS40's allowance**, unlike `context.ts`
 * and `sources.ts`. Those two work in the tokeniser's coordinate system, where a
 * code-unit count is the honest measure. This one measures display width, where
 * `.length` is the exact mistake SS40 exists to catch — a candidate's column is
 * `cells()`, and an emoji in a filename is two columns and one grapheme and four
 * code units.
 */

import { cells } from "../../presentation/text.js";
import type { Block, Layer, Placed } from "./deps.js";
import type { Candidate } from "./types.js";

/** The id C15 knows the menu by; one layer for a whole completion (§6). */
export const MENU_ID = "completion-menu";

/** Padding either side of the widest entry, plus C15's border. */
const CHROME_CELLS = 4;

/**
 * How wide the menu wants to be (I8, C15 I16).
 *
 * **C19 declares this because nothing downstream can work it out.** A
 * `BlockRegistry` answers height at a width and never the reverse, so C15 knows
 * the region and this component knows the longest candidate, and neither can
 * supply the other's half.
 */
/**
 * The selection glyph and its separator, which the value column must also hold.
 *
 * The selected row carries a `bullet` and the others do not, so a floor derived
 * from the label alone truncates whichever candidate is selected — and only
 * that one, which reads as a rendering flicker rather than as a width defect.
 */
const GLYPH_CELLS = 2;

/** The widest hint, in cells — the detail column's floor, since the label flexes. */
function widestDetail(candidates: readonly Candidate[]): number {
  let widest = 1;
  for (const c of candidates) widest = Math.max(widest, c.detail === undefined ? 0 : cells(c.detail));
  return widest;
}

/**
 * The widest label plus the selection glyph — the value column's floor (I18).
 *
 * **The glyph is in the floor rather than in one row's cell.** It is on
 * whichever row is selected, so a floor derived from the label alone truncates
 * exactly the selected row, which reads as a flicker rather than as a width
 * defect.
 */
function widestLabel(candidates: readonly Candidate[]): number {
  let widest = 1;
  for (const c of candidates) widest = Math.max(widest, cells(c.display ?? c.value));
  return widest + GLYPH_CELLS;
}


/**
 * Pills when the set is short and nothing carries a hint; a table when entries
 * have `detail` (§6).
 *
 * The selected entry is `active` rather than a different tone, so the highlight
 * is C10's business and this file names no colour.
 */
export function menuBlocks(
  candidates: readonly Candidate[],
  selected: number,
  remainder: number,
): readonly Block[] {
  const detailed = candidates.some((c) => c.detail !== undefined);
  const body: Block = detailed
    ? {
        kind: "table",
        id: `${MENU_ID}-table`,
        columns: [
          {
            key: "value",
            label: "",
            align: "left",
            priority: 1,
            minWidth: widestLabel(candidates),
            // **The flex is C19's declaration, not a default C11 should
            // change** (I18). C11 gives residual width only to a `flex` column
            // — plan.ts step 8, a stated decision — and every surface's drop
            // table was computed against it, so widening the default would
            // invalidate twelve column declarations to repair one programmatic
            // table. The label is the column that should absorb: it is what the
            // user is reading, and the hint is right-aligned against it.
            flex: true,
            sortable: false,
          },
          {
            key: "detail",
            label: "",
            align: "right",
            priority: 2,
            minWidth: widestDetail(candidates),
            sortable: false,
          },
        ],
        // **The selection is a glyph on the row, not a field on it.** C04's
        // `TableRow` has no `selected`, and adding one would put a view-state
        // field beside `expanded` in the type C04 §4 keeps free of them. A tone
        // is wrong for a different reason: `Tone` is a palette slot with a
        // meaning, and "the cursor is here" is not one of them. `bullet` is in
        // C04's closed glyph vocabulary and C09 owns both its renderings, so it
        // degrades to ASCII with the rest of the menu (I8).
        rows: candidates.map((c, i) => ({
          id: `${MENU_ID}-${String(i)}`,
          cells: {
            value: {
              text: c.display ?? c.value,
              ...(i === selected ? { glyph: "bullet" as const } : {}),
            },
            detail: { text: c.detail ?? "" },
          },
        })),
        showHeader: false,
      }
    : {
        kind: "pills",
        id: `${MENU_ID}-pills`,
        chips: candidates.map((c, i) => ({
          label: c.display ?? c.value,
          ...(c.tone === undefined ? {} : { tone: c.tone }),
          ...(i === selected ? { active: true } : {}),
        })),
      };

  // **C19 renders the indicator, because only C19 knows the remainder** (C15
  // I8). C15 reports *that* it truncated through `Placed.truncated`; it holds no
  // candidates and cannot say how many were lost.
  if (remainder <= 0) return Object.freeze([body]);
  return Object.freeze([
    body,
    { kind: "raw", id: `${MENU_ID}-more`, text: `… ${String(remainder)} more` } satisfies Block,
  ]);
}

/**
 * The layer, anchored to the prompt's whole span.
 *
 * `rows` is the prompt's own extent rather than 1, because a two-row prompt has
 * no single row that places a menu correctly and both wrong answers produce a
 * `Placed` whose every number is self-consistent (C15 I17). `prefer: "above"` is
 * the common case — the prompt is near the bottom by definition — and C15 flips
 * when there is no room.
 */
export function menuLayer(
  candidates: readonly Candidate[],
  selected: number,
  remainder: number,
  anchor: Readonly<{ row: number; rows: number }>,
): Layer {
  return Object.freeze({
    id: MENU_ID,
    kind: "overlay" as const,
    placement: Object.freeze({
      kind: "anchored" as const,
      row: anchor.row,
      rows: anchor.rows,
      prefer: "above" as const,
    }),
    content: menuBlocks(candidates, selected, remainder),
    dismissable: true,
    // **No `width`, which is how a layer says *the whole region* (C15 I16:
    // `min(layer.width ?? region.width, region.width)`).**
    //
    // It used to declare `menuWidth(candidates)`, the widest label plus its
    // hint, and C19 §"the menu spans the region" is the reversal. The old
    // ruling was right that only C19 can compute that number and wrong that it
    // should: a menu narrower than the region leaves whatever is behind it
    // visible on the same rows, so a reader sees two unrelated things on one
    // line. The menu is chrome for the prompt, and the prompt spans the frame.
    //
    // `Layer.width` keeps its purpose — a confirm is a dialogue and wants to be
    // forty cells and centred. That is the field's case; this was not.
  });
}

/** How many candidates a placement could not show, for the indicator. */
export function remainderOf(placed: Placed | null, total: number, shown: number): number {
  if (placed === null || !placed.truncated) return 0;
  return Math.max(0, total - shown);
}
