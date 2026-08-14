/**
 * Which cursor shape the focused thing wants (C22 I63, §6f, roadmap entry 45).
 *
 * **The style keys on the focus target and the position keys on the layer, and
 * they are not the same partition.** `FOCUS_ORDER` has seven members and
 * exactly two — `overlay` and `pushedView`, the two `kind`s of `overlayTop` —
 * are layers. The other five have no `Placed` at all, and the prompt, which is
 * the entry's own example of a target wanting its own shape, is one of them. So
 * a `cursorStyle` on `Layer` would cover two-sevenths of its subject while
 * reading as total.
 *
 * `activeTarget` answers on every dispatch and a layer does not, which is what
 * makes the target the key that is always defined. Position stays exactly where
 * C15 put it: a box's geometry is the box's, and a style is a property of what
 * kind of interaction is happening.
 *
 * **Two flat levels and no third.** The target's entry, then the fallback, and
 * the end is `null` — the terminal's *configured* default, which is the user's
 * own setting. A chain with a third link would need a parent, and `FOCUS_ORDER`
 * is a priority list rather than a tree.
 */

import type { CursorStyle } from "../terminal/escapes.js";
import type { FocusTarget } from "../interaction/router/types.js";

/**
 * The declaration, taken **structurally** rather than as a published type.
 *
 * `focus.ts`'s argument applied a third time: `FocusInputs` and `PlacedElement`
 * take their shapes by structure so that purity is a property of the signature.
 * Here the reason is narrower and just as good — `TuiConfig.cursor` is the one
 * declaration, and a second exported type beside it would be two records of one
 * shape, published, with only one of them ever filled in.
 *
 * **MG24 is what said so**, by reporting the exported version as a member with
 * no consumer. It was right: an app fills this in, and nothing in `src/` does.
 */
type CursorConfig = Readonly<{
  fallback?: CursorStyle | null;
  targets?: Partial<Record<FocusTarget, CursorStyle | null>>;
}>;

/**
 * The style for a target, or `null` for *the terminal's own*.
 *
 * **A declared `null` is an answer and not an absence**, which is why this reads
 * the key rather than the value: `targets: { prompt: null }` says *leave the
 * prompt's cursor alone* and must not fall through to a fallback that would
 * override it. `??` would have conflated the two, and the two are the whole of
 * what a per-target override is for.
 */
export function cursorStyleFor(
  target: FocusTarget,
  config: CursorConfig | undefined,
): CursorStyle | null {
  const targets = config?.targets;
  if (targets !== undefined && target in targets) return targets[target] ?? null;
  return config?.fallback ?? null;
}
