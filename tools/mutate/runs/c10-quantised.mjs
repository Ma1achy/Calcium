// C10 I41 — the shipped quantisations: a table read before the DP, held to the
// computation by T3.73. Mutated.
//
// **The shape this run exists to catch is a table that is read and wrong, or
// right and not read.** A resolver that skips the table computes the same
// answer sixty milliseconds later and every colour row stays green; a key that
// ignores the values serves one theme's picks to another; an entry dropped
// from the generated file is a theme quietly back on the DP; a DP that drifts
// from the table is a shipped constant that is no longer the computation's
// output. Each is a reading T3.73 takes and nothing else does.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/theme.test.ts";
const Q = "src/presentation/theme/quantise.ts";
const TABLE = "src/presentation/theme/quantised.generated.ts";

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

const results = runPass({
  read,
  write,
  run,
  control: {
    file: Q,
    from: "  const out: Record<string, number> = {};\n  for (const { slot, pick } of chosen) out[slot] = pick.index;\n  return Object.freeze(out);",
    to: "  const out: Record<string, number> = {};\n  return Object.freeze(out);",
    why: "the DP answers nothing for every slot — every 8-bit row that reads a pick, and T3.73's equality against the table, go red",
  },
  mutations: [
    {
      // **The table is never read.** Same answer, the DP every time: sixty
      // milliseconds back on the cold load and every colour row green.
      name: "TABLE-SKIPPED: quantiseSet computes whatever the table holds",
      file: Q,
      from: "  return QUANTISED[quantisationKey(slots)] ?? computeQuantisation(slots);",
      to: "  return computeQuantisation(slots);",
      expect: "T3.73",
    },
    {
      // **The key ignores the values.** Two themes with the same slot names read
      // as one set: the table is missed everywhere (its keys carry values), and
      // a table regenerated under this key would serve one theme's picks to the
      // other.
      name: "KEY-BY-NAMES: the key carries the slot names and not their values",
      file: Q,
      from: "  return JSON.stringify(Object.entries(slots).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));",
      to: "  return JSON.stringify(Object.keys(slots).sort());",
      expect: "T3.73",
    },
    {
      // **An entry dropped from the generated file.** The theme it served is
      // back on the DP and nothing but the coverage half notices.
      name: "ENTRY-DROPPED: the light spectrum palette is not in the table",
      file: TABLE,
      from: "  // light.palettes.spectrum\n",
      to: "  // light.palettes.spectrum — dropped\n  \"[]\": Object.freeze({}),\n  // was:\n  // ",
      expect: "T3.73",
    },
    {
      // **The DP drifts from the table.** A widened tie band regroups levels;
      // the shipped constant is no longer the computation's output.
      name: "TIE-WIDENED: the level threshold moves and the table is stale",
      file: Q,
      from: "const TIE = 0.02;",
      to: "const TIE = 0.06;",
      expect: "T3.73",
    },
    {
      // **The hex read back for a neighbouring index.** The negative half
      // reads `quantisedHex` against the cube's own hex for the fresh pick.
      name: "HEX-OFF-BY-ONE: cubeHexOf answers for the next index",
      file: Q,
      from: "  return CUBE.find((entry) => entry.index === index)?.hex ?? null;",
      to: "  return CUBE.find((entry) => entry.index === index + 1)?.hex ?? null;",
      expect: "T3.73",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
