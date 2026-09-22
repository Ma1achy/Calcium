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
| C10 §4k.4's carrier table | **Lifecycle's 1-bit carrier is the monochrome glyph rung, and today it is not.** The ruled design makes the head mark a **function of the call's state** at 1-bit and in ASCII — `◌ ◐ ● ○ ⊘` and `. % * o /` — where above 1-bit it is a constant `●` with tone carrying the state. Until that lands, §4k.4's row reads *today's* behaviour (`●` still, outcome in bold), which is the carrier the tree has and not the one the design rules. | the `R-GLY-002` scan M4 builds — *at 1-bit and in ASCII, no two states render the same glyph* — which is **red on HEAD today**, `running` and `step` both being `*` |
| M3 (the double `▸`) | **The collapsed-disclosure mark.** The registry reserves `▸` for focus and `▾` for expanded, and has no collapsed glyph; focus keeps `▸`. A mark is proposed, shown, and registered with its ASCII and 1-bit rungs. Not `›`, which is *the current one in a row of peers*. | the registry ≡ `GLYPH_TABLE` property test, once the slot exists |
| C10 §4k.4 | **The selection mark `▌` needs a glyph slot of its own.** `live` is taken (`containers.ts:113`). Recorded when §017's copy gutter was read; not ruled here, because whether a gutter column is added beside the wash is a width question C11 I14 owns. | nothing yet — this is the one item with no watcher, and it is named as such |

## M7 · Arming, epochs and pointer commit

| Owed by | Item | What goes red when it lands |
|---|---|---|
| C10 §4k (F1240's MR) | **Composition 2 — hover beside focus.** Hover has no producer at all: mouse mode 1002 sends no motion (`types.ts:456`), so the fact cannot arise. When the mode reaches 1003, draw the frame at all three rungs and discharge **C10 T2.46**, whose hover half is exercised through a constructed state until then. | C10 T2.48's hover clause · the composition file's derived count |

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
