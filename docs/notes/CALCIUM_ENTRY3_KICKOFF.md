# Entry 3 — the plot system, planned as a system

**The heatmap is entry 3's and building it standalone was the mess.** Two of its rulings —
density-only against colour-and-density, and the drop order when labels do not fit — are family
decisions taken by one form. **This pass re-decides them for the family and the heatmap
conforms.**

**Plan before building. Report the plan; build after.** Six audits this session found more than
the fix that motivated them, and `CALCIUM_PLOT_PRIOR_ART.md`'s own header carries this
instruction.

---

## The thing to get right, and it is not the list

`CALCIUM_PLOT_PRIOR_ART.md` names ~40 types. **A kickoff that lists forty produces forty**, and
a chart with no consumer is F21's shape — which four entries this session were spent closing.

**Almost all forty are folds over five or six mechanisms.** The mechanisms are the system; the
forms are what falls out. **So the pass designs the mechanisms and then asks which forms a
consumer needs.**

```
the config record   one shape for every form
annotations         reference lines, bands, markers, regions, events
axes                nice numbers, density, precision, log, time, the gutter's cycle
encoding            which ramp encodes which axis — height · density · fill · position
data shape          gaps, aggregation, binning, degenerate ranges
composition         small multiples with a shared scale, dual axis, faceting
```

---

## 1 · The encoding rule, first — because it has already cost twice

**A ramp is not a lookup table. It encodes a value along an axis**, and the axes are different:

```
position   a dot drawn AT a coordinate         the unicode line — no ramp at all
height     how full the cell is, bottom-up     the sparkline — the cell IS a column
density    how much ink in the cell            the heatmap — a grid cell has no vertical axis
fill       how much of a RUN is covered        progress — the run is the axis
```

**Both defects this arc were a ramp inherited into a geometry it did not fit**: the heatmap took
the sparkline's height ramp, and before that `sparkline` took `line`'s *filtered before scaling*
and applied it to positions.

**Write the rule that would have caught both**, and make it checkable — a form declares which
axis it encodes, and a ramp declares which axis it is for. **A mismatch is a construction error,
not a review question.**

**Two states already measured**: the ASCII line uses `.:-=+*#@` — **density standing in for
height**, correct and unstated. And the ASCII heatmap uses the same set, **right by accident**,
because ASCII has only ink.

---

## 2 · Colour as a channel — and 51 must be reconciled

**Two entries currently disagree.** The categorical palette (51) says colour carries *n distinct
things*; the heatmap says *the glyph is the channel at every depth* and refuses colour. **Both
cannot be the family rule.**

**The survey's finding is that they do not compete**: a braille cell carries **which dots are lit
— 8 bits of shape** — and **its foreground colour — up to 24 bits.** Independent channels.

**Measure whether per-cell foreground is expressible in the plot renderer before ruling.** If it
is:

```
CATEGORICAL   which series this is        the palette, capped at eight — 51
CONTINUOUS    a value on a scale          sequential · diverging · cyclic — NOT BUILT
```

**And continuous is three kinds, not one.** Using a sequential map for diverging data hides the
sign — *a correlation matrix in viridis makes −0.9 and +0.1 look adjacent* — **so the map is a
property of the data and `diverging` with no midpoint is a construction error.**

**F34, not D29.** A distinction must not be carried by colour **alone**; density is the other
carrier, **which is what makes colour safe here rather than forbidden.**

---

## 3 · The shared config record

**Three libraries converged on it independently** — granite's `defPlot`, plotille's `Figure`,
termplot's `col/row` DSL. **One record for every form**, rather than an options bag per type.

```
height              declared, resolve-then-measure — 38's ruling, third instance
axes                on · off · which sides
title · caption
legend              position, or none
tick counts         a MAXIMUM, since density is a result
formatters          x and y, separately
range               explicit, or derived
```

**`Plot` already carries `form`, `series`, `height`, `axes`, `xLabels` and `yFormat`** — so the
question is what widens and what becomes a sibling. **`yFormat` is geometry, not styling**
(the type says so), which is the precedent for how to think about the rest.

---

## 4 · Annotations — six named types collapse into one feature

```
Q-Q · residual · calibration · Bland–Altman    a scatter + reference lines
ROC                                            a line + a diagonal
survival / Kaplan–Meier                        a step + censoring marks
```

**None is a renderer.** The feature is:

```
reference line   horizontal · vertical · diagonal, with a label
threshold band   a shaded range — an alert level, a confidence limit
point marker     one called-out sample, labelled
region           a highlighted x-range — an incident window, an epoch boundary
event mark       a tick on the axis with a label — a deploy, a restart
```

**Every form takes them**, so they belong to the block rather than to a renderer — **the same
argument as segmentation being orthogonal to bar style.**

**And at 1-bit an annotation must not be a colour**: a reference line is `╌╌╌`, a band is a
boundary pair rather than a fill, a marker is a glyph. **They were always going to be lines and
marks, which is why they are cheap here.**

---

## 5 · Axes — the half that separates professional from generated

**`textual-plot` names this as `plotext`'s specific weakness**: *the tick placement isn't as
nice since it simply divides the range into a fixed number of intervals.*

**Nice numbers.** `0 · 25 · 50 · 75 · 100`, not `0 · 23.4 · 46.8`. **Heckbert's is about twenty
lines** — round the interval to 1, 2, 2.5, 5 or 10 times a power of ten, snap the bounds
outward.

**Tick density is a result, not a setting.** A tick is dropped if its label would abut its
neighbour's — **so the setting is a maximum.**

**Precision once per axis**, from the smallest gap: `0.10 0.15 0.20`, never `0.1 0.15 0.2`. **SI
prefixes once per axis too**, or the eye compares numbers in different units.

**★ The gutter's circular dependency, and it is already half-solved in the tree.**

```
label width  ←  tick values  ←  tick count  ←  plot width  ←  gutter width
```

**`layoutFor` already handles a version of this** — three branches, monotone, `MIN_AREA` as the
floor. **Check whether that generalises or whether it is the two-pass answer in disguise**: pick
ticks against the full width, format them, subtract the gutter, re-pick **only if the count
would change.** Bounded at two passes by construction, which `measure(block, width) → height`
requires.

**Time axes are a different algorithm.** `:00 · :15 · :30`, or midnight, or Monday — and the
label format depends on the span. **A time axis ticking every 23.4 seconds is more visibly wrong
than a numeric one, because a reader knows what a clock looks like.**

**And a log axis picks differently again** — decade boundaries, or `1 2 5 10 20 50`. **Linear
ticks on a log axis are unreadable rather than merely ugly.**

---

## 6 · Data shape — four questions every form asks

**Gaps.** Settled: `null` is the spelling JSON carries, `Series.values` is
`readonly (number | null)[]`, the validator takes `null` and refuses `NaN`. **The window is of
positions, the range is over readings.**

**Aggregation, for fields.** A spectrogram or a 2D density has **more samples than cells**, so
every cell is an aggregate — `mean` smooths, `max` exaggerates, `count` ignores magnitude.
**A field plot that does not name its aggregation is lying by omission**, and it belongs in the
axis furniture rather than a doc comment.

**Binning, for histograms.** Sturges, Freedman–Diaconis, Scott. **Three formulas, and a
histogram that picks its bin count badly is one nobody trusts.**

**Degenerate ranges.** One value repeated across every cell; a range of zero; every value
absent. **C12 §4 has this for line and sparkline — every form needs its row.**

---

## 7 · Composition

**Small multiples is a layout, not a type** — `b.group` with **a shared scale, which is the only
new part.** Every facet must use the same axis or the grid lies. **One ruling, no renderer**, and
`pair plot` is small multiples of scatter.

**Dual axis** is the one to consider refusing: two ranges on one grid is the chart most often
used to imply a correlation that is not there.

---

## 8 · The forms — as folds, with a consumer named or not built

**Start from the tree's consumers, not the survey's list**: docker-tui, the ring, prism's
surfaces, `sys-tui`'s design, `agent-tui`'s design.

```
BUILT           line · sparkline · heatmap · progress

FREE            scatter          the raster IS a point renderer — `line` without interpolation
                step             one branch in the curve fold
                ECDF             a step of the cumulative fraction

ONE FOLD        bar              categorical, on axes — NOT the progress row
                histogram        bar + binning
                box plot         NO RASTER — a horizontal glyph sequence, one row per series
                dumbbell         two points and a line — a box plot's cheaper cousin
                forest           dumbbell + a centre mark. THE ONE THAT CHANGES CONCLUSIONS
                lollipop         bar + an endpoint marker
                dot plot         one mark per category on a shared axis
                waffle           the pie chart that works in a grid

THE HEATMAP'S   2D density · calendar · correlation · confusion · spectrogram ·
                latency heatmap — ALL ONE BLOCK with a different axis layout

BARS ALL DOWN   flame graph · icicle · funnel · gantt · waterfall

WANTS A SCALE   small multiples · pair plot

AN ESTIMATOR    density (KDE) · violin · ridgeline — ONE estimator, three forms

DESIGNED FOR    horizon — the only type on any list designed for limited vertical
THIS            space rather than adapted to it. `sys-tui` is its consumer

CIRCLE WORK     pie · radar — braille's 2:4 dot grid cancels the cell's aspect ratio,
                so a circle in dot space is round in cell space with NO correction.
                One ruling it needs: a MINIMUM SEGMENT, below which a slice is less
                than a dot wide and drawing it is a lie — and the threshold is a
                function of the radius, so THE DATA CHANGES ON RESIZE

REFUSED         contour · sankey · arc · chord · 3D — edge routing or circles-with-edges,
                and the Mermaid ruling covers the reason: layout is the expense
```

**Bar layouts are four rules, not four types**: `overlap · grouped · stacked · normalized`.

---

## 9 · Customisation, per form — the thinnest part of the design

**For each form the pass owes**: orientation, sorting, stacking, error bars, per-series markers,
legend placement, log scale, and **what it does when its data does not suit it.**

**Per-series markers have four independent arrivals** — plotille's `marker:`, ratatui's symbol
sets, termplot's `--line-style`, and the 1-bit highlight. **Past this project's threshold**, and
**C12 §5's stacked-strip ruling should be re-tested against them**: if a marker distinguishes
curves at 1-bit, stacking becomes an option rather than the only answer.

---

## 10 · Tying it to the ML package

**Entry 3 is tensors · heatmaps · plots · images**, and the plot family is most of it.

**The tensor half has no design at all** and is the part with none of this: shape, dtype, and
**how you render a 4×512×512 array in a terminal.** Name it as its own question — the answer is
probably *a header plus a heatmap of one slice*, and that is a ruling rather than an assumption.

**And the heatmap's named consumers are already in the tree**: attention, confusion,
correlation. **Those are one block with three axis layouts**, which is the argument for building
the layouts once rather than three kinds.

---

## What the pass reports

**A plan, not a build.** Mechanisms first with their rulings, then forms with a consumer named
per form, then an order by cost against `scale · axes · raster · height · ramp · strips`, which
already exist.

**And say which forms are NOT being built**, with the reason. A list of forty with a dozen
consumers is what this pass exists to prevent.

---

## Tests — designed as a system, not per form

**The same error applies here.** Forty forms with their own test suites produces forty files
that each re-derive the same checks. **Test the mechanisms once, test each form's fold once, and
test the system's properties across every form.**

---

### Tier 1 · The sweep — every form, same checks

**`ONE_PER_FORM` is the `ONE_PER_KIND` of plots.** A `Record<PlotForm, Plot>` holding one
representative per form, with the same equality arm — a form added to the union must appear in
the corpus or the file does not compile.

**Seven properties that hold for every form**, asserted over the sweep:

```
P1  measure is stable         measure(block, w) === measure(block, w) — no side effects
P2  measure is width-only     measure(block, w1) and measure(block, w2) differ only
                              by height, never by content (except pie — stated exception)
P3  height is declared        if the form declares height, measure returns it at every width
P4  render fits measure       rendered rows.length === measure(block, w) at every width
P5  render is pure            render(block, w, caps) === render(block, w, caps)
P6  validate round-trips      JSON.parse(JSON.stringify(block)) validates
P7  degenerate survives       every form with an empty series / zero range / all-null renders
                              without throwing
```

**P2's pie exception is the minimum-segment ruling** — below some fraction slices merge into
*other*, so the logical content changes with width. **State it in the sweep rather than
exempting it silently.**

**And P7 is the row that would have caught F178** — a denormal span making `drawLine`
non-terminating.

---

### Tier 2 · The encoding contract — per axis, not per form

**The encoding rule is a type guarantee and it has its own tests:**

```
E1  rampFor returns the declared axis    rampFor("density", caps).encodes === "density"
E2  the mismatch is unspellable          TS2322 from putting HEIGHT under the density key
E3  substitutes are declared             RAMP_ASCII.substitutes includes "height"
E4  SS51 holds                           no ramp constant imported outside ramp.ts
```

**E2 is a compile-time test**, not a runtime one — the mutation cannot be *written*. **Say so in
the suite rather than having a row that cannot fail.**

---

### Tier 3 · The config record — one suite, every field

**Each optional field on `Plot` has four checks:**

```
C1  absent is the default         b.plot({ form, series }) with no field set renders
C2  present changes the frame     with the field set, the rendered output differs
C3  invalid is refused            the validator rejects a bad value
C4  round-trips                   JSON.parse(JSON.stringify) preserves it
```

**`title`, `caption`, `legendPosition`, `xScale`, `yScale`, `xLabel`, `yLabel`,
`tickMax`, `range` — every one, four rows each.**

**And the geometry test is a row**: a field that changes the output's *height* is geometry; one
that changes only styling is not. **`yFormat` is geometry and is the precedent.**

---

### Tier 4 · Axes — nice numbers and the gutter

```
A1  nice numbers are nice        niceAxis(0, 100, 5) → [0, 25, 50, 75, 100]
A2  precision is uniform         every label on one axis has the same decimal places
A3  SI prefix is uniform         every label uses the same magnitude prefix
A4  density respects the max     tick count ≤ the declared maximum
A5  labels never abut            no two adjacent labels overlap by cells()
A6  the gutter is bounded        two passes, never three — measure must terminate
A7  log₁₀ ticks at decades      1 · 10 · 100 · 1000
A8  log₂ ticks at powers        1 · 2 · 4 · 8 · 16 · 32
A9  ln labels as decimals        1 · 2.72 · 7.39
A10 symlog has a linear centre   values near zero are spaced linearly
A11 time ticks at round times    :00 · :15 · :30 · :45, not :00 · :23 · :46
A12 time label format by span    seconds show HH:MM:SS, days show Mon 3
```

**A1 is the canonical test and it requires 2.5 in the set** — without it, `0 · 20 · 40 · 60 ·
80 · 100` is what you get, which is the defect Heckbert's own paper demonstrates.

---

### Tier 5 · Annotations — the block-level feature

```
N1  a reference line renders     at the declared value, across the full width
N2  a threshold band renders     between the two bounds, distinguishable from the curve
N3  a confidence band renders    between two series, filled
N4  annotations compose          two annotations on one plot, both visible
N5  annotations at 1-bit         lines are dashes or glyphs, bands are boundary pairs
N6  annotation and series        an annotation at the same value as a data point — both visible
```

---

### Tier 6 · Colour — categorical and continuous

```
L1  categorical: 8 slots         eight series, eight different colours
L2  categorical cap               ninth series refused at construction
L3  continuous sequential         low end and high end differ
L4  continuous diverging          below-mid and above-mid differ, AND the midpoint is visible
L5  diverging without midpoint    construction error
L6  colormap at 8-bit            quantised and still monotonic
L7  colormap at 4-bit            vacuous — stated, not tested
L8  colormap at 1-bit            colour is gone, density remains
L9  no palette present           F179's check — REQUIRED_SLOTS catches a missing family
```

**L4's midpoint visible is the row that would have caught *sequential-for-diverging*, which is
the single most common chart defect in the wild.**

---

### Tier 7 · Per-form — the fold's own tests

**Each form gets a file, and each file owes:**

```
F1  the form renders              at a representative size, the output is non-empty
F2  the form at minimum size      the smallest width × height that is not degenerate
F3  the form with one category    or one series, or one segment — the singular case
F4  the form with many            enough to trigger truncation / scrolling / the +N notice
F5  the form with absence         null values, and they are not rendered as zero
F6  absent vs zero                a frame showing both, distinguishable
F7  the form at ASCII             the degradation is readable
F8  the form at 1-bit             the degradation is readable and carries the distinction
F9  the form at wide              ambiguousWidth: "wide" — no cell doubles
F10 the form's own refusals       the validator catches every stated construction error
F11 annotations on this form      at least one, to prove the block-level feature reaches it
```

**Specific additions per form family:**

```
bar family
  F12  four layouts render differently    overlap · grouped · stacked · normalised
  F13  values printed at bar end          the number, not only the bar
  F14  long labels truncate               rather than overflowing the gutter

boxplot / forest / dumbbell
  F15  outliers outside the whiskers      ▪ marks, not part of the box
  F16  forest centre mark visible         ● distinguishable from the median
  F17  dumbbell direction                 start and end distinguishable

histogram
  F18  three binning rules differ         Sturges, Freedman-Diaconis, Scott on the same data
  F19  bin edges are nice numbers         the bins snap to round values

waffle
  F20  segment proportions correct        35% fills 35 cells of 100
  F21  small segments visible             a 1% segment is one cell, not rounded to zero

heatmap variants
  F22  calendar layout is 7 columns       days of week
  F23  correlation is symmetric           the diagonal reads as 1.0 (or max)
  F24  confusion allows non-square        4 predicted × 3 actual is valid
  F25  spectrogram x-axis is time         and the labels are round times

KDE forms
  F26  bimodal data shows two peaks       bandwidth selection does not smooth them into one
  F27  violin is mirrored                 symmetric about the category axis
  F28  ridgeline curves overlap           the offset produces overlap, not stacking

pie / radar
  F29  minimum segment merges to other    below the threshold, slice joins "other"
  F30  data changes on resize             a narrow pie merges more slices than a wide one
  F31  ASCII pie is a waffle              the fallback is correct
  F32  radar polygon closes               the last vertex connects to the first

horizon
  F33  bands fold correctly               a value in band 2 appears in the second colour
  F34  band count affects density         more bands = more detail, fewer rows

facets
  F35  shared scale across facets         the same value renders at the same position
  F36  pair plot is N×N scatter           diagonal is meaningful, off-diagonal is scatter
```

---

### Tier 8 · Scale types — per scale, across forms

```
S1   log₁₀ across bar + line + scatter     same values, same positions
S2   log₂ across heatmap + line             same values, same positions
S3   ln renders without error               labels are decimals, ticks at eⁿ
S4   symlog near zero                       values -0.01 and +0.01 are distinguishable
S5   symlog far from zero                   values 1000 and -1000 are logarithmically spaced
S6   log with zero in data                  handled — clamped, warned, or refused
S7   log with negative in data              handled — refused for log, symlog handles it
S8   scale on x only                        yScale: "linear", xScale: "log2" — they are
                                            independent
```

---

### Tier 9 · Interaction — the readout cursor

```
I1   cursor moves with ← →          position advances one sample
I2   cursor wraps at edges           or clamps — the ruling decides
I3   legend shows value at cursor    the number, for every visible series
I4   highlight dims the rest         at 24-bit: muted; at 1-bit: reduced density or markers
I5   cursor not in cache key yet     scrolling serves stale — add the crosshair position
I6   cursor on absent value          shows "—" or equivalent, not zero
I7   cursor on a heatmap cell        shows the cell's value and its row/column labels
```

---

### Tier 10 · The FigureBuilder chain

```
B1   .build() produces a valid Plot   validateDocument passes
B2   .build() is pure                 two calls, same output
B3   series and annotations are peers .line() then .threshold() — both in the block
B4   every form has a chain method    .scatter(), .bar(), .pie() etc — exhaustive
B5   the flat bag and the chain agree b.plot({...}) and b.figure().....build() produce the
                                      same block for the same input
B6   chain with no series             .build() refuses — a figure must have content
```

---

### Tier 11 · Mutation targets — the rows worth writing before the code

**Per group, the mutation that catches the form-specific defect:**

```
GROUP 1   scatter interpolating instead of dotting — the line's code path, unchanged
GROUP 2   a box plot's median outside the box — the quartile arithmetic
GROUP 3   a gantt bar starting at 0 instead of its offset
GROUP 4   correlation not using a diverging colormap — sequential-for-diverging
GROUP 5   KDE bandwidth smoothing two peaks into one — Silverman on bimodal data
GROUP 6   facets with independent scales — the shared-scale ruling violated
GROUP 7   pie drawing a sub-threshold slice instead of merging it
GROUP 8   horizon bands not folding — drawing twelve rows instead of two
```

**And two cross-cutting mutations that catch mechanism errors:**

```
M1   rampFor returning the wrong axis — unspellable by the type, so this is a COMPILE test
M2   an annotation drawn in colour at 1-bit — F34 violated
```

---

### Golden frames — one per form, at four variants

```
width × 2     (40, 80)
caps  × 2     (full 24-bit narrow, ASCII 1-bit wide)
```

**Four frames per form, and every frame read before it is committed.** A golden diff that moves
for a reason you cannot name is the finding — not a regeneration.

**And `STATES` gains an entry per form** with the one state that most matters: the degenerate
input. Every form's golden already covers the representative case; the degenerate is the one
nobody thinks to draw.
