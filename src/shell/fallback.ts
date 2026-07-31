/**
 * C22 §4 — the too-small render (I9).
 *
 * **No layout engine, and no block registry.** It exists for terminals where
 * the layout engine cannot produce a sane answer, so reaching for one is
 * reaching for the thing that does not work here. Yoga has no defined behaviour
 * below its minimums, and a block renderer measures against a width that cannot
 * hold its own chrome.
 *
 * The failure this guards is invisible in the passing case, which is why T3.8
 * spies rather than eyeballs: in any test where a registry happens to be
 * constructed — which is every test of a working session — a fallback that
 * calls it renders perfectly. It breaks only in the terminals it exists for,
 * and only for the user.
 *
 * **It takes its writer** (§8b). Two sinks, and the difference is not cosmetic:
 *
 *   - At launch the size gate fails *before* step 5 of startup, so the terminal
 *     was never acquired and there is no alternate screen — this writes to the
 *     primary one, directly.
 *   - Mid-session the alternate screen is up, so it goes through the scheduler
 *     or the next frame paints over it.
 *
 * A renderer that reached for a writer would have to know which, and would be
 * wrong in one of the two.
 */

import { cells } from "../presentation/text.js";
import { MIN_COLUMNS, MIN_ROWS } from "./config.js";
import type { TerminalSize } from "../terminal/lifecycle.js";

export type Sink = (s: string) => void;

/** Below either bound the layout engine has no defined behaviour (§4). */
export function tooSmall(size: TerminalSize): boolean {
  return size.columns < MIN_COLUMNS || size.rows < MIN_ROWS;
}

/**
 * Hard truncation at the cell boundary, not at a code unit (`cells()`, never
 * `.length`). At 20 columns the difference is a wrapped line, and a wrapped
 * line scrolls whatever screen this lands on.
 *
 * **Exported because the fallback's own strings cannot exercise it.** Every
 * line below is ASCII by design — this runs where the capability record may say
 * nothing is supported — so `.length` and `cells()` agree on all of them, and a
 * mutation swapping one for the other survives every assertion about the
 * rendered output. That is a finding about the fixture, not a licence: the rule
 * is about the class of mistake, and the unit that can be wrong about it is
 * this function. It is tested directly, against a wide character.
 */
export function fitCells(text: string, width: number): string {
  if (cells(text) <= width) return text;

  let out = "";
  for (const ch of text) {
    if (cells(out) + cells(ch) > width) break;
    out += ch;
  }
  return out;
}

/**
 * Three lines, centred vertically if there is room, plain text throughout.
 *
 * No colour: C10 resolves tones against a capability record, and this runs in
 * terminals whose record may say nothing is supported. No box drawing, for the
 * same reason. What it must do is be legible at 20 x 4.
 */
export function fallbackLines(size: TerminalSize): readonly string[] {
  const lines = [
    fitCells(`Terminal too small`, size.columns),
    fitCells(`${String(size.columns)}x${String(size.rows)}`, size.columns),
    fitCells(`Needs ${String(MIN_COLUMNS)}x${String(MIN_ROWS)}`, size.columns),
  ];

  // Only as many rows as there are. A three-line message in a two-row terminal
  // scrolls, and scrolling is the thing being avoided.
  return Object.freeze(lines.slice(0, Math.max(0, size.rows)));
}

/**
 * Draw, through whichever sink the caller owns.
 *
 * `\r\n` rather than `\n`: at launch the terminal is not in raw mode yet and at
 * mid-session it is, and only the pair is correct in both. A bare `\n` in raw
 * mode moves down without returning, so line two starts under the end of line
 * one — which is the staircase, and it is the fallback's whole job to be
 * readable when nothing else is.
 *
 * **Nothing at all when there are no rows.** A terminal reporting zero rows is
 * degenerate but reachable — a detached pane, a resize caught mid-flight — and
 * writing a lone `\r\n` into it scrolls the one thing that cannot afford to
 * scroll. `write` is not called, rather than called with an empty string: a
 * sink that logs its calls should see none.
 */
export function drawFallback(size: TerminalSize, write: Sink): void {
  const lines = fallbackLines(size);
  if (lines.length === 0) return;
  write(`${lines.join("\r\n")}\r\n`);
}
