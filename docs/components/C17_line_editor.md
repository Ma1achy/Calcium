# C17 — Line editor

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L3 interaction |
| **Depends on** | C09 (`cells`, grapheme segmentation) |
| **Consumed by** | C16 (dispatches keys here) · C18 (reads the buffer to classify) · C19 (cursor position for completion) · C20 (sets the buffer on history navigation) · L4 (renders the prompt) |
| **Source** | A01 D3 · `j22` #11, #12 · A02 §2 |
| **Status** | Draft |

---

## 1. Purpose

C17 is the text buffer behind the prompt: content, cursor, and the operations that change them. It is the component where Unicode correctness is least optional — a cursor that moves by code unit will split an emoji the first time someone pastes one, and the failure is visible and immediate.

**C17 does not render.** It exposes the buffer, the cursor, and a display-row count; the prompt is drawn by L4, which composites C17's content with C19's ghost text. Keeping rendering out means the editor is testable as a pure data structure.

---

## 2. Buffer and cursor

```typescript
interface LineEditor {
  readonly text:   string;
  readonly cursor: number;            // grapheme index, not code unit
  readonly lines:  readonly string[]; // text split on "\n"

  insert(text: string, opts?: { atomic?: boolean }): void;   // atomic = force its own undo unit
  deleteBackward(): void;
  deleteForward(): void;
  move(motion: Motion): void;
  killTo(motion: Motion): void;       // cut to the kill buffer
  yank(): void;
  setText(text: string, cursor?: number): void;
  clear(): void;

  undo(): boolean;
  redo(): boolean;

  displayRows(width: number, gutter: Gutter): number;
  cursorCell(width: number, gutter: Gutter): Readonly<{ row: number; col: number }>;
}

type Gutter = Readonly<{
  first: number;                      // cells consumed by the prompt glyph on line 1
  cont:  number;                      // cells of indent on every wrapped or subsequent line
}>;

type Motion =
  | "charLeft" | "charRight"
  | "wordLeft" | "wordRight"
  | "lineStart" | "lineEnd"
  | "bufferStart" | "bufferEnd";
```

**The cursor is a grapheme index.** A ZWJ emoji sequence is one position, a combining mark does not get its own, and a CJK character is one position occupying two columns. `cursorCell(width)` converts to a display position for the prompt to place the terminal cursor; the two are different numbers and conflating them is the defect this separation prevents.

`displayRows` is a **measurement contract** in the same sense as C09's: it must equal the rows the prompt actually occupies, because the frame's viewport height is `rows − header − prompt − footer` (t01 §The frame). If they disagree, the viewport is the wrong size and everything above it is misplaced.

**The gutter is a parameter, not an assumption.** The first line carries the prompt glyph (`❯ `, two cells) and every wrapped or subsequent line carries a matching indent, so the usable width differs per line. A `displayRows(width)` that ignored this would under-count on exactly the long commands where the count matters. C17 does not know what the prompt looks like — L4 passes the measurements in, which also keeps the editor reusable behind a different prompt.

---

## 3. Word boundaries

Word motion in a shell is not word motion in prose. `/ps --status=running` should stop at each meaningful piece, not treat the whole thing as one word.

Characters fall into three classes: **alphanumeric** (letters, digits, `_`), **punctuation** (`/ - = : . , @ $ | > < &` and the rest), and **whitespace**.

A word motion skips whitespace, then consumes a run of one class. So `wordRight` from the start of `/ps --status=running` stops after `/`, then `ps`, then the space, then `--`, then `status`, then `=`, then `running`. That matches how people actually edit a command — fixing a flag value without disturbing the flag.

---

## 4. Multi-line

Enter submits; a newline is inserted by a separate binding (`j22` #11).

**Shift-Enter is not reliably detectable.** Most terminals send a bare `\r` for both Enter and Shift-Enter unless they implement `modifyOtherKeys` or the Kitty keyboard protocol, and neither is common enough to depend on. Committing to Shift-Enter alone would leave multi-line input silently unavailable on a majority of terminals.

So three bindings, all always available:

| Binding | Availability |
|---|---|
| `Shift-Enter` | Where the terminal distinguishes it |
| `Alt-Enter` | Everywhere |
| `Ctrl-J` | Everywhere — it is literally the newline byte |

`/help` lists all three. This is a correction to `j22` #11, which named Shift-Enter without noting it is often undetectable.

Long single-line input wraps visually; the underlying string is one command. `displayRows` accounts for both explicit newlines and wrapping.

---

## 5. Kill and yank

A single kill buffer, not a ring — a ring's value depends on `Alt-Y` cycling, which is muscle memory few CLI users have, and it doubles the state for little gain. Phase 1B if asked for.

**Consecutive kills append.** `killTo("wordLeft")` twice yields both words in the buffer, in the right order — killing backwards prepends, forwards appends. Any non-kill operation ends the run, so a kill after typing starts fresh.

`yank` inserts at the cursor as one atomic edit.

---

## 6. Undo

Required, not optional: C16 commits that a paste is undoable as one edit (C16 T4.6), which is only meaningful if undo exists.

**Coalescing is structural, not timed.** Consecutive insertions of the same character class merge into one undo unit; a boundary is created by whitespace, a cursor move, any deletion, a paste, or a `setText`. Deciding by structure rather than a timeout means no clock, deterministic tests, and behaviour that does not change under load.

A paste is always its own unit, however long — `insert(text, { atomic: true })` is how C16 delivers one, and `atomic` simply forces a fresh undo unit that the next keystroke will not merge into.

**The undo stack is bounded at 200 units.** Beyond that the **oldest** are discarded; discarding the newest would make the most recent edit unrecoverable, which is the one people actually try to undo.

`redo` is cleared by any new edit.

---

## 7. State machine

Undo/redo, over the two stacks.

| From ↓ / call → | `edit` | `undo` | `redo` |
|---|---|---|---|
| **clean** | → undoable, redo cleared (T1.14) | false (T3.10) | false (T3.11) |
| **undoable** | → undoable, redo cleared (T1.17) | → clean or undoable; redo grows (T1.15) | false (T3.11) |
| **redoable** | → undoable, **redo cleared** (T1.17) | → deeper undo (T1.15) | → undoable (T1.16) |

Kill-append is a flag rather than a state: any non-kill operation clears it (T1.12).

---

## 8. Invariants

- **I1** — The cursor is always at a grapheme boundary, in `[0, graphemeCount]`.
- **I2** — Every operation is grapheme-aware; no operation indexes by code unit. Enforced by **SS40**, which is C17's own scan and not C09's SS23 widened: both forbid `.length` on text, and the remedies differ. In a block the answer is `cells()`, a display width; here it is a grapheme index, because the editor counts positions a cursor can occupy rather than columns a glyph fills. One rule serving both would give one of them the wrong advice.
- **I3** — `displayRows(width, gutter)` equals the rows the prompt renders at that width and gutter.
- **I4** — `cursorCell` accounts for double-width glyphs; it is a column, not a grapheme index.
- **I5** — A paste is exactly one undo unit, regardless of size; `atomic` forces a unit boundary.
- **I6** — Undo coalescing is structural; C17 reads no clock.
- **I7** — Any new edit clears the redo stack.
- **I8** — Consecutive kills append; any other operation ends the run.
- **I9** — Control characters are stripped on insert; only `\n` survives as structure.
- **I10** — C17 does not render and holds no geometry; width and gutter are parameters.
- **I11** — The undo stack is bounded at 200 units, discarding the oldest.
- **I12** — Newline has **three** bindings, of which **at least two are terminal-independent**. Both halves are load-bearing and they count different things: the three include Shift-Enter, which many terminals do not distinguish from Enter, so it cannot be one of the two that always work. An invariant stating only the weaker half would pass with Shift-Enter removed; one stating only the stronger half would pass with Ctrl-J removed. A test citing this fails on either.
- **I14** — Word motion uses three character classes — word, punctuation, whitespace — rather than two. A flag value can then be edited without the motion swallowing the flag: `--since=1h` is four stops, not one.
- **I13** — C17 imports nothing from `terminal/` and never commits a frame.

---

## 9. Commitments

1. The cursor is a grapheme index; display columns are computed separately (I1, I4).
2. `displayRows` is a measurement contract and must match the rendered prompt, taking the gutter as a parameter rather than assuming one (I3).
3. Word motion uses three character classes, so flag values can be edited without disturbing flags (I14).
4. Newline has three bindings, at least two of them terminal-independent; Shift-Enter alone is unreliable and `j22` #11 is corrected (I12).
5. Long input wraps visually and remains one command (I3).
6. One kill buffer, not a ring; consecutive kills append (I8).
7. Undo exists, is bounded at 200 units discarding oldest-first, and a paste is one unit at any size (I11, I5).
8. Coalescing is structural, so no clock is read and tests are deterministic (I6).
9. Any edit clears redo (I7).
10. Control characters are stripped on insert; `\n` is the only structural exception (I9).
11. C17 never renders; the prompt composites its state with C19's ghost text (I10).
12. C17 never commits a frame (I13).
13. **Every operation is grapheme-aware; nothing indexes by code unit** (I2). Not only the cursor — delete, kill, word motion, undo units and paste all count the same thing, because an editor that is grapheme-aware in most places is one where a family emoji breaks whichever operation was missed. Enforced by SS40, which is C17's own scan: C09's SS23 forbids the same expression and wants a different answer.

---

## 10. Tests

Six tiers. Every cell of the §7 table is covered.

### Tier 1 — unit

- **T1.1** (I1): inserting into an empty buffer places the cursor after the inserted graphemes.
- **T1.2** (I2): `charRight` across a ZWJ emoji moves one position, not four.
- **T1.3** (I2): `charRight` across a combining mark moves past base plus mark as one.
- **T1.4** (I2): `deleteBackward` on an emoji removes the whole cluster.
- **T1.5** (I4): `cursorCell` after two CJK characters returns column 4, cursor index 2.
- **T1.6**: each `Motion` from a canonical buffer — eight cases.
- **T1.7**: `wordRight` through `/ps --status=running` stops at the seven documented boundaries.
- **T1.8**: `wordLeft` from the end reverses that sequence exactly.
- **T1.9**: `lineStart`/`lineEnd` in a three-line buffer operate on the current line, not the buffer.
- **T1.10**: `killTo("lineEnd")` then `yank` at another position round-trips the text.
- **T1.11** (I8): two consecutive `killTo("wordLeft")` → both words present, original order.
- **T1.12** (I8): kill, insert, kill → the second kill replaces rather than appends.
- **T1.13** (I5): a 10,000-character paste → one undo unit; one `undo` empties it.
- **T1.14**: typing `abc` → one undo unit; `undo` clears all three.
- **T1.15**: `undo` twice then `redo` twice → the original text.
- **T1.16**: `redo` after `undo` restores exactly.
- **T1.17** (I7): edit after `undo` → `redo` returns false.
- **T1.18** (I9): inserting `\x1b[31m` → stripped; `\n` survives.

### Tier 2 — contract / interface

- **T2.1** (I3, the headline): for a corpus of buffers — empty, single line, multi-line, wrapping, CJK, emoji — `displayRows(w, gutter)` equals the rendered prompt height at widths 20 to 200, for gutters `{first: 2, cont: 2}` and `{first: 0, cont: 0}`.
- **T2.1b** (I3): a command wrapping exactly at the gutter boundary → the row count matches; the off-by-one that a gutter-blind implementation produces is caught here.
- **T2.2** (I1): across a thousand random operation sequences, the cursor is always at a valid grapheme boundary in range.
- **T2.3** (I6): a source scan finds no clock reference in `editor/`.
- **T2.4** (I2): a source scan finds no `.length`, `charAt` or `slice` on buffer text outside the grapheme layer.
- **T2.5** (I10): the interface exposes no render method and stores no width.
- **T2.6** (I13): the module graph shows no import from `terminal/` and no scheduler call.
- **T2.7**: every `Motion` in the union has an implementation — exhaustive over the type.
- **T2.8**: undo then redo returns a buffer deeply equal to the original, for every corpus entry.

### Tier 3 — edge cases

- **T3.1**: `deleteBackward` at position 0 → no-op.
- **T3.2**: `deleteForward` at the end → no-op.
- **T3.3**: motions on an empty buffer → all no-ops, cursor stays 0.
- **T3.4**: `wordRight` at the end, `wordLeft` at the start → no-ops.
- **T3.5**: a buffer of only whitespace → word motions traverse it without looping.
- **T3.6**: `displayRows` at width 1 → one row per grapheme cell; no division by zero.
- **T3.7**: a double-width glyph straddling the wrap boundary → wraps whole, and `displayRows` accounts for the wasted cell.
- **T3.8**: a buffer ending in `\n` → the trailing empty line counts as a row.
- **T3.9**: `yank` with an empty kill buffer → no-op.
- **T3.10**: `undo` on a clean editor → false.
- **T3.11**: `redo` with nothing to redo → false.
- **T3.12** (I11): 1,000 sequential edits → the stack holds 200 units, the oldest discarded; the most recent edit is always undoable.
- **T3.13**: `setText` from history → one undo unit; undo restores the prior buffer including cursor.
- **T3.14**: a paste containing `\n` → inserted as structure, still one undo unit.
- **T3.15**: a 1 MB paste → completes within budget; `displayRows` stays linear.
- **T3.16**: a lone surrogate or invalid UTF-8 in a paste → replaced, never crashing the segmenter.
- **T3.17**: `killTo("bufferStart")` from the middle then `yank` at the end → text order preserved.

### Tier 4 — integration

- **T4.1** (with C16): printable keys insert; a `paste` event inserts atomically as one undo unit.
- **T4.2** (with C16): `Alt-Enter` and `Ctrl-J` both insert a newline on a terminal that cannot distinguish `Shift-Enter`.
- **T4.3** (with C09): `displayRows` and `cursorCell` use the same `cells()` as every block, so the prompt and transcript agree on width.
- **T4.4** (with C18): the buffer is classified without C18 mutating it.
- **T4.5** (with C19): the cursor position determines the completion context; accepting a candidate inserts as one undo unit.
- **T4.6** (with C20): history navigation calls `setText`; the typed draft is restored on return, cursor included.
- **T4.7** (with L4): the prompt's rendered height equals `displayRows`, so the viewport height is correct — asserted on the frame, not the editor.

### Tier 5 — e2e

- **T5.1**: typing, correcting with word motions, and submitting a long flagged command.
- **T5.2**: pasting a 200-line block → the prompt grows, the viewport shrinks correspondingly, and submission sends one command.
- **T5.3**: editing a command containing CJK and emoji → the cursor lands where the user sees it at every position.
- **T5.4**: an undo/redo sequence interleaved with paste and history navigation returns to the expected text.
- **T5.5**: resizing while a wrapped multi-line command is in the buffer → the prompt reflows and the viewport height stays correct.

### Tier 6 — fail-on-revert

- **T6.1** (I2): indexing by code unit → T1.2, T1.4 and T2.4 fail; emoji split.
- **T6.2** (I3): `displayRows` ignoring wrapping → T2.1 and T4.7 fail, and the whole frame is misaligned.
- **T6.3** (I4): returning the grapheme index as a column → T1.5 fails and the cursor sits in the wrong place after CJK.
- **T6.4** (I5): splitting a paste into per-character undo units → T1.13 fails.
- **T6.5** (I6): a timeout-based coalescer → T2.3 fails and undo grouping varies under load.
- **T6.6** (I7): keeping redo after an edit → T1.17 fails.
- **T6.7** (I8): appending kills across an intervening insert → T1.12 fails.
- **T6.8** (I12): binding newline to Shift-Enter alone → T4.2 fails, and multi-line silently disappears on most terminals.
- **T6.9** (I9): passing control characters through → T1.18 fails and pasted escapes reach the frame.
- **T6.10** (§3): collapsing word classes to whitespace-only → T1.7 fails and editing a flag value destroys the flag.
- **T6.11** (I11): dropping the newest undo units at the bound → T3.12 fails, and the edit people actually undo is the one that cannot be.
- **T6.12** (I3): ignoring the gutter in `displayRows` → T2.1b fails, and the viewport is one row wrong on every wrapped command.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| Rendering the prompt, ghost text compositing | L4 with C19 |
| Which keys invoke which operation | C16 |
| Tokenising and classifying the buffer | C18 |
| Completion candidates | C19 |
| History storage, draft stashing, reverse search | C20 |
| A kill ring with cycling | Phase 1B |
| Vi-mode editing | Phase 2 |
