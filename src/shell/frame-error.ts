/**
 * C22 — the frame's refusal and its one measure, as a leaf.
 *
 * **Here because `paint.ts` and `composite.ts` each needed the other** (A03
 * MG2). `paint` composes through `composite`, and `composite` raised `paint`'s
 * `FrameError` and squared its rows with `paint`'s `exact` — a cycle inside L4
 * that ESM's hoisting let work, which is the shape A02 §1 forbids because it
 * works until the day an initialiser is read before it runs. Neither symbol
 * depends on anything in either file, so the cycle was one import placed in
 * the wrong module rather than a real mutual dependency.
 */
import { fitStyled } from "../presentation/text.js";
import { SGR_RESET } from "../terminal/escapes.js";

export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameError";
  }
}

/**
 * Pad or truncate to exactly `width` **display** cells.
 *
 * **Both directions matter and only one is obvious.** A short line leaves the
 * previous frame's cells showing at the end of the row, which reads as
 * corruption; a long one wraps, which *is* corruption.
 *
 * **`displayCells`, not `cells`, and the difference was a live defect.** These
 * lines come from Ink and carry SGR. `stripControl` drops the ESC byte and
 * keeps `[38;5;241m`, which is printable text — so `cells()` measured every
 * themed chrome row eleven cells too wide per colour change, padded to 80
 * counted-with-escapes, and left a visible row of about 38 with the previous
 * frame showing across the rest. Truncating with it would have been worse: the
 * cut lands inside an escape and the colour bleeds down every row below.
 *
 * Delegated to C09 rather than solved here — that is where display width is
 * decided, and a second answer is C09 I1's divergence in the place that moves
 * the whole frame.
 */
export function exact(text: string, width: number): string {
  return fitStyled(text, width, SGR_RESET);
}
