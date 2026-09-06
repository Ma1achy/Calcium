// C12's callout row, mutated (I114, §3ak.50).
//
// **Every one of these mutations restores a frame that was inside its own
// `viewBox`**, which is why the sibling run's rows cannot see them. `RM1` asks
// whether a string is on the page; ten pairs of strings were on the page and on
// top of each other — `99.12` over `100` reading as `90012`, `e` over `0` — and
// `RM1` agreed with all ten for as long as they existed. **Containment is not
// correctness**, measured.
//
// **The run was written after the pass, not before it, and two of its
// predictions were wrong.** Both are kept as comments on the rows they belong
// to, because a mutation file that records only what it expected is a second
// copy of the spec rather than a measurement:
//
//   - inverting the side was expected to leave `RC1` standing (the right column
//     would be clean by having lost the wrong glyph). It does not: the right
//     label survives *and* the callout still lands on it, so `RC1` dies too.
//   - widening the threshold four times was expected to kill `RC3` outright. It
//     killed nothing, because at `height: 8` the right column's pitch is
//     137.6 px and four glyph heights reach no neighbour. `RC3` gained a second
//     fixture at `height: 40` — pitch 15.29 px — from that survival. The
//     mutation pass indicted the fixture rather than the rule.
//
// **The control is `<` widened to `<=`** rather than the mechanism deleted. The
// corpus's closest *contended* pair is 2.415 px and its closest *uncontested*
// pair 15.29 px, so a boundary that moves by nothing is a change to the rule
// that the corpus genuinely cannot see — which is what a control has to be.
// `< 0` was tried first and is not one: it kills four rows.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-svg-path.test.ts";
const SVG = "src/presentation/plot/svg.ts";

const GUARD = '        if (side === "right" && calloutRows.some((r) => Math.abs(r - y) < SVG_FONT_SIZE)) continue;\n';

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
    file: SVG,
    from: "Math.abs(r - y) < SVG_FONT_SIZE)",
    to: "Math.abs(r - y) <= SVG_FONT_SIZE)",
    why: "the boundary moves by nothing the corpus contains — contended pairs sit at 2.415 px and uncontested ones at 15.29",
  },
  mutations: [
    {
      // **THE DEFECT, restored exactly**: what shipped, and what six committed
      // frames recorded. RM1 survives this, which is the finding.
      name: "THE DEFECT: the callout displaces nothing, so it is written over the label on its row",
      file: SVG,
      from: GUARD,
      to: "",
      expect: "RC1",
    },
    {
      // Over-suppression. A rule that deletes the whole right column has no
      // overprint in it, so RC1 accepts it and only the set assertion does not.
      name: "the row is four glyph heights, so labels that were never contended are suppressed",
      file: SVG,
      from: "Math.abs(r - y) < SVG_FONT_SIZE)",
      to: "Math.abs(r - y) < SVG_FONT_SIZE * 4)",
      expect: "RC3",
    },
    {
      // C12 I48's *never the left's*, inverted. The reading is lost on the one row
      // where `yAxis: "both"` gave it two chances to survive.
      name: "the left label is the one displaced, which is the clause C12 I48 wrote to forbid",
      file: SVG,
      from: 'if (side === "right" && calloutRows.some',
      to: 'if (side === "left" && calloutRows.some',
      expect: "RC2",
    },
    {
      // **What the decision leaves behind.** One line up, the `continue` takes
      // the tick's gridline with the label — the figure loses a rule and every
      // collision assertion agrees, because no text moved.
      name: "the suppression is written above the gridline, so a displaced label takes its rule with it",
      file: SVG,
      from: "      const y = box.top + (box.bottom - box.top) * normalisedOf(tick, range, true);\n      if (gridded) {",
      to: "      const y = box.top + (box.bottom - box.top) * normalisedOf(tick, range, true);\n"
        + "      if (calloutRows.some((r) => Math.abs(r - y) < SVG_FONT_SIZE)) continue;\n      if (gridded) {",
      expect: "RC4",
    },
    {
      // **The wiring, not the mechanism.** The guard is untouched and correct;
      // the collector it reads is never filled, because the walk was handed a
      // different array. This is the failure mode that a shared pure function
      // would not have — and the cost of the row being ink (§3ak.50b).
      name: "the walk fills an array nobody reads, so the emitter displaces nothing",
      file: SVG,
      from: "  const body = marks(block, figure, layout, theme, calloutRows);",
      to: "  const body = marks(block, figure, layout, theme, []);",
      expect: "RC5",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
