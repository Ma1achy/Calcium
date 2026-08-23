/**
 * The jittered strip — the raw samples, under the box (C12 §3i, I34).
 *
 * ```
 *   ▁▂▄▆███▆▄▂▁                 the cloud
 * ├──┤███│███├──┤               the box
 *   ⠠⢄⡠⣂⡪⣕⢵⡢⠢⠄                 the rain
 * ```
 *
 * **The rung that makes the figure a raincloud rather than half a violin.** A
 * density is an estimate and a box is five numbers; neither shows how many
 * readings there were, whether they cluster, or that one of them is a duplicate
 * of another. The strip is the only part of the figure that is the data.
 *
 * **The jitter is a pure function of the sample's identity, and I11 is why.**
 * C12 owns no state and every render is a pure function of block, width and
 * context — so no `Math.random`, no clock, no module counter. A strip that
 * changes between two renders of the same block is a picture of the renderer,
 * and it would fail nothing: every count would agree, both frames would be
 * plausible, and the difference would only show when someone rendered twice.
 */
import { normalisedOf } from "../../data/viewmodel/range.js";
import { BRAILLE_DOTS, createGrid, foldBraille, foldPresence, RAMP_DOTS, setDot } from "./raster.js";
import { BRAILLE_BLANK } from "./curve.js";
import { glyphs } from "../blocks/glyphs.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/**
 * A 32-bit avalanche over two integers — murmur3's finaliser, twice.
 *
 * **A hash rather than a counter, and the difference is which renders agree.**
 * A counter gives the same spread within one render and a different one the
 * moment a band gains a sample, because every index after it shifts. A hash of
 * the identity gives the same answer for the same `(band, index)` for as long as
 * the data holds still — which is what a reader comparing two frames is owed.
 *
 * **The band's index is an input** so two bands of the same data do not draw the
 * same speckle, which would read as a coincidence in the measurements rather
 * than a property of the renderer.
 */
function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Where sample `index` of band `series` sits across `positions` (C12 I34). */
export function jitterOf(series: number, index: number, positions: number): number {
  const n = Math.max(1, Math.floor(positions)); // cells-ok — a position count
  return mix(Math.trunc(series), Math.trunc(index)) % n; // cells-ok — a position index
}

/**
 * The dot a value falls on along an axis of `extent` dots.
 *
 * **The box's axis, and no pad** — the same ruling the cloud takes, for the same
 * reason: every part of a raincloud is one figure and a part that moves relative
 * to the others is a different figure (§3i).
 */
function dotAt(v: number, min: number, max: number, extent: number): number {
  // **Already the family's answer, and now the family's function.** This was
  // one of the two sites that had `0.5` written down with a reason (C04 §3ak),
  // so nothing here moves — what changes is that there is no longer a second
  // copy of the arithmetic to drift.
  const t = normalisedOf(v, { min, max }, false);
  return Math.max(0, Math.min(extent - 1, Math.round(t * (extent - 1)))); // cells-ok — a dot index
}

/**
 * `⠀` to a space — **and this row is the only place in C12 that has to do it.**
 *
 * `foldBraille` emits `U+2800` for an empty cell, which is a printing character
 * that looks blank. Every other braille form reaches the frame through
 * `positionalForm`'s layer merge, which starts each cell at `" "` and takes a
 * glyph only where `isBlank` says there is one — so the blanks are lost there
 * and nobody has had to think about them. A banded form has no merge: the band's
 * rows go into the frame verbatim.
 *
 * Left alone, the strip's empty cells are ink to everything that measures ink.
 * `refdiff`'s own mask records why that matters — counting `U+2800` as ink
 * reports every braille form as almost entirely covered — and inside one figure
 * it means three rows disagree about what empty is, in a frame where they look
 * identical.
 */
function spaced(row: string): string {
  return row.replaceAll(BRAILLE_BLANK, " ");
}

function finite(values: readonly (number | null)[]): readonly (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  for (const [i, v] of values.entries()) {
    if (v === null || !Number.isFinite(v)) continue;
    out.push([i, v] as const); // cells-ok — a sample index
  }
  return out;
}

/**
 * One row of raw samples, jittered across the cell's dot rows.
 *
 * **The sub-cell win is vertical here and horizontal in the column arm**, which
 * is the same rule the two densities follow one section up: a braille cell is
 * two dots wide and four tall, so a horizontal strip has four jitter positions
 * and twice the value resolution its neighbours have. The cloud and the box read
 * one column per value step; the strip reads two.
 *
 * **ASCII draws a rug and not a strip, and that is I21 rather than a shortfall.**
 * An ASCII cell has no sub-cell position to spend, so there is nowhere to put
 * the jitter — and folding through the ramp would draw `. : - =` by where a
 * sample happened to land inside its cell, which is a magnitude the data does
 * not have. One mark where a sample falls says exactly what ASCII can say.
 */
export function stripRow(
  values: readonly (number | null)[],
  min: number,
  max: number,
  width: number,
  caps: Caps,
  seriesIndex: number,
): string {
  const w = Math.max(1, Math.floor(width));
  const ascii = caps.unicode === "ascii";
  const dots = ascii ? RAMP_DOTS : BRAILLE_DOTS;
  const grid = createGrid(w * dots.x, dots.y); // cells-ok — a dot budget

  const samples = finite(values);
  if (samples.length === 0) return " ".repeat(w); // cells-ok — a sample count

  for (const [i, v] of samples) {
    setDot(
      grid,
      dotAt(v, min, max, grid.dotWidth),
      ascii ? 0 : jitterOf(seriesIndex, i, grid.dotHeight), // cells-ok — a dot row
    );
  }

  const folded = ascii
    ? foldPresence(grid, glyphs(caps).dotted)
    : foldBraille(grid).map(spaced);
  return folded[0] ?? " ".repeat(w); // cells-ok — a column count
}

/**
 * The strip **stood up** — `stripRow` transposed (C12 I30).
 *
 * The value axis runs down the rows and the jitter runs across the columns, so
 * the resolutions swap: four dot rows of value per cell, and two dot columns of
 * jitter per cell of width. A one-column strip therefore jitters across two
 * positions where its horizontal twin has four — the cell's aspect showing
 * through again, and the reason the vertical budget is four columns where the
 * horizontal one is three rows.
 */
export function stripColumn(
  values: readonly (number | null)[],
  min: number,
  max: number,
  columns: number,
  rows: number,
  caps: Caps,
  seriesIndex: number,
): readonly string[] {
  const c = Math.max(1, Math.floor(columns));
  const n = Math.max(1, Math.floor(rows));
  const ascii = caps.unicode === "ascii";
  const dots = ascii ? RAMP_DOTS : BRAILLE_DOTS;
  const grid = createGrid(c * dots.x, n * dots.y); // cells-ok — a dot budget

  const samples = finite(values);
  const blank = (): readonly string[] => Array.from({ length: n }, () => " ".repeat(c));
  if (samples.length === 0) return blank(); // cells-ok — a sample count

  for (const [i, v] of samples) {
    // Row 0 is the top, so the axis is inverted — the same inversion
    // `boxplotColumn` applies, and it has to be the same one or the strip's
    // samples sit beside the wrong part of the box.
    setDot(
      grid,
      ascii ? 0 : jitterOf(seriesIndex, i, grid.dotWidth), // cells-ok — a dot column
      grid.dotHeight - 1 - dotAt(v, min, max, grid.dotHeight), // cells-ok — a dot row
    );
  }

  return ascii ? foldPresence(grid, glyphs(caps).dotted) : foldBraille(grid).map(spaced);
}
