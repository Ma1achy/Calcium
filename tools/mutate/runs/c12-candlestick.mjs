// C12 I36, §3r — the candlestick, and the two rulings the frames overturned.
//
// **Two of these mutations restore a shipped-for-an-hour defect rather than
// inventing one**, which is why they are first. §6b B13 ruled `┿` for a body
// shorter than a cell and B15 ruled the remainder spread a cell at a time; both
// read as correct on the page, and rendered, one drew a chart with no direction
// in it and the other a chart claiming four bars span the window. The rows that
// catch them are the record that the frame is what found them.
//
// **The pair worth naming is the wide arm.** `glyphs()` returns ASCII at
// `ambiguousWidth: "wide"` and the ramps return braille, so *the wide arm* names
// two different swaps — and the section drew its consequence from the wrong one.
// CS8 asserts the shape is identical across the two, which is the only form that
// can see a vocabulary held ambiguous.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CANDLES = "src/presentation/plot/candles.ts";
const DEFN = "src/presentation/plot/definition.ts";
const SCALE = "src/presentation/plot/scale.ts";
const FURNITURE = "src/presentation/plot/furniture.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-mutations.test.ts -t "candlestick" 2>&1',
      { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CANDLES,
    from: "    const body = flat ? g.horizontal : rising ? g.candleHollow : g.candleFilled;",
    to: "    const body = g.candleHollow;",
    why: "CS2 asserts both marks appear at every depth; one glyph for both directions cannot satisfy it, so a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **B13 as the walk first ruled it.** Every body one row, every wick
      // inside it, and not one candle saying which way it went — a chart of
      // nothing but `┿`, which no arithmetic assertion can see.
      name: "`┿` is allowed wherever a wick shares the body's cell (B13's first form)",
      file: CANDLES,
      from: "    const spans = cw > 1 || rBot - rTop >= 2; // cells-ok — a row span",
      to: "    const spans = true; // cells-ok — a row span",
      expect: "CS9",
    },
    {
      // The first correction, which still lost a two-row body at one cell wide.
      name: "`┿` bounded by the body's rows alone, not by the candle's cells",
      file: CANDLES,
      from: "    const spans = cw > 1 || rBot - rTop >= 2; // cells-ok — a row span",
      to: "    const spans = rBot > rTop; // cells-ok — a row span",
      expect: "CS9",
    },
    {
      // **The layout §3r struck**, restored exactly: a uniform integer pitch
      // with the whole leftover on the right, on a citation to C12 I13. That
      // what shipped, what the catalogue frame drew, and what got reported —
      // ten blank columns of seventy-four, and an extent that fell by 35 at
      // `n = 37 → 38`.
      name: "the placement returns to a uniform integer pitch, leftover on the right",
      file: CANDLES,
      from: "  return Math.round((index * (w - cw)) / (n - 1)); // cells-ok — a column index",
      to: "  return index * Math.max(1, Math.min(Math.floor(w / n), cw + 1)); // cells-ok — a column index",
      expect: "CD1",
    },
    {
      // **The two callers disagreeing**, which is the defect one shared
      // placement exists to prevent — and the x ticks are a third caller
      // reaching the axis through `candleColumn` (`furniture.ts:xRowFor`), so
      // this is a frame where the ticks point at bars the candles do not draw.
      name: "`candleColumn` computes its own placement again",
      file: CANDLES,
      from: "  const column = candleLeft(faced, drawn, w) + Math.floor((candleWidth(w, drawn) - 1) / 2); // cells-ok — a column index",
      to: "  const column = bucket * Math.max(1, Math.min(Math.floor(w / drawn), candleWidth(w, drawn) + 1)) + Math.floor((candleWidth(w, drawn) - 1) / 2); // cells-ok — a column index",
      expect: "CD4",
    },
    {
      // The gap taken after the body rather than before it: two rising candles
      // side by side draw one double-width body and every count agrees.
      name: "the gap is not taken out of the slot",
      file: CANDLES,
      from: "  return Math.max(1, Math.min(MAX_CANDLE, per - 1)); // cells-ok — a cell width",
      to: "  return Math.max(1, Math.min(MAX_CANDLE, per)); // cells-ok — a cell width",
      expect: "CS3",
    },
    {
      // §6b B1 — the load-bearing seam. Every emptiness check in the component
      // asks about `series`, and a plain-candles block has none.
      name: "emptiness asks about `series` alone again",
      file: DEFN,
      from: "  if (range === null || !(hasSamples(block.series) || hasBars(bars))) {",
      to: "  if (range === null || !hasSamples(block.series)) {",
      expect: "CS1",
    },
    {
      // B3 — the axis. Without the union a plain-candles block has no range and
      // `positionalForm` reaches the empty message by the other door.
      name: "the axis stops seeing the bars",
      file: SCALE,
      from: "  for (const b of bars ?? []) {",
      to: "  for (const b of []) {",
      expect: "CS-B3",
    },
    {
      // The gate on the style. `ohlc` on a block that does not draw it would
      // widen the axis, and the curve stops reaching its own edges.
      // `candlesOf` moved down to `candles.ts` when the x axis needed it too:
      // `furniture.ts` places the ticks and `definition.ts` imports it, so the
      // helper could not be reached sideways (A02 §1, acyclic within a layer).
      name: "`ohlc` moves the axis whatever the style",
      file: CANDLES,
      from: '  return block.plotStyle === "candlestick" ? block.ohlc : undefined;',
      to: "  return block.ohlc;",
      expect: "CS-B3",
    },
    {
      // Aggregation replaced by sampling — the one downsampling in this
      // component that loses nothing, made to lose the extremes.
      name: "aggregation becomes sampling",
      file: CANDLES,
      from: "    out.push({ open: first.open, high, low, close: last.close });",
      to: "    out.push(first);",
      expect: "CS4",
    },
    {
      // `high` of the maxima, taken from the first bar instead.
      name: "the aggregate's high is the first bar's",
      file: CANDLES,
      from: "      if (b.high > high) high = b.high;",
      to: "      if (false) high = b.high;",
      expect: "CS4",
    },
    {
      // B4 — the legend. Two entries or a reader cannot name what the marks are.
      name: "the legend stops naming the directions",
      file: FURNITURE,
      from: '    block.plotStyle === "candlestick" && block.ohlc !== undefined',
      to: "      false",
      expect: "CS-B4",
    },
    {
      // §6b B7 — the wick's rounding, which `boxplotColumn` already owns.
      name: "the wick rounds right of centre at an even width",
      file: CANDLES,
      from: "    const wick = left + Math.floor((cw - 1) / 2); // cells-ok — a column index",
      to: "    const wick = left + Math.ceil((cw - 1) / 2); // cells-ok — a column index",
      expect: "CS3",
    },
    {
      // **F175's fifth instance restored** — the readout ignoring `yFormat`
      // again, at the one place a reader reads the number rather than the
      // picture.
      name: "the readout hand-rolls its rounding again",
      file: DEFN,
      from: "    return `${label}: ${formatReadout(v, block.yFormat)}`;",
      to: "    return `${label}: ${String(Math.round(v * 100) / 100)}`;",
      expect: "CS7",
    },
    {
      // **F182 restored.** `decimalsFor` is two significant figures — right for
      // a tick, and it drops the digit a readout exists to show.
      name: "the numeric arm falls back to the tick's precision",
      file: "src/presentation/plot/axes.ts",
      from: "    return formatValue(v, format, decimalsNeeded(v));",
      to: "    return formatValue(v, format);",
      expect: "CS7b",
    },
    {
      // The floor that was tried first, which rounds `12.75` to `12.8`.
      name: "the numeric arm takes a one-decimal floor instead",
      file: "src/presentation/plot/axes.ts",
      from: "    return formatValue(v, format, decimalsNeeded(v));",
      to: "    return formatValue(v, format, Number.isInteger(v) ? 0 : 1);",
      expect: "CS7b",
    },
    {
      // **F177 on a set** — four readings of one quantity at four precisions.
      name: "the four values are formatted one at a time",
      file: "src/presentation/plot/axes.ts",
      from: "  const places = finite.reduce((most, v) => Math.max(most, decimalsNeeded(v)), 0); // cells-ok — a decimal count",
      to: "  const places = undefined; // cells-ok — a decimal count",
      expect: "CS7",
    },
    {
      // B6 — a readout that shortens reads as *this bar has no open*, not as
      // *there is no bar*. Four values to be absent rather than one.
      name: "an absent bar reads as one dash rather than four",
      file: CANDLES,
      from: '  return `O ${o ?? "—"}  H ${h ?? "—"}  L ${l ?? "—"}  C ${c ?? "—"}`;',
      to: '  return bar === undefined ? "—" : `O ${o}  H ${h}  L ${l}  C ${c}`;',
      expect: "CS7",
    },
    {
      // **C12 I37 — the mapping.** The curve's placement for a candlestick
      // points into blank space right of the last candle whenever the bars are
      // sparse; the two rules agree only at one cell per candle filling the
      // area, which is why a row written at the dense end sees nothing.
      name: "the cursor column uses the curve's placement for candles too",
      file: DEFN,
      from: "  if (bars !== undefined) return candleColumn(bars, cursorIdx, areaWidth, facing);",
      to: "  if (bars !== undefined && false) return candleColumn(bars, cursorIdx, areaWidth);",
      expect: "T1.99",
    },
    {
      // The bucket inverse dropped: bar `i` maps to candle `i`, which is right
      // below the threshold and wrong above it.
      name: "the aggregation is not inverted",
      file: CANDLES,
      from: "  const bucket = Math.min(drawn - 1, Math.floor((index * drawn) / bars.length)); // cells-ok — a bar index",
      to: "  const bucket = Math.min(drawn - 1, index); // cells-ok — a bar index",
      expect: "T1.99b",
    },
    {
      // The rule's mark removed — the dashed line alone, which is invisible in
      // a dense column and is the case that motivates the second mark.
      name: "the rule stops marking the cursor",
      file: FURNITURE,
      from: "    x === cursorAt ? g.cursorMark : at.has(x) ? g.teeDown : between, // cells-ok — a column index",
      to: "    at.has(x) ? g.teeDown : between, // cells-ok — a column index",
      expect: "T1.99",
    },
    {
      // The dashed column removed — the rule mark alone, so nothing carries the
      // eye from the axis up into the figure.
      name: "the cursor's column is not dashed behind the data",
      file: DEFN,
      from: "  if (column === null) return \"\";",
      to: "  if (column !== null || column === null) return \"\";",
      expect: "T1.99",
    },
    {
      // Out of range must draw neither, or a cursor past the data points at a
      // candle that is not the one the readout's dashes describe.
      name: "an out-of-range cursor is clamped rather than dropped",
      file: CANDLES,
      from: "  if (bars.length === 0 || index < 0 || index >= bars.length) return null; // cells-ok — a bar count",
      to: "  if (bars.length === 0) return null; // cells-ok — a bar count",
      expect: "T1.99",
    },
    {
      // The doji goes in a direction's layer, so a flat bar acquires one.
      name: "a doji is drawn as a rising body",
      file: CANDLES,
      from: "    const body = flat ? g.horizontal : rising ? g.candleHollow : g.candleFilled;",
      to: "    const body = rising || flat ? g.candleHollow : g.candleFilled;",
      expect: "CS-B5",
    },
    {
      // **The green doji**, which a golden frame read with colour on is what
      // found. Every count agreed and the tone said *up* about a bar that did
      // not move.
      name: "a doji rides in the rising layer",
      file: CANDLES,
      from: "    const grid = flat ? level : rising ? up : down;",
      to: "    const grid = rising || flat ? up : down;",
      expect: "CS-B5",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
