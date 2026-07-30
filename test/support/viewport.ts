/**
 * C14 fixtures.
 *
 * The measurer is C09's real `measureSequence` rather than a fake, deliberately:
 * the defect T2.9 and T6.16 guard against is picking `Σ measure` instead, and a
 * fake that returns a made-up number cannot tell the two apart. Where a test
 * genuinely wants controlled heights it uses `rowsDoc`, which produces documents
 * whose real measured height is known.
 */

import { block } from "../../src/data/viewmodel/index.js";
import { measurable, FULL_CAPS } from "./render.js";
import { doc } from "./blocks.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Block, ViewDocument } from "../../src/data/viewmodel/index.js";

/**
 * **The registry the viewport measures through, with C11 and C12 registered.**
 *
 * `table`, `plot` and `patch` are not defaults — C11, C12 and C25 register them,
 * which is what proves C09 §3's extension path. A kit without them still
 * *measures* a table: an unregistered kind falls back to `raw`, one row, at every
 * width. So a viewport test built on the bare kit reports that expanding a row
 * changes no height, and passes — which is the inert-option trap `render.ts`
 * warns about, met twice while writing this file.
 */
const kit = measurable({
  capabilities: FULL_CAPS,
  definitions: [tableDefinition, plotDefinition] as unknown as readonly BlockDefinition<never>[],
});

/** C09's registry dispatcher — the seam C14 takes (C09 I17, C14 I1). */
export const measureSequence = (blocks: readonly Block[], width: number): number =>
  kit.registry.measureSequence(blocks, width);

/** The wrong one, for the tests that must distinguish them. */
export const sumMeasure = (blocks: readonly Block[], width: number): number =>
  blocks.reduce((n, b) => n + kit.measure(b, width), 0);

export const renderEntry = (blocks: readonly Block[], width: number): readonly string[] =>
  kit.renderToLines(
    block({ kind: "group", id: "seq", direction: "column", children: [...blocks] }),
    width,
  );

/** `n` single-row blocks, so an entry's measured height is exactly `n`. */
export function rowsDoc(n: number, id: string, gapAt = -1): ViewDocument {
  const blocks: Block[] = [];
  for (let i = 0; i < n; i += 1) {
    blocks.push(
      block({
        kind: "raw",
        id: `${id}-${i}`,
        text: `${id} row ${i}`,
        ...(i === gapAt ? { gapBefore: true } : {}),
      }),
    );
  }
  return doc({ command: id, blocks });
}

/**
 * One long line, so the entry's height depends on width — several rows narrow,
 * one row wide. The subject of I7: after widening, an anchored row offset may
 * point past the entry's new last row.
 */
export function wrappingDoc(id: string): ViewDocument {
  return doc({
    command: id,
    blocks: [
      // **`notice`, not `raw`.** A `raw` block measures one row at every width —
      // it is the escape hatch and carries its text verbatim — so a fixture built
      // from one has no width sensitivity at all, and every resize test built on
      // it passes without exercising anything. Checked rather than assumed, after
      // the first version of this helper wrapped nothing.
      block({
        kind: "notice",
        id: `${id}-0`,
        tone: "info",
        text:
          "a considerably longer line of prose that wraps across several rows at " +
          "twenty columns and occupies far fewer at two hundred",
      }),
    ],
  });
}

/** An entry that measures zero rows — an empty container (C04 §5, C14 T3.6). */
export function emptyDoc(id: string): ViewDocument {
  return doc({
    command: id,
    blocks: [block({ kind: "group", id, direction: "column", children: [] })],
  });
}

/** Width used throughout: wide enough that `rowsDoc`'s lines never wrap. */
export const W = 60;
