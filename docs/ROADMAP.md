# The do-first list

Four pieces of Calcium work, each with a real application hitting it. Derived from
`examples/docker/FINDINGS.md` — sixty-seven entries logged in the order they were hit — by
way of `examples/docker/TRIAGE.md`, which groups them by shape and ranks them by how many
independent surfaces reached for the same thing.

**Nothing here is speculative.** Every entry names the surfaces that proved it, and no
entry is on this list because it seems likely to be wanted. That is the whole difference
between this document and a wish list: a gap two independent surfaces reached for is a gap
the next one will reach for too, and consumer count is the only evidence available that a
fix generalises.

**Nothing here is a spec yet.** Each entry says what the problem is, who proved it, and
roughly what it costs. Two of the four ask a design question that a spec edit has to answer
first, and those are marked.

| | what to build | consumers | cost | needs a ruling |
|---|---|---|---|---|
| **1** | [The producer-context contract](#1) | **6** | large — and R01 §13 prices it at **363 lines over budget** | **yes** |
| **2** | [Three builder fields, F27's shape](#2) | **5** (3 closed) | one line each | no |
| **3** | [Absence that is distinguishable from failure](#3) | **8** | small in code, wide in reach | partly |
| **4** | [A change axis distinct from `Tone`](#4) | **3** | model change across C04, C09, C10 | **yes** |

---

<a id="1"></a>
## 1 · The producer-context contract

**Six surfaces could not reach a fact the framework was holding, and each was worked around
by the application duplicating a Calcium module.**

| finding | what the app could not reach | what it does instead |
|---|---|---|
| **F14** | the terminal's width, in a local handler | reads `process.stdout.columns` itself — wrong across a resize, and C01 I13 exists to prevent exactly this |
| **F43** | the terminal's capabilities, anywhere | re-implements `detectCapabilities`' unicode rule from `TERM` and `LANG` |
| **F54** | the same record, in an adapter | threads one boolean by hand through eight functions |
| **F37** | the region a pushed view is given, and any way to measure a block | re-implements the code-block row count, and pins it against `createBlockRegistry` through a deep import |
| **F36** | a validator for the document it just built | deep-imports `validateDocument` from `dist/` |
| **F28** | the live parts it just declared | — |

**This is one contract question, not six exports.** `AdapterContext` carries `command`,
`verb`, `width`, `transport` and `origin`. `LocalContext` carries `command`. Neither
carries the capability record, the region, a measurer or a validator — and the framework
has all four at construction, in one place, already resolved.

**F54 is the entry that priced the group, and it is the newest.** Every earlier instance is
an app *duplicating* a Calcium module — bad, and at least self-contained: there is one
wrong copy, in one file, to fix when the seam opens. F54 is an app *threading* a Calcium
value through `bar`, `rowOf`, `livePanelBody`, `summaryLine`, `ioBlock`, `cpuBlock`,
`axisCaption` and `containerView`, because the fact is needed at the leaves and enters at
the root. That is not a copy to delete later; it is a parameter in eight signatures.

**What has to be ruled**, and it is why this is not simply "add four fields":

- **Which of the four belong in a context and which are a different seam.** A measurer and
  a validator are functions the framework owns; a capability record and a region are facts
  about the moment. Handing all four through one object is convenient and says they are the
  same kind of thing, and they are not.
- **What a *local* handler gets.** A02 Seam 4 says L4 orchestrates. `LocalContext` carrying
  one field looks less like a design than like the first thing anyone needed, and the app
  has now needed three more.
- **Whether the region is knowable at all at that point.** F37's original ruling was
  falsified by the code: no producer can see the region, because the decision that needs it
  runs before the window exists. The honest answer may be that this one field cannot be
  supplied and the split floor stays declared.

**And it now has a number, which none of the other entries do.** R01 commitment 1 set a
tripwire — *under 300 lines of app code; exceeding it is a finding about Calcium* — and
R01 §13 measured it with comments stripped: **663 lines** for R01's own four verbs. The
overage is 363, and it is itemised there: the width read, the capability detection, the
threaded boolean, the two deep imports, six `?? 0` coercions and six hand-built empty
notices. **The tripwire was set before any of this existed and it caught the thing the
triage independently ranked first**, which is a stronger argument for the entry than the
consumer count is.

**Cost**: large. Six workarounds delete, three of which are deep imports into `dist/` that
a consumer should never have written — and one of those deep imports silently disabled
`make proof` for two merged steps (F60), because it was aimed at a *repository* and the
gate builds a tree that has never seen one.

---

<a id="2"></a>
## 2 · Three builder fields, and the shape is now proven three times

**A complete mechanism that the builder is the only thing in the way of.** The block type
implements it, the renderer honours it, the spec documents it — and `b.*` does not pass it.

| finding | field | state |
|---|---|---|
| **F27** | `b.plot`'s `yMin`/`yMax` | **fixed**, with a frame as the evidence |
| **F48** | `b.kv`'s array arm | **fixed** |
| **F52** | `TuiConfig.capabilities` | **fixed** |
| **F22** | `gapBefore` on the view arm | open |
| **F41** | what `b.patch` elided below the last hunk | open |

**Three of the five are closed, and that is the argument.** F27 was the first, and its
proof was a frame: a container pinned at 100% CPU drew a 0.2% wobble as a mountain range,
because absent a pin the range is the data's. The unit test could only assert that the
field arrived.

F48 and F52 followed the same shape without being looked for. F48: `KeyValue.rows` is an
array and `b.kv` took a record, so a container port with one binding per address family
could not be said — and C24 had already ruled on a *different* narrowing here, which is how
it went eleven builders and a whole application unnoticed. F52: `detectCapabilities`'
`overrides` parameter had a spec, a precedence rule, four unit rows and a tier-5 row, all
passing, and no producer.

**One kind of defect, three independent instances, three clean fixes.** That is stronger
evidence than any of them alone, and it is what makes the two open ones worth doing without
waiting for a consumer to complain: the shape has been measured.

**Cost**: one line each, plus a spec sentence. F52 was three lines and closed a hole that
made an entire terminal class unreachable.

---

<a id="3"></a>
## 3 · Absence that is distinguishable from failure

**Absence of output and failure to produce output are the same picture**, and the class
spans both sides of the boundary.

*The framework discarding, silently:*

- **F35** — an invalid document is refused by C13 and discarded by C23 §5's bare catch, so
  the command vanishes: the prompt clears, nothing is appended, no diagnostic reaches any
  surface. Three shipped adapters had this and none had ever run.
- **F15** — the mechanism that made all three invisible. **Fixing the three instances did
  not fix the thing that hid them.**

*A block that renders nothing, on purpose:*

- **C22 I47** — content stopping mid-object with no indicator is indistinguishable from
  content ending. Fixed, and the ruling is explicitly *not decoration*.
- Six app surfaces, each of which had to decide what "nothing" looks like:
  `/drift` (every row identical) · `/config` (the two files agree) · `/logs` (a container
  producing no output) · `/diff` (no filesystem changes) · `/port` (nothing published) ·
  `/events` (no lifecycle events in the window).

**`/port` is the one that shows the class is not what it first looked like.** Every other
instance is *empty* against *failed*. `/port` on a container publishing nothing and `/port`
on a stopped container are **two successful worlds with one rendering**, and one call cannot
tell them apart. So the rule is not "say when you are empty" — it is *an empty rendering is
a claim, and the claim has to be one the producer can support.*

**What is Calcium's here and what is the app's**, because the class spans both and only
half is framework work:

- **Calcium's**: F15, and it is the only entry on this list whose fix is a *diagnostic
  path* rather than a field. C23 §5's catch is documented and deliberate; what is missing
  is anywhere for the outcome to go.
- **The app's**: what the sentence says. Six surfaces wrote six sentences and no framework
  change would have written them.
- **Between the two**: `b.table` has `emptyMessage` and `b.kv`, `b.events` and `b.logs` do
  not — so half the app's instances are a field and half are a hand-built notice beside the
  block. That asymmetry is worth a ruling.

**And the class has a form nobody predicted: it arrives through the *instrument*.**
`/logs` opened a pushed view and rendered an empty screen for as long as the verb has
existed, because mawk block-buffers its input and the shim wrapped log lines with `awk`
(F61). Nothing was absent, nothing had failed, and the picture was the same one — with
the prompt gone, because a pushed view takes it, so not even a cursor suggested the app
was alive.

**That is the eighth instance and the first where the emptiness is a bug rather than a
state**, which sharpens what the entry is asking for. A rendering that says nothing is
indistinguishable from *empty*, from *failed*, and now from *broken* — three worlds, one
frame. Whatever C22 grows here has to be producible by the shell when the producer never
spoke at all, which none of the six app-side sentences can do.

**Cost**: F15 is small and load-bearing. The `emptyMessage` asymmetry is three fields.

---

<a id="4"></a>
## 4 · A change axis, distinct from `Tone`

**Three surfaces, with no knowledge of each other, hit the same absent concept.**

| finding | surface | what it wanted |
|---|---|---|
| **F30** | `/drift`, `/compare` | `Comparison.comparison` is `same \| better \| worse \| changed` — a *change* axis and a *judgement* axis in one union, and a drawing used a fifth verdict (`added`) the type cannot express |
| **F49** | `/diff` | `+` added, `-` deleted, `~` modified wanted three colours meaning **change kind**. `Tone` is severity: `ok`/`warn`/`error` — and C04 I6 refused the mapping, correctly, because a deleted file is not a fault |
| **F51** | `/events` | `EventLine` has no tone at all, so `die · exit 137` renders the same colour as `create` — while the sibling `logs` kind tones its `level` from a fixed vocabulary |

Read separately, each is one block's oddity: a union with an extra arm, a palette that
refused a mapping, a row type missing a field. **Read together they are one concept the
model does not have** — and the surfaces that found them were built in three different
steps for three different reasons.

**Gap 3 predicted this and predicted it too narrowly.** The surfaces document filed it as
*value-colour vs tone-colour*: a CPU bar's green→red gradient encodes load, not a semantic
slot. That is the same collision with a **continuous** axis. F49 is the collision with a
**categorical** one, and F51 is the third face: a kind whose rows cannot carry the axis at
all, even where a value exists.

**What has to be ruled**, and this is the largest design question on the list:

- Whether the answer is a second axis on the block (`change?: "added" | "removed" |
  "modified"`), a widened `Tone`, or a theme-level concept that `Tone` and a change axis
  both resolve through. C10 owns the palette and the degradation paths; every option
  touches all three of C04, C09 and C10 plus both monochrome renderings.
- Whether `Comparison`'s union splits. F30 filed it and declined to patch it precisely
  because adding a third pair to a union that already mixes two axes is not a fix.
- **What the 1-bit rendering is.** This is the constraint that makes the design rather than
  decorating it: C04 I6 exists because colour alone survives neither one bit nor a
  colour-blind reader, and a change axis that resolves only to colour would be a second
  channel with the same defect. `/diff` shipped `+ - ~` as **text** for exactly this
  reason, and it is the only instance of the three that is already correct at every depth.

**Cost**: a model change. It is fourth on this list by cost and first by how much it would
teach — three surfaces reached for it before anyone went looking.

---

## What is not on this list

Sixty-seven findings, four entries. The rest are one of:

- **Closed** — F2, F7, F9, F19, F21b, F17a, F40, F45, F47, F56, F60, F61, and the three
  from entry 2.
- **Artefact discipline, not code** — F4, F11, F30, F32, F38, F42, F44, F57, F65. **Nine
  surfaces, still the largest single group**, and it costs nothing to fix: a drawing that
  describes the framework rather than being checked against it. First in practice because
  it is free.

  **The group grew in a way that says something.** `DOCKER_TUI_SURFACES.md` now carries a
  corrections index — nineteen, across twelve surfaces — and the score is **7 framework,
  6 far side, 6 the drawing wrong about itself.** A design document written with the specs
  open got the framework wrong seven times. Reading a spec and checking against it are
  different acts, and only the second is a test. That is A03 §2's vacuity class one level
  up: a sentence about a mechanism reads exactly like a sentence that was checked.
- **The far side's shape** — F1, F26, F39, F46, absorbed by one 200-line shim. Real work,
  and it is the app's rather than Calcium's until a second far side disagrees the same way.
- **Singles** — one consumer each, filed and waiting for a second.

**F55 is the interesting exclusion.** Calcium's prompt is the string `"❯ "`, concatenated
into every frame the shell draws with no capability substitution behind it, on the one line
the reader types into — and no application can replace it. One consumer, so the ranking
puts it low, and the ranking is wrong about this one: there is exactly one prompt and every
consumer has it. It is left off the list because it wants the same ruling as C09 §4 already
made for glyphs, and folding it into that ruling is cheaper than making a second one.

**F58 is the newest exclusion and the one most likely to be wrong.** `RawResult.exitCode`
is `number | null`; `DocumentMeta.exitCode` is `number`. Every adapter in the reference
application writes `?? 0` — six of them — which reports *killed by a signal* as *exited
cleanly*, with `RawResult.signal` sitting beside the coercion and no field to go to.

By the ranking rule it is a single: one consumer, so it waits for a second. **The ranking
is the wrong instrument here for a reason worth naming.** Consumer count measures whether
a gap generalises, and it works because independent surfaces reaching for the same thing is
evidence. This is not a gap a surface reaches for — it is a wall every adapter hits on its
first compile, and the six instances are one consumer only in the sense that one repository
contains them. The evidence that it generalises is that **the type system forces it**:
there is no correct line to write, so every consumer will write the same false one.

It stays off the list because the fix needs a ruling that is C04's, not a field —
widen to `number | null`, add `signal`, or say plainly that a signalled process is exit 0
and mean it. **The third is defensible and is what six call sites already say, silently,
one `??` at a time.**

---

## How this document was produced, in case it is done again

Sixty-seven findings were logged **in the order they were hit**, each accurate about what it
found and none of them ranked. Past thirty, *filed* stopped meaning anything: a reader
could not tell which entries were one change and which were forty.

The triage added no claims. It grouped by shape and counted consumers, and the count did
the work — the largest group turned out to be *the consumer cannot reach a fact the
framework holds*, which nobody would have named as the theme while filing them one at a
time. Three of the four entries here were invisible as themes until the count existed, and
the fourth (entry 4) was three separate findings until they were put on one line.

**The demo's purpose was this document.** A reference application is usually justified as
proof the framework works. Its more valuable output is the list of places it did not — and
that list is only trustworthy because every entry has a real surface behind it, reached for
in the course of building something rather than while looking for problems.
