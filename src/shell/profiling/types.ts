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
import type { ElementOp, NodeStat, TreeNode } from "./tree.js";

export type { CommitReason, ElementOp, HeapSpace, LeakStat, NodeStat, TreeNode, Probe };

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
/**
 * **`body`, `prompt`, `composite` and `based` are `assemble`'s parts** (C28 §2).
 *
 * Added because `assemble` was **58 % of a frame's work with no breakdown** —
 * 358.2 ms of self time over 34 frames against `react`'s 151.9 ms, in the run
 * whose job was to rank what to fix. A span that large with nothing under it
 * names the file and not the work, and a ranking built on it has a hole where
 * its first entry should be (F936).
 *
 * All four group as `draw`, like the bracket they sit in, so the phase total is
 * unchanged and only the breakdown improves.
 */
export type SpanName =
  | "frame" | "compose" | "measure" | "elements" | "paint" | "react" | "assemble" | "write"
  | "body" | "prompt" | "composite" | "based" | "transcript" | "visible"
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
  // `assemble`'s parts, so necessarily where `assemble` is.
  body: "frame",
  prompt: "frame",
  composite: "frame",
  based: "frame",
  transcript: "frame",
  visible: "frame",
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
  // **`draw`, with `assemble`, and that is the point.** They are its children,
  // so grouping them anywhere else would move cost between phases and make the
  // split look like a regression in `compute`. Rows of cells and escape
  // sequences on every one of them.
  body: "draw",
  prompt: "draw",
  composite: "draw",
  based: "draw",
  // `body`'s two: rendering the transcript's rows, and fitting every row of the
  // frame to the width. Both are cells and escape sequences.
  transcript: "draw",
  visible: "draw",
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
  /**
   * Whether composition produced a frame or gave up (C28 I6, I54).
   *
   * **Observable on `timeline` and on `toNdjson`'s `outcome` column**, and on
   * neither until F1020: `report()` built both projections from one list
   * filtered to `"frame"`, so the member had two declared values and one
   * realised one in every session that had ever run. `worst` is still the
   * durations population and every record in it says `"frame"` by
   * construction.
   */
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
  /**
   * How many delays the histogram has actually recorded (C28 I13, F1005).
   *
   * **The resolution qualifies a figure that was measured and fell under the
   * floor; it cannot qualify one that was never measured.** With no window
   * behind it the histogram answers `max: 0` and two percentiles at 0.000511 ms
   * — and a *maximum* of zero is an existence claim about the loop, not a floor
   * reading about the instrument. So the count travels too, and a consumer with
   * nothing behind a figure prints no figure.
   */
  loopDelaySamples: number;
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
  /**
   * The session shut down while this capture was still running (I17).
   *
   * **A field rather than `droppedBytes: 0`.** How much a capture would have
   * written is not knowable once it is abandoned, and a zero there says
   * *nothing was dropped* — the absence-indistinguishable-from-failure shape
   * C28 I13 exists to forbid. `bytes` is 0 because none were written; this is
   * what says why.
   */
  abandoned: boolean;
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
  /**
   * The clock the sampler stamps a `ResourceSample.at` from (C28 I53, F971).
   *
   * **Off the recorded channel by default.** The root hands the recorder the
   * session's `elapsed` *before* the recording tap wraps it — the same
   * function, threaded, never a clock read anew (SS1) — because a periodic
   * reader cannot sit on a positional channel: even at equal counts its tick
   * lands between two of the session's reads at a position no replay can
   * reproduce, and every read after it is served one place off. A replay
   * supplies its own here, since its `elapsed` *is* the recording's stream.
   */
  sampleClock?: () => number;
  probe?: ResourceProbe;
  ring?: number;
  worst?: number;
  sampleMs?: number;
  captureDir?: string;
  captureBytes?: number;
  /**
   * Write an NDJSON recording of this session's inputs to this path (I46).
   *
   * **Not a boolean and not a directory**: one session is one recording, and a
   * path names the artefact a bug report attaches. The four taps are decorators
   * over seams `TuiConfig` already injects, so a session that sets neither of
   * these holds nothing recorder-shaped.
   */
  record?: string;
  /**
   * Drive this session from the recording at this path instead of from the
   * terminal (I14).
   *
   * **Set with `record`, both are refused at the configuration gate** (C22 I94),
   * with a message naming both fields — neither takes precedence, because both
   * silent resolutions produce a session that looks correct and an artefact
   * that is empty.
   */
  replay?: string;
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
   * Every retained frame the session's reader caused, in commit order,
   * **whatever its `outcome`** (C28 I54).
   *
   * **Not the durations population, and that is the whole distinction.** This
   * series says *what happened*; `latency`, `byReason` and `worst` say *what it
   * cost*, and I6 keeps the frame that gave up out of those alone. A fallback
   * is where composition failed, which is the frame a reader opens a profiler
   * to find — and while one filter served both, `FrameRecord.outcome` was a
   * published member whose non-`frame` value no consumer could observe (F899,
   * F1020). Filter on `outcome` here; take a duration from `latency`.
   *
   * A self-inflicted frame is on neither, because the axis the two filters
   * share is *who caused the frame* and the profiler's own redraw is the
   * instrument's (C28 I12, I34).
   *
   * **Never summable with `excluded`**: that counts for the session's life and
   * this is a window on a bounded ring a tier change resets, so a frame in
   * `excluded.fallback` need not be here — and a self-inflicted fallback is
   * counted there and never is (C28 §9c P4).
   *
   * `worst` is the *durations* population sorted by cost and truncated, so a
   * consumer wanting a series or a histogram must not take it from `worst`: a
   * top-N sorted descending is a monotone staircase whatever the session did.
   */
  timeline: readonly FrameRecord[];
  worst: readonly FrameRecord[];
  /**
   * Per-element totals — the answer to *which component is slow* (C28 I31).
   *
   * Measured per block instance through the registry seam, never divided out of
   * a sequence total. **`measures / frames` above 1 is a node recomputed within a
   * single frame**; `calls` is `measures + renders` and its floor is 2 for a
   * block that is drawn at all, so it is the seam-entry count and not the thrash
   * figure (C28 I31, F1098).
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
  dropped: Readonly<{
    frames: number;
    samples: number;
    marks: number;
    captureBytes: number;
    /** Captures still running at `dispose` — a count, because bytes are unknowable (I17). */
    captures: number;
  }>;
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
  /**
   * One sample, stamped `at` by the caller (C28 I53).
   *
   * **The probe reads the process and never a clock.** The stamp arrives from
   * the recorder, which owns `elapsed` and — when a recording is on — the
   * sampler's off-channel clock; a probe stamping from a clock of its own put
   * one read per tick onto the recorded stream (F971), and one on a different
   * origin would put a GC pause beside the wrong frame.
   */
  sample(suspended: boolean, at: number): ResourceSample;
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
   *
   * **`op` is required** (C28 I31). Both wrappers open on `kind#id`, so without
   * it the node's count is a measure summed with a render and the ratio built on
   * it is a rate neither population has — a floor of 2 for every block that is
   * drawn, printed under the words *measured more than once per frame* (F1098).
   */
  element(kind: string, id: string, op: ElementOp): Disposable;

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

  /**
   * The terminal's width changed (I26).
   *
   * **Told rather than read**: SS42 keeps the dimensions in `lifecycle.ts` and
   * C01 I13 hands them down. Every span open when this is called is tagged as
   * having crossed a resize, and spans opened after it carry the new width.
   */
  resized(columns: number): void;

  /**
   * Run `fn` with every commit it raises marked as the profiler's own (I12).
   *
   * **A marker rather than a parameter, because the seam is not the call site.**
   * A frame the profiler's own surface raises reaches the scheduler as an
   * ordinary `stream` commit, and the decorator that wraps `commit` cannot tell
   * it from the reader's — the id that would distinguish them is C23's and does
   * not travel with a commit. So the origin travels with the *call*: the
   * surface brackets its refresh, and the seam reads the bracket.
   *
   * **Synchronous and depth-counted, deliberately.** A commit is synchronous
   * from the call that raises it, so a counter is exact and an
   * `AsyncLocalStorage` would tax every `await` in the process for a case that
   * never crosses one (C28 §5's measurement: 59 ns against 38 for a bare await,
   * merely by constructing one).
   */
  own<T>(fn: () => T): T;

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
  /**
   * Wait up to `ms` for the captures still running, and report how many are not
   * done (I17).
   *
   * **Bounded, and it returns rather than throws.** A capture is a `node:inspector`
   * call this component does not control; waiting for one without a bound makes
   * a shell that will not exit, and killing one without waiting loses a file the
   * report has already promised. The bound is the trade, and the return value is
   * what the caller reports instead of guessing.
   */
  drain(ms: number): Promise<number>;

  report(): ProfileReport;
  dispose(): void;
}
