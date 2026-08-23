// C12 I33 — the stub points toward the whisker, and there may be no whisker.
//
// **Two of these restore a shipped defect rather than inventing one.** A band
// with `q3 === max` wrote its box edge over its own cap — one column, two
// writes, the edge second — and kept a stem pointing at blank columns. The rule
// was already written and the degenerate end was not, which is I33's own
// complaint about itself arriving one clause along.
//
// **The pair worth naming is `edge`.** The three-row arm and the compact arm
// answer differently and both answers are right: with corners on the rows above
// and below, a plain `│` is unambiguous; with one row it is the *second* `│` on
// a line whose first is the median, and the fill already says where the box is.
// A mutation collapsing the two arms passes every assertion about the collapsed
// end and produces one glyph with two meanings.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const ROW = "src/presentation/plot/glyph-row.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-mutations.test.ts 2>&1',
      { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: ROW,
    from: "    median: [g.teeDown, g.vertical, g.teeUp],",
    to: "    median: [g.teeDown, g.horizontal, g.teeUp],",
    why: "T1.100 reads the spine's median as `│` and T1.91 locates it by that glyph; a median drawn as a rule cannot satisfy either, so a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The shipped defect**: the edge keeps its stem and points at nothing.
      name: "the right box edge always stubs toward a whisker",
      file: ROW,
      from: "    boxR: [g.topRight, highWhisker ? g.teeLeft : edge, g.bottomRight],",
      to: "    boxR: [g.topRight, g.teeLeft, g.bottomRight],",
      expect: "T1.100",
    },
    {
      // The mirror, which the finding as first stated named only one half of.
      name: "the left box edge always stubs toward a whisker",
      file: ROW,
      from: "    boxL: [g.topLeft, lowWhisker ? g.teeRight : edge, g.bottomLeft],",
      to: "    boxL: [g.topLeft, g.teeRight, g.bottomLeft],",
      expect: "T1.100",
    },
    {
      // The condition on the values rather than on the columns: two readings a
      // hair apart round into one cell, and there is nothing between them to
      // point at even though `q1 !== min`.
      name: "the whisker test asks the values, not the columns",
      file: ROW,
      from: "  const highWhisker = xMax > xQ3; // cells-ok — a column index",
      to: "  const highWhisker = q.max > q.q3; // cells-ok — a column index",
      expect: "T1.100",
    },
    {
      // **The two arms collapsed.** Every assertion about the collapsed end
      // still passes; what breaks is that the compact row's box edge becomes a
      // second `│` beside the median, which is the glyph T1.91 locates it by.
      name: "the compact arm draws `│` at a collapsed edge, like the three-row one",
      file: ROW,
      from: "  const edge = compact ? fill : g.vertical;",
      to: "  const edge = g.vertical;",
      expect: "T1.91",
    },
    {
      // And the other way: the three-row arm drawing the fill, where there is
      // no fill to be part of and the interior is deliberately clear.
      name: "the three-row arm draws the fill at a collapsed edge",
      file: ROW,
      from: "  const edge = compact ? fill : g.vertical;",
      to: "  const edge = fill;",
      expect: "T1.100",
    },
    {
      // **The mean silently dropped where it lands on the median**, which is
      // what the band arm did while the column arm drew `◈`. Two arms of one
      // figure, and a summary carrying a mean rendered identically to one that
      // does not.
      name: "the band arm skips the mean when it lands on the median",
      file: ROW,
      from: "      row[xm] = xm === xMed ? T.meanTee : T.mean;",
      to: "      if (xm !== xMed) row[xm] = T.mean;",
      expect: "T1.100c",
    },
    {
      // And the other way: a mean apart drawn with the combined mark, so the
      // glyph stops meaning *these two coincide*.
      name: "the band arm always draws the combined mark",
      file: ROW,
      from: "      row[xm] = xm === xMed ? T.meanTee : T.mean;",
      to: "      row[xm] = T.meanTee;",
      expect: "T1.100c",
    },
    {
      // The vertical arm's lid, which is the transpose and was re-derived by
      // hand once already.
      name: "the vertical lid always stubs upward",
      file: ROW,
      from: "  set(yQ3, runRow(g.topLeft, upperWhisker ? g.teeUp : g.horizontal, g.topRight));",
      to: "  set(yQ3, runRow(g.topLeft, g.teeUp, g.topRight));",
      expect: "T1.100b",
    },
    {
      name: "the vertical floor always stubs downward",
      file: ROW,
      from: "  set(yQ1, runRow(g.bottomLeft, lowerWhisker ? g.teeDown : g.horizontal, g.bottomRight));",
      to: "  set(yQ1, runRow(g.bottomLeft, g.teeDown, g.bottomRight));",
      expect: "T1.100b",
    },
    {
      // Inverted rows: `yMax` is above `yQ3` because a value grows upward and a
      // row index grows down, so the comparison reads the other way from the
      // band's. Getting it backwards suppresses every stub that should be there
      // and draws every one that should not.
      name: "the vertical whisker test uses the band's direction",
      file: ROW,
      from: "  const upperWhisker = yQ3 > yMax; // cells-ok — a row index",
      to: "  const upperWhisker = yMax > yQ3; // cells-ok — a row index",
      expect: "T1.100b",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
