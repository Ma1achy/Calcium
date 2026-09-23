// §073's table header, mutated — the extent, the scope, the ink and the rung.
//
// **A header that paints is invisible to every row about a header's text.**
// C11's own corpus asserts labels, offsets, truncation and the sort indicator,
// and not one of them moves when the row gains or loses a surface — which is
// how `bgElev` could have arrived over the wrong cells, over the wrong rows, or
// with an ink resolved against the page it is no longer on.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const TABLE = "src/presentation/table/definition.ts";
const CELLS = "src/presentation/table/cells.ts";
const FILES = "test/contract/table.test.ts test/contract/blocks.test.ts test/unit/render-focus.test.ts";

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
    // The header never paints, so the kind leaves C09 I95's declared set and the
    // extent row has no ground to measure.
    file: TABLE,
    from: '      const elev = background("surface.bgElev", ctx.theme, ctx.capabilities);',
    to: "      const elev = {};",
    why: "no header carries a ground, so `table` is not a painting kind and the extent is nothing",
  },
  mutations: [
    {
      // **The ground stops where the labels end.** §073's reason fixes the
      // extent: the header is a surface the rows sit under, so a ground that
      // stopped at the last label would say *these words* are the surface. The
      // text is byte-identical either way.
      name: "the ground stops at the last label rather than the block's edge",
      file: TABLE,
      from: "        const tail = Math.max(0, inner - drawn); // cells-ok — the row's own residue",
      to: "        const tail = 0; // cells-ok — the row's own residue",
      expect: "T2.161",
    },
    {
      // **The gutter left out of it.** One cell short at the left edge, which
      // no assertion about a column offset can see — the columns are where they
      // were and only the surface's start moved.
      name: "the ground begins after the gutter",
      file: TABLE,
      from: "              { text: blank },\n              ...spans,",
      to: "              ...spans,",
      expect: "T2.161",
    },
    {
      // **The wash over the whole table**, which is §073's own *a wash over
      // content is a MODE, and there is none*. Every label and every cell is
      // still exactly where it was.
      name: "the body rows take the header's ground too",
      file: TABLE,
      // **Re-anchored when `emit` took the row's ground** (§5c): the row is
      // built before it is painted now, so the mutation lands on the array
      // rather than on the `parts.push` that consumed it. What it does is
      // unchanged — every body row washed with the header's surface.
      from: "      const row = [...lead(marked), ...clampSpans(spans, inner, ctx.capabilities)];",
      to: "      const row = [...lead(marked), ...clampSpans(spans, inner, ctx.capabilities)].map((sp) => ({ text: sp.text, style: { ...sp.style, background: background(\"surface.bgElev\", ctx.theme, ctx.capabilities).background } }));",
      expect: "T2.161",
    },
    {
      // **The ink resolved against the page it is no longer on** (C10 I48).
      // Identical for a theme that does not repaint `muted` on `bgElev` and
      // wrong for one that does — F1240's shape, where the painter and the
      // resolver stopped agreeing about which ground a row took.
      name: "the header's ink is resolved off its ground",
      file: TABLE,
      from: '        const spans = clampSpans(headerSpans(block, plan, ctx, "bgElev"), inner, ctx.capabilities);',
      to: "        const spans = clampSpans(headerSpans(block, plan, ctx), inner, ctx.capabilities);",
      expect: "T2.161",
    },
    {
      // **The ground survives one bit**, where there is none to survive. It
      // would put a background nothing resolved onto every monochrome frame,
      // and `R-COL-004`'s *degrades to nothing and loses nothing* is the claim
      // that would stop being true.
      name: "the header paints where no ground resolves",
      file: CELLS,
      from: '  const dim = tone("muted", ctx.theme, ctx.capabilities, on);',
      to: '  const dim = { ...tone("muted", ctx.theme, ctx.capabilities, on), background: { kind: "rgb", hex: "#222222" } };',
      expect: "T2.161",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
