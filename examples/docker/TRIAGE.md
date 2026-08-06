# F1–F82, triaged

`FINDINGS.md` is a log: eighty-five entries in the order they were hit, each accurate about
what it found. Past thirty, *filed* stops meaning much — a reader cannot tell which entries
are one change and which are forty, or which to do first.

This is the other view. Same findings, no new claims: **grouped by mechanism, and ranked by
how many independent surfaces reached for the same thing.**

**The ranking is consumer count, and that is the whole argument.** A gap two independent
surfaces reached for is a gap the next surface will reach for too, and it is the only
evidence available that a fix generalises. One consumer is a request; three is a design
error. Nothing else here is a judgement about importance.

**Two things override the count.** A group that changes a **public type** (⚠) sorts above
one that does not, because the freeze makes those expensive after publication and cheap
before it. And within the ⚠ groups the count used is **open** consumers, not total: a
consumer whose finding is closed is evidence the shape is real, but it no longer costs a
type change.

> **This file was last redone at F55.** Twenty-six findings landed under it — steps 8
> through 13 — and four of the thirteen groups below did not exist at that time. The
> divergence from `docs/ROADMAP.md`, which was drawn from the F55 version, is named
> entry by entry at the end.

---

## The ranking

| rank | mechanism | findings | consumers | ⚠ | disposition |
|---|---|---|---|---|---|
| **1** | [The consumer cannot reach a fact the framework holds](#1) | 9 | **9 open** | ⚠ C07 · C24 | real Calcium work, with consumers |
| **2** | [A complete mechanism, unreachable from the other side of a seam](#2) | 12 | **5 open** (7 closed) | ⚠ C04 · C23 | real Calcium work · **7 of 12 fixed** |
| **3** | [A block cannot express what the surface needs](#3) | 6 | **4 open** | ⚠ C04 | mixed — two absorbed |
| **4** | [A change axis distinct from `Tone`](#4) | 4 | **4 open** | ⚠ C04 · C09 · C10 | real Calcium work · needs a ruling |
| **5** | [The far side's shape is not the framework's contract](#5) | 6 | **2 open** | ⚠ C05 | mostly app-side · one shim |
| **6** | [Rendered from data that has since moved](#6) | 2 | **2 open** | ⚠ C04 | real Calcium work |
| **7** | [An artefact describes the world rather than being checked against it](#7) | 14 | **14** | — | artefact discipline — **no code** |
| **8** | [Absence indistinguishable from failure](#8) | 8 | **3 open** (5 closed) | partly | real Calcium work · **5 of 8 fixed** |
| **9** | [**The instrument was wrong**](#9) | 6 | **6** | — | **new at F80** · tooling, and it has no test |
| **10** | [**A claim carried without a record**](#10) | 5 | **5** | — | **new at F80** · method — and all five disproved |
| **11** | [A gate that passes without checking](#11) | 4 | **4** | — | closed, all four |
| **12** | [**A time-based assertion under contention**](#12) | 2 | **2** | — | **new at F80** · Calcium's own suite |
| **13** | [Text the framework emits and does not substitute](#13) | 1 | 1, *and every consumer has it* | — | real Calcium work · needs a ruling |
| — | [Singles](#singles) | 6 | 1 each | — | see each |

**Four groups are new since F55** — 9, 10, 12, and F81's arrival in 4. Group 9 is the one
that changes the picture, and it is the only group whose subject is the apparatus rather
than the software.

---

<a id="1"></a>
## 1 · The consumer cannot reach a fact the framework holds — **9 open** ⚠

**Still the largest open group, and steps 9–13 changed what kind of group it is.** At F55
every instance was an app *duplicating* a Calcium module. It is now three shapes.

| | the fact | the consumer | the workaround |
|---|---|---|---|
| **F14** | the terminal's width | S1's dashboard | reads `process.stdout.columns` — **stale across a resize**, the duplication C01 I13 exists to prevent |
| **F43** | what the terminal can draw | S1's banner | sniffs `TERM` and `LANG`, duplicating `terminal/capabilities.ts` |
| **F54** | the same record, in an adapter | S3, S4 | **threads one boolean by hand through eight functions** |
| **F37** | the region's height, and a block's | S5 `/inspect --raw` | a declared floor instead of the region; `codeRows` re-implements the measurer |
| **F36** | whether a document is valid | the class test | a deep import of `dist/data/viewmodel` |
| **F28** | the live parts just declared | — | none; no surface has needed it yet |
| **F13** | who owns `meta` on a local route | every local handler | hand-writes nine fields, seven of them fiction |
| **F58b** | who owns `meta` on an adapter route | every adapter ever written | computes **seven values the registry discards**, with no signal that it does |
| **F77** | anything at all, from an adapter | the mutation family | **changes route** — 185 lines of local handler for five verbs that would have been fifteen each |

**F77 is what makes the group structural rather than incidental.** Every earlier entry says
*a producer is missing a fact*. F77 says **asking anything at all forces a route change**,
and the route costs the whole of C07: `meta`, the failure arm, the invocation record, the
spawn. Three different needs have now reached for `local` — the dashboard's ring, the events
window's, and `ctx.ask` — and the escape hatch charges full price each time.

**F13 and F58b are one fact from two sides, and only one of them was visible.** `Adapter.adapt`
returns a `ViewDocument`, so the compiler demands ten `meta` fields; `authoritativeMeta` keeps
three. The local route hand-writes nine and means none of them. Measured: an adapter returning
`exitCode: 999` produces a document reading `0`.

**The fix is not nine exports, and F58b's is a *narrower* type, not a wider one.** The adapter's
return wants a `meta` restricted to the three honoured keys, so that supplying `exitCode` fails
to compile rather than failing to matter. The rest is one contract question — what a producer is
handed — and it wants a ruling, which is why it is stated as a group rather than patched as nine.

**Its own counter-argument, recorded**: `AdapterContext.width` says *"Never a layout decision —
C11's"*, and handing a producer a height invites exactly that. The reply is that a **pushed
view's** producer is defined by the region and has no other bound.

---

<a id="2"></a>
## 2 · A complete mechanism, unreachable from the other side of a seam — **5 open, 7 closed** ⚠

The type carries the field, the renderer honours it, the tests cover it, and no consumer can
reach it. **Seven closes is the strongest evidence in this document that a shape generalises.**

| | the mechanism | state |
|---|---|---|
| **F27** | `Plot.yMin` / `yMax` | **fixed** — a container flat at 100% had been drawing a 0.2% wobble as a mountain range |
| **F48** | `b.kv`'s array arm | **fixed** |
| **F52** | `detectCapabilities`' `overrides` | **fixed** — a spec, a precedence rule, four unit rows, a tier-5 row, and no producer |
| **F7** | `createTui`, from the public surface | **fixed**, this app the consumer |
| **F17** | an adapter's `b.live`, never driven | **fixed** |
| **F70** | `contextAt`, so a completion source can be tested | **fixed** in Calcium (C24 I19) |
| **F71** | a source's cache key, so a second `Tab` works | **fixed** in Calcium (C19 I25) |
| **F78** | **`LiveSpec.stream` — declared, validated, never driven** | open |
| **F22** | `gapBefore` on the view arm | open, one line |
| **F41** | `Patch.collapsedAfter`, `actions` | open |
| **F21** | the action model, from a keystroke | open — the dispatch route |
| **F23** | `view: true` on a local tool | open — accepted, does nothing |

**F78 is the sharpest instance yet and it is worse than the others by a specific mechanism.**
`b.live` throws when neither `fetch` nor `stream` is given, and throws again when both are —
two throws policing a choice **where one option is inert**. An unimplemented field nobody
mentions is a field nobody uses; a constructor that *insists* you choose reads as a decision
you are being asked to make. Step 11 chose the unimplemented one first, for `docker build`,
which is exactly the case it looks written for. It then fails in the worst direction:
`render(null)` is a plausible empty panel, so a build that streams nothing looks like a build
that produced nothing.

**That pair of throws should not survive whatever the ruling is** — it is A03 §2's vacuity
class expressed as an API.

**Verified rather than taken from the ledger**: nothing in `src/` reads `spec.stream`. The
`.stream` references in `src/shell/execution.ts` are `transport.stream`, an unrelated
mechanism.

---

<a id="3"></a>
## 3 · A block cannot express what the surface needs — **4 open** ⚠

| | | verdict |
|---|---|---|
| **F33** | `Comparison` cannot label its columns | open — both drawings show labelled columns |
| **F34** | a comparison's verdict is colour and nothing else | **half fixed** — the checker's blind spot is closed; `better`/`worse` still want a glyph on `ComparisonRow`, a C04 change |
| **F18** | a live part looks exactly like a static one | open, small |
| **F50** | a column with no `flex` gets its minimum and nothing more | open |
| **F5** | *"`NAME` and `STATUS` never drop"* is not expressible | absorbed as arithmetic |
| **F16** | a live part's title cannot carry live data | absorbed — the summary moved into the body |

**`Comparison` is two of the four open**, and with F30 in group 4 that is three questions
about one block — a verdict axis, a judgement axis, and column identity. They want ruling
together rather than patching apart.

---

<a id="4"></a>
## 4 · A change axis distinct from `Tone` — **4 open** ⚠

**Three surfaces with no knowledge of each other hit the same absent concept, and step 11
made it four.**

| | the surface | what it wanted |
|---|---|---|
| **F30** | `/drift`, `/compare` | `same \| better \| worse \| changed` mixes a *change* axis with a *judgement* axis; a drawing used a fifth verdict (`added`) the type cannot express |
| **F49** | `/diff` | `+ - ~` wanted three colours meaning **change kind**. C04 I6 refused the mapping, correctly — a deleted file is not a fault |
| **F51** | `/events` | `EventLine` has no tone at all, so `die · exit 137` draws the same as `create` |
| **F81** | **`/build`** | **a cached step and a step that ran are different kinds of thing, not different grades** |

**F81 is the clearest statement of the gap in the repository, because it puts both axes in one
row.** The same `b.row` call takes a tone on one cell and cannot on the cell beside it:

```ts
step: s.error !== undefined ? { text: s.name, tone: "error", glyph: "error" } : s.name,
how:  s.cached ? "cached" : s.completed !== undefined ? "ran" : "…",
```

Failure *is* a goodness axis; caching is not. So the finding is not *this block needs a colour
it does not have* — it is **this row needs two axes and the model has one**, demonstrated by a
cell of each, built by one expression.

**What has to be ruled** is unchanged and is the largest design question on the list: whether
the answer is a second axis on the block, a widened `Tone`, or a theme-level concept both
resolve through — and **what the 1-bit rendering is**, which is the constraint that makes the
design rather than decorating it. `/diff` shipped `+ - ~` as *text* for exactly that reason,
and F81 shipped a *word in a column*, which is the same answer reached independently. Two
surfaces solving it the same way without coordinating is worth more than either.

---

<a id="5"></a>
## 5 · The far side's shape is not the framework's contract — **2 open** ⚠

| | the mismatch | whose |
|---|---|---|
| **F1** | Calcium appends `--json`; docker has no such flag | app — the shim |
| **F26** | `docker stats` streams by default | app — the shim |
| **F46** | the stdout/stderr split is a JSON-CLI assumption, and a log verb inverts it | app — the shim |
| **F45** | an app cannot render a stream that is not JSON | **fixed** in Calcium |
| **F39** | a **rendering** flag (`--raw`) is transmitted to the far side, which exited 125 | open — Calcium's |
| **F80** | **`interactive` is a property of the verb, and `docker run` is not** | open — Calcium's ⚠ C05 |

**F80 is the new one and it is a type that cannot describe its subject.** `ToolDef.interactive`
has one slot; `docker run` has two terminal contracts chosen per invocation — `/run -it alpine
sh` needs the terminal and `/run -d nginx` must not take it. Declared `true` here, which is the
safe direction of a choice with no right answer: wrong that way is a flicker, wrong the other
way is a hung session waiting on a child nothing can answer.

The fix is **not** a per-flag `interactive` — that lets two flags disagree, and C05 already
rejects that shape for `view`. More likely a predicate over the invocation, which is C05's to
rule on.

**F39 stays separate from the shim for the same reason it always did**: no shim makes it go
away for the next app, and it was invisible to twelve passing rows because they hand argv to
the adapter and never spawn anything.

---

<a id="6"></a>
## 6 · Rendered from data that has since moved — **2 open** ⚠

**F24** — `LiveSpec.render` receives no width, so anything sized at build time cannot follow a
resize. S3's plot goes stale *(abstract)*; S1's banner **overflows** when a wide terminal is
narrowed *(a screenshot)*. **F25** is the same fact from the other side.

The banner is why this is not bottom of the list: *"the plot's cap is stale"* argues for itself
badly and *"the banner overflows when you resize"* argues for itself immediately.

---

<a id="7"></a>
## 7 · An artefact describes the world rather than being checked against it — **14 surfaces**

**The largest group by count, no code, and the cheapest to act on.** It spans three kinds of
wrongness and the split is the finding: `DOCKER_TUI_SURFACES.md`'s corrections index scores
**7 the framework, 6 the far side, 6 the drawing wrong about itself.**

| | wrong about |
|---|---|
| **F4** · **F11** | the far side — a mock's shapes encoded as docker's, then three more surfaces the same way (F11 caught *ahead*, the only one that cost nothing) |
| **F3** · **F6** · **F10** | the far side — R01's premise expired, a glyph the vocabulary lacks, `stats --format json` is a screen redraw |
| **F30** · **F38** · **F42** · **F9** | the framework — a verdict the union lacks, a binding that does not exist, a layout chosen by width, a startup step naming an effect with no mechanism |
| **F20** | the framework — gap 7's premise was false |
| **F32** | itself, three passes — `ExposedPorts` is true of a service image and false of a base one |
| **F44** · **F65** · **F57** | itself — four of eight extents wrong and `40+4+60 = 104`; a tally reading 5 over four rows; a comparison frame varying two axes in the document arguing for frames |
| **F59** | itself — a README snippet shipped in every tarball that had never been type-checked |

**A design document written with the specs open got the framework wrong seven times.** Reading
a spec and checking against it are different acts and only the second is a test — A03 §2's
vacuity class one level up, in prose.

**The action is a habit, not a patch**: an artefact is checked against the far side and against
the framework *before* its ruling. It is first in practice because it is free.

**F57's general form is the one to keep.** A fallback ladder has as many axes as it has guards,
and `bannerLines` has two. A comparison that varies one while the other silently decides the
answer is a frame-read that cannot be wrong. **Read the ladder before choosing the pair.**

---

<a id="8"></a>
## 8 · Absence indistinguishable from failure — **3 open, 5 closed**

Every instance is invisible by construction: a green suite, a plausible frame, no diagnostic.

| | what vanished | state |
|---|---|---|
| **F35** | three app documents setting `status: "error"` and omitting `error` | **closed as a class** — `documents.test.ts` runs every document this app can produce through the validator |
| **F29** | the framework's own default `renderError` threw, mid-stall | **fixed** |
| **F40** | a view's window, measured a block at a time — C15 cut the excess silently | **fixed** |
| **F47** | a pushed view did not follow its own stream | **fixed** |
| **F61** | **`/logs` had never worked** — mawk block-buffers, so a `--follow` produced an empty screen for as long as the verb existed | **fixed** |
| **F15** | an invalid document — no entry, no error, no clue | open, and it is the mechanism |
| **F64** | `b.logs` has no consumer in this app at all; the surfaces document says it demonstrates tone on log lines and it does not | open — a claim, not a feature |
| **F67** | **below 16 rows the shell draws nothing, says nothing, and stays alive** | open |

**F67 is the new instance and the first where the *framework* is the one saying nothing.**
Measured with the size set on the PTY master before the child draws: 100×12, 100×15 and 30×16
all produce **zero bytes on both channels, process still running**. Not a crash, not a refusal,
no exit. The floor is two-dimensional, so it is some minimum region rather than a row count,
and **nothing anywhere refuses a region too small to use.**

**That is C02 I7's argument with a different subject.** A terminal that cannot open the
alternate screen must be told so on the primary screen rather than left dark. A terminal too
small to draw into reaches the same situation by a different route and gets the opposite
treatment.

**F61 is the class arriving through the instrument**, which nobody predicted: nothing was
absent and nothing had failed, and the picture was the same one — with the prompt gone,
because a pushed view takes it, so not even a cursor suggested the app was alive.

**F15 remains the one that matters**, because it is the mechanism the others were seen
through. `appendAndCommit`'s bare catch is documented and deliberate (C23 §5); the consequence
is that a malformed document is indistinguishable from a verb that did nothing. Fixing five
instances did not fix the thing that hid them.

**The app-side half is a rule, not a gap**, and two unrelated verbs found it independently:
`/drift` (a container identical to its image) and `/config` (files that agree) both produce an
empty block that reads as a call that failed. Six app surfaces now write a sentence for
*nothing to show*. **`/port` is the one that shows the class is not what it looked like**: a
container publishing nothing and a stopped container are two successful worlds with one
rendering, so the rule is not *say when you are empty* — it is *an empty rendering is a claim,
and the claim has to be one the producer can support.*

---

<a id="9"></a>
## 9 · The instrument was wrong — **6 surfaces** · new at F80

**Six findings about the measuring apparatus, and this group did not exist at F55.** It is
listed high despite one open entry because of what the count means: every frame-read in steps
9 through 13 went through `screen.py`, and F79 is the **first time its output was checked
against the bytes it was replaying.**

| | the instrument | what it did |
|---|---|---|
| **F79** | `tools/screen.py` | rendered `\x1b[38;5;188m[3/3] RUN …` as `38;5; RUN …` — an SGR fragment exactly where a six-cell step number belonged. **The app was correct.** Open |
| **F63** | `tools/capture.py` | decoded each 64 KiB read independently, so every read landing mid-UTF-8 put U+FFFD inside a panel border. **Fixed** — incremental decoder, zero replacements against one per beat |
| **F76** | `tools/beats.py` | hand-written timestamps went stale the first time a beat was shortened, so the report named the wrong moments. **Fixed** — beats derived from `screencast.BEATS` |
| **F62** | `make fixtures` | `while :; do :; done` produced a **flat line at 100%** in the headline plot of a demo about plots. Correct, honest, the least interesting figure C12 can draw. **Fixed** — bursts |
| **F74** | `demo.cast` | the completion beat had never worked: beat 3 moved focus into a live block and every character of beat 4 was correctly dropped. **Fixed** |
| **F75** | `demo.cast` | three `view: true` verbs append nothing, so the recording went transcript → fullscreen → *the same transcript*, three times. **Fixed** |

**The disposition is not "fix the tools".** Five of six are already fixed and the sixth is a
replay parser. The gap is that **the instruments have no test** — `screen.py` was trusted for
three steps and checked once, by accident, because `38;5;` is obviously not something this
application prints. A subtler corruption — a digit, a truncation mark — would have read as an
app defect and been "fixed" in the app.

> **Every instrument gets a fixture it must reproduce: known bytes in, known frame out.**

That is `test/support/README.md`'s rule — *a fixture must be shown to respond to the thing
under test before it is asserted against* — turned on the apparatus that does the showing. It
generalises past `screen.py` to `capture.py`, to `beats.py`, and to the mutation runner, which
F56 already caught producing a **partial** result when a host-side `chmod` never reached the
container's view of the file. A partial result reads as a weak assertion rather than as a
broken experiment.

**And F62 is the one no fixture reaches**, which the disposition should say rather than hide:
the plot's height, axis labels, sample count and bounds were all exactly right, and a constant
is a valid series. *Correct for the fixtures is a property of the fixtures.* Only looking at it
says a demo of a plot should have a shape.

---

<a id="10"></a>
## 10 · A claim carried without a record — **5, and all five disproved** · new at F80

**This group is the disposition.** Every entry is a finding that was filed, believed, and then
turned out to be wrong — and a log that quietly dropped them would read as *eighty-four found*
rather than **seventy-nine found and five disproved.**

| | what was claimed | what measuring said |
|---|---|---|
| **F17a** | a live part should freeze on append | freezing it would have broken C23 I9 — **not a defect** |
| **F21b** | the fork was drawn wrong | a design-authority question; the source corrected the drawing — **not a defect** |
| **F58** | `?? 0` reports signal-death as clean success | `authoritativeMeta` overwrites `exitCode` on every route: `999` yields **0**, `SIGTERM` yields **143**. The five coercions never reached a document — **retracted, superseded by F58b** |
| **F66** | docker refuses to remove an image a running container references, and it cannot be forced | `rmi` **untags** without `-f` while the container runs — **retracted**, then the retraction itself amended, because what decides it is whether the tag is the image's *last* reference |
| **F68** | the completion menu paints no background and the transcript reads through it | every cell of the box is written — measured by diffing two captures row by row, columns 0–81 on all three rows — **withdrawn**, published in two READMEs first |

**Three of the five were disproved by one instrument, and it is worth stating as a number.**
*Going to find where the claim was written* has now **disproved three findings and produced
two** — F58b, and F66's replacement reason. Five results from one habit that costs twenty
minutes makes it the highest-yield thing in the toolkit, and it is the only instrument that
checks the *record* rather than an artefact. The frame-read checks output. The mutation pass
checks tests. The audit checks code. Nothing else asks whether a belief has a source.

**All three were wrong in both directions, which is the shape to watch for.** F58 was not
broken for the reason given *and* concealed a real defect nobody had stated. F66's
impossibility was real and the reason given was not — a container pins its image blob by
digest, which is falsified only by a container outliving its own image rather than by any
docker release. F68's measurement was accurate about the wrong thing: zero background
sequences is a true fact about a capture, and a space written in the default colours *is* a
written cell.

**Repetition is not corroboration.** F58 lived in four documents that cited each other and
never held a measurement; F66 was carried across four steps and was never written down at
all. Four restatements of an unmeasured claim are one unmeasured claim.

**And F68's rule is the one most easily missed**: *a symptom named in a spec is evidence the
authors thought about it, not evidence they got it wrong.* C15 I29 describes text bleeding
through a menu in as many words — as the reason the implementation writes every cell.

---

<a id="11"></a>
## 11 · A gate that passes without checking — **4, all closed**

| | the gate | what it was not checking |
|---|---|---|
| **F2** | a CI job | Calcium was not a publishable package, and the job proved nothing |
| **F56** | `package.json`'s `bin` | a claim about an executable, accepted by install, pack, `publish --dry-run` and `make proof`. Three consumers existed and **all three reached around the entry point** |
| **F60** | `make proof` | red on `main` for two merged PRs, because it is the one target CI does not run |
| **F82** | **SP5's own `citations` counter** | itself — **the field added because the rule had shipped vacuous twice, shipped vacuous** |

**F82 was found producing this file** and it is the group's sharpest instance, because the
gate that failed is the one verifying the sentence three sections down. `citations` was
incremented inside the violation branch, so it counted *failures* — a second name for
`violations.length`, reporting **0** against a tree holding hundreds. Zero is also what it
reports if the regex matches nothing, if the scope excludes every citing file, or if the walk
comes back empty: **the exact two failures SP5 had already shipped, and the field existed to
tell them apart.**

**Then the working counter found the next one within a minute.** `415` looked low against the
tree, and it was: **thirteen top-level documents under `examples/docker/` were outside the
scope entirely — 250 citations, of which this file holds 175.** The most-cited artefact after
the ledger, and the one whose whole job is to cite. That is the rule's *first* vacuity
repeating — a scope naming the directories thought to matter instead of covering the directory
and naming exceptions — so it is three instances of one class in one rule. All 250 resolve, so
nothing was hidden; what was missing was the guarantee, not a defect.

**Its test agreed, and the way it agreed is the part to keep.**

```ts
expect(v.citations, "it looked at the citation and accepted it").toBe(0);
```

The message states the intent; the number asserts the opposite. Both were written in one
sitting from one understanding and neither was checked against the other — **F65's shape, an
artefact wrong about itself, arriving in a test rather than in a drawing.** The corpus row
meanwhile asserted `scanned > 50`, which counts *files opened* and stays high through both
failure modes; only `citations` shows that the regex and the scope work **together**.

Fixed, and mutated: reverting the increment kills both new rows and neither `fires` row —
which is why four green rows and a dead field coexisted for as long as they did.

**F60 is three findings stacked and only the third is new.** F36 and F37 are why the deep
imports exist; this is that the reach was aimed at a *repository*, so a workaround for a
missing export silently excluded itself from the check that exists to test the package.
**A workaround that cannot survive the boundary it works around is a second defect wearing
the first one's clothes.**

`tools/capture.py` now spawns the bin rather than the module, so every frame this repository
reads goes through the entry point a user has.

---

<a id="12"></a>
## 12 · A time-based assertion under contention — **2** · new at F80

**Calcium's own suite, not the app's**, and it is here because a failure of this kind names an
enforcement rule and sends a reader looking for a violation that does not exist.

| | the victim shape |
|---|---|
| **F69** | a **threshold** — T5.3a asserts a background stream advanced by more than three while sixty keystrokes are processed. On a contended runner it advanced by one. Same commit, red on a branch and green on `main` four minutes later |
| **F73** | a **timeout** and a **ratio** — six tier-2 source scans timed out at 15 s having taken 24 s; C17 T3.15 read 6.0 against a limit of 3 on a 1 MB paste |

**The ratio is the one worth naming**, because it fails in a way that reads as an algorithmic
regression rather than as a busy machine. So the class is not *slow rows time out*: it is
**anything whose assertion is about time.**

`make all` reproduces T5.6 with no load generator at all — three times for three, at 291–301 s
against 214–225 s for every subset, which is what says this is the machine rather than an
ordering defect.

**`make load-down` keeps its place on the asymmetry, not the odds**, and both measurements are
recorded: the step-8 re-measure did not reproduce, and F69's pair four minutes apart did. A row
that fails under contention will fail eventually whether or not anyone introduced it.

---

<a id="13"></a>
## 13 · Text the framework emits and does not substitute — **1**

**F55.** `PROMPT = "❯ "` and `b.live`'s default `loading…` are constants concatenated into a
frame with nothing between them and the terminal. C09 §4 argues at length that a glyph is a
slot and never a character, *because* a block-supplied one was emitted verbatim and broke under
`LANG=C`. These are L4 text, outside that vocabulary, and they break the same way.

**Consumer count is the ranking here and it undercounts this one**: there is exactly one
prompt, it is on every frame the shell ever draws, it is on the line the reader types into, and
no application can replace it. It is low on the list because it wants the same ruling C09 §4
already made — folding it in is cheaper than making a second one.

---

<a id="singles"></a>
## Singles — one consumer each

| | verdict |
|---|---|
| **F8** | omitting `env` stops the shell opening rather than degrading it — **real, small**: the spec says it degrades and it does not |
| **F12** | `npm publish --registry` is accepted and ignored — a fact about npm, recorded so nobody re-derives it |
| **F19** | `ManifestDocument` accepts the one value construction refuses — **fixed** |
| **F31** | `yFormat: "percent"` expects a fraction — **real**, and the reason `b.plot` exposes the pin and not the format |
| **F53** | `exactOptionalPropertyTypes` makes an optional field unsupplyable — **real**, and it rhymes with F58b: both are the type surface fighting the consumer rather than a missing feature |
| **F72** | `ls -p` does not mark a symlinked directory, so the one thing a user wants to do with a directory is the thing it prevents — **fixed** with `ls -1pL`, measured out of a real container's listing |

---

## What this triage cannot see

**Most of what found things this step is not reachable by sorting a list.** Measured over
docker-tui's step 8, eleven findings, and **not one came from a test written to look for it**:
reading a frame (4), writing a second consumer from the public surface (3), the mutation pass
(2), an untouched file appearing in a diff (1), asking where a settled claim was written (1).

Every instrument that found something is **a way of looking rather than a thing asserted**, and
a triage is a thing asserted. Specifically:

- **Reading a green gate's counters instead of its exit status.** **F82 was found in the act
  of verifying this file**, and it is the newest instrument here: `make enforce` printed
  success through three separate vacuities in one rule, and each time the evidence was a
  number the rule already returned and nobody read. A triage sorts what a gate let through;
  it has no way to ask whether the gate looked.
- **A frame-read.** F62, F67, F74, F75, F79 — five of the last twenty-six. Nothing in a sorted
  list tells you a frame was never read, and F67 is the proof: golden frames sweep 60/80/120/160
  columns and the height axis has no equivalent, so a document rendering to zero visible rows
  produces a frame that is *correct*.
- **Writing a second consumer.** F7, F56, F58, F70. The ranking **is** consumer count, and
  ranking by it cannot produce one. `examples/minimal` is forty lines written from the public
  surface with no house style to copy, and it hit F58's wall on its first compile — which is the
  evidence that a thing is the API's shape rather than a habit.
- **A mutation pass.** It indicts tests, and sometimes prose: a sentence that cannot be violated
  reads exactly like one that is obeyed. A triage reads prose as given, which is A03 §2's
  vacuity class pointed at this document.
- **An untouched file appearing in a diff.** F56's mode change is evidence about a mechanism
  nobody knew was running. No category here would hold it.
- **Going to find where a claim was written** — group 10, and this is the self-referential one.
  **A triage is a fourth document that cites the other three.** The instrument with the highest
  yield in this repository is the one this file is most exposed to, because grouping and ranking
  is exactly the operation that lends a claim authority it has not earned.
- **A finding that was never filed at all.** Not hypothetical. **F81 spent a whole step as a
  comment** at `src/progress.ts:31`, ending *"filed rather than worked around"* — and it was not
  filed. So the strongest group on this list looked like three consumers rather than four, and
  nothing that sorts `FINDINGS.md` could have known. SP5 checks that every citation resolves to
  a finding that exists; **nothing checks whether something that should be a finding is one.**

---

## How this file was checked

**The inventory is derived, not hand-copied.** `grep '^## F' FINDINGS.md` yields 85 ids and
every one appears in **exactly one** group above — 9 + 12 + 6 + 4 + 6 + 2 + 14 + 8 + 6 + 5 + 4
+ 2 + 1 + 6 = 85.

That check exists because the F55 version had a heading reading *5 surfaces* over a row listing
six, and F30 appeared in two groups. **A count that disagrees with its own row reads as
authority and is the cheapest possible error to make** — which is also F65's finding, one
document out. Deriving the list rather than transcribing it is the pattern for any future
inventory here.

**Dispositions were checked against the repository where they move**, not against `FINDINGS.md`'s
prose — that being the record whose authority is in question. Scoped to findings whose
disposition changed and to groups 1–4. Findings in the low-ranked groups carry their filed
disposition unverified, and this sentence is that limit stated rather than left implicit.

`make enforce` resolves every `Fnn` cited above, including F81 and F82 — **306 files, 665
citations, 0 violations, and those numbers are the check.** This file is inside that scope
for the first time, at 175 citations of its own; until F82 it was not, so the sentence this
paragraph makes would have been false had it been written yesterday.

Reading SP5's counters rather than its exit status is what found F82: `enforce` was green, as
it has been through all three of that rule's vacuities, and the number beside the green
disagreed with the tree. The double-count that widening introduced was caught the same way —
`415 + 250 = 665` against a reported `781`, a difference of exactly the ledger's 116
self-citations.

**Which is the frame-read applied to an enforcement rule** — the exit status is the
assertion and the counters are the frame — and it belongs in the list below as much as in
group 11.

---

## What this moves in `docs/ROADMAP.md`

ROADMAP was drawn from the F55 version and its ranking predates F56–F81. **Named entry by
entry, so step 3 acts on it rather than re-deriving it:**

| ROADMAP entry | at F55 | at F81 | what moved it |
|---|---|---|---|
| **1** the producer-context contract | 6 | **9** | **F77** makes it structural — asking forces a route change. F13 + F58b are one fact from two sides, and F58b's fix is a *narrower* type where ROADMAP's F58 note asked for a wider one |
| **2** three builder fields, F27's shape | 5 (3 closed) | **12** (7 closed) | F7, F17, F70, F71 are the same shape; **F78** is the sharpest open instance and adds the pair-of-throws problem, which is not a field |
| **3** absence vs failure | 8 | **8** (5 closed) | no count change, but **F67** is the first instance where the framework itself says nothing — no crash, no refusal, no exit — and **F61** is the first where the emptiness is a bug rather than a state |
| **4** a change axis distinct from `Tone` | 3 | **4** | **F81**, and a fourth independent consumer is the threshold this list is ranked on. It also supplies the 1-bit answer twice over: `/diff` shipped text, `/build` shipped a word in a column, neither knowing about the other |
| — | — | **absent** | **three groups with no ROADMAP entry**: the instrument (6), a claim carried without a record (5), a time-based assertion under contention (2) |

**Nothing demotes, and that is the finding about the ranking.** All four moved because a fourth
or fifth consumer turned up, not because anything got more severe — the F55 triage's own
mechanism arriving again, exactly as it should.

**The actionable divergence is that group 9 outranks ROADMAP's entry 4 on consumer count and is
not on the list at all.** Six findings about the apparatus every other finding was measured
with, and its disposition — *every instrument gets a fixture it must reproduce* — is cheaper
than any of the four entries ROADMAP already carries.

ROADMAP is **not** edited here. Step 3 rewrites it from this file.
