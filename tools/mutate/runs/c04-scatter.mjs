// C04 I138 — scatter lights one cell per frame, every cell once per pass, in a
// deterministic permutation drawn afresh per pass. Mutated (C04 T6.103).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/ramp-registry.test.ts";
const RAMP = "src/presentation/blocks/ramp.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: RAMP,
    from: "      return scatterRank(i, span, Math.floor(k / period)) === step ? 1 : 0;",
    to: "      return scatterRank(i, span, Math.floor(k / period)) === step + 1 ? 1 : 0;",
    why: "every place shifted one tick late — rank 0 never lights, so a pass no longer covers every cell",
  },
  mutations: [
    {
      // **The shipped form**: a place per cell, hashed independently — not a
      // permutation, so two cells meet on one tick at n = 5.
      name: "HASHED-PLACES: each cell's place hashed into [0, n + 3) (T6.103)",
      file: RAMP,
      from: "      if (step >= span) return 0;\n      return scatterRank(i, span, Math.floor(k / period)) === step ? 1 : 0;",
      to: "      return Math.floor(hash01(i, 0) * period) === step ? 1 : 0;",
      expect: "T2.117j",
    },
    {
      // **One fixed order**: a permutation, but the same every pass — learned.
      name: "FIXED-ORDER: the pass dropped from the hash (T6.103)",
      file: RAMP,
      from: "      return scatterRank(i, span, Math.floor(k / period)) === step ? 1 : 0;",
      to: "      return scatterRank(i, span, 0) === step ? 1 : 0;",
      expect: "T2.117j",
    },
    {
      // **The key stops being injective**, which is what the permutation rests
      // on now there is no tiebreak. A first draft mutated the tiebreak instead
      // and survived: `hash01` is a bijection on the cell for a fixed pass, so
      // the arm could never fire and the mutation was the equivalent program.
      // Halving the cell before it is hashed puts two cells on every key.
      name: "NOT-INJECTIVE: two cells share each key",
      file: RAMP,
      from: "  let h = (Math.imul(a | 0, 0x27d4eb2d)",
      to: "  let h = (Math.imul((a >> 1) | 0, 0x27d4eb2d)",
      expect: "T2.117j",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
