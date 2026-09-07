# S04 — Run detail

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Live — navigable while newest |
| **Package** | `prism-tui` |
| **Data source** | `prism ps <uuid> --json` → `adaptPsDetail` (C07) |
| **Source** | `j20` §The detail view · scratchpad 2 §4 · A01 D3, D8 |
| **Status** | Draft |

---

## 1. Purpose

`/ps <uuid>` is the only verb in the set with **four layouts behind one name**. A training run shows a loss curve, an evaluation shows a gate tree, an inference run shows throughput, a study shows a Phase-2 placeholder. The identity block is common; everything below it is not.

That makes it the last structurally novel surface. The three groups that follow — table-shaped, steps-shaped, and small — are variations on work S03 and this one have already done.

It is reached by `⏎` on an S03 row, which **appends a new entry rather than pushing a view**. The list freezes above it and stays there: scrolling up shows both, with the focused row still visible. That is the transcript model working as intended, and it is why the drill chain has no back key — there is nothing to pop, only scrollback.

---

## 2. The common block

Identical for every kind.

```
▌ ── run · a3f9b21-c821-4f3a-9e8d-44a1b2c3d4e5 ────────────────────────────────
▌
▌   kind        candidate · TrainingJob
▌   family      digit-classifier
▌   status      ● running · epoch 17 / 40
▌   owner       malachy@fmx.io
▌   submitted   14:00:14 UTC   (23m ago)
▌   mr          !1248  auto-merged (CODEOWNERS)
▌   image       registry.fmx.io/fraud-detection/prism-executor:a3f9b21
▌   resources   2×GPU · 16Gi · gpu-04.fmx.internal
```

The full UUID, not the seven-cell form — this is where you copy it from. `mr` carries an `open` action; nothing else here is actionable.

Fields absent from the envelope are **omitted, not rendered empty**. A queued run has no node and no image yet; showing `node —` implies the field is meaningful and unset rather than not-yet-existing.

---

## 3. Kind-specific sections

### Training

```
▌ ── loss · epoch 17 / 40 · 43% ────────────────────────────────────────────────
▌
▌       ┌──────────────────────────────────────────────────────────────────────┐
▌   1.0 ┤                                                                      │
▌       │╶─────╮                                                               │
▌   0.5 ┤      ╰───────────╮                                                   │
▌       │                  ╰────────────────────────╮                          │
▌   0.0 ┤                                           ╰─────────────────────────╴│
▌       └┬─────────────────────────────────┬──────────────────────────────────┬┘
▌        epoch 0                        epoch 20                            now
▌
▌   ████████████░░░░░░░░░░░░░░░░  43%
▌
▌   loss 0.0372 ↓     val_acc 0.968 ↑     eta 18m
```

**This curve is C12's output, not a drawing.** The earlier one was drawn by eye and could not have been produced from any data, in three independent ways that only the rasteriser finds:

| What | Measured |
|---|---|
| Interior dot columns with no ink | **6, 7, 23, 36, 37** — Bresenham (C12 I14) inks every column a segment crosses, so the only defined gap is a filtered non-finite value (C12 §4), and a loss curve has none |
| Where the curve stopped | 29 cells of a 38-cell plot area, while C12 §4 spreads the samples across the full width and the x-labels put `now` at the right edge |
| The gutter | Two cells — label, space, `│` — against §2's declared three. Here the **figure was right**: the data sits flush against its own axis, and C12 §2 changed to `− 2` |

The first two are drawing errors and the tables win; the third is the fifth verdict class in `HEIGHT_AUDIT.md` — a declaration changing because two figures drew the same thing independently.

Height 5, width 76, eighteen epochs from 0.82 to 0.0372. **The labels are `1.0 · 0.5 · 0.0` and not the data's own ends**, because a derived bound snaps outward to the nice step (C12 I22, C04 I29): loose labelling exists so the ends read round, and the price is that the floor of the axis is not the floor of the series. `loss 0.0372` is the metrics row's job and the axis is a scale — a tick is a mark on one, not the answer (C12 §3d, F175).

**This figure had been stale before the frame arrived**, and by more than a row: it drew `0.82 · 0.43 · 0.04` where the renderer has been drawing `1.0 · 0.5 · 0.0`, and it drew braille where a narrow-ambiguity terminal gets the line-draw curve. Re-rendered from the fixture rather than adjusted, which is what "C12's output, not a drawing" is supposed to mean — and the row-count check in `test/contract/surfaces.test.ts` could not see either error, because it counts rows.

A `plot`, a `progress`, and a **headerless `table`** of headline metrics with direction arrows. Arrows come from the metric's declared direction of improvement, not from the sign of the delta — a rising loss is worse and a rising accuracy is better, and only the far side knows which is which.

**The metrics line was described as a `keyValue` and cannot be one.** It draws three label/value pairs on a single row, and `keyValue` is one row per pair (C09 §3) — so as written the region composed to fifteen rows against the thirteen it draws. This is the S08 §4 finding a second time, and it takes the same remedy: `table` with `showHeader: false`, which is the shape C04 §3 added the flag for. Found by composing the region rather than by reading it, which is what `test/contract/surfaces.test.ts` is for.

A settled run drops the progress bar and the eta; the curve remains.

### Evaluation

```
▌ ── gates · 3 of 4 passed ─────────────────────────────────────────────────────
▌
▌   gate              value      cmp   threshold    result
▌   ✓ auprc           0.912      ≥     0.900        pass
▌   ✓ recall@0.9      0.874      ≥     0.850        pass
▌   ✓ latency_p99     42 ms      ≤     50 ms        pass
▌   ✗ calibration     0.061      ≤     0.050        fail
```

A `table` of five columns. **The comparator is its own column** — merged into the threshold, `≤ 0.050` truncates to `≤ 0.05…` at narrow widths and a reader cannot tell whether the bound was tightened or the value is being rounded. Two cells cannot truncate into each other.

A failed gate is `error`-toned **and** glyphed **and** carries `fail` in its result column — three signals, because this is the row people scan for.

Nested gates indent within the name cell rather than needing a tree block — one level in v1, and the indent is data, not structure.

### Inference

```
▌ ── throughput ────────────────────────────────────────────────────────────────
▌
▌   records      1,284,000 of 2,000,000
▌   rate         4,120 / s        peak 5,880 / s
▌   elapsed      5m 12s           eta ~2m 54s
▌
▌   ████████████████░░░░░░░░░░░░  64%
▌
▌ ── sinks ─────────────────────────────────────────────────────────────────────
▌
▌   ✓ s3://prism-predictions/…     1,284,000 written
▌   ▲ timescale://metrics          1,281,400 written · 2,600 retried
```

Sinks are a headerless `table`. A partially-failing sink is `warn`-toned with its retry count — continue-and-fail means a run can succeed with a degraded sink, and hiding that would be wrong.

### Study

```
▌ ── study ─────────────────────────────────────────────────────────────────────
▌
▌   ▲ Study detail is Phase 2. This run's trials are visible with:
▌       /ps --family=digit-classifier --since=7d
▌
▌   trials      24 of 60 complete
▌   best        trial 17 · val_acc 0.971
```

A `notice` plus whatever summary the envelope carries. **The placeholder is a redirect, not a dead end** — it names the command that gets you the information now.

### Unknown kind

A far side that ships a new job kind must not break this surface.

```
▌ ── replicate ─────────────────────────────────────────────────────────────────
▌
▌   ▲ No detail layout for kind "replicate". Showing the raw payload.
▌
▌   { "shards": 8, "completed": 5, … }
```

The common block still renders; the kind-specific section falls back to a `code` block of the payload. Same principle as C07's fallback adapter, and the same reason: a verb that ships tomorrow should be usable tomorrow.

---

## 4. Fields

| Field | Source | Format |
|---|---|---|
| uuid | `uuid` | Full, unabbreviated |
| kind | `kind` + `job` | `candidate · TrainingJob` |
| family | `family`, else `name` | — |
| status | `status` + progress | Glyph, word, then progress or failure reason |
| owner | `owner` | `user@domain` |
| submitted | `submitted_at` | Absolute UTC, then relative in parentheses |
| mr | `mr` | Badge with an `open` action; omitted when null |
| image | `image` | Truncated **from the left** — the tag is the informative end |
| resources | `resources` + `node` | Joined with `·`; omitted when unscheduled |

---

## 5. States

| State | Render |
|---|---|
| **Loading** | C23's pending entry — rule header with the command and a running indicator |
| **Running** | Full layout with progress and eta |
| **Settled** | Progress and eta dropped; curve, gates or totals remain |
| **Failed** | Common block with the failure reason; the kind section still renders whatever it has; the `error_envelope` follows as a notice |
| **Cancelled** | As settled, with a muted cancelled notice |
| **Not found** | The prefix matched nothing — an error with the prefix quoted and a suggestion to widen it |
| **Ambiguous prefix** | Two or more matches — a short table of candidates, each `fill`-actioned to its full UUID |
| **Narrow** | Below 80, the plot narrows to the available width; below 60, S01's fallback takes over |

**The ambiguous-prefix state is not an error.** Typing four characters and getting a two-row chooser is the fast path working, not failing, and it is the reason prefix matching exists at all.

---

## 6. Interactions

| Action | Command | Kind |
|---|---|---|
| `≡ logs` | `/ps <uuid> --logs` | fill |
| `⚡ events` | `/ps <uuid> --events` | fill |
| `◉ watch` | `/ps <uuid> --watch` | fill |
| `↑ promote` | `/promote <uuid> --open-mr` | fill |
| `⊘ cancel` | `/<ns> cancel <uuid>` | fill |
| `{ } json` | `/ps <uuid> --json` | fill |
| `!1248` | The MR URL | open |

**`{ } json` re-runs the command; it does not show this entry's payload.** On a `--watch`, or against anything that changes between the two calls, it returns different data than the block it was opened from — so an adapter bug can render wrong here and then show a fresh payload that looks fine. That is honest: re-running is what the command says. To inspect *this* entry — its argv, transport, stderr and retained payload — use `/debug` (C23 §2), which never re-runs.

Offered by kind and status, never unconditionally: `↑ promote` on succeeded candidates only, `⊘ cancel` on running or queued only, `◉ watch` on running only. `≡ logs` is always offered — a failed run's logs are the first thing anyone wants.

While live, `↑`/`↓` move between actions and `⏎` fires the focused one. Once frozen, all are refused (C23 I18).

---

## 7. Commitments

1. Four kind-specific layouts behind one verb, over a common identity block.
2. An unknown kind renders the common block plus the raw payload; it never fails.
3. Absent fields are omitted, not rendered empty.
4. The full UUID is shown, because this is where it is copied from.
5. Metric direction arrows come from the declared direction of improvement, never from the sign of the delta.
6. A settled run drops progress and eta and keeps its curve, gates or totals.
7. Gate comparators are their own column so they cannot truncate into the threshold.
8. A degraded sink is shown with its retry count rather than hidden behind a successful run.
9. The study placeholder names the command that gets the information now.
10. Image paths truncate from the left, so the tag survives.
11. An ambiguous prefix produces a chooser, not an error.
12. Drill-in appends an entry rather than pushing a view; the list stays above, frozen, with its focused row intact.

---

## 8. Tests

### Tier 1 — unit

- **T1.1**: each kind adapts to its documented block sequence — four cases.
- **T1.2**: an unknown kind → common block plus a `code` payload plus a notice.
- **T1.3**: a queued run → no node, no image, no progress; those rows are absent, not empty.
- **T1.4**: the full UUID renders unabbreviated.
- **T1.5**: direction arrows follow the declared direction — a falling loss is `↓` and good, a falling accuracy is `↓` and bad.
- **T1.6**: a settled training run → no progress block, no eta, curve retained.
- **T1.7**: a failing gate is `error`-toned and glyphed; comparator and threshold are separate cells.
- **T1.8**: a sink with retries is `warn`-toned and shows the count.
- **T1.9**: an image longer than the width truncates from the left, keeping the tag.
- **T1.10**: actions are offered exactly per §6's kind and status matrix — twelve cases.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: measured height equals rendered height at seven widths, for all four kinds.
- **T2.3**: every action command re-parses through C18 to the intended `ParseResult`.
- **T2.4**: the common block is byte-identical across all four kinds for the same underlying fields.

### Tier 3 — edge cases

- **T3.1**: a loss history of one point → a dot, not an empty plot (C12 T1.6 from this surface).
- **T3.2**: a loss history of 50,000 points → downsampled, spike preserved, within budget.
- **T3.3**: a training run with no loss history at all → the plot section is omitted, progress retained.
- **T3.4**: zero gates on an evaluation → `no gates declared`, not an empty table.
- **T3.5**: forty gates → all render; the block scrolls with the viewport.
- **T3.6**: a gate name of 200 characters → truncated; comparator and result unaffected.
- **T3.7**: an inference run with zero sinks → the sinks section is omitted.
- **T3.8**: a four-character prefix matching two runs → the chooser, each row `fill`-actioned to a full UUID.
- **T3.9**: a prefix matching nothing → error quoting the prefix, suggesting a widening.
- **T3.10**: a failed run → envelope rendered as a notice, `remediation` as a fill action, kind section still rendered.
- **T3.11**: at 60 columns → the plot narrows; nothing overflows; the kv wraps its value column.
- **T3.12**: a `--watch` merge patch on a running detail → the curve extends, the block does not change height (C12 I1 from this surface).

- **T3.20** (`{ } json`): the interactions section states that `{ } json` re-runs and points at `/debug`. A caveat that can be tidied away is a caveat that will be.
### Tier 4 — integration

- **T4.1** (with S03): `⏎` on a row appends this surface as a new entry; the list above freezes with its focus intact.
- **T4.2** (with C12): the plot's height is declared and constant as the series grows.
- **T4.3** (with C11): the gate table's columns drop in the documented order at narrow widths.
- **T4.4** (with C23): every action is a fill except the MR link; frozen entries refuse all of them.
- **T4.5** (with C10, C02): geometry is identical in both themes, all colour depths, and under ASCII.
- **T4.6** (with C13, C14): a `--watch` on this surface patches in place without moving the viewport.

### Tier 5 — e2e

- **T5.1**: golden frames for all four kinds × running and settled × 80 / 100 / 120 / 160.
- **T5.2**: golden frames for the eight §5 states.
- **T5.3**: drill in from `/ps`, read the detail, scroll up — the list is still there with the row still focused.
- **T5.4**: `/ps <uuid> --watch` on a real training run for two minutes → curve grows, height constant, viewport still.
- **T5.5**: a four-character ambiguous prefix → chooser, fill, correct run.

### Tier 6 — fail-on-revert

- **T6.1** (C2): throwing on an unknown kind → T1.2 fails, and a new job type breaks the detail view.
- **T6.2** (C3): rendering absent fields as `—` → T1.3 fails, and "not yet scheduled" reads as "no node".
- **T6.3** (C5): deriving arrows from the delta's sign → T1.5 fails, and a rising accuracy reads as a regression.
- **T6.4** (C7): merging comparator into the threshold cell → T1.7 fails and `≤ 0.05…` becomes unreadable.
- **T6.5** (C8): hiding a retrying sink → T1.8 fails and a degraded run looks clean.
- **T6.6** (C10): truncating the image from the right → T1.9 fails and every image reads as the same registry.
- **T6.7** (C11): erroring on an ambiguous prefix → T3.8 fails, and prefix matching stops being useful.
- **T6.8** (C4): abbreviating the UUID → T1.4 fails, and the one place it is copied from cannot be copied from.

---

## 9. Out of scope

| Not here | Where |
|---|---|
| The list this is reached from | S03 |
| `--logs`, `--events`, `--watch` as views | S12 |
| Plot rasterisation, downsampling | C12 |
| Gate evaluation semantics | The far side |
| Study detail | Phase 2 — the placeholder redirects |
| Comparing two runs | S07 |
