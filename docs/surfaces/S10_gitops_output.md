# S10 — GitOps verb output

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Transcript |
| **Package** | `prism-tui` |
| **Covers** | `/production submit` · `/promote` · `/serving scale` · `/serving undeploy` |
| **Data source** | Each verb's `--json` → `adaptGitops` (C07) |
| **Source** | `j14`, `j15`, `j21` · A01 Appendix A.3 · S08 §4 |
| **Status** | Draft |

---

## 1. Purpose

Four verbs, one shape, because they do the same thing: run checks, write YAML into `glass_environment`, and open a merge request.

What differs is **who merges it**, and that is the only thing on this surface that really matters. CODEOWNERS auto-merges `candidates/`; it does not auto-merge `serving/`. A production submit lands in about thirty seconds. A promote, a scale and an undeploy wait for a human.

Getting that wrong means someone believes a promote has landed when it is sitting in review — so the outcome is stated before the artefact, in its own block, in tone.

---

## 2. Shape

```
rule       verb · target
steps      checks → generate → open MR
notice     what will happen, and who has to do it        ← the payload
code/diff  the artefact, or the change to it
tip        next actions
```

**The notice precedes the artefact.** A Deployment YAML is forty lines; putting the outcome after it means scrolling past the evidence to learn what happened. The mockup had the reverse order and it reads as an afterthought.

---

## 3. The four outcomes

### Auto-merge — `production submit --open-mr`

```
▌ ── production submit · fmx_models.jobs.training:job ──────────────────────────
▌
▌   ✓ clean working tree                  HEAD a3f9b21
▌   ✓ tier-1 rules                        22 rules · 0 errors
▌   ✓ image resolved                      registry.fmx.io/…/prism-executor:a3f9b21
▌   ✓ candidate YAML written              candidates/digit-classifier-a3f9b21.yaml
▌   ✓ MR opened                           !1252
▌
▌   ✓ MR !1252 will auto-merge on green CI.
▌     CODEOWNERS auto-merges candidates/. The CRD posts about 30s after merge.
▌
▌   # glass_environment/prism/research-infra/candidates/digit-classifier-a3f9b21.yaml
▌   apiVersion: prism.fmx.io/v1
▌   kind: PrismRun
▌   …
▌
▌   ↗ !1252   ≡ /ps --family=digit-classifier                             4.2s
```

### Human review — `promote`, `scale`, `undeploy`

```
▌   ▲ MR !1252 requires human review.
▌     CODEOWNERS auto-merge is OFF on serving/. Nothing changes until someone
▌     approves. This is the promotion boundary; the CLI cannot bypass it.
```

`warn`-toned, three lines, and it names the mechanism rather than only the state. "Requires review" invites a wait; "auto-merge is off on `serving/`" tells you what to do about it.

### Drafted — no `--open-mr`

```
▌   ✓ YAML written to branch promote/digit-classifier-b4f0c12
▌     Commit and push to open the MR, or re-run with --open-mr.
```

### Dry run — `--dry-run`

```
▌   ▲ Dry run. Nothing was written and no branch was created.
```

Dry run still renders the artefact — seeing it is the point of the flag.

---

## 4. Scale renders a diff, not a document

`serving scale` changes one field, and showing forty lines to convey one is worse than useless.

```
▌   ✓ MR !1255 requires human review.
▌
▌   serving/volatility-estimator.yaml
▌   spec.replicas          2       →  3
▌
▌   ↗ !1255                                                              1.8s
```

A `diff` block of the changed fields only. `undeploy` likewise shows the file being removed rather than its contents.

---

## 5. Refusals

Refusals happen **before anything is written**, and render as S08's failure block — code, file, what, fix.

| Verb | Refusal | Message |
|---|---|---|
| `production submit` | Dirty working tree | **Refuses.** The candidate YAML records HEAD's SHA as the immutable image tag |
| `production submit` | Name collision | A candidate with that name exists at this SHA |
| `production submit` | Ineligible job kind | Inference and Study are not candidate-eligible |
| `promote` | Wrong kind | `<uuid> is kind=experiment`; only candidates serve real traffic |
| `promote` | Not succeeded | Candidate must be `status=succeeded` |
| `scale` | Unknown family | `did you mean` at edit distance ≤ 2 |

**The dirty-tree asymmetry is stated, not implied.** `experiment submit` warns and proceeds; `production submit` refuses. Both messages are catalogued (A01 Appendix A.3), and the refusal explains why rather than only that:

```
▌   ✗ uncommitted changes in fmx_models/digit_classifier.py
▌
▌     Production submissions require a clean working tree — the candidate YAML
▌     records HEAD's SHA as the immutable image tag.
▌
▌     fix   commit first. Experiments accept dirty trees; this verb does not.
```

---

## 6. States

| State | Render |
|---|---|
| **Loading** | Pending entry, steps pending |
| **Auto-merge** | §3, `ok`-toned notice |
| **Human review** | §3, `warn`-toned notice |
| **Drafted** | §3, no MR, branch named |
| **Dry run** | §3, artefact shown, nothing written |
| **Refused** | §5, exit 1, nothing written |
| **MR open failed** | YAML **was** written, the MR was not — an error naming the branch so the work is not lost |
| **Push failed** | Committed locally, not pushed — same principle: name the branch |
| **Narrow** | §7 |

**The two partial-failure states are why this surface needs care.** A GitOps verb does several things in sequence, and failing at step four leaves steps one to three on disk. Reporting only "MR open failed" strands a branch nobody knows exists.

---

## 7. Narrow widths

| Width | Layout |
|---|---|
| ≥ 80 | As shown |
| < 80 | Step detail column drops; the notice wraps; the YAML block wraps via `code.wrap: true` (C09 §3) |

**Every artefact block on this surface sets `code.wrap: true`.** A truncated manifest is a different manifest, and someone will read it as the thing that was written. `code` truncates by default precisely because most code blocks are dumps where that is harmless; this is not one of them.

File paths in steps truncate from the left, keeping the filename.

---

## 8. Interactions

| Action | Command | Kind |
|---|---|---|
| `↗ !1252` | The MR URL | open |
| `≡ /ps --family=<f>` | fill | After a submit |
| `≡ /serving <name>` | fill | After a promote, scale or undeploy |
| `{ } json` | fill | Always |

**No action approves, merges or retries.** Approving is the human gate this surface exists to represent, and a retry button on a partially-completed GitOps operation would be the most dangerous control in the tool — the safe recovery depends on how far it got, which is what §6's states are for.

---

## 9. Commitments

1. Four verbs share one shape: rule, steps, notice, artefact, tip.
2. The outcome notice precedes the artefact, never follows it.
3. Auto-merge and human review are distinguished by tone and by naming the mechanism.
4. The human-review notice states that the CLI cannot bypass the gate.
5. `scale` renders a field diff; `undeploy` names the file, not its contents.
6. Dry run renders the artefact — seeing it is the point.
7. Refusals happen before anything is written and use S08's failure block.
8. The dirty-tree asymmetry is stated explicitly, with the reason.
9. Partial failures name the branch, so work is never stranded silently.
10. Artefact blocks set `code.wrap: true`; a manifest is never truncated.
11. No action approves, merges or retries.
12. Nothing on this surface is reversible from this surface.

---

## 10. Tests

### Tier 1 — unit

- **T1.1**: each of the four verbs adapts to the §2 shape.
- **T1.2**: the notice block precedes the artefact block in every successful render.
- **T1.3**: `candidates/` → `ok` tone and auto-merge wording; `serving/` → `warn` tone and review wording.
- **T1.4**: the human-review notice contains the bypass sentence verbatim.
- **T1.5**: `scale` produces a `diff` block, not a `code` block.
- **T1.6**: `undeploy` names the file and does not render its contents.
- **T1.7**: `--dry-run` renders the artefact and a notice stating nothing was written.
- **T1.8**: no `--open-mr` → branch named, no MR row.
- **T1.9**: each refusal in §5 renders S08's four-row failure block — six cases.
- **T1.10**: the dirty-tree refusal carries the immutable-tag reason and the experiment contrast.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: measured height equals rendered height at seven widths.
- **T2.3**: every action re-parses through C18 to the intended `ParseResult`.
- **T2.4**: no emitted command approves, merges or re-runs the verb — scanned against the manifest.
- **T2.5**: the skeleton matches S08's (S08 T2.5 from this side).

### Tier 3 — edge cases

- **T3.1**: a 200-line YAML → rendered whole, block scrolls, never truncated.
- **T3.2**: a YAML line longer than the width → wraps; the block's measured height accounts for the wrapped lines (C09 T1.6b).
- **T3.3**: `scale` with no actual change (2 → 2) → refused before writing, with a notice saying so.
- **T3.4**: MR open failure after a successful write → error naming the branch and the file.
- **T3.5**: push failure → error naming the local branch and the commit.
- **T3.6**: a refusal at step one → no later steps rendered as pending; nothing was attempted.
- **T3.7**: a file path of 200 characters → truncated from the left in the step row, whole in the YAML comment.
- **T3.8**: `promote` on an experiment → the catalogued kind-mismatch wording plus the resubmit hint.
- **T3.9**: `scale` on an unknown family → `did you mean` at distance ≤ 2, none at 3.
- **T3.10**: at 79 columns → step detail drops, notice wraps, YAML still whole.
- **T3.11**: cancellation mid-verb → whatever completed is retained; the state is `partial` and the branch, if created, is named.

### Tier 4 — integration

- **T4.1** (with C09): the `code` block uses the `syntax` palette, not `tone` (C09 §3).
- **T4.2** (with C11): the `scale` diff block renders three columns and drops none above 60.
- **T4.3** (with C23): `↗` reaches the injected opener with a scheme check.
- **T4.4** (with C07): a refusal envelope renders through the standard error path.
- **T4.5** (with S05): `≡ /serving <name>` lands on that deployment's detail.
- **T4.6** (with C10, C02): auto-merge and human review remain distinguishable at 1-bit — glyph and wording carry it, not tone.

### Tier 5 — e2e

- **T5.1**: golden frames at 60 / 80 / 100 / 160 for all four verbs.
- **T5.2**: golden frames for the eight §6 states.
- **T5.3**: a real promote with `--open-mr` → review notice unmissable, MR link opens.
- **T5.4**: a real dirty-tree refusal → nothing written, working tree untouched, message actionable.
- **T5.5**: a simulated MR-open failure → the branch is named and is findable afterwards.

### Tier 6 — fail-on-revert

- **T6.1** (C2): moving the notice after the artefact → T1.2 fails, and the outcome hides below forty lines of YAML.
- **T6.2** (C3): using one tone for both merge paths → T1.3 fails, and a promote reads as landed.
- **T6.3** (C4): dropping the bypass sentence → T1.4 fails, and the gate looks like a delay rather than a boundary.
- **T6.4** (C5): rendering the whole YAML for `scale` → T1.5 fails, and one changed field is buried.
- **T6.5** (C9): reporting a partial failure without the branch → T3.4 fails, and work is stranded.
- **T6.6** (C10): omitting `wrap: true` on an artefact block → T3.2 fails, and a truncated manifest is read as the real one.
- **T6.7** (C11): adding a retry or approve action → T2.4 fails.
- **T6.8** (C8): softening the dirty-tree refusal to a warning → T1.10 fails, and the image tag stops being immutable.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| Validation output | S08 |
| What the MR contains once merged | The far side |
| Deployment health afterwards | S05 |
| The registry entry created | S06 |
| CODEOWNERS configuration | The far side |
| Approving or merging | Deliberately absent — that is the gate |
