// F665/F668 — the Ambiguous width table, mutated.
//
// **The rows are the two directions the repair can be wrong in, and one of them
// is the repair itself.** The old table under-counted; the obvious fix
// over-shoots. A suite that only asserts *Latin-1 is two cells at wide* is
// satisfied by a table that says the whole block is Ambiguous, and that table is
// wrong about `«` `»` `µ` and forty-nine other characters. So the first mutation
// restores the state the tree shipped in and the second restores the repair a
// careful author reaches for; if the second survives, T1.27b is decoration.
//
// The third is about the derivation itself. Deriving from the property is what
// *created* the over-count at U+E0100..U+E01EF, because the property calls a
// combining mark Ambiguous and the width table has to answer zero first — a
// repair that introduces a defect one table over is what a generated table makes
// possible and a hand-written one hid.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/text.test.ts";
const FILE = "src/presentation/text.ts";

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
    file: FILE,
    from: "  if (isWide(base)) return 2;",
    to: "  if (isWide(base)) return 1;",
    why: "T1.13 and T1.24 assert CJK at two cells in half a dozen rows; a run where this survives cannot see a kill at all",
  },
  mutations: [
    {
      // **The state the tree shipped in.** The derived table dropped and the
      // hand-written geometry blocks left alone — which is exactly the table at
      // f01c4f35, since every one of those blocks starts at U+2010 or above.
      name: "REVERT: the derived table is dropped and the geometry blocks stand alone",
      file: FILE,
      from: "  return inRanges(cp, AMBIGUOUS_RANGES) || inRanges(cp, DRAWN_AS_GEOMETRY);",
      to: "  return inRanges(cp, DRAWN_AS_GEOMETRY);",
      expect: "T1.27",
    },
    {
      // **The over-shooting repair, restored.** *Latin-1 is missing, so add
      // Latin-1* — a block rather than the property. It satisfies T1.27 exactly
      // and makes `«` `»` `µ` and 49 others two cells at wide.
      name: "OVER-SHOOT: Latin-1 admitted as a block rather than by the property",
      file: FILE,
      from: "  return inRanges(cp, AMBIGUOUS_RANGES) || inRanges(cp, DRAWN_AS_GEOMETRY);",
      to: "  return (cp >= 0xa0 && cp <= 0xff) || inRanges(cp, DRAWN_AS_GEOMETRY);",
      expect: "T1.27b",
    },
    {
      // The deviation, removed. 625 code points depend on the list and the gates
      // in C09 §4c and C12 read this answer; without the row that asserts it,
      // this mutation is invisible until fifteen golden frames move.
      name: "the geometry deviation is dropped and only the property answers",
      file: FILE,
      from: "  return inRanges(cp, AMBIGUOUS_RANGES) || inRanges(cp, DRAWN_AS_GEOMETRY);",
      to: "  return inRanges(cp, AMBIGUOUS_RANGES);",
      expect: "T1.27d",
    },
    {
      // The derivation's own casualty. Remove the range and a variation selector
      // widens to two cells under the wide convention — an over-count the
      // hand-written table could not have had, because it never reached plane 14.
      name: "the supplementary variation selectors leave the zero-width table",
      file: FILE,
      from: "    (cp >= 0xe0100 && cp <= 0xe01ef) // variation selectors, supplement",
      to: "    (cp >= 0xe0100 && cp <= 0xe0100 - 1) // variation selectors, supplement",
      expect: "T1.27e",
    },
    {
      // The search, not the data. A binary search that returns on the low half's
      // boundary only is right for every singleton range and wrong for every
      // multi-code-point one — and 44 of Latin-1's are singletons, so a corpus
      // of marks alone would agree with it.
      name: "the range search tests only the lower bound",
      file: FILE,
      from: "    else if (cp > (ranges[mid * 2 + 1] as number)) lo = mid + 1;",
      to: "    else if (cp > (ranges[mid * 2] as number)) lo = mid + 1;",
      expect: "T1.27",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
