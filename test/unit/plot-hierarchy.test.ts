/**
 * TM1–TM4 — a containment form names what it contains (C12 I55, §3n · F217).
 *
 * **The frame is the assertion and no count can replace it.** §3n has said *a
 * label is written inside where it fits* since the section was written, and the
 * treemap satisfied every arithmetic row in the suite while drawing twelve rows
 * of pattern with no word in them. What was missing was not a number.
 *
 * **The tile fixture is shown to respond before it is asserted against.** Every
 * row below that expects a name also has a partner expecting its absence, from
 * the same tree at a width that cannot hold it — a renderer that wrote names
 * unconditionally would pass the first half of each pair.
 */
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { ASCII_CAPS, FULL_CAPS, MONO_CAPS, measurable } from "../support/render.js";
import { block, type HierarchyNode, type Plot } from "../../src/data/viewmodel/index.js";
import { cells } from "../../src/presentation/text.js";

/** The tree the catalogue draws, so a reader can compare the two. */
const TREE: HierarchyNode = {
  label: "root", value: 100,
  children: [
    { label: "render", value: 46, children: [
      { label: "curve", value: 21, children: [{ label: "raster", value: 12 }] },
      { label: "paint", value: 17 },
    ] },
    { label: "layout", value: 31, children: [
      { label: "measure", value: 18 }, { label: "wrap", value: 9 },
    ] },
    { label: "parse", value: 23 },
  ],
};

const draw = (
  spec: Record<string, unknown>,
  w = 80,
  caps = FULL_CAPS,
): readonly string[] =>
  measurable({ definitions: [plotDefinition], capabilities: caps })
    .renderToLines(
      block({ kind: "plot", id: "tm", form: "treemap", height: 12, series: [], ...spec } as unknown as Plot),
      w,
    )
    .map((r) => r.replace(/\x1b\[[0-9;]*m/gu, ""));

const text = (rows: readonly string[]): string => rows.join("\n");

/** Every leaf of `TREE`, which is what today's padding leaves room for. */
const LEAVES = ["raster", "paint", "measure", "wrap", "parse"] as const;

describe("TM — the treemap names its tiles", () => {
  it("TM1 (C12 I55): every leaf with a run wide enough is named, at 80 columns", () => {
    const frame = text(draw({ hierarchy: TREE }));
    for (const leaf of LEAVES) expect(frame, leaf).toContain(leaf);
  });

  it("TM2 (C12 I55): the names survive ascii and one bit, which is where nothing else does", () => {
    // **The two capabilities the finding was about.** At 24-bit the tiles are
    // told apart by colour; here they are told apart by a fill pattern that says
    // nothing, so the name is the entire content of the frame.
    for (const caps of [ASCII_CAPS, MONO_CAPS] as const) {
      const frame = text(draw({ hierarchy: TREE }, 80, caps));
      for (const leaf of LEAVES) expect(frame, leaf).toContain(leaf);
    }
  });

  it("TM2b (C12 I54): naming the tiles introduces no codepoint the terminal cannot draw", () => {
    for (const ch of text(draw({ hierarchy: TREE }, 80, ASCII_CAPS))) {
      expect(ch.codePointAt(0) ?? 0, ch).toBeLessThan(128);
    }
  });

  it("TM3 (C12 I55): an interior node covered by its children is not named, and says nothing about it", () => {
    // **`render` and `layout` own one cell either side of their children**, so
    // no run holds their name — measured, not assumed. The second half is the
    // row: §3n first said *dropped and counted*, and §3ag A4 struck it, because
    // C12 I8 governs a series given no row and a tile keeps its extent either way.
    const frame = text(draw({ hierarchy: TREE }));
    // **The positive half first, in this row rather than only in TM1.** Three
    // absence assertions pass on a renderer that names nothing at all, which is
    // the shape they have to be stopped from having.
    expect(frame).toContain("raster");
    expect(frame).not.toContain("render");
    expect(frame).not.toContain("layout");
    expect(frame).not.toContain("+1");
    expect(frame).not.toContain("more");
  });

  it("TM5 (C12 I55, SS23): a name carrying a wide codepoint leaves the row exactly as wide", () => {
    // **The survivor that asked for this row.** Removing the continuation cell
    // killed nothing, because every label in every fixture was narrow — so the
    // rule *a two-cell character consumes two cells* was true of nothing the
    // suite drew. `cells()` and not `.length`, which is the same distinction
    // one layer down.
    const wide: HierarchyNode = {
      label: "root", value: 100,
      children: [
        { label: "図表テスト", value: 60 },
        { label: "plain", value: 40 },
      ],
    };
    const rows = draw({ hierarchy: wide }, 60);
    // The fixture responds: the name is drawn at all before its width is asserted.
    expect(text(rows)).toContain("図表テスト");
    for (const row of rows) expect(cells(row, "narrow"), row).toBe(60);
  });

  it("TM4 (C12 I55): a width too narrow for any name draws the tiles and none of them", () => {
    // The fixture responds: the same tree at 80 names five leaves.
    const narrow = text(draw({ hierarchy: TREE }, 12));
    for (const leaf of LEAVES) expect(narrow, leaf).not.toContain(leaf);
    expect(narrow.replace(/[\s\n]/gu, "")).not.toBe("");
  });
});
