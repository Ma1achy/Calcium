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
