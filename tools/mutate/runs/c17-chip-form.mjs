// C17 I25, I26 and C22 I112 — the chip's label, its cells and its ground.
//
// **Three seams and each fails invisibly.** A label composed wrongly is still a
// label; a span off by a column still paints something; a ground that outranks
// the selection is still a ground. None of the three is visible from a green
// run, and the last one is only visible in the bytes.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const LAYOUT = "src/interaction/editor/layout.ts";
const PAINT = "src/shell/paint.ts";
const FILES = "test/unit/chip-form.test.ts test/unit/session-paint.test.ts";

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
    // **A change the run's own corpus can see** (F1254): with the substitution
    // gone, the sentinel draws as itself and every row about a label, a span
    // and a ground fails at once. If this survives, nothing below reaches the
    // walk.
    file: LAYOUT,
    from: "      const shown = drawAs?.(cluster) ?? cluster;",
    to: "      const shown = cluster;",
    why:
      "the sentinel draws as itself, so no label, no span and no ground exist — "
      + "if this survives, the rows are not reading the walk they think they are",
  },
  mutations: [
    {
      // **THE DEFECT: the span is derived from the position pair.** This is the
      // first draft, restored: a chip at position p covers `cells[p]` to
      // `cells[p+1]`, which reads exactly right and names the row the wrap
      // moved the chip *off*. It is the defect T1.46 was written after finding.
      name: "THE DEFECT: the chip's span is taken from the position before it",
      file: LAYOUT,
      from: "        const from = gutterAt(at(), gutter) + used;",
      to: "        const from = gutterAt(at(), gutter) + (used > 0 ? used - 1 : used);",
      expect: "T1.46",
    },
    {
      // **The bracket rung and the painted rung swap.** Both are labels, both
      // are one word, both wrap whole — and a terminal with no colour would
      // show a name floating in the prompt with nothing saying it is a chip.
      name: "the bracket goes to the painted rung and the padding to the bare one",
      file: LAYOUT,
      from: "  return look.painted ? ` ${text} ` : `[${text}]`;",
      to: "  return look.painted ? `[${text}]` : ` ${text} `;",
      expect: "T1.44",
    },
    {
      // **The size loses its separator's absence.** An image has no `lines`, and
      // the natural implementation emits the separator anyway — ` #2 x · L `.
      // Nothing about the width or the wrap changes.
      name: "a chip with no size still draws a separator",
      file: LAYOUT,
      from: "  const size = chip.lines === undefined ? \"\" : ` ${look.separator} ${String(chip.lines)}L`;",
      to: "  const size = ` ${look.separator} ${chip.lines === undefined ? \"\" : String(chip.lines)}L`;",
      expect: "T1.44",
    },
    {
      // **The composer holds its own separator** rather than using the one it
      // was handed, which is right at the unicode tier and wrong at every
      // other — the ASCII frame drawing one `·` among its dashes.
      name: "the separator is a copy rather than the tier's",
      file: LAYOUT,
      from: "` ${look.separator} ${String(chip.lines)}L`",
      to: "` \\u00b7 ${String(chip.lines)}L`",
      expect: "T1.44",
    },
    {
      // **THE OTHER DEFECT: the chip outranks the selection.** `R-STA-002` puts
      // a copy selection above a structural surface; reversed, a selected chip
      // keeps its own ground and the region stops at it — two grounds on one
      // row, which every assertion about *is there a ground* passes.
      name: "THE OTHER DEFECT: a chip keeps its ground under a selection",
      file: PAINT,
      from: "    const overlaps = wash !== undefined && wash.from < span.to && wash.to > span.from;",
      to: "    const overlaps = false;",
      expect: "T1.68",
    },
    {
      // **The row is painted in two passes**, which is what `washed` did and
      // what `styled` exists to stop: the second call measures the first's SGR
      // bytes as cells. Aimed at the ordering rather than at the arithmetic,
      // because reversing the ranges is what a reader would call harmless.
      name: "the ranges are applied in reverse, so a later cut lands in earlier bytes",
      file: PAINT,
      from: "  const order = [...ranges].sort((a, b) => a.from - b.from);",
      to: "  const order = [...ranges].sort((a, b) => b.from - a.from);",
      expect: "T1.68",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
