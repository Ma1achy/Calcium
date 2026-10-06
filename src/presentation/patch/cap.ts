/**
 * C25 I14 — the collapsed form's hunk cap, and the one place it is decided.
 *
 * **Data on the block, never a viewport** (D12). `Patch.cap` is a row budget the
 * producer writes, so everything here is a function of `(block, width)` and
 * `measure` stays pure (I1): the admission is re-taken at each width because a
 * hunk's rows are the layout's (I2a), exactly as `collapsedBefore` is read at
 * each width rather than resolved once.
 *
 * **One answer for four readers** — `measure`, `render`, `window` and
 * `elements` — because a capped form that two of them disagreed about is a
 * marker drawn on a row the measurer did not count. The same argument `rowsOf`
 * carries for the window (I19b), one decision earlier.
 */
import type { Patch } from "../../data/viewmodel/index.js";
import { hunkRows, layoutFor, patchHeight } from "./height.js";
import { numberWidth } from "./layout.js";

/** What the cap admits at one width: the hunks shown and the hunks dropped. */
export type Capped = Readonly<{ shown: number; dropped: number }>;

/**
 * The cap's answer at `width` **whether or not the reader expanded it** — the
 * elements need it both ways, because the toggle is offered wherever the cap
 * bites and says `collapse` once it has been set aside (I24).
 *
 * `null` where no hunk would be dropped: no `cap`, the whole block within it,
 * or a lone hunk. **The first hunk is always admitted** — a collapsed form that
 * showed none would be a marker about nothing — so a lone hunk taller than the
 * cap is drawn whole, which is the expanded form's cost already (I14).
 *
 * The budget counts the path header, each admitted hunk's rows and **the marker
 * row**, reserved before the next hunk is admitted: the marker cannot be the row
 * that pushes the form past its cap, which is `shedRow`'s reservation argument
 * (C09 I108) one component over.
 */
export function capPlan(block: Patch, width: number): Capped | null {
  const cap = block.cap;
  if (cap === undefined || block.hunks.length < 2) return null; // cells-ok — a hunk count
  if (patchHeight(block, width) <= cap) return null;
  const layout = layoutFor(block, width);
  let rows = 1; // cells-ok — the path header's row
  let shown = 0;
  for (const hunk of block.hunks) {
    const next = hunkRows(hunk, layout);
    // **Whole hunks only** (I14, T3.10): the test is taken before the hunk is
    // admitted, so a hunk that would cross the budget goes whole.
    if (shown > 0 && rows + next + 1 > cap) break;
    rows += next;
    shown += 1;
  }
  const dropped = block.hunks.length - shown; // cells-ok — a hunk count
  return dropped > 0 ? Object.freeze({ shown, dropped }) : null;
}

/** The cap in force: the plan, unless `expanded` set it aside (I11, D13). */
export function capOf(block: Patch, width: number): Capped | null {
  return block.expanded === true ? null : capPlan(block, width);
}

/**
 * The capped form's body — the admitted hunks, what every reader draws above
 * the marker row.
 *
 * **The tail goes**, because `collapsedAfter` elides lines *below the last
 * hunk* and the last hunk is among the dropped ones: drawn here it would claim
 * the file ends after the admitted hunks. The marker replaces it (I14).
 *
 * **The gutter is pinned from the whole block** (I21a): the admitted hunks'
 * widest line number can be narrower than the block's, and expanding would then
 * move every line sideways — the drift the pin exists to prevent, arriving
 * through a toggle rather than a scroll. `cap` and `expanded` are stripped so
 * the body is an ordinary patch every other function already reads.
 */
export function shownBlock(block: Patch, capped: Capped): Patch {
  const { cap: _cap, expanded: _expanded, collapsedAfter: _after, ...rest } = block;
  return { ...rest, hunks: block.hunks.slice(0, capped.shown), numberWidth: numberWidth(block) };
}

/**
 * The fold (C09 I124): `expanded` written as `true` and then **removed**, so
 * collapsing restores the block the producer made rather than one carrying
 * `expanded: false`. A patch with no `cap` has nothing withheld and no fold.
 */
export function foldPatch(block: Patch): Patch | null {
  if (block.cap === undefined) return null;
  if (block.expanded !== true) return { ...block, expanded: true };
  const { expanded: _expanded, ...rest } = block;
  return rest;
}
