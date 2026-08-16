// C12's absent ordinate, mutated.
//
// **The defect this restores was written down as an assertion.** `T1.13`
// expected `sparkline([NaN, 1, 2], 3)` to be `" ▁█"` — a leading blank at the
// gap, which is the same character the right-anchor draws when there are fewer
// samples than cells. The row passed for six months and the thing it asserted
// was the bug.
//
// So the rows here are indexed by **which half of I4 a mutation breaks**: the
// position surviving, or the marker being distinguishable from padding. A
// mutation that closes the gap and one that draws a blank there are different
// defects, and only the second is invisible in an interior position.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot.test.ts test/contract/plot.test.ts test/edge/plot.test.ts";
const SPARK = "src/presentation/plot/sparkline.ts";

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
    file: SPARK,
    from: "    if (v === null || !Number.isFinite(v)) return style.absent;",
    to: "    if (v === null || !Number.isFinite(v)) return ramp[0] ?? style.absent;",
    why: "a gap drawn as the lowest step is a reading that never happened; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **THE DEFECT, restored exactly.** Filter first, window the survivors —
      // the gap closes and the row comes back a glyph short.
      name: "THE DEFECT: the window is of readings, so a gap closes and the row shortens",
      file: SPARK,
      from:
        "  const window = values.slice(Math.max(0, values.length - w)); // cells-ok — a position count\n"
        + "  const readings = window.filter((v): v is number => v !== null && Number.isFinite(v));",
      to:
        "  const readings = values.filter((v): v is number => v !== null && Number.isFinite(v));\n"
        + "  const window = readings.slice(Math.max(0, readings.length - w)); // cells-ok",
      expect: "T1.13",
    },
    {
      // **The second half, and it is the one a green suite hides.** The
      // position survives and the gap draws a blank — indistinguishable from
      // the right-anchor padding at the window's left edge, which is exactly
      // where a bursty stall lands. Every length assertion still passes.
      name: "a gap draws a blank, which is what the padding already means",
      file: SPARK,
      from: '    if (v === null || !Number.isFinite(v)) return style.absent;',
      to: '    if (v === null || !Number.isFinite(v)) return " ";',
      expect: "T1.13",
    },
    {
      // The marker tiered by ramp. It would have to be a step of one to be
      // tiered, so it becomes a magnitude — and a `spark` column reads
      // differently on two terminals for the same data.
      name: "the marker is tiered, so absence becomes a magnitude",
      file: SPARK,
      from: 'const ABSENT = "?";',
      to: 'const ABSENT = "\\u00b7";',
      expect: "T1.13b",
    },
    {
      // The range taken over positions rather than readings: `NaN` poisons
      // `Math.min`/`Math.max`, so every glyph becomes the fallback and the
      // whole row is wrong rather than one cell of it.
      name: "the range is computed over positions, so one gap flattens the row",
      file: SPARK,
      from: "    min: Math.min(...readings),\n    max: Math.max(...readings),",
      to: "    min: Math.min(...window.map((v) => Number(v))),\n    max: Math.max(...window.map((v) => Number(v))),",
      expect: "T1.13",
    },
    {
      // All-non-finite must stay empty (§4), because the line form renders the
      // empty message for the same input. A row of markers is the sparkline
      // disagreeing with the plot in the other direction — which is the defect
      // this whole change exists to remove, arriving from the far side.
      name: "an all-absent series draws a row of markers instead of the empty result",
      file: SPARK,
      from: '  if (readings.length === 0) return " ".repeat(w); // cells-ok — a position count',
      to: "",
      expect: "T1.13",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
