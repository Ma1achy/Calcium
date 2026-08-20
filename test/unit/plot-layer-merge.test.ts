/**
 * LM1–LM6: two surfaces meeting in a cell union their dots; two curves do not
 * (C12 I40, C12 I44, §3u).
 *
 * **Asserted on the composed frame, not on the merge function.** The defect is
 * that every wedge is folded to braille *before* it reaches the merge, so a
 * test calling `mergedRow` with hand-built layers would construct the one
 * arrangement where nothing overlaps. The figure has to be a real one.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { radarRender } from "../../src/presentation/plot/circle.js";
import { FULL_CAPS, measurable } from "../support/render.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });
const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/gu, "");
const FULL = "⣿";
const isBraille = (c: string): boolean => c >= "⠀" && c <= "⣿";

/**
 * Cells with a full cell **on each side of them on the row**, that are not
 * themselves full.
 *
 * **Adjacency is on the raw row and the first form of this filtered first.**
 * Dropping the non-braille cells and then reading neighbours out of the
 * filtered array compares the last cell of the disc with the first cell of the
 * legend's swatch — two cells forty columns apart — and reported partials in a
 * figure that had none. The assertion was right and its index was not.
 */
function partialsIn(rows: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const r of rows) {
    const cells = [...r];
    for (let i = 1; i < cells.length - 1; i += 1) { // cells-ok — a cell count
      const c = cells[i]!;
      if (cells[i - 1] === FULL && cells[i + 1] === FULL && isBraille(c) && c !== FULL) out.push(c);
    }
  }
  return out;
}

const PIE = block({
  kind: "plot", id: "lm-pie", form: "pie", height: 18, series: [],
  segments: [
    { label: "Chrome", value: 65 },
    { label: "Firefox", value: 15 },
    { label: "Safari", value: 12 },
    { label: "Other", value: 8 },
  ],
});

describe("LM1 (C12 I40): a pie's disc has no partial cell inside it", () => {
  // **The claim is exact rather than approximate**, which is what makes it
  // assertable: the fractions sum to one, so every dot inside the radius
  // belongs to some wedge, so a cell whose eight dots are all inside the disc
  // is full. A cell flanked by two full cells on its row is such a cell.
  it("every cell between two full cells is itself full", () => {
    expect(partialsIn(kit().renderToLines(PIE, 80).map(plain))).toEqual([]);
  });
});

describe("LM2 (C12 I40): the disc is fully covered whatever the segment count", () => {
  for (const n of [2, 3, 5, 8]) {
    it(`${n} segments leave no partial cell`, () => {
      const b = block({
        kind: "plot", id: `lm2-${String(n)}`, form: "pie", height: 18, series: [],
        segments: Array.from({ length: n }, (_s, i) => ({ label: `s${String(i)}`, value: 10 + i * 3 })), // cells-ok — a segment count
      });
      const partial = partialsIn(kit().renderToLines(b, 80).map(plain)).length; // cells-ok — a cell count
      expect({ n, partial }).toEqual({ n, partial: 0 });
    });
  }
});

describe("LM3 (C12 I44): a radar's cells each belong to one layer", () => {
  // **The first form of this row passed against the defect**, which is what
  // the row is here to catch: *the composed figure inks at least as many cells
  // as one polygon over the same frame* is true while the frame is being eaten,
  // because the polygon inks the cells it takes. Counting ink cannot see a
  // trade — and neither can it see the trade the *second* form was making,
  // which took three revisions of what this row is about (C12 I44).
  //
  // The claim is containment, so the assertion is containment: every cell the
  // frame inks on its own must be inked in the composed figure. `radarRender`
  // returns the frame as its own layer, so the two are directly comparable and
  // no cell has to be inferred.
  const CATS = ["Speed", "Power", "Range", "Defence", "HP"];
  const SERIES = [
    { values: [8, 6, 7, 5, 9], label: "alpha" },
    { values: [5, 9, 4, 8, 6], label: "beta" },
  ];
  const RADAR = block({
    kind: "plot", id: "lm-radar", form: "radar", height: 17, categories: CATS, series: SERIES,
  });

  it("every cell the frame inks alone is inked in the composed figure", () => {
    const rendered = radarRender(SERIES, CATS, 80, 17, FULL_CAPS);
    const composed = kit().renderToLines(RADAR, 80).map(plain);
    const missing: string[] = [];
    rendered.frame.forEach((row, r) => {
      [...row].forEach((ch, x) => {
        if (!isBraille(ch) || ch === "⠀") return;
        const there = [...(composed[r] ?? "")][x] ?? " ";
        if (there === " " || there === "⠀") missing.push(`r${String(r)}c${String(x)} ${ch}`);
      });
    });
    expect(missing).toEqual([]);
  });

  it("no cell draws a dot belonging to a layer other than the one it is coloured", () => {
    // **This row asserted the opposite and was right about the union it was
    // written against** (C12 I44, §3u). Containment of the frame's *dots* is
    // what the union gave, and what it cost was the frame's dots appearing in a
    // series' colour: measured on this figure, 70 of 279 frame cells. Curves
    // occlude now, so the frame loses the cells a polygon crosses — a gap that
    // reads as depth — and the property left to assert is the one that made the
    // trade worth taking.
    //
    // Every layer `radarRender` returns is compared against the composed frame,
    // so no cell's owner has to be inferred.
    const rendered = radarRender(SERIES, CATS, 80, 17, FULL_CAPS);
    const composed = kit().renderToLines(RADAR, 80).map(plain);
    const bits = (c: string): number => (isBraille(c) ? c.codePointAt(0)! - 0x2800 : 0);
    const layers = [...rendered.polygons, rendered.frame];
    // **The figure's own columns, taken from the figure.** The legend's swatch
    // is braille too and belongs to no layer `radarRender` returns, so an
    // unbounded scan reports four cells at c72–73 that are not the subject —
    // and a hard-coded bound would be a second claim about the layout.
    const figureWidth = Math.max(...layers.flatMap((l) => l.map((row) => [...row].length))); // cells-ok — a cell count
    const foreign: string[] = [];
    composed.forEach((row, r) => {
      [...row].forEach((ch, x) => {
        if (x >= figureWidth) return; // cells-ok — a cell column
        const drawn = bits(ch);
        if (drawn === 0) return;
        // Some one layer must account for every dot in the cell.
        const owned = layers.some((l) => (bits([...(l[r] ?? "")][x] ?? " ") & drawn) === drawn);
        if (!owned) foreign.push(`r${String(r)}c${String(x)} ${ch}`);
      });
    });
    expect(foreign).toEqual([]);
  });
});

describe("LM4 (C12 I40): a letter is not unioned with a polygon", () => {
  // **Untested at every width the catalogue uses, which is why this is narrow.**
  // `labelRows` places the category names outside the disc, so at 80 columns no
  // polygon cell ever lands on a letter and the guard has no subject — the
  // mutation that removes it survived a green run. Measured over six widths
  // with every value at the ceiling: 0 clashes at 80, 60 and 40, **2 at 34 and
  // 6 at 28**, because the disc grows into its labels as the room shrinks.
  //
  // Asserted as containment rather than as *the names are still readable*,
  // which is the weaker claim and the one that passed: a name can survive with
  // one of its letters replaced by a braille glyph.
  const CATS = ["Speed", "Power", "Range", "Defence", "HP"];
  const SERIES = [{ values: [9, 9, 9, 9, 9] }, { values: [9, 9, 9, 9, 9] }];

  for (const [w, h] of [[34, 9], [28, 9]] as const) {
    it(`at ${String(w)}×${String(h)}, no letter becomes a glyph`, () => {
      const rendered = radarRender(SERIES, CATS, w, h, FULL_CAPS);
      const composed = kit().renderToLines(block({
        kind: "plot", id: `lm4-${String(w)}`, form: "radar", height: h,
        categories: CATS, series: SERIES,
      }), w).map(plain);
      const replaced: string[] = [];
      rendered.labels.forEach((row, r) => {
        [...row].forEach((ch, x) => {
          if (ch === " " || isBraille(ch)) return; // cells-ok — not a letter
          const there = [...(composed[r] ?? "")][x] ?? " ";
          if (there !== ch) replaced.push(`${ch}→${there}`);
        });
      });
      expect(replaced).toEqual([]);
    });
  }
});

describe("LM5 (C12 I40): the colour is the first layer's, and the spec says so", () => {
  // **The limit, asserted so it cannot drift into being the strong claim.** A
  // `Span` carries one `ColourRef`, so a boundary cell takes the first wedge's
  // colour whatever dots it ends up with. If this ever fails, either the span
  // model gained a per-dot colour or the priority order was replaced — both
  // want I40 rewritten rather than this row deleted.
  it("a boundary cell's colour is one of the two wedges', not a third", () => {
    const lines = kit().renderToLines(PIE, 80);
    const used = new Set<string>();
    for (const l of lines) for (const m of l.matchAll(/38;2;(\d+;\d+;\d+)m/gu)) used.add(m[1]!);
    // Four segments and the legend's own swatches — no cell resolves to a
    // colour that is not one of the four slots.
    expect(used.size).toBeLessThanOrEqual(4); // cells-ok — a colour count
  });
});

describe("LM6 (C12 I44): curves occlude and surfaces union, on real figures", () => {
  // **The report was `slope-default`, not the radar** — *the orange bleeds onto
  // the blue and green lines* — and it is the same rule one form along, so the
  // row is here rather than in a second file. Three series converge around
  // x = 0.4 and 11 cells carry two of them; under the union, 25 of the dots
  // drawn in those cells belonged to a series other than the one whose colour
  // they wore, against 20 that belonged to it.
  //
  // **Each series is rendered alone against a pinned range**, so every render
  // shares one layout and a cell can be compared without inferring an owner.
  // Without the pin the alone-renders autoscale to their own extent and land in
  // different rows, which reports every cell as foreign and passes for a reason
  // that has nothing to do with the merge.
  const SLOPE = [
    { values: [12, 38], label: "north" },
    { values: [31, 14], label: "south" },
    { values: [22, 27], label: "east" },
  ];
  const PIN = { yMin: 12, yMax: 38 };
  const slopeBlock = (series: readonly { values: readonly (number | null)[]; label: string }[]) =>
    block({ kind: "plot", id: "lm6", form: "slope", height: 10, axes: true, series, ...PIN });

  it("no cell of a slope chart draws another series' ink", () => {
    const bits = (c: string): number => (isBraille(c) ? c.codePointAt(0)! - 0x2800 : 0);
    const composed = kit().renderToLines(slopeBlock(SLOPE), 80).map(plain);
    const alone = SLOPE.map((_s, k) =>
      kit().renderToLines(
        slopeBlock(SLOPE.map((sr, j) => (j === k ? sr : { ...sr, values: sr.values.map(() => null) }))),
        80,
      ).map(plain));

    const foreign: string[] = [];
    composed.forEach((row, r) => {
      [...row].forEach((ch, x) => {
        const drawn = bits(ch);
        if (drawn === 0) return;
        const owned = alone.some((a) => (bits([...(a[r] ?? "")][x] ?? " ") & drawn) === drawn);
        if (!owned) foreign.push(`r${String(r)}c${String(x)} ${ch}`);
      });
    });
    expect(foreign).toEqual([]);
  });

  it("the fixture responds: the three series do share cells", () => {
    // **The row above passes on a figure whose lines never meet**, which is the
    // arrangement a convenient fixture picks. This one shows the crossing is
    // there to be got wrong — `test/support/README.md`'s rule, and the two
    // instances behind it.
    const bits = (c: string): number => (isBraille(c) ? c.codePointAt(0)! - 0x2800 : 0);
    const alone = SLOPE.map((_s, k) =>
      kit().renderToLines(
        slopeBlock(SLOPE.map((sr, j) => (j === k ? sr : { ...sr, values: sr.values.map(() => null) }))),
        80,
      ).map(plain));
    let shared = 0;
    const rows = alone[0]?.length ?? 0; // cells-ok — a row count
    for (let r = 0; r < rows; r += 1) { // cells-ok — a row count
      const widest = Math.max(...alone.map((a) => [...(a[r] ?? "")].length)); // cells-ok — a cell count
      for (let x = 0; x < widest; x += 1) { // cells-ok — a cell column
        const inked = alone.filter((a) => bits([...(a[r] ?? "")][x] ?? " ") !== 0).length; // cells-ok — a layer count
        if (inked >= 2) shared += 1; // cells-ok — a cell count
      }
    }
    expect(shared).toBeGreaterThanOrEqual(8); // cells-ok — a cell count
  });

  it("a pie's wedges still union, which is the other arm of the same rule", () => {
    // Classifying the pie's fills as `"curve"` reopens exactly the seams
    // C12 I40 closed, so this is LM1's claim restated as the partition's other
    // half:
    // the union is not gone, it is scoped.
    expect(partialsIn(kit().renderToLines(PIE, 80).map(plain))).toEqual([]);
  });
});
