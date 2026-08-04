# The landing dashboard — the walk, before the render

Written before a line of dashboard code, against **captured output**
(`test/corpus/stats-real.ndjson`, five containers; `test/corpus/ps-all-real.ndjson`,
eleven) rather than against S1's drawing. F10 and F11 are why: the drawing assumed stats
streams NDJSON and shows `CPU 34%` as a utilisation, and neither is a thing docker can do.

**Two artefacts, and that is the decision rather than a consequence.** CLAUDE.md's rule
after C19: a sequence trace finds *event-mediated* interactions, a classification table
finds *structural* ones, and taking the trace alone because a live block is obviously a
state machine is how the structural half goes unexamined. The dashboard has both kinds:

- **§A, a classification table** — the value shapes, the two sources, the panel's
  composition. Two rules that both hold at rest.
- **§B, a sequence trace** — tick, resolve, reject, submit, teardown. Two rules that meet
  because something happened in between. This is the first artefact in the app that needs
  one; `/ps` had no events at all.
- **§C, the nesting boundaries** — new, and it exists because of the step-1 defect that
  neither of the other two shapes could have found.

Measured from the corpora:

| field | shape | extremes |
|---|---|---|
| `CPUPerc` | `"0.00%"` … `"1.24%"` | a string with a unit; unbounded above (per-core) |
| `MemPerc` | `"0.12%"` … `"1.03%"` | a fraction of host memory; bounded, and summable |
| `MemUsage` | `"9.34MiB / 7.75GiB"` | **two values in one string**, units unequal |
| `NetIO` | `"1.17kB / 126B"` | likewise |
| `BlockIO` | `"0B / 12.3kB"` | likewise |
| `PIDs` | `"12"` | a number as a string |
| `Name` | `dtui-web` … `reverent_proskuriakova` | 8–22 |
| scope | 5 of 11 containers | running **and paused**; the other 6 are `ps -a`'s |

---

## A. The classification table

Every row is a cell where **two correct statements overlap**. A row governed by one rule
restates that rule and finds nothing.

**A1. `stats` scope meets the panel's heading.**
`docker stats --no-stream` returns what `docker ps` returns, which includes **paused**
containers. The panel is headed `RUNNING (n)`. So a paused container is inside a box that
says it is running, and the count in the header is wrong about what it counts.
**Ruling:** the panel's membership is *not-stopped*, and the paused row carries `pending`
tone and glyph exactly as `/ps` gives it (F6's ruling, reused rather than re-decided). The
counts are stated **separately** — `4 running · 1 paused` — because one number over a mixed
set is the kind of summary that is never wrong enough to notice.
This row exists because the first probe ran on a machine with nothing paused. See F10.

**And it indicts `/ps`, which shipped in step 1.** The same question — *what counts as
running* — was answered there as `running` against `everything else`, so a real frame read
`4 running · 1 stopped` three lines under a row saying `◌ Up 11 minutes (Paused)`. Nothing
in step 1 could have caught it: there was no paused container to look at, and every test
agreed with the code. A two-way split over three states is the shape.

**A2. Two sources meet one panel.**
`stats` has no stopped containers; `ps -a` has all eleven and no CPU. The panel needs both.
**Ruling:** two calls, joined on `ID`. `ps -a` is authoritative for **membership and
state** — it is the one that knows a container exists at all — and `stats` contributes
**measurements only**. The reverse assignment is the tempting one, because `stats` is the
thing that ticks.

**A3. The join meets a container that is in one source and not the other.**
The two calls are not atomic. A container started between them is in `stats` and not `ps`;
one stopped between them is in `ps` as `exited` and still in `stats` with live figures.
**Ruling:** `ps -a` decides who is on the list, so a `stats` row with no `ps` row is
**dropped** and a `ps` row with no `stats` row renders with `—` in the measurement columns.
Never a zero: **absent and zero are different, and only one of them is a fact about the
container** — the same sentence F10's stopped-container probe produced, arriving here as a
rendering rule.

**A4. `CPUPerc` meets a bar.**
The value is `"1.24%"` — a string carrying its unit, and per-core-normalised, so `780%` is
an ordinary reading on an eight-core host.
**Ruling:** parse the leading number, and **do not clamp to 100**. A bar whose scale is
`0–100` renders a busy container identically to a saturated one. The bar's full width is
`100 × cores` where cores is unknown, so the bar is against `100` and **overflows
visibly** rather than being silently truncated to full. F5's lesson — a claim the layer
beneath cannot express — pointed at our own arithmetic this time.

**A5. `MemUsage` meets the MEM column.**
`"9.34MiB / 7.75GiB"` is used and limit in one field, with different units on either side.
`MemPerc` is the same quantity already divided.
**Ruling:** render `MemPerc` for the bar and `MemUsage` verbatim for the text. **Nothing
is parsed into bytes.** Unit arithmetic on a far-side string is the parser R01 commitment 5
forbids, one field over from `Ports` — and `MiB`/`GiB`/`kB`/`B` mixed in one field is
exactly where a converter is wrong quietly.

**A6. The header total meets `CPUPerc`.**
Summing `MemPerc` is meaningful; summing `CPUPerc` is not a percentage of anything.
**Ruling:** the summary shows `CPU 340%` — the sum, labelled as a sum by being allowed past
100 — and `MEM 61%`. They sit side by side and are **not the same kind of number**, which
the surfaces doc now says out loud rather than leaving to be inferred. In the **body**, not
the title: F16, and the frame is what settled it.

**A7. The tail collapse meets the panel's height.**
S1 collapses to `… N more running` after five rows.
**Ruling:** five rows then the notice, and the notice appears **only when N ≥ 1**. The row
that matters is N = 1: `… 1 more running` costs exactly the line it saves, so the threshold
is *collapse when it saves at least two lines*, not *collapse when over five*. Two correct
statements — "show five" and "say how many are hidden" — whose overlap at the boundary is a
line that buys nothing.

**A8. Row order meets a live block.**
Five consecutive ticks came back in `docker ps` order. Nothing documents that.
**Ruling:** sort by name. A static table that reorders is a curiosity; a **live** block
that reorders moves a row out from under a reader mid-glance, and the fault would be
invisible in every test because the observed order is stable. A stable order nothing
promises is the most expensive kind to rely on.

**A8a. And A7 meets A8, which neither of them saw.** Collapsing to the first five *of a
name-ordered list* hides by alphabet: the frame showed `dtui-api` through `dtui-extra2` and
collapsed the busiest container on the machine. **Ruled:** selection and display order are
different jobs — chosen by CPU, displayed by name — so the rows that matter survive and the
ones that survive still do not move between ticks. Added after reading a frame; no row of
either artefact covered it, because a boundary between two rulings is not a rule.

**A9. Zero running meets the panel.**
Every container stopped: `stats` returns nothing at all, `ps -a` returns eleven.
**Ruling:** the panel renders with an empty message naming the state, not an absent panel.
A panel that vanishes reads as a failure to fetch, and this is the one case where the fetch
succeeded perfectly.

---

## B. The sequence trace

Indexed by *what happened in between*. The rows are pairs of rules that cannot meet without
an event.

| # | sequence | the two rules | ruling |
|---|---|---|---|
| B1 | tick → fetch resolves → tick | the driver's interval; the fetch's duration | a fetch slower than the interval must not queue a backlog. C23 owns this; **the app asserts it rather than assuming**, because a 2s interval against a `docker stats` that occasionally takes 3s is the ordinary case, not the edge |
| B2 | tick → fetch **rejects** | `render` is deterministic, `fetch` is transient (A02 §7 rule 2) | the panel says so in its title and retries with backoff. The app supplies `renderError`; folding it into `render` is the mutation that must fail |
| B3 | fetch resolves → the container is gone | A3's join; the last good frame | the row leaves. It does **not** freeze at its last value, which is the failure mode that makes a dashboard lie most convincingly |
| B4 | dashboard ticking → user submits a command | S1's freeze claim; C23's entry lifecycle | **the open question, and the reason this walk exists before the seam.** Asked against the working body in §D |
| B5 | dashboard ticking → session stops | C23 I12: timers stop where `stopping` is set | nothing patches a transcript being torn down. Not the app's to implement; the app's to observe |
| B6 | tick → resize between ticks | C11's width plan; the live block's last render | the next tick re-plans. The row worth watching is the *frame between* — the one rendered at the old width and not yet replaced |

---

## C. The nesting boundaries — the fourth blind spot

**This section exists because of a defect neither of the other two shapes could find.**

Step 1's `STATUS` column truncated on every stopped container. Walk B1 had ruled the
column's `minWidth` from `cells(Status)`; walk C2 had ruled that the state glyph goes
*inside* that cell. Both rulings correct, in different sections, and the two extra cells
`✗ ` costs belonged to **no row of either**. It was found by reading the frame, and the
assertion covering it was the defect restated as arithmetic.

The generalisation: **a consequence between two rulings, owned by neither.** It lives where
one ruling *sizes* something and another *fills* it, and no row is about the boundary
because a boundary is not a rule.

The dashboard is four boxes deep — panel → live panel → table → cell — so it has four such
seams, and each gets asked the same two questions: **which ruling sizes this, and which
fills it?**

| boundary | sized by | filled by | the gap, and its ruling |
|---|---|---|---|
| outer panel → its title | C09's panel chrome | the engine version and the total | nothing measures the title against the panel's width, and at 80 it is the first thing to overflow. **Ruled:** nothing that varies goes here, so it cannot grow under the reader |
| live panel → its title | C23 I34/I35 — staleness and failure are said **in the title** | A1's counts and A6's totals | the framework appends `· 14s ago` or `· unavailable` to a title the app has already filled, and the app cannot see the result. **This ruling was wrong and the frame corrected it** (F16): the title is captured once at declaration and never re-rendered, so counts and totals put here froze at the first fetch while every row beneath them ticked. **Re-ruled:** the title is a constant label, everything that varies lives in the body, and the label stays short enough for the framework's suffix |
| live panel → the table | the panel's interior width | C11's column plan | the table plans against the width it is given, which is the panel's interior, not the terminal's. Two panels deep is four cells of border and padding. **Ruled:** asserted from the frame at 80, never computed — computing it is how the step-1 defect got its passing assertion |
| table row → the cell | A4's bar width | the glyph and the percentage text | **the step-1 defect's exact shape, one component over.** The CPU cell holds a bar, a space and `84%`. **Ruled:** the column is sized for bar + separator + the widest percentage *including* three digits, because A4 permits values over 100 — and the test asserts the rendered cell contains an unelided percentage, not that the arithmetic adds up |

---

## D. The question this walk cannot answer, and must not guess

**Does a `b.live` entry freeze correctly when the next command is submitted?**

S1's claim is not "a dashboard exists". It is *live block on launch, frozen into the
transcript by the first command*. So the launch entry is a **live** entry, and F9's seam is
not "append a first document" but "append a first document that may be live, and freeze it
on first submit like any other".

C22 §8a wrote the day this arrives: *"if anything ever appends earlier — a startup notice,
a restored session — that is the day I7 and I5 genuinely conflict"*. A live first entry is
that restored session.

Every other row here is ruled from captured output. This one has **no captured output**,
because nothing has ever driven a live part and then submitted over it. Guessing it would
be F4 applied to a seam that lands with fail-on-revert protection — the most expensive
place in the project to be wrong from a drawing.

So it is asked of the working `/dashboard`, by reading frames across the submit boundary,
**before** the seam is specified. Whatever the answer, it goes in `FINDINGS.md` and the
seam is designed on top of it.

### The answer: it does not freeze, and nothing was ever going to make it

Measured across one capture — `/dashboard`, four ticks, `/ps` over the top:

| prefix | the dashboard entry |
|---|---|
| 0.86, with `/ps` rendered below it | `reverent_proskuriakova  █░░░░░░░ 13.2%` · `CPU 114%` |
| 1.00 | `reverent_proskuriakova  ░░░░░░░░ 0.2%` · `CPU 101%` |

Still ticking, several entries down. Two dashboards tick independently and out of step.
FINDINGS F17 carries the figures.

**What this changes about the seam.** It cannot be a config field alone. The interesting
half of S1 is what happens to the landing block when work begins, and the answer today is
*nothing* — so the seam must arrive with either a release trigger for "an entry stopped
being the newest" or an explicit ruling that live entries run until evicted and a landing
dashboard is therefore obliged to be cheap. That is a design decision, and it is now being
taken against a measurement rather than against a picture. Which was the point of the
ordering.

---

## What the frame found that neither artefact did

Four, and the pattern in them is worth more than any one.

**1. `maxWidth` was inert, and the glyph was uncounted — in the same column.**
NAME was `minWidth: 14, maxWidth: 24` and rendered `● reverent_pr…`. Two wrong beliefs at
once: `planColumns` gives residual width only to `flex` columns and otherwise leaves it
unused, so a non-flex column renders at exactly its `minWidth` and the cap is decorative;
and the state glyph rides *inside* the name cell, which §C's own table forgot while having
a section devoted to precisely that class. §C listed four boundaries and named the CPU cell
as the place a glyph meets a width. **The list was the blind spot** — a table of boundaries
is still a table of the ones somebody thought of.

**2. `flex` on the wrong column, mirrored from step 1.**
USAGE flexed and took sixty columns to hold an eighteen-character string while NAME
truncated beside it. Step 1's rule was *the slack belongs to the column whose content is
long*; the case it did not cover is that **nothing here is long**, and then nothing should
flex at all.

**3. A toned cell with no glyph, which would have produced no frame at all.**
`bar()` returned `tone: "error"` above 85% and no glyph. C04 I6 refuses that — colour alone
survives neither 1-bit nor a colour-blind reader — so `block()` throws, and the throw lands
in C23's silent catch (F15). **Every container above 60% CPU would have rendered the whole
dashboard as nothing**, on exactly the machine someone opens a dashboard to look at. This
one was not found by the frame: the machine was idle, so no frame could show it. It was
found by a *test* that constructed a busy container, and then confirmed by making one burn
CPU for real.

**4. The collapse hid by alphabet.**
A7 collapses to five rows; A8 sorts by name. Both correct, and *which* five survive belongs
to neither — so the frame showed `dtui-api` through `dtui-extra2` and collapsed the busiest
container on the machine. **Selection and display order are different jobs**: chosen by
significance, displayed by name.

Three of those four are the fourth blind spot — a consequence between two rulings, owned by
neither — in a component whose walk has a section for it. The section helped: it is why the
CPU cell was right first time. It did not help with the NAME cell, the flex decision or the
collapse, because a boundary only appears in the table once someone has thought of it, and
the ones that bite are the ones nobody did.

The honest generalisation is not *write a boundary section*. It is that **the frame is the
only artefact that enumerates boundaries exhaustively**, because it does not have to know
they exist to show them.

---

## What this walk does not cover, and why

- **The plot and the sparkline.** History is gap 1 and needs a ring buffer keyed by tick;
  S4 is where the density makes it worth having. The dashboard shows instants.
- **`b.live`'s `stream` arm.** F10 rules this app onto `fetch`. The arm stays unreached.
- **Value-colour.** Gap 3: a CPU bar encodes load on a continuum and the palette is tone
  slots. Absorbed as thresholds for now, and the threshold choice is arbitrary — which is
  the finding, not the choice.
