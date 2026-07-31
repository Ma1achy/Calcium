/**
 * The engine: sources, sequence numbers, ghost text.
 *
 * C19 §4 — see spec.
 *
 * **The sequence is a token of validity, not a counter** (I15). Every piece of
 * state outliving a single event carries the sequence it belongs to and is used
 * only while that sequence is `active`; `cancel()` invalidates the token rather
 * than advancing it. Under a plain latest-wins comparison a result arriving
 * after `Esc` *is* the latest — nothing advanced past it — and lands on a prompt
 * the user dismissed. §8a trace 2 is that case.
 *
 * `active: number | null` reads as a nullable counter and the null looks
 * redundant. It is the mechanism. Comparing against the newest sequence instead
 * passes every test except T3.10.
 */

import { createCache, contextKey, type CompletionCache } from "./cache.js";
import type {
  Candidate,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "./types.js";

/** Milliseconds of waiting before the spinner is shown (§7). */
export const SPINNER_MS = 500;

export interface CompletionEngine {
  register(source: CompletionSource): Disposable;
  /** Synchronous, static sources only (I7). */
  ghost(ctx: CompletionContext): string | null;
  request(ctx: CompletionContext, seq: number): Promise<CompletionResult>;
  cancel(): void;
  readonly pending: boolean;
  /** The token of validity (I15). */
  readonly active: number | null;
  /**
   * Has a request been waiting long enough to show a spinner (§7)?
   *
   * Derived rather than stored, from the earliest **source call** still in
   * flight — not from the sequence. Two `Tab`s in one context join the same
   * call and the wait began at the first, so a sequence-tagged stamp would
   * reset and hide the spinner for another 500 ms from someone already waiting.
   * Tagging answers validity; this measures elapsed wait, and the wait belongs
   * to the work.
   */
  readonly spinning: boolean;
  /** Diagnostics: how many source calls are in flight. */
  readonly inFlight: number;
}

export type EngineOptions = Readonly<{
  /** Injected; C19 reads no ambient clock (I9). */
  now: () => number;
  /** One line per failure, not per keystroke (T3.6). */
  onSourceError?: (sourceId: string, error: unknown) => void;
  cache?: CompletionCache;
}>;

function longestCommonPrefix(values: readonly string[]): string {
  const first = values[0];
  if (first === undefined) return "";
  let out = first;
  for (const v of values) {
    let i = 0;
    while (i < out.length && i < v.length && out[i] === v[i]) i += 1; // graphemes-ok: comparing two strings position by position, not measuring one
    out = out.slice(0, i); // graphemes-ok: cut at a position both strings share
    if (out === "") break;
  }
  return out;
}

/** Later duplicates lose, so the first source to offer a value owns it (T3.18). */
function dedupe(candidates: readonly Candidate[]): readonly Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.value)) continue;
    seen.add(c.value);
    out.push(c);
  }
  return Object.freeze(out);
}

export function createEngine(opts: EngineOptions): CompletionEngine {
  const sources: CompletionSource[] = [];
  const cache = opts.cache ?? createCache(opts.now);

  let seq = 0;
  let active: number | null = null;
  /** Start times of the source calls still in flight — §7's elapsed wait. */
  const flight = new Set<{ startedAt: number }>();

  function applicable(ctx: CompletionContext, dynamic: boolean): readonly CompletionSource[] {
    return sources.filter((s) => s.dynamic === dynamic && s.slots.includes(ctx.slot.kind));
  }

  /**
   * Filter by prefix here rather than trusting the source (§3).
   *
   * A dynamic source answers for the *slot*, so the prefix is the engine's to
   * apply — and applying it to static sources too means neither kind can be
   * wrong about whose job it was.
   */
  function matching(candidates: readonly Candidate[], prefix: string): readonly Candidate[] {
    return candidates.filter((c) => c.value.startsWith(prefix));
  }

  function staticCandidates(ctx: CompletionContext): readonly Candidate[] {
    const out: Candidate[] = [];
    for (const source of applicable(ctx, false)) {
      try {
        const got = source.complete(ctx);
        // A static source is synchronous by contract (I3). One returning a
        // promise is dropped rather than awaited, because awaiting here is what
        // T6.3 reverts to and typing stalls.
        if (got instanceof Promise) {
          opts.onSourceError?.(source.id, new Error("a static source returned a promise"));
          continue;
        }
        out.push(...got);
      } catch (error) {
        opts.onSourceError?.(source.id, error);
      }
    }
    return dedupe(matching(out, ctx.prefix));
  }

  return {
    register(source) {
      sources.push(source);
      return {
        [Symbol.dispose]() {
          const i = sources.indexOf(source);
          if (i !== -1) sources.splice(i, 1);
        },
      };
    },

    ghost(ctx) {
      // Static only, which means manifest-backed only — so `path` and
      // `executable` have no ghost text and `Tab` is required (I3, T1.4b).
      const candidates = staticCandidates(ctx);
      const only = candidates.length === 1 ? candidates[0] : undefined; // graphemes-ok: a candidate count, not text
      if (only === undefined) return null;
      if (!only.value.startsWith(ctx.prefix) || only.value === ctx.prefix) return null;
      return only.value.slice(ctx.prefix.length); // graphemes-ok: both are in the tokeniser's coordinate system
    },

    async request(ctx, requested) {
      seq = Math.max(seq, requested);
      active = requested;

      const results: Candidate[] = [...staticCandidates(ctx)];
      const key = contextKey(ctx);

      const calls = applicable(ctx, true).map(async (source) => {
        const stamp = { startedAt: opts.now() };
        flight.add(stamp);
        try {
          return await cache.take(source.id, key, source.ttlMs, async () =>
            Promise.resolve(source.complete(ctx)),
          );
        } catch (error) {
          // Dropped from this request; the others still contribute (I6).
          opts.onSourceError?.(source.id, error);
          return [] as readonly Candidate[];
        } finally {
          flight.delete(stamp);
        }
      });

      for (const settled of await Promise.all(calls)) results.push(...settled);

      const candidates = dedupe(matching(results, ctx.prefix));
      const superseded = active !== requested;

      return Object.freeze({
        seq: requested,
        // A superseded result carries nothing forward (I13): the caller sees an
        // empty set and the flag, so a handler that ignores `superseded` still
        // cannot write a stale candidate into the buffer.
        candidates: superseded ? Object.freeze([]) : candidates,
        commonPrefix: superseded ? "" : longestCommonPrefix(candidates.map((c) => c.value)),
        superseded,
      });
    },

    cancel() {
      // Invalidates rather than advances (I15). Advancing mints a token nothing
      // holds, which works by accident and reads as a counter.
      active = null;
    },

    /** A new event supersedes whatever was in flight. */
    get pending() {
      return active !== null && flight.size > 0;
    },

    get active() {
      return active;
    },

    get spinning() {
      if (active === null) return false;
      let earliest = Number.POSITIVE_INFINITY;
      for (const s of flight) earliest = Math.min(earliest, s.startedAt);
      return earliest !== Number.POSITIVE_INFINITY && opts.now() - earliest >= SPINNER_MS;
    },

    get inFlight() {
      return flight.size;
    },
  };
}
