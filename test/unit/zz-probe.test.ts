import { describe, expect, it } from "vitest";
import { plotToSvg, svgFamilyOf } from "../../src/presentation/plot/svg.js";
import { quartileRange } from "../../src/data/viewmodel/distribution.js";
import { b } from "../../src/shell/builders/index.js";
import { DARK_THEME } from "../support/render.js";

describe("probe", () => {
  it("why boxplot is null", () => {
    const spec = {
      id: "f-boxplot", form: "boxplot" as const, height: 8,
      series: [], categories: ["one", "two"],
      quartiles: [
        { min: 2, q1: 3, median: 5, q3: 7, max: 8, mean: 5.2, outliers: [-40] },
        { min: 3, q1: 4, median: 5, q3: 6, max: 7, lower: 1, upper: 9, outliers: [40] },
      ],
    };
    const blk = b.plot(spec);
    console.log("family:", svgFamilyOf(blk.form));
    console.log("quartiles on block:", blk.quartiles?.length, "orientation:", blk.orientation);
    console.log("ohlc:", blk.ohlc, "origin:", blk.origin);
    console.log("range:", JSON.stringify(quartileRange(blk.quartiles ?? [])));
    const svg = plotToSvg(blk, DARK_THEME);
    console.log("svg null?", svg === null);
    expect(true).toBe(true);
  });
});
