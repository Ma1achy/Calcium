/**
 * AC — the four annotation kinds cross to the second arm (C12 I109, §3e).
 *
 * **The guard read as a ruling and was an omission.** `annotationMarks` opened
 * `if (a.kind !== "line") return []`, so `band`, `confidence` and `whiskers`
 * never reached the SVG arm; a `line` block with and without a `band` rendered
 * byte-identical documents, and the sweep recorded `line/confidence` beside
 * `line/confidence-unfilled` as a collision on `annotations.fill` — blaming a
 * member when the whole kind was missing. Nothing in §3e ruled the three
 * terminal-only.
 *
 * The rows here compare documents byte for byte, because that is the shape the
 * defect had, and then read the marks each kind became.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import type { Annotation } from "../../src/data/viewmodel/index.js";
import { plotToSvg } from "../../src/presentation/plot/svg.js";
import { DARK_THEME } from "../support/render.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";

const SIN = Array.from({ length: 12 }, (_v, i) => 50 + 40 * Math.sin(i / 2));

function svgOf(annotations: readonly Annotation[] | undefined, form: "line" | "scatter" = "line"): string {
  const b = block({
    kind: "plot", id: "p", form, height: 8, axes: true,
    series: [{ values: SIN, label: "obs" }],
    ...(annotations === undefined ? {} : { annotations }),
  } as never);
  const svg = plotToSvg(b, DARK_THEME);
  expect(svg, "the second arm draws the block").not.toBeNull();
  return svg ?? "";
}

/** The body's elements in order, so a row can ask what came before what. */
const elements = (svg: string): readonly string[] => svg.match(/<(?:path|rect|circle|polygon|text)\b[^>]*>/g) ?? [];
const dashed = (el: string): boolean => el.includes("stroke-dasharray");
/** A shade: translucent, and with no stroke of its own — absent or `none`. */
const isShade = (el: string): boolean =>
  el.includes("fill-opacity") && (!el.includes("stroke=") || el.includes('stroke="none"')) && !dashed(el);

describe("C12 I109 — every annotation kind crosses to the second arm", () => {
  it("AC1 (C12 I109, §3e): none against each kind differs byte for byte, and the control collapses", () => {
    const none = svgOf(undefined);
    const band = svgOf([{ kind: "band", from: 30, to: 70 }]);
    const conf = svgOf([{ kind: "confidence", upper: SIN.map((v) => v + 8), lower: SIN.map((v) => v - 8) }]);
    const confUnfilled = svgOf([{ kind: "confidence", fill: false, upper: SIN.map((v) => v + 8), lower: SIN.map((v) => v - 8) }]);
    const whiskers = svgOf([{ kind: "whiskers", points: SIN.map((v, i) => ({ x: i, y: v, err: 5 })) }], "scatter");
    const noneScatter = svgOf(undefined, "scatter");

    // **These four pairs were identical for the whole of the pass.**
    expect(none === band, "a band moves the document").toBe(false);
    expect(none === conf, "a confidence region moves the document").toBe(false);
    expect(noneScatter === whiskers, "whiskers move the document").toBe(false);
    expect(conf === confUnfilled, "`fill: false` moves the document — the pair the sweep called a collision").toBe(false);

    // **The control**: the drop rule. A band wholly outside the range says
    // nothing in the terminal and nothing here, so the comparison is seen to
    // produce equality when the marks are absent rather than always differing.
    const outside = svgOf([{ kind: "band", from: 500, to: 900 }]);
    expect(outside === none, "a band off the scale is dropped, so the documents agree").toBe(true);
    const lineOutside = svgOf([{ kind: "line", value: 900 }]);
    expect(lineOutside === none, "a reference line off the scale is dropped, not clamped to the ceiling").toBe(true);
  });

  it("AC2 (C12 I109): the marks each kind becomes — shade without stroke, edges dashed and broken, whiskers undashed", () => {
    // A band: one shaded rect and two dashed edges.
    const band = elements(svgOf([{ kind: "band", from: 30, to: 70 }]));
    const shades = band.filter((el) => el.startsWith("<rect") && isShade(el) && el.includes('fill-opacity="0.2"'));
    expect(shades.length, "one shaded interior").toBe(1);
    expect(band.filter((el) => el.startsWith("<path") && dashed(el)).length, "two dashed edges").toBe(2);

    // A band with one edge above the ceiling keeps its interior and loses that
    // edge — the interior clamps where the edge is dropped (§3e).
    const half = elements(svgOf([{ kind: "band", from: 60, to: 500 }]));
    expect(half.filter((el) => el.startsWith("<rect") && isShade(el)).length, "the interior is still drawn").toBe(1);
    expect(half.filter((el) => el.startsWith("<path") && dashed(el)).length, "and only the in-range edge is").toBe(1);

    // A confidence region: the shade carries no stroke, and the upper edge is
    // broken where the samples leave the scale — asserted as a run that ends
    // before the right edge rather than a stroke pinned along the ceiling.
    const upper = SIN.map((v, i) => (i >= 8 ? 500 : v + 8));
    const conf = elements(svgOf([{ kind: "confidence", upper, lower: SIN.map((v) => v - 8) }]));
    const region = conf.filter((el) => el.startsWith("<path") && isShade(el));
    expect(region.length, "one shaded region").toBe(1);
    expect(region[0]?.includes("stroke-dasharray"), "the shade is not dashed").toBe(false);
    const edges = conf.filter((el) => el.startsWith("<path") && dashed(el));
    expect(edges.length, "an upper run and a lower run").toBe(2);
    const xs = (el: string): number[] => [...el.matchAll(/[ML]([0-9.]+) /g)].map((m) => Number(m[1]));
    const upperRun = edges.map(xs).find((pts) => pts.length < SIN.length);
    expect(upperRun, "the upper edge stops where the samples leave the scale").toBeDefined();
    expect(upperRun?.length, "eight in-range samples").toBe(8);
    // **The control**: with every sample in range the upper edge spans the width.
    const full = elements(svgOf([{ kind: "confidence", upper: SIN.map((v) => v + 1), lower: SIN.map((v) => v - 1) }]));
    for (const el of full.filter((e) => e.startsWith("<path") && dashed(e))) expect(xs(el).length).toBe(SIN.length);

    // `fill: false`: the edges and no region.
    const unfilled = elements(svgOf([{ kind: "confidence", fill: false, upper: SIN.map((v) => v + 8), lower: SIN.map((v) => v - 8) }]));
    expect(unfilled.filter((el) => isShade(el)).length, "no shade").toBe(0);
    expect(unfilled.filter((el) => el.startsWith("<path") && dashed(el)).length, "two edges").toBe(2);

    // Whiskers: one polyline per point, none of them dashed — a dash would
    // break a one-sample vertical into dots.
    const pts = SIN.map((v, i) => ({ x: i, y: v, err: 5 }));
    const whisk = elements(svgOf([{ kind: "whiskers", points: pts }], "scatter"));
    const scatter = elements(svgOf(undefined, "scatter"));
    const added = whisk.filter((el) => !scatter.includes(el) && el.startsWith("<path"));
    expect(added.length, "one mark per point").toBe(pts.length);
    expect(added.some(dashed), "and none is dashed").toBe(false);
    for (const el of added) expect(xs(el).length, "a two-point vertical").toBe(2);
  });

  it("AC3 (C12 I109, §3e): the legend names the annotations, claims draw behind the data, and the violin's box is the counted exemption", () => {
    const labelled = CATALOGUE_FORMS.line["annotation-label"]!;
    const svg = plotToSvg(block({ kind: "plot", id: "p", ...labelled } as never), DARK_THEME) ?? "";
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(texts, "the legend names the reference line").toContain("budget");
    expect(texts, "and the band").toContain("warm-up");

    // Claims first: every shaded or dashed element precedes the series path.
    const els = elements(svgOf([{ kind: "band", from: 30, to: 70 }, { kind: "line", value: 50 }]));
    const series = els.findIndex((el) => el.startsWith("<path") && el.includes('stroke-width="2"'));
    const claims = els.map((el, i) => (isShade(el) || dashed(el) ? i : -1)).filter((i) => i >= 0);
    expect(claims.length, "a shade, its two edges, and the reference line").toBe(4);
    for (const i of claims) expect(i, "a claim is emitted before the series").toBeLessThan(series);

    // **The exemption, counted.** The violin's IQR box sits on the annotation
    // layer for its width and carries a `seriesIndex`; it is a datum, so it is
    // drawn opaque and after its density. Nineteen baselines is what moving it
    // would cost, and they did move in the first draft.
    const violin = CATALOGUE_FORMS.violin["default"]!;
    const vs = elements(plotToSvg(block({ kind: "plot", id: "v", ...violin } as never), DARK_THEME) ?? "");
    // `#141414` is `surface.bgDeep`, which is the violin box's own ink in the
    // *terminal* figure (F389) and is no longer the page — C10 I34 moved the
    // page to `surface.bg`. The `x="` filter predates that and still holds:
    // the page rect is placed by `width="100%"` and carries no `x`.
    const boxes = vs.filter((el) => el.startsWith("<rect") && el.includes('fill="#141414"') && el.includes('x="'));
    expect(boxes.length, "one IQR box per series").toBe(violin.series.length);
    for (const box of boxes) {
      expect(box.includes("fill-opacity"), "the box is opaque").toBe(false);
      const density = vs.findIndex((el) => el.startsWith("<path") && el.includes('stroke-width="2"') && el.includes(" Z"));
      expect(vs.indexOf(box), "and drawn over the density, not behind it").toBeGreaterThan(density);
    }
  });
});
