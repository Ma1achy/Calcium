// C12 I133 — the raster's length is `Math.hypot`'s to the bit, without the
// builtin. Mutated.
//
// **The replica is verified by the builtin**, over a corpus neither author
// chose, and each statement of V8's algorithm is load-bearing somewhere in
// that corpus: the Kahan compensation in the last bit of an ordinary tuple,
// the normalisation by the largest at the top of the exponent range where a
// naive sum overflows, the order of the early returns at `(Infinity, NaN)`.
// T1.145 is the row that sees all three; the mesh goldens see any of them
// that reaches a frame.
//
// **The index loop is not mutated here.** Putting `for…of` back over the
// frozen triangle array fails nothing — the iterator result is a cost the
// goldens and the counting probes cannot see, and the paired bench is what
// holds it. T6.109 records that survivor in the spec rather than this file
// teaching its reader to skim a survivors column.
//
// **The control drops the scale-back**: `hypot3` returns the root of the
// normalised sum without multiplying by the largest, so every length is at
// most `√3`, T1.145 fails on its first ordinary tuple, and every lit mesh
// golden moves.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-3d.test.ts test/golden/plot-meshes.test.ts";
const P3 = "src/presentation/plot/project3.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

// The three-argument body from the first normalised value to the return —
// anchored whole, because the three unrolled steps are the same text and
// `hypot2` repeats two of them.
const BODY3 =
  "  let n = aa / max;\n" +
  "  let summand = n * n - compensation;\n" +
  "  let preliminary = sum + summand;\n" +
  "  compensation = preliminary - sum - summand;\n" +
  "  sum = preliminary;\n" +
  "  n = ab / max;\n" +
  "  summand = n * n - compensation;\n" +
  "  preliminary = sum + summand;\n" +
  "  compensation = preliminary - sum - summand;\n" +
  "  sum = preliminary;\n" +
  "  n = ac / max;\n" +
  "  summand = n * n - compensation;\n" +
  "  preliminary = sum + summand;\n" +
  "  compensation = preliminary - sum - summand;\n" +
  "  sum = preliminary;\n" +
  "  return Math.sqrt(sum) * max;\n";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: P3,
    from: BODY3,
    to: BODY3.replace("  return Math.sqrt(sum) * max;\n", "  return Math.sqrt(sum);\n"),
    why: "every three-argument length is at most √3; T1.145 fails on the first ordinary tuple and every lit mesh golden moves",
  },
  mutations: [
    {
      // **The compensation dropped**: a plain sum of the normalised squares.
      // Right to a few ulps and wrong in the last bit on a share of ordinary
      // tuples, which is the difference between close and equal.
      name: "KAHAN-DROPPED: the normalised squares are summed without compensation",
      file: P3,
      from: BODY3,
      to:
        "  let n = aa / max;\n" +
        "  sum = n * n + compensation;\n" +
        "  n = ab / max;\n" +
        "  sum += n * n + compensation;\n" +
        "  n = ac / max;\n" +
        "  sum += n * n + compensation;\n" +
        "  return Math.sqrt(sum) * max;\n",
      expect: "T1.145",
    },
    {
      // **The normalisation dropped**: squares of the raw values, Kahan-summed,
      // rooted. Equal to the builtin for most of the range and `Infinity`
      // at `1e308`, where the builtin is finite.
      name: "NORMALISE-DROPPED: the squares are of the values rather than the values over the largest",
      file: P3,
      from: BODY3,
      to: BODY3.replaceAll(" / max;", ";").replace("  return Math.sqrt(sum) * max;\n", "  return Math.sqrt(sum);\n"),
      expect: "T1.145",
    },
    {
      // **`NaN` answered before `Infinity`**: `(Infinity, NaN)` reads `NaN`
      // where the builtin reads `Infinity`.
      name: "INF-NAN-SWAPPED: the NaN return precedes the Infinity return",
      file: P3,
      from: "  if (max === Infinity) return Infinity;\n  if (aa !== aa || ab !== ab || ac !== ac) return NaN;",
      to: "  if (aa !== aa || ab !== ab || ac !== ac) return NaN;\n  if (max === Infinity) return Infinity;",
      expect: "T1.145",
    },
    {
      // The two-argument form's own order, because the mutation above reaches
      // only `hypot3` and the corpus enumerates the pair table separately.
      name: "INF-NAN-SWAPPED-2: hypot2's NaN return precedes its Infinity return",
      file: P3,
      from: "  if (max === Infinity) return Infinity;\n  if (aa !== aa || ab !== ab) return NaN;",
      to: "  if (aa !== aa || ab !== ab) return NaN;\n  if (max === Infinity) return Infinity;",
      expect: "T1.145",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
