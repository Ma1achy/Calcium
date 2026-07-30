# S03 — `/ps` list

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Live — navigable in place while it is the newest block |
| **Package** | `prism-tui` |
| **Data source** | `prism ps --json` → `adaptPs` (C07) |
| **Source** | `j20` · scratchpad 2 §4 · A01 D8, D38, D39 · A01 Appendix A.4 |
| **Status** | Draft |

---

## 1. Purpose

`/ps` is the verb people run most, and the richest surface in the set — a sortable, filterable, drillable table with inline sparklines and per-row actions. It is the one that exercises C11, C12, C13, C14, C16 and C23 simultaneously, and the reason it is written second: if the surface template survives this, it survives anything.

---

## 2. The screen

At 100 columns, `--mine`, live:

```
▌ ── ps · 4 of 11 · --mine · last 24h ──────────────────────────────────────────────────────────────
▌
▌ all ×11  training ×9  evaluation ×2
▌ ● running ×1  ✓ succeeded ×6  ✗ failed ×2  ○ queued ×1
▌
▌       uuid     family          status       detail            metric     age  kind        owner
▌ ▸  ●  a3f9b21  digit-classif…  running      ep 17/40          0.0372     23m  candidate   malachy
▌ ▸  ✓  7c2d4e1  decoder-zoom    succeeded                      0.0089     41m  experiment  malachy
▌ ▸  ✗  2e8a04c  graphsage       failed       OOM at ep 3            —  1h 12m  experiment  priya
▌ ▸  ○  f410d99  flow-predictor  queued                              —      3m  candidate   malachy
▌
▌ ⏎ detail  ␣ expand  ≡ logs  ⚡ events
```

**This figure is `planColumns`' output, not a drawing.** The earlier one was drawn by hand before the priorities in §3 were fixed and never recomputed, and it was wrong in two ways that only arithmetic finds. It showed nine columns ordered `uuid · kind · family`, against §3's declared `uuid · family · status · detail · metric · spark · age · kind · owner · mr` — so the picture violated C11 I4, priority governs survival and never position, in the section whose own §3 opens by citing it. And it omitted `owner`, which survives here: the ten admitted columns sum to 94 cells with gaps, and 94 ≤ 98.

The arithmetic, so the next reader does not have to derive it (`test/integration/table.test.ts` asserts all of it against the planner):

| | Cells |
|---|---|
| Terminal | 100 |
| Content, less S01's two-cell gutter | 98 |
| Twelve minimums, `1+1+7+12+11+12+8+8+6+10+8+6` | 90 |
| Eleven gaps at 2 | 22 |
| **All twelve** | **112** — over by 14 |
| Less `mr` (6 + a gap) | 104 — still over |
| Less `spark` (8 + a gap) | **94** — fits, and the ten drawn above are what is left |
| Residual to the two `flex` columns, `family` and `detail` | 4, two each |

**`family` truncates at 98, and that is what the correction exposes.** `digit-classifier` is 16 cells and the column gets 14 — 12 declared plus its half of the residual. The old figure appeared to fit it only because it had dropped `owner` and spent those 10 cells on `family`. If a full family name at 100 columns matters more than `owner` does, the remedy is `owner`'s priority or `family`'s minimum in §3, not the picture.

**`metric` and `age` are right-aligned because §3 now declares it.** The old figure right-aligned them too, on a field the column table did not record — which is the third instance of an illustration carrying an unstated intent, and the reason `HEIGHT_AUDIT.md` now says what to do when a figure and a table disagree. The picture was right about the intent; what was missing was the declaration.

Both figures in this section are generated from `planColumns` and C11's renderer, through the fixture in `test/support/surfaces.ts`, whose columns are read from §3's table rather than restated. A change to §3 changes them.

Row 1 expanded:

```
▌ ▾  ●  a3f9b21  digit-classif…  running      ep 17/40          0.0372     23m  candidate   malachy
▌     mr    !1248  auto-merged
▌     node  gpu-04.fmx.internal · 2×GPU · 16Gi
▌     ████████████░░░░░░░░░░░░░░░░  43%
▌     ≡ logs   ⚡ events   ◉ watch   ⊘ cancel   { } json
```

The expanded detail carries the columns that dropped at this width (C11 I2) followed by the row's own detail blocks — a `progress` and a `pills` of actions.

**`owner` is not in the expand row, because at 100 it is not dropped.** The earlier figure listed it there, which followed from the same uncorrected drawing: it had `owner` missing from the header, so the expand row was where it went. A field shown twice in one frame is the other half of that defect. At 60 columns `owner` does drop and does appear here — §6's narrow case, and T5.3 asserts it.

**The sparkline is its own column now, and it is absent here because it drops at 100.** The earlier figure drew `0.0372 ▁▂▃▅▆` inside `metric`: 12 cells and a five-sample spark, in a column §3 declares at `min` 8 — matching neither the column nor A01 A.2's eight-point window. §3 splits them, and §3 says why.

---

## 3. Columns

Twelve columns. Priority governs survival, never position (C11 I4).

| Column | Priority | Min | Align | Flex | Sortable | Source |
|---|---|---|---|---|---|---|
| expand | 100 | 1 | left | — | — | Synthesised by C11 |
| glyph | 100 | 1 | left | — | — | `status` → the D-vocabulary glyph |
| uuid | 90 | 7 | left | — | yes | `uuid`, first 7 cells |
| family | 85 | 12 | left | yes | yes | `family`, else `name` |
| status | 80 | 11 | left | — | yes | `status`, word only |
| detail | 65 | 12 | left | yes | — | Epoch, failure reason, or headline metric |
| metric | 60 | 8 | **right** | — | yes | `loss` or `headline`, the number alone |
| spark | 15 | 8 | left | — | — | `Cell.spark` — the last 8 points (A01 A.2) |
| age | 50 | 6 | **right** | — | yes | `age_minutes`, humanised |
| kind | 30 | 10 | left | — | yes | `kind` |
| owner | 20 | 8 | left | — | yes | `owner` |
| mr | 10 | 6 | left | — | — | `mr`, an `open` action |

**`align` is declared, not defaulted.** `ColumnDef.align` is required (C04 §3) and this table did not state it, so the figure in §2 drew `metric` and `age` right-aligned on a field the spec never declared — the third time an illustration has carried an intent the text does not record (see `HEIGHT_AUDIT.md`). Numbers right-align; that is the convention the drawing was following.

C11 cannot derive it. It has no way to know a column holds numbers, and `metric` legitimately holds `—` for a run that never produced one — so a renderer inferring alignment from content would right-align a column until the first failure appeared in it.

**Status is a word; the detail is a column.** `running · ep 17/40` as one cell would truncate to `running · ep 17/4…`, and a half-rendered status reads as a different status. Splitting them means the epoch or the failure reason drops as a *column* — cleanly, into the expand row — while the status word never truncates (C11 I10, satisfied by `min` equalling the longest word plus glyph).

**The sparkline is its own column for the same reason, and the second instance is what makes it a principle: a cell holds one value.** `0.0372 ▁▂▃▅▆` is a number *and* a series in one cell, and C11 truncates a cell at its planned width — so at any width where that cell is short, either the number loses digits or the sparkline becomes a shorter series that reads as real. Neither is recoverable by the reader, and neither is distinguishable from correct output. Two cells cannot truncate into each other; the rule S03 learned once for `status`/`detail` is the rule, not that case's exception. (S04 §3 states the same thing for a gate's comparator and threshold, which makes three.)

The arithmetic then works the right way round. Widening `metric` to 15 would cost 7 cells at every width and push `owner` out at 100. As its own column below `owner` in priority, the spark is what goes at 100 and `owner` survives — **decoration is lost before a data field is**, which is what priority is for.

`spark` carries no label and no `sortable`: there is nothing to sort a series by that a reader would mean, and a header over eight ramp glyphs says less than the blank does. Its 8 cells are A.2's window, one glyph per sample (C12 §2), so the column is exactly the series and not a scaled version of it.

### What survives at each width

Derived from the priorities, and pinned by golden frames:

| Width | Columns |
|---|---|
| 160 | all twelve, summing to 112 cells with gaps |
| 120 | all twelve, family and detail flexed |
| 100 | drops `mr`, `spark` |
| 80 | drops `mr`, `spark`, `owner`, `kind` |
| 60 | drops `mr`, `spark`, `owner`, `kind`, `age`, `metric` |

At 60 the table is expand, glyph, uuid, family, status, detail — which is still enough to identify a run and know what happened to it, and everything else is one keystroke away in the expand row.

---

## 4. Filter pills

Two rows: **kind, then status** (A01 Appendix A.4). Not one wrapped row — the two answer different questions and reading them as one line is worse.

Each pill is one `pills` block, so two blocks (C04 §3 — a `pills` block is one logical row).

Pills mutate **in place** (A01 D8). Clicking `✗ failed ×2` re-filters the live block; it does not append a new one. Five filter clicks producing five transcript entries is noise.

Two things keep that honest:

- The rule header records the applied state, so the frozen record reads `── ps · 2 of 11 · --mine --status=failed · sorted by age ──`.
- The input bar mirrors the equivalent command as a **fill**, so `⏎` turns exploration into a real invocation against fresh data.

The active pill is `accent`-toned; the rest are `muted`. Counts come from the unfiltered set, so `all ×11` stays 11 after filtering.

---

## 5. Sort

Default is **age ascending** — newest first, which is what people mean by "what's happening".

Age counts *up* from submission, so the newest run has the smallest age. "Newest first" is therefore ascending, and calling it descending — as an earlier draft did — would have shipped a default that shows your oldest runs first.

Sortable columns carry an indicator (` ↑` / ` ↓`) when active. Sorting is view state on the block (C11 §4): stable, height-neutral, type-aware, detail rows travelling with their parents, missing values last in both directions.

`age` sorts by magnitude, not lexically — `45s`, `12m`, `2h`, `3d`. `metric` sorts numerically. Everything else sorts by grapheme.

---

## 6. States

| State | Trigger | Render |
|---|---|---|
| **Loading** | Verb in flight | The pending entry from C23 §3 step 3 — rule header with the command, running indicator, no table yet |
| **Populated** | Success | §2 |
| **Empty** | Zero rows after filters | Rule header, both pill rows, then: `no runs match --mine --status=running --since=24h  ·  try --all or --since=7d`. **The filters are named and a widening is suggested** — an unqualified "no results" makes people think the system is broken |
| **Error** | Non-zero exit | C07's error path — envelope as a notice, `remediation` as a fill action. No table |
| **Partial** | Cancelled mid-fetch | Whatever arrived, plus a muted cancelled notice |
| **Degraded — offline** | Cluster unreachable | Error state with the transport envelope; the header already says `offline` |
| **Narrow** | < 100 cols | §3's drop order |
| **Too small** | < 60 cols | S01's fallback replaces the frame entirely |

---

## 7. Interactions

While live (C13 §2), **and only once focus is in the block**. At the prompt, `f` types the letter `f`; after `↓` moves focus into the table it focuses the pills. That is what keeps this a live block rather than a pushed view under A01 D4 — the prompt never loses letters it would otherwise receive.

**These are surface bindings, contributed by the block rather than baked into C16's keymap** — a surface is not a component and cannot register a handler, so an adapter attaches a `keymap` to the block it produces and C16 merges it into the `liveBlock` target while that block is live. Bindings are withdrawn when the block freezes, and a collision with a global binding is a construction error, not a silent shadow.

| Key | Effect |
|---|---|
| `↑` `↓` | Move row focus |
| `␣` | Toggle expand |
| `⏎` | Drill in — appends `/ps <uuid>` as a new entry |
| `f` | Focus the pill row |
| `s` | Cycle sort on the focused column |
| `⌃↑` | Return focus to the prompt |

Row actions, surfaced on focus and in the expanded panel:

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

**Every action is a fill except the MR link.** `↑ promote … --open-mr` is precisely the command that must be read before it runs (A01 D8), and `⊘ cancel` likewise. Only pills use `exec`, because a filter is reversible.

`↑ promote` appears only on succeeded candidates; `⊘ cancel` only on running or queued rows. An action that would certainly be refused is not offered.

Once frozen, every action is refused (C23 I18) — the data is minutes old and a stale promote is the footgun D5 exists to prevent.

---

## 8. Commitments

1. Eleven columns with declared priorities; position never follows priority.
2. Status is a word and the detail is a separate column, so the status never truncates and the reason drops cleanly.
3. Drop order is pinned by golden frames at four widths, not left emergent.
4. At 60 columns the table still identifies a run and its outcome; everything else is in the expand row.
5. Pills are two blocks — kind, then status — and mutate in place.
6. Surface bindings ride on the block and are merged into `liveBlock` only while it is live.
7. Pill counts come from the unfiltered set.
8. The rule header records the applied filter and sort; the input bar mirrors the equivalent command as a fill.
9. Default sort is age **ascending**, which is newest-first; `age` and `metric` sort by magnitude, not lexically.
10. The empty state names the active filters and suggests a widening.
11. Every action is a fill except the MR link, which is a scheme-checked open.
12. Actions that would certainly be refused are not offered.
13. Once frozen, all actions are refused.

---

## 9. Tests

### Tier 1 — unit

- **T1.1**: a `ps --json` fixture adapts to the documented block sequence — rule, pills, pills, table, tip.
- **T1.2**: each status maps to its glyph and tone — seven cases from the D-vocabulary.
- **T1.3**: a running row carries a `spark` on the metric cell; a settled row does not.
- **T1.4**: `age_minutes` humanises — 45 → `45m`, 72 → `1h 12m`, 1562 → `1d 02h`.
- **T1.4b**: the default sort places a 3-minute-old run above a 2-hour-old one. Ascending age, newest first.
- **T1.5**: the detail column carries epoch for running, failure reason for failed, headline for evaluation, empty for queued.
- **T1.6**: pill counts derive from the unfiltered set, not the filtered one.
- **T1.7**: the rule header text reflects filter and sort state exactly.
- **T1.8**: `↑ promote` appears only on succeeded candidates; `⊘ cancel` only on running or queued.
- **T1.9**: every action's command string matches §7 verbatim.
- **T1.10**: the empty state names every active filter and suggests a widening.

### Tier 2 — contract

- **T2.1**: the document passes `validateDocument` in every §6 state.
- **T2.2**: measured height equals rendered height at seven widths, flat and with every expansion combination on a five-row fixture.
- **T2.3**: every action command re-parses through C18 to the intended `ParseResult`.
- **T2.4**: `min` for `status` equals the longest status word plus glyph and space, so C11 I10 holds and it is never truncated.
- **T2.5**: dropped columns appear in every row's expanded detail at every width where they drop (C11 T2.8 from this surface).

### Tier 3 — edge cases

- **T3.1**: zero rows → empty state, pills still rendered so the filter can be widened from the block itself.
- **T3.2**: one row → no sort indicator ambiguity; sorting is a no-op.
- **T3.3**: 10,000 rows → renders within budget; C14 virtualises; scrolling stays smooth.
- **T3.4**: a family name of 200 characters → truncated at its planned width, other columns unaffected.
- **T3.5**: a failure reason longer than the detail column → truncated with the capability-correct marker; the status word is untouched.
- **T3.6**: a null `metric` → `—`, not `null` or blank.
- **T3.7**: a run with no `mr` → `—`, and no open action offered.
- **T3.8**: every row expanded → measured height is exact; collapsing returns to the original.
- **T3.9**: a `merge` patch from `--watch` → expanded rows stay expanded, scroll unmoved (C04 I9 from this surface).
- **T3.10**: filtering to zero then clearing the filter → the original rows return, sort preserved.
- **T3.11**: sorting on a column that later drops at a narrower width → the sort persists and reapplies when the column returns.
- **T3.12**: two rows with the same `uuid` prefix → both shown in full; no collision.

- **T3.20** (`{ } json`): the interactions section states that `{ } json` re-runs and points at `/debug`. A caveat that can be tidied away is a caveat that will be.
### Tier 4 — integration

- **T4.1** (with C11): the §3 drop order is exactly what `planColumns` produces at each width.
- **T4.2** (with C12): the sparkline occupies its cell and contributes no rows.
- **T4.3** (with C13, C14): while live, arrow keys move focus and the viewport follows; once frozen, focus cannot enter.
- **T4.4** (with C23): a pill click mutates in place; the transcript gains no entry.
- **T4.5** (with C23): `⏎` on a row appends `/ps <uuid>` as an ordinary entry.
- **T4.6** (with C23): every action from a frozen block is refused.
- **T4.7** (with C16): `f` focuses the pills; `s` cycles sort on the focused column.
- **T4.7b** (with C16): the same keys do nothing once the block freezes, and nothing while another block is live.
- **T4.7c** (with C16): a surface binding colliding with a global one fails at construction.
- **T4.8** (with C10, C02): geometry is identical in both themes, all four colour depths, and under ASCII.

### Tier 5 — e2e

- **T5.1**: golden frames at 80 / 100 / 120 / 160, flat and expanded, both themes.
- **T5.2**: golden frames for each of the eight §6 states.
- **T5.3**: a real fixture-backed `/ps --mine` → renders, sorts, filters, expands, drills in.
- **T5.4**: `/ps --watch` for two minutes → rows update in place, expanded rows stay open, viewport does not move.
- **T5.5**: resizing 160 → 60 → 160 with a row expanded → columns drop and return, the expansion survives, no data is unreachable at any width.
- **T5.6**: 10,000 rows scrolled top to bottom → smooth, no drift between measured and rendered rows.

### Tier 6 — fail-on-revert

- **T6.1** (C2): merging status and detail into one cell → T2.4 fails and a truncated status reads as a different status.
- **T6.2** (C3): letting drop order emerge from priorities alone without golden frames → T4.1 fails on the first priority tweak.
- **T6.3** (C5): rendering pills as one wrapped row → T1.1's block sequence fails.
- **T6.4** (C6): deriving pill counts from the filtered set → T1.6 fails and `all ×11` becomes `all ×2`.
- **T6.5** (C7): not recording filter state in the rule header → T1.7 fails, and a frozen block no longer says what it was showing.
- **T6.6** (C8): sorting `age` lexically → T1.4 fails and `2h` sorts before `45s`.
- **T6.11** (C8): defaulting to descending age → T1.4b fails, and the list opens on the oldest runs.
- **T6.7** (C9): a bare "no results" → T1.10 fails, and users conclude the tool is broken.
- **T6.8** (C10): making `↑ promote` an `exec` → T1.9's action-kind assertion fails, and a keypress promotes.
- **T6.9** (C11): offering `⊘ cancel` on a settled run → T1.8 fails.
- **T6.10** (C4): dropping a column without it reaching the expand row → T2.5 fails, and narrow terminals lose data.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| The run detail view | S04 |
| `--logs`, `--events`, `--watch` | S12, C23 |
| Column planning mechanics | C11 |
| Sparkline rasterisation | C12 |
| The `ps --json` envelope | The far side; C07's adapter absorbs it |
| Namespace variants (`/experiment ps`) | Filter presets on this surface, per scratchpad 2 §7 |
