# C28 — Profiler

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` · report types also at `@fmx/calcium/profiling`, whose `exports` target is `./dist/shell/profiling/index.js` and not `./dist/profiling/` — the subpath is flat and the source is not, which is R14's one visible consequence. `./testing` and `./fixtures` are the precedent |
| **Layer** | L4 shell — `src/shell/profiling/` |
| **Depends on** | nothing new. Node builtins in one file (`node.ts`), gated by SS-P |
| **Consumed by** | C22 (the composition root injects it), C24 (`TuiConfig.profile`, `ChromeContext.lastFrame`), `tools/profile.mjs` |
| **Source** | `docs/notes/CALCIUM_PROFILER_DESIGN.md` · A02 §7 · A01 Appendix B · F395, F853, F862–F864 |
| **Status** | Spec'd 2026-09-06, unbuilt |

---

## 1. Purpose

C28 records what a frame costs, what the process holds and what it burns, and hands the record back
as a value. It exists because **the framework can be measured only from outside today**: three of
A02 §7's six budgets are asserted through a PTY by byte-stamping the terminal, one in half, and two
not at all (F862).

**A01 Appendix B is where those numbers were to be written, and all six of its Layer A cells are
empty** — not three, and the distinction is the point. Three of the six are measurable from outside
and are simply not written down: resize corruption, the 10 000-line Page Down and streaming CPU.
**The other three cannot be taken from outside at any effort** — bytes written per frame, and the
median and p95 of frame construction — because no number leaves the process. A01 commitment 8 gates
the M-T6 compositor decision on that table being *measured, not estimated*, so half of it is owed to
diligence and half of it is owed to this component.

**It is L4, and that is a load-bearing choice rather than a filing decision.** A profiler that
reached into C09's paint or C14's cache would need a clock in L1 and L2, which SS1 bans across
`src/` and SS4 bans in `viewport/` with no exception at all. It does not need to: every boundary in
this framework is already a function or an interface handed down from the composition root — input,
`Ambient.clock`, `Ambient.schedule`, `VerbTransport`, `measureChild`, `write`, `composeFrame` — so
**the profiler decorates seams rather than instrumenting units**. Living under `src/shell/` makes
that literal: MG1 forbids every layer below L4 from importing it, so *nothing below L4 changes* is
enforced by a rule that already exists rather than by intention. The alternative considered was a
top-level `src/profiling/`, and it is worse in all three of its forms. `layerOf` returns `null` for a
directory with no entry in `layers.mjs` — the comment reads *outside the layer rule* — so **unranked
it is importable from every layer with nothing checking at all**; ranked at 0 it is a third L0 half,
the structure CLAUDE.md names as the one most easily broken by accident; ranked at 4 it is
`src/shell/` with an extra step.

**Its blind spot is stated because it is the whole argument for the `deep` tier.** Decoration
measures a unit from outside. `figure.ts` is 3 747 lines; a span says *the plot cost 8 ms* and cannot
say which part of it did. The span tree is not claimed to be complete, and the V8 CPU profile is
what answers the question it cannot.

C28 does not own the frame (C22), the coalescing policy (C03), the cache (C14) or what is drawn
(C09, C11, C12). It owns the record.

---

## 2. Interface

```typescript
import type { CommitReason } from "../../terminal/frame-scheduler.js";
// C03's five reasons. L4 → L0 is downward, so MG1 permits it; `src/terminal/`
// has no barrel, and `construct.ts:80` is the idiom this follows.

export type Tier = "off" | "counters" | "spans" | "alloc" | "deep";

export type SpanName =
  | "frame" | "compose" | "paint" | "assemble" | "write"
  | "measure" | "decode" | "route" | "handler" | "transport" | "adapt" | "livefetch";

/** Log-linear buckets. `error` is the relative bound, stated because a percentile
 *  quoted without one cannot be compared across runs (I10). */
export type Histogram = Readonly<{
  count: number; min: number; p50: number; p95: number; p99: number;
  max: number; sum: number; error: number;
}>;

export type MissReason =
  | "rev" | "width" | "theme" | "focus" | "range" | "evicted" | "nothing-changed";

export type GcKind = "minor" | "major" | "incremental" | "weakcb";

export type FrameRecord = Readonly<{
  seq: number;
  reason: CommitReason;
  /** Three numbers, never summed (I4). */
  work: number; wait: number; total: number;
  spans: Readonly<Partial<Record<SpanName, number>>>;
  counters: Readonly<Record<string, number>>;
  outcome: "frame" | "fallback";
  cause: Readonly<{ input?: string; replayOffset?: number }>;
  selfInflicted: boolean;
}>;

export type ResourceSample = Readonly<{
  at: number;
  rss: number; heapUsed: number; heapTotal: number; external: number; arrayBuffers: number;
  cpuUser: number; cpuSystem: number;
  /** The resolution travels with the figure (I13). */
  loopDelay: Histogram & Readonly<{ resolutionMs: number }>;
  gc: Readonly<Record<GcKind, number>>;
  gcPauseMs: number;
  /** F853's canary. Sampled, never per frame (I19). */
  timingEntries: number;
  live: Readonly<Record<string, number>>;
  suspended: boolean;
}>;

export type ProfileReport = Readonly<{
  regime: Readonly<{
    node: string; cpus: number; loadavg: number; tier: Tier;
    durationMs: number; replayOf?: string; histogramError: number;
  }>;
  startup: Readonly<{ importMs: number; firstMeasureMs: number; firstPaintMs: number; firstByteMs: number }>;
  /** Absent, not zeroed, below tier `spans` (I11). */
  spans?: Readonly<Partial<Record<SpanName, Histogram>>>;
  latency?: Readonly<Record<string, Readonly<{ work: Histogram; wait: Histogram; total: Histogram }>>>;
  worst: readonly FrameRecord[];
  counters: Readonly<Record<string, number>>;
  misses: Readonly<Record<MissReason, number>>;
  byKind: Readonly<Record<string, Histogram>>;
  byEntry: Readonly<Record<string, Histogram>>;
  marks: readonly Readonly<{ at: number; label: string }>[];
  samples: readonly ResourceSample[];
  leaks: Readonly<Record<string, Readonly<{ created: number; finalised: number; live: number }>>>;
  excluded: Readonly<{ selfInflicted: number; fallback: number }>;
  dropped: Readonly<{ frames: number; samples: number; captureBytes: number }>;
}>;

/** What a `deep` capture produced. `truncated` is not derivable from `bytes`
 *  alone — the cap is a setting and a reader holding only the file cannot know
 *  it was reached (I17). */
export type CaptureResult = Readonly<{
  kind: "cpu" | "heap" | "alloc";
  path: string;
  bytes: number;
  truncated: boolean;
  droppedBytes: number;
  durationMs: number;
}>;

export interface Profiler {
  readonly tier: Tier;
  /** Resets the ring — histograms from two tiers must not merge (I18). */
  setTier(tier: Tier): void;
  span(name: SpanName): Disposable;
  count(name: string, by?: number): void;
  miss(reason: MissReason): void;
  /** An instant on the session timeline, never inside a frame record (I20). */
  mark(label: string): void;
  report(): ProfileReport;
  capture(kind: "cpu" | "heap" | "alloc", ms?: number): Promise<CaptureResult>;
  dispose(): void;
}

/** Stateful, so a `Disposable` and not a bare function (I2). `monitorEventLoopDelay`
 *  must be started to mean anything. */
export interface ResourceProbe {
  sample(): ResourceSample;
  dispose(): void;
}
```

**`elapsed: () => number`** joins `Ambient` beside `clock` (`config.ts:162-180`). It is
monotonic and sub-millisecond; `TuiConfig.clock` is wall-clock, is drawn as a time of day by the
default header, and cannot measure a 0.3 ms paint. SS1's allow-list does not grow: `session.ts` is
already its only entry.

---

## 3. The tiers

| tier | records | cost when selected | cost when not |
|---|---|---|---|
| `off` | nothing | — | one `undefined` check per seam (I1) |
| `counters` | integers only: frames by `CommitReason`, bytes written, cells painted, blocks measured by kind, instance and entry, cache misses by reason, commits coalesced, live polls, entries appended and evicted | an increment | nothing |
| `spans` | the above, plus `work`/`wait`/`total` per frame, the span set, the N worst frames whole, and periodic `ResourceSample`s | two `elapsed()` reads per span — **50.8 ns** each, so ten spans is about **1 µs** a frame (design M15) | nothing |
| `alloc` | the above, plus V8 sampling allocation attributed to stacks | light enough for a live session: **78 KB** and **36 ms** for a whole start→stop cycle (design M22) | nothing |
| `deep` | the above, plus CPU profiles and heap snapshots written to `.calcium/profile/` (C22 I67) | large — a heap snapshot is **5.4 MB** and **314 ms** on a near-empty process (design M21), so it pauses the session | nothing |

A tier is raised by `TuiConfig.profile`, by `/profile`, or by opening the view (which raises it and
lowers it again on close, so a pane never draws an empty plot that reads as *measured, and zero*).

**Churn and retention are different instruments.** `alloc` says what was *allocated, and where*;
`deep`'s snapshot says what is *retained, now*. `CALCIUM_ROADMAP.md`'s parked question — per-frame
allocation and the GC cost of intermediate arrays — is a churn question, so `alloc` answers it and
the snapshot does not.

---

## 4. The seams

**Decorated, not instrumented.** Each of these is already a function or an interface the composition
root hands down, so the profiler wraps what C22 was going to pass anyway.

| seam | where | yields |
|---|---|---|
| the write | `FrameSchedulerOptions.write` | bytes per frame — A01 Appendix B row 1 |
| the frame | `composeFrame(deps)` (`render-frame.ts:88`) | `compose`, `paint`, `assemble` |
| block measurement | A02 Seam 1 `measureChild` | `measure`, by kind, instance and entry |
| input | the decoder (`construct.ts:2361`) and `deliver` (`:2384`) | `decode`, `route`, `handler`, and `total` |
| transport | A02 Seam 2 `VerbTransport` | `transport`, bytes in, stream rate |
| live parts | `LiveSpec.fetch` (C24 §5) | `livefetch`, and staleness |
| the timer | `Ambient.schedule` | the sampler's cadence — no new timer primitive |

**The input seam already stamps a time, and the stamp is the wrong one.** `stampInput()`
(`construct.ts:2422`) writes `lastInputAt = config.clock()` — so the decoration point exists, is
called on exactly the batches that raise a commit, and records a **wall-clock millisecond** because
what needs it is the cursor blink. That is the whole of why `elapsed` is a second seam rather than a
reuse of the first.

**Two things decoration cannot reach**, and each is an integer on an interface that already exists,
with no clock and no import of C28: C03's coalescing count (F395 records that the scheduler *hands it
to nothing*), and `HeightCache`'s and `RenderCache`'s hit and miss counts (F863 — both publish a
`size` and neither a hit). **A third needs nothing built at all**: the ten diagnostic members across
six components that F863 found unread, which the snapshot **reads** rather than duplicates.

**The resource probe** (`node.ts`) is the one file under `src/` allowed to name
`process.memoryUsage`, `process.cpuUsage`, `monitorEventLoopDelay`, `PerformanceObserver`,
`node:inspector` or `node:v8`.

**SS-P has two arms and they have different scopes, which is the part a single rule would get
wrong.** The first is scoped to `src/` with `node.ts` allow-listed — the symbols above are legitimate
in exactly one file (I21). The second is `performance.mark` and `performance.measure`, scoped to
`src/` with **`allow: []`**, because F853's leak is in the buffer those two write to and `node.ts` has
no more business calling them than any other file (I3). Writing them as one rule with one allow-list
would have exempted the profiler from the defect it was built to find, which is the failure worth
naming in the rule's `why`. It is injected rather than ambient
for SS3's reason — *nothing ambient in between* — and because a fake probe is what makes a memory
assertion deterministic in a unit test.

---

## 5. Replay, and the gate that matters more than any timing figure

Every input to this framework is injected and every render is pure, so a session's inputs can be
recorded and replayed and **the same frames come out**.

```
record   every byte from the terminal · every far-side response · every clock and elapsed
         read · every schedule callback and when it fired — in order, one NDJSON
replay   feed them back through the same seams, driving timers from the record rather
         than from real time
gate     the frames must come out BYTE-IDENTICAL (I14)
```

**C08 already does this for one of the four seams, by the technique the other three want.**
`src/data/fixtures/record.ts` records by *composing over* the transport rather than spawning for
itself, and says why: *"recording cannot drift from replay: there is no second implementation of
what a run looks like."*

**Why the gate is the point.** Three runs of a live session differ because the session differs;
three runs of a replay differ only by machine noise, which is what makes a timing figure comparable
at all, and it is the answer to a flakiness this repository has recorded four times. If a replay
does **not** produce byte-identical frames, something in the pipeline is not a function of its
inputs — which invalidates the golden suite's premise and not merely the profiler's. **A divergence
stops the round**; it is a larger finding than any number the profiler was built to produce.

**The one way this gate lies, and it is guarded.** A recording that ends while a stream is still
open replays as a *truncated* stream, not a settled one (I15). Reporting it as settled would make
the replayed frames differ for the recorder's reason and indict the framework for it — the most
expensive failure available to this design.

---

## 6. What is measured, and what is not

| | |
|---|---|
| **`work`** | `compose` + `paint` + `assemble` + `write` — the framework's efficiency |
| **`wait`** | the earliest unserved commit → the frame starting. C03's window is up to 100 ms **by design**, so this is the framework's *policy* and not its cost |
| **`total`** | byte in → bytes out. What the reader experiences |
| never | a sum of the three. Two columns that add up look like a column that is missing, which is why I4 exists and a fail-on-revert row carries it |
| a fallback frame | counted, and excluded from every duration histogram — a fallback is a frame's absence, not its cost (I6) |
| a self-inflicted frame | excluded, **and the exclusion is displayed**, or a reader watching cost rise as they open the profiler concludes the framework is slow (I12) |
| a container's cost | self time. `measureChild` recurses, so an inclusive figure counts every child twice (I7) |
| the loop-delay p50 | **not a reading.** Its floor is the sampler's own resolution — idle reads 2.00 ms at `resolution: 1`, 13.00 at `10`, 21.00 at `20` (design M17). The `max` and the high percentiles are real, and the resolution travels with them (I13) |
| `nothing-changed` | **not "no axis moved"** — that cannot happen: both caches return a hit when every axis matches, so the naive reading is a counter that can never fire. It is the recomputed value comparing equal to the discarded one, which costs one comparison on a miss and is the only form of the question the caches can answer (I8) |
| the user-timing count | sampled at most once per sampler interval. Reading it costs 3 µs at 0 entries and **449 µs at 10 000** (design M19), so the canary gets more expensive exactly as its subject gets worse (I19) |
| spans, below tier `spans` | **absent from the report, not zeroed** (I11). A zeroed histogram reads as measured-and-fast |

---

## 7. State machine

| From ↓ / event → | `span` / `count` | `sample` | `setTier` | `capture` | `dispose` |
|---|---|---|---|---|---|
| **off** | no-op, one branch (T1.1) | never scheduled | → the named tier, ring reset (T1.12) | throws naming the tier (T3.4) | → disposed |
| **counters** | `count` records; `span` is a no-op, and its absence from the report is T1.5's | never scheduled | ring reset (T1.12) | throws for `cpu`/`heap` (T3.4) | → disposed |
| **spans** / **alloc** | both record (T1.2) | on the injected `schedule` | ring reset | `alloc` only at `alloc` (T3.4) | → disposed |
| **deep** | both record | on the injected `schedule` | ring reset | writes, size-capped (T1.15) | waits, bounded, then abandons and reports what it dropped (T3.5) |
| **disposed** | no-op (T3.8) | no-op | no-op | throws | no-op, idempotent (T3.8) |

`setTier` **resets the ring** in every direction, because a report assembled from two tiers'
histograms describes neither, and the report states the point at which it was reset.

---

## 8. Invariants

- **I1** — At tier `off` the profiler allocates nothing, reads no clock, schedules nothing and registers no finaliser; every decorated seam costs one `undefined` check.
- **I2** — C28 reads no clock and no process figure of its own: `elapsed` and the `ResourceProbe` are injected, and the probe is a `Disposable` rather than a bare function because `monitorEventLoopDelay` is stateful and must be started to mean anything.
- **I3** — Spans are `elapsed()` deltas. Nothing under `src/` calls `performance.mark` or `performance.measure` — F853 measured that Node's user-timing buffer never releases entries, so a profiler built on the User Timing API becomes the defect it exists to find.
- **I4** — `work` and `wait` are two independent members and **no third member holds their sum**. Not "three numbers, never summed": a `total` on the record *was* the sum, published on the type, and a reader who sees three numbers where two are independent quotes the third. A frame that waited 100 ms in the coalescing window and rendered in 3 ms has a scheduling problem, and one 103 ms figure hides which. No report, pane, table or export produces one either.
- **I5** — `wait` is measured from the **earliest commit still unserved** when the frame starts, not from the last, because that is the one the reader has been waiting on.
- **I6** — A frame whose composition returned `fallback` is counted, carries `outcome: "fallback"`, and is excluded from every duration histogram.
- **I7** — Attribution is self time: a container's recorded cost excludes its children's, and inclusive cost is derived from the tree.
- **I8** — A miss carries exactly one `MissReason`, and the reason is the **first** axis the cache's own comparison rejected, in the order it compares them. `nothing-changed` is not one of those axes: it means **the value recomputed after the miss equalled the value the miss discarded**, and it is reported separately from every axis reason.
- **I9** — The ring is bounded, and `dropped` counts every record the bound discarded, per kind.
- **I10** — Every `Histogram` carries the relative error of its bucketing, and the report's `regime` repeats it; a percentile taken over a ring with `dropped.frames > 0` is labelled as over-the-window rather than over the session.
- **I11** — Below tier `spans` the report **omits** `spans` and `latency` rather than emitting zeroed histograms.
- **I12** — A frame is `selfInflicted` only if every commit that raised it came from the profiler; self-inflicted frames are excluded from the histograms and `excluded.selfInflicted` reports how many.
- **I13** — A loop-delay figure travels with the `resolutionMs` it was sampled at, and no consumer presents its p50 as a delay.
- **I14** — Replaying a recording produces frames byte-identical to the ones the recording was taken from.
- **I15** — A recording that ends while a stream is open replays as truncated and is reported as truncated, never as settled and never as a divergence.
- **I16** — GC kinds are translated from V8's numeric constants at the boundary, totally over the four (`MINOR=1`, `MAJOR=4`, `INCREMENTAL=8`, `WEAKCB=16`), so a fifth kind is a compile error rather than a silently dropped bucket.
- **I17** — A `deep` capture is size-capped and reports the bytes it dropped; it is written under `.calcium/profile/`, which needs no `.gitignore` change because the directory is ignored twice over — the repository's own `.gitignore:11`, and C22 I67's rule that `stateDir` is created holding a `.gitignore` of `*` regardless of the consuming project's ignore rules.
- **I18** — `setTier` resets the ring, and the report names the reset point; histograms from two tiers never merge.
- **I19** — The user-timing entry count is read at most once per sampler interval and never per frame.
- **I20** — `mark` records an instant on the session timeline and never inside a `FrameRecord`.
- **I21** — `src/shell/profiling/node.ts` is the only file under `src/` naming `process.memoryUsage`, `process.cpuUsage`, `monitorEventLoopDelay`, `PerformanceObserver`, `node:inspector` or `node:v8`.
- **I22** — `dispose` is idempotent; after it every operation is a no-op except `capture`, which throws.
- **I23** — Opening the profiler view raises the tier and closing it restores the tier that was set before; a pane with no data draws a notice and never an empty plot, because an empty plot reads as *measured, and zero*.
- **I24** — `byEntry` and `byKind` are **work** histograms and are named as such; `wait` is a property of a frame and is never attributed to an entry or a kind.
- **I25** — The user-timing entry count is reported as a count with no attribution, and labelled so: the profiler raises no marks of its own, so it cannot say whose entries these are.
- **I26** — A span open across a resize records the width it opened at and is tagged as having crossed one; it is not silently attributed to the new width.
- **I27** — A sample taken while the session is suspended carries `suspended: true`, and no consumer reads a suspended sample as an idle figure or draws it as a zero.
- **I28** — No CPU figure is reported across a `handoff()` interval: `process.cpuUsage()` excludes the child, so an idle reading there is false rather than merely imprecise.
- **I29** — A live part's `fetch` rejecting mid-poll closes its span with the rejection as its outcome; the profiler records the rejection and does not participate in the backoff C24 §5 owns.
- **I30** — **The instrumentation interface is declared at L0 and implemented only at L4.** `Probe` lives in `src/data/viewmodel/probe.ts` beside `Measure`, carries no clock and no implementation, and is the only thing a component below `src/shell/` ever names. No file under `src/terminal/`, `src/data/`, `src/presentation/`, `src/viewport/` or `src/interaction/` imports `src/shell/profiling/`, and MG1 is what makes that checkable rather than intended.
- **I31** — **An element's cost is measured per element, never divided out of a total.** Attribution comes from a span entered once per block through the registry seam. A figure obtained by apportioning a sequence's duration across the blocks in it is not an attribution: a `plot` measures 260× a `rule`, so an equal share reports how many blocks of each kind were on screen while reading as what they cost. `calls` is kept beside `frames` so a node recomputed *within* one frame is distinguishable from one measured once per frame.
- **I32** — **A span tree is built for every frame and retained only for the frames kept as worst.** The tree is the allocation the spans already made; retention is what is unbounded, and which frames are worst is not knowable until the session ends — so the decision is made at report time and the record for an ordinary frame carries no `tree` member at all rather than an empty one.
- **I33** — **A span survives an `await`, and the store that makes that true is constructed lazily.** Closing is per node against its own parent, so an out-of-order close is correct rather than discarded — the previous shape held one pointer and dropped any close that did not match it, which is precisely what interleaving produces, so every async span it could have recorded reported nothing and reported it silently. The `AsyncLocalStorage` is built on the first transition to a tier that records durations and never at import: measured on Node v22.23.2, an `await` costs 38 ns with none constructed and **59 ns with one constructed and never used**, so an eager store taxes every promise in every application by about 55 % to profile one of them.
- **I34** — **The report prices the instrument.** `overhead` carries the spans opened, this machine's measured `elapsed()` cost, the product as an estimate labelled one, and whether the async store is built. An instrument that does not report its own cost invites a reader to assume zero, and an instrument reporting its own cost *as its subject's* is the failure class this component exists to end.

---

## 9. Commitments

1. **Off is free.** No allocation, no clock, no timer, no finaliser — one branch per seam. (I1)
2. **Nothing ambient.** Every clock and every process figure is injected, and the probe owns its own lifecycle. (I2, I21)
3. **The profiler is not the leak.** No User Timing API, and the buffer that F853 found is watched rather than fed — cheaply, because reading it costs more the worse it gets. (I3, I19)
4. **Wait is not work.** Three numbers, never summed, and the wait is dated from the earliest commit still unserved. (I4, I5)
5. **What is excluded is said.** A fallback frame and a self-inflicted frame are both counted and both kept out of the durations, and both counts are in the report. (I6, I12)
6. **A cost belongs to one owner.** Self time at every level, so a recursive measurement is not counted twice. (I7)
7. **A miss says why, and *nothing changed* is measured rather than inferred.** One axis reason per miss, taken from the comparison the cache already performs; and separately, whether the recomputed value equalled the discarded one — which is wasted work reporting itself. (I8)
8. **A figure carries what it cannot say.** Its error bound, its sampling resolution, what the bound dropped, and absence rather than a zero. (I9, I10, I11, I13, I18)
9. **A replay is byte-identical, or the framework has a defect.** And a truncated recording is reported as truncated rather than as a divergence. (I14, I15)
10. **A capture is bounded and disposal is final.** (I16, I17, I20, I22)
11. **A number is refused rather than guessed.** Where the reading would be false — a suspended sample, a handoff interval, a pane with nothing behind it — the profiler reports the gap instead, because a plausible zero is worse than an absence. (I23, I27, I28)
12. **A figure is labelled with what it is *of*.** Work rather than latency, a count rather than an attribution, the width a span opened at, and a rejection rather than a duration. (I24, I25, I26, I29)
13. **A component reports on itself and imports nothing to do it.** The interface is at the bottom of the tree and the implementation at the top, so a plot can name its own phases without an edge to L4. (I30)
14. **An element's cost is measured, never apportioned.** Per block, at every depth, with the call count beside the duration so thrash and expense are different readings. (I31, I32)
15. **A span survives an `await`, or the tier that would record it is not on.** Correct across interleaving, and the machinery that costs every promise is built only when something is actually being recorded. (I33)
16. **The instrument prices itself.** (I34)

---

## 9a. The walks, and why they are not copied here

Both were run before this spec and both live in
[`docs/notes/CALCIUM_PROFILER_DESIGN.md`](../notes/CALCIUM_PROFILER_DESIGN.md) — a **10-row
classification table** (D1–D10) and an **11-row sequence trace** (S1–S11). A profiler has state and
structure, so it needed both shapes: a trace finds the event-mediated interactions and a table finds
the structural ones, and taking the trace alone because the state machine is the obvious thing is how
the structural half goes unexamined.

**They are cited rather than duplicated, and that is a ruling.** The plan said this section would
carry them. Copying a table and a trace into a second document makes two copies with nothing
reconciling them, which is the failure SP4 was built for after it was found six different ways in one
artefact.

**What replaces the copy is a resolution, and writing it found seven rulings this spec had lost.** A
walk's output is a set of rulings; a ruling that leaves no invariant behind has evaporated, and the
note reads as though it were carried either way. Resolving all twenty-one rows against §8 gives
**twelve already carried, seven carried by nothing, one correctly deferred (S10) and one that is a
defect in a test row rather than a missing invariant (D2)**. The seven are now I23–I29:

| ruling | invariant |
|---|---|
| D4 self time · D5 the wrapped ring · D7 the probe's lifecycle · D8 absent not zero · D9 `selfInflicted` · D10 the GC translation | I7 · I10 · I2 · I11 · I12 · I16 |
| S2 the fallback · S5 the bounded abandon · S6 the ring reset · S7 marks · S8 truncated · S9 the earliest unserved | I6 · I17 · I18 · I20 · I15 · I5 |
| **D1** the view raises the tier and a pane with no data draws a notice | **I23** |
| **D3** `byEntry` is a *work* histogram | **I24** |
| **D6** the canary is a count with no attribution | **I25** |
| **S1** a span crossing a resize | **I26** |
| **S3** a suspended sample is a gap, not a zero | **I27** |
| **S4** `handoff()` — `cpuUsage` does not include the child | **I28** |
| **S11** a live `fetch` rejecting mid-poll | **I29** |
| S10 the terminal round trip | none, and correctly — §11 defers it |

**D2 was the eighth, and it is a defect in a test row rather than a missing invariant.** It rules that
`nothing-changed` is deterministic *only over a replayed input*, so its assertion belongs on a replay
row. T4.2 had been written to assert it over a live session, which is the assertion D2 says cannot be
made; it now asserts attribution only, and T5.4 carries the zero.

**All seven misses read as covered, and the note is why.** A ruling written down somewhere does not
look lost, which is the whole difficulty: nothing about D3 or S4 announces that no invariant carries
it, and a reader checking the note against the plan would find both artefacts present and complete.
What reaches it is resolving every row against the spec — the same instrument as *ask where a settled
claim is written down*, turned on one's own artefact one step before the code. **That is why this
section resolves rather than points**, and it is the argument against the copy: two documents that
agree are not two checks.

---

## 10. Tests

Six tiers. Tiers 1, 3 and most of 2 drive the recorder with an injected clock and a fake probe, so
every figure is exact; tier 4 wires it through a real `constructGraph`; tier 5 replays a recorded PTY
session.

**The instrument's own fixture is tier 2's subject, and it is the one place the clock is real.** This
repository requires every instrument to have one and has found five instruments wrong, so C28 is
shown to be *right* and not only cheap. **T2.1 and T2.2 run against the real `elapsed`, and that is a
ruling rather than an oversight**: a span measured by an injected clock that was told to advance 5 ms
reports 5 ms by construction, so the fake would be supplying the very behaviour under test and the
row would pass with the timing removed. Every other row keeps the injected clock precisely so it is
exact; these two give it up because exactness is what makes them vacuous.

**They are the only timing rows that assert**, against Group 12's rule, and the bound is what buys
it: the separation asserted is roughly **400×**, not a percentage. `performance.now()` costs 50.8 ns
a call (design M15), so an empty span is on the order of 100 ns against a 5 ms subject — a gap no
machine noise closes, on a runner measured at 2.7× this host's timings (F809). A row asserting *5 ms
± 10 %* would be the flakiness this repository has recorded four times; a row asserting *≥ 4 ms and
≤ 10 µs* is a claim about the instrument.

### Tier 1 — unit

- **T1.1** (I1): at `off`, a decorated write, measure and span → the ring is never constructed, `schedule` is never called, and no `FinalizationRegistry` is registered.
- **T1.2** (I3): a span over an injected clock advancing 5 ms → 5 ms recorded, and `performance.getEntries()` is unchanged across the whole run.
- **T1.3** (I4): a `FrameRecord` with `work: 3`, `wait: 97` → the report exposes three members and no member equals 100.
- **T1.4** (I5): two commits at t=0 and t=90, one frame at t=100 → `wait` is 100, not 10.
- **T1.5** (I11): at `counters`, `report()` has no `spans` key and no `latency` key — `"spans" in report` is false, asserted rather than `spans` being empty.
- **T1.6** (I6): a composition returning `fallback` → counted in `excluded.fallback`, absent from `spans.frame`.
- **T1.7** (I7): a group of three children measured through `measureChild` → the parent's recorded cost is its own, and the derived inclusive figure is the sum.
- **T1.8** (I8): a key differing only in `theme` → `misses.theme` is 1 and `misses["nothing-changed"]` is 0; an identical key that missed → the reverse.
- **T1.9** (I9): a ring of 8 given 20 frames → 8 held, `dropped.frames` is 12. The two are asserted separately, because a conservation total is satisfied by redistribution.
- **T1.10** (I10): a report over a ring with `dropped.frames > 0` → the percentile is labelled over-the-window; with none → it is not.
- **T1.11** (I16): each of `1`, `4`, `8`, `16` → `minor`, `major`, `incremental`, `weakcb`; the map is total and a fifth number does not compile.
- **T1.12** (I18): `setTier` from `spans` to `alloc` → the ring is empty and the report names the reset.
- **T1.13** (I20): a mark raised between two spans → it is in `marks` and in no `FrameRecord`.
- **T1.14** (I22): `dispose`, then `span`, `count`, `mark`, `report` → no-ops; `dispose` again → no-op; `capture` → throws naming `dispose`.
- **T1.15** (I17): a capture exceeding the cap → the written file stops at the cap and `dropped.captureBytes` reports the excess, asserted separately — a total is satisfied by redistribution.
- **T1.16** (I23): `setTier("spans")` from `counters`, then the view closes → the tier is `counters` again, not `off`; and a report with an empty ring renders a notice rather than a plot with no series.
- **T1.30** (I30): `NO_PROBE` answers every member of `Probe`, is frozen, returns the shared `NO_SPAN`, and records nothing — the seam a component below `src/shell/` actually holds, so a missing member is a renderer throwing rather than degrading.
- **T1.31** (I30): a span taken through `asProbe()` reaches the same recorder as one taken on the profiler — a narrowing view, not a second implementation, because two implementations of a span are two things obliged to agree and the disagreement is silent.
- **T1.32** (I31, **the fabrication control**, real clock): one 200-point plot and fifty rules → the plot's self time is several times a *mean rule's*. Equal division across the sequence gives every block the same figure, so the ratio it produces is exactly 1. Against the *sum* of fifty rules the claim is false and is not made: fifty rules cost more than one plot, which is arithmetic rather than attribution.
- **T1.33** (I31): one document measured three times inside one frame → `frames` is 1 and `calls` is at least 3, so `calls / frames` is above 1. A node measured four times cheaply and one measured once expensively carry the same self time, and only this column separates them.
- **T1.34** (I31): a parent span of 11 ms containing a child of 8 → the parent's `self` is 3 and its `total` is 11, both published. An inclusive parent makes the outermost node the widest bar in every tree ever drawn.
- **T1.35** (I32): two frames at `worst: 1` → the kept record has a `tree` and the other has **no `tree` member at all**. Absence reads as *not retained*; an empty tree reads as *this frame was not nested*, which is a measurement that was never taken.
- **T1.36** (I32): three nested spans inside one frame → the retained tree's root is `frame`, the nesting is `frame → compose → measure → elements`, and `Σ self` over it equals the frame's work with nothing double-counted.
- **T1.37** (I33): two `trace` calls interleaved across an `await` → both report their own duration and the two are distinguishable. This is the case the single-pointer shape recorded as nothing, with no error.
- **T1.38** (I33): `off` and `counters` → `overhead.asyncEnabled` is false; `spans` → true before any `trace` runs. The tier is the line, not the first trace: deferring construction to the first call would put the cost of every `await` in the process starting inside whichever call happened to be first.
- **T1.39** (I34): five spans → `overhead` carries the count, this machine's measured `elapsed()` cost, and the product as an estimate labelled one. `clockNs` is measured against the *injected* clock, so the row asserts it was taken rather than what it came to — asserting a duration here asserts the host.
- **T1.17** (I24): a frame with `work: 3`, `wait: 97` attributed to entry `e1` → `byEntry.e1.sum` is 3. The 97 appears in no entry and in no kind.

### Tier 2 — contract

- **T2.1** (I2, the instrument's own fixture, **real clock**): a span wrapping a deliberate 5 ms busy-wait reports **≥ 4 ms**; a counter incremented 1 000 times reports exactly 1 000; a probe returning a rising then falling heap is reported rising then falling. The counter and the probe assert exactly, the duration asserts a floor, and the row prints all three.
- **T2.2** (I2, **the negative control**, real clock): an empty span reports **≤ 10 µs** — the span machinery's own cost, and not its subject's. Without this row T2.1 is satisfied by an instrument that reports the same figure for any input, which is the five-of-five class arriving in the tool built to end it. The two bounds are 400× apart and both are printed beside the assertion.
- **T2.3** (I13): a sample at `resolution: 10` → `loopDelay.resolutionMs` is 10, and no consumer of the report reads `loopDelay.p50` as a delay.
- **T2.4** (I21): the source scan SS-P over `src/`, with `node.ts` allow-listed; the allow-listed file is shown to still trigger the pattern, so the exemption is exercised.
- **T2.5** (I19): a 60-second run at 60 fps → `getEntries` is read at most once per sampler interval, asserted by counting probe calls rather than by timing.
- **T2.6** (I12): a frame raised by one profiler commit and one real commit → `selfInflicted` is false.
- **T2.7** (I25): the report's timing-entry figure → a count, with no site, and carrying the label that says the profiler raises no marks of its own.

### Tier 3 — edge

- **T3.1** (I5): a frame with no preceding commit (a repaint) → `wait` is 0 and not negative.
- **T3.2** (I9): a ring of 1 → the report is over one frame and says so.
- **T3.3** (I13): `resolution` larger than the sampling window → the histogram is empty rather than zero-filled.
- **T3.4** (I17): `capture("heap")` at tier `counters` → throws naming the tier required.
- **T3.5** (I17): shutdown with a capture in flight → bounded wait, then abandonment, with the dropped bytes reported.
- **T3.6** (I15): a recording truncated mid-stream → replay reports `truncated`, and **no divergence is raised**.
- **T3.7** (I6): a composition that throws after two spans have opened → both close with `outcome: "fallback"`, neither leaks an open span.
- **T3.8** (I22): every operation after `dispose`.
- **T3.9** (I26): a resize delivered between a span opening and closing → the span carries the opening width and the crossed-resize tag, and the new width appears nowhere in it.
- **T3.10** (I27): a sampler tick inside `suspend()`/`resume()` → `suspended: true`, and the utilisation figure over that interval is absent rather than 0.
- **T3.11** (I29): a `LiveSpec.fetch` rejecting mid-poll → the span closes with the rejection as its outcome, and the profiler issues no retry.

### Tier 4 — integration

- **T4.1** (I1): a real `constructGraph` with `profile` absent → the graph is byte-identical to one built without the field, and no profiler object exists.
- **T4.2** (I7, I8, I24): a real session appending twenty entries and scrolling → `byEntry` names twenty ids, `byKind` names the kinds present, and both are work-only. **The `nothing-changed` zero is not asserted here**: D2 rules it deterministic only over a replayed input, so it is T5.4's and a live session cannot carry it.
- **T4.3** (I4): a stream at 1 000 lines/s → `wait` tracks C03's 33 ms window and `work` does not.
- **T4.4** (I12): the profiler view open → its own frames are excluded and `excluded.selfInflicted` is non-zero.
- **T4.5** (I28): a `handoff()` interval spanning two sampler ticks → the samples exist, carry the interval's mark, and report no CPU figure across it.

### Tier 5 — e2e

- **T5.1** (I14): a recorded PTY session that types, submits, streams, scrolls and resizes → replayed, the frames are **byte-identical** to the recording's.
- **T5.2** (I14): the same recording replayed twice → the two runs' frames are identical to each other.
- **T5.3** (A01 Appendix B): `make profile` against `dist/` through the public surface → the six budget figures and the three Appendix B rows, each with its regime.
- **T5.4** (I8): the T5.1 recording replayed → `misses["nothing-changed"]` is **0**. On a replayed input the count is deterministic, which is the only regime in which asserting it is honest (D2).

### Tier 6 — fail-on-revert

- **T6.1** (I4): summing `wait` into `work` → T1.3 and T4.3 fail. **The number most likely to be helpfully collapsed by someone tidying a table**, which is why it has a row rather than a paragraph.
- **T6.2** (I3): recording a span with `performance.measure` → T1.2 fails on the entry count, not on the duration.
- **T6.3** (I6): counting a fallback frame in the durations → T1.6 fails.
- **T6.4** (I7): reporting inclusive cost at a container → T1.7 fails.
- **T6.5** (I11): zeroing `spans` at `counters` instead of omitting it → T1.5 fails.
- **T6.6** (I1): constructing the ring at `off` → T1.1 and T4.1 fail.
- **T6.7** (I18): merging the ring across a `setTier` → T1.12 fails.
- **T6.8** (I15): reporting a truncated recording as a divergence → T3.6 fails, and the failure names the false-positive it would have caused.
- **T6.9** (I24): folding `wait` into `byEntry` → T1.17 and T4.2 fail. The same hazard as T6.1 one level down: an attribution table with a latency column in it reads as more complete, not less true.
- **T6.10** (I27): drawing a suspended sample as 0 rather than as a gap → T3.10 fails. A zero in a utilisation series is a reading, and this one is an absence.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| The terminal's own processing time | deferred. Nothing in `src/terminal/` queries the terminal (design M10), so it needs a new `escapes.ts` export and a reply the decoder does not swallow. Grep `escapes.ts` for a report export |
| Chrome Trace Event export | deferred on the span set stopping moving, and the condition is a **log rather than a grep**: `git log -p -- src/shell/profiling/types.ts` shows no change to `SpanName` across C7–C9. A grep asking whether a member was *added* is an absence check, and an absence check reads as satisfied hardest on the day it stops being true |
| Cross-session persistence, and a `calendar` pane with it | the ring is bounded and in-memory; `make profile`'s NDJSON is the durable form. Grep `ProfileReport` for a `sessions` member |
| Flame graphs of the far side's work | needs a far-side profiling protocol; B1–B8 carry none |
| Instrumenting inside an L1 or L2 unit | §1's blind spot. Decoration first; if it proves too coarse that is a measurement rather than a guess |
| What is drawn | C09, C11, C12. C28 produces the report; the panes are a composition over it (C22) |
