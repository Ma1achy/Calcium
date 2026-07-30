// C25 tier 1 — unit. The arithmetic, the layout choice, and the gutter.
//
// **The two heights are the point of this file.** A patch's height is exact at
// every width and constant *within* a layout, stepping once at the breakpoint by
// exactly what pairing saves — which is I2a, and I2a exists because the original
// I2 claimed width-independence outright and could not hold beside §3's split
// pairing. Every measurement test here names which side of the breakpoint it is on.
import { describe, expect, it } from "vitest";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { layoutFor, pairedRows, SPLIT_AT } from "../../src/presentation/patch/height.js";
import { hunkOf, patchOf, THE_ILLUSTRATION } from "../support/blocks.js";
import { ASCII_CAPS, FULL_CAPS, measurable, visible } from "../support/render.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Block, Patch } from "../../src/data/viewmodel/index.js";

const NARROW = 80;
const WIDE = 160;

function kit(caps = FULL_CAPS): ReturnType<typeof measurable> {
  return measurable({
    capabilities: caps,
    definitions: [patchDefinition as unknown as BlockDefinition<never>],
  });
}

const measure = (block: Block, width: number): number => kit().measure(block, width);
const lines = (block: Block, width: number, caps = FULL_CAPS): readonly string[] =>
  kit(caps).renderToLines(block, width);

describe("C25 unit — height", () => {
  it("T1.1: a single-hunk patch measures 1 + 1 + lines.length at a unified width", () => {
    // The illustration: eight lines, one hunk header, one path header, one collapse
    // marker. Eleven, which is what C25 §2's figure draws.
    const patch = patchOf({ hunks: [THE_ILLUSTRATION] });
    expect(measure(patch, NARROW)).toBe(11);
  });

  it("T1.1a (I2a): the same patch at a split width measures max(removes, adds) per run", () => {
    // **The assertion that needs a lopsided run to mean anything.** One removed
    // line and two added ones are three rows unified and two split. A hunk whose
    // runs are all one-sided passes either arithmetic, which is why the fixture is
    // the illustration rather than a tidier one.
    const patch = patchOf({ hunks: [THE_ILLUSTRATION] });

    expect(measure(patch, NARROW), "unified: eight lines").toBe(11);
    expect(measure(patch, WIDE), "split: the run of three pairs to two").toBe(10);
  });

  it("T1.1b (I2a): pairedRows walks runs, not the whole hunk", () => {
    // Three removes and one add in one run is three rows; the same four lines split
    // by a context line are two runs and four rows. The distinction is what makes
    // the walk a walk rather than a subtraction.
    const oneRun = hunkOf(["-a", "-b", "-c", "+d"]);
    const twoRuns = hunkOf(["-a", "-b", " x", "-c", "+d"]);

    expect(pairedRows(oneRun.lines), "max(3, 1)").toBe(3);
    expect(pairedRows(twoRuns.lines), "max(2,0) + 1 + max(1,1)").toBe(4);
  });

  it("T1.2: three hunks measure the sum across hunks plus one file header", () => {
    const patch = patchOf({
      hunks: [hunkOf([" a", "-b", "+c"]), hunkOf([" d", "+e"]), hunkOf([" f", "-g"])],
    });

    // 1 header + (1 + 3) + (1 + 2) + (1 + 2)
    expect(measure(patch, NARROW)).toBe(11);
  });

  it("T1.3 (I5): collapsedBefore adds one row, and the marker states the count", () => {
    const without = patchOf({ hunks: [hunkOf([" a", "+b"])] });
    const with12 = patchOf({ hunks: [hunkOf([" a", "+b"], { collapsedBefore: 12 })] });

    expect(measure(with12, NARROW) - measure(without, NARROW)).toBe(1);
    expect(lines(with12, NARROW).map(visible).join("\n")).toContain("12 unchanged lines");
  });

  it("T1.4 (I5): collapsedBefore: 1 is one row, and reads in the singular", () => {
    // A collapse of one is not expanded silently — the row is what says there is
    // something hidden, and its count is what says whether opening it is worth it.
    const patch = patchOf({ hunks: [hunkOf([" a", "+b"], { collapsedBefore: 1 })] });

    // 1 path header + 1 hunk header + 2 lines + 1 collapse marker.
    expect(measure(patch, NARROW)).toBe(5);
    expect(lines(patch, NARROW).map(visible).join("\n")).toContain("1 unchanged line");
  });

  it("T1.3a (I5, C04 §3): `collapsedAfter` is one row below everything", () => {
    // The region `collapsedBefore` structurally cannot reach. On `Patch` rather than
    // `Hunk` so the gap between two hunks belongs to exactly one field — see C04 §3.
    const without = patchOf({ id: "p-no-tail", hunks: [hunkOf([" a", "+b"])] });
    const withTail = patchOf({ id: "p-tail", hunks: [hunkOf([" a", "+b"])], collapsedAfter: 170 });

    expect(measure(withTail, NARROW) - measure(without, NARROW)).toBe(1);

    const drawn = lines(withTail, NARROW).map(visible);
    expect(drawn[drawn.length - 1], "and it is the last row").toContain("170 unchanged lines");
  });

  it("T1.3b (I5): a file with no hunks and a tail is a header and a marker", () => {
    // Two rows, and a legitimate shape: it says the file is unchanged and states how
    // much of it there is. A zero-height block is one C14 cannot scroll to.
    const patch = patchOf({ id: "p-unchanged", hunks: [], collapsedAfter: 200 });

    expect(measure(patch, NARROW)).toBe(2);
    expect(lines(patch, NARROW).map(visible).join("\n")).toContain("200 unchanged lines");
  });

  it("T1.3c (I5): `collapsedAfter: 0` is absent, exactly as `collapsedBefore: 0` is", () => {
    const zero = patchOf({ id: "p-tail0", hunks: [hunkOf([" a", "+b"])], collapsedAfter: 0 });
    const none = patchOf({ id: "p-tailnone", hunks: [hunkOf([" a", "+b"])] });

    expect(measure(zero, NARROW)).toBe(measure(none, NARROW));
    expect(lines(zero, NARROW).map(visible).join("\n")).not.toContain("unchanged");
  });

  it("T1.3d (§2): the illustration, both ends elided, is twelve rows", () => {
    // §2's figure as data: one path header, one leading marker, one hunk header,
    // eight lines, one trailing marker. The figure and the formula, checked against
    // each other rather than each against itself.
    const figure = patchOf({ id: "figure", hunks: [THE_ILLUSTRATION], collapsedAfter: 170 });

    expect(measure(figure, NARROW)).toBe(12);
    const drawn = lines(figure, NARROW).map(visible);
    expect(drawn[1], "14 above").toContain("14 unchanged lines");
    expect(drawn[drawn.length - 1], "170 below").toContain("170 unchanged lines");
  });

  it("T1.5: the layout threshold at 99, 100 and 101", () => {
    const patch = patchOf();
    expect(layoutFor(patch as Patch, SPLIT_AT - 1)).toBe("unified");
    expect(layoutFor(patch as Patch, SPLIT_AT)).toBe("split");
    expect(layoutFor(patch as Patch, SPLIT_AT + 1)).toBe("split");
  });

  it("T1.6: an explicit layout wins at any width", () => {
    expect(layoutFor(patchOf({ layout: "unified" }) as Patch, 200)).toBe("unified");
    expect(layoutFor(patchOf({ layout: "split" }) as Patch, 40)).toBe("split");
  });
});

describe("C25 unit — the gutter", () => {
  it("T1.7 (I4): every add renders `+` and every remove `-`, at all four depths", () => {
    // D29 at the source. The marker is not decoration: at 1-bit all colour is gone
    // and a diff is still a diff, so the glyph carries the distinction and the tone
    // reinforces it.
    for (const depth of [24, 8, 4, 1] as const) {
      const drawn = measurable({
        capabilities: { ...FULL_CAPS, colourDepth: depth },
        definitions: [patchDefinition as unknown as BlockDefinition<never>],
      })
        .renderToLines(patchOf({ hunks: [hunkOf(["-old: 1", "+new: 2"])] }), NARROW)
        .map(visible);

      expect(drawn.some((l) => l.includes("- old: 1") || / - .*old/.test(l)), `depth ${depth}: -`).toBe(
        true,
      );
      expect(drawn.some((l) => l.includes("+ new: 2") || / \+ .*new/.test(l)), `depth ${depth}: +`).toBe(
        true,
      );
    }
  });

  it("T1.8: a line missing oldNo renders a blank column, not a shifted gutter", () => {
    // The whole reason there are two number columns. A single column forces a
    // choice on every changed line and loses the correspondence; a *shifted* gutter
    // loses the alignment, which is worse because it looks like data.
    const drawn = lines(patchOf({ hunks: [hunkOf([" a: 1", "-b: 2", "+b: 3"])] }), NARROW).map(visible);
    const body = drawn.filter((l) => /a: 1|b: 2|b: 3/.test(l));

    expect(body).toHaveLength(3);
    const textAt = body.map((l) => l.search(/[ab]: \d/));
    expect(new Set(textAt).size, `the text column must start in one place: ${textAt.join(",")}`).toBe(1);
  });

  it("T1.9: the number columns are sized from the widest number in the patch", () => {
    const narrowNumbers = patchOf({ hunks: [hunkOf([" a", "+b"], { oldStart: 8, newStart: 8 })] });
    const wideNumbers = patchOf({ hunks: [hunkOf([" a", "+b"], { oldStart: 99_998, newStart: 99_999 })] });

    const at = (block: Block): number =>
      lines(block, NARROW).map(visible).filter((l) => /\ba\b/.test(l))[0]?.search(/a$/) ?? -1;

    expect(at(wideNumbers)).toBeGreaterThan(at(narrowNumbers));
  });

  it("T1.10 (I5, §3): the ASCII collapse marker is `...` and the row count is unchanged", () => {
    // §3's deliberate exception to C09's 1:1 substitution rule. `⋯` is one cell and
    // `...` is three, so what changes is the marker's content budget rather than the
    // glyph — and the row is one row either way, which is what keeps C09 I1 true.
    const patch = patchOf({ hunks: [hunkOf([" a", "+b"], { collapsedBefore: 7 })] });

    const unicode = lines(patch, NARROW).map(visible).join("\n");
    const ascii = lines(patch, NARROW, ASCII_CAPS).map(visible).join("\n");

    expect(unicode).toContain("⋯ 7 unchanged lines");
    expect(ascii).toContain("... 7 unchanged lines");
    expect(ascii).not.toContain("⋯");
    expect(lines(patch, NARROW, ASCII_CAPS)).toHaveLength(lines(patch, NARROW).length); // cells-ok
  });
});
