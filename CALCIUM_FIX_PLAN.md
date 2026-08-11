# The fix plan — the remainder

**A plan for what the roadmap does not cover.** `CALCIUM_ROADMAP.md` keeps its half; this is
the 3a remainder, ordered by its five tiers. Every item carries **what would fix it** — a
*change*, a *ruling* or an *audit*, said as one of those three — **which consumers proved
it**, **⚠ if it changes a public type**, and **what it depends on landing first**.

96 findings, 58 open. Against `main` at `80bd50b`. **No fixes here.**

---

## Settled, and not re-derived

- **1.1 was twelve findings behind one ruling and is now nine.** F24 and F25 sit in a
  separately ranked group and 1.1's own text names `LiveSpec.render`, which is what made it
  twelve rather than ten. **Three of the twelve — F13, F58b, F85 — are row 1, which is
  `done`**, and this line is where the stale count came from: a field written once and read
  as an estimate afterwards. Corrected in place on row 9's precedent.
- **1.1, 1.3 and 2.1 close nothing as written** — they reframe. *The ruling taken*, *the four
  mechanisms*, *the mechanism* are the work items; the entries are not.
- **The instruments tier keeps its place on the narrower claim**: not that verdicts are
  unproven — MG24 has produced zero findings and both its defects are false-negative — but
  that **its clean results are what future verdicts rest on** while three-quarters of its
  subject is invisible to it.
- **Group 10 goes to `CLAUDE.md`; group 12 stays here.**

---

## Tier 1 — instruments

| item | fix | consumers | ⚠ | depends on |
|---|---|---|---|---|
| **F83** MG24 counts a consumer outside the **component**, not the file | change | — | — | — |
| **F84** MG24 walks `export type` as well as `export interface` — 798 against 280 | change | — | — | F83 (same rule) |
| **Group 9** a fixture per instrument: known bytes in, stated frame out | **audit** | 7 | — | — · `screen.py` first |

**Why first with no consumers behind it.** A02 Seam 4 is about a component complete on its own
side; the implementation is the *same* side, so an interface in `types.ts` implemented in
`store.ts` gives every member a consumer by construction. **A rule with a perfect record of
not firing is indistinguishable from a rule that works.** 11 instruments, 1 covered.

---

## Tier 2 — public-type changes, before the freeze

**Sequenced so the unblocked work goes first.** The producer-context ruling is **nine** findings
and a design question; three more closed ahead of it as row 1 and were blocked on nothing.

| | item | fix | consumers | ⚠ | depends on | status |
|---|---|---|---|---|---|---|
| **1** | **F13 · F58b · F85 — narrow the type at the construction boundary** | change | **3** | C04 · C07 | **nothing** | **done** · `bea5fcd` `7ea1c28` `74da764` |
| 2 | **F14 F43 F54 F37 F36 F28 F77 · F24 F25 — what a producer may know** | **ruling**, then change | **9** · **F124 F125 F126** | C07 · C23 · C24 · C22 | — | **done** · `783353d` `3d9fee9` `2761b0b` `a25574a` `5af7b65` `b1b671b` `f1f8d77` `5167a49` `c4b2869` |
| 3 | F30 F49 F51 F81 — a change axis distinct from `Tone` | ruling, then change | 4 | C04 · C09 · C10 | the 1-bit rendering, decided inside it | **done** · `794547d` `1a7feab` |
| 4 | F33 F34 F18 F50 — a block cannot express what the surface needs | **ruling** | 4 | C04 | rule with F30 — three questions about `Comparison` | **done** · `37d6d74` |
| 5 | F39 · **F92** — a flag that selects a rendering | change | **2** | C05 | — · F92 waits on it | **done** · `4721e28` |
| 6 | F21 — the action dispatch route | change | 1 filed, **3 dependents** | C23 | — | **done** · `84a6db2` |
| 7 | F22 F41 F78 F23 — the builder surface | **audit**, then changes | 4 | C04 | — | **partial** · `ad9058b` — F23 open |
| 8 | F80 — `interactive` as a predicate over the invocation | ruling | 1 | C05 | — | **done** · `36fbc99` `fe7ecee` |
| 9 | F55 · **F122** — the framework's own marks | **ruling**, then changes + a rule | **6 sites** | C09 · C22 §6 | — | **done** · `7df96f0` `cfc9398` |
| 10 | F93 · **F123** — grammar registration | change ×3 | 1 | C09 · **C24** | — | **done** · `a3531a7` `860338f` |

**The status column is a record, not a claim about the remainder.** Six rows landed
before it existed, so the plan read as untouched and the next reader would have
re-derived progress from the log. `done` means the row's findings are closed and the
commit is named; `partial` names what is not — row 7's F23 was measured as F78's class
and deliberately left, because refusing `view` on a local tool would foreclose S6/S7 and
the remedy is to extend the local route.

**Every row is done and the tier is not**, which is the distinction a column of ticks would
hide: row 7's F23 is open by decision — it was measured as F78's class and left, because
refusing `view` on a local tool would foreclose S6/S7. **Row 2 was nine findings, not twelve**
— F13, F58b and F85 closed as row 1 and this line kept the old number for four commits after
the field above it was corrected. A count restated in a second place is a second unmeasured
claim.

**What row 2 cost, and what it produced.** Nine commits: the ruling alone, the obligation, the
grant, a plan correction, MG3's header, the exports, the frame unit, the golden repair, the
app. It closed nine findings and **filed seven** — F127 (MG3 has never walked `import type`,
and a green test held the blind spot open), F128 (three specs overtaken by their code), F129 (a
`view` verb that is also `local` opens nothing), F130 (the grant's own tests could not see the
grant), F131 (the golden gate red for four commits), F132 (the grant untestable from the
consuming side — the workaround was also the fixture), F133 (tier 5 red at session start, 44
rows, one cause).

**The workaround column fell by 35 lines of code and 149 lines of file**, and the smaller
figure is the honest one: four of the five removed workarounds carry more explanation than
implementation, because an unbuilt mechanism is documented more than a working one.

**Row 9's four fields were all wrong, and the direction is the one worth recording.**
It read *change · 1 consumer · ⚠ C22 §6*, written from F55's two characters — which were
measured over one app's frame. Swept over `src/` the framework draws **six** marks it does
not substitute, three of them bypassing a function that already holds their ASCII form, and
the ruling reaches C09's vocabulary as well as C22's prompt (F122).

**This is F112's shape from the other direction.** That lesson is *compounding facts are not
a difficulty estimate* — a row that reads larger than it is. This one read **smaller**,
because it was written from a symptom rather than from a sweep, and a symptom is a sample.
The fields are corrected in place rather than footnoted: tier 3 is scheduled from this table,
and an estimate nobody revises is one that gets used.

### 1 · The narrower half, and it is the plan's most useful line

```ts
Omit<RenderContext, "measureChild" | "renderChild">          // the registry overwrites both
meta: Pick<DocumentMeta, "exitCode" | "durationMs" | "verb"> // the three honoured keys
```

**Supplying a discarded field should fail to compile rather than fail to matter.** Today an
adapter computes seven `meta` values thrown away, and one caller supplies a stub that
**throws if called** — correct only because the overwrite is unconditional, with a comment as
the whole of the guarantee.

**Nothing blocks it.** It is a narrowing at a boundary, not an answer to *what may a producer
know*, and three findings closing before the hard thing starts is real progress rather than
preparation for it.

### 2 · The ruling, and the plan owes a shape

**Three corrections from measuring the nine, before the shape is argued.**

- **The count is nine.** F13, F58b and F85 closed as row 1 and row 2's field never dropped.
- **F36 is served.** `expectDocument(doc).isValid()` is public in `@fmx/calcium/testing` and
  this app already imports that entry in `degradation.test.ts`. What survives is a **stale
  deep import** in `test/documents.test.ts`, which is a workaround to delete rather than a
  gap to close. **The one open read is settled**: both uses survive the throw — the fifteen
  documents want the errors in a message, which `isValid()` throws with, and the invalid
  control asserts that it throws at all.
- **F37 is two items on opposite sides of the line.** The height request is one. The other is
  `codeRows` at `src/inspect.ts:92`, called inside `structuredBlocks` to decide splitting —
  **production logic, not a test affordance**, and it takes a width. It was filed here as an
  export and it is not one.

**The mechanism, measured rather than described.** `TuiConfig.localHandlers` requires the
handler's `ctx` to be mutually assignable with `LocalContext` (`ExactLocalHandlers`, C23 I39),
so a narrower or optional declaration is refused at registration. It inspects the **declared
parameter type** through `infer` rather than testing assignability, which is why variance does
not reach it: probed across four declaration positions — a named const, an inline arrow, an
**object method** (where parameters are bivariant) and a pre-typed record — and all four are
refused. `NoInfer` is not needed and would not add anything.

**Two of the four arms were wrong on the first draft and the probe is what said so**: a handler
taking only `argv` was refused, because `infer C` on a one-parameter function yields `unknown`;
and an optional `ctx?:` slipped through, because it does not match a required two-tuple. Neither
is visible in the type.

**And one direction is not new.** A *wider* declaration was already refused by assignability
alone. Removing the check kills three tier-6 rows and leaves the wider one passing — so the
mutual form is how the check is written, not the work it does.

**And three measurements are filed rather than carried**: F124 (the app's sniff and C02
disagree on three of four locale shapes), F125 (four of eight handler families declare their
own context, so a field added to `LocalContext` does not reach F14's consumer), F126 (no
named frame composition exists, so F37's four attempts were hunting a unit rather than an
export).

**Split what a producer may *know* from what it may *decide*.** The recorded counter-argument
— `AdapterContext.width` says *"never a layout decision — C11's"* — is about **authority**,
and has been answered as though it were about **knowledge**. Withholding the fact did not
prevent the decision; it produced five duplicated modules, which is the measured outcome.

One `ProducerContext` carrying **width, capabilities, `measure`, and height where a bound
exists** — a pushed view's producer is defined by the region and has no other bound. The
document validator is not on it: `expectDocument().isValid()` already ships, which is F36's
correction above. `LiveSpec.render` gets the context too, and the greeting is a tenth site
the row never counted. Say in the spec that layout authority stays with C11; do not enforce
it by omission.

**F24 loses its width and the measurement is why.** `plot/curve.ts` buckets N samples into
the available dot columns and C12 I5 keeps each column's vertical span — *"fifty samples and
fifty thousand take one path"*. F24 reports a view opened at 120 and read at 80 drawing
*"two samples per column"*; that is C12 working. The direction inverts: over-wide is handled,
under-wide is a resolution loss rather than a wrong frame, and the ring's length is retention
the producer already owns. `render` keeps the context for `capabilities` — a live panel
drawing `░█` is F54's list inside F24's route.

**The ruling landed as a spec commit alone.** C07 §3 and I17–I21, C23 §2 and I39–I41, C24 §3
and §7 with I23–I25, C22 §4a and I53–I54, A03 §3's MG3 arm and SS48.

### 7 · The audit is the item, and F78 is not a field

`b.live` throws with neither arm and throws again with both — **two throws policing a choice
where one option is inert.** The audit's rule is *every builder exposes what its block can
express, or the spec says why not*; that pair of throws should not survive whatever the ruling
is, and no field fixes it.

---

## Tier 3 — correctness with consumers, by count

| item | fix | consumers | ⚠ | depends on |
|---|---|---|---|---|
| **F90** the render chain | change, **4 stages, order fixed** | **every consumer** | C09 | **partial** · `48d3be3` `af87fb3` `a2d4fd3` `6cf2ee2` `266c076` `4efa247` `1d5a4b3` `5bc3f91` — stage 3 reaches one kind of five (**F134**) |
| **F91** shared pollers | change | **2 parts of one document**, plus the off-screen half | — | **done** · `36e850d` `1c78ab6` `af90056` `b2f63c3` `372cff3` — one owed (**F137**) |
| **F15** the empty-block mechanism | **change** — a channel, not a rethrow | 1, *and it is the mechanism*, plus **C20's** and **F138's** | C04 | **done** · `4a7b9ec` `caf4f6a` `ee0caf7` — three subjects, one drain |
| **F67** a region too small refused rather than drawn dark | **change** — two halves, one class | 1 | C01 | **done** · `a08f6db` — the gate existed and neither half ran |

**F90's order was the finding and three of its four claims moved under measurement.**
`docs/notes/TUI_NOTE_render_chain_baseline.md` is the record; the row is **partial**, and
what closes it is F134.

- **Stage 1 was ranked first as the largest effect.** It is 50–97× fewer bytes and **no
  measurable change in wall clock** — the cost is the render, and a write to an in-process
  stream is free. It keeps its place because it is small and its invalidation story already
  existed, not because it was the biggest win.
- **Stage 2 did convert continuous lag into a stall, and into a spike nobody had named**: a
  keystroke went flat in the block's size while a resize drag still pays the full render, so
  24 ms against 3,099. Same transformation, second axis.
- **Stage 3 is built, proven and reaches one divisible kind of five** (F134). `windowPatch`
  proves the *shape* — a valid smaller block — and not the *contract*: its window is a slice
  plus sticky headers, which a transcript window may not add. The seam therefore returns
  `{ block, skipRows }`, and the four kinds it cannot serve are the ones deriving a row's
  layout from the whole block.
- **Stage 4 was ranked last and is the second-largest win** — 2× to 3.4×, because `exact()`
  pads every row of every frame and the cache does not touch it.

**Acceptance was a frame-read and it passes**: six keystrokes into a 5,000-line document,
every intermediate frame exactly `columns` cells, 47 content rows throughout, the prompt in
order. **2,793 ms a keystroke → 10 ms.** What stage 3's absence still costs is *opening* a
large diff and *resizing* while one is on screen.

**The bound is still owed and is a ruling**, deliberately not taken inside a performance
row: which component owns a per-block row cap — C13 on append, C07 at adaptation, C09 at
measure — and what *overridable* means. The marker is what keeps it honest.

**F91 was filed on the correctness half and that half is what closed it.** Two panels of one
document, read from **one composed frame**, went from `19` and `20` to `10` and `10`; the poll
rate halved; the reference app's drill-in went from 7 `docker container stats` in fourteen
seconds to 4; and a source now polls nothing while nobody is looking.
`docs/notes/TUI_NOTE_shared_pollers_baseline.md` is the record.

**Two of the finding's own claims moved under measurement, and one changed what got built.**
`/stats` does not exist — reserved deliberately, never declared — so the three sharers are
two, in one document, running identical argv every 2 s. And `createCpuTick` accumulated
*inside the fetch*, so **stage 1 had no consumer until stage 2 existed**: row 1's danger was a
stage that landed alone and flattered itself, and this row's was a stage that could not land
alone at all.

**The ruling that changed shape mid-row was where a refusal lands.** A conflicting cadence is
refused rather than arbitrated — and thrown, it went into `appendAndCommit`'s deliberate bare
catch and the author got **two panels at `◌ loading` for the life of the session, silently**.
Strictly worse than the arbitration it was chosen over. It is drawn in the losing part's panel
now, and the row that found it is at the public entry, because every driver-level assertion
could see the throw and no app author ever could.

**Still owed**: staleness is per part while the data is per source, so two parts on one
`sourceVersion` can agree on the numbers and disagree in their titles (C23 §8d D10); and
**F137**, a fold runs on a version, so an attempt that failed at the transport is no longer
counted.

**Tier 5 is clean: 44 / 50 / 7, and the failing row set is *identical* to F133's** — the same
rows, not merely the same count. It first came back 45, and C03's `T5.6` was the row that
moved; it asserts a wall-clock **CPU fraction**, so it measures the host. Every failure was
measured while an unrelated training job held the machine, and it is five for five green once
the host is idle (F139).

**So the protocol gains the clause it never had** — `VERIFYING.md` §0's sixth: *counters
compared before and after* is a check only on an otherwise idle machine, and **compare the row
set rather than the count**. None of it was unknown: the file opens with *"this file measures
wall-clock and must not share the machine"*. The gap was a reader, not a record.

**F67 was filed as a ruling and is a change, and the mechanism was already there.** `tooSmall`,
`drawFallback` and gate 4 landed in `16ad934`; this plan and TRIAGE both still called it open.
Measuring reproduced the finding exactly, because **neither half of the gate ran**: the fallback
was written to `config.stdout`, which C01 redirects into its `debug` sink at construction rather
than at acquire, and the `onResize` C22 I8 registers could never fire because C01 dropped every
`SIGWINCH` outside `acquired`. Both are one class — a correct sentence justifying a condition
wider than it warrants — in two components. C01 I12b is the ruling; C22 T4.21/T4.21b and C01
T3.18c are the rows, all tier 5 or paired, because no unit test could see either half.

**F15 was filed as a ruling and is a change**, because the ruling had already been made and
never built: C23 §5, I1 and §8a A5 all said *"logged as a defect"* and no component had a sink.
The bare catch stays — a malformed document must not take the session down — and what it lost
was the report, on two channels that fail independently (C23 §5a, I48, I49).

**The count decided the shape, and it came back with a third subject.** C22 §8 step 3 drained
one of three collections: C20's `warnings` were read by nothing in `src/`, so a corrupt history
file has been silent for the life of the component with T2.9 passing throughout. And the
fabricated row for the reporting ladder found **F138** — every notice composed with
`status: "error"` was an invalid document under C04 I3, so a handoff exiting non-zero produced
no entry. F15's own mechanism was hiding a second instance of F15's own class.

---

## Tier 4 — correctness without a consumer

| item | fix | ⚠ | why no consumer yet |
|---|---|---|---|
| **F28** the live parts just declared | change | C07 | no surface has needed it; it rides the tier-2 ruling |
| **F64** `b.logs` has no consumer and a document claims otherwise | **audit** | — | a claim, not a feature — it belongs with group 7's habit |
| **F8** omitting `env` stops the shell opening | change | — | the spec says it degrades and it does not |
| **F31** `yFormat: "percent"` expects a fraction | change | C04 | one consumer, and it is why `b.plot` exposes the pin |
| **F53** `exactOptionalPropertyTypes` makes an optional field unsupplyable | change | — | rhymes with F58b: the type surface fighting the consumer |

---

## Tier 5 — the rest

| item | fix | depends on |
|---|---|---|
| **F79 · F86** `screen.py`'s OSC leak, and F79's mechanism unestablished | change | **tier 1's fixture** — the repair is not checkable without it |
| **Group 12** F69, F73 — time-based assertions under contention | **nothing; the guard stays** | — |
| **Group 7** 14 artefact findings | habit, not a patch | — |
| **Group 10** 5, all disproved | → `CLAUDE.md` | — |

**Group 12 is a decision already taken**, and it is here so nobody retakes it: `make load-down`
keeps its place on the asymmetry rather than the odds, and both measurements are recorded —
the step-8 re-measure did not reproduce, F69's pair four minutes apart did.

**What group 10 carries into `CLAUDE.md`, and it is two lines rather than one:**

> **Going to find where a claim was written down** has disproved three findings and produced
> three. It is the only instrument that checks the *record* rather than an artefact.
>
> **Compression is where the falsification enters.** F86, F89 and F92 are each a summary that
> kept a body's claim and dropped the condition making it true — an unmeasured mechanism, a
> retraction that never reached the Order list, a caller that exists. **A claim is falsified by
> being summarised, not by being wrong**, and the summary is where to look because the body
> usually still reads as correct.

---

## `docs/ROADMAP.md` — retired, and pointed

**The ruling is taken.** All four of its do-first entries sit inside `CALCIUM_ROADMAP.md`'s
phases 1 and 2 — 1 → 1.1, 2 → 1.3, 3 → 2.1, 4 → 1.2. The two documents do not disagree; one is
the F55-era subset of the other, and its ranking predates thirty-four findings.

**Not deleted.** It holds **43 finding citations** against the newer file's 24 and is the
better record of *why*; deleting it drops 43 citations SP5 currently checks along with the
reasoning behind them. So: the four-entry **ranking** is replaced by a pointer here and to
`CALCIUM_ROADMAP.md`, the evidence and the *How this document was produced* section stay, and
the file is marked as the F55-era record rather than a live list. **The ranking is what is
stale, not the evidence.**

---

## What this plan does not do

- **It does not schedule.** Every tier-2 item is a ruling before it is a diff, and estimating a
  ruling is how a ruling becomes a guess. The only ordering claims made are dependency ones.
- **It does not merge the two roadmaps.** `CALCIUM_ROADMAP.md` keeps the features; this covers
  what it does not, and the partition (`CALCIUM_GAP_PLAN.md`) is the record of which is which.
- **It cannot see a gap nobody filed.** Six were filed from one document's prose at F90–F93,
  and the honest expectation is that reading `session.ts` against `paint.ts` — which is what
  produced F90 — has an equivalent in components nobody has read that way. **The ★ marks in
  the partition should be read as questions**, not as answers.
