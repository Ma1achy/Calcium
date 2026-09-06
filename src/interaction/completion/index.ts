/**
 * C19 — the completion engine.
 *
 * Sources, sequence numbers, ghost text. The manifest stops being bookkeeping
 * here: every verb, flag, sub-verb and enum value is a projection of C05, so a
 * flag added on the far side is completable with no TypeScript change.
 *
 * **The tokeniser and the quoter are C18's and are not re-exported from here.**
 * A consumer wanting either takes it from `interaction/parser`, because a second
 * route to one implementation is how a second implementation eventually gets
 * written behind it (I5, SS30).
 */

export { contextAt, accept } from "./context.js";
export {
  createEngine,
  createSourceErrorSink,
  SPINNER_MS,
  type CompletionEngine,
  type EngineOptions,
} from "./engine.js";
export { contextKey, createCache, type CompletionCache } from "./cache.js";
export {
  executableSource,
  flagNameSource,
  flagValueSource,
  frameworkSources,
  pathSource,
  positionalSource,
  verbSource,
  type DirEntry,
  type ReadDir,
} from "./sources.js";
export { MENU_ID, menuBlocks, menuLayer, menuRowsShown, menuWindow, remainderOf } from "./menu.js";
export {
  CompletionError,
  SLOT_KINDS,
  type Acceptance,
  type Candidate,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
  type Slot,
} from "./types.js";
