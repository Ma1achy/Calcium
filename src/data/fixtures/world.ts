/**
 * The interface an app implements, declared here and implemented nowhere here.
 *
 * C08 §1a, I9 — see spec. This file is the entire coupling between the harness
 * and a world. Calcium references no app type: it names this shape, and an app
 * satisfies it. That is what lets `prism-tui` and `docker-tui` each have a world
 * while sharing recording, determinism and redaction rather than reimplementing
 * the machinery three times.
 *
 * `createEmulatedTransport` already takes a handler closure rather than a world
 * object for the same reason (C06 §1), so this fits a seam that was cut before
 * the component that had to fit it.
 */

import type { Invocation, RawPatch, RawResult } from "../transport/types.js";

export interface WorldDriver {
  /**
   * `null` means **cannot answer**, not "answered with nothing". The resolver
   * falls through to §4 route 3 on `null`, and a driver that returned an empty
   * result instead would silently claim a verb it does not implement — which
   * looks, from the demo, exactly like a verb that returns no rows.
   */
  query(inv: Invocation): RawResult | AsyncIterable<RawPatch> | null;

  /**
   * Advance by `deltaMs`. **Pull, never push** (I18): the harness calls this;
   * nothing in C08 schedules a call to it. See `handler.ts` for why.
   *
   * The transition is pure — a driver computes its next world and assigns its
   * own cell (§1a). The purity is the app's to keep; the harness only promises
   * never to call this unasked.
   */
  advance(deltaMs: number): void;

  /** Back to the seeded initial state. Same seed, same world (I3). */
  reset(seed: number): void;
}
