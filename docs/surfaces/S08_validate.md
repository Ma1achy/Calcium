# S08 — `/validate`

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Transcript — read once, keep the record |
| **Package** | `prism-tui` |
| **Data source** | `prism validate <target> --json` → `adaptValidate` (C07) |
| **Source** | `j09` · A01 Appendix A.3 · C07 §4 |
| **Status** | Draft |

---

## 1. Purpose

`/validate` is the cheapest verb and the one people run most while writing a model. It is also the first surface where **the failure path is the product** — a passing validation is four lines nobody reads twice, and a failing one is a diagnostic that determines whether the next twenty minutes are productive.

So the success block is deliberately terse and the failure block is deliberately not. The asymmetry is the design.

It is the template for the steps-shaped group: S09 test, S10 GitOps, S11 local execution all follow the same skeleton — progressive steps, then a result — and differ mainly in what a failure looks like.

---

## 2. Success

```
▌ ── validate · fmx_models.jobs.training:job · T1 · in-process ─────────────────
▌
▌   ✓ importing target                    job resolved
▌   ✓ tier-1 rules                        22 rules · 0 errors · 587ms
▌   ✓ resource estimate                   1×GPU · 8Gi · ~14 minutes
▌
▌   model         fmx_models.models:DigitClassifier
▌   train_data    fmx_models.data.pipeline:train_pipeline
▌   resources     1×GPU · 8Gi        (model floor 1×GPU 8Gi — satisfied)
▌   callbacks     3                  MLflowLogger · Checkpoint · EarlyStopping
▌   estimated     ~14 minutes        based on similar runs · confidence high
▌
▌   ▲ W004  ESCAPE_HATCH_USED
▌           MultiMetricEarlyStopping replaces=prism.EarlyStopping
▌           Forfeited: built-in EarlyStopping behaviour
▌
▌   next: /test …   /experiment submit …                                  587ms
```

Two `steps`, a `keyValue` of what was resolved, warnings if any, a `tip`. The whole thing fits in a screenful and is scanned, not read.

**The resolved summary matters more than the tick.** "It passed" is one bit; "it resolved *this* model, *this* data, and estimates fourteen minutes" is what catches the case where validation passes against something other than what you meant.

Warnings are `warn`-toned with their code, and never suppress the success — a W-code is information about a choice, not a problem with it.

---

## 3. Failure

```
▌ ── validate · fmx_models.jobs.training:job · T1 · in-process ─────────────────
▌
▌   ✓ importing target                    job resolved
▌   ✗ tier-1 rules                        22 rules · 2 errors
▌     resource estimate                   not run
▌
▌   T1-008  TrainingConfig requires at least one of: max_epochs, total_steps
▌           file    fmx_models/jobs/training.py:18
▌           field   config=TrainingConfig(batch_size=128, mixed_precision=True)
▌           fix     add max_epochs=N or total_steps=N
▌
▌   Rule 5  Callback supports mismatch
▌           file      fmx_models/jobs/training.py:24
▌           callback  fmx_models.callbacks:MultiMetricEarlyStopping
▌           issue     supports={"inference"}, but job is a TrainingJob
▌           fix       add "training" to the callback's supports set
▌
▌   ? T1-008 for the full rule                                    exit 1
```

Each error is a `keyValue` under a `notice` carrying its code. Four rows, in a fixed order that matches how the problem is actually diagnosed:

| Row | Answers |
|---|---|
| `file` | Where do I go |
| `field` / `callback` | What exactly |
| `issue` | Why is it wrong — omitted when the code's message already says |
| `fix` | What do I type |

**`fix` is last and always present.** An error with a location and no remedy sends the reader to documentation; the whole value of a validation error is that the tool already knows what to do about it. Where the far side supplies no remediation, the row reads `fix  see ? <code>` rather than being omitted — the absence is itself information.

Errors render in **envelope order**, not sorted by severity or code. The far side evaluates rules in dependency order, so the first error is usually the cause and the rest are consequences; re-sorting would bury the one that matters.

`? T1-008` is context help on a code, handled by C16's `?` binding.

---

## 4. Steps

Steps stream as they complete rather than appearing at the end.

| State | Glyph | Tone |
|---|---|---|
| pending | ` ` | muted |
| active | spinner frame from `ctx.tick` | accent |
| done | `✓` | ok |
| failed | `✗` | error |

A step that fails **stops the sequence**; subsequent steps stay pending and are rendered muted rather than removed. Seeing that a step failed *and* that nothing after it ran is worth the two lines.

**This rule is not universal.** It holds where later steps depend on earlier ones — a tier-1 failure makes a resource estimate meaningless. It does **not** hold for `/local up`, where seven services start independently and knowing which of them came up is the entire diagnostic (S11 §3). The two surfaces diverge deliberately, and each says so.

`/validate` itself has three steps — import, tier-1 rules, resource estimate — so the rule is observable here. It matters more on the five-step verbs of S10, where a failure at step four leaves three completed steps that have already written to disk (S10 §6).

Validation is fast enough that steps often complete before a frame is committed. That is fine — the block renders with both ticks already set and nothing flickers, because C03 coalesces (C03 §3).

---

## 5. States

| State | Render |
|---|---|
| **Loading** | C23's pending entry, steps at pending |
| **Passed** | §2, exit 0 |
| **Passed with warnings** | §2 including the W-block, exit 0. **Still a pass** |
| **Failed** | §3, exit 1 |
| **Invocation error** | Bad target spec, unreadable file → exit 2, usage block from the manifest plus stderr as `raw` (C07 §4) |
| **Import failed** | The target could not be imported → the first step fails with the traceback as a `code` block. No rules ran, and the summary is omitted rather than shown empty |
| **Cancelled** | Partial steps retained, cancelled notice |
| **Narrow** | §6 |

**An import failure is not a validation failure**, and conflating them misleads. The rules never ran; there is nothing to say about them. The traceback is the whole content.

---

## 6. Narrow widths

The failure block's `keyValue` rows are label-plus-value, and the values are file paths and code fragments — the two things that suffer most from truncation.

| Width | Layout |
|---|---|
| ≥ 80 | Label column of 10, value takes the rest |
| < 80 | Label on its own row, value indented beneath, wrapping |

Paths truncate **from the left**, keeping the filename and line number. Code fragments truncate from the right, keeping the start of the expression.

The `steps` block never reflows — its second column drops before its label does.

---

## 7. Interactions

| Action | Command | Kind |
|---|---|---|
| `/test <target>` | fill | From the success tip |
| `/experiment submit <target>` | fill | From the success tip |
| `? <code>` | Context help | Per error, when a code is present |
| `{ } json` | `/validate <target> --json` | fill |

**No action re-runs the validation.** `↑ ⏎` already does that, and offering a re-run button on a block whose data is seconds old is machinery for nothing.

Nothing on this surface mutates.

---

## 8. Commitments

1. Success is terse; failure is not. The asymmetry is deliberate.
2. The resolved summary is the point of a pass, not the tick.
3. Warnings never suppress a success; a W-code is information about a choice.
4. Each error renders four rows — file, what, why, fix — in that fixed order.
5. `fix` is always present; where none is supplied it points at context help rather than being omitted.
6. Errors render in envelope order, never re-sorted, because the first is usually the cause.
7. A failed step stops the sequence and later steps render muted, not removed — where steps depend on each other. `/local up` diverges deliberately (S11 §3).
8. An import failure is distinct from a validation failure, and the summary is omitted rather than empty.
9. Below 80 columns, labels move above values rather than values truncating.
10. Paths truncate from the left; code fragments from the right.
11. No action re-runs the verb.
12. Nothing on this surface mutates.

---

## 9. Tests

### Tier 1 — unit

- **T1.1**: a passing fixture adapts to rule, steps, keyValue, tip.
- **T1.2**: a failing fixture adapts to rule, steps, then one notice-plus-keyValue per error, then tip.
- **T1.3**: each step state renders its documented glyph and tone — four cases.
- **T1.4**: a failure at step two leaves step three pending and muted, not absent. Requires the three-step fixture, not a two-step one.
- **T1.5**: warnings render with their code and do not change the exit or the success framing.
- **T1.6**: error rows appear in the fixed order, with `issue` omitted when absent.
- **T1.7**: an error with no remediation → `fix  see ? <code>`, never a missing row.
- **T1.8**: three errors render in envelope order, not sorted by code.
- **T1.9**: an import failure → first step failed, traceback as `code`, no summary block.
- **T1.10**: exit 2 → usage block plus stderr, no steps.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: measured height equals rendered height at seven widths, in both layouts.
- **T2.3**: every action re-parses through C18 to the intended `ParseResult`.
- **T2.4**: no emitted command is a mutating tool — scanned against the manifest.
- **T2.5**: the same skeleton — rule, steps, result, tip — is produced for S09, S10 and S11's fixtures, proving the group shares one shape.

### Tier 3 — edge cases

- **T3.1**: zero errors and zero warnings → the terse block, no empty sections.
- **T3.2**: twenty errors → all render; the block scrolls; envelope order preserved.
- **T3.3**: an error message of 500 characters → wrapped, not truncated; it is prose.
- **T3.4**: a file path of 200 characters → truncated from the left, filename and line intact.
- **T3.5**: a code fragment of 300 characters → truncated from the right.
- **T3.6**: an error with no file or line → those rows omitted; `fix` still present.
- **T3.7**: a warning with no remediation → renders without a fix row; warnings are not errors.
- **T3.8**: at 79 columns → labels move above values; at 80 → side by side.
- **T3.9**: validation completing in under one frame interval → both steps render done, no flicker.
- **T3.10**: cancellation mid-validation → partial steps retained, cancelled notice, `partial` status.
- **T3.11**: a traceback of 200 lines → rendered as `code`, block scrolls, no truncation of the final frame.

### Tier 4 — integration

- **T4.1** (with C09): the `steps` block's spinner advances from `ctx.tick` and never changes measured height (C09 I18).
- **T4.2** (with C03): a fast validation produces one frame, not one per step.
- **T4.3** (with C23): the tip's fills land in the prompt as one undo unit.
- **T4.4** (with C16): `?` on an error code opens context help for that code.
- **T4.5** (with C07): exit 1 with a parseable envelope renders §3; exit 1 without one renders the synthesised form.
- **T4.6** (with C10, C02): geometry identical across themes and depths; failed steps distinguishable at 1-bit by glyph.

### Tier 5 — e2e

- **T5.1**: golden frames at 60 / 80 / 100 / 160 for pass, pass-with-warnings, and fail.
- **T5.2**: golden frames for the eight §5 states.
- **T5.3**: a real failing validation → errors readable, `fix` actionable, `?` resolves the code.
- **T5.4**: a real import failure → traceback readable, no misleading summary.
- **T5.5**: `/validate`, fix the file, `↑ ⏎` → the second run appends a new entry and the first stays frozen above it.

### Tier 6 — fail-on-revert

- **T6.1** (C4): reordering the error rows → T1.6 fails, and diagnosis stops following the reading order.
- **T6.2** (C5): omitting `fix` when no remediation exists → T1.7 fails, and an error becomes a dead end.
- **T6.3** (C6): sorting errors by code → T1.8 fails, and the causing error gets buried among its consequences.
- **T6.4** (C7): removing pending steps after a failure → T1.4 fails, and "nothing after this ran" becomes invisible.
- **T6.5** (C8): rendering an empty summary on import failure → T1.9 fails, and a failed import reads as a passing resolution.
- **T6.6** (C3): treating a warning as a failure → T1.5 fails.
- **T6.7** (C10): truncating paths from the right → T3.4 fails and every path reads as the same directory.
- **T6.8** (C9): truncating values instead of restacking below 80 → T3.8 fails, and the two most truncation-sensitive fields are the ones cut.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| `/test`'s output | S09 |
| Submission and promotion output | S10 |
| Local execution | S11 |
| Rule semantics and codes | The far side |
| Context help rendering | C15, C16 |
| The `steps` block itself | C09 |
