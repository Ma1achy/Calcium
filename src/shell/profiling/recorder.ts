/**
 * C28's recorder.
 *
 * **Nothing here reads a clock or the process.** `elapsed` arrives injected and
 * the probe is a `Disposable` the root constructs (C28 I2), which is what makes
 * every figure below exact under a fake and is why SS1's allow-list does not
 * grow.
 *
 * **At tier `off` this object is not constructed** — `session.ts` gates on the
 * tier, not on the config being present, and hands the undecorated function
 * down instead (C28 I1). That gate used to read `config.profile !== undefined`,
 * so `{ tier: "off" }` built the recorder *and* the resource probe, enabling the
 * loop monitor and the GC observer to measure a session that had asked for
 * nothing. The comment claiming otherwise was already here; the code was not.
 *
 * **Three things this rebuild fixes, each of which reported a wrong number
 * rather than failing:**
 *
 * - *Async spans recorded nothing, silently.* The open span was one closure
 *   variable and a close that did not match it returned early. An `await`
 *   produces exactly that, so any bracket around transport, a handler or a live
 *   fetch would have been discarded with no error. Closing is now per node —
 *   see `tree.ts` — and the stack is consulted only to find a new span's parent.
 * - *Per-element cost was fabricated.* The measure seam divided one sequence
 *   total equally across every block in it, so a 57 µs plot and a 220 ns rule
 *   were attributed the same figure. `element()` measures each block.
 * - *`total` published the sum C28 I4 forbids.* `work` and `wait` are
 *   independent and the record no longer carries their sum.
 */
import { NO_SPAN, type Probe } from "../../data/viewmodel/probe.js";
import { createContexts } from "./async-context.js";
import { Hist, HISTOGRAM_ERROR } from "./histogram.js";
import { Ring } from "./ring.js";
import { Aggregate, closeNode, freezeTree, openNode, type OpenNode } from "./tree.js";
import {
  TIER_RANK,
  type CaptureResult,
  type CommitReason,
  type FrameOutcome,
  type FrameRecord,
  type Histogram,
  type MissReason,
  type ProfileOptions,
  type Profiler,
  type ProfileReport,
  type ResourceProbe,
  type ResourceSample,
  type Tier,
} from "./types.js";

type Deps = Readonly<{
  elapsed: () => number;
  probe?: ResourceProbe;
  schedule?: (fn: () => void, ms: number) => Disposable;
  node?: string;
  cpus?: number;
}>;

const DEFAULTS = { ring: 512, worst: 10, sampleMs: 1000, marks: 512 } as const;

/**
 * This machine's `elapsed()` cost, measured once at construction (C28 I34).
 *
 * Two reads per span, so the reported overhead is `spans × 2 × clockNs`. Taken
 * over 2 000 iterations because a single pair is dominated by whatever the
 * scheduler was doing; 2 000 costs about 70 µs and buys a figure that does not
 * move between runs. Measured through the injected `elapsed`, so a fake clock
 * reports its own cost rather than the host's — which is correct: the overhead
 * line describes the instrument that actually ran.
 */
function clockCostNs(elapsed: () => number): number {
  const N = 2000;
  const t0 = elapsed();
  for (let i = 0; i < N; i += 1) elapsed();
  const spentMs = elapsed() - t0;
  return (spentMs * 1e6) / N;
}

export function createProfiler(opts: ProfileOptions, deps: Deps): Profiler {
  const elapsed = opts.elapsed ?? deps.elapsed;
  const probe = opts.probe ?? deps.probe;

  let tier: Tier = opts.tier ?? "counters";
  let disposed = false;

  const contexts = createContexts();
  const frames = new Ring<FrameRecord>(opts.ring ?? DEFAULTS.ring);
  const samples = new Ring<ResourceSample>(64);
  const marks = new Ring<{ at: number; label: string }>(DEFAULTS.marks);
  const worstKeep = opts.worst ?? DEFAULTS.worst;

  const spanHists = new Map<string, Hist>();
  const gaugeHists = new Map<string, Hist>();
  const byReason = new Map<CommitReason, Hist>();
  const byKind = new Map<string, Hist>();
  const counters = new Map<string, number>();
  const misses = new Map<string, Map<MissReason, number>>();
  const hits = new Map<string, number>();
  const captures: CaptureResult[] = [];
  const nodes = new Aggregate();

  const workH = new Hist();
  const waitH = new Hist();

  let seq = 0;
  let spansOpened = 0;
  let excludedSelf = 0;
  let excludedFallback = 0;
  let ringResetAt = 0;
  let sampler: Disposable | null = null;
  let suspended = false;

  const started = elapsed();
  const clockNs = clockCostNs(elapsed);

  /** The earliest commit still unserved (C28 I5) — not the latest. */
  let earliestUnserved: number | null = null;
  let commitsSinceFrame = 0;
  let ownCommitsSinceFrame = 0;

  /**
   * The frame's own root span, and the tree hanging off it.
   *
   * A span opened outside a frame — a transport call, a live fetch — has no
   * frame root and attributes to the session rather than to a frame. That is
   * not a gap: those are precisely the costs that are *not* in a frame, and
   * folding them into one would be the wait-as-work mistake one level up.
   */
  let frameRoot: OpenNode | null = null;
  let frameSpans: Record<string, number> = {};
  let frameStart = 0;
  let frameReason: CommitReason = "input";
  let frameWait = 0;
  let frameSelf = false;
  let inFrame = false;

  const spanning = (): boolean => TIER_RANK[tier] >= TIER_RANK.spans;
  const counting = (): boolean => tier !== "off";

  const hist = <K>(m: Map<K, Hist>, k: K): Hist => {
    let h = m.get(k);
    if (h === undefined) {
      h = new Hist();
      m.set(k, h);
    }
    return h;
  };

  /**
   * Record one closed span everywhere it belongs.
   *
   * Called from the disposable rather than inlined there so `span`, `element`
   * and `trace` cannot drift apart on what a close records — three copies of
   * this is how a name ends up in the tree and missing from the histogram.
   */
  const record = (node: OpenNode, self: number): void => {
    hist(spanHists, node.name).add(self);
    frameSpans[node.name] = (frameSpans[node.name] ?? 0) + self;
  };

  /** Open a span in the current context and return its close. */
  const begin = (name: string): { node: OpenNode; ctx: ReturnType<typeof contexts.current> } => {
    const ctx = contexts.current();
    const node = openNode(name, ctx.parent ?? frameRoot, elapsed());
    ctx.parent = node;
    spansOpened += 1;
    return { node, ctx };
  };

  /**
   * Close a span.
   *
   * The parent restored is `node.parent` and not "whatever was here before",
   * which is what makes an out-of-order close correct instead of dropped.
   */
  const end = (node: OpenNode, ctx: { parent: OpenNode | null }): number => {
    const self = closeNode(node, elapsed());
    ctx.parent = node.parent;
    return self;
  };

  const startSampler = (): void => {
    sampler?.[Symbol.dispose]();
    sampler = null;
    if (!spanning() || probe === undefined || deps.schedule === undefined) return;
    const every = opts.sampleMs ?? DEFAULTS.sampleMs;
    const tick = (): void => {
      if (disposed) return;
      samples.push(probe.sample(suspended));
      sampler = deps.schedule?.(tick, every) ?? null;
    };
    sampler = deps.schedule(tick, every);
  };

  const resetRing = (): void => {
    frames.clear();
    samples.clear();
    spanHists.clear();
    gaugeHists.clear();
    byReason.clear();
    byKind.clear();
    nodes.clear();
    ringResetAt = elapsed() - started;
  };

  const snapshotAll = <K extends string>(m: Map<K, Hist>): Record<K, Histogram> => {
    const out = {} as Record<K, Histogram>;
    for (const [k, h] of m) out[k] = h.snapshot();
    return out;
  };

  startSampler();
  if (spanning()) contexts.enable();

  /**
   * The two disposables, as classes rather than object literals.
   *
   * **A computed `[Symbol.dispose]` key in an object literal is the single most
   * expensive thing in a span.** Measured at 500 000 iterations: constructing
   * and disposing the literal below costs 0.150 µs against 0.009 µs for a class
   * instance — **17×** — because the literal builds a fresh closure and stores a
   * symbol-keyed property per call, while a class puts the symbol on the
   * prototype once and the fields in slots. Against two `performance.now()`
   * reads at 0.104 µs it was the majority of a span.
   *
   * A frozen singleton over a LIFO stack measured 0.007 µs — marginally cheaper
   * and not taken, because closing through `node.parent` rather than through
   * "whatever was on the stack" is what makes an out-of-order close correct
   * instead of dropped, and that is an invariant worth more than 2 ns.
   */
  class SpanHandle {
    constructor(
      readonly node: OpenNode,
      readonly ctx: { parent: OpenNode | null },
    ) {}
    [Symbol.dispose](): void {
      record(this.node, end(this.node, this.ctx));
    }
  }

  class ElementHandle {
    constructor(
      readonly node: OpenNode,
      readonly ctx: { parent: OpenNode | null },
      readonly kind: string,
    ) {}
    [Symbol.dispose](): void {
      const spent = end(this.node, this.ctx);
      // Self time in both, so a container is not charged for its children and
      // `Σ nodes.self` is the frame's real element cost.
      hist(byKind, this.kind).add(spent);
      nodes.add(this.node.name, spent, this.node.total ?? spent, seq);
    }
  }

  const self: Profiler = {
    get tier() {
      return tier;
    },

    get on() {
      return !disposed && spanning();
    },

    setTier(next: Tier): void {
      if (disposed || next === tier) return;
      // Histograms from two tiers describe neither (C28 I18).
      resetRing();
      tier = next;
      if (spanning()) contexts.enable();
      startSampler();
    },

    span(name: string): Disposable {
      if (disposed || !spanning()) return NO_SPAN;
      const { node, ctx } = begin(name);
      return new SpanHandle(node, ctx);
    },

    element(kind: string, id: string): Disposable {
      if (disposed || !spanning()) return NO_SPAN;
      const { node, ctx } = begin(`${kind}#${id}`);
      return new ElementHandle(node, ctx, kind);
    },

    async trace<T>(name: string, fn: () => Promise<T>): Promise<T> {
      if (disposed || !spanning()) return fn();
      contexts.enable();
      return contexts.fork(async () => {
        const { node, ctx } = begin(name);
        try {
          return await fn();
        } finally {
          record(node, end(node, ctx));
        }
      });
    },

    timed<T>(fn: () => T): readonly [T, number] {
      if (disposed || !spanning()) return [fn(), 0] as const;
      const at = elapsed();
      const value = fn();
      return [value, elapsed() - at] as const;
    },

    count(name: string, by = 1): void {
      if (disposed || !counting()) return;
      counters.set(name, (counters.get(name) ?? 0) + by);
    },

    gauge(name: string, value: number): void {
      if (disposed || !counting()) return;
      hist(gaugeHists, name).add(value);
    },

    miss(cache: string, reason: MissReason): void {
      if (disposed || !counting()) return;
      let m = misses.get(cache);
      if (m === undefined) {
        m = new Map();
        misses.set(cache, m);
      }
      m.set(reason, (m.get(reason) ?? 0) + 1);
    },

    hit(cache: string): void {
      if (disposed || !counting()) return;
      hits.set(cache, (hits.get(cache) ?? 0) + 1);
    },

    mark(label: string): void {
      if (disposed || !counting()) return;
      marks.push({ at: elapsed() - started, label });
    },

    commit(reason: CommitReason, own: boolean): void {
      if (disposed || !counting()) return;
      counters.set(`commit.${reason}`, (counters.get(`commit.${reason}`) ?? 0) + 1);
      commitsSinceFrame += 1;
      if (own) ownCommitsSinceFrame += 1;
      // The earliest, because that is the one the reader has been waiting on.
      if (earliestUnserved === null) earliestUnserved = elapsed();
    },

    beginFrame(reason: CommitReason): void {
      if (disposed || !counting()) return;
      counters.set(`frame.${reason}`, (counters.get(`frame.${reason}`) ?? 0) + 1);
      if (!spanning()) return;
      inFrame = true;
      frameReason = reason;
      frameStart = elapsed();
      frameWait = earliestUnserved === null ? 0 : Math.max(0, frameStart - earliestUnserved);
      // Self-inflicted only if EVERY commit that raised the frame was ours.
      frameSelf = commitsSinceFrame > 0 && ownCommitsSinceFrame === commitsSinceFrame;
      frameSpans = {};
      frameRoot = openNode("frame", null, frameStart);
      contexts.current().parent = frameRoot;
    },

    endFrame(outcome: FrameOutcome): void {
      if (disposed || !counting()) return;
      earliestUnserved = null;
      commitsSinceFrame = 0;
      ownCommitsSinceFrame = 0;
      if (!spanning() || !inFrame) return;
      inFrame = false;
      const endedAt = elapsed();
      const work = endedAt - frameStart;
      const root = frameRoot;
      frameRoot = null;
      contexts.current().parent = null;
      seq += 1;

      // **The tree is built for every frame and kept for few.** Building it is
      // the same allocation the spans already made; keeping it is what is
      // unbounded, so the decision is made below against `worstKeep` rather
      // than here against nothing.
      const tree = root === null ? undefined : freezeTree(root, endedAt);
      const record_: FrameRecord = Object.freeze({
        seq,
        reason: frameReason,
        work,
        wait: frameWait,
        spans: Object.freeze({ ...frameSpans }),
        ...(tree === undefined ? {} : { tree }),
        outcome,
        selfInflicted: frameSelf,
        at: frameStart - started,
      });
      frames.push(record_);
      // A fallback is a frame's absence, not its cost; a self-inflicted frame
      // is the profiler measuring itself. Both counted, neither in a duration.
      if (outcome === "fallback") {
        excludedFallback += 1;
        return;
      }
      if (frameSelf) {
        excludedSelf += 1;
        return;
      }
      workH.add(work);
      waitH.add(frameWait);
      hist(byReason, frameReason).add(work);
    },

    asProbe(): Probe {
      // A narrowing view rather than a second implementation: one span, one
      // close, one histogram, whoever opened it.
      return Object.freeze({
        span: (name: string) => self.span(name),
        count: (name: string, by?: number) => {
          self.count(name, by);
        },
        gauge: (name: string, value: number) => {
          self.gauge(name, value);
        },
        mark: (label: string) => {
          self.mark(label);
        },
        hit: (cache: string) => {
          self.hit(cache);
        },
        miss: (cache: string, reason: MissReason) => {
          self.miss(cache, reason);
        },
        get on() {
          return self.on;
        },
      });
    },

    addCapture(capture: CaptureResult): void {
      if (disposed) return;
      captures.push(capture);
    },

    report(): ProfileReport {
      const held = frames.toArray();
      const drawn = held.filter((f) => f.outcome === "frame" && !f.selfInflicted);
      const worst = [...drawn].sort((a, b) => b.work - a.work).slice(0, worstKeep);
      const worstSeqs = new Set(worst.map((f) => f.seq));
      // Trees only on the worst — see `FrameRecord.tree`. Stripped here rather
      // than never built, because which frames are worst is not knowable until
      // the session is over.
      const strip = (f: FrameRecord): FrameRecord => {
        if (worstSeqs.has(f.seq) || f.tree === undefined) return f;
        // Destructured out rather than set to `undefined`: under
        // `exactOptionalPropertyTypes` an absent property and a present
        // undefined one are different types, and the second is what a consumer
        // spreading this record would then republish.
        const { tree: _dropped, ...rest } = f;
        return Object.freeze(rest);
      };

      const missOut: Record<string, Partial<Record<MissReason, number>>> = {};
      for (const [cache, m] of misses) missOut[cache] = Object.fromEntries(m);

      return Object.freeze({
        regime: Object.freeze({
          node: deps.node ?? "unknown",
          cpus: deps.cpus ?? 0,
          tier,
          durationMs: elapsed() - started,
          histogramError: HISTOGRAM_ERROR,
          ringReset: ringResetAt,
        }),
        // Absent, not zeroed (C28 I11): a zeroed histogram reads as
        // measured-and-fast.
        ...(spanning()
          ? {
              spans: Object.freeze(snapshotAll(spanHists)),
              latency: Object.freeze({ work: workH.snapshot(), wait: waitH.snapshot() }),
            }
          : {}),
        byReason: Object.freeze(snapshotAll(byReason)),
        timeline: Object.freeze(drawn.map(strip)),
        worst: Object.freeze(worst),
        nodes: nodes.snapshot(),
        byKind: Object.freeze(snapshotAll(byKind)),
        counters: Object.freeze(Object.fromEntries(counters)),
        gauges: Object.freeze(snapshotAll(gaugeHists)),
        misses: Object.freeze(missOut),
        hits: Object.freeze(Object.fromEntries(hits)),
        marks: Object.freeze(marks.toArray()),
        samples: Object.freeze(samples.toArray()),
        captures: Object.freeze([...captures]),
        excluded: Object.freeze({ selfInflicted: excludedSelf, fallback: excludedFallback }),
        dropped: Object.freeze({
          frames: frames.dropped,
          samples: samples.dropped,
          marks: marks.dropped,
          captureBytes: captures.reduce((n, c) => n + c.droppedBytes, 0),
        }),
        overhead: Object.freeze({
          spans: spansOpened,
          clockNs,
          // Two reads per span. An estimate, and named one — the true figure
          // needs a second instrument, and that one needs a third.
          estimateMs: (spansOpened * 2 * clockNs) / 1e6,
          asyncEnabled: contexts.asyncEnabled,
        }),
        // Read here rather than sampled: a snapshot at report time, which is
        // what the question wants — see `ResourceProbe.spaces`.
        heapSpaces: probe?.spaces() ?? Object.freeze([]),
        frames: seq,
      });
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      sampler?.[Symbol.dispose]();
      sampler = null;
      probe?.dispose();
    },
  };

  return self;
}

/** Whether a tier records durations — the one place the comparison is spelled. */
export function isSpanning(tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK.spans;
}

/** Whether a tier records anything at all. */
export function isRecording(tier: Tier): boolean {
  return TIER_RANK[tier] > TIER_RANK.off;
}
