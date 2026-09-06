// C22 I76 — the cursor writer and the render key's seventh axis, mutated.
//
// **`cursorPositions` was read by C12 and written by nothing in `src/` for as
// long as C12 §3s has existed.** The writer is `shell/cursor-positions.ts`; the
// mutations remove it, drop its axis from the render slot, and make it omit
// zero the way `ScrollOffsets` does — the third being the one a reader copying
// the sibling store would write.
//
// Anchors and expectations are Lane D's, each run by hand with the row it names
// on 2026-09-03. `plot-interaction`'s eleven pass under every mutation here —
// measured — which is the point: C12 owns what a cursor draws, not who moves it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/cursor-positions.test.ts test/unit/plot-interaction.test.ts";

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
    file: "src/shell/construct.ts",
    from: "    stores.cursorPositions.set(found.entryId, plot.id, next);",
    to: "    void next;",
    why: "the writer removed — T4.17h–j, T4.17p and T4.18f fail; a run in which the store can lose its only writer and stay green cannot see the seam at all",
  },
  mutations: [
    {
      name: "the seventh axis dropped from the slot",
      file: "src/shell/session.ts",
      from: "\\u0000${orbitKey}\\u0000${cursorKey}${animated}",
      to: "\\u0000${orbitKey}${animated}",
      expect: "T4.17p",
    },
    {
      name: "zero omitted from the key, as ScrollOffsets does",
      file: "src/shell/cursor-positions.ts",
      from: "    return [...held]\n      .sort(",
      to: "    return [...held].filter(([, at]) => at !== 0)\n      .sort(",
      expect: "T1.31",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
