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

---

## 1. Separator rows belong to nobody — **unassigned seam**

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

**It belongs to C23**, which is what composes a document into a transcript entry,
and it needs a test wherever it lands: whichever answer is chosen, the sum C14
virtualises has to agree with what the frame draws. Recorded here rather than
resolved, because C09 cannot resolve it — a block library that invented spacing
would be answering a question the composition root has not been asked yet.

---

## 2. S07's metrics region draws a `diff` with no header — **surface defect**

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

**The surface is wrong**, and it is wrong in the way that is cheapest to fix: the
metrics `diff` needs its header drawn, as its sibling already has one. The
alternative — making the header optional — would give `diff` a height rule that
branches on a flag, which is exactly what C04 §3 refuses for `patch` and `diff`
in the paragraph explaining why they are separate kinds.

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

## Deferred, by component

| Surface | Waits on |
|---|---|
| S03 `ps` list, S05 serving, S06 models, S14 config, S15 identity | **C11** — the illustrated region is a table |
| S04 run detail, S09 test, S13 dashboard | **C11** and **C12** — tables and plots |
| S07 §3 patch region | **C25** |

Each becomes measurable on the commit that registers its kind, and the
composition-level assertion that all seventeen kinds are registered (C09 T2.6)
lands with the last of them.
