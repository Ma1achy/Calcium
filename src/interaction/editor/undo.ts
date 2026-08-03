/**
 * Two stacks, structural coalescing, and the kill-append flag.
 *
 * C17 §5, §6, §7, I5, I6, I7, I8, I11, I15, I16 — see spec.
 *
 * **No clock** (I6). Grouping is decided by structure — what the call was and
 * what it inserted — so undo units do not vary with typing speed, tests are
 * deterministic, and SS1 has nothing to fire on. A timeout coalescer is the
 * obvious alternative and it makes the same keystrokes produce different undo
 * behaviour under load.
 *
 * The rule, from §6 and the trace in §7a:
 *
 *   - An `insert` merges into the open unit. A cursor move, any deletion, a
 *     paste, a `setText` and a `clear` close it; the last three are each their
 *     own unit.
 *   - A call whose last grapheme is **whitespace** closes the unit after
 *     merging, so the space joins the word it terminates. Opening a unit for it
 *     instead makes `git commit` three units and undo stops meaning "a word".
 *   - A change of **character class is not a boundary**. `-m` is one unit. The
 *     spec said both and the two readings differ by three units on
 *     `git commit -m`; the class idea belongs to word motion (I13) and the
 *     coupling was the defect.
 *   - Coalescing is per **call**, never per character (I15): `yank`, C19
 *     accepting a candidate and C16 delivering a sequence all arrive as one
 *     call carrying several graphemes, and splitting them breaks a yanked
 *     phrase into a unit per space.
 *
 * A unit is the state *before* the run that opened it, so `undo` restores text
 * and cursor together (T3.13). The kill buffer is deliberately not in it (I16).
 */

/** The undoable state: what a unit restores. */
export type Snapshot = Readonly<{ text: string; cursor: number }>;

/** §6 — beyond this the **oldest** are discarded (I11). */
export const UNDO_LIMIT = 200;

export type Boundary =
  | "insert" // merges, unless the open unit was closed
  | "insertClosing" // an insert whose last grapheme is whitespace
  | "atomic" // a paste, a yank, a completion — its own unit, closed
  | "structural"; // a move, a deletion, setText, clear — closes the open unit

export class History {
  #undo: Snapshot[] = [];
  #redo: Snapshot[] = [];
  /** Whether the unit on top of `#undo` is still accepting merges. */
  #open = false;
  /** §5 — consecutive kills append to one kill-buffer entry and one unit. */
  #killing = false;

  get undoDepth(): number {
    return this.#undo.length; // graphemes-ok
  }

  get redoDepth(): number {
    return this.#redo.length; // graphemes-ok
  }

  get killing(): boolean {
    return this.#killing;
  }

  /**
   * Record that an edit is about to happen, given the state before it.
   *
   * Called before the mutation rather than after, because a unit *is* the prior
   * state. Returning nothing and taking the boundary as data keeps the rule in
   * one place — a caller deciding for itself whether to push is how the two
   * halves of §6 came to disagree in prose.
   */
  edit(before: Snapshot, boundary: Boundary): void {
    // I7 — any new edit clears redo. Before the push, so an edit that merges
    // into an open unit clears it too: the redo stack describes a future that
    // the merge has just made unreachable.
    this.#redo = [];

    // Both insert kinds merge into an open unit; they differ only in what they
    // leave behind. `insertClosing` merging and *then* closing is what makes
    // the space join the word it terminates — pushing a unit for it instead
    // makes `git commit -m` five units rather than three, which is the shape
    // T1.19 caught: the trace asserted text and cursor and said nothing about
    // stack depth, so the sequence replayed correctly over a wrong grouping.
    if ((boundary === "insert" || boundary === "insertClosing") && this.#open) {
      this.#open = boundary === "insert";
      return;
    }

    // A kill run is one unit (I16). The second and later kills of a run merge
    // into the unit the first opened, matching the one kill-buffer entry they
    // produce — undoing a two-kill run returns both words rather than half of
    // what the kill buffer holds.
    //
    // **Not `&& this.#open`**, which was the first version and is wrong: a
    // structural boundary closes the unit, so `#open` is already false when the
    // second kill arrives and every kill in a run would have pushed. `#killing`
    // is the whole condition, and it is only true because a kill already pushed
    // — which is why every other operation calls `endKill()` *before* `edit()`
    // rather than after, or a deletion mid-run would merge into the kill's unit.
    if (boundary === "structural" && this.#killing) return;

    this.#push(before);
    this.#open = boundary === "insert";
  }

  #push(before: Snapshot): void {
    this.#undo.push(before);
    // Oldest first (I11). Discarding the newest would make the most recent edit
    // unrecoverable, which is the one people actually try to undo.
    if (this.#undo.length > UNDO_LIMIT) this.#undo.shift(); // graphemes-ok
  }

  /** A kill has happened; the run continues until something else does. */
  startKill(): void {
    this.#killing = true;
  }

  /** §5, §7 — any non-kill operation ends the run. A flag, not a state. */
  endKill(): void {
    this.#killing = false;
  }

  /** Close the open unit without recording anything — a bare cursor move. */
  close(): void {
    this.#open = false;
  }

  undo(current: Snapshot): Snapshot | null {
    const previous = this.#undo.pop();
    if (previous === undefined) return null;
    this.#redo.push(current);
    this.#open = false;
    return previous;
  }

  redo(current: Snapshot): Snapshot | null {
    const next = this.#redo.pop();
    if (next === undefined) return null;
    this.#undo.push(current);
    this.#open = false;
    return next;
  }
}
