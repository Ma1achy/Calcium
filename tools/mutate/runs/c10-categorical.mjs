// Roadmap 51 — the categorical palette, mutated.
//
// **The first mutation is the defect that shipped**, restored exactly: a cycle
// over judgement tones. It renders, every geometry assertion holds, and the
// golden frames it produces are the ones this change replaced.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/categorical.test.ts";
const PLOT = "src/presentation/plot/definition.ts";
const VALID = "src/data/viewmodel/validate.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

// **One mutation was written and withdrawn, and the withdrawal is the finding.**
// `carries: "decoration"` → `"meaning"` survived, and the row it was aimed at
// was right: a meaning palette with no `classes` resolves through
// `MONO["normal"]`, which is `NO_STYLE`, exactly as a decoration palette
// collapses to the foreground. **The two are indistinguishable at every depth
// in this suite**, so the mutation had nothing to be caught by and scoring it
// would have been A03 §2's vacuity dressed as coverage. The distinction is real
// elsewhere — `validatePaintedFloors` skips decoration palettes — and that is a
// theme-validation property rather than a plot one.
const MUTATIONS = [
  {
    // **Two slots given one 4-bit index**, which is where nothing was guarding.
    // The 24-bit version of this mutation cannot be written: C10 already
    // refuses two slots of one palette rendering as one another, at theme load
    // — *"c5" and "c1" are both #e69f00* — so the palette's central promise had
    // a keeper before this change and T2.60 is a second expression of it. The
    // curated 16-colour map had none.
    name: "two categorical slots take one 4-bit index",
    file: "src/presentation/theme/four-bit.ts",
    from: '  "categorical.c5": 12,',
    to: '  "categorical.c5": 3,',
    expect: "T2.61",
  },
  {
    // The cap removed at the validator. `b.plot` still throws, so a row that
    // checked one gate would pass.
    name: "the validator does not refuse a ninth series",
    file: VALID,
    from: '      if (b["series"].length > CATEGORY_LIMIT) {',
    to: "      if (false) {",
    expect: "T2.63",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: PLOT,
    from: "  if (series.tone !== undefined) return `tone.${series.tone}`;\n  return CATEGORY_REFS[index] ?? \"categorical.c1\";",
    to: '  if (series.tone !== undefined) return `tone.${series.tone}`;\n  return "categorical.c1";',
    why:
      "every series takes the first slot — if this survives, nothing asserts that the palette " +
      "distinguishes anything and the rows below are unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
