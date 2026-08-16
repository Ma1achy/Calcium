// A `keyValue` row's bar, mutated — C04 I51, and the rows are the boundary.
//
// **Everything here renders.** The bar is a declared width inside a column that
// is a remainder, and every way of getting that wrong produces a row of the
// right height with the right glyphs: a 68-cell run at a terminal width of 80,
// a row one cell over its column, a detail that is an ellipsis and nothing
// else. None of the three is visible to a count, which is why the frame is in
// `states.test.ts` and why the last two rows below are about the ambiguous
// width — the rung where the shipped defect lived in a committed snapshot
// nobody read (F176).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/blocks.test.ts test/golden/states.test.ts";
const KV = "src/presentation/blocks/kinds/structured.ts";
const RAMP = "src/presentation/plot/ramp.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: KV,
    from: "  const barWidth = Math.min(Math.floor(entry.barWidth), valueWidth);",
    to: "  const barWidth = 0;",
    why: "a bar of no cells — if this survives, nothing in the suite reads the run and no row below is earned",
  },
  mutations: [
    {
      // **THE FINDING**, restored: the bar handed the remainder rather than its
      // declared width. At a terminal width of 80 the value column is 74 cells
      // and the run is 68 of them — arithmetically perfect, and a picture no
      // surface asked for. This is why the width is on the row at all.
      name: "THE FINDING: the bar takes the remainder instead of what it declared",
      file: KV,
      from: "  const barWidth = Math.min(Math.floor(entry.barWidth), valueWidth);",
      to: "  const barWidth = valueWidth;",
      expect: "T1.5a",
    },
    {
      // The clamp dropped, so a surface declaring more cells than the column has
      // overflows it — and a row one cell over is a row the terminal wraps,
      // adding a line no measurer counted.
      name: "a declared width wider than the column is not clamped to it",
      file: KV,
      from: "  const barWidth = Math.min(Math.floor(entry.barWidth), valueWidth);",
      to: "  const barWidth = Math.floor(entry.barWidth);",
      expect: "T1.5d",
    },
    {
      // The gap added outside the remainder rather than taken from it. It reads
      // as the obvious way to separate two things and it is the width defect:
      // the row comes to `valueWidth + COLUMN_GAP`.
      name: "the gap is added to the row rather than taken from the detail",
      file: KV,
      from: "  const rest = valueWidth - barWidth - COLUMN_GAP;",
      to: "  const rest = valueWidth - barWidth;",
      expect: "T1.5b",
    },
    {
      // A one-cell detail is an ellipsis and nothing else — a mark that says
      // *there is more* while showing none of it. Read from the frame at 23,
      // where no arithmetic in the function was wrong.
      name: "a detail of one cell is drawn, and it can only be an ellipsis",
      file: KV,
      from: "  if (rest < MIN_DETAIL) return run;",
      to: "  if (rest < 1) return run;",
      expect: "T1.5c",
    },
    {
      // **The renderer invents a width the document did not give.** A default
      // makes an invalid block render, which is what keeps a gate from ever
      // being reached — `validateBlock` refuses the broken pair and would then
      // be refusing something the frame shows perfectly well.
      name: "a bar with no barWidth is given one by the renderer",
      file: KV,
      from: "  if (entry.bar === undefined || entry.barWidth === undefined) {",
      to: "  if (entry.bar === undefined) {",
      expect: "T1.5",
    },
    {
      // **F176 restored**: the fill pair with no ambiguous-width arm. `█` and
      // `░` are `East_Asian_Width=Ambiguous`, so at `wide` the run is twice its
      // cells and `truncate` eats the number — the one thing a bar exists to
      // say. It shipped, and the golden corpus recorded it for a whole state's
      // lifetime without anyone reading the frame.
      name: "THE SHIPPED DEFECT: the fill pair ignores the ambiguous width",
      file: RAMP,
      from: '  if (caps.ambiguousWidth === "wide") {\n',
      to: "  if (false) {\n",
      expect: "states",
    },
    {
      // The absent mark, which is the same bug in the arm nobody would check:
      // the em dash is ambiguous too, so a `null` reading was two cells at that
      // rung while every count agreed it was one.
      name: "the absent mark keeps the em dash at a wide ambiguous width",
      file: RAMP,
      from: '    return Object.freeze({ encodes: "fill", filled: "\\u28ff", empty: "\\u2804", absent: "-" } as const);',
      to: '    return Object.freeze({ encodes: "fill", filled: "\\u28ff", empty: "\\u2804", absent: "\\u2014" } as const);',
      expect: "states",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
