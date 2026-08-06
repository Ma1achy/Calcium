/**
 * C09 §2 — the registry's vocabulary.
 *
 * `Measure` comes from C04, which owns the measurement contract; C09 owns the
 * implementations that satisfy it and the registry that pairs each with a
 * renderer (C09 §1).
 */
import type { ReactElement } from "react";
import type { Action, Block, Measure, MeasureFn } from "../../data/viewmodel/index.js";
import type { ResolvedTheme } from "../theme/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/** Which block, and which row within it, currently holds focus. */
export type FocusState = Readonly<{
  blockId: string;
  /** null — the block itself is focused, rather than a row inside it. */
  rowId: string | null;
}>;

/**
 * Everything a renderer may read. Nothing else: no environment (I3), no clock
 * (A03 SS1), no theme lookup of its own.
 *
 * `measureChild` and `renderChild` are A02 Seam 1 on the render side — the
 * registry passes itself for both, so a container composes children whose kind
 * it does not know without importing the registry (I7).
 */
export type RenderContext = Readonly<{
  width: number;
  theme: ResolvedTheme;
  capabilities: TerminalCapabilities;
  focus: FocusState | null;
  /**
   * A monotonic counter, incremented by C03's spinner commit. A renderer
   * computes `frames[tick % frames.length]`; nothing else reads it, and
   * `measure` never receives it at all (I8) — animation changes appearance,
   * never geometry.
   */
  tick: number;
  onAction: (action: Action) => void;
  measureChild: MeasureFn;
  renderChild: (block: Block, width: number) => ReactElement;
}>;

/**
 * What a *caller* of the registry supplies — everything a renderer may read
 * except the two fields the registry owns.
 *
 * **The registry overwrites `measureChild` and `renderChild` unconditionally**
 * (`registry.ts`, `{ ...ctx, measureChild: this.measure, renderChild: … }`), so
 * a caller's values were discarded on every call. The type demanded them anyway,
 * and the only way to satisfy it was to write something untrue: `render-lines.ts`
 * supplied `registry.measure` for one and a stub that **throws if called** for
 * the other, with a comment explaining that the registry replaces both and *"a
 * caller should not have to know that."*
 *
 * **The fix is a narrower type, not a wider one.** Making them optional would
 * leave them discarded; removing them from the construction boundary means
 * supplying one fails to compile rather than failing to matter. Second instance
 * of F58b's shape — an adapter computes ten `meta` fields and the registry
 * honours three — which is what says it generalises past one surface.
 * FINDINGS F85.
 */
export type RenderContextInput = Omit<RenderContext, "measureChild" | "renderChild">;

export interface BlockDefinition<B extends Block = Block> {
  kind: string;
  measure: Measure<B>;
  render: (block: B, ctx: RenderContext) => ReactElement;
}

export interface BlockRegistry {
  register(definition: BlockDefinition): void;
  get(kind: string): BlockDefinition | undefined;
  seal(): void;
  measure(block: Block, width: number): number;
  render(block: Block, ctx: RenderContextInput): ReactElement;
  /** A run of blocks laid out down the screen, `gapBefore` included (C04 §3a). */
  measureSequence(blocks: readonly Block[], width: number): number;
  renderSequence(blocks: readonly Block[], ctx: RenderContextInput): ReactElement;
  readonly kinds: readonly string[];
  readonly sealed: boolean;
}
