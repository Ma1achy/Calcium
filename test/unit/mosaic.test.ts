/**
 * MG1–MG9 — the mosaic's grid, its refusals and the cell that bounds its child
 * (C04 I71, I72 · C09 I35).
 *
 * **Three of these read the frame rather than a count**, because the count is
 * what agreed while the figure was wrong: `measure` returned `height` through a
 * squashed child, an over-wide grid and a truncated error box alike. MG5, MG6
 * and MG7 exist for the cases no arithmetic can arbitrate.
 */
import { describe, expect, it } from "vitest";
import { mosaicRects, parseAreas, type Share } from "../../src/data/viewmodel/index.js";
import { mosaicDefinition } from "../../src/presentation/blocks/kinds/containers.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { b } from "../../src/shell/builders/index.js";
import { cells } from "../../src/presentation/text.js";
import { measurable, FULL_CAPS } from "../support/render.js";

const kit = measurable({ capabilities: FULL_CAPS });

/** The pinwheel: the figure nested rows and columns cannot draw (C04 §3f). */
const PINWHEEL = "AAB/DEB/DCC";

/** The validator's complaints about a mosaic, and nothing else's. */
function errs(over: Record<string, unknown>): readonly string[] {
  const r = validateDocument({
    schema: "tui.view/1",
    id: "d",
    command: "x",
    status: "ok",
    meta: {},
    blocks: [
      {
        kind: "mosaic",
        id: "m",
        height: 6,
        areas: PINWHEEL,
        children: ["a", "b", "c", "d", "e"].map((n) => ({ kind: "raw", id: n, text: n })),
        ...over,
      },
    ],
  } as never);
  return r.ok ? [] : (r.error as unknown[]).map(String).filter((x) => /areas|height|columns|rows/u.test(x));
}

/** What `b.mosaic` said, or `""` where it accepted. */
function thrown(over: Record<string, unknown>): string {
  try {
    b.mosaic({
      height: 6,
      areas: PINWHEEL,
      children: ["a", "b", "c", "d", "e"].map((n) => b.raw(n)),
      ...over,
    } as never);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const plain = (line: string): string => line.replace(/\[[0-9;]*m/gu, "");

describe("MG — the mosaic's grid", () => {
  it("MS1 (C04 I71): the pinwheel passes both gates, and is the figure a group cannot draw", () => {
    expect(errs({}), "the control, so a refusal below is about its own fault").toEqual([]);
    expect(thrown({}), "and the constructor agrees").toBe("");

    // **The claim the kind exists for, asserted rather than cited.** A slicing
    // figure admits a guillotine cut at its top level; the pinwheel does not.
    const parsed = parseAreas(PINWHEEL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const rs = parsed.grid.regions;
    const cut = (axis: "col" | "row"): number | null => {
      const lines = axis === "col" ? parsed.grid.columns : parsed.grid.rows;
      for (let at = 1; at < lines; at += 1) {
        const lo = axis === "col" ? (r: (typeof rs)[number]): boolean => r.col + r.cols <= at : (r: (typeof rs)[number]): boolean => r.row + r.rows <= at;
        const hi = axis === "col" ? (r: (typeof rs)[number]): boolean => r.col >= at : (r: (typeof rs)[number]): boolean => r.row >= at;
        if (rs.every((r) => lo(r) || hi(r))) return at;
      }
      return null;
    };
    expect(cut("col"), "no vertical guillotine cut").toBeNull();
    expect(cut("row"), "and no horizontal one — so no nesting of groups expresses it").toBeNull();
  });

  it("MS2 (C04 I71): the four refusals, at both gates, each naming its own part", () => {
    // **Indexed by the rule each one breaks.** The third is the row with teeth:
    // `"ABA"` is a well-formed-looking string naming a region in two pieces, and
    // nothing about it reads as wrong.
    const cases: readonly (readonly [string, Record<string, unknown>, RegExp])[] = [
      ["an empty grid", { areas: "", children: [] }, /at least one row/u],
      ["a row with no columns", { areas: "AB//CD", children: [] }, /at least one row/u],
      ["ragged rows", { areas: "AAB/DE", children: [] }, /row 1 has 2 columns and row 0 has 3/u],
      ["a region in two pieces", { areas: "ABA", children: [] }, /region "A" is not a rectangle/u],
      ["an L-shaped region", { areas: "AA/AB", children: [] }, /region "A" is not a rectangle/u],
      ["too few children", { areas: "AB", children: [{ kind: "raw", id: "z", text: "z" }] }, /names 2 regions \("A", "B"\) for 1 children/u],
    ];
    for (const [name, over, fault] of cases) {
      const found = errs(over);
      expect(found.length, `${name}: refused by the validator`).toBeGreaterThan(0); // cells-ok — a fault count
      expect(found.join("\n"), `${name}: names its own part`).toMatch(fault);
      const constructed = thrown({
        ...over,
        ...(Array.isArray(over["children"])
          ? { children: (over["children"] as readonly unknown[]).map(() => b.raw("z")) }
          : {}),
      });
      expect(constructed, `${name}: refused at construction too`).toMatch(fault);
    }
  });

  it("MS3 (C04 I71): `height` is required, because omitting it draws one blank row", () => {
    for (const bad of [0, -1, 2.5, undefined]) {
      expect(errs({ height: bad }).join("\n"), `height ${String(bad)}`).toMatch(/positive integer/u);
      expect(thrown({ height: bad }), `height ${String(bad)} at construction`).toMatch(/positive integer/u);
    }
    // The reason, measured rather than asserted as a preference: with a height
    // the figure draws, and `measure` is that number at every width.
    const block = b.mosaic({
      height: 6,
      areas: PINWHEEL,
      children: ["a", "b", "c", "d", "e"].map((n) => b.raw(n)),
    });
    for (const width of [20, 40, 80]) {
      expect(kit.renderToLines(block, width), `width ${String(width)}`).toHaveLength(6);
    }
  });

  it("MS4 (C04 I72): a spanning region takes the sum of what it spans, and the weights are per grid line", () => {
    const parsed = parseAreas(PINWHEEL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const even = mosaicRects(parsed.grid, 60, 6);
    // A is `AA` on row 0: two columns of 20.
    expect(even[0], "A spans two columns").toEqual({ left: 0, top: 0, width: 40, height: 2 });
    // B is the right column across rows 0 and 1.
    expect(even[1], "B spans two rows").toEqual({ left: 40, top: 0, width: 20, height: 4 });

    // **One entry per grid line and never per child**, so a mismatched length is
    // refused against the grid's count rather than `children.length`.
    expect(errs({ columns: [1, 1] }).join("\n")).toMatch(/"columns" has 2 entries for a grid 3/u);
    expect(errs({ rows: [1, 1, 1, 1] }).join("\n")).toMatch(/"rows" has 4 entries for a grid 3/u);
    expect(thrown({ columns: [1, 1] })).toMatch(/"columns" has 2 entries/u);

    // **The remainder is distributed, not dropped** — `facetWidths`' ruling,
    // because a mosaic tiles and a `row` group does not. Three columns at 40
    // is 13 each and leaves one column blank without this.
    const ragged = mosaicRects(parsed.grid, 40, 6);
    expect((ragged[1]?.left ?? 0) + (ragged[1]?.width ?? 0), "B's right edge is the width").toBe(40);
    expect((ragged[4]?.left ?? 0) + (ragged[4]?.width ?? 0), "and so is C's").toBe(40);
    expect((ragged[2]?.left ?? 0) + (ragged[2]?.width ?? 0), "while D keeps its own column").toBe(14);

    // Fixed shares come off the budget before the weights divide the rest.
    const fixed: readonly Share[] = [{ cells: 10 }, 1, 1];
    const weighted = mosaicRects(parsed.grid, 50, 6, fixed);
    expect(weighted[0]?.width, "A takes the fixed 10 plus one 20-wide weight").toBe(30);
    expect(weighted[1]?.left, "and B starts after both").toBe(30);
  });

  it("MS5 (C09 I35): the cell keeps its child's own rows rather than its middle", () => {
    // **The row count agrees whether this is right or wrong**, which is why the
    // frame is read. A six-row child in a two-row cell either keeps rows 0 and 1
    // or is squashed into rows 2 and 5 — and `measure` says 6 either way.
    // **No leading gap on the child** (C04 §3a). `b.steps` gaps by default and
    // that row is the block's own now, so a cell's child draws it where a
    // mosaic used to ignore the field — which would put `one` on row 1 and cut
    // `six`. The rows below are read by index, so the fixture opts out.
    const tall = b.steps([
      { label: "one", state: "done" },
      { label: "two", state: "done" },
      { label: "three", state: "done" },
      { label: "four", state: "done" },
      { label: "five", state: "done" },
      { label: "six", state: "done" },
    ], { gapBefore: false });
    const block = b.mosaic({ height: 6, areas: "AB", children: [tall, b.raw("right")] });
    const lines = kit.renderToLines(block, 40).map((l) => plain(l).slice(0, 20));
    expect(lines).toHaveLength(6);
    expect(lines[0], "the child's first row, not its third").toMatch(/one/u);
    expect(lines[1], "and its second").toMatch(/two/u);
    // The cell is the full height here, so all six show; the bounding is MG6's.
    expect(lines[5], "down to its last").toMatch(/six/u);
  });

  it("MS6 (C09 I35, C25 I1): a cell bounds an over-tall child, and F239 does not transfer", () => {
    // `scroll` draws an over-tall child whole — `measure=4 rendered=8` (F239) —
    // because it needs a slice at an arbitrary offset. A mosaic needs a clip at
    // the child's row 0, which exists, so I1 holds here rather than being
    // knowingly false.
    const tall = b.steps(
      ["one", "two", "three", "four", "five", "six", "seven", "eight"].map((label) => ({
        label,
        state: "done" as const,
      })),
    );
    // **The cell must be SHORTER than the mosaic, or this row cannot see its own
    // subject.** A single region fills the frame, so the container's height
    // bounds the spill and removing the cell's clip changes nothing — which is
    // exactly what the mutation pass reported, against a row that was asserting
    // the right thing about a fixture that could not construct it. `AB/CB` gives
    // A the top half and C the bottom, so an unclipped A writes into C's rows.
    const block = b.mosaic({
      height: 4,
      areas: "AB/CB",
      children: [tall, b.raw("right"), b.raw("below")],
    });
    const lines = kit.renderToLines(block, 40).map((l) => plain(l));
    expect(lines, "measure is 4 and the render is 4").toHaveLength(4);
    expect(lines.slice(0, 2).join("\n"), "the top of the child, not its middle").toMatch(/one/u);
    expect(
      lines.slice(2).join("\n"),
      "and the cell below still belongs to the cell below — an unclipped child writes here",
    ).toMatch(/below/u);
    expect(lines.slice(2).join("\n"), "with nothing of the tall child in it").not.toMatch(/three|four/u);
  });

  it("MS7 (C09 I35, C09 I1): no row exceeds the width, at the widths the clamp is reachable at", () => {
    // **The container's clip cannot be the guarantee**: a cell that clips its own
    // child shadows the ancestor's clip rather than intersecting it, so the
    // arithmetic is what holds the width. The floor of 1 per grid line makes this
    // reachable — a three-column grid asks for three cells at width 1.
    const block = b.mosaic({
      height: 6,
      areas: PINWHEEL,
      children: ["a", "b", "c", "d", "e"].map((n) => b.raw(n)),
    });
    for (const width of [1, 2, 3, 4, 7, 13, 40, 120]) {
      for (const line of kit.renderToLines(block, width)) {
        expect(cells(plain(line), "narrow"), `width ${String(width)}`).toBeLessThanOrEqual(width);
      }
    }
  });

  it("MS8 (C04 I71): a hole is drawn blank, named by no child, and exempt from the rectangle rule", () => {
    // `.` in two pieces is legal where a named region in two pieces is not —
    // which is the exemption stated rather than left to be discovered.
    expect(errs({ areas: "A.B", children: [{ kind: "raw", id: "a", text: "a" }, { kind: "raw", id: "b", text: "b" }] })).toEqual([]);
    expect(errs({ areas: ".A./A.A", children: [{ kind: "raw", id: "a", text: "a" }] }).join("\n"), "a split hole is fine").toMatch(
      /region "A" is not a rectangle/u,
    );
    const parsed = parseAreas("A.B");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.grid.regions.map((r) => r.name), "the hole is not a region").toEqual(["A", "B"]);
  });

  it("MS9 (C04 I71): a nested mosaic is sized by its cell, and that is the general rule", () => {
    const inner = b.mosaic({ height: 6, areas: "XY", children: [b.raw("xxx"), b.raw("yyy")] });
    const outer = b.mosaic({ height: 2, areas: "AB", children: [inner, b.raw("right")] });
    const lines = kit.renderToLines(outer, 40);
    expect(lines, "the outer's height wins, and the inner's is not read").toHaveLength(2);
    expect(plain(lines.join("\n"))).toMatch(/xxx/u);
    expect(plain(lines.join("\n"))).toMatch(/right/u);
  });

  it("MS10 (C04 I42, C04 I72 · C29 I4): unequal shares divide by largest remainder, and the leftover goes to the largest fractional part", () => {
    // **The rows that made 1.7 visible.** The whole of phase 1 ran with every
    // gate green while this changed: 458 goldens, 2,440 baseline frames and
    // 6,281 test rows, and not one of them renders a mosaic whose weights are
    // unequal at a width the weights do not divide. The three declarations in
    // the tree are `[2,1]`, `[1,3]` and `[2,1]` on the rows — and `[1,3]`
    // divides at all seven default widths, while the other two are rendered at
    // no width where the two rules differ. **A corpus chosen for a property may
    // not have it**, and this is the row that says the property is there.
    //
    // `spread` used to hand the leftover to the earliest non-fixed line, which
    // agrees with largest remainder on equal weights — the reason one function
    // could replace both (F1219) — and disagrees whenever the weights differ
    // and the budget does not divide. At width 80 the declared ratio is 2:1 and
    // the exact division is 53.33 : 26.67, so `[53, 27]` at 1.96:1 lands nearer
    // the number the author wrote than `[54, 26]` at 2.08:1 did.
    const parsed = parseAreas("ab");
    if (!parsed.ok) throw new Error("the grid must parse");
    const widths = (w: number, cols: readonly Share[]): readonly number[] =>
      mosaicRects(parsed.grid, w, 4, cols, undefined).map((r) => r.width);

    expect(widths(80, [2, 1]), "the leftover to the larger fraction").toEqual([53, 27]);
    expect(widths(200, [2, 1]), "and at the widest default width").toEqual([133, 67]);
    expect(widths(40, [2, 1]), "a budget that divides is unchanged either way").toEqual([27, 13]);
    expect(widths(80, [1, 3]), "and so is every width [1,3] divides at").toEqual([20, 60]);

    // **A fixed share is neither shortened nor an absorber** (C04 I44): it comes
    // off the budget first and the weights divide what is left.
    expect(widths(40, [{ cells: 10 }, 1]), "the cell count, then the remainder").toEqual([10, 30]);
  });

  it("MS11 (C09 I35, C29 §8a C1, C9): a grid too narrow for its own floors keeps its geometry and the container cuts", () => {
    // **Three answers became one.** A cell with no room used to be measured at
    // 1, emit a zero-width focusable element and not be drawn — each locally
    // defensible, across three files, about one arithmetic outcome. The floor
    // now lives in the geometry and the cut lives where the rows are written,
    // so the rect says what the grid says and one cut decides both what is
    // reachable and what is painted.
    const parsed = parseAreas("abc");
    if (!parsed.ok) throw new Error("the grid must parse");
    expect(
      mosaicRects(parsed.grid, 1, 3, undefined, undefined).map((r) => r.width),
      "three columns ask for three cells at width 1",
    ).toEqual([1, 1, 1]);

    const block = b.mosaic({ height: 1, areas: "abc", children: [b.raw("A"), b.raw("B"), b.raw("C")] });
    const lines = kit.renderToLines(block, 1);
    expect(lines, "and one row is drawn").toHaveLength(1);
    expect(plain(lines[0] ?? ""), "holding the only cell there is room for").toBe("A");

    const elements = mosaicDefinition.elements?.(block, 1, () => 1, () => null) ?? [];
    expect(
      elements.map((e) => e.id),
      "a cell with no room is no target, which is what the frame already said",
    ).toEqual([(block.children[0] as { id: string }).id]);
    expect(elements[0]?.cols, "and the one that survives is cut to the grid").toEqual({ from: 0, to: 1 });

    // **The other axis, and it needed its own fixture.** A grid whose rows fit
    // its declared height can never reach below it, so the horizontal case
    // above says nothing about the vertical one — the mutation removing the
    // height cut survived against it. Three grid rows in a box of one is the
    // shape that has somewhere to overflow to.
    const tallParse = parseAreas("a/b/c");
    if (!tallParse.ok) throw new Error("the grid must parse");
    expect(
      mosaicRects(tallParse.grid, 4, 1, undefined, undefined).map((r) => r.height),
      "three rows ask for three at a declared height of one",
    ).toEqual([1, 1, 1]);

    const tall = b.mosaic({ height: 1, areas: "a/b/c", children: [b.raw("A"), b.raw("B"), b.raw("C")] });
    const tallElements = mosaicDefinition.elements?.(tall, 4, () => 1, () => null) ?? [];
    expect(
      tallElements.map((e) => e.id),
      "and only the row the box has room for is a target",
    ).toEqual([(tall.children[0] as { id: string }).id]);
    expect(plain(kit.renderToLines(tall, 4).join("\n")), "the frame agrees").toBe("A");
  });
});
