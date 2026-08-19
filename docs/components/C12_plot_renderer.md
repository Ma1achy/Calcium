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

## 3i. `plotDetail` — the mode fits the height, and never sets it

A boxplot at one row per category cannot show a mean; at three it is the reference figure. A
violin needs five before an outline and its box overlay are both legible. Both wants are real
and neither should cost the caller arithmetic.

| form | `"compact"` | `"full"` |
|---|---|---|
| `boxplot` | 1 row — whiskers, box, median, mean | 3 rows |
| `violin` | 2 rows — mirrored outline | 5+ rows, with the box overlaid |
| `ridgeline` | 1 row per series | 3+ rows per series, overlapping |

**`plotDetail` selects a renderer inside the declared height; it never contributes to it.**
That is forced, not chosen: rows-per-band times category count derives height from the data,
which is precisely what I1 forbids. `bandedForm` keeps dividing the declared area by the
category count and the mode picks which renderer fits the quotient.

**So `"auto"` means the richest form the declared height affords** — and a caller who wrote
`height: 12` for four categories gets full boxplots without having asked for them.

**An explicit `"full"` under an insufficient budget degrades to compact and says so.** Silently
drawing three rows into a one-row band is the class this component keeps having; the
interaction is three-way — declared height, mode, category count — and belongs in the
classification table as its own rows.

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
- **I13** — Sparklines are exactly one row, at every width including 1, **and one cell per position rather than per sample**. A window of eight positions is eight cells whether or not every position has a reading.
- **I14** — Successive points are joined by Bresenham line-draw rather than plotted as isolated dots, so a curve reads as a curve at braille resolution. A scatter of points at 2×4 subcell density is indistinguishable from noise. *Composition (§3): under downsampling the join runs from a column's last sample to the next column's first, which is what keeps I5's span-fill connected.*
- **I15** — Y-labels are placed at the max, mid and min rows of the plot area and collapse from the middle outward when the height cannot hold three: two labels at `height: 2`, one at `height: 1`. **A labelled row carries a tick on the border and an unlabelled one does not** — one rule rather than a flag per form, and the same rule a categorical axis, a band and a matrix row each resolve correctly under. **The tick values follow `yScale`**, because `yLabels` dispatches through `axisFor` rather than reaching for the linear arm.
- **I16** — **Every step of every ramp is visible, and no ramp's lowest step is the character its padding uses.** Eight steps, monotone in ink. The braille arm shipped with `U+2800` — BRAILLE PATTERN BLANK — as step 0, so a sparkline at `ambiguousWidth: "wide"` drew its minimum as whitespace, which the right-anchor already uses to mean *fewer samples than cells*: one character, two meanings, in the arm nothing renders in a golden frame. *This is a property of the constant, not of a call, so it is asserted over the ramps themselves.*
- **I17** — **A heatmap draws one cell per position per row, against a range shared by the whole matrix, with magnitude carried by ink density and an absent cell left blank.** The shared range is what makes it a matrix rather than a stack of unrelated sparklines. **The ramp is `RAMP_DENSITY` and never the sparkline's**: the latter fills bottom-up, which encodes height, and a grid cell has no vertical axis to encode it on. Blank is absence rather than `?` because a grid has no padding for a blank to be confused with, and the lowest step has ink. Rows are drawn in the order the block declares them and the renderer never sorts. **Colour carries magnitude where there is colour, and the glyph is what stands in where there is not** — which is the inverse of what this clause used to say, and the correction is a measured one. It read *density survives 1-bit, so a magnitude colour would add rather than carry alone*, which made ink density the permanent carrier and colour an optional garnish. Rendered, that is a field of dithered speckle: a matrix drawn in foreground glyphs on unpainted cells reads as noise, and no palette applied over it fixes that, because the glyph is still the thing occupying the cell. **A heatmap with colour available paints the cell** — a background-coloured space, no glyph — and reads as the continuous field it is. Granite is the reference and the difference is not subtle. The density ramp is then exactly what the name says: the **fallback**, reached when `colourDepth` cannot separate the values, and the reason the 1-bit picture is unchanged is that it is the only picture that still needs the ramp. *A ragged matrix is refused at construction (C04 I50b).*
- **I18** — **A heatmap spends width on columns first, then truncates its labels, and never draws an unlabelled matrix.** Row labels are the ordinate: a matrix with no names beside it is a picture of numbers. Where the width cannot spare a cell for a label beside a minimum plot area the block draws a centred notice at its declared height instead — I1 holds, and the reader is told rather than shown something they cannot read. *The line form keeps T3.3's opposite ladder, because a y-label is a scale and a row label is an identity.*
- **I19** — **The scale legend spans the full row and never truncates its range.** The dropped-column clause goes first and the ramp swatch second; the range is what the legend exists to state, and it is the reason `axes: false` is refused (C04 I50b). A key with no scale beside it is decoration.
- **I20** — **A value bar encodes `fill`: the run is the axis, the fill clamps at the scale's top and the number does not, and an absent value draws a mark.** One row of exactly `width` cells, so a cell holding one is the same height as a cell without (I13's rule for the other cell form). **An empty run is a legible value** — it reads as *zero* — which is why absence is a mark here where it is a blank in a grid: the same question answered per geometry, which is the encoding rule applied to absence rather than to magnitude.
- **I21** — **A vocabulary declares the axis it encodes, a renderer names an axis rather than a ramp, and a ladder that serves an axis it does not equal says so.** Height, density and fill are three encodings and `position` is a fourth with no vocabulary at all — the unicode line reaches for no ramp because its axis is the grid. **The mismatch is unspellable rather than checked**: `LADDERS` is keyed by axis and typed to return that axis, so a ladder of the wrong one does not compile, and a source scan forbids reading a ramp constant outside `ramp.ts` because importing one directly is the move that produced the defect. `substitutes` is a field and not a comment: `RAMP_ASCII` *is* density and *stands in for* height, and losing that distinction is what cost two defects.
- **I22** — **An axis picks nice numbers, snaps a derived bound outward, never moves a declared one, and drops a tick that would abut its neighbour.** The step is 1, 2, 2.5, 5 or 10 times a power of ten — 2.5 is in the set because without it `0 · 25 · 50 · 75 · 100` is unreachable. **The snap is per end** (C04 I29): loose labelling exists so the ends read round and a pinned axis exists so two plots can be compared, so a pin that silently grew would defeat what it is for. **Precision is one per axis and comes from the step** — the smallest gap two labels can differ by — and it is the step's *own* decimals rather than two significant figures of it, and a named precision is **kept in the string** rather than trimmed back into three (F177). **The tick count is a result**, bounded below by how fine a step is worth asking for and above by how many labels the height seats two rows apart. **And a step the arithmetic cannot pick is `0`**, never a plausible constant: a denormal span underflows, and `1` there snaps `5e-324 … 1e-323` to `0 … 1`, which terminates and is wrong where nothing downstream can detect it (F178).
- **I23** — **An annotation is a dashed line in the same raster, drawn behind the data, and an edge outside the range is dropped rather than clamped.** Dashed is the carrier and the tone is decoration (F34): a reference line is broken where a curve is continuous, at every colour depth. **A band is two lines** — one statement, two edges — because a fill would compete for the cells the curve occupies. **Behind, and the layer order is the rule**: one that overwrote a sample would hide what it exists to be compared against. **Dropped rather than clamped is the one place this differs from a sample** (C04 I29): data pressed against a ceiling is honest, and a claim about *where a value sits* moved onto a scale it is outside is not. **At ASCII it is not the raster** — `foldRamp` encodes height, and folding a one-dot line by ink weight drew `# # # #`, heavier than the curve; there the line is drawn at cell resolution with `-`, which is narrow under both width conventions where every box-drawing dash is not.
- **I24** — **One compositor owns the gutter, the frame and the legend, and it asserts its own row count.** Four independent gutter implementations is what produced a y-axis that is not straight: `labelWidth` and `padStart` default to `ambiguousWidth: "narrow"` and only two of the four passed the real capability, so one row's `│` sits a column right of the others wherever an ambiguous-width label appears. **The assertion is the point rather than the deduplication** — `area.rows + furniture === plotHeight(block)` was a convention four call sites each had to honour and is now one checked equality (I1's other half, at render time rather than at measure time). It **reconciles** rather than throwing: I2 says no series input throws, and the caller is a renderer, so a short block is filled with blank rows and a long one is cut. **`padStart` is the half the audit missed** — the two forms that measured with the real capability still padded with the default one, so all four gutters were crooked on a wide terminal and only the reason differed. **And the equality reaches only what routes through it**, which is not a caveat but the measured failure: `radar`, `horizon`, `smallmultiples` and `pairplot` composed their own rows and were therefore outside the one check written to catch exactly their defect. A compositor that can be bypassed is a convention again for whoever bypasses it, so the four now go through `composeRows` and §2's height table names them.
- **I25** — **Two things a reader must tell apart differ by mark or by name, never by tone alone.** *(The second disjunct is measured, not softening: nine forms give each category its own gutter-labelled row, and a rule demanding a distinct glyph there fails eight correct renderers. `SHARES_CELLS` is the partition, total over `PlotForm`, and §3g's legend reads the same one.)* I6 says this of multi-series plots and is satisfied by `pie`, `waffle`, stacked `bar` and `radar`, none of which is one — a pie has segments, a stacked bar has layers — and all four of which drew a single glyph for every category. **The marks are a ladder of eight and not the shade ramp**: `░ ▒ ▓` encode magnitude along an axis (I21), and spending them on identity is the vocabulary mismatch that cost two defects already. *Asserted as a sweep over every form at `colourDepth: 1`, because a rule remembered per form is a rule that lapses on the thirty-fifth.*
- **I26** — **`plotFrame` chooses the shape of the furniture and `axes` chooses whether there is any.** Two fields because they answer two questions, and a single enum spelling `"none"` would make `axes: false, plotFrame: "box"` expressible and meaningless. Gridlines are appended last and resolve behind the data, for I23's reason exactly. **`"corners"` suppresses the tick row** rather than drawing ticks against an edge that is not there.
- **I27** — **A legend costs width or a row, and only the width-costing placements may enable themselves.** A row must declare its cost before the data is visible (I1); width is already data-dependent through the gutter, so it may not. That is why `"right"` is the default and `"above"`/`"below"` are opt-in — not a preference. **Skipped entirely at `colourDepth: 1`**, where a swatch carries nothing and still takes the row.
- **I28** — **`plotDetail` selects a renderer inside the declared height and never contributes to it**, because rows-per-band times category count is a height derived from data (I1). `"auto"` is the richest renderer the quotient affords; an explicit `"full"` that does not fit degrades to `"compact"` and reports rather than overflowing its band.
- **I29** — **Colour carries magnitude where there is colour; the glyph is the fallback, never the lead.** A form that encodes magnitude paints the cell — a background-coloured space — at any depth that separates its values, and reaches for the density ramp only below it.

**"Separates its values" is a real threshold and it is 8-bit, not 1-bit.** C10 I31 already ruled that a continuous map below 8-bit says *nothing* — an ordering over sixteen indices whose luminances the terminal never reports, so a ramp across them is an ordering that is not one — and `continuousColour` returns `undefined` there rather than guessing. **So the ladder has four rungs, not two, and the middle one is the rung most terminals actually report**: at 24- and 8-bit colour carries and the cell is painted; **at 4-bit colour exists and cannot carry, so density does**; at 1-bit there is nothing else. The mechanism is already built — the caller falls back because the map declines — and naming the rung is what stops someone reading *any depth with colour* as *any depth at all*.

**The legend takes whichever form the carrier does, by this same rule.** A colour bar where colour leads; the density swatch where it does not. Retiring the swatch outright would be the same error one layer up: it stops meaning anything at 24-bit and it is the *only* thing that means anything at 1-bit and 4-bit. One rule, two arms, in the legend as in the cell. The old rule was the inverse and it is what makes a matrix read as dithered speckle: a foreground glyph occupies the cell whatever colour is applied over it, so no palette rescues it. **This meets I25 rather than contradicting it** — I25 governs the case where colour is *absent* and says two things a reader must tell apart still differ by mark. Together they are one rule with two arms: lead with colour where it exists, fall back to marks where it does not. **And it is the same rule for identity as for magnitude.** Two series are told apart by colour where there is colour and by mark where there is not — a line and a second line, a pie's segments, a stack's layers. Stating it once over both is what stops it being remembered per form and lapsing on the thirty-fifth.

**Overridable in one direction only, and `plotMarks` is the field.** `"auto"` — the default — brings marks in when colour cannot carry the distinction. `"always"` brings them in regardless, because dashed against solid against dotted is a legitimate thing to want on a colour terminal, and a reader printing to paper or pasting into a ticket needs it. **There is no `"never"`**: that would be a caller asking for a picture that says nothing at one bit, and I25 already refuses it. So the field widens what a form may do and never narrows what it must.

*Gated as a sweep over every form at two depths, not as a source scan: the subject is the rendered cell and a scan would be asking about the call site.*

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
12. Y-labels are placed at the rows their values fall on, the ends are kept, and an interior tick that would abut one is dropped rather than overflowing a short plot (I15, I22).
13. **Every ramp step is visible and no ramp's lowest step is its padding character**, so a minimum reading never renders as absence (I16, §6).
14. **A heatmap is one cell per position per row against one shared range, magnitude in the ink and absence left blank** (I17, §3a).
15. **Width goes to columns before labels, and an unlabelled matrix is never drawn** — the opposite ladder from the line form, because a row label is an identity rather than a scale (I18, §3a).
16. **The legend never truncates the range it exists to state** (I19, §3a).
17. **A quantity against a scale is the `fill` encoding, drawn as a run whose number may exceed it** (I20, §3b).
18. **A vocabulary carries its encoding axis and a renderer asks for an axis** — so the mismatch that cost two defects is unspellable rather than reviewable, and a stand-in is declared rather than commented (I21, §3c).
19. **An axis is nice numbers, one precision from the step, and a density that is a result** — a derived bound snaps outward and a declared one never moves, a tick that would abut its neighbour is dropped, and a step the arithmetic cannot pick is nothing rather than a plausible constant (I22, §3d).
20. **An annotation is one feature and six named chart types are folds of it** — a dashed line in the data's own raster, behind it, with an out-of-range edge dropped rather than clamped; and the bar's target marker shares its name and not its mechanism (I23, §3e).
21. One compositor owns the gutter, frame and legend, and asserts its row count against `plotHeight` (I24).
22. `plotFrame` ships four shapes — box, corners, grid, rule — with `axes` still deciding whether furniture exists at all (I26).
23. A legend in four placements, auto-enabling only where it costs width rather than a declared row (I27).
24. Category identity survives colour loss, asserted as a sweep over every form rather than per form (I25).
25. `plotDetail` picks a renderer inside the declared height and degrades rather than overflowing (I28).
26. Magnitude is carried by colour where there is colour and by the glyph ramp where there is not, which is one rule with two arms rather than two rules (I29, I25).

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
