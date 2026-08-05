# `/inspect <c>` and `--raw` — the walk

Walked by hand against `docker inspect reverent_proskuriakova` — 245 lines of real,
awkward JSON — before any of it was written. Every figure here is measured through
`tools/measure-raw.mjs`, which drives the **real** `createDocumentView` and the app's real
registry rather than reimplementing either.

`/inspect --raw` is the first consumer of the view that has *more content than region*, so
unlike S3 it has both kinds of interaction: a **structure** (how a document is split into
blocks) and a **sequence** (what the motions do to that structure, and what a resize does).
Both artefacts, and the trace found the sharper defect.

Every row is a cell where **two rules overlap**. A row governed by one rule restates it.

---

## §1 The rules in play

| | rule | source |
|---|---|---|
| R1 | `project` emits **at least one block**, whatever its height | `document-view.ts:117` |
| R2 | `lastOffset` clamps the bottom to `blocks.length - 1` | `document-view.ts:149` |
| R3 | A page is `max(1, region.height - 1)` — applied to an **offset into `blocks`** | `document-view.ts:214` |
| R4 | C15 reports overflow as `Placed.truncated`; `composite.ts` cuts the rows | `place.ts:120`, `composite.ts:118` |
| R5 | The region is `rows - 3`, so it changes with the terminal | `frame.ts:119` |
| R6 | `b.code` defaults `wrap: false` — a long line is cut at the width | `builders/index.ts:352` |
| R7 | The window falls on block boundaries; no row-granular scroll, permanently | C22 I46, C12 I1 |
| R8 | `n`/`p` move one block · `g`/`G` the ends · `PgUp`/`PgDn`/`↑`/`↓` a page | `keymap.ts:258`, `keys.ts:368` |

---

## §2 The classification table — how a document is split

### B1 · a subtree that overflows the region — R7 × R5

Measured, region 37 (a 40-row terminal):

| split | blocks | rows | tallest block | rows no motion reaches |
|---|---|---|---|---|
| one block, whole JSON | 1 | 245 | 245 | **208** |
| one block per top-level key | 24 | 243 | 108 | **77** |
| split a second level where it overflows | 103 | 239 | 24 | **0** |

**One block strands 85% of the document and `n` is refused rather than unhelpful** — R1
emits the block, R2 computes `end = min(0 + 1, 0) = 0`, so `move("down")` returns `false`.
The reader presses a documented key and nothing happens.

**Ruled: split by keys while a block overflows the region, and measure to decide.** Not
fixed at two levels: `HostConfig` at 108 rows needs a second and eighteen scalar keys need
none, and the threshold is the region, which R5 makes a property of the terminal. A fixed
depth is right at 40 rows and wrong at 24.

### B2 · a leaf that overflows and has no keys to split by — R7 × R1

The rule above says *split while it overflows*. **It does not terminate.** Measured: a
`Config.Env` of 300 variables is **302 rows against a 37-row region**, and an array of
scalars has no sub-structure a second level could use that would not be one block per
string — 300 blocks, and the structure gone.

**Ruled: the split stops when a node has no children to split by, and the block is emitted
whole.** R1 then shows it and R4 cuts it. So **the measured rule cannot promise zero
unreachable rows in general** — it promises zero for every document whose leaves fit, which
is every real `docker inspect`, and an honest residue otherwise.

**This is what makes ruling 2 load-bearing rather than decorative.** The indicator is not a
nicety on top of a complete split; it is the only thing standing between the reader and a
document that stops mid-object claiming to have ended. The two rulings interlock, and
neither is sufficient — which was not visible from either one alone.

### B3 · a long line, and what `--raw` promises — R6

*"Structured when you want to read it, raw when you want to grep it."* Raw's promise is
about **having the bytes**. R6 cuts them: seven lines of the 245 exceed 120 columns and the
longest is **2862 characters**, so `wrap: false` silently discards ~2.7KB of the one mode
that exists to not discard.

Measured cost of the alternative: **245 → 274 rows, 11%.**

**Ruled: `--raw` sets `wrap: true`.** Eleven percent more rows against silent data loss in
the mode whose whole point is fidelity. The default is right for a code block *quoting*
something and wrong for one *being* the document.

### B4 · a scalar top-level key — R7

Eighteen of the twenty-four top-level keys are one row (`Id`, `Created`, `Driver`, …). They
are never split, are never truncated, and each is its own block.

**Recorded because it is what makes B1's `n` usable**: after the split, block sizes are
heterogeneous — eighteen 1-row blocks and a handful of 24-row ones — which is exactly the
condition B5 turns on.

### B5 · the empty value — R7

`ExecIDs: null`, `Args: []`. One row each. **Not omitted** — unlike `/drift`'s B5, where a
field neither side has is a question with no subject. Here the document *is* the subject:
`--raw` that quietly dropped a key would be a raw mode that edits.

The two verbs disagree, and the reason is the difference between a **map** (a list of
questions worth asking) and a **transcription**.

---

## §3 The sequence trace — what the motions do to that structure

### A1 · a page, after the split — R3 × B1 **(the defect)**

R3 computes a page from `region.height` and applies it to a **block index**. That is exact
when a block is one row and wrong by the average block height otherwise — and B1's split
*makes blocks small and uneven*, which is the condition the arithmetic never met before.

Measured on the 103-block split, region 37:

```
one PgDn:  block 0 → 36  =  61 rows skipped, screen holds 37   → 24 rows never shown
to bottom: 3 pages, for a document 6.5 screens tall
```

**A reader paging through sees less than half of it and is told nothing.** Both figures are
individually defensible — 36 blocks *is* `height - 1`, and 3 presses *does* reach the end —
and together they are a reader who believes they have read the document.

**Ruled: the app splits so this is survivable, and the units mismatch is filed against
Calcium rather than worked around here.** The app cannot fix R3, and padding the split to
make the arithmetic accidentally right would be a workaround that breaks at another region
height. `g`/`G` and `n`/`p` reach everything, so the document is not unreachable — it is
*skippable*, which is a different and quieter failure.

**Note what neither artefact would have found alone.** The split is a structural ruling and
the page is a sequence one; the defect is that the first changes the input to the second.
B1's table has no column for what a motion does, and a trace of the motions against the
*unsplit* document shows nothing wrong — the single block has one offset and pages nowhere.

### A2 · the terminal resizes while the view is open — R5 × B1

The split is computed **when the document is built**, against the width and region the
handler was given. `deps.region()` is read at projection time, so the *view* follows a
resize; the *split* does not. Shrink the terminal and blocks sized for 37 rows sit in a
20-row region and overflow again — B1's defect, restored, on a document that was correct
when it was built.

**Ruled: the app rebuilds nothing, and this is filed.** It is F24's shape with a consumer at
last: a build-time decision taken from a width that then changes. The honest position is
that `--raw` is correct at the size it was run at, and the indicator (ruling 2) is what
tells the reader when it stops being so — which is the second time in this walk that the
residue of an unfixable thing lands on the indicator.

### A3 · `--raw` on a container that has gone — R1

`docker inspect` fails, the document is an error, and there is no block to split. The view
still opened (C23 I3 puts the pending entry before the transport). **Ruled: `fill` replaces
the waiting spinner with the error notice**, which is the existing path and needs nothing —
recorded because A2's neighbour in the `/drift` walk was a real hazard and this one is not,
and an unrecorded check reads as an unconsidered one.

### A4 · the `r` toggle — R8

S5's drawing offers `r raw` as a toggle in the footer. **There is no `r` binding at the
`pushedView` target** — `keymap.ts` has `Ctrl-R` at `prompt` and `overlay` and nothing
plain. A toggle is a C16 keymap change plus a way for a view to re-fill itself from a mode
it holds, and the view holds no mode.

**Ruled: `--raw` is a flag in this step and the toggle is filed.** The drawing's footer
promises a key that does not exist, which is the fourth time a drawing has committed the
framework to something unbuilt (F4, F11, F30's verdict, this).

---

## §4 What this walk settled before any code

1. **Split by keys while a block overflows the region, measured** (B1) — not fixed at two
   levels, because the threshold is the terminal.
2. **The split does not terminate, and the floor is a leaf with no children** (B2) — so the
   indicator is what makes the residue honest, and the two rulings interlock.
3. **`--raw` wraps** (B3) — 11% more rows against silently discarding 2.7KB from the mode
   that exists for fidelity.
4. **A page overshoots by the average block height** (A1) — the structural ruling changes
   the input to the sequence one, and neither artefact reaches it alone.
5. **The split is stale after a resize** (A2) — F24 with a consumer.
6. **`--raw` is a flag; the `r` toggle is filed** (A4) — the footer promises an unbound key.
7. **`--raw` transcribes, so an empty value is a row** (B5) — where `/drift`'s map omits it.
   The two verbs disagree for a reason worth writing down.
