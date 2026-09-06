// C10 I21's fourth admitted case — the picture cell — mutated (C10 §4c.1).
//
// **The rule under test is a guard nothing can currently reach**, and that is
// the reason this run exists rather than an argument against it. The glyph set
// the two shipped constructors paint a background under was read off every
// 24-bit and 8-bit terminal golden, and every member is admitted — so no input
// the tree produces trips `assertPictureGlyph`, and **every golden stays green
// with either guard deleted**. Measured, not assumed: with sankey's call
// removed, 313 of 314 rows across `test/unit/theme.test.ts`,
// `terminal-baseline` and `plot-forms` passed. A guard whose removal is
// invisible in results is exactly the shape that gets tidied away, and the only
// thing standing between it and that is a row that names it.
//
// **`ALPHABET-WIDE` is the ruling, not a slip.** The brand sits on the
// *background channel* and not on the alphabet, which is what lets the admitted
// set stay three ranges: `sankeyAlphabet`'s ASCII arm draws `#`, `=` and `-`,
// and `cellOf` never passes a lower owner there, so no ASCII cell ever carries
// a background. A reader who notices `-` in the alphabet and widens the
// predicate to *anything not alphanumeric* has moved the brand back onto the
// alphabet without noticing, and the figure is drawn identically either way.
//
// **`RANGE-BLOCKS-ONLY` and `RANGE-BRAILLE-ONLY` are the two halves of the
// corpus row.** T1.36 reads the goldens rather than the constructors' own
// tables, and a narrowing is what it can see; a *widening* it cannot, which is
// the limit the run records rather than repairs — `ALPHABET-WIDE` survives
// T1.36 and is killed by T1.35 alone.
//
// **`CLUSTER-OK` is the vacuity arm.** `isPictureGlyph` measures one glyph;
// dropping the length check makes `"▀a"` admissible, and a fill followed by a
// letter is a text-bearing painted cell reached without ever failing a range.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/theme.test.ts";
const PICTURE = "src/presentation/theme/picture.ts";
const SANKEY = "src/presentation/plot/sankey.ts";
const SCATTER3 = "src/presentation/plot/scatter3.ts";

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
  // The control: refuse everything. If a run where the predicate admits nothing
  // at all still reports green, the pass is not reaching its subject.
  control: {
    file: PICTURE,
    from: "  return cp === 0x20 || (cp >= 0x2580 && cp <= 0x259f) || (cp >= 0x2800 && cp <= 0x28ff);",
    to: "  return false;",
    why: "T1.35 and T1.36 both assert admission by range; a run where refusing everything survives cannot see a kill",
  },
  mutations: [
    {
      // **The ruling, inverted.** The brand slides from the background channel
      // back onto the alphabet, and `#`, `=` and `-` come with it.
      name: "ALPHABET-WIDE: any non-alphanumeric glyph may carry a background",
      file: PICTURE,
      from: "  return cp === 0x20 || (cp >= 0x2580 && cp <= 0x259f) || (cp >= 0x2800 && cp <= 0x28ff);",
      to: "  return !/[a-zA-Z0-9]/u.test(glyph);",
      // Measured by hand: T1.35 fails on `#`; T1.37 fails on the `-` arm;
      // **T1.36 survives**, because a corpus-derived row sees a narrowing and
      // not a widening. That asymmetry is why both rows exist.
      expect: "T1.35",
    },
    {
      name: "RANGE-BLOCKS-ONLY: braille stops being a fill",
      file: PICTURE,
      from: " || (cp >= 0x2800 && cp <= 0x28ff);",
      to: ";",
      // T1.36 is the kill here and T1.35 is the second: the goldens hold the
      // braille the constructors actually paint over a background.
      expect: "T1.36",
    },
    {
      name: "RANGE-BLOCKS-DROPPED: the block elements stop being fills",
      file: PICTURE,
      from: "(cp >= 0x2580 && cp <= 0x259f) || ",
      to: "",
      // Kills on sankey's set being exactly `{▀}` — the one glyph that carries
      // bar against ribbon at 1-bit and the reason a blank `Span` never fitted.
      expect: "T1.36",
    },
    {
      // **The vacuity arm.** A range check on the first codepoint says nothing
      // about the rest of the string.
      name: "CLUSTER-OK: a fill followed by a letter is admitted",
      file: PICTURE,
      from: "  if ([...glyph].length !== 1) return false;",
      to: "  if (glyph.length === 0) return false;",
      expect: "T1.35",
    },
    {
      // **The guard whose removal every frame agrees with.** Measured: 313 of
      // 314 rows green with this applied, the one failure being T1.37.
      name: "SANKEY-UNGUARDED: the half-block constructor stops checking",
      file: SANKEY,
      from: '  assertPictureGlyph(text, "sankeyArea");\n',
      to: "",
      expect: "T1.37",
    },
    {
      name: "PLOT3D-UNGUARDED: the mixed-cell constructor stops checking",
      file: SCATTER3,
      from: '    assertPictureGlyph(glyph, "plot3d mixedRows");\n',
      to: "",
      expect: "T1.37",
    },
    {
      // The refusal becomes a no-op while every call site still reads as
      // guarded — the shape a `catch` around the assertion would also produce.
      name: "ASSERT-SILENT: the refusal returns instead of throwing",
      file: PICTURE,
      from: "  if (isPictureGlyph(glyph)) return;\n  throw new Error(",
      to: "  if (!isPictureGlyph(glyph)) return;\n  throw new Error(",
      expect: "T1.37",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
