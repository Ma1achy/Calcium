/**
 * The layer vocabulary.
 *
 * C15 — see spec. One mechanism for overlays and pushed views, differing in
 * what they cover and whether they take letter keys (A01 D4).
 *
 * The shape of this file is the spec's central finding: **C15 holds no
 * information about what a layer refers to.** No entry ids, no anchors into a
 * transcript, no natural width, no scroll offset. Every one of those belongs to
 * whoever raised the layer, and each was written here first as a duty this
 * component could not discharge.
 */

import type { Block } from "./deps.js";

/**
 * Where a layer sits.
 *
 * `anchored` carries a **span**, not a row. A prompt two rows tall has no
 * single row that places a menu correctly — anchoring on its top and preferring
 * `below` starts the menu on its second line, anchoring on its bottom and
 * preferring `above` ends on its first — and both produce placements whose
 * every number is self-consistent (I17).
 */
export type Placement =
  | Readonly<{
      kind: "anchored";
      /** First row of the anchor, within the region. */
      row: number;
      /** The anchor's own extent. Defaults to 1, which is the special case. */
      rows?: number;
      prefer: "above" | "below";
    }>
  | Readonly<{ kind: "centred" }>
  | Readonly<{ kind: "fill" }>;

export type Layer = Readonly<{
  id: string;
  kind: "overlay" | "view";
  placement: Placement;
  /**
   * `Block[]`, never React (I4) — so a layer is themed, degrades to ASCII and
   * measures through the same registry as the transcript.
   *
   * For a **view** this is already the region's worth: the owner windows it and
   * owns its own scroll (§4). S12 holds fifty thousand log lines behind this
   * field, and C15 sees the visible ones.
   */
  content: readonly Block[];
  /** `false` = must be resolved, not escaped. Never changes (I14). */
  dismissable: boolean;
  /**
   * Requested width in cells; absent means the region's.
   *
   * Declared rather than measured because `BlockRegistry` answers height at a
   * width and never the reverse (I16). C19 knows its longest candidate; this
   * component knows the region and nothing else.
   */
  width?: number;
  /** Overlays; default 0.5. */
  maxHeightFraction?: number;
}>;

export type Placed = Readonly<{
  layer: Layer;
  /** Absolute row within the region. */
  top: number;
  /**
   * Absolute column within it.
   *
   * Non-zero only for `centred`, and present because C16 hit-tests a mouse
   * event against a layer's whole rectangle (C16 §4). Without it a centred
   * confirm's horizontal extent is unrecoverable.
   */
  left: number;
  height: number;
  width: number;
  truncated: boolean;
}>;

/**
 * `anchorEvicted` is supplied by the caller, not detected here (I10).
 *
 * C15 subscribes to nothing and holds no entry ids, so it cannot notice an
 * eviction — and the requirement was never that it should. What L4 needs is to
 * tell a user's cancellation from a referent that has gone.
 */
export type DismissReason = "explicit" | "anchorEvicted";

/**
 * What `update` may change.
 *
 * **`dismissable` is deliberately absent.** A layer that becomes escapable
 * partway through its life makes C16's Ctrl-C ladder depend on when it looked:
 * the same confirm answers "may I be dismissed?" differently on two consecutive
 * keystrokes. A layer that needs to change what `Esc` means to it is two
 * layers (I14).
 */
export type LayerUpdate = Partial<Pick<Layer, "content" | "placement" | "width">>;

export type OverlayChange =
  | Readonly<{ kind: "push"; id: string; layerKind: "overlay" | "view" }>
  | Readonly<{ kind: "pop"; id: string; layerKind: "overlay" | "view" }>
  | Readonly<{ kind: "content"; id: string }>
  | Readonly<{ kind: "dismiss"; id: string; reason: DismissReason }>;

export type Region = Readonly<{ width: number; height: number }>;

export interface OverlayManager {
  push(layer: Layer): Disposable;
  /**
   * The top layer, if it is dismissable.
   *
   * **Inspects only the top.** It does not search downwards for the first
   * dismissable layer: under a confirm raised over a completion menu, the
   * searching version pops the menu — answering nothing and closing something
   * the user was not looking at (I3).
   *
   * `null` covers two cases, and C16's Ctrl-C ladder needs them apart. It reads
   * `top` first: `null` falls through to the next rung, `dismissable: false`
   * is a no-op. Branching on this return value instead pops the pushed view
   * beneath an unanswered confirm.
   */
  pop(): Layer | null;
  dismiss(id: string, reason?: DismissReason): void;
  /** `false` if no layer has that id. It never pushes (I14). */
  update(id: string, next: LayerUpdate): boolean;
  layout(region: Region): readonly Placed[];
  subscribe(cb: (change: OverlayChange) => void): Disposable;

  /** Bottom-first, and sorted: every overlay above every view (I2). */
  readonly stack: readonly Layer[];
  readonly top: Layer | null;
  readonly hasView: boolean;
}

export type OverlayOptions = Readonly<{ registry: BlockRegistryLike }>;

/** The half of C09 that C15 uses. Narrow because the seam should be. */
export type BlockRegistryLike = Readonly<{
  measureSequence(blocks: readonly Block[], width: number): number;
}>;

export class OverlayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverlayError";
  }
}
