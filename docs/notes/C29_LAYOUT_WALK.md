# C29 — the layout engine, walked by hand before it exists

**The scheduled step, and it is four for four** (CLAUDE.md). This component has **state and
structure**, so it gets **both artefacts**: a classification table over the cells where two sizing
rules meet at rest, and a sequence trace over the five passes where one pass's output is the next
one's input. A row governed by one rule is a restatement of that rule and finds nothing; every row
below is a cell where two correct statements overlap.

Source: `docs/design/layout/LAYOUT_ENGINE.md` §§1–22. Section numbers below are its.

---

## The rulings, first, because the table is long

| # | the cell | ruled |
|---|---|---|
| A1 | a `GROW` child inside a `FIT` parent | **`GROW` contributes its `min` to the parent's natural size**, and `min` defaults to 0 |
| A2 | a `PERCENT` child inside a `FIT` parent | **contributes `min`, exactly as `GROW` does** — and §22's open question is answered by that, not by choosing a base |
| A3 | `FIXED` children overflowing a `FIXED` parent | **no distribution can resolve it**; the container's `overflow` decides, and the default clips |
| A4 | a child clamped at `max` during distribution | surplus returns to the pot, **re-run** — bounded at `n` rounds, and the bound is asserted |
| A5 | `stretch` against a `FIXED` cross axis | **`FIXED` wins**, per §11; against `GROW` on the cross axis `stretch` is a **no-op**, not an error |
| A6 | alignment with any `GROW` sibling | **silent** — §8's own rule, and it is the one that surprises |
| A7 | `childGap` when a child solves to 0 | **the gap is kept** — §16 says a 0 child is *kept in the tree*, so it keeps its separator |
| A8 | `padding` wider than the box | clamped to the width, inner 0 — **and `childGap` clamps with it**, which §16 does not say |
| A9 | `aspect` when neither axis has slack | **`aspect` loses**, silently, and never grows an axis |
| A10 | `sticky` + `GROW` on the scroll axis | **rejected at construction**, not at layout — see the throw question below |
| A11 | `PERCENT` summing past 100 % | ordinary deficit: shrink toward `min`, then the container clips |
| A12 | a representation chosen before a sibling's clamp shrinks the share | **it stands** — one pass, never a search (§12), and the consequence is named |

**Two defects found, both in the document rather than in a cell**: D1 (the aspect/re-fit ordering)
and D2 (`measure` and `representations` disagree). They are below the trace.

---

## Artefact A — the classification table

**Indexed by rule interaction.** The parent's mode is the row, the child's the column, and only the
cells where the two rules could both claim the answer are written; the rest are restatements.

### A1 · `FIT` parent, `GROW` child — the circularity

*A parent's natural size is a function of its children's natural sizes* (§3) meets *`GROW` takes a
share of what is left over* (§2). The leftover is what the parent has after sizing, and the parent's
size is what the children asked for. **Neither rule can go first.**

```
row, FIT
  child 1  FIT   natural 10
  child 2  GROW(min 4, max ∞)
```

Three answers are available and only one is total. *Ask `GROW` for its natural size* has no answer —
that is what `GROW` means. *Treat `GROW` as `FIT` during pass 1* makes a growing child's content
decide the parent's width, which is the behaviour `GROW` exists to refuse. **`GROW` contributes its
`min`**, so the parent's natural width is `10 + gap + 4`, and pass 2 hands the child whatever slack
the parent actually receives.

**And `min` defaults to 0, which makes the common case right**: a `GROW` child in a `FIT` row
contributes nothing, so the row is as wide as its non-growing children and the growing one takes
what a container above gives it. A default of "natural" would make `FIT` and `GROW` identical at
pass 1 and different at pass 2, which is the same size arriving twice.

### A2 · `FIT` parent, `PERCENT` child — §22's open question, answered sideways

§22 asks *percent of what, exactly*, and offers *inner size after padding and gaps* against
*pre-gap size*. **Both are wrong in a `FIT` parent, because there is no parent size yet** — the
question is not which base but what `PERCENT` contributes to a base being computed from it.

**It contributes `min`, exactly as `GROW` does**, and then resolves against the inner size in pass 2.
So §22's question has a narrower scope than it is written with: it applies only when the parent's
size is already known, and there the answer is *inner, after padding and gaps*, which makes three
`PERCENT(0.33)` children not fill the row. **That is kept and stated** — it is CSS's answer, it is
honest about the gaps, and a rule that made percentages sum to 100 % would have to take the gaps
out of the percentages, which is §7's *spacing belongs to the container* stated backwards.

### A3 · `FIXED` over `FIXED` — the cell with no arithmetic

`FIXED(n)` has `min = max = n` (§2), and `min` is a hard floor the engine may not cross (§6). A row
of `FIXED(20)` ×3 in a `FIXED(40)` parent has a deficit of 22 and **nothing that may absorb it**.

§6's answer is *drop*, and that is refused for this pass (the ruling on the plan): a cell never goes
below its minimum, and when the minima do not fit **the container clips**. So A3 is not a
distribution outcome at all — it is `overflow` (§9), and the default for the cross axis is `clip`.
**Stated because the alternative is an engine that throws on a layout a terminal can perfectly well
draw the left-hand part of.**

### A4 · clamping meets distribution — and the bound is the assertion

§5 says *clamping runs before distribution, not after*, and *iterate until no child moves, at most
`n` times for `n` children*. The interaction: a child pinned at `max` leaves surplus in the pot,
which raises every other child's share, which can pin a second child.

```
80 cells, three GROW children, maxes 10 · ∞ · ∞
  round 1   26 · 26 · 26   → child 1 clamps at 10, 16 returns
  round 2   10 · 35 · 35   → nothing moves
```

**The `n` bound is not decoration**: each round pins at least one child or terminates, so `n` rounds
is exact rather than generous. It is asserted as a **counter**, not as an outcome — a fixed point
reached in `n + 1` rounds is a defect in the clamping order and passes every frame assertion.

### A5 · `stretch` against an explicit size

§11: *a child with `FIXED` on the cross axis is never stretched — an explicit size beats an inherited
one, always.* The cell §11 does not write is `stretch` against `GROW` on the cross axis, where the
child already fills: **a no-op, and not an error.** Writing it as an error would make `align.y =
"stretch"` on a container whose children happen to grow a construction failure, and the default for
a mosaic row **is** stretch (§11), so the error would fire on the default.

### A6 · alignment with a `GROW` sibling — silent, and it should be

§8: *alignment only does something when there is slack.* A `GROW` child consumes all of it, so a row
holding one `GROW` child and one aligned `FIT` child aligns nothing, whatever `childAlignment` says.

**This is the cell that will be reported as a bug**, because the field is set and nothing happens.
It is correct, and the remedy is that the *engine* never silently ignores a field it was given: a
declared `childAlignment` with no slack on that axis is a **no-op the probe can count**, so the
answer to "why is my alignment ignored" is a number rather than a reading of the source.

### A7 · `childGap` and a zero-width child

§7: *n children have n − 1 gaps.* §16: *a child at 0 is **kept in the tree**, emits nothing — it is
not dropped, dropping is a DECISION and this is an arithmetic outcome.*

The two meet at: does a kept-but-empty child take its separator? **Yes.** §16's distinction is the
whole reason — a dropped child is gone and takes its gap with it; a child at zero is present, and a
row whose gaps appear and disappear with its contents' widths is a row that jitters. The visible
consequence is two adjacent gaps where a zero child sits between two drawn ones, which is
`childGap × 2` of blank and is **correct**.

### A8 · padding wider than the box, with gaps

§16: *width < padding → padding is CLAMPED to the width, inner size is 0.* It does not say what
happens to `childGap`, and a container with 3 children and `childGap: 1` at width 2 has an inner of
0 and asks for 2 cells of gap. **`childGap` clamps with the padding**, to whatever the inner size
can carry, and at inner 0 it is 0. Otherwise the arithmetic produces a negative child width, which
§1's *no sub-cell anything* would round into a positive one and draw.

### A9 · `aspect` with no slack on either axis

§15 resolves aspect *by shrinking the axis with slack — never by growing, which would overflow a box
that already fits.* If both axes are `GROW` and both filled, there is no slack on either. **Aspect
loses**, and the box keeps its solved size at whatever ratio that is. §15 already concedes the
principle — *it is lumpy; there is no fixing this* — and this is the same concession at the limit.

### A10 · `sticky` + `GROW`, and what the throw leaves behind

§14: *a sticky child cannot be `GROW` on the scroll axis. It would grow to fill the space it is
excluded from, which is a loop, and the engine must reject it rather than resolve it.*

**The walk's throw question** (CLAUDE.md, C13's `settle` case): *what does the rejection leave
behind?* A throw in pass 2 abandons a half-solved tree — some children sized, some not — and the
caller is `measure`, which C09 I2 says is **pure and total: no throw on any input**. A layout that
throws mid-pass makes `measure` throw, and the registry's containment turns it into an error block,
so a contradictory `sticky` renders as *a fault* rather than as *a layout*.

**So the rejection is at construction, not at layout.** `b.*`'s validators refuse the combination
where every other construction error is refused, C04's boundary, and nothing reaches the engine that
the engine would have to throw on. This is the one ruling in the walk that **moves work into a
different component**, and it is the only one that keeps C09 I2.

### A11 · `PERCENT` past 100 %

Three `PERCENT(0.5)` children want 150 % of the inner size. Nothing special: a deficit, distributed
by §6 toward each child's `min`, and then A3 — the container clips. **Named because a reader expects
a refusal**, and a refusal here would be a construction error for an arithmetic outcome, which is
the distinction §16 draws.

### A12 · a representation chosen, then the share shrinks

§12: *the engine picks per element, bottom-up, during pass 2 — one pass, not a search.* §5: clamping
iterates to a fixed point. So a child can choose its widest fitting representation at a share that a
later clamping round reduces.

**The representation stands**, and the consequence is that a child can hold a form slightly too wide
for its final share and be truncated or clipped by §9. The alternative is re-choosing inside the
clamping loop, which is the search §12 refuses, and *exponential* is the word it uses. **What is
owed is the counter**: how often a chosen representation ends up over its final share is a number
the probe can carry, and if it is ever large the one-pass rule is wrong rather than cheap.

---

## Artefact B — the sequence trace

**Five passes, and an event between two of them is the thing to index.** Each row is a pass
boundary where the later pass consumes something the earlier one produced.

| # | boundary | what crosses it | the interaction |
|---|---|---|---|
| S1 | 1 → 2 | natural widths | `GROW`/`PERCENT` contributed `min` (A1, A2), so pass 2 distributes against a base that already counted them |
| S2 | 2 → 3 | solved widths | text re-wraps **here and only here**; a height computed before this is stale |
| S3 | 3 → 4 | natural heights | `stretch` (§11) overrides a child's `FIT` on the cross axis — **after** heights exist, which is why §11 says pass 4 |
| S4 | 4 → 5 | solved heights | positioning applies padding, gap, alignment; alignment reads slack that only now exists |
| S5 | 2 → 2 | the clamping loop | A4's fixed point, inside one pass |
| S6 | 4 → ? | `aspect` | **D1 — see below** |
| S7 | 2 → 3 | a chosen representation | A12; and **D2 — see below** |

### D1 · `aspect` is resolved after the pass whose input it invalidates

§15: *resolved after both axes have a size, by shrinking the axis with slack.* §4: pass 3 is the
re-fit, *text re-wraps at its solved width, so heights are only knowable now.*

**If aspect shrinks the width after pass 4, every height computed in pass 3 was computed at the old
width.** A box holding wrapped prose at width 40, aspect-shrunk to 31, still carries the height it
had at 40 — and §18 says `measure` reads the root's height after pass 4, so **the number `measure`
returns is the number for a width the frame does not use.** That is C09 I1 violated by construction,
in the engine whose selling point is that I1 holds by construction.

**Ruled: `aspect` resolves on the width axis in pass 2 and on the height axis in pass 4.** Width
first, because §4's whole argument is that width precedes height; a box with an aspect declares a
width constraint like any other, and it belongs where widths are decided. What §15 describes —
*after both axes have a size* — is the shape of a solver that does both axes at once, which §4 is
explicitly not.

**The residue, stated rather than papered over**: resolving aspect in pass 2 means the height it
implies is a *target*, and pass 3's re-fit can exceed it. The box then has slack on neither axis and
A9 applies — aspect loses. That is worse than a two-way solve and it is total, which is the trade
§4 already made for text.

### D2 · `measure` and `representations` disagree about what is being measured

§18: *both halves build the same node tree and run the same passes. `measure` stops after pass 4.*
§12: *the engine picks the widest representation that fits, per element, bottom-up, during pass 2.*

A representation is **a different `Box`** (`{min, box}`), so choosing one **changes the tree** — and
the choice is made inside the pass structure, from the share, which depends on the available width.
So `measure(box, w)` and `measure(box, w')` are not measuring the same tree, which is fine and
expected. **What is not fine**: `render` at `w` must choose the *same* representation `measure` at
`w` chose, or C09 I1 is false — and nothing in §12 or §18 says the choice is a pure function of
`(box, available)`.

**Ruled: the representation is chosen from the child's own solved share and nothing else**, which
makes it a pure function of the tree and the width and puts it under §20 rule 7 with everything
else. No focus, no state, no *what was chosen last frame* — the last of which is the tempting one,
because it would stop a representation flickering as a width crosses a threshold, and it would make
the frame depend on its predecessor.

**And flicker is the real problem that tempts it**, so it is named: a width oscillating across a
representation's `min` swaps forms every frame. The remedy that keeps purity is **hysteresis in the
declaration** — a representation declares the width it becomes legible at, and the engine may not
add a second threshold — so if flicker is observed the fix is the `min` values, not the engine's
memory.

---

## What the walk did not reach

**Floats (§10) and incremental layout (§13) are not walked here.** Both are event-mediated and both
deserve their own trace when they are built: §10's events are attach/detach and the nudge, §13's are
dirty propagation and the cache's validity. Walking them now would be walking a design that the
sizing core's rulings have not yet constrained.

**And the classification table has a known blind spot, stated per CLAUDE.md's rule**: it indexes
pairs. A cell where *three* rules meet — `aspect` on a `stretch`ed child with a `PERCENT` cross axis
— is not in it, and D1 is evidence that the pass ordering is where three-rule interactions show up.
The trace is the artefact that reaches those, and S6 is the only row of it that found one.
