/**
 * Floats resolved to whole-cell rects on the frame — C29 §7f, I22.
 *
 * **Six steps, and `LAYOUT_ENGINE.md` §10 has two of them in the wrong order.**
 * The design nudges the float into the *frame* and then intersects it with the
 * *attached ancestor's* clip, which are two different windows in that order: a
 * tooltip near the bottom of a scroll block is nudged to a row the frame allows
 * and the ancestor does not, then clipped to nothing — **moved to the one place
 * it cannot be drawn**. The nudge answers to the window the float will be
 * clipped to, so the window is chosen first (F1235, walk C1).
 */
import type { Window } from "./compose.js";
import type { FoundFloat, Sites } from "./compose.js";
import type { PlacedFloat, Point, Rect } from "./types.js";

/**
 * A point on a box, in absolute cells.
 *
 * **The far edge is exclusive and the near edge is inclusive**, so `"r"` on a
 * box of width 4 at x = 10 is 14 — the first column after it, which is where a
 * float anchored `{self: "tl", target: "tr"}` begins. A right edge read as 13
 * would overlap its target by one cell on every anchor that uses it, and the
 * overlap is invisible at width 1.
 */
const pointOf = (rect: Window, point: Point): { readonly x: number; readonly y: number } => {
  const h = point[1]!;
  const v = point[0]!;
  return {
    x: rect.x + (h === "l" ? 0 : h === "c" ? Math.floor(rect.w / 2) : rect.w), // cells-ok — a cell count
    y: rect.y + (v === "t" ? 0 : v === "c" ? Math.floor(rect.h / 2) : rect.h), // cells-ok — a row count
  };
};

/**
 * The **minimum** shift that brings `[v, v + size)` inside `[lo, hi)`.
 *
 * **Minimum, and the row asserts the position rather than the containment**: a
 * shift larger than this satisfies *it is inside the window* exactly as well,
 * and *containment is not correctness* — inside-the-bounds is satisfied by
 * every wrong answer. A float too large for the window lands at its origin,
 * which is a declared choice: it makes the result deterministic rather than a
 * function of which axis the implementation clamped last.
 */
const nudge = (v: number, size: number, lo: number, hi: number): number => {
  if (size >= hi - lo) return lo;
  if (v < lo) return lo;
  if (v + size > hi) return hi - size;
  return v;
};

/**
 * Resolve every float a walk found — C29 §7f, I22.
 *
 * **Document order, and an unresolvable attachment omits the float.** It never
 * throws: a throw mid-walk abandons every float already placed, which is the
 * rejection path neither artefact shape indexes (walk C5, C6). C15 already
 * omits a zero-row layer without dismissing it, and this is that rule one layer
 * down.
 *
 * **A float may attach to a float, and only to one already placed.** That is
 * the whole of the cycle rule: a float naming one that comes later, or naming
 * itself through a chain, has no rect yet and falls out by the same condition
 * that catches an unknown id. No separate detection, because there is no
 * separate case.
 */
export function placeFloats(sites: Sites, frame: Window): readonly PlacedFloat[] {
  const placed: PlacedFloat[] = [];
  const byId = new Map(sites.byId);
  for (const found of sites.floats) {
    const one = resolve(found, byId, frame);
    if (one === undefined) continue;
    placed.push(one);
    // A float is a box like any other once it is placed, so it can be attached
    // to — by a **later** float, never an earlier one.
    if (!byId.has(one.id)) {
      byId.set(one.id, {
        rect: { x: one.rect.x, y: one.rect.y, w: one.rect.width, h: one.rect.height },
        window: { x: one.clip.x, y: one.clip.y, w: one.clip.width, h: one.clip.height },
      });
    }
  }
  // **Named positions, and the order within one is the walk's** (I22, I23).
  // `sort` is stable in every engine this runs on, and the comparator returns 0
  // within a layer on purpose: document order is the only total order a tree
  // supplies.
  const rank: Record<PlacedFloat["layer"], number> = { float: 0, overlay: 1, debug: 2 };
  return [...placed].sort((a, b) => rank[a.layer] - rank[b.layer]);
}

function resolve(found: FoundFloat, byId: ReadonlyMap<string, { rect: Window; window: Window }>, frame: Window): PlacedFloat | undefined {
  const { float, parent } = found;
  const { floating, solved } = float;

  // Step 2 — the target, against the **composited** rect (walk C2).
  const target =
    floating.attachTo.kind === "parent"
      ? parent
      : floating.attachTo.kind === "root"
        ? { rect: frame, window: frame }
        : byId.get(floating.attachTo.id);
  if (target === undefined) return undefined;

  // **A zero-row float is omitted and not dismissed**, exactly as a zero-row
  // overlay is today — the declaration stays, nothing is drawn, and the owner
  // acts (`LAYOUT_ENGINE.md` §10).
  const size: Window = { x: 0, y: 0, w: solved.rect.width, h: solved.rect.height };
  if (size.w === 0 || size.h === 0) return undefined;

  // Step 4 — the anchor lines two points up, then `offset` in whole cells.
  // **`offset` is applied before the nudge**, and §10's *applied last* is about
  // the anchor: applied after the nudge it re-pushes the float back outside the
  // window the nudge had just fitted it into (walk C8).
  const self = pointOf(size, floating.anchor.self);
  const at = pointOf(target.rect, floating.anchor.target);
  const wanted = {
    x: at.x - self.x + (floating.offset?.x ?? 0), // cells-ok — a cell count
    y: at.y - self.y + (floating.offset?.y ?? 0), // cells-ok — a row count
  };

  // Step 5 — the window, chosen **before** the nudge answers to it.
  const window = (floating.clipTo ?? "attachedAncestor") === "none" ? frame : target.window;

  // Step 6 — the minimum shift, both axes, `x` first. The two are independent
  // because a whole-cell rect has no diagonal constraint; the order is declared
  // anyway so a float too large on both lands at the window's origin rather
  // than at whichever corner the implementation reached last.
  const x = nudge(wanted.x, size.w, window.x, window.x + window.w);
  const y = nudge(wanted.y, size.h, window.y, window.y + window.h);
  const rect: Rect = { x, y, width: size.w, height: size.h };
  return { id: solved.id, layer: floating.layer, rect, clip: { x: window.x, y: window.y, width: window.w, height: window.h }, solved };
}
