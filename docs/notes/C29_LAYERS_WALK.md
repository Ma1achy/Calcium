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
| *a float that would land outside the frame is NUDGED, not clipped* | **Built, on both axes**, at `place.ts` step 7: shift first, clip only where the height cannot fit, `truncated` carried to the owner |
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
| A6 | the nudge × the fraction cap × the flip | §10: *shift along the axis that overflows until it fits* — one rule | C15: three clamps, ordered — the flip precedes the fit clamp, the height clamp precedes the top clamp (I6) | **One sentence, two axes, and they are not symmetric.** The vertical has a flip (`prefer`) and a fraction cap above the nudge; the horizontal has neither, so it is a single clamp. §10 reads as one rule and the tree needs the asymmetry stated, which `placeAnchored`'s comments already do and the design does not |
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
   today: the named partition (`sortLayers`) and the nudge (step 7, both axes).
2. **A derived anchor is the caller's**, resolved at L4 and handed to C15 as a number. That is what
   keeps `layout()` pure, and §10's step 2 describes work that already exists one layer up.
3. **The horizontal anchor is refused for want of a subject**, not for want of a mechanism — and
   A3 records that the mechanism would have been inert anyway without a width beside it.
4. **Frames are refused by their own section**, which named this outcome as the correct one.

Nothing here is owed to phase 4 as code. What was owed was the record.
