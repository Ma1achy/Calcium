// The ramps, mutated — C12 I16, and the arm nothing was looking at.
//
// **The defect restored here shipped, and every assertion in the suite passed
// against it.** `RAMP_BRAILLE` began at `U+2800` — BRAILLE PATTERN BLANK — so a
// sparkline at `ambiguousWidth: "wide"` drew its *minimum* as whitespace, which
// the right-anchor already uses to mean *fewer samples than cells*. `cells()`
// counts it as one, so every width row was satisfied; `toHaveLength` counts it,
// so every length row was; and no golden frame rendered the wide arm at all.
//
// So the rows are indexed by **what a reader could not tell apart**, not by what
// a function returns: a step equal to the pad, a step repeated, a ramp of the
// wrong length, and the ink running non-monotone. Each is a different pair of
// cells that collapse into one picture.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot.test.ts test/contract/ambiguous-width.test.ts";
const RAMP = "src/presentation/plot/ramp.ts";

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
    file: RAMP,
    from: 'export const RAMP_BRAILLE = "\\u2840\\u28c0\\u28c4\\u28e4\\u28e6\\u28f6\\u28f7\\u28ff";',
    to: 'export const RAMP_BRAILLE = "";',
    why: "an empty ramp has no steps at all; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **THE DEFECT, restored exactly.** The set that shipped: step 0 is the
      // blank braille pattern, so the lowest reading and the padding are one
      // picture. It also skips a dot population — 0,1,2,3,4,5,6,8 — so the last
      // step is a double jump, which is the second thing T1.15 refuses.
      name: "THE DEFECT: the braille ramp starts at U+2800, so the minimum draws as padding",
      file: RAMP,
      from: 'export const RAMP_BRAILLE = "\\u2840\\u28c0\\u28c4\\u28e4\\u28e6\\u28f6\\u28f7\\u28ff";',
      to: 'export const RAMP_BRAILLE = "\\u2800\\u2804\\u2806\\u2816\\u2836\\u2837\\u283f\\u28ff";',
      expect: "T1.15",
    },
    {
      // The narrower version of the same mistake, and the one a reader would
      // reach for while fixing it: keep the shape, replace only the first step
      // with a space. Every glyph is then "visible" by a naive check and the
      // collision is unchanged.
      name: "the first step is a space rather than a blank braille cell",
      file: RAMP,
      from: 'export const RAMP_BRAILLE = "\\u2840\\u28c0\\u28c4\\u28e4\\u28e6\\u28f6\\u28f7\\u28ff";',
      to: 'export const RAMP_BRAILLE = "\\u0020\\u28c0\\u28c4\\u28e4\\u28e6\\u28f6\\u28f7\\u28ff";',
      expect: "T1.15",
    },
    {
      // A repeated step: eight glyphs, all visible, monotone-looking — and two
      // adjacent magnitudes that a reader cannot distinguish. The row that
      // catches it is the uniqueness one, which no width or length assertion
      // implies.
      name: "two steps are the same glyph, so two magnitudes read alike",
      file: RAMP,
      from: 'export const RAMP_BRAILLE = "\\u2840\\u28c0\\u28c4\\u28e4\\u28e6\\u28f6\\u28f7\\u28ff";',
      to: 'export const RAMP_BRAILLE = "\\u2840\\u28c0\\u28c4\\u28e4\\u28e4\\u28f6\\u28f7\\u28ff";',
      expect: "T1.15",
    },
    {
      // **The step count, which is load-bearing rather than tidy.** A value
      // normalised into [0,1] indexes one of `RAMP_STEPS`, so a seven-glyph ramp
      // silently loses its top step through `ramp[step] ?? " "` — the maximum
      // draws as a space, which is the shipped defect arriving at the other end
      // of the scale.
      name: "the braille ramp has seven steps, so the maximum falls off it",
      file: RAMP,
      from: 'export const RAMP_BRAILLE = "\\u2840\\u28c0\\u28c4\\u28e4\\u28e6\\u28f6\\u28f7\\u28ff";',
      to: 'export const RAMP_BRAILLE = "\\u2840\\u28c0\\u28c4\\u28e4\\u28e6\\u28f6\\u28f7";',
      expect: "T1.15",
    },
    {
      // The ASCII ramp's first step, because C12 I16 is about every ramp and not
      // about the one that failed. `.` is the lowest ink ASCII has; a space
      // there reproduces the same collision on a terminal that never sees
      // braille at all.
      name: "the ASCII ramp starts at a space",
      file: RAMP,
      from: 'export const RAMP_ASCII = ".:-=+*#@";',
      to: 'export const RAMP_ASCII = " :-=+*#@";',
      expect: "T1.15",
    },
    {
      // **The selection, not the sets.** With the wide arm pointed back at the
      // block ramp the glyphs are all correct and all two cells wide, which is
      // the defect `ambiguousWidth` was introduced to fix — kept here because
      // the ramps and the choice between them fail independently.
      name: "the wide arm takes the block ramp again",
      file: RAMP,
      // Re-anchored onto `LADDERS.height` after `ladderFor` replaced `rampFor`,
      // and it was stale for a commit unseen — a single-quoted anchor, which is
      // the 108-of-465 blind spot F173 records. Re-run, not re-anchored and
      // trusted.
      from: "      : caps.ambiguousWidth === \"wide\"\n        ? HEIGHT_BRAILLE\n        : HEIGHT_UNICODE,",
      to: "      : HEIGHT_UNICODE,",
      expect: "T2.53",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
