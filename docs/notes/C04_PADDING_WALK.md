# The `gapBefore` replacement — walked before the type changes

Phase 2 of the layout pass: `Gap` leaves C04's public vocabulary and block-level `padding`
arrives. Run before a type moved, per CLAUDE.md's scheduled step, and **both artefacts**, because
this change has structure (which consumer applies the spacing) and events (a patch, a merge, a
window slice arriving at a padded block).

---

## The finding that comes first — the plan's phase 2 is two changes, not one

The plan reads *`gapBefore` → `padding` + `childGap`*, and the three are not interchangeable:

| | what it is | who opts in |
|---|---|---|
| `gapBefore` | one blank row above **this** block | the block, per block |
| `padding` | space inside **this** block, four edges | the block, per block |
| `childGap` | uniform space **between** a container's children | the container, once |

`gapBefore` is a per-block opt-in and `childGap` is a container-level uniform. Replacing the first
with the second drops the leading row that C04 §3a's *the first block's gap is a leading blank row,
not a special case* explicitly keeps, and turns an opt-in into a default. **`padding.t` is the
one-for-one replacement**; `childGap` is a new capability the appearance rules want and a separate
landing.

**Ruled: phase 2 splits.** 2a is `gapBefore` → `padding`, a replacement with no frame movement. 2b
is `childGap` plus the surface rules that consume it. Landing them together gives a moved frame two
candidate causes, which is the plan's own gating argument applied one level down — *a moved frame
with two candidate causes is not a finding; it is a bisect*.

---

## Artefact A — the classification table, over who applies the spacing

Two candidate shapes, and the table is what separates them.

**Shape A — the sequence keeps emitting the blank row and reads `padding.t` instead of
`gapBefore`.** Cheap, frame-identical, and it is a rename: `padding.l`, `.r` and `.b` would mean
nothing, so the field would be a four-edged type with one live edge. It buys none of §5's rules —
*every nested level costs exactly three columns*, *content stops one column before the right edge* —
which are `padding.l` and `padding.r` on the root.

**Shape B — the registry applies padding around every block.** `measure` adds `t + b` and asks the
kind for `w - l - r`; `render` emits `t` blank rows, insets each row by `l`, cuts to `w - l - r`, and
emits `b` blank rows. The sequence stops emitting gap rows entirely.

**Ruled: B.** The brief's sentence is *you are building the box model the appearance rules need*,
and A is the box model's shadow. B also makes the one mechanism uniform across every kind rather
than only at a sequence, which is what C29's `normalise` already does for a padded leaf — one rule,
two layers, not two rules.

| # | the two rules | today | under B | ruled |
|---|---|---|---|---|
| A1 | *no measurer counts a gap* (C04 I25) × padding is inside the block | `sequenceHeight` adds 1 per gap block; `measure(block, w)` does not see it | the block measures `t + b` taller **everywhere** | **the invariant survives and gets stronger**: a block still measures the same wherever it appears, and now C14's `(block, width)` key covers the spacing too |
| A2 | *the height rule lives at the sequence, never at the block* (§3a) × B | true | **false, deliberately** | §3a's sentence is replaced, not reinterpreted. It was true of a field the sequence owned; padding is owned by the block |
| A3 | *the first block's gap is a leading blank row* (§3a) × `childGap` | a leading row | `childGap` gives none | the reason 2b is separate; under 2a the leading row is the block's own first row and is unchanged |
| A4 | a `row` group ignores `gapBefore` (§3a) × padding on a row's child | ignored | **honoured** — padding is inside the child, and a row's child is a box like any other | a frame move, and it is in 2a's expected set. A `row` child declaring a gap today draws none; under B it draws one |
| A5 | `merge` carries `gapBefore` (C04 I9) × `padding` | carried | carried | unchanged; the field is content in both vocabularies |
| A6 | `minRows` / `op: "reserve"` floors the rows (C04 I67) × padding | the floor is over the kind's rows | **the floor is over the padded block** | ruled: the floor is what the block occupies, which is what a layer above reserved space for |
| A7 | `width` answers the content edge (C09 I43) × `padding.l/.r` | `width` is the kind's | `l + r + kindWidth(at - l - r)` | and C09 I43's identity — same height at the answered width — must be re-checked under the inset, because the kind now wraps at a narrower width than the block reports |
| A8 | `elements` are block-relative (C26 I3) × padding | rows from 0 | rows shift by `t`, cols by `l` | one offset, applied where the padding is applied, so the frame and the targets cannot disagree |
| A9 | *an entry's height is `measureSequence`, never `Σ measure`* (C09 I17, C14 I1) × padding is inside the block | the two differ by one row per gap block, and the summation is the wrong answer | `sequenceHeight` is a fold of `measureChild` and nothing else, so **the two are equal by construction** | **the invariant inverts and the row that guards it empties** — see A9a. Found after the code, by a fail-on-revert row going red with nothing wrong |


### A9a · the finding — a fail-on-revert row whose defect can no longer be built

**Three rows and a harness comment guard `Σ measure` against `measureSequence`**, and under B
there is nothing between them. `sequenceHeight` became `for (const block of blocks) total +=
measureChild(block, width)` — the fold and nothing else — so `measureSequence(bs, w)` **is** `Σ
measure(b, w)`, not by coincidence but by construction. C14 T6.16 reverts to the summation and
measures the same number; it fails today only because its own fixture asserts the disagreement
(`measureSequence(gapped) === sumMeasure(gapped) + 1`) before it exercises the viewport.

**This is A03 §2's vacuity class, arriving from the other side.** The usual shape is a rule that
never could be violated. This is a rule that *was* violable, whose subject the change removed —
so the row does not go quietly green, it goes red on its own premise, which is the only reason it
was found at all. `test/support/viewport.ts` states the same premise in prose (*the defect T2.9
and T6.16 guard against is picking `Σ measure`*) and `sumMeasure` is exported for no other reason.

**Ruled.** The invariants are rewritten rather than deleted, because the *seam* still carries
weight and only its arithmetic claim is gone: `measureSequence` is where the memo and the
containment are shared (C09 I11, I26a), and a composer still must not insert spacing of its own —
that half of I17 is what makes a document's height knowable from the document (C23 §2) and it
survives B intact. What goes is *the sequence adds a row*, and with it the only construction in
which a summation was short.

What replaces T6.16 is A1's strengthened form, which is a stronger row than the one it retires:
**a block measures the same in a document, in a panel and alone**, so the revert to guard is a
measurer that reads `padding` at the sequence instead of inside the block — the defect B actually
makes possible. `sumMeasure` stays, its comment corrected: it is no longer the wrong answer, it
is the same answer, and a row asserting they agree is what keeps the fold honest.

**And the reason this was not in the table before the code**: every other cell pairs two rules
about *a block*. This one pairs a rule about a block with a rule about *the container's
arithmetic*, which the artefact's own index — *where two sizing rules meet at rest* — reads as
out of scope. The index is right and its subject was drawn one layer too narrow.

---

## Artefact B — the sequence trace, over the row that moves

| # | boundary | what crosses it | the interaction |
|---|---|---|---|
| S1 | the sequence → the block | the blank row | today the row is the **container's** and is emitted before the block; under B it is the block's **own first row**. The position in the frame is identical |
| S2 | a frame → the next frame, incrementally | C22's cached parts | `entry-layout.ts` caches a block's rows **per block** and re-pushes `GAP_ROW` itself, and `ownRows` strips the first line back off. Under B the cached part already holds the row, so **both must go in the same commit** — one left behind draws the row twice, the other draws it never |
| S3 | a patch → a rebuilt block | `op: "merge"` | a merged block keeps the field either way (A5); the hazard is a merge that rebuilds a block from a base **without** the field, which `refresh.ts:691` already guards for `gapBefore` and must guard for `padding` |
| S4 | a window → a padded block | `windowChild`, `skipRows` | a slice takes rows from the block's own rows, and under B the padding rows are among them. `windowSequence` must not also subtract a gap it no longer adds |
| S5 | the row group's placements | `groupPlacements` | `registry.ts:747` advances an element row per `gapBefore` child; under B the child's own padding has already moved it, so the advance is a **double count** unless deleted with the rest |

### S6 · the finding — three consumers reconstruct the blank row independently

`renderSequenceToLines`, `entry-layout.ts`'s `assemble`, and `registry.ts`'s element walk each
re-derive the gap row from `gapBefore`, because today the row belongs to no block. Under B it
belongs to a block, and **all three stop**. That is the deletion the change is for, and it is also
its whole risk: the three are in three files at three layers, agree today, and are asserted
separately. `entry-layout.ts` additionally carries `ownRows`, whose only job is to undo the row it
just added.

**Ruled: they go in one commit**, and the row that watches it is C22's byte-for-byte sweep of every
window position against the full render (T4.89b) — the one row that already asserts all three agree.

---

## What this walk did not reach

**`childGap` is not walked here**, because it is 2b and its rulings are not constrained until 2a has
landed. Its own questions — whether the gap is inside or outside the container's padding, what it
does when a child solves to zero (C29 §8a A7 already rules the gap is kept), and whether a `row`
group's gutter and a `column` group's `childGap` are one field — want the trace that 2a's frames
make answerable.

**And the table indexes pairs.** The cell where padding, `minRows` and a window slice all meet — a
reserved block, padded, sliced by the viewport — is in neither artefact, and A6, S4 and S5 are each
one leg of it.
