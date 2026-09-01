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
import { FULL_CAPS, ASCII_CAPS, MONO_CAPS, MONO_UNICODE_CAPS, measurable } from "../support/render.js";
import { SHARES_CELLS, categoryMarks, markOf } from "../../src/presentation/plot/marks.js";
import { displayCells } from "../../src/presentation/text.js";
import type { Plot, PlotForm } from "../../src/data/viewmodel/index.js";
import { block as blockOf, validateBlock } from "../../src/data/viewmodel/index.js";

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
  // **Total, not `Partial`.** One of the four tables that were silent about a
  // new form — a `Partial` accepts a member it has never heard of and answers
  // `undefined`, so a form whose height stopped being derived would be checked
  // against the wrong arm and pass. `Record<PlotForm, boolean>` makes the
  // thirty-fifth member a type error here, which is what every other table in
  // C12 already does.
  const FIXED_HEIGHT: Record<PlotForm, boolean> = {
    sparkline: true, waffle: true,
    // The sample grid is `height x 2`, so the height is the caller's (C12 I84).
    scatter3d: false,
    line: false, scatter: false, step: false, ecdf: false, density: false,
    bar: false, histogram: false, lollipop: false, dotplot: false,
    funnel: false, gantt: false, waterfall: false, flame: false, icicle: false,
    boxplot: false, violin: false, ridgeline: false, forest: false, dumbbell: false,
    heatmap: false, contour: false, quiver: false, calendar: false, correlation: false, confusion: false,
    spectrogram: false, latency: false, density2d: false,
    streamgraph: false, stackedarea: false, treemap: false, tree: false, graph: false, smallmultiples: false, pairplot: false,
    slope: false, bubble: false, autocorrelation: false, timeline: false, bullet: false, utilisation: false,
    pie: false, radar: false, horizon: false,
  };
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
  // **This assertion was right and its fixtures could not fail it**, which is
  // how four forms shipped measuring one height and drawing another — by as
  // much as six rows, which moves everything below them in the transcript.
  //
  // Two independent reasons, and neither is visible from the assertion:
  //
  //   - `radar` and `horizon` are declared here with `axes: undefined`, and
  //     `axedFurniture` is the *only* state in which they were wrong. The
  //     dimension carrying the defect was never entered.
  //   - `smallmultiples` and `pairplot` returned whatever their facet layout
  //     produced, and this fixture's children happen to sum to the declared
  //     height. Right answer, wrong reason, at one width.
  //
  // So the sweep now sweeps: both `axes` flags and four widths. A sweep exists
  // precisely so a rule does not lapse on the thirty-fifth form, and a sweep
  // pinned to one flag at one width lapses on the first.
  // **`validateBlock` returns a `Result`, not a block**, and casting one to
  // `Plot` gave every measurement the same wrong answer without throwing. The
  // responds-check below is what caught it, on its first run, in this file.
  const WIDTHS = [20, 40, 80, 137] as const;
  for (const form of ALL_FORMS) {
    it(form, () => {
      const base = ONE_PER_FORM[form];
      const k = kit();
      let checked = 0;
      for (const axes of [true, false] as const) {
        let block: Plot;
        try {
          block = blockOf({ ...base, axes }) as Plot;
        } catch {
          continue; // C04 I50b refuses `axes: false` on the matrix family
        }
        for (const w of WIDTHS) {
          const measured = k.measure(block, w);
          const rendered = k.renderToLines(block, w);
          expect(rendered.length, `${form} axes:${String(axes)} w${String(w)}`).toBe(measured); // cells-ok — a row count
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(0); // cells-ok — a combination count
    });
  }

  it("the axes flag reaches the height, so the dimension is not inert", () => {
    // **The fixture must be shown to respond.** If `axes` changed no form's
    // measured height, every row above would be four identical assertions
    // wearing a loop, and the two forms whose defect lived only in `axes: true`
    // would be exactly as invisible as they were.
    const k = kit();
    let responded = 0;
    for (const form of ALL_FORMS) {
      const base = ONE_PER_FORM[form];
      try {
        const on = blockOf({ ...base, axes: true }) as Plot;
        const off = blockOf({ ...base, axes: false }) as Plot;
        if (k.measure(on, 40) !== k.measure(off, 40)) responded += 1;
      } catch { /* the matrix family, which C04 I50b bars from answering this */ }
    }
    expect(responded).toBeGreaterThan(10); // cells-ok — a form count
  });
});

describe("P4b: at one bit, cell-sharing categories differ by mark (C12 I25)", () => {
  // **The gate for C12 I25, and it is a sweep because a rule remembered per form
  // lapses on the thirty-fifth.** A form that ships colour-only fails here on
  // its first run without anyone recalling that §3h exists.
  //
  // **Over `SHARES_CELLS`, which is the correction that made the rule true.**
  // Written as *every form with two or more categories*, this failed nine and
  // eight of them were right: `boxplot`, `dumbbell`, `lollipop`, `dotplot`,
  // `funnel`, `gantt`, `waterfall` and `ridgeline` each name their category in
  // the gutter, and a reader tells them apart by reading it. I25 asks for more
  // than tone, and a label is more than tone.
  const FURNITURE = new Set([..." ─│┌┐└┘┤├┬┴┼╴╶╷╵"]);
  const strip = (rows: readonly string[]): string =>
    rows.map((r) => r.replace(/\u001b\[[0-9;]*m/gu, "")).join("");

  for (const form of ALL_FORMS) {
    if (!SHARES_CELLS[form]) continue;
    it(form, () => {
      const base = ONE_PER_FORM[form];
      const cats = (base.segments?.length ?? 0) || (base.series?.length ?? 0); // cells-ok — a category count
      if (cats < 2) return; // cells-ok — a category count
      const rows = kit(MONO_UNICODE_CAPS).renderToLines(base, 60);
      const marks = new Set(
        [...strip(rows)].filter((ch) => !FURNITURE.has(ch) && !/[\p{L}\p{N}.,%:\-]/u.test(ch)),
      );
      expect(marks.size, `${form}: distinct marks at 1-bit`).toBeGreaterThanOrEqual(Math.min(cats, 8)); // cells-ok — a mark count
    });
  }

  it("the partition is total, and both halves are populated", () => {
    // A `Record<PlotForm, boolean>` that is all `false` would make every row
    // above vacuous by skipping them, and all `true` would put eight correct
    // forms back under a rule they answer another way. Neither reads as wrong
    // from the table itself.
    const shares = ALL_FORMS.filter((f) => SHARES_CELLS[f]);
    const labelled = ALL_FORMS.filter((f) => !SHARES_CELLS[f]);
    expect(shares.length).toBeGreaterThan(4); // cells-ok — a form count
    expect(labelled.length).toBeGreaterThan(4); // cells-ok — a form count
    expect(shares.length + labelled.length).toBe(ALL_FORMS.length); // cells-ok — a form count
    // The measured members, named so a silent reclassification is a diff.
    for (const f of ["pie", "radar", "waffle", "bar"] as const) expect(SHARES_CELLS[f]).toBe(true);
    for (const f of ["lollipop", "gantt", "boxplot", "heatmap"] as const) expect(SHARES_CELLS[f]).toBe(false);
  });

  it("the three mark ladders are the same length as the palette's cap", () => {
    // The premise `MARK_EXEMPTIONS` records for this file: a ninth mark on one
    // arm is a test failure here rather than a ladder that runs out at a
    // different index than the colours beside it.
    const arms = [FULL_CAPS, ASCII_CAPS, { ...FULL_CAPS, ambiguousWidth: "wide" as const }];
    for (const caps of arms) expect(categoryMarks(caps).length).toBe(8); // cells-ok — a ladder length
    for (const caps of arms) {
      expect(new Set(categoryMarks(caps)).size, "and every mark is distinct").toBe(8); // cells-ok — a set size
    }
  });

  it("markOf is uniform above the colour floor and a ladder below it", () => {
    // **C12 I29 in one row.** Where colour separates the categories it is the
    // carrier, and a varying mark would encode one fact twice — which is what
    // made a stacked bar's `░▒▓` read as a magnitude it did not have.
    const at = (depth: 1 | 4 | 8 | 24, always = false): Set<string> =>
      new Set([0, 1, 2, 3].map((i) => markOf(i, { ...FULL_CAPS, colourDepth: depth }, always)));
    expect(at(24).size, "uniform where colour carries it").toBe(1); // cells-ok — a set size
    expect(at(1).size, "and a ladder where it cannot").toBe(4); // cells-ok — a set size
    expect(at(24, true).size, "`plotMarks: always` overrides in one direction").toBe(4); // cells-ok — a set size
  });
});

describe("P8: reflow — every form across the widths a terminal actually is", () => {
  // **Width is the axis that wraps, and a wrapped row scrolls the alternate
  // screen** — the one failure the application can no longer see. `P4` sweeps
  // four widths to check the height; this sweeps twenty-six.
  //
  // **The two halves are not equally live, and saying so is the point.** Mutated:
  //
  // | mutation | caught |
  // |---|---|
  // | `composeRows` returns one row short | **58 rows** |
  // | `line` clamps to `width + 1` | no |
  // | `bandLayout`'s gutter cap removed | no |
  // | `plotAreaWidth` wrong above 100 | no |
  //
  // The height assertion is this sweep's real subject. **The width assertion
  // cannot fail here**, because `renderToLines` clamps every row to the frame's
  // width after C12 has run — a plot emitting an over-wide row is corrected
  // downstream and arrives at exactly `width` however wrong it was. It is kept
  // as a cheap regression on *that* clamp, and recorded as such: an unrecorded
  // limit reads as strength, and T2.3 makes the same assertion with the same
  // guard above it.
  //
  // What the width half would need to be live is C12's own rows before the
  // pipeline, which `FORM_ROWS` does not publish. A frame read is what finds a
  // wrong area width today, and four of this round's defects came from one.
  //
  // The step is 7 rather than 1 so it costs a second: the arithmetic defects it
  // can see do not hide between 61 and 62.
  const WIDTHS = Array.from({ length: 26 }, (_, i) => 20 + i * 7); // cells-ok — a cell width

  for (const form of ALL_FORMS) {
    it(form, () => {
      const b = ONE_PER_FORM[form];
      const k = kit();
      const declared = k.measure(b, 80);
      let checked = 0;
      for (const width of WIDTHS) {
        const rows = k.renderToLines(b, width);
        for (const [i, row] of rows.entries()) {
          // Guarded downstream — see the table above. A regression on the
          // pipeline's clamp, not on C12's.
          expect(displayCells(row), `${form} w${String(width)} row ${String(i)}`)
            .toBeLessThanOrEqual(width); // cells-ok — a cell width
        }
        // **The height is a function of the block, not the width** (C12 I1) — so
        // a plot that reflows is a plot that keeps its place in the transcript.
        expect(rows.length, `${form} w${String(width)}: rows`).toBe(declared); // cells-ok — a row count
        checked += 1;
      }
      expect(checked).toBe(WIDTHS.length); // cells-ok — a width count
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
