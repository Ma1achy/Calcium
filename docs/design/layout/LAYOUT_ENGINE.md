# The layout engine — what to build

**Companion to `LAYOUT_BRIEF.md`, which says the steps and the gates. This says the model.**

**The decision already taken:** finish the rows arm. No Yoga, no Clay as a dependency. The sizing
model and the pass structure are ported from `nicbarker/clay` (Zlib) — **attribute it in the
module header with the version you read**, which is the licence's only real condition.

**What is NOT ported:** the arena (meaningless in a GC'd runtime), floats (our unit is a cell),
culling (C14 already virtualises), the measure-text cache (we have one; its 850 misses a frame
are a cache-key bug, not a missing cache).

---

## 1 · The unit is a cell, and it is an integer

**Every dimension is a whole number of cells. There is no sub-cell anything.**

Do not lay out in floats and round at the end. Round-at-the-end is where half-cell errors come
from, and in a grid where one cell is one row a half-cell error is a visible bug.

**Widths are columns. Heights are rows.** `cells()` is the only width authority — not
`String.length`, not `stringWidth`.

---

## 2 · Sizing — four modes, both axes

```
FIXED(n)              exactly n cells
FIT(min?, max?)       the natural size of the contents, clamped
GROW(min?, max?)      take a share of what is left over, clamped
PERCENT(p)            p of the parent's inner size, after padding and gaps
```

**Defaults: `FIT` on both axes.** An element with no sizing declared is as big as its contents.

**`GROW` and `PERCENT` are both two-axis.** A mosaic cell grows horizontally to share a row and
vertically to fill the tallest cell; a panel body grows vertically to fill the height it was
given. Neither axis is the simple one.

---

## 3 · The direction — children declare, parents derive

**This is the whole model, and the current code has it backwards.**

> **A parent's natural size is a function of its children's natural sizes.**
> A `FIT` container asks each child what it wants, combines them — **sum along the layout axis,
> max across it** — adds its own padding and gaps, and that is its size.

**Nothing is imposed downward until pass 2, and pass 2 only ever distributes SLACK or DEFICIT.**
It never assigns a size from nothing. A child that was never asked cannot say *that is not
enough*, and a child that cannot say so gets cut off.

```
FIT width of a ROW      sum of children + gaps + padding
FIT width of a COLUMN   max of children + padding
FIT height of a COLUMN  sum of children + gaps + padding
FIT height of a ROW     max of children + padding
```

**Recursive, bottom-up, and the leaves are the base case.** A text run's natural width is its
longest unbreakable token; a plot's is whatever it declares; a `rows` leaf's is the widest row.

### What the mosaic does today, and why cells vanish

`mosaicRects(grid, width, height, columns, rows)` takes the container's width and **divides it by
shares** — `divideShares(columns ?? ones(grid.columns), width, 0)`. The rects are computed from
the top down and each child is clipped into the rect it was handed.

**No child is ever asked what it needs.** A plot with a 20-cell minimum in a three-column mosaic
at width 40 receives 13 cells and has no way to object. `mosaic.ts` states the consequence as a
choice:

> *"A cell with no room is zero-wide and is not drawn."*

**That is the honest behaviour given top-down sizing, and it is the wrong answer.** The cell
should not vanish — **the grid should have been narrower, or a cell should have been dropped.**

### What it becomes

```
today       width → divideShares → rects → clip each child into its rect

should be   1  each cell's child declares its natural size
            2  a column's natural width is the MAX of its cells
            3  the grid's natural width is the SUM of columns, plus gaps
            4  if the grid FITS its container: done. No shrink at all
            5  if it does not: shrink GROW cells toward their minima
            6  if the minima cannot be met: DROP by dropPriority
```

**`shares` stops being a divisor and becomes a `GROW` weight.** It says *how to split the slack*,
not *what the size is*. **A cell with no share is `FIT` and takes what it needs** — which is the
behaviour a mosaic of three plots wants, and the behaviour it cannot express today.

**The same correction applies to `scroll` and to `group`'s weighted rows**, both of which divide a
given width rather than asking. Mosaic is just where it is most visible, because a clipped plot
looks broken in a way a clipped paragraph does not.

---

## 4 · The passes, in order, and the order is load-bearing

```
1  FIT, bottom-up, WIDTH      each element's natural width from its children
2  GROW/SHRINK, top-down      distribute the leftover or the deficit across the
                              width axis, clamped by each child's min and max
3  RE-FIT, HEIGHT             text re-wraps at its solved width, so heights are
                              only knowable now. Run fit bottom-up on height
4  GROW/SHRINK, top-down      the same distribution on the height axis
5  POSITION                   walk down applying padding, gap and alignment
```

**Step 3 is the one people skip.** A wrapped paragraph in a growing column does not know its
height until the column knows its width. **Width first, then heights.** This is why
`measure(block, w)` takes a width at all, and the engine must preserve that dependency rather
than solving both axes at once.

---

## 5 · Integer distribution — the rule, stated

**Three `GROW` children in 80 columns is 26.666… each, and that is not a thing.**

```
LARGEST REMAINDER.
  1  give every GROW child floor(share)
  2  sort the leftover cells by the size of each child's fractional part,
     descending; ties broken by DECLARATION ORDER, never by id or size
  3  hand out one extra cell each until the leftover is gone
```

**Declaration order for ties is the whole point.** It makes the distribution a pure function of
the tree, so the same tree at the same width always produces the same frame — **which is what a
byte-exact golden requires.** "Give the remainder to the last child" is simpler and lands all the
error in one place, which reads as a misaligned final column; largest-remainder spreads it.

**Clamping runs before distribution, not after.** A child pinned at `max` leaves its surplus in
the pot for the others; a child at `min` takes its deficit from the others. Iterate until no
child moves, at most `n` times for `n` children.

---

## 6 · Shrink, and the floor

**Shrink is distribution with a negative leftover, and it runs the same way — with one
difference: `min` is a hard floor and the engine may not go below it.**

**Every kind declares a `minWidth`.** Below that it does not render, it is *dropped*.

```
a bar               6   ▰▱ plus a percentage is meaningless narrower
a sparkline         8
a plot              20  axes, a label and something to draw
a table column      the header's own width, truncated to 3 plus an ellipsis
a text run          8   below this, wrapping produces single words per row
a chip              its bracket form, whole. A chip never truncates
```

**When a container cannot satisfy every child's `min`, it DROPS children — it does not go below
a floor.** Drop order is declared per container, lowest priority first.

> **This is the 40-column drop order from `APPEARANCE.md`, promoted from a per-surface decision
> to a layout property.** Each child declares a `dropPriority`; the container drops ascending
> until the remainder fits.

---

## 7 · Padding, gap, margin

```
padding     INSIDE the element, around its children. It reduces the inner size
childGap    BETWEEN children, on the layout axis only. n children have n-1 gaps
margin      does NOT exist
```

**Margin is deliberately absent.** A block that carried its own outer spacing was the
`APPEARANCE.md` rule *a block emits no leading or trailing blank row* — and the reason is that
two adjacent blocks each contributing one row produce two. **Spacing between things belongs to
the thing that contains them**, which is `childGap`, once.

**The three-column nesting rule is a padding.** `padding: { left: 3 }` on a nested container,
declared once in the engine rather than remembered by every renderer.

**The one-column right margin is the root's padding.** `padding: { right: 1 }` at the frame
level, which is what *content stops one column before the right edge* becomes.

---

## 8 · Alignment

```
childAlignment.x   LEFT (default) | CENTRE | RIGHT
childAlignment.y   TOP  (default) | CENTRE | BOTTOM
```

**Alignment only does something when there is slack** — when the children's total is smaller
than the container's inner size on that axis. With a `GROW` child there is no slack, by
definition.

**Integer centring rounds DOWN** — one leftover cell goes on the right, or the bottom. Stated
because it is otherwise the second source of non-reproducible frames.

**And alignment is not text alignment.** A text run's own internal alignment (left, centre,
right across its wrapped lines) is the run's property, not the container's. The container places
the run's box; the run places its own lines.

---

## 9 · Overflow — clip, truncate, wrap, scroll

**Four behaviours, and a kind declares which one it has. They are not interchangeable.**

```
WRAP        the content reflows to more rows. Prose, and prose only
TRUNCATE    the content is cut and marked. One row, always
CLIP        the content is drawn and the parts outside the box are not emitted.
            Pictures, grids, anything where reflow would destroy the thing
SCROLL      clip, plus a childOffset and a scrollbar. A window onto more
```

### Truncation

**From the TAIL, with `…` in the last cell.** A cut head reads as a different word — `…arse.ts`
could be anything; `parse.t…` is obviously `parse.ts`.

**Two exceptions, both because the tail is the identifying part:**

```
a path         truncate the MIDDLE:  src/…/parse.ts
a number       never. A number shrinks its column or the column drops
```

**The ellipsis is one cell and it is inside the budget.** A 10-cell box shows 9 characters and a
`…`, not 10 and an overflow.

**Never truncate inside a grapheme cluster**, and never leave a lone combining mark.

### Clipping

**Clip is per-axis**, like Clay's: `clip: { horizontal, vertical, childOffset }`.

**`childOffset` is how scroll works** — the container clips, the child is placed at a negative
offset. One mechanism for mosaic cells, scroll blocks and attached terminals.

**The row composer currently DECLINES on overflow rather than clipping**, and mosaic needs
clipping. **That capability has to be built; it is not reusable from `placeRows`.**

---

---

## 10 · Layers — attachment, and what the engine owes C15

**Layering exists.** C15 owns a `stack: readonly Layer[]`, bottom-first, with `push`/`pop`/
`dismiss`/`update` and a pure `layout(region) → Placed[]`. `text.ts` has the compositor: it keeps
cells `[0, left)` of a painted row, writes the layer, keeps the rest.

**What is missing is that the LAYOUT ENGINE does not know about it.** Each layer is laid out
against the whole frame, flat, and then composited. **No layer's position can be derived from a
box in the layer beneath it** — which is what a tooltip, a hover card, an inline completion beside
a token, and a callout on a plot all need.

### A float is declared in the tree and takes no space

```ts
floating?: {
  attachTo:  { kind: "parent" }
           | { kind: "element"; id: string }     // any box, anywhere in the tree
           | { kind: "root" }
  anchor:    { self: Point; target: Point }      // line these two points up
  offset?:   { x: number; y: number }            // whole cells, applied last
  layer:     "float" | "overlay" | "debug"       // NAMED, never an integer
  clipTo?:   "none" | "attachedAncestor"         // default attachedAncestor
}

type Point = "tl"|"tc"|"tr"|"cl"|"cc"|"cr"|"bl"|"bc"|"br"
```

**It is declared inside the tree so it has a parent to attach to, and it is skipped by every
sizing pass.** A float contributes nothing to its parent's `FIT` size and displaces no sibling.

**`attachTo` by id matters more than by parent.** A hover card should not have to be declared
inside whichever of five rows is hovered — that pollutes the declaration of the thing being
hovered with the state of the hover.

### The stack is NAMED, not an integer

```
base      the transcript, the prompt, the footer
float     a tooltip, a hover card, an inline completion. Attached
overlay   a question, a menu. Owns input while it is open
debug     the profiler's own overlays. Above everything
```

**Refused: a free integer z-index.** In a terminal there is no alpha — **a layer that overlaps
another destroys it**, and an integer anyone can pick is an invitation to two things claiming the
same cell with the winner decided by whoever typed the larger number. Four named positions, and
within a position the stack order decides.

### Clipping to the ancestor is the default

**A tooltip on a row inside a scroll block must be clipped by the scroll block**, or it draws
outside the window and over rows that are not there. `clipTo: "attachedAncestor"` is the default
for that reason; `"none"` is the exception a modal asks for.

**A float that would land outside the frame is NUDGED, not clipped:** shift it along the axis
that overflows until it fits, and only clip if it cannot fit at all. A tooltip cut in half says
less than a tooltip two columns to the left.

### What the engine owes, and the two hard parts are ours

```
1  solve the base tree as normal — floats are skipped in every sizing pass
2  for each float, resolve attachTo to a SOLVED box from pass 5
3  size the float by the same four passes, against the frame's remaining space
4  position it by anchor + offset, then nudge it inside the frame
5  intersect its box with its attached ancestor's clip, if any
6  hand C15 a Placed with a whole-cell rect
```

**Hard part one: a float lands on whole cells or not at all.** There is no half-column. The
compositor keeps `[0, left)`, writes, keeps the rest — `left` is an integer and everything above
must produce one.

**Hard part two: a float must not split a grapheme cluster.** A tooltip landing mid-cluster covers
the whole cluster or none of it. `text.ts` already reasons about this one layer down — *"a cluster
that…"* at line 1047 is the same problem, and the float compositor must not solve it differently.

### Frames — a ring, a stack, and layers, in that order

**C15 already carries the mechanism:** `kind: "overlay" | "view" | "peek"`, with
`placement: "fill"` marked *views only*. A page exists. What is missing is how pages compose with
tabs and with layers, and they are **three different shapes**.

```
FRAME RING      tabs \u2014 main and its subagents. \u2303\u21e5 cycles.
                NOT a stack: no push, no pop, nothing is above anything
  FRAME STACK   within one tab: a view pushed over its base. esc pops
    LAYERS      within one frame: base \u00b7 float \u00b7 overlay
DEBUG           global, above every frame
```

**A ring and a stack are different shapes and must not share a ladder.** Tabs are parallel and
equal — `\u2303\u21e5` moves sideways and `esc` never leaves one. A view is *above* its base and `esc`
pops it. **Collapsing the two is the error \u00a72 of `INTERACTION.md` already corrected once**, where
nesting, modality and parallelism were wearing one ladder.

### Each frame owns its own layer stack

**This is what makes tabs work, and it is free once the nesting is right:**

```
a question open in tab B     does not block tab A
switching tabs               dismisses nothing, pops nothing
a float in tab B             is clipped by tab B's scroll block, not the
                             visible frame's
a frame's scroll position    is the frame's, and survives a switch
```

### Only one frame composites

**Layers blend: a float draws over the base and both are visible. Frames do not.** The frame you
are in is the only one drawn.

**So a frame switch is a full repaint** and the frame diff sees every cell. That is the honest
cost of `\u2303\u21e5`, it is bounded by the region, and it is worth knowing before someone reports the
switch as slow and looks for a bug.

**Debug is the exception and is global.** The profiler's overlay must not vanish because you
switched tabs to look at what it is measuring.

### The tension, stated rather than papered over

**`INTERACTION.md` \u00a714 says THERE ARE NO PUSHED VIEWS**, and lists what each one became: a run's
detail expands in place, logs are a block, the help view is an entry, an attached PTY is a
captured block substate, a subagent is a tab.

**That ruling is about USAGE, not about the mechanism.** Content that belongs in the record must
not leave it. Having a frame stack does not undo the rule — it means the shape exists and the
rule governs what may occupy it.

> **The test is unchanged: does it have its own prompt and its own context?**
> Yes \u2192 it may be a frame. No \u2192 it is a block, an entry, or a question.

**A subagent passes. A log does not.** If nothing else ever passes, the frame stack has exactly
one member per tab and costs nothing — **which is the correct outcome, not a wasted mechanism.**

### What this does not change

**C15 stays the owner of every stack and `layout()` stays pure (I5).** The engine is called BY
C15's `layout()`, with the stack and the region as its only inputs. It does not push, dismiss, or
decide what is on top.

**And a zero-row float is omitted and not dismissed**, exactly as a zero-row overlay is today —
the layer stays on the stack, nothing is drawn, and the owner acts.

---

## 11 · Cross-axis stretch

**`childAlignment` places a child in slack. It cannot make a child FILL the cross axis**, and
without that a row of mosaic cells is ragged and their borders do not line up — **which is most of
what makes a mosaic look broken.**

```
align.y = "t" | "c" | "b"   place the child in the cross-axis slack
align.y = "stretch"         every child takes the cross-axis size of the
                            TALLEST, which is the row's own solved height
```

**Stretch is resolved in pass 4**, after the cross axis has a size, and it overrides a child's
`FIT` on that axis only. **A child with `FIXED` on the cross axis is never stretched** — an
explicit size beats an inherited one, always.

**Default is `stretch` for a mosaic row and `t` everywhere else.** A mosaic exists to align its
cells; a row of chips does not.

---

## 12 · Responsive representations — what a sidebar does at 60 columns

**Today a child is present or dropped, and that is too blunt.** A sidebar should not vanish at 60
columns — it should become a rail. A table should shed columns before it shreds. A tab bar with
eight agents should collapse to `\u22ef 3 more`, not overflow.

**So a kind declares what it looks like at each size, and the engine picks the widest that
fits.**

```ts
representations?: readonly {
  min: number          // the narrowest width this form is legible at
  box: Box             // the form itself
}[]
```

```
a sidebar     28  the full panel, labels and counts
              12  a rail \u2014 marks and counts, no labels
               4  a single \u22ef, which expands on focus
               0  dropped

a table       its columns, each with a dropPriority. Sheds, never shreds
a tab bar      the names \u2192 the hues alone \u2192 \u22ef n more
a footer       both rows \u2192 the primary action plus ? keys \u2192 the action alone
```

**This is the 40-column drop order generalised.** Dropping is the LAST representation, not the
only mechanism — a thing that can say something smaller should say it.

**The engine picks per element, bottom-up, during pass 2.** A container asks each child for the
widest representation that fits its share, then re-fits. **One pass, not a search** — if the
chosen set does not fit, shrink and drop as before rather than iterating representations, which
is where a layout engine becomes exponential.

---

## 13 · Incremental layout — the actual performance story

**The spec so far solves the whole tree every frame. That is slower than what it replaces**, and
without this section the engine loses on the only number anyone measures.

```
DIRTY      a box whose own inputs changed \u2014 its content, its sizing, its width
CLEAN      a box whose inputs did not
```

**The rule that makes it worth having:**

> **A child whose NATURAL SIZE did not change cannot dirty its parent.**

A row of text that changed from `"47 passed"` to `"48 passed"` is the same width and the same
height. **Its parent does not re-solve. Nothing above it re-solves.** Only that box re-composes.

```
1  mark the changed boxes dirty
2  solve each dirty box's natural size
3  if it equals the cached one, STOP \u2014 the parent is untouched
4  if it differs, dirty the parent and repeat
5  re-position only the subtrees whose box actually moved
```

**A width change dirties everything**, because every solved size depends on it. That is correct
and it is the one case where a full solve is the right answer.

**The cache is keyed on (box identity, available width) and nothing else.** Anything else in the
key is a cache that misses — **which is the bug behind the 850 measure misses a frame**, where
the window range was in the key and every scroll invalidated the lot.

---

## 14 · Sticky

**A table header that stays while its body scrolls is neither flow nor float.** It is a child
**excluded from its container's scroll offset**.

```
sticky?: "top" | "bottom"
```

**It occupies flow space** — it is not a float, it displaces its siblings, and the scrollable
area is what remains. **`childOffset` is applied to every child except the sticky ones.**

**A sticky child cannot be `GROW` on the scroll axis.** It would grow to fill the space it is
excluded from, which is a loop, and the engine must reject it rather than resolve it.

---

## 15 · Aspect ratio

```
aspect?: number     // width / height, in CELLS
```

**Resolved after both axes have a size**, by shrinking the axis with slack — never by growing,
which would overflow a box that already fits.

**A terminal cell is roughly 1:2**, so a visually square plot is about twice as wide as it is
tall. **`aspect` is in CELLS and the caller does the conversion** — a 16:9 figure is
`aspect: 16/9 * 2`. Stated because getting this wrong silently is easy and the result merely
looks slightly off rather than broken.

**And it is lumpy.** 40 \u00d7 9 at `aspect: 3.5` wants 31.5 columns; it gets 31, and the real ratio
is 3.44. **There is no fixing this** — say so, and never assert an exact ratio in a test.

---

## 16 · Degenerate sizes — stated, because they happen

```
width 0            solve nothing, emit nothing, measure 0. Not an error
height 0           the same
width < padding    padding is CLAMPED to the width, inner size is 0
1 row              a container with a border gets NO border: the border would
                   be the whole box. Content wins over chrome
a child at 0       kept in the tree, emits nothing. It is not dropped \u2014
                   dropping is a DECISION and this is an arithmetic outcome
```

**`mosaic.ts` currently has an ad-hoc answer** — *"a cell with no room is zero-wide and is not
drawn"* — which \u00a73 rules wrong. **Under this engine the cell never gets zero width**, because the
grid shrinks and drops before it gets there.

---

## 17 · Refused, so nobody ports it

**Baseline alignment.** Everything in a terminal is row-aligned by construction. There is no
baseline, and a `baseline` value copied from a web layout model is a value with no meaning.

**Negative margins.** There is no margin at all (\u00a77). There is certainly no negative one.

**Fractional anything.** \u00a71.

**A float in the flow.** A float takes no space, by definition. A thing that takes space and
overlaps is two boxes and a bug.

**`order`.** Declaration order is the tie-break for distribution and for dropping (\u00a712 rule 2 and
6). **A separate visual order would make the reproducibility rules depend on two orderings**, and
one of them would eventually disagree.

## 18 · What measure must guarantee

**C09 I1: `measure(block, w)` equals the number of rows `render(block, w)` occupies — computed
without rendering.**

Under this engine both halves build the same node tree and run the same passes. `measure` stops
after pass 4 and reads the root's height; `render` continues to pass 5 and walks the boxes into
rows.

> **C09 I1 then holds by construction rather than by discipline** — which is the property the Yoga
> route was going to buy, obtained without the dependency.

**The conformance suites currently prove the rows arm by comparing it against the Ink arm.
Freeze those outputs as fixtures BEFORE Ink is deleted**, or step 6 removes the oracle.

---

## 19 · The API, in one shape

```ts
type Size =
  | { kind: "fixed";   n: number }
  | { kind: "fit";     min?: number; max?: number }
  | { kind: "grow";    min?: number; max?: number }
  | { kind: "percent"; p: number }

type Box = {
  id: string
  direction: "row" | "column"        // default "column"
  width:  Size                       // default fit
  height: Size                       // default fit
  padding?: { l?: number; r?: number; t?: number; b?: number }
  childGap?: number
  align?: { x?: "l" | "c" | "r" | "stretch"; y?: "t" | "c" | "b" | "stretch" }
  aspect?: number                    // width / height, in CELLS (§15)
  sticky?: "top" | "bottom"          // excluded from childOffset (§14)
  representations?: readonly { min: number; box: Box }[]   // §12
  overflow?: { x?: Overflow; y?: Overflow }   // default wrap on x, clip on y
  clip?: { x?: boolean; y?: boolean; offset?: { x: number; y: number } }
  dropPriority?: number              // lower drops first
  floating?: Floating                // takes no space; see §10
  children: Box[] | Leaf
}

type Floating = {
  attachTo: { kind: "parent" } | { kind: "element"; id: string } | { kind: "root" }
  anchor:   { self: Point; target: Point }
  offset?:  { x: number; y: number }
  layer:    "float" | "overlay" | "debug"
  clipTo?:  "none" | "attachedAncestor"          // default attachedAncestor
}
type Point = "tl"|"tc"|"tr"|"cl"|"cc"|"cr"|"bl"|"bc"|"br"

type Leaf =
  | { kind: "rows";  rows: Row[] }                       // already composed
  | { kind: "text";  runs: Run[]; wrap: Overflow }       // measured by cells()
  | { kind: "paint"; measure(w: number): number;         // a plot, an image
                     render(w: number, h: number): Row[] }
```

**`measure(box, w)` → `number`. `layout(box, w)` → `SolvedBox` tree. `compose(solved)` → `Row[]`.**

**Plus `invalidate(id)` and a cache keyed on `(box identity, available width)` and nothing else
(§13).** The cache is the engine's only mutable state and it is the reason this is faster rather
than slower than what it replaces.

**A `paint` leaf is the escape hatch** and it is how a plot, an image and an attached terminal
participate: they answer a height for a width and then fill a box. **The engine never looks
inside one**, which is the same rule as *the frame washes and the figure does not*.

---

## 20 · Reproducibility — the rules that make goldens work

**Every one of these exists because a golden frame must be byte-identical twice.**

```
1  integer arithmetic throughout. No float ever enters a dimension
2  largest-remainder distribution, ties by DECLARATION ORDER
3  integer centring rounds DOWN
4  clamping before distribution, iterated to a fixed point
5  drop order is declared, never derived from size
6  a tie in drop priority breaks by declaration order
7  the tree is the only input. No clock, no random, no id hashing
8  a float nudges by the MINIMUM to fit, along one axis at a time, x first
9  a float lands on whole cells and never splits a grapheme cluster
10 a representation is chosen bottom-up in ONE pass, never searched
11 the cache key is (identity, width). Anything else in it is a cache that misses
```

**Rule 7 is the one to check in review.** Anything that makes a layout depend on something other
than the tree and the width is a frame that will not reproduce, and the 458 goldens will find it
the hard way.

---

## 21 · What this replaces, per surface

**Each line is currently a thing every renderer remembers. After this each is a property.**

```
three columns per nested level            padding.l = 3
content stops one before the right edge   root padding.r = 1
a blank row between entries               childGap = 1 at the sequence level
a block emits no leading/trailing blank   there is no margin
a container is as tall as its contents    height: fit
a bounded body says how many are hidden   height: fixed + a residue row
the focus wash covers the extent          the solved box
a picture's frame washes, not the figure  a paint leaf inside a painted box
the 40-column drop order                  dropPriority
```

---

## 22 · Open, and to be settled in the build

**`NavElement` is one rectangle and a wrapped run is many.** Decided: **defer, record the shape.**
The prompt editor already represents a wrapped selection as per-row spans from the same wrap
walk — that is the precedent to adopt when a kind first needs it. Nothing produces a fragmented
element today.

**Percent of what, exactly.** `PERCENT(p)` is p of the parent's inner size after padding and
gaps — which means a row of three `PERCENT(0.33)` children does not fill the row. State whether
that is acceptable or whether percent should be of the pre-gap size, and pick one.

**Wrap inside a growing box is a fixed point.** Text wraps at the solved width, which changes
the height, which cannot change the width — so one re-fit pass suffices. **Assert that**; if a
kind ever makes height feed back into width, the engine loops.

**`scroll` over an unsliceable child** renders 16 rows against a measure of 5. Ruled and tested;
the open part is corpus coverage. **Do not rewrite `scroll` while it is outstanding.**
