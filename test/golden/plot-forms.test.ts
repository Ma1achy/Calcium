/**
 * Golden frames for every new plot form.
 *
 * Four variants each: two widths (40, 80), two capability sets (full 24-bit
 * narrow, ASCII 1-bit wide). Every frame read before committed.
 */
import { describe, expect, it } from "vitest";
import { ONE_PER_FORM, ALL_FORMS } from "../support/plot-forms.js";
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
