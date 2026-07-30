# Illustrated heights, measured

C09 landed with the fourteen kinds it owns, so the S-series' illustrations can be
composed from real blocks and measured for the first time. This records what
that found.

**Scope.** The regions drawn from kinds C09 ships — `rule`, `notice`, `keyValue`,
`steps`, `logs`, `events`, `progress`, `code`, `diff`, `pills`, `tip`, `panel`,
`group`, `raw`. Regions containing a `table`, a `plot` or a `patch` were deferred:
those kinds are registered by **C11**, **C12** and **C25**, and while any of them
was unbuilt a measurement of it measured the `raw` fallback, which proves nothing.

**All three exist now**, so no surface is deferred on a kind any more — every
remaining deferral waits on **C22**, for the frame around a whole screen rather
than for a block inside it. Named by component, because a deferral whose blocker
is wrong is indistinguishable from one that is pending (A03 §9a) — and TD4 is
what checks the naming, after two such deferrals were found by hand.

**Verdicts, not numbers.** A delta recorded as `S08: +4` gets reconciled later by
adjusting whichever side is easier to edit. Each row below says which side is
wrong and why.

**And it is a test now, not a reading.** `test/contract/surfaces.test.ts`
composes each frame from the blocks its surface is drawn from and asserts the
result is the number of rows the illustration draws — read from the markdown, so
a fixture cannot agree with itself while the picture drifts. That is what would
have caught §2 without anyone reading it.

---

## When an illustration and its tables disagree

**The tables win — unless the illustration encodes an intent the tables never
stated, in which case the finding is a missing declaration rather than a wrong
picture.** The distinction decides what gets edited, and getting it backwards
either enshrines a drawing error or deletes a real decision.

Instances, and the first three were the second kind:

| Where | What the figure carried | What was missing |
|---|---|---|
| A01 Appendix A.1 | Palette values taken from a mockup | Validation against the contrast floors |
| S03 §2 | Columns in an order §3's priorities contradict | Nothing — the picture was simply wrong, *and* it also carried the next row |
| S03 §3, S05 §3, S06 §5, S15 §5 | `metric`, `age`, `errors`, `p99`, `req/s`, `p50`, `versions` right-aligned | `align`, which `ColumnDef` requires |
| S01 §2, S03 §2, S13 §2 | A number and a sparkline in one `metric` cell | Nothing — see the fourth verdict below |
| S04 §3, S11 §2 | A plot area two cells right of its label, data flush to the axis | Nothing — C12 §2 declared three cells and the **figures were right**; see the fifth verdict |
| C25 §2 (first draft) | A trailing `⋯ 31 unchanged lines` after the last hunk | `Hunk.collapsedBefore` covers the region *before* a hunk; the region after the last one is unrepresentable. **Fourth verdict class, second instance** — resolved by `Patch.collapsedAfter`, because neither side was wrong |

### The fourth verdict: neither side is right

**A figure arithmetically impossible under its own declared columns.** Not a drawing
error, not an unstated intent — a figure and a table contradicting each other on a
number *both* state. The other three verdicts are resolved by picking a side. **This
one is resolved by changing the schema**, because picking either side keeps a defect:
the figure could not be produced, and the table could not express what the figure was
for.

The sparklines are the instance. S01 §2 and S03 §2 drew `0.0372 ▁▂▃▅▆` in S03's
`metric` column — 12 cells, five samples — while A01 A.2 windows a sparkline to eight
points at one glyph per cell, so the cell wanted 6 + 1 + 8 = 15, and §3 declared
`metric` at `min` 8 with no `flex`, so it got 8. Neither number was wrong about what
it described. What was wrong was that one cell held two values.

The resolution is a twelfth column: `spark`, `min` 8, priority below `owner`. A cell
holds one value, because C11 truncates a cell at its planned width and a
number-plus-series either loses digits or becomes a shorter series that reads as real
— and S03 had already learned this for `status`/`detail`, which is what made it a
principle rather than a case. The arithmetic then favours the reader: 112 cells for
all twelve, and at 100 the spark is what drops, so **decoration goes before a data
field does**.

Found by checking the illustrated widths before building C12 rather than by C12
failing to reproduce them, which is the cheaper order.

S01 §2 carried the same cell **and** drew `running · ep 17/40` as a single status
cell, which S03 commitment 2 forbids and S03 T6.1 is the fail-on-revert test for.
Both are corrected there now rather than left until C22 makes that frame composable:
a spec that contradicts a sibling spec's fail-on-revert test is worse than a stale
picture, because the test passes and the spec still says the wrong thing.

**S13 §2 is the third instance, and it arrived with the S15 §5 gap attached.** Its
Running panel is a table that declared no columns — so there was no priority to
put `spark` below and no drop order for CP6 to check — and its sparkline was
impossible twice over: five samples where the window is eight, and no `█` where
normalising within `[min, max]` puts the maximum sample. Both fixed in S13 §2, by
the same remedy S03 took, which is what a mechanical fix looks like the third time.

### The fifth verdict: the figure is right and the declaration changes

The other four are resolved by editing the figure, by declaring what the figure
implied, or by changing the schema. **This one edits the prose.** C12 §2 declared
the axed plot area as `width − yLabelWidth − 3`, for a space, the `│`, and a space.
S04 §3 and S11 §2 both drew two — label, space, `│`, data flush against the axis.

The figures won and §2 became `− 2`. A margin between an axis and its data is a
habit from charts that have one; in a terminal it renders as the leftmost sample
floating away from the line it belongs to. **The evidence is that two figures drew
it independently**: one disagreeing with the text is a slip, two agreeing with each
other against the text is the text being wrong.

Worth separating from the first verdict class, because the remedy is opposite and
the symptom identical. Both look like a figure and a table disagreeing; deciding by
which artefact is easier to edit gets one of them backwards every time.

**And applying the two-figures clause here was a mistake, which is worth keeping.**
C25's illustration drew a trailing `⋯ 31 unchanged lines` that `Hunk.collapsedBefore`
cannot express — the field covers the region before a hunk, so the tail has nowhere to
live. It was filed as a figure slip on the reasoning that one figure disagreeing with
a declaration is a slip and two agreeing against it is the declaration being wrong.

**The count was the wrong test, and asking it was the error.** It separates the first
verdict class from the fifth, and both of those resolve by *picking a side* — the
count says which. This is the fourth class, where there is no side to pick: the figure
was right that a tail gets elided, and `collapsedBefore` was right about the regions it
covers. Counting figures cannot distinguish "one of these is wrong" from "both are
right and the shape is short a field", because it never asks whether a side is wrong at
all.

So the question that comes first is **is either side wrong about what it describes** —
and only if one of them is does the count decide which. `Patch.collapsedAfter` is the
resolution, on `Patch` rather than `Hunk` so the interior regions stay one field's and
nothing double-counts the gap between two hunks (C04 §3).

And it is not a rare case, which is what should have prompted the second look: one hunk
at line 18 of a two-hundred-line file elides fourteen lines above and a hundred and
seventy below, and the larger of the two was the unrepresentable one.

### The braille figures, measured

C12 landing made the curves checkable for the first time, and **neither illustrated
plot could have been produced from any data.** Decoded into their dot grids
(`U+2800 + mask`, dots 1,2,3,7 left and 4,5,6,8 right):

| Figure | Cells | Dot grid | Empty interior dot columns | Curve reached |
|---|---|---|---|---|
| S04 §3 | 29 × 5 | 58 × 20 | **6, 7, 23, 36, 37** | 29 of a 38-cell area |
| S11 §2 | 14 × 3 | 28 × 12 | **6, 7, 15** | 14 of a 28-cell area |

Both are the **first** verdict class — drawing errors, and the tables win. Bresenham
(C12 I14) inks every dot column a segment crosses, so an interior gap is only
possible where a non-finite sample was filtered (C12 §4), and a loss curve has none.
And C12 §4 spreads samples across the full width while the x-labels put `now` at the
right edge, so a curve stopping three-quarters of the way along contradicts its own
label row.

S11 carried a third defect that turned out **not** to be the figure's: it drew two
y-labels where §3 made three unconditional. §3 was the side that was wrong, because
T3.2 renders `height: 1` with axes and three labels cannot be placed in one row — so
the section contradicted its own test, and C12 I15 now collapses labels from the
middle outward. The figure gains its midpoint.

Both figures are regenerated from `plotDefinition` rather than redrawn, and both now
end on the number their own metrics row states — S04's min label is the `loss 0.0372`
beside it and S11's is `train_loss 0.312`, where the old figures' `0.04` and `0.31`
only happened to resemble them.

**Illustrations are where intent leaks in without being recorded.** They are drawn
by eye against an idea of how the thing should look; the spec text is written
separately, and nothing compares them. That is the commitment/invariant divergence
one artefact over — two parallel descriptions of the same thing, with no mechanism
asserting they agree — and it has now produced a defect four times.

S03 §2 is the case that shows both halves at once. Its column *order* was a drawing
error and §3's table won; its right *alignment* was an unstated intent and the
table changed to record it. Same figure, same commit, opposite verdicts.

The mechanical part of this is covered: row counts are read from the markdown by
`test/contract/surfaces.test.ts`, and every stated drop order is checked against
`planColumns` (A03 CP6). What has no mechanism is anything else a figure can show
that a table can omit. The check for those is a person comparing a figure to a
table, which is what this section is for.

### The truncation side, audited

Declaring `align` turned up a second unstated intent in the same paragraph, and
auditing it found the class is wider than the field that now expresses it.
`ColumnDef.truncateFrom` (C04 I32) covers a table column; **nine places in the
S-series state a side and only four are table columns.**

| Surface | What truncates from the start | Expressible |
|---|---|---|
| S14 §7 | `key` — the leaf, or `ui.theme` and `ui.show_banner` read alike | **yes**, declared |
| R01 §5 | `image` keeps its tag, `ports` its host port | **yes**, declared |
| S05 §5 | Pod names keep the hash suffix | **yes**, declared |
| S09 §4 | Test names keep the method | **yes**, declared |
| S04 §4 | `image` — a `keyValue` row, not a column | no field on `keyValue` |
| S08 §4 | Paths keep the filename and line — `keyValue` | no field on `keyValue` |
| S15 §6 | Emails keep the domain — `keyValue` | no field on `keyValue` |
| S10 §5 | File paths in a `steps` detail | no field on `steps` |
| S11 §4 | Build log tails — `logs` lines | no field on `logs` |

**The four table columns are declared.** S05's pods and S09's user tests needed a
column table first — they had none, which is the S15 §5 finding a third and fourth
time — and both now state priorities, minimums, alignment and side.

**The other five are strings, not columns, and the shape is settled**: C04 §3's
`Truncatable`, a bare string meaning `"end"`, landing on `keyValue` values, `steps`
detail and `logs` messages. One type rather than five fields, because the crux is
identical at every site — the producer knows the side and the renderer knows the
width, so it must be declared and cannot be pre-applied. It gets its own commit: a
C04 schema change with a C09 consequence in every kind that renders a truncatable
string is not something to fold into whichever component needed it next.

S06 states a **third** value: SHAs truncated in the middle, keeping both ends,
because that is what people compare by eye. It is deliberately outside the union.
A middle truncation spends its marker between two kept halves, so the arithmetic
is two budgets and a centred marker rather than one budget and a trailing one, and
C09 I9's rule is written for the single-ended case. It arrives with a clause there
or not at all.

---

## 1. Separator rows belong to nobody — **resolved: `gapBefore`**

Almost every surface draws a blank row between block regions. S08's success frame
illustrates 17 rows and composes to 13; S12's panel illustrates 8 inner rows and
composes to 7. The pattern is consistent: one blank row per join.

**No block emits one.** A `rule` is one row of rule, a `steps` is one row per
step; nothing in C04's vocabulary produces vertical space, and C09 renders blocks
adjacent because that is what the measurement rules say. So the surfaces as drawn
cannot be composed from the vocabulary as specified.

This is not a C09 defect and not quite a surface defect either — it is a decision
nobody has taken. Three ways it could be taken, and they are not equivalent:

| Resolution | Consequence |
|---|---|
| A spacer block kind | An eighteenth kind whose only content is its height. Measurable, explicit, and one more thing every consumer must know about |
| L4 inserts a row between top-level blocks | The composition root's business (C23), invisible to `measure`, and it changes what C14 must virtualise: the transcript's height stops being the sum of its blocks' |
| Surfaces stop drawing them | Honest, and denser than every illustration in the S-series |

**Resolved as the first option, sharpened.** `gapBefore?: boolean` is a field on
every block (C04 §3a), and the height rule lives at the *sequence* rather than
the block: `measure(block, w)` never counts a gap, and a run of blocks is `Σ`
their heights plus one row per `gapBefore`. So a block still measures the same
wherever it appears — C14's cache stays keyed on the block and the width — and
every composer uses one arithmetic, including a `panel`'s children and a
`column` group's. C23 §2 commits to adding no spacing of its own, and C24's
builders set the default per kind so an adapter that never thinks about rhythm
gets the one the surfaces draw.

S08's seventeen-against-thirteen is now a checked claim: four `gapBefore`s.

---

## 2. S07's metrics region draws a `diff` with no header — **fixed in S07**

S07 §2 illustrates the metrics comparison as five rows:

```
▌   loss                 0.0312       ↓ 16% better      0.0372
▌   val_accuracy         0.968        ↑  1% better      0.958
▌   auprc                0.912        ↓  2% worse       0.930
▌   calibration          0.061          — no direction  0.058
▌   train_time_s         862          ≠ not comparable  1324
```

A `diff` measures **rows + 1** — C04 §3 says "rows + header" and C09 §3 says
"rows + 1", so the header is unconditional in both. Rendered, this region is six
rows. The identity region above it draws its header and is correct at eight.

**The surface was wrong**, and S07 now draws the header its sibling region
already had. The alternative — making the header optional — would give `diff` a
height rule that branches on a flag, which is exactly what C04 §3 refuses for
`patch` and `diff` in the paragraph explaining why they are separate kinds.

The frame composes to twenty-one rows and the illustration draws twenty-one,
asserted on every run.

---

## 3. `Diff` carries no header labels — **C04 gap, no height delta**

S07 heads its columns with the two run identifiers, `a3f9b21` and `7c2d4e1`.
`Diff` is `{field, a, b, comparison}` and carries nothing to put there, so C09
renders `field · before · after`. One row either way, so nothing drifts — but the
surface cannot say what it is comparing, which is most of the point of a diff.

Left as a finding rather than a change: adding two optional labels to `Diff` is a
C04 edit, and C04 is the schema every surface derives from. It should be made
because a surface needs it, in the commit that needs it, not speculatively here.

---

## 4. S08's `keyValue` draws three columns — **surface defect, no height delta**

```
▌   callbacks     3                  MLflowLogger · Checkpoint · EarlyStopping
▌   estimated     ~14 minutes        based on similar runs · confidence high
```

`keyValue` is a label and a value. The third column is drawn by padding inside
the value string, which renders identically and measures identically — five rows
either way — but it is a table pretending to be a key/value list, and it will
misalign the moment a value is long enough to truncate.

Either the illustration should stop implying a column that does not exist, or the
region should be a `table` with `showHeader: false` — which is the shape C04 §3
added `showHeader` for.

---

## 4a. S04 §3's metrics line is a `keyValue` with three columns — **fixed in S04**

The same defect as §4 above, and the first one with a **height delta**: the line
draws three label/value pairs on one row, `keyValue` is one row per pair, so the
region composed to fifteen rows against the thirteen it draws.

Fixed by taking §4's own remedy — `table` with `showHeader: false` — rather than
being recorded again. Two instances of one shape is a pattern; the second one
should not be left as a finding when the first already names the fix.

---

## 5. S08's `notice` continuation indent — **surface defect, no height delta**

The warning region hangs its continuation lines eight cells in, under the code:

```
▌   ▲ W004  ESCAPE_HATCH_USED
▌           MultiMetricEarlyStopping replaces=prism.EarlyStopping
```

C09 hangs a notice's continuation at the glyph's width — two cells — so the text
aligns under the text rather than under the code. Three rows either way.

The illustration is drawing a structure the block does not have: a code, then a
message. That is `keyValue` with the code as the label, or a `notice` per line.
It reads better than what C09 renders, which is an argument for changing the
surface's *composition*, not for a notice that indents to an arbitrary column.

---

## 6. S12's panel does not close — **drawing defect**

S12's illustration has its log rows ending one column short of the blank and rule
rows below them, so the right border is ragged. Nothing measures wrong; the
drawing is inconsistent with itself. Worth fixing because a border that does not
close is exactly the symptom C09's `panel` now produces when a child's measured
and rendered heights disagree, and a surface that draws one by hand teaches
readers to ignore it.

---

## Where the check stands

Composed and asserted: **S07 §2**, **S08 §2**, **S08 §3**. The rest is deferred
below, each naming the component that makes it composable — a deferral whose
blocker is wrong is indistinguishable from one that is pending (A03 §9a).

## Deferred, by component

| Surface | Waits on |
|---|---|
| S13 dashboard | **C22** — see below |
| S01, S02, S10, S11, S12 | **C22** — whole screens |

Composed and asserted: S03, S05, S06, S14, S15 (with C11), and **S04 §3 and S09
§2 (with C12)**.

**Three corrections to this table, and two of them were wrong from the day they
were written.**

**S09 waited on a component it had nothing to do with.** It was listed as waiting on
C11 *and* C12 and has no plot at all — its composition is `rule, rule, steps, notice,
rule, table, notice` (S09 T1.1) — so it became writable when C11 landed and stayed
exempt for a whole component.

**S07 §3's "patch region" does not exist.** The row deferred it to C25. S07 §2 draws
two `diff` blocks and is already composed and asserted; §3 is "Direction of
improvement", a table of four verdicts with no illustration in it; and the only
mention of `patch` anywhere in S07 is the sentence explaining why `diff` and `patch`
are separate kinds. The surface that draws a patch is **S10 §4a**, which has no
illustration fence of its own and is already inside the C22 line. So the row is
**deleted** rather than expired: there was never anything for C25 to make composable.

**And that is the second instance, one component after the first.** When S09's was
corrected, this file recorded that the half TD3 does not cover has no mechanism.
It has one now — **A03 TD4**: a surface deferral naming a component whose kind does
not appear in that surface's own composition fails, which catches both of these from
two things a surface spec already states. The correction that closes the class rather
than the instance, on the third defect being the second one found by hand.

**S13 moves to C22**, and not because of C12. Its illustration is a whole screen —
an outer `panel` with a title and a footer, wrapping a `group` of five inner panels —
which is the shape S01 and S12 already wait on C22 for. Its table and its sparkline
are composable today; the frame around them is not.

Each becomes measurable on the commit that registers its kind, and the
composition-level assertion that all seventeen kinds are registered (C09 T2.6)
lands with the last of them.
