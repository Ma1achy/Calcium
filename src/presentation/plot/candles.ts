/**
 * The candlestick — a curve style over the positional machinery (C12 §3r, I36).
 *
 * ```
 *      │              ▯   hollow body, close above open
 *     ▯▯▯             ┃   filled body, close below open
 *     ▯▯▯             │   wick, low to high
 *      │              ┿   both, where a wick shares the body's cell
 *                     ─   doji, open equals close
 * ```
 *
 * **The style draws `ohlc` and the `series` are drawn over it**, which is the
 * whole reason `series: []` is legal: plain candles are the ordinary case and a
 * non-empty `series` is a moving average on the shared axis (C04 I57).
 *
 * **Nothing here reads a clock, a width or an environment.** Every function is a
 * pure function of its arguments, as I11 requires of the whole component.
 */
import type { OHLC, Plot } from "../../data/viewmodel/types.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { readoutSet } from "./axes.js";
import { glyphs } from "../blocks/glyphs.js";
import { rowOf, type Range } from "./scale.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/** The widest a candle is drawn, whatever the budget (C12 §3r). */
const MAX_CANDLE = 5;

/**
 * The drawn width of one candle's body, in cells (C12 §3r, CS3).
 *
 * `clamp(⌊areaWidth ÷ n⌋, 1, 5)` — **stated rather than derived**, because one
 * column per sample reads as a barcode and an unbounded division makes the
 * figure's proportions a property of the terminal. Five is where a wider candle
 * stops saying anything more.
 *
 * **Uniform across the chart**, which is why it divides by `n` and not by a
 * slot: the remainder becomes gap (see `slotsFor`), and a candle wider than its
 * neighbours would read as a datum (§6b B15).
 */
export function candleWidth(areaWidth: number, n: number): number {
  const per = Math.floor(Math.max(0, areaWidth) / Math.max(1, n)); // cells-ok — a cell width
  // **The gap comes out of the slot before the body does**, which the first
  // frame is what settled. At `⌊areaWidth ÷ n⌋` exactly, adjacent candles touch
  // — and two rising candles side by side draw `▯▯▯▯▯▯`, which is one six-cell
  // body and not two three-cell ones. Every count in that frame agreed and the
  // figure said something false, which is `boxplotColumn`'s recorded reason for
  // narrowing to three fifths, arriving on the form next door.
  return Math.max(1, Math.min(MAX_CANDLE, per - 1)); // cells-ok — a cell width
}

/**
 * The pitch from one candle to the next — **uniform, and the leftover is on the
 * right** (C12 §3r, §6b B15).
 *
 * The first form of this spread the remainder a cell at a time, which is what
 * `categoricalColumnForm` does and is wrong here: four bars in forty-four
 * columns came out spread across the whole area, one candle every eleven cells.
 * **§3r already rules that case** — fewer candles than columns is left-aligned
 * and padded right, because a series four bars in reads as *four bars so far,
 * growing rightward* rather than as a chart that will change shape as it fills.
 * A spread layout says the four samples span the window, which is a claim about
 * the data.
 *
 * B15's concern — a candle several cells wider than its neighbours reading as a
 * datum — is answered by the pitch being uniform, not by distributing the
 * leftover. The remedy was the wrong half of the ruling.
 */
function pitchFor(areaWidth: number, n: number): number {
  const total = Math.max(0, Math.floor(areaWidth)); // cells-ok — a cell width
  const count = Math.max(1, Math.floor(n)); // cells-ok — a candle count
  const base = Math.floor(total / count); // cells-ok — a cell width
  return Math.max(1, Math.min(base, candleWidth(total, count) + 1)); // cells-ok — a cell width
}

/**
 * More bars than columns: **aggregate, never sample** (C12 §3r, §6b B12, CS4).
 *
 * Open of the first, high of the maxima, low of the minima, close of the last.
 * The result **is** the true candle of that period, so this is the one
 * downsampling in the component that loses nothing — every other one picks or
 * averages. Dropping bars would lose exactly the extremes the form exists to
 * show, and a chart whose spike disappears when the window narrows is worse than
 * one that is coarse.
 *
 * Fewer bars than columns returns them unchanged; the caller left-aligns, which
 * is I13's ruling — time runs left to right and the right-hand end has not
 * happened yet.
 */
export function aggregate(bars: readonly OHLC[], columns: number): readonly OHLC[] {
  const n = Math.max(1, Math.floor(columns)); // cells-ok — a column count
  if (bars.length <= n) return bars; // cells-ok — a bar count
  const out: OHLC[] = [];
  for (let i = 0; i < n; i += 1) { // cells-ok — a column index
    const from = Math.floor((i * bars.length) / n); // cells-ok — a bar index
    const to = Math.max(from + 1, Math.floor(((i + 1) * bars.length) / n)); // cells-ok — a bar index
    const slice = bars.slice(from, to);
    const first = slice[0]!;
    const last = slice[slice.length - 1]!; // cells-ok — a slice index
    let high = first.high;
    let low = first.low;
    for (const b of slice) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
    }
    out.push({ open: first.open, high, low, close: last.close });
  }
  return out;
}

/**
 * The four values at the crosshair (C12 §3r, §6b B6, CS7).
 *
 * **Load-bearing rather than a convenience**, which is §6b B5's ruling: a doji
 * draws `─` and an overlay line crossing that column draws `─` too, so one glyph
 * has two sources. Both statements are true of the cell — a candle whose open
 * equals its close *is* flat, and so is the line through it — and the only thing
 * that tells a reader which it is looking at is these four numbers.
 *
 * **Four dashes past the end, not one and not none.** A candlestick has four
 * values to be absent rather than one, and a readout that shortens when the
 * cursor runs off the data reads as *this bar has no open* rather than as *there
 * is no bar*. `—` is what a null series value already draws.
 *
 * Formatted through `yFormat`, because a readout is the answer and not a mark on
 * a scale — `formatReadout`, never a hand-rolled round (F175).
 */
export function candleReadout(bar: OHLC | undefined, format: Plot["yFormat"]): string {
  // **One precision across the four**, because they are four readings of one
  // quantity: `O 12.4  H 13.1  L 12  C 12.9` reads as though the low were
  // measured more coarsely, which is F177's finding about an axis's labels
  // arriving on a set nobody had formatted as one.
  const [o, h, l, c] = readoutSet([bar?.open, bar?.high, bar?.low, bar?.close], format);
  return `O ${o ?? "—"}  H ${h ?? "—"}  L ${l ?? "—"}  C ${c ?? "—"}`;
}

/** Whether anything was measured — the candlestick's half of `hasSamples`. */
export function hasBars(bars: readonly OHLC[] | undefined): boolean {
  return bars !== undefined && bars.some((b) =>
    Number.isFinite(b.open) && Number.isFinite(b.high) &&
    Number.isFinite(b.low) && Number.isFinite(b.close));
}

/**
 * The two layers a candlestick draws — rising, and falling.
 *
 * **Two layers rather than one, because a `Layer` carries one `ColourRef`** and
 * a candlestick has two categories. A column is rising or falling and never
 * both, so the layers are disjoint and the first-non-blank merge composes them
 * without a rule about which wins.
 *
 * A doji is neither, and it goes in the rising layer with the neutral mark —
 * `─`, which an overlay line through the same column also draws. That collision
 * is not a defect and needs no glyph change: both statements are true of the
 * cell, and the readout is what tells a reader which it is looking at
 * (§6b B5, CS7).
 */
export function candleRows(
  bars: readonly OHLC[],
  range: Range,
  areaWidth: number,
  areaRows: number,
  caps: Caps,
): Readonly<{ rising: readonly string[]; falling: readonly string[] }> {
  const w = Math.max(1, Math.floor(areaWidth)); // cells-ok — a cell width
  const rows = Math.max(1, Math.floor(areaRows)); // cells-ok — a row count
  const blank = () => Array.from({ length: rows }, () => new Array<string>(w).fill(" "));
  const up = blank();
  const down = blank();
  if (bars.length === 0) { // cells-ok — a bar count
    return { rising: up.map((r) => r.join("")), falling: down.map((r) => r.join("")) };
  }

  const g = glyphs(caps);
  const drawn = aggregate(bars, w);
  const cw = candleWidth(w, drawn.length); // cells-ok — a bar count
  const pitch = pitchFor(w, drawn.length); // cells-ok — a bar count

  for (const [i, bar] of drawn.entries()) {
    const left = i * pitch; // cells-ok — a column index
    if (left >= w) break; // cells-ok — a column index
    // **Left of centre at an even width**, `⌊(w − 1) ÷ 2⌋`, which is the
    // rounding `boxplotColumn` already uses for its spine. One rule in the
    // component rather than two that agree by accident (§6b B7).
    const wick = left + Math.floor((cw - 1) / 2); // cells-ok — a column index

    const bodyTop = Math.max(bar.open, bar.close);
    const bodyBot = Math.min(bar.open, bar.close);
    const rTop = rowOf(bodyTop, range, rows); // cells-ok — a row index
    const rBot = rowOf(bodyBot, range, rows); // cells-ok — a row index
    const rHigh = rowOf(bar.high, range, rows); // cells-ok — a row index
    const rLow = rowOf(bar.low, range, rows); // cells-ok — a row index

    const rising = bar.close > bar.open;
    const grid = bar.close === bar.open ? up : rising ? up : down;
    const body = bar.close === bar.open
      ? g.horizontal
      : rising ? g.candleHollow : g.candleFilled;

    // The wick first, so the body overwrites it where they share a cell — and
    // `candleCross` is what says so where the overwrite would hide it.
    for (let r = rHigh; r <= rLow; r += 1) { // cells-ok — a row index
      const row = grid[r];
      if (row !== undefined) row[wick] = g.vertical;
    }
    for (let r = rTop; r <= rBot; r += 1) { // cells-ok — a row index
      const row = grid[r];
      if (row === undefined) continue;
      // **§6b B13** — an upper wick that does not reach a row above the body is
      // invisible once the body is drawn, and the same below. `┿` is the cell
      // that carries both, and it is the only mark of the five that exists for
      // a collision rather than for a value.
      //
      // **Only where the candle still shows its direction somewhere**, which is
      // the frame's ruling and not the walk's. B13 first gave `┿` the body
      // shorter than a cell, and a hundred and twenty bars in forty-four
      // columns then drew a chart of nothing but `┿` — every body one row,
      // every wick inside it, and **not one candle saying which way it went**.
      // A mark reading *body and wick* in the only cell a candle has says
      // neither open nor close, and direction is what the figure is for.
      //
      // Stated as the property rather than as a row count, because the first
      // correction — *the body must span more than one row* — still lost a
      // two-row body at one cell wide, where both rows are ends. `┿` is
      // affordable exactly when some other cell of this candle carries the
      // body: another column, or an interior row.
      const spans = cw > 1 || rBot - rTop >= 2; // cells-ok — a row span
      const sharesUpper = spans && r === rTop && rHigh === rTop && bar.high > bodyTop;
      const sharesLower = spans && r === rBot && rLow === rBot && bar.low < bodyBot;
      const mark = sharesUpper || sharesLower ? g.candleCross : body;
      for (let c = left; c < left + cw; c += 1) { // cells-ok — a column index
        if (c >= 0 && c < w) row[c] = c === wick ? mark : body; // cells-ok — a column index
      }
    }
  }

  return { rising: up.map((r) => r.join("")), falling: down.map((r) => r.join("")) };
}
