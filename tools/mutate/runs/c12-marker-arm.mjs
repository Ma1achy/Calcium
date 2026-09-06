// C12 I99 — the marker arm, and whether a row can tell a shape that was honoured
// from a shape that ate the channel it shares a table with.
//
// **The risk this run exists for is F486's wrong implementation.** The refusal
// this feature overturns claimed a caller's shape and the depth tier are *one
// cell with two claims on it*. They are not — the table is `3 × 5` and they
// index different dimensions — but a renderer written from that sentence would
// pack the marker over the tier, and **five of MK1–MK6 pass against it**: they
// assert the shape is honoured, which is exactly what the wrong version does.
// So the second mutation below is the whole reason MK6 was written.
//
// **Which rows this reaches, stated.** Five mutations across MK1, MK2, MK3, MK5
// and MK6. **MK4 has none** and the reason is F484: it asserts that the far
// row's column is honoured *and does not help*, so every mutation that changes
// the far row makes the arm worse in a way MK4 cannot distinguish from the
// alphabet's own limit — which is the finding rather than a gap in the row.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-marker-arm.test.ts";
const SCATTER = "src/presentation/plot/scatter3.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: SCATTER,
    // The near row replaced by the far one, so the tier's top rung draws dots.
    // Every row that names a near glyph fails, which is what says the suite can
    // see the table at all.
    from: "  const table = [marks.near, marks.mid, marks.far] as const;",
    to: "  const table = [marks.far, marks.mid, marks.far] as const;",
    why: "MK1, MK2, MK3 and MK6 all read glyphs out of the near row; a run where replacing that row survives is reading nothing",
  },
  mutations: [
    {
      // **The field is accepted and ignored** — F207's class, and the one a
      // reader cannot see from a frame, because the picture is still a correct
      // scatter with shapes on it. MK2's second cloud is what separates them:
      // ignoring the field leaves *both* clouds on their index's shape.
      name: "the marker name never reaches the column",
      file: GLYPHS,
      from: "  return marker === undefined\n    ? series % MARKER3_COLUMNS // cells-ok — a table width\n    : MARKER3_COLUMN[marker];",
      to: "  return series % MARKER3_COLUMNS; // cells-ok — a table width",
      expect: "MK2",
    },
    {
      // **F486's refusal, implemented.** The shape replaces the tier rather than
      // sitting beside it, which is what *one cell with two claims on it* would
      // mean if it were true. The picture still shows every named shape, so MK1,
      // MK2, MK3 and MK5 all pass — this is the mutation MK6 exists for.
      name: "the marker replaces the depth tier rather than indexing beside it",
      file: SCATTER,
      from: "      glyph[i] = tier * MARKER3_COLUMNS + d.column; // cells-ok — a table width",
      to: "      glyph[i] = d.column; // cells-ok — a table width",
      expect: "MK6",
    },
    {
      // **The member selects nothing**, which is C12 I87 as it read before this
      // commit: the arm is the terminal's and `plotStyle` is ignored. At 24-bit
      // the block draws the colour raster and the glyph table stays unreachable.
      //
      // **Re-anchored when the switch became `armOf`** (C12 I100): the arm is a
      // named three-way now, so dropping the member's clause is one line inside
      // that function rather than a change to a boolean.
      name: "the named arm falls back to the capability switch",
      file: SCATTER,
      from: '  if (ps === "marker") return "glyph";',
      to: '  if (false) return "glyph";',
      expect: "MK1",
    },
    {
      // **The default becomes a constant** rather than the series index, which
      // is the shape that already drew. Every unnamed cloud collapses onto one
      // glyph — the change that would have moved committed frames, and the
      // reason MK3 is phrased over three series rather than one.
      name: "an unnamed cloud takes column zero rather than its index",
      file: GLYPHS,
      from: "    ? series % MARKER3_COLUMNS // cells-ok — a table width",
      to: "    ? 0 // cells-ok — a table width",
      expect: "MK3",
    },
    {
      // **The gate accepts an unknown name** and the sample disappears — which
      // is the difference from `Tone` (F479) that §6m row 7 rules on: an
      // unresolved tone still draws a mark, an unresolved marker draws nothing.
      name: "an unknown marker name is accepted at the gate",
      file: VALIDATE,
      from: '      if (typeof marker !== "string" || !(marker in MARKER3_MEMBERS)) {',
      to: "      if (false) {",
      expect: "MK5",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
