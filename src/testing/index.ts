/**
 * `@fmx/calcium/testing` — C24 §7. Dev-only, and never in a production bundle (I8).
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
 *
 * **What that left, and `lines()` is the repair.** Every assertion on this
 * surface measured or checked a *property*, and none returned a frame — so the
 * framework's own testing surface could not have caught the class the change
 * axis produced, where the rows say `added` and only the frame says `+` (F126).
 * `expectDocument().lines()` closes it the way the removal implied: the registry
 * stays interior, and the object that already holds one hands back what the
 * production renderer drew rather than asserting about it.
 */

// --- the document assertions, C24 §7 ----------------------------------------

export { expectDocument, type DocumentAssertions, type RenderOpts } from "./expect-document.js";

/**
 * What `b.live` declared (C24 §7, I24, F28).
 *
 * Here rather than on the runtime entry: the cost F28 measured is to testing, and
 * a production consumer reading back its own declaration holds a second record of
 * the document.
 */
export { liveParts, type LivePart } from "./live-parts.js";

/**
 * A `ProducerContext` a consumer can build (C24 §7).
 *
 * The same argument as `createAdapterRegistry` and `contextAt`: a producer the
 * framework can test and a consumer cannot is a producer whose app-side tests
 * assert against something the user never sees. `measure` is the real measurer,
 * because a fixture with an arithmetic of its own is the fake supplying the
 * behaviour under test.
 */
export { producerContext, localContext, FULL_CAPABILITIES } from "./producer-context.js";

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

// C26 §5 — the four predicates `elements` earns. Weaker than `window`'s single
// equality, and the strongest of them is vacuous today; the module says which
// premise that rests on.
export {
  checkElements,
  formatElementReport,
  type ElementFailure,
  type ElementReport,
  type NavigableRegistry,
} from "./navigation-conformance.js";
