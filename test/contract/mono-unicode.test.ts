// The 1-bit rung, with Unicode — the arm nothing rendered.
//
// **`MONO_CAPS` is `{colourDepth: 1, unicode: "ascii"}`**, so every claim in C12
// about what happens at 1-bit was measured through a fixture that also removed
// the glyphs. A fixture where two capabilities move together cannot say which
// one the behaviour follows — and both claims below are about a **glyph**
// surviving the loss of **colour**, which is exactly the pair that was
// conflated.
//
// Found by the C12 audit (`docs/notes/CALCIUM_C12_AUDIT.md` §3), which is the
// third time an instrument has turned up a fixture that changes two things at
// once. `MONO_UNICODE_CAPS` is the separated arm.
import { describe, expect, it } from "vitest";

import { DARK_THEME, MONO_UNICODE_CAPS, measurable } from "../support/render.js";
import { RAMP_ASCII, RAMP_DENSITY } from "../../src/presentation/plot/ramp.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";

const draw = (b: Plot, width = 40): string =>
  measurable({ definitions: [plotDefinition], theme: DARK_THEME, capabilities: MONO_UNICODE_CAPS })
    .renderToLines(b, width)
    .map((l) => l.replace(/\[[0-9;]*m/gu, ""))
    .join("\n");

describe("the 1-bit rung, with Unicode", () => {
  it("T2.104 (C12 I17): a heatmap at 1-bit keeps the density ramp, because the glyph was always the channel", () => {
    // I17 says magnitude is carried by ink at *every* depth, so nothing about
    // this form changes when colour goes. Asserted against the **encoding**
    // rather than against a frame: what has to survive is which ramp is drawn.
    const drawn = draw(
      block({
        kind: "plot",
        id: "m",
        form: "heatmap",
        height: 2,
        series: [
          { values: [1, 2, 3, 4], label: "a" },
          { values: [4, 3, 2, 1], label: "b" },
        ],
      } as Plot),
    );

    expect(drawn, "the density ramp").toContain(RAMP_DENSITY[0]);

    // The control the old fixture could not provide: `MONO_CAPS` would have
    // forced the ASCII arm, and a row that only checked *some ramp glyph is
    // present* passes for either.
    //
    // **Over the matrix rows and not the whole frame**, because the legend
    // states a range and `1 - 4` carries a `-`, which is a step of the ASCII
    // ramp. A control that reads furniture as data fails for a reason that has
    // nothing to do with what it is checking.
    const matrix = drawn.split("\n").slice(0, 2).join("");
    for (const step of [...RAMP_ASCII]) {
      expect(matrix, `${step} is the ASCII arm, and this rung is not it`).not.toContain(step);
    }
  });

  it("T2.105 (C12 I6): a multi-series line at 1-bit stacks, and the braille survives with it", () => {
    // The other half of the conflation. I6 is about **stacking** — a spatial
    // distinction replacing a chromatic one — and it had only been measured
    // where the braille was gone too, so nothing said whether the stack or the
    // ASCII fallback was doing the work.
    const drawn = draw(
      block({
        kind: "plot",
        id: "m2",
        form: "line",
        height: 4,
        axes: true,
        series: [
          { values: [1, 2, 3, 4, 5, 6], label: "train" },
          { values: [6, 5, 4, 3, 2, 1], label: "val" },
        ],
      } as Plot),
    );

    expect(drawn, "a stack labels its strips — both series are named").toContain("train");
    expect(drawn).toContain("val");
    expect(drawn, "and braille survives the loss of colour").toMatch(/[⠀-⣿]/u);
  });
});
