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
 * ---
 *
 * **Re-measured with a stated method, and 89 ms reproduces.** Discard the cold
 * pass, take the median of five: **70, 71, 71, 75, 78 ms** on a settled host.
 * The recorded figure stands and is if anything conservative.
 *
 * **It did not reproduce on the first attempt, and why is the finding.** Three
 * runs immediately after a full gate gave **125, 230, 132 ms** — a spread of
 * nearly 2× and a ratio of 2.4× — at a load average whose *one-minute* figure
 * was 0.02. That reads as an idle host and the host was not idle: the five- and
 * fifteen-minute figures were 1.04 and 1.39, so it was a machine that had just
 * stopped working, with its page cache and clocks still recovering.
 *
 * **A one-minute load average is the wrong instrument for *is this quiet now*,
 * and it is the instrument nearest to hand.** The correction was one command
 * from being written into this file as *the honest figure is a range* — a false
 * retraction of a true number, in the document whose whole job is to be the
 * record a later reader trusts. What caught it was re-running after the machine
 * settled, which is the case that would falsify the falsification.
 *
 * So the method is part of the figure and not a footnote: a number here without
 * one cannot be reproduced, and *the figures above are what a later reader
 * needs to tell a regression from growth* is a claim a single unlabelled sample
 * cannot support in either direction.
 *
 * ---
 *
 * **Re-measured after a reboot, and every budget below stays where it is.**
 *
 * The host these figures were taken on had been up thirteen days. Post-reboot,
 * settled to `0.01 / 0.01 / 0.00` on all three averages and given a discarded
 * warm-up first, five runs gave **65, 65, 65, 66, 66 ms** — a spread of 1 ms
 * against the pre-reboot settled run's 70–78, and **0.7×** the recorded 89.
 *
 * **The variance is the finding, not the mean.** 11% spread became 1.5%. A
 * machine that looked settled by every instrument to hand was still carrying
 * something; a rebooted one is not. That is F155's lesson again from the other
 * side — there, a number reading as idle meant load had just left; here, the
 * quietest reading available on a long-lived host is still noisier than a cold
 * boot's.
 *
 * | | pre-reboot, settled | post-reboot, settled |
 * |---|---|---|
 * | scan pass | 70–78 ms | **65–66 ms** |
 * | tiers 1–4, whole suite | 45.9 s (best of three) | **18.8 s** |
 * | tier 5, whole tier | 228 s, then 371 s | **196.7 s** |
 *
 * **The e2e drift closes, and the answer is the machine.** 228 → 371 s across
 * one session was recorded as observed and unexplained; 196.7 s post-reboot is
 * faster than either, so it was not the tree. Recorded rather than deleted: the
 * next unexplained wall-clock growth on a long-lived host has a precedent now,
 * and the cheap thing to try first.
 *
 * **Nothing below is lowered.** The instruction at the foot of this comment is
 * about raising, and it is silent on lowering for the reason a reader might
 * miss: a budget tightened to a rebooted developer machine is one that fails on
 * every other machine, and CI is the one that matters. The numbers move; the
 * thresholds do not.
 *
 * Headroom as it now stands, worst row per budget on the quiet host:
 *
 * | budget | worst row | headroom |
 * |---|---|---|
 * | `SCAN_BUDGET_MS` 15 s | T2.8, 1.05 s | **14×** |
 * | vitest's 5 s default | T3.13, 3.02 s | 1.7× |
 * | tier 5's 75 s | T5.6 and T5.2, **60.4 s** | **1.25×** |
 *
 * **Tier 5's margin is not a multiple of a measured cost and that is why it
 * fails first.** Its two longest rows *sleep* — sixty seconds idle, sixty
 * seconds of streaming — so 75 s is a fixed 60 s floor plus 15 s of slack for
 * everything around it. No amount of a quiet host shortens the floor. A scan
 * row has fourteen times its cost in hand and a tier-5 row has a quarter,
 * which is the whole explanation for why every contention failure this session
 * landed in tier 5 or on a fuzz row and never on a scan.
 *
 * The four scan rows that timed out at 15 s earlier in that session did so at
 * roughly **fourteen times** their quiet cost. That is a statement about the
 * host, not about the budget, and it is the sentence `make regime` exists to
 * put in a run's own output.
 *
 * ** is the method, executable.** It prints this machine's
 * figure beside both recorded ones and their ratio, and CI runs it — because a
 * budget is a claim about a regime, and a runner is not this regime. It does
 * not fail: a slow machine is information, and a gate that goes red on a busy
 * one teaches people to re-run gates.
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
