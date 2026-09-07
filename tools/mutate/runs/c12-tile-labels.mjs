// C12 I55, §3n — a containment form names what it contains.
//
// **The control is the whole mechanism**, because every row below asserts a
// word in a frame: a run that cannot see the names vanish can see nothing else
// here.
//
// **Two of these attack the *placement rule* and not its presence.** Naming the
// tiles at all is easy to get green — the hard claim is that a tile is named
// only where it still owns cells, and both mutations produce a frame that
// renders, fits its width and carries names.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DEF = "src/presentation/plot/definition.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/unit/plot-hierarchy.test.ts 2>&1", {
      cwd: ROOT, encoding: "utf8", timeout: 300_000,
    });
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
    from: "      const glyph = named[r]![c];",
    to: "      const glyph = undefined;",
    why:
      "the names computed and then not consulted — exactly the state the form shipped in, where " +
      "`Tile.label` was carried through the layout and dropped one line from the end",
  },
  mutations: [
    {
      // **The run width dropped to *any run at all*.** `render` owns one cell
      // either side of its children, so it acquires a name that spills eight
      // cells into `curve`'s rectangle — a frame that renders, fits, and
      // attributes cells to the wrong node.
      name: "a tile is named wherever it owns a cell",
      file: DEF,
      from: "        if (c - start >= need) return { row: r, col: start }; // cells-ok — a cell count",
      to: "        if (c - start > 0) return { row: r, col: start }; // cells-ok — a cell count",
      expect: "TM3",
    },
    {
      // **Truncation instead of dropping**, which is §3n's oldest sentence:
      // three characters of a symbol name is not a shorter name, it is a
      // different one. At width 12 every leaf acquires a prefix of itself.
      name: "a name too wide for its tile is cut rather than dropped",
      file: DEF,
      from: "    const at = ownRun(grid, t.index, cells(text, ambiguous), areaRows, width); // cells-ok — a tile index",
      to: "    const at = ownRun(grid, t.index, 1, areaRows, width); // cells-ok — a tile index",
      expect: "TM4",
    },
    {
      // **The rectangle instead of the ink** — C12 I48's principle, inverted. This
      // is the one the walk got wrong before the code was written, so the row
      // exists to keep the corrected version falsifiable.
      name: "the placement comes from the tile's rectangle",
      file: DEF,
      from: "    const at = ownRun(grid, t.index, cells(text, ambiguous), areaRows, width); // cells-ok — a tile index",
      to:
        "    const rect = ownRun(grid, t.index, 1, areaRows, width);\n" +
        "    const at = rect === null ? null : { row: rect.row, col: rect.col }; // cells-ok — a tile index",
      expect: "TM4",
    },
    {
      // The wide-codepoint continuation removed: a two-cell character would
      // leave its second cell for the fill to walk into, so a name containing
      // one is a name with a block glyph inside it.
      name: "a wide codepoint leaves no continuation cell",
      file: DEF,
      from: "      for (let k = 1; k < w; k += 1) named[at.row]![col + k] = \"\"; // cells-ok — a cell count",
      to: "",
      expect: "TM5",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
