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

## 5. What the numbers say about the order

| stage | what the table says |
|---|---|
| 1 · output diffing | 25.7 KB written per frame regardless of what changed, and 10.2 KB with an empty transcript. Every frame, every size |
| 2 · render caching | Turns 2,793 ms into 2,793 ms once and ~1.8 ms after — **a stall, not a fix**, and the table is where that is visible rather than argued |
| 3 · window the block | The only stage whose effect is not bounded by the block's size. 47 rows are drawn; up to 5,000 are rendered |
| 4 · `cells()` | Not separable at this resolution. Re-measure after 1–3 or drop it |
