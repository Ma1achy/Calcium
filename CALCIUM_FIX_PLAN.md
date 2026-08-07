# The fix plan — the remainder

**A plan for what the roadmap does not cover.** `CALCIUM_ROADMAP.md` keeps its half; this is
the 3a remainder, ordered by its five tiers. Every item carries **what would fix it** — a
*change*, a *ruling* or an *audit*, said as one of those three — **which consumers proved
it**, **⚠ if it changes a public type**, and **what it depends on landing first**.

96 findings, 58 open. Against `main` at `80bd50b`. **No fixes here.**

---

## Settled, and not re-derived

- **1.1 is twelve findings behind one ruling, not ten.** F24 and F25 sit in a separately
  ranked group and 1.1's own text names `LiveSpec.render`. It is the top item and it is
  bigger than the triage showed.
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

**Sequenced so the unblocked work goes first.** The producer-context ruling is twelve findings
and a design question; three of them close ahead of it and are blocked on nothing.

| | item | fix | consumers | ⚠ | depends on | status |
|---|---|---|---|---|---|---|
| **1** | **F13 · F58b · F85 — narrow the type at the construction boundary** | change | **3** | C04 · C07 | **nothing** | **done** · `bea5fcd` `7ea1c28` `74da764` |
| 2 | **F14 F43 F54 F37 F36 F28 F77 · F24 F25 — what a producer may know** | **ruling**, then change | **12 with the above** | C07 · C24 | — | open |
| 3 | F30 F49 F51 F81 — a change axis distinct from `Tone` | ruling, then change | 4 | C04 · C09 · C10 | the 1-bit rendering, decided inside it | **done** · `794547d` `1a7feab` |
| 4 | F33 F34 F18 F50 — a block cannot express what the surface needs | **ruling** | 4 | C04 | rule with F30 — three questions about `Comparison` | **done** · `37d6d74` |
| 5 | F39 · **F92** — a flag that selects a rendering | change | **2** | C05 | — · F92 waits on it | **done** · `4721e28` |
| 6 | F21 — the action dispatch route | change | 1 filed, **3 dependents** | C23 | — | **done** · `84a6db2` |
| 7 | F22 F41 F78 F23 — the builder surface | **audit**, then changes | 4 | C04 | — | **partial** · `ad9058b` — F23 open |
| 8 | F80 — `interactive` as a predicate over the invocation | ruling | 1 | C05 | — | **done** · `36fbc99` `fe7ecee` |
| 9 | F55 — the prompt and `loading…` | change | 1 | C22 §6 | — | open |
| 10 | F93 — grammar registration | change | 1 | additive export | — | open |

**The status column is a record, not a claim about the remainder.** Six rows landed
before it existed, so the plan read as untouched and the next reader would have
re-derived progress from the log. `done` means the row's findings are closed and the
commit is named; `partial` names what is not — row 7's F23 was measured as F78's class
and deliberately left, because refusing `view` on a local tool would foreclose S6/S7 and
the remedy is to extend the local route.

**Rows 1 and 3–8 are done and the tier is not**, which is the distinction a column of
ticks would hide: rows 2, 9 and 10 remain, and row 2 is twelve findings behind one ruling.

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

**Split what a producer may *know* from what it may *decide*.** The recorded counter-argument
— `AdapterContext.width` says *"never a layout decision — C11's"* — is about **authority**,
and has been answered as though it were about **knowledge**. Withholding the fact did not
prevent the decision; it produced five duplicated modules, which is the measured outcome.

One `ProducerContext` carrying width, capabilities, a document validator, and height **where a
bound exists** — a pushed view's producer is defined by the region and has no other bound.
`LiveSpec.render` gets it too, which is F24 and F25 and is why this is twelve and not ten.
Say in the spec that layout authority stays with C11; do not enforce it by omission.

### 7 · The audit is the item, and F78 is not a field

`b.live` throws with neither arm and throws again with both — **two throws policing a choice
where one option is inert.** The audit's rule is *every builder exposes what its block can
express, or the spec says why not*; that pair of throws should not survive whatever the ruling
is, and no field fixes it.

---

## Tier 3 — correctness with consumers, by count

| item | fix | consumers | ⚠ | depends on |
|---|---|---|---|---|
| **F90** the render chain | change, **4 stages, order fixed** | **every consumer** | — | internal: diffing → caching → window the block → cap |
| **F91** shared pollers | change | 3 parts, plus the off-screen half | — | — |
| **F15** the empty-block mechanism | **ruling** — C23 §5's bare catch is deliberate | 1, *and it is the mechanism* | — | — |
| **F67** a region too small refused rather than drawn dark | ruling | 1 | — | — |

**F90's order is the finding.** Stage 2 alone converts continuous lag into one long stall;
stage 3 is the one that fixes it and `windowPatch` proves the pattern only inside a pushed
view. Acceptance is a frame-read — type into a 5,000-line diff and watch.

**F91 is filed on the correctness half.** Two views of one source holding different numbers is
the defect; three subprocesses is the symptom. `source → derivation → part`, two levels and
not a reactive graph.

**F15 is a ruling and not a change** because the bare catch is documented and deliberate. What
is owed is whether a malformed document may be indistinguishable from a verb that did nothing.
Fixing five instances did not fix the thing that hid them.

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
