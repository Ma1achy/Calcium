# C29 §12, §14, §15 — the walk

Phase 3 of the layout-engine plan, walked by hand before anything is built. **Both artefacts,
because the section has both kinds of interaction**: a classification table over the cells where two
rules meet at rest — a chosen form against the floor, the cap, the memo, the element ids — and a
sequence trace over pass 2 choosing and pass 3 re-fitting, where an earlier pass's output is a later
pass's input.

**Indexed by rule interaction, not by input coverage.** A row governed by one rule is a restatement
of that rule.

---

## §0 · The premises, measured (F1228)

The plan's phase 3 says §12 *generalises four ladders that already exist rather than inventing one*,
and the premise check found the sentence false. What is here is what the tree says, at HEAD.

| the design says | the tree says |
|---|---|
| *a sidebar should become a rail* | **No subject.** `sidebar` and `tabBar` are in no file in `src/`. The frame's footer, the third example, is chrome whose height C22 I82 caps and whose content is the app's `ChromeFn` |
| *it generalises `status`, `plot`, `table`, `image`* | **Four different mechanisms, none of them a list chosen by width.** `widthRung` is a struct of feature booleans; `layoutFor` is a computed geometry carrying a priority; `table` is a greedy admission loop; `image` and the heatmap **substitute a kind**, degrading into a status box |
| `representations?: { min, box }[]`, picked by the engine in pass 2 | **Built at the document layer as `art()`** (`src/presentation/art.ts`), with a consumer across the seam: the docker banner's `wordmarkFor`. Walk the variants in preference order, skip one the terminal cannot draw, skip one that does not fit, take the first that survives — *one pass, never a search*, with a fallback that may not be empty |
| *dropping is the LAST representation* | **Refused twice over.** Phase 1 replaced C09 I35's clamp with a floor — *shrink, never drop* — and `art` refuses an empty fallback outright: *a declaration that can produce nothing is what the fallback chain refuses* |
| §15 *aspect*, resolved after both axes | **Built.** `solve.ts:262` shrinks the width against a `FIXED` height in pass 2, `:328` shrinks the height against the width in pass 4, both by `Math.min` so neither grows |
| §14 *sticky*, `childOffset` applied to every child except the sticky ones | **No `childOffset` exists**, and the effect exists twice by other means: C25 I18 rebuilds a windowed `Patch` carrying its path and hunk headers, *forced by the block shape rather than chosen*; and `documents.ts:540` puts the result notice **outside** the scroll as a sibling, which is the same answer reached by composition |

**The shredding the section exists for is real and is named nowhere in it.** Twelve kinds at five
widths, read as frames:

```
comparison  w=12   "  field  b……"  /  "~ l…  3…  2…"      every column at once
keyValue    w=6    "f…  f…" / "s…  s…"                    both halves
events      w=12   "22:13:20  s…"                         8 of 12 cells on a timestamp
steps       w=6    "✓ re…" / "⠋ fi…" / "◌ ad…"            the label stubbed, the marks kept
pills       w=6    "alpha"/"bravo"/"charl…"/"delta"       wraps — nothing silently lost
```

---

## Artefact A — the classification table: which rule owns a form

| # | the cell | rule A | rule B | ruling |
|---|---|---|---|---|
| A1 | a **leaf's** rung × `BlockDefinition.render(block, ctx)` | §12: the engine picks the widest form that fits | C09: a definition renders at the width it is handed | **the definition's, and the engine cannot be the owner.** `layout/types.ts` says of a `paint` leaf *the engine never looks inside one* — so a leaf's alternative forms are invisible to pass 2 by construction, and that is why all four existing ladders are computations inside definitions. `status` and `plot` are the built proof of the shape |
| A2 | an **authored** alternative × the block tree | §12: a variant is a `box` in a list | the tree: a variant is a different **block** | **the document layer's, and it is `art()`.** A variant of hand-authored content is a different block — different text, different kind even — and the engine takes a `Box` tree *built from* blocks. Choosing inside pass 2 would mean rebuilding a subtree mid-solve, which is the search §12 forbids in its own last paragraph |
| A3 | a form's declared `min` × the form's own natural width | §12: `min: number`, hand-written | C09 I72: `cells()` is the one width authority | **measured, never declared.** `art` tests `widthOf(declared) <= width`; a hand-written `min` beside a form is a second record of one number, and the two disagree the first time the form is edited. This is the one place §12's spelling is worse than the built mechanism, and it is worse in the way A03 §2 names |
| A4 | a chosen form × pass 1's bottom-up natural | pass 1 derives a parent from its children's defaults | a chosen form has a different natural | **the default's natural stands, and the cost is stated rather than removed.** A row group's natural width is the sum of its *default* forms, so a parent may report a natural wider than anything it will draw. Re-deriving would be the search; §12 is right about this and the cost belongs in the record |
| A5 | a chosen form × SHRINK's floor (§6) | the form declares a minimum | the floor is the child's minimum | **one number, and it is the form's.** Two names for one quantity is the drift C09 I1 exists to prevent — measured this session in `composite`, where `region.width` was answering both *how wide is a row* and *how far may a box reach* and was correct only while the two agreed |
| A6 | a chosen form × `childGap` (C04 I121) | the gap is between placed children | a row→column switch moves the axis | **free, and C04 I121 is why.** `childGapOf`'s default is the *axis's* — 1 for a row, 0 for a column — so a container that switched direction would take the new axis's default with no caller involved. Had the default been a single constant, a switch would have introduced a gutter down a column |
| A7 | a chosen form × the block cap (C09 I76) | a narrower form may be taller | the cap is 2 000 rows | **the cap applies after the choice**, because it applies to what is drawn. A form chosen and then capped is a form whose marker row counts; a cap taken first would measure a form nobody draws |
| A8 | a chosen form × `elementsIn` and focus (C26) | a form may carry different elements | focus is `{ blockId, rowId }` | **a form must not change a block's element ids.** A form that dropped a child would leave a focus on a block that draws nothing — C26's orphan — so this is the **second** independent reason dropping is refused, and it is not the reason phase 1 gave. Two reasons for one refusal, from two components |
| A9 | a chosen form × the measure memo `WeakMap<Block, {width, rows}>` | the memo keys on `(block, width)` | the choice happens per width | **safe by construction, and stating why is the point.** The choice is a pure function of `(block, width, capabilities)`, so one key gives one form. A choice that read a container's slack, or view state, would return two answers under one key and the memo would serve the stale one — silently, and only on the second frame |
| A10 | no form fits × *shrink, never drop* | §12: *dropping is the LAST representation* | phase 1: C09 I35's clamp replaced by a floor | **superseded, and §12's sentence is pre-phase-1.** The narrowest form is the last rung and the container clips. `art` already refuses an empty fallback for the same reason from the other end |
| A11 | `pills` wrapping × *collapse to `⋯ n more`* | §12's spelling | the built behaviour | **the built one, and the design's would regress it.** Wrapping loses nothing; `⋯ n more` replaces three chips with a count. F1226's first pattern — *built, by the mechanism its own spelling forbids* — for the third time in this plan |

---

## Artefact B — the sequence trace: pass 2 chooses, pass 3 re-fits

| # | boundary | what crosses it | the interaction |
|---|---|---|---|
| S1 | pass 2 chooses at a child's share → the re-fit shrinks that share | the chosen form | **the form is shrunk, not re-chosen** (§12's *one pass, not a search*). So a form may be drawn narrower than the width it was chosen at, down to A5's floor, and below that the container clips. The alternative is re-entering the choice with a new share, which is the exponential case §12 names — and the reason to write this cell down is that the non-search is a *decision* with a visible cost, not an optimisation |
| S2 | a resize across a rung boundary | the memo and `HeightCache` | both key on the width, so both miss correctly and the new frame is measured at the new form. A9 is what makes this true; it would be false for any choice that read something not in the key |
| S3 | focus on a child → a rung switch under it | `{ blockId, rowId }` | survives, **because of A8 and not by luck**. Every form keeps every child, so every element id is still produced. This is the cell that turns A8 from a preference into a constraint |
| S4 | a window over a block whose form switched | the window's row arithmetic | the window is the *definition's* (C09 I26a), and a definition that changes its row count with the width already re-measures per frame — so nothing new crosses here. The cell exists to record that it was asked |
| S5 | the terminal's capability tier changes under a live session | the chosen variant | `art` selects on `(tier, width)` and C02 detects once at startup, so no session crosses this. **A ruling about an event that cannot happen**, recorded as such rather than left as a gap somebody re-derives |

---

## §14 · The rulings, and one of them is a refusal

**§14's mechanism is refused, and its intent is discharged twice.**

`sticky?: "top" | "bottom"` with *`childOffset` applied to every child except the sticky ones*
needs a container holding a scroll offset and a header as a **sibling** of the body. Measured, the
two places the effect is wanted do not have that shape:

- **C25 I18** — a window of a patch is *a `Patch` rebuilt from a slice of its lines*, and the path
  and hunk headers travel with it because no field suppresses them. *Forced by the block shape
  rather than chosen*, and a window's content budget is smaller by exactly their rows.
- **`documents.ts:540`** — a tool call's result notice is pushed as a sibling **before** the
  `scroll`, not inside it. It does not scroll because it is not in the scrolling container, which
  is the same answer composition already gives.

So the field would have no consumer, and *an export nothing consumes* is forbidden. Its own refusal
clause — *a sticky child cannot be `GROW` on the scroll axis* — would be a validation path nothing
reaches, which is A03 §2's vacuity class arriving at birth. **Recorded in C29 §17 beside the other
refusals rather than built**, with the two mechanisms named, so the next reader finds the answer
instead of the gap.

**And the third instance of the pattern is worth naming once.** `pills` wrapping instead of
collapsing, headers outside the scroll instead of sticky inside it, and `ENTRY_GAP` instead of a
sequence-level `childGap` (F1226) are one shape three times: **a design rule whose effect is already
achieved by a mechanism its own spelling would replace.** The check that finds it is not *is this
built* — it is *what happens today, and is it worse*.

---

## §15 · Built, and the verification is the ruling

`aspect` resolves in two places and neither grows:

- pass 2, `solve.ts:262` — against a **`FIXED`** height, the only one knowable before pass 3, by
  `node.w = Math.min(node.w, round(aspect * height.n))`.
- pass 4, `solve.ts:328` — every other case, by `node.h = Math.min(node.h, round(node.w / aspect))`.

**And §15's last paragraph is a constraint on the tests rather than on the code**: *it is lumpy —
40 × 9 at `aspect: 3.5` wants 31.5 columns, gets 31, and the real ratio is 3.44. There is no fixing
this.* So no row may assert an exact ratio, and a row that does is asserting the rounding.
