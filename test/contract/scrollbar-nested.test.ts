// C09 I115 — nested scrollables each draw their own bar (parked 22).
//
// **Read by column, off the frame.** The ruling is about *where* each bar sits,
// so a count of bar marks would be satisfied by one box drawing two columns or
// two boxes sharing one.
import { describe, expect, it } from "vitest";

import { block, type Block } from "../../src/data/viewmodel/index.js";
import { cells } from "../../src/presentation/text.js";
import { ASCII_CAPS, FULL_CAPS, measurable } from "../support/render.js";

const SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu");
const plain = (line: string): string => line.replace(SGR, "");

const WIDTH = 30;
const BAR = /^[│┃╽╿|#]$/u;

const nested = (innerChildren: number): Block =>
  block({
    kind: "scroll",
    id: "outer",
    height: 5,
    children: [
      { kind: "raw", id: "o1", text: "OUTER ONE" },
      {
        kind: "scroll",
        id: "inner",
        height: 3,
        children: Array.from({ length: innerChildren }, (_, i) => ({ kind: "raw" as const, id: `i${String(i)}`, text: `INNER ${String(i)}` })),
      },
      { kind: "raw", id: "o5", text: "OUTER FIVE" },
      { kind: "raw", id: "o6", text: "OUTER SIX" },
      { kind: "raw", id: "o7", text: "OUTER SEVEN" },
    ],
  } as never);

/**
 * The cell at `col` of a plain row, **by display cell** rather than by code
 * unit: each grapheme takes `cells()` columns, and a wide one's second column
 * is empty.
 */
const cellAt = (row: string, col: number): string => {
  const grid: string[] = [];
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(row)) {
    grid.push(segment);
    for (let k = 1; k < cells(segment); k += 1) grid.push("");
  }
  return grid[col] ?? " ";
};

describe("C09 I115 — two scrollables, two bars, two columns", () => {
  it("T1.83 (C09 I115, R-SEL-012): an inner and an outer scroll, both overflowing, draw bars in columns 28 and 29", () => {
    for (const caps of [FULL_CAPS, ASCII_CAPS]) {
      const rows = measurable({ capabilities: caps }).renderToLines(nested(4), WIDTH).map(plain);
      // The outer's five-row interior: row 0 is `OUTER ONE`, rows 1–3 the inner.
      const interior = rows.slice(0, 5);
      for (const [i, row] of interior.entries()) {
        expect(cellAt(row, WIDTH - 1), `${caps.unicode} row ${String(i)} |${row}| — the outer's bar`).toMatch(BAR);
      }
      expect(cellAt(rows[0] ?? "", WIDTH - 2), `${caps.unicode}: the outer's own row has no inner bar`).toBe(" ");
      for (const i of [1, 2, 3]) {
        expect(cellAt(rows[i] ?? "", WIDTH - 2), `${caps.unicode} row ${String(i)} |${rows[i] ?? ""}| — the inner's bar`).toMatch(BAR);
      }

      // **The control**: the inner fits, so column 28 is blank on every row —
      // the row is about the inner's overflow, not a column every render fills.
      const fits = measurable({ capabilities: caps }).renderToLines(nested(2), WIDTH).map(plain);
      for (const [i, row] of fits.entries()) {
        expect(cellAt(row, WIDTH - 2), `${caps.unicode} fits, row ${String(i)} |${row}|`).not.toMatch(BAR);
      }
      expect(cellAt(fits[0] ?? "", WIDTH - 1), "and the outer still overflows and draws").toMatch(BAR);
    }
  });
});
