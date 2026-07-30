# S09 — `/test`

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Transcript |
| **Package** | `prism-tui` |
| **Data source** | `prism test <target> --json` → `adaptTest` (C07) |
| **Source** | `j10` · S08 §4 (shared skeleton) |
| **Status** | Draft |

---

## 1. Purpose

`/test` runs two things under one name: an **implicit smoke test** the platform synthesises, and whatever `@prism.test` callables the author wrote. They fail differently and mean different things, so the surface keeps them visibly apart.

A smoke failure means the model does not hold together — the forward pass, the loss, the metrics do not compose. A user-test failure means an assertion the author chose did not hold. The first is structural and the second is intentional, and merging them into one pass/fail count loses that.

It inherits S08's skeleton: rule, steps, result, tip.

---

## 2. Success

```
▌ ── test · fmx_models.jobs.training:job · pytest ──────────────────────────────
▌
▌ ── implicit smoke test · structural · read-only · 1 batch ────────────────────
▌
▌   ✓ 1 batch through forward             output shape (4, 10)
▌   ✓ loss.compute on output + targets    value 2.31
▌   ✓ metrics.val_accuracy.update         accepted
▌   ✓ metrics.val_loss.update             accepted
▌   ✓ @prism.validate                     batch accepted
▌
▌   ✓ smoke passed · 1.1s · sinks not invoked · callbacks did not fire
▌
▌ ── user tests · @prism.test · 3 ──────────────────────────────────────────────
▌
▌   ✓ DigitClassifier::smoke_forward_shape                              0.04s
▌   ✓ DigitClassifier::no_nan_in_weights                                0.02s
▌   ✓ DigitClassifier::forward_is_deterministic                         0.06s
▌
▌   ✓ 4 / 4 passed · 1 smoke + 3 user · 2.6s                            2.6s
```

**The smoke section states what it did not do.** "Sinks not invoked, callbacks did not fire" is the assurance that matters — a smoke test that wrote to a production sink would be a serious problem, and saying so every time is how the property stays true.

The two sections are separately headed and separately totalled. The final line gives both the combined figure and its composition.

---

## 3. Failure

Smoke and user failures render differently, because they are diagnosed differently.

### Smoke failure

```
▌   ✓ 1 batch through forward             output shape (4, 10)
▌   ✗ loss.compute on output + targets
▌
▌     RuntimeError: Expected target size (4, 10), got (4,)
▌       fmx_models/jobs/training.py:31  in  CrossEntropy.__call__
▌       fmx_models/models.py:88         in  DigitClassifier.forward
▌
▌     The forward output and the loss disagree about shape. Either the model's
▌     final layer or the loss's target_key is wrong.
▌
▌   ✗ smoke failed · user tests not run
```

A structural failure carries the exception, a **trimmed traceback**, and — where the far side supplies one — an interpretation. Frames from inside `prism` itself are elided with a `… 4 platform frames` marker: they are never the fault and they push the author's own frames off the screen.

**User tests do not run after a smoke failure.** The model does not compose; assertions about it would fail for reasons that have nothing to do with what they assert, and reporting twelve red tests when one thing is wrong is noise.

### User-test failure

```
▌   ✓ DigitClassifier::smoke_forward_shape                              0.04s
▌   ✗ DigitClassifier::no_nan_in_weights                                0.02s
▌   ✓ DigitClassifier::forward_is_deterministic                         0.06s
▌
▌     assert not torch.isnan(w).any()
▌       fmx_models/models.py:104  in  no_nan_in_weights
▌       E   assert tensor(True) is False
▌
▌   ✗ 3 / 4 passed · 1 failed · 2.6s                                   exit 1
```

User tests **all run**; one failing does not stop the others. They are independent by construction, and knowing three of four passed is information.

pytest's assertion output is rendered as a `code` block verbatim. Its rewriting is genuinely good and reformatting it would lose the introspection that makes it useful.

---

## 4. States

| State | Render |
|---|---|
| **Loading** | Pending entry, smoke steps pending |
| **All passed** | §2, exit 0 |
| **Smoke failed** | §3, user tests reported as not run, exit 1 |
| **User tests failed** | §3, both totals shown, exit 1 |
| **No user tests** | Smoke section only, and a muted line: `no @prism.test methods found` — a fact, not a warning |
| **Import failed** | As S08 §5 — traceback, no sections |
| **pytest error** | A collection error rather than a test failure → pytest's output as `raw`, framed as a tooling problem rather than a model problem |
| **Cancelled** | Completed tests retained, cancelled notice, `partial` |
| **Narrow** | §5 |

**"No user tests" is not a warning.** Plenty of models are adequately covered by the smoke test, and nagging about it every run trains people to ignore the surface.

---

## 5. Narrow widths

| Width | Layout |
|---|---|
| ≥ 80 | Test name left, duration right-aligned |
| < 80 | The duration **column** drops; a failing test's duration moves into its failure detail |

C11 drops columns wholesale, not cells — a column that renders for some rows and blanks for others would still consume its width for nothing. So below 80 the column goes entirely, and the one duration that matters follows the failure it belongs to.

A passing test's duration is idle curiosity; a failing one's is a clue about whether it timed out. That is why the information survives the column being dropped rather than disappearing with it.

### The user-tests table's columns

Declared here because the region is a table and stated none — the gap the
truncation audit found in three surfaces at once (S05 §5, S15 §5, this one).

| Column | Priority | Min | Align | Trunc | Flex | Sortable |
|---|---|---|---|---|---|---|
| glyph | 100 | 1 | left | end | — | — |
| name | 95 | 30 | left | **start** | yes | yes |
| duration | 60 | 6 | **right** | end | — | yes |

**Test names truncate from the start**, keeping the method name — `DigitClassifier::`
is the same on every row, so cutting the other end makes every row read as the same
test. `truncateFrom: "start"` names the end characters are removed from (C04 I32).

`duration` is right-aligned: the figure draws it so, and comparing durations down a
column is the whole reason it is there.

Tracebacks and assertion blocks never truncate; they wrap.

---

## 6. Interactions

| Action | Command | Kind |
|---|---|---|
| `/run <target>` | fill | From the success tip |
| `/validate <target>` | fill | From a failure tip — validation is cheaper and often explains it |
| `{ } json` | `/test <target> --json` | fill |

**A failure tip points at `/validate` first.** A shape mismatch between forward and loss is usually a T1 rule violation, and the cheaper verb frequently names the cause outright. Suggesting the expensive path first would be the wrong order.

Nothing on this surface mutates.

---

## 7. Commitments

1. Smoke and user tests are separately headed, separately totalled, and never merged into one count.
2. The smoke section states what it did not do — sinks not invoked, callbacks not fired — every run.
3. A smoke failure stops user tests; a user-test failure stops nothing.
4. Platform frames are elided from tracebacks with a count.
5. pytest's assertion output is rendered verbatim, not reformatted.
6. "No user tests" is a fact in muted tone, never a warning.
7. A collection error is framed as a tooling problem, distinct from a test failure.
8. Below 80 columns the duration column drops wholesale; a failing test's duration moves into its failure detail rather than being lost.
9. Test names truncate from the left, keeping the method.
10. Tracebacks and assertion blocks wrap; they never truncate.
11. A failure tip suggests `/validate` before anything more expensive.
12. Nothing on this surface mutates.

---

## 8. Tests

### Tier 1 — unit

- **T1.1**: a passing fixture adapts to rule, rule, steps, notice, rule, table, notice.
- **T1.2**: the smoke summary line names sinks and callbacks in every passing render.
- **T1.3**: a smoke failure → user-test section replaced by `user tests not run`.
- **T1.4**: a user-test failure → all four tests reported, both totals present.
- **T1.5**: platform frames elided with `… N platform frames`; author frames retained.
- **T1.6**: pytest assertion output renders as a `code` block byte-identical to the envelope.
- **T1.7**: zero user tests → muted fact line, not a warning tone.
- **T1.8**: a pytest collection error → `raw`, framed as tooling.
- **T1.9**: durations right-aligned at ≥ 80; below 80 the column is absent for every row.
- **T1.9b**: below 80, a failing test's duration appears in its failure detail block.
- **T1.10**: the failure tip's first fill is `/validate`.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: measured height equals rendered height at seven widths.
- **T2.3**: every action re-parses through C18 to the intended `ParseResult`.
- **T2.4**: no emitted command is a mutating tool.
- **T2.5**: the skeleton matches S08's — rule, steps, result, tip (S08 T2.5 from this side).

### Tier 3 — edge cases

- **T3.1**: one user test → renders; totals read `2 / 2`.
- **T3.2**: 200 user tests → all render; the block scrolls.
- **T3.3**: a test name of 200 characters → truncated from the left, method intact.
- **T3.4**: a traceback with only platform frames → the elision marker and nothing else, plus the exception.
- **T3.5**: a traceback with no platform frames → no marker.
- **T3.6**: an assertion block of 100 lines → wraps, no truncation.
- **T3.7**: a test that errors rather than fails → rendered as failed, with the error type named.
- **T3.8**: a test duration of 0.00s → rendered as `0.00s`, not blank.
- **T3.9**: cancellation after two of five user tests → two retained, three absent, `partial`.
- **T3.10**: at 79 and 80 columns → the column is absent then present; at 79 the failure detail carries the duration.
- **T3.11**: smoke passing with zero metrics declared → those steps absent, not failed.

### Tier 4 — integration

- **T4.1** (with C09): smoke steps advance from `ctx.tick` and never change measured height.
- **T4.2** (with C03): a fast test run produces one frame, not one per step.
- **T4.3** (with C23): tips fill as one undo unit.
- **T4.4** (with C07): exit 1 with and without a parseable envelope both render.
- **T4.5** (with S08): both surfaces share the skeleton and the step vocabulary.
- **T4.6** (with C10, C02): failed steps distinguishable at 1-bit by glyph.

### Tier 5 — e2e

- **T5.1**: golden frames at 60 / 80 / 100 / 160 for pass, smoke-fail and user-fail.
- **T5.2**: golden frames for the nine §4 states.
- **T5.3**: a real smoke failure → traceback readable, platform frames elided, `/validate` offered.
- **T5.4**: a real user-test failure → pytest introspection preserved verbatim.

### Tier 6 — fail-on-revert

- **T6.1** (C1): merging the two totals → T1.4 fails, and a structural failure reads like a failed assertion.
- **T6.2** (C2): dropping the sinks-and-callbacks line → T1.2 fails, and the property stops being asserted where anyone sees it.
- **T6.3** (C3): running user tests after a smoke failure → T1.3 fails, and one fault produces a screen of red.
- **T6.4** (C4): keeping platform frames → T1.5 fails, and author frames scroll off.
- **T6.5** (C5): reformatting pytest output → T1.6 fails, and assertion introspection is lost.
- **T6.6** (C6): warning about missing user tests → T1.7 fails, and the surface starts nagging.
- **T6.7** (C8): dropping the column without moving the duration into the failure detail → T1.9b fails, and a timeout becomes invisible at narrow widths.
- **T6.8** (C11): suggesting `/run` on failure → T1.10 fails, and the expensive path is offered first.

---

## 9. Out of scope

| Not here | Where |
|---|---|
| Validation output | S08 |
| Local execution | S11 |
| The smoke test's semantics | The far side (`j10`) |
| pytest configuration | The far side |
| The fake-source pattern | The far side; this surface renders whatever it reports |
