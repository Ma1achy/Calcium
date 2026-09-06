> **Reconciled against HEAD, 2026-09-06, at `10ed2733` on `feat/plot-arm-unification`** — from the
> substrate-arc drop (`README_SUBSTRATE_ARC.md`). The text below is the drop's, unchanged; this
> preface is what the tree says where the note and the tree differ. A `file:line` is where the
> symbol was on the day — grep the symbol.
>
> **The drop's eight notes, reconciled**: four were already in `docs/notes/` in a newer form and
> HEAD's copy was kept; one was identical; three were new and landed with prefaces. Nothing in the
> drop was copied over a file that HEAD had corrected.
>
> | the note says | the tree, measured |
> |---|---|
> | `CALCIUM_DATAFRAME_IDEA.md` | byte-identical; nothing to do |
> | `CALCIUM_LIVE_TERMINAL.md` | HEAD kept — the drop's copy still draws `⏺` at six sites; HEAD's has `⬤` (F823). The §4 attach correction is in both |
> | `CALCIUM_MERMAID_THEMING.md` | HEAD kept — it carries the 2026-09-03 answers to the note's three questions (`renderMermaidASCII` returns a bare string; `AsciiTheme` colours by role; the design is re-scoped to role → slot), which the drop's copy predates. *Blocked on one measurement nobody has run* was true on the drop's date and is not now |
> | `CALCIUM_ML_BLOCKS.md` | HEAD kept — the drop says `raw` has no per-span channel; it has (`TextSpan`, 2026-09-04) and HEAD's copy says so, and records the `graph` form unblocking lineage |
> | `CALCIUM_WIDGETS_DESIGN.md` | HEAD kept — the drop says `series[].hidden` is on no type; **two of the three landed 2026-09-05** (C04 I99) and HEAD's copy carries the measurement. The README's *its data assumptions are not satisfied* is stale on the same fact |
> | `CALCIUM_CALL_GRAMMAR.md`, `CALCIUM_INK_RAMPS.md`, `CALCIUM_INTERACTION_ARC.md` | new; landed with prefaces saying where the tree ruled differently |
> | *spans — THE LAST BIG ONE* | **landed 2026-09-04** as `TextSpan` (C04 §3am), with inline emphasis, inline code, the intra-line diff and the per-token `value` as its consumers — four, not one. The README's sequence starts one item later than it says: ink ramps is the next substrate item and its prerequisite is met |
> | *the interaction arc — seven steps, planned against HEAD* | landed 2026-09-05; step 6 is the call grammar, landed 2026-09-06 |

# Calcium — the substrate arc

**Direction, not a task list. Sequence it yourself, and expect the sequence to move when a
measurement says so.**

**Unzip `notes/` into `docs/notes/`.** Eight files, several already present — **reconcile rather
than duplicate**, and check each against HEAD before committing. This tree has twice found a
cited note that existed only in an outbox.

---

## What this covers

**Everything between here and the app.** The foundation pass and the interaction arc are the
current work; the six items after them are the last of the substrate.

```
NOW     the foundation pass          six lanes, three still cutting
        the interaction arc          seven steps, planned against HEAD

THEN    spans                        THE LAST BIG ONE. Four features behind it
        ink ramps                    the gradient and animation set. Needs spans
        the live terminal            a PTY block. Two halves already exist
        widgets                      gated on two type changes
        the ML package               the tensor half has NO DESIGN at all
        the dataframe previewer      composition over C11 and the plot forms
        mermaid theming              one measurement, then a decision

NOT YET agent-tui, notebooks         consumers, and they come after
```

**agent-tui and notebooks are deliberately last**, and the reason is measured: **every consumer
this campaign built found defects in what it consumed.** `examples/plots` found a palette-slot
collision, an unpressable binding and a positional control. **An app built against
half-finished substrate finds the same class more expensively.**

---

## The one that unblocks the most: SPANS

**A line is runs of `{text, style}` today.** So **there is nowhere to put a value that differs
at character 3 and character 4** — and that single gap blocks four designed features:

```
inline emphasis      markdown's bold and italic inside a paragraph
italic               its ONLY consumer, and the field already ships unused
structured diff      a changed word inside an unchanged line
token rendering      a per-token colour over prose — the ML block that needs it
ink ramps            a gradient, a shimmer, anything varying over a run
```

**Build it with a second consumer in hand.** This campaign's record is that the second consumer
is where the first one's assumptions break — **so land spans and ink ramps together, or land
spans and inline emphasis together, but do not land spans alone against one caller.**

**And the grapheme question is the one to get right first.** A span boundary inside a combining
sequence or an emoji tears the cluster; **`cells()` already knows about clusters and the span
model has to use the same unit it does.**

---

## The rest, with what each one actually needs

### Ink ramps — `CALCIUM_INK_RAMPS.md`

**An ink can be a ramp rather than a tone.** The framework already resolves `[0,1] → Colour`
for heatmaps, colormaps, the 3D surface and the overlay — **the gap is that only field forms can
reach it.**

**The design's real content is §5**: the extent is per kind and there is no universal answer.
Character index for text, sample index *or value* for a series, its own length *or the axis* for
a bar. **A kind with no meaningful extent says so rather than silently taking the first colour.**

**The animation set is nine plus none, each `t' = f(t, tick)`** — and three of them do not loop,
which is a real distinction: **a looping animation is a state and a one-shot is an event.**

**Claude Code was captured byte for byte** to settle whether sub-character gradients are
possible. They are not, and **the reference does less than this design allows** — two fixed
colours and a sliding band. §6b carries the measurement.

### The live terminal — `CALCIUM_LIVE_TERMINAL.md`

**A PTY inside a block: it measures, scrolls, degrades and caches like every other kind.**

**Two halves already exist** — `Scroll` is the container and `pushedView` is the attach target.
**What is new is a terminal emulator**, because the child's escapes must be interpreted into a
screen buffer rather than passed through.

**The constrained version is a real first release, not a compromise**: `\r \n \b` and SGR only,
no alt screen. **Every named consumer is line-oriented** — a test run, a build, a training job —
and `TERM=dumb` is a lever that makes them behave.

**And §4 was corrected once already**: attach is a `pushedView` push, not input capture inside
the block. **That correction is in the file; do not re-derive the version it replaced.**

### Widgets — `CALCIUM_WIDGETS_DESIGN.md`

**The design predates two measurements and both matter.**

**Its focus assumptions are now satisfied** — the live-entry ceiling landed, five kinds declare
`elements`.

**Its data assumptions are not.** `series[].hidden` and `annotations[].hidden` **are on no
type** — the design's first binding target is a type change, and that is C04 spec-first work
before any widget kind lands.

**Build one widget end to end before the set.** A toggle bound to `series[].hidden`, and the
second consumer is what finds the seam.

### The ML package — `CALCIUM_ML_BLOCKS.md`, and the tensor half has no design

**The blocks note covers token visualisation, structured diff, throughput, lineage and cost.
Two of those need spans.**

**The tensor half was named as entry 3's other half and never written.** *How you render a
4×512×512 array in a terminal* is a real question with no answer in this tree — **write the note
before building anything**, and it is the one item here with nothing to read.

**Cost is the cheapest useful thing on the list** — GPU-hours and money per run, a bar chart,
**and it is the metric an ML platform has all the data for and never surfaces.**

### The dataframe previewer — `CALCIUM_DATAFRAME_IDEA.md`

**Composition, not a new component.** C11 plus `Cell.spark` plus the scroll container, with a
per-column distribution sparkline chosen by dtype.

**Two things it needs that do not exist**: a column profiler in one streaming pass, and a
reader. **Reservoir-sample and say so in the header** — a summary that says *sampled* is honest;
one that silently samples is not.

**And measure against `visidata` rather than dismissing it.** *What this adds is the plot
layer*, which visidata does not have.

### Mermaid theming — `CALCIUM_MERMAID_THEMING.md`

**Blocked on one measurement nobody has run**: does the renderer return anything beyond a
string?

**If it only returns glyphs, the answer is no without a rewrite** — and writing a mermaid
renderer is what the dependency exists to avoid. **Run the three questions in the note before
designing anything.**

---

## The two current arcs

**`CALCIUM_INTERACTION_ARC.md` is in the drop**, and its own §0 premise has already moved —
**the live-entry ceiling landed on 2026-09-03 and the record did not catch up.** The agent's
sequenced plan corrects it; that plan is the one to follow, not the arc's §0.

**And what §0 was hiding is the better list:** the mouse is a routing skeleton with no handler
arm, `exitCopyMode` is `() => undefined`, no keyboard-protocol capability exists, and the
three-line footer is **structurally refused** rather than unbuilt.

**`CALCIUM_CALL_GRAMMAR.md` is step 6's target** — one shape for every command, tool call and
job. Head, gutter, bounded body. **The tree gutter for fan-outs and subagents, approval in the
overlay, and `⬤` is U+2B24 and not U+23FA.**

---

## How to work

**Keep the gates.** `make all` per target, exits read directly, anchors before mutations, read
every diff, **read every moved frame as a picture.**

**Drop the per-step ceremony where it does not earn its weight.** A walk artefact for every
small repair is what let the last residue accumulate between the steps — **keep it for rulings,
drop it for repairs.**

**Measure before ruling and report what you measured.** A finding with a number survives being
re-read; one with an argument gets re-litigated.

---

## The failure modes this campaign kept producing

**These are not general advice. Each is a defect that shipped or nearly shipped in this tree.**

```
containment is not correctness       a row asserting ink is inside the plot area is
                                     satisfied by every wrong answer that is also inside
conservation is not attribution      counts that balance are satisfied by moving a thing
                                     from one place to another
a consequence is reachable by        ink present, labels fewer, a run under four
other mechanisms                     characters — THE ROWS THAT SURVIVE ASSERT THE
                                     MECHANISM
a fixture that cannot construct      every slope series had two values, so "first and
its own subject tests nothing        last" was the identity on every frame
a control that cannot fail           the first cursor-tracking control never exercised
proves nothing                       relative movement, so passing it proved nothing
a cost argument is not a fit         four refusals were reversed this campaign and all
argument                             four read as considered
check the mechanism exists           the pinwheel, the selection readout, rampFor,
before building against it           shiftInward — each read as a reference and each
                                     existed nowhere. THE TELL IS A DEFINITE ARTICLE
distrust totals                      "76 of 76 cited" was a regex against the wrong
                                     corpus; "182 of 182 distinct" was a header naming
                                     the variant; a coverage gate reported clean because
                                     nothing it read was 4-bit
a survivor after a move is a         xDomain beside the seam's, legendPlacement's dead
duplication, not a gap               clause. Both times the fix was to delete the copy
```

**And read the frame.** Nine of eleven 3D steps corrected something the design asserted, **and
every one of those corrections came from a picture rather than from a number.**

---

## One standing warning about the notes themselves

**Every drawing in every note is a placeholder.** No far side was run for any figure in any of
these files, **and eight drawings in one note were wrong that way.**

**This campaign added several more**: `⚠` and `▼` are in no file in this tree, `[ERROR]`'s
brackets were annotation rather than characters, `rampFor` does not exist, and
`CALCIUM_IMAGES_NOTE.md` was cited for weeks before anyone checked it was there.

**So: read a note as a design, not as a record of what exists** — and run the
where-is-this-written check on every named mechanism before building against it.
