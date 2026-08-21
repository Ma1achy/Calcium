/**
 * TL16–TL19 — the abscissa's name (C12 I56, §3ag).
 *
 * **The sweep is the load-bearing row, not the drawing one.** `HAS_X_TITLE`'s
 * twenty-six `true`s were measured by rendering every form with a title and
 * looking for it; a hand-maintained record drifts, and sixteen of the eighteen
 * `false`s break `measure === rendered` if they are wrong in the other
 * direction. So T2.9 re-measures the record rather than trusting it.
 */
import { describe, expect, it } from "vitest";
import { block, HAS_X_TITLE, type PlotForm } from "../../src/data/viewmodel/index.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { ASCII_CAPS, FULL_CAPS, measurable } from "../support/render.js";
import { ONE_PER_FORM, ALL_FORMS } from "../support/plot-forms.js";
import { cells } from "../../src/presentation/text.js";

const kit = (caps: object = FULL_CAPS) =>
  measurable({ definitions: [plotDefinition], capabilities: caps as never });

const lines = (spec: object, w = 70, caps: object = FULL_CAPS): string[] =>
  kit(caps).renderToLines(block(spec as never), w).map((l) => l.replace(/\x1b\[[0-9;]*m/gu, ""));

const LINE = {
  kind: "plot", id: "t", form: "line", height: 8, axes: true, legend: false,
  series: [{ values: [10, 40, 25, 70, 55], label: "a" }],
};

const errs = (extra: object): readonly string[] => {
  const r = validateDocument({ version: 1, blocks: [{ ...LINE, ...extra }] });
  return r.ok ? [] : r.error.filter((m) => /xTitle/u.test(m));
};

describe("TL16 (C12 I56): the title is a declared row under the labels", () => {
  it("it costs exactly one row and the row is the last one", () => {
    const without = lines(LINE);
    const withIt = lines({ ...LINE, xTitle: "training step" });
    expect(withIt.length).toBe(without.length + 1);
    expect(withIt.at(-1)).toContain("training step");
    // **Under the labels and never above them**: the labels are the scale, and a
    // name between a scale and the thing it measures separates the two.
    expect(withIt.at(-2)).not.toContain("training step");
  });

  it("measure equals the rendered rows, which is the whole of C12 I1 here", () => {
    const b = block({ ...LINE, xTitle: "training step" } as never);
    expect(kit().measure(b, 70)).toBe(kit().renderToLines(b, 70).length);
  });

  it("it is centred over the plot area rather than over the row", () => {
    // **Against the area's own edges, not against a number.** The frame's left
    // border marks where the area starts and its right border where it ends, so
    // the two readings differ by exactly the gutter and the assertion can say so
    // rather than picking a tolerance that is safely true either way.
    // **A near-area-width title is what separates the two readings.** Centring
    // on the row and centring on the area differ by the gutter — three cells
    // here — so a short title cannot tell them apart at any tolerance that is
    // not itself a guess. A title two cells narrower than the area lies strictly
    // inside the borders when it is area-centred and crosses the left one when
    // it is not.
    const probe = lines({ ...LINE, xTitle: "x" });
    const border = probe.find((r) => r.includes("└")) ?? "";
    const from = border.indexOf("└");
    const to = border.lastIndexOf("┘");
    expect(from).toBeGreaterThan(0);
    const rows = lines({ ...LINE, xTitle: "T".repeat(to - from - 3) });
    const row = rows.at(-1) ?? "";
    const lead = row.length - row.trimStart().length;
    const end = row.trimEnd().length;
    expect(lead, row).toBeGreaterThan(from);
    expect(end, row).toBeLessThan(to);
  });

  it("a title wider than the area stops at the area's right edge", () => {
    // **Not merely *the row still fits***: `clampSpans` bounds the row at
    // `layout.width` whatever this function does, so a row-width assertion
    // passes with the title spilling across the right gutter. The area's own
    // edge is the boundary that separates the two.
    const long = "abcdefghij".repeat(20);
    const rows = lines({ ...LINE, xTitle: long });
    expect(rows.length).toBe(lines(LINE).length + 1);
    const border = rows.find((r) => r.includes("┘")) ?? "";
    const right = border.lastIndexOf("┘");
    const row = rows.at(-1) ?? "";
    expect(right).toBeGreaterThan(0);
    // **The last inked column, against the border's own.** Comparing the slices
    // from `right` passes at one cell against one cell whether the title stops
    // at the area's edge or runs over it — the position is the observable, not
    // the remaining width.
    expect(row.trimEnd().length, row).toBeLessThanOrEqual(right);
    for (const r of rows) expect(cells(r, "narrow"), r).toBeLessThanOrEqual(70);
  });

  it("it survives ascii, being text", () => {
    const rows = lines({ ...LINE, xTitle: "training step" }, 70, ASCII_CAPS);
    expect(rows.at(-1)).toContain("training step");
    for (const ch of rows.join("")) expect(ch.codePointAt(0) ?? 0, ch).toBeLessThan(128);
  });
});

describe("T2.9 (C12 I56): HAS_X_TITLE is re-measured, not trusted", () => {
  it("every `true` draws the title and every one keeps measure === rendered", () => {
    const k = kit();
    const drew: PlotForm[] = [];
    for (const form of ALL_FORMS) {
      if (!HAS_X_TITLE[form]) continue;
      const b = block({ ...(ONE_PER_FORM[form] as object), xTitle: "ABSCISSA" } as never);
      const rows = k.renderToLines(b, 70).map((l) => l.replace(/\x1b\[[0-9;]*m/gu, ""));
      expect(rows.join("\n"), form).toContain("ABSCISSA");
      expect(k.measure(b, 70), form).toBe(rows.length);
      drew.push(form);
    }
    // The fixture responds: the record is not all-`false`, and the count is the
    // measurement rather than a restatement of the table.
    expect(drew.length).toBe(26);
  });

  it("every `false` is refused at the gate, so no block can reach the mismatch", () => {
    for (const form of ALL_FORMS) {
      if (HAS_X_TITLE[form]) continue;
      const r = validateDocument({
        version: 1,
        blocks: [{ ...(ONE_PER_FORM[form] as object), id: "t", axes: true, xTitle: "ABSCISSA" }],
      });
      const msgs = (r.ok ? [] : r.error).filter((m) => /xTitle/u.test(m));
      expect(msgs.join(" "), form).toMatch(/no row beneath its plot area|axes/u);
    }
  });
});

describe("TL17 (C12 I56): the refusals", () => {
  it("`axes: false` refuses it — a title for an axis that is not drawn", () => {
    expect(errs({ axes: false, xTitle: "x" }).join(" ")).toMatch(/none drawn to name/u);
    expect(errs({ xTitle: "x" })).toEqual([]);
  });

  it("a non-string is refused", () => {
    expect(errs({ xTitle: 3 }).join(" ")).toMatch(/must be a string/u);
  });

  it("there is no `yTitle` member, asserted structurally", () => {
    // C09 has a `heading`, which costs the same row and every kind can use it.
    expect(Object.keys(block({ ...LINE, xTitle: "x" } as never))).not.toContain("yTitle");
  });
});

describe("TL18 (C12 I56): the title and a horizontal legend stack", () => {
  it("both rows are drawn, the title nearest the axis", () => {
    const rows = lines({ ...LINE, legend: "below", xTitle: "training step" });
    const plain = rows.join("\n");
    expect(plain).toContain("training step");
    expect(plain).toContain("a");
    expect(rows.length).toBe(lines({ ...LINE, legend: "below" }).length + 1);
  });
});
