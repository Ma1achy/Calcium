# S06 — `/models`

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Live |
| **Package** | `prism-tui` |
| **Data source** | `prism models --json`, `prism models <family> --json`, `prism models <family> <version> --json` → `adaptModels` (C07) |
| **Source** | `j20` §`prism models` · A01 D8, D38 |
| **Status** | Draft |

---

## 1. Purpose

`/ps` shows runs — things that happened. `/serving` shows deployments — things that are running. `/models` shows **the registry**: what artefacts exist, which are serving, and where each came from.

It is the only surface with three levels behind one verb: families, then versions within a family, then one version. Each is a table over the same spine, so the machinery is S03's and S05's.

The question it answers that neither of the others can is **provenance**. Given a model version answering traffic right now, what run produced it, from which commit, and which MR approved it. That chain is the audit trail, and it is why `model_version` is immutable and why this surface exists rather than being a filter on `/ps`.

---

## 2. Families

`/models`:

```
▌ ── models · 6 families · 14 versions ─────────────────────────────────────────
▌
▌     family                versions  serving   latest     updated
▌ ▸   digit-classifier             4  de29117   de29117    2h ago
▌ ▸   flow-predictor               3  f410d99   f410d99    2d ago
▌ ▸   orderbook-pressure           2  3a8c5f6   3a8c5f6    30d ago
▌ ▸   latency-anomaly-gnn          3  de29117   b1c7e34    18d ago
▌ ▸   fill-rate                    1  —         cc18e7b    67d ago
▌
▌   ⏎ versions   ␣ expand
```

**`serving` and `latest` are separate columns and often differ.** A family whose newest version is not the one serving traffic is the single most useful thing this table shows — it means something was trained and not promoted, which is either work in progress or work forgotten. Collapsing them into one column would hide exactly that.

`latency-anomaly-gnn` above has a newer version than the one deployed. `fill-rate` has never been promoted at all.

---

## 3. Versions

`⏎` on a family appends `/models <family>`:

```
▌ ── models · digit-classifier · 4 versions ────────────────────────────────────
▌
▌     version   state      metric        run        mr      created
▌ ▸ ● de29117   serving    AUC 0.912     c4e1f23    !1244   2h ago
▌ ▸   b4f0c12   promoted   AUC 0.908     a3f9b21    !1248   3h ago
▌ ▸   9e2a55d   candidate  AUC 0.891     7c2d4e1    !1201   6d ago
▌ ▸   1f0c8b3   candidate  AUC 0.874     2e8a04c    !1188   21d ago
▌
▌   ⏎ detail   ␣ expand   ↑ promote   ≡ run   ↗ mr
```

`state` is derived, not stored:

| State | Meaning | Glyph |
|---|---|---|
| `serving` | Currently answering traffic | `●` ok |
| `promoted` | A serving YAML exists, but a newer version supersedes it | — meta |
| `candidate` | Registered, never promoted | — muted |

Versions sort **newest first** by creation — ascending age, as S03 established.

---

## 4. Version detail

```
▌ ── model_version · de29117-4f3a-9e8d-44a1b2c3d4e5 ────────────────────────────
▌
▌   family        digit-classifier
▌   state         ● serving · 3/3 replicas
▌   created       2026-07-28 12:14:03 UTC   (2h ago)
▌   produced by   c4e1f23  EvaluationJob  ·  malachy@fmx.io
▌   commit        a3f9b21  feat: tune digit classifier
▌   mr            !1244  merged 2026-07-28 12:31
▌
▌ ── artefacts ─────────────────────────────────────────────────────────────────
▌
▌   model_state_dict.pt      412.8 MB   sha256:9f3a2c…d41b
▌   fitted_transforms.pkl      1.2 MB   sha256:7e01bb…22af
▌   warmup_sample.pt          64.0 KB   sha256:c4d9f1…8e07
▌
▌ ── metrics ───────────────────────────────────────────────────────────────────
▌
▌   auprc          0.912
▌   recall@0.9     0.874
▌   latency_p99   42 ms
▌
▌   ≡ run   ↗ mr   ↗ commit   ↑ promote   { } json
```

**The provenance chain is the point of this view**: version → run → commit → MR, each a separate row and each actionable. `≡ run` fills `/ps <run_uuid>`; `↗ mr` and `↗ commit` open externally.

Artefact SHAs are shown **truncated in the middle** — the leading and trailing characters are what people compare by eye, and the middle carries no information a human uses. Full values are in `--json`.

---

## 5. Columns

### Families

| Column | Priority | Min | Align | Flex |
|---|---|---|---|---|
| expand · glyph | 100 | 1 · 1 | left | — |
| family | 95 | 18 | left | yes |
| serving | 85 | 7 | left | — |
| latest | 80 | 7 | left | — |
| versions | 60 | 8 | **right** | — |
| updated | 40 | 7 | left | — |

### Versions

| Column | Priority | Min | Align | Flex |
|---|---|---|---|---|
| expand · glyph | 100 | 1 · 1 | left | — |
| version | 95 | 7 | left | — |
| state | 85 | 9 | left | — |
| metric | 70 | 12 | left | yes |
| run | 60 | 7 | left | — |
| mr | 50 | 6 | left | — |
| created | 40 | 7 | left | — |

**`align` is declared on both tables** (C04 §3 requires it, and §2's figure right-aligns `versions`). Only `versions` is a number. `metric` reads `AUC 0.912` — a label and a value in one cell, so it aligns left despite ending in digits, and a renderer inferring alignment from content would get it wrong. That is why C11 does not infer (C11 I12's reasoning, one field over).

| Width | Families drop | Versions drop |
|---|---|---|
| 160 · 120 · 100 · 80 | none | none |
| 60 | `updated` | `created` |

**Both tables fit at 80.** Families sum to 61 cells with gaps, versions to 64 — these are six- and eight-column tables where S03 and S05 are eleven, so nothing is under pressure until the terminal is genuinely narrow. An earlier draft asserted drops at 80 by analogy with the wider tables rather than by arithmetic, which T4.1 would have caught on the first run.

At 60 only the timestamp drops from each. `serving` and `latest` therefore survive everywhere, which is what matters — their divergence is the finding — and `state` survives on the version table because it is how you tell which row that divergence refers to.

---

## 6. States

| State | Render |
|---|---|
| **Loading** | C23's pending entry |
| **Populated** | §2, §3 or §4 by depth |
| **Empty — no families** | `no model versions registered` — a fact, not a narrow query (as S05) |
| **Empty — family exists, no versions** | Cannot occur; a family is defined by having versions. If the envelope says otherwise, render the row and log the inconsistency |
| **Not found** | Unknown family → error with a `did you mean` at edit distance ≤ 2 |
| **Nothing serving** | The `serving` column reads `—`; the rule header adds `· none serving` |
| **Error** | C07's error path |
| **Narrow** | §5's drop order |

---

## 7. Interactions

| Action | Command | Kind | Offered when |
|---|---|---|---|
| `⏎ versions` | `/models <family>` | fill | Family rows |
| `⏎ detail` | `/models <family> <version>` | fill | Version rows |
| `≡ run` | `/ps <run_uuid>` | fill | A producing run is recorded |
| `↑ promote` | `/promote <version> --open-mr` | fill | State is `candidate` |
| `↗ mr` | The MR URL | open | An MR is recorded |
| `↗ commit` | The commit URL | open | A commit is recorded |
| `{ } json` | `/models … --json` | fill | Detail view |

**`{ } json` re-runs the command; it does not show this entry's payload.** On a `--watch`, or against anything that changes between the two calls, it returns different data than the block it was opened from — so an adapter bug can render wrong here and then show a fresh payload that looks fine. That is honest: re-running is what the command says. To inspect *this* entry — its argv, transport, stderr and retained payload — use `/debug` (C23 §2), which never re-runs.

`↑ promote` is offered on candidates only. Promoting the version already serving is a no-op the far side would refuse, and promoting a superseded one is a rollback — a real operation, but not one to offer as a row action beside its successor. Rollback goes through the command line deliberately.

---

## 8. Commitments

1. Three levels behind one verb: families, versions, one version.
2. `serving` and `latest` are separate columns, because their divergence is the most useful thing the table shows.
3. Version `state` is derived — serving, promoted, candidate — not stored.
4. Versions sort newest-first, consistent with S03.
5. The detail view's spine is the provenance chain: version → run → commit → MR, each actionable.
6. Artefact SHAs truncate in the middle; full values are in `--json`.
7. `serving` and `latest` survive at every width; only the timestamp columns drop, and not until 60.
8. `↑ promote` is offered on candidates only; rollback is not a row action.
9. The empty state states a fact and suggests nothing.
10. An unknown family produces a `did you mean` at edit distance ≤ 2, shared with S03 and S05.
11. An envelope claiming a family with zero versions is rendered and logged, never hidden.
12. Nothing on this surface mutates anything; every action either navigates or opens externally.

---

## 9. Tests

### Tier 1 — unit

- **T1.1**: each level adapts to its documented block sequence — three cases.
- **T1.2**: `state` is derived — a version that is serving, one superseded, one never promoted.
- **T1.3**: a family whose `serving` and `latest` differ renders both distinctly.
- **T1.4**: a family with nothing serving → `—` and the rule-header clause.
- **T1.5**: versions sort newest-first.
- **T1.6**: SHAs truncate in the middle, keeping both ends.
- **T1.7**: `↑ promote` appears on candidates only — three cases.
- **T1.8**: `≡ run`, `↗ mr` and `↗ commit` are withheld when the field is absent.
- **T1.9**: an unknown family → error with a suggestion; distance 3 → no suggestion.
- **T1.10**: the empty state suggests no filter change.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: measured height equals rendered height at seven widths, all three levels.
- **T2.3**: every action command re-parses through C18 to the intended `ParseResult`.
- **T2.4**: `↗` actions are `open` kind and scheme-checked; everything else is `fill` (C23 I17).
- **T2.5**: no action on this surface produces a mutating command — a scan of every emitted command against the manifest's tool list.

### Tier 3 — edge cases

- **T3.1**: zero families → empty state.
- **T3.2**: a family with one version, serving → `serving` equals `latest`; both columns still render.
- **T3.3**: 500 versions in one family → renders within budget; C14 virtualises.
- **T3.4**: a family name of 150 characters → truncated; `serving` and `latest` unaffected.
- **T3.5**: a version with no metrics → `—`, not a blank cell.
- **T3.6**: a version with no producing run recorded → the provenance row is omitted and `≡ run` is not offered.
- **T3.7**: a version with no MR → same for `↗ mr`.
- **T3.8**: an artefact of 0 bytes → `0 B`, not blank.
- **T3.9**: a SHA shorter than the truncation window → rendered whole, not padded.
- **T3.10**: a family reported with zero versions → the row renders and the inconsistency is logged.
- **T3.11**: at 60 columns → only `updated` drops from families and only `created` from versions; `serving` and `latest` both survive.
- **T3.11b**: at 80 columns → neither table drops anything. The arithmetic, asserted rather than assumed.
- **T3.12**: two versions created in the same second → stable order, no flicker between renders.

- **T3.20** (`{ } json`): the interactions section states that `{ } json` re-runs and points at `/debug`. A caveat that can be tidied away is a caveat that will be.
### Tier 4 — integration

- **T4.1** (with C11): the §5 drop orders are exactly what `planColumns` produces, for both tables.
- **T4.2** (with C23): `↗` actions reach the injected opener, never a shell.
- **T4.3** (with C23): actions from a frozen block are refused.
- **T4.4** (with S03): `≡ run` lands on S04's detail for that run.
- **T4.5** (with S05): a version shown `serving` here has a matching deployment there.
- **T4.6** (with C10, C02): geometry identical across themes, depths and ASCII.

### Tier 5 — e2e

- **T5.1**: golden frames at 80 / 100 / 120 / 160 for all three levels.
- **T5.2**: golden frames for the seven §6 states.
- **T5.3**: families → versions → detail → `≡ run` → S04, four entries retained in the transcript.
- **T5.4**: a family with an unpromoted newer version → visible at every width down to 60.

### Tier 6 — fail-on-revert

- **T6.1** (C2): collapsing `serving` and `latest` → T1.3 fails, and forgotten promotions become invisible.
- **T6.2** (C3): storing `state` rather than deriving it → T1.2 fails when a promotion happens between two renders.
- **T6.3** (C4): sorting versions oldest-first → T1.5 fails.
- **T6.4** (C6): truncating SHAs from one end → T1.6 fails, and comparing two by eye stops working.
- **T6.5** (C7): dropping `serving` or `latest` at any width → T3.11 fails.
- **T6.9** (C7): a drop table stated by analogy rather than computed → T3.11b fails.
- **T6.6** (C8): offering `↑ promote` on a serving version → T1.7 fails.
- **T6.7** (C11): hiding a zero-version family → T3.10 fails, and an envelope inconsistency goes unnoticed.
- **T6.8** (C12): adding a mutating action → T2.5 fails.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| The run that produced a version | S04 |
| The deployment serving it | S05 |
| Promotion output | S10 |
| Comparing two versions | S07 |
| Artefact bundle semantics | The far side |
| Rollback as a row action | Deliberately absent; the command line is the path |
