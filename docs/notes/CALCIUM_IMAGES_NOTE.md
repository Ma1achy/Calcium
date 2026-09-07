# Images — the capability, and the two plot features that want it

> **Committed at phase 1 with three corrections, because a note three phases cite becomes a
> citable source for the claims it got wrong.** The body below is unchanged; this preface is the
> errata, and it is here rather than inline so the note still reads as it was written.
>
> **1 · "The braille dither is already designed — the 3D renderer's ordered-dither over a 2x4
> Bayer matrix" cites nothing that exists.** There is no 3D renderer, no such design in any file,
> and `CALCIUM_ROADMAP.md` lists 3D plots under *Fights the architecture — deliberately not
> doing*. Every `dither` in the tree is C12 I17 calling dithered speckle a **defect**. The matrix
> is designed in C09 §4c at phase 1 and this sentence is what made it look unnecessary.
> **The note opens by naming this exact class** — *three designs reference it as though it were
> built* — and then does it once itself, which is the most useful thing about it.
>
> **2 · The iTerm2 reason is right about the shape and wrong about the mechanism.** *Inline images
> with a declared cell size — similar shape, different escape* is correct: iTerm2 images occupy
> cells and scroll. What they lack is **per-cell addressability**. Kitty's placeholders are
> ordinary text, so any row is independently re-emittable and text can sit inside the rectangle;
> an iTerm2 image is one escape at one cursor position, so a row-level rewrite of its region
> destroys it and nothing can be drawn into it. **The refusal stands and its reason is that**, not
> *draws at the cursor*. See C09 I36.
>
> **3 · The measurement in §"The measurement that decides everything below" has been taken.**
> F247 and F248: `cells(placeholder) = 1`, diacritics add 0, Ink lays out what `cells()` measures,
> Ink re-emits the full frame on a one-row change, and truncation and windowing are both safe.
> **The answer is yes** — an image declares a height in cells and participates in the grid.


**Not scheduled. A note, because `imageProtocol` has been detected and unread for the whole
project and three designs reference it as though it were built.**

---

## The state

```
imageProtocol: "none" | "iterm2" | "kitty" | "sixel"      detected in C02, READ BY NOTHING
```

**Roadmap's *images (kitty)* row says *designed already; unlocks mermaid HD + ML samples*.**
Three documents in `docs/` say *the high-fidelity path is free once images land.* **Nobody has
checked whether it is.**

---

## The measurement that decides everything below

**Can an image participate in the cell grid?**

```
kitty placeholders    an image occupies a declared rectangle of CELLS. Text can be
                      written around it, it scrolls with the content, and the grid
                      still knows where everything is
iterm2                inline images with a declared cell size — similar shape,
                      different escape
sixel                 draws at a cursor position and does NOT participate. No
                      placeholders, so it does not scroll with the content above it
```

**If an image can declare a height in cells and the protocol honours it, everything below is
straightforward — it is a block that measures.** If it floats over the grid, every feature
here is fighting the framework.

**And the honest likely answer is kitty and iTerm2 only, with sixel declared unsupported
rather than half-supported.** A protocol that cannot scroll with the transcript is not a
protocol this framework can use, and saying so is better than a broken third arm.

**Run this before designing anything.** It is the same question as mermaid's *does the library
return structure* — and the last four dependency decisions here were settled by measurement.

---

## Feature 1 · Plots AS images — and it is weaker than it sounds

**granite's dual backend**: one declaration, rendered to a terminal grid or to a real image,
chosen by capability.

**The argument against, and it should be the default position:**

**Everything that makes a terminal plot good is what an image gives up.**

```
it scrolls              an image scrolls only if the protocol has placeholders
it diffs                output diffing writes changed ROWS. An image is one blob
it degrades             the whole capability ladder, gone — an image is an image
it copies as text       y on a plot copies its source; an image copies nothing
it MEASURES             the block's height is a fact; an image's is a negotiation
```

**So a rendered image is prettier and less useful.** It should be **opt-in per plot**, never
automatic where the protocol exists — `plotStyle: "image"` beside `braille`, `line` and
`ascii`, and a caller who wants a screenshot-quality chart asks for one.

**Where it genuinely wins**: a 3D surface, a dense scatter of 100k points, a spectrogram at
full resolution. **The cases where the terminal grid is the binding constraint rather than the
medium.**

---

## Feature 2 · Plots that CONTAIN images — and this is the one ML needs

**Here the image is the data and the plot is furniture.**

```
a sample grid                 N images with labels and predictions under each
image + heatmap overlay       attention or saliency, REGISTERED to the pixels
before / after / residual     input, reconstruction, and the difference
a confusion matrix of examples   the images that got confused, in the cells
image + channel histogram     the picture and its distribution, side by side
```

**The overlay case is the real constraint.** An attention map over an input image needs the
two **registered** — the heatmap's cell grid aligned to the image's pixel grid — which is not
a layering trick. **Either the image is placed to align with cell boundaries, or the overlay
is drawn into the image before it is emitted.**

**The second is probably right and it changes the shape**: compositing the overlay into the
image means the *image* carries the heatmap, so it is one blob and the alignment is exact.
**But then the heatmap is not a Calcium render** and none of the palette, ramp or degradation
work applies to it.

**That is a genuine fork and it wants deciding rather than discovering.**

**And a sample grid is a block kind, not a plot form.** It is mostly pixels with labels around
it — a table whose cells are images — and forcing it into `PlotForm` would be the
vocabulary-into-the-wrong-geometry class this component has now hit four times.

---

## What both need first

```
an image BLOCK          declares a height in cells, carries the data or a path,
                        measures like everything else
the degradation         at imageProtocol: "none" an image is... what? A box with a
                        caption? A braille dither of it? THE ANSWER DECIDES WHETHER
                        THE FEATURE IS USABLE ON A NORMAL TERMINAL
the cache key           an image's identity, so a changed image invalidates and an
                        unchanged one does not re-emit a megabyte of base64
```

**The degradation question is the one that matters most.** Most terminals are `"none"`, so
**a feature that shows nothing there is a feature most readers never see.**

**And the braille dither is already designed** — the 3D renderer's ordered-dither over a 2×4
Bayer matrix is exactly the machinery an image would need, at nine intensity levels per cell.
**So an image at `"none"` is a dithered monochrome rendering rather than a blank box**, which
is the honest fallback and is genuinely readable for a sample grid.

---

## Order, if it is ever picked up

```
1  MEASURE the protocols — placeholders, cell participation, scrolling
2  the image block, with the dither fallback FIRST rather than as an afterthought
3  the sample grid — the ML consumer, and a table whose cells are images
4  the overlay, and the registered-versus-composited fork
5  plots as images, opt-in, for the cases where the grid is the constraint
6  mermaid HD, which is a consumer of 2 rather than a feature of its own
```

**Step 2 with the dither fallback ships something that works on every terminal**, which is the
test of whether the order is right. An image feature that only works on kitty is a feature
most of its audience cannot use.

---

## The revised order — images first, 3D last

**Each is the next one's prerequisite, which the earlier ordering had backwards:**

```
1  IMAGES              the block, the protocols measured, the dither fallback
2  PLOTS OF IMAGES     sample grids, overlays — needs 1, and it is what ML wants
3  PLOTS AS IMAGES     the second renderer — needs 1 to emit anything
4  3D                  needs 3, because a 3D surface is the case where the cell grid
                       is the binding constraint
```

**3D last matters more than it looks.** Braille dots being square is a real advantage and it
is also the ceiling: a 3D surface at 80×24 is 160×96 dots, and **a teapot in 160×96 is a
smudge.** The same scene rendered to a real image is where 3D actually looks good — so
building the terminal version first is building the worse one first.

**And the dither fallback in step 1 stops being an image-only concern.** Once it exists,
every plot has an image path with a monochrome fallback, so step 3 **inherits its degradation
from step 1 rather than inventing one.**

---

## The second renderer — probably SVG, not PNG

**Not *plots as images* as a rendering tier — a second renderer with the same declaration**,
which is granite's actual point: it renders to a terminal AND to SVG from one call.

**SVG is the cheaper target than PNG:**

```
text stays text        no font rasterising, which is the hard part of drawing your own
vector                 scales, and the browser or viewer does the antialiasing
converts               one library turns it into PNG for the kitty path
```

**So `plotStyle: "svg"` rather than `"image"`, and the kitty path is *render SVG → rasterise
→ emit*.** Worth noting before anyone reaches for matplotlib, because a Python runtime inside
a TypeScript framework is a dependency of exactly the kind this project keeps measuring and
refusing.

**And it is plausible because the plot system is 90% geometry and 10% rasterisation** —
scale, axes, ticks, layout, colormaps, legend and annotations already exist. **Only the last
stage changes.**

---

## ★ The regression hazard, and the gate that closes it

**Sharing geometry between the terminal renderer and the image renderer is where the ASCII
versions break**, and the break is silent — a moved boundary case, not an error.

### The gate: the refactor lands in its own commit, and ZERO golden frames change

**Two commits, never one.** Make the geometry unit-agnostic and prove nothing moved; *then*
add the image path. **If both land together a moved frame is ambiguous** — refactor or new
feature — and that ambiguity is how a regression ships.

**Byte-identical, not *looks the same*.** 136 frames, `git diff --stat` reports zero. A frame
that moves is a finding and it gets read before anything else happens.

### The four known hazards

**1 · Where the rounding happens.** Cell coordinates are integers; pixel coordinates are
floats. **The tempting refactor makes the shared code float and rounds at the output — and
that moves every boundary case by one cell.** `Math.round` at the end is not `Math.round` at
each stage, and the difference is invisible in the code and visible in every frame.

**The rule: the shared layer produces NORMALISED coordinates (0..1) and each renderer does
its own rounding.** Then the terminal path's arithmetic is unchanged by construction.

**2 · Aspect ratio is a terminal fact.** `circle.ts`'s `rx = 2·ry`, braille's 2:4
cancellation, the waffle's square mosaic — **all of it compensates for a 1×2 cell and none of
it belongs in a shared layer** where a pixel is 1×1.

**3 · Anything measured in cells.** `labelWidth`, `AXIS_GUTTER`, `MIN_AREA`, the truncation
ladder. **Cell facts, and the image renderer needs its own in pixels from font metrics.** If
one ends up shared, the terminal version starts sizing by something that is not cells.

**4 · `cells()` itself.** Ambiguous width, grapheme clustering, the wide arm — **none of it
applies to a rasterised label.** A shared layout that calls `cells()` cannot serve the image
path, and that will be discovered as a wrong-looking image rather than as an error.

### The rows that catch divergence at the shared layer

**Render the same block through both paths and assert the NORMALISED geometry agrees** —
before either rasteriser runs.

```
G1   niceAxis returns the same ticks for both targets
G2   normalised sample positions are identical
G3   the legend entry list is identical
G4   annotation positions are identical in normalised space
G5   only the RASTERISATION differs — asserted by diffing the two stages' inputs
```

**That is what stops a divergence being found as a wrong picture three components away.**

### Measure before starting

**Whether `layoutFor` and `niceAxis` already assume cell units throughout.** If `niceAxis` is
unit-free — it takes a range and a count — **most of the geometry is already shared and only
the layout ladder is not**, which makes this a small refactor rather than a large one.

**And confirm the catalogue is still reproducible** by running it twice and diffing. The
`Math.random()` finding is recent; **a non-reproducible catalogue makes this entire gate
worthless.**
