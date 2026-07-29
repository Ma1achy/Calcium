/**
 * C09 §6 — the registry, and the two failures it contains.
 *
 * The registry is the dispatcher for both halves, and it passes **itself** as
 * `measureChild` and `ctx.renderChild` (A02 Seam 1). That is what lets `panel`
 * and `group` compose children whose kind they do not know while no kind
 * imports the registry (I7) — the layering at L1 holds because of this one
 * argument, and it is the most copied-wrong pattern in a block library.
 */
import type { ReactElement } from "react";
import { normaliseWidth } from "../../data/viewmodel/index.js";
import type { Block } from "../../data/viewmodel/index.js";
import { DEFAULT_DEFINITIONS } from "./defaults.js";
import { paint, rows, tone } from "./paint.js";
import type { BlockDefinition, BlockRegistry, RenderContext } from "./types.js";

/**
 * The definition of last resort: a registry with no `raw` at all, which is
 * reachable only through `defaults: false`. One row, saying what is missing.
 */
const MISSING: BlockDefinition = {
  kind: "raw",
  measure: () => 1,
  render: (block, ctx) =>
    rows([
      paint([
        {
          text: `[${block.kind} has no definition, and no raw fallback is registered]`,
          style: tone("error", ctx.theme, ctx.capabilities),
        },
      ]),
    ]),
};

/**
 * A registry that has been sealed cannot be registered against (I12).
 *
 * Sealing matches C05's manifest store and C07's adapter registry, and the
 * reason is measurement rather than tidiness: a kind registered mid-session
 * would let a block measured before registration differ from the same block
 * measured after, which is drift that appears only on scrollback (§6).
 */
class Registry implements BlockRegistry {
  readonly #definitions = new Map<string, BlockDefinition>();
  #sealed = false;

  constructor(definitions: readonly BlockDefinition[]) {
    for (const definition of definitions) this.#definitions.set(definition.kind, definition);
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  get kinds(): readonly string[] {
    return [...this.#definitions.keys()];
  }

  register(definition: BlockDefinition): void {
    if (this.#sealed) {
      throw new Error(
        `the block registry is sealed; ${definition.kind} cannot be registered after composition`,
      );
    }
    if (this.#definitions.has(definition.kind)) {
      // Shadowing a registered kind is rejected rather than silently accepted
      // (T3.18). An app that overrides `logs` by accident gets a frame that is
      // subtly wrong everywhere, and no way to find out why.
      throw new Error(
        `${definition.kind} is already registered; a kind is not overridden, it is named differently`,
      );
    }
    this.#definitions.set(definition.kind, definition);
  }

  get(kind: string): BlockDefinition | undefined {
    return this.#definitions.get(kind);
  }

  seal(): void {
    // Sealing twice is a no-op, not an error (T3.3). Composition roots compose.
    this.#sealed = true;
  }

  /**
   * An unregistered kind resolves to `raw` rather than throwing (I10): a
   * document referencing an unknown kind still renders, degraded.
   *
   * The block is *converted* rather than merely dispatched, because a foreign
   * block has no `text` field and `raw` reads one. Rendering the block as its
   * own JSON is the honest degradation: the content is visible, and what is
   * wrong with it is visible too. A registry with no `raw` — `defaults: false`
   * and nothing registered — falls back to nothing, and says so as a block
   * rather than as a throw.
   */
  #resolve(block: Block): Readonly<{ definition: BlockDefinition; block: Block }> {
    const held = this.#definitions.get(block.kind);
    if (held !== undefined) return { definition: held, block };

    const fallback = this.#definitions.get("raw");
    if (fallback === undefined) return { definition: MISSING, block };

    return {
      definition: fallback,
      block: { kind: "raw", id: block.id, text: JSON.stringify(block) },
    };
  }

  measure = (block: Block, width: number): number => {
    const w = normaliseWidth(width);
    try {
      const resolved = this.#resolve(block);
      return resolved.definition.measure(resolved.block, w, this.measure);
    } catch {
      // I11 — a throwing measurer is contained and the block treated as one
      // row. This protects virtualisation: C14 sums measured heights without
      // rendering, so a measurer that throws would take the viewport with it
      // (T3.14). Compute, so no retry (A02 §7 rule 2).
      return 1;
    }
  };

  render = (block: Block, ctx: RenderContext): ReactElement => {
    const width = normaliseWidth(ctx.width);
    const childContext: RenderContext = {
      ...ctx,
      width,
      measureChild: this.measure,
      renderChild: (child: Block, childWidth: number): ReactElement =>
        this.render(child, { ...ctx, width: childWidth }),
    };

    try {
      const resolved = this.#resolve(block);
      return resolved.definition.render(resolved.block, childContext);
    } catch (error) {
      // I11 — a throwing renderer is contained to its block. The rest of the
      // frame is unaffected, and the block says what happened rather than
      // vanishing, which is the difference between a visible fault and a
      // document that quietly renders short.
      const message = error instanceof Error ? error.message : String(error);
      return rows([
        paint([
          {
            text: `[${block.kind} failed to render: ${message}]`.slice(0, width), // cells-ok
            style: tone("error", childContext.theme, childContext.capabilities),
          },
        ]),
      ]);
    }
  };
}

/**
 * The registry, with the fourteen default kinds unless asked otherwise.
 *
 * `table`, `plot` and `patch` are **not** here. They register from C11, C12 and
 * C25 through this same public `register`, exactly as an app-defined kind
 * would, which is what proves the extension mechanism rather than privileging
 * it (§3). Three components rather than one matters: a single privileged
 * exception is indistinguishable from a special case.
 */
export function createBlockRegistry(opts: { defaults?: boolean } = {}): BlockRegistry {
  return new Registry(opts.defaults === false ? [] : DEFAULT_DEFINITIONS);
}
