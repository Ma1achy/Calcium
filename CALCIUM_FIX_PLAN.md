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
| ~~**Group 9** a fixture per instrument: known bytes in, stated frame out~~ | — | 10 | — | **CLOSED** — 16 of 16, `make instruments` |

**Why first with no consumers behind it.** A02 Seam 4 is about a component complete on its own
side; the implementation is the *same* side, so an interface in `types.ts` implemented in
`store.ts` gives every member a consumer by construction. **A rule with a perfect record of
not firing is indistinguishable from a rule that works.** Group 9 is closed at **16 of 16** —
and the eleven was a hand-list short by five, which is the reason the runner derives the
inventory and compares it by equality rather than iterating a table.

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
| **F90** the render chain | change, **4 stages, order fixed** | **every consumer** | C09 | **partial** · `48d3be3` `af87fb3` `a2d4fd3` `6cf2ee2` `266c076` `4efa247` `1d5a4b3` `5bc3f91` — **F134 closed** — the drift was shipped in the fullscreen view and is pinned (C25 I21a), and `patch` now declares a window: 13-21x on opening, 90-102x per drag step |
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
T3.18c are the rows, all tier 5 or paired, because no unit test could see either half. Tier 5 after: **44 failed / 54 passed / 7 todo** against a baseline of 44 / 50 / 7 — four rows added, all green, failing row set identical, on an idle machine.

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
| ~~**F8** omitting `env` stops the shell opening~~ | — | — | **CLOSED** — gate 3b (C22 I61), the sentence corrected in three places, T3.20–T3.20e, four mutations. Residue F140 |
| ~~**F31** `yFormat: "percent"` expects a fraction~~ | — | — | **CLOSED** — arms named for the unit in: `fraction`/`percent` (C04 I41), `b.plot` carries it, validated in both paths, five mutations |
| ~~**F64** `b.logs` has no consumer and a document claims otherwise~~ | — | — | **CLOSED** — §9's *Exercises* line corrected in place, citation fixed in the entry. Residue **F141** |
| ~~**F28** the live parts just declared~~ | — | — | **CLOSED** — `liveParts` on `@fmx/calcium/testing` cites it by name |
| ~~**F53** `exactOptionalPropertyTypes`~~ | — | — | **DISPOSED** — the ruling is in the finding; no task without a second consumer |

**The pre-check was the tier's first step and it removed two of five before any work started.**
Tier 4 is *findings with no consumer*, which means nothing has pressed on them since they were
filed — so nothing has corrected them either. **F28 had been built, closed and left standing in
three documents**; F53's disposition was written inside F53 and read as outstanding work. The
three that survive were each confirmed by going to the code, and **F8 gained a fact in the
process**: `env {}` produces `warnings: []`, so the failure is not only ungraceful but
unreported.

**Tier 4 is closed. Five findings in, two removed by the pre-check, three fixed, three
residues filed** — F140, F141, and F139's new section on the failing set. That ratio is the
tier's own argument: *findings with no consumer* means nothing has pressed on them, so nothing
has corrected them either, and each one that was pressed on moved.

**F64 closed as an audit and widened on the way out.** The claim was at
`DOCKER_TUI_SURFACES.md:591` §9 — not `docs/surfaces/S09_test.md`, not `S12_logs_view.md` — and
following the old citation finds a file without the sentence, which reads as a stale finding.
Correcting it turned up the wider fact: `b.logs` has **one caller in the whole tree and it is a
test fixture**, and Calcium's own S12 composes the view from `raw`. That is F141, and it is
residue rather than part of F64 because landing F64 does not close it.

**F8 closed, and it re-ruled itself once.** The where-is-this-written check found the sentence
in three places, and the third — `C22 §117` — answered its own silence with a mechanism that
has never existed and routed it to a channel this path never reaches. That decided *refuse*
over *warn*. Then reading the diff falsified the ordering the ruling had just fixed: gate 3b
runs **before** the size gate, because deferring an unusable terminal waits for a resize that
cannot cure it and then throws C01's unnamed fatal out of an unguarded `onResize`, after
`start()` has resolved. One residue filed rather than folded in: **F140**, a refusal that
leaves a constructed graph — measured identical on the pre-gate tree, so inherited, not caused.

---

## Tier 5 — the rest

| item | fix | depends on |
|---|---|---|
| ~~**F79 · F86** `screen.py`'s OSC leak, and F79's mechanism unestablished~~ | — | **CLOSED** — the leak repaired and measured, 15 rows in `examples/docker/tools/screen_test.py`, five mutations. **Group 9 does not close: 1 of 11** |
| ~~**Group 9's other ten instruments**~~ | — | **CLOSED** — `make instruments`: **16** instruments, every one with a fixture, 113 rows, the inventory compared by equality. The ten were sixteen (`tools/bench` was not in the hand-list and the waiter had no file), and three findings came out of it — F143, F144, F145 |
| ~~**Group 12** F69, F73 — time-based assertions under contention~~ | — | **NOT WORK** — ruled in this document, and `test/support/budget.ts` holds the measured half |
| ~~**Group 7** 14 artefact findings~~ | — | **NOT WORK** — *habit, not a patch*, and the 14-vs-15 is measured and explained by F87 |
| **Group 10** 5, all disproved | → `CLAUDE.md` | — |
| **F147** tier 5's own terminal has no `LANG`, so 44 rows wait on a glyph the app is right not to draw | **ruling**, then a change | new, and it blocks a green `make all` |
| **F142** the triage's inventory certifies 89 ids against 147 | **change** — a derived count or none | new, from this pre-check |

### The tier-5 pre-check, run before any of the three was planned

**Three places, not one** — `docs/`, `test/support/`, and the file's own header. Today's two
false findings were both already written, and both in `test/support/`, which is where a
measurement's reason gets recorded and is not where anyone looks for a protocol.

**Group 12 is a re-derivation and this document says so eight lines below the table it sits
in**: *a decision already taken, and it is here so nobody retakes it*. Its own `fix` column has
read *nothing; the guard stays* the whole time. The timeout half is measured in
`test/support/budget.ts` — per-file worst times, the 5× ratio the budgets were sized at, and a
standing instruction not to raise them without re-measuring. Same shape as F53 in tier 4: the
disposition written inside the entry and the entry left sitting as work.

**Group 7 is the same.** *Habit, not a patch*, and the one number that looked wrong — fifteen
ids named under a heading of fourteen — is measured, explained and corrected in §*How this file
was checked* by F87's remedy, which landed.

**`screen.py` is real, and it is cheaper than filed, because the shape exists.**
`test/unit/support-screen.test.ts` is group 9's ruling already built for one instrument — 80
lines, six rows, including *"responds to the thing under test — a wrong row is a wrong screen"*
and *"strips SGR and modes without consuming the text around them"*, which is F79 and F86's
exact subject tested on the TypeScript twin. `test/support/screen.ts`'s own header names
`examples/docker/tools/screen.py` as *"the PTY-side equivalent"*. So the row is: port that file's six rows to
the Python instrument, against `examples/docker/tools/screen.py` (133 lines).

**And the citation misdirects when quoted out of its home directory**, which is a sharper
thing than a wrong path and is why it survived. Inside `examples/docker/` the reference
`tools/screen.py` is **relative-correct** — `make` runs there and `python3 tools/screen.py`
works. Quoted from the repository root, or from `test/support/screen.ts`, or from
`tools/bench/frame.mjs`, it names this repository's own `tools/`, which holds `bench`,
`enforce`, `mutate` and `proof.sh` and has never held it. Three such quotations existed and are
corrected; the in-directory ones are left, because they are right where they are. F64's was the
first today, and both were found by following the pointer rather than trusting it.

### What the distribution does to this plan

**Group 11 goes sixth to first and group 9 seventh to third.** Of the 55 findings that were
outside the inventory, sixteen are *a gate that passes without checking* and eight are *the
instrument was wrong* — so everything filed since the count was last derived is dominated by
the apparatus rather than by the framework.

**That is not a reason to reopen tiers 1 to 5.** They were sorted by consumer count over the 89
findings then visible, the work landed, and it is green. Re-sorting closed work against a
ranking it could not have used buys nothing.

**It is the reason group 9 does not close on `screen.py`**, and the reason the next section is
about the apparatus rather than about another feature: a framework approaching publication
needs its gates trustworthy more than it needs another capability, and the largest live group
says the gates are where the defects are.

**One caveat on the distribution itself, because it rests on judgement.** SP6 proves coverage
and not placement — a bolded id anywhere in a section counts, and nothing distinguishes a key
from a mention. So the 55 placements are one reader's, made from each entry's heading, and the
document says so where they sit. The *shape* of the finding is robust to a few misplacements;
a precise ranking from it is not. Tightening the key form to table rows only is what would make
it checkable, and it is filed rather than done.

### Group 9's other ten — what each instrument claims, and the pre-check that moved two rows

**Do not port.** The six rows carried over to `screen_test.py` inherited `composeFrame`'s
domain and left *CUP ignores its column* green, because not one of them addresses a column.
These ten replay, time, capture, measure and mutate — five domains, none of them `screen.py`'s.
So the question per instrument is **what does this tool claim, and what input distinguishes a
working one from a broken one**, and the answer is a fixture rather than a translation.

**The pre-check ran first across all ten and moved two rows before a line was written.**

- **The mutation runner already has a fixture.** `test/unit/mutate-harness.test.ts`, six rows,
  and its fabrication is the real defect — the ANSI codes vitest puts between `Tests` and
  `1 failed`, which made eight caught mutations report as survivors. It was found in the third
  place, the file's own directory, and not in `docs/` or `test/support/`. So the row that was
  named *goes first* is largely done, and what it is owed is one row: a `run` whose output never
  reaches a summary at all, which is today's instance (a `grep -q` taking SIGPIPE under
  `pipefail`, exit 141, every mutation reported a survivor).
- **The waiter is not a file.** It was re-invented per invocation as a shell idiom, which is
  exactly why it had no fixture and exactly how it fired on the load line and reported a run
  complete that had not started. **A fixture cannot be written for something with no home**, so
  the remedy is a file first: `tools/waitfor.mjs`, armed on a sentinel rather than on the file
  being non-empty.

That leaves the third of the three — the bench, whose liveness line said `patch lines` during a
`logs` run — plus the eight untouched.

| instrument | what it claims | what distinguishes a broken one |
|---|---|---|
| `tools/bench/frame.mjs` | the numbers below the line came from a screen with the document on it | a blank screen reported live; a label naming a kind the run did not use |
| `tools/waitfor.mjs` *(new)* | the run it was waiting for has finished | any earlier write to the file satisfying it |
| `tools/mutate/mutate.mjs` | a survivor is a finding about the test | a run whose output carries no summary at all |
| `beats.py` | the cut lands on a settled screen | a cut at the asked-for timestamp, mid-redraw |
| `screencast.py` | every command is typed, and Enter submits it | a gap shorter than C16's paste window, or a burst |
| `capture.py` | the cast and the raw stream are one session | a multi-byte sequence split across two reads |
| `s3_esc.py` | a tick surviving the pop has time to draw | a hold shorter than two intervals |
| `media.py` | each image is evidence for the claim beside it | a frame below the floor at which the app draws nothing |
| `gap-check.mjs` · `measure-raw.mjs` · `measure-s3.mjs` | measured through the application's own configuration | a registry missing a kind, so the block is measured by the fallback |
| `tools/proof.sh` | the tarball installed, and where we said | npm reporting an override as accepted while publishing elsewhere |

**Three of those columns are transcribed from the instrument's own header**, which is where the
measured defect was already written down — `measure-s3.mjs` says a defaults-only registry
answers 5 rows for a panel that draws 13, and `capture.py` says a chunk decoded independently
puts U+FFFD inside a panel border. **A fixture that would have caught its own instance is the
acceptance test for each**, and for those three the instance is already in the file.

**The runner is the deliverable, not the fixtures.** Eleven fixtures with no runner is eleven
things nobody runs — which is the fifth class in `VERIFYING.md`, a gate nobody reports, arriving
in the gate built to answer it. One target, `make tools-test`, extended rather than joined by a
second shape.

**And the runner compares the inventory by equality**, on A03's precedent and SP6's: the set of
instrument files against the set with a fixture, so a *new* instrument fails the gate on the day
it lands. A runner over a hand-listed eleven closes eleven files; the equality closes the class.
**Group 9 closes when all eleven have a fixture and one target runs them**, and not before.

#### What it came to, measured

**Sixteen instruments, not eleven.** The hand-list in `CALCIUM_COVERAGE_AUDIT_2` named nine
tools plus `tools/mutate` and `tools/proof.sh`; the three files under `tools/bench` were never
in it, and the waiter did not exist as a file. **That is the argument for deriving the inventory
rather than for counting it more carefully**, and it is why the runner walks the directories and
compares by equality instead of iterating a list. An instrument added tomorrow fails
`make instruments` on the day it lands — fabricated and confirmed, along with a fixture rigged
to report zero rows.

**Three findings, and not one came from a row written to look for it** — the same distribution
as docker-tui's step 8:

| how it was found | finding |
|---|---|
| running the instrument | **F144** — `gap-check.mjs` and `measure-raw.mjs` did not run at all |
| writing the fixture | **F143** — a capture cut mid-character loses its whole cast |
| asking what a broken one looks like | **F145** — the gutter guard printed `← DRIFT` and carried on |

**And the pre-check moved two of the three that were named to go first.** The mutation runner
already had a fixture, found in the third place — the file's own directory — and the waiter had
nowhere to put one. Two of five in tier 4, two of three in tier 5, two of three here.

**`make all` gained a seventh target.** Ten seconds, and it is the whole of the remedy: eleven
fixtures nobody runs is `VERIFYING.md`'s fifth class inside the gate built to answer it.

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
