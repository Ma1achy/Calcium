/**
 * The session's record: entries, live vs frozen, patches, the cap.
 *
 * C13 — see spec.
 *
 * **This is the first component in the system that holds state outliving a
 * call.** Everything below it is either a pure function over data or terminal
 * state C01 acquires and restores. That is why every mutation here produces new
 * values (I11) rather than editing in place: the entries C14 measured last frame
 * must still read the same after this one.
 *
 * The distinction the whole file exists to hold: **frozen means not focusable;
 * it does not mean not updating** (§2, I4). `live` and `streaming` are two flags
 * and not one axis, and frozen-and-streaming — a `--watch` that keeps patching
 * in the scrollback after focus moved on — is the state a naive implementation
 * loses, taking a subscription with it every time the user types.
 */

import { applyPatch, validateDocument } from "../../data/viewmodel/index.js";
import type { ViewDocument, ViewPatch } from "../../data/viewmodel/index.js";
import { SESSION_BLOCK_CAP, countBlocks, isMarker, sweep } from "./cap.js";
import { TranscriptError } from "./types.js";
import type {
  Change,
  EntryId,
  PatchOutcome,
  TranscriptEntry,
  TranscriptOptions,
  TranscriptStore,
} from "./types.js";

/** C22 §2: enabled without a count means fifty (§5a). */
const DEFAULT_RETAIN = 50;

class Store implements TranscriptStore {
  readonly #cap: number;
  readonly #retain: number;
  readonly #subscribers = new Set<(change: Change) => void>();
  readonly #payloads = new Map<EntryId, unknown>();

  #entries: readonly TranscriptEntry[] = Object.freeze([]);
  #liveId: EntryId | null = null;
  #blockCount = 0;
  #droppedBlocks = 0;
  #overCap = 0;

  /**
   * The id counter. Monotonic and never reset — not by eviction and not by
   * `clear()` (I3), so a stale reference resolves to nothing rather than to a
   * different entry. Resetting it on `clear` is the one-line change that makes
   * T3.12 fail in a way that looks like a viewport bug three components away.
   */
  #seq = 0;

  constructor(opts: TranscriptOptions = {}) {
    this.#cap = opts.cap ?? SESSION_BLOCK_CAP;
    this.#retain = opts.retainPayloads ?? 0;
  }

  get entries(): readonly TranscriptEntry[] {
    return this.#entries;
  }

  get liveId(): EntryId | null {
    return this.#liveId;
  }

  get blockCount(): number {
    return this.#blockCount;
  }

  get droppedBlocks(): number {
    return this.#droppedBlocks;
  }

  get overCap(): number {
    return this.#overCap;
  }

  append(
    doc: ViewDocument,
    opts: Readonly<{ streaming?: boolean; payload?: unknown }> = {},
  ): EntryId {
    // I10 — validated before anything is stored, and raised rather than
    // returned. Three layers had to fail for an invalid document to arrive, so
    // there is nothing here a caller could recover from; C23 §5 owns it.
    const v = validateDocument(doc);
    if (!v.ok) {
      throw new TranscriptError(
        `transcript.append: invalid document (C13 I10) — ${v.error.join("; ")}`,
        v.error,
      );
    }

    this.#seq += 1;
    const id = `e${this.#seq}`;

    // I2 — freezing is implicit in appending. There is no public `freeze`, which
    // is what makes "the last entry is live" true by construction. Note what is
    // *not* touched: `streaming`. I4 lives in this line's absence.
    const frozen = this.#entries.map((e) => (e.live ? { ...e, live: false } : e));

    const entry: TranscriptEntry = Object.freeze({
      id,
      doc: v.value,
      live: true,
      streaming: opts.streaming ?? false,
      seq: this.#seq,
      rev: 0,
      blocks: countBlocks(v.value),
    });

    this.#liveId = id;
    this.#retainPayload(id, opts.payload);
    const evicted = this.#commit([...frozen, entry]);

    this.#emit({ kind: "append", id });
    if (evicted.length > 0) this.#emit({ kind: "evict", ids: evicted });
    return id;
  }

  patch(id: EntryId, patch: ViewPatch): PatchOutcome {
    const entry = this.#entries.find((e) => e.id === id);
    // A patch for an entry that was evicted or cleared. Ordinary, not a bug.
    if (entry === undefined || isMarker(entry)) return { ok: false, reason: "unknown" };
    // A stream outlived its `settle` — a caller bug, surfaced rather than
    // absorbed (I8). C13 reports; C23 §5 decides what it means.
    if (!entry.streaming) return { ok: false, reason: "settled" };

    const r = applyPatch(entry.doc, patch);
    if (!r.ok) {
      // I13 — `rev` does not move on a rejected patch, or C14 invalidates a
      // height that is still correct on every malformed tick a `--watch` emits.
      return { ok: false, reason: "patch", error: r.error };
    }

    const rev = entry.rev + 1;
    const next: TranscriptEntry = Object.freeze({
      ...entry,
      doc: r.doc,
      rev,
      blocks: countBlocks(r.doc),
    });

    // The sweep runs here too: an `op: "append"` patch adds a block, so the cap
    // can be crossed by a stream tick and not only by a command (I15).
    const evicted = this.#commit(this.#entries.map((e) => (e.id === id ? next : e)));

    this.#emit({ kind: "patch", id });
    if (evicted.length > 0) this.#emit({ kind: "evict", ids: evicted });
    return { ok: true, rev };
  }

  settle(id: EntryId): void {
    const entry = this.#entries.find((e) => e.id === id);
    if (entry === undefined || isMarker(entry) || !entry.streaming) return;

    // The sweep matters most here, and it is the one that was missing. A settled
    // entry is newly evictable, so the true overshoot is now *lower* than the
    // last reported figure — and L4 warning about an overshoot that no longer
    // exists is worse than not warning at all (I15).
    const evicted = this.#commit(
      this.#entries.map((e) => (e.id === id ? Object.freeze({ ...e, streaming: false }) : e)),
    );

    this.#emit({ kind: "settle", id });
    if (evicted.length > 0) this.#emit({ kind: "evict", ids: evicted });
  }

  clear(): void {
    this.#entries = Object.freeze([]);
    this.#liveId = null;
    this.#blockCount = 0;
    this.#droppedBlocks = 0;
    // I15 — an `overCap` surviving a clear describes a condition that cannot
    // hold: an empty store has no blocks to be above the cap.
    this.#overCap = 0;
    this.#payloads.clear();
    // `#seq` is deliberately not reset (I3), and C20's history is not touched
    // (I16): clearing the screen is not asking to forget what was typed.
    this.#emit({ kind: "clear" });
  }

  subscribe(cb: (change: Change) => void): Disposable {
    this.#subscribers.add(cb);
    return {
      [Symbol.dispose]: () => {
        this.#subscribers.delete(cb);
      },
    };
  }

  payloadOf(id: EntryId): unknown {
    return this.#payloads.get(id);
  }

  /**
   * The one path that writes entry state, so the sweep cannot be forgotten on a
   * path someone adds later. Returns the evicted ids for the caller to emit.
   */
  #commit(next: readonly TranscriptEntry[]): readonly EntryId[] {
    const r = sweep(next, this.#cap, this.#droppedBlocks);
    this.#entries = r.entries;
    this.#blockCount = r.blockCount;
    this.#droppedBlocks = r.droppedBlocks;
    this.#overCap = r.overCap;
    for (const id of r.evicted) this.#payloads.delete(id);
    return r.evicted;
  }

  /**
   * §5a — its own N-entry window, entirely separate from the block cap. Two
   * eviction policies sharing one counter would make each one's behaviour depend
   * on the other's, and neither would be testable alone.
   */
  #retainPayload(id: EntryId, payload: unknown): void {
    if (this.#retain <= 0 || payload === undefined) return;
    this.#payloads.set(id, payload);
    while (this.#payloads.size > this.#retain) {
      const oldest = this.#payloads.keys().next();
      if (oldest.done === true) break;
      this.#payloads.delete(oldest.value);
    }
  }

  /**
   * A throwing subscriber must not stop the others or corrupt the store (T3.15).
   * Iterating a copy so a callback that unsubscribes mid-delivery is safe too.
   */
  #emit(change: Change): void {
    for (const cb of [...this.#subscribers]) {
      try {
        cb(change);
      } catch {
        // A consumer's fault is not the transcript's. C23 §5 contains the
        // session's diagnostics; C13 has no logger and should not grow one.
      }
    }
  }
}

export function createTranscriptStore(opts: TranscriptOptions = {}): TranscriptStore {
  return new Store({
    ...opts,
    retainPayloads:
      opts.retainPayloads === undefined ? 0 : opts.retainPayloads || DEFAULT_RETAIN,
  });
}
