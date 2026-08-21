// C12 I55, §3ag — a value and a name share one anchor, and only one of them
// answers the legend's question.
//
// **Three of these are about the *partition* rather than the placement.** The
// arms are easy to get green — the load-bearing claims are that `"last"` is on
// the other side of the legend rule from `"name"`, that the two new values reach
// C04 I60's refusals, and that the gutter is sized from the string it is filled
// with rather than from a second computation of it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DEF = "src/presentation/plot/definition.ts";
const FURN = "src/presentation/plot/furniture.ts";
const VAL = "src/data/viewmodel/validate.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(
      "npx vitest run test/unit/plot-y-axis.test.ts test/contract/view-model.test.ts 2>&1",
      { cwd: ROOT, encoding: "utf8", timeout: 300_000 },
    );
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
    from: "  return block.yCallout === \"both\" && !stacked ? `${name} ${value}` : value;",
    to: "  return value;",
    why:
      "every new arm collapsed onto the old one: a run that cannot see `both` stop writing a " +
      "name can see none of the rows below it",
  },
  mutations: [
    {
      // **The suppression widened to every drawing arm**, which is C12 I48's
      // sentence read as excluding rather than selecting: a callout naming a
      // *value* does not answer the legend's question and never did.
      name: "`last` suppresses the legend too",
      file: FURN,
      from: '  if (block.yCallout === "name" || block.yCallout === "both") return null;',
      to: '  if (block.yCallout !== undefined && block.yCallout !== "none") return null;',
      expect: "TL3",
    },
    {
      // The suppression removed entirely — the arm reverts to C12 I48's
      // unqualified reading and the identity is drawn twice.
      name: "a name at the line's end does not suppress the legend",
      file: FURN,
      from: '  if (block.yCallout === "name" || block.yCallout === "both") return null;',
      to: "",
      expect: "TL3",
    },
    {
      // **C04 I60's refusals, still gated on the one value that used to be the
      // only one.** This is the narrow-check class the file records twice
      // already — `form === "heatmap"` and `yc !== "last"` — and it is silent on
      // every fixture that does not use the new arms on a bad form.
      name: "the refusals still gate on `last` alone",
      file: VAL,
      from: "  if (!DRAWS.has(yc as string)) return;",
      to: '  if (yc !== "last") return;',
      expect: "TL4",
    },
    {
      // The gutter sized from a second computation: `"name"` measured as a
      // value, so the column is as wide as the number and the name is cut to it.
      name: "the width is measured from the value whatever the arm says",
      file: DEF,
      from: "    const text = calloutTextFor(block, s, i, stacked);",
      to: "    const v = lastFinite(s.values);\n    const text = v === null ? null : formatReadout(v, block.yFormat);",
      expect: "TL2",
    },
    {
      // A series with no label falls back to nothing rather than to the
      // legend's own wording, so two unlabelled series are told apart by colour
      // alone — C12 I25, in the gutter instead of in the swatch.
      name: "an unlabelled series gets an empty name",
      file: DEF,
      from: "  const name = s.label ?? `series ${String(index + 1)}`;",
      to: '  const name = s.label ?? "";',
      expect: "TL5",
    },
    {
      // **The frame's own finding, kept falsifiable.** Below the colour floor
      // the strips are labelled and C12 I47 mirrors those labels right, so a
      // name callout is the third copy of one word on one row. No count and no
      // width assertion sees it.
      name: "a name is written even where the strips are labelled",
      file: DEF,
      from: '  if (block.yCallout === "name") return stacked ? null : name;',
      to: '  if (block.yCallout === "name") return name;',
      expect: "TL6",
    },
    {
      // The other half: `both` keeps its name at one bit rather than degrading
      // to the value the strips do not carry.
      name: "`both` keeps its name below the colour floor",
      file: DEF,
      from: '  return block.yCallout === "both" && !stacked ? `${name} ${value}` : value;',
      to: '  return block.yCallout === "both" ? `${name} ${value}` : value;',
      expect: "TL6",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
