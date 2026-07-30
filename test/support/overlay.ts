/**
 * C15 fixtures.
 *
 * The measurer is C09's real `measureSequence`, as C14's is and for the same
 * reason: a layer's height is the thing every placement rule is a function of,
 * and a fake returning a made-up number cannot distinguish a placement bug from
 * a measurement one.
 *
 * **Every fixture here has a control asserting its subject responds** — see
 * `README.md`'s third rule. `rowsLayer(8)` is worth nothing to a flip test
 * unless eight really is taller than the room below the anchor, and a fixture
 * that fits either way turns T3.5 into an assertion about nothing whose numbers
 * all agree.
 */

import { block } from "../../src/data/viewmodel/index.js";
import { measurable, FULL_CAPS } from "./render.js";
import { place } from "../../src/viewport/overlay/index.js";
import type { Layer, Placed, Region } from "../../src/viewport/overlay/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const kit = measurable({ capabilities: FULL_CAPS });

export const registry = {
  measureSequence: (blocks: readonly Block[], width: number): number =>
    kit.registry.measureSequence(blocks, width),
};

/** `n` single-row blocks, so a layer's measured height is exactly `n`. */
export function rows(n: number, id: string): readonly Block[] {
  const out: Block[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(block({ kind: "raw", id: `${id}-${i}`, text: `${id} row ${i}` }));
  }
  return out;
}

/**
 * An overlay of `n` rows anchored to a span.
 *
 * `rows` defaults to 1 here as it does in the spec, so a test that means a
 * multi-row anchor has to say so — which is the whole of I17.
 */
export function anchored(
  id: string,
  height: number,
  at: Readonly<{ row: number; rows?: number; prefer: "above" | "below" }>,
  opts: Readonly<{ width?: number; dismissable?: boolean }> = {},
): Layer {
  return {
    id,
    kind: "overlay",
    placement: { kind: "anchored", row: at.row, prefer: at.prefer, ...(at.rows !== undefined && { rows: at.rows }) },
    content: rows(height, id),
    dismissable: opts.dismissable ?? true,
    ...(opts.width !== undefined && { width: opts.width }),
  };
}

export function centred(
  id: string,
  height: number,
  opts: Readonly<{ width?: number; dismissable?: boolean }> = {},
): Layer {
  return {
    id,
    kind: "overlay",
    placement: { kind: "centred" },
    content: rows(height, id),
    dismissable: opts.dismissable ?? true,
    ...(opts.width !== undefined && { width: opts.width }),
  };
}

export function view(id: string, height = 3): Layer {
  return {
    id,
    kind: "view",
    placement: { kind: "fill" },
    content: rows(height, id),
    dismissable: true,
  };
}

/**
 * A layer whose measured height genuinely depends on its width — the subject of
 * I16, and inert if built from `raw`, which carries its text verbatim and
 * measures one row at every width.
 */
export function wrappingLayer(id: string, width: number): Layer {
  return {
    id,
    kind: "overlay",
    placement: { kind: "centred" },
    width,
    content: [
      block({
        kind: "notice",
        id: `${id}-0`,
        tone: "info",
        text:
          "a considerably longer line of prose that wraps across several rows in " +
          "a narrow confirm and occupies far fewer across the whole region",
      }),
    ],
    dismissable: true,
  };
}

export const REGION: Region = Object.freeze({ width: 60, height: 20 });

export const placeIn = (stack: readonly Layer[], region: Region = REGION): readonly Placed[] =>
  place(stack, region, registry);

/**
 * The frame a placement describes, as rows of text.
 *
 * Numbers agreeing with each other is exactly what the two-row-prompt defect
 * looks like from inside an assertion (I17), so the tests that care read this.
 * `.` is region background, a layer's rows carry its id.
 */
export function frame(placed: readonly Placed[], region: Region = REGION): readonly string[] {
  const grid = Array.from({ length: region.height }, () => Array<string>(region.width).fill("."));
  for (const p of placed) {
    const mark = p.layer.id[0] ?? "?";
    for (let r = p.top; r < p.top + p.height; r += 1) {
      for (let c = p.left; c < p.left + p.width; c += 1) {
        if (r >= 0 && r < region.height && c >= 0 && c < region.width) grid[r]![c] = mark;
      }
    }
  }
  return grid.map((r) => r.join(""));
}

/** Rows a placement occupies, for the tests that assert non-overlap. */
export const rowsOf = (p: Placed): readonly number[] =>
  Array.from({ length: p.height }, (_, i) => p.top + i);
