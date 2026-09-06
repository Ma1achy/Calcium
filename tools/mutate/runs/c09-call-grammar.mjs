// C09 I45–I49 — the call grammar's glyph rows, mutated at the table and the fitter.
//
// Every mutation is a shape the tree shipped in or nearly did: `⏺` (the head mark
// until F823), `-` for the separator (until F834), `glyphFor` reading `unicode`
// alone (until F825), and a fitter that shortens the last run rather than the one
// marked `elide`. The control is the head mark itself — T2.45 and T2.112 both
// read the table, so a green control would mean the table is not what the rows
// read.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/blocks.test.ts test/contract/tool-call.test.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";

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
    file: GLYPHS,
    from: '    step: ["\\u2b24", "*"],',
    to: '    step: ["\\u23fa", "*"],',
    why: "T2.45 asserts the head mark is ⬤ and T2.112 that no table member has an emoji form; ⏺ U+23FA fails both — F823, the character the tree shipped",
  },
  mutations: [
    {
      // C09 I49 (T2.116), F834 — the rung the tree carried for one commit.
      name: "the ASCII separator is the turn spinner's frame again",
      file: GLYPHS,
      from: '  separator: ":",',
      to: '  separator: "-",',
      expect: "T2.116",
    },
    {
      // C09 I48 (T2.115), F825 — `glyphFor` reading `unicode` alone: ten Ambiguous
      // members are two cells at wide against a one-cell ASCII half.
      name: "glyphFor ignores ambiguousWidth",
      file: GLYPHS,
      from: '  return caps.ambiguousWidth === "wide" && AMBIGUOUS_TOKENS.has(token) ? pair[1] : pair[0];',
      to: "  return pair[0];",
      expect: "T2.115",
    },
    {
      // C09 I47 (T2.114), F831 — a `step` head that is not an element: `↓` skips it.
      name: "step removed from GLYPH_ELEMENT",
      file: SIMPLE,
      from: 'const GLYPH_ELEMENT: ReadonlySet<Glyph> = new Set<Glyph>(["step"]);',
      to: "const GLYPH_ELEMENT: ReadonlySet<Glyph> = new Set<Glyph>([]);",
      expect: "T2.114",
    },
    {
      // C09 I46 (T2.113) — the fitter skips the elide run and shortens the others:
      // the outcome gives way before the arguments do.
      name: "the fitter shortens every run but the elide run",
      file: SIMPLE,
      from: "    if (run === undefined || run.elide !== true) continue;",
      to: "    if (run === undefined || run.elide === true) continue;",
      expect: "T2.113",
    },
    {
      // C09 I46 (T2.113) — the step notice wraps like any notice: two rows at 40.
      name: "step is not a one-row kind",
      file: SIMPLE,
      from: 'const GLYPH_ONE_ROW: ReadonlySet<Glyph> = new Set<Glyph>(["step"]);',
      to: "const GLYPH_ONE_ROW: ReadonlySet<Glyph> = new Set<Glyph>([]);",
      expect: "T2.113",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
