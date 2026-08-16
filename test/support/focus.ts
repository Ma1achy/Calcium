/**
 * Element addresses for the focus tests (C26 I10).
 *
 * **One helper rather than a literal per call site**, because the block half of
 * an address is exactly what these tests would otherwise be free to omit — and a
 * suite that spells `{ blockId: "b1", elementId: "r1" }` twenty times is a suite
 * where every row silently agrees on one block, which is the state the collision
 * defect could not be seen in.
 *
 * `blockId` is therefore a **parameter with a default and not a constant**: the
 * rows that matter are the ones where two blocks carry the same element id, and
 * a helper that could not express that would be a fixture shaped to make the
 * test pass.
 */
import type { Action } from "../../src/data/viewmodel/index.js";
import type { NavElement } from "../../src/presentation/blocks/index.js";
import type { ElementAddress } from "../../src/interaction/router/types.js";

export const addr = (elementId: string, blockId = "b1"): ElementAddress =>
  Object.freeze({ blockId, elementId });

/**
 * A placed element, as `elementsIn` returns one — the shape `resolveFocus`
 * takes structurally.
 *
 * `activate` is omitted rather than `undefined` so a row asserting *this element
 * declares nothing* is asserting about an absent member, which is the same
 * distinction `elements?` itself rests on (C09's argument for `window?`).
 */
export const placed = (
  elementId: string,
  blockId = "b1",
): Readonly<{ blockId: string; element: Readonly<{ id: string }> }> =>
  Object.freeze({ blockId, element: Object.freeze({ id: elementId }) });

/**
 * A one-row `NavElement` at a given offset, for suites that need the full shape
 * rather than the address (C26 §5).
 *
 * `activate` is spread in only when given, so an element that declares nothing
 * has **no such member** rather than one set to `undefined` — the distinction
 * `rowActivate` reads, and the one a `{ activate: undefined }` fixture would
 * quietly erase.
 */
export const navElement = (
  id: string,
  row: number,
  activate?: Action,
  /**
   * The element's source text (C26 §5c).
   *
   * **Deliberately unlike anything the row would render**, so a copy taken from
   * the paint cannot pass a row that asserts this: the point of semantic copy
   * is that the two differ.
   */
  copy?: string,
): NavElement =>
  Object.freeze({
    id,
    level: "row" as const,
    rows: Object.freeze({ from: row, to: row + 1 }),
    cols: Object.freeze({ from: 0, to: 80 }),
    ...(activate === undefined ? {} : { activate }),
    ...(copy === undefined ? {} : { copy }),
  });
