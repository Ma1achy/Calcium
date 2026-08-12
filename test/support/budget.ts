/**
 * Timeouts for the tests that do real work, and the reason they are not the
 * default.
 *
 * **A source scan is not a slow test; it is a big one.** `checkSourceScans`
 * reads every `.ts` file under `src/` — 162 files, 27,381 lines, about 1 MB —
 * and runs 34 rules over each. One pass costs roughly 300 ms on an idle
 * machine, and several of these tests run more than one. The tree has roughly
 * doubled since these tests were written, and a default that was generous at 80
 * files is not at 162.
 *
 * Measured on an idle machine, worst test per file:
 *
 * | File | Worst |
 * |---|---|
 * | `edge/transcript` | 3.2 s |
 * | `contract/lifecycle` | 3.0 s |
 * | `contract/process` | 2.7 s |
 * | `contract/theme` | 2.6 s |
 * | `contract/session` | 2.1 s |
 * | `contract/capabilities` | 2.1 s |
 * | `edge/editor` | 1.5 s |
 * | `contract/table` | 1.4 s |
 * | `edge/process` | 1.1 s |
 * | `contract/blocks` | 1.0 s |
 *
 * **3.2 s against a 5 s default is not a margin**, and the whole suite runs
 * these files concurrently, so the number that matters is the loaded one. Three
 * consecutive full runs each timed out a *different* subset of them, and every
 * one passed on its own — which is worse than a slow suite. A suite you have to
 * re-run to trust is one where a real failure is eventually attributed to load
 * and dismissed, and the tier-5 rows still to be written are more load.
 *
 * C12 T2.1 is the same class and the precedent for the remedy: an explicit
 * budget, sized from a measurement, with the reason beside it.
 *
 * ---
 *
 * **Re-measured after four rows timed out in one day, and the budget was not the
 * problem.** T2.8 twice, T2.9 and T2.19 each hit 15 s inside a loaded run and
 * passed in ~2.8 s alone. The three candidates were *the budget is wrong*, *the
 * parallelism is wrong*, and *scan rows need their own lane*. It was none of
 * them.
 *
 * `checkSourceScans` read each file **once per rule**, and there are 34 — the
 * read sat inside the rule loop. So one pass over 179 files did **6,086 reads to
 * see 179 distinct files**, and the suite makes **43 passes**: 261,698 reads of a
 * tree that does not change while it is being read.
 *
 * | | before | after |
 * |---|---|---|
 * | one pass, idle | 411 ms | **89 ms** |
 * | the suite's 43 passes | 17.7 s of CPU | **3.8 s** |
 * | worst row in a loaded run | 15 s, timed out | 11 s |
 *
 * Read once per pass, with the loops otherwise untouched so no violation list
 * reorders. **This is why the numbers above stand rather than being raised** —
 * the instruction at the foot of this comment said re-measure instead of
 * raising, and re-measuring found work rather than a number.
 *
 * The tree has grown 162 → 179 files since the table above was taken, and the
 * per-file figures have not been re-taken; the pass figure has, and it is the
 * one that moved.
 *
 * **Do not raise these without knowing what they measure.** A scan that has
 * started taking twice as long is telling you the tree doubled or a rule became
 * quadratic, and both are worth knowing. Re-measure instead — the figures above
 * are what a later reader needs to tell a regression from growth.
 */

/**
 * For a file whose tests walk `src/`. Five times the worst measured, which is
 * the same ratio C12 T2.1 chose over its 3.2 s.
 */
export const SCAN_BUDGET_MS = 15_000;

/**
 * For a file whose work is bounded by its own fixture rather than by the
 * repository — a 1 MB paste, ten thousand blocks, a handful of real
 * subprocesses. Smaller than the scan budget because that work does not grow
 * underneath the number the way a tree walk does.
 */
export const CORPUS_BUDGET_MS = 10_000;

/**
 * For C06 T5.1 — a real binary emitting a large document, spawned, parsed,
 * adapted, measured and drawn.
 *
 * **This one is a claim about the product, not a test timeout.** The others
 * above bound how long a test may take before it is called stuck; this is the
 * "within budget" in the row's own sentence, so it is asserted rather than
 * merely configured, and it is the number that should move if the pipeline gets
 * slower.
 *
 * Measured through a real PTY session against `farside.mjs`, from the keystroke
 * that submits to the frame carrying the document, on an idle machine:
 *
 * | `ps --limit` | rows | measured |
 * |---|---|---|
 * | 500 | 500 | 0.2 s |
 * | 2,000 | 2,000 | 1.3 s |
 * | 5,000 | 5,000 | 2.0 s |
 * | 10,000 | 10,000 | 2.6 s |
 *
 * Sub-linear, which is C14 virtualising: the cost is the parse and the measure,
 * not the draw. The row uses 2,000 — large enough that a non-virtualised render
 * would show, small enough that the number is not dominated by JSON parsing.
 *
 * Four times the measured 1.3 s. A smaller ratio than the scan budgets take,
 * because this figure does not grow with the tree and a regression here is worth
 * hearing about early.
 */
export const DOCUMENT_BUDGET_MS = 5_000;
