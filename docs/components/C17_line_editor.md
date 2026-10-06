# C17 — Line editor

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `calcium-tui` |
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

**Shift-Enter is reliably detectable only where the terminal says which key it is.** Where C02 reports `keyboardProtocol: "kitty"` — C01 pushes `CSI > 3 u` on entry — or the terminal sends xterm's `modifyOtherKeys` form (C16's decoder reads both), Shift-Enter arrives distinguishably; everywhere else it is a bare `\r`, identical to Enter. Committing to Shift-Enter alone would leave multi-line input silently unavailable on the terminals that send the bare byte, so Alt-Enter and Ctrl-J remain the guarantee.

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

## 5a. Copy writes to the kill buffer — one clipboard, not two

**Ruled here rather than in the copy feature, because the buffer is C17's.**

Selection copy — `y` on a focused element, select-all in the prompt, whatever the
transcript's selection eventually offers — writes the **kill buffer**. There is not
a second store beside it.

**The argument is that §5 already calls this a clipboard and rules on it as one.**
*"It is a clipboard: a paste target that silently rewound when the user undid
something else would be a worse surprise than the one it prevents."* A second
clipboard would need that ruling restated, and would leave the reader unable to say
which store `⌃y` yanks from — two paste targets and one paste key. So `⌃k` then `y`
then `⌃y` yanks what `y` copied, which is the least surprising sequence and needs no
new rule.

**Copy is not a kill, so it does not join a kill run** — and the run is over before
`copy` is reached, which is a correction the mutation pass forced. `copy` used to end
the run itself, and removing that call failed nothing: every path to a region goes
through an extending motion or `selectAll`, and §5's *any non-kill operation ends the
run* already covers both. **A line with nothing to be wrong about reads exactly like
one that is obeyed**, which is A03 §2's vacuity class in code rather than in prose.

So the rule is stated where it holds: **an extending motion ends the run** (T1.36, and
the row had to construct a sequence with no `move` in it, because `move` ends the run
too and every earlier row had one). A copy replaces the buffer outright — two copies in
a row leave the second, not both.

**Copy is not an undo unit either**, and for §5's reason inverted: a copy changes no
text, so there is nothing for undo to restore, and the buffer is not undo state in
either direction.

**The system clipboard is a different axis and is not ruled here.** Whether a copy
*also* emits OSC 52 is a question about the terminal, answered per capability, and
it does not change where the text lands inside the process. Naming it as separate is
the point: folding it in would make "one clipboard" a claim about two things, one of
which C17 cannot see.

**Amended (review batch 4, M10 item 1; ruling 72): the system clipboard is built, and
it is a second *destination*, not a second store** (I31). L4 writes the kill buffer
first, with the text it then sends to OSC 52, a platform tool, or — only when the
reader takes the offer — a file (C14 I61), so
`⌃y` yanks what the clipboard received. The axis stays separate in exactly the sense
above — C17 sees one buffer and nothing of the terminal — and the invariant is L4's
obligation to this component, which is why it is here: a copy that reached the
system clipboard and not the kill buffer would make `⌃y` paste the previous kill, and
the reader holds two clipboards and one paste key.

## 5b. Selection — an anchor, a head, and every motion twice

**The model, not a binding.** Select-all is the *degenerate case* of this — the whole buffer as one region — so shipping it alone means shipping an anchor and a region for one key and then generalising them. Roadmap entry 15 step 2.

**Two positions in the buffer's own coordinate system**, which is grapheme indices, the same one `cursor` already uses. The **head is the cursor**: there is not a second position to keep in step with it, because a selection whose head could disagree with the cursor is two records of where the caret is. The anchor is the only new state.

`selection` is `null` when there is no region, and **`anchor === head` is no region rather than an empty one**. That is a consequence of the representation and not a rule beside it: a caret with nowhere to be is the state the editor is in most of the time, and giving it a second spelling would let two of them exist.

### Every motion twice, and the second is the first with the anchor held

Each shifted form is *move, and leave the anchor where it is*. There is no second implementation of any motion — `extend` and `move` compute the same target through the same `#target`, and differ in one line. **A shifted motion that moves the anchor is the defect this shape exists to make impossible**, and it is invisible to every single-motion test: extend once and the region is right whichever end moved. It shows on the second.

**An unshifted motion collapses the region.** So the model is invisible until someone holds Shift, which is what lets it land under every existing test unchanged.

### `collapse()` — the region goes and nothing else moves

**A collapse that is not a motion** (I23). Every collapse above happens *because* something else moved — `move` collapses by moving the caret, an edit by replacing the region, `undo` by restoring text. Native selection (C16 §5b) needs the region gone with the caret **where it is**: the terminal's own selection is about to take over the screen, and a prompt still washing a region under it shows two selections at once. Measured (F765): `#setNativeSelection(true)` did not clear `Editor.selection`, and C17 exposed no member that could — the only collapsing operations all move or edit.

So `collapse()` drops the anchor and touches **nothing** else: the caret stays, the text is unchanged, and the undo history is untouched — no unit recorded, no open unit closed, the kill run left as it was. It is not an edit (nothing to restore) and not a motion (nothing moved), so it takes neither's bookkeeping; a version that closed the open unit would make the next keystroke after native selection a new undo unit for no edit the reader made. `anchor === head` already reads as no region, so on a bare caret it is a no-op with nothing to observe.

### An edit replaces the region, as one unit

`insert`, `deleteBackward`, `deleteForward` and `yank` remove the region first and record **one** undo unit for the pair. The kind is `structural`: a replacement is not typing that should coalesce with what follows, and it is not a paste that should stand alone for its own reason.

**`killTo` collapses rather than cutting the region**, and that is a decision rather than an omission. A kill is a motion-shaped operation — it names where to cut *to* — so a selection would give it two answers to one question. Copy is the operation that reads a region (§5a), and it is step 3's.

### Selection is not undo state

`undo` and `redo` collapse it, for I16's reason turned around: the kill buffer survives an undo because it is a clipboard, and a *region* does not, because it is a statement about where the caret is and the caret has just moved. Restoring a region over text that has changed under it is the one way this can point at the wrong characters.

---

## 5c. The chip — a word that happens to be painted (§099, §101, `R-COL-005`)

**Two halves were built and one fact was never written down.** The buffer half
is `insertChip` and `CHIP_BASE`: a chip is one code point, so `count`, `splitAt`,
`wordLeft` and every other grapheme-indexed operation treats it as a character
and none has to learn what a chip is. The drawing half is `ClusterText` and the
walk, where the sentinel is measured **as it is drawn**. §099's *a chip is
atomic — it never breaks across a wrap* is that walk's `if (used > 0 && used + w
> limit) open()`, and it has held since the seam landed.

**Measured before this section was written, not assumed.** A 22-cell label
inserted after eight cells of text in a 24-cell prompt wraps whole:

```
["look at ", "[#1 pasted · 47 lines] then go"]
```

So the atomicity clause is **already satisfied** and is recorded here with a row
watching it rather than rebuilt. What is not built is everything else §099 and
§101 say about a chip, and two of those are the same sentence read twice.

### The label is the framework's, composed from the chip's parts

Today the caller hands over a finished string — `construct.ts` builds `[#1 pasted
· 47 lines]` and the editor stores it. That makes the design's form the
application's to get right, in every application, and §099's rule is the
opposite: **a kind shortens itself, given the width it got**. The engine hands a
box its solved width and the kind decides what goes in it.

So `Chip` carries parts and the label is derived:

| part | what it is |
|---|---|
| `ordinal` | `#1`, `#2` — per owner's line and never reset within it: the prompt's for the session, a borrower's for its borrow (I33). A paste has no name, so the ordinal is its identity; `[#2]` after `[#1]` was deleted is a reader seeing that something else was there, which is true |
| `kind` | `"paste"`, `"file"` or `"image"` — what the chip *is*, which decides the preview and nothing about the label |
| `name` | what a reader calls it: a paste's detected content kind (`json`), a file's basename (`package.json`) |
| `lines` | the size, drawn `47L`. Absent for an image, which is not measured in lines |
| `content` | what the chip stands for, and what `resolved` substitutes — unchanged |
| `target` | what the preview opens, when that is not the content: a path for a file. Opaque here; C17 never reads it |

### Brackets are the unpainted rung of a painted thing

**The fixtures show two forms and the difference is the paint.** §099 draws
`#1 json · 47L` with a space either side and §101 draws `#1 package.json`
the same way; `R-BLK-078` and `R-BLK-336` draw `[parse.ts · 184L]` and
`[#1 json · 47L]`. Read as two label formats that would be the design
contradicting itself, and it is not: §099's own caption is *a chip is one word
that happens to be **painted***, and a plain-text fixture cannot show a ground,
so it shows the ground's own leading and trailing space instead. The bracket is
what says *chip* where there is no ground to say it — the same ladder the head
mark takes, and the same one `selectionStyle` takes from a wash to `inverse`.

So one form, two rungs:

| rung | drawn |
|---|---|
| with colour | `␠#1 json · 47L␠` on `surface.bgDeep`, in `tone.meta` (`R-BLK-628`, `R-BLK-116`) |
| 1-bit | `[#1 json · 47L]`, no ground |

The separator is `glyphs(caps).separator`, so the ASCII tier takes `·` → `-`
from the same place every other separator in the frame does.

### The ground comes off the walk, as the selection's does

A chip is painted and the walk returns strings, so the cells it occupies have to
reach the painter. **That mechanism exists**: `selectionSpans` already returns
`CellSpan`s off this same walk and `washed()` applies a style to a cell range of
a painted row. `chipSpans` is that function's sibling, and painting is `washed`'s
shape with a different style — which is why this costs a seam already argued for
rather than a second way of styling the prompt.

**One walk still** (I18): `chipSpans` shares `walk` with `layout`, `displayRows`,
`cursorCell` and `selectionSpans`, so a chip's ground cannot land anywhere but
where its label was measured.

**And the span is recorded inside the walk rather than derived from `cells`
afterwards, which the first draft did and got wrong.** The obvious reading is
that a chip at position *p* covers `cells[p]` to `cells[p + 1]`, as a region
covers its two endpoints — and it does not, because **the position before a
chip is recorded before the wrap that moves the chip happens**. A 15-cell label
after eight cells of text at width 19 has `cells[p] = {row: 0, col: 8}` and
`cells[p + 1] = {row: 1, col: 15}`: the chip is drawn on row 1 from column 0,
and every number in that pair is about somewhere else. The row came out empty,
which is the benign failure; the same arithmetic one column narrower paints the
prompt's own text.

The walk knows the row, the column and the width at the moment it draws, and
nothing else does — which is *measured as it is drawn* applied to the ground
rather than to the label.

## 5d. Which chip the caret is on (§101, `R-BLK-823`)

§101 previews a chip in two places and makes focus the thing that chooses. The
place is C22's (§6l.12); what C17 owes is the answer to *which chip* — and it is
the only component that can give one, because the sentinel and the side map are
private to the editor and the buffer is the only thing that knows where the
caret is.

**The chip before the caret, and after it only when there is none before.**
`insertChip` leaves the caret past the chip it inserted, so preferring the
preceding one previews what was just pasted rather than what comes next. Both
sides are read because a caret at the head of the buffer has nothing before it,
and a rule that only looked backwards would answer nothing for the one position
a reader arrives at by pressing `home`.

**A reader over the same map `drawAs` resolves through, never a second table.**
The map is the one `insertChip` writes and the walk reads (I24); a preview
served from a copy could disagree with what is drawn, which is the whole class
§5c exists to prevent. It is `null` for every position with no chip on either
side, and that is most of them.

**It was written once and removed before this section existed**, because its
only consumer was unbuilt and CLAUDE.md refuses an export nothing consumes. The
consumer is C22's projection, and the seam returns with it — which is what *name
the queued consumer* means when the queue finally arrives.

---

## 5e. A chip wider than its row — elided in the middle, by the walk (§099, `R-BLK-750`, `R-BLK-801`, `R-BLK-802`)

**Measured at `c8c7a77e`, before this section was written.** A 44-cell bracketed
label after three cells of text, at width 14 with the prompt's `{2, 2}` gutter:

```
["ab ", "[#1 a-very-long-detected-kind · 4096L]", " z"]     spans [{row: 1, from: 2, to: 14}]
```

The walk moved the chip to a row of its own and **overflowed** it, as I20 and the old
last sentence of I26 said it should. The painter's `exact()` clips at the frame's
right edge, so nothing wraps — what the reader sees is `[#1 a-very-lo` and nothing
after it: a label cut on the right, with no closing bracket at 1-bit and no marker at
any depth, which is indistinguishable from text that happens to start with `[#1`.

**The reason the overflow was ruled is true, and it does not reach the decision.**
*An editor never alters what the user typed, and a chip is what the user pasted* — the
content is what was pasted, and the content is untouched: `resolved` still substitutes
all of it. The **label** is not what anyone pasted. It is C17's own composition from
the chip's parts (I25), and §099 says what a composition does with too little room:
*a kind shortens itself, given the width it got* (`R-BLK-802`), and *a path truncates
in the middle, because the head says where and the tail says what* (`R-BLK-801`).
`R-BLK-750` lists a chip among the content that shrinks to its floor. So the rule is
I20's for a typed cluster and §099's for a chip, and the distinction is who composed
the cells.

### The walk, as a classification table

The interactions are **structural**: every row below is two rules that both hold at
rest, with no event between them, so the artefact is a table rather than a trace.
`U` is the usable cells of the row the chip is drawn on, `L` the full label's cells,
`F` the frame — two cells at either rung, a space either side on the painted rung and
the brackets on the bare one — and `m` the marker's cells.

| Case | Which rules meet | Ruling |
|---|---|---|
| `L ≤ U`, the row partly used, `used + L > U` | I20 *moves whole* × I26 *one wrap unit* | Moves to a fresh row, drawn whole. Unchanged. |
| `L > U`, the row partly used | I20 *moves whole* × I32 | **The chip opens a fresh row first, and is elided there** — never to the remainder of a partly used row. A chip is shortened only when no row can hold it; shortening it to whatever the text before it left would make its form depend on that text, and two identical pastes would draw differently a word apart. |
| `L > U` on a fresh row | I20 *overflows* × C01 *no line wider than the frame* × `exact()`'s right clip | **Elided in the middle to exactly `U` cells, frame kept**: `open + truncate(inner, U − F, tier, "middle") + close`, C09 I103's cut — one middle cut in the tree, not two. The head keeps the ordinal and the tail keeps the size, which are the two parts that tell two chips apart. |
| Row 0 against a continuation row | `usableAt(first)` × `usableAt(cont)` | **`U` is read after the walk opens the row the chip lands on.** At `c8c7a77e` the limit was read once, before `open()` — harmless for the fit test, which is decided on the row being left, and wrong for the elision, which must fit the row being entered. With the prompt's `{2, 2}` the two agree; with `{first: 0, cont: 6}` a chip moved off row 0 would be elided to row 0's width on a row six cells narrower. |
| `U − F < m` (`U` of 1 or 2) | the frame × the marker | **The marker alone, padded to `U`.** Neither rung's frame fits beside it; on the painted rung the ground still covers the cells, and at 1-bit two cells cannot say *chip* at all. |
| `U − F = m` | the frame × the marker | The frame and the marker: `[…]`, or `␠…␠` on a ground. `truncate` returns the marker alone at a zero budget, so this is its own arm rather than a special case here. |
| A wide cluster in the name (`日本語.json`) | C09 I9 *never split a cluster* × `U` exactly | `truncate` refuses a cluster that would straddle its budget and pads the cell, so the drawn label is exactly `U` cells either way. |
| The ASCII tier, or `ambiguousWidth: "wide"` | the marker's glyph × the walk's measure | **The marker comes from the same tier as the separator.** `glyphs()` hands the ASCII set wherever the ambiguous width is wide (C02 I9), so the separator is `:` there; `ChipLook` carries the tier the separator came from and the elision's marker is `~` at exactly the same rungs. The walk measures narrow, and so does `exact()`: with both the separator and the marker ASCII at the wide rung, the frame and the marker are measured exactly. The name's own ambiguous characters are the walk's narrow measure, which is every typed cluster's too and is not this section's (F1392). |
| The cursor after an elided chip | I19 *a row for every position* | `used = U`, so the fullness test opens the next row and the position after the chip is that row's gutter. Unchanged. |
| `chipSpans` and `selectionSpans` over it | I26 *the ground comes off the walk* | The span is `from + drawn width`, which now never passes the row; the `Math.min(…, width)` clamp stays as a guard for `width ≤ gutter`, where `usable` is floored at 1 and §7b records that the terminal and the count disagree. |
| The layout memo | I24 *keyed on buffer, width and both gutter figures* | The elided form depends on the width and the row's gutter, and both are key terms; the tier is fixed when the editor is built. No new term. |
| `chipAt`, the preview's title, `resolved` | I25, I27, C22 I113 | **Untouched.** The elision is drawing: the preview's title is `chipLabel` with no limit, and submission substitutes the content. |
| A typed cluster wider than `U` (`日` at `U = 1`) | I20 × I32 | **Still overflows** (I20). The elision is a chip's alone, because only a chip's cells are C17's composition; a typed cluster is the user's. |
| A held line (C22 I118) | I29 × I32 × I34 | Drawn by the same walk through the editor's `drawAs`, so it is elided exactly as the live line is, with no change at the call site. |

**`ClusterText` takes the limit.** `(cluster, limit?) => string | undefined`: with no
limit it is the label, as every caller outside the walk wants it; with one it is the
label fitted to it. The walk asks without a limit first — the fit test needs the
label's natural width — and asks again with `U` only when the label is wider than the
row it has opened. This is `layout.ts`'s own note carried to its end: *a kind shortens
itself, given the width it got*, and the walk is the only thing that knows the width.

## 5f. Chips across a borrow — ordinals travel with the line, sentinels never repeat (§052, `R-QST-003`, I29)

**Measured at `c8c7a77e`.** A prompt holding one chip, then `hold()`, a paste inside
the borrow, a kill of it, `resume`, a paste at the prompt, and `⌃y`:

```
reply           ["[#2 B · 5L]"]
after resume    ["[#1 A · 5L][#3 C · 5L]"]
after ⌃y        ["[#1 A · 5L][#3 C · 5L][#2 B · 5L]"]     resolved "AAACCCBBB"
```

`hold()` takes the text, the caret, the region and the undo stack (I29) and leaves the
chip table and both counters shared, so the reply's first chip is `#2` and the
reader's next is `#3`. **§052 gives a borrower its OWN buffer, and I25 says the ordinal
is a fact about a buffer's whole life** — so the reply's buffer is a buffer whose life
began at the borrow, and its first chip is `#1`. The reader's `#2` is the reader's.

**The remedy the review wrote down reopens I24's blind spot**: *hold the chip
map and the counter* restarts the sentinel counter, so the reply's first paste mints
the same sentinel as the reader's first chip. Two things then break and neither is
visible from a row about ordinals: the one map rebinds that sentinel, so the held line
draws the reply's label and resolves to the reply's content; and I24's memo, keyed on
the buffer's text, answers a walk of one string for two different chips.

### Which channel carries a sentinel between owners — a classification table

The structural half: every way a sentinel reaches a buffer, against whose sentinel it
can be. **A table of channels rather than a trace of events**, because the question
is which pairs of owners each channel joins, and that holds at rest.

| Channel | Whose sentinels arrive | Ruling |
|---|---|---|
| `insert` of typed or pasted text | none | A fresh string. A typed private-use character that happens to equal a minted sentinel is the stated blind spot of I34. |
| `insertChip` | a fresh one, the current owner's | Minted and inserted in one call (I24's precondition). |
| `undo`, `redo` | the current owner's own | The stack travels with the line (I29), so a stack only ever holds its owner's texts. |
| `resume`, `restore` | the owner's own | The held line is the owner's text. |
| `yank` | **any owner's** | **The one channel that joins two owners**: the kill buffer is the one clipboard (§5a) and §052 names *paste rules* among what a borrower shares. A foreign chip is **adopted** — minted afresh under the current owner's next ordinal, parts unchanged — and an own chip is inserted as it is, which is the same chip twice. |
| `setText` (history, completion) | none | History records the submitted line, which is `resolved`; a candidate is text. |
| `loadField` (a field's stored value, through `restore`) | a sentinel a past field borrow committed | Resolves through the one table and keeps the ordinal it was minted with; `restore` is not an edit and adopts nothing. That a field's value can hold a sentinel at all was a finding of its own, F1395, **closed by C22 I148**: the shell writes a field with `resolved`, so a stored value holds no sentinel and this row's input is plain text. |

**One table, and that is the ruling the plan's third clause turned on.** *A held line
draws through its own chip table* presumes one table per owner, and the row for
`yank` is what refutes it: with per-owner tables a chip killed inside a reply and
yanked at the prompt is a sentinel the prompt's table has never seen — it draws as a
private-use box and `resolved` submits it as itself, which is a paste silently
replaced by one unprintable character. The table is therefore the editor's, append-
only and keyed by a sentinel that is **never reused and never rebound** (I34); the
ordinal counter is the owner's and travels with the line (I33). A held line then
draws through the editor's `drawAs` correctly with no call-site change, because no
sentinel in it can have been rebound (C22 I118 stands as written).

### The borrow, as a sequence trace

The event-mediated half. Prompt owner `P`, a reply `R`, then a form field `F`. `Sn` is
the n-th sentinel minted in the editor's life.

| # | Event | Owner | Sentinels · ordinals | Drawn | Kill buffer |
|---|---|---|---|---|---|
| 1 | paste `A` at the prompt | P | S0 → A, P#1 | `#1 A` | — |
| 2 | `hold()` for `reply…` | R | P's counter (1) held with P's line and stack; R starts at 0 | `""` | — |
| 3 | paste `B` in the reply | R | S1 → B, R#1 | `#1 B` — **`#2` at `c8c7a77e`** | — |
| 4 | `⌃u` | R | — | `""` | `S1` |
| 5 | answer; `resume` | P | P's counter back at 1; R's discarded; S1 stays in the table, owned by R | `#1 A` | `S1` |
| 6 | paste `C` | P | S2 → C, P#2 | `#1 A` `#2 C` — **`#3` at `c8c7a77e`** | `S1` |
| 7 | `⌃y` | P | S1 is R's, so **adopted**: S3 → B, P#3 | `#1 A` `#2 C` `#3 B`; `resolved` ends `BBB` | `S1` |
| 8 | `⌃y` again | P | adopted again: S4 → B, P#4 | `… #4 B` — each yank of a foreign chip is a paste | `S1` |
| 9 | `⌃z`, `⇧⌃z` | P | S4 leaves the text and comes back; the table never forgot it | `… #4 B` | `S1` |
| 10 | kill `S0`, `⌃y` twice | P | S0 is P's own: not adopted | `#1 A` twice — the same chip twice, which is true | `S0` |
| 11 | enter a field: `hold()` | F | P's counter (4) held; F starts at 0 | the prompt row draws P's held line through the one table (C22 I118) | `S0` |
| 12 | `⌃y` in the field | F | S0 is P's: adopted, S5 → A, F#1 | the field draws `#1 A` | `S0` |
| 13 | leave the field | P | the field's value is written from `text`, so it holds S5 — a sentinel in a form's data | — | `S0` |

**What the trace found beyond the premise.**

1. **The restart remedy's two failures are one rule.** Step 3 under a restarted
   counter mints S0 again and rebinds it, and every later row about P is then about a
   chip P never pasted. *Never reused* is the rule and *never rebound* is what it
   buys; they are one invariant (I34) because the second cannot fail without the
   first.
2. **Step 7 is where per-owner ordinals meet the shared clipboard**, and without
   adoption it draws `#1 A` beside `#1 B` — the two-`#1` prompt I25's own comment
   names as the reason the ordinal is the editor's and not the producer's. Adopting
   under the current owner's counter is the only reading that keeps both I25 and
   §5a; it makes the table's writers two (`insertChip` and `yank`), both of which
   mint and insert in the same call, so I24's precondition — *the buffer moves
   whenever the table does* — still holds, and I24 is amended to name both.
3. **keys.ts's held draft** (the menu and search a question displaced) records
   `editor.text` when a question arrives and compares it with `editor.text` when the
   last blocking layer goes. With sentinels never reused or rebound, equal raw text
   is equal chips, so that comparison needs no chip-aware answer — I34 is what makes
   it one.

### The limits, stated rather than closed

- **A typed private-use character can equal a minted sentinel**. `insert`
  keeps the Private Use Area (`stripForBuffer` strips controls only), and Nerd Font
  glyphs live there — Pomicons at U+E000–U+E00A are the first eleven sentinels. A
  reader who pastes one after that many chips draws a chip and submits its content.
- **The counter walks out of the Private Use Area after 6,400 chips**:
  `CHIP_BASE + n` passes U+F8FF into U+F900, a CJK compatibility ideograph a reader
  can type. Never reused is true there and the sentinel is no longer private.

Both are properties of the sentinel's alphabet rather than of the borrow, and changing
the alphabet is a §5c decision with its own readers (`chipAt`, `resolved`, the walk,
three rows that match the range by regex) — recorded here with numbers rather than
folded into this section.

---

## 5g. The reader's own bidi characters — drawn visible, kept as typed (ruling 71, F1401, F1403)

**Measured at `e4e99eb3`, before this section was written.** `/show ` then U+202E then `gpj.exe`, laid out at
width 30 with the prompt's `{2, 2}` gutter: the walk returned the row with the character raw, and `cursorCell`
answered column 8 on **both** sides of it — two positions on one cell, so the caret could not say which side of
the override it stood on. `commandRows` drew the same line raw above the entry. Neither row is a block, so C09
I127's resolve never saw either (F1401), and on a terminal that honours the override every cell after it on the
row is reordered — the prompt reads `exe.jpg` where the reader typed `gpj.exe`.

**And the walk disagreed with the terminal in the dangerous direction.** `cells()` reads all twelve bidi format
characters at zero; `@xterm/headless` gives U+2066–U+2069 and U+061C a cell of their own (F1403). Drawn raw, a
prompt row the walk filled exactly was one cell wider on screen than the walk counted, and every caret position
after the character was one cell left of the glyph it named.

**The remedy is display, not input.** The walk draws a cluster no `drawAs` substitutes through
`neutraliseControl` (C09 I128), so a bidi format character is drawn as its `<U+XXXX>` form: eight cells of
printable ASCII, the same at every rung, measured by the walk that draws it. Every grapheme index is untouched,
because the buffer is untouched.

### The walk, as a classification table

The interactions are **structural** — each row is two rules that both hold at rest — so the artefact is a table.
`A` is F1403's first group (U+202E, U+200F: xterm joins them to the previous cell at no width), `B` its second
(U+2066–U+2069, U+061C: a cell of their own at width 1), `C` the members it did not place (U+200E,
U+202A–U+202D). **Measured at `e4e99eb3`: all twelve are a grapheme cluster of their own** (`GCB=Control`)
whatever stands either side — `a`, U+202E, U+0301 is three clusters — so *one character* and *one grapheme*
are the same thing here, and a combining mark never joins one.

| Class × column | Which rules meet | Ruling |
|---|---|---|
| A, B, C × the prompt row | I18 *one walk* × C09 I128 | **Drawn `<U+XXXX>` by the walk**, so `layout`, `displayRows`, `cursorCell`, `selectionSpans` and `chipSpans` read one form. Before: raw, and at `B` a cell the walk did not count. |
| A, B, C × the caret | I1 *a grapheme index* × I4 *a column* | **One grapheme, one position, one step.** Before the character the caret stands on its `<`; after it, on the cell after its `>`. The eight cells between are not positions, as a wide glyph's second cell is not. `charLeft` and `charRight` cross it in one press and `deleteBackward` removes it whole — both unchanged, because the buffer is. Before: at `A` the two positions answered one cell; at `B` the position after answered a cell left of where the terminal drew the next glyph. |
| A, B, C × the wrap | I20 *moves whole* × I20 *overflows* | **One wrap unit**: the form moves whole to a fresh row, and at `usable < 8` it overflows like any typed cluster wider than its row. It is the reader's character, not C17's composition, so I32's elision does not apply. Unreachable in a session: `MIN_COLUMNS` is 60, leaving 58 usable. |
| A, B, C × a chip's ground | I26 *the ground comes off the walk* × this section's substitution | **Not a chip.** The walk records a chip span where `drawAs` answered and nowhere else, so the form takes no ground. `shown !== cluster` — the test the walk used — is true of both substitutions, and would have painted every override as a chip. |
| A, B, C × the selection wash | I21 × I18 | The wash covers the form's eight cells when the character is in the region: the walk's cells, so no rule of its own. |
| A, B, C × the command echo | C22 I33 × C09 I128 | **`commandRows` neutralises each line before `hardWrapCells`.** The measurer and the composer both call it, so the entry's height stays one number. **Stated divergence**: the echo is `hardWrapCells` over ASCII, so a form that reaches a row's end can break across two rows where the prompt moved it whole. The echo draws as a block would draw the same text (C09 I127), and a second wrap written here to agree with the prompt is the drift C14 I1 exists to prevent. |
| a chip whose `name` holds one | I25 *the label is C17's* × C09 I128 | **Neutralised in `chipLabel`, before it is measured or elided.** A chip's parts come from a producer — a completion source (C19 I28) or the paste path — and a file chip's name is a filename. The label is C17's composition, so it takes ruling 71's form, and the middle cut cuts the form as text. `chipAt`, the preview's content and `resolved` keep the parts as they are. |
| A, B, C × what is submitted | I9 × ruling 71 | **Kept.** `text`, `resolved`, the document's `command`, C23's argv and history hold the character as typed. It is the reader's input, and a command the shell altered on the way out is not the command the reader wrote. I9 strips controls on insert; a bidi format character is not one, and this section does not widen I9. |
| A, B, C × history recall | C20 × this section | History records the submitted line, so recall `setText`s the raw character and the walk draws it visible: no rule of its own. The reverse-search box is `Block[]`, which C09 I127 already neutralises. |
| A, B, C × the kill buffer, and a copy of a prompt region | I31 × C09 I129 | **Kept.** `⌃y` puts back what was killed, and I31 makes every copy destination the kill buffer's text. C09 I129 is about blocks and the prompt is not one: a copy of the reader's own line hands back the reader's own line. Stated rather than closed. |
| A, B, C × a held line (C22 I118), a reply (C23 I73) | I29 × I18 | Drawn by the same walk through the editor's `drawAs`, so no call-site change. |
| A, B, C × C23 I90's announcement | C23 I90 *as the prompt draws it* | `drawn` builds the line by its own loop over `drawAs`, so it takes the form there too — `drawAs(ch) ?? neutraliseControl(ch)` — or the prompt and the announcement disagree. **No row reaches the real `drawn`**: C23 T1.100's world supplies its own. |
| a combining mark after one | `GCB=Control` × I20 | Its own cluster before this section and after it; it draws on the form's `>`. Positions and widths do not move. |
| clean text | the control | `neutraliseControl` returns a clean string as itself, so a buffer holding none of the twelve lays out byte-identical to before, and the memo (I24) is untouched — its key is the buffer. |
| F1403's disagreement | `cells()` at 0 × xterm at 1 | **Removed from these rows rather than reconciled.** Neither row writes the character, so the disagreement has no cell to act on there; `cells()` is unchanged. |

**Not in this section**: the linear stream (C22 §6m) writes the typed command and its input line through
`stripControl`, which passes a bidi format character, and it is not a frame — a separate surface with a
screen reader's question in it (*is `<U+202E>` what a reader should hear?*), recorded as a finding with this lane.

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
  user typed. **A chip is the exception, and the reason is the rule's own**: its
  label is C17's composition, not what the user typed, so it is elided in the middle
  to the row (§5e, I32).

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
- **I20** — Rows are produced by walking clusters. A cluster that does not fit moves whole and leaves the cell behind it blank; a cluster wider than `usable` takes a row of its own and **overflows** it — **except a chip, whose label is the walk's to shorten (I32)**. C09 I9 may drop or substitute a glyph a block cannot draw and C17 may not: a block renders someone's data, an editor holds what the user typed.
- **I21** — **A selection is an anchor plus the cursor**, in the buffer's own grapheme indices, and the cursor **is** the head. `anchor === head` is no selection rather than an empty one, so the caret has one spelling. An extending motion moves the head and never the anchor; an unshifted motion collapses. Both halves are load-bearing and fail differently: a motion that moves the anchor is right on the first keystroke and wrong on the second, and a motion that does not collapse leaves a region nobody can see the end of.
- **I22** — **An edit over a region replaces it, in one undo unit.** `insert`, `deleteBackward`, `deleteForward` and `yank` remove the region and apply themselves as a single `structural` unit; `killTo` collapses rather than cutting, because a kill already names where to cut to and a region would be a second answer. Selection is not undo state: `undo` and `redo` collapse it, which is I16's rule inverted — a clipboard survives an undo and a statement about where the caret is does not.
- **I23** — **`collapse()` leaves the caret where it is, the text unchanged and the undo history untouched; only the region goes.** Not a motion and not an edit, so it takes neither's bookkeeping. The distinction from `move` is the caret: a collapse implemented as a motion is right about the region and wrong about where the caret is, which a test reading `selection` alone cannot see.
- **I24** — **`layout` answers from a one-entry memo keyed on the buffer, the width and both gutter figures**, and `displayRows` reads that memo rather than walking again, so I18's *one walk* becomes one per distinct question instead of one per call — 4.97 calls a frame measured, against a buffer that had changed on none of them (F914). **The chip table is deliberately absent from the key.** `drawAs` resolves a sentinel through it, so the obvious reading is that it belongs there; it does not, because the table's writers — `insertChip`, and `yank` adopting a chip another owner minted (I33) — each mint a fresh sentinel and insert it in the same call. A chip can therefore never be registered for a cluster already in the buffer, and the buffer moving is a strict precondition for the table moving. **That precondition is the memo's whole blind spot, and it is a property of the writer rather than of the key** — a second writer that registered a chip without inserting its sentinel would leave this memo stale, and nothing here would see it. T1.43 pins the precondition for the writer that exists and cannot watch one that does not; the limit is recorded rather than papered over with a key term that no input can make differ (A03 §2's vacuity class, arriving in a key).

- **I25** — *(§5c, §099, §101, `R-COL-005`, `R-BLK-628`, `R-BLK-116`)* **A chip's label is composed from its parts by C17, never supplied as a string.** `ordinal`, `kind`, `name` and an optional `lines`; the separator is the glyph table's, so the ASCII tier is taken from the same place every other separator is. Two rungs and one form: with colour, the name on `surface.bgDeep` in `tone.meta` with one space either side; at 1-bit, the same text in brackets and no ground. **The bracket is the unpainted rung of a painted thing** — §099's own caption is *a chip is one word that happens to be painted* — and reading the fixtures' two spellings as two formats is what would make the design contradict itself.

  **The ordinal is drawn only when the name does not identify the chip**, and the two figures are what settle it. §101 draws `[#1 json · 47L]` and §011 draws `[parse.ts · 184L]`: a paste's `name` is its *detected kind*, so two pastes of JSON are one word twice and the number is the only thing telling them apart; a file's name is its own and a second `#1` in front of it says nothing a reader did not have. So `file` drops the ordinal and every other kind keeps it.

  **`image` keeps it, and the first ruling here was wrong to drop it by inference.** *A filename identifies itself whatever it holds* is a clean-sounding extension of the discriminator and the design's only image chip contradicts it: §101 draws `#2 loss-curve.png`, and it is the sole image chip label in the fixtures. An arm extended by inference past its evidence is the class this repository names about itself — a true observation promoted to a general claim — and the correction is to follow the instances.

  **The evidence, stated with its weakest member.** For `file`: §099 draws `look at  parse.ts  and  #1 json · 47L  then` — **two chips in one row, one numbered and one not**, which can only be about the discriminator, and §011 draws `[parse.ts · 184L]`. Against: §101 draws `#1 package.json  47L`. §049's pair — `[#1 json · 47L]` and `[#2 nginx.conf · 44L]` — is not a counter-instance, because its own heading reads *image · paste chip · buttons · links* and `nginx.conf` there is a **detected format**, not an attached file. So the count is two figures for and one against, and the one for that decides it is the contrast drawn inside a single row; §101's subject is **where a preview goes**, and its label reuses §058's numbers with the names swapped. That figure is recorded as the counter-instance rather than explained away.

  **The minting is untouched**: every chip is still numbered, per owner's line and never reset within it (I33), and the number is what `chipAt` reads back with the chip; what changes is whether the label spends cells on it.
- **I26** — *(§5c, §099, I18, I20)* **A chip is one wrap unit and its ground comes off the same walk that measured it.** The atomicity is `walk`'s existing *a cluster that does not fit moves whole* and was satisfied before this section was written; `chipSpans` returns the cell ranges a chip occupies, as `selectionSpans` returns the region's, so nothing measures a chip twice and a ground cannot land where the label was not — and the range is recorded **by the walk as it draws**, never derived from the position pair around the chip, which names the row the wrap moved it off. ~~A chip wider than the whole row still overflows rather than being dropped (I20) — an editor never alters what the user typed, and a chip is what the user pasted.~~ **Superseded by I32**: the content is what the user pasted and the label is C17's composition (I25), so a label wider than the row is elided in the middle rather than overflowing, and its span is the drawn width.
- **I27** — *(§5d, §101, `R-BLK-823`, C22 I113)* **`chipAt()` answers the chip the caret is on — the one immediately before it, or the one immediately after when there is none before — and `null` otherwise.** Read from the side map `insertChip` writes and `drawAs` resolves through, never from a copy, so a preview cannot disagree with the label drawn beside it. The preference is backwards because `insertChip` leaves the caret past the chip it inserted, and both sides are read because position 0 has nothing before it.

- **I28** — *(§101, C23 I28, C23 I73)* **`snapshot()` and `restore()` carry the whole of what the reader can see of their line — the text, the caret and the region — and a restore is indistinguishable from never having left.** The pair exists because §101 gives one editor two owners in sequence: a question that takes a typed reply hands the prompt to the reply and must hand it back, and *hand it back* is a claim about a state rather than about a string. **Text alone is the shape that reads as enough and is not.** A reader who had selected a phrase and returns to find the selection gone has been told their line survived and can see that something did not, which is worse than a line that was cleared outright — the restore either is exact or is a second editing operation performed on their behalf.

  **Not `setText(text, cursor)` twice.** That pair cannot express a region at all, which is why the region is on the record rather than argued away: the type is what makes *restored exactly* checkable, and a snapshot that silently drops a field is a fixture for a test that cannot fail. **And not history's stash** (C20 §4), which holds text alone for its own good reason — a history walk restores a *draft*, which is a line the reader has not finished, where this restores a *state* the reader was in the middle of. Two mechanisms because they answer two questions; one type would have to be the wider one and would make C20's exclusion unstateable.

  The undo history is **not** in the snapshot and that is deliberate: a restore is not an edit and must not be undoable past itself, or `⌃z` after answering a question walks backwards into text the question composed.

- **I29** — *(§052, `R-QST-003`, → C23 I77, C16 I54)* **An owner's undo stack travels with its line.** `hold()` takes the text, the caret, the region **and the undo stack**, and leaves an empty line with an empty stack; `resume(held)` puts both back and discards the borrower's. Neither records a unit. §052 names four things a borrowing question owns — *its OWN buffer, selection, history and undo* — and three it shares — *paste rules, `⇧⏎` newline and `⌥←` word move*; `R-QST-003` is the same sentence as a rule: *editor code is shared; buffers, undo stacks, and histories are isolated by owner*. **`snapshot()`/`restore()` carry what the reader can see (I28), and the stack is not visible, which is why I28 alone could not hold this.** One stack served both owners, and it leaked at both ends: entering the borrow through `setText("")` recorded the reader's line as the reply's first unit, so `⌃z` inside a reply returned the held draft; and a reply that typed left units whose pre-states were its own text, which the restore — correctly recording nothing — also did not remove, so `⌃z` back at the prompt walked into the reply. The kill buffer is not among the four: it is the one clipboard (§5a), and §052's *paste rules are shared* is the same fact. **A form field is the third owner** (C04 §3ar, C16 I60): it takes the line with `hold()` on entering the field and gives it back with `resume()` however the field is left, and its own stack, like a reply's, never reaches the reader's. While it is held the shell draws it through this component's own walk — `layout` and `cursorCell`, exported for it, with the editor's `drawAs` — so a held line's chips are drawn as they were before it was held (C22 I118). That is one table serving every owner, and it is correct because no sentinel is ever rebound (I34); the ordinal counter is what travels with the line (I33).
- **I30** — *(§5b, §019, §063, §052)* **Every chord that extends the region has its unshifted chord bound to the motion it extends.** §5b is *every motion twice, and the second is the first with the anchor held* — and it was true of the editor's `#target` and false of the keymap: `⌥⇧←`/`⌥⇧→` extended by a word while `⌥←`/`⌥→` were bound at no target, so the anchor-held form existed and the motion did not. The design names the pair three times — §019 *⌥← and ⌥→ remain word-left and word-right in text fields*, §063 *⌥←→ is word movement*, §052 *⌥← word move* among what a borrowing question shares — and nothing checked a binding against its extension, because every row about word motion called `move` directly. **Asserted over the keymap, by pairing actions rather than listing keys**, so a rebinding moves the pair and an extend chord added without its motion fails. `→`'s motion is `acceptGhostOrForward`, which *is* the forward motion when there is no ghost, and the pairing says so rather than exempting it.
- **I31** — *(ruling 72, → C14 I61)* **A copy writes the kill buffer before any other destination, with the same text.** OSC 52, a platform tool and a file the reader asked for are destinations L4 sends the text to after `copyText(text)`; none is a second store, and `⌃y` yanks what they received. → T4.8
- **I32** — *(§5e, §099, `R-BLK-750`, `R-BLK-801`, `R-BLK-802`, C09 I103, I25, I26)* **A chip label wider than the usable row is drawn elided in the middle, at exactly the usable width, with its frame kept; below `frame + marker` it is the marker alone, padded to the width.** The cut is C09 I103's `truncate(…, "middle")`, and the marker is taken from the tier the separator came from, so the ASCII rung — which is also the wide rung (C02 I9) — draws `~`. The usable width is the width of the row the chip is drawn on, read after the walk opens it; a chip is shortened only on a fresh row, never to fit the remainder of a partly used one. **The elision is the walk's**, so `layout`, `displayRows`, `cursorCell`, `chipSpans` and `selectionSpans` all see the drawn width and a ground cannot run past the row. **I20's reason does not reach it**: the content is what the user pasted and is untouched — `resolved`, `chipAt` and the preview's title see the whole chip — while the label is C17's own composition (I25). A typed cluster wider than the row still overflows (I20). → T1.47, T1.54–T1.56, T3.18, T6.22
- **I33** — *(§5f, §052, `R-QST-003`, I25, I29)* **A chip's ordinal is its owner's line's, and the counter travels with the line.** `hold()` takes the owner's ordinal counter with its text, caret, region and stack, and the borrower numbers its own chips from `#1`; `resume(held)` puts the owner's counter back and discards the borrower's. **The one channel that joins two owners is the kill buffer** (§5a), so `yank` adopts a chip another owner minted — a fresh sentinel under the current owner's next ordinal, its parts unchanged — and inserts an own chip as it is. Without the adoption a reply's `#1` yanked at the prompt draws beside the prompt's `#1`, which is the two-`#1` prompt I25 exists to prevent. → T1.57, T1.58, T4.9, T6.23
- **I34** — *(§5f, I24, I29, C22 I118)* **A sentinel is minted from a counter that lives as long as the editor, and is never reused and never rebound; so one table serves every owner.** `hold()` and `resume()` do not touch the sentinel counter or the table, and the table is never pruned (a deleted chip comes back through undo). A held line therefore draws through the editor's `drawAs` exactly as it drew before it was held (I29, C22 I118), a chip that crosses owners through the kill buffer resolves, and a comparison of two raw buffers is a comparison of their chips. **Restarting the counter at a borrow is the defect this forbids**, and it is the remedy the review wrote down: the borrower's first paste would rebind the owner's first sentinel, the held line would draw and submit the borrower's chip, and I24's memo — keyed on the text — would answer one string for two chips. **Stated blind spots**: a typed private-use character that equals a minted sentinel is not a reuse and draws as that chip, and the counter leaves the Private Use Area after 6,400 chips. → T1.59, T6.24
- **I35** — *(C22 I144, I34, I25, I5)* **A chip is edited by re-minting it.** `editChip(chip, parts)` replaces every occurrence of the chip's sentinel in the buffer with a fresh sentinel carrying the same ordinal and `parts`, as one undo unit, and answers `true`; a chip whose sentinel is not in the buffer answers `false` and changes nothing. The old sentinel stays in the table (I34), so `⌃_` brings the chip back as it was, and a sentinel is still never rebound. → T1.60, T6.39
- **I36** — *(§5g, ruling 71, C09 I128, F1401, F1403)* **The walk draws a bidi format character as its `<U+XXXX>` form, and only draws it.** A cluster no `drawAs` substitutes is drawn through `neutraliseControl`, so `layout`, `displayRows`, `cursorCell`, `selectionSpans` and `chipSpans` all see the eight-cell form and no row the walk returns holds a bidi format character. The character is one grapheme — one position, one step, one wrap unit — and takes no chip ground: the caret before it stands on the form's `<` and the caret after it on the cell after its `>`. A chip's `name` is neutralised in `chipLabel` before it is measured or elided. **The buffer is untouched**: `text`, `resolved`, the kill buffer and history hold the character as typed, because it is the reader's input and only its display crosses the trust boundary (§5g). → T1.61, T1.62, T4.10, T6.40

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
20. Selection is one anchor plus the cursor, and an extending motion never moves the anchor. The defect that does is right on the first keystroke and wrong on the second (I21).
21. An edit over a region replaces it in one undo unit; `killTo` collapses rather than cutting; and a region does not survive an undo (I22).
22. `collapse()` drops the region without moving the caret, changing the text or touching the undo history — the one collapse that is neither a motion nor an edit, for native selection (I23).
23. `layout` memoises its last answer on buffer, width and gutter, and `displayRows` reads it, so a frame that asks five times walks the prompt once. The chip table is out of the key because its only writer moves the buffer in the same call, and that is a blind spot rather than a proof (I24).

24. A chip's label is C17's, composed from `ordinal`, `kind`, `name` and `lines` — not a string the application assembles, which would put §099's form in every application separately (I25). **A `file` alone drops it**, its name being its own; every other kind keeps it, including `image`, which §101 draws as `#2 loss-curve.png` (I25, §011, §099, §101).
25. A chip is painted, and the bracket is the rung where there is no ground to paint with. One form, two rungs, and the fixtures' two spellings are the two rungs rather than two formats (I25, I26).
26. The editor says which chip the caret is on and nothing else does, because the sentinel and its map are private to it (I27, §5d). The preview's place is C22's; the identity is C17's, and splitting them the other way would put a copy of the map in the composition root.
27. The line can be taken and given back exactly — text, caret and region — because §101 hands one editor to two owners in sequence and *given back* is a claim about a state rather than about a string (I28, §101, C23 I28).
28. A borrowed line gives its owner back the undo stack as well as the text, so neither owner's `⌃z` reaches the other's composition (I29, §052, `R-QST-003`).
29. Every region-extending chord at the prompt has its unshifted chord bound to the motion it extends, so holding `⇧` is the only difference between moving and selecting (I30, §5b, §019, §063).
30. A chip wider than its row is elided in the middle to the row, frame kept, because its label is C17's composition and not what the user typed; typed text still overflows (I32, §5e, §099).
31. A borrowed line numbers its own chips and the owner's numbering comes back with the owner's line; a chip yanked across owners takes the current owner's next number (I33, §5f, §052).
32. A chip's sentinel is never reused or rebound, so one table serves every owner and a held line draws as it did before it was held (I34, §5f).

---

## 10. Tests

Six tiers. Every cell of the §7 table is covered, and §7a's trace is walked as one
test rather than as its steps: the sequence is what the invariants do not constrain.

### Tier 1 — unit

- **T1.1** (I1): inserting into an empty buffer places the cursor after the inserted graphemes.
- **T1.1b** (I2): inserting *into* a buffer of wide clusters splits at a cluster boundary — mid-CJK and between two family emoji. Added by the mutation pass: replacing the grapheme split with a code-unit slice killed only the fuzz test, because every other insertion happened at position 0 or at the end, where the two indices coincide.
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
- **T1.32** (§5a): `⌃k`, then `y` over a region, then `⌃y` → the *copied* text is inserted. One clipboard, asserted as the sequence the ruling was made on rather than as two independent facts about one buffer.
- **T1.33** (§5a): a copy replaces rather than appending — two in a row leave the second.
- **T1.34** (§5a): a copy records no undo unit. `undoDepth` is unchanged and one `undo` press undoes the typing before it, rather than the copy.
- **T1.35** (§5a): a copy with no region is a no-op, not an emptying. The same guard `yank` has, and without it `⌥w` on a bare caret discards what a kill put there.
- **T1.36** (I16, §5b): an extending motion ends a kill run, **with no `move` between the kill and the copy**. The sequence is the assertion: every earlier row had a `move` in it, which ends the run too, so `extend`'s own call could be removed with nothing failing. The mutation pass is what found that, and it is what took a vacuous line out of `copy`.
- **T1.37** (I18, entry 23): `selectionSpans` washes a row the region passes **through** to the full width, and the row holding the head to the head. Both in one row, because "every row to the edge" satisfies the first alone and is a different defect.
- **T1.38** (entry 23): the last row stops at the head — the control for T1.37, and it cannot be folded into it: the defect it catches looks correct on any single-row selection.
- **T1.39** (entry 23): a region inside one row is that row's cells alone.
- **T1.40** (entry 23): an empty region has no spans, and the two ends may arrive either way round — asserted both ways, because a caller that sorted them once still passes a forward-only row.
- **T1.41** (I18): the spans come from the same walk `layout` returns rows from, asserted at a line that exactly fills its row — I19's trailing position, and the boundary a second measurement would part company at.
- **T1.23** (I21): `⇧→` twice from index 0 → the region is `[0, 2)`. **Two motions, because one passes whichever end moved** — an implementation that moves the anchor gives `[1, 2)` here and a correct-looking `[0, 1)` after one. The mutation this row exists for is the first one written for step 2.
- **T1.24** (I21): `⇧→`, `⇧→`, then `⇧←` → `[0, 1)`. The head walks back and the anchor has still not moved, which is the same defect asserted through a reversal rather than through a repeat.
- **T1.25** (I21): `anchor === head` reports `selection === null`, not an empty region. Asserted after `⇧→` then `⇧←`, so the state is reached by moving rather than by never having selected — the two spellings of "no region" are what this forbids.
- **T1.26** (I21): an unshifted `move` after an extension collapses; `selectAll()` then `charLeft` leaves no region and the cursor where the motion put it.
- **T1.27** (I21): `selectAll()` on a multi-line buffer selects across the newlines — the degenerate case is `[0, count)` and not the current line, which is what `lineStart`/`lineEnd` would give.
- **T1.28** (I22): typing over a region replaces it, in **one** undo unit — `undoDepth` rises by one and `undo` restores the whole original text including the region.
- **T1.29** (I22): `deleteBackward` over a region removes the region and **not** an extra character. The off-by-one is the natural implementation, and a region of one grapheme makes the two indistinguishable — so the row uses three.
- **T1.30** (I22): `killTo("wordLeft")` with a region open cuts by the motion and collapses, rather than cutting the region. The kill buffer holds the motion's text, which is what says which of the two answers was taken.
- **T1.42** (I23): a region open, `collapse()` → `selection === null`, the cursor **where the head was** (not where `charLeft` would put it — the control that tells a collapse from a motion), the text unchanged, `undoDepth` unchanged; and on a bare caret it is a no-op.
- **T1.43** (I24): the memo agrees with a fresh walk — §7b's buffer at a spread of widths and both gutters, each answer equal to a freshly constructed editor's first, `displayRows` equal to `layout().length` on both, and the rows **frozen**, which is the hazard the memo creates rather than one it inherits. Then the four invalidations, one key term each, because a memo that serves a stale answer passes every agreement row: an edit, a second width, and the gutter's two figures **moved one at a time and each from a fresh editor**. Both of those clauses were learnt from survivors. Written as `{2,2}` against `{0,0}` the gutter row moved both figures, so `cont` caught the mutation and `first` was never the deciding term; written against one editor, the second call missed on `first` before `cont` could decide, so `cont` survived a row that read as covering it. And the `cont` half needs a buffer whose continuation rows are *full* — §7b's carry eleven cells and eight and fit whatever `cont` is. Last, the precondition I24 rests on rather than the key term it rejected: **`insertChip` moves the buffer**, so a chip can never be registered behind a buffer the memo has already answered for. That row watches the writer that exists and is silent about one that does not — the blind spot stated, not closed.
- **T1.31** (I22): a region open, `undo` → no region afterwards. The control is the kill buffer in the same row, which **does** survive — I16 and I22 in opposite directions, asserted together so neither can be satisfied by a rule that collapses everything or nothing.
- **T1.44** (I25, §5c): the label is composed, not carried — a chip minted with `{ordinal: 1, kind: "paste", name: "json", lines: 47}` draws `#1 json · 47L` between two spaces with colour and `[#1 json · 47L]` at 1-bit, and an image chip with no `lines` draws neither a separator nor a bare `L`. The ASCII tier takes the glyph table's separator, asserted against `glyphs()` rather than against a literal, so the row cannot pass by agreeing with a copy.
- **T1.45** (I26, §5c, §099): a chip moves whole — a label that does not fit the cells left on a row appears in full on the next, and no row holds a prefix of it. Asserted over the whole label rather than at one width, because a half-painted chip is *two things that look like chips* and a row checking only the first cell cannot tell them apart. **This was already true when the section was written**, so the row is a watch on a built property, and its fabricated violation is the walk's atomicity removed.
- **T1.46** (I26, §5c): `chipSpans` agrees with the walk that drew the label — every span's cells slice exactly the chip's label out of the row `layout` returns, at a spread of widths and on both sides of a wrap. A span that is right about the row and wrong about the column paints the prompt's own text as a chip, and no assertion about the presence of a ground would see it.
- **T1.47** (I32, I25, §5e): a chip wider than the whole row is drawn at exactly the row's width and still has a span naming exactly its cells. **Amended — it asserted the overflow**, and the reason it gave (*a chip is what the user pasted*) is true of the content and not of the label; the row now holds the ground to the drawn width, and `resolved` still returns the whole content.
- **T1.48** (I27, §5d, §101): `chipAt` answers the chip before the caret across a buffer holding two chips and text between them — after the first it is the first, after the second it is the second, and at position 0 with a chip at the head it is that chip, which is the forward arm. `null` in the middle of the text, which is the control: without it *the caret is on a chip* is satisfied by a reader that answers the last chip minted wherever the caret is. The map is the editor's own, asserted by minting a chip and reading its `content` back rather than its label.
- **T1.49** (I28, §101): a snapshot taken over a buffer with a caret inside it and a live region restores all three, and the row's discriminator is the **region** — text and caret alone are restored by a build that never knew about the third field, and that build is the one this invariant exists to refuse. Asserted after an intervening edit that changes all three, so the restore is reading the snapshot rather than finding the editor where it left it. The control is a snapshot taken with no region: restoring it leaves none, rather than leaving whatever the editor had.
- **T1.50** (I28): a restore is not an edit — `undo()` after it does not walk back into the text that was there in between. A restore that went through `insert` passes every assertion about the three fields and leaves the reader one `⌃z` away from the question's own composition. **Amended — the row's fixture could not fail it** (I29). Its other owner writes with one `setText`, recording a single unit whose pre-state is `mine`, so walking undo meets `mine` and `""` and never `theirs` however the stack is shared. The row still asserts what it says about `restore`; the stack's isolation is T1.51 and T1.52.
- **T1.51** (I29, §052): `hold()` over a line with undo history → the borrowed line is empty with **no** undo depth, and `⌃z` inside it never produces the held text. The discriminator is the entry: a `hold` written as `snapshot` then `setText("")` passes every assertion about the empty line and fails this one.
- **T1.52** (I29, §052): a borrower that types in **several** units — text, a motion that ends the run, more text — then `resume(held)` → the owner's undo walk never contains any of the borrower's intermediate text, and redo is the owner's too. **This is the row T1.50 could not be**: its other owner composes with one `setText`, whose only unit's pre-state is the reader's own line, so no undo walk could meet `theirs` whatever the stack did.
- **T1.53** (I30, §5b, §019, §063): for every `prompt` binding whose action is an `extend*`, the same chord without `⇧` resolves at `prompt` to the paired motion. Red on the tree it was written against — `⌥←` and `⌥→` resolve to nothing — and the control is the four pairs that already held: `⇧←`/`←`, `⇧→`/`→`, `⇧home`/`home`, `⇧end`/`end`.
- **T1.54** (I32, §5e, C09 I103): a label wider than the usable row, at both rungs → the drawn label is exactly the usable width, keeps its frame (the brackets; the ground's two spaces), and is `truncate(inner, U − 2, tier, "middle")` — **both** the head (`#1`) and the tail (the size) present, which an end cut fails. The span slices exactly the drawn label out of its row, and the cursor after it is on the next row at the gutter. The control is a label that fits, drawn whole.
- **T1.55** (I32, §5e): the usable width is read after the walk opens the row — with `{first: 0, cont: 6}`, a chip that does not fit after text on row 0 is elided to row 1's usable width, not row 0's; and a chip wider than a partly used row is moved to a fresh row before it is elided, never cut to the remainder.
- **T1.56** (I32, §5e): the narrow end — usable widths 1 and 2 draw the marker alone padded to the width, 3 draws the frame around the marker; the ASCII tier's marker is `~` and the unicode tier's `…`, taken from `ChipLook.unicode` rather than from a literal.
- **T1.57** (I33, §5f, §052): a prompt with one chip, `hold()`, a paste in the borrow → the borrow's chip is `#1`; `resume`, a paste at the prompt → `#2`. Both halves are the row: the first alone passes a counter that is reset and never restored, the second alone passes the shared counter.
- **T1.58** (I33, I34, §5f, §5a): a chip killed inside a borrow and yanked at the owner's prompt → it resolves to its content and takes the owner's next ordinal, a second yank takes the next again, and an own chip killed and yanked keeps its sentinel and its number (the control: adoption is for a foreign chip only). The reverse direction too — a chip the owner killed, yanked inside a borrow, is the borrow's `#1`.
- **T1.59** (I34, I24, §5f): across `hold`, pastes in the borrow, and `resume`, every minted sentinel is distinct and the owner's held chip draws and resolves as it did before the borrow — asserted through the memo, by laying out the owner's line before the borrow and again after it, so a counter restarted at `hold` fails on the label and on `resolved` both.
- **T1.61** (I36, I18, I4, I26, §5g): `/show a`, U+2066, `b`, U+202E, `c` at width 30 with `{2, 2}` → the one row is `/show a<U+2066>b<U+202E>c` and holds no bidi format character; `cursorCell` either side of each character is the form's first cell and the cell after its last, eight apart; `chipSpans` is empty; `selectionSpans` over the U+202E alone covers its eight cells; `text` and `resolved` hold both characters raw. At a width where the form reaches the row's end it moves whole to the next row. The control: a clean buffer's rows are what they were.
- **T1.62** (I36, I25, I32, §5g): a `file` chip named `a`, U+202E, `gpj.exe` → its label draws `<U+202E>` and holds no bidi format character, and elided to a narrow limit it is exactly that limit wide; `chipAt` answers the name raw.
- **T1.60** (I35, I34): a buffer `ab`, chip `#1` (3 lines), `cd`; `editChip(chip, {…parts, content: new, lines: 2})` → `true`, the rows draw `#1 · 2L`, `resolved` holds the new content, `chipAt` answers the new record with ordinal 1; `undo` → the old chip and its content; a chip not in the buffer → `false` and nothing changes.

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
- **T3.6** (I19, I20): `displayRows` at width 1 → one row per grapheme, a two-cell cluster included, **plus I19's trailing row**: `日本語` at width 1 with a zero gutter is **four** rows, because the count is positions and the last cluster fills its row exactly. No division by zero and no dropped text. Three was the number before the walk was run, and it is the same off-by-one as T3.8b wearing a different coat. §7b records that the terminal draws two cells where the count says one at `usable ≤ 1`, and that nothing floors the width.
- **T3.7** (I20): a double-width glyph straddling the wrap boundary → wraps whole, and `displayRows` accounts for the wasted cell. At width 9 with `{2,2}`, `ab日本語` is `ab日本` and `語`.
- **T3.8** (I19): a buffer ending in `\n` → the trailing empty line counts as a row.
- **T3.8b** (I19): a logical line whose last cluster exactly fills its row → the trailing row is emitted, and `abcdefgh\nx` at width 10 with `{2,2}` is **three** rows. `ceil` gives two and leaves the cursor at index 8 with no row.
- **T3.9**: `yank` with an empty kill buffer → no-op.
- **T3.10**: `undo` on a clean editor → false.
- **T3.11**: `redo` with nothing to redo → false.
- **T3.12** (I11): 1,000 sequential edits → the stack holds 200 units, the oldest discarded; the most recent edit is always undoable.
- **T3.13**: `setText` from history → one undo unit; undo restores the prior buffer including cursor.
- **T3.14**: a paste containing `\n` → inserted as structure, still one undo unit.
- **T3.15**: a 1 MB paste → completes in time **linear in the paste** — the whole against an eighth of it, each into a fresh editor, timed interleaved in one process, under 32× where linear is 8× (a shape since RULING-a, F1447; the 2 s wall-clock budget read 248–452 ms at load 9–13); `displayRows` stays linear — **counted, not timed**. The walk calls `drawAs` once per cluster, so a counting `drawAs` reports the inner loop's trip count and the row asserts one visit per cluster: exact and load-free, where the duration ratio it replaces spanned 1.38 to 3.06 against a bound of 3 and was red three times. The durations stay printed as evidence with the resolution control and carry no assertion. Blind spot: a step that becomes O(rows) is quadratic and invisible to a count of iterations (F1091, F1084).
- **T3.16**: a lone surrogate or invalid UTF-8 in a paste → replaced, never crashing the segmenter.
- **T3.17**: `killTo("bufferStart")` from the middle then `yank` at the end → text order preserved.
- **T3.18** (I32, C09 I9, §5e): a chip whose name holds wide clusters (`日本語` and a ZWJ family) elided at every usable width from 1 to its natural width → the drawn label is exactly the width every time, no cluster is split, and the elided form never holds a half of a two-cell glyph.

### Tier 4 — integration

- **T4.1** (with C16): printable keys insert; a `paste` event inserts atomically as one undo unit.
- **T4.2** (with C16): `Alt-Enter` and `Ctrl-J` both insert a newline on a terminal that cannot distinguish `Shift-Enter`.
- **T4.3** (with C09): `displayRows` and `cursorCell` use the same `cells()` as every block, so the prompt and transcript agree on width.
- **T4.2b** (with C16): a bare `Enter` inserts nothing. The half that fails if `\r` is ever mapped to Ctrl-J to make T4.2 pass, which is the shortest route to a green T4.2 and would make Enter stop submitting.
- **T4.3b** (with C09): the gutter is added to `cells()` rather than folded into it — the row carries no gutter and the column includes it.
- **T4.4** (with C18): the buffer is classified without C18 mutating it.
- **T4.5** (with C19): the cursor position determines the completion context; accepting a candidate inserts as one undo unit.
- **T4.6** (with C20): history navigation calls `setText`; the typed draft is restored on return, cursor included.
- **T4.7** (with L4): the prompt's rendered height equals `displayRows`, so the viewport height is correct — asserted on the frame, not the editor.
- **T4.8** (I31, with L4): a copy sent by OSC 52, then `⌃y` → the prompt holds the text the OSC 52 payload decodes to. Written in C14's `copy-clipboard.test.ts` beside T4.43, whose session it shares.
- **T4.10** (I36, C22 I33, C09 I131, with L4, §5g): through a built session at 80 columns, `/show a`, U+2066, `b`, U+202E, `c` typed at the prompt and the written bytes read through `@xterm/headless`: the prompt row's cells read both forms; the terminal cursor, moved by `←` to either side of each character, stands on the form's `<` and on the cell after its `>`; after `⏎` the echo row's cells read the same forms; and the local verb is handed both characters raw.
- **T4.9** (I33, I34, with C16 and C23): through a built session's router — a multi-line paste at the prompt (`#1`), `reply…`, a multi-line paste in the reply → the reply's line draws `#1`; `⌃u`, answer; the prompt's line draws its own `#1` again; `⌃y` → the yanked chip draws `#2` and `resolved` holds both pastes' content. Written in `typed-reply.test.ts`, whose session it shares.

### Tier 5 — e2e

All five need a running shell and are deferred on L4, in the form `todo-expiry` reads, so they expire on the commit that makes `src/shell/session.ts` real. The properties are not deferred with them: T5.2's paste-is-one-command and T5.3's cursor-lands-where-the-user-sees-it are asserted at tiers 1 to 4 against the editor, and what waits is the half only visible from outside — that the frame agrees.

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
- **T6.20** (I23): `collapse()` implemented as `move("charLeft")` → T1.42 fails on the cursor; implemented as a recorded `structural` edit → T1.42 fails on `undoDepth`.
- **T6.21** (I24): one mutation per key term, and each is the term dropped — the width, the buffer, the gutter's first column, the continuation gutter — plus the whole comparison replaced by `hit !== null`, which is the shape a reader skims past because the null guard reads as the check, and the freeze removed. Six, all caught. Two of them were survivors first, and both indicted the row rather than the rule: the gutter row moved two figures at once, and then moved them on one editor whose single-entry memo had already missed on the other. `displayRows` calling `this.layout(…).length` rather than `layout.ts`'s own is deliberately **not** mutated — the two spellings cannot disagree, so it is a change in who walks and not in what is answered, and a survivor whose reason is known before the run is a comment rather than a row (A03 §2).
- **T6.22** (I32): the elision's `"middle"` cut replaced by an end cut → T1.54 fails on the tail; the elision removed, which is `c8c7a77e`'s overflow → T1.47 and T1.54 fail on the width; the limit read before `open()` → T1.55 fails.
- **T6.23** (I33): `hold()` leaving the ordinal counter on the editor → T1.57 fails on the borrow's `#1`; `yank` inserting a foreign sentinel as it is → T1.58 fails on the ordinal.
- **T6.24** (I34): `hold()` restarting the sentinel counter, which is the review's remedy as written → T1.59 fails on the held chip's label and on `resolved`.

---
- **T6.39** (I35): the re-mint taking a fresh ordinal → **T1.60** fails on the ordinal, 3 for 2. The row first said *the chip draws `#2`*; the editor's own label does not draw the ordinal (`b.ts · 2L`), so the assertion is on `chipAt()`. `tools/mutate/runs/c17-chip.mjs`.
- **T6.40** (I36): the walk drawing an unsubstituted cluster raw → **T1.61** and **T4.10** fail on the rows and the caret; the chip span recorded on `shown !== cluster` → **T1.61** fails on `chipSpans`; `chipLabel` measuring the raw name → **T1.62** fails; the buffer neutralised on insert → **T1.61** fails on `text`. `tools/mutate/runs/c17-bidi-display.mjs`.

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
