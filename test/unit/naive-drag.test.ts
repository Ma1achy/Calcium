// C09 §7b — `R-SEL-002`'s gutter clause, over the whole registry.
//
// **Stated over columns rather than over tokens**, which is what makes it one
// sentence for every kind: the gutter is `notice`'s word for the hazard and the
// hazard is a bordered block's `│`, a table's rule and a residue mark equally.
// A kind joins by being in the registry.
import { describe, expect, it } from "vitest";

import { CORPUS } from "../support/blocks.js";
import { measurable, visible } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";

/** The first column a row occupies, or `null` for a row that draws nothing. */
const firstColumn = (line: string): number | null => {
  const text = visible(line);
  const i = text.search(/\S/u);
  return i === -1 ? null : i;
};

/**
 * The offending `(row, column)` of a block's render, or `null` when it is clean.
 *
 * **The reference is the head, and taking the minimum instead is a tautology** —
 * nothing can be left of the minimum over the same rows, so the check would be
 * green against every input including the defect. The control below is what
 * found that, which is the whole reason it is written before the corpus (A03 §2).
 *
 * The head is the block's **first drawn row**, so a kind opening with padding is
 * measured against the row that establishes its gutter rather than against a
 * blank.
 */
const drawsLeftOfItself = (
  lines: readonly string[],
): Readonly<{ row: number; column: number; line: string }> | null => {
  const firsts = lines.map(firstColumn);
  const head = firsts.find((c): c is number => c !== null);
  if (head === undefined) return null;
  for (const [row, first] of firsts.entries()) {
    if (first === null || first >= head) continue;
    return { row, column: first, line: visible(lines[row] ?? "") };
  }
  return null;
};

describe("C09 §7b — surviving a naive drag", () => {
  it("T2.154 (C09 I87): nothing is drawn left of a block's first column, on any row", () => {
    const kit = measurable();

    // **The control first, and it is a fabricated violation.** A notice whose
    // continuation rows carry a mark one column left of the head is exactly the
    // defect `R-SEL-002` names, and if the checker cannot see it here then a
    // green run below is the corpus agreeing with nothing.
    const fabricated = ["  ⎿ a wrapped line", " ⋯ the continuation"];
    const seen = drawsLeftOfItself(fabricated);
    expect(seen, "the check can see a mark in the gutter").not.toBeNull();
    expect([seen?.row, seen?.column]).toEqual([1, 1]);
    expect(drawsLeftOfItself(["  ⎿ a wrapped line", "    the continuation"])).toBeNull();

    // And the rail, which needs no carve-out: `quote` draws on every row **at**
    // the head's own column. If this ever needed an exception the property
    // would be the wrong one (C09 I41).
    const quoted: Block = block({
      kind: "notice",
      id: "q",
      tone: "muted",
      glyph: "quote",
      text: "a quotation long enough to wrap more than once at a narrow width",
    });
    expect(drawsLeftOfItself(kit.renderToLines(quoted, 24)), "a rail is not a violation").toBeNull();

    // The corpus, at the widths where wrapping actually happens.
    for (const b of CORPUS) {
      for (const width of [13, 24, 40, 80]) {
        const found = drawsLeftOfItself(kit.renderToLines(b, width));
        expect(
          found,
          `${b.kind} at width ${String(width)}: row ${String(found?.row)} begins at column ` +
            `${String(found?.column)} — "${found?.line ?? ""}"`,
        ).toBeNull();
      }
    }
  });
});

describe("C09 §7d — the trust boundary", () => {
  it.todo(
    "T2.156 (C09 I89, §7d, R-TRU-001): every registered kind renders no control byte from its fields, with the payload's printable residue as the control — not deferred on a component: the sweep lands in this MR",
  );
});
