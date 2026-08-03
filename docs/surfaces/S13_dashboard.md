# S13 — Dashboard

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | **Pushed view** |
| **Package** | `prism-tui` |
| **Covers** | `/dashboard` · `/dashboard --once` |
| **Data source** | Five independent queries → `adaptDashboard` (C07) |
| **Source** | `j22` §`prism dashboard` · A01 D4, D7 · S12 §1 |
| **Status** | Draft |

---

## 1. Purpose

`/ps` shows runs. `/serving` shows deployments. The dashboard shows **the cluster** — everything at once, live, in one screen.

It is the second pushed view, and it qualifies for the same reason S12 does: Tab moves between panels, Enter drills in, and letter keys jump. A prompt cannot coexist with that.

It is also the demo. Someone asking "what does it look like" gets shown this first, which is a real design constraint: it must look right at 120 columns on a projector *and* degrade honestly on a laptop at 100, without a special case for either.

---

## 2. The screen

At 120 × 36:

**The fence is a diagram, and its box is not rendered.** The outer border marks where the region begins and ends; `tui-kit` draws no frame around anything (S01 §3 — header, viewport, prompt, footer, and nothing between them). Counting the border gives two rows the terminal does not have, and the side rails give two cells every row does not have.

Stated because the same picture produced a live ambiguity in S01, where the deferral asserting it could not be written for two commits while the figure and the arithmetic disagreed. `frameRows` in `test/support/surfaces.ts` strips the marks, so the convention is mechanical rather than remembered.

```
┌ ▲ prism · fmx-prod ──────────────────────── ● live · 14:23:07 · updated 3s ─┐
│                                                                             │
│ ┌ cluster ───────────────────┐ ┌ activity · last hour ────────────────────┐ │
│ │ nodes      12  (8 GPU)     │ │ submissions   47  ████████████░░░░░░░░   │ │
│ │ gpu util   71%  ██████░░░  │ │ promotions     3  █░░░░░░░░░░░░░░░░░░░   │ │
│ │ cpu util   34%  ███░░░░░░  │ │ failures       4  █░░░░░░░░░░░░░░░░░░░   │ │
│ │ pods      342              │ │ succeeded     39  ██████████░░░░░░░░░░   │ │
│ │ queue       3 active       │ │                                          │ │
│ └────────────────────────────┘ └──────────────────────────────────────────┘ │
│                                                                             │
│ ┌ running · 3 ──────────────────────────────────────────────────────────────┐│
│ │ ● a3f9b21  digit-classifier  ep 17/40  ████████░░░░  0.0372 █▆▅▄▃▂▂▁  23m ││
│ │ ● e2a9c41  account-risk        batch 4/8 ██████░░░░░░               45s   ││
│ │ ○ f410d99  flow-predictor      queued                                3m   ││
│ └───────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│ ┌ deployed · 7 healthy · 1 degraded ────────────────────────────────────────┐│
│ │ ✓ digit-classifier    432/s   45ms  0.02%  │ ✓ orderbook-pressure  2,104/s││
│ │ ✓ flow-predictor    1,284/s   22ms  0.00%  │ ▲ volatility-estim…     301/s││
│ └───────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│ ┌ events ───────────────────────────────────────────────────────────────────┐│
│ │ 14:23:14  a3f9b21 reached epoch 17 · loss 0.0372 ↓                        ││
│ │ 14:21:48  !1248 merged · digit-classifier promoted to serving             ││
│ │ 14:18:33  2e8a04c failed: OOM at epoch 3                                  ││
│ └───────────────────────────────────────────────────────────────────────────┘│
└ tab panel · ⏎ drill in · r refresh · esc back ───────────────────────────────┘
```

Five panels, laid out as a `group` of `panel`s (C04 §3) — the same block vocabulary as everything else, which is what makes it themed, ASCII-degradable and measurable without a bespoke renderer.

### The Running panel's columns

**Declared here because the region is a table and stated none** — the S15 §5 gap a fifth time, after S05 and S09 were the third and fourth. A table with no column table has no drop order, so nothing can check what this panel does at 100 or at 80, and A03 CP6 has nothing to compare.

| Column | Priority | Min | Align | Trunc | Flex | Sortable |
|---|---|---|---|---|---|---|
| glyph | 100 | 1 | left | end | — | — |
| uuid | 90 | 7 | left | end | — | — |
| family | 85 | 16 | left | end | yes | — |
| detail | 70 | 8 | left | end | — | — |
| progress | 65 | 12 | left | end | — | — |
| metric | 60 | 6 | **right** | end | — | — |
| spark | 55 | 8 | left | end | — | — |
| age | 50 | 4 | **right** | end | — | — |

**`metric` and `spark` are two columns, and this is the third surface to learn it.** The figure drew `0.0372 ▁▂▃▅▆` in one cell, as S01 §2 and S03 §2 both did before being corrected: a cell holds one value, because C11 truncates a cell at its planned width and a number-plus-series either loses digits or becomes a shorter series that still reads as real. `spark` sits below `metric` in priority, so the decoration drops before the number does.

The series was also not producible. A sparkline normalises within its window's `[min, max]` (A01 A.2), so the maximum sample is always the top glyph — and `▁▂▃▅▆` has no `█`. It drew five samples besides, where the window is eight. The figure now shows the real output for the last eight epochs of a run at 17 of 40, falling from 0.144 to the `0.0372` in the cell beside it: `█▆▅▄▃▂▂▁`, one glyph per sample, eight cells (C12 §2).

---

## 3. Panels and cadence

Each panel declares an interval; **C23 §3b drives them** on C22's injected clock and applies each result as a patch. This surface reads no time and holds no timers.

| Panel | Refresh | Source | Why that cadence |
|---|---|---|---|
| Cluster | 30 s | Node and pod counts | Slow-changing; polling faster costs more than it shows |
| Activity | 30 s | Aggregations over the last hour | An hourly window does not move in ten seconds |
| Running | 5 s | Active runs | The one people watch |
| Deployed | 10 s | Deployment health | Health changes matter but not second-to-second |
| Events | 5 s | Recent cluster events | Paired with Running, so both tick together |

**Cadences are staggered, not synchronised** (C23 I20). Five queries firing at the same instant every thirty seconds produces a periodic load spike and a visible whole-screen flicker; C23 assigns distinct offsets so no two fire in one tick.

A panel whose data is older than twice its interval shows `· 14s ago` in its title. Silent staleness is the failure this prevents — a frozen dashboard looks identical to a quiet cluster.

---

## 4. Failure isolation

**A panel that fails renders its own failure and nothing else changes** — A02 §7's failure-isolation pattern, with the panel as the part.

```
│ ┌ activity · unavailable ────────────────────────────┐
│ │ prometheus unreachable                             │
│ │ retrying in 12s                                    │
│ └────────────────────────────────────────────────────┘
```

This is the property that makes the dashboard usable in the situation where it matters most. Prometheus being down does not stop you seeing which runs are active, and a whole-screen error would hide four working panels behind one broken query.

Backoff is the one rule from A02 §7 — double from the panel's interval, cap at five minutes, reset on success, countdown shown — implemented by C23 (I21). This surface renders its state and owns none of it.

---

## 5. Navigation

| Key | Effect |
|---|---|
| `tab` `shift-tab` | Next · previous panel |
| `↑` `↓` | Move within the focused panel's rows |
| `⏎` | Drill in — pops the view and appends the relevant command |
| `r` | Refresh the focused panel now |
| `R` | Refresh all |
| `esc` | Pop the view |
| `1`–`5` | Jump to a panel by position |

**Drilling in pops the dashboard rather than layering over it.** Views do not nest (C15 I1), and the transcript is where the detail belongs — so `⏎` on a run row leaves the dashboard, appends `/ps a3f9b21`, and the trace records where you came from. Returning is `↑ ⏎` on `/dashboard`, which is one keystroke more than a back key and avoids a view stack nobody asked for.

| Panel | `⏎` appends |
|---|---|
| Running | `/ps <uuid>` |
| Deployed | `/serving <name>` |
| Events | The command for the referenced entity |
| Cluster · Activity | Nothing — no rows to drill into |

---

## 6. Layout at width

The panel grid is the first thing that has to give.

| Width | Layout |
|---|---|
| ≥ 120 | Two-up top row, full-width below — as shown |
| 100–119 | Same, Deployed drops to one column |
| 80–99 | **Single column**, all five stacked, Activity's bars shortened |
| < 80 | Cluster, Running and Events only, with a notice naming what was dropped |
| < 60 | S01's fallback |

**Below 80 whole panels drop rather than every panel shrinking.** Five cramped panels convey less than three readable ones, and Activity and Deployed are the two whose absence is least costly — one is a trend, the other has its own verb.

The dropped-panel notice matters: an unexplained absence reads as a bug.

**`--once` renders at the terminal's current width, prints to stdout and exits** — no alternate screen, no refresh, no keys. It is declared `oneShot: true` in the manifest, which is what lets it bypass C22's TTY gate (C22 §4); piping is the entire point, and refusing it for not being a TTY would refuse the use case. It is for piping to a file or pasting into a status report, and the flag exists because the alternative is a screenshot.

---

## 7. States

| State | Render |
|---|---|
| **Loading** | All five panels with muted placeholders; keys already respond |
| **Live** | §2 |
| **Partially degraded** | §4 for the failing panels, normal for the rest |
| **Fully offline** | All five in failure state, with one notice in the title bar rather than five identical ones |
| **Empty cluster** | Panels render with zeroes and `no active runs`, not as failures |
| **Stale** | Per-panel age in the title once past twice its interval |
| **Narrow** | §6 |
| **`--once`** | One frame to stdout, exit 0 |

**An empty cluster is not a failure.** Zero running runs and zero deployments is a normal state on a Monday morning, and rendering it as an error trains people to ignore the failure styling.

---

## 8. Commitments

1. A pushed view, because it needs Tab and letter keys.
2. Five panels as a `group` of `panel` blocks — no bespoke renderer.
3. Each panel declares an interval; C23 drives and staggers them. This surface holds no timers.
4. A panel older than twice its interval shows its age; silent staleness is prevented.
5. A failing panel renders its own failure; the other four are unaffected.
6. Retry is exponential from the panel's interval, capped at five minutes, with a visible countdown.
7. `⏎` pops the view and appends a command rather than layering a second view.
8. Below 80 columns whole panels drop, with a notice naming which.
9. An empty cluster renders zeroes, not failures.
10. Fully offline shows one notice, not five identical panel errors.
11. `--once` is manifest-declared `oneShot`, bypasses the TTY gate, prints one frame and exits with no alternate screen.
12. The dashboard reads correctly at 120 on a projector and degrades honestly below, with no special case for either.

---

## 9. Tests

### Tier 1 — unit

- **T1.1**: the view adapts to a `group` of five `panel` blocks plus title and keymap.
- **T1.2**: each panel's declared interval matches §3; a spy proves this surface schedules nothing itself and C23 assigns the offsets.
- **T1.3**: a panel past twice its interval renders its age; one within does not.
- **T1.4**: one failing panel → four render normally.
- **T1.5**: retry backoff doubles from the panel interval and caps at 300 s.
- **T1.6**: `⏎` on each panel type appends the documented command; Cluster and Activity are no-ops.
- **T1.7**: at 79 columns → two panels dropped plus the naming notice.
- **T1.8**: an empty cluster → zeroes and `no active runs`, no error tone.
- **T1.9**: all five failing → one title-bar notice, not five panel errors.
- **T1.10**: `--once` produces one document with no keymap block.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: measured height equals rendered height at four widths in all four layouts.
- **T2.3**: every drill-in command re-parses through C18 to the intended `ParseResult`.
- **T2.4**: no panel renders through anything but the block registry — a spy proves no bespoke drawing.
- **T2.5**: every key in §5 is bound once; no key is bound twice.

### Tier 3 — edge cases

- **T3.1**: zero running runs → the panel renders `no active runs`, not an empty box.
- **T3.2**: fifty running runs → the panel truncates to what fits and adds `and 43 more`, which drills into `/ps --status=running`.
- **T3.3**: a deployment name of 60 characters → truncated within its cell; the grid does not reflow.
- **T3.4**: a panel that fails, recovers, fails again → backoff resets on success.
- **T3.5**: a panel that never succeeds → backoff caps at 5 min and stays there.
- **T3.6**: `r` on a failing panel → immediate retry, backoff reset.
- **T3.7**: resize from 120 to 79 to 120 → layout switches both ways, focus preserved.
- **T3.8**: resize below 60 and back → S01's fallback, then the dashboard returns with focus intact.
- **T3.9**: `⏎` with no row focused → no-op, no empty command appended.
- **T3.10**: `--once` in a non-TTY → still works, via the manifest's `oneShot` flag (C22 T3.5b).
- **T3.11**: `--once` at 200 columns → renders at 200, not clamped to a default.
- **T3.12**: an event referencing an entity that no longer exists → the row renders, `⏎` reports it is gone rather than appending a broken command.
- **T3.13**: all five panels refreshing in the same second by coincidence → the stagger is by offset, so this cannot occur; asserted.

### Tier 4 — integration

- **T4.1** (with C15): the view fills the viewport region exactly; header and footer untouched.
- **T4.2** (with C15): a confirm raised over the dashboard draws above it and `esc` is a no-op on it (C15 T5.3).
- **T4.3** (with C16): Tab and letter keys route to `pushedView`; copy mode still outranks it (C16 §3).
- **T4.4** (with C23): `⏎` pops and appends; the trace names the panel it came from.
- **T4.5** (with C03): five staggered cadences produce coalesced frames, not five per interval.
- **T4.6** (with C12): sparklines in the Running panel contribute no rows.
- **T4.7** (with C10, C02): the grid renders in both themes and under ASCII with unchanged geometry.

### Tier 5 — e2e

- **T5.1**: golden frames at 60 / 80 / 100 / 120 / 160 — five layouts.
- **T5.2**: golden frames for the eight §7 states.
- **T5.3**: a real five-minute session → panels tick at their cadences, no whole-screen flicker, flat memory.
- **T5.4**: Prometheus killed mid-session → Activity degrades alone, recovers when restored.
- **T5.5**: drill into a run, return with `↑ ⏎` → both entries in the transcript.
- **T5.6**: `/dashboard --once > out.txt` → a readable frame in the file, exit 0, no escape sequences.

### Tier 6 — fail-on-revert

- **T6.1** (C5): a whole-screen error on one panel failure → T1.4 fails, and one dead query hides four working ones.
- **T6.2** (C3): synchronising the cadences → T1.2 fails, and the screen flickers wholesale every thirty seconds.
- **T6.3** (C4): dropping the staleness age → T1.3 fails, and a frozen dashboard looks like a quiet cluster.
- **T6.4** (C7): layering the drill-in over the dashboard → C15 I1 is violated and views begin to nest.
- **T6.5** (C8): shrinking all five panels below 80 → T1.7 fails, and five cramped panels replace three readable ones.
- **T6.6** (C9): rendering an empty cluster as a failure → T1.8 fails, and failure styling stops meaning anything.
- **T6.7** (C2): drawing panels outside the block registry → T2.4 fails, and the dashboard stops being themed or ASCII-safe.
- **T6.8** (C11): giving `--once` an alternate screen → T3.10 fails and piping it produces escape sequences.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Any detail view | S03, S04, S05 |
| Log tailing | S12 |
| Panel data semantics | The far side |
| Panel layout customisation | Phase 2 |
| Multi-cluster | Phase 2 |
| The transcript trace on pop | C23 |
