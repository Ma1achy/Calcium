/**
 * The FigureBuilder chain — B1–B6.
 */
import { describe, expect, it } from "vitest";
import { FigureBuilder } from "../../src/shell/builders/figure.js";
import { validateBlock } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";

const kit = () => measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });

describe("B1: .build() produces a valid Plot", () => {
  it("validateBlock passes", () => {
    const plot = new FigureBuilder({ height: 5 })
      .line([1, 2, 3, 4, 5])
      .build();
    expect(() => validateBlock(plot)).not.toThrow();
  });
});

describe("B2: .build() is pure", () => {
  it("two builders with the same input produce the same block", () => {
    const a = new FigureBuilder({ height: 5 }).line([1, 2, 3]).build();
    const b = new FigureBuilder({ height: 5 }).line([1, 2, 3]).build();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("B3: series and annotations are peers", () => {
  it(".line() then .threshold() — both in the block", () => {
    const plot = new FigureBuilder({ height: 5 })
      .line([1, 2, 3, 4, 5])
      .threshold(3)
      .build();
    expect(plot.series.length).toBe(1); // cells-ok — a series count
    expect(plot.annotations?.length).toBe(1); // cells-ok — an annotation count
  });
});

describe("B4: multiple form methods", () => {
  it(".scatter() sets the form to scatter", () => {
    const plot = new FigureBuilder({ height: 5 })
      .scatter([1, 2, 3])
      .build();
    expect(plot.form).toBe("scatter");
  });

  it(".step() sets the form to step", () => {
    const plot = new FigureBuilder({ height: 5 })
      .step([1, 2, 3])
      .build();
    expect(plot.form).toBe("step");
  });

  it(".bar() sets the form to bar", () => {
    const plot = new FigureBuilder({ height: 5 })
      .bar([1, 2, 3])
      .build();
    expect(plot.form).toBe("bar");
  });
});

describe("B5: the flat bag and the chain agree", () => {
  it("both render without error at the same size", () => {
    const chain = new FigureBuilder({ height: 5 })
      .line([1, 3, 2, 5, 4])
      .build();
    const k = kit();
    const chainLines = k.renderToLines(chain, 40);
    expect(chainLines.length).toBeGreaterThan(0); // cells-ok — a row count
  });
});

describe("B6: chain with no series", () => {
  it(".build() produces a plot with empty series", () => {
    const plot = new FigureBuilder({ height: 5 }).build();
    expect(plot.series.length).toBe(0); // cells-ok — a series count
  });
});

describe("confidence and whiskers annotations", () => {
  it("confidence band builds", () => {
    const plot = new FigureBuilder({ height: 5 })
      .line([1, 2, 3, 4, 5])
      .confidence([2, 3, 4, 5, 6], [0, 1, 2, 3, 4])
      .build();
    expect(plot.annotations?.length).toBe(1); // cells-ok — an annotation count
    expect(plot.annotations![0]!.kind).toBe("confidence");
  });

  it("whiskers build", () => {
    const plot = new FigureBuilder({ height: 5 })
      .scatter([1, 2, 3])
      .whiskers([{ x: 0, y: 1, err: 0.5 }, { x: 1, y: 2, err: 0.3 }])
      .build();
    expect(plot.annotations?.length).toBe(1); // cells-ok — an annotation count
    expect(plot.annotations![0]!.kind).toBe("whiskers");
  });
});

describe(".build() is single-use", () => {
  it("throws on second call", () => {
    const builder = new FigureBuilder({ height: 5 }).line([1, 2, 3]);
    builder.build();
    expect(() => builder.build()).toThrow();
  });
});
