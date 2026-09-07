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
  /**
   * The static candidate set, synchronously (§6a, I19).
   *
   * **`ghost` is this function's single-candidate case**, and they are one
   * function rather than two because two would be two filters over two source
   * lists that agree until someone edits one.
   *
   * It is what the as-you-type menu is built from, and the reason that menu is
   * a presentation change rather than an engine one: the set has always been
   * computed per keystroke and has only ever been *reduced*. Nothing here runs
   * a dynamic source — that is `request`, and I3 is unchanged.
   */
  suggest(ctx: CompletionContext): readonly Candidate[];
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
   * **The earliest call still in flight**, which is the whole mechanism. The
   * question is "how long has anything been outstanding", not "how long has the
   * current request been outstanding": two `Tab`s in one context join the same
   * promise and the wait began at the first.
   *
   * Written as *earliest in flight* rather than "per source call", because that
   * second phrasing names a distinction that does not exist — a call begins
   * synchronously inside `request`, so both stampings carry the same number and
   * a mutation swapping them fails nothing. The defect it was meant to forbid
   * is a single `pendingSince` each request overwrites, and T6.13 is that: the
   * *latest* stamp instead of the earliest.
   *
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
  /**
   * One line per failing source, not per keystroke (T3.6). **Optional, and
   * absent means dropped in silence** — which is what the product did for the
   * whole life of C19, because every test supplied one and `construct.ts` did
   * not. `createSourceErrorSink` is the product's; a test that wants to see the
   * failures passes its own.
   */
  onSourceError?: (sourceId: string, error: unknown) => void;
  cache?: CompletionCache;
  /**
   * When a candidate's value was last run, or `null` for never (I26).
   *
   * **A function of one argument, not C20's store**, and the reason is the
   * layer. C19 and C20 are both L3, so an edge between them is sideways —
   * legal while it stays acyclic (A02 §1), and a store handle is an invitation
   * to reach for `list()`, `search` or the navigation cursor the first time
   * something looks convenient. This cannot grow into one. Same argument
   * `FocusInputs` makes for taking C15's layer and C13's entry structurally.
   *
   * **Optional, and absent means unranked.** An engine built without it orders
   * exactly as it did before I26, which is what lets C22 wire it in one place
   * and every test that does not care about ordering keep its fixture.
   */
  recency?: (value: string) => number | null;
}>;

/**
 * Where a source failure goes in the product (T3.6's "logged once", I6).
 *
 * **`onSourceError` was supplied by every test and by nothing in `src/`**, so for
 * the whole life of C19 a source that threw was dropped from the request — I6
 * held — and dropped from the record too: no line anywhere said which source
 * failed or why. The engine's contract was *the failure is logged once* and the
 * engine had no log; it had a callback the product never passed.
 *
 * This is the sink, in `BlockFaultLog`'s shape (C22 I6a): a pull rather than an
 * emit, deduplicated, drained at shutdown with the other diagnostics rather than
 * painted onto the alternate screen where it would be discarded with it.
 *
 * **One line per source, not per failure and not per keystroke.** A dynamic
 * source that is down fails on every `Tab` for as long as it is down, and each
 * failure may carry a different message — a timeout's elapsed figure, a far
 * side's request id. Keyed by message that is a flood; keyed by source it is one
 * line with a count, and the first message, which is the one that says what
 * went wrong before anything else went wrong because of it.
 */
export interface SourceErrorSink {
  /** Pass as `EngineOptions.onSourceError`. */
  readonly onSourceError: (sourceId: string, error: unknown) => void;
  /** One line per failing source: `completion source \`id\` failed ×n: first message`. */
  readonly messages: readonly string[];
}

export function createSourceErrorSink(): SourceErrorSink {
  const seen = new Map<string, { first: string; count: number }>();
  return {
    onSourceError: (sourceId, error) => {
      const entry = seen.get(sourceId);
      if (entry !== undefined) {
        entry.count += 1;
        return;
      }
      const text = error instanceof Error ? error.message : String(error);
      seen.set(sourceId, { first: text, count: 1 });
    },
    get messages(): readonly string[] {
      return [...seen].map(
        ([id, { first, count }]) =>
          `completion source \`${id}\` failed${count > 1 ? ` ×${String(count)}` : ""}: ${first}`,
      );
    },
  };
}

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

/**
 * Most-recently-run first, source order underneath (I26, §3a).
 *
 * **A refinement of source order rather than a replacement**, which is the whole
 * of why this is safe to land without a second ruling about ties. Never-run
 * candidates all compare equal and a stable sort leaves them exactly as they
 * arrived — so on a fresh session, where every value is `null`, the menu is
 * identical to the one before I26.
 *
 * **After `dedupe`, and the mutation pass proved that is a preference rather than
 * a constraint.** The first version of this comment said ranking first would let
 * the *later* source's copy win the position and reverse T3.18. It would not:
 * `recency` is a function of the **value**, so two copies of one value carry
 * identical keys, and a stable sort leaves the first where it was. Swapping the
 * two steps is behaviourally equivalent, and the mutation that swaps them
 * survives — a finding about the sentence, not about the tests (`tools/mutate/
 * runs/c19-ranking.mjs`).
 *
 * It stays in this order because sorting a list you are about to shorten is work
 * for nothing, which is a real reason and a much smaller one than the sentence it
 * replaces. **A correct-sounding justification for a decision it does not
 * constrain reads exactly like one that holds**, and only asking whether it can be
 * violated tells them apart.
 *
 * `Array.prototype.sort` is specified stable, so the order among equals is the
 * input's. Stated because the guarantee is what the rule rests on and it reads
 * like an implementation detail.
 */
function rank(
  candidates: readonly Candidate[],
  recency: EngineOptions["recency"],
): readonly Candidate[] {
  if (recency === undefined) return candidates;
  const at = new Map(candidates.map((c) => [c.value, recency(c.value)]));
  return Object.freeze(
    [...candidates].sort((a, b) => {
      const x = at.get(a.value) ?? null;
      const y = at.get(b.value) ?? null;
      if (x === y) return 0;
      // Never-run sorts after every timestamp, in both directions, so the
      // comparator stays a total order rather than answering `0` for one arm.
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x;
    }),
  );
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
    return rank(dedupe(matching(out, ctx.prefix)), opts.recency);
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

    suggest(ctx) {
      return staticCandidates(ctx);
    },

    ghost(ctx) {
      // Static only, which means manifest-backed only — so `path` and
      // `executable` have no ghost text and `Tab` is required (I3, T1.4b).
      // The same call `suggest` exposes, not a second filter beside it.
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
          // **The source's own discriminator, appended** (I25). A path source
          // answers for a directory rather than for the slot, and the engine
          // cannot work out which part of the prefix that is.
          const sourceKey = source.cacheKey === undefined ? key : `${key}\u0000${source.cacheKey(ctx)}`;
          return await cache.take(source.id, sourceKey, source.ttlMs, async () =>
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

      const candidates = rank(dedupe(matching(results, ctx.prefix)), opts.recency);
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
