// Roadmap 51's bar half, mutated.
//
// **The tier is asserted over what `barStyle` returns**, so these mutations are
// about the lookup rather than the table: a flag somebody wrote and a flag
// something consults differ exactly when the lookup is wrong, and only the
// second is what a frame sees.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/bars.test.ts";
const FILE = "src/presentation/blocks/glyphs.ts";

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
    from: "  if (caps.unicode === \"ascii\") return BAR_ASCII;",
    to: "",
    why: "T2.93 asserts the ASCII arm directly; a run where removing it survives cannot see a kill",
  },
  mutations: [
    {
      // **The refusal restored as a refusal.** Before `ambiguousWidth` existed
      // these styles were simply not offered; the entry's whole argument is that
      // the field turns that into a tier, so the mutation is the old behaviour.
      name: "the width tier is ignored and a wide terminal gets the ambiguous glyph",
      file: FILE,
      from: "  return style.narrowOnly === true && caps.ambiguousWidth === \"wide\" ? BAR_ASCII : style;",
      to: "  return style;",
      expect: "T2.90",
    },
    {
      // The other direction: every style treated as narrow-only, so `braille`
      // falls too. A row asserting only *the six fall* passes here.
      name: "braille is treated as narrow-only, so a wide terminal loses it too",
      file: FILE,
      from: "  braille: Object.freeze({ on: \"⣿\", off: \" \" }),",
      to: "  braille: Object.freeze({ on: \"⣿\", off: \" \", narrowOnly: true }),",
      expect: "T2.91",
    },
    {
      // Order. Reading the width tier first means an ASCII terminal keeps a
      // width-stable unicode glyph it cannot draw at all.
      name: "the width tier is read before the unicode tier",
      file: FILE,
      from: "  if (caps.unicode === \"ascii\") return BAR_ASCII;\n  return style.narrowOnly === true",
      to: "  if (false) return BAR_ASCII;\n  return style.narrowOnly === true",
      expect: "T2.93",
    },
    {
      // **The pair that shipped wrong, put back** (C09 I94, F-§033). `.` for
      // `-` is the divergence T2.158 was written against, and the four rows
      // above it all stay green: each measures a width or a fallback, and `.`
      // is one cell exactly as `-` is.
      name: "the ASCII bar's empty cell is `.` again",
      file: FILE,
      from: "const BAR_ASCII: BarStyle = Object.freeze({ on: \"#\", off: \"-\" });",
      to: "const BAR_ASCII: BarStyle = Object.freeze({ on: \"#\", off: \".\" });",
      expect: "T2.158",
    },
    {
      // **A name on one side alone**, which is what makes the comparison an
      // equality rather than a containment: a style the registry does not
      // register reads as covered by any subset check.
      name: "a tenth alphabet the registry never registered",
      file: FILE,
      from: "  ascii: BAR_ASCII,\n});",
      to: "  ascii: BAR_ASCII,\n  hatch: Object.freeze({ on: \"▩\", off: \"▨\", narrowOnly: true }),\n});",
      expect: "T2.158",
    },
    {
      name: "an unknown name throws instead of falling to the default",
      file: FILE,
      from: "  const style = BAR_STYLES[name] ?? BAR_STYLES[DEFAULT_BAR_STYLE];",
      to: "  const style = BAR_STYLES[name];",
      expect: "T2.92",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
