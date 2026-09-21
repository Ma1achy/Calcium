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
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONTRAST = "src/presentation/theme/contrast.ts";
// **Re-pointed at `tokens.generated.ts` 2026-09-21, because the file this named
// stopped being the subject.** `tokens-dark.ts`, `tokens-light.ts` and
// `tokens-high-contrast.ts` were the shipped themes; since M2 the shipped set is
// the registry's projection and those three are a frozen oracle and a lender of
// palettes the registry does not carry. Mutating one changes nothing any row
// measures — **the control went blind and the harness said so**, which is the
// one failure mode a mutation report cannot show you, because an uncaught live
// mutant and a blind harness produce the same clean page.
const DARK = "src/presentation/theme/tokens.generated.ts";
const FOURBIT = "src/presentation/theme/four-bit.ts";

// **`test/edge/status.test.ts` is in the set because T3.46 is where the pair is
// read off a frame.** The two theme suites check the pair as *values*; only the
// rendered row can say the 4-bit arm reaches the tag, and a mutation run against
// a suite that cannot see its subject reports a survivor about the tests.
const FILES = "test/contract/theme.test.ts test/unit/theme.test.ts test/edge/status.test.ts";

// **Atomic, per F237** — a kill mid-write leaves a prefix, and `runPass` restores
// with whatever `write` it is handed. 90 runs still roll their own pair.
const { read, write } = fsIo(ROOT);
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
    from: '      "errorGround": "#c62828",',
    to: '      "errorGround": "#ffeeee",',
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
      // **C10 I32's equality half, inverted — and the inversion is the point.**
      // This drifted `errorGround` off `tone.error` by one shade, because the
      // equality was the rule and drifting was the defect that survived five
      // rounds of adjusting values by eye. R-THM-001 splits the two, so drifting
      // is now correct and a mutation that does it would survive: `#b71c1c`
      // holds white at over 4.5 and nothing should object.
      //
      // What replaced the equality is a **count** — two themes of ten have the
      // ground and the tone equal, as a consequence of a loud palette rather
      // than as a rule. So the mutation is the equality coming back: put
      // `dark`'s ground on its own tone and three themes have it, which is the
      // rule re-forming out of a coincidence and is exactly what T2.14e watches.
      name: "the tag's ground is welded back onto `tone.error`",
      file: DARK,
      from: '      "errorGround": "#c62828",',
      to: '      "errorGround": "#f05a5a",',
      expect: "T2.14e",
    },
    {
      // **The 4-bit rung, which shipped without one** (F240). The pair resolves
      // to `NO_STYLE` at depth 4, so the tag draws with no styling at all inside
      // a red box — the one unmarked run, inverting §3a's own claim. The row
      // that catches it has to read a frame: `FourBitMap` is partial over an
      // open key, so no value assertion can ask whether a slot has an answer.
      name: "the 4-bit arm goes back to being absent",
      file: FOURBIT,
      from: 'not a measurement.\n  "surface.errorGround": 9,\n  "surface.errorInk": 0,',
      to: "not a measurement.",
      expect: "T3.46",
    },
    {
      // **Half the pair, which is the shape the whole row exists for.** A ground
      // with no ink is a foreground nothing measured against it — C10 I21 read
      // from the other direction — and it is the direction an author adding an
      // arm is most likely to take, because the ground is the visible half.
      name: "the 4-bit ground arrives without its ink",
      file: FOURBIT,
      from: 'not a measurement.\n  "surface.errorGround": 9,\n  "surface.errorInk": 0,',
      to: 'not a measurement.\n  "surface.errorGround": 9,',
      expect: "T3.46",
    },
    {
      // **The exception put back**, which is the state before R-THM-001. It
      // reversed direction when the exception was retired: the mutation used to
      // be *the floor goes back to 4.5*, restoring the pre-§4d default, and 4.5
      // is now what ships. So what has to be shown is that the old 2.5 would be
      // caught if someone reinstated it — a lowered floor forbids nothing and
      // reads exactly like one that is satisfied (A03 §2).
      name: "the `error` floor is lowered to 2.5 again",
      file: CONTRAST,
      from: "  comment: 3,",
      to: "  comment: 3,\n  error: 2.5,",
      expect: "T1.7",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
