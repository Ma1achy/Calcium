/**
 * A01 Appendix B's budget gate and its four siblings — re-exported.
 *
 * **The implementation is `src/shell/profiling/checks.ts` and this is the
 * dev-only door onto it** (C24 I8, F1136). It was written here, and that was
 * right while every consumer was a test; C28's verdict card **reads**
 * `checkBudget`'s rows rather than recomputing them (C28 I55), which makes the
 * shell a consumer — and a module outside `testing/` importing one puts the
 * whole dev entry point in the production bundle, which MG26 refuses.
 *
 * A budget check is a *reading of a report*: it takes a published value and
 * returns a verdict. Nothing about it was ever a test helper except where it was
 * first written down.
 */
export {
  BUDGET,
  REPEATED_ABOVE,
  checkBudget,
  checkElementCost,
  checkEntryCost,
  checkLeaks,
  checkPhases,
  formatBudget,
  formatElementCost,
  formatEntryCost,
  formatLeaks,
  formatPhases,
} from "../shell/profiling/checks.js";
export type {
  BudgetOptions,
  BudgetReport,
  BudgetResult,
  BudgetRow,
  BudgetVerdict,
  ElementCostReport,
  ElementCostRow,
  EntryCostReport,
  EntryCostRow,
  LeakReport,
  LeakRow,
  MeasuredRow,
  PhaseReport,
  PhaseRow,
  UnansweredRow,
} from "../shell/profiling/checks.js";
