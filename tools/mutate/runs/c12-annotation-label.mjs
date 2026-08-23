// C04 I52, C12 I55 §3ag — the deferral's field, and the arm that had to arrive
// with it.
//
// **The second mutation is the one the deferral was about.** Counting series
// alone leaves the field on the type and drawing nowhere, which is precisely the
// state C04 I52 refused to ship it in — and the frame still renders, still
// validates, and looks entirely correct.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const FURN = "src/presentation/plot/furniture.ts";
const VAL = "src/data/viewmodel/validate.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/unit/plot-annotation-label.test.ts 2>&1", {
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
    from: "    ...annotations,\n  ];",
    to: "  ];",
    why:
      "the third source dropped from the legend: every row here asserts a label in a frame, so " +
      "a run that cannot see the entries vanish can see nothing below it",
  },
  mutations: [
    {
      // **The deferral's own case.** A line plus a reference line is one series,
      // so the series count answers `null` and the member draws nowhere — the
      // exact state C04 I52 named and refused.
      name: "the auto arm counts series and not labels",
      file: FURN,
      from: "  if (labelled > 0) return \"right\";",
      to: "",
      expect: "TL7",
    },
    {
      // `SHARES_CELLS` widened rather than a second clause: it partitions forms
      // by whether *categories* share cells, and an annotation's label is not a
      // category — so a form outside the partition loses its row.
      name: "a labelled annotation must also satisfy SHARES_CELLS",
      file: FURN,
      from: "  if (labelled > 0) return \"right\";",
      to: "  if (labelled > 0 && SHARES_CELLS[block.form]) return \"right\";",
      expect: "TL7",
    },
    {
      // The swatch taken from the category ladder, which draws a glyph the
      // annotation is not drawn with — this function's own recorded defect.
      name: "the annotation's swatch is a category mark",
      file: FURN,
      from: "      return [{ mark: g.dashedHorizontal, label, ref }];",
      to: "      return [{ mark: markOf(0, ctx.capabilities), label, ref }];",
      expect: "TL8",
    },
    {
      // The refusal dropped: a label with the legend forbidden renders and says
      // nothing, which is a member drawing nowhere by the caller's own request.
      name: "a label with `legend: false` is accepted",
      file: VAL,
      from: "    if (isString(label) && legend === false) {",
      to: "    if (false && isString(label) && legend === false) {",
      expect: "TL9",
    },
    {
      // The per-sample kinds allowed a label, so one string means *the band* on
      // one arm and *this sample* on another.
      name: "confidence and whiskers may carry a label",
      file: VAL,
      from: '    if (label !== undefined && a["kind"] !== "line" && a["kind"] !== "band") {',
      to: "    if (false) {",
      expect: "TL9",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
