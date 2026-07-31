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

  layout(width: number, gutter: Gutter): readonly string[];   // the display rows, without the gutter
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

**There is one walk, and L4 draws what it returns.** `layout` produces the display rows; `displayRows` is their count and `cursorCell` is derived from the same walk. It is exported for the reason C09 has one `cells()`: the alternative is C17 measuring the prompt and L4 wrapping it again, two implementations that agree today and diverge at the boundary cases this component exists for. That divergence would arrive when C22 is built, months after the decision, as a prompt one row off — so the contract is structural rather than asserted twice. The rows carry no gutter: C17 holds no geometry and does not know what the prompt glyph looks like (I10), so L4 pads each row by the gutter it passed in.

**The gutter is a parameter, not an assumption.** The first line carries the prompt glyph (`❯ `, two cells) and every wrapped or subsequent line carries a matching indent, so the usable width differs per line. A `displayRows(width)` that ignored this would under-count on exactly the long commands where the count matters. C17 does not know what the prompt looks like — L4 passes the measurements in, which also keeps the editor reusable behind a different prompt.

---

## 3. Word boundaries

Word motion in a shell is not word motion in prose. `/ps --status=running` should stop at each meaningful piece, not treat the whole thing as one word.

Characters fall into three classes: **alphanumeric** (letters, digits, `_`), **punctuation** (`/ - = : . , @ $ | > < &` and the rest), and **whitespace**.

A word motion **skips whitespace in the direction of travel, then consumes one maximal run of a single non-whitespace class**. So `wordRight` from the start of `/ps --status=running` stops after `/`, then `ps`, then `--`, then `status`, then `=`, then `running` — **six stops**. That matches how people actually edit a command: fixing a flag value without disturbing the flag.

**This corrects a worked example that contained a stop the algorithm cannot produce.** The list read "`/`, then `ps`, then *the space*, then `--`" — seven — and T1.7 asserted the seven. Nothing skips to a position *inside* whitespace under an algorithm whose first act is to skip whitespace, so an implementation matching the prose failed the example and one matching the example failed the prose.

**T1.11 is what settled it, and it is in this spec.** Two consecutive `killTo("wordLeft")` must yield both words. Under a no-skip rule the second kill takes the single space between them and the test cannot pass; under skip-then-consume it takes `push ` and the kill buffer holds both. So the algorithm is right, the example was wrong, and the count is six. Two tests in one spec demanding different algorithms is invisible to a reader checking statements one at a time — which is the class §7a exists to catch.

**The two directions stop at different places, and this is a property rather than a defect.** `wordRight` stops at the *end* of each run; `wordLeft` stops at its *start*. Where two runs abut those are the same index; where whitespace separates them they are not. In `/ps --status=running`, right gives `1, 3, 6, 12, 13, 20` and left from the end gives `13, 12, 6, 4, 1, 0` — six each way, and `3` and `4` are the pair that do not coincide. T1.8 asked for one sequence reversed and no implementation could have given it.

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

**A run of consecutive kills is one undo unit**, because it is one kill-buffer entry and the two must not describe different amounts of text. Undoing a two-kill run returns both words; the alternative returns half of what the kill buffer holds, so the buffer and the undo stack disagree about what just happened. That is the shape that cost C14 a blank screen every assertion passed — a delta read as state.

**The kill buffer is not undo state.** `undo` restores text and cursor and leaves the kill buffer exactly as it was, because it is a clipboard: a paste target that silently rewound when the user undid something else would be a worse surprise than the one it prevents. So a kill, an undo, and a yank returns the killed text — deliberately, and it is the sequence §7a walks.

`yank` inserts at the cursor as one atomic edit.

---

## 6. Undo

Required, not optional: C16 commits that a paste is undoable as one edit (C16 T4.6), which is only meaningful if undo exists.

**Coalescing is structural, not timed.** Deciding by structure rather than a timeout means no clock, deterministic tests, and behaviour that does not change under load.

The rule, in three parts:

- **An `insert` call merges into the open unit.** A cursor move, any deletion, a paste, a `setText` and a `clear` close it; the last three are each a unit of their own.
- **A call whose last grapheme is whitespace closes the unit after merging.** The whitespace joins the word it terminates rather than opening a unit of its own.
- **A change of character class is not a boundary.** `-m` is one unit, not two.

The last two are corrections, and the walk in §7a is what produced them.

**"Consecutive insertions of the same character class merge" was one of two clauses that disagreed.** The other named the boundaries — whitespace, a cursor move, a deletion, a paste, a `setText` — and a class change is not among them. Read the first way, typing `git commit -m` is **six** undo units: `git`, ` `, `commit`, ` `, `-`, `m`. Undo then means "a character class", which is not a unit anyone types in or asks for. Read the second way it is three, one per word, and undo means what a person means by it. Character class earns its place in word motion (I13) and does not belong in the undo model; the coupling was the defect.

**Coalescing is per `insert` call, not per character.** A call carrying several graphemes is one contribution to one unit and is never split — `yank`, a completion accepted by C19, and C16 delivering a multi-grapheme sequence all arrive this way, and a per-character reading would break a yanked phrase into a unit per space. It is the call's *trailing* grapheme that decides whether the unit stays open, which is what makes `insert("git ")` and `insert("git")` then `insert(" ")` agree.

A paste is always its own unit, however long — `insert(text, { atomic: true })` is how C16 delivers one, and `atomic` simply forces a fresh undo unit that the next keystroke will not merge into.

**One undo unit per `paste` *event*, which is not always one unit per user paste.** Where the terminal lacks bracketed paste, C16 falls back to a timing heuristic and a large paste arrives as one event per 30 ms window (C16 I6, §7), so undoing it returns it in chunks. I5 holds and C16 I6 holds; the composition is what surprises, and it is recorded in both specs because the person who notices it will be testing undo rather than reading about decoding.

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

## 7a. The edit trace

Kept rather than merely run, as C16's rung table is. Every invariant in §8 constrains
one operation and none constrains a *sequence*, which is where C13's, C14's and C16's
defects lived — so the whole state is written after every step and read by eye.

`run` is the kill-append flag. Undo units are labelled in order of creation; `*` marks
the one still open. `cur` is a grapheme index throughout.

| # | Call | `text` | `cur` | `kill` | `run` | undo | redo |
|---|---|---|---|---|---|---|---|
| 0 | — | `` | 0 | `` | — | — | — |
| 1 | `insert("git")` | `git` | 3 | `` | — | A\* | — |
| 2 | `insert(" ")` | `git ` | 4 | `` | — | A | — |
| 3 | `insert("push")` | `git push` | 8 | `` | — | A B\* | — |
| 4 | `move(wordLeft)` | `git push` | 4 | `` | — | A B | — |
| 5 | `insert("-f ")` | `git -f push` | 7 | `` | — | A B C | — |
| 6 | `move(lineEnd)` | `git -f push` | 11 | `` | — | A B C | — |
| 7 | `insert(" 日本")` | `git -f push 日本` | 14 | `` | — | A B C D\* | — |
| 8 | `insert("語")` | `git -f push 日本語` | 15 | `` | — | A B C D\* | — |
| 9 | `deleteBackward()` | `git -f push 日本` | 14 | `` | — | A B C D E | — |
| 10 | `killTo(lineStart)` | `` | 0 | `git -f push 日本` | kill | A B C D E F\* | — |
| 11 | `undo()` | `git -f push 日本` | 14 | `git -f push 日本` | — | A B C D E | r1 |
| 12 | `insert("🎉")` | `git -f push 日本🎉` | 15 | `git -f push 日本` | — | A B C D E G\* | — |
| 13 | `yank()` | `git -f push 日本🎉git -f push 日本` | 29 | `git -f push 日本` | — | A B C D E G H | — |
| 14 | `killTo(wordLeft)` | `git -f push 日本🎉git -f push ` | 27 | `日本` | kill | … H I\* | — |
| 15 | `killTo(wordLeft)` | `git -f push 日本🎉git -f ` | 22 | `push 日本` | kill | … H I\* | — |
| 16 | `insert("x")` | `git -f push 日本🎉git -f x` | 23 | `push 日本` | — | … H I J\* | — |
| 17 | `killTo(wordLeft)` | `git -f push 日本🎉git -f ` | 22 | `x` | kill | … I J K\* | — |
| 18 | `setText("/ps --status=running", 20)` | `/ps --status=running` | 20 | `x` | — | … J K L | — |
| 19 | `move(bufferStart)` | `/ps --status=running` | 0 | `x` | — | … K L | — |
| 20 | `move(wordRight)` ×6 | unchanged | 1 → 3 → 6 → 12 → 13 → 20 | `x` | — | … K L | — |
| 21 | `move(wordLeft)` ×6 | unchanged | 13 → 12 → 6 → 4 → 1 → 0 | `x` | — | … K L | — |

### What it found

Seven, and six of them are invisible to a reader checking statements one at a time.

1. **Step 5 — a class change is not a boundary.** §6's two clauses disagreed; the
   literal reading makes `git commit -m` six undo units. Recorded in §6.
2. **Steps 7 and 13 — coalescing is per `insert` call.** The rule was written as
   though every insertion were one character, which is true of typing and false of
   `yank`, of C19 accepting a candidate, and of C16 delivering a sequence.
3. **Step 2 — whitespace joins the word it terminates** rather than opening a unit
   of its own, or undo stops meaning "a word" and starts meaning "a run of spaces".
4. **Steps 14–15 — a kill run is one undo unit.** Unspecified before. The
   alternative undoes half of what the kill buffer holds: the buffer and the stack
   describing different amounts of text is a delta read as state.
5. **Step 11 — `undo` does not restore the kill buffer.** Unspecified before, and
   the step is in the trace because the answer is not obvious until the sequence is
   written down: this is a clipboard, and a clipboard that rewinds is worse than one
   that does not.
6. **Steps 20–21 — the worked example in §3 asserted a stop the algorithm cannot
   produce**, and T1.7 asserted the example. T1.11, three sections away, required the
   other algorithm.
7. **Step 21 — `wordLeft` does not reverse `wordRight`.** Right stops at run ends,
   left at run starts, and whitespace makes those different indices. T1.8 asked for a
   reversal no implementation could give.

The last two are the ones that argue for the trace being scheduled rather than
diligent: both are contradictions *between* statements in this document, and each
statement is correct where it stands.

---

## 7b. The prompt geometry figure

The second artefact, and the one that reads the **frame** rather than the numbers: an
arithmetically self-consistent layout can still be describing a different buffer than
the one it holds.

### The ordinary case

Drawn in full, because the edges below decide the rules and this is what someone
checks an implementation against. A figure of only edges tests the rules and not the
reading — which is how S03's column figure came to be impossible under its own
columns.

Width 80, gutter `{first: 2, cont: 2}`, two logical lines:

```
L1  /run train --dataset=imagenet --epochs=90 --batch-size=256 --lr=0.1 --wd=1e-4 --seed=1234
L2  --resume
```

`L1` is 89 cells, `L2` is 8, and the buffer is 98 graphemes including the `\n`.

```
       0         1         2         3         4         5         6         7         8
       0....^....0....^....0....^....0....^....0....^....0....^....0....^....0....^....0
row 0  ❯ /run train --dataset=imagenet --epochs=90 --batch-size=256 --lr=0.1 --wd=1e-4␠
row 1    --seed=1234
row 2    --re▮sume
```

`displayRows(80, {2,2})` is **3**. Row 0 carries 78 cells after the glyph and ends on
the space at index 77; `--seed=1234` does not fit and moves whole.

| `cursor` | `cursorCell` | Where |
|---|---|---|
| 0 | `{row: 0, col: 2}` | the first position, after the glyph |
| 42 | `{row: 0, col: 44}` | start of `--batch-size=256` |
| 78 | `{row: 1, col: 2}` | the wrap boundary — the *following* row |
| 89 | `{row: 1, col: 13}` | end of `L1`, before the `\n` |
| 90 | `{row: 2, col: 2}` | first position of `L2` |
| 94 | `{row: 2, col: 6}` | drawn above |
| 98 | `{row: 2, col: 10}` | end of buffer |

`col` includes the gutter, because it is where the terminal cursor goes.

### The rules it settled

- **`usable = max(1, width − gutter)`, and `first` applies to the buffer's first
  display row only.** Every later row takes `cont`, whether it is a wrap or a new
  logical line — which is what §2's "every wrapped **or subsequent** line" says.
- **Rows come from walking clusters, never from division.** A cluster that does not
  fit moves whole and leaves the cell behind it blank, so a row's cells and its
  content only agree if both halves walk.
- **A display row exists for every position the cursor can occupy.** A logical line
  whose last cluster exactly fills a row therefore emits a trailing empty row. This
  is the same rule as T3.8's trailing `\n` rather than a second one, and it applies
  per logical line: `abcdefgh\nx` at width 10 is **three** rows, not two.
- **At a wrap boundary the cursor belongs to the following row**, which has a cell to
  point at only because of the rule above. The two are one rule; taken separately
  they are an off-by-one in opposite directions.
- **A cluster wider than `usable` takes a row of its own and overflows it.** A block
  may substitute or drop a glyph it cannot draw; an editor may not alter what the
  user typed.

### What it found

1. **The row count is a position count, not `ceil(cells / usable)`.** A line that
   exactly fills its rows has one more cursor position than `ceil` has rows, and the
   cursor at the end of it lands on a row that was never reserved. The two formulas
   agree everywhere else, so a random corpus meets it about once in `usable` strings
   — and T2.1b, which was aimed at the gutter, is the test that catches it.
2. **`gutter.first` for each logical line was the other available reading**, and it
   is wrong by exactly one gutter's width on every line of a pasted block after the
   first. Confirmed against §2's wording rather than chosen.
3. **T3.6 was unanswerable as written.** "Width 1 → one row per grapheme cell" does
   not say whether a two-cell cluster is one row or two. It is one row, overflowed,
   because the alternative is deleting the user's text. The limit is real and stated:
   at `usable ≤ 1` the terminal draws two cells where the count says one, and nothing
   in the tree floors the terminal width — S01 caps the prompt's height and no
   document floors its width.
4. **The prompt's height is stable under typing at the end of a full row**, which is
   a consequence of the position rule rather than a separate requirement. Reserving
   the row one grapheme early is what stops the frame reflowing mid-keystroke.

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
- **I13** — Word motion uses three character classes — word, punctuation, whitespace — rather than two. A flag value can then be edited without the motion swallowing the flag: `--since=1h` is four stops, not one.
- **I14** — C17 imports nothing from `terminal/` and never commits a frame.
- **I15** — Coalescing is per `insert` **call** and per boundary event, never per character. A call's graphemes are never split across units; a call whose last grapheme is whitespace closes the unit after merging; a change of character class is not a boundary. All three halves are load-bearing and they fail differently: per-character splitting breaks a yanked phrase into a unit per space, whitespace opening its own unit makes `git commit` three units, and a class change as a boundary makes `-m` two.
- **I16** — A run of consecutive kills is **one** undo unit, matching the one kill-buffer entry it produces; and the kill buffer is not undo state, so `undo` never restores it. One invariant because they are one question — whether the kill buffer and the undo stack describe the same text — answered in opposite directions for the two halves.
- **I17** — Word motion skips whitespace in the direction of travel, then consumes one maximal run of a single non-whitespace class. `wordRight` therefore stops at run **ends** and `wordLeft` at run **starts**; the two sequences coincide only where runs abut and are not reverses of each other.
- **I18** — `layout`, `displayRows` and `cursorCell` are one walk: `displayRows` is `layout().length` and `cursorCell` indexes the rows `layout` returned. L4 draws those rows rather than wrapping the buffer a second time, which is what makes I3 structural instead of a claim two implementations happen to satisfy.
- **I19** — A display row exists for every position the cursor can occupy, so the count is a position count and not `ceil(cells / usable)`: a logical line whose last cluster exactly fills a row emits a trailing empty row, per line. T3.8's trailing `\n` is this rule rather than a second one, and `cursorCell` at a wrap boundary reports the following row — the two halves are an off-by-one in opposite directions if either is dropped.
- **I20** — Rows are produced by walking clusters. A cluster that does not fit moves whole and leaves the cell behind it blank; a cluster wider than `usable` takes a row of its own and **overflows** it. C09 I9 may drop or substitute a glyph a block cannot draw and C17 may not: a block renders someone's data, an editor holds what the user typed.

---

## 9. Commitments

1. The cursor is a grapheme index; display columns are computed separately (I1, I4).
2. `displayRows` is a measurement contract and must match the rendered prompt, taking the gutter as a parameter rather than assuming one (I3).
3. Word motion uses three character classes, so flag values can be edited without disturbing flags (I13).
4. Newline has three bindings, at least two of them terminal-independent; Shift-Enter alone is unreliable and `j22` #11 is corrected (I12).
5. Long input wraps visually and remains one command (I3).
6. One kill buffer, not a ring; consecutive kills append (I8).
7. Undo exists, is bounded at 200 units discarding oldest-first, and a paste is one unit at any size (I11, I5).
8. Coalescing is structural, so no clock is read and tests are deterministic (I6).
9. Any edit clears redo (I7).
10. Control characters are stripped on insert; `\n` is the only structural exception (I9).
11. C17 never renders; the prompt composites its state with C19's ghost text (I10).
12. C17 never commits a frame (I14).
13. **Every operation is grapheme-aware; nothing indexes by code unit** (I2). Not only the cursor — delete, kill, word motion, undo units and paste all count the same thing, because an editor that is grapheme-aware in most places is one where a family emoji breaks whichever operation was missed. Enforced by SS40, which is C17's own scan: C09's SS23 forbids the same expression and wants a different answer.
14. Coalescing groups by `insert` call and boundary event rather than by character or character class, so a yanked phrase is one unit and `git commit -m` is three rather than six (I15).
15. A kill run is one undo unit and the kill buffer is not undo state, so the two never describe different amounts of text (I16).
16. Word motion skips whitespace then consumes one run, so `wordRight` and `wordLeft` stop at different indices across a gap — a property of the motion, not a defect to be corrected (I17).
17. `layout` is exported and L4 draws the rows it returns, so the measurement contract is one walk rather than two implementations that agree today (I18).
18. The row count counts cursor positions rather than cells, so a line that exactly fills its rows reserves the row its end sits on (I19).
19. A cluster that cannot fit moves whole and one wider than the row overflows rather than being dropped: an editor never alters what the user typed (I20).

---

## 10. Tests

Six tiers. Every cell of the §7 table is covered, and §7a's trace is walked as one
test rather than as its steps: the sequence is what the invariants do not constrain.

### Tier 1 — unit

- **T1.1** (I1): inserting into an empty buffer places the cursor after the inserted graphemes.
- **T1.2** (I2): `charRight` across a ZWJ emoji moves one position, not four.
- **T1.3** (I2): `charRight` across a combining mark moves past base plus mark as one.
- **T1.4** (I2): `deleteBackward` on an emoji removes the whole cluster.
- **T1.5** (I4): `cursorCell` after two CJK characters returns column 4, cursor index 2.
- **T1.6**: each `Motion` from a canonical buffer — eight cases.
- **T1.7** (I17): `wordRight` through `/ps --status=running` stops at the six documented boundaries — `1, 3, 6, 12, 13, 20`. It asserted seven, including one inside the whitespace, until §7a.
- **T1.8** (I17): `wordLeft` from the end stops at `13, 12, 6, 4, 1, 0` — six, at run starts rather than run ends. It asked for T1.7's sequence reversed, which no implementation could produce: `3` and `4` are the pair a gap separates.
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
- **T1.19** (I15): typing `git commit -m` one grapheme at a time → **three** undo units, one per word. Six is what a class-change boundary produces and is what this catches.
- **T1.20** (I15): `insert("a b c")` as one call → one undo unit, not three. The per-character reading splits it and `yank` is the caller that suffers.
- **T1.21** (I16): two consecutive `killTo("wordLeft")` then one `undo` → **both** words return. Half of them is the kill buffer and the undo stack disagreeing.
- **T1.22** (I16): kill, `undo`, `yank` → the killed text is inserted; `undo` left the kill buffer alone.

### Tier 2 — contract / interface

- **T2.1** (I3, the headline): for a corpus of buffers — empty, single line, multi-line, wrapping, CJK, emoji — `displayRows(w, gutter)` equals the rendered prompt height at widths 20 to 200, for gutters `{first: 2, cont: 2}` and `{first: 0, cont: 0}`.
- **T2.1b** (I3): a command wrapping exactly at the gutter boundary → the row count matches; the off-by-one that a gutter-blind implementation produces is caught here.
- **T2.2** (I1): across a thousand random operation sequences, the cursor is always at a valid grapheme boundary in range.
- **T2.3** (I6): a source scan finds no clock reference in `editor/` — SS1's, which covers all of `src/` with one named exception. A03 inventoried SS7 for this scope and it is folded into SS1 rather than built: it could never have fired on anything SS1 misses, which is A03 §2's pending-entry class and the reason a test cites the rule that covers it rather than the rule that was promised.
- **T2.4** (I2): a source scan finds no `.length`, `charAt` or `slice` on buffer text outside the grapheme layer.
- **T2.5** (I10): the interface exposes no render method and stores no width.
- **T2.6** (I14): the module graph shows no import from `terminal/` and no scheduler call.
- **T2.7**: every `Motion` in the union has an implementation — exhaustive over the type.
- **T2.8**: undo then redo returns a buffer deeply equal to the original, for every corpus entry.
- **T2.9a** (§7b, I18, I19): the ordinary case is replayed as drawn — `layout(80, {2,2})` returns the three rows verbatim, `displayRows` is 3, and `cursorCell` matches all seven rows of the table. The figure is the fixture; a test that recomputed it would be asserting the implementation against itself.
- **T2.9b** (I18): `displayRows` is `layout().length` and `cursorCell.row` indexes it, for the whole corpus at every width — asserted as identities, so a second walk cannot be introduced without failing.
- **T2.9** (§7a): the trace is replayed as one test — all twenty-one steps against one editor, asserting the **whole** state after each, `text`, `cursor`, kill buffer, run flag and both stack depths. Asserted as a sequence rather than as twenty-one cases, because every invariant here constrains an operation and the two defects §7a found last are contradictions between operations.

### Tier 3 — edge cases

- **T3.1**: `deleteBackward` at position 0 → no-op.
- **T3.2**: `deleteForward` at the end → no-op.
- **T3.3**: motions on an empty buffer → all no-ops, cursor stays 0.
- **T3.4**: `wordRight` at the end, `wordLeft` at the start → no-ops.
- **T3.5**: a buffer of only whitespace → word motions traverse it without looping.
- **T3.6** (I20): `displayRows` at width 1 → one row per grapheme, a two-cell cluster included; no division by zero and no dropped text. §7b records that the terminal draws two cells where the count says one at `usable ≤ 1`, and that nothing floors the width.
- **T3.7** (I20): a double-width glyph straddling the wrap boundary → wraps whole, and `displayRows` accounts for the wasted cell. At width 9 with `{2,2}`, `ab日本語` is `ab日本` and `語`.
- **T3.8** (I19): a buffer ending in `\n` → the trailing empty line counts as a row.
- **T3.8b** (I19): a logical line whose last cluster exactly fills its row → the trailing row is emitted, and `abcdefgh\nx` at width 10 with `{2,2}` is **three** rows. `ceil` gives two and leaves the cursor at index 8 with no row.
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
- **T6.13** (I15): making a class change a boundary → T1.19 fails, and undo means "a character class" rather than "a word".
- **T6.14** (I15): coalescing per character rather than per call → T1.20 fails, and a yanked phrase undoes a word at a time.
- **T6.15** (I16): giving each kill in a run its own undo unit → T1.21 fails, and one undo returns half of what the kill buffer holds.
- **T6.16** (I17): skipping the whitespace skip → T1.7 and T1.11 fail together, and `killTo("wordLeft")` at a word boundary deletes one space.
- **T6.17** (I18): `displayRows` computing its own count rather than `layout().length` → T2.9b fails, and the prompt L4 draws stops being the prompt C17 measured.
- **T6.18** (I19): `ceil(cells / usable)` in place of the position count → T3.8b fails, and the cursor at the end of a full command has no row to sit on.
- **T6.19** (I20): dropping a cluster wider than the row, as C09's wrap does → T3.6 fails and the editor deletes what the user typed.

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
