# C29 — Layout engine

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L1 presentation |
| **Depends on** | `cells()` and the wrap functions (C09 `presentation/text`) · `divideShares` (C04) · nothing above L1 |
| **Consumed by** | C09's registry and container kinds · C11 · C15's `place()` · anything that needs a solved box |
| **Source** | `docs/design/layout/LAYOUT_ENGINE.md` §§1–22 · `docs/notes/C29_LAYOUT_WALK.md` · F1219, F1220 |
| **Status** | The sizing core is built — `src/presentation/layout/`, seventeen tier-1 rows. **No container kind is on it yet**; §§10–13 of the source arrive with their own phases. |

---

## 1. Purpose

Every appearance rule the framework has is a statement about a box model: *every nested level costs
exactly three columns*, *content stops one column before the right edge*, *a container is as tall as
its contents*. Written against hand-computed widths each is re-derived per surface, and the fourth
surface disagrees with the first.

C29 is that box model. **Children declare their natural size; parents derive theirs from their
children. Nothing is imposed downward until pass 2, and pass 2 only distributes slack or deficit.**

**The sizing model and the pass structure are ported from `nicbarker/clay`** (Zlib, read at
`v0.14`); the module header carries the attribution. What is not ported: the arena (meaningless in a
GC'd runtime), floats as a numeric type (§2 — the unit is a cell), culling (C14 virtualises), and
the measure-text cache (C09's registry has one, keyed on the block's identity — F1219's companion
reading found the cache the source proposed already built, three times, correctly).

**Not a solver dependency, and the reason is measured.** Yoga through Ink re-measured every row
through a second width implementation and forced two SGR tokenisations per row — 28.5 % of a mosaic
frame against 6.9 % for the layout itself (`LAYOUT_PASS.md` §4). C09 I72 removed it, and adopting a
solver now would buy back the small number and re-introduce the large one.

---

## 2. Public interface

```typescript
type Size =
  | { kind: "fixed";   n: number }
  | { kind: "fit";     min?: number; max?: number }
  | { kind: "grow";    min?: number; max?: number }
  | { kind: "percent"; p: number; min?: number; max?: number };

type Overflow = "wrap" | "truncate" | "clip" | "scroll";

type Box = Readonly<{
  id: string;
  direction?: "row" | "column";            // default "column"
  width?: Size;                            // default fit
  height?: Size;                           // default fit
  padding?: Readonly<{ l?: number; r?: number; t?: number; b?: number }>;
  childGap?: number;
  align?: Readonly<{ x?: "l" | "c" | "r" | "stretch"; y?: "t" | "c" | "b" | "stretch" }>;
  spend?: "none" | "largest-remainder";    // the leftover policy (I4)
  aspect?: number;                         // width / height, in CELLS
  overflow?: Readonly<{ x?: Overflow; y?: Overflow }>;
  clip?: Readonly<{ x?: boolean; y?: boolean; offset?: { x: number; y: number } }>;
  children: readonly Box[] | Leaf;
}>;

type Leaf =
  | { kind: "rows"; rows: readonly string[] }
  | { kind: "paint"; natural?: number;             // its natural width; absent is 0 (I3)
      measure: (w: number) => number; render: (w: number, h: number) => readonly string[] };

type SolvedBox = Readonly<{
  id: string;
  rect: Readonly<{ x: number; y: number; width: number; height: number }>;   // parent-relative
  clip?: Readonly<{ x: boolean; y: boolean; offset: Readonly<{ x: number; y: number }> }>;
  leaf?: Leaf;
  children: readonly SolvedBox[];
}>;

function measure(box: Box, width: number): number;              // stops after pass 4
function layout(box: Box, width: number): SolvedBox;            // all five passes
function compose(solved: SolvedBox): readonly string[];         // rows, through C09's composers
```

**`compose` is not new.** It writes C09's `Placed` (`presentation/rows.ts`) and hands it to
`placeRows`, which already composes a grid of pieces into rows and already sorts by column (F1213).
The engine's terminal product is a `Placed[]`; the composer is the one that exists.

**A `paint` leaf is C09's `BlockDefinition`, not a second renderer contract.** `measure(block, w) →
number` and `render(block, ctx) → readonly string[]` is this shape already; the engine never looks
inside one, which is the same rule as *the frame washes and the figure does not*.

---

## 3. Sizing — four modes, both axes

```
FIXED(n)              exactly n cells
FIT(min?, max?)       the natural size of the contents, clamped
GROW(min?, max?)      a share of what is left over, clamped
PERCENT(p, min?, max?)  p of the parent's inner size, after padding and gaps
```

**Defaults: `FIT` on both axes.** An element with no sizing declared is as big as its contents.
`GROW` and `PERCENT` are both two-axis: a mosaic cell grows horizontally to share a row and
vertically to fill the tallest cell.

**A `FIT` container's natural size** is the sum along its layout axis and the max across it, plus its
own padding and gaps, computed bottom-up with the leaves as the base case. A `rows` leaf's natural
width is its widest row by `cells()`; a `paint` leaf's is the `natural` it declares, and **absent is
0** — which is `GROW`'s default by I3 and is what every paint kind in the tree wants: a plot, an
image and an attached terminal all fill what they are given. The field exists so that the sentence
*whatever it declares* has something behind it; a clause naming a declaration that cannot be written
forbids nothing while reading as though it does (A03 §2).

**`GROW` and `PERCENT` contribute their `min` to a `FIT` parent** (I3). Neither has a natural size —
that is what they mean — and the two rules that could answer are circular: a parent derives from its
children while the child takes a share of what the parent has left. `min` defaults to 0, so a
growing child in a fitting row contributes nothing and the row is as wide as its non-growing
children. Treating `GROW` as `FIT` in pass 1 would let a growing child's content decide the parent's
width, which is the behaviour `GROW` exists to refuse.

**`PERCENT` is of the inner size after padding and gaps**, so three `PERCENT(0.33)` children do not
fill the row. Kept and stated: making them sum to 100 % would have to take the gaps out of the
percentages, which is §6's *spacing belongs to the container* stated backwards.

---

## 4. The passes, and the order is load-bearing

```
1  FIT, bottom-up, WIDTH      each box's natural width from its children
2  GROW/SHRINK, top-down      distribute leftover or deficit across the width axis,
                              clamped by each child's min and max; aspect's width half;
                              stretch, when the cross axis is width
3  RE-FIT, HEIGHT             text re-wraps at its solved width, so heights are only
                              knowable now. Fit bottom-up on height
4  GROW/SHRINK, top-down      the same distribution on the height axis; aspect's height
                              half; stretch, when the cross axis is height
5  POSITION                   walk down applying padding, gap and alignment
```

**Pass 3 is the one people skip.** A wrapped paragraph in a growing column does not know its height
until the column knows its width — which is why `measure(block, w)` takes a width at all, and why
the engine preserves that dependency rather than solving both axes at once.

**One re-fit suffices, and that is asserted rather than assumed** (I11): text wraps at the solved
width, which changes the height, and no kind may make height feed back into width. A kind that did
would make the engine loop.

---

## 5. Distribution — integer, reproducible, and the leftover is declared

**Largest remainder, ties by declaration order.** Give every child `floor(share)`; sort the leftover
by fractional part descending, ties by the order the author wrote them; hand out one cell each until
the leftover is gone. Declaration order for ties is what makes the frame a pure function of the tree,
which is what a byte-exact golden requires.

**The leftover is a declared policy and not a property of the arithmetic** (C04 I42, F1219). A
`group` spends nothing — it has no child that claims the residual — and a mosaic tiles, because a
grid that leaves its right-hand column short is ragged in every faceted frame. One function serves
both; `spend` says which.

**Clamping runs before distribution and iterates to a fixed point.** A child pinned at `max` leaves
its surplus in the pot; a child at `min` takes its deficit from the others. Each round pins at least
one child or terminates, so `n` rounds is exact for `n` children rather than generous — and the round
count is **counted**, because a fixed point reached in `n + 1` is a defect in the clamping order that
every frame assertion would pass (I5).

**`min` is a hard floor.** When the minima do not fit, the container **clips** and no child is
dropped (I6). Dropping is a decision; this is an arithmetic outcome, and the distinction is §9's.

---

## 6. Padding, gap, alignment, stretch

```
padding     INSIDE the box, around its children. It reduces the inner size
childGap    BETWEEN children, on the layout axis only. n children have n − 1 gaps
margin      does NOT exist
```

**Margin is deliberately absent.** A block carrying its own outer spacing is how two adjacent blocks
each contributing one row produce two — `APPEARANCE.md` §5's *a block never emits a leading or
trailing blank row itself*. Spacing between things belongs to the thing that contains them.

**A child solving to zero keeps its gap** (I7). §9's distinction is the reason: a dropped child is
gone and takes its separator with it, and a child at zero is present. A row whose gaps appear and
disappear with its contents' widths is a row that jitters.

**Alignment acts only on slack, and integer centring rounds down** — one leftover cell to the right,
or the bottom. With a `GROW` child there is no slack by definition, so alignment is silent; a
declared alignment with no slack on that axis is a **counted no-op** (I8), so *why is my alignment
ignored* has a number for an answer rather than a reading of the source.

**Stretch resolves where the cross axis is solved** — pass 2 when the cross axis is width, which is
a `column`'s, and pass 4 when it is height, which is a `row`'s (I9, F1221). It overrides a child's
`FIT` on the cross axis only. A child with `FIXED` on that axis is never stretched — an explicit size
beats an inherited one. Against `GROW` on the cross axis it is a no-op and not an error, because the
default for a mosaic row **is** stretch and an error would fire on the default.

**The pass number is the axis's and not a constant, and it was a constant until pass 2 was written.**
A stretch that widens a `FIT` child after pass 3 has wrapped its text leaves the committed height
standing at the pre-stretch width — F1220's D1 exactly, one rule over, and repairing it inside pass 4
would be the second re-fit I11 forbids. The walk's S3 row reads *after heights exist, which is why
§11 says pass 4*, which is true of a `row` and names no direction; the source's §11 is written from
the mosaic row, the only stretch the corpus has.

---

## 7. Overflow, clipping, and aspect

**Four behaviours, declared per axis, and they are not interchangeable**: `wrap` reflows to more rows
and is for prose only; `truncate` cuts and marks, one row always; `clip` draws and drops what is
outside the box; `scroll` is clip plus a `childOffset`.

**Clipping is per axis**, and `childOffset` is how scroll works — the container clips and the child
is placed at a negative offset. One mechanism for mosaic cells, scroll blocks and attached terminals.
**A clip never changes a measured height** (I15): the height was committed before anything was drawn,
and a clip that shortened it would make C09 I1 false one frame later.

**And a container that clips on an axis does not impose its size on that axis** (I15, F1222). Both
halves of the mechanism need the child to be *bigger* than the box, and a container that had already
shrunk it to fit has nothing left to clip and nowhere for the offset to move to. Surplus still
distributes — a clipping container with slack is an ordinary container, so a `clip` declared
defensively cannot move a frame that fits — and only the deficit is refused. **That split is a choice
rather than a derivation**: a caller wanting a clip that also refuses its surplus wants a second flag,
not a change to this one.

**Aspect resolves on the width axis in pass 2 and the height axis in pass 4** (I10, F1220 D1). The
source resolves it *after both axes have a size*, which leaves every height computed in pass 3
standing at the pre-aspect width — a box of wrapped prose solved at 40 and shrunk to 31 carries 40's
height, and `measure` returns exactly that number. Width precedes height, an aspect is a width
constraint like any other, and it belongs where widths are decided. **Aspect only ever shrinks**, and
with no slack on either axis it loses.

---

## 7b. Representations — the engine owns the third family, and the other two keep their owners

`LAYOUT_ENGINE.md` §12 proposes representations on a box, picked by the engine in pass 2. **Measured
against the tree, the intent has three families and the engine owns the third** (F1228, F1232,
`docs/notes/C29_REPRESENTATIONS_WALK.md` A1–A3). The first two have owners already and are not moved
here; the third had no owner and now has one.

| family | the owner | built? |
|---|---|---|
| a **leaf** degrading — fewer features, a shorter label, a shed column | the **definition**, inside `render` | `status`'s `widthRung`, `plot`'s `layoutFor`, `table`'s admission loop, `image`'s fall to a status box. Four built; `comparison`, `keyValue`, `events` and `steps` owe one (C09 I81) |
| an **authored** alternative — a wordmark, a piece of art | the **document layer**, `art()` | built, with a consumer across the seam: the docker banner's `wordmarkFor` |
| a **container** choosing a different subtree | **the engine**, in pass 2 | **built** — `Box.representations`, forms in preference order, the first that fits taken and the last taken regardless. It had no consumer in `src/` when it landed and was built as groundwork (F1232) |

**A `paint` leaf is opaque to the engine by its own declaration** — `Leaf`'s doc comment reads *the
engine never looks inside one* — so pass 2 cannot see a leaf's forms however they are declared. That
is not an omission to be repaired: it is what makes `measure` a number the engine can distribute
without knowing what draws it, and it is why all four built ladders are computations inside
definitions rather than lists outside them.

**And an authored alternative is a different block, not a different box.** The engine takes a `Box`
tree built *from* blocks; choosing a variant inside pass 2 would mean rebuilding a subtree mid-solve,
which is the search §12's own last paragraph forbids.

**One thing §12's spelling gets worse than the built mechanism, and the field ships without it**: a
declared `min: number` beside a form is a **second record of one number**, and it disagrees with the
form the first time the form is edited. So `representations` is `readonly Box[]` and **not**
`{min, box}[]`: a form's minimum is its own pass-1 fitted width, through the one width authority (C09
I72). A hand-written minimum is the drift C09 I1 exists to prevent, declared voluntarily.

**How it resolves, and it is one pass with no search.** Pass 1 fits every form, so each has a natural
width measured the same way every other box's is. Pass 2, once the box's own width is known, takes the
**first form whose natural width fits**, and the **last form regardless** — which is `art()`'s
contract at the box layer and the reason the fallback may not be empty. The choice is made before the
box's children are distributed, so the rest of pass 2 and every later pass see one tree and never a
candidate set.

**The id is the box's; the content is the form's.** Choosing a form replaces the box — direction,
padding, gap, overflow, alignment, spend, aspect, clip, height and children — and keeps the outer
`id`, so a solved tree is addressable by the same name whichever form was taken. A merge of the two
would be a second rule about which half wins per field, and every field would need one.

**`width` is the single exception and it is not a merge rule.** Pass 2 asks the parent before it asks
the child, so the box's declared width is what the parent distributed against, one call above the
point where the form is chosen. A form's own width would be a number nobody reads. Stated here
because the build is what made the ordering visible, and a reader checking the sentence above against
the code would otherwise find it false in one field.

**What this does not move.** A leaf's forms stay inside its definition, because `Leaf`'s own
declaration says the engine never looks inside one; an authored variant stays at the document layer
with `art()`, because a variant is a different *block* and choosing one in pass 2 would mean
rebuilding a subtree mid-solve. Neither of the four built ladders is retrofitted to this list.

## 7c. Sticky — built, and its refusal clause names a loop this engine cannot express

`sticky?: "top" | "bottom"` is a child **excluded from its container's scroll offset**, and it is one
field read at one site: `collect` applies `clip.offset` to every child, and a sticky one is placed
against the container's own edge instead. **It occupies flow space** — it displaces its siblings and
the scrollable area is what remains — so nothing in the sizing passes reads it.

**Two rules, and §14 states one.** Skipping the offset is half the mechanism. The other half is
**order**: a sticky child sits where flow put it, its scrolling siblings land on the same rows, and
one of them wins. Sticky children are collected **first**, before every sibling.

**First and not last, and the frame is what settled that.** The obvious reading of the second rule is
a painter's — draw the sticky child after everything else so it covers them — and this document said
exactly that until a frame refused it. `composeRow` walks a **cursor** left to right and cuts a piece
that starts behind it (`rows.ts:477`), so the piece composited *later* at a column is the one that
loses, not the one that wins. Collected last, `sticky: "top"` at `offset.y = 3` produced a frame
**byte-identical to no sticky at all**: the field was read, the piece was emitted, and the row it
belonged on had already been claimed. **A ruling that names an operation checks the operation
exists** — this one named a painter and the layer below is a cursor (F1234).

**The refusal clause is corrected rather than built.** §14 refuses *a sticky child that is `GROW` on
the scroll axis* because *it would grow to fill the space it is excluded from, which is a loop* — and
a child that occupies flow space is excluded from **no space**, only from an offset, so there is
nothing for it to grow into. Measured: a `GROW` child of a container clipping on `y` at a fixed height
of six, beside a one-row header, solves to **five** and does not diverge; the clip hands
`POSITIVE_INFINITY` to the *distribution*, because a clipping container does not impose its size on
the axis it clips (I15), while `GROW` still resolves against the inner box. A refusal whose premise
the arithmetic cannot produce is a validation path nothing reaches, which is what I16's example was
corrected off — and **that correction now rests on the mechanism rather than on the field's absence**.

**What §7c used to say, and why it was wrong to leave it there.** The field was refused as *an export
nothing consumes*, naming C25 I18's patch window and `documents.ts`'s result notice as the two places
that want the effect and have the wrong shape. Both readings stand and neither is the question: **the
mechanism's subject is a frame, not a surface.** A container clipping on `y` with `offset.y = 3` draws
its body from `b2` and its header is gone — the engine draws that wrongly today, with no new type
needed to construct it.

## 7d. Layers — the engine places none, and the two mechanisms are C15's

`LAYOUT_ENGINE.md` §10 asks the engine for floats declared in the tree, `attachTo` by element id,
anchor points, a nudge, `clipTo: "attachedAncestor"`, a named four-position stack and a frame ring.
**Two of those are built, one is built a layer above where the design puts it, and three have no
subject** (F1230, `docs/notes/C29_LAYERS_WALK.md`).

**§10 holds two mechanisms under one heading, and this section is about the first.** C15's *layer
stack* — a list of layers placed against a region, which the engine does not touch — is what every
ruling below measures. The *float declared in the tree* is a different thing that happens to share
§10's vocabulary: it is a box, it is sized by the engine's own passes, and §10 step 2 resolves its
attachment against **pass 5**, which is this engine's. That half is **built** and is §7f; the
refusals here are not retracted by it, because they are about layers (F1235).

**Built, in `place.ts`.** `sortLayers` partitions by `kind` — `view`, then `peek`, then `overlay`,
stable within each — and no integer exists anywhere in C15, so §10's *refused: a free integer
z-index* holds by construction rather than being owed. The nudge is step 7 and it is **one axis**,
not two: it shifts a layer whose anchor leaves no room inside the region, clips only where the height
cannot fit, and carries `truncated` to the owner. **The horizontal clamp beside it is unreachable** —
measured by removing it, which leaves C15's unit and contract suites wholly green, and constructive
rather than corpus-shaped: `resolveWidth` bounds the width by the region, an anchored layer takes
`left = 0`, and a centred one takes a column already inside `[0, region.width - width]`. It is a
guard, and what bounds the horizontal is the width clamp (C15 I16). §10's four positions are not the tree's three, and the difference is the measurement — `base`
is not a layer, `float` has no member, and `debug` has none either, because the profiler's overlay is
`kind: "view"` and therefore sorts bottom-most.

**A derived anchor is the caller's.** `construct.ts` resolves the peek's row through the entry's
chrome and the viewport's scroll offset and hands C15 a number. So §10's *no layer's position can be
derived from a box in the layer beneath it* is false on the vertical axis, and `layout()` is pure
because the caller resolved — not because the resolution does not happen. `attachTo: {kind:
"element"; id}` and `clipTo: "attachedAncestor"` are **refused for that reason**: both read the
solved tree and the scroll offset, neither of which is the stack or the region (→ C15 I5).

**The horizontal axis has no subject.** §10's motivating cases — a tooltip, a hover card, an inline
completion beside a token, a callout on a plot — each want a *column*. The only layer attached to an
element is the peek; a peek exists only where a `NavElement` declares `detail`; and `detail` is
emitted at exactly one site, on an element whose span is the table's whole width. There is no
*beside*. The two narrow-span emitters declare no `detail`, and C26 F1216 refuses widening
`NavElement`, which is where a per-row span would have to go. **The field's own documentation says
*shown beside it***, which is a position its only producer cannot occupy — and C19's `menuLayer`
already ruled the design's second example the other way, in writing: *a menu narrower than the region
leaves whatever is behind it visible on the same rows.*

**And the mechanism would have been inert.** A layer declaring a column and no width takes
`region.width` from `resolveWidth`, so the clamp returns its `left` to zero: the field would do
nothing for every layer that did not also declare a width (walk A3). A horizontal anchor is refused
rather than defaulted.

**Frames are refused by §10 itself.** `frameRing` is in no file; the four `kind: "view"` producers
are each one layer over one base, which **is** the frame stack with one member — *the correct
outcome, not a wasted mechanism*, in the section's own words, with `INTERACTION.md` §14's *there are
no pushed views* the ruling that keeps it so.

## 7f. Floats — declared in the tree, skipped by every sizing pass, resolved after pass 5

`floating` is a box that **takes no space**: it contributes nothing to its parent's `FIT`, displaces
no sibling, and is absent from every distribution. It is declared inside the tree so that it has a
parent to attach to, and it is resolved once the tree is positioned, into a product **beside** the
solved box rather than inside it — `layoutCounted` returns `floats`, and `SolvedBox` never carries
the field, because a float is resolved rather than carried.

```ts
floating?: {
  attachTo: { kind: "parent" } | { kind: "element"; id: string } | { kind: "root" };
  anchor:   { self: Point; target: Point };
  offset?:  { x: number; y: number };
  layer:    "float" | "overlay" | "debug";
  clipTo?:  "none" | "attachedAncestor";
}
```

**The engine owes six steps and §10 states them in the wrong order at two of them** (F1235,
`docs/notes/C29_LAYERS_WALK.md` Artefact C).

1. solve the base tree; floats are skipped **upward only** (C4)
2. resolve `attachTo` against the **composited** rect — the offset applied, not the flow rect (C2)
3. size the float by the same four passes, against its own `FIT` and never the frame's width (A3)
4. position it by anchor, then by `offset`
5. take the window: the attached ancestor's clip, or the frame when `clipTo` is `"none"` (C1)
6. **nudge inside that window** on **both axes, one at a time, `x` first**, and clip only where it
   cannot fit at all

**Step 6 is §10's step 4 and it has moved.** §10 nudges into the *frame* and then intersects with the
*ancestor's* clip, which are two different windows in that order: a tooltip near the bottom of a
scroll block is nudged to a row the frame allows and the ancestor does not, then clipped to nothing —
**moved to the one place it cannot be drawn**. The nudge answers to the window the float will be
clipped to, so the window is chosen first. Every other step of §10 is right.

**The nudge is both axes and it is ordered, `x` then `y`.** §10 states one rule for two axes and C15
has one axis of it plus an unreachable clamp (I19) — that asymmetry is C15's history and not a design.
A float is nudged by the **minimum shift** that brings it inside the window, horizontally first: the
two axes are independent here because a whole-cell rect has no diagonal constraint, and the order is
declared anyway so that a float too large on both axes lands at the window's origin deterministically
rather than at whichever corner the implementation reached last.

**The attach rect is the composited rect, and no fixture at offset zero can see the difference.** A
float attached to row 9 of a list scrolled to row 3 belongs at screen row 6; resolved against
`SolvedBox.rect` it sits at row 9 and detaches from the thing it points at, which is the whole of
what a float is for. `collect` already applies the offset and the resolution reads the same number.

**`floating` and `sticky` are opposites wearing one sentence, and they are I16's missing worked
example.** Both read as *this child is not laid out normally*: a sticky child **occupies flow space**
and is excluded from an offset (I21); a float **takes no space** at all. A box declaring both asks
for a child that occupies flow space and does not.

**And the engine does not throw on it** — I16 is exact and it governs: *a contradictory declaration
is refused at construction, never at layout*, because `measure` is pure and total and a throw
mid-pass abandons a half-solved tree. The first draft of this section threw in `build`, which is
precisely the thing I16 forbids; it also **fired for nothing**, because a float never reaches `build`
through its parent, and the frame-read said `NOT REFUSED` where the check read as obviously correct.

So the engine is **total on the contradiction and does not resolve it by preference**: `sticky`
modifies a child's place in **the flow**, and a float has no place in the flow, so on a float the
field has no subject rather than a losing claim. The refusal belongs at C04's boundary with every
other construction error. **This is the example I16 has been missing** — it was corrected off a
`sticky` child that is `GROW` on the scroll axis because *the contradiction cannot be expressed*, and
this one can (I16, F1235).

**An unresolvable attachment omits the float; it never throws.** `Box.id` has no uniqueness rule, so
`{ kind: "element" }` takes the **first** match in document order — a choice, because throwing on a
duplicate makes a float's validity depend on a box two subtrees away that it does not name. And a
throw mid-walk abandons every float already placed, which is the rejection path both artefact shapes
are blind to: C15 already omits a zero-row layer without dismissing it, and this is that rule one
layer down. A float naming a float not yet placed is the same condition, so a cycle needs no
detection of its own.

**Order within a layer is document order**, which is the only total order a tree supplies, and the
walk is stable. The four names are §10's and no integer exists: a layer that overlaps another
destroys it, and an integer anyone can pick is two things claiming a cell with the larger number
winning.

## 7g. Frames — a ring, a stack within a tab, and a layer stack within a frame

`LAYOUT_ENGINE.md` §10's last third is three shapes stated as one ladder, and **a ring and a stack
must not share one** — `INTERACTION.md` §2 corrected that error once already, where nesting, modality
and parallelism were all wearing the same ladder.

```
FRAME RING      tabs — main and its subagents. ⌃⇥ cycles sideways; esc never leaves one
  FRAME STACK   within one tab: a view pushed over its base; esc pops
    LAYERS      within one frame: base · float · overlay
DEBUG           global, above every frame, and it survives a tab switch
```

**The ring is not a stack and the engine says so in its type.** A ring has `next`/`previous` and no
`push`/`pop`; nothing is above anything, and there is no top. A stack has `push`/`pop` and no cycle.
Giving them one type is what makes `esc` ambiguous, which is the defect §10 names and the reason the
two are separate products here.

**Each frame owns its own layer stack**, which is what makes tabs work and is free once the nesting
is right: a question open in tab B does not block tab A, switching tabs dismisses nothing and pops
nothing, a float in tab B is clipped by tab B's scroll block rather than by the visible frame, and a
frame's scroll position is the frame's and survives a switch.

**Only one frame composites.** Layers blend — a float draws over its base and both are visible —
and frames do not: the frame you are in is the only one drawn. **So a frame switch is a full repaint**
and the frame diff sees every cell. That is the honest cost of `⌃⇥`, it is bounded by the region, and
it is stated here so that nobody reports the switch as slow and goes looking for a bug.

**Debug is the exception and is global**, above every frame and outside the ring: the profiler's
overlay must not vanish because you switched tabs to look at what it is measuring.

**What this does not settle, and it is not the engine's to settle.** `INTERACTION.md` §14 says there
are no pushed views and names what each one became. **That ruling is about usage, not about the
mechanism**: content that belongs in the record must not leave it, and having a frame stack does not
undo the rule — it means the shape exists and the rule governs what may occupy it. The test is
unchanged: *does it have its own prompt and its own context?* A subagent passes; a log does not. If
nothing else ever passes, a tab's frame stack has exactly one member and costs nothing, **which §10
pre-authorises as the correct outcome rather than a wasted mechanism**.

## 7e. Incremental layout — the cache is C22's, and identity is the dirty mark

`LAYOUT_ENGINE.md` §13 asks for a DIRTY/CLEAN marking pass over the box tree, the rule that **a child
whose natural size did not change cannot dirty its parent**, and a cache *keyed on (box identity,
available width) and nothing else*. **The cache is built, one layer above the engine; the rule holds;
the machine has nowhere to run** (F1231, `docs/notes/C29_INCREMENTAL_WALK.md`).

**Built, and on §13's own key.** `construct.ts` opens a session `WeakMap<Block, {width, rows}>` before
the viewport and hands it down (→ C22 I100); the registry's child seam reads it on every ask and
reports a hit or a miss with its reason. The key is the block **object** and the width — §13's
sentence with `Block` where it wrote `box`. The engine holds no cache of its own and must not: the
memo stores the **floored, capped** figure the render path commits, so a hit is the same number by
construction rather than by agreement (→ C09 I61), where a cache of the *natural* size would have the
cap applied after each read and two answers to one question.

**The dirty machine has no mutable tree.** Blocks are frozen and replaced on change, so a changed
block **is** a new key, an unchanged child is the same object the memo answers without solving, and a
parent holding a changed child is itself rebuilt. §13's rule is satisfied by construction — **stricter
on one side**, because a block rebuilt with byte-identical content misses though its size did not
change, and **free on the other**, because no marking pass, dirty bit or propagation loop exists to
run. What identity also buys, and §13 does not say, is eviction: a settled entry's blocks are
collected with it, so nothing evicts and nothing subscribes.

**Measured rather than read**, because three of §13's four claims are about how often something
misses. `tools/bench/stress.mjs panel` at 120×40, 150 entries, a page sweep of forty: **421 absent
misses over 97 frames** against a corpus of roughly 750 measurable blocks — a population, not a rate —
with **zero width misses**, and an identical line from a run four times as long. So §13's opening
sentence, *the spec so far solves the whole tree every frame*, describes a tree with no cache above
it.

**The one limit, stated so nobody measures it as a defect.** The memo holds **one slot per block,
carrying the last width** rather than a map over widths. Asked at 80, then 60, then 80 again through
one memo, the slot reads 80, then 60, then 80 — so the third ask is a `width` miss. A resize sweep
re-measures everything it touches twice; a stable terminal width never pays it, which is why the
counter above reads zero and is the correct trade for a terminal.

**Left unbuilt, with the measurement that says how small it is.** §13's step 5 — *re-position only the
subtrees whose box actually moved* — is the one part with a subject, because the memo holds a height
and never the solved rects, so a render re-solves the `Box` tree even where the height was a hit. In
the panel case `panel` is 15.9% of self time and `group` 10.5%, of which the solve is a part. A second
store would hold rects only a composition consumes, and the composition is what C22 I100's memo was
measured against.

## 8. Invariants

- **I1** — **Every dimension is a whole number of cells, at every pass, on both axes.** No float
  enters a dimension and nothing is rounded at the end: in a grid where one cell is one row, a
  half-cell error is a visible defect. `cells()` is the only width authority — not `String.length`,
  not a second implementation, which is what removing Yoga was worth (C09 I72).
- **I2** — **A parent's natural size is a function of its children's natural sizes**: sum along the
  layout axis, max across it, plus its own padding and gaps. Computed bottom-up, leaves as the base
  case. Nothing is imposed downward until pass 2, and pass 2 only ever distributes slack or deficit —
  it never assigns a size from nothing, because a child that was never asked cannot say *that is not
  enough*.
- **I3** — **`GROW` and `PERCENT` contribute their `min` to a `FIT` parent, and `min` defaults to 0.**
  Neither has a natural size, and the two rules that could answer are circular. A default of
  *natural* would make `FIT` and `GROW` identical in pass 1 and different in pass 2, which is one
  size arriving twice (§8a A1, A2).
- **I4** — **Distribution is largest remainder with ties by declaration order, and the leftover is a
  declared policy.** `spend: "none"` leaves it unspent and `spend: "largest-remainder"` hands it out
  one cell each. A group spends nothing because no child of it claims the residual; a mosaic tiles.
  One function, and C04 I42 is where the group's half is ruled (F1219).
- **I5** — **Clamping runs before distribution and iterates to a fixed point in at most `n` rounds for
  `n` children, and the round count is counted rather than assumed.** Each round pins at least one
  child or terminates. A fixed point reached in `n + 1` rounds is a defect in the clamping order and
  passes every assertion about the frame (§8a A4).
- **I6** — **`min` is a hard floor and no child is dropped to honour it.** When the minima do not fit,
  the container clips. Dropping is a decision and this is an arithmetic outcome; a cell that cannot
  fit is drawn as much of itself as there is room for, never removed.
- **I7** — **Padding is inside, `childGap` is between, `n` children have `n − 1` gaps, and a child
  solving to zero keeps its gap.** Padding wider than the box is clamped to the width and the gaps
  clamp with it, so the inner size reaches 0 rather than going negative (§8a A7, A8).
- **I8** — **Alignment acts only on slack; integer centring rounds down; a declared alignment with no
  slack on that axis is a counted no-op.** A `GROW` sibling consumes the slack by definition, so the
  field is set and nothing happens — which is correct, and which the engine reports as a number
  rather than leaving to be read out of the source (§8a A6).
- **I9** — **Stretch resolves where the cross axis is solved — pass 2 when that axis is width, pass 4
  when it is height — overrides `FIT` on the cross axis only, never overrides `FIXED`, and is a no-op
  against `GROW`.** An explicit size beats an inherited one, always; and making the `GROW` case an
  error would fire on the mosaic row's own default (§8a A5). **The pass number is the axis's**: a
  stretch applied to a width after pass 3 has wrapped at the unstretched one leaves the committed
  height false, which is I10's defect one rule over and needs a second re-fit I11 forbids (F1221).
- **I10** — **Aspect resolves on the width axis in pass 2 and the height axis in pass 4, only ever
  shrinks, and loses when neither axis has slack.** Resolving it after pass 4 leaves every height
  from pass 3 standing at the pre-aspect width, which makes `measure` return a number for a width the
  frame does not use — C09 I1 violated by construction, in the engine that exists to make it hold by
  construction (F1220 D1).
- **I11** — **The five passes run in order and width precedes height. Text re-wraps only at its
  solved width, and one re-fit suffices.** No kind may make height feed back into width; the engine
  asserts it rather than assuming it, because a kind that did would make the engine loop.
- **I12** — **`measure(box, w)` stops after pass 4 and equals `compose(layout(box, w)).length`.** Both
  halves build the same tree and run the same passes, so C09 I1 holds **by construction** rather than
  as a written pair tested as a pair — which is the property the solver route was going to buy,
  obtained without the dependency.
- **I13** — **The tree and the width are the only inputs.** No clock, no random, no hashing of ids,
  and no memory of a previous frame. The representation a box chooses reads its own solved share and
  nothing else; flicker across a threshold is answered by the declared `min` values, never by what
  was chosen last frame, which would make a frame depend on its predecessor (F1220 D2).
- **I14** — **The degenerate sizes are answers, not errors.** Width 0 solves nothing, emits nothing
  and measures 0; a child at 0 is **kept in the tree** and emits nothing rather than being dropped; a
  container one row tall gets no border, because the border would be the whole box and content wins
  over chrome.
- **I15** — **Overflow is declared per axis; clipping is per axis with a `childOffset`; a container
  that clips on an axis does not impose its size on that axis; and a clip never changes a measured
  height.** The height was committed before anything was drawn (C09 I1), and a clip that shortened it
  would make the measurement false one frame later. **The third clause is what makes the first two
  mean anything**: `clip` drops what is outside the box and `scroll` moves it, and a container that
  had already shrunk its child to fit has nothing outside to drop and nowhere to move it — a
  published, set, read field with no input at which it changes a frame, which reads exactly like a
  field that works (A03 §2, F1222). Surplus still distributes; only the deficit is refused.
- **I16** — **A contradictory declaration is refused at construction, never at layout.** An `image`
  declaring both `width` and `aspect` is two ways to say one number and C04 I62 refuses it there; the
  refusal belongs at C04's boundary with every other construction error, because `measure` is pure
  and total and may not throw on any input (C09 I2). A throw mid-pass would abandon a half-solved
  tree and reach the frame as a fault rather than as a layout (§8a A10). A `Box` is built by L1 from
  an already-validated block — `groupMeasureBox`, `panelMeasureBox`, `scrollMeasureBox` — so the
  boundary this names is upstream of every field the engine reads. **The example was a `sticky`
  child that is `GROW` on the scroll axis, and it is still corrected off — on the second of its two
  reasons, which is the one that survived the field being built** (§7c, F1229, F1234). The first was
  that `sticky` is in no type; it is in one now. The second is that the contradiction cannot be
  expressed: sticky occupies flow space, so it is excluded from no space, and a `GROW` child of a
  clipping container resolves against the inner box rather than diverging — measured at five of six.
  **And the example it was missing has arrived: `floating` beside `sticky`** (§7f, I22, F1235). A
  float takes no space and a sticky child occupies it, which is a contradiction that **can** be
  constructed — unlike the one this invariant was corrected off — and it is refused at C04's boundary
  rather than in a pass. The engine stays total: on a float, `sticky` modifies a place in the flow
  that the float does not have, so the field has no subject rather than a losing claim. **A first
  draft threw in `build` and was wrong twice over** — it is the fault this invariant names, and it
  fired for nothing anyway, because a float never reaches `build` through its parent.
  An invariant whose worked example cannot be constructed forbids nothing while reading as though it
  forbade something, which is A03 §2's vacuity class arriving in a justification rather than in a
  rule, and **a refusal accumulates reasons: the one to keep is the one a build cannot remove**.
- **I17** — **The port is attributed in the module header with the version read, and the dependency
  is refused in writing.** Zlib's only real condition is the acknowledgement, and a licence nobody
  looked at is how one gets found at publication (`DEPENDENCIES.md`'s `elkjs` row is the precedent).
  The refusal is a row rather than a silence, because *we wrote our own* and *we considered theirs
  and measured why not* read identically from outside and only one of them survives being asked.
- **I18** — **The engine chooses a container's representation, in pass 2, in one pass and never a
  search.** `representations` is an ordered list of whole boxes: pass 1 fits every form, pass 2 takes
  the first whose natural width fits and the last regardless, and the choice is made before the box's
  children are distributed, so no later pass sees a candidate set. **The id is the box's and the
  content is the form's** — direction, padding, gap, alignment, spend, aspect, overflow, clip, height
  and children all travel with the chosen form. **`width` is the one field that cannot**, and the
  reason is an ordering fact rather than a rule about which half wins: the parent distributed against
  the box's declared width in the pass above, before this box was asked, so a form's width would be a
  number nobody reads. A form's minimum is **measured from the form** and never declared
  beside it — a hand-written `min` is a second record of one number that disagrees the first time the
  form is edited (C09 I72), which is why the field is `readonly Box[]` and not `{min, box}[]`. The
  other two families keep their owners: a leaf's forms stay inside its definition, because `Leaf` is
  opaque to the engine by declaration, and an authored variant stays with `art()`, because a variant
  is a different *block* (§7b, F1228, F1232). **The leaf family is now built and is the evidence for
  that split rather than an argument for it** — C09 I81's shed step, shared by the four kinds that
  owe a narrow ladder, computes inside `render` from the width it is handed and is invisible here by
  construction. What it shows is that the two families need different mechanisms and not one: this
  invariant chooses between **whole boxes** on a natural width, and a kind's ladder ranks **parts of
  a row**, sheds the lowest whole and states the withholding. A single mechanism spanning both would
  have to look inside a leaf to find the parts (F1233). **Dropping is refused twice over and from two
  components**: the sizing core replaced C09 I35's clamp with a floor, and a form that dropped a child
  would leave a C26 focus on a block that draws nothing.
- **I19** — **The engine places no layer, and the two mechanisms §10 asks it for are C15's.** The
  named partition and the nudge are `place.ts`'s today — the nudge on **one** axis, because the
  horizontal clamp beside it has no input that reaches it and the width clamp is what bounds that axis; a derived anchor is resolved by the caller and
  handed down as a number, which is what keeps `layout()` a pure function of the stack and the region
  (→ C15 I5). **Every refusal this invariant used to carry is now built and none of them was about a
  layer's placement**: attachment by element id and an ancestor clip are §7f's, and both were refused
  about a *layer*, whose resolution reads the viewport's scroll offset, rather than about a **float**,
  whose resolution reads the solved tree the same call produced; the frame ring is §7g's, refused for
  having one tab, which is a statement that the thing is unbuilt and is the premise of the phase. **A
  refusal that names a purity property checks which signature holds it**, and a refusal that names an
  absent member checks whether anything is *queued* to be one (§7d, §7f, §7g, F1230, F1235).
- **I20** — **The engine holds no cache, and incremental layout is identity.** The memo §13 asks for
  is C22's, opened per session and keyed on the block object and the width (→ C22 I100); it stores the
  floored, capped figure the render path commits, never a natural size (→ C09 I61). The dirty rule
  holds by construction because blocks are frozen and replaced — a changed block is a new key, an
  unchanged child is a hit, and eviction is the key's — so no marking pass exists. **One slot per
  block, carrying the last width**: a resize sweep re-measures twice and a stable width never does
  (§7e, F1231).

---

- **I21** — **A sticky child is excluded from its container's scroll offset and drawn last, and it
  occupies flow space either way.** `sticky?: "top" | "bottom"` is read at exactly one site — the
  composer, where `clip.offset` is applied — so no sizing pass sees it and a sticky child displaces
  its siblings like any other: the scrollable area is what remains. `"top"` keeps the position flow
  gave it; `"bottom"` is pinned to the container's far edge, which is the same exclusion said from
  the other end. **Collected first is half the rule and §14 states only the other half**: a child
  excluded from the offset still sits where flow put it and its scrolling siblings land on the same
  rows, so a header left in declaration order ends up under its own body. **First rather than last,
  because `composeRow` is a cursor and not a painter** — the piece composited later at a column is
  cut, so collecting the sticky child last drew a frame byte-identical to no sticky at all (§7c). **The refusal beside it is corrected rather than built** —
  *a sticky child cannot be `GROW` on the scroll axis* supposes the child is excluded from a *space*,
  and it is excluded from an *offset*; a `GROW` child of a container clipping on that axis resolves
  against the inner box and does not diverge, measured at five of six (§7c, I15, I16, F1234).
## 8a. The walk

`docs/notes/C29_LAYOUT_WALK.md`, run before any type existed. **Both artefacts**, because the
component has state and structure: a classification table over the cells where two sizing rules meet
at rest, and a sequence trace over the five pass boundaries.

**Twelve table cells, twelve rulings, no defects. The seven-row trace found two, and both were in
the source document rather than in a cell** — D1 (aspect resolved after the pass whose input it
invalidates) and D2 (nothing making the representation choice a pure function of the tree and the
width). Both make §18's *C09 I1 holds by construction* false, which is the engine's whole argument.

**A third arrived from the build and belongs here** (F1221): S3's ruling on `stretch` is correct
about the interaction and wrong about which axis it is on, because the row names no direction and
the source's stretch is the mosaic row's. It is the same defect as D1 and no reading of the artefacts
reaches it — a reader checking I9 against S3 finds them agreeing, since both say pass 4. **Writing
the pass is what named the axis**, which is the implementation falsifying the walk.

**A third artefact was added before 1.7** — artefact C, the narrow mosaic — because that is the one
step whose frames move, and *shrink, never drop* is a sentence about two mechanisms in different
files. Ten cells, two findings. **C9**: the ruling says *the container clips* and the mosaic's render
arm has nothing that clips — it hands `Placed` pieces to `placeRows`, which takes a height and no
width, so removing C09 I35's clamp would not move the cut elsewhere, it would remove it. Ruled: the
clamp moves from the geometry to the paint, so `childWidths`, `elements` and `render` finally give
one answer instead of three. **C10**: the walk's own first example was wrong and running it is what
said so, and the measured ruling is that a mosaic's lines are **proportions with a floor**, not
growers with a minimum — `base` from the largest-remainder share and `min: 1`, where taking the
floor off the budget first distorts every width.

**`docs/notes/C29_LAYERS_WALK.md` is the second walk**, run over §10 for phase 4, and it is the one
where the table earned its place: nine cells, and A3 is a defect no trace could reach — a column
anchor on a layer that declares no width is **silently inert**, because `resolveWidth` gives the
region and the clamp returns `left` to zero. Structural, with no event between the two rules, which is
C18's shape exactly. The six-row trace found no defect and produced the row worth keeping instead —
S1 and S2, where the peek's anchor is maintained by the key path and by the viewport's subscription,
**each blind to the other's case**, so a reader checking either alone would cut it as duplication.

That is CLAUDE.md's *two artefact shapes catch different interactions* arriving from the side that
usually goes unexamined: a sizing model reads as a classification problem, so the table is the
obvious artefact, and the table is the one that found nothing. **The table's blind spot is stated
with it** — it indexes pairs, and a cell where three rules meet is in neither artefact.

---
- **I22** — **A float is declared in the tree, takes no space, and is resolved after pass 5 into a
  product beside the solved tree.** `floating` is skipped **upward only**: the float's own subtree is
  sized by the same four passes, and what it contributes to its parent is nothing. Attachment resolves
  against the **composited** rect, so a float on a scrolled row follows the row; the window is the
  attached ancestor's clip, or the frame when `clipTo` is `"none"`; and the **nudge answers to that
  window rather than to the frame**, which is §10's step 4 corrected — nudging into the frame and then
  clipping to the ancestor moves a tooltip to the one place it cannot be drawn. The nudge is the
  **minimum shift on both axes, `x` first**, and the order is declared so a float too large on both
  lands at the window's origin rather than at whichever corner the implementation reached last. An unresolvable or
  not-yet-placed attachment **omits** the float rather than throwing, because a throw mid-walk
  abandons the floats already placed; `{kind: "element"}` takes the first match in document order, and
  order within a layer is document order. **`floating` and `sticky` are opposites and do not compose**
  — one occupies flow space, the other takes none — and that contradiction is **I16's missing worked
  example**, refused at construction rather than in a pass, because `measure` is total and a throw
  mid-walk abandons a half-solved tree (§7f, I16, I21, F1235).
- **I23** — **A ring, a stack and a layer stack are three shapes and the engine gives them three
  types.** The **frame ring** is tabs: `next`/`previous`, no `push`/`pop`, no top — nothing is above
  anything and `esc` never leaves one. The **frame stack** is within a tab: a view over its base,
  `push`/`pop`, and `esc` pops. The **layer stack** is within a frame — `base · float · overlay`,
  named and never an integer, because a layer that overlaps another destroys it in a terminal and an
  integer anyone can pick is two things claiming a cell with the larger number winning. **Each frame
  owns its own layer stack**, so a question open in one tab blocks no other, a switch dismisses and
  pops nothing, and a float is clipped by its own frame's containers. **Only one frame composites** —
  layers blend and frames do not — so a switch is a full repaint, bounded by the region and stated
  rather than discovered. **`debug` is global**, above every frame and outside the ring. Collapsing a
  ring and a stack into one ladder is the error `INTERACTION.md` §2 corrected once; giving them one
  type is what makes `esc` ambiguous (§7g, F1235).

## 9. Commitments

1. Every dimension is a whole number of cells at every pass, and `cells()` is the only width authority (I1).
2. Children declare and parents derive: a `FIT` container sums along its axis and maxes across it, and nothing is imposed downward until pass 2 (I2).
3. `GROW` and `PERCENT` contribute `min` to a `FIT` parent, defaulting to 0 (I3).
4. Distribution is largest remainder with ties by declaration order, and the leftover policy is declared per container — a group spends nothing, a mosaic tiles (I4, → C04 I42).
5. Clamping precedes distribution and reaches a fixed point in at most `n` rounds, counted (I5).
6. `min` is a hard floor; a container that cannot fit its minima clips rather than dropping a child (I6).
7. Padding is inside and `childGap` is between; a zero-width child keeps its gap; padding and gaps clamp together (I7).
8. Alignment acts on slack alone, centring rounds down, and a no-op alignment is counted (I8).
9. Stretch resolves where its cross axis is solved — pass 2 for width, pass 4 for height — and is cross-axis, `FIT`-only and silent against `GROW` (I9).
10. Aspect is pass 2 on width and pass 4 on height, shrinks only, and loses without slack (I10).
11. The passes run in order; one re-fit suffices and height never feeds back into width (I11).
12. `measure` stops after pass 4 and equals the composed row count, so C09 I1 holds by construction (I12, → C09 I1).
13. The tree and the width are the only inputs, the representation choice included (I13).
14. The degenerate sizes are answers: 0 measures 0, a zero child is kept, a one-row container drops its border (I14).
15. Overflow and clipping are per axis, a clipping container does not impose its size on the axis it clips, and a clip never changes a measured height (I15).
16. A contradictory declaration is refused at construction; the engine never throws (I16, → C09 I2).
17. The sizing model and the pass structure are ported from `nicbarker/clay` (Zlib); the module header carries the attribution and the version read, and taking it as a dependency is refused with a row in `DEPENDENCIES.md` (I17).
18. **The engine chooses a container's representation in pass 2** (I18, §7b): an ordered list of whole boxes, the first that fits and the last regardless, the id the box's and the content the form's — `width` excepted, because the parent distributed against it a call above — and a form's minimum measured rather than declared. The other two families keep their owners — the definition and `art()`.
19. **The engine places no layer of C15's stack** (I19, §7d). The named partition and the nudge are `place.ts`'s, the nudge there on one axis because the horizontal clamp is unreachable by construction; a derived peek anchor is the caller's, handed down as a number. Nothing else is refused: attachment, the ancestor clip and the two-axis nudge are §7f's, and the frame ring is §7g's (→ C15 I5, F1235).
20. **The engine holds no cache** (I20, §7e). The memo is C22's, keyed on the block object and the width, storing the committed figure rather than a natural size; the dirty rule holds by construction because blocks are frozen and replaced; and the single slot is a resize cost and a stable-width saving (→ C22 I100, → C09 I61).
21. **Sticky is one field read at one site** (I21, §7c). The composer excludes a sticky child from `clip.offset` and collects it **first**, because `composeRow` gives a column's cells to the piece that reaches it earliest; every sizing pass is blind to it, and §14's `GROW` refusal is corrected rather than built because the loop it names cannot be expressed (F1234).
22. **A float takes no space and is resolved after pass 5** (I22, §7f). It is skipped upward only, attached against the composited rect, sized by its own `FIT`, and nudged into the window it will be clipped to rather than into the frame — which is §10's step order corrected, because the other way round moves a tooltip to the one place it cannot be drawn. An unresolvable attachment omits the float and never throws, and neither does the `floating`-beside-`sticky` contradiction — it is refused at construction and is the worked example I16 had lost (F1235).
23. **A ring, a stack and a layer stack are three types** (I23, §7g). The frame ring cycles and has no top; the frame stack pushes and pops within a tab; each frame owns its own layer stack, named and never an integer; only one frame composites, so a switch is a full repaint; and `debug` is global and outside the ring. Collapsing a ring and a stack into one ladder is the error `INTERACTION.md` §2 corrected once (F1235).

---

## 10. Tests

Tier 1 in `test/unit/layout-engine.test.ts`, one row per invariant, plus the contract sweep in
`test/contract/layout.test.ts` where a kind moves onto the engine.

**The gate that catches a moved frame is the terminal baseline** — 2,440 frames, byte-exact, set
equality both ways — and the **unregenerable** oracle beneath it (1,916 captures, F1209). Expected
movers are named before a run and explained after it.

**The rows for §7b** (I18) — four, and the field set row survives the build inverted: it asserted the
**absence** of `representations` and now asserts its presence in the same way, by equality over `Box`'s
members, because a field added beside it is still the thing worth noticing.

- **T1.30** (I18, §7b): `Box`'s field set by **equality**, `representations` and `sticky` among them.
  An absence assertion was never structural and neither is a presence one; the equality is what
  catches a fifth field arriving. And the two owners the engine does **not** take answer through a
  call: `art()` picks a variant by measured width at the document layer, and `widthRung` computes one
  inside a definition.
- **T1.31** (I18, §7b, C09 I72): a form's minimum is **measured, never declared** — two forms of the
  same content whose widest rows differ by one cell select differently at that one width. Asserted of
  `art` at the document layer and of `representations` in the engine, because the rule is the same
  rule twice and a declared `min` would pass at either site alone.
- **T1.35** (I18, §7b): pass 2 takes the **first form whose natural width fits** and the **last
  regardless**, and the choice is made **before the children are distributed**. The ordering half is
  the load-bearing one: a chooser that ran after distribution would hand the slack of one form to the
  children of another, and every width in the subtree would be self-consistent and wrong.
- **T1.36** (I18, §7b): **the id is the box's and everything else is the form's** — a solved tree is
  addressable by the same name whichever form was taken, and the chosen form's direction, padding, gap
  and overflow are its own. Asserted by solving one box at two widths and reading both trees.
- **T6.6** (I18): removing the selection from pass 2 so the preferred form always stands → **T1.35
  fails** and nothing else does, because no kind declares `representations` yet. That is the reading
  the row carries rather than a defect in it: a mechanism landed as groundwork is invisible to every
  frame until its first consumer, which is why the rows are about the engine's own arithmetic.

**The rows for §7f** (I22) — every one a frame-read, because a float's resolution is invisible to the
solved tree it is placed beside.

- **T1.39** (I22, §7f): a float contributes **nothing upward** and is sized by its own subtree — the
  same tree with and without the field solves to identical rects for every non-float box, and the
  float's own rect is its `FIT` rather than the frame's width. The two halves are one row because the
  natural implementation reads the flag inside the sizing pass and skips both, giving every float a
  size of zero, which the first half alone cannot see.
- **T1.40** (I22, §7f, I15): attachment resolves against the **composited** rect. A float attached to
  row 9 of a list clipped at an offset of 3 lands on screen row 6, asserted at more than one offset —
  **offset zero is where the flow rect and the composited rect agree**, so a row written there tests
  nothing and reads as coverage.
- **T1.41** (I22, §7f): the nudge answers to the **clip window** and not to the frame. A float near
  the bottom edge of a clipping ancestor is nudged up into the ancestor rather than down into the
  frame's spare rows, and the row is the one that fails when §10's step 4 and step 5 are swapped back.
- **T1.43** (I22, §7f): the nudge is **both axes and ordered**, `x` then `y`, by the **minimum**
  shift — a float overflowing on one axis moves on that axis alone, and one overflowing on both lands
  at the window's origin. A shift larger than the minimum satisfies *it is inside the window* exactly
  as well, which is why the row asserts the position and not the containment (*containment is not
  correctness*).
- **T1.44** (I22, §7f): the three `attachTo` forms resolve to three different boxes in one tree —
  `parent` to the declaring box's container, `root` to the frame, `element` to a box in an unrelated
  subtree — asserted in **one** tree so that a form resolving to the same rect as another by accident
  is visible.
- **T1.45** (I23, §7g): a ring and a stack are different types, asserted by their **field sets by
  equality** — the ring has `next`/`previous` and no `push`/`pop`/`top`; the stack has `push`/`pop`
  and no cycle. The row is the type and not a behaviour, because collapsing the two is a design error
  that reads as correct at every call site (`INTERACTION.md` §2).
- **T1.46** (I23, §7g): each frame owns its own layer stack — a layer pushed in one frame is absent
  from another's, a switch pops and dismisses nothing, and `debug` is present in every frame's
  composite while `overlay` is present in one. Read as the composed product rather than as a count,
  because a stack that is shared and a stack that is copied agree on every length.
- **T1.42** (I22, I16, §7f): an unresolvable attachment **omits** the float and leaves the rest
  placed — an id in no box, a float naming a float not yet placed, and a float naming itself, each
  with a second float beside it that must still be in the product. The row is about what the
  rejection path leaves behind, which neither artefact shape indexes. **And nothing throws**,
  including a box declaring `floating` beside `sticky`: the engine is total and that refusal is
  C04's, which is I16 said about a contradiction that can be constructed for the first time.

**The rows for §7d** (I19) — a refusal again, and asserted the same way: by naming what would exist
if it were not taken.

- **T1.32** (I19, §7d, → C15 I5): `Placement`'s anchored arm declares no column field, asserted as the
  field set by **equality** (`kind`, `prefer`, `row`, `rows`), and the behaviour behind it through a
  call — `place()` gives an anchored layer `left: 0` whatever its width, and sets a `left` only for
  `centred`. The equality is the load-bearing half: a column added beside `row` would be **silently
  inert** for any layer that declares no width (walk A3), so no assertion about a placed result could
  see it and only the type can.
- **T1.33** (I19, §7d, → C15 I16): the nudge is the **vertical** axis's, and the horizontal bound is
  the width clamp. §10 states one rule for two axes and the tree has one axis of it: removing step 7's
  `left` clamp leaves C15's unit and contract suites green, because `resolveWidth` bounds the width and
  both placements then produce a column already inside the region. So the row asserts the property the
  clamp guards *and* the thing that delivers it, then the vertical shift and the flip above it —
  **written the other way round first, and the mutation is what said so**, which is the documented
  class arriving on a sentence a day old.
- **T6.7** (I19): making `place()` derive a `left` for an anchored layer → **T1.32 fails**, and
  nothing else does, because every layer that reaches `place` today is either full-region or centred.
  That is the reading the row carries: the refusal is invisible to every frame until something
  declares the field, so the row that catches it is about the type and the call, never about a
  rendering.

**The row for §7e** (I20) — one, because the invariant is about a mechanism that exists and the
claim is what it is keyed on:

- **T1.34** (I20, §7e, → C22 I100, → C09 I61): the engine's own sources declare no cache, read by
  **equality** over the directory rather than as an absence check; and the memo's shape is asserted
  through a call — one memo across asks at 80, 60 and 80 leaves the slot at each width in turn, so the
  third ask is a miss, and the stored `rows` is the **floored, capped** figure rather than the
  definition's natural answer. The width sequence is the load-bearing half: a map over widths and a
  single slot agree on every ask that does not revisit a width, which is every ask a static run makes.

**And `tools/bench/mosaic.mjs kinds` runs on anything touching piece ordering or the composer's
cursor**: it is the only instrument that saw F1213, where 440 goldens, 2,440 baseline frames and
6,265 test rows all agreed while a mosaic was missing two of five cells.

---

- **T1.37** (I21, §7c): a container clipping on `y` at an offset draws its sticky header **and** its
  scrolled body — the header at the container's own edge, the body from the offset — and the same
  tree with the field removed draws the body alone. **The row is the frame and not the rects**: a
  sticky child's `rect` is its flow rect either way, so every assertion about the solved tree agrees
  with itself whether or not the field is read (F1234).
- **T1.38** (I21, §7c): a sticky child declared **before** its scrolling siblings is drawn over by
  none of them — the ordering half, which no assertion about a position can see, since both children
  hold the positions flow gave them and only the order they reach the compositor differs. The row is
  the one that fails when the collection order is reversed, and reversing it is what the mutation
  pass does: at HEAD's first draft it produced a frame equal to the field being absent.
## 11. Owed — the sections that arrive with their phases

**Nothing is owed.** Every section of `LAYOUT_ENGINE.md` in the pass's scope is discharged.

**§12, §14 and §15 are discharged and no longer owed.** §12's three families are ruled in §7b and the
engine owns the third and it is built (I18); §14 is **built** and is I21 — one field, read where the offset is applied, with its
refusal clause corrected rather than built (§7c, F1234); §15's aspect is built and is I10 — pass 2 against a `FIXED` height, pass 4 against the
width, both by `Math.min` so neither grows. **§15's last paragraph is a constraint on the tests
rather than on the code**: it is lumpy — 40 × 9 at `aspect: 3.5` wants 31.5 columns and gets 31, a
real ratio of 3.44 — so no row may assert an exact ratio, and a row that does is asserting the
rounding. **§10 is discharged.** Its walk is `docs/notes/C29_LAYERS_WALK.md`, its rulings are §7d and I19, and
the two mechanisms it asks the engine to build are C15's already. **§13 is discharged.** Its walk is
`docs/notes/C29_INCREMENTAL_WALK.md`, its ruling is §7e and I20, and the cache it asks for is C22's,
keyed as it prescribes and measured holding across frames.

C15 stays the owner of every layer stack and `layout()` stays pure (C15 I5) — the engine is called by
`place()`, and it does not push, dismiss or decide what is on top.
