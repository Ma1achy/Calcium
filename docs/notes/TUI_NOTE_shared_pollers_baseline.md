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
