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

/** A pasted block, standing in the buffer as one grapheme (roadmap 30). */
export type Chip = Readonly<{ label: string; content: string }>;

export interface LineEditor {
  /**
   * The buffer **as it is**, sentinels and all.
   *
   * **A resolving getter is refused, and the reason is here because no assertion
   * shows it** (roadmap 30 §8a). Expanding chips to their content here is the
   * obvious implementation — every reader keeps seeing a plain string and no
   * sentinel escapes — and it is wrong: three of this member's readers pass a
   * **buffer index** alongside it (`contextAt` at `keys.ts:293` and `:563` and
   * `session.ts:579`, `selectionSpans` at `session.ts:549`), and `cursor`,
   * `anchor` and `head` index the raw buffer. The moment a chip precedes one of
   * them the pair disagrees: completion completes at the wrong offset and the
   * wash paints the wrong run, **both silently and both only in a frame.**
   *
   * A chip-only buffer is why it reads as harmless — `text.length > 0` is true
   * under either reading, and so is every other assertion anyone would write.
   *
   * **So resolution happens at the submission site and nowhere else.**
   */
  readonly text: string;
  /**
   * The buffer with every chip replaced by its content (roadmap 30).
   *
   * **One caller, by construction**: the submission. C23 takes a string, C18
   * classifies a string and C05 describes `argv`, so a chip becomes its content
   * on the way out — the far side receives argv either way, and a manifest
   * carrying a block would be four components' work to deliver something the
   * transport cannot take.
   */
  readonly resolved: string;
  /** What a cluster draws as, for the walk. `undefined` for ordinary text. */
  readonly drawAs: (cluster: string) => string | undefined;
  readonly cursor: number;
  readonly lines: readonly string[];

  insert(text: string, opts?: Readonly<{ atomic?: boolean }>): void;
  /**
   * A pasted block as one grapheme (roadmap 30).
   *
   * Inserted through `insert`, so undo, coalescing and the region behave exactly
   * as they do for typing — the sentinel is a character to every one of them,
   * which is the whole of what *one grapheme to the editor* buys.
   */
  insertChip(chip: Chip): void;
  deleteBackward(): void;
  deleteForward(): void;
  move(motion: Motion): void;
  /**
   * The same motion with the anchor held (§5b, I21).
   *
   * **One line different from `move`, and that is the design.** Both compute
   * their target through the same private function, so there is no second
   * implementation of any motion to drift — and a shifted form that moved the
   * anchor would be right on the first keystroke and wrong on the second,
   * which no single-motion test can see.
   */
  extend(motion: Motion): void;
  /** The degenerate case of a region: the whole buffer (§5b). */
  selectAll(): void;
  /**
   * Drop the region and move nothing (§5b, I23).
   *
   * **The one collapse that is neither a motion nor an edit.** Every other
   * collapse happens because something moved — `move` collapses by moving the
   * caret, an edit by replacing the region, `undo` by restoring text. Copy mode
   * needs the region gone with the caret where it is (F765: `#setCopyMode(true)`
   * left `selection` standing and nothing here could clear it), so this drops
   * the anchor and touches nothing else — not the text, not the history, not
   * the kill run. A version written as `move("charLeft")` is right about the
   * region and wrong about the caret, which is what T1.42 reads.
   */
  collapse(): void;
  /**
   * The region, or `null` (I21).
   *
   * **`anchor === head` is `null`, not an empty region.** The caret has one
   * spelling, which is what stops two states meaning the same thing.
   */
  readonly selection: Readonly<{ anchor: number; head: number }> | null;
  /** The selected text, or `""`. What `copy` reads. */
  readonly selected: string;
  /**
   * Copy the region into the kill buffer (§5a).
   *
   * **One clipboard, not two.** §5 already calls the kill buffer a clipboard
   * and already rules on it — *a paste target that silently rewound when the
   * user undid something else would be a worse surprise than the one it
   * prevents* — so a second store would need that ruling restated and would
   * leave the reader with two paste targets under one paste key. `⌃k` then `y`
   * then `⌃y` yanks what `y` copied.
   *
   * **Replaces rather than appending**, and ends any kill run: §5's append is
   * about a run of deletions building one entry, and a copy is not a deletion.
   * Two copies in a row leave the second.
   *
   * **Not an undo unit**, which is §5's reason inverted: a copy changes no
   * text, so there is nothing for undo to restore.
   */
  copy(): void;
  /**
   * Put arbitrary text in the clipboard (§5a).
   *
   * **The primitive `copy` is written in terms of**, and it exists because the
   * clipboard is one and the transcript's copy is not the editor's. `y` on a
   * focused element copies what the element *is*, and that text never passes
   * through the buffer — but it lands in the same place `⌃y` reads, or there
   * are two paste targets under one paste key.
   */
  copyText(text: string): void;
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
  /**
   * Stack depths, for diagnostics and for §7a's trace (C16's `lastStages`
   * precedent). The trace's table has an undo column and a redo column, and a
   * replay that asserts only text and cursor passes over a wrong grouping —
   * which is exactly what happened before T1.19 was written.
   */
  readonly undoDepth: number;
  readonly redoDepth: number;
}

/**
 * The Private Use Area, one code point per chip.
 *
 * **One code point is one grapheme**, which is the property the design rests on:
 * `count`, `splitAt`, `sliceBetween`, `removeBetween`, `wordLeft` and
 * `wordRight` are grapheme-indexed, so a chip is a character to every one of
 * them and none has to learn what a chip is.
 *
 * PUA rather than U+FFFC, and it is identity rather than taste: `OBJECT
 * REPLACEMENT CHARACTER` is one code point for every chip, so two chips in one
 * buffer would be indistinguishable and the side map could not be keyed.
 */
const CHIP_BASE = 0xe000;

class Editor implements LineEditor {
  #text = "";
  #cursor = 0;
  /** Sentinel → the block it stands for. Never pruned: see `drawAs`. */
  readonly #chips = new Map<string, Chip>();
  #nextChip = 0;
  /** §5b — the only new state; the head is `#cursor` itself (I21). */
  #anchor: number | null = null;
  #kill = "";
  readonly #history = new History();

  get text(): string {
    return this.#text;
  }

  get resolved(): string {
    let out = "";
    for (const ch of this.#text) out += this.#chips.get(ch)?.content ?? ch;
    return out;
  }

  /**
   * **Not pruned when a chip is deleted**, and that is deliberate. Undo restores
   * the sentinel — `#apply` replaces the whole buffer — so a map that forgot on
   * deletion would restore a character standing for nothing, which draws as a
   * PUA box and resolves to itself on submission. It is bounded by the chips
   * pasted into one prompt, and the prompt is cleared on every submit.
   */
  readonly drawAs = (cluster: string): string | undefined =>
    this.#chips.get(cluster)?.label;

  get cursor(): number {
    return this.#cursor;
  }

  get killBuffer(): string {
    return this.#kill;
  }

  get undoDepth(): number {
    return this.#history.undoDepth;
  }

  get redoDepth(): number {
    return this.#history.redoDepth;
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
    // **A region does not survive an undo** (I22) — I16 inverted. The kill
    // buffer is a clipboard and survives; a region is a statement about where
    // the caret is, and the caret has just moved to somewhere else entirely.
    this.#anchor = null;
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
    // Before `edit`, not after: `edit` reads the kill-run flag to decide
    // whether this joins the run's unit, so ending the run afterwards would let
    // a keystroke merge into the kill it interrupted.
    this.#history.endKill();
    // **The snapshot is taken before the region goes, and once** (I22). Typing
    // over a selection is one undo unit covering both the removal and the
    // insertion; two units would let `undo` restore a buffer with the region
    // already deleted, which reads as an undo that did half the job.
    //
    // `structural`, not `insert`: a replacement is not typing that should
    // coalesce with what follows it.
    const hadSelection = this.selection !== null;
    this.#history.edit(
      this.#snapshot(),
      hadSelection ? "structural" : opts?.atomic === true ? "atomic" : closes ? "insertClosing" : "insert",
    );
    this.#takeSelection();

    const { head, tail } = splitAt(this.#text, this.#cursor);
    this.#text = head + clean + tail;
    this.#cursor += count(clean);
  }

  insertChip(chip: Chip): void {
    const sentinel = String.fromCodePoint(CHIP_BASE + this.#nextChip);
    this.#nextChip += 1;
    this.#chips.set(sentinel, chip);
    // `atomic`, because a chip is its own unit of undo — the argument `undo.ts`
    // makes for a paste, which is what this is.
    this.insert(sentinel, { atomic: true });
  }

  deleteBackward(): void {
    // **The region, or a character — never both** (I22). Deleting the region
    // *and* the grapheme before it is the natural implementation and is
    // indistinguishable from the correct one when the region is one grapheme
    // wide, which is why T1.29 uses three.
    if (this.selection !== null) {
      this.#history.endKill();
      this.#history.edit(this.#snapshot(), "structural");
      this.#takeSelection();
      return;
    }
    if (this.#cursor <= 0) return;
    this.#history.endKill();
    this.#history.edit(this.#snapshot(), "structural");
    this.#text = removeBetween(this.#text, this.#cursor - 1, this.#cursor);
    this.#cursor -= 1;
  }

  deleteForward(): void {
    if (this.selection !== null) {
      this.#history.endKill();
      this.#history.edit(this.#snapshot(), "structural");
      this.#takeSelection();
      return;
    }
    if (this.#cursor >= count(this.#text)) return;
    this.#history.endKill();
    this.#history.edit(this.#snapshot(), "structural");
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

  get selection(): Readonly<{ anchor: number; head: number }> | null {
    // **`null` when the two coincide** (I21). Computed rather than stored, so
    // the "empty region" state cannot be constructed at all — a collapse that
    // forgot to clear the anchor would otherwise leave one.
    if (this.#anchor === null || this.#anchor === this.#cursor) return null;
    return Object.freeze({ anchor: this.#anchor, head: this.#cursor });
  }

  get selected(): string {
    const sel = this.selection;
    if (sel === null) return "";
    return sliceBetween(this.#text, Math.min(sel.anchor, sel.head), Math.max(sel.anchor, sel.head));
  }

  move(motion: Motion): void {
    this.#history.close();
    this.#history.endKill();
    // **Unshifted motions collapse** (I21), which is what keeps the model
    // invisible until someone holds Shift — and why every test written before
    // it existed still passes unchanged.
    this.#anchor = null;
    this.#cursor = clamp(this.#target(motion), count(this.#text));
  }

  /**
   * `move` with the anchor held (I21).
   *
   * The anchor is placed on the **first** extension and never touched again
   * until something collapses. Every line below that is not the assignment to
   * `#cursor` is shared with `move`, deliberately: two motion implementations
   * would be two answers to where a word ends.
   */
  extend(motion: Motion): void {
    this.#history.close();
    this.#history.endKill();
    this.#anchor ??= this.#cursor;
    this.#cursor = clamp(this.#target(motion), count(this.#text));
  }

  selectAll(): void {
    this.#history.close();
    this.#history.endKill();
    // The whole buffer, across newlines — `[0, count)` and not the current
    // line, which is what `lineStart`/`lineEnd` would give (T1.27).
    this.#anchor = 0;
    this.#cursor = count(this.#text);
  }

  collapse(): void {
    // **No `close()`, no `endKill()`, no snapshot** (I23). Nothing moved and
    // nothing changed, so there is no boundary to draw: closing the open unit
    // here would make the first keystroke after copy mode a new undo unit for
    // no edit the reader made.
    this.#anchor = null;
  }

  /**
   * Remove the region, if there is one, without recording a unit (I22).
   *
   * **The caller records**, because the replacement and the edit that follows
   * it are one undo unit. A snapshot taken here would make them two, and the
   * second would restore a buffer with the region already gone — which reads
   * as an undo that did half the job.
   */
  #takeSelection(): boolean {
    const sel = this.selection;
    this.#anchor = null;
    if (sel === null) return false;
    const from = Math.min(sel.anchor, sel.head);
    const to = Math.max(sel.anchor, sel.head);
    this.#text = removeBetween(this.#text, from, to);
    this.#cursor = from;
    return true;
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
    // **Collapses rather than cutting the region** (I22). A kill already names
    // where to cut *to*, so a selection would be a second answer to one
    // question. Copy is the operation that reads a region (§5a), and it is not
    // this one.
    this.#anchor = null;
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

  copy(): void {
    this.copyText(this.selected);
  }

  copyText(text: string): void {
    // A no-op with no region, so `y` on a bare caret does not silently empty
    // the buffer a previous kill filled — the same shape as `yank`'s guard.
    if (text === "") return;
    // **The run is already ended, and this used to call `endKill()` itself.**
    // The mutation pass removed that call and nothing failed — because every
    // path to a region goes through `extend` or `selectAll`, and both end the
    // run before this can be reached. A line that cannot be violated reads
    // exactly like one that is obeyed, which is A03 §2's vacuity class in code
    // rather than in prose. §5a says so now instead of implying a mechanism
    // here; the mutation that *is* load-bearing is `extend` dropping its own
    // `endKill`.
    this.#kill = text;
    // No `edit` call: the text has not changed, so there is nothing to restore
    // and a unit here would make `undo` a no-op the user has to press twice.
  }

  /** One atomic edit (§5). A no-op when nothing has been killed (T3.9). */
  yank(): void {
    if (this.#kill === "") return;
    this.insert(this.#kill, { atomic: true });
  }

  /** Construction, not an edit: no unit is recorded (see `createEditor`). */
  seed(text: string, cursor?: number): void {
    this.#text = stripForBuffer(text);
    this.#cursor = clamp(cursor ?? count(this.#text), count(this.#text));
  }

  setText(text: string, cursor?: number): void {
    this.#history.endKill();
    this.#history.edit(this.#snapshot(), "structural");
    // The buffer is being replaced wholesale; a region into the old one points
    // at characters that no longer exist.
    this.#anchor = null;
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
    return layout(this.#text, width, gutter, this.drawAs);
  }

  displayRows(width: number, gutter: Gutter): number {
    return displayRows(this.#text, width, gutter, this.drawAs);
  }

  cursorCell(width: number, gutter: Gutter): Cell {
    return cursorCell(this.#text, this.#cursor, width, gutter, this.drawAs);
  }
}

export function createEditor(initial?: Readonly<{ text?: string; cursor?: number }>): LineEditor {
  const editor = new Editor();
  // **Seeded, not edited.** `setText` would record an undo unit, so a fresh
  // editor holding a history entry that restores the empty buffer — undoable
  // before the user has typed anything, which is not the `clean` row of §7's
  // table. T3.9 caught it: `yank` on an empty kill buffer correctly did
  // nothing and `undo` still returned true.
  if (initial?.text !== undefined) editor.seed(initial.text, initial.cursor);
  return editor;
}

export type { Cell, Gutter };
