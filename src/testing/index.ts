/**
 * `tui-kit/testing` — C24 §7. Dev-only, and never in a production bundle (I8).
 *
 * **The two suites arrived by moving, not by rewriting.** Both were written in
 * `test/support/` under an explicit `DESTINATION: src/testing/` header,
 * deliberately runner-free and parameterised so that this day cost two import
 * paths. A second implementation of a working thing is the duplication this
 * project has removed four times, and the way to not do it a fifth is to write
 * the first one where it can move.
 *
 * **The two `formatReport`s are re-exported under distinct names.** They format
 * different reports — one a measurement disagreement, one a boundary assertion —
 * and a name collision resolved by whichever export came last is how a caller
 * gets the wrong formatter with no error at all.
 *
 * **`renderToLines` used to live here and does not.** It was never a consumer's
 * tool: it takes a `BlockRegistry`, which is one of the eleven components §3
 * keeps unreachable, so no consumer could construct one and call it. Exporting
 * it put an uncallable function on the surface *and* named an absent component
 * in this entry's declarations. It is `presentation/render-lines.ts` now, and
 * the public way to assert about a rendered document is `expectDocument` (§7).
 */

// --- the conformance suites, C24 §7 -----------------------------------------

export {
  DEFAULT_WIDTHS,
  checkAsciiParity,
  checkMeasurement,
  formatReport as formatMeasurementReport,
  uncoveredKinds,
  type Failure as MeasurementFailure,
  type ConformanceReport as MeasurementReport,
} from "./measurement-conformance.js";

export {
  EXIT_CODES,
  checkCorpus,
  checkResult,
  formatReport as formatBoundaryReport,
  type Assertion,
  type Finding,
  type ConformanceReport as BoundaryReport,
} from "./boundary-conformance.js";
