// The `⎿` continuation mark, mutated.
//
// **The rows worth having are the ones about where the mark is NOT**, because
// the mark itself is visible to anyone who looks at a frame and its absence is
// not. Two blocks read as consumers and are not — F15's fault notice and the
// cancelled notice — and each fails for a reason a green suite holds either way.
//
// **The first row is the defect that actually happened**, restored: the
// vocabulary's third copy, in `validate.ts`, was a `Set<Glyph>` built from a
// literal, which type-checks with a member missing. Adding the token compiled,
// every muted notice became an invalid document, and `enqueue`'s deliberate
// swallow turned that into *the queue silently stopped queueing* — seven rows
// failing about queueing rather than about a glyph. It is a mutation rather
// than a fabrication, and the row it kills is not in this component.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/continuation.test.ts test/unit/execution.test.ts "
  + "test/contract/blocks.test.ts test/golden/continuation.test.ts";
const DOCS = "src/shell/documents.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";
const REFRESH = "src/shell/refresh.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
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
    from: '    continuation: ["⎿", "`"],',
    to: '    continuation: ["", ""],',
    why: "with no rendering at all, T2.94 and T2.95 both fail; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The measured defect.** `satisfies Record<Glyph, true>` back to the
      // `Set<Glyph>` literal it replaced, with the token dropped — which is the
      // state the tree was actually in.
      name: "THE DEFECT: the validator's vocabulary is a Set literal again, and the token is missing from it",
      file: VALIDATE,
      from: "  continuation: true,\n} satisfies Record<Glyph, true>;",
      to: "} as Record<string, true>;",
      expect: "T3.18",
    },
    {
      // The eligibility rule, inverted at the condition. Every muted notice
      // takes the mark, including the ones with no line above them — which is
      // the reading that names four consumers and finds six.
      name: "the mark ignores the command, so a notice with no line above it takes one",
      file: DOCS,
      from: '    tone === "muted" ? (command === "" ? undefined : "continuation") : GLYPH_OF[tone];',
      to: '    tone === "muted" ? "continuation" : GLYPH_OF[tone];',
      expect: "T2.96",
    },
    {
      // The other half: the mark displaces an obliged glyph. `warn` and `error`
      // are C04 I6's, and a notice that loses its status glyph to a
      // subordination mark is the cancelled notice's exact failure.
      name: "the mark displaces an obliged glyph, so `warn` and `error` lose theirs",
      file: DOCS,
      from: '    tone === "muted" ? (command === "" ? undefined : "continuation") : GLYPH_OF[tone];',
      to: '    command === "" ? GLYPH_OF[tone] : "continuation";',
      expect: "T2.97",
    },
    {
      // **The character.** `└` is what a reader reaches for, it is one cell
      // under the default convention, and it doubles at wide. Nothing but a
      // width row measured against the other convention can tell the two apart.
      name: "the mark is the box-drawing corner, which is Ambiguous and draws two cells at wide",
      file: GLYPHS,
      from: '    continuation: ["⎿", "`"],',
      to: '    continuation: ["└", "`"],',
      expect: "T2.94",
    },
    {
      // **The second measured defect**, and the one that survived a green suite
      // and a green golden run: the mark flush left, in the prompt's own
      // gutter, reading as its sibling. Every block-indexed assertion holds.
      name: "THE SECOND DEFECT: the mark has no indent and sits in the prompt's gutter",
      file: SIMPLE,
      from: '  ["continuation", 2],',
      to: "",
      expect: "T2.99",
    },
    {
      // One cell was the first attempt: the mark lands *between* the command's
      // column and its own text's, subordinate to neither. A row asserting only
      // *the mark is indented* passes for it.
      name: "the indent is one cell, so the mark sits between the two columns",
      file: SIMPLE,
      from: '  ["continuation", 2],',
      to: '  ["continuation", 1],',
      expect: "T2.99",
    },
    {
      // **The seam the two functions exist to close.** The lead keeps the
      // indent and the measurer loses it, so the first row is two cells wider
      // than every continuation row under it — a hanging indent that hangs off
      // the wrong column, at a width that wraps and nowhere else.
      name: "the measurer drops the indent that the lead still draws",
      file: SIMPLE,
      from: "  return glyphCells(glyph) + 1 + (GLYPH_INDENT.get(glyph) ?? 0);",
      to: "  return glyphCells(glyph) + 1;",
      expect: "wrapped",
    },
    {
      // The stall notice's slot, which no `documents.ts` row can reach: it is
      // the one consumer built by hand rather than through `noticeDoc`.
      name: "the stall notice loses the mark — the consumer no other row covers",
      file: REFRESH,
      from: '        glyph: "continuation",\n',
      to: "",
      expect: "T3.22",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
