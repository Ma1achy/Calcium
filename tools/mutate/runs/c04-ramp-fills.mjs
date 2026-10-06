// The fill axis, mutated — the fold, the projection and the census's channel.
//
// **The defect this covers passed an equality assertion for as long as it
// existed.** `ramp-registry.test.ts` compared `RAMP_FILLS` against a literal
// three, under a comment reading *`centre` and `linear` are both `gradient`* —
// a sentence that is true about the family and silent about the sampling. So
// the registry's `gradient-centre` had nowhere to land, *brightest in the
// middle* was a picture nothing in the tree could draw, and the row that exists
// to catch a divergence in either direction agreed with the tree.
//
// The mutations are the three ways that can happen again: the fold removed so
// `centred` is `gradient` under another name, the projection turned back into a
// count, and the census's mask keyed on `fg` alone — which is how the 1-bit rung
// drew as unstyled while reading as a frame that confirmed R-MOT-012.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/ramp-registry.test.ts test/unit/spans.test.ts test/golden/design-surfaces.test.ts";
const RAMP = "src/presentation/theme/ramp.ts";
const TYPES = "src/data/viewmodel/types.ts";
const SUPPORT = "test/support/design-surfaces.ts";

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
    file: TYPES,
    from: 'export const RAMP_FILLS: readonly RampFill[] = Object.freeze(["gradient", "centred", "step", "palette"]);',
    to: 'export const RAMP_FILLS: readonly RampFill[] = Object.freeze(["gradient", "centred", "step"]);',
    why: "the fill list loses a member; a run where this survives is not reading the registry's projection at all",
  },
  mutations: [
    {
      // **The defect, put back.** `centred` still a value, still validated,
      // still in every list — and drawing a linear gradient. Every assertion
      // about names and arity passes; only a row that reads the picture fails.
      name: "`centred` does not fold — it is `gradient` under a second name",
      file: RAMP,
      from: '    ramp.fill === "centred" ? 1 - Math.abs(2 * t - 1)',
      to: '    ramp.fill === "centred" ? t',
      expect: "T2.117h",
    },
    {
      // **The fold pointed at the wrong arm.** `centred` quantised and `step`
      // folded — each fill still shaping `t`, so nothing is flat and no bound
      // is exceeded; the two pictures are simply exchanged. A row asserting
      // *`centred` differs from `gradient`* passes this, because it still does.
      //
      // This replaces a mutation that survived, and the survivor was a finding
      // about the code: the first draft ran the fold into `stepOf`, which reads
      // as an order and is unobservable, because the two arms are exclusive by
      // the gate — `bands` rides on `step` alone. The expression is a chain now
      // and this mutation is one the chain can be wrong about.
      name: "`centred` quantises and `step` folds — the two arms exchanged",
      file: RAMP,
      from: '    ramp.fill === "centred" ? 1 - Math.abs(2 * t - 1)\n    : ramp.fill === "step" ? stepOf(t, ramp.bands ?? 2)',
      to: '    ramp.fill === "step" ? 1 - Math.abs(2 * t - 1)\n    : ramp.fill === "centred" ? stepOf(t, ramp.bands ?? 2)',
      expect: "T2.117h",
    },
    {
      // The census's mask keyed on the foreground alone. At one bit the answer
      // is `from`'s class and not a colour, so the whole bottom rung draws as
      // unstyled — and the snapshot still reads as a frame that confirms
      // R-MOT-012, which is exactly what the first draft did.
      name: "the ink census reads the foreground and not its attributes",
      file: SUPPORT,
      from: '      const key = `${c.style.fg}/${[...c.style.attrs].sort((x, y) => x - y).join(",")}`;',
      to: "      const key = `${c.style.fg}/`;",
      expect: "design-surfaces",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
