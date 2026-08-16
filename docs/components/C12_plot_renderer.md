# C12 — Plot renderer

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L1 presentation |
| **Depends on** | C04 (`Plot`, `Measure`) · C09 (registers into its registry; `cells()`) · C10 (`resolveTone`) |
| **Consumed by** | C09's registry · table cells carrying `spark` · every surface showing a metric |
| **Source** | A01 D37 · A01 Appendix A.2 · A02 §2 |
| **Status** | Draft |

---

## 1. Purpose

C12 draws numbers. Two forms, sharing a scaling core:

**Line plots** — a braille grid with axes, for a training loss curve or a request-rate history. Braille gives 2×4 dots per cell, so a 56×8 plot has 112×32 addressable points, which is enough resolution for a curve to read as a curve.

**Sparklines** — one row, no axes, inline. In a table cell beside a metric, or under a rule.

Like C11, it registers into C09's registry through the public mechanism rather than being privileged. The braille rasterisation and Bresenham line-drawing are ported from the existing mockup, which is a working implementation rather than a sketch (A01 Appendix A.2).

The property that makes plots easy relative to every other block: **measured height is declared, not derived.** A plot's height comes from the block, never from its data, so there is no path by which a surprising series produces a surprising number of rows.

---

## 2. Public interface

`Plot` and `Series` are declared in **C04** with every other block variant; C12 declares no block shapes of its own.

```typescript
const plotDefinition: BlockDefinition<Plot>;   // registered into C09

/** One row of ramp glyphs. For C11's `Cell.spark` — see below. */
function sparkline(
  values: readonly (number | null)[],   // `null` is a gap (C04 I46a)
  width: number,
  caps: Pick<TerminalCapabilities, "unicode">,
): string;
```

Internal to C12: the raster grid, the Bresenham walker, the scaling and downsampling functions. None is a block shape.

### `sparkline` exists for C11's cell case

`Cell.spark` puts a series inside a table cell (C04 §3), and a cell is not a block — so C11 cannot reach it through the registry, and rendering it as a `plot` would drag block dispatch into a cell. The export is therefore **a pure function**: values and a width in, one row of glyphs out. Same layer, acyclic, no registry, no `ctx`.

C12's own `form: "sparkline"` renderer calls the same internal, so there is one rasteriser and `b.spark(…)` produces the block form of exactly what a cell shows. Recorded here so nobody later reads this as public surface with no consumer and deletes it (CLAUDE.md: an export nothing consumes is removed — this one has a named consumer, and the consumer is C11).

**It takes capabilities**, because the ramp differs between Unicode and ASCII (§6) and a renderer must never probe for its own (C09 I3). C11 has them on `ctx` and passes them through; nothing here reads an environment.

The return is exactly `width` cells and exactly one row (I13), so a cell containing one is the same height as a cell without — which is what makes C11's column planning indifferent to it (§10, and C12 T4.4 asserts it from this side).

**It windows to the last `width` points, and 8 is not a constant.** A01 A.2 says "the last 8 points", which is the instance where `width` is 8 — the width C11's `spark` column declares as its minimum. A column can be planned wider when residual is distributed, so the function must be correct at any width, and 8 is a floor rather than an assumption. T1.13 covers 1, 8 and 80.

**It normalises over the window it shows.** A cell has no block, so there is nothing to pin a range with; the block form's `yMin`/`yMax` reach the shared internal instead. That is why the public signature has three parameters and not four — a pinned range on a function whose only caller cannot supply one is an argument nobody passes.

### Height

```
sparkline                    → 1
line, axes: false            → height
line, axes: true             → height + 2      (axis rule, then x-labels)
heatmap                      → height + 2      (x-labels, then the scale legend)
```

**A heatmap's two rows are not the line's two rows**, and the substitution is deliberate: a
matrix's cells bound themselves, so there is nothing for a rule to delimit, and the row it would
have taken pays for the legend instead. The legend is not optional furniture — it is the only
thing that says what a cell *means*, which is why `axes: false` on a heatmap is refused rather
than honoured (§6a A4).

With `axes: false` there is no y-label column and the plot area is the full `width`. With axes it is `width − yLabelWidth − 2`, where 2 covers a space and the `│`.

Exact and data-independent. An empty series occupies its declared height with a centred empty message rather than collapsing — a plot that changes height when data arrives would shift everything below it mid-stream.

**`form: "line"` requires `height`, and omitting it is a construction error** (C04 §3). There is deliberately no default. `height` is optional on the type only because `sparkline` does not take one, and C04's constructor enforces the pairing rather than substituting a number. A defaulted height is the one way this component's central property — height declared, never derived — fails silently: the plot renders, nothing errors, and it is the wrong size on a surface nobody thought about.

Width is `ctx.width`. For an axed line plot the plot area is `width − yLabelWidth − 2`, where `yLabelWidth` is the widest formatted y-label and 2 covers a space and the `│`.

**Two cells, not three, and the data sits flush against the axis.** An earlier version of this section declared three — a space, the `│`, and a space — and S04 §3 and S11 §2 both drew two. The figures are right: a gap between the axis and the plot area is a habit from charts with margins, and in a terminal it renders as a leftmost sample floating off its own axis. One figure disagreeing with the text is a slip; two figures drawn independently and agreeing with each other is the text being wrong (`docs/surfaces/HEIGHT_AUDIT.md`, the fifth verdict).

---

## 3. Rasterisation

**Braille.** Each cell is a 2×4 dot matrix mapped to `U+2800 + mask`, with the standard bit assignment — dots 1,2,3,7 in the left column and 4,5,6,8 in the right. Points are plotted into a boolean grid of `width×2` by `height×4`, then folded into characters.

**The coupling between samples and cells is fixed by the glyph.** Braille gives 2 dot columns per cell and 4 dot rows, so an axed plot of `w` cells has `w×2` addressable columns; the ASCII ramp (§6) gives 1 column per cell and 8 subrows. Sample count and width are therefore coupled in one direction only: more samples than dot columns are downsampled, fewer are spread across the full width. **A sparkline is not braille** — it is one ramp glyph per sample at one sample per cell, so eight samples need eight cells and no more resolution is available. That sentence is stated because its absence is what let a five-sample sparkline be drawn inside a twelve-cell table cell three separate times (`HEIGHT_AUDIT.md`).

**Lines.** Successive points are joined with Bresenham. Without it, a series that moves faster than one dot-column per sample renders as disconnected specks rather than a curve.

**Scaling.** `yMin`/`yMax` over all series unless the block pins them. Values map linearly to dot rows, inverted so larger is higher.

**`yFormat` names the unit in, not the unit out** (C04 I41, F31). `fraction` takes `0.84` and
`percent` takes `100.2`; both render a per-cent sign, which is why naming them by the rendered
form gave one member two plausible meanings. `fraction` is the old `percent` renamed — same
arithmetic, different name — because the arm that multiplies by 100 is the surprising one and a
CLI-wrapping consumer holds `100.2`.

**It is geometry and not appearance**, which is easy to miss because a format looks like
styling: §3's gutter is measured with `labelWidth` over the *rendered* labels, so an arm that
changes a label's width changes the plot area. The rename moves both arms' widths for a caller
who does not update, and that is the visible half of a breaking change taken deliberately
before the freeze.

**Axes.** Up to three y-labels — max, midpoint, min — formatted per `yFormat`, right-aligned in the label column, placed at the max, mid and min row indices of the plot area. **They collapse when the height cannot hold three**: at `height: 2` the max and the min, at `height: 1` the max alone. The midpoint goes first because the extremes bound the data and the midpoint is interpolation between them. Without this clause the section contradicted T3.2, which renders `height: 1` with axes.

The x-axis is a rule under the plot area; x-labels sit at left, centre and right of it.

### Downsampling and Bresenham compose — four values per dot column

I5 wants per-column minima and maxima so a spike survives; I14 wants successive points joined so a curve reads as a curve. **Each is correct alone and they do not compose**: keeping only a column's min and max discards the order within it, so there is nothing left to join, and two adjacent columns whose spans do not overlap render as two disconnected bars.

So a column keeps **four** values, not two:

```
per dot column   fill the vertical span [min, max]          → I5, the spike survives
between columns  Bresenham from column i's `last`
                 to column i+1's `first`                    → I14, the curve connects
```

With at most one sample per column `first = min = max = last`, and the algorithm degenerates to plain Bresenham between points. That degeneration is what makes this right rather than a compromise: fifty points and fifty thousand take one code path, and there is no density branch to get wrong at the boundary.

Recorded as a composition clause on both invariants rather than as a change to either, because neither was wrong — and see A03 §2 for what that says about the audit that did not find it.

---

## 3a. The heatmap

**One cell per position per row, magnitude in the ramp glyph, one range across the whole
matrix.** Everything in this section is §6a's walk, implemented; the walk carries the arguments
and this carries the shape.

```
              ⡀⣀⣄⣤⣦⣶⣷⣿⣷⣶⣤⣄⡀⣀⣄⣤
api           ⣤⣦⣶⣷⣿⣷⣶⣤⣄⡀?????⡀⣀
worker        ⡀⡀⡀⣀⣄⣤⣦⣶⣷⣿⣷⣶⣤⣄⡀⣀
db            ????????????????
              -60 ticks         now
              ⡀⣀⣄⣤⣦⣶⣷⣿  0 – 100%
```

**The row order is the app's and the renderer never sorts** (§6a B1). A matrix whose rows
reorder between frames is unreadable even though every frame is individually correct, and the
renderer has no stable key to sort by that the app does not already have.

**Columns are positions and the window is of the last `areaWidth` of them** (§6a B3, I13's rule).
A heatmap never spreads: one cell *is* one value, so spreading would draw a value twice — a lie
about density — or interpolate, which is inventing readings. Dropped columns are named in the
legend rather than vanishing.

**Rows that do not fit take I8's answer unchanged**: the rows that fit, and the last row of the
plot area spent on `+N more · names`. That is the same branch `stackedRows` already has, and the
truncation marker *is* that line — there is no field.

**No colour, at any depth.** Magnitude is the glyph, so D29 is satisfied by construction rather
than by a fallback, and the 1-bit rung is not a degradation. That is also why C04 I50a's
eight-series cap does not bind here: the categorical palette is never consulted (§6a A7).

---

## 4. Degenerate series

Every one of these is real, and each has a defined result rather than an exception.

| Input | Result |
|---|---|
| Empty series | Declared height, centred empty message |
| Single point | A dot at vertical centre |
| All values equal | Flat line at vertical centre; y-labels all show that value. **No division by zero** |
| `NaN`, `±Infinity` present | Never scaled, **position kept**: the line breaks across the gap, the sparkline draws `?` there (I4) |
| All values non-finite | Treated as empty |
| Fewer points than dot-columns | Points spread across the full width; the line is drawn between them |
| More points than dot-columns | Downsampled by min/max per column, so spikes survive rather than being averaged away |

### Absence is a value, and it already had a representation

**`Series.values` carries absence today and has since C12 shipped** — a non-finite entry is a gap, `finiteSamples`
keeps its index, and I4 rules what the line does with it. That sentence was worth measuring because the opposite
was written down in three places: `examples/docker/src/history.ts`'s ring comment says *`Series.values` is
`readonly number[]` and has no gap value, so a tick that produced nothing cannot be drawn*, and a roadmap entry
and a planning note repeated it. **The ring's whole design — drop the sample and count it — is a workaround for a limitation the type
does not have.** (Its caption reads `63 ticks · 2s each · 1 returned nothing`; `58 samples · 63 ticks` is
the ring comment's paraphrase of its own intent, and quoting that as the rendered text would be the same
compression this section is about — caught one paragraph after writing it.)

What there was is a defect: the two forms of one block kind disagreed about the same array.

**This section also concluded that no public-type change was owed, and §6a measured that and found otherwise.**
The sentence above is right about memory and wrong about a *document*: C04 I46 refuses a non-finite element, and
`JSON.stringify` writes `NaN` as `null`, so the spelling this section rules on is one no valid document may hold.
`null` is the gap a document carries — see §6a, which is where the correction and its measurement live rather than
here, because it was the heatmap's validator arm that turned it up.

```
values  [1, 2, 3, NaN, 7, 8, 9]

line       ⣀⠤⠤⠒⠒⠉        a break — the row at the gap is empty
        ⠐⠊⠉
                          ← this row is blank, and that IS the gap
           ⢀⡠⠄
        ⣀⡠⠤⠔⠒⠉⠁

sparkline, before   `      ▁▂▃▆▇█`   six glyphs — the gap closed and the row SHORTENED
sparkline, after    `     ▁▂▃?▆▇█`   seven positions, one of them with no reading
```

**Why a marker rather than a blank.** The row is right-anchored, so a leading blank already means *fewer samples
than cells* — and a blank at the gap would mean *a sample that is missing*. One character, two meanings, in the
case that is not rare: a stalled fetch is bursty, so a gap at the window's left edge is ordinary rather than
exotic. `ratatui`'s `absent_value_symbol` is the same finding reached from the other side, and its sentence is
the one to keep: **a missing sample is not a zero.**

**Why `?` and why it is ASCII in every ramp.** The marker must be one cell under *both* width conventions and
must not collide with any step of any ramp — `▁▂▃▄▅▆▇█`, `.:-=+*#@`, and the braille ramp `rampFor` returns at
`ambiguousWidth: "wide"`. The obvious characters are not available: `·` `∅` `⋮` `◌` are all
`East_Asian_Width=Ambiguous`, and `text.ts`'s ambiguous table deliberately covers only *the part that is drawn as
geometry* — so `cells()` reports them as one cell at `wide` by a documented ruling, and picking one would either
be wrong on a CJK terminal or force a range the table's own test excludes. **ASCII is unambiguous by
construction**, and absence has no tier because it is not a magnitude: the marker is the same character whatever
ramp is in use, which is also what makes a `spark` column read the same on both terminals.

Downsampling by min/max rather than by sampling is the one worth naming: a loss curve with a spike is *about* the spike, and taking every nth point loses it exactly when it matters.

---

## 5. Multiple series and 1-bit

Series are distinguished by tone. At `colourDepth: 1` there is no tone, and D29 forbids carrying information by colour alone.

**So at 1-bit, a multi-series line plot renders as stacked strips** — one sub-plot per series, sharing the x-axis. Overlaying two braille curves with no colour produces a picture that cannot be read, and inventing dash patterns inside a 2×4 dot cell does not work either.

The arithmetic has to be exact, because the total must not change:

```
base      = floor(height / n)
remainder = height − base·n           → given to the first strip
strip i   = base + (i === 0 ? remainder : 0)
Σ strips  = height                    exactly
```

**Series labels consume no plot rows.** Each label is written into the y-label column beside its strip, not above it. A label occupying a row would make the total exceed `height`, which is the trap this rule exists to avoid.

**And they replace the max/mid/min labels rather than sharing the column with them.** There is one label column and a strip is 2 rows deep at `height: 8, n: 4`, so there is no room for both, and a reader of a stacked plot needs to know which series a strip is before knowing its bounds. Single-series plots keep §3's three labels.

When `n > height` there are not enough rows to give each series one. The plot then renders the **first series plus a legend line naming the omitted ones**, still within `height`, and sets a truncation marker. Silently dropping series would be worse than saying so.

Single-series plots are unaffected. Sparklines are single-series by construction.

---

## 6. ASCII fallback

Under `unicode: "ascii"`, braille is unavailable.

| Form | Unicode | ASCII |
|---|---|---|
| Line plot | Braille, 2×4 subcells | Column ramp `.:-=+*#@`, 1×8 subcells |
| Sparkline | `▁▂▃▄▅▆▇█` | `.:-=+*#@` |
| Axis rule | `└─│` | `+-\|` |

**And a third arm, which is a width convention rather than a repertoire.** Under
`ambiguousWidth: "wide"` the block ramp is two cells per glyph — C11 draws a sparkline into a
table cell, so what breaks is every column after it — and the replacement is the braille density
ramp `⡀⣀⣄⣤⣦⣶⣷⣿`, narrow under both conventions. **It fills from the bottom and its lowest step
is one dot rather than none** (I16): the set it replaced began at `U+2800`, which draws as
whitespace and is what the row's padding already means.

**The cell grid is identical** — same width, same height, same measured rows (C09 §4, 1:1 by cell count). Only vertical resolution changes, from 4 subrows to 8 via the ramp, and horizontal from 2 dots per cell to 1. The plot gets blockier; nothing moves.

---

## 6a. The heatmap walk — the type, the table and the trace, before any code

A matrix has **state and structure**, so it takes both artefacts. A sequence trace finds the
interactions an event mediates; a classification table finds the ones that hold at rest with no
event between them. Taking the trace alone because a polling ring looks like a state machine is
how the structural half goes unexamined — which is C19's measured failure and the reason the
artefact's shape is a decision rather than a consequence.

**Both premises the walk was handed failed measurement, and in opposite directions.** Neither
failure was findable from the chart; both came from reading the consumer and the validator.

### The named consumer does not exist

`CALCIUM_PLOT_PRIOR_ART.md`'s instalment names it: *the multi-container ring — `history.ts`
accumulates a value per tick, and one container's CPU across ticks is one row of a matrix that
has as many rows as there are containers.* At HEAD:

| | measured |
|---|---|
| `createRing` call sites | **one** — `examples/docker/src/container.ts:288` |
| what it is scoped to | `containerView(id)`, a single container, built inside the call |
| what the dashboard keeps between ticks | **nothing** — its `render` reads the tick's snapshot alone |

So the matrix has **one row and no mechanism for a second**. `history.ts` is per-container by
construction, and the surface that sees every container is the one that keeps no history — which
is gap 1 restated, unfilled, on the other surface.

**This does not sink the heatmap; it re-orders the work.** What it removes is the ranking
argument: the instalment placed the heatmap first on *a real consumer* plus *a freeze-relevant
blocker*, and the consumer is proposed rather than existing. **A named consumer is an argument
only if it can take the thing** — F161's shape, reached from the other side, and the third time
the record has been checked against the tree and lost.

### And the blocker is real after all, for a reason nobody had stated

The previous commit ruled that `Series.values` already carries absence: `finiteSamples` keeps a
non-finite value's index, the line breaks across it, and the sparkline draws `?`. That is true
**in memory** and it is not true of a *document*, which is what the type actually is:

```
b.plot({ series: [{ values: [1, 2, NaN, 4] }] })   constructs — the constructor checks height and yFormat

validateDocument(…)   blocks[0] (plot): series[0].values[2] is number —
                      a numeric array holds finite numbers (C04 I46)

JSON.stringify(…)     {"values":[1,2,null,4]}     the gap is already `null` on the wire, and
                                                   `null` is not a member of `readonly number[]`
```

**C04 I46 refuses the value C12 I4 uses to mean absence**, and it is right to: `JSON.stringify`
writes `NaN` as `null`, so a persisted gap reloads as a value the type says cannot be there.
Both invariants are correct and their overlap is that **absence is expressible in the type and
inexpressible in a valid, round-trippable document.**

Three passes over one claim, and each was wrong in a different place:

| | claim | verdict |
|---|---|---|
| the ring comment, the roadmap, the instalment | *the type has no gap value* | false — `NaN` renders correctly |
| the previous commit | *the type carries absence, so the freeze argument dissolves* | false at the document boundary |
| this walk | absence is representable in memory and **not in a document**; `null` is the only spelling JSON carries | measured |

**So the nullable ordinate is owed, and for the reason the instalment did not give.** The
remedy is one member: `readonly (number | null)[]`, with `null` the gap and `NaN`/`Infinity`
still refused, because `null` survives a round trip and they do not. **Every consumer already
agrees** — `Number.isFinite(null)` is `false`, so `finiteSamples`, `seriesRange` and
`sparkline`'s filter treat it exactly as they treat `NaN` today, and the widening costs them
nothing.

**It also names a live defect neither document had stated**: the ring pushes `NaN` as of the
previous commit, so `examples/docker` builds a document `validateDocument` refuses. It renders,
because a constructed block never reaches the validator (C04 §3's standing reason, arriving as a
consequence).

### The row that decides the type

**`form: "heatmap"` on `Plot`, with rows as `Series`** — not a block kind of its own. Measured
rather than preferred:

| what a matrix needs | what already exists |
|---|---|
| one range shared across rows — *the only thing that makes it a matrix and not a stack* | `seriesRange` computes over **every** series |
| a row label that costs no plot row | §5's ruling; `seriesLabelWidth` sizes the column from the row labels, and `gutterSpans` draws them |
| one strip per row | `stackedRows`, at strip height 1 |
| a magnitude glyph per cell | `rampFor` — eight steps, and correct under both width conventions |
| a declared height | `PlotGeometry` unchanged: `plotAreaRows` returns `height` and the row count is data |

And `Plot`'s other fields survive the move rather than becoming dead: `yMin`/`yMax` pin the
**colour** range, `yFormat` formats the legend, `xLabels` label the time axis.

**Three refusals rather than three ignored members**, which is C04's established idiom in this
exact type (`form: "line"` without `height` is a construction error, not a default):

- **`tone` on a heatmap row** — magnitude owns the cell, so a per-row tone is a second colour
  channel fighting the first. This is `Tone` being asked to carry a second axis, which is
  roadmap 51's finding; refusing is what stops it recurring.
- **`axes: false` on a heatmap** — see A4. The ramp legend is the only thing that says what a
  cell *means*, and a heatmap without one is unreadable rather than plain.
- **a ragged matrix** — see B2.

---

### 6a.1 — The classification table

Structural: two rules that both hold at rest. Every row is a cell where two correct statements
overlap; a row governed by one rule is a restatement of that rule and finds nothing.

| | the two rules that meet | what the cell is | ruling |
|---|---|---|---|
| **A1** | I4 — absence keeps its position and draws a marker · §6 — the ramp's step 0 is the lowest reading | a zero cell beside an absent cell | the marker is `?` as in the sparkline, **and the ramp's lowest step must be visible** — see below |
| **A2** | T3.3 — labels are dropped before the plot area is starved · a heatmap's row labels **are** its ordinate | a matrix narrower than its labels | the drop order **inverts**: columns go first (oldest), then labels are truncated, and an unlabelled matrix is never rendered |
| **A3** | §4 — an all-non-finite series is treated as empty · I4 — a gap is a position | one row of a matrix, entirely absent | *treated as empty* is a property of the **block**, not of a row. A stopped container's row is a full-width row of markers; the empty message appears only when every row is absent |
| **A4** | I3 — a constant range maps to the centre · a heatmap has no y-labels to say what the centre is | one value repeated across every cell | mid-step is right **and insufficient**: the block owes a **legend row** naming the range. Hence `axes: false` refused, and the legend is counted like an axis row — declared, data-independent, I1 safe |
| **A5** | I1 — height is declared, never derived · I8 — a series that cannot be given a row is named, never dropped | more rows than the declared height | I8's answer, unchanged: the rows that fit, plus a legend naming the rest. **The "truncation marker" is that legend row and not a field** — §5's prose says *sets a truncation marker*, and the mechanism is a `warn`-toned line in `stackedRows`. Checked because a ruling that names an operation must name one that exists |
| **A6** | §2 — the sparkline normalises over the window it shows · a matrix's cells must be comparable across rows | two rows of different magnitude | one range over the whole matrix. **This is the difference between a heatmap and N stacked sparklines**, and it is `seriesRange`'s existing behaviour rather than a new rule |
| **A7** | C04 I50a — at most eight series, because the categorical palette distinguishes eight · a heatmap carries **no** per-row colour | a matrix of nine containers | the cap is a rule about **colour** applied to the one form that has none, so it has no subject here and does not bind. **Recast onto the declared `form`, not onto a series count** — see below |

**A1's ruling found a shipped defect, and it is in neither form of the block.** `RAMP_BRAILLE`'s
first step is `U+2800`, BRAILLE PATTERN BLANK — so on a terminal declaring `ambiguousWidth:
"wide"`, **every sparkline draws its minimum as whitespace**:

```
sparkline([0, 5], 6, wide)   "    ⠀⣿"     20,20,20,20,2800,28ff
                                  └────── four pad cells and one lowest reading, indistinguishable
```

Which is precisely the collision §4 spends a paragraph refusing for the absent case — *one
character, two meanings* — arriving on the other arm, where a leading blank already means
*fewer samples than cells*. The measurement also shows the ramp's ink is non-monotone: its
populations are `0,1,2,3,4,5,6,8`, so the last step is a double jump. **The replacement fills
from the bottom and every step is visible** — `⡀⣀⣄⣤⣦⣶⣷⣿`, populations `1..8`, all narrow under
both conventions — which also reads like the block ramp it stands in for rather than like a blob.
It matters twice over for a heatmap, whose whole subject is magnitude carried by a glyph: an
idle row must not read as an absent one.

**A7's recast, because *the limit is about something else or it is nothing* is the question it
has to answer.** It is nothing — and the reason has to be *the palette is never consulted*
rather than *the picture survives*, because those two are not the same argument and only the
first generalises.

The tempting recast is *series count where a per-series colour is drawn*, and it is wrong in a
way worth recording: **it makes the cap depend on the colour depth, which construction cannot
see.** At `colourDepth: 1` a multi-series `line` plot stacks and distinguishes spatially, so by
that wording nine series would be legal on a monochrome terminal and refused on a colour one —
a document whose validity depends on the machine reading it. So `line` and `sparkline` keep the
cap **unconditionally**: a document that renders honestly at only one depth is not one this type
should accept.

The heatmap is exempt on a stronger footing. It carries magnitude in the ramp glyph at **every**
depth — the 1-bit rung is not a degradation, because the glyph was always the channel — so the
categorical palette is never read, and a rule about which colours are distinguishable has
nothing to say. **The cap moves from the series count to the declared `form`**, which is a
property a constructor can see and a reader can check.

**And the figure is the argument for bothering**: eight rows is not a matrix. The dashboard's
own ring set is uncapped by design, and a machine with nine containers is ordinary.

**The form switch is two-armed at four sites**, so a third member is absorbed in silence:

```
height.ts:45,51      form === "sparkline" ? 1 : …      a heatmap takes the line arm
definition.ts:371    form === "sparkline" ? … : …      a heatmap renders as a curve
construct.ts:88      form === "line" && height === undefined     a heatmap needs no height
validate.ts:277      form must be "line" or "sparkline"          — the only one that fails closed
```

Three of four **fail open**, which is the `Set<Glyph>` literal again: a vocabulary widened where
the consumer does not check exhaustively. The build makes the switch exhaustive, so the fourth
member is a type error rather than a wrong picture.

---

### 6a.2 — The sequence trace

Event-mediated: two rules that meet because something happened in between.

**B1 — a row arrives after the frame.** A container starts, so the matrix gains a row.
`plotHeight` reads `PlotGeometry` and cannot see `series`, so the height does not move — I1
holds by construction, and the new row takes a slot or falls into A5's legend. What the trace
adds is the half no invariant covers: **which** slot. Ruling — the renderer never sorts; row
order is the app's, because a matrix whose rows reorder between frames is unreadable even though
every frame is individually correct. That makes stable ordering the app's obligation, and the
docker dashboard's is named: key rows by container id, not by docker's output order, which walk
A3 already records as unstable across the two calls.

**B2 — the ring's window slides under a rendered matrix.** Rings for different containers have
different lengths: one started ten seconds ago has five samples, one running an hour has `cap`.
`columnsOf` places a sample at `round((i / span) * (width − 1))` using **that series' own**
`originalLength` — so a five-sample row is *stretched* across the full width and column `k`
means a different instant in every row. **A matrix whose columns do not share an ordinate is not
a matrix**, and nothing in the frame says so: it is arithmetically self-consistent and describes
a different document than the one it holds.

Ruling: **a ragged matrix is a construction error.** Padding is the alternative and the renderer
cannot take it — it does not know which end is old, and padding the wrong end is invisible. The
app pads, because the app knows.

**B3 — a resize changes the cells per value.** The line plot spreads its samples across whatever
width it gets; the sparkline windows to the last `width` (I13). A heatmap must window: one cell
*is* one value, so spreading would either draw a value twice — a lie about density — or
interpolate, which is inventing readings. Ruling: **window like a sparkline, never spread**, and
the dropped columns are named in the legend rather than vanishing (I8's principle, and the same
sentence as A5's). Uniform across rows, which is well defined only because B2 refused ragged
input — the two rulings compose, and neither is sufficient alone.

`capFor` is fixed at view open and cannot follow a resize (F24), so the app's window and the
block's disagree after one. That is the app's existing limitation and the block's window is the
one that decides the picture; recorded so it is not rediscovered as a heatmap defect.

---

### What the walk owes the golden set

**Golden has been unchanged by three consecutive behaviour changes** — the continuation mark, the
gapped series, the chip — and each time a frame had to be added deliberately. That is a corpus
property with a cause, measured rather than inferred:

```
test/golden/blocks.test.ts   frames Object.values(ONE_PER_KIND)
test/support/blocks.ts:24    ONE_PER_KIND: Readonly<Record<BlockKind, Block>>
```

**The corpus is exhaustive over kinds and holds exactly one state of each.** It answers *does
this kind render* and can answer nothing about *which state it is in* — so a new state of an
existing kind is invisible to it by construction, three times out of three. That is the
suite-indexed-by-inputs failure in the one instrument that exists to catch what assertions
cannot.

So the heatmap's golden frames are part of its build rather than a pass after it, and the walk
names them: **absent beside zero** (A1), **an all-absent row** (A3), **a constant matrix** with
its legend (A4), **more rows than height** (A5), **narrow, where labels survive and columns go**
(A2), and the three capability arms — ASCII, `ambiguousWidth: "wide"`, and `colourDepth: 1`,
which for this form is not a degradation at all because the glyph was always the channel.

### What lands now, and what lands with the build

**Now**, because each is a defect or a published type and neither waits on a renderer: the
nullable ordinate (`Series.values`, `Cell.spark`, C04 I46a, I4's wording), and the braille
ramp. **With the build**: the form member, the three refusals, the exhaustive switch, A7's
recast limit, and the golden set above.

---

## 7. Invariants

- **I1** — Measured height is a function of the block alone, never of the data.
- **I2** — Rasterisation is pure and total. No series input throws.
- **I3** — No division by zero on a constant or single-point series.
- **I4** — Non-finite values never reach the grid, and **their positions survive the filter, in both forms**. A gap is a position with no sample, so the line breaks across it and the sparkline draws its absent marker there — never a shorter row and never a closed gap. **A document spells a gap `null`** (C04 I46); `NaN` and `±Infinity` are refused at the boundary and still rendered as gaps here, because I2 says no series input throws and a fixture reaches the renderer without passing a validator. *The old wording was `filtered before scaling`, which is true of both forms and constrains only one: `finiteSamples` keeps the index and `sparkline` did not, so the sparkline satisfied the invariant exactly while spanning the gap the line broke across.*
- **I5** — Downsampling preserves per-column minima and maxima. *Composition (§3): a column also keeps its first and last sample, because preserving only the extremes leaves I14 nothing to join.*
- **I6** — At `colourDepth: 1`, multi-series plots stack; series are never distinguished by colour alone.
- **I7** — Stacked strips sum to exactly `height`; series labels occupy the y-label column and consume no plot rows.
- **I8** — When series outnumber available rows, the plot renders the first series plus a legend and marks itself truncated. Series are never dropped silently.
- **I9** — The ASCII fallback occupies an identical cell grid to the Unicode form.
- **I10** — A plot never emits a character outside its measured region — `height` rows without axes, `height + 2` with, by `width` cells.
- **I11** — C12 owns no state; every render is a pure function of block, width and context.
- **I12** — C12 registers through C09's public `register`; it is not privileged.
- **I13** — Sparklines are exactly one row, at every width including 1, **and one cell per position rather than per sample**. A window of eight positions is eight cells whether or not every position has a reading.
- **I14** — Successive points are joined by Bresenham line-draw rather than plotted as isolated dots, so a curve reads as a curve at braille resolution. A scatter of points at 2×4 subcell density is indistinguishable from noise. *Composition (§3): under downsampling the join runs from a column's last sample to the next column's first, which is what keeps I5's span-fill connected.*
- **I15** — Y-labels are placed at the max, mid and min rows of the plot area and collapse from the middle outward when the height cannot hold three: two labels at `height: 2`, one at `height: 1`.
- **I16** — **Every step of every ramp is visible, and no ramp's lowest step is the character its padding uses.** Eight steps, monotone in ink. The braille arm shipped with `U+2800` — BRAILLE PATTERN BLANK — as step 0, so a sparkline at `ambiguousWidth: "wide"` drew its minimum as whitespace, which the right-anchor already uses to mean *fewer samples than cells*: one character, two meanings, in the arm nothing renders in a golden frame. *This is a property of the constant, not of a call, so it is asserted over the ramps themselves.*
- **I17** — **A heatmap draws one cell per position per row, against a range shared by the whole matrix, and carries no colour.** The shared range is what makes it a matrix rather than a stack of unrelated sparklines; the glyph is the channel at every colour depth, so nothing is distinguished by colour alone and the 1-bit rung is not a degradation. Rows are drawn in the order the block declares them and the renderer never sorts. *A ragged matrix is refused at construction (C04 I50b), because the renderer cannot know which end of a short row is old — and without that refusal `columnsOf` stretches it to the common width and column k means a different instant in every row.*

---

## 8. Commitments

1. Two forms — braille line plots with axes, and one-row sparklines — sharing a scaling core (I1).
2. Measured height is declared, never derived from data (I1).
3. An empty series occupies its declared height rather than collapsing (I1).
4. Points are joined with Bresenham, so a curve reads as a curve (I14).
5. Every degenerate series in §4 has a defined result and none throws (I2, I3, I4).
6. Downsampling is by per-column min/max, so spikes survive (I5).
7. At 1-bit, multi-series plots stack into strips summing exactly to `height`; labels live in the y-label column (I6, I7).
8. Series that cannot be given a row are named in a legend, never dropped silently (I8).
9. The ASCII fallback keeps the cell grid identical and only loses subcell resolution (I9).
10. C12 holds no state and registers through the public mechanism (I11, I12).
11. Braille rasterisation and Bresenham are ported from the mockup's working implementation (→ A01 A.2).
12. Y-labels are placed at the max, mid and min rows and collapse from the middle outward rather than overflowing a short plot (I15).
13. **Every ramp step is visible and no ramp's lowest step is its padding character**, so a minimum reading never renders as absence (I16, §6).
14. **A heatmap is one cell per position per row against one shared range, with magnitude in the glyph and no colour** (I17, §3a).

---

## 9. Tests

Six tiers. No state machine — C12 is pure over the block.

### Tier 1 — unit

- **T1.1** (I1): height for each form and axes combination — sparkline 1, line 8, axed line 10 — independent of series length, including empty.
- **T1.2**: braille encoding — each of the eight dot positions sets the documented bit; a full cell is `U+28FF`, an empty one `U+2800`.
- **T1.3**: a horizontal run of points produces a continuous row of identical cells.
- **T1.4**: a steep segment produces a connected line, not gaps — Bresenham exercised directly.
- **T1.5** (I3): a constant series → a flat centred line, y-labels all equal, no `NaN` in output.
- **T1.6** (I3): a single point → one dot at vertical centre.
- **T1.7**: an empty series → declared height, the empty message centred, no grid characters.
- **T1.8** (I4): a series containing `NaN` and `Infinity` → filtered; the line breaks across the gap rather than spanning it.
- **T1.9**: an all-non-finite series → treated as empty.
- **T1.10** (I5): 10,000 points into a 56-cell plot with one spike → the spike survives downsampling.
- **T1.11**: three points into a 56-cell plot → spread across the full width, joined.
- **T1.12**: y-labels formatted per `yFormat` — five cases, one per arm.
- **T1.12b** (C04 I41): `fraction` and `percent` on the **same value** produce different labels — `0.84` → `84%` and `1%`. The row a per-arm table cannot express: each arm alone is a restatement of its own rule, and the defect was that two arms meant one thing.
- **T1.12c** (C04 I41): the two arms produce different `labelWidth`s for one range, so the gutter differs. `yFormat` is geometry; a test that only reads the label text passes against a renderer that measures the wrong set.
- **T1.13** (I13): sparkline at widths 1, 8, 80 → exactly one row each; the series windows to fit.
- **T1.17** (I17): **a matrix and a stack of lines with the same data at the same width do not render identically.** The row worth writing first: if they match, the form member is not reaching the renderer, and nothing else about a heatmap distinguishes it from the arm it would otherwise fall into.
- **T1.18** (I17): the range is shared across rows — two rows of different magnitude draw different glyphs for the same value, and normalising per row would make every row look alike.
- **T1.19** (C04 I50b): the three refusals and the height, each with the converse — a heatmap that declares none of them constructs.
- **T1.15** (I16): every ramp — Unicode, ASCII, braille — has eight steps, each visible, monotone in ink, and **no step equal to the pad character**. Asserted over the constants, because the defect is a property of the set rather than of a call: `sparkline([0, 5], 6, wide)` measured 6 cells and drew its minimum as whitespace, so every width and length row passed against it.
- **T1.16** (I4, C04 I46): `null` is a gap in both forms — the line breaks across it and the sparkline marks it — and a series carrying `null` **round-trips through JSON unchanged**, which `NaN` does not. The row a fixture of `NaN` cannot express.
- **T1.14**: pinned `yMin`/`yMax` override the computed range, and out-of-range points clamp to the edge rather than escaping the grid.

### Tier 2 — contract / interface

- **T2.1** (I2): a fuzz corpus — empty, single, constant, non-finite, 100,000-point, negative, mixed-sign, denormal — rasterises without throwing, at every width from 1 to 200.
- **T2.2** (I1): the C09 generic measurement suite passes for `plot` at all seven widths.
- **T2.3** (I10): for every corpus entry, no output row exceeds `width` cells and no output exceeds the declared row count.
- **T2.4** (I9): for every corpus entry, Unicode and ASCII forms produce identical row and column counts.
- **T2.5** (I11): a source scan finds no mutable module state in `plot/`.
- **T2.6** (I12): `plot` is registered via `registry.register`; removing the call removes the kind.
- **T2.7** (I2): rasterisation called a hundred times on the same input returns identical output.

### Tier 3 — edge cases

- **T3.1**: `height: 0` → clamped to 1.
- **T3.2**: `height: 1` with axes → the plot area is 1 row, total 3; still renders.
- **T3.3**: width narrower than the y-label column → labels are dropped before the plot area is starved; the curve still renders.
- **T3.4**: width 1 → a single column of the ramp; no throw.
- **T3.5**: values spanning fifteen orders of magnitude → linear scaling still terminates; extremes clamp to the edges.
- **T3.6**: all values negative → range computed correctly; the flat-zero assumption does not appear.
- **T3.7**: values differing only in the last float digit → treated as constant rather than producing a noise-amplified curve.
- **T3.8**: `xLabels` longer than a third of the width → truncated, never overlapping each other.
- **T3.9**: a series arriving one point at a time across sixty renders → each render is correct in isolation; no accumulated state.
- **T3.10** (I6, I7): two series at `colourDepth: 1`, `height: 8` → strips of 4 and 4, summing to 8; labels appear in the y-label column and consume no plot rows.
- **T3.11** (I7): three series at `height: 8` → strips of 4, 2, 2 — the remainder goes to the first — summing to exactly 8.
- **T3.11b** (I8): ten series at `height: 4` → the first series plus a legend naming the other nine, total still 4 rows, truncation marked.
- **T3.11c** (I7): for n from 1 to 12 and height from 1 to 20, Σ strips equals height in every combination. The arithmetic is property-tested, not spot-checked.
- **T3.12**: a `spark` on a table cell narrower than the series → windows to the last N points, matching the mockup's behaviour.
- **T3.13**: a series of exactly `width × 2` points → one point per dot column, no downsampling, no interpolation.

### Tier 4 — integration

- **T4.1** (with C09): registration, measurement and rendering behave identically to a built-in kind under the generic suite.
- **T4.2** (with C09, C02): under `unicode: "ascii"`, measured heights and rendered row counts match the Unicode case exactly.
- **T4.3** (with C10): the same plot at 24-, 8-, 4- and 1-bit has identical geometry; only the 1-bit multi-series case changes form, and not its total height.
- **T4.4** (with C11): a sparkline inside a table cell contributes zero extra rows and does not affect column planning beyond its cell width.
- **T4.5** (with C14): a plot inside an expanded table row measures through `measureChild` and shifts subsequent blocks by exactly its height.
- **T4.6** (with C13): a streamed series growing by one point per patch → the plot re-renders at constant height; the viewport does not move.

### Tier 5 — e2e

- **T5.1**: golden frames — a loss curve, a request-rate history, a flat series, an empty series — at four widths, both themes, both unicode modes.
- **T5.2**: a real `--watch` on a training run for two minutes → the curve grows smoothly, height never changes, no flicker.
- **T5.3**: under `LANG=C` → the ASCII ramp renders, the curve remains legible, geometry is unchanged.
- **T5.4**: under `TERM=dumb` with two series → stacked strips, both readable without colour.

### Tier 6 — fail-on-revert

- **T6.1** (I1): deriving height from series length → T1.1 fails and streaming plots start shifting the viewport.
- **T6.2** (I3): dividing by the range without guarding a constant series → T1.5 fails with `NaN` output.
- **T6.3** (I4): letting `NaN` reach the grid → T1.8 fails.
- **T6.4** (I5): downsampling by every-nth-point → T1.10 fails, and spikes vanish exactly when they matter.
- **T6.5** (I6): overlaying multi-series at 1-bit → T3.10 fails, and the plot becomes unreadable without colour.
- **T6.11** (I7): giving each strip a label row → T3.11c fails, and every stacked plot grows beyond its measured height.
- **T6.12** (I8): dropping series that do not fit → T3.11b fails.
- **T6.6** (I9): an ASCII form of different cell dimensions → T2.4 fails.
- **T6.7** (I10): writing outside the declared region → T2.3 fails and the frame corrupts.
- **T6.8** (I13): a sparkline occupying two rows at some width → T1.13 fails, and every table row containing one shifts.
- **T6.9**: dropping Bresenham for point-plotting → T1.4 fails and steep curves become dotted.
- **T6.10** (I12): making `plot` a privileged built-in → T2.6 fails.
- **T6.15** (I17): dispatching `form` with a two-armed switch again → T1.17 fails, and a heatmap renders as a line, silently and correctly-shaped.
- **T6.13** (I16): restoring `U+2800` as the braille ramp's first step → T1.15 fails, and every wide-terminal sparkline draws its minimum as padding.
- **T6.14** (I4, C04 I46): narrowing `Series.values` back to `readonly number[]` → T1.16 fails, and a gap is expressible only as a value the validator refuses and JSON rewrites.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Where the numbers come from | C07 adapters, the S-series |
| Terminal image protocols for real charts | Phase 1B — C02 detects them, nothing uses them |
| Interactive plots — zoom, crosshair, hover | Phase 2 |
| Axis tick density beyond max/mid/min | Phase 1B |
| Tone → colour | C10 |
| Column planning around a sparkline cell | C11 |
