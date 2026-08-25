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

**Axes.** Up to three y-labels — max, midpoint, min — formatted per `yFormat`, right-aligned in the label column, placed at the max, mid and min row indices of the plot area, each with a `┤` on the border beside it (§3f). **The ticks and the range both arrive from the caller as one `Axis`** — `yLabels` computes no axis of its own. It niced a `Range` for itself once, which made two nicings of one axis: the log arm was reached in `positionalForm` and the labels were derived from the linear one, and after the scale was threaded through to settle that, the two remained free to disagree about *range*, which they did on 12 of 23 heights (§3d, F210). **They collapse when the height cannot hold three**: at `height: 2` the max and the min, at `height: 1` the max alone. The midpoint goes first because the extremes bound the data and the midpoint is interpolation between them. Without this clause the section contradicted T3.2, which renders `height: 1` with axes.

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

### One axis per plot, and it is computed where the data is measured

**The range the curve is rasterised against and the range the gutter is labelled from are the same
object**, because two of them cannot be kept in step. `yLabels` takes an `Axis`; it does not take a
`Range` and nice one for itself. `positionalForm` calls `axisFor` once and hands the result to the
rasteriser and to the gutter.

**`niceAxis` is not idempotent, and that is the whole mechanism** (F210). A second pass sees the
already-snapped span, so `span / (ticks − 1)` is larger, so the step is coarser, so the ends snap
further out. The table above is the first pass; a second one takes *request rate* from `250 … 1000`
to `0 … 1000`, and that is the frame this component shipped — **the cost table said 250 and the
gutter drew 0, for as long as both existed.**

| series | data | the curve's axis | what a second nicing labelled it |
|---|---|---|---|
| `bubble` | 1 … 30 | 0 … 30 | 0 … **40** |
| `line` | 1 … 5 | 0 … 6 | 0 … **7.5** |
| request rate | 392 … 960 | 250 … 1000 | **0** … 1000 |

The bubble row has no rounding in it: the largest bubble is the axis maximum, so it draws on the
top area row, and the gutter called that row 40.

**Pinning the second pass is not the fix, and trying it is what showed why.** Pinning both ends
holds the range still and leaves the *step* coarse, so the end label takes the coarse step's
precision — `13` on the row holding `12.5`. The range and the precision come from the same
arithmetic, and only one call has all of it.

**A stacked plot carries bounds rather than an axis**, and says so: its gutter holds series names
(§5), so nothing is labelled against it, and nicing the bounds would move the ink for a scale no
reader is given. The object it passes has the raw range, the two ends as ticks, and a step of zero.

**The previous remedy is what built this one.** The same class was found once before on the same
function — a log plot picked log ticks in `positionalForm` and was labelled linearly — and was
fixed by threading the *scale* into the second nicing so the two would agree. **Two computations
that agree about one input are still two computations**, and the next divergence was about a
different input entirely. `pin` and `scale` were parameters of the copy; both went away with it.

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

### Two kinds shipped without a spec, and one gate refuses them

**The table above lists what is not built and is missing the two that are.** `Annotation` has
**four** members — `line`, `band`, `confidence` and `whiskers`. C04 I52 enumerated two.
`FigureBuilder` constructs all four, `annotate.ts` renders all four through `confidenceRows` and
`whiskersRows`, and no line of either spec said what they draw or why they exist. They arrived
with a renderer and without a ruling, which is §3q's shape arriving on a **type** rather than on
a section.

**The enumeration was load-bearing, and the validator held the same belief.** `checkAnnotations`
reads

```
const edges = a["kind"] === "band" ? ["from", "to"] : ["value"];
```

so every kind that is not `band` must carry a finite `value` — and `confidence` carries `upper`
and `lower`, `whiskers` carries `points`. Measured at both gates, on a block each builder method
produces:

| kind | builder | validator |
|---|---|---|
| `line` | ok | ok |
| `band` | ok | ok |
| `confidence` | ok | **refused** — *annotation "value" must be a finite number (C04 I52)* |
| `whiskers` | ok | **refused** — the same message |

**A block the builder makes and the renderer draws cannot cross the boundary C04 exists for**, and
it is refused by a message naming a member it does not have, citing the invariant whose
enumeration is the thing that is wrong. **Two records of one belief, and neither could correct the
other** — the prose said *two kinds* and the `else` branch assumed *every kind has a value*, so
each read as confirmation of the other.

**Why nothing caught it, and it is the awkward answer.** An app calling `b.figure().confidence(…)`
builds in process and renders; `validateBlock` is on the path a *document* takes. So the defect is
invisible to every local consumer and fires only on the wire — the reader who sees this refusal is
the one who did nothing wrong, which is `ask-who-sees-the-refusal` pointing the other way from
usual.

Ruled: **the edge check dispatches per kind and is total over `Annotation["kind"]`**, so a fifth
member does not compile without a row. A `switch` rather than a ternary, for the reason every
total record in this component exists.

### How a band is filled, and the alphabet is the whole ruling

C04 I52's refusal of the fill is half reversed and the surviving half decides the drawing:

| | draws | why |
|---|---|---|
| the two edges | dashed, unchanged | F34 — the mark carries it and the tone does not |
| the interior | `░` U+2591, on a **narrow** unicode terminal and there alone | block elements — a *different alphabet* from the curve's braille, which is what the refusal was right about |
| at 1-bit | both, and they are still told apart | the alphabets differ, so no colour is needed to separate them — asserted, never assumed |

**Braille is the one thing the fill must not be**, and it is the obvious choice: the request that
prompted this proposed it by name. A braille fill under a braille curve is one alphabet in one
cell, which is precisely *indistinguishable from the curve at one bit*. The original refusal named
the right mechanism and drew the wrong conclusion from it, so only one half reverses.

**The first draft of this table had three cells and all three were wrong, which is what the walk is
for.** It read *the density ladder's low rung: `░` at unicode, `.` at ASCII*, and none of it
survives measurement:

| the claim | measured |
|---|---|
| `░` is the density ladder's low rung | `RAMP_DENSITY[0]` is **`⠄` U+2804, a braille glyph**. The sentence names braille as the substitute in the same breath as forbidding braille, and reads as consistent because *density* and *shade* are the same word in English and two vocabularies here. `░` is `pairFor`'s `empty` — the **fill** Pair, a different type on purpose (§3c: *a ladder maps one value to one glyph; a fill maps one value to a count of two*) |
| `.` at ASCII is a different alphabet from the curve | **`.` is `RAMP_ASCII[0]`** — the curve's own first rung. `curve.ts` folds the ASCII grid through `ladderFor("height", caps).steps`, and `line-annotated-ascii-wide.plain` shows it: the last area row reads `@#++=-:...:` and the `.` and `:` in it are curve ink |
| the unicode arm is one arm | it is two. `cells("░", "wide")` is **2** by the framework's own measurer, so on `ambiguousWidth: "wide"` a filled row occupies twice its declared cells — `pairFor` records exactly this failure, found in a golden that had been reviewed and committed |

**So the fill draws on one arm of three, and the other two are stated rather than left to a
fallback:**

| unicode | ambiguousWidth | the curve draws in | the fill |
|---|---|---|---|
| `full` / `bmp` | `narrow` | braille U+2800–28FF | **`░` U+2591** |
| `full` / `bmp` | **`wide`** | braille (narrow on both kinds — `curve.ts` says so) | **none** — `░` doubles, and every narrow substitute the tree has is braille, which is the curve's |
| `ascii` | any | `.:-=+*#@` | **none** — the ramp *is* the curve's alphabet, and `-` is the annotation's own dash |

**Where the fill does not draw, the two dashed edges carry the band** — the figure that ships today,
so the degradation is a frame that was already complete rather than a hole. *That is the difference
between a capability arm with no vocabulary and a member that does nothing (F207): one is C12 I25's
substitution ladder reaching its bottom rung, the other is an unimplemented field.*

**The tempting third option is a punctuation mark and it is refused.** `` ` ``, `~` and `,` are all
narrow, all outside both alphabets, and all *text* — a plot area sown with apostrophes reads as
noise rather than as area, and F34's rule is that a mark carries meaning or is not drawn.

**And the width table is over-broad by eleven code points, which is recorded and not fixed here.**
`isAmbiguous` sweeps U+2580–U+259F whole, on the reason *block elements — the height ladder lives
here*, and the reason is exact about the ladder: U+2581–U+2588 are all `A`. Measured against
UCD 14.0.0, **eleven of the block's thirty-two are `N`** — U+2590, **U+2591**, and the ten pure
quadrants U+2596–U+259F. An exact table would let the fill draw on the wide arm. It would **not**
unblock the radar's quadrant alphabet, which is the other thing that would seem to follow: four of
`QUADRANTS`' sixteen entries are the half-blocks U+2580, U+2584, U+258C and U+2588, and those are
genuinely `A`. So the sweep is over-broad and right where it matters, and the asymmetry decides it
— reading a narrow glyph as wide declines to draw, reading a wide one as narrow corrupts the
geometry of every figure in the framework.

**The layer already exists and it is not the one this sentence first named.** The draft read
*layered as a `surface`, and §3u's `Layer.kind` ranks `surface` below `curve`* — two errors in one
clause, and reading the mechanism is what found them. An annotation is `kind: "context"` and has
been since it was written, which is exactly the disposition the fill wants: *drawn behind, and
occluded by anything in front*. And **`Layer.kind` does not rank**. Order does — `mergedRow` takes
the first layer that inked a cell, and `layers` is `[…series, …under, …annotations]`, so the
annotation is last and loses by construction. `kind` decides something else: whether two
contending layers **union or occlude**. Moving annotations to `"surface"` would have changed two
overlapping bands from occluding to unioning, which is a behaviour nobody asked for and which
would have moved frames.

**So the contest the original refusal assumed unresolvable was already owned, and by a mechanism
one word away from the one named.** The union is per dot and applies where *every* candidate is
braille (§3u); `░` is a block element, so a cell where the curve and the fill both want ink
cannot union and falls to first-wins — the curve. *The fill is safe from the curve by
construction rather than by a rule, and the two dashed edges keep unioning with it as they do
today.*

**The interior clamps where the edge is dropped, and the two rules do not conflict because they
say different things.** C04 I52 drops an out-of-range edge because a threshold clamped onto a
scale it is outside says *the limit is here* about a place the limit is not. The interior says
*the region covers here*, which stays true of every visible cell whatever the edge does — so a
band whose upper edge is above the ceiling fills to the top row and draws no upper edge. The
alternative is worse and it is the one that follows from reading the rule as one rule: a dashed
lower edge with no fill above it reads as *the band ended*.

**`fill` defaults on.** A band drawn as two unconnected dashed lines is the reading a caller has to
be told to want; matplotlib's `fill_between` is the one they arrive expecting.

**And `fill: false` does *not* keep the old frame, because reading the frame found the old frame
was wrong.** The draft claimed byte-identity and it was the safety argument for moving the default.

Measured as the annotation's own contribution — the same plot rendered with the band and without
it, differenced — over a 50-column area at `DASH_CELLS = 2`, where two edges have about fifty
dashed positions to ink:

| samples | edge ink, before | after |
|---|---|---|
| 8 | **2** | 27 |
| 12 | 5 | 37 |
| 24 | 8 | 40 |
| 50 | 16 | 30 |
| 100 | 24 | 24 |

**The ink was proportional to the sample count and not to the area**, and at eight samples the two
edges of a confidence band inked **two cells**. The cause is one clause: a dot is set where a
*sample's* dot column satisfies the dash test, `dotCol % (DASH_CELLS · BRAILLE_DOTS.x) === 0` — an
intersection of *where a sample lands* with *where a dash is allowed*. **The dash is a property of
the drawn line and not a filter on the samples**, which is how `line` and `band` already draw
theirs: `for (x = 0; x < dotWidth; x += DASH_CELLS · dots.x)`, every step inked, the row constant.

**The last row is why it shipped.** At a hundred samples in fifty columns the two agree exactly,
because every dashed column has a sample to land on. Any fixture with more readings than cells
renders the defect invisible, and a catalogue fixture is exactly that — `a-defect-proportional-to-a-
small-count`, arriving from the other end: correct for **large** *n*, and the fixtures are all large.

**The first version of this table said seven, at every sample count, and the invariance was the
argument.** It was measured against a block with `series: []`, so every frame in it was the empty
message and `No data.` inks seven cells. The instrument answered a question about the fill by
reporting the width of a string. *`test/support/README.md`'s rule — a fixture is shown to respond to
the thing under test before it is asserted against — has a third instance, and this one is the
dangerous shape: the conclusion drawn from the fabricated number was **right**, so nothing about
the reasoning downstream of it looked wrong.*

So a confidence edge walks that same loop with the row varying — the value at each dashed column
interpolated between the samples that straddle it, which is the inverse mapping the interior needed
anyway. One helper, two callers, and the edges and the fill agree about where the band is by
construction rather than by two rules that match.

*This is why the frame read is scheduled rather than optional. The edges were specified, built,
rendered, reviewed and committed, and the member that made anyone look at them was a different
one.*

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

## 6c. The right-hand gutter walk — the table and the trace, before any code

A gutter has **structure** and a ladder has a **sequence**, so this takes both artefacts: a
classification table for the interactions that hold at rest, and a trace for the ones a step
mediates. Taking the table alone because a layout looks static is how the sequential half goes
unexamined — and the ladder is sequential by construction, since rung *N* is reached only
because rung *N* − 1 failed.

Ten findings. Eight are before any code — six cells where two correct statements overlap, two
from the trace — and **two arrived afterwards, from the two instruments a walk cannot be**: one
from running the code against the ruling and one from reading the frame it drew.

### 6c.1 The table — rules that both hold at rest

| the cell | the two rules that meet | what it resolved to |
|---|---|---|
| `yAxis` × the tick rule | *a labelled row carries a tick* meets *the label is drawn on the other side* | **1** — `gutterSpans` tests `label !== ""`, and every caller blanks the label when `labelColumn` is 0, so the rule has never seen a label it does not itself draw. `yAxis: "right"` is the first case that separates them, and the left border draws `┤` pointing out at nothing. The test becomes *this side draws the label*. |
| `yAxis` × `yLabels`' own guard | *no label column means no labels* meets *the labels are on the right* | **2** — three callers gate `yLabels` on `layout.labelColumn === 0`. A right axis computes nothing, and `"grid"` loses its horizontal rules with it (I26), because those are drawn on exactly the rows the gutter labels. One predicate, three consequences. |
| `yAxis` × `plotFrame` | *the right gutter mirrors the left* meets *`"rule"` has no right edge* | **3** — the two `bare` predicates differ on purpose: `"corners"` on the left, `"corners"` and `"rule"` on the right. Mirroring the *glyph* draws the rule that style is defined by not having. Mirror the shape; take the edge from the right-hand predicate. |
| `yCallout` × the column's width | *the column is sized before the layout* meets *a `+N` count needs the ink* | **4** — the callout's **text** is layout-independent and its **row** is not, so the count is circular where the text is not. Resolved to a one-cell mark (§3x). |
| `yCallout` × the legend | *a callout names the series* meets *a legend names the series* | **5** — they name different things. The request's argument that a callout *says which line is which* holds only with the legend present, so there is no suppression and the auto-enabled legend stays. |
| `yCallout` × `colourDepth: 1` | *the callout is highlighted* meets *`MONO.emphasised` is `{ bold: true }`* | **6** — the highlight channel is already spoken for at the one depth it was chosen for. The carrier is a mark (I25, §3b). |
| `yAxis: false` × the matrix family | *`false` removes the y labels* meets *a matrix's row labels are its ordinate* | **7** — refused, which is C04 I50b's argument for refusing `axes: false` there, arriving on the second field able to express the same thing. |
| `yCallout` × a trailing `null` | *the callout names the last value* meets *the line breaks at a gap* | no conflict: the last **finite** sample is both the value named and the last ink drawn, so the two halves agree without being reconciled (I4). |
| `yCallout` × `plotStyle: "line"` | *the callout reads ink* meets *a different rasteriser drew it* | no conflict, and it is the reason the placement reads ink at all — §3x's measurement is what this cell produced. **And it is the cell the first test row got wrong**: a `line` renders through `lineDrawRows` by default, which maps at *cell* resolution, so a row written without `plotStyle: "braille"` asserts against the arithmetic it is trying to rule out and agrees with it. |
| `yAxis` × legend placement | *both want the right edge* | no rule needed: `reservedFor` narrows the row before `layoutFor` runs, so the gutter is inside `layout.width` and `axed` appends the legend outside it. The legend sits outside the axis because it cannot do anything else. |

### 6c.2 The trace — the ladder, width by width

A four-cell label (`1284`), `MIN_AREA` 4, `AXIS_GUTTER` 2, `FRAME_RIGHT` 1. `L`/`R` are the two
label columns, and a rung is reached only because the one above it did not fit.

| width | `"left"` | `"right"` | `"both"` | `false` |
|---|---|---|---|---|
| 5–6 | rung 4 · no furniture | rung 4 | rung 4 | rung 4 |
| 7–10 | rung 3 · no labels | rung 3 · no labels | rung 3 · no labels | rung 1 · area = *w* − 3 |
| 11 | **rung 1 · L4** | rung 3 · no labels | rung 2 · L4 only | rung 1 |
| 12–15 | rung 1 · L4 | **rung 1 · R4** | rung 2 · L4 only | rung 1 |
| 16+ | rung 1 · L4 | rung 1 · R4 | **rung 1 · L4 R4** | rung 1 |

Three readings, two of them findings:

- **`"both"` is one axis between 11 and 15**, which is the rung doing its job rather than a gap:
  the right column is a copy of the left, so it is the cheapest thing in the frame to lose.
- **8 — `"right"` keeps its labels one cell later than `"left"`.** An unlabelled left gutter
  still spends the cell that separates a label from its border, so the two sides do not cost the
  same for the same label. Ruled in §3x and kept with both figures rather than equalised.
- **9 — the ruling on a spanning column was wrong, and only the code could say so.** Neither
  artefact indexes *what else is in the cell the answer is read from*, because the ink is not a
  rule; the walk chose the span's midpoint and the implementation put it on the row the
  cell-resolution shortcut gives. Corrected to the far end in §3x, with the measurement.
- **10 — a label reaches a zero-wide column and `padStart` will not cut it**, so the frame's lid
  sat one column left of every row it enclosed. Found by reading the frame, which is the third
  consequence of findings 1 and 2's conflation — and the first form of the *fix* asked about the
  label where it should have asked about the column, which cost every unlabelled row its padding
  and was caught by PC12. *The same conflation three times, once inside its own repair.*
- **Rung 2 is a no-op at `"right"`** — dropping the right column there produces exactly what
  rung 3 produces, because there is no left column to fall back to. Recorded rather than
  special-cased: the rung is named for what it does at `"both"`, and a second arm to make the
  name true at `"right"` would change no cell of any frame.

---

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
arrive with their first surface.* This is that surface.

**It was written that one row closes two conditions, and it closed one** (F217). C04 I52 defers
`Annotation.label` here — *it arrives with the legend row that can hold it* — and the row
arrived without the field: `Annotation` has three arms and none carries a label, at HEAD, some
commits after this sentence was written. **A sentence that says a condition is closed is not a
mechanism that closes it**, and it reads exactly like one — which is the whole reason the
paragraph beside it says such conditions are *watched by nothing*.

**And the arm that would offer the row still counts the wrong thing.** `legendPlacement`'s auto
branch keys off `SHARES_CELLS[form] && count > 1` over **series**, so the case C04 I52 was
written about — one line, one reference line — resolves to no legend. The field and the count land
together or the field lands unreadable.

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

**Skipped where the form has already labelled its own rows**, which at `colourDepth: 1` is the
positional family falling back to `stackedRows`. There the swatch names a mark that appears
nowhere, because the strips are not drawn with `markOf` — so it is a legend that has stopped
being one and still occupies the width.

**This paragraph read *skipped entirely at `colourDepth: 1`* and the code has said otherwise for
some time** (F217). `legendEntries` carries the correction in its own comment — *skipping the
legend at one bit is the same error one layer up: it means little where colour leads and it is
the **only** thing that means anything where colour does not* — and `markOf` descends the same
ladder as the figure, so a 1-bit legend shows the marks the plot is actually drawn with. **The
implementation was fixed and the spec was not**, and a reader taking the spec as the contract
would have re-broken it. Recorded rather than silently narrowed, because which way the sentence
moved is the part worth keeping.

**What one bit takes from a label is its identity, never its leader.** A leader line is `─ │ ╰`
and degrades to `- | +` through `linedraw.ts`'s `ASCII` table, so it survives every alphabet the
framework has — the arm to worry about is `unicode`, not `colourDepth`, and it is already built.
What one bit removes is *which series a label belongs to*, because colour is the carrier. So a
label takes its series' `markOf` glyph as a prefix exactly where colour has stopped separating
the categories, which is the same predicate the swatch already uses (I25, I29).

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

## 3x. The gutter on both sides, and the last value at its own row

At eighty columns a reader cannot track a row back to a label seventy cells away, and every
financial and monitoring TUI mirrors the axis for that reason. A **live** chart has a second
problem the mirror does not solve: the number that matters most is the latest one, and it is the
hardest thing to read off a line that is still moving.

    yAxis?:    "left" | "right" | "both" | false     default "left"
    yCallout?: "none" | "last"                       default "none"

**Both cost width and neither costs a row**, so I1 is untouched. That is the vertical legend's
class exactly — I27 lets a `"left"` or `"right"` legend size itself *because* width is already
data-dependent through the gutter, where a horizontal one is a declared row and can never be.

### One label, two consumers

The right gutter writes what the left gutter was given, and which side draws it is a layout
decision. `yAxis: "both"` therefore renders the same ticks on both sides **by construction**
rather than by a second `yLabels` call — two calls could disagree, and a chart whose two axes
disagree is worse than one with a single axis. A dual-**scale** right axis is a different
feature and is refused: two ranges on one figure assert a correlation the data does not have.

**The tick belongs to the side that draws the label, and the rule in the tree says something
else.** `gutterSpans` draws `┤` where the label is non-empty and `│` where it is not — correct,
and never tested, because every caller blanks the label when `labelColumn` is 0. *A label
exists* and *this column draws it* have been one statement since the gutter was written.
`yAxis: "right"` separates them, and the left border draws a stub pointing out at nothing.

The same conflation is in the callers: three of them gate `yLabels` itself on
`layout.labelColumn === 0`, so a right axis computes no labels at all — and takes the gridlines
with it, because `"grid"` draws its horizontal rules on the rows the gutter labels (I26). One
predicate, three consequences, and the frame would have looked deliberate.

**The mirror is of the left gutter's shape and not of its glyphs.** `plotFrame: "rule"` has a
left rule and a bottom rule and no right one — that is what the style *is* — so the two `bare`
predicates in `furniture.ts` differ on purpose: `gutterSpans` blanks its edge for `"corners"`
alone, `rightBorder` for `"corners"` and `"rule"` both. A right gutter mirroring the left one's
glyph draws the rule that style exists not to have.

### The callout is placed from ink, never from arithmetic

`curveRows` rasterises at **dot** resolution and folds — `rowOf(v, range, rows × dotsY)` then
`÷ dotsY` — while `lineDrawRows` and `candleRows` map at **cell** resolution. Recomputing a
callout's row from its value picks one of those and is wrong wherever the other drew:

    rows= 6  dotsY=4   157/1001 values disagree (15.7%)    rows=12  dotsY=4   170/1001 (17.0%)
    rows= 8  dotsY=4   162/1001 values disagree (16.2%)    rows=20  dotsY=4   180/1001 (18.0%)
    rows= 8  dotsY=8   192/1001 values disagree (19.2%)    rows=20  dotsY=8   210/1001 (21.0%)

About one value in six at every ordinary height, and clustered at the **ends** of the range —
which is where a live chart's newest value sits when something has just gone wrong. This is
I37's class on the other axis: *the form owns which position lands where*, and a second mapping
written beside the first agrees at the widths a fixture happens to use.

So the callout reads the series' own rasterised rows: its row is the row of that series' ink in
its last inked column. Exact for every rasteriser and every capability by construction, and it
needs no table of sub-cell heights that a rasteriser added later could fail to join.

**Where that column spans several rows the callout takes the end furthest from the previous
column — and this section said *midpoint* until the code was run.** The final column is rarely
one cell: `drawLine` joins the previous sample to this one, so the column carries the tail of
that approach as well as the sample, and the sample is at whichever end is further from where
the line came in. Measured on a descending braille curve ending at 7.2 of 0..100 in eight rows:
the stroke spans rows 6 and 7, the sample's dot is in 7, and the midpoint answers **6** — which
is exactly the row the cell-resolution shortcut gives. *A ruling that lands on the wrong answer
and on the shortcut's answer at once cannot be told apart from the shortcut*, so the midpoint
was unfalsifiable as well as wrong, and the mutation written against it would have survived.
With several samples in the last column no ink-only rule is exact — the stroke is the figure's
end and the number is one sample's — and the far end is inside it, which is all a label needs.

**The walk ruled the shape and the implementation is the first thing that could disprove it**,
which is what that step is for: no row of either artefact indexes *what else is in the cell the
answer is read from*, because the ink is not a rule.

**The value is the last *finite* one, and the ink it made.** A series ending in `null` breaks
its line there (I4), so the last inked column is the last finite sample's column and the two
halves agree without being reconciled.

### What a callout displaces, and what it does not

**It replaces the right gutter's content on its row and leaves the left gutter alone.** A tick
says *this row is 5200*; a callout says *your data is here*, which is more specific — but that
argument reaches only the gutter the callout is written in. At `"both"` the reading survives on
the left and dropping it there would break the axis for nothing; at `"right"` the tick genuinely
goes, and that is the cost of asking for one axis and putting a callout on it.

**Two callouts on one row: the later wins and the row says so** — a `+` after the value, one
cell. Not stacked into two rows, which would change the row count and break I1; and not `+N`,
which reads better and cannot be built. The count needs to know which rows collide, which needs
the rasterised ink, which needs the area width, which needs the column this number is being
sized for; *a one-cell mark is bounded before the layout exists.* The cell is reserved only
where the block has more than one series. I8 is the rule it serves — a series dropped in
silence is the failure — and the count is the nicety traded for not taking a second pass.

**A callout does not replace the legend, and the argument that it did was the request's.** It
names a *value*; a legend names an *identity*. Three numbers in three colours at the right edge
say what each line reads and where each one ends, and say nothing about which is `alpha` — so
the two are complementary and an auto-enabled legend stays. That is the rule `legendPlacement`
already carries, read the right way round: *a form that names each row in its gutter already
tells the reader what it needs* is about **names**, and a callout is not one.

### The mark carries at one bit, and bold cannot

`Style` has no `inverse` — the channels are `colour`, `background`, `bold`, `dim` and
`underline`, and `background` is `resolveBackground`'s alone, from a `surface` ref (C10 I21). So
the obvious highlight is `bold`; and at `colourDepth: 1` a series slot resolves through `MONO`,
where `emphasised` **is** `{ bold: true }`. A bold callout in a slot whose mono class is already
emphasised is typographically identical to the series it names — the channel chosen for the
depth is spoken for at exactly that depth.

**So the carrier is a mark**, which is I25's standing rule and what §3b binds: a callout's row
takes a heavier edge than a tick's — `┣` against `├`, `#` against `+` — and bold and the
series' colour ride above it where the terminal has them.

### The ladder, and the one cell the two sides do not share

The right label column is dropped **before** the left: at `"both"` it is a duplicate and costs
least, and at `"right"` dropping it lands on the rung the left axis already has at that width.
`bandLayout`'s `⌊width ÷ 3⌋` cap becomes a cap on the **pair** and not one per side, or two
gutters at a third each leave a third for the data.

**`"right"` reaches its degradation one cell before `"left"` does, and that is kept rather than
fixed.** `AXIS_GUTTER` is a space and a `│`, and the space is there to separate a label from its
border; with `labelColumn: 0` it separates nothing and is spent anyway. So a right axis pays
`2 + 1 + 1 + n` where a left one pays `n + 2 + 1`. Measured at a four-cell label: the left axis
keeps its labels from width 11 and the right from width 12. Equalising them means changing what
an unlabelled gutter costs, which moves every narrow frame in the catalogue for one cell at one
width — and those frames are this change's only check that the compositor was rewritten without
moving anything.

### Where each field applies, and what is refused

Two total records, because they answer two questions and neither answers the other's:

- **`HAS_Y_GUTTER`** — the forms that draw a left gutter at all. A non-`"left"` `yAxis` on a
  form without one is refused rather than ignored; F207 is what ignoring costs.
- **`HAS_CALLOUT`** — the forms that rasterise a per-series curve into the plot area. A callout
  needs ink belonging to *one* series, which a band, a mosaic and a matrix do not have.

`HAS_POSITION_AXIS` is neither of these and was the obvious reuse: it says whether the
**abscissa** is a position, which is a question about the other axis. I43's whole finding is a
total record over forms reading as a complete answer to a question it cannot ask.

    yCallout: "last" with yAxis "left" or false      → refused; there is no gutter to write in
    yCallout on a form outside HAS_CALLOUT           → refused
    yAxis other than "left" with axes: false         → refused; there is no gutter at all
    yAxis: false on the matrix family                → refused; a row label *is* the ordinate
                                                       (I18), which is C04 I50b's own argument

---

### The smart ink does not port to the rest of the family, and measuring is what settled it

A request asked for `glyphInk` and `fieldDim` — the contrast machinery `contour` and `quiver` use
— to be extended to every other plot, optionally, so a figure could be made readable against a
white terminal or a black one. **The plan agreed and the measurement disagreed**, so the gate stays
`IS_FIELD_FORM` and the reason is now a table rather than an argument.

Each of the eight non-field matrix forms was rendered twice at three colour depths — `glyphInk:
"own"` against `"contrast"`, and `fieldDim: "none"` against `"floor"` — and the frames compared
both stripped of SGR and with it:

| | `glyphInk` | `fieldDim` |
|---|---|---|
| `heatmap` · `calendar` · `correlation` · `confusion` | **identical**, 24-bit / 8-bit / 1-bit | differs at 24-bit only |
| `spectrogram` · `latency` · `density2d` · `utilisation` | **identical**, 24-bit / 8-bit / 1-bit | differs at 24-bit only |
| `contour` | differs at every depth | differs at 24-bit only |

**`glyphInk` changes nothing on any of the eight, at any depth, and the renderer says why in one
line**: `run += colour === undefined ? (painted ? glyphAt(x) : " ") : " "`. A painted matrix cell is
a **blank** — §3o's own ruling, *the colour leads and the glyph is the fallback* — so above the
colour floor there is no glyph for `contrastInk` to ink, and below it there is no background for
`contrastInk` to read. The member is inert in both directions and for opposite reasons. *Widening
its gate is the F207 shape exactly: a field accepted where there is no arm for it.*

**`fieldDim` is the harder half, because it is not inert — it is purposeless.** It dims the wash at
24-bit on all eight, and `fieldDim`'s own doc says what dimming is for: *whether the field dims to
make room for a glyph over it*. Nothing is over it. So the member has a visible effect and no
subject, and its price is the one the doc already records — viridis keeps 0.165 of its 0.742
luminance spread, 22%, and luminance is the ordering channel a perceptual map exists for. **A member
that spends the map's ordering to make room for nothing is worse than one that does nothing**, which
is the distinction F207 does not draw and this row adds to it.

**So the request's real half is one layer down and this section is not it.** *Readable against a
white terminal or a black one* is C10's guarantee — `validateTokens` clears every palette slot at
4.5 : 1 against `surfaces.bg` — and the defect is that `tokens-dark.ts` declares
`background: "terminal"` and never paints it, so the guarantee is measured against `#1a1a1a` and
painted against nothing. Giving a plot its own contrast field would hand the plot a guarantee the
prose beside it does not have.

### And the probe found `fieldDim` inert at 8-bit, where the spec says it works

`fieldDim`'s doc reads *inert below `colourDepth: 8`*, which says it works **at** 8. It does not,
on `contour` either:

| colourDepth | `contour`, none vs floor | `heatmap`, none vs floor |
|---|---|---|
| 24 | differs | differs |
| **8** | **identical** | identical |
| 4 | identical | identical |
| 1 | identical | identical |

`continuousColour` returns `{ kind: "rgb" }` at 24-bit and `{ kind: "ansi256", index }` at 8, and
`dimColour` opens with `if (colour.kind !== "rgb" || factor >= 1) return colour`. **So the dim is
applied, returns its argument, and nothing says so** — a member accepted, wired, invoked, and doing
nothing on the one arm below the top.

**It is fixable rather than a property of 8-bit**, which is the tempting reading: the 256-palette's
cube is 6 × 6 × 6 over levels `0 · 95 · 135 · 175 · 215 · 255`, so an index converts to a colour,
dims, and requantises. The conversion is **already written twice** — `resolve.ts` builds the cube
for the theme's constraint solver and `colormap.ts` inlines the quantisation in
`continuousColour`'s fallback — so the remedy is one definition and three callers rather than a
fourth copy.

**And the obvious remedy does not honour the member's own guarantee, which measuring is what
showed.** `fieldDim: "floor"` promises *dims until every sample clears*. Scaling the channels and
requantising is not a dim, it is a **compression** — halved, four of the six levels land on the
same one:

| level | × 0.5 | requantised |
|---|---|---|
| 0 | 0 | **0** |
| 95 | 48 | **95** |
| 135 | 68 | **95** |
| 175 | 88 | **95** |
| 215 | 108 | **95** |
| 255 | 128 | **135** |

So the darkest coloured band does not move at all, and quantising after the dim can carry a sample
back **over** the floor: viridis at its 24-bit factor of 0.50 leaves **one of twenty-one samples at
3.71** against a floor of 4.5. A remedy that dims and still fails the contract is the same defect
one level down.

**`dimFactorFor` therefore searches against the colour the reader is shown, not the one that was
sampled**, and takes the arm as an argument. viridis needs `0.45` at 8-bit where 24-bit takes
`0.50`; coolwarm and inferno are unchanged at `0.50` and `0.45`. All three then clear on every one
of twenty-one samples at both depths. *The figures are what the search produces and not what this
paragraph reads — `dimFactorFor`'s own doc is explicit that a tabulated constant is a constant that
fails the fourth map, and a factor tabulated per depth would fail the third arm.*

## 3y. Two more readings of a field — iso-lines and arrows

A field is a grid of numbers and C12 draws exactly one thing with it: a heatmap, where the
cell's **background** is the reading. Two more readings of the same grid, and both were refused
during the survey as *edge routing, the Mermaid ruling covers it* — a misclassification, with
the correction in `docs/notes/CALCIUM_PLOT_PRIOR_ART.md`. **Marching squares is local.** One 2×2
group of grid points, four corners each above or below a threshold, sixteen cases, one segment.
Nothing has to see the whole figure.

    form: "contour"    a scalar field, drawn as iso-lines
    form: "quiver"     a vector field, drawn as arrows

Both join the **matrix family** — one renderer and a set of defaults, which is what the eight
existing matrix forms are — so `AREA_ROWS`, `STYLE_ARMS`, `HAS_Y_GUTTER`, `HAS_CALLOUT`,
`MATRIX_LAYOUT` and `DEFAULT_COLORMAP` each gain a row and each stops compiling until it says.
Neither touches I1: a field form is `heightOrOne` like every other matrix form.

**They do not stack at one bit.** I6's stacking is the *positional* family's answer to more
series than colours; a matrix form degrades through `ladderFor("density", caps)` to a ramp
glyph, and neither of these has a per-series row to stack into.

### The data — one shape reused, one that could not be

**`contour` takes `series`**, one `Series` per grid row, exactly as every matrix form does. A
bare `number[][]` was the obvious shape and it is wrong twice: it duplicates a spelling the
family already has, and it has no row labels — I18 says a matrix's row labels **are** its
ordinate, so a field with none has no y axis at all.

**`quiver` cannot reuse it**, because nothing on `Plot` carries two numbers per cell. A type
mirroring `Series`, on the precedent of `ohlc`, `hierarchy` and `segments`:

```ts
export type VectorSeries = Readonly<{
  values: readonly (readonly [number, number] | null)[];   // [u, v] per grid point
  label?: string;
}>;
```

`null` is a gap and never `NaN`, on C04 I46a's argument unchanged: `JSON.stringify` writes `NaN` as
`null` regardless, so `null` is the spelling that survives the round trip and the declared form
should be the persisted one.

### The sixteen cases were already a table in this repository

An edge is crossed exactly when its two corners disagree, and a cell's glyph is a function of
which of its four edges the stroke crosses — which is `glyphForMask`'s question, asked by the
curve renderer since `lineDrawRows` was written. Enumerated against the shipped table, **all
sixteen cases land on an entry that already exists**: zero new glyphs, eight distinct masks.

| corners TL TR BR BL | edges | mask | glyph |
|---|---|---|---|
| `0000` · `1111` | none | 0 | (blank) |
| `0110` · `1001` | top+bottom | 3 | `│` |
| `0111` · `1000` | top+left | 5 | `╯` |
| `0001` · `1110` | bottom+left | 6 | `╮` |
| `0100` · `1011` | top+right | 9 | `╰` |
| `0010` · `1101` | right+bottom | 10 | `╭` |
| `0011` · `1100` | right+left | 12 | `─` |
| `0101` · `1010` | all four | 15 | `┼` — **the saddle** |

So the derivation replaces the table rather than adding one:

```
mask = (top ? UP : 0) | (right ? RIGHT : 0) | (bottom ? DOWN : 0) | (left ? LEFT : 0)
```

**Adjacent cells agree by construction**, and that is the reason to derive rather than tabulate:
a shared edge has the same two grid corners on both sides, so the two masks cannot disagree and
the strokes join with nothing joining them. The `rounded`/`sharp` fork and the ASCII arm come
along unchanged, because they are properties of the table and not of a curve. `╳` was proposed
for the saddle and is in no table; `┼` is what the shipped one gives.

### The saddle, and the arm it is observable on

Cases 5 and 10 cross all four edges: the two segments can connect two ways, and matplotlib
resolves it by the cell's centre value. **Both resolutions produce mask 15**, so at cell
resolution the ruling has no observable consequence — a reader sees `┼` either way, and a test
asserting the centre-value rule on the `"line"` arm passes against a constant.

That is A03 §2's vacuity class arriving in a renderer rather than in prose, and it decides the
default: **`STYLE_ARMS.contour = ["braille", "line"]` and `"auto"` picks braille**, where the
two segments genuinely part at 2×4 sub-cell resolution and the choice is a thing that can be
wrong. The `"line"` fork keeps box drawing for its joins, and states that the saddle collapses
there rather than leaving a reader to infer it from a frame.

`STYLE_ARMS.quiver = []` — an arrow is a whole-cell glyph and there is nothing to choose.

### Levels are named in the legend, never on the line

**The half of the old refusal that survives**, and the half nobody restated: *the labels are
worse than the lines.* A contour label sits **in** the line it names, in a gap cut for it, and
there is no gap-cutting vocabulary here. A label written over a contour is the contour with a
hole in it — `behind()`'s argument for gridlines, one layer up, and at one cell per crossing the
hole *is* the crossing. So the levels go in the legend, each in its own colour, and I27 already
sizes a vertical legend from its content.

`levels` declared, or derived by `niceAxis` over the field's range when it is not — the same
function the y axis uses, so a contour's levels and the gutter's ticks are the same numbers.

**Multiple levels union their masks in one cell**, which is what produces `┤ ├ ┴ ┬` — glyphs a
single-level pass can never emit, because a single level crosses either two edges or four. So
`┼` reads as *saddle* within one level and as *two levels crossing* across levels, and both are
true readings of the same mark.

At one bit the levels separate by **dash**, which is `STROKE_DASHES`' ladder and works in dot
space. **The `"line"` arm has no dash**, so at one bit a multi-level box-drawing contour has no
channel distinguishing its levels — stated here, because the default arm has one and a reader
meeting the fork will assume it carries over.

### The quiver — direction is the glyph, magnitude is the colour

    →  ↗  ↑  ↖  ←  ↙  ↓  ↘        eight directions, U+2190–2199
    >  /  ^  \  <  /  v  \        the ASCII arm, diagonals reused

**The ASCII arm is required at `unicode: "ascii"` *and* at `ambiguousWidth: "wide"`**, and the
second conjunct is the one that is easy to miss. Every arrow in U+2190–21FF is
`East_Asian_Width=Ambiguous`, so a terminal declaring wide draws the field at double width — a
quiver whose cells double is not a quiver, which is the sentence `art.ts` makes about a wordmark
and `mermaid.ts` makes about box drawing. **This is that switch's third consumer**, and the
first two are already written down.

**One datum, one channel — and which channel magnitude takes depends on whether
there is a second datum.** *Direction picks the glyph, magnitude picks the colour* is right
where the field carries something else, and self-cancelling where it does not: with no scalar
`series` the field **is** the magnitude, so colouring the arrow by it too paints the glyph in
exactly its own cell's background. Measured on the golden frame — `38;2;33;145;141` on
`48;2;33;145;141`, an **invisible arrow at full colour depth**, guaranteed by construction
rather than by a ramp's luminance.

Every assertion passed: the field painted, the arrows were there, more than two distinct
colours appeared. **Only the frame showed it**, which is why the frame-read is a scheduled step
and not a courtesy — and it is the sharpest form of the premise this section already corrects,
since *no competition* is exactly what two encodings of one number look like from outside.

So the arrow carries magnitude where the caller named a scalar and the field carries something
else; where it did not, the background carries magnitude and the arrow takes its layer's slot.
QV9 asserts the arrow is never its own background, and QV2 asserts magnitude still reaches it
in the case that has one — **either alone is satisfied by a constant.**

**Magnitude dies below `colourDepth: 8`, not below one bit.** `continuousColour` returns
`undefined` under `CONTINUOUS_FLOOR`, so a 4-bit terminal has direction and nothing else — two
of the four capability sets, not one. And there is no fallback: I25's answer at one bit is a
**mark** ladder, and here the mark is already spent on direction. So magnitude genuinely has no
channel below 8-bit, which is a loss to state rather than a gap to fill.

**A zero-magnitude cell draws nothing.** Not an arrow of arbitrary direction — a cell with no
flow has no direction, and drawing one asserts a reading the data does not have. The cell is
blank and the field colour beneath it still reads, which is the degenerate row every field form
owes.

### Layering — a public draw order, an internal priority, and one seam

    layers?: readonly ("field" | "contour" | "quiver")[]

**Draw order, last on top** — the painter's reading a caller expects. §3u's `mergedRow` is
**first-wins by priority**, so the array is *reversed at the seam*, and the reversal is
documented at that seam rather than in the field's own comment. The two answer different
questions and compose rather than conflict: `layers` says **what is drawn**, `Layer.kind` says
**how two inked cells resolve**. Both a contour and a quiver are `kind: "curve"`.

*"Last wins the cell" as a merge rule is §3u's measured defect with the array reversed* — 25
dots mistinted on `slope-default`, 70 of 279 frame cells on `radar-default` — so the ordering is
public and the resolution stays §3u's.

**`field`'s membership is load-bearing and its position is not.** A background cannot occlude a
glyph, having none, so `["field", "contour"]` and `["contour", "field"]` render byte-identical.
Membership says *whether the field is painted at all*, which is how `layers: ["contour"]` asks
for lines on an unpainted area. Stated because a reader given an ordered array will assume every
position in it means something.

Defaults: `contour` → `["field", "contour"]`, `quiver` → `["field", "quiver"]`. Under a quiver
with no scalar `series`, the field **is** the vectors' magnitude.

### Two contrast fields, and they are two because they answer two questions

    fieldDim?:  "none" | "floor"      default "none"   — what the BACKGROUND does
    glyphInk?:  "own"  | "contrast"   default "own"    — what the FOREGROUND is

**A glyph over a coloured field competes on legibility, not on cells**, and that is the thing
the request's *no competition* got backwards. Measured against the 4.5 : 1 floor:

| foreground | over viridis | over coolwarm |
|---|---|---|
| white | **45%** of the ramp clears | **16%** |
| `tone.warn` · `tone.accent` | 19% | — |
| `tone.ok` | 14% | — |
| `tone.muted` · `tone.error` | 3–4% | — |

`wash()` returns a **span of blanks** precisely so a colormap value can never reach a glyph:
C10 I21 admits a background only from a `surface` ref, and the matrix cell is the one case it
was widened for — *a blank cell whose colour is the reading has no text to be illegible.* A
glyph on that cell is exactly the case the widening excluded.

**Two fields rather than one union**, on `plotFrame`'s own test: a single enum would make
`fieldDim: "floor", glyphInk: "contrast"` inexpressible, and neither makes the other
meaningless — one changes the background, the other the foreground.

**`fieldDim: "floor"` dims per colormap and by measurement, never by a constant**: viridis and
coolwarm clear the floor at 50%, inferno at 40%. Its price is stated where a caller meets it —
viridis keeps **0.165 of its 0.742 luminance spread, 22%** — and luminance is the ordering
channel a perceptual map exists for. *The remedy costs the thing the map was chosen for, which
is why it is not the default.*

**`glyphInk: "contrast"` picks black or white per cell** from that cell's own background, which
is seaborn's annotated heatmap. It does not break *a block names a palette slot*: the block
still names a `colormap`, and `continuousColour` already resolves data-dependent colour inside
the renderer. Its price is that the glyph's colour stops meaning magnitude — so on a quiver it
spends the second channel to save the first.

Both default off, so the plain reading is what ships and the remedies are there for the caller
who has read their own frame.

### Below `colourDepth: 8` the field is a glyph, and two glyph layers meet

`continuousColour` returns `undefined` under the floor, so the field has **no background at
all** and degrades to the density ramp — a glyph. `layers: ["field", "contour"]` is one glyph
over a wash at 24-bit and **two glyph layers** at 4-bit, which is the sharpest interaction in
this section and is invisible in every frame above the floor.

**The field yields, and the first ruling here said the ramp did.** That was right about the
*cell* contention — the interaction §6d.1 row 10 found — and wrong about the remedy, because it
assumed the two glyphs were distinguishable. They are not: the density ramp is braille at unicode
and `.:-=+*#@` at ASCII, and a contour is braille at unicode and box-drawing punctuation at ASCII.
**At every capability below the floor the two are the same alphabet**, so deciding which of them
owns a cell leaves a reader unable to tell field from contour anywhere.

*The frame is what said so.* The 1-bit contour came out as an even wash of braille speckle, and
the identical fixture with `layers: ["contour"]` came out as five clean nested rings. No assertion
could see it — and the row that was supposed to, LY5, compared against a ramp character set
containing no braille and was **vacuous**.

So a layer declares whether it is drawn in the ramp's alphabet, and the field does not paint
beneath one. The contour is the reading that survives: it is the more specific statement and it
names its levels in the legend, where the ramp below the floor names nothing a reader can map back
to a number. A quiver is **not** ramplike — an arrow is a distinct mark at both capabilities — so
it keeps its field, and a sparse quiver shows the ramp between its arrows.

**This is CLAUDE.md's *correct about the interaction, wrong about a mechanism it assumed* arriving
on a walk artefact rather than on prose.** No index by rule interaction reaches it, because the
flaw is not between two rules — it is between two **alphabets**, which is not a statement either
artefact records.

`fieldDim` is inert here regardless — there is no background to dim — and saying so is cheaper
than a reader discovering it from an unchanged frame.

### A field's axes are positions, and the matrix's are identities

**Both records were answered from the heatmap's row and both were wrong.** `ROW_IS_AN_IDENTITY`
was `true` and `HAS_POSITION_AXIS` was `false`, which is correct for a matrix — I18's *a row
label is the ordinate* — and it is the opposite of what a field is. A heatmap's rows are things
the caller named and its columns come from `categories`; a field is **sampled over a domain**, so
a row is a slice of the ordinate and a column is a position along the abscissa.

*The frame is what said so, and a reader said it first*: the gutter read `row0 … row5` where a
scale belonged, and there was no x axis at all. Neither walk artefact reaches it — a total record
read as a complete answer to a question it cannot ask is I43's finding, and here it arrived by
**copying a neighbouring row instead of re-deriving the reason**, which is the one failure mode a
total record does not prevent: it forces an entry and cannot force a thought.

So a field derives both axes from its grid: the row index down the gutter, three captions across
the bottom over the column domain — `xMin`–`xMax` where declared and the sample index otherwise.
**A caller who names one still wins**: an explicit row `label` or an explicit `xLabels` is a
caller saying their rows and columns mean something the index does not. The catalogue's own
fixtures carried `row0 … row5` and so suppressed the derived scale, which is the fixture-cannot-
respond rule arriving a third time in this section.

**There is no `yMin`/`yMax` arm.** On a field those two pin the *value* range — the levels and
the colour scale — so spending them on the ordinate as well would give one pair of members two
meanings on one form.


### Where each field applies, and what is refused

**A new total record, `IS_FIELD_FORM`**, and not a reuse. `MATRIX_LAYOUT` says whether a form's
columns are a time window or a category set, which is a question about the abscissa; F207 and
I43 are both a total record over forms read as a complete answer to a question it cannot ask.

    vectors on a form other than "quiver"            → refused
    "quiver" with no vectors                         → refused
    layers · fieldDim · glyphInk outside IS_FIELD_FORM → refused
    a layers entry naming a layer with no data       → refused; ["quiver"] with no vectors
    series or vectors whose rows differ in length    → refused; the family's existing rule
    levels on a form other than "contour"            → refused

---

## 6d. The field-form walk — the table first, and the trace it cannot replace

CLAUDE.md's warning applies **inverted** here. A field form is nearly all structure and has
almost no sequence, so the risk is not that the structural half goes unexamined — it is that a
trace gets written because a trace is the familiar artefact, and then indexes rows that no rule
interaction lives in. The table is primary. The trace covers exactly one thing the table cannot:
an **ordering**, which is not a rule that holds at rest.

### 6d.1 The table — rules that both hold at rest

| # | the two rules that meet | ruling |
|---|---|---|
| 1 | `layers` is a draw order (last on top) · `mergedRow` is a priority order (first wins) | reversed at the seam, documented there; the public order is the caller's reading |
| 2 | `layers` is an ordered array · a background cannot occlude | `field`'s **membership** is load-bearing, its **position** inert; the two orderings render byte-identical |
| 3 | `fieldDim: "floor"` dims the background · below 8-bit there is no background | inert below the floor, and stated — an unchanged frame is not evidence the field was honoured |
| 4 | `glyphInk: "contrast"` sets the glyph's colour · a quiver's magnitude **is** the glyph's colour | `"contrast"` wins and magnitude is lost; refusing the pair would refuse the one case that needs it most — a dense field where the arrows are unreadable |
| 5 | the saddle resolves by centre value · the `"line"` arm maps both resolutions to mask 15 | the ruling holds on the braille arm and collapses on `"line"`; **the default is braille so the ruling has a subject** |
| 6 | arrows are the quiver's vocabulary · U+2190–21FF is `East_Asian_Width=Ambiguous` | the ASCII arm at `ambiguousWidth: "wide"` **as well as** at `unicode: "ascii"` — `art.ts:eligible()`'s third consumer |
| 7 | a contour draws where the field crosses a level · a constant field crosses none | no contour at all, not a full grid; the field still paints and the legend still names the levels |
| 8 | the grid is *G × H* points · the plot area is `areaWidth × areaRows` cells | the family's existing resampling (`matrixAnchor`), and a contour is computed **after** it, on the cells actually drawn — computing before and resampling the glyphs would resample a stroke |
| 9 | `levels` is declared · a level lies outside the field's range | kept in the legend, drawn nowhere; dropping it silently makes an empty area indistinguishable from a constant field |
| 10 | at one bit levels separate by dash · dashes are dot-space | the braille arm carries them and the `"line"` arm has **no** level channel at one bit — stated at the fork |
| 10b | below 8-bit the field is a ramp glyph · a contour is drawn in the ramp's own alphabet | **the field yields, not the ramp** — this row first ruled the other way, which settles the cell contention and leaves both layers in one vocabulary. The flaw is between two *alphabets* and neither artefact records one; only the frame did |
| 13 | a matrix's row label is its ordinate (I18) · a field is sampled over a domain | **positions, not identities** — both total records were answered from the heatmap's row, and a reader reading the frame is what found it |
| 11 | a matrix form has no per-series row (`HAS_Y_GUTTER: false`) · a contour's levels want naming | the legend, never the gutter — which is ruling 2 arriving from the other side |
| 12 | `quiver` at one bit: direction is a mark · magnitude is a mark ladder (I25) | the mark is spent on direction; magnitude has **no** channel, and that is a loss stated rather than a gap to fill |

### 6d.2 The trace — the composition passes, and what each may touch

Rows 1 and 2 above are about an *ordering*, and an ordering is not a statement that holds at
rest — it is a sequence of passes each writing over what the last one left. The table cannot
index it; this is the artefact that can.

| pass | writes | may touch what the previous pass wrote |
|---|---|---|
| 1 · resample | the cell grid the field occupies | — |
| 2 · field | a `wash` span per cell, or a ramp glyph below 8-bit | — |
| 3 · contour | a mask per cell, unioned across levels, then one glyph | **no** — it composes a `Layer`, it does not overwrite pass 2 |
| 4 · quiver | one arrow glyph per cell, blank at zero magnitude | **no** — same |
| 5 · merge | `mergedRow` over the reversed `layers` | resolves 3 against 4 by `Layer.kind`; **cannot** see pass 2, which is a background |
| 6 · ink | `glyphInk: "contrast"` recolours the merged glyph | **yes**, and it is the only pass that reaches back — it needs pass 2's colour and pass 5's glyph, which is why it is last and why it is the one that can be wrong |
| 7 · gutters | `plotRow` — the label column, the frame, the legend | outside the area; §3x's compositor unchanged |

**Pass 6 is the finding this trace exists for.** Every other pass composes forward and cannot
corrupt what came before; pass 6 reads two passes and writes over one, which is the shape every
defect in §3u had. It is also the pass that must run **after** the merge rather than inside the
contour and quiver rasterisers — computed inside them, a cell whose arrow lost the merge would
have been recoloured for a background that a different glyph now sits on.

---

## 3z. The horizon's two channels, and the alphabet they were sharing

**This section is written because the form had none**, which is §3q's shape one form along.
`horizon` appears twice in this document: in §2's height table, and in I24's list of four forms
that composed their own rows and were therefore outside the one check written to catch their
defect. Nothing here ever ruled on what it draws — so a collision between its two channels could
ship, be rendered into four catalogue frames, and stay.

### The entry it was built from names two channels and the build has one

`CALCIUM_PLOT_PRIOR_ART.md` says *split the range into N bands, stack them, and colour by depth*
and sketches `▁▂▃▅▇█` against `colour = which band`. What shipped carries depth on
`ladderFor("density")` — a **glyph** ramp — and `DEFAULT_COLORMAP.horizon` is `null`.
`horizon.ts`'s own header states the price in the same breath as the benefit: *that is what buys
the compression … paid for in a colour axis the reader has to learn.* **The price is charged and
the goods never arrive.**

**And the second channel is spent paying for the first.** Within-band height is
`max(1, round(within × h))` — a whole number of rows — so at `height: 1`, which is the canonical
horizon and the compression the form exists for, every inked column is exactly one row.
`horizon-folded-1x3-24bit.plain` is that frame: one row, and the only variation in it is the
glyph. Depth is occupying the alphabet height needs.

| channel | wants | had |
|---|---|---|
| band depth | a **colour** ramp — it is an ordinal index into a legend, not a quantity in the cell | the density glyph ramp |
| within-band height | **`▁▂▃▄▅▆▇█`** — eight positions inside one row | one row of ink, or none |

**Ruling: depth is colour and height is eighths.** Two data, two channels, and neither borrows the
other's. That is also what the entry said before anything was built.

### The mirror, and §3r is what forces it

A horizon folds about a **baseline**, and a value below it is as real as one above. There are two
ways to draw that and this vocabulary has one:

- **offset** — negative bands grow *downwards* from the row's top.
- **mirror** — negative bands reflect upwards and colour says which side. d3-horizon's.

**§3r already measured why offset cannot work here**: *"Unicode's vertical eighths are a complete
ladder upward — `▁▂▃▄▅▆▇█` — and there is no matching ladder downward: `▀` and `▔` are the whole
of the upper repertoire, a half and an eighth."* An offset arm would resolve a positive band to
an eighth and a negative one to a half — **precision at one end reading as precision at both**,
which is the exact fault §3r rejected a sub-cell candle body for.

So the mirror is **forced by the repertoire rather than chosen**, and the sign rides the channel
that has room: a diverging colormap's two halves. `DEFAULT_COLORMAP.horizon` is `coolwarm` for
that reason and not for taste — a sequential map has no second half, so under one the sign has
nowhere to go and is refused rather than dropped.

**The baseline is 0 where the range spans it and `range.min` otherwise.** What ships folds about
the data's minimum unconditionally, which is why it only ever folds one way — and a series that
never goes negative renders **identically** under both rules, so the defect is invisible on
exactly the fixtures a catalogue carries. That is why this needs a fixture that can respond to it
before it needs an assertion.

### Below the colour floor there is one channel for two data — settled, arm A

`continuousColour` returns `undefined` under `CONTINUOUS_FLOOR = 8`, so at 4-bit and at 1-bit
there is no colour and the design is back where it started. Two candidates were written and the
frames chose:

| | keeps | loses |
|---|---|---|
| **A** — depth on the density ramp, height in whole rows | the bands, which are the form's contract | sub-cell height; at `height: 1` height entirely |
| **B** — a plain eighths area over the whole range, `bands` inert | more levels: 8 against 3 at one row, 40 against 25 at five | the bands, silently |

**B resolves strictly more and is refused anyway**, which is the part worth writing down —
counting levels was the wrong measure. At `height: 1` and 1-bit, A gives three distinguishable
values and B gives eight, and at `height: 5` A gives about twenty-five against B's forty, because
the eighths ladder is a *unicode* vocabulary and 1-bit is a statement about *colour*: the glyphs
are there either way. So the arm that keeps more information is the one that loses the bands.

**A form that stops having bands below a colour depth is two forms with one name**, which is the
fault `plotGrid` records in its own words — *a figure that changes shape at a threshold is two
figures with one name*. Under B a caller declaring `bands: 5` gets a sparkline and nothing says
so; under A they get a coarser horizon and the legend still names five. **A stated loss beats a
silent change of meaning**, which is F34's rule about a carrier arriving on the question of
whether a form still *is* itself.

**Read rather than argued**: `horizon-bands-5-1bit` is a recognisable horizon — five rows, five
densities, the staircase intact — because at `height > 1` arm A keeps *both* channels, the row
count carrying height and the glyph carrying depth. Only at `height: 1` does height collapse, and
that is where the loss is stated. `horizon-folded-1x3-1bit` is the frame that shows it: three
shades across eighty columns where the 24-bit frame has twenty-four levels.

### A reading at the floor draws nothing, and three frames show it

`clamped <= 0 ? 0` with `band === 0` leaves the cell blank, so a value at the range's minimum is
indistinguishable from a gap. Visible as a two-cell break near the right edge of
`horizon-bands-3`, `horizon-bands-5` and `horizon-folded-1x3` — `⠖⠖⠖  ⠖⠖⠖`. **Observed in the
frame; the mechanism above is the candidate and the walk is what confirms it**, because a
mechanism inferred from a symptom is a belief until it has been run.

Ruled: **a finite reading always draws ink.** That is I16's argument one form along — a ramp whose
lowest step is its padding character gives one glyph two meanings, and a floor that draws blank
gives blank two meanings, in the form whose whole subject is *how deep*.

### The walk this needs is a table, and the reason is worth stating

A horizon has no events: it is a fold over a series and the passes do not interact in sequence.
Its interactions are structural — two rules that hold at rest — so the artefact is a
classification table and a trace would find nothing here. §6d's rule applied rather than the
familiar shape taken.

| # | two rules meeting | ruling |
|---|---|---|
| H1 | *depth is colour* × `colourDepth < 8` | **arm A** — depth returns to the density ramp and height keeps the rows. Settled by the frames, above, against the arm that resolves more |
| H2 | *the baseline is 0* × a range not spanning 0 | fall back to `range.min`, and the fold is one-directional — which is today's behaviour and now says so |
| H3 | *the sign rides the map's two halves* × a **sequential** `colormap` | refused at construction. A sequential map has no second half, and drawing negative bands in the same ramp says a trough is a peak |
| H4 | *a finite reading draws ink* × a value at the baseline exactly | ink, one eighth. The floor is a reading and blank is absence (I16) |
| H5 | *height is eighths* × `height > 1` | eighths within the **top** inked row and full rows below it, so the two agree at `h = 1` rather than being two rules that meet there |
| H6 | `bands: 1` | the fold is the identity and the figure is an area chart. Legal, and the legend says one band rather than the form pretending to compress |
| H7 | *depth is colour* × `legend: false` | refused for this form. The colour axis **is** the reading, and a horizon with no legend is a picture of coloured noise — the argument I19 makes for a matrix's scale |

**H3 and H7 are refusals and both are new**, which is the table earning its place: neither is
reachable from the two-channel ruling on its own, and both are cells where a correct sentence
about colour meets a correct sentence about something else.

---

## 3ab. `width`, `aspect` and `align` — one seam, and the deferral this does not pay

C04 §3 rules the members; this is where they are drawn. **All three land in `render`, which is the
only place a plot's width is decided:**

```ts
const render = (block, ctx) => {
  const frame = max(1, floor(ctx.width));
  const drawn = drawnWidth(block, frame);
  const pad   = alignPad(block, frame, drawn);
  return rows(FORM_ROWS[block.form](block, drawn, ctx).map(indent(pad)));
};
```

**`FORM_ROWS` already takes a width and every form honours it**, because `facetWidths` renders
each facet at an arbitrary one — so narrowing needs no renderer to change. And a row is a
**string** at this seam, with its SGR already embedded, so `align` is a leading run of spaces:
padding cannot disturb a colour because a blank carries none.

**`measure` is untouched and I1 with it.** The height is declared and none of these three reads a
series. `height: "fill"` does not interact either, and the reason is upstream: `fillHeight`
resolves against the producer's region *before* the block is built, so `block.height` is a number
by the time any of this runs. *That row of the walk's classification table — `aspect` × `height:
"fill"`, each deriving the other — dissolves rather than resolving, which is the answer worth
writing down because it is not the one the table predicted.*

### `aspect` is `squareColumns`' direction, and that is why the deferral stays owed

The plan for this work said `aspect` pays `squareRows`' deferral — *"an unused inverse … the day
something needs it is the day to write it"* — and it does not. `aspect` is
**width : height, visually**, so with a cell 1 × 2:

    a = w / (h · CELL_ASPECT)   →   w = a · h · CELL_ASPECT

At `a = 1` that is `squareColumns(h)` exactly. **The height is declared and the width is derived**,
which is the direction that already exists and the only direction C12 I1 permits: `squareRows`
derives a *height* from a width, and a plot deriving its height from anything is the invariant this
component is built around.

So writing `squareRows` here would re-create the second definition of the ratio that MG25 deleted,
for a caller that wants the other one. **The deferral is not paid and the entry stands** — recorded
because a plan claiming to close it is exactly how a deferral gets marked done and stays open.

### What each refuses, and what the validator can see

| | refused | where |
|---|---|---|
| `width` with `aspect` | two ways to say one number, and a plot that picked one would be reading the caller's other statement | both gates |
| `align` with neither | aligning a figure that fills its frame is a member that does nothing (F207) | both gates |
| `width` ≤ 0, non-integral, non-finite | a cell count that is not one | both gates |
| `aspect` ≤ 0 or non-finite | a ratio that is not one | both gates |
| `width` wider than the terminal | **not refused** — clamped at render | C04 has no terminal width |

**The last row is the seam and not a weakness.** A validator refusing a width it cannot measure
asserts a fact it does not hold; the frame's width arrives at `render` and nowhere earlier, so the
clamp lives there and the gate checks what a document can be wrong about on its own.

**A narrowed plot that no longer fits its furniture is already answered, and the two families
answer differently.** Measured on a `height: 6` plot narrowed step by step:

| | `line` | matrix |
|---|---|---|
| 20, 12 | frame and gutter, narrowed | the same |
| 8 | **gutter dropped**, frame kept | *Too narrow.* |
| 6, 4, 2, 1 | frame corners dropped, a rule at the declared width | *Too narrow.*, truncated to fit |

**Neither overflows and both keep the declared row count** — nine rows at every width down to one,
which is C12 I1 holding under a member that could have broken it. The matrix's `layoutFor` returns
`null` where the gutter and the area cannot both fit; the line family has no such gate and does not
need one, because its gutter is optional in a way a matrix's row labels are not (I18: a matrix's row
label *is* its ordinate). *Two rungs, both pre-existing, reached by a new road — and the table is
here because the first draft of this paragraph claimed the matrix's answer for both.*


## 3ac. `origin` — four corners, and the measurement C04 §3 refused to guess

C04 §3 declared the member and left its refusal set owed: *"inventing it here is the error
`HAS_Y_GUTTER` records … the record lands with the render pass that can measure it, and `origin`
lands with the record."* This is that record. **The measurement corrected the guess in both
directions**, and it corrected the *shape* of the guess as well: the question is not which forms
have a corner, it is **which machinery places the data**, and that is a partition the type could
not see.

### 3ac.1 Three probes, and each one indicted the one before it

**Probe 1 — the scale core's reach.** `rowOf` and `columnsOf` given a flip behind a module flag,
every form and every catalogue variant rendered at 24-bit and 80 cells under all four settings,
frames diffed.

| moves | count | forms |
|---|---|---|
| both directions | 8 | `density` `ecdf` `line` `pairplot` `scatter` `slope` `smallmultiples` `step` |
| the vertical only | 7 | `bar` `boxplot` `bubble` `histogram` `stackedarea` `streamgraph` `violin` |
| neither | 29 | the rest |

**And this measures the probe's reach, not the forms' geometry.** A heatmap has a corner —
which cell holds row 0, column 0 — and does not go through `rowOf`; it appears under *neither*
because the flip was not wired to it, which is a fact about the patch. Reading that column as the
refusal set would have defined the answer as *whatever the mechanism I happened to write touches*,
which is the same circularity as reasoning it, wearing a number.

**Probe 2 — reverse the input, machinery-independent.** Every ordered axis of every fixture
reversed — samples, categories, bars, vectors — and the frame diffed against the original.
Reversal is inert for nine forms: `density` `ecdf` `histogram` `pairplot` `pie` `ridgeline`
`smallmultiples` `treemap` `waffle`. **And inert is not direction-free**: a histogram bins, an
ECDF sorts, a waffle is a proportion, a treemap ranks. Seven of the nine are order-independent
*statistics*, which have an abscissa and simply do not take it from the input order.

**The first run of probe 2 was wrong, and the way it was wrong is the reusable part.** It compared
frames with the SGR stripped and reported *seventeen* inert, the whole matrix family among them —
because a colour wash has no glyph variation and its direction is entirely in the paint. *An
instrument that strips the channel a form draws in reports the form as blank.* That is LY8b's
finding one probe along, and it would have produced a refusal set with `heatmap` in it, measured,
with a number beside it.

**Probe 3 — is a flip a transform of the picture?** It would be one seam for all forty-four forms:
reverse each area row for the horizontal, reverse the row order for the vertical, and no renderer
changes. It does not survive contact, and the figures are the reason.

| | the row as drawn | the row reversed as a string |
|---|---|---|
| `line` | 60 cells | **138 cells** |
| `heatmap` | 60 cells | **971 cells** |
| `bar` | 60 cells | **111 cells** |

The escape sequences reverse into text — `\x1b[38;2;98;98;98m` becomes `m89;89;89;2;83[\x1b` — and
`cells()` counts what is no longer a control sequence. **This is `axed()`'s recorded defect
arriving from the other side**: the legend column measured a painted row at about twice its width,
was truncated, and left `[38;2;98;98;98m` on screen as text. One mechanism, two symptoms, and the
second one was predicted by the comment already in the tree.

The alphabet fails independently of the paint. **Ten of fifteen box-drawing glyphs need a mirror
map** — `┌┐└┘├┤╭╮╰╯` — and braille needs something a lookup table is the wrong shape for: a cell is
a 2 × 4 dot matrix, so a horizontal mirror is the bit permutation 1↔4, 2↔5, 3↔6, 7↔8. `⠆` is dots
2 and 3 and mirrors to `⠰`, dots 5 and 6. Correct, expressible, and **not a character operation**.

**So the ruling is: a flip is a transform of the placement, never of the picture.** The cheap seam
is refused with a number rather than with an intuition, and the dot-level flip belongs in
`columnsOf` and `rowOf`, which already work in dot coordinates.

### 3ac.2 The partition, which is what actually decides the refusal set

Every form's arm in `FORM_ROWS`, grouped by the machinery it delegates to:

| machinery | forms | where the direction lives |
|---|---|---|
| **positional** | 7 — `bubble` `density` `ecdf` `line` `scatter` `slope` `step` | `rowOf` · `columnsOf` — **two functions** |
| **matrix** | 10 — `calendar` `confusion` `contour` `correlation` `density2d` `heatmap` `latency` `quiver` `spectrogram` `utilisation` | `columnMap` · `matrixRows`' loop — **two places**, and **`contour` and `quiver` have a third** |
| **facet** | 2 — `pairplot` `smallmultiples` | **nowhere — a facet is a whole `Plot` and carries its own** |
| **categorical** | 11 — `autocorrelation` `bar` `bullet` `dotplot` `dumbbell` `forest` `funnel` `gantt` `lollipop` `timeline` `waterfall` | the row order in one place; **the bar's own direction in eleven row builders** |
| **own renderer** | 14 — `boxplot` `flame` `histogram` `horizon` `icicle` `pie` `radar` `ridgeline` `sparkline` `stackedarea` `streamgraph` `treemap` `violin` `waffle` | fourteen places, or nowhere |

**`origin` is honoured on the positional family and on eight of the ten matrix forms —
fifteen of forty-four.** The other two are §3ac.2a, below, and they were found by writing the code. The line is drawn by cost and by whether both halves of the member can move, and the
three refusals C04 guessed all survive, none of them for the reason guessed:

- **`pie`** — refused because it is its own renderer, and *separately* because it has no corner.
  Probe 1 and probe 2 both say inert, which is the only refusal in the set with two independent
  measurements behind it.
- **`sparkline`** — refused because it is its own renderer, and the guessed reason is the sharper
  one: **one row, so the vertical half of the member cannot move at all.** A form that can honour
  half of `origin` is the case the member must not have.
- **`flame` and `icicle`** — refused as own renderers. The guess that they are *one renderer
  differing by a vertical flip* is true and is **an argument about those two forms, not about this
  member**: `origin` on `flame` would be a second spelling of `icicle`, which is a reason to
  refuse it here and to leave the two forms alone.

**The twenty-two that were not guessed are the measurement's actual product**, and `bar` is the one
worth naming: the most ordinary chart in the catalogue refuses the member, because its rows come
from `categoricalForm` in one place and each bar's direction from its own row builder in eleven.
**The condition is a symbol, so a grep finds it**: `origin` reaches the categorical family the day
`categoricalForm` takes a shared span builder for the row body rather than a `rowBuilder` per form.

### 3ac.2a The implementation falsified the walk, and it took two forms with it

The record above said seventeen. **`contour` and `quiver` refuse, and nothing in either walk
artefact could have said so** — the finding needed the code, which is the recorded order: the walk
rules the shape and the implementation is the first thing that can disprove it.

Both are `IS_FIELD_FORM`, and a field form is the matrix renderer **plus a second placement**.
`fieldLayers` rasterises isolines and arrows into `glyphRows` indexed by **area** column, while
`columnMap` works in *reading* indices — two coordinate spaces that coincide today and separate the
moment either is reversed. A flip reaching the wash and not the field draws a contour over the wrong
cells, with the frame still looking like a contour plot.

**And mirroring the rasterised row instead is the thing probe 3 already refuted**, arriving inside
the matrix family: those glyph rows are braille and box-drawing, so reversing them is the dot
permutation and the ten-glyph mirror map, not a string operation. The refutation was written about
the whole-frame seam and it turns out to be about any seam that mirrors a *drawn* row.

**The condition is a symbol, so a grep finds it**: `contour` and `quiver` take `origin` the day a
`FieldLayer` is sampled in `columnMap`'s space rather than the area's.

### 3ac.3 `ORIGIN_DEFAULT` — one total record carries the gate and the default together

The two families' defaults are **not the same corner**, and that is not a wrinkle to hide:

- a curve's first sample is at the **left** and its value grows **upward** — `"bottom-left"`;
- a matrix's `series[0]`, `values[0]` is at the **top** left, because a row index grows downward.

A single default would move every shipped matrix frame or every shipped curve. So the record is

```ts
ORIGIN_DEFAULT: Readonly<Record<PlotForm, Origin | null>>   // null — the form refuses `origin`
```

**one total record, read in both directions, carrying the acceptance set *and* the default.** A
separate `HAS_ORIGIN` beside a `DEFAULT_ORIGIN` would be two records that must agree, and
`FURNITURE_ROWS`' argument is that the agreement should be the thing that ships. It lives in C04
because the validator needs it and L0 cannot import L1 (A02 §1) — `HAS_Y_GUTTER`'s placement, for
`HAS_Y_GUTTER`'s reason.

**The flip is threaded, never global, and the parameter is required.** `rowOf` and `columnsOf` take
a `Facing` as a fourth argument with no default: an optional one is a flip a call site forgets
silently, and probe 1 measured exactly that failure — `bar`, `boxplot`, `bubble`, `histogram`,
`stackedarea`, `streamgraph` and `violin` all reach `rowOf` and place their own columns, so a
module-level flag flipped seven refused forms halfway. Twenty calls across six files, and the
compiler names every one.

### 3ac.4 The classification table — structural interactions, two rules holding at rest

| # | rules that meet | ruling |
|---|---|---|
| A1 | `origin` reverses the y direction × `axes.ts` writes the gutter's ends as `[0 → range.max, h−1 → range.min]` **literally**, and only the interior ticks through `rowOf` | **The ends are computed, not written.** A flip threaded into `rowOf` alone moves the interior ticks and leaves `max` at the top — a gutter that disagrees with its own plot, in the one place a reader goes to resolve a disagreement. The two ends become `rowOf(range.max)` and `rowOf(range.min)`. |
| A2 | `origin` × `yAxis: "right"` — both move the labels | **They move different labels and compose.** `yAxis` picks *which side the gutter is on*; `origin` picks *which end of it holds the maximum*. `origin: "bottom-right"` with `yAxis: "right"` is a plot whose data grows leftward with its scale on the right, and it is expressible. The failure to watch for is applying the horizontal flip to the gutter's *side*, which is the "labels move twice" defect OR2 asserts against. |
| A3 | `origin` × `matrixAnchor` — one places columns, one places the fringe | **Reversing `columnMap`'s output does both, and correctly.** With `matrixAnchor: "left"` and a right-facing origin, the data starts at the right and the blank fringe lands on the left, which is what §3o's ruling says a fringe is. No second rule — and the ruling that makes it work is **`origin` never changes *which* data is shown, only where it is drawn**: reversing the *values* instead would have made a `window` anchor select the oldest readings rather than the newest. The same rule fixes the matrix's overflow — the visible slice is `series[0 … visible − 1]` under all four corners, so `+N more` names the same set whichever way the grid faces, and the notice keeps the last row because it is furniture. |
| A4 | `origin` × a facet — `facets` is `readonly Plot[]`, so each one is a whole block | **The container refuses and each facet declares its own, because they are two members sharing a word.** `origin` on a `smallmultiples` would mean *which corner the first facet sits in*, and on its facets *which corner the data grows from*. C04 §3's test for one member or two answers this without a measurement: they are not the same question, and a container that accepted the word would silently answer the other one. A facet is validated on its own `form` because it is a `Plot` — **and nothing validates facets at all today**, which is a gap this ruling names and does not close. |
| A5 | `origin` × `width`/`aspect`/`align` (§3ab) | **Independent, and the order is fixed.** `drawnWidth` decides how many cells the form gets; `origin` decides which end of them the data starts at; `alignPad` decides where the drawn block sits in the frame. A right-facing origin in a left-aligned narrow plot is data flush to the **right edge of the drawn area**, not of the frame. |
| A6 | `origin` × a single sample — `columnsOf` puts a lone sample at `floor((w−1)/2)` | **The centre is its own mirror at odd widths and is not at even ones.** `floor((w−1)/2)` mirrors to `w−1−floor((w−1)/2)`, which differs by one cell when `w` is even. Flipping the column *after* the placement is what makes a one-sample plot twitch sideways under a member that should not be able to move it. **The single-sample column is computed from the facing, not mirrored after the fact.** |
| A7 | `origin` × a constant series — `rowOf` returns `floor(last/2)` before the range is consulted | **Same shape as A6 and the same remedy.** The early return means the flip is never reached, which is correct here for the opposite reason: a flat line has no direction to reverse, so the centre row is the answer under all four origins. Asserted rather than assumed, because A6's remedy would otherwise be applied here too. |

### 3ac.5 The sequence trace — event-mediated, where a second reader disagrees with the first

The events are the passes, and every row is a place where **something else computes the same
placement**.

| # | sequence | ruling |
|---|---|---|
| B1 | place columns → draw the curve → **the crosshair asks for a column** | `cursorColumn` re-derives `columnsOf`'s arithmetic in `definition.ts` and its comment says so. Under a horizontal flip it must reverse or the crosshair points at the mirror sample — **the frame stays plausible and the readout is wrong**, which is the worst available failure. |
| B2 | place bars → aggregate → **the crosshair asks for a candle** | `candleColumn` is the same defect one style along, and §3r's placement work already made these two share an expression. The flip goes into the shared one. |
| B3 | place columns → **the x tick row numbers them** | `xTickRow` maps `t ∈ [0,1]` to a column independently of `columnsOf`. A flip that reaches the data and not the ticks produces a plot that reads right-to-left under a left-to-right axis, and **the axis is what a reader trusts to resolve it**. |
| B4 | caller supplies `xLabels` → **the captions are placed** | `xAxis(block.xLabels, …)` is the caller's own strings, and they reverse with the data. A caption naming the sample it is under is the whole of what a caption is. |
| B5 | annotate → **a reference line is drawn at a value** | `annotate.ts` reaches `rowOf` ten times. A vertical flip that misses one of them puts a threshold line at the mirror value — and the band's two edges are drawn by two separate calls, so a half-flip **inverts a confidence band about its own curve** rather than moving it. |

### 3ac.6 What the refusal leaves behind

On C13 `settle`'s precedent, and it is short here: **both gates refuse before anything is placed.**
`origin` is validated against `ORIGIN_DEFAULT` at document construction and at the builder, so a
refused form never reaches a renderer holding one, and there is no partially-flipped frame to
leave. The rejection is a `TypeError` naming the form and the member, which is the same shape the
other five geometry members already refuse with (§3ab, F207) — and the reader who sees it is the
caller, at build time, not a reader looking at a frame.

### 3ac.7 Tests

    OR1  each of the four corners places the first sample in that corner
    OR2  origin with yAxis "right" — the labels move once, not twice (A2)
    OR5  the x tick order and the y label order follow the origin (A1, B3)
    OR6  every form whose ORIGIN_DEFAULT row is non-null moves under both flips —
         rendered, diffed, and a form that accepts the member and does not move fails
    OR7  every form whose row is null is refused at both gates
    OR8  a single sample does not move sideways at an even width (A6)
    OR9  a constant series draws the same row under all four origins (A7)
    OR10 a confidence band's two edges flip together, and the band is not inverted (B5)

**OR6 is the one that closes the class.** It is the measurement made permanent: the probe that
produced this record, run as an assertion, so a form added to the accepted set without a working
flip fails rather than shipping a member that silently does nothing.


## 3ad. `axisCross: "zero"` — the axes moved inside, and the two tests that are not one test

`origin` says which corner the data grows from. This says **where the axes are drawn**, and the
two are separate fields because one enum spelling `"centre"` beside the four corners would make
`origin: "top-right"` with a crossing axis inexpressible (C04 I62).

### 3ad.1 — It is `set zeroaxis`, not `spines.set_position("zero")`

Two references draw this and they draw different pictures. matplotlib **moves the spine**, and the
tick labels go with it. gnuplot draws a rule at zero **inside** the plot and leaves the border and
the labels where they are.

**This is gnuplot's, and naming that is the whole of the ruling** — because the difference is
exactly what a reader will otherwise expect and not get. The gutter keeps the scale; the x
captions keep the row below the rule; the crossing axes are two rules in the plot area, resolved
behind the data the way a gridline is (I23, I26).

**The reason is not economy, and it is worth separating from the reason it is also cheap.** Moving
the labels means the gutter is no longer a left column, and every rule in §3f about `gutter`,
`labelColumn` and `rightColumn` is written in that shape. That is a second layout beside the
first. But the argument for *not* doing it is that a plot's numbers belong in one place: a reader
comparing two facets reads down one column, and a scale that migrates to wherever zero happens to
be is a scale that moves between two plots of the same data at different ranges.

**The matplotlib picture is still reachable and composes**: `plotFrame: "corners"` removes the
border and leaves the cross. Nothing is coupled — the frame member and this one are orthogonal,
which A3 below is the check on.

### 3ad.2 — Seven of forty-four, and it is a strict subset of `origin`'s fifteen

Measured the way §3ac's was, by instrumenting the composer and rendering the whole corpus rather
than by reading a record:

| machinery | forms | honours `axisCross` |
|---|---|---|
| `overlaidRows` — the positional family | `line scatter step ecdf slope bubble density` | **yes, 7** |
| its 1-bit multi-series arm — `stackedRows` | the same seven | no — A13 |
| `matrixRows` | 10 | no |
| `categoricalForm` | 11 | no |
| own renderer | 14 | no |
| facet containers | 2 | no |

**`origin` is honoured wherever this is, and on eight more.** A matrix has a corner and no zero,
which is the whole of the difference: `origin` asks which way the axes run and `axisCross` asks
where they meet, and only a form with a numeric ordinate *and* a numeric abscissa has an answer.

**Not `HAS_POSITION_AXIS`, for the third time** (I43's finding; §3ac records the second). That
record holds eleven forms — `stackedarea` and `streamgraph`, which have their own composers, and
`contour` and `quiver`, which are drawn by the matrix renderer. It answers *does the abscissa
carry positions*, which is a question about the axis and not about who draws the area.

**And C04 I62's `HAS_Y_GUTTER` clause does no work.** All seven have a gutter, so every refusal it
could make is already a refusal by form. It reads as a second constraint and is not one — A03 §2's
vacuity class, in an invariant.

### 3ad.3 — The classification table: rules that both hold at rest

`axisCross` has structure and it has passes, so it gets both artefacts (A03 §2). This is the
structural half.

| | the two rules | ruling |
|---|---|---|
| **A1** | the frame draws a border on four sides · the cross draws two rules inside | both draw. The cross is a mark in the plot area and not a relocation of the frame |
| **A2** | `"grid"` draws `┊` at tick columns and `┄` at labelled rows · the cross draws a rule at the zero column and row | **the same alphabet, and they agree in the cells they share** — the grid draws where a value is written and zero is a value. The cross is composed over the grid, so the junction mark wins its one cell. **The walk ruled the opposite and a frame disproved it** — 3ad.4 |
| **A3** | `"corners"` draws no left rule and no bottom rule · the cross is interior | unchanged. **Its value is that it forbids an argument**: A4 must not rest on *the frame already draws that edge*, because here it does not |
| **A4** | zero is in range · its row is the area's first or last | **not drawn**. At the boundary `"zero"` and `"edge"` name the same place, so `"zero"` has nothing to add — and a rule at area column 0 abuts the gutter's border and reads as a doubled frame |
| **A5** | zero is outside the range · an axis has to go somewhere | **not drawn, never clamped to the nearest edge.** This is **C04 I52's** disposition — *an annotation moved onto a scale it is outside says the limit is somewhere it is not* — and **not C04 I29's**, which clamps *data* because pressing a reading against a ceiling is honest. C04 I62 cites C04 I29 *in the mirror*; the mirror is right about the error and C04 I52 is the invariant that already rules the case |
| **A6** | `origin` flips which end of the area is which · the cross's position is a function of the range | falls out **if** the cross goes through `rowOf` and the same column expression the ticks use. The mutation is the cross ignoring the facing |
| **A7** | `xLabels` replaces the numeric axis with three captions · the vertical half needs a column for the value 0 | three words have no domain, so **the vertical half is not drawn and the horizontal half is unaffected**. The halves are independent, which is why this is a row and not a refusal |
| **A8** | a candlestick places its bars by `candleColumn` · the curve's rule places by `columnsOf` | the zero column goes through the same `columnAt` the ticks do, or the rule and the `0` caption sit in different columns. §3d.1's last row, arriving on a new consumer |
| **A9** | `yAxis: "right"` and a callout spend a right column · the cross is drawn into an area row | no interaction on placement — both gutters are outside the area. **The cross must be built against the same layout the grid is**, or its row is the wrong width by the right column |
| **A10** | an undeclared domain is the index `[0, n − 1]` · an index's zero is sample 0 | **subsumed by the range test**, because `0 < 0` is false. No declared-versus-inferred distinction is needed, and that is why the test is stated as strict inequalities rather than as *zero is in range* |
| **A11** | a log domain excludes zero · `symlog` is linear about zero by construction | subsumed by the same test. `symlog` is the one scale where a crossing axis is the point |
| **A12** | the area is two rows or two columns | subsumed: there is no interior |
| **A13** | at one bit with more than one series the form draws one strip per series · a crossing axis is one rule across the ordinate | **not drawn, and the reason is that there is no single ordinate.** Each strip has its own row mapping, so one rule would sit at a different value in each, and one per strip is a grid |
| **A14** | the member is on `Plot` for every form · six machineries compose an area | refused at both gates by a record, `ORIGIN_DEFAULT`'s sibling and shaped like it |
| **A15** | a constant series · `rowOf` centres a degenerate range **by construction** | **the two tests are not one test.** A series of 5s has `min === max`, `rowOf` returns the centre row for every value including 0, and the interior test alone would draw a zero axis through a plot that never approaches zero. The range test — `min < 0 && max > 0`, strictly — is what excludes it, and the interior test is what excludes A4 and A12 |

**A15 is the row that pays for the table.** Every other row narrows a condition that was going to
be checked anyway; this one says a single check is two checks, and it is invisible from either
rule alone — `rowOf`'s centring is correct (T1.5 depends on it) and *draw where zero is* is
correct, and the defect lives only where they meet.

### 3ad.4 — Dashed, and the walk ruled the other way

**The walk ruled solid and the frame disproved it**, which is the third time the implementation
has falsified this component's own artefact and the first time a *frame* did it rather than a
compile error.

The ruling was: `dashedVertical` exists because *a solid rule through a figure reads as part of
it* (§3k, the forest plot's null line), and that is about an **annotation** laid over data, where
an axis is the coordinate system the data is drawn **in** — so it takes the frame's alphabet, and
*the frame's own left border is a solid `│` that no reader has ever taken for a series.*

**Every sentence of that is true and the last one is the analogy that breaks.** The frame's border
is never in a row the data occupies. A crossing axis always is. Drawn solid, the zero row reads:

    0 ┤───────│────────────┼─│─────────╭────╯───│

and the curve is resolved *behind* it (I23), so the cells the series occupies show the series —
in the same glyph. A reader sees one continuous line and cannot tell where the curve crosses zero,
**which is the single thing the axis was drawn to show.** Dashed:

    0 ┤┄┄┄┄┄┄┄│┄┄┄┄┄┄┄┄┄┄┄┄┼┄│┄┄┄┄┄┄┄┄┄╭────╯┄┄┄│

and the `╭────╯` is unmistakably the curve. The vertical half is the same argument transposed: `┊`
in the middle of a plot area is furniture and `│` is a segment of some series.

**So §3k's sentence rules this case after all**, and the distinction it turns on is not annotation
against furniture but *shares a row with the data* against *does not*. The forest plot's null line
and this are the same object under that test, which is why one sentence covers both.

**A2 resolves the other way with it, and costs nothing.** The cross and the grid are now the same
alphabet, so under `plotFrame: "grid"` the crossing axis adds only the junction mark — and that is
correct rather than a loss: the grid draws where a value is written, zero is a value, and the two
are saying the same thing in the cells they share. Where zero is *not* on a labelled row or a tick
column, the cross draws a line the grid does not have.

The junction still needs a mark the set lacks: `crossing` — `┼`, and `+` at ASCII — beside
`candleCross`, which is `┿`, a heavy stem through a light rule for a body shorter than one cell
(I36). A junction drawn with a body's weight would read as data.

### 3ad.5 — The sequence trace: what happens between the passes

| | the sequence | what could go wrong between |
|---|---|---|
| **B1** | data measured → axis niced → area composed → furniture composed | the cross's row and the gutter's `0` come from different objects. **This is F210, and it is why that had to land first**: the cross is the first consumer that makes the divergence a misplaced *line* rather than a misread number |
| **B2** | domain → nice → tick columns → the zero column | computed separately, the rule and the `0` caption disagree. **One computation, returned together** — `XAxis` carries the zero column beside its ticks, so a plot's two axes are now both measured once and handed down |
| **B3** | area rows → grid row → cursor rule → merged behind the data | three reference rows where there were two. The cursor's cell was already the grid's; the cross takes it from both, and the grid-over-cursor order is left where it is |
| **B4** | `ecdf` and `density` rewrite the block, then call the same composer | the derived block must carry `axisCross` through the spread, or the member is silently dropped on two of its seven forms |
| **B5** | a cursor is set → the readout replaces the label row | the cross is in the area and the readout is furniture. Nothing to do — stated so it is not re-derived |

### 3ad.6 — What the refusal leaves behind, and who sees it

Two gates refuse by **form**, and both throw or return before anything is assembled — `origin`'s
shape exactly (§3ac.6).

**The suppression is the one nobody sees.** A caller who sets `axisCross: "zero"` on a series that
never crosses zero gets no cross, no error and no notice, because A5's disposition is a drop. That
is I52's rule and it is right — a mark on a place the plot does not show is worse than no mark —
but it means **the only record of the two conditions is this section**, and a reader whose plot
draws no cross has nothing at runtime to ask. Stated here because nothing else will state it.

### 3ad.7 — Tests

    AC1  a series spanning zero draws a horizontal rule at the zero row and nowhere else
    AC2  a declared x domain spanning zero draws the vertical rule, and the two meet in one cell
    AC3  a range that excludes zero draws neither half — no clamp to the nearest edge (A5)
    AC4  zero at the range's end draws nothing: `"zero"` and `"edge"` agree there (A4)
    AC5  a constant series draws nothing, though `rowOf` centres it (A15)
    AC6  an undeclared index domain draws no vertical half, and the horizontal one is unaffected (A10, A7)
    AC7  `xLabels` given: no vertical half, horizontal unchanged (A7)
    AC8  under `grid`, the cross is solid where the gridline is dashed, and wins the shared cell (A2)
    AC9  a candlestick's zero column is the candle's column, not the curve's rule (A8)
    AC10 the cross follows `origin` at all four corners (A6)
    AC11 every form outside the seven refuses at both gates (A14)
    AC12 at one bit with two series nothing is drawn, and the frame is unchanged (A13)

## 3ae. `calendarUnit` — the cell picks the grid, and the anchor that was said to have nothing to anchor

`calendar` has been a `heatmap` alias with no date logic in it at all: `MATRIX_LAYOUT: "stretch"`,
`DEFAULT_COLORMAP: "viridis"`, and that is the whole of it. The catalogue's frame is a 7-row grid
whose `Mon … Sun` labels **the fixture wrote**, and `startDate` has been on `Plot` since step 0 with
four occurrences, all writes. C04 §3 rules the member; this section is the walk.

### 3ae.1 — The seam is `quiver`'s, one form along

`heatmapFormRows` already substitutes a derived series list for a raw block before anything
downstream sees it, and its comment says why: *"Substituted here rather than in `matrixRows`, so the
range, the gutter labels, the legend and the overflow row all see one series list."* A calendar is
that substitution with a different derivation — one flat series in, `N` labelled rows out — and the
whole of §3ae.4 is the check that *"all see one series list"* is still true when the list is a grid.

### 3ae.2 — Days from civil, and the reason three units are arithmetic and the fourth is a calendar

`daysFromCivil` and its inverse, Howard Hinnant's, UTC, and no `Date` — SS1 bans the constructor
outside `src/shell/session.ts`, and `chrome.ts:formatClock` carries the reason that outlives the
scan: *a local-time conversion is the part that needs the platform's zone database.* A weekday is
`((z + 3) mod 7 + 7) mod 7`, Monday zero, because 1970-01-01 was a Thursday.

**Three of the four units are `(offset + i) mod cycle` and this is not tidiness.**

| unit | rows | the map from value `i` | one column |
|---|---|---|---|
| `hour` | 24 | `row = (h₀ + i) mod 24` · `col = ⌊(h₀ + i) ÷ 24⌋` | a day |
| `day` | 7 | `row = (w₀ + i) mod 7` · `col = ⌊(w₀ + i) ÷ 7⌋` | a week |
| `month` | 12 | `row = (m₀ + i) mod 12` · `col = ⌊(m₀ + i) ÷ 12⌋` | a year |
| `week` | 5 | `z = z₀ + 7i` → civil `(y, m, d)` · `row = ⌊(d − 1) ÷ 7⌋` · `col = 12(y − y₀) + (m − m₀)` | a month |

**A month is not a whole number of weeks, so `week` is the one unit whose grid has interior
holes.** Under the other three a blank cell can only be a ragged end — days before the start, hours
after the last reading — and under `week` a 28-day February simply has no W5, and a start on the
12th leaves W1 empty in its own first column. That is not a defect to fix: those cells are periods
that do not exist. It is a distinction the frame cannot make, and §3ae.3 A15 is where it lands.

### 3ae.3 — The classification table: structural interactions, before any code

Two rules that both hold at rest. Indexed by rule interaction, never by input (A03 §2, CLAUDE.md).

| | two rules that meet | ruling |
|---|---|---|
| A1 | *the grid is derived from the data* × *`matrixAnchor` decides which columns are shown* | **The plan's row said an anchor has nothing to anchor and that is false** — see §3ae.5. A calendar is the first matrix whose columns have an **intrinsic width**, and none of the three arms honours it. Fourth arm: `uniform`. |
| A2 | *rows carry the unit's labels* × *the caller's one series carries a label* | The caller's label has **no home and is dropped**: a matrix's row label *is* its ordinate (I18) and the calendar's ordinate is the sub-unit, so `"commits"` cannot be a row name. A matrix legend is a colour bar with no identity slot, and giving it one would change every matrix frame for this. **Recorded rather than discovered** — the block's surrounding text names the calendar. |
| A3 | *the columns are dates* × *`xLabelRow` places three captions across the **area*** | **Ruled *no derived captions*, and the frame reopened it — see §3ae.8.** The reason given was that placing a caption against the grid needs an **offset** and `xLabelRow(labels, width, caps, facing)` takes a width. That is true of a **right**-anchored grid and false of the three left-anchored arms, where the grid begins at column 0 and the extent *is* a width. The ruling was right to ask whether the operation exists and wrong about the answer, for three arms of four. |
| A4 | *rows are derived in unit order* × *`origin` reverses the drawn order* | **Composes, and the reason is that a label rides its own row.** Each derived row is a `Series` carrying its label, so `facing.y === "up"` reverses rows and captions together. `hour` with `origin: "bottom-left"` is `23` at the lid and `00` at the floor, which is an ordinate growing upward and a thing a reader may want. |
| A5 | *`height` is declared* × *the derived row count is fixed by the unit* | **No refusal, and C04 §3 measured why**: `matrixRows` draws `areaRows − 1` rows and spends the last on `+17 more · 07 · 08 · …`, which is commitment 46 speaking in the calendar's own labels. **The edge the ruling owns is `height: 1`**: `visible = 0`, so the frame is one notice naming all twenty-four rows and no cells at all. That is still true, and it is better than an error telling the caller to pick a different number. |
| A6 | *`calendarUnit` is a `Plot` member* × *only `calendar` has an arm* | Refused by form at both gates (F207). |
| A7 | *the grid is derived from one flat series* × *`series` is a list* | More than one series is refused at both gates: a calendar's rows **are** a period, so a second series is a second period claiming the same rows. |
| A8 | *more than one series is refused* × *an empty block renders its message* | **Two tests, not one** — §3ad A15's shape, one component along. The gate refuses `> 1` and the renderer substitutes at `=== 1`; a gate written `!== 1` would make an empty calendar a construction error and contradict commitment 3. Zero is not more than one. |
| A9 | *the row is a claim about when* × *`startDate` is optional on `Plot`* | `calendarUnit` **without** `startDate` is refused at both gates. Index 0 → row 0 is an assumption the caller never stated, and the refusal costs one string to satisfy. |
| A10 | *a malformed `startDate` is refused* × *I11 says the renderer never throws* | The parse returns `null`, the substitution does not happen, and the frame is **today's raw matrix**. Nobody sees a refusal on that path, which is I11's price and the reason the gates carry the whole of it. |
| A11 | *`uniform` widens the cell to fill* × *a short series has one column* | `day` with three values is one week, `⌊w ÷ 1⌋ = 74` cells wide. **No cap**, and the alternative is named with its cost: capping at `CELL_ASPECT`'s two columns would give a year of months twenty-four cells and a fifty-cell fringe, which is §3o's reported defect restored. A caller who wants square cells says `width` — the member landed in §3ab and this is its second reader. |
| A12 | *the form's default anchor* × *the caller's declared one* | `block.matrixAnchor ?? MATRIX_LAYOUT[form]` is unchanged, so `stretch` remains sayable and fills the area with uneven columns. The default is a default. |
| A13 | *`uniform` leaves a fringe* × *a caller's declared `xLabels`* | The same misalignment as A3 and **the half that was already shipped**: `left` has left a fringe since it was written, and a caption over a fringe names a column that is not there. Fixed with A3 rather than deferred with it — the captions span the **grid**, on every arm whose grid starts at column 0 (§3ae.8). |
| A14 | *the substitution is upstream* × *`colormap` · `glyphInk` · `fieldDim` · `yAxis`* | All four read the substituted block and none of them can see the difference. No rule. |
| A15 | *an absent cell is blank* × *the fringe is blank* × *a `week` grid's interior hole is blank* | **Three meanings, one glyph, ruled harmless twice and named once.** *No reading here* is true of a ragged end and true of the fringe. It is also true of February's W5, where the honest statement is *no such week* — and the frame cannot say it. Recorded as a limit of the form rather than fixed: the alternative is a second absent glyph, which spends I16's argument on a distinction a calendar reader does not need. |
| A16 | *`axes: false` hides the gutter* × *the row labels are the calendar* | **Already refused, on every matrix** — `checkHeatmap` throws for the whole family (C04 I50b). The walk's row was written before that was checked, and checking is what removed it. |

### 3ae.4 — The trace over the passes, because the seam is an ordering

`heatmapFormRows` is six passes and the substitution is the first. The interactions here are
event-mediated in the only sense this function has events: **which pass sees which series list.**

| | the sequence | what it settles |
|---|---|---|
| B1 | substitute → `fieldAxes` | `IS_FIELD_FORM.calendar` is false, so the pass is a no-op. Were it not, it would overwrite the derived row labels with `formatValue(i)` — the labels are the calendar. |
| B2 | substitute → `seriesRange` | The grid holds exactly the caller's finite values plus `null`s, and `seriesRange` skips `null`. **The range is invariant under the substitution**, and asserting that is what says the derivation added no data. |
| B3 | substitute → `layoutFor` | The gutter is `labelColumnWidth` over the **derived** labels: 3 for `Mon … Sun` and `Jan … Dec`, 2 for `00 … 23` and `W1 … W5`. Fixed per unit, and independent of what the caller called their series. |
| B4 | substitute → `matrixRows`' overflow | `omitted.map(s => s.label ?? "row N")` finds every derived label non-empty, so the notice reads `+17 more · 07 · 08 · …` rather than `row 8 · row 9`. A5's frame depends on this pass seeing the substituted list, which is the seam's whole claim. |
| B5 | substitute → `matrixFurniture`'s `dropped` | `dropped = max(0, longest − areaWidth)` is **correct under `uniform` without change**, and this was checked rather than assumed: at `count > w` the pitch is 1 and `shown` is `w`, so the columns dropped are exactly `count − w`; at `count ≤ w` the pitch is `⌊w ÷ n⌋` and `⌊w ÷ pitch⌋ ≥ n`, so nothing is dropped. |
| B6 | the calendar substitution → the quiver substitution | Mutually exclusive by form, both at the top. No ordering to get wrong, and saying so is what stops a third one being appended somewhere else. |

### 3ae.5 — `uniform`, and what the plan's row got wrong

The plan's classification row read *`calendarUnit` × `matrixAnchor` — the grid is derived, so an
anchor has nothing to anchor.* **The anchor does everything**, and the row was wrong in the useful
direction: it named the interaction and mis-ruled it.

A heatmap's columns are readings with no intrinsic duration, so stretching them to fill the area is
free. **A calendar's column is a fixed period** — a week is a week — and `stretch` maps column `x`
to reading `⌊x·n ÷ w⌋`, which gives widths differing by one cell. At a pitch of six that is
imperceptible; **at a pitch of one it is a doubling**, and a two-cell week beside a one-cell week
reads as two weeks holding the same value. That is a datum the data does not have, which is §6b
B15's rule (*a candle wider than its neighbours reads as a datum*) arriving on its third consumer.

So the fourth arm, and it is a **refinement of `left` rather than a new idea**:

    pitch = max(1, ⌊w ÷ n⌋)          every column the same width
    shown = min(n, ⌊w ÷ pitch⌋)      = n whenever n ≤ w
    from  = n − shown                the oldest drop first, which is `left`'s rule

`uniform` and `left` are **identical wherever the pitch is one**, and differ exactly when the
columns could be widened: a year of twelve months is twelve cells under `left` and seventy-two
under `uniform`. That is the mutation that catches it, and it is silent at fifty-three weeks.

**The fringe is the price and it is the caller's to remove.** Fifty-three weeks at pitch one leave
twenty-one blank cells of seventy-four; `width: 56` removes them, using §3ab's member for its
second reader. §3o called a fringe *the defect that got reported* about a matrix that could have
stretched — this one cannot, and the two rulings do not conflict once the distinction is columns
that have a duration.

**This is provisional in exactly one respect, and it is marked.** The choice between twenty-one
blank cells and weeks of unequal width is a frame-read question, and §3z's ruling 4 was written the
same way and corrected by the 1-bit frame. Both frames are rendered before this is called settled.

**Read, and it holds — the frame shows the fabrication rather than implying it.** Fifty-three weeks
over seventy-five cells under `stretch`: `⠄⠄⠖⠷⠷⠿⠷⠷⠖⠔⠶⠶` — twenty-two of the fifty-three weeks are
two cells wide, and every one of those pairs reads as two consecutive weeks holding one value. The
`uniform` frame is fifty-three single cells and twenty-two blank, and blank is not a reading.

**And it moves two shipped frames, because the ruling is about the form rather than the member.** A
calendar's columns are periods whether or not a `calendarUnit` derived them, so `MATRIX_LAYOUT`
changes for `calendar` and the pre-unit fixture moves with it: seven readings over seventy-five
cells were drawn at widths **11 · 11 · 11 · 10 · 11 · 11 · 10** and are now **10 × 7 with a
five-cell fringe**. The other two arms of that fixture — both at width 40, where seven readings
divide the area exactly — are byte-identical, which is the useful half of the measurement: the two
anchors agree wherever the pitch divides, and the frames that move are exactly the frames that were
carrying a spare cell.

*The plan's verification note says a golden that moves under a commit which claims to move none is a
defect in a total record. This commit claims two, names them, and the test that would otherwise have
read as covering it — `startDate` with no unit renders today's frame — is corrected in the same
breath: it compares the member's presence and never compared the anchor's default, so it passed
while both of its frames moved together.*

### 3ae.6 — What a refusal leaves behind, and who sees it

C13 `settle`'s question, and the calendar has two rejection paths.

**The gates leave nothing behind.** `validateBlock` pushes a string and mutates no state;
`plot()`'s `TypeError` abandons a builder mid-chain, which is what every member added since §3ab
does. **`checkHeatmap` is on the same path, not a third gate** — `finish` → `rebuild` → `checkShape`
→ `checkHeatmap` — so the builder's throw and the matrix-shape throw are two implementations
serving one caller. `rebuild` is not exported from `src/index.ts`; the two caller-facing gates are
the builder and the document validator, and that was checked rather than assumed.

**The renderer has no rejection path at all, by construction.** The grid is sized from the last
index's column *before* any cell is written, so there is no half-built grid to abandon and no throw
to leave one behind. Stated here because the code has to keep it true, and because the shape that
makes it true — size, then fill — is the one an optimisation would remove.

**Who does not see a refusal is the answer worth writing down**: a block that reached the renderer
without passing either gate renders as the pre-calendar matrix, silently. That frame is not wrong —
it is what `calendar` has always drawn — and it is not a calendar.

### 3ae.7 — The deferral that was, and the one that is left

**A3 deferred the captions and named its blocker as a symbol**, which is the habit CLAUDE.md asks
for — *the condition is written where the deferral is and the thing that meets it is written
somewhere else*. Naming it as a symbol is what made it cheap to check, and checking it is what
showed the reason was wrong for three arms of four. **A deferral whose blocker is a symbol is worth
writing even when the symbol turns out to be there**: that is the case where the habit pays fastest.

What is left deferred is **`window`**, and its blocker is unchanged and real: a right-anchored grid
begins at `w − n`, so its captions need an offset `xLabelRow` does not take. Stated as a limit
rather than left to be discovered — a matrix under `matrixAnchor: "window"` with fewer readings than
cells still spans its captions across the area, and the leftmost names a column that is blank.

### 3ae.8 — The captions, and the reason the frame is what reopened A3

**The `month` frame is what asked.** Twelve years of monthly readings at a pitch of six is
seventy-two cells of continuous wash, and nothing in it says which year a column is. The row labels
answer *which month*; the legend answers *how much*; **the super-unit had no voice at all**, and no
assertion was going to say so because every assertion was about the grid.

Two rulings, and the first is general:

1. **A matrix's captions span its grid, not its area.** `gridExtent` is read off `columnMap`'s own
   output rather than recomputed — the map already says which column holds which reading, so the
   first and last non-null positions *are* the grid's edges, and a second derivation is the defect
   `columnMap`'s own comment records (*"a mutation that left-anchored the colours failed nothing,
   because every fixture had exactly as many readings as cells"*). Where the grid does not start at
   column 0 — `window` alone — the captions keep the area and §3ae.7 names why.
2. **A calendar derives three captions where the caller declared none**, at the super-unit's
   granularity: `YYYY-MM-DD` for the day a column of hours is, the week's Monday for a column of
   days, `YYYY-MM` for a column of weeks, `YYYY` for a column of months. A declared `xLabels` still
   wins, which is `fieldAxes`' precedent — *a caller who names one is a caller saying their columns
   mean something the index does not.*

**The cost is that a caption over a narrow grid truncates harder**, and it is the right trade
rather than a regression. `xLabelRow` gives each caption a third of the width it is handed, so a
twenty-cell grid in a seventy-four-cell area renders `epoch… epoch…    now` where it used to render
all three in full — spread across an area whose right two-thirds hold no data. **A caption that
names the right column tersely beats one that names the wrong column in full**, and the caller who
wants both has `width` and shorter labels. `heatmap.captions-left` is the fixture, added because the
shipped half of this had no frame in the corpus: no matrix fixture had ever paired a fringe-leaving
anchor with captions, so 312 goldens and 1264 catalogue files all walked the arm where the two edges
coincide.

**The captions name the columns that are shown, not the columns that exist.** Where the readings
outnumber the cells the oldest are dropped, so the three positions are read *through the map* —
`map[0]`, the map at the middle, and the map at the last occupied cell. Deriving them from the
series' own indices instead would caption a five-year calendar with the first week of five years
ago, which is not on the frame.

## 3af. The alphabet is a capability, and four sites decided it from `plotStyle`

**The ruling is not new here — it is stated three times and the code contradicts it at four
sites.** §3c ends *`plotStyle` names __what__, never the alphabet*; I43 says *`plotStyle: "line"`
says draw this as a connected line; which glyphs do it is the renderer's*; C02 §4 gives the
substitution with a named owner — *box drawing → `+ - |`; braille plots → coarse block plot,
owner C09 C12*. So this section records a defect against a rule the document already holds, and
what it adds is the invariant tests can cite and the instrument that would have found it.

### 3af.1 — measured, at the arm the corpus does not render

A sweep of every catalogue form × variant at `unicode: "ascii"`, both widths:

| | `ascii · narrow` | `ascii · wide` |
|---|---|---|
| variants carrying a non-ASCII codepoint | **49 of 159** | **24 of 159** |

**And the framework's own published contract fails on the commonest form.** `expectDocument(doc)
.degradesToAscii()` — C24 §7, exported for a consumer's suite — refuses a document containing a
`line` plot (`U+256D ╭`) and one containing a `contour` (`U+28C0 ⣀`). A consumer calling the
assertion the framework publishes is told their document is wrong, and it is the renderer's.

### 3af.2 — the four sites, and why each was invisible

| # | site | the decision | what hid it |
|---|---|---|---|
| 1 | `linedraw.ts` `lineDrawRows` | `const table = corners === "sharp" ? SHARP : ROUNDED` — **no capability at all** | `glyphForMask`, **twelve lines below in the same file**, already takes `caps` and already has an `ASCII` table whose comment reads *every caller was emitting box-drawing regardless of capability*. The fix was made, for the exported helper, and never reached the function above it |
| 2 | `definition.ts` `styleRasteriser` | `useLineDraw = ps === "line" \|\| (auto && caps.ambiguousWidth !== "wide")` — it reads `ambiguousWidth`, which answers *how wide is a glyph*, where *can this terminal draw one* is `unicode`; and it discards `_caps` on the way to site 1 | the corpus's only ASCII arm is **wide**, where `useLineDraw` is false. The two capabilities vary together in every fixture, so the wide arm answers for the ASCII one (F212) |
| 3 | `heatmap.ts`, the contour | `const braille = (block.plotStyle ?? "auto") !== "line"` — the alphabet from the style alone | `contourCellRows` **already takes `caps`** and degrades correctly; the chooser above it never asks. Visible in the rendered corpus and never read |
| 4 | `definition.ts`, the violin ×4 | `block.plotStyle === "braille"` passed as a boolean to four routines that each hold `ctx.capabilities` | same — the capability is *in scope at the call site* and is not part of the decision |

**Sites 3 and 4 are in the arm the catalogue does render**, so **32 files of the rendered corpus
carry braille inside a frame labelled `ascii`** — 16 variants in two formats. Nothing read them.
That is the half F212 did not reach: it diagnosed the missing arm, and the arm that exists was
wrong too.

**They are generated and not committed** — `.gitignore` line 18 is `docs/catalogue/` — which is
worth stating precisely, because it changes who could have seen them and it does not change the
count. A reader who runs the generator gets them; a reader of the repository never does, and no
diff has ever carried one. That is a weaker claim than *shipped* and a stronger one about the
instrument: **a corpus is a thing you look at, so a defect in it survives exactly as long as nobody
looks.** AA1 is the answer, because an assertion does not have to be looked at.

### 3af.3 — the separator is the same class in prose

`·` (U+00B7) is written into five plot strings — two legends, a grouped bar's category, a
heatmap's overflow clause, a contour's level list. It passes `checkMarks`, correctly: `·` is in
`PROSE_MARKS` and that rule's own comment records the blind spot with its figure — *106 literals
carry prose punctuation and this passes every one … a real and much larger question, and not this
rule's.*

**It does not pass `degradesToAscii`,** which is a contract on a rendered document and does not
care whether a codepoint is punctuation. The five are fixed here and the wider 106 are not: a plot
frame is the place with the stronger contract, and answering the general question from inside one
component is how a narrow scope comes to read as deliberate (F84).

### 3af.4 — the ruling

**One predicate, at every alphabet decision.** A declared `plotStyle` is a preference about *what*
is drawn; whether the terminal has the repertoire is the renderer's, and at `unicode: "ascii"` the
answer is the substitution C02 §4 already names — `+ - |` for box drawing, the density ramp for
braille, `-` for the separator. **A style is never refused for it**, because a caller could not
have avoided the terminal (I18's precedent, the solid pie at one bit).

**`lineDrawRows` degrades rather than yielding to `curveRows`,** and that is the choice worth
stating: falling back to the ramp would keep the frame ASCII and lose the *connectivity* that is
the whole content of `plotStyle: "line"`. The ASCII table exists, C02 §4 promises exactly it, and
a corner is `+` in all four directions — `/` and `\` read as a slope rather than a join at this
resolution.

### 3af.5 — what the ruling leaves behind

- **The corpus's ASCII arm was also its wide arm and its one-bit arm.** Splitting it is what makes
  any of this visible, and it is a **new** frame for `full · wide` — the combination F171's braille
  ramp lives in and which no catalogue file has ever held. The golden corpus had the same
  conflation: `MONO_CAPS` is `{colourDepth: 1, unicode: "ascii"}`, so the mode named `1bit` was
  ascii · narrow · 1bit and there was **no unicode 1-bit candlestick frame at all** — and the frame
  named `1bit` is what held `╭──────────╯` inside a `+------+` border through review and commit.
  Three golden modes now say what their capability is, and `MONO_UNICODE_CAPS`, which exists for
  exactly this, gains its first caller here.
- **Eleven of `Plot`'s 97 members are set by no catalogue variant**, and three of them —
  `width`, `aspect`, `align` — are this arc's own. They land with frames here, together with
  `plotCorners`, whose pair is newly worth drawing because the ASCII table collapses both arms to
  `+`. The remaining seven — `xFormat`, `yFormat`, `yMin`, `yMax`, `emptyMessage`, `xScale`,
  `yScale` — predate this arc and are **counted, not swept**.
- **The `·` is fixed in five plot sites and stands in ~101 others.** Counted, not swept, and the
  number is in `source-scans.mjs` where the blind spot is declared.
- **Nothing here refuses.** A `plotStyle` a terminal cannot honour still renders, so no caller
  gains an error and no document becomes invalid — which means the fix moves frames and moves no
  validation, and every gate that would have caught it is a frame read.

## 3ag. Labels — six kinds, one pass, and the sizing cycle I48 had already ruled

**Three of the six exist and are not named as one thing**, which is why the rules they share were
about to be written a fourth time. `yCallout` places a value at a series' own row; `xAxis` places
ticks and drops the ones that collide; `hierarchyStripRows` writes a node's name inside its strip
and drops it where it does not fit. Each carries its own placement, its own collision rule and its
own drop. **This section is the partition, and the walk is what it is for.**

### 3ag.1 — the kinds, and what each anchors to

| kind | anchors at | drawn in | today |
|---|---|---|---|
| **value** | the series' last inked row, read from ink (I48) | right gutter | `yCallout: "last"` |
| **series name** | the same row, the same reading | right gutter | — |
| **annotation** | the reference line's row | legend row | — (C04 I52) |
| **node** | the node's own strip or tile | inside the area | strips only (§3n) |
| **point** | one cell right of the sample, or one left | inside the area | — |
| **axis title** | the row below the x-labels | outside the area | — |
| **segment** | — | — | **refused — `segmentLegend` ships** |
| **tick** | its own column or row | gutter, x-row | `niceAxis` (§3d) |

**A tick is on this list to be excluded from the rest of it.** It is *at* a position and the others
are *near* one, which is the whole difference between the two collision rules: a tick that moves is
a lie about a coordinate, and a name that moves is still the same name.

### 3ag.2 — the classification table: two rules that both hold at rest

| | rule A | rule B | ruling |
|---|---|---|---|
| **A1** | I48 — a callout displaces the mirrored right label and never the left gutter's | `"both"` puts a name *and* a value on one row | **The pair is one string in one gutter and the value leads.** Two gutter writers on one row is the four-gutter defect I24 was written about. Where the pair does not fit, the **name** is cut: I48's own argument is that the value is the number a live chart is read for |
| **A2** | a series name at the line's end suppresses the auto legend | I25 — two things a reader must tell apart differ by mark or by name | **Confirms, and it is why the suppression is safe.** A name at the line's end *is* the name, so I25 is satisfied by the thing that replaced the legend rather than in spite of it. `POSITIONAL_STACKS`' existing suppression rests on the same sentence |
| **A2b** | `yCallout: "name"` writes an identity in the right gutter | below the colour floor the positional family stacks and `stackedRows` writes each name in the **left** gutter (I6, I7) | **`"name"` writes nothing there and `"both"` degrades to the value.** With `yAxis: "both"` I47 mirrors the strip's name rightwards, so a name callout was the **third** copy of one word on one row. Same rung `legendPlacement` already declines at, for the same sentence — *not where the form has already labelled its own rows*. **This row came from reading a frame**: no count, width or row-index assertion in the suite could see three copies of a correct string |
| **A3** | C04 I52 — an annotation's label needs a legend row | `legend: false` is the caller refusing that row | **Refused at both gates.** A label with `legend: false` asks for a string and forbids the only place it goes. C04 I57's three refusals are the idiom, and a construction throw leaves nothing behind because it fires before any render state exists |
| **A3b** | a labelled annotation earns a legend row | `SHARES_CELLS` decides which forms get one automatically | **The two are separate clauses and the label's does not join `count`.** `SHARES_CELLS` partitions forms by whether *categories* share cells; an annotation's label is not a category, so folding it into the count gives a line plot its row and refuses a `lollipop` for a reason about neither. **This shipped as both for one turn** — an early return *and* a widened count — and each masked the other perfectly, since either alone answers the one-series case. The survivor **pair** was the only signal that a second mechanism existed |
| **A4** | I8 — a series is never dropped silently | a dropped **label** is not a dropped series | **I8 does not reach it, and saying so is the ruling.** A tile whose name did not fit is still drawn and still carries its extent; nothing about the data is missing. I8 is about a series having *no row*, and a label has no row of its own to lose |
| **A5** | §3n — a tile's label goes in its padding ring | `inset` pads only where `w > by * 3` | **No ring, no label, and no notice.** The same condition read for a second purpose, and A4 is why it can be silent |
| **A6** | a point label sits one cell right of its sample | the area's right edge | **Two positions and never a slide.** Right of the point, or left of it, or dropped. A label slid inward from the right edge covers **the sample it names**, and an anchor hidden by its own label is worse than no label |
| **A7** | `xTitle` costs the row below the x-labels | `legend: "below"` costs the same row | **Both, stacked, title nearest the axis.** Two declared rows, both counted by `plotHeight` before the data — I1 is untouched because neither is data-dependent |
| **A7b** | `titleRows` adds the row for **every** form | only 26 of 44 compose one | **The refusal is the mechanism, not a courtesy.** Sixteen of the eighteen refused forms declare the row and draw nothing into it, so `measure` and the rendered count part company — and `composeRows` pads, so the frame still renders, with a blank line where a title should be. **Measured by rendering all 44 with a title set**, which is why `HAS_X_TITLE` is a record and not a predicate |
| **A8** | `xTitle` sits below the x-label row | `axes: false` removes that row | **Refused at both gates.** A title for an axis that is not drawn names nothing, and the alternative — floating it at the bottom — is a second placement rule for one member |
| **A9** | a vertical legend sizes itself to its longest entry | a drop count would be an entry | **The cycle. See below** |
| **A10** | the treemap paints children over parents | a parent's label lives in the ring the children do not cover | **The root is not an exception.** Its children are inset from the unit square, so its own top row is free by the same arithmetic. Depth 0 needs no special case, which is the check worth having rather than the rule |
| **A11** | a point label is drawn inside the area | `mergedRow` takes the first layer that inked a cell | **A label is an annotation and draws last, over the data** — the opposite of C04 I23's reference line, and deliberately. A line is a *claim about the ordinate* the curve is compared against; a label is the curve's own name, and a name hidden by the thing it names says nothing |
| **A12** | a point label is placed against the overlaid layer list | below the colour floor `positionalForm` stacks and never builds that list (I6, I7) | **The names reach the stacked arm too**, per strip, against that strip's own height and its own collision grid — strips share no rows. `calloutInto`'s comment already states the hazard: *a map built only in the overlaid arm accepts the field and draws nothing at one bit, on the exact terminals where a reader most needs it spelled out.* Second consumer, same sentence |
| **A13** | the slot reserves a cell so `+` is expressible | the reservation sits at one end of the slot | **A blank neighbours the sample and the mark is outermost, on both sides.** The first shape put the reserved cell at `start + span − 1` — the *far* end when the label sits right of the sample and the *near* end when it sits left — so `tail ⠠` had a gap and `⠁peak` did not, and a `+` would have appeared between a dot and its own name. **The arithmetic was self-consistent either way**; only the frame separates them |
| **A14** | the slot pads a cell either side of the text | `mergedRow` takes the first layer that **inked** a cell, and a blank inks nothing | **The padding is transparent and the slot reserves placement, not ink.** Read from the corpus: `last` at the right edge draws `⢀last⡀`, with the curve showing through both pad cells. Opaque padding would delete two samples to separate one name from its own dot, and a scatter's dot **is** the datum — so A11 gives a label the cells its *text* occupies and no more. The pad keeps a second label out and gives the `+` somewhere to go, which is all it was ever for |

### 3ag.3 — the sequence trace: reserve, size, place, drop, mark

| | the sequence | what it finds |
|---|---|---|
| **S1** | place A · place B · A would collide with B | **Placement is one pass in series order and a label never moves onto an occupied cell.** A shift that could displace an already-placed label makes the output depend on the order two independent labels were considered in |
| **S2** | A at the right edge flips left · B is already there | Flip, then test, then drop — **the flip is a candidate and not a commitment**. A2's two positions are two candidates and the drop is the third rung |
| **S3** | a label is dropped · the survivor is marked | **A one-cell `+` at the survivor**, never `+N` |
| **S4** | the legend is sized · labels are placed · a drop wants a legend entry | **the cycle** |
| **S5** | `"both"` · the pair does not fit · the name is cut · the value alone fits | A1's ruling reached from the other side; the `+` is not drawn, because nothing was *dropped* — one string was truncated |

### 3ag.4 — the cycle, and it was ruled before this section existed

**S4 and A9 are the same thing and it does not terminate.** A vertical legend's width is
`longest entry + gaps`, capped at a third. The width decides `areaWidth`. `areaWidth` decides where
every sample lands. Where samples land decides which labels collide. Which labels collide decides
what is counted. What is counted is a legend entry, which decides the width.

**I48 found this and ruled it, one label kind along, in one clause:**

> Two on one row: the later wins and a one-cell `+` says so (I8), **not `+N`, whose count needs
> the ink that needs the width that needs the column being sized.**

So the ruling here is inherited rather than made: **a dropped label is marked at the survivor with a
one-cell `+`, and no label outcome is ever a legend entry.** The legend is sized from series,
segments and annotations — everything knowable before a single label is placed — and placement
reads that width without writing to it.

**This strikes the obvious answer, which is the one this section was planned with.** *A dropped
label is counted in the legend, on I8's mechanism* is what the plan said, and it is the arm I48
explicitly refused, for this reason, in this component. **The walk's job was to find that the plan
had re-derived a ruling and got it backwards**, and the reason it could is that I48's clause is
about a *callout* — so a reader indexing by label kind never reaches it.

### 3ag.5 — residue

- **`plotMarks: "always"` and a label's mark prefix are two answers to one question at 24-bit** and
  the interaction is not walked here. Both are opt-in and neither is a default, so nothing is
  silently doubled — but a caller setting both gets a mark on the swatch and a mark on the label,
  and whether that is redundant or wanted has not been measured.
- **A9's cycle is broken by fiat rather than by construction.** Nothing in the types stops a future
  label rule from writing a legend entry; what stops it is this section. That is weaker than
  `measure`'s purity, which cannot be broken without a signature change, and it is recorded as
  weaker.
- **The tick is excluded and its own drop rule is untouched** (§3d). Two collision rules now live in
  this component and the partition between them is *at* versus *near*, which is a sentence and not a
  predicate — no `TICKLIKE` record makes it total over the kinds.
- **§3n said *dropped and counted* and A4 strikes the counting**, which is a correction inside the
  arc that wrote it: the finding's own remedy, one commit old, over-applied I8 to a case I8 does not
  reach.

---

## 3ah. `tree` — three layouts of one drawing, and the ladder the plan brought is not one

A `hierarchy` has four readings and three of them are about magnitude. `flame`, `icicle` and
`treemap` divide space in proportion to `value` (§3n); **`tree` draws the structure and nothing
else** — the node-link figure every reference means by *a tree diagram*, where a parent sits over
its children and an edge says only *this is under that*.

### 3ah.1 — the plan said `plotDetail`, and measuring the three layouts says it cannot

Phase B was planned around a rung ladder: three layouts on `plotDetail`, `rungFor` widened to take
a row budget and a column budget, `HAS_DETAIL_RUNGS.tree` set to `true`. The natural size of each
layout, measured over four trees before any code:

| the tree | top-down | left-to-right | outline |
|---|---|---|---|
| the catalogue's · 9 nodes, 5 leaves, depth 3 | 7 × 31 | 5 × 29 | 9 × 18 |
| broad · 13 nodes, 12 leaves, depth 1 | **3** × 85 | 12 × 13 | 13 × **11** |
| deep · 7 nodes, 1 leaf, depth 6 | **13** × 6 | **1** × 50 | 7 × 28 |
| wide-parent · 5 nodes, 3 leaves, depth 2 | 5 × 20 | 3 × 27 | 5 × 22 |

**No ordering survives the four rows.** On the catalogue's tree the rows run left-to-right (5) <
top-down (7) < outline (9) and the columns run outline (18) < left-to-right (29) < top-down (31),
which already disagree. The two extremes are what settle it: on the **broad** tree the top-down
figure is the cheapest of the three in rows, at 3, and the dearest in columns, at 85; on the
**deep** tree it is the dearest in rows, at 13, and the cheapest in columns, at 6. The same layout
is a floor on an axis for one tree and a ceiling on that same axis for another, so there is no
ordering by budget — **not even one that depends only on the budget**, because which layout is
cheapest depends on the tree.

**And they carry the same information.** All three draw the same nine names and the same eight
edges, and none of them encodes `value`. I34's test for a rung is *every rung adds information
rather than resolution — a figure that says the same thing larger is not a rung, it is a bigger
drawing*, and these three fail it in the same way: they are one drawing at three aspect ratios.

So **`HAS_DETAIL_RUNGS.tree` is `false`** and `plotDetail` is refused on the form. B1 wrote that
record one commit ago to give the member a scope; the first new question put to it is answered in
the negative, which is what a record is for. **`rungFor` does not change**, and the plan's own
weak joint — *changing the call shape touches the two forms with the most intricate ladder in the
component* — is not paid rather than being paid carefully.

### 3ah.2 — the three layouts, and each formula is a measurement

Rows and columns are the layout's **natural** size: what it needs to draw the whole tree.

- **top-down** — Reingold–Tilford. `rows = 2·depth + 1`, a label row and a connector row per
  level. `columns = W(root)`, where `W(leaf) = cells(label)` and
  `W(node) = max(cells(label), Σ W(children) + (children − 1))`.
- **left-to-right** — the same node-link figure turned ninety degrees. `rows = leaves`, each leaf
  on its own row and each parent on the midpoint of its children's. `columns = Σ_d max cells(label
  at depth d) + 2·depth` — one aligned column per depth so the depth is readable down the figure,
  two cells of edge between them.
- **outline** — `tree(1)`. `rows = nodes`, `columns = max over nodes of (4·depth + cells(label))`.

**The `max` in the top-down width is the interaction, and the plan's formula did not have it.**
That formula was `Σ leaf widths + gaps`, which gives **5** on the wide-parent tree and the
measurement gives **20**: `initialiseRenderer` is eighteen cells over two children of one, so the
parent's own name is what the subtree has to be wide enough for. Without the `max` the name is
drawn over its siblings and **every count still agrees** — the leaf positions, the depth, the node
total. It is the same shape as the defect the plan predicted for the contour shifting, one term
earlier and reachable with the contour arithmetic entirely correct.

**Four cells of indent is not a taste.** `├── ` and `|-- ` are both four cells, so the outline's
indent is the one geometry in this section whose ASCII arm is free: I9's identical cell grid holds
by construction rather than through a substitution table.

**Only the top-down figure is centred in the area, and the single-node case is what made that a
decision.** A tidy tree is symmetric about its root and its subject is the shape, so it is centred;
an outline is a list and a list is read from the left; a left-to-right figure's root is the
leftmost thing in it, and centring would put a gap exactly where the reader starts. Three answers
rather than one, each from the figure it belongs to.

**Two nodes at one depth never share a row in the left-to-right layout**, and it falls out of the
in-order rule rather than needing a check: sibling subtrees occupy disjoint leaf ranges, a
parent's row is the midpoint of its own range, and distinct non-empty ranges have distinct
midpoints. Depth separates the columns, so nothing at two depths can collide either.

### 3ah.3 — `treeLayout`, and `"auto"` is a fit rather than a rung

    treeLayout?: "auto" | "topDown" | "leftRight" | "outline"

Default `"auto"`. **A union-typed field rather than a question** is §3w's ruling — build the
variants and let the caller name one — and it is what every reference does (`rankdir` in graphviz,
`tree(1)` being its own program).

**A second member rather than one shared with `graph`.** The value sets do not overlap: a tree has
no `"force"` and a graph has no `"outline"`. Sharing would make a six-value union with two
per-form refusal lists, which is a larger artefact and a worse message than two members each
refused off everything but its own form. Recorded here so phase C does not re-open it.

**`"auto"` takes the first layout that fits both axes, preferring top-down, then left-to-right,
then the outline.** Top-down first because it is what *a tree diagram* means — the figure a reader
recognises without reading it. Left-to-right second because a terminal is wide and short and a
broad tree is what it survives: 12 × 13 against the top-down's 3 × 85 on the broad tree above. The
outline last, not because it is worse but because it is the reading a `pre` block could already
have given the caller; **where a drawing fits, a plot form should draw.**

**Where none fits whole, `"auto"` takes the layout that keeps the most nodes at the budget**, ties
broken by the same preference order. Not the smallest overflow: overflow is measured in rows and
columns and the two are not comparable, while nodes kept is the thing the figure is about.

### 3ah.4 — what does not fit is named in a row, and the row is spent before the choice

I8's mechanism, which `stackedRows` already draws: the nodes that fit, then a `warn`-toned line
inside the plot area — `+4 more · gc · io · …`. It costs no width, so it cannot feed §3ag.4's
sizing cycle.

**It costs a row, though, and that is the cycle in a second place.** The notice exists because
something was dropped; what is dropped depends on how many rows the drawing has; how many rows it
has depends on whether the notice took one. Ruled the way §3ag.4 ruled the legend: **the layout is
chosen once, against the full row budget; if the chosen layout's natural rows exceed it, the last
row becomes the notice and the drawing takes `rows − 1`; the choice is never revisited.** So the
notice cannot remove itself by making the drawing fit, and nothing whose existence depends on a
size sets that size.

**Each layout drops in its own order, and then all three share a tail.** The outline drops from
the end of the pre-order walk, the top-down drops the deepest level and its connector row
together, the left-to-right drops the last leaf and any ancestor it leaves childless — **and every
one of them ends in the outline's sequence, a pre-order prefix down to the root.**

**The tail is not tidiness: a sequence keyed on a layout's own axis cannot reach every budget.** A
depth cut cannot narrow a broad tree and a leaf cut cannot narrow a deep one, and the measured case
is a six-deep chain one column short of its left-to-right width, where the leaf sequence has
**exactly one step**, nothing is dropped, and a name is silently clipped instead — which §3n
forbids in as many words. The own-axis phase still comes first, because it is what makes the
drawing readable: a top-down figure cut by depth keeps a whole level where a prefix keeps one
branch.

**So the count in the notice is a property of the layout and not of the tree** — the same tree in
the same box reports a different `+N` under two layouts, and that is correct rather than an
inconsistency. It survives the shared tail, because what differs is the step each layout can
afford rather than the sequence it walks.

**And the notice takes its row rather than sharing it.** Clamping the drawing's budget to a floor
of one gave the figure the only row there was and left the notice nowhere to go, so a tree that did
not fit rendered its figure and said nothing about what was missing — I8's exact subject arriving
through a `Math.max`. At a height of one an overflowing tree is the notice alone, which is the
honest frame: there is one row, and what it has to say is that the figure is not in it.

### 3ah.5 — the fan, and there is no new vocabulary

A parent to *N* children is three orthogonal moves: a stub down from the parent, a bar across the
children's columns, a stub down to each child. `strokePolyline` strokes them and `glyphForMask`
resolves `┬ ┴ ├ ┤ ┼ ─ │`; the ASCII arm gives `+ - |`.

**A fan of one is not a bar.** A bar of zero length drawn as `┬`…`┴` puts a branch glyph where
nothing branches, so one child is `│` and the two cases differ in the frame.

**Curved and diagonal are refused for the layout's reason and not the toolbox's.** `drawLine`
would draw a diagonal at 2 × 4 today — the cost argument expired before it could be made — and the
reason that stands is what a tidy tree's edge means: every run is down or across, and a braille
diagonal would be a second alphabet in a figure whose joins are box-drawing.

**No categorical palette.** Edges are `tone.muted` — they are structure, like a gridline — and
names take the default text tone. A treemap needs `categoryRef` because adjacent tiles have
nothing else to separate them; a tree's edges do that job, and `CATEGORY_LIMIT` is 8 against a tree
of arbitrarily many nodes. **So I25 has nothing to carry here**, which is stated rather than left
to be discovered: there is no identity in colour to lose, because the name is the identity at every
depth and it is drawn at every capability.

### 3ah.6 — `value` is ignored, and the answer sits beside the ruling

`hierarchy` is one field for four forms and three of them are about magnitude (C04 I54).
Reingold–Tilford places by structure alone, so **`tree` reads `label` and `children` and nothing
else**.

**The ruling alone would not be enough.** A caller who passes a weighted hierarchy and watches the
weights vanish has a fair complaint, and *a field that does nothing reads as one not yet
implemented* is exactly what a bare refusal leaves open. Two things close it, and the second is
the one that matters: `value` becomes **optional** on `HierarchyNode` (C04 I64), so a tree's
caller does not have to invent a number; and `HierarchyNode.value`'s own doc carries the answer —
**put it in the name.** `label: "gc (2.1s)"` costs nothing, works today, and is what the caller
wanted.

### 3ah.7 — the classification table: rules that both hold at rest

| the cell | the two rules that meet | what it resolved to |
|---|---|---|
| a named `treeLayout` × a budget it does not fit | *the caller's choice is honoured* meets *a figure never overflows its declared height* (I10) | **1** — the choice is honoured and the drawing is truncated, exactly as an explicit `"full"` degrades rather than overflowing (I28). `"auto"` is the only value that may change layout, which is what makes the other three mean anything |
| a parent's own label × its children's span | *x is the in-order position of the leaves* meets *a node's label is written where it fits* (§3n) | **2** — the parent sets the width where its name is wider than everything beneath it. Measured at 20 columns against the plan's 5, and without it a name is drawn over its siblings with every count agreeing |
| a dropped node × a dropped name | *a name that does not fit is dropped silently* (§3n) meets *data that goes missing is counted* (I8) | **3** — the same event here, and the ruling is the **opposite** of the neighbouring form's. A tile has an extent and keeps its datum when its name is dropped; a tree node **is** its name, so a name that does not fit is a node that is not drawn, and it is counted |
| the notice's row × the layout's rows | *the notice costs a row* meets *the layout was chosen against the budget* | **4** — §3ag.4's cycle in a second place, ruled the same way: chosen once against the full budget, the last row spent if anything was dropped, never revisited |
| a fan of one × the bar across the children | *a parent joins its children with a bar* meets *the bar spans the children's columns* | **5** — zero length drawn as `┬`…`┴` is a branch glyph where nothing branches. One child is `│`, and the two differ in the frame |
| a single-node tree × all three layouts | *each layout has its own shape* meets *a root with no children has no shape to have* | **6** — one row, one name, no edge, no notice — **and the walk said the three agree exactly, which the frames refuse.** The top-down figure centres its drawing in the area and the other two begin at column 0, so a single node discriminates no *structure* and does discriminate *placement*. The corrected reading is the useful one: a single-node fixture cannot tell one layout's shape from another's, and the only thing it can tell them apart by is the one property the ruling above had not been made about (§3ah.2) |
| a wide codepoint × the column arithmetic | *`cells()` and never `.length`* meets *a two-cell character owns the cell behind it* | **7** — the treemap's names already answer it, continuation cell and all (§3n, T1.104) |
| `unicode: "ascii"` × the outline's indent | *the ASCII grid is identical* (I9) meets *the indent is a run of glyphs* | **8** — `├── ` and `|-- ` are both four cells, so four is chosen **because both alphabets have a four-cell form** |
| `colourDepth: 1` × I25 | *category identity survives colour loss* meets *edges are structure and names are text* | **9** — nothing to carry, and the row exists so the absence is stated rather than found later |
| `legend` × a form with no series | *a legend names series, segments and annotations* (§3ag.4) meets *a tree has none of the three* | **10** — no entries, so `"right"` costs no width, and **`"below"` still costs its row**: that is I27 rather than an oversight, since a row appearing when data arrives shifts the transcript below it. A tree can never gain a series, so it is the second member of I27's stated residue rather than an exception to it (F222) |

### 3ah.8 — the trace: the composition passes, and what each may touch

§6d.2's shape rather than §6c's. There is no ladder to walk width by width, and the sequence that
does exist is the order the passes run in.

| pass | may read | may not |
|---|---|---|
| 1 · read | the tree | the budget — a count that changes with the width is a count of the drawing |
| 2 · choose | the counts, both budgets, `treeLayout` | anything about what will be dropped |
| 3 · truncate | the chosen layout's drop sequence, `rows − 1` where the first fit overflowed | the layout, which is already chosen |
| 4 · place | the **kept** set | the dropped set |
| 5 · route | the placed positions | `children` — an edge is derived from the kept set |
| 6 · notice | the dropped count and their names | anything with a width |

Three readings:

- **A · truncate before placing, and it is an ordering rather than an optimisation.** Place first
  and drop after, and every surviving parent is centred over a span that includes the subtree that
  is gone: the parent sits over blank cells, every count agrees, and the figure says the tree has a
  child it has not. **This is the defect the plan predicted for Reingold–Tilford's contour
  shifting, reachable with the contour arithmetic entirely correct** — which is the argument for
  the trace, since no row of the table above reaches an ordering.
- **B · pass 5 reads positions and never `children`.** Deriving an edge from the tree draws a line
  to a child pass 3 removed. It is one pass along from A and it is a separate ruling, because the
  fix for A does not fix B: a correctly truncated placement still has a complete tree beside it.
- **C · the notice is composed last and can afford to name things**, which is the loop closing.
  Pass 2 has already spent the row, so pass 6 cannot widen anything, and the `+N` may carry names
  without re-entering §3ag.4's cycle.

### 3ah.8a — what the instruments said, and each found something the other could not

**The frame read the overflow at all three layouts, because the notice competes with something
different in each** — one more line in a list, a row under a fan that could read as a child of the
node above it, or a row beside the deepest column. Six catalogue variants and twenty-four golden
frames, and the finding is in the first of the three.

**A glyph that claims *last* was computed over what survived.** The outline drew

```
root                          root
╰── render                    ├── render
    ├── curve         →       │   ├── curve
    │   ╰── raster            │   │   ╰── raster
    ╰── paint                 │   ╰── paint
+4 more · layout · …          +4 more · layout · …
```

and `╰──` **is a claim**: *this is the last child of root*. `layout` and `parse` are named in the
notice one row below, so the glyph and the notice contradicted each other, and the glyph is the one
a reader believes. Read from the real sibling list it says `├──`, which is true, and the notice
completes it rather than arguing with it.

**Only one layout could have the defect *fixed*, and that is the ruling rather than the repair.**
The top-down figure draws no glyph about siblings at all — a truncated level leaves parents with no
fan, and an absent fan claims nothing. The left-to-right figure **does** make a claim: `root──render`
is a straight run where three children would give `┬ ├ ╰`, so it says *one child* about a root that
has three. It is not fixed, and the reason is that its glyph is an **edge** where the outline's is a
**list marker**: an edge needs a row at the other end, and the only way to say *more below* is to
extend the vertical run past the last drawn row — into the notice, which would make the notice read
as a child. That is the exact failure this read was looking for, arriving as the cost of the repair
rather than as the defect. So: where the alphabet's distinction is about the sibling **list**, take
it from the tree; where it is about an **edge**, the absent fan plus the notice is the answer. **And it is invisible at `unicode: "ascii"`**, where
`glyphForMask` substitutes both forms to `+`: the arm that cannot show it is the one four of the
twelve frames were drawn on.

**Twelve mutations, all caught** — and two first landed on rows other than the ones that named
them, which is the pass's other job.

- **`OUTLINE_INDENT` governed the measurement and half the drawing.** The constant sized the
  layout and padded the blank continuation, while the bar and the branch were written out as
  four-cell strings; the two agreed by coincidence. Setting it to 2 left the figure four cells wide
  and its declared width two, so the outline overflowed and **a row about a natural size caught a
  defect about an indent**. The prefixes are derived from the constant now, and the mutation lands
  where it is aimed. *A mutation caught elsewhere is a claim about coverage; this one was a claim
  about the code.*
- **A row that could not tell one node dropped from all of them.** Without the shared tail the
  left-to-right sequence has a single step on a chain, `fitTo` gives up and returns nothing, and a
  notice appears **either way** — so every row asserting *something was dropped* passed. The row
  added for it asserts the count: one column short of the chain's width drops one node, not seven.

### 3ah.9 — what the refusal leaves behind, and the third path is the one a walk forgets

`form: "tree"` with no `hierarchy` is refused, on C04 I57's idiom — `plotStyle: "candlestick"`
with no `ohlc` is the same sentence one field along. **Three paths and three answers:**

- **construction** throws, and leaves nothing behind: it happens before any render state exists.
- **a document** is refused by `validateBlock`, and never renders.
- **a fixture reaches the renderer without passing either** — I2's own wording — so `treeRows` is
  total and an absent hierarchy draws `emptyRows`, which is what `treemapRows` already does.

The third is the one to state, because a refusal at two gates reads as a guarantee at three.

---

## 3ai. `graph` — a layered layout, and the refusal that survived being re-asked

`tree.ts` is the template and most of it transfers: a **character grid with a box-drawing mask**
(`grid`, `paint`, `glyphForMask`), a fit that drops what does not fit, and a row spent on `+N more`
(I8). `graphArea` is the same signature and the same primitives, so a graph is not a new drawing
technology — it is a new **placement**.

### 3ai.1 — six passes, and the recipe named three

Layer assignment by longest path and ordering by median heuristic are the two anybody names. The
other four are load-bearing and three of them were found before any code (F242):

```
1  cycle removal      longest path presupposes a DAG and nothing in `graph` forbids a cycle
2  deduplication      reversing b->a where a->b exists yields the same edge twice — 24 in 360
3  layer assignment   longest path
4  dummy nodes        an edge spanning layers has nothing for the median to order
5  ordering           median heuristic, two sweeps, BEST-KEPT
6  placement          left to right within a layer, label width plus a gap
```

**Pass 2 came from checking the instrument rather than from reading the recipe**, which is why it
is listed beside the two that were reasoned about: a duplicated edge is drawn twice, counted twice
in every crossing figure, and looks exactly like a correct one.

**Two sweeps is a number chosen, not a recipe followed.** One sweep never hurts — 0 of 40 trials in
every cell of the corpus — and cuts crossings four- to fivefold. **Two, taken plainly, is worse than
one in a whole family**: at near-path *n* = 50 the mean rises from 36.5 to 38.1 and 17 trials of 40
come out worse. *Best-kept* — keep the ordering with the fewest crossings seen rather than the last
produced — makes it monotone by construction for one crossing count and one array copy a sweep, and
past two the marginal gain is 3–6% where the first buys 80%. At the sizes that fit a terminal it is
already at the floor (F242).

### 3ai.2 — `force` is refused on the labels, and the refusal has been moved once already

**It used to rest on the edges** — *`strokePolyline` steps orthogonally, so angles render as
staircases* — which is a fact about **the tool** and not about force layouts: `drawLine` strokes
arbitrary angles at 2 × 4 and is on every line plot's default path. Four of the five reasons that
refusal ever carried have expired, and each was written by somebody who found the last one thin.

**What stands is that the labels collide, measured at three densities**: 0% on a near-path graph,
0% on a complete one, and **17.4% of label pairs at a third of the edges present, *n* = 20** — and
both ends reading clean is why the first probe, run at one extreme, moved the refusal off the
labels before the middle was measured.

**And the same question, asked of the layout being kept, comes back clean for a structural reason**
(F242). A layered layout places a layer's labels side by side with a gap, so an overlap is **not
expressible** — zero in 360 graphs — and the failure mode is a layer wider than the area, which is
overflow and has an answer in I8's row. *A refusal that survives being re-asked of the alternative
is a stronger refusal than one that was never tested*, which is the reason to record it here rather
than in a plan.

**The expiry is the label pass and it is written as a symbol**: when `shiftInward` and the label
taxonomy can shift, drop and count, a force graph draws the nodes it can label and counts the rest
on I8's mechanism. *A deferral names a condition and nothing watches it*, so the condition is a
name that can be grepped rather than a sentence about capability.

### 3ai.6 — the seventh pass, and why six were shipped

**The pipeline was named as six and built as five and a packing.** Ordering decides *which* node
sits where in a layer; nothing decided *where the layer sits*, so each one was centred on its own
width. For a chain of four whose layers hold one, three, three and two nodes that puts the labels at
columns 37, 35, 34 and 34 — a figure that steps sideways as it descends, with every edge between
those rungs drawn as a staircase between two nodes that should share a column.

**No count could have found it.** The crossing number is unchanged, the width is unchanged, `measure`
equals the rendered rows at every width, and the figure fits. The frame is the only instrument that
disagrees, which puts this with the eleven other defects the reading step found and none of the
assertions did.

**The remedy is the phase the first build skipped**, and it is three rules:

- **Pull to the median** of a node's neighbours in the adjacent layer, using the same segment list
  the ordering pass used — so the two passes cannot disagree about who is adjacent.
- **Restore separation without reordering.** The ordering pass owns the order and bought a crossing
  count with it; a placement free to swap two nodes would spend that without being able to see it.
- **Centre once, on the whole figure.** Centring per layer is the defect itself, so the pass ends by
  shifting the finished bounding box rather than each row.

**Four sweeps, alternating**, on the same argument the ordering sweeps were chosen with: past the
second the gain falls off, and an odd number leaves the last-swept end privileged.

### 3ai.3 — the figure does not claim direction, and that is a ruling rather than an omission

**The layout is directed** — layering uses edge direction, and top-to-bottom is what the reader
reads. **The drawing is not**, because carrying direction explicitly needs an arrowhead, and `▼` is
in no file in this repository while `▲`, `↑` and `↓` are `East_Asian_Width=Ambiguous` throughout
(`glyphs.ts`). That is the ambiguous-width arm again — the standing risk with three defects already
— and a mark chosen for a figure rather than taken from the glyph set is F161's class in a drawing.

**So the convention carries it and the exception is counted.** Every edge in the laid-out graph runs
forward by construction, so downward *is* the direction — except for an edge the cycle pass
reversed, which is the one case the figure would misstate. Those are named in the notice row
alongside what was dropped, because the row already exists and a second one would cost a row of the
drawing:

    +4 more · 2 reversed

**The expiry is a symbol**: `GlyphSet` gaining an arrowhead member with its wide arm and its ascii
arm, at which point the convention becomes a fallback rather than the whole story.

### 3ai.4 — §8a, the classification table

**Structure at rest, so the table is primary** — the form has no session state, and the cells are
where two rules both hold. A row governed by one rule restates that rule and finds nothing.

| | two rules | the cell | ruling |
|---|---|---|---|
| **G1** | cycle removal · dedupe | `a→b` and `b→a`: reversal makes `a→b` twice | dedupe **after** reversal. Before it, both are legal distinct edges and removing one is data loss |
| **G2** | reversal · drawing | a reversed edge points the wrong way down the page | §3ai.3 — counted in the notice, not marked, and the expiry is a glyph |
| **G3** | longest path · a self-edge | `layer(a) > layer(a)` has no solution | refused at both gates (C04 I69), not dropped |
| **G4** | drop · dummies | a dropped node leaves dummy chains in the layers that remain | dropping a node drops its edges *and their dummies*, or a chain leads nowhere and draws as a stray line |
| **G5** | median · dummies | a node whose neighbours are all dummies | fine, and it is why dummies exist: the median is over **positions**, which a dummy has |
| **G6** | median · an isolated node | no neighbour in the adjacent layer, so no median | keep its index. Any other answer migrates a node with no edges on every sweep, and two renders of one input differ — I11 |
| **G7** | drop · the notice row | nothing was dropped, so nothing to say | the row is spent only when something is dropped, which is §3ah.4's ruling one form along |
| **G8** | drop · a non-empty graph | every node dropped | draw nothing and give the whole area to the notice — `tree`'s `keptCount === 0` arm |
| **G9** | longest path · disconnected components | two components with no edge between them | they **share** layers, laid out together from 0. Stacking would need a second placement pass and a component is not a unit the caller named |
| **G10** | box drawing · `ambiguousWidth: "wide"` | every edge glyph doubles | `glyphForMask`'s existing arms — inherited from `tree`, and the reason §3ai.3 refuses to add a new character |
| **G11** | a two-cell label · edge routing | an edge walks into the `""` continuation cell | `tree`'s `write` already leaves it unwalkable (§3n) |
| **G12** | declared height · the drop | the height is C12 I1's promise | area rows are the declared height less furniture, and the fit drops until it holds |
| **G13** | `graph` present · `hierarchy` present | both on `form: "graph"` | refused — a form has one data shape (C04 I69) |
| **G14** | `graphLayout` present · `graph` absent | two faults in one document | the missing `graph` is reported; the walk stops at the first |

### 3ai.5 — §8a-bis, the sweep trace

**The ordering pass is event-mediated inside itself**, which is the half no table reaches: a sweep
moves a node, and what the next median sees depends on whether that has happened yet.

| | sequence | the interaction | ruling |
|---|---|---|---|
| **S1** | down sweep orders layer *L*+1, then *L*+2 | *L*+2's medians are read against *L*+1's **new** order | intended — a sweep propagates, so the layers are visited in sequence and not independently |
| **S2** | within one layer: X's median computed, the sort moves X, Y's median computed | Y's median would read a **half-applied** order | compute every median first, then sort once. *Deltas read as state*, in an ordering pass |
| **S3** | sweep 1 down, then sweep 2 up | sweep 2 can undo sweep 1 | measure after each and keep the minimum (§3ai.1) |
| **S4** | two nodes with equal medians | the tie | current position, so the sort is stable — otherwise two renders of one input differ (I11) |
| **S5** | best-kept records the winning order, a later sweep mutates the rows | **the record must be a copy** | copy on record. Holding a reference makes best-kept a no-op that reports the right number and returns the wrong order — every crossing assertion passes and only the frame disagrees |

**S5 is the one this artefact was worth running for.** It is not a rule interaction anybody would
list from the rules; it is the shape where a correct fix changes nothing observable, and the number
it reports is right the whole time.


## 3aj. The gate for phase 3's shared-geometry refactor — written now, run later

**A gate nobody can find is a gate that will not be run**, and this one has to survive two phases
before anything invokes it. It is recorded here, beside the geometry it governs, because that is
where the refactor will be read — not in the note, and not in the plan that produced it.

**Phase 1 writes this and does not run it.** Nothing shares geometry yet. The dither arm (C09 §4c)
is the first thing that will want to, which is exactly when an unwritten gate gets skipped.

### The gate

> **The shared-geometry refactor lands in its own commit and zero golden frames change.** Two
> commits, never one. Make the geometry unit-agnostic and prove nothing moved; *then* add the
> image path. **If both land together a moved frame is ambiguous** between refactor and feature,
> and that ambiguity is how a regression ships. **Byte-identical, not *looks the same*** —
> `git diff --stat` reports zero, and a frame that moves is a finding read before anything else
> happens.

### The four hazards, because a gate without its content is a slogan

**1 · Where the rounding happens.** Cell coordinates are integers and pixel coordinates are
floats. The tempting refactor makes the shared code float and rounds at the output — **and that
moves every boundary case by one cell.** `Math.round` at the end is not `Math.round` at each
stage, and the difference is invisible in the code and visible in every frame. **The rule: the
shared layer produces normalised coordinates in `[0, 1]` and each renderer does its own
rounding**, so the terminal path's arithmetic is unchanged by construction.

**2 · Aspect ratio is a terminal fact.** `circle.ts`'s `rx = 2·ry`, braille's 2:4 cancellation,
the waffle's square mosaic — all of it compensates for a 1×2 cell, and **none of it belongs in a
shared layer** where a pixel is 1×1.

**3 · Anything measured in cells stays in cells.** `labelWidth`, the axis gutter, the minimum
area, the truncation ladder. The image renderer needs its own in pixels from font metrics; if one
ends up shared, the terminal version starts sizing by something that is not cells.

**4 · `cells()` itself.** Ambiguous width, grapheme clustering, the wide arm — none of it applies
to a rasterised label. **A shared layout that calls `cells()` cannot serve the image path**, and
that is discovered as a wrong-looking image rather than as an error.

### The rows that catch a divergence at the shared layer

Render one block through both paths and assert the **normalised** geometry agrees, before either
rasteriser runs:

| | |
|---|---|
| G1 | `niceAxis` returns the same ticks for both targets |
| G2 | normalised sample positions are identical |
| G3 | the legend entry list is identical |
| G4 | annotation positions are identical in normalised space |
| G5 | only the **rasterisation** differs — asserted by diffing the two stages' inputs |

**That is what stops a divergence being found as a wrong picture three components away.**

### Measure before starting

**Whether `layoutFor` and `niceAxis` already assume cell units throughout.** If `niceAxis` is
unit-free — it takes a range and a count — most of the geometry is already shared and only the
layout ladder is not, **which makes this a small refactor rather than a large one**.

**And confirm the catalogue is still reproducible** by running it twice and diffing. A
non-reproducible catalogue makes this entire gate worthless.


### 3aj.1 — the gate was run, and it passed against a broken refactor

**Both preconditions came back the way the section hoped, and the gate itself did not.**

| measured | |
|---|---|
| the catalogue is reproducible | 1780 files, two runs, **zero diff** — so the gate's own instrument is sound |
| `niceAxis` is unit-free | `(range, maxTicks, pin)`. No width, no capabilities, no `cells()`. **Already shared** |
| `layoutFor` is cell-bound throughout | `labelWidth`, `AXIS_GUTTER`, `MIN_AREA`, `calloutWidth`, `ambiguousWidth`. **Hazard 3 says it stays that way** |
| **the gate** | **zero golden frames changed — and zero changed for a deliberately broken refactor too** |

**`rowOf` was the one function holding both stages**, so the refactor is exactly hazard 1's
subject: `normalisedOf` produces `[0, 1]` and `rowOf` is the rounding. It landed with **0 of 377
golden rows and 0 of 1780 catalogue frames moving**, which is what the gate asks for.

**Then the same gate was run against the violation hazard 1 describes** — the flat-line answer
moved into the normalised layer, which is wrong at **every even row count**, `floor(last / 2)`
against `round(0.5 · last)`. It also moved nothing. Counting the branch says why: **0 hits across
1780 catalogue frames and 0 across the golden suite.** Neither corpus contains a constant series,
so the case the hazard names is never constructed.

> **`zero golden frames change` is evidence about the cases the frames construct, and about
> nothing else.** A corpus is a sample, and a gate phrased over a corpus inherits its coverage
> without inheriting a way to see it.

**So the gate keeps its wording and gains a companion.** `test/unit/plot-shared-geometry.test.ts`
constructs what the corpus does not — the flat line at every height 1–12, the clamp at both
facings, and G5 asserted directly as *`rowOf` is `normalisedOf` and a rounding, nothing else*.
`tools/mutate/runs/c12-shared-geometry.mjs` is what says those rows can fail.

**And a row was written and removed rather than declared an expected survivor.** *`rowOf`
normalises for itself again* leaves every frame byte-identical, so nothing can catch it; a
permanently surviving mutation turns a pass's one-bit signal off for good. **The split is a
structural commitment and its record is this paragraph** — which is the honest place for a
claim no instrument can hold.

**What this changes for the second commit.** The image path can be added knowing the shared
coordinate is `normalisedOf` and that the terminal path is reconstructible from it by one
rounding — asserted, not assumed. **What it does not change**: the corpus still cannot see a flat
line, so any further shared-geometry work owes its own constructed rows rather than a green
catalogue.


### 3aj.2 — the second commit: SVG, and hazard 3 is what makes hazard 4 free

**SVG rather than PNG, and it was measured rather than assumed.** A rasterised label needs font
metrics to be placed; an SVG label is a `<text>` element that places itself, so the whole of what
`cells()` does for the terminal path has no counterpart here and needs none. `sharp` turns the
result into a PNG for the kitty path at **no new dependency** — it is already in `DEPENDENCIES.md`
for the catalogue's own frames.

**But the two hazards are not independent, and the gate lists them as though they are.** An SVG
label needs no metrics *because this layout never sizes anything to fit a label* — `svgLayout`'s
gutter is a **fraction of the width**, which a cell layout cannot express because a gutter of 3.4
columns is not a gutter. The moment a layout sized a gutter to its longest label, this path would
need metrics to agree with it. **Hazard 3 is what makes hazard 4 free, and violating either
violates both** — measured, because the mutation that sizes the gutter to the output is the one
that would drag metrics back in.

**Hazard 4's seam is structural and was already in the architecture.** `src/data/` contains no
call to `cells()` and no import from `presentation/` — the layer rule forbids it — so the shared
coordinate living in L0 means a shared layout reaching for `cells()` **would not compile**. Not a
wrong-looking image, not an error: a build failure. The hazard asked for a seam and the
architecture already held one; the coordinate only had to be put where it applies.

**What this is not: `ansiToSvg`.** `tools/catalogue-png.mjs` already writes SVG and writes a
*picture of a terminal* — `maxCols · CELL_W`, one glyph per cell, every coordinate a cell
coordinate scaled up. It inherits every cell-shaped decision the frame made, which is exactly what
this path exists not to be. **Two things called SVG in one repository and only one is a second
renderer**, which is worth writing down because the other one is older, larger and easy to mistake
for progress.

### What the rows cost, and the two that failed first

**Both source-level rows failed on their own documentation.** `svg.ts` explains *why `layoutFor` is
not reachable from this file*; `range.ts` explains *`cells()` is not reachable here*. A matcher over
the raw text reported the violation each was written to deny. **An assertion about a source file
that does not strip comments is measuring the prose**, and prose about a mechanism is denser than
the mechanism — so the false positive is the likely direction rather than the unlucky one.

**And G5 survived its first mutation.** The row asserted that both paths agree on a sample's
position, using values `1..9` on a range of `1..9` — where the clamp never fires, so open-coded
arithmetic gives identical numbers and a copy of the shared layer is indistinguishable from the
shared layer. The fixture had to construct a **pinned** range with samples outside it, which is
C04 I29 and the only thing a copy gets wrong. *The convenient setup is the one where both readings
agree*, arriving in the row written to prove two paths share a coordinate.

**One form, not forty-seven.** The point of this commit is that the hazards have subjects; every
other form is the same three ingredients — the shared range, the shared coordinate, and a layout in
fractions — and adding them is work rather than a decision.


### 3aj.3 — the remaining forms, and the two rules that had to be carried

**Four families, not forty-seven renderers**, because the forms inside a family differ only in what
they put at a position the shared coordinate already gave them: a joined path, a mark, a rectangle,
a painted cell. `SVG_FAMILY` is exhaustive over `PlotForm` by `satisfies`, so **adding a form to
the union fails to compile until someone decides** — the enumeration the builders and the validator
already use.

| family | forms | what it spends the coordinate on |
|---|---|---|
| curve | line, sparkline, step, ecdf, density, autocorrelation | a `y`, joined |
| scatter | scatter, bubble | a `y`, unjoined |
| bar | bar, histogram, lollipop, dotplot | a `y` and a baseline |
| matrix | heatmap, correlation, confusion, spectrogram, density2d, latency, utilisation | **a colour** |

**The matrix family is the one that generalises the claim.** The shared coordinate is
`value → [0, 1]`; what a renderer does with the `[0, 1]` is its own. A curve spends it on a
position and a matrix on a colour — which is the overlay's ruling from phase 2 arriving one
component along (C04 §3h.2).

**And roughly half the union is refused, each with a reason.** Cumulative forms — a sample's
position is not a function of its own value. Distribution forms — the datum is a shape derived from
the samples. Hierarchy and topology — position comes from structure. Its own domain — a date grid,
a time span, an angle. **`plotToSvg` returns `null` rather than a fallback picture**, because a
treemap drawn by the curve family measures, rasterises and reads as a chart of something: the
plausible wrong figure the placeholder encoding refuses a wrap for (C04 I73). Calling that group
*application* would be §3h's claim again, and §3h.3 is what measuring it costs.

### The two carried rules, and what they caught

**1 · The gutter-in-fractions rule is what convenience violates**, so the mutation runs against
every form by construction: `describe.each` over the claimed set, and the mutation is on
`svgLayout`, so a row per form is a check per form.

**2 · A form whose samples sit inside its range cannot tell a shared coordinate from an
open-coded one.** Every row pins `2..8` and passes `-40` and `40`.

**Both were necessary and neither was sufficient**, which is the finding. Two mutations survived
the parameterised rows, and they are the same class:

> **The per-form rows assert that ink stays *inside the plot area*. That is a containment claim,
> and every wrong answer that is also inside the area satisfies it.**

The matrix's colour was never read — a `<rect fill>` has coordinates the rows checked and a datum
they did not. And `continuousColour` clamps for its own reasons, so the out-of-range samples the
second rule demands could not see it either: the difference is the **span**, and a density field
over `0..0.3` is where `Math.max(1, span)` squashes every reading into the bottom third of the map.

**The bar survivor was about the source rather than the row.** The baseline read
`normalisedOf(range.min, range, true)` — which is `1` by construction, so the expression was
`box.bottom` written the long way round. **Dead arithmetic wearing the shared layer's clothes**,
and a mutation replacing it with `box.bottom` changed nothing, which is what said so. The baseline
is now zero where the range holds it, so a bar of `-3` grows *down* — which is what a bar chart
means and what the first draft could not draw.

### 3aj.4 — hazard 5: the colour is C10's, and the four hazards were written for geometry

**§3aj lists four hazards and every one of them is about position.** That was right for the two
paths it was written against, and it left the second channel unnamed — so the SVG arm shipped
**four hex literals**: a ground, a rule, a label, and `SERIES_INK`, a five-slot palette standing
beside C10's eight.

**A hazard nobody wrote is not a hazard anybody fails**, which is §3aj.1's own finding about the
gate, arriving one channel along.

> **Hazard 5 · A colour is a palette slot, and only C10 resolves it.** `resolve()` returns a
> `Style`; a cell renderer turns it into SGR and the SVG renderer turns the same `Style` into
> `fill` and `stroke`. **One resolution, two emitters.** A renderer that chooses is a second
> source of truth for a colour C10 owns, and nothing can assert a colour it also chose.

**The defect the palette produced was not a wrong shade.** `CATEGORY_REFS` has eight slots and
`SERIES_INK` had five, so **series six took series one's colour in the SVG and `categorical.c6` in
the terminal** — *two series reading as one*, which is the exact failure C04 I50a caps the count at
eight to prevent, arriving through the second renderer's back door. **The wrap was at five and the
cap is eight, so it was reachable at six series** and invisible at five, which is every fixture in
the per-form corpus.

**Four differences between the arms are legitimate and each is named**, so that a fifth is a
finding rather than a judgement call:

| | |
|---|---|
| antialiasing | an SVG curve is smooth and a braille curve is dots. Same colour, different edge — resolution, not styling |
| stroke width | a cell is one unit wide; an SVG stroke is a **ratio of the box**, never a constant, or it changes with the output size |
| font | the terminal's is the reader's and SVG names a family. **The metrics differ and the colour does not** |
| no ladder | **the SVG arm does not degrade at all.** It pins truecolour, so there is one rung and nothing below it |

**The last is the one with a consequence.** A form whose terminal rendering leans on a degradation
rung — stacked strips at 1-bit, `CATEGORY_MARKS` where colour cannot carry a category — draws the
24-bit answer in SVG and never the fallback. **So the two arms are not byte-comparable below
24-bit**, and a row claiming *the same picture* compares at that depth or compares structure.

**And membership is not enough.** `tone.error` is C10's, so a label drawn in it passes every
*is this colour in the theme* check while telling the reader the axis is wrong. **Which palette and
which slot are two claims**, and the furniture's slots are named for the terminal's own reason —
*furniture is not a series*, so labels are `tone.muted`, and the rule and the ground are surfaces
because they are drawn on the page rather than said about the data.

### 3aj.5 — the partition is about the form, and a block is a form *and a datum*

**`SVG_FAMILY` answers *is this form claimed*. That is one of two questions**, and the second is
what F259 came out of: a `line` **carrying candles** is a different block that the same claim
covers. `plotStyle: "candlestick"` is a style and not a thirty-third form (C04 I57), so the
partition cannot reach it — and neither can a corpus indexed by form.

| | terminal | SVG, before the ruling |
|---|---|---|
| candles only | three candles, 8 to 16 | an axis of 0 · 0.25 · 0.5 · 0.75 · 1, no ink |
| candles + a moving average | three candles and a line | **a line on an axis of 11 to 12** |

**The second row is the one to read.** A non-empty `series` beside `ohlc` is an average *over* the
candles, so the range came from the average alone — not a blank a reader questions but a confident
chart of the wrong thing, on an axis wrong by a factor of eight in span.

**Asked of the other block-level fields, three of three came back.** `origin`: all four values
produced byte-identical output, because `svgPoints` passes `invert: true` unconditionally, so the
same data draws upside down between the arms. `annotations`: a reference line draws nothing.

> **The ruling: refuse a false figure, record an incomplete one.** A datum this path cannot read
> and would draw *around* — `ohlc`, a non-default `origin` — is a refusal, for the same reason a
> treemap drawn by the curve family is. A datum whose absence leaves the picture **true but
> partial** — an annotation — is drawn without and **asserted absent**, so the row fails the day it
> lands and names what changed.

**A second clause, because it is a second failure.** `series: []` on a plain form and an all-`null`
series reach the renderer with a range nobody declared; `seriesRange` returns `null` and the
fallback furnishes an axis out of nothing. Counting marks catches those and cannot reach the
moving-average case; refusing `ohlc` catches that and cannot reach these.

**And the partition stopped being independently observable.** Every unclaimed form also draws no
marks — `marks()` switches on the family — so disabling `svgFamilyOf(form) === null → null` changes
nothing any fixture can see. **Two guards, one ruling**, and the ruling is this section's. The
mutation was removed rather than declared an expected survivor, and the guard that keeps the two
from being confused is **a claimed form must put ink on the page**: a family claimed in
`SVG_FAMILY` before its branch exists in `marks()` would otherwise refuse *as though the form were
unclaimed*, which is what every new family does on its first commit.

### 3aj.6 — family 2, where the extraction is a measurement

**The plan called hierarchy *the closest to free* because the layout is already shared and
unit-free.** Half of that is exactly right and half is wrong, and the half that is wrong is wrong
for hazard 3's reason.

| | `cells()` calls | `caps` threaded |
|---|---|---|
| `hierarchy.ts` — treemap · flame · icicle | **0** | **0** |
| `graph.ts`'s Sugiyama pipeline — `acyclic`, `layerOf`, `expand`, `positions`, `crossings`, `order`, `lay` | **0** | **0** |
| `graph.ts`'s `widthOf` | 1 | 1 |
| `tree.ts`'s placement — `tdWidth`, `sizeOf`, `widestPerDepth` | **5** | 40 references |

**A treemap's geometry comes from *values*; a tree's comes from *labels*.** `tdWidth` is a
subtree's width measured as the widest label under it, `widestPerDepth` is a column's width, and
both are `cells(label, ambiguousWidth)`. So a tree's node positions are **a function of text
measurement**, which is hazard 4 in one sentence: *a shared layout that calls `cells()` cannot
serve the image path*.

> **The ruling: the topology is shared and the placement is not.** Parent, child, depth, layer,
> ordering and dummy nodes are structure and belong to both arms. **Where a node goes is a
> function of how wide its label is**, and the two arms measure text differently by construction —
> so each computes its own placement from the same structure.

**And pruning is a terminal fact**, hazard 2's shape one family along. `subsetAt`, `fitTo` and
`chooseLayout` drop nodes to fit a cell budget; an SVG has no budget and draws the whole tree. A
shared pruner would put a terminal's constraint into a renderer that does not have it.

### What the extraction commit is, and why it is not a refactor

**Nothing needs moving.** `hierarchy.ts` is already unit-free and already exported; graph's
pipeline is already unit-free and **private**; `tree.ts`'s `flatten` is already unit-free and
private. So the work is *making the topology reachable*, and an export that nothing consumes is
refused by MG25 until the renderer that consumes it exists.

**So family 2's first commit is this section and no code.** The gate's purpose — *a moved frame is
never ambiguous between refactor and feature* — is served exactly, and better than by
manufacturing a refactor: a commit that touches no source cannot move a frame.

**Stating that is the point.** The alternative is an extraction commit whose diff is four `export`
keywords, which reads as the gate being satisfied and proves nothing.

### The field question, measured before the renderer

| axis | `ONE_PER_FORM` | the catalogue |
|---|---|---|
| `treeLayout` | **`undefined` on all five forms** | crossed for `tree` alone — `auto`, `topDown`, `leftRight`, `outline` |
| `graphLayout` | `undefined` | **never set anywhere**, and C04 I70 already rules the choice arm vacuous: one value, and `"force"` is a compile error |
| `hierarchy` depth | **0 for flame, icicle and graph** | depth-3 variants exist for all of them |

**`treeLayout` is `plotDetail` again** — a rung ladder the per-form corpus does not cross, one
family later. **And the depth-0 representatives are the sharper one**: a row over `ONE_PER_FORM`
for flame or icicle exercises a hierarchy with no nesting, so *it draws something* and `G7b` passes
while the figure is a single strip. **A guard that a claimed form puts ink on the page is satisfied
by one rectangle.**

## 3ak. One figure, two renderers — the seam moves up a level

**§3aj built two rasterisers over one geometry. Measured against what shipped, what is shared is
*coordinates*** — `normalisedOf`, `normalisedSummary`, `flatten`, `graphLayers` — **and everything
above them is decided twice.**

**The measurement is the specification, and it is `test/unit/plot-arm-disagreement.test.ts`.** Every
form, every variant, both widths, at 24-bit: **73 of 135 cells over the 27 forms the SVG arm claims
disagree, 59 of them everywhere.** Not three defects found by building — five decisions found by
looking, disagreeing almost universally:

```
numericLabels   which ticks, how many, and how they are formatted   ALL on every ticked form
identityLabels  the categories, rows, series and nodes named        ALL on matrix · tiles · bar · distribution
border          the terminal frames the area; the SVG draws none    ALL on every ticked form
interiorRules   the SVG rules every tick; the terminal rules none   ALL on every ticked form
legend          the terminal has one; the SVG has none at all       partial, where the terminal draws it
```

**And the sharpest one is not in that table**, because no single decision holds it: the terminal
rasterises against the **niced** range and the SVG against the **raw** one. A `line` of `1 3 2 5 4`
spans 0–6 in the terminal and 1–5 in SVG, so the first sample sits on the bottom edge in one arm
and floats in the other. The same data at two different scales, which is not a rasterisation
difference.

**Three families reached the same wrong answer separately**, which is the seam being in the wrong
place stated as plainly as it can be: `matrix`, `tiles` and `nodes` each furnished a value axis out
of `seriesRange([]) ?? {0, 1}` over a figure whose readings are colours, areas and positions. Three
renderers, three commits, one defect.

### 3ak.1 — What the sketch got right, and the six things measuring changed

`CALCIUM_ARM_UNIFICATION.md` §3 sketches `Mark`, `Drawn` and `GlyphRole` *to be measured against
what the two renderers actually need rather than adopted as written*. Measured, four of its rulings
hold and six things change.

**Holds**: positions normalised and uninverted, with the inversion applied twice from one decision;
`GlyphRole` rather than a glyph, as an exhaustive `Record` so a missing rung is a compile error;
`ref` unresolved, so each arm calls `resolve()` at its own depth; and one emitter per family rather
than per form.

**1 · `arc` has no consumer, so it is not in the type.** `pie` and `radar` are refused by
`SVG_FAMILY` and nothing else draws one. A member nothing draws is the class MG25 refuses and the
class §3e's deferral was avoiding — it arrives with the proportion family or not at all.

**2 · `circle` is not a mark the terminal has.** A terminal point is *one cell*; there is no radius
to give it. So `circle` collapses into `point`, carrying a `GlyphRole` and an optional **normalised
`size`** — because a bubble's radius is *data* and must cross the seam, while a scatter dot's radius
is the SVG's own rasterisation and must not.

**3 · `role` is two different things wearing one name.** The sketch puts
`role: "series" | "furniture" | "annotation" | "label"` on `Drawn` **and** `GlyphRole` on the glyph
mark. One is *which layer this belongs to*; the other is *which shape this is*. That is MG24's own
collision class, in the type built to end a class of collision. The first becomes `layer`.

**4 · Two operations the ruling names do not exist in the form it needs.** `Axis` is
`{ range, ticks, step }` and carries **no formatted strings** — the strings come from `yLabels`,
which also takes the row count, so *the numbers* and *how they print* are computed in different
places from different inputs. And `LegendEntry` is `{ mark: string; label; ref }`, where `mark` is
an **already-resolved terminal glyph**: precisely what must not cross the seam. Both are named here
before the ruling is written down, which is C23 §8a A4's own finding: *an artefact can be
correct about the interaction it found and wrong about a mechanism it assumed existed.*

**5 · The types the figure needs live in the terminal's own module, and taking them would make a
cycle.** `FrameStyle` and `LegendEntry` are exported by `furniture.ts`, and `furniture.ts` is what
reads the figure back. `figure.ts` importing them while `furniture.ts` imports `figure.ts` is a
cycle **inside L1**, which is what A02 §1 forbids and MG1 and MG22 implement. So the shared shapes
move down into `figure.ts` and `furniture.ts` imports them, rather than the reverse.

**6 · §2's *the same labels dropped* and §3aj hazard 4 cannot both hold, and hazard 4 wins.** The
terminal drops a label by measuring it with `cells()`; the SVG cannot measure text at all, which is
the whole reason its layout is fractions. So the two arms cannot agree about *which* labels fit.
What they can agree about is **how much room a label has**, stated in normalised units — the
threshold is shared and the outcome is each arm's. Measured: a `treemap` where the terminal names
five tiles and the SVG names eight. **§2 overstates, and the type expresses the threshold rather
than the outcome.**

### 3ak.2 — The type

```ts
type GlyphRole = "point" | "median" | "mean" | "outlier" | "cap" | "target" | "absent";

type Mark =
  | { kind: "polyline"; points: readonly Pt[]; closed?: boolean }
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: boolean; depth?: number }
  | { kind: "point"; x: number; y: number; role: GlyphRole; size?: number }
  | { kind: "text"; x: number; y: number; text: string; anchor: Anchor; room: number };

type Drawn = Readonly<{
  mark: Mark;
  layer: "series" | "furniture" | "annotation" | "label";
  seriesIndex?: number;   // the CATEGORICAL slot, unresolved
  ref?: ColourRef;        // or an explicit slot, unresolved
}>;

type Figure = Readonly<{
  value: ValueAxis | null;              // niced range, ticks, AND the formatted strings
  identity: readonly string[];          // categories, rows, series or nodes, in order
  orientation: "horizontal" | "vertical";
  facing: Facing;                       // decided once, applied twice
  frame: FrameStyle;
  legend: readonly LegendSlot[];        // { role | seriesIndex, label, ref } — never a glyph
  marks: readonly Drawn[];              // normalised, uninverted, refs unresolved
}>;
```

**`value: null` is the three-families fix and it is the member doing the most work.** A `matrix`
reads its values as colours, a `tiles` figure reads them as areas and a `nodes` figure reads them as
structure. None has readings on an axis, so none gets one — and saying that once is what stops a
fourth renderer furnishing a fifth false axis out of `{0, 1}`.

**`room` on a text mark is normalised, and it is finding 6 in one field.** The shared layer says
*this label has this fraction of the figure*; the terminal turns that into cells and truncates, the
SVG turns it into a `clipPath`. Neither arm decides the allowance and neither shares the outcome.

**`depth` on a rect is the same shape one mark along, and F278 is why it exists.** A treemap's
nesting is drawn by insetting a child inside its parent so the parent shows as a ring — that ring is
*the only thing that says which tiles belong together*, and `tiles`' own comment says so: *filling the
parent exactly is arithmetically right and draws a mosaic; the leaves are correct, the siblings are
adjacent, and nothing says which ones belong together.*

**The ring's width is one unit of the output and the two arms have different units** — one cell,
`1 / max(width, areaRows)`, against one pixel, `1 / max(w, h)` — and the terminal's is a *runtime*
width, so no constant the figure could hold is either arm's. So the pad cannot cross the seam, and a
partition emitted already-padded would be one arm's picture.

**What crosses is the depth; the inset is each arm's.** The figure carries the true partition — areas
proportional to the data before anything is taken off for legibility — and a renderer insets a rect by
`depth + 1` of whatever its own smallest unit is. That reproduces the compounding a layout-time pad
produces, and it keeps the areas true rather than approximately true.

> **A uniform inset is not a substitute, and measuring it is what found this.** Insetting every rect
> by one unit separates *siblings* and leaves a child's shared edge exactly on its parent's, so the
> ring vanishes at every depth: the frame showed tiles cleanly outlined and nesting gone. The terminal
> draws the ring, so shipping that would have been **a new disagreement introduced by a refactor** —
> the one thing this pass forbids — and it would have been announced by nothing, because separation
> and nesting look alike in a diff of rectangles.

**Absent means *not a partition member*, not depth zero — and that wording is F280's correction.**
It first read *absent means not nested*, with a flame's strips carrying none, because tiles were the
member's only subject and there was one plausible reading of the absent case. The bar family arrived
and there were two:

| the rect is | `depth` | what a renderer does |
|---|---|---|
| a tile nested in a partition | its nesting depth | comes off `depth + 1` units on every side, so the parent shows as a ring |
| a strip in a partition, enclosing nothing | `0` | comes off one unit, so the bands do not touch |
| a **measurement** — a bar's length *is* its value | absent | drawn exactly, and inset only **across** the identity axis so two categories do not touch |

**The third row is the one the member was silently getting wrong.** A bar carries no `depth`, and
under the first wording that put it in the same case as a strip: one unit off every side, including
the ends. Measured on `bar-default`, whose data is `[10, 25, 15, 30, 20]` against a `0 … 40` axis —
the bar of 20 ended at `x=351` and its own gridline is at `352`. Every bar a pixel short of the tick
it is read against, and the vertical arm the same at both ends.

**A length and an area are read differently and the inset has to know which it is looking at.** A
tile's area is read by comparison with its neighbours, so a unit off every side costs nothing; a
bar's length is read against a labelled axis, so a unit off the end is the figure lying about its
own number.

### 3ak.3 — The rungs are decided after the figure, and that is where a diamond becomes a comma

**`Figure` is capability-independent by design and the terminal's rendering is not.** Every rung
below is a decision the terminal makes *on* a figure, in its projection, and every one is a place
where *the shared layer now says a diamond* can quietly become a different character:

| rung | what it changes | where it lives after the pass |
|---|---|---|
| the glyph per `GlyphRole` per unicode rung | `◈` · `+` · `*` | the terminal walker's `Record` |
| `CATEGORY_MARKS` below the colour floor | identity carried by shape | `markOf` at projection |
| stacked strips at 1-bit | the whole answer for a multi-series plot | `stackedRows`, untouched |
| the truncation ladder | which labels fit `room` | `labelAllowance` at projection |
| the `+N` notices | the count and the wording | `calloutInto` at projection |
| the `ambiguousWidth` arms | narrow-only sets falling to their ASCII pair | `glyphs()` at projection |

**The SVG arm has none of them**, which is §3aj hazard 5 restated: it is always 24-bit and always
`unicode: "full"`. So a form whose terminal answer *is* a rung — a 1-bit stacked strip — draws the
24-bit answer in SVG and never the fallback, and the two arms are **not byte-comparable below
24-bit**. Every cross-arm assertion compares at 24-bit or compares the figure.

### 3ak.4 — Both walk artefacts, and they cover different halves

CLAUDE.md's rule is that a **table** finds structural interactions — two rules holding at rest — and
a **trace** finds event-mediated ones. This component has both kinds and therefore owes both.

- **Artefact A is the disagreement matrix**, and it is a table: every cell is *this form is a bar
  chart* meeting *this decision is which way the value axis runs*, true standing still, with no
  event between them. Committed as `test/unit/plot-arm-disagreement.test.ts`, 135 cells.
- **Artefact B is the rung ladder**, and it is a trace: the capability set supplies the events, and
  the question is which decisions survive a rung and which change. It is U6, and it doubles as the
  degradation audit this component has never had.

**Taking the table alone because the type is the obvious thing is how the rung half goes
unexamined**, which is the mistake C19 §8a records: a trace indexed by events cannot reach a
structural interaction however many rows it has, and C18's table was already in the repository.

### 3ak.5 — What a refusal leaves behind

**`figureOf` is total and never throws.** I2 says no series input throws, and a figure is one level
above the rasteriser it feeds — a throw here would abandon a half-built figure in a component whose
whole claim is that both arms read the same one.

**A refusal is a figure with no marks**, which is F259's ruling arriving as a type: *refuse a false
figure, record an incomplete one*. `plotToSvg` already returns `null` on an empty body and keeps
doing so; the terminal already draws its empty rows and keeps doing that. **The two arms refuse
differently and that is legitimate** — what must be identical is *whether there was anything to
draw*, and after this pass there is one answer to that question instead of two.
### 3ak.6 — `autocorrelation` was going to be refused, and the escape clause is what stopped it

**The largest disagreement in the corpus is that `autocorrelation` is two different charts.** The
terminal draws horizontal bars, one per lag, signed about a zero rule, with two dashed significance
bands. The SVG draws a polyline of the same numbers. That is not a rasterisation difference and
nothing in the five measured decisions holds it, because both arms draw *something* and the cells
compare labels and furniture rather than shape.

**The tie-break plus F259 gives an immediate answer: refuse.** The terminal is right by default, a
polyline that reads as a chart of something is the plausible wrong figure the `null` arm exists for,
so `autocorrelation` becomes `null` in `SVG_FAMILY` and is recorded as owed.

**That answer is wrong, and what found it was treating the escape clause as a claim.** The clause
was *unless the curve family's emitter reaches the lag figure without new geometry* — the kind of
sentence that reads as a hedge and gets skipped. Checked instead:

```
the bar        `lagRow` fills from the zero column to `value / magnitude`, signed
the zero rule  one solid vertical at the centre column — furniture
the bands      `block.annotations` filtered to `kind: "line"` — §3e's own mechanism
the rows       `categoricalForm({ ...block, categories: cats })`, one row per lag
```

**Every one is a mechanism the shared layer already needs, and the composer is `bar`'s own.**
`categoricalForm` is what `bar` and `histogram` are drawn through; the bands are not autocorrelation
machinery but the annotation mechanism §3e already specifies; and this document's own comment on the
form says it in five words: *one bar per lag, with a confidence band. `barRow` plus the band.*

> **The ruling: `autocorrelation` is not refused, it is misfiled.** `SVG_FAMILY` says
> `autocorrelation: "curve"` and the figure is a **bar** — horizontally oriented, over a categorical
> axis of lags, with line annotations. D14's cause is one word, not a missing capability.

**Recording it as owed would have recorded a debt that does not exist**, and it would have removed a
claimed form from the SVG arm on a wrong diagnosis — the deferral-naming-a-condition-already-met
class, arriving in the same commit that would have created it.

**The reusable part is about the mechanism that was supposed to prevent this.** `SVG_FAMILY` is
`satisfies Record<PlotForm, SvgFamily | null>`, and that record has done real work: it is why adding
a form fails to compile until someone decides. But **an exhaustive record forces an answer for every
member and cannot check a single one of them.** Totality is a guarantee about *coverage*, never
about *correctness*, and a wrong entry in a total record reads exactly like a right one — which is
`a-step-can-name-an-effect-and-have-no-mechanism` one level along: a table of names is satisfied by
names.

**And the correction does not land here.** Reclassifying to `"bar"` today draws *vertical bars over
sample index*, which is a different wrong figure — the orientation is a `Figure` member and the
emitter does not exist yet. So the entry stays `"curve"` until step 4 moves it, with the reason
recorded rather than the symptom fixed.

### 3ak.7 — The curve family's walk, and D14's shape a second time

**Artefact A's shape at one family's scale**: the cells where two rules both hold at rest, over the
six forms `SVG_FAMILY` calls `curve`. Nine of them, and the first is a finding.

| # | one rule | the other | where they meet | what it settles |
|---|---|---|---|---|
| **C1** | the figure describes the block's series | `ecdf` and `density` draw a **derived** series | those two forms | **F268** — two charts of one block, again |
| **C2** | a figure is capability-independent (§3ak.3) | at 1 bit a stacked plot rasterises against **raw** bounds | `line`, 1 bit, two series | `value` is the niced axis always; the raw-bounds object is a *projection* |
| **C3** | `HAS_VALUE_AXIS.line` is `true` | at 1 bit that gutter holds **names** | the same cell | consistent, and the reason the record answers *readings on a scale* rather than *what the gutter holds* |
| **C4** | `identity` is the series' labels | `segments` replace the series in the legend | a curve with `segments` | one list, or the legend names a set the gutter does not |
| **C5** | the figure carries the facing (I61) | the SVG refuses a non-default `origin` | `origin: "top-left"` | the refusal is the arm's; the figure decides regardless, and step 4 removes the refusal |
| **C6** | the range is `seriesRange(series, block, bars)` | candles contribute bars | `line` with `ohlc` | the bars are in the range, or the terminal moves |
| **C7** | a refusal is a figure with no marks (I64) | pinned bounds make `seriesRange` non-null with no samples | `ecdf` with `yMin`/`yMax` and no data | the refusal is `hasSamples`, never the axis |
| **C8** | one legend slot per series | a labelled annotation earns one (C04 I52) | one series, one annotation | slots are series, then candles, then annotations — `legendEntries`' own order |
| **C9** | curve is `orientation: "vertical"` | a sparkline is one row with no axis | `sparkline` | vacuous, and recorded so it is not later mistaken for a decision |

**C1 is D14's shape found by walking a family rather than a form.** `ecdf` sorts its samples and
replaces them with a cumulative fraction; `density` replaces five samples with a hundred kernel
estimates. Both derivations happen in the terminal's dispatch table, *above* the renderer, so the
SVG arm has nowhere to read them from and draws the raw series:

```
              terminal                                    SVG
ecdf          [0.2, 0.4, 0.6, 0.8, 1.0] over 0…1          5 1 4 2 3 over 1…5
density       100 kernel estimates over 0…0.19            5 1 4 2 3 over 1…5
```

**An ECDF that descends is not an ECDF**, and `curvePath` steps it, so it reads as one. The density
plot is worse: there is no density in it. Both are the plausible wrong figure the `null` arm exists
to refuse — and neither is refused, because `svgFamilyOf` is **right**. They *are* curves. The
family is correct and the *datum* is wrong, which is why the total record could not catch this one
either (§3ak.6): the entry it holds is not the entry that is wrong.

> **The ruling: the derivation moves into the shared layer, and it is not a refusal.** §3ak.6's
> escape clause, applied to the second family that needed it — check whether the emitter reaches the
> figure without new geometry *before* writing a `null`. It does. `ecdfSeries` and `densitySeries`
> are pure functions of the samples, already written, already in L1, and neither calls `cells()` nor
> takes a capability.

**What is wrong is where they live.** `ecdfSeries` is in `scatter.ts` and `densitySeries` in
`kde.ts`, both rasteriser modules, because the terminal was the only arm that ever needed them. **A
derivation living inside a rasteriser is the seam in the wrong place, stated in the file tree.**

**And the move has a direction. The first reason given for it was false, and the code is what said
so** — which is this section's own subject one level up: a walk can be right about the interaction it
found and wrong about a mechanism it assumed existed (C23 §8a A4).

> *`figure.ts` must not import `kde.ts`: that module calls `cells()`, and the shared layer reaching a
> cell measurement through an import is §3aj hazard 3 arriving in the module graph.*

**Withdrawn.** Measured at the commit that wrote it: `figure.ts → axes.ts → text.ts` and
`svg.ts → tree.ts → text.ts` both already exist, so the property the sentence forbids was true of
both arms before `kde.ts` was ever a candidate. **Hazard 3 is a rule about what a shared *function*
does** — `G1` and `G1b` assert it by *arity*, that `niceAxis`, `seriesRange` and `pinnedRange` take
no width — and a module is not a function. A rule stated over the wrong unit forbids things it was
never about and permits the thing it was.

**What is true is smaller and checkable.** `kde.ts` and `scatter.ts` are the **terminal's
rasterisers** for two of the seven families, and an edge into them from the shared layer makes the
SVG arm load braille, the dot grid, the glyph ladder and the strip renderers — measured, **10
modules and 3,874 lines** — to reach five lines of arithmetic over samples.

**And the number that undercuts the argument, since an unreported one is how a figure becomes a
threshold**: `figure.ts`'s closure is *already* 92 modules and 28,268 lines, so this is +11% and
+14% rather than a clean layer being spoiled. The force is not size. It is that **arithmetic over
samples is below both arms and is sitting inside one arm's rasteriser for no reason but who needed it
first** — the same direction §3ak.1 finding 5 gives for `FrameStyle` and `LegendEntry`, and there the
reason *was* a cycle. Here a cycle is a **prediction** — those two modules are where families 2 and 5
read their figure back — and it is written as one.

**C2 is what keeps §3ak.3 honest.** `positionalForm` chooses between a niced axis and the raw bounds
by asking `stacksAtOneBit`, which reads `colourDepth` — so the axis the terminal rasterises against
is capability-dependent, and a figure member cannot be. The figure's `value` is therefore the niced
axis at every rung, and the raw-bounds object stays in the terminal's projection beside the
`stackedRows` call it exists for. This is the rung table's *stacked strips at 1 bit* row read
forwards: what changes below the colour floor is not the figure but what is done to it.

#### C1 also says something about artefact A, and two instances is the minimum for saying it

§3ak already records that the disagreement matrix cannot see D14 — *both arms draw something, and
the cells compare labels and furniture rather than shape*. `ecdf` and `density` are that blind spot
a second time, and the second instance is what makes it a rule rather than a coincidence:

> **The matrix's cells are not independent, and closing one alone can make the figure worse.**

`ecdf`'s recorded disagreement is `numericLabels 2/2`: the terminal ticks 0 to 1, the SVG ticks 1 to
5. Closing *that cell* gives the SVG the terminal's 0-to-1 gutter over a path of the raw samples —
**a chart labelled as a cumulative distribution drawing something that is not one**, which is
strictly worse than today's honestly mismatched pair. A reader can see that two charts disagree; a
reader cannot see that one chart's axis belongs to a different chart.

So a cell's disposition is a claim about *that decision* and never a licence to fix it alone. **It
is also why the emitters land per family rather than per decision** — a family is the smallest unit
in which the cells are jointly satisfiable, and the plan's step 3 was already shaped that way for a
reason this walk has now measured.

### 3ak.8 — Agreement is not correctness, and the tie-break has one measured counterexample

**The pass's tie-break is *if the arms disagree, the terminal is right by default*.** It is the right
default — the terminal arm is fourteen thousand lines with a golden corpus, a capability ladder and
five years of frames read — and §3ak.7 found the case where it is wrong.

`ecdfSeries` returns `(i + 1) / n` for every index and reads its own `sort` only for `.length`. It is
a **function of the sample count and of nothing else**, and `x` comes from the sample index, so the
terminal draws one fixed staircase for every dataset of a given size. Measured at 44 × 8, full
capabilities: `[5, 1, 4, 2, 3]` and `[1, 1, 1, 1, 100]` are byte-identical frames (F269).

**Unifying on the default would have propagated a chart of nothing into the second arm.** That is
what makes this the tie-break's counterexample rather than another defect: the rule is about which
arm to copy, and here neither is right.

> **And the ruling does not change.** After unification both arms draw the *same* wrong figure and
> one repair fixes both; today they draw two different wrong figures, so a repair must be made twice
> and still leaves them disagreeing. **Closing the class beats closing the instance even when the
> class is currently wrong** — what unification buys is that there is one figure to correct, which is
> the whole claim of the pass stated against its least flattering case.

**Two defects, each sufficient, and the mutation pass is what separated them.** Making `ecdfSeries`
plainly data-dependent moved no frame and failed no row, because the dispatch entry pins
`yMin: 0, yMax: 1` and any real value clamps to the ceiling. *Two blockers read as one, and a correct
fix changing nothing observable is the signal.* The complete repair — the empirical CDF on a uniform
grid over the data range, which keeps `y` a fraction and makes the pin right — is `densitySeries`'
own mechanism one form along, and it is a decision about what `ecdf` **draws** rather than a line to
be patched.

**`density` has the milder half of the same mechanism.** It resamples to 100 points and the x axis
reads `0 … 99` where the data spans `10 … 90`: **a derived series changes what `x` means and nothing
tells the axis.** One mechanism, two severities, and both owed as a C12 ruling after the pass — the unification pass
freezes the terminal arm for its duration.

**The instrument is `DS1`–`DS4`, and its exemption split is 15 of 16.** Swept over 178 catalogue
form·variant pairs: 16 frames did not move when their numbers did, and **fifteen had no number to
perturb** — the `empty` variants, and `tree` and `graph`, whose data is structure. Those rows were
never asked a question and read exactly like passes; without the count the sweep would have reported
sixteen offenders and been wrong about fifteen. `G7b` asks whether a claimed form puts ink on the
page and `ecdf` passes it; **this is the next rung, and it is the rung no other instrument here can
reach** — a golden frame records whatever is drawn, artefact A compares labels and furniture, and a
mutation on dead code fails nothing by construction.


### 3ak.9 — The tie-break has three counterexamples, and the answer was the same each time

**§3ak.8 recorded the first as *the* counterexample. It is the first of three**, and three instances
is where a pattern stops being a coincidence and becomes something to state once:

| | the terminal draws | the SVG draws | which is right |
|---|---|---|---|
| **F269** `ecdf` | one fixed staircase for every dataset of a given size | the raw samples, stepped | **neither** — the ECDF wants a uniform grid over the data range |
| **F271** `bubble` | the size channel as a second bubble series, named in the legend | one series, sized | **the SVG** |
| **F272** `bar`, signed | every bar from the range floor, so no negative bars | zero-anchored, growing both ways | **the SVG** |

**The tie-break is still right.** *The terminal is right by default* is a claim about where to look
first, not a guarantee — it is fourteen thousand lines with a golden corpus, a capability ladder and
years of read frames against a thousand-line arm with none of that. Three exceptions in seven
families is what a good default looks like.

**What matters is that the response was identical each time, and it is not the obvious one.** In all
three the figure reproduces the terminal's answer, *including where the terminal is wrong*:

> **Correcting inside a refactor is the one move this pass forbids.** No frame moves, so no gate
> fires; the two arms disagree at step 4 for a reason nothing announced; and the frame-read that
> found the defect is buried in a commit about something else.

**Landing the wrong answer in both arms is worth more than fixing one.** Unified, there is one figure
to repair and one repair fixes both; today each defect would have to be fixed twice and the arms
would still disagree afterwards. That is the pass's whole claim, stated against the three cases where
it is least flattering — and it is why every one of the three is **asserted** rather than described:
`FS3`, `FB4` and `DS1`/`DS4` fail the day the defect is fixed, which closes each finding by failing
rather than by anyone remembering.

**The instrument, across all three: none was found by a test written to look for it.** F269 came
from reading a function while moving it, F271 from a mutation that survived because its fixture was
degenerate, F272 from writing a test that asserted what a bar chart does and watching it fail. That
is the same table CLAUDE.md keeps — *every instrument that found something is a way of looking rather
than a thing asserted* — arriving inside one component in one pass.


### 3ak.10 — Step 4's walk: what the second arm still decides, and where two rules meet

**A table rather than a trace**, and the choice is deliberate: rewriting a renderer to read a figure
is a set of structural interactions — *this member* meeting *this mark kind* — with no event between
them. §3ak.4's rung ladder is the trace half and it is U6's, not this step's.

| # | one rule | the other | where they meet | what it settles |
|---|---|---|---|---|
| **S1** | `value.labels[i]` is `value.ticks[i]` | the SVG takes every tick, the terminal picks | any ticked form | both are indexed together or the pairing breaks — **no `String(tick)` may survive anywhere** |
| **S2** | `valueOnX` is scoped to `distribution` | four families carry `orientation` | a horizontal `bar` | **F274** — **closed** at §3ak.12: `figure.orientation` replaces the expression, so the clause has nowhere to live |
| **S3** | `value === null` means *no axis* (I60) | empty `marks` means *a refusal* (I64) | `nodes`, which has both | **two refusals with different meanings**, and conflating them draws a tree as *No data.* |
| **S4** | `Drawn.layer` orders the drawing | the ground is painted, then marks, then furniture | any annotated form | the layer decides among marks; the ground and the frame stay the arm's |
| **S5** | `seriesIndex` is a categorical slot | `ref` is an explicit one | an annotation beside a series | a mark carries one or the other, never both — the resolver needs both paths and a default |
| **S6** | `rect.value` colours a matrix cell | `rect.fill` fills a bar | one mark kind, two families | **the colour source is whichever member is present**, which is why `value` is optional rather than `-1` |
| **S7** | `point.size` is a bubble's datum | a scatter dot has none | `scatter` against `bubble` | absent means *the renderer chooses its own radius*, never *zero* |
| **S8** | the nodes family has decisions and no marks | `plotToSvg` returns `null` on empty marks | `tree`, `graph` | the nodes arm **keeps its own mark loop** and takes only the decisions — S3's trap in the one family that walks into it |

**S2 is the finding and it is the argument for the whole step.** `plotToSvg` decides its axis
direction with `svgFamilyOf(block.form) === "distribution" && block.orientation !== "vertical"`.
Measured on a `bar` at the terminal's default orientation — which is horizontal — the gridlines run
**across** with the numbers down the gutter, and `orientation: "vertical"` gives byte-identical
output. So a horizontal bar chart is drawn vertical *and* labelled on the wrong axis, which is the
defect the distribution family's own comment records being fixed for (F274).

> **It is closed by construction rather than repaired.** `figure.orientation` replaces the whole
> expression, and every family's emitter already decides it — so the scoping clause has nowhere to
> live and the defect stops being expressible. **A class of defect that cannot be written down does
> not need a gate**, and this one had survived every frame read of every other family.

**S3 and S8 are the traps, and they are one trap seen twice.** `plotToSvg` refuses on an empty body
today, which is F259's ruling and stays. But after this step a `nodes` figure has **no marks by
design** (§3aj.6), so a naive walk would refuse `tree` and `graph` — two forms the arm currently
draws — and the refusal would look exactly like the one F259 introduced on purpose. The nodes arm
keeps its own loop over `flatten` and `graphLayers` and takes the decisions from the figure; that is
what `nodesDecisions` returning `Omit<Figure, "marks">` is *for*, and it is why `marks: []` was
refused as its shape.

**The gate inverts for this step, and it did not exist** (F275). The sentence above read *the phase
digest moves on every commit and every move is read*, on F264's *the 66 `phase*` frames are the SVG
arm's own output*. **Measured: `digestOf` hashes `.txt` only and zero of those 66 contain `<svg`** —
the `phase3-*` files are `-cells.txt`, terminal renderings of the forms this arm **refuses**. No
golden snapshot holds SVG. Changing the axis for every ticked form moved **0 of 382 golden rows** and
neither digest.

What *did* fire is `AD1`, and it is a **cell** gate: five decisions, blind to shape, which is §3ak's
own recorded blind spot arriving at the instrument built on top of it. It reported one cell moving and
could not report that the axis a reader looks at had changed on seventy variants.

> **So T2 lands before the rest of the step.** `test/golden/svg-baseline/` — 178 `.svg` frames,
> `SB1`–`SB5`, T1's mirror for the opposite reason: T1 gates an arm that must not move, this gates an
> arm that is supposed to. **No capability axis**, because this arm has no ladder and five identical
> copies would report five times the coverage; **a refusal is a frame**, because 86 of the 178 are
> `null` and a claimed form must not be able to stop drawing quietly.

**The terminal half of the gate is unchanged and holds**: 890 frames at `64b8845e6408c819`, 1780
baseline frames unmoved, on every commit of this step.

---

### 3ak.11 — The projector: the whole of what the second arm does with a figure's two directions

**The walk reads `orientation` and `facing` in one function and nothing else reads either.** That is
what makes S2 close by construction rather than by repair: `valueOnX` was a *third* answer to which
way the value axis runs, beside `positionalDecisions`' fixed `"vertical"` and `orientationOf`'s read
of the block, and a scoping clause can only be wrong where there is a clause.

| the figure says | the page does |
|---|---|
| `orientation: "vertical"` | the identity axis is the abscissa, the value axis the ordinate |
| `orientation: "horizontal"` | the two swap |
| `facing.x: "left"` | the identity axis is mirrored, on whichever axis it occupies |
| `facing.y: "up"` | the value axis **inverts on the ordinate and does not on the abscissa** |

**The asymmetry in the last row is the page's, not the figure's.** SVG's `y` grows downward and its
`x` does not, so the same `up` that makes a vertical figure's values run bottom to top makes a
horizontal figure's run left to right — one member, two applications, which is what `facing` was
separated into two independent directions for (§3ac).

**A rect projects by its two corners and never by a corner and a size.** Mapping the size separately
would need the walk to know which way each axis runs — the second copy of `facing` the function
exists to remove — so it maps both corners and takes the bounding box, and every flip falls out.

**Three reads of the form survive in this arm and all three are rasterisation** (§3aj hazard 1):

| read | why it is not the figure's |
|---|---|
| `step`/`ecdf` take a square polyline joint | the terminal picks `stepRows` off the same member; the *points* are shared and the joint is which rasteriser draws them |
| a matrix cell reads `block.colormap` | the ramp is a palette, and `rect.value` — the reading itself — is what crosses |
| a bubble's radius is `2 + 5·size` | the terminal spends the same normalised number on 0 to 2 dots; the floor is what its radius-0 single dot is, *a sample with no size still draws* |

**`absent` draws nothing, and that is the role's entire content here** (I62). The terminal has a
character for *no estimate was reported*; this arm's equivalent of that character is not a circle at
the fallback position, which is the plausible wrong figure the role exists to refuse.

**The extraction is byte-identical where it should be, and that is the measurement.** Migrating
`curve`, `scatter` and `matrix` into the walk moved **4 of 178 SVG frames**, and all four moved for
reasons that are additions rather than differences:

| frame | what appeared | why |
|---|---|---|
| `line-annotated`, `line-annotation-label`, `autocorrelation-default` | one dashed rule each | the arm drew **no annotations at all**; `annotationMarks` is in the figure and the walk reads it |
| `bubble-default` | radii from `2.714` to `7` where every circle was `r="3"` | the size channel crosses the seam now (§3ak.1 finding 2) |

Every other curve, scatter and matrix frame is **unchanged to the byte**, which is the claim
*`svgPoints` + `curvePath` and the matrix loop are the projector at three call sites* asserted rather
than hoped: the projector reproduces three hand-written loops exactly, including the one whose
coordinate is spent on colour instead of position.

**And the bubble frame is F271 visible in the second arm.** Both series carry the same radii, because
`positionalForm` hands `block.series[1]` to `bubbleRows` as the sizes *for every series* — so the size
channel is drawn as a series sized by itself, in its own colour, in both arms now. One wrong figure
rather than two different ones, which is the tie-break's whole argument.

---

### 3ak.12 — The tiles and bar families: what the walk found that the type did not say

**Two families crossed and each falsified a sentence written when it had one subject.** That is the
section's whole content, and both sentences read as settled when they were written.

**`facing` for the tiles family (F276).** `tilesFigure`'s doc said *a flame grows up from its root and
an icicle hangs down from it, which is one decision applied twice* — and passed `FACING_DEFAULT` for
all three forms, so the member said `up` for both and the growth direction stayed written in two
renderers. Every clause of the justification is true; none of it constrains the decision it is
attached to, which is MG24's class. **It was unfalsifiable until something read the member**, and the
projector is what reads it. Measured in the terminal before deciding: `definition.ts` maps
`t.y0 * areaRows` to a row index, so a **treemap** faces down too — two of the three, and only the
flame grows up.

**`depth`'s absent case (F280).** Written for tiles, where there were two subjects — nesting tiles and
stacked strips — and one reading fitted both. The bar family made it three:

| the rect is | `depth` | the inset |
|---|---|---|
| a tile nested in a partition | its depth | `depth + 1` units, every side |
| a strip in a partition, enclosing nothing | `0` | one unit, every side |
| a **measurement**, whose length *is* its value | absent | none along the value axis; a fraction of the slot across the identity axis |

**A length and an area are read differently.** A tile's area is read against its neighbours, so a unit
off every side costs nothing; a bar's length is read against a labelled axis, so a unit off the end is
the figure lying about its own number — measured at `x=351` against a `20` gridline at `352`.

**D11 and F274 close here, by construction.** `valueOnX` was a third answer to which way the values
run — beside `positionalDecisions`' fixed `"vertical"` and `orientationOf`'s read of the block — and
scoped to the family the defect was noticed in. It is `figure.orientation` now, so the scoping clause
has nowhere to live.

**The family's four forms are not one figure.** Measured in the terminal rather than assumed:
`lollipopRow` fills `0 … pos` and puts `●` at `pos`; `dotplotRow` writes `●` alone. So the emitter
carries a stem, a head, or both, and a walk drawing rects for all four turns a dot plot into a bar
chart — the plausible wrong figure, since both encode the same number.

**One slot fraction where the arm had two.** `0.6` in `slotOf` and `0.7` in the bar loop, one arm and
two answers to *how wide is a categorical figure*, which is the duplication this pass removes one
layer up. Now `SLOT_SHARE`.

**What the rows were measuring, and stopped being able to.** `svgPoints` lost its last caller and was
deleted: the arm no longer turns values into pixels, it projects marks the shared layer normalised.
Three rows moved onto the seam and the drawn document, and two of them **had been reporting coverage
they did not have** —

> `G6`'s clamp row called `svgPoints` with the samples directly, which answers for any list of numbers
> whether or not the arm ever asks it that question. For the `matrix`, `tiles` and `nodes` families it
> never does: they have no value axis, so there is no bound to clamp against. The row now says so.
>
> And it asked the *position* of a bar, which agreed for exactly as long as every form was vertical.
> A bar encodes by length; after D11 the row was reading the page's ordinate for a figure whose values
> run along the abscissa.

**`G6b` reversed and it was right both times.** It asserted this arm's zero baseline, which the
terminal does not have in either orientation (F272). The tie-break resolves it the terminal's way, so
the row now asserts the defect and **fails the day a bar hangs below zero** — which is the repair
landing.

---

### 3ak.13 — The distribution family: seven roles, seven shapes, and the range the gutter shows

**This is the family `GlyphRole` was written for, and it is the first to use all of it.** A median is
`┃` at full unicode, `|` in ASCII and a distinct mark below the colour floor; a mean is a different
character again; an outlier a third. The terminal picks all three off its own ladder and this arm
draws none of them — it draws a bar, a diamond, a circle. **What both agree about is which of the
seven things this is**, and that is the whole content of the seam here.

| role | terminal | SVG |
|---|---|---|
| `median` | `┃` per rung | a 2px bar across the slot |
| `cap` | `┬`/`┴`, a tee | a 1px bar, half the slot — a cap as wide as its box reads as a second box edge |
| `mean` | a distinct glyph | a diamond, edged in the furniture tone |
| `outlier` | a dot | a smaller circle |
| `target` | `g.diamond` — *this one is the answer* | a diamond, sized by weight |
| `point` | `ch.filled` | a circle |
| `absent` | a character for *nothing was reported* | **nothing** |

**`absent` drawing nothing is the role's entire content.** A forest row with no estimate is a real
state; a circle at the fallback position is the plausible wrong figure it would otherwise become.

**Three facts the figure was dropping, all of which the terminal draws.** The emitter was written
against `boxplotBand` and `boxplotColumn` and missed what `forestRow` does one function along:

- **the tees.** `row[xLower] = ch.whiskerLeft` — *a plain `─` at the end of a run does not say the
  interval stops there.* This arm drew them from its own loop and the terminal from the record; one
  of the two was going to stop.
- **the pooled estimate.** `q.pooled === true ? g.diamond : ch.filled`. The seventh role, `target`,
  had no subject until now.
- **the weight** (I31). *A wide interval drawn small contributed little and a narrow one drawn large
  carried the result.* It crosses as a `size`, exactly as a bubble's radius does — one normalised
  number, spent on cells in one arm and a radius in the other.

**F282 — the figure carried two ranges and the marks were on the wrong one.** `distributionFigure`
normalised against the raw `extent` while publishing the **niced** axis over it, so a boxplot spanning
2–9 was drawn against 2–9 and ticked `0 · 2 · 4 · 6 · 8 · 10`. It is F272b's ruling arriving late —
*the range the figure is drawn against is the range the gutter is labelled from* (F210) — and the same
asymmetry hid it: the terminal's horizontal boxplot is `bandedForm`, whose gutter holds **categories**,
so there is no label for the fraction to disagree with, and the vertical arm is not the default.

> **Nothing could see it while nothing read the marks.** `FD1`–`FD5` assert normalised numbers against
> the same `extent` the emitter used, which agrees with itself whichever range that is. The walk is
> what made the two visible in one picture, and reading the frame is what caught it: `forest-default`'s
> interval moved `299.52 … 509.44` → `283.97 … 594.96` in a commit whose only intended changes were
> colour and shape.

**A mark list is a paint order, so a composition ruling belongs in the emitter.** The arm this walk
replaces drew *whiskers, then their caps, then the box over both, then the median over that* — the
glyph tables' own order, "so a cap coincident with an edge reads the way it reads in the terminal" —
and the emitter had the box first. Invisible on an ordinary summary, where the whiskers abut the box
rather than crossing it; `boxplot-flat-whisker` is the fixture where they do not.

**And the whiskers are the series' colour, not the furniture's.** This arm drew them muted; the
terminal rasterises a summary into glyph rows and colours the row by its category, so every part of
one summary is one colour. The split was this arm's invention and the figure never had it.

**`range` leaves `marks()`' signature here.** Every family that walks takes its coordinate from the
marks, already normalised; the last caller needing a range of its own was the distribution branch.
What is left is the nodes family, whose placement is topology and slots and no scale at all.

---

### 3ak.14 — `autocorrelation`, and a deferral whose stated condition was not its real one

**F266 deferred this to *once the bar family walks*, and that condition was met a commit early.**
Reclassifying `SVG_FAMILY.autocorrelation` from `"curve"` to `"bar"` is one word, the blocker had
been named as a symbol, and grepping the symbol said *done*. Reading `lagRow` said otherwise:

| what `lagRow` does | what `barFigure` did |
|---|---|
| ranges over `±max(1, |v|)` — symmetric, floored at one | `{ min(0, dataMin), dataMax }` |
| grows a bar from a **centre zero**, `[zero, end]` or `[end, zero]` by sign | fills from the range floor (F272) |
| writes `g.vertical` at zero, before and after the run | no zero rule |
| draws every bound at **`±|b|`**, both signs | one line per annotation, at its value |

**Landing the word alone would have drawn a different chart** — D14's shape, in the family that was
supposed to end it: positive lags only, no zero to measure them against, and half of every
significance band.

**The escape clause held, and checking it is what this step is for.** §3ak's ruling on D14 is *refuse
a false figure, record an incomplete one*, with the refusal conditional on the emitter not reaching
the lag figure **without new geometry**. All four rows above are expressible in the marks that already
exist — a range is a decision, a bar from zero is a `rect`, a zero rule is a `polyline` on the
`furniture` layer, a mirrored bound is two `polyline`s — so the refusal was unnecessary and the work
was an arm rather than a table entry.

**Three of the four are the terminal's computation moved, and the fourth is not F272's repair.** A lag
bar growing from zero is *this form's own behaviour*, which `lagRow` has always had; making the rest
of the family grow from zero would be correcting the terminal inside a refactor, which is the one
thing this pass forbids. The branch is on the form, in the family's function, for the same reason the
stem and the head are: **the family is the unit and the forms inside it differ in what is drawn at a
position the shared decisions gave.**

**The magnitude has a floor of one and that is not arithmetic.** A correlation lives in `[-1, 1]`, so
an axis that shrank to fit a weakly correlated series would make noise look like signal. `max(1, …)`
is what says *this is a correlation* rather than *these are the numbers I happened to get* — and it
reads the **raw** values, so a pinned `yMin`/`yMax` does not reach it, exactly as in the terminal.

**A significance bound is one number and two claims.** A correlation of `-0.4` is as significant as
one of `+0.4`, so a band drawn on one side only says the opposite of what it means. The caller asks
for the mirror rather than every annotation acquiring one it has no meaning for.

> **The clamp row met the same wall the bar family's position row did.** *Far below clamps to no
> length* is true of a bar filled from a floor and false of one measured from a centre — the floor
> sample is a lag's **longest** bar. Third instance in this pass of a claim that held while every form
> in a family behaved one way.

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

**Fewer: spread across the area — and the citation this used to carry was to an invariant about a
different geometry.** It read *left-aligned, padded right, which is I13's ruling and not a new
one*, and I13 is about a **sparkline**, where *one cell is one position*. That fixed
cell-per-position is the whole of what left-anchoring buys there, and §B3 is the measurement:
right-anchored, a fourth arrival moved every glyph already on screen one cell left, and
left-anchored none of them moved.

**A candlestick has no fixed cell-per-position.** Its pitch is derived from the bar count, so the
property I13 protects does not exist here — the citation carried the disposition across without
the geometry that earns it. Measured the way §B3 measured the sparkline, over an area 74 cells
wide and every bar count from 2 to 80:

| | left-anchored, what shipped | spread |
|---|---|---|
| arrivals where the drawn extent **shrinks** | **5** of 79 | **0** of 79 |
| the worst of them | `n = 37 → 38`: **73 columns become 38** | — |
| blank at the right | 0 % to **69 %**, and non-monotone in `n` | **0 %** at every `n` |

**The figure does not grow rightward. It grows rightward and falls off a cliff five times** — at
13, 15, 19, 25 and 38 bars — and one arrival at `n = 38` takes thirty-five of the seventy-four
columns away. The fringe is 4 % at twelve bars, 15 % at sixteen, 4 % at twenty-four and 46 % at
forty, so a reader watching a feed fill sees the chart shrink as data arrives. **Every clause of
*four bars so far, growing rightward* is true and none of it survives being measured here**,
which is §B3's own finding arriving a second time on the form next door.

That is also the defect §3o ruled on the other side of this component — *AXES ǀ MASSIVE GAP OF
NOTHING ǀ HEAT MAP* — and its reason holds unchanged: a fringe of blanks is the thing that gets
reported, by someone looking at a chart and not at an invariant.

**Ruling: a candle's left edge is `round(i × (areaWidth − cw) ÷ (n − 1))`, and `cw` is uniform.**
First body at column 0, last flush with the right edge, extent exactly the area width at every
`n`. Gaps then differ by at most one cell and **bodies never differ at all** — which is what §6b
B15 asks for, and what the earlier remedy of distributing the remainder into the *pitch* got
backwards.

**The growing-rightward reading is not offered**, and that is a ruling rather than an omission:
the form cannot tell a live feed from a complete series, nobody has asked for it, and
`matrixAnchor` already spells the vocabulary the day somebody does.

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

**Measured, and re-measured when the layout changed — the old table was a correct measurement of
a layout that is now wrong.** It read *what separates them is the sparse end, a candle sits at a
fixed pitch and is left-aligned*, and put the two mappings 23 cells apart at four bars. Once a
candle spreads across the area (§3r) that reason is gone and **the separation is not**: it falls
to the wick's offset **inside its own body**, which at the last bar is exactly `⌈(cw − 1) ÷ 2⌉` —
checked against every `(width, bars)` pair from 10 to 120 columns, no counterexample.

```
44 columns   4 bars    last bar: candle column 41, curve column 43      2 cells — the wick in its body
             8 bars    last bar: candle column 41, curve column 43      2
            20 bars    middle:   candle column 23, curve column 23      they meet once cw = 1
            44 bars    middle:   candle column 22, curve column 22
           120 bars    middle:   candle column 22, curve column 22
```

So `candleColumn` is still not `columnsOf`'s rule and still cannot be replaced by it — **the
invariant survives its own justification being falsified**, and that is the case worth naming.
The divergence it has to cover is two cells rather than twenty-three, and it is now a property of
a body's width rather than of a layout. Had the table been deleted along with the layout it
described, the fact that a candlestick still needs its own mapping would have gone with it.

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

### The label is written inside where it fits — and for eight months only one layout did it

**The rule below is this section's, it is filed under the treemap, and the treemap is the one
form that ignores it** (F217).

A node's label is written inside its own figure where it fits and dropped where it does not.
Three characters of a symbol name is not a shorter name; it is a different one, and the extent
is the datum either way.

`hierarchyStripRows` implements it — `st.label.length + 2 <= cells`, the name laid into the
strip and the mark filling the rest. `treemapRows` computes the same layout, receives `label` on
every `Tile`, and fills the rectangle with `markOf(idx)`. **The same fixture through the two
renderers:**

```
flame · tree · 24bit          treemap · default · 24bit
 raster ████████████          ████████████████████████████████
 curve ██████ paint █████     ████████████████████████████████
 render ████ layout ████      ████████████████████████████████
 root ███████████████████     ████████████████████████████████   ← twelve rows, no word
```

**At ASCII and at one bit there is not even colour left**, so the figure is `#/\\/xxxx%%%%` and
`█▚▞▙▖` — a form whose declared subject is *containment*, saying nothing about what is contained.

**Why it survived being read**: the sentence says *a frame's* label, which is flame vocabulary,
so a reader checking the family finds it satisfied in the renderer that uses that word and stops.
**A correct ruling filed under the form that breaks it** is the MG24 class one step along —
there a true sentence justified the wrong scope; here a true sentence sits in the wrong section.

**The half of the ruling that holds: a name goes where its tile still owns cells, and the grid is
what says so.** Nesting is drawn by depth ordering — a parent is painted, then its children over
it — so a label written into a parent's middle is overpainted by the thing it was naming. Reading
the placement off the **filled grid** is I48's principle one label kind along, *its row is read
from ink rather than recomputed*, and it answers for a leaf, a parent, the root and either aspect
with one expression.

**The half that did not survive the code: there is no top padding row.** This section first ruled
that a parent's label goes in the ring the padding gives it, and called it forced. `pad` is **one
scalar on the unit square** and the axes have different cell counts — at 80 × 12 it is `1/80`,
which is `1.000` cells across and **`0.150` rows down**. Measured, `render` occupies rows 0–7 and
its child `curve` occupies rows 0–7: the ring is one cell wide and zero rows tall, and the row the
ruling reserved does not exist. **Which axis gets the ring flips when `areaRows` exceeds `width`**,
so no fixed choice of row would have been right either.

**So today's padding names the leaves and no interior node**, measured on the catalogue's own
tree: `render` and `layout` own a single column either side of their children and `curve` owns
two, and no run holds a name. That is what the references draw — an interior name wants a **header
row**, which is a question about the layout and not about labels. It is named here and not
answered, because a feature reaching back to widen the geometry that serves it is how a form
acquires a shape nobody chose.

**Where no run is wide enough the name is dropped, silently**, which replaces `inset`'s threshold
as the condition: the threshold is about whether a ring exists and this is about whether a name
fits in one, and only the second is the question.

**Silently, and §3ag A4 is why.** This paragraph first read *dropped and counted*, reaching for
I8 — and I8 is about a series that gets **no row**, which is data going missing. A tile whose name
did not fit is still drawn, still coloured and still carries its extent; nothing about the datum is
absent. Counting it would also have fed the sizing cycle §3ag.4 records. **The correction is one
commit old and inside the arc that wrote it**, which is the ordinary way an over-applied invariant
gets caught: by walking the rule it was borrowed from.

**Four rulings from this arc have now been overturned by running the code**, and each was called
forced when it was written — the padding ring here; the shift-inward in §3ag that turned out to
cover the sample it names; I55's mark prefix, which could not fire at any capability; and §3ah.7's
*the three layouts agree exactly on a single node*, which the frames refuse because one of the
three is centred and two are not. *The walk rules the shape and the code is the first thing that
can disprove it*, which is an argument for building early rather than for walking less.

**And the fourth is the one with a shape worth naming**: the walk was reasoning about *structure*
— a root with no children has none, so the three must agree — and the property that separated them
was **placement**, which no row of either artefact had been written about. A rule interaction
cannot be indexed against a decision nobody has made yet, so the frame is the only instrument that
reaches it, and the correction is a ruling (§3ah.2) rather than a repair.

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

### The member's scope, which it did not have

**`plotDetail` governs the forms with a ladder and nothing else — and until `HAS_DETAIL_RUNGS`
nothing said so** (F220). It has **one reader** in `src/`, `rungFor`, reached from three call
sites all inside the `boxplot` and `violin` renderers; `validate.ts` never mentioned it. So it was
accepted on **42 of 44 forms** and did nothing on them.

**This section is where that came from.** Everything below describes two ladders and none of it
says the member is theirs, so a reader takes it as general because no artefact narrows it — which
is F207's *accepted at construction and ignored at render* arriving in a member rather than in a
record, with the silence running the other way: `STYLE_ARMS` said *yes* where the renderer said
nothing, and here nothing said anything at all.

**It survived because the member is optional and defaults to `"auto"`.** Every form renders
correctly whether or not it is set, so there is no wrong frame to find — the only observable is
the absence of an error, which is what no frame-read, golden or mutation reaches.

**`HAS_DETAIL_RUNGS` and `RUNGS` are two artefacts that must agree and cannot be derived from one
another**: the record is in `types.ts` so `validateBlock` can read it, `RUNGS` is in
`definition.ts`, and L0 does not import L1. T2.10 asserts the agreement against `RUNG_FORMS`, which
is `RUNGS`' own keys rather than a restatement — a `true` with no ladder is a refusal that never
fires, and a `false` with one is a ladder no caller can reach.

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
- **I15** — Y-labels are placed at the max, mid and min rows of the plot area and collapse from the middle outward when the height cannot hold three: two labels at `height: 2`, one at `height: 1`. **A labelled row carries a tick on the border and an unlabelled one does not** — one rule rather than a flag per form, and the same rule a categorical axis, a band and a matrix row each resolve correctly under. **The ticks, the range and the precision all come from the one `Axis` the caller rasterised against** — `yLabels` nices nothing. A second nicing is not idempotent, so it labelled a `bubble` whose largest mark is 30 with a `40` on the row that mark is drawn on (§3d, F210).
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
- **I27** — **A legend costs width or a row, and only the width-costing placements may enable themselves.** A row must declare its cost before the data is visible (I1); width is already data-dependent through the gutter, so it may not. That is why `"right"` is the default and `"above"`/`"below"` are opt-in — not a preference. **Skipped entirely at `colourDepth: 1`**, where a swatch carries nothing and still takes the row. **And the horizontal row is unconditional, which is this invariant rather than an oversight** (F222). A `treemap` at `height: 4` with `series: []` and `legend: "below"` renders five rows with the fifth blank, and the obvious reading — `legendRows` takes a `Pick` excluding every source `legendEntries` reads — is wrong: **it is §2's empty-series rule one row down.** An empty series occupies its declared height rather than collapsing because a plot that changes height when data arrives shifts everything below it, and `op: "replace"` is how data arrives; a legend row appearing with the first series would do exactly that. So `series` stays unreachable from here and the `Pick` is right. **The residue is a form that can never gain one** — `treemap`, whose renderer reads `hierarchy` and nothing else, and `tree` after it, where the row is permanent waste. `flame` and `icicle` are not in that set, since absent a hierarchy they fall back to their series. Closing it wants a total record over forty-four forms for two entries, so it is stated here rather than built.
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
- **I37** — **The cursor's column is marked twice, and the mapping from index to column is the form's.** A readout names values and a reader cannot use them without knowing which mark they describe — which is what §6b B5's ruling about the doji rests on. **A dashed vertical behind the data** through the same path the gridlines take, so it never overwrites a sample; **and a mark on the bottom rule**, because the dashed line is invisible in exactly the case that motivates it, a dense column with ink in every row. *The index is into the data and not the area* — `cursorReadout` has always read `values[cursorIdx]` — so a candlestick inverts through its own pitch and its buckets. **Measured, and re-measured when §3r changed the layout**: the two mappings agree wherever a body is one cell and separate by the wick's offset inside its body where it is wider — `⌈(cw − 1) ÷ 2⌉` at the last bar, so four bars in forty-four columns put the last candle at column 41 and the curve's rule at 43. The earlier figure was 20 against 43, and it measured the left-anchored layout §3r struck; the invariant is unchanged and only its magnitude moved. **C12 owns what a cursor draws and not who moves one**: nothing in `src/` writes `cursorPositions`, and §10's Phase 2 row is about that writer (§3s).
- **I38** — **Colour indexes an identity, and a row that is a slice of a continuous axis has none.** A histogram's bins and a correlogram's lags are cut from an axis by the renderer, so eight bins are one distribution and drew eight colours; a band named `control` is a thing the caller chose and keeps its slot. `ROW_IS_AN_IDENTITY` is that partition, total over `PlotForm`. *The claim this replaced lived in a code comment and no file — true about the grouped bar it was written for, general by nothing — and **the first correction over-reached in the other direction**: eleven reference renderings draw one colour per series and that is the references' taste rather than the principle under it, so reading the measurement as the ruling took the colour off every named band too. A measurement settles what is true; it does not settle what to draw.* **The switch is span ownership and not `SHARES_CELLS`**, which is indexed by form and so answers for a plain bar and a stacked one at once: a builder returning owners has interior identities and each run takes its owner's slot; a builder returning a string has none, and the row's identity is in the gutter already. **A form whose rows are series says so** — the timeline is the single cell where the old default was accidentally right, three tracks in one colour is what the correction costs there, and every count in that frame would still be correct. Measured against eleven reference renderings: the cycle advances per series and only per series, and mapping the category axis to colour is `hue=x` — available, explicit, and redundant by construction (§3t).
- **I39** — **A mirrored figure draws on an odd extent, and the spare cell precedes it.** A reflection needs a centre and an even extent has none: both violin arms split their slot symmetrically and then take the spine at `round((k−1) ÷ 2)`, which for an even `k` is the lower baseline rather than the axis of reflection — so the figure carried three rows of ink above its rule against two below, at 4, 6 and 8, in both arms. *Neither statement is wrong and the pair is, which is why the comment already standing over the first one — **a violin that is asymmetric by a row is a violin that is wrong, and it is invisible in anything but a mirror assertion** — was right about the class and did not reach the instance. No mirror assertion existed, and the golden corpus could not supply one: `ONE_PER_FORM`'s violin is four rows a band, which this ladder spends on the **raincloud**, so the top rung had no horizontal golden frame at all and the fix moved four vertical frames and none of the other 280.* **The spare cell goes first** because `bandedForm` places a band's name at `⌊rows ÷ 2⌋` and `columnLabels` places its tick at `x + ⌊w ÷ 2⌋` — padding before lands the spine on both at every even extent and padding after lands it one short of both, so two untouched placements agree. **The raincloud rungs are outside this**, being one-sided by construction, and an extent of two falls to the fill because two cells are two edges with no centre between them (§3i).
- **I40** — **Where two layers ink one cell the merge is per dot, and the colour is the first layer's.** `mergedRow` resolved the whole cell to the first layer that inked it, and every figure that composites — a pie's wedges, a radar's polygons over its frame — is folded to braille *before* it arrives, so the second layer's dots were dropped. *A pie's disc is fully covered by construction and `pie-default-40` had seven cells flanked by a full cell on each side that were not themselves full; the radar had it twice, its polygons eating each other and its frame drawn only in the cells nothing else wanted — which reads as dashed strokes and is not, because `dashFor` is solid at any depth above one bit.* A braille cell is `U+2800 + bits`, so the union is `0x2800 | (bitsA | bitsB)`; where any candidate is **not** braille the first-wins rule stands, because a letter and a polygon cannot share a cell. **The colour remains one layer's and that is a limit of the span model, not an oversight** — two wedges meeting in a cell draw both sets of dots in the first wedge's colour, so what the union removes is the gap and not the boundary's exactness, and saying *the gaps are fixed* would imply a per-dot colour a `Span` cannot carry. **The priority order stays the ref's** rather than becoming the densest layer's, because that order is a ruling — labels over polygons over frame — and a dot count would overturn it wherever the frame was denser (§3u).
- **I41** — **The positional family's x axis is nice numbers over a declared domain, and the sample index is what it falls back to.** `Plot` gains `xMin` / `xMax` / `xFormat` mirroring the y axis — the same `axisFor`, the same precision, the same formatter — and absent them the domain is `[0, n − 1]`, which is what the data has when nothing else was said. *Measured: `ax.plot(y)` over 24 samples ticks 0 5 10 15 20.* **The row it draws in was already reserved**: `axes: true` adds `AXIS_ROWS + FRAME_ROWS` to the declared height rather than taking it, and with no `xLabels` the third of those rows rendered as `""` — so every axed positional plot had been spending a row on an x-label row it never filled, and filling it costs nothing against I1. **`xLabels` wins where both are present**, because a caption is the caller's words and a scale is inferred, and overriding the first with the second is the wrong direction. A label that cannot keep its one-cell gap is dropped **with its tick**, `plotFrame: "corners"` draws the labels and no ticks — a tick is a mark on an edge and there is no edge, where a label is still a reading — and a log or time scale is labelled through `axisFor` or the two halves of one axis disagree. **The form owns the index-to-column mapping** (I37): a candlestick's ticks come from its own pitch, and the curve's rule would place them between candles at every width where the two separate (§3d.1).
- **I42** — **A histogram bins every series on one shared edge set, and `layout: "overlap"` cannot mean *draw the first one*.** Binned on its own extent each series fills the width, so two distributions of different spreads draw the same picture and the comparison is gone — I35's argument one form along, and the reference's answer: `ax.hist([a, b], bins=8)` returns one edge array over the union and a count array per dataset. **The strategy's inputs are the union's too**, because the edges are: a bin *count* chosen from one series' `n` and spread belongs to edges that are not that series'. *The default layout dropped every series after the first and the legend named them all, so the picture asserted a series it did not draw — I8's rule, in the arm beside the one whose comment records being fixed for it.* **There is no overlapping picture a bar can draw** — two runs superimposed in one row of cells is one run — so `overlap` with more than one series means **grouped**, for the bar and the histogram alike, which is also what `ax.hist([a, b])` draws. Binned, a histogram *is* a bar chart of counts, so all four layouts arrive from the bar rather than being invented. **The vertical arm needed the `refFor` its transpose already had**, or N×S column bands draw in one colour under a legend naming S; and a series with no finite values keeps its bands, because dropping it renumbers the groups and the bin a reader is looking at holds different series in different bins (§3v).
- **I43** — **Which styles a form has an arm for is a total record, and a fill is the braille arm's.** `plotStyle` was a shared union with `candlestick` refused on the wrong form by a clause naming that style — right, and a special case: every style is one some forms draw and others do not, and a second would want a second clause. `STYLE_ARMS` is `Record<PlotForm, readonly PlotStyle[]>`, total, and the refusal is one rule over it. **A braille violin changes the vocabulary and not the geometry** — the outline strokes the dot grid at 2×4 a cell, which is where the smoothness comes from, while I39's odd extent and §3i's rungs stay the figure's; the box and the summary marks remain cell-resolution and composite over the fill. **`plotFill` is refused on the line arm** rather than ignored, because a box-drawing outline has no interior vocabulary and putting `█` inside `╭──╮` is a third figure rather than the same one filled. **A solid pie degrades to braille at one bit and does not refuse** — the hatch ladder is that depth's identity channel and a block glyph has no hatch, so I18's precedent applies: where the capability cannot spare what a figure needs the honest answer is the thing that fits, not an error the caller could not have avoided. **And a radar's line arm took four alphabets**, which is §3c proving itself: `plotStyle` names *draw this as a connected line* and the glyphs are the renderer's. `strokePolyline` steps orthogonally and a pentagon's every edge is oblique; `╱`/`╲` draw a clean pentagon *in isolation* and compose to rubble, because I40's union is braille's alone and the labels, polygons and frame each take cells from the others; one grid with an owner per cell fixes that and **still renders as dashes**, because those two glyphs are strokes inside a box and do not reach their corners. **Quadrant blocks are filled sub-cells and connect.** Half braille's vertical resolution and the same horizontal, traded for coverage — the right trade for a *shape* where braille's is right for a *curve*. **And the frame is continuous**: stippling answered a question about weight by leaving holes, and a stippled ring reads as a broken one rather than a light one, where `tone.muted` against the series' slots already separates them. *The pie keeps both its arms for the complementary reason — a solid pie has no seams and a braille pie has no gaps, and neither loses the shape* (§3w). **And the arm belongs to a routine rather than to a form.** `STYLE_ARMS` is keyed by `PlotForm` and says `violin` has a braille arm; a violin has five drawing routines and one of them had it — the vertical arm and all three raincloud rungs accepted `plotStyle` and `plotFill` and changed nothing, which is worse than refusing (the caller is not told) and worse than degrading (the reader is not told). *A total record over forms reads as a complete answer to a question it cannot ask.* The vertical arm honours both now, transposed — sampled at four dot rows a cell of value where the horizontal arm offsets at four dot rows a cell of width. **The raincloud rungs have it too, and the argument for skipping them was wrong on one axis**: their one-row cloud has eight ladder levels against braille's four, which reads as half the resolution and is not — a cell holds eight dots as 2 × 4, so the ladder spends all eight on magnitude at one sample a cell and braille spends them as five levels at *twice the sampling*. Equal budgets, different split. *Comparing the vertical axis alone is what made a trade look like a downgrade.*
- **I44** — **A layer declares what it is, and where two peers contend the cell goes to one of them by turn.** I40's union was measured against a pie, whose wedges meet along a **boundary**, and generalised to every layer — but two curves run *alongside* one another, and the union then draws one series' ink in another's colour by the hundred *(`slope-default`: 25 foreign dots against 20 own; the braille radar, 70 of 279 frame cells wearing a series slot; the quadrant radar, 80 of 98)*. **The radar is worst for a structural reason — a value ring and a data polygon are the same shape at different radii, so there is no locus small enough for *a seam a cell wide* to describe.** **Occlusion is right across kinds and wrong within one**: `"context"` under `"curve"` is a gridline behind a line and nothing is lost, while a series under a series answers *where did this one go* with **nowhere**. **And a cell holding one colour never meant a region holding one colour** — occluding gave all eleven contested cells to one series, a neutral tone gave them to none, and turning the owner with the column gives each a third: *125 / 119 / 122 of 134 dots kept in their own slot, nothing mistinted, no line absent for more than three columns.* **A surface does not rotate**, because a wedge is a region rather than a line and turning its boundary stipples every seam — surfaces union and the boundary keeps the topmost tone. *The same ruling governs the quadrant figure at 2×2, where it matters more because a quadrant is a filled rectangle and a braille dot is not* (§3u, §3w).
- **I45** — **A radar's grid is a polygon by default and a circle by option, and the two arms had silently chosen differently.** The braille arm drew its value rings with `arcDots` — circles — and the quadrant arm drew them as *n*-gons through the data's own vertices, so one form rendered two figures and neither the spec nor a test said which was meant. `plotGrid?: "polygon" | "circle"` makes it a decision. **Polygon is the default because the grid is a ruler for the shape measured against it**: at three categories a circular ring behind a triangular polygon is two figures in one frame, and a ring the data can touch at only three points answers *is this axis further out than that one* worse than one it meets along its whole length. At ten categories the two are within a dot, so the default costs nothing where its argument is weakest. **`"circle"` ships too** — it is matplotlib's default and what `make refdiff` compares against. *Neither is inferred from the category count: a figure that changes shape at a threshold is two figures with one name* (§3w).
- **I46** — **A compact box's interquartile run is filled or heavier, and the caller says which.** With one row a box has no lid or floor, so a blank interior leaves `┤    │    ├` — two tees, a rule, and nothing saying those cells are the box; the interior has to carry the range. **That is an argument for a *run*, and it was read as an argument for a *fill*.** `━` is not the whisker either, and it leaves the summary a line drawing. `plotBox?: "solid" | "line"`, `"solid"` by default. *Which one reads depends on what is behind it: against a raincloud's filled ladder the solid box competes for the same weight, where a heavier line reads as the summary of the shape rather than a second shape.* Standing up it is `┃` against a leftward `█` run, by the same argument. **`heavyHorizontal` and `heavyVertical` are new named slots** rather than a reuse of `candleFilled`, which is already `┃` — a name that lied about its use would be the defect SS47 exists for (§3i).
- **I47** — **The y gutter can be drawn on either side or both, and the right one writes what the left one was given.** At eighty columns a row cannot be tracked back to a label seventy cells away, which is why every financial and monitoring TUI mirrors its axis. `yAxis?: "left" | "right" | "both" | false`, `"left"` by default; it costs **width and never a row**, so I1 is untouched and the sizing is I27's data-dependent kind rather than its declared kind. **One label, two consumers** — `"both"` renders the same ticks on both sides by construction rather than by a second `yLabels` call, and a dual-*scale* right axis is refused because two ranges on one figure assert a correlation the data does not have. **The tick belongs to the side that draws the label**, which the tree spelled as *the label is non-empty*: every caller blanked the label when `labelColumn` was 0, so *a label exists* and *this column draws it* were one statement until a right axis separated them and the left border drew a stub pointing at nothing. Three callers gate `yLabels` on the same predicate, so a right axis computed no labels at all and `"grid"` lost its horizontal rules with them (I26). **The mirror is of the left gutter's shape and not of its glyphs** — `plotFrame: "rule"` has a left rule and no right one, which is what that style *is*, so the two `bare` predicates differ on purpose. **The right column is dropped before the left**, being a copy of it at `"both"` and landing on the existing unlabelled rung at `"right"`; `bandLayout`'s `⌊width ÷ 3⌋` cap becomes a cap on the pair. *A right axis reaches that degradation one cell before a left one, because `AXIS_GUTTER` spends the label-to-border space whether or not a label uses it — kept with both figures rather than equalised, since equalising moves every narrow frame for one cell at one width* (§3x, §6c).
- **I48** — **A callout names a series' last finite value at that series' own row, and its row is read from ink rather than recomputed.** `yCallout?: "none" | "last"`, `"none"` by default and named for the case it serves: on a static chart the last value is at the end of the line, and on a live one it is the number that matters most and the hardest to read off a line still moving. **Recomputing the row from the value is wrong about one value in six** — `curveRows` rasterises at dot resolution and folds where `lineDrawRows` and `candleRows` map at cell resolution, and the two disagree for 15.7–21.0% of values at heights 6, 8, 12 and 20, clustered at the ends of the range where a live chart's newest value sits when something has gone wrong. *That is I37's class on the other axis.* Reading the series' own rasterised rows is exact for every rasteriser and capability by construction; where the last inked column spans several rows — the tail of the line that reached it, drawn into the same column — the callout takes the end **furthest from the previous column**, which is where the sample is. *The walk ruled `midpoint` and running the code disproved it: on a descending braille curve ending at 7.2 of 0..100 in eight rows the stroke spans 6 and 7, the sample is in 7, and the midpoint answers 6 — the very row the shortcut gives, so the ruling was unfalsifiable as well as wrong.* **It displaces the right gutter's content on its row and never the left's** — the *your data is here* argument reaches only the gutter it is written in. **Two on one row: the later wins and a one-cell `+` says so** (I8), not `+N`, whose count needs the ink that needs the width that needs the column being sized, and not a second row, which would change the count and break I1. **The carrier at one bit is a mark and cannot be bold**, because a series slot resolves through `MONO` there and `emphasised` *is* `{ bold: true }` — so a heavier edge glyph carries it and colour and weight ride above (I25, §3b). **A callout does not replace the legend**: it names a value where a legend names an identity, and only together do they say which line is which and what each reads (§3x, §6c).

- **I49** — **A contour's glyph is derived from its cell's four corners, and the derivation is the curve renderer's own table.** An edge is crossed exactly when its two corners disagree; the mask is `(top?UP)|(right?RIGHT)|(bottom?DOWN)|(left?LEFT)` and the glyph is `glyphForMask`'s. All sixteen marching-squares cases land on entries that already exist — zero new glyphs, eight distinct masks — so adjacent cells agree **by construction**: a shared edge has the same two grid corners on both sides and the strokes join with nothing joining them. Levels union their masks in one cell, which is the only way `┤ ├ ┴ ┬` can be emitted. **Both saddle cases give mask 15**, so the centre-value resolution is observable on the braille arm and collapses to `┼` on `"line"` — the default is braille so that the ruling has a subject (§3y). Levels are named in the legend and never on the line: there is no gap-cutting vocabulary, and a label over a contour is the contour with a hole in it. **A field's own axes are positions**: the row index down the gutter and three captions over the column domain, derived where the caller named none, because a field is sampled over a domain where a matrix is a set of named rows — `ROW_IS_AN_IDENTITY` and `HAS_POSITION_AXIS` are both the opposite of the matrix family's answer.
- **I50** — **A quiver's direction is its glyph and its magnitude is its colour, and a cell with no flow draws nothing.** Eight directions, with the ASCII arm required at `unicode: "ascii"` **and** at `ambiguousWidth: "wide"` — every arrow in U+2190–21FF is `East_Asian_Width=Ambiguous`, so a wide terminal draws the field at double width, and this is that switch's third consumer after `art.ts` and `mermaid.ts`. **One datum, one channel.** Magnitude is the arrow's colour where the field carries something else, and the *field's* colour where the caller named no scalar — colouring the arrow by magnitude over a magnitude field paints it in its own background, measured at `38;2;33;145;141` on `48;2;33;145;141` and invisible at full colour depth while every assertion passed. **Magnitude dies below `colourDepth: 8`**, not below one bit: `continuousColour` returns `undefined` under `CONTINUOUS_FLOOR`, and I25's mark ladder cannot carry it because the mark is already spent on direction. A zero-magnitude cell is blank rather than an arrow of arbitrary direction, and the field beneath it still reads (§3y).
- **I51** — **`layers` is a draw order the caller reads and a priority order the merge takes, reversed at one documented seam.** `layers` says what is drawn; `Layer.kind` (I44) says how two inked cells resolve, and both a contour and a quiver are `"curve"`. **`field`'s membership is load-bearing and its position is inert** — a background cannot occlude, so the two orderings render byte-identical. `fieldDim` and `glyphInk` are two fields because they answer two questions: `"floor"` dims per colormap by measurement rather than by a constant (viridis and coolwarm at 50%, inferno at 40%) and costs viridis 78% of its luminance spread; `"contrast"` picks black or white per cell and costs a quiver its magnitude channel. Below `colourDepth: 8` the field is a ramp **glyph** rather than a wash, so two glyph layers meet — and **the field yields where the layer over it is drawn in the ramp's own alphabet**, which a contour is at every capability and an arrow is at none. Ruling the other way settles the cell contention and leaves both layers in one vocabulary, which no assertion can see and the frame shows at once. `fieldDim` is inert below the floor regardless (§3y).
- **I52** — **A horizon carries band depth in colour and within-band height in the vertical eighths, and it folds by mirroring.** The form had no section and no invariant: it was built from the survey's entry, which says *colour = which band*, and shipped carrying depth on the density **glyph** ramp with `DEFAULT_COLORMAP.horizon` set to `null` — so the compression its own header calls *paid for in a colour axis* was charged and never delivered, and depth was occupying the alphabet height needs. At `height: 1`, the canonical horizon, every inked column was therefore exactly one row. **The mirror is forced rather than chosen**: §3r measured that Unicode's eighths are a complete ladder upward and `▀`/`▔` are the whole of the downward repertoire, so an offset fold would resolve one direction to an eighth and the other to a half — precision at one end reading as precision at both. The sign rides a diverging map's two halves, so a **sequential** `colormap` is refused rather than drawing a trough as a peak, and `legend: false` is refused because the colour axis *is* the reading (I19's argument for a matrix's scale). **The baseline is 0 where the range spans it and `range.min` otherwise** — folding about the minimum unconditionally is why it only ever folded one way, and it is invisible on any fixture that never goes negative. **A finite reading always draws ink** (I16 one form along): a floor rendering blank gives blank two meanings in the form whose subject is *how deep*. *Below `CONTINUOUS_FLOOR` there is one channel for two data and the frame decides, not this invariant (§3z).*
- **I53** — **A calendar's rows are the sub-unit, its columns the super-unit, and its cells are the one thing in the matrix family that have a duration.** `calendarUnit` picks the cell and the grid falls out: 24 rows for `hour`, 7 for `day`, 5 for `week`, 12 for `month`, one flat series in and `N` labelled rows out, substituted at `heatmapFormRows` where a `quiver`'s magnitude field already is so that the range, the gutter, the legend and the overflow row all see one series list. **Three units are `(offset + i) mod cycle` and `week` is a calendar**, because a month is not a whole number of weeks — so `week` is the only unit whose grid has interior holes, and they are periods that do not exist rather than readings that are missing. **The span needs no member**: `startDate` + unit + `values.length` fixes it, which is the reader `startDate` was published without. **The columns are `uniform`** — every cell the same width, the oldest dropped first, the remainder a fringe — because `stretch` differs by one cell and one cell at a pitch of one is a doubling, and a two-cell week beside a one-cell week reads as two weeks holding one value (§6b B15's rule on its third consumer). `uniform` is `left` with the cells widened to fill, identical wherever the pitch is one, and the fringe is removed with `width` rather than by stretching. **No height refusal** — `matrixRows` spends its last row on `+17 more · 07 · 08 · …`, which is commitment 46 speaking in the calendar's own labels, and at `height: 1` the frame is that notice and no cells. **No `Date`** (SS1), UTC only, days-from-civil by hand. **Three x captions, derived at the super-unit's granularity where the caller declared none, and read through `columnMap` so they name the columns that are shown rather than the columns that exist.** The walk ruled the other way and gave a reason — *placing one against a grid that need not reach the area's right edge needs an offset, and `xLabelRow` takes a width* — that is true of a right-anchored grid and false of the three arms whose grid starts at column 0. **A matrix's captions span its grid rather than its area** from here on, which was already wrong for `left` and was shipped; `window` keeps the area and §3ae.7 names why (§3ae.8).
- **I54** — **An alphabet is chosen by capability and never by `plotStyle`, and at `unicode: "ascii"` every sub-cell repertoire has a stated substitute.** §3c's *`plotStyle` names what, never the alphabet* was the rule and four sites decided it from the style alone: `lineDrawRows` selected its glyph table with no capability in the signature, `styleRasteriser` branched on `ambiguousWidth` where the question is `unicode`, and the contour and violin arms read `plotStyle` while holding `ctx.capabilities`. **The substitutions are C02 §4's, not new ones** — box drawing becomes `+ - |` through the `ASCII` table `glyphForMask` has had all along, braille becomes the density ramp, and the legend separator becomes `-`. **A style is degraded and never refused**, on I18's precedent: a caller cannot avoid the terminal they are on. **`lineDrawRows` degrades in place rather than yielding to `curveRows`**, because the ramp is ASCII and loses the connectivity that is the whole content of `plotStyle: "line"`. Measured: 49 of 159 variants at `ascii · narrow` and 24 at `ascii · wide`, 32 files of the rendered corpus carrying braille in a frame labelled ascii, and `expectDocument(…).degradesToAscii()` — the assertion this framework publishes for a consumer's suite — failing on a `line` plot and on a `contour` (C12 §3af, F216, → C09 I22, C02 §4).
- **I55** — **A label is placed once, marked where it displaces another, and never sized into the thing that sizes it.** Six kinds share one anchor vocabulary — a value and a series name at the series' own inked row, an annotation's in a legend row, a node's inside its own figure, a point's beside its sample, an axis title in a declared row — and a **tick is not one of them**, because a tick is *at* a coordinate and a label is *near* one, which is the whole difference between moving a tick (a lie) and moving a name (still the name). **A point label takes one of two positions and never slides**: right of its sample, else left of it, else dropped — a label slid inward from the right edge covers the sample it names, and an anchor hidden by its own label is worse than no label. **Placement is a single pass in series order onto free cells only**, so no label displaces one already placed and the output does not depend on which of two independent labels was considered first. **A displaced label is marked with a one-cell `+` at the survivor and is never a legend entry**, which is I48's clause inherited rather than re-derived: a vertical legend sizes itself to its longest entry, that width sets `areaWidth`, `areaWidth` sets where samples land, and what collides sets what would be counted — *`+N`'s count needs the ink that needs the width that needs the column being sized.* **The legend is sized from series, segments and annotations alone**, all knowable before a label is placed. **I8 does not reach a dropped label**: it governs a series given no row, and a tile whose name did not fit is still drawn and still carries its extent — so a treemap tile with no padding ring drops its name and says nothing, and §3n's first wording said *counted* by borrowing an invariant one case too far. **A label draws over the data and an annotation line draws behind it** (C04 I23), because a reference line is a claim the curve is compared against and a name is the curve's own. **At one bit the leader survives and the identity does not** — `─ │ ╰` degrade to `- | +` through `linedraw.ts`'s ASCII table, so the arm at risk is `unicode` and it is already built. **The remedy this clause first named cannot fire and is struck**: it said a label takes its series' `markOf` glyph as a prefix *on the same predicate the swatch uses*, which is `colourDepth >= 4` — and above that floor colour separates the categories, while below it `positionalForm` stops overlaying and **stacks into strips the gutter already names**. Every form that accepts a point label is in `POSITIONAL_STACKS`, so the two arms meet with nothing between them. **The identity is carried at one bit, by the strip's own gutter label**, which is a mechanism that already shipped — and the prefix was a member that would have done nothing at any capability (§3ag). *The cycle is broken by this invariant and not by a signature, which is weaker than `measure`'s purity and is recorded as weaker* (§3ag).
- **I56** — **The abscissa is named in one declared row beneath its labels, and the forms that can carry one were measured rather than reasoned about.** `xTitle?: string`, drawn centred over the **plot area** — `layout.gutter` is the whole left offset, which is what `xLabelRowFor` one row above uses — truncated and never wrapped, because a second row would change a declared height (I1). **Below the labels and never above them**: the labels are the scale, and a name between a scale and the thing it measures separates the two. **The row is added by `titleRows` centrally**, on `legendRows`' recorded reason — every form that draws one pays it the same way, and thirty-six entries each adding the same term is thirty-six chances to forget one. **`HAS_X_TITLE` is total over `PlotForm` and every value in it was measured**: each form was rendered with a title and the frame searched for it, giving **26 true and 18 false** — and **16 of those 18 also broke `measure === rendered`**, because the row was declared and nothing composed it. So the record is not a taste, it is what keeps I1, and the **refusal is the mechanism**: a `true` in the wrong place is a block whose declaration and drawing disagree. *The matrix family is a named gap and not an omission* — a heatmap draws a column-label row a title could sit under, and wiring it is a change to that family's compositor. **`axes: false` is refused**, because a title for an axis that is not drawn names nothing and the alternative is a second placement rule for one member. **There is no `yTitle`**: rotated it is a column of single letters no terminal reader parses, horizontal above the gutter it is `xLabels`' shape and a second title member — and **a y-axis title is a heading, which C09 already has**, costing the same row and reusable by every kind. *The first draft offset the row by `labelColumn + AXIS_GUTTER` on top of the gutter and pushed it four cells right, off the area's centre and past its right edge into `clampSpans`' ellipsis; a row-width assertion cannot see that, because the row is exactly `width` either way* (§3ag).
- **I57** — **A tree is one drawing in three layouts, chosen to fit and never as a rung.** `tree` is the fourth reading of `hierarchy` and the first whose subject is structure rather than magnitude: it takes `label` and `children`, and **`value` is ignored** — optional on the node for it (C04 I64), with the answer beside the ruling in the member's own doc, because *put it in the name* costs nothing and a bare refusal leaves *a field that does nothing* reading as one not yet implemented. **Top-down Reingold–Tilford, left-to-right, and `tree(1)`'s indented outline**, with natural sizes `2·depth + 1` × `W(root)`, `leaves` × `Σ_d max label + 2·depth`, and `nodes` × `max(4·depth + label)` — where **`W(node) = max(cells(label), Σ W(children) + gaps)`**, because a parent's own name can be wider than everything beneath it and then the parent sets the width: measured at 20 columns against a plan formula's 5, with the leaf positions, the depth and the node total agreeing either way. **They are not a ladder, and `HAS_DETAIL_RUNGS.tree` is `false`.** Measured over four trees, the top-down figure is the cheapest of the three in rows on a broad tree (3) and the dearest on a deep one (13) while its columns invert with it, so no ordering by budget exists — **not even one that depends only on the budget**, since which layout is cheapest depends on the tree; and all three draw the same names and the same edges, which is I34's own test for a rung failed three times in the same way. **The choice is `treeLayout` and `"auto"` is a fit**: the first of top-down, left-to-right, outline whose natural size fits both axes, else the one that keeps the most nodes at the budget. **What does not fit is a `warn`-toned row inside the area** (I8), and **the row is spent before the choice rather than after it**, so the notice cannot remove itself by making the drawing fit — §3ag.4's cycle in a second place, ruled the same way. **Truncation runs before placement**, or a surviving parent is centred over a span that includes the subtree that is gone, with every count agreeing; and an edge is derived from the kept set rather than from `children`, which is that defect one pass along and a separate ruling because the first fix does not make the second. A fan is three orthogonal moves through `strokePolyline` and `glyphForMask`, **a fan of one is `│` and never a zero-length bar**, the outline's indent is four cells because `├── ` and `|-- ` both are, and edges are `tone.muted` with no categorical palette — **so I25 has nothing to carry here**, the name being the identity at every depth and drawn at every capability. `hierarchy` absent is refused at both gates and drawn as `emptyRows` on the third path, where a fixture reaches the renderer without passing either (I2).
- **I58** — **A graph is one drawing in one layout, and the layered pipeline is seven passes rather than the three it is usually named with.** Cycle removal, deduplication, longest-path layering, dummy nodes, ordering, x-coordinate assignment and painting — and *deduplication* is there because reversing `b→a` where `a→b` exists yields the same edge twice, drawn twice and counted twice, which was found by checking the instrument rather than by reading the recipe (F242, §3ai.1). **Two sweeps is a number chosen and best-kept is what makes it safe**: one sweep never hurts and cuts crossings four- to fivefold, two taken plainly is worse than one in a whole family — near-path *n* = 50, mean 36.5 to 38.1, worse in 17 trials of 40 — and keeping the ordering with the fewest crossings seen makes it monotone for one crossing count a sweep. Past two the gain is 3–6% where the first buys 80%, and at the sizes that fit a terminal it is already at the floor. **`force` is refused on the labels alone and the refusal has been moved once**: it rested on `strokePolyline` stepping orthogonally, which is a fact about the tool — `drawLine` strokes arbitrary angles at 2 × 4 — and what stands is 17.4% of label pairs overlapping at a third of the edges present, *n* = 20. **The same question asked of `layered` comes back clean structurally**: a layer's labels sit side by side with a gap, so an overlap is not expressible — zero in 360 graphs — and the failure mode is overflow, which I8's row answers. Its expiry is `shiftInward` and the label taxonomy, written as a symbol because a deferral names a condition and nothing watches it. **The figure does not claim direction**, because an arrowhead needs a glyph the set does not have and `▲`, `↑` and `↓` are ambiguous-width throughout; the layering carries it, and edges the cycle pass reversed are counted in the notice row rather than marked (§3ai.3). **The seventh pass was missing and the figure is what found it** (§3ai.6): every layer was centred on its own width, so a chain whose layers hold different numbers of nodes stepped sideways at each rung — 37, 35, 34 for one four-node chain — and the edges between them drew as staircases between nodes that belong in a column. Arithmetically self-consistent at every count, which is why nothing but reading it could have said so. The remedy is the phase Sugiyama names and the first build skipped: pull each node to the **median** of its neighbours, restore separation without reordering — the ordering pass owns that, and a placement that reordered would throw away the crossings it bought — alternate the sweep direction so neither end is privileged, and centre **once, on the whole figure** rather than per layer.
- **I59** — **Every decision above the shared coordinate is made once, and both arms read the same one.** Which mark, which orientation, which tick, which label, which furniture, which colour slot and what is dropped are members of a `Figure`; a renderer that computes one of them is a renderer that can disagree. *Measured before the rule: 73 of 135 cells over the 27 forms the SVG arm claims disagreed, 59 of them everywhere — and three of the five decisions disagreed on every ticked form in the corpus.*
- **I60** — **A form whose readings are not on an axis has no value axis, and the figure says so.** `value` is `null` for the matrix, tiles and nodes families, whose readings are colours, areas and structure. *This is not a tidiness rule: `matrix`, `tiles` and `nodes` each furnished an axis out of `seriesRange([]) ?? {0, 1}` in three separate commits, so a fourth renderer would have furnished a fourth. An absent axis is a decision with a reason, never an omission.*
- **I61** — **Positions are normalised and uninverted, and the facing is carried rather than assumed.** One decision about which end is zero and which way each axis grows, applied twice. *`svgPoints` passed `invert: true` unconditionally, so all four `origin` values were byte-identical and a block asking for a top-left origin drew flipped in one arm and unflipped in the other.*
- **I62** — **A mark names a role and a slot, never a glyph and never a colour.** `GlyphRole` is an exhaustive `Record`, so a rung with no entry is a compile error rather than a silently different character; `ref` stays unresolved so each arm calls `resolve()` at its own depth — one resolution rule, two depths.
- **I63** — **The shared layer states how much room a label has and never measures the label.** `room` is a fraction of the figure; the terminal turns it into cells and truncates, the SVG turns it into a `clipPath`. *§3aj hazard 4 says a shared layout that calls `cells()` cannot serve the image path, so the two arms cannot agree about which labels fit — measured, a `treemap` names five tiles in one arm and eight in the other. The threshold is shared and the outcome is each arm's.*
- **I64** — **`figureOf` is total, and a refusal is a figure with no marks.** No block throws, because a throw one level above the rasteriser abandons a half-built figure in the component whose claim is that both arms read the same one (I2, one level up). *How each arm refuses stays its own — `null` in SVG, empty rows in the terminal — because what must be identical is whether there was anything to draw.*
- **I65** — **A form whose datum is derived derives it once, above both arms.** `ecdf` replaces its samples with a sorted cumulative fraction and `density` replaces five of them with a hundred kernel estimates; both answer *what is drawn* and never *how*, so a derivation one renderer can reach and the other cannot is a second figure rather than a second rasterisation. *Measured before the rule: for one block the terminal drew `[0.2 … 1.0]` over 0–1 and the SVG drew `5 1 4 2 3` over 1–5 — an ECDF that descends, and a density plot with no density in it. Both functions were pure, written and living in rasteriser modules, which is the one place the second arm could not reach them (F268).*
- **I66** — **A claimed form's frame is a function of its data.** A form the renderer accepts draws something that changes when its readings change; ink on the page is `G7b`'s rung and this is the one above it. *Measured before the rule: `ecdf` draws one fixed staircase for every dataset of a given length — `ecdfSeries` reads its own `sort` only for `.length` — and the sweep that found it reports 16 unmoving frames of 178, of which **15 had no number to perturb** and were never asked (F269). A fixture that cannot answer reads exactly like one that answered well.*

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
41. **The y gutter is drawn on either side, or both** — a row cannot be tracked back to a label seventy cells away, and the mirror costs width rather than a row; the right gutter writes what the left was given, so two axes cannot disagree (I47, §3x).
42. **A callout writes each series' last value at that series' own row**, in that series' colour and with its own mark, placed by reading the ink rather than by recomputing a row the rasteriser would have put elsewhere (I48, §3x).
43. **A field is drawn as iso-lines, and the sixteen cases were already a table here** — the refusal grouped contour with sankey and chord and it inherited their disposition; marching squares is local, the derivation from corners to edges is four lines, and adjacent cells join by construction (I49, §3y).
44. **A vector field is drawn as arrows, with direction in the glyph and magnitude in the colour** — the ASCII arm required at wide ambiguous width as well as at ASCII, and magnitude stated as lost below 8-bit rather than degraded into a mark already spent (I50, §3y).
45. **The layers a field is drawn in are declared, and the two contrast remedies ship as options rather than as a refusal** — a glyph over a colormap competes on legibility and 45% of viridis clears the floor against white; `fieldDim` and `glyphInk` each name their own price, and both default off (I51, §3y).
46. **A horizon's two channels stop sharing one alphabet** — depth is colour and height is the vertical eighths, the fold mirrors because the downward repertoire is two glyphs deep, and a form that had no section in this document gets one (I52, §3z).
47. **A calendar learns what a date is** — the cell picks the grid and the span falls out of `startDate` + unit + length, so no span member is added and a member published in step 0 with four occurrences and no reader acquires one; the columns are uniform because they are the only cells in the family that have a duration (I53, §3ae).
48. **The alphabet is the terminal's and the style is the caller's** — one predicate at every decision, C02 §4's own substitutions, degraded and never refused; and the corpus stops varying `unicode` and `ambiguousWidth` together, which is what made a rule stated in three places contradicted at four sites for the life of the component (I54, C12 §3af).
49. **Six kinds of label become one pass with one collision rule** — two positions and never a slide, a single pass onto free cells, a one-cell `+` where one displaces another, and no label outcome that can widen the legend that decides where labels go; and the tick stays outside it, because *at* a coordinate and *near* one are different rules (I55, §3ag).
50. **The abscissa gets a name, in a row declared before the data and drawn only by the forms that were measured to draw it** — 26 of 44, with the other 18 refused because 16 of them would otherwise declare a row nothing composes; and there is no `yTitle`, because a y-axis title is a heading and C09 has one (I56, §3ag).
51. **A tree is one drawing in three layouts, chosen to fit** — measured over four trees rather than ordered into a ladder, because the cheapest layout depends on the tree and not on the budget; the choice is a member, the overflow row is spent before the choice so it cannot remove itself, and truncation runs before placement so no parent is centred over a subtree that is gone (I57, §3ah).
52. **A graph is one form with a layered layout, its pipeline is six passes, and its sweep count is a measured number rather than a recipe** (I58). `force` stays refused on the labels alone, with the label pass named as its expiry; the figure does not claim direction, and the reversed edges are counted rather than marked.
53. **One figure and two renderers — every decision above the shared coordinate is made once** (I59, §3ak). The seam moves from *value → [0,1]* to *value → a drawing*, and what was three defects found by building is 73 disagreeing cells found by looking.
54. **A form whose readings are not on an axis is given none, in the type rather than per renderer** (I60, §3ak). Three families furnished a false axis out of an empty range in three separate commits; `value: null` is what stops the fourth.
55. **The inversion is decided once and applied twice, and the figure carries the facing** (I61, §3ak).
56. **A mark carries a role and an unresolved slot, so neither arm holds a glyph or a colour** (I62, §3ak). The role table is exhaustive, so a missing rung fails to compile in both arms rather than drawing a different character in one.
57. **The label allowance crosses the seam and the label does not** (I63, §3ak). §2 asked for the same labels dropped and hazard 4 forbids the measurement that would achieve it; the threshold is shared and the truncation is each arm's.
58. **A figure is total and a refusal is an empty one** (I64, §3ak). F259's *refuse a false figure, record an incomplete one*, expressed as a type rather than as a clause in two renderers.
59. **The datum a form draws is derived once, above both renderers** (I65, §3ak.7). A derivation inside one arm's dispatch table is a figure the other arm cannot reach: `ecdf` and `density` drew their raw samples in SVG while the terminal drew a cumulative fraction and a kernel estimate — D14's shape found a second time, by walking a family rather than a form.
60. **A form that is drawn is drawn from its data, and a sweep says so rather than a reader** (I66, §3ak.8). `G7b` asks whether a claimed form puts ink on the page; `ecdf` passes it and draws the same picture for every dataset. The rung above is the one a golden frame, a disagreement matrix and a mutation on dead code all structurally cannot reach.

---

## 9. Tests

Six tiers. No state machine — C12 is pure over the block.

### Tier 1 — unit

- **AA1** (I54, §3af): **the whole corpus, at both ASCII arms** — every catalogue form × variant rendered at `unicode: "ascii"` with `ambiguousWidth` at each value, asserting every codepoint is under 128. One assertion rather than a row per form, because the four sites were four different mechanisms and what they share is the output. It is the row that would have caught all of them, and the measurement it replaces is 49 of 159 and 24 of 159.
- **AA2** (I54, §3af): a `line` plot at `ascii · narrow` draws a **connected** figure in `+ - |` — asserted as *no codepoint above 127* **and** *a `+` appears where the curve turns*, because falling back to the density ramp satisfies the first and loses what `plotStyle: "line"` means. The paired row is the same fixture at `unicode: "full"`, which must still be `╭─╯`.
- **AA3** (I54, §3af): `plotStyle: "braille"` on a violin and an unstyled `contour`, both at ASCII, render in the ramp and **do not refuse** — the block is valid, the document renders, and only the alphabet changed (I18's precedent).
- **AA4** (I54, §3af): `expectDocument(doc).degradesToAscii()` **passes** for a document holding a line plot, a contour and a two-series bar with a legend. The framework's own published contract, exercised against the forms that broke it — and the *fixture responds* control is the same assertion at `unicode: "full"`, which must find the non-ASCII it is supposed to allow there.
- **HZ1** (I52, §3z): band depth reads from the colormap and not from `ladderFor("density")` — asserted as *the glyph alphabet is the eighths at every band* plus *two bands differ in colour*, because a run that changed only the ramp would pass an assertion about colour alone.
- **HZ2** (I52, §3z): at `height: 1` a series sweeping one band renders **eight** distinct glyphs. The row the shipped form fails: it renders one, and no assertion about band count can see that.
- **HZ3** (I52, §3z): a negative value mirrors upward and takes the other half of the diverging map, asserted against a fixture that crosses zero — and the paired row that a sequential `colormap` is **refused**, which is where the sign would otherwise be silently lost.
- **HZ4** (I52, §3z): below `colourDepth: 8` the glyphs come from the **density** ladder and `bands` still separates them — arm A, settled by the frames. **The paired row is the one that matters**: at `height > 1` the row count still carries height, so a mutation collapsing the grid to one row per column fails here and not in HZ2, which only looks at `height: 1`.
- **HZ5** (I52, I16): a reading at the range minimum draws ink. **A fixture that can respond to it first**: `sin50` reaches its minimum at two adjacent columns in three shipped frames, which is where the two-cell break came from.
- **HZ6** (I52, I19): `legend: false` on a horizon is refused at both gates, **with both controls** — a diverging map is accepted and a sequential one is accepted on unsigned data, because a refusal that fires on everything refuses nothing.
- **HZ7** (I52, §3z H7): the legend row is declared, spent and drawn — `plotHeight` accounts for it, the rendered frame is that many rows, and the last of them is the scale. **The row the mutation pass asked for**: setting `FURNITURE_ROWS.horizon` to 0 leaves the grid untouched, so every geometry row passes while `composeRows` cuts the scale off the bottom. A test that calls the mechanism misses the wiring.
- **YA1** (I47): `yAxis: "both"` renders the same tick values on both sides, from **one** `yLabels` call — asserted as equality of the two label sets rather than as each being correct, which is the half a per-side assertion cannot see.
- **YA2** (I47): `yAxis: "right"` draws no left label column and the plot area starts where the border does; the labels are the same strings `"left"` puts on the other side, at the same rows.
- **YA2b** (I47): at `yAxis: "right"` the left border is `│` on every row and never `┤`, with the converse asserted on the same fixture with the axis left. **The row the mutation pass asked for**: YA2 compares the gutters' *contents*, which are empty on that side either way, so it passes against a border still drawing a stub that points out at a column zero cells wide.
- **YA3** (I47, I1): `plotHeight` is identical across all four `yAxis` values at every form that has a gutter. Width only, and the row that would fail if a mirrored gutter ever took a row.
- **YA4** (I47, §3f): at `ambiguousWidth: "wide"` both axis columns stay straight, asserted on a label carrying an ambiguous-width character — the case §3f's four gutters got wrong on one side and would now get wrong on two.
- **YA5** (I47, I27): `yAxis: "both"` with `legend: "right"` puts the legend **outside** the axis, and the frame's own rows line up with the area rows beside them.
- **YA6** (I47): the ladder drops the right label column before the left, asserted at the width where only that rung binds — 11 cells at a four-cell label, where `"left"` keeps its labels and `"both"` has already lost its right column.
- **YA7** (I47, I18, I26): a heatmap's row names mirror into the right gutter; `plotFrame: "rule"` draws the right label with **no** edge glyph beside it, which is the cell where mirroring the left gutter's glyph would have drawn the rule that style is defined by not having.
- **YC1** (I48): one callout per series, at that series' final sample's row, in that series' colour — asserted over three series whose last values land on three different rows, so a rule keying every callout to one row passes nothing.
- **YC2** (I48, I37): the callout's row is the row of that series' **ink**, asserted at a value inside the band where the cell-resolution mapping disagrees with the braille fold. The row that separates reading from recomputing; a fixture whose last value avoids that band agrees with both.
- **YC3** (I48): a callout sharing a row with a tick takes the right gutter and **leaves the left tick standing**, asserted at `yAxis: "both"` where both are visible in one frame.
- **YC4** (I48, I8): two series ending on one row — the later wins and a `+` marks the loss, and the frame carries exactly one number on that row rather than two rows or a silent drop.
- **YC5** (I48, I1): `plotHeight` is identical with `yCallout` on and off.
- **YC6** (I48): the value goes through `formatReadout` and honours `yFormat` — asserted on a percentage and a byte count, which a bare-number assertion agrees with.
- **YC7** (I48): the refusals, at **both** gates and each with its converse — `yCallout` with `yAxis: "left"`, on a form outside `HAS_CALLOUT`, a non-`"left"` `yAxis` with `axes: false`, and `yAxis: false` on a matrix.
- **YC8** (I48, I25): at `colourDepth: 1` a callout's row differs from a tick's by **mark**, asserted on the colour-stripped row and against a series whose mono class is `emphasised` — the case where bold says nothing because the series is already bold.
- **YC8b** (I48): at `colourDepth: 1` with two series the plot stacks into labelled strips, and **each strip still carries its callout** — the gutter is asserted to hold the series names first, so the row is shown to have reached the stacked arm at all. **The arm, not the mark**: YC8 calls the mechanism and passes on the day nothing calls it, which is what the mutation pass found by deleting the stacked arm's resolution and watching YC8 stay green. This is the capability `yCallout` would otherwise have been accepted at and ignored at.
- **YC9** (I48, I4): a series ending in `null` puts its callout on the last **finite** sample's ink, and names that sample's value.
- **CN1** (I49): each of the sixteen corner configurations resolves to the glyph the derivation gives — asserted against `glyphForMask`'s own table rather than a copy of it, because a second table is the thing the derivation exists to avoid.
- **CN2** (I49): the saddle resolves by the cell's centre value — asserted on the **braille** arm, where the two resolutions occupy different sub-cells. Paired with **CN2b**, which asserts that `plotStyle: "line"` collapses both to `┼`: the ruling has no subject on that arm and the pair is what says so rather than a comment.
- **CN3** (I49, I25): two levels render in distinct colours above one bit and in distinct **dashes** at one bit on the braille arm. Paired with **CN3b**: the `"line"` arm at one bit has no level channel, asserted as the two levels being indistinguishable, so the loss is a row rather than a sentence.
- **CN4** (I49): a field with no variation draws no contour — not a full grid and not an empty area. The field still paints and the legend still names the levels.
- **CN5** (I49): levels not declared are derived by `niceAxis` over the field's range, and are the same numbers the y gutter would tick.
- **CN6** (I49): adjacent cells join — no cell claims an edge its neighbour does not. Asserted over the whole area, because the property is *by construction* and a row testing one junction tests the derivation against itself.
- **CN7** (I49, I27): a level is named in the legend and appears nowhere in the plot area.
- **CN8** (I49): two levels crossing one cell union their masks and emit a tee — the glyph a single-level pass cannot produce.
- **QV1** (I50): eight directions map to eight glyphs.
- **QV2** (I50): magnitude maps through `continuousColour`, asserted **where the field carries a different scalar** — written against the default it asserted the double encoding QV9 forbids, and passed.
- **QV3** (I50): a zero-magnitude cell draws no arrow, and the field colour beneath it still reads — both halves, because a blank that also lost its background is a different defect that passes the first half.
- **QV4** (I50, I9): the ASCII arm renders all eight directions in an identical cell grid.
- **QV5** (I50): at `colourDepth: 4` **and** at 1, direction survives and magnitude does not — asserted at both depths, because the claim was written about one and holds at two.
- **QV6** (I50, C02 I9): `ambiguousWidth: "wide"` on a **unicode** terminal takes the ASCII arm. `art.ts:eligible()`'s third consumer, and the row is on the conjunct that is easy to drop.
- **QV7** (I50): a `null` vector is a gap and draws nothing, distinct from a zero-magnitude cell only in that the field beneath it is also absent.
- **QV9** (I50): an arrow is never drawn in its own cell's background colour. Asserted on the SGR, because both readings produce an identical stripped frame — the defect that shipped was an arrow at zero contrast with the cell behind it, and nothing else in the suite could see it. Paired with QV2: **either row alone is satisfied by a constant**, one by never colouring an arrow and the other by always colouring it the same.
- **LY1** (I51, I44): `layers` draws in declared order, last on top — asserted through the merge, so it covers the reversal at the seam and not the array.
- **LY2** (I51): `["field","contour"]` and `["contour","field"]` are **byte-identical**; `["contour"]` differs from both. Membership is load-bearing and position is inert, and the second half is what makes the first an assertion rather than a tautology.
- **LY3** (I51, I44): a contour under a quiver shows wherever no arrow lands.
- **LY4** (I51): `layers: []` renders the field alone.
- **LY5** (I51): below `colourDepth: 8` the field yields to a contour entirely — asserted at 4-bit, where the interaction exists and every frame above the floor is silent about it. **The first version of this row was vacuous**: it compared against a ramp character set containing no braille, and the ramp below the floor *is* braille, so *no cell carries both* held over an empty set.
- **LY6** (I51): `fieldDim: "floor"` clears 4.5 : 1 on **every** sample of viridis, inferno and coolwarm — run against the shipped dimming rather than the constants, because the per-map figures are the claim.
- **LY7** (I51): `glyphInk: "contrast"` picks black or white per cell against that cell's own background, and QV2's magnitude reading is gone — the price asserted beside the remedy.
- **LY8** (I51): `fieldDim: "floor"` below `colourDepth: 8` changes nothing, because there is no background to dim.
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
- **CS3** (I36): `candleWidth` is `clamp(⌊areaWidth ÷ n⌋ − 1, 1, 5)`, the wick is centred at an odd width and left of centre at an even one, and **two adjacent candles never touch above the one-cell budget**. Asserted at a width where the clamp binds and at one where it does not, and at the budget where the gap is unaffordable. **The pitch clause is gone rather than restated**: it read *`min(⌊areaWidth ÷ n⌋, candleWidth + 1)`* and described `pitchFor`, which §3r struck — a row naming a function the tree no longer has is a row that passes because nothing can reach it.
- **CD1** (I36, §3r): 32 bars in a 74-cell area draw ink to column 74. **Written about the number the frame reported** — `line-candlestick-24bit` drew 64 and left ten columns blank — rather than about the expression, so a second way of getting the placement wrong fails it too.
- **CD2** (I36, §3r): four bars in 74 columns fill it as well. **Two causes and one expression**: the remainder shortfall is at most `n − 1`, and `MAX_CANDLE` is unbounded — above `⌊w ÷ n⌋ > 6` the old pitch capped at 6 and the extent was `6n` however wide the area, so four bars drew 23 of 74. A row asserting only the remainder passes against that.
- **CD3** (I36, §6b B15): bodies never differ and gaps differ by at most one, at five width × count pairs. B15's concern is a candle wider than its neighbours reading as a datum, and the remedy the old code took — the remainder into the *pitch* — was the wrong half of it.
- **CD3b** (I36, §3r): the drawn extent never shrinks as a bar arrives, over `n = 2…80` at 74 columns. **The measured falsification of *growing rightward***: left-anchored it fell at five of seventy-nine arrivals, worst at `n = 37 → 38` where 73 columns became 38.
- **CD4** (I37, §3s): the column `candleColumn` names carries that candle's ink, at four width × count pairs. **Asserted against the frame rather than as equality of two expressions**, because the claim a reader depends on is that the crosshair points at the candle — and the x-axis ticks are a third caller of this placement (`furniture.ts:xRowFor`), so two copies would let ticks and candles disagree with every count still adding up.
- **CS4** (I36): more bars than columns aggregate — open of the first, high of the maxima, low of the minima, close of the last. **Asserted against a series whose extreme falls on a bar that sampling would drop**, since an aggregation that happens to agree with sampling tests nothing.
- **CS5** (C04 I57): `plotStyle: "candlestick"` with no `ohlc` is refused at construction, by both gates.
- **CS6** (C04 I57): `plotStyle: "candlestick"` on a form that is not `line` or `step` is refused, by both gates.
- **CS7** (I36, §6b B6): the readout carries all four values and then each overlay series, formatted through `yFormat` rather than a hand-rolled rounding — and a cursor past the end of `ohlc` reads **four** dashes. **Asserted on `yFormat` rather than on the rounding**, which is the half a rounding assertion cannot see: `Math.round(v × 100) ÷ 100` and `formatReadout` agree on `12.64` and disagree on whether it is a percentage, so a mutation restoring the old line survived twelve assertions.
- **CS7b** (I36, FINDINGS F182): `formatReadout`'s numeric arm keeps the digit the producer sent — `45.2`, not `45` — and does not manufacture one: `1284` stays `1284`, and a computed value stops at **four significant figures** rather than at a decimal cap. A flat six places is right for `0.023` and prints a sine as `55.827460`, which a catalogue frame is what showed. The four values of one readout share **one** precision (F177), which is a claim only a caller can make and is why `readoutSet` takes a set rather than an argument.
- **CS8** (I36): a wide terminal fits the **same** number of candles as a narrow one and draws them `= # |`, and the frame is exactly its declared width at both. **The row that would have asserted the conflation**: its first form said *half as many*, which is what the section said before `glyphs()` was measured — and the reason the golden frames carry both widths is now that the two agree.
- **T1.100** (I33): a band whose `q3` equals its `max` draws no stub at the box's right edge, and one whose `q1` equals its `min` draws none at the left — `│` on the spine, `─` on the vertical arm's lid. **Asserted at the degenerate end and at the ordinary one in the same row**, because a fix that removed every stub would satisfy an assertion written only about the collapsed case. The ASCII arm cannot express the difference — every box-drawing glyph collapses to `+` — so the row states that rather than asserting a distinction the alphabet does not have.
- **T1.101** (I55): a point label whose right position would leave the area is drawn **left** of its sample, and the sample's own cell still carries its mark. **Both halves in one row**, because a slide that stopped one cell short of the edge satisfies *inside the area* and covers the anchor — which is the reading the two-position rule exists to refuse. The fixture responds first: the same label one column further in draws to the right.
- **T1.102** (I55): two labels whose spans overlap give the first placed, a one-cell `+` on it, and nothing of the second — and the same block with the series **reversed** gives the mirror answer. The second half is the row: a rule that let a later label displace an earlier one passes the first half and returns a different frame for the same data in the other order.
- **T1.103** (I55): a block whose labels all fit and the same block with three of them dropped render legends of **identical width**, at four widths. The cycle §3ag.4 records is only observable as an equality, because a legend that grew by a count would still be a legend that renders.
- **T1.104** (I55, §3n) — `TM1`–`TM5`: every leaf with a wide enough run is named at 80 columns and **at `ascii` and one bit**, which is where the form previously said nothing at all; an interior node covered by its children is not named and the frame carries **no notice, no `+` and no legend row**, since a count reaching any of the three is the I8 over-application §3ag A4 struck. **Each absence row carries a positive assertion in the same frame**, or all three pass on a renderer that names nothing. **`TM5` came from a survivor**: removing the wide-codepoint continuation cell killed nothing, because every label in every fixture was narrow — so the rule *a two-cell character consumes two cells* was true of nothing the suite drew, and the row asserts `cells(row) === width` rather than the name alone.
- **T1.105** (I55) — `TL1`, `TL2`: the callout rows are **identical** for `"last"`, `"name"` and `"both"` at eight heights, which is the claim that they are one mechanism rather than three that land together on one fixture; `"both"` writes the name first and ends on the number; and two series ending on one row give the later plus a **one-cell `+`**, asserted as `not /\+\d/` because `+N` is what I48 refused.
- **T1.106** (I55) — `TL3`: `"name"` and `"both"` suppress the automatic legend and `"last"` does not, asserted **at `legendPlacement` and in the frame** — the rule says what was decided and the frame says the decision reached the render, and a seam-level row passes on the day nothing calls it. An explicit `legend:` still draws, asserted as a frame **inequality** rather than by looking for a swatch.
- **T1.107** (I55, C04 I60) — `TL4`, `TL5`: every drawing arm reaches both refusals — no right gutter, and a form with no per-series curve — with `"none"` and absent refused by neither and an unknown value named against all four. **These refusals had no test at all**: reverting the gate to `yc !== "last"` killed nothing, so a rule shipped in `validate.ts` was never once run, and the mutation pass is what asked. `TL5` is the second survivor — an unlabelled series takes the legend's own `series N` wording, or two blank callouts are told apart by colour alone (I25, in the gutter instead of the swatch).
- **T1.108** (I55, I6) — `TL6`: below the colour floor `"name"` writes no callout and `"both"` writes exactly what `"last"` writes, cell for cell. **The fixture responds twice**: the names are still present from the strips, and the same block above the floor does draw callouts.
- **T1.109** (C04 I52, I55) — `TL7`–`TL9`: a one-series plot with one labelled reference line draws the label, which is the case C04 I52 was written about and the case counting series answers `null` for; a `lollipop` gets the row too, because `SHARES_CELLS` is about categories and a label is not one; the swatch is `┄`, the dash the line is actually drawn with, rather than a category mark from a ladder the annotation is not drawn from; and three refusals — a label with `legend: false`, a label on `confidence` or `whiskers`, and a label that is not a string. **The unlabelled frame is asserted on the glyphs and not on a length**: the labelled frame is the *shorter* string, because the legend takes columns from the plot area.
- **T1.110** (C04 I52): `bar` is `SHARES_CELLS: true` and would have passed T1.109's form row while proving nothing. Recorded because the first draft used it — **a fixture that agrees with both readings tests neither**, and the partition's own table is what said which form to reach for.
- **T1.111** (I55, C04 I63) — `TL10`–`TL15`: a label with room draws one blank right of its sample; one at the right edge **flips left and the sample's own cell keeps its ink**, asserted together because a slide that stopped a cell short satisfies *inside the area* and covers the anchor; a second label takes the free side rather than dropping, and a third with both sides taken is dropped with a **one-cell `+`** on the survivor, asserted `not /\+\d/`; the frame differs when the series order is reversed, which is what *first placed wins* means; the names reach the 1-bit stacked arm per strip; a wide codepoint leaves every framed row exactly `width`; and three refusals — more labels than values, an entry that is neither string nor `null`, and a form whose sample is not drawn at its own value.
- **T1.112** (I55): **there is no mark prefix at any capability**, asserted as an absence at both `FULL_CAPS` and `MONO_CAPS` with a positive control in the same frame. The row exists because I55 named a remedy before it was reachable, and an arm that cannot fire reads exactly like one that is satisfied — A03 §2's vacuity class in a member rather than a rule.
- **T1.113** (I56) — `TL16`–`TL18`: the title costs exactly one row and it is the **last**, with the row above it asserted *not* to carry it; `measure` equals the rendered count; it is centred on the plot **area**, asserted with a title two cells narrower than the area against the frame's own border columns, because area-centred and row-centred differ by the gutter and no short title separates them at any tolerance that is not itself a guess; a long title's **last inked column** stops at the area's right edge, asserted as a position rather than as a remaining width; it survives ascii; and it stacks with `legend: "below"`.
- **T1.114** (I57): `TR1` — the three natural sizes are the formulas, over the four trees §3ah.1 measures. **The wide-parent tree is the row that carries it**: `W(node)` without the `max` gives 5 columns where the measurement gives 20, and the leaf positions, the depth and the node total agree in both — so a row asserted on the catalogue's tree alone passes against the wrong formula.
- **T1.115** (I57): `TR2` — `"auto"` takes the first layout that fits both axes — asserted at three budgets each chosen where **only one** layout fits, plus a fourth where none does and the winner is the one keeping the most nodes. The budgets come from §3ah.1's table rather than from the implementation.
- **T1.116** (I57, I8): `TR3` — a tree larger than its budget draws what fits plus a `warn`-toned `+N` row, and **the count differs between two layouts of the same tree in the same box** — which is the assertion that the count is the layout's drop sequence and not a property of the tree.
- **T1.117** (I57): `TR4` — the notice's row is spent before the choice. A budget where the drawing fits in `rows` and not in `rows − 1` draws the notice and does **not** re-choose, so the notice cannot remove itself.
- **T1.118** (I57): `TR5` — truncation runs before placement — on an asymmetric tree whose last subtree is dropped, every surviving parent sits over the span of its **remaining** children. Asserted on the frame, because the node total, the depth and the leaf count agree under both orders.
- **T1.119** (I57): `TR6` — a fan of *N* resolves `┬ ┴ ├ ┼` through `glyphForMask`, and **a fan of one is `│` with no bar** — the two cases differ in the frame rather than in a count.
- **T1.120** (I57, I9): `TR7` — the ASCII arm draws `+ - |` and `|-- ` in the same cells as the Unicode arm, the outline's indent being four in both alphabets.
- **T1.121** (I57): `TR8` — a single-node tree draws one name, no edge and no notice, **and the three layouts produce identical frames** — the row exists to keep a fixture honest, since a single node discriminates no layout at all.
- **T1.122** (I57, C04 I64): `TR9` — `value` changes no frame — two trees differing only in it are byte-identical — **and `label: "gc (2.1s)"` does change it**, which asserts the workaround rather than describing it.
- **T1.123** (I57): `TR10` — every node drawn is named once, no name twice, and every parent sits over the span of its own children — on an asymmetric tree where a midpoint and a first-child position differ, so the two placements are not satisfied by one assertion.
- **T1.125** (I57): `TR13` — the outline's *last child* glyph is read from the **real** sibling list: a node whose later siblings were truncated still draws `├──`, and the last one drawn keeps its `╰──` where the claim is true. **Found by reading the overflow frame** (§3ah.8a), and the row records the arm it could not have been found on — at `unicode: "ascii"` both forms substitute to `+`, so no frame there distinguishes them.
- **T1.124** (I57): `TR11` — a wide codepoint in a label is measured with `cells()`, and the cell behind it is not written into (§3n, T1.104).
- **T2.9** (I56): **`HAS_X_TITLE` is re-measured rather than trusted** — every `true` renders its title and keeps `measure === rendered`, every `false` is refused at the gate, and the count of drawing forms is asserted at 26 so the sweep cannot pass against an all-`false` record. This is the row that makes the record safe to edit.
- **T2.10** (I34) — `PD1`–`PD3`: every form with no ladder refuses `plotDetail` at **both** gates, for all three values, with the count asserted at **42** so the row cannot pass against an all-`true` record; `boxplot` and `violin` still accept all three; **absent is accepted everywhere**, which is the row that says why the defect was invisible; and `HAS_DETAIL_RUNGS` agrees with `RUNG_FORMS` form for form, read from `definition.ts` rather than restated, so the two halves cannot both be a copy of one mistake.
- **T2.11** (I57, I34): `TR12` — `plotDetail` is refused on `tree` at both gates and `HAS_DETAIL_RUNGS.tree` is `false` — B1's record answering its first new question, and answering it in the negative.
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

#### The arm unification rows (§3ak, I59–I66)

**The emitters land one family at a time and their rows land with them** — `FC` curve, `FS` scatter, `FB` bar, `FM` matrix, `FD` distribution — because a family is the smallest unit in which the disagreement matrix's cells are jointly satisfiable (§3ak.7). Every one of those commits reports the same gate: **1780 baseline frames compared, 0 moved**, and the catalogue at `64b8845e6408c819`.

- **FV1–FV3** (I60, §3ak): **`HAS_VALUE_AXIS`' true direction over the corpus** — a form marked `false` never draws a numeric gutter label, at both widths and every capability set, with the count of forms checked reported rather than assumed. **`FV1` failed on the commit that introduced it**, four offenders, against a record its own author had just written (F267). `FV2` refuses the converse — a form marked `true` need draw no numeric label, because whether the gutter holds values is orientation and rung — and `FV3` pins the strings the axis carries, so the arm that stopped computing them cannot start again.
- **DS1–DS4** (I66, §3ak.8): **every catalogue fixture rendered twice, with its numbers moved by a position-varying factor** — a uniform scale leaves a normalised figure identical and a reversal leaves a histogram identical, and neither is a defect. `DS2` is the row that makes `DS1`'s number mean anything: the exempt set is the fixtures with **nothing to perturb**, compared by equality, and it is 15 of the 16 unmoving frames. `DS3` is the fabricated violation — a comparison that never reports equality reports every form as moving, on any corpus. `DS4` names `ecdf`'s mechanism, so a repair that moves the frame for the wrong reason still has to face it.
- **FC1–FC9** (I59, I61, I64, I65, §3ak.7): **the curve family's emitter, and the terminal reading it back.** `FC1` is the seam's claim as an assertion — a mark's `y` and `rowOf`'s row are one coordinate with the facing applied once each side, which no frame shows because a frame wrong in both arms is a frame that agrees. `FC2` breaks a run where the samples stop being consecutive; `FC3` composes the legend once and projects the swatch twice, at two capability rungs; `FC4` refuses with an empty list rather than a throw, including the pinned-bounds case where an axis exists and nothing was measured; `FC5` asserts the figure describes the block that is **drawn**; `FC6` holds the decisions and the marks apart, so no caller can hold a figure with another family's marks on it; `FC7`–`FC9` came from the mutation pass — **the orientation, the mark's own slot and the scale each had a row named after them and no assertion in it**, and `FC9`'s subject is a unit block because no rendered fixture anywhere constructs a `yScale` (F270).
- **FS1–FS3** (I59, I62, §3ak.7): **the scatter family, whose decisions are the curve's** — both reach `positionalForm`, so the extent, the nicing, the tick count and the facing are one computation and only the marks differ, which is what makes a *family* the unit rather than a form. `FS3` carries the size channel: a bubble's radius **is data** and crosses normalised against the size series' own maximum, where a scatter dot's radius is each renderer's and does not. **It also asserts F271** — the channel is a member of `series`, so the terminal draws it as a second bubble series and the figure says so; correcting that here would be a divergence no commit announced, and the row fails the day the channel stops being a series.
- **FB1–FB5** (I59, I62, I64, §3ak.7): **the bar family, where `identity` stops meaning the series.** The member is *what the figure's slots are named* — a curve's are its series, a bar's its categories — so the legend and the identity are one list there and **two** here, and `FB1` asserts both answers side by side so the difference is on purpose. `FB2` holds the zero-anchored extent (`[10, 25, 15]` anchored at 10 draws nothing for its first category); `FB3` is D11, the orientation the two arms defaulted opposite ways; `FB4` puts the rects in the **figure's** space rather than the screen's, `x` along the identity axis whatever the orientation says — and **asserts F272**, that both terminal arms fill from the range floor so a signed bar chart draws no negative bars. `FB5` keeps the identity through a refusal.
- **FM1–FM4** (I60, I61, I62, §3ak.7): **the matrix family, where `value` is `null` and `extent` is not** — the pair is the family's whole shape. Three renderers furnished an axis out of `seriesRange([]) ?? {0, 1}` over readings that are colours; there is no axis, and the *ramp* still has a domain, so `FM1` holds both halves. `FM2` carries the type's one extension: a matrix cell has no length and no position to spend on its value, so **the reading crosses on the mark** — `point.size`'s argument one mark along — and each arm turns it into a colour at its own depth. `FM3` pins the family's own facing default, reachable from two files before it was decided once. `FM4` takes the identity from the **gutter**, because an unlabelled row is `""` there and `row N` to the overflow notice twenty-five lines away, and `series N` to the positional families — three answers to *what is this row called*.
- **FD1–FD5** (I59, I62, I64, §3ak.7): **the distribution family, and the reason `GlyphRole` exists.** A median is `┃` at full unicode, `|` in ASCII and a distinct mark below the colour floor; a mean is a different character; an outlier a third — and the SVG draws a line and two circles. What both arms agree about is **which of the seven things this is**, which is the whole content of the seam here. `FD2` holds `quartileRange`'s two arms: a boxplot's extent is the whiskers plus outliers, a forest plot's is the interval, because a confidence bound can reach past the observed range. `FD3` is `absent` — `normalisedSummary` falls `centre` back to the median, so the *summary* cannot say **nothing was reported** and the role is what does, which is how the SVG refuses where the terminal draws.
- **FT1–FT3 · FN1–FN2** (I60, I61, §3ak.7, §3aj.6): **tiles and nodes, and the two families that end differently.** `FT1` is the distinction that makes `extent: null` a statement: a matrix has no axis and its **ramp** still has a domain; a tiles figure reads its numbers as **areas**, and an area is the reading itself — `hierarchy.ts` divides by the total while it walks. `FT3` records that the facing is **live** here where the matrix's is dead (F273), because these three forms declare `ORIGIN_DEFAULT: null`. **`FN1` asserts that there is no `nodesFigure`**: §3aj.6 ruled that a tree's placement is a function of its labels' widths in one arm and of slots in the other, so a `Mark` — which is a position — would carry one arm's answer and the other would fail `U1b` for a reason the type cannot express. `marks: []` is not the alternative, because I64 makes an empty list a **refusal**.

- **AD1–AD5** (I59, §3ak): **the disagreement matrix, and it is walk artefact A** — every form, every variant, both widths, at 24-bit, with each cell's disposition stated as *the relation the row asserts*: `agree` fails if the arms drift apart, `n/m` fails if it closes silently **or becomes a different disagreement**, `legitimate` fails if they ever start agreeing. Shipped ahead of the type, because the list of disagreements is what the type is designed against. `AD5` corrupts one side and requires the comparison to see it, since a sweep certified only by its own record agrees with itself whatever it does.
- **U1a** (I59, §3ak): **a decision mutated inside `figureOf` moves BOTH arms.** *The row U1 was written as — `the same block yields an identical Drawn[] for both arms` — is `f(x) === f(x)` the moment one emitter serves both, which is A03 §2's vacuity class arriving in the assertion the pass exists for.* One arm moving alone is the finding: the other still decides it itself.
- **U1b** (I62, §3ak): **each arm's output is a faithful projection of the figure** — every `Drawn` appears as an element in the SVG and as a glyph at the mapped cell in the terminal. This is what catches *the shared layer says a diamond and the terminal draws a comma*.
- **U2–U3** (I59, §3ak): identical across every form in `ONE_PER_FORM` and every variant the catalogue holds, including both data shapes where a form has two.
- **U4** (I62, §3ak): identical across themes, because the refs are unresolved — a theme change moves nothing in the figure.
- **U5** (I59, §3ak): the SVG arm's figure is identical at every capability set, because it has no ladder.
- **U6** (I59, §3ak): **the terminal's figure is identical at every capability set, and where its *projection* differs the difference is a stated rung** — which is walk artefact B, the trace, and the degradation audit this component has never had. The capability sets supply the events a table cannot.
- **T1–T5** (§3ak, §6b): the terminal arm is byte-identical throughout — `TB1`–`TB5` over 1780 baseline frames crossed on width as well as capability set, plus the glyph-per-role, 1-bit strip, truncation-ladder and `ambiguousWidth` rows named in the rung table.

### Tier 2 — contract / interface

- **T2.1** (I2): a fuzz corpus — empty, single, constant, non-finite, 100,000-point, negative, mixed-sign, denormal — rasterises without throwing, at every width from 1 to 200.
- **T2.2** (I1): the C09 generic measurement suite passes for `plot` at all seven widths.
- **T2.3** (I10): for every corpus entry, no output row exceeds `width` cells and no output exceeds the declared row count.
- **T2.4** (I9): for every corpus entry, Unicode and ASCII forms produce identical row and column counts.
- **T2.5** (I11): a source scan finds no mutable module state in `plot/`.
- **T2.6** (I12): `plot` is registered via `registry.register`; removing the call removes the kind.
- **T2.7** (I2): rasterisation called a hundred times on the same input returns identical output.
- **T2.8** (I55): every kind in §3ag.1's table either resolves to a placement or is refused at construction — a sweep over the table's own rows, with `segment` asserted **refused** rather than skipped. A kind added to the vocabulary and to no renderer fails this row, which is the member-nothing-draws class caught at the partition rather than per form.

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
- **T3.18** (I55): a label wider than the whole plot area is dropped at both candidate positions and marks nothing — there is no survivor to carry a `+`, and a rule that emitted one would be pointing at a label that does not exist.
- **T3.19** (I57, I2): `form: "tree"` with no `hierarchy` — refused at both gates, and the renderer called directly draws `emptyRows` at the declared height rather than throwing. The third path is the row, because a refusal at two gates reads as a guarantee at three.

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

- **T6.55** (I54): returning `lineDrawRows` to a table chosen from `corners` alone → AA1 and AA2 fail. **The state it shipped in**, twelve lines above an `ASCII` table whose comment says every caller was emitting box-drawing regardless of capability.
- **T6.56** (I54): `styleRasteriser` reading `ambiguousWidth` again instead of `unicode` → **AA1's narrow arm fails and its wide arm does not**, which is the whole of F212 as a single row: the two capabilities agreed in every fixture the corpus had.
- **T6.57** (I54): the contour or the violin choosing braille from `plotStyle` alone → AA1 and AA3 fail. Two sites, one row, because the mutation is the same expression twice and a separate row would assert the same thing.
- **T6.58** (I54): the catalogue's ASCII arm returned to `ambiguousWidth: "wide"` → **AA1 still passes**, and that is the row's content: the corpus is not the gate, and a fixture that varies two capabilities together cannot be made into one by adding frames.
- **T6.59** (I55): the two-position rule replaced by a slide that clamps the label's span into the area → **T1.101 fails**. The frame still renders and still fits, which is why the row asserts the anchor's own cell.
- **T6.60** (I55): a dropped label made a legend entry → **T1.103 fails**. Nothing else does, and that is the point: the cycle is a width equality and every assertion about correctness survives it.
- **T6.61** (I55, §3n): four mutations in `c12-tile-labels.mjs`, all caught — a tile named wherever it owns *any* cell (→ `TM3`, and the frame still renders and still fits, attributing eight cells to the wrong node); a name cut to fit rather than dropped (→ `TM4`, §3n's oldest sentence); the placement taken from the **rectangle** instead of the ink (→ `TM4`, the ruling the arithmetic disproved, kept falsifiable); and the wide-codepoint continuation removed (→ `TM5`). The control is `named` computed and not consulted, which is the state the form shipped in.
- **T6.62** (I55): seven mutations in `c12-callout-name.mjs`, all caught — the suppression widened to `"last"` and removed entirely (→ `TL3`); the refusals returned to `yc !== "last"` (→ `TL4`, and it **survived** until the rows existed); the gutter measured from a second computation of its own string (→ `TL2`, `legendEntries`' recorded defect with cells instead of colour); an unlabelled series given a blank name (→ `TL5`, and it **survived** too); and both halves of the stacked degradation (→ `TL6`). **The control went stale inside the pass** when the degradation landed, and the harness reported `ANCHOR MISSED` rather than a survivor — which is the distinction that keeps a row from reading as verified when it ran nothing.
- **T6.63** (C04 I52, I55): five mutations in `c12-annotation-label.mjs`, all caught — the auto arm counting series alone (→ `TL7`, the deferral's exact refused state, and the frame still renders); the label's clause gated on `SHARES_CELLS` (→ `TL7`); the swatch taken from the category ladder (→ `TL8`); and both refusals dropped (→ `TL9`). **Two of the five survived the first run and neither was a test gap**: the placement had *two* sufficient mechanisms and each hid the other. A survivor pair with one mutation each is what a redundant clause looks like from outside, and nothing else in the suite reports it.
- **T6.64** (I56): seven mutations in `c12-x-title.mjs`, all caught — the row declared and never drawn (→ `TL16`, and `composeRows` pads it, so the height stays right and a blank line appears); the title above the labels; the offset the first draft shipped; a long title untruncated; a matrix flipped to `true` and the form refusal dropped (→ `T2.9`, both of which break I1 rather than the drawing). **Three survived the first run and one of the three was not a survivor at all**: its anchor matched four times in `types.ts` and mutated a different record — F219, and the reason a uniqueness check belongs beside the staleness one.
- **T6.65** (I57, I34): the three layouts ordered into a ladder and hung off `plotDetail` — `"compact"`, `"auto"`, `"full"` mapped onto outline, left-to-right, top-down → **T1.115 fails on the broad tree and passes on the catalogue's**, which is the whole of §3ah.1: the ordering holds on the fixture that was measured first.
- **T6.66** (I57): `W(node)` returning `Σ W(children) + gaps` without the `max` → **T1.114 fails on the wide-parent tree alone**, and the frame renders with a parent's name over its siblings.
- **T6.67** (I57): placement before truncation → T1.118 fails, and every count in the frame still agrees.
- **T6.68** (I57): the layout re-chosen after the notice takes its row → T1.117 fails, and the notice removes itself on exactly the budgets where it was needed.
- **T6.69** (I57): a fan of one drawn as a zero-length bar → T1.119 fails, and a branch glyph appears where nothing branches.
- **T6.70** (I57): twelve mutations in `c12-tree.mjs`, all caught — including the outline's last-child glyph computed over the kept set (→ `TR13`), the frame-read finding wired to a row — and the two that first landed on rows other than the ones they named are §3ah.8a: `OUTLINE_INDENT` set to 2 was caught by a **natural-size** row because the constant governed the measurement and only half the drawing, and the shared drop tail removed was caught by a **preference** row because every row asserting *something was dropped* is satisfied by dropping everything. Both are fixed at the thing they indict rather than at the row.
- **T6.32** (I48, I37): placing the callout with `rowOf(v, range, areaRows)` rather than from the series' ink → YC2 fails, and one value in six lands a row off the line it names, worst at the ends of the range. **Nothing else sees it**: every count, colour and width assertion passes, and the number is beside the right row at the widths a fixture happens to use.
- **T6.33** (I48, I8): dropping the `+` where two callouts share a row → YC4 fails, and a series' reading disappears with the frame asserting nothing about it.
- **T6.34** (I48): letting a callout take the **left** gutter's row as well → YC3 fails, and `yAxis: "both"` loses a reading on the one row where it has two chances to keep it.
- **T6.35** (I47): sizing the right column from the tick labels alone → the callout truncates, and YC1's value assertion fails while every geometry row still passes.
- **T6.36** (I47): mirroring the left gutter's `bare` predicate into the right gutter → YA7 fails, and `plotFrame: "rule"` grows the right rule that style exists not to have.
- **T6.37** (I48, I25): carrying the callout at one bit with `bold` instead of a mark → YC8 fails, and a callout in an `emphasised` slot is typographically identical to the series it names.
- **T6.38** (I47): keeping `gutterSpans`' tick rule as *the label is non-empty* → **YA2b** fails and YA2 does not, which is why YA2b exists.
- **T6.39** (I48): the walk's own ruling — a spanning last column takes its **midpoint** → YC2 fails, and the callout lands on the row the cell-resolution shortcut gives. *Two wrong answers that coincide*, so the ruling could not have been told apart from the thing it was written to rule out.
- **T6.40** (I48): deleting the stacked arm's callout resolution → **YC8b** fails and YC8 does not. The wiring mutation, and the capability it hides at: above one series at one bit the positional family stops overlaying and stacks.
- **T6.41** (I8, I48): the *earlier* series keeping a contested row → YC4 fails, and the loss moves to the other series while every count still agrees.
- **T6.42** (I49): deriving the mask from the corner bits without the inequality — `TL|TR<<1|…` rather than *the corners disagree* → **CN1** fails on twelve of the sixteen cases and CN6 fails on every junction. The four it does not fail are the four where the two happen to agree, which is why CN1 enumerates rather than samples.
- **T6.43** (I49): resolving the saddle by a constant instead of the centre value → **CN2** fails and CN2b does not. The pair is the point: the same mutation on the `"line"` arm fails nothing, which is what CN2b asserts.
- **T6.44** (I49): dropping the union across levels so the last level wins a cell → **CN8** fails, and two crossing contours draw one of them. Invisible to CN1, which is single-level by construction.
- **T6.45** (I50): drawing an arrow of arbitrary direction at zero magnitude → **QV3** fails. A field of still cells comes out as a field of eastward flow, and every magnitude assertion still passes.
- **T6.46** (I50, C02 I9): taking the unicode arm at `ambiguousWidth: "wide"` → **QV6** fails and QV4 does not. The mutation that F176 and `art.ts` both name, arriving on a third vocabulary.
- **T6.47** (I51, I44): handing `layers` to `mergedRow` unreversed → **LY1** and LY3 fail, and the contour draws over the arrows. The seam, not the array — mutating the public field's order would fail nothing, because the caller declared it.
- **T6.48** (I51): letting the ramp win the cell below `colourDepth: 8` → **LY5** fails and nothing above the floor moves. The wiring mutation for the one interaction no frame above 8-bit can show.
- **T6.49** (I51): dimming by a constant 50% rather than per colormap → **LY6** fails on inferno alone, which is the map the constant does not clear. A mutation that fails on one of three inputs is the argument for the row enumerating the maps.
- **T6.50** (I51): recolouring for contrast **inside** the contour and quiver rasterisers rather than after the merge → **LY7** fails on a cell where the arrow lost the merge, and passes everywhere else. §6d.2's pass 6, and the only pass that reads two and writes one.
- **T6.51** (I52): returning band depth to the density ramp → HZ1 fails, and the eighths channel is overwritten by the thing it was freed from. **Paired with a control**: swapping the *legend's* ramp alone fails nothing and is meant to, because the legend names bands either way — which is what says the ruling is about the plot area and not about the key.
- **T6.52** (I52): making the fold an offset — negative bands growing downward through `▀`/`▔` → HZ3 fails, and one direction resolves to an eighth while the other resolves to a half. The mutation that shows §3r's repertoire finding is load-bearing here and not decoration.
- **T6.53** (I52, §3z H7): `FURNITURE_ROWS.horizon` back to 0 → HZ7 fails, and the scale is cut off the bottom by the compositor with no refusal anywhere. **It survived the first pass** — the grid is unaffected, so the six geometry rows all passed — and HZ7 exists because of that survivor rather than beside it.
- **T6.54** (I52, §3z): arm B below the colour floor, the eighths kept and `bands` inert → HZ4 fails. **The mutation that resolves *more* than the shipped arm**, which is why the row is written about the density ladder rather than about a level count.
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
