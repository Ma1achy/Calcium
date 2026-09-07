/**
 * A name beside a sample (C12 I55, §3ag).
 *
 * **Two positions and never a slide.** Right of the sample, else left of it,
 * else dropped. A label slid inward from the right edge covers **the sample it
 * names**, and an anchor hidden by its own label is worse than no label — which
 * is the ruling the walk got wrong and the code corrected.
 *
 * **One pass in series order, onto free cells only.** A label never displaces
 * one already placed, so the frame does not depend on which of two independent
 * labels was considered first. Where one is dropped, the survivor's **reserved**
 * cell becomes `+`.
 *
 * **The slot is `1 + cells(text) + 1` and it is symmetric.** The near cell keeps
 * the name off its own anchor and the far cell holds the `+`, so the mark trails
 * the name on the right and leads it on the left rather than appearing between a
 * dot and its own label.
 *
 * **Both padding cells are transparent, and that is a ruling.** They are written
 * as blanks, and `mergedRow` takes the first layer that inked a cell — a blank
 * inks nothing — so the curve shows through them and `last` reads `⢀last⡀`
 * where a sample sits alongside. **The slot reserves *placement*, not ink**: it
 * keeps a second label out and gives the mark somewhere to go. Making it opaque
 * would delete two samples to pad one name, and a scatter's dot is the datum —
 * §3ag A11 gives the label the cells its **text** occupies and no more.
 * Marking by overwriting the label's last cell would mutate the name — *three
 * characters of a symbol name is a different name* (§3n) — and appending on
 * demand would change an extent that has already been tested against its
 * neighbours. `legendRow` reserves six cells for its count for the same reason
 * and says so.
 *
 * **At most one label per cell column.** `columnsOf` downsamples, so a long
 * series puts many samples in one column; labelling each would stack strings at
 * one x with nothing to tell them apart. The first labelled sample in a column
 * wins, which is the same *first placed* rule one scale down.
 */
import { cells } from "../text.js";
import { columnsOf, finiteSamples, rowOf, type Facing, type Range } from "./scale.js";
import type { Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth" | "colourDepth">;

/** Who owns a cell, and where its `+` goes if it displaces something. */
type Owner = Readonly<{ series: number; reserved: number }>;

/** A blank overlay — the shape `mergedRow` reads, with nothing in it. */
function blankRows(areaWidth: number, areaRows: number): string[] {
  return Array.from({ length: areaRows }, () => " ".repeat(areaWidth));
}

/**
 * One overlay per series, in series order, ready to become `"label"` layers.
 *
 * Returns blanks rather than nothing for a series with no labels, so the caller
 * can zip the result against `block.series` by index without a second map.
 */
export function pointLabelRows(
  allSeries: readonly Series[],
  range: Range,
  areaWidth: number,
  areaRows: number,
  caps: Caps,
  facing: Facing,
): readonly (readonly string[])[] {
  const ambiguous = caps.ambiguousWidth;
  // A cell grid per series, mutated as characters are placed.
  const text: string[][][] = allSeries.map(() =>
    Array.from({ length: areaRows }, () => new Array<string>(areaWidth).fill(" ")),
  );
  const owner: (Owner | null)[][] =
    Array.from({ length: areaRows }, () => new Array<Owner | null>(areaWidth).fill(null));

  // **There is no mark prefix, and the arm was built before it was reachable.**
  // C12 I55 said a label takes its series' `markOf` glyph *on the same predicate
  // the swatch uses*, which is `colourDepth >= 4`. Running it: above that floor
  // colour separates the categories and the prefix would be one glyph on every
  // label; **below it — one bit — `positionalForm` stops overlaying and stacks**,
  // so each strip holds one series and the gutter beside it already carries the
  // name. Every form that accepts `pointLabels` is in `POSITIONAL_STACKS`, so the
  // two arms meet with nothing between them and the prefix cannot fire at any
  // capability. Removed rather than shipped: a member that does nothing reads as
  // one not yet implemented (§3ag).

  for (const [i, series] of allSeries.entries()) { // cells-ok — a series index
    const labels = series.pointLabels;
    if (labels === undefined) continue;
    const values = series.values;
    const columns = columnsOf(finiteSamples(values), values.length, areaWidth, facing); // cells-ok — a sample count
    // Sample index to cell column, walked once rather than searched per label.
    const colOf = new Map<number, number>(); // cells-ok — a sample index
    for (const c of columns) {
      for (let j = c.iFirst; j <= c.iLast; j += 1) colOf.set(j, c.x); // cells-ok — a sample index
    }
    const taken = new Set<number>(); // cells-ok — a column position

    for (const [j, label] of labels.entries()) { // cells-ok — a sample index
      if (label === null || label === undefined || label === "") continue;
      const x = colOf.get(j);
      const v = values[j];
      if (x === undefined || v === null || v === undefined || !Number.isFinite(v)) continue;
      if (taken.has(x)) continue; // cells-ok — a column position
      const row = rowOf(v, range, areaRows, facing); // cells-ok — a row index
      if (row < 0 || row >= areaRows) continue; // cells-ok — a row index

      const body = label;
      // **A gap beside the sample and the reserved cell outermost, on both
      // sides.** The first shape put the reservation at `start + need - 1`,
      // which is the *far* end when the label sits right of the sample and the
      // *near* end when it sits left — so `tail ⠠` had a gap and `⠁peak` did
      // not, and the mark would have appeared between a dot and its own name.
      // Reading the frame is what showed it; the arithmetic was self-consistent
      // either way.
      const span = cells(body, ambiguous) + 2; // cells-ok — a cell count — gap + text + mark
      const right = x + 1; // cells-ok — a column position
      const left = x - span; // cells-ok — a column position

      let placed = false;
      let blocker: Owner | null = null;
      for (const start of [right, left]) { // cells-ok — a column position
        if (start < 0 || start + span > areaWidth) continue; // cells-ok — a cell count
        const clash = firstOwner(owner[row]!, start, span);
        if (clash !== null) { blocker ??= clash; continue; }
        // Right: gap, text, mark. Left: mark, text, gap. The sample is always
        // the neighbour of a blank and the mark is always at the outer edge.
        const toRight = start === right; // cells-ok — a column position
        const reserved = toRight ? start + span - 1 : start; // cells-ok — a column position
        write(text[i]![row]!, start + 1, body, ambiguous); // cells-ok — a column position
        for (let c = start; c < start + span; c += 1) { // cells-ok — a column position
          owner[row]![c] = { series: i, reserved };
        }
        taken.add(x); // cells-ok — a column position
        placed = true;
        break;
      }

      // **A drop caused by the edge is silent and a drop caused by a neighbour
      // is not** (§3ag S3). The first says the area is too narrow, which the
      // reader can see; the second says another label is standing here, which
      // they cannot.
      if (!placed && blocker !== null) {
        text[blocker.series]![row]![blocker.reserved] = "+";
      }
    }
  }

  return text.map((rows, i) =>
    allSeries[i]?.pointLabels === undefined
      ? blankRows(areaWidth, areaRows)
      : rows.map((r) => r.join("")),
  );
}

/** The first cell of `[from, from + len)` that belongs to somebody, or nothing. */
function firstOwner(row: readonly (Owner | null)[], from: number, len: number): Owner | null {
  for (let c = from; c < from + len; c += 1) { // cells-ok — a column position
    const o = row[c];
    if (o !== null && o !== undefined) return o;
  }
  return null;
}

/**
 * Lay `body` into a row from `at`, one codepoint per its own cell width.
 *
 * A two-cell character writes itself and leaves `""` behind it, so the cell it
 * occupies is not one the fill can walk into — the same continuation the
 * treemap's names needed and the same reason (§3n, C12 T1.104).
 */
function write(row: string[], at: number, body: string, ambiguous: "narrow" | "wide"): void {
  let col = at; // cells-ok — a column position
  for (const ch of body) {
    row[col] = ch;
    const w = cells(ch, ambiguous);
    for (let k = 1; k < w; k += 1) row[col + k] = ""; // cells-ok — a cell count
    col += w;
  }
}
