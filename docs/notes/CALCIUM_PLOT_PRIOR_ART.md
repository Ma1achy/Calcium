# Terminal plotting — prior art, and what to take from each

> **★ STATUS: research, not a plan. Nothing here is scheduled.**
>
> **This document is the input to a planning pass, and that pass has not happened.** It
> surveys the field, records what to take, and lists far more chart types than the ML package
> will build — but **it does not decide which, in what order, or what any of them costs.**
>
> **When roadmap #3 comes up, plan it before building it.** The planning pass owes:
>
> - **which types**, against a real consumer each — this document lists ~40 and names
>   consumers for perhaps a dozen. *A chart with no consumer is F21's shape.*
> - **the shared config record**, which three libraries independently converged on
> - **the annotation feature**, which collapses six named types into one
> - **`ambiguousWidth`**, which is freeze-relevant and gates the line style
> - **and the categorical palette**, which is a third axis beside `Tone` and the change axis
>
> **Two of those are public types**, so the planning pass is not optional and it is not
> after the fact.
>
> **Nothing in this file is a commitment.** The drawings are targets, every figure is a
> placeholder, and *eight drawings have been wrong that way.*

Research for roadmap #3, the ML package. **The conclusion is build, and the reason is not
pride** — it is that charting splits into two halves and only one of them is a dependency's
job.

---

## The landscape, measured against Calcium's own criteria

A 2024 JOSS survey of terminal plotters classifies every one by **rendering resolution**, which
is the axis that matters:

```
high   braille, 2×4 dots per cell     drawille · plotille · plotext · termgraph
half   half blocks, 2×1               itrm's middle tier
low    asterisks and box drawing      asciichart · bashplotlib · terminalplot · termplot
```

**Calcium's plot is already in the top tier**, and with a degradation ladder none of them has.

| | resolution | tiers | bar/hist | heatmap | notes |
|---|---|---|---|---|---|
| **Calcium** | braille 2×4 | **1/4/8/24-bit · full/bmp/ascii · 1-bit strips** | — | — | line and sparkline only |
| plotille (Py) | braille 2×4 | colour modes only | hist | via bg colour | the closest sibling; `Figure` API is good |
| plotext (Py) | braille | themes | yes | yes | most featureful; **unmaintained since 2024**, rewrite stalled since 2023 |
| textual-plot (Py) | braille + quadrants + halves | — | — | — | Textual's; explicitly *not* a do-it-all library |
| ratatui (Rust) | braille canvas | markers | **BarChart** | — | the best-engineered; widget-per-chart |
| asciichart (JS) | box drawing | none | — | — | 2.1k stars, line only, **8 of 10 glyphs ambiguous-width** |
| simple-ascii-chart (TS) | **ascii + braille** | renderer flag | **yes** | **yes** | covers the gap; 6 stars, solo |
| YouPlot (Ruby) | blocks | — | yes | yes | wrong language; good CLI conventions |

**Nothing has a 1-bit tier.** That is not an oversight on their part — **they are libraries, not
frameworks**, and a capability ladder is the framework's job.

---

## Why build rather than depend — the discriminator this project already used

```
lowlight             200 language grammars       LARGE domain, drawing incidental   → took it
beautiful-mermaid    graph layout, edge routing  LARGE domain                       → taking it
a bar chart          scale · bin · draw          SMALL domain, drawing IS the thing → build it
```

**`lowlight` earns a dependency because tokenising 200 languages is enormous and how you paint
the tokens is incidental.** A bar chart is the inverse: **the drawing is the whole thing, and
every drawing decision is Calcium's capability ladder.**

**And the machinery already exists.** `scale.ts`, `axes.ts`, `raster.ts`, `height.ts`, `ramp.ts`
and `strips.ts` are the hard parts of a plot and they are built for the line renderer. **A bar
chart is a different fold over the same grid**, not a new subsystem.

**Three more reasons, each measured rather than asserted:**

**A library returns a string; a block must measure.** `measure(block, width) → height` has to be
right *before* rendering. Wrapping a library means auditing `cells()` on every returned row and
trusting a width the library computed under its own assumptions.

**Every one of them assumes narrow ambiguous width without saying so.** asciichart's `┼─╰╭`,
plotext's blocks, ratatui's `symbols::shade::FULL` — all ambiguous, all undeclared. **Taking one
means inheriting an assumption Calcium is about to make explicit.**

**And plotext, the most featureful, has been unmaintained since September 2024** with a rewrite
stalled since 2023. That is the maintenance half of the `lowlight` vetting rule answering
itself.

---

## What to take, and it is all content rather than code

### From `plotille` — the API shape

**`Figure` composes plots rather than each plot being a function.** Width, height, x/y limits,
labels, colour mode, origin — set on the figure and shared. **That is the shape a multi-series
block wants** and it is better than a per-call options bag.

**And `marker:` — a character instead of braille dots.** A per-series marker is how you
distinguish curves *without colour*, which is the problem C12 §5 solved with stacked strips.
**Worth revisiting**: markers may make overlaid curves legible at 1-bit after all, which would
make the strip layout an option rather than the only answer.

### From `ratatui` — the engineering

**`BarChart` with grouping, and `Sparkline` with `absent_value_symbol`.** The second is the
detail worth stealing outright: **a missing sample is not a zero**, and rendering it as one is a
lie the reader cannot see. Calcium's `sparkline` filters non-finite values and *closes the gap*,
which silently shortens the series.

**And their scaling bug is worth reading**: `BarChart` and `Sparkline` moved to a `u128`
intermediate before division to stop overflow at large values. **A chart that panics on a big
number is a chart that panics on real data.**

### From `simple-ascii-chart` — the vocabulary

```
bar layouts    overlap · grouped · stacked · normalized
heatmap        levels, each a value range with its own symbol
renderer       ascii | braille as an explicit switch
symbols        every glyph overridable
```

**Four bar layouts is four rules, not four thousand lines** — and it is the list that would
otherwise be discovered one consumer at a time. **The `symbols` override is the design that
makes width safety achievable in a library**, and it is the shape `ambiguousWidth` takes here.

### From `matplotlib` — the tables, not the dependency

**Viridis, magma and inferno are 256 RGB triples each.** Take the table. The roadmap already
rules this and it holds: *take the colour maps and the layout conventions, leave the
dependency.*

**And the binning rules** — Sturges, Freedman–Diaconis, Scott — are three formulas, and a
histogram that picks its own bin count badly is a histogram nobody trusts.

### From `YouPlot` — the CLI conventions

Wrong language, and its **flag vocabulary is prior art for a `/plot` verb**: `--fmt`, `--xlim`,
`--canvas`, `--symbol`. Someone has already run the naming argument.

---

## What none of them does, and it is where Calcium earns its place

**A capability ladder.** Every library above picks one rendering and offers a switch. Calcium
resolves **colour depth × unicode level × ambiguous width** and has an answer at each rung —
which is why the 1-bit stacked-strip ruling exists and why no library needed one.

**And a block that measures.** A plot inside a scrolling transcript that virtualises, windows
and caches on `(entry, rev, width)` is a different object from a string printed to stdout.
**Nothing in the survey is that**, because nothing in the survey lives in a frame.

---

## The order that falls out

```
1  bar · horizontalBar    the bar style set with a label column — nearly free
2  histogram              bar, plus binning rules
3  heatmap                the sleeper — a grid of coloured cells IS a terminal.
                          Colormaps as tables, braille density ramp at 1-bit
4  candlestick            bar, plus a second value per column
—  pie                    circle approximation, looks rough, low value
—  sankey                 edge routing — the same problem as Mermaid layout
—  3D                     a novelty, and the roadmap already refuses it
                          ← REFUSAL RETRACTED (F435) and the form is BUILT: `plot3d`,
                            src/presentation/plot/{project3,axes3,scatter3,surface3}.ts — 2026-09-03
```

**Heatmap is the highest value and among the easiest**, which is the roadmap's own read and
survives the survey: **plotille does it with background colours and nobody else does it at
all.**

---

## The fuller list, organised by what each one needs

**The roadmap's list is short and three of the gaps are nearly free**, because the machinery a
chart needs is already built for something else.

### On the raster that exists — `scale · raster · strips`

```
scatter          plot without interpolation. plotille's own definition: `plot(interp=None)`.
                 FREE — the braille grid is already a point renderer
step             a line that holds its value. One branch in the curve fold
stacked area     a line, plus fill below it. The fill IS the braille grid's dot rule
error bars       an ANNOTATION on scatter or bar, not a type — a whisker per point
strip / beeswarm 1D scatter. Free, and it is what a violin degrades to
```

**`scatter` is the omission worth naming.** It is the same code path as `line` with the
interpolation switched off, and it is what an ML consumer reaches for before a line — residuals,
embeddings, a sweep's results.

### On the bar machinery, once it exists

```
box plot     ├──[▬▬▬|▬▬]──┤  ▪ ▪      quartiles, median, whiskers, outliers
bullet       ▬▬▬▬▬▬▬▬▬░░░░ ┃          a bar with a target marker
gantt        ▬▬▬▬                     bars with a start offset — a job queue, a run schedule
                 ▬▬▬▬▬▬
waterfall    a bar chart with a running total and a baseline per column
```

**The box plot is the sleeper on this list.** It is a *horizontal glyph sequence* — no raster,
no grid, one row per series — and it is **the standard way to compare distributions**, which is
what comparing training runs is. **Cheaper than a histogram and more informative at a glance.**

```
run-a   ├───[▬▬▬|▬▬▬]────┤    ▪
run-b     ├──[▬▬|▬]──┤
run-c   ├─────[▬▬▬▬|▬▬▬▬▬]──────┤  ▪  ▪
        0.02        0.06        0.10   loss
```

**And `bullet` is the progress bar with a threshold**, which the footer's context bar already
almost is — same mechanism, one marker added.

### On the heatmap, once it exists

```
calendar heatmap    a heatmap with a date layout — run history, commit frequency
confusion matrix    a heatmap with labelled axes — ALREADY the roadmap's named consumer
spectrogram         a heatmap over time × frequency
correlation         a heatmap, symmetric, with a diverging colormap
```

**All four are the same block with a different axis layout**, which is the argument for building
the heatmap properly once rather than four times.

### Wanting a layout that does not exist

```
parallel coordinates   vertical axes, a polyline per sample. HYPERPARAMETER SWEEPS
ridgeline / joyplot    stacked density curves — and C12's 1-bit STRIPS ARE THIS SHAPE
violin                 a mirrored density. Needs kernel density estimation
dendrogram             a tree — edge routing, but a tree is the easy case
sankey                 a graph — edge routing, the Mermaid problem
```

**Parallel coordinates is the ML-specific one nobody does in a terminal**, and it is genuinely
suited: vertical axes are columns, a sample is a polyline, and **a hyperparameter sweep is
exactly what it was invented for.** Prism's use case, and no prior art to borrow from.

**And ridgeline is C12's stacked strips with density instead of a curve** — the layout is built,
the fold is different. Worth knowing before either is designed.

### Refused, with reasons

```
3D               a novelty, not a tool — already refused   ← WRONG at HEAD: retracted (F435), built as `plot3d` (2026-09-03)
sankey           edge routing — the Mermaid problem, and it wants a real layout engine
                 ← the Mermaid ruling was REVERSED (CALCIUM_ROADMAP.md, 2026-08-15) and a
                   layered router ships as the `graph` form; sankey stays absent on its own
                   merits, not on that ruling (2026-09-03)
                 ← RE-RULED the same day with a measurement, C12 §3d *Sankey*: `graphLayers`
                   transfers and nothing after it does — no edge weight, a bar for a label, a
                   ribbon for a mask bit, left-to-right for top-down. A new form, no consumer
                 ← BUILT 2026-09-04 as `sankey` (C12 §3ap): the consumer arrived as
                   `GraphEdge.weight` (C04 I92), and the form is exactly the ruling's shape —
                   `graphLayers` plus a placement (`sankeyLayout`) and a drawing (`sankeyArea`,
                   `sankeyMarks`). Compared before drawing against d3/plotly and
                   `mermaid-ascii`'s sankey, which is one line per flow and no layout
```

**Nothing on this list is refused any more.** Every entry above has either been built or
had its reason measured away; what remains absent — `arc`, `chord` — is absent for want of a
consumer and is not on the list.

**`contour` was on this list and is not any more — see the correction below.**

**And *the Mermaid problem* has stopped being one — see the second correction.** The line above
is kept as written because what it says about `sankey` may still hold; what it cites no longer
does.

**`pie` is NOT refused** — see below. `radar` follows it: same circle problem, same answer.

### The correction — `contour` was misclassified, and the grouping is what carried it

**Marching squares is local. Mermaid's layout is global.** For each 2×2 group of grid points the
four corners are each above or below the threshold — sixteen cases — and each maps to a segment
through that one cell. No routing, no layout engine, nothing that has to see the whole figure.
The two problems are not the same problem at two sizes; they are different problems, and contour
was grouped with `sankey`, `arc` and `chord`, all three of which genuinely *are* edge routing.
**It inherited their disposition on the strength of the grouping.**

**The claim appeared four times in this document and was measured none of them** — the block
just above, the order table below it, *What this does to the order*'s `still refused` row, and
*Where the list actually ends* — each restating the last. That is the compression class CLAUDE.md names:
*repetition across documents is not corroboration*, and four restatements of an unmeasured claim
are one unmeasured claim. Here they were not even four documents.

**Measured instead**, against `linedraw.ts` at HEAD: all sixteen cases were enumerated and every
one lands on an entry the shipped `glyphForMask` table already has — **zero new glyphs**, eight
distinct masks, and the derivation from corners to edges is four lines:

```
mask = (top ? UP : 0) | (right ? RIGHT : 0) | (bottom ? DOWN : 0) | (left ? LEFT : 0)
       …where an edge is crossed exactly when its two corners disagree
```

Adjacent cells therefore agree **by construction** — a shared edge has the same two grid corners
on both sides — so the strokes join with nothing joining them. The `rounded`/`sharp` fork and the
ASCII arm come along unchanged, because they are properties of the table rather than of a curve.

**The half of the refusal that survives is the half nobody repeated**: *the labels are worse than
the lines.* A contour label sits **in** the line it names, in a gap cut for it, and there is no
gap-cutting vocabulary here — a label written over a contour is the contour with a hole in it,
which is `behind()`'s argument for gridlines one layer up. So **a level is named in the legend
and never on the line**, and that is a ruling rather than an omission.

**And one thing the refusal never reached.** Both saddle cases cross all four edges, so both
resolutions produce mask 15 → `┼`: at cell resolution the choice matplotlib makes by the cell's
centre value **has no observable consequence**. It separates only at braille, where the two
segments genuinely part — which is why the contour's default arm is braille and not the box
drawing that made the reversal possible. *A ruling that cannot be violated on the arm it ships
on reads exactly like one that is obeyed.*

`quiver` was never on the list, and it is the same field with a vector at each point: direction
picks the glyph, magnitude picks the colour. Both are specified in C12 §3y.

### The second correction — every reason given for refusing a graph has been a cost argument

**The recorded reason is build cost.** `DEPENDENCIES.md` states it plainly: *layout is the whole
problem… the alternative to a dependency here is not 150 lines but a layout engine.* **The
framework bought the engine.** `beautiful-mermaid` 1.1.3 ships at one call site and brings
`elkjs` 0.11 with it — `layered`, `stress`, `mrtree`, `radial`, `force`, `disco`. Node-and-edge
data already renders in this tree, through `mermaidCode`, into a `code` block.

So the reason is spent, and each replacement reached for turned out to be the same argument in
different clothes:

| reason | status | measured |
|---|---|---|
| layout is expensive to build | **expired** | the dependency ships; `elkjs` is transitive |
| it is expensive to run | **dead** | Fruchterman–Reingold, 300 iterations: **24.2 ms at n=20, 10.4 at n=50, 36.1 at n=100** |
| it is non-deterministic | **dead** | a circular initial placement needs no draw at all — SS2 untouched, no `createRng` |
| the edges cannot be drawn | **expired, and it was never a fit argument** | *`strokePolyline` steps orthogonally* is a fact about **the tool**. `drawLine` in `raster.ts` strokes arbitrary angles at 2 × 4 and is on every line plot's default path |
| **the labels collide** | **stands** | below |

**The fourth row is the one worth reading twice**, because it reads as a property of the figure
and is a property of the toolbox — the diagonal renderer is not hypothetical, it is what
`curve.ts` calls. A refusal accumulates reasons faster than it loses them: each new one is
written by somebody who found the last one thin, and nobody re-reads the stack.

**What stands is the labels, and the first probe measured it at both extremes.** Node centres
snapped to 74 × 20, 8-cell labels, overlapping label pairs:

```
                   n=12                n=20                n=50
near-path       0 pairs   0.0%      0 pairs   0.0%      48 pairs   3.9%
dense ~1/3      6 pairs   9.1%     33 pairs  17.4%     199 pairs  16.2%
complete        0 pairs   0.0%      0 pairs   0.0%       0 pairs   0.0%
```

**Both ends read clean and the middle fails.** A near-path graph is nearly a layered graph; a
complete graph's force layout is a ring with every node equidistant. Real graphs are neither, and
at a third of the edges present **one label pair in six overlaps at n = 20**. The near-path probe
was run first, returned zero, and the refusal was moved off the labels on the strength of it —
which is this document's own `contour` lesson turned on the instrument instead of the claim.

**This is the second refusal here to survive on its labelling rather than its drawing.** The
`contour` correction above ends the same way: *a level is named in the legend and never on the
line.* Two instances is the minimum for noticing a shape and not evidence for one, so it is
recorded and not promoted — but the answer it suggests for a graph is the same answer: **mark
the nodes in the figure and name them in the legend**, which costs no placement pass at all.

**The ruling now lives in C12 §3ai and I58; what is below is the measurement behind it.** This note is a record and not a contract, and a refusal carried only by a plan is a belief — which is the distinction this file's own fourth row is about, one level up.

**So `force` is refused on the labels alone, and the refusal carries its expiry.** When a label
pass can shift, drop and count — C12's label taxonomy, `shiftInward` — a force graph draws the
nodes it can label and counts the rest, on I8's mechanism. Written as a symbol because **a
deferral names a condition and nothing watches it**, and three of the five rows above expired
without anyone noticing.

---

## What this changes about the order

```
1  scatter          FREE — the raster is a point renderer already
2  bar · horizontalBar
3  box plot         cheap, no raster, and the best distribution comparison there is
4  histogram        bar plus binning rules
5  heatmap          the sleeper, and four consumers share it
6  bullet · gantt   bar variants, and bullet is the context bar with a marker
7  parallel coords  ML-specific, no prior art, and Prism is the consumer
—  violin · ridgeline · dendrogram · candlestick    later, each with a real consumer first
                                                     ← violin and ridgeline are BUILT; dendrogram
                                                       is not; `candlestick` is not a form name (2026-09-03)
7  pie · radar        circle approximation — rough and wanted anyway   ← both BUILT
—  sankey · 3D                                       refused   ← 3D BUILT (F435); sankey absent, and
                                                                 not because of the reversed Mermaid ruling
—  contour                                          REVERSED — see the correction
```

**`scatter` moves to first because it is free**, and **the box plot moves ahead of the histogram
because it is cheaper and answers the same question better** — *which of these runs is worse,
and by how much* rather than *what does this distribution look like*.

---

## The line style is a tier, and box drawing is the top of it

**`ambiguousWidth` unlocks the aesthetic**, and the connected-line look is its clearest case:
**box drawing is the only way to get proper joins and it is ambiguous throughout**, so refusing
it costs the whole style.

```
narrow (default)   box drawing — connected curves, real joins
wide               braille 2×4 — dense, no joins, the current renderer
ascii              / \ | _ - and the existing 1×8 ramp
```

**Braille becomes a fallback rather than the ceiling**, which is the right relationship: it is
what you use when the terminal cannot be trusted, not what you use always.

### The glyph set is small, which is why it is cheap

```
─ │        the two straight runs
╭ ╮ ╰ ╯    the four rounded corners — the ╭┈╯ look
┼ ┤ ├      crossings and the axis join
╶ ╴        line ends — and BOTH of these are already narrow
```

### But it is not a strict upgrade, and that decides the API

**A box-drawing line is one sample per cell; braille is two.** So the narrow tier is **cleaner
and lower resolution** — a 200-point series in 80 columns loses more of itself.

**So the style is declarable per plot, not purely capability-driven.** A dense training curve
wants braille even on a narrow terminal; a six-point comparison wants the clean joins. **The
capability caps what is available; the plot picks within it.**

```
style: "auto"     the default — box drawing where narrow, braille where wide
style: "braille"  always, and it is right for dense series
style: "line"     box drawing, and it FAILS LOUDLY under `wide` rather than degrading
                  silently — a chart twice its declared width is not a chart
```

### Two things to decide when it is built

**Rounded against sharp is a style, not a tier.** `╭╮╰╯` versus `┌┐└┘` — same widths, different
feel, and **a theme could carry it.** The rounded set is what makes asciichart look good and
offering both costs nothing.

**And a connected line cannot overlay two series without colour** — C12 §5's problem exactly, so
the stacked-strip ruling applies unchanged. **But `plotille`'s `marker:` may beat it**: a
per-series character at each vertex distinguishes curves at 1-bit where a join cannot. **Test
before assuming strips are the only answer** — that ruling was made when braille was the only
renderer.

---

## Worked examples, in the style of the libraries that got them right

**Drawn as targets. Every one is a placeholder until the renderer exists** — the drawings-owe
rule, which has cost eight of them.

### Line, box drawing at `narrow` — the `╭┈╯` look

```
 26.00 ┤                             ╭─╮
 21.67 ┤        ╭╮                  ╭╯ ╰╮
 17.33 ┤       ╭╯╰─╮      ╭───╮    ╭╯   ╰╮
 13.00 ┤   ╭───╯   ╰╮   ╭─╯   ╰──╮╭╯     ╰─╮
  8.67 ┤ ╭─╯        ╰───╯        ╰╯         ╰──╮
  4.33 ┤╭╯                                     ╰─╮
  0.00 ┼╯                                        ╰
       └────────────────────────────────────────────
        0        20        40        60        80
```

**Axis labels right-aligned in a fixed gutter, `┤` at each tick, `┼` at the origin** — the
convention every library converged on, and it is worth taking because a reader already knows it.

### The same series in braille, at `wide` — denser, no joins

```
 26.00 ┤                            ⢀⣴⠋⢧
 21.67 ┤       ⢠⡆                  ⢠⡾  ⠈⢧
 17.33 ┤      ⢠⠏⠹⡄     ⢀⡴⠛⢦    ⢠⠎    ⠸⡄
 13.00 ┤  ⢀⡴⠋   ⠘⣄  ⢀⡤⠞    ⠙⢦⡴⠋      ⠘⢦
  8.67 ┤⢠⠞        ⠙⠶⠋         ⠈⠳⣄
  4.33 ┤⡞                          ⠙⠲⢤
  0.00 ⡞                                ⠉
```

**Twice the horizontal resolution and no corners.** For a 500-point loss curve this is the
better picture; for the eight-point chart above it is noise.

### Multi-series, and the 1-bit answer

```
truecolour, overlaid           1-bit, stacked strips (C12 §5)

 1.0 ┤  ╭─╮   ╭╮                loss  1.0 ┤╭╮
 0.5 ┤ ╭╯ ╰─╮╭╯╰╮                     0.0 ┼╯╰──────
 0.0 ┼─╯    ╰╯  ╰──              val   1.0 ┤ ╭──╮
     two curves, two tones             0.0 ┼─╯  ╰──
                                       shared x-axis, no overlay
```

### Box plot — no raster, one row per series

```
run-a   ├───[▬▬▬|▬▬▬]────┤    ▪
run-b     ├──[▬▬|▬]──┤
run-c   ├─────[▬▬▬▬|▬▬▬▬▬]──────┤  ▪  ▪
        └────────────────────────────────
        0.02        0.06        0.10   loss
```

`[` `]` the quartiles, `|` the median, `├─┤` the whiskers, `▪` the outliers. **Every glyph
narrow except the whisker ends, which want `├┤` under `narrow` and `|` under `wide`.**

### Bar, with the four layouts

```
grouped                     stacked                    normalized

lr=1e-3 ▮▮▮▮▮▮▮▮ 8.2       ep1 ▮▮▮▮▰▰▰▰░░░ 11         ep1 ▮▮▮▮▰▰▰▰░░░ 100%
        ▰▰▰▰▰ 5.1          ep2 ▮▮▮▮▮▮▰▰░░ 10          ep2 ▮▮▮▮▮▮▰▰░░ 100%
lr=3e-4 ▮▮▮▮▮ 5.4          ep3 ▮▮▮▮▮▮▮▮▰░ 10          ep3 ▮▮▮▮▮▮▮▮▰░ 100%
        ▰▰▰ 3.2
```

**Values printed at the end of the bar** — YouPlot and termgraph both do this and it is right:
**a bar shows shape and the number shows value**, and a reader wants both.

### Histogram — horizontal, which reads better in a terminal

```
 0.00 – 0.02 ▮▮▮ 12
 0.02 – 0.04 ▮▮▮▮▮▮▮▮▮▮▮ 47
 0.04 – 0.06 ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮ 71
 0.06 – 0.08 ▮▮▮▮▮▮▮▮ 33
 0.08 – 0.10 ▮▮ 9
```

**Horizontal, because bin labels are text and text runs horizontally.** A vertical histogram
puts its labels on their side or elides them, which is why every terminal library that draws one
well draws it flat.

### Heatmap — a grid of cells IS a terminal

```
        a    b    c    d              1-bit, braille density
    a  ███  ▓▓▓  ░░░  ░░░                 a  ⣿⣿  ⠿⠿  ⠆⠆  ⠄⠄
    b  ▓▓▓  ███  ▒▒▒  ░░░                 b  ⠿⠿  ⣿⣿  ⠶⠶  ⠆⠆
    c  ░░░  ▒▒▒  ███  ▓▓▓                 c  ⠄⠄  ⠶⠶  ⣿⣿  ⠿⠿
    d  ░░░  ░░░  ▓▓▓  ███                 d  ⠄⠄  ⠆⠆  ⠿⠿  ⣿⣿
       viridis, three cells per value      ⠀⠄⠆⠖⠶⠷⠿⣿ — eight levels, all narrow
```

**Three cells per value** because one is too thin to read a colour from — plotille's own
choice, and it is why a heatmap wants width rather than height.

### Sparkline in a table cell — one sample per cell, no axis

```
NAME       CPU     LAST 30s
api        4.2%    ▁▂▁▃▅▃▂▁▂▄▆▄▃▂▁▂▃▂▁▁
worker    12.8%    ▃▅▇█▇▅▃▂▃▅▇█▇▆▄▃▂▁▂▃
db         0.9%    ▁▁▁▁▂▁▁▁▁▁▁▂▁▁▁▁▁▁▁▁
```

**And this is the one with a shipped defect** — the ramp is `▁▂▃▄▅▆▇█` and every glyph is
ambiguous, so **this table's columns stop aligning under `wide`.** It is the tier's most
urgent consumer.

---

## Three more, and each contributes something the others do not

### `granite` (Haskell) — one API, two backends

**83 stars, MIT, and it depends only on `base` and `text`** — a deliberate zero-dependency
posture that matches this project's own.

**Covers the full set**: scatter, histogram, stacked bar, pie, **box plot**, line, heatmap.
More types than anything else surveyed.

**Its idea worth stealing is architectural: it renders to a terminal AND to SVG from one call.**

```
scatter [series "A" pts] defPlot { widthChars = 68, heightChars = 22, plotTitle = "…" }
```

**Which is the roadmap's own image path arriving from another direction.** `imageProtocol` is
detected and unread; the note says *the high-fidelity path is free once images land* about
Mermaid. **Granite shows the same API can serve both for plots** — braille or box drawing at
`imageProtocol: "none"`, an actual rendered chart where kitty placeholders exist.

**And its config record is the second independent vote for a shared shape.** `defPlot` carries
`widthChars`, `heightChars`, `plotTitle`, `legendPos`, `xFormatter`, `xNumTicks`, `yNumTicks`
— **one record for every chart type**, exactly as plotille's `Figure` does. **Two libraries
converging on it is the signal.**

**`bins 30 155 195` is a value, not three arguments** — a bin specification you can pass
around, which is the right shape for a histogram whose binning rule is a choice.

### `termdash` (Go) — the widget-per-chart engineering

**Google-adjacent, tcell-based, and the ancestry is instructive**: `blessed-contrib` (JS) →
`termui` (Go) → `termdash`, each a rewrite for readability and testability.

**Its sparkline has sub-cell height** — the same eighth-block trick, and the same ambiguous
width problem nobody in the lineage has noticed.

**And its widget set is a superset of a chart library's**: gauge, donut, segment display,
button, text input. **That is a dashboard framework rather than a plotter**, which is the
category Calcium is actually in — worth reading for how it separates a widget from its
container, not for how it draws.

### `gnuplot`'s `dumb` terminal — the oldest one, and still the reference

**Forty years of tick selection, axis labelling and nice-number rounding**, and every terminal
plotter since has reimplemented some of it badly.

**Take the algorithms, not the output.** *Nice numbers* — choosing 0, 25, 50, 75, 100 over 0,
23.4, 46.8 — is a solved problem with a published rule, and **`textual-plot` names it as
`plotext`'s specific weakness**: *the tick placement isn't as nice since it simply divides the
range into a fixed number of intervals.*

**That is the detail that separates a chart that looks professional from one that looks
generated**, and it is twenty lines.

---

## What the survey settles

**Nothing to depend on**, and the reasons are now three deep: the domain is small, the
capability ladder is the framework's, and **every candidate assumes narrow ambiguous width
without declaring it.**

**But four things to take, all content:**

```
the shared config record       granite's defPlot · plotille's Figure — two independent votes
nice-number tick selection     gnuplot's, and plotext's known weakness
the four bar layouts           simple-ascii-chart's vocabulary
absent_value_symbol            ratatui's — A MISSING SAMPLE IS NOT A ZERO
```

**And one architectural idea**: granite's dual backend is the roadmap's image path, and it
means **a plot block could render as braille, as box drawing, or as an actual image** — one
declaration, three renderings, chosen by capability. That is the ladder this framework already
has, extended one rung further than anything surveyed goes.

---

## More types, and three are designed for exactly the terminal's constraint

### The ones built for limited vertical space — which is the whole problem

**`horizon chart` — twenty metrics in twenty rows.** A time series compressed by **folding its
bands**: split the range into N bands, stack them on top of each other, and colour by depth. **A
series that would need twelve rows fits in two, and stays readable.**

```
cpu     ▁▂▃▅▇█▇▅▃▂▁▂▄▆█▆▄▂▁     one row, colour = which band
mem     ▃▄▄▅▅▅▆▆▆▇▇▇▇▇█████
net     ▁▁▂▁▁▁▃▅▂▁▁▁▂▄▂▁▁▁▁
disk    ▁▁▁▁▁▁▁▂▁▁▁▁▁▁▁▁▁▁▁
```

**It was invented for dense dashboards on limited displays** — which is a terminal exactly, and
`sys-tui` is its consumer. **Nothing in the survey has one.**

### The correction — the colour axis was charged for and never delivered

**The entry above is right and the thing built from it is missing both of its channels.** This
text says *split the range into N bands, stack them, and colour by depth*, and the sketch says
`colour = which band`. What shipped carries depth on `ladderFor("density")` — a **glyph** ramp —
and `DEFAULT_COLORMAP.horizon` is `null`. `horizon.ts`'s own header states the price in the same
breath as the benefit: *that is what buys the compression … paid for in a colour axis the reader
has to learn.* **The price is charged and the goods never arrive.**

**And the second channel is spent paying for the first.** Within-band height is
`max(1, round(within × h))` — whole rows — so at `height: 1`, the canonical horizon and the one
this entry advertises, every inked column is exactly one row and the position inside the band is
gone. `docs/catalogue/horizon-folded-1x3-24bit.plain` is that frame: one row, and the only
variation in it is the glyph. The sketch above is `▁▂▃▅▇█` — **vertical eighths**, which is the
ladder that channel needs and which depth is currently occupying.

**Two channels, one alphabet, and the fix is to stop sharing it.** Reversed in C12 §3z: depth is
**colour** and height is **eighths**. Below `CONTINUOUS_FLOOR = 8` there is no colour and the
design is back to one channel for two data — which is a frame-read question and is ruled there,
not here.

**What is not corrected**: *nothing in the survey has one* still holds, and so does the reason
this form is the one to notice. The survey was right about which chart to build and about what it
is for; the implementation took the compression and left the axis that pays for it.

**`flame graph` — nested horizontal bars, and it is a real tool.** Stack depth is the y-axis,
time is the width, and **it is bars all the way down** — no raster, no curves.

```
main ████████████████████████████████████████████
 ├ train ██████████████████████████████
 │  ├ forward ████████████████
 │  │  └ attention ██████████
 │  └ backward ████████████
 └ eval ████████
```

**Two consumers already**: profiling a training run, and a monitor's call-stack view. And
`icicle` is the same chart inverted, so it is one implementation.

**`treemap` — and `ncdu` proves it works.** Nested rectangles of characters, sized by value.
**Disk usage is its consumer** and it is the one case where a 2D area chart beats a bar list.

### The ones that are cheaper than what they replace

**`dumbbell` / `range` — `●────────○`.** Two points and a line. **Before and after, min and max,
a confidence interval.** Terminal-native, one row per series, and **it answers a box plot's
question at a third of the glyphs** when the distribution does not matter.

```
run-a   ●──────────○     0.082 → 0.041
run-b   ●────○           0.061 → 0.048
run-c   ●───────────────○  0.094 → 0.022
```

**`dot plot` (Cleveland) — one mark per category on a shared axis.** Cheaper than a bar and
**easier to read**, because a bar's length is a comparison the eye has to make against a
baseline and a dot's position is not.

**`lollipop` — `────────●`.** A bar with an endpoint marker, and it reads better than a bar at
low value density where a solid run of `▮` is too heavy.

**`waffle` — the pie chart that works.** A 10×10 grid of squares, one per percent.
**Categorical proportion without a circle**, and `◼◻` is exactly the pair already ruled for the
todo checkbox.

### The ones that are variants of what exists

```
density (KDE)        a line over an estimated density — and violin and ridgeline
                     SHARE THE KDE, so one estimator serves three types
ECDF                 a step plot of the cumulative fraction — free once step exists
slope / bump         two columns, a line between. Ranking change across two points
confidence band      the area between two lines — what a learning curve wants,
                     and stacked area's mechanism with a different fill rule
2D density           a cell IS a bin, so a hexbin IS A HEATMAP. Same block,
                     different input — worth naming so it is not built twice
autocorrelation      a bar chart with a confidence band drawn over it
timeline / events    marks on a time axis — │  ▪   ▪▪  ▪    ▪ │ — cheap, and a
                     log viewer's summary row
funnel               a bar chart with decreasing widths and a stage label
```

### And one that is a layout rather than a type

**`small multiples` / faceting — a grid of the same chart across a dimension.** Per-layer
attention, per-class metrics, per-core CPU.

**It is `b.group` with a shared scale**, and **the shared scale is the only new part**: every
facet must use the same axis or the grid lies. **That is one ruling and no renderer.**

**And `pair plot` is small multiples of scatter**, so it costs nothing extra once faceting
exists.

---

## What this does to the order

**The cheap ones move up**, because they are folds over machinery that already exists or is
about to:

```
free or nearly       scatter · step · ECDF · density · dot plot · lollipop · dumbbell
one new fold         box plot · waffle · timeline · confidence band · slope
the heatmap's        2D density · calendar · correlation · confusion · spectrogram
bars all the way     flame graph · icicle · funnel · gantt · waterfall
a shared scale       small multiples · pair plot
a real estimator     violin · ridgeline — both want the KDE density already needs
designed for this    HORIZON — and sys-tui is its consumer
circle work          PIE · radar — rough, and built anyway
still refused        —                    (contour was here — reversed; 3D LEFT 2026-09-03 — F435
                                          retracted it and `plot3d` is built; sankey LEFT 2026-09-04,
                                          built over `graphLayers` as C12 §3ap. The row is empty)
```

**`horizon` is the one to notice.** It is the only chart type on any of these lists that was
**designed for the constraint a terminal has** rather than adapted to it — and it is the
answer to *twenty metrics and forty rows*, which is the monitor's actual problem.


---

## Pie, kept — and the roughness is a rendering problem with a known fix

**The roadmap refused it as *circle approximation, looks rough*. Overruled, and the reason it
looked rough is fixable.**

### Why it stair-steps, and it is not the circle's fault

**A terminal cell is roughly twice as tall as it is wide.** So a circle plotted on the cell
grid comes out an ellipse, and correcting it by halving the vertical resolution is **where the
roughness comes from** — the arcs are being drawn at half the detail the grid can carry.

**Braille fixes the aspect ratio for free.** A cell is 2 dots wide and 4 tall, so **the dot grid
is 2:1 in the same direction the cell is** — the two distortions cancel, and a circle plotted in
dot space is round in cell space with no correction at all.

```
cell grid     1 wide × 2 tall visually    → correcting costs half the resolution
braille dots  2 wide × 4 tall             → the ratio already matches. Nothing to correct
```

**That is why plotting a pie in braille is both rounder and higher resolution than plotting one
in blocks**, and it is the same reason the line renderer chose braille.

### The three tiers, which are the ones everything else uses

```
narrow      box drawing arcs ╭╮╰╯ where the segment is large enough to have a corner
braille     the default — 2×4 dots, aspect-correct, and the smoothest available
ascii       a waffle grid, because a circle in ASCII is genuinely not worth having
```

**At `ascii` it degrades to the waffle** — which is not a lesser pie, it is **the same question
answered with area instead of angle**, and a reader can count it.

### The drawing

```
        ╭───────╮              alpha   35%  ████
      ╭─╯ ▓▓▓▓▓ ╰─╮            beta    25%  ▓▓▓▓
     ╱ ▓▓▓▓▓▓▓▓▓▓ ╲            gamma   20%  ▒▒▒▒
    │ ▓▓▓▓▓█████ ░░│           delta   20%  ░░░░
    │ ▓▓▓███████ ░░│
     ╲ ▒▒███████ ░╱
      ╰─╮ ▒▒▒▒▒ ╭─╯            legend right, values printed
        ╰───────╯              — the convention every library shares
```

### Three things it needs, and two are already ruled

**Segment fill is the categorical palette** — §"a third axis". A pie is *n distinct things with
no order*, which is exactly what the qualitative palette exists for, **and the eight-colour cap
is a real constraint here**: a pie with nine slices is a pie nobody can read anyway, so the cap
is a feature.

**And at 1-bit there is no fill**, so the segments need boundaries — `╱ ╲ │ ─` radial dividers,
with the label doing the work. **That is F34's rule and it decides the minimum useful size**: a
segment too small to hold a boundary and a label is a segment that must merge into *other*.

**The one genuinely new ruling: a minimum segment.** Below some fraction a slice is fewer than
one dot wide at the rim, and **drawing it is a lie**. So slices below the threshold collapse
into `other`, **and the threshold is a function of the radius**, which is a function of the
region — meaning it changes on resize. **That is the first plot whose *data* changes with width**,
and it wants stating rather than discovering.

### And `radar` comes with it

**Same circle machinery, same aspect fix, same tiers.** Axes are spokes, a series is a closed
polygon. **It is the pie's arc renderer with lines instead of fills**, so it costs a fold rather
than a component — and it is the natural chart for a multi-metric comparison where a parallel
coordinates plot is too dense.

---

## The last few — and one of them is not a type at all

### `forest plot` — the best genuine omission

**An estimate with its uncertainty, one row per thing compared.**

```
baseline      ├────●────┤         0.412  [0.38, 0.44]
+ dropout       ├───●───┤         0.438  [0.41, 0.46]
+ augment    ├──────●──────┤      0.451  [0.40, 0.50]
+ both          ├──●──┤           0.467  [0.45, 0.48]
                     ╎
             0.35   0.45   0.55
```

**It is the dumbbell with a centre mark**, so it costs almost nothing — and it is **the standard
way to compare results with uncertainty**, which is what an ablation table is trying and failing
to be. **A number with an interval beside it says something a number alone cannot**, and a
column of numbers hides exactly what this shows: *these two overlap, that one does not.*

**Prism's consumer is obvious** — ablations, benchmark comparisons, seed variance. **And it is
the one chart on this list that changes what a reader concludes**, rather than showing the same
conclusion faster.

### `bubble` — scatter with a size ramp, and the ramp is already narrow

```
· ▪ ◼ ⬤     four sizes, all narrow, all measured
```

**Size as a fourth dimension on a scatter**, and the ramp exists: `·`→`⬤` is the dot family
already checked for the todo and the bar styles. **Four bins is enough** — a terminal cannot
carry more and a reader cannot read more.

### `streamgraph` — stacked area with a centred baseline

**One rule change.** Stacked area puts the baseline at zero; a streamgraph centres it so the
band flows. **The same fold, a different origin**, and it reads better for composition-over-time
where no single series is the reference.

### `utilisation grid` — and `sys-tui` wants it now

```
cpu   ◼◼◻◻ ◼◻◻◻ ◼◼◼◻ ◻◻◻◻      16 cores, four levels each
disk  ◼◼◼◼ ◼◼◻◻                 two disks
```

**A waffle and a heatmap's child** — one cell per unit, shaded by load. **htop's per-core strip
is this**, and it is the densest possible view of *how busy is everything*.

---

## And the observation: annotations are one feature, not six chart types

**Six named charts on every dataviz list are the same chart plus a line.**

```
Q-Q plot            scatter + a diagonal reference
residual plot       scatter + a zero line
calibration plot    scatter + a diagonal
Bland–Altman        scatter + a mean line and two limit lines
ROC curve           line + a diagonal
survival / K-M      step + censoring marks
```

**None of them is a renderer.** They are **a scatter or a line that can carry reference
lines**, and naming them as types would build the same thing six times.

### So the feature is annotations, and it is cross-cutting

```
reference line      horizontal, vertical or diagonal, with an optional label
threshold band      a shaded range — a target zone, a confidence limit
point marker        a single called-out sample, with a label
region              a highlighted x-range — an incident window, an epoch boundary
event mark          a tick on the axis with a label — a deploy, a restart
```

**Every plot type takes them**, which is why it belongs to the block rather than to a renderer —
**and it is the same argument as segmentation being orthogonal to bar style.**

**Three of the five have consumers already named**: a threshold band is `sys-tui`'s alert level,
an event mark is a deploy on a metric chart, and a reference line is the diagonal every ML
curve wants.

**And at 1-bit an annotation must not be a colour.** A reference line is `╌╌╌` or `┈`; a band is
a boundary pair rather than a fill; a marker is a glyph. **F34 again, and it is why annotations
are cheap in a terminal** — they were always going to be lines and marks.

---

## Where the list actually ends

**Everything remaining is either a fold over what is planned, or refused for a reason already
given:**

```
folds        OHLC (candlestick's glyph) · depth chart (mirrored cumulative step) ·
             percentile band (confidence band, three lines) · bump (slope, many points) ·
             latency heatmap (a heatmap, and worth NAMING because it is the standard
             way to show a distribution over time) · pair plot (small multiples of scatter)

refused      sankey · arc · chord · 3D — all edge routing or circles-with-edges,
             and the roadmap's Mermaid ruling covers the reason: layout is the expense
             ← CORRECTED 2026-09-03: 3D is built (`plot3d`, F435); the Mermaid ruling was
               reversed 2026-08-15 and the `graph` form ships a layered router, so
               *layout is the expense* no longer refuses anything — sankey, arc and chord
               are simply absent, each waiting on a consumer
             ← sankey's consumer arrived (C04 I92) and it is built, 2026-09-04 (C12 §3ap)
             (contour was in this group and did not belong to it — see the correction)
```

**`latency heatmap` is the one worth naming despite being a heatmap** — time on x, latency
bucket on y, count as colour. **It is how a monitor shows what a p99 hides**, and a reader who
knows the pattern will look for it by name.

---

## Field plots — and they are not the matrix heatmap

**Two things share a rendering and differ in what a cell means:**

```
MATRIX     one cell IS one value        correlation · confusion · attention
FIELD      one cell is MANY values      spectrogram · 2D density · latency over time
```

**In a field, there are far more samples than cells**, so **every cell is an aggregate** — and
*which* aggregate is a decision the reader cannot see and must be told.

```
mean     the average sample in this cell     — smooths, hides spikes
max      the largest                         — finds spikes, exaggerates them
count    how many landed here                — density, ignores magnitude
sum      the total                           — biased by sample rate
```

**A field plot that does not name its aggregation is lying by omission**, because the same data
under `mean` and under `max` are different pictures and both look authoritative. **It goes in
the axis furniture, not in a doc comment.**

### The family

```
spectrogram        time × frequency × magnitude — the canonical one
2D density         x × y × count — a scatter with too many points, and a HEXBIN IS THIS
latency heatmap    time × bucket × count — how a monitor shows what a p99 hides
waterfall          a spectrum over time, scrolling — RF's name for a spectrogram
persistence        many traces overlaid, density showing what recurs
relief             a field with shading for height rather than colour
```

**And `image` is the degenerate case** — one sample per cell, no aggregation, which is why the
image block and the field plot are the same renderer with different inputs.

### The finding: braille density and cell colour are independent channels

**A braille cell carries two things at once**: which of eight dots are lit — **a shape, 8 bits**
— and the cell's foreground colour — **a value, up to 24 bits.** They do not compete.

**So a field plot can carry two dimensions per cell:**

```
dots     the sub-cell STRUCTURE — which parts of this cell exceeded the threshold
colour   the cell's MAGNITUDE — its mean, or its max
```

**Nothing in the survey does this.** `plotille` draws heatmaps with *background* colours, one
value per cell; braille plots are drawn separately, monochrome. **Combining them is more
information per cell than either alone**, and it is free — the two channels are already there.

**And it degrades in the right order**: at 1-bit the colour goes and the dots remain, so the
structure survives and the magnitude does not. **That is the honest loss** — a field's shape is
what a reader is looking for.

### Which means a fourth colour axis, and it has three kinds

**The categorical palette answers *n distinct things*. A field needs *a value on a scale*, which
is a different question:**

```
Tone           judgement       ok · warn · error
change axis    a change        added · removed · modified
categorical    distinctness    n classes, no order                     §"a third axis"
CONTINUOUS     magnitude       a value mapped along a ramp             ← this
```

**And continuous is three kinds, not one** — which is the mistake every naïve implementation
makes:

```
sequential   low → high            viridis · magma       a spectrogram, a density
diverging    low ← MID → high      blue-white-red        a correlation, a residual,
                                                          anything with a meaningful zero
cyclic       wraps at both ends    twilight              phase, angle, time of day
```

**Using a sequential map for diverging data hides the sign**, which is the single most common
chart defect in the wild — **a correlation matrix in viridis makes −0.9 and +0.1 look adjacent.**

**So the map is a property of the data, not a style**, and a block declaring *diverging* with no
midpoint is a construction error in the same way a `resolve(key)` with no choices is.

### The tiers, which follow the ladder

```
24-bit · 8-bit   the colormap as a lookup table, quantised at 8
4-bit            SIX levels at most, and the curated indices — distinctness, not fidelity
1-bit            THE BRAILLE DENSITY RAMP: ⠀ ⠄ ⠆ ⠖ ⠶ ⠷ ⠿ ⣿ — eight levels, all narrow
```

**The 1-bit rung is the one the roadmap got wrong** — it planned `░▒▓█`, three of which are
ambiguous. **The braille ramp is eight levels against four and every one is narrow**, and here
it is not a fallback: **for a field it is the same channel the dots already use**, so the
degradation is *drop the colour* rather than *change the renderer*.

---

## Interaction — and it is not hover, it is a readout cursor

**C02's rule decides the shape**: *every mouse affordance has a keyboard equivalent.* So hover
cannot be the primary interaction — **it is the pointer's way of setting a position the keyboard
can also set.**

```
CROSSHAIR    a position in data space — moved by ← →, or set by the pointer
READOUT      the value of every series at that position
HIGHLIGHT    the series under it, emphasised; the others receding
```

**That is how gnuplot's interactive mode works and how `ratatui`'s zoomable line chart works**,
and it is better than hover because it survives with no mouse at all.

### The readout goes in the legend, which costs no new layer

**The legend becomes live**: series names with their value at the current crosshair.

```
              ╭─╮      ╭╮
             ╭╯ ╰─╮  ╭─╯╰──╮        ┊
            ╭╯    ╰──╯     ╰───     ┊
            └──────────────────────────────
                              epoch 7 ┊

              ● train  0.041      ← at the crosshair, not at the end
              ○ val    0.067
```

**A tooltip would need a popup**, which is the layer with five consumers already — **and a
tooltip that follows a pointer has no keyboard equivalent**, so it fails C02's rule on its own.

### Highlight needs a non-colour carrier

**At 1-bit *emphasise one and dim the rest* is nothing.** So the highlight is:

```
24 · 8 · 4-bit    the highlighted series in `default`, the others in `muted`
1-bit             the OTHERS drop density — braille at half the dots — or the
                  highlighted one gains a marker at each vertex
```

**Which is the marker idea for the fourth time** — plotille's `marker:`, ratatui's symbol sets,
termplot's `--line-style`, and now this. **Four independent arrivals is past this project's
threshold**, and it is the same mechanism C12 §5's stacked-strip ruling should be re-tested
against.

### The cost, and it is the render chain's

**`?1003h` — any-event tracking — sends an event per cell of motion.** That is a very high
event rate, and each one that moves the crosshair invalidates a frame.

**The render chain makes it affordable and did not exist when this would last have been
considered**: output diffing writes only changed rows, the render cache keys on
`(entry, rev, width, focus, theme)`, and `cells()` has an ASCII fast path. **A crosshair move
redraws one plot's rows and nothing else.**

**But the cache key does not have the crosshair in it** — which is `focus`'s story a third time,
and **the day a crosshair moves is the day a stale plot renders.** Add it with the feature, not
after.

---

## Axes — and the gutter has a circular dependency

**This is what separates a chart that looks professional from one that looks generated**, and
`textual-plot` names it as `plotext`'s specific weakness: *the tick placement isn't as nice
since it simply divides the range into a fixed number of intervals.*

### Nice numbers, which is a solved problem

```
BAD    0.00  23.40  46.80  70.20  93.60
GOOD   0     25     50     75     100
```

**Heckbert's *nice numbers* is about twenty lines** — round the interval to 1, 2, 2.5, 5 or 10
times a power of ten, then snap the bounds outward. **Wilkinson's extended algorithm is better
and larger**, scoring candidate tick sets on simplicity, coverage, density and legibility.

**Take Heckbert's. Its output is right often enough** and the difference only shows on awkward
ranges.

### Tick density is a function of space, and labels collide with themselves

**More ticks on a wide plot, fewer on a narrow one** — and **never so many that adjacent labels
touch.** `4.33` at every row is `plotext`'s look; `0 · 25 · 50 · 75 · 100` at five is the
target.

**The rule: a tick is dropped if its label would abut its neighbour's**, which makes tick count
a *result* rather than a setting — and the setting is a maximum.

### Label formatting, and the consistency rule is the one everyone misses

```
BAD    0.1   0.15   0.2   0.25   0.3        ← precision varies, so the column ragged
GOOD   0.10  0.15   0.20  0.25   0.30       ← one precision for the whole axis
```

**Precision is chosen once for the axis, from the smallest gap between ticks**, and every label
uses it. **SI prefixes for magnitude** — `1.2k`, `3.4M` — chosen once for the axis, not per
label, or the eye compares numbers in different units.

### ★ The gutter's circular dependency

**The y-axis labels are a column, and its width is the longest label.**

```
label width  depends on  the tick VALUES
tick values  depend on   the tick COUNT
tick count   depends on  the plot HEIGHT and WIDTH
plot width   depends on  the GUTTER WIDTH
```

**A cycle.** And it is the same shape as the scrollbar's reserve-or-reflow problem, which was
ruled: **reserve always, fill conditionally.**

**Three answers, and the third is the one to take:**

```
iterate         compute, measure, recompute — converges in two passes usually,
                and "usually" is not a measurement rule can rest on
fixed gutter    reserve N cells always — simple, and wrong for both 0–1 and 0–1000000
TWO-PASS        pick ticks against the FULL width, format them, THEN subtract the
                gutter and re-pick ONLY IF the count would change
```

**The third is bounded at two passes by construction** and it is the one that composes with
`measure(block, width) → height`, which cannot afford an unbounded loop.

**And the x-axis has the same problem sideways** — the first and last labels overhang the plot's
edges, so the plot is narrower than the region by half a label at each end. **Every library gets
this slightly wrong and it shows at the corners.**

### Time axes are a different algorithm, not a different format

**Nice *times* are not nice numbers.** `:00 · :15 · :30 · :45`, or midnight, or Monday — and
**the label format depends on the span**:

```
seconds     14:23:01     minutes   14:23      hours   14:00
days        Mon 3        months    Mar        years   2026
```

**A time axis that ticks every 23.4 seconds is the same defect as one that ticks at 23.4**, and
it is more visible because a reader knows what a clock looks like.

### And a log axis picks differently again

`1 · 10 · 100 · 1000`, or `1 · 2 · 5 · 10 · 20 · 50` for a denser one. **Not nice numbers,
decade boundaries** — and a log axis with linear ticks is unreadable rather than merely ugly.

### Titles, labels and units, and where they go when there is no room

```
title          one row above, and it is the FIRST thing dropped at small heights
y-axis label   rotated is impossible, so it goes above the gutter or into the title
units          in the axis label, not repeated per tick — `loss (×10⁻³)`, not `0.001`
legend         right, bottom, or inline — granite's `legendPos`, and it is the SECOND
               thing dropped
```

**The drop order matters and should be stated**: at eight rows a plot has the curve, the axis
and nothing else. **A title that survives while the axis is dropped is the wrong priority**, and
that is a ruling rather than a layout accident.


---

## The planning pass, first instalment — three types with their consumers measured

**This discharges part of the first bullet in the header, and only part.** Three types were
named by an outside measurement rather than by this survey: they are what
`simple-ascii-chart` offers that C12 cannot draw, found while vetting it as a dependency and
refusing it on fit (`DEPENDENCIES.md`). Three of ~40, checked against the tree rather than
reasoned about — which is the difference between a consumer and a plausible consumer.

**The tree draws exactly one plot today.** `examples/docker/src/container.ts` — a CPU line per
container, from a ring, `yMin: 0` and no ceiling. That is the whole of the shipped plot
population, and every claim below is measured against it and against the surfaces around it.

### 1 · A categorical bar chart on axes — a consumer that is already served

*N entities, one magnitude each, on a shared axis.* The consumer is real and named:
per-container memory in `resources.ts`, image sizes in a `docker images` surface.

**But it is drawn today, and not as a gap.** `Cell.spark` puts a sparkline inside a table cell,
rendered in two places (`table/cells.ts:114`, `table/detail.ts:96`), so *compare N entities* is a
table with a magnitude column — numbers a reader can read plus a shape they can scan. **So this
is a design question, not a missing capability**, and the planning pass owes the comparison
rather than the build: a bar per category on a shared axis against a column of numbers with a
spark beside it. **The dependency vetting called it a form the tree cannot draw, and that was
true about `plot` and misleading about the tree** — which is the compression class, caught here
rather than after something was built on it.

### 2 · The heatmap — a real consumer, and the blocker is a vocabulary change C12 already routed around

*Entity × time, or entity × entity.* The consumer is the multi-container ring: `history.ts`
accumulates a value per tick because `b.live` re-renders from the latest fetch alone, and one
container's CPU across ticks is one row of a matrix that has as many rows as there are
containers.

**And the blocker is already documented, in the entry that worked around it.** `Series.values`
is `readonly number[]` **with no gap value**, so a tick that produced nothing cannot be drawn —
S3_WALK A2 ruled the sample dropped and the gap *counted* (`58 samples · 63 ticks`) precisely
because the three alternatives all lie. A heatmap cannot take that route: an absent cell in a
matrix is a position, not a sample that can be omitted, and every library that models one gives
it a null (`HeatmapValue = string | number | null`).

> **Corrected 2026-08-16 by C12 §6a's walk, and this entry was wrong in both halves.**
>
> **The consumer does not exist.** `createRing` has exactly one call site —
> `examples/docker/src/container.ts:288`, inside `containerView(id)`, one container — and the
> surface that sees every container keeps nothing between ticks. The matrix has one row and no
> mechanism for a second. Making it real is a *dashboard* change (per-container rings keyed by
> id), not a C12 one, and that is now the heatmap's first blocker rather than the type.
>
> **The blocker below is right and its reason is not.** `Series.values` carries absence in
> memory perfectly well: `finiteSamples` keeps a non-finite value's index and the line breaks
> across it. What it cannot do is carry it in a *document* — C04 I46 refuses a non-finite
> element, and `JSON.stringify` writes `NaN` as `null` — so the nullable ordinate is owed for a
> serialisation reason, not for want of a gap value. Two documents said the first thing, one
> commit said the opposite, and the validator settled it.
>
> Left in place rather than rewritten, because the entry's conclusion survived and its argument
> did not, and that distinction is the point.

**So the heatmap is not a renderer bolted onto C12 — it needs a nullable ordinate**, which is a
published-type change and therefore freeze-relevant, and which the plot has already paid for
once in a workaround. That is the strongest argument in this section and it came from reading
the consumer rather than the chart.

### 3 · The candlestick — no consumer, and this is what F21's shape looks like from inside

*OHLC over time.* **Nothing in the tree, in the S-series, or in this survey's named surfaces
produces open/high/low/close.** The library offers it; that is a fact about the library.

It is already where it belongs in the order above — *later, each with a real consumer first* —
and it stays there. **Recording it as measured rather than assumed is the point**: a type
proposed by a survey and a type proposed by a rejected dependency look identical on a list, and
the second arrived with an implementation, which is exactly the pressure that turns *no consumer*
into *cheap enough to add*.

### What this leaves owed

Thirty-odd types, the shared config record, the annotation feature, `ambiguousWidth` and the
categorical palette. **The header's other four bullets are untouched.** One of the three above
turned out to be served, one turned out to need a public type, and one has no consumer — which
is a useful ratio to carry into the rest: **a third of a sample of three survived contact with
the tree.**
