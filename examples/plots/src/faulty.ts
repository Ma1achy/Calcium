/**
 * A block kind whose renderer throws — **the only way to see the ladder above two
 * rows** (C09 I31, C24 §4b).
 *
 * The framework draws a `status` from three places, and two of them are a live
 * part's defaults at height **1** and **2**. Those numbers are a frame read
 * rather than an arithmetic (F234, F235): both boxes land inside `b.live`'s own
 * panel, so three rows spend one on a second border inside the first. **So no
 * `b.live` failure can ever show the border, the padding or the ` ERROR ` tag.**
 *
 * The third place can. `registry.ts`'s containment boundary draws at **exactly
 * the height the failed block committed** (C09 I11) — `#errorBlock(text,
 * committed.rows, ctx)` — so a `rule` that throws gets one row and a plot-sized
 * block gets the full figure. Reaching it needs a definition that throws, and
 * `TuiConfig.blocks` is how a consumer supplies one.
 *
 * **Not a test double.** This is the affordance a real app uses to register its
 * own kind; the demo registers one that fails on purpose because the subject is
 * what the framework does about it.
 */
import type { Block, BlockDefinition } from "@fmx/calcium";

/** The block this kind renders — a height, and the reason it will not draw. */
export type Faulty = Readonly<{ kind: "faulty"; id: string; height: number; why: string }>;

/**
 * **`measure` answers and `render` throws, which is the split that matters.**
 *
 * A kind whose *measure* throws is caught too, and the boundary has no committed
 * height to draw at — it asks for one row and reports the rows a fuller box would
 * have needed. This one commits, so the box arrives at the size the layout
 * already promised and C09 I1's divergence stays closed: the frame draws the rows
 * `measure` said, whichever way the render went.
 */
export const faultyDefinition: BlockDefinition = {
  kind: "faulty",
  measure: (block) => (block as unknown as Faulty).height,
  render: (block) => {
    throw new Error((block as unknown as Faulty).why);
  },
};

/**
 * One block, at the height whose rung it is meant to show.
 *
 * **The two casts are the finding, not the workaround** (F405). `validateDocument`
 * says so in its own words — *an unknown kind is not an error: the union is open
 * and an app registers kinds through C09* — and `TuiConfig.blocks` takes the
 * definitions. So the mechanism is real and the **types** do not reach it:
 * `BlockDefinition<B extends Block>` bounds a definition by the closed union, and
 * a consumer's block is not in it, so the block cannot enter a document and the
 * definition cannot be parameterised by it.
 *
 * The same shape as the rest of this arc — a capability the runtime has and the
 * published surface cannot express — and recorded rather than fixed here, because
 * widening `Block` decides how `childBlocksOf` walks an app's kind and whether
 * measurement conformance binds it. That is a ruling, not an edit.
 */
export const faulty = (id: string, height: number, why: string): Block =>
  Object.freeze({ kind: "faulty", id, height, why }) as unknown as Block;
