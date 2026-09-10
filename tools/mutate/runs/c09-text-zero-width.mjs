// The zero-width set and the cluster sum, mutated — the third table in
// `text.ts` derived from its property (F978, F979), and the first rule in the
// file that sums over a cluster rather than reading its base.
//
// **The rows are indexed by how a repair to this rule can be wrong.** The
// first is the state the tree shipped in: the sum stopped at the base, so a
// spacing mark measured nothing and a `raw` row padded by that answer wrapped
// in Ink (T2.133). The next three are a clause of the sum each, removed or
// inverted — the `Mc` a reader who has just learned *marks are zero* zeroes
// too, the joiner's break, the modifier's zero. Then two repairs to the table
// a careful author reaches for: U+00AD admitted because it is `Cf`, and the
// two Thai letters put back because the hand table had them. The last is the
// hand table restored whole, which T1.37 alone would not see on the shapes
// it holds — every one of them lies inside the old ranges or is a spacing
// mark — and T1.38's equality does.
//
// The contract file runs beside the unit file so the `Mc` row is killed by the
// frame F969 named as its falsifier and not only by the table.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/text.test.ts test/contract/text-width.test.ts";
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

/** The sum as it stands, anchored whole so the revert can replace it. */
const SUM =
  "  let total = 0;\n" +
  "  let i = 0;\n" +
  "  while (i < cluster.length) {   // cells-ok: a code-unit cursor, not a width\n" +
  "    const cp = cluster.codePointAt(i) as number;\n" +
  "    i += cp > 0xffff ? 2 : 1;   // cells-ok: past the code point, in code units\n" +
  "    if (cp === 0x200d) break;\n" +
  "    if (isZeroWidth(cp) || (total > 0 && isEmojiModifier(cp))) continue;\n" +
  "    if (isWide(cp)) total += 2;\n" +
  "    else if (ambiguous === \"wide\" && isAmbiguous(cp)) total += 2;\n" +
  "    else total += 1;\n" +
  "  }\n" +
  "  return total;\n";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FILE,
    from: "    if (isWide(cp)) total += 2;",
    to: "    if (isWide(cp)) total += 1;",
    why: "T1.13, T1.24 and T1.28 assert CJK and Wide emoji at two cells in dozens of rows; a run where this survives cannot see a kill at all",
  },
  mutations: [
    {
      // **The state the tree shipped in.** The sum dropped and the base's width
      // restored — `clusterCells` at 5f91221a. Every spacing-mark shape in
      // T1.37 reads 1 and हिन्दी reads 2.
      name: "REVERT: the sum stops at the base, and a spacing mark measures nothing",
      file: FILE,
      from: SUM,
      to:
        "  if (isZeroWidth(base)) return 0;\n" +
        "  if (isWide(base)) return 2;\n" +
        "  return ambiguous === \"wide\" && isAmbiguous(base) ? 2 : 1;\n",
      expect: "T1.37",
    },
    {
      // **The over-shooting repair.** *Marks are zero* applied to the spacing
      // ones too — the reading the old T1.36 sentence invited. The table is
      // right and the sum still gives `aः` one cell, so the row that sees it is
      // the frame: a `raw` row padded by that answer wraps in Ink.
      name: "OVER-SHOOT: a spacing mark zeroed like a nonspacing one",
      file: FILE,
      from: "    if (isZeroWidth(cp) || (total > 0 && isEmojiModifier(cp))) continue;",
      to: "    if (isZeroWidth(cp) || /^\\p{Mc}$/u.test(String.fromCodePoint(cp)) || (total > 0 && isEmojiModifier(cp))) continue;",
      expect: "T2.133",
    },
    {
      // The joiner's break removed: every face of a family counted, six cells
      // for two. `a` + ZWJ + `b` cannot see it — the segmenter makes two
      // clusters of that — so the family is the row.
      name: "the joiner no longer ends the sum",
      file: FILE,
      from: "    if (cp === 0x200d) break;\n",
      to: "",
      expect: "T1.37",
    },
    {
      // The modifier's zero removed: a skin-toned hand is four cells. T1.13
      // sees it first; T1.37's entry for the wave sees it by equality.
      name: "an emoji modifier after a base takes its own two cells",
      file: FILE,
      from: "    if (isZeroWidth(cp) || (total > 0 && isEmojiModifier(cp))) continue;",
      to: "    if (isZeroWidth(cp)) continue;",
      expect: "T1.37",
    },
    {
      // **The repair the property invites.** U+00AD is `Cf`, so a table
      // regenerated without the exclusion admits it — and a soft hyphen every
      // terminal draws measures nothing. T1.38's equality fails at one range.
      name: "U+00AD admitted to the zero set",
      file: FILE,
      from: "  0x300, 0x36f, 0x483, 0x489,",
      to: "  0xad, 0xad, 0x300, 0x36f, 0x483, 0x489,",
      expect: "T1.38",
    },
    {
      // **The other repair.** The hand table had `0x0e31..0x0e3a` whole, so a
      // reader restoring what was there puts two Thai letters back among the
      // marks, and `กา` measures one cell for two again.
      name: "the Thai letters U+0E32 and U+0E33 put back among the marks",
      file: FILE,
      from: "0xe31, 0xe31, 0xe34, 0xe3a",
      to: "0xe31, 0xe3a",
      expect: "T1.37",
    },
    {
      // **The hand table restored whole.** Sixteen ranges, 659 code points —
      // 1,607 marks and format characters outside them and 24 non-marks
      // inside. T1.37 sees it only through its Thai and U+3099 rows — every
      // other shape lies inside the old ranges or is a spacing mark the table
      // never governed; T1.38's equality is what refuses the table itself.
      name: "REVERT: the hand-written ranges in place of the derived table",
      file: FILE,
      from: "function isZeroWidth(cp: number): boolean {\n  return inRanges(cp, ZERO_WIDTH_RANGES);\n}",
      to:
        "function isZeroWidth(cp: number): boolean {\n" +
        "  return (\n" +
        "    cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff ||\n" +
        "    (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x0483 && cp <= 0x0489) ||\n" +
        "    (cp >= 0x0591 && cp <= 0x05bd) || (cp >= 0x0610 && cp <= 0x061a) ||\n" +
        "    (cp >= 0x064b && cp <= 0x065f) || (cp >= 0x0e31 && cp <= 0x0e3a) ||\n" +
        "    (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff) ||\n" +
        "    (cp >= 0x20d0 && cp <= 0x20f0) || (cp >= 0xfe00 && cp <= 0xfe0f) ||\n" +
        "    (cp >= 0xfe20 && cp <= 0xfe2f) || (cp >= 0xe0100 && cp <= 0xe01ef)\n" +
        "  );\n" +
        "}",
      expect: "T1.38",
    },
    {
      // The control the pass owes: a mutation the rows are built to see, and
      // one that could not survive. Recorded here so the run's report carries
      // its own evidence of sight beside the harness's control.
      name: "(none — expected to survive) the docstring's figure changed and nothing reads it",
      file: FILE,
      from: " * ranges over 2,241 code points (2,059 `Mn`, 13 `Me`, 169 `Cf`). The same",
      to: " * ranges over 2,242 code points (2,059 `Mn`, 13 `Me`, 169 `Cf`). The same",
      expect: "(none — expected to survive)",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed && !r.expect.startsWith("(none"));
process.exit(unexpected.length > 0 ? 1 : 0);
