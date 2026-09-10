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
import { Leaks } from "./leaks.js";
import { Aggregate, closeNode, freezeTree, openNode, type OpenNode } from "./tree.js";
import type { Inspector } from "./node.js";
import {
  TIER_RANK,
  type CaptureKind,
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
  /**
   * The sampler's stamp, off the recorded channel (C28 I53, F971). The root
   * hands the `elapsed` the recording tap has not wrapped; absent, the sampler
   * stamps from `elapsed`, which is right for a profiler built without one.
   */
  sampleClock?: () => number;
  probe?: ResourceProbe;
  /**
   * The `node:inspector` face (C28 I17). Absent means captures are refused —
   * the recorder never constructs one, so a profiler in a unit test has no
   * inspector session and no way to acquire one.
   */
  inspector?: Inspector;
  schedule?: (fn: () => void, ms: number) => Disposable;
  node?: string;
  cpus?: number;
}>;

const DEFAULTS = {
  ring: 512,
  worst: 10,
  sampleMs: 1000,
  marks: 512,
  captureDir: ".calcium/profile",
  /**
   * 8 MB. The measured heap snapshot is **5.32 MB near-empty and 60.56 MB
   * holding 200 000 objects**, so this keeps a floor-sized snapshot whole and
   * truncates the case the capture exists for — which is the right way round:
   * a truncated 60 MB snapshot says *the heap is large* on its first line, and
   * an untruncated one costs 60 MB of the disk of a process suspected of
   * leaking. `truncated` and `droppedBytes` say which happened.
   */
  captureBytes: 8 * 1024 * 1024,
  /** The window a `cpu` or `alloc` capture samples over, unless asked. */
  captureMs: 1000,
} as const;

/**
 * The extensions the two tools that read these look for.
 *
 * `.cpuprofile` and `.heapprofile` open in Chrome DevTools by drag-and-drop and
 * in speedscope by name; `.heapsnapshot` is the Memory tab's. Naming a capture
 * `.json` produces a file both tools refuse to open, so the extension is part
 * of the format rather than decoration.
 */
const EXTENSIONS: Readonly<Record<CaptureKind, string>> = Object.freeze({
  cpu: "cpuprofile",
  alloc: "heapprofile",
  heap: "heapsnapshot",
});

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
  // **A periodic reader cannot sit on a positional channel** (C28 I53). The
  // sampler's tick lands between two of the session's reads at a position no
  // replay reproduces — measured, the count differed by one per second of
  // session, and equal counts would still misalign every read after the tick
  // (F971) — so its stamp comes from a clock the recording never wraps. An
  // `elapsed` given on the options is already off the tap and keeps the sample
  // on the spans' axis.
  const sampleClock = opts.sampleClock ?? opts.elapsed ?? deps.sampleClock ?? deps.elapsed;
  const probe = opts.probe ?? deps.probe;

  let tier: Tier = opts.tier ?? DEFAULT_TIER;
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
  const byEntry = new Map<string, Hist>();
  const counters = new Map<string, number>();
  const misses = new Map<string, Map<MissReason, number>>();
  const hits = new Map<string, number>();
  const captures: CaptureResult[] = [];
  /**
   * Captures started and not yet returned (C28 I17).
   *
   * **A set rather than a counter**, because `dispose` has to *name* what it
   * abandoned: the report already promises a path for every capture the session
   * took, and a file the report does not mention is a file nobody finds. A
   * counter would say one was lost and not which.
   */
  const inFlight = new Map<string, { kind: CaptureKind; startedAt: number }>();
  const nodes = new Aggregate();
  const leaks = new Leaks();

  const workH = new Hist();
  const waitH = new Hist();

  let seq = 0;
  /** Frames drawn, at every recording tier — never `seq`, which is spans-only (C28 I44). */
  let framesDrawn = 0;
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
  let ownDepth = 0;
  let abandonedCaptures = 0;
  /**
   * The width every span opens at, and `null` until the root reports one.
   *
   * **Held here rather than read**, because SS42 puts the terminal's dimensions
   * in `lifecycle.ts` and hands them down (C01 I13). The profiler is told.
   */
  let width: number | null = null;
  /** Every span open right now, so a resize can tag all of them at once. */
  const openSpans = new Set<OpenNode>();
  let ownCommitsSinceFrame = 0;

  /**
   * The frame's own root span, and the tree hanging off it.
   *
   * A span opened outside a frame — a transport call, a live fetch — has no
   * frame root and attributes to the session rather than to a frame. That is
   * not a gap: those are precisely the costs that are *not* in a frame, and
   * folding them into one would be the wait-as-work mistake one level up.
   */
  /**
   * The transcript entry whose work is being measured, or `null` (C28 I42).
   *
   * **A scope rather than a parameter**, because the thing that knows the entry
   * and the thing that opens the element span are separated by the whole
   * registry: the shell iterates entries and the wrapper sees a `Block`. A slot
   * the shell sets and restores is the only place the two meet without widening
   * a seam C14 owns — and measured over twenty retained trees, every element
   * span belonging to an entry opens under `paint > assemble`, inside the loop
   * that sets it, so the scope covers what it claims to (F892).
   *
   * Saved and restored rather than cleared, so a nested scope is correct even
   * though nothing nests one today.
   */
  let currentEntry: string | null = null;

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
    const node = openNode(name, ctx.parent ?? frameRoot, elapsed(), width);
    ctx.parent = node;
    openSpans.add(node);
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
    openSpans.delete(node);
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
      samples.push(probe.sample(suspended, sampleClock()));
      sampler = deps.schedule?.(tick, every) ?? null;
    };
    sampler = deps.schedule(tick, every);
  };

  /**
   * C24 I32 — the last **completed** frame's work, for `ChromeContext`.
   *
   * **`work`, not `work + wait`.** C28 I4 refuses the sum as a stored figure
   * because the wait is time before the frame began — the scheduler's or the
   * terminal's — and adding it to the cost gives a number that grows when the
   * session is idle. A chrome drawing `last 12.4ms` is answering *how long did
   * composing that frame take*, which is `work` alone.
   *
   * **Any outcome, including `fallback`.** `report()` filters fallbacks out of
   * `worst` and the durations, because those are projections over the frames
   * that *composed* (I6) — `timeline` carries them, because it is the series of
   * what happened rather than of what it cost (I54). This is neither: it is the
   * most recent measurement. A session repeatedly falling back would otherwise
   * hold the last *drawn* frame's figure on screen indefinitely, presenting a
   * stale number as the present one.
   */
  let lastWork: number | undefined;

  const resetRing = (): void => {
    frames.clear();
    // **The chrome's figure clears with the ring** (C24 I32). Histograms from
    // two tiers describe neither, and a single figure from the tier before the
    // change is the same statement with one sample: a footer reading `last
    // 12.4ms` after a drop to `counters` is a number no longer being maintained,
    // which is F900's stopped clock in one cell.
    lastWork = undefined;
    samples.clear();
    spanHists.clear();
    gaugeHists.clear();
    byReason.clear();
    byKind.clear();
    byEntry.clear();
    leaks.clear();
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
  /**
   * The entry scope's close — a restore, not a clear.
   *
   * No span, no clock read and no node: an entry is not a region of work, it is
   * *whose* work the regions inside it are. Bracketing it with a span would put
   * a name in the tree that no call site has and double-count every element
   * under it against `frame`.
   */
  class EntryHandle {
    readonly #was: string | null;
    constructor(id: string) {
      this.#was = currentEntry;
      currentEntry = id;
    }
    [Symbol.dispose](): void {
      currentEntry = this.#was;
    }
  }

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
      readonly entry: string | null,
    ) {}
    [Symbol.dispose](): void {
      const spent = end(this.node, this.ctx);
      // Self time in both, so a container is not charged for its children and
      // `Σ nodes.self` is the frame's real element cost.
      hist(byKind, this.kind).add(spent);
      // **Two partitions of one population, not a sum and a projection.** Every
      // close lands in exactly one bucket of each, so `Σ byKind` is `Σ nodes.self`
      // exactly and `Σ byEntry` falls short of it by whatever no entry claimed —
      // the chrome, the prompt, the overlays. That shortfall is a figure to print,
      // not a rounding error: a `byEntry` silently omitting the chrome reads as
      // *the chrome is free* (C28 I42).
      if (this.entry !== null) hist(byEntry, this.entry).add(spent);
      nodes.add(this.node.name, this.entry, spent, this.node.total ?? spent, seq);
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

    setSuspended(on: boolean): void {
      // **Not gated on the tier.** The flag is a fact about the process, and a
      // tier raised mid-handoff would otherwise begin sampling a suspended
      // session while reporting it as running. Setting a boolean at any tier
      // costs a store.
      if (disposed) return;
      suspended = on;
    },

    span(name: string): Disposable {
      if (disposed || !spanning()) return NO_SPAN;
      const { node, ctx } = begin(name);
      return new SpanHandle(node, ctx);
    },

    element(kind: string, id: string): Disposable {
      if (disposed || !spanning()) return NO_SPAN;
      const { node, ctx } = begin(`${kind}#${id}`);
      return new ElementHandle(node, ctx, kind, currentEntry);
    },

    entry(id: string): Disposable {
      if (disposed || !spanning()) return NO_SPAN;
      return new EntryHandle(id);
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

    track(name: string, held: object): void {
      // **Gated on `counting()`, so `off` arms nothing** (C28 I1, I43). The
      // registry is built inside `Leaks` on the first call that gets here, so a
      // profiler raised to `counters` and never asked to track holds none
      // either — two conditions, both wanted, and T1.73 asserts the first.
      if (disposed || !counting()) return;
      leaks.track(name, held);
    },

    resized(columns: number): void {
      // **Every span open right now is tagged, and the new width does not
      // reach them** (C28 I26). A span opened at 100 columns and closed at 60
      // measured the work 100 columns implied; filing it under 60 is a cost
      // attributed to geometry that did not produce it, and it is silent
      // because both the number and the duration are real. The tag is what
      // says the figure has a caveat rather than a wrong width.
      for (const node of openSpans) node.crossedResize = true;
      width = columns;
    },

    own<T>(fn: () => T): T {
      // **`try`/`finally` and not a decrement after the call.** A surface that
      // throws mid-refresh would otherwise leave the depth raised, and every
      // frame the reader caused afterwards would be excluded from the
      // histograms as the profiler's own — a measurement that quietly stops
      // measuring, which is the failure class this component exists to end.
      ownDepth += 1;
      try {
        return fn();
      } finally {
        ownDepth -= 1;
      }
    },

    commit(reason: CommitReason, own: boolean): void {
      if (disposed || !counting()) return;
      // The bracket and the flag are an *or*: the seam passes what it knows and
      // the marker adds what only the call site knew.
      own = own || ownDepth > 0;
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
      frameRoot = openNode("frame", null, frameStart, width);
      contexts.current().parent = frameRoot;
    },

    endFrame(outcome: FrameOutcome): void {
      if (disposed || !counting()) return;
      earliestUnserved = null;
      commitsSinceFrame = 0;
      ownCommitsSinceFrame = 0;
      // **The two conditions say different things and are separated for it**
      // (C28 I44). Below `spans` there is no `beginFrame` state to close and
      // the frame is still a frame: it drew, it is counted, and `report.frames`
      // is what a consumer divides by. Folded together, the count sat under the
      // duration's guard and `counters` published `frames: 0` for a session
      // that drew twelve — with `counters["frame.input"]` holding the right
      // number two functions above (F894).
      if (!spanning()) {
        framesDrawn += 1;
        return;
      }
      if (!inFrame) return;
      inFrame = false;
      const endedAt = elapsed();
      const work = endedAt - frameStart;
      const root = frameRoot;
      frameRoot = null;
      contexts.current().parent = null;
      seq += 1;
      framesDrawn += 1;
      lastWork = work;

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

    lastFrame(): number | undefined {
      return lastWork;
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
        track: (name: string, held: object) => {
          self.track(name, held);
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
      // **Two filters, because the two projections answer two questions**
      // (I54, F899). `series` is *what happened* — every frame the session's
      // reader caused, in commit order, whatever its outcome — and `drawn` is
      // *what it cost*, which is the population I6 keeps a fallback out of.
      // Both drop the self-inflicted frame, because the axis the two share is
      // **who caused it** and the profiler's own redraw is the instrument's,
      // not the session's (I12, I34).
      //
      // One list served both until F1020, and the cost was not only that the
      // interesting frame vanished. The ring's bound is spent on a fallback
      // either way, so a ring of one holding a fallback published an **empty**
      // `timeline` for a session that drew two frames — `frames` 2,
      // `dropped.frames` 1, `timeline.length` 0, three figures no reader can
      // reconcile (§9c Q1). And `FrameRecord.outcome` was a published member
      // whose non-`frame` value nothing could observe: `toNdjson` has emitted
      // an `outcome` column for its whole life and the column held one value
      // in every session that ever ran.
      const series = held.filter((f) => !f.selfInflicted);
      const drawn = series.filter((f) => f.outcome === "frame");
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
          captureDir: opts.captureDir ?? DEFAULTS.captureDir,
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
        timeline: Object.freeze(series.map(strip)),
        worst: Object.freeze(worst),
        nodes: nodes.snapshot(),
        byKind: Object.freeze(snapshotAll(byKind)),
        byEntry: Object.freeze(snapshotAll(byEntry)),
        leaks: leaks.snapshot(),
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
          captures: abandonedCaptures,
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
        frames: framesDrawn,
      });
    },

    async capture(kind: CaptureKind, ms?: number): Promise<CaptureResult> {
      // **The tier refusal is first and it names the tier**, because the
      // alternative is a capture that returns a 0-byte file at `counters` and
      // a reader concluding the process has no heap (C28 I17, T3.4).
      if (TIER_RANK[tier] < TIER_RANK.deep) {
        throw new Error(
          `capture("${kind}") needs tier "deep"; this profiler is at "${tier}"`,
        );
      }
      if (disposed) throw new Error(`capture("${kind}") after dispose`);
      const inspector = deps.inspector;
      if (inspector === undefined) {
        throw new Error(`capture("${kind}") has no inspector — none was injected`);
      }

      // The name carries the kind and the moment, so two captures in one
      // session do not overwrite each other and a directory of them sorts into
      // the order they were taken.
      const dir = opts.captureDir ?? DEFAULTS.captureDir;
      const path = `${dir}/${kind}-${String(seq)}-${String(Math.round(elapsed()))}.${EXTENSIONS[kind]}`;
      inFlight.set(path, { kind, startedAt: elapsed() });
      let result: CaptureResult;
      try {
        result = await inspector.capture(
          kind,
          path,
          opts.captureBytes ?? DEFAULTS.captureBytes,
          ms ?? DEFAULTS.captureMs,
        );
      } finally {
        // `finally`, so a capture that throws leaves the set as well. Otherwise
        // `dispose` reports it abandoned for ever and `drain` waits out its
        // whole bound on something that is already over.
        inFlight.delete(path);
      }
      // Recorded on the profiler rather than returned only, so `report()` names
      // every capture the session took — a file on disk that the report does
      // not mention is a file nobody finds.
      self.addCapture(result);
      return result;
    },

    async drain(ms: number): Promise<number> {
      // **Polled on the injected `schedule`, not on a timer of its own** (SS1).
      // The wait is bounded by the session's own clock, so a test driving a
      // fake one is not held for a real second.
      const until = elapsed() + Math.max(0, ms);
      while (inFlight.size > 0 && elapsed() < until) {
        const schedule = deps.schedule;
        if (schedule === undefined) break;
        await new Promise<void>((resolve) => {
          schedule(() => resolve(), 1);
        });
      }
      return inFlight.size;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      // **What was still running is recorded, not dropped silently** (I17,
      // T3.5). `bytes` is 0 because none were written and `abandoned` says why
      // — a `droppedBytes` figure here would be a guess, and a zero would read
      // as *nothing was lost*.
      for (const [path, { kind, startedAt }] of inFlight) {
        captures.push(
          Object.freeze({
            kind,
            path,
            bytes: 0,
            truncated: true,
            droppedBytes: 0,
            durationMs: elapsed() - startedAt,
            abandoned: true,
          }),
        );
      }
      abandonedCaptures += inFlight.size;
      inFlight.clear();
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

/**
 * **The tier an options object gets when it names none** — and the only place
 * that default lives. `resolveConfig` leaves `profile` unresolved on purpose
 * (every member's default is applied here), so the root's gate on whether to
 * build a recorder at all reads this rather than restating it. C22 §2c's
 * listing said `default "off"` while two sites in the root said
 * `?? "counters"` (F967): an empty options object is a caller asking for a
 * profiler, and `counters` is the tier §3a measures at nil. An *absent*
 * `profile` is `off` — that is C28 T4.1, and it is decided by the gate, not
 * here.
 */
export const DEFAULT_TIER: Tier = "counters";

/** Whether a tier records anything at all. */
export function isRecording(tier: Tier): boolean {
  return TIER_RANK[tier] > TIER_RANK.off;
}
