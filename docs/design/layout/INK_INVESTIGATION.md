# Subagent brief — what is React Ink actually costing us

**Run this alongside the optimisation pass. It is a MEASUREMENT task, not a refactor.**
Nothing in here changes code. The deliverable is four numbers and two answers.

**Everything below was read from the tree at `40927c7` and not run.** Treat every structural
claim as a hypothesis to confirm or kill — including the ones that look settled.

---

## Why this exists

The `/all` profile says **44% of frame work is in the `react` span**. That number is being used
to argue about Ink, and it is probably wrong: `wrapCellsParts`, `placeableClusters` and `cells`
are at the top of its self-time list and **all three are Calcium's own**, in
`src/presentation/text.ts`. The span brackets everything under `renderToString`, including
Calcium's own text work.

**So nobody currently knows what Ink costs.** Find out.

---

## Task 1 — split the span (the one that matters)

Instrument `renderToString` so the `react` span separates:

```
A  Calcium's own functions          text.ts, runs.ts, escapes.ts, anything under src/
B  node_modules                     ink, react, yoga, string-width, slice-ansi, ...
```

**Report A and B as a percentage of total frame work**, on the same `/all` frame at 80×24 that
produced the 44%, and on a scroll frame.

**This number decides the whole question.** If B is small, Ink is not the problem and the rest
of this brief is academic.

**Do not estimate it. Do not reason about it from the self-time list.** Measure it.

---

## Task 2 — does any renderer depend on Ink's text wrapping?

**This is the only thing that makes removing Ink expensive.**

`status.ts` and `simple.ts` call `wrapCells` themselves. The question is what the other block
kinds do: do they hand Ink pre-wrapped lines, or do they hand it long strings and let Ink's
tokeniser wrap at the given width?

For every block kind, report one of:

```
PRE-WRAPPED   it wraps with Calcium's own wrapCells/wrapRuns before building elements
INK-WRAPPED   it passes text longer than the width and relies on Ink to break it
N/A           it never emits text that could wrap
```

**An INK-WRAPPED renderer is a real port cost.** A PRE-WRAPPED one is not — Ink is stacking
lines it was handed.

---

## Task 3 — confirm or kill the four structural claims

Each of these was read from the tree, not run. **Say CONFIRMED or KILLED with evidence.**

```
1  Ink has NO standalone measure path. renderToString is the only entry point;
   measureElement requires a mounted ref
2  There are ZERO flexGrow and flexBasis occurrences in src/, and every Box is
   given an explicit width — so Yoga is concatenating, not solving
3  Ink never receives a colour. color: and backgroundColor: have zero
   occurrences in src/; escapes.ts emits all SGR; render-lines.ts hands Ink
   plain text and paints afterwards
4  The Ink surface is six files importing exactly Box, Text and renderToString
```

**Claim 1 is the load-bearing one.** If Ink *does* have a way to measure without mounting, the
whole analysis below changes and Yoga becomes usable directly through Ink.

---

## Task 4 — the bounded win, if the numbers support it

**Do not remove Ink in this pass.** A compositor swap in the middle of an optimisation pass
invalidates the profile you are measuring against.

If Task 1 shows B is large, prototype **only** this:

> **A block whose rendered lines are already cached bypasses Ink entirely and is emitted as
> pre-painted lines.**

Container layout still goes through Ink. This is the plan's own stated remedy for the case
where React dominates, and it gets most of the win without touching container semantics.

**Report the delta on a scroll frame.** If it is small, say so — that is a useful finding.

---

## Background: why the tree is shaped this way

**Do not "fix" the hand-computed widths. They are a consequence, not an oversight.**

**C09 I1** requires `measure(block, w)` to equal the number of rows `render(block)` occupies at
width `w` — **computed without rendering.** C14 virtualises on measured heights and measures
many blocks it never draws.

**Ink has no standalone measure** (claim 1). So if Yoga solved the layout, the only way to know
a container's height would be to render it — **which is exactly the cost this pass exists to
remove.**

> **C09 I1 and Yoga-through-Ink are incompatible. You cannot have both.**

Once you must compute heights yourself, you are computing the layout yourself, and Yoga has
nothing left to solve. That is why there is no `flexGrow` in the tree.

**What Calcium already owns, without Ink:**

```
widths       its own — passed in explicitly
heights      its own — I1 forces it
wrapping     its own — wrapCells, wrapCellsParts, wrapRuns
width calc   its own — cells()
SGR          its own — terminal/escapes.ts
```

**What Ink uniquely provides: stacking, and the React component model.** React buys nothing
here — no state, no hooks, no reconciliation value, every render fresh.

---

## The three ways out, for context only

**Not this pass. Recorded so the measurement is taken with the endgame in view.**

```
A  relax I1, measure by rendering
   REFUSED — a full render per block per frame for blocks never drawn

B  use Yoga DIRECTLY, not through Ink
   measure() and render() build the same node tree and call the same solver,
   so I1 holds BY CONSTRUCTION rather than by discipline. Gets the whole box
   model — flexDirection, flexGrow, justifyContent, alignItems, padding,
   margin, gap, minWidth — which the appearance pass needs anyway

C  write our own box model
   most work, and it is re-implementing Yoga
```

**B is the recommendation, and it belongs to the LAYOUT pass** — where it is the same work
rather than work on top of it. **You cannot build a better layout system and keep Ink, because
Ink is the layout system.**

---

## Deliverable

```
1  A and B as percentages, on two frames
2  a table of every block kind: PRE-WRAPPED / INK-WRAPPED / N/A
3  four claims, each CONFIRMED or KILLED, with evidence
4  if warranted: the cached-lines bypass, with a measured delta
```

**And one sentence: is Ink a meaningful share of the frame, yes or no.**

---

## Rules

**Measure, do not reason.** Every claim in this brief was read rather than run, and at least one
of them is probably wrong.

**Do not refactor.** If you find something egregious, write it down and leave it.

**A negative result is a result.** "Ink is 8% and not worth touching" closes a question that has
been open for weeks and is worth more than a speculative port.
