# S02 — The welcome

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Transcript — the session's first entry |
| **Package** | `prism-tui` (content) on `tui-kit` (blocks) |
| **Data source** | Static · C22 `SessionSnapshot` · `whoami` · GitLab MR query · `ps --mine` |
| **Source** | `t01` §What the dev sees before typing · A01 D24a · C22 §4 step 7 |
| **Status** | Draft |

---

## 1. Purpose

The welcome is what makes opening the tool worth doing before you have typed anything. Its only load-bearing section is **Outstanding** — an open promote MR nobody has reviewed is the single most common thing to lose track of, and surfacing it costs nothing.

**It is an ordinary `ViewDocument`, not a screen.** It is appended to the transcript like any command's output (`t01`), which means `/clear` removes it, it scrolls away as the session fills, and its action buttons work through C23's normal `fill` path. There is no banner renderer.

It is also the only surface whose data arrives **asynchronously and per section**. That pattern appears nowhere else, which is why it is worth pinning precisely.

---

## 2. The screen

At 100 columns, fully resolved:

```
          █         ███████████  ███████████   █████  █████████  ██████   ██████
         █ █       ▒▒███▒▒▒▒▒███▒▒███▒▒▒▒▒███ ▒▒███  ███▒▒▒▒▒███▒▒██████ ██████ 
        █   █       ▒███    ▒███ ▒███    ▒███  ▒███ ▒███    ▒▒▒  ▒███▒█████▒███ 
       █     █      ▒██████████  ▒██████████   ▒███ ▒▒█████████  ▒███▒▒███ ▒███ 
      █       █     ▒███▒▒▒▒▒▒   ▒███▒▒▒▒▒███  ▒███  ▒▒▒▒▒▒▒▒███ ▒███ ▒▒▒  ▒███ 
     █         █    ▒███         ▒███    ▒███  ▒███  ███    ▒███ ▒███      ▒███ 
    █           █   █████        █████   █████ █████▒▒█████████  █████     █████
   ███████████████ ▒▒▒▒▒        ▒▒▒▒▒   ▒▒▒▒▒ ▒▒▒▒▒  ▒▒▒▒▒▒▒▒▒  ▒▒▒▒▒     ▒▒▒▒▒ 

   v1.0.0

   Connected to prism.fmx.io as malachy.doherty@fmx.io
   Teams        vision · ml-platform-readonly
   Token        expires in 30d

   ── Outstanding ─────────────────────────────────────────────────────────────
   1 promote MR awaiting review    digit-classifier v_b4f0c12
   2 running experiments

   ── Recent ──────────────────────────────────────────────────────────────────
   digit-classifier-v_b4f0c12    succeeded    2h ago
   digit-classifier-test-r12     failed       3h ago

   Type /help for commands · ? for context help
```

### Columns

Both tables are headerless — a list with per-row actions, which is what
`showHeader: false` is for. Neither is sortable: a welcome screen is a snapshot
and there is nothing to sort by.

**Outstanding**

| Column | Priority | Min | Align | Flex | Sortable |
|---|---|---|---|---|---|
| what | 95 | 20 | left | yes | — |
| detail | 50 | 16 | left | — | — |

**Recent**

| Column | Priority | Min | Align | Trunc | Flex | Sortable |
|---|---|---|---|---|---|---|
| name | 95 | 20 | left | **start** | yes | — |
| status | 85 | 9 | left | — | — | — |
| age | 60 | 6 | **right** | — | — | — |

Three of the four numbers come from a precedent rather than a preference.
**`status` never truncates**, so its minimum is its longest value — `succeeded`
at 9 — because a half-word reads as a different word (S03 §3). **`name`
truncates from the start**, since `digit-classifier-v_b4f0c12` is hierarchical
and the suffix is what distinguishes it from `digit-classifier-test-r12`; that
is what `truncateFrom` landed for and this surface is now a consumer. **`age`
right-aligns**, per S03 §3's convention.

### There is no `action` column, and the figure used to draw one

An earlier figure drew `↗ open` and `≡ ps` at the right of each row. **C11 does
not render row actions inline** — focus changes the tone and nothing else, no
marker, no extra row, no width — and no surface declares an `action` column.
Every other surface draws its action labels as a single bar for the focused row
at the bottom of the table, and §7 below already declares S02's as row actions
of exactly that kind. Two records of one fact, and the figure was the wrong one.

**The bar itself is a separate piece of work**, because `TableRow.actions` is
read by nothing: the field exists, C11 §Focus says it "surfaces its actions",
and no code does. Every surface drawing that bar has been drawing something
nothing produces. This figure gains one when they all do, and the composition
test is what forces the figure and the height to move together — so the count
below will change on that commit rather than drifting.

**The ranking argument survived losing its column.** `action` outranked `detail`
because a row that says something is pending and offers no way to reach it is
worse than one missing its description. That is an argument about where the
action bar sits, and it keeps.

### The art

**77 cells × 8 rows**, verbatim from the mockup and stored as a fixture (A01 Appendix A.1). Three glyphs only — `█` (U+2588), `▒` (U+2592), space — all single-width, so it measures identically in every locale.

| Columns | Content | Colour |
|---|---|---|
| 1–15 | Prism triangle | `spectrum.outline`, all eight rows |
| 16 | Separator | unstyled |
| 17–77 | `PRISM` wordmark, 61 cells | `spectrum[n]` where `n` is the row index, 0–7 |

The wordmark's eight rows take the spectrum top to bottom — red, orange, yellow, lime, green, cyan, blue, violet — which is the refraction the triangle beside it implies. **That is the whole meaning of the colour: it is decorative and carries no information**, which is why `spectrum` is exempt from C10's contrast floors and why the logo losing its colour at 1-bit costs nothing.

Each row is exactly two coloured spans, never per-glyph colouring.

Blocks, in order: `raw` (logo), `notice` (version), `keyValue` (connection), `rule` + headerless `table` (outstanding), `rule` + headerless `table` (recent), `tip`. Every block after the logo carries `gapBefore`, which is where the six blank rows come from (HEIGHT_AUDIT §1) — eight, one, three, one, two, one, two, one, plus six joins is the twenty-four the figure draws.

**The version was drawn and unlisted**, and this list had five entries against six visual groups. It is the height audit's second verdict class — a figure encoding intent the declaration does not carry — and the fix is the declaration rather than the picture: `v1.0.0` is on the screen, it is one row, and no block claimed it. Found by trying to compose the figure, which is what the composition test is for.

Outstanding and Recent are `table` blocks with `showHeader: false` — a headerless list with per-row actions, which is exactly the shape needed and required no new block kind.

---

## 3. Fields

| Section | Source | Failure |
|---|---|---|
| Logo | Static | Cannot fail |
| Version | `session.version` | Cannot fail |
| Connection | `session.cluster` + `whoami` | Line reads `identity unavailable`; header shows `offline` |
| Teams | `whoami` groups | Line omitted |
| Token | `identity.expiresAt` | Line omitted |
| Outstanding — MRs | GitLab MR query | Row reads `GitLab unreachable` in muted tone |
| Outstanding — runs | `ps --mine --status=running --json` | Row omitted |
| Recent | `ps --mine --since=24h --limit=3 --json` | **Whole section omitted** |
| Help hint | Static | Cannot fail |

Each section is a **part** in A02 §7's sense: it fails alone, renders its own failure in place, and retries on the banner's five-minute cadence. **Outstanding degrades per row; Recent degrades whole.** Outstanding's two halves answer different questions from different systems, and losing one should not hide the other. Recent is a single list — a partial one is misleading, because "your last three runs" that silently shows one is worse than showing none.

### Token thresholds

| Remaining | Render |
|---|---|
| > 7 days | `expires in 30d`, default tone |
| ≤ 7 days | `expires in 4d`, warn tone |
| ≤ 1 day | `expires in 14h`, error tone |
| Expired | `expired 6m ago`, error tone, with a `↺ login` action |

These match C22 §7's header states, so the header and the banner never disagree about the same fact.

---

## 4. Fetching

**Static sections render immediately; each fetch lands independently.**

```
1  append the document with static sections and per-section placeholders
2  fire every fetch in parallel, none awaited
3  as each resolves, patch its section in place (ViewPatch replace)
4  at 3 s, any unresolved section renders its failure form
```

The banner therefore completes visibly over the first second or so. That is preferable to a blank screen while a slow GitLab query resolves, and **input is accepted before any of it finishes** (C22 §4 step 8) — a dev can type over a half-drawn banner.

Placeholders are not spinners. A spinner per section makes an opening screen look like it is struggling; the section simply occupies its rows in muted tone until it has content.

**Refresh.** Each section is a `b.live` part (C24 §5) driven by C23 §3b, and **patches the same entry in place** rather than appending a new banner. This resolves `t01`'s open question — a two-hour session should not accumulate banners, and `ViewPatch.replace` already does exactly this.

---

## 5. States

| State | Trigger | Render |
|---|---|---|
| **Loading** | Fetches in flight | Static sections plus muted placeholders; prompt usable |
| **Complete** | All resolved | §2 |
| **Degraded** | Any fetch failed | Per §3 — that section only |
| **Offline** | Cluster unreachable | Connection line degraded, Outstanding runs and Recent omitted, MR row still attempted |
| **Narrow** | 60–79 cols | §6 |
| **Suppressed** | `--no-banner` or `ui.show_banner = false` | No entry at all; the session opens at an empty viewport |

---

## 6. Narrow widths

**The art is 77 cells wide and needs 80 columns with its indent** — well above the 60-column minimum. Two forms:

| Width | Logo |
|---|---|
| ≥ 80 | The full 8-row art, version on its own line beneath |
| < 80 | `▲ prism v1.0.0` on one row |

There is no intermediate form. A scaled-down or cropped version of a figlet wordmark reads as a rendering fault rather than as a smaller logo.

Below 80 the section rules also shorten and the action column moves under its row rather than to the right. Recent's `age` column drops first, then `status` — the family name is what identifies the row.

Under `unicode: "ascii"` the art substitutes `#` for `█` and `:` for `▒`, both 1:1 by cell count (C09 §4), so it keeps its geometry exactly.

---

## 7. Interactions

Every actionable row carries a `fill` action except `↗ open`, which is an `open` action scheme-checked by C23 (§3a).

| Row | Action |
|---|---|
| Outstanding — MR | `open` the MR URL |
| Outstanding — runs | `fill` `/ps --mine --status=running` |
| Recent — succeeded candidate | `fill` `/promote <id> --open-mr` |
| Recent — failed run | `fill` `/ps <id> --logs` |
| Token expired | `fill` `/login` |

`fill` rather than `exec` throughout, per A01 D8: the command lands in the prompt to be read before it runs. `/promote … --open-mr` is precisely the command that should never fire from a single keypress.

Once a newer entry is appended the welcome is frozen, and its actions are refused (C23 I18) — its data is minutes old by then, and a stale `↑ promote` is the footgun D5 exists to prevent.

---

## 8. Commitments

1. The welcome is an ordinary `ViewDocument` appended to the transcript; there is no banner renderer.
2. Static sections render immediately; every fetch is independent and unawaited.
3. Input is accepted before the banner finishes.
4. Placeholders are muted rows, not spinners.
5. Outstanding degrades per row; Recent degrades whole.
6. Any section unresolved at 3 s renders its failure form.
7. Refresh patches the same entry in place; a session never accumulates banners.
8. Token thresholds match C22 §7, so the header and banner cannot disagree.
9. The art is 76 × 8 and reproduced verbatim; below 80 columns it collapses to a one-row form with no intermediate.
10. Every action is `fill`, except the MR link which is a scheme-checked `open`.
11. Once frozen, the welcome's actions are refused like any stale entry.
12. `--no-banner` and `ui.show_banner` suppress it entirely.

---

## 9. Tests

### Tier 1 — unit

- **T1.1**: a fully resolved snapshot renders the seven blocks of §2 in order.
- **T1.2**: each token threshold renders its documented text and tone — four cases.
- **T1.3**: an expired token adds the `↺ login` action.
- **T1.4**: each `fill` action in §7 carries the exact documented command string.
- **T1.5**: the MR row carries an `open`, not a `fill`.
- **T1.6**: `showHeader: false` on both tables → no header row, and measurement is `rows` not `rows + 1`.
- **T1.7**: the logo switches form at 79 and 80 columns.
- **T1.7b**: the full form is byte-identical to the stored art fixture — 8 rows of 77 cells, three distinct glyphs.
- **T1.7c**: each row resolves to exactly two coloured spans; the triangle is `artOutline` on all eight rows and the wordmark is `spectrum[rowIndex]`.
- **T1.8**: `--no-banner` → no entry appended at all.

### Tier 2 — contract

- **T2.1**: the document passes `validateDocument` in every §5 state.
- **T2.2**: measured height equals rendered height for every state at seven widths (C09's contract, from this surface).
- **T2.3**: no section's failure form changes the document's block count — degradation replaces content, never structure.
- **T2.4**: every action's command re-parses through C18 to the intended `ParseResult`.
- **T2.5**: the ASCII art occupies the same cells as the Unicode one — 8 × 77 in both, with `#` and `:` substituted.
- **T2.6**: the eight wordmark rows resolve to the eight `spectrum` values in order; the triangle resolves to `artOutline`.

### Tier 3 — edge cases

- **T3.1**: every fetch fails → the document still renders, with the logo, connection placeholder, `GitLab unreachable`, no Recent, and the help hint.
- **T3.2**: one fetch resolves after another failed → only its own section updates.
- **T3.3**: a fetch resolving at 2.9 s → rendered; at 3.1 s → the failure form is already shown and the late result is **discarded**, not applied.
- **T3.4**: a fetch that never resolves → failure form at 3 s; no leak, no pending patch.
- **T3.5**: Outstanding with zero MRs and zero running runs → the section is omitted, not rendered empty.
- **T3.6**: Recent with one run → renders one row; with zero → section omitted.
- **T3.7**: a team list of twenty groups → truncated with a count, never wrapping the line.
- **T3.8**: an identity email longer than the width → truncated from the left, so the domain survives.
- **T3.9**: at exactly 60 columns → one-row logo, both sections readable, no overlap.
- **T3.9b**: at exactly 79 and 80 columns → one-row and full form respectively; neither overflows.
- **T3.10**: refresh while the welcome is the live entry → patched in place, no new entry, scroll position unmoved.
- **T3.11**: refresh after the welcome has been evicted (C13 §5) → the patch is a no-op, not a resurrection.
- **T3.12**: `/clear` then a refresh tick → nothing reappears.

### Tier 4 — integration

- **T4.1** (with C22): the five-minute cadence patches in place; ten refreshes produce one entry.
- **T4.2** (with C22): each health state in the header agrees with the token line at the same instant.
- **T4.3** (with C23): a `fill` action populates the prompt as one undo unit; `↗ open` reaches the injected opener and never a shell.
- **T4.4** (with C23, C13): once a command is run, the welcome is frozen and its actions are refused.
- **T4.5** (with C13, C14): appending the welcome while the viewport is at the top leaves the scroll position at the top.
- **T4.6** (with C06): all four fetches run concurrently without tripping the submission guard — they are not submissions.

### Tier 5 — e2e

- **T5.1**: golden frames for all six §5 states at 80 / 100 / 120 / 160.
- **T5.2**: a real fixture-backed session → the banner completes within a second and the prompt is usable throughout.
- **T5.3**: typing a command while the banner is still filling → the keystrokes land, the banner still completes.
- **T5.4**: a two-hour session with refreshes → exactly one welcome entry.
- **T5.5**: launched offline → banner renders degraded; a system command still runs.

### Tier 6 — fail-on-revert

- **T6.1** (C1): special-casing the welcome outside the transcript → T4.4 and T3.12 fail; `/clear` stops working on it.
- **T6.2** (C2): awaiting fetches before rendering → T5.3 fails and the prompt blocks on GitLab.
- **T6.3** (C5): degrading Recent per row → T3.6 fails, and a partial list reads as a complete one.
- **T6.4** (C6): no fetch timeout → T3.4 leaks a pending section forever.
- **T6.5** (C7): appending on refresh → T5.4 fails and the session fills with banners.
- **T6.6** (C8): a threshold divergence between header and banner → T4.2 fails.
- **T6.7** (C9): keeping the full art below 80 → T3.9b fails and the banner overflows.
- **T6.10** (C9): altering a cell of the art → T1.7b fails against the fixture.
- **T6.8** (C10): making `↑ promote` an `exec` → T1.4's action-kind assertion fails, and a keypress promotes.
- **T6.9** (T3.3): applying a late fetch after the failure form → the section flickers between states.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| The frame around it | S01 |
| Where the fetch data comes from | The far side; C08 in fixtures |
| Identity refresh cadence and health | C22 §7 |
| Action dispatch | C23 §3a |
| First-run config init | C22 §4 gate 2 |
