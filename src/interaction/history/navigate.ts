/**
 * The cursor and the draft (§4, I2, I3, I21).
 *
 * `previous` takes the current buffer because of what happens four keystrokes
 * later: someone types half a command, presses `↑` to check something, presses
 * `↓` back past the newest, and gets their half-command back. Losing it is a
 * small thing that feels large, and a nullary `previous` cannot avoid losing it.
 *
 * **The reset is on *user* edits.** Navigation itself causes an edit — L4
 * applies the returned string to C17 — and a reset read literally there means
 * `↑` works exactly once and `↓` never does (§7a Trace 3). C20 cannot tell the
 * two apart because it never sees the editor (I1), so L4 suppresses the reset
 * for the `setText` it performs on C20's behalf.
 */

import type { HistoryEntry } from "./types.js";

export interface Navigator {
  previous(current: string): string | null;
  next(): string | null;
  reset(): void;
  /** The pre-search buffer, stashed by `searchOpen` when navigation has not already (I21). */
  stash(current: string): void;
  /** §7a Trace 1: accepting a search result continues the walk from where the text came from. */
  acceptAt(index: number): void;
  readonly navigating: boolean;
}

export function createNavigator(entriesOf: () => readonly HistoryEntry[]): Navigator {
  let cursor: number | null = null;
  let draft: string | null = null;

  return {
    previous(current) {
      const entries = entriesOf();
      // Empty history stashes nothing (T3.5): there is no walk to return from,
      // and a stashed draft with no cursor would be restored by a `next` that
      // should answer null.
      if (entries.length === 0) return null;
      if (cursor === null) {
        draft = current;
        cursor = entries.length - 1;
      } else if (cursor > 0) {
        cursor -= 1;
      }
      return entries[cursor]?.command ?? null;
    },

    next() {
      const entries = entriesOf();
      if (cursor === null) return null;
      if (cursor >= entries.length - 1) {
        // Past the newest: the draft, then idle. `""` is a draft like any other
        // (T3.6) — the distinction that matters is stashed versus not, and that
        // is what `null` carries.
        const stashed = draft ?? "";
        cursor = null;
        draft = null;
        return stashed;
      }
      cursor += 1;
      return entries[cursor]?.command ?? null;
    },

    reset() {
      cursor = null;
      draft = null;
    },

    stash(current) {
      if (cursor === null && draft === null) draft = current;
    },

    acceptAt(index) {
      cursor = index;
    },

    get navigating() {
      return cursor !== null;
    },
  };
}
