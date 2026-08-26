# Every form renders as SVG — the completion plan

**Phase 3 shipped four families and refused the rest.** The refusal was written as a fit
argument — *a treemap drawn by the curve family measures, rasterises and reads as a chart of
something* — and that argument is **correct about the curve family and wrong as a conclusion.**
A treemap needs its own SVG renderer, not the curve family's.

**The ruling this plan takes: every form renders as SVG. The shared layer is geometry; only
the final renderer differs.**

---

## Why this is not the same shape as the refusal

**The refusal says: a form whose coordinate is not `value → [0,1]` cannot be drawn by a family
that assumes it is.** True.

**The conclusion it was read as: those forms cannot be drawn as SVG.** False, and the
difference is which layer the argument is about.

```
THE SHARED LAYER      range · normalisation · tick selection · label text · the
                      decision of WHAT goes WHERE, in fractions of the box
THE RENDERER          how a fraction becomes ink — a cell, a glyph, or an SVG element
```

**Every refused form already has a terminal renderer that spends the shared layer's output its
own way.** A boxplot turns five summary positions into a glyph row; a treemap turns a
`hierarchy` walk into nested rectangles; a pie turns proportions into arcs.

**So the SVG arm is the same decomposition with a different final stage** — and the phase-3
architecture is already built for it: `SVG_FAMILY` is exhaustive over `PlotForm` by `satisfies`,
so **adding a family is a compile error until someone decides.** The mechanism to extend it is
the mechanism that refused the extension.

---

## The families to add, and what each one's coordinate is

**Four new families — and the count did NOT bound the work.** Families 5–8 name sixteen of the
nineteen refused forms; `contour`, `quiver` and `horizon` are in none of them, and the section
*The three forms four families do not reach* below is the correction and the ruling.

### 5 · Distribution — `boxplot · violin · ridgeline · forest · dumbbell`

**The coordinate is a set of positions on one axis**, not a series of values.

```
boxplot    min · q1 · median · q3 · max, plus outliers, plus an optional mean
violin     a density profile, mirrored about a centre
ridgeline  N density profiles, offset and overlapping
forest     a point estimate, a confidence interval, an optional pooled diamond
dumbbell   two positions and a connector
```

**All five are one row per category with positions along it** — which is why the terminal arm
put them in `glyph-row.ts`. **In SVG they are a `<g>` per category with primitives at
normalised x.**

**The shared layer already produces what they need**: `QuartileSummary` is data on the block,
and normalising five numbers is the same `normalisedOf` every other family calls.

**And this is the family with the strongest reason to want SVG** — a forest plot is what an
ablation table should be, and it is read at print quality more often than at 80 columns.

### 6 · Proportion — `pie · radar · waffle`

**The coordinate is an angle or a grid position**, not a linear axis.

```
pie      segments → arcs. Trivial in SVG and hard in cells — the terminal arm needs
         braille and a minimum-segment ruling because a dot is the resolution limit.
         SVG HAS NO SUCH LIMIT, so the minimum-segment merge is a TERMINAL-ONLY rule
radar    spokes and a closed polygon per series — a <polygon> with computed vertices
waffle   a grid of squares — <rect> per cell, and the aspect compensation the terminal
         arm needs DISAPPEARS because an SVG square is square
```

**Three things the terminal arm compensates for that SVG simply does not have**: the cell's 2:1
aspect, the minimum-segment threshold, and the dot grid's resolution. **State each as
terminal-only rather than porting the compensation.**

### 7 · Hierarchy — `treemap · flame · icicle · tree · graph`

**The coordinate is a rectangle or a node position from a layout pass**, computed before any
rendering.

```
treemap          squarified tiles — hierarchy.ts's `tiles` already returns them
flame · icicle   strips by depth — hierarchy.ts's `strips`
tree             Reingold–Tilford positions
graph            the layered pass — layers, ordering, dummy nodes, routing
```

**The layout is already shared and already unit-free** — `hierarchy.ts` returns positions on
the unit interval, and `tree`/`graph` compute node coordinates before they draw. **So this
family is the closest to free of the four**, and it is the one the phase-3 refusal named.

**The edges are the only new work**: the terminal arm strokes orthogonally through
`strokePolyline` because *a diagonal step would claim two edges at once*. **SVG has no such
constraint** — a `<path>` draws any angle — **so `graphLayout: "force"`'s refusal expires
on this arm and not on the terminal one.**

**That is worth stating rather than discovering**: a refusal that holds for one renderer and
not another is a per-arm ruling, and `force` becomes available at SVG the day this family
lands.

### 8 · Time-and-composite — `calendar · gantt · candlestick · waterfall · funnel · slope · timeline · bullet · stackedarea · streamgraph · pairplot · smallmultiples`

**The mixed bag, and it is mixed because each spends the coordinate on a compound.**

```
calendar         a date layout — 7 columns, N weeks. A grid, like waffle
gantt            a bar with a start offset — bar family plus an x origin per row
candlestick      four values per column — OHLC, and SVG draws the body and wick
                 as two <rect>s rather than a glyph
waterfall        a bar with a running baseline
funnel           a centred bar with decreasing width
slope · timeline positions on two axes with connectors
bullet           a bar, a target marker, qualitative bands
stackedarea ·    cumulative bands — the fold exists, and SVG fills with <path>
streamgraph
pairplot ·       DELEGATES to other families. It renders once each family it
smallmultiples   contains does
```

**The last two are the reason this family is built last**: a facet is a recursion into
`plotToSvg`, so it works exactly when everything it can contain does.

---

### The three forms four families do not reach — `contour · quiver · horizon`

**The count above is wrong as a bound, and the correction is the reason this section exists.**
*Four new families, and the count is what makes this bounded rather than open* — but nineteen
forms are refused and families 5–8 name **sixteen**. `contour`, `quiver` and `horizon` appear
nowhere in this document, so landing all four families finishes the campaign with the arm still
refusing three forms and a plan saying it does not.

**This is *a citation reads as coverage* applied to a partition.** The test is never *does the
plan mention the work* but *would landing it close the list*, and here the answer is no by three.

**They are not a fifth family. They share one blocker, and it is not the reason on record.**
`SVG_FAMILY` says the field forms carry *a second geometry the matrix family does not carry* and
that a horizon is *a band ladder folded over one row*. Both sentences are true and neither is the
blocker — F283's shape a third time, and the way to find it is to read the function rather than
the note:

| form | what its geometry function actually returns |
|---|---|
| `contour` | `contourCellRows(…, areaWidth, areaRows, levels, corners, caps)` → **`readonly string[]`** — marching squares over a **cell** grid, emitting box-drawing glyphs chosen by `caps.unicode` |
| `quiver` | the same shape through `glyphLayerOrder`, one arrow glyph per cell |
| `horizon` | `horizonGrid(…, areaWidth, areaRows)` → cells carrying `band`, `sign` and **`eighths`**, a sub-cell fill |

**The marks that would carry all three already exist.** An iso-line is a `polyline`; an arrow is a
`polyline` plus a `closed` triangle; a folded band is a `rect` with `value`. Nothing in the type is
missing — **what is missing is a derivation above cells.** These three forms never separated their
geometry from their rasterisation, so there is no coordinate to share: the contour *is* the glyph
string, and the horizon band *is* the eighth-block.

**So the condition is a symbol and not a judgement**, which is what makes it checkable when
somebody picks this up:

> `contour`, `quiver` and `horizon` join **family 4 (matrix)** and **family 3 (bar)** respectively
> the day `contourFigure` and `horizonFigure` exist — taking a block and returning normalised marks,
> with no `areaWidth`, no `areaRows`, no `caps` and no string in the signature. Grep the two names.

**Until then the refusal is real and it is a different refusal from the one written down.** It is
not *the type cannot express this*; it is *this form has no geometry yet, only a picture*. The first
would be a reason to widen `Mark`, and widening `Mark` would be wrong.

**Family 8 must not land first.** `pairplot` and `smallmultiples` delegate — they render once each
family they contain does — so a facet holding a `contour` recurses into a refusal and the composite
inherits it. The last two forms of the last family are the ones these three block.

---
## ★ The SVG arm takes its colour from the theme, not from its own palette

**Same data, same theme, same colours.** An SVG plot and a terminal plot of the same block are
the same picture at different resolutions — **not two designs that happen to share a shape.**

**This is a sixth hazard and §3aj does not have it**, because phase 3 shipped four families
that mostly draw one series in one tone. **The families this plan adds are where it bites**:
a pie has eight segments, a ridgeline has N series, a treemap colours by category, a forest
plot tones by significance.

### Where the colour comes from

```
categorical      the Okabe-Ito palette, capped at eight — C10's, not a new list
continuous       the colormap tables, all 142 — the same lookup the heatmap uses
tone             ok · warn · error · muted, resolved through C10 exactly as a cell is
surfaces         the plot's ground, its border, its gutter
```

**`resolve()` returns a `Style` and a cell renderer turns it into SGR.** The SVG renderer turns
**the same `Style`** into `fill` and `stroke`. **One resolution, two emitters** — which is the
same shape as the shared coordinate and it should be built the same way.

### What must NOT happen

**The SVG renderer must not carry hex literals.** Not for the axis, not for the gridlines, not
for the background, and not as a default. **A literal is a second source of truth for a colour
C10 owns**, and it will drift the first time a theme changes.

**And it must not reach for a web palette because it is drawing to the web.** `steelblue` is
not a Calcium colour, and a plot that looks like matplotlib in SVG and like Calcium in the
terminal is two products.

### The differences that ARE legitimate, and each is named

```
ANTIALIASING       an SVG curve is smooth and a braille curve is dots. Same colour,
                   different edge — that is resolution, not styling
LINE WIDTH         a cell is 1 unit wide; an SVG stroke has a width in pixels. It is a
                   RATIO of the box, not a constant, or it changes with the output size
FONT               the terminal's is the reader's; SVG names a monospace family. The
                   METRICS differ and the colour does not
NO DEGRADATION     an SVG plot is always 24-bit. The capability ladder has one rung —
                   which is why the arm exists
```

**That last one is the one to state explicitly.** The terminal arm degrades through
`colourDepth` and `unicode`; **the SVG arm does not degrade at all.** So a form whose terminal
rendering relies on a degradation rung — stacked strips at 1-bit, `CATEGORY_MARKS` where colour
cannot carry it — **draws the 24-bit answer in SVG and never the fallback.**

**And that is correct**, but it means **the two arms are not byte-comparable at low depth**, so
a test asserting *the same picture* must compare at 24-bit or compare structure rather than
output.

### The rows this owes, per family

```
C1   a series's colour in SVG resolves to the same C10 slot as in the terminal —
     asserted through resolve(), not by comparing hex to SGR
C2   the categorical palette assigns the same slot to the same series index
C3   a colormap's value maps to the same RGB at 24-bit in both arms
C4   the SVG renderer emits NO hex literal — a source scan, and it fires on a
     fabricated violation
C5   tone.error in SVG is C10's error, not a chosen red
C6   a theme switch changes both arms — the same block, two themes, and the SVG's
     fills move with the terminal's SGR
```

**C4 is the one with teeth** and it is SS47's shape one component over: **a literal at a call
site is what the glyph rules already refuse, and a colour literal is the same class.**

### And the catalogue proves it

**Every side-by-side frame in the catalogue is the assertion a test cannot make** — the same
form, the same data, the same theme, terminal beside SVG. **If they read as different products,
the rows passed and the arm is wrong.**

---

## ★ `form: "image"` — an image as a PLOT, in both arms

**The `image` block is a picture. An image *plot* is a picture with axes.** They are different
objects and the tree has only the first.

```
b.image({ data, height, alt })          a picture in the transcript
b.plot({ form: "image", ... })          a picture WITH the plot furniture:
                                        axes, a frame, a title, labels, ANNOTATIONS
```

**matplotlib's `imshow` is the reference and it is the right one** — an image plotted in a
coordinate system, with everything a plot has.

### Why it is not the block with a border drawn round it

**The furniture is not decoration; it is what makes the picture addressable.**

```
axes            pixel coordinates, or a declared range. "The activation at (128, 64)"
                is a sentence you cannot say about a picture with no axes
annotations     a bounding box, a point marker, a reference line, a region — ALL of
                the annotation machinery, over the image, in the image's coordinates
a title         which sample, which layer, which class
a colour bar    when the image IS a field rather than a photograph
```

**And it is what makes the overlay natural rather than special.** An attention map over an
input is **an image plot with a heatmap annotation** — *two things in one coordinate system by
construction*, rather than two blocks someone aligned.

### The family — matrix generalises, and that is the finding

**The matrix family's shared coordinate is not `value → colour`.** Phase 3 stated it as *value
→ [0,1], and what a renderer does with the [0,1] is its own* — **and that is one level too
specific.**

```
matrix's real coordinate     a cell position → a normalised RECTANGLE in the box
what fills the rectangle     a colormap lookup   (heatmap, correlation, spectrogram…)
                             a PIXEL             (image)
```

**So `form: "image"` joins the matrix family and the family's own statement widens.** A heatmap
is `imshow` over data; an image plot is `imshow` over pixels. **Same geometry, different fill.**

**Which means the extraction is nearly free** — the matrix family's SVG renderer already places
rectangles at normalised positions, and the image arm changes what goes in them.

### The two arms

```
TERMINAL     the dither, INSIDE the plot area, with the axes and frame around it.
             The image block's braille rendering, bounded by the plot's geometry
             rather than by its own declared height

             At kitty: the PLACEMENT inside the plot area — and the placeholders
             occupy exactly the cells the plot area gives them, which is the same
             computation imageCells already does against a different box

SVG          an <image> element at the plot area's rectangle, base64 in the href,
             with the axes and annotations as siblings
```

**The SVG arm is the simpler of the two**, and it is worth saying: an image in SVG is one
element with a rectangle, so **the family's geometry does all the work and the renderer adds
almost nothing.**

### What it needs that the block does not

```
a range per axis      pixel coordinates by default — 0..width, 0..height — or declared,
                      because an activation map's axes are token positions and not pixels
the ORIGIN            an image's y grows DOWNWARD and a plot's grows UP. That is a
                      ruling, not a detail, and getting it wrong flips every image
aspect handling       the plot area is a box the layout chose; the image has its own
                      aspect. Fit, fill, or stretch — and `fit` is almost certainly
                      right, with the slack going to the plot area's ground
interpolation         the image is larger than the cells or the SVG box. NEAREST for a
                      field (a heatmap of 8×8 must not blur), and it is a per-block
                      choice rather than a constant
```

**The origin is the one that will ship wrong.** Every image format is row-major from the top;
every plot's y-axis grows upward. **The terminal arm and the SVG arm will get it wrong
independently unless the shared layer answers it once.**

### And the annotations are the point

**Every annotation the plot system has, over an image, in the image's coordinates:**

```
a reference line       a row or column of interest
a threshold band       a region of the image
a point marker         a detection, a keypoint, a label anchor
a region               A BOUNDING BOX, which is what object detection wants and
                       what nothing in the tree can currently draw
a confidence band      —
```

**The bounding box is the one with an obvious consumer and no current answer.** A detection
result is an image plus N boxes plus N labels, **and it is expressible the moment an image is a
plot.**

---

## What must not happen — the hazard this plan creates

**Eight families is eight places to reimplement the shared layer.** The phase-3 hazards were
written for two arms and they now govern nine.

**G1–G5 apply per family, not once**, and the mutation that proves them must run against every
family rather than the first:

```
G1   the shared layer produces NORMALISED coordinates; each renderer rounds its own
G2   aspect compensation is a TERMINAL fact and never reaches the shared layer
G3   anything measured in cells stays in cells
G4   cells() cannot serve a rasterised label
G5   a pinned range with samples outside it — the only thing an open-coded copy
     gets wrong
```

**And phase 3 already found that G3 and G4 are one hazard with two symptoms** — *an SVG label
needs no metrics because `svgLayout` never sizes anything to fit one; pin the gutter to its
longest label and metrics come straight back.* **That correction applies to all eight families
and §3aj still lists them as independent.**

**The gutter-in-fractions rule is what will be violated by convenience**, and it looks correct
every time.

---

## The gate, per family

**Phase 3's own gate, applied eight more times:**

```
zero golden frames change      the terminal arm is untouched, by construction. A moved
                               frame is a finding, not a regeneration
zero catalogue frames change   same
the shared layer is EXTRACTED  before the SVG renderer is written, in its own commit,
                               and it moves nothing
```

**Two commits per family, never one.** If the extraction and the renderer land together, **a
moved frame is ambiguous between refactor and feature** — which is how a regression ships, and
it is C12 §3aj's own words.

**And the extraction is the interesting half.** Most families already have their geometry
separable — `hierarchy.ts` returns unit-interval positions, `QuartileSummary` is data on the
block, the OHLC fields are a typed record. **Where the geometry is tangled with the terminal
renderer, the extraction is the work and the SVG arm is what falls out.**

---

## The fixture rule, from phase 3's own survivors

**Every family's rows need samples outside the pinned range.** G5 survived its first mutation
because *values 1..9 on a range of 1..9 never fire the clamp, so open-coded arithmetic is
indistinguishable from the shared layer.*

**And the containment claim is not enough.** Phase 3's two survivors were both *ink stays inside
the plot area* — **a containment claim, and every wrong answer that is also inside satisfies
it.** So each family's rows assert **which** primitive is where, not that it is somewhere
legal.

**The matrix family's lesson specifically**: a `<rect fill>` has coordinates the rows checked
and **a datum they did not.** A colour assertion is a different row from a position assertion.

---

## Order, and the reason for it

```
5  DISTRIBUTION      the strongest reason to want SVG — a forest plot is read at print
                     quality. And the coordinate is the simplest of the four: positions
                     on one axis
6  HIERARCHY         the closest to free — the layout is already shared and unit-free.
                     And `force`'s refusal expires on this arm, which is a real gain
7  PROPORTION        three terminal-only compensations disappear, which is a clean
                     statement of what the arms differ by
8  TIME-AND-COMPOSITE last, because pairplot and smallmultiples RECURSE — they render
                     exactly when everything they contain does
```

**Distribution first because it is the most wanted; composite last because it depends on the
other three.**

---

## What this buys phase 4

**A 3D surface rendered to SVG is the same architecture one dimension up.** The shared layer
produces normalised coordinates; the renderer turns them into ink. **A projection is a
coordinate transform in the shared layer, and the SVG renderer draws `<polygon>`s.**

**Which means phase 4's own measurement — *does the cell grid hold a surface's silhouette* —
is asked against an SVG arm that already exists** rather than against one that would have to be
built for it.

**And if the answer is *the cell grid loses it*, 3D is an image form and the path is already
laid.** That is the argument for doing this before phase 4 rather than after.

---

## What is not in scope

```
new plot forms          this is about rendering what exists, not adding forms
the terminal arm        untouched. Zero frames move, per family, and that is the gate
`force` at the terminal it expires on the SVG arm only. The terminal refusal stands
                        with its own reason — strokePolyline is orthogonal
PNG output              the SVG converts through `sharp`, which is already in the ledger.
                        Nothing new
```

**And the terminal arm having no degradation is not this plan's subject** — it was raised
alongside and it is a separate measurement: **which forms degrade at which capability rung, and
which silently do not.** Worth its own pass, and it should not ride along here.

---

# Appendix · Proof that images work in a real terminal

**Everything about the kitty arm is structural today.** IK2 asserts the escape's form, the
grid's dimensions and the diacritic pairs — **properties, not a picture** — and the three
probes measured this repository's write path rather than a terminal's response to it.

**Two blind spots are already recorded and neither is closable from here:**

```
the plane-16 width guarantee     whether a terminal really measures a placeholder as
                                 one cell — cells() and Ink's layout agree, the
                                 protocol's own answer is the third
U=1 does not draw at the cursor  a virtual placement rather than a cursor-relative
                                 one. Fact 4 says it is survivable either way because
                                 the next byte is an absolute address — but survivable
                                 is not the same as correct
```

**Both are named in C09 §4c with *the first real-terminal test* as where they are checked. This
is that test.**

---

## What to run it against

**A real terminal that implements the kitty protocol.** Kitty itself, Ghostty, WezTerm,
Konsole. **Not a CI harness, not a pty capture** — the whole point is that something renders
pixels.

**And arbitrary images, not the corpus fixture.** The 8×8 PNG hid F252's chunking defect for
an entire phase because it never crossed the 4096-byte cap. **Stock photographs are the test:**

```
a photograph            2000×1500 or larger — the transmission's chunking under load
a screenshot            sharp edges and text, where scaling artefacts show
a diagram with text     the case where a wrong scale is instantly obvious
a tall portrait         aspect handling in the other direction
a 1×1 pixel             the degenerate, and it should draw one cell
a 16-bit PNG            a bit depth the decoder may not have been given
a palette PNG           colour type 3, which is a different decode path
an interlaced PNG       Adam7, which is a decode path that probably is not built —
                        and if it is not, the failure should be the status block
                        rather than a wrong picture
```

**The last three are decoder coverage the corpus cannot give**, and each is a real file people
have.

---

## What to look at, and what each answers

```
1  DOES IT DRAW AT ALL              the transmission reaches a real terminal
2  is it the RIGHT SIZE             the declared height in cells, honoured — and the
                                    width `imageCells` computed. THIS IS THE PLANE-16
                                    GUARANTEE, observed
3  is it in the RIGHT PLACE         the placeholders address correctly, and the rows
                                    above and below are undisturbed
4  does it SCROLL                   scroll it out of view and back. The whole argument
                                    for kitty over iTerm2 was that placeholders are
                                    ordinary text — this is that claim, observed
5  does a RESIZE survive            narrower and wider, and the image re-measures
6  do TWO images coexist            two blocks, two digests, both drawn
7  does the SAME image twice        one transmission, two placements — R6's ruling
8  does a partial redraw hold       type into the prompt while an image is on screen.
                                    A row rewrite below it must not disturb it
9  does U=1 hold                    is the cursor where the next write expects it —
                                    observable as the row AFTER the image being correct
10 does an EVICTION release         scroll far enough to evict, and nothing leaks
```

**Item 4 is the one the architecture rests on.** If an image does not scroll with the
transcript, the reason iTerm2 was refused applies to kitty too and the arm is a different
feature.

**And item 8 is the one that would have been found by no probe here** — Ink full-frames in this
repository's harness, so a partial redraw was never exercised against a real terminal's
placeholder.

---

## How to capture it

**Screenshots, and a screen recording for items 4 and 8**, because scrolling and a partial
redraw are motion.

**And the dither beside it**, for the same images at `imageProtocol: "none"` — **so the two arms
can be compared on the same subject**, which is the only way to judge whether the dither is
genuinely readable or merely present.

**Output to `docs/catalogue/images/real/`** with a `README` naming the terminal, its version and
the font, **because a placeholder's width is a font question and the answer is not portable.**

---

## What a failure means, per item

```
1 fails      the escape is malformed, or the write is not reaching. Probe 1's territory,
             and the harness said it does
2 fails      THE PLANE-16 GUARANTEE IS FALSE and cells() is wrong about the placeholder.
             That is a finding about the framework's width model, not about images
3 fails      the diacritic encoding is wrong — row/column pairs off by one, or the
             wrong plane
4 fails      the architecture's premise is wrong and kitty is no better than iTerm2
5 fails      re-measurement does not reach the transmission — a new width needs a new
             placement and possibly a new transmission
7 fails      R6's digest keying is wrong, and F251 is not fully closed
8 fails      a partial redraw destroys a placement, which would make images and the
             diff incompatible on a real terminal even though they compose here
9 fails      U=1 draws at the cursor, and every frame after an image is offset — the
             worst of the ten, and the one fact 4 argued was survivable
```

**Items 2, 4 and 9 are the three that would change the design.** The rest are defects.

---

## And it is worth doing before phase 4

**A 3D surface at the terminal arm is braille; at the image arm it is a transmitted PNG.**
Phase 4's own first measurement — *does the cell grid hold a surface's silhouette* — **assumes
the image arm works on a real terminal**, and nothing has observed that yet.

**If item 4 or item 9 fails, phase 4's fork has only one branch.**
