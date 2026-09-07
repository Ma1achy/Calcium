/**
 * Placement: a pure function of a stack and a region.
 *
 * C15 §4 — see spec.
 *
 * Separate from the manager for two reasons, and the second is the one that
 * matters. It keeps I5 honest — nothing here can reach state, so "same stack and
 * region, same result" is a property of the signature rather than a promise
 * about the code. And it is the only way I2's sort is testable at all: `push`
 * rejects a view onto any non-empty stack, so a stack with an overlay beneath a
 * view cannot be built through the manager, and a sort that never runs is a sort
 * nobody would notice removing (T2.8).
 */

import type { BlockRegistryLike, Layer, Placed, Placement, Region } from "./types.js";

const DEFAULT_MAX_HEIGHT_FRACTION = 0.5;

/**
 * Bottom-first: views, then peeks, then overlays, stable within each (I2, I23).
 *
 * The view/overlay half is true by construction of `push` and enforced anyway —
 * see §3. **The peek band is the one `push` cannot get right by order alone**:
 * a peek opens beneath whatever is already up and stays beneath whatever opens
 * later, so a confirm raised over it draws over it (§2a). The stable partition
 * preserves nesting order among overlays, which is what makes reverse-i-search
 * sit above the completion menu it was raised over.
 */
export function sortLayers(stack: readonly Layer[]): readonly Layer[] {
  const views = stack.filter((l) => l.kind === "view");
  const peeks = stack.filter((l) => l.kind === "peek");
  const overlays = stack.filter((l) => l.kind === "overlay");
  return Object.freeze([...views, ...peeks, ...overlays]);
}

/** Step 1: the width an overlay actually gets. Never wider than the region (I16). */
function resolveWidth(layer: Layer, region: Region): number {
  const want = layer.width ?? region.width;
  return Math.max(0, Math.min(want, region.width));
}

/**
 * Rows available above and below an anchor **span**.
 *
 * The span, not the row: an overlay never covers `[row, row + rows − 1]` (I17).
 * `row + 1` is the natural thing to write and it is correct exactly when the
 * anchor is one row tall, which is why the arithmetic is here rather than
 * inline at both of its call sites.
 *
 * Both are floored at zero, so an anchor outside the region (T3.10) produces no
 * negative arithmetic — it simply has no room on one side.
 */
function anchorRoom(p: Extract<Placement, { kind: "anchored" }>, region: Region) {
  const rows = Math.max(1, p.rows ?? 1);
  return {
    above: Math.max(0, Math.min(p.row, region.height)),
    below: Math.max(0, region.height - (p.row + rows)),
    firstBelow: p.row + rows,
  };
}

/**
 * Where an anchored overlay of this height goes, and whether it had to shrink.
 *
 * **Flip precedes the fit clamp**, which is what steps 5 and 6 are. The
 * `maxHeightFraction` clamp already happened, and it is a different rule: a
 * completion menu below a prompt has no room below and plenty above, and
 * clamping to the room before trying the other side shows two rows of eight.
 */
function placeAnchored(
  p: Extract<Placement, { kind: "anchored" }>,
  height: number,
  region: Region,
): { top: number; height: number; truncated: boolean } {
  const room = anchorRoom(p, region);
  const preferAbove = p.prefer === "above";
  const first = preferAbove ? room.above : room.below;
  const second = preferAbove ? room.below : room.above;

  const above = (h: number) => ({ top: p.row - h, height: h, truncated: false });
  const below = (h: number) => ({ top: room.firstBelow, height: h, truncated: false });

  if (height <= first) return preferAbove ? above(height) : below(height);
  if (height <= second) return preferAbove ? below(height) : above(height);

  // Neither side fits: the larger one, clamped to it.
  //
  // The floor of one row is T3.8's — a region of one row with a one-row anchor
  // has no room on either side, and the honest outcome is an overlay covering
  // its anchor rather than one silently absent. I17 is stated over the case
  // where a side has room, because in this one there is nowhere else to be.
  const useAbove = room.above >= room.below;
  const h = Math.max(1, useAbove ? room.above : room.below);
  return { ...(useAbove ? above(h) : below(h)), truncated: true };
}

/**
 * The frame's geometry.
 *
 * Bottom-first, so a caller paints in the order returned and the top layer
 * lands last. A zero-height overlay is **omitted and not dismissed** (I15):
 * acting on what it computed would cost this function its purity, and the
 * moment a completion menu narrows to nothing is C19's to notice.
 */
export function place(
  stack: readonly Layer[],
  region: Region,
  registry: BlockRegistryLike,
): readonly Placed[] {
  const out: Placed[] = [];

  for (const layer of sortLayers(stack)) {
    if (layer.placement.kind === "fill" || layer.kind === "view") {
      const measured = registry.measureSequence(layer.content, region.width);
      out.push(
        Object.freeze({
          layer,
          top: 0,
          left: 0,
          height: region.height,
          width: region.width,
          // The owner windows a view's content (§4). Reported rather than
          // clipped, because C15 has no scroll and should not grow one.
          truncated: measured > region.height,
          ...(layer.cursor !== undefined && { cursor: layer.cursor }),
        }),
      );
      continue;
    }

    const width = resolveWidth(layer, region);
    const desired = registry.measureSequence(layer.content, width);
    if (desired <= 0) continue;

    // The fraction clamp, floored at one row: `floor(1 × 0.5)` is zero, and a
    // short region must not silently swallow every overlay it holds.
    const fraction = layer.maxHeightFraction ?? DEFAULT_MAX_HEIGHT_FRACTION;
    const cap = Math.max(1, Math.floor(region.height * fraction));
    const capped = Math.min(desired, cap);
    const truncatedByFraction = capped < desired;

    let top: number;
    let height = capped;
    let left = 0;
    let truncated = truncatedByFraction;

    if (layer.placement.kind === "centred") {
      top = Math.floor((region.height - height) / 2);
      left = Math.floor((region.width - width) / 2);
    } else {
      const r = placeAnchored(layer.placement, height, region);
      top = r.top;
      height = r.height;
      truncated = truncated || r.truncated;
    }

    // Step 7. Height first, because clamping the top against a height that
    // still exceeds the region leaves the bottom edge outside it (I6).
    height = Math.max(0, Math.min(height, region.height));
    if (height < capped) truncated = true;
    top = Math.max(0, Math.min(top, region.height - height));
    left = Math.max(0, Math.min(left, Math.max(0, region.width - width)));

    if (height <= 0) continue;
    // The cursor is copied, never computed: both ends are relative to the
    // layer's own origin, and C15 has no idea what a caret is (I19).
    out.push(
      Object.freeze({
        layer,
        top,
        left,
        height,
        width,
        truncated,
        ...(layer.cursor !== undefined && { cursor: layer.cursor }),
      }),
    );
  }

  return Object.freeze(out);
}
