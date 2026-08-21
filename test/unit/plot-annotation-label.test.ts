/**
 * TL7–TL9 — an annotation's label, and the row that had to arrive with it
 * (C04 I52 · C12 I55, §3ag).
 *
 * **The deferral's own case is a one-series plot**, and that is the whole reason
 * `legendPlacement` is asserted here as well as the field: the auto arm counted
 * series, so a line plus a reference line answered `null`, and the member would
 * have landed drawing nowhere — which is the state C04 I52 refused to ship it in.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";

const kit = measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });
const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/gu, "");

const rows = (extra: object, w = 60): string[] =>
  kit.renderToLines(block({
    kind: "plot", id: "an", form: "line", height: 8, axes: true,
    series: [{ values: [10, 40, 25, 70, 55], label: "alpha" }], ...extra,
  }), w).map(plain);

const errs = (extra: object): readonly string[] => {
  const r = validateDocument({
    version: 1,
    blocks: [{
      kind: "plot", id: "an", form: "line", height: 8,
      series: [{ values: [1, 2] }], ...extra,
    }],
  });
  return r.ok ? [] : r.error.filter((m) => /annotation|label|legend/u.test(m));
};

describe("TL7 (C04 I52, C12 I55): one series and one reference line still gets a row", () => {
  it("the label is drawn, on the case the deferral was written about", () => {
    const frame = rows({ annotations: [{ kind: "line", value: 50, label: "target" }] }).join("\n");
    expect(frame).toContain("target");
  });

  it("the same plot without a label draws no legend at all", () => {
    // **The fixture responds.** Counting series alone answers `null` here, so a
    // row that only checked the labelled frame would pass on an arm that always
    // returns `"right"` for a one-series line plot.
    const bare = rows({ annotations: [{ kind: "line", value: 50 }] }).join("\n");
    expect(bare).not.toContain("target");
    // **No legend column at all**, which is the structural fact — `┄` is the
    // annotation swatch and `█` the series one, and an unlabelled annotation
    // earns neither. Asserted on the glyphs rather than on a length: the
    // labelled frame is the *shorter* string, because the legend takes columns
    // from the plot area and the rows end sooner.
    expect(bare).not.toContain("┄ ");
    expect(bare).not.toContain("█ alpha");
  });

  it("a form outside `SHARES_CELLS` gets the row too — the partition is about categories", () => {
    // **The row the survivor pair asked for.** A bar chart names its categories
    // in the gutter, so `SHARES_CELLS` is false and the series count can never
    // earn a legend there. An annotation's label is not a category, and folding
    // it into that count would answer a question about categories with a fact
    // about claims.
    // `lollipop` names each category in its own gutter row, so `SHARES_CELLS`
    // is false and no series count can ever earn it a legend. `bar` is `true`
    // and would have passed this row while proving nothing — checked, not
    // assumed, after the first attempt used it.
    const frame = kit.renderToLines(block({
      kind: "plot", id: "an", form: "lollipop", height: 6, axes: true,
      categories: ["a", "b", "c"], series: [{ values: [3, 5, 2] }],
      annotations: [{ kind: "line", value: 4, label: "target" }],
    }), 60).map(plain).join("\n");
    expect(frame).toContain("target");
    expect(frame).toContain("┄");
  });

  it("two labels on one series both take rows", () => {
    const frame = rows({ annotations: [
      { kind: "line", value: 30, label: "floor" },
      { kind: "band", from: 60, to: 80, label: "danger" },
    ] }).join("\n");
    expect(frame).toContain("floor");
    expect(frame).toContain("danger");
  });
});

describe("TL8 (C12 I55, C04 I23): the swatch is the dash the line is drawn with", () => {
  it("the entry carries `┄` and not a category mark", () => {
    // `legendEntries`' own comment records what a swatch naming a glyph that
    // appears nowhere cost. An annotation is dashed at every colour depth, so
    // the dash is available on every arm rather than only below the floor.
    const line = rows({ annotations: [{ kind: "line", value: 50, label: "target" }] })
      .find((r) => r.includes("target"));
    expect(line).toBeDefined();
    expect(line).toContain("┄");
  });
});

describe("TL9 (C04 I52, C12 §3ag A3): the refusals", () => {
  it("a label with `legend: false` is refused — the caller forbade the only place it goes", () => {
    expect(errs({ legend: false, annotations: [{ kind: "line", value: 1, label: "x" }] }).join(" "))
      .toMatch(/there is none/u);
    // The fixture responds: the same annotation without a label is fine, and
    // the same label with a legend is fine.
    expect(errs({ legend: false, annotations: [{ kind: "line", value: 1 }] })).toEqual([]);
    expect(errs({ annotations: [{ kind: "line", value: 1, label: "x" }] })).toEqual([]);
  });

  it("a label on a per-sample kind is refused, because it would name every sample", () => {
    for (const a of [
      { kind: "confidence", upper: [2, 3], lower: [0, 1], label: "ci" },
      { kind: "whiskers", points: [{ x: 0, y: 1, err: 0.5 }], label: "err" },
    ]) {
      expect(errs({ annotations: [a] }).join(" "), a.kind).toMatch(/drawn across every sample/u);
    }
  });

  it("a label that is not a string is refused", () => {
    expect(errs({ annotations: [{ kind: "line", value: 1, label: 3 }] }).join(" "))
      .toMatch(/"label" must be a string/u);
  });
});
