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
  | Readonly<{ kind: "anchored"; row: number; prefer: "above" | "below" }>
  | Readonly<{ kind: "centred" }>
  | Readonly<{ kind: "fill" }>;                  // views only

type Layer = Readonly<{
  id:          string;
  kind:        "overlay" | "view";
  placement:   Placement;
  content:     readonly Block[];
  dismissable: boolean;                          // false = must be resolved, not escaped
  maxHeightFraction?: number;                     // overlays; default 0.5
}>;

type Placed = Readonly<{
  layer:  Layer;
  top:    number;                                // absolute row within the viewport region
  height: number;
  width:  number;
  truncated: boolean;
}>;

type OverlayChange =
  | Readonly<{ kind: "push";    id: string; layerKind: "overlay" | "view" }>
  | Readonly<{ kind: "pop";     id: string; layerKind: "overlay" | "view" }>
  | Readonly<{ kind: "dismiss"; id: string; reason: "explicit" | "anchorEvicted" }>;

interface OverlayManager {
  push(layer: Layer): Disposable;
  pop(): Layer | null;                           // pops the top dismissable layer
  dismiss(id: string): void;
  layout(region: Readonly<{ width: number; height: number }>): readonly Placed[];
  subscribe(cb: (change: OverlayChange) => void): Disposable;

  readonly stack:  readonly Layer[];             // bottom-first
  readonly top:    Layer | null;
  readonly hasView: boolean;
}
```

**Content is `Block[]`, not React.** Every overlay and every pushed view renders through the same block library as the transcript — so a completion menu is themed, degrades to ASCII, and is measurable by the same code. The dashboard's five panels are a `group` of `panel`s. React appears only in the positioning shell, never in the content.

That is the payoff of the block vocabulary being a vocabulary rather than a rendering of one particular thing, and it is worth defending: a component that reaches for raw React to draw an overlay has stepped outside theming and measurement at once.

---

## 3. Stack rules

**Overlays always sit above views.** A confirm raised from inside the dashboard appears over it, which is why A02's focus priority lists `overlay` above `pushedView`.

**At most one view.** Views do not nest in v1. Pushing a second is rejected as an orchestration bug — the drill-in path from the dashboard opens a live block in the transcript, not another view (A01 D7), so nesting is never needed.

**Overlays nest freely.** Reverse-i-search over a completion menu is legitimate.

`pop()` removes the topmost **dismissable** layer. A non-dismissable layer — a confirm awaiting y/N — is not escapable and must be resolved by `dismiss(id)` from whatever raised it. `Esc` on such a layer is a no-op rather than a silent cancellation, because a confirm that can be dismissed by an unrelated keypress is not a confirm.

Popping emits a change. **C15 does not write to the transcript** — the one-line trace a pushed view leaves behind (A01 D7) is composed by L4, which knows what the view was showing. Keeping C15 out of C13 preserves the layering and stops the overlay manager needing to understand what a dashboard is.

---

## 4. Placement

Views fill the viewport region entirely: `top = 0`, full height and width. Nothing to decide.

Overlays are content-sized and resolved in a fixed order:

```
1  measure content at region.width  → desired height
2  clamp to floor(region.height × maxHeightFraction)   → truncated if reduced
3  place at the preferred side of the anchor row
4  if it does not fit that side, flip to the other
5  if it fits neither, take the larger side and clamp again
6  clamp the top edge to the region; never negative, never past the bottom
```

**Flip before clamp.** A completion menu anchored just below the prompt has no room below it and plenty above; clamping first would squash it to two rows when flipping would have shown all eight. Getting this order wrong is the most common overlay bug and it looks like "the menu is inexplicably tiny".

Truncation is reported through `Placed.truncated`, so the layer's owner can render its own "N more" indicator. C15 does not invent one — C19 knows what the remaining candidates are and C15 does not.

`centred` is for confirms and help: horizontally and vertically centred, same clamping.

**No backdrop dimming.** Terminals dim badly — a half-intensity region reads as a rendering fault rather than as depth. An overlay draws over what it covers, with a border to delimit it.

---

## 5. Geometry and resize

C15 holds no geometry of its own; `layout()` is a pure function of the stack and the region passed in. A resize therefore needs no invalidation — the next `layout()` call is simply computed against new dimensions.

An anchored overlay whose anchor row has scrolled out of the region clamps to the nearest edge rather than vanishing. An overlay anchored to a transcript row that has been evicted is dismissed, because its referent no longer exists.

---

## 6. State machine

Over the stack's shape.

| From ↓ / call → | `push(overlay)` | `push(view)` | `pop` | `dismiss(id)` |
|---|---|---|---|---|
| **empty** | → overlays (T1.1) | → view (T1.2) | null (T3.1) | no-op (T3.2) |
| **overlays** | → overlays, deeper (T1.3) | rejected (T3.4) | pops top dismissable (T1.5) | removes that layer (T1.7) |
| **view** | → view+overlays (T1.4) | rejected (T3.3) | → empty (T1.6) | → empty (T1.7) |
| **view+overlays** | → deeper overlays (T1.3) | rejected (T3.3) | pops the overlay first (T1.8) | removes that layer (T1.7) |

Pushing a view while overlays exist is rejected rather than reordered: it means the caller raised a view from inside a modal, which is a bug worth surfacing.

---

## 7. Invariants

- **I1** — At most one `view` in the stack at any time.
- **I2** — Every `overlay` sorts above every `view`, regardless of push order.
- **I3** — `pop()` removes only the topmost dismissable layer; a non-dismissable layer is not escapable.
- **I4** — Layer content is `Block[]`; no layer carries raw React.
- **I5** — `layout()` is pure — same stack and region, same result — and performs no I/O.
- **I6** — No placed layer exceeds the region in either dimension, or is placed at a negative offset.
- **I7** — Flip precedes clamp.
- **I8** — Truncation is reported, never disguised; C15 renders no overflow indicator itself.
- **I9** — C15 never writes to the transcript.
- **I10** — An overlay anchored to an evicted row is dismissed rather than left dangling.
- **I11** — C15 imports nothing from `terminal/` **or C14**; the region arrives as data.
- **I12** — Pushing returns a disposable; disposing is equivalent to `dismiss(id)`.

---

## 8. Commitments

1. Overlays and pushed views are one mechanism with different placement.
2. Layer content is blocks, so overlays are themed, degradable and measurable like everything else.
3. Overlays always sort above views; at most one view exists.
4. Pushing a second view is rejected as an orchestration bug.
5. `Esc` pops the top dismissable layer; a confirm is not escapable.
6. Placement flips before clamping.
7. Truncation is reported; the owner renders its own indicator.
8. No backdrop dimming — terminals render it as a fault, not as depth.
9. `layout()` is pure and needs no resize invalidation.
10. An overlay whose anchor is evicted is dismissed.
11. C15 emits pop events; L4 composes the transcript trace.
12. Push returns a disposable equivalent to dismissal.

---

## 9. Tests

Six tiers. Every cell of the §6 transition table is covered.

### Tier 1 — unit

- **T1.1**: `push(overlay)` on empty → stack of one, `top` is it, `hasView` false.
- **T1.2**: `push(view)` on empty → `hasView` true.
- **T1.3**: two overlays → LIFO order, `top` is the second.
- **T1.4** (I2): overlay pushed over a view → overlay is `top`.
- **T1.5**: `pop` with two overlays → removes the top one only.
- **T1.6**: `pop` with only a view → empty.
- **T1.7** (I12): `dismiss(id)` removes that specific layer from any depth; the returned disposable does the same.
- **T1.8** (I2): `pop` with a view plus an overlay → the overlay goes first.
- **T1.9** (I3): `pop` on a non-dismissable top → returns null, stack unchanged.
- **T1.10**: `dismiss` on a non-dismissable layer → removes it. Explicit resolution always works.
- **T1.11**: view placement → `top` 0, full region height and width.

### Tier 2 — contract / interface

- **T2.1** (I5): `layout()` called a hundred times on the same stack and region returns deeply equal results and performs no I/O.
- **T2.2** (I6): over a fuzz corpus of stacks × regions from 1×1 to 400×200, no placed layer exceeds the region or is placed negatively.
- **T2.3** (I4): every `Layer` in the corpus carries `Block[]`; a compile-level test rejects a React element in `content`.
- **T2.4** (I1): across a thousand random push/pop sequences, at most one view is ever present.
- **T2.5** (I9): a source scan finds no C13 import in `overlay/`.
- **T2.6** (I11): the module graph shows no import from `terminal/` or C14.
- **T2.7**: every `OverlayChange` variant is emitted by at least one operation.

### Tier 3 — edge cases

- **T3.1**: `pop` on empty → null, no throw.
- **T3.2**: `dismiss` with an unknown id → no-op.
- **T3.3** (I1): `push(view)` while a view exists → rejected, stack unchanged.
- **T3.4** (I1): `push(view)` while overlays exist → rejected.
- **T3.5** (I7): an overlay preferring `below` at a row with 2 rows beneath and 12 above → **flips above and shows its full height**. The classic bug, tested directly.
- **T3.6** (I7): neither side fits → the larger side is taken and clamped; `truncated` true.
- **T3.7**: an overlay taller than `maxHeightFraction` of the region → clamped, `truncated` true.
- **T3.8**: region height 1 → the overlay occupies 1 row, truncated, no negative arithmetic.
- **T3.9**: region width narrower than the overlay's minimum content → content measures at the region width; nothing overflows horizontally.
- **T3.10**: an anchor row outside the region → clamped to the nearest edge, not vanished.
- **T3.11** (I10): an anchor referring to an evicted transcript row → the layer is dismissed and a change emitted.
- **T3.12**: `centred` in a region of even and odd height → deterministic rounding, never off-by-one between renders.
- **T3.13**: an overlay measuring 0 rows (empty content) → not placed; treated as dismissed rather than drawing a zero-height border.
- **T3.14**: twenty nested overlays → all tracked, LIFO order preserved, layout stays within budget.
- **T3.15**: disposing a disposable twice → second is a no-op.
- **T3.16**: disposing a layer already popped → no-op, does not remove a newer layer that reused nothing.

### Tier 4 — integration

- **T4.1** (with C09): overlay content measures through the same registry as transcript blocks; heights agree with what is rendered.
- **T4.2** (with C09, C10): an overlay in both themes and at 1-bit has identical geometry.
- **T4.3** (with C02, C09): under `unicode: "ascii"`, overlay borders use ASCII and the height is unchanged.
- **T4.4** (with C14): a full-screen view occupies exactly the viewport region; header and footer are untouched.
- **T4.5** (with C14): an overlay anchored to a transcript row moves with the row when the viewport scrolls, and clamps at the edges.
- **T4.6** (with C16): `top` determines input priority; an overlay over a view routes keys to the overlay.
- **T4.7** (with C19): the completion menu pushes an anchored overlay and renders its own "N more" from `Placed.truncated`.
- **T4.8** (with L4): popping a view emits a change from which L4 composes the transcript trace; C15 writes nothing.

### Tier 5 — e2e

- **T5.1**: a completion menu near the bottom of the terminal flips above the prompt and shows every candidate.
- **T5.2**: reverse-i-search raised over a completion menu → both stacked, keys go to the search, `Esc` returns to the menu.
- **T5.3**: a confirm raised inside the dashboard → drawn over it, `Esc` does nothing, `n` resolves it and returns to the dashboard.
- **T5.4**: resizing the terminal with three layers open → all reposition correctly, none escapes the region, no blank frames.
- **T5.5**: `Esc` from the logs view → view pops, a one-line trace appears in the transcript, focus returns to the live block with selection preserved (A01 D7).

### Tier 6 — fail-on-revert

- **T6.1** (I7): clamping before flipping → T3.5 fails, and menus become inexplicably small near the bottom.
- **T6.2** (I2): sorting purely by push order → T1.4 and T5.3 fail; a confirm hides behind the dashboard.
- **T6.3** (I1): allowing nested views → T3.3 fails and the `Esc` chain becomes ambiguous.
- **T6.4** (I3): letting `Esc` dismiss a confirm → T1.9 fails; a stray keypress answers a question the user did not read.
- **T6.5** (I4): rendering an overlay with raw React → T2.3 fails, and the overlay stops being themed or measurable.
- **T6.6** (I9): writing the pop trace from C15 → T2.5 fails and L2 gains a dependency on the transcript's contents.
- **T6.7** (I6): an off-by-one in clamping → T2.2 fails across the corpus.
- **T6.8** (I8): rendering an overflow indicator inside C15 → T4.7 fails, since C15 cannot know what the remainder is.
- **T6.9** (I5): caching layout results across regions → T2.1 fails after a resize.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Routing keys to the top layer | C16 |
| What the completion menu contains | C19 |
| Reverse-search behaviour | C20 |
| The dashboard's panels and refresh | S13 |
| The transcript trace left by a popped view | L4 |
| Scroll state beneath an overlay | C14 |
| Backdrop effects | Rejected — terminals render dimming as a fault |
