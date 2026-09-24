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
    from: '  succeeded: "ok",',
    to: '  succeeded: "running",',
    why:
      "T2.45 asserts the five marks the states take where shape has to carry them; a succeeded call " +
      "drawing `\u25cf` collides with running at 1 bit and in ASCII, so a pass where this survives " +
      "is a pass that saw no kill",
  },
  mutations: [
    {
      // **The rung collapsed** (C09 I45, R-COR-003). Replaced the U+23FA
      // selector mutation, whose subject left the tree with the `step` slot:
      // the head mark is now a resolution, and the defect it can have is
      // answering *tone carries* where tone does not. Every state then draws
      // `\u25cf` at 1 bit and `*` in ASCII, which is five facts on one mark with
      // no second carrier — the exact thing §030's collapse is only safe
      // because tone prevents.
      name: "tone is assumed to carry at every rung, so five states share one mark",
      file: GLYPHS,
      from: '  return caps.colourDepth > 1 && caps.unicode !== "ascii" && !onBand;',
      to: "  return true;",
      expect: "T2.45"
    },
    {
      // C09 I49 (T2.116), F834 — the rung the tree carried for one commit.
      name: "the ASCII separator is the turn spinner's frame again",
      file: GLYPHS,
      from: '  separator: ":",',
      to: '  separator: "-",',
      expect: "T2.116",
    },
    {
      // **THE DEFECT I48 replaced**, written inline because `AMBIGUOUS_TOKENS`
      // is gone with it: the rung taken member by member, so eleven of eighteen
      // fall at `wide` and seven stay Unicode. Every width assertion in the
      // tree passes against it — each slot is one cell at either arm either way
      // — and the frame draws `*` for running beneath a `\u23bf` continuation with
      // `\u2713` and `\u2717` as outcomes.
      //
      // **Expressed with `cells` rather than the deleted set**, since a mutation
      // that fails to compile is killed by the compiler and that is a kill the
      // run did not earn (F1254).
      name: "THE DEFECT: the vocabulary takes its ASCII rung member by member",
      file: GLYPHS,
      from: '  return caps.ambiguousWidth === "wide" ? pair[1] : pair[0];',
      to: '  return caps.ambiguousWidth === "wide" && cells(pair[0], "wide") === 2 ? pair[1] : pair[0];',
      expect: "T2.115",
    },
    {
      // C09 I48 (T2.115), F825 — `glyphFor` reading `unicode` alone: ten Ambiguous
      // members are two cells at wide against a one-cell ASCII half.
      //
      // **Re-anchored 2026-09-24**: the vocabulary takes its ASCII rung whole at
      // `wide` (I48, §093), so the line no longer tests membership and
      // `AMBIGUOUS_TOKENS` is gone. The mutation is unchanged in meaning — the
      // wide arm ignored — and now lands on the whole-set form.
      name: "glyphFor ignores ambiguousWidth",
      file: GLYPHS,
      from: '  return caps.ambiguousWidth === "wide" ? pair[1] : pair[0];',
      to: "  return pair[0];",
      expect: "T2.115",
    },
    {
      // C09 I47 (T2.114), F831 — a call head that is not an element: `↓` skips
      // it. Re-anchored 2026-09-22 off `GLYPH_ELEMENT`, which the head-mark
      // rung replaced with a predicate over the block's state.
      name: "a call head is not an element",
      file: SIMPLE,
      from: "const isCallHead = (block: Notice): boolean => block.state !== undefined;",
      to: "const isCallHead = (block: Notice): boolean => block.state === undefined;",
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
      // C09 I46 (T2.113) — a call head wraps like any notice: two rows at 40.
      // Inverted rather than replaced by `false`, which would take the type
      // narrowing with it and change more than the arm under test.
      name: "a call head is not a one-row kind",
      file: SIMPLE,
      from: "  if (isCallHead(block)) {",
      to: "  if (!isCallHead(block)) {",
      expect: "T2.113",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
