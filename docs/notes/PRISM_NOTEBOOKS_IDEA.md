# Prism Notebooks — the idea, noted rather than designed

**Not scheduled. A note so the reason survives**, because the pieces arrived one at a time
and the shape only became visible once they were all present.

---

## What made it possible

**Four things landed independently and none was built for this:**

```
the plot system       35 forms, mechanisms shared, and 3D designed
widgets               declarative binding — a knob drives a field with NO app code
the transcript        entries that settle, patch, and persist across sessions
the agent-as-client   tools-are-the-manifest, so an agent calls verbs and gets BLOCKS back
```

**Any three of those is a nice TUI. All four is a notebook.**

---

## The thing Jupyter got wrong, and it is not the UI

**A Jupyter notebook is a document whose output is not reproducible from the document.** Cells
run out of order, state accumulates invisibly, and the `.ipynb` on disk holds output that no
longer follows from the code above it. **The famous failure is a notebook that runs top to
bottom and produces different numbers than the ones it was saved with.**

**Calcium's transcript is the opposite by construction:**

```
a block is a DOCUMENT                immutable, validated, serialisable
render is a PURE FUNCTION            same block, same width, same context, same bytes
an entry SETTLES                     and a settled entry does not change
the widget VALUE is view state       so the picture is a function of (document, value)
```

**A Prism notebook cannot go stale in the way a Jupyter notebook does**, because the output
is not a cached artefact — it is a render of a document that is still there.

---

## The shape

**A notebook is a transcript with three additions**, and each already has most of its
machinery:

**Cells are entries.** A command and its output, which is what a transcript entry already is.
**The addition is re-running one** — which is C23's route with a different trigger.

**Persistence is 44.** Session resume already restores the transcript. **A notebook is the
same file with a name and a reason to keep it.**

**And interactivity is the widget system.** A cell whose output is a plot with a slider is a
cell the reader can interrogate without re-running anything, **because the binding drives a
rendering field.**

---

## Why it fits Prism specifically

**The thing an ML platform's users actually do is compare runs**, and the tools are already
there:

```
/compare run-a run-b       a forest plot, and the CI overlap IS the conclusion
/sweep lr batch_size       a parallel-coordinates plot, or small multiples
/attention layer=8         a heatmap with a slice slider
/landscape run-a           a 3D surface, orbitable
```

**Each is a verb that returns blocks.** A notebook is the record of having asked several of
them, with the plots still live.

**And the agent makes it explanatory rather than archival.** *Show me how learning rate
affects the loss curve* produces a cell containing three runs, a slider and a scale toggle —
**the agent generated the document and left, and the document is still interactive.**

That is the thing no chat interface does and no notebook does either: **Jupyter needs a kernel
running to be interactive; this does not, because the interactivity is in the rendering.**

---

## What it would need that does not exist

```
re-run a cell           C23's route, triggered from a settled entry rather than the prompt
cell ordering           insert, move, delete — the transcript is append-only today
a notebook file         44's format, plus a name and cell boundaries
export                  to what? markdown with ANSI, an asciinema cast, a static HTML —
                        and this is the question that decides whether it is a toy
sharing                 a notebook someone else opens, which means the far side's
                        outputs are IN the file rather than re-fetched
```

**The export question is the one that decides it.** A notebook nobody can share is a session
log with extra steps. **A notebook that exports to something a colleague opens in a browser
is a real artefact** — and the plots are text, so an ANSI-to-HTML export is genuinely
faithful rather than a screenshot.

---

## What is deliberately not the plan

**Not a Jupyter clone.** No kernels, no `%magic`, no cell types, no JSON-with-embedded-base64
PNGs. **The cell is a verb invocation and the output is blocks** — which is more constrained
and is the constraint that makes it reproducible.

**Not a REPL.** A REPL is stateful by design; the accumulated-hidden-state problem is the
thing being avoided.

**And not a general document editor.** The transcript's shape — append, settle, patch — is
what makes it cheap, and a notebook that lets you edit any cell at any time is a different
component.

---

## Where it sits

**After the plot system, the widget system, and prism-tui's redesign.** Every one of those is
a prerequisite and every one is worth building on its own — **which is the test of whether
this is a real direction or a rationalisation.** It passes: nothing above is being built
*for* the notebook.

**And the honest read: this is the most interesting thing on any of these lists**, and it is
downstream of a lot of work that has to be right first.

---

## The cell structure, and the two things in it that are new

```
[text]              prose — a raw block, ships today
[markdown]          headings, lists, code fences — ships today, block half

[code]      ←────   EDITABLE, and runnable. THE NEW THING
[output]            blocks, live, with widgets — ships today

[plot code]
[plot]              interactive by binding, no kernel needed

❯ a question to the agent
  the agent's answer
  [plot]
  [✓] keep in notebook   ←──── THE OTHER NEW THING
```

**Everything unmarked already exists.** Two things do not, and they are different kinds of
problem.

---

## The editable cell — and the prompt is a singleton

**There is one editor, at the bottom of the screen.** C17 owns a buffer, a cursor and a
selection, and `construct.ts` builds exactly one of them.

**A notebook needs N editors** — one per code cell, each with its own buffer and cursor, and
focus moving between them. **That is not a widget and it is not a bigger prompt; it is the
editor becoming a thing that can exist more than once.**

**What follows from it:**

```
the buffer is per-cell            C17's state stops being global
focus moves INTO a cell           and the prompt is one of the N, not the container
⏎ inside a cell inserts a line    where at the prompt it submits — so ⌃⏎ or ⇧⏎ runs
the completion menu targets       whichever editor has focus
undo is per-cell                  or global, and that is a ruling with two defensible sides
```

**This is the single largest change in the idea**, and it is worth saying so early because
everything else in this document is composition of things that ship.

**And it has a smaller version worth noticing**: a cell that is *editable but not focused* is
just a `code` block. So the first version can render every cell as `code`, make exactly one
editable at a time, and **the singleton stays a singleton with a movable anchor** — which is
much less work and probably enough.

---

## The keep-in-notebook checkbox — two transcripts, and promotion between them

**This is the idea Jupyter does not have and needs.**

```
the SESSION      everything you did — exploratory, noisy, append-only, ephemeral
the NOTEBOOK     what you are keeping — curated, ordered, durable
```

**Every cell starts in the session. A checkbox promotes it.**

**Why it matters:** a Jupyter notebook is full of dead cells because there is nowhere else to
put them — the notebook *is* the session, so exploration and record are the same file, and
the cleanup never happens. **Separating them means the record is curated by construction
rather than by discipline.**

**And it is exactly right for the agent case.** You ask five questions, three were wrong
turns, one produced the plot that explains the thing. **Keep that one.** The question, the
answer and the plot go into the notebook as one cell; the other four stay in the session and
disappear with it.

**The mechanism is small**: a flag on the entry, and the notebook file is the filtered
transcript. 44's persistence already writes settled entries — **this writes the subset that
carries the flag.**

**One ruling it needs**: promoting an agent exchange promotes *the question, the answer and
the output* as one unit, not three cells. **The question is what makes the plot legible six
months later**, and a notebook full of unattributed plots is the thing this is trying not to
be.

---

## The question that decides the scope: where does code run

**This is the one to answer before anything is built**, because it decides whether the
reproducibility property survives.

```
A · a cell is a VERB INVOCATION      it goes to the platform, runs in a container,
                                     returns blocks. NO local state, so the notebook
                                     is reproducible by construction — which is the
                                     whole argument for doing this

B · a cell runs in a KERNEL          a persistent process holding state between cells.
                                     Fast, familiar, and it reintroduces EXACTLY the
                                     hidden-state problem this design exists to avoid
```

**A is right and A is slow.** Every cell is a round trip, where Jupyter's speed comes from
the kernel it keeps warm.

**The middle path worth measuring rather than assuming**: a container that stays warm for the
session but whose state is *declared* — each cell names what it reads and writes, so the
dependency graph is explicit and a cell can be re-run knowing what it needs. **That is what
makes it not-Jupyter**, and it is a real design rather than a compromise.

**But it is also the biggest open question in this document**, and it is Prism's rather than
Calcium's — the platform decides what a cell runs in, and the TUI only has to render what
comes back.

---

## What the layering looks like

```
CALCIUM     blocks · widgets · the transcript · N editors · persistence
            ↑ knows nothing about notebooks

PRISM       verbs that return blocks · the agent · where code runs · the notebook file
            ↑ the notebook is a Prism concept built on Calcium's parts
```

**Calcium never gains a notebook feature.** It gains *editable cells* and *widget binding*,
both of which are general, and Prism composes them. **That is the test of whether the layering
is right, and it passes.**
