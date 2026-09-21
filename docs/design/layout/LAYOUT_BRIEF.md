# The layout pass — kick-off brief

**Read `LAYOUT_PASS.md` §2 and §4 first.** §4 is the measured result and it supersedes §1 and the
original §4. This file is what to actually do.

**Everything here was read from the tree, not run.** The one thing that WAS measured is in
`LAYOUT_PASS.md` §4. Treat the rest as hypotheses.

---

## The shape of it

**This is not "remove Ink". Ink is already off the frame path** for `/all`, `stress text`,
`mixed` and `session` — zero `renderToString` calls across 88, 697, 277 and 252 frames. C09 I72
did that.

**This is: build the box model the appearance rules need, and the last two container kinds stop
reaching for Ink as a side effect.**

```
what still reaches Ink    mosaic (always), scroll (by render), image (fault+alt path)
                          plus group/panel/table when a child takes the element arm
the ceiling               ~87 ms of 145 on a mosaic scroll frame
what that cost IS         Ink re-tokenising SGR Calcium already wrote — 28–36 % of
                          the frame. Yoga + reconciler together are 6.9 %
```

---

## Why a box model of our own, and not Yoga through Ink

**C09 I1: `measure(block, w)` must equal the rendered height at width `w`, computed WITHOUT
rendering.** C14 virtualises on measured heights and measures many blocks it never draws.

**Ink has no standalone measure.** `renderToString` is the only export that lays out;
`measureElement` needs a mounted node and returns zeros before layout. Its `createNode`,
`renderer` and `measureText` exist in `build/` and are not exported.

> **C09 I1 and Yoga-through-Ink are incompatible. You cannot have both.**

That is why every `Box` in `src/` carries an explicit width and there is no `flexGrow` anywhere:
once heights are hand-computed, the layout is hand-computed and Yoga has nothing left to solve.
**Do not "fix" that. It is a consequence, not an oversight.**

### So: Yoga directly

```
measure(block, w)   build the node tree, calculateLayout, read the height, free
render(block, w)    build the SAME tree, calculateLayout, walk it into rows
```

**C09 I1 then holds by construction** — both halves call one solver on one tree — which is stronger
than today, where the two are written as a pair and *tested* as a pair.

`yoga-layout` is already in the tree transitively through Ink. Take it as a direct dependency at
the version Ink pins, so the two can coexist during the pass.

---

## The order, and each step's gate

**Nothing here is a big-bang. Every step ends green.**

```
0   pin the dependency and prove the solver           yoga-layout direct, a test that
                                                      lays out a known tree
1   the box type, measure-side only                   measure() for ONE container kind
                                                      goes through Yoga. Height matches
                                                      the old one on every golden
2   the same kind's render()                          walks the solved tree into rows.
                                                      Byte-identical frames
3   group, panel, table                               they already answer rows via
                                                      rowsOfAll; this makes it the same
                                                      code path rather than a parallel one
4   scroll                                            compose from child rows by
                                                      placement. Fixes the I1 bug below
5   mosaic                                            the last always-element kind
6   delete paint.ts:378 elementOf, render-lines,       and the ink dependency
    and the six imports
7   the appearance properties                          padding, margin, gap, minWidth,
                                                      alignment — now expressible
```

**Steps 1–5 each land with the goldens green. Step 6 is the one that cannot half-land.**

### The gate

**458 byte-exact frames in the tight tier, ~2,130 in the wider set, 11 snapshot files.** A
compositor swap is the one change those were built for: **every frame either moves or it does
not, and a moved frame is a finding.**

**If a step turns a frame, stop and explain it before regenerating.** A regenerated snapshot with
no written reason is the pass failing silently.

---

## Delete as you go

**Do not build alongside.** A parallel new system means every surface has two possible renderings
and no audit can tell which one shipped — **which is the exact failure this project keeps
finding**, where the section that argues and the section that draws disagree.

When a kind moves to the new path, its Ink branch goes in the same commit.

---

## A real bug to fix first, or at least to file

**`scroll` over one atomic child taller than its box renders 16 rows against a measure of 5**
(25 vs 5 at width 12). The F855 residue named at `containers.ts:463–466`: `windowChild` returns
`null` for an atomic kind and the child is kept whole.

**That contradicts C09 I1 directly** — the invariant this entire pass is built on. Do not rewrite
`scroll` while it is outstanding: file it, decide whether the fix is windowing the atomic child or
measuring it whole, and land that before step 4.

---

## What the appearance rules are waiting for

**Each of these is currently a thing every surface remembers. After the pass each is a property
of the engine.**

```
every nested level costs exactly three columns     padding
content stops one column before the right edge     margin
a blank row separates entries and nothing else     gap, at the sequence level
a block emits no leading or trailing blank row     no self-margin, ever
a container's frame is as tall as its contents     the solver's answer
a bounded body says how many rows are hidden       max-height plus a residue row
the focus wash covers an element's extent          the solved box, not a guess
a picture's frame washes, its content does not     a box with an unpainted child
a run that WRAPS is one element and many rects     see below — this is a type change
```

### The one that must be settled BEFORE step 1

**`NavElement` describes ONE rect** — `rows: {from,to}` and `cols: {from,to}`. A link broken
across a line break is **one element and two rects**, and every renderer declares elements.

```
the paint       covers every fragment
the hit test    matches any fragment
the ▸ mark      the FIRST fragment only
the scroll      pulls to the first, not the last
focus memory    stores the element id, never a rect
```

**Decide the shape now.** Changing it after five renderers have moved is five more diffs.

---

## Do not do

**Do not relax C09 I1.** Measuring by rendering is a full render per block per frame for blocks the
viewport never draws — the cost this pass exists to remove.

**Do not add `flexGrow` to the current tree** as an interim step. The widths are hand-solved and
Yoga is not consulted; half-delegating gives you two layout systems disagreeing at the seam.

**Do not touch the plot, table or patch renderers.** They answer rows, they are not on the Ink
path, and they are the largest test surface in the repo.

**Do not regenerate goldens to make a step pass.**

---

## Deliverable per step

```
1  the step's code, with its Ink branch deleted in the same commit
2  goldens green, or a written explanation per moved frame
3  a measured before/after on the mosaic scroll frame for steps 4–6
4  one line in the record: what the step changed about the box model
```

**And at the end, one number: the mosaic scroll frame, before and after.** The ceiling is ~87 ms
of 145. **If the pass lands under half of that, say so plainly** — an honest partial is worth more
than a rounded-up claim, and this repo has a record of the instrument being wrong more often than
the renderer.
