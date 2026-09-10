/**
 * LC1–LC6: a label clears the last one kept on its row, or it is dropped
 * (C12 I120, §6p, F992).
 *
 * **Indexed by the two rules meeting, not by input.** The rules are *a number is
 * centred on its own band* and *a number that fits its band is written*, and
 * they meet in one cell: two bands whose numbers each fill them exactly. Each
 * bar is individually correct and the composed row reads `4.17.4` — one number
 * that is neither value — so no assertion about a single band can see it.
 *
 * **Both writers, because the finding's premise was half true.** `columnLabels`
 * was cited as the sibling that already held the rule; its guard forbade an
 * overlap and permitted exact adjacency, so it drew `montuewedthu`. LC4 is that
 * half.
 */
import { describe, expect, it } from "vitest";
import { barColumn } from "../../src/presentation/plot/categorical.js";
import { block } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";

const kit = measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });
const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/gu, "");
const frame = (b: Parameters<typeof kit.renderToLines>[0], w: number): readonly string[] =>
  kit.renderToLines(b, w).map(plain);

/** The finding's own figure: four categories, four series, at a dashboard's density. */
const demo = block({
  kind: "plot", id: "lc-demo", form: "bar", height: 8, axes: true,
  orientation: "vertical", layout: "grouped",
  categories: ["mon", "tue", "wed", "thu"],
  series: [
    { label: "a", values: [2.9, 5.2, 4.1, 5.1] },
    { label: "b", values: [4.1, 4.3, 6.8, 5.6] },
    { label: "c", values: [7.4, 4.1, 3.4, 6.4] },
    { label: "d", values: [3.8, 6.8, 5.2, 3.4] },
  ],
});

/** The cells inside the frame, so a position is the plot area's and not the gutter's. */
const areaOf = (row: string): string => {
  const from = row.search(/[│┤]/u); // cells-ok — a column position
  return from < 0 ? row : row.slice(from + 1, row.lastIndexOf("│")); // cells-ok — a column position
};

describe("LC1 (C12 I120): the composed row no longer reads one number that is neither value", () => {
  // **The fixture is shown to respond before anything is asserted against it.**
  // Two bands, three cells each, whose numbers each fill them exactly and whose
  // bars top on the same row — composed with no claimer at all, which is what a
  // lone `barColumn` outside a chart is.
  it("the control: two bare columns still compose `4.17.4`", () => {
    const a = barColumn(4.1, 0, 30, 3, 4, FULL_CAPS, true);
    const b = barColumn(7.4, 0, 30, 3, 4, FULL_CAPS, true);
    expect(a.map((r, i) => r + b[i]!)).toContain("4.17.4");
  });

  it("the same two bands under one claimer keep the first and drop the second", () => {
    let end = -1; // cells-ok — a column position
    const claim = (_row: number, start: number, width: number): boolean => {
      if (start <= end) return false; // cells-ok — a column position
      end = start + width; // cells-ok — a column position
      return true;
    };
    const a = barColumn(4.1, 0, 30, 3, 4, FULL_CAPS, true, undefined, claim);
    const b = barColumn(7.4, 0, 30, 3, 4, FULL_CAPS, true, undefined, (r, s, w) => claim(r, s + 3, w));
    const rows = a.map((r, i) => r + b[i]!);
    expect(rows).not.toContain("4.17.4");
    expect(rows).toContain("4.1   ");
  });

  it("and through the renderer: `4.1` survives whole and `4.17.4` is gone", () => {
    const b = block({
      kind: "plot", id: "lc1", form: "bar", height: 4, axes: true,
      orientation: "vertical", layout: "grouped", legend: false,
      categories: ["a", "b"], yFormat: "number",
      series: [{ label: "s1", values: [4.1, 22] }, { label: "s2", values: [7.4, 1.0] }],
    });
    const rows = frame(b, 15);
    expect(rows.join("\n")).not.toMatch(/4\.17\.4/u);
    // **Not merely the absence.** A placer that dropped both numbers satisfies
    // the line above and is the over-eager rule this half refuses.
    expect(rows.some((r) => areaOf(r).startsWith("4.1"))).toBe(true);
  });

  it("and on the single-series arm, which is the other call site", () => {
    // **The wiring, separately** (C09 HZ7's lesson): the two arms that draw a
    // standing number reach `categoricalColumnForm` through two lambdas, and a
    // claim dropped from one of them is invisible to every row above.
    // `3.1` and `3.9` share a top row in adjacent three-cell bands.
    const bare = barColumn(3.1, 0, 10, 3, 5, FULL_CAPS, true)
      .map((r, i) => r + barColumn(3.9, 0, 10, 3, 5, FULL_CAPS, true)[i]!);
    expect(bare, "the fixture responds").toContain("3.13.9");
    const b = block({
      kind: "plot", id: "lc1-single", form: "bar", height: 5, axes: true,
      orientation: "vertical", legend: false,
      categories: ["a", "b", "c", "d"], yFormat: "number",
      series: [{ values: [3.1, 3.9, 9.9, 1.1] }],
    });
    const joined = frame(b, 17).join("\n");
    expect(joined).not.toMatch(/3\.13\.9/u);
    expect(joined).toMatch(/3\.1/u);
    expect(joined).not.toMatch(/3\.9/u);
  });
});

describe("LC2 (C12 I120, §6p.2 step 3): a refusal reserves nothing", () => {
  // Three numbers contending on one row at 53 cells — `5.25.15.6` at HEAD.
  // Keeping the **third** is what separates dropping from eliding: had the
  // refusal of the second moved the edge, the third would go with it and the
  // row would collapse to its first label.
  it("three contending numbers keep the first and the third", () => {
    const rows = frame(demo, 53);
    const joined = rows.join("\n");
    expect(joined).not.toMatch(/5\.25\.15\.6/u);
    const row = rows.find((r) => r.includes("5.2") && r.includes("5.6"));
    expect(row, "the row that held `5.25.15.6`").toBeDefined();
    expect(areaOf(row!)).toMatch(/5\.2 {3}5\.6/u);
    // The middle one is the only `5.1` in the figure, so its absence is exact.
    expect(joined).not.toMatch(/5\.1/u);
  });

  it("the control: at 70 cells there is room and the fold refuses nothing", () => {
    const row = frame(demo, 70).find((r) => r.includes("5.2") && r.includes("5.6"));
    expect(row, "the same three numbers with room").toBeDefined();
    expect(areaOf(row!)).toMatch(/5\.2 5\.1 5\.6/u);
  });

  it("and a number too wide for its band reserves nothing either", () => {
    // §6p.2's closing clause: a band that writes no number leaves the edge
    // where the last *written* label left it. `1000` does not fit three cells
    // and is dropped (C12 I20); the `0` on the baseline beside it begins one cell
    // after where `1000` would have ended, so an edge moved by the refusal
    // takes it too.
    const b = block({
      kind: "plot", id: "lc2-wide", form: "bar", height: 5, axes: true,
      orientation: "vertical", legend: false,
      categories: ["a", "b", "c", "d"], yFormat: "number",
      series: [{ values: [1000, 0, 900, 100] }],
    });
    const rows = frame(b, 17);
    const baseline = rows.filter((r) => r.includes("┤")).at(-1)!;
    expect(areaOf(baseline), "`1000` dropped, `0` kept").toMatch(/^\S{3} 0 /u);
  });
});

describe("LC3 (C12 I120, §6p.1 row 3): the claim carries its row", () => {
  // `2.9` and `4.1` are adjacent bands at 53 cells — the second begins exactly
  // where the first ends — and their bars top on **different** rows, so they
  // never contend. One edge for the whole plot area passes LC1 and LC2 and
  // drops `4.1` here.
  it("two abutting bands whose numbers are on different rows both keep them", () => {
    const rows = frame(demo, 53);
    const at = (text: string, from: number): number =>
      rows.findIndex((r) => areaOf(r).slice(from, from + text.length) === text); // cells-ok — a column position
    const first = at("2.9", 0); // cells-ok — a column position
    const second = at("4.1", 3); // cells-ok — a column position
    expect({ first: first >= 0, second: second >= 0 }).toEqual({ first: true, second: true });
    expect(first).not.toBe(second);
  });
});

describe("LC4 (C12 I120, §6p.1 row 6): the category names under the same figure obey it", () => {
  const cats = block({
    kind: "plot", id: "lc4", form: "bar", height: 5, axes: true,
    orientation: "vertical", legend: false,
    categories: ["mon", "tue", "wed", "thu"], yFormat: "number",
    series: [{ values: [3, 5, 4, 6] }],
  });
  /** The names row is the last; the tick row is the one above it. */
  const nameRow = (w: number): string => frame(cats, w)[frame(cats, w).length - 1]!;
  const tickRow = (w: number): string => frame(cats, w).slice(-2)[0]!;

  it("`montuewedthu` at 18 cells is two whole names with a gap", () => {
    expect(nameRow(18)).not.toMatch(/montuewedthu/u);
    // **`+2` is the axis saying what it dropped** (C12 I8, F374). This row read
    // `"mon   wed"` for as long as the drop was silent, which is the assertion
    // agreeing with the defect: two of four categories were gone from a frame
    // that draws four bars, and nothing on screen said so.
    expect(nameRow(18).trim()).toBe("mon   wed +2");
  });

  it("the ticks are the surviving names' and no others", () => {
    // A dropped name that kept its tick would rule the axis where nothing is
    // named — the half a string assertion on the row above cannot see.
    expect([...tickRow(18)].filter((c) => c === "┬")).toHaveLength(2); // cells-ok — a tick count
    expect([...tickRow(22)].filter((c) => c === "┬")).toHaveLength(4); // cells-ok — a tick count
  });

  it("the control: at 22 cells all four names fit and none is dropped", () => {
    expect(nameRow(22).trim()).toBe("mon tue wed thu");
  });
});

describe("LC7 (C12 I8, F374): the vertical arm says what it dropped, in the row it already has", () => {
  // **The horizontal arm spends its last area row on `+N more · a · b` and this
  // arm has no row to spend** — a second furniture row changes the block's
  // height and C12 I1 forbids it. So the count is right-aligned into the label
  // row, with the placer told to reserve its cells *before* it places anything.
  //
  // Measured before the ruling: four five-cell names over a 30-cell frame drew
  // `Monday` and one tick, under four bars, with nothing saying the other three
  // existed.
  const long = (extra: object = {}) => block({
    kind: "plot", id: "lc7", form: "bar", height: 8, axes: true,
    orientation: "vertical", legend: false, yFormat: "number",
    categories: ["Monday", "Tuesday", "Wednesday", "Thursday"],
    series: [{ values: [3, 7, 5, 9] }], ...extra,
  });
  const nameRow = (b: Parameters<typeof frame>[0], w: number): string => {
    const rows = frame(b, w);
    return rows[rows.length - 1] ?? "";
  };

  it("four names that cannot fit leave one name and a count of the rest", () => {
    const row = nameRow(long(), 30);
    expect(row, "the name that fitted").toContain("Monday");
    expect(row.trim().endsWith("+3"), `the count of the rest, in "${row.trim()}"`).toBe(true);
  });

  it("the count is the names missing, not the names dropped by the reservation alone", () => {
    // The reservation can itself cost a name, which would make the first count
    // wrong — so the walk runs to a fixed point. Asserted by counting ticks: the
    // notice's number and the ticks must sum to the categories, at every width
    // where the two disagree at all.
    for (const w of [24, 26, 28, 30, 34, 40, 50]) { // cells-ok — a cell width
      const rows = frame(long(), w);
      const names = rows[rows.length - 1] ?? "";
      const ticks = [...(rows[rows.length - 2] ?? "")].filter((c) => c === "┬").length; // cells-ok — a tick count
      const shown = /\+(\d+)$/u.exec(names.trim());
      const missing = shown === null ? 0 : Number(shown[1]); // cells-ok — a category count
      expect(ticks + missing, `at ${String(w)}: "${names.trim()}"`).toBe(4); // cells-ok — a category count
    }
  });

  it("the control: a frame where every name fits carries no count at all", () => {
    const row = nameRow(long({ categories: ["a", "b", "c", "d"] }), 40);
    expect(row.trim()).toBe("a        b        c        d");
    expect(row).not.toMatch(/\+/u);
  });
});

describe("LC5 (C12 I120, §6p.1 row 2): a number short of its band's width never contends", () => {
  // Centring leaves `⌈(w − wide) ÷ 2⌉ ≥ 1` cells after a label whenever it is
  // narrower than its band, so the whole class is `wide == w`. Asserted over
  // the artefact rather than over the arithmetic: two abutting bands, one
  // shared claimer, and the second number must survive at every width above
  // its own and be dropped at exactly its own.
  const pair = (w: number): readonly string[] => {
    let end = -1; // cells-ok — a column position
    const claim = (_r: number, start: number, width: number): boolean => {
      if (start <= end) return false; // cells-ok — a column position
      end = start + width; // cells-ok — a column position
      return true;
    };
    const a = barColumn(4.1, 0, 30, w, 4, FULL_CAPS, true, undefined, claim);
    const b = barColumn(7.4, 0, 30, w, 4, FULL_CAPS, true, undefined, (r, s, wd) => claim(r, s + w, wd));
    return a.map((r, i) => r + b[i]!);
  };

  it("`7.4` survives from 4 cells a band upward and is dropped at 3", () => {
    expect(pair(3).join("")).not.toMatch(/7\.4/u);
    for (const w of [4, 5, 6, 7, 12]) { // cells-ok — a column width
      expect(pair(w).join(""), `${String(w)} cells a band`).toMatch(/7\.4/u);
      expect(pair(w).join(""), `${String(w)} cells a band`).toMatch(/4\.1/u);
    }
  });
});

describe("LC6 (C12 I120, §6p.1 row 5): ink is not a label", () => {
  // A ramp glyph is not a digit, so a number against the next band's run — or
  // against the frame — reads correctly and is left alone. A placer that
  // treated any non-blank cell as a claim would erase readouts a reader can
  // read, which is the half that would make this the wrong rule.
  it("`3.4` on both sides of a full run survives, and so does a number against the frame", () => {
    const rows = frame(demo, 53);
    const row = rows.find((r) => r.includes("3.4"));
    expect(row, "the row carrying `3.4` beside a run").toBeDefined();
    expect(areaOf(row!)).toMatch(/3\.4█+3\.4/u);
    // The same row opens on the frame with a number in the first cell.
    expect(areaOf(row!).startsWith("2.9")).toBe(true);
  });
});
