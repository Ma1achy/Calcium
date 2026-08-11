/**
 * C25 §3c — a window of a patch, for the fullscreen view.
 *
 * **A window is a `Patch`, not a list of rows** (I18). `Layer.content` is
 * `Block[]`, so the owner of a pushed view cannot hand C15 a slice of rendered
 * output — it hands back a smaller block, and C15 measures and draws it through
 * the same registry as everything else. Everything awkward here follows from
 * that one fact.
 *
 * It lives beside `height.ts` rather than in `shell/` because it is *the same
 * arithmetic*: a window that disagreed with `pairedRows` about what a row is
 * would be a viewport that drifts, which is the failure I1 exists to prevent.
 * The function is pure and holds no state, so C25 I7 is untouched — the view's
 * state is one offset and it lives with the view (C22 I41).
 *
 * **Two rows of §3c's table are the whole design:**
 *
 * The path header and every touched hunk's header are **sticky, and forced
 * rather than chosen** — `patchHeight` always counts one of the first and
 * `hunkRows` always counts one of the second, and no field suppresses either.
 * So a window is a slice *plus* its headers, and they come out of the budget.
 *
 * And in split layout a cut inside a run of changed lines **invents a row**
 * (I19). The illustration's hunk is seven rows split; cut between its removed
 * line and its two added ones, the halves measure 1 + 2 against the whole run's
 * 2. So windows are assembled from whole *units* — a context line, or a maximal
 * run of changed lines — and never from arbitrary line offsets.
 */
import type { Hunk, Patch } from "../../data/viewmodel/index.js";
import { block } from "../../data/viewmodel/index.js";
import { isCollapsed, layoutFor, pairedRows, patchHeight, type Layout } from "./height.js";
import { numberWidth } from "./layout.js";

/**
 * The smallest thing a window may cut at.
 *
 * Unified: one line, one row. Split: a context line is one row, and a maximal
 * run of changed lines is `max(removes, adds)` rows that cannot be divided.
 * **The unified case is not a special case of the split one** — it is the same
 * walk with every line its own unit, which is why this returns units rather
 * than branching at the call sites.
 */
type Unit = Readonly<{ lineFrom: number; lineTo: number; rows: number }>;

function unitsOf(hunk: Hunk, layout: Layout): readonly Unit[] {
  const lines = hunk.lines;
  if (layout === "unified") {
    return lines.map((_, i) => ({ lineFrom: i, lineTo: i + 1, rows: 1 }));
  }

  const units: Unit[] = [];
  let runFrom = -1;
  for (let i = 0; i < lines.length; i += 1) {  // cells-ok — a line count, not a width
    const isContext = lines[i]?.kind === "context";
    if (isContext) {
      if (runFrom >= 0) {
        units.push({ lineFrom: runFrom, lineTo: i, rows: pairedRows(lines.slice(runFrom, i)) });
        runFrom = -1;
      }
      units.push({ lineFrom: i, lineTo: i + 1, rows: 1 });
      continue;
    }
    if (runFrom < 0) runFrom = i;
  }
  if (runFrom >= 0) {
    units.push({ lineFrom: runFrom, lineTo: lines.length, rows: pairedRows(lines.slice(runFrom)) });  // cells-ok — a line count, not a width
  }
  return units;
}

/** One entry per row of the full rendering, in order. */
type Row =
  | Readonly<{ kind: "path" }>
  | Readonly<{ kind: "marker"; hunk: number }>
  | Readonly<{ kind: "header"; hunk: number }>
  | Readonly<{ kind: "body"; hunk: number; unit: Unit; first: boolean }>
  | Readonly<{ kind: "tail" }>;

/**
 * The full rendering as rows, which is what makes an offset mean something.
 *
 * A unit taller than one row appears once per row it occupies, with `first`
 * marking the row a window may begin at — so a caller can address any row and
 * the snapping rule below has something to snap to.
 */
function rowsOf(patch: Patch, layout: Layout): readonly Row[] {
  const rows: Row[] = [{ kind: "path" }];
  patch.hunks.forEach((hunk, h) => {
    if (isCollapsed(hunk.collapsedBefore)) rows.push({ kind: "marker", hunk: h });
    rows.push({ kind: "header", hunk: h });
    for (const unit of unitsOf(hunk, layout)) {
      for (let r = 0; r < unit.rows; r += 1) {
        rows.push({ kind: "body", hunk: h, unit, first: r === 0 });
      }
    }
  });
  if (isCollapsed(patch.collapsedAfter)) rows.push({ kind: "tail" });
  return rows;
}

/**
 * The height of a patch — the full rendering's, or a window's.
 *
 * One function for both, deliberately. A separate `windowHeight` was written
 * first and was `patchHeight` transcribed, which is the drift MG20 exists to
 * catch: a window measured by different code from the block it came from is a
 * window that can disagree with `measure` about what a row is, and I1 is the
 * invariant that cannot bend. A window **is** a `Patch` (I18), so it measures
 * like one.
 */
export function totalRows(patch: Patch, width: number): number {
  return patchHeight(patch, width);
}

/**
 * The row each hunk's header occupies in the full rendering — what `n` and `p`
 * move between (C22 I41).
 *
 * Returned as rows rather than as hunk indices because **the view holds one
 * piece of state and it is an offset** (§3c A4). A hunk index beside it is a
 * second cursor, and `G` leaves it pointing at the hunk the reader scrolled away
 * from.
 */
export function hunkHeaderRows(patch: Patch, width: number): readonly number[] {
  const layout = layoutFor(patch, width);
  const out: number[] = [];
  rowsOf(patch, layout).forEach((row, i) => {
    if (row.kind === "header") out.push(i);
  });
  return Object.freeze(out);
}

/**
 * The last offset worth sitting at — the first one whose window reaches the end.
 *
 * **`total - height` is wrong, and the suite found it rather than the walk.**
 * That figure is arithmetic over the *full* rendering, and a window is a slice
 * plus sticky headers (I18): the headers cost rows the full rendering already
 * counted once, so a window opened at `total - height` stops short and the last
 * rows of the diff — including `collapsedAfter`, which says how much file is
 * below — are unreachable. A reader would press `G` and not see the bottom.
 *
 * Reaching the end is monotone in the offset, so this is a binary search over
 * the same builder rather than a second arithmetic that could disagree with it.
 */
function bottomOffset(patch: Patch, width: number, height: number): number {
  const rows = rowsOf(patch, layoutFor(patch, width));
  if (rows.length === 0) return 0;  // cells-ok — a row count, not a width
  // Searched over the rows a window may *begin* at, so the answer is itself a
  // valid offset and needs no snapping afterwards.
  const starts = rows.flatMap((r, i) => (r.kind === "body" && !r.first ? [] : [i]));
  if (starts.length === 0) return 0;  // cells-ok — a row count, not a width
  let lo = 0;
  let hi = starts.length - 1;  // cells-ok — a row count, not a width
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (build(patch, width, starts[mid] ?? 0, height).reachedEnd) hi = mid;
    else lo = mid + 1;
  }
  return starts[lo] ?? 0;
}

/**
 * The offset a window will actually sit at: inside the document, and at a row a
 * window may **begin** at.
 *
 * **The snap belongs here rather than inside the builder, and a mutation is what
 * said so.** Disabling a snap that lived in the builder failed every test,
 * including a reachability sweep — because the builder skips interior rows of a
 * unit anyway, so the only difference was whether a mid-unit offset showed its
 * run or stepped over it, and both leave every line reachable from *some*
 * offset.
 *
 * Asking which of the two was right showed the question was wrong. Snapping down
 * in the builder means `↓` from the row before a two-row run redraws the same
 * window — a dead keystroke. Snapping up means the offset the caller holds and
 * the window it produces disagree, so `PgDn` twice does not move two pages.
 * **The offset should never be mid-unit at all**: a valid offset is a row a
 * window may begin at, every motion lands on one, and one press moves one unit.
 * That is what `less` does with a wrapped line, and it makes the builder's input
 * a precondition rather than something it repairs.
 */
export function clampOffset(patch: Patch, width: number, height: number, offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  const wanted = Math.max(0, Math.trunc(offset));
  if (wanted === 0) return 0;
  const rows = rowsOf(patch, layoutFor(patch, width));
  const bottom = bottomOffset(patch, width, height);
  // Snap first, then bound. Bounding first and snapping after can move the
  // ceiling *below* the offset that reaches the end, which puts the bottom of
  // the document out of reach again — the same defect this ceiling was written
  // to fix, arriving through the repair for a different one.
  return Math.min(bottom, snapDown(rows, wanted));
}

/**
 * The window at `offset`, at most `height` rows tall.
 *
 * **Snapped down, never up.** An offset landing inside a multi-row unit moves
 * back to that unit's first row: forward would hide the run's opening line, and
 * a diff whose first visible row is the middle of a change is worse than one
 * that starts a row early.
 */
export function windowPatch(patch: Patch, width: number, offset: number, height: number): Patch {
  return build(patch, width, clampOffset(patch, width, height, offset), height).patch;
}


/**
 * The builder both `windowPatch` and `bottomOffset` use.
 *
 * `reachedEnd` is why it is shared: the ceiling on an offset is "the window
 * shows the last row", and computing that from anything but the builder itself
 * is how two answers about the same window come to disagree.
 */
function build(
  patch: Patch,
  width: number,
  rawOffset: number,
  height: number,
): Readonly<{ patch: Patch; reachedEnd: boolean }> {
  const layout = layoutFor(patch, width);
  const rows = rowsOf(patch, layout);
  // A precondition, not a repair: `clampOffset` owns the snap (see above).
  const start = Math.max(0, Math.min(rawOffset, Math.max(0, rows.length - 1)));  // cells-ok — a row count, not a width

  // The path header is sticky and comes out of the budget before anything else
  // (I18). A region with one row can show it and nothing more, which is a
  // legitimate window rather than an error.
  let budget = Math.max(1, height) - 1;

  const kept = new Map<number, { lineFrom: number; lineTo: number; marker: boolean }>();
  let tail = false;
  let consumed = start;

  for (let i = start; i < rows.length && budget > 0; i += 1) {  // cells-ok — a row count, not a width
    consumed = i;
    const row = rows[i];
    if (row === undefined) break;

    if (row.kind === "tail") {
      tail = true;
      budget -= 1;
      continue;
    }
    if (row.kind === "path") continue;

    const entry = kept.get(row.hunk);
    if (entry === undefined) {
      // First row of this hunk in the window. Its header is sticky too, and it
      // is paid for here whether or not the header's own row is in range —
      // which is what makes a window that opens mid-hunk cost two rows before
      // it shows a line of the diff.
      if (budget < 1) break;
      budget -= 1;
      kept.set(row.hunk, { lineFrom: -1, lineTo: -1, marker: false });
    }
    const cur = kept.get(row.hunk);
    if (cur === undefined) break;

    if (row.kind === "marker") {
      // Only when the window actually reaches the marker's row (I20). A marker
      // carried onto every window claims the elision sits at the top of each.
      if (budget < 1) break;
      cur.marker = true;
      budget -= 1;
      continue;
    }
    if (row.kind === "header") continue; // already paid for above

    if (!row.first) continue; // interior row of a unit already taken, or skipped
    if (row.unit.rows > budget) break; // whole units only (I19)
    budget -= row.unit.rows;
    if (cur.lineFrom < 0) cur.lineFrom = row.unit.lineFrom;
    cur.lineTo = row.unit.lineTo;
  }

  const hunks: Hunk[] = [];
  for (const [h, cur] of kept) {
    const source = patch.hunks[h];
    if (source === undefined) continue;
    const from = cur.lineFrom < 0 ? 0 : cur.lineFrom;
    const to = cur.lineTo < 0 ? 0 : cur.lineTo;
    hunks.push({
      // Verbatim (I21). Rewriting the counts to describe the slice would make
      // C25 compute from the one field §4 says it never reads.
      header: source.header,
      lines: source.lines.slice(from, to),
      ...(cur.marker && source.collapsedBefore !== undefined
        ? { collapsedBefore: source.collapsedBefore }
        : {}),
    });
  }

  const windowed = block({
    kind: "patch",
    id: patch.id,
    path: patch.path,
    language: patch.language,
    hunks,
    ...(tail && patch.collapsedAfter !== undefined ? { collapsedAfter: patch.collapsedAfter } : {}),
    ...(patch.layout !== undefined ? { layout: patch.layout } : {}),
    // **C25 I21a — the gutter is the parent's, pinned.** Exactly `Hunk.header`'s
    // rule one field along (I21): a window describes the block it came from, not
    // the slice it shows. Derived again inside the window it shrinks whenever the
    // slice's widest line number is narrower, and every row of text steps
    // sideways as the reader scrolls — 4 cells whole against 1 at offset 0 on the
    // patch that measured it.
    //
    // Taken from `patch` and never from `hunks`, which is the whole point, and
    // read through `numberWidth` so a parent that is *itself* a window passes its
    // pin down rather than re-deriving from a slice of a slice.
    numberWidth: numberWidth(patch),
  } as Patch);

  return { patch: windowed, reachedEnd: consumed >= rows.length - 1 };  // cells-ok — a row count, not a width
}

/** Back to the first row of whatever unit `offset` landed in. */
function snapDown(rows: readonly Row[], offset: number): number {
  let i = Math.min(offset, Math.max(0, rows.length - 1));  // cells-ok — a row count, not a width
  while (i > 0) {
    const row = rows[i];
    if (row === undefined || row.kind !== "body" || row.first) break;
    i -= 1;
  }
  return i;
}
