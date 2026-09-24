# 00b · Acceptance criteria, by MR

**What this file is for, and what it is not.** The sixteen MRs reconciling this
repository with the design language are planned elsewhere; this holds only the
items that are **owed to a later MR by an earlier one** — a blocker named when it
was found, so the MR that lifts it knows the work is its.

**The reason it exists is a row that goes red.** C10 T2.48 asserts, against the
tree, that four of §4k's six compositions have no subject. The day one acquires
one, that row fails — and a failing row whose remedy is written down in the MR
that caused it is scheduled work. A failing row whose remedy is in nobody's list
is a surprise at the end of an unrelated change, and the first thing anyone does
with a surprise is widen the assertion.

Each item names **what goes red**, so the criterion is checkable rather than
remembered. A deferral names a condition and nothing watches it (CLAUDE.md); the
watcher here is the row, and this file is what the watcher points back to.

---

## M4 · Glyphs — the head mark, `agent`, reservations

| Owed by | Item | What goes red when it lands |
|---|---|---|
| C10 §4k (F1240's MR) | **Composition 5 — `disabled` + `error`.** `disabled` is an availability fact and no block carries the field. Once it does, draw the frame at all three rungs in `test/golden/compositions.test.ts` and discharge **C10 T2.47**, which is `it.todo` on exactly this blocker. | C10 T2.48's availability clause · the composition file's derived count, which asserts `(6 − owed) × 3` frames |
| C10 §4k (F1240's MR) | **Composition 6 — `stale` + `running`.** `stale` is a freshness fact and no block carries the field. Same remedy, same two rows. | as above |
| C10 §4k.4 | **The selection mark `▌` needs a glyph slot of its own.** The slot is taken by `GlyphSet.bar` (`glyphs.ts:276`). **The reason this row used to give was `live` is taken, and `live` was retired at M4's close**, so the occupant it named is gone and the conclusion survives on a different occupant — which is why the reason is written as a line the reader can go to. Recorded when §017's copy gutter was read; not ruled here, because whether a gutter column is added beside the wash is a width question C11 I14 owns, and `▌` is `East_Asian_Width=Ambiguous` besides (`glyphs.ts:462`, the finding that a 40-cell bar drew 80). | nothing yet — this is the one item with no watcher, and it is named as such |

## M7 · Arming, epochs and pointer commit

| Owed by | Item | What goes red when it lands |
|---|---|---|
| C10 §4k (F1240's MR) | **Composition 2 — hover beside focus.** No block declares `hovered`, so the fact cannot arise. Draw the frame at all three rungs the day one does, and discharge **C10 T2.46**, whose hover half is exercised through a constructed state until then. **The reason this row used to give was falsified by the tree and was wrong in both directions** — it read *mouse mode 1002 sends no motion, so the fact cannot arise*, and `lifecycle.ts:125` has taken **1003** behind a `hover?: boolean` option since, with the decoder reading a no-button move at `router/types.ts:312`. A pointer move can arrive. What stops the fact is the other end: the router discards a hover **by rule** (`router.ts:377`, `:525`, `:766` — §4a row t, *a hover is not a gesture and clears nothing*) and no block carries the field. So the mode was never the condition, and an MR picking this row up would have found the transport already there and drawn a frame for a fact nothing produces. | C10 T2.48's hover clause, which asserts the **field's** absence and is the condition that can actually change · the composition file's derived count |

## M9 · No pushed views

| Owed by | Item | What goes red when it lands |
|---|---|---|
| C10 §4k (F1240's MR) | **Composition 3 — selection over a diff ground.** Both facts ship — `patch/lines.ts` paints the grounds and the `+` / `−` marks, `selectionStyle` paints the wash — and they cannot meet, because `patch` **declares no elements and reads `ctx.focus` nowhere**. The ground is not missing; the **addressability** is. It is the only one of the four whose remedy does not begin with a new field. | C10 T2.48's addressability clause, which asserts the seam and not the slot · the composition file's derived count |

## M11 · The carrier matrix and the contrast gate

| Owed by | Item | What goes red when it lands |
|---|---|---|
| C10 §4k.4 | **Five of the twelve state axes have no precedence rung**, and each carries by something else — mark, word, weight (§4k.4's carrier table). None is without a carrier, so none is an open-set item; what the matrix owes is the *declaration*, since a fact with no declared carrier is a build failure under M11's gate. | M11's own gate, on the day a fact arrives with no declaration |
| C10 §4k.4 | **`semantic extent` is a single rung for two axes** — outcome and validity — so a pair drawn from those two is ranked against everything else and against nothing else. Whether choice and disclosure ever contest a ground is unasked. | nothing yet; it is a gap of the same shape as the one that produced R-STA-004 |

---

**A row here is discharged by deleting it**, in the MR that lands the item, in the
same commit as the frame or the scan it names. A row that outlives its item is the
deferral this file exists to stop, one level up.
