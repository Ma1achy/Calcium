/**
 * C28 — the profiler's types.
 *
 * See `docs/components/C28_profiler.md`. Nothing here reads a clock or the
 * process: `elapsed` and the `ResourceProbe` arrive injected (C28 I2), and the
 * one file allowed to name a process figure is `node.ts` (C28 I21).
 *
 * **The instrumentation interface is not declared here.** `Probe` lives at L0
 * beside `Measure` (`src/data/viewmodel/probe.ts`, C28 I30), because a renderer
 * has to name it and MG1 forbids anything below rank 4 importing this
 * directory. What lives here is the recorder that implements it.
 */
import type { MissReason, Probe } from "../../data/viewmodel/probe.js";
import type { CommitReason } from "../../terminal/frame-scheduler.js";
import type { HeapSpace } from "./node.js";
import type { LeakStat } from "./leaks.js";
import type { NodeStat, TreeNode } from "./tree.js";

export type { CommitReason, HeapSpace, LeakStat, NodeStat, TreeNode, Probe };

export type Tier = "off" | "counters" | "spans" | "alloc" | "deep";

/** Ordered, so a tier comparison is a number rather than a set of `||`s. */
export const TIER_RANK: Readonly<Record<Tier, number>> = Object.freeze({
  off: 0, counters: 1, spans: 2, alloc: 3, deep: 4,
});

/**
 * The framework's own phase names.
 *
 * **Advisory, not a constraint.** `Profiler.span` and `Probe.span` both take a
 * plain `string`, because a component names its own internals and a union the
 * framework owns cannot enumerate them — `plot.raster` and `table.plan` are the
 * point of the seam. This union is what `src/shell/` uses for the frame's own
 * phases, so those stay spelled one way across the tree.
 */
export type SpanName =
  | "frame" | "compose" | "measure" | "elements" | "paint" | "react" | "assemble" | "write"
  | "decode" | "route" | "handler" | "local" | "transport" | "adapt" | "stream" | "livefetch"
  | "completion" | "overlays" | "chrome";

/**
 * What each phase is doing, in the terms the question gets asked in: *was the
 * frame computing something, or actually drawing it?*
 *
 * A span name says where in the code the time went. This says what kind of work
 * it was, which is what decides the remedy. `compute` is geometry and view-model
 * construction, and answers to caching and to doing less per frame. `draw` is
 * cells and escape sequences, and answers to a smaller diff. `output` is the
 * terminal's own throughput, and answers to writing fewer bytes.
 *
 * `frame` is the bracket around the others rather than a phase of its own, so it
 * groups as `total` and is excluded wherever the parts are summed.
 */
export type PhaseGroup = "compute" | "draw" | "output" | "input" | "far side" | "total";

/** I41's partition: `frame` is the bracket, not a member of either side. */
export type SpanSite = "frame" | "session" | "frame-itself";

/**
 * One async bracket, injected.
 *
 * **The narrowest thing a seam the root cannot wrap needs** (C28 I36). Two
 * seams are built inside the module that uses them — the local registry inside
 * `createExecutionPipeline`, and a live part's `fetch` when the part is
 * declared — so there is no object the composition root could have decorated on
 * the way past. They take this instead of a `Profiler`, so neither file learns
 * that a recorder exists; it is the same narrowing `asProbe()` performs for the
 * synchronous seams.
 *
 * Absent means unprofiled, and the call site's fallback is `fn()` — not a
 * no-op wrapper, because a wrapper is an allocation and a promise hop on a path
 * that is meant to cost nothing at `off`.
 */
export type TraceFn = <T>(name: SpanName, fn: () => Promise<T>) => Promise<T>;

/**
 * Where a span is opened: inside a frame, outside one, or as the frame itself
 * (C28 I41).
 *
 * **A second axis, not a repair of `PHASE_GROUP`.** That table says what *kind*
 * of work a span is — F881 corrected `adapt` from `far side` to `compute` on
 * exactly that reading — and this says *when* it happens. Both are needed
 * because a denominator depends on the second: `latency.work` sums the frames'
 * work, so it contains the `frame` spans and none of the `session` ones, and a
 * share taken over the union divides one population by another's total.
 * `compose` is compute inside a frame and `local` is compute outside one; the
 * kind column cannot separate them.
 *
 * **Measured, then declared.** `frameRoot` is nulled at frame end
 * (`recorder.ts`), so a span opened between frames roots itself and cannot
 * appear in a frame's tree — which makes the trees the honest source, and T1.64
 * reads them. It is declared here rather than derived because a tree walk sees
 * only the names a run happens to open: a fixture with no far side reaches 13
 * of 19, and `transport`, `adapt`, `stream`, `livefetch` and `completion` would
 * be filed as `session` by a run that never opened them, which happens to be
 * right and would be right for no reason. The table is the claim; the walk is
 * what stops it being satisfied by itself.
 *
 * `frame` is neither, for the same reason it is `total` above: it is the
 * bracket the other two are measured against.
 */
export const SPAN_SITE: Readonly<Record<SpanName, SpanSite>> = Object.freeze({
  frame: "frame-itself",

  // Opened inside `#render`, between `frame`'s ends.
  compose: "frame",
  measure: "frame",
  elements: "frame",
  chrome: "frame",
  overlays: "frame",
  paint: "frame",
  react: "frame",
  assemble: "frame",
  write: "frame",

  // Opened on the input and command paths, which run *between* frames: a
  // handler commits and the frame follows, so its cost is never inside one.
  decode: "session",
  route: "session",
  handler: "session",
  completion: "session",
  local: "session",
  transport: "session",
  adapt: "session",
  stream: "session",
  livefetch: "session",
});

export const PHASE_GROUP: Readonly<Record<SpanName, PhaseGroup>> = Object.freeze({
  frame: "total",
  compose: "compute",
  measure: "compute",
  elements: "compute",
  chrome: "compute",
  overlays: "compute",
  paint: "draw",
  react: "draw",
  assemble: "draw",
  write: "output",
  decode: "input",
  route: "input",
  handler: "input",
  completion: "input",
  // **The local route is work, not input.** `handler` above is whichever key
  // handler `router.dispatch` resolves to, which is why it sits with `decode`
  // and `route`; C23's local verb route produces a `ViewDocument` in this
  // process. Two different things, and this round's plan called both `handler`.
  local: "compute",
  transport: "far side",
  // **`compute`, and it was `far side`** (F881). `adapt(raw, ctx)` returns a
  // `ViewDocument` — view-model construction by the definition at the top of
  // this comment block, synchronous and in this process. `far side` is the
  // heading a reader scans to decide a cost is not theirs to fix, so an
  // in-process adapter filed there hides the one adaptation cost they can act
  // on. Nothing checked it: the mapping is total by construction, so the type
  // proves the table complete, which reads exactly like proving it correct.
  adapt: "compute",
  stream: "far side",
  livefetch: "far side",
});

/**
 * Log-linear buckets. `error` is the relative bound and it is carried on the
 * value rather than in a doc comment, because a percentile quoted without one
 * cannot be compared across runs (C28 I10).
 */
export type Histogram = Readonly<{
  count: number; min: number; p50: number; p95: number; p99: number;
  max: number; sum: number; mean: number; error: number;
}>;

/**
 * The axis a cache's own comparison rejected first, plus one member that is not
 * an axis: `nothing-changed` means the recomputed value equalled the value the
 * miss discarded (C28 I8). "No axis moved" is not a reachable state — a slot
 * agreeing on every axis *is* a hit — so counting it as an axis would be a
 * member that can never be non-zero.
 */
/**
 * Re-exported from L0, where the caches that report it can reach it.
 *
 * The declaration moved and the name did not: C28's spec, `ProfileReport.misses`
 * and every citation of it still resolve here, and `src/viewport/` gets to name
 * the same union without an upward import.
 */
export type { MissReason };

export type GcKind = "minor" | "major" | "incremental" | "weakcb";

export type FrameOutcome = "frame" | "fallback";

/**
 * One frame, kept whole.
 *
 * **`work` and `wait` are never summed** (C28 I4). There is deliberately no
 * `total` member: the previous shape published `wait + work` and a reader who
 * sees three numbers where two are independent will quote the third. A frame
 * that waited 100 ms in the coalescing window and rendered in 3 ms has a
 * scheduling problem, and a single 103 ms figure hides which.
 */
export type FrameRecord = Readonly<{
  seq: number;
  reason: CommitReason;
  /** Time spent rendering — the framework's efficiency. */
  work: number;
  /** Commit raised to frame started — the framework's policy. */
  wait: number;
  /** Self time per phase, this frame. */
  spans: Readonly<Partial<Record<string, number>>>;
  /**
   * The span tree, present only on frames kept as worst (C28 I32).
   *
   * A tree per frame is unbounded where a per-key sum is not, so the ring holds
   * records and only the worst keep their structure. A p95 says a tail exists
   * and this is what is in it.
   */
  tree?: TreeNode;
  outcome: FrameOutcome;
  selfInflicted: boolean;
  at: number;
}>;

export type ResourceSample = Readonly<{
  at: number;
  rss: number; heapUsed: number; heapTotal: number; external: number; arrayBuffers: number;
  /** V8's ceiling — `heapUsed` against this is how close an OOM is. */
  heapLimit: number;
  cpuUser: number; cpuSystem: number;
  /**
   * Event-loop utilisation over the whole process life, in `[0, 1]`.
   *
   * The honest *is this process busy* figure, and cheaper than everything else
   * here at 0.2 µs. CPU time answers a different question — a process blocked
   * on a subprocess burns no CPU and is not idle.
   */
  loopUtilisation: number;
  /** The resolution travels with the figure (C28 I13). */
  loopDelayMax: number; loopDelayP50: number; loopDelayP99: number;
  loopDelayResolutionMs: number;
  gc: Readonly<Record<GcKind, number>>;
  gcPauseMs: number;
  /**
   * Page faults and context switches, from `process.resourceUsage()`.
   *
   * A major fault is a read from disk and a thousand involuntary switches is a
   * contended machine — both of which make a timing figure say more about the
   * host than about the code, which is what `make regime` exists to record.
   */
  majorPageFaults: number; involuntaryContextSwitches: number;
  /** Active handles by type, from `getActiveResourcesInfo` — a handle leak's ledger. */
  handles: Readonly<Record<string, number>>;
  /** F853's canary — a count with no attribution, and it says so (C28 I25). */
  timingEntries: number;
  suspended: boolean;
}>;

export type CaptureKind = "cpu" | "heap" | "alloc";

export type CaptureResult = Readonly<{
  kind: CaptureKind;
  path: string;
  bytes: number;
  truncated: boolean;
  droppedBytes: number;
  durationMs: number;
}>;

/**
 * What the instrument cost, reported rather than assumed (C28 I34).
 *
 * A profiler that does not price itself is the failure class it exists to end.
 * `clockNs` is this machine's measured `elapsed()` cost; `spans` is how many
 * were opened; `estimateMs` is the product. It is an estimate and says so — the
 * true figure would need a second instrument, and that one would need a third.
 */
export type Overhead = Readonly<{
  spans: number;
  clockNs: number;
  estimateMs: number;
  /** Whether the async store is built, and therefore whether promises are taxed. */
  asyncEnabled: boolean;
}>;

export type ProfileOptions = Readonly<{
  tier?: Tier;
  elapsed?: () => number;
  probe?: ResourceProbe;
  ring?: number;
  worst?: number;
  sampleMs?: number;
  captureDir?: string;
  captureBytes?: number;
  /**
   * The report's way out of the process (C28 I38).
   *
   * **`report()` had exactly one caller** — `PipelineDeps.profile`, and so an
   * in-app verb — which meant a session could record every span, counter and
   * sample in the component and nothing outside the process could read any of
   * it. `make profile`, a consumer's CI and a bug report all had that problem.
   *
   * Called once from `stop()`, before the profiler is disposed — on asymmetry
   * rather than on a mechanism, because nothing observable separates the two
   * orders (F883). Not called at all when nothing was recorded, so a callback
   * that never fires means no recording rather than an empty report.
   */
  onReport?: (report: ProfileReport) => void;
}>;

export type ProfileReport = Readonly<{
  regime: Readonly<{
    node: string; cpus: number; tier: Tier; durationMs: number;
    histogramError: number; ringReset: number;
    /**
     * Where a capture would be written (C22 I95, C28 I17).
     *
     * **A condition of the run, like `node` and `cpus`.** A reader handed a
     * report naming a 60 MB heap snapshot needs the directory to find it, and
     * a report that names a file nobody can locate is a file nobody reads.
     *
     * It is also the only place the resolution is observable. `session.ts`
     * resolves it against `stateDir` so the capture lands inside the
     * self-ignoring directory C22 I67 creates; before this member the two were
     * separate strings that agreed by coincidence, and nothing could compare
     * them (F901).
     */
    captureDir: string;
  }>;
  /** Absent, not zeroed, below tier `spans` (C28 I11). */
  spans?: Readonly<Partial<Record<string, Histogram>>>;
  latency?: Readonly<{ work: Histogram; wait: Histogram }>;
  byReason: Readonly<Partial<Record<CommitReason, Histogram>>>;
  /**
   * Every retained frame in commit order — the ring's drawn contents.
   *
   * `worst` is the same set sorted by cost and truncated, so a consumer wanting
   * a series or a histogram must not take it from `worst`: a top-N sorted
   * descending is a monotone staircase whatever the session did.
   */
  timeline: readonly FrameRecord[];
  worst: readonly FrameRecord[];
  /**
   * Per-element totals — the answer to *which component is slow* (C28 I31).
   *
   * Measured per block instance through the registry seam, never divided out of
   * a sequence total. `calls / frames` above 1 is a node recomputed within a
   * single frame.
   */
  nodes: readonly NodeStat[];
  byKind: Readonly<Record<string, Histogram>>;
  /**
   * Per transcript entry — *which output on screen is expensive* (C28 I42).
   *
   * The **other partition** of the population `byKind` partitions, over the same
   * closes: an element lands in one bucket of each. So `Σ byKind` is `Σ nodes.self`
   * exactly, and `Σ byEntry` falls short of it by what belongs to no entry — the
   * chrome, the prompt, the overlays, all measured every frame. The shortfall is
   * a reading, not a discrepancy, and a consumer that treats the two sums as
   * comparable is reading *the chrome is free*.
   */
  byEntry: Readonly<Record<string, Histogram>>;
  counters: Readonly<Record<string, number>>;
  /** Sizes rather than events — series length, cell count, cache occupancy. */
  gauges: Readonly<Record<string, Histogram>>;
  misses: Readonly<Record<string, Readonly<Partial<Record<MissReason, number>>>>>;
  hits: Readonly<Record<string, number>>;
  marks: readonly Readonly<{ at: number; label: string }>[];
  samples: readonly ResourceSample[];
  captures: readonly CaptureResult[];
  excluded: Readonly<{ selfInflicted: number; fallback: number }>;
  /**
   * Per tracked class — made, reported collected, and what that leaves.
   *
   * **Bounded rather than exact, and the bound is stated** (C28 I43): a
   * `FinalizationRegistry` callback is a promise the runtime may keep late or
   * not at all, so `finalised` is a lower bound and `live` an upper one — with
   * a floor of one object across the whole map, belonging to whichever class
   * registered last (F893). Read the shape over a session, not the instant.
   */
  leaks: Readonly<Record<string, LeakStat>>;
  dropped: Readonly<{ frames: number; samples: number; marks: number; captureBytes: number }>;
  overhead: Overhead;
  /** Empty below tier `spans`, where there is no resource probe to ask. */
  heapSpaces: readonly HeapSpace[];
  frames: number;
}>;

/**
 * Stateful, and therefore a `Disposable` rather than a bare `() => Sample`:
 * `monitorEventLoopDelay` must be started to mean anything (C28 I2).
 */
export interface ResourceProbe {
  sample(suspended: boolean): ResourceSample;
  /**
   * V8's per-space occupancy, read at the moment it is asked (C28 I21).
   *
   * **On demand and not per sample**, because it answers a different shape of
   * question. `heapUsed` over time is a series and the sawtooth is the reading;
   * this is a snapshot, and it is the one that separates the two things a rising
   * total can mean. Old space climbing with new space flat is retention. New
   * space churning with old space flat is allocation pressure and no leak at
   * all. Identical totals, opposite findings.
   *
   * `getHeapSpaceStatistics()` walks every space on each call, so it is taken
   * once when the report is built rather than on the sampler's timer.
   */
  spaces(): readonly HeapSpace[];
  dispose(): void;
}

/**
 * The recorder.
 *
 * **A superset of `Probe`, not a separate vocabulary.** `asProbe()` narrows it
 * to the L0 interface for handing down to a renderer; everything a component can
 * say, the shell can say the same way, so there is one implementation of a span
 * rather than two that agree.
 */
export interface Profiler extends Probe {
  readonly tier: Tier;
  setTier(tier: Tier): void;
  /**
   * C28 I27, C28 I28 — the session is not the foreground process.
   *
   * `process.cpuUsage()` counts this process and not its children, so a sampler
   * tick landing inside a `handoff()` reports a near-idle machine while a
   * compiler saturates the terminal. That reading is **false rather than merely
   * imprecise**, which is why the sample carries the flag instead of the
   * sampler skipping the tick: a gap in the series is indistinguishable from a
   * sampler that stopped, and a consumer that knows the reason can say so.
   */
  setSuspended(on: boolean): void;

  /**
   * A span that survives an `await`.
   *
   * Runs `fn` in an async context of its own, so concurrent work — N live
   * fetches, a completion request racing a route — nests under its own parent
   * instead of trampling a shared pointer. This is the call that constructs the
   * async store, and it is the only one that does.
   */
  trace<T>(name: SpanName, fn: () => Promise<T>): Promise<T>;

  /**
   * A span for one block instance, recorded by kind as well as by node.
   *
   * The registry wrapper's seam. `kind` aggregates across instances — *what does
   * a plot cost* — and `kind#id` identifies the one to fix.
   */
  element(kind: string, id: string): Disposable;

  /**
   * Whose work the elements measured inside this belong to (C28 I42).
   *
   * `using _e = prof.entry(entry.id)` around the shell's per-entry loop. A block
   * id is unique within its own document (C04 I14) and a transcript holds many,
   * so without this two entries holding `table#t1` are one row in `nodes` whose
   * `calls / frames` is the sum of two numerators over one denominator — the
   * layout-thrash signal, fabricated. Measured 2.3 true against 5.3 reported
   * (F892).
   *
   * **Not on `Probe`**, and that is the layering rather than an oversight: a
   * transcript entry is a shell concept and no block renderer has one. It sits
   * beside `element` for the same reason `element` is not on `Probe` either.
   */
  entry(id: string): Disposable;

  /**
   * Run `fn` and return what it produced beside what it cost.
   *
   * The primitive a seam needs that `span` cannot give it: a decorated seam has
   * to attribute a duration to the thing it just measured, and SS1 forbids it a
   * clock of its own. Zero below tier `spans` — the same answer as *not
   * measured*.
   */
  timed<T>(fn: () => T): readonly [T, number];

  /** Seams. The root wraps what it was going to hand down anyway (I93). */
  commit(reason: CommitReason, own: boolean): void;
  beginFrame(reason: CommitReason): void;
  endFrame(outcome: FrameOutcome): void;

  /** The L0 view, for handing to anything below `src/shell/`. */
  /**
   * C24 I32 — the last completed frame's `work`, or `undefined` before the
   * first frame of a session and at any tier below `spans`, where no duration
   * was taken.
   *
   * **An accessor rather than a field on `report()`** because the caller is the
   * frame composer, once per frame: `report()` builds every projection, and
   * taking one number from it per frame would make the chrome the most
   * expensive thing on the screen.
   */
  lastFrame(): number | undefined;

  asProbe(): Probe;

  /** A capture the inspector produced, recorded so the report can name it. */
  addCapture(capture: CaptureResult): void;

  /**
   * Take a CPU profile, an allocation profile or a heap snapshot (I17).
   *
   * **The one feed that needs no seam**, and therefore the only one that
   * reaches inside a function nobody instrumented — the registry decoration and
   * `ctx.probe` both measure a unit from outside. `ms` is the sampling window
   * for `cpu` and `alloc` and is ignored by `heap`, which is an instant.
   *
   * Refused below tier `deep`, naming the tier: the alternative is a 0-byte
   * file at `counters` and a reader concluding the process has no heap.
   */
  capture(kind: CaptureKind, ms?: number): Promise<CaptureResult>;

  report(): ProfileReport;
  dispose(): void;
}
