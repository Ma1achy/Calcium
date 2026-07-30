/**
 * The transcript's vocabulary.
 *
 * C13 — see spec. Types only, plus the one error class: no policy lives here,
 * so nothing in this file can be the place an invariant is enforced. That is
 * `store.ts` and `cap.ts`, and having exactly one home for each is the point.
 *
 * C13 imports nothing from `terminal/` or `presentation/` (I18, MG10). The one
 * import it makes outside its own directory is C04's, which is L0 data and
 * therefore downward.
 */

import type { ErrorLike, ViewDocument, ViewPatch } from "../../data/viewmodel/index.js";

/** Monotonic, opaque, never reused — including after eviction and across `clear()` (I3). */
export type EntryId = string;

export type TranscriptEntry = Readonly<{
  id: EntryId;
  doc: ViewDocument;
  /** The newest entry: focusable, its actions can fire, arrow keys navigate it (D3, D6). */
  live: boolean;
  /** Its verb has not finished; it still accepts patches. Orthogonal to `live` (§2, I4). */
  streaming: boolean;
  /** Logical order, never a timestamp. C13 reads no clock (I9). */
  seq: number;
  /** Bumped on every applied patch, never on a rejected one — C14's cache key (I13). */
  rev: number;
  /** Blocks in `doc`, counted once at append and on each applied patch (§5, I17). */
  blocks: number;
}>;

/**
 * Why a patch did not apply, as a value rather than a throw.
 *
 * The three arms are three different problems and only one of them is about the
 * data: `unknown` is a stale reference — a patch for an entry that was evicted
 * or cleared. `settled` is a caller bug — a stream outlived its `settle`.
 * `patch` is C04 saying the patch does not fit the document, and it is the only
 * arm carrying an `ErrorLike`, because it is the only one with a message worth
 * putting in a notice (C23 §5).
 *
 * `rev` rides on success so C14 can invalidate its height cache from the return
 * value rather than re-reading `entries` to find the entry it just patched.
 */
export type PatchOutcome =
  | Readonly<{ ok: true; rev: number }>
  | Readonly<{ ok: false; reason: "unknown" | "settled" }>
  | Readonly<{ ok: false; reason: "patch"; error: ErrorLike }>;

/**
 * What changed, not merely that something did (I12).
 *
 * C14 caches a measured height per entry. An `append` needs one entry measured;
 * an `evict` needs the anchor rechecked; a `settle` needs nothing at all. A bare
 * notification would force a full remeasure on every log line, which at a
 * thousand lines a second is the difference between working and not.
 */
export type Change =
  | Readonly<{ kind: "append"; id: EntryId }>
  | Readonly<{ kind: "patch"; id: EntryId }>
  | Readonly<{ kind: "settle"; id: EntryId }>
  | Readonly<{ kind: "evict"; ids: readonly EntryId[] }>
  | Readonly<{ kind: "clear" }>;

export type TranscriptOptions = Readonly<{
  /** Blocks, not entries (I17). Defaults to `SESSION_BLOCK_CAP`. */
  cap?: number;
  /**
   * Raw payload retention (§5a). Off when absent; 50 when C22 enables it
   * without a count. Its window is entirely separate from the block cap —
   * two eviction policies sharing one counter would make each depend on the other.
   */
  retainPayloads?: number;
}>;

/**
 * What a *reader* of the transcript gets (I19). C14 and C16 take this; only L4
 * holds the store.
 *
 * Two things this makes structural rather than aspirational. The §5a payload
 * window is reachable only through `payloadOf`, and a debug-only buffer arriving
 * in the viewport is a seam nobody specified — `TranscriptEntry` carries no
 * payload field, so the data was already invisible, and this closes the
 * interface too. And a reader holding the store could `clear()` it: a viewport
 * recomputing an anchor by emptying the transcript is the kind of fix that
 * works, ships, and is found from a bug report about a lost session.
 */
export interface TranscriptView {
  subscribe(cb: (change: Change) => void): Disposable;
  readonly entries: readonly TranscriptEntry[];
  readonly liveId: EntryId | null;
  readonly blockCount: number;
  readonly overCap: number;
}

export interface TranscriptStore extends TranscriptView {
  /**
   * Appends a document, freezing the previous live entry (§4).
   *
   * **Throws `TranscriptError` on an invalid document**, and the asymmetry with
   * `patch` is the point (§3). C23 built the document, C07 validated it and C04
   * froze it: three layers failed for an invalid one to arrive, there is no
   * recovery a caller could perform, and C23 §5 already names this the one stage
   * whose failure loses the outcome. C05's store throws for the same reason.
   */
  append(doc: ViewDocument, opts?: Readonly<{ streaming?: boolean; payload?: unknown }>): EntryId;

  /** Applies a patch, or says why it could not. Never throws (§6, I8). */
  patch(id: EntryId, patch: ViewPatch): PatchOutcome;

  /** The stream ended; the entry stops accepting patches. Unknown ids are a no-op. */
  settle(id: EntryId): void;

  /** Empties the transcript. Command history is C20's and is untouched (I16). */
  clear(): void;

  readonly droppedBlocks: number;

  /** The retained raw payload, or `undefined` when retention is off or evicted (§5a). */
  payloadOf(id: EntryId): unknown;
}

/**
 * An invalid document reaching `append`.
 *
 * Carries `validateDocument`'s messages, because "invalid document" without the
 * reasons sends the reader back to a document they cannot see.
 */
export class TranscriptError extends Error {
  override readonly name = "TranscriptError";
  readonly reasons: readonly string[];

  constructor(message: string, reasons: readonly string[]) {
    super(message);
    this.reasons = Object.freeze([...reasons]);
  }
}
