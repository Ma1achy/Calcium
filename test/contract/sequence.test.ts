// C09 T2.18 / C04 I25 — `gapBefore` is applied by the sequence, never by the block.
//
// Nothing else in C04's vocabulary produces vertical space, and every surface in
// the S-series draws it. The rule that keeps that from becoming a second height
// system: a block measures the same wherever it appears, and the arithmetic that
// differs between one block and a run of them lives in one function.
import { describe, expect, it } from "vitest";
import { block, sequenceHeight, gapRows } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS, measurable } from "../support/render.js";

const line = (id: string, gapBefore?: boolean): Block =>
  block(
    gapBefore === undefined
      ? { kind: "raw", id, text: "one line" }
      : { kind: "raw", id, text: "one line", gapBefore },
  );

function rowsOf(blocks: readonly Block[], width = 60): readonly string[] {
  const registry = createBlockRegistry({});
  return renderSequenceToLines(registry, blocks, width, {
    theme: DARK_THEME,
    capabilities: FULL_CAPS,
  });
}

describe("C09 T2.18 — sequences", () => {
  it("T2.18: a sequence measures Σ heights plus one row per gapBefore, and renders exactly that", () => {
    const blocks = [line("a"), line("b", true), line("c"), line("d", true)];
    const registry = createBlockRegistry({});

    expect(registry.measureSequence(blocks, 60), "four blocks, two gaps").toBe(6);
    expect(rowsOf(blocks)).toHaveLength(6);
  });

  it("T2.18b (C04 I25): no block's own height includes its gap", () => {
    // The property that keeps C14's cache keyed on the block and the width
    // alone: the same block measures the same with the field set and unset.
    const kit = measurable();

    expect(kit.measure(line("x", true), 60)).toBe(kit.measure(line("x"), 60));
    expect(kit.measure(line("x", true), 60)).toBe(1);
  });

  it("T2.18c: the first block's gap is a leading blank row, not a special case", () => {
    // Dropping it would make the field mean two things depending on position,
    // and a document assembled by concatenating two others would render
    // differently from either.
    const blocks = [line("a", true), line("b")];

    expect(createBlockRegistry({}).measureSequence(blocks, 60)).toBe(3);
    expect(rowsOf(blocks)).toHaveLength(3);
    expect(rowsOf(blocks)[0]?.trim(), "and the leading row is blank").toBe("");
  });

  it("T2.18d: concatenating two sequences measures the sum of their heights", () => {
    const first = [line("a"), line("b", true)];
    const second = [line("c", true), line("d")];
    const registry = createBlockRegistry({});

    expect(registry.measureSequence([...first, ...second], 60)).toBe(
      registry.measureSequence(first, 60) + registry.measureSequence(second, 60),
    );
  });

  it("T2.18e: a panel's children are a sequence; a row group's are not", () => {
    const kit = measurable();

    const panel = block({
      kind: "panel",
      id: "p",
      title: "t",
      children: [line("p-a"), line("p-b", true)],
    });
    expect(kit.measure(panel, 60), "two children, one gap, two border rows").toBe(5);
    expect(kit.renderToLines(panel, 60)).toHaveLength(5);

    const column = block({
      kind: "group",
      id: "g-col",
      direction: "column",
      children: [line("c-a"), line("c-b", true)],
    });
    expect(kit.measure(column, 60)).toBe(3);
    expect(kit.renderToLines(column, 60)).toHaveLength(3);

    // Children side by side have no "before" to put a gap in. Ignored rather
    // than an error: a document moved from a column group to a row group should
    // change layout, not fail validation.
    const row = block({
      kind: "group",
      id: "g-row",
      direction: "row",
      children: [line("r-a"), line("r-b", true)],
    });
    expect(kit.measure(row, 60), "max of one and one, and no gap").toBe(1);
    expect(kit.renderToLines(row, 60)).toHaveLength(1);
  });

  it("T2.18f: the arithmetic is one function, shared by C04 and C09", () => {
    // `sequenceHeight` is C04's, like `childWidths`, so a composer in L4 cannot
    // arrive at a different answer than the registry does (C23 §2).
    const blocks = [line("a"), line("b", true), line("c", true)];
    const registry = createBlockRegistry({});

    expect(gapRows(blocks)).toBe(2);
    expect(sequenceHeight(blocks, 60, registry.measure)).toBe(
      registry.measureSequence(blocks, 60),
    );
  });

  it("T6.17 (I15): counting the gap inside measure → a block measures differently in a panel", () => {
    // The revert this guards: `+1` moved into a kind's measurer. It looks right
    // at a document's top level and doubles inside a panel, because the panel
    // would add the gap again — and it breaks the cache key silently.
    const kit = measurable();
    const gapped = line("g", true);

    const inDocument = createBlockRegistry({}).measureSequence([gapped], 60);
    const inPanel = kit.measure(
      block({ kind: "panel", id: "p2", title: "t", children: [gapped] }),
      60,
    );

    expect(inDocument, "one row of content, one of gap").toBe(2);
    expect(inPanel, "the same two rows, plus the border").toBe(4);
    expect(kit.measure(gapped, 60), "and the block itself is one row, always").toBe(1);
  });
});

describe("C04 §3 — a row group's vertical alignment", () => {
  // **`Group.align` shipped with a renderer and no test, and roadmap 38 said it
  // did not exist at all.** Two records wrong about one published field in
  // opposite directions, found from the satisfier's side rather than by anything
  // watching. The row is a frame read, because `align` changes no measurement:
  // a group is as tall as its tallest child either way, so every arithmetic
  // assertion agrees with every implementation including one that ignores the
  // field.
  const registry = createBlockRegistry({ defaults: true });

  const frame = (align: readonly ("top" | "middle" | "bottom")[]): readonly string[] =>
    renderSequenceToLines(
      registry,
      [
        block({
          kind: "group",
          id: "g",
          direction: "row",
          align,
          children: [
            block({ kind: "raw", id: "tall", text: "1\n2\n3" }),
            block({ kind: "raw", id: "short", text: "x" }),
          ],
        }) as Block,
      ],
      20,
      { theme: DARK_THEME, capabilities: FULL_CAPS, focus: null },
    ).map((l) => l.replace(/\u001b\[[0-9;]*m/gu, "").trimEnd());

  it("T3.22 (C04 I44): the short child sits where `align` puts it", () => {
    // Three positions, and the middle one is why this needs three rows rather
    // than two: an implementation that treated `middle` as `top` passes a
    // two-row test asserting only the ends.
    // Internal runs collapse, because a row group divides the width and the
    // second child starts at its own column — the gap is `groupChildWidths`'
    // arithmetic and is asserted by T3.16–T3.19. What this row is about is
    // which *line* the short child lands on.
    const shape = (align: readonly ("top" | "middle" | "bottom")[]): readonly string[] =>
      frame(align).map((l) => l.trim().replace(/\s+/gu, " "));

    expect(shape(["top", "top"])).toEqual(["1 x", "2", "3"]);
    expect(shape(["top", "middle"])).toEqual(["1", "2 x", "3"]);
    expect(shape(["top", "bottom"])).toEqual(["1", "2", "3 x"]);
  });
});
