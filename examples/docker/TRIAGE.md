# F1–F44, triaged

`FINDINGS.md` is a log: forty-four entries in the order they were hit, each accurate about
what it found. Past thirty, *filed* stops meaning much — a reader cannot tell which entries
are one change and which are forty, or which to do first.

This is the other view. Same findings, no new claims: **grouped by shape, and ranked by how
many surfaces hit them.**

**The ranking is consumer count, and that is the whole argument.** A gap two independent
surfaces reached for is a gap the next surface will reach for too, and it is the only
evidence available that a fix generalises. One consumer is a request; three is a design
error. Nothing else here is a judgement about importance.

---

## The ranking

| rank | shape | findings | consumers | verdict |
|---|---|---|---|---|
| **1** | [The consumer cannot reach a fact the framework holds](#1) | F14, F28, F36, F37, F43 | **5** | real Calcium work |
| **2** | [A drawing describes the framework rather than being checked against it](#2) | F4, F11, F30, F32, F38, F42, F44 | **7** | artefact discipline — no code |
| **3** | [A complete mechanism, unreachable from the builder](#3) | F22, F27, F41 | **3** | real Calcium work · one line each |
| **4** | [Something failed and nothing said so](#4) | F15, F29, F35, F40 | **4** | real Calcium work · **3 of 4 fixed** |
| **5** | [The far side's shape is not the framework's contract](#5) | F1, F26, F39 | **3** | real Calcium work · absorbed by one shim |
| **6** | [A block cannot express what the surface needs](#6) | F5, F16, F18, F30, F33, F34 | **6** | mixed — see below |
| **7** | [Rendered from data that has since moved](#7) | F24, F25 | **2** | real Calcium work |
| **8** | [Two sources, and nothing to render when they agree](#8) | *unfiled until now* | **2** | app-side — a class, not a gap |
| — | [Closed](#closed) | F2, F7, F9, F19, F21b, F17a | — | done |
| — | [Singles](#singles) | F3, F6, F8, F10, F12, F13, F17, F20, F21, F23, F31 | 1 each | see each |

---

<a id="1"></a>
## 1 · The consumer cannot reach a fact the framework holds — **5 surfaces**

**The largest group, and the only one where every instance is worked around by the app
duplicating framework code.** That is what makes it one change rather than five: each
workaround re-implements a module Calcium already has, and each is wrong in a way the
original is not.

| | the fact | the consumer | the workaround |
|---|---|---|---|
| **F14** | the terminal's width | S1's dashboard | `main.ts` reads `process.stdout.columns` — **stale across a resize**, and the duplication C01 I13 exists to prevent |
| **F43** | what the terminal can draw | S1's banner | `main.ts` sniffs `TERM` and `LANG` — duplicating `terminal/capabilities.ts`, which is C02 |
| **F37** | the region's height, and a block's | S5 `/inspect --raw` | a **declared floor** instead of the region, and `codeRows` re-implements the measurer |
| **F36** | whether a document is valid | the class test | a deep import of `dist/data/viewmodel` |
| **F28** | the live parts just declared | dormant | none — no surface has needed it yet |

**Ranked first because the count is real rather than nominal.** F14, F43 and F37 are three
different surfaces in three different steps, each reaching for a different fact and each
finding the same shape: *a local handler is told `command` and an adapter is told `width`,
and neither is told anything else.*

**The fix is not five exports.** F36 and F28 are export gaps and would close that way. F14,
F43 and F37 are about **what a producer is handed**, and the honest version is a context
that carries the terminal's shape — width, height, capabilities — to both routes. That is a
C07/C22 contract change and wants a ruling, which is why it is stated here as a group rather
than patched as three.

**Its own counter-argument, recorded**: `AdapterContext.width` says *"Never a layout
decision — C11's"*, and handing a producer a height invites exactly that. The reply is that
a **pushed view's** producer is defined by the region and has no other bound — F37 is not an
adapter wanting to lay out, it is a producer that cannot know its own limit.

---

<a id="2"></a>
## 2 · A drawing describes the framework rather than being checked against it — **7 surfaces**

**No code. The largest group by count and the cheapest to act on.**

| | the drawing said | measurement said |
|---|---|---|
| **F4** | `PORTS` and `IMAGE` as the mock emitted them | docker's real shapes, and a truncation ruling built on the wrong one |
| **F11** | three more surfaces, same way | corrected before their rulings — the one time this was caught *ahead* |
| **F30** | S7 marks a row `▐ added` | `Comparison`'s union has no `added` |
| **F38** | S5's footer offers `r raw` | no plain `r` binding exists at `pushedView` |
| **F42** | S8 is "the unified showcase" | `layoutFor` picks by width — split at 120, unified at 80 |
| **F32** | the image's `Config` carries `ExposedPorts` | true of a service image, false of a base image — **three passes on one sentence** |
| **F44** | the banner's own extents and arithmetic | four of eight extents wrong, and `40+4+60 = 104` |

**All seven were found by running something.** None by review — a drawing that names a
feature reads exactly like a drawing that checked one, which is A03 §2's vacuity class in
prose, and the mutation pass is the only thing that asks a sentence whether it can be
violated.

**The action is a habit, not a patch**: a surface drawing is checked against the far side
and against the framework *before* its ruling. F11 is the instance where that happened, and
it is the only one of the seven that cost nothing.

---

<a id="3"></a>
## 3 · A complete mechanism, unreachable from the builder — **3 surfaces**

The block type carries the field, the renderer honours it, the tests cover it, and no
consumer can reach it.

| | the field | the consumer | state |
|---|---|---|---|
| **F27** | `Plot.yMin` / `yMax` | S3's CPU plot | **fixed** — and the frame is the proof: a container flat at 100% had been drawing as a mountain range from a 0.2% wobble |
| **F41** | `Patch.collapsedAfter`, `actions` | S8 `/config` | open — a 44-line file with one hunk near the top ends with thirty lines that simply stop |
| **F22** | `gapBefore` on the view arm | S3, S5 | open, and no longer dormant — `/inspect --raw` puts 114 blocks in a view |

**One line each, and F27 is the precedent for all three.** It closed in a single commit with
a frame-read as its evidence, and the other two have consumers now. `yFormat`, `xLabels` and
`emptyMessage` stay deliberately unexposed — F31 is why for the first, and the reason is
recorded rather than left as an omission.

---

<a id="4"></a>
## 4 · Something failed and nothing said so — **4 surfaces, 3 fixed**

The sharpest group, because every instance is invisible by construction: a green suite, a
plausible frame, and no diagnostic anywhere.

| | what vanished | state |
|---|---|---|
| **F15** | an invalid document — no entry, no error, no clue | open: the diagnostic exists and nothing surfaces it |
| **F35** | three app documents that set `status: "error"` and omitted `error` | **closed as a class** — `documents.test.ts` runs every document this app can produce through the validator |
| **F29** | the framework's own default `renderError` threw, mid-stall | **fixed** in Calcium |
| **F40** | a view's window, measured a block at a time — C15 cut the excess silently | **fixed** in Calcium |

**F15 is the one still open and the one that matters**, because it is the mechanism the
other three were seen through. `appendAndCommit`'s bare catch is documented and deliberate
(C23 §5), and the consequence is that *a malformed document is indistinguishable from a verb
that did nothing.* F35's class test is the app's answer; the framework's answer does not
exist yet.

---

<a id="5"></a>
## 5 · The far side's shape is not the framework's contract — **3 surfaces, one shim**

| | the mismatch |
|---|---|
| **F1** | Calcium appends `--json`; docker has no such flag |
| **F26** | `docker stats` streams by default; a request/response transport cannot consume it |
| **F39** | every declared flag is transmitted, so a **rendering** flag (`--raw`) reached docker and it exited 125 |

**All three are absorbed by `bin/docker-json`, and the third is a different kind.** F1 and
F26 are about docker's shape; F39 is about the framework having **no place to put a flag that
selects a rendering rather than an invocation**. That distinction is the reason to fix F39
separately: no shim makes it go away for the next app, and F39 was invisible to a suite of
twelve passing rows because they hand argv to the adapter and never spawn anything.

---

<a id="6"></a>
## 6 · A block cannot express what the surface needs — **6 surfaces, mixed**

| | | verdict |
|---|---|---|
| **F34** | a comparison's verdict is colour and nothing else | **half fixed** — the compliance checker's blind spot is closed; `better`/`worse` still need a glyph on `ComparisonRow`, which is a C04 change |
| **F33** | `Comparison` cannot label its columns | open — both drawings show labelled columns |
| **F30** | `Comparison` has no `added`/`removed` | absorbed: absence lives in the data as `—`, deliberately |
| **F5** | *"`NAME` and `STATUS` never drop"* is not expressible | open — absorbed as arithmetic |
| **F16** | a live part's title cannot carry live data | absorbed: the summary moved into the body |
| **F18** | a live part looks exactly like a static one | open, small |

**Three of the six are `Comparison`**, which is the one block this app pushed hardest, and
they want ruling together rather than patching apart: a verdict axis (`same`/`changed`), a
judgement axis (`better`/`worse`) and column identity are three questions about one block.

---

<a id="7"></a>
## 7 · Rendered from data that has since moved — **2 surfaces**

**F24** — `LiveSpec.render` receives no width, so anything sized at build time cannot follow
a resize.

| consumer | what goes wrong |
|---|---|
| S3's plot | the sample window is stale after a resize — *abstract* |
| S1's banner | the tier is chosen once; widen a narrow terminal and the whale never gains its wordmark, narrow a wide one and the banner **overflows** — *a screenshot* |

**F25** is the same fact from the other side: the dashboard takes a width it never reads,
because the width it is given is F14's workaround and wrong across the resize anyway.

The banner is why this moved up: *"the plot's cap is stale"* argues for itself badly and
*"the banner overflows when you resize"* argues for itself immediately.

---

<a id="8"></a>
## 8 · Two sources, and nothing to render when they agree — **2 surfaces, unfiled until now**

Not in `FINDINGS.md`, because it was never a Calcium gap — it is a **rule about app code**
that two unrelated verbs discovered independently, which is what makes it worth writing down.

- **`/drift`** (DRIFT_WALK B4) — predicted: a container identical to its image renders an
  empty comparison, indistinguishable from a lookup that failed. The `N identical` tally rows
  exist to answer it.
- **`/config`** (CONFIG_WALK B3) — reached again from a different direction: files that agree
  produce no hunks, and an empty patch block reads as a call that failed.

**The class: any block computed from two sources needs a rendering for *they agree*.** Two
independent discoveries in one app is the threshold CLAUDE.md names for stopping and asking
whether the rule is general — and this one is, because the failure is not about comparison
at all. It is that **absence of output is the same picture as failure to produce output**,
which is also F15, F35 and C22 I47 one layer down.

---

<a id="closed"></a>
## Closed

| | |
|---|---|
| **F2** | Calcium was not publishable, and CI had a job that proved nothing — fixed, and the proof gate exists |
| **F7** | `createTui` could not be called from the public surface at all — fixed, this app the consumer |
| **F9** | startup step 7 named an effect and had no mechanism — fixed |
| **F19** | `ManifestDocument` accepted the one value construction refuses — fixed |
| **F17a** | not a defect — a live part keeps ticking after an append, and the instruction to "freeze" it would have broken C23 I9 |
| **F21b** | not a defect — a design-authority question, and the source corrected the drawing |

**F17a and F21b are here on purpose.** Two of the six closed entries closed by being *wrong*,
and a log that quietly dropped them would read as six defects found rather than four found
and two disproved.

---

<a id="singles"></a>
## Singles — one consumer each

| | verdict |
|---|---|
| **F3** | R01's premise about docker has expired — adapter-side, plus an R01 correction |
| **F6** | R01 names a glyph the vocabulary does not have — adapter-side, plus an R01 correction |
| **F8** | omitting `env` stops the shell opening rather than degrading it — **real, small**: the spec says it degrades and it does not |
| **F10** | `docker stats --format json` is a screen redraw — adapter-side, and an S1/S4 correction |
| **F12** | `npm publish --registry` is accepted and ignored — a fact about npm, recorded so nobody re-derives it |
| **F13** | a local handler hand-writes nine `meta` fields, seven of them fiction — **real, structural**, and it belongs with group 1: the registry owns `meta` on the adapter route and not on the local one |
| **F17** | an adapter's `b.live` is never driven — **real**, fixed |
| **F20** | gap 7's premise was false — a design-document finding |
| **F21** | the action model has no route from a keystroke — **real**; the dispatch route is still open |
| **F23** | `view: true` on a local tool is accepted and does nothing — **real**, and it is why `/inspect` is an adapter |
| **F31** | `yFormat: "percent"` expects a fraction — **real**, and the reason `b.plot` exposes the pin and not the format |

---

## If only three things were done

1. **Group 1's context** — five surfaces, five workarounds, each duplicating a Calcium
   module. F14's is already documented as wrong across a resize.
2. **Group 3's three builder fields** — one line each, all three with consumers, and F27 is
   the precedent that shows it closes cleanly.
3. **F15** — the mechanism through which F29, F35 and F40 were each invisible. Fixing the
   three instances did not fix the thing that hid them.

Group 2 costs no code at all and has the highest count; it is a habit, and it is first in
practice because it is free.
