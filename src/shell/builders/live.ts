/**
 * How a `b.live` declaration reaches C23 (C24 §5, C23 §3b).
 *
 * **A block is data and a declaration is not**, and that gap is real rather than
 * an oversight in either spec. C23 §3b says *a transcript entry may declare
 * intervals*; C04 says a `ViewDocument` is a value — serialisable, comparable,
 * safe to hold — and `fetch` is a closure. So the panel `b.live` returns cannot
 * carry its own behaviour, and C23 cannot recover it by reading the document.
 *
 * The association is held here instead, in a `WeakMap` keyed by the block:
 *
 *   - **The block stays pure data.** Nothing is added to `Panel`, nothing new is
 *     serialised, and C04's model is untouched — which matters because a
 *     document crosses to C13, C14 and the golden frames unchanged.
 *   - **Only the builder that made a block can declare for it.** A registry
 *     keyed by *id* would let any two parts with one id collide across entries,
 *     and would need clearing; keyed by identity there is nothing to clear and
 *     no name to collide.
 *   - **It cannot leak.** Weak by construction, so a document dropped without
 *     ever being appended takes its declarations with it.
 *
 * The alternative was a second return channel — a handler returning
 * `{doc, refresh}` — which changes every local handler's signature and C07's
 * adapter contract for a feature neither has a stake in.
 */

import type { Block } from "../../data/viewmodel/index.js";
import type { LiveSpec } from "./types.js";

const declarations = new WeakMap<Block, LiveSpec>();

export function rememberLive(panel: Block, spec: LiveSpec): void {
  declarations.set(panel, spec);
}

/**
 * Every live declaration in a document, in the order it appears.
 *
 * **Recursive, because a live part is a block and blocks nest.** S13's dashboard
 * is five panels inside a `group` (S13 commitment 2), so a walk over top-level
 * blocks alone finds none of them — which would be a dashboard that renders its
 * placeholders and never ticks, with nothing anywhere reporting a fault.
 */
export function liveDeclarations(blocks: readonly Block[]): { block: Block; spec: LiveSpec }[] {
  const found: { block: Block; spec: LiveSpec }[] = [];
  const walk = (bs: readonly Block[]): void => {
    for (const b of bs) {
      const spec = declarations.get(b);
      if (spec !== undefined) found.push({ block: b, spec });
      if (b.kind === "panel" || b.kind === "group") walk(b.children);
    }
  };
  walk(blocks);
  return found;
}
