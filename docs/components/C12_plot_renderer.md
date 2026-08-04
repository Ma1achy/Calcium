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
  values: readonly number[],
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
```

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

## 4. Degenerate series

Every one of these is real, and each has a defined result rather than an exception.

| Input | Result |
|---|---|
| Empty series | Declared height, centred empty message |
| Single point | A dot at vertical centre |
| All values equal | Flat line at vertical centre; y-labels all show that value. **No division by zero** |
| `NaN`, `±Infinity` present | Filtered out before scaling; the line breaks across the gap rather than spanning it |
| All values non-finite | Treated as empty |
| Fewer points than dot-columns | Points spread across the full width; the line is drawn between them |
| More points than dot-columns | Downsampled by min/max per column, so spikes survive rather than being averaged away |

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

**The cell grid is identical** — same width, same height, same measured rows (C09 §4, 1:1 by cell count). Only vertical resolution changes, from 4 subrows to 8 via the ramp, and horizontal from 2 dots per cell to 1. The plot gets blockier; nothing moves.

---

## 7. Invariants

- **I1** — Measured height is a function of the block alone, never of the data.
- **I2** — Rasterisation is pure and total. No series input throws.
- **I3** — No division by zero on a constant or single-point series.
- **I4** — Non-finite values are filtered before scaling and never reach the grid.
- **I5** — Downsampling preserves per-column minima and maxima. *Composition (§3): a column also keeps its first and last sample, because preserving only the extremes leaves I14 nothing to join.*
- **I6** — At `colourDepth: 1`, multi-series plots stack; series are never distinguished by colour alone.
- **I7** — Stacked strips sum to exactly `height`; series labels occupy the y-label column and consume no plot rows.
- **I8** — When series outnumber available rows, the plot renders the first series plus a legend and marks itself truncated. Series are never dropped silently.
- **I9** — The ASCII fallback occupies an identical cell grid to the Unicode form.
- **I10** — A plot never emits a character outside its measured region — `height` rows without axes, `height + 2` with, by `width` cells.
- **I11** — C12 owns no state; every render is a pure function of block, width and context.
- **I12** — C12 registers through C09's public `register`; it is not privileged.
- **I13** — Sparklines are exactly one row, at every width including 1.
- **I14** — Successive points are joined by Bresenham line-draw rather than plotted as isolated dots, so a curve reads as a curve at braille resolution. A scatter of points at 2×4 subcell density is indistinguishable from noise. *Composition (§3): under downsampling the join runs from a column's last sample to the next column's first, which is what keeps I5's span-fill connected.*
- **I15** — Y-labels are placed at the max, mid and min rows of the plot area and collapse from the middle outward when the height cannot hold three: two labels at `height: 2`, one at `height: 1`.

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
- **T1.12**: y-labels formatted per `yFormat` — four cases.
- **T1.13** (I13): sparkline at widths 1, 8, 80 → exactly one row each; the series windows to fit.
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
