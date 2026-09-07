// The Wide width table, mutated — the sibling of `c09-text-ambiguous.mjs` and
// the half whose errors landed in the default mode.
//
// **The rows are indexed by how a repair to this table can be wrong, and two of
// the four are repairs a careful author reaches for.** The old table under-counted
// 8,619 code points and over-counted 369, so *add the missing ones* — a union of
// a generated table onto the blocks that were there — satisfies every row about
// the 8,619 and keeps every one of the 369, U+3248..U+324F among them. If the
// union survives, the control rows are decoration.
//
// The last row is the one the pass itself produced. The first draft of T1.28
// named one representative per run, and every representative was its run's
// **first** member — so collapsing `0x17000, 0x18cd5` to `0x17000, 0x17000`,
// which is 7,382 code points out of the table, left the suite green. Element
// zero is the one a collapse keeps; the row now asserts both bounds and the
// midpoint of every run.
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
    why: "T1.13, T1.24 and T1.28 assert CJK and Wide emoji at two cells in dozens of rows; a run where this survives cannot see a kill at all",
  },
  mutations: [
    {
      // **The state the tree shipped in.** The derived table dropped and the
      // seventeen coarse blocks restored — the table at 311ab18e. Every row of
      // T1.28 lies outside those blocks, which is what put it in the 8,619.
      name: "REVERT: the hand-written blocks, and the 8,619 under-counts with them",
      file: FILE,
      from: "function isWide(cp: number): boolean {\n  return inRanges(cp, WIDE_RANGES);\n}",
      to: "function isWide(cp: number): boolean {\n  return (\n    (cp >= 0x1100 && cp <= 0x115f) ||\n    (cp >= 0x2e80 && cp <= 0x303e) ||\n    (cp >= 0x3041 && cp <= 0x33ff) ||\n    (cp >= 0x3400 && cp <= 0x4dbf) ||\n    (cp >= 0x4e00 && cp <= 0x9fff) ||\n    (cp >= 0xa000 && cp <= 0xa4cf) ||\n    (cp >= 0xac00 && cp <= 0xd7a3) ||\n    (cp >= 0xf900 && cp <= 0xfaff) ||\n    (cp >= 0xfe10 && cp <= 0xfe19) ||\n    (cp >= 0xfe30 && cp <= 0xfe6f) ||\n    (cp >= 0xff00 && cp <= 0xff60) ||\n    (cp >= 0xffe0 && cp <= 0xffe6) ||\n    (cp >= 0x1f300 && cp <= 0x1f64f) ||\n    (cp >= 0x1f680 && cp <= 0x1f6ff) ||\n    (cp >= 0x1f900 && cp <= 0x1f9ff) ||\n    (cp >= 0x1fa70 && cp <= 0x1faff) ||\n    (cp >= 0x20000 && cp <= 0x3fffd)\n  );\n}",
      expect: "T1.28",
    },
    {
      // **The over-shooting repair, which is the one a reader reaches for.**
      // *Wide is missing entries, so add the property to what was there.* It
      // satisfies T1.28 exactly and keeps all 369 over-counts, including the
      // eight the two tables disagreed about.
      name: "UNION: the property added to the old blocks rather than replacing them",
      file: FILE,
      from: "function isWide(cp: number): boolean {\n  return inRanges(cp, WIDE_RANGES);\n}",
      to: "function isWide(cp: number): boolean {\n  return (\n    inRanges(cp, WIDE_RANGES) ||\n    (cp >= 0x2e80 && cp <= 0x303e) ||\n    (cp >= 0x3041 && cp <= 0x33ff) ||\n    (cp >= 0xa000 && cp <= 0xa4cf) ||\n    (cp >= 0xff00 && cp <= 0xff60) ||\n    (cp >= 0x1f300 && cp <= 0x1f64f) ||\n    (cp >= 0x1f680 && cp <= 0x1f6ff)\n  );\n}",
      expect: "T1.28b",
    },
    {
      // The overlap alone, without the rest of the union. U+3248..U+324F is
      // Ambiguous and the coarse Hiragana-through-compatibility range claimed
      // it; a table that keeps only that much still measures eight code points
      // two cells at narrow.
      name: "the two tables overlap again — U+3248..U+324F claimed as Wide",
      file: FILE,
      from: "function isWide(cp: number): boolean {\n  return inRanges(cp, WIDE_RANGES);\n}",
      to: "function isWide(cp: number): boolean {\n  return inRanges(cp, WIDE_RANGES) || (cp >= 0x3248 && cp <= 0x324f);\n}",
      expect: "T1.28c",
    },
    {
      // **The row the pass produced.** 7,382 Tangut ideographs out of the table,
      // and the first draft of T1.28 stayed green because its representative was
      // the range's first member. A collapse onto element zero is invisible to a
      // corpus of representatives and visible to one of bounds and midpoints.
      name: "the Tangut range collapses onto its first member",
      file: FILE,
      from: "0x17000, 0x18cd5",
      to: "0x17000, 0x17000",
      expect: "T1.28",
    },
    {
      // The far bound rather than the near one, because a collapse onto the
      // *last* member is the mirror defect and a midpoint alone cannot see it.
      name: "the Nushu range collapses onto its last member",
      file: FILE,
      from: "0x1b170, 0x1b2fb",
      to: "0x1b2fb, 0x1b2fb",
      expect: "T1.28",
    },
    {
      // The property's own edge. `; F` rows are Fullwidth, and a table generated
      // from `; W` alone loses the fullwidth forms — the class most likely to be
      // assumed already covered, because the old coarse table did cover it.
      name: "the fullwidth forms leave the table",
      file: FILE,
      from: "0xff01, 0xff60",
      to: "0xff01, 0xff01",
      expect: "T1.13",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
