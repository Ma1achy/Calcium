/**
 * The dynamic-source cache.
 *
 * C19 §3 — see spec. Keyed on `(sourceId, contextKey)` with a 60-second TTL on
 * an injected clock (I9, I10).
 *
 * **It holds the in-flight promise, not the resolved value**, and §8a trace 3
 * is why. A second `Tab` in the same context must join the existing call rather
 * than issue another (T3.9), and a value cache has nothing to return at that
 * moment because the first call has not come back. "A new sequence" and "one
 * pending request, not two" are compatible only under this shape.
 *
 * **The TTL starts at resolution**, not at the call. Starting it at the call
 * charges a slow source its own latency out of its cache lifetime, so the
 * slowest sources — the ones the cache exists for — get the least of it.
 */

import type { Candidate, CompletionContext, Slot } from "./types.js";

const DEFAULT_TTL_MS = 60_000;

/**
 * The key separator, written as an escape (SS43).
 *
 * NUL because it cannot occur in a source id, a slot kind or a manifest name,
 * so `a\0b` and `ab\0` are distinguishable and no key can be forged by a name
 * containing the separator.
 *
 * **Written as an escape rather than typed**, and this file is why the rule
 * exists: the first draft carried literal NULs in two template strings that
 * read as spaces on every screen they were shown on, and SS43 found them in
 * code minutes old. Three of the class's first instances were deliberate and
 * defensible, exactly as this one is — the rule is not "NUL is wrong" but "an
 * invisible character is invisible".
 */
const SEP = "\u0000";

type Entry = Readonly<{
  promise: Promise<readonly Candidate[]>;
  /** Null until it resolves; the TTL is measured from then (I10). */
  settledAt: { at: number | null };
}>;

/**
 * What identifies a slot for caching (§3).
 *
 * **Not the prefix.** A UUID list does not change between `a` and `ab`, so
 * keying on what has been typed makes every keystroke after a `Tab` a fresh
 * fetch and the TTL never hits. Kind, tool and the flag or argument name are
 * everything a source's answer depends on; the engine filters the rest.
 */
export function contextKey(ctx: CompletionContext): string {
  const tool = ctx.tool?.name ?? "-";
  return [ctx.slot.kind, tool, slotSubject(ctx.slot)].join(SEP);
}

function slotSubject(slot: Slot): string {
  if (slot.kind === "flagValue") return slot.flag.name;
  if (slot.kind === "positional") return slot.arg.name;
  return "-";
}

export interface CompletionCache {
  /**
   * The candidates for this key, calling `run` only if nothing live is held.
   *
   * Returns the same promise to a second caller inside one flight, which is
   * T3.9's "one pending request, not two".
   */
  take(
    sourceId: string,
    key: string,
    ttlMs: number | undefined,
    run: () => Promise<readonly Candidate[]>,
  ): Promise<readonly Candidate[]>;
  clear(): void;
  readonly size: number;
}

export function createCache(now: () => number): CompletionCache {
  const entries = new Map<string, Entry>();

  return {
    take(sourceId, key, ttlMs, run) {
      const id = [sourceId, key].join(SEP);
      const ttl = ttlMs ?? DEFAULT_TTL_MS;
      const held = entries.get(id);

      if (held !== undefined) {
        const { at } = held.settledAt;
        // In flight: join it. Settled and inside the TTL: reuse it.
        if (at === null || now() - at < ttl) return held.promise;
        entries.delete(id);
      }

      const settledAt: Entry["settledAt"] = { at: null };
      const promise = run().then(
        (candidates) => {
          settledAt.at = now();
          return candidates;
        },
        (error: unknown) => {
          // A failure is not cached: the next `Tab` should try again rather than
          // serve the failure for a minute (I6). Dropping the entry here rather
          // than in the engine keeps that true however the caller handles it.
          entries.delete(id);
          throw error;
        },
      );

      entries.set(id, Object.freeze({ promise, settledAt }));
      return promise;
    },

    clear() {
      entries.clear();
    },

    get size() {
      return entries.size;
    },
  };
}
