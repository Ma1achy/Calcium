# Block states — error, loading, retrying. One generic system.

**Every block kind, one implementation, drawn by the registry.** Plots happen to be the
consumer that surfaced it; nothing here is about plots.

**Three states a block can be in that are not *drawn normally*:**

```
ERROR       the definition's renderer threw. A bug. Terminal
RETRYING    the far side failed and a backoff is counting down. Not a bug
LOADING     no data yet, first fetch in flight. Not a failure at all
```

---

## What was measured first

| | at HEAD |
|---|---|
| renderer errors | **contained per block** — four catches in `registry.ts`, correct content, correct tone. **Wrong height**: the error path is `rows([paint([…])])`, one row, never consulting `measure` |
| the submit path | **no retry at any level.** A far-side failure settles an error document on the first failure — the honest behaviour |
| the refresh path | **retry with backoff exists.** Per *source*, doubling from the declared interval to a 5-minute cap, reset on success, **no attempt cap** |
| its rendering | `part.spec.renderError(shown, retryIn)`, defaulting to an error notice reading `<message> — retrying in 8s` |
| cancellation | one shared timer, backoff is data (`src.dueAt`), five stop triggers, every `⌃c` rung reaches it. **No hazard** |
| off-screen retries | `anyoneLooking()` excludes unwatched sources from scheduling. **Closed structurally** |
| loading | **nothing draws it.** A part that has never fetched renders `"No data."` — and *no data* and *data on its way* are different facts |

---

## 1 · The shape — one box, three contents

**The registry draws a bordered box at `measure(block, width)` rows and puts one of three
things in it.** The definition draws nothing, because in all three cases it either cannot be
trusted to or has nothing to draw.

### ERROR

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ───────────────[ERROR]───────────────          │
│  ⚠ plot failed to render:                       │
│    Cannot read properties of undefined          │
│                                                 │
└─────────────────────────────────────────────────┘
```

### RETRYING — the error block, plus one line

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ───────────────[ERROR]───────────────          │
│  ⚠ connection refused                           │
│                                                 │
│  ⠋ retrying in 8s · attempt 2                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### LOADING — no error, so no rule and no tag

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                                                 │
│              ⠋ loading · 4s                     │
│                                                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Retrying is compositional, not a third rendering** — the error block with a trailing line.
**One implementation with an optional line, not three cases.**

---

## 2 · Why the registry draws it and not the definition

**For ERROR, the reason is not size.** A kind whose renderer is broken **cannot be trusted to
draw its own failure** — if a `renderError` lived in the module that just threw, the boundary
would be calling into the thing it is containing.

**For LOADING and RETRYING, the reason is that there is nothing to draw.** A definition with
no data has no picture. **A per-kind hook that drew a plot's axes while loading was considered
and refused**: it is nicer, and it costs a hook on every definition to buy something the
border already says — *the block is here and it is this size.*

**So: no `renderError`, no `renderPending`, no per-kind knowledge.** One box, three contents,
and the border is the boundary speaking rather than the block.

**The cost, stated**: a plot with `plotFrame: "rule"` still gets a box, and a loading plot
shows no axes. **Both are deliberate.**

---

## 3 · The paint — one run, and it is the tag

```
[ERROR]              PAINTED — light foreground on the error ground
─── the rule         the error tone, foreground only
⚠ and the message    the error tone, foreground only
the retry line       the DEFAULT tone — see below
the border           unpainted
the blank rows       unpainted
```

**A block of painted text reads as a mode; one painted tag reads as a label**, which is what
it is. **The rule and the message are the same red as the tag's background**, so the whole
figure reads as one thing without any of it being a wash.

**Colours are slots, never literals.** The tag needs a **pair** — foreground and background
together — because a background without its matched foreground is how contrast floors get
missed. **C10 owns colour; the block names a slot.**

**MEASURE FIRST whether the pair is expressible.** `paint.ts` records that C25 was the only
kind painting a background at all. **If `Style.background` does not exist, or no theme
declares a slot carrying one, report that rather than minting one** — that is C10's surface.
**The unpainted version still works**: the rule, the tag and the message in the error tone.

**And the retry line takes the default tone, not the error tone.** The error already said what
went wrong; **the retry line says what is happening now, and that is not a failure.**

---

## 4 · The numbers

### Loading shows ELAPSED, and it is the more important of the two

```
⠋ loading · 4s
```

**A spinner says *something is happening*. A spinner at `47s` says *this is wrong*** — which is
what a reader needs to decide whether to wait or to cancel.

```
below 1s     no counter — a fast load must not flash one
1s – 99s     4s · 47s
past 99s     2m 14s — a three-digit second count is harder to read than a minute
```

### Retrying shows the COUNTDOWN and the ATTEMPT, and not elapsed

```
⠋ retrying in 8s · attempt 2
```

**Three numbers on one line is one too many**, and the countdown is the actionable one. The
attempt gives the history; elapsed adds nothing either of them does not.

**`retryIn` and the attempt come from the driver**, which already computes `retryIn` for
`renderError` today. **No new state and no new store.**

---

## 5 · The spinner

**`spinnerFrames(caps, name)` and `spinnerIntervalMs(name)` ship** — sixteen sets, each with
its interval, each with an ASCII pair matched by shape of motion. **This is their first real
consumer.**

**The same set for loading and for retrying**, so the reader learns one glyph means *waiting*
in both places.

**`RenderContext.tick` advances it**, so the frame is a function of tick and **the block owns
no state — the render stays pure.** C12 I11 unviolated, and the elapsed counter comes from the
same source.

---

## 6 · Height — the whole point, and it is the defect being fixed

**The box occupies exactly `measure(block, width)` rows.**

**Measured today**: `measure=20` draws 1. A sequence measuring 22 renders 3. `visibleRows`
clamps per entry so the frame survives, **but C14 believes the block is 20 rows — so a reader
holding `↓` moves through nineteen rows of nothing.**

**And the over-draw is the other half**: `measure` throws → contained to 1; `render` does not
throw and draws 5; `takeRows` truncates four rows **and nothing says so.**

**The ruling**: the box draws `this.measure(block, width)` rows — the *contained* measure,
which already falls back to 1, **so the pair is self-consistent by construction.** And **a
definition that throws in either half renders as the error block**, which removes the silent
truncation.

**Truncate the message to fit the box. Never the box to fit the message.**

**And the border is the EVIDENCE the height was honoured** — a bare message with blanks below
looks identical to a block that under-drew, which is the exact defect this fixes.

---

## 7 · Degenerate heights

```
≥ 5     border · blank · rule · message · [retry line] · blank · border
4       border · rule · message · border
3       border · message · border          — no rule
2       message on both rows                — no border
1       message alone, truncated            — no border, no rule
```

**A box needs three rows to be a box. A rule with no message says a thing failed and not
what.** Both are rulings rather than rendering accidents.

**Loading at height 1 is `⠋ loading · 4s` truncated to width.**

---

## 8 · Degradation

```
24 · 8-bit   the tag painted, everything else in the error tone
4-bit        the curated index pair — check the contrast floor holds
1-bit        NO PAINT. `inverse` carries the tag; ⚠ is the first carrier and the
             inverse is the second. F34 satisfied by two channels
ascii        ┌─┐ → +-+ · ⚠ → ! · the spinner's own ASCII arm. Paint is SGR, so the
             ascii arm is a glyph question and the colours are unchanged
```

**A painted error that loses its paint must not look like ordinary text** — at one bit the
mark plus the inverse is what stops it.

---

## 9 · Which state applies where

```
a renderer throws              ERROR. Any kind, any path. Terminal and STICKY —
                               the lines are memoised like any others, so the
                               definition is not re-called until rev, width, theme,
                               focus, window or offset moves
a refresh source has never     LOADING
succeeded
a refresh source failed and    RETRYING
is backing off
a submit-path verb fails       NEITHER. It settles an error DOCUMENT — status:
                               "error", surfaced as a notice. C23's route, and it
                               does not retry
```

**The last row matters**: a far-side failure is a *document* and a renderer error is a *bug*.
**Conflating them is what this note exists to prevent**, and the two have different paths,
different lifetimes and different renderings.

---

## 10 · The invariant

**C09 I11 gains the geometry half rather than a second invariant beside it.**

Today: *a renderer throwing is contained: that block renders as an error block, the rest of
the frame is unaffected.* **True about content, false about geometry** — and I1, three lines
away, says `measure` equals the row count of `render`. **The cell where both apply satisfies
one.**

**One sentence with both halves**, or the next reader finds the same gap between two adjacent
lines.

---

## 11 · Loudness

**Both catches are bare — no sink, no counter, no report.** And T3.14's own words are
*contained, block treated as height 1, **logged***, with no logging anywhere: **a spec row
naming an effect with no mechanism**, satisfied by the half of the sentence that exists.

**`createBlockRegistry({ onError })`** — L1-clean, no env, no clock, no upward import. **Test
support passes a sink that fails the run**, so a caught render error is loud in a suite and
quiet-but-visible in a session.

**One constraint**: an option member with no consumer in `src/` trips MG24, **so wiring it to
C23's existing record is part of the change**, not a follow-up.

---

## 12 · Tests

```
HEIGHT
  BS1   the box occupies exactly measure(block, width) rows, at 1, 2, 5 and 20
  BS2   a definition whose MEASURE throws renders the error block
  BS3   blocks after a failed one are unshifted — asserted by a frame read
  BS4   over-draw is impossible: render is never called when measure threw

PRESENTATION
  BS5   the border draws at heights 3 and above; at 2 and 1 it does not
  BS6   the message is centred vertically and horizontally
  BS7   the message wraps where the box can hold it, truncates only when it cannot
  BS8   only the tag is painted — the border, the rule, the message and the blank
        rows are not
  BS9   at 1-bit the tag is inverse and no background is emitted
  BS10  the ascii arm draws + - | and ! and no box-drawing codepoint

STATES
  BS11  a source that has never succeeded draws LOADING, not "No data."
  BS12  loading shows no counter below 1s, seconds to 99s, minutes past it
  BS13  retrying draws the error block PLUS one retry line
  BS14  the retry line carries the countdown and the attempt, and not elapsed
  BS15  the retry line is in the default tone, not the error tone
  BS16  the spinner advances with RenderContext.tick and the render is pure
  BS17  a submit-path failure does NOT enter any of these — it settles an error
        document and renders as a notice

LOUDNESS
  BS18  a caught render error reaches onError
  BS19  a caught render error fails the test suite
  BS20  onError has a consumer in src/ — MG24 is quiet for the right reason

FRAMES
  BS21  a frame read at four capability sets for each of the three states
  BS22  a golden of each — the first ones, since nothing shipped is on this path
```

**BS3 and BS21 are the two no arithmetic can check**, and BS3 is the defect this is for.

---

## 13 · Two things flagged, and neither rides along

**No attempt cap on a refresh source.** `failures` grows without bound; only the interval is
capped at five minutes. **A permanently dead source polls forever with an error panel showing
a countdown** — deliberate for a dashboard, and worth an option rather than a change:
`maxAttempts?: number`, absent meaning today's behaviour. **The default does not move.**

**The stall notice fires at two minutes**, and it is the only thing that speaks for a quiet
foreground verb. **A verb that takes thirty seconds with no output says nothing for four times
its own duration.** The elapsed counter above speaks from the first second and mostly removes
the need for the stall notice to be the first signal — **but that is a separate question with
its own measurement, and it is not this one.**
