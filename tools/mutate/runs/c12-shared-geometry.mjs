// C12 §3aj — the shared-geometry split, and the case the corpus cannot construct.
//
// **This run exists because the gate passed against a broken refactor** (F256).
// §3aj reads *zero golden frames change*; moving the flat-line answer into the
// normalised layer changes it at every even row count, and **0 golden frames and
// 0 of 1780 catalogue frames moved** — measured by counting the branch, which is
// never taken by either corpus.
//
// So these mutations are aimed at the split itself rather than at a picture, and
// the killer is a unit row rather than a golden. A run whose mutations are all
// caught by goldens would be re-measuring what the goldens already cover.
//
// **A third row was written and removed rather than declared an expected
// survivor.** *`rowOf` normalises for itself again* leaves every frame
// byte-identical by construction, so nothing can catch it — and a permanently
// surviving row turns this pass's one-bit signal off for good. A survivor has
// three dispositions and *expected* is not one of them; the structural
// commitment is prose in §3aj, where it can be read.
//
// Anchors checked for uniqueness before the pass (F219), atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SCALE = "src/presentation/plot/scale.ts";
// **The shared coordinate lives in L0**, where `cells()` is not reachable — that
// is §3aj hazard 4's seam, structural rather than asserted.
const SHARED = "src/data/viewmodel/range.ts";

// **The goldens are in the file list on purpose.** They cannot catch the flat
// line — that is the finding — and their presence is what makes each row's
// `expect` a claim about *which* instrument caught it.
const FILES = "test/unit/plot-shared-geometry.test.ts test/golden/plots.test.ts";

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
    file: SHARED,
    from: "  return invert ? 1 - clamped : clamped;",
    to: "  return clamped;",
    why: "the vertical facing ignored — every `origin` that flips the ordinate draws upside down",
  },
  mutations: [
    {
      // **Hazard 1, exactly as §3aj states it.** The rounding stage moves and
      // the flat line lands one cell off at every even height. **No frame in
      // either corpus catches this**, which is why the run is here.
      name: "the flat-line answer moves into the normalised layer",
      file: SCALE,
      from: "  if (range.max === range.min) return Math.floor(last / 2);",
      to: "  if (range.max === range.min) return Math.round(0.5 * last);",
      expect: "G0",
    },
    {
      // **The clamp moved to the renderer.** A normalised coordinate outside
      // `[0, 1]` makes the rasteriser responsible for C04 I29, which it has no
      // way to know — and in cells `Math.round` hides it inside the grid at
      // most heights.
      name: "the shared layer emits an unclamped coordinate",
      file: SHARED,
      from: "  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;",
      to: "  const clamped = t;",
      expect: "G2",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
