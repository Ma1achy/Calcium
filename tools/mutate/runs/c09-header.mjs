// C09 I82's column headers, mutated (F1236).
//
// **The row this pass tests asks for an index, and the defect it closes is two
// cells.** That is a shift a reader counts by eye and gets wrong — the first
// reading of F1236 named the *body* as the defect from exactly that — so every
// claim T3.95 makes is one `indexOf` away from a frame nobody should be
// reading. A row like that can be green because the columns agree, or because
// the filter above it excluded every width that could disagree.
//
// **The first mutation is the shipped defect put back**, verbatim: one field,
// `reserve: 0` on the header where the body passes the verdict's room.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/edge/blocks.test.ts test/unit/blocks.test.ts test/contract/blocks.test.ts";

const KINDS = "src/presentation/blocks/kinds/structured.ts";

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
    file: KINDS,
    from: "    const judgedRoom = plan === null ? judged : (got(\"verdict\") ?? 0);",
    to: "    const judgedRoom = 0;",
    why: "no verdict cells are reserved anywhere, so the marks vanish from every row and the frames the ladder rows read change at every width",
  },
  mutations: [
    {
      // **The shipped defect, verbatim.** The header spends the verdict's cells
      // on its label and names a column two to the left of the values.
      name: "the header reserves nothing where the body reserves the verdict",
      file: KINDS,
      from: "      verdict: markFor(undefined, judgedRoom, ctx),\n      reserve: judgedRoom,\n      b: labelB,",
      to: "      verdict: \"\",\n      reserve: 0,\n      b: labelB,",
      expect: "T3.95",
    },
    {
      // **The other direction, which no fix-shaped row would catch.** The
      // header reserves and the body does not, so the label is two cells right
      // of its values — a frame that reads as *aligned differently* rather than
      // as wrong, and the reason T3.95 asserts both columns.
      name: "the body reserves nothing where the header reserves the verdict",
      file: KINDS,
      from: "        verdict: markFor(entry.verdict, judgedRoom, ctx),\n        reserve: judgedRoom,",
      to: "        verdict: \"\",\n        reserve: 0,",
      expect: "T3.95",
    },
    {
      // **The reservation taken and not paid for**: the value is truncated to
      // the whole column rather than to what the mark left, so the row totals
      // correctly and the last column loses content — C09 I68's arm, which no
      // width assertion can see.
      name: "the value is cut to the column rather than to what the mark left",
      file: KINDS,
      from: "              truncate(cellsOf.b, Math.max(1, column - cellsOf.reserve), ctx.capabilities),",
      to: "              truncate(cellsOf.b, Math.max(1, column), ctx.capabilities),",
      expect: "T3.95",
    },
    {
      // **A row with no verdict left unpadded**, which is the body defect the
      // first reading of F1236 believed was there: the rows disagree with each
      // other and the header agrees with only one of them.
      name: "a row with no verdict is not padded to the reserved width",
      file: KINDS,
      from: "  if (reserved === 0) return \"\";\n  const token = verdictGlyph(verdict);",
      to: "  if (reserved === 0 || verdict === undefined) return \"\";\n  const token = verdictGlyph(verdict);",
      expect: "T3.95",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
