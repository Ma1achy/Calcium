/**
 * XA1–XA9: the positional family's x axis (C12 I41, C04 I58, §3d.1).
 *
 * **The rows follow §3d.1's classification table**, which is the walk artefact
 * this was designed from: every interaction here holds at rest, so a table finds
 * them and a sequence trace has nothing to trace.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });
const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/gu, "");
const WAVE = Array.from({ length: 24 }, (_v, i) => 50 + Math.sin(i / 3) * 40); // cells-ok — a sample count

/** The rule row and the label row of a rendered plot. */
function axisRows(extra: object, w = 56): { rule: string; labels: string } {
  const rows = kit().renderToLines(block({
    kind: "plot", id: "xa", form: "line", height: 8, axes: true, series: [{ values: WAVE }], ...extra,
  }), w).map(plain).filter((r) => r !== "");
  return { rule: rows[rows.length - 2] ?? "", labels: rows[rows.length - 1] ?? "" };
}

describe("XA1 (C12 I41): the sample index is the domain when none is declared", () => {
  it("a 24-sample series ticks its own indices", () => {
    const { labels } = axisRows({});
    expect(labels.trim().split(/\s+/u)).toEqual(["0", "5", "10", "15", "20", "23"]);
  });

  it("integers, not two significant figures", () => {
    // §3d's rule is *one precision per axis, from the step, and it is the step's
    // own decimals*. The first form of this reached for `decimalsFor`, which
    // answers *how many digits does a value at this magnitude want* and gives a
    // step of 5 one decimal — so an index axis came out `0.0 5.0 10.0`.
    expect(axisRows({}).labels).not.toMatch(/\./u);
  });
});

describe("XA2 (C12 I41): a declared domain replaces the index", () => {
  it("0..60 ticks in tens", () => {
    expect(axisRows({ xMin: 0, xMax: 60 }).labels.trim().split(/\s+/u))
      .toEqual(["0", "10", "20", "30", "40", "50", "60"]);
  });

  it("xFormat is yFormat's vocabulary", () => {
    expect(axisRows({ xMin: 0, xMax: 1, xFormat: "fraction" }).labels).toMatch(/0%.*100%/u);
  });
});

describe("XA3 (C12 I41): the caller's captions win the row", () => {
  it("xLabels beats a declared domain", () => {
    const { labels } = axisRows({ xMin: 0, xMax: 60, xLabels: ["start", "middle", "end"] });
    expect(labels).toContain("start");
    expect(labels).toContain("end");
    expect(labels).not.toMatch(/\b30\b/u);
  });
});

describe("XA4 (C12 I41): every label has a tick and every tick has a label", () => {
  it("the rule's ticks are exactly the columns the labels are centred on", () => {
    for (const w of [28, 40, 56, 80]) {
      const { rule, labels } = axisRows({ xMin: 0, xMax: 1000 }, w);
      const ticks = [...rule].flatMap((c, i) => (c === "┬" ? [i] : [])); // cells-ok — a column index
      const centres = [...labels.matchAll(/\S+/gu)]
        .map((m) => m.index + Math.floor(([...m[0]].length - 1) / 2)); // cells-ok — a column position
      expect({ w, ticks }).toEqual({ w, ticks: centres });
    }
  });
});

describe("XA5 (C12 I41): a label that cannot keep its gap is dropped with its tick", () => {
  it("a narrow area drops labels rather than butting them", () => {
    const { rule, labels } = axisRows({ xMin: 0, xMax: 1000000 }, 24);
    const ticks = [...rule].filter((c) => c === "┬").length; // cells-ok — a tick count
    const words = [...labels.matchAll(/\S+/gu)].length; // cells-ok — a label count
    expect(ticks).toBe(words);
    // Every pair of labels keeps at least one blank cell between them. (The
    // first form of this row asserted `/\S\S*\s{0}\S/` — `\s{0}` matches the
    // empty string, so it matched any two adjacent glyphs and failed on
    // `500000`. The claim was about the *gap*, and only the loop below is.)
    for (const m of labels.matchAll(/\S+(\s*)/gu)) {
      if (m.index + m[0].length < labels.length) expect(m[1]!.length).toBeGreaterThanOrEqual(1); // cells-ok — a gap
    }
  });
});

describe("XA6 (C12 I41): a form without a position axis gets no numeric row", () => {
  it("a bar's bottom row is not a numeric scale", () => {
    const rows = kit().renderToLines(block({
      kind: "plot", id: "xa6", form: "bar", height: 3, axes: true,
      categories: ["a", "b", "c"], series: [{ values: [1, 2, 3] }],
    }), 40).map(plain);
    expect(rows[rows.length - 1]!.trim()).toBe("");
  });
});

describe("XA7 (C12 I41): the form owns which column a tick lands in", () => {
  // **§3d.1's last row, and the one that would have shipped wrong.** A curve
  // spreads its samples across the width; a candlestick places its bodies at its
  // own pitch. I37 measured that the two agree at the dense end and separate at
  // the sparse one — four bars in forty-four columns put the last candle at
  // column 20 and the curve's rule at 43.
  //
  // **That measurement is now stale in the direction that matters, and a
  // surviving mutation is what said so.** §3r's placement change made the bodies
  // span the whole area, so the last body ends *at* the right edge: the curve's
  // rule lands at column 43, inside the last candle rather than ten cells past
  // it, and *every tick has a candle in its column* is satisfied by both
  // mappings. The claim did not stop being true — it stopped being able to fail.
  //
  // What `columnAt` still buys is the **wick**, which is where a tick means
  // *this bar* rather than *somewhere in this bar*, so that is what is asserted
  // below. The old row is kept beside it because it is the weaker claim and
  // still worth holding.
  //
  // **Both rows here were rewritten after surviving their mutations**, and each
  // failed in a different way worth naming. The first called `xTickRow` with a
  // hand-written mapping — the mechanism, never the wiring — so removing the
  // wiring changed nothing it could see. The second filtered the empty rows out
  // of the frame before taking the last one, so *the last row is not blank* was
  // asserted of the frame's bottom rule, which is never blank.
  //
  // The claim is that a tick points at a candle, so that is what is asserted.
  const BARS = Array.from({ length: 4 }, (_b, i) => ({ // cells-ok — a bar count
    open: 100 + i, high: 104 + i, low: 98 + i, close: 102 + i,
  }));
  const CANDLES = block({
    kind: "plot", id: "xa7", form: "line", height: 8, axes: true,
    plotStyle: "candlestick", series: [], ohlc: BARS,
  });

  it("every tick lands on a candle's wick, not merely inside its body", () => {
    // `candleColumn` answers *the centre column of bar i*; the curve's rule
    // answers *the fraction of the width sample i sits at*. With four bodies
    // filling forty-four cells the two differ by two columns, which is a tick
    // under a body's edge rather than under its wick.
    const rows = kit().renderToLines(CANDLES, 44).map(plain);
    const ruleAt = rows.findIndex((r) => r.includes("└")); // cells-ok — a row index
    const ticks = [...(rows[ruleAt] ?? "")].flatMap((c, i) => (c === "┬" ? [i] : [])); // cells-ok
    const area = rows.slice(1, ruleAt);
    const wicks = new Set(
      area.flatMap((r) => [...r].flatMap((c, i) => (c === "│" ? [i] : []))), // cells-ok — a column index
    );
    expect(ticks.length).toBeGreaterThan(1); // cells-ok — a tick count
    expect(ticks.filter((x) => wicks.has(x))).toEqual(ticks);
  });

  it("every tick has a candle in its column", () => {
    const rows = kit().renderToLines(CANDLES, 44).map(plain);
    const ruleAt = rows.findIndex((r) => r.includes("└")); // cells-ok — a row index
    const rule = rows[ruleAt] ?? "";
    const ticks = [...rule].flatMap((c, i) => (c === "┬" ? [i] : [])); // cells-ok — a column index
    expect(ticks.length).toBeGreaterThan(1); // cells-ok — a tick count
    const area = rows.slice(1, ruleAt);
    const inked = ticks.filter((x) => area.some((r) => ([...r][x] ?? " ") !== " ")); // cells-ok — a column index
    expect({ ticks, inked }).toEqual({ ticks, inked: ticks });
  });

  it("a plain-candles block has a label row at all", () => {
    // `series` is empty for plain candles, so a domain read off `series` alone
    // is zero-wide and draws nothing — a silent gap under exactly the style
    // whose frame a reader most wants numbered. **Not filtered**: the row this
    // is about is the one that would be empty.
    const rows = kit().renderToLines(CANDLES, 44).map(plain);
    const ruleAt = rows.findIndex((r) => r.includes("└")); // cells-ok — a row index
    expect(rows[ruleAt + 1]?.trim()).not.toBe(""); // cells-ok — a row index
  });
});

describe("XA8 (C12 I41): a log domain is placed logarithmically, not only labelled so", () => {
  // **The half that is easy to get wrong and this is what caught it.** Ticks
  // through `axisFor` come back as `1 2 5 10 …` whatever the placement does, so
  // asserting the *values* passes against a linear axis. The first form of this
  // row did exactly that. What separates them is where the ticks land: a decade
  // must occupy a constant share of the width.
  //
  // **And x can transform where y cannot.** A y value is the datum and the
  // rasteriser plots it linearly, so `yScale: "log"` picks log ticks and draws
  // them at linear rows (F189); an x sample is placed by its index, evenly, and
  // the domain declares which value that index carries.
  it("each decade occupies the same share of the width", () => {
    const { labels } = axisRows({ xMin: 1, xMax: 1000, xScale: "log" }, 80);
    const at = (word: string): number => {
      const m = new RegExp(`(?<=^|\\s)${word}(?=\\s|$)`, "u").exec(labels);
      if (m === null) throw new Error(`no label ${word}`);
      return m.index;
    };
    const decades = [at("10") - at("1"), at("100") - at("10"), at("1000") - at("100")];
    const widest = Math.max(...decades), narrowest = Math.min(...decades);
    expect(widest - narrowest).toBeLessThanOrEqual(3); // cells-ok — a column count
  });

  it("and a linear domain of the same span is not spaced that way", () => {
    const { labels } = axisRows({ xMin: 1, xMax: 1000 }, 80);
    expect(labels).not.toMatch(/(?<=^|\s)10(?=\s)/u);
  });
});

describe("XA9 (C12 I41): the axis costs no height", () => {
  it("the rendered row count is unchanged by a domain", () => {
    const of = (extra: object): number =>
      kit().renderToLines(block({
        kind: "plot", id: "xa9", form: "line", height: 9, axes: true,
        series: [{ values: WAVE }], ...extra,
      }), 50).length; // cells-ok — a row count
    expect(of({ xMin: 0, xMax: 60 })).toBe(of({}));
  });
});
