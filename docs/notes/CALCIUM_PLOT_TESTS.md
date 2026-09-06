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
