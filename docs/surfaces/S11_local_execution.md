# S11 — Local execution

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | **Live** — a streaming block, not a transcript record |
| **Package** | `prism-tui` |
| **Covers** | `/run` · `/local up` · `/local down` · `/local reset` · `/build` · `/new` |
| **Data source** | Each verb's NDJSON stream → `adaptLocal` (C07 §6) |
| **Source** | `j12` · `t00` §emulation · S08 §4 · A01 D4 |
| **Status** | Draft |

---

## 1. Purpose

Everything else in the steps-shaped group finishes in under a second and produces a record. These verbs run for minutes and produce a *process* — epochs advancing, images layering, a kind cluster coming up.

That makes S11 the only steps-shaped surface that is **live rather than transcript** (A01 D4): it streams, it grows, and `⌃c` cancels it. It is still not a pushed view, because it needs no letter keys — the whole interaction is watching and possibly stopping.

The design problem is that a long-running block competes with the transcript for space. A ten-minute training run must not push everything else off screen, and must not force the user to scroll away from it to type.

---

## 2. `/run`

```
▌ ── run · fmx_models.jobs.training:job · host-native ──────────────────────────
▌
▌   ✓ importing target                    job resolved
▌   ✓ resources resolved                  1×GPU · 8Gi  (satisfied)
▌   ✓ secrets resolved                    3 · timescaledb-dsn · minio · mlflow
▌   ✓ device                              cuda:0
▌
▌   run  7f3a2c1  ·  ./prism-runs/7f3a2c1…/
▌
▌   epoch 7 / 10   ████████████████████░░░░░░░░  70%          eta 2m 10s
▌
▌   0.82 │⠉⠑⠒⠢⠤⢄⣀⣀⡀
▌   0.57 │        ⠈⠉⠉⠑⠒⠒⠢⠤⠤⢄⣀⣀⣀⣀⡀
▌   0.31 │                      ⠈⠉⠉⠉⠉⠒⠒⠒⠤⠤⠤⠤⠤⣀⣀⣀
▌        └──────────────────────────────────────
▌         epoch 1        epoch 5             now
▌
▌   train_loss 0.312 ↓    val_loss 0.298 ↓    val_accuracy 0.871 ↑
▌
▌   last checkpoint  epoch_7.pt                              ⌃c to stop
```

**This curve is C12's output too**, at height 3 and width 44, seven epochs from 0.82 to the `train_loss 0.312` the metrics row states. The earlier one carried S04's two defects — three empty interior dot columns and a curve stopping at 14 cells of a 28-cell area — and a third of its own: **it drew two y-labels where §3 made three unconditional.** That turned out to be a gap in C12 rather than in the picture, because T3.2 renders `height: 1` with axes and three labels cannot be placed in one row. Labels now sit at the max, mid and min rows and collapse from the middle outward (C12 I15), so at height 3 all three appear — and the midpoint is what this figure had been missing.

**Per-epoch history collapses to a curve, not a log.** Ten epochs is ten lines; a hundred is a hundred, and a two-hundred-epoch run would own the entire viewport. The plot has a declared height (C12 I1), so the block's height is **constant from the second epoch onward** regardless of how long the run goes.

That constancy is the property that makes a long run coexist with the transcript. Without it, following a run means never seeing anything else.

The checkpoint line replaces itself rather than accumulating — the last one is the one that matters.

---

## 3. `/local up`

```
▌ ── local up · kind · cpu ─────────────────────────────────────────────────────
▌
▌   ✓ kind cluster                        prism-local · 1 node
▌   ✓ namespaces                          4 created
▌   ✓ postgres                            ready · 5432
▌   ✓ minio                               ready · 9000
▌   ◐ mlflow                              starting · 14s
▌     argo workflows                      pending
▌     registry                            pending
▌
▌   ⌃c to stop · partial state is left in place
```

Seven steps, several minutes, and the failure mode that matters is **partial**. `⌃c` at step five leaves a kind cluster and three services running, and the block says so before you press it rather than after.

A failed step here does **not** stop the sequence — unlike S08, where a failed rule makes later rules meaningless. Postgres failing does not make minio unstartable, and knowing which of seven came up is the whole diagnostic. Failed steps render `✗` and the run continues.

That is a deliberate divergence from S08 §4, and it is stated in both places.

---

## 4. `/build`

```
▌ ── build · research-infra · linux/amd64 ──────────────────────────────────────
▌
▌   ✓ context                             2.1 MB · 14 files
▌   ✓ base image                          prism/executor-base:0.4.1
▌   ◐ layers                              7 / 11 · installing wheels
▌
▌   #7 [4/8] RUN pip install --no-deps /opt/wheels/*.whl
▌   #7 12.4  Processing /opt/wheels/fmx_models-0.3.2-py3-none-any.whl
▌   #7 14.1  Successfully installed fmx_models-0.3.2
▌
▌   ⌃c to stop
```

Build output is a **tail of the last few lines, not the whole log**. Docker emits thousands of lines and almost all of them are noise until something fails — at which point the failing step's output is retained in full.

The tail is six lines by default and expands to the failure's full output on error. `⌃c` is offered because a build is interruptible without consequence.

---

## 5. Completion

A finished run collapses to a summary and **stops being live**:

```
▌   ✓ run completed                       7m 12s
▌
▌   best metric      val_accuracy 0.954  (epoch 10)
▌   artefact         ./prism-runs/7f3a2c1…/best.pt
▌   secrets used     timescaledb-dsn · minio-credentials · mlflow-tracking-uri
▌
▌   ≡ /ps --local   ↑ /experiment submit …                              7m 12s
```

The curve is retained; the progress bar and eta are dropped. `secrets used` is listed because it is the audit fact people forget they need until they need it.

---

## 6. States

| State | Render |
|---|---|
| **Starting** | Steps only; no progress block until the first tick arrives |
| **Running** | §2, §3 or §4 by verb |
| **Completed** | §5 |
| **Failed** | Steps up to the failure, the error envelope, and — for `/run` — the curve as far as it got |
| **Cancelled** | Partial output retained, `partial` status, and for `/local up` a notice naming what is still running |
| **Stalled** | No output for 120 s → a muted `no output for 2m` line, injected by **C23 §3b**, not by this surface. **Not an error** — a build pulling a large base layer is silent for minutes |
| **Narrow** | §7 |

**The stalled state exists because silence is ambiguous.** A user watching a motionless block cannot tell whether the process is working or wedged, and the honest answer is usually "working" — so the surface says how long it has been quiet rather than implying a fault.

---

## 7. Narrow widths

| Width | Layout |
|---|---|
| ≥ 100 | As shown |
| 80–99 | Plot narrows; metric line wraps to two rows |
| < 80 | Plot dropped; progress bar and metric line retained |

**Dropping the plot is the adapter's decision, not C11's.** Column dropping applies within a table; here a whole block is omitted, and the adapter does it from `ctx.width` (C07 §3). Worth distinguishing, because the two mechanisms look alike and only one has C11's guarantee that dropped content reaches the expand row.

**The plot goes before the progress bar.** A curve is context; a percentage and an eta are the answer to "how long". At 60 columns the block is steps, progress, metrics — which still tells you where it is and when it will finish.

Build log tails truncate from the **left**, keeping the end of the line — the tail of a `pip install` line is the package name.

---

## 8. Interactions

| Key | Effect |
|---|---|
| `⌃c` | Cancel. Escalates through C06's ladder; partial output retained |

| Action | Command | Kind |
|---|---|---|
| `≡ /ps --local` | fill | After `/run` completes |
| `↑ /experiment submit <target>` | fill | After `/run` succeeds — the natural next step |
| `≡ /local status` | fill | After `/local up` |
| `{ } json` | fill | Always |

No action re-runs. `↑ ⏎` does that, and a re-run button beside a ten-minute process invites a second one starting before the first has stopped.

---

## 9. Commitments

1. S11 is live, not transcript — it streams and `⌃c` cancels it.
2. `/run`'s block height is constant from the second epoch, because per-epoch history collapses into a fixed-height curve.
3. The checkpoint line replaces itself rather than accumulating.
4. A failed step does **not** stop `/local up`'s sequence — a deliberate divergence from S08, stated in both.
5. `⌃c` on `/local up` is offered with a warning that partial state remains.
6. Build output is a six-line tail, expanding to full output on failure.
7. Completion drops progress and eta and retains the curve.
8. `secrets used` is reported on completion.
9. Silence for 120 s renders a muted stalled line, injected by C23 on the injected clock; this surface reads no time.
10. Below 80 the plot drops before the progress bar.
11. Build log lines truncate from the left.
12. No action re-runs the verb.

---

## 10. Tests

### Tier 1 — unit

- **T1.1**: each of the three verb shapes adapts to its documented block sequence.
- **T1.2**: `/run` block height at epoch 2 equals height at epoch 200 — the constancy property.
- **T1.3**: the checkpoint line is replaced, not appended, across ten patches.
- **T1.4**: a failed step in `/local up` leaves later steps running; a failed step in `/validate` does not (S08 T1.4 contrast).
- **T1.5**: `/local up` renders the partial-state warning while running.
- **T1.6**: build tail holds six lines; a seventh evicts the first.
- **T1.7**: a build failure retains the failing step's full output, not the tail.
- **T1.8**: completion drops progress and eta, retains the curve, lists secrets.
- **T1.9**: 120 s of silence → the C23-injected stall notice renders; a spy proves this surface reads no clock.
- **T1.10**: below 80 → plot absent, progress and metrics present.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: measured height equals rendered height at seven widths, in every state.
- **T2.3**: every action re-parses through C18 to the intended `ParseResult`.
- **T2.4**: no emitted command re-runs the verb.
- **T2.5**: the skeleton matches S08's, with the divergence in C4 documented rather than incidental.

### Tier 3 — edge cases

- **T3.1**: a run of one epoch → a dot, not an empty plot (C12 T1.6).
- **T3.2**: a run of 5,000 epochs → constant height, downsampled curve, spike preserved.
- **T3.3**: a run producing no metrics → progress and curve only.
- **T3.4**: `⌃c` at `/local up` step five → three services named as still running.
- **T3.5**: `⌃c` during `/run` at epoch 40 → curve to epoch 40 retained, `partial`.
- **T3.6**: `⌃c` during `/build` → partial layers noted; no cleanup claimed that did not happen.
- **T3.7**: a build line of 500 characters → truncated from the left, package name intact.
- **T3.8**: 600 s of silence → one stalled line, not five.
- **T3.9**: output resuming after a stall → the stalled line is removed, not left behind.
- **T3.10**: a stream that dies without an `end` patch → the block settles as `partial` with a notice (C06 I9 from this side).
- **T3.11**: two `/run`s attempted concurrently → the second is refused by C23's guard (C23 I5).
- **T3.12**: at 79 and 80 columns → the plot drops at the boundary.

### Tier 4 — integration

- **T4.1** (with C12): the curve's height is declared and does not vary with series length.
- **T4.2** (with C13, C14): the block patches in place; a user scrolled up is not moved (C14 I4).
- **T4.3** (with C13): the block keeps streaming after it freezes, and stops on settle (C13 §2).
- **T4.4** (with C03): a 10 Hz epoch stream produces coalesced frames, not one per patch.
- **T4.5** (with C06): `⌃c` escalates through the ladder; partial output survives.
- **T4.6** (with C23): the block holds the submission guard for its whole duration (C23 I5).
- **T4.7** (with C10, C02): geometry identical across themes and depths.

### Tier 5 — e2e

- **T5.1**: golden frames at 60 / 80 / 100 / 160 for running and completed, all three verbs.
- **T5.2**: golden frames for the seven §6 states.
- **T5.3**: a real ten-minute `/run` → height constant throughout, transcript usable, other commands typeable.
- **T5.4**: `/run`, scroll up mid-run to read an earlier block → the view does not move as the curve grows.
- **T5.5**: `/local up` interrupted at step five → the warning was accurate; `/local status` confirms what is running.
- **T5.6**: a real `/build` → tail scrolls, failure expands to full output.

### Tier 6 — fail-on-revert

- **T6.1** (C2): rendering epochs as log lines → T1.2 fails, and a long run owns the viewport.
- **T6.2** (C3): appending checkpoint lines → T1.3 fails, and the block grows without bound.
- **T6.3** (C4): stopping `/local up` on the first failed step → T1.4 fails, and one failed service hides six healthy ones.
- **T6.4** (C5): omitting the partial-state warning → T3.4's expectation is unstated before the fact rather than after.
- **T6.5** (C6): rendering the whole build log → T1.6 fails, and the block is thousands of lines of noise.
- **T6.6** (C9): treating silence as an error → T1.9 fails, and a slow base-layer pull reads as a fault.
- **T6.7** (C10): dropping the progress bar before the plot → T1.10 fails, and the answer to "how long" goes first.
- **T6.8** (C11): truncating build lines from the right → T3.7 fails and every line reads as the same step.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| Validation and test output | S08, S09 |
| Cluster submission | S10 |
| The local run's later inspection | S03 with `--local` |
| Plot rasterisation and downsampling | C12 |
| Cancellation mechanics | C06, C21 |
| What `/local up` actually starts | The far side |
