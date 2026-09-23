// C25 I22 — a window is built over a plan derived once per block and width: the
// rows, the start rows, the header rows and the pinned gutter, read by every
// window function, and the patch-taking signatures deriving it themselves.
// Mutated (T6.30, F1187).
//
// **No golden can see any of this.** The plan holds the same rows at another
// address, so every window is byte-identical by construction — which is the
// property T1.24 asserts directly: plan against no plan at every offset, two
// heights, both layouts, over the corpus. What a cut can move is the plan's
// lists against the patch-taking functions, the refusal of a foreign plan, and
// the ceiling (T2.12), whose search now walks the plan's start rows.
//
// **The control is the freeze dropped from the start rows.** No byte of any
// window moves — the list is read, never written — and T1.24's frozen arm sees
// it.
//
// **Recorded, not applied**: the plan rebuilt inside `build` on every probe
// fails nothing — byte-identical, and about fifteen times the walks — which is
// the bench's to see (`tools/bench/patch-window.mjs`, `out/probe-f1187-view.mjs`)
// and not a row's. T6.30 says so.
//
// **Three mutations went in M9b** (C25 §3b, R-EXA-082, F1251): the ceiling
// search, the header-row list and the builder's gutter-from-slice. Each named a
// line of the offset half of `window.ts` — `bottomOffset`, `WindowPlan.headers`,
// `build` — and that half had one caller, the pushed patch view, which is
// deleted. What survives is the transcript route: the plan, `windowRows`, and
// the pin, which are the mutations left here.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/patch-window.test.ts test/edge/patch.test.ts";
const W = "src/presentation/patch/window.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: W,
    from: "    starts: Object.freeze(starts),",
    to: "    starts,",
    why: "the start rows unfrozen: no byte of any window moves and T1.24's frozen arm sees it",
  },
  mutations: [
    {
      // **Every row a start.** The bottom search may land inside a run; the
      // planned clamp still equals the unplanned one (both read the plan), so
      // what sees it is T1.24's fixed-point arm — starts up to the ceiling
      // against the offsets the clamp leaves alone.
      name: "STARTS-EVERY-ROW: a unit's interior rows are rows a window may begin at",
      file: W,
      from: "    if (row.kind !== \"body\" || row.first) starts.push(i);",
      to: "    starts.push(i);",
      expect: "T1.24",
    },
    {
      // **The gutter not derived.** Every window's pin is one cell; T1.24's
      // numberWidth arm and the view's pin row (T3.20) both see it.
      name: "GUTTER-CONSTANT: the plan's pinned gutter is a constant, not the block's",
      file: W,
      from: "    numberWidth: numberWidth(patch),\n  });\n}",
      to: "    numberWidth: 1,\n  });\n}",
      expect: "T1.24",
    },
    {
      // **The refusal weakened to both axes.** A plan for the same block at the
      // other width is read, and slices the other layout's lines by these rows.
      name: "REFUSAL-BOTH-AXES: a plan is refused only when block and width both differ",
      file: W,
      from: "  if (plan.patch !== patch || plan.width !== width) {",
      to: "  if (plan.patch !== patch && plan.width !== width) {",
      expect: "T1.24",
    },
    {
      // **Every row walked again** (C25 I22, F1191). The bytes are the same and
      // the cost is the patch's; T1.25's recording proxy sees the indices
      // outside the window.
      name: "WALK-EVERY-ROW: windowRows walks the plan's rows from the first to the last",
      file: W,
      from: "  for (let i = lo; i < hi; i += 1) {\n    const row = rows[i];\n    if (row === undefined) break;",
      to: "  for (let i = 0; i < rows.length; i += 1) {\n    const row = rows[i];\n    if (row === undefined || i < lo || i >= hi) continue;",
      expect: "T1.25",
    },
    {
      // **The last body row taken for the first.** A window inside a hunk
      // slices the wrong lines; T1.25's byte equality and its scan both see it.
      name: "BODYSTART-LAST: bodyStarts hold each hunk's last body row",
      file: W,
      from: "    if (row.kind === \"body\" && bodyStarts[row.hunk] === -1) bodyStarts[row.hunk] = i;",
      to: "    if (row.kind === \"body\") bodyStarts[row.hunk] = i;",
      expect: "T1.25",
    },
    {
      // **The held plan read without the block check** (C25 I22). A twin sharing
      // the hunks array is windowed by the other patch's plan — the path and
      // the header rows are the wrong block's. T1.26's shared-array arm.
      name: "PLAN-UNCHECKED: a held plan is read for any block sharing the hunks array",
      file: W,
      from: "  return p.patch === patch && p.width === width && Array.isArray(p.rows);",
      to: "  return p.width === width && Array.isArray(p.rows);",
      expect: "T1.26",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
