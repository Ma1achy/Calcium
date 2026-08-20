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
line, axes: true             → height + 3      (the frame's lid, the axis rule, then x-labels)
heatmap                      → height + 2      (x-labels, then the scale legend)
pie, radar, horizon          → height          (their own composition; no cartesian furniture)
smallmultiples, pairplot     → height          (the facets carry their own furniture)
```

**The last two rows are a correction, and it was a live defect rather than a
tidy-up.** `radar` and `horizon` declared `axedFurniture` — a lid, a rule and an
x-label row — and drew none of the three; `smallmultiples` and `pairplot`
declared it *and* returned whatever the facet layout happened to produce. Swept
over every catalogue fixture at two widths and both `axes` flags, that is 18
combinations where the measured height and the rendered height disagree, by as
much as six rows. A block that measures thirteen and draws seven moves
everything below it in the transcript, which is the one failure C12 I1 exists to
prevent.

**Which half was wrong differs by form, and both answers are here.** A radar has
no cartesian axes and a pie already declared zero — so for the geometric family
the *declaration* was wrong. For the facet forms the *row count* was wrong too:
the parent's declared height is the contract whatever its children do, so they
reconcile through `composeRows` like every axed form.

**And the parent sizes its children, which this section deferred one commit ago
and the implementation falsified.** The ruling was that a short facet grid pads
and that filling it belongs with `height: "fill"`. Reconciling alone turned out
to *cut*: a parent declaring 5 rows whose children each declare 5 gets children
of 8 — their own height plus their own frame — so honouring the declaration took
the bottom border off every facet. Obeying the letter of I1 by deleting the last
three rows of a drawing breaks the thing I1 protects. So each facet is rendered
at the parent's budget minus its own furniture, which is what *the parent owns
the layout* has to mean. A child with no room for its own furniture keeps one
area row and `composeRows` finishes the job.

**A heatmap's two rows are not the line's two rows**, and the substitution is deliberate: a
matrix's cells bound themselves, so there is nothing for a rule to delimit, and the row it would
have taken pays for the legend instead. The legend is not optional furniture — it is the only
thing that says what a cell *means*, which is why `axes: false` on a heatmap is refused rather
than honoured (§6a A4).

**The third row is the frame's lid** (§3f), and it is why the matrix stays at two: a box has a
top edge whatever the data does, so the row is declared with `FRAME_ROWS` and added by
`plotHeight` without a series ever coming into scope. The matrix has no lid to pay for, and the
same sentence that keeps its two rows different keeps it at two.

With `axes: false` there is no y-label column and the plot area is the full `width`. With axes it is `width − yLabelWidth − 3`: 2 for a space and the left `│`, and 1 for the frame's right edge.

Exact and data-independent. An empty series occupies its declared height with a centred empty message rather than collapsing — a plot that changes height when data arrives would shift everything below it mid-stream.

**`form: "line"` requires `height`, and omitting it is a construction error** (C04 §3). There is deliberately no default. `height` is optional on the type only because `sparkline` does not take one, and C04's constructor enforces the pairing rather than substituting a number. A defaulted height is the one way this component's central property — height declared, never derived — fails silently: the plot renders, nothing errors, and it is the wrong size on a surface nobody thought about.

Width is `ctx.width`. For an axed line plot the plot area is `width − yLabelWidth − 3`, where `yLabelWidth` is the widest formatted y-label, 2 covers a space and the `│`, and the last cell is the frame's right edge. **The right edge pays before the curve does** — labels, then furniture, then the plot area — which is T3.3's ladder unchanged and one cell longer.

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

**Axes.** Up to three y-labels — max, midpoint, min — formatted per `yFormat`, right-aligned in the label column, placed at the max, mid and min row indices of the plot area, each with a `┤` on the border beside it (§3f). **The tick values come from `axisFor` and therefore from `yScale`** — `yLabels` reached straight for the linear arm, so a log plot picked log ticks in `positionalForm`, where only the range was read, and was then labelled linearly. Two computations of one axis, disagreeing, and the set nobody drew was the correct one. **They collapse when the height cannot hold three**: at `height: 2` the max and the min, at `height: 1` the max alone. The midpoint goes first because the extremes bound the data and the midpoint is interpolation between them. Without this clause the section contradicted T3.2, which renders `height: 1` with axes.

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

## 3b. The value bar — the `fill` encoding

**A quantity against a scale, drawn as a run.** The fourth encoding axis and the one the tree
already wanted: `examples/docker` hand-wrote nine lines of it rather than bend `progress`, which
answers *how far through* where the app needed *how much* (FINDINGS gap 3).

```typescript
/** One row of exactly `width` cells. For C11's `Cell.bar` — the same seam `sparkline` uses. */
function valueBar(
  spec: BarSpec,
  width: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): string;
```

**A pure function and not a block**, for `sparkline`'s reason exactly (§2): a cell is not a
block, and the measured consumer is a table cell. C11 imports it on the same sideways edge.

```
█████████░░░░ 84.2%      unicode
#########..... 84.2%     ascii
—                        absent — a mark, never an empty run
```

**The fill clamps at `max` and the number does not** (C09 I28, and it is one ruling for both
forms now). A per-core CPU percentage has no knowable ceiling, so `101.2%` fills the run and
keeps counting; a bar that stopped at its ceiling would draw a busy container exactly like a
saturated one.

**The number takes the width it needs and the run takes the residual**, which is `progress`'s
rule and the reason both are `fill`: the run *is* the axis, so it is the part that may shrink.

**The alphabet substitutes by capability, and that is the point of it being here.** The app
threads a `unicode` flag by hand today because an adapter is handed `AdapterContext` and no
capabilities (F43, F54) — and its `█ ░ —` passed through untouched at `LANG=C` beside a plot
that had correctly degraded. A framework function gets the capabilities from `ctx` and the
thread stops being the app's.

**No tone, and no thresholds.** The cell's own `tone` and `glyph` carry the colour, so a
framework that shipped thresholds would ship arbitrary numbers for everyone — gap 3's own
statement is that the app should not have to *invent numbers to express a quantity*, not that
60 and 85 are wrong. The numbers stay the app's; the drawing stops being.

---

### The number's allowance is the chart's, not the row's

*The number takes the width it needs and the run takes the residual* is right and was applied per
row, which inverts. Measured at `max: 100` in 40 cells:

```
 99   ████████████████████████████████████▋ 99      37 cells
100   ████████████████████████████████████ 100      36 cells
```

**A larger value drawing a shorter bar**, because `100` is one column wider than `99` and each
run was scaled against what its own label left. Every count in both rows is correct and the
picture is wrong — the class this component keeps finding, in the one place a reader compares
lengths.

So the allowance is **the widest label in the chart** and every run is scaled against one width.
The rule is unchanged — the run is still the part that shrinks — and what changes is that it
shrinks once for all rows rather than per row against a different residual. *A chart whose values
are all one digit spends one column; the moment one value needs two, every bar loses the same
column and the comparison survives.*

### Standing the number up — and the two arms cannot answer alike

Horizontally the run **is** the axis: the row's own width is the scale, so the label may take
part of it and the picture stays true. Vertically it is not. A column's height is read against the
value scale in the **gutter**, with labelled ticks beside it, so shortening a bar to make room for
its number would draw a value the axis it is measured by contradicts.

So the vertical arm cannot shrink and it does not: **the number goes in the row above the bar's
top, centred on its column, and it is dropped rather than made to fit.**

| the case | what happens | why not the other thing |
|---|---|---|
| the bar's top is row 0 | **dropped** | there is no row above it, and taking one from the bar would misdraw the value |
| the number is wider than the column | **dropped** | a truncated number is a different number, and one that spills labels the *neighbouring* bar |
| the bar has zero height | drawn on the bottom row | its top is the baseline — the number sits where the ink would have started |
| the value is absent | nothing, as the column draws nothing | I20's `absent` mark is the row form's; a blank column has no run to mark |

**Dropping is per bar and not per chart**, which is the row a reader would not predict: the tallest
bar in a chart is the one most likely to lose its number, and that is correct rather than
unfortunate — its height is already the thing the axis says most clearly, and the bars that keep
their numbers are the ones a reader is squinting at.

---


## 3a. The heatmap

**One cell per position per row, magnitude in the ink of the cell, one range across the whole
matrix.** Everything here is §6a's walk implemented, plus three corrections the first draft of
this section got wrong — recorded rather than quietly replaced, because two of them were the
same mistake and the shape of it is worth keeping.

```
              ⠄⠔⠖⠶⠷⠿⡿⣿⡿⠿⠶⠖⠔⠖⠶⠷
api           ⠶⠷⠿⡿⣿⡿⠿⠶⠖⠄
worker        ⠄⠄⠄⠔⠖⠶⠷⠿⡿⣿⡿⠿⠶⠖⠄⠔
db
              -60 ticks         now
              ⠄⠔⠖⠶⠷⠿⡿⣿  0 – 100%
```

### The ramp is the density ramp, and it is not `RAMP_BRAILLE`

`RAMP_BRAILLE` fills **bottom-up** — `⡀⣀⣄⣤⣦⣶⣷⣿` — because a sparkline cell has a vertical axis
and the glyph is a column of that axis. **A grid cell has no vertical axis**, so a bottom-filled
glyph reads as a bar fragment and a matrix of them reads as rows of tiny bar charts.

`RAMP_DENSITY` spreads instead: `⠄⠔⠖⠶⠷⠿⡿⣿`, dot populations 1 to 8, every step narrow under
both width conventions. It is the prior art's density ramp with **one correction of its own**:
that set begins at `U+2800`, and blank is now what an absent cell draws, so the ramp starts at
one dot. I16 covers all three ramps for the same reason it covered two.

### An absent cell is blank

`?` is the sparkline's marker and it is right there: the row is right-anchored, so a blank
already means *fewer samples than cells*, and one character cannot mean two things. **A grid has
no padding** — every cell is a position — and the minimum has ink, so blank is unambiguous by
construction. A row of sixteen `?` also shouts louder than the data, which is the wrong emphasis
for the state that means *nothing happened*.

So `db` above is a stopped container: a whole row of nothing, quiet, and still occupying its row
(§6a A3).

### Painting the cell, and why the glyph is the fallback rather than the carrier

**The whole pipeline already does this and the plot module is the one kind that does not.** `Style` carries a `background`, `paint.ts` applies it, and `escapes.ts` emits `48` for it — and `paint.ts`' own header records the state: *C25 is the only consumer and the only kind that paints a background at all.*

~~So this is wiring rather than machinery.~~ **That sentence was wrong, and it is worth keeping struck through because of how it was wrong.** The channel exists and the door to it is shut: `resolveBackground` refuses every ref that is not `surface.*` and a colormap value is not a ref at all, so the one function that fills the channel returns `NO_STYLE` for this case by design. C10 I21 is the constraint and it is C10's to widen, not this component's to route around — *an artefact correct about the interaction it found and wrong about a mechanism it assumed existed*, which is C23 §8a A4's shape and C10 §4b's, and now this.

**C10 §4c is where it was settled**, and the deciding word is *text*: I21's floor is a property of a foreground **on** a surface, and a painted matrix cell has no foreground — it is a blank cell whose colour is the datum. So C10 admits one further way in, `wash(width, colour)`, which returns a blank `Span` rather than a `Style`. A caller cannot pair a computed background with a glyph, because there is no glyph to pair it with. **The rule that makes the widening safe is unforgeable rather than remembered**, which is the difference between this and the four gutters that each had to honour a convention.

It changes seven forms at once — `heatmap`, `correlation`, `confusion`, `spectrogram`, `latency`, `density2d`, `calendar` — plus solid bars and solid pie wedges.

**Two things it does not change.** The scale legend stops being a density swatch and becomes a colour one — `⠄⠔⠖⠶⠷⠿⡿⣿  5 - 90` says nothing once the ramp is not the carrier; granite's `Min ▮▮▮▮▮ Max` is the shape. And I25 still holds in the other direction: where colour is *absent*, two things a reader must tell apart still differ by mark. The two rules meet rather than conflict — **glyphs are what a form falls back to, never what it leads with when colour is there.**

**And it opts out of a theme ruling, deliberately.** C10 declares `background: "terminal"` for the dark theme so a translucent or blurred terminal is not destroyed by a painted surface. A matrix that paints every cell is choosing against that, which is right for a matrix — a heatmap *is* its surface — and would be wrong as a global switch. So the decision is per form, stated per form, and not a capability.

**The consequence is visible and someone will report it as a defect.** On a translucent or blurred terminal every other block shows the desktop through it and the matrix does not — it is an opaque rectangle in a window that is otherwise see-through. That is correct and it looks like a bug, which is exactly the pair of properties that gets a correct behaviour "fixed" by the next person. It is recorded here so the answer is already written: the alternative is a heatmap whose cells are tinted by whatever is behind the terminal, and a magnitude that depends on the user's wallpaper is not a magnitude.

### Colour is the second channel, not a refusal — and the vocabulary for it does not exist

The first draft said *no colour, so D29 is satisfied by construction*. **That is the wrong rule
and the wrong conclusion.** F34 is the rule: a distinction must not be carried by colour
**alone**. A braille cell carries which dots are lit *and* its foreground colour, and the two do
not compete — so magnitude can be **both**, with the density surviving at 1-bit when the colour
goes. Colour is safe here precisely because density is the other carrier.

**Measured before ruling it in, and the answer is neither of the two expected:**

| | measured |
|---|---|
| per-cell foreground, in this renderer | **expressible** — `mergedRow` emits a span per run of cells, and a run may be one cell |
| a palette that means *magnitude* | **none.** `tone` is judgement, `categorical` is identity, `syntax` is syntax |
| `spectrum` | a **hue wheel** for declared art, consumer list closed at two (C10 I16). Non-monotonic in luminance, which is the textbook wrong colormap for a quantity |
| an unknown `ColourRef` | resolves to `{}` — **no style, silently**, so inventing `sequential.s1` would render uncoloured with nothing saying so |

So the mechanism is there and the vocabulary is not. **The heatmap ships density-only, and that
is a state rather than a ruling against colour**: what it waits on is a fourth palette family
that means magnitude — ordered, monotone in luminance, contrast measured per theme — which is
the shape roadmap 51's categorical palette had and the same size of change. Named here so the
next person finds a blocker rather than a preference.

### Too narrow for its labels

**A2 ruled the drop order and the code inverted it**, so this states the ordering as a ladder
rather than as a preference. A heatmap's row labels **are** its ordinate: an unlabelled matrix
is a picture of numbers with no way to tell which row is which, which is the same objection that
refuses `axes: false`. So the width is spent in this order, and the last rung is not *drop the
labels*:

```
1  columns go        the window is of the last positions anyway, so the oldest leave first
2  labels truncate   into whatever remains after the axis furniture and MIN_AREA
3  the block says so a declared height with a centred notice, never an unlabelled matrix
```

Rung 3 is reached when the width cannot spare one cell for a label beside a minimum plot area.
It keeps the declared height, because I1 is about the block and a plot that changed height at a
narrow width would move everything below it on a resize.

**The line form is unaffected and keeps T3.3's ladder** — labels first, then furniture, then the
curve — because a y-label is a *scale* and a row label is an *identity*. A curve with no numbers
beside it is still that curve; a matrix with no names beside it is not that matrix.

### The legend never truncates its range

**It is the row that justifies refusing `axes: false`, and it was silently losing the thing it
exists to state.** Placed at the gutter offset, a wide label column left it a fraction of the row
and the range was the half that got cut.

Two rulings, and the first is what makes the second small:

- **The legend spans the full row.** It is furniture *below* the matrix rather than a cell of it,
  so aligning it to the plot area was borrowing the wrong reference.
- **Its parts have a drop order and the range is last**: the dropped-column clause goes first,
  then the ramp swatch. The swatch is a key to a scale the range names, and a key with no scale
  beside it is decoration.

### The rest

**The row order is the app's and the renderer never sorts** (§6a B1). A matrix whose rows
reorder between frames is unreadable even though every frame is individually correct.

**Columns are positions and the window is of the last `areaWidth` of them** (§6a B3). A heatmap
never spreads: one cell *is* one value, so spreading would draw a value twice — a lie about
density — or interpolate, which is inventing readings.

**Rows that do not fit take I8's answer unchanged**: the rows that fit, and the last row of the
plot area spent on `+N more · names`. The truncation marker *is* that line; there is no field.

## 3c. The encoding rule — and the type is what enforces it

**Both defects this arc were a ramp carried into a geometry it did not fit**: the heatmap took
the sparkline's height ramp for a density field, and before that `sparkline` took `line`'s
*filtered before scaling* and applied it to positions. Each was a correct rule from the arm next
door. Each rendered.

**A ramp is not a lookup table. It encodes a value along an axis**, and this component has four:

```
position   a dot drawn AT a coordinate       unicode line   — NO vocabulary at all
height     how full the cell is, bottom-up   sparkline      — the cell IS a column
density    how much ink the cell carries     heatmap        — a grid cell has no vertical axis
fill       how much of a RUN is covered      value bar      — the run IS the axis
```

### `Ramp` does not fit `fill`, and that is the shape rather than an exception

**A ladder maps one value to one glyph; a fill maps one value to a *count* of two glyphs.**
Forcing one type over both would make `filled`/`empty` a two-step ramp, which is exactly the
category error this section exists to prevent — a pair indexed like a ladder is a ladder with
two rungs, and nothing would then stop a renderer indexing it with a normalised value.

So the vocabulary has three shapes and the fourth axis has none:

```
Ladder   height · density    eight steps, indexed by a normalised value
Pair     fill                filled · empty · absent, repeated to a count
—        position            a coordinate needs no vocabulary
```

**`position` having none is the rule proving itself.** The unicode line reaches for no ramp
because its axis is the grid; the moment a renderer of a positional form imports one, it is
drawing a different picture.

### A renderer names an axis, never a ramp

```typescript
type Encoding = "position" | "height" | "density" | "fill";

ladderFor("density", caps)   // → a Ladder whose `encodes` is "density", by the type
pairFor(caps)                // → the fill Pair
```

**The mismatch stops being expressible rather than being checked.** `LADDERS` is a mapped type
over the axis, so an entry returning a ladder of the wrong axis does not compile — which makes
the obvious mutation (*`ladderFor("density")` returns a height ramp*) **unspellable in the source
rather than caught by a test.**

**And a source scan forbids reading a ramp constant outside `ramp.ts`**, because importing
`RAMP_BRAILLE` directly is the exact move that produced the defect. The scan is what stops the
next renderer going round the seam.

### `substitutes` is data, because unstated it is D5 again

`RAMP_ASCII` serves **density** for the heatmap — ASCII has only ink, which is the heatmap's own
axis — and **height** for the ASCII line, where it is a *stand-in*: ink weight for position,
because ASCII has no vertical sub-cell resolution to offer. Both uses are correct and only one is
an equivalence.

So a ladder declares every axis it serves and names which of them it substitutes for:

```
RAMP_ASCII   encodes: ["density", "height"]   substitutes: ["height"]
```

A rule that permitted only one axis per ladder would refuse a correct thing, and a rule that
permitted several without marking the stand-in would lose the distinction that cost two defects.
**The cost of the substitution is stated where it is taken**: at ASCII a line and a filled area
are hard to tell apart.

---

## 3d. Axes — nice numbers, precision, density, and the cycle that did not arrive

**Heckbert's `nicenum`, with 2.5 in the set.** A step is 1, 2, 2.5, 5 or 10 times a power of ten.
Heckbert's original omits 2.5, and without it a span of 100 over five ticks picks 20 — so
`0 · 25 · 50 · 75 · 100`, the example everyone reaches for, is unreachable. One more admissible
step buys the interval a reader of percentages already has in their head.

### Loose labelling, per end — and C04 I29 is the interaction

A bound the **data** supplied snaps outward to a multiple of the step. A bound the **surface**
declared is used exactly. A pinned axis exists so two plots can be compared, and a pin that
silently grew would defeat the only thing it is for, so the snap is applied per end rather than
to the range.

**Its cost is measured, because it is real and it is paid in rows.** Snapping inflates the span,
and on an eight-row plot that is one or two rows of vertical resolution:

| series | data | snapped | span |
|---|---|---|---|
| request rate | 392 … 960 | 250 … 1000 | **+24%** |
| loss curve | 0.087 … 0.86 | 0 … 1 | **+23%** |
| gapped line | 1 … 9 | 0 … 10 | **+20%** |
| cpu, `yMin: 0` | 0 … 87 | 0 … 100 | **+13%** |
| epochs | 0 … 40 | unchanged | 0% |

**The cost and the tick count are one knob.** The step is about `span / (ticks - 1)` and the snap
can waste up to a step at each end, so fewer ticks means rounder labels and a looser fit. At eight
rows the count is three, which is why the inflation is what it is. Recorded rather than tuned
away: a reader who wants the tight fit back is reversing one ruling, and these are the figures it
should rest on.

### Precision is one per axis, from the step — and it is the step's own decimals

The step is exact by construction, so *how many places write it back unchanged* has an exact
answer. `decimalsFor` answers a different question — two significant figures of a magnitude,
which is right for a lone value — and asked about a step of `5` it says one place, which drew
`40.0 · 35.0 · 30.0`: a decimal on every label that no tick could ever use.

**And a shared precision has to survive being turned into a string.** `Number(v.toFixed(2))`
strips the trailing zero, so one precision came out as three — `0.2` beside `0.15` beside `0.1`,
which is the exact thing sharing prevents. The prose said *the three share one precision* and was
true about the arithmetic; nothing said what happened to it afterwards (F177).

### Density is a result and the ceiling is a maximum

The ceiling is the **lower** of two bounds: how fine a step is worth asking for (a third of the
rows) and how many labels this height can seat two rows apart. What survives is decided by the
abut rule — a tick whose row is within one of a kept tick's is dropped, because two labels
touching read as one two-line label.

Read from a frame rather than derived: a five-tick ceiling over eight rows put `50%` and `25%` on
rows 4 and 5, because `rowOf` rounds and eight rows cannot evenly host five ticks. A third of the
rows alone is too coarse the other way — it drops the midpoint at height five, where the gap rule
would happily seat it at row 2.

**A declared maximum is not a member of `Plot` yet.** It would be geometry and would widen the
type correctly (C04, step 3's ruling); no surface has asked, and the ceiling here is derived from
the height, which is the space the ticks are competing for.

### A step the arithmetic cannot pick is nothing, not a plausible constant

A denormal span underflows twice — half of `Number.MIN_VALUE` is zero, and so is `10 ** -324` —
so `niceNumber` produced `0`, `Math.floor(min / 0) * 0` is `NaN`, and the axis handed a `NaN`
range to the rasteriser, where `drawLine` stops on `x === ex` and `NaN` is equal to nothing. Not
slow: non-terminating.

**The invariant it breaks is two modules away.** I2 says no series input throws or hangs, and
nothing in a rule-interaction artefact for this function reaches it — the function returns, every
value it returns is a number, and the state it leaves behind is refused elsewhere. That is the
walk's own recorded blind spot arriving in the first function written after it was written down.

**And the first guard made it worse by being plausible.** `return 1` terminates, every number is
finite, and it snaps `5e-324 … 1e-323` to `0 … 1` — the data swamped by three hundred orders of
magnitude, in a frame no assertion could tell from a correct one (F178).

### The gutter's cycle does not arrive with this step, and the plan said it would

`label width ← tick values ← tick count ← plot width ← gutter width` is the circular dependency
the two-pass answer exists for. **The y-tick count is chosen against the *height*, and the height
is declared** — `plotAreaRows(block)`, which no width can change. So label width still does not
depend on plot width, `layoutFor`'s monotone ladder is still sufficient, and there is no fixed
point to iterate towards.

**The cycle needs an x-axis that picks its own ticks**, where *available space* is the width.
`xLabels` is three declared strings, so nothing in the tree has that shape. The prediction was
reasonable and what decides it is which axis the count is chosen against — measured rather than
inherited.

### The x axis, and the row it has been reserving for it all along

§3d is about the **y** axis. The positional family had no x axis at all — `xLabels` is a
three-caption tuple, a left/centre/right *caption* rather than a scale, and `Series.values` is a
bare array with no x coordinate anywhere in the type. So every line, scatter, step, ecdf, density,
slope and bubble in the catalogue draws a frame with nothing under it.

**And the row is already paid for.** Measured: `height: 10` with `axes: true` renders **13** rows —
`AXIS_ROWS + FRAME_ROWS` is added to the declared height rather than taken from it — and with no
`xLabels` the last of those three is **`""`**. Every axed positional plot has been spending a row
on an x-label row it never fills. Filling it costs nothing, which is why this is not weighed
against the height invariant.

**The domain is declared, and the sample index is what it falls back to.** `Plot` gains
`xMin` / `xMax` / `xFormat`, mirroring `yMin` / `yMax` / `yFormat` exactly — the same `axisFor`,
the same precision rule, the same formatter. Absent, the domain is `[0, n − 1]`: the sample index,
which is what the data *has* when nothing else was said. Measured against the reference:
`ax.plot(y)` over 24 samples ticks `0 5 10 15 20`, and `ax.plot(x, y)` over `0..60` ticks
`0 10 20 30 40 50 60`. Not an invention.

#### 3d.1 — The classification table

Indexed by rule interaction, because a row governed by one rule restates it:

| the interaction | the two rules | the ruling |
|---|---|---|
| `xLabels` set **and** a domain declared | a caption is the caller's words; a scale is derived from the data | **the caption wins.** Replacing what a caller wrote with what we inferred is the wrong direction, and both cannot have the row |
| no domain, a positional form | *ticks come from the domain* meets *there is no domain* | the index, `[0, n − 1]` — a fallback rather than a special case, so one code path serves both |
| `plotFrame: "corners"` | I26: a tick is a mark **on an edge** and corners have no edge | **no ticks, and the labels stay.** The converse is already ruled the other way: a tick under a label that was never drawn marks nothing, so it goes; a label without a tick is still a reading |
| `xScale: "log"` or a time scale | `yLabels` records this exact defect at `axes.ts:411` — ticks picked by `axisFor` and *labelled* by `niceAxis` | the label goes through `axisFor` too, or the two halves of one axis disagree and neither is wrong on its own |
| a label wider than its room | `xAxis`'s placement: a label that cannot keep its one-cell gap is dropped | **verbatim, and a dropped label takes its tick with it** — the anchor comes out of the placement rather than beside it |
| a tick and the cursor in one column | I37: the cursor answers a question the reader just asked | the cursor wins, unchanged |
| **`plotStyle: "candlestick"`** | the tick's column comes from the *curve's* mapping; a candle's comes from its own pitch | **the form owns the mapping** (I37). *Measured there: the two agree at the dense end and separate at the sparse one — four bars in forty-four columns put the last candle at column 20 and the curve's rule at 43.* A tick placed by the curve's rule would point between candles |
| the categorical family | the vertical arm already labels its columns through `columnLabels`; the horizontal arm's bottom axis is a **value** axis | **out of scope, and named rather than left silent.** A value axis under a horizontal bar is a different thing from a position axis under a curve, and it does not exist either |

**The candlestick row is the one that would have shipped wrong.** Everything else on this table is
a rule meeting a boundary; that one is two correct mappings from the same index, and the frame
would have looked right at the width the catalogue happens to use.

### Named and not built, with the reason

**A time axis is a different algorithm, not a different format.** `:00 · :15 · :30`, or midnight,
or Monday, and the label format follows the span. It cannot be reached by rounding a number
because the ladder is 60 and 24 and 7 rather than powers of ten — and a time axis ticking every
23.4 seconds is more visibly wrong than a numeric one, because a reader knows what a clock looks
like.

**A log axis picks differently again** — decade boundaries, or `1 2 5 10 20 50`. Linear ticks on
a log axis are unreadable rather than merely ugly.

Neither has a consumer in the tree, and each would be a second `niceAxis` rather than an argument
to this one. Named so the next reader knows they were weighed.

## 3e. Annotations — one feature, and the one that shares a name and not a mechanism

**Six named chart types collapse into one feature.** A Q-Q plot is a scatter plus a reference
line; ROC is a line plus a diagonal; calibration, residual and Bland–Altman are the same shape
again. None is a renderer, so none is a `PlotForm`.

**An annotation is a dashed line in the same raster**, drawn into a `Grid` exactly as a curve is.
It inherits the width, the fold and the capability choice, so it needs no glyph rôle, no fallback
decision (C09 §4) and no third encounter with F176's ambiguous-width trap — every box-drawing
dash is `East_Asian_Width=Ambiguous` and none of them is reachable from here.

**Dashed rather than toned, which is F34 satisfied structurally.** The other carrier is *shape*:
a reference line is broken where a curve is continuous, at every colour depth including one bit.
They were always going to be lines and marks, which is the whole argument for annotations being
cheap in a terminal.

**A band is two lines.** One statement, two edges — the survey's own ruling, and a fill would
compete for the cells the curve is drawn in and be indistinguishable from it at one bit.

**Behind the data, and the layer order is the ruling.** Layers resolve first-non-blank, so
annotations are appended last: one that overwrote a sample would hide the thing it exists to be
compared against.

**An out-of-range edge is dropped, never clamped.** This is the one place an annotation differs
from a sample. C04 I29 clamps a sample because pressing data against the ceiling is honest; an
annotation is a **claim about where a value sits**, so a threshold of 85 clamped onto a plot
whose ceiling is 60 draws a line saying *the limit is here* about somewhere the limit is not.

### Two mechanisms, and the ASCII one is not the raster

Read from a frame. `foldRamp` encodes **height** — how full a cell is — and that is a declared
stand-in for position (I21). An annotation has no height to encode: it is one dot at one row, and
folding it by ink weight turned a reference line into `# # # # #`, a row of heavy glyphs
indistinguishable from a flat series and heavier than the curve beside it.

So at ASCII the line is drawn at **cell resolution directly**, which is all the resolution ASCII
has, with `-` as the mark. Two mechanisms under one function, stated because the alternative is
the class this component has now hit four times.

### The dash period came from the frame, not from taste

At braille's 2×4, a period of two dots lights one dot in *every* cell — solid to a reader, which
is the one thing an annotation must not look like. Two **cells** between marks leaves a clear gap
at both densities.

### The bar's target marker is a different mechanism, and that is the ruling

The plan named a target marker for the value bar as *a reference line at cell scope*. Measured
against the general mechanism before building both:

| | the plot's line | the bar's marker |
|---|---|---|
| what it is | a row of a 2-D raster | one glyph inside a 1-D run |
| how it is drawn | dots into a `Grid`, folded | a character substituted into a string |
| what it spans | the other axis | nothing — there is no other axis |
| its degradation | the raster's, already decided | a third glyph the pair does not have |

**They share a name and a meaning and not a mechanism**, which is the error this pass has now
caught four times. A shared *vocabulary* is fine — a value, a kind, a tone — and the renderer is
per-form, exactly as `BarSpec.format` shares an enum with `Plot.yFormat` while precision is not
shared (F175).

**And the cell scope has a problem the plot scope does not**: a marker inside a run needs a glyph
the `fill` pair does not carry, and the obvious candidates — `│`, `┃`, `|` — are box-drawing and
ambiguous-width, which is F176 arriving on a fourth axis. It is not built, and there is no
consumer: nothing in the tree declares a bar target.

### What has a consumer, and what is named

**Built** — the horizontal reference line and the band, with `examples/docker`'s CPU plot as the
measured consumer. `loadTone` has classified at 60 and 85 since the dashboard was written, so the
numbers were already the app's judgement and the plot was the one surface that could not show
them.

**Named and not built**, each for a stated reason:

| type | why not |
|---|---|
| vertical and diagonal reference lines | no consumer; a diagonal also needs the two axes to share a unit, which nothing in the tree does |
| point marker | no consumer, and it needs the label mechanism below |
| region — a highlighted x-range | no consumer; the x-axis is three declared strings (§3d), so there is nothing to place it against |
| event mark | the same, plus a tick on the x-axis rule, which is furniture rather than raster |

**And there is no `label`, which is owed rather than forgotten.** The survey names one and it has
nowhere to go: the gutter is sized from the y-labels and is a **scale**, so widening it for a
string that is not one changes the plot area for text nothing measures with it; inside the area a
label overwrites the curve it exists to be compared against. It wants a legend row, which the
overlaid form does not have. A member nothing draws is indistinguishable from one not yet
implemented, so the field arrives with the row that can hold it.

### The snap cost, taken rather than left

§3d records that loose labelling inflates the span by 13–24% — one or two rows of an eight-row
plot — and that the cost and the tick count are one knob. **The ruling is to keep it**, and this
step is what supplies the argument the previous one did not have:

**An annotation is read against the axis.** A band at 60–85 on an axis labelled `0 · 50 · 100` is
a statement a reader can convert; on an axis labelled `0 · 43 · 87` it is two dashed lines at
positions nobody can name. The rows the snap costs buy the only thing that makes the rows worth
anything.

Whoever reverses it is changing both halves — rounder labels and a looser fit are the same knob —
and the figures are in §3d so that decision rests on numbers rather than on a preference.

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
must not collide with any step of any ramp — `▁▂▃▄▅▆▇█`, `.:-=+*#@`, and the braille ramp `ladderFor` returns at
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

**The ASCII ramp encodes height by standing in for it, and that is a substitution rather than an
equivalence.** `foldRamp` maps a column's topmost inked dot-row to a ramp index — bottom → `.`,
top → `@` — so what a reader sees is *ink weight* where the braille form gives them *position*.
It is monotone and legible, and the cost is that at ASCII a line and a filled area are hard to
tell apart, because a value near a cell's top draws a glyph that fills the whole cell.

Stated because the same substitution unstated is what produced the heatmap's first draft: a ramp
encodes a value along an axis, and height, density and fill are three different axes. This is the
one place in C12 where the axis drawn is not the axis meant, and it is deliberate — ASCII has no
vertical sub-cell resolution to offer.

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
| a magnitude glyph per cell | `ladderFor` — eight steps, and correct under both width conventions |
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

### 6b — The candlestick walk

**A classification table and no sequence trace, and the shape is a decision rather than a
consequence.** C12 owns no state and every render is a pure function of block, width and
context (I11), so there is no event that can put two rules in contact: every interaction here
holds at rest, which is the structural kind C18's table finds and a trace indexed by events
cannot reach. A trace here would have one row per input and find nothing.

| | the two rules that meet | what the cell is | ruling |
|---|---|---|---|
| **B1** | emptiness asks `hasSamples(block.series)` · plain candles is `series: []` plus a full `ohlc` | a correct candlestick block | **"No data."** — a frame internally consistent, passing every width and row assertion, and about nothing. Both `hasSamples` and `seriesRange` widen to see `ohlc`; `series: []` being legal is exactly what hides it |
| **B2** | `plotStyle` selects a `Rasteriser` · a `Rasteriser` takes a `Series` | a candlestick rasteriser | dispatched in the **form** arm before `styleRasteriser`, so the type never describes a function that ignores its first argument |
| **B3** | the y-axis is `seriesRange` over the series · a candle's extremes are `low` and `high` | the axis of a chart with both | the union. `low`/`high` bound the candles and the overlays bound themselves; a pin still wins |
| **B4** | §3b — two categories separated by colour, then by mark · I25 — by mark or by name, never by tone alone | the legend | it names the candles **and** each overlay series, with `▯ rising` and `┃ falling` as two entries. Direction is the mark at **every** depth, so I25 holds on the mark disjunct rather than resting on the legend |
| **B13** | the body spans open→close · the wick spans low→high | a wick that reaches no row beyond the body | `┿` — the fifth mark, and the row that gives it a job. At cell resolution the body wins the overlap, so without this the wick vanishes at exactly the bar it matters for. **Bounded by the frame, not by this row**: `┿` is affordable only where some other cell of that candle still carries the body — another column, or an interior row. Its first form ruled it for a body shorter than a cell, and 120 bars in 44 columns then drew a chart of nothing but `┿`, with not one candle saying which way it went |
| **B14** | I25's sweep is indexed by `PlotForm` · `candlestick` is a **style**, so its form is `line` | the guard over the one form that has a style | it runs, it passes, and it renders `ONE_PER_FORM["line"]` — a document with no `ohlc`. **A rule table is exhaustive over the axis it is indexed by**, and a style is an axis `SHARES_CELLS` does not have. So the vocabulary carries direction by mark at every depth rather than relying on a sweep that cannot reach it |
| **B15** | `candleWidth` is clamped to 1…5 · `areaWidth` need not divide by `n` | 70 columns and 9 candles | **the pitch is uniform and the leftover is blank on the right**, which is §3r's left-alignment and not a second rule. This row first said *spread the remainder a cell at a time*, borrowing `categoricalColumnForm`'s arithmetic — and four bars in forty-four columns came out one every eleven cells, a layout asserting that four samples span the window. The concern was right (a candle wider than its neighbours reads as a datum) and the remedy was the wrong half: uniformity answers it, distribution does not |
| **B5** | a doji draws `─` · an overlay line through that column draws `─` | one cell, two sources | **not a defect and it needs no glyph change**: both statements are true of that cell. The readout disambiguates, which is what makes §3r's readout load-bearing rather than a convenience |
| **B6** | the crosshair reads a column · `ohlc` is shorter than the cursor's index | the readout past the data | `—` for each of the four, exactly as a null series value reads. A candlestick has four values to be absent rather than one |
| **B7** | `candleWidth` is clamped to 1…5 · the wick is centred | an even candle width | left of centre, `⌊(w − 1) ÷ 2⌋` — the rounding `boxplotColumn` already uses, so the component has one rule and not two that agree |
| **B8** | the vocabulary is ambiguous-width · `glyphs()` returns the ASCII set at `wide` | a wide terminal | **the same number of candles**, drawn `= # \|` at one cell. Not swapped to braille — a candle is positioned where a bar is measured — and not held ambiguous either, because `glyphs()` rules the wide arm for every glyph in the component. This row's first form said *half as many*, which conflated the two swaps (§3r) |
| **B9** | `plotStyle: "candlestick"` · a form that is not `line` or `step` | `form: "pie", plotStyle: "candlestick"` | refused at construction (C04 I57). An ignored member reads as one not yet implemented, which is C04's established idiom in this type |
| **B10** | `plotStyle: "candlestick"` · no `ohlc` | a style with nothing to draw | refused at construction, and the throw leaves nothing behind because it happens before any render state exists |
| **B11** | an `OHLC` is four numbers · a candle's geometry is `low ≤ min(open, close)` and `high ≥ max(open, close)` | `{open: 5, high: 3, low: 6, close: 4}` | refused. It is not a candle that renders oddly, it is not a candle |
| **B12** | more bars than columns · downsampling picks or averages | five hundred bars in seventy columns | **aggregate**: open of the first, high of the maxima, low of the minima, close of the last. Exact rather than approximate, and the one downsampling in this component that loses nothing |

**B1 is the row that would have been got wrong**, and it is why it is first: every emptiness
check in the component asks about `series`, and a plain-candles block is legal with none.

**B13, B14 and B15 arrived on the second pass** — run against the tree rather than against the
brief, once §3r's three claims had been checked. B14 is the one worth keeping: it is not about
this component's rules meeting each other but about a *guard* whose index has no column for what
was added, which no row of a table indexed by the same thing could have surfaced.

**And B13 and B15 were both overturned by the first frames**, which is the walk's own limit
arriving on schedule. Each row named a real interaction and each prescribed a remedy that reads
as correct on the page: *`┿` where the body is under a cell*, *spread the remainder*. Rendered,
one produced a chart with no direction in it and the other a chart claiming four bars span the
window. **A walk rules the shape and the implementation is the first thing that can disprove
it** — the finding survives in both rows and only the remedy had to change.

**B5 is the row that makes a later commitment load-bearing.** Nothing about it changes a glyph;
what it changes is that the readout stops being optional.

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
width it gets; the sparkline windows to the last `width` (I13).

**And the padding goes on the right, which is a separate ruling that read as the same one.** The
window is of the *last* `width` positions either way — that is not in question, and stretching is
still refused for the reason below. What was never argued is which end the blank goes when there are
fewer positions than cells. It padded on the left, and T1.13's comment justified it as *"three
samples so far, growing rightward — not a stretched curve that changes shape as it fills."* Every
clause of that is true, and none of it distinguishes left from right: **it argues against
stretching, which both anchors avoid.**

Measured against what it claims: right-anchored, three samples in eight cells draw `␣␣␣␣␣▁▅█`, and a
fourth arrival gives `␣␣␣␣▁▅█▇` — every glyph already on screen has moved one cell left. Left-
anchored they do not move at all, which is what *growing rightward* describes. So the sentence was
attached to the anchor that fails it. Once the row is full the two are identical, and that is why
nothing caught it: the case where they differ is the one before a feed has filled its row, and it is
also the case a catalogue frame shows.

Ruling: **pad on the right.** A sparkline of 50 points in 80 cells now reads as a series with room
left rather than as a clipped one — the reported symptom — and I13's *one cell per position* is
untouched.
 A heatmap must window: one cell
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

## 3f. Furniture — one compositor, and four gutters is the reason

**The gutter is written four times.** `gutterSpans` (definition.ts), a near-identical copy
in `heatmap.ts`, and inline label-width loops in `categoricalForm` and `bandedForm`. Each was
reasonable when written: a form's author found the existing one did not quite fit and wrote
theirs. That is how the duplication arrived and it is how it would return.

**The defect it produced is not aesthetic.** `labelWidth` and `padStart` both default their
measurement to `ambiguousWidth: "narrow"`. Two of the four copies pass the real capability;
the positional one never does. So on a terminal reporting `"wide"`, a y-label containing an
ambiguous-width character — the em-dash `formatValue` returns for a non-finite value — measures
one cell and draws two, and that row's `│` sits one column right of every other row's. **The
axis is not straight, and the cause is that four things measure and only two were told what
they were measuring against.**

`furniture.ts` owns it. A form supplies its area rows and, sparsely, its gutter labels; the
compositor measures, pads, and appends the bottom furniture. **It asserts that the rows it
returns equal `plotHeight(block)`** — turning a per-form convention that four call sites each
had to get right into one checked invariant (I24).

### `plotFrame` — the references disagree, so it is a field

| value | shape | after |
|---|---|---|
| `"box"` *(default)* | closed border, tick marks on both axes | UnicodePlots `:solid`, plotext |
| `"corners"` | four corner marks, blank edges | UnicodePlots `:corners` |
| `"grid"` | closed border plus dashed gridlines at each tick | kitty.r |
| `"rule"` | left `│` and bottom `└───` only | what shipped before this |

**`axes: false` still suppresses all of it.** `plotFrame` picks the shape when there is
furniture; it does not decide whether there is any. Two fields, two questions — a single
enum spelling `"none"` would make `axes: false, plotFrame: "box"` expressible and meaningless.

**`"box"` is what ships, and the field does not yet exist.** The default landed on its own
because it is the one shape every reference agrees on; `"corners"`, `"grid"` and `"rule"` and
the `plotFrame` member that selects between them are still owed, and commitment 22 stays open
until they arrive. Recorded here rather than left to be inferred from a `Record` with one arm.

### The tick, and which way its stub points

termplot's `character_map.rb` declares both `tick_left` (`├`) and `tick_right` (`┤`), and
**draws only `tick_right`** — on the time series' right border, where the stub points in at the
data, and on the histogram's *left* border, where the same glyph points out at the label. One
glyph, both sides, and the second is the one this component copies: the y-labels sit outside the
left border, and the stub is what joins a label to the axis it is a reading on. Pointing it
inward would put a mark inside the plot area, where a reader has been told everything is a
sample.

**A labelled row carries a tick and an unlabelled one does not**, which is one rule rather than a
flag at each call site. It falls out right everywhere it is reached: three ticks on a curve's
scale, one per row on a categorical axis, one per band on a violin, one per row on a matrix —
which is termplot's histogram exactly — and none at all where the width left no room for labels.

**The x-ticks come out of the placement rather than beside it.** The three anchors are derivable
— first sample, centre, last — and deriving them is how the mark ends up a cell from the label it
marks: `xAxis` clamps a label that would collide with its neighbour and drops one that cannot
keep its gap at all, so the tick columns are recorded where the labels actually landed. A label
that is dropped takes its tick with it. termplot has no x-ticks at all — its abscissa is time on
one widget and a count on the other — so this half has no precedent to copy and follows the
y-axis' rule instead.

**Gridlines draw behind the data.** `mergedRow` resolves first-non-blank, so the grid layer is
appended last for the reason an annotation is (§3e): a rule that overwrote a sample would hide
what it exists to be measured against.

**`"corners"` has no edge for a tick to sit on**, which is a rule interaction and not an
omission — the tick row is suppressed there rather than drawn against nothing.

---

## 3g. The legend — and the two axes are not symmetric

C04 §3b already ruled that legend position belongs on `Plot`, and deferred it: *the members
arrive with their first surface.* This is that surface. C04 I52 defers `Annotation.label` to
the same place — *it arrives with the legend row that can hold it* — so one row closes two
conditions that were written down and then watched by nothing.

| value | shape | costs |
|---|---|---|
| `"right"` *(default)* | one entry per line down the right side | **width** |
| `"left"` | the same, outside the y-label gutter | **width** |
| `"above"` | a row between the title and the frame | **a declared row** |
| `"below"` | a row under the x-labels | **a declared row** |

**The asymmetry is forced by I1 and is the whole content of the default.** `plotHeight` is
computable from the block's geometry alone, with `series` structurally unreachable. A
horizontal legend costs a **row**, so its cost must be declared before the data is visible —
it is a fixed one row and it never turns itself on. A vertical legend costs **width**, which is
already data-dependent because `layoutFor` sizes the gutter from the y-range, so it can size
itself to the longest label and auto-enable when it is needed without the height invariant
noticing. **`"right"` is the default because it is the only placement that can.**

**Auto-enabled only where colour is the sole identifier** — where `mergedRow` composites more
than one layer into shared cells with no adjacent label: the positional family, `pie`,
`radar`, `waffle`, **and `bar`/`histogram` under `layout: "stacked" | "normalised"`**.

That last one is why this is a table and not a sentence. *Categorical forms name each row in
the gutter, so they never need a legend* reads as correct, is correct for eleven of twelve
members, and `stackedBarRow` composites series into one row with no per-series label anywhere.
**A row governed by one rule restates that rule and finds nothing.**

**Skipped entirely at `colourDepth: 1`**, where the positional family already falls back to
`stackedRows` and its per-series row labels. A swatch with no colour in it is worse than no
swatch — it is a legend that has stopped being one and still occupies the row.

**Horizontal placements truncate with a count**, reusing I8's existing wording: the entries
that fit, plus how many did not. **Vertical placements cap at a third of the width**, matching
`categoricalForm`'s existing bound, because T3.3's ladder holds — labels are dropped before the
plot area is starved.

---

## 3h. Colour is never the only channel — the rule I6 states and four forms break

I6 says series are never distinguished by colour alone, and it is scoped to *multi-series
plots*, which is why four forms satisfy it and are unreadable without colour anyway:

| form | every category draws | at 1-bit |
|---|---|---|
| `pie` | the same braille glyph | one undifferentiated blob |
| `waffle` | one `pairFor` pair for all segments | one solid block |
| `bar`, stacked | one `mark.filled` for every layer | no visible segment boundary |
| `radar` | the same stroke glyph per series | two polygons, indistinguishable |

**None of these is a multi-series plot in I6's sense** — a pie has *segments*, a stacked bar has
*layers* — so the invariant was true throughout and the pictures were still colour-only. I25
restates it over the thing that actually matters: **two things a reader must tell apart differ
by mark, not only by tone.**

`CATEGORY_MARKS` is a ladder of eight, matching the palette's cap, reached by `markOf(index,
caps)` beside the existing `refOf(series, index)`. **Not the shade ramp** — `░ ▒ ▓` encode a
value along an axis (§3c), and spending them on category identity is exactly the vocabulary
mismatch `ramp.ts` was written about. **The marks are named slots**, never literals at a call
site, for §3c's reason and SS47's.

**The gate is a sweep over `ONE_PER_FORM`, not an assertion per form**: render every member at
`colourDepth: 1` with two or more categories, strip SGR, and require at least as many distinct
glyphs as categories. A new form that ships colour-only fails on its first run without anyone
remembering this section exists.

**And the sweep is over the forms whose categories share cells, which is a correction measured
before it was built.** Run as written above, it fails nine forms that are right: `boxplot`,
`dumbbell`, `lollipop`, `dotplot`, `funnel`, `gantt`, `waterfall` and `ridgeline` each give a
category its own row **with its name in the gutter**, and a reader tells them apart by reading
it. I25 asks that two things a reader must tell apart differ by more than tone; a label is more
than tone. Requiring a distinct *glyph* there would mean drawing `lollipop`'s four categories
with four different dots for no one's benefit.

So the classification is `SHARES_CELLS`, a `Record<PlotForm, boolean>` — total, so the
thirty-fifth form declares which it is or does not compile — and it is the same partition the
legend needs in §3g, for the same reason: **a legend is load-bearing exactly where the gutter is
not.** One statement, two consumers.

**The positional family answers I25 a third way, and it is worth naming so it is not mistaken
for an omission.** Below the depth where colour separates its series, `positionalForm` stops
overlaying and falls back to `stackedRows` — one strip per series, each labelled in the gutter.
Two flat curves that would be one indistinguishable line at 1-bit become two named rows. That is
a *different chart*, not a degraded one, and it is the reason a per-series dash is not needed for
correctness. `plotMarks: "always"` is the field for wanting dashes anyway — on a colour terminal,
for a colour-blind reader, or on paper — and it widens what a form may do without narrowing what
it must.

---

## 3t. Colour indexes the series, never the row

§3h partitions the forms by whether a category needs a *mark*, and settles it with an argument
about the gutter: **a legend is load-bearing exactly where the gutter is not.** The same argument
answers the colour channel and was never carried to it. Every categorical form handed its rows
the palette in order, so a histogram's eight bins drew eight colours — one variable, one
distribution, eight identities claimed by a channel that had nothing to name.

**The rule it was following is in one code comment and no file.** *"A plain bar is one series
across N categories and the category **is** what a colour can name"* sits above
`categoricalForm`'s `refFor` parameter, written while fixing the grouped bar, and grepping
`docs/`, `src/`, `test/` and `tools/` for it returns that line and nothing else. It was true
about the defect it was written for — a grouped bar's row is a *(category, series)* pair, and
slot *r* named the row — and generalised from there on its own.

### Measured against the references, eleven renderings

`make refdiff`'s container already holds matplotlib 3.9.2 and seaborn 0.13.2, so this is a
measurement and not a recollection:

| rendering | distinct colours |
|---|---|
| `ax.bar`, five categories · `ax.barh`, four | 1 |
| `ax.hist`, eight bins | 1 |
| `ax.broken_barh`, four rows · `ax.eventplot`, three tracks | 1 |
| `ax.acorr`, nine lags | 1 |
| `ax.violinplot` · `ax.boxplot`, three bands | 1 |
| `sns.barplot` · `histplot` · `countplot` · `stripplot` | 1 |
| `sns.boxplot` · `violinplot`, three bands | 1 |
| two `ax.scatter` calls | **2** |
| `sns.boxplot(hue=x)`, three levels | **3** |

The cycle advances **per series**, and only per series. seaborn's `hue=` is the same statement
from the other side: mapping a variable to colour is something a caller asks for, and mapping the
*category axis* to it — `hue=x`, where `x` is already the x axis — is available, explicit, and
redundant by construction.

### The measurement is not the ruling, and reading it as one was the over-reach

**Colour indexes an identity.** That is the rule, and *the palette indexes the series* was a
first draft of it that took the references' default for the principle behind it. The two agree on
a histogram and part company on a box plot, which is where it was caught: the first form's rows
are **slices of a continuous axis** and the second's are **named things the caller chose**.

| the row axis | the rows | colour | forms |
|---|---|---|---|
| continuous, sliced by the renderer | `[15.4, 24.1)` · lag 3 | nothing to name — **one colour** | `histogram`, `autocorrelation` |
| a set of names the caller supplied | `control` · `Opex` · `Deploy` | an identity — **a slot each** | every other categorical form |

**The references draw both cases in one colour and that is a defensible taste this component does
not take.** matplotlib and seaborn have fill against edge, alpha, marker size and a wide canvas;
a terminal band is one row of glyphs in a narrow gutter, colour is the channel it has, and a
reader tracking `dose-b` across three bands is using it. The references' answer is a caller's to
ask for — a series carrying an explicit `tone` takes it, which `refOf` has always honoured.

What the measurement does settle, and what no taste reaches, is the first row of that table: eight
bins are one distribution and nine lags are one statistic, and there is no reading under which
either has eight identities. `ROW_IS_AN_IDENTITY` is the partition, `Record<PlotForm, boolean>`
and total, so the thirty-fifth form declares which it is or does not compile.

**Where a row is an identity, the slot is the row's; where it is not, it is `slotOf(0)`** — the
slot a single-series line, scatter or sparkline already takes, so a histogram and a curve of the
same data are the same colour rather than accidentally different ones.

### `SHARES_CELLS` is not the switch, and it reads exactly as though it is

The obvious move is to reuse §3h's partition — cells shared, colour separates; own row, the
gutter separates — and it does not survive being checked. `SHARES_CELLS` is `true` for `bar` and
`histogram`, and its own comment says why: *layers inside one bar*. Stacking is a property of a
**render** and that record is indexed by **form**, so a plain bar and a stacked one share one
entry and want opposite answers from it.

The switch that does work is already in the code and is not a new concept: **who owns the span.**
A row builder returning a `BandRow` declares owners and `ownedSpans` colours each run by its
owner — a stacked bar's layers, a ridgeline's overlapping curves. A builder returning a plain
string has no interior identities at all, so the only thing its colour could name is the row, and
the gutter has named it already.

### The classification table

Indexed by rule interaction — row identity × series count × span ownership — because a row
governed by one of the three restates that one and finds nothing:

| the row is | series | owners | what colour could name | before | ruling |
|---|---|---|---|---|---|
| **a slice of a continuous axis** — a bin, a lag | 1 | — | nothing | `slotOf(row)` | **`slotOf(0)`** |
| a named category, one series | 1 | — | the category | `slotOf(row)` | unchanged — `slotOf(row)` |
| a named category, n series across it | n | — | the series — but the row is one span | `slotOf(row)` | unchanged; the glyph pair separates the ends |
| a category, layers within it | n | yes | the layer | per owner | unchanged |
| a *(category, series)* pair | n | — | the series | `refFor(r mod n)` | unchanged |
| **a series** | n | — | the series | `slotOf(row)` | **its own `refFor`** |
| a series, curves overlapping | n | yes | the series | per owner | unchanged |
| a band whose data is `quartiles` | 0 | — | the band's name | `slotOf(band)` | unchanged |
| a column, one series | 1 | — | the column's name | `slotOf(col)` | unchanged, unless the axis is sliced |
| a segment in one figure | — | legend | the segment | `categoryRef(i)` | unchanged |

**Two rows are cells where two rules overlap, and they are the whole reason for the table.** A
grouped bar's row is both a category and a series — already handled, by a fix, recorded in the
comment that then made the general claim look settled. A timeline's row is *also* both: it
carries a track name in the gutter like a category and holds exactly one series like a curve.
**It is the only form this correction breaks, it breaks silently** — three tracks in one colour,
every count in the frame right — and the old default was accidentally correct there. It states
its own `refFor` now, on the seam the grouped bar already uses.

**The other cell the table exposes is under-coloured rather than over.** A dumbbell's row holds
two series and draws in one span, so `before` and `after` are separated by `●` against `○` alone
where the reference gives them two colours. That is a `BandRow` with two owners and it is not
built here — named so it is a known gap and not a silence.

---

## 3u. Layers meet in a cell, and the merge is per dot

`mergedRow` composites the layers a figure is drawn in — a pie's wedges, a radar's polygons
over its frame — and it resolved **a whole cell to the first layer that inked it**:

```ts
for (const layer of layers) {
  if (isBlank(candidate)) continue;
  cell = candidate; cellRef = layer.ref; break;      // ← the cell, to one layer
}
```

Every wedge is filled into its own dot grid and folded to braille before it arrives here, so a
cell the boundary crosses carries one wedge's dots and drops the other's. **The disc is fully
covered by construction** — the fractions sum to one, so every dot inside the radius belongs to
some wedge — and measured on `pie-default-40` there are **seven cells flanked by a full cell on
each side that are not themselves full**. That is the report *gaps appear between the slices*,
and the arithmetic was right throughout.

**The radar has it twice over and it reads as a different defect.** Its layers are
`[labels, …polygons, frame]`, so a polygon crossing another loses cells to it, and the frame is
drawn **only in the cells nothing else wanted** — the rings and spokes come out as fragments and
the polygons come out dashed. Neither is a dash: `dashFor` returns `SOLID_DASH` at any depth
above one bit. *Three symptoms, one rule, and the pie's own comment already named the mechanism
for an outline layer it deleted rather than for the general case.*

### The union, and the one thing it cannot fix

A braille cell is `U+2800 + bits`, so where every candidate for a cell is braille the merge is
`0x2800 | (bitsA | bitsB | …)`. Where any candidate is not — a radar's category labels are text
— the first-wins rule stands, because a letter and a polygon cannot share a cell and one of them
has to lose.

**The colour is still one layer's, and that is a limit rather than an oversight.** A `Span`
carries one `ColourRef`. So two wedges meeting in a cell draw both wedges' dots **in the first
wedge's colour** — the priority order is unchanged, and what the union removes is the *gap*, not
the boundary's exactness. A reader sees a seam a cell wide where the colour changes one cell
early or late; they no longer see a hole. Stated here because *the gaps are fixed* would imply
the stronger thing, and the stronger thing needs a per-dot colour the span model does not have.

### Where that paragraph was generalised past its case

Every sentence above is true **about a pie**, and the paragraph was written as though it were
about layers. It is not: it is about layers that meet along a **boundary**. Two wedges share a
one-dimensional locus, so "a seam a cell wide" is the whole of the cost and the union is free.

**Two curves do not meet along a boundary — they can run alongside each other for their whole
length**, and there the same union draws one series' ink in another series' colour by the
hundred. Measured, and each figure is the catalogue's own:

| figure | what the union does |
|---|---|
| `slope-default` | 11 cells carry two series; **25 of the dots drawn in them belong to a series other than the one whose colour they wear** |
| `radar-default` (braille) | **70 of the 279 frame cells wear a series slot** — the grey rings, drawn in orange and blue |
| `radar-line` (quadrants) | 80 of 98 cells wearing a series colour are frame; 53 of them thicker than the frame's own glyph |

The radar is the worst of the three and the reason is structural: **a value ring and a data
polygon are the same shape at different radii**, so they do not cross at points, they run
parallel. There is no locus small enough for "a seam a cell wide" to describe.

So the report *the grey radar lines are getting coloured blue and orange* and the report *the
orange bleeds onto the blue and green lines* are one mechanism, and it is this paragraph
believed one form too far. **The observation was right and the scope was inferred** — the pie
was the only figure it had been measured against.

### The partition is what the layer is, not which form drew it

A `Layer` declares a `kind`, required rather than defaulted so a ninth layer has to say:

| kind | what it is | ink where two meet | tone |
|---|---|---|---|
| `"surface"` | part of one filled figure — a pie's wedges, a stack's bands | **union** | the topmost's |
| `"curve"` | a peer and the subject — a series, a radar polygon | **union** | **neutral** |
| `"context"` | drawn behind — a radar's frame, an annotation's rule | **occluded** | the layer in front |
| `"label"` | text | **occluded**, in both directions | its own |

**Occlusion was the first answer and it is right only across kinds.** Hiding a gridline under a
line is what *in front* means, and nothing is lost: the frame is a regular shape a reader
completes. Hiding a *series* under another series answers **where did this one go** with
**nowhere** — measured on `slope-default`, blue and green vanish for a stretch of the crossing,
which is the one part of a slope chart that is the content. *A gap and a lie are not the same
cost, and neither is the price that has to be paid.*

**A cell holds one colour, and that never meant a *region* holds one colour.** Both wrong answers
came from reading the constraint at the wrong scale: occlusion gave all eleven contested cells to
one series, and a neutral tone gave them to none. **Which peer owns a contested cell turns with
the column.** Each cell then holds one series' dots in that series' own slot, and each line runs
through the overlap as a dash instead of a hole or a grey patch.

| rule | ink | tone | `slope-default` |
|---|---|---|---|
| union, first wins | complete | series 0 | **25 dots wearing another series' colour** — the reported bleed |
| union, tone by dot majority | complete | the denser | the same picture; a rising line is denser than a flat one |
| occlude by layer order | **deleted** | true | south and east absent through the crossing |
| union, neutral tone | complete | **names neither** | 11 grey cells; no line identifiable there |
| **rotate by column** | a dash each | **true** | **125 / 119 / 122 of 134 dots kept in their own colour · 0 mistinted · longest absence 3 columns** |

*Three lines genuinely occupy those cells — at 10 rows over a range of 26 they are inside two dot
rows of each other — so something has to give. What gives is a third of the cells each, and not a
line.*

**A surface's boundary does not rotate, and that is measured rather than assumed.** A wedge is
not a line whose continuity matters — it is a region, and its neighbour's ink is the same
substance. Turning the boundary cell between them draws a stipple along every seam, and the
neutral it replaced was worse: at ten segments the small wedges contest cells with *both*
neighbours and a whole sector of `pie-many-segments` comes out grey. Surfaces union and the
boundary keeps the topmost wedge's tone. *The partition of a disc is arbitrary; the partition
between two series is the reading.*

**The frame no longer survives a polygon crossing it, and that is the ruling and not a
regression.** `LM3`'s dot-containment row asserted the opposite and was right about the union it
was written against. What replaces it is the pair of properties this rule actually has, and they
are the two failures stated as assertions:

- **nothing is mistinted** — a cell wearing a series' slot holds that series' ink and no other's;
- **no peer is dropped from a contested region** — where *n* peers contend over a run of cells,
  each is drawn in roughly one in *n* of them, so none is absent from the run.

*If it is orange, it is north — and north is somewhere in every stretch north goes.*

**The known cost, stated because it is real**: a line is dashed through an overlap, at a duty
cycle of one over the number of lines sharing it. **The first of those two rows is what the
suite was missing**, and its absence is what licensed a deletion: `LM6` asserted *no cell draws
another series' ink*, which deleting the other series satisfies perfectly. One of two opposite
failures asserted leaves the other one free.

**The priority order is what the ref still expresses**, which is why it is worth keeping rather
than replacing with *the layer owning the most dots*: the radar's order is a ruling — labels over
polygons over frame, because a word a polygon runs through is unreadable — and reading it off dot
counts would put the frame above a polygon wherever the frame happened to be denser.

---

## 3v. More than one histogram, and the edges they have to share

A histogram bins one series and stopped there: `binValues(block.series[0].values)`, with series
2..n reaching nothing. **The edges are the whole of what makes this more than a loop.**

**One edge set over the union, and separate edges is the defect C12 I35 already names one form
along.** Binned on its own extent each series fills the width, so two distributions with different
spreads draw the same picture and the comparison the plot exists for is gone — which is exactly
what a violin does when each band is scaled to itself. Measured against the reference:
`ax.hist([a, b], bins=8)` returns **one** edge array spanning the union and one count array per
dataset; `ax.hist(a, bins=8)` alone returns edges over `a` only.

**The strategy's inputs are the union's too**, because the edges are: Sturges reads `n` and
Freedman–Diaconis and Scott read a spread, and answering them per series would choose a bin
*count* for edges that are not that series'.

### `layout: "overlap"` cannot mean *draw the first one*

The default layout drops every series after the first, and a bar has done so all along:

```
  a ┤████████                     10│ █ first
  b ┤████████████████             20│ █ second
  c ┤████████████████████████     30│
```

**Two series, one drawn, and the legend names both** — so the picture does not merely omit the
second, it asserts it is there. C12 I8 says a series is never dropped silently and the *grouped*
arm carries a comment about being fixed for exactly this; `overlap` is the same defect one arm
along, and a histogram inheriting it would ship it wider.

**There is no overlapping picture a bar can draw.** Two runs superimposed in one row of cells is
one run, so the name describes a thing the vocabulary does not have. So `overlap` with more than
one series **means grouped** — for the bar and the histogram alike — which is also the reference's
default: `ax.hist([a, b])` draws them side by side per bin.

### The four layouts, and where the vertical arm was short

Binned, a histogram *is* a bar chart of counts, so the drawing is the bar's and all four layouts
arrive together rather than being invented here. One row per bin becomes one row per *(bin,
series)* pair under `grouped`, category-major, which is the arm the bar already has.

**The vertical arm needed the parameter its transpose already had.** `categoricalForm` takes a
`refFor` precisely so a grouped bar's rows take their *series'* colour rather than their row's —
the fix recorded in its own doc — and `categoricalColumnForm` never got one, so N×S column bands
would have drawn in one colour with the legend naming S. It takes one now, and the two arms say
the same thing in the same way.

**A series with no finite values keeps its bands.** It contributes no counts and drawing nothing
for it would renumber the groups, so the bin a reader is looking at would hold different series in
different bins.

---

## 3w. Three styling forks, and which arms a form has

`plotStyle` was a union every form shared and two forms read, with `candlestick` refused on a
form that cannot draw it by a clause naming that style. **The clause was right and the shape was
a special case**: every style is a style some forms have an arm for and others do not, and a
second one would want a second clause.

`STYLE_ARMS` is that shape as data — `Record<PlotForm, readonly PlotStyle[]>`, total, so the
thirty-fifth form declares its arms or does not compile — and the refusal is one rule over it.
`candlestick` on a `bar` is refused by the record rather than by a sentence about candlesticks.

`plotFill?: "none" | "solid"` joins `plotFrame` / `plotCorners` / `plotDetail` / `plotMarks`:
a union in the same family, for the same reason those are.

### The table

| the fork | what changes | what does not |
|---|---|---|
| violin `plotStyle: "braille"` | the outline is strokes in the **dot grid** — 2×4 per cell, which is where the smoothness comes from | **the geometry.** I39's odd extent, §3i's rungs and the budgets are the figure's, not the vocabulary's |
| violin `plotFill: "solid"` | the dots between the two edges are set | the box and the summary marks, which stay cell-resolution and composite **over** the fill |
| pie `plotStyle: "solid"` | wedges are `█` at cell resolution — coarser, and with no inter-dot gaps at all | the wedge arithmetic, the legend, the minimum-fraction rule |
| radar `plotStyle: "line"` | **the whole figure** — boundary, rings, spokes and polygons, in **quadrant blocks** | the geometry, the ceiling, the legend; and `plotStyle` still names *what*, never the alphabet |

### Two rulings the table does not carry

**A fill is the braille arm's and the line arm refuses it.** A box-drawing outline has no
interior vocabulary: filling `╭──╮` means putting `█` inside it, which is a *third* figure — an
outline in one alphabet around a body in another — rather than the same figure filled. Refused at
construction, both gates, rather than ignored, because an ignored member reads as one not yet
implemented.

**A solid pie degrades to braille at `colourDepth: 1`, and it degrades rather than refusing.**
The hatch ladder is the one-bit identity channel — `CATEGORY_PATTERNS` exists because a wedge with
no colour needs a mark — and a block glyph has no hatch to carry, so a solid pie at one bit is an
undifferentiated disc. **Degrade and not refuse** is I18's precedent exactly: where the capability
cannot spare what a figure needs, the honest answer is the thing that fits, not an error the
caller could not have avoided. A caller who asked for `solid` on a colour terminal has asked for
nothing wrong.

### What the line-drawn radar costs, stated where a reader meets it

I40 unions the dots where two layers ink one cell, **and the union is a surface's alone** (§3u) —
so neither arm draws both polygons where they cross. The nearer layer keeps the cell and the
further loses it, at 2×4 in the braille arm and 2×2 in this one. The line arm's cost is the
coarser of the two, which is the trade the alphabet already made.

#### The radar's line arm took four alphabets, and the fourth is the one that connects

**§3c's rule is what this ended up proving**: *a renderer names an axis, never a vocabulary*.
`plotStyle: "line"` says **draw this as a connected line**; which glyphs do it is the renderer's,
and three of them could not.

| attempt | what it fixed | what it left |
|---|---|---|
| `strokePolyline` | — | steps orthogonally, and every edge of a pentagon is oblique: a staircase |
| `╱` / `╲` slots and a per-cell stroke | the shape — **a pentagon in isolation is clean** | composed, rubble |
| one grid, an owner per cell | the composition — no merge at all | **still dashes** |
| **quadrant blocks** U+2596–U+259F | the alphabet | — |

**The second failure is I40's stated limit arriving.** `mergedRow` unions braille and resolves
everything else first-wins, so the labels, the polygons and the frame each took cells from the
others. *A clean pentagon rendered alone beside fragments rendered together* is what separated the
stroke from the merge — the same input, two answers.

**The third is the one that settles the alphabet.** `╱` U+2571 and `╲` U+2572 are *strokes inside a
box* and do not reach their cell corners, so a run of them renders as dashes whatever the geometry
upstream does. The quadrant blocks are **filled sub-cells**: consecutive cells touch because each
is a solid rectangle. Half braille's vertical resolution and the same horizontal, traded for
coverage — which is the right trade for a **shape**, where braille's is right for a *curve*.

The composition stays the third attempt's: one grid, an owner per sub-cell, no merge. *Data takes
the tone over furniture, and `Math.max` gave it the frame:* `furniture` is `series.length`, greater
than every series index, so a polygon crossing a ring lost its colour cell by cell.

**"A cell can carry two shapes in different quadrants while its tone is one layer's — and it bites
less at 2×2 than at 1×1, because the glyph keeps both and only the tone is chosen" is what this
paragraph used to say, and the measurement is the other way round.** Of the 98 cells wearing a
series colour, **80 are frame** and 53 carry a fuller glyph than the frame's own. Keeping both
shapes is what makes it worse, not better: the quadrant is a *filled rectangle*, so a frame
sub-cell drawn in a series colour is four times the ink of a braille dot doing the same thing.
The reader sees the pentagon go orange.

A cell is one layer's, and draws only that layer's sub-cells — labels, then later series over
earlier, then the furniture (I44). It is §3u's occlusion rule at 2×2 instead of 2×4, and the two
arms did not agree on it until they were measured side by side.

#### A form has arms; a *routine* has arms, and `STYLE_ARMS` answers at the wrong granularity

`STYLE_ARMS` is `Record<PlotForm, readonly PlotStyle[]>` and it says `violin` has a braille arm.
**A violin has five drawing routines and one of them had it.** Measured, by rendering each with
and without the style and asking whether the frame changed at all:

| the arm | before | after |
|---|---|---|
| horizontal, full density | honoured | honoured |
| **vertical, full density** | **ignored** | honoured |
| **horizontal raincloud** (`compact`) | **ignored** | honoured |
| **vertical raincloud** | **ignored** | honoured |
| **raindrop** | **ignored** | honoured |

**Accepted at construction and ignored at render is the worst of the three answers** — worse
than refusing, which tells the caller, and worse than degrading, which tells the reader. The
record is keyed by *form* and the arm belongs to a *routine*, so a total record over forms reads
as a complete answer to a question it cannot ask.

**The vertical arm gets it, because it is the same figure stood up.** `violinRows` samples the
density at `2w` dot columns and offsets in dot rows; transposed, the value axis runs down the
band so it is sampled at `4n` dot rows and the width is offset at 2 dots a cell. *The two arms
gain different things and §3w had said only "smoothness": lying down the finer axis is the
**offset**, so the outline's shape sharpens; standing up it is the **sampling**, so what sharpens
is how often the density is asked.*

**The raincloud rungs get it too, and the argument for skipping them was wrong on one axis.**
Their cloud is one cell row drawn with `ladderFor("height")` — `▁▂▃▄▅▆▇█`, eight levels — against
braille's four dot rows, which reads as half the resolution and is not. **The budgets are equal
and the split is different**: a cell holds eight braille dots as 2 × 4, so the ladder spends all
eight on magnitude at one sample a cell, and braille spends them as five magnitude levels at
**twice the sampling** along the value axis. *Comparing the vertical axis alone is what made a
trade look like a downgrade* — the same error as reading a limit off the case that produced it.

So both ship, which is what a styling fork means. The horizontal cloud is a bottom-anchored
stroke over `2w` dot columns, filled to the floor rather than out from a spine, because the
ladder it replaces is bottom-anchored and two rungs of one figure must anchor the same way. The
vertical cloud is that stood up: anchored on the right edge, growing left, which is
`extentFor(caps, "leftward")`'s direction expressed in dots.

#### The grid takes the data's shape, and the two arms did not agree on it

`plotGrid?: "polygon" | "circle"` — the shape of the radar's value rings and outer bound.

**The arms disagreed and neither said so.** The braille arm drew the rings with `arcDots`, so
they were circles; the quadrant arm drew them as *n*-gons through the same vertices the data
uses. One form, two figures, and nothing in the spec chose between them — the difference was a
consequence of which routine each arm reached for.

**Polygon is the default, because the grid is a scale for the shape drawn against it.** At three
categories a circular ring behind a triangular polygon is two figures in one frame, and the
reading a radar asks for — *is this axis further out than that one* — is made against the ring.
A ring the data can touch at only three points is a worse ruler than one it can touch along its
whole length. At ten categories an *n*-gon and a circle are within a dot of each other, so the
default costs nothing where the argument for it is weakest.

`"circle"` stays because it is matplotlib's default and refdiff compares against it, and because
a reader who thinks of the axes as samples of a continuum rather than as a fixed set wants the
continuum drawn. *Both ship; neither is inferred from the category count, because a figure that
changes shape at some threshold is two figures with one name.*

#### The frame is continuous, and the stipple was answering the wrong question

The rings stepped every fourth dot and the spokes dashed two-on-two-off, on §3g's rule that *a
scale drawn as heavily as the data competes with it*. That is an argument about **weight** and it
was answered by leaving **holes** — and a stippled ring does not read as a lighter ring, it reads
as a broken one. The frame is `tone.muted` and the polygons carry their series' slots, so the
separation is already there and the scale can be a scale.

`arcDots` took a `spacing` in dots and every call site passed the same constant once the stipple
went, so the parameter is gone with it. **A knob nothing turns is a knob the next reader has to
check** — and its comment still described the four-dot step and the ninety-cell disc it was read
off, which is a justification for a mechanism that no longer exists.

That is the same trade the pie makes in the other direction — a solid pie has no seams and a
braille pie has no gaps — and it is why both are shipped rather than one being chosen. *Neither
is better; they fail differently, and a reader who knows which failure they are looking at can
pick.*

---

## 3q. One value axis across the bands, and the record it never had

**This section is written because three code comments cite it and it did not exist.** The
ruling is real, it was a defect three times, and its only record was the comments naming a
section number — which is the sixth blind spot arriving on a *section* rather than on a claim:
a citation reads as a source, and going to find it turns up nothing. `make enforce` resolves
`C12 I34` and does not resolve `C12 §3q`.

**A categorical distribution form scales every band to one axis, and the caller's pin is what
that axis is.** Scaled to its own extent, a tight distribution and a wide one draw the *same*
shape — the figure fills its band either way — and comparing the categories is the whole of
what a violin, a raincloud or a ridgeline is for. Three violins of very different spread came
out as three identical shapes, and every count in them agreed.

```
own extent          shared axis
 ╭────────╮          ╭╮
╭╯        ╰╮        ╭╯╰╮            the same two distributions, and only the
╰╮        ╭╯        ╰╮╭╯            second says one is four times the other
 ╰────────╯          ╰╯
 ╭────────╮        ╭──────────╮
╭╯        ╰╮      ╭╯          ╰╮
```

**Three instances, and they were three because the fix is per call site.** `ridgelineArea`
composes the whole area and had it; `violinRows` and `violinColumn` each computed their own
`lo`/`hi` from their own band, and each had to be given the shared range separately. A rule
that has to be applied N times is applied N−1 times eventually, which is why it is here rather
than only in the code that got it right.

**Where the caller has no pin the axis is the union of the bands**, which `seriesRange`
already computes over every series — the same function and the same argument the heatmap makes
in §6a A6, one form along: one range over the whole thing is what makes it a comparison rather
than a stack of unrelated figures.

**The cut is what keeps a shared axis readable.** A kernel estimate is defined everywhere, so
across a shared axis it returns a near-zero density far outside its own data and draws a pair
of flat lines to the frame's edge — three violins with infinite tails. seaborn's `cut` stops
the estimate two bandwidths past the extreme datapoints, and the spine still runs the full
width because it is the axis and the marks sit on it.

---

## 3r. `plotStyle: "candlestick"` — a curve style, not a thirty-third form

A candlestick shares everything a line plot has: the value axis, the grid, the axes, the
annotations, the legend, the crosshair. What differs is **what one column draws**. So it
belongs beside `braille` and `line` in `plotStyle`, and `form` stays `line` or `step`.

**Its data is not a series and gets its own field**, on the precedent `quartiles` and
`hierarchy` set (C04 I53 and C04 I54): four series in a declared order is a convention nothing checks,
and the first caller to pass them in the wrong order gets a chart that renders. That is C04
I57.

```
│   wick only            ┃   body, filled         ▯   body, hollow
┿   body and wick        ─   doji, open = close
```

Five marks, and the table below is what maps them onto direction. An earlier form of this listing
carried a sixth, `▓`, which no arm of that table ever reaches — **a vocabulary is what the table
spends, and a glyph in the list and in no cell is a glyph nothing can draw.**

### Bullish and bearish are two categories, so §3b binds

Colour leads — green and red by convention, but through the palette and never as a literal —
and where colour is gone the **mark** carries it. Hollow for bullish and filled for bearish is
what print charts did before colour, so the fallback is the older convention rather than a new
invention.

| | body, bullish | body, bearish | wick | doji | both |
|---|---|---|---|---|---|
| unicode | `▯` hollow, up tone | `┃` filled, down tone | `│` | `─` | `┿` |
| 1-bit | `▯` hollow | `┃` filled | `│` | `─` | `┿` |
| ASCII / wide | `=` | `#` | `\|` | `-` | `+` |

**The mark carries direction at every depth and colour reinforces it**, which is a change: an
earlier form of this table gave `┃` in two tones above 1-bit and reserved hollow-versus-filled for
the monochrome rung. Two measurements moved it, and neither is taste.

**I25's sweep cannot see this style.** It iterates `ALL_FORMS`, reads `SHARES_CELLS[form]`, and
renders `ONE_PER_FORM[form]` — so for `line` it draws a plain multi-series block and passes on
`markOf`'s ladder. A candlestick *is* `form: "line"`, and rising versus falling is a pair of
categories sharing every cell that the fixture never contains. **The one rule written to catch a
tone-only distinction runs, passes, and is about a different document** — so a design that leans
on being caught by it is leaning on nothing.

**And the repository's own frame-read strips colour.** `docs/catalogue/*.plain` is what the
scheduled read looks at, and a distinction carried only in the tone is invisible there — the
instrument CLAUDE.md names first would be reading a chart in which every candle is `┃`.

Hollow-versus-filled at every depth is also what print did before colour and what the reference
implementations still do, so the older convention is the fallback *and* the default rather than
only the fallback. The ASCII arm already distinguished by mark at every depth; this makes the
unicode arm agree with it instead of branching one rung down.

### There is no sub-cell win, and the two rulings that would give one are incompatible

An earlier form of this section claimed a body resolves to a quarter of a cell down the column —
the axis a terminal chart would beat a raster one on if it could. **It cannot, and this section's
own glyph table is what forecloses it.**

A body floats between open and close rather than growing from a baseline, so **both** its ends
fall inside a cell. Unicode's vertical eighths are a complete ladder upward — `▁▂▃▄▅▆▇█` — and
there is no matching ladder downward: `▀` and `▔` are the whole of the upper repertoire, a half
and an eighth. A body's bottom edge could therefore be placed to an eighth and its top edge could
not, which is precision at one end only and reads as precision at both.

Braille resolves both ends to a quarter, and braille is what the next section rules out — and has
to, because two dot columns cannot draw a hollow body. **So the body is drawn at cell resolution**,
as every reference implementation draws it, and what this component has that they do not is the
aggregation rule above: exact where a curve's downsampling approximates.

*Corrected rather than deleted, because the claim named a mechanism and the record should say the
mechanism was looked for* (CLAUDE.md — a ruling that names an operation owes a check that the
operation exists).

### The candle's width is a layout rule, not a glyph

One column per sample reads as a barcode. plotext reads as a chart because a candle is two or
three columns with the wick centred, and `⌊areaWidth ÷ n⌋` makes the answer vary with the
terminal — so the rule is stated rather than derived:

```
candleWidth = clamp(⌊areaWidth ÷ n⌋ − 1, 1, 5)         the gap is taken first
pitch       = min(⌊areaWidth ÷ n⌋, candleWidth + 1)    uniform, leftover on the right
the wick is centred, so an odd width — at an even one the wick sits left of centre
```

**The gap comes out of the slot before the body does, and the first frame is what settled it.**
At `⌊areaWidth ÷ n⌋` exactly, adjacent candles touch — and two rising candles side by side draw
`▯▯▯▯▯▯`, which is one six-cell body and not two three-cell ones. Every count in that frame
agreed and the figure said something false, which is `boxplotColumn`'s recorded reason for
narrowing to three fifths arriving on the form next door.

**The pitch is uniform and the leftover sits on the right**, which is the left-alignment ruling
below rather than a second rule. Distributing the remainder a cell at a time — what
`categoricalColumnForm` does — put four bars one every eleven cells across a forty-four column
area, a layout that says the four samples span the window.

**The wick's placement at an even width has to be said**, because *centred* has no answer
there and both roundings look deliberate. Left of centre, which is `⌊(w − 1) ÷ 2⌋` and the same
rounding `boxplotColumn` already uses for its spine — one rounding rule in the component
rather than two that agree by accident.

`categoricalColumnForm` already distributes a remainder across columns, which is the same
arithmetic `facetWidths` uses, so the gap is spent from that budget rather than computed twice.

### Fewer candles than columns, and more

**Fewer: left-aligned, padded right**, which is I13's ruling and not a new one — a series three
samples in reads as *three samples so far, growing rightward*, rather than as a chart that will
change shape as it fills. Time runs left to right and the right-hand end has not happened yet.

**More: the candles aggregate rather than being sampled**, and this is the one place a
candlestick has an answer a line plot does not. Downsampling a curve picks or averages;
downsampling OHLC is exact — `open` of the first, `high` of the maxima, `low` of the minima,
`close` of the last. The aggregate **is** the true candle of that period, so a five-hundred-bar
series in seventy columns is not an approximation of the chart, it is the chart at a coarser
period. Dropping bars instead would lose exactly the extremes the form exists to show.

### Not swapped to braille — and `glyphs()` already answers the wide arm, which is not the same question

`┃` `▯` `│` `─` `┿` are all `East_Asian_Width=Ambiguous` — measured, one cell narrow and two wide
— where `=` `#` `|` are one cell always.

**Every other vocabulary in this component swaps to braille at `wide` and this one does not**,
which needs its reason stated or it reads as the omission `pairFor` already was (F176). A bar's
length **is** its value, so doubling every glyph doubles the value, and all four swap — measured:
`ladderFor` to `⡀⣀⣄⣤⣦⣶⣷⣿`, `pairFor` to `⣿⠄`, `extentFor` to `⣿`, `markOf` to `WIDE_MARKS`. **A
candle's glyph carries open, close and direction; its *column* carries the time**, so a wider
glyph corrupts nothing — and braille could not draw a hollow body in two dot columns anyway.

**It does not follow that a wide terminal fits half as many candles**, and an earlier form of this
section said so. The candle draws from `glyphs(caps)`, and `glyphs()` returns the **ASCII** set at
`ambiguousWidth: "wide"` — its own ruling, with its own reason: furniture drawn at twice its
measured width stops being a frame. So the wide arm is `= # |` at one cell, the column count is the
same at every capability, and the two arms differ in their glyphs rather than in their shape.

**Two different things were both called *the wide arm*** — the ramp's braille swap in `ramp.ts`
and `glyphs()`' ASCII swap in `glyphs.ts`. The ruling against the first is right; the consequence
was drawn as though the second did not happen. It would have shipped as a layout rule whose floor
of one cell is unreachable at `wide`, the narrowest ambiguous glyph being two — a contradiction
between two paragraphs of one section, each correct about its own half.

The arithmetic is in cells regardless, measured with `cells()` (A03 SS23), and **the golden frames
still carry both ambiguous widths for this style** — now to assert that the two agree rather than
that they differ.

### The readout has no column marker, and that bounds what it disambiguates

**Measured while building it**: `cursorPositions` is read in one place, and all it selects is
`axedWithCursor`, which appends a readout row. **Nothing marks the cursor's column in the plot
area** — there is no crosshair, for a candlestick or for any other form.

So the readout tells a reader *what this mark is* — four numbers with `O` equal to `C` is a
doji, and a series value beside them is the overlay — and it does not tell them *which candle*.
That is a pre-existing property of every positional form here rather than something this style
introduces, and it is written down because §6b B5's ruling leans on the readout and a ruling
should say how far its support reaches. Roadmap work, not this section's.

### The readout is what disambiguates the doji, so it is load-bearing

At the crosshair a candlestick reads `O 12.4  H 13.1  L 12.0  C 12.9`, then each overlay
series after it. That is not a convenience: a doji draws `─`, and a moving average crossing
that column draws `─` too, so one glyph has two sources. **Not a defect** — a candle whose open
equals its close *is* flat, and so is the line through it — and the only thing that tells a
reader which is which is the readout. `cursorReadout` is therefore part of the style rather
than furniture beside it.

---

## 3s. The cursor's column — what C12 owns of a crosshair, and what it does not

A readout naming four values says *what this mark is*. It does not say **which** mark, and
§6b B5's ruling — *the readout is what disambiguates a doji from an overlay line* — leans on the
reader knowing which column it describes.

### The seam, measured rather than assumed

`cursorPositions` is declared on `RenderContext`, threaded through `render-lines.ts`, and read in
**one** place: `positionalForm`, which selects `axedWithCursor`. **Nothing in `src/` or
`examples/` writes it.** So this is a complete mechanism with nothing on the other side — the
shape MG24 exists for, on a context field rather than an interface member, which is why no rule
fired.

**§10 lists *interactive plots — zoom, crosshair, hover* as Phase 2, and that row is about the
writer.** Who moves a cursor is L4's question: a key press, a mouse column, a hover. What a
cursor *draws* once something has set it is C12's, and C12 has answered it since `cursorReadout`
shipped. Completing that answer is maintenance of a surface already here; it does not move the
phase boundary, and §10's row is reworded to say which half it defers.

### Two marks, because either alone fails in the case that motivates it

**A dashed vertical behind the data**, at the cursor's column, composited through the same
`behind()` path the gridlines use — so it never overwrites a sample and shows in the gaps.
`dashedVertical` is already the slot for *a reference line drawn beside data*, and its comment
gives the reason: a solid rule through a figure reads as part of it.

**And a mark on the bottom rule** at the same column. The dashed line alone is invisible exactly
where a reader most needs it — a dense candlestick at one cell per candle fills every row of its
column — so the rule row carries `▲`, below the data and above the readout text it explains.

### Which column, which is the part that can be silently wrong

The cursor indexes the **data**, not the area, which is what `cursorReadout` has always assumed:
it reads `series[i].values[cursorIdx]`. So the mark's column is whatever that index maps to, and
the mapping is the form's rather than one rule:

```
a curve       round(i ÷ (n − 1) × (areaWidth − 1))    `columnsOf`'s placement
candlesticks  bucket(i) × pitch + wick                the candle layout, through the aggregation
```

**Measured, because the obvious guess is wrong about which case diverges.** The aggregation
threshold is where the two mappings *agree*: at one cell per candle filling the area, `⌊i × n ÷
bars.length⌋ × 1` and `round(i ÷ (n − 1) × (w − 1))` land on the same column. What separates them
is **the sparse end** — a candle sits at a fixed pitch and is left-aligned (C12 I13), where a
curve stretches its samples across the whole width:

```
44 columns   4 bars    last bar: candle column 20, curve column 43     23 cells apart
             8 bars    last bar: candle column 36, curve column 43
            20 bars    middle:   candle column 20, curve column 23
            44 bars    middle:   candle column 22, curve column 22     they meet here
           120 bars    middle:   candle column 22, curve column 22
```

So a marker placed by the curve's rule points into blank space to the right of the last candle,
which is worse than no marker. The aggregation still has to be inverted — `⌊i × n ÷
bars.length⌋` — but it is the *pitch and the left-alignment* that make one rule insufficient.

Out of range — a cursor past the data — draws **neither** mark, which is the same statement the
readout's four dashes make.

---

## 3p. Aspect, reflow, and a deferral whose blocker expired

**A cell is about one column wide and two rows tall, and exactly one file knew
it.** `circle.ts` compensated — `rx = 2·ry`, which is why our pie is round where
granite's is an ellipse — and `waffle.ts` did not, so its 10×10 grid rendered ten
wide and twenty tall: a tall rectangle where a mosaic belongs. Same terminal
geometry, two answers, one file aware of it. `aspect.ts` is the one place now.

Not a capability, deliberately: the ratio is a property of monospace text rather
than of a terminal's declared features, no escape sequence reports it, and a font
where it did not hold would break every box-drawing figure long before it broke a
waffle.

### `height: "fill"` — the condition was met and nothing was watching

Roadmap 38 blocked it on *the producer cannot see the height — that is F37*, and
`ProducerContext.height` was granted by phase 1: non-null **exactly** when the
document is bound by a region, which is the case the entry names. The condition
was written where the deferral is and the thing that met it was written somewhere
else, which is that pattern's whole shape and its third instance here.

**It does not weaken I1**, and that is why `fillHeight` is a helper rather than a
`Plot` field. The *producer* resolves the number before the block is constructed,
so `measure` still sees a declared height and `series` stays structurally
unreachable from `plotHeight`. I1 forbids the renderer deriving height from data,
not the number being chosen late.

### What the reflow sweep can and cannot see

`P8` renders every form at twenty-six widths and asserts two things. Only one of
them is live, and the difference is worth stating because an unrecorded limit
reads as strength:

| mutation | caught |
|---|---|
| `composeRows` returns one row short | **58 rows** |
| `line` clamps to `width + 1` | no |
| the gutter's ⅓ cap removed | no |
| `plotAreaWidth` wrong above 100 | no |

**The width assertion cannot fail there**, because `renderToLines` clamps every
row to the frame's width *after* C12 has run: a plot emitting an over-wide row is
corrected downstream and arrives at exactly `width` however wrong it was. T2.3
makes the same assertion with the same guard above it. What would make it live is
C12's own rows before the pipeline, which `FORM_ROWS` does not publish — and a
frame read is what finds a wrong area width today.

---

## 3o. `matrixAnchor` — where a matrix puts a row shorter than its width

**The reported defect, and the code read back**: *AXES | MASSIVE GAP OF NOTHING
| HEAT MAP*. `columnMap`'s `"window"` arm emits `null` for the first
`width − count` columns when there are fewer readings than cells, and `null`
resolves to a blank — so the frame is the gutter, a long run of nothing, and the
matrix jammed against the right edge.

**There is a real argument for it and it loses.** A `heatmap` of arriving
readings gains something by keeping the newest at the right: the column a reading
occupies does not move every tick, and a matrix whose columns shift is harder to
read across time. That is true, and it is worth less than the width — a fringe of
blanks is the defect that got reported, by someone looking at a heatmap and not at
a confusion matrix.

So **every matrix stretches by default, feeds included**, and a caller who wants
the anchor asks for it. That also puts the choice with the person who knows they
need it, rather than with a table that guessed from the form's name.

| value | shape | for |
|---|---|---|
| `stretch` *(default, every form)* | columns spread across the full width | anything, and the answer when nobody has chosen |
| `window` | newest at the right, blanks at the left | a live feed, where a column must not move |
| `left` | grows from the left, scrolls once full | a feed being read as history |

`MATRIX_LAYOUT` keys by `PlotForm` and is **total**, so a new matrix form
declares its own answer rather than inheriting one nobody chose — it was
`Record<string, …>` and `utilisation` fell through it silently, which is the
class the four silent tables were about.

**The shipped catalogue fixture hid it**, over-filling the width with 90 readings
into 72 cells, so no rendered frame showed the defect that was reported. `sparse`
exists for that reason and is why the fix is checkable.

---

## 3n. Containment — `flame`, `icicle`, `treemap`

**`flame` and `icicle` shipped as `barRow` with the labels suppressed**, so they
were a bar chart and a reversed bar chart: correct in every count and about
nothing. A flame graph's whole content is that a frame *sits on* the one beneath
it and spans a sub-range of it, and a bar chart has no way to say either. C04 I54
is the field; this is what the three do with it.

**Two layouts, not three.** `strips` places the tree on the unit interval by
depth and `tiles` places it in the unit square, because what the forms disagree
about is how a subtree occupies space — and `flame` and `icicle` disagree only
about which way is up. `inverted` is the whole of the difference.

**Containment is structural.** Children divide their parent's span in order and
in proportion, so a child is inside its parent for every input rather than for
the ones somebody tested. A node's extent is `max(own, subtree)`: a parent
stating less than its children sum to is ordinary in profiling data — self time
against total — and taking the stated value would draw the children outside it.

### The treemap is squarified, and padded where it can afford to be

Slice-and-dice produces long thin slivers whose areas the eye cannot compare,
which is the one thing the form exists to let it do. So the layout is Bruls,
Huizing and van Wijk's: children laid along the shorter side, a new row started
when the worst aspect ratio would get worse.

**And children are inset by a cell where the rectangle can spare it.** Filling the
parent exactly is arithmetically right and draws a *mosaic* — the leaf areas are
correct, the siblings are adjacent, and nothing says which belong together. The
padding ring is the parent showing through, and it is the only nesting cue that
survives a two-cell tile; there is no border vocabulary that does. Skipped where
the rectangle cannot afford it, because a tile shrunk to nothing reports an area
of zero.

A frame's label is written inside it where it fits and dropped where it does not.
Three characters of a symbol name is not a shorter name; it is a different one,
and the strip's extent is the datum either way.

---

## 3m. `bandwidth` — the rule of thumb has a known failure and no better default

Every kernel density in this component — `violin`, `ridgeline`, `density` —
chooses its bandwidth by Silverman's rule, and **Silverman assumes something
roughly normal.** Two separated peaks are exactly the case it flattens: the
estimator widens the kernel until the trough between them fills in, and the
figure reports one mode where the data has two.

That is a property of the rule rather than a defect in it, and no automatic
choice repairs it — which is why the escape is a field. `bandwidth` is a
**multiplier**, seaborn's `bw_adjust`, and a multiplier for seaborn's reason: a
width in the data's own units means nothing until you know the data, so an
absolute field would have every caller computing Silverman themselves in order to
scale it. Below 1 sharpens, above 1 smooths, and `undefined` and `1` are the same
answer.

**Recorded rather than hidden**, because the violin's flat catalogue frame was
read as a rendering defect twice before the cause turned out to be the fixture and
the estimator between them. A form whose default is known to fail on a named
input should say so where the input is described.

---

## 3l. The ridgeline overlaps, or it is a stack of area charts

`ridgeline` gave each series a band of its own through `bandedForm` — one series
per slot, nothing crossing. That arrangement removes the only reason to prefer
this form over facets: **a tall distribution reaches past its own row and is read
against its neighbours.** Joy Division's cover is famous for exactly the thing a
band-per-series layout takes out.

Three rules, and each of them was being broken by the band version:

- **The curves overlap.** Baselines are evenly spaced and each curve is allowed
  `2.2` times that spacing, which is `ggridges`' default and reads as a ridge
  rather than as a stack.
- **They share one x-axis.** Sampled over its own range each distribution fills
  the width, so three centred at 5, 12 and 20 draw as three identical humps and
  the figure says they are the same. The *shift* is the subject.
- **And one density scale**, for the same reason: normalised per curve, ten
  samples and a thousand draw the same height.

**Painted back to front, because occlusion is the only depth cue.** The curves
are one colour and one thickness; the sole thing saying which is nearer is that
it interrupts the other. A near curve therefore *clears* the cells under its
outline before drawing — an outline alone lets the far curve show through the
near one's body, and the two read as crossing.

`ridgeRows` is deleted rather than kept beside this. Overlap cannot be expressed
one band at a time, so a per-band renderer is not a simpler version of this — it
is a different form.

---

## 3k. The forest plot draws its interval, and the box was drawing over it

`forestRow` builds the figure correctly — a thin line from `lower` to `upper`,
end caps, a mark at the centre — and then, **whenever `q1` and `q3` are present,
overwrites the whole interior with a box plot's body.** The catalogue fixture
always sets them, so the interval was never visible in any rendered frame; what
shipped was a box plot with a forest plot underneath it.

A forest plot and a box plot look alike and mean different things. A box's edges
are *quartiles of a sample*; a forest plot's interval is a **confidence interval
on one estimate**, and its ends are the two numbers the reader came for. Drawing
the first over the second does not lose decoration — it replaces the statistic.

### What the figure needs, and which parts are data rather than drawing

```
 study            ├────■─────┤          the interval, with the estimate on it
 larger study        ├──███──┤          sized by weight
 small study    ├─────────▪────────┤
 ─────────────────────────┊──────────   the null, from an annotation
 pooled              ├───◆───┤          the summary, a diamond
```

- **The estimate is sized by `weight`.** A wide interval drawn small contributed
  little; a narrow one drawn large carried the result. Without it the plot is a
  list of intervals and the reader cannot see which one the conclusion rests on.
- **The pooled estimate is a diamond**, and `pooled` is its own field rather than
  a convention about the last row — *the last row is the summary* is a rule the
  data cannot state and a renderer cannot check.
- **The null reference line is an `Annotation`**, not a new field. C04 already has
  one and it already means *a claim about the ordinate drawn beside the data*; a
  forest plot's null is exactly that, and inventing `nullValue` beside it would be
  the second way to say one thing.

Both new members are optional and their absence is a real state: a summary
computed from quantiles has no weight, and a meta-analysis need not be pooled.

---

## 3j. `orientation` — the axis a categorical form runs along

`bar`, `histogram`, `boxplot` and `violin` are drawn horizontally and matplotlib
draws all four the other way. Both are right, for different reasons, and the field
is the answer rather than a preference.

**Horizontal is the default because a terminal cell is not square.** A cell is
about one wide by two tall, and a category's name is *text* — so a horizontal bar
writes its label beside itself at full length, and a vertical one gets whatever
fits under a column two or three cells wide. Every terminal plotting library
defaults this way and no desktop one does; the cell is the whole of the
difference.

**Vertical is what ordered categories want.** A histogram's bins and a month of
daily readings have a direction, and a horizontal bar chart runs its category axis
top-to-bottom, which is not where time goes. `binValues`' half-open intervals are
unreadable stacked vertically and read naturally along the bottom.

### The vocabulary flips with the axis, and that is the part to get right

`ramp.ts` names four vocabularies and two of them are the *same eighths on
different axes*:

| axis | partials | why |
|---|---|---|
| horizontal | `▏▎▍▌▋▊▉` — **left** eighths | a bar's tip advances rightwards, so the partial cell fills from the left |
| vertical | `▁▂▃▄▅▆▇` — **lower** eighths, `RAMP_UNICODE` | a column's tip advances upwards, so it fills from the bottom |

**These look interchangeable and encode different axes**, which is the mismatch
`ramp.ts`' header was written about and which has now cost this component three
defects. The vertical arm reaches its ramp through `ladderFor("height", caps)`,
which is the door — a renderer names the axis it draws and never a vocabulary
(I21, SS51). `extentFor` stays the horizontal one.

**The wide arm is not the narrow arm's mirror, and the asymmetry is the other way
round from what this section first claimed.** U+2580–U+259F are all
`East_Asian_Width=Ambiguous`, so neither eighths set survives a wide terminal —
but the two axes have different escapes, and only one of them is poor:

| axis | wide arm | partials |
|---|---|---|
| horizontal | `extentFor` — `⣿` and `⡇` | **one**, because braille has no left-filling series |
| vertical | `ladderFor("height")` — `⡀⣀⣄⣤⣦⣶⣷⣿` | **seven**, because braille *does* fill bottom-up |

So a vertical bar on a wide terminal keeps its sub-cell precision and a horizontal
one loses it. Measured rather than reasoned: the first version of this paragraph
said both quantise to whole cells, and the frame said otherwise. **Braille filling
bottom-up is exactly what made `RAMP_BRAILLE` the wrong ramp for a matrix cell**
(§"The ramp is the density ramp") — the same property, wanted here and refused
there, which is what it means for a vocabulary to encode an axis.

### What is not orientable, and why it is a shorter list than it looks

`heatmap` and its family have two real axes already; `pie` and `radar` have none;
`gantt` and `waterfall` are horizontal *by construction* — a gantt's bar is a time
interval and time is the long axis. `lollipop`, `dotplot`, `funnel`, `dumbbell`
and `forest` are orientable in principle and are not built here, because each is a
glyph-row form whose vertical arm is a separate renderer and none was asked for.
**Requesting an orientation a form does not have is a construction error**, not a
silent fallback — C04 refuses it, for I8's reason: a plot that quietly ignores a
field is a plot the caller believes is showing something else.

---

## 3i. `plotDetail` — the mode fits the height, and never sets it

A boxplot at one row per category cannot show a mean; at three it is the reference figure. A
violin needs five before an outline and its box overlay are both legible. Both wants are real
and neither should cost the caller arithmetic.

**Four rungs, and every one adds information rather than resolution.** That is the test a
rung has to pass: a figure that says the same thing larger is not a rung, it is a bigger
drawing.

```
1 row  / 1 col     box only
2 rows / 3 cols    half-violin + box            the raincloud
3 rows / 4 cols    + raw jittered strip         the full raincloud
5+ rows            mirrored outline + box       the classic violin
```

| form | `"compact"` | `"full"` |
|---|---|---|
| `boxplot` | 1 row — whiskers, box, median, mean | 3 rows |
| `violin` | 2 rows — half-violin over the box | 5+ rows, mirrored outline with the box overlaid |
| `ridgeline` | 1 row per series | 3+ rows per series, overlapping |

**`"compact"` is the lowest rung the *form* has, not one row for everything.** A box plot's
lowest rung is one row; a violin's is two, because a violin with no density is a box plot
and the field said `violin`.

### The mirror is what the raincloud spends

A classic violin is symmetric about its spine, and **the mirror carries no information** —
it is the same estimate reflected. Dropping it buys the summary row for free, which is the
whole of why two rows can hold what five hold. This is the raincloud (Allen et al. 2019)
rather than an abbreviation invented here.

```
   ⣀⣤⣶⣿⣿⣿⣶⣤⣀                      row 0   density, one-sided, growing away from the box
 ├──┤████│████├──┤  ▪ ▪            row 1   the compact box, unchanged
```

### The density is drawn on the box's axis, and the two disagreed by a tenth

`violinRows` pads its value axis by a tenth at each end so a tail has somewhere to taper, and
samples the estimate across the padded span. `boxplotBand` puts `min` in column 0 and `max` in
the last column with no pad at all. Each is right for the figure that owns it, and **a
raincloud is both figures in one band** — so composed without a decision the cloud's mode sits
a tenth of the width from the median it belongs to, in a frame where every count agrees and
nothing is out of range.

**The box's axis wins, because the ladder's promise is that the same figure appears at every
rung.** A box that moves when a density row is added above it is a different box, and a reader
climbing the ladder would be watching the summary shift while the data did not.

**What the pad bought is bought by the cut instead.** The estimate still stops two bandwidths
past the extreme datapoints — seaborn's `cut`, already in `kde.ts` for the violin's outline —
so a tail still ends rather than running to the frame's edge, and it ends by the mechanism
already ruled for that rather than by a second one that happens to look similar.

### Blank is outside the support; the ladder's first step is an estimate near zero

Two meanings meet on one row, and I16 is what keeps them apart. A ramp's first step is ink
because a blank minimum reads as *nothing here* — and *nothing here* is exactly what a column
outside the cut has to say. So the cloud draws a ladder step inside the support and a space
outside it, and the two statements stay distinct: `▁` says the density is small there, a blank
says the estimate does not reach.

Without the cut the row would draw `▁` from edge to edge, which is a flat line at the bottom of
the cloud saying *this distribution is everywhere* — the same picture the violin's outline drew
before `cut` landed, one rung down.

### A mirror needs a centre, so the mirrored rung draws on an odd extent

The top rung is the outline reflected about the spine, and it drew **three rows of ink above the
rule against two below** at every even height — measured at 4, 6 and 8, in both arms, every time.

The cause is two correct statements meeting. Both arms split the slot as `⌊(k−1) ÷ 2⌋` above and
`⌈(k−1) ÷ 2⌉` below, which is symmetric and has a comment saying why: *the offset is rounded once
and applied both ways, because rounding each edge independently is not.* Then both take the spine
at `round((k−1) ÷ 2)` — and for an even `k` that is the **lower** of the two baselines, not the
axis they mirror about. So the outline reflected about `k/2 − 0.5` while the rule, the box, the
median and the closing points sat half a cell below it.

**Neither statement is wrong and the pair is.** That is why the existing comment is exactly right
about the class and did not prevent the instance: *"a violin that is asymmetric by a row is a
violin that is wrong, and it is invisible in anything but a mirror assertion."* No mirror
assertion existed.

**And the golden corpus could not have been one**: landing the fix moved four vertical frames and
**not one horizontal frame**, out of 284. The reason is the rung and not the parity — `ONE_PER_FORM`'s
violin is `height: 12` over three categories, four rows a band, which this section spends on the
**raincloud**; the mirrored outline starts at five. So the top rung of the ladder had no horizontal
golden frame at all, and a green run cannot tell *a case the corpus covers and passes* from *a case
the corpus does not reach*. `MIRRORED` is that corpus, at six rows a band and seven, so the parity
is a comparison a reader makes rather than a claim this section makes.

*The paragraph above said the band height was odd until it was measured at four. The observation
that prompted it — four frames moved and no horizontal one — was right, and the reason under it was
not.*

So the mirrored rung takes the largest odd extent that fits, and the spare cell is left blank.

**The spare cell goes *before* the figure, and two rules the fix does not touch are what say so.**
`bandedForm` puts a band's name at `⌊rows ÷ 2⌋` of the figure it was handed; `columnLabels` puts a
band's tick at `x + ⌊w ÷ 2⌋`. Padding at the top — and at the left, standing up — lands the spine
on both, at every even extent. Padding after lands it one cell short of both. Two independent
placements agreeing is what makes this a derivation rather than a preference.

At an extent of two the odd extent is one, and the floor arm draws the fill instead — which is the
case that arm's own comment already calls a summary: two cells is an upper edge and a lower edge
with no centre between them.

**The raincloud rungs are unaffected and it is worth saying why**, because *the violin is
asymmetric* would otherwise read as covering them: a raincloud is **one-sided by construction** —
§3i's own *the mirror carries no information* — so it has no reflection to be wrong about and an
even budget costs it nothing.

### The budgets are asymmetric, and it is the cell's aspect showing through

| form | horizontal | vertical |
|---|---|---|
| box plot | 1 row | 1 column |
| violin | 2 rows | 3 columns |

A vertical violin in two columns is four dot-columns split between the density and the box —
too coarse to carry a shape, so it would draw a flat bar and call it a distribution.

**Refuse below the floor; degrade above it**, and the two are not in tension because they
have different subjects. The budget is about *whether the form has room at all*.
`plotDetail` is about *which renderer fits the room there is*. A caller who declares a height
below the floor has asked for a picture that cannot exist; a caller who declares `"full"` in
four rows has asked for the best available, which is a request the renderer can honour.

**And only the row floor is refused at construction**, because only the row budget is
declared there. `validateBlock` takes a block and no width — a terminal's width is handed
down from `terminal/lifecycle.ts` — so `height ÷ categories` is in hand at construction and
`width ÷ categories` is not (C04 I56). The column floor is enforced here instead, by
**drawing the box rung rather than a flat density**, which is I18's ladder: where the width
cannot spare what a figure needs, the honest answer is the figure that fits.

### `"auto"` and `"full"` were the same value, and now are not

`detailRows` read `if (mode === "compact") return 1;` and then returned the same expression
for both of the others. **Three names, two behaviours** — a distinction that reads as
meaningful and forbids nothing, which is A03 §2's vacuity class arriving in a field rather
than in a rule. Nothing could see it: every assertion about `"full"` was satisfied by the
`"auto"` branch.

| value | the rung |
|---|---|
| `"compact"` | the **form's floor** — 1 row for a boxplot, 2 for a violin |
| `"full"` | the highest rung the **budget** affords |
| `"auto"` | the highest rung the budget affords **and the data supports** |

**`"auto"` is the one that reads the data, which is what makes its name true.** A density
rung draws five levels, and a band with fewer than five finite samples cannot distinguish
five — so `"auto"` falls to the box rung there and `"full"` does not. The number is derived
rather than chosen: it is the level count the rung draws.

This is not a height derived from the data (I1). The rung is chosen *inside* the rows the
caller declared, and `plotHeight` never consults it.

### The two densities are two *shapes*, not two axes — and one of them already exists

**A vertical form reaching for the height ramp is the encoding mismatch I21 exists to make
unspellable**, and the raincloud is the first form that can reach for it, because it draws
density on both axes. But the two are not two ladders:

| the band is thin in | resolution comes from | the vocabulary |
|---|---|---|
| **height** — one row, N columns | *within* a cell, four dot-rows | a **ladder**: one value indexes one of eight steps |
| **width** — N rows, two or three columns | *across* cells, four dot-columns | an **extent**: a run of solid cells with a fractional tip |

**A ladder is per-cell and an extent is per-run**, and which one a density needs is decided
by the dimension its band is thin in — not by the axis the values lie along. A horizontal
band has one row to spend, so all the resolution is inside one cell and a ladder is the only
shape that fits. A vertical band has two or three columns, so the resolution is the run's
length and the ladder has nothing to index.

**So there is no third axis. There are two directions of `extent`**, and the five levels the
figure needs are what `extentRun` already returns at width 2 with one partial:

```
leftward   ⠀⠀ · ⠀▐ · ⠀█ · ▐█ · ██      blocks at narrow, braille at wide
rightward  ⠀⠀ · ⡇⠀ · ⣿⠀ · ⣿⡇ · ⣿⣿      what `extentFor`'s wide arm draws
```

**The leftward arm was braille at every width, and the argument for it does not
distinguish.** It ran: `extentFor`'s narrow arm uses the left-eighths `▏▎▍▌▋▊▉`, seven
fractions growing from the left; Unicode offers no matching set growing from the right, only
`▕` and `▐`, an eighth and a half, and both are `East_Asian_Width=Ambiguous` where braille is
`Neutral`.

**Every clause is true and the conclusion is not, because `█` and the left-eighths are
Ambiguous too** — measured: one cell at `narrow`, two at `wide`, the same as `▐`. That is what
`extentFor`'s `ambiguousWidth === "wide"` branch is *for*, and the narrow arm has always drawn
blocks in the teeth of it. The ambiguity clause separates nothing.

**What the seven-fractions clause settles is resolution, and there the two are equal.** A
leftward run is `⣿` with one partial — two states a cell — and blocks give `█` with `▐`, also
two. Braille bought nothing and cost the vocabulary: *the vertical compact violin drew dots
where the horizontal one drew a solid ladder, one rung of one figure in two alphabets.* So
leftward is `█` with `▐` at narrow width, braille at wide, which is the same branch every other
extent takes.

*This is the shape MG24's scope had* — a correct sentence attached to the wrong decision, which
survives being read carefully because the reader checks whether it is **true** and not whether it
**decides**.

That is why the vertical budget is three columns and not two: two would be four dot-columns
for the density *and* the box.

### The compact box's run is filled or heavier, and both are *not the whisker*

`plotBox?: "solid" | "line"` — what a one-row box draws between `q1` and `q3`.

**The reason the compact box is filled is a reason for a *run*, not for a fill.** With three
rows the interquartile range is enclosed by a lid and a floor, so the interior stays clear and
the median is legible inside it. With one row there are no edges: a blank interior leaves
`┤    │    ├` — two tees, a rule, and nothing saying those cells are the box. So the interior
carries the range.

Filled says that loudest. **`━` says it too**, and leaves the summary a line drawing:

```
solid   ├──────────────────┤██████◈██████├─────────────────┤
line    ├──────────────────┤━━━━━━◈━━━━━━├─────────────────┤
```

**Which one a reader wants depends on what is behind it.** A raincloud puts a density above the
box; against a filled ladder cloud the filled box competes for the same weight, and a heavier
line reads as the summary *of* the shape rather than a second shape. Standing up it is `┃`
against a leftward `█` run, for the same reason.

**A new glyph rather than a reused one.** `heavyHorizontal` and `heavyVertical` join the named
set (C09 I22, SS47) — `candleFilled` is already `┃` and reaching for it here would be a name
lying about its use. ASCII has one width of rule, so both collapse to something that is at least
different from `-` and `|`.

### The rain is the only part of the figure that is the data

A density is an estimate and a box is five numbers. Neither says how many readings there
were, whether they cluster, or that two of them coincide — so the third rung adds the raw
samples and nothing else, which is what makes it a rung rather than a bigger drawing.

```
   ▁▁▂▂▃▃▄▅▆▇███▇▆▅▄▃▃▂▂▁▁         the cloud
 ├──────┤██│███├─────┤            the box
   ⢀⢀⠔⠐⡡⠊⢎⡼⢾⢷⠶⡚⠶⠥⠉⠄⠑⠁⠂           the rain
```

**The rain falls below the box**, which is where the form's name comes from (Allen et al.
2019) and what the vertical arm transposes into left-to-right: cloud, box, rain.

**The strip carries the sub-cell win, and it is on one axis.** A braille cell is two dots
wide and four tall, so a horizontal strip resolves **two** value positions per cell where the
cloud and the box resolve one, and spends the four dot rows on jitter. Standing up, the two
swap: four value positions down a cell, two jitter positions across. That asymmetry is the
same cell aspect the budgets show, and it is why the vertical budget is four columns where the
horizontal one is three rows — a one-column strip has two jitter positions where its
horizontal twin has four.

**ASCII draws a rug and that is I21 rather than a shortfall.** An ASCII cell has no sub-cell
position to spend, so there is nowhere to put the jitter — and folding through the ramp would
draw `. : - =` by where a sample happened to land *inside* its cell, which is a magnitude the
data has not got. One mark where a sample falls says exactly what ASCII can say. `foldPresence`
is a third fold for exactly this: `foldBraille` puts the dots' arrangement in the glyph and
`foldRamp` puts the topmost dot's height in it, and a strip has neither to say.

**The strip reads the box's axis**, on the cloud's ruling and for its reason: every part of a
raincloud is one figure, and a part that moves relative to the others is a different figure.

### The jitter is a function of the sample's identity, and a counter is not the only way to be wrong

I11 says every render is a pure function of block, width and context, so the offsets cannot
come from a clock, from `Math.random`, or from a module-level counter. **A strip that moves
between two renders of one block is a picture of the renderer**, and it fails nothing else:
every count agrees, both frames are plausible, and the difference exists only between two
frames nobody puts side by side.

**But `index % positions` is deterministic and it is still not a jitter.** It satisfies I11
exactly and draws a sawtooth — consecutive samples marching down the dot rows in lockstep — so
**sorted data draws diagonal stripes**: a pattern in the renderer, read as a pattern in the
measurements. Distribution data arrives sorted often enough that this is the ordinary case
rather than the adversarial one. So the requirement is a *hash* and not merely a pure
function, and the band's index is one of its inputs so that two bands of one distribution do
not draw the same speckle.

**The measured trap is the fixture, not the code.** A module counter running 1…60 and then
61…120 gives the same `% 4` in both renders whenever the sample count is a multiple of four:
the phase resets exactly, the two frames come back byte-identical, and the row written to
catch a counter passes against one. Sixty samples is what the first draft used. A count
coprime to the jitter's positions is the fixture responding to the thing under test, and it is
asserted rather than chosen.

### `U+2800` is the braille blank and only a banded form has to know

`foldBraille` emits `U+2800` for an empty cell — a printing character that looks blank. Every
other braille form in this component reaches the frame through `positionalForm`'s layer merge,
which starts each cell at a space and takes a glyph only where `isBlank` says there is one, so
the blanks are lost there and nobody has had to think about them. **A banded form has no
merge**: the band's rows go into the frame verbatim.

Left alone, the strip's empty cells are ink to everything that measures ink — `refdiff`'s own
mask records why that matters, because counting `U+2800` as ink reports every braille form as
almost entirely covered — and inside one figure it means three rows disagree about what empty
is, in a frame where they look identical.

### The vertical bands touched, and the box rung already knew

Drawn to the full slot at eleven cells a band, one band's cloud runs straight into the next
band's box: `⣿⣿─⣿⣿─` is a single six-cell run, and three distributions read as one field.
`boxplotColumn` solved this before the ladder existed — three fifths of the slot, centred,
which is matplotlib's `widths=0.6` — and the raincloud takes **the same rule** rather than a
second one that agrees. Two rungs of one ladder have to separate their bands the same way, or
the figure changes character when a row is added instead of gaining one.

At the three-column budget there is nothing to spare and the figure takes the slot whole,
which is what the box does there too. So the touching case survives at the floor, identically
at both rungs, and it is the width rather than the rung that decides.

**Found by reading the frame.** Every count was right — the runs are the density's, the box is
in its own column, the widths sum to the slot. What was wrong was legibility, and no
arithmetic in the figure had anything to say about it.

### The rung is the chart's and the width is the band's

`categoricalColumnForm` divides the area and distributes the remainder one cell at a time, so
eighteen bands over seventy-five cells is four each and three of them five. A rung ladder
keyed on the band's own width then draws **three mirrored violins among fifteen rainclouds** —
and a reader takes that as a property of those three categories rather than of the division.

Every width sums, every band is the richest figure its own width affords, and nothing in it is
arithmetically wrong. **Found by reading the frame**, which is the only instrument that could:
the numbers are all correct and the picture says something the data does not.

**So the rung is chosen once, from the narrowest band, and the drawing still uses each band's
own width.** A five-column band draws its raincloud five wide; it does not draw a different
figure. One chart, one figure, and the remainder decides nothing but how much room each copy
of it gets.

The horizontal arm never had this: `bandedForm` gives every band `⌊areaRows ÷ n⌋` and drops
the remainder, so the bands are equal by construction. The asymmetry is worth naming — the two
arms distribute their leftover differently, and only one of them can reach a rung boundary
with it.

### And capped, because a longer run is magnitude resolution

Three fifths of a twenty-five-cell band is a fifteen-cell figure and a fourteen-cell cloud:
solid braille on almost every row, with the distribution's shape legible only along one edge.
It is a filled bar chart standing where a raincloud should be, and every number in it is right.

**The two arms put the magnitude on different axes, and that is the whole argument.** A ladder
step lives *inside* a cell, so a wider horizontal band buys more of the **value** axis — more
places along the data. A run lives *across* cells, so a wider vertical band buys nothing but a
longer ruler for a magnitude nobody reads off one. Growing it is the same move as adding steps
to the height ladder: more resolution, no more information, which is the test a rung has to
pass and a width should pass too.

**Four cells is derived rather than chosen.** A leftward run of `n` cells with one partial
resolves `2n + 1` levels; the height ladder resolves eight; four gives nine. So the cap is the
width at which the vertical arm reads the same number of levels the horizontal arm does, and
the two rungs of one ladder say the same amount on either axis.

**Both rules, and each has a slot where only it bites.** At six columns the cap alone leaves a
five-cell figure hard against its neighbour; at twenty-one the narrowing alone leaves thirteen.
At eleven either one is sufficient, which is why a row written there passes against a tree
missing either.

### The stub always points toward the whisker

**One rule, and both glyph tables fall out of it.** The tables are what a reader sees and
the rule is what makes them derivable rather than memorised — and the vertical arm was
written by re-deriving it, which is the case for stating it once.

```
horizontal    ▪  ├──────────┤████████████│███████████├────────────┤  ▪ ▪
                min        Q1          median       Q3           max

              ├  min cap    stub points RIGHT, toward the whisker
              ─  whisker
              ┤  Q1         stub points LEFT, toward the whisker
              █  IQR
              │  median
              ├  Q3         stub points RIGHT, toward the whisker
              ┤  max cap    stub points LEFT, toward the whisker
              ▪  outlier
              ◆  mean, overlaid where it falls  (◈ where it falls on the median)

vertical      ▪    outlier
              ┬    max cap  stub points DOWN, toward the whisker
              │    whisker
              ┴    Q3       stub points UP, toward the whisker
              █    IQR
              ─    median
              █    IQR
              ┬    Q1       stub points DOWN
              │    whisker
              ┴    min cap  stub points UP
              ▪    outlier
```

`┬`/`┴` and `├`/`┤` swap roles between the caps and the box edges, which reads as arbitrary
and is not: a cap's whisker leaves *inward* and a box edge's whisker leaves *outward*, so
the same rule points them opposite ways.

**ASCII collapses what it cannot spell and the figure still reads**, because the rule
survives the alphabet:

```
horizontal    *  |----------[============+===========]------------|  * *
vertical      *  +  |  +  #  #  -  #  #  +  |  +  *      (top to bottom)
```

**The compact box is filled where the three-row box is hollow.** With a lid and a floor the
interquartile range is enclosed and the interior must stay clear so the median and the mean
are legible inside it; with one row there are no edges, and `┤    │    ├` is two tees, a
rule, and nothing saying those cells are the box.


### A rung that spends less than its band, and the label two rows from its figure

A rung below the top one draws fewer rows than the band holds, and the band's name sits at the
band's middle row. **Two correct statements, and nothing put them in the same place.** At three
categories in twelve rows a compact box draws on row 0 of each four-row band and its name sits
on row 2 — pointing at blank space, with the box it names two rows above and unlabelled.

Neither half is wrong on its own, and that is why nothing saw it. A figure starts at its band's
first row because that is where a renderer starts. A name is centred because that is where a
band's name belongs. Every count is right: the rows, the label's column, the figure. The
mechanism that would catch it is reading the frame, and it is what did.

**It is not new with the ladder.** `"compact"` has drawn it this way since the mode shipped, and
`"auto"` draws the milder form — a three-row box in a five-row band puts the name on the box's
floor rather than on its spine. What the ladder changes is the number of ways in: before it,
one rung of two spent less than its band; after it, every rung but the top one does.

**So the label follows the figure to the figure's own middle row** — `offset + ⌊rows ÷ 2⌋`
rather than `⌊band ÷ 2⌋`, which is the same expression wherever the figure fills its band.
That is every scaling rung and every form outside this ladder, so the rule costs nothing where
it changes nothing, and the frames that move are the ones that were already wrong.

**The middle row and not the centre, because the figures are not all symmetric.** A box's
middle row is its spine; a raincloud's is its box, which is its *last* row. Taking
`⌊rows ÷ 2⌋` of the figure lands on both — where placing the label at the figure's geometric
centre would put a raincloud's name on its density.

**The figure is also centred in its band, and that half carries no load** — the mutation pass
is what separated the two. Dropping the offset while the label still tracks the figure fails
nothing, and should: a top-aligned figure with its name on its own middle row is as correct as
a centred one. What was wrong was never the alignment, it was that the *name* was placed by an
expression that did not know where the figure went. Centring is kept because a short figure
sitting at its band's top reads as a group with a hole under it rather than as a band, and it
is recorded here as taste rather than as the ruling, because the first draft of this section
fronted it as the fix.

**`plotDetail` selects a renderer inside the declared height; it never contributes to it.**
That is forced, not chosen: rows-per-band times category count derives height from the data,
which is precisely what I1 forbids. `bandedForm` keeps dividing the declared area by the
category count and the mode picks which renderer fits the quotient.

**So `"auto"` means the richest form the declared height affords** — and a caller who wrote
`height: 12` for four categories gets full boxplots without having asked for them.

**An explicit `"full"` under an insufficient budget degrades to the richest rung that fits,
and says so.** Silently drawing three rows into a one-row band is the class this component
keeps having; the interaction is four-way now — declared height, mode, category count and
orientation — and belongs in the classification table as its own rows.

---

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
- **I10** — A plot never emits a character outside its measured region — `height` rows without axes, `height + 3` with (the frame's lid, the axis rule, the x-labels), by `width` cells. The matrix family keeps `height + 2`: it has no lid.
- **I11** — C12 owns no state; every render is a pure function of block, width and context.
- **I12** — C12 registers through C09's public `register`; it is not privileged.
- **I13** — Sparklines are exactly one row, at every width including 1, **and one cell per position rather than per sample**. A window of eight positions is eight cells whether or not every position has a reading. **Fewer positions than cells pad on the right**, so a row fills from the left and only begins to scroll once it is full (§B3).
- **I14** — Successive points are joined by Bresenham line-draw rather than plotted as isolated dots, so a curve reads as a curve at braille resolution. A scatter of points at 2×4 subcell density is indistinguishable from noise. *Composition (§3): under downsampling the join runs from a column's last sample to the next column's first, which is what keeps I5's span-fill connected.*
- **I15** — Y-labels are placed at the max, mid and min rows of the plot area and collapse from the middle outward when the height cannot hold three: two labels at `height: 2`, one at `height: 1`. **A labelled row carries a tick on the border and an unlabelled one does not** — one rule rather than a flag per form, and the same rule a categorical axis, a band and a matrix row each resolve correctly under. **The tick values follow `yScale`**, because `yLabels` dispatches through `axisFor` rather than reaching for the linear arm.
- **I16** — **Every step of every ramp is visible, and no ramp's lowest step is the character its padding uses.** Eight steps, monotone in ink. The braille arm shipped with `U+2800` — BRAILLE PATTERN BLANK — as step 0, so a sparkline at `ambiguousWidth: "wide"` drew its minimum as whitespace, which the right-anchor already uses to mean *fewer samples than cells*: one character, two meanings, in the arm nothing renders in a golden frame. *This is a property of the constant, not of a call, so it is asserted over the ramps themselves.*
- **I17** — **A heatmap draws one cell per position per row, against a range shared by the whole matrix, with magnitude carried by ink density and an absent cell left blank.** The shared range is what makes it a matrix rather than a stack of unrelated sparklines. **The ramp is `RAMP_DENSITY` and never the sparkline's**: the latter fills bottom-up, which encodes height, and a grid cell has no vertical axis to encode it on. Blank is absence rather than `?` because a grid has no padding for a blank to be confused with, and the lowest step has ink. Rows are drawn in the order the block declares them and the renderer never sorts. **Colour carries magnitude where there is colour, and the glyph is what stands in where there is not** — which is the inverse of what this clause used to say, and the correction is a measured one. It read *density survives 1-bit, so a magnitude colour would add rather than carry alone*, which made ink density the permanent carrier and colour an optional garnish. Rendered, that is a field of dithered speckle: a matrix drawn in foreground glyphs on unpainted cells reads as noise, and no palette applied over it fixes that, because the glyph is still the thing occupying the cell. **A heatmap with colour available paints the cell** — a background-coloured space, no glyph — and reads as the continuous field it is. Granite is the reference and the difference is not subtle. The density ramp is then exactly what the name says: the **fallback**, reached when `colourDepth` cannot separate the values, and the reason the 1-bit picture is unchanged is that it is the only picture that still needs the ramp. *A ragged matrix is refused at construction (C04 I50b).*
- **I18** — **A heatmap spends width on columns first, then truncates its labels, and never draws an unlabelled matrix.** Row labels are the ordinate: a matrix with no names beside it is a picture of numbers. Where the width cannot spare a cell for a label beside a minimum plot area the block draws a centred notice at its declared height instead — I1 holds, and the reader is told rather than shown something they cannot read. *The line form keeps T3.3's opposite ladder, because a y-label is a scale and a row label is an identity.*
- **I19** — **The scale legend spans the full row and never truncates its range.** The dropped-column clause goes first and the ramp swatch second; the range is what the legend exists to state, and it is the reason `axes: false` is refused (C04 I50b). A key with no scale beside it is decoration.
- **I20** — **A value bar encodes `fill`: the run is the axis, the fill clamps at the scale's top and the number does not, an absent value draws a mark, and the number's allowance belongs to the chart rather than to the row.** *Taken per row it inverts: at `max: 100` in 40 cells, 99 draws 37 and **100 draws 36** — a larger value, a shorter bar — because `100` is a column wider than `99` and each run was scaled against what its own label left. Every count in both rows was right.* **And the two arms cannot answer alike, which the transpose hides**: horizontally the run *is* the axis, so the label may take part of the row's width; vertically the column is read against the value scale in the gutter, so shrinking it would draw a value its own axis contradicts. The vertical arm writes the number in the row **above** the bar's top, centred on its column, and **drops** it — when the top is row 0, because there is no row above it, and when the number is wider than the column, because a truncated number is a different number and one that spills labels the neighbouring bar. *Dropping is per bar: the tallest bar is the one most likely to lose its number, which is right — its height is what the axis already says most clearly (§3b).* One row of exactly `width` cells, so a cell holding one is the same height as a cell without (I13's rule for the other cell form). **An empty run is a legible value** — it reads as *zero* — which is why absence is a mark here where it is a blank in a grid: the same question answered per geometry, which is the encoding rule applied to absence rather than to magnitude.
- **I21** — **A vocabulary declares the axis it encodes, a renderer names an axis rather than a ramp, and a ladder that serves an axis it does not equal says so.** Height, density and fill are three encodings and `position` is a fourth with no vocabulary at all — the unicode line reaches for no ramp because its axis is the grid. **`extent` is the fifth and it has a direction**, which is not a new axis and was very nearly written as one: a vertical raincloud's density is a run of dot-columns, which is `extent` mirrored, and not a ladder of a third axis called `column`. **A ladder is per-cell and an extent is per-run**, and which a density needs is decided by the dimension its band is thin in rather than by the axis its values lie along (§3i). The mismatch that would follow from getting that wrong is a five-step scale drawn on a three-step axis — arithmetically monotone, right in its row count, and wrong about how much of each cell a level fills. **The mismatch is unspellable rather than checked**: `LADDERS` is keyed by axis and typed to return that axis, so a ladder of the wrong one does not compile, and a source scan forbids reading a ramp constant outside `ramp.ts` because importing one directly is the move that produced the defect. `substitutes` is a field and not a comment: `RAMP_ASCII` *is* density and *stands in for* height, and losing that distinction is what cost two defects.
- **I22** — **An axis picks nice numbers, snaps a derived bound outward, never moves a declared one, and drops a tick that would abut its neighbour.** The step is 1, 2, 2.5, 5 or 10 times a power of ten — 2.5 is in the set because without it `0 · 25 · 50 · 75 · 100` is unreachable. **The snap is per end** (C04 I29): loose labelling exists so the ends read round and a pinned axis exists so two plots can be compared, so a pin that silently grew would defeat what it is for. **Precision is one per axis and comes from the step** — the smallest gap two labels can differ by — and it is the step's *own* decimals rather than two significant figures of it, and a named precision is **kept in the string** rather than trimmed back into three (F177). **The tick count is a result**, bounded below by how fine a step is worth asking for and above by how many labels the height seats two rows apart. **And a step the arithmetic cannot pick is `0`**, never a plausible constant: a denormal span underflows, and `1` there snaps `5e-324 … 1e-323` to `0 … 1`, which terminates and is wrong where nothing downstream can detect it (F178).
- **I23** — **An annotation is a dashed line in the same raster, drawn behind the data, and an edge outside the range is dropped rather than clamped.** Dashed is the carrier and the tone is decoration (F34): a reference line is broken where a curve is continuous, at every colour depth. **A band is two lines** — one statement, two edges — because a fill would compete for the cells the curve occupies. **Behind, and the layer order is the rule**: one that overwrote a sample would hide what it exists to be compared against. **Dropped rather than clamped is the one place this differs from a sample** (C04 I29): data pressed against a ceiling is honest, and a claim about *where a value sits* moved onto a scale it is outside is not. **At ASCII it is not the raster** — `foldRamp` encodes height, and folding a one-dot line by ink weight drew `# # # #`, heavier than the curve; there the line is drawn at cell resolution with `-`, which is narrow under both width conventions where every box-drawing dash is not.
- **I24** — **One compositor owns the gutter, the frame and the legend, and it asserts its own row count.** Four independent gutter implementations is what produced a y-axis that is not straight: `labelWidth` and `padStart` default to `ambiguousWidth: "narrow"` and only two of the four passed the real capability, so one row's `│` sits a column right of the others wherever an ambiguous-width label appears. **The assertion is the point rather than the deduplication** — `area.rows + furniture === plotHeight(block)` was a convention four call sites each had to honour and is now one checked equality (I1's other half, at render time rather than at measure time). It **reconciles** rather than throwing: I2 says no series input throws, and the caller is a renderer, so a short block is filled with blank rows and a long one is cut. **`padStart` is the half the audit missed** — the two forms that measured with the real capability still padded with the default one, so all four gutters were crooked on a wide terminal and only the reason differed. **And the equality reaches only what routes through it**, which is not a caveat but the measured failure: `radar`, `horizon`, `smallmultiples` and `pairplot` composed their own rows and were therefore outside the one check written to catch exactly their defect. A compositor that can be bypassed is a convention again for whoever bypasses it, so the four now go through `composeRows` and §2's height table names them.
- **I25** — **Two things a reader must tell apart differ by mark or by name, never by tone alone.** *(The second disjunct is measured, not softening: nine forms give each category its own gutter-labelled row, and a rule demanding a distinct glyph there fails eight correct renderers. `SHARES_CELLS` is the partition, total over `PlotForm`, and §3g's legend reads the same one.)* I6 says this of multi-series plots and is satisfied by `pie`, `waffle`, stacked `bar` and `radar`, none of which is one — a pie has segments, a stacked bar has layers — and all four of which drew a single glyph for every category. **The marks are a ladder of eight and not the shade ramp**: `░ ▒ ▓` encode magnitude along an axis (I21), and spending them on identity is the vocabulary mismatch that cost two defects already. *Asserted as a sweep over every form at `colourDepth: 1`, because a rule remembered per form is a rule that lapses on the thirty-fifth.*
- **I26** — **`plotFrame` chooses the shape of the furniture and `axes` chooses whether there is any.** Two fields because they answer two questions, and a single enum spelling `"none"` would make `axes: false, plotFrame: "box"` expressible and meaningless. Gridlines are appended last and resolve behind the data, for I23's reason exactly. **`"corners"` suppresses the tick row** rather than drawing ticks against an edge that is not there. **All four ship and the geometry is identical in every one** — same rows, same columns, same plot area — which is what makes this a glyph table rather than four renderers. `plotFrame` is structurally absent from `PlotGeometry`, so a style cannot reach `plotHeight` and a `"rule"` plot one row shorter than a `"box"` one is a compile error rather than a test. `"grid"` draws where a value is *written* — the rows the gutter labels, the columns the rule ticks — and anywhere else it is a texture.
- **I27** — **A legend costs width or a row, and only the width-costing placements may enable themselves.** A row must declare its cost before the data is visible (I1); width is already data-dependent through the gutter, so it may not. That is why `"right"` is the default and `"above"`/`"below"` are opt-in — not a preference. **Skipped entirely at `colourDepth: 1`**, where a swatch carries nothing and still takes the row.
- **I28** — **`plotDetail` selects a renderer inside the declared height and never contributes to it**, because rows-per-band times category count is a height derived from data (I1). `"auto"` is the richest renderer the quotient affords; an explicit `"full"` that does not fit degrades to `"compact"` and reports rather than overflowing its band. **A rung that spends fewer rows than its band takes the label to the figure's own middle row**, because a figure drawn from the band's first row and a name drawn at the band's centre are two correct placements that do not meet: a compact box at three categories in twelve rows had its name two rows below it, pointing at blank space. The offset is zero wherever the figure fills its band, so the rule is silent for every scaling rung and every form outside this ladder. *The figure is also centred in its band and that half carries no load* — dropping it while the label still tracks fails nothing, because a top-aligned figure named on its own middle row is equally right; the mutation pass is what told the ruling from the taste.
- **I29** — **Colour carries magnitude where there is colour; the glyph is the fallback, never the lead.** A form that encodes magnitude paints the cell — a background-coloured space — at any depth that separates its values, and reaches for the density ramp only below it.
- **I30** — **`orientation` chooses the axis, and the eighths vocabulary follows it.** Horizontal is the default because a cell is one wide by two tall and a category's name is text — a horizontal bar writes its label beside itself, a vertical one gets a column two cells wide to write it under. The partials are **left** eighths horizontally and **lower** eighths vertically; they look interchangeable, encode different axes, and the vertical arm reaches its through `ladderFor("height")` rather than naming a constant (I21). Both eighths sets are ambiguous-width, and the escapes are asymmetric: the vertical arm keeps seven partials on a wide terminal because braille fills bottom-up, and the horizontal arm has one because braille has no left-filling series. A form with no second axis refuses the field at construction rather than ignoring it.
- **I31** — **A forest plot draws its interval, and nothing draws over it.** The ends of a confidence interval are the two numbers the reader came for; a box plot's body over them replaces the statistic rather than decorating it, and the two figures look alike enough that no count notices. `weight` sizes the estimate because *which study carried the result* is the plot's subject, and `pooled` is a field rather than a convention about the last row. The null reference is an `Annotation` (C04 §3e), which already means a claim about the ordinate drawn beside the data.
- **I32** — **A ridgeline's curves overlap, share one x-axis and one density scale, and are painted back to front.** Each alone is what makes the form readable and each was absent: a band per series is a stack of area charts, a per-curve range hides the shift the plot is read for, a per-curve density hides how concentrated each is, and occlusion is the only cue saying which curve is nearer — so the near one clears the cells beneath its outline rather than merely drawing over them.

**"Separates its values" is a real threshold and it is 8-bit, not 1-bit.** C10 I31 already ruled that a continuous map below 8-bit says *nothing* — an ordering over sixteen indices whose luminances the terminal never reports, so a ramp across them is an ordering that is not one — and `continuousColour` returns `undefined` there rather than guessing. **So the ladder has four rungs, not two, and the middle one is the rung most terminals actually report**: at 24- and 8-bit colour carries and the cell is painted; **at 4-bit colour exists and cannot carry, so density does**; at 1-bit there is nothing else. The mechanism is already built — the caller falls back because the map declines — and naming the rung is what stops someone reading *any depth with colour* as *any depth at all*.

**The legend takes whichever form the carrier does, by this same rule.** A colour bar where colour leads; the density swatch where it does not. Retiring the swatch outright would be the same error one layer up: it stops meaning anything at 24-bit and it is the *only* thing that means anything at 1-bit and 4-bit. One rule, two arms, in the legend as in the cell. The old rule was the inverse and it is what makes a matrix read as dithered speckle: a foreground glyph occupies the cell whatever colour is applied over it, so no palette rescues it. **This meets I25 rather than contradicting it** — I25 governs the case where colour is *absent* and says two things a reader must tell apart still differ by mark. Together they are one rule with two arms: lead with colour where it exists, fall back to marks where it does not. **And it is the same rule for identity as for magnitude.** Two series are told apart by colour where there is colour and by mark where there is not — a line and a second line, a pie's segments, a stack's layers. Stating it once over both is what stops it being remembered per form and lapsing on the thirty-fifth.

**Overridable in one direction only, and `plotMarks` is the field.** `"auto"` — the default — brings marks in when colour cannot carry the distinction. `"always"` brings them in regardless, because dashed against solid against dotted is a legitimate thing to want on a colour terminal, and a reader printing to paper or pasting into a ticket needs it. **There is no `"never"`**: that would be a caller asking for a picture that says nothing at one bit, and I25 already refuses it. So the field widens what a form may do and never narrows what it must.

*Gated as a sweep over every form at two depths, not as a source scan: the subject is the rendered cell and a scan would be asking about the call site.*

---
- **I33** — **The stub always points toward the whisker, and both box-plot glyph tables fall out of that one rule.** `├`/`┤` horizontally and `┬`/`┴` vertically, swapping roles between the caps and the box edges — which reads as arbitrary and is not, because a cap's whisker leaves inward and a box edge's whisker leaves outward. *The rule was implemented in both arms and written down in neither, and the vertical arm was built by re-deriving it from the horizontal one; a table without its rule is a table the next arm re-derives.* **And no whisker means no stub, which is the clause the rule implies and neither arm honoured.** A band with `q3 === max` draws its box edge over its own cap, and the edge's stub survives — `├` on the spine, pointing right at blank columns, promising a whisker that is not there; `┤` at the other end when `q1 === min`, and `┴` on the vertical arm's lid pointing up into nothing. **The degenerate end is the half a table cannot state**, because a glyph table is indexed by position and this is a condition on the data: the two columns coincide and the later write wins. So the box edge takes `│` horizontally and `─` vertically where its cap is not a separate cell — the same shape as the mean-on-median `◈`, a mark that changes because two things landed in one place. **The ASCII arm keeps the distinction**, which is worth saying because the first form of T1.100 asserted it could not: every tee collapses to `+` and `vertical` is `|`, so what degrades is *which way* a stub points and not *whether* there is one. **The compact box is filled where the three-row box is hollow**: with a lid and a floor the interior must stay clear for the median and the mean, and with one row there are no edges, so `┤    │    ├` says nothing about where the box is. **A mean landing on the median draws `◈`** rather than nothing — suppressing it left one band with no mean mark beside two that had one, so *they coincide* read as *it is missing*.
- **I34** — **`plotDetail` is a ladder of four rungs, every rung adds information rather than resolution, and the budget below the lowest rung is refused rather than drawn.** 1 row / 1 column is the box; 2 rows / 3 columns is the raincloud — the half-violin over it, because **the mirror carries no information** and dropping it buys the summary row; **its density is sampled on the box's axis and not on the violin's**, which pads by a tenth at each end, or the cloud's mode sits a tenth of the width from the median below it with every count agreeing — and the tail is stopped by the cut that already stops the violin's outline rather than by a second mechanism. **Blank means outside the support and the ladder's first step means an estimate near zero** (I16), which is the one place those two can collide; **and the vertical figure narrows to three fifths of its slot at five columns or more, by the rule `boxplotColumn` already applies, and is capped at five cells on top of that** — drawn to the full slot a band's cloud ran into the next band's box and three distributions read as one field; drawn to three fifths of a wide one it was fourteen solid cells a row, because a run is the magnitude axis and lengthening it is the same move as adding steps to the ladder. Four cells of cloud resolve `2n + 1` = nine levels against the height ladder's eight, which is the derivation. Every count was right in both; 3 rows / 4 columns adds the raw samples as a jittered strip — **the only part of the figure that is the data**, and the part that carries the sub-cell win: two value positions per cell against the cloud's one horizontally, four down a cell vertically, with the remaining dot axis spent on jitter. ASCII draws a rug instead and that is I21 — there is no sub-cell position to spend, and folding through the ramp would draw a magnitude the data has not got; 5+ rows is the mirrored outline with the box overlaid. **The budgets are asymmetric because the cell's aspect shows through**, and a vertical violin in two columns is four dot-columns split between density and box. **The rung is chosen once for the chart, from its narrowest band** — a vertical arm distributes its remainder a cell at a time, so a ladder keyed on each band's own width drew three mirrored violins among fifteen rainclouds and a reader reads that as a property of three categories. The drawing still takes each band's own width. **Refuse below the floor and degrade above it** — the two have different subjects: the budget asks whether the form has room at all, and the mode asks which renderer fits the room there is. **Only the row floor is refused at construction** (C04 I56), because `validateBlock` sees a block and no width; the column floor is enforced by drawing the box rung, on I18's ladder. **And `plotDetail`'s three values are three behaviours**: `"compact"` is the form's floor, `"full"` is the highest rung the budget affords, and `"auto"` is the highest rung the budget affords *and the data supports* — a density rung draws five levels and a band with fewer than five finite samples cannot distinguish five. *They were two behaviours under three names until this was written: `"auto"` and `"full"` took the same branch, and every assertion about one was satisfied by the other.* **The jitter is a *hash* of the sample's identity and not merely a pure function** — no clock, no `Math.random`, no module counter, because I11 says every render is a pure function of block, width and context and a strip that moves between two renders of one block is a picture of the renderer; **and not `index % positions` either**, which satisfies I11 exactly and draws a sawtooth, so sorted data comes out in diagonal stripes that are a pattern in the renderer read as a pattern in the measurements. The band's index is an input so two bands of one distribution do not draw the same speckle. *The counter is invisible when the sample count is a multiple of the jitter's positions — the phase resets and both frames are byte-identical — so the fixture asserts its count is coprime to them.*
- **I35** — **A categorical distribution form scales every band to one value axis, and the caller's pin is what that axis is.** Scaled to its own extent each band fills its own width, so a tight distribution and a wide one draw the same shape and the comparison the form exists to make is gone — with every count in the figure agreeing. *Three instances, because the fix is per call site: `ridgelineArea` had it and the two violin arms each computed their own bounds.* Where there is no pin the axis is the union, which `seriesRange` already computes — the same argument §6a A6 makes for a matrix, one form along. **And the cut is what keeps a shared axis readable**: a kernel estimate is defined everywhere, so across a shared axis it draws flat tails to the frame's edge unless it is stopped two bandwidths past the data (§3q).
- **I36** — **`candlestick` is a curve style and not a form, its data is a typed field, and the readout is part of it.** Everything a line plot has is unchanged — axis, grid, annotations, legend, crosshair — and what differs is what one column draws, so it sits in `plotStyle` beside `braille` and `line` with `form` still `line` or `step`. **Bullish and bearish are two categories, so §3b binds**: hollow-versus-filled carries direction at **every** depth and colour reinforces it — because I25's sweep is indexed by `PlotForm` and a style is invisible to it, and because the frame-read this repository schedules strips colour. **There is no sub-cell win, and the section records that the mechanism was looked for** — a body floats between open and close so both ends fall inside a cell, Unicode's vertical eighths ladder upward only, and the one vocabulary that resolves both ends is the one that cannot draw a hollow body. Cell resolution, as every reference implementation draws it; what is exact here is the aggregation. **The width is a stated layout rule** — `clamp(⌊areaWidth ÷ n⌋ − 1, 1, 5)` with the gap taken before the body, the wick left of centre at an even width by `boxplotColumn`'s existing rounding — and **more bars than columns aggregate rather than sample**: open of the first, high of the maxima, low of the minima, close of the last, which is exact where every other downsampling in this component approximates. **The vocabulary is not swapped to braille** — a bar's length *is* its value so doubling the glyph doubles the datum, while a candle's glyph carries direction and its column carries the time — **and the wide arm is `glyphs()`' ASCII set, so the column count does not change.** Two swaps were both called *the wide arm*, and drawing the consequence from the wrong one would have set a layout floor of one cell that `wide` cannot reach. **The readout is load-bearing rather than a convenience**, because a doji and an overlay line both draw `─` in one cell and only the four values tell them apart (§3r, §6b B5).
- **I37** — **The cursor's column is marked twice, and the mapping from index to column is the form's.** A readout names values and a reader cannot use them without knowing which mark they describe — which is what §6b B5's ruling about the doji rests on. **A dashed vertical behind the data** through the same path the gridlines take, so it never overwrites a sample; **and a mark on the bottom rule**, because the dashed line is invisible in exactly the case that motivates it, a dense column with ink in every row. *The index is into the data and not the area* — `cursorReadout` has always read `values[cursorIdx]` — so a candlestick inverts through its own pitch and its buckets. **Measured: the two mappings agree at the dense end and separate at the sparse one**, because a candle is left-aligned at a fixed pitch where a curve spreads across the width — four bars in forty-four columns put the last candle at column 20 and the curve's rule at 43. **C12 owns what a cursor draws and not who moves one**: nothing in `src/` writes `cursorPositions`, and §10's Phase 2 row is about that writer (§3s).
- **I38** — **Colour indexes an identity, and a row that is a slice of a continuous axis has none.** A histogram's bins and a correlogram's lags are cut from an axis by the renderer, so eight bins are one distribution and drew eight colours; a band named `control` is a thing the caller chose and keeps its slot. `ROW_IS_AN_IDENTITY` is that partition, total over `PlotForm`. *The claim this replaced lived in a code comment and no file — true about the grouped bar it was written for, general by nothing — and **the first correction over-reached in the other direction**: eleven reference renderings draw one colour per series and that is the references' taste rather than the principle under it, so reading the measurement as the ruling took the colour off every named band too. A measurement settles what is true; it does not settle what to draw.* **The switch is span ownership and not `SHARES_CELLS`**, which is indexed by form and so answers for a plain bar and a stacked one at once: a builder returning owners has interior identities and each run takes its owner's slot; a builder returning a string has none, and the row's identity is in the gutter already. **A form whose rows are series says so** — the timeline is the single cell where the old default was accidentally right, three tracks in one colour is what the correction costs there, and every count in that frame would still be correct. Measured against eleven reference renderings: the cycle advances per series and only per series, and mapping the category axis to colour is `hue=x` — available, explicit, and redundant by construction (§3t).
- **I39** — **A mirrored figure draws on an odd extent, and the spare cell precedes it.** A reflection needs a centre and an even extent has none: both violin arms split their slot symmetrically and then take the spine at `round((k−1) ÷ 2)`, which for an even `k` is the lower baseline rather than the axis of reflection — so the figure carried three rows of ink above its rule against two below, at 4, 6 and 8, in both arms. *Neither statement is wrong and the pair is, which is why the comment already standing over the first one — **a violin that is asymmetric by a row is a violin that is wrong, and it is invisible in anything but a mirror assertion** — was right about the class and did not reach the instance. No mirror assertion existed, and the golden corpus could not supply one: `ONE_PER_FORM`'s violin is four rows a band, which this ladder spends on the **raincloud**, so the top rung had no horizontal golden frame at all and the fix moved four vertical frames and none of the other 280.* **The spare cell goes first** because `bandedForm` places a band's name at `⌊rows ÷ 2⌋` and `columnLabels` places its tick at `x + ⌊w ÷ 2⌋` — padding before lands the spine on both at every even extent and padding after lands it one short of both, so two untouched placements agree. **The raincloud rungs are outside this**, being one-sided by construction, and an extent of two falls to the fill because two cells are two edges with no centre between them (§3i).
- **I40** — **Where two layers ink one cell the merge is per dot, and the colour is the first layer's.** `mergedRow` resolved the whole cell to the first layer that inked it, and every figure that composites — a pie's wedges, a radar's polygons over its frame — is folded to braille *before* it arrives, so the second layer's dots were dropped. *A pie's disc is fully covered by construction and `pie-default-40` had seven cells flanked by a full cell on each side that were not themselves full; the radar had it twice, its polygons eating each other and its frame drawn only in the cells nothing else wanted — which reads as dashed strokes and is not, because `dashFor` is solid at any depth above one bit.* A braille cell is `U+2800 + bits`, so the union is `0x2800 | (bitsA | bitsB)`; where any candidate is **not** braille the first-wins rule stands, because a letter and a polygon cannot share a cell. **The colour remains one layer's and that is a limit of the span model, not an oversight** — two wedges meeting in a cell draw both sets of dots in the first wedge's colour, so what the union removes is the gap and not the boundary's exactness, and saying *the gaps are fixed* would imply a per-dot colour a `Span` cannot carry. **The priority order stays the ref's** rather than becoming the densest layer's, because that order is a ruling — labels over polygons over frame — and a dot count would overturn it wherever the frame was denser (§3u).
- **I41** — **The positional family's x axis is nice numbers over a declared domain, and the sample index is what it falls back to.** `Plot` gains `xMin` / `xMax` / `xFormat` mirroring the y axis — the same `axisFor`, the same precision, the same formatter — and absent them the domain is `[0, n − 1]`, which is what the data has when nothing else was said. *Measured: `ax.plot(y)` over 24 samples ticks 0 5 10 15 20.* **The row it draws in was already reserved**: `axes: true` adds `AXIS_ROWS + FRAME_ROWS` to the declared height rather than taking it, and with no `xLabels` the third of those rows rendered as `""` — so every axed positional plot had been spending a row on an x-label row it never filled, and filling it costs nothing against I1. **`xLabels` wins where both are present**, because a caption is the caller's words and a scale is inferred, and overriding the first with the second is the wrong direction. A label that cannot keep its one-cell gap is dropped **with its tick**, `plotFrame: "corners"` draws the labels and no ticks — a tick is a mark on an edge and there is no edge, where a label is still a reading — and a log or time scale is labelled through `axisFor` or the two halves of one axis disagree. **The form owns the index-to-column mapping** (I37): a candlestick's ticks come from its own pitch, and the curve's rule would place them between candles at every width where the two separate (§3d.1).
- **I42** — **A histogram bins every series on one shared edge set, and `layout: "overlap"` cannot mean *draw the first one*.** Binned on its own extent each series fills the width, so two distributions of different spreads draw the same picture and the comparison is gone — I35's argument one form along, and the reference's answer: `ax.hist([a, b], bins=8)` returns one edge array over the union and a count array per dataset. **The strategy's inputs are the union's too**, because the edges are: a bin *count* chosen from one series' `n` and spread belongs to edges that are not that series'. *The default layout dropped every series after the first and the legend named them all, so the picture asserted a series it did not draw — I8's rule, in the arm beside the one whose comment records being fixed for it.* **There is no overlapping picture a bar can draw** — two runs superimposed in one row of cells is one run — so `overlap` with more than one series means **grouped**, for the bar and the histogram alike, which is also what `ax.hist([a, b])` draws. Binned, a histogram *is* a bar chart of counts, so all four layouts arrive from the bar rather than being invented. **The vertical arm needed the `refFor` its transpose already had**, or N×S column bands draw in one colour under a legend naming S; and a series with no finite values keeps its bands, because dropping it renumbers the groups and the bin a reader is looking at holds different series in different bins (§3v).
- **I43** — **Which styles a form has an arm for is a total record, and a fill is the braille arm's.** `plotStyle` was a shared union with `candlestick` refused on the wrong form by a clause naming that style — right, and a special case: every style is one some forms draw and others do not, and a second would want a second clause. `STYLE_ARMS` is `Record<PlotForm, readonly PlotStyle[]>`, total, and the refusal is one rule over it. **A braille violin changes the vocabulary and not the geometry** — the outline strokes the dot grid at 2×4 a cell, which is where the smoothness comes from, while I39's odd extent and §3i's rungs stay the figure's; the box and the summary marks remain cell-resolution and composite over the fill. **`plotFill` is refused on the line arm** rather than ignored, because a box-drawing outline has no interior vocabulary and putting `█` inside `╭──╮` is a third figure rather than the same one filled. **A solid pie degrades to braille at one bit and does not refuse** — the hatch ladder is that depth's identity channel and a block glyph has no hatch, so I18's precedent applies: where the capability cannot spare what a figure needs the honest answer is the thing that fits, not an error the caller could not have avoided. **And a radar's line arm took four alphabets**, which is §3c proving itself: `plotStyle` names *draw this as a connected line* and the glyphs are the renderer's. `strokePolyline` steps orthogonally and a pentagon's every edge is oblique; `╱`/`╲` draw a clean pentagon *in isolation* and compose to rubble, because I40's union is braille's alone and the labels, polygons and frame each take cells from the others; one grid with an owner per cell fixes that and **still renders as dashes**, because those two glyphs are strokes inside a box and do not reach their corners. **Quadrant blocks are filled sub-cells and connect.** Half braille's vertical resolution and the same horizontal, traded for coverage — the right trade for a *shape* where braille's is right for a *curve*. **And the frame is continuous**: stippling answered a question about weight by leaving holes, and a stippled ring reads as a broken one rather than a light one, where `tone.muted` against the series' slots already separates them. *The pie keeps both its arms for the complementary reason — a solid pie has no seams and a braille pie has no gaps, and neither loses the shape* (§3w). **And the arm belongs to a routine rather than to a form.** `STYLE_ARMS` is keyed by `PlotForm` and says `violin` has a braille arm; a violin has five drawing routines and one of them had it — the vertical arm and all three raincloud rungs accepted `plotStyle` and `plotFill` and changed nothing, which is worse than refusing (the caller is not told) and worse than degrading (the reader is not told). *A total record over forms reads as a complete answer to a question it cannot ask.* The vertical arm honours both now, transposed — sampled at four dot rows a cell of value where the horizontal arm offsets at four dot rows a cell of width. **The raincloud rungs have it too, and the argument for skipping them was wrong on one axis**: their one-row cloud has eight ladder levels against braille's four, which reads as half the resolution and is not — a cell holds eight dots as 2 × 4, so the ladder spends all eight on magnitude at one sample a cell and braille spends them as five levels at *twice the sampling*. Equal budgets, different split. *Comparing the vertical axis alone is what made a trade look like a downgrade.*
- **I44** — **A layer declares what it is, and where two peers contend the cell goes to one of them by turn.** I40's union was measured against a pie, whose wedges meet along a **boundary**, and generalised to every layer — but two curves run *alongside* one another, and the union then draws one series' ink in another's colour by the hundred *(`slope-default`: 25 foreign dots against 20 own; the braille radar, 70 of 279 frame cells wearing a series slot; the quadrant radar, 80 of 98)*. **The radar is worst for a structural reason — a value ring and a data polygon are the same shape at different radii, so there is no locus small enough for *a seam a cell wide* to describe.** **Occlusion is right across kinds and wrong within one**: `"context"` under `"curve"` is a gridline behind a line and nothing is lost, while a series under a series answers *where did this one go* with **nowhere**. **And a cell holding one colour never meant a region holding one colour** — occluding gave all eleven contested cells to one series, a neutral tone gave them to none, and turning the owner with the column gives each a third: *125 / 119 / 122 of 134 dots kept in their own slot, nothing mistinted, no line absent for more than three columns.* **A surface does not rotate**, because a wedge is a region rather than a line and turning its boundary stipples every seam — surfaces union and the boundary keeps the topmost tone. *The same ruling governs the quadrant figure at 2×2, where it matters more because a quadrant is a filled rectangle and a braille dot is not* (§3u, §3w).
- **I45** — **A radar's grid is a polygon by default and a circle by option, and the two arms had silently chosen differently.** The braille arm drew its value rings with `arcDots` — circles — and the quadrant arm drew them as *n*-gons through the data's own vertices, so one form rendered two figures and neither the spec nor a test said which was meant. `plotGrid?: "polygon" | "circle"` makes it a decision. **Polygon is the default because the grid is a ruler for the shape measured against it**: at three categories a circular ring behind a triangular polygon is two figures in one frame, and a ring the data can touch at only three points answers *is this axis further out than that one* worse than one it meets along its whole length. At ten categories the two are within a dot, so the default costs nothing where its argument is weakest. **`"circle"` ships too** — it is matplotlib's default and what `make refdiff` compares against. *Neither is inferred from the category count: a figure that changes shape at a threshold is two figures with one name* (§3w).
- **I46** — **A compact box's interquartile run is filled or heavier, and the caller says which.** With one row a box has no lid or floor, so a blank interior leaves `┤    │    ├` — two tees, a rule, and nothing saying those cells are the box; the interior has to carry the range. **That is an argument for a *run*, and it was read as an argument for a *fill*.** `━` is not the whisker either, and it leaves the summary a line drawing. `plotBox?: "solid" | "line"`, `"solid"` by default. *Which one reads depends on what is behind it: against a raincloud's filled ladder the solid box competes for the same weight, where a heavier line reads as the summary of the shape rather than a second shape.* Standing up it is `┃` against a leftward `█` run, by the same argument. **`heavyHorizontal` and `heavyVertical` are new named slots** rather than a reuse of `candleFilled`, which is already `┃` — a name that lied about its use would be the defect SS47 exists for (§3i).

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
12. Y-labels are placed at the rows their values fall on, the ends are kept, and an interior tick that would abut one is dropped rather than overflowing a short plot (I15, I22).
13. **Every ramp step is visible and no ramp's lowest step is its padding character**, so a minimum reading never renders as absence (I16, §6).
14. **A heatmap is one cell per position per row against one shared range, magnitude in the ink and absence left blank** (I17, §3a).
15. **Width goes to columns before labels, and an unlabelled matrix is never drawn** — the opposite ladder from the line form, because a row label is an identity rather than a scale (I18, §3a).
16. **The legend never truncates the range it exists to state** (I19, §3a).
17. **A quantity against a scale is the `fill` encoding, drawn as a run whose number may exceed it** — with one label allowance for the whole chart, and the number above the bar rather than beside it where the run cannot shrink (I20, §3b).
18. **A vocabulary carries its encoding axis and a renderer asks for an axis** — so the mismatch that cost two defects is unspellable rather than reviewable, and a stand-in is declared rather than commented (I21, §3c).
19. **An axis is nice numbers, one precision from the step, and a density that is a result** — a derived bound snaps outward and a declared one never moves, a tick that would abut its neighbour is dropped, and a step the arithmetic cannot pick is nothing rather than a plausible constant (I22, §3d).
20. **An annotation is one feature and six named chart types are folds of it** — a dashed line in the data's own raster, behind it, with an out-of-range edge dropped rather than clamped; and the bar's target marker shares its name and not its mechanism (I23, §3e).
21. One compositor owns the gutter, frame and legend, and asserts its row count against `plotHeight` (I24).
22. `plotFrame` ships four shapes — box, corners, grid, rule — with `axes` still deciding whether furniture exists at all (I26).
23. A legend in four placements, auto-enabling only where it costs width rather than a declared row (I27).
24. Category identity survives colour loss, asserted as a sweep over every form rather than per form (I25).
25. `plotDetail` picks a renderer inside the declared height and degrades rather than overflowing (I28).
26. Magnitude is carried by colour where there is colour and by the glyph ramp where there is not, which is one rule with two arms rather than two rules (I29, I25).
27. **One rule generates both box-plot glyph tables** — the stub points toward the whisker — and the compact box is filled because it has no edges to enclose it (I33).
29. **One value axis across a distribution form's bands** — scaled to its own extent every band draws the same shape, and the comparison is what the form is for (I35).
31. **A cursor is marked where it points**, behind the data and on the rule, through a mapping the form owns — a readout whose column is unknown is a set of numbers about nothing in particular (I37).
30. **`candlestick` is a curve style over the positional machinery**, with its own typed data, a stated candle width, exact OHLC aggregation, and a readout that is load-bearing because a doji and an overlay line share a glyph (I36).
28. **`plotDetail` is a ladder of four rungs, every rung adding information rather than resolution**, with the jitter a pure function of the sample's identity — and the floor below the lowest rung is C04's refusal rather than this component's degradation (I34).
32. **Colour indexes an identity** — a row cut from a continuous axis has none and takes one colour, a named row keeps its slot, a row's interior identities are coloured by their owner, and a form whose rows *are* series declares it (I38, §3t).
33. **A mirrored figure draws on an odd extent** — a reflection needs a centre, the spare cell precedes the figure so the band's own label and tick still land on the spine, and the one-sided rungs are outside it (I39, §3i).
34. **A cell two surfaces ink carries both surfaces' dots** — unioned where the vocabulary allows it, first-wins where it does not, and coloured by the priority order either way (I40, §3u). *Curves do not union — see I44.*
35. **The positional family has an x axis** — nice numbers over a declared domain, the sample index where none is declared, in the row `axes: true` was already reserving; the caller's captions win it where they exist, and the form owns which column a tick lands on (I41, §3d.1).
36. **A histogram is every series binned on one edge set** — the union's, with the strategy's inputs taken from the union too, drawn through the bar's four layouts, and `overlap` meaning grouped because there is no overlapping picture and I8 forbids the alternative (I42, §3v).
37. **A form declares which styles it has an arm for** — a total record, one refusal over it, a braille violin that changes vocabulary and not geometry, a fill the line arm refuses, and a solid pie that degrades at one bit rather than refusing (I43, §3w).
38. **A layer says what it is, and a contested cell turns between the peers that want it** — surfaces union and keep a wedge's tone because their partition is arbitrary; peers take one cell in *n* each, because giving the region to one says the rest are nowhere and giving it to none says nothing is there; context is occluded by whatever is in front (I44, §3u).
39. **A radar's grid is a polygon or a circle, and it is declared** — the two arms had chosen differently and neither said so; polygon is the default because a ruler should share the shape it measures (I45, §3w).
40. **A compact box's run is filled or heavier** — the one-row box has no edges so its interior carries the range, which argues for a run and not for a fill; `"line"` keeps the summary a line drawing where `"solid"` gives it mass (I46, §3i).

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
- **T1.28** (I21): every ladder's `encodes` matches the axis it is keyed under, and `RAMP_ASCII` declares both of its axes with `height` marked as the substitution — asserted over the table, because the property is of the vocabulary and not of a call.
- **T1.29** (I21): `ladderFor` returns the axis it is asked for at every capability rung, and the fill pair is not reachable through it.
- **T1.25** (I20): the fill clamps at `max` and the number does not — `101.2` of `100` fills the run and reads `101.2%`, and that frame differs from `100` of `100`.
- **T1.26** (I20, C04 I50c): `value: null` draws a mark and not an empty run, and the two are asserted as a *difference* because an empty run is a legible value.
- **T1.27** (I20): exactly `width` cells at every width including 1, and the run takes the residual after the number.
- **T1.22** (I18): a heatmap whose labels exceed the width keeps a matrix and truncates the labels; below the rung where one label cell fits, it draws a notice at its declared height and **never a matrix with no names beside it**. Asserted at five widths, because the defect was a state reachable only between two of them.
- **T1.23** (I19): the legend's range survives a label column wide enough to have truncated it, and the drop order is asserted by rendering a row too narrow for all three parts.
- **T1.36–T1.39** (I30): the transpose, asserted as the four things that change — the gutter numbers the value axis where it named the categories, the names move under the columns, a column fills from the bottom with the **height** ladder's partials and none of the extent's, and a form with no vertical arm throws. **T1.37 is the one worth writing first**: a column built from the left-eighths is arithmetically perfect and draws a bar chart lying on its side inside every cell.
- **T1.40–T1.43** (I30): the box plot stood up — the lid, floor and median are **runs** rather than three cells, the box is narrower than its column so categories separate, the whisker's junction points the way the whisker goes, and the mean keeps its own mark. The first version drew three disconnected columns: the transpose of `boxplotBand` in arithmetic and not in figure.
- **T1.31** (I10): a facet column is measured in **display cells**, not code units — four styled facets compose to exactly `width` and all four survive. **T1.32** (I10): a facet short of its column is padded rather than pulling the ones after it leftwards. **T1.33**: the composed row reaches the frame with its escapes intact and no literal residue. **T1.34** (I10): `facetWidths` distributes the remainder, so three columns of an eighty-cell row are 27/27/26 and not 26/26/26 with two dead columns. **T1.35** is the **control** — an unstyled facet composes correctly under the wrong reading too, which is why every row above uses a styled one: `padEnd` is right whenever there is nothing invisible to miscount.
- **T1.1b** (I24): `composeRows` pads a short block and cuts a long one to `plotHeight`. **A guard whose trigger has not fired**, and the row exists because the mutation pass swapping the clamp out killed nothing: no form routed through the compositor gets the count wrong, and four outside it do — `radar` and `horizon` declare `axedFurniture` and draw none of it, `smallmultiples` and `pairplot` return whatever the facet layout produced. Kept on the asymmetry rather than on odds.
- **T1.20** (I16, I17): the heatmap's ramp is `RAMP_DENSITY` and not `RAMP_BRAILLE` — asserted as a *difference*, because both are eight narrow braille steps and a frame drawn with the wrong one is a matrix of bar fragments that every count agrees with.
- **T1.21** (I17, I29): an absent cell and a minimum cell are distinguishable **at every rung** — the converse of the sparkline's rule, stated from the other side. Above 8-bit the minimum is a *painted blank* and the absent cell carries no background; below it the density ramp carries both again. The row used to assert the ramp glyph, which is the mechanism rather than the property, and it failed the day I29 moved the mechanism while the invariant it names held perfectly. It also asserts the painted cell is **empty**: a renderer that painted the background *and* kept the glyph satisfies every other assertion and is exactly the speckle I29 exists to end.
- **T1.17** (I17): **a matrix and a stack of lines with the same data at the same width do not render identically.** The row worth writing first: if they match, the form member is not reaching the renderer, and nothing else about a heatmap distinguishes it from the arm it would otherwise fall into.
- **T1.18** (I17): the range is shared across rows — two rows of different magnitude draw different glyphs for the same value, and normalising per row would make every row look alike.
- **T1.19** (C04 I50b): the three refusals and the height, each with the converse — a heatmap that declares none of them constructs.
- **T1.15** (I16): every ramp — Unicode, ASCII, braille — has eight steps, each visible, monotone in ink, and **no step equal to the pad character**. Asserted over the constants, because the defect is a property of the set rather than of a call: `sparkline([0, 5], 6, wide)` measured 6 cells and drew its minimum as whitespace, so every width and length row passed against it.
- **T1.16** (I4, C04 I46): `null` is a gap in both forms — the line breaks across it and the sparkline marks it — and a series carrying `null` **round-trips through JSON unchanged**, which `NaN` does not. The row a fixture of `NaN` cannot express.
- **T1.14**: pinned `yMin`/`yMax` override the computed range, and out-of-range points clamp to the edge rather than escaping the grid.
- **T1.67** (I33): the stub points toward the whisker in both arms — `├` at the min cap and `┤` at Q1 horizontally, `┬` at the max cap and `┴` at Q3 vertically — asserted as the *rule* over both tables rather than as two literal figures, so a table transcribed correctly from a wrong rule still fails.
- **T1.68** (I33): a compact box is filled between Q1 and Q3 and a three-row box is hollow there, and a mean landing on the median draws `◈`.
- **T1.69** (I34): `plotDetail: "auto"` picks the richest rung the declared height affords — 1, 2, 3 and 5 rows give the box, the raincloud, the jittered raincloud and the mirrored violin — and `"compact"` gives the *form's* lowest rung, which is 1 for a boxplot and 2 for a violin.
- **T1.96** (I21, I34): the strip reads the box's axis and resolves twice its detail — the minimum inks column 0, the maximum the last, and two values half a cell apart resolve into one cell's two dot columns, which is a distinction the box cannot make at any width. The vertical arm inverts with its box: `max` on row 0, `min` on the last. And the ASCII arm draws only its rug mark — never a ramp step, which would encode a magnitude from where a sample landed inside its cell.
- **CS1** (I36): a candlestick block with `ohlc` and `series: []` renders candles — not the empty message. **The first row, because it is the one that would have been got wrong**: every emptiness check in the component asks about `series`.
- **CS2** (I36): a body spans open→close and a wick low→high in the same column, at the four capability sets — and the bullish and bearish bodies differ by *mark* at **every** depth, not by tone alone (I25). **Asserted on the colour-stripped rows**, which is both what makes it a mark assertion and what the catalogue's `.plain` frames show.
- **CS9** (I36, §6b B13): a wick reaching no row beyond the body draws `┿` in the body's end cell rather than the body glyph — **and every candle still carries its direction in some cell**, asserted over a frame dense enough that the body is one row and one column, which is the case that produced a chart of nothing but `┿`.
- **CS3** (I36): `candleWidth` is `clamp(⌊areaWidth ÷ n⌋ − 1, 1, 5)` and the pitch is `min(⌊areaWidth ÷ n⌋, candleWidth + 1)`, the wick is centred at an odd width and left of centre at an even one, and **two adjacent candles never touch above the one-cell budget**. Asserted at a width where the clamp binds and at one where it does not, and at the budget where the gap is unaffordable.
- **CS4** (I36): more bars than columns aggregate — open of the first, high of the maxima, low of the minima, close of the last. **Asserted against a series whose extreme falls on a bar that sampling would drop**, since an aggregation that happens to agree with sampling tests nothing.
- **CS5** (C04 I57): `plotStyle: "candlestick"` with no `ohlc` is refused at construction, by both gates.
- **CS6** (C04 I57): `plotStyle: "candlestick"` on a form that is not `line` or `step` is refused, by both gates.
- **CS7** (I36, §6b B6): the readout carries all four values and then each overlay series, formatted through `yFormat` rather than a hand-rolled rounding — and a cursor past the end of `ohlc` reads **four** dashes. **Asserted on `yFormat` rather than on the rounding**, which is the half a rounding assertion cannot see: `Math.round(v × 100) ÷ 100` and `formatReadout` agree on `12.64` and disagree on whether it is a percentage, so a mutation restoring the old line survived twelve assertions.
- **CS7b** (I36, FINDINGS F182): `formatReadout`'s numeric arm keeps the digit the producer sent — `45.2`, not `45` — and does not manufacture one: `1284` stays `1284`, and a computed value stops at **four significant figures** rather than at a decimal cap. A flat six places is right for `0.023` and prints a sine as `55.827460`, which a catalogue frame is what showed. The four values of one readout share **one** precision (F177), which is a claim only a caller can make and is why `readoutSet` takes a set rather than an argument.
- **CS8** (I36): a wide terminal fits the **same** number of candles as a narrow one and draws them `= # |`, and the frame is exactly its declared width at both. **The row that would have asserted the conflation**: its first form said *half as many*, which is what the section said before `glyphs()` was measured — and the reason the golden frames carry both widths is now that the two agree.
- **T1.100** (I33): a band whose `q3` equals its `max` draws no stub at the box's right edge, and one whose `q1` equals its `min` draws none at the left — `│` on the spine, `─` on the vertical arm's lid. **Asserted at the degenerate end and at the ordinary one in the same row**, because a fix that removed every stub would satisfy an assertion written only about the collapsed case. The ASCII arm cannot express the difference — every box-drawing glyph collapses to `+` — so the row states that rather than asserting a distinction the alphabet does not have.
- **T1.98** (I35): three distributions of very different spread in one block draw three different widths, and the same three scaled to their own extents draw the same shape. **The fixture responds first**: the spreads differ by a factor that a shared axis must show and an unshared one cannot.
- **T1.97** (I34): eighteen bands in a vertical violin at a width their count does not divide — every band draws the same rung, and the three bands a cell wider draw that rung wider rather than a different one. Asserted over the *set* of figures in the frame rather than on any band, because the defect is that the set has two members.
- **T1.95** (I11, I34): the jitter is decorrelated from the index it is drawn from — every position is reached, fewer than half the indices agree with `index % positions`, and a second band is a different speckle. **The sawtooth is the row's subject**: it is deterministic, satisfies I11, and draws diagonal stripes through sorted data.
- **T1.93** (I21, I34): the vertical cloud is a run that grows toward the box — ink in the cloud is a suffix, the fractional tip sits at the run's end *away* from the box, and no cell carries the rightward vocabulary's partial. **Three assertions because the caller right-aligns either way**: a reversed vocabulary draws the same run in the same cells with its tip on the other end, which is a dot-column of daylight against the box and invisible to an alignment check. The fixture is shown to produce a fractional tip first, since a cloud that saturates every row it touches is a full run in both directions. Plus the two width rules, **each asserted at the slot where only it bites**: the cap at twenty-one columns, where three fifths would give thirteen; the narrowing at six, where the cap alone leaves five of six and no gap; and the budget's own three, where the figure takes the slot whole. At eleven either rule alone is sufficient, so a row written there passes against a tree missing either — which is what the first form of this row did.
- **T1.94** (I34): the *renderer* reaches the raincloud, not only the function — a violin at `"compact"` and a violin in two rows both draw a height-ladder step, and one at `"full"` in twelve rows draws none. T1.91 and T1.92 call `rainRows` directly and pass on the day nothing calls it; this is the row that fails when the rung is chosen and then ignored. Discriminated by vocabulary rather than by shape: the cloud is the only thing a violin draws that reaches for a ramp at all.
- **T1.91** (I34): a raincloud's cloud and its box read the same axis — the column holding the cloud's maximum is the column holding the box's median, for a distribution whose mode *is* its median. Asserted against a skewed sample as well, where the two columns differ and must differ by what the data says rather than by a tenth of the width. **The fixture responds first**: sampled on the violin's padded axis instead, the symmetric case is off by ⌊w ÷ 10⌋ and the row fails.
- **T1.92** (I34, I16): outside the cut the cloud row is blank and inside it the smallest reading is the ladder's first step, never a space — a tight distribution in a wide band leaves the row's ends empty rather than ruled, and no column of the drawn support is blank.
- **T1.90** (I28): a compact box plot at three categories in twelve rows, and a three-row box in five — the set of rows carrying a box spine and the set carrying a category name are **the same set**. Equality rather than containment, because *every named row has a spine* passes on a frame with spines elsewhere too and *every spine is named* passes on one where a band lost its name. **The glyph took two goes and both misses were furniture**: the median is `│`, which is the plot's right border on every row, and the box's minimum cap is `┤`, which is the gutter's axis tick on every named row by construction. `├` is drawn by the spine and by nothing else in the frame. Not asserted at a row index, which an off-by-one in the offset satisfies when the index is written from the same expression.
- **T1.88** (I34, I21): a vertical raincloud draws a leftward `extentRun` and a horizontal one a `ladderFor("height")` step — asserted by the glyph set each produces rather than by the call, so the row survives the call being moved. The five levels at two columns are `⠀⠀ · ⠀⢸ · ⠀⣿ · ⢸⣿ · ⣿⣿`.
- **T1.71** (I34, I11): rendering the same block twice returns identical rows, and the jittered strip's offsets are a function of the sample's index alone.

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
- **T3.17** (I24): on a terminal reporting `ambiguousWidth: "wide"`, a label carrying an ambiguous-width character leaves every row's border in the **same cell column**, across all four gutter paths — positional, categorical, banded, matrix. Asserted by *measuring the rows against each other* rather than by matching a border at a fixed offset, which would pass on a frame where every row is wrong by the same amount. The fixture is shown to respond first: `a→b` is 3 cells narrow and 4 wide, and a label with no ambiguous character passes against a renderer that ignores the capability entirely.

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
- **T6.16** (I18): dropping the label column instead of truncating it → T1.22 fails, and a heatmap between two widths becomes a picture of numbers.
- **T6.15** (I17): dispatching `form` with a two-armed switch again → T1.17 fails, and a heatmap renders as a line, silently and correctly-shaped.
- **T6.13** (I16): restoring `U+2800` as the braille ramp's first step → T1.15 fails, and every wide-terminal sparkline draws its minimum as padding.
- **T6.14** (I4, C04 I46): narrowing `Series.values` back to `readonly number[]` → T1.16 fails, and a gap is expressible only as a value the validator refuses and JSON rewrites.
- **T6.19** (I10): measuring a facet column with `padEnd`/`slice` → T1.31 fails, and every facet after the first is cut away mid-escape. Facets are the one place in C12 that composes rows another renderer has already *painted*, and both operations count code units.
- **T6.20** (I10): re-painting the composed row through `line` → T1.33 fails, and the escapes print as text. `clampSpans` measures span text with `cells()`, which counts a painted row's escape bytes as visible. **Unreachable until T6.19's defect was fixed** — the old cut to 80 code units left the clamp believing the row fitted, so one defect masked the other and the correct fix to the first is what exposed the second.
- **T6.17** (I24): the gutter measuring or padding against a default `ambiguousWidth` → T3.17 fails, and the axis bends by one cell on the labelled row only. **One row and not two**, because either half alone produces it: the budget and the drawing disagreeing is the failure, and which of them moved is the diff's job.
- **T6.18** (I15, I22): `yLabels` calling `niceAxis` instead of `axisFor` → S9 fails, and a log plot is labelled linearly. Invisible from the block: `positionalForm` picks the right ticks and reads only `.range` off them, so the correct set is computed and discarded while the labels are derived a second time from the linear arm.
- **T6.21** (I34, I11): replacing the jitter hash with a counter → T1.71 fails, and the same block renders differently on its second draw. **Nothing else sees it**: every width, row-count and glyph-set assertion passes against a moving strip, because each render is internally consistent and only the pair disagrees.
- **T6.31** (I36): dispatching candlestick through `styleRasteriser` → CS1 fails, and the `Rasteriser` type describes a function that ignores the argument it is keyed on.
- **T6.30** (I35): computing each band's bounds from its own samples → T1.98 fails, and three distributions of different spread draw one shape with every count agreeing.
- **T6.29** (I34): choosing the rung from each band's own width rather than from the narrowest → T1.97 fails, and a chart whose band count does not divide its width draws two different figures with the boundary set by the remainder.
- **T6.28** (I11, I34): placing the strip from a module-level counter → T6.28's own row fails, and a block renders differently the second time. **The fixture is the finding here**: at sixty samples and four positions the counter's phase resets between renders and the two frames are byte-identical, so the row passed against the defect it names until the count was made coprime.
- **T6.28a** (I34): the strip taking its two-column ceiling before the cloud has its two-column floor → T1.93 fails, and the raindrop draws three levels of density at the width whose budget promises five.
- **T6.27** (I34): dispatching `rain` to `violinRows` — the rung still chosen, the figure ignored → T1.94 fails and nothing else does. **The wiring mutation**, and it survived four rows written about the raincloud because every one of them called the function.
- **T6.26** (I21): building the vertical cloud's run with the rightward vocabulary → T1.93 fails on the tip. Both arms right-align, so the run occupies the same cells and only the fractional glyph moves — to the end against the box, where it leaves a dot-column of daylight between the cloud and the box it belongs to.
- **T6.25a** (I34): dropping the cap so the figure is three fifths of its slot → T1.93 fails at twenty-one columns, and a wide band draws a fourteen-cell solid run whose shape is legible only along one edge.
- **T6.25** (I34): dropping the vertical figure's narrowing so only the cap remains → T1.93 fails at six columns, and a band's cloud sits hard against its neighbour's box. **Two mutations because the two rules overlap**: at eleven columns either one alone leaves the gap, and a single row written there survives both.
- **T6.24** (I34): sampling the cloud on the violin's padded axis → T1.91 fails, and the raincloud's mode moves a tenth of the width off the median it sits above while every value stays in range and every count agrees. **The mutation that cannot be seen from a number**, which is why the row is written about two columns of one frame rather than about a scale.
- **T6.23** (I28): returning the label to `⌊band ÷ 2⌋` → T1.90 fails at both rungs, and every rung below the top one has its category name pointing at a blank row. The pre-change pair — that expression *and* no offset — fails it too. **The third mutation is the one that says which half is the ruling**: dropping the offset alone, leaving the label tracking the figure, fails nothing and is *meant* to, because a top-aligned figure named on its own middle row is equally right. It is a recorded control rather than a gap, and it is what stopped the centring being written down as the fix.
- **T6.22** (I34, I21): a vertical raincloud reaching for the height ladder → T1.70 fails, and the density draws a per-cell scale where the axis is a run. Arithmetically self-consistent — the levels are monotone and the row count is right — and wrong about how much of each cell a level fills.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Where the numbers come from | C07 adapters, the S-series |
| Terminal image protocols for real charts | Phase 1B — C02 detects them, nothing uses them |
| Interactive plots — **who moves** a cursor: zoom, hover, the key or mouse column that sets `cursorPositions` | Phase 2 · nothing in `src/` writes it (§3s) |
| Axis tick density beyond max/mid/min | Phase 1B |
| Tone → colour | C10 |
| Column planning around a sparkline cell | C11 |
