/**
 * T1.139–T1.140 — the radar's category labels through the one writer, and the
 * line arm's read as cells (C12 I118, I119, §3n, §3w; F982, F984).
 *
 * A six-category radar at 60 columns puts the sixth category and `east` on
 * one row. `labelRows` placed each name by `cells()` and then wrote `[...text]`
 * one code point per slot: a family took five slots for a two-cell
 * reservation and `図表` two for four. The braille arm re-derives the row's
 * cells and found three fewer or two more; the line arm read the joined row
 * by code point directly; and `east` moved with the error on both — three
 * cells left over the disc, two right, and the line arm's row into the clamp.
 * **These rows are F982's probe as tests**: the row a shape shares with
 * `east`, against the same row with an ASCII name of the shape's width, cell
 * for cell outside the name's slot, read through the cluster walk —
 * `graphemes` and `cells` — and never by string index, because a string
 * index is the defect.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { cells, graphemes } from "../../src/presentation/text.js";
import { FULL_CAPS, measurable, visible } from "../support/render.js";

const FAMILY = "\u{1F468}‍\u{1F469}‍\u{1F467}";
const KEYCAP = "1️⃣";
const kit = measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });

/** The shapes, each beside an ASCII name of its width — the control the row is read against. */
const SHAPES: readonly (readonly [string, string, string])[] = [
  ["a family", FAMILY, "ab"],
  ["図表", "図表", "west"],
  ["a keycap", KEYCAP, "ab"],
];

/** A visible row as cell → cluster, by the reference walk — never `rowCells`, never a string index. */
const byCell = (row: string): ReadonlyMap<number, string> => {
  const out = new Map<number, string>();
  let at = 0; // cells-ok — a cell position
  for (const g of graphemes(row)) {
    const w = cells(g, "narrow");
    if (w === 0) continue;
    out.set(at, g);
    at += w; // cells-ok — a cell count
  }
  return out;
};

/** The first cell of `name` in a row's cell map, walking the name's own clusters. */
const startOf = (m: ReadonlyMap<number, string>, name: string): number => {
  const parts = graphemes(name);
  for (const [at, g] of m) {
    if (g !== parts[0]) continue;
    let cursor = at; // cells-ok — a cell position
    let whole = true;
    for (const p of parts) {
      if (m.get(cursor) !== p) { whole = false; break; }
      cursor += cells(p, "narrow"); // cells-ok — a cell count
    }
    if (whole) return at;
  }
  return -1; // cells-ok — a sentinel
};

const frame = (style: "braille" | "line", sixth: string): readonly string[] =>
  kit.renderToLines(block({
    kind: "plot", id: "r", form: "radar", height: 14, legend: false, plotStyle: style,
    categories: ["north", "east", "se", "south", "sw", sixth],
    series: [{ label: "a", values: [3, 4, 2, 5, 3, 4] }],
  } as never), 60).map(visible);

/** The row the sixth category shares with `east`, on `style`'s arm, against the control's. */
const sharedRow = (style: "braille" | "line", shape: string, control: string): void => {
  const shaped = frame(style, shape);
  const plain = frame(style, control);
  const r = plain.findIndex((row) => row.includes("east") && row.includes(control)); // cells-ok — a row index
  expect(r, "the control's shared row").toBeGreaterThanOrEqual(0);
  const row = shaped[r] ?? "";
  const ref = plain[r] ?? "";
  expect(row, "the name reaches the frame whole").toContain(shape);
  expect(cells(row, "narrow"), "the row measures what the control's does").toBe(cells(ref, "narrow"));
  const a = byCell(row);
  const b = byCell(ref);
  const slot = startOf(a, shape);
  const width = cells(shape, "narrow");
  expect(width, "the control is the shape's width").toBe(cells(control, "narrow"));
  expect(slot, "the name sits where the control's name sits").toBe(startOf(b, control));
  expect(slot).toBeGreaterThanOrEqual(0);
  const inSlot = (at: number): boolean => at >= slot && at < slot + width; // cells-ok — a cell position
  for (const [at, g] of b) if (!inSlot(at)) expect(a.get(at), `cell ${at}`).toBe(g);
  for (const at of a.keys()) if (!inSlot(at)) expect(b.has(at), `cell ${at} is a cell of the control too`).toBe(true);
  expect(startOf(a, "east"), "`east` at its column").toBe(startOf(b, "east"));
  for (const line of shaped) expect(cells(line, "narrow"), line).toBeLessThanOrEqual(60);
  expect(shaped.some((line) => line.includes("…")), "no row into the clamp").toBe(false);
};

describe("T1.139 (C12 I118): the braille arm — the row a shape shares with `east` is the control's outside the name", () => {
  it.each(SHAPES)("%s as the sixth category, beside an ASCII name of its width", (_name, shape, control) => {
    sharedRow("braille", shape, control);
  });

  it("the fixture responds: the shared row differs between names of different widths", () => {
    // The comparison above holds cell for cell only because the control has
    // the shape's width; a name two cells wider moves its own start, which is
    // what the row would show if the writer had written nothing wrong.
    const two = frame("braille", "ab");
    const four = frame("braille", "west");
    const r = four.findIndex((row) => row.includes("east") && row.includes("west")); // cells-ok — a row index
    expect(startOf(byCell(two[r] ?? ""), "ab")).not.toBe(startOf(byCell(four[r] ?? ""), "west"));
  });
});

describe("T1.140 (C12 I118, I119): the line arm — `radarQuadFigure` reads its label row as cells", () => {
  it.each(SHAPES)("%s as the sixth category, beside an ASCII name of its width", (_name, shape, control) => {
    sharedRow("line", shape, control);
  });

  it("a wide name's second cell is the name's: no quadrant glyph is drawn under 表 or 図", () => {
    // The read gives the continuation cell to the label, so the two
    // ideographs are adjacent in the frame with nothing of the polygon
    // between them — which is also what keeps the row at the width.
    const shaped = frame("line", "図表");
    const row = shaped.find((line) => line.includes("east") && line.includes("図")) ?? "";
    expect(row).toContain("図表");
    expect(cells(row, "narrow")).toBe(cells(frame("line", "west").find((line) => line.includes("east") && line.includes("west")) ?? "", "narrow"));
  });
});
