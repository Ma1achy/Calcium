/**
 * TL10–TL15 — a name beside a sample (C12 I55, §3ag · C04 I63).
 *
 * **Two positions and never a slide** is the claim, and the row that carries it
 * asserts the *sample's own cell* rather than only that the label is inside the
 * area: a slide that stopped one cell short of the edge satisfies *inside* and
 * covers the anchor, which is the reading the rule exists to refuse.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { ASCII_CAPS, FULL_CAPS, MONO_CAPS, measurable } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";

const V = [10, 42, 25, 88, 55, 30, 70, 15];
const kit = (caps: object = FULL_CAPS) =>
  measurable({ definitions: [plotDefinition], capabilities: caps as never });

const draw = (extra: object, w = 70, caps: object = FULL_CAPS): string[] =>
  kit(caps).renderToLines(block({
    kind: "plot", id: "p", form: "scatter", height: 9, axes: true, legend: false,
    series: [], ...extra,
  } as never), w).map((l) => l.replace(/\x1b\[[0-9;]*m/gu, ""));

const at = (labels: (string | null)[], extra: object = {}, w = 70, caps: object = FULL_CAPS): string[] =>
  draw({ series: [{ values: V, label: "a", pointLabels: labels }], ...extra }, w, caps);

const rowWith = (rows: readonly string[], text: string): string =>
  rows.find((r) => r.includes(text)) ?? "";

const errs = (series: object[]): readonly string[] => {
  const r = validateDocument({
    version: 1,
    blocks: [{ kind: "plot", id: "p", form: "scatter", height: 6, series }],
  });
  return r.ok ? [] : r.error.filter((m) => /pointLabels/u.test(m));
};

describe("TL10 (C12 I55): the label sits beside the sample, never over it", () => {
  it("a label with room to its right is drawn there, one blank from the dot", () => {
    const row = rowWith(at([null, "peak", null, null, null, null, null, null]), "peak");
    expect(row).toMatch(/[⠁⠂⠄⠈⠐⠠⡀⢀] peak/u);
  });

  it("a label at the right edge flips left and the sample's own cell keeps its ink", () => {
    // **Both halves in one row.** A slide inward satisfies *inside the area* and
    // covers the anchor; only the anchor's own cell can tell the two apart.
    const rows = at([null, null, null, null, null, null, null, "flipsleft"]);
    const row = rowWith(rows, "flipsleft");
    expect(row).toMatch(/flipsleft [⠁⠂⠄⠈⠐⠠⡀⢀]/u);
    // The fixture responds: the same label on an interior sample draws right.
    expect(rowWith(at([null, "flipsleft", null, null, null, null, null, null]), "flipsleft"))
      .toMatch(/[⠁⠂⠄⠈⠐⠠⡀⢀] flipsleft/u);
  });

  it("every area row is exactly the frame's width, labels or not", () => {
    // The x-caption row is 69 with or without labels — it is not bounded by the
    // frame edge and never was, so the assertion is scoped to the rows that are.
    const area = (rows: readonly string[]): readonly string[] => rows.filter((r) => /[│|]$/u.test(r));
    for (const rows of [at([null, "peak", null, "outlier", null, null, null, "tail"]), at([])]) {
      expect(area(rows).length).toBeGreaterThan(4);
      for (const r of area(rows)) expect(cells(r, "narrow"), r).toBe(70);
    }
  });
});

describe("TL10b (C12 I55, §3ag A14): the padding is transparent", () => {
  it("a sample under the slot's pad still draws", () => {
    // **Read from the corpus first**: `last` at the right edge renders `⢀last⡀`,
    // the curve showing through both pad cells. Opaque padding would delete two
    // samples to separate one name from its own dot.
    const dense = Array.from({ length: 120 }, (_v, i) => 50 + 40 * Math.sin(i / 7)); // cells-ok — a sample count
    const labels: (string | null)[] = dense.map(() => null);
    labels[60] = "mid";
    const rows = draw({ series: [{ values: dense, label: "a", pointLabels: labels }] });
    const row = rowWith(rows, "mid");
    // Something other than a blank on at least one side of the name — the curve
    // is dense enough that a pad cell falls on ink, which is the case at issue.
    expect(row).toMatch(/[^ ]mid|mid[^ ]/u);
  });
});

describe("TL11 (C12 I55): one pass, free cells only, and the survivor is marked", () => {
  it("a second label takes the other side rather than being dropped", () => {
    const rows = draw({ series: [
      { values: V, label: "a", pointLabels: [null, "alpha", null, null, null, null, null, null] },
      { values: V, label: "b", pointLabels: [null, "beta", null, null, null, null, null, null] },
    ] });
    const row = rowWith(rows, "alpha");
    expect(row).toContain("beta");
    expect(row).toMatch(/beta [⠁⠂⠄⠈⠐⠠⡀⢀] alpha/u);
  });

  it("a third, with both sides taken, is dropped and the survivor carries a `+`", () => {
    const rows = draw({ series: [
      { values: V, label: "a", pointLabels: [null, "aaaaaaaaaaaaaa", null, null, null, null, null, null] },
      { values: V, label: "b", pointLabels: [null, "bbbbbbbbbbbbbb", null, null, null, null, null, null] },
      { values: V, label: "c", pointLabels: [null, "cccccccccccccc", null, null, null, null, null, null] },
    ] });
    const row = rowWith(rows, "aaaaaaaaaaaaaa");
    expect(row).not.toContain("cccccccccccccc");
    expect(row).toContain("+");
    // **Not `+N`** — the count is what C12 I48 refused and §3ag.4 records why.
    expect(row).not.toMatch(/\+\d/u);
  });

  it("the `+` sits at the slot's outer edge, so it never lands between a dot and its name", () => {
    // **A left-placed survivor is the only arrangement that separates the two
    // readings.** Put a long label on the last sample: the right candidate is
    // off the edge, so it flips left, and a second label at the same sample is
    // blocked by it. With the mark at `start + span - 1` the `+` lands on the
    // *gap* cell, between the label and the dot it names.
    const rows = draw({ series: [
      { values: V, label: "a", pointLabels: [null, null, null, null, null, null, null, "aaaaaaaa"] },
      { values: V, label: "b", pointLabels: [null, null, null, null, null, null, null, "bbbbbbbb"] },
    ] });
    const row = rowWith(rows, "aaaaaaaa");
    expect(row).not.toContain("bbbbbbbb");
    expect(row).toMatch(/\+aaaaaaaa [⠁⠂⠄⠈⠐⠠⡀⢀]/u);
  });

  it("the frame does not depend on which series was considered first", () => {
    // A rule that let a later label displace an earlier one returns a different
    // frame for the same data in the other order.
    const one = draw({ series: [
      { values: V, label: "a", pointLabels: [null, "alpha", null, null, null, null, null, null] },
      { values: V, label: "b", pointLabels: [null, "beta", null, null, null, null, null, null] },
    ] });
    const two = draw({ series: [
      { values: V, label: "b", pointLabels: [null, "beta", null, null, null, null, null, null] },
      { values: V, label: "a", pointLabels: [null, "alpha", null, null, null, null, null, null] },
    ] });
    expect(rowWith(one, "alpha")).not.toBe(rowWith(two, "alpha"));
  });
});

describe("TL12 (C12 I55, C12 I6): the names reach the arm that stops overlaying", () => {
  it("at one bit with two series each strip carries its own names", () => {
    // **The arm the callout's own comment warns about**: a layer built only in
    // the overlaid path accepts the field and draws nothing at one bit, on the
    // exact terminals where a reader most needs it spelled out.
    const rows = draw({ series: [
      { values: V, label: "a", pointLabels: [null, "alpha", null, null, null, null, null, null] },
      { values: V.map((x) => x + 1), label: "b", pointLabels: [null, "beta", null, null, null, null, null, null] },
    ] }, 70, MONO_CAPS);
    const text = rows.join("\n");
    expect(text).toContain("alpha");
    expect(text).toContain("beta");
  });

  it("there is no mark prefix at any capability, because no arm can reach one", () => {
    // **The arm was written before it was reachable.** Above `markOf`'s floor
    // colour separates the categories; below it the form stacks and the gutter
    // names each strip. Every form taking `pointLabels` is in
    // `POSITIONAL_STACKS`, so the two meet with nothing between them.
    for (const caps of [FULL_CAPS, MONO_CAPS] as const) {
      const row = rowWith(at([null, "peak", null, null, null, null, null, null], {}, 70, caps), "peak");
      expect(row, JSON.stringify(caps)).not.toMatch(/\S \S peak/u);
    }
  });

  it("above the floor the label is one blank from its sample and nothing else", () => {
    const rows = draw({ series: [
      { values: V, label: "a", pointLabels: [null, "alpha", null, null, null, null, null, null] },
      { values: V, label: "b", pointLabels: [null, "beta", null, null, null, null, null, null] },
    ] });
    expect(rowWith(rows, "alpha")).toMatch(/[⠁⠂⠄⠈⠐⠠⡀⢀] alpha/u);
  });
});

describe("TL13 (C12 I55): a name is text, so it survives every alphabet", () => {
  it("at ascii the label reads, and no codepoint leaves ASCII", () => {
    const rows = at([null, "peak", null, null, null, null, null, null], {}, 70, ASCII_CAPS);
    expect(rows.join("\n")).toContain("peak");
    for (const ch of rows.join("")) expect(ch.codePointAt(0) ?? 0, ch).toBeLessThan(128);
  });

  it("a wide codepoint leaves the row exactly as wide", () => {
    const rows = at([null, "図表", null, null, null, null, null, null]);
    expect(rows.join("\n")).toContain("図表");
    for (const r of rows.filter((x) => /[│|]$/u.test(x))) expect(cells(r, "narrow"), r).toBe(70);
  });
});

describe("TL14 (C12 I55): at most one label per cell column", () => {
  it("two samples sharing a column but not a row still give one label", () => {
    // **The guard is the only thing stopping the second here**, which is what
    // makes this the row that tests it. Consecutive samples alternate 10 and 90,
    // so the pair lands in one column and in two *different* rows — no collision
    // to drop it, and without the per-column rule both would draw.
    const many = Array.from({ length: 200 }, (_v, i) => (i % 2 === 0 ? 10 : 90)); // cells-ok — a sample count
    const labels: (string | null)[] = many.map(() => null);
    labels[70] = "lower";
    labels[71] = "upper";
    const rows = draw({ series: [{ values: many, label: "a", pointLabels: labels }] });
    const text = rows.join("\n");
    expect(text).toContain("lower");
    expect(text).not.toContain("upper");
  });

  it("two samples sharing a column give one label — the first", () => {
    // **The fixture is built so the two share a column, and it was checked.**
    // The first attempt used 40 samples in a ~29-cell area — 1.4 per column, so
    // samples 0 and 1 landed in *different* columns and the row passed on a
    // renderer with no per-column rule at all. 200 into the same area is seven
    // per column, which puts 0 and 1 together by arithmetic rather than by hope.
    const many = Array.from({ length: 200 }, (_v, i) => 50 + 20 * Math.sin(i / 25)); // cells-ok — a sample count
    const labels: (string | null)[] = many.map(() => null);
    labels[0] = "first";
    labels[1] = "second";
    const rows = draw({ series: [{ values: many, label: "a", pointLabels: labels }] }, 34);
    const text = rows.join("\n");
    expect(text).toContain("first");
    expect(text).not.toContain("second");
  });

  it("a long series labels at most one sample per column, and every row still fits", () => {
    const many = Array.from({ length: 200 }, (_v, i) => 50 + 40 * Math.sin(i / 9)); // cells-ok — a sample count
    const labels = many.map((_v, i) => (i % 2 === 0 ? `s${String(i)}` : null)); // cells-ok — a sample count
    const rows = draw({ series: [{ values: many, label: "a", pointLabels: labels }] });
    for (const r of rows.filter((x) => /[│|]$/u.test(x))) expect(cells(r, "narrow"), r).toBe(70);
    expect(rows.join("\n")).toMatch(/s\d/u);
  });
});

describe("TL15 (C04 I63): the three refusals", () => {
  it("more labels than values names a sample that does not exist", () => {
    expect(errs([{ values: [1, 2], pointLabels: ["a", "b", "c"] }]).join(" "))
      .toMatch(/does not exist/u);
    expect(errs([{ values: [1, 2], pointLabels: ["a", null] }])).toEqual([]);
  });

  it("an entry that is neither a string nor null is refused", () => {
    expect(errs([{ values: [1, 2], pointLabels: [3, null] }]).join(" "))
      .toMatch(/string or null/u);
  });

  it("a form whose sample is not drawn at its own value is refused", () => {
    const r = validateDocument({
      version: 1,
      blocks: [{
        kind: "plot", id: "p", form: "stackedarea", height: 6,
        series: [{ values: [1, 2], pointLabels: ["a", null] }],
      }],
    });
    expect((r.ok ? [] : r.error).join(" ")).toMatch(/does not draw a sample at its own value/u);
  });
});
