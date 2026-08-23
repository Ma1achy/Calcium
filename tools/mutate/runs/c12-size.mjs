// `width`, `aspect` and `align` — C04 I62, C12 §3ab.
//
// **Every row here renders a plot that looks right.** A narrowing that ignores
// the frame, an aspect that forgets a cell is 1×2, an align that pads the wrong
// side — each is the correct figure in the wrong cells, and the height is
// untouched throughout, so nothing that counts rows can see any of them.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DEF = "src/presentation/plot/definition.ts";
const ASP = "src/presentation/plot/aspect.ts";
const VAL = "src/data/viewmodel/validate.ts";
const BLD = "src/shell/builders/index.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/unit/plot-mutations.test.ts 2>&1",
      { cwd: ROOT, encoding: "utf8", timeout: 180_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: DEF,
    from: "  const drawn = drawnWidth(block, frame);",
    to: "  const drawn = 1;",
    why: "every plot renders one cell wide — if this survives, no row below is reading a rendered width at all",
  },
  mutations: [
    {
      // **The clamp dropped.** A document asking for 200 cells on a 60-cell
      // terminal draws 200, and every row overflows into the next block.
      name: "a declared width is taken as-is, past the frame",
      file: DEF,
      from: "    return Math.min(cap, Math.max(1, Math.floor(block.width))); // cells-ok — a cell count",
      to: "    return Math.max(1, Math.floor(block.width)); // cells-ok — a cell count",
      expect: "SZ8",
    },
    {
      // **`CELL_ASPECT` forgotten**, which is the whole reason `aspect` is a
      // member rather than arithmetic in the caller: the figure is half as wide
      // as it should be and reads as a tall rectangle.
      name: "aspect derives its width without the cell ratio",
      file: ASP,
      from: "  return Math.max(1, Math.round(Math.max(0, rows) * CELL_ASPECT * aspect)); // cells-ok — a column count",
      to: "  return Math.max(1, Math.round(Math.max(0, rows) * aspect)); // cells-ok — a column count",
      expect: "SZ2",
    },
    {
      // Centre and right swapped. Both place the figure somewhere other than
      // the left, so anything asserting *not zero* passes.
      name: "align centre pads by the whole slack",
      file: DEF,
      from: '  if (block.align === "centre") return Math.floor(slack / 2); // cells-ok — a cell count',
      to: '  if (block.align === "centre") return slack; // cells-ok — a cell count',
      expect: "SZ5",
    },
    {
      // The leftover cell to the left rather than the right, which is a
      // one-cell difference at every odd slack and invisible at every even one.
      name: "the centre's leftover cell goes left",
      file: DEF,
      from: '  if (block.align === "centre") return Math.floor(slack / 2); // cells-ok — a cell count',
      to: '  if (block.align === "centre") return Math.ceil(slack / 2); // cells-ok — a cell count',
      expect: "SZ5",
    },
    {
      // **The pad applied to the rows and not only the drawing.** Padding a
      // full-width plot pushes every row right and off the frame — the default
      // arm, which has to cost nothing.
      name: "the pad is applied whether or not the figure was narrowed",
      file: DEF,
      from: "  if (slack === 0) return 0; // cells-ok — a cell count",
      to: "  if (slack === 0) return 2; // cells-ok — a cell count",
      expect: "SZ6",
    },
    {
      // Two ways to say one number, both accepted: the plot silently reads one
      // of the caller's two statements and drops the other.
      name: "width and aspect together are accepted at the boundary",
      file: VAL,
      from: '  if (width !== undefined && aspect !== undefined) {',
      to: "  if (false) {",
      expect: "SZ3",
    },
    {
      // `align` on a full-width figure: a member that does nothing, which reads
      // as one not yet implemented.
      name: "align with neither width nor aspect is accepted at the builder",
      file: BLD,
      from: "    if (align !== undefined && width === undefined && aspect === undefined) {",
      to: "    if (false) {",
      expect: "SZ4",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
