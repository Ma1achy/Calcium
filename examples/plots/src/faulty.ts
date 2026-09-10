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
import type { BlockDefinition } from "@fmx/calcium";

/** The block this kind renders — a height, and the reason it will not draw. */
export type Faulty = Readonly<{ kind: "faulty"; id: string; height: number; why: string }>;

/**
 * **The declaration that puts this kind in the union** (C04 I119, F405).
 *
 * The runtime accepted an app's kind from F1 and the types could not express
 * one, so everything below took `as unknown as` — three of them, on the
 * definition's two parameters and on the constructor's return. The interface is
 * published beside `Block`, augmentation merges against `@fmx/calcium`'s own
 * entry point, and `Block` is `BlockKinds[keyof BlockKinds]`, so declaring the
 * member is the whole of it.
 *
 * **This file is the consumer that proves it.** A framework cannot check its
 * own extension point from inside; the casts were the finding kept in the tree,
 * and their absence is what says the finding closed.
 */
declare module "@fmx/calcium" {
  interface BlockKinds {
    faulty: Faulty;
  }
}

/**
 * **`measure` answers and `render` throws, which is the split that matters.**
 *
 * A kind whose *measure* throws is caught too, and the boundary has no committed
 * height to draw at — it asks for one row and reports the rows a fuller box would
 * have needed. This one commits, so the box arrives at the size the layout
 * already promised and C09 I1's divergence stays closed: the frame draws the rows
 * `measure` said, whichever way the render went.
 */
export const faultyDefinition: BlockDefinition<Faulty> = {
  kind: "faulty",
  measure: (block) => block.height,
  render: (block) => {
    throw new Error(block.why);
  },
};

/**
 * One block, at the height whose rung it is meant to show.
 *
 * **The casts were the finding and they are gone** (F405, C04 I119). There were
 * three, not the two the finding counted — `measure`'s, `render`'s and this
 * constructor's return. `validateDocument` always said the union was open in its
 * own words; what changed is that `Block` is now `BlockKinds[keyof BlockKinds]`,
 * so a definition can be parameterised by the app's own block and the block can
 * enter a document without being lied about.
 *
 * The three questions that held it open were each already answered at their own
 * site, citing F1: `validateDocument` skips an unknown kind, `childBlocksOf`
 * refuses to descend into an app kind's `children`, and `uncoveredKinds` takes
 * `string` so app kinds are counted. C04 I119 is the type-level half.
 */
export const faulty = (id: string, height: number, why: string): Faulty =>
  Object.freeze({ kind: "faulty", id, height, why });
