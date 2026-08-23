// C12 I34 §3i — `plotDetail`'s scope, which it did not have (F220).
//
// **Every row here is about an absence.** The member is optional and defaults to
// `"auto"`, so no arrangement of it draws a wrong frame — the whole defect was a
// refusal that never happened, which is why no golden, frame-read or earlier
// mutation could reach it. The mutations therefore attack the *gates* and the
// *record*, and the control removes the record's only load-bearing rows.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const TYPES = "src/data/viewmodel/types.ts";
const VAL = "src/data/viewmodel/validate.ts";
const BUILD = "src/shell/builders/index.ts";
const DEF = "src/presentation/plot/definition.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/unit/plot-detail-scope.test.ts 2>&1", {
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
    file: TYPES,
    from: "  boxplot: true, violin: true,",
    to: "  boxplot: false, violin: false,",
    why:
      "the two forms that have a ladder marked as having none: the refusal then fires on all " +
      "forty-four and no row below can distinguish a scope from a blanket ban",
  },
  mutations: [
    {
      // **The state the member shipped in.** Accepted on every form, ignored on
      // forty-two, and every frame still correct — which is exactly why the
      // absence of this row was invisible for the life of the component.
      name: "the document gate accepts the member on every form",
      file: VAL,
      from: "    } else if (HAS_DETAIL_RUNGS[form as PlotForm] === false) {",
      to: "    } else if (false) {",
      expect: "PD1",
    },
    {
      // The author-facing half. `b.plot` is where a caller finds out, and the
      // validator is where an untrusted document does — this file's own words.
      name: "the builder gate accepts it on every form",
      file: BUILD,
      from: "    if (!HAS_DETAIL_RUNGS[drawn]) {",
      to: "    if (false) {",
      expect: "PD1",
    },
    {
      // A `true` with no ladder: the refusal stops firing for that form and
      // nothing starts drawing, so the caller's member is accepted and inert
      // again — one form at a time instead of forty-two.
      name: "a form with no ladder is marked as having one",
      file: TYPES,
      from: "  line: false, sparkline: false, heatmap: false, scatter: false, step: false,",
      to: "  line: true, sparkline: false, heatmap: false, scatter: false, step: false,",
      expect: "PD3",
    },
    {
      // The value check dropped, so an unknown rung name is carried into a
      // renderer that compares it against three literals and takes the default.
      name: "an unknown value is accepted where a ladder exists",
      file: VAL,
      from: '    if (pd !== "auto" && pd !== "compact" && pd !== "full") {',
      to: "    if (false) {",
      expect: "PD1",
    },
    {
      // **The agreement row's own subject.** Publishing a restated list rather
      // than `RUNGS`' keys lets the two halves of T2.10 be one mistake twice.
      name: "the published ladder list is restated rather than derived",
      file: DEF,
      from: "export const RUNG_FORMS: readonly string[] = Object.freeze(Object.keys(RUNGS));",
      to: 'export const RUNG_FORMS: readonly string[] = Object.freeze(["boxplot", "violin", "line"]);',
      expect: "PD3",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
