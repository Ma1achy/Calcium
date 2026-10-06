// A03 SP16's third arm — **the titled rows that name an id no spec declares**,
// keyed `spec id file` and compared **by equality** (F1500).
//
// A row here is titled with an id its attributed spec does not declare, and
// the file's owner does not either. So nothing the row asserts can be checked
// against what a spec says it should: SP9 counts its citations, SP15 counts its
// file, and neither can say whether the row is the one the spec meant.
//
// **What each entry owes is one of two things**, and which is the reader's
// judgement rather than the rule's: a row in its spec, declaring what the test
// already asserts; or a title naming the spec and id that already declare it
// (`C28 T1.90`), where the test is another spec's row under the right number.
//
// **The reasons, from the classification that produced the list.** Every
// entry was classified from `checkRowResolves`' own output, none sampled:
//
// - *no spec declares it* — the id is in no spec at all. A test written
//   ahead of its row, or a row whose letter suffix (`T1.25b`) the spec never
//   took;
// - *Cxx's id is another row* (or *Cxx, Cyy … declare it for other rows*) —
//   the number is taken elsewhere, about something else. Each was compared
//   with the declaring rows by title and by citation; the titles that were
//   the same row were retitled instead (`C28 T1.90` among them) and are not here.
//
// The list can only shrink: a new titled row with no spec row fails the
// commit that adds it, and an entry whose row is declared fails until it is
// removed. The rule is `checkRowResolves` in `commitments.mjs`.
export const DANGLING_ROWS = Object.freeze([
  // C01
  "C01 T1.9 test/unit/lifecycle.test.ts", // C02, C03 and 25 more declare T1.9 for other rows
  "C01 T1.18 test/unit/sgr.test.ts", // C03, C04 and 13 more declare T1.18 for other rows
  "C01 T1.19 test/unit/sgr.test.ts", // C03, C04 and 12 more declare T1.19 for other rows
  "C01 T1.19b test/unit/sgr.test.ts", // C05 and C22 declare T1.19b for other rows
  "C01 T1.25b test/unit/lifecycle.test.ts", // no spec declares it
  "C01 T1.26b test/unit/lifecycle.test.ts", // no spec declares it
  "C01 T1.27b test/unit/lifecycle.test.ts", // no spec declares it
  "C01 T1.27c test/unit/lifecycle.test.ts", // no spec declares it
  "C01 T4.1b test/integration/lifecycle.test.ts", // C22's T4.1b is another row
  "C01 T4.11b test/unit/session-frame.test.ts", // no spec declares it
  "C01 T5.5b test/e2e/frame-scheduler.test.ts", // C09's T5.5b is another row

  // C02
  "C02 T2.50 test/contract/ambiguous-width.test.ts", // C10's T2.50 is another row
  "C02 T2.51 test/contract/ambiguous-width.test.ts", // C10's T2.51 is another row
  "C02 T2.52 test/contract/ambiguous-width.test.ts", // C10's T2.52 is another row
  "C02 T2.53 test/contract/ambiguous-width.test.ts", // C10's T2.53 is another row
  "C02 T2.54 test/contract/ambiguous-width.test.ts", // C10's T2.54 is another row
  "C02 T2.74 test/contract/spinners.test.ts", // C10's T2.74 is another row
  "C02 T2.75 test/contract/spinners.test.ts", // C10's T2.75 is another row
  "C02 T2.81 test/contract/mermaid.test.ts", // C10's T2.81 is another row
  "C02 T2.84m test/contract/art.test.ts", // no spec declares it
  "C02 T2.91 test/contract/bars.test.ts", // no spec declares it
  "C02 T3.5b test/edge/capabilities.test.ts", // C14, C15 and 2 more declare T3.5b for other rows
  "C02 T4.4a test/integration/capabilities.test.ts", // C24's T4.4a is another row
  "C02 T5.4b test/e2e/capabilities.test.ts", // no spec declares it
  "C02 T6.2b test/revert/capabilities.test.ts", // no spec declares it

  // C03
  "C03 T1.19b test/unit/frame-scheduler.test.ts", // C05 and C22 declare T1.19b for other rows
  "C03 T2.8 test/contract/frame-scheduler.test.ts", // C01, C02 and 20 more declare T2.8 for other rows
  "C03 T4.9 test/integration/frame-scheduler.test.ts", // C05, C15 and 8 more declare T4.9 for other rows

  // C04
  "C04 T1.1b test/unit/view-model.test.ts", // C12 and C17 declare T1.1b for other rows
  "C04 T1.4b test/unit/blocks.test.ts", // C19 and C22 declare T1.4b for other rows
  "C04 T1.4c test/unit/blocks.test.ts", // C19's T1.4c is another row
  "C04 T1.4d test/unit/blocks.test.ts", // C22's T1.4d is another row
  "C04 T1.4e test/unit/blocks.test.ts", // C22's T1.4e is another row
  "C04 T1.4f test/unit/blocks.test.ts", // C22's T1.4f is another row
  "C04 T1.4g test/unit/blocks.test.ts", // C22's T1.4g is another row
  "C04 T1.4g2 test/unit/blocks.test.ts", // no spec declares it
  "C04 T1.4h test/unit/blocks.test.ts", // C22's T1.4h is another row
  "C04 T1.5a test/unit/blocks.test.ts", // no spec declares it
  "C04 T1.5b test/unit/blocks.test.ts", // no spec declares it
  "C04 T1.5c test/unit/blocks.test.ts", // no spec declares it
  "C04 T1.5d test/unit/blocks.test.ts", // no spec declares it
  "C04 T1.5e test/unit/blocks.test.ts", // no spec declares it
  "C04 T1.5f test/unit/blocks.test.ts", // no spec declares it
  "C04 T1.12b test/unit/view-model.test.ts", // C02, C12 and 2 more declare T1.12b for other rows
  "C04 T1.13b test/unit/view-model.test.ts", // no spec declares it
  "C04 T1.16b test/unit/view-model.test.ts", // C01, C09 and 2 more declare T1.16b for other rows
  "C04 T1.17b test/unit/view-model.test.ts", // C16's T1.17b is another row
  "C04 T1.19b test/unit/plot.test.ts", // C05 and C22 declare T1.19b for other rows
  "C04 T1.35b test/contract/refresh.test.ts", // no spec declares it
  "C04 T1.64 test/unit/plot-mutations.test.ts", // C09, C22 and 2 more declare T1.64 for other rows
  "C04 T1.65 test/unit/plot-mutations.test.ts", // C09, C22 and 2 more declare T1.65 for other rows
  "C04 T1.66 test/unit/plot-mutations.test.ts", // C09, C22 and 2 more declare T1.66 for other rows
  "C04 T1.69 test/unit/plot-mutations.test.ts", // C09, C12 and 3 more declare T1.69 for other rows
  "C04 T1.70 test/unit/plot-mutations.test.ts", // C09, C22 and 2 more declare T1.70 for other rows
  "C04 T1.71 test/unit/plot-mutations.test.ts", // C09, C12 and 4 more declare T1.71 for other rows
  "C04 T1.72 test/unit/plot-mutations.test.ts", // C09, C19 and 3 more declare T1.72 for other rows
  "C04 T1.73 test/unit/plot-mutations.test.ts", // C09, C22 and 2 more declare T1.73 for other rows
  "C04 T1.79 test/unit/plot-mutations.test.ts", // C09, C14 and 2 more declare T1.79 for other rows
  "C04 T2.0 test/contract/view-model.test.ts", // no spec declares it
  "C04 T2.10b test/contract/view-model.test.ts", // C11 and C21 declare T2.10b for other rows
  "C04 T2.10c test/contract/view-model.test.ts", // no spec declares it
  "C04 T2.11b test/contract/view-model.test.ts", // no spec declares it
  "C04 T2.12 test/contract/view-model.test.ts", // C01, C06 and 7 more declare T2.12 for other rows
  "C04 T2.13 test/contract/view-model.test.ts", // C01, C06 and 9 more declare T2.13 for other rows
  "C04 T2.13c test/contract/expect-document.test.ts", // C20's T2.13c is another row
  "C04 T2.13d test/contract/expect-document.test.ts", // no spec declares it
  "C04 T2.14 test/contract/view-model.test.ts", // C09, C10 and 4 more declare T2.14 for other rows
  "C04 T2.15 test/contract/view-model.test.ts", // C09, C10 and 4 more declare T2.15 for other rows
  "C04 T2.16 test/contract/view-model.test.ts", // C09, C10 and 6 more declare T2.16 for other rows
  "C04 T2.17 test/contract/view-model.test.ts", // C09, C10 and 4 more declare T2.17 for other rows
  "C04 T2.18b test/contract/sequence.test.ts", // no spec declares it
  "C04 T2.20 test/contract/scroll.test.ts", // C09, C10 and 2 more declare T2.20 for other rows
  "C04 T2.21 test/contract/scroll.test.ts", // C09, C23 and 1 more declare T2.21 for other rows
  "C04 T2.22 test/contract/scroll.test.ts", // C09, C10 and 2 more declare T2.22 for other rows
  "C04 T2.23 test/contract/scroll.test.ts", // C05, C10 and 2 more declare T2.23 for other rows
  "C04 T2.24 test/contract/scroll.test.ts", // C10 and C23 declare T2.24 for other rows
  "C04 T2.25 test/contract/scroll.test.ts", // C10's T2.25 is another row
  "C04 T2.26 test/contract/scroll.test.ts", // C10's T2.26 is another row
  "C04 T2.27 test/contract/scroll.test.ts", // C10's T2.27 is another row
  "C04 T2.28 test/contract/navigation-mosaic.test.ts", // C10's T2.28 is another row
  "C04 T2.28 test/contract/scroll.test.ts", // C10's T2.28 is another row
  "C04 T2.28b test/contract/scroll.test.ts", // no spec declares it
  "C04 T2.35b test/contract/scroll.test.ts", // no spec declares it
  "C04 T2.40 test/contract/scroll-follow.test.ts", // C10 and C22 declare T2.40 for other rows
  "C04 T2.41 test/contract/scroll-follow.test.ts", // C10's T2.41 is another row
  "C04 T2.42 test/contract/scroll-follow.test.ts", // C10's T2.42 is another row
  "C04 T2.43 test/contract/scroll-follow.test.ts", // C10's T2.43 is another row
  "C04 T2.44 test/contract/scroll-follow.test.ts", // C10's T2.44 is another row
  "C04 T2.47 test/contract/tool-call.test.ts", // C10 and C23 declare T2.47 for other rows
  "C04 T2.48 test/contract/tool-call.test.ts", // C10 and C23 declare T2.48 for other rows
  "C04 T2.63 test/contract/categorical.test.ts", // C10's T2.63 is another row
  "C04 T2.71 test/contract/categorical.test.ts", // C10's T2.71 is another row
  "C04 T2.95 test/contract/continuation.test.ts", // no spec declares it
  "C04 T2.97 test/contract/continuation.test.ts", // no spec declares it
  "C04 T2.148 test/contract/scroll.test.ts", // C09's T2.148 is another row
  "C04 T2.149 test/contract/scroll.test.ts", // C09's T2.149 is another row
  "C04 T3.15b test/edge/view-model.test.ts", // C22's T3.15b is another row
  "C04 T3.92 test/edge/blocks.test.ts", // no spec declares it
  "C04 T4.0 test/integration/view-model.test.ts", // no spec declares it
  "C04 T4.0b test/integration/view-model.test.ts", // no spec declares it
  "C04 T4.0c test/integration/view-model.test.ts", // no spec declares it
  "C04 T4.18e test/contract/render-cache.test.ts", // no spec declares it
  "C04 T4.41 test/integration/scroll-wiring.test.ts", // C14 and C23 declare T4.41 for other rows
  "C04 T4.62 test/unit/actions-expand.test.ts", // C09, C16 and 1 more declare T4.62 for other rows
  "C04 T4.63 test/unit/actions-expand.test.ts", // C09, C16 and 1 more declare T4.63 for other rows
  "C04 T6.7a test/revert/view-model.test.ts", // no spec declares it
  "C04 T6.7b test/revert/view-model.test.ts", // no spec declares it
  "C04 T6.18 test/revert/view-model.test.ts", // C01, C03 and 16 more declare T6.18 for other rows
  "C04 T6.19 test/revert/view-model.test.ts", // C01, C03 and 15 more declare T6.19 for other rows
  "C04 T6.95a test/revert/spans.test.ts", // no spec declares it

  // C05
  "C05 T1.16b test/unit/manifest.test.ts", // C01, C09 and 2 more declare T1.16b for other rows
  "C05 T1.20b test/unit/manifest.test.ts", // C22 and C25 declare T1.20b for other rows
  "C05 T2.6b test/contract/manifest.test.ts", // C22's T2.6b is another row
  "C05 T2.7b test/contract/manifest.test.ts", // no spec declares it
  "C05 T2.7c test/contract/manifest.test.ts", // no spec declares it
  "C05 T2.7d test/contract/manifest.test.ts", // no spec declares it
  "C05 T2.7e test/contract/manifest.test.ts", // no spec declares it
  "C05 T2.9b test/contract/parser.test.ts", // C03, C17 and 1 more declare T2.9b for other rows
  "C05 T2.9c test/contract/parser.test.ts", // no spec declares it
  "C05 T3.11b test/edge/manifest.test.ts", // C12, C13 and 1 more declare T3.11b for other rows
  "C05 T3.17b test/edge/manifest.test.ts", // no spec declares it
  "C05 T4.6b test/integration/manifest.test.ts", // C19's T4.6b is another row
  "C05 T4.8 test/integration/manifest.test.ts", // C02, C09 and 12 more declare T4.8 for other rows

  // C06
  "C06 T2.10 test/contract/transport.test.ts", // C01, C02 and 15 more declare T2.10 for other rows
  "C06 T2.11 test/contract/transport.test.ts", // C01, C04 and 11 more declare T2.11 for other rows
  "C06 T2.18 test/contract/sequence.test.ts", // C04, C09 and 3 more declare T2.18 for other rows
  "C06 T2.18c test/contract/sequence.test.ts", // no spec declares it
  "C06 T2.18d test/contract/sequence.test.ts", // no spec declares it
  "C06 T2.18e test/contract/sequence.test.ts", // no spec declares it
  "C06 T2.18f test/contract/sequence.test.ts", // no spec declares it
  "C06 T4.4b test/integration/transport.test.ts", // C01 and C24 declare T4.4b for other rows
  "C06 T4.5b test/integration/transport.test.ts", // C15's T4.5b is another row
  "C06 T5.1b test/e2e/transport.test.ts", // C28's T5.1b is another row
  "C06 T5.1c test/e2e/transport.test.ts", // C28's T5.1c is another row

  // C07
  "C07 T3.11b test/unit/adapters.test.ts", // C12, C13 and 1 more declare T3.11b for other rows
  "C07 T3.20a test/unit/execution.test.ts", // no spec declares it

  // C09
  "C09 T1.4l test/unit/session-keys.test.ts", // C22's T1.4l is another row
  "C09 T1.7b test/unit/blocks.test.ts", // C05, C13 and 1 more declare T1.7b for other rows
  "C09 T1.12b test/unit/blocks.test.ts", // C02, C12 and 2 more declare T1.12b for other rows
  "C09 T1.24 test/unit/blocks.test.ts", // C01, C03 and 7 more declare T1.24 for other rows
  "C09 T1.24 test/unit/text.test.ts", // C01, C03 and 7 more declare T1.24 for other rows
  "C09 T1.25 test/unit/text.test.ts", // C01, C03 and 8 more declare T1.25 for other rows
  "C09 T1.26 test/unit/text.test.ts", // C01, C03 and 7 more declare T1.26 for other rows
  "C09 T1.27b test/unit/text.test.ts", // no spec declares it
  "C09 T1.27c test/unit/text.test.ts", // no spec declares it
  "C09 T1.27d test/unit/text.test.ts", // no spec declares it
  "C09 T1.27e test/unit/text.test.ts", // no spec declares it
  "C09 T1.28b test/unit/text.test.ts", // no spec declares it
  "C09 T1.28c test/unit/text.test.ts", // no spec declares it
  "C09 T1.28d test/unit/text.test.ts", // no spec declares it
  "C09 T1.28e test/unit/text.test.ts", // no spec declares it
  "C09 T1.41h test/unit/semantic-selection.test.ts", // no spec declares it
  "C09 T1.119 test/unit/profile-deck.test.ts", // C12's T1.119 is another row
  "C09 T2.1b test/contract/blocks.test.ts", // C17 and C22 declare T2.1b for other rows
  "C09 T2.2b test/contract/blocks.test.ts", // no spec declares it
  "C09 T2.5b test/contract/blocks.test.ts", // no spec declares it
  "C09 T2.5c test/contract/blocks.test.ts", // no spec declares it
  "C09 T2.5d test/contract/blocks.test.ts", // no spec declares it
  "C09 T2.6b test/contract/blocks.test.ts", // C22's T2.6b is another row
  "C09 T2.6c test/contract/blocks.test.ts", // no spec declares it
  "C09 T2.71 test/contract/spinners.test.ts", // C10's T2.71 is another row
  "C09 T2.94 test/contract/continuation.test.ts", // no spec declares it
  "C09 T2.96 test/contract/continuation.test.ts", // no spec declares it
  "C09 T2.99 test/golden/continuation.test.ts", // no spec declares it
  "C09 T2.155b test/unit/glyph-presence.test.ts", // no spec declares it
  "C09 T2.159 test/contract/blocks.test.ts", // no spec declares it
  "C09 T2.160 test/contract/blocks.test.ts", // no spec declares it
  "C09 T2.162 test/contract/blocks.test.ts", // no spec declares it
  "C09 T3.8b test/unit/text.test.ts", // C13, C15 and 3 more declare T3.8b for other rows
  "C09 T3.9b test/unit/text.test.ts", // C13 and C19 declare T3.9b for other rows
  "C09 T3.9c test/unit/text.test.ts", // C13's T3.9c is another row
  "C09 T3.9d test/unit/text.test.ts", // no spec declares it
  "C09 T3.9e test/unit/text.test.ts", // no spec declares it
  "C09 T3.10b test/unit/text.test.ts", // C19 and C28 declare T3.10b for other rows
  "C09 T3.10c test/unit/text.test.ts", // no spec declares it
  "C09 T3.10d test/unit/text.test.ts", // no spec declares it
  "C09 T3.22 test/unit/execution.test.ts", // C01, C03 and 7 more declare T3.22 for other rows
  "C09 T3.39b test/edge/status.test.ts", // no spec declares it
  "C09 T3.42b test/edge/status.test.ts", // no spec declares it
  "C09 T3.42c test/edge/status.test.ts", // no spec declares it
  "C09 T4.3b test/integration/blocks.test.ts", // C17's T4.3b is another row
  "C09 T4.3c test/integration/blocks.test.ts", // no spec declares it
  "C09 T4.4b test/integration/blocks.test.ts", // C01 and C24 declare T4.4b for other rows
  "C09 T4.14 test/integration/notice-action.test.ts", // C15, C22 and 1 more declare T4.14 for other rows
  "C09 T4.17 test/integration/notice-action.test.ts", // C22 and C23 declare T4.17 for other rows
  "C09 T5.9 test/golden/padding.test.ts", // C02 and C16 declare T5.9 for other rows

  // C10
  "C10 T2.14d test/contract/theme.test.ts", // no spec declares it
  "C10 T2.29c test/contract/theme.test.ts", // no spec declares it
  "C10 T2.31 test/contract/colormap.test.ts", // C04 and C26 declare T2.31 for other rows
  "C10 T2.51b test/contract/theme.test.ts", // no spec declares it
  "C10 T2.55 test/contract/theme.test.ts", // no spec declares it
  "C10 T2.172 test/contract/theme.test.ts", // C09 and C26 declare T2.172 for other rows
  "C10 T5.1a test/e2e/theme.test.ts", // no spec declares it

  // C11
  "C11 T2.161 test/contract/table.test.ts", // no spec declares it
  "C11 T4.1b test/integration/table.test.ts", // C22's T4.1b is another row

  // C12
  "C12 T1.13b test/unit/plot.test.ts", // no spec declares it
  "C12 T1.24 test/unit/plot.test.ts", // C01, C03 and 7 more declare T1.24 for other rows
  "C12 T1.30 test/unit/plot.test.ts", // C01, C02 and 12 more declare T1.30 for other rows
  "C12 T1.46 test/unit/plot-mutations.test.ts", // C04, C09 and 8 more declare T1.46 for other rows
  "C12 T1.48 test/unit/plot-mutations.test.ts", // C04, C09 and 7 more declare T1.48 for other rows
  "C12 T1.53 test/unit/plot-mutations.test.ts", // C04, C09 and 4 more declare T1.53 for other rows
  "C12 T1.54 test/unit/plot-mutations.test.ts", // C04, C09 and 3 more declare T1.54 for other rows
  "C12 T1.55 test/unit/plot-mutations.test.ts", // C04, C09 and 2 more declare T1.55 for other rows
  "C12 T1.56 test/unit/plot-mutations.test.ts", // C04, C09 and 1 more declare T1.56 for other rows
  "C12 T1.60 test/unit/plot-mutations.test.ts", // C04, C09 and 4 more declare T1.60 for other rows
  "C12 T1.61 test/unit/plot-mutations.test.ts", // C04, C09 and 4 more declare T1.61 for other rows
  "C12 T1.62 test/unit/plot-mutations.test.ts", // C04, C09 and 4 more declare T1.62 for other rows
  "C12 T1.63 test/unit/plot-mutations.test.ts", // C09, C22 and 2 more declare T1.63 for other rows
  "C12 T1.74 test/unit/plot-mutations.test.ts", // C09, C22 and 2 more declare T1.74 for other rows
  "C12 T1.75 test/unit/plot-mutations.test.ts", // C09, C22 and 2 more declare T1.75 for other rows
  "C12 T1.76 test/unit/plot-mutations.test.ts", // C09, C14 and 3 more declare T1.76 for other rows
  "C12 T1.78 test/unit/plot-mutations.test.ts", // C09, C14 and 2 more declare T1.78 for other rows
  "C12 T1.82 test/unit/plot-mutations.test.ts", // C04, C09 and 2 more declare T1.82 for other rows
  "C12 T1.83 test/unit/plot-mutations.test.ts", // C04, C09 and 2 more declare T1.83 for other rows
  "C12 T1.84 test/unit/plot-mutations.test.ts", // C09 and C28 declare T1.84 for other rows
  "C12 T1.85 test/unit/plot-mutations.test.ts", // C09 and C28 declare T1.85 for other rows
  "C12 T1.89 test/unit/plot-mutations.test.ts", // C09 and C28 declare T1.89 for other rows
  "C12 T1.99 test/unit/plot-mutations.test.ts", // C16 and C23 declare T1.99 for other rows
  "C12 T1.99b test/unit/plot-mutations.test.ts", // C16's T1.99b is another row
  "C12 T1.100b test/unit/plot-mutations.test.ts", // no spec declares it
  "C12 T1.100c test/unit/plot-mutations.test.ts", // no spec declares it
  "C12 T1.100d test/unit/plot-mutations.test.ts", // no spec declares it
  "C12 T2.25 test/contract/block-elements.test.ts", // C10's T2.25 is another row
  "C12 T2.26 test/contract/block-elements.test.ts", // C10's T2.26 is another row
  "C12 T2.104 test/contract/mono-unicode.test.ts", // no spec declares it
  "C12 T2.105 test/contract/mono-unicode.test.ts", // no spec declares it
  "C12 T4.2a test/contract/builders.test.ts", // no spec declares it
  "C12 T4.7 test/integration/plot.test.ts", // C01, C02 and 17 more declare T4.7 for other rows
  "C12 T4.8 test/integration/plot.test.ts", // C02, C09 and 12 more declare T4.8 for other rows

  // C13
  "C13 T1.5c test/unit/session-config.test.ts", // no spec declares it
  "C13 T1.6b test/unit/transcript.test.ts", // C09's T1.6b is another row
  "C13 T1.7d test/unit/transcript.test.ts", // no spec declares it
  "C13 T1.7e test/unit/transcript.test.ts", // no spec declares it
  "C13 T1.7f test/unit/transcript.test.ts", // no spec declares it
  "C13 T1.7g test/unit/transcript.test.ts", // no spec declares it
  "C13 T1.9b test/unit/transcript.test.ts", // C18's T1.9b is another row
  "C13 T1.9c test/unit/transcript.test.ts", // C18's T1.9c is another row
  "C13 T1.9d test/unit/transcript.test.ts", // C18's T1.9d is another row
  "C13 T1.9e test/unit/transcript.test.ts", // C18's T1.9e is another row
  "C13 T1.9f test/unit/transcript.test.ts", // no spec declares it
  "C13 T2.8 test/contract/transcript.test.ts", // C01, C02 and 20 more declare T2.8 for other rows
  "C13 T2.30 test/contract/scroll.test.ts", // C04, C10 and 1 more declare T2.30 for other rows
  "C13 T3.12b test/edge/transcript.test.ts", // C06, C14 and 2 more declare T3.12b for other rows
  "C13 T4.1b test/integration/transcript.test.ts", // C22's T4.1b is another row
  "C13 T4.10 test/integration/transcript.test.ts", // C05, C14 and 5 more declare T4.10 for other rows
  "C13 T5.5 test/e2e/transcript.test.ts", // C01, C02 and 14 more declare T5.5 for other rows
  "C13 T6.14 test/revert/transcript.test.ts", // C01, C02 and 22 more declare T6.14 for other rows

  // C14
  "C14 T1.6b test/unit/viewport.test.ts", // C09's T1.6b is another row
  "C14 T1.16b test/unit/viewport.test.ts", // C01, C09 and 2 more declare T1.16b for other rows
  "C14 T1.41i test/unit/semantic-selection.test.ts", // no spec declares it
  "C14 T3.6b test/edge/viewport.test.ts", // C04's T3.6b is another row
  "C14 T4.1b test/integration/viewport.test.ts", // C22's T4.1b is another row
  "C14 T4.11f test/unit/session-frame.test.ts", // no spec declares it

  // C15
  "C15 T1.9b test/unit/overlay.test.ts", // C18's T1.9b is another row
  "C15 T2.1b test/contract/overlay.test.ts", // C17 and C22 declare T2.1b for other rows
  "C15 T4.11b test/integration/peek.test.ts", // no spec declares it
  "C15 T4.13 test/integration/peek.test.ts", // C22, C23 and 1 more declare T4.13 for other rows

  // C16
  "C16 T1.3g test/unit/router-focus.test.ts", // no spec declares it
  "C16 T1.3s test/unit/router-decode.test.ts", // no spec declares it
  "C16 T1.4h3 test/unit/session-keys.test.ts", // no spec declares it
  "C16 T1.4h4 test/unit/session-keys.test.ts", // no spec declares it
  "C16 T1.11b test/unit/router-dispatch.test.ts", // no spec declares it
  "C16 T1.11c test/unit/router-dispatch.test.ts", // no spec declares it
  "C16 T1.34 test/unit/router-keymap.test.ts", // C01, C04 and 11 more declare T1.34 for other rows
  "C16 T1.35 test/unit/router-keymap.test.ts", // C01, C04 and 10 more declare T1.35 for other rows
  "C16 T1.36 test/unit/router-keymap.test.ts", // C04, C09 and 11 more declare T1.36 for other rows
  "C16 T1.37b test/unit/router-keymap.test.ts", // C14's T1.37b is another row
  "C16 T1.41e test/unit/semantic-selection.test.ts", // no spec declares it
  "C16 T1.41f test/unit/router-dispatch.test.ts", // no spec declares it
  "C16 T1.41g test/unit/router-dispatch.test.ts", // no spec declares it
  "C16 T1.98b test/unit/router-dispatch.test.ts", // no spec declares it
  "C16 T1.99f test/unit/router-dispatch.test.ts", // no spec declares it
  "C16 T1.102b test/unit/router-dispatch.test.ts", // no spec declares it
  "C16 T1.103b test/unit/router-dispatch.test.ts", // no spec declares it
  "C16 T1.158 test/unit/router-keymap.test.ts", // no spec declares it
  "C16 T1.159 test/unit/router-keymap.test.ts", // no spec declares it
  "C16 T1.159b test/unit/router-keymap.test.ts", // no spec declares it
  "C16 T1.159c test/unit/router-keymap.test.ts", // no spec declares it
  "C16 T1.159d test/unit/router-keymap.test.ts", // no spec declares it
  "C16 T1.159e test/unit/router-keymap.test.ts", // no spec declares it
  "C16 T1.159f test/unit/router-dispatch.test.ts", // no spec declares it
  "C16 T2.4f test/unit/router-keymap.test.ts", // C04's T2.4f is another row
  "C16 T2.9 test/unit/router-decode.test.ts", // C01, C02 and 20 more declare T2.9 for other rows
  "C16 T2.12 test/unit/router-keymap.test.ts", // C01, C06 and 7 more declare T2.12 for other rows
  "C16 T2.16b test/unit/router-keymap.test.ts", // no spec declares it
  "C16 T3.12c test/unit/router-dispatch.test.ts", // C14's T3.12c is another row
  "C16 T4.5b test/integration/confirm.test.ts", // C15's T4.5b is another row
  "C16 T4.11 test/integration/confirm.test.ts", // C14, C15 and 3 more declare T4.11 for other rows
  "C16 T4.73b test/unit/session-mouse.test.ts", // no spec declares it
  "C16 T4.81b test/integration/confirm.test.ts", // no spec declares it
  "C16 T5.1b test/e2e/view-model.test.ts", // C28's T5.1b is another row

  // C17
  "C17 T2.11 test/unit/router-keymap.test.ts", // C01, C04 and 11 more declare T2.11 for other rows
  "C17 T2.40 test/unit/editor.test.ts", // C10 and C22 declare T2.40 for other rows
  "C17 T2.41 test/unit/editor.test.ts", // C10's T2.41 is another row
  "C17 T2.42 test/unit/editor.test.ts", // C10's T2.42 is another row
  "C17 T2.43 test/unit/editor.test.ts", // C10's T2.43 is another row
  "C17 T2.44 test/unit/editor.test.ts", // C10's T2.44 is another row
  "C17 T2.45 test/unit/editor.test.ts", // C10's T2.45 is another row
  "C17 T2.46 test/unit/editor.test.ts", // C10's T2.46 is another row
  "C17 T2.47 test/unit/editor.test.ts", // C10 and C23 declare T2.47 for other rows

  // C18
  "C18 T1.14b test/unit/parser.test.ts", // C16's T1.14b is another row
  "C18 T1.14c test/unit/parser.test.ts", // no spec declares it
  "C18 T1.14d test/unit/parser.test.ts", // no spec declares it
  "C18 T1.14e test/unit/parser.test.ts", // no spec declares it
  "C18 T1.16b test/unit/parser.test.ts", // C01, C09 and 2 more declare T1.16b for other rows
  "C18 T4.8b test/integration/parser.test.ts", // C19's T4.8b is another row

  // C19
  "C19 T4.7b test/integration/completion.test.ts", // C15's T4.7b states this claim and overlay.test.ts titles it; the menu's own is owed a C19 row

  // C20
  "C20 T1.4h3a test/unit/session-keys.test.ts", // no spec declares it
  "C20 T2.8b test/unit/session.test.ts", // no spec declares it

  // C22
  "C22 T1.4c test/unit/session-construct.test.ts", // C19's T1.4c is another row
  "C22 T1.4h2 test/unit/session-keys.test.ts", // no spec declares it
  "C22 T1.5b test/unit/session-config.test.ts", // no spec declares it
  "C22 T1.5b test/unit/session-paint.test.ts", // no spec declares it
  "C22 T1.5c test/unit/session-paint.test.ts", // no spec declares it
  "C22 T1.5d test/unit/session-config.test.ts", // no spec declares it
  "C22 T1.5e test/unit/session-config.test.ts", // no spec declares it
  "C22 T1.5f test/unit/session-config.test.ts", // no spec declares it
  "C22 T1.5f test/unit/session-paint.test.ts", // no spec declares it
  "C22 T1.5g test/unit/session-config.test.ts", // no spec declares it
  "C22 T1.11a test/unit/session-state.test.ts", // no spec declares it
  "C22 T1.11b test/unit/session-state.test.ts", // no spec declares it
  "C22 T1.11c test/unit/session-state.test.ts", // no spec declares it
  "C22 T1.11d test/unit/session-state.test.ts", // no spec declares it
  "C22 T1.11e test/unit/session-state.test.ts", // no spec declares it
  "C22 T1.30b test/integration/orbit-wiring.test.ts", // no spec declares it
  "C22 T1.38c test/integration/key-actions.test.ts", // no spec declares it
  "C22 T1.46e test/unit/session-paint.test.ts", // no spec declares it
  "C22 T1.56 test/unit/profiler-seams.test.ts", // C04, C09 and 1 more declare T1.56 for other rows
  "C22 T1.57 test/unit/profiler-seams.test.ts", // C04, C09 and 1 more declare T1.57 for other rows
  "C22 T2.7b test/unit/session-config.test.ts", // no spec declares it
  "C22 T2.7c test/unit/session-config.test.ts", // no spec declares it
  "C22 T3.7a test/unit/session-fallback.test.ts", // no spec declares it
  "C22 T3.8b test/unit/session-fallback.test.ts", // C13, C15 and 3 more declare T3.8b for other rows
  "C22 T3.8c test/unit/session-fallback.test.ts", // C16's T3.8c is another row
  "C22 T3.8c2 test/unit/session-fallback.test.ts", // no spec declares it
  "C22 T3.8d test/unit/session-fallback.test.ts", // C16's T3.8d is another row
  "C22 T3.9b test/integration/session.test.ts", // C13 and C19 declare T3.9b for other rows
  "C22 T3.9e test/integration/session.test.ts", // no spec declares it
  "C22 T3.9f test/integration/session.test.ts", // no spec declares it
  "C22 T3.12b test/unit/session-identity.test.ts", // C06, C14 and 2 more declare T3.12b for other rows
  "C22 T3.12c test/unit/session-identity.test.ts", // C14's T3.12c is another row
  "C22 T3.12d test/unit/session-identity.test.ts", // no spec declares it
  "C22 T3.15c test/unit/session-fallback.test.ts", // no spec declares it
  "C22 T4.9b test/unit/session-frame.test.ts", // C16's T4.9b is another row
  "C22 T4.9c test/unit/session-frame.test.ts", // no spec declares it
  "C22 T4.11c test/unit/session-frame.test.ts", // no spec declares it
  "C22 T4.12b test/unit/session-paint.test.ts", // no spec declares it
  "C22 T4.12c test/unit/session-paint.test.ts", // no spec declares it
  "C22 T4.12d test/unit/session-paint.test.ts", // no spec declares it
  "C22 T4.12e test/unit/session-paint.test.ts", // no spec declares it
  "C22 T4.12f test/unit/session-paint.test.ts", // no spec declares it
  "C22 T4.12g test/unit/session-paint.test.ts", // no spec declares it
  "C22 T4.18c test/contract/render-cache.test.ts", // no spec declares it
  "C22 T4.18d test/contract/render-cache.test.ts", // no spec declares it
  "C22 T4.21b test/e2e/lifecycle.test.ts", // no spec declares it
  "C22 T4.55 test/integration/deferred-height.test.ts", // C04's T4.55 is another row
  "C22 T5.8b test/e2e/session-gate.test.ts", // no spec declares it

  // C23
  "C23 T1.2b test/unit/execution.test.ts", // C19's T1.2b is another row
  "C23 T1.6b test/unit/execution.test.ts", // C09's T1.6b is another row
  "C23 T1.6c test/unit/execution.test.ts", // no spec declares it
  "C23 T1.8b test/unit/execution.test.ts", // C04 and C09 declare T1.8b for other rows
  "C23 T1.8c test/unit/execution.test.ts", // no spec declares it
  "C23 T1.14b test/unit/execution.test.ts", // C16's T1.14b is another row
  "C23 T1.14c test/unit/execution.test.ts", // no spec declares it
  "C23 T1.19 test/unit/execution.test.ts", // C03, C04 and 12 more declare T1.19 for other rows
  "C23 T1.20b test/unit/execution.test.ts", // C22 and C25 declare T1.20b for other rows
  "C23 T1.21b test/unit/execution.test.ts", // C22's T1.21b is another row
  "C23 T1.22 test/unit/execution.test.ts", // C01, C03 and 13 more declare T1.22 for other rows
  "C23 T1.36b test/contract/refresh.test.ts", // no spec declares it
  "C23 T2.25 test/contract/refresh.test.ts", // C10's T2.25 is another row
  "C23 T2.46 test/contract/tool-call.test.ts", // C10's T2.46 is another row
  "C23 T2.98 test/contract/continuation.test.ts", // no spec declares it
  "C23 T3.19 test/unit/execution.test.ts", // C01, C03 and 15 more declare T3.19 for other rows
  "C23 T3.30b test/contract/refresh.test.ts", // no spec declares it
  "C23 T3.48 test/contract/navigation-pills.test.ts", // C09's T3.48 is another row
  "C23 T3.60b test/contract/refresh.test.ts", // no spec declares it
  "C23 T3.61b test/contract/refresh.test.ts", // no spec declares it
  "C23 T3.61c test/contract/refresh.test.ts", // no spec declares it
  "C23 T3.61d test/contract/refresh.test.ts", // no spec declares it
  "C23 T3.80 test/edge/emulator.test.ts", // C04 and C09 declare T3.80 for other rows
  "C23 T3.80b test/edge/emulator.test.ts", // no spec declares it
  "C23 T4.5b test/integration/process.test.ts", // C15's T4.5b is another row
  "C23 T4.40b test/integration/running-card.test.ts", // no spec declares it
  "C23 T4.82b test/integration/confirm.test.ts", // no spec declares it

  // C24
  "C24 T1.4b test/contract/builders.test.ts", // C19 and C22 declare T1.4b for other rows
  "C24 T1.6a test/contract/builders.test.ts", // no spec declares it
  "C24 T1.6b test/contract/builders.test.ts", // C09's T1.6b is another row
  "C24 T1.10c test/unit/profiler-seams.test.ts", // no spec declares it
  "C24 T1.38b test/integration/key-actions.test.ts", // C14's T1.38b is another row
  "C24 T2.12b test/contract/builders.test.ts", // C06 and C08 declare T2.12b for other rows
  "C24 T2.12c test/contract/builders.test.ts", // C08's T2.12c is another row
  "C24 T2.13b test/contract/expect-document.test.ts", // C16 and C20 declare T2.13b for other rows
  "C24 T2.24 test/contract/expect-document.test.ts", // C10 and C23 declare T2.24 for other rows
  "C24 T2.33 test/contract/scroll.test.ts", // C04 and C26 declare T2.33 for other rows

  // C25
  "C25 T1.1b test/unit/patch.test.ts", // C12 and C17 declare T1.1b for other rows
  "C25 T2.2a test/contract/patch.test.ts", // no spec declares it
  "C25 T3.14 test/edge/patch.test.ts", // C01, C02 and 20 more declare T3.14 for other rows
  "C25 T3.15 test/edge/patch.test.ts", // C01, C03 and 18 more declare T3.15 for other rows
  "C25 T3.16 test/edge/patch.test.ts", // C01, C03 and 17 more declare T3.16 for other rows
  "C25 T3.20b test/edge/patch.test.ts", // C22's T3.20b is another row
  "C25 T6.12 test/revert/patch.test.ts", // C01, C02 and 24 more declare T6.12 for other rows
  "C25 T6.13 test/revert/patch.test.ts", // C01, C02 and 23 more declare T6.13 for other rows
  "C25 T6.14 test/revert/patch.test.ts", // C01, C02 and 22 more declare T6.14 for other rows

  // C26
  "C26 T1.3f test/unit/router-focus.test.ts", // no spec declares it
  "C26 T1.3g test/unit/router-focus.test.ts", // no spec declares it
  "C26 T1.15 test/unit/session-keys.test.ts", // C02, C03 and 20 more declare T1.15 for other rows
  "C26 T1.16 test/unit/session-keys.test.ts", // C01, C02 and 17 more declare T1.16 for other rows
  "C26 T1.17 test/unit/session-keys.test.ts", // C01, C02 and 16 more declare T1.17 for other rows
  "C26 T1.25 test/unit/render-focus.test.ts", // C01, C03 and 8 more declare T1.25 for other rows
  "C26 T1.26 test/unit/render-focus.test.ts", // C01, C03 and 7 more declare T1.26 for other rows
  "C26 T1.27 test/unit/render-focus.test.ts", // C01, C03 and 8 more declare T1.27 for other rows
  "C26 T1.28 test/unit/render-focus.test.ts", // C01, C09 and 8 more declare T1.28 for other rows
  "C26 T1.29 test/unit/render-focus.test.ts", // C01, C02 and 9 more declare T1.29 for other rows
  "C26 T2.6b test/unit/router-dispatch.test.ts", // C22's T2.6b is another row
  "C26 T2.16b test/contract/navigation-pills.test.ts", // no spec declares it
  "C26 T2.16d test/contract/navigation-pills.test.ts", // no spec declares it
  "C26 T2.17 test/contract/block-elements.test.ts", // C09, C10 and 4 more declare T2.17 for other rows
  "C26 T2.17a test/contract/block-elements.test.ts", // no spec declares it
  "C26 T2.20 test/contract/block-elements.test.ts", // C09, C10 and 2 more declare T2.20 for other rows
  "C26 T2.27 test/contract/navigation-mosaic.test.ts", // C10's T2.27 is another row
  "C26 T2.174 test/contract/block-elements.test.ts", // C09's T2.174 is another row
  "C26 T3.40 test/unit/session-navigation.test.ts", // C09, C22 and 1 more declare T3.40 for other rows
  "C26 T3.41 test/unit/session-navigation.test.ts", // C09, C22 and 1 more declare T3.41 for other rows
  "C26 T3.42 test/unit/session-navigation.test.ts", // C09 and C22 declare T3.42 for other rows
  "C26 T3.43 test/unit/session-navigation.test.ts", // C09's T3.43 is another row
  "C26 T3.44 test/unit/session-navigation.test.ts", // C09's T3.44 is another row
  "C26 T3.45 test/unit/session-navigation.test.ts", // C09's T3.45 is another row
  "C26 T3.46 test/unit/session-navigation.test.ts", // C09's T3.46 is another row
  "C26 T3.47 test/contract/navigation-pills.test.ts", // C09's T3.47 is another row
  "C26 T3.47 test/unit/session-navigation.test.ts", // C09's T3.47 is another row
  "C26 T3.48 test/unit/session-navigation.test.ts", // C09's T3.48 is another row
  "C26 T3.49 test/contract/block-elements.test.ts", // C04's T3.49 is another row
  "C26 T3.49 test/unit/session-navigation.test.ts", // C04's T3.49 is another row
  "C26 T3.50 test/unit/session-navigation.test.ts", // C04's T3.50 is another row
  "C26 T3.51 test/unit/session-navigation.test.ts", // C04's T3.51 is another row
  "C26 T3.52 test/unit/session-navigation.test.ts", // C04's T3.52 is another row
  "C26 T3.53 test/unit/session-navigation.test.ts", // C04 and C09 declare T3.53 for other rows
  "C26 T4.42 test/integration/scroll-wiring.test.ts", // C14 and C23 declare T4.42 for other rows

  // C27
  "C27 T3.11 test/edge/emulator.test.ts", // C01, C02 and 24 more declare T3.11 for other rows

  // C28
  "C28 T1.9b test/unit/blocks.test.ts", // C18's T1.9b is another row
  "C28 T1.15b test/unit/profiler-seams.test.ts", // C05 and C19 declare T1.15b for other rows
  "C28 T1.15c test/unit/profiler-seams.test.ts", // no spec declares it
  "C28 T1.115 test/unit/profile-deck.test.ts", // C12's T1.115 is another row
  "C28 T1.116 test/unit/profile-deck.test.ts", // C12's T1.116 is another row
  "C28 T1.117 test/unit/profile-deck.test.ts", // C12's T1.117 is another row
  "C28 T1.118 test/unit/profile-deck.test.ts", // C12's T1.118 is another row
  "C28 T1.128b test/unit/local-profile.test.ts", // no spec declares it
  "C28 T2.4b test/unit/profiler-seams.test.ts", // C08, C16 and 2 more declare T2.4b for other rows
  "C28 T3.4b test/unit/profiler-seams.test.ts", // no spec declares it
  "C28 T3.6b test/unit/profiler-gauges.test.ts", // C04's T3.6b is another row
  "C28 T3.20 test/unit/profile-deck.test.ts", // C01, C03 and 14 more declare T3.20 for other rows
  "C28 T3.21 test/unit/profile-deck.test.ts", // C01, C03 and 10 more declare T3.21 for other rows
  "C28 T3.22 test/unit/profile-deck.test.ts", // C01, C03 and 7 more declare T3.22 for other rows
]);
