# The plot rebuild — findings, rulings, and what is left

Working document for the C12 rebuild begun 2026-08-18. Every defect below was
**measured** — read out of a rendered frame or out of the code — not inferred.
Where a form is fine it says so.

Companion to `CALCIUM_PLOT_PRIOR_ART.md` (what other libraries do) and
`CALCIUM_C12_AUDIT.md` (the earlier audit).

---

## 1. The requirements, as given

1. Every form compared against **two** references before it counts as done — a
   terminal implementation *and* matplotlib/seaborn/plotly. Per form, as it
   lands, not as a sweep at the end.
2. **Colour leads, glyphs are the fallback.** Where colour is available it
   carries magnitude and identity; the glyph ramp is what stands in where it is
   not. Overridable in one direction (`plotMarks: "always"`) for line styles.
3. **Degraded modes must be understandable** — no colour, ASCII only.
4. **Configurable**: frame style, title, axis labels, legend position.
5. **Orientation**: box plots, violins, histograms and bar charts renderable
   vertically as well as horizontally.
6. **Compact and full variants** for box plot and violin.
7. **Resizing, filling space, odd aspect ratios.**
8. Eight forms that were never added: stacked area, slope/bump, bubble,
   autocorrelation, timeline, treemap, bullet, utilisation grid.
9. `progress` must not be a `PlotForm`. *(It never was — `kind: "progress"` is a
   C09 block. Recorded so it is not re-raised.)*

---

## 2. What landed

| commit | what |
|---|---|
| `449fe1b` | Catalogue instruments — background, coverage, determinism |
| `517afad` | Spec: C12 §3f–3i, C12 I24–C12 I28; C04 eight forms, C04 I53–C04 I55 |
| `867d2fb` | Bar family — extent vocabulary, zero baseline, grouped, bin intervals |
| `f2f3bfc` | Box plot three rows, violin as an outline |
| `c21a30c` | Degraded arms — violin ASCII, stacked marks, compact box |
| `0cf53e1` | C12 I29 — colour leads, glyph is the fallback |
| `3790162` | Violin spine full width, no end caps |

### 2.1 The instruments lied first

- **The blue background was invented by the PNG tool.** `catalogue-png.mjs`
  filled every page with `#1a1a2e` and the contact sheet with a second,
  independent `{r:26,g:26,b:46}`. It appears in no theme, no capability set and
  none of the 560 generated frames — plot rendering resolves no background at
  all, so `sgr()` structurally cannot emit one. Now the dark theme's own
  `surfaces.bg`, `#1a1a1a`, from one source.
- **The catalogue covered 26 of 34 forms.** `FORMS` was an untyped literal in a
  `.mjs`. `flame`, `icicle`, `calendar`, `spectrogram`, `latency`, `density2d`,
  `smallmultiples`, `pairplot` were in no frame at all — a quarter of the
  component invisible to every visual review. Now a `Record<PlotForm, …>` in
  `tools/catalogue-forms.ts`, so a missing form is a compile error.
- **It was not reproducible.** Histogram fixtures called `Math.random()`, so two
  runs differed and the diff between them said nothing. Fixed-seed now; verified
  by running twice and diffing (zero differing files).
- **The contact sheet showed 24 panels** — the filter was `-default-`, and
  `histogram` and `horizon` have no variant by that name.

### 2.2 The bar was a gauge, not a length

`pairFor` is the **fill** vocabulary: a lit run against a shaded track, correct
for a progress bar or a CPU cell. `barRow` reused it for comparison bars, where
length is the only signal — so every bar drew a solid run *and a shaded track out
to full width*, carrying no information. `ramp.ts`' own header names this class:
*a vocabulary carried into a geometry it did not fit.* Third instance.

`extent` is the fourth vocabulary: blank remainder, eighth-block tip. The
partials are the **left**-eighths `▏▎▍▌▋▊▉`, not `RAMP_UNICODE`'s lower-eighths
`▁▂▃▄▅▆▇` — the two look interchangeable and encode different axes. The wide arm
has one partial rather than seven because U+2580–U+259F are all
`East_Asian_Width=Ambiguous`.

Two more in the same function, both found by reading the frame:

- **The baseline was the data minimum.** `[10,25,15,30,20]` → `alpha` at 10 drew
  a bar of length **nothing** beside a label reading `10`. `flame` and `icicle`
  had it too.
- **`layout: "grouped"` dropped every series but the first, silently** — only
  `stacked` and `normalised` were handled. C12 I8 says series are never dropped
  silently; this was the one place that did.

Plus: value labels now go through `formatReadout(value, yFormat)` rather than
`String(Math.round(v*10)/10)`, which dropped the unit and the trailing zero —
the class `axes.ts` §32-38 records as having happened three times already. And
bin labels are half-open intervals `[lo, hi)` at a precision the bin width earns.

### 2.3 Box plot and violin were the same defect

Both drew as *fill* where the meaning is in the *boundary*.

**Box plot** was one row, `[▌▌▌│▌▌▌]` — no top or bottom edge to read a quartile
against, and nowhere to put a mean. Now the UnicodePlots/YouPlot figure:

```
   ╷      ┌─────┬────┐           ╷
   ├──────┤     │    ├───────────┤
   ╵      └─────┴────┘           ╵
```

Row-indexed glyph table, which is what makes three rows one figure. Five marks
joined C09's vocabulary rather than being written as literals: `teeDown`,
`teeUp`, `stubDown`, `stubUp`, `diamond`.

`bandedForm` read only `block.series`, so a form whose data lives in
`block.quartiles` could not use it — **that is why the box plot could not show a
centre.** It now takes an ordinal.

**Violin** painted every cell from the centre out. Now traces the boundary with
`strokePolyline` + `glyphForMask`, which already handle arbitrary closed paths.

Three defects found while doing it:

- **Silverman's constant was wrong for its estimator.** The rule is
  `1.06·σ̂·n^(-1/5)` for the standard-deviation form and
  `0.9·min(σ̂, IQR/1.34)·n^(-1/5)` for the robust one. This used 1.06 with the
  robust estimator — neither rule, oversmoothing by 18%.
- **The mirror was not exact.** `Math.round` breaks ties toward +∞, so rounding
  each edge independently put them on rows 2 and 4 about a centre of 2.5, whose
  mirror is 3.
- **The outline itself was asymmetric.** Stroking one ring — upper forwards,
  lower backwards — is not symmetric, because `strokePolyline` steps vertically
  before horizontally, so a rise puts its vertical run one column left on the
  forward pass and one column right on the backward pass.

### 2.4 The degraded arms

- **The violin emitted box-drawing at `unicode: "ascii"`** — `glyphForMask` had
  no ASCII arm, so every mask resolved to `╭─╯` regardless of capability. The
  golden corpus had been recording it, including the `~` truncation marker that
  appeared because those glyphs are ambiguous-width and measured two cells.
- **`stackedBarRow` kept the shaded remainder** — an incomplete fix; `barRow`
  moved off the gauge vocabulary and its sibling did not. Worse, every layer drew
  the same glyph under a single `ColourRef`, so a stacked bar could not show
  where one series ended by *either* channel.
- **The compact box carried no range** — `┤    │    ├`, nothing marking the box.

---

## 3. C12 I29 — the ruling that reorganises the rest

**Colour carries magnitude and identity where there is colour; the glyph is the
fallback, never the lead.** This inverts what C12 I17 said (*density survives 1-bit,
so a magnitude colour would add rather than carry alone*), which made ink density
the permanent carrier and colour a garnish. Rendered, that is dithered speckle: a
foreground glyph occupies the cell whatever colour goes over it.

Granite is the reference — it **paints the cell background** and reads as the
continuous field a matrix is.

**The pipeline already supports this and the plot module is the one kind that
does not:**

- `Style` carries a `background`; `paint.ts:73` applies it
- `escapes.ts:243` emits `48` for extended background colour
- `paint.ts:54` records why it is unused: *C25 is the only consumer and the only
  kind that paints a background at all*
- `catalogue-png.mjs` now parses `48;5;n` and `48;2;r;g;b`

So it is **wiring, not machinery**. It changes seven matrix forms at once —
`heatmap`, `correlation`, `confusion`, `spectrogram`, `latency`, `density2d`,
`calendar` — plus solid bars and solid pie wedges, and it retires the
density-swatch legend (`⠄⠔⠖⠶⠷⠿⡿⣿  5 - 90`), which stops meaning anything once
the ramp is not the carrier. Granite's `Min ▮▮▮▮▮ Max` is the shape.

**C12 I29 meets C12 I25 rather than contradicting it.** C12 I25 governs the colour-absent
case. Together: lead with colour where it exists, fall back to marks where it
does not. Stating it once over both channels is what stops it lapsing per form —
which is how `pie`, `waffle`, `radar` and the stacked bar all *satisfied* C12 I6
while being colour-only: none is a multi-series plot in C12 I6's sense.

`plotMarks` widens in one direction only. `"auto"` brings marks in when colour
cannot carry it; `"always"` regardless, for dashed-vs-solid on a colour terminal
or printing to paper. **No `"never"`** — that is a picture that says nothing at
one bit, which C12 I25 refuses.

**It opts out of C10's `background: "terminal"` deliberately, per form.** A
matrix *is* its surface; that is right there and wrong as a global switch.

---

## 4. Still wrong, measured against references

| form | reference shows | ours |
|---|---|---|
| **pie** | round, solid labelled wedges, percentages | rectilinear staircase blob, sparse dither, no labels, uses 17 of 80 columns |
| **radar** | spokes, value rings, category labels, filled polygons | staircase tangle, no spokes, no text at all |
| **streamgraph** | stacked bands, symmetric baseline, filled, never crossing | two crossing outlines — byte-for-byte the `line` handler |
| **ridgeline** | overlapping outlined curves, shared baseline | disjoint solid slabs |
| **smallmultiples / pairplot** | every facet drawn | 2 of 4, clipped |
| **confusion / correlation** | both axes labelled, cell values | row labels only; `categories` never read by `heatmap.ts` |
| **waterfall** | green up / red down / blue total | generic per-row palette rotation (geometry is correct) |
| **flame / icicle** | nested by depth, width = time | bar charts with labels off |
| **forest** | thin CI, square estimate, dashed null line | solid box overwrites its own CI line |
| **horizon** | bands folded into few rows | one row per band; `height:1, bands:3` renders only band 0 |
| **bar / histogram** | both orientations | horizontal only |
| **violin** | smooth taper | plateau — see §5 |

**Fine as they stand:** `dumbbell`, `funnel`, `gantt`, `lollipop`/`dotplot`,
`density`, `ecdf`, `scatter` marks (braille 2×4 is the right technique), waffle's
fill order, waterfall's floating arithmetic.

### 4.1 Two shared root causes

**`strokePolyline` steps only in cardinal directions.** Correct for a line chart
where segments are shallow slopes across many columns; for a circle or a polygon
at arbitrary angles it renders every diagonal as a **staircase**. That is the
pie blob and the radar tangle. `circle.ts` even records this objection about
radar *spokes* and never noticed it applies to the ring and the polygons
themselves. **Fix: draw in the braille dot grid** (2×4 subcells), as
`scatterRows` already does and as UnicodePlots does for everything.

**`facet.ts` measures painted strings.** `smallMultiplesRows` calls `padEnd` and
`slice` on rows that already carry SGR escapes, so it counts invisible bytes as
cells — one colour run is 10–19 characters for one visible glyph, so `padEnd` is
a no-op and `slice` truncates the byte stream, erasing later facets.
`paint.ts`' header states the rule this breaks: *every kind builds plain text
rows first and styles them last.* **Fix: compose spans and paint once** — SS14
rejects the alternative (measuring escapes in L1), and it is right to.

---

## 5. Known-unfixed, with the measurement

**The violin has no shape.** `violin-default` is eight data points; Silverman on
eight points gives a near-flat density, and at six rows `round(d/maxD × 3)` has
only four reachable widths — 62 of 77 columns saturate at the same one. The
compact arm is this at its limit: at two or three rows there is nowhere for a
shape to exist.

**And there is a third cause, which is the cheapest and comes first.** The
fixture was eight data points. Seaborn draws something near-flat from eight
points too — so the fixture could not have shown a violin under *any* bandwidth
or rendering mode, and therefore could not verify a fix to either. It is thirty
samples now. A fixture must be able to respond to the thing under test before it
is asserted against, and this is the second time that rule has been earned this
round (the heatmap's `sparse` variant was the first).

Two more needed after it, neither a tweak:

- **A caller-adjustable bandwidth.** seaborn has `bw_adjust` for exactly this;
  the rule-of-thumb default oversmoothing multimodal data is a known limitation,
  not a bug to round away.
- **Compact as mirrored sparklines**, per the sketch — the density drawn with the
  height ramp on two rows with the summary overlaid, rather than an outline
  shrunk until it cannot curve. A shrunken outline will never have shape.

**The target shape** (given as a sketch): tails taper into the axis rather than
being capped; the spine is a full-width rule with `│───◆─┬───│` on it. The spine
and the caps are done; the taper is not.

---

## 6. The comparison instruments

**Both references, per form.** The terminal one settles *how to draw it in
cells*; the desktop one settles *what the chart type is* — and is the only one
available for forms no terminal library implements at all: pie, radar, waffle,
ridgeline, streamgraph, violin, forest, treemap. Checking only terminal libraries
silently exempts those.

**Diff the text, do not only eyeball images.** `drawilleplot` is a *matplotlib
backend* — `matplotlib.use("module://drawilleplot")` — so the same figure renders
to braille and sits beside `docs/catalogue/*.plain` as text. Needs a shim on
modern Pillow: `Image.ANTIALIAS = Image.LANCZOS` before importing.

Run once, it immediately separated geometry from furniture: our line curve sat
exactly where matplotlib's did, and what differed was the missing right border,
the tick marks and the x labels. A raster comparison shows "looks different" and
not which half.

**Setup.** Never install into `calcium-dev` — it has no pip or venv. Build a
throwaway image from `python:3.12-slim` with
`matplotlib seaborn plotly kaleido numpy drawilleplot`. Export the **real**
fixtures (`CATALOGUE_FORMS` → JSON) or the comparison is not like-for-like.

---

## 7. Queue, in dependency order

1. **Axes and ticks** *(in progress)* — termplot's scheme: full border box, ticks
   on the axes, y labels outside the left border, x labels under their tick
   columns. Fixes two recorded defects: the not-straight y-axis (`labelWidth` and
   `padStart` default to `ambiguousWidth: "narrow"`, and `overlaidRows` never
   passes the real capability while `categoricalForm` and `bandedForm` do), and
   `yLabels` always calling the linear `niceAxis` regardless of `yScale`.
2. **Pie and radar on the dot grid** *(in progress)* — §4.1.
3. **Background-painted cells** — C12 I29. Highest leverage remaining: wiring, seven
   matrix forms plus solid bars and pie wedges, and the colour-scale legend.
4. **YouPlot scatter and density** — needs 1 for the frame and legend. Note
   `uplot density` is a **2D** density canvas (`[" ","░","▒","▓","█"]` indexed by
   `round(local/max × 4)`), which maps to our `density2d`, not our 1D KDE curve.
   Same word, different chart.
5. **Date/time x-axis** — `niceTimeAxis` is written and `xScale` is **read
   nowhere** in `src/presentation/plot/`.
6. **Streamgraph + stacked area** — one stacking fold, two baselines. *Same fold,
   different origin.*
*(Orientation was listed here and has moved — see the ordering in
`CALCIUM_PLOT_SYSTEM_PLAN.md` §IV. It sat at 7 while saying it should land before
the per-form work, which is items 8–12; the position and the reason contradicted
each other, and eleven forms rebuilt twice is the cost of not resolving it.)*
8. **`height: "fill"` and the aspect rule** — see §8.
9. **The eight new forms**, and `hierarchy` for `treemap`/`flame`/`icicle`.
10. **Facet composition** — §4.1, needs the spans change.

---

## 8. Resizing, fill, aspect

**`height: "fill"` is a deferral whose blocker has been met.** Roadmap 38 blocked
it on *"the producer cannot see the height — that is F37"*, and
`ProducerContext.height` was granted by phase 1 and is non-null in exactly the
case the entry names. Nothing noticed — which is the deferral-expiry pattern this
repo has been bitten by three times.

**It does not require weakening C12 I1.** The *producer* resolves `"fill"` to a
number before the block is constructed, so `measure` still sees a declared
height. C12 I1 is about the renderer never deriving height from data, not about the
number being fixed at authoring time.

**Width already reflows** — `plotAreaWidth` recomputes per render — but the golden
corpus covers two widths, so odd sizes are largely untested.

**Aspect is inconsistent rather than absent.** `circle.ts` compensates properly
(`rx = 2·ry`, correct for a ~1×2 cell, which is why our pie is genuinely round
where granite's is an ellipse). `waffle.ts` does not, so its 10×10 grid renders
as 10 wide × 20 tall. Same terminal geometry, two answers, one file aware of it.
The compensation belongs in one place.

---

## 9. The change surface for a new `PlotForm`

Six compiler-checked, four silent. **The four silent ones are how the catalogue
drifted to 26 of 34.**

| place | file | checked? |
|---|---|---|
| the union | `data/viewmodel/types.ts` | — |
| `DECLARES_HEIGHT` | `data/viewmodel/construct.ts:93` | **type error** |
| form allow-list | `data/viewmodel/validate.ts:671` | **type error** |
| `FORM_ROWS` | `presentation/plot/definition.ts` | **type error** |
| `AREA_ROWS` | `presentation/plot/height.ts:50` | **type error** |
| `FURNITURE_ROWS` | `presentation/plot/height.ts:86` | **type error** |
| `ONE_PER_FORM` | `test/support/plot-forms.ts:11` | **type error** |
| `CATALOGUE_FORMS` | `tools/catalogue-forms.ts` | **type error** *(was silent)* |
| `FIXED_HEIGHT` | `test/unit/plot-sweep.test.ts:30` | silent (`Partial`) |
| `MATRIX_LAYOUT`, `DEFAULT_COLORMAP` | `presentation/plot/heatmap.ts:39` | silent (`Record<string,…>`) |
| the C12 spec | `docs/components/C12_plot_renderer.md` | silent (prose) |

`setForm(form: PlotForm)` is one generic builder method — **no new builder
methods are needed**, and MG27 governs block *fields*, not forms.

**Also still a raw string:** `palette?: string` (`types.ts:656`).
`colormap?: ColormapName` beside it is the generated 142-member union, so
`palette: "tab-10"` compiles today and fails at render. Generate `PaletteName`
alongside the data files, as `ColormapName` already is.

---

## 10. Rules earned this round

- **A fixture must be shown to respond to the thing under test.** The heatmap's
  right-anchoring was invisible because `default` over-fills its width; a
  `sparse` variant exposed it immediately.
- **A snapshot records, it does not check.** The golden corpus held the violin's
  ASCII defect — box-drawing glyphs in the ASCII arm, plus the truncation marker
  they caused — through review and commit.
- **A mutation that fails nothing indicts the tests.** Five mutations on the bar
  work; the shaded remainder killed 16 frames and the baseline 12, but the value
  format and the bin precision survived, so T1.60 and T1.61 exist.
- **Read the exit code of the thing you ran.** `make test | tail` reports the
  pipe's status, and a background task notification reports the wrapper's.
- **`git checkout <path>` restores from the index, not from your last edit.** It
  silently discarded an unstaged rewrite mid-session.
- **A load-sensitive failing set is not a regression.** 72 failures across 42
  files, including `manifest` and `parser`, all timeouts; the same files passed
  in isolation.
