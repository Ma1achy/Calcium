// C09 I107 — the ASCII rung is taken whole, mutated.
//
// **The subject is one expression and the run exists because three rows look
// like they cover it.** `spinnerFrames` answers `set.ascii` or `set.frames` and
// composes nothing, which is §032's rule 1 second clause: *if any primary frame
// is not exactly one cell, the WHOLE set takes its semantic ASCII fallback —
// never frame by frame.*
//
// `T2.70` asserts the returned frames are one cell, which a per-frame
// substitution satisfies exactly because the substitutes are one cell too.
// `T2.74` and `T3.45` assert whole-array equality and both name `boxBounce`,
// whose four frames are all Ambiguous — so on that set the two mechanisms
// return the same array. Measured before this run was written: under mutation 1
// every row in `spinners.test.ts` and all 23 in `status.test.ts` stay green
// except `T2.169`.
//
// **Both files are in `CMD` for that reason** — a run that took the contract
// file alone could not show that the edge file's rows are blind too.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/spinners.test.ts test/edge/status.test.ts";
const G = "src/presentation/blocks/glyphs.ts";

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
    file: G,
    // The arm removed entirely: a narrow-only set keeps its Unicode frames on a
    // wide terminal. This is C02 I9's own defect and `T2.74` holds it, so a run
    // where it survives is not exercising the degradation path at all.
    from: '  return set.narrowOnly === true && caps.ambiguousWidth === "wide" ? set.ascii : set.frames;',
    to: "  return set.frames;",
    why: "with the wide arm gone a narrow-only set keeps its Unicode frames; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **THE DEFECT the invariant is written against.** Each frame that does
      // not measure one cell is swapped for its ASCII counterpart and the rest
      // stay — so `agent` returns 76 Unicode bloom frames and six ASCII ones,
      // an animation that changes alphabet mid-cycle. Arithmetically it is
      // right about every width, which is why `T2.70` cannot see it.
      name: "THE DEFECT: the fallback is taken frame by frame rather than per set",
      file: G,
      from: '  return set.narrowOnly === true && caps.ambiguousWidth === "wide" ? set.ascii : set.frames;',
      to: '  if (set.narrowOnly === true && caps.ambiguousWidth === "wide") {\n    return set.frames.map((f, i) => (cells(f, "wide") === 1 ? f : set.ascii[i % set.ascii.length] ?? f));\n  }\n  return set.frames;',
      expect: "T2.169",
    },
    {
      // The other end of the same rule: a mixture made by length rather than by
      // width. The head of the Unicode alphabet with the tail of the ASCII one
      // is every frame one cell on the narrow convention and is neither
      // alphabet whole.
      name: "the two alphabets are spliced rather than chosen between",
      file: G,
      from: '  return set.narrowOnly === true && caps.ambiguousWidth === "wide" ? set.ascii : set.frames;',
      to: '  return set.narrowOnly === true && caps.ambiguousWidth === "wide"\n    ? [...set.ascii.slice(0, 1), ...set.frames.slice(1)]\n    : set.frames;',
      expect: "T2.169",
    },
    {
      // **And the fixture itself**, because the row's power rests on three sets
      // holding frames of both widths. Making `bloom` uniform by dropping its
      // one two-cell frame would leave the assertion above green and vacuous on
      // that member — so the count is asserted and the mutation says so.
      name: "the mixed fixture goes uniform — `bloom`'s one Ambiguous frame `⋅` replaced",
      file: G,
      from: '    frames: Object.freeze(["⋅", "✧", "✦", "✢", "✻", "✾", "❀", "✿", "❀", "✾", "✻", "✢", "✦", "✧"]),',
      to: '    frames: Object.freeze(["✧", "✧", "✦", "✢", "✻", "✾", "❀", "✿", "❀", "✾", "✻", "✢", "✦", "✧"]),',
      expect: "T2.169",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
