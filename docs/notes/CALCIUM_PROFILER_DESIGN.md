# The profiler — design, measurements and both walks

**Status: design, 2026-09-06. Not yet spec'd.** Branch `feat/profiler`, from `main` at `f00c53c2`.
The three findings this note's §1 measures are **F862**, **F863** and **F864**, landed first because
SP5 refuses a document citing a number the ledger does not carry — which is the rule working: the
first draft of §6 promised four findings and one of them was *"the deferral's condition is still
unmet"*, which is the expected outcome of running a habit and not a defect. It is M1 instead.

**The gap was measured a week ago and deferred with its blocker named as a symbol.** F395
(`90e9a273`) asked for a live dashboard profiling Calcium's own frame time and answered it by
measuring what an application can see rather than by building anything: cadence is observable
through `ChromeContext.now`, cost is not, and the cost half was deferred on *a recorded frame
duration on `ChromeContext`*. **That habit has now been run** — M1 below — and the condition is
unmet, so this is the entry being picked up rather than a new idea.

**What the architecture already owes.** A02 §7 states six performance budgets, A02 commitment 16
says they are *measured in M-T3, not asserted*, and A01 Appendix B is the table they fill under a
commitment that it be *measured, not estimated*. Every Layer A cell in it is empty (M2).

**The arc.** One profiler, five tiers of cost, instrumenting by **decorating seams the composition
root already owns**, so that nothing below L4 changes. Its headless face fills Appendix B from a
real run; its in-app face is a document of `b.live` parts over C12 forms; and underneath both is
**deterministic replay**, which is what makes any timing figure comparable at all.

---

## 1 · Measurements

Each row names the test that would fail if it were false, on the rule that a design measurement is
a claim until a row runs (F838). Rows marked **here** were run on 2026-09-06 in `calcium-dev`
(node v22.23.2) and their figures are in the row; rows marked **spec** are written into the spec
commit as `it.todo`.

### The tree

| # | measured | figure | falsifying row |
|---|---|---|---|
| M1 | F395's deferral condition, re-grepped | `ChromeContext` (`shell/types.ts:82`) carries `session · now · columns · copyMode` — **four members, no duration**. The deferral stands | here; C24 T2.x asserts the member once it lands |
| M2 | A02 §7's six budgets against the suite | **three measured, one in half, two not at all.** Keystroke→frame (T5.2), streaming's fps and CPU halves (T5.1), idle CPU (T5.6) hold. Resize's *zero corruption* half is asserted by T5.4 (one width per frame, right height, not empty, not the fallback) and its *< 33 ms* half is not. **Command-commit→frame has no assertion anywhere.** **Page Down through 10 000 blocks reads no clock** — `test/e2e/viewport.test.ts:12` asserts rows match at every screenful and that `screens > 400`, and the `30_000` beside it is a vitest timeout. Every budget that is measured is taken from outside, through a PTY | here; F862 |
| M3 | the clock seam | SS1 (`source-scans.mjs:24`) bans `Date.now`, `new Date`, `performance.now` and `process.hrtime` across `src/` with **one** allow: `src/shell/session.ts`, whose own header says *"This file is A03 SS1's entire allow-list."* `Ambient` is `{ clock, cwd, fs, schedule, platform }` (`config.ts:162-180`), built in `ambient()` (`session.ts:121-133`), merged at `config.ts:231` | here; C22 T2.4 |
| M4 | there is no monotonic clock anywhere | grepped `performance.now`, `hrtime`, `monotonic` across `src/`: the only hits are doc comments. `RenderContext.tick` is an integer step count, not a time source | here; the `elapsed` seam's own row |
| M5 | the frame is one composition | `composeFrame(deps)` (`render-frame.ts:88`); SS48 allows exactly `render-frame.ts` and `paint.ts` and exists to keep it one. The path is `#render` → `composeFrame` → `compose` → `paint` → `body` → **one** `writer.write` per frame | here; C22 T2.x, SS48 |
| M6 | the diff is O(rows), not O(cells) | `body()` (`render-frame.ts:168-187`) compares each row to the previous frame's same row by string equality and emits `cursorTo + SGR_RESET + row` only for changed rows. It is not C25, which renders the git-diff *block* | here; no new row — a correction to the plan's first draft |
| M7 | what is already counted | **ten diagnostic members across six components**, every one readable and none aggregated: `blockCount`, `droppedBlocks`, `overCap` (`transcript/store.ts:69,73,77`), `CompletionEngine.inFlight` (`engine.ts:71`), `InputRouter.lastStages` (`router.ts:121`), `undoDepth`/`redoDepth` (`editor/editor.ts:163-164`), `Pipeline.liveStreams`/`inFlight` (`shell/types.ts:175,173`), `Viewport.stats` (`viewport/types.ts:120`). **Two caches count their size and neither counts a hit** — `HeightCache.size` (`cache.ts:32`), `RenderCache.size` (`render-cache.ts:115`) | here; F863 |
| M8 | the debug sink is complete and unfed | declared `ConstructDeps.debug` (`construct.ts:250`), **forwarded** at `:986` and `:1011`, **seven** real narration sites — `lifecycle.ts:361,475,520,659` and `runner.ts:72,339,345` — and `Session.start()` passes `stop · render · repaint · frame · onFatal` and **not** `debug`, so all seven are no-ops in every real session. `construct.ts:1235` reasons *"SS33 bans `console.*` and the debug sink is C01's"* while nothing feeds it. `TuiConfig.debug` (`shell/types.ts:481`) is a **homonym**: payload retention | here; F864 |
| M9 | the uncached hot path | `registry.measureSequence()` runs **every frame regardless of cache state** — measurement is not gated by `RenderCache` — and the header and footer have no `RenderCache` coverage at all, so both go through Ink every frame. This is F395's third miss | here; **spec** — the `measure` span is what prices it |
| M10 | nothing queries the terminal | grepped `escapes.ts` and `lifecycle.ts` for a report or reply path: none. The exports are modes and cursor movement only. §7's round trip is therefore new machinery, not a wiring change | here; scoped last, §7 |
| M11 | there is no env switch and there must not be | SS10 bans `process.env` under `src/` with **zero** exceptions; SS33 bans `console.*` outright; `config.ts:99` and `data/transport/factory.ts:8` refuse `CALCIUM_*`/`PRISM_TUI_*` toggles by name | here; SS10, SS33 |
| M12 | the replay precedent already exists | `src/data/fixtures/record.ts` records by **composing over** the transport rather than spawning for itself, and says why: *"recording cannot drift from replay: there is no second implementation of what a run looks like."* One of the four seams replay needs is already done, by the technique the other three want | here; C08's own rows |
| M13 | what can be drawn | `PlotForm` (`data/viewmodel/types.ts:1185`) carries **48** members, including `bullet`, `forest`, `dumbbell`, `slope`, `funnel`, `autocorrelation`, `latency`, `utilisation`, `icicle`, `waterfall`, `horizon`, `ecdf`, `spectrogram`. `sparkline` and `valueBar` are exported functions (`plot/index.ts:22-23`) | here; the panes' own rows |
| M14 | the capture directory needs no `.gitignore` change | `.calcium/` is ignored **twice**: `.gitignore:11` in this repository, and **C22 I67** — `stateDir` is created holding a `.gitignore` of `*`, so a consuming project's own rules cannot expose it. Re-read while writing the spec: the line is 11 and the section is I67, not `:12` and not §3 (§3 is Construction order) | here; no row |

### The Node surface the profiler sits on

Run in `calcium-dev`, node v22.23.2, 2026-09-06. **Each figure that could be an artefact of the
probe has a control**, on the rule that an instrument written before its subject measures its own
guess (and that a probe reading zero in every case is a broken reader, not an absent mechanism —
the first pass of this probe did exactly that, twice).

| # | measured | figure | falsifying row |
|---|---|---|---|
| M15 | `performance.now()` is fine enough to time a paint | smallest non-zero delta **41 ns**; **50.8 ns** per call. Ten spans is ~1 µs a frame | here; **spec** — the instrument's own fixture times a known 5 ms wait |
| M16 | the resource reads are periodic, not per-frame | `process.memoryUsage()` **2 521 ns** · `memoryUsage.rss()` **1 863 ns** · `process.cpuUsage()` **367 ns**. At 1 Hz this is nothing; at 60 Hz `memoryUsage()` alone is 151 µs/s | here; the sampler's cadence row |
| M17 | **the loop-delay histogram's floor is its own sampling resolution** | idle: p50 **2.00 ms** at `resolution: 1`, **13.00 ms** at `10`, **21.00 ms** at `20` — the reported delay tracks the interval, not the loop. **Control**: loaded at `resolution: 1` against a deliberate 60 ms block, `max` **61.15 ms** and `min` **0.01 ms** — the instrument responds exactly, and only its floor is its own | here; **spec** — the row asserts idle p50 ≈ resolution and loaded max ≈ the block |
| M18 | GC kinds are numbers, not names | `MINOR=1 MAJOR=4 INCREMENTAL=8 WEAKCB=16`; all four observed in one run (`1×10 8×1 4×3`). A `Record<"minor"…>` needs a translation table, and writing the union without one would have been a type that never populates | here; C28 T1.x |
| M19 | **F853's canary is real, and its cost grows with the leak it watches** | 1 000 `mark`+`measure` = **+2 000** entries, persisting until `clearMarks`/`clearMeasures`. Reading `performance.getEntries().length` costs **3 µs** at 0 entries, **83 µs** at 2 000, **449 µs** at 10 000 | here; C28 T3.x |
| M20 | leak counting converges | `FinalizationRegistry` over 1 000 objects: **1 000 finalised** under `--expose-gc` after two collections | here; the leak row, which names `--expose-gc` as the guarantee it leans on |
| M21 | a heap snapshot is the large hammer | **5.4 MB** and **314 ms** on a near-empty process — a floor, not a typical figure | here; the `deep` tier's size cap |
| M22 | allocation sampling is the cheap churn instrument | **78.2 KB** profile, **1 962 samples**, **35.1 MB attributed** over 400 000 retained objects; whole start→stop cycle **36 ms**. **Control**: the top site came back named with a byte figure (`(anon):35 945 KB`), which is what the first pass could not read | here; the `alloc` tier |
| M23 | a CPU profile is cheap to take and its size scales with the run | `Profiler.stop` returned in **1–3 ms**; frames come back **named** — `(root), fn, post, outer` — so the reader works. **No fixed size is recorded**: a 20 ms workload gives 1 KB and 7 nodes, which is a property of the workload and not of the instrument | here; no size claim is made |

---

## 2 · Rulings

**R1 · Decorate the seam; do not instrument the unit.** SS1 and SS4 (M3) forbid a clock in L1 and
L2, rightly. Every boundary is already a function or an interface handed down from L4 — input,
clock, timer, transport, `measureChild`, `write`, `composeFrame` — so decoration reaches all of
them with **no import edge, no new L0 half, and no change below `src/shell/`** except integer
counters. The precedent is A02 Seam 1's own wording: *the registry passes itself, so no kind
imports the registry*.

**Its blind spot, stated.** Decoration measures a unit from outside. `figure.ts` is 3 747 lines;
decoration says *the plot cost 8 ms* and cannot say which part of it did. That is the `deep` tier's
job, and the span tree is not claimed to be complete.

**R2 · Work, wait and total are three numbers and are never summed.** C03's window is up to 100 ms
by design; a wait reported as work reads as a slow renderer. `work` is the framework's efficiency,
`wait` its policy, `total` what the reader experiences. Carried by a fail-on-revert row rather than
by this paragraph, because two columns that add up look like a column that is missing.

**R3 · Deterministic metrics assert; timing metrics report.** Group 12's rule, `scan-cost.mjs`'s
disposition, and F809's 51.14 ms rerun. Counts, ratios, miss reasons, live-object counts and
replay byte-identity assert. Durations report, beside the regime.

**R4 · No User Timing API, and watch it as a canary.** M19 measures F853's mechanism directly. A
profiler built on `mark`/`measure` becomes the defect it exists to find. Spans are raw
`performance.now()` deltas into a bounded ring; the entry count is sampled — **rarely**, because
M19 shows the read costs 449 µs at 10 000 entries, so the canary's own cost rises with its subject.
Once per ten seconds is both cheap and diagnostic.

**R5 · The observer effect is displayed, not merely handled.** Frames the profiler's own live part
caused are marked, excluded, **and shown as excluded**, or a reader watching cost rise as they open
the dashboard concludes the framework is slow.

**R6 · The loop-delay figure carries its resolution, and the p50 is not the reading.** M17: an idle
loop reports its own sampling interval. So the pane draws `max` and the high percentiles, prints
the resolution beside them, and never shows an idle p50 as a delay.

**R7 · A cache miss carries a reason.** Counts say the cache works; they cannot say it is broken.
The failure this framework has had is a key axis moving when nothing changed (F227). `RenderCache`'s
key already carries `id, rev, width, focus, theme` plus range and offsets, so the reason is a
comparison it can already make. **`nothing-changed` must be zero**, and a non-zero value is the next
F227 reporting itself.

**R8 · Attribution is by kind, instance and entry — and it is self time.** Container kinds measure
children whose kind they do not know, so a parent's inclusive cost double-counts its children.
Record **exclusive** time at each level and derive inclusive, which is also the shape `icicle` and
`flame` expect.

**R9 · Off costs one branch.** No probe, no ring, no sampler, no allocation — one `undefined` check
per seam.

**R10 · Replay produces byte-identical frames, or the framework has a defect.** The gate is worth
more than any timing number: if the same inputs give different frames, something is not a function
of its inputs, and that invalidates the golden suite's premise and not merely the profiler's. A
divergence stops the round.

**R11 · The precision is printed, not merely typed.** Log-linear buckets, and the report's header
carries the error bound and what the ring dropped, the way `make regime` prints the machine.

**R12 · Everything is injected.** The probe is a `Disposable`, not a bare function, because
`monitorEventLoopDelay` is stateful (M17) and a `() => Sample` hides that lifecycle. It matches
`Ambient.schedule`'s shape.

**R13 · GC kinds are translated at the boundary.** M18: the numbers are the API and the names are
ours.

---

## 3 · The classification table — the profiler at rest

Structural: cells where two rulings both hold with no event between them.

| # | cell | two rules meeting | ruling |
|---|---|---|---|
| D1 | the dashboard open at tier `off` | R9 × R5 | opening the view **raises** the tier and closing it lowers it. A pane at `off` draws a notice, never an empty plot — an empty plot reads as *measured, and zero* |
| D2 | `nothing-changed` as an assertable metric | R3 × R7 | it is deterministic **only over a replayed input**, so the assertion lives on a replay row and not on a live session. R7's counter is produced by a cache whose hit rate depends on what the user did |
| D3 | an entry's attributed cost | R2 × R8 | `byEntry` is a **work** histogram and is named so. Wait is per frame, not per entry; summing `byEntry` against `total` is nonsense and the naming is what prevents it |
| D4 | a container's measured cost | R1 × R8 | **self time, not inclusive.** `measureChild` recurses, so a parent that reported inclusive cost would count every child twice. Derive inclusive from the tree |
| D5 | a p95 over a ring that wrapped | R6 × R11 | the header states the error bound **and** `dropped`; when `dropped.frames > 0` the percentile is labelled as over-the-window, because a window presented as a session is the same mistake as a figure without its bound |
| D6 | the canary's attribution | R4 × M19's cost | it is a **count with no attribution** and says so — the profiler cannot mark, so it cannot tell whose entries these are. Attribution goes to `deep` |
| D7 | the probe's lifecycle | R12 × R1 | `{ sample(): ResourceSample; dispose(): void }`. A bare `() => Sample` cannot start or stop the loop-delay histogram, and M17 shows that histogram must be started to mean anything |
| D8 | `latency` and `spans` at tier `counters` | R2 × R9 | **absent, not zero.** There is no clock at `counters`, and a zeroed histogram reads as measured-and-fast. The report omits the key |
| D9 | a frame with two commits, one from the profiler | R5 × R2 | `selfInflicted` only if **every** commit that raised the frame came from the profiler. One real commit makes it a real frame |
| D10 | GC kind arriving as a number nobody mapped | R13 × R3 | the translation is total over the four constants, so a fifth kind is a compile error rather than a silently dropped bucket |

## 4 · The sequence trace — event-mediated

| # | sequence | ruling |
|---|---|---|
| S1 | resize arrives mid-span | the span records the width it opened at and completes tagged `resized`. C03 sets `contaminated` at commit, so the next frame is a full repaint anyway |
| S2 | `paint` throws → `composeFrame` returns `fallback` (`render-frame.ts:107`) | **the rejection path.** The span closes with `outcome: "fallback"`, the frame is counted, and it is **excluded from the work histogram** — a fallback is a frame's absence, not its cost. Nothing in R1 implied this and no row of §3 covers it |
| S3 | `suspend()`/`resume()` spans a sampler tick | the sample carries `suspended: true` and the utilisation pane draws a **gap**, not a zero |
| S4 | `handoff()` gives the child the terminal | `process.cpuUsage()` does not include the child, so an idle reading here is false. Mark the interval; report no idle figure across it |
| S5 | shutdown with a `deep` capture in flight | M21 says a snapshot is 314 ms on an empty process. Shutdown waits, **bounded**, then abandons and says what it dropped |
| S6 | the tier changes while the view is open | histograms from two tiers must not merge: a tier change **resets the ring**, and the report says at which point |
| S7 | a mark is raised during a frame | marks are instants on the session timeline, **never inside a frame record**. The pane draws them against the frame axis |
| S8 | a recording ends mid-stream | replay ends at the record's end and reports the stream as **truncated, not settled**. Otherwise the replayed frames diverge for the recorder's reason and R10's gate reports a **false divergence** — the most expensive possible failure of this design, because it indicts the framework for the recorder's own truncation |
| S9 | two commits coalesce into one frame | `wait` is measured **from the earliest commit still unserved**, because that is the one the reader has been waiting on. Naming the observable mechanism rather than where the value is computed is C19's lesson |
| S10 | the terminal's reply arrives after the next frame (§7) | one outstanding request at a time, tagged with the frame's sequence number; a reply matching nothing outstanding is discarded and **counted** |
| S11 | a live part's `fetch` rejects while its poll is being timed | the span closes with the rejection as its outcome; C24 §5's backoff already owns what happens next, and the profiler records rather than participates |

---

## 5 · Deferred, each with the symbol that expires it

| deferred | blocker, as a symbol |
|---|---|
| the terminal's own processing time | a reply path in `src/terminal/` — M10 says there is none, so this needs a new `escapes.ts` export and a reply the decoder does not swallow. Grep `escapes.ts` for a report export |
| Chrome Trace Event export | the span set stopping moving. Grep `SpanName` for a member added since C28 landed |
| cross-session persistence, and the `calendar` pane with it | a durable store; `make profile`'s NDJSON is the current form. Grep `ProfileReport` for a `sessions` member |
| flame graphs of the far side's work | a far-side profiling protocol; nothing in B1–B8 carries one |

---

## 5a · Three rulings taken while writing the spec

**R14 · The recorder lives at `src/shell/profiling/`, not `src/profiling/`.** This note said the
latter; the spec says the former. Under `src/shell/` it is L4 by construction, so **MG1 already
forbids every layer below it from importing the profiler** — *nothing below L4 changes* stops being
an intention and becomes an enforced rule, with no new rule and no new rank.

A top-level directory is worse in all three of its forms, and **the unranked one is worst rather than
neutral**: `layerOf` returns `null` for a path with no entry in `tools/enforce/layers.mjs` — the
comment reads *outside the layer rule* — so `src/profiling/` with no entry is importable from every
layer with nothing checking. Ranked at 0 it becomes a **third L0 half**, the structure CLAUDE.md names
as most easily broken by accident. Ranked at 4 it is `src/shell/` with an extra step.

The cost is one line of bookkeeping: `C28`'s `COMPONENT_SOURCES` entry names
`src/shell/profiling/recorder.ts` and is added on the commit that makes that path real, **not before**
— a mapped path that does not exist reads as *not implemented* forever and silently exempts every
deferral pointing at it (TD3). Until then the spec-first rows carry the explicit no-blocker marker.

**R15 · Seven of this note's twenty-one walk rulings had no invariant, and now do.** Resolving §3's
D1–D10 and §4's S1–S11 against C28 §8 while writing the spec gives **twelve already carried, seven
carried by nothing, one correctly deferred (S10) and one that is a defect in a test row rather than a
missing invariant (D2)**. The seven are D1 (the view raises the tier; a pane with no data draws a
notice), D3 (`byEntry` is a *work* histogram), D6 (the canary is a count with no attribution), S1 (a
span crossing a resize), S3 (a suspended sample is a gap, not a zero), S4 (`handoff()` — `cpuUsage`
excludes the child) and S11 (a live `fetch` rejecting mid-poll). They are C28 I23–I29.

**This is *a ruling lands as a spec edit immediately* arriving one document early.** A walk's output
is a set of rulings, and a ruling that leaves no invariant behind has evaporated — but it does not
*read* as evaporated, because it is still written here. **The note is what made the misses invisible:
all seven read as covered precisely because they were recorded somewhere.** Nothing about D3 or S4
announces that no invariant carries it, and a reader checking this note against the plan would find
both artefacts present and complete. What reaches it is resolving every row against the spec rather
than asserting that the walk was carried — the same instrument as *ask where a settled claim is
written down*, pointed at one's own artefact one step before the code.

**D2 is the eighth, and it is a defect in a test row.** It rules `nothing-changed` deterministic
*only over a replayed input*; the spec's draft T4.2 asserted it over a live session, which is the
assertion D2 says cannot be made. The zero moved to T5.4, on the replay.

**R16 · The instrument's own fixture runs on the real clock, and only it does.** Every other row uses
the injected one because that is what makes a figure exact. These two give it up because exactness is
what makes them vacuous: a span measured by a clock that was *told* to advance 5 ms reports 5 ms by
construction, so the fake supplies the behaviour under test and the row passes with the timing
removed. The bound that buys the assertion is a **400× separation** rather than a percentage — M15's
50.8 ns per `performance.now()` puts an empty span near 100 ns against a 5 ms subject — so the rows
assert *≥ 4 ms* and *≤ 10 µs* and print both. A row asserting *5 ms ± 10 %* would be the flakiness
this repository has recorded four times, on a runner already measured at 2.7× this host (F809).

---

## 6 · Build order — spec commits alone, each before its code

`S1` findings F862–F864 · `S0` this note · `S2` `docs/components/C28_profiler.md` · `S3` the seams
in A02, C22, C03, C14, C24 · `C1` `src/shell/profiling/` (R14) · `C2` seams wired · **`C3` record and replay,
before the panes, because a number that is not reproducible is not worth drawing and a dashboard
built on irreproducible numbers teaches wrong conclusions with a picture's authority** · `C4`
samplers, `alloc`, `deep`, SS-P · `C5` the headless face and `make profile` · `C6` Appendix B
filled · `C7` the panes and the three surfaces · `C8` the terminal round trip · `C9` mutation,
frames, docs sweep.
