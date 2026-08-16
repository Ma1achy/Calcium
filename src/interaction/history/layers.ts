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
import { cells, type Block, type Layer } from "./deps.js";
import type { Anchor, HistoryEntry, SearchState } from "./types.js";

export const SEARCH_ID = "reverse-search";
export const CONFIRM_ID = "history-clear-confirm";
export const LIST_ID = "history-list";

/** Padding either side plus C15's border, as C19's menu reckons it. */
const CHROME_CELLS = 4;

/**
 * The prompt line.
 *
 * The match is shown in its **escaped** form, so a multi-line command stays one
 * row: an overlay that grows to four rows because the recalled command has three
 * newlines is a search box that moves while you type in it.
 */
export function searchLine(state: SearchState): string {
  const label = state.failed ? "(failed reverse-i-search)" : "(reverse-i-search)";
  const match = state.hit === null ? "" : escape(state.hit.command);
  return `${label} \`${state.query}': ${match}`;
}

export function searchBlocks(state: SearchState): readonly Block[] {
  return Object.freeze([
    { kind: "raw", id: `${SEARCH_ID}-line`, text: searchLine(state) } satisfies Block,
  ]);
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
    kind: "overlay" as const,
    placement: Object.freeze({
      kind: "anchored" as const,
      row: anchor.row,
      rows: anchor.rows,
      prefer: "above" as const,
    }),
    content: searchBlocks(state),
    dismissable: true,
    width: cells(searchLine(state)) + CHROME_CELLS,
    // **The search has a cursor and the menu does not** (C15 I19). Text is
    // being typed into this one, and leaving the terminal's cursor blinking at
    // a prompt that is not taking keys is the *somewhere invisible* symptom
    // derived focus exists to prevent.
    //
    // At the end of the query rather than of the line: the match after it is
    // the history's text, not the user's, and a caret sitting after a recalled
    // command claims the recall is editable here. Relative to the layer's own
    // origin, which is what lets this be stated without knowing where the
    // layer will be placed.
    cursor: Object.freeze({ row: 0, col: cells(queryPrefix(state)) }),
  });
}

/** Everything before the caret on the search line — the label and the query. */
function queryPrefix(state: SearchState): string {
  const label = state.failed ? "(failed reverse-i-search)" : "(reverse-i-search)";
  return `${label} \`${state.query}`;
}

/**
 * The confirm, frozen non-dismissable (I14).
 *
 * **It declared no width and C15 I20 refuses that now.** A centred layer with
 * no width is placed at `left = 0` across the whole region — `fill`, wearing
 * `centred`'s name — and this was the second instance in the tree, found by the
 * rule rather than by reading. The number is the question's own extent, as
 * `searchLayer` reckons it: nothing else here can measure content, and C15 knows
 * the region and nothing else (C15 I16).
 *
 * C15 already guarantees the behaviour — `pop()` inspects only the top layer and
 * returns `null` without removing a non-dismissable one, and C16's single
 * `overlay:escape → dismiss` row respects that. What was left to get wrong is
 * the layer handed over, which is why this is a function with no `dismissable`
 * argument rather than a call site's decision.
 */
export function clearConfirmLayer(count: number): Layer {
  return Object.freeze({
    id: CONFIRM_ID,
    kind: "overlay" as const,
    placement: Object.freeze({ kind: "centred" as const }),
    content: Object.freeze([
      {
        kind: "notice",
        id: `${CONFIRM_ID}-text`,
        tone: "warn",
        glyph: "warn",
        text: clearQuestion(count),
      } satisfies Block,
    ]),
    dismissable: false,
    width: cells(clearQuestion(count)) + CHROME_CELLS,
  });
}

/** The question, in one place, because the width is measured from it. */
function clearQuestion(count: number): string {
  return `Clear ${String(count)} history ${count === 1 ? "entry" : "entries"}? (y/N)`;
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
