/**
 * TR1–TR12 — `tree`, three layouts of one drawing (C12 I57, §3ah · C04 I65).
 *
 * **The natural sizes are asserted through the fit rather than through an
 * export.** A function published only so a row can read it is an export nothing
 * consumes; the same two numbers are pinned harder by rendering at exactly
 * (rows, columns) and finding nothing dropped, then at one cell less on each
 * axis and finding something dropped. That is the public surface saying it.
 *
 * **TR8 is a corrected row.** The walk ruled that all three layouts agree on a
 * single node — one row, one name, no edge — and the frames refuse it: the
 * top-down figure is centred in the area and the other two begin at column 0.
 * The walk was reasoning about *structure*, and the property that separates them
 * is *placement*, which no row of either artefact had been written about.
 */
import { describe, expect, it } from "vitest";
import { HIERARCHY_ROLE, type HierarchyNode, type PlotForm } from "../../src/data/viewmodel/index.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { b } from "../../src/shell/builders/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { TREE_LAYOUTS, type TreeLayoutName } from "../../src/presentation/plot/tree.js";
import { cells } from "../../src/presentation/text.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { ALL_FORMS } from "../support/plot-forms.js";

const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/gu, "");

function frame(
  hierarchy: HierarchyNode, rows: number, width: number,
  extra: object = {}, caps: object = {},
): readonly string[] {
  const kit = measurable({ definitions: [plotDefinition], capabilities: { ...FULL_CAPS, ...caps } });
  const blk = { kind: "plot", id: "tr", form: "tree", height: rows, series: [], hierarchy, ...extra };
  return kit.renderToLines(blk as never, width).map(plain);
}

const notice = (f: readonly string[]): string | undefined => f.find((r) => r.startsWith("+"));

// The four trees §3ah.1 measures, and the sizes it measured.
const CATALOGUE: HierarchyNode = {
  label: "root",
  children: [
    { label: "render", children: [{ label: "curve", children: [{ label: "raster" }] }, { label: "paint" }] },
    { label: "layout", children: [{ label: "measure" }, { label: "wrap" }] },
    { label: "parse" },
  ],
};
const BROAD: HierarchyNode = {
  label: "root",
  children: Array.from({ length: 12 }, (_v, i) => ({ label: `child${String(i)}` })), // cells-ok — a child count
};
const DEEP: HierarchyNode = (() => {
  let n: HierarchyNode = { label: "leaf" };
  for (let d = 5; d >= 1; d -= 1) n = { label: `level${String(d)}`, children: [n] }; // cells-ok — a depth index
  return { label: "root", children: [n] };
})();
const WIDE_PARENT: HierarchyNode = {
  label: "root",
  children: [
    { label: "initialiseRenderer", children: [{ label: "a" }, { label: "b" }] },
    { label: "x" },
  ],
};

/** §3ah.1's table, and the row that reads *no ordering survives the four rows*. */
const SIZES: readonly (readonly [string, HierarchyNode, Record<TreeLayoutName, readonly [number, number]>])[] = [
  ["catalogue", CATALOGUE, { topDown: [7, 31], leftRight: [5, 29], outline: [9, 18] }],
  ["broad", BROAD, { topDown: [3, 85], leftRight: [12, 13], outline: [13, 11] }],
  ["deep", DEEP, { topDown: [13, 6], leftRight: [1, 50], outline: [7, 28] }],
  ["wide-parent", WIDE_PARENT, { topDown: [5, 20], leftRight: [3, 27], outline: [5, 22] }],
];

describe("TR1 (C12 I57): the natural size of each layout, over four trees", () => {
  for (const [name, tree, sizes] of SIZES) {
    for (const layout of TREE_LAYOUTS) {
      const [rows, columns] = sizes[layout];
      it(`${name} · ${layout} · ${String(rows)} × ${String(columns)}`, () => {
        expect(notice(frame(tree, rows, columns, { treeLayout: layout }))).toBeUndefined();
        // One cell less on either axis and something has to go. **The
        // wide-parent tree is the row that carries the `max`**: without it the
        // top-down width is 5 rather than 20, and every count still agrees.
        expect(notice(frame(tree, rows, columns - 1, { treeLayout: layout }))).toBeDefined();
        if (rows > 1) {
          expect(notice(frame(tree, rows - 1, columns, { treeLayout: layout }))).toBeDefined();
        }
      });
    }
  }

  it("one column short still draws most of the tree, not none of it", () => {
    // **The row the shared tail is for.** A leaf cut has exactly one step on a
    // chain, so without the prefix tail `fitTo` gives up and drops everything —
    // and a notice appears either way, which is why the rows above could not
    // tell the two apart.
    const f = frame(DEEP, 3, 49, { treeLayout: "leftRight" });
    expect(notice(f)).toMatch(/^\+1 more/u);
    expect(f.join("")).toContain("root");
  });

  it("no ordering survives the four trees, which is why this is not a ladder", () => {
    const rowsOf = (s: Record<TreeLayoutName, readonly [number, number]>): number[] =>
      TREE_LAYOUTS.map((l) => s[l][0]); // cells-ok — a row count
    const orders = SIZES.map(([, , s]) => rowsOf(s).map((_r, i) => i).sort((x, y) => rowsOf(s)[x]! - rowsOf(s)[y]!).join());
    expect(new Set(orders).size).toBeGreaterThan(1);
  });
});

/** Which drawing this is, read off the frame rather than asked of the code. */
function layoutOf(f: readonly string[]): TreeLayoutName {
  if (f.some((r) => /^[├╰└|`]/u.test(r))) return "outline";
  // **A label with a join glyph against it on the same row.** Leading blanks are
  // not the discriminator: a left-to-right frame whose root is not on row 0
  // begins with them too, which is what the first form of this helper got wrong.
  if (f.some((r) => /[A-Za-z\u4e00-\u9fff][─┬┴┼╭╮╰╯│+|-]/u.test(r))) return "leftRight";
  return "topDown";
}

describe("TR2 (C12 I57): `auto` is a fit, in a fixed preference order", () => {
  it("takes the first that fits both axes, and prefers top-down where several do", () => {
    expect(layoutOf(frame(CATALOGUE, 12, 40))).toBe("topDown");
    // 29 columns is one short of the top-down figure and exactly the
    // left-to-right one; 9 rows and 20 columns fits only the outline.
    expect(layoutOf(frame(CATALOGUE, 7, 29))).toBe("leftRight");
    expect(layoutOf(frame(CATALOGUE, 9, 20))).toBe("outline");
  });

  it("where none fits, the one that keeps the most nodes", () => {
    const f = frame(CATALOGUE, 7, 20);
    expect(layoutOf(f)).toBe("outline");
    expect(notice(f)).toBeDefined();
  });

  it("a named layout is honoured at a budget it does not fit", () => {
    const f = frame(CATALOGUE, 4, 80, { treeLayout: "topDown" });
    expect(layoutOf(f)).toBe("topDown");
    expect(notice(f)).toBeDefined();
  });
});

describe("TR3 (C12 I57, I8): what does not fit is named, and the count is the layout's", () => {
  it("a `+N` row, toned warn, inside the declared height", () => {
    const f = frame(CATALOGUE, 4, 80, { treeLayout: "topDown" });
    expect(f).toHaveLength(4); // cells-ok — a row count
    expect(notice(f)).toMatch(/^\+5 more/u);
  });

  it("the same tree in the same box reports a different count under two layouts", () => {
    const td = notice(frame(CATALOGUE, 4, 80, { treeLayout: "topDown" }));
    const ol = notice(frame(CATALOGUE, 4, 80, { treeLayout: "outline" }));
    expect(td).toBeDefined();
    expect(ol).toBeDefined();
    expect(td).not.toBe(ol);
  });
});

describe("TR4 (C12 I57): the notice's row is spent before the choice", () => {
  it("the layout is not re-chosen once the row is taken", () => {
    // At 7 rows the top-down figure fits exactly and draws no notice; at 6 it
    // spends one on the notice and truncates **as a top-down figure**. A
    // re-choice here would switch to the left-to-right drawing, which fits 6.
    expect(notice(frame(CATALOGUE, 7, 40, { treeLayout: "topDown" }))).toBeUndefined();
    const short = frame(CATALOGUE, 6, 40, { treeLayout: "topDown" });
    expect(notice(short)).toBeDefined();
    expect(layoutOf(short)).toBe("topDown");
    // And `auto` at the same budget picks the left-to-right figure, which fits
    // whole — the row that says the first branch is a fit and not a fallback.
    expect(notice(frame(CATALOGUE, 6, 40))).toBeUndefined();
    expect(layoutOf(frame(CATALOGUE, 6, 40))).toBe("leftRight");
  });
});

/** Where a label sits in a top-down frame: its first column and its centre. */
function at(f: readonly string[], row: number, label: string): { from: number; centre: number } {
  const from = (f[row] ?? "").indexOf(label); // cells-ok — a column position
  expect(from, `${label} on row ${String(row)}`).toBeGreaterThanOrEqual(0);
  return { from, centre: from + Math.floor((label.length - 1) / 2) }; // cells-ok — a column position
}

describe("TR5 (C12 I57): truncation runs before placement", () => {
  it("a parent sits over the span of its **remaining** children", () => {
    // An asymmetric tree whose last subtree is dropped by the depth cut: if the
    // placement ran first, `root` would stay centred over a span that includes
    // it, and every count in the frame would still agree.
    const f = frame(CATALOGUE, 4, 80, { treeLayout: "topDown" });
    const root = at(f, 0, "root");
    const first = at(f, 2, "render");
    const last = at(f, 2, "parse");
    expect(root.centre).toBe(Math.floor((first.centre + last.centre) / 2));
  });
});

describe("TR6 (C12 I57): the fan, and a fan of one is not a bar", () => {
  it("a fan of N resolves through the join table", () => {
    const f = frame(CATALOGUE, 7, 40, { treeLayout: "topDown" });
    expect(f[1]).toMatch(/[╭┌].*┴.*┬.*[╮┐]/u);
  });

  it("a fan of one is a single vertical and no horizontal run", () => {
    const f = frame({ label: "root", children: [{ label: "only" }] }, 3, 30, { treeLayout: "topDown" });
    expect(f[1]!.trim()).toBe("│");
  });
});

describe("TR7 (C12 I57, I9): the ASCII arm keeps the grid and loses the alphabet", () => {
  it("`+ - |` and no box-drawing codepoint, in the same cells", () => {
    const uni = frame(CATALOGUE, 7, 40, { treeLayout: "topDown" });
    const ascii = frame(CATALOGUE, 7, 40, { treeLayout: "topDown" }, { unicode: "ascii" });
    expect(ascii.map((r) => r.length)).toEqual(uni.map((r) => r.length)); // cells-ok — a cell count
    expect(ascii.join("")).not.toMatch(/[─-╿]/u);
    expect(ascii[1]).toMatch(/^\s*\+-+\+/u);
  });

  it("the outline's indent is four cells in both alphabets", () => {
    const uni = frame(CATALOGUE, 9, 40, { treeLayout: "outline" });
    const ascii = frame(CATALOGUE, 9, 40, { treeLayout: "outline" }, { unicode: "ascii" });
    expect(uni[2]!.indexOf("curve")).toBe(8); // cells-ok — a column position
    expect(ascii[2]!.indexOf("curve")).toBe(8); // cells-ok — a column position
  });
});

describe("TR8 (C12 I57, §3ah.7): a single node, and the walk's ruling was wrong", () => {
  const solo: HierarchyNode = { label: "solo" };

  it("one name, no edge, no notice, in all three", () => {
    for (const layout of TREE_LAYOUTS) {
      const f = frame(solo, 3, 30, { treeLayout: layout });
      expect(notice(f), layout).toBeUndefined();
      expect(f.join("").trim(), layout).toBe("solo");
    }
  });

  it("and the three do **not** agree — one is centred and two are not", () => {
    const centred = frame(solo, 3, 30, { treeLayout: "topDown" })[0]!;
    expect(centred.startsWith(" ")).toBe(true);
    for (const layout of ["leftRight", "outline"] as const) {
      expect(frame(solo, 3, 30, { treeLayout: layout })[0], layout).toBe("solo");
    }
  });
});

describe("TR9 (C12 I57, C04 I64): `value` is ignored, and the name is what to use", () => {
  it("two trees differing only in `value` are byte-identical", () => {
    const weighted: HierarchyNode = {
      label: "root", value: 100,
      children: [{ label: "gc", value: 90 }, { label: "io", value: 1 }],
    };
    const flat: HierarchyNode = { label: "root", children: [{ label: "gc" }, { label: "io" }] };
    expect(frame(weighted, 3, 30)).toEqual(frame(flat, 3, 30));
  });

  it("and putting it in the name does change the frame, which is the workaround", () => {
    const named: HierarchyNode = { label: "root", children: [{ label: "gc (2.1s)" }, { label: "io" }] };
    const plainTree: HierarchyNode = { label: "root", children: [{ label: "gc" }, { label: "io" }] };
    expect(frame(named, 3, 30)).not.toEqual(frame(plainTree, 3, 30));
    expect(frame(named, 3, 30).join("")).toContain("gc (2.1s)");
  });
});

describe("TR10 (C12 I57): every node named once, every parent over its own children", () => {
  it("nine names, no repeat, and each parent on its children's midpoint", () => {
    const f = frame(CATALOGUE, 7, 40, { treeLayout: "topDown" });
    const text = f.join(" ");
    for (const name of ["root", "render", "layout", "parse", "curve", "paint", "measure", "wrap", "raster"]) {
      expect(text.split(name).length - 1, name).toBe(1); // cells-ok — an occurrence count
    }
    // **Asymmetric on purpose**: `render`'s children are `curve` (which is
    // itself a parent) and `paint`, so its midpoint and its first child's column
    // differ — a frame satisfying one placement does not satisfy the other.
    for (const [parent, row, kids] of [["root", 0, ["render", "parse"]], ["render", 2, ["curve", "paint"]], ["layout", 2, ["measure", "wrap"]]] as const) {
      const p = at(f, row, parent);
      const first = at(f, row + 2, kids[0]!);
      const last = at(f, row + 2, kids[1]!);
      expect(p.centre, parent).toBe(Math.floor((first.centre + last.centre) / 2));
    }
  });
});

describe("TR11 (C12 I57, §3n): a wide codepoint is measured with `cells()`", () => {
  const cjk: HierarchyNode = {
    label: "根", children: [{ label: "描画", children: [{ label: "raster" }] }, { label: "解析" }],
  };

  /** The **cell** a label starts at, which `indexOf` is not for a wide glyph. */
  const columnOf = (row: string, label: string): number =>
    cells(row.slice(0, row.indexOf(label)), "narrow"); // cells-ok — a column position

  it("the outline's names start four cells per level in, counted as cells", () => {
    const f = frame(cjk, 4, 40, { treeLayout: "outline" });
    // `│   ╰── raster` — two levels of indent is eight **cells**, and 描画's two
    // codepoints occupy four of them one row above.
    expect(columnOf(f[2]!, "raster")).toBe(8); // cells-ok — a column position
    expect(columnOf(f[1]!, "描画")).toBe(4); // cells-ok — a column position
  });

  it("the left-to-right columns are cell widths, not codepoint counts", () => {
    // 根 is two cells and 描画 is four, so `raster` starts at 2 + 2 + 4 + 2 = 10.
    // Counting codepoints gives 7, and `indexOf` gives 7 either way — which is
    // why this row measures cells and the first form of it did not.
    const f = frame(cjk, 3, 40, { treeLayout: "leftRight" });
    expect(columnOf(f[0]!, "raster")).toBe(10); // cells-ok — a column position
  });

  it("no row exceeds the width it was given", () => {
    for (const layout of TREE_LAYOUTS) {
      for (const r of frame(cjk, 5, 20, { treeLayout: layout })) {
        expect(r.length, `${layout}: ${r}`).toBeLessThanOrEqual(20); // cells-ok — a cell count
      }
    }
  });
});

describe("TR13 (C12 I57): a glyph that claims *last* is read from the real tree", () => {
  it("a node whose later siblings were dropped still draws a branch", () => {
    // **Found by reading the overflow frame.** Computed over the kept set it
    // drew `╰── render` on a root whose `layout` and `parse` were named in the
    // notice one row below, so the glyph and the notice contradicted each other.
    // The other two layouts have no such glyph — an absent fan claims nothing.
    const f = frame(CATALOGUE, 6, 40, { treeLayout: "outline" });
    expect(f[1]).toMatch(/^├── render/u);
    expect(f[4]).toMatch(/^│   ╰── paint/u);
    expect(notice(f)).toContain("layout");
  });

  it("and the claim is true where it is made — the last child keeps its elbow", () => {
    const f = frame(CATALOGUE, 9, 40, { treeLayout: "outline" });
    expect(f[8]).toMatch(/^╰── parse/u);
    expect(f[1]).toMatch(/^├── render/u);
  });

  it("invisible at ascii, where both forms substitute to `+`", () => {
    // The arm the defect could not be found on, stated so the row's reach is
    // recorded rather than assumed: `glyphForMask`'s ASCII table maps `├` and
    // `╰` to the same `+`, so no frame there could have shown it.
    const f = frame(CATALOGUE, 6, 40, { treeLayout: "outline" }, { unicode: "ascii" });
    expect(f[1]).toMatch(/^\+-- render/u);
  });
});

describe("TR12 (C04 I65): the member's gates, and the values agree with the code", () => {
  const errs = (form: string, extra: object): readonly string[] => {
    const r = validateDocument({
      version: 1,
      blocks: [{ kind: "plot", id: "tr", form, height: 5, series: [], ...extra }],
    });
    return r.ok ? [] : r.error.filter((m) => /treeLayout|hierarchy/u.test(m));
  };
  const thrown = (form: PlotForm, extra: object): string => {
    try {
      b.plot({ id: "tr", form, height: 5, series: [], ...extra } as never);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const tree = { hierarchy: CATALOGUE };

  it("`treeLayout` is refused on every other form, at both gates", () => {
    const others = ALL_FORMS.filter((f) => f !== "tree");
    expect(others).toHaveLength(45); // cells-ok — a form count
    for (const form of others) {
      const extra = HIERARCHY_ROLE[form] === null ? { treeLayout: "outline" } : { treeLayout: "outline", ...tree };
      expect(errs(form, extra).some((m) => /treeLayout/u.test(m)), form).toBe(true);
      expect(thrown(form, extra), form).toMatch(/treeLayout/u);
    }
  });

  it("and accepted on the one that has more than one layout", () => {
    for (const treeLayout of ["auto", ...TREE_LAYOUTS]) {
      expect(errs("tree", { ...tree, treeLayout }), treeLayout).toEqual([]);
      expect(thrown("tree", { ...tree, treeLayout }), treeLayout).toBe("");
    }
    expect(errs("tree", { ...tree, treeLayout: "radial" })[0]).toMatch(/must be "auto"/u);
  });

  it("`hierarchy` is required on the form with nothing to fall back to", () => {
    expect(errs("tree", {})[0]).toMatch(/draws a tree and nothing else/u);
    expect(thrown("tree", {})).toMatch(/draws a tree and nothing else/u);
    // The three magnitude forms have something: two fall back to their series
    // and the third draws its empty message.
    for (const form of ["flame", "icicle", "treemap"] as const) expect(errs(form, {}), form).toEqual([]);
  });

  it("the renderer is total on the third path, where no gate ran", () => {
    // C12 I2 — a fixture reaches the renderer without passing either gate, so an
    // absent hierarchy draws the empty message at the declared height rather
    // than throwing.
    const kit = measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });
    const rows = kit.renderToLines(
      { kind: "plot", id: "tr", form: "tree", height: 5, series: [] } as never, 30,
    ).map(plain);
    expect(rows).toHaveLength(5); // cells-ok — a row count
    expect(rows.join("")).toContain("No data.");
  });

  it("`TREE_LAYOUTS` and the validator's literals are the same three", () => {
    // The record is in `tree.ts` (L1) and the check in `validate.ts` (L0), which
    // cannot import it — so they must agree and this asserts it rather than
    // deriving one from the other (`RUNG_FORMS`' argument, one member along).
    for (const layout of TREE_LAYOUTS) expect(errs("tree", { ...tree, treeLayout: layout })).toEqual([]);
    expect(TREE_LAYOUTS).toHaveLength(3); // cells-ok — a layout count
  });
});
