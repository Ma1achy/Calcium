# S12 — Logs view

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | **Pushed view** — the prompt goes away, every key is a binding |
| **Package** | `prism-tui` |
| **Covers** | `/ps <uuid> --logs` · `/serving <name> --logs` |
| **Data source** | Streaming NDJSON → `adaptLogs` (C07 §6) |
| **Source** | `j20` §`--logs` · `j21` · scratchpad 2 §4 · A01 D4, D7 |
| **Status** | Draft |

---

## 1. Purpose

One of two pushed views, and it earns that status by the test in A01 D4: it needs **single-letter keybindings**. `l` cycles level, `g` and `G` seek, `/` opens a filter. A prompt cannot coexist with those, so the prompt goes.

It is where people spend the minutes after something fails, which sets the priority order: never lose a line, never lag the keyboard, and never make the user guess whether it is still connected.

---

## 2. The screen

```
┌ logs · a3f9b21 · gpu-04.fmx.internal ─────────────────────── ● following ─┐
│ 14:23:01.882  INFO   [trainer] epoch 17 started                           │
│ 14:23:02.104  INFO   [dataloader] batch 41/256 loaded (148 samples)       │
│ 14:23:02.339  DEBUG  [memory] gpu_mem=52GiB/80GiB host_mem=91GiB          │
│ 14:23:02.551  WARN   [dataloader] slow batch (87ms · 95p)                 │
│ 14:23:02.774  INFO   [trainer] step 2417 · loss=0.0372 · lr=3e-4          │
│                                                                            │
│ ─────────────────────────────────────────────────────────────────────────  │
│ filter —    level ≥ DEBUG    1,284 lines    2 warnings                     │
└ esc back · / filter · l level · ⌃s pause · g top · G bottom · ⏎ follow ───┘
```

Three regions: a title bar carrying the source and connection state, the lines, and a two-row footer — a status line and a keymap line.

**The status line answers "am I seeing everything?"** Active filter, level threshold, total lines received, and a warning count. A filtered view that looks empty is indistinguishable from a quiet process unless the filter is stated.

---

## 3. Scrolling is arithmetic, not virtualisation

**Log lines never wrap** (C09 §3) — they truncate at the viewport width. Every line is therefore exactly one row, and the visible range is `buffer[top … top + height]`.

That means S12 needs no Fenwick tree, no height cache, and no C14. Fixed-height items make scroll position a subtraction. It is worth naming because the obvious instinct is to reuse the transcript viewport, and doing so would mean pushing log lines into C13's transcript store, where they are not entries and do not belong.

The buffer holds **50,000 lines**, FIFO. A dropped-lines counter appears in the status line once eviction begins, so a long tail never silently loses its beginning.

---

## 4. Following, paused, detached

Three states, and the distinction between the last two matters.

| State | Receiving | Rendering | Title |
|---|---|---|---|
| `following` | yes | yes, pinned to the tail | `● following` |
| `detached` | yes | yes, pinned to a line | `▲ detached · 340 new` |
| `paused` | **yes** | no | `⏸ paused · 1,204 buffered` |

**Paused still receives.** Pausing is about reading, not about stopping the stream — and a pause that dropped lines would make the feature actively harmful, because the reason to pause is that something interesting just went past.

Scrolling up detaches; `⏎` or `G` re-follows. The detached title carries the count of lines arrived since, so the cost of staying put is visible.

---

## 5. Filtering

`/` opens a filter prompt inside the view. Filtering is **client-side over the buffer**, so changing it re-filters instantly and does not re-fetch.

| Control | Effect |
|---|---|
| `/` then text | Substring match, case-insensitive, over the message |
| `/` then `⏎` on empty | Clears the filter |
| `l` | Cycles the level threshold: DEBUG → INFO → WARN → ERROR → DEBUG |

Level is a **threshold, not a set**: `≥ WARN` shows warnings and errors. Multi-select would need a UI nobody wants for a four-value enum.

Filtered-out lines stay in the buffer. Loosening the filter reveals them; it does not go back to the far side.

**A filter that matches nothing shows why:**

```
│ no lines match "dataloadr"                                                 │
│ 1,284 lines received · 0 shown · press / to edit                           │
```

The received count is the point — it distinguishes a bad filter from a silent process.

---

## 6. Multi-pod

`/serving <name> --logs` aggregates every pod. Lines carry a pod column:

```
│ k2p1  14:23:01.882  INFO   [server] request r-8f2a · 12ms                  │
│ m4x7  14:23:01.904  INFO   [server] request r-3c91 · 9ms                   │
│ q9z3  14:23:02.011  ERROR  [server] readiness probe failed                 │
```

The pod suffix only, not the full name — the prefix is the deployment name in the title. Ordering is by timestamp across pods, and **out-of-order arrivals are inserted, not appended**: pods are independent writers and a strictly-appending view would show them interleaved wrongly.

A pod-specific view is `f` — filter by pod — rather than a separate flag.

---

## 7. States

| State | Render |
|---|---|
| **Connecting** | Title `◐ connecting`, empty body, no error until the transport times out |
| **Following** | §2 |
| **Detached** | §4 |
| **Paused** | §4 |
| **Filtered empty** | §5 |
| **Empty** | `no output yet` — a process that has produced nothing is normal at startup |
| **Stream ended** | Title `✓ ended`; the buffer stays readable and keys still work |
| **Stream died** | Title `✗ disconnected`, a notice with the reason, buffer retained, and `r` to reconnect. **Never reconnects silently** (A02 §7 rule 3) — the lines missed in between would go unmentioned |
| **Too small** | Below 60 × 16, S01's fallback replaces the frame; the view is retained and returns on resize |

**A dead stream keeps its buffer.** The lines already received are usually why you were watching, and dropping them because the connection dropped would be the worst possible moment to lose them.

---

## 8. Keymap

**Line focus exists only when detached.** Following has no cursor — there is nothing stable to point at while lines arrive. `↑`/`↓` establish a cursor and detach in one motion, which is what you were doing anyway; `⏎` or `G` re-follows and dismisses it. While following, `w` and `y` act on the **last line**, which is the one you were looking at.

| Key | Effect |
|---|---|
| `esc` | Pop the view |
| `↑` `↓` | One line |
| `PgUp` `PgDn` | One screen |
| `g` `G` | Top · bottom, and re-follow |
| `⏎` | Re-follow |
| `/` | Filter |
| `l` | Cycle level threshold |
| `f` | **Cycle** pod filter: all → first → … → last → all. Multi-pod only |
| `⌃s` | Pause · resume |
| `r` | Reconnect, after a dropped stream |
| `w` | Toggle wrap for the focused line |
| `y` | Yank the focused line |

`f` cycles rather than prompting, for the same reason `l` does: a handful of pods is a small enum, and a prompt for a four-value choice is friction with no payoff.

`w` exists because one line occasionally does need reading whole — a stack frame, a long URL — and toggling it for one line is cheaper than wrapping the whole view and losing fixed-height scrolling.

`esc` pops and nothing is appended (A01 D7, amended). An earlier draft had C23 write a one-line trace here — `logs a3f9b21 — 1,284 lines, 2 warnings (esc 14:24:08)` — and it could not be built: the trace is an entry, an entry freezes its predecessor, and the frozen block is the one D7 returns focus to. The excursion therefore leaves no transcript record, which is consistent with the push having left none either (B03 §3), and is the acknowledged cost of that amendment rather than a property this surface wanted.

---

## 9. Commitments

1. A pushed view, because it needs letter keys; the prompt goes away.
2. Lines never wrap, so scrolling is arithmetic and no viewport machinery is reused.
3. The buffer holds 50,000 lines FIFO, and eviction is counted in the status line.
4. Paused keeps receiving; only rendering stops.
5. Detached shows the count of lines arrived since detaching.
6. Filtering is client-side over the buffer and never re-fetches.
7. Level is a threshold, not a set.
8. A filter matching nothing states the received count, so a bad filter is distinguishable from a quiet process.
9. Multi-pod lines are inserted by timestamp, not appended.
10. A dead or ended stream retains its buffer and its keys, and offers `r` rather than reconnecting silently.
11. `w` wraps one line rather than the view; line focus exists only when detached, and defaults to the last line while following.
12. `esc` pops and appends nothing; the block beneath stays live with its selection (A01 D7).

---

## 10. Tests

### Tier 1 — unit

- **T1.1**: the view adapts to title, lines, status, keymap.
- **T1.2**: visible range is `buffer[top … top+height]` — no measurement call is made.
- **T1.3**: each of the three follow states renders its documented title.
- **T1.4**: pausing continues to buffer; the count rises while nothing renders.
- **T1.5**: detaching shows a since-count that increments.
- **T1.6**: filtering re-filters from the buffer with no transport call.
- **T1.7**: `l` cycles four thresholds and wraps.
- **T1.8**: a zero-match filter renders the received count.
- **T1.9**: out-of-order pod lines are inserted by timestamp, not appended.
- **T1.10**: eviction past 50,000 increments the dropped counter.
- **T1.11**: `w` wraps one line; the rest stay one row each.
- **T1.12**: `↑` while following → detaches and places a cursor; `G` → re-follows and clears it.
- **T1.13**: `w` and `y` while following act on the last line; while detached, on the cursor.
- **T1.14**: `f` cycles all → pod → pod → all across three pods, and is a no-op with one pod.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: rendered rows equal `min(height, filtered lines)` at seven widths.
- **T2.3**: a spy proves C14 is never called — this view owns its own scroll.
- **T2.4**: every key in §8 has a binding, and no key is bound twice.
- **T2.5**: a spy proves `esc` reaches no transcript mutator — S12 writes nothing and causes no append.

### Tier 3 — edge cases

- **T3.1**: zero lines → `no output yet`, keys still respond.
- **T3.2**: one line → renders; `g` and `G` are no-ops.
- **T3.3**: 50,001 lines → 50,000 retained, one dropped, counter reads 1.
- **T3.4**: a 4,000-character line → truncated to width; `w` reveals it wrapped.
- **T3.5**: a line containing ANSI escapes → stripped (C09 I12).
- **T3.6**: a line containing a null byte → stripped, line retained.
- **T3.7**: filtering while paused → applies to the buffer; rendering stays paused.
- **T3.8**: resuming after a pause with 5,000 buffered lines → renders at the tail without stalling.
- **T3.9**: the stream dies mid-tail → buffer retained, title `disconnected`, keys work, no automatic reconnection attempted.
- **T3.9b**: `r` after a drop → reconnects; lines missed during the gap are not silently backfilled.
- **T3.10**: the stream ends cleanly → title `ended`, no error styling.
- **T3.11**: two pods writing simultaneously with clock skew → ordering by timestamp, no duplication.
- **T3.12**: a pod producing no output → absent from the view, not shown as an empty group.
- **T3.13**: resize below minimum and back → the view is retained, scroll position preserved.
- **T3.14**: `esc` immediately after opening, before any line arrives → the view pops cleanly and the transcript is unchanged.

### Tier 4 — integration

- **T4.1** (with C15): the view occupies exactly the viewport region; header and footer untouched (C15 T4.4).
- **T4.2** (with C16): every key routes to `pushedView`; a confirm raised over it still wins (C16 §3).
- **T4.3** (with C06): a 1,000 line/s stream is coalesced by C03, not by this surface.
- **T4.4** (with C03): keystrokes remain immediate while the stream runs — the starvation property (C03 T4.6).
- **T4.5** (with C23): `esc` pops and C23 appends nothing; the transcript's entry count and live id are identical before and after, so the block beneath is still live (A01 D7).
- **T4.6** (with C09, C02): under ASCII the box drawing degrades 1:1; the row count is unchanged.

### Tier 5 — e2e

- **T5.1**: golden frames at 60 / 80 / 100 / 160 for all nine §7 states.
- **T5.2**: a real 1,000 line/s tail for sixty seconds → no dropped lines below the cap, no keyboard lag, flat memory.
- **T5.3**: pause, read, resume → nothing lost.
- **T5.4**: scroll up during a live tail → the view does not move; the since-count rises; `G` returns.
- **T5.5**: a multi-pod serving tail → interleaved correctly by timestamp.
- **T5.6**: kill the stream externally → buffer retained, disconnected title, `esc` still works.

### Tier 6 — fail-on-revert

- **T6.1** (C2): wrapping lines by default → T1.2 fails, and scroll becomes a virtualisation problem.
- **T6.2** (C4): pausing the stream rather than the render → T1.4 fails, and pausing loses the thing you paused to read.
- **T6.3** (C6): re-fetching on filter change → T1.6 fails, and filtering becomes slow and lossy.
- **T6.4** (C8): a bare "no matches" → T1.8 fails, and a bad filter reads as a dead process.
- **T6.5** (C9): appending pod lines in arrival order → T1.9 fails, and interleaving is wrong under skew.
- **T6.6** (C10): clearing the buffer on disconnect → T3.9 fails at the worst possible moment.
- **T6.7** (C3): an uncapped buffer → T3.3 fails and memory grows without bound.
- **T6.8** (C2): reusing C14 → T2.3 fails, and log lines end up in the transcript store.
- **T6.9** (C11): keeping a line cursor while following → T1.12 fails, and the cursor drifts as lines arrive.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| The run or deployment being tailed | S04, S05 |
| `--events` | A live block, not a view — S04's actions reach it |
| Log storage and retention | The far side |
| Stream transport and coalescing | C06, C03 |
| Whether a pop records anything in the transcript | C23 — and under A01 D7 it does not |
| Server-side log search | Phase 2 — filtering here is client-side by design |
