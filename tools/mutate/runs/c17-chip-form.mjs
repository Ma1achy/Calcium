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
const FILES = "test/unit/chip-form.test.ts test/unit/session-paint.test.ts test/edge/editor.test.ts";

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
    // Re-anchored on review batch 4 (F1401): the unsubstituted arm now draws
    // through `neutraliseControl` (C17 I36), and dropping the chip arm is
    // still the whole of this control.
    from: "      let shown = chip ?? neutraliseControl(cluster);",
    to: "      let shown = neutraliseControl(cluster);",
    why:
      "the sentinel draws as itself, so no label, no span and no ground exist — "
      + "if this survives, the rows are not reading the walk they think they are",
  },
  mutations: [
    // ---- C17 I32, §5e — the elision (T6.22) ----------------------------------
    {
      // **The end cut**, which keeps `#1 a-very-long-` and loses the size — the
      // half that says how much was pasted. Nothing about the width changes.
      name: "T6.22: the elision cuts at the end rather than the middle",
      file: LAYOUT,
      from: '  return frame(truncate(text, inner, tier, "middle"));',
      to: '  return frame(truncate(text, inner, tier, "end"));',
      expect: "T1.54",
    },
    {
      // **`c8c7a77e`'s overflow**, restored: the walk never asks for the cut,
      // so a label wider than its row is drawn whole and the painter clips it.
      name: "T6.22: the elision removed — a chip wider than its row overflows it",
      file: LAYOUT,
      // Re-anchored on review batch 4 (F1401): the gate reads `chip`, since a
      // neutralised bidi character also differs from its cluster (C17 I36).
      from: "      if (w > limit && chip !== undefined && drawAs !== undefined) {",
      to: "      if (w > limit && chip !== undefined && drawAs !== undefined && Number.NaN > 0) {",
      expect: "T1.47",
    },
    {
      // **The limit of the row being left**, which is what reading it before
      // `open()` gave: right for the fit test, wrong for the row the chip lands
      // on whenever the gutter's two figures differ.
      name: "T6.22: the elision's limit is the row the chip left, not the row it landed on",
      file: LAYOUT,
      from: "      const limit = usableAt(at(), width, gutter);",
      to: "      const limit = usableAt(used === 0 && at() > 0 ? at() - 1 : at(), width, gutter);",
      expect: "T1.55",
    },
    {
      // **A marker of its own** rather than the tier's: right at the unicode
      // tier, and a `…` at the ASCII one — which is also the wide one.
      name: "the elision's marker ignores the tier",
      file: LAYOUT,
      from: "  const tier = { unicode: look.unicode } as const;",
      to: '  const tier = { unicode: "full" } as const;',
      expect: "T1.56",
    },
    {
      // **The marker unpadded**: the chip spends one cell of the two it was
      // given, and the walk's `used` and the row's cells disagree by one.
      name: "the narrow arm's marker is not padded to the width",
      file: LAYOUT,
      from: '  if (inner < widthOf(marker)) return marker + " ".repeat(Math.max(0, room - widthOf(marker)));',
      to: "  if (inner < widthOf(marker)) return marker;",
      expect: "T1.56",
    },
    {
      // **A code-unit cut**, a third of the budget either side of the marker.
      // Byte-identical to C09's on an ASCII label — T1.54 cannot see it — and a
      // split ZWJ family or a two-cell glyph past the budget on a wide one.
      name: "the elision cuts by code unit rather than by cluster",
      file: LAYOUT,
      from: '  return frame(truncate(text, inner, tier, "middle"));',
      to: '  return frame(`${text.slice(0, Math.floor((inner - 1) / 3))}${marker}${text.slice(text.length - (inner - 1 - Math.floor((inner - 1) / 3)))}`);',
      expect: "T3.18",
    },
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
      from: "  const frame = (inner: string): string => (look.painted ? ` ${inner} ` : `[${inner}]`);",
      to: "  const frame = (inner: string): string => (look.painted ? `[${inner}]` : ` ${inner} `);",
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
