# C29 §10 — the walk

Phase 4 of the layout-engine plan, walked by hand before anything is built. **Both artefacts**: a
classification table over the cells where two rules hold at rest — a named position against a sorted
partition, a column anchor against a resolved width, an ancestor clip against a pure `layout()` —
and a sequence trace over the events that move a *derived* anchor, which is the only state §10 adds.

**Indexed by rule interaction, not by input coverage.** A row governed by one rule is a restatement
of that rule.

---

## §0 · The premises, measured (F1230)

| the design says | the tree says |
|---|---|
| *the layout engine does not know about layering; no layer's position can be derived from a box in the layer beneath it* | **False on the vertical axis, and where it is false it is built at L4.** `construct.ts:1801` resolves the peek's anchor — `chromeRowsOf(entry, width) + element.rows.from - ve.skipRows` — and hands C15 a number. `layout()` is pure because the **caller** resolved, not because resolution does not happen |
| `layer: "float" \| "overlay" \| "debug"` — **NAMED, never an integer** | **Built, with three names that are not these.** `sortLayers` partitions by `kind`: `view`, `peek`, `overlay`, stable within each, and no integer exists in `place.ts` or `overlay/types.ts`. `base` is not a layer; `float` has no member; **`debug` has no member either** — the profiler's overlay is `kind: "view"` (`profile-view.ts:275`), which sorts *bottom*-most |
| *a float that would land outside the frame is NUDGED, not clipped* | **Built on one axis**, at `place.ts` step 7: shift first, clip only where the height cannot fit, `truncated` carried to the owner. **The `left` clamp beside it is unreachable** — removing it leaves C15's unit and contract suites green, and by construction: `resolveWidth` bounds the width, an anchored layer takes `left = 0`, a centred one a column already inside the region. A guard, not a mechanism (landing, T1.33) |
| `attachTo: { kind: "element"; id }` — *any box, anywhere in the tree* | **Refused for the reason `placement.row` is a number.** The resolution needs the solved tree *and* the viewport's scroll offset; putting it inside `layout(stack, region)` makes a pure function depend on the scroll position (C15 I5) |
| *a tooltip, a hover card, an inline completion beside a token, a callout on a plot* | **No subject on the horizontal axis.** A float attaching to an element is the peek; a peek exists only where a `NavElement` declares `detail`; `detail` is emitted at **exactly one site** — `table/definition.ts:475`, whose span is `cols: {from: 0, to: w}`, the table's whole width. There is no *beside* |
| `clipTo: "attachedAncestor"`, default | **The same refusal.** The ancestor is a box in the solved tree; C15 holds `Block[]` and a region. And its subject would be a peek narrower than its block, which the corpus of one does not contain |
| *FRAME RING · FRAME STACK · LAYERS · DEBUG* | **No ring.** `frameRing` is in no file. The four `kind: "view"` producers — `patch-view`, `surface`, `document-view`, `profile-view` — are each one layer over one base, which **is** the frame stack with one member. §10 pre-authorises this: *which is the correct outcome, not a wasted mechanism* |

---

## Artefact A — the classification table: two rules holding at rest

| # | the cell | rule A | rule B | ruling |
|---|---|---|---|---|
| A1 | a fourth position `float` × `sortLayers`' partition | §10: four named positions, and within a position the stack order decides | C15 I2/I23: `view`, then `peek`, then `overlay`, stable within each | **No fourth name.** A position with no member is a name that forbids nothing and orders nothing — *an invariant is vacuous until its subject exists*, one level in, applied to a **name**. The refusal §10 wants (no integer z-index) is already absolute: there is no integer to pick |
| A2 | a column anchor × `menuLayer`'s deliberate full width | §10: an inline completion sits *beside* the token | C19: the menu declares **no** `width` because *a menu narrower than the region leaves whatever is behind it visible on the same rows, so a reader sees two unrelated things on one row* | **A recorded reversal already answers §10's own example.** The completion menu is the design's second motivating case and it has been ruled the other way, in the file, with its reason. A column anchor could never be a default; it would have to be opted into by the layer that wants it, and none does |
| A3 | a column anchor × `resolveWidth` | §10: line up `self` and `target` points, then offset in whole cells | C15 I16: `layer.width ?? region.width`, clamped to the region | **The two are one declaration, and this is the defect that would have shipped.** A layer declaring a column and no width is full-region, so the column resolves to a `left` the clamp immediately returns to zero: the field would be **silently inert** for every layer that did not also declare a width. A horizontal anchor without a width is refused, not defaulted |
| A4 | `attachTo: {kind:"element"; id}` × `layout(stack, region)` | §10 step 2: *resolve `attachTo` to a SOLVED box from pass 5* | C15 I5: same stack and region, same result — a property of the signature | **Refused.** The resolution reads `ve.skipRows`, the viewport's scroll offset, which is neither the stack nor the region. Moving it inside makes `layout()` a function of state it cannot see, and the *property of the signature* becomes a promise about the code — which is the sentence `place.ts`'s own header was written to avoid |
| A5 | `floating` on `Box` × *floats are skipped in every sizing pass* | §10: declared in the tree so it has a parent to attach to, contributing nothing to `FIT` | C15 + C09: `place()` measures a layer's content with `registry.measureSequence(layer.content, width)` | **Two owners of one height.** A float declared in the block tree is skipped by the engine and measured by `place`, so the same content has a size computed in two components under two width rules. The plan's *C15 stays the owner* and §10's *declared in the tree* cannot both hold; the plan's is the one with the running code |
| A6 | the nudge × the fraction cap × the flip | §10: *shift along the axis that overflows until it fits* — one rule | C15: three clamps, ordered — the flip precedes the fit clamp, the height clamp precedes the top clamp (I6) | **One sentence, two axes, and they are not symmetric — and the walk understated it.** The vertical has a flip (`prefer`) and a fraction cap above the nudge; the horizontal has neither. The landing's mutation pass took it further: the horizontal clamp is **unreachable**, so the tree has one axis of nudge and a guard. §10 reads as one rule; the asymmetry `placeAnchored`'s comments state is the smaller half of it |
| A7 | `clipTo: "attachedAncestor"` × the region clip | §10: a tooltip on a row inside a `scroll` must be clipped by the scroll block | C15: every layer is already clamped into the region | **No subject, and it is the same subject as A3.** An ancestor clip is strictly narrower than the region clip, so it can only matter for a layer narrower than the region — and the one element-attached layer spans the width. Refused with the anchor that would create its subject |
| A8 | `debug`, *above every frame* × the profiler's layer | §10: the profiler's overlays are global and above everything | C28 §3c: the profiler's view is `kind: "view"` | **The tree's surface is not the design's.** A view fills the region and sorts bottom-most, so the profiler's overlay is *under* every overlay and over nothing — correct for what it is (a full view of a report), and evidence that `debug` describes an annotation layer the profiler does not have. The name has no member, like `float` |
| A9 | the frame ring × `INTERACTION.md` §14 | §10: tabs are parallel, a ring, and must not share a ladder with a stack | §14: *there are no pushed views*, and each one's replacement is named | **No subject, and §10 says so itself.** *If nothing else ever passes, the frame stack has exactly one member per tab and costs nothing.* The four view producers are that outcome. The ring's own precondition — more than one tab — is C16's and not the engine's |

---

## Artefact B — the sequence trace: what moves a derived anchor

The peek is the only layer whose position is derived from a box, so it is the only state §10 adds
and the only place an event-mediated interaction can live.

| # | the sequence | what happens | ruling |
|---|---|---|---|
| S1 | a key moves focus within an entry already on screen | `deliver` runs every event, then `syncPeek()`, then commits the frame. C14 emits nothing — the viewport did not change | **The key path is load-bearing on its own.** A peek maintained only by the viewport's subscription would follow `tab` one frame late, or not at all |
| S2 | the far side patches an entry above the focused one | C14 emits; no key was pressed. `stores.viewport.subscribe(() => syncPeek())` fires | **The subscription is load-bearing on its own**, for the case S1 cannot reach. **Two mechanisms, each blind to the other's case, and neither is redundant** — which is the row that would have been cut as duplication by a reader checking either one alone |
| S3 | focus moves to a row whose `detail` is byte-identical | `want.key` embeds `JSON.stringify(detail)` and the row is compared separately: `have && want.key === peekKey && want.row === peekRow` | Correct. A key alone would hold the peek at the old row for an identical detail — the conjunction is what makes the anchor, not the content, the thing being tracked |
| S4 | the focused element scrolls out of the visible window | `peekWanted` returns `null` when `within < 0 \|\| within >= ve.takeRows`, and `syncPeek` dismisses | Correct, and it is the reason the anchor is recomputed rather than clamped: a clamp would leave the peek pointing at a row that is no longer its element's |
| S5 | the terminal shrinks until the anchor row is outside the region | `anchorRoom` floors both sides at zero and `placeAnchored` returns a one-row floor rather than omitting (C15 I17, T3.8); the resize also emits, so `syncPeek` recomputes or dismisses | **Two mechanisms agree**, and the floor is what keeps the frame honest in the window between them |
| S6 | a confirm opens over the peek | `sortLayers` puts overlays above peeks; nothing is dismissed and the confirm draws over it (§2a) | **This is A2's ruling arriving as an event, and it is the argument against the column anchor stated twice.** A peek narrow enough to sit *beside* its row would leave that row visible under a full-width confirm — two unrelated things on one row, which is the exact reversal `menuLayer` recorded. The refusal and the recorded reversal are one ruling |

---

## What the walk rules

1. **The engine places no layer**, and the two mechanisms §10 asks it to build are in `place.ts`
   today: the named partition (`sortLayers`) and the nudge (step 7, one axis — the horizontal clamp
   beside it is unreachable, which the landing's mutation pass measured and this walk did not).
2. **A derived anchor is the caller's**, resolved at L4 and handed to C15 as a number. That is what
   keeps `layout()` pure, and §10's step 2 describes work that already exists one layer up.
3. **The horizontal anchor is refused for want of a subject**, not for want of a mechanism — and
   A3 records that the mechanism would have been inert anyway without a width beside it.
4. **Frames are refused by their own section**, which named this outcome as the correct one.

Nothing here is owed to phase 4 as code. What was owed was the record.

---

# The second walk — §10 as the engine's, not as C15's

The walk above is kept whole and it is not retracted: every measurement in it holds. What it
measured is **C15's layer stack**, and §10 asks for two different things under one heading.

**The conflation, and it is the finding this walk exists to correct.** §10 step 2 reads *resolve
`attachTo` to a SOLVED box from **pass 5***. Pass 5 is the **engine's** — it is the positioning pass
this component owns and had already built when the first walk ran. A4 refused attachment because
*the resolution reads `ve.skipRows`, the viewport's scroll offset, which is neither the stack nor the
region* — true of **C15's** `layout(stack, region)`, and about a different function. Inside
`layout(box, width)` the resolution reads the solved tree the call just produced and nothing else, so
it is pure by construction rather than by restraint. **A refusal that names a purity property checks
which signature holds it.**

The same correction runs through A1, A7, A8 and A9, which refuse for want of a *member* — a name with
no layer, an ancestor clip with no narrow layer, a ring with one tab. That is *no consumer exists*,
and this repository has ruled on it: **infrastructure has no consumers by definition**. The rule's
honest form is *nothing consumes it **and** nothing is queued to consume it*, and a float declared in
the tree is queued by §10's four named cases — a tooltip, a hover card, an inline completion, a
callout on a plot — none of which can be written while the mechanism is absent.

**A2, A3 and A6 survive, and they change the design rather than refusing it.** A3 is the sharpest: a
horizontal anchor with no width is silently inert, because the width clamp returns the resolved
column to zero. In the engine the equivalent is a float whose own sizing is unconstrained — so a
float is solved against the **frame**, and a float that fills the frame has no anchor worth
resolving. The engine's answer is that a float's width is its own `FIT`, never the frame's, which is
what makes a column mean something.

---

## Artefact C — the classification table, over the mechanism

Rows where two of the engine's own rules hold at rest. A row governed by one rule is a restatement.

| # | the cell | rule A | rule B | ruling |
|---|---|---|---|---|
| C1 | the nudge × `clipTo: "attachedAncestor"` | §10 step 4: nudge inside the **frame** | §10 step 5: intersect with the **attached ancestor's** clip | **Two windows, and the order §10 gives makes the mechanism fail its own motivating case.** Nudged into the frame and then clipped to a scroll block, a tooltip near the block's bottom edge is nudged to a row the frame allows and the ancestor does not, and is clipped to nothing — having been moved *to* the place it cannot be drawn. The nudge must target the window the float will be clipped to: **clip first, nudge second**, with the frame as the window only when `clipTo` is `"none"`. §10's step order is wrong and the steps are otherwise right |
| C2 | `attachTo: {kind:"element"}` × a clipping ancestor with an offset | §10: any box, anywhere in the tree | C29 I15: a clipping container places its child at a negative offset | **The attach rect is the composited position, not the flow position.** A tooltip on row 9 of a list scrolled to row 3 belongs at screen row 6. Resolving against `SolvedBox.rect` alone gives row 9 and the tooltip detaches from the thing it points at — the defect is invisible at `offset 0`, which is every fixture written without thinking about it |
| C3 | `floating` × `sticky` on one box | I21: excluded from the offset, **occupies flow space** | §10: takes **no** space, skipped by every sizing pass | **They are opposites and must not compose.** Both read as *this child is not laid out normally*, and a box declaring both is asking for a child that occupies flow space and does not. Refused at the type rather than resolved: `floating` is checked first and a `sticky` beside it is a contradiction the engine states |
| C4 | a float's own children × the float being skipped | §10: floats contribute nothing to `FIT` and displace no sibling | C29 I2: a container's `FIT` is the sum of its children | **The skip is at the parent's walk, not at the float's own.** A float is solved by the same four passes against its own subtree, so its children size it normally; what is skipped is its contribution *upward*. Stated because the natural implementation — a flag read inside the sizing pass — skips both and gives every float a zero size |
| C5 | `attachTo: {kind:"element"; id}` × id resolution | §10: any box anywhere | C29: `Box.id` is a string with no uniqueness rule anywhere in the tree | **First match in document order, and it is a choice rather than a fallback.** The alternative — throw on a duplicate — makes a float's validity depend on a box two subtrees away that it does not name, and **a throw mid-resolution abandons the floats already placed**. An unresolvable id is the float omitted, not the layout refused: C15 already omits a zero-row layer without dismissing it, and this is that rule one layer down |
| C6 | a float attached to a float | §10: any box anywhere in the tree | the float's own rect is not known until it is placed | **Resolution is ordered, and a cycle is omitted.** Floats resolve in document order against boxes already placed; a float naming a float placed after it, or naming itself through a chain, has no rect to attach to and is omitted by C5's rule. No cycle detection beyond *not yet placed*, because that is the same condition |
| C7 | the layer name × declaration order across subtrees | §10: four named positions, within a position the stack order decides | the tree has no stack — it has two subtrees | **Document order is the stack order**, which is the only total order the tree supplies, and it is stable because the walk is. Named here because *stack order* is C15's word for a list and the engine has a tree; two floats in one layer declared in unrelated subtrees are ordered by the walk that found them and by nothing about their position |
| C8 | `offset` × the nudge | §10: offset in whole cells, **applied last** | §10: nudge until it fits | **The offset is applied before the nudge, and §10's *last* is about the anchor.** Applied after the nudge it re-pushes the float back outside the window the nudge just fitted it into — the nudge is the last operation on the position by definition, because it is the one that answers to the window |
| C9 | a float wider than its window | §10: nudge, and *only clip if it cannot fit at all* | I1: every dimension is a whole number of cells | **Nudge to the window's origin and clip.** The clip is the intersection and produces a whole-cell rect either way; what must not happen is a negative width, which is what `origin + width > window` produces when the shift is computed without a floor at zero |
| C10 | a zero-row float × the layer being named | §10: *a zero-row float is omitted and not dismissed* | C7: order is document order | **Omitted from the product entirely**, and the ordering is unaffected because it is computed over what the walk found rather than over indices |

## What the second walk rules

1. **§10's own step order is wrong at step 4/5** (C1) — the nudge must target the clip window, not
   the frame, or the mechanism defeats its motivating case.
2. **The attach rect is the composited rect** (C2), which no fixture at offset zero can see.
3. **`floating` and `sticky` are opposites** (C3) and the engine says so rather than resolving it.
4. **An unresolvable attachment omits the float** (C5, C6) — it never throws, because a throw
   mid-walk abandons the floats already placed.
5. **A float is solved by the same four passes**; what is skipped is its contribution upward (C4).
