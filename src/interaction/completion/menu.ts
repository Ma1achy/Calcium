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
  /** `null` while the menu is a display rather than a choice (I20). */
  selected: number | null,
  remainder: number,
): readonly Block[] {
  // The caller windows; this draws what it is given (`menuWindow`).

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
            // **Higher than the hint's, and it was lower** (I18). C11 admits
            // columns by priority *descending* (plan.ts step 2), so `1` against
            // the detail's `2` meant the labels were dropped first — at 80
            // columns over a diff the menu drew four summaries and not one verb
            // name, which is I18's own claim failing in the direction it was
            // written about. §6 says which way round it goes in as many words:
            // the label is what the user is reading, and the hint is
            // right-aligned against it.
            priority: 2,
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
            priority: 1,
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

  // **The edges, and there are two** (I23). The menu spans the region, so its
  // neighbours in both directions are left-aligned text at the same width: the
  // prompt below and the transcript above. Without them, `• /container` over
  // `❯ /co` is a path and `dtui-cfg  nginx:alpine  ● Up 4 minutes` over
  // `/container` is another row of the same table.
  //
  // **The top one was ruled unnecessary and the frame said otherwise** — with
  // the bottom edge already in place, the menu still read as continuous
  // upward. The sentence that ruled it out claimed the transcript is "a
  // different kind of content", and it is not: it is the same plain text at
  // the same width, which is why the seam closes invisibly.
  //
  // An empty label is a plain line — C09 draws it unbroken (C09 I21) and it
  // degrades to ASCII with the rest of the menu.
  const top: Block = { kind: "rule", id: `${MENU_ID}-edge-top`, label: "" };
  const edge: Block = { kind: "rule", id: `${MENU_ID}-edge`, label: "" };

  // **An empty set draws nothing, edge included**, and an existing row is what
  // said so. C15 omits a zero-row layer from the layout and dismisses nothing
  // (C15 I15) — the moment the set empties is C19's to act on — and a menu that
  // still measured one row would put a bare line above the prompt in the exact
  // moment there is nothing to show. The edge belongs to the candidates.
  if (candidates.length === 0) return Object.freeze([]); // graphemes-ok: a candidate count, not text

  // **C19 renders the indicator, because only C19 knows the remainder** (C15
  // I8). C15 reports *that* it truncated through `Placed.truncated`; it holds no
  // candidates and cannot say how many were lost.
  if (remainder <= 0) return Object.freeze([top, body, edge]);
  return Object.freeze([
    top,
    body,
    // **ASCII, because this text is authored where the capability is not**
    // (C09 I22, F122). C19 is L3 and the substitution happens at L1; a `raw`
    // block carries text rather than a slot, so the ellipsis could never have
    // been resolved. `…` has no `Glyph` either — C09 I5 wants 1:1 by cell
    // count and the ASCII form is three cells.
    { kind: "raw", id: `${MENU_ID}-more`, text: `+ ${String(remainder)} more` } satisfies Block,
    edge,
  ]);
}

/**
 * The candidates that fit, and where the window starts (I23).
 *
 * **The compositor cuts from the end, so anything the owner puts last is what
 * it loses.** `composite.ts` writes `lines[0 … height)` — C15 reports
 * `truncated` and cutting is the frame's half of the split — and this file used
 * to hand over every candidate and trust the clamp. Read from a frame, a
 * truncated menu drew the top rule and four candidates: **the `+ N more`
 * indicator and the bottom edge were both in the cut**, which is to say the
 * indicator has never been visible on any occasion it fired, and the edge C19
 * §6 argues stops the menu reading as continuous with the prompt is missing in
 * exactly the case where the list runs into it.
 *
 * The remainder was wrong by the same amount: `menuRowsShown` subtracts three
 * chrome rows *because it assumes all three are drawn*, so a menu showing four
 * candidates reported twenty-eight missing where twenty-six were.
 *
 * **And the selection could leave the frame.** With every candidate in the
 * content, arrowing past the last visible row moved a marker into a cut row —
 * the menu looked frozen while the selection was moving. The window follows the
 * selection for that reason rather than for scrolling's own sake.
 */
export function menuWindow(
  total: number,
  selected: number | null,
  fits: number,
): Readonly<{ start: number; shown: number }> {
  if (fits <= 0 || total <= fits) return Object.freeze({ start: 0, shown: total });
  const at = selected ?? 0;
  // **One clamp, and the other two were dead.** The first draft wrote
  // `min(at - fits + 1, total - fits)` and then `min(start, at)`, which read as
  // careful and could not fire: `at` is at most `total - 1`, so `at - fits + 1`
  // is at most `total - fits` and never exceeds it, and `start` is at most `at`
  // by construction. Two lines with nothing to be wrong about, passing exactly
  // like two that are satisfied — found by a mutation that changed them and
  // failed nothing (A03 §2).
  return Object.freeze({ start: Math.max(0, at - fits + 1), shown: fits });
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
  selected: number | null,
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

/**
 * How many candidates a placement could not show, for the indicator (I23).
 *
 * **`shown` is a count of rows.** C15 truncates by clamping height (C15 §4), so
 * the blocks are all still there and only some of their rows are drawn — a
 * caller passing `content.length` is counting boxes, and a table holding sixty
 * candidates is one of them. `menuRowsShown` below is what a caller should
 * hand it, and that is the half nothing asserted: this function has always been
 * right and was being asked the wrong question.
 */
export function remainderOf(placed: Placed | null, total: number, shown: number): number {
  if (placed === null || !placed.truncated) return 0;
  return Math.max(0, total - shown);
}

/**
 * The rows of a placement that hold candidates (I23).
 *
 * The rules cost one each, and the indicator costs one whenever it is drawn
 * — which is whenever anything was cut, which is the case this is called in.
 * Subtracting both here rather than at the call site keeps the menu's own
 * chrome a fact of this file, where the blocks are built.
 */
export function menuRowsShown(placed: Placed | null): number {
  if (placed === null) return 0;
  const chrome = placed.truncated ? 3 : 2;
  return Math.max(0, placed.height - chrome);
}
