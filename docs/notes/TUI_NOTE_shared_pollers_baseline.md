# F91 — shared pollers: what was measured before anything changed

Tier 3, row 2. The instrument is `tools/bench/pollers.mjs`, run by hand inside the
devcontainer against `dist/`. Nothing in `make all` runs it: it sleeps on the real clock and
counts what a driver did in that window, which under contention is a flake and not a gate.

---

## 1. The six targets, before

```
check   EXIT=0
enforce EXIT=0
audit   EXIT=2      <-- see below
test    EXIT=0
golden  EXIT=0
e2e     EXIT=2      <-- F133, 44 rows, one cause, predates the row
```

**`audit` is red and it was green when row 1 closed.** Not a regression in this repository:
`npm audit` re-reads an advisory database, and `nanoid <3.3.17` (GHSA-2v37-7h3g-55p8, high)
was published against a version already in the tree. It is a **known red on both sides of
this row's diff**, standing alongside F133, and it is a dependency question rather than a
correctness one. Recorded here because a target that changes colour between two rows for
reasons outside either is exactly what an exit code cannot tell you.

**Read the counters, not the statuses.** `e2e` is 44 failed / 50 passed / 7 todo at the
baseline; anything other than that number moving is this row's.

**After, per target:**

```
check   EXIT=0
enforce EXIT=0
audit   EXIT=2      <-- the same advisory, unmoved
test    EXIT=0      2605 -> 2618 passed, 2 todo
golden  EXIT=0
e2e     EXIT=2      44 failed / 50 passed / 7 todo — F133, identical
```

**Two rows failed on a contended run and pass alone**, both of them source scans taking
19–21 s against a 15 s timeout while an `e2e` run held the machine (C01 T2.8, C21 T2.4). The
earlier row 1 flakes were the same shape. Recorded rather than smoothed over: a timing row
that only fails under contention is a fact about the harness, and the honest form of it is
the number and the condition rather than a re-run reported as the result.

---

## 2. The divergence, and it reproduces

Two `b.live` parts, one logical source, each with its own `fetch` — which is precisely
`examples/docker/src/container.ts:288` and `:301`, both running
`docker container stats --no-stream --format json <id>` every 2 s. The counter stands in for
the far side moving between two spawns; it is the cheapest possible model and the one that
cannot be accused of measuring subprocess noise.

**Read from one frame:**

```
ALPHA and BETA, from one frame: 19  vs  20
THEY DISAGREE by 1 — two views of one source, different numbers
```

**That is F91's correctness half, on screen, in a single composed frame.** The step existed
to be able to falsify it — *if the two cannot be made to disagree, the row is a performance
row* — and it did not falsify.

**The fixture was shown to respond first.** A part that never ticks renders its loading `-`
and would report two panels in perfect agreement, both dead. The guard checks the fetch
count and refuses a `-` before any number below is read.

---

## 3. The poll rate, on screen and scrolled off

```
on screen:   20 fetches / 1000 ms = 20.0/s across 2 parts
scrolled:    20 fetches / 1000 ms = 20.0/s
```

Two parts at a 100 ms interval is **twice the declared rate for one logical source**. In the
reference app that is 60 `docker container stats` spawns a minute for one container where 30
would do.

**The second row is identical by construction, and that is the finding rather than the
measurement.** `refresh.ts` holds no visibility check of any kind — its only `viewport/`
import is `TranscriptStore`, and the two occurrences of *"visible"* in the file are comments
about something else. Scrolling cannot change the number because nothing consults the
viewport. The measurement is here so the claim is a reading and not an inference.

---

## 4. Three consequences checked rather than assumed

The brief listed four consequences as falling out of the design. Three were checked before
anything was built on them; two of the three moved.

**`viewState` is in no key, because no view state reaches `render`.** `LiveSpec.render` takes
`(data, ctx)` where `ctx: ProducerContext` is `{ width, height, capabilities, measure }`
(`src/data/adapters/types.ts:52`), `height` is `null` on this route by C23 I34, and `capabilities`
is resolved once per session. Expanded/collapsed/selected reach a live part **nowhere**. So
the render memo's key is **(sourceVersion, width)** and the third component of the brief's
`(sourceVersion, viewState, width)` has no subject.

> Recorded exactly as row 1 recorded `ctx.tick`: **the day view state reaches a part, this
> key is wrong again.**

**"One batch, one commit" is very likely already true, and the reason is C03.** `stream` is a
*coalesced* commit reason with a 33 ms window (`terminal/frame-scheduler.ts:47`), so two
parts resolving together already produce one frame. What two patches still cost is two `rev`
bumps and two C14 invalidations, and only the last composed frame is ever rendered. **The
consequence is expected to be a recorded negative** and is measured at the end rather than
claimed at the start.

**`assignOffsets` staggers within one `declare(host, parts)` call and no wider.** So two
hosts declaring parts today are not staggered against each other at all — C23 I20's *no two
declared parts fire in the same tick* is satisfied per call and not per session. Sources are
session-scoped, which makes the stagger **wider as well as smaller**. That is an improvement
this row gets for free and it is also a gap C23 I20 currently reads as covering.

---

## 5. What the finding itself got wrong

**`/stats` does not exist.** F91 names *"the landing dashboard, `/stats` and a
single-container panel"* as the three sharers. `examples/docker/src/manifest/read.ts:59`
reserves the name deliberately — the verb is `container stats` *"so that `/stats` stays
free"* — and no manifest declares it. The instrument is *ask where a settled claim was
written down*, and it has now disproved four claims and produced four.

**The finding survives with a better-measured sharer**, and the replacement is narrower and
checkable at file and line: `container.ts:288` and `:301`, two parts of **one document**
running identical argv every 2 s. The dashboard's `docker stats` (all containers) is a
*different* fetch from the drill-in's `docker container stats <id>`, so those two were never
sharers and no amount of source-sharing would have made them one.

**And the ordering finding, which is row 1's mirror.** `createCpuTick`
(`container.ts:227`) pushes into the ring **inside the fetch**, and its own comment says why
the sample must not land in `render` — a render failure would lose it. So `cpu`'s fetch has
a side effect and `io`'s does not, and **sharing one fetch between them silently stops the
ring**. Stage 1 therefore has no consumer in the reference app until stage 2 exists. Row 1's
danger was a stage that landed alone and flattered itself; this row's is a stage that cannot
land alone at all.

---

## 6. After — the same instrument, the same build

`tools/bench/pollers.mjs` takes the mode as a flag rather than a checkout, so both
columns are one `dist/`:

| | polls / s (2 parts) | the two panels, from one frame | off screen | back on |
|---|---|---|---|---|
| a source each | **20.0** | `19` vs `20` | **0.0** | 20.0 |
| one shared key | **10.0** | `10` and `10` | **0.0** | 10.0 |

**The correctness half is closed on the frame and not on a counter.** Two panels of one
document, read from a single composed frame, carrying one number where they carried two.

**The pause reaches both rows, which is the Q2 ruling working.** `own` polls nothing off
screen either, because C23 I46 applies to every part and not only to those declaring a `source`.
A part accumulating inside its `fetch` was already broken by §3c's rule; pausing surfaces
that rather than causing it.

**And the off-screen leg needed a second entry to be askable at all.** Visibility is per
*host*, so the live parts and a filler block inside one document are one entry and an entry
with any row on screen is visible. A first draft sent `⌃Home` on a two-row transcript,
scrolled nothing, and reported the pause as absent — the fixture agreeing with itself. The
guard that caught it checks the filler is on screen before the number below it is read, and
it fired twice: once for the scroll, once because a local handler returning `{blocks}` alone
is a document C04 refuses and `appendAndCommit` swallows. **F135's shape, third instance, in
the instrument built to measure something else.**

## 7. The reference app, read through a PTY

`docker container stats dtui-web`, fourteen seconds, counted with a `docker` shim earlier on
`PATH` that logs its argv and execs the real one — counting invocations rather than
processes, because processes race.

```
before   7 × container stats --no-stream --format json 2e6210b77167
after    4 ×
```

**And the plot has no gap.** `4 ticks · 2s each` on both sides, the curve accumulating —
which is the migration read the ring's move from `fetch` to `derive` had to survive. What it
does *not* survive is F137, and that is filed rather than absorbed: a fold runs on a version
and a version exists only when the fetch resolved, so a poll that failed at the transport is
no longer counted as an attempt.

## 8. What the row found that nothing failed on

Six, and the split is the argument for the instruments rather than for the assertions:

| how | what |
|---|---|
| ask where a claim was written down | `/stats` does not exist; F91's three sharers are two, in one document |
| reading the source before building on it | `createCpuTick` accumulates *inside* the fetch, so stage 1 has no consumer without stage 2 |
| writing the test the spec named | the cadence refusal threw into a bare catch: **two panels at `◌ loading`, silently, for ever** |
| a row, not the walk | a conflict *inside one* `declare` call compared itself against an empty map |
| a row, not the walk | `/clear` deleted hosts from the map directly, bypassing the only teardown path |
| an enforcement rule firing | MG24 matched `Source.derived` against C08's unrelated `VerbRatio.derived`, by name and not by owner — F136's class, fourth instance |

**Two of those are about the *reader* and neither artefact indexes the reader.** §8a A4's
lesson says a ruling can be correct about an interaction and wrong about a mechanism the
layer below does not have; the walk asked what a throw *leaves behind* and never asked **who
sees it**. That question has no row in a sequence trace or a classification table, because
the person reading the screen is not a rule.

## 9. Still owed

- **Staleness is per part and the data is per source** (§8d D10). Two parts on one
  `sourceVersion` can disagree in their titles, because `lastOk` is the part's. Moving it is
  a decision about C23 I35 and taking it from inside a sharing change would be deciding one
  invariant to suit another.
- **F137** — a fold cannot count an attempt that failed. The remedy widens `derive` to the
  failure path, which is a §3c ruling.
