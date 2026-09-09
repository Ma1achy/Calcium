# C28 — Profiler

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` · report types also at `@fmx/calcium/profiling`, whose `exports` target is `./dist/shell/profiling/index.js` and not `./dist/profiling/` — the subpath is flat and the source is not, which is R14's one visible consequence. `./testing` and `./fixtures` are the precedent |
| **Layer** | L4 shell — `src/shell/profiling/` |
| **Depends on** | nothing new. Node builtins in one file (`node.ts`), gated by SS58 |
| **Consumed by** | C22 (the composition root injects it), C24 (`TuiConfig.profile`, `ChromeContext.lastFrame`), `tools/profile.mjs` |
| **Source** | `docs/notes/CALCIUM_PROFILER_DESIGN.md` · A02 §7 · A01 Appendix B · F395, F853, F862–F864 |
| **Status** | **Built** — `src/shell/profiling/`, 15 files, 4270 lines, landed in `b62b64df` *The profiler's backend — a real per-element tree, and five caches that say why they missed* (2026-09-07), with its `COMPONENT_SOURCES` row since `716f7905` the same day. 48 invariants, all 48 cited: 204 citations across sixteen test files and six more in the tier-5 fixture. This line read *Spec'd 2026-09-06, unbuilt* for the two days after the code landed, until F948 went looking — F891's class, third instance. |

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

**Filled as of `make profile`, and the partition above turned out to be the right one read the
wrong way round.** Four rows come back measured — the three that could never be taken from outside,
plus streaming CPU, which the sampler answers as a rate over its own samples. The two that stay
refused are the other two of the three named above as reachable from outside: resize corruption
needs a written frame compared against the terminal after a resize, and the Page Down needs a
scenario. So the split is not *inside versus outside* but **a counter versus an observation** — a
report can answer anything it already holds and nothing that requires someone to do a particular
thing and look. Those two are a PTY row's work, not a field's (I37).

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

/**
 * **`body`, `prompt`, `composite` and `based` are `assemble`'s parts**, added
 * because `assemble` was 58 % of a frame's work and had no breakdown: 358.2 ms
 * of self time over 34 frames, against `react`'s 151.9 ms, in the run that was
 * supposed to rank what to fix. A span that large with nothing under it is a
 * measurement that names the file and not the work, and the ranking it feeds is
 * a list with a hole where its first entry should be.
 *
 * **`transcript` and `visible` are `body`'s**, and the second round of the same
 * question: splitting `assemble` moved 48 % of the frame into `body` and left
 * it there. `visible` is C14 selecting and C09 rendering the transcript's rows;
 * `transcript` is what remains, which is `exact()` — a styled-width fit per row
 * per frame, 1700 of them in the fixture.
 *
 * `assemble` stays the bracket and keeps its name for the reason `paint.ts`
 * gives — the region calls run inside it either way, so naming it for the
 * narrower half would put the wider cost under a name that denies it. What
 * changes is that its self time is now the remainder rather than the whole.
 */
export type SpanName =
  | "frame" | "compose" | "measure" | "elements" | "paint" | "react" | "assemble" | "write"
  | "body" | "prompt" | "composite" | "based" | "transcript" | "visible"
  | "decode" | "route" | "handler" | "local" | "transport" | "adapt" | "stream" | "livefetch"
  | "completion" | "overlays" | "chrome";

/**
 * What each phase is *doing*, in the terms the question gets asked in: was the
 * frame computing something, or actually drawing it?
 *
 * A span name says where in the code the time went; this says what kind of work
 * it was, which is what decides the remedy. `compute` answers to caching and to
 * doing less per frame, `draw` to a smaller diff, `output` to writing fewer
 * bytes, and `far side` to nothing this framework can change.
 */
export type PhaseGroup = "compute" | "draw" | "output" | "input" | "far side" | "total";
export const PHASE_GROUP: Readonly<Record<SpanName, PhaseGroup>>;

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
  /** Keyed by `string`, not `SpanName`: a component names its own phases
   *  (`plot.area`, `code.tokenise`) and those are not members (I30). */
  spans: Readonly<Partial<Record<string, number>>>;
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
  spans?: Readonly<Partial<Record<string, Histogram>>>;
  latency?: Readonly<Record<string, Readonly<{ work: Histogram; wait: Histogram; total: Histogram }>>>;
  worst: readonly FrameRecord[];
  counters: Readonly<Record<string, number>>;
  misses: Readonly<Record<MissReason, number>>;
  byKind: Readonly<Record<string, Histogram>>;
  /** Keyed by the pair, never by the block id alone (I42). */
  nodes: readonly Readonly<{ key: string; entry?: string; calls: number; self: number; frames: number }>[];
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
  /** `string`, because a component's own phase is not a `SpanName` (I30). */
  span(name: string): Disposable;
  /** A span that survives an `await` (I33). The async seams' bracket (I36). */
  trace<T>(name: SpanName, fn: () => Promise<T>): Promise<T>;
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
| `spans` | the above, plus `work`/`wait` per frame, the span set, the N worst frames whole, and periodic `ResourceSample`s | **0.96 µs per element span**, measured — see below | nothing (F867) |
| `alloc` | the above, plus V8 sampling allocation attributed to stacks | light enough for a live session: **78 KB** and **36 ms** for a whole start→stop cycle (design M22) | nothing |
| `deep` | the above, plus CPU profiles and heap snapshots written to `.calcium/profile/` (C22 I67) | large, and the recorded figure is a **floor** — see §3b | nothing |

A tier is raised by `TuiConfig.profile` at construction, or by opening the view — which raises it to
`spans` when it is below and lowers it again on close, so a pane never draws an empty plot that reads
as *measured, and zero* (§3c, I50). **There is no third raiser.** This sentence used to name
`/profile` and *the view* as two mechanisms; `/profile [pane]` is how the view opens (C23 §2), and
no document specified a verb that set a tier by itself (F946). A session built with no `profile`
holds no recorder at all (T4.1), and `/profile` there is refused through the local route rather than
raising anything (C23 I68).

### 3b. What a capture costs, and why the recorded figure was the floor

This table read *a heap snapshot is 5.4 MB and 314 ms on a near-empty process (design M21)*. It
reproduces — 5.32 MB and 138 ms, measured in the container on Node v22.23.2, 2026-09-07 — and a
near-empty process is not the case a capture is taken in.

| capture | duration | bytes |
|---|---|---|
| CPU profile, 100 µs sampling, 250 ms window | 341 ms | 8.7 KB |
| allocation sampling, 300 ms, **nothing allocating** | 330 ms | **153 bytes** |
| allocation sampling, 300 ms, 20 000 objects per tick | 330 ms | 43.6 KB |
| heap snapshot, near-empty process | 138 ms | 5.32 MB |
| heap snapshot, **200 000 objects held** | **2 621 ms** | **60.56 MB** |

**The last row is the argument for I17's cap**: a session holding a transcript pays 11× the bytes
and 19× the pause of the recorded figure, and 2.6 s is a visible stall in a terminal that is meant
to be running. The default cap is 8 MB — it keeps a floor-sized snapshot whole and truncates the
case the capture is taken for, which is the right way round: a truncated 60 MB snapshot still says
*the heap is large* on its first line.

**The second row is a different hazard and it is in the file rather than the tier.** A valid
allocation profile over an idle window is 153 bytes with no children, which is indistinguishable
from a capture where sampling never started. Both figures are in `node.ts` beside the interval, so
a reader holding a small `.heapprofile` can tell which they have.

**The output formats are V8's own**, so a capture opens in Chrome DevTools and speedscope with
nothing written to render it: `Profiler.stop` returns exactly the `.cpuprofile` shape. The
extension is part of that — the same bytes named `.json` are refused by both tools — which is why
`EXTENSIONS` is a table in the recorder and a mutation over it is one of C28's rows.

---

### 3a. What a span costs, measured rather than derived

This row read *two `elapsed()` reads per span — 50.8 ns each, so ten spans is about 1 µs a frame
(design M15)*. The clock figure is right and the inference from it is not, in both of its terms.

**A span is not two clock reads.** It is a node object and its child list, a handle, a `kind#id` key,
a parent link, a histogram update and an aggregate update. Measured on 50 rules in two groups —
203 element spans per pass — at `tier: "spans"` with a frame per pass:

| | µs per pass | per element span |
|---|---|---|
| raw `measureSequence` | ~20 | — |
| `off` / `counters` | ~20 | nil, inside the baseline's own noise |
| `spans` | ~215 | **0.96 µs** |

**And a frame is not ten spans.** The element tree opens one per block per measure call, and the
registry measures a block about four times per sequence pass, so a fifty-block document is ~200
spans and not ten. The 1 µs estimate was out by 200× in the count and 10× in the unit.

**0.96 µs is two figures and both belong here**, because either alone misleads: it is **1.2 % of a
16 ms frame** at 200 elements, which is why the tier is usable, and it is **more than the `measure`
call it brackets** for every kind in the registry — measure is 0.16–8 µs end to end (F866) — which
is why the tier is not free and why `off` had to be made genuinely free (F867, F868).

The two defects behind the difference between 0.96 µs and the 1.85 µs this first measured are in
the findings: a `using` declaration in a hot wrapper is paid on the path that returns before
reaching it, and a computed `[Symbol.dispose]` key in an object literal costs 17× a class instance.

**Churn and retention are different instruments.** `alloc` says what was *allocated, and where*;
`deep`'s snapshot says what is *retained, now*. `CALCIUM_ROADMAP.md`'s parked question — per-frame
allocation and the GC cost of intermediate arrays — is a churn question, so `alloc` answers it and
the snapshot does not.

### 3c. The view — `/profile [pane]`

**One layer, `kind: "view"`, `placement: fill`, `dismissable: true`, id `profile-view`**, raised by
C23's `/profile` local verb (C23 §2) and owned by `src/shell/profile-view.ts`, which follows
`document-view.ts`: it checks C15's stack before pushing (C15 I1's refusal is a throw, reached from a
handler with nowhere to report it), updates its one layer in place (C15 I14), and answers a refusal
as a string the verb turns into a notice.

**Its content is `profilePane(report, pane, caps)` with the terminal's capabilities, whole** (C09 I49,
F828): `·` is `East_Asian_Width=Ambiguous`, so the ASCII default `profilePane` carries for a caller
with no terminal is the one arm a real terminal must never get. The pane is drawn from
`profiler.report()`, which is a pull — nothing tells the view a report changed, which is why the
cadence below is a timer and not an event.

**A window on block boundaries, measured through the registry.** A pane is not a screen's worth by
construction — `frame` puts a table of up to twenty elements under a plot, and the overview as first
built was 40 rows at twelve frames against the 24-row region the test harness has (the figure below)
— and C15 clips what does not fit without drawing anything to say so (C15 I8; F947). The view holds
an offset in blocks, takes blocks from it while the registry's
`measureSequence` of the candidate sequence fits the region, and always shows at least one; a single
block taller than the region is shown under a notice saying how many rows are hidden. The same
`measureSequence` C15 places with, for `document-view.ts`'s reason: a window measured by anything else
is C09 I1's divergence with a whole view behind it. The projection is `document-view.ts`'s, written a
second time, and that duplication is recorded here rather than resolved: extracting it is an edit to
a file this round does not own.

**The overview fits the region it opens in** (I52; F947, F959, F960). The pane a reader opens first
is the one that has to fit without paging, and the number it has to fit is **23 rows at 80 columns:
a 24-row terminal, minus the view's one-row header**. Every other pane pages. **The figure F947
carried was the instrument's, not the pane's**: 26 rows at twelve frames and 28 with spans and a
counter were measured through a registry with no `plot` and no `table` registered, where both kinds
fall to `raw` and a plot measures as the wrapped lines of its own JSON. Through the registry
`construct.ts` builds, the same pane was **40 rows at twelve frames and 51 with spans, a counter and
two caches**, at 80 and at 120 columns alike, and the view's own rows windowed the JSON rather than
the plot (F959). The bar plot of commits against frames was also wrong in the direction no fixture
reached: its `height` grew by one per commit reason while a grouped bar draws two rows per reason,
so at the type's five reasons it drew six rows and put `stream` and `spinner` — the reasons
coalescing is about — behind a `+4 more` marker (F960).

**The walk, by hand, before the cut** — every block the overview draws, its rows at 80 columns on
four reports, and where each row went. Through `measureSequence` with `tableDefinition` and
`plotDefinition` registered; *E* is an empty ring, *T* twelve frames, *F* twelve frames with three
spans, a counter and two caches, *R* twenty frames spread over every `CommitReason` with the same.
Rows include the block's own `gapBefore`.

| block | before: E / T / F | after: E / T / F / R | where the rows went |
|---|---|---|---|
| the view's header rule | 2 / 2 / 2 | 1 / 1 / 1 / 1 | the gap before the first block drew a blank first row on every page; off |
| `ov-cap-regime` rule | 2 / 2 / 2 | — | the kv's own rows carry the qualifiers the caption named |
| `ov-regime` kv | 7 / 7 / 7 | 4 / 4 / 4 / 4 | `tier`, `frames`, `elapsed` are one `regime` row; `histogram`, `excluded`, `dropped` stay — T1.96 and T4.9 read `excluded` |
| `ov-no-frames` notice | 2 / — / — | 2 / — / — / — | unchanged |
| `ov-cap-lat` rule | — / 2 / 2 | — / 1 / 1 / 1 | gap off; the sentence shortened so it is not truncated at 80 |
| `ov-latency` plot | — / 10 / 10 | — / 7 / 7 / 7 | four categories in four area rows; the two spare rows drew nothing. Three rows of furniture stay: the lid, the axis rule and the x-labels |
| `ov-cap-coal` rule | — / 2 / 2 | — | the table's header row names the columns |
| `ov-coalesce` | — / 8 (plot) / 8 (plot) | — / 2 / 2 / 6 (table) | one row per reason, and *saved* — the difference the caption told the reader to take — as a column |
| `ov-cap-counters` + `ov-counters` | — / — / 2 + 3 | — | moved to `frame` as `fr-cap-counters` + `fr-counters`; no type bounds the row count |
| `ov-cap-oh` rule | 2 / 2 / 2 | — | the `own cost` label and *an estimate* in the value carry it |
| `ov-oh` kv | 5 / 5 / 5 | 2 / 2 / 2 / 2 | spans, clock and the estimate on one row; the async store on the other. Every I34 figure is still there |
| `ov-cap-cache` + `ov-cache` | — / — / 2 + 4 | — | moved to `frame` as `fr-cap-cache` + `fr-cache`; no type bounds the row count |
| `ov-elsewhere` notice | — | — / — / 1 / 1 | new: one row naming how many counters and caches are on `frame`, drawn only when there are any |
| **header and pane** | **20 / 40 / 51** | **9 / 17 / 18 / 22** | budget 24; the pane alone is 8 / 16 / 17 / 21 against 23 |

The same table at 120 columns differs only where a notice stops wrapping. **What the walk ruled and
the measurement then checked**: the *after* column was written from the block heights before the
code was, and T1.100 asserts the four totals rather than the bound alone, so the table cannot
outlive its measurement (F935).

**When it redraws** (I51). On the injected timer — `Ambient.schedule`, the seam the sampler already
uses (§4) — every `VIEW_REFRESH_MS = 1000` ms, which is the sampler's default cadence
(`ProfileOptions.sampleMs`) and the 1 Hz readout C23 I64 already runs, so the memory pane is never
more than one sample behind; and on a key. **Never per frame**: a view that redrew on every frame
would raise the frame that redraws it, and the loop would be the profiler measuring itself. A redraw
is `overlays.update` on the one id followed by a commit — `stream` from the timer, `input` from a key
— and every one of them runs inside `profiler.own(() => …)` (I49), so the frame it raises is
`selfInflicted` and excluded (I12) while the commit seam in `construct.ts` stays exactly as it was: it
passes `false` for what it knows and reads the bracket.

**The tier** (I50). Opening raises to `spans` only when the tier is below it, and remembers the tier
it found. Closing calls `setTier` only if opening did — a view opened at `alloc` or `deep` touches the
tier on neither side, and a view opened at `spans` does not call `setTier("spans")` on close and lean
on the recorder's *unchanged tier* short-circuit one component away (`recorder.ts`'s `setTier`).
Where it did raise, the raise resets the ring (I18) and the pane opens on the *no frame has been
recorded yet* notice rather than a zero plot (I23); the integer counters survive the reset — `resetRing`
clears the histograms, the rings and the trees and leaves `counters` — so the `frame` pane's counters
table shows the session so far and the overview names the count and points there (I52), beside a
latency notice that says nothing has been measured. The restore
resets again, so the spans watched are gone with the tier that recorded them.

**Closing reaches the owner through C15's change stream, whichever caller removed the layer**
(C15 I25). `Esc` is `viewPop`, which asks the owners in turn and calls this one's `pop()`; but C16's
ladder answers `⌃c` on a pushed view with `overlays.pop()` (`router.ts`'s `pushedView` rung, through
`construct.ts`'s `popLayer`) and never calls an owner. The view therefore subscribes at construction
and runs its teardown — timer disposed, tier restored, one redraw — from any `pop` or `dismiss` change
carrying its id, and `pop()` is `overlays.dismiss(id)` followed by that same teardown, once. Measured
before this was built: after the ladder's `pop()` the document view's `openFor` still names its
command over an empty stack (F944). For this owner that shape would be a tier raised for the rest of
the session and a timer firing every second into an `update` that returns `false`.

**At `stop()`** the view's `dispose()` stops the timer and leaves the tier where it is. The session's
order is `pipeline.dispose()`, drain, `onReport(report())`, `profiler.dispose()`, then release and the
graph's cleanup (`session.ts`), so by the time cleanup runs `setTier` is a no-op (§7) — and a caller
disposing the view against a live profiler would otherwise reset a ring nobody has read. The report
the session hands out describes the raised tier, because that is what was recorded.

**Keys, and none of them new.** The `pushedView` target's seven bindings are shared by every view
owner (C16 I24; `keys.ts`'s *one target, two owners*), and this is the third owner: `n`/`p` move by
the view's own unit — a hunk on a patch, a block on a document, and here a **pane**; `g`/`G` and the
four page keys move the window; `Esc` closes. A pane switch resets the offset and redraws with reason
`input`. Nothing is added to the keymap, so `/help keys` is unchanged and there is no binding it does
not show. The prompt takes no keys while a view is top, so `/profile frame` cannot be typed at an open
view and the pane keys are the only way to switch without closing.

**What `/profile` answers with** is C23 §2's: a muted notice naming the pane that opened, appended
under the view — never the panes themselves (C23 I69) — or a refusal when no profiler exists, a usage
line when the pane is not one of `PANES`, and `document-view.ts`'s *close what is open* when another
layer is up.

---

## 4. The seams

**Decorated, not instrumented.** Each of these is already a function or an interface the composition
root hands down, so the profiler wraps what C22 was going to pass anyway.

| seam | where | yields |
|---|---|---|
| the write | `FrameSchedulerOptions.write` | bytes per frame — A01 Appendix B row 1 |
| the frame | `composeFrame(deps)` (`shell/render-frame.ts:87`) | `compose`, `paint`, `assemble` |
| block measurement | A02 Seam 1 `measureChild` | `measure`, by kind, instance and entry |
| input | the decoder (`construct.ts:2447`) and `deliver` (`:2470`) | `decode`, `route`, `handler`, and `total` |
| transport | A02 Seam 2 `VerbTransport` | `transport` on `invoke`, `stream` on each `next()` |
| adaptation | `AdapterRegistry.adapt` and `adaptPatch` | `adapt` — synchronous, and `compute` rather than `far side` |
| completion | `CompletionEngine.request` | `completion`, concurrent with a route by construction |
| live parts | `LiveSpec.fetch` (C24 §5) | `livefetch`, and staleness |
| the local route | C23's local verb handler (`execution.ts:1023`) | `local` |
| the timer | `Ambient.schedule` | the sampler's cadence — no new timer primitive |

**Two of those are not reachable from the root, and they take an injected `trace` instead.** The
local registry is built inside `createExecutionPipeline` and a part's `fetch` arrives inside
`refresh.ts` at declaration time, so there is no object the composition root could have wrapped on
the way past. Each takes a `trace` function rather than a profiler, so neither file learns that a
recorder exists — the same narrowing `asProbe()` performs for the synchronous seams.

**`handler` and `local` are two different things and the plan for this round called both of them
`handler`.** The row above is the input path's: whichever handler `router.dispatch` resolves a key
to, which is why it groups with `decode` and `route` under `input`. C23's local verb route is
in-process work that produces a `ViewDocument`, so it is `compute`, and it is `local`.

**`adapt` was `far side` and that contradicted the group's own definition.** `PhaseGroup` says
`compute` is *geometry and view-model construction*, and `adapt(raw, ctx)` returns a `ViewDocument`
— it is this framework's CPU turning the far side's bytes into a document, and nothing about it is
the far side's. Grouped wrongly it put in-process compute under the one heading a reader uses to
decide that the cost is not theirs to fix (F881).

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

**SS58 has two arms and they have different scopes, which is the part a single rule would get
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

### 5a. The walk, indexed by rule interaction

**Both artefact shapes, because the component has both kinds.** A recording is a state machine — a
stream is open or it is not, a regime is known or it is not — and the taps are a structure that
holds at rest. C19's lesson is that taking the trace alone because the state machine is the obvious
thing leaves the structural half unexamined.

**The table** — each thing that crosses into a session, the tap that sees it, and whether a replay
can reproduce the frame without it:

| crosses in | tap | recorded | the interaction |
|---|---|---|---|
| stdin bytes | `config.stdin` | `input` | — |
| `SIGWINCH` + the size | `config.stdout` | `resize` | **the stdout tap is also the size's source** (I46) |
| far-side patches | `TransportRouter` | `far` | ordering against `resize` (below) |
| wall clock | `config.clock` | positional | the chrome draws a time of day |
| `elapsed` | `config.elapsed` | positional | **C24 I32 puts a duration in the footer** (I14) |
| capabilities | derived | *not* recorded | recording the verdict removes the detector from the gate (I47) |
| written frames | `config.stdout` | `frame` | the expected output, not an input (I14) |

**The trace** — sequences where two rules meet because something happened between them:

| # | sequence | ruling |
|---|---|---|
| 1 | a resize arrives while a stream is open | one sink, one order; per-tap logs cannot say which came first |
| 2 | a frame is written between two input chunks | `frame` events are filtered out of the drive stream and compared positionally |
| 3 | the process dies mid-write | the final line is torn; it is dropped and the recording is truncated (I15) |
| 4 | detection's queries precede the regime being known | `regime` carries construction-time facts only; the replies are ordinary `input` (I47) |
| 5 | a replay is compared against a truncated recording | prefix comparison, and the shortfall is truncation and not a divergence (I15, T6.8) |

**Row 4 is the one no one would write a test for.** Capability detection happens after the first
writes and before anything else is known, so the recording begins in a state where the regime is
half-formed — and the tempting repair is to write the `regime` line once detection settles, which
loses every byte before it.

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
- **I14** — **Replaying a recording produces frames byte-identical to the ones the recording was taken from**, and the comparison is over the `frame` events' subsequence: a `frame` is the recording's *expected output*, never one of the inputs replayed back in. **§5's *every clock and `elapsed` read* is load-bearing and was not when it was written.** In July the only clock reading that reached a frame was the wall-clock time of day; C24 I32 put `last 1.2ms` in the default footer, so a frame now contains a **duration**, and the obvious robust-looking implementation — pin the replayed clocks to the event stream, so a read between two events returns the earlier one's stamp — produces a footer reading `last <0.1ms` on every frame and a divergence on every recording taken from a real session. **Positional replay is what the spec ruled and it is the stronger reading**: read *n* returns the value read *n* returned, so a duration in a frame is reproduced rather than flattened. It is brittle against a code change that alters the read order, and that is correct — a recording is a within-build determinism gate and not an artefact meant to outlive its build (F908). **And positional replay requires every stand-in to consume the clock reads the tap it replaces makes**: C06 reads the wall clock twice per invocation — before it spawns and for `durationMs` — so a stand-in that serves the recorded value and reads nothing is served every later value two reads stale, and the header's second hand lands one frame behind whenever a wall-clock second boundary falls in the gap between two of the session's own reads (F963). Parity is asserted by count, not assumed from the frames (T5.1c).

  **Three things a replay must be handed and one it must not.** The regime carries `tier`, `name`, `binary` and `env`, and **every one of them decides what a frame contains** — the tier because C24 I32's cost cell is absent below `spans`, the other three because the chrome draws them. A replay that hard-codes any of them diverges on a frame that is correct on both sides; `binary` did so at byte 43 and `tier` at frame 1 (F912). The one it must not be handed is the capability verdict (I47).

  **The size a session starts at is `geometry`, not the first `resize`.** A resize is a signal a replay delivers; delivering one for the size the session already has is a resize the session never had, and C03 treats it as contamination — the frame the recording drew as three addressed rows came back as a full repaint, byte-different and correct on both sides. The positional alternative, *the first resize before the first frame is the initial one*, is a rule about where a line sits rather than what it says, which is the class F910 already punished.

  **A recording is flushed from `process.on("exit")`, and that is what makes the claim reachable at all.** C01's `signalExit` calls `process.exit` directly, so a session ended by a signal never passes through `stop()` where `end()` lives, and the batched clock reads go with it. A replay reading past the end of a truncated clock stream gets the last value repeated: durations stop moving, the chrome row carrying one has no delta, and **the frame is never composed** — an elision the mask cannot reach, because a mask covers bytes and not the decision to draw them. That failure reads as an impossibility result about self-measuring frames and is nine lines of recorder (F912).
- **I15** — **A recording that ends while a stream is open replays as truncated and is reported as truncated, never as settled and never as a divergence.** Truncation is detected by what the recorder could not write rather than by a field it did: a recording is truncated when it carries no `end` event, when its `end` reports streams still open, **or when its final line does not parse** — a process killed mid-write leaves a torn JSON object, which is dropped rather than raised. The mechanism is then a **prefix comparison**: the replayed frames are compared against the recorded ones up to the recorded count, and the surplus is reported as truncation. The natural implementation compares the two lengths and calls the difference a divergence, which indicts the framework for the recorder's death — the most expensive failure this design has available (T6.8). **A truncated recording has a second symptom and the prefix does not cover it**: past the end of its clock stream the replayed session's clock-derived cells hold still, so a frame whose only delta is one of them is never drawn and every later index is off by one. `elided` names that case — a recorded frame carrying a clock-derived cell against a replayed write that paints nothing — and both halves are required, because either alone is satisfied by an ordinary divergence (T1.86).
- **I16** — GC kinds are translated from V8's numeric constants at the boundary, totally over the four (`MINOR=1`, `MAJOR=4`, `INCREMENTAL=8`, `WEAKCB=16`), so a fifth kind is a compile error rather than a silently dropped bucket.
- **I17** — A capture still running when the session stops is **waited for, bounded, and then recorded as abandoned** rather than dropped: `drain(ms)` polls the in-flight set on the injected `schedule` and returns how many are still open, and `dispose()` writes each of those into `captures` with `abandoned: true` and `bytes: 0`. **A count and not a byte figure** — how much an abandoned capture would have written is unknowable, and a `droppedBytes` of `0` reads as *nothing was lost*, which is I13's shape. Unbounded waiting is a shell that will not exit on an exit key; not waiting loses a file `report()` has already named a path for. The bound rests on that asymmetry: too short costs a **marked** file, never a missing one. A `deep` capture is size-capped and reports the bytes it dropped; it is written under `.calcium/profile/`, which needs no `.gitignore` change because the directory is ignored twice over — the repository's own `.gitignore:11`, and C22 I67's rule that `stateDir` is created holding a `.gitignore` of `*` regardless of the consuming project's ignore rules.
- **I18** — `setTier` resets the ring, and the report names the reset point; histograms from two tiers never merge.
- **I19** — The user-timing entry count is read at most once per sampler interval and never per frame, and **nothing under `src/` writes that buffer** — `node.ts` included. SS59 is the second arm of SS58 and carries an empty allow list for exactly that reason: written as one rule with one list, the profiler would have been exempted from the leak it exists to find.
- **I20** — `mark` records an instant on the session timeline and never inside a `FrameRecord`.
- **I21** — `src/shell/profiling/node.ts` is the only file under `src/` naming `process.memoryUsage`, `process.cpuUsage`, `monitorEventLoopDelay`, `PerformanceObserver`, `node:inspector` or `node:v8`.
- **I22** — `dispose` is idempotent; after it every operation is a no-op except `capture`, which throws.
- **I23** — Opening the profiler view raises the tier and closing it restores the tier that was set before; a pane with no data draws a notice and never an empty plot, because an empty plot reads as *measured, and zero*.
- **I24** — `byEntry` and `byKind` are **work** histograms and are named as such; `wait` is a property of a frame and is never attributed to an entry or a kind.
- **I25** — The user-timing entry count is reported as a count with no attribution, and labelled so: the profiler raises no marks of its own, so it cannot say whose entries these are.
- **I26** — A span open across a resize records the width it opened at and is tagged as having crossed one; it is not silently attributed to the new width. The width is **told** rather than read — SS42 keeps the terminal's dimensions in `lifecycle.ts` and C01 I13 hands them down, so the root calls `profiler.resized(columns)` from the same `onResize` the recorder taps, and takes the initial one from `lifecycle.size()` because `onResize` fires on `SIGWINCH` and on nothing else. **The tag rather than a corrected width is the whole ruling**: width decides how much work a measure or a paint does, so a span filed under the width in force when it *closed* is a cost attributed to geometry that did not produce it — and it is silent, because the number is a plausible width and the duration is real.
- **I27** — A sample taken while the session is suspended carries `suspended: true`, and no consumer reads a suspended sample as an idle figure or draws it as a zero. **Three parts, and each is a separate commitment**: the sample carries the flag, a consumer refuses it, and *something sets it*. The third is the one that makes the other two mean anything, and it was absent while both others read as correct — `let suspended = false` with no assignment anywhere (F903).
- **I28** — No CPU figure is reported across a `handoff()` interval: `process.cpuUsage()` excludes the child, so an idle reading there is false rather than merely imprecise. **`Profiler.setSuspended` is the writer and C22 is the caller**, decorating `lifecycle` once at construction rather than at the handoff's call site — `suspend()` means the terminal belongs to somebody else whatever asked for it, and a second caller learning to suspend without learning to tell the profiler is how the flag came to have no writer at all. The flag is set **before** the terminal is released and cleared **after** it is reacquired, so no tick lands in an unlabelled window; a refused `suspend()` unwinds it, because a flag stranded by one refusal labels every later sample unreadable. Not gated on the tier: a tier raised mid-handoff would otherwise begin sampling a suspended session while reporting it as running.
- **I29** — A live part's `fetch` rejecting mid-poll closes its span with the rejection as its outcome; the profiler records the rejection and does not participate in the backoff C24 §5 owns.
- **I30** — **The instrumentation interface is declared at L0 and implemented only at L4.** `Probe` lives in `src/data/viewmodel/probe.ts` beside `Measure`, carries no clock and no implementation, and is the only thing a component below `src/shell/` ever names. No file under `src/terminal/`, `src/data/`, `src/presentation/`, `src/viewport/` or `src/interaction/` imports `src/shell/profiling/`, and MG1 is what makes that checkable rather than intended.
- **I31** — **An element's cost is measured per element, never divided out of a total.** Attribution comes from a span entered once per block through the registry seam. A figure obtained by apportioning a sequence's duration across the blocks in it is not an attribution: a `plot` measures 260× a `rule`, so an equal share reports how many blocks of each kind were on screen while reading as what they cost. `calls` is kept beside `frames` so a node recomputed *within* one frame is distinguishable from one measured once per frame.
- **I32** — **A span tree is built for every frame and retained only for the frames kept as worst.** The tree is the allocation the spans already made; retention is what is unbounded, and which frames are worst is not knowable until the session ends — so the decision is made at report time and the record for an ordinary frame carries no `tree` member at all rather than an empty one.
- **I33** — **A span survives an `await`, and the store that makes that true is constructed lazily.** Closing is per node against its own parent, so an out-of-order close is correct rather than discarded — the previous shape held one pointer and dropped any close that did not match it, which is precisely what interleaving produces, so every async span it could have recorded reported nothing and reported it silently. The `AsyncLocalStorage` is built on the first transition to a tier that records durations and never at import: measured on Node v22.23.2, an `await` costs 38 ns with none constructed and **59 ns with one constructed and never used**, so an eager store taxes every promise in every application by about 55 % to profile one of them.
- **I34** — **The report prices the instrument.** `overhead` carries the spans opened, this machine's measured `elapsed()` cost, the product as an estimate labelled one, and whether the async store is built. An instrument that does not report its own cost invites a reader to assume zero, and an instrument reporting its own cost *as its subject's* is the failure class this component exists to end.
- **I35** — **The exported document carries what its shape cannot.** Three things, each of which a well-formed document is happy to omit. A trace event's `ts` is the span's own `startedAt` and never a position computed from its siblings: children do not tile their parent — the gaps are the parent's self time — so a synthesised timeline is well-formed, plausible, and not what happened, and no viewer can tell. The document names `framesInSession` beside `framesWithTrees`, because I32's retention read off the output is a count of the worst frames read as the session's. And neither format carries a sum of `work` and `wait` (I4), because two columns that add up look like a column that is missing.
- **I36** — **Every seam that crosses a promise is bracketed, and the bracket is decoration at a seam the root already hands down.** `transport` and `stream` on `VerbTransport`, `adapt` on `AdapterRegistry`, `completion` on `CompletionEngine.request`, `livefetch` on `LiveSpec.fetch`, `local` on C23's local verb handler. **`stream` is around each `next()` and not around the loop**, so what it measures is the far side's latency and not the shell's own work between patches — a stream slow because the far side is slow and one slow because we are, produce the same total and are different findings. Every bracket forks its context (I33), so N live fetches and a completion racing a route attribute to N parents instead of trampling one.
- **I37** — **A01 Appendix B is filled by measurement or left empty and labelled, never estimated.** The appendix is a six-row decision gate whose own instruction is *fill this from real numbers; do not estimate*, and it has been empty since it was written. `checkBudget` answers four of its rows from a `ProfileReport` — bytes written per frame, the median and p95 of frame construction, and streaming CPU from the sampler's own samples — and **reports the other two as unanswerable rather than as zero**: resize corruption is C03's contamination and reaches no counter, and a Page Down's latency needs a scenario, since a report cannot tell one `input` commit from another. A gate table with a plausible zero in it closes an experiment nobody ran, which is the failure the instruction was written against. **The verdict inherits that and is the sharper case**: the appendix says *none crossed means M-T6 is closed*, and a `closed` computed over four measured rows and two silent ones is that same zero at the level a reader actually acts on. So there is a third verdict — `undecided` — and it is what an unanswerable row produces. Runner-free and paired with a `format`, like every sibling in `src/testing/`, and its input is a report — a consumer cannot construct a `Profiler` and must not need one to read their own budget.
- **I38** — **The report leaves the process, and it is taken before the instrument is torn down.** `report()` reaches exactly one caller — `PipelineDeps.profile`, and therefore an in-app verb — so a session that records everything can be read by nothing outside itself: `make profile`, a consumer's CI and a bug report all have the same problem. `ProfileOptions.onReport` is the seam, called once from `stop()` for a recording session. **Before `dispose()`, and the reason is asymmetry rather than a mechanism** (F883). This clause first said that taking the report after disposal empties `heapSpaces`, because `report()` reads `probe.spaces()`; swapping the two lines fails nothing, and the count is **11 spaces before and 11 after, measured 2026-09-07** — `node.ts`'s own comment says the read has no dependency on a live probe. What keeps the order is that it costs nothing, and the alternative rests on a disposed member still answering — which one file documents and `capture()`, the component's other disposed member, refuses by throwing. A callback that never fires means nothing was recorded, never that the report was empty.
- **I39** — **Every `SpanName` is opened somewhere, or it is removed.** `PHASE_GROUP` is total over the union by construction, so a member nobody opens is still given a phase, still appears in a compute-versus-draw breakdown, and still reads as *this phase cost nothing*. **Seven of nineteen were in that state when this was written, measured 2026-09-07** — `chrome`, `overlays`, `paint`, `assemble`, `decode`, `route`, `handler` — which left `draw` with one opener of three and `input` with one of four, and it was the same fact as `make profile` reporting **14.6 % of `frame` attributed to no phase at all**: the two are one gap seen from either end. **All seven were wired within the day and this paragraph was not**, so it read as a present state for three days while T1.61 asserted four of the seven fire and T1.60 asserted by equality that none is unopened — a measurement in a spec is a claim about a date, and this one says its date while reading as a description (F935). Re-measured 2026-09-08: **none of twenty-three is unopened**, and `make profile` attributes **3.3 %** of work to no phase — the component sub-spans `patch.lines` and `patch.layout`, which `PHASE_GROUP` is not meant to map. Removal is a real disposition and not a formality — a union member with no call site is a declaration nothing can violate, so inventing a seam to satisfy the rule is the vacuity arriving through the door the rule opened. Enforced by a scan rather than a test, because a row naming the members is satisfied by the list it names (A03, MG30).
- **I40** — **`spans` is self time; `latency.work` is the whole; a breakdown that divides one by the other is wrong in a way that reads as a measurement.** `record` feeds each histogram the span's *self* duration, so `spans.frame` is the shell's own per-frame work **outside every other span** and not what a frame cost. The two are an order of magnitude apart and both are plausible: **3.71 ms against 40.29 ms over three frames, measured 2026-09-07**. So a phase table's denominator is `latency.work`, its parts are the non-`frame` spans, `spans.frame` is a row of its own — the frame's work no span brackets — and what is left after both is a residue printed rather than absorbed. `make profile`'s first version divided by `spans.frame` and reported `react` at 96 % of a frame it is 72 % of (F885). Nothing in the shape says which quantity a field holds, which is why it is said here.
- **I41** — **A span is opened inside a frame or outside one, and the two are different populations.** `SPAN_SITE` records which, beside `PHASE_GROUP` and not inside it: `PHASE_GROUP` says what *kind* of work a span is and this says *when* it happens, and a table needs both because its denominator depends on the second. Fifteen names are opened inside a frame — `compose`, `measure`, `elements`, `chrome`, `overlays`, `paint`, `react`, `assemble`, `body`, `prompt`, `composite`, `based`, `transcript`, `visible`, `write` — and the rest are not; `frame` is the bracket rather than a member of either. I40's rule is therefore narrower than it reads: `latency.work` is the whole **of the in-frame spans only**, and a breakdown that divides a session span by it is measuring one population against another's total. Measured 2026-09-07 over 200 transcript entries: 755.9 ms of out-of-frame spans (`local` 643.4, `handler` 97.0, `route` 8.1, `decode` 7.4) added to 2515.7 ms of in-frame spans and divided by 2946.3 ms of work, printing a residue of **-460.5 ms**. **It was 1.1 % of the reading at one transcript entry and 25.7 % at two hundred**, so nothing about the first fixture could have shown it (F888). **Declared and not derived, with a scan that can falsify it**: the honest measurement is the frames' own trees — `frameRoot` is nulled at frame end, so a span opened between frames roots itself and cannot appear in one — and that measurement sees only the names a run happens to open, which for a fixture with no far side is 19 of 25. So the table is the claim and the tree walk is what stops it being satisfied by itself, the same pairing as I39 and MG30.
- **I42** — **An element's cost is attributed to the entry it was measured for, and the aggregate is keyed by the pair.** C04 I14 makes block ids unique *within a document* and a transcript entry is a document, so `kind#id` alone is not an identity: two entries holding a block with the same id are one row, and the row's `calls / frames` — the figure I31 keeps `calls` beside `frames` to produce — is the sum of their numerators over one denominator. Measured 2026-09-07, the same scripted session over four entries with only the ids differing: **12 rows become 4**, `calls` 27 + 21 + 15 becomes 63 against the same 12 `frames`, and the ratio the formatter labels *measured more than once per frame* goes 2.3 to **5.3** — a recomputation named at a node where there is none (F892). Attribution comes from a scope, `Probe.entry(id)`, opened by the shell around the work it does for one entry; **an element measured outside every such scope carries no entry**, appears in `nodes` and `byKind`, appears in no `byEntry` row, and the shortfall is printed rather than absorbed, because chrome and the prompt are real cost and a `byEntry` that quietly omits them reads as *the chrome is free*. `byEntry` is therefore a projection of `nodes` and not a second accumulator, which is what makes summing it against `byKind` a comparison of one population with itself. **The scope is at L4 and the measure path is reached by C14 I29's third argument.** Every colliding span in the first measurement opened under `paint > assemble`, inside `visibleRows`, whose loop already holds `entry.id`; not one opened under C14's height loop, and *that reading was a property of the fixture rather than of the code*. With the scope in place, four rows came back carrying no entry at 3 calls over 3 frames, and the stack says `ViewportImpl.measureSequence` — C14's `#heightOf` on a **cache miss**, which the first run never took because the cache was warm throughout. So the general claim was false and the repair it justified was incomplete: an entry's cost would have been short by whatever the height cache missed, systematically and with nothing to show it, and on a resize that is every entry. C14 I29 carries the id to the shell's own wrapper; C14 reads it no more than it reads the entry it already hands `chromeRows`.
- **I43** — **A leak figure is a lower bound on collection and an upper bound on what is live, and it says so.** `Probe.track(name, held)` registers an object under a class name; `leaks[name]` reports `created`, `finalised` and `live = created − finalised`. **`finalised` is not a count of what died** — a `FinalizationRegistry` callback is a promise the runtime may keep late or not at all, so an object collected between the last sweep and the report is live in the figure and gone in the heap. The bound is what makes it useful anyway: a class whose `live` grows without limit across a session is leaking whatever the callback's timing, and that is the reading the counter exists to give. **Measured, and the measurement changes what a row may assert**: exactly one registration never reports, always the most recent one, at N = 1, 2, 10, 100, 1 000 and 5 000 and over eight repeats; further collections do not shrink it; and the survivor is one object in the **whole report** rather than one per class — three names through one registry at 50 each gave 50 · 50 · **49**. So `live` has a floor of one that no correct code removes, the report carries that floor rather than leaving a reader to chase it, and a row asserts `N − 1` **with the reason written beside it**, because an unexplained off-by-one is what the next reader fixes (F893). The design note's M20 said 1 000 of 1 000 after two collections and named itself this row's falsifier; it is 999 after one (F838's shape). **Nothing is registered at `off`** — the registry is built on the first `track` above it, so a session that does not profile constructs none (I1).
- **I44** — **A count is available wherever counting is on, and `frames` is a count.** `counters` is named for the figures that cost one integer, so every one of them is recorded there and only durations wait for `spans`. `ProfileReport.frames` is the number of frames the session drew at every recording tier, not the number whose durations were kept — a member meaning different things by tier is a member a consumer divides by. Measured: twelve frames at `counters` with 48 000 bytes counted published `frames: 0`, because the increment sat below the `spanning()` guard while `beginFrame` two functions above had already written `counters["frame.input"]` for the same frame; `checkBudget`'s bytes-per-frame row then refused with *no frame was committed in this session*, which was false about the session and was the only thing the reader was told (F894). **T1.26's rule is the neighbouring one and does not cover this**: it requires a row unanswerable at `counters` to *name the tier*, and this row was unanswerable for a different reason. The repair is to count rather than to refuse better — bytes per frame is the most useful figure a lightweight production tier can give, and refusing it was never necessary. F869's shape a second time.
- **I45** — **Every block kind gauges an input it walks in full, taken on the unclamped side of the clamp.** A block's data is the one input into a frame the shell does not choose, and it is invisible in every other figure: `measure` returns rows, rows are clamped to the viewport, and a `rule` with a two-megabyte label measures 1 at every width. So each of C09's default kinds records at least one `gauge` naming the size of what its render walks **before** the truncation, wrap or floor — `rule.label` and `progress.label` on the string `stripControl` walks whole, `notice.rows` and `tip.rows` on the wrapped rows, `status.rows` on the floored height, `image.bytes` on the payload the decode and the kitty transmission both consume. **Where two inputs grow independently the kind gets two**, because one figure cannot separate them: a one-row notice with two hundred spans and a two-hundred-row notice with none are the same number under either gauge alone, and a two-kilobyte PNG and a two-megabyte one fill the same `cols × rows`. **A gauge rather than a span, and that is a cost ruling rather than a taste**: a `rule` measures in 220 ns against a span's 74, so bracketing the cheap kinds would report the instrument at 34 % of its subject — the failure the whole component exists to end (§7). **Measured 2026-09-07: 19 default kinds, and the last one uncovered was `image` — which has a gauge.** `decode.entries` counts what the decoder's cache holds, so it is unmoved by a file that grew, and a coverage check keyed on the file, or on a gauge name's prefix, calls the kind covered (F906). The check that can falsify this compares `DEFAULT_DEFINITIONS`' `kind` values against the gauge names' first segments, which is why the row is written that way rather than as a list. **What it does not give**: a gauge is a histogram over observations and not a per-frame series, so it says what sizes a session saw and not which frame held the large one — `nodes` is where a cost is joined to a block, and this is where a block's cost is joined to its cause.
- **I46** — **One totally ordered stream over four taps, and the taps compose rather than reimplement.** Input bytes, resizes, far-side patches and written frames go to a single NDJSON sink in the order they happened, because the frame a resize produces depends on which patches preceded it and a per-tap log cannot say. Each tap is a decorator over a seam the configuration already injects — `stdin`, `stdout`, `TransportRouter`, and the clocks — so **recording adds no seam to the shell**, which is C08's technique for the one of the four it already does (`src/data/fixtures/record.ts`: *recording cannot drift from replay: there is no second implementation of what a run looks like*). **The `stdout` tap has two roles and that is the cell to watch**: it records what was written *and* answers `columns`/`rows`, which `SIGWINCH` reads. A replay that takes its size from the real terminal reproduces every byte except the ones the width decides, so the divergence is real, is about geometry, and reads as a wrapping defect.
- **I47** — **A replay re-derives the capabilities; the verdict is never recorded.** Detection writes query escapes and reads the replies, so the replies are already `input` events and the detector runs again on the same bytes. Recording the *verdict* instead is the obvious saving and it removes the detector from the gate: the replayed session would skip the queries it made, so its written bytes would differ at the start and agree afterwards, and a broken detector would replay byte-identically because both runs trusted the same recorded answer. What the recording carries about the regime is only what is true at construction — the `regime` line's six keys, `t`, `node`, `tier`, `name`, `binary` and `env`, with the initial size travelling as the `geometry` line of its own that `dc79ab21` gave it — which is the input detection takes rather than the answer it gives. (The list read *node, initial `columns` and `rows`, and the environment* until F950 measured it against the line; the size was never on the regime line, and `tier`, `name` and `binary` joined for F912's reason that the chrome draws them.)
- **I48** — **A recording ends from `process.on("exit")`, not only from `stop()`.** A signal exit does not pass through `Session.#runStop`: C01's `signalExit` releases the terminal and calls `process.exit` directly, so a recording that ended only there loses the clock reads still in its batch and writes no `end` line — and a reader cannot tell that from a recording whose process was killed mid-write, which is the truncation signal `end` exists to give. Measured: a session ended with SIGTERM wrote no `end`, parsed as truncated, and the replay's clock ran out five frames in (F912). Two clauses keep it honest. `end()` is **idempotent**, so the ordinary path still ends where it always did and the hook is a floor rather than a second exit. And **the listener exists only when a recording does** — an `exit` hook installed unconditionally is a handler every app that never profiles would carry, which is C22 I92's *off is free* in the one place a profiler can reach a process that never asked for it.
- **I49** — **Every commit the view raises runs inside `profiler.own`, and the commit seam reads the bracket rather than the call site.** The view brackets `overlays.update` and the commit together, on the timer and on a key alike, so a frame raised only by the view is `selfInflicted` and excluded (I12) and a frame the reader or the far side also raised is not. The seam in `construct.ts` passes `false` for what it knows and knows nothing of a view; removing the bracket leaves every figure the view draws inflated by the cost of drawing it, which is the reading I12 exists to end.
- **I50** — **Opening the view raises the tier to `spans` only when it is below, remembers the tier it found, and closing calls `setTier` only when opening did — from C15's change stream, so the restore reaches the owner whether `Esc`, the ⌃c ladder's `pop()` or the owner's own `pop()` removed the layer.** A second `open` while open is refused and does not overwrite the remembered tier. `dispose()` at `stop()` stops the timer and leaves the tier: the profiler is disposed before the graph's cleanup runs, so `setTier` is then a no-op (§7), and against a live one a restore would reset a ring nobody has read (I18, I38). With no profiler configured there is nothing to raise and the verb is refused (C23 I68).
- **I51** — **The view redraws on the injected timer and on a key, never per frame, and what it draws is a block-boundary window of `profilePane(report, pane, caps)` measured through the registry with the terminal's capabilities.** One layer id, updated in place; a redraw after the layer has left the stack changes nothing, because `update` on an unknown id is `false` and raises no commit (C15 I14). A pane taller than the region pages rather than being cut in silence, and a single block taller than the region is shown under a notice that says how many rows are hidden (C15 I8).
- **I52** — **The overview measures at most 23 rows at 80 columns for every report — a 24-row terminal minus the view's one-row header — through the registry that draws it, and meets the number by density and by moving, never by dropping a figure.** The pane a reader opens first is the one that must fit without paging; I51 pages the rest. Its blocks are bounded by closed sets — four regime rows, four latency categories in four area rows, one coalescing row per `CommitReason`, two rows of the instrument's own cost — and the two blocks no type bounds, the counters table and the cache table, are drawn on `frame`, whose subject they are and which pages already, with one overview row naming how many of each are there. Every figure the overview carried is on the overview or on `frame`. **The bound is the budget, and the measurement is beside it**: the largest report the type allows — every commit reason, spans, counters, caches — measures 21 pane rows, 22 with the header (§3c's table), so a block that grows past the budget fails T1.100 before it reaches a screen. Measured through a registry with `tableDefinition` and `plotDefinition` registered, because the harness's default has neither and measures a plot as its JSON, which is how a 40-row pane was recorded as 26 (F947, F959, F960).

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
17. **The output is a format that already has readers.** Chrome's Trace Event JSON opens in Perfetto and speedscope, so a flame chart, a sandwich view and a left-heavy view arrive with no renderer written; NDJSON is the appendable form a four-hour session needs and a single JSON document cannot be. What the export owes is the context the format has no field for. (I35)
18. **The far side is measured apart from the work it causes.** A promise the shell waits on and the CPU it spends on the answer are different columns, and the seam that produces each is decorated rather than instrumented. (I36)
19. **The report leaves the process.** One callback, called from `stop()` before the instrument is disposed, because a profiler nothing outside the process can read is a profiler with no output. (I38)
20. **A declared span is opened or deleted.** No member of `SpanName` is left with no call site, because `PHASE_GROUP` gives it a phase regardless and an unopened member reads as a measured zero. (I39)
21. **A part is self time and the whole is the frame's work.** A breakdown divides by `latency.work`, never by `spans.frame`, and prints what neither accounts for. (I40)
22. **The budget table is measured or it is blank.** A01 Appendix B's rows are answered from a report or reported as unanswerable with what they would need; none of them is estimated, none defaults to zero, and a table with an unanswered row returns no verdict rather than a passing one. (I37)
23. **A span says when it happens, not only what kind of work it is.** `SPAN_SITE` partitions `SpanName` into the spans opened inside a frame and those opened outside one, so a share of `latency.work` is taken over the first population alone. (I41)
26. **The cheap tier records everything cheap.** A count costs one integer, so `counters` records every count there is — frames included — and a consumer never divides by a member that means one thing at one tier and another at the next. (I44)
25. **A leak figure names its own uncertainty.** `finalised` is what the runtime got round to reporting and `live` is an upper bound with a floor of one, both stated rather than left for a reader to discover as an off-by-one. What the counter can say is the shape over a session, and that is enough to find a leak. (I43)
28. **A recording is inputs; a frame is the answer.** One ordered stream over the seams the configuration already injects, with the verdicts a session computes — its capabilities, its frames — re-derived rather than replayed, so the gate covers the code that computes them. A truncated recording compares as a prefix and says so. (I14, I15, I46, I47)
29. **A recording survives the way sessions actually end.** The clock batch is flushed and the `end` line written from an `exit` hook, because a signal exit never reaches `stop()` — and the hook exists only when a recording does (I48).
27. **A component's own data is a measured input.** Every block kind gauges what its render walks in full, before the clamp that makes the drawn size a constant — so a frame slowed by one enormous block has a figure that names it, and the cheap kinds get a gauge rather than a span because a span on a `rule` is a third of what it measures. (I45)
24. **An element belongs to the entry it was drawn for.** A block id is unique within its document and a transcript holds many, so the aggregate is keyed by the pair or two components become one row with a thrash figure neither of them has. What no entry claims is reported as unclaimed. (I42)
30. **The view is the profiler's own frame, and says so.** Every redraw is bracketed, so what the reader watches is never counted as what the framework cost. (I49)
31. **A look costs the reader nothing their tier was recording.** Raised only when below, restored only when raised, and restored from the change stream so every way of closing reaches the owner. (I50)
32. **The view is a window that redraws on a clock and a key, never on a frame.** (I51)
33. **The first pane fits.** The overview is 23 rows or fewer at 80 columns for every report — the region minus the header — by density and by moving what no type bounds to the pane that owns it, never by dropping a figure. (I52)

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

## 9b. The view's walk — a table and a trace, indexed by rule interaction

The view has state (a pane, a remembered tier, an offset, a timer) and structure (one layer, one id,
a window), so it needed both shapes (CLAUDE.md). Every row below is a cell where two rules could
both apply; a row governed by one rule was left out because it restates that rule and finds nothing.
The rules the rows name: **R-a** C15 I1 (one view; a push onto a non-empty stack throws) · **R-b**
I23 (open raises, close restores) · **R-c** I18 (`setTier` resets the ring; the recorder
short-circuits an unchanged tier) · **R-d** I12 (self-inflicted iff *every* commit was own) ·
**R-e** C16 §5 (`Esc` is `viewPop`, an owner call; `⌃c` on a pushed view is `overlays.pop()`, not
one) · **R-f** C15 I25 (every removal emits one change with the id, synchronously) · **R-g** §7
(`setTier` after `dispose` is a no-op) · **R-h** I38 and `session.ts`'s stop order (report before
dispose, cleanup after both) · **R-i** C15 I14 (`update` never pushes; `false` for an unknown id) ·
**R-j** I26 (spans open across a resize are tagged) · **R-k** I11 and I23 (no durations below
`spans`; a pane with no data draws a notice) · **R-l** C23 §2 (a local verb is not gated on
validation; `args` is empty on the failure arm) · **R-m** C16 focus (the prompt takes no keys while a
view is top) · **R-n** C09 I49 (the separator is ambiguous-width) · **R-o** C15 I8 (truncation is
reported, and the owner draws the indicator).

**The classification table — structural, two rules at rest.**

| # | cell | rules | ruling |
|---|---|---|---|
| B1 | `/profile` with no profiler configured | R-b × a session built without one | refused through the local route with a notice naming `TuiConfig.profile`; nothing pushed, no tier to touch, and not a throw (C23 I2). → C23 I68, T1.97 |
| B2 | open at a tier already at or above `spans` | R-b × R-c | **no `setTier` call on either side.** The naive *restore what was remembered* calls `setTier("spans")` on close and is saved by the recorder's short-circuit — a guard one component away that the view must not lean on. → I50, T1.93 |
| B3 | open at `counters` | R-b × R-c × R-k | the raise resets the ring and the pane opens on the *no frame recorded yet* notice, never a zero plot; `resetRing` leaves `counters`, so the `frame` pane's counters table shows the session so far and the overview names the count (I52). Close resets again — the spans watched go with the tier that recorded them. → T1.16d, T1.93 |
| B4 | open while another layer is up | R-a | refused with a string naming what is open; the stack untouched; `top !== null` checked, never caught. Reachable from the keyboard only by a handler run while a peek is up (a peek is never `top`), and always programmatically. → T1.99 |
| B5 | a pane taller than the region | R-o × the window | block-boundary window through `measureSequence`, at least one block; a single block taller than the region is shown under a hidden-rows notice — the document view's I47 shape **without its *n/p move by block* clause**, because here `n`/`p` switch panes and the sentence would be false. → I51, T1.98 |
| B6 | `/profile foo` | R-l × an `enum` argument | validation fails, the handler runs with `args` empty, and answers a usage notice naming the four panes and the token typed; nothing opens. → C23 I68, T1.65 |
| B7 | the terminal's capabilities against `profilePane`'s ASCII default | R-n | the view hands `detection.capabilities` whole; under `unicode: "ascii"` the separator is the ASCII arm and under a unicode terminal it is `·`, never the default regardless of terminal. → I51, T1.96, T4.9 |
| B8 | `/profile frame` typed at an open view | R-m | unreachable — the prompt has no keys while a view is top — so pane switching needs a key inside the view, and the only honest slot is the `pushedView` unit key `n`/`p`. → §3c |
| B9 | the overview against a 24-row region | R-o × I52's budget × the two tables no type bounds | the budget is 23 rows — the region minus the header — and it is met for **every** report rather than for a fixture. The counters and cache tables are the only blocks whose rows no type bounds; a cap with an *N of M* marker drops the figures a reader opened the pane for, and a move to `frame` keeps them, so they move and the overview says where and how many. **What the ruling leaves behind**: a reader who opened the view at `counters` sees the pointer and not the table, and `frame` at that tier draws the tables under its *raise the tier* notice — the tables are counts and exist below `spans` (I44). → I52, T1.100 |
| B10 | the coalescing plot's `height` against its rows | a grouped bar × `Math.max(4, rs.length + 2)` | two bars per reason under a height of one per reason: right at one reason, which is what every fixture had, and at the type's five reasons the plot drew six rows and put `stream` and `spinner` behind a `+4 more` marker — the coalescing figure hidden for exactly the reasons coalescing is about (F960). A table with one row per reason replaces it, bounded by the union, and *the difference is what coalescing saved* becomes a `saved` column rather than an instruction to subtract. → I52, T1.100 |

**The sequence trace — event-mediated.**

| # | sequence | rules | ruling |
|---|---|---|---|
| S1 | open → the timer ticks → a frame | R-d | the tick's `update` and commit run inside `own`; the frame is self-inflicted, excluded and counted. → I49, T1.92, T4.4 |
| S2 | open → a far-side patch commits → the tick lands in the same window → one frame | R-d | mixed, so recorded — I12 says *every*. → T1.92's control, T4.4's control |
| S3 | open → `Esc` | R-e (`viewPop`) | `keys.ts` asks the owners in turn — this one first, then the document view, then the patch view — and calls `pop()`: `dismiss(id)`, the change, the teardown. → T4.7 |
| S4 | open → `⌃c` | R-e (the ladder) × R-f | `overlays.pop()` from a non-owner emits `pop` with our id and the teardown runs from the subscription — the same path as S3. **Without the subscription**: the tier stays raised for the session and the timer fires every second into `update`, which returns `false` (R-i). Measured on the document view, F944. → I50, T1.94, T4.6 |
| S5 | open → the session stops | R-h × R-g | `stop()` disposes the pipeline, drains, takes the report, disposes the profiler, then releases; cleanup calls the view's `dispose()`, which stops the timer and leaves the tier — `setTier` is a no-op by then, and against a live profiler a restore would reset a ring nobody has read. The report describes the raised tier, which is what was recorded. → I50, T3.13, T4.8 |
| S6 | `pop()` → a queued tick | the timer × R-i | the timer is disposed inside the teardown, so it does not fire; a tick that finds `pane === null` returns before `update`; and `update` on the departed id is `false` and raises no commit. → I51, T1.95 |
| S7 | open → `open` again | R-a × R-b | refused naming the profiler view; one `push` in the change log; **the remembered tier is not overwritten** — the naive second raise remembers `spans` and the restore then restores to `spans`, which is the double-raise defect. → I50, T1.99 |
| S8 | open → resize → the tick | R-j × the window × R-o | the layer's blocks are unchanged on the resize frame and C15 re-places them at the new region, clipping if the old window no longer fits; the next tick re-windows, so the clip lasts at most `VIEW_REFRESH_MS`. The view is told nothing about resizes and redraws for none, which is the cost recorded here. Spans open at the resize are tagged by the recorder; the view adds nothing. → T3.14 |
| S9 | open → `n` | keys × the window × R-d | the pane switches, the offset resets to 0, and the redraw is bracketed with reason `input`. → T1.98, T4.7 |
| S10 | open at `counters` → ticks → `n` → `Esc` | R-c chain | one raise at open; no tick or switch calls `setTier`; the close restores `counters` and resets once. → T1.16d |
| S11 | open → an approval overlay is raised above the view → `⌃c` on it | the ladder × R-f | the `overlay` rung answers first: a non-dismissable confirm consumes the key and a dismissable overlay is popped, and the change carries **its** id — the subscription filters on ours and the view is untouched. → T1.94's control |

**What the walk changed before any code existed.** S7 (a second raise overwriting the remembered
tier), B2 (a restore on an unchanged tier leaning on another component's guard), S4 (the ladder never
calls an owner) and S5 (a restore at `stop()` racing the report) each ruled a line the obvious
implementation gets wrong while every single-rule assertion about it passes. S4 is also the one that
produced a finding about the two owners that already existed (F944), and B5 is the one that measured
the pane against the region and found it did not fit (F947). **B9 and B10 came from F947's second
pass**, when the pane was re-measured through the registry that draws it: the first found that the
recorded height was an instrument's (F959), and the second that the coalescing plot hid two reasons
at the set's full size (F960) — a defect proportional to a small count, which no fixture with one
reason could reach.

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
- **T1.2** (I3): a span over an injected clock the **callee** advances 5 ms → 5 ms recorded; the same span closed *beside* that callee → 0 recorded with a count of 1. And `performance.getEntries()` is unchanged across the whole run. **Both arms, and the clock's shape is the row.** A counter clock — `() => (t += 1)` — advances once per *read*, so under it a leaf span records 1 whether it brackets its subject or not, and the two arms become the same assertion; the zero arm is also what stops a recorder that reports nothing at all from satisfying the five (F887).
- **T1.3** (I4): a `FrameRecord` with `work: 3`, `wait: 97` → the report exposes three members and no member equals 100.
- **T1.4** (I5): two commits at t=0 and t=90, one frame at t=100 → `wait` is 100, not 10.
- **T1.5** (I11): at `counters`, `report()` has no `spans` key and no `latency` key — `"spans" in report` is false, asserted rather than `spans` being empty.
- **T1.6** (I6): a composition returning `fallback` → counted in `excluded.fallback`, absent from `spans.frame`.
- **T1.7** (I7): a group of three children measured through `measureChild` → the parent's recorded cost is its own, and the derived inclusive figure is the sum.
- **T1.8** (I8): a key differing only in `theme` → `misses.theme` is 1 and `misses["nothing-changed"]` is 0; an identical key that missed → the reverse.
- **T1.9** (I9): a ring of 8 given 20 frames → 8 held, `dropped.frames` is 12. The two are asserted separately, because a conservation total is satisfied by redistribution.
- **T1.10** (I10): a report whose ring dropped frames → both frame-construction figures say they are over the window and name how many earlier frames went; a report that dropped none → neither does. **In the row's own text, not left to `dropped.frames`.** A reader quoting a p95 is reading the line and not the report, and a bound drops the oldest first — so the figure is wrong in the direction that reassures, and the qualification has to travel with it.
- **T1.11** (I16): each of `1`, `4`, `8`, `16` → `minor`, `major`, `incremental`, `weakcb`; the map is total and a fifth number does not compile.
- **T1.12** (I18): `setTier` from `spans` to `alloc` → the ring is empty and the report names the reset.
- **T1.13** (I20): a mark raised between two spans → it is in `marks` and in no `FrameRecord`.
- **T1.14** (I22): `dispose`, then `span`, `count`, `mark`, `report` → no-ops; `dispose` again → no-op; `capture` → throws naming `dispose`.
- **T1.15** (I17): a capture exceeding the cap → the written file stops at the cap and `dropped.captureBytes` reports the excess, asserted separately — a total is satisfied by redistribution.
- **T1.15d** (I17): a `heap` capture at a 64-byte cap → `bytes` is 64 and `droppedBytes` is over a million, asserted apart because their sum is the snapshot's size however the split falls. `heap` is the kind whose bytes come off a stream rather than a `JSON.stringify`, so it is where the cap has to hold against something the component did not size. The row was first written to reach `capped`'s no-room branch and could not: `getHeapSnapshot()` yields **one chunk of 5 193 967 bytes**, so the sink is written once per capture for every kind and the branch was unreachable — and redundant with the overrun arm, which computes the same thing at `room === 0` (F878).
- **T1.16** (I23): a report at tier `spans` with **nothing recorded** → each of the four panes draws a notice and **no plot at all**. Asserted over the whole of `PANES`, because the two panes that were right were right by accident: `frame` and `memory` had no tier-shaped field to reach for, so they asked about data, and a row naming the pane that broke would have been satisfied by the accident and blind to the next pane written from the same template (F895). The fixture asserts its own emptiness first — a setup that quietly recorded a frame makes every assertion here vacuous.
- **T1.16b** (I23): the same report's notices, by text, in both directions → at a spanning tier no notice says *raise the tier* or *the tier is below*, and at `counters` some notice still says both. **Counting notices is the assertion the third instance passes**: `frame` guards on the data, takes the right branch, and printed the tier's sentence into it — *raise the tier to `spans`* to a reader already on `spans`. The `counters` arm is what stops the repair being *delete the sentence*, since below a spanning tier the tier is the true answer.
- **T1.16c** (I23): its control — six recorded frames at `spans` → `overview` draws `ov-latency` and draws `ov-coalesce` as a **table** (I52 turned the plot into one, and the row asserts the kind so a plot coming back is seen), `frame` draws `fr-spans`, `distribution` draws `di-quantiles`, `di-spans` and `di-worst`. A guard widened until it refuses everything passes both rows above perfectly; the ids are named rather than counted, because a pane drawing one plot where it owes two satisfies a count and is missing the answer.
- **T1.16d** (I23, I50): the view opened at `counters` → the tier is `spans` while it is open; `pop()` → the tier is `counters` again, not `off`, and `setTier` was called exactly twice, once each way. **Live since the drawing round.** It was deferred on the view for as long as `profilePane` had no caller in `src/` outside `profiling/`, and the marker it carried named that as a symbol rather than a component — this half was bundled with T1.16 under a single *not deferred on a component* marker that was true of neither, and N subjects need N blockers.
- **T1.18** (I36): a route whose transport takes 40 ms and whose adapt takes 5 → `spans.transport` is 40 and `spans.adapt` is 5, and their groups are `far side` and `compute`. One number covering both is the reading the split exists to end: a slow far side and a slow adapter want opposite remedies, and only one of them is this framework's to apply.
- **T1.19** (I36, I33): two live parts fetching concurrently, one 10 ms and one 30 → `livefetch` has `count` 2, `max` 30 and `sum` 40, and neither node is the other's child. This is the case the single-pointer shape recorded as nothing, with no error.
- **T1.20** (I36): a stream of five patches, the far side pausing 20 ms before each and the consumer taking 10 between them → `spans.stream.sum` is about 100 and **not** about 140. The bracket is around `next()`, so the consumer's own work is outside it by construction; a span around the loop reports one number that both a slow far side and a slow shell produce.
- **T1.21** (I36): the same route at tier `off`, with the seams' own call counts beside the report → no span is recorded **and** each decorated seam is called exactly as often as the undecorated one. An empty `spans` is also what a decorator that swallowed the call looks like, so the count is what separates the two.
- **T1.22** (I36): a local verb handler taking 12 ms → `spans.local` is 12 and its group is `compute`. This round's plan called it `handler`, which is the input path's name and groups as `input`; one name for both files a document-producing route in the column a reader scans for keystroke latency.
- **T1.23** (I36, C06 I9): the decorated `stream` yields exactly the patches the undecorated one does, in order, with exactly one `end` last. A decorator that drops, reorders or duplicates a patch is invisible to every timing row above, and it is the only defect here that changes what the user sees.
- **T1.24** (I36, C22 I93): a real graph built with a profiler, a shipped local verb submitted through `pipeline.submit` → `spans.local` is recorded. **Every row above calls a decorator directly and all of them stay green on the day the root stops applying them**; MG25 says a decorator is named somewhere in `src/` and cannot say the right profiler reached it or that `PipelineDeps.trace` is read at the other end. `local` rather than `transport`, because a subprocess would add a way for the row to fail for a reason other than the one it names.
- **T1.25** (I37): a report with 12 frames and 480 KB in `counters["bytes.written"]` → the bytes row reads 40 KB per frame, is not crossed against the appendix's 100 KB, and prints both figures. A threshold quoted without the measurement beside it is a verdict a reader cannot check.
- **T1.26** (I37): a report at tier `counters`, which carries no `latency` → the two frame-construction rows come back **unanswerable naming the tier**, not 0. Zero here reads as a frame that took no time, which is the one answer that would close the gate.
- **T1.27** (I37): a full `deep` report where every answerable row is measured → resize corruption and Page Down latency are *still* unanswerable, each naming what it would need. An `unanswerable` that appears only on an empty report cannot be told from a report with nothing in it.
- **T1.28** (I37): a report whose p95 is 20 ms against the appendix's 16 → `crossed` is true and the formatted table marks that row. Any crossing justifies the experiment, so a table rendering a crossing the same as a pass buries the single thing it exists to say.
- **T1.29** (I37): a report where every answerable row passes → the verdict is `undecided` and names the two rows it lacks, never `closed`. The appendix's own sentence — *none crossed means M-T6 is closed* — is a two-valued reading of a table with six rows and four answers, and `closed` is the value that ends the experiment.
- **T1.50** (I37, C22 I93): a real graph built with a profiler, one frame committed, `checkBudget` over the report it produces → the bytes row is `measured`. **Every row above builds a report literal**, which agrees with `ProfileReport` by construction and would keep agreeing on the day `session.ts`'s counter is renamed — and the failure that produces is an *unanswerable*, which is this module's honest-looking answer and therefore the one nothing would question. This is C08 §1's schema trap arriving at a counter name.
- **T1.58** (I38): a session started with `profile: { tier: "spans", onReport }` and stopped → `onReport` is called exactly once, and the report it receives carries the session's frames. **Both halves are chosen for what can fail** (F883): called twice is a report a consumer would append twice, and a frame count above zero is what goes red if the call moves to `start()` — where a report is well-formed, empty and early. The row first asserted `heapSpaces` instead, on a mechanism that does not exist, and passed whichever order the two lines were in.
- **T1.59** (I38): a session started with no `profile` at all → `onReport` cannot have been called, and a session at `tier: "off"` does not call it either. An absent callback and an empty report are the two readings of *nothing came back*, and only one of them is true here.
- **T1.60** (I39): the shipped `SpanName` union against the members a scan finds opened under `src/` → equal sets. **By equality and not by containment**, because a member added to the union and never wired is exactly the case this exists for, and a subset check passes on it. Asserted over the union's own members rather than a written list.
- **T1.61** (I39): a frame composed at tier `spans` → `chrome`, `overlays`, `paint` and `assemble` all carry a non-zero count; every span's self time together fits inside `latency.work`; and `overlays` is opened **exactly once per frame** — `renderFrame` lays the overlays out once through the one wrapper and hands the layout to both `paint()` and `cursorFor()` (C22 I96). It read twice per frame and this row asserted the two on purpose, as the defect P11 named; a row that asserts a disagreement is green for exactly as long as the defect is (F855, F856, F941), so it now asserts the remedy's count, and a second call site reaching the wrapper or the thunk fails it either way. **Not against `spans.frame`**, which is the frame's work outside every other span and which the parts exceed by an order of magnitude (I40, F885). **And not a claim about bracketing** — this row runs under a counter clock, which cannot separate a span from an adjacency; that is T1.2's row (F887). What survives a counter clock is containment and the call count.
- **T1.62** (I40): a session at tier `spans` with nested spans → `spans.frame.sum` is **strictly less** than `latency.work.sum`, by more than the histogram's own error, and `spans.frame.sum + Σ(every other span)` does not exceed it. **The strict inequality is the half that bites**: feeding `record` the node's `total` instead of its self time makes the two equal, and a conservation bound alone is satisfied by that.
- **T1.63** (I40): `make profile`'s phase table → its shares are taken against `latency.work` and the residue row is `work − Σ parts − frame`. A share against `spans.frame` is larger, sums to more than 100 % once the seven dead spans are wired, and is the shape the first version shipped.
- **T1.64** (I41, real session): every span name found inside a frame's tree is declared `frame` in `SPAN_SITE`, and every name opened in the session but found in no tree is declared `session`. **Measured against the trees rather than restated**, because a table read back against itself agrees; `frameRoot` is nulled at frame end, so a span opened between frames roots itself and cannot appear in one. The names a run never opens are listed and not asserted — a fixture with no far side reaches 13 of 19 — and the number observed is asserted, so a run that observed nothing cannot pass the row by having nothing to disagree with.
- **T1.65** (I41): `checkPhases` over a report holding both populations → the session spans are absent from the in-frame parts, carry no share, and the residue is at or above zero. **The negative residue is the assertion**: summing 755.9 ms of between-frame work into 2946.3 ms of in-frame work printed -460.5 ms, and the sign is the only thing that made it visible (F888).
- **T1.66** (I41): the same check over a report whose spans are all in-frame → the residue is exactly `work - Σ parts - frame`, and the session group is empty rather than absent. **Both arms**, because a partition that files everything as in-frame satisfies T1.65 and is the state this replaced.
- **T1.67** (I42): two transcript entries each holding a block with id `b1`, both measured → `nodes` holds two rows, each with its own `calls`, and no row reports the summed `calls` over either entry's `frames`. **Both halves, because the count is the harm and the ratio is the signal**: a fix that split the rows and left `frames` taken across the pair would pass a row asserting only the row count.
- **T1.68** (I42): an element measured with no `entry` scope open → present in `nodes` with no `entry`, counted in `byKind`, named by no `byEntry` row, and the report's own difference between `Σ byEntry` and `Σ nodes.self` is that element's cost rather than zero. The chrome is the real instance: it is measured every frame and belongs to no entry.
- **T1.69** (I42): the same entry scope opened around two frames' worth of work → `byEntry.e1` accumulates across frames while each element keeps its own `nodes` row, so an entry's total and its parts are not the same number counted twice.
- **T1.70** (I42): an entry scope opened inside another → the inner takes its own elements and the outer resumes for the work after it, rather than the elements after the inner close belonging to no entry. **No caller nests one today** and the row says so: the shell's loop opens a scope per entry and closes it before the next, so a handle that cleared would be correct in the tree as it stands. It is kept for `SpanHandle`'s reason — that closing through the saved value rather than through *whatever was current* is what makes composition correct — and the failure it guards is the one that hides, since an entry losing its tail reads as a shortfall and a shortfall reads as chrome (F892b).
- **T1.71** (I43): a thousand objects tracked under one name, dropped, and collected → `created` is 1000, `finalised` is **999**, `live` is 1. **The residue is asserted as one and not tolerated as a range**, because it is deterministic — always the most recent registration, at every size measured — and a row written as `≥ 990` would pass a registry that reported half (F893). Runs under `--expose-gc`; without it the same fixture reports 0 finalised, which is the control that says the arm measures reachability.
- **T1.71b** (I43): the same fixture with no collection forced → `created` is 1000 and `finalised` is **0**. **The arm is only a measurement if this is zero**: it says the count follows reachability rather than registration, and it is what a registry firing on `register` would fail. The row supplies its own collector rather than asking the runner for `--expose-gc` — a flag the runner supplies is a flag `npx vitest run <file>` omits, and the row would then read zero finalised, which is a real reading of a real registry and says nothing. It drains with `setImmediate` and never `setTimeout`: the suite fakes the latter, so the obvious drain runs synchronously and reports 0 — measured while writing these rows, 0 against 99.
- **T1.72** (I43): objects tracked under three names, fifty each, dropped and collected → two names report 50 and one reports 49, and **the report's own floor names the shortfall as one object rather than one per class**. The class it lands on is registration order, so a row naming which of the three is short would be asserting an accident.
- **T1.73** (I43, I1): at `off`, a thousand `track` calls → no `FinalizationRegistry` is constructed, `leaks` is empty, and the objects are not retained. **The retention half is the one that matters**: a tracker holding a strong reference to everything it watches is a leak in the instrument that finds leaks, and it would report `live: 0` for ever while being the cause.
- **T1.74** (I43): `checkLeaks` over a report where nothing was collected → every row is marked as not a reading about its class, and the report says `collected: false`. Over one where something was → the rows at `live ≤ 1` are marked as at the floor and the rest by their share. **`collected` is the row's subject and not a field it happens to carry**: a class that made everything and let nothing go is what a leak looks like *and* what a process under no memory pressure looks like, and one figure cannot tell them apart. A table without it invites the first reading every time.
- **T1.75** (I43): a probe recording its `track` calls, given to `RenderScratchStore` and `RenderCache` → each `set` registers the thing whose lifetime is in question — the carrier for the first, the line array for the second — under a name. **The wiring, which the rows above cannot see**: they call `track` themselves and would pass on the day nothing in `src/` did. The scratch store's only caller is `scatter3.ts`, so no profiling fixture in the tree reaches it and only a row can; `image.decoded` is reached by no fixture either and is named here as owed rather than counted as covered.
- **T1.77** (I45, coverage): every `kind` in `DEFAULT_DEFINITIONS` against the first segment of every `gauge` name under `src/presentation/` → the two sets agree, and the kinds are read from the definitions rather than listed. **The list is the defect this row exists for**: a hand-written set of kinds is written by the same reading that missed one, and `image` was missed by a check keyed on the *file* — it holds `decode.entries`, which is the decoder's cache and not the block's input, so the file looked instrumented and the kind was not (F906). The row asserts the count as well as the difference, so a check whose gauge scan matched nothing cannot pass by finding no disagreement.
- **T1.78** (I45): a `rule` whose label is 4 000 characters, rendered at width 80 → `gauges["rule.label"]` reports 4 000 and the block's `measure` reports 1. **Both halves, and the second is the argument**: the clamp is what makes the drawn row a constant, so a gauge taken after `truncate` would report 80 at every label and be indistinguishable from a kind nobody instrumented. The same shape for `progress.label`.
- **T1.79** (I45): a one-row `notice` carrying 200 spans, and a 200-row `notice` carrying none → `notice.spans` separates them and `notice.rows` does not, and the converse. **Written as a pair because a single gauge passes either arm alone**: the rule that a kind with two independent inputs gets two gauges is only tested by the case where one of them is flat.
- **T1.80** (I45): an `image` whose payload is 40 000 base64 characters, drawn on a terminal with no image protocol → `image.bytes` is 40 000, `image.pixels` is the source extent's product, and `decode.entries` is 1. **The third figure is the control**: it is the gauge that was already there, it is 1 for a two-kilobyte file and a two-megabyte one alike, and it is what made the kind read as covered.
- **T1.81** (I46): a recording written by all four taps over one scripted session → the NDJSON's lines are in the order the events happened, and the `input`/`resize`/`far` subsequence is what the replay drives while the `frame` subsequence is what it compares against. **Asserted as one sequence and not four**, because four correctly ordered logs merge to any order at all.
- **T1.82** (I46): a replayed `stdout` whose `columns` is taken from the recording → a `resize` event updates the size **before** it is delivered, and a replay wired to the real terminal's width is the control. The control is the row: every byte agrees except the ones the width decides, so the divergence reads as a wrapping defect in whatever block happened to be near the edge.
- **T1.83** (I47): a recording replayed under the recorded environment is identical, and replayed under `TERM=dumb` **diverges**. **The fabricated violation is run rather than described**: if the verdict were replayed instead of re-derived, changing the environment beneath it would change nothing. The row as first written asserted that C02's query escapes appear among the replayed writes — measured, this fixture's detector reads the environment and writes **no device-attribute query at all**, so that assertion was over an empty population and would have passed on a session that never detected anything (F912).
- **T1.84** (I15): a recording whose final line is a torn JSON object → it parses, the torn line is dropped, and the recording reports `truncated`. **Not an error**: a process killed mid-write is the case the field exists for, and a parser that throws turns the recorder's death into the replayer's.
- **T1.85** (I14): the same recording replayed twice with the clocks driven positionally → the footer's `last N.Nms` cell is the same string in both, and is not `last <0.1ms`. **The second half is the assertion**: pinning the replayed clocks to the event boundaries — the robust-looking implementation — flattens every duration to zero, which is self-consistent, deterministic, and diverges from every recording taken from a live session (F908).
- **T1.76** (I44): twelve frames at `counters` with `bytes.written` counted → `report.frames` is 12 and `checkBudget`'s bytes-per-frame row is **measured**, not refused. **Both halves**: a repair that counted frames and left the row refusing would satisfy a row asserting only the count, and the refusal is where the falsehood was printed. The same twelve at `off` → `frames` is 0, because nothing is recorded there and a zero is then the true answer.
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
- **T1.40** (I30): a rendered document holding a plot, a table and a code block → each kind's phases appear under its own names — `plot.layout`, `plot.area`, `plot.furniture`, `plot.form.<form>`, `table.plan`, `table.rows`, `code.tokenise`, `code.paint`. The registry seam can only see that a block was measured; a phase is a component naming what it did.
- **T1.41** (I30): the same render → `plot.samples`, `plot.series`, `table.rows`, `table.columns` and `code.rows` carry the size each phase's duration is against. A duration alone says a plot was slow; the pair says whether it is linear, which is the difference between a figure and a finding.
- **T1.42** (I30, **the control for the split**): `plot.area.cells` at 200, 2 000 and 20 000 samples in a 4-row box → **700 in all three**, and 4 300 at height 40. A renderer attributing everything to one phase satisfies T1.40 and T1.41 exactly, so only a comparison separates the phases — and the comparison is the box rather than the data, because the downsampler collapses a series onto the area's columns before anything is drawn. Two configurations differing by 100× in data give an equality where every timing assertion would give a threshold.
- **T1.43** (I31, **the fabrication control, on the render seam**): a document holding one 2 000-point plot and fifty rules → the plot is the largest node and its self time is more than 20× the median leaf's. `registry.render` costs 123 µs for a rule against 15 310 µs for that plot, so the spread is the reading the element table exists to produce; the apportioning shape reported the plot at one fifty-second of the total, which is a census of what was on screen wearing a cost's units.
- **T1.44** (I31): one measured sequence at `off`, `counters` and `spans`, with the seam's own call count beside each → `off` asks the profiler nothing, `counters` records `measure.sequences` and its block gauge while opening no element, `spans` opens elements. The three are asserted together because each alone is satisfied by the wrong reading, and the call count is what separates a seam that declined from a recorder that refused — `nodes.length` is 0 either way, which is how a tier named after counters shipped with no counter able to fire.
- **T1.45** (I35): a retained tree whose parent has self time between two children → the second child's `ts` exceeds the first's `ts + dur` by that gap, and neither child's `ts` is a function of its sibling. Laying children end to end inside their parent produces a document a viewer draws without complaint.
- **T1.46** (I35): a span of 5 ms → `dur` is 5 000. Microseconds against this component's milliseconds is the one conversion in the file, and applying it twice is a factor of a thousand that still opens as a profile.
- **T1.47** (I35): eight frames at `worst: 2` → `otherData.framesInSession` is 8 and `framesWithTrees` is 2. Counting the drawn trees is I32's retention policy read as a measurement.
- **T1.48** (I35, I4): three frames as NDJSON → three lines, each parsing on its own, and no key on any of them equal to `work + wait`.
- **T1.49** (I35): a tree holding both an element node and a phase span → their `cat` values differ. One category collapses the two feeds a reader has to tell apart — a block instance the registry seam measured, and a span a component opened inside itself — into one colour.
- **T1.17** (I24, I42): two elements measured inside `entry("e1")` over a clock the callee advances by 2 ms and 1 ms, in a frame that waited 97 → `byEntry.e1.sum` is 3, and 97 appears in no `byEntry` row and in no `byKind` row. **The setup is the correction.** The row was written against a per-frame apportionment this round deleted (I31), and for the whole of that round it was unwritable — not because the report lacked a member but because the *key* lacked the entry, which reads from outside as the same thing and wants the opposite repair (F892). A counter clock cannot stand in here: it advances per read, so both elements record 1 and the sum is right for the wrong reason (F887).
- **T1.92** (I49): the view over a real recorder, its `redraw` wired the way `construct.ts` wires the seam — `commit(reason, false)` — then `open` and a frame → `excluded.selfInflicted` is 1 and the frame is in no histogram and on no timeline; a tick with no reader's commit → 2. **The tick is not optional**: `open` brackets its own push and the timer's redraw goes through the shared `render`, so a row that stopped at the open passed with `render`'s bracket removed — measured on this row's first form, which failed nothing but T1.95. **The control is the mixed frame**: a reader's commit in the same window as the tick's, then the tick's frame → excluded stays 2 and the histogram gains the frame, because I12 says *every* and a bracket that marked the frame on *any* own commit passes the first half alone.
- **T1.93** (I50): opened at `counters` → `spans`; opened at `alloc` → still `alloc`, and the frames recorded before opening are still in `timeline` after opening **and after closing**; opened at `spans` → `setTier` is called zero times across open and close, asserted on a spy over the recorder. **The third arm is the row**: a restore that calls `setTier(remembered)` unconditionally is green on the first two because the recorder short-circuits an unchanged tier, and a view leaning on another component's guard is one refactor away from wiping the ring on every close (§9b B2).
- **T1.94** (I50, C15 I25): opened at `counters`, then `overlays.pop()` called by a non-owner — the ⌃c ladder's call — → the stack is empty, `pane` is `null`, the tier is `counters` and a later tick fires nothing. **Its control**: a dismissable overlay pushed above the view and popped the same way → the overlay's change carries the overlay's id, the view stays open and the tier stays raised. The subscription filters on the id, and a teardown on *any* removal would close the view under a menu (§9b S4, S11).
- **T1.95** (I51): the timer, held rather than waited for → nothing changes between ticks; each tick emits exactly one `content` change on the view's id and one `stream` commit inside the bracket; after `pop()` the disposable has been called and a tick that was armed does not fire. **The last clause is what a generation guard hides**: a timer disarmed by disposal fires nothing, and a row counting changes after `pop()` is what shows the disposal was the mechanism rather than a check inside the callback.
- **T1.96** (I51, C09 I49): the same report opened under `unicode: "ascii"` and under a unicode terminal → the layer's regime row carries the ASCII separator in the first and `·` in the second, and each equals `profilePane(report, pane, caps)` for the caps handed in. **Never the default**: `profilePane`'s ASCII fallback is for a caller with no terminal, and a view has one (F828).
- **T1.97** (I50, C23 I68): a view built with no profiler → `open` returns a refusal naming `TuiConfig.profile`, pushes nothing, and emits no change. The verb's arm over it is C23 T1.64.
- **T1.98** (I51, C15 I8): the overview over a region of eight rows — header and pane together are taller than eight even on an empty ring (nine rows in four blocks, through the registry that draws them), which the row asserts before anything else — → the layer holds the blocks that fit and no more, measured through the same `measureSequence`, and one more block would not fit; on that ring the tail from the second block fits a page, so `pageDown` clamps to the last offset whose tail still fills the region and a second `pageDown` is `false`; over the largest report the type allows (T1.100's, three pages at eight rows) `pageDown` moves the window to the block after the last one shown and `top` returns; a region of one row → the one-row header fits alone and no notice is drawn (I52 took the gap that made it two), and `pageDown` to the four-row regime block → that block alone, under a notice saying how many rows are hidden and not saying *n/p move by block*; `n` switches pane and resets the offset to 0. Asserted on the layer's content, because a window that fits is indistinguishable from one C15 clipped unless the blocks are counted.
- **T1.99** (I50, C15 I1): `open` while open → a refusal naming the profiler view, one `push` in the change log, and **the close restores to the tier found by the first open**, not to `spans`. The second clause is the row: a remembered tier overwritten by the second raise restores wrongly and nothing about the refusal shows it (§9b S7).
- **T1.100** (I52): four reports — an empty ring; twelve frames; twelve frames with three spans, a counter and two caches; twenty frames over every `CommitReason` with the same — each measured through `measureSequence` with `tableDefinition` and `plotDefinition` registered, at 80 and at 120 columns → the overview is at most 23 rows and the header with it at most 24, and through the view at a 24-row region every block of the pane is on the layer with none windowed off. **The four totals are asserted, not only the bound**: 9, 17, 18 and 22 rows with the header at 80, so §3c's table cannot outlive its measurement (F935). **The fixture responds**: the largest report's overview holds five coalescing rows and the latency plot; `frame`'s `fr-counters` and `fr-cache` name every counter and every cache the report holds, so the ceiling is met by moving and not by dropping; and the overview's one-row notice names both counts. **The harness's registry has no `plot`** — measured through it the same twelve-frame pane is 26 rows and reads as fitting, which is why the row builds its own (F959).
- **T1.101** (I14): the header's clock masked on the chrome's own bytes — `\x1b[38;5;241m09:39:14\x1b[39m` against the same frame reading `:15` → `masked` 2 and identical; a four-digit `109:39:14` and a trailing-digit `09:39:145` stay unmasked and diverge. T1.87 fed a sentence with a space before the digits, which `\b` accepts; the chrome's `m` is a word character it does not, and the member matched nothing the header ever drew (F964).

### Tier 2 — contract

- **T2.1** (I2, the instrument's own fixture, **real clock**): a span wrapping a deliberate 5 ms busy-wait reports **≥ 4 ms**; a counter incremented 1 000 times reports exactly 1 000; a probe returning a rising then falling heap is reported rising then falling. The counter and the probe assert exactly, the duration asserts a floor, and the row prints all three.
- **T2.2** (I2, **the negative control**, real clock): two hundred empty spans → the **p50** is **≤ 10 µs**, the span machinery's own cost and not its subject's. Without this row T2.1 is satisfied by an instrument that reports the same figure for any input, which is the five-of-five class arriving in the tool built to end it. Both bounds are printed beside the assertion.

  **The statistic is the row.** Written without one and read as `max`, it fails: the worst of two hundred spans measures 21–61 µs across runs, because a scheduling hiccup anywhere in the two hundred sets it and that figure is about the host. The p50 measures **1.00 µs**, which is §3a's 0.96 µs arriving from a second direction — and it is also the histogram's floor, since `indexOf` rounds to whole microseconds, so this row cannot distinguish 600 ns from 1.4 µs and is not evidence about anything below its resolution.
- **T2.3** (I13): a sample at `resolution: 10` → `loopDelayResolutionMs` is 10, and **every pane that draws the p50 draws the resolution and the qualifier with it**. The earlier wording — *no consumer reads the p50 as a delay* — is a negative claim, and it was already false in its literal reading: the memory pane draws the figure, correctly, as `0.00 ms at resolution 10 ms — a floor, not a reading`. A negative claim passes hardest the day it becomes false, and this one had nothing to resolve against. The row runs over all four panes rather than the one that draws it, because a row naming `memory` goes green on the day a second pane starts printing the figure alone, which is when the invariant first has something to be wrong about.
- **T2.4** (I21): the source scan SS58 over `src/`, with `node.ts` allow-listed; the allow-listed file is shown to still trigger the pattern, so the exemption is exercised. **And a third input**: the same read in `recorder.ts`, a sibling in the allow-listed file's own directory, still fires. A fabricated violation shows the rule fires and the control shows the exemption is exercised; neither shows the exemption is the right *size*, and widening the entry from the file to the directory changes no other verdict in the row (F879). Written in `test/unit/profiler-seams.test.ts` beside SS59's row rather than in the tier-2 directory: it needs `checkSourceScans` and a fabricated violation placed in a named file, which is the enforcement harness's fixture and not the profiler's, and splitting a rule from its control across two files for a directory name buys nothing.
- **T2.5** (I19): a 60-second run at 60 fps → `getEntries` is read at most once per sampler interval, asserted by counting probe calls rather than by timing.
- **T2.6** (I12): a frame raised by one profiler commit and one real commit → `selfInflicted` is false.
- **T2.7** (I25): the report's timing-entry figure → a count, with no site, and carrying the label that says the profiler raises no marks of its own.

### Tier 3 — edge

- **T3.1** (I5): three commits at 10, 25 and 40 with the frame starting at 50 → `wait` is 40 and not 10. **Three, because one cannot tell the two readings apart**: earliest and latest agree whenever there is a single outstanding commit, which is the shape a convenient fixture has. Then a repaint with nothing outstanding → `wait` is 0, not negative and not the previous frame's — a stale mark reports the wait of a frame already served.
- **T3.2** (I9): five frames into a ring of 1 → `timeline` holds one, `dropped.frames` is 4 and `frames` is 5, asserted **separately** because a sum over held-plus-dropped is satisfied by redistribution. The one held is the newest: a bound keeping the oldest reports a session's opening as its present state. Its control is the same five frames into a ring of 16, dropping none.
- **T3.3** (I13): a sample over a window shorter than the resolution → every delay figure is below the resolution and carries it, so nothing presents a sub-floor number bare. **The row as first written asked for a different mechanism** — *the histogram is empty rather than zero-filled* — which is not built and is not what I13 says: measured, `max` is 0 and both percentiles are 0.000511 ms at a 10 ms resolution. Which of the two remedies I13 wants is F898 and is open; the row asserts the one the invariant names.
- **T3.4** (I17): `capture("heap")` at **every** tier below `deep` → rejects naming both the tier required and the tier it is on. Over all four rather than `counters` alone, because a guard written as `tier === "off"` refuses the tier a caller is least likely to be on and passes the three they are. A rejection rather than a throw: `capture` is `async`, so a caller wrapping an un-awaited call in `try` catches nothing.
- **T3.5** (I17): shutdown with a capture in flight → bounded wait, then abandonment, the abandoned capture named with its promised path, and `dropped.captures` at 1 while `dropped.captureBytes` stays 0.
- **T3.5b** (I17): a capture that finishes inside the bound → nothing marked abandoned and nothing counted. **The control**, because T3.5 alone passes on a `drain` that never waits and a `dispose` that marks everything.
- **T3.6** (I15): a recording truncated mid-stream → replay reports `truncated`, and **no divergence is raised**.
- **T3.7** (I6): a composition that throws with two spans open → the frame is counted, excluded from every duration, and both spans close at their own self times rather than being handed the frame's tail by `freezeTree`. **The `outcome` clause is recorded and cannot be read** (F899): `report()` builds `timeline` and `worst` from `drawn`, filtered to `outcome === "frame"`, so a fallback frame reaches no projection and the only published trace of it is `excluded.fallback`. The row asserts that absence, so the day a projection carries it the row fails and is rewritten.
- **T3.8** (I22): every operation after `dispose` — `commit`, `beginFrame`, `element`, `entry`, `endFrame`, `setTier`, and the probe's `count`, `mark` and `track` — then the whole report compared against the one taken before, its own `durationMs` aside. T1.14 rules the shape; this is the exhaustive arm, because a row naming three operations is green the day a fourth starts writing after dispose.
- **T3.9** (I26): a resize delivered between a span opening and closing → the span carries the opening width and the crossed-resize tag, and the new width appears nowhere in it. **A sibling span opened after the resize is asserted in the same row**, carrying the new width and untagged — without it the row passes on an implementation that tags every span and pins every width to the first one it saw.
- **T3.10** (I27): a report whose newest sample is suspended → the memory pane's headline comes from the last **running** sample, the caption says how many were suspended and that the series is not continuous, and a report whose samples are all suspended draws a refusal and no series. **`suspended` was on `ResourceSample` from the start and no consumer read it** (F900): an idle machine and a paused one drew the same picture, which is the reading I27 names. Its control is a report with nothing suspended, unchanged — a caveat on every report is a caveat nobody reads.
- **T3.10b** (I27): a sampler tick that falls inside `suspend()`/`resume()` takes the flag from the lifecycle rather than from its caller. **Deferred**: neither method exists. `ResourceProbe.sample(suspended: boolean)` takes it as a parameter and the only caller passes a constant, so nothing can put the session into the state this row is about.
- **T3.11** (I29): a `livefetch` trace whose function rejects → the span is recorded at its real duration, the rejection reaches the caller **by identity**, and the function was called exactly once. The span is recorded in a `finally`, because one recorded on the success path is missing for exactly the polls that went wrong — a live part whose fetch is failing would show as one that is not being fetched. The call count is the half a duration cannot give: C24 §5 owns the backoff, and a profiler re-running the call to get a clean measurement would double every failing poll against the far side.
- **T3.12** (I50): a profiler lowered to `off` and the view opened → raised to `spans`; closed → `off` again. The arm T1.16d does not construct: `off` is the one tier a restore to *the tier before* and a restore to *counters* disagree about.
- **T3.13** (I50): the view opened at `counters`, then `dispose()` against a **live** profiler → the timer is disposed (no later tick changes the layer), the tier is still `spans` with `setTier` called once and upward only, and `timeline` is unchanged; `pop()` afterwards is `false` and emits nothing. **Opened at `counters` because at `spans` there is nothing to leave**: a dispose that restored would call nothing there and the row would be green either way. **Leaving the tier is the ruling, not an omission** (§9b S5): at `stop()` the profiler is disposed first so a restore would be a no-op, and where it is not, a restore resets a ring the report has not been taken from.
- **T3.14** (I51, I26): the region shrinks under an open view → the layer's content is unchanged until the next tick, and the tick re-windows it to fit the new region; the view raises no commit for the resize itself. **Both halves**: the first is the cost §9b S8 records — up to one interval of C15 clipping — and the second is what stops a fix that redraws on resize from arriving as an unbracketed frame.

### Tier 4 — integration

- **T4.1** (I1): a real session with `profile` absent → the bytes it writes are identical to those of a session built with `tier: "off"`, and a session at `spans` writes something else. **`tier: "off"` rather than `profile: undefined`**, which `exactOptionalPropertyTypes` will not let a caller write and which is the same object to the runtime anyway; *absent* against *off* is two different configs that must build one session, and the gap between them is where the defect was — the gate read `profile !== undefined`, so an explicit `off` built the recorder, started the loop monitor and connected a GC observer for an application that had asked for nothing.
- **T4.2** (I7, I8, I24): a real session appending twenty entries and scrolling → `byEntry` names twenty ids, `byKind` names the kinds present, and both are work-only. **The `nothing-changed` zero is not asserted here**: D2 rules it deterministic only over a replayed input, so it is T5.4's and a live session cannot carry it.
- **T4.3** (I4): five stream commits inside one 33 ms window, then the frame that serves them → `wait` is the window measured from the **earliest unserved** commit (I5) and not the gap since the last, `work` is the composition alone, and the two are different numbers. The next frame's `wait` is zero, because nothing was outstanding when it began. **Driven by commits rather than by a real throughput**: the rate is not the subject, the coalescing is, and a row depending on 1 000 lines/s measures the machine.
- **T4.4** (I12, I49): a real graph built with a profiler and the frame bracket `session.ts` supplies (`beginFrame(reason)` … `endFrame("frame")` around `render`), the profiler view opened through the graph → the frame its refresh raised is excluded and `excluded.selfInflicted` is non-zero; a `switchPane` through the graph — the redraw in place that the timer and the keys share — raises one more excluded frame and the histogram does not move, because `open` brackets its own push and a row that stopped there passed with the shared bracket removed. **The control is a keystroke**: a byte through stdin raises a frame the reader waited on, and `excluded.selfInflicted` does not move for it. **Live since the drawing round.** The origin travels with the *call*: `profiler.own(fn)` marks every commit raised inside it, synchronously and depth-counted, and the commit seam reads the bracket rather than inferring an origin it was never handed — the block id that would distinguish a self-raised frame is C23's and does not travel with a commit. The seam in `construct.ts` is unchanged from the day it passed `false` unconditionally; what changed is that something now brackets. T1.88 asserts the mechanism at the recorder, T1.92 at the view, and this row through the root's decorated scheduler.
- **T1.88** (I12): commits raised inside `profiler.own` count as the profiler's, one raised outside does not, and a frame mixing the two is **not** self-inflicted — I12 says *every* commit, and a rule reading *any* is satisfied by the first. The bracket restores its depth when the function throws, because a surface that threw mid-refresh would otherwise have every later frame excluded from the histograms as the profiler's own: a measurement that quietly stops measuring.
- **T1.89** (I14): the drive waits for the frame a recorded event produced before sending the next — the fixture answers one tick later, so a driver that fires everything at once is distinguishable from one that paces. Firing without waiting leaves `stalled` at the recorded frame count, which is what four of F912's five divergences looked like from the frames alone.
- **T1.90** (SS14, A03): `replay.ts` reaches no stream. The one file on SS14's allow list that holds a cursor literal is asserted to write nowhere — the allow entry says *comparison only*, and this is what makes that a checked claim rather than a comment.
- **T1.91** (I48, F912): the `exit` listener is added only when a recording exists, and calling it — never `process.exit`, which would take the runner — flushes a pending clock batch and writes `end` last. Ten reads against a `FLUSH_EVERY` of 512, asserted **unwritten** before the listener fires, so the flush is shown to move something rather than assumed to. This row exists because the mutation had none: deleting the hook was carried in `c28-profiler.mjs` as an absence with a reason, its only witness a tier-5 row the harness cannot run — tier 5 executes against `dist/`, so a `src/` mutation is invisible to it without a build per mutation.
- **T4.5** (I28): a real graph's `lifecycle.suspend()` … `resume()` with the sampler ticked by hand → the samples inside the interval carry `suspended: true` and the one after does not; a refused `suspend()` leaves the flag clear; and the control — a profiler no lifecycle tells — marks nothing. **Driven through the lifecycle the root decorates, not through `setSuspended`**, because a row calling the setter passes on the day nothing calls it, which is the state the tree was in (F903).
- **T4.6** (I50, C15 I25, with C16): the view opened on a real graph at `counters`, then `⌃c` as bytes through stdin → the ladder's `pushedView` rung pops the layer through C15, the stack is empty and the tier is `counters` again. **Driven through the decoder and the router**, because a row calling `overlays.pop()` itself passes on the day the ladder stops reaching it, and the rung is the one caller that never asks an owner.
- **T4.7** (I50, I51, with C16): the same view, `n` then `Esc` as bytes → `n` changes the layer's content to the next pane's and `Esc` reaches this owner through `viewPop` — stack empty, tier restored — rather than the document view's `pop`, which is the owner `keys.ts` asked first before this round. **Both keys through the keymap**, so the row fails the day the third owner falls out of `keys.ts`'s dispatch while the bindings stay in `/help keys`.
- **T4.8** (I50): the view open on a real graph, then `lifecycle.acquire()` and `release()` — the cleanup the session runs at `stop()` → the view's timer is disposed and no later tick changes the layer, the tier is left raised, and a `pop()` afterwards is `false`. The order the session uses is asserted rather than assumed, because a cleanup that restored the tier would be green here and would reset the ring before `onReport` in any caller that ran it first.
- **T4.9** (I51, C09 I49, with C22 I49): the view on a graph whose `capabilities` override says `unicode: "ascii"` → the layer's regime row carries the ASCII separator; the same graph without the override → `·`. **The capability record the view hands over is `detection.capabilities`, resolved after C22 I49's overrides** — a view reading the environment for itself, or taking `profilePane`'s default, is F124's second derivation and F828's wide cell.

### Tier 5 — e2e

- **T5.1** (I14): a recorded PTY session that types, submits, streams, scrolls and resizes → replayed, the frames are **byte-identical** to the recording's, over every frame it holds. The recording is asserted whole (`truncated` false) and the drive's own counters beside it — `stalled` 0, `exhaustedAt` null — because the frames came out byte-identical over six of eight while all eight waits stalled, and a stall is a 500 ms pause, which is what the sleep-driven driver did anyway (F912).
- **T5.1b** (I14): the same session recorded at `counters` → identical, with **no cost cell** in any recorded frame — below `spans` `CLOCK_DERIVED[0]` matches nothing, which is the control for T5.1's mask — and `masked > 0`, because the header's time-of-day is drawn at every tier and is what the mask excuses, on both sides. The row's first form said *nothing masked* and was green for exactly as long as the header member of `CLOCK_DERIVED` was dead (F964).
- **T5.1c** (I14): recorded with a 1 000 ms pause between the answer and the resize, so that a wall-clock second boundary always falls between the answer frame's last read and the resize repaint's header read → `consumed.wall === recorded.wall`, and identical. Without a transport stand-in that reads the clock where C06 does the row is red on every run — 52 consumed against 54 recorded, diverged at the resize repaint's header (F963). The pause *is* the window, which is why the row takes it as a knob rather than waiting on a race.
- **T5.2** (I14): the same recording replayed twice → the two runs' frames are identical to each other.
- **T5.3** (I37, A01 Appendix B): `make profile` against `dist/` through the public surface → all six Appendix B rows — **four measured and two refused** — with the verdict and the regime beside them. This row said *three* until the appendix was actually filled; four are answerable from a report and the count was written before anything computed it.
- **T5.4** (I8): the T5.1 recording replayed twice → the **whole** `misses` map is equal across the two runs, and no cache reports a `nothing-changed`. `misses` is `cache → reason → count`, and this row read it as `reason → count` for as long as it existed — `misses["nothing-changed"]` asks for a cache by that name and is `undefined` on every run (F913). Determinism over the map holds whatever the counts are; the absence is the substantive half, and it is an absence rather than a zero because the recorder omits a reason that never fired (I13). On a replayed input this is deterministic, which is the only regime in which asserting it is honest (D2).

### Tier 6 — fail-on-revert

- **T6.1** (I4): a frame waiting 90 ms and working 6 → `wait` is 90, `work` is 6, and **no member of the record equals 96**, asserted over the record's own keys rather than against the name `total`, because a sum added under any other spelling is the same defect and a row checking one name sees only the name it guessed. T1.3 and T4.3 fail. **The number most likely to be helpfully collapsed by someone tidying a table**, which is why it has a row rather than a paragraph.
- **T6.2** (I3): two hundred spans, with a resource sample either side → the timing buffer does not grow by one. The durations would be right under `performance.measure`; what breaks is that every span becomes an entry in the buffer the profiler **reports** as a leak canary (I19), so the instrument becomes the largest contributor to the number it exists to watch. **Its control raises a real mark and requires the count to move**: `after − before === 0` is what a dead counter returns too, and a `timingEntries` stuck at any constant passes the assertion with nothing measured.
- **T6.3** (I6): one 40 ms frame and one 1 ms fallback → the durations hold the slow one and `max` is 40. **A fallback frame is quick, because giving up is cheap**, so a histogram that counts it improves exactly as the shell gets worse and the p95 a reader quotes is best on the sessions where composition kept failing. T1.6 is what fails.
- **T6.4** (I7): a group taking 3 ms of its own around a 30 ms plot → the group's `self` is 3, the plot's is 30, the tree still keeps the group's 33, and the heaviest row is the plot. The revert is the easier number and it is **true**, which is what makes it durable: the group really did take 33. Every tree then has its root as the widest bar and the answer is always *the thing containing everything is expensive*. T1.7 is what fails.
- **T6.5** (I11): a frame at `counters` → `latency` and `spans` are absent while `counters["frame.input"]` is 1. The revert makes the report's shape constant, which is what a consumer and a type both want — and it makes *nothing was measured* and *everything was instant* the same report, of which the second is the reading a zero gets. The counter assertion is what separates the absence from a tier that recorded nothing. T1.5 is what fails.
- **T6.6** (I1): the same calls at `off` record nothing — no frame, no node, no counter — **and the same calls at `counters` do**. The second half is the row: every assertion about `off` is equally satisfied by a recorder that does nothing at any tier, so without the control it proves the tier works by proving the profiler does not. This is the control that produced F894. T1.1 and T4.1 are what fail.
- **T6.7** (I18): a 100 ms frame, `setTier` at 150, then a 2 ms frame → the ring holds one frame, its work is 2, and `regime.ringReset` is 150. Losing the first is the point: the two were measured under different instruments and a percentile over both **describes no session that happened** — not wrong about either half, but about a session nobody ran. The reset moment is named so a reader seeing one frame in a long session does not conclude the session was short. T1.12 is what fails.
- **T6.8** (I15): reporting a truncated recording as a divergence → T3.6 fails, and the failure names the false-positive it would have caused.
- **T6.9** (I24): folding `wait` into `byEntry` → T1.17 and T4.2 fail. The same hazard as T6.1 one level down: an attribution table with a latency column in it reads as more complete, not less true.
- **T6.10** (I27): drawing a suspended sample as 0 rather than as a gap → T3.10 fails. A zero in a utilisation series is a reading, and this one is an absence.
- **T6.11** (I42): dropping the entry from the aggregate's key → T1.67 fails, and T1.17's `byEntry` has one row per block id rather than one per entry. The mutation is what a reader would write believing `kind#id` were an identity, which it is within one document and only there (C04 I14).
- **T6.13** (I45): moving `rule.label`'s gauge below the `truncate`, or gauging `wrapped[0].length` in place of `wrapped.length` → T1.78 fails. **The mutation is the natural line rather than a mistake**: gauging what was drawn is what a reader writes, it is a true statement about the frame, and it answers a different question from the one the gauge is for.
- **T6.14** (I45): deleting any one kind's gauge → T1.77 fails and names the kind. And deleting the *scan* — replacing the gauge set with the kinds themselves — → T1.77 still fails, on the count, because the row asserts both.
- **T6.15** (I15): comparing the recorded and replayed frame counts and calling the difference a divergence → T3.6 fails, and the failure names the false positive: a stream the recorder never saw the end of is reported as the framework not being a function of its inputs.
- **T1.86** (I14, I15): a recorded frame carrying a clock-derived cell against a replayed write that only moves the cursor → `elided`; the same recorded frame against a replay that painted something → not. **Both halves, because either alone is satisfied by an ordinary divergence.** The condition is unreachable from tier 5 now that the recording's tail is flushed, which is why it is constructed here.
- **T1.87** (I14): two times of day compare equal and both sides are counted masked; a duration in a document does not. **The blind spot is asserted rather than left to be found**: `formatClock`'s narrow `HH:MM` form under 80 columns is indistinguishable from a duration, so the mask covers `HH:MM:SS` only — the widened pattern swallowed `took 12:30 to build` on both sides, and this row is what found it. A mask that eats a document's own text hides divergences everywhere; this one only fails to excuse a frame in one regime.
- **T6.16** (I47): recording the capability verdict on the regime line and handing it to the replay instead of re-deriving it → T1.83 fails, and so does this row, which names both halves: the regime line **on disk** carries exactly `t`, `node`, `tier`, `name`, `binary` and `env` — compared by equality, so a verdict under any spelling fails it — and one recording replayed under two environments hashes to two byte streams, which no replayed verdict could produce. **It lives in `test/e2e/profiler.test.ts`, not the tier-6 file**: the revert is only observable against a detector that ran, and a unit row asserting the *absence* of a field on `Recording` is what TypeScript already checks. The mutation is the obvious saving rather than a mistake, and what it removes from the gate is the whole of C02. (Numbered `T6.16b` from `4b4916e2` while the test that carried it said `T6.16`; there was never an `a` — F950.)
- **T6.12** (I43): reporting `live` with no floor, or asserting `finalised === created` → T1.71 fails. The revert is the natural row rather than a mistake: *everything registered was collected* is what a reader writes, it is red by exactly one for ever, and the fix that follows is to widen the assertion until it cannot see anything.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| The terminal's own processing time | deferred. Nothing in `src/terminal/` queries the terminal (design M10), so it needs a new `escapes.ts` export and a reply the decoder does not swallow. Grep `escapes.ts` for a report export |
| Cross-session persistence, and a `calendar` pane with it | the ring is bounded and in-memory; `make profile`'s NDJSON is the durable form. Grep `ProfileReport` for a `sessions` member |
| Flame graphs of the far side's work | needs a far-side profiling protocol; B1–B8 carry none |
| Instrumenting inside an L1 or L2 unit | §1's blind spot. Decoration first; if it proves too coarse that is a measurement rather than a guess |
| What is drawn | C09, C11, C12. C28 produces the report; the panes are a composition over it (C22) |
