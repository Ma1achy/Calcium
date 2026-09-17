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

## 7b. Representations — and the engine owns none of the three families

`LAYOUT_ENGINE.md` §12 proposes `representations?: { min, box }[]` on a box, picked by the engine in
pass 2. **Measured against the tree, the intent has three families and this component owns none of
them** (F1228, `C04_REPRESENTATIONS_WALK.md` — see `docs/notes/C29_REPRESENTATIONS_WALK.md` A1–A3).

| family | the owner | built? |
|---|---|---|
| a **leaf** degrading — fewer features, a shorter label, a shed column | the **definition**, inside `render` | `status`'s `widthRung`, `plot`'s `layoutFor`, `table`'s admission loop, `image`'s fall to a status box. Four built; `comparison`, `keyValue`, `events` and `steps` owe one (C09 I81) |
| an **authored** alternative — a wordmark, a piece of art | the **document layer**, `art()` | built, with a consumer across the seam: the docker banner's `wordmarkFor` |
| a **container** choosing a different subtree | nobody, and there is no subject | `sidebar` and `tabBar` are in no file in `src/`; the two row groups that exist — the chrome's clusters and the banner — each already carry a width ladder of their own |

**A `paint` leaf is opaque to the engine by its own declaration** — `Leaf`'s doc comment reads *the
engine never looks inside one* — so pass 2 cannot see a leaf's forms however they are declared. That
is not an omission to be repaired: it is what makes `measure` a number the engine can distribute
without knowing what draws it, and it is why all four built ladders are computations inside
definitions rather than lists outside them.

**And an authored alternative is a different block, not a different box.** The engine takes a `Box`
tree built *from* blocks; choosing a variant inside pass 2 would mean rebuilding a subtree mid-solve,
which is the search §12's own last paragraph forbids.

**One thing §12's spelling gets worse than the built mechanism**, and it is worth stating because the
field would have shipped with it: a declared `min: number` beside a form is a **second record of one
number**, and it disagrees with the form the first time the form is edited. `art` tests
`widthOf(declared) <= width` — the form's own measured width, through the one width authority (C09
I72). A hand-written minimum is the drift C09 I1 exists to prevent, declared voluntarily.

## 7c. Sticky — refused, and its intent is discharged twice

`sticky?: "top" | "bottom"`, with *`childOffset` applied to every child except the sticky ones*,
needs a container holding a scroll offset **and** a header that is a sibling of the body. Neither
place that wants the effect has that shape:

- **C25 I18** — a window of a patch is a `Patch` rebuilt from a slice of its lines, and the path and
  hunk headers travel with it because no field suppresses them, *forced by the block shape rather
  than chosen*. A window's content budget is smaller by exactly their rows.
- **`documents.ts`** — a tool call's result notice is a sibling pushed **before** the `scroll`, not a
  child inside it. It does not scroll because it is not in the scrolling container.

So the field would be an export nothing consumes, and its own refusal clause — *a sticky child cannot
be `GROW` on the scroll axis* — would be a validation path nothing reaches. **Refused here rather
than left owed**, so the next reader finds the answer and not the gap; I16's example is corrected off
it for the same reason.

## 7d. Layers — the engine places none, and the two mechanisms are C15's

`LAYOUT_ENGINE.md` §10 asks the engine for floats declared in the tree, `attachTo` by element id,
anchor points, a nudge, `clipTo: "attachedAncestor"`, a named four-position stack and a frame ring.
**Two of those are built, one is built a layer above where the design puts it, and three have no
subject** (F1230, `docs/notes/C29_LAYERS_WALK.md`).

**Built, in `place.ts`.** `sortLayers` partitions by `kind` — `view`, then `peek`, then `overlay`,
stable within each — and no integer exists anywhere in C15, so §10's *refused: a free integer
z-index* holds by construction rather than being owed. The nudge is step 7 on **both** axes: shift
along the axis that overflows, clip only where the height cannot fit, and carry `truncated` to the
owner. §10's four positions are not the tree's three, and the difference is the measurement — `base`
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
  child that is `GROW` on the scroll axis, and `sticky` is refused** (§7c): an invariant whose
  worked example cannot be constructed forbids nothing while reading as though it forbade something,
  which is A03 §2's vacuity class arriving in a justification rather than in a rule (F1229).
- **I17** — **The port is attributed in the module header with the version read, and the dependency
  is refused in writing.** Zlib's only real condition is the acknowledgement, and a licence nobody
  looked at is how one gets found at publication (`DEPENDENCIES.md`'s `elkjs` row is the precedent).
  The refusal is a row rather than a silence, because *we wrote our own* and *we considered theirs
  and measured why not* read identically from outside and only one of them survives being asked.
- **I18** — **The engine chooses no representation, and the three families that want one each have
  an owner elsewhere.** A leaf's forms are computed inside its definition, because `Leaf` is opaque
  to the engine by declaration; an authored alternative is chosen by `art()` at the document layer,
  because a variant is a different *block*; and a container choosing a subtree has no subject in the
  tree. A form's minimum is **measured from the form** through `cells()` and never declared beside
  it — a hand-written `min` is a second record of one number that disagrees the first time the form
  is edited (C09 I72). `sticky` is refused with it (§7b, §7c, F1228). **Dropping is refused twice
  over and from two components**: the sizing core replaced C09 I35's clamp with a floor, and a form
  that dropped a child would leave a C26 focus on a block that draws nothing.
- **I19** — **The engine places no layer, and the two mechanisms §10 asks it for are C15's.** The
  named partition and the nudge are `place.ts`'s today; a derived anchor is resolved by the caller and
  handed down as a number, which is what keeps `layout()` a pure function of the stack and the region
  (→ C15 I5). A float attached by element id, an ancestor clip and a frame ring are refused: the
  first two read state that is neither input, and all three have no subject — the one element-attached
  layer in the tree spans its block's whole width, so there is no *beside* to anchor to (§7d, F1230).

---

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
18. **The engine chooses no representation** (I18, §7b, §7c). Three families want one and each has an owner elsewhere — the definition, `art()`, or nobody; `sticky` is refused, and a form's minimum is measured rather than declared.
19. **The engine places no layer** (I19, §7d). The named partition and the nudge are C15's; a derived anchor is the caller's, handed down as a number; and attachment by element id, an ancestor clip and a frame ring are refused for want of an input and of a subject alike (→ C15 I5).

---

## 10. Tests

Tier 1 in `test/unit/layout-engine.test.ts`, one row per invariant, plus the contract sweep in
`test/contract/layout.test.ts` where a kind moves onto the engine.

**The gate that catches a moved frame is the terminal baseline** — 2,440 frames, byte-exact, set
equality both ways — and the **unregenerable** oracle beneath it (1,916 captures, F1209). Expected
movers are named before a run and explained after it.

**The rows for §7b and §7c** (I18) — three, because the invariant is a refusal and a refusal is
asserted by naming what would exist if it were not taken:

- **T1.30** (I18, §7b): `Box` declares no `representations` and no `sticky`, asserted as the field
  set by **equality** rather than by two absence checks — an absence assertion is not structural, and
  a field added beside them is the thing this row exists to notice. And the two owners that do exist
  answer: `art()` picks a variant by measured width at the document layer, and `widthRung` computes
  one inside a definition, both asserted through a call rather than through a grep.
- **T1.31** (I18, §7b, C09 I72): a variant's minimum is **measured, never declared** — two forms of
  the same content whose widest rows differ by one cell select differently at that one width, and
  `art` is asked at both. The row that a declared `min` would pass is the one where the form is
  edited and the number is not, so the assertion is on `cells()` of the chosen form and not on a
  constant.
- **T6.6** (I18): giving `Box` a `representations` field that pass 2 consults → T1.30 fails on the
  field set, and **nothing else in the suite moves**, which is the reading: an engine-level chooser
  is invisible to every frame until a kind declares one, so the row that catches it has to be about
  the type rather than about a rendering.

**The rows for §7d** (I19) — a refusal again, and asserted the same way: by naming what would exist
if it were not taken.

- **T1.32** (I19, §7d, → C15 I5): `Placement`'s anchored arm declares no column field, asserted as the
  field set by **equality** (`kind`, `prefer`, `row`, `rows`), and the behaviour behind it through a
  call — `place()` gives an anchored layer `left: 0` whatever its width, and sets a `left` only for
  `centred`. The equality is the load-bearing half: a column added beside `row` would be **silently
  inert** for any layer that declares no width (walk A3), so no assertion about a placed result could
  see it and only the type can.
- **T1.33** (I19, §7d): the nudge is C15's on **both** axes — a layer wider than the region and one
  anchored outside it both come back shifted inside rather than cut, and `truncated` is set only where
  the height could not fit. The row exists because §10 states one rule for two axes that are not
  symmetric: the vertical carries a flip and a fraction cap above the nudge and the horizontal is a
  single clamp.
- **T6.7** (I19): making `place()` derive a `left` for an anchored layer → **T1.32 fails**, and
  nothing else does, because every layer that reaches `place` today is either full-region or centred.
  That is the reading the row carries: the refusal is invisible to every frame until something
  declares the field, so the row that catches it is about the type and the call, never about a
  rendering.

**And `tools/bench/mosaic.mjs kinds` runs on anything touching piece ordering or the composer's
cursor**: it is the only instrument that saw F1213, where 440 goldens, 2,440 baseline frames and
6,265 test rows all agreed while a mosaic was missing two of five cells.

---

## 11. Owed — the sections that arrive with their phases

`LAYOUT_ENGINE.md` §13 (incremental layout) is in scope for the pass and not in this document yet.

**§12, §14 and §15 are discharged and no longer owed.** §12's three families are ruled in §7b and the
engine owns none of them (I18); §14 is refused in §7c with its intent discharged by C25 I18 and by
composition; §15's aspect is built and is I10 — pass 2 against a `FIXED` height, pass 4 against the
width, both by `Math.min` so neither grows. **§15's last paragraph is a constraint on the tests
rather than on the code**: it is lumpy — 40 × 9 at `aspect: 3.5` wants 31.5 columns and gets 31, a
real ratio of 3.44 — so no row may assert an exact ratio, and a row that does is asserting the
rounding. **§10 is discharged and no longer owed.** Its walk is `docs/notes/C29_LAYERS_WALK.md`, its rulings
are §7d and I19, and the two mechanisms it asks the engine to build are C15's already. **§13 gets its
own trace before it is built**, over dirty propagation and cache validity.

C15 stays the owner of every layer stack and `layout()` stays pure (C15 I5) — the engine is called by
`place()`, and it does not push, dismiss or decide what is on top.
