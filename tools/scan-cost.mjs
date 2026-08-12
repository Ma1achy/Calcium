// What one source-scan pass costs **on the machine that is running it**.
//
// `test/support/budget.ts` sizes `SCAN_BUDGET_MS` from figures taken on an idle
// developer machine, and carries a standing instruction not to raise it without
// re-measuring. **The same instruction applies to reading one.** A budget is a
// claim about a regime, and the regime it was measured in is not the regime a
// CI runner is in — shared cores, a cold page cache, a noisy neighbour.
//
// Today's own evidence for that, measured rather than supposed: two C12/C14
// fuzz rows timed out at 5 s inside a `make test` run with probe PTYs on the
// host, and passed in 7.5 s alone. **The gate is its own load.** So a number
// taken on a quiet machine is precisely the one that fails first somewhere
// else, and the useful thing is not a tighter budget — it is knowing which
// regime the run was in when it went red.
//
// This prints that number and both recorded ones beside it. It **does not
// fail**: a slow runner is information, not a defect, and a gate that goes red
// on a busy machine teaches people to re-run gates.
import { readdirSync, statSync } from "node:fs";

import { checkSourceScans } from "./enforce/source-scans.mjs";

/** The figures `budget.ts` records, and the regime they were taken in. */
export const RECORDED = Object.freeze({
  regime: "an idle developer machine, in the devcontainer",
  beforeMsPerPass: 411,
  afterMsPerPass: 89,
  beforeSuiteS: 17.7,
  afterSuiteS: 3.8,
  /** `budget.ts`: "the suite makes 43 passes". */
  passes: 43,
  budgetMs: 15_000,
});

/**
 * The report, as a value — so a fixture can ask what it says rather than
 * scraping what it printed.
 *
 * **It refuses to report a figure it cannot have.** An instrument that prints a
 * plausible number after measuring nothing is `VERIFYING.md` §9's second class,
 * *fabricated from nothing*, and a timing tool is the natural home for it: zero
 * files scanned is very fast, and "0 ms/pass" reads as a triumph. Both a zero
 * file count and a non-finite median throw here instead.
 */
export function summarise(medianMs, fileCount, recorded = RECORDED) {
  if (!Number.isFinite(medianMs) || medianMs <= 0) {
    throw new Error(`scan-cost: a pass cannot take ${String(medianMs)} ms — nothing was measured`);
  }
  if (!Number.isInteger(fileCount) || fileCount <= 0) {
    throw new Error(`scan-cost: ${String(fileCount)} files scanned — there is nothing to time`);
  }
  return Object.freeze({
    files: fileCount,
    msPerPass: medianMs,
    suiteS: (medianMs * recorded.passes) / 1000,
    ratio: medianMs / recorded.afterMsPerPass,
  });
}

/** The median of a sample, which is what the run reports. */
export function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length === 0) throw new Error("scan-cost: no samples");
  return sorted[Math.floor(sorted.length / 2)];
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = `${dir}/${e}`;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/u.test(e) && !/\.d\.ts$/u.test(e)) out.push(p);
  }
  return out;
}

/** The lines the run prints, from a summary — so the fixture can read them. */
export function lines(s, recorded = RECORDED) {
  return [
    `files scanned            ${String(s.files)}`,
    `this machine             ${s.msPerPass.toFixed(0)} ms/pass · ~${s.suiteS.toFixed(1)} s across the suite's ${String(recorded.passes)} passes`,
    `recorded (${recorded.regime})`,
    `  before the read cache    ${String(recorded.beforeMsPerPass)} ms/pass · ${String(recorded.beforeSuiteS)} s`,
    `  after                    ${String(recorded.afterMsPerPass)} ms/pass · ${String(recorded.afterSuiteS)} s`,
    `this machine / recorded  ${s.ratio.toFixed(1)}×`,
    `SCAN_BUDGET_MS           ${String(recorded.budgetMs)} ms`,
  ];
}

/**
 * **Both numbers, so the next reader knows which regime a budget was set in.**
 *
 * Neither cancels the other and the comparison is the point: a ratio near 1
 * means the recorded figures carry, and a ratio of 5 means a red row on this
 * runner is about the runner. That is the sentence someone reading a foreign
 * failure needs, and it has to be in the run's own output — a figure that lives
 * only in a source comment is one they will not open while a job is red.
 */
export function notices(s, recorded = RECORDED) {
  return [
    `${s.msPerPass.toFixed(0)} ms/pass here against ${String(recorded.afterMsPerPass)} ms recorded on ${recorded.regime} — ${s.ratio.toFixed(1)}×.`,
    `Across the suite: ~${s.suiteS.toFixed(1)} s here against ${String(recorded.afterSuiteS)} s recorded (and ${String(recorded.beforeSuiteS)} s before the read cache).`,
    `SCAN_BUDGET_MS is ${String(recorded.budgetMs)} ms. If a scan row goes red here, read this ratio before touching the budget: budget.ts's standing instruction is to re-measure rather than raise.`,
  ];
}

/** Times the tree. Separated from the arithmetic so the fixture can skip it. */
export function measure(passes = 5) {
  const files = walk("src");

  // **The first pass is discarded, and that is a rule this repository already
  // paid for.** A monotone trend across runs is a signal about run order rather
  // than about the variable under test — 2897 → 6631 once read as a missing
  // environment variable and was warm-up. Here the cold read of ~1 MB is the
  // warm-up, and reporting it as the pass cost would overstate every runner.
  //
  // Measured, and it is not a small correction: three runs taken straight after
  // a full gate gave 125–230 ms where a settled host gives 70–78.
  checkSourceScans(files);

  const samples = [];
  for (let i = 0; i < passes; i++) {
    const t0 = performance.now();
    checkSourceScans(files);
    samples.push(performance.now() - t0);
  }
  return summarise(median(samples), files.length);
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  const s = measure();
  console.log(lines(s).join("\n"));
  if (process.env["GITHUB_ACTIONS"] === "true") {
    for (const n of notices(s)) console.log(`::notice title=scan-regime::${n}`);
  }
}
