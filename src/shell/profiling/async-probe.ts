/**
 * The seams that cross a promise, taken by decoration (C28 I36, A02 §2 Seam 6).
 *
 * **Every span this component had before these was synchronous.** `trace` was
 * built, tested against interleaving, and had **no caller anywhere in `src/`** —
 * so the whole far-side round trip was time the report attributed to nothing. A
 * frame that waited 400 ms on a subprocess and one that spent 400 ms in a bad
 * adapter produced the same report, which is the question the component exists
 * to answer.
 *
 * Three seams are objects the composition root already hands down, so they are
 * wrapped here rather than instrumented in place: the transport router, the
 * adapter registry, and the completion engine. The other two — C23's local verb
 * handler and a live part's `fetch` — are built inside the module that uses
 * them, and take an injected `TraceFn` instead.
 *
 * **`stream` brackets each `next()` and not the loop, and that is the design.**
 * A span around the whole iteration reports one number that a slow far side and
 * a slow shell both produce, and they want opposite fixes. Around `next()`, the
 * span holds exactly the interval between asking for a patch and getting one,
 * so everything the consumer does between patches — adapt, apply, compose a
 * frame — lands in its own spans and not in this one.
 *
 * **Every bracket forks its context** (C28 I33), which is what makes N live
 * fetches and a completion racing a route attribute to N parents rather than
 * trampling one pointer. `trace` does the forking; nothing here touches the
 * store.
 *
 * **Two of the three replace a property and one returns a wrapper, and the
 * difference is getters.** `AdapterRegistry.sealed` and the completion engine's
 * `spinning` are live getters whose values change after construction, so
 * `{ ...engine, request: … }` would freeze each into the value it happened to
 * hold at startup — `sealed` false forever, and a spinner that never spins. The
 * defect would be silent and nowhere near this file. Replacing one property
 * leaves every getter where it is. `TransportRouter` is wrapped instead because
 * `for(verb)` has to return a *new* `VerbTransport` per lookup, and its two
 * getters are re-exposed as getters by hand.
 */
import type {
  AdapterContext,
  AdapterRegistry,
  RawPatch,
  RawResult,
  StreamContext,
} from "../../data/adapters/types.js";
import type { ViewDocument, ViewPatch } from "../../data/viewmodel/index.js";
import type { Invocation, TransportRouter, VerbTransport } from "../../data/transport/types.js";
import type { CompletionEngine } from "../../interaction/completion/index.js";
import type { Profiler } from "./types.js";

/**
 * The router, with `invoke` and `stream` bracketed.
 *
 * `for(verb)` is the seam rather than the two calls, because `VerbTransport` is
 * what execution holds: wrapping the lookup reaches both without either call
 * site changing. A router is consulted once per route, so the allocation here is
 * per command and not per patch.
 */
export function instrumentTransport(router: TransportRouter, prof: Profiler): TransportRouter {
  return {
    for(verb: string): VerbTransport {
      const inner = router.for(verb);
      return {
        invoke: async (inv: Invocation): Promise<RawResult> =>
          prof.trace("transport", () => inner.invoke(inv)),
        stream: (inv: Invocation): AsyncIterable<RawPatch> => tracedStream(inner.stream(inv), prof),
      };
    },
    get busy(): boolean {
      return router.busy;
    },
    get inFlight(): string | null {
      return router.inFlight;
    },
  };
}

/**
 * The stream, with the wait around each patch.
 *
 * **Transparent by construction**: it yields what the source yields, in order,
 * and finishes when the source finishes. That is the one defect here a timing
 * assertion cannot see — a decorator that drops a patch changes what the user
 * reads, and every span in the report would still look right.
 */
function tracedStream(src: AsyncIterable<RawPatch>, prof: Profiler): AsyncIterable<RawPatch> {
  if (!prof.on) return src;
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<RawPatch> {
      const it = src[Symbol.asyncIterator]();
      try {
        for (;;) {
          const step = await prof.trace("stream", () => it.next());
          if (step.done === true) return;
          yield step.value;
        }
      } finally {
        // A consumer that breaks out of its loop — a cancel, a throw in the
        // body — must still close the source. C06 I9 promises exactly one
        // `end` on every termination path, and a generator abandoned without
        // this leaves the subprocess reader attached.
        await it.return?.();
      }
    },
  };
}

/**
 * The adapter registry, with `adapt` and `adaptPatch` bracketed.
 *
 * **Synchronous, and grouped `compute`.** It is this framework's CPU turning
 * the far side's bytes into a `ViewDocument`; nothing about it is the far
 * side's, and it was filed there until F881.
 *
 * The recording arm is a separate function so `using` never sits on the path
 * that declines — the disposable stack is allocated at function entry and the
 * `finally` runs on an early return, which measured +541 % at `tier: "off"`
 * (F867).
 */
export function instrumentAdapters(registry: AdapterRegistry, prof: Profiler): AdapterRegistry {
  const adapt = registry.adapt.bind(registry);
  const adaptPatch = registry.adaptPatch.bind(registry);

  const adapted = (raw: RawResult, ctx: AdapterContext): ViewDocument => {
    using _s = prof.span("adapt");
    return adapt(raw, ctx);
  };
  const patched = (patch: RawPatch, ctx: StreamContext): ViewPatch | null => {
    using _s = prof.span("adapt");
    return adaptPatch(patch, ctx);
  };

  registry.adapt = (raw, ctx) => (prof.on ? adapted(raw, ctx) : adapt(raw, ctx));
  registry.adaptPatch = (patch, ctx) => (prof.on ? patched(patch, ctx) : adaptPatch(patch, ctx));
  return registry;
}

/**
 * The completion engine, with `request` bracketed.
 *
 * **`request` is the only member that crosses a promise**, and it is the one
 * that races: C23 runs it outside the `Guard`, so a completion can be in flight
 * while a route is. That is the interleaving `trace`'s fork exists for — two
 * spans open at once, each closing against its own parent — and it is exactly
 * the shape the single-pointer recorder dropped in silence.
 *
 * `suggest` and `ghost` are synchronous and cheap, and both run on the keystroke
 * path where a span costs more than the call (§3a). They stay unbracketed, and
 * that is a decision rather than an omission.
 */
export function instrumentCompletion(
  engine: CompletionEngine,
  prof: Profiler,
): CompletionEngine {
  const request = engine.request.bind(engine);
  engine.request = (ctx, seq) => prof.trace("completion", () => request(ctx, seq));
  return engine;
}
