// C10 I32, §4d — the error tag's pair, and the floor lowered to buy it.
//
// **The pair is the subject, so the mutations attack the pairing rather than
// either colour.** A ground shipped without its matched ink is how a contrast
// floor goes unmeasured, and the shape that hides it is a check that reads its
// value from the wrong place and `continue`s when it finds nothing — which is
// exactly how `validateErrorTag` was first written, folded into
// `validateDiffSurfaces`, reading foregrounds from `tokens.palettes` where this
// one lives in `surfaces`. A skipped pair passes like a satisfied one (A03 §2).
//
// **And the equality row, because two hex literals in two files drifted for five
// rounds.** No assertion about either colour could see it: a red is correct on
// its own and wrong beside another. `tone.error` *is* the ground, by equality,
// and the mutation that separates them is the defect as it stood.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONTRAST = "src/presentation/theme/contrast.ts";
const DARK = "src/presentation/theme/tokens-dark.ts";

const FILES = "test/contract/theme.test.ts test/unit/theme.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
    });
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
    file: DARK,
    from: '    errorGround: "#c62828",',
    to: '    errorGround: "#ffeeee",',
    why: "white on near-white is 1.1 : 1, so the tag's own 4.5 check and the equality row both go",
  },
  mutations: [
    {
      // **The check that cannot fire.** With the loop skipped the pair ships
      // unmeasured, which is the state a ground without its ink always reaches:
      // both halves look authored and neither was compared to the other.
      name: "the tag's pair is never measured",
      file: CONTRAST,
      from: "    if (measured >= DEFAULT_FLOOR) continue;",
      to: "    if (true) continue;",
      expect: "T2.14f",
    },
    {
      // **The pairing read from the wrong place**, which is how it was first
      // written. `errorGround` resolves and the ink does not, so the pair is
      // empty and every row about it passes on nothing.
      name: "the ground is read and the ink is not",
      file: CONTRAST,
      from: "  const ground = tokens.surfaces.errorGround;",
      to: "  const ground = tokens.surfaces.bgDeep;",
      expect: "T2.14f",
    },
    {
      // C10 I32's equality half. One literal moves and the frame is two reds —
      // the defect that survived five rounds of adjusting values by eye.
      name: "the tag's ground drifts from `tone.error`",
      file: DARK,
      from: '    errorGround: "#c62828",',
      to: '    errorGround: "#b71c1c",',
      expect: "T2.14e",
    },
    {
      // **The floor put back to the default**, which is the state before §4d.
      // It is not a defect being restored — it is the exception removed, and the
      // row exists so the shipped red is measured against the number that
      // rejects it rather than against a comment saying it was lowered.
      name: "the `error` floor goes back to 4.5",
      file: CONTRAST,
      from: "  error: 2.5,",
      to: "  error: 4.5,",
      expect: "T2.4",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
