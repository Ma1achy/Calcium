/**
 * C20 — persistence, redaction, navigation, reverse search.
 *
 * The barrel exports the store and the pieces its tests and L4 address
 * directly. `redact` and the codec are exported because the corpus in §7b is
 * asserted against the rule that fired, not only against the string that came
 * out: a right answer through the wrong rule is a redactor about to give a wrong
 * one for the next input.
 */

export { openHistory } from "./store.js";
export { redact, entropy, isExempt, REDACTED, type Fired, type Redaction, type Rule } from "./redact.js";
export { escape, unescape, load, collapse } from "./codec.js";
export {
  CONFIRM_ID,
  LIST_ID,
  SEARCH_ID,
  clearConfirmLayer,
  listBlocks,
  searchLayer,
  searchLine,
  stamp,
  type Listed,
} from "./layers.js";
export {
  COMPACT_SLACK,
  DEFAULT_CAP,
  type Anchor,
  type HistoryDeps,
  type HistoryEntry,
  type HistoryFs,
  type HistoryStore,
  type SearchAction,
  type SearchHit,
  type SearchState,
} from "./types.js";
