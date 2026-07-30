/**
 * Entries, live vs frozen, caps and eviction.
 *
 * C13 — see spec. The session's record: every command appends a document, the
 * newest is live and navigable, and everything above it is a frozen record that
 * scrolls (D3). It does not decide what is *visible* — that is C14 — and it does
 * not render.
 */

export { createTranscriptStore } from "./store.js";
export { SESSION_BLOCK_CAP, countBlocks } from "./cap.js";
export { TranscriptError } from "./types.js";
export type {
  Change,
  EntryId,
  PatchOutcome,
  TranscriptEntry,
  TranscriptOptions,
  TranscriptStore,
  TranscriptView,
} from "./types.js";
