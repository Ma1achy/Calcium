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
| **2** | [A complete mechanism, unreachable from the other side of a seam](#2) | 23 | **5 open** (8 closed) | ⚠ C04 · C23 | real Calcium work · **7 of 13 fixed** — and F165 is the first found by roadmap 48's residue rather than by a consumer reaching for something |
| **3** | [A block cannot express what the surface needs](#3) | 6 | **4 open** | ⚠ C04 | mixed — two absorbed |
| **4** | [A change axis distinct from `Tone`](#4) | 4 | **4 open** | ⚠ C04 · C09 · C10 | real Calcium work · needs a ruling |
| **5** | [The far side's shape is not the framework's contract](#5) | 10 | **2 open** | ⚠ C05 | mostly app-side · one shim |
| **6** | [Rendered from data that has since moved](#6) | 2 | **2 open** | ⚠ C04 | real Calcium work |
| **7** | [An artefact describes the world rather than being checked against it](#7) | 34 | **20** | — | artefact discipline — **no code**, and F164 is the first found by an instrument's *population* step rather than by a reader; **F210 is the first where the artefact is a component's own spec and the thing it contradicts is a shipped frame**, and **F233 the first where what it contradicts is a *fix*** — four present-tense statements of a repaired defect, in the two components the repair did not touch |
| **8** | [Absence indistinguishable from failure](#8) | 19 | **7 open** (7 closed) | partly | real Calcium work · **7 of 10 fixed** — F151 is the class F35 closed in the half an app-side test cannot reach, and **F167 is the class arriving in a *value*: a validator agreeing twice about two different documents** |
| **9** | [**The instrument was wrong**](#9) | 43 | **17** | — | **new at F80** · tooling — F155's instrument is not ours, and **F157's cause is the language the harness is written in** |
| **10** | [**A claim carried without a record**](#10) | 22 | **10** | — | **new at F80** · method — six findings disproved, and **F166 unblocked an entry while F168 found what the same row was silent about**; F184 is the first where the unrecorded claim was a *rule* rather than a fact, governing thirty forms from a parameter's doc comment |
| **11** | [A gate that passes without checking](#11) | 57 | **15** | — | 9 closed · **7 open** — four about a rule's reach, and **F163 about a gate's *scope*: golden stops one layer below the painter** · **F173 is the group's own instrument, blind to 23% of what it counted** |
| **12** | [**A time-based assertion under contention**](#12) | 2 | **2** | — | **new at F80** · Calcium's own suite |
| **13** | [Text the framework emits](#13) | 4 | **4** | — | real Calcium work · needs a ruling · **F152 and F153 are a different half — the text is substituted and points at the wrong thing** |
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
## 2 · A complete mechanism, unreachable from the other side of a seam — **5 open, 8 closed** ⚠

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
| **F227** | **`RenderContext.tick` — declared, honoured by `steps`, covered by C09 T6.13, and never advanced.** Ten real frames drew `⠋⠋⠋⠋⠋⠋⠋⠋⠋⠋`, **one distinct**, against the same block through `measurable({tick})` giving **ten**. Three links: nothing calls `commit("spinner")` in `src/`; `visibleRows` omits `tick`; the line cache has no tick axis. **Two of the three were already written down** — C22 I60 and §6c row 10, correctly and as a coupled pair — **and filed as a hypothetical**: row 10 reads *not reachable*, which is exactly true of the cache defect and false of the animation, and one phrase names both. The unrecorded link is the first, and it is what makes the other two look dormant. **Patching link 2 alone moves nothing**, which is *two blockers reading as one*. **Fixed** — all three wired, re-measured at eight distinct frames over ten samples against one before, and C03's 100 ms window is recorded as a floor under the set's own 80 ms, which nothing said before | **fixed** |
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
| **F199** | the framework — I40's cost paragraph is exactly right about a **pie**, and it was written about *layers*. Two wedges meet along a boundary, so *a seam a cell wide* is the whole of it; two curves run alongside each other, and the same union draws 25 foreign dots against 20 own in the cells `slope-default` shares, gives 70 of the braille radar's 279 frame cells a series slot, and makes 80 of the quadrant radar's 98 coloured cells frame. **The promotion happened inside the sentence that carefully stated the limit** — *the colour is still one layer's, and that is a limit rather than an oversight* reads as the sober caveat a reviewer wants, and it is the one that carried the defect. *Stating a limit is not measuring it.* **Fixed** — `Layer.kind` partitions by what a layer is, surfaces union and curves occlude |
| **F202** | itself — `node tools/plot-catalogue.mjs` is in the header of a file that cannot run that way, and so is `node tools/catalogue-png.mjs`: both import `../src/**/index.js` against `.ts` sources and exit on `ERR_MODULE_NOT_FOUND`. Covered by vitest fixtures, which is what resolves them. It cost a probe that wrote the catalogue loop a second time — the hazard the file's own comment names — so both main blocks are exported functions now. **And the extraction ate `clearGenerated` whole**, anchors matching and braces balanced; *reading the diff of a mechanical rewrite* caught it |

| **F239** | the framework — a walk artefact's row answered *what happens to a floored block inside a bounded container* with **C09 I33**, which is the **transcript viewport's** rule (`windowSequence` keeps it whole and pays from `skipRows`). A `scroll` is a different mechanism: measured through the real containment path, `scroll{height:3}` holding a child floored to 7 gives **measure=4, rendered=8** — neither clipped nor kept whole, but **over-drawn**. And it is not missed: C04 §3c trace 1 rules it and names why — *taking a child's top n rows needs a windowing seam `RenderContext` does not have* — with C25 I1 knowingly false there and T2.28b holding it open. **The row cited a real invariant governing a real mechanism, and not the one in the cell**, which is the sixth blind spot arriving inside a walk artefact. Caught by being asked to confirm it rather than by anything in the suite |
| **F245** | the framework — F244 §4's remedy did not compose, and the build falsified the sentence within the hour. `overflowX: "hidden"` on the container looked like the answer to an absolutely positioned child running past its parent's width, and Ink applies `clips.at(-1)` — the **innermost** clip — so a descendant *replaces* its ancestor's rather than intersecting with it: three 1-wide cells in a container of 1 draw `"A"` when only the container clips and `"ABC"` once the cells clip too. Every cell must clip, since that is the other half of C09 I35, so the backstop is shadowed in the only configuration the block has. **The geometry is the guarantee** — `mosaicRects` clamps and a cell with no room is not drawn. **C23 §8a A4's class from the implementation rather than the walk**, and a harder one: the operation exists and does something other than what its name suggests, which no row of a classification table asks about. **The mutation pass then indicted a row** — `the cell does not clip` survived because MG6's single-region fixture let the container's height bound the spill, so the row could not construct the state it claimed. **Fixed**, both |
| **F249** | the framework — **Ink strips APC escapes**, so the kitty arm is built and has no call site. The ruling was a chain of true statements — `a=T` replaces at a stable id, Ink writes nothing when nothing changes — whose conclusion was about a mechanism nobody had run: measured, an `ESC _G` in a `Text` node renders to `""` while SGR survives unchanged. **Third ruling this phase the implementation falsified**, after the mosaic's clip and `graph`'s clamp, and the shape is identical each time. `imageDefinition` takes the dither at every protocol including `kitty`, since **nothing is worse than a dither on a terminal that could have shown one**; the expiry is `transmitImage`. **Three more from the same phase.** `Decoded.pixels`'s exemption **removed itself** three commits after it was written, the bidirectional arm firing the moment its named expiry landed. A corpus fixture typed from memory did not decode, so every row took the `alt` fallback — hiding two faults in it: Ink's `wrap: "truncate"` emits `…` where I22 wants `~`, and an empty `Text` occupies **no row**, so a three-row block drew one and I1 came apart corpus-wide. And three mutation survivors meant three different things — the harness, the fixture, and **the assertion**: `sharp` wrote filter **0 on every scanline** so Paeth was never exercised (the PNG is hand-encoded now, forcing all five arms), and point-sampling survived *twice* because counting distinct glyphs accepts both readings. **Two were the test, one the harness, none the code** | **fixed; the arm awaits `transmitImage`** |
| **F250** | the framework — **a geometry measurement answered a rendering question.** The overlay's fork was ruled *placed* because `imageCells` is capability-independent — measured, `w=40 h=4` gives `8x4` at kitty and at the dither alike. True, and it settles where an image **lands**; the overlay asks what a cell **shows**. **At kitty a placeholder cannot be painted over**, and the reason was already written down in `placeholderCell`'s own comment, composed the same session for the id: *the id travels as a colour because the cell has nowhere else to put it — which is why this arm needs no palette from C10 and why C10 owns no part of it.* The cell's rendering is the terminal's, so a Calcium heatmap over a placement is **not visible** rather than inexact. **The ruling holds at the dither and inverts at kitty**, and the overlay becomes a field whose rendering differs by arm — a mechanism, not an arrangement. **The reusable shape**: a geometry measurement reads as settling a rendering question because both are about where things are, and **no rule-interaction artefact reaches it** — the two statements live in different components, agree about their own subjects, and meet only when a third thing needs both. Third same-session correction this phase, and the first whose falsifier was a comment I had written myself | **ruling corrected; the overlay is not built** |
| **F251** | the framework — **the picture's identity is not the image's.** §3g.2 rules the identity a digest of the *data*, for three reasons all still true, and the kitty arm keys transmission on it so one image in two blocks transmits once. **An overlay makes the transmitted picture a function of two things**: two blocks of one image with different overlays share a digest, the second is found in the sent set, and **both draw the first block's overlay** — the wrong picture rather than none, with every count agreeing. Fixed by `imageKey`, one function and two callers, while `digest` stays the data's because it also keys the decode. **The shape**: an identity is correct with respect to the things that existed when it was specified, and adding a field that participates in what it identifies makes the **scope** wrong rather than the reasoning — which is what review does not check | **fixed** |
| **F253** | the framework — **a shared scale is not a property any panel has.** §3h closed claiming *none of the three compositions needs a mechanism this section does not have*; all three were built as a consumer would and **two of three predictions were wrong**. Image + histogram was predicted to break it outright and composes — the premise was wrong, not the reasoning, because **the consumer already holds the pixels**: they encode a PNG to *show* an array and the histogram is of the array. A layering argument can be exactly right about the layers and wrong about who is standing in them. The confusion matrix composes. **Before/after/residual breaks it**: panels spanning `0.7..157.7` and a residual spanning `0.7..14.1`, whose hottest cell renders at luminance **202** against a panel's **224** on its own extent and **13** on a declared one. Each panel correct alone, each normalisation correct alone, and **the composition is where the falsehood appears** — so no walk of the block reaches it. Residue: `decodePng` is not on C24's surface, so a `path` consumer can show a picture and plot nothing about it | **fixed** (§3h.3) |
| **F255** | the framework — **four local answers where the family already had them, and three were worse.** The overlay's shared scale was ruled from first principles that were already in the tree: `seriesRange` carries F253's own sentence, and `heatmap.ts` rules outright that *on a field `yMin`/`yMax` pin the **value** range — the levels and the colour scale*. An overlay **is** a field form over a picture, so the pair was `min`/`max` where it should have been `yMin`/`yMax`; both-or-neither where the family is independently optional (`yMin: 0` alone is a loss curve's floor); `{v, v+1}` for a constant field where the family gives `{v, v}` drawn **mid-ramp**, the local one saying *all minimum* about data that never varied; and a refused reversed pin where C12 I2 collapses it. **The fourth local decision was right — a pin replaces rather than widens — and that is why the other three read as a considered design.** Each was defensible alone: *both or neither* protects against a half-shared scale and also forbids a use the family had already weighed. **The shape is the sixth blind spot pointed at a member rather than at a claim** — not *where is this written down* but **who else already solved this, and did they call it something**, which is cheaper because the answer is a grep. `pinnedRange` is now one function with two callers, extracted with **zero golden frames changing** | **fixed** (§3h.4) |

| **F235** | the framework — C09 I31's one-row rung, *at one row the message wins … a countdown without its cause is a number nobody can act on*, is a correct sentence about `error` and `retrying` applied to all three states. `loading` has no cause, so the clause is silent about which row to keep and reads as though it has ruled; wired up, `b.live` drew `loading` over `⠋ loading` — **the word twice, with every count agreeing**, `measure` saying 2 and `render` drawing 2. **MG24's shape**: review checks whether a justification is true and this one is, so the question that reaches it is *does this sentence constrain the case it is applied to*. **Fixed in the rung, not at the caller** — a one-row `loading` is wrong for the registry and for a consumer too, and choosing height 2 at `b.live` would have hidden the evidence. Fourth defect in this sequence that only a frame found |

| **F210** | itself, and the frame — §3d's cost table lists *request rate · 392 … 960 · snapped 250 … 1000*, and the shipped gutter labelled that floor `0`, because `yLabels` niced the already-snapped range a second time and `niceAxis` is not idempotent. **The document held the right number and the frame drew another one, for as long as both existed.** A table in prose and a number on screen are exactly what no instrument compares — which is this group's whole subject, arriving in the component's own spec rather than in a design document. **Fixed** by removing the second computation: one `Axis`, computed where the data is measured and handed to the rasteriser and the gutter alike. **The previous remedy is what built it** — the same class was found on this function once before and fixed by making the two nicings agree about *scale*, and they stayed free to disagree about *range* |

| **F211** | the framework — C12 I26 says a gridline goes where a value is written, *the rows the gutter labels and the columns the bottom rule ticks*, and the vertical half was blank on every plot with a numeric abscissa: the grid took its columns from the **captions** arm while the rule below took its own from the full dispatch. **The one fixture the corpus renders at `grid` declares `xLabels`**, so every committed frame walks the arm that works. **Fixed as a consequence** — once the axis is a parameter rather than re-derived, the grid using anything else is obviously wrong, which is the note: the defect was invisible while the value was recomputed |

| **F233** | itself — F227 named three components and its fix touched one spec: `cc84ca4` is C22 +8, C03 **0**, C09 **0**. C03 §3 and C09 §2, §3a and I32 went on saying *the counter does not currently advance* after it did, and those four sentences sourced a false premise into a plan. **The sweep then found two more in C22 itself** — I60's lead sentence is *`ctx.tick` is not in the key* with the repair eleven lines below under *Resolved by…*, and row 10's resolution stops at *owed*. **So the axis is the headline versus the body, not which component**: appending the history is the natural motion when closing a finding, and it leaves the one sentence a reader takes away pointing the wrong way. Six statements, three components, **the two worst in the file the fix was careful about**. Opposite direction from F86 · F89 · F92, where a summary *weakened* a body. Third fact, same mechanism with the tense removed: `blocks/animation.ts` is 78 lines in **C09's** directory whose only documentation was a test row in **C22's** list. **Fixed** — and the mechanical half is named and not built, because two instances is the minimum for noticing a rule rather than evidence for one |

| **F217** | itself, in **both directions in one section** — §3n's *a frame's label is written inside it where it fits* is filed under the treemap, which is the one form that ignores it, while the strip renderer beside it obeys; §3g asserts *one row closes two conditions* and `Annotation.label` still does not exist; and §3g's *skipped entirely at `colourDepth: 1`* is the **earlier draft**, with the fix living only in `legendEntries`' comment. **F128 keyed three divergences all in one direction and these are two**, which is why the obvious gate would pass half of them: a rule assuming the spec is aspirational passes the third, one assuming it is stale passes the first two. **Fixed** |

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


## 8 · Absence indistinguishable from failure — **7 open, 6 closed**

Every instance is invisible by construction: a green suite, a plausible frame, no diagnostic.

| | what vanished | state |
|---|---|---|
| **F35** | three app documents setting `status: "error"` and omitting `error` | **closed as a class** — `documents.test.ts` runs every document this app can produce through the validator |
| **F151** | **the framework's own `shell` route, same class, fourth instance** | `runShell` composed `status: "error"` with no `error`, so every failing bare word was refused by `transcript.append` and produced **no entry** — the reader shown two invariant numbers instead of their command. **F35's closure cannot see it**: `documents.test.ts` runs the documents *this app* produces, and this one is produced by the framework. `noticeDoc`'s closure cannot either — the route does not go through it. **Fixed** (C23 I50) |
| **F29** | the framework's own default `renderError` threw, mid-stall | **fixed** |
| **F40** | a view's window, measured a block at a time — C15 cut the excess silently | **fixed** |
| **F230** | **a block's rows, and whatever followed it in the entry** — the same class as F40, one seam over. C09 enforces I1 nowhere: a kind measuring 1 and rendering 3 returns three lines. `visibleRows` reconciles by `rows.slice(0, ve.takeRows)`, and `takeRows` cannot exceed C14's index — so the over-drawing block keeps its first row and **the block after it is not on the frame**. No fault: `BlockFault`'s three arms are `measure`, `render` and `elements`, and this is none of them. **The repair exists one level up** — `paint.ts` made the region's trim a `FrameError` with a comment about the trim *quietly reconciling* two quantities, and the per-entry trim still does. Unreachable today at **15 kinds × 4 widths, zero divergences**, and the deferred height change is what makes a disagreement ordinary | open, and the height change lands with its report |
| **F47** | a pushed view did not follow its own stream | **fixed** |
| **F61** | **`/logs` had never worked** — mawk block-buffers, so a `--follow` produced an empty screen for as long as the verb existed | **fixed** |
| **F224** | **a container's whole subtree, out of the focus walk** | `elementsOf` contains a throwing `elements` and answers *no elements*; the ownership question is a **separate call** that asks whether the member is *declared*, catches only resolution, and answers *it owns them, do not descend*. Two answers about one block, and the pair costs the subtree rather than the block: measured **0 elements against a control's 4**, with `↓` skipping the lot and nothing said. `scroll` is a shipped kind that declares `elements`. **And the ruling it was meant to satisfy names an outcome that does not exist** — C26 I12's *focus falls to the block level*, where `FocusState.rowId` is `string | null` and `null` is constructed **nowhere in `src/`**, so an atomic block is skipped rather than focused. C12 §3ah's class in another spec: right about the interaction, wrong about a mechanism it assumed. **Ruled** — C09 I30 and a corrected C26 I12; T3.37 asserts both arms, because the throwing arm alone passes at 0 and 4 alike |
| **F15** | an invalid document — no entry, no error, no clue | open, and it is the mechanism |
| **F64** | `b.logs` has no consumer in this app at all; the surfaces document says it demonstrates tone on log lines and it does not | open — a claim, not a feature |
| **F67** | **below 16 rows the shell draws nothing, says nothing, and stays alive** | **closed** — the gate existed and neither half ran (C01 I12b, C22 T4.21) |
| **F167** | **a document that persists and reloads as a *different valid document*** | `NaN` in a plot series validated, `JSON.stringify` wrote it as `null`, and the reloaded document validated too — the second agreement is the defect. Under it, `Series.values` and `Cell.spark` were never element-checked at all, so a string in a numeric array passed with or without a round trip. Four sibling numeric fields already used `isFiniteNumber`. **Fixed** — C04 I46, T2.19, T6.27, T6.28 |
| **F170** | **the gap had no legal spelling** — C12 I4 renders a non-finite entry as a position with no reading, C04 I46 refuses one, so absence was expressible in the type and in no valid document. The docker ring had been building such a block for a commit and nothing noticed, because a constructed block never reaches the validator. **Fixed** — C04 I46a, C12 I4, T1.16, T2.19 |
| **F171** | **a ramp step that draws as padding** — `RAMP_BRAILLE` began at `U+2800`, so at `ambiguousWidth: "wide"` every sparkline drew its *minimum* as whitespace, which the right-anchor already uses for *fewer samples than cells*. `cells()` counts it as one and no golden frame renders that arm, so every width and length row passed. **Fixed** — C12 I16, T1.15, a golden frame for the arm |
| **F172** | **an unknown `ColourRef` resolves to no style, silently** — `resolve()` returns `NO_STYLE` when a palette or slot is missing *and* when a decoration palette collapses at 1-bit, so *this reference does not exist* and *this reference means nothing here* are one value. The empty-block class in the resolver, and entry 3's fourth palette family is what makes it reachable. **Open** — a missing family belongs in `ThemeError`, where contrast failures already go |
| **F240** | **a degradation ruled for two rungs with a reason forced at one** | C09 §3a rules *the pair degrades together — at 4-bit and 1-bit there is no ground and no ink*, I31 cites it and **T3.46 asserts both halves' absence** two-armed and on purpose. **Filed with the wrong headline**: the code, the tokens, the maps and four frames were measured and the instrument not run was the one that asks where the behaviour is written down. **The finding survives, better** — the reason is right about the *pair* and silent about the *rung*. At 1-bit C10 I8 forces it. At 4-bit the ladder has a rung and `diffAdd`/`diffRemove` are text-bearing grounds curated at that depth in the same file: the pair is not degraded, it is **unfilled**. `FourBitMap` is `Readonly<Record<string, number>>`, so an unanswered slot and a deliberately unpainted one resolve identically — **three of ten missing in all three themes**: `selection`, `errorGround`, `errorInk`. And three missing arms are probably three cases: `selection` is a wash behind text it does not own, the pair is a tag that brings its own ink. **Ruled** — the 4-bit arm lands, 1-bit is untouched, T3.46 splits its two depths, and `selection` is named as roadmap 23's rather than folded in |

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
| **F254** | Calcium's own suite — **an assertion that sees one encoding of a thing reports its absence.** IO3 asks whether the overlay is *absent* below 8-bit or drawn in a vocabulary that says something it should not. It read the frame for `\[38;2;` — the 24-bit SGR form — and reported **nothing drawn at 8-bit**, which is where `continuousColour` quantises to the 256-cube and emits `38;5;N`. **A control separated the readings**: the same row asserts the picture's glyphs are unchanged, and they were, so the cells existed and were invisible to the instrument rather than missing from the output. **The fixture rule pointed at an assertion** — a matcher is a fixture, and one that sees a single encoding cannot distinguish *the rung is absent* from *the rung is a different escape*. **The degradation ladder is the worst place for it**, because every rung below the top is a different encoding by construction | **fixed** |


## 9 · The instrument was wrong · new at F80

**This group did not exist at F55, and its size is stated once — in the ranking table.** It is
listed high despite one open entry because of what the count means: every frame-read in steps
9 through 13 went through `screen.py`, and F79 is the **first time its output was checked
against the bytes it was replaying.**

| | the instrument | what it did |
|---|---|---|
| **F205** | **F203's own turn, for any contested run that is vertical** | *Which peer owns a contested cell turns with the column* was measured on `slope-default`, whose lines run roughly horizontally — and `x % peers.length` does not change down a column, so two curves overlapping vertically give every cell to one of them. **Found by asking whether the radar works at 3, 4, 5, 6 axes**: it does, evenly at every count from 3 to 10, and at *two* both polygons lie on one vertical line and one series took 9 of 9. **No positional key fixes it** — alternating on (1,0), (0,1) and (1,1) mod 2 is the checkerboard. A **counter** is not positional: it resets each row, so a vertical run advances on the row index and a diagonal on the row index with the counter at zero. **Fixed** — closest split 7/7, furthest 5/7, nothing starved. *And the probe was wrong twice first: collapsing a radar series to nulls leaves the frame in the alone-render, and the first run reported a series holding zero at every count* |
| **F232** | **`tools/mutate/anchors.mjs`, one turn after F173 fixed it** | F173 widened the pattern from one quote style to two and stopped at the form in front of it. A `from:` written as a `+`-joined run of literals on its own lines matched `from:\\s*("…")` with `\\s*` crossing the newline, so **the anchor held was the first fragment alone** — and a fragment resolves where the whole does not. Six of 838 across five runs; the total is **801 before and after**, so nothing was uncounted and one string per anchor was simply the wrong one. Measured on the commit that moved one: the gate said *no run drifted*. **Not F173 again but one shape worse** — read wrongly rather than unread, which is the truncated form of *an instrument can manufacture evidence*. **Fixed**, anchor repaired, `c23-faults` re-run whole. The reusable part: a widening should count what it still cannot reach, and here that was one grep | **fixed** |
| **F207** | **`STYLE_ARMS`, for four of one form's five drawing routines** | The record is `Record<PlotForm, readonly PlotStyle[]>`, total, compiler-checked, with a row asserting every form declares — and it says `violin` has a braille arm. **A violin has five drawing routines and one of them had it.** The vertical arm and all three raincloud rungs accepted `plotStyle` and `plotFill` and changed nothing. *Accepted at construction and ignored at render is the worst of the three answers* — worse than refusing, which tells the caller, and worse than degrading, which tells the reader. **The arm belongs to a routine and the key is a form**, so a record total over its key reads as a complete answer to a question it cannot ask, and the totality is what makes it convincing. **Fixed** — the vertical arm is the transpose, sampled at four dot rows a cell of value; and the raincloud rungs get it too — the argument for exempting them compared the vertical axis alone, and a cell is eight dots as 2 x 4, so the ladder spends all eight on magnitude at one sample a cell where braille spends them as five levels at twice the sampling. Equal budgets, different split |
| **F209** | **four assertions, each answered by a neighbour instead of the subject** | The vertical raincloud's cloud grows leftward out from the box; flipping that anchor survived four forms of the row meant to catch it. **Whole-figure centroid**: the clouds saturate their four cells, and mirroring a full run changes nothing. **Per-row leftmost**: a chart has three bands, so a row's leftmost ink is the *first* band's and never moves. **Per-row rightmost**: the last band's *box* is. **Inked-cell disagreement**: 3.6% correct against 9.9% flipped, and a number between them is a threshold chosen to be safely true. **What worked was dropping to the unit** — `rainColumns` for one band, leftmost per row, tolerance one cell. *Three of the four are one shape: a figure with more than one band cannot answer a question about one band's geometry, and the fix is a smaller subject rather than a sharper statistic.* And the row now checks that its own fixture narrows, because a saturated cloud makes every direction assertion vacuous |
| **F218** | **MG24, for any of the 928 members whose name is not exact** | Adding a file with a local `let blocked` failed `make enforce` on `GlyphSet.blocked` — an undrawn glyph in another directory, still undrawn. MG24 resolves consumption **by name**, and `UNCONSUMED_MEMBERS` is a **gated** list, so a name collision anywhere in `src/` clears an exemption. **The instrument prints its own limitation on every run** — *exact for 488/1416 members* — and that line has been read as a precision figure about a reported number; it is also a correctness figure about a gate. **The loud direction is the safe one**: the quiet one is a local variable making an *unexempt* member read as consumed, so MG24 stops asking about it, and `id`, `kind`, `text`, `label` and `width` are the top five collisions and all five are ordinary local-variable names. **Not fixed** — the rename to `blocker` is better on its own terms, and resolving by symbol is a change to the instrument that wants F105/F160 in front of it. First instance where the imprecision has teeth rather than only noise |
| **F219** | **the mutation harness, for any anchor that matches more than once** | A mutation against `HAS_X_TITLE` anchored on `heatmap: false, calendar: false, …`, which appears **four times** in `types.ts` — the matrix family answers `false` to every one of those questions. `replace` took the first, a different record was flipped, and the harness printed **SURVIVED**. **That is the wrong bucket**: a *missing* anchor is reported as itself, so a row cannot read as verified when it ran nothing; an ambiguous one runs something, mutates the wrong thing, and lands in the bucket that means *write a test*. Neither `mutate.mjs` nor `anchors.mjs` asks about uniqueness — existence and uniqueness are different questions and only the first is asked. Measured as a **floor**: 5 ambiguous of 471 anchors a parser could resolve, across `c04-round-trip`, `c10-colormap`, `c10-named-set`, `c12-absence`, `c12-origin`; `anchors.mjs` counts 744, so the probe reaches 63%. **Not fixed** — the check belongs beside the staleness walk and can only be gated once the five are re-anchored |
| **F208** | **`tools/mutate/anchors.mjs`, for an anchor that resolves to the wrong site** | Adding the vertical braille arm put a second `const fineD = kde(finite, fine, bw)` **above** the one a mutation named, and `apply` takes the first — so the row silently changed subject and survived. **F201's third disposition**: not a stale anchor and not a weak test, but an anchor that is present and *no longer unique*, which nothing checks. **And re-anchoring was not enough** — `SA10` asserted *it changed* and *it is braille*, both true of a violin drawn to a quarter of its length, and even the bounding box passes because the spine runs the full length whatever the body does. The centroid is what catches it: §3w claims the fork changes vocabulary and not geometry, and where the mass sits is the geometry |
| **F206** | **nothing at all — one form drew two figures and no artefact could disagree** | The radar's braille arm drew value rings with `arcDots`, circles; the quadrant arm drew *n*-gons through the data's own vertices. Same form, same spec, two figures, and each arm had reached for the routine nearest to hand. **Invisible to every instrument here**: both render, both are internally consistent, no invariant names the ring's shape, and the golden corpus records each arm against itself. *A difference between two implementations of one rule is only findable by putting them side by side, and nothing schedules that.* Surfaced by a reader asking for the thing the other arm already did. **Fixed** — `plotGrid` (I45), polygon by default. *And the default moved a mutation's subject: `arcDots`'s stipple is the circle grid's mechanism alone now, so its row renders `plotGrid: "circle"` on purpose* |
| **F204** | **`catalogue-png.mjs`, for a glyph it modelled instead of rendering** | Braille was drawn by hand as circles from a bitmask: radius `min(cellW, cellH) * 0.1` — **1.7px against a pitch of 4.5** — with the two dot columns pushed to the cell's edges, 5.9px apart in an 8.4px cell where the true pitch is 4.2. So `⣿`, a **solid** cell, previewed as scattered specks and the pie that *looks like ass* was a solid disc. **Every judgement in this arc went through it** and those judgements drove three rulings. **Correcting it by eye overshot the other way** — 3.2px against the font's 2.04, 47.8% ink against 20.2% — which the reader caught as *the older version looked better*, and they were right twice. **Fixed by deletion**: the map, the renderer and the duty constant are gone and the font draws braille like every other glyph. The independence the circles bought was never had — box drawing, blocks and letters all come from the same stack. **`PC5` asserted the dot map and passed throughout**: *a fixture over a model cannot see the model being wrong* |
| **F203** | **the loss probe, and the suite that licensed a deletion** | F199 swapped a bleed for occlusion and the reader's next words were *now the lines don't render where the bleeding was* — and *you just deleted the parts that were broken*. Both right. **The probe counted a dot as *shown* when it was drawn in another series' colour**, so it reported 5 columns lost of 67 while the picture showed blue and green absent through the whole crossing: an instrument that conflates presence-of-ink with presence-of-this-series can measure neither failure. **And `LM6` asserted *no cell draws another series' ink*, which deleting the other series satisfies perfectly** — one of two opposite failures asserted and the other one free. **Fixed** — four rules rendered and looked at rather than argued about; the answer was `tone.muted`, *several*, whose precedent (§3r's doji) was one section away the whole time. 0 deleted, 0 mistinted, 11 cells naming neither. *The neutral is wrong for a surface, and only the picture said so: at ten segments it greys a whole sector of the pie* |
| **F79** | `tools/screen.py` | rendered `\x1b[38;5;188m[3/3] RUN …` as `38;5; RUN …` — an SGR fragment exactly where a six-cell step number belonged. **The app was correct.** Open |
| **F63** | `tools/capture.py` | decoded each 64 KiB read independently, so every read landing mid-UTF-8 put U+FFFD inside a panel border. **Fixed** — incremental decoder, zero replacements against one per beat |
| **F157** | **the capture harness, and Python itself** | the shot asks for LANG=C, the child also gets LC_CTYPE=C.UTF-8 that nobody set — PEP 538 coercion, inherited through pty.fork, outranking LANG. The ASCII degradation shot has never shown ASCII: 6,833 box-drawing dashes in the picture whose job is the fallback. **Fixed**, three fixture rows |
| **F198** | **a fork's alphabet, and a frame that answered *weight* with *holes*** | The radar's line arm took **four** vocabularies: `strokePolyline` steps orthogonally and a pentagon's every edge is oblique; `╱`/`╲` draw a clean pentagon *in isolation* and compose to rubble, because I40's union is braille's alone — *the same input, two answers* is what separated the stroke from the merge; one grid with an owner per cell fixes that and **still renders as dashes**, because those glyphs are strokes inside a box and miss their corners; **quadrant blocks are filled sub-cells and connect**. §3c is what the answer turned out to be — *a renderer names an axis, never a vocabulary* — and the previous commit had removed the arm on a fact about **one** alphabet. **The frame's gaps were deliberate**: rings stepped every fourth dot on §3g's *a scale drawn as heavily as the data competes with it*, an argument about weight answered by leaving holes, and a stippled ring reads as a broken one. **Two measurements moved the tests** — total ink only shifts 289→266, so the assertion is the longest unbroken run (25 against 15); and `Math.max` gave the frame's tone to every polygon crossing it, which only a colour row can see. **Fixed.** *And a `git checkout` to compare two renders destroyed the uncommitted arm — a restore from the index, not an undo, exactly as this repo's notes record* |
| **F197** | **a styling fork shipped broken, described as a trade-off in its own commit message** | `radar` with `plotStyle: "line"` was unreadable — *the entire shape of the plot is broken*. The previous commit called it *blocky and legible* and it is not legible; describing a broken picture as a trade is how it got past a frame-read that had already seen it. **Three attempts, each fixing a real defect, none of them the last**: `strokePolyline` steps orthogonally and a pentagon's every edge is oblique; diagonal glyphs and a per-cell stroke draw a clean pentagon *in isolation* and compose to rubble, because I40's union is braille's alone — the same input giving two answers is what separated the stroke from the merge; and one grid with an owner per cell, no merge at all, **still renders as dashes**, because `╱` and `╲` do not reach their cell corners. **The last is the alphabet's, not this component's.** **Fixed** — `STYLE_ARMS.radar` is `["braille"]` and `line` is refused at construction. *Braille has eight sub-cell dots that connect and a bit-per-dot encoding that unions; a radar of crossing oblique edges needs both* |
| **F196** | **A03 commitment 14's equality, for a rule absent from the list both its sides are built from** | SP8 ran on every build, reported 120 dangling citations across 58 targets, and was in neither `SPEC_RULES`, nor A03's table, nor the fabrication suite. **F146 exactly, and the suite was green for the opposite reason**: commitment 14 compares `implemented` against `covered`, both derived from `SPEC_RULES`, so a rule missing from that list is missing from both and the equality holds over a set that does not contain it. *A check comparing two derived sets cannot see a member absent from the source of both.* **Fixed** — registered in all three, with three test rows, and the ungated state written as a **self-expiring** assertion: the residue is asserted non-empty, so the day the last citation is closed the row goes red and says to gate it. That is CLAUDE.md's *a deferral names a condition and nothing watches it*, watched. Four of the residue were this session's own and are closed; the rest need their authors' intent rather than a sweep |
| **F194** | **a mutation that hung, and the tree it left behind** | *The braille violin does not resample* reuses the cell-resolution densities; half the array is then `undefined`, `undefined / max` is `NaN`, and `drawLine` walks until `x === ex`, which `NaN` never satisfies. **`niceAxis` records this exact class about itself** and clamps its own span for it; the braille arm reached the same raster with no clamp. **A pass that goes quiet is not a slow pass** — one run of that file is 1.6s, so eleven is under twenty, and timing a single run is what separated a hang from a schedule. **And the killed run left `const fineD = densities` in the tree**: `make check` and the suite would both have passed a commit with a mutation in it, because the guarded version renders — it just renders half a violin. **Fixed** — the offset is guarded, and auditing every `to` string against the working tree belongs after any killed pass |
| **F195** | **three of the fork suite's own rows, each true of the mutated output** | *The outline is dots* survived a mutation that collapsed half the violin, because dots are still dots; *both halves have more than ten cells* survived one that left 99 against 241; *the same widest row* survived a threshold change that grows the disc by its **rim**, which neither the row count nor the widest row measures. **Guessing the sharper form failed twice** — what worked was applying each survivor by hand and printing the numbers, so the assertions are relations now (519 against 540; within a sixth) rather than thresholds chosen to be safely true. **And the radar row is the keeper**: *the figure contains box glyphs* stopped distinguishing anything when the frame started following the style, a change made the same session for an unrelated reason. **An assertion can be sharpened out from under itself by a neighbouring fix** |
| **F193** | **the golden corpus, catching a regression the mutation pass structurally could not** | I42's delegation — *binned, a histogram is a bar chart of counts* — rewrote `form` to `"bar"` on the way. `ROW_IS_AN_IDENTITY`, `HAS_POSITION_AXIS` and `SHARES_CELLS` are all keyed on `PlotForm`, so **every bin came back in a different colour: I38's defect, in the commit that fixed I42**, and the user's original report reintroduced four steps later by a delegation whose purpose was unrelated. **Nothing else could have caught it** — the type checker sees a valid `PlotForm`; the new rows have no single-colour claim to make; I38's own rows render `histogram` blocks and the substitution happens inside the renderer, past their reach; and every mutation of the new code was caught, because the defect is not in the new code but in one word of the block handed to old code. **Fixed** — `form` stays `histogram` and all 292 frames pass unchanged, which is both the proof the regression is gone and the proof a single-series histogram is byte-identical. Second time in this arc a `-u` would have laundered a defect into the corpus |
| **F192** | **`categoricalForm`, for every category past the height** | `labels.slice(0, areaRows)` drops the excess with no notice, no count and no mark: eight categories at height 4 draw four, the frame closes, the axis is correct and every count is right. **A reader cannot tell they are looking at half a chart.** I8 is the neighbouring rule and does not cover it — it is about *series* named in a legend, and these are categories, which have no such counterpart; §3g's *horizontal placements truncate with a count* is the shape the remedy would take. **Open.** Found by making it twice as likely rather than by looking for it: a grouped histogram is one row per *(bin, series)* pair, so two series double the row count and a chart that fit stops fitting |
| **F189** | **the rasteriser, for every non-linear `yScale`** | `axisFor` dispatches on the scale and returns log-valued ticks; `rowOf` places by `(v − min) / (max − min)`, unconditionally. A scatter of `[1, 10, 100, 1000]` under `yScale: "log"` relabels its gutter and **does not move one point** — 1, 10 and 100 all sit on the bottom row where they belong at 0, ⅓ and ⅔. The class `yLabels` records of itself one layer down: it carries a note about a log axis *labelled* linearly, found and fixed between the tick chooser and the label writer, and the same seam between the tick chooser and the **rasteriser** had never been asked. **Open**, and named at C12 §3d.1's log row. *The x axis does not share it and the asymmetry is real*: a y value is the datum and needs the rasteriser to plot `log(v)`, where an x sample is placed by its index and the domain declares which value that index carries. Found because `xScale` had **no consumer in `src/` at all** before this work |
| **F190** | **`T2.12b`, and two rows of the x axis's own suite** | Each asserted something *implied by* its claim rather than the claim. `T2.12b` asked whether the y axis reaches zero by grepping the whole frame for `0`; it passed for as long as nothing else in the picture wrote a number, and failed on a correct y axis the moment the x axis wrote its first sample index. **Narrowing it once was not enough** — splitting every row on its axis edge and keeping the head returns the whole x-label row, which has no box-drawing character, so the first narrowing still read what it was written to stop reading. The other two were caught by the mutation pass on §3d.1's load-bearing row: one called `xTickRow` with a hand-written mapping (the mechanism, never the wiring), the other filtered the empty rows out before asserting *the last row is not blank* of a bottom rule that is never blank. **Fixed** — all three read the composed frame; ten mutations caught after |
| **F188** | **the golden corpus, for the width rule its own values could not vary** | §3b says *the number takes the width it needs and the run takes the residual*, which is right and per row inverts: at `max: 100` in 40 cells, **99 draws 37 cells and 100 draws 36** — a larger value, a shorter bar, with every count in both rows correct. `ONE_PER_FORM.bar` was `[10, 25, 15, 30]`, four two-digit numbers, so *one allowance for the chart* and *each row against its own* render identically; landing the fix moved **eight vertical frames and no horizontal frame** out of 292. F185's shape a step along — there the corpus could not reach the rung, here not the shape of the data. **A fixture whose values are all one width tests a width rule against itself and agrees.** **Fixed** — one allowance for the chart, the fixture widened to `[8, 25, 15, 100]`, and the standing arm's number written above the run because a column is read against the gutter's scale and cannot shrink. Six mutations; the partial-top-cell clause survived on a fixture that was exactly five whole cells |
| **F187** | **`catalogue-png.mjs`, and the two attributes it tried to fix itself with** | The frames' corners sat three pixels right of the border between them. **The frames were never wrong** — `PC12` passes and every frame run ends at x=670.4 in the SVG — so all of it is in the image. `sharp` renders through librsvg, which implements neither `textLength` nor a per-glyph `x` list: a 76-glyph rule ending in `┐` lands at 1285 with an x list and 1282 as one element per glyph, where the lone border is 1282. **An attribute a renderer ignores reads exactly like one it honours**, so both rejected fixes would have shipped green — a test asserting the attribute, an image unchanged. Three of four diagnoses were wrong and each was measured before being dropped: the stems of `│ ┐ ┘ ┌ └ ┤` all rasterise to the same two columns, and supersampling at 4× does not move it. **Fixed** — one `<text>` per glyph, which the braille path has always done; 560 PNGs render in 7s, and `PC14` asserts the shape of the output rather than an attribute |
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
| **F241** | **`catalogue-png.mjs` again, for the whole sixteen-colour vocabulary** | `KNOWN_SGR` is `{0,1,2,22,38,39,48,49}`: no `30-37`, `40-47`, `90-97` or `100-107`, so a 4-bit frame draws with its colour removed and F240's 4-bit row was nearly read off one. **The watcher is right and never opens the directory** — PC11 exists for exactly this, carries counters against the did-not-run green, names `7m` as what it watches, and sweeps `readdirSync` **non-recursively** over `docs/catalogue`, where `status/` holds the only 4-bit frames in the tree. **And recursion alone would not have caught it**: across the 880 top-level frames the distinct SGR first-parameters are `[1, 2, 22, 38, 39, 48, 49]` — exactly `KNOWN_SGR` — so the gate was green because nothing in its corpus is rendered at `colourDepth: 4`. Coverage was a property of the fixtures. **F204's file, two classes meeting**: a gate that exists and is not run made an instrument that manufactures evidence invisible. **Fixed** — the four arms, `KNOWN_SGR` widened, and PC11 made recursive with a 4-bit frame in its corpus |
| **F243** | **the mutation pass, for three rows that each mean something different** | Six mutations against `graph`'s unnamed passes, three survived. **(1)** Dropping deduplication changes no frame — an edge sets mask bits with `|=`, so drawing one twice is idempotent, which **corrects F242**: *counted twice* is the cost and *drawn twice* is not, and a reader chasing the drawing would find nothing and call the pass dead. **(2)** `best = rows` instead of a copy — §3ai.5 S5's reference-not-a-copy — survives **correctly**: with two sweeps on a 5- and a 14-node fixture the last ordering *is* the best, and the defect is only expressible where sweep 2 loses to sweep 1, which F242 located at near-path n=50. The corpus cannot reach one row of its own pipeline. **(3)** Removing the drop's edge guard changes nothing because the drawing loop already refuses a segment with no `centre` entry — two guards for one rule, the second load-bearing, the first reading as the one that matters. **A mutation's third disposition.** | open — (1) is corrected in F242, (2) owes a near-path fixture at a size where the second sweep can lose, (3) owes either a deletion or a comment saying which arm is cheap |

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


**F237** is the group's own harness damaging the tree it tests. `runPass` restores each file with
a plain `writeFileSync`, so a `SIGKILL` mid-write leaves a **prefix** — measured at five source
files losing their tails, `types.ts` at 1297 lines against 2218, when two-day-old runs sitting
mid-pass were killed. **Every gate had been green ten minutes earlier**, because the damage
arrives after the last check and before the next; what caught it was `git diff HEAD --stat`
reading 3042 deletions in files nobody had touched. Underneath it: the devcontainer's PID 1 is
`sleep infinity`, so nothing reaps — **9087 zombies**, which is how two-day-old runs persisted —
and the first e2e failure of the session was piped through `tail -6`, discarding the row name
along with the exit code, so that row was never identified. **Fixed** by an atomic `fsIo`
(write-to-temp then `rename`); adopted by 1 of 92 runs, and **the other 91 are a named residue
rather than a silence.**

**F236** is the group's first about **an instrument that is not ours and cannot be fixed** — `grep`
skipping a file with a NUL byte, in silence. Three of them made 14 KB of C09's status ladder rows
invisible, and the conclusion drawn was *the eleven ledger rows T3.38-T3.48 have no tests*; all
eleven exist. **The bytes were `?? " "` fallbacks — SS43's own stated failure mode, word for
word** — and SS43's scope is `src/`, which is where a NUL does the least harm: in source it is a
wrong character in a string, and in a test file it deletes the file from every search anyone will
run. **A rule scoped to where its subject was first found rather than to where its consequence is
worst.** Five files across the tree, one of them an enforcement tool invisible to `grep` itself.
**Fixed** — SS52, narrowed to NUL by measurement after the whole C0 class reported 90 hits that
were all legitimate ESCs in escape-sequence tests. The reusable part: **a search returning nothing
is evidence only if the search could have returned something**, and this is the first instrument
here about whether the reading happened at all.

## 10 · A claim carried without a record — **14: five findings disproved, eight claims caught before anything was built on them, one rule that governed thirty forms** · new at F80

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
| **F238** | the error box's message cap is four lines | **four, and the width it binds at is the one nobody looks at.** Wrapping `plot failed to render: …` at the top rung's content width: a typical message is 1 line at 120 columns, 2 at 80 and **3 at 40**; a path is 4 at 40; a three-frame stack is 3 at 80 and **6 at 40**. So four holds a whole stack trace at 80 and **a path and nothing else at 40** — the cap binds exactly where the room is least. **Kept at four and not width-scaled**, because the cap is a property of the reader rather than of the terminal, with the cost stated instead. **Caught before it was fixed**, on the instruction that the number was a guess — and a second, stronger argument for it turned up while confirming something else (F239): capped at four lines the box is at most seven rows, so the worst over-draw inside a bounded container is bounded by a number rather than by the length of an exception |

| **F234** | the elapsed counter's 1 Hz write is the weak joint — a document write, a `rev` bump, a cache miss and a re-render every second | **0.4 frames a second.** Ten seconds of fake time: a spinner alone writes 55 frames, a spinner plus a 1 Hz patch writes **59** — six of the ten writes coalesce into a frame C03 had already scheduled. **The counter is cheapest exactly when it is visible**, because a loading status animates and the ticker is already armed. Two control arms make the number readable: nothing animating and no patch is **0**, a patch alone is exactly **10**. **Caught before anything was built on it** — and the guard survives on a *hygiene* argument instead, since a write changing nothing observable is still a `rev` bump that invalidates C14's height cache. The frame read in the same pass settled `H=2` and turned up one real defect the arithmetic could not: `retrying` without `retryInMs` draws no activity line and therefore **no spinner**, which is every one-shot's failure |

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
| **F242** | **`layered` collides like `force` does; two sweeps is better than one** | **Neither, measured over 360 graphs before the design rested on either.** Collisions are **0 at every density and size** — a layer's labels sit side by side, so overlap is not expressible and the failure mode is overflow, which has an answer. That is the same question the `force` refusal turns on (one label pair in six at n=20), re-asked of the layout being kept and answered structurally. And the sweep count is non-monotone: at near-path n=50 two sweeps **raises** the mean, 36.5 to 38.1, worse in **17 of 40** trials. **Ruled** — two sweeps with best-kept, which makes it monotone for one crossing count a sweep; past two the gain is 3-6% where the first buys 80%, and at the sizes that fit a terminal (n ≲ 20) sweep 2 is already at the floor. **And a third gap in the recipe, from checking the instrument rather than reading it**: reversing a two-node cycle onto an edge that already exists duplicates it — 24 in 360, drawn twice and counted twice, and nothing in *layer, order, two sweeps* asks |
| **F244** | **`position: 'absolute'`, before a mosaic's spec rests on it** | **The pinwheel composites whole, honours a declared height exactly, and is a pure function of `(block, width, ctx)`** — 10 renders, 1 distinct, against an impure control reporting 10 of 10 so the count means something. So the mosaic is **not** a `raw`-block path and D2 can be written. **Probe 0 is the one that could have cancelled the phase**: the pinwheel admits no guillotine cut at all, while a *five*-rectangle **slicing** control cuts at `x=1` — same count, same tiling, opposite answer, so the difference is the figure and nested `group`s cannot express it. **Two carried claims corrected.** The key is `(id, rev, width, focus, theme)` with `key\0range\0offsets[\0tick]` in the focus slot — `(entry, rev, width)` is `HeightCache`'s triple, and range, offsets and a per-kind tick are folded in already, so nothing is owed at the call site. And the scroll renderer's *`height` on a Box clips **bottom-anchored*** does not transfer for the reason it appeared to: **the anchor is not the position type, it is `flexShrink`** — one child of five rows in a box of two draws `r0,r1` relative-unshrinkable, `a0,a1` absolute either way, and **`r2,r4`** relative-shrinkable, which is no anchor at all but a drop from the *middle*. The decision stands; the wording understates the fault it is arguing against. **And the frame found what sixteen agreeing `measure`/`render` pairs could not** — at width 40 the figure is **60 cells wide**, because an absolute child is not clipped to its parent's width and C09 I1 is about rows (C09 I34's *over-draw in the other axis*). `overflowX: "hidden"`, which the group renderer already carries, brings it to 40 at no cost in rows |
| **F246** | **a four-item queue, three of which were already answered** | **And the three are stale in three different ways.** *S5*: C23 §3d-bis says the fields *had no producer **until now***, and the carried claim is that sentence without its last two words — both arms are built, frame-read and driven end to end rather than at the seam, `T3.56` saying in its own comment that it writes through `declare` and the sweep and never calls the writer. F86/F89/F92's compression class a fourth time, and the cheapest: the body was right and the summary dropped the tense. *F240's residue*: `selection` has no 4-bit map entry and **is painted anyway** — `selectionStyle` falls back to reverse video at its call site, measured `undefined -> {inverse:true}` at 4 and 1 bit. **A missing map entry and an unpainted surface are not the same fact**, and it is the *better* answer: inversion guarantees contrast against arbitrary text, which is the exact constraint F240 named for a wash and which a curated index cannot meet — so one case already has the mechanism the other was deliberately denied, which is a stronger *these are not one case* than the finding had. Ruled: **the entry is not added**. *The label pass*: `shiftInward` resolves to the deferral comment that names it and nothing else; it is a C12 subsystem, reported at its size rather than attempted at the queue's | **3 closed by measurement, 1 built** |
| **F247** | **the roadmap's *measurement is free*, before images rest on it** | **Open, and the risk was where it could be checked.** The row is true of the terminal and is a claim about **three** width implementations: `cells()`, which every `measure` uses (SS23); Ink's, which lays out the Box; and the terminal's. Two are reachable here and they are the two most likely to be wrong about a plane-16 private-use character. Measured: `cells()` gives **1** per `U+10EEEE` and **0** for the row/column diacritics, Ink lays out exactly what `cells()` measures at n = 1, 2, 4, 8, and the text path survives the surrogate pair — `stripControl` leaves it and `truncate` does not split it. So an image declares a height in cells and participates in the grid; nothing floats. **Blind spot stated**: the third implementation is the protocol's guarantee, not this repo's. **And `.length` is exactly 2x wrong on an image** — SS23's rule with its first systematic subject, where every previous instance was incidental. **A literal BEL reached the probe by being typed** and only the width disagreement surfaced it (F236's class, smallest scale) | **gate open** |
| **F248** | **the three measurements images phase 1 rests on** | **All three came back the way the plan needed, each with a control.** *A partial row rewrite*: Ink re-emits the **full frame** — 96 of 96 placeholders on a one-row change of twelve, 12 cursor-ups, 13 erase-lines — so an image is cheap and the grid never has to survive being written a row at a time. **The first run reported `NOTHING re-emitted` and that was the harness**: a fake stdout without `isTTY` makes Ink write nothing at all, so a zero was indistinguishable from a full frame of nothing. *Truncation and the window*: no cluster split at any width 1-12 at either unicode arm, and a windowed row still names its own row — safe for two different reasons, `truncate` being grapheme-aware and each cell naming row **and** column. **This is the failure mode no other kind has** — every other block degrades by losing content and this one would degrade by addressing a different part of the image. *The decoder*: an 8x4 PNG from `sharp` reads back as `IHDR pHYs IDAT IEND`, and `pHYs` is the useful part — a decoder skips ancillary chunks rather than assuming `IDAT` follows `IHDR` | **shape holds** |


## 11 · A gate that passes without checking — **33: 18 closed, 15 open**

| | the gate | what it was not checking |
|---|---|---|
| **F200** | **the golden corpus, for what a glyph can carry** | `slope · full · 80` sat in the corpus containing `⠭⠭⠝⠛⠛⠛⠛⠛⠛⠓` — six- and seven-dot cells through a chart whose curves are one and two dots thick everywhere else — and `radar · full · 80` had `⣯`, `⠿`, `⣤`, `⡷`. **Filed as the defect legible in the snapshot, and half of that is retracted by the instrument that filed it**: F203's amendment restores the dense run and `⠭⠭⠝⠛⠛⠛⠛⠛⠛⠓` is now the *correct* frame, so the slope's glyphs were always a proxy — they say *these cells hold more than one layer*, true before and after, and whether it is a lie is a fact about **colour**. The radar half stands, because its frame's dots genuinely moved. **Third instance of `-u` writing a record**, and the useful half is the correction: *assert the artefact, not a proxy*, arriving in the corpus. A defect whose whole content is which colour is outside what a plain golden frame can hold |
| **F220** | **`validateBlock`, for a member that governs two forms of forty-four** | `plotDetail` has **one reader** — `definition.ts:302`, reached only from the `boxplot` and `violin` renderers — and `validate.ts` never mentions it. So it is accepted on 42 forms that do nothing with it. **F207's class in a member rather than a record**, and the silence runs the other way: `STYLE_ARMS` said *yes* where the renderer said nothing, and here nothing anywhere states the scope, so §3i's description of two ladders reads as general because no artefact narrows it. **It survived because the member is optional and defaults to `"auto"`** — every form renders correctly either way, so there is no wrong frame to find and the only observable is the *absence of an error*, which no frame-read, golden or mutation reaches. **Found by checking a premise before building on it**, one commit before `tree` would have taken the ratio to 3/44. **Fixed** — `HAS_DETAIL_RUNGS` total over `PlotForm`, refused at both gates, and PD3 asserts the record agrees with `RUNGS` rather than deriving it, because L0 cannot import L1 |
| **F221** | **`validateBlock`, for a whole typed field** | `validate.ts` does not contain the word `hierarchy`. Measured through both gates at `form: "treemap"`: a node with no `value`, a `children` that is the string `"nope"`, a child that is the number `42`, a node with no `label`, `value: NaN` — **all six accepted**, one of them writing the nine letters `undefined` into the frame as a tile's name and two reaching `[plot failed to render]`, which is C09 I11's containment rather than luck. **The sixth is well-formed input**: a chain 3200 deep is refused by the stack, not by a gate — the treemap fails between 1600 and 3200 and the flame between 3200 and 6400, which is the two walks' frame sizes and not the data, and nobody has a call stack that deep. **It survived because `hierarchy` is a shape rather than a member** — I54's own *one field for three forms rather than three shapes* — and a gate written member by member has nothing to hang a clause on; a recursive shape needs a walk, and the walk is what did not get written. **Fixed** — `hierarchyFault`, one walk exported from `validate.ts` and read by both gates, with a 256 bound for the cyclic graph a builder call can hand over; and `HIERARCHY_ROLE` closes the half the probe found on the way past, `hierarchy` having been accepted on forty-four forms and read by three. HG5 asserts the record against the **frames** — every form rendered twice, and the set that moves must be exactly the three |
| **F231** | **`validateBlock`, for the field a named op writes** | C04 §4 rules `op: "expand"` a named op rather than a flag *because a named op cannot be forged* — an argument that is correct about `replace` and silent about where the op lands. `validate.ts` does not contain the word `expanded`. Measured, an inbound document carrying `expanded: true` **validates**, and the table measures **3 against 2**: the far side set view state and paid a real row for it. **The guarantee holds at the op and leaks at the field**, which is a precedent being half-true rather than wrong — nobody copying the sentence would notice, because the sentence is true. Third of this class after F220 and F221, so it argues for a check over the kind | open, closing with the height change's own field |
| **F222** | **`legendRows`, for whether there is anything to name** | The row for `legend: "above"`/`"below"` is declared from a `Pick` excluding `series`, `segments`, `ohlc` and `annotations` — every source `legendEntries` reads. Measured: a `treemap` at `height: 4` with `series: []` and `legend: "below"` renders **five rows, the fifth blank**; `"right"` on the same block is correct, because a width-costing placement sizes itself from the entries and finds none. **Disproved before it was built on.** The diagnosis was the MG24 class — a correct sentence justifying the wrong scope — and checking it refuses that: `ViewPatch` carries `op: "replace"`, so a streaming plot's `series: []` gaining its first entry is the ordinary way a plot starts, and a legend row appearing at that moment shifts everything below it. **That is §2's empty-series rule one row down** — an empty series occupies its declared height rather than collapsing — so `legendRows`' comment is true *and* constrains the decision it is attached to, which is the distinction only running the case can make. **What survives is the residue**: a form that can never gain a series keeps a blank row, `treemap` today and `tree` after it, and closing it wants a 44-row record for two entries. Named in C12 I27 rather than built |
| **F229** | **C04 §3c's opening, for whether its ruling survived the build.** It calls `scroll` *the one kind declaring both `elements` and `window`*; `scroll` declares no `window`. The overturn is recorded in **C26 §4b** (*cell 3 is still empty*) and in **`containers.ts`**, whose comment cites the very cell it contradicts — and not in C04, which states the claim first and is where a reader meets the kind. Three records, two current. **§3c already carries two build-falsifications in place**, so the habit exists in this section and was not applied to the paragraph that opens it: an opening reads as framing, and framing is not what gets re-read when a ruling moves. **Fixed** | closed |
| **F228** | **C09 T1.4 and §3's table, for whether they cover the registry they enumerate.** `scroll` ships in `DEFAULT_DEFINITIONS` and appears in neither: §1 says *fourteen defaults … union to seventeen* against **15** and **18**, §3's table has no row for it, and T1.4's *each of the fourteen kinds* runs 14 cases. So the one kind with no documented height is the one nothing asserts a height for. **The row had already been bitten from the other side** — a rename left seven entries measuring against `undefined` — and the guard added then, *every listed kind has a fixture*, runs in one direction. **Fixed** — counts corrected, the row added, and T1.4's obligation rewritten from a number to an equality against `DEFAULT_DEFINITIONS`. Third instance of one class today, which is why it closes rather than files |
| **F226** | **C09 T6.7 and T6.8, for whether the block they throw with can throw** | Both tier-6 rows for I11 build a document around a kind named `explodes`, and **nothing registers it** — so it resolves through `raw` (C09 I10), renders as its own JSON and measures 1. **Both pass with the render catch deleted**: they are named for the containment and exercise the fallback. A03 §2's vacuity class in the tier that exists to prevent it. Two things hid it — `not.toThrow()` cannot tell *contained* from *never thrown*, and the fallback's height and the contained height are **the same number, 1**, so T6.8's assertion agrees with both readings. **Found by a new instrument staying silent**: with C09 I29's sink `LOUD` by default, reaching a containment is fatal, and turning it on turned exactly one row red — T3.13, whose subject it is. A row named for a catch that does not go red does not reach one. **Fixed** — both register a definition that throws, take the named `QUIET` exemption, and assert the containment *fired* rather than the absence of a throw |
| **F223** | **the render boundary, for the height it had already committed** | The containment is real and older than the question — per block, visible, `error`-toned — and it restores the content and not the contract. Measured: a definition measuring 1, 2, 5 and 20 with a throwing renderer draws **1 row every time**; a real `plot` of `height: 20` measures 20 and draws 1; `[raw, throws(20), raw]` measures **22** against **3** rendered. **C09 I1 and C09 I11 are adjacent in one list and neither mentions the other** — *the rest of the frame is unaffected* is true about content and false about geometry, which is MG24's shape. **The obvious diagnosis is wrong and that is the part to keep**: `transcript()`'s `FrameError` is not reached, because `visibleRows` clamps per entry first — so the frame does not die, it pads bottom-aligned and C14 goes on scrolling the block as twenty rows. The other direction drops **4 of 5** rows in silence. **T3.13 asserts the defect** (`lines[2]` is the position the sibling takes *because* the error block is one row against a fixture measuring 2), and **T3.14 has said `logged` since it was written** with no mechanism anywhere. **Ruled** — C09 I11 gains the geometry half rather than a sibling invariant, C09 I29 gives the four catches a sink wired to C23 I48, T3.13 is corrected with the reason in the row, and T6.21 restores the shipped one-row path |
| **F225** | **SP1, SP2 and SP7, for whether a commitment's number is unique** | C09's commitment section is two lists: 1–21, then a restart at **11** running to 14 — so four numbers name two commitments each. **C09 is the only spec in the tree with duplicates**: 25 commitments, 4 collisions, against 0 everywhere else. One of the three citations into it, `expect-document.ts`'s `C09 commitment 14`, is about 1:1 column-count substitution and matches **neither** candidate — it is commitment 5. SP7 already makes this argument about test rows (*"C13 I17 is the cap" locates something only if the numbers do*) and `commitmentsOf` already parses `{n, text}`; the uniqueness check is a comparison it does not make. **Fixed** — renumbered 22–25, the citation re-pointed, and the rule lands with its implementation on A03 commitment 14b |
| **F201** | **`c12-layer-merge`'s non-braille mutation, for a guard that acquired a second one** | `if (dots === null) break` says *a letter never shares a cell* and had been caught since I40 landed. After F199 it survives, because the kind guard refuses the union a clause earlier — the radar's labels are a `"curve"` and a curve unions with nothing. **The arrangement that would still need the break is a `"surface"` drawing text beside a `"surface"` drawing braille**, and no layer stack in the tree is that. Kept on the asymmetry rather than the odds; the **mutation** changed, and now turns over the priority order §3u calls a ruling — labels over polygons over frame — which nothing had ever tested. *A survivor is not always a stale anchor or a weak test: the anchor resolved and the subject had grown a second guard* |
| **F186** | **`mergedRow`, for every figure that composites** | It gave a whole cell to the first layer that inked it and `break`, and every compositing form folds to braille *before* it gets there — so the second layer's dots were dropped. **Two user reports, one defect**: a pie's disc is covered by construction and had seven cells flanked by full ones that were not full; a radar's frame was drawn only where nothing else drew, which reads as fragmented rings and dashed strokes that are not dashed. A braille cell is `U+2800 + bits`, so the union is an OR; the colour stays one layer's because a `Span` carries one `ColourRef`, and the spec states that limit rather than implying the boundary is now exact. **The assertion failed twice and only the second failure was the code's** — LM1 filtered the non-braille cells out of a row and read neighbours from the filtered array, comparing the last cell of the disc with the first cell of the legend forty columns away. **And the mutation pass found the clause with no subject**: the letter guard survived, because `labelRows` puts the names outside the disc and no polygon reaches them at any width the catalogue uses — 0 clashes at 80, 60 and 40, **2 at 34 and 6 at 28**. **Fixed** — C12 I40, ten rows, four mutations caught, and every golden cell that moved gained dots: 95 grew, 0 shrank, 0 changed any other way |
| **F185** | **the golden corpus, for the distribution ladder's top rung** | Both violin arms mirrored about `k/2 − 0.5` and put the spine at `round((k−1) ÷ 2)` — the lower baseline at every even extent — so the figure carried three rows of ink above its rule against two below. Two correct statements meeting, with the right comment standing over one of them: *a violin that is asymmetric by a row is a violin that is wrong, and it is invisible in anything but a mirror assertion.* **There was no mirror assertion**, and the corpus could not have been one — the fix moved four vertical frames and none of the other 280. **The first reason given for that was wrong**: not the fixture's parity, which measures at four, but the *rung* — four rows a band is the raincloud, one-sided by construction, and the mirrored outline starts at five, so the top rung had no horizontal golden frame at all. F58's shape caught one turn wide instead of four documents. **Fixed** — C12 I39, a sweep over both parities and both arms, a `MIRRORED` corpus at six rows a band and seven, and four mutations of which one survived on a path the sweep could not reach |
| **F183** | **`make refdiff`, for 58 of the 100 variants it renders from** | Both halves independently took the first variant of each form — `Object.values(variants)[0]` and `next(iter(variants.items()))` — so **42 of 100 catalogue variants were compared**, and the whole raincloud ladder has never been diffed against anything. The Makefile calls it *every form beside its twin*, which at the **form** level is true; that is why it stayed unwritten while `reference.py`'s header records two other limits with care. **It became load-bearing when a *style* arrived**: a candlestick is `form: "line"` and cannot be a form's first variant, so adding the fixture without fixing this would have been a fixture nothing rendered — an anchor that does not match, which the mutation harness distinguishes from a survivor and this did not. **Fixed** — keys of `form` or `form.variant`, our side declaring which (the rule the header already states for the row count), and the generated README printing *N of 100* so the residue is a number a reader sees |
| **F181** | **MG27, for the second of the two builder files** | `checkBuilderCoverage` reads `types.ts` and `builders/index.ts`; `figure.ts` is a builder and it never opens it. So **ten of fourteen `BUILDER_OMISSIONS` entries name fields a public chain already sets** — `b.figure({height: 5}).setQuartiles([…]).build()` carries them — while their reason, *shorthand lands in step 11*, stays true about `b.plot` and is not the claim the rule enforces (*buildable by nothing public*). F84's correct-sentence class inside an exemption list. Underneath it, **six of `FigureOpts`' twelve fields are unreachable through `b.figure`**, `plotStyle` among them, so `build()` spreads three from an option no caller can pass. **Open** — the remedy is `b.figure` forwarding `FigureOpts`, which is also what lets `setOhlc` exist; blind spot recorded at MG27's declaration |
| **F174** | **`dashboard.test.ts`, for the wiring under three of its rows** | `bar()` lost its last caller when `ioBlock` moved onto `keyValue`'s bar, and three rows kept passing six assertions because they called it directly — the mechanism, never the wiring, in a file whose header says *assertions read the rendered output*. What they were hiding is F175. **Fixed** — `bar()` deleted, the rows rewritten against the frame in `test/repo/cpu-cell.test.ts` |
| **F173** | **`tools/mutate/anchors.mjs`, for a quarter of its own anchors** | `anchorsOf` matched `from: "…"` and nothing else, so **108 of 465 anchors, and 30 of the 54 runs carry one** — every anchor whose source contains a double quote, which is most of the capability ones — were outside its reading. It printed `54 runs · 357 anchors · no drift` while a stale anchor from the previous commit sat in a file it was half-reading. **The count is what a working gate looks like from outside**, F161's shape in the instrument that exists to stop staleness. **Fixed** — a branch per quote style; `c12-ramp` and `c12-value-bar` re-anchored and re-run, four more added to `KNOWN_STALE` |
| **F169** | **`make roadmap`, for the half of the file that is not a table row** | `roadmap-status.mjs` matches `\| N \| BUILT\|PART\|RULED \| … \|` and resolves the citations in that cell. **Entry bodies are never scanned** — 81 citations, 39 of them with a line — so the target reports 49/49 while resolving 56% of the file's citations, and the one stale citation a census found (`src/shell/confirm.ts:148`, blank) was in the unchecked half. The census also priced the exposure: **143 of 326 prose citations carry a line number**, 73% in the roadmap against 19% in `docs/`. **Open** — widening the resolver needs a basename search for the 50 bare-name body citations, and `src/progress.ts` exists in both trees, which is the resolve-against-the-wrong-file class. Six unresolved citations fixed |
| **F163** | **the golden suite, for anything the painter decides** | `test/golden/README.md` says *frames*, and not one of the four files is one: all go through `renderToLines`, and **no golden test imports from `src/shell/`**. So the base, the prompt window, the selection wash, the chrome, the frame arithmetic, the cursor sequences and the write-as-a-diff have never appeared in a snapshot — the category built to catch exactly this class of change stops one layer below it. Found by re-measuring roadmap 39's residue, whose stated reason was true and was not the reason. **Open** — roadmap 49, because a golden *frame* is test infrastructure with more consumers than the entry that found it |
| **F162** | **`make test`, for a test file's own types** | vitest transpiles rather than typechecks, so a type error **inside** a test row is invisible to that row: T4.31 ran, asserted and went green in a file `tsc` refuses. `check` covers it and `afb88c4` published a clean `check` for a commit that does not typecheck — which makes the remedy an ordering one, **`check` last, not first**. **Fixed** |
| **F212** | **the ASCII contract, for every document without a plot in it** | `expect-document.test.ts` asserts every codepoint under 128 at `unicode: "ascii"`, with the *fixture responds* control beside it — and its document is a rule, a notice and a table. `styleRasteriser` picks line-drawing on **`ambiguousWidth`**, which answers *how wide is an ambiguous character*, where *can this terminal draw `╭` at all* is `unicode` — so a line plot at ascii · narrow renders `╭────╯` inside a frame whose own borders correctly degraded to `+ - |`. **The catalogue conceals it the other way**: its ASCII arm is `ascii-wide`, so every ASCII frame is also a wide frame and the wide arm answers for the ASCII one. **Two capabilities varied together in every fixture cannot be told apart by any number of frames** — 312 goldens, 1208 catalogue files and a contract row asserting exactly this, and the combination is in none of them. **Open** |
| **F216** | **the catalogue's ASCII arm, which was also its wide arm — and the frames it *does* render** | C12 §3c says *`plotStyle` names what, never the alphabet*, I43 says it again and C02 §4 names the substitutions. **Four sites decide the alphabet from the style or from the wrong capability**: `lineDrawRows` picks its glyph table with no capability in the signature, `styleRasteriser` branches on `ambiguousWidth` where the question is `unicode`, and the contour and violin arms read `plotStyle` while holding `ctx.capabilities`. **The first sits twelve lines above an `ASCII` table whose comment says *every caller was emitting box-drawing regardless of capability*** — the fix was made for the exported helper and never reached the function above it. Measured: **49 of 159 variants at `ascii · narrow`, 24 at `ascii · wide`**, and `expectDocument(…).degradesToAscii()` — the contract this framework publishes for a consumer's suite — refusing a `line` plot and a `contour`. **F212 named half**: its missing-arm diagnosis is exactly right about the first two sites and cannot reach the other two, which are wrong in the arm that *is* rendered — **32 files of the rendered corpus carry braille in a frame labelled ascii**, generated rather than committed (`.gitignore` line 18), so no diff ever carried one and only a reader who ran the generator could have seen them. *A finding about a missing fixture is not a finding about the fixtures you have.* **Fixed** — C12 I54, §3af, AA1 asserting the whole corpus in one row |
| **F214** | **C02's spec/record bijection, for the half of the spec nothing parsed** | T2.6 parses §4's degradation table at test time and asserts a bijection with the record's keys, in both directions and with the owners compared per field. **§2 — the public interface block, the first thing anyone reads — declared seven fields against a record of eight**, and T2.1's own prose said *the seven documented keys* beside a `FIELDS` array listing eight. `ambiguousWidth` shipped with a §3 subsection, a §4 row, an invariant, a commitment and ten test rows, and never reached §2; the gate was green throughout because the bijection it checks is the other table. **A rule is exhaustive over the artefact it names and reads as exhaustive over the subject** — F84's shape and the audit's, arriving in a spec. **Fixed** — §2 gains both fields and **T2.8** parses the fenced block the way T2.6 parses the table, kept separate so the failure names which document is behind |
| **F213** | **five unions named as protected by F172's argument, and none of them checked** | C04's `colormap` clause says `plotFrame`, `legend`, `plotDetail`, `orientation` and `matrixAnchor` *are unions for the same reason*; `colormap` has four checks in `validate.ts` and those five have none. **Being a union is a compile-time fact and the gate's subject is a document** — that is the whole of it, and the sentence is true about the type. Measured per member: `matrixAnchor` falls through to `window`, `legend` draws none while reserving no row, `plotFrame` and `plotDetail` take a default arm, and `orientation` **refuses on a non-orientable form with a message about a vertical arm the caller never asked for**. Found by the calendar's walk, which had to know what an anchor does before it could rule on a calendar's columns. **`matrixAnchor` fixed with the calendar** — the same commit widens that member — and the other four **open**, as one commit rather than five clauses folded into a diff about dates |
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
| **F252** | the framework — **an escape with a length limit, emitted whole.** kitty caps a direct transmission at 4096 bytes and continues with `m=1` until a final `m=0`; phase 1's `transmit` emitted one escape carrying the entire payload. **IK2's structural assertions all passed**, because the corpus fixture is an 8x8 PNG — seventy bytes of base64, legal at that size and illegal at any useful one — and **no in-repo test has a terminal**, so this is the plane-16 class. Found by building the composited arm, whose raw RGBA is *larger* than the PNG it replaces (7595 bytes against 1741): thinking about payload size raised the question and the question found the shipped defect. Taken on the asymmetry rather than on certainty — chunked is correct under both readings and unchunked draws **nothing**, blamed on the image. **And the reserve was off by one in the fix**: `- 8` against a 9-byte frame, so every first chunk came out at 4097. The row that caught it asserted **the bound** rather than the chunking — an assertion about the mechanism agrees with an off-by-one | **fixed** |

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
## 13 · Text the framework emits — **4**

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
| **F215** | the framework emits a sentence about a vocabulary one fork out of date — a rejected theme preference is *not dark or light* on a set that holds three, and no test asserts the string |


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
