# The plot system — design, all 42 forms, and how correctness is established

The implementation plan for C12's rebuild. Findings and measurements are in
`CALCIUM_PLOT_REBUILD.md`; prior art in `CALCIUM_PLOT_PRIOR_ART.md`. This file is
the *design* and the *method*.

---

## Part I — The system

### 1. The four layers of a plot

Every form is one of these, and the current renderer conflates them — which is
why furniture is written four times and no form has a border.

```
  furniture   frame · gutter · ticks · labels · legend · title
  ────────────────────────────────────────────────────────────
  encoding    position · height · density · fill · extent · area
  ────────────────────────────────────────────────────────────
  raster      cell grid · braille dot grid (2×4) · glyph row
  ────────────────────────────────────────────────────────────
  data        series · categories · quartiles · segments · hierarchy
```

**A form declares one row in each layer.** `line` is
*(box frame, position, dot grid, series)*. `boxplot` is
*(box frame, position, glyph row, quartiles)*. Stating it this way is what stops
a form inventing its own gutter, and it is how the compositor's interface is
derived rather than guessed.

### 2. `furniture.ts` — one compositor

Four independent gutter implementations exist today (`definition.ts`, a copy in
`heatmap.ts`, and inline label-width loops in `categoricalForm` and
`bandedForm`). Each was reasonable when written; that is how it arrived and how
it would return.

```ts
export type AreaContent = Readonly<{
  rows: readonly string[];                     // exactly plotAreaRows(block)
  gutterLabels?: ReadonlyMap<number, string>;  // row index → label
}>;

export type BottomFurniture =
  | { kind: "none" }
  | { kind: "axis"; xLabels: Plot["xLabels"] }
  | { kind: "axisReadout"; cursorIdx: number }
  | { kind: "matrixScale"; range: Range; colormap: Colormap | undefined };

export function frameRows(
  block: Plot, width: number, ctx: RenderContext,
  area: AreaContent, bottom: BottomFurniture, legend?: readonly LegendEntry[],
): readonly string[];
```

It **checks** `area.rows.length + furniture === plotHeight(block)` on every
render — turning a convention four call sites each had to honour into one
equality.

**It must not throw, and that is forced.** C12 I2 says no series input throws,
and a renderer that raises takes the session down over a chart. So the failure
mode is: **clamp to `plotHeight`** — pad with blank gutter rows, drop the excess,
which keeps C12 I1 and C12 I10 true whatever the form did — **and surface the mismatch in
the frame**, reusing C12 I8's existing pattern (*the rows that fit, plus a notice*).
A wrong plot that says it is wrong is recoverable; a correct-looking plot of the
wrong height silently moves everything below it, and a thrown exception loses the
whole session. The check earns its place by making the bug *visible*, not fatal.

In tests the same mismatch is a hard failure — the sweep in §5 asserts the
equality directly, so the development-time behaviour is strict without the
runtime behaviour being brittle.

**Migration order: matrix (7 forms, one function) → positional (6) →
categorical (12) → banded (2) → geometric (5).** Matrix first *because* it is the
hardest small case: a genuinely different bottom-furniture kind plus C04 I50b's
always-gutter exception. If it fits without a carve-out, that is evidence the
vocabulary generalises. If not, redesign before 27 simpler forms are built on it.

**The risk, and its falsifier.** The vocabulary fails to cover some forms, an
escape hatch appears, and duplication regrows inside it — which is exactly how
the present mess was made. Matrix-first *is* the falsifier.

### 3. Configuration

All are literal unions, never `string`; generated alongside their data where the
values are generated. `palette?: string` is the standing counter-example —
`palette: "tab-10"` compiles today and fails at render.

| field | values | default |
|---|---|---|
| `plotFrame` | `box · corners · grid · rule` | `box` |
| `legend` | `above · below · left · right · false` | `right` |
| `plotDetail` | `auto · compact · full` | `auto` |
| `plotMarks` | `auto · always` | `auto` |
| `plotStyle` | `auto · braille · line` | `auto` |
| `plotCorners` | `rounded · sharp` | `rounded` |
| `matrixAnchor` | `stretch · left · window` | `stretch` |
| `orientation` | `horizontal · vertical` | per form |
| `height` | number \| `"fill"` | declared |
| `bandwidth` | number (KDE adjust) | Silverman |

**Two asymmetries that are constraints, not taste:**

- **Legend.** `left`/`right` cost **width**, which is already data-dependent
  (the gutter sizes from the y-range), so they may size themselves and
  auto-enable. `above`/`below` cost a **declared row**, so their cost must be
  known before the data is — fixed at one row, never auto-enabling. That is why
  `right` is the default: it is the only placement that can turn itself on.
- **`plotMarks` has no `"never"`.** That would be a caller requesting a picture
  that says nothing at one bit, which C12 I25 refuses. The field widens what a form
  may do and never narrows what it must.

### 4. Height, fill, and aspect

**C12 I1**: `plotHeight` is a function of `Pick<Plot, "form"|"height"|"axes"|…>`
alone, with `series` structurally unreachable. This is what stops a growing
series pushing the transcript around.

**`height: "fill"` does not weaken it.** The *producer* resolves `"fill"` to a
number before the block is constructed, so `measure` still sees a declared
height. C12 I1 forbids the *renderer* deriving height from data, not the number being
chosen late. The blocker roadmap 38 named — *the producer cannot see the height* —
was met when `ProducerContext.height` landed, and nothing noticed.

**Aspect belongs in one place.** A cell is ~1 wide × 2 tall. `circle.ts`
compensates (`rx = 2·ry`) and is why our pie is round where granite's is an
ellipse; `waffle.ts` does not, so its 10×10 grid renders 10 wide × 20 tall. One
helper, used by every form with a notion of squareness.

### 5. Colour — C12 I29, and the two arms

**Colour leads; the glyph is the fallback.** A form encoding magnitude **paints
the cell** — a background-coloured space — at any depth that separates its
values, and reaches for the density ramp only below it.

The old rule was the inverse, and it is why matrices read as speckle: a
foreground glyph occupies the cell whatever colour goes over it.

**The same rule governs identity.** Two series, a pie's segments, a stack's
layers: colour where there is colour, marks where there is not. Stating it once
over both is what stops it lapsing per form — which is how `pie`, `waffle`,
`radar` and the stacked bar all *satisfied* C12 I6 while being colour-only. None is a
multi-series plot in C12 I6's sense.

**The pipeline already supports painting**: `Style.background` exists, `paint.ts`
applies it, `escapes.ts` emits `48`. `paint.ts` records why it is unused — *C25
is the only kind that paints a background at all.* Wiring, not machinery.

**It opts out of C10's `background: "terminal"` deliberately and per form.** A
matrix *is* its surface. Right there; wrong as a global switch.

### 6. Degradation — the ladder every form descends

| rung | condition | what carries |
|---|---|---|
| 1 | 24-bit, unicode, narrow | painted cells / colour + braille |
| 2 | 8-bit | quantised palette, same geometry |
| 2a | **4-bit** | **density** — a continuous map below 8-bit is an ordering over indices whose luminances are unknown (C10 I31), so colour exists and cannot carry. The rung most terminals report, and the one C12 I29 originally skipped |
| 3 | 1-bit | **marks** — `CATEGORY_MARKS`, a ladder of 8 |
| 4 | `unicode: "ascii"` | ASCII glyph tables |
| 5 | `ambiguousWidth: "wide"` | braille (Neutral) replaces block elements |

**Rung 5 is the one that is forgotten**, and it has already produced three
defects: `RAMP_UNICODE`, `pairFor` (F176), and this round the violin's outline —
box-drawing glyphs are `East_Asian_Width=Ambiguous`, so a "wide" terminal draws
them two cells and the row truncates. **Every new glyph table needs a wide arm or
a stated reason it does not.**

**The legend descends the same ladder as the cell** — a colour bar at 24- and
8-bit, the density swatch at 4- and 1-bit. Retiring the swatch outright is the
same error one layer up: it means nothing where colour leads and it is the *only*
thing that means anything where colour does not.

**Marks are not the shade ramp.** `░▒▓` encode magnitude along an axis;
spending them on identity is the vocabulary mismatch that has now cost three
defects. Distinct fills and shapes instead, with an ASCII rung.

---

## Part II — The 42 forms

Grouped by what they share, because that is what determines build order. **✓**
holds today, **~** partly, **✗** not.

### Positional — dot grid, shared scale

| form | state | what it needs |
|---|---|---|
| `line` | ✓ | frame + x labels |
| `sparkline` | ✓ | — |
| `scatter` | ~ | frame, legend, corner-anchored min/max labels |
| `step` | ✓ | frame |
| `ecdf` | ✓ | frame; `sharp` corners suit a step function |
| `density` | ✓ | adjustable bandwidth |
| `stackedarea` | ✗ | **the stacking fold**, baseline zero |
| `streamgraph` | ✗ | the same fold, baseline centred |
| `slope` | ✗ | two value columns, lines between |
| `bubble` | ✗ | scatter + a size channel (fourth encoding axis) |

**The stacking fold is one piece of work serving two forms.** Cumulative offsets
per column, area fill between successive curves; `stackedarea` offsets from zero,
`streamgraph` by `−total/2`. *Same fold, different origin.* `streamgraph` is
currently byte-for-byte the `line` handler.

### Categorical — one row (or column) per category

| form | state | what it needs |
|---|---|---|
| `bar` | ✓ | vertical orientation |
| `histogram` | ✓ | vertical orientation |
| `lollipop` | ✓ | — |
| `dotplot` | ✓ | — |
| `funnel` | ✓ | — |
| `gantt` | ✓ | — |
| `waterfall` | ~ | increase/decrease/total colour grammar |
| `autocorrelation` | ✗ | lag bars + a confidence band |
| `bullet` | ✗ | bar + target marker + qualitative bands |
| `flame` | ✗ | **hierarchy** |
| `icicle` | ✗ | **hierarchy**, inverted |

### Distribution — banded, N rows per category

| form | state | what it needs |
|---|---|---|
| `boxplot` | ✓ | vertical orientation |
| `violin` | ~ | taper (bandwidth), compact-as-sparklines, vertical |
| `ridgeline` | ✗ | overlap + outline |
| `forest` | ✗ | thin CI, weight-sized estimate, null reference line |
| `dumbbell` | ✓ | — |

### Matrix — one cell per (row, column)

`heatmap` `calendar` `correlation` `confusion` `spectrogram` `latency`
`density2d` `utilisation`

All ~. All need **painted cells** (§5), and `confusion`/`correlation` need
**column labels** — `heatmap.ts` never reads `block.categories`, and `xLabels` is
a fixed 3-tuple, so a confusion matrix cannot show predicted-class headers.
`utilisation` is a new member and otherwise this family's machinery exactly.

### Geometric — a shape, not an axis

| form | state | what it needs |
|---|---|---|
| `pie` | ✗ | **dot grid**, solid wedges, labels, percentages |
| `radar` | ✗ | **dot grid**, spokes, rings, labels |
| `waffle` | ~ | aspect compensation; marks at 1-bit |
| `horizon` | ✗ | fold bands into rows independent of band count |
| `treemap` | ✗ | **hierarchy** |
| `timeline` | ✗ | event marks on a time axis |

**`pie` and `radar` share one root cause**: `strokePolyline` steps only in
cardinal directions, so any diagonal is a staircase. Both must draw in the
braille dot grid.

### Meta — composition

`smallmultiples` `pairplot` — both ✗, both blocked on the same defect:
`facet.ts` measures painted strings, counting SGR bytes as cells.

### Three forms, one data-model gap

`flame`, `icicle` and `treemap` cannot be built from `series` + `categories` — a
call stack is depth and offset, a treemap is area and nesting. **One field,
`hierarchy`, not three shapes.** The two that already existed proved the need by
both dispatching to `barRow` with labels suppressed.

---

## Part III — Correctness

**The instruments that have actually found things this round**, in order of
yield: reading a rendered frame; comparing against a reference; the mutation
pass; asking where a claim was written down. Not one finding came from a test
written to look for it. That is why the scheduled steps are verbs.

### 1. Two references, per form, as it lands

The terminal reference settles **how to draw it in cells** — glyph tables,
braille vs block, frame furniture. The desktop reference settles **what the chart
type is**, and is the *only* one available for the eight forms no terminal
library implements: pie, radar, waffle, ridgeline, streamgraph, violin, forest,
treemap. Checking only terminal libraries silently exempts those.

| family | terminal | desktop |
|---|---|---|
| line, scatter, step | UnicodePlots.jl, asciichart | matplotlib |
| bar, histogram | YouPlot | matplotlib (both orientations) |
| boxplot | UnicodePlots 3-row table | matplotlib `bxp` |
| violin, ridgeline | — | seaborn |
| pie, radar, waffle | granite (pie only) | matplotlib |
| matrix | granite | matplotlib `imshow` |
| candlestick | plotext | mplfinance |

### 2. `make refdiff` — a gate, not a setup step

`drawilleplot` is a **matplotlib backend** —
`matplotlib.use("module://drawilleplot")` — so the same figure renders to braille
and sits beside `docs/catalogue/*.plain` as text. Needs
`Image.ANTIALIAS = Image.LANCZOS` on Pillow ≥ 10.

This separates **geometry** from **furniture**, which a raster comparison cannot:
run once, it showed our line curve sitting exactly where matplotlib's did, with
the difference being the missing right border, ticks and x labels.

**This is a target, not a procedure someone remembers.** It renders every form
through both renderers from one fixture set and writes the pair side by side; a
form whose curve has moved shows up as a text diff. Kept out of `make all` — it
needs a second container — but run per form as it lands, which is the rule in §1.

**Setup**: never install into `calcium-dev` (no pip, no venv). A throwaway
`python:3.12-slim` image. Export the **real** fixtures from `CATALOGUE_FORMS`, or
it is not like-for-like.

### 3. The six gates

| gate | catches |
|---|---|
| `make check` | types, lint, examples |
| `make enforce` | 60+ rules — layers, marks, widths, spec pairing |
| `make audit` | commitment/invariant drift |
| `make instruments` | every tool has a fixture |
| `make test` | six tiers |
| `make golden` | frames at 2 modes × 2 widths |
| `make refdiff` | every form beside its braille-rendered matplotlib twin — **built, `145607e`**; 25 of 34 compared, the rest excluded with a stated condition |

**Per target, exit code read directly.** `make all | tail` reports the *pipe's*
status — it once showed green while 44 tier-5 rows failed. A background task
notification reports the *wrapper's* status, which is the same trap wearing a
different hat.

### 4. Per form, before it counts as done

1. **Walk it by hand** — before implementing. Both artefact shapes where the form
   has state *and* structure: a **sequence trace** finds event-mediated rule
   interactions, a **classification table** finds structural ones. Taking the
   trace alone because the state machine is the obvious thing is how the
   structural half goes unexamined.
2. **Render both references** and put them side by side.
3. **Read the frame** — `cat` the `.plain`, and *look at* the PNG. Reading text
   catches structure; it does not catch that a pie is a rectilinear blob or a
   matrix is speckle. Both were found only by looking.
4. **Degrade it** — 1-bit, ASCII, wide. Assert distinct categories produce
   distinct glyphs.
5. **Mutate it** — break what the tests cover and watch them fail. A mutation
   that fails nothing indicts the tests, or the prose.
6. **Read the golden diff** before `-u`. A snapshot records whatever it is given;
   this corpus has already held two shipped defects through review.

### 5. The sweeps — rules over the family, not per form

A rule remembered per form lapses on the thirty-fifth. Each of these is one test
over `ONE_PER_FORM`, which is a compiler-checked `Record<PlotForm, Plot>`, so a
new member joins every sweep automatically.

| sweep | asserts |
|---|---|
| **coverage** | every union member has a catalogue entry that draws something |
| **distinguishability** | at 1-bit, distinct glyphs ≥ categories — **over `SHARES_CELLS`**, since a category named in the gutter is told apart by reading it (C12 I25) |
| **carrier** | ≥8-bit paints cells; 1-bit falls back to the ramp (C12 I29) |
| **height** | rendered rows == `plotHeight`, every form × width (C12 I1) |
| **width** | no row exceeds its declared width (C12 I10) |
| **ambiguous width** | every frame identical in cell count at narrow and wide |
| **totality** | no series input throws, fuzz corpus × widths 1..200 (C12 I2) |
| **purity** | N renders of one input are byte-identical (C12 I11) |
| **reflow** | widths 20..200, no row exceeds, height never moves |

### 6. What a fixture must be

**A fixture must be shown to respond to the thing under test.** The heatmap's
right-anchoring was invisible for the life of the catalogue because `default`
over-fills its width; a `sparse` variant exposed it on the first render.

**Deterministic** — `Math.random()` in a fixture makes the catalogue a picture
rather than an instrument, because two runs cannot be diffed.

**Sized for the figure** — the golden boxplot fixture was 3 rows for 3
categories, so the corpus recorded the *compact fallback* as though it were the
form.

### 7. Animation

Already true, and undemonstrated. `RenderCache` keys on `(rev, width, focus,
theme)`; a `replace` patch bumps one entry's `rev`. C12 I1 means a data patch is a
same-value height overwrite, so nothing re-lays-out. `render-frame.ts` diffs row
by row. The scheduler's stream window is 33 ms — 10 Hz is 3× under budget.
C12 I11 is grep-confirmed: no module-level state.

**What is missing is a tier-5 row**: patch a live plot N times, assert the bytes
written stay bounded by the plot's own row count and sibling caches are
untouched. Plus one deliberate wrinkle — the gutter's *width* is data-dependent,
so a value crossing 99→100 shifts the plot area one column. Exercise it once so
it is chosen rather than discovered.

---

## Part IV — Order

Dependency-ordered. Items 3–10 are independent of each other.

| # | step | why here |
|---|---|---|
| 0 | ~~**The y-axis measurement fix**~~ **`78667bc`** | alone, because it has a *measurable* check — `labelWidth` at `ambiguousWidth: "wide"` — and bundling it behind a visual gate wastes that |
| 1 | ~~**Axes, ticks, frame**~~ **`78667bc`**, and C12 I26's other three shapes **`1243e0f`** | every form's furniture |
| 2 | ~~**`furniture.ts`**~~ **`78667bc`** | matrix family first as the falsifier |
| 3 | ~~**Orientation**~~ **`567eff9`** — bar, histogram, boxplot, violin | 11 forms at once, and `categoricalForm` is structurally row-major — **moved from 7**, because "before the per-form work" and "at position 7" contradicted each other and the per-form work is 8–12 |
| 4 | ~~**Painted cells (C12 I29)**~~ **`506c62d`** — and it was never wiring: C10 I21 shut the door, C10 §4c opened it via `wash` | 7 matrix forms + bars + pie wedges; wiring, highest leverage |
| 5 | ~~**Dot-grid geometry**~~ **`78667bc`** | pie, radar — one root cause |
| 6 | ~~**Legend**~~ **`234bab7`** — four placements, `SHARES_CELLS` reused | closes two recorded deferrals (`Annotation.label`, C04 §3b's five members); both carrier forms per C12 I29 |
| 7 | ~~**`CATEGORY_MARKS` + sweeps**~~ **`cc9f513`** — `SHARES_CELLS` is the partition, and §3g's legend reads the same one | the degradation ladder, gated |
| 8 | ~~**Stacking fold**~~ **`7480435`** — streamgraph 52% → 12.6% against matplotlib | `stackedarea` + `streamgraph` |
| 9 | ~~**Distribution**~~ — horizon `21ac7aa` (62.8% → 14.6%), forest `5b871b8`, ridgeline `d164270`, bandwidth `ee75b04` | violin taper + bandwidth, ridgeline overlap, forest |
| 10 | ~~**`hierarchy`**~~ **`018cbe9`** — flame, icicle, treemap | flame, icicle, treemap |
| 11 | ~~**Facet spans**~~ **`4a2efb8`** | smallmultiples, pairplot |
| 12 | ~~**Remaining new forms**~~ **`ee1b94c`** — slope, bubble, autocorrelation, timeline, bullet, utilisation; all 42 exist | slope, bubble, autocorrelation, timeline, bullet, utilisation |
| 13 | ~~**`height: "fill"`, aspect, reflow**~~ **`80e3dab`** | needs the frame settled |
| 14 | ~~**Silent tables + `PaletteName`**~~ **`1564950`** — and `palette` was removed rather than typed | close the drift class |
| 15 | ~~**Animation demo + tier 5**~~ — the demo already ships in `examples/docker` (a live CPU heatmap per tick); the tests are T4.7/T4.8, at tier 4 because `node-pty` has no prebuild here | prove, do not build |

**Spec edits commit alone and ahead of their code.** A ruling taken between
commits evaporates.

**And C12 I26's four `plotFrame` shapes landed with `1243e0f`**, which was owed
from step 1 — only `"box"` shipped with the frame itself.

---

## Part V — Standing risks

- **The compositor gets bypassed.** A third of forms declared "special", an
  escape hatch, duplication regrows inside it. *Falsifier: matrix first.*
- **One visual gate over several independent changes tells you nothing.** The
  frame, the four `plotFrame` styles, the matrix migration and the y-axis fix all
  landing together means a wrong frame does not say which caused it. Hence step 0:
  anything with a *measurable* check leaves the visual commit.
- **`plotFrame: "box"` rewrites all golden frames.** The diff is then unreadable
  as review, so the real check is the regenerated catalogue read by eye. A
  136-frame `-u` nobody reads is how a defect already shipped.
- **Orientation lands after per-form work** and eleven forms are rebuilt twice.
- **An invariant written before its subject exists is vacuous.** C12 I29's gate lands
  with the painting, not ahead of it.
- **The ambiguous-width arm is forgotten again.** Three defects so far. Every new
  glyph table needs a wide arm or a stated reason.

- **Four forms measure one thing and render another.** `radar` and `horizon`
  declare `axedFurniture` and draw none of it; `smallmultiples` and `pairplot`
  return whatever the facet layout produced. None routes through `composeRows`,
  so the compositor's guarantee does not reach them — which is the *bypass* risk
  above, already realised, in the four forms that were never migrated. Measured
  over 26 800 capability × form × width combinations. Fixing it changes the
  height table, so the spec edit goes first.

- **A gate written from a rule can fail correct code.** C12 I25’s sweep as specified
  — C12 I25’s wording, *every form at 1-bit with two or more categories draws at least as many
  distinct glyphs* — failed nine forms and eight were right, because a category
  named in the gutter is told apart by reading it. Measuring the gate before
  building it is what caught that; it would otherwise have arrived as eight
  "failures" to be worked around.

- **A defect can mask a defect.** The facet composition's byte-counting cut every
  row short, so the re-paint at its call site never fired. The correct fix made
  the frame visibly worse. Expect this wherever two clamps sit in series, and read
  the frame after a fix rather than only before it.
