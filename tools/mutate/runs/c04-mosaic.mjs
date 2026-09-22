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

const FILES = "test/unit/mosaic.test.ts test/contract/blocks.test.ts test/contract/view-model.test.ts test/contract/rows-arm.test.ts";

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
    why: "with no hole character every `.` becomes a named region, so MS8's holes gain children the arity check then refuses",
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
      expect: "MS2",
    },
    {
      // **The clamp the build found and the walk did not** — and 1.7 moved it
      // out of the geometry into the paint (C29 §8a C9), so the line this row
      // holds is `mosaicRoom`'s cut rather than `mosaicRects`'. The rule is the
      // same rule: a region reaching past the grid is cut to the room the grid
      // has. Every count still agrees; only the width moves, and only at the
      // widths nobody looks at.
      name: "the rects are not cut to the room the grid has",
      file: CONTAINERS,
      from: "  const w = Math.min(rect.width, width - rect.left); // cells-ok — a cell count",
      to: "  const w = rect.width; // cells-ok — a cell count",
      expect: "MS7",
    },
    {
      // **The pair was `flexShrink: 0` and `overflow: "hidden"`** on the cell's
      // Ink box — the squash and the clip, split so the run said which property
      // each row held. Both are gone with the element arm (F1209) and the clip
      // is geometric now: the cell's own `width` and `height` on the composed
      // record (C09 I35). Nothing squashes a row, so the first half has no
      // successor; the second is two, because the clip has two axes and a row
      // that watched one said nothing about the other.
      name: "the cell does not clip horizontally",
      file: CONTAINERS,
      from: "        x: rect.left, top: rect.top, width: room.width, height: room.height,",
      to: "        x: rect.left, top: rect.top, width: 1000, height: room.height,",
      // **It survived against MS5, and the reason is the construction.** Every
      // child is rendered at `rect.width`, so its rows are already no wider and
      // there is nothing for the cut to take — unless the child answers past
      // the width it was given, which no kind C09 ships does and a consumer's
      // may (I13, F1211). T2.147 registers `wide` in a cell for exactly that.
      expect: "T2.147",
    },
    {
      // The other axis, so the run says which one each row is holding rather
      // than reporting a single joint property.
      name: "the cell does not clip vertically",
      file: CONTAINERS,
      from: "        x: rect.left, top: rect.top, width: room.width, height: room.height,\n",
      to: "        x: rect.left, top: rect.top, width: room.width,\n",
      expect: "MS6",
    },
    {
      // **Fixed shares after the weights**, which is C04 I44's rule and the reason a
      // cell count is not a suggestion. The totals still sum to the width, so
      // nothing about the arithmetic looks wrong.
      //
      // **Re-anchored onto the mosaic's own line, and that is the finding**
      // (F1244). It used to sit on `divideShares`' budget — which is the
      // *group's* implementation of this rule and is already `c04-weights`'
      // T3.20 — so this run mutated another run's subject and reported nothing
      // about its own. It survived, because none of the four files this command
      // names carries a group's fixed-share row. The rule has two
      // implementations, `divideShares` for a group and `gridLines` for both of
      // the mosaic's axes, and `measure.ts:141`'s claim that one serves both is
      // wrong. The import-reach gate cannot see this: `mosaic.ts` is imported by
      // `mosaic.test.ts`, and the reach that was missing is to a *function*.
      name: "the weights divide before the fixed shares are taken",
      file: MOSAIC,
      from: "  const budget = total - fixed.reduce((a, b) => a + b, 0); // cells-ok — a cell count",
      to: "  const budget = total; // cells-ok — a cell count",
      expect: "MS4",
    },
    {
      // **Reading order reversed.** The mapping onto `children` is positional,
      // so this draws every child in the wrong cell — with the same count, the
      // same widths and the same refusals.
      name: "the regions map onto children in reverse",
      file: MOSAIC,
      from: "  const regions = order.map((name) => {",
      to: "  const regions = [...order].reverse().map((name) => {",
      expect: "MS4",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
