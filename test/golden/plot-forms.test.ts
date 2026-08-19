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
