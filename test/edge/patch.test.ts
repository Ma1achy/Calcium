// C25 tier 3 — edge cases. The degenerate patches, and none of them throws.
import { describe, expect, it } from "vitest";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { hunkOf, patchOf } from "../support/blocks.js";
import { ASCII_CAPS, FULL_CAPS, measurable, visible } from "../support/render.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";

const kit = (caps = FULL_CAPS): ReturnType<typeof measurable> =>
  measurable({ definitions: [patchDefinition as unknown as BlockDefinition<never>], capabilities: caps });

const drawn = (block: Parameters<ReturnType<typeof measurable>["measure"]>[0], width = 80): readonly string[] =>
  kit().renderToLines(block, width).map(visible);

describe("C25 edge", () => {
  it("T3.1: zero hunks is the file header alone, one row, no throw", () => {
    // "Nothing changed" is a statement worth a row, and a zero-height block is one
    // C14 cannot scroll to.
    const patch = patchOf({ hunks: [] });
    expect(kit().measure(patch, 80)).toBe(1);
    expect(drawn(patch)[0]).toContain("serving/volatility-estimator.yaml");
  });

  it("T3.2: a hunk of only context lines measures normally and tones nothing ok or error", () => {
    const patch = patchOf({ hunks: [hunkOf([" a: 1", " b: 2"])] });
    expect(kit().measure(patch, 80)).toBe(4);
    // No marker glyph other than the blank one.
    const body = drawn(patch).filter((l) => /[ab]: \d/.test(l));
    for (const row of body) expect(row).not.toMatch(/[+-]\s/);
  });

  it("T3.3: a 10,000-character line truncates to one row and height is unchanged", () => {
    const long = patchOf({ id: "p-long", hunks: [hunkOf([`+key: ${"x".repeat(10_000)}`])] });
    const short = patchOf({ id: "p-short", hunks: [hunkOf(["+key: x"])] });

    expect(kit().measure(long, 80)).toBe(kit().measure(short, 80));
    expect(drawn(long)).toHaveLength(3);
  });

  it("T3.4: an unregistered language renders plain, no error, same height", () => {
    const known = patchOf({ id: "p-yaml", language: "yaml" });
    const unknown = patchOf({ id: "p-bf", language: "brainfuck" });

    expect(() => kit().renderToLines(unknown, 80)).not.toThrow();
    expect(kit().measure(unknown, 80)).toBe(kit().measure(known, 80));
  });

  it("T3.5: an empty language is the same as unregistered", () => {
    const empty = patchOf({ id: "p-empty", language: "" });
    expect(() => kit().renderToLines(empty, 80)).not.toThrow();
    expect(kit().measure(empty, 80)).toBe(kit().measure(patchOf({ id: "p-bf2", language: "nope" }), 80));
  });

  it("T3.6 (I2a): identical within a layout, and asserted within rather than across", () => {
    // Asserting equality across the breakpoint would assert the thing that is false.
    const patch = patchOf();
    expect(kit().measure(patch, 40)).toBe(kit().measure(patch, 80));
    expect(kit().measure(patch, 100)).toBe(kit().measure(patch, 200));
  });

  it("T3.6a (I2, I2a): a context-only patch measures the same at 40 and 200", () => {
    // **The case that would hide a wrap**, and the reason T2.2 uses a corpus. With
    // no changed lines there is nothing to pair, so the two layouts agree and the
    // step vanishes — a patch that wrapped would still differ, and this fixture
    // would not show it.
    const patch = patchOf({ hunks: [hunkOf([" a: 1", " b: 2", " c: 3"])] });
    expect(kit().measure(patch, 40)).toBe(kit().measure(patch, 200));
  });

  it("T3.7: a hunk header longer than the width truncates to one row", () => {
    const patch = patchOf({ hunks: [{ header: `@@ ${"z".repeat(500)} @@`, lines: [] }] });
    expect(kit().measure(patch, 40)).toBe(2);
    expect(drawn(patch, 40)).toHaveLength(2);
  });

  it("T3.8: collapsedBefore: 0 is absent — no marker row", () => {
    // A collapse of nothing is not a collapse, and a marker for it claims there is
    // hidden content to reveal.
    const zero = patchOf({ id: "p-zero", hunks: [hunkOf([" a", "+b"], { collapsedBefore: 0 })] });
    const none = patchOf({ id: "p-none", hunks: [hunkOf([" a", "+b"])] });

    expect(kit().measure(zero, 80)).toBe(kit().measure(none, 80));
    expect(drawn(zero).join("\n")).not.toContain("unchanged");
  });

  it("T3.9: a patch of only additions — a new file — measures exactly and both layouts agree", () => {
    const patch = patchOf({ hunks: [hunkOf(["+a: 1", "+b: 2", "+c: 3"])] });
    expect(kit().measure(patch, 80)).toBe(5);
    expect(kit().measure(patch, 160), "every run is one-sided, so nothing pairs").toBe(5);
  });

  it("T3.14: a lopsided run pads the short side and the separator stays put", () => {
    const patch = patchOf({ hunks: [hunkOf([" a: 1", "-b: 2", "-c: 3", "-d: 4", "+b: 9", " e: 5"])] });
    const rows = drawn(patch, 120).filter((l) => l.includes("│"));

    const columns = rows.map((l) => [...l].findIndex((c) => c === "│"));
    expect(new Set(columns).size, `the separator must land in one column: ${columns.join(",")}`).toBe(1);
  });

  it("T3.15: width 1 and width 2 render without throwing, and every row fits", () => {
    for (const width of [1, 2]) {
      const rows = drawn(patchOf(), width);
      for (const row of rows) expect(row.length, `width ${width}`).toBeLessThanOrEqual(width); // cells-ok
    }
  });

  it("T3.16 (§3): the ASCII collapse marker costs three cells and the row still fits", () => {
    // The one place a measurer would want capabilities, and it does not need them:
    // the row is one row either way, so what changes is the marker's content budget.
    const patch = patchOf({ hunks: [hunkOf([" a", "+b"], { collapsedBefore: 12 })] });
    for (const width of [8, 12, 40]) {
      for (const row of kit(ASCII_CAPS).renderToLines(patch, width).map(visible)) {
        expect(row.length, `ascii width ${width}`).toBeLessThanOrEqual(width); // cells-ok
      }
    }
  });
});
