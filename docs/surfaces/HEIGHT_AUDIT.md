# Illustrated heights, measured

C09 landed with the fourteen kinds it owns, so the S-series' illustrations can be
composed from real blocks and measured for the first time. This records what
that found.

**Scope.** The regions drawn from kinds C09 ships — `rule`, `notice`, `keyValue`,
`steps`, `logs`, `events`, `progress`, `code`, `diff`, `pills`, `tip`, `panel`,
`group`, `raw`. Regions containing a `table`, a `plot` or a `patch` are deferred:
those kinds are registered by **C11**, **C12** and **C25**, and until they exist a
measurement of them measures the `raw` fallback, which proves nothing. Named by
component, because a deferral whose blocker is wrong is indistinguishable from
one that is pending (A03 §9a).

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

Three instances, and all three were the second kind:

| Where | What the figure carried | What was missing |
|---|---|---|
| A01 Appendix A.1 | Palette values taken from a mockup | Validation against the contrast floors |
| S03 §2 | Columns in an order §3's priorities contradict | Nothing — the picture was simply wrong, *and* it also carried the next row |
| S03 §3, S05 §3, S06 §5, S15 §5 | `metric`, `age`, `errors`, `p99`, `req/s`, `p50`, `versions` right-aligned | `align`, which `ColumnDef` requires |

**Illustrations are where intent leaks in without being recorded.** They are drawn
by eye against an idea of how the thing should look; the spec text is written
separately, and nothing compares them. That is the commitment/invariant divergence
one artefact over — two parallel descriptions of the same thing, with no mechanism
asserting they agree — and it has now produced a defect three times.

S03 §2 is the case that shows both halves at once. Its column *order* was a drawing
error and §3's table won; its right *alignment* was an unstated intent and the
table changed to record it. Same figure, same commit, opposite verdicts.

The mechanical part of this is covered: row counts are read from the markdown by
`test/contract/surfaces.test.ts`, and every stated drop order is checked against
`planColumns` (A03 CP6). What has no mechanism is alignment, truncation side, and
anything else a figure can show that a table can omit — S14 §7 records a
left-truncating `key` column that `ColumnDef` cannot express at all, found while
declaring `align`. The check for those is a person comparing a figure to a table,
which is what this section is for.

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
| S03 `ps` list, S05 serving, S06 models, S14 config, S15 identity | **C11** — the illustrated region is a table |
| S04 run detail, S09 test, S13 dashboard | **C11** and **C12** — tables and plots |
| S07 §3 patch region | **C25** |

Each becomes measurable on the commit that registers its kind, and the
composition-level assertion that all seventeen kinds are registered (C09 T2.6)
lands with the last of them.
