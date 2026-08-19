/**
 * Golden frames for every new plot form.
 *
 * Four variants each: two widths (40, 80), two capability sets (full 24-bit
 * narrow, ASCII 1-bit wide). Every frame read before committed.
 */
import { describe, expect, it } from "vitest";
import { ONE_PER_FORM, ALL_FORMS } from "../support/plot-forms.js";
import { block } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import {
  DARK_THEME,
  FULL_CAPS,
  MONO_CAPS,
  measurable,
} from "../support/render.js";

const WIDTHS = [40, 80] as const;

const MODES = [
  { name: "full", capabilities: FULL_CAPS },
  { name: "ascii-1bit-wide", capabilities: { ...MONO_CAPS, ambiguousWidth: "wide" as const } },
] as const;

/**
 * The four forms with a vertical arm, drawn that way (C12 §3j, C12 I30).
 *
 * **A separate corpus because `ONE_PER_FORM` is one per form** and the vertical
 * arm is a second renderer, not a variant of the first. Landing it changed no
 * golden frame at all — which is exactly what an uncovered arm looks like from
 * a green run, so these exist to make it visible.
 *
 * The heights are the ones each form needs to draw itself: a three-row box plot
 * and a violin with room for an outline, per §3i's budget.
 */
const VERTICAL = [
  ["bar", { height: 9, categories: ["mon", "tue", "wed"], series: [{ values: [12, 30, 19] }] }],
  ["histogram", { height: 9, series: [{ values: [1, 2, 2, 3, 3, 3, 4, 4, 5, 6, 6, 7] }] }],
  ["boxplot", {
    height: 11, categories: ["a", "b"], series: [],
    quartiles: [
      { min: 1, q1: 3, median: 5, q3: 7, max: 9, mean: 5.5 },
      { min: 2, q1: 4, median: 4.5, q3: 6, max: 8, outliers: [9.5] },
    ],
  }],
  ["violin", {
    height: 13, categories: ["x", "y"],
    series: [
      { values: Array.from({ length: 30 }, (_, i) => 20 + Math.sin(i * 0.6) * 7) },
      { values: Array.from({ length: 30 }, (_, i) => 28 + Math.cos(i * 0.8) * 5) },
    ],
  }],
] as const;

/**
 * The candlestick, which is a **style** and not a form (C12 I36, §3r).
 *
 * **Its own corpus for the reason `VERTICAL` has one**: `ONE_PER_FORM` is one
 * block per `PlotForm`, and a style changes what the same form draws. A
 * candlestick is `form: "line"`, so every frame the form corpus holds for
 * `line` is a document without any candles in it — which is also why I25's
 * sweep cannot see this style (§6b B14).
 *
 * **Four capability sets and both ambiguous widths**, where every other form
 * needs the four. CS8 is the reason and the assertion is that the two *agree*:
 * `glyphs()` returns the ASCII set at `wide`, so the column count does not
 * change and only the glyphs do. The section said *half as many candles* before
 * that was measured.
 */
const CANDLE_BARS = (() => {
  const out: { open: number; high: number; low: number; close: number }[] = [];
  let last = 100;
  for (let i = 0; i < 14; i += 1) {
    const d = [3, -2, 5, -1, -4, 6, 2, -3, 1, 4, -5, 2, 0, 3][i]!;
    const open = last;
    const close = last + d;
    out.push({ open, close, high: Math.max(open, close) + 2, low: Math.min(open, close) - 2 });
    last = close;
  }
  return out;
})();

const STYLES = [
  // Plain candles: `series: []`, which is §6b B1 — the shape that rendered
  // "No data." and is why that row is first.
  ["candlestick", { height: 12, plotStyle: "candlestick", series: [], ohlc: CANDLE_BARS }],
  // With an overlay drawn over them on the shared axis, and a legend naming
  // all three (§6b B3, B4).
  ["candlestick-overlay", {
    height: 12, plotStyle: "candlestick", ohlc: CANDLE_BARS, legend: "right",
    series: [{
      label: "ma3",
      values: CANDLE_BARS.map((_b, i, a) =>
        a.slice(Math.max(0, i - 2), i + 1).reduce((t, x) => t + x.close, 0) / Math.min(i + 1, 3)),
    }],
  }],
  // Dense enough that every candle is one cell — the frame that produced a
  // chart of nothing but `┿` before B13 was bounded.
  ["candlestick-dense", {
    height: 10, plotStyle: "candlestick", series: [],
    ohlc: Array.from({ length: 120 }, (_v, i) => {
      const open = 100 + i * 0.4 + Math.sin(i * 0.7) * 6;
      const close = open + [3, -2, 5, -1, -4, 6, 2, -3][i % 8]!;
      return { open, close, high: Math.max(open, close) + 2, low: Math.min(open, close) - 2 };
    }),
  }],
] as const;

const CANDLE_MODES = [
  { name: "24bit-narrow", capabilities: FULL_CAPS },
  { name: "24bit-wide", capabilities: { ...FULL_CAPS, ambiguousWidth: "wide" as const } },
  { name: "1bit", capabilities: { ...MONO_CAPS, ambiguousWidth: "narrow" as const } },
  { name: "ascii", capabilities: { ...MONO_CAPS, ambiguousWidth: "wide" as const } },
] as const;

describe("golden frames — the candlestick style", () => {
  for (const [name, spec] of STYLES) {
    for (const mode of CANDLE_MODES) {
      for (const width of WIDTHS) {
        it(`${name} · ${mode.name} · ${String(width)}`, () => {
          const b = block({ kind: "plot", id: name, form: "line", axes: true, ...spec } as never);
          const kit = measurable({
            definitions: [plotDefinition],
            theme: DARK_THEME,
            capabilities: mode.capabilities,
          });
          const lines = kit.renderToLines(b, width);
          const frame = [
            `── ${name} · ${mode.name} · measured ${String(kit.measure(b, width))} · rendered ${String(lines.length)}`, // cells-ok
            ...lines,
          ].join("\n");
          expect(frame).toMatchSnapshot();
        });
      }
    }
  }
});

describe("golden frames — the vertical arm", () => {
  for (const [form, spec] of VERTICAL) {
    for (const mode of MODES) {
      for (const width of WIDTHS) {
        it(`${form} · vertical · ${mode.name} · ${String(width)}`, () => {
          const b = block({
            kind: "plot", id: `v-${form}`, form, axes: true, orientation: "vertical", ...spec,
          } as never);
          const kit = measurable({
            definitions: [plotDefinition],
            theme: DARK_THEME,
            capabilities: mode.capabilities,
          });
          const lines = kit.renderToLines(b, width);
          const frame = [
            `── ${form} · vertical · measured ${String(kit.measure(b, width))} · rendered ${String(lines.length)}`, // cells-ok
            ...lines,
          ].join("\n");
          expect(frame).toMatchSnapshot();
        });
      }
    }
  }
});

/**
 * The distribution ladder's **top rung**, at both parities (C12 I39, §3i).
 *
 * **Its own corpus because `ONE_PER_FORM`'s violin never reaches this rung.**
 * That block is `height: 12` over three categories — four rows a band, which
 * §3i spends on the raincloud, a figure that is one-sided by construction and
 * has no reflection to be wrong about. The mirrored outline starts at five.
 *
 * **Measured after asserting the opposite.** The first form of I39 said the
 * corpus missed this because the fixture's band height is *odd*; it is four,
 * and the reason is the rung rather than the parity. The observation that
 * prompted it stands either way — landing a fix that changed every mirrored
 * violin moved four vertical frames and no horizontal one, out of 284 — and
 * what a green run cannot distinguish is *a case the corpus covers and passes*
 * from *a case the corpus does not reach*.
 *
 * Six rows a band is the case that was broken and seven is its control, so a
 * reader comparing the two frames sees the rule rather than one picture.
 */
const MIRRORED = [
  ["violin · 6 rows a band", 18],
  ["violin · 7 rows a band", 21],
] as const;

const MIRRORED_SERIES = [
  { values: Array.from({ length: 60 }, (_v, i) => 30 + Math.sin(i * 0.7) * 9 + (i % 5)) }, // cells-ok — a sample count
  { values: Array.from({ length: 60 }, (_v, i) => 45 + Math.sin(i * 0.5) * 6 + (i % 7)) }, // cells-ok — a sample count
  { values: Array.from({ length: 60 }, (_v, i) => 38 + Math.cos(i * 0.9) * 12 + (i % 3)) }, // cells-ok — a sample count
];

/**
 * More than one histogram on one edge set (C12 I42, §3v).
 *
 * **Its own corpus because `ONE_PER_FORM` is one block per form**, and that
 * block has one series — so every layout renders the same picture and the
 * corpus cannot tell *one edge set for all of them* from *edges for the first*.
 * Landing the shared edges moved **no golden frame at all**, which is what an
 * uncovered case looks like from a green run; that is also the evidence that a
 * single-series histogram is byte-identical to what it was.
 *
 * Two separated distributions, so per-series edges would differ by a lot, and
 * both spreading layouts, because `overlap` means grouped now and stacked is
 * the other picture a reader would ask for.
 */
const HIST_SERIES = [
  { values: Array.from({ length: 120 }, (_v, i) => 20 + ((i * 37) % 23) * 0.6), label: "before" }, // cells-ok — a sample count
  { values: Array.from({ length: 120 }, (_v, i) => 45 + ((i * 53) % 31) * 0.7), label: "after" }, // cells-ok — a sample count
];

describe("golden frames — two histograms, one edge set", () => {
  for (const [name, extra] of [
    ["grouped (the default)", {}],
    ["stacked", { layout: "stacked" as const }],
    ["vertical", { orientation: "vertical" as const }],
  ] as const) {
    for (const mode of MODES) {
      for (const width of WIDTHS) {
        it(`${name} · ${mode.name} · ${String(width)}`, () => {
          const b = block({
            kind: "plot", id: "hist-two", form: "histogram", height: 18, axes: true,
            legend: "right", series: HIST_SERIES, ...extra,
          });
          const kit = measurable({
            definitions: [plotDefinition],
            theme: DARK_THEME,
            capabilities: mode.capabilities,
          });
          const lines = kit.renderToLines(b, width);
          const frame = [
            `── histogram · ${name} · measured ${String(kit.measure(b, width))} · rendered ${String(lines.length)}`, // cells-ok
            ...lines,
          ].join("\n");
          expect(frame).toMatchSnapshot();
        });
      }
    }
  }
});

describe("golden frames — the mirrored rung, both parities", () => {
  for (const [name, height] of MIRRORED) {
    for (const mode of MODES) {
      for (const width of WIDTHS) {
        it(`${name} · ${mode.name} · ${String(width)}`, () => {
          const b = block({
            kind: "plot", id: `m-${String(height)}`, form: "violin", height, axes: true,
            categories: ["tight", "wide", "skewed"], series: MIRRORED_SERIES,
          });
          const kit = measurable({
            definitions: [plotDefinition],
            theme: DARK_THEME,
            capabilities: mode.capabilities,
          });
          const lines = kit.renderToLines(b, width);
          const frame = [
            `── ${name} · measured ${String(kit.measure(b, width))} · rendered ${String(lines.length)}`, // cells-ok
            ...lines,
          ].join("\n");
          expect(frame).toMatchSnapshot();
        });
      }
    }
  }
});

describe("golden frames — every form", () => {
  for (const form of ALL_FORMS) {
    for (const mode of MODES) {
      for (const width of WIDTHS) {
        it(`${form} · ${mode.name} · ${String(width)}`, () => {
          const block = ONE_PER_FORM[form];
          const kit = measurable({
            definitions: [plotDefinition],
            theme: DARK_THEME,
            capabilities: mode.capabilities,
          });
          const lines = kit.renderToLines(block, width);
          const frame = [
            `── ${form} · measured ${String(kit.measure(block, width))} · rendered ${String(lines.length)}`, // cells-ok
            ...lines,
          ].join("\n");

          expect(frame).toMatchSnapshot();
        });
      }
    }
  }
});
