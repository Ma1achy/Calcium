/**
 * C25 §3d, I24 — every numbered diff line is one `row` element, placed where
 * `render` draws it.
 *
 * **The rows are counted in the order `render` emits them** — the path header,
 * then per hunk the collapse marker where there is one, the hunk header and its
 * lines — which is the same walk `window.ts`'s `rowsOf` takes. A second row
 * model is how the focus ring and the frame come to disagree; this one reads the
 * same `changedRuns` pairing the split layout draws (I10).
 *
 * **Computed per call and never cached** (I7). T2.4 asserts `patch/` holds no
 * module state, so a memo inside the kind is the one answer ruled out; the
 * callers ask on navigation and for the selection spans, not per frame.
 */
import { changedRuns, normaliseWidth } from "../../data/viewmodel/index.js";
import { isCollapsed, layoutFor } from "./height.js";
import { MARKERS } from "./lines.js";
import type { Hunk, Patch } from "../../data/viewmodel/index.js";
import type { NavElement } from "../blocks/types.js";

type Line = Hunk["lines"][number];

/**
 * A line's element id, or `null` where it has none (I24).
 *
 * **The numbers, never the position.** A window hands the transcript a smaller
 * `Patch` whose first hunk is wherever the window starts (§3c), so `h0:1` names
 * a different line in every slice and C26 I7's agreement fails on the first
 * offset that drops a hunk. A window carries its lines verbatim (I21), so
 * `oldNo:newNo` is one string in the whole and in every window.
 *
 * A line missing the number its kind needs cannot be addressed stably, so it is
 * not addressed at all.
 */
export function lineId(line: Line): string | null {
  if (line.kind === "remove") return line.oldNo === undefined ? null : `${String(line.oldNo)}:`;
  if (line.kind === "add") return line.newNo === undefined ? null : `:${String(line.newNo)}`;
  return line.oldNo === undefined || line.newNo === undefined
    ? null
    : `${String(line.oldNo)}:${String(line.newNo)}`;
}

export function patchElements(block: Patch, width: number): readonly NavElement[] {
  const w = Math.max(1, Math.floor(normaliseWidth(width)));
  const layout = layoutFor(block, w);
  // `patchLayout`'s `perSide`: the separator is the cell at `side`. **The right
  // half stops at `2 · side + 1`**, not at `w` — at an even width the last cell
  // is `line()`'s padding, dressed as the row and not as either side (§3d).
  const side = Math.floor((w - 1) / 2);
  const WHOLE = { from: 0, to: w };
  const LEFT = { from: 0, to: side };
  const RIGHT = { from: side + 1, to: 2 * side + 1 };

  const out: NavElement[] = [];
  const seen = new Set<string>();
  const place = (line: Line | undefined, row: number, cols: Readonly<{ from: number; to: number }>): void => {
    if (line === undefined || cols.from >= cols.to) return;
    const id = lineId(line);
    // **A repeated id keeps its first line** (I24): a producer numbering two
    // lines alike would otherwise break C26 I6 for the whole block.
    if (id === null || seen.has(id)) return;
    seen.add(id);
    out.push(
      Object.freeze({
        id,
        level: "row" as const,
        rows: Object.freeze({ from: row, to: row + 1 }),
        cols: Object.freeze({ ...cols }),
        // As unified diff, the block's own copy one line at a time (C09 I86).
        copy: `${MARKERS[line.kind]}${line.text}`,
      }),
    );
  };

  let row = 1; // cells-ok — a row cursor; row 0 is the path header
  for (const hunk of block.hunks) {
    if (isCollapsed(hunk.collapsedBefore)) row += 1;
    row += 1; // the hunk header
    if (layout === "unified") {
      for (const line of hunk.lines) place(line, row++, WHOLE);
      continue;
    }
    for (const group of changedRuns(hunk.lines)) {
      if ("kind" in group) {
        // A context row is one line drawn twice, so one element across the row.
        place(group, row++, WHOLE);
        continue;
      }
      const height = Math.max(group.removes.length, group.adds.length); // cells-ok — a row count
      for (let i = 0; i < height; i += 1) {
        place(group.removes[i], row, LEFT);
        place(group.adds[i], row, RIGHT);
        row += 1;
      }
    }
  }
  return Object.freeze(out);
}
