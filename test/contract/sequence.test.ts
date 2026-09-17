// C09 T2.18 / C04 I25 — `gapBefore` is applied by the sequence, never by the block.
//
// Nothing else in C04's vocabulary produces vertical space, and every surface in
// the S-series draws it. The rule that keeps that from becoming a second height
// system: a block measures the same wherever it appears, and the arithmetic that
// differs between one block and a run of them lives in one function.
import { describe, expect, it } from "vitest";
import { block, sequenceHeight } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS, measurable } from "../support/render.js";

const line = (id: string, gap?: boolean): Block =>
  block(
    gap === true
      ? { kind: "raw", id, text: "one line", padding: { t: 1 } }
      : { kind: "raw", id, text: "one line" },
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

  it("T2.18b (C04 I25, C09 I80): a block's own height includes its padding, and that is the inversion 2a made", () => {
    // **This row asserted the opposite until phase 2a**, and the sentence it
    // rested on — *no measurer counts a gap* — was true of a field the sequence
    // owned. Padding is inside the block, so the two answers differ by exactly
    // the top edge.
    //
    // **The property it was written for survives and is stronger.** What C14's
    // cache needs is that a block measures the same *wherever it appears*, not
    // that spacing is invisible to `measure` — and now the key covers the
    // spacing too, where before it sat outside every key.
    const kit = measurable();

    expect(kit.measure(line("x", true), 60), "one row of content and one of padding").toBe(2);
    expect(kit.measure(line("x"), 60), "and the unpadded block is one").toBe(1);
    expect(
      kit.measure(line("x", true), 60),
      "the same block, measured in a panel, answers the same",
    ).toBe(kit.measure(line("x", true), 60));
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
    // **And a row group's child keeps its padding**, which is the frame
    // movement 2a named in advance (walk A4). `gapBefore` was meaningless side
    // by side and was ignored; space *inside* a box is not, so the padded child
    // is two rows and the row is as tall as its tallest child.
    expect(kit.measure(row, 60), "the padded child is two rows, and a row maxes").toBe(2);
    expect(kit.renderToLines(row, 60)).toHaveLength(2);

    // **A column whose children all measure zero is one row, and the case is
    // reachable rather than defensive** (C04 I17). *Every measurer returns at
    // least 1* has exactly one exception — an empty container, absence of
    // content rather than empty content — so a column holding nothing but empty
    // groups sums to zero and is floored to one. The empty group itself stays
    // zero: the floor belongs to the thing that has children.
    //
    // Nothing constructed this until the floor was mutated away and no row
    // noticed (C29 1.2). It read as unreachable because I17 is usually read
    // without its exception.
    const hollow = block({
      kind: "group",
      id: "g-hollow",
      direction: "column",
      children: [block({ kind: "group", id: "g-empty", direction: "column", children: [] })],
    });
    expect(kit.measure(hollow, 60), "zero summed, floored to one").toBe(1);
    expect(kit.renderToLines(hollow, 60), "and drawn, which it was not (F1223)").toHaveLength(1);

    // The row arm had the same gap: its height floored at `minRows` and at
    // nothing else, so the tallest of nothing was nothing.
    const hollowRow = block({
      kind: "group",
      id: "g-hollow-row",
      direction: "row",
      children: [block({ kind: "group", id: "g-empty-r", direction: "column", children: [] })],
    });
    expect(kit.measure(hollowRow, 60)).toBe(1);
    expect(kit.renderToLines(hollowRow, 60)).toHaveLength(1);
    expect(kit.measure(block({ kind: "group", id: "g-none", direction: "column", children: [] }), 60), "and the empty group is still zero").toBe(0);
  });

  it("T2.18f: the arithmetic is one function, shared by C04 and C09", () => {
    // `sequenceHeight` is C04's, like `childWidths`, so a composer in L4 cannot
    // arrive at a different answer than the registry does (C23 §2).
    const blocks = [line("a"), line("b", true), line("c", true)];
    const registry = createBlockRegistry({});

    // **`gapRows` is gone with the field.** A sequence's height is the sum of
    // its blocks and nothing else now (C04 I25), so there is no separate count
    // of rows the run contributes — the two padded blocks carry their own.
    expect(sequenceHeight(blocks, 60, registry.measure), "the two padded blocks carry their rows").toBe(
      registry.measure(line("a"), 60) + 2 * (registry.measure(line("a"), 60) + 1),
    );
    expect(sequenceHeight(blocks, 60, registry.measure)).toBe(
      registry.measureSequence(blocks, 60),
    );
  });

  it("T6.17 (C09 I80, C04 I25): counting the padding twice → a block measures differently in a panel", () => {
    // **The same failure, one layer over.** This row used to guard against a
    // `+1` moving *into* a kind's measurer, when the gap was the sequence's.
    // The registry counts the padding now, once, outside every definition — so
    // the revert it guards is a kind that reads `padding` itself, or a
    // container that adds the row again around a child that already drew it.
    // Both look right at a document's top level and double inside a panel,
    // exactly as the old one did.
    const kit = measurable();
    const padded = line("g", true);

    const inDocument = createBlockRegistry({}).measureSequence([padded], 60);
    const inPanel = kit.measure(
      block({ kind: "panel", id: "p2", title: "t", children: [padded] }),
      60,
    );

    expect(kit.measure(padded, 60), "one row of content and one of padding").toBe(2);
    expect(inDocument, "a sequence of it is those two rows and nothing added").toBe(2);
    expect(inPanel, "and the panel adds its border, not a second gap row").toBe(4);
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
