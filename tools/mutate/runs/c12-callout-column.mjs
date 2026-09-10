// C12 I122 — the right column is grown for whatever is written in it.
//
// **The sentence is part of the subject here.** `rightRoom`'s doc comment in
// `svg.ts` cites `definition.ts`'s expression as the same rule in pixels, and
// the two were not the same: the terminal gated the whole maximum on
// `sides.right` where the SVG gates only the labels' half. So one mutation
// below restores the coupling and one restores the *inference* the first fix
// left behind — a column standing in for an axis — and only reading the frame
// separates the second from correct.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DEF = "src/presentation/plot/definition.ts";
const FUR = "src/presentation/plot/furniture.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-y-axis.test.ts 2>&1',
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
    file: DEF,
    from: "  if (!calloutDraws(block) || (layout.rightColumn ?? 0) === 0) return;",
    to: "  return;",
    why: "a renderer that resolves no callout rows at all writes nothing in the right gutter, which fails every YC row in the file — the run cannot see a kill if this survives",
  },
  mutations: [
    {
      // **The shipped defect.** The callout's reserve back inside the axis's
      // conditional, so nine of fifteen cells go silent in one arm.
      name: "the callout's column is conditional on a right axis again",
      file: DEF,
      from: "  const right = Math.max( // cells-ok — a cell width\n    sides.right ? wanted : 0, // cells-ok — a cell width\n    calloutWidth(block, caps.ambiguousWidth, stacked),\n  );",
      to: "  const right = sides.right // cells-ok — a cell width\n    ? Math.max(wanted, calloutWidth(block, caps.ambiguousWidth, stacked))\n    : 0;",
      expect: "YC10",
    },
    {
      // **The half a count cannot see.** The column's width standing in for
      // the axis's request again: every cell of YC10 reports the arms agreeing
      // while the terminal draws a scale the block switched off.
      name: "a column's existence stands in for the axis being asked for",
      file: FUR,
      from: "  return layout.rightLabels ?? (layout.rightColumn ?? 0) > 0;",
      to: "  return (layout.rightColumn ?? 0) > 0;",
      expect: "YC11",
    },
    {
      // The flag carried but inverted at the one site that sets it.
      name: "`rightLabels` is set from the left side",
      file: DEF,
      from: "      rightLabels: sides.right,",
      to: "      rightLabels: sides.left,",
      expect: "YC11",
    },
    {
      // The mirrored label written regardless of the flag — the reader exists
      // and the drawing stops asking it, which is the wiring rather than the
      // mechanism.
      //
      // **This survived too, and for the corpus's reason again**: YC11's only
      // cases were `yAxis: false` and `yAxis: "right"`, and at `false` the row
      // label is empty anyway — the guard and its absence agree at that input.
      // The cell where the rule can be violated needs a *left* axis, so labels
      // exist, and a callout, so the right column does; YC11's first added case
      // is that frame.
      name: "the right gutter writes the label without asking",
      file: FUR,
      from: "  const mirrored = showsRightLabels(layout) ? label : \"\";",
      to: "  const mirrored = label;",
      expect: "YC11",
    },
    {
      // The left side taking the callout's reserve too — C12 I47's *a callout is
      // only ever written on the right*, spent on both gutters.
      //
      // **This survived against `YA`, and the cause was the corpus rather than
      // the rows**: every YA fixture declares no callout, so `calloutWidth` is
      // 0 and the maximum is the width already there. A mutation written
      // against a state the fixtures do not construct cannot be wrong, and it
      // reads exactly like a test gap.
      //
      // **The first retarget survived too, and that is the finding** (F1007).
      // A YC11 row rendering one frame with a callout and one without still
      // agreed: at `yCallout: "last"` over values reaching 10 the scale reads
      // `10`/`5`/`0` and the callout reads `10`, both two cells, so `max` is
      // the width already there. *Constructing* the state a mutation needs is
      // not the same as constructing a state where it can be **observed** —
      // the callout has to be wider than the scale. The row now uses an
      // eleven-cell series name over a single-digit axis, and asserts that
      // relation before it asserts the columns.
      name: "the left column budgets for the callout as well",
      file: DEF,
      from: "  const left = sides.left ? wanted : 0; // cells-ok — a cell width",
      to: "  const left = sides.left ? Math.max(wanted, calloutWidth(block, caps.ambiguousWidth, stacked)) : 0; // cells-ok — a cell width",
      expect: "YC11",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
