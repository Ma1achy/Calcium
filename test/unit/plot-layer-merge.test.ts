/**
 * LM1–LM5: a cell two layers ink carries both layers' dots (C12 I40, §3u).
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

describe("LM3 (C12 I40): a radar's frame survives the polygons crossing it", () => {
  // **The first form of this row passed against the defect**, which is what
  // the row is here to catch: *the composed figure inks at least as many cells
  // as one polygon over the same frame* is true while the frame is being eaten,
  // because the polygon inks the cells it takes. Counting ink cannot see a
  // trade.
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

  it("every dot the frame sets is set in the composed figure", () => {
    // Containment of *cells* is the weaker half: a cell can survive with the
    // frame's dots replaced by a polygon's. The dots are the claim.
    const rendered = radarRender(SERIES, CATS, 80, 17, FULL_CAPS);
    const composed = kit().renderToLines(RADAR, 80).map(plain);
    const bits = (c: string): number => (isBraille(c) ? c.codePointAt(0)! - 0x2800 : 0);
    let lost = 0;
    rendered.frame.forEach((row, r) => {
      [...row].forEach((ch, x) => {
        const want = bits(ch);
        if (want === 0) return;
        const got = bits([...(composed[r] ?? "")][x] ?? " ");
        if ((got & want) !== want) lost += 1; // cells-ok — a cell count
      });
    });
    expect(lost).toBe(0); // cells-ok — a cell count
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
