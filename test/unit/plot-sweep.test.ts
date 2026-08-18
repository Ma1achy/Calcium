/**
 * The sweep — seven properties that hold for every plot form.
 *
 * ONE_PER_FORM is a Record<PlotForm, Plot>, so adding a member to the union
 * forces an entry or the support file does not compile.
 */
import { describe, expect, it } from "vitest";
import { ONE_PER_FORM, ALL_FORMS } from "../support/plot-forms.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { plotHeight } from "../../src/presentation/plot/height.js";
import { FULL_CAPS, ASCII_CAPS, MONO_CAPS, measurable } from "../support/render.js";
import type { Plot, PlotForm } from "../../src/data/viewmodel/index.js";
import { validateBlock } from "../../src/data/viewmodel/index.js";

function kit(caps = FULL_CAPS) {
  return measurable({ definitions: [plotDefinition], capabilities: caps });
}

describe("P1: measure is stable", () => {
  for (const form of ALL_FORMS) {
    it(form, () => {
      const block = ONE_PER_FORM[form];
      const k = kit();
      expect(k.measure(block, 40)).toBe(k.measure(block, 40));
    });
  }
});

describe("P3: height is declared", () => {
  const FIXED_HEIGHT: Partial<Record<PlotForm, true>> = { sparkline: true, waffle: true };
  for (const form of ALL_FORMS) {
    it(form, () => {
      const block = ONE_PER_FORM[form];
      const h = plotHeight(block);
      if (FIXED_HEIGHT[form]) {
        expect(h).toBeGreaterThan(0);
      } else if (block.height !== undefined) {
        expect(h).toBeGreaterThanOrEqual(block.height);
      }
    });
  }
});

describe("P4: render fits measure", () => {
  for (const form of ALL_FORMS) {
    it(form, () => {
      const block = ONE_PER_FORM[form];
      const k = kit();
      const measured = k.measure(block, 40);
      const rendered = k.renderToLines(block, 40);
      expect(rendered.length).toBe(measured); // cells-ok — a row count
    });
  }
});

describe("P5: render is pure", () => {
  for (const form of ALL_FORMS) {
    it(form, () => {
      const block = ONE_PER_FORM[form];
      const k = kit();
      const r1 = k.renderToLines(block, 40);
      const r2 = k.renderToLines(block, 40);
      expect(r1).toEqual(r2);
    });
  }
});

describe("P6: validate round-trips", () => {
  for (const form of ALL_FORMS) {
    it(form, () => {
      const block = ONE_PER_FORM[form];
      const json = JSON.parse(JSON.stringify(block));
      expect(() => validateBlock(json)).not.toThrow();
    });
  }
});

describe("P7: degenerate survives", () => {
  for (const form of ALL_FORMS) {
    it(`${form} with empty series`, () => {
      const block = ONE_PER_FORM[form];
      const emptyBlock = {
        ...block,
        series: block.series.map((s) => ({ ...s, values: [] })),
      } as Plot;
      const k = kit();
      expect(() => k.renderToLines(emptyBlock, 40)).not.toThrow();
    });
  }
});

describe("F7: every form at ASCII", () => {
  for (const form of ALL_FORMS) {
    it(form, () => {
      const block = ONE_PER_FORM[form];
      const k = kit(ASCII_CAPS);
      expect(() => k.renderToLines(block, 40)).not.toThrow();
    });
  }
});

describe("F8: every form at 1-bit", () => {
  for (const form of ALL_FORMS) {
    it(form, () => {
      const block = ONE_PER_FORM[form];
      const k = kit(MONO_CAPS);
      expect(() => k.renderToLines(block, 40)).not.toThrow();
    });
  }
});

describe("F9: every form at wide", () => {
  for (const form of ALL_FORMS) {
    it(form, () => {
      const block = ONE_PER_FORM[form];
      const wideCaps = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
      const k = kit(wideCaps);
      expect(() => k.renderToLines(block, 40)).not.toThrow();
    });
  }
});
