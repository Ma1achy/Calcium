# S05 — `/serving`

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Live |
| **Package** | `prism-tui` |
| **Data source** | `prism serving --json`, `prism serving <name> --json`, `--pods` → `adaptServing` (C07) |
| **Source** | `j21` · A01 D8, D38 · A01 Appendix A.3 |
| **Status** | Draft |

---

## 1. Purpose

`/serving` answers a different question from `/ps`. A run has a *status* and reaches a terminal state; a deployment has *health* and does not. It is either serving traffic acceptably or it is not, and that judgement is composite — replica count, pod states and error rate together.

Three renders behind one verb: the list, one deployment's detail, and its pods. All three are tables or table-plus-detail, so most of the machinery is S03's.

The thing this surface must not do is imply immediacy. **`scale` and `undeploy` open merge requests** — CODEOWNERS review, no auto-merge on `serving/` — and a surface that makes them look like buttons would misrepresent the governance boundary they exist to enforce.

---

## 2. The list

At 100 columns:

```
▌ ── serving · 7 healthy · 1 degraded ──────────────────────────────────────────
▌
▌     name              version  replicas  status    errors  req/s  p50   p99    age
▌ ▸ ● digit-classifier  de29117  3/3       healthy   0.02%     432  18ms  45ms    8d
▌ ▸ ● flow-predictor    f410d99  2/2       healthy   0.00%   1,284   6ms  22ms    2d
▌ ▸ ▲ volatility-estim… 7d4a112  2/3       degraded  1.24%     301  38ms  290ms  12d
▌ ▸ ● orderbook-pressu… 3a8c5f6  4/4       healthy   0.01%   2,104   4ms  18ms   30d
▌
▌   ⏎ detail   ␣ expand   ⬡ pods   ≡ logs   ↕ scale   ⊘ undeploy
```

Health is a **composite judgement, not a field**: `healthy` requires full replicas, every pod running, and an error rate under 0.1%. A deployment at 3/3 with 5% errors is degraded, and reporting it as healthy because the replica count is right would be the surface lying about the thing it exists to show.

| Health | Requires | Glyph |
|---|---|---|
| `healthy` | full replicas · all pods running · errors < 0.1% | `●` ok |
| `degraded` | any replica missing, any pod not running, or errors ≥ 0.1% | `▲` warn |
| `down` | zero ready replicas | `✗` error |

Error rate is toned independently of health so the number itself carries the signal: `≥ 1%` error, `≥ 0.1%` warn, below that muted.

---

## 3. Columns

Display order is the declared order below; priority governs survival only (C11 I4).

| Column | Priority | Min | Align | Flex | Sortable |
|---|---|---|---|---|---|
| expand | 100 | 1 | left | — | — |
| glyph | 100 | 1 | left | — | — |
| name | 95 | 16 | left | yes | yes |
| replicas | 85 | 7 | left | — | yes |
| status | 80 | 10 | left | — | yes |
| errors | 70 | 7 | **right** | — | yes |
| version | 65 | 7 | left | — | yes |
| p99 | 60 | 6 | **right** | — | yes |
| req/s | 50 | 7 | **right** | — | yes |
| p50 | 40 | 6 | **right** | — | yes |
| age | 30 | 5 | **right** | — | yes |

**`align` is declared here as it is in S03 §3**, and for the same reason: it is required on `ColumnDef` and the figure in §2 right-aligns five of these columns on a field this table did not state. `replicas` stays left — `3/3` is a ratio rather than a number, and its values are all the same width, so the illustration cannot be read as evidence either way.

| Width | Drops |
|---|---|
| 160 · 120 · 100 | none — all eleven, summing to 93 cells with gaps |
| 80 | `age`, `p50` |
| 60 | `age`, `p50`, `req/s`, `p99`, `version` |

At 60 the table is name, replicas, status, errors — which still answers "what is deployed and is it working". Latency and throughput are the diagnostics you reach for after the answer is no.

**p99 outranks p50 and req/s.** A tail latency is what breaks a caller; a median that looks fine while p99 is 290 ms is the exact situation this table exists to surface.

---

## 4. Detail

`⏎` on a row appends `/serving <name>`:

```
▌ ── serving · volatility-estimator ────────────────────────────────────────────
▌
▌   model_version   7d4a112
▌   replicas        2/3 ready · 1 CrashLoopBackOff
▌   health          ▲ degraded
▌   endpoint        http://volatility-estimator.prism-serving.svc.cluster.local
▌   namespace       prism-serving
▌   image           registry.fmx/prism/modelserver:v0.2.1
▌   age             12d
▌
▌ ── request rate · last 30 minutes ─────────────────────────────────────────────
▌
▌   380 │        ⢀⡠⠔⠒⠢⢄
▌       │   ⣀⠤⠒⠉        ⠉⠒⠤⣀
▌   220 │⠉⠉                  ⠉⠉⠑⠒⠤⢄⣀
▌       └──────────────────────────────────────
▌        30m ago            15m            now
▌
▌   p50 38ms    p99 290ms    errors 1.24%
▌
▌   ⬡ pods   ≡ logs   ⚡ events   ◉ watch   ↕ scale   ⊘ undeploy
```

The replicas line names *why* it is degraded rather than only that it is. `2/3` alone sends you to `--pods` to find out; `2/3 ready · 1 CrashLoopBackOff` often ends the investigation there.

---

## 5. Pods

`⬡ pods` fills `/serving <name> --pods`:

```
▌ ── pods · volatility-estimator · 2/3 ready ───────────────────────────────────
▌
▌     name                              ready  status             restarts  age   node
▌   ● volatility-estimator-7d8f9b-k2p1  1/1    Running                   0  12d   gpu-02
▌   ● volatility-estimator-7d8f9b-m4x7  1/1    Running                   1  12d   gpu-05
▌   ✗ volatility-estimator-7d8f9b-q9z3  0/1    CrashLoopBackOff          7  4m    gpu-02
```

Restarts are `warn`-toned above zero and `error`-toned above five. A pod that has restarted seven times in four minutes is the finding, and a plain number in default tone buries it among the zeroes.

### The pods table's columns

Declared here because the region is a table and stated none — the same gap S15 §5
had, found by auditing the truncation side.

| Column | Priority | Min | Align | Trunc | Flex | Sortable |
|---|---|---|---|---|---|---|
| glyph | 100 | 1 | left | end | — | — |
| name | 95 | 24 | left | **start** | yes | yes |
| ready | 85 | 5 | left | end | — | yes |
| status | 80 | 18 | left | end | — | yes |
| restarts | 70 | 8 | **right** | end | — | yes |
| age | 60 | 5 | **right** | end | — | yes |
| node | 40 | 7 | left | end | — | yes |

**Pod names truncate from the start**, keeping the hash suffix — the prefix is the
deployment name you already know, and `volatility-estimator-7d8f9b-k2p1` cut the
other way makes all three rows read alike. `truncateFrom: "start"` names the end
characters are removed from (C04 I30); it did not exist when this paragraph first
stated the intent in prose.

`restarts` and `age` are right-aligned, which the figure above draws and this table
did not state until now.

---

## 6. States

| State | Render |
|---|---|
| **Loading** | C23's pending entry |
| **Populated** | §2 |
| **Empty** | `no deployments in prism-serving` — no filter suggestion, because there are no filters here; an empty cluster is a fact, not a narrow query |
| **All healthy** | The rule header reads `7 healthy` with no degraded clause |
| **Not found** | Name matched nothing → error quoting the name, with a `did you mean` at edit distance ≤ 2 (A01 Appendix A.2) |
| **Error** | C07's error path |
| **Degraded — offline** | Error state; the header already says `offline` |
| **Narrow** | §3's drop order |

**The empty state differs from S03's deliberately.** `/ps` empty means your filters were narrow, so it suggests widening. `/serving` empty means nothing is deployed, and suggesting a filter change would be misleading.

---

## 7. Interactions

| Action | Command | Kind |
|---|---|---|
| `⬡ pods` | `/serving <name> --pods` | fill |
| `≡ logs` | `/serving <name> --logs` | fill |
| `⚡ events` | `/serving <name> --events` | fill |
| `◉ watch` | `/serving <name> --watch` | fill |
| `↕ scale` | `/serving scale <name> --replicas=` | fill, **incomplete** |
| `⊘ undeploy` | `/serving undeploy <name>` | fill |

**`↕ scale` fills an incomplete command.** The cursor lands after `--replicas=` with no value, so the number must be typed. There is no plausible default — scaling to a guess is worse than not scaling — and an incomplete fill makes that explicit rather than offering a number to accept without thinking.

`⊘ undeploy` is a fill like everything else, and the confirmation is the MR it opens, not a dialog here. Adding a local confirm would imply the command is destructive on submission, when what it actually does is open a reviewable change.

Neither action is offered on a deployment that is already `down` with zero replicas — scaling a dead deployment and undeploying an absent one both produce far-side refusals, and offering them wastes a round trip.

---

## 8. Commitments

1. Health is composite — replicas, pod states and error rate — not a single field.
2. Error rate is toned independently, so the number carries its own signal.
3. p99 outranks p50 and req/s, because tail latency is what breaks callers.
4. At 60 columns the table still says what is deployed and whether it works.
5. The detail's replicas line names why a deployment is degraded, not only that it is.
6. Pod restarts are toned by count; pod names truncate from the left.
7. The empty state states a fact and suggests nothing, unlike S03's.
8. `↕ scale` fills an incomplete command so a replica count must be typed.
9. `⊘ undeploy` has no local confirm; the MR is the confirmation.
10. Actions are withheld on a deployment that is already down.
11. Nothing on this surface implies that scale or undeploy takes effect on submission.
12. An unknown name produces a `did you mean` at edit distance ≤ 2.

---

## 9. Tests

### Tier 1 — unit

- **T1.1**: the list adapts to rule, table, tip.
- **T1.2**: health is computed, not read — 3/3 with 5% errors → `degraded`; 2/3 with 0% → `degraded`; 0 ready → `down`.
- **T1.3**: error tone thresholds at 0.09%, 0.1%, 0.99%, 1.0%.
- **T1.4**: restart tone at 0, 1, 5, 6.
- **T1.5**: pod names truncate from the left, keeping the hash.
- **T1.6**: `↕ scale` fills with a trailing `--replicas=` and no value.
- **T1.7**: actions are withheld on a `down` deployment.
- **T1.8**: the degraded detail line names the pod condition.
- **T1.9**: an unknown name → error with a suggestion; a name at distance 3 → error without one.
- **T1.10**: the empty state suggests no filter change.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: measured height equals rendered height at seven widths, for all three renders.
- **T2.3**: every action command re-parses through C18 to the intended `ParseResult`.
- **T2.4**: the incomplete scale fill parses as an `app` result with a **failing** validation — malformed by design, and C23 surfaces it rather than spawning (C23 I4).

### Tier 3 — edge cases

- **T3.1**: zero deployments → empty state, no table.
- **T3.2**: 200 deployments → renders within budget; C14 virtualises.
- **T3.3**: a name of 120 characters → truncated at its planned width; status and errors unaffected.
- **T3.4**: replicas `0/0` → `down`, and no actions offered.
- **T3.5**: a deployment with no metrics yet → `—` in req/s, p50, p99; health from replicas alone.
- **T3.6**: an error rate of exactly 0.1% and exactly 1% → the documented tone at each boundary.
- **T3.7**: a pod list with zero pods → `no pods` rather than an empty table.
- **T3.8**: 60 pods → all render; the block scrolls.
- **T3.9**: a request-rate series of one point → a dot (C12 T1.6).
- **T3.10**: at 60 columns → four columns, nothing overflows, dropped columns present in the expand row.
- **T3.11**: `--watch` merge patches → rows update in place, expansions survive, viewport unmoved.

### Tier 4 — integration

- **T4.1** (with C11): the §3 drop order is exactly what `planColumns` produces.
- **T4.2** (with C12): the request-rate plot's height is declared and constant.
- **T4.3** (with C23): every action is a fill; the incomplete scale fill lands with the cursor at end.
- **T4.4** (with C23): actions from a frozen block are refused.
- **T4.5** (with C10, C02): geometry identical across themes, depths and ASCII; health still distinguishable at 1-bit by glyph.
- **T4.6** (with S03): the same `did you mean` implementation is used by both surfaces.

### Tier 5 — e2e

- **T5.1**: golden frames at 80 / 100 / 120 / 160 for list, detail and pods.
- **T5.2**: golden frames for the eight §6 states.
- **T5.3**: list → detail → pods → back by scrolling, all three entries retained.
- **T5.4**: `↕ scale`, type `3`, submit → an MR-opening flow, rendered by S10.
- **T5.5**: a degraded deployment end to end → list shows `▲`, detail names the pod condition, pods shows the restart count.

### Tier 6 — fail-on-revert

- **T6.1** (C1): reading health from a single field → T1.2 fails, and a deployment with 5% errors reports healthy.
- **T6.2** (C2): toning errors from health rather than from the rate → T1.3 fails.
- **T6.3** (C3): ranking p50 above p99 → T4.1 fails at 80 columns, and tail latency drops first.
- **T6.4** (C6): truncating pod names from the right → T1.5 fails and every pod reads identically.
- **T6.5** (C8): filling `scale` with a default replica count → T1.6 fails, and a guess becomes a keystroke away.
- **T6.6** (C9): adding a local undeploy confirm → implies immediacy, and the MR stops being the boundary.
- **T6.7** (C10): offering actions on a down deployment → T1.7 fails.
- **T6.8** (C7): suggesting a filter change on empty → T1.10 fails and an empty cluster reads as a narrow query.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| The MR-opening output | S10 |
| `--logs` and `--watch` as views | S12 |
| Column planning | C11 |
| Promotion | S10 |
| Model versions as a catalogue | S06 |
| Prometheus query semantics | The far side |
