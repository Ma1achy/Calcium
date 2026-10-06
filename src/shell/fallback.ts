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

import { glyphFor, glyphs } from "../presentation/blocks/index.js";
import { cells } from "../presentation/text.js";
import { MIN_COLUMNS, MIN_ROWS } from "./config.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
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
 * mark is one cell at either arm (C09 I48), so `.length` and `cells()` agree on
 * all of them, and a
 * mutation swapping one for the other survives every assertion about the
 * rendered output. That is a finding about the fixture, not a licence: the rule
 * is about the class of mistake, and the unit that can be wrong about it is
 * this function. It is tested directly, against a wide character.
 */
export function fitCells(text: string, width: number, ambiguous: TerminalCapabilities["ambiguousWidth"] = "narrow"): string {
  if (cells(text, ambiguous) <= width) return text;

  let out = "";
  for (const ch of text) {
    if (cells(out, ambiguous) + cells(ch, ambiguous) > width) break;
    out += ch;
  }
  return out;
}

/**
 * **A frame too small to draw, and it says which constraint** (§047): the size it
 * has and the size it needs, in the design's own two lines — `▲ 34×8` and
 * `needs 60×16` — in a box where the terminal can hold one.
 *
 * **It takes the capabilities and nothing else of the graph** (C22 I9, §4). The
 * old text was ASCII by design because it was written without a record in hand,
 * and both callers have one: the graph is constructed before the size gate is
 * read. The marks resolve at the record's rung (`▲ ×` and a box at Unicode, `! x`
 * and `+-|` at ASCII, and at `wide` too — C09 I48) and every line is measured at its `ambiguousWidth`,
 * because `▲` and `×` are ambiguous and a line one cell over wraps. **No
 * colour and no registry still**: tones need a theme, and the block registry is
 * the thing that breaks here (T3.8).
 *
 * **Three rungs, by what the terminal can hold.** A box needs four rows and its
 * own width; below that the two lines stand alone, and below two rows the size
 * alone — what it has is the part that cannot be guessed. Never more rows than
 * the terminal has, and never a line wider (a wrapped line scrolls the screen
 * this lands on).
 */
export function fallbackLines(size: TerminalSize, caps: TerminalCapabilities): readonly string[] {
  const g = glyphs(caps);
  // `×` is a prose mark and has no slot, so it takes the slot set's own rung:
  // the whole vocabulary falls to ASCII under `wide` (C09 I48), and so does it.
  const times = caps.unicode === "ascii" || caps.ambiguousWidth === "wide" ? "x" : "×";
  const width = (t: string): number => cells(t, caps.ambiguousWidth);
  const fit = (t: string): string => fitCells(t, size.columns, caps.ambiguousWidth);

  const have = `${glyphFor("warn", caps)} ${String(size.columns)}${times}${String(size.rows)}`;
  const need = `needs ${String(MIN_COLUMNS)}${times}${String(MIN_ROWS)}`;
  // **Every mark is one cell at either arm** (C09 I48), so the box is the wider
  // line plus a space either side and the two edges; the rule runs the width
  // between them.
  const inner = Math.max(width(have), width(need)) + 2;

  let lines: string[];
  if (size.rows >= 4 && inner + 2 <= size.columns) {
    const pad = (t: string): string => ` ${t}${" ".repeat(inner - 1 - width(t))}`;
    lines = [
      `${g.topLeft}${g.horizontal.repeat(inner)}${g.topRight}`,
      `${g.vertical}${pad(have)}${g.vertical}`,
      `${g.vertical}${pad(need)}${g.vertical}`,
      `${g.bottomLeft}${g.horizontal.repeat(inner)}${g.bottomRight}`,
    ];
  } else {
    lines = [fit(have), fit(need)];
  }

  // Only as many rows as there are. A box in a three-row terminal scrolls, and
  // scrolling is the thing being avoided.
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
export function drawFallback(size: TerminalSize, caps: TerminalCapabilities, write: Sink): void {
  const lines = fallbackLines(size, caps);
  if (lines.length === 0) return;
  write(`${lines.join("\r\n")}\r\n`);
}
