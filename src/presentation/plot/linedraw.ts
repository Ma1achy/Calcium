/**
 * Box-drawing curve renderer — connected lines using ╭╮╰╯─│ glyphs.
 *
 * Same interface as `curveRows`: takes a series, range, area dimensions,
 * and returns rows of one character per cell. Where braille sets dots in a
 * 2×4 sub-cell grid, this picks one glyph per cell based on entry and exit
 * direction — half the horizontal resolution, but crisp joins.
 */
import type { Series } from "../../data/viewmodel/index.js";
import { finiteSamples, columnsOf, rowOf, type Range } from "./scale.js";

type Dir = "up" | "down" | "left" | "right" | "none";

const ROUNDED: Readonly<Record<string, string>> = Object.freeze({
  "right,right": "─",   // ─
  "left,left":   "─",   // ─
  "left,right":  "─",   // ─
  "right,left":  "─",   // ─
  "up,up":       "│",   // │
  "down,down":   "│",   // │
  "up,down":     "│",   // │
  "down,up":     "│",   // │
  "right,down":  "╭",   // ╭
  "down,right":  "╭",   // ╭  — line enters from above, exits right
  "left,down":   "╮",   // ╮
  "down,left":   "╮",   // ╮
  "right,up":    "╰",   // ╰
  "up,right":    "╰",   // ╰
  "left,up":     "╯",   // ╯
  "up,left":     "╯",   // ╯
  "none,right":  "╶",   // ╶  line start
  "none,left":   "╴",   // ╴
  "left,none":   "╴",   // ╴  line end
  "right,none":  "╶",   // ╶
  "none,down":   "│",   // │
  "none,up":     "│",   // │
  "down,none":   "│",   // │
  "up,none":     "│",   // │
  "none,none":   "─",   // ─  fallback
});

const SHARP: Readonly<Record<string, string>> = Object.freeze({
  ...ROUNDED,
  "right,down":  "┌",   // ┌
  "down,right":  "┌",   // ┌
  "left,down":   "┐",   // ┐
  "down,left":   "┐",   // ┐
  "right,up":    "└",   // └
  "up,right":    "└",   // └
  "left,up":     "┘",   // ┘
  "up,left":     "┘",   // ┘
});

function glyphFor(enter: Dir, exit: Dir, corners: "rounded" | "sharp"): string {
  const table = corners === "sharp" ? SHARP : ROUNDED;
  return table[`${enter},${exit}`] ?? "─";
}

/**
 * Box-drawing curve renderer — one glyph per cell.
 */
export function lineDrawRows(
  series: Series,
  range: Range,
  areaWidth: number,
  areaRows: number,
  corners: "rounded" | "sharp",
): readonly string[] {
  const grid: string[][] = Array.from({ length: areaRows }, () =>
    Array.from({ length: areaWidth }, () => " "),
  );

  const samples = finiteSamples(series.values);
  const columns = columnsOf(samples, series.values.length, areaWidth); // cells-ok — a sample count

  const y = (v: number): number => {
    const row = rowOf(v, range, areaRows);
    return Math.max(0, Math.min(areaRows - 1, row));
  };

  for (let ci = 0; ci < columns.length; ci++) { // cells-ok — a column count
    const col = columns[ci]!;
    const curRow = y(col.last);
    const next = columns[ci + 1];
    const prev = columns[ci - 1];

    let enter: Dir = "none";
    let exit: Dir = "none";

    if (prev !== undefined && prev.iLast + 1 === col.iFirst) {
      const prevRow = y(prev.last);
      if (prevRow < curRow) enter = "up";
      else if (prevRow > curRow) enter = "down";
      else enter = "left";
    }

    if (next !== undefined && col.iLast + 1 === next.iFirst) {
      const nextRow = y(next.first);
      if (nextRow < curRow) exit = "up";
      else if (nextRow > curRow) exit = "down";
      else exit = "right";
    }

    grid[curRow]![col.x] = glyphFor(enter, exit, corners);

    if (next !== undefined && col.iLast + 1 === next.iFirst) {
      const nextRow = y(next.first);
      if (curRow !== nextRow) {
        const vert = glyphFor("up", "down", corners);
        const step = curRow < nextRow ? 1 : -1;
        for (let r = curRow + step; r !== nextRow; r += step) {
          grid[r]![col.x] = vert;
        }
      }
    }
  }

  return grid.map((row) => row.join(""));
}
