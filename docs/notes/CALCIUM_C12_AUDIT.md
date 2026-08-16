# C12 audited against the tree, form by form

**Why this exists.** Two defects in one component, both **inherited rather than invented**:
`sparkline` took `line`'s *filtered before scaling* and applied it to positions; the heatmap
took `sparkline`'s height ramp and applied it to a density field. Each was a correct rule from
the arm next door. Each produced a picture that is arithmetically right and visually
meaningless, which no count can see.

So the audit's index is **the encoding**: a ramp is not a lookup table — it encodes a value
along an axis, and height, density and fill are three different axes. A renderer using the
wrong one agrees with every assertion in the suite.

Measured against HEAD, rendered and read. Nothing here is fixed; the last six audits all found
more than the fix that motivated them, and fixing during one is how the rest go unlooked-at.

---

## 1 · The forms, claim against measured

| form | what the spec says it draws | what the code draws | ramp, and is the encoding right for the geometry | gap | degenerate range | verdict |
|---|---|---|---|---|---|---|
| **line**, unicode | braille grid, 2×4 dots, points joined by Bresenham (§3) | braille grid, points joined | **no ramp** — a dot is plotted *at* a position. Position encoding, exact | breaks across it, position kept (C12 I4) | flat at vertical centre (C12 I3) | **agrees** |
| **line**, ASCII | "column ramp `.:-=+*#@`, 1×8 subcells" (§6) | `foldRamp` maps the topmost inked dot-row to a ramp index: bottom → `.`, top → `@` | **density standing in for height.** `.:-=+*#@` has no vertical structure — `.` sits on the baseline, `@` fills the cell — so a reader infers height from ink weight rather than seeing it. The spec says *1×8 subcells* and never says what the ramp encodes | breaks across it | flat at centre | **⚠ substitute encoding, undocumented** |
| **sparkline** | one ramp glyph per sample, one sample per cell (§3) | as stated | `RAMP_UNICODE` / `RAMP_BRAILLE` at wide — **both fill bottom-up. Height, and the cell is a column of a vertical axis.** Right | `?`, position kept (C12 I4, §4) | middle step (C12 I3) | **agrees** |
| **heatmap** | one cell per position per row, shared range, ink density (C12 I17, §3a) | as stated | `RAMP_DENSITY`, dots spread. **Density, and a grid cell has no vertical axis.** Right — *and this is the correction this audit exists downstream of* | blank, position kept | middle step, legend states the range | **agrees** |
| **heatmap**, ASCII | — (§6 does not name the heatmap) | `.:-=+*#@` | **right axis here, by accident of inheritance.** ASCII has only ink-density, which is the heatmap's own axis and the line's substitute — so at ASCII the heatmap is exactly encoded and the *line* is the one making do. The inversion is worth stating because it is invisible from either form alone | blank | middle step | **⚠ correct and unstated** |
| **progress** | one table row: "Label, bar, percentage; bar takes the residual width" (C09 §4) | `█`/`░` at unicode, `#`/`.` at ASCII and at `ambiguousWidth: "wide"` | **fill** — horizontal proportion of a bar. Right axis, and the substitution at `wide` is right because `█` and `░` are Ambiguous | n/a — no gap concept | see below | **⚠ three unwritten rulings** |

---

## 2 · One value repeated — the degenerate range, per form

The walk named it for the heatmap. Line and sparkline have it too, and they do not answer alike.

| form | measured | is it honest? |
|---|---|---|
| line, `axes: true` | flat line at vertical centre; y-labels all read the value | **yes** — the labels say what the flat line is |
| line, `axes: false` | flat line at vertical centre, **and nothing says what value** | **⚠ §4 claims otherwise.** *"Flat line at vertical centre; y-labels all show that value"* is written unconditionally, and with `axes: false` there are no labels at all. The sentence is true of one arm and stated of both |
| sparkline | `▄▄▄▄▄▄` — the middle step | **yes, and it has no way to be better.** A cell has no block, so there is nothing to pin or label with; §2 already records that |
| heatmap | mid-density in every cell, legend reads `5 - 5` | **yes** — the legend is what A4 ruled it needed, and this is the case that justified it |
| progress, `total: 0` | `0%`, empty bar | **undocumented.** Defensible; nothing says it |
| progress, `current > total` | clamped to `100%` | **⚠ and the tree disagrees with itself.** `examples/docker`'s CPU bar deliberately overflows past 100 (DASHBOARD_WALK A4: `CPUPerc` is per-core-normalised, so 780% is ordinary and a bar that stops at 100 draws a busy container identically to a saturated one). Both rulings are right for their own quantity — one is written down and one is a line of code |

---

## 3 · The capability rungs, asserted rather than described

| rung | line | sparkline | heatmap | progress |
|---|---|---|---|---|
| unicode, 24-bit | braille | `▁▂▃▄▅▆▇█` | `⠄⠔⠖⠶⠷⠿⡿⣿` | `█ ░` |
| `unicode: "ascii"` | `.:-=+*#@`, axis `+-\|` | `.:-=+*#@` | `.:-=+*#@` | `# .` |
| `ambiguousWidth: "wide"` | braille (narrow already); axis substitutes to ASCII | `⡀⣀⣄⣤⣦⣶⣷⣿` | `⠄⠔⠖⠶⠷⠿⡿⣿` (braille is narrow) | `# .` |
| `colourDepth: 1` | stacks into strips (C12 I6) | n/a, single-series | unchanged — **the glyph was always the channel** | unchanged |

**⚠ The 1-bit rung is asserted through a fixture that is also ASCII.** `MONO_CAPS` is
`{colourDepth: 1, unicode: "ascii"}`, so **there is no fixture for 1-bit with Unicode** — and
every claim in C12 about what happens *at 1-bit* (C12 I6's stacking, C12 I17's *the glyph is the
channel at every depth*) is measured only where Unicode has also been removed. Two capabilities
moving together in the only fixture that exercises either is the shape of *a test must
construct the state it claims*: the picture at 1-bit-with-braille is unrendered by anything.

---

## 4 · The disagreements, ranked

### D1 — A2 is ruled and inverted in the code · **heatmap**

§6a A2 ruled: for a heatmap the drop order **inverts** — a heatmap's row labels *are* its
ordinate, so columns go first, then labels truncate, and an unlabelled matrix is never
rendered. `layoutFor` does the opposite, unchanged from the line form: it keeps the labels and
starves the cells.

```
heatmap, labels 26 cells wide

  at 40   a-very-long-container-name │      ⠄⠔⠶⠷⡿⣿      six cells of matrix
  at 24   a-very-long-container-n…                      NO MATRIX AT ALL
  at 12   a-very-long…                                  NO MATRIX AT ALL
  at  3   ⠷⡿⣿                                            labels dropped, matrix drawn
```

Below 24 the block is a column of names. At 3 the fallback drops the gutter and the matrix
comes back — so the drop order is **labels last**, exactly inverted from the ruling.

### D2 — a label emitted into a zero-width column · **heatmap and stacked line**

The middle layout keeps the axis and drops the labels: `gutter: 2`, `labelColumn: 0`.
`padStart(label, 0)` does not truncate, so the full label is emitted and the row clamp eats the
plot area. **`overlaidRows` already guards against exactly this** — `layout.labelColumn === 0 ?
[] : yLabels(…)`, with a comment recording the `0.82 │⢣…` frame it was written for — and
neither `stackedRows` nor `heatmapRows` inherited the guard.

```
stacked, 1-bit, at 20

  |a-very-long-series-~|      strip row 0: label, no plot area
  | |.:-=++*#@|               strip row 1: plot area, no label
```

So it is **not a heatmap defect**: the heatmap copied a pattern that was already wrong one
function away, and the fix for it is twenty lines above in the same file. Third inheritance.

### D3 — the legend truncates, and it is the reason `axes: false` is refused

The scale legend is placed at `gutter` offset, so a wide label column leaves it a fraction of
the row:

```
at 40, labels 26 wide     ⠄⠔⠖⠶⠷⠿⡿⣿  1…
at 24, 60 positions       ⠄⠔⠖⠶⠷⠿⡿⣿  0 - 59 · 3…
```

The range is the half that gets cut, and the dropped-column notice (`36 older not shown`)
truncates to `3…`. **A refusal is justified by a row that silently loses what it refuses to be
without** — C04 I50b's argument is *the legend is the only thing that says what a cell means*,
and at ordinary widths it does not say it.

### D4 — §4 states a conditional claim unconditionally · **line**

*"Flat line at vertical centre; y-labels all show that value."* True with `axes: true`, and
with `axes: false` there are no labels. The block still renders honestly; the spec sentence
does not.

### D5 — the ASCII line's ramp is a substitute encoding, and nothing says so · **line**

`foldRamp` indexes `.:-=+*#@` by height within the cell. It is monotone and readable, and it is
**density standing in for height** — the same substitution that produced the heatmap defect,
here as a deliberate compromise nobody wrote down. §6 says *1×8 subcells* and stops. The
consequence a reader would want stated: at ASCII a line and a filled area are hard to tell
apart, because a value near the cell's top draws a glyph that fills the whole cell.

### D6 — `progress` has three rulings and one table row

`total: 0` → `0%`. `current > total` → clamped to `100%`. The glyph pair substitutes at `wide`.
None is in the spec, and the clamp is contradicted by a shipped consumer that deliberately
overflows for a quantity whose ceiling is not knowable.

---

## 5 · What the audit did **not** find

Worth stating, because an audit that reports only hits reads as complete.

- **The heatmap's own rulings hold.** Shared range, blank absence, density ramp, C12 I8 truncation,
  declared height with the row count as data, the three refusals at both gates — every one
  measured as specified.
- **`line` at unicode is exact.** Position encoding, no ramp, no substitution.
- **The `wide` rung is right in all four forms**, which was the arm with no golden frame two
  commits ago.
- **`sparkline`'s two ramps are both height ramps**, which is the correct axis for a cell that
  is a column of a vertical axis — the property the heatmap defect made worth checking.

---

## 6 · The shape across all three defects

Three inheritances now, and they run in both directions:

| | took | from | applied to | visible as |
|---|---|---|---|---|
| 1 | *filtered before scaling* | `line` | positions in `sparkline` | a gap that closed and a row a glyph short |
| 2 | the height ramp | `sparkline` | a density field in `heatmap` | rows of bar fragments |
| 3 | **a missing guard** | `stackedRows` | `heatmapRows` | a label with no matrix beside it |

The first two are a **rule** carried into a geometry it does not fit. The third is the
inverse — a **fix** that was not carried into a copy that needed it — and it is the one no
amount of thinking about encodings would have found. What found it was rendering the block at
five widths and looking.
