/**
 * SK1–SK10 — `sankey`: bars for the nodes, ribbons for the flows, over
 * `graph`'s layering (C12 I110, I111, §3ap).
 *
 * **Walked by hand before the code, and the walk is what SK1 asserts.** The
 * default fixture at nine rows: the tightest layer is the sources — `a 6 · b 3 ·
 * c 2` with two gaps of a row in eighteen half-rows — so the scale is `14/11`,
 * the slices round to `6 · 1 · 4 · 3`, the bars are `a 7 · b 4 · c 3 · x 9 ·
 * y 5`, and the left stack is exactly eighteen half-rows with its gaps. Every
 * number here was written down before `sankeyLayout` produced it, which is the
 * only way a test of a layout can be more than a snapshot of the layout.
 *
 * **Every fixture is unequal on purpose.** Equal flows are the degenerate input
 * on which a slice at the wrong weight, a bar at the wrong side's total and two
 * sinks swapped all agree with the right answer (`test/support/README.md`).
 *
 * **The rows read the frame and the layout both.** A count is satisfied by
 * every wrong figure that happens to have the count; SK2 reads the cells left
 * of `hub`'s bar and SK4 reads the dummy's column, because *containment is not
 * correctness*.
 */
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import type { Graph } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { refOf } from "../../src/presentation/plot/marks.js";
import { sankeyArea, sankeyLayout } from "../../src/presentation/plot/sankey.js";
import type { SankeyCell } from "../../src/presentation/plot/sankey.js";
import { plotToSvg } from "../../src/presentation/plot/svg.js";
import { b } from "../../src/shell/builders/index.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_UNICODE_CAPS, measurable } from "../support/render.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const strip = (s: string): string => s.replace(/\[[0-9;]*m/gu, "");

type Flow = readonly [string, string, number];
const graph = (nodes: readonly string[], edges: readonly Flow[]): Graph => ({
  nodes: nodes.map((id) => ({ id })),
  edges: edges.map(([from, to, weight]) => ({ from, to, weight })),
});

/** The fixtures, by name, as the catalogue declares them (one record, two readers). */
const variants = (CATALOGUE_FORMS as Record<string, Record<string, Record<string, unknown>>>)["sankey"]!;
const variant = (name: string): Graph => variants[name]!["graph"] as Graph;
const DEFAULT = variant("default");

function frame(g: Graph, width: number, caps: TerminalCapabilities, height = 9): readonly string[] {
  const kit = measurable({ definitions: [plotDefinition], theme: DARK_THEME, capabilities: caps });
  return kit.renderToLines(block({ kind: "plot", id: "s", form: "sankey", height, series: [], graph: g } as never), width);
}

/** The terminal's own call: eighteen half-rows, a row's gap, whole units. */
const HALF = { height: 18, gap: 2, min: 1, quantum: true } as const;

describe("SK — the sankey, one geometry and two painters (C12 I110, I111)", () => {
  it("SK1 (C12 I110, §3ap.3): the default fixture's geometry is the hand walk, and the fixture responds", () => {
    const lay = sankeyLayout(DEFAULT, HALF);
    const bar = (id: number): readonly [number, number] => {
      const bb = lay.bars.get(id)!;
      return [bb.y0, bb.y1];
    };
    // a b c x y are 0 1 2 3 4. The left stack: b then a then c, top to bottom,
    // as the ordering pass placed them; each bar exactly its slices.
    expect(bar(1), "b").toEqual([0, 4]);
    expect(bar(0), "a").toEqual([6, 13]);
    expect(bar(2), "c").toEqual([15, 18]);
    expect(bar(4), "y").toEqual([1, 6]);
    expect(bar(3), "x").toEqual([8, 17]);
    expect(lay.fits).toBe(true);
    const rib = (from: number, to: number) => lay.ribbons.find((r) => r.from === from && r.to === to)!;
    expect(rib(0, 3).sy1 - rib(0, 3).sy0, "a→x at 5 × 14/11").toBe(6);
    expect(rib(0, 4).sy1 - rib(0, 4).sy0, "a→y at 1 × 14/11, rounded up to the floor").toBe(1);
    expect(rib(1, 4).sy1 - rib(1, 4).sy0, "b→y").toBe(4);
    expect(rib(2, 3).sy1 - rib(2, 3).sy0, "c→x").toBe(3);
    // **Far-end order** (K2): `y` sits above `x`, so `a`'s slice to `y` is the
    // upper one although `a→x` was declared first.
    expect(rib(0, 4).sy0, "a→y leaves above a→x").toBeLessThan(rib(0, 3).sy0);
    expect(rib(0, 4).sy1).toBe(rib(0, 3).sy0);
    // A slice arrives at the width it left with.
    for (const r of lay.ribbons) expect(r.ty1 - r.ty0).toBe(r.sy1 - r.sy0);

    // **The fixture responds.** One weight doubled moves the frame — and it is
    // the frame that is compared, because every number above could be right
    // about a picture nobody draws.
    const before = frame(DEFAULT, 80, FULL_CAPS);
    const heavier = graph(["a", "b", "c", "x", "y"], [["a", "x", 10], ["a", "y", 1], ["b", "y", 3], ["c", "x", 2]]);
    expect(frame(heavier, 80, FULL_CAPS)).not.toEqual(before);
  });

  it("SK2 (C12 I110 K6): a node that emits more than it takes is the larger side, and the shortfall is bare bar", () => {
    const g = variant("loss");
    const lay = sankeyLayout(g, HALF);
    const hub = lay.bars.get(1)!;
    // scale 16/5 = 3.2: `src→hub` 6, `hub→p` 10, `hub→q` 6 — the bar is the out-side.
    expect(hub.y1 - hub.y0).toBe(16);
    const incoming = lay.ribbons.find((r) => r.to === 1)!;
    expect(incoming.ty1 - incoming.ty0).toBe(6);
    expect(incoming.ty0).toBe(hub.y0);

    // **Read from the cells, not the numbers.** `hub` is the middle of three
    // layers at 80 columns, so its bar is column 40 and the ribbon arriving is
    // in column 39. The bar is sixteen half-rows and the ribbon six, so five
    // whole rows of bar have nothing arriving beside them — the loss, drawn.
    const area = sankeyArea(g, 9, 80, FULL_CAPS);
    const col = (c: number): readonly string[] => area.rows.map((row) => row[c]!.text);
    const rowsOf = (y0: number, y1: number): number[] => {
      const out: number[] = [];
      for (let r = 0; r < 9; r += 1) if (2 * r >= y0 && 2 * r + 1 < y1) out.push(r); // cells-ok — a row index
      return out;
    };
    const barRows = rowsOf(hub.y0, hub.y1);
    const fedRows = new Set(rowsOf(incoming.ty0 - 1, incoming.ty1 + 1));
    expect(barRows.length).toBeGreaterThanOrEqual(7);
    for (const r of barRows) expect(col(40)[r], `row ${String(r)} is bar`).toBe("█");
    const bare = barRows.filter((r) => !fedRows.has(r));
    expect(bare.length, "rows of bar with nothing arriving").toBeGreaterThanOrEqual(4);
    for (const r of bare) expect(col(39)[r], `row ${String(r)} has no ribbon arriving`).toBe(" ");
    for (const r of barRows.filter((rr) => fedRows.has(rr))) expect(col(39)[r], `row ${String(r)} has the ribbon`).not.toBe(" ");
  });

  it("SK3 (C12 I110 K1, K7, K12): a reversed edge is drawn forward in its declared source's colour, and a deduplicated pair sums", () => {
    const g = variant("cycle");
    const lay = sankeyLayout(g, { ...HALF, height: 16, gap: 1 });
    expect(lay.reversed).toBe(1);
    // `c→a` (node 2 → node 0) is drawn `a→c` through a dummy; both pieces carry `c`'s slot.
    const pieces = lay.ribbons.filter((r) => r.weight === 1);
    expect(pieces).toHaveLength(2);
    for (const r of pieces) expect(r.source, "the declared source, not the drawn one").toBe(2);
    expect(pieces[0]!.from).toBe(0);
    // The notice row is in the frame, and it is the last row of the declared nine.
    const lines = frame(g, 80, FULL_CAPS).map(strip);
    expect(lines).toHaveLength(9);
    expect(lines[8]).toMatch(/^1 reversed/u);
    // The reversed ribbon leaves `a`'s bar in `c`'s slot: the cell right of the
    // bar at its lowest slice.
    const area = sankeyArea(g, 9, 80, FULL_CAPS);
    const aBar = lay.bars.get(0)!;
    const row = Math.floor((aBar.y1 - 1) / 2);
    expect(area.rows[row]![1]!.ref).toBe(refOf(2));

    // **Deduplication sums** (K1). `a→b 2` and `b→a 3` are one edge after the
    // reversal, and the ribbon carries five.
    const pair = sankeyLayout(graph(["a", "b"], [["a", "b", 2], ["b", "a", 3]]), HALF);
    expect(pair.reversed).toBe(1);
    expect(pair.ribbons).toHaveLength(1);
    expect(pair.ribbons[0]!.weight).toBe(5);
  });

  it("SK4 (C12 I110 K4): an edge through a layer is ribbon in the middle column, never a bar", () => {
    const g = graph(["a", "b", "c"], [["a", "b", 2], ["a", "c", 1], ["b", "c", 2]]);
    const lay = sankeyLayout(g, HALF);
    const dummy = [...lay.bars.values()].find((bb) => bb.id >= 3)!;
    expect(dummy.layer).toBe(1);
    // The dummy's slot counts in its layer: `b` and the dummy share eighteen half-rows with a gap.
    const bBar = lay.bars.get(1)!;
    expect(bBar.y1 - bBar.y0 + 2 + (dummy.y1 - dummy.y0)).toBeLessThanOrEqual(18);
    const area = sankeyArea(g, 9, 80, FULL_CAPS);
    const cells = area.rows.map((row) => row[40]!);
    for (let hr = dummy.y0; hr < dummy.y1; hr += 1) {
      const cell = cells[Math.floor(hr / 2)]!;
      expect(["▒", "▀", "▄"], `row ${String(Math.floor(hr / 2))} is ribbon`).toContain(cell.text);
      expect(cell.ref, "in `a`'s slot").toBe(refOf(0));
    }
    for (let hr = bBar.y0 + 1; hr < bBar.y1 - 1; hr += 2) {
      expect(cells[Math.floor(hr / 2)]!.text, "and `b` is a bar").toBe("█");
    }
  });

  it("SK5 (C12 I110 K3): labels are dropped inner-first and never truncated", () => {
    const g = variant("long-labels");
    const wide = frame(g, 80, FULL_CAPS, 7).map(strip).join("\n");
    const narrow = frame(g, 40, FULL_CAPS, 7).map(strip).join("\n");
    for (const name of ["authentication", "rate-limiter", "upstream-service"]) expect(wide).toContain(name);
    expect(narrow).toContain("authentication");
    expect(narrow).toContain("upstream-service");
    expect(narrow, "the middle one goes, whole").not.toContain("rate-limiter");
    expect(narrow, "and nothing is cut").not.toMatch(/[…~]/u);
    expect(narrow).not.toContain("rate");
    // Every row is still exactly the width: a label never pushed a cell out.
    for (const line of narrow.split("\n")) expect(line.length).toBe(40); // cells-ok — ASCII-only labels and single-cell glyphs
  });

  it("SK6 (C12 I110 K5, I8): more sources than rows drops the least flow and names them", () => {
    const g = variant("crowded");
    const area = sankeyArea(g, 5, 80, FULL_CAPS);
    expect(area.dropped).toEqual(["src-01", "src-02", "src-03", "src-04"]);
    expect(area.rows).toHaveLength(4);
    const lines = frame(g, 80, FULL_CAPS, 5).map(strip);
    expect(lines).toHaveLength(5);
    expect(lines[4]).toMatch(/^\+4 more · src-01 · src-02 · src-03 · src-04/u);
    const figure = lines.slice(0, 4).join("\n");
    for (const kept of ["src-05", "src-07", "src-09", "src-11", "sink"]) expect(figure).toContain(kept);
    expect(figure).not.toContain("src-01");
  });

  it("SK7 (C12 I111): two glyphs at every depth, one alphabet per width convention, and a background where two flows share a cell", () => {
    const letters = /[a-z]/gu;
    const glyphsOf = (lines: readonly string[]): Set<string> =>
      new Set(lines.map(strip).join("").replace(letters, "").replace(/ /gu, "").split(""));
    const full = frame(DEFAULT, 80, FULL_CAPS);
    expect([...glyphsOf(full)].sort()).toEqual(["▀", "▄", "█", "▒"].sort());
    const ascii = frame(DEFAULT, 80, ASCII_CAPS);
    expect([...glyphsOf(ascii)].sort()).toEqual(["#", "-", "="]);
    const wide = frame(DEFAULT, 80, { ...FULL_CAPS, ambiguousWidth: "wide" });
    expect(wide.map(strip), "the wide frame is the ASCII frame").toEqual(ascii.map(strip));
    // **I17, asserted as an equality**: the one-bit unicode frame is the 24-bit
    // frame with its colours removed — not merely *a* frame with two glyphs.
    const mono = frame(DEFAULT, 80, MONO_UNICODE_CAPS);
    expect(mono.map(strip)).toEqual(full.map(strip));
    expect(glyphsOf(mono).has("█") && glyphsOf(mono).has("▒"), "bar and ribbon are two shapes at one bit").toBe(true);
    // The two-owner cell: `b→y`'s lower edge over `a→y`'s upper edge share a
    // cell, and the lower owner is painted as the background.
    expect(full.join("\n")).toMatch(/\[48;2;/u);
    expect(ascii.join("\n"), "ASCII has no half to share").not.toMatch(/\[48;2;/u);
  });

  it("SK8 (C12 I110, §3ap.3): the SVG draws the same geometry in pixels — a rect per node, a half-opaque path per segment, the last layer's labels flipped", () => {
    const svg = plotToSvg(
      block({ kind: "plot", id: "s", form: "sankey", height: 9, series: [], graph: DEFAULT } as never),
      DARK_THEME,
    );
    expect(svg).not.toBeNull();
    if (svg === null) return;
    const rects = [...svg.matchAll(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="([^"]*)" fill="#[0-9a-f]{6}" stroke=/gu)];
    expect(rects, "one rect per declared node").toHaveLength(5);
    expect([...svg.matchAll(/fill-opacity="0.5"/gu)], "one ribbon per segment").toHaveLength(4);
    expect([...svg.matchAll(/text-anchor="end"/gu)], "the sinks' labels sit to the left").toHaveLength(2);
    expect(svg).not.toContain("reversed");
    // **Continuous, so the heights are the flows exactly**: 2 · 3 · 4 · 6 · 7 for c · b · y · a · x.
    const heights = rects.map((m) => Number(m[1])).sort((p, q) => p - q);
    const unit = heights[0]!;
    expect(heights.map((h) => h / unit)).toEqual([1, 1.5, 2, 3, 3.5].map((r) => expect.closeTo(r, 3)));
    // The reversed notice crosses too, as `graph`'s does.
    const cyc = plotToSvg(block({ kind: "plot", id: "c", form: "sankey", height: 9, series: [], graph: variant("cycle") } as never), DARK_THEME);
    expect(cyc).toContain("1 reversed");
  });

  it("SK9 (C12 I110 K10, I11): two renders agree, and relaxation keeps the ordering pass's order", () => {
    for (const name of Object.keys(variants)) {
      const g = variant(name);
      const h = variants[name]!["height"] as number;
      expect(frame(g, 80, FULL_CAPS, h)).toEqual(frame(g, 80, FULL_CAPS, h));
      const lay = sankeyLayout(g, HALF);
      for (const row of lay.layers) {
        for (let i = 1; i < row.length; i += 1) { // cells-ok — a node count
          expect(lay.bars.get(row[i]!)!.y0, `${name}: layer order kept`).toBeGreaterThanOrEqual(lay.bars.get(row[i - 1]!)!.y1);
        }
      }
    }
  });

  it("T1.132 (C12 I118, C12 I110): a family and a keycap as node names — whole in `sankeyArea`'s cells and in the frame", () => {
    const KEYCAP = "1️⃣";
    const FAMILY = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    const g = graph([FAMILY, "b", KEYCAP, "y"], [[FAMILY, KEYCAP, 5], ["b", "y", 3], [FAMILY, "y", 2]]);
    // **Read before Ink**: the label's cell holds the whole cluster and the
    // cell after it is the continuation. The loop this replaced wrote one code
    // point per cell, so the keycap's cell held `1` and the family's three
    // cells held a face each (F969, F976).
    const area = sankeyArea(g, 9, 80, FULL_CAPS);
    for (const [name, shape] of [["FAMILY", FAMILY], ["KEYCAP", KEYCAP]] as const) {
      const hits = area.rows.flatMap((row) => row.flatMap((c, i) => (c.text === shape ? [{ row, i }] : [])));
      expect(hits, `${name} in exactly one cell`).toHaveLength(1); // cells-ok — a hit count
      const { row, i } = hits[0]!;
      expect(row[i + 1]?.text, `${name}'s continuation`).toBe("");
    }
    // And through the public render, compared in NFC as C09 T2.129 compares.
    const shown = frame(g, 80, FULL_CAPS).map(strip).join("\n").normalize("NFC");
    expect(shown).toContain(FAMILY.normalize("NFC"));
    expect(shown).toContain(KEYCAP.normalize("NFC"));
  });

  // **The builder's gate, and the row runs the day the builder admits the
  // form.** `b.plot` refuses `graph` off `form: "graph"` (C04 I69) and was not
  // widened when `sankey` took the member on `graph`'s rule (C04 I92); the
  // validator admits it and T2.38 asserts so. The two gates disagree today, the
  // fix belongs to `src/shell/builders/index.ts`, and this is `todo` rather than
  // red so that it flips to a running row — not a passing skip — on its own.
  it("SK12 (C12 I110 K3): a label longer than its gap is dropped whole, and the fit test is the only guard that sees it", () => {
    // **SK5's fixture stopped seeing the fit test** (F980). At 40 columns the
    // `long-labels` middle name is right-placed at 22 and the sink's name,
    // written before it outside-in, is left-placed at 22 — so the overlap
    // guard drops the middle name whether the fit test runs or not, and the
    // frames with and without it are byte-identical. Here the first name is
    // thirty cells against a gap of seventeen, and nothing else is written in
    // its way: the fit test alone decides, and without it the name is written
    // across the middle bar and takes the middle label's cells.
    const g = graph(["authentication-gateway-service", "b", "c"], [["authentication-gateway-service", "b", 3], ["b", "c", 3]]);
    const narrow = frame(g, 40, FULL_CAPS, 7).map(strip);
    const wide = frame(g, 80, FULL_CAPS, 7).map(strip).join("\n");
    expect(wide, "the fixture responds: at 80 the name fits its gap").toContain("authentication-gateway-service");
    expect(narrow.join("\n"), "dropped whole").not.toContain("authentication");
    expect(narrow.join("\n"), "and never cut").not.toMatch(/[…~]/u);
    expect(narrow.join("\n"), "the middle label keeps its cells").toMatch(/█▒b▒/u);
    // The middle bar stands in every row: a name written wherever its bar is
    // would put a letter in column 20.
    for (const line of narrow) expect([...line][20], line).toBe("█"); // cells-ok — a column index into single-cell glyphs
  });

  const spec = { id: "s", form: "sankey", height: 9, series: [], graph: DEFAULT } as unknown as Parameters<typeof b.plot>[0];
  const builderAdmits = ((): boolean => {
    try {
      b.plot(spec);
      return true;
    } catch {
      return false;
    }
  })();
  (builderAdmits ? it : it.todo)("SK10 (C04 I69, I92): the builder admits `graph` on `sankey` as the validator does", () => {
    expect(() => b.plot(spec)).not.toThrow();
    expect(() => b.plot({ ...spec, form: "line" } as never), "and still refuses it off both forms").toThrow(/I69/u);
  });

  it("SK13 (C12 I125, F1054): the type refuses what one `if` was holding", () => {
    // **F717's residue.** `SankeyCell` was one wide record inhabiting both the
    // label cells and the picture cells, so *a background never lands on a
    // character a reader reads* (C10 I21) was a property of one branch in
    // `sankeyArea` and nothing stated it. The union states it, and the second
    // arm demands a `PictureGlyph` — a brand whose only constructor runs
    // `assertPictureGlyph`, so the keeper is on the path to the type rather
    // than beside the construction.
    //
    // **The refusals are the subject and compilation is the gate.** A
    // `@ts-expect-error` that stops being needed is an *error* under
    // `tsc --noEmit`, so a union that quietly widened again fails the check
    // rather than passing this row — which is the fabricated violation the
    // structural half owes, checked by the compiler instead of by an assertion.
    const ref = refOf(0);
    const other = refOf(1);

    // The admitted set: a label character, and a cell with one owner.
    const label: SankeyCell = { text: "A" };
    const owned: SankeyCell = { text: "\u2588", ref };
    expect([label.text, owned.text]).toEqual(["A", "\u2588"]);

    // @ts-expect-error — a background may not be attached to a plain string (C12 I125)
    const refused: SankeyCell = { text: "A", ref, background: other };
    // @ts-expect-error — nor to a label cell that names no owner at all
    const alsoRefused: SankeyCell = { text: " ", background: other };
    expect([refused, alsoRefused].length, "both forms are constructed and both are refused").toBe(2);

    // **Read the frame, not only the type.** Every cell the arm draws with a
    // background carries a fill glyph — the property, taken off the cells the
    // constructor produced rather than asserted about the constructor.
    const twoOwners = graph(
      ["a", "b", "c", "x", "y"],
      [["a", "x", 5], ["a", "y", 1], ["b", "y", 3], ["c", "x", 2]],
    );
    const painted = sankeyArea(twoOwners, 5, 80, FULL_CAPS).rows
      .flat()
      .filter((c) => c.background !== undefined);
    expect(painted.length, "the fixture responds — five rows is where two owners share cells").toBe(77);
    expect([...new Set(painted.map((c) => c.text))], "and every one of them is a fill").toEqual(["\u2580"]);

    // The control that says which fixture responds: the same call on a graph
    // whose layers never share a cell draws no background at all, so asserting
    // the property there would have been vacuous.
    const noSharing = graph(["src", "hub", "p", "q"], [["src", "hub", 6], ["hub", "p", 10], ["hub", "q", 6]]);
    expect(
      sankeyArea(noSharing, 5, 80, FULL_CAPS).rows.flat().filter((c) => c.background !== undefined),
      "the vacuous fixture, named rather than avoided",
    ).toEqual([]);
  });
});
