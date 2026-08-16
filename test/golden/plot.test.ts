// C12 T5.1 / commitment 1 — golden frames at 80 / 100 / 120 / 160 (D39).
//
// **These exist to be read.** A braille curve is the one output in this project a
// person can see is wrong and an assertion cannot: every test in the other five
// tiers can pass over a curve that is upside down, off by a column, or drawing its
// axis through the middle of the data. Reading C11's goldens is what found a glyph
// column truncating to `…`, and the same step here found the y-label midpoint
// carrying four decimals where its siblings had two, and x-labels butting into one
// another at narrow widths.
//
// The widths are D39's four, as C11's are. **Both unicode modes are axes here**,
// unlike C11's goldens: C11's ASCII form differs only in glyph substitution, while
// C12's changes the *subcell resolution* — 2×4 dots against 1×8 ramp steps — so the
// two forms are genuinely different pictures of the same data, and T2.4 asserting
// their geometry matches says nothing about whether either is legible.
import { describe, expect, it } from "vitest";
import { lossCurve, plotOf } from "../support/blocks.js";
import {
  ASCII_CAPS,
  DARK_THEME,
  FULL_CAPS,
  LIGHT_THEME,
  MONO_CAPS,
  measurable,
} from "../support/render.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";

const WIDTHS = [80, 100, 120, 160] as const;

const THEMES = [
  { name: "dark", theme: DARK_THEME },
  { name: "light", theme: LIGHT_THEME },
] as const;

const MODES = [
  { name: "utf8", capabilities: FULL_CAPS },
  { name: "ascii", capabilities: ASCII_CAPS },
] as const;

/** A request-rate history — rising, noisy in shape, and not a decay curve. */
function requestRate(n: number): readonly number[] {
  return Array.from({ length: n }, (_, i) => 400 + 120 * Math.sin(i / 3) + 8 * i);
}

/**
 * The cases §9's T5.1 names — a loss curve, a request-rate history, a flat series
 * and an empty one — plus the two that only a picture settles: a pinned axis, and
 * the 1-bit stack.
 */
const CASES: readonly Readonly<{ label: string; block: Plot; mono?: boolean }>[] = [
  { label: "loss curve", block: plotOf({ id: "loss", points: 40, height: 6 }) },
  {
    label: "request rate",
    block: block({
      kind: "plot",
      id: "rate",
      form: "line",
      height: 6,
      axes: true,
      yFormat: "number",
      xLabels: ["-1h", "-30m", "now"],
      series: [{ values: requestRate(60), label: "req/s" }],
    }),
  },
  {
    label: "flat",
    block: block({
      kind: "plot",
      id: "flat",
      form: "line",
      height: 5,
      axes: true,
      series: [{ values: [0.5, 0.5, 0.5, 0.5, 0.5] }],
    }),
  },
  {
    // **The gap, in both forms, because that is the claim** (I4). The two
    // disagreed about this exact array — the line broke across it and the
    // sparkline closed it and came back a glyph shorter — and no golden frame
    // held one, so the whole category stayed green while they disagreed. A
    // leading gap is the case worth having in a picture: it is where a blank
    // would be indistinguishable from the right-anchor padding.
    label: "gapped line",
    block: block({
      kind: "plot",
      id: "gap-line",
      form: "line",
      height: 5,
      axes: true,
      series: [{ values: [1, 2, 3, Number.NaN, 7, 8, 9] }],
    }),
  },
  {
    label: "gapped sparkline, leading and interior",
    block: block({
      kind: "plot",
      id: "gap-spark",
      form: "sparkline",
      series: [{ values: [Number.NaN, 2, 3, Number.NaN, 7, 8, 9] }],
    }),
  },
  {
    label: "empty",
    block: block({
      kind: "plot",
      id: "empty",
      form: "line",
      height: 5,
      axes: true,
      series: [],
      emptyMessage: "No epochs yet.",
    }),
  },
  {
    label: "pinned 0..1",
    block: block({
      kind: "plot",
      id: "pinned",
      form: "line",
      height: 6,
      axes: true,
      yMin: 0,
      yMax: 1,
      // **`fraction`, and it was `percent`** (C04 I41, F31). Same arithmetic and
      // the same frame: the values here are 0..1, so this fixture always meant
      // the multiplying arm and now says so. The rename is what the snapshot
      // churn on this case would otherwise have hidden.
      yFormat: "fraction",
      series: [{ values: [0.2, 0.55, 1.4, 0.8, 0.95, -0.1, 0.6] }],
    }),
  },
  {
    // **The new arm, and it is here because it is geometry** (C04 I41). Three
    // digits and a sign is a four-cell label where `fraction`'s is three, so the
    // gutter differs and the plot area with it — a difference no assertion about
    // label *text* would show, and the reason this is a golden rather than a
    // unit row.
    label: "percent 0..100",
    block: block({
      kind: "plot",
      id: "cpu",
      form: "line",
      height: 6,
      axes: true,
      yMin: 0,
      yMax: 100,
      yFormat: "percent",
      series: [{ values: [12.5, 44, 100.2, 87, 95.5, 0, 60] }],
    }),
  },
  {
    label: "sparkline",
    block: block({
      kind: "plot",
      id: "spark",
      form: "sparkline",
      series: [{ values: lossCurve(20) }],
    }),
  },
  {
    label: "two series stacked (1-bit)",
    mono: true,
    block: block({
      kind: "plot",
      id: "stacked",
      form: "line",
      height: 8,
      axes: true,
      series: [
        { values: lossCurve(30), label: "train" },
        { values: lossCurve(30).map((v) => v * 1.25), label: "val" },
      ],
    }),
  },
  {
    label: "ten series, legend (1-bit)",
    mono: true,
    block: block({
      kind: "plot",
      id: "many",
      form: "line",
      height: 4,
      axes: true,
      series: Array.from({ length: 10 }, (_, i) => ({
        values: lossCurve(20).map((v) => v + i * 0.1),
        label: `s${String(i)}`,
      })),
    }),
  },
];

describe("C12 T5.1 — golden frames", () => {
  for (const mode of MODES) {
    for (const variant of THEMES) {
      for (const width of WIDTHS) {
        it(`${mode.name} ${variant.name} at ${String(width)}`, () => {
          const frame = CASES.map(({ label, block: b, mono }) => {
            const kit = measurable({
              definitions: [plotDefinition],
              theme: variant.theme,
              // The 1-bit cases pin their own depth: the stack is what `colourDepth:
              // 1` produces, and rendering it at 24-bit would snapshot the overlay
              // twice and the stack never.
              capabilities:
                mono === true ? { ...MONO_CAPS, unicode: mode.capabilities.unicode } : mode.capabilities,
            });
            const lines = kit.renderToLines(b, width);
            return [
              `── ${label} · measured ${String(kit.measure(b, width))} · rendered ${String(lines.length)}`, // cells-ok
              ...lines,
            ].join("\n");
          }).join("\n");

          expect(frame).toMatchSnapshot();
        });
      }
    }
  }
});
