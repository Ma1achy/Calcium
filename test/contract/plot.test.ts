// C12 tier 2 — the contract with C09's registry, and totality over a fuzz corpus.
//
// The registry is constructed bare and `plot` registered through the public
// `register`, because that is the claim: C12 is not privileged (I12). A test that
// took the defaults would pass without ever exercising the mechanism.
import { describe, expect, it } from "vitest";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { curveRows } from "../../src/presentation/plot/curve.js";
import { seriesRange, FACING_DEFAULT } from "../../src/presentation/plot/scale.js";
import { sparkline } from "../../src/presentation/plot/sparkline.js";
import { PLOT_CORPUS, lossCurve } from "../support/blocks.js";
import { ASCII_CAPS, FULL_CAPS, MONO_CAPS, measurable, visible } from "../support/render.js";
import { checkAsciiParity, checkMeasurement, uncoveredKinds } from "../../src/testing/measurement-conformance.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";
import { readFileSync, readdirSync } from "node:fs";

/** Every degenerate and adversarial series §4 and T2.1 name. */
const FUZZ: readonly (readonly number[])[] = Object.freeze([
  [],
  [1],
  [5, 5, 5, 5],
  [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [1, Number.NaN, 3],
  Array.from({ length: 100_000 }, (_, i) => Math.sin(i / 100)),
  [-5, -4, -3, -2, -1],
  [-1, 1, -1, 1],
  [Number.MIN_VALUE, Number.MIN_VALUE * 2],
  [Number.MAX_SAFE_INTEGER, 1],
  [1e-300, 1e300],
  [0, 0],
]);

const plot = (values: readonly number[], over: Partial<Plot> = {}): Plot =>
  block({
    kind: "plot",
    id: "fuzz",
    form: "line",
    height: 5,
    axes: true,
    series: [{ values }],
    ...over,
  });

describe("C12 tier 2 — registration", () => {
  it("T2.6 (I12): `plot` arrives through the public `register`, and leaves with it", () => {
    const bare = createBlockRegistry({});
    expect(bare.kinds).not.toContain("plot");

    const registered = createBlockRegistry({});
    registered.register(plotDefinition as never);
    expect(registered.kinds).toContain("plot");
  });

  it("T2.6 (I12): unregistered, a plot falls back to `raw` with no privileged path", () => {
    const bare = measurable();
    const lines = bare.renderToLines(plot(lossCurve(10)), 60);

    // The fallback renders the block as JSON, so the assertion is on something
    // only the real renderer can produce — a braille codepoint. A row count would
    // pass either way, which is the whole reason the harness rule exists.
    expect(lines.join("")).not.toMatch(/[⠀-⣿]/u);
    expect(lines.join("")).toContain("plot");
  });

  it("T2.6 (I12): registered, it renders a curve", () => {
    const m = measurable({ definitions: [plotDefinition] as never });
    const rendered = m.renderToLines(plot(lossCurve(10)), 60).join("");
    expect(rendered).toMatch(/[⠀-⣿─│╭╮╰╯┌┐└┘╶╴]/u);
  });
});

describe("C12 tier 2 — measurement", () => {
  it("T2.2 (I1): the generic measurement suite passes for `plot` at every width", () => {
    const m = measurable({ definitions: [plotDefinition] as never });
    const report = checkMeasurement(m, PLOT_CORPUS);
    expect(report.failures).toEqual([]);
  });

  it("T2.2 (I1): and `plot` is covered by the corpus", () => {
    const m = measurable({ definitions: [plotDefinition] as never });
    expect(uncoveredKinds(m, PLOT_CORPUS)).not.toContain("plot");
  });

  it("T2.2 (I1): measured height does not move with the series length", () => {
    const m = measurable({ definitions: [plotDefinition] as never });
    const heights = [2, 10, 200, 5_000].map((n) => m.measure(plot(lossCurve(n)), 80));
    expect(new Set(heights).size).toBe(1);
  });
});

describe("C12 tier 2 — totality", () => {
  it("T2.1 (I2): the rasteriser is total over the fuzz corpus at every width 1..200", () => {
    // **The rasteriser, at every width; the renderer, at a sample of them.** T2.1
    // asks about rasterisation, and 12 corpora × 200 widths through Ink with a
    // 100,000-point series is eleven seconds of React reconciliation to assert a
    // property of two pure functions. So the exhaustive sweep goes where the claim
    // is, and T2.3 below drives the full render at six widths — including 1 and 2,
    // which is where the render path actually failed.
    for (const values of FUZZ) {
      const range = seriesRange([{ values }], {}) ?? { min: 0, max: 1 };
      for (let width = 1; width <= 200; width += 1) {
        expect(
          () => curveRows({ values }, range, width, 5, FULL_CAPS, FACING_DEFAULT),
          `braille[${String(values.length)}] at width ${String(width)}`, // cells-ok — a sample count
        ).not.toThrow();
        expect(
          () => curveRows({ values }, range, width, 5, ASCII_CAPS, FACING_DEFAULT),
          `ramp[${String(values.length)}] at width ${String(width)}`, // cells-ok — a sample count
        ).not.toThrow();
        expect(() => sparkline(values, width, FULL_CAPS)).not.toThrow();
      }
    }
  },
  // **An explicit budget, because 3.2 s against a 5 s default is not a margin.**
  // The sweep is 12 corpora × 200 widths × three rasteriser entry points, one of
  // the corpora being a 100,000-point series — real work rather than slowness, and
  // its cost is what makes I2 a claim about every width rather than a spot check.
  // Left at the default it passed on a quiet machine and timed out on a busy one,
  // which is the shape of a test that gets its timeout raised by someone who does
  // not know what it measures. Twenty seconds says the seconds are expected.
  20_000);

  it("T2.3 (I10): no row exceeds its width and no plot exceeds its declared rows", () => {
    const m = measurable({ definitions: [plotDefinition] as never });
    for (const values of FUZZ) {
      for (const width of [1, 2, 7, 20, 80, 200]) {
        for (const axes of [true, false]) {
          const b = plot(values, { axes });
          const lines = m.renderToLines(b, width);
          expect(lines.length, `rows at ${String(width)}`).toBe(m.measure(b, width));
          for (const line of lines) {
            // `visible()` and not a local regex — one stripper, already tested.
            const shown = visible(line);
            expect([...shown].length, `"${shown}" at width ${String(width)}`).toBeLessThanOrEqual(width); // cells-ok — a plain code-point count
          }
        }
      }
    }
  });

  it("T2.7 (I2): a hundred renders of the same input are identical", () => {
    const m = measurable({ definitions: [plotDefinition] as never });
    const b = plot(lossCurve(500));
    const first = m.renderToLines(b, 80).join("\n");
    for (let i = 0; i < 100; i += 1) {
      expect(m.renderToLines(b, 80).join("\n")).toBe(first);
    }
  });
});

describe("C12 tier 2 — the ASCII form", () => {
  it("T2.4 (I9): Unicode and ASCII produce identical row and column counts", () => {
    const unicode = measurable({ definitions: [plotDefinition] as never, capabilities: FULL_CAPS });
    const ascii = measurable({ definitions: [plotDefinition] as never, capabilities: ASCII_CAPS });
    const report = checkAsciiParity(unicode, ascii, PLOT_CORPUS);
    expect(report.failures).toEqual([]);
  });

  it("T2.4 (I9): and the ASCII form emits no braille", () => {
    const ascii = measurable({ definitions: [plotDefinition] as never, capabilities: ASCII_CAPS });
    const drawn = ascii.renderToLines(plot(lossCurve(30)), 60).join("");
    expect(drawn).not.toMatch(/[⠀-⣿]/u);
    expect(drawn).toMatch(/[.:\-=+*#@]/u);
  });
});

describe("C12 tier 2 — state", () => {
  it("T2.5 (I11): no mutable module state in `plot/`", () => {
    // The same assertion A03 SS24 makes at the gate, from this side. Both exist
    // because a source scan proves the tree is clean and a test proves the rule
    // was ever evaluated — SS24's scope was a file for C11's whole life before it
    // was a directory, and a scope that matches nothing passes.
    const dir = "src/presentation/plot";
    const offenders: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".ts")) continue;
      const source = readFileSync(`${dir}/${entry}`, "utf8");
      if (/^(?:export\s+)?(?:let|var)\s/m.test(source)) offenders.push(entry);
    }
    expect(offenders).toEqual([]);
  });

  it("T2.5 (I11): the 1-bit form is reached by capability, not by a stored mode", () => {
    const mono = measurable({ definitions: [plotDefinition] as never, capabilities: MONO_CAPS });
    const colour = measurable({ definitions: [plotDefinition] as never, capabilities: ASCII_CAPS });
    const two = block({
      kind: "plot",
      id: "two",
      form: "line",
      height: 8,
      axes: true,
      series: [
        { values: lossCurve(20), label: "train" },
        { values: lossCurve(20).map((v) => v * 1.2), label: "val" },
      ],
    });

    // Both are ASCII, so any difference is the colour depth alone — and the
    // difference is that one stacks. Interleaving the two renders asserts nothing
    // is remembered between them.
    const a = mono.renderToLines(two, 60).join("\n");
    const b = colour.renderToLines(two, 60).join("\n");
    expect(mono.renderToLines(two, 60).join("\n")).toBe(a);
    expect(colour.renderToLines(two, 60).join("\n")).toBe(b);
    expect(a).not.toBe(b);
    expect(a).toContain("train");
    expect(a).toContain("val");
  });
});
