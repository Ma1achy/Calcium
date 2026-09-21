/**
 * Frames — a ring, a stack within a tab, and a layer stack within a frame
 * (C29 §7g, I23).
 *
 * **Three shapes, three types, and that is the whole point.** `INTERACTION.md`
 * §2 corrected this error once already, where nesting, modality and parallelism
 * were all wearing one ladder. A ring and a stack read alike at every call site
 * — both hold a list and both have a current member — and collapsing them is
 * what makes `esc` ambiguous: it must pop a stack and must never leave a ring.
 * The types are what keep the two questions apart, so the row that catches a
 * collapse is about the type and not about a behaviour.
 */
import type { PlacedFloat } from "./types.js";

/**
 * A layer within one frame — C29 §7g, I23.
 *
 * `base` is the flow and is not a member here: it is what the layers are drawn
 * over. `debug` is a member of every frame's stack and outlives a switch, which
 * is the one exception §10 states and the reason it is a name rather than a
 * position.
 */
export type LayerName = "float" | "overlay" | "debug";

export type Layer = Readonly<{ name: LayerName; floats: readonly PlacedFloat[] }>;

/**
 * One frame: a base and the layers over it.
 *
 * **Each frame owns its own layer stack**, which is what makes tabs work and is
 * free once the nesting is right — a question open in tab B does not block tab
 * A, switching dismisses nothing and pops nothing, and a float in tab B is
 * clipped by tab B's containers rather than by the visible frame's.
 */
export type Frame = Readonly<{ id: string; layers: readonly Layer[] }>;

/**
 * A stack of frames **within one tab** — a view over its base; `esc` pops.
 *
 * `push`/`pop` and no cycle. The one thing it shares with a ring is that it has
 * a current member, and that is exactly the resemblance that makes collapsing
 * them tempting.
 */
export type FrameStack = Readonly<{ frames: readonly Frame[] }>;

export const pushFrame = (stack: FrameStack, frame: Frame): FrameStack =>
  Object.freeze({ frames: [...stack.frames, frame] });

/** The base is never popped: a tab with no frame is not a state this has. */
export const popFrame = (stack: FrameStack): FrameStack =>
  stack.frames.length <= 1 ? stack : Object.freeze({ frames: stack.frames.slice(0, -1) }); // cells-ok — a frame count

export const topFrame = (stack: FrameStack): Frame | undefined => stack.frames.at(-1);

/**
 * The **ring** of tabs — main and its subagents. `⌃⇥` cycles sideways.
 *
 * **No `push`, no `pop`, no top.** Nothing is above anything: tabs are parallel
 * and equal, which is why `esc` never leaves one and why this type gives it
 * nowhere to go. `at` is a position in a cycle and not a depth.
 */
export type FrameRing = Readonly<{ tabs: readonly FrameStack[]; at: number }>;

const wrap = (n: number, len: number): number => ((n % len) + len) % len; // cells-ok — a tab count

export const nextTab = (ring: FrameRing): FrameRing =>
  ring.tabs.length === 0 ? ring : Object.freeze({ tabs: ring.tabs, at: wrap(ring.at + 1, ring.tabs.length) }); // cells-ok — a tab count

export const previousTab = (ring: FrameRing): FrameRing =>
  ring.tabs.length === 0 ? ring : Object.freeze({ tabs: ring.tabs, at: wrap(ring.at - 1, ring.tabs.length) }); // cells-ok — a tab count

/** The stack the ring is currently on — a switch changes this and nothing else. */
export const currentTab = (ring: FrameRing): FrameStack | undefined => ring.tabs[ring.at];

/**
 * What one frame composites, bottom-first — C29 §7g, I23.
 *
 * **Only one frame composites.** Layers blend, and frames do not: the frame you
 * are in is the only one drawn, so a frame switch is a **full repaint** and the
 * frame diff sees every cell. That is the honest cost of `⌃⇥`, it is bounded by
 * the region, and it is stated here so nobody reports the switch as slow and
 * goes looking for a bug.
 */
export function compositeOf(frame: Frame): readonly PlacedFloat[] {
  const rank: Record<LayerName, number> = { float: 0, overlay: 1, debug: 2 };
  return [...frame.layers]
    .sort((a, b) => rank[a.name] - rank[b.name])
    .flatMap((layer) => layer.floats);
}
