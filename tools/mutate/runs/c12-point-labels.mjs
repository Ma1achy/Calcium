// C12 I55 §3ag · C04 I63 — a name beside a sample.
//
// **The first two attack the *placement rule* rather than its presence.** Both
// produce a frame that renders, fits its width and carries every label: one
// covers the sample it names, the other puts the collision mark between a dot
// and its own label. Neither is visible to a count.
//
// **And the last one is the arm the field would otherwise be ignored at**, which
// is `calloutInto`'s recorded hazard arriving at its second member.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const PL = "src/presentation/plot/pointlabels.ts";
const DEF = "src/presentation/plot/definition.ts";
const VAL = "src/data/viewmodel/validate.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/unit/plot-point-labels.test.ts 2>&1", {
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
    file: DEF,
    from: "  const names = pointLabelRows(",
    to: "  const names = [] as readonly (readonly string[])[]; void pointLabelRows(",
    why:
      "the overlay computed and never layered: every row here asserts a name in a frame, so a " +
      "run that cannot see the names vanish can see nothing below it",
  },
  mutations: [
    {
      // **The ruling the walk got wrong, restored.** Clamping the span into the
      // area keeps every label inside and every row the right width — and slides
      // the label over the sample it names.
      name: "a label at the edge slides inward instead of flipping",
      file: PL,
      from: "        if (start < 0 || start + span > areaWidth) continue; // cells-ok — a cell count",
      to: "        start = Math.min(Math.max(0, start), Math.max(0, areaWidth - span)); // cells-ok — a cell count",
      expect: "TL10",
    },
    {
      // **The asymmetry the frame found.** Self-consistent arithmetic, and the
      // mark lands between a dot and its own name on one of the two sides.
      name: "the reserved cell is at the far end on both sides",
      file: PL,
      from: "        const reserved = toRight ? start + span - 1 : start; // cells-ok — a column position",
      to: "        const reserved = start + span - 1; // cells-ok — a column position",
      expect: "TL11",
    },
    {
      // A later label displaces an earlier one, so the frame depends on which of
      // two independent labels was considered first.
      name: "placement overwrites whatever is already there",
      file: PL,
      from: "        if (clash !== null) { blocker ??= clash; continue; }",
      to: "        if (clash !== null) { blocker ??= clash; }",
      expect: "TL11",
    },
    {
      // The displaced label vanishes with nothing said, which is the half of
      // C12 I8's principle that does survive into a label.
      name: "a displaced label is dropped in silence",
      file: PL,
      from: "        text[blocker.series]![row]![blocker.reserved] = \"+\";",
      to: "",
      expect: "TL11",
    },
    {
      // One column, many samples: `columnsOf` downsamples, so a long series
      // stacks strings at one x with nothing to tell them apart.
      name: "every labelled sample is drawn, downsampling or not",
      file: PL,
      from: "      if (taken.has(x)) continue; // cells-ok — a column position",
      to: "",
      expect: "TL14",
    },
    {
      // **The stacked arm**, which is where a member gets accepted and drawn
      // nowhere on exactly the terminals that need it most.
      name: "the names never reach the strips",
      file: DEF,
      from: "          mergedRow(strip.names === null ? [strip.layer] : [strip.names, strip.layer], i, withRight, ctx),",
      to: "          mergedRow([strip.layer], i, withRight, ctx),",
      expect: "TL12",
    },
    {
      // A band form draws sample `j` at a cumulative height, so a label placed
      // from the sample's own value names a row it is not on.
      name: "a band form may carry point labels",
      file: VAL,
      from: "  if (HAS_CALLOUT[form as PlotForm] === false) {\n    e.push(\n      `${where} on form ${JSON.stringify(form)} (C04 I63) — a point label sits beside the ` +",
      to: "  if (false) {\n    e.push(\n      `${where} on form ${JSON.stringify(form)} (C04 I63) — a point label sits beside the ` +",
      expect: "TL15",
    },
    {
      // An entry past the last reading names a sample that does not exist.
      name: "more labels than values is accepted",
      file: VAL,
      from: "  if (isArray(values) && labels.length > values.length) {",
      to: "  if (false && isArray(values) && labels.length > values.length) {",
      expect: "TL15",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
