# F1–F86, triaged

`FINDINGS.md` is a log: eighty-nine entries in the order they were hit, each accurate about
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

| rank | mechanism | ids keyed | consumers | ⚠ | disposition |
|---|---|---|---|---|---|
| **1** | [The consumer cannot reach a fact the framework holds](#1) | 10 | **10 open** | ⚠ C07 · C24 | real Calcium work, with consumers |
| **2** | [A complete mechanism, unreachable from the other side of a seam](#2) | 22 | **6 open** (7 closed) | ⚠ C04 · C23 | real Calcium work · **7 of 13 fixed** — and F165 is the first found by roadmap 48's residue rather than by a consumer reaching for something |
| **3** | [A block cannot express what the surface needs](#3) | 6 | **4 open** | ⚠ C04 | mixed — two absorbed |
| **4** | [A change axis distinct from `Tone`](#4) | 4 | **4 open** | ⚠ C04 · C09 · C10 | real Calcium work · needs a ruling |
| **5** | [The far side's shape is not the framework's contract](#5) | 10 | **2 open** | ⚠ C05 | mostly app-side · one shim |
| **6** | [Rendered from data that has since moved](#6) | 2 | **2 open** | ⚠ C04 | real Calcium work |
| **7** | [An artefact describes the world rather than being checked against it](#7) | 18 | **14** | — | artefact discipline — **no code**, and F164 is the first found by an instrument's *population* step rather than by a reader |
| **8** | [Absence indistinguishable from failure](#8) | 15 | **3 open** (7 closed) | partly | real Calcium work · **7 of 10 fixed** — F151 is the class F35 closed in the half an app-side test cannot reach, and **F167 is the class arriving in a *value*: a validator agreeing twice about two different documents** |
| **9** | [**The instrument was wrong**](#9) | 22 | **12** | — | **new at F80** · tooling — F155's instrument is not ours, and **F157's cause is the language the harness is written in** |
| **10** | [**A claim carried without a record**](#10) | 15 | **7** | — | **new at F80** · method — six findings disproved, and **F166 unblocked an entry while F168 found what the same row was silent about**; F184 is the first where the unrecorded claim was a *rule* rather than a fact, governing thirty forms from a parameter's doc comment |
| **11** | [A gate that passes without checking](#11) | 38 | **13** | — | 9 closed · **7 open** — four about a rule's reach, and **F163 about a gate's *scope*: golden stops one layer below the painter** · **F173 is the group's own instrument, blind to 23% of what it counted** |
| **12** | [**A time-based assertion under contention**](#12) | 2 | **2** | — | **new at F80** · Calcium's own suite |
| **13** | [Text the framework emits](#13) | 3 | **3** | — | real Calcium work · needs a ruling · **F152 and F153 are a different half — the text is substituted and points at the wrong thing** |
| — | [Singles](#singles) | 21 | 1 each | — | see each · **F176 is the one to read twice**: the instrument had the evidence in a committed snapshot and the reading step was skipped |

**Four groups are new since F55** — 9, 10, 12, and F81's arrival in 4. Group 9 is the one
that changes the picture, and it is the only group whose subject is the apparatus rather
than the software.

---

<a id="1"></a>
## 1 · The consumer cannot reach a fact the framework holds — **10 open** ⚠

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
| **F85** | who owns a `RenderContext` field | every caller of `render-lines.ts` | supplies **two fields the registry overwrites**, one a stub that **throws if called** |

**F77 is what makes the group structural rather than incidental.** Every earlier entry says
*a producer is missing a fact*. F77 says **asking anything at all forces a route change**,
and the route costs the whole of C07: `meta`, the failure arm, the invocation record, the
spawn. Three different needs have now reached for `local` — the dashboard's ring, the events
window's, and `ctx.ask` — and the escape hatch charges full price each time.

**F13 and F58b are one fact from two sides, and only one of them was visible.** `Adapter.adapt`
returns a `ViewDocument`, so the compiler demands ten `meta` fields; `authoritativeMeta` keeps
three. The local route hand-writes nine and means none of them. Measured: an adapter returning
`exitCode: 999` produces a document reading `0`.

**F85 is F58b reached by a second component, which is what says the shape generalises.** An
adapter must compute ten `meta` fields and the registry honours three; a caller must supply
eight `RenderContext` fields and the registry honours six. Both times the compiler demands a
value the consumer discards, so the only way to satisfy the type is to write something untrue
— a `?? 0` in one case, a throwing stub in the other. **The throwing stub is the more honest
and the more dangerous**: it is correct only because the overwrite is unconditional, and a
comment is the whole of the guarantee.

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
| **F165** | **`ErrorLike.code`, `.stage`, `.details` — set by three producers, the adapter mapping and the app's own twelve sites; rendered by nothing.** The first thing roadmap 48's residue was read for, and it listed one of the three: the other two were *cleared* by the app naming them, which is the instrument's direction working as described. **The twelve sites were then read, and they split the three**: `stage` is a per-file constant restating the kind of function it sits in, so the framework already knows it (F13's class, group 1); `code` and `details` come off the far side's own envelope and are the one place narrowing costs something | **partly fixed** — `code` is rendered beside the message and all three members are kept. **The removal of `stage` was ruled and the compiler falsified it**: eight framework sites write real runtime values (`parse`, `spawn`, `handoff`, `local`, `transport`), so the axis keeps the field and moves the app's twelve writes. **Fixed** — the twelve are gone, and the app's suite is 308 before and 308 after: fourteen assertions touch `.error` and every one reads `message`, so the field was write-only for its whole life. What moved is the instrument — roadmap 48's residue went 88 → 89 candidates, and the one member that moved is `ErrorLike.stage`, cleared until now by the app's own writes |

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

**Keyed here by the F142 inventory sweep** — the second cohort, filed after this document's own count was last derived. Placed by mechanism from the entry; SP6 proves coverage and not placement, which is its stated limit.

| | why this group |
|---|---|
| **F92** | `usageBlocks` renders per-verb help and only an exit code can ask for it |
| **F96** | the member that would create the history directory is uncalled |
| **F97** | reverse search opens and `type()` has no caller |
| **F108** | `FlagDef.view` reaches local verbs only, and its own comment says why |
| **F125** | four of eight handler families declare a context the surface says they cannot |
| **F126** | no seam, because the composition was never a unit |
| **F129** | a `view` verb that is also `local` appends an entry and opens nothing |
| **F132** | the grant is untestable from the side that consumes it |
| **F141** | `b.logs` is reached by one test fixture, and S12 composes `raw` |


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
| **F39** | a **rendering** flag (`--raw`) is transmitted to the far side, which exited 125 | **fixed** in Calcium — `shellOnly`, C05 I21 |
| **F80** | **`interactive` is a property of the verb, and `docker run` is not** | **ruled** in Calcium — C05 I23 |

**F80 is a type that cannot describe its subject**, and that half held. `ToolDef.interactive`
has one slot; `docker run` has two terminal contracts chosen per invocation — `/run -it alpine
sh` needs the terminal and `/run -d nginx` must not take it. Ruled as C05 I23: `FlagDef` carries
`interactive` too, and an arm equal to the tool's default is refused at parse, so the arms on a
verb cannot disagree and there is nothing to arbitrate.

**Three of the finding's claims did not survive being measured, and this paragraph carried all
three.** It is amended here rather than left as written, because a summary that keeps a body's
claim after the body has been corrected is F86, F89 and F92's mechanism — and this is the file
those three are about.

- *"a per-flag `interactive` lets two flags disagree, and C05 already rejects that shape for
  `view`."* C05 I20 does the opposite: `view` is declarable on both and an invocation is a view
  if **either** says so — a disjunction, under which disagreement is impossible.
- *"more likely a predicate over the invocation."* The manifest is JSON and T2.7 round-trips it;
  a predicate does not survive that.
- *"wrong that way is a flicker, wrong the other way is a hung session."* Both measured, both
  false, and **inverted**: `docker run -it` without a terminal exits 1 at once, C21 gives every
  non-handoff child `/dev/null` on stdin so the named hang cannot happen, and the *safe*
  direction is the one that writes a container id to a screen repainted a frame later.

Two further findings came out of checking those claims rather than out of looking for anything:
**F118** — I20's refusal covers one of the two ways to declare the pair it forbids — and
**F119** — an interactive verb was routed above the validation gate and spawned unvalidated.

**F39 stays separate from the shim for the same reason it always did**: no shim makes it go
away for the next app, and it was invisible to twelve passing rows because they hand argv to
the adapter and never spawn anything.

---

<a id="6"></a>

**Keyed here by the F142 inventory sweep** — the second cohort, filed after this document's own count was last derived. Placed by mechanism from the entry; SP6 proves coverage and not placement, which is its stated limit.

| | why this group |
|---|---|
| **F101** | `stderr` and `exitCode` on a route that has no far side |
| **F124** | the app's capability sniff and C02 disagree on three of four locale shapes |


## 6 · Rendered from data that has since moved — **2 open** ⚠

**F24** — `LiveSpec.render` receives no width, so anything sized at build time cannot follow a
resize. S3's plot goes stale *(abstract)*; S1's banner **overflows** when a wide terminal is
narrowed *(a screenshot)*. **F25** is the same fact from the other side.

The banner is why this is not bottom of the list: *"the plot's cap is stale"* argues for itself
badly and *"the banner overflows when you resize"* argues for itself immediately.

---

<a id="7"></a>
## 7 · An artefact describes the world rather than being checked against it

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
| **F164** | itself — `src/index.ts`'s header lists `ViewRefresh` among the things a reader *will not find*, and line 245 exports it. The deferral class's fourth instance and the one that tightens its shape: the satisfier is in the **same file**, so proximity is not what makes a deferral expire — being looked at is. Found by a population step, not by reading. **Fixed** |

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

**Keyed here by the F142 inventory sweep** — the second cohort, filed after this document's own count was last derived. Placed by mechanism from the entry; SP6 proves coverage and not placement, which is its stated limit.

| | why this group |
|---|---|
| **F88** | `CALCIUM_ROADMAP.md`'s cross-references point at the wrong entries |
| **F106** | the block-expressiveness group is three findings and one visitor |
| **F128** | three specs disagreed with the code they specify, all in one direction |


## 8 · Absence indistinguishable from failure — **3 open, 6 closed**

Every instance is invisible by construction: a green suite, a plausible frame, no diagnostic.

| | what vanished | state |
|---|---|---|
| **F35** | three app documents setting `status: "error"` and omitting `error` | **closed as a class** — `documents.test.ts` runs every document this app can produce through the validator |
| **F151** | **the framework's own `shell` route, same class, fourth instance** | `runShell` composed `status: "error"` with no `error`, so every failing bare word was refused by `transcript.append` and produced **no entry** — the reader shown two invariant numbers instead of their command. **F35's closure cannot see it**: `documents.test.ts` runs the documents *this app* produces, and this one is produced by the framework. `noticeDoc`'s closure cannot either — the route does not go through it. **Fixed** (C23 I50) |
| **F29** | the framework's own default `renderError` threw, mid-stall | **fixed** |
| **F40** | a view's window, measured a block at a time — C15 cut the excess silently | **fixed** |
| **F47** | a pushed view did not follow its own stream | **fixed** |
| **F61** | **`/logs` had never worked** — mawk block-buffers, so a `--follow` produced an empty screen for as long as the verb existed | **fixed** |
| **F15** | an invalid document — no entry, no error, no clue | open, and it is the mechanism |
| **F64** | `b.logs` has no consumer in this app at all; the surfaces document says it demonstrates tone on log lines and it does not | open — a claim, not a feature |
| **F67** | **below 16 rows the shell draws nothing, says nothing, and stays alive** | **closed** — the gate existed and neither half ran (C01 I12b, C22 T4.21) |
| **F167** | **a document that persists and reloads as a *different valid document*** | `NaN` in a plot series validated, `JSON.stringify` wrote it as `null`, and the reloaded document validated too — the second agreement is the defect. Under it, `Series.values` and `Cell.spark` were never element-checked at all, so a string in a numeric array passed with or without a round trip. Four sibling numeric fields already used `isFiniteNumber`. **Fixed** — C04 I46, T2.19, T6.27, T6.28 |
| **F170** | **the gap had no legal spelling** — C12 I4 renders a non-finite entry as a position with no reading, C04 I46 refuses one, so absence was expressible in the type and in no valid document. The docker ring had been building such a block for a commit and nothing noticed, because a constructed block never reaches the validator. **Fixed** — C04 I46a, C12 I4, T1.16, T2.19 |
| **F171** | **a ramp step that draws as padding** — `RAMP_BRAILLE` began at `U+2800`, so at `ambiguousWidth: "wide"` every sparkline drew its *minimum* as whitespace, which the right-anchor already uses for *fewer samples than cells*. `cells()` counts it as one and no golden frame renders that arm, so every width and length row passed. **Fixed** — C12 I16, T1.15, a golden frame for the arm |
| **F172** | **an unknown `ColourRef` resolves to no style, silently** — `resolve()` returns `NO_STYLE` when a palette or slot is missing *and* when a decoration palette collapses at 1-bit, so *this reference does not exist* and *this reference means nothing here* are one value. The empty-block class in the resolver, and entry 3's fourth palette family is what makes it reachable. **Open** — a missing family belongs in `ThemeError`, where contrast failures already go |

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

**Keyed here by the F142 inventory sweep** — the second cohort, filed after this document's own count was last derived. Placed by mechanism from the entry; SP6 proves coverage and not placement, which is its stated limit.

| | why this group |
|---|---|
| **F135** | a malformed greeting is swallowed twice and the session shows nothing |
| **F138** | every notice composed as an error was an invalid document |


## 9 · The instrument was wrong · new at F80

**This group did not exist at F55, and its size is stated once — in the ranking table.** It is
listed high despite one open entry because of what the count means: every frame-read in steps
9 through 13 went through `screen.py`, and F79 is the **first time its output was checked
against the bytes it was replaying.**

| | the instrument | what it did |
|---|---|---|
| **F79** | `tools/screen.py` | rendered `\x1b[38;5;188m[3/3] RUN …` as `38;5; RUN …` — an SGR fragment exactly where a six-cell step number belonged. **The app was correct.** Open |
| **F63** | `tools/capture.py` | decoded each 64 KiB read independently, so every read landing mid-UTF-8 put U+FFFD inside a panel border. **Fixed** — incremental decoder, zero replacements against one per beat |
| **F157** | **the capture harness, and Python itself** | the shot asks for LANG=C, the child also gets LC_CTYPE=C.UTF-8 that nobody set — PEP 538 coercion, inherited through pty.fork, outranking LANG. The ASCII degradation shot has never shown ASCII: 6,833 box-drawing dashes in the picture whose job is the fallback. **Fixed**, three fixture rows |
| **F158** | **a fixed 1.5 s against an async opening** | /drift typed before the greeting landed, so the banner appended under the comparison — later content above earlier, header scrolled off. 20 frames, right size, exit 0. **Partly fixed** — TYPE_AT is a weaker fix and says so |
| **F155** | **`uptime`'s load average** | a one-minute figure of 0.02 read as an idle host while the five-minute was 1.04 — a machine that had just stopped working, giving 125-230 ms where a settled one gives 70-78. One command from a **false retraction** of a true figure being written into `budget.ts`. **Fixed** — `tools/scan-cost.mjs` carries the method as code |
| **F76** | `tools/beats.py` | hand-written timestamps went stale the first time a beat was shortened, so the report named the wrong moments. **Fixed** — beats derived from `screencast.BEATS` |
| **F62** | `make fixtures` | `while :; do :; done` produced a **flat line at 100%** in the headline plot of a demo about plots. Correct, honest, the least interesting figure C12 can draw. **Fixed** — bursts |
| **F74** | `demo.cast` | the completion beat had never worked: beat 3 moved focus into a live block and every character of beat 4 was correctly dropped. **Fixed** |
| **F75** | `demo.cast` | three `view: true` verbs append nothing, so the recording went transcript → fullscreen → *the same transcript*, three times. **Fixed** |
| **F143** | `tools/capture.py`, again | F63's fix, scoped by a true sentence that was not the one the decision needed: the final flush stayed strict, so a capture ending mid-character **raised after the raw stream was written** and the session's `.cast` was lost. **Fixed** — strict body, one replacement at the very end |
| **F144** | `tools/gap-check.mjs`, `tools/measure-raw.mjs` | **neither ran at all.** Both called interfaces that had moved (`splitRaw`'s measure, `createDocumentView`'s `measureSequence`) and died on their first call. Nothing consulted them, so nothing noticed. **Fixed**, and the runner is what closes the class |
| **F145** | `tools/bench/patch-window.mjs` | the gutter guard **printed `← DRIFT` and carried on**, while the two guards beside it exit. A drifted window is a plausible number for a path that is not the one being timed. **Fixed** — it exits |
| **F149** | `test/support/pty.ts` — **the framework's own harness, not the demo's tooling** | `frame` slices from the last `CSI H`, citing S01 §3 and C22 §6 for the shape. Measured on a live session: **one home, ever.** C22 I55 makes every later frame a *difference*, so the getter returns the first paint plus every edit since, addresses stripped and rows run together. A contains-assertion passes by accident; anything positional is wrong. Open — the remedy is a screen, not a slice |
| **F86** | `tools/screen.py`, again | **F79's stated mechanism, measured and falsified.** An unterminated OSC consumes nothing — the regex is anchored to a terminator — and the quoted bytes render correctly in isolation. A *different* real defect: the OSC leaks as visible text. Open |

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

**Keyed here by the F142 inventory sweep** — the second cohort, filed after this document's own count was last derived. Placed by mechanism from the entry; SP6 proves coverage and not placement, which is its stated limit.

| | why this group |
|---|---|
| **F107** | the wiring survived the mutation pass, and the fixture is why |
| **F110** | `as never` in a fixture, fourth instance |
| **F111** | a test named for a workaround outlives it, and passes |
| **F113** | a one-action fixture cannot falsify a first-action rule |
| **F116** | a mutation surviving located the guard, not a hole |
| **F117** | a blanket rename took a rule id that was already taken, twice |
| **F120** | the mutation harness reported one pre-existing error six times |
| **F130** | the grant's own tests could not see it, because the double was narrower |


## 10 · A claim carried without a record — **7: five findings disproved, one claim caught before it was filed, one rule that governed thirty forms** · new at F80

**This group is the disposition.** The first five entries are findings that were filed,
believed, and then turned out to be wrong — and a log that quietly dropped them would read as
*eighty-four found* rather than **seventy-nine found and five disproved.**

**F161 is the sixth and it is the group's first arriving from the other end**: the instrument
was pointed at a claim *before* it became a finding, so what is filed is the disproof rather
than the belief. That is the group succeeding rather than growing, and it is worth
distinguishing in the count instead of folding into it.

| | what was claimed | what measuring said |
|---|---|---|
| **F17a** | a live part should freeze on append | freezing it would have broken C23 I9 — **not a defect** |
| **F21b** | the fork was drawn wrong | a design-authority question; the source corrected the drawing — **not a defect** |
| **F58** | `?? 0` reports signal-death as clean success | `authoritativeMeta` overwrites `exitCode` on every route: `999` yields **0**, `SIGTERM` yields **143**. The five coercions never reached a document — **retracted, superseded by F58b** |
| **F66** | docker refuses to remove an image a running container references, and it cannot be forced | `rmi` **untags** without `-f` while the container runs — **retracted**, then the retraction itself amended, because what decides it is whether the tag is the image's *last* reference |
| **F68** | the completion menu paints no background and the transcript reads through it | every cell of the box is written — measured by diffing two captures row by row, columns 0–81 on all three rows — **withdrawn**, published in two READMEs first |
| **F161** | a hanging-continuation mark has four consumers, one of which ships | the character is in **no file** in the repository, and none of the four could take it: one already has a `Glyph` slot, one is text inside a `code` block, one has no renderer, one was a homonym — a log *level* named `trace`. **Caught before it was filed** |
| **F168** | roadmap 44 is C20's persistence one level up, so the shape carries | **the policy carries and the redactor does not.** C20 redacts a *command line* with a tokeniser; a transcript document holds what the far side **printed** — and `inspect.ts:152` puts every container environment variable into a `keyValue` block. A rendered document has no tokens to redact, so finding a secret in one means understanding all seventeen kinds. And a transcript row *mutates* after it is written, which append-only with an index-aligned sidecar assumes it does not. **Caught before a line of it was built**, on a row already corrected once this session |
| **F166** | roadmap 44 needs a document serialiser and `src/` has none, so 44 is blocked on 34 | a `ViewDocument` is **JSON by construction** — no function, `Map`, `Set` or `Date` anywhere in the block union — and it round-trips byte-identically through `JSON.stringify` and `validateDocument`, which C13 already calls on every append. What is missing is **one export line** and a round-trip row per kind. Three documents restating one unmeasured belief, and a conflation underneath it: 34's *structured export* is a UX item in a six-item bundle, and 44 read it as a codec. **Caught before anything was built on it** |

**Four of the six were disproved by one instrument, and it is worth stating as a number.**
*Going to find where the claim was written* has now **disproved three claims and produced
four** — F58b, F66's replacement reason, F92 and F161. **This line and `CLAUDE.md`'s had
already drifted apart by one before F161 was added** — F92 was counted there and not here,
which is two records of one number doing what two records of one fact always do. Corrected in
both, and the drift is left recorded rather than tidied away: it is the same class the group
is about, arriving in the group's own summary. Seven results from one habit that costs twenty
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

**Keyed here by the F142 inventory sweep** — the second cohort, filed after this document's own count was last derived. Placed by mechanism from the entry; SP6 proves coverage and not placement, which is its stated limit.

| | why this group |
|---|---|
| **F89** | an Order entry carries a claim its own document records as corrected |
| **F93** | C09 §4a promises a registration path that was never built |
| **F112** | F21's four claims all held, and the fix was a tenth the size |
| **F123** | a promise needs three mechanisms and the finding that named it found one |
| **F134** | corrected twice; the drift is real and shipped by a route neither reading found |
| **F139** | the rule was in the file header, and a finding re-derived it wrongly |

| **F184** | **the palette indexed the row, and the rule saying it should was a code comment** | *A plain bar is one series across N categories and the category **is** what a colour can name* — `definition.ts:998`, and a grep of `docs/`, `src/`, `test/` and `tools/` returns that line and nothing else. True about the grouped bar it was written for; general by nothing, and enough to give a histogram's eight bins eight colours for one distribution. **The correction then over-reached, which is the finding under the finding**: eleven reference renderings draw one colour per series, that fits every row and is the references' *taste* rather than the rule behind it, and taking it whole took the colour off every named band too — reported by the user in the same turn, twice, and correctly. A measurement settles what is true and not what to draw. The partition is the **row axis**: a bin and a lag are cuts this renderer made and have no identity; `control` and `Opex` are names the caller chose and keep their slots. **Fixed** — C12 §3t, I38 and `ROW_IS_AN_IDENTITY`, total over `PlotForm` and deliberately not `SHARES_CELLS`, which is indexed by form so a plain bar and a stacked one share an entry. Eleven mutations caught, and the survivor took two wrong diagnoses before the fixture became a pair |


## 11 · A gate that passes without checking — **19: 10 closed, 9 open**

| | the gate | what it was not checking |
|---|---|---|
| **F185** | **the golden corpus, for the distribution ladder's top rung** | Both violin arms mirrored about `k/2 − 0.5` and put the spine at `round((k−1) ÷ 2)` — the lower baseline at every even extent — so the figure carried three rows of ink above its rule against two below. Two correct statements meeting, with the right comment standing over one of them: *a violin that is asymmetric by a row is a violin that is wrong, and it is invisible in anything but a mirror assertion.* **There was no mirror assertion**, and the corpus could not have been one — the fix moved four vertical frames and none of the other 280. **The first reason given for that was wrong**: not the fixture's parity, which measures at four, but the *rung* — four rows a band is the raincloud, one-sided by construction, and the mirrored outline starts at five, so the top rung had no horizontal golden frame at all. F58's shape caught one turn wide instead of four documents. **Fixed** — C12 I39, a sweep over both parities and both arms, a `MIRRORED` corpus at six rows a band and seven, and four mutations of which one survived on a path the sweep could not reach |
| **F183** | **`make refdiff`, for 58 of the 100 variants it renders from** | Both halves independently took the first variant of each form — `Object.values(variants)[0]` and `next(iter(variants.items()))` — so **42 of 100 catalogue variants were compared**, and the whole raincloud ladder has never been diffed against anything. The Makefile calls it *every form beside its twin*, which at the **form** level is true; that is why it stayed unwritten while `reference.py`'s header records two other limits with care. **It became load-bearing when a *style* arrived**: a candlestick is `form: "line"` and cannot be a form's first variant, so adding the fixture without fixing this would have been a fixture nothing rendered — an anchor that does not match, which the mutation harness distinguishes from a survivor and this did not. **Fixed** — keys of `form` or `form.variant`, our side declaring which (the rule the header already states for the row count), and the generated README printing *N of 100* so the residue is a number a reader sees |
| **F181** | **MG27, for the second of the two builder files** | `checkBuilderCoverage` reads `types.ts` and `builders/index.ts`; `figure.ts` is a builder and it never opens it. So **ten of fourteen `BUILDER_OMISSIONS` entries name fields a public chain already sets** — `b.figure({height: 5}).setQuartiles([…]).build()` carries them — while their reason, *shorthand lands in step 11*, stays true about `b.plot` and is not the claim the rule enforces (*buildable by nothing public*). F84's correct-sentence class inside an exemption list. Underneath it, **six of `FigureOpts`' twelve fields are unreachable through `b.figure`**, `plotStyle` among them, so `build()` spreads three from an option no caller can pass. **Open** — the remedy is `b.figure` forwarding `FigureOpts`, which is also what lets `setOhlc` exist; blind spot recorded at MG27's declaration |
| **F174** | **`dashboard.test.ts`, for the wiring under three of its rows** | `bar()` lost its last caller when `ioBlock` moved onto `keyValue`'s bar, and three rows kept passing six assertions because they called it directly — the mechanism, never the wiring, in a file whose header says *assertions read the rendered output*. What they were hiding is F175. **Fixed** — `bar()` deleted, the rows rewritten against the frame in `test/repo/cpu-cell.test.ts` |
| **F173** | **`tools/mutate/anchors.mjs`, for a quarter of its own anchors** | `anchorsOf` matched `from: "…"` and nothing else, so **108 of 465 anchors, and 30 of the 54 runs carry one** — every anchor whose source contains a double quote, which is most of the capability ones — were outside its reading. It printed `54 runs · 357 anchors · no drift` while a stale anchor from the previous commit sat in a file it was half-reading. **The count is what a working gate looks like from outside**, F161's shape in the instrument that exists to stop staleness. **Fixed** — a branch per quote style; `c12-ramp` and `c12-value-bar` re-anchored and re-run, four more added to `KNOWN_STALE` |
| **F169** | **`make roadmap`, for the half of the file that is not a table row** | `roadmap-status.mjs` matches `\| N \| BUILT\|PART\|RULED \| … \|` and resolves the citations in that cell. **Entry bodies are never scanned** — 81 citations, 39 of them with a line — so the target reports 49/49 while resolving 56% of the file's citations, and the one stale citation a census found (`src/shell/confirm.ts:148`, blank) was in the unchecked half. The census also priced the exposure: **143 of 326 prose citations carry a line number**, 73% in the roadmap against 19% in `docs/`. **Open** — widening the resolver needs a basename search for the 50 bare-name body citations, and `src/progress.ts` exists in both trees, which is the resolve-against-the-wrong-file class. Six unresolved citations fixed |
| **F163** | **the golden suite, for anything the painter decides** | `test/golden/README.md` says *frames*, and not one of the four files is one: all go through `renderToLines`, and **no golden test imports from `src/shell/`**. So the base, the prompt window, the selection wash, the chrome, the frame arithmetic, the cursor sequences and the write-as-a-diff have never appeared in a snapshot — the category built to catch exactly this class of change stops one layer below it. Found by re-measuring roadmap 39's residue, whose stated reason was true and was not the reason. **Open** — roadmap 49, because a golden *frame* is test infrastructure with more consumers than the entry that found it |
| **F162** | **`make test`, for a test file's own types** | vitest transpiles rather than typechecks, so a type error **inside** a test row is invisible to that row: T4.31 ran, asserted and went green in a file `tsc` refuses. `check` covers it and `afb88c4` published a clean `check` for a commit that does not typecheck — which makes the remedy an ordering one, **`check` last, not first**. **Fixed** |
| **F2** | a CI job | Calcium was not a publishable package, and the job proved nothing |
| **F56** | `package.json`'s `bin` | a claim about an executable, accepted by install, pack, `publish --dry-run` and `make proof`. Three consumers existed and **all three reached around the entry point** |
| **F60** | `make proof` | red on `main` for two merged PRs, because it is the one target CI does not run |
| **F150** | **the README's quoting test** | a subset check in one direction, so the published block could omit anything and stay green. It did: 27 lines of 64, and **the example did not parse**. Under it, `examples/minimal` had not typechecked since F58b — a `check` script the `Makefile` never ran. **Fixed** — equality both ways, and `make check` runs both examples |
| **F154** | **`make instruments`** | `make all` runs seven targets and the workflow ran six. Group 9's remedy — *in the gate rather than run by hand* — landed in the gate a contributor runs by hand and not in the one that gates a merge. Found by diffing two lists, both correct on their own. **Fixed** — in the `fast` job |
| **F156** | **`make check`, as this session wired it** | F150 added both examples' `check` scripts and not their install, so the target read `node_modules` the developer's machine happened to hold. Green everywhere, red 19 s into the first clean CI run. `dist/` was the non-obvious half — A04 §3 says install ends in the build and the recipe did not. **Fixed** in `make install` |
| **F82** | **SP5's own `citations` counter** | itself — **the field added because the rule had shipped vacuous twice, shipped vacuous** |
| **F148** | **`validateInvocation`, one layer below both suspects** | `transmitted` pushes one token per iteration and a valued flag spans two, so `/ps --limit 400` reached the far side as `ps --limit`. Every type, both forms, repeatable losing one value each; only `--limit=400` ever worked. **Fixed** — T1.16b, T2.9c, T6.13 |
| **F147** | **tier 5's own terminal** | `interactivePty` passes `TERM` and `PATH` and no `LANG`, so C02 resolves ASCII and the prompt is `>` while 44 rows wait on `❯`. Every interactive row in the tier has been asserting against a degraded rendering. **Open** — the remedy is measured and is a ruling |
| **F146** | **commitment 14b's own registration list** | SP6 was implemented, inventoried and fabricated, and `SPEC_RULES` never learned it existed — so `make test` was red for two commits while `npm run enforce` stayed green and correct. **Fixed**, and the bundled fabrication split into three rows |
| **F83** | **MG24's definition of a consumer** | the implementing module counts as one, so an interface in `types.ts` implemented in `store.ts` gives every member a consumer by construction. **Open** |
| **F84** | **MG24's scope** | it walks `export interface` only. **798 members published as `export type` are outside every rule in the suite** — nearly three times the 280 it watches. **Open** |
| **F159** | **MG24's member walk** | it reads members off their own lines, so a type declared on a *single* line presents none and is watched by nothing. Neither the keyword nor the name is the discriminator — the **line shape** is, and **40 published object types under `src/` are single-line**. F84's sibling: a rule widened along the axis one finding named can stay narrow along one it did not, and the earlier fix is what makes the clean result read as coverage. **Instance fixed** — both C26 types reformatted, with the reason recorded at each declaration; **class open** |
| **F160** | **MG24's member matching** | it compares members **by name**, so `ElementReport.kindsCovered` reported a *different* type's exemption stale. The harmless direction; the same looseness means **a genuinely unconsumed member is satisfied the moment any unrelated type anywhere declares a field with that name** — and `id`, `kind`, `width`, `rows` are exactly the names a new type carries. Nothing in a clean run tells the two apart. **Instance renamed**, blind spot recorded at the declaration; **class open** — the fix is keying by `(owner, name)` |

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

### The four open ones are about a rule's *reach*, and they fail in different directions

**F83 is a definition too weak inside its scope.** A02 Seam 4 is about a component complete on
its own side with nothing on the other — and the implementation is the *same* side. The file
boundary was taken as a proxy for the seam and within a component it is not one. 28 members
never cross their own component; `HistoryStore.rerun` has no caller in `src/` — a test
calls it, and that qualifier is the difference between a claim and a slogan — and
`TransportRouter.busy` **survived its own removal** — `router.ts:64` says a guard *"replaced
`busy`"* and `construct.ts:1024` counts *"seventeen until `busy`"*, so the tree records the
deletion twice and the member is still there.

**F84 is a scope too narrow with a definition that works.** Its present contents are almost
empty — 0 members dead outright, and the 67 that never cross a component are dominated by
deferrals already documented, `ToolDef.oneShot` having three paragraphs in C22 §4. Three
survive: `GlyphSet.teeLeft`, `teeRight` and `hollow`, declared glyph slots with no drawer.

**Filed anyway, and this is the group's argument in one line: a rule whose scope excludes
three-quarters of its subject is a rule whose clean result means much less than it reads,
whatever it happens to contain today.**

**F159 is the third, and it is the one that could only be found after F84 was fixed.** MG24
now walks type aliases — which is what closes F84's axis and what makes its result read as
covered. It still reads members off their own lines, so a declaration written on one line
presents none: forty published object types under `src/` are outside the rule by their
formatting alone, and nothing chose that. **A rule widened along the axis a finding named
can stay narrow along one it did not, and the earlier fix is precisely what hides the
remainder.** That is F82's sentence about a counter, applied to a
scope — and it is why this group's disposition is never "fix the instance".

**F60 is three findings stacked and only the third is new.** F36 and F37 are why the deep
imports exist; this is that the reach was aimed at a *repository*, so a workaround for a
missing export silently excluded itself from the check that exists to test the package.
**A workaround that cannot survive the boundary it works around is a second defect wearing
the first one's clothes.**

`tools/capture.py` now spawns the bin rather than the module, so every frame this repository
reads goes through the entry point a user has.

---

<a id="12"></a>

**Keyed here by the F142 inventory sweep** — the second cohort, filed after this document's own count was last derived. Placed by mechanism from the entry; SP6 proves coverage and not placement, which is its stated limit.

| | why this group |
|---|---|
| **F87** | the partition is claimed and the count that checks it cannot see the claim |
| **F94** | `export interface` does not mark a seam, and MG24's premise rests on it |
| **F95** | MG24 counted method parameters as interface members |
| **F99** | eleven published members no rule could see |
| **F102** | D29's sweep exempts a *kind* and the guard catches only a new kind |
| **F104** | `block()` is transparent to excess properties, so C04's narrowings land unenforced |
| **F105** | MG24 matches member names globally |
| **F109** | a proxy that stopped measuring its property, and the property stayed true |
| **F114** | the builder-coverage rule existed, correctly stated, with nothing reading it |
| **F115** | the coverage rule was blind to its own findings regressing |
| **F121** | six tier-5 rows were red at HEAD and nothing said so |
| **F127** | MG3 has never walked `import type` |
| **F131** | `make all`'s golden gate had been red for four commits |
| **F133** | tier 5 was 44 failed at session start, and the prompt never draws |
| **F136** | MG24 matches a record's members by name and not by owner |
| **F142** | a derived count is derived once, and nothing re-derives it |


## 12 · A time-based assertion under contention — **2** · new at F80

**Calcium's own suite, not the app's**, and it is here because a failure of this kind names an
enforcement rule and sends a reader looking for a violation that does not exist.

| | the victim shape |
|---|---|
| **F69** | a **threshold** — T5.3a asserts a background stream advanced by more than three while sixty keystrokes are processed. On a contended runner it advanced by one. Same commit, red on a branch and green on `main` four minutes later |
| **F73** | a **timeout** and a **ratio** — six tier-2 source scans timed out at 15 s having taken 24 s; C17 T3.15 read 6.0 against a limit of 3 on a 1 MB paste. **Read 4.05 again on 2026-08-15**, on a docs-only commit that touched no `src/`, green on an immediate re-run at load average 3.0 — a second measurement of the same row, and the one that makes *not an algorithmic regression* a fact rather than an inference |

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
## 13 · Text the framework emits — **3**

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

**Keyed here by the F142 inventory sweep** — the second cohort, filed after this document's own count was last derived. Placed by mechanism from the entry; SP6 proves coverage and not placement, which is its stated limit.

| | why this group |
|---|---|
| **F55** | the framework draws two characters it does not substitute — this group's subject |
| **F152** | the framework emits a sentence about the wrong subject — the far side failed and the notice names the app author's adapter |
| **F153** | the framework emits a sentence about the wrong fault — an absent required field reported as a value of the wrong type |


## Singles — one consumer each

| | verdict |
|---|---|
| **F8** | omitting `env` stops the shell opening rather than degrading it — **real, small**: the spec says it degrades and it does not |
| **F12** | `npm publish --registry` is accepted and ignored — a fact about npm, recorded so nobody re-derives it |
| **F19** | `ManifestDocument` accepts the one value construction refuses — **fixed** |
| **F31** | `yFormat: "percent"` expects a fraction — **real**, and the reason `b.plot` exposes the pin and not the format |
| **F53** | `exactOptionalPropertyTypes` makes an optional field unsupplyable — **real**, and it rhymes with F58b: both are the type surface fighting the consumer rather than a missing feature |
| **F177** | a shared precision **the string threw away** — `yLabels` computed one precision for the axis and `Number(v.toFixed(2))` stripped the trailing zero, so `0.20 0.15 0.10` rendered as `0.2 0.15 0.1`. The survey's own counter-example, shipped. **The prose was true about the half that worked**, which is why reading it agreed. **Fixed** — a named precision is kept, an unnamed one trimmed |
| **F178** | a nice step of **zero**, and a render that never returns — a denormal span underflows, `floor(min / 0) * 0` is `NaN`, and `drawLine` stops on `x === ex` where `NaN` equals nothing. **The invariant is two modules from the decision** (C12 I2), which no rule-interaction table for the function reaches. Two further lessons: a plausible constant (`return 1`) terminated and swamped the data by 300 orders, and a float loop counter at 10³⁰⁰ does not advance. **Fixed** |
| **F180** | **the heatmap was unreachable from the builder** — `b.plot` hardcoded `form: "line"` and `b.spark` writes `"sparkline"`, so `"heatmap"` was buildable by nothing public. That is the whole of *the heatmap has data and no drawing*: a consumer could not have been written. **MG27 passed it** because the rule asks whether the constructed literal *mentions* the field, and a closed union with one hardcoded arm satisfies a check about names — F84's shape one rule along. Second instance in the same edit: `plot.xLabels`'s exemption had two clauses and one expired. **Fixed** |
| **F179** | the accessibility theme had **no `categorical` palette**, so every multi-series plot drew eight series in one colour — silent, because a missing family and a decoration family collapsed at one bit are the same `NO_STYLE`. Found by F172's resolve-time gate on its first run. **The rule that can fire is worth more than the case it was written for**, and that case has not happened yet. **Fixed** |
| **F182** | **F175's own fix, applied to the two arms it was found on and not to the class.** `formatReadout` gave `percent` and `fraction` a precision and left the default arm on `decimalsFor`, which answers *how many digits does an axis label at this scale want* — so a `bar` with no `yFormat` drew `45` for `45.2` while the identical block with `yFormat: "percent"` drew `45.2%`. Same function, same values, one dropping the digit it exists to keep. `categorical.ts`'s comment — *this was the fourth* — is accurate about the **call site** and closes off the question of whether the function is right on every arm. **260 golden frames pass unchanged across the fix**, so no committed frame exercises a plot number with a fraction and no `yFormat`. Underneath it, a second on a *set*: four readings of one quantity at four precisions, F177 where nothing had named a shared precision because nothing had formatted a set. **Fixed** — the numeric arm keeps what the producer sent, and `readoutSet` names the set |
| **F175** | a bar's number was formatted as a **tick label** — `Math.round`, right for an axis mark and wrong for a readout, so `45.2%` drew as `45%`. Rhymes with F31 one field over: the `yFormat` enum is shared on purpose and *precision is not a property of the unit*. **Fixed** with `formatReadout`, a named intent rather than an optional argument — the argument version was already passed by `yLabels` and widened every percent axis in the corpus |
| **F176** | the `fill` pair had **no ambiguous-width arm**, so `█ ░ —` drew at twice their cells and `truncate` ate the bar's number. Exactly what `RAMP_UNICODE` did and what `ladderFor` swaps braille in for; the fourth encoding axis was added last and did not inherit the third's fix. **The golden corpus had recorded it** — `table-value-bar` at `dark-wide` read `█░░░░░░░ …` in a committed snapshot nobody looked at. **Fixed** |
| **F72** | `ls -p` does not mark a symlinked directory, so the one thing a user wants to do with a directory is the thing it prevents — **fixed** with `ls -1pL`, measured out of a real container's listing |

---


**Keyed here by the F142 inventory sweep** — the second cohort, filed after this document's own count was last derived. Placed by mechanism from the entry; SP6 proves coverage and not placement, which is its stated limit.

| | why this group |
|---|---|
| **F90** | the frame is recomputed and rewritten whole, and the four fixes are one chain |
| **F91** | every `b.live` part owns its own fetch, so two views of one source disagree |
| **F98** | the suite leaves eleven sessions' process handlers attached |
| **F100** | narrowing the adapter's return exposed three things the wide type hid |
| **F103** | three renderers implement one pattern and none of them names it |
| **F122** | the framework holds apps to a rule it exempts itself from |
| **F137** | a fold runs on a version, so an attempt that failed is not counted |
| **F140** | a refusal that leaves a constructed graph |


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
  comment** at `examples/docker/src/progress.ts:31`, ending *"filed rather than worked around"* — and it was not
  filed. So the strongest group on this list looked like three consumers rather than four, and
  nothing that sorts `FINDINGS.md` could have known. SP5 checks that every citation resolves to
  a finding that exists; **nothing checks whether something that should be a finding is one.**

---

## How this file was checked

**The inventory is derived, and now it is derived by something that runs.** `SP6` in
`tools/enforce/findings.mjs` takes the distinct ids from `FINDINGS.md`, takes the ids keyed in
the group sections here, and **compares the two sets by equality** — so a finding filed and not
keyed fails `make enforce`, and the sum in the ranking table is checked against what the groups
actually hold rather than against itself.

**It was a snapshot until then, and it had gone 55 findings stale.** This paragraph used to
read *"yields 89 ids and every one is keyed in a group above — 10 + 12 + … = 89"*. Measured
when SP6 was written: **145 distinct findings, 55 keyed nowhere**, and the sum still reached
89, so the arithmetic offered as evidence passed exactly as it did on the day it was true. That
is F87's proxy one level out — F87 found a total cannot see a duplicate placed twice and
counted once, and this is the same total unable to see an id never placed at all. F142.

**What the column counts, stated because it is not what the header used to say.** `ids keyed`
is *ids appearing in bold inside a group's section*. This document keys in two forms — a table
row's first cell, and bold in prose — and nothing distinguishes a key from a mention: table
cells alone find 78 and leave groups 6 and 13 keying nothing at all. So the number, and SP6,
prove **coverage and not placement**, exactly as SP5 checks a citation's existence and not its
aim. Tightening the key form to table rows only is real work and is not done here; until it is,
a finding bolded in passing inside a group it does not belong to is counted there.

**The groups are not disjoint, and an earlier version of this paragraph claimed they were.**
F30 is keyed in group 4 and again in group 7 — it genuinely is both a verdict the union lacks
and a drawing that asserted one — so group 7 names fifteen ids and counts fourteen, excluding
the one already counted. **The sum reaches 89 either way**, which is the point: a total over
group sizes cannot see a duplicate that was placed twice and counted once. That is F87, and it
is this document's own check failing the rule it was built from — *assert the artefact, not a
proxy*. A disjointness claim wants `sort | uniq -d`, which is one line and was never run.

That check exists because the F55 version had a heading reading *5 surfaces* over a row listing
six. **A count that disagrees with its own row reads as authority and is the cheapest possible
error to make** — which is also F65's finding, one document out. Deriving the list rather than
transcribing it is the pattern for any future inventory here; deriving it does not make it a
partition.

**F87, F88 and F89 are filed and not yet grouped above** — they arrived from the step-3a
partition, which is `CALCIUM_GAP_PLAN.md`. Regrouping is 3b's, with the roadmap rewrite.

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
not on the list at all.** A whole group about the apparatus every other finding was measured
with — the size is in the ranking table and is derived, not restated here — and its disposition — *every instrument gets a fixture it must reproduce* — is cheaper
than any of the four entries ROADMAP already carries.

ROADMAP is **not** edited here. Step 3 rewrites it from this file.
