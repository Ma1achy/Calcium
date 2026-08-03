# S07 — `/diff`

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Live |
| **Package** | `prism-tui` |
| **Data source** | `prism diff <a> <b> --json` → `adaptDiff` (C07) |
| **Source** | `j20` §`prism diff` · A01 D8, D38 · S04 §3 |
| **Status** | Draft |

---

## 1. Purpose

`/diff` answers one question: **what changed, and was it better?**

That second half is what separates it from a two-column table. A loss of 0.031 beside a loss of 0.037 is data; `↓ 16% better` is an answer. The direction of improvement comes from the far side — `EarlyStopping(mode=)`, `.objective(direction=)`, `MetricGate(gte=/lte=)` — and where nothing pins it, the surface says so rather than guessing.

Two-up only in v1. N-way comparison is a different layout and a different question.

---

## 2. The screen

At 100 columns:

```
▌ ── diff · a3f9b21 ↔ 7c2d4e1 ─────────────────────────────────────────────────
▌
▌                        a3f9b21              7c2d4e1
▌   family               digit-classifier  =  digit-classifier
▌   kind                 candidate         ≠  experiment
▌   status               succeeded         =  succeeded
▌   job                  TrainingJob       =  TrainingJob
▌   owner                malachy           =  malachy
▌   resources            2×GPU · 16Gi      ≠  1×GPU · 8Gi
▌   duration             14m 20s           ≠  22m 04s
▌
▌ ── metrics ───────────────────────────────────────────────────────────────────
▌
▌                        a3f9b21                        7c2d4e1
▌   loss                 0.0312       ↓ 16% better      0.0372
▌   val_accuracy         0.968        ↑  1% better      0.958
▌   auprc                0.912        ↓  2% worse       0.930
▌   calibration          0.061          — no direction  0.058
▌   train_time_s         862          ≠ not comparable  1324
▌
▌   ≡ a3f9b21   ≡ 7c2d4e1   { } json
```

**Both regions are `comparison` blocks, and a `comparison` always carries a header.** The
metrics region was drawn without one, which made it five rows where the block
renders six — C04 §3 gives a `comparison` `rows + header` and C09 §3 gives it `rows +
1`, unconditionally in both. Making the header optional would give the kind a
height rule that branches on a flag, which is what C04 §3 refuses in the
paragraph explaining why `diff` and `patch` are separate kinds.

The blank rows are `gapBefore` on the block that follows each of them (C04 §3a);
`test/contract/surfaces.test.ts` composes this frame and asserts it is the
twenty-one rows drawn here.

**The comparator column is between the values, not beside them.** Reading `0.0312 … 0.0372` across a gap and then finding the verdict at the end of the row makes the eye travel twice. Putting `↓ 16% better` in the middle means one scan answers both halves.

Fields that match collapse to `=` and are toned `muted`; the eye should land on `≠` rows.

---

## 3. Direction of improvement

Four verdicts, and the last two are the honest ones.

| Verdict | When |
|---|---|
| `↓ n% better` / `↑ n% better` | Direction is pinned and the change is favourable |
| `↓ n% worse` / `↑ n% worse` | Direction is pinned and the change is unfavourable |
| `— no direction` | The metric exists in both, no direction is declared |
| `≠ not comparable` | Present in one side only, or of different types |

**A metric with no declared direction gets no verdict.** Inferring "lower is better" from the name, or from which run is newer, produces a confident wrong answer on exactly the metrics nobody has thought about — and a wrong verdict is worse than none, because it is acted on.

The arrow shows the *direction of change*; the word shows whether that is good. `↓ 16% better` and `↓ 2% worse` both point down, and separating the two facts is what lets a single glyph vocabulary work across metrics that disagree about which way is up.

Percentages are relative to the left-hand value, and are suppressed below 0.5% — `0.9680` versus `0.9679` is noise, and dressing it as `↑ 0.01% better` invites a decision it cannot support.

---

## 4. Kind awareness

The metrics section follows the kinds S04 established.

| Both sides | Metrics section |
|---|---|
| training | Loss and declared metrics, with an **overlaid curve** under `--overlay` |
| evaluation | Gate-by-gate: pass/fail on each side, threshold shown once when identical |
| inference | Throughput, records, sink success rates |
| model_version | Artefact SHAs, with `← same` collapsing identical rows |
| mixed kinds | Common fields only, plus a notice naming what was omitted |

**Cross-kind diffs are allowed but reduced.** Comparing a training run against an evaluation is a legitimate thing to want — they may share a family and a commit — and refusing outright is unhelpful. What is refused is a run against a model_version: those are different entities with no shared spine, and the far side returns `KIND_MISMATCH`.

`--overlay` draws both series on one plot with distinct tones; at 1-bit it stacks them, per C12 §5.

**`--overlay` is training-versus-training only.** There is nothing to overlay when one side has no series — a gate table and a loss curve share no axis — so requesting it for any other pair is refused with a named error rather than silently falling back to side-by-side. A flag that quietly does something else is worse than one that says no.

---

## 5. States

| State | Render |
|---|---|
| **Loading** | C23's pending entry |
| **Populated** | §2 |
| **Identical** | Every row `=`. A notice reads `these runs differ in no compared field` — worth saying explicitly, because an all-`=` table looks like a rendering failure |
| **One side not found** | Error naming which argument failed, with the other side's resolution shown so the working half is not lost |
| **Ambiguous prefix** | The chooser from S04 §5, for whichever argument is ambiguous |
| **Kind mismatch** | The far side's `KIND_MISMATCH` envelope, rendered as C07's error path |
| **Overlay refused** | `--overlay` on a non-training pair → a named error stating why, with the side-by-side command offered as a fill |
| **No shared metrics** | Field table renders; the metrics section reads `no metrics in common` |
| **Error** | C07's error path |
| **Narrow** | §6 |

---

## 6. Layout at width

Two-up needs three columns of content plus a label column, and it degrades differently from a list.

| Width | Layout |
|---|---|
| ≥ 100 | Side by side, comparator centred |
| 80–99 | Side by side, values truncated, comparator abbreviated to the glyph alone |
| < 80 | **Stacked**: label, then `a`, then `b`, then the verdict, as a four-row group per field |

**Below 80 the layout changes rather than the columns dropping.** A diff with a dropped column is not a diff — both values must be visible or the surface has failed at its only job. Stacking costs vertical space and keeps the comparison intact, which is the right trade where dropping is not.

The `--side-by-side` and `--overlay` flags select layout explicitly and override the width heuristic; a user asking for side-by-side at 70 columns gets it, truncated.

---

## 7. Interactions

| Action | Command | Kind |
|---|---|---|
| `≡ <uuid>` | `/ps <uuid>` | fill — one per side |
| `{ } json` | `/diff <a> <b> --json` | fill |
| `↗ mr` | The MR URL | open — per side, when recorded |

No mutating actions. `/diff` is read-only by construction, and the natural next step is one of the two detail views, which is why both are offered by uuid rather than as `left`/`right`.

---

## 8. Commitments

1. Two-up only in v1; N-way is a different layout and a different question.
2. The comparator sits between the values, so one scan answers both halves.
3. Matching fields collapse to `=` and are muted, so the eye lands on differences.
4. Four verdicts, including `no direction` and `not comparable`.
5. Direction of improvement comes from the far side; nothing is inferred from a metric's name.
6. The arrow shows direction of change; the word shows whether that is good.
7. Percentages are relative to the left value and suppressed below 0.5%.
8. Cross-kind diffs reduce to common fields with a notice; run-versus-model_version is refused by the far side.
9. Below 80 columns the layout stacks rather than dropping a column — a diff missing a value has failed.
10. Explicit layout flags override the width heuristic; `--overlay` is training-only and is refused rather than silently downgraded.
11. An all-identical result is stated in a notice, because an all-`=` table reads as a failure.
12. Read-only: no action on this surface mutates anything.

---

## 9. Tests

### Tier 1 — unit

- **T1.1**: a two-run fixture adapts to rule, field table, rule, metrics table, tip.
- **T1.2**: matching fields render `=` and muted; differing fields render `≠`.
- **T1.3**: each of the four verdicts on a crafted metric pair.
- **T1.4**: a metric with no declared direction → `— no direction`, never a guess.
- **T1.5**: a metric present on one side only → `≠ not comparable`.
- **T1.6**: `↓ better` and `↓ worse` both render a down arrow with different words.
- **T1.7**: a 0.4% change → percentage suppressed; 0.6% → shown.
- **T1.8**: percentages are relative to the left value, asserted with an asymmetric pair.
- **T1.9**: mixed kinds → common fields plus the omission notice.
- **T1.10**: identical runs → the explicit notice, not a bare table.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: measured height equals rendered height at seven widths, in both layouts.
- **T2.3**: every action re-parses through C18 to the intended `ParseResult`.
- **T2.4**: no emitted command is a mutating tool — scanned against the manifest.
- **T2.5**: at every width, both values of every rendered field are present. **The invariant that defines the surface.**

### Tier 3 — edge cases

- **T3.1**: diffing a run against itself → all `=`, plus the identical notice.
- **T3.2**: one uuid not found → error naming which argument, the other side's resolution retained.
- **T3.3**: both not found → error naming both.
- **T3.4**: an ambiguous prefix on the left, a valid uuid on the right → chooser for the left only.
- **T3.5**: 200 metrics → all render; the block scrolls.
- **T3.6**: zero shared metrics → the field table renders, the metrics section says so.
- **T3.7**: a metric of `0` on the left → percentage suppressed rather than dividing by zero.
- **T3.8**: a metric that is `NaN` on one side → `≠ not comparable`.
- **T3.9**: a metric name of 200 characters → truncated; values and verdict unaffected.
- **T3.10**: at 79 columns → stacked layout; at 80 → side by side.
- **T3.11**: `--side-by-side` at 70 columns → honoured, values truncated, both still present.
- **T3.12**: `--overlay` at 1-bit → stacked series per C12 §5, total height unchanged.
- **T3.14**: `--overlay` on a training-versus-evaluation pair → named error with a side-by-side fill, never a silent downgrade.
- **T3.13**: two model_versions with identical artefact SHAs → `← same` collapse.

### Tier 4 — integration

- **T4.1** (with C11): the stacked layout below 80 is a layout change, not a column drop — asserted on the block structure.
- **T4.2** (with C12): `--overlay` produces one plot with two series; heights are declared and constant.
- **T4.3** (with C23): both `≡` actions fill the correct uuid.
- **T4.4** (with S04): `≡ <uuid>` lands on that run's detail.
- **T4.5** (with C10, C02): verdicts remain distinguishable at 1-bit — arrow and word carry it, not tone.
- **T4.6** (with C07): a `KIND_MISMATCH` envelope renders through the standard error path.

### Tier 5 — e2e

- **T5.1**: golden frames at 60 / 80 / 100 / 160 — the 60 and 80 cases prove the layout switch.
- **T5.2**: golden frames for the eight §5 states.
- **T5.3**: two real training runs → curve overlay, verdicts, both details reachable.
- **T5.4**: resizing across the 80-column boundary with a diff on screen → layout switches cleanly, no data lost either way.

### Tier 6 — fail-on-revert

- **T6.1** (C5): inferring direction from a metric's name → T1.4 fails, and unconsidered metrics get confident wrong verdicts.
- **T6.2** (C9): dropping a value column below 80 → T2.5 fails, and the surface stops being a diff.
- **T6.3** (C2): moving the comparator to the end of the row → T1.1's block structure fails.
- **T6.4** (C7): showing sub-0.5% percentages → T1.7 fails, and noise reads as signal.
- **T6.5** (C6): using one arrow to mean "better" → T1.6 fails on metrics where up is worse.
- **T6.6** (C11): rendering an all-identical diff without the notice → T1.10 fails and it reads as broken.
- **T6.7** (C3): toning matched rows the same as differing ones → T1.2 fails and nothing draws the eye.
- **T6.8** (C12): adding a mutating action → T2.4 fails.
- **T6.9** (C10): silently falling back when `--overlay` cannot apply → T3.14 fails, and a flag starts meaning something other than what it says.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Either run's own detail | S04 |
| Version catalogues | S06 |
| N-way comparison | Phase 1B |
| Where direction of improvement is declared | The far side |
| Plot overlay mechanics | C12 |
