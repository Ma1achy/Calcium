/**
 * C04 I120 — every member `Plot` declares is refused a wrong value at the
 * document gate, and the members that are not are a named list with reasons.
 *
 * **I118 with its subject widened from the unions to the whole type.**
 * `PLOT_UNIONS` closed twenty-five members and nothing asked about the other
 * forty-four. Driving five wrong values at every optional member across all
 * forty-eight forms found **twenty refused by no form** — and the count of
 * appearances in `validate.ts` that first found fourteen was wrong in *both*
 * directions, which is why this file drives values rather than reading text
 * (F1082).
 *
 * **The table is the mechanism and the equality is what keeps it complete.** A
 * member added to `Plot` with no row here fails the first assertion rather than
 * arriving unchecked, which is MG31's shape one type wider.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { ONE_PER_FORM } from "../support/plot-forms.js";
import type { PlotForm } from "../../src/data/viewmodel/index.js";

/**
 * `Plot`'s top-level members, read from the declaration.
 *
 * Brace-matched rather than regex-bounded so a nested type's closing line
 * cannot end the body early, and the members are taken at depth zero so a
 * nested record's own keys are not read as `Plot`'s. The count is asserted
 * before anything is derived from the list, because a parse that finds nothing
 * satisfies every expectation downstream of it.
 */
function declaredMembers(): readonly string[] {
  const src = readFileSync("src/data/viewmodel/types.ts", "utf8");
  const from = src.indexOf("export type Plot = Readonly<{");
  const open = from + src.slice(from).indexOf("{");
  let depth = 0;
  let close = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  const out: string[] = [];
  let nested = 0;
  for (const line of src.slice(open + 1, close).split("\n")) {
    if (nested === 0) {
      const m = /^(\w+)\??\s*:/u.exec(line.trim());
      if (m?.[1] !== undefined) out.push(m[1]);
    }
    nested += (line.match(/[{[(]/gu) ?? []).length - (line.match(/[}\])]/gu) ?? []).length;
  }
  return out;
}

type Row = Readonly<{
  /** A form that carries the member, so the good value is legal where it is offered. */
  form: PlotForm;
  /** Accepted. Without it the row is satisfied by a gate that refuses everything. */
  good: unknown;
  /** Refused. A value of the wrong shape, not a near-miss inside the right one. */
  bad: unknown;
  /** Members the good value needs beside it — `calendarUnit` is meaningless without a date. */
  with?: Readonly<Record<string, unknown>>;
}>;

const QUARTILE = { min: 1, q1: 2, median: 3, q3: 4, max: 5 };

/**
 * One row per member `Plot` declares, compared to the declaration by equality
 * in both directions.
 *
 * The forms are chosen so the **good** value is legal: a member refused on
 * every form but one has that one here, because a good value offered where the
 * form refuses it would make the control fail for a reason the row is not about.
 */
const MEMBERS: Readonly<Record<string, Row>> = {
  id: { form: "line", good: "p", bad: 12_345 },
  form: { form: "line", good: "line", bad: "__unlikely__" },
  series: { form: "line", good: [{ values: [1, 2] }], bad: "__unlikely__" },
  height: { form: "line", good: 5, bad: "__unlikely__" },
  axes: { form: "line", good: true, bad: "__unlikely__" },
  xLabels: { form: "line", good: ["a", "b", "c"], bad: ["a", "b"] },
  xTitle: { form: "line", good: "t", bad: 12_345 },
  xMin: { form: "line", good: 0, bad: "__unlikely__" },
  xMax: { form: "line", good: 9, bad: "__unlikely__" },
  xFormat: { form: "line", good: "percent", bad: "__unlikely__" },
  yFormat: { form: "line", good: "percent", bad: "__unlikely__" },
  yMin: { form: "line", good: 0, bad: "__unlikely__" },
  yMax: { form: "line", good: 9, bad: "__unlikely__" },
  annotations: { form: "line", good: [{ kind: "line", value: 2 }], bad: ["__unlikely__"] },
  colormap: { form: "heatmap", good: "viridis", bad: "__unlikely__" },
  emptyMessage: { form: "line", good: "nothing to draw", bad: 12_345 },
  categories: { form: "bar", good: ["a", "b", "c"], bad: [12_345] },
  layout: { form: "bar", good: "grouped", bad: "__unlikely__" },
  binning: { form: "histogram", good: "scott", bad: "__unlikely__" },
  quartiles: { form: "boxplot", good: [QUARTILE], bad: [{ __unlikely__: true }] },
  ohlc: { form: "line", good: [{ open: 1, high: 4, low: 0, close: 2 }], bad: ["__unlikely__"] },
  offsets: { form: "waterfall", good: [0, 1, 2], bad: ["__unlikely__"] },
  totals: { form: "waterfall", good: [true, false, true], bad: ["__unlikely__"] },
  calendarUnit: { form: "calendar", good: "day", bad: "__unlikely__", with: { startDate: "2026-01-01", series: [{ values: [1, 2, 3] }] } },
  startDate: { form: "calendar", good: "2026-01-01", bad: 12_345 },
  bands: { form: "horizon", good: 3, bad: "__unlikely__" },
  facets: { form: "smallmultiples", good: [{ kind: "plot", id: "fx", form: "line", height: 3, series: [{ values: [1, 2] }] }], bad: ["__unlikely__"] },
  segments: { form: "pie", good: [{ label: "a", value: 1 }], bad: [{ __unlikely__: true }] },
  sizes: { form: "bubble", good: [1, 2, 3], bad: ["__unlikely__"] },
  xScale: { form: "line", good: "log", bad: "__unlikely__" },
  yScale: { form: "line", good: "log", bad: "__unlikely__" },
  plotDetail: { form: "boxplot", good: "full", bad: "__unlikely__" },
  levels: { form: "contour", good: [1, 2], bad: ["__unlikely__"] },
  layers: { form: "quiver", good: ["field"], bad: ["__unlikely__"] },
  fieldDim: { form: "quiver", good: "floor", bad: "__unlikely__" },
  glyphInk: { form: "quiver", good: "own", bad: "__unlikely__" },
  camera: { form: "plot3d", good: { azimuth: 0.5 }, bad: "__unlikely__" },
  plotStyle: { form: "line", good: "braille", bad: "__unlikely__" },
  plotFill: { form: "violin", good: "solid", bad: "__unlikely__" },
  plotGrid: { form: "radar", good: "circle", bad: "__unlikely__" },
  plotBox: { form: "boxplot", good: "line", bad: "__unlikely__" },
  plotCorners: { form: "bar", good: "sharp", bad: "__unlikely__" },
  orientation: { form: "bar", good: "vertical", bad: "__unlikely__" },
  bandwidth: { form: "density", good: 1, bad: "__unlikely__" },
  treeLayout: { form: "tree", good: "outline", bad: "__unlikely__" },
  graphLayout: { form: "graph", good: "layered", bad: "__unlikely__" },
  colourBy: { form: "plot3d", good: "depth", bad: "__unlikely__" },
  axes3: { form: "plot3d", good: "corner", bad: "__unlikely__" },
  origin3: { form: "plot3d", good: "centre", bad: "__unlikely__", with: { axes3: "origin" } },
  box3: { form: "plot3d", good: "back", bad: "__unlikely__" },
  axisStyle3: { form: "plot3d", good: { x: { label: "x" } }, bad: "__unlikely__" },
  matrixAnchor: { form: "heatmap", good: "window", bad: "__unlikely__" },
  legend: { form: "line", good: "below", bad: "__unlikely__" },
  plotFrame: { form: "line", good: "box", bad: "__unlikely__" },
  yAxis: { form: "line", good: "left", bad: "__unlikely__" },
  yCallout: { form: "line", good: "last", bad: "__unlikely__", with: { yAxis: "right" } },
  width: { form: "line", good: 40, bad: "__unlikely__" },
  aspect: { form: "line", good: 2, bad: "__unlikely__" },
  align: { form: "line", good: "centre", bad: "__unlikely__", with: { width: 40 } },
  origin: { form: "line", good: "bottom-left", bad: "__unlikely__" },
  axisCross: { form: "line", good: "zero", bad: "__unlikely__", with: { yMin: -1, yMax: 1 } },
  hierarchy: { form: "treemap", good: { label: "root", value: 2, children: [{ label: "a", value: 1 }, { label: "b", value: 1 }] }, bad: "__unlikely__" },
  graph: { form: "graph", good: { nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "a", to: "b" }] }, bad: "__unlikely__" },
  vectors: { form: "quiver", good: [{ values: [[1, 0], [0, 1]], label: "a" }], bad: ["__unlikely__"] },
  points3: { form: "plot3d", good: [{ label: "a", points: [{ x: 0, y: 0, z: 0 }] }], bad: ["__unlikely__"] },
  lines3: { form: "plot3d", good: [{ label: "a", points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }] }], bad: ["__unlikely__"] },
  surfaces3: { form: "plot3d", good: [{ label: "a", heights: [[0, 1], [1, 0]], xRange: [0, 1], yRange: [0, 1] }], bad: ["__unlikely__"] },
  light3: { form: "plot3d", good: { azimuth: 0.5, elevation: 0.5 }, bad: "__unlikely__" },
};

/**
 * Members with no row, each with the reason there is none.
 *
 * The allow-list shape rather than a narrowed subject: a member absent from
 * both records is *named* by the equality below rather than silently uncovered.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  kind: "an unknown kind is skipped rather than refused (C04 I119) — the block union is open at the type level, so `kind` is the one member whose wrong value is a different block and not a fault",
};

const META = {
  verb: null, adapter: "shell", stderr: "", exitCode: 0, durationMs: 1,
  truncated: false, argv: ["x"], transport: "subprocess" as const, origin: "user" as const,
};

function errsFor(form: PlotForm, over: Readonly<Record<string, unknown>>): readonly string[] {
  const base = { ...ONE_PER_FORM[form] } as Record<string, unknown>;
  const r = validateDocument({
    schema: "tui.view/1", command: "x", status: "ok", meta: META,
    blocks: [{ ...base, ...over }],
  } as never);
  return r.ok ? [] : r.error;
}

describe("C04 I120 — a wrong value per member, driven at every member Plot declares", () => {
  it("T1.43 (C04 I120, F1082): the table equals the declaration, and every wrong value is refused", () => {
    // **The corpus first.** A brace match that finds nothing yields an empty
    // list, and an empty list satisfies every equality and every loop below it.
    const declared = declaredMembers();
    expect(declared, "Plot's declaration parses").toHaveLength(69);

    // **Equality in both directions**, which is what makes a member added to
    // the type unchecked-*and-reported* rather than unchecked. A subset check
    // would let a member arrive with no row, and a row outlive its member.
    const covered = [...Object.keys(MEMBERS), ...Object.keys(EXEMPT)].sort((a, b) => a.localeCompare(b));
    expect(covered, "every member has a row or a reason, and no row outlives its member")
      .toEqual([...declared].sort((a, b) => a.localeCompare(b)));

    // **The control the fixtures give for free**: the bases these rows override
    // must themselves validate, or a refusal below is the fixture's.
    for (const [member, row] of Object.entries(MEMBERS)) {
      expect(errsFor(row.form, {}), `the ${row.form} fixture is clean, for ${member}`).toEqual([]);
    }

    const accepted: string[] = [];
    for (const [member, row] of Object.entries(MEMBERS)) {
      if (errsFor(row.form, { ...row.with, [member]: row.bad }).length === 0) accepted.push(member);
    }
    expect(accepted, "every member refuses a value of the wrong shape").toEqual([]);

    // **The exemption list is the escape hatch, so it is driven too.** Moving a
    // member from `MEMBERS` to `EXEMPT` drops it out of both loops above, and
    // nothing here would have failed — an allow-list whose entries are never
    // checked silences a member as effectively as having no rule at all. So
    // each stated exemption has to *hold*: the member must genuinely accept the
    // wrong value its reason claims it does.
    const notExempt: string[] = [];
    for (const member of Object.keys(EXEMPT)) {
      if (errsFor("line", { [member]: "__unlikely__" }).length > 0) notExempt.push(member);
    }
    expect(notExempt, "an exemption states something true, or it is a check written as a reason").toEqual([]);

    // **The nesting, which the table above cannot reach — and the mutation pass
    // is what asked.** `facets` holds child plots, and `childBlocksOf` had arms
    // for containers and for a table's row detail and none for them, so every
    // rule in this file stopped at the first level. Removing that arm left all
    // three rows green: the table's own bad value is `["__unlikely__"]`, refused
    // by the member check for not being a record, which says nothing about
    // whether anything descends. A **well-formed facet with a bad member inside**
    // is the only shape that separates the two.
    expect(errsFor("smallmultiples", {
      facets: [{ kind: "plot", id: "fx", form: "line", height: 3, series: [{ values: [1, 2] }], yMin: "__unlikely__" }],
    }), "a fault inside a facet").not.toEqual([]);
    // And the whole walk, not only the member rules: ids are document-wide, so a
    // facet reusing its parent's is a duplicate the walk names.
    expect(errsFor("smallmultiples", {
      id: "dup", facets: [{ kind: "plot", id: "dup", form: "line", height: 3, series: [{ values: [1, 2] }] }],
    }), "a facet reusing its parent's id").not.toEqual([]);
    // The control — the same facet with nothing wrong in it is accepted, so the
    // two rows above are about the fault and not about descending at all.
    expect(errsFor("smallmultiples", {
      facets: [{ kind: "plot", id: "fx", form: "line", height: 3, series: [{ values: [1, 2] }] }],
    }), "the control").toEqual([]);
  });

  it("T1.44 (C04 I120): the control — every member's own legitimate value is accepted", () => {
    // Without this row T1.43 is satisfied by a gate that refuses everything,
    // which is T1.36's argument one type wider.
    const refused: string[] = [];
    for (const [member, row] of Object.entries(MEMBERS)) {
      const e = errsFor(row.form, { ...row.with, [member]: row.good });
      if (e.length > 0) refused.push(`${member}: ${e[0] ?? ""}`);
    }
    expect(refused.join("\n"), "a legitimate value is accepted on a form that carries the member").toBe("");
  });

  it("T1.45 (C04 I120, F1082): the three shapes named rather than looped", () => {
    // **Read then skipped.** `plotAxisCrossErrors` was the only reader of
    // `yMin`, three guards deep, and the line touching its type was
    // `if (typeof lo !== "number" …) return;` — the type check used to skip
    // rather than to refuse, which from a grep is indistinguishable from a
    // check.
    expect(errsFor("line", { yMin: "__unlikely__" }), "a mistyped edge").not.toEqual([]);

    // **Gated behind a sibling.** `startDate` had a check, and a good one, under
    // `plotCalendarErrors`' opening `if (unit === undefined) return;`.
    expect(errsFor("calendar", { startDate: 12_345 }), "a date with no calendarUnit beside it").not.toEqual([]);
    expect(errsFor("calendar", { startDate: 12_345, calendarUnit: "day" }), "and with one").not.toEqual([]);

    // **The relation no member rule can see.** Two well-typed numbers that draw
    // a collapsed axis: three identical gutter captions and the series flattened
    // to a straight line, with no error anywhere.
    expect(errsFor("line", { yMin: 6, yMax: 0 }), "an inverted range").not.toEqual([]);
    expect(errsFor("line", { yMin: 3, yMax: 3 }), "a range of no height").not.toEqual([]);
    expect(errsFor("line", { xMin: 6, xMax: 0 }), "the abscissa, by the same argument").not.toEqual([]);
    expect(errsFor("line", { yMin: 0, yMax: 6 }), "the control — an ordered range is accepted").toEqual([]);
  });
});
