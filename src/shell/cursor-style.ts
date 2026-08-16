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

/**
 * Milliseconds of no input before a declared-blinking cursor starts blinking
 * (C22 I64, §6f, roadmap entry 45).
 *
 * **Unmeasured, and recorded as unmeasured so the next person re-measures
 * rather than inherits.** No terminal offers *steady while typing*, so there is
 * no prior art to copy and no figure this was taken from. The reasoning behind
 * the value, which is what a re-measurement would test:
 *
 *   - **Long enough that a pause between words does not start it.** Typing
 *     rhythm puts most inter-key gaps under 300 ms, and a cursor that flickers
 *     mid-sentence is worse than one that never stops.
 *   - **Short enough that a deliberate stop shows within one beat.** Past about
 *     a second the cursor reads as broken rather than idle.
 *   - It is **not** the terminal's own blink period, which is roughly 530 ms
 *     from the VT100 and is the period of the flashing rather than a delay
 *     before it. The two being close is a coincidence worth naming, because the
 *     next reader will assume one was derived from the other.
 *
 * What would settle it is watching people type — which is the measurement, and
 * it has not been made.
 */
export const CURSOR_BLINK_MS = 600;

/**
 * The state machine, as a function of *how long since the last key* (I64).
 *
 * **Steady while typing, blinking once idle**, and it only ever *removes*
 * blink: a style declared steady is never made to blink, because the
 * declaration is the app's answer and this is a refinement of it rather than a
 * second opinion.
 *
 * **A `null` style is returned untouched, which is the boundary the shape half
 * already ruled**: a target that declares nothing must emit nothing, and a
 * state machine gives that a second way to go wrong. Nothing here may invent a
 * shape in order to have something to make steady — shape and blink are one
 * wire parameter, so *steady* is unsayable without choosing a shape.
 */
export function steadyWhileTyping(
  style: CursorStyle | null,
  idle: boolean,
): CursorStyle | null {
  if (style === null || !style.blink) return style;
  return idle ? style : { shape: style.shape, blink: false };
}

/**
 * Whether any declared style blinks at all (I64).
 *
 * **The idle edge is armed only where something can change on it.** A wake
 * arming on every keystroke costs one composed frame per typing pause, in every
 * application, including the ones that declare no cursor at all — and the frame
 * would be a no-op, because the resolution emits nothing. The spinner arms
 * unconditionally on the argument that it is cheap; the difference is that the
 * spinner's wake follows a *request* and this one would follow every keystroke.
 */
export function anyBlinking(config: CursorConfig | undefined): boolean {
  if (config?.fallback?.blink === true) return true;
  return Object.values(config?.targets ?? {}).some((s) => s?.blink === true);
}
