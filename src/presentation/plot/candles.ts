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
import { rowOf, type Facing, type Range } from "./scale.js";

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
 * slot: the remainder becomes gap (see `candleLeft`), and a candle wider than
 * its neighbours would read as a datum (§6b B15). The citation here named
 * `slotsFor`, which is a function this file has never had.
 */
/**
 * The bars this block draws, or none (C12 §6b B1, I36).
 *
 * **Gated on the style and not on the field being present.** `ohlc` on a block
 * whose style does not draw it contributes nothing to the frame, so it must
 * contribute nothing to the axis either — an axis widened by data nobody can see
 * is a plot whose curve does not reach its own edges for no stated reason.
 *
 * **Here rather than in `definition.ts`, because the x axis needs it too.**
 * `furniture.ts` places the ticks and `definition.ts` imports `furniture.ts`,
 * so the helper had to move down to the file that already owns the candle's
 * geometry rather than be reached for sideways (A02 §1 — acyclic within a
 * layer).
 */
export function candlesOf(block: Plot): readonly OHLC[] | undefined {
  return block.plotStyle === "candlestick" ? block.ohlc : undefined;
}

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
 * The column candle `index` of `count` begins at — **the one placement, and it
 * fills the area** (C12 §3r, §3s, §6b B15).
 *
 * **This used to be a uniform integer pitch with the leftover on the right, on a
 * citation to I13.** I13 is about a *sparkline*, where one cell is one position,
 * and that fixed cell-per-position is the whole of what left-anchoring buys
 * there — §B3 is the measurement. A candlestick derives its pitch from the bar
 * count, so the property I13 protects does not exist here and the citation
 * carried the disposition without the geometry that earns it.
 *
 * Measured the way §B3 measured the sparkline, at 74 columns across every bar
 * count from 2 to 80: the drawn extent **shrinks at five of seventy-nine
 * arrivals**, worst at `n = 37 → 38` where 73 columns become 38 — one more bar
 * taking thirty-five of the seventy-four away. The blank fringe ran 0 % to 69 %
 * and was not monotone in `n`, so a reader watching a feed fill saw the chart
 * shrink as data arrived. *Growing rightward* is what the anchor was chosen for
 * and it is the thing that measurement falsifies.
 *
 * `round(index × (areaWidth − cw) ÷ (count − 1))` puts the first body at column
 * 0 and the last flush with the right edge, so the extent is exactly the area
 * width at every `n`. **Gaps then differ by at most one cell and bodies never
 * differ at all**, which is what §6b B15 asks for — distributing the remainder
 * into the *pitch* was the wrong half of that ruling and this is the right one.
 *
 * **One function because two callers must agree.** `candleRows` draws here and
 * `candleColumn` inverts here, and the x-axis ticks go through `candleColumn`
 * (`furniture.ts:xRowFor`) — so a second copy would let the ticks and the
 * candles disagree about the same bar, in a frame where every count still adds
 * up.
 */
export function candleLeft(index: number, count: number, areaWidth: number): number {
  const w = Math.max(1, Math.floor(areaWidth)); // cells-ok — a cell width
  const n = Math.max(1, Math.floor(count)); // cells-ok — a candle count
  const cw = candleWidth(w, n); // cells-ok — a cell width
  // A single candle sits at the left rather than at `w − cw`: the divisor is
  // zero and the two ends coincide, so there is no placement to interpolate and
  // the left edge is the one that does not move when a second bar arrives.
  if (n <= 1) return 0; // cells-ok — a candle count
  return Math.round((index * (w - cw)) / (n - 1)); // cells-ok — a column index
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
 * Fewer bars than columns returns them unchanged; the caller spreads them
 * across the area (`candleLeft`). **This said *the caller left-aligns, which is
 * I13's ruling*** — and I13 is about a sparkline's fixed cell-per-position,
 * which a form that derives its pitch from the bar count does not have (§3r).
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

/**
 * Which column bar `index` is drawn in (C12 §3s, I37).
 *
 * **Through the aggregation, which is what a single placement rule gets wrong.**
 * Past the threshold the candle at column *j* is a bucket of bars, so the
 * inverse of `aggregate`'s `⌊j × bars.length ÷ n⌋` is `⌊index × n ÷
 * bars.length⌋` — and a marker placed by the curve's `columnsOf` rule would
 * point at a candle the reader is not being told about.
 *
 * The wick's column rather than the body's left edge, because that is the one
 * cell of a candle that is always drawn.
 */
export function candleColumn(
  bars: readonly OHLC[],
  index: number,
  areaWidth: number,
  facing: Facing,
): number | null {
  const w = Math.max(1, Math.floor(areaWidth)); // cells-ok — a cell width
  if (bars.length === 0 || index < 0 || index >= bars.length) return null; // cells-ok — a bar count
  const drawn = Math.min(bars.length, w); // cells-ok — a bar count
  const bucket = Math.min(drawn - 1, Math.floor((index * drawn) / bars.length)); // cells-ok — a bar index
  // **The bucket is flipped, not the column** (§3ac B2, and A6's rule one form
  // along). `candleLeft` spreads the bodies so the last is flush with the right
  // edge; mirroring its answer would put the first body's *left* edge where the
  // last body's left edge was, a body-width off. Reversing which bucket is
  // asked for lands on the placement the bars were actually drawn at.
  const faced = facing.x === "left" ? drawn - 1 - bucket : bucket; // cells-ok — a bar index
  const column = candleLeft(faced, drawn, w) + Math.floor((candleWidth(w, drawn) - 1) / 2); // cells-ok — a column index
  return column < w ? column : null; // cells-ok — a column index
}

/** Whether anything was measured — the candlestick's half of `hasSamples`. */
export function hasBars(bars: readonly OHLC[] | undefined): boolean {
  return bars !== undefined && bars.some((b) =>
    Number.isFinite(b.open) && Number.isFinite(b.high) &&
    Number.isFinite(b.low) && Number.isFinite(b.close));
}

/**
 * The three layers a candlestick draws — rising, falling, and flat.
 *
 * **A layer per tone, because a `Layer` carries one `ColourRef`.** A column is
 * exactly one of the three, so the layers are disjoint and the first-non-blank
 * merge composes them without a rule about which wins.
 *
 * **Three and not two, which the first golden frame is what settled.** A doji
 * went in the rising layer — it is neither, and the mark `─` says so — and the
 * frame drew it **green**, because that layer carries `tone.ok`. Every count
 * agreed and the colour said *up* about a bar that did not move. A flat bar
 * reads flat: its own layer, muted.
 *
 * The `─` an overlay line through the same column also draws is a different
 * matter and needs no glyph change: both statements are true of that cell, and
 * the readout is what tells a reader which it is looking at (§6b B5, CS7).
 */
export function candleRows(
  bars: readonly OHLC[],
  range: Range,
  areaWidth: number,
  areaRows: number,
  caps: Caps,
  facing: Facing,
): Readonly<{ rising: readonly string[]; falling: readonly string[]; flat: readonly string[] }> {
  const w = Math.max(1, Math.floor(areaWidth)); // cells-ok — a cell width
  const rows = Math.max(1, Math.floor(areaRows)); // cells-ok — a row count
  const blank = () => Array.from({ length: rows }, () => new Array<string>(w).fill(" "));
  const up = blank();
  const down = blank();
  const level = blank();
  const joined = (): Readonly<{ rising: readonly string[]; falling: readonly string[]; flat: readonly string[] }> => ({
    rising: up.map((r) => r.join("")),
    falling: down.map((r) => r.join("")),
    flat: level.map((r) => r.join("")),
  });
  if (bars.length === 0) return joined(); // cells-ok — a bar count

  const g = glyphs(caps);
  const drawn = aggregate(bars, w);
  const cw = candleWidth(w, drawn.length); // cells-ok — a bar count

  for (const [i, bar] of drawn.entries()) {
    const at = facing.x === "left" ? drawn.length - 1 - i : i; // cells-ok — a bar index
    const left = candleLeft(at, drawn.length, w); // cells-ok — a column index
    if (left >= w) break; // cells-ok — a column index
    // **Left of centre at an even width**, `⌊(w − 1) ÷ 2⌋`, which is the
    // rounding `boxplotColumn` already uses for its spine. One rule in the
    // component rather than two that agree by accident (§6b B7).
    const wick = left + Math.floor((cw - 1) / 2); // cells-ok — a column index

    const bodyTop = Math.max(bar.open, bar.close);
    const bodyBot = Math.min(bar.open, bar.close);
    const rTop = rowOf(bodyTop, range, rows, facing); // cells-ok — a row index
    const rBot = rowOf(bodyBot, range, rows, facing); // cells-ok — a row index
    const rHigh = rowOf(bar.high, range, rows, facing); // cells-ok — a row index
    const rLow = rowOf(bar.low, range, rows, facing); // cells-ok — a row index

    const flat = bar.close === bar.open;
    const rising = bar.close > bar.open;
    const grid = flat ? level : rising ? up : down;
    const body = flat ? g.horizontal : rising ? g.candleHollow : g.candleFilled;

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

  return joined();
}
