// C04 I71, I72 · C09 I35 — the grid's arithmetic, and the two properties that
// bound a cell.
//
// **The mutations attack what the row count cannot see.** Three of the six
// leave `measure` equal to `render` at every width and change only the figure:
// the squashed child, the un-clamped grid and the reversed reading order all
// report exactly the heights the spec commits to. That is the whole argument for
// the frame-reading rows under this pass, and it is why the control has to move
// a count — otherwise a green run proves the harness, not the tests.
//
// **The clamp is the one that was found by building rather than by the walk.**
// Ink applies `clips.at(-1)`, the innermost clip, so a cell that clips its own
// child shadows the container's rather than intersecting with it — and the
// container's clip, which looked like the remedy, is shadowed everywhere it
// matters.
//
// Anchors checked for uniqueness before the pass (F219), atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const MOSAIC = "src/data/viewmodel/mosaic.ts";
const CONTAINERS = "src/presentation/blocks/kinds/containers.ts";

const FILES = "test/unit/mosaic.test.ts test/contract/blocks.test.ts test/contract/view-model.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: MOSAIC,
    from: "export const MOSAIC_HOLE = \".\";",
    to: "export const MOSAIC_HOLE = \"\\u0000\";",
    why: "with no hole character every `.` becomes a named region, so MG8's holes gain children the arity check then refuses",
  },
  mutations: [
    {
      // **The refusal a reader cannot see**, removed. `"ABA"` is a region in two
      // pieces and reads as an ordinary spec string; without this the grid
      // accepts it and draws one region over the other's cells.
      name: "a region need not be a rectangle",
      file: MOSAIC,
      from: "    if (box.n !== area) {",
      to: "    if (false) {",
      expect: "MG2",
    },
    {
      // **The clamp the build found and the walk did not.** Every count still
      // agrees; only the width moves, and only at the widths nobody looks at.
      name: "the rects are not clamped to the region",
      file: MOSAIC,
      from: "      width: Math.max(0, Math.min(sum(colWidths, r.col, r.cols), width - left)), // cells-ok — a cell count",
      to: "      width: sum(colWidths, r.col, r.cols), // cells-ok — a cell count",
      expect: "MG7",
    },
    {
      // **`flexShrink: 0`, which is the half that is easy to read as redundant**
      // beside the clip. Without it the child is squashed before it can overflow
      // and draws rows out of its own middle — `measure` unchanged.
      name: "the cell's content may shrink",
      file: CONTAINERS,
      from: "            { flexShrink: 0, flexDirection: \"column\" as const },",
      to: "            { flexDirection: \"column\" as const },",
      expect: "MG5",
    },
    {
      // The other half of the pair, so the run says which one each row is
      // holding rather than reporting a single joint property.
      name: "the cell does not clip",
      file: CONTAINERS,
      from: "            overflow: \"hidden\" as const,\n            flexDirection: \"column\" as const,",
      to: "            flexDirection: \"column\" as const,",
      expect: "MG6",
    },
    {
      // **Fixed shares after the weights**, which is C04 I44's rule and the reason a
      // cell count is not a suggestion. The totals still sum to the width, so
      // nothing about the arithmetic looks wrong.
      name: "the weights divide before the fixed shares are taken",
      file: MOSAIC,
      from: "  const budget = total - gaps - fixed;",
      to: "  const budget = total - gaps;",
      expect: "MG4",
    },
    {
      // **Reading order reversed.** The mapping onto `children` is positional,
      // so this draws every child in the wrong cell — with the same count, the
      // same widths and the same refusals.
      name: "the regions map onto children in reverse",
      file: MOSAIC,
      from: "  const regions = order.map((name) => {",
      to: "  const regions = [...order].reverse().map((name) => {",
      expect: "MG4",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
