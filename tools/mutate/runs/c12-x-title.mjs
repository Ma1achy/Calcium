// C12 I56 §3ag — the abscissa's name, and the record that keeps C12 I1.
//
// **The third and fourth are the ones worth having.** `HAS_X_TITLE` is not a
// taste: sixteen of its eighteen `false`s declare the title's row through
// `titleRows` and compose no row for it, so a `true` in the wrong place is a
// block whose measured height and rendered height disagree — and the *refusal*
// is the only thing standing between the member and a broken C12 I1.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const FURN = "src/presentation/plot/furniture.ts";
const HEIGHT = "src/presentation/plot/height.ts";
const VAL = "src/data/viewmodel/validate.ts";
const TYPES = "src/data/viewmodel/types.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/unit/plot-x-title.test.ts 2>&1", {
      cwd: ROOT, encoding: "utf8", timeout: 300_000,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FURN,
    from: "      ...(title === undefined ? [] : [xTitleRow(title, layout, ctx)]),",
    to: "",
    why:
      "the row composed nowhere while `titleRows` still declares it: every drawing row here " +
      "asserts the title in a frame, and C12 I1 breaks in the same move",
  },
  mutations: [
    {
      // **The row declared and never drawn**, which `composeRows` pads over — so
      // the block still measures correctly and carries a blank line where its
      // title should be. A height assertion alone cannot see this.
      name: "the title costs no declared row",
      file: HEIGHT,
      from: "  return plot.xTitle === undefined ? 0 : 1; // cells-ok — a row count",
      to: "  return 0; // cells-ok — a row count",
      expect: "TL16",
    },
    {
      // Above the labels rather than below them: a name between a scale and the
      // thing it measures separates the two.
      name: "the title is drawn above the label row",
      file: FURN,
      from: "      xLabelRowFor(axis.text, layout, ctx),\n      ...(title === undefined ? [] : [xTitleRow(title, layout, ctx)]),",
      to: "      ...(title === undefined ? [] : [xTitleRow(title, layout, ctx)]),\n      xLabelRowFor(axis.text, layout, ctx),",
      expect: "TL16",
    },
    {
      // **A `false` flipped to `true`.** The form declares the row and composes
      // nothing for it, so `measure` and the rendered count part company — and
      // the frame still renders, which is why the sweep asserts both.
      name: "a matrix is allowed a title it never composes",
      file: TYPES,
      // **Anchored on the comment above the row, because the row alone appears
      // four times in this file** — `HAS_CALLOUT`, `IS_MATRIX` and two others
      // carry the identical line. The first draft matched at line 1277, mutated
      // a different record, and the harness reported a **survivor**: an
      // ambiguous anchor is indistinguishable from a test gap, where a missing
      // one is reported as itself (F219).
      from: "  // **A matrix composes its own furniture and was not wired** — a named gap:\n  // its column-label row could carry a title and does not.\n  heatmap: false,",
      to: "  // **A matrix composes its own furniture and was not wired** — a named gap:\n  // its column-label row could carry a title and does not.\n  heatmap: true,",
      expect: "T2.9",
    },
    {
      // The refusal dropped: every one of the eighteen becomes constructible and
      // sixteen of them break C12 I1.
      name: "the form refusal is dropped",
      file: VAL,
      from: "    } else if (HAS_X_TITLE[form as PlotForm] === false) {",
      to: "    } else if (false) {",
      expect: "T2.9",
    },
    {
      // A title on an axis that is not drawn names nothing, and the alternative
      // — floating it at the foot of the block — is a second placement rule.
      name: "`axes: false` may carry a title",
      file: VAL,
      from: "    } else if (b[\"axes\"] !== true) {",
      to: "    } else if (false) {",
      expect: "TL17",
    },
    {
      // Centred on the whole row rather than on the plot area, so it sits partly
      // over the gutter and no longer lines up with the figure it names.
      name: "the title is centred on the row, not the area",
      file: FURN,
      // The offset the first draft shipped: four cells too far right, off the
      // area's centre and past its right edge into the ellipsis.
      from: "      { text: \" \".repeat(layout.gutter + lead) },",
      to: "      { text: \" \".repeat(layout.gutter + layout.labelColumn + AXIS_GUTTER + lead) },",
      expect: "TL16",
    },
    {
      // Wrapped rather than truncated, which changes a declared height (C12 I1) —
      // and every other furniture row in the file makes the other choice.
      name: "a long title is not truncated",
      file: FURN,
      from: "  const text = truncate(title, layout.areaWidth, ctx.capabilities);",
      to: "  const text = title;",
      expect: "TL16",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
