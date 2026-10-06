// The frame's focus, mutated — the flag, the predicate and the ink.
//
// **The defect this covers was invisible to a green suite and to a golden.**
// `compositions.test.ts` case 4 is titled *focus over a heatmap* and prints the
// ruling *the border and the axes take the focus*; it focused with `rowId:
// null`, which F802 rules paints nothing, over a matrix form whose layout never
// reached `reserving` and so never carried `focused`. Its two assertions —
// *focus changes no glyph and no width*, and a snapshot — are **both true of
// two identical pictures**, and the snapshot recorded them.
//
// So the mutations are the three places the rule can be broken silently: the
// flag not being set, the predicate widened to the form F802 refuses, and the
// ink pointed at the scale instead of the enclosure — which is the remedy that
// was tried first and looked right.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/plot.test.ts test/golden/compositions.test.ts test/golden/focus-shapes.test.ts";
const HEAT = "src/presentation/plot/heatmap.ts";
const FURN = "src/presentation/plot/furniture.ts";

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
    file: FURN,
    from: '  return tone(layout.focused === true ? "accent" : "muted", ctx.theme, ctx.capabilities);',
    to: '  return tone("muted", ctx.theme, ctx.capabilities);',
    why: "every frame loses its focus ink; a run where this survives is not rendering a focused plot at all",
  },
  mutations: [
    {
      // **The defect, put back.** The matrix's layout without the flag, which
      // is what shipped and what the golden recorded.
      name: "a matrix's layout carries no focus flag",
      file: HEAT,
      from: "  const layout = bare === null ? null : { ...bare, focused: focusedOn(block.id, ctx) };",
      to: "  const layout = bare;",
      expect: "T2.130",
    },
    {
      // The predicate widened to the null form. F802's ruling is that it
      // paints nothing; a row asserting only that focus *does* something
      // passes this, and the control in T2.130 is what does not.
      name: "the null focus form paints too",
      file: FURN,
      from: "  return focus !== null && focus.blockId === id && focus.rowId === id;",
      to: "  return focus !== null && focus.blockId === id;",
      expect: "T2.130",
    },
    {
      // The ink on the scale rather than the enclosure — the remedy that was
      // tried first. It produces a difference, so every row asserting *the
      // frames differ* passes; only reading the runs tells the two apart.
      name: "the legend and the captions take the focus ink",
      file: HEAT,
      from: "  const muted = tone(\"muted\", ctx.theme, ctx.capabilities);",
      to: "  const muted = layout.focused === true ? tone(\"accent\", ctx.theme, ctx.capabilities) : tone(\"muted\", ctx.theme, ctx.capabilities);",
      expect: "compositions",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
