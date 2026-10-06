// C22 §6u.1 — the too-small frame is the design's (I153, §047).
//
// §047's figure, drawn:
//
//   ┌────────────────────────┐
//   │ ▲ 34×8                 │
//   │ needs 60×16            │
//   └────────────────────────┘
import { describe, expect, it } from "vitest";

import { fallbackLines } from "../../src/shell/fallback.js";
import { cells } from "../../src/presentation/text.js";
import { ASCII_CAPS, FULL_CAPS } from "../support/render.js";

const WIDE = Object.freeze({ ...FULL_CAPS, ambiguousWidth: "wide" as const });

describe("C22 I153 — the too-small frame", () => {
  it("T3.8e (C22 I153): the five rungs of the classification table", () => {
    const at = (columns: number, rows: number, caps = FULL_CAPS): readonly string[] => fallbackLines({ columns, rows }, caps);

    expect(at(34, 0), "zero rows: nothing").toEqual([]);
    expect(at(34, 1), "one row: the size").toEqual(["▲ 34×1"]);
    expect(at(34, 2), "two rows: both lines").toEqual(["▲ 34×2", "needs 60×16"]);
    expect(at(34, 3), "three rows: both lines, never a box the terminal would cut").toEqual(["▲ 34×3", "needs 60×16"]);
    expect(at(34, 4), "four rows and the width: the box").toHaveLength(4);
    expect(at(34, 4)[0]?.startsWith("┌")).toBe(true);
    expect(at(14, 8), "four rows and not the width (box is 15): the lines").toEqual(["▲ 14×8", "needs 60×16"]);
    expect(at(15, 8), "exactly the box's width").toHaveLength(4);
    // Wide ambiguity takes the whole mark set to its ASCII half (C09 I48), so the box is the same width.
    expect(at(15, 8, WIDE), "the wide reading draws the ASCII box").toEqual(["+-------------+", "| ! 15x8      |", "| needs 60x16 |", "+-------------+"]);
    expect(at(14, 8, WIDE)).toHaveLength(2);
  });

  it("T3.8e (C22 I153): at every size and rung no line is wider than the terminal, and none is taller", () => {
    for (const caps of [FULL_CAPS, ASCII_CAPS, WIDE]) {
      for (const columns of [1, 5, 10, 14, 15, 16, 17, 19, 20, 34, 59]) {
        for (const rows of [0, 1, 2, 3, 4, 5, 8, 15]) {
          const lines = fallbackLines({ columns, rows }, caps);
          expect(lines.length, `${String(columns)}x${String(rows)} rows`).toBeLessThanOrEqual(rows);
          for (const line of lines) {
            expect(cells(line, caps.ambiguousWidth), `${String(columns)}x${String(rows)}: ${line}`).toBeLessThanOrEqual(columns);
          }
        }
      }
    }
  });

  it("T3.8f (C22 I153, §047): the figure's two lines, exactly, at Unicode and at ASCII", () => {
    expect(fallbackLines({ columns: 34, rows: 8 }, FULL_CAPS)).toEqual([
      "┌─────────────┐",
      "│ ▲ 34×8      │",
      "│ needs 60×16 │",
      "└─────────────┘",
    ]);
    expect(fallbackLines({ columns: 34, rows: 8 }, ASCII_CAPS)).toEqual([
      "+-------------+",
      "| ! 34x8      |",
      "| needs 60x16 |",
      "+-------------+",
    ]);
  });
});
