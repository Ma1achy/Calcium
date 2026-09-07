/**
 * The categorical cycle — eight slots, indexed alike by every reader (C10 I37).
 *
 * **Moved here from `plot/marks.ts`, and moved rather than copied.** A `palette`
 * ramp needs the cycle from C09, and a slot table is this component's: two
 * components read it now, and a ramp resolver reaching into the plot arm for a
 * palette would make an ink depend on a chart. (The first reason written down —
 * that C09 could not import C12 without a cycle — was disproved by C10 T2.30:
 * `kinds/image.ts` already imports `plot/` and the file graph stayed acyclic.)
 * `marks.ts` re-exports it so no plot call site changes, and there is one copy
 * because F382 is the measured record of what two copies of `refOf` did — a
 * legend swatch in one colour and the line it named in another.
 *
 * **A ladder of eight**, matching C12's `CATEGORY_LIMIT`, so a mark exists for
 * every category the palette admits and the two ladders index alike: category
 * *i* is `CATEGORY_REFS[i]` and `markOf(i)` together.
 */
import type { ColourRef } from "./types.js";

export const CATEGORY_REFS: readonly ColourRef[] = Object.freeze([
  "categorical.c1",
  "categorical.c2",
  "categorical.c3",
  "categorical.c4",
  "categorical.c5",
  "categorical.c6",
  "categorical.c7",
  "categorical.c8",
]);

/** The slot for category `index`, cycling past eight (C10 I37, C12 I29). */
export function refOf(index: number): ColourRef {
  return CATEGORY_REFS[index % CATEGORY_REFS.length] ?? "categorical.c1"; // cells-ok — a palette size
}
