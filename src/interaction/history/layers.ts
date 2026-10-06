/**
 * What C20 puts on screen, as blocks (§5, §6, I13, I14).
 *
 * C20 builds layers; **L4 pushes them and calls `update`** (C15 §2). Narrowing
 * is `update(id, { content })` on each keystroke, never a pop and a re-push:
 * re-pushing churns focus inside the thing being typed into and loses the
 * layer's position under anything stacked above it. C19's menu already narrows
 * through this seam, and using it twice is what keeps `layout()` a pure function
 * of the stack.
 *
 * Content is `Block[]`, so the search prompt is themed, degrades to ASCII and
 * measures through the same registry as the transcript. No colour is named here
 * and no escape sequence is written; both belong to components below.
 */

import { escape } from "./codec.js";
import { type Block, type Layer } from "./deps.js";
import type { Anchor, HistoryEntry, SearchState } from "./types.js";

export const SEARCH_ID = "reverse-search";
export const LIST_ID = "history-list";

/**
 * The header's words: `reverse search  N of M` (I31, §046).
 *
 * `N of M` is the hit's rank among the entries containing the query; a query
 * that matches nothing says so rather than printing `0 of 0`, and an empty one
 * has no figures to give.
 */
export function searchHeader(state: SearchState): string {
  if (state.query === "") return "reverse search";
  if (state.total === 0) return "reverse search  no match";
  return `reverse search  ${String(state.rank)} of ${String(state.total)}`;
}

/**
 * **The upper edge carrying the header, then the list** (I30, I31, §097,
 * §046). *A transient panel floats, between two rules*: the lower one is the
 * prompt's, which C22 I81 draws on every frame, and the upper one is the
 * layer's own first row, as C19's menu draws it — here it also holds the words
 * and the count, so the figure's header costs no row of its own. Without the
 * edge the list sat directly on the transcript's last row and read as more of
 * it (F1502).
 *
 * **The list is C19's form**: a one-column table with `current` on the hit, so
 * the mark, the ground and the degradation are C11's and this file names none
 * (C19 I29). Each row is the command's escaped form, so a multi-line command
 * stays one row — an overlay that grows because the recalled command has three
 * newlines is a search box that moves while you type in it.
 *
 * An empty query has no rows and no table: nothing is shown rather than the
 * whole history, which `/history` is for (§5).
 */
export function searchBlocks(state: SearchState): readonly Block[] {
  const edge = { kind: "rule", id: `${SEARCH_ID}-edge-top`, label: searchHeader(state) } satisfies Block;
  if (state.hit === null) return Object.freeze([edge]);
  const rows = [state.hit.command, ...state.older].map((command, i) => ({
    id: `${SEARCH_ID}-${String(i)}`,
    cells: { value: { text: escape(command) } },
  }));
  const body = {
    kind: "table",
    id: `${SEARCH_ID}-table`,
    columns: [{ key: "value", label: "", align: "left", priority: 1, minWidth: 8, flex: true, sortable: false }],
    rows,
    current: `${SEARCH_ID}-0`,
    showHeader: false,
  } satisfies Block;
  return Object.freeze([edge, body]);
}

/**
 * Anchored to the prompt's whole span, preferring above.
 *
 * `rows` is the prompt's extent rather than 1 for C19's reason: a two-row prompt
 * has no single row that places an overlay correctly, and C15 flips when there
 * is no room above.
 */
export function searchLayer(state: SearchState, anchor: Anchor): Layer {
  return Object.freeze({
    id: SEARCH_ID,
    // **A panel** (C15 §2c, I27, R-BLK-109, R-BLK-323). *search — the prompt
    // stays, the panel grows above it*, and find is a PROMPT SUBSTATE rather
    // than a question: reverse-i-search relabels the prompt, it does not ask
    // anything, and nothing is waiting on an answer from it.
    kind: "panel" as const,
    placement: Object.freeze({
      kind: "anchored" as const,
      row: anchor.row,
      rows: anchor.rows,
      prefer: "above" as const,
    }),
    content: searchBlocks(state),
    blocking: false,
    dismissal: "escape",
    owner: Object.freeze({ rung: "substate" as const, name: "find" as const }),
    // **No `width`, which is how a layer says *the whole region*** (I30, C15
    // I16). It declared `cells(line) + 4`, and the declaration was taken at the
    // push — from the empty query — and never again, because narrowing updates
    // `content` and `cursor`: `⌃r h` over `/help` drew `/h…` in 27 cells, and
    // `his` over `/history` drew `…` alone (F1502). The region's width is
    // resolved at every layout, so the hit is whole wherever it fits.
    // **No cursor** (I31, C22 I157). The query is on the prompt's own line and
    // the caret is the prompt's; a cursor declared here is the one-liner that
    // §046 replaces, and two carets would be one too many.
  });
}

const DAYS_TO_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const;

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * `YYYY-MM-DD HH:MM`, UTC, by arithmetic.
 *
 * `new Date` is banned outside C22 (SS1) and the ban is right even here, where
 * the argument would be a stamp rather than the clock: the pattern cannot tell
 * `new Date()` from `new Date(ts)`, and a rule that has to distinguish them is a
 * rule with a hole. Fifteen lines of arithmetic is the cost, and it is testable
 * without a clock at all.
 */
export function stamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86_400);
  const secs = ((total % 86_400) + 86_400) % 86_400;

  let year = 1970;
  let left = days;
  for (;;) {
    const size = isLeap(year) ? 366 : 365;
    if (left < size) break;
    left -= size;
    year += 1;
  }

  let month = 11;
  for (let m = 11; m >= 0; m -= 1) {
    const offset = (DAYS_TO_MONTH[m] ?? 0) + (m >= 2 && isLeap(year) ? 1 : 0);
    if (left >= offset) {
      month = m;
      left -= offset;
      break;
    }
  }

  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month + 1)}-${pad(left + 1)} ${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}`;
}

/**
 * `/history` as a table whose rows carry `fill` actions (§6, T4.7).
 *
 * `fill` rather than `exec`: a recalled command lands in the buffer for the user
 * to look at before it runs. The listing is committed by L4 like everything
 * else — C20 commits no frame (I15).
 */
export type Listed = Readonly<{ index: number; entry: HistoryEntry }>;

export function listBlocks(rows: readonly Listed[]): readonly Block[] {
  return Object.freeze([
    {
      kind: "table",
      id: LIST_ID,
      columns: [
        { key: "index", label: "#", align: "right", priority: 3, minWidth: 3, sortable: false },
        { key: "when", label: "when", align: "left", priority: 2, minWidth: 16, sortable: false },
        {
          key: "command",
          label: "command",
          align: "left",
          priority: 1,
          minWidth: 8,
          flex: true,
          sortable: false,
        },
      ],
      // The index is the entry's position in `entries`, not the row's position
      // in the listing: `/history 12` has to mean the same thing whether or not
      // `--search` was passed, or the number on screen addresses nothing.
      rows: rows.map(({ index, entry }) => ({
        id: `${LIST_ID}-${String(index)}`,
        cells: {
          index: { text: String(index) },
          when: { text: entry.ts === 0 ? "—" : stamp(entry.ts), tone: "muted" as const },
          // Escaped, so a multi-line command is one row of the table. The
          // `fill` action carries the real text.
          command: { text: escape(entry.command) },
        },
        actions: [{ kind: "fill" as const, label: "fill", command: entry.command }],
      })),
      emptyMessage: "no history",
    } satisfies Block,
  ]);
}
