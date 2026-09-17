# The layout pass — and the Ink question it settles

**Written 2026-09-15 from reading the tree at `40927c7`, then partly superseded the same day by
measurement — see §4, which corrects §1 and §4 of the original. Nothing above §4 was run.** The
measurements named are the profiler's own from the `/all` frame; the structural claims are from
`src/` and the C-specs and should be re-checked before the work starts.

---

## The order

**Three passes, and they are in this order because each is the prerequisite for the next.**

```
1  LAYOUT      a real box model. Everything below assumes one
2  APPEARANCE  the design language applied, and the old system deleted
3  INTERACTION the scope ladder, focus, key repeat, the mouse
```

**Why layout is first.** Almost every rule in `APPEARANCE.md` is a statement about a box model
that does not exist yet — *three columns per nested level*, *content stops at width − 1*, *a
blank row separates entries and nothing else*, *a block emits no leading or trailing blank row*.
Written against hand-computed widths those get re-derived per surface, and the fourth surface
will disagree with the first.

**Why interaction is last.** Focus is drawn as a wash over an element's extent, and an
element's extent is a layout fact. The scope ladder needs `elementsIn` to be correct at a width.

**And there is a pass 0 that is not optional:** the cheap profiler phases, because they decide
how much of this is even about Ink. See §4.

---

## 1 · What the tree actually does today

```
ink imports        six files: image.ts, containers.ts, registry.ts, paint.ts,
                   render-lines.ts, table/definition.ts
what they import   Box, Text, and renderToString. Nothing else
flexGrow           ZERO occurrences in src/
flexBasis          ZERO occurrences in src/
every Box          gets an explicit `width`
```

**Yoga is not solving a layout. It is concatenating one Calcium already solved.**

### And Calcium already owns every piece except stacking

```
widths       its own — passed in explicitly
heights      its own — C09 I1 requires measure(block, w) === render height
wrapping     its own — wrapCells, wrapCellsParts, wrapRuns in presentation/text.ts
width calc   its own — cells()
SGR          its own — terminal/escapes.ts
```

---

## 2 · Why it is shaped this way, and it is not neglect

**C09 I1 is the constraint:** `measure(block, w)` must equal the number of rows `render(block)`
occupies at width `w` — **computed without rendering.** C14 virtualises on measured heights and
measures many blocks it never draws.

**Ink has no standalone measure.** `renderToString` is the only entry point; `measureElement`
needs a mounted ref. So if Yoga solved the layout, the only way to know a container's height
would be to render it — **which is exactly the cost the optimisation pass exists to remove.**

**So: once you must compute heights yourself, you are computing the layout yourself, and Yoga
has nothing left to solve.** The hand-computed widths are a consequence of C09 I1, not an oversight.

**This is the thing to write down, because it will be rediscovered otherwise:**

> **C09 I1 and Yoga-through-Ink are incompatible. You cannot have both.**

---

## 3 · The three ways out

```
A  relax I1, measure by rendering
   REFUSED. It is a full render per block per frame for blocks the viewport
   never draws — the performance problem, made worse

B  use Yoga DIRECTLY, not through Ink
   measure(block, w)  build the node tree, call Yoga, read the height
   render(block, w)   build the same tree, call Yoga, walk it into lines

   I1 holds BY CONSTRUCTION, because both halves call the same solver on the
   same tree — stronger than today, where the two are written as a pair and
   tested as a pair

C  write our own box model
   most work, most control, and it is re-implementing Yoga
```

**B is the recommendation.** It is the option neither the earlier analysis nor the first reading
named, and it gets the whole box model — `flexDirection`, `flexGrow`, `justifyContent`,
`alignItems`, `padding`, `margin`, `gap`, `minWidth` — **which is the thing the appearance pass
needs and the thing Yoga already is.**

### What goes with React, and why none of it is a loss

```
no state, no hooks, no effects   every render is fresh
no reconciliation value          the frame diff is Calcium's, above this layer
the text pipeline                stringWidth, slice-ansi, styledCharsToString,
                                 diffAnsiCodes — replaced by cells(),
                                 wrapCells() and escapes.ts, which already
                                 exist and are already being called
```

**React was never buying anything here.** It is the component model the block library happened
to be written against.

### The strategic point

**You cannot build a better layout system and keep Ink, because Ink is the layout system.** The
two projects are one project: the layout pass removes Ink as a side effect, and the real
question is whether the box model should be ours.

---

## 4 · MEASURED — and most of this was already wrong

**Superseded 2026-09-15 by the investigation at worktree `out/wt-ink`, HEAD `3b60092f`.
Everything above this section that talks about a 44 % `react` span is stale. Read this instead.**

### The headline

**At HEAD, Ink is not on the frame path at all** for `/all`, `stress text`, `mixed` or `session`:
**zero `renderToString` calls** across 88, 697, 277 and 252 frames. The 44 % reading came from
`44fc924a`, one commit before C09 I72, and I72 is what removed it.

**The one frame Ink still touches is a mosaic** — 60–70 % of it. `mosaic` always answers an
element; `scroll` answers one by `render`; a group, panel or table takes the element arm when a
child does.

### My premise was false

**A — Calcium's own functions inside the span — is 0.0 ms in all six measured phases.**
`wrapCellsParts`, `placeableClusters` and `cells` run under the `elements` span, not under
`renderToString`. The tree handed to Ink is `Box`/`Text` with string children and no Calcium
component, so nothing of Calcium's executes inside it.

**So the "split the span" task answered the opposite of what it was written to find.** The span
was Ink's, whole. It just is not on the path any more.

### What the cost actually was, and it is worth knowing

**Ink was re-tokenising SGR that Calcium had already written.** `paint.ts:378 elementOf` hands
Ink one `Text` per **already-painted** row, escapes included, and Ink's output layer parses those
escapes back into styled chars to place them.

```
ansi-tokenize   11.7 %   of the frame        ┐
string-width     9.1 %                       │  28.5 % — parsing and re-measuring
slice-ansi       7.7 %                       ┘  text Calcium had already measured
ink              5.7 %
yoga + wasm      4.1 % + 1.8 %               ┐
react-reconciler 2.8 %                       ┘  6.9 % — the actual layout
```

**Four times more was spent un-painting Calcium's paint than on layout.**

### The four claims

```
1  no standalone measure          CONFIRMED. renderToString is a full
                                  createContainer → calculateLayout → unmount
                                  → yogaNode.free() cycle per call
2  zero flexGrow, explicit widths  HALF KILLED. Zero flexGrow/flexBasis, but
                                  FIVE of ten Box sites carry no width and
                                  inherit from renderToString({columns}) or an
                                  enclosing box. Yoga does solve those. It does
                                  no growing
3  Ink never sees a colour         KILLED on the letter. No colour PROPS, but
                                  Ink receives fully painted rows with SGR
                                  embedded. "Plain text, painted afterwards"
                                  is backwards: Calcium paints FIRST and Ink
                                  parses the paint back out
4  six files, three imports        CONFIRMED
```

### Task 2 — no renderer depends on Ink's wrapping

**INK-WRAPPED: none.** All 22 registered kinds pre-wrap or truncate to their own width, with the
call site named for each. No `wrap:` prop on any Ink `Text` in `src/`.

**Which was the thing that could have made removal expensive, and it does not exist.**

### And the prototype was already built

Task 4's bypass — *a block whose lines exist skips Ink and is emitted as rows* — **is C09 I72**
(`0f04f7ae`, `f516f009`, `5a15bf11`). Every leaf kind answers rows and `linesOf` writes them
without `renderToString`.

### What is left, with a ceiling

**Compose `mosaic` and `scroll` from child rows by placement, the way `group` already does via
`rowsOfAll`.** On the mosaic scroll frame that removes **at most ~87 ms of 145** — and most of
what it removes is the SGR round-trip, not layout.

### A real bug, found and left

**`scroll` over one atomic child taller than its box renders 16 rows against a measure of 5**
(25 vs 5 at width 12). The F855 residue named at `containers.ts:463–466`: `windowChild` returns
`null` for an atomic kind and the child is kept whole.

**That contradicts C09 I1 directly**, and I1 is the invariant the whole measure-without-render
design rests on. It wants a finding of its own.

### So what this changes for the layout pass

**"Remove Ink" is nearly done and was not the win.** The layout pass is now: finish the two
container kinds, and **build the box model because the appearance rules need one** — not because
Ink is slow.

**And §2's incompatibility still stands**, unchanged and now the only reason that matters: C09 I1
and Yoga-through-Ink cannot coexist, so a real box model has to call a solver Calcium owns.

## 5 · What the layout pass owes the appearance pass

**These are the rules in `APPEARANCE.md` that are box-model statements rather than drawings.**
Each one becomes a property of the engine rather than a thing each surface remembers.

```
every nested level costs exactly three columns     a padding
content stops one column before the right edge     a margin
a blank row separates entries and nothing else     a gap, at the sequence level
a block emits no leading or trailing blank row     no self-margin, ever
a container's frame is as tall as its contents     the solver's answer
a bounded body says how many rows are hidden       a max-height plus a residue row
the focus wash covers an element's extent          the solved box, not a guess
a picture's frame washes and its content does not  a box with an unpainted child
```

**And the one that is a gate rather than a property:** `measure(block, w)` equals the rendered
height. Under B this stops being a discipline and becomes an identity.

---

## 6 · How to do it without the old system leaking

**Delete as you go. Do not build alongside.**

A parallel new system means every surface has two possible renderings and no audit can tell
which one shipped — **which is the exact failure this project keeps finding**, where the section
that argues and the section that draws disagree.

**The gate already exists:** 458 byte-exact golden frames in the tight tier and ~2,130 in the
wider set. **A compositor swap is the one change those were built for** — every frame either
moves or it does not, and a moved frame is a finding.

**And the dummy app is a catalogue.** `plot-catalogue.mjs` already renders every plot form at
every capability arm and proves each exists. **A surface catalogue doing the same for the design
language** — every block state, every question shape, every posture, at four arms and two widths
— is what makes *read the frames* an audit rather than an intention.

**It is also the only check that catches the thing the rules cannot:** two surfaces that read as
different products. Everything else in `APPEARANCE.md` and `INTERACTION.md` is a grep.

---

## 7 · What to verify first, because this was read and not run

```
1  that Ink genuinely has no non-mounting measure path
2  that the six importing files use only Box, Text and renderToString
3  the react span split — Calcium's functions against node_modules
4  that yoga-layout can be taken as a direct dependency at the version Ink uses
5  whether any renderer leans on Yoga's text wrapping rather than C09's
   declared geometry — this is the one place B could get expensive
```

**If 1 and 2 hold, this is narrower than "medium".** If 5 turns up several renderers, it is
wider, and that is the number that decides it.
