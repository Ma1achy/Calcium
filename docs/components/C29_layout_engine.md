# C29 — Layout engine

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L1 presentation |
| **Depends on** | `cells()` and the wrap functions (C09 `presentation/text`) · `divideShares` (C04) · nothing above L1 |
| **Consumed by** | C09's registry and container kinds · C11 · C15's `place()` · anything that needs a solved box |
| **Source** | `docs/design/layout/LAYOUT_ENGINE.md` §§1–22 · `docs/notes/C29_LAYOUT_WALK.md` · F1219, F1220 |
| **Status** | Draft — the sizing core. §§10–13 of the source arrive with their own phases. |

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
- **I16** — **A contradictory declaration is refused at construction, never at layout.** A `sticky`
  child that is `GROW` on the scroll axis would grow to fill the space it is excluded from; the
  refusal belongs at C04's boundary with every other construction error, because `measure` is pure
  and total and may not throw on any input (C09 I2). A throw mid-pass would abandon a half-solved
  tree and reach the frame as a fault rather than as a layout (§8a A10).
- **I17** — **The port is attributed in the module header with the version read, and the dependency
  is refused in writing.** Zlib's only real condition is the acknowledgement, and a licence nobody
  looked at is how one gets found at publication (`DEPENDENCIES.md`'s `elkjs` row is the precedent).
  The refusal is a row rather than a silence, because *we wrote our own* and *we considered theirs
  and measured why not* read identically from outside and only one of them survives being asked.

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

---

## 10. Tests

Tier 1 in `test/unit/layout-engine.test.ts`, one row per invariant, plus the contract sweep in
`test/contract/layout.test.ts` where a kind moves onto the engine.

**The gate that catches a moved frame is the terminal baseline** — 2,440 frames, byte-exact, set
equality both ways — and the **unregenerable** oracle beneath it (1,916 captures, F1209). Expected
movers are named before a run and explained after it.

**And `tools/bench/mosaic.mjs kinds` runs on anything touching piece ordering or the composer's
cursor**: it is the only instrument that saw F1213, where 440 goldens, 2,440 baseline frames and
6,265 test rows all agreed while a mosaic was missing two of five cells.

---

## 11. Owed — the sections that arrive with their phases

`LAYOUT_ENGINE.md` §10 (floats, layers and frames), §12 (responsive representations), §13
(incremental layout), §14 (sticky) and §15's declaration surface are in scope for the pass and not in
this document yet. **Each gets its own trace before it is built**: §10's events are attach, detach and
the nudge; §13's are dirty propagation and cache validity. Walking them now would be walking a design
the sizing core's rulings have not yet constrained.

C15 stays the owner of every layer stack and `layout()` stays pure (C15 I5) — the engine is called by
`place()`, and it does not push, dismiss or decide what is on top.
