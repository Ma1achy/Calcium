# C15 — Overlay manager

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L2 viewport |
| **Depends on** | C04 (`Block`) · C09 (`measure` via the registry). **Not C14** — the region is passed to `layout()`, so C15 imports nothing from it |
| **Consumed by** | C16 (input priority) · C19 completion · C20 reverse search · L4 (confirms, pushed views) |
| **Source** | A01 D3, D4, D7 · A02 §2 |
| **Status** | Draft |

---

## 1. Purpose

Some things sit above the transcript: a completion menu, reverse-i-search, a confirm, the `?` help, and the two pushed views — dashboard and logs (A01 D4). None of them belongs in the scrollback. They are transient, positional, and they take input priority while present.

C15 owns the stack of those layers: what is on top, where each one sits, how big it is, and what `Esc` closes. It does not route keys — that is C16, which reads the top of this stack to decide priority.

The unifying decision: **overlays and pushed views are the same mechanism with different placement.** Both are content above the transcript with input priority; one is positioned and content-sized, the other fills the viewport region. Treating them separately would mean two `Esc` implementations, two focus rules, and a question nobody wants to answer about what happens when a confirm appears inside the dashboard.

---

## 2. Layers

```typescript
type Placement =
  | Readonly<{ kind: "anchored"; row: number; rows?: number;   // the anchor's own extent, default 1
               prefer: "above" | "below" }>
  | Readonly<{ kind: "centred" }>
  | Readonly<{ kind: "fill" }>;                  // views only

type Layer = Readonly<{
  id:          string;
  kind:        "overlay" | "view";
  placement:   Placement;
  content:     readonly Block[];
  dismissable: boolean;                          // false = must be resolved, not escaped
  width?:      number;                            // cells; absent means the region's width
  maxHeightFraction?: number;                     // overlays; default 0.5
}>;

type Placed = Readonly<{
  layer:  Layer;
  top:    number;                                // absolute row within the viewport region
  left:   number;                                // absolute column within it
  height: number;
  width:  number;
  truncated: boolean;
  /** Where this layer wants the terminal cursor, relative to its own origin (I19). */
  cursor?: Readonly<{ row: number; col: number }>;
}>;

type DismissReason = "explicit" | "anchorEvicted";

/** What `update` may change — deliberately not `dismissable`. See below. */
type LayerUpdate = Partial<Pick<Layer, "content" | "placement" | "width">>;

type OverlayChange =
  | Readonly<{ kind: "push";    id: string; layerKind: "overlay" | "view" }>
  | Readonly<{ kind: "pop";     id: string; layerKind: "overlay" | "view" }>
  | Readonly<{ kind: "content"; id: string }>
  | Readonly<{ kind: "dismiss"; id: string; reason: DismissReason }>;

interface OverlayManager {
  push(layer: Layer): Disposable;
  pop(): Layer | null;                           // the top layer, if it is dismissable
  dismiss(id: string, reason?: DismissReason): void;   // default "explicit"
  update(id: string, next: LayerUpdate): boolean;
  layout(region: Readonly<{ width: number; height: number }>): readonly Placed[];
  subscribe(cb: (change: OverlayChange) => void): Disposable;

  readonly stack:  readonly Layer[];             // bottom-first
  readonly top:    Layer | null;
  readonly hasView: boolean;
}
```

### A layer changes without leaving the stack

`update` exists because every consumer needs it and none of them is opening a new layer when it does. C19's menu narrows on each keystroke and re-highlights on each arrow; S12's logs view scrolls its own buffer; C25 §3b's fullscreen patch pages, and binds `n` and `p`. All three change what is drawn while the layer stays exactly where it is.

The two alternatives were considered and are worse in ways that are not obvious.

- **Content as a thunk** — `() => Block[]`, evaluated inside `layout()`. It needs no new method, and it makes `layout()`'s output depend on the owner's private state rather than on the stack. T2.1 stops being assertable and I5's purity becomes a claim about C15's code rather than about its output, which is the difference between an invariant and a convention.
- **Dismiss and re-push** — no interface change, one pop and one push per keystroke. C16 derives focus on every dispatch (C16 I1), so focus churns inside the thing being typed into, and the layer loses its position under anything stacked above it.

`update` keeps `layout()` a pure function of the stack. The stack is what changed.

**It cannot change `dismissable`, and that is deliberate rather than an oversight in the `Pick`.** A layer that becomes escapable partway through its life makes C16's Ctrl-C ladder depend on *when* it looked: the same confirm answers "may I be dismissed?" differently on two consecutive keystrokes, and the branch that is right is unknowable from either side. A layer that needs to change what `Esc` means to it is two layers.

### Width is the owner's, because measurement cannot supply one

`BlockRegistry` answers one question — `measure(block, width) → rows`. There is no query for the width a block would *like*, and adding one means every registered kind implementing it.

So `Layer.width` is declared, in cells, and absent means the region's. `Placed.left` follows from it: `0` for `anchored` and `fill`, and `floor((region.width − width) / 2)` for `centred`. Without a declared width every overlay is region-width, `left` is permanently zero, and `centred` is vertical-only in a section that promises both axes.

This is I8's argument one field over. C19 knows its longest candidate and a confirm knows its text; C15 knows neither, and a component that guesses a width here would be inventing the same information I8 forbids it inventing about the remainder.

### The dismissal reason is recorded, not detected

`anchorEvicted` is supplied by whoever raised the layer. C15 subscribes to nothing, holds no entry ids, and imports nothing from C13 (I9, I12) — so it cannot notice an eviction, and the requirement was never that it should. What L4 needs is to tell a user's cancellation from a referent that no longer exists, and that is a field on the change rather than a duty on the manager.

C19 knows which row its menu is anchored to and is already subscribed to what moves it. The same call is what moves an anchored layer when the viewport scrolls: `update(id, { placement })`, one seam for both.

**Content is `Block[]`, not React.** Every overlay and every pushed view renders through the same block library as the transcript — so a completion menu is themed, degrades to ASCII, and is measurable by the same code. The dashboard's five panels are a `group` of `panel`s. React appears only in the positioning shell, never in the content.

That is the payoff of the block vocabulary being a vocabulary rather than a rendering of one particular thing, and it is worth defending: a component that reaches for raw React to draw an overlay has stepped outside theming and measurement at once.

---

## 3. Stack rules

**Overlays always sit above views.** A confirm raised from inside the dashboard appears over it, which is why A02's focus priority lists `overlay` above `pushedView`.

**I2 holds by construction through `push`, and is enforced anyway.** A view is only ever pushed onto an empty stack — every other cell of §6's `push(view)` column is a rejection — so overlays always follow it in push order and a naive implementation sorting by push order alone satisfies I2 without ever knowing it. That makes the invariant true and its fail-on-revert test unfalsifiable, which is A03's vacuity class arriving in a spec rather than in a rule. The sort is therefore real code in `layout()`, and T6.2 constructs a mis-ordered stack directly rather than reaching it through `push`, which is possible because placement is a pure function of a stack it is handed.

**At most one view.** Views do not nest in v1. Pushing a second is rejected as an orchestration bug — the drill-in path from the dashboard opens a live block in the transcript, not another view (A01 D7), so nesting is never needed.

**Overlays nest freely.** Reverse-i-search over a completion menu is legitimate.

`pop()` inspects **only the top layer**. If it is dismissable it is removed; if it is not, nothing happens and `null` comes back. It does not search downwards for the first dismissable layer, and the difference is not academic: under a confirm raised over a completion menu, the searching version pops the menu — answering nothing, closing something the user was not looking at, and leaving the confirm sitting over a changed screen. That is T6.4's failure reached by a reading of the word "topmost" rather than by a bug.

A non-dismissable layer — a confirm awaiting y/N — must be resolved by `dismiss(id)` from whatever raised it. `Esc` on it is a no-op rather than a silent cancellation, because a confirm that can be dismissed by an unrelated keypress is not a confirm.

**`pop()` returning `null` covers two cases, and its caller has to tell them apart.** C16's Ctrl-C ladder is the consumer: it dismisses a dismissable overlay, no-ops on a non-dismissable one, and *falls through to the next rung* when there is no layer at all (C16 §5, I8). Those are three outcomes and `pop()` reports two, so the ladder reads `top` before calling — `top === null` is the fall-through, `top.dismissable === false` is the no-op. Said here because the obvious code branches on the return value, and the obvious code sends Ctrl-C nowhere while a confirm is open.

Popping emits a change. **C15 does not write to the transcript**, and after A01 D7's amendment nothing else does on a pop either — a trace entry would freeze the block the pop returns to and clear the selection D7 preserves. The invariant is unchanged and its justification is now simpler: an overlay manager that could append would need to understand what a dashboard is, and keeping C15 out of C13 is what stops L2 depending on the transcript's contents (I9, MG13).

---

## 4. Placement

Views fill the viewport region entirely: `top = 0`, `left = 0`, full height and width. Nothing to decide.

### Drawing a layer is L4's, and nothing did it

`layout(region)` returns `Placed` boxes and **no component draws them.** L4's paint composites header, transcript, prompt and footer, and calls `layout()` in exactly two places — C16's hit-testing, and the completion menu's own remainder count. So this component has never put a glyph on a screen: the completion menu, reverse search and the exit confirm are all invisible, and `raiseExitConfirm` stopping the session directly was a symptom of that rather than a simplification, because there was nowhere for a confirm to appear.

**S01 §3's arithmetic is why nothing complained.** A layer floats above the four regions rather than taking rows from them, so the heights still sum to `rows` and the frame is internally consistent with every overlay missing. The check that catches a region wrong by one row cannot see a region that is not drawn at all.

Three things follow, and they are decisions rather than details:

**Clamping is C15's and drawing is L4's, and neither does the other's half.** `layout()` clamps the box to the region and reports `truncated` (§4 steps 3, 6, 7); the drawer composites exactly the box it is handed and never re-decides its extent. Two components with an opinion about a layer's extent is how a menu comes to be one row taller than the space computed for it. The corollary is that **the drawer must not exceed `height`**: C15 clips no *content* (below), so a layer whose blocks render taller than its box is cut by whoever draws it.

**The region is the viewport's, and the offset to the terminal is the drawer's** (S01 §3a). Every number `layout()` returns is relative to the region it was handed, and the drawer adds the region's top before writing a row — one translation, in one place. Handing this component the whole terminal instead would spare the drawer that addition and cost C15 its shape: it would then have to know where the viewport sits, which is the header's height, which is S01's arithmetic arriving inside the one component built specifically not to hold any. That is why it imports neither C14 nor `terminal/` (I12), and why the region is a parameter rather than a property.

**Width is clamped, and unlike height that is not optional.** A layer taller than its box loses rows the reader can scroll to; a layer wider than the region wraps, and a wrapped overlay row shifts every row below it — the failure S01 §3 and `docs/notes/resize-and-compositor.md` both name, arriving through a layer instead of through a frame.

**The terminal cursor is placed by whatever holds focus, and hidden when that thing has none** (I19). C16's `activeTarget` already puts `overlay` above `prompt`, so the cursor belongs to the layer for the same reason the keys do — and leaving it blinking at the prompt under a menu that owns the keystrokes is precisely the *somewhere invisible* symptom derived focus exists to prevent.

`Placed.cursor` is how the layer says so, **relative to its own origin**, so the drawer never has to know what a prompt or a search field is. Absent means the layer has no cursor and the terminal's is hidden, which is the default and the case that matters: it is what a menu wants.

The two live producers answer oppositely, which is what makes this a field rather than a constant. **Reverse search has a cursor** — text is being typed into it — and **the completion menu has none**; nothing is entered into a menu, the keys move a selection. C15's exit confirm has none either, for the same reason, and it now has somewhere to appear at all.

**`cursorCell` stays exactly as it is** (C17 §2). C17 is a data structure with no notion of focus: it reports where its own cursor sits and always has. The *drawer* chooses — the focused layer's cursor if it has one, the prompt's if focus is `prompt`, hidden otherwise. A `cursorCell` that answered differently depending on focus would be C17 knowing about focus, which is what keeps it testable.

#### Four things the drawer has to get right

Written here before the build rather than after it, because each has a failure that looks like something else.

**1 — A layer over the prompt is the case with two owners.** The prompt paints its rows and the layer composites over them, so those cells are written twice. That is correct, and it means **the layer must paint every cell in its box, background included**. A loop that writes only the glyphs its blocks produce leaves the prompt showing through the gaps, and the symptom is text bleeding through a menu rather than anything that reads as a layout error.

**2 — Stacking order is push order, and the last layer wins each cell.** I1 and I2 settle it and nothing currently produces two overlapping layers, which is exactly why it is worth asserting rather than inheriting: "the last one wins" is obvious only once two of them overlap, and the first time that happens will be in front of a user.

**3 — A pushed view occupies the viewport region rather than floating.** Header and footer are untouched (T4.4). The drawer treats it as a layer whose box *is* the viewport region rather than as a replacement for the transcript — one path for both kinds, and the alternative is a second compositing rule that only one layer kind takes. S12's composed frame is the one to check it against.

**4 — Read the frame.** This will be the first time anything this component places appears on a screen, and every comparable first in this project was caught by looking rather than by an assertion: the glyph column rendering `…`, C12's y-label decimals, C25's five defects. Compose a menu over a prompt, a confirm over a view, and a search over a menu, and look at all three.

**A view's content is already the region's worth, and C15 does not scroll it.** The owner windows it — S12 holds fifty thousand log lines and renders the visible ones, having committed to owning its own scroll and calling no C14 (S12 T2.3); C25 §3b's fullscreen patch does the same through `n`, `p`, `g` and `G`. Said explicitly because its absence invites C15 growing a scroll offset for views, and that is a second scroll model beside C14's — the thing A01 D3 spent a decision avoiding. C15 clips nothing vertically beyond reporting `truncated`.

Overlays are content-sized and resolved in a fixed order:

```
1  resolve width: min(layer.width ?? region.width, region.width)
2  measure content at that width  → desired height
3  clamp to floor(region.height × maxHeightFraction)   → truncated if reduced
4  place at the preferred side of the anchor span
       above → rows [row − height, row − 1]
       below → rows [row + rows, row + rows + height − 1]
5  if it does not fit that side, flip to the other
6  if it fits neither, take the larger side and clamp again
7  clamp the top edge to the region; never negative, never past the bottom
8  resolve left: 0, or centred within the region
```

**The anchor is a span, not a row, and this is what a two-row prompt forced.** A prompt occupying rows 18 and 19 of a twenty-row region has no single row that places a menu correctly: anchoring on 18 and preferring `below` starts the menu on row 19, over the prompt's second line, and anchoring on 19 and preferring `above` ends it on row 18, over the prompt's first. Both preferences are wrong, and both produce a `Placed` in which every number is self-consistent — inside the region, non-negative, untruncated — so the whole of T2.2's corpus passes while the menu sits on top of the line it belongs to. It was found by drawing the frame.

So `rows` defaults to 1 and names the anchor's own extent, and **the anchor's rows are never covered**: step 4's arithmetic excludes `[row, row + rows − 1]` on both sides. Written out rather than left to the word "below", because `row + 1` is the natural thing to write and it is right exactly when the anchor is one row tall.

**Step 1 precedes step 2 and this is not tidiness.** Height is a function of width, so a forty-cell confirm measured at a hundred and twenty comes back one row tall and is drawn as three. Measuring at the region's width was the original wording and it was only ever right because nothing declared a narrower one.

**Flip before clamp** — and it is the *fit* clamp, steps 6 and 7, not the fraction clamp at step 3. The fraction is a policy about how much of the screen an overlay may take and it applies wherever the overlay ends up; the fit clamp is what happens when the chosen side is too small, and doing it before the flip is what produces the bug. A reader who takes I7 literally moves step 3 after step 5 and breaks T3.7, which is why the two clamps are named separately here rather than sharing a word.

The bug itself: a completion menu anchored just below the prompt has no room below it and plenty above; clamping first squashes it to two rows when flipping would have shown all eight. It is the most common overlay bug and it looks like "the menu is inexplicably tiny".

Truncation is reported through `Placed.truncated`, so the layer's owner can render its own "N more" indicator. C15 does not invent one — C19 knows what the remaining candidates are and C15 does not.

`centred` is for confirms and help: horizontally and vertically centred, same clamping. Horizontal centring is the only thing `Placed.left` is ever non-zero for, and it needs the region's width, which `layout()` is given, and the layer's own, which step 1 resolved.

**An overlay measuring zero rows is omitted from the result, and `layout()` does not dismiss it.** Purity (I5) forbids the manager acting on what it computed, so there is no third option here: the layer stays on the stack, nothing is drawn, and the owner dismisses. Push is deliberately not rejected for empty content, because content becomes empty legitimately — a completion menu narrows to no candidates as the last character is typed — and that moment is C19's to act on, not C15's.

**No backdrop dimming.** Terminals dim badly — a half-intensity region reads as a rendering fault rather than as depth. An overlay draws over what it covers, with a border to delimit it.

---

## 5. Geometry and resize

C15 holds no geometry of its own; `layout()` is a pure function of the stack and the region passed in. A resize therefore needs no invalidation — the next `layout()` call is simply computed against new dimensions.

An anchored overlay whose anchor row has scrolled out of the region clamps to the nearest edge rather than vanishing.

**An anchor row is a region row, and keeping it current is the owner's.** C15 is given a number and places against it; it has no way to learn that the row moved, and by design no way to learn that the entry under it was evicted. So a layer anchored to transcript content follows it by its owner calling `update(id, { placement })` as the viewport scrolls, and stops existing by its owner calling `dismiss(id, "anchorEvicted")`. Both are the same seam, and both keep `layout()` a pure function of what it was handed.

The alternative — C15 subscribing to C13 and anchoring on an `EntryId` — was rejected. It trades MG13, C15's statelessness and `layout()`'s purity to solve a problem the owner already has the information for, and it makes C15 the second component reading a change stream, which is the class C14 paid for in a blank screen.

---

## 6. State machine

Over the stack's shape.

| From ↓ / call → | `push(overlay)` | `push(view)` | `pop` | `dismiss(id)` | `update(id, …)` |
|---|---|---|---|---|---|
| **empty** | → overlays (T1.1) | → view (T1.2) | null (T3.1) | no-op (T3.2) | false, no change (T3.17) |
| **overlays** | → overlays, deeper (T1.3) | rejected (T3.4) | pops the top if dismissable (T1.5, T1.9) | removes that layer (T1.7) | shape unchanged (T1.12) |
| **view** | → view+overlays (T1.4) | rejected (T3.3) | → empty (T1.6) | → empty (T1.7) | shape unchanged (T1.12) |
| **view+overlays** | → deeper overlays (T1.3) | rejected (T3.3) | pops the overlay first (T1.8) | removes that layer (T1.7) | shape unchanged (T1.12) |

Pushing a view while overlays exist is rejected rather than reordered: it means the caller raised a view from inside a modal, which is a bug worth surfacing.

`update` is the only call that changes no cell of this table — it alters a layer, never the stack's shape. It earns a column precisely so that stays visible: a later hand reaching for "update should push if the id is unknown" has to write a transition that contradicts the row above it.

---

## 7. Invariants

- **I1** — At most one `view` in the stack at any time.
- **I2** — Every `overlay` sorts above every `view`, regardless of push order.
- **I3** — `pop()` removes only the topmost dismissable layer; a non-dismissable layer is not escapable.
- **I4** — Layer content is `Block[]`; no layer carries raw React.
- **I5** — `layout()` is pure — same stack and region, same result — and performs no I/O.
- **I6** — No placed layer exceeds the region on either axis, and neither offset is negative: `0 ≤ top`, `top + height ≤ region.height`, `0 ≤ left`, `left + width ≤ region.width`. Stated over both axes because `Placed` carries both, and a single-axis reading is what left `left` out of it.
- **I7** — Flip precedes the **fit** clamp. The `maxHeightFraction` clamp is a separate rule applied before placement begins (§4).
- **I8** — Truncation is reported, never disguised; C15 renders no overflow indicator itself.
- **I9** — C15 never writes to the transcript.
- **I10** — A dismissal **records why**: `anchorEvicted` when the layer's referent has gone, `explicit` otherwise. C15 detects neither — it holds no entry ids and imports nothing from C13 (I9, I12) — and the requirement was never detection but that L4 can tell a user's cancellation from a vanished referent.
- **I11** — No layer paints a backdrop, dim or otherwise. A terminal renders a dimmed region as damaged output rather than as depth, and the separation an overlay needs comes from its border and its position — which are things a cell grid can actually express.
- **I12** — C15 imports nothing from `terminal/` **or C14**; the region arrives as data.
- **I13** — Pushing returns a disposable; disposing is equivalent to `dismiss(id)`.
- **I14** — `update` changes a layer's content, placement or width and never the stack's shape, its order, or its `dismissable`. A layer whose escapability changes mid-life makes C16's Ctrl-C ladder depend on when it looked.
- **I15** — `layout()` omits a zero-height overlay and dismisses nothing. Acting on what it computed would cost I5.
- **I16** — An overlay's width is `min(layer.width ?? region.width, region.width)`, and its content is measured at that width rather than at the region's. `Placed.left` is derived from it.
- **I17** — An anchored overlay never covers its anchor's own rows, `[row, row + rows − 1]`, **whenever either side has a row to offer**. A single-row anchor is the default and the special case, not the general one. The qualification is T3.8's: a one-row region with a one-row anchor has no room on either side, and an overlay covering its anchor is a better answer than one silently absent.
- **I18** — The `maxHeightFraction` clamp is floored at one row. `floor(1 × 0.5)` is zero, and a region too short for the fraction must not swallow every overlay it holds.
- **I19** — The terminal cursor is placed by whatever holds focus and hidden when that thing has none. A layer states its own through `Placed.cursor`, relative to its origin; absent means hidden. The choice is the drawer's and never C17's — a `cursorCell` that varied with focus would put focus inside a component that has no notion of it.

---

## 8. Commitments

1. Overlays and pushed views are one mechanism with different placement (I1, I2).
2. Layer content is blocks, so overlays are themed, degradable and measurable like everything else (I4).
3. Overlays always sort above views; at most one view exists (I2, I1).
4. Pushing a second view is rejected as an orchestration bug (I1).
5. `Esc` pops the top dismissable layer; a confirm is not escapable (I3).
6. Placement flips before clamping (I7).
7. Truncation is reported; the owner renders its own indicator (I8).
8. No backdrop dimming — terminals render it as a fault, not as depth (I11).
9. `layout()` is pure and needs no resize invalidation (I5).
10. A dismissal records why it happened; C15 records the reason and never detects it (I10).
11. C15 emits pop events and writes nothing to the transcript; a pop appends nothing at all (I9, A01 D7).
12. Push returns a disposable equivalent to dismissal (I13).
13. A layer changes in place through `update` — content, placement or width, never the stack's shape and never its escapability (I14).
14. A zero-height overlay is omitted from the layout rather than dismissed by it (I15).
15. An overlay's width is its owner's to declare, and its content is measured at that width; `left` follows from it (I16, I6).
16. An anchor is a span rather than a row, and an overlay never covers it while either side has room (I17).
17. Both clamps have a floor of one row, so a short region never silently swallows a layer (I18).
18. The terminal cursor is placed by whatever holds focus and hidden when that thing has none; a layer states its own in `Placed`, and C17's `cursorCell` is unchanged because it has no notion of focus (I19).

---

## 9. Tests

Six tiers. Every cell of the §6 transition table is covered.

### Tier 1 — unit

- **T1.20** (I19): a layer carrying a cursor and a layer carrying none, placed → the first's `Placed.cursor` is relative to its own origin and survives the flip from `below` to `above`; the second's is absent. Both, because a field that is always present and always ignored passes any test of the first alone — and the two live producers answer oppositely, which is why this is a field.

- **T1.1**: `push(overlay)` on empty → stack of one, `top` is it, `hasView` false.
- **T1.2**: `push(view)` on empty → `hasView` true.
- **T1.3**: two overlays → LIFO order, `top` is the second.
- **T1.4** (I2): overlay pushed over a view → overlay is `top`.
- **T1.5**: `pop` with two overlays → removes the top one only.
- **T1.6**: `pop` with only a view → empty.
- **T1.7** (I13): `dismiss(id)` removes that specific layer from any depth; the returned disposable does the same.
- **T1.8** (I2): `pop` with a view plus an overlay → the overlay goes first.
- **T1.9** (I3): `pop` on a non-dismissable top → returns null, stack unchanged.
- **T1.10**: `dismiss` on a non-dismissable layer → removes it. Explicit resolution always works.
- **T1.11**: view placement → `top` 0, `left` 0, full region height and width.
- **T1.12** (I14): `update` on a layer at any depth changes its content and leaves `stack`, its order, `top` and `hasView` identical; a `content` change is emitted.
- **T1.13** (I14): `LayerUpdate` has no `dismissable` — a compile-level test rejects `update(id, { dismissable: true })`, which is the only form the restriction can take.
- **T1.14** (I16): a layer declaring `width: 40` in a 120-cell region → `Placed.width` 40, and its content was measured at 40, not 120. The height differs from the region-width measurement, which is the point.
- **T1.15** (I16, I6): a `centred` layer of width 40 in a 120-cell region → `left` 40. Odd remainders round down, deterministically (T3.12).

### Tier 2 — contract / interface

- **T2.1** (I5): `layout()` called a hundred times on the same stack and region returns deeply equal results and performs no I/O. It is `update` that makes this assertable — with content as a thunk, the same stack and region could legitimately return two answers.
- **T2.2** (I6): over a fuzz corpus of stacks × regions from 1×1 to 400×200, no placed layer exceeds the region on either axis or is placed negatively on either. Both offsets, both extents, four assertions.
- **T2.3** (I4): every `Layer` in the corpus carries `Block[]`; a compile-level test rejects a React element in `content`.
- **T2.4** (I1, I2, I6, I14): a thousand random sequences of `push`, `pop`, `dismiss` and `update` — **sequences, not single calls**, and I1, I2 and I14 are asserted after *every* step rather than at the end. A component holding state is tested over its history: an invariant that constrains each operation says nothing about the path, and that is where C12, C13 and C14 each hid a defect.
- **T2.5** (I9): the module graph shows no import from C13 in `overlay/` (MG13).
- **T2.6** (I12): the module graph shows no import from `terminal/` or C14.
- **T2.8** (I2): placement over a stack built by hand with an overlay beneath a view → the view is placed first and the overlay last. Reached without `push`, because `push` cannot produce this stack and that is exactly why the sort is otherwise untestable.
- **T2.9** (I16, T3.5b): the anchor span, over a corpus of anchor rows and extents from 1 to 5 in regions of every height → the placed overlay never intersects `[row, row + rows − 1]` on either side of the flip.
- **T2.7**: every `OverlayChange` variant is emitted by at least one operation — `push`, `pop`, `content` and both `dismiss` reasons, `explicit` and `anchorEvicted`. The second reason is emitted by a caller passing it, which is the whole of I10.

### Tier 3 — edge cases

- **T3.1**: `pop` on empty → null, no throw.
- **T3.2**: `dismiss` with an unknown id → no-op.
- **T3.3** (I1): `push(view)` while a view exists → rejected, stack unchanged.
- **T3.4** (I1): `push(view)` while overlays exist → rejected.
- **T3.5** (I7): an overlay preferring `below` at a row with 2 rows beneath and 12 above → **flips above and shows its full height**. The classic bug, tested directly. A control above it asserts the fixture is taller than the room below, so a fixture that fits either way cannot report a pass.
- **T3.5b** (I7): the same overlay against a prompt **two rows tall** — `row: 18, rows: 2` in a twenty-row region → the menu occupies rows 10–17 and touches neither prompt row. Both the single-row readings overlap it, and both produce a self-consistent `Placed`, so this is asserted as a frame and not only as numbers.
- **T3.6** (I7): neither side fits → the larger side is taken and clamped; `truncated` true.
- **T3.7**: an overlay taller than `maxHeightFraction` of the region → clamped, `truncated` true. A control asserts the same overlay is *un*truncated in a taller region, so a fixture that is always truncated cannot report a pass.
- **T3.7b** (I7): the fraction clamp is applied before placement and the fit clamp after — asserted by an overlay that would flip differently if the two were swapped. The pair of clamps sharing a word is what makes this worth its own test.
- **T3.8** (I17, I18): region height 1 → the overlay occupies 1 row, truncated, no negative arithmetic. It covers its anchor, which is the one case I17 permits and the reason I17 is qualified rather than absolute: with no room on either side the alternatives are covering the anchor or vanishing, and vanishing is the one that looks like a dropped keystroke.
- **T3.8b** (I18): an overlay in a region of 1 row with the default fraction → placed, not omitted. `floor(1 × 0.5)` is zero and the floor is what stops that reading the layout.
- **T3.9** (I16): a layer declaring a width wider than the region → clamped to the region, content measured at the clamped width, `left` 0, nothing overflows horizontally.
- **T3.10**: an anchor row outside the region → clamped to the nearest edge, not vanished.
- **T3.11** (I10): `dismiss(id, "anchorEvicted")` → the layer is removed and the change carries that reason; `dismiss(id)` carries `explicit`. C15 is the recorder, so the test is over what it reports, not over what it noticed.
- **T3.17** (I14): `update` with an unknown id → `false`, no change emitted, stack untouched. It does not push.
- **T3.18** (I14, I5): `update` changes what the next `layout()` returns, and only the updated layer's `Placed` differs.
- **T3.19** (I15): a layer updated to empty content → omitted from `layout()`, still on the stack, no change emitted by `layout()` itself. The narrowing-to-zero-candidates case, end to end.
- **T3.12**: `centred` in a region of even and odd height → deterministic rounding, never off-by-one between renders.
- **T3.13** (I15, I5): an overlay measuring 0 rows (empty content) → omitted from the result rather than drawing a zero-height border. It is *not* dismissed by `layout()`: a pure function does not act on what it computed.
- **T3.14**: twenty nested overlays → all tracked, LIFO order preserved, layout stays within budget.
- **T3.15**: disposing a disposable twice → second is a no-op.
- **T3.16**: disposing a layer already popped → no-op, does not remove a newer layer that reused nothing.

### Tier 4 — integration

- **T4.1** (with C09): overlay content measures through the same registry as transcript blocks; heights agree with what is rendered.
- **T4.2** (with C09, C10): an overlay in both themes and at 1-bit has identical geometry.
- **T4.3** (with C02, C09): under `unicode: "ascii"`, overlay borders use ASCII and the height is unchanged.
- **T4.4** (with C14): a full-screen view occupies exactly the viewport region; header and footer are untouched.
- **T4.5** (with C14, I14): an overlay anchored to a transcript row follows it as the viewport scrolls — by its owner recomputing the region row and calling `update(id, { placement })` — and clamps at the edges. C15 is driven here, not subscribed.
- **T4.5b** (with C16): `pop()` returning `null` is disambiguated by `top` — the Ctrl-C ladder falls through with an empty stack and no-ops with a non-dismissable layer, and the two are distinguished without reading the return value.
- **T4.6** (with C16): `top` determines input priority; an overlay over a view routes keys to the overlay.
- **T4.7** (with C19): the completion menu pushes an anchored overlay and renders its own "N more" from `Placed.truncated`.
- **T4.7b** (with C19, I14): typing narrows the candidate set through `update`, not through a pop and a push — asserted by the change log, which holds one `push`, N `content` and one `pop` rather than N of each.
- **T4.9** (with C25): C25 §3b's fullscreen patch is a view whose content is a single block, carried by `Block[]` with no special case; paging through it with `n` and `p` is the owner calling `update`, and `Placed` never gains a scroll offset.
- **T4.8** (with L4): popping a view emits a `pop` change and the transcript is untouched — same entry count, same live id, before and after. C15 writes nothing and L4 appends nothing (A01 D7).

### Tier 5 — e2e

- **T5.1**: a completion menu near the bottom of the terminal flips above the prompt and shows every candidate.
- **T5.2**: reverse-i-search raised over a completion menu → both stacked, keys go to the search, `Esc` returns to the menu.
- **T5.3**: a confirm raised inside the dashboard → drawn over it, `Esc` does nothing, `n` resolves it and returns to the dashboard.
- **T5.4**: resizing the terminal with three layers open → all reposition correctly, none escapes the region, no blank frames.
- **T5.5**: `Esc` from the logs view → view pops, the transcript is untouched, and focus returns to the still-live block with selection preserved (A01 D7). The untouched transcript is what makes the preserved selection possible, not an incidental detail beside it.

### Tier 6 — fail-on-revert

- **T6.1** (I7): clamping before flipping → T3.5 fails, and menus become inexplicably small near the bottom.
- **T6.2** (I2): removing the sort from `layout()` → T2.8 fails. **Not T1.4 or T5.3**, which was this test's original claim and was unfalsifiable: `push(view)` is rejected onto any non-empty stack, so those two never construct a stack in the wrong order and both pass under push order alone. The revert is only detectable against a hand-built stack, which is what T2.8 is.
- **T6.3** (I1): allowing nested views → T3.3 fails and the `Esc` chain becomes ambiguous.
- **T6.4** (I3): letting `Esc` dismiss a confirm → T1.9 fails; a stray keypress answers a question the user did not read.
- **T6.5** (I4): rendering an overlay with raw React → T2.3 fails, and the overlay stops being themed or measurable.
- **T6.6** (I9): writing to the transcript from C15 → T2.5 fails and L2 gains a dependency on the transcript's contents.
- **T6.7** (I6): an off-by-one in clamping → T2.2 fails across the corpus.
- **T6.8** (I8): rendering an overflow indicator inside C15 → T4.7 fails, since C15 cannot know what the remainder is.
- **T6.9** (I5): caching layout results across regions → T2.1 fails after a resize.
- **T6.10** (I7): reading I7 as "flip before *any* clamp" and moving the fraction clamp after the flip → T3.7 and T3.7b fail. The revert that a correct-sounding sentence invites.
- **T6.11** (I3): making `pop()` search downwards for the first dismissable layer → T1.9 fails, and `Esc` under a confirm closes the menu beneath it.
- **T6.12** (I16): measuring content at `region.width` rather than at the resolved width → T1.14 fails, and a narrow confirm is drawn shorter than it is.
- **T6.13** (I6): omitting `left` from `Placed` → T1.15 and T2.2 fail, and C16 cannot hit-test a centred confirm.
- **T6.14** (I14): widening `LayerUpdate` to include `dismissable` → T1.13 fails, and C16's Ctrl-C ladder starts depending on when it looked.
- **T6.15** (I17): computing the anchored sides from `row ± 1` rather than from the span → T3.5b fails, and a menu lands on the second line of a two-row prompt while every number in `Placed` agrees with every other.
- **T6.16** (I18): dropping either clamp's floor of one row → T3.8 and T3.8b fail, and a short terminal loses its overlays entirely rather than showing them badly.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Routing keys to the top layer | C16 |
| What the completion menu contains | C19 |
| Reverse-search behaviour | C20 |
| The dashboard's panels and refresh | S13 |
| Whether a popped view records anything in the transcript | L4 — and after A01 D7's amendment it records nothing |
| Scroll state beneath an overlay | C14 |
| Scrolling a view's own content | Its owner — S12, S13, C25 §3b. C15 places the region's worth and clips nothing |
| Noticing that a layer's anchor row moved or was evicted | Its owner, through `update` and `dismiss(id, "anchorEvicted")` |
| The width an overlay would like to be | Its owner. Measurement answers height at a width, never the reverse |
| Backdrop effects | Rejected — terminals render dimming as a fault |
