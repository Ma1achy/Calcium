/**
 * What `b.live` declared, readable from the side that declared it (C24 §7, I24).
 *
 * **`b.live` records its `LiveSpec` beside the document rather than inside it**
 * — `builders/live.ts` says why the association is held there — and nothing read
 * it back. So a consumer could declare a refreshing part and had no way to
 * exercise the `fetch` or the `render` it supplied without a shell, a transport
 * and a clock. The reference app worked around it by exporting its own tick,
 * which is an app building a testing affordance the framework withheld (F28).
 *
 * **On this entry rather than the runtime one, and the distinction is the
 * finding's own.** F28's cost is to testing by its own text. A *production*
 * consumer reading back what it just declared holds a second record of the
 * document, which is the class this repository removes; a test reading it is
 * exercising the thing it declared.
 *
 * **A pushed view's parts are reachable through the same call**, because the
 * association is per block and a view's blocks are a document's blocks. Nothing
 * here knows about routes.
 */
import { liveDeclarations } from "../shell/builders/live.js";
import type { LiveSpec } from "../shell/builders/types.js";
import type { Block, ViewDocument } from "../data/viewmodel/index.js";

export type LivePart = Readonly<{
  /** The `panel` `b.live` built — the block a refresh replaces (C23 I34). */
  block: Block;
  /** Exactly what the declarer supplied. */
  spec: LiveSpec;
}>;

/**
 * Every live part declared anywhere in `doc`, in document order.
 *
 * `render` takes a `ProducerContext` (C24 §5); build one, or take the shape a
 * fixture supplies. A part's `height` is `null` on every route (C07 §3a D).
 */
export function liveParts(doc: ViewDocument): readonly LivePart[] {
  return liveDeclarations(doc.blocks).map((d) => Object.freeze({ block: d.block, spec: d.spec }));
}
