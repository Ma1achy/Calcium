/**
 * T1.135–T1.138 — a layer meets the merge as cells (C12 I119, §3u; F977, F981).
 *
 * `pointLabelRows` builds a cell array per row — a cluster in one cell, `""`
 * behind a wide one — and hands it on joined; `mergedRow` read the string by
 * code point, so a family was five columns to the walk and two to the
 * terminal, `図表` two and four, and every cell after a name drifted with the
 * gridlines. **These rows are F977's probe as tests**: the label's row against
 * the same row without the label, cell by cell outside the slot, read through
 * the cluster walk — `graphemes` and `cells` — and never by string index,
 * because a string index is the defect.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { glyphs } from "../../src/presentation/blocks/glyphs.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { cells, graphemes } from "../../src/presentation/text.js";
import { FULL_CAPS, MONO_UNICODE_CAPS, measurable, visible } from "../support/render.js";

const FAMILY = "\u{1F468}‍\u{1F469}‍\u{1F467}";
const KEYCAP = "1️⃣";
const V = [10, 42, 25, 88, 55, 30, 70, 15];
const W = [30, 60, 20, 75, 40, 90, 35, 55];
const NONE: (string | null)[] | undefined = undefined;
const at1 = (label: string): (string | null)[] => [null, label, null, null, null, null, null, null];

/** The shapes: a family, two wide ideographs, a spacing mark, a keycap — and ASCII as the control. */
const SHAPES: readonly (readonly [string, string])[] = [
  ["a family", FAMILY],
  ["図表", "図表"],
  ["aः", "aः"],
  ["a keycap", KEYCAP],
  ["peak", "peak"],
];

type Cell = Readonly<{ c: string; at: number }>;

/** A visible row as (cluster, cell) pairs — the reference walk, not `rowCells`. */
const cellsOf = (row: string): readonly Cell[] => {
  const out: Cell[] = [];
  let at = 0;
  for (const c of graphemes(row)) {
    out.push({ c, at });
    at += cells(c, "narrow");
  }
  return out;
};

const kit = (caps = FULL_CAPS): ReturnType<typeof measurable> =>
  measurable({ definitions: [plotDefinition], capabilities: caps });

/** F977's fixture: a `line` plot, eight samples, `axes`, a frame; a second series where the one-bit arm must stack. */
const linePlot = (labels: (string | null)[] | undefined, frame: "grid" | "box" = "grid", second = false): ReturnType<typeof block> =>
  block({
    kind: "plot", id: "p", form: "line", height: second ? 12 : 9, axes: true, legend: false, plotFrame: frame,
    xLabels: ["a", "b", "c", "d", "e", "f", "g", "h"],
    series: [
      { values: V, label: "s", ...(labels === undefined ? {} : { pointLabels: labels }) },
      ...(second ? [{ values: W, label: "t" }] : []),
    ],
  } as never);

/** The row holding `label`, and its index — thrown rather than skipped, so a label not drawn is a failure. */
const rowWith = (rows: readonly string[], label: string): { row: string; i: number } => {
  const i = rows.findIndex((r) => r.includes(label));
  if (i < 0) throw new Error(`${JSON.stringify(label)} was not drawn`);
  return { row: rows[i]!, i };
};

/** Where `label` starts in a walked row, by matching its clusters cell by cell. */
const startOf = (walked: readonly Cell[], label: string): number => {
  const parts = graphemes(label);
  const j = walked.findIndex((_x, k) => walked.slice(k, k + parts.length).map((x) => x.c).join("") === label);
  if (j < 0) throw new Error(`${JSON.stringify(label)} is not in the walked row`);
  return walked[j]!.at;
};

/**
 * The comparison. The slot is `1 + cells(text) + 1` and symmetric (C12 I55),
 * so the cell on either side of the text is excluded whichever way the label
 * was placed; every other cell — right of the slot, and left of it — is the
 * unlabelled row's at the same column, the row is exactly `width` cells, and
 * the frame's edge stands at the last column.
 */
function assertOutsideSlot(labelled: string, unlabelled: string, label: string, width: number, what: string): void {
  const withL = cellsOf(labelled);
  const without = cellsOf(unlabelled);
  const start = startOf(withL, label);
  const end = start + cells(label, "narrow");
  const outside = (xs: readonly Cell[]): readonly Cell[] => xs.filter((x) => x.at < start - 1 || x.at > end);
  expect(outside(withL), `${what}: every cell outside the slot is the unlabelled row's`).toEqual(outside(without));
  expect(outside(withL).length, `${what}: and there are cells right of the slot to compare`).toBeGreaterThan(width / 2);
  expect(cells(labelled, "narrow"), `${what}: the row measures the width`).toBe(width);
  expect(cells(unlabelled, "narrow"), `${what}: as the unlabelled row does`).toBe(width);
  expect(withL[withL.length - 1], `${what}: the frame's edge at the last column`).toEqual({ c: "│", at: width - 1 });
}

describe("T1.135 (C12 I119): a name shifts nothing after it — F977's probe as a row", () => {
  for (const width of [40, 80]) {
    for (const [name, label] of SHAPES) {
      it(`${name} at sample 1, ${String(width)} columns: every cell outside the slot is the unlabelled row's, the row is the width, the edge at the last column`, () => {
        const none = kit().renderToLines(linePlot(NONE), width).map(visible);
        const withLabel = kit().renderToLines(linePlot(at1(label)), width).map(visible);
        const { row, i } = rowWith(withLabel, label);
        assertOutsideSlot(row, none[i]!, label, width, `${name} @ ${String(width)}`);
      });
    }
  }

  it("the fixture responds: inside the slot the labelled row differs, and the family holds two cells", () => {
    // A comparison that excludes the slot passes against a renderer that drew
    // no label at all — `rowWith` throws on that — and against one that drew
    // it one cell wide; this is the row that says the slot is where the
    // difference is, and how wide the name is in it.
    const none = kit().renderToLines(linePlot(NONE), 40).map(visible);
    const withLabel = kit().renderToLines(linePlot(at1(FAMILY)), 40).map(visible);
    const { row, i } = rowWith(withLabel, FAMILY);
    expect(row).not.toBe(none[i]);
    const walked = cellsOf(row);
    const start = startOf(walked, FAMILY);
    expect(walked.find((x) => x.at === start + 1), "no cell of its own behind the family").toBeUndefined();
    expect(walked.find((x) => x.at === start + 2), "the reserved cell right after it").toBeDefined();
  });
});

describe("T1.136 (C12 I119): the gridlines land in the cells the data left blank, and nowhere else on a labelled row", () => {
  const g = glyphs(FULL_CAPS);
  const GRID = new Set([g.dashedVertical, g.dashedHorizontal]);
  const ESC = String.fromCharCode(27);
  const SGR = new RegExp(`(${ESC}\\[[0-9;]*m)`, "gu");
  type Piece = Readonly<{ sgr: string; text: string }>;
  /** A raw row as (colour, text) pieces: a `38;…` sequence opens a colour, `39` closes it. */
  const piecesOf = (raw: string): readonly Piece[] => {
    const out: Piece[] = [];
    let sgr = "";
    for (const part of raw.split(SGR)) {
      if (part === "") continue;
      if (part.startsWith(ESC)) {
        sgr = part.endsWith("[39m") ? "" : part;
        continue;
      }
      out.push({ sgr, text: part });
    }
    return out;
  };

  for (const [name, label] of [["a family", FAMILY], ["図表", "図表"]] as const) {
    it(`${name}: the grid row is the box row wherever the box row is inked, blank or a gridline elsewhere, and no gridline inside the name`, () => {
      // **`plotFrame: "box"` is the same row without the gridlines**, so it says
      // which cells the data left blank; the grid row may differ from it only
      // there, and only by a gridline.
      const grid = kit().renderToLines(linePlot(at1(label), "grid"), 40).map(visible);
      const box = kit().renderToLines(linePlot(at1(label), "box"), 40).map(visible);
      const { row, i } = rowWith(grid, label);
      const gm = new Map(cellsOf(row).map((x) => [x.at, x.c]));
      const bm = new Map(cellsOf(box[i]!).map((x) => [x.at, x.c]));
      expect([...gm.keys()], "the same cell positions — nothing inserted behind a wide glyph").toEqual([...bm.keys()]);
      let gridlines = 0;
      for (const [at, c] of bm) {
        const cell = gm.get(at) ?? "";
        if (c !== " ") {
          expect(cell, `column ${String(at)}: inked in the box row, so the same here`).toBe(c);
        } else {
          expect(cell === " " || GRID.has(cell), `column ${String(at)}: blank or a gridline, got ${JSON.stringify(cell)}`).toBe(true);
          if (GRID.has(cell)) gridlines += 1;
        }
      }
      expect(gridlines, "the fixture responds: the row holds gridlines").toBeGreaterThan(0);
      // The name's cells hold the name and nothing else; a wide glyph's second
      // cell is not a cell at all to the walk — the gridline that used to land
      // there (T6.99) would appear as an extra position.
      const start = startOf(cellsOf(row), label);
      let at = start;
      for (const part of graphemes(label)) {
        expect(gm.get(at), `column ${String(at)}: the name's own cluster`).toBe(part);
        for (let k = 1; k < cells(part, "narrow"); k += 1) expect(gm.has(at + k), `column ${String(at + k)}: no cell behind ${part}`).toBe(false);
        at += cells(part, "narrow");
      }
    });
  }

  it("read as spans: every gridline carries the muted tone, the name its series' colour, and no styled run holds a gridline or a blank", () => {
    // **The muted colour is read off the frame, not written here**: the
    // x-caption row is `tone("muted")` by construction, and the series colour
    // is whatever the piece holding the name wears. A wholly blank run that
    // took a gridline is muted — `behind()`'s rule, folded in — and a styled
    // run keeps its colour through a gridline; that second half has nothing
    // to fire on, because a cell no layer inked has no ref and so is never
    // inside a styled run (C12 §3u), which the last assertion states.
    const raw = kit().renderToLines(linePlot(at1(FAMILY), "grid"), 40);
    const { i } = rowWith(raw.map(visible), FAMILY);
    const caption = piecesOf(raw[raw.length - 1]!).find((p) => p.text.trim() !== "");
    const muted = caption?.sgr ?? "";
    expect(muted, "the caption is styled").not.toBe("");
    const pieces = piecesOf(raw[i]!);
    const series = pieces.find((p) => p.text.includes(FAMILY))?.sgr ?? "";
    expect(series, "the name is styled").not.toBe("");
    expect(series, "in the series' colour, not the muted tone").not.toBe(muted);
    let gridlines = 0;
    for (const p of pieces) {
      for (const c of graphemes(p.text)) {
        if (!GRID.has(c)) continue;
        gridlines += 1;
        expect(p.sgr, `the gridline in ${JSON.stringify(p.text)} is muted`).toBe(muted);
      }
      if (p.sgr === series) {
        expect([...graphemes(p.text)].some((c) => c === " " || c === "⠀" || GRID.has(c)), `a series-coloured run holds no blank and no gridline: ${JSON.stringify(p.text)}`).toBe(false);
      }
    }
    expect(gridlines, "the fixture responds: gridlines on the row").toBeGreaterThan(0);
  });
});

describe("T1.137 (C12 I119): the stacked one-bit arm — a name in a strip shifts nothing after it", () => {
  for (const [name, label] of [["a family", FAMILY], ["図表", "図表"]] as const) {
    it(`${name}: the strip's row is the unlabelled strip's row cell for cell outside the slot, the width, the edge at the last column`, () => {
      const none = kit(MONO_UNICODE_CAPS).renderToLines(linePlot(NONE, "grid", true), 40).map(visible);
      const withLabel = kit(MONO_UNICODE_CAPS).renderToLines(linePlot(at1(label), "grid", true), 40).map(visible);
      const { row, i } = rowWith(withLabel, label);
      assertOutsideSlot(row, none[i]!, label, 40, `${name} at one bit`);
    });
  }

  it("the fixture stacks: two strips, each named in the gutter", () => {
    // One series does not stack — there is nothing to separate — and the row
    // above would then be T1.135 again at one bit. Two strips, two names.
    const rows = kit(MONO_UNICODE_CAPS).renderToLines(linePlot(NONE, "grid", true), 40).map(visible);
    expect(rows.some((r) => r.startsWith("s ┤"))).toBe(true);
    expect(rows.some((r) => r.startsWith("t ┤"))).toBe(true);
  });
});

describe("T1.138 (C12 I119, F977): TL13's fixture — 図表 at 70 on the scatter — every row measures 70, the label's row included", () => {
  it("the row TL13's filter skipped is exactly the width and ends in the frame's edge, not the clamp", () => {
    // TL13 asserted the width on rows matching `/[│|]$/`, and the label's row
    // ended in `…` — two cells over, clamped — so the one row the fixture was
    // written for was the one row the filter never read (F977). Every row
    // but the caption, by position; the caption is 69, Ink trims its blank.
    const rows = kit().renderToLines(block({
      kind: "plot", id: "p", form: "scatter", height: 9, axes: true, legend: false,
      series: [{ values: V, label: "a", pointLabels: at1("図表") }],
    } as never), 70).map(visible);
    const { row } = rowWith(rows, "図表");
    expect(row.endsWith("│"), "the frame's edge rather than the clamp's …").toBe(true);
    for (const r of rows.slice(0, -1)) expect(cells(r, "narrow"), r).toBe(70);
    expect(cells(rows[rows.length - 1]!, "narrow"), "the caption").toBeLessThanOrEqual(70);
  });
});
