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

export function createSearch(
  entriesOf: () => readonly HistoryEntry[],
  nav: Navigator,
): Search {
  let state: SearchState | null = null;

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
      state = Object.freeze({ query, hit: null, failed: false });
      return;
    }
    const hit = find(query, state.hit?.index);
    state = Object.freeze({
      query,
      hit: hit ?? state.hit,
      failed: hit === null,
    });
  }

  return {
    open(current) {
      // The pre-search buffer is stashed here for the same reason `previous`
      // stashes it: accepting a match replaces the buffer, and `↓` past the
      // newest has to have something to give back.
      nav.stash(current);
      state = Object.freeze({ query: "", hit: null, failed: false });
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
      state = Object.freeze({
        query: state.query,
        hit: hit ?? state.hit,
        // At the oldest match there is nothing older, and the label says so —
        // the same word for the same fact, that the last action found nothing new.
        failed: hit === null,
      });
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
