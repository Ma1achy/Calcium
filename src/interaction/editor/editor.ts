/**
 * The buffer, the cursor, and the operations that change them.
 *
 * C17 — see spec. **This renders nothing** (I10): it exposes text, a grapheme
 * cursor and a row count, and L4 composites the prompt from those with C19's
 * ghost text. Keeping rendering out is what makes the editor testable as a pure
 * data structure, and it is why every geometry question takes `width` and
 * `gutter` as parameters rather than holding either.
 *
 * Composed rather than monolithic, and the split is by what each part counts:
 * `graphemes` takes text apart, `words` classifies it, `layout` places it on
 * rows, `undo` groups the edits. Every one of them is a place the by-hand walks
 * found something (§7a, §7b), and none of them knows about the others.
 */

import { clamp, count, removeBetween, sliceBetween, splitAt, stripForBuffer } from "./graphemes.js";
import { cursorCell, displayRows, layout, type Cell, type Gutter } from "./layout.js";
import { classify, wordLeft, wordRight } from "./words.js";
import { History, type Snapshot } from "./undo.js";

export type Motion =
  | "charLeft"
  | "charRight"
  | "wordLeft"
  | "wordRight"
  | "lineStart"
  | "lineEnd"
  | "bufferStart"
  | "bufferEnd";

export interface LineEditor {
  readonly text: string;
  readonly cursor: number;
  readonly lines: readonly string[];

  insert(text: string, opts?: Readonly<{ atomic?: boolean }>): void;
  deleteBackward(): void;
  deleteForward(): void;
  move(motion: Motion): void;
  killTo(motion: Motion): void;
  yank(): void;
  setText(text: string, cursor?: number): void;
  clear(): void;

  undo(): boolean;
  redo(): boolean;

  layout(width: number, gutter: Gutter): readonly string[];
  displayRows(width: number, gutter: Gutter): number;
  cursorCell(width: number, gutter: Gutter): Cell;

  /** The kill buffer, for tests and for C16's diagnostics. Not undo state (I16). */
  readonly killBuffer: string;
}

class Editor implements LineEditor {
  #text = "";
  #cursor = 0;
  #kill = "";
  readonly #history = new History();

  get text(): string {
    return this.#text;
  }

  get cursor(): number {
    return this.#cursor;
  }

  get killBuffer(): string {
    return this.#kill;
  }

  get lines(): readonly string[] {
    return this.#text.split("\n");
  }

  #snapshot(): Snapshot {
    return { text: this.#text, cursor: this.#cursor };
  }

  #apply(s: Snapshot): void {
    this.#text = s.text;
    this.#cursor = clamp(s.cursor, count(s.text));
  }

  /**
   * Insert at the cursor (I9, I15).
   *
   * Control characters are stripped and `\n` survives as structure. `atomic`
   * forces the insertion into a unit of its own that the next keystroke will
   * not merge into — which is how C16 delivers a paste and how a paste of any
   * size is exactly one undo unit (I5).
   *
   * The boundary is decided by the call's **last grapheme**, not by each of
   * them: that is what makes `insert("git ")` and `insert("git")` then
   * `insert(" ")` agree, and what stops `yank` fragmenting a phrase.
   */
  insert(text: string, opts?: Readonly<{ atomic?: boolean }>): void {
    const clean = stripForBuffer(text);
    if (clean === "") return;

    const trailing = [...clean].pop() ?? "";
    const closes = classify(trailing) === "space";
    this.#history.edit(
      this.#snapshot(),
      opts?.atomic === true ? "atomic" : closes ? "insertClosing" : "insert",
    );
    this.#history.endKill();

    const { head, tail } = splitAt(this.#text, this.#cursor);
    this.#text = head + clean + tail;
    this.#cursor += count(clean);
  }

  deleteBackward(): void {
    if (this.#cursor <= 0) return;
    this.#history.edit(this.#snapshot(), "structural");
    this.#history.endKill();
    this.#text = removeBetween(this.#text, this.#cursor - 1, this.#cursor);
    this.#cursor -= 1;
  }

  deleteForward(): void {
    if (this.#cursor >= count(this.#text)) return;
    this.#history.edit(this.#snapshot(), "structural");
    this.#history.endKill();
    this.#text = removeBetween(this.#text, this.#cursor, this.#cursor + 1);
  }

  /**
   * Where a motion lands, as a grapheme index.
   *
   * Exhaustive over `Motion` with no default branch, so adding a motion to the
   * union is a type error here rather than a silent no-op (T2.7).
   */
  #target(motion: Motion): number {
    const total = count(this.#text);
    switch (motion) {
      case "charLeft":
        return Math.max(0, this.#cursor - 1);
      case "charRight":
        return Math.min(total, this.#cursor + 1);
      case "wordLeft":
        return wordLeft(this.#text, this.#cursor);
      case "wordRight":
        return wordRight(this.#text, this.#cursor);
      case "lineStart":
        return this.#lineBounds().start;
      case "lineEnd":
        return this.#lineBounds().end;
      case "bufferStart":
        return 0;
      case "bufferEnd":
        return total;
    }
  }

  /**
   * The current line's bounds, in grapheme indices.
   *
   * `lineStart` and `lineEnd` operate on the line the cursor is in, not on the
   * buffer (T1.9) — which is the whole reason they are distinct from
   * `bufferStart` and `bufferEnd` in a component that supports newlines.
   */
  #lineBounds(): Readonly<{ start: number; end: number }> {
    const total = count(this.#text);
    let start = this.#cursor;
    while (start > 0 && sliceBetween(this.#text, start - 1, start) !== "\n") start -= 1;
    let end = this.#cursor;
    while (end < total && sliceBetween(this.#text, end, end + 1) !== "\n") end += 1;
    return { start, end };
  }

  move(motion: Motion): void {
    this.#history.close();
    this.#history.endKill();
    this.#cursor = clamp(this.#target(motion), count(this.#text));
  }

  /**
   * Cut to the kill buffer (I8, I16).
   *
   * Consecutive kills append — backwards prepends, forwards appends — so two
   * `killTo("wordLeft")` leave both words in order. The run is one undo unit as
   * well as one kill-buffer entry: undoing it returns both words, because a
   * buffer and a stack describing different amounts of text is the shape that
   * cost C14 a blank screen with every assertion passing.
   */
  killTo(motion: Motion): void {
    const to = clamp(this.#target(motion), count(this.#text));
    if (to === this.#cursor) return;

    const cut = sliceBetween(this.#text, this.#cursor, to);
    this.#history.edit(this.#snapshot(), "structural");

    this.#kill = this.#history.killing
      ? to < this.#cursor
        ? cut + this.#kill
        : this.#kill + cut
      : cut;
    this.#history.startKill();

    this.#text = removeBetween(this.#text, this.#cursor, to);
    this.#cursor = Math.min(this.#cursor, to);
  }

  /** One atomic edit (§5). A no-op when nothing has been killed (T3.9). */
  yank(): void {
    if (this.#kill === "") return;
    this.insert(this.#kill, { atomic: true });
  }

  setText(text: string, cursor?: number): void {
    this.#history.edit(this.#snapshot(), "structural");
    this.#history.endKill();
    this.#text = stripForBuffer(text);
    this.#cursor = clamp(cursor ?? count(this.#text), count(this.#text));
  }

  clear(): void {
    this.setText("", 0);
  }

  undo(): boolean {
    const previous = this.#history.undo(this.#snapshot());
    if (previous === null) return false;
    // The kill buffer is not undo state (I16): it is a clipboard, and one that
    // rewound when the user undid something else would be the worse surprise.
    this.#history.endKill();
    this.#apply(previous);
    return true;
  }

  redo(): boolean {
    const next = this.#history.redo(this.#snapshot());
    if (next === null) return false;
    this.#history.endKill();
    this.#apply(next);
    return true;
  }

  layout(width: number, gutter: Gutter): readonly string[] {
    return layout(this.#text, width, gutter);
  }

  displayRows(width: number, gutter: Gutter): number {
    return displayRows(this.#text, width, gutter);
  }

  cursorCell(width: number, gutter: Gutter): Cell {
    return cursorCell(this.#text, this.#cursor, width, gutter);
  }
}

export function createEditor(initial?: Readonly<{ text?: string; cursor?: number }>): LineEditor {
  const editor = new Editor();
  if (initial?.text !== undefined) editor.setText(initial.text, initial.cursor);
  return editor;
}

export type { Cell, Gutter };
