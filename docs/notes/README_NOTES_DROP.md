# The design notes — twenty-one files, and several are already in the tree

> **Unpacked 2026-09-01 with an errata preface, because a drop README is a citable source for the
> claims it makes about the tree.** The body below is unchanged; this is what checking it found.
> The pattern is the one the README's own closing section warns about, arriving in the README.
>
> **1 · "Overwrite where a file already exists — these are the authoritative copies" is false for
> every file the campaign touched.** Eight of the twenty-one differ from the tree, and in all eight
> the *tree* carries corrections the drop lacks — `CALCIUM_ARM_CATALOGUE.md` has
> `~~Generate the SVG catalogue at parity~~ — **it exists** (F309)`, `CALCIUM_IMAGES_NOTE.md` has a
> three-correction errata preface of its own. **Nothing was overwritten.** The tree's copy was kept
> in every case and the drop's discarded.
>
> **2 · `CALCIUM_NITS_AND_IDEAS.md` is the one that would have cost something.** The drop's copy is
> 25 685 bytes; the tree's is 2 832 and says *Empty as of 2026-08-13 — kept rather than deleted*,
> because its nits were **distributed** into entries and findings. Overwriting would have
> resurrected twelve already-distributed nits into a file whose own rule is *a holding pen that
> only grows is a second roadmap with no status column*. The README lists it as
> *"dropped earlier, a HOLDING PEN not a plan"* — true, and it does not say the pen was emptied.
>
> **3 · `CALCIUM_IMAGES_NOTE.md` "was cited repeatedly and measured as not in the tree, not in
> `git log --all`".** It is in the tree, at `docs/notes/CALCIUM_IMAGES_NOTE.md`, committed in
> `f1171d0` on 2026-08-22. `TUI_NOTE_images.md` is *also* there — so the reconciliation this
> paragraph asks for had already been done, in the other direction, and **the measurement expired
> when that commit landed**. A negative claim about the tree, true when written: F427's class, in
> the document warning about it.
>
> **4 · Where the files went.** Everything is under `docs/notes/` now. The four that sat at the
> repo root — `CALCIUM_ARM_CATALOGUE`, `CALCIUM_ARM_UNIFICATION`, `CALCIUM_NITS_AND_IDEAS`,
> `CALCIUM_SVG_COMPLETION` — were `git mv`'d there with their **tree** contents. Ten had no copy
> anywhere and were added as they came. Three sit in `docs/design/` and stayed: they are not root
> duplicates, and moving them would rewrite citations in five files to no end.
>
> **5 · Three of the new notes cite a bare invariant** — `I11`, `I1`, `I8` — whose owner is plain
> in the paragraph and not to `make enforce`. Each is named in `REFERENCE_EXCEPTIONS` with its
> reason rather than rewritten, on the tool's own argument for excluding `docs/archive/`:
> *rewriting a dated working document to cite ids that did not exist when it was written is worse
> than a pointer nobody should follow.* Named one by one, so the rest of `docs/notes/` stays
> checked.


**Unzip into `docs/notes/`. Overwrite where a file already exists** — these are the authoritative
copies of anything that was dropped piecemeal.

**Check which already exist before committing.** Some were dropped earlier in the campaign and
some were only ever cited — `CALCIUM_IMAGES_NOTE.md` was cited repeatedly and measured as *not
in the tree, not in `git log --all`*, and the committed note under that subject is
`TUI_NOTE_images.md`. **Reconcile rather than duplicate.**

---

## What is here

### Already committed, or believed to be — verify

```
CALCIUM_ARM_UNIFICATION.md    at the repo root, per the campaign
CALCIUM_BARS.md               dropped earlier, header says WRITTEN BY INFERENCE
CALCIUM_SPINNERS.md           dropped earlier, six errors found by asserting it
CALCIUM_MONITOR_EXAMPLE.md    dropped earlier
CALCIUM_NITS_AND_IDEAS.md     dropped earlier, a HOLDING PEN not a plan
CALCIUM_PLOT_PRIOR_ART.md     dropped earlier — RESEARCH, NOT A PLAN
PRISM_TUI_REDESIGN_NOTE.md    dropped earlier
AGENT_TUI_DESIGN.md           dropped earlier; step 0 ran, the app did not
```

### The plot campaign's own documents

```
CALCIUM_ENTRY3_KICKOFF.md     the plot system's planning brief
CALCIUM_PLOT_TESTS.md         the eleven-tier test architecture
CALCIUM_SVG_COMPLETION.md     every form renders as SVG + the real-terminal appendix
CALCIUM_ARM_CATALOGUE.md      the paired comparison sheet
CALCIUM_BLOCK_STATES.md       error · loading · retrying, one kind
CALCIUM_IMAGES_NOTE.md        the four phases and PHASE 3'S REGRESSION GATE
```

### Designed and unbuilt

```
CALCIUM_3D_DESIGN.md          ★ ITS PREMISE IS OPEN — see below
CALCIUM_LIVE_TERMINAL.md      a PTY inside a block, attach as a pushed view
CALCIUM_WIDGETS_DESIGN.md     sliders, toggles, series toggles, declarative binding
CALCIUM_ML_BLOCKS.md          token visualisation, structured diff, throughput, lineage
CALCIUM_DATAFRAME_IDEA.md     a tabular previewer with per-column summaries
CALCIUM_MERMAID_THEMING.md    classDef → tone, and the measurement that gates it
PRISM_NOTEBOOKS_IDEA.md       Prism notebooks, and why they are not Jupyter
```

---

## ★ `CALCIUM_3D_DESIGN.md` — read this before the design

**Its premise is open and phase 3 is what opened it.**

The design rests on: *a braille dot is square, so a projection into the dot grid needs no aspect
correction — every other terminal 3D attempt fights this and this one gets it free.*

**True, and no longer sufficient.** It says the terminal grid is *usable*; it does not say the
terminal grid is *where 3D should live*. **The SVG arm did not exist when it was written, and
160×96 dots is a smudge for a teapot.**

**So the measurement comes first and the design is read after it:**

```
render one surface both ways, plus the Utah teapot

    distinct depths resolvable      160×96 dots against the SVG's pixels
    where the silhouette breaks     the edge is where a smudge announces itself
    what the dither can carry       nine levels per cell against a continuous ramp

    the cell grid HOLDS it   → 3D is a TERMINAL form; the design stands roughly as
                               written, with an SVG arm
    the cell grid LOSES it   → 3D is an IMAGE form; the SVG path is primary and the
                               terminal arm is the dither the image block already has
```

**Different architectures, not different renderers.** The depth buffer, the lighting, the axes
and the performance tier are all shaped by which.

### Four things in it are wrong — marked, not left

**`rampFor` does not exist.** The tree has `ladderFor` over `LadderAxis`, and **dither is the
third axis, not the fourth.** The count matters: `Serves` is `Record<LadderAxis, boolean>`, so
widening it is a compile error at every existing ladder.

**`⚠` and `▼` are in no file in this repository.** Annotation glyphs from the figures, not
glyphs the tree has. The warning mark is `▲` / `!`.

**The Bayer citation was to a renderer that did not exist** — *the 2×4 ordered dither from the
3D renderer* — and phase 1 built one, **so the citation is now accidentally correct and should
say so rather than reading as a claim that was always true.**

**And §11–§12's animation costs assume a terminal renderer throughout.** If the measurement
sends 3D to the image path, **those two sections are about the wrong medium.**

---

## What is deliberately NOT in this drop

**`CALCIUM_ROADMAP.md`.** The copy in the author's outputs is stale by the entire campaign — no
status column, no F169 citation repairs, no anchors, and no entry corrected since. **Dropping
it would clobber all of it.**

**And the repo's own specs** — `C01`–`C24`, `A01`–`A04`, `S01`–`S15`, `B01`–`B04`, `R01`,
`TUI_*`. Copies exist in the outputs directory and **the tree's are authoritative.**

---

## Two standing warnings that apply to all of it

**Every drawing is a placeholder.** No far side has been run for any figure in any of these
files, and **eight drawings in `DOCKER_TUI_SURFACES.md` were wrong that way.** This campaign
added several more — `⚠`, `▼`, `[ERROR]`'s brackets, `rampFor`, `shiftInward`, the selection
readout, `CALCIUM_IMAGES_NOTE.md` itself.

**Run the where-is-this-written check on every named mechanism before building against it.**
The pattern is a definite article: *the `⎿` slot's four consumers*, *the selection readout*, *the
pinwheel*, *the Bayer matrix from the 3D renderer* — **each read as a reference and each existed
nowhere.**
