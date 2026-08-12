# Note — the render chain, measured before it is changed

| | |
|---|---|
| **Status** | Measurement. Step 0 of tier 3 row 1 (F90). No code changed to produce it. |
| **For** | The four stages — output diffing, render caching, block windowing, `cells()` |
| **Against** | `8d624ba`, node v22.23.2, inside the `calcium` devcontainer |
| **Instrument** | `tools/bench/frame.mjs` — the public surface, against `dist/` |

**Why a script and not a test.** A timing assertion under contention is a flake and
not a gate (group 12, `VERIFYING.md` §7). This prints numbers and asserts nothing.

**Why the public surface.** The expensive path — `visibleRows` in `session.ts` — is a
private function inside a class. Timing it honestly means being a consumer:
`createTui`, a greeting, and keystrokes on a fake stdin. The frame that comes out is
the frame a user sees, composed by `composeFrame`, with no second composition
anywhere (SS48).

---

## 1. The six targets, before

Recorded per target, each to its own file, exit code echoed — never through a pipe.

| target | exit | counters |
|---|---|---|
| `check` | 0 | — |
| `enforce` | 0 | 178 files · 25 specs · 7083 invariant references resolved |
| `audit` | 0 | — |
| `test` | 0 | 146 files · **2584 passed**, 2 todo (2586) |
| `golden` | 0 | 5 files · **59 passed** (59) |
| `e2e` | **2** | 13 failed / 3 passed files · **44 failed** / 50 passed / 7 todo (101) |

**One of six is red, not two.** The branch carried *"two of `make all`'s six targets
were red the whole time"* from F131 and F133, and at this commit `golden` is green —
F131 was fixed during row 2 and the sentence was not re-measured afterwards. `e2e`
reproduces F133 exactly: 44 failed / 50 passed / 7 todo, the same figure F133 records
at `7241627` and at `c4b2869`. It is not this row's, and it is expected to be
identical on the other side of the diff.

This is the *ask where a claim was written down* instrument, and it cost one command:
the claim was carried in a commit message and a finding, and one of its two halves had
stopped being true.

---

## 2. The frame, measured

200×50, one `patch` block, one hunk. **47 of the patch's rows are on screen at every
size** — the transcript is the same 50 rows whether the block holds ten lines or five
thousand.

| transcript | keystroke → frame | drag step (width changes) | SIGWINCH, same width | bytes written per frame |
|---|---|---|---|---|
| empty | **1.8 ms** | 1.0 ms | 0.7 ms | 10,190 |
| 10-line patch | 13.2 | 13.1 | 11.8 | 13,462 |
| 50 | 49.4 | 49.9 | 49.8 | 25,680 |
| 250 | **159.7** | 173.5 | — | 25,833 |
| 500 | 297.9 | 316.3 | — | 25,833 |
| 1,000 | 539.5 | 621.2 | — | 25,679 |
| 2,000 | 1,128.2 | 1,389.7 | — | 25,679 |
| 5,000 | **2,793.2** | 3,252.5 | 3,120.2 | 25,679 |

Medians of 10–20 reps. First frame at 5,000 lines: **11.1 s**.

**Linear in the lines the block holds, flat in the rows the screen shows** — about
0.56 ms per patch line asymptotically, dearer per line at small sizes. That is F90's
diagnosis with a number on it: virtualisation is at *entry* granularity, and the
renderer then renders each entry whole.

**It is not an exotic case.** A 250-line diff — an ordinary code review — already costs
**160 ms per keystroke**. The frame's own fixed cost, with an empty transcript, is
1.8 ms, so essentially all of it is the transcript.

---

## 3. The drag: a recorded negative, and it inverts

The concern was that `resize` is never delayed (C03 I2) and a width change clears every
cached height and rebuilds the Fenwick index (C14 I8), so a drag is N rebuilds + N
renders + N writes with **none of the four stages helping**.

**Measured, the remeasure and the rebuild are invisible.** At every size, a
width-*changing* SIGWINCH costs the same as a same-width one and the same as a
keystroke — 3,252 against 3,120 against 2,793 ms at 5,000 lines; 13.1 against 11.8
against 13.2 at ten. The Fenwick rebuild and the remeasure are arithmetic over block
metadata; the render is Ink over every line. The second is three orders of magnitude
larger and it is the whole of both figures.

**So the conclusion inverts rather than closing.** The drag is not a separate concern
that the stages miss — **the drag's cost *is* the render**, and stage 3 fixes it on
exactly the same terms as it fixes a keystroke. What is closed is the worry; what
replaces it is that a resize needs nothing of its own.

**Where the original reasoning went wrong is worth naming**, because it is a shape
rather than a slip: every step in it is true — resize is immediate, the cache does
clear, the index does rebuild — and the conclusion does not follow, because nothing
in the chain compared the cost of the invalidated work against the cost of the work
that was never in question. A correct sentence justifying the wrong decision.

**The one thing that is genuinely per-resize**: the same-width SIGWINCH still costs a
full frame. C14 I21 refuses the *resize*, which saves the remeasure, and C03 has
already set `contaminated` at commit time — so the repaint happens regardless. That is
correct (the screen's contents are unknown after a SIGWINCH) and it is not free.

---

## 4. Two findings from step 0, neither of them a timing

**a. A malformed greeting is silent, and the bench spent an hour reporting a blank
screen.** The first draft handed the greeting a six-field `meta`. C04's validator
refuses the document; `appendAndCommit` (`execution.ts:216`) swallows the throw;
`session.ts`'s greeting arm swallows a rejection on top of it. The session starts,
draws its header and its prompt, and shows nothing — **and nothing anywhere says
why**.

This is F15's class arriving through a second route. F15 is filed on a verb's
document; the greeting is a producer with two catches between it and the screen rather
than one, and the tier-3 ruling F15 owes should be read as covering both.

**b. The fixture had to be shown to respond, and it did not.** The dead-fixture
numbers were flat — 1.5 ms at 100 lines, 4.6 at 5,000, 2.2 at 50,000 — and they were
*plausible*. They match the empty-transcript floor exactly, which is what they were.
Nothing about them reads as wrong; the only reason they were caught is that the
fixture was varied across two orders of magnitude and did not move.

The liveness check that now guards the run was itself wrong on its first draft — it
asserted the patch's **path header** was on screen, and the viewport follows the tail,
so the path row is thousands of rows above what is drawn. A live fixture failed it.
Reading the frame is what said which of the two was broken.

---

## 4a. Stage 1 landed, and the number that undercuts its billing

`8d624ba` → stage 1, same machine, same instrument.

| transcript | bytes/frame before | after | keystroke before | after |
|---|---|---|---|---|
| empty | 10,190 | **236** | 1.8 ms | 1.8 ms |
| 50 lines | 25,680 | **264** | 49.4 | 48.1 |
| 250 | 25,833 | **291** | 159.7 | 150.0 |
| 1,000 | 25,679 | **373** | 539.5 | 523.2 |
| 5,000 | 25,679 | **509** | 2,793 | 2,896 |

**Between 50× and 97× fewer bytes, and no measurable change in wall clock.** The
brief ranked stage 1 first as *"cuts every frame, largest effect, smallest
change"*. The first and third are confirmed; **the second is not, on this
measurement**. The cost of a frame here is the render, and the write against a
fake stream in-process is free — so the time column is unmoved and every
difference in it is inside the noise.

That does not demote the stage, and it changes what it is for. 25.7 KB per
keystroke is what goes down a pipe: an ssh session, a slow emulator, tmux
forwarding to a second terminal, a `script(1)` capture. None of those are on this
machine and all of them are where a shell is used. **What the measurement can say
is bytes; what it cannot say is latency on a link it does not have** — and
reporting the ratio as though it were a speed-up would be the microbenchmark
error this row's acceptance test exists to avoid.

**So the ordering argument survives on its other leg**, which is the one that was
always load-bearing: stage 1 is first because it is small, contained to one
function, and its invalidation story already existed. Not because it was going to
be the largest win.

---

## 4b. Stage 2 landed, and it did exactly what the spec said it would not

| transcript | keystroke, stage 1 | **stage 2** | drag step, stage 1 | **stage 2** |
|---|---|---|---|---|
| 250 lines | 150.0 ms | **22.7** | 173.5 | **166.2** |
| 1,000 | 523.2 | **31.5** | 621.2 | **605.0** |
| 5,000 | 2,896 | **23.9** | 3,252 | **3,099** |

First frame at 5,000 lines: **3,206 ms**, against 11,127 at the baseline — the
gain there is stage 1's build plus warm-up noise, not the cache, which by
construction cannot help a frame that has never been drawn.

**A keystroke is now flat in the block size.** 22.7, 31.5, 23.9 — the transcript
is served from the cache and only the chrome and the prompt are composed.

**And the drag is untouched, which is C22 I59 arriving as a shape rather than as a
sentence.** A width change invalidates every slot, so every step of a drag pays
the full render: 3,099 ms at 5,000 lines against a 24 ms keystroke. Before this
stage the two were equal.

**So §3's conclusion needs its third correction, and it is not a retraction.**
The claim there — *the drag's cost is the render, and stage 3 fixes it on the
same terms as a keystroke* — is still true. What has changed is the profile.
Stage 2 did not make the drag slower; it made everything else faster, and in
doing so turned a uniformly slow shell into a fast one with a **130× spike** on
resize. That is the same transformation C22 I59 warns about — continuous lag into one
long stall — arriving on a second axis nobody had named.

**A number worth chasing at stage 4.** The residual keystroke is ~23 ms flat,
against 1.8 ms with an empty transcript, and the transcript's lines are now
*cached*. Something costs 20 ms per frame that is neither the block render nor
the chrome. The candidate is `exact()` — `fitStyled` over 47 rows × 200 cells,
which segments graphemes on every cell of every row of every frame. If that is
what it is, stage 4 is worth considerably more than the brief expected, and it is
measurable only now that the render no longer dominates. To be settled after
stage 3, not before.

---

## 4c. Stage 3 landed, and it works on one kind of five

**Where the seam applies, it does what the row was for.** A `logs` block, which
is the one divisible kind that declares a window:

| block | keystroke | drag step | same-size SIGWINCH | first frame |
|---|---|---|---|---|
| 1,000 lines | 13.7 ms | **18.2** | 3.6 | 124 |
| 5,000 | 6.2 | **15.4** | 3.7 | — |
| 50,000 | **5.5** | **17.1** | 4.7 | — |

Against the same sizes as a `patch`, which declares none: 21.9 ms a keystroke and
**597.6 ms a drag step** at 1,000 lines, 3,038 ms a drag step at 5,000. **Flat in
the block's size, and the resize spike stage 2 created is gone** — 17 ms against
3,038.

### The structural finding, and it is why four kinds are not windowed

Indexing the walk by rule interaction, the cell where *a window is a slice of the
rows* meets *a row's layout is derived from the block*:

| kind | what is derived from the whole block | windowable |
|---|---|---|
| `logs` | nothing — the level column is a constant and the message takes the residual | **yes** |
| `patch` | `numberWidth(block)` walks every line of every hunk for the gutter | no |
| `keyValue` | `widest(block.rows)` sets the key column | no |
| `table` | `planColumns` over every row | no |
| `code` | `tokenise` runs over the whole text, so a construct spanning the boundary highlights differently | no |

**A window that changed the layout would be exact in height and wrong on screen**
— the gutter would narrow and the text shift as the reader scrolled, which is
precisely the drift C14 exists to prevent and the failure that *looks* like the
terminal misbehaving rather than like a defect. Height conformance cannot see it:
`measure − skipRows === to − from` holds perfectly while every row moves sideways.

**So the four are omitted rather than shipped wrong**, and the remedy is not a
harder window. It is that a window has to carry its **derived layout** — a pinned
gutter width, a pinned column plan — which is a new field on four public block
types and therefore tier 2's business, before the freeze, rather than this row's.

**What that costs is narrower than it first reads, and §6's frame-read is what
said so.** Typing into a 5,000-line diff — F90's own acceptance case — is
**10 ms a keystroke**, from 2,793 at the baseline, because stages 1, 2 and 4 all
apply to a `patch` and only stage 3 does not. What stage 3's absence still costs
on an unwindowed kind is the two things the cache cannot serve:

| | baseline | now | windowed kind |
|---|---|---|---|
| keystroke, 5,000 lines | 2,793 ms | **10** | 1.8 |
| first frame | 11,127 | **3,206** | ~60 |
| drag step | 3,252 | **~3,000** | 9 |

So the mechanism is built, proven and measured on a kind that is not the one it
was aimed at — and the residue is *opening* a large diff and *resizing* while one
is on screen, not reading or typing in it.

---

## 4d. Stage 4 was ranked last and is the second-largest win

`cells()` gains a printable-ASCII path: for a string whose every code unit is in
`[0x20, 0x7e]`, `stripControl` removes nothing, the segmenter yields one cluster
per character and each is one cell — so the count **is** the length. An equality,
not an approximation, and tested as one.

| case | stage 3 | **stage 4** |
|---|---|---|
| empty transcript, keystroke | 1.8 ms | **1.4** |
| 5,000-line `logs`, keystroke | 6.2 | **1.8** |
| 5,000-line `logs`, drag step | 15.4 | **9.0** |
| 1,000-line `patch`, keystroke | 21.9 | **9.9** |
| 1,000-line `patch`, drag step | 597.6 | **415.4** |

**The brief ranked this fourth on the reasoning that most calls vanish with the
cache.** They do not. `exact()` runs `fitStyled` over every row of every frame,
and that is *after* the transcript is served from the cache — the cache removes
the block render and leaves the padding untouched. A 3.4× on the windowed
keystroke and 2.2× on the unwindowed one, for eleven lines of code.

**The ordering claim it undercuts is its own.** *Only worth measuring after 1–3*
was right about the method and wrong about the size, and the reason it reads as
right is that the saving is invisible while the render dominates: at the baseline
this would have been 0.5% of 2,793 ms. The order was still correct — measured
first, it would have been dismissed.

---

## 6. The acceptance test, which is a frame-read

**Type into it and read the screen**, frame by frame, reconstructed from the
bytes. A microbenchmark that improves while the frame still stutters has measured
something other than what a reader experiences.

Six keystrokes into a 5,000-line document, at 200×50:

| | `logs` (windowed) | `patch` (not) |
|---|---|---|
| per keystroke | 1.8–2.6 ms | 9.6–11.1 ms |
| bytes per frame | 236 | 236 |
| content rows | 47 on every frame | 47 on every frame |
| frame width | exactly 200 on every row of every frame | same |
| prompt | reads `search` after six keys, in order | same |

**The three things a timing cannot say**, and each is a defect one of these
stages could have introduced: every row of every intermediate frame is exactly
`columns` cells — a diffed row that came up short would leave the previous frame
showing through precisely where it was written; the content row count never moves
while the prompt grows — a window off by one would show 46 or 48; and every
keystroke reaches the prompt in order — a cache serving a stale row would lose
one silently.

**Against the baseline this is the row's claim met**: 2,793 ms a keystroke into a
5,000-line diff, now 10.

---

## 7. What is still owed, with the reason each is owed rather than done

**a. The bound — a ruling, deliberately not taken here.** Even windowed, `measure`
walks the whole block once to know its height. Nothing bounds a single block's
size: D40 caps *blocks per document* (C13 I17), `MAX_ROWS = 2_000` at
`data/adapters/fallback.ts:39` is the fallback adapter's own limit, and an app
adapter has no bound at all. What is owed is a **placement** decision — C13 on
append, C07 at adaptation, or C09 at measure — and what *overridable* means. The
marker is what keeps it honest: `fallback.ts:251` already writes *"Showing the
first 2,000 rows; N more were not rendered"*, and a silent truncation is the
empty-block class.

**Measured, the bound is cheaper than it was.** The first frame of a 5,000-line
patch is 3.2 s, and of a 50,000-line `logs` about 60 ms — so the cost the bound
would remove is now concentrated in the unwindowed kinds, and shrinks again with
§7b. That is an argument for taking §7b first.

**b. A window must be able to carry its derived layout**, which is what makes the
other four kinds windowable — a pinned gutter width for `patch`, a pinned column
plan for `table` and `keyValue`, a tokenisation anchor for `code`. It is a new
field on four public block types, so it belongs to **tier 2, before the freeze**,
and it is the single change that would finish this row's stage 3.

**c. F133 is unchanged and is not this row's.** 44 failed / 50 passed / 7 todo at
the baseline and after every stage.

**d. `logs` is the only kind whose window is exercised by a corpus.** The height
property is generic and holds for any kind that declares one, but until §7b lands
there is one such kind, and a conformance suite covering one arm is covering one
arm.

---

## 5. What the numbers say about the order

| stage | what the table says |
|---|---|
| 1 · output diffing | 25.7 KB written per frame regardless of what changed, and 10.2 KB with an empty transcript. Every frame, every size |
| 2 · render caching | Turns 2,793 ms into 2,793 ms once and ~1.8 ms after — **a stall, not a fix**, and the table is where that is visible rather than argued |
| 3 · window the block | The only stage whose effect is not bounded by the block's size. 47 rows are drawn; up to 5,000 are rendered |
| 4 · `cells()` | **Not separable at this resolution — and worth 2× to 3.4× once it is.** `exact()` pads every row of every frame and the cache does not touch it |
