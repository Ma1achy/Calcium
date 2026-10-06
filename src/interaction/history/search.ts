/**
 * Reverse search (§5, I22, I23).
 *
 * Substring, case-insensitive, most-recent-first. Typing narrows, another `⌃r`
 * steps to an older match, and an empty query shows nothing rather than the
 * whole history — a full listing is `/history`.
 *
 * **A search action that finds nothing sets `failed` and keeps what it had.**
 * The two obvious alternatives are both wrong and §7a Trace 2 is where that
 * showed: dropping the hit means one typo silently undoes a walk to the oldest
 * match, and keeping it silently means the overlay prints a line that does not
 * contain the query printed above it. The label is what makes the retained line
 * honest.
 */

import type { Navigator } from "./navigate.js";
import type { HistoryEntry, SearchAction, SearchHit, SearchState } from "./types.js";

export interface Search {
  open(current: string): void;
  type(text: string): void;
  backspace(): void;
  older(): void;
  end(action: SearchAction): string | null;
  cancel(): void;
  find(query: string, from?: number): SearchHit | null;
  readonly state: SearchState | null;
}

/** The older matches the list shows after the hit (I31). */
const LIST_OLDER = 2;

export function createSearch(
  entriesOf: () => readonly HistoryEntry[],
  nav: Navigator,
): Search {
  let state: SearchState | null = null;

  /**
   * The state, with the list's figures taken from the entries as they are now.
   *
   * **Matches, not entries** (I31): the header says `3 of 214` about the
   * lines containing the query. The window below the hit is the next matches,
   * which are not the entries beside it — `/ps` between two `h` hits is none.
   * A retained hit that no longer matches (`failed`) has no rank, and the
   * total is then the truth about the query: none.
   */
  function make(query: string, hit: SearchHit | null, failed: boolean): SearchState {
    const needle = query.toLowerCase();
    const matched: number[] = [];
    if (needle !== "") {
      entriesOf().forEach((e, i) => {
        if (e.command.toLowerCase().includes(needle)) matched.push(i);
      });
    }
    const at = hit === null ? -1 : matched.indexOf(hit.index);
    const older = at < 0 ? [] : matched.slice(0, at).reverse().slice(0, LIST_OLDER);
    return Object.freeze({
      query,
      hit,
      failed,
      total: matched.length,
      rank: at < 0 ? 0 : matched.length - at,
      older: Object.freeze(older.map((i) => entriesOf()[i]?.command ?? "")),
    });
  }

  function find(query: string, from?: number): SearchHit | null {
    if (query === "") return null;
    const entries = entriesOf();
    const needle = query.toLowerCase();
    const start = Math.min(from ?? entries.length - 1, entries.length - 1);
    for (let i = start; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry !== undefined && entry.command.toLowerCase().includes(needle)) {
        return Object.freeze({ command: entry.command, index: i });
      }
    }
    return null;
  }

  /** Narrowing resumes from the retained hit, so a walk survives a typo and a backspace (I22). */
  function renarrow(query: string): void {
    if (state === null) return;
    if (query === "") {
      state = make(query, null, false);
      return;
    }
    const hit = find(query, state.hit?.index);
    state = make(query, hit ?? state.hit, hit === null);
  }

  return {
    open(current) {
      // The pre-search buffer is stashed here for the same reason `previous`
      // stashes it: accepting a match replaces the buffer, and `↓` past the
      // newest has to have something to give back.
      nav.stash(current);
      state = make("", null, false);
    },

    type(text) {
      if (state === null) return;
      renarrow(state.query + text);
    },

    backspace() {
      if (state === null) return;
      renarrow(state.query.slice(0, -1));
    },

    older() {
      if (state === null) return;
      const hit = state.hit === null ? null : find(state.query, state.hit.index - 1);
      // At the oldest match there is nothing older, and the header says so —
      // the same word for the same fact, that the last action found nothing new.
      state = make(state.query, hit ?? state.hit, hit === null);
    },

    end(action) {
      const hit = state?.hit ?? null;
      state = null;
      if (action === "cancel" || hit === null) return null;
      if (action === "accept") nav.acceptAt(hit.index);
      // The command captured when the hit was found, never `entries[index]`
      // (I23). One line, and the index-invalidation class cannot come back when
      // L4 grows a path that appends while a search is open.
      return hit.command;
    },

    cancel() {
      state = null;
    },

    find,

    get state() {
      return state;
    },
  };
}
