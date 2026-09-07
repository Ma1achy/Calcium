/**
 * `hidden` — a series or an annotation that is held and not drawn
 * (C04 I99, C12 I116, §3aq; C22 I78).
 *
 * **Appearance, never geometry**, and the rows here are the walk's cells: the
 * height is equal with and without the member (C04 T1.27), the gutter labels
 * are identical because the axis is measured over the hidden series too, the
 * legend keeps the entry under `hollow`, the callout and readout drop it, an
 * empty plot is a frame and a legend rather than *No data.*, and the reader's
 * override in `RenderContext.seriesVisibility` is read before the member.
 *
 * **Read the frame, not only the arithmetic.** The hidden frame is compared to
 * the unhidden one cell by cell so a row can say *which* cells moved.
 */
import { describe, expect, it } from "vitest";

import { block, HAS_HIDEABLE_SERIES, type Plot, type PlotForm } from "../../src/data/viewmodel/index.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { plotToSvg } from "../../src/presentation/plot/svg.js";
import { DARK_THEME, FULL_CAPS, MONO_UNICODE_CAPS, measurable } from "../support/render.js";

const SGR = /\[[0-9;]*m/gu;
const strip = (s: string): string => s.replace(SGR, "");

function kit(caps = FULL_CAPS, seriesVisibility?: Record<string, Record<number, boolean>>) {
  return measurable({ definitions: [plotDefinition], capabilities: caps, seriesVisibility });
}

const two = (extra: Partial<Plot> = {}, second: Record<string, unknown> = {}): Plot =>
  block({
    kind: "plot", id: "p", form: "line", height: 8, axes: true,
    series: [
      { values: [10, 20, 30, 40, 50], label: "train" },
      { values: [90, 80, 70, 60, 55], label: "val", ...second },
    ],
    ...extra,
  }) as Plot;

const META = {
  verb: "plot", adapter: "passthrough", exitCode: 0, durationMs: 0, truncated: false,
  argv: [] as string[], stderr: "", transport: "local", origin: "user",
};
/** The validator's verdict on one block inside a well-formed envelope, so only the block can be refused. */
const errsOf = (doc: object): readonly string[] => {
  const r = validateDocument({ schema: "tui.view/1", command: "/plot", status: "ok", blocks: [doc], meta: META });
  return r.ok ? [] : r.error;
};

describe("C04 I99 — appearance, never geometry (T1.27)", () => {
  it("T1.27: measure is equal with hidden on one, both or neither, at three widths", () => {
    const k = kit();
    const neither = two();
    const one = two({}, { hidden: true });
    const both = block({
      ...two(),
      series: two().series.map((s) => ({ ...s, hidden: true })),
    }) as Plot;
    const ann = two({ annotations: [{ kind: "line", value: 50, label: "target", hidden: true }] });
    for (const w of [20, 40, 80]) {
      const h = k.measure(neither, w);
      expect(k.measure(one, w), `one hidden, width ${String(w)}`).toBe(h);
      expect(k.measure(both, w), `both hidden, width ${String(w)}`).toBe(h);
      expect(k.measure(ann, w), `hidden annotation, width ${String(w)}`).toBe(h);
      expect(k.renderToLines(one, w).length, "and the render agrees").toBe(h); // cells-ok — a row count
    }
  });
});

describe("C04 I99 — refused where a series is not a layer (T3.68)", () => {
  const plotDoc = (form: string, series: object[], more: object = {}) =>
    ({ kind: "plot", id: "p", form, height: 6, series, ...more });

  it("HAS_HIDEABLE_SERIES is total over PlotForm and true on exactly the positional seven", () => {
    const forms = Object.keys(HAS_HIDEABLE_SERIES) as PlotForm[];
    expect(forms.length).toBe(48); // cells-ok — a form count
    const on = forms.filter((f) => HAS_HIDEABLE_SERIES[f]).sort();
    expect(on).toEqual(["bubble", "density", "ecdf", "line", "scatter", "slope", "step"]);
  });

  it("a non-boolean is refused naming the series index", () => {
    expect(errsOf(plotDoc("line", [{ values: [1, 2], hidden: "yes" }])).join(" "))
      .toMatch(/series\[0\]\.hidden must be a boolean \(C04 I99\)/u);
  });

  it("hidden on a bar series is refused for either value, naming the form and the rule", () => {
    for (const hidden of [true, false]) {
      const e = errsOf(plotDoc("bar", [{ values: [1, 2], hidden }], { categories: ["a", "b"] })).join(" ");
      expect(e, `hidden: ${String(hidden)}`).toMatch(/series\[0\]\.hidden is set on form "bar" \(C04 I99\)/u);
    }
    // `block()` is a shape constructor and does not run the validator, so the
    // refusal has one gate here and the builder's is the type: `SeriesOpts.hidden`
    // is a boolean or it does not compile.
  });

  it("hidden on a line series is accepted, and a hidden annotation is accepted on a bar plot", () => {
    expect(errsOf(plotDoc("line", [{ values: [1, 2], hidden: true }]))).toEqual([]);
    expect(errsOf(plotDoc("bar", [{ values: [1, 2] }], {
      categories: ["a", "b"],
      annotations: [{ kind: "line", value: 1.5, hidden: true }],
    }))).toEqual([]);
    expect(errsOf(plotDoc("line", [{ values: [1, 2] }], {
      annotations: [{ kind: "band", from: 1, to: 2, hidden: "no" }],
    })).join(" ")).toMatch(/annotation "hidden" must be a boolean \(C04 I99\)/u);
  });
});

describe("C12 I116 — the digits the plot declares (T1.126)", () => {
  const withSeries = (n: number): Plot =>
    block({
      kind: "plot", id: "p", form: "line", height: 5,
      series: Array.from({ length: n }, (_, i) => ({ values: [i, i + 1] })),
    }) as Plot;
  const names = (n: number) => (plotDefinition.keymap?.(withSeries(n)) ?? []).map((b) => `${b.key.name}→${b.action}`);

  it("one binding per series, capped at nine, none for an empty plot", () => {
    expect(names(3)).toEqual(["1→toggleSeries1", "2→toggleSeries2", "3→toggleSeries3"]);
    expect(names(1)).toEqual(["1→toggleSeries1"]);
    expect(names(0)).toEqual([]);
    // Twelve series would be refused by C04 I50a on a categorical form; a
    // heatmap takes them and declares no more than nine.
    const matrix = block({
      kind: "plot", id: "m", form: "heatmap", height: 12,
      series: Array.from({ length: 12 }, () => ({ values: [1, 2, 3] })),
    }) as Plot;
    expect(plotDefinition.keymap?.(matrix)?.length).toBe(9); // cells-ok — a binding count
  });
});

describe("C12 I116 — the hidden frame (T1.127)", () => {
  // **`yAxis: "both"`, because the callout column exists only where a right
  // axis does** (I48 — measured: `yCallout: "last"` alone reserves no column
  // at width 60, and the `╴` at a curve's end is the line-draw cap, not a
  // callout). The frames were read before these rows were written (§3aq).
  const shown = kit().renderToLines(two({ yCallout: "last", yAxis: "both" }), 60).map(strip);
  const hidden = kit().renderToLines(two({ yCallout: "last", yAxis: "both" }, { hidden: true }), 60).map(strip);

  it("the frame differs, the gutter labels do not, and the row count is the same", () => {
    expect(hidden.length).toBe(shown.length); // cells-ok — a row count
    expect(hidden.join("\n")).not.toBe(shown.join("\n"));
    // **The axis held**: the y gutter is the leading run of each area row
    // before the frame's left rule, and it is byte-identical.
    const gutter = (rows: readonly string[]) => rows.map((r) => /^[^│|]*/u.exec(r)?.[0] ?? "");
    expect(gutter(hidden), "gutter labels unchanged — the range includes the hidden series").toEqual(gutter(shown));
  });

  it("the legend keeps `val` under hollow and `train` under its own mark", () => {
    const legendRow = (rows: readonly string[], label: string) => rows.find((r) => r.includes(` ${label}`)) ?? "";
    expect(legendRow(hidden, "val"), "the entry is still nameable").toMatch(/○ val/u);
    expect(legendRow(shown, "val"), "and was not hollow before").not.toMatch(/○ val/u);
    expect(legendRow(hidden, "train")).not.toMatch(/○ train/u);
  });

  it("the callout for the hidden series is gone and the right column keeps its width", () => {
    // `yCallout: "last"` writes the last finite value beside the ink's last row.
    expect(shown.join("\n")).toMatch(/\b55\b/u);
    expect(hidden.join("\n"), "no number for a curve that is not on screen").not.toMatch(/\b55\b/u);
    expect(hidden.join("\n"), "the other series' callout survives").toMatch(/\b50\b/u);
    // Geometry: every row is the same width in cells.
    expect(hidden.map((r) => r.length)).toEqual(shown.map((r) => r.length)); // cells-ok — plain ASCII/braille rows compared as pairs
  });

  it("the ink that is left is the first series' ink — no cell gained ink", () => {
    // Every cell inked in the hidden frame was inked in the shown frame, inside the
    // plot area (the legend and the callout column are excluded by the rows above).
    // The plot area is what sits strictly between the frame's left and right
    // rules — `│ ┤ ├ ┣ ┫` — so the gutters, the callout column and the legend
    // are outside it. A row with no rule (the x axis) is compared whole.
    const RULE = /[│┤├┣┫]/u;
    const areaOf = (r: string): string => {
      const cs = [...r];
      const left = cs.findIndex((c) => RULE.test(c));
      if (left < 0) return r;
      let right = cs.length - 1;
      while (right > left && !RULE.test(cs[right] ?? "")) right -= 1;
      return cs.slice(left + 1, right).join("");
    };
    const a = shown.map(areaOf);
    const b = hidden.map(areaOf);
    expect(b.map((r) => [...r].length), "the area is the same shape").toEqual(a.map((r) => [...r].length)); // cells-ok — paired rows
    let gained = 0;
    let lost = 0;
    b.forEach((row, i) => {
      [...row].forEach((ch, x) => {
        const was = [...(a[i] ?? "")][x] ?? " ";
        if (ch !== " " && was === " ") gained += 1;
        if (ch === " " && was !== " ") lost += 1;
      });
    });
    expect(gained, "hiding adds no ink").toBe(0);
    expect(lost, "and removes some").toBeGreaterThan(0);
  });
});

describe("C12 I116 — every series hidden, and the reader's override (T1.128)", () => {
  it("both hidden draws the frame and the legend with a blank area, not No data.", () => {
    const both = block({
      ...two(),
      series: two().series.map((s) => ({ ...s, hidden: true })),
    }) as Plot;
    const rows = kit().renderToLines(both, 60).map(strip);
    expect(rows.join("\n")).not.toMatch(/No data\./u);
    expect(rows.join("\n"), "the legend still names both").toMatch(/○ train/u);
    expect(rows.join("\n")).toMatch(/○ val/u);
    // No curve ink in the area: the line-draw alphabet's curve glyphs and
    // braille are both absent, while the frame's own `┌│└` and the legend stay.
    const ink = rows.join("").match(/[⠀-⣿╭╮╯╰╶╴]/gu) ?? [];
    expect(ink, "no curve ink").toHaveLength(0);
  });

  it("the store override reads before the member, in both directions", () => {
    const viaMember = kit().renderToLines(two({}, { hidden: true }), 60);
    const viaStore = kit(FULL_CAPS, { p: { 1: true } }).renderToLines(two(), 60);
    expect(viaStore, "an override to hidden draws the member's frame").toEqual(viaMember);
    const overridden = kit(FULL_CAPS, { p: { 1: false } }).renderToLines(two({}, { hidden: true }), 60);
    expect(overridden, "an override to shown over a producer's hidden draws the unhidden frame")
      .toEqual(kit().renderToLines(two(), 60));
    // An override for a block this frame does not hold is inert.
    expect(kit(FULL_CAPS, { other: { 1: true } }).renderToLines(two(), 60)).toEqual(kit().renderToLines(two(), 60));
  });

  it("the readout omits a hidden series (walk row 4)", () => {
    const k = measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS, cursorPositions: { p: 2 } });
    const rows = k.renderToLines(two({}, { hidden: true }), 60).map(strip);
    const readout = rows[rows.length - 1] ?? "";
    expect(readout).toMatch(/train: 30/u);
    expect(readout).not.toMatch(/val/u);
  });
});

describe("C12 I116 — one bit, and the annotation (T3.20)", () => {
  it("at colourDepth 1 the hidden strip keeps its band and label and draws no ink", () => {
    const shown = kit(MONO_UNICODE_CAPS).renderToLines(two(), 60).map(strip);
    const hidden = kit(MONO_UNICODE_CAPS).renderToLines(two({}, { hidden: true }), 60).map(strip);
    expect(hidden.length).toBe(shown.length); // cells-ok — a row count
    // The strip's label sits in the gutter at its band's first row, both ways.
    expect(hidden.some((r) => r.includes("val")), "the band is still named").toBe(true);
    // Which rows hold braille: the hidden frame's are a strict subset of the shown frame's.
    const inked = (rows: readonly string[]) => rows.map((r) => /[⠀-⣿]/u.test(r));
    const a = inked(shown);
    const b = inked(hidden);
    expect(b.filter(Boolean).length).toBeLessThan(a.filter(Boolean).length); // cells-ok — a row count
    b.forEach((v, i) => { if (v) expect(a[i], `row ${String(i)} inked only where it was`).toBe(true); });
  });

  it("a hidden annotation's line is gone and its legend row stays, in both arms", () => {
    const withLine = two({ annotations: [{ kind: "line", value: 50, label: "target" }] });
    const withHidden = two({ annotations: [{ kind: "line", value: 50, label: "target", hidden: true }] });
    const a = kit().renderToLines(withLine, 60).map(strip);
    const b = kit().renderToLines(withHidden, 60).map(strip);
    expect(a.join("\n")).toMatch(/┄ target/u);
    expect(b.join("\n"), "the row stays, marked").toMatch(/○ target/u);
    const dashes = (rows: readonly string[]) => rows.join("").split("┄").length - 1; // cells-ok — a glyph count
    expect(dashes(b), "the reference line itself is not drawn").toBeLessThan(dashes(a));

    // The SVG arm honours the member too (C12 I116's last clause).
    const svgShown = plotToSvg(withLine, DARK_THEME) ?? "";
    const svgHidden = plotToSvg(withHidden, DARK_THEME) ?? "";
    expect(svgHidden).not.toBe(svgShown);
    // A polyline is a `<path>` here; the reference line is the dashed one.
    // Measured by diffing the two documents: exactly one element differs —
    // `<path d="M89.6 150.4 L486.4 150.4" … stroke-dasharray="4 3"/>`.
    const polylines = (s: string) => (s.match(/<path /gu) ?? []).length; // cells-ok — a count
    const dashed = (s: string) => (s.match(/stroke-dasharray/gu) ?? []).length; // cells-ok — a count
    expect(dashed(svgHidden), "one dashed path fewer — the reference line").toBe(dashed(svgShown) - 1); // cells-ok — a count
    expect(svgHidden, "and its legend row stays").toMatch(/target/u);
    const svgSeries = plotToSvg(two({}, { hidden: true }), DARK_THEME) ?? "";
    expect(polylines(svgSeries), "a hidden series' polyline is gone").toBeLessThan(polylines(plotToSvg(two(), DARK_THEME) ?? ""));
    expect(svgSeries, "and it is still named").toMatch(/val/u);
  });
});
