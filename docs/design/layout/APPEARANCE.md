# Calcium — the appearance rules

**Companion to `calcium-design-language.html`, which draws every one of these.** This file is
the rules; the HTML is the pictures. **When they disagree, the picture wins** — it was measured
and this was written.

---

## 1 · The principles

**Six, and every rule below is one of them applied.**

**One shape per meaning, everywhere.** A tool call, a command, a job and a subagent are one
object. An error in a plot, a table and a live part are one object. The differences are what
they say, not how they are drawn.

**The shape does not depend on the timing.** A call's head, gutter and body are identical at
10 ms and at 10 s. Only the contents of the duration slot change.

**Structure carries meaning; colour reinforces it.** Every reading survives to one bit. If a
distinction exists only in colour, it does not exist.

**Nothing claims more than it measured.** A dash is not a zero. A sampled figure says sampled.
A bounded window says what it dropped. A stale reading carries its timestamp.

**Nothing animates unless its subject is moving.**

**Every mouse affordance has a keyboard equal.**

---

## 2 · Colour

### The tones

```
default      normal          body text, the reading
dim          deemphasised    secondary text
muted        deemphasised    furniture, units, labels, rules
ok           emphasised      a good outcome
warn         emphasised      approaching a limit
error        emphasised      over a limit, a failure
info         normal          a neutral notice
accent       emphasised      the focused thing, the selection
meta         normal          a kind, a type, a category
identifier   normal          a name the reader typed or can type
```

### The surfaces

```
bg             the ground
bgElev         one step off — a panel, a button, a user message, "inside"
bgDeep         a well — content inside a container
focusGround    two steps off — where the cursor is
selection      a selected run — what will be copied
border         ordinary chrome
borderStrong   a focused container
diffAdd        a changed line, added
diffRemove     a changed line, removed
errorGround    the ERROR tag, and nothing else
```

### The rules

**So the rule is: ACTIVE = INVERT.** The element's own tone becomes its ground and the ink flips
to contrast; a thing with no tone of its own takes the accent.

```
a button        no tone      →  the accent
a link          identifier   →  cyan, and the underline stays
a paste chip    meta         →  purple
a destructive   error        →  the error ground
a chosen answer ok           →  the ok ground
an agent chip   its own hue  →  already painted; focus bolds it
```

**And what it paints depends on the SHAPE**, because an element is not always a row:

```
A RUN      text with no frame        the RUN inverts
A BOX      a button, a chip, a       the BOX inverts
           choice, a full-width row
A FRAME    a plot, an image, a       its BORDER — or its AXES when it has
           panel, a terminal         none. The inside is untouched
A CONTROL  a slider, a toggle, a     a WASH over ALL of it — label, track
           checkbox, a radio         and value
```

**A control's VALUE keeps its own colour** — the filled track is `info` and never changes, so
*where the value is* stays readable in every state. **Focus is the wash; INSIDE is weight plus a
painted handle** (`●` → `◉`). Three states, three mechanisms, and none of them collide.

**A checkbox and a radio split the same way:** the MARK carries chosen (`●`/`○`, `✓`/`✗`) and the
WASH carries focus — **so you can be on an option you have not chosen**, which is the whole point
of a radio group.

**A link keeps its underline when active, and it goes DOTTED** where the terminal has extended
underlines (`SGR 4:4`, a capability). *The underline says LINK; the inversion says ACTIVE.*

**A picture takes its BORDER — or its AXES, when it has none.** `furniture.ts` carries
`frame?: boolean` and most plots have none, so the axes are what frames a figure. Drawing a
border on focus is **refused**: it changes the height, and `measure` already committed to one.

**Three states, three mechanisms:** at rest is nothing or the element's own resting ground;
focused is invert / the border / a wash; **inside is HEAVY** — the same light/heavy pair the plot
border and the scrollbar already use. **And hover is identical to focus, everywhere.**

**At 1-bit active is `SGR 7`**, which makes the rule literal: the inversion *is* the inversion.

**One meaning per tone.** `error` is only a failure or a crossed limit. `warn` is only
approaching one. `accent` is only the focused or selected thing. `ok` is only a
completed-successfully outcome.

**Three tones on a screen is normal. Five is a smell.** Most of a good frame is `muted`.

**`dim` versus `muted`:** `dim` is text you could read; `muted` is furniture you look past. A
label is muted, a secondary sentence is dim.

**Elevation has three rungs and no more.** An overlay over an overlay takes `bgElev` with a
`borderStrong` edge — a four-rung ladder in a terminal is four greys nobody can tell apart.

### Weight is bound to tone, not free

`ok · warn · error · accent` are emphasised → bold at 1-bit. `default · info · meta` are
normal. `dim · muted` are deemphasised → faint. **So at 1-bit the tone still reads, because it
was never only a colour** — and bolding a muted label contradicts its own tone.

---

## 3 · The background is a second channel

**A background is for an EXTENT. A foreground is for a MARK.** Something with length or area
takes a ground; a symbol or a label does not.

**The test: am I painting a THING (a button, a track, a header) or a FACT about a thing (its
status, its mode, its outcome)? Things take a ground. Facts take a tone.**

Nine places a ground earns it:

```
a changed line          full width, to the block's edge
a changed WORD          short — the extent is the claim
the permission posture  NEVER. A posture is text
the context bar         segments as grounds
a selection             a run the terminal cannot tell you the bounds of
a focused row           a wash, so no mark column is spent
a cell's magnitude      the ground IS the number
half-block images       two full colours per cell
a well                  bgDeep, structural, never semantic
```

**Two rules.** Structural and semantic grounds never mix — a panel takes `bgElev`, never
`diffAdd`. And **a ground is never the only carrier**: the `+`/`−` carries the diff, the `▸`
carries the focus, the glyph carries the bar.

**The error tag is the only painted label in the system**, which is what lets a red posture
(`!! skip`) be drawn in text and never be mistaken for one.

---

## 4 · Glyphs

**Every glyph comes from the table, with an ASCII rung, and every substitution is 1:1 by column
count.** A fallback two cells wide where the original was one makes every measured height wrong.

```
chrome      ─ │ ┌ ┐ └ ┘      ascii  - | + + + +
tree        ├ └ │ ⎿           ascii  |- `- | `-
scrollbar   │ ┃ ╽ ╿           ascii  | # (no half-rows)
head mark   ●                 ascii  *      U+25CF, NOT U+23FA (emoji)
warning     ▲                 ascii  !
truncation  …                 ascii  ~
```

**Measure the East Asian width before adopting one, and measure the SET.** `│` and `┃` are
Ambiguous; `╽` and `╿` are Narrow — four characters that are each fine are unusable together,
so the scrollbar takes its ASCII rung at `ambiguousWidth: "wide"`.

**And check for an emoji presentation.** `⏺` U+23FA renders as a record button. `⏸` U+23F8 is
the same trap. `⚡` is wide *and* an emoji.

---

## 5 · The grid

### Horizontal

```
col 0-1     the gutter — ●, ├─, └─, │, ⎿, or two spaces
col 2       one space, always
col 3+      content, stopping at width − 1
```

**Every nested level costs exactly three columns.** One column of right margin, always.

### Vertical

**A blank row means *a different thing starts here*.**

```
between entries              one blank row
between blocks in one entry  none
between a head and its body  none
```

**A block never emits a leading or trailing blank row itself** — spacing belongs to the
sequence, or two adjacent blocks each contributing one produce two.

### Reading order

Left to right, then top to bottom. The most important field is top-left; **the reading is at
the right, aligned with every other row's.** Numbers right-align on their decimal point,
labels left-align, **units travel with the number** — a screenshot of one row has to be
readable alone.

---

## 6 · The call grammar

**One shape for every command, tool call, job and subagent.**

```
● pytest tests/unit · 4.2s · 47 passed
  ⎿ ============== test session starts ==============
    ............................................ [2%]
    +392 more · ⏎ to expand
```

```
THE HEAD    ●, the verb, the argument, the duration slot, the outcome
THE GUTTER  ⎿ then │ — this belongs to the head above
THE BODY    bounded, scrollable, with a residue row
```

**The verb is a name, never a sentence.** `pytest`, not `Running pytest`.
**The outcome is a number, never a status word.** `47 passed`, not `succeeded`.
**The argument truncates from the tail** — a cut head reads as a different word.

### The running state — a minimum, not a threshold

**Every call enters its running state, and it is visible for at least one commit window
(100 ms).** The spinner sits where the duration will be, so **nothing reflows when a call
finishes**, and a 20 ms call is not a special case and does not look like one.

**A threshold is a number someone will tune. A minimum display has one correct value.**

### Nesting

`⎿` is a corner — right for one child, wrong for a set. `├` and `└` make the last child
visibly last; `│` continues past a child's body so a two-row child does not look like two
children. **Two levels is the working depth.**

**A parent's duration is wall clock and the children do not add up.** Children never reorder —
completion is carried by the duration, not by position.

### Bounded by default

A 400-line result is eight rows and a residue line. **Streaming scrolls inside the block**; the
prompt and the head stay where they are.

---

## 7 · The dot

```
     the AGENT is working       accent, and it walks the bloom family
●    a TOOL CALL is running     white, blinking
●    a call SUCCEEDED           ok, still
●    the agent SAID something   white, still — prose has no outcome
●    blocked on YOU             warn, blinking
●    cancelled                  muted, still — nothing went wrong
●    failed                     error, still
○    queued, not started        hollow, muted, still
```

**Colour only where there is something the outcome slot does not already say**, which is why
agent prose is white and a settled call is not.

**Warn appears twice and the motion separates them:** blinking warn is waiting on you, still
warn is over and cancelled.

---

## 8 · State

**Four states, one kind, and nothing hand-rolls a notice.**

```
LOADING    the block's own frame, empty, with a spinner and an elapsed counter
ERROR      ───── ERROR ───── rule, the ▲ mark, the message, at the committed height
RETRYING   the error block PLUS one line — not a third rendering
EMPTY      a correct block about nothing. Muted, centred. NEVER an error
```

**The `ERROR` tag is painted and nothing else is.** A block of painted text reads as a mode;
one painted tag reads as a label.

**The error box has a ladder**, because a box needs three rows to be a box: ≥5 rows gets the
full form, 3 loses the rule, 2 loses the border, 1 is the message truncated.

**A refusal is not an error.** It states its reason and is never red.

---

## 9 · Motion

### Spinners — four rules

**Every frame is one cell**, by `cells()` and by the terminal. Two ways a character fails:
East Asian Ambiguous, or an emoji presentation. Both are measured before a set is registered.

**Frames × interval lands near 800–1600 ms**, for a spinner that is the ONLY liveness signal.
A 28-frame set at 4 s reads as stuck. **Beside a progress bar the bar carries liveness**, so the
spinner can be slower and carry character instead — which is why compacting runs `fullramp` at
42 frames and 5.0 s. The interval belongs to the set, never the caller.

**A ping-pong loops 0 → N → 1, never 0 → N → 0** — repeating an endpoint stutters. **And every
set in a family ping-pongs or none does**: `fullramp` was one-way where its four siblings were
not, so it cut back to the start where they returned.

**The ASCII pair matches the motion, not the looks.**

### The agent's mark

**A continuous walk through the reserved bloom family** — `fullramp · grow · bloom · starfield ·
pulse`, 82 frames, 9.8 s. It leads with `fullramp` because that set begins at a dot, so the walk
opens small and blooms.

**The walk is the one exception to the cycle-length rule and it is deliberate**: it is not
saying a step is in progress, it is saying the agent is alive, and a 7-second cycle never looks
like a loop.

**SETS THAT SHARE GLYPHS SHARE AN INTERVAL.** The bloom family is five subsets of one glyph
ladder — `✶` appears in four of them, `✢` in four, `⋅` in three — so at five different intervals
**the same glyph moves at five different speeds depending on which set it is in**, and that is
what reads as inconsistent rather than the rate. At one interval (120 ms) they differ only in
**amplitude and cycle length**, which is what actually distinguishes them.

```
pulse       6 × 120ms =  720ms    barely opens
starfield   8 × 120ms =  960ms
grow       12 × 120ms = 1440ms
bloom      14 × 120ms = 1680ms
fullramp   42 × 120ms = 5040ms    a dot to a full flower
the walk   82 × 120ms = 9840ms
```

**And nothing varies its rate at runtime.** No rung, no heuristic, no mapping from throughput to
speed — *a rate that varies is a rate no golden frame can hold*, and the two things it would
convey are already said better: **the elapsed counter and the thinking tone** say how long you
have waited, **the step count and token rate** say how much is running. The mark's job is to say
*the model is alive*, which is one bit and does not need a dial.

**The bloom family is reserved, and it means THE MODEL IS WORKING** — its turn, or compacting
its own history. **A tool never blooms.** Which is still checkable: a bloom set on a tool is a
defect a grep finds.

### A tool's spinner is chosen by its verb

```
reading      braille          the neutral default
writing      growHorizontal   something filling up
searching    orbit            sweeping a space
network      bounce           out and back
uploading    growVertical     rising
tests        triangle         stepping through
compiling    noise            churning
compacting   fullramp         the model working on its own history
waiting on you  toggle        two states, slow — nobody is busy
```

**Randomise what carries no information. Determine what does.** A random spinner cannot be
golden-framed, which is why the agent's variation is a deterministic walk rather than a choice.

---

## 10 · Ink ramps

**An ink can be a ramp rather than a tone.** The framework already resolves `[0,1] → Colour`;
the gap is that only field forms could reach it.

```
gradient   smooth — two tones, or a colormap
step       N discrete bands
palette    cycle a categorical palette
```

**The extent is per kind and there is no universal answer** — grapheme index for text, sample
index *or value* for a series, its own length *or the axis* for a bar, perimeter for a border.
**A kind with no meaningful extent says so.**

### The effects, and what each means

```
glint · drift · tide          ambient — noticed only if you look
shimmer · wave · chase        working — visible, not demanding
breathe · pendulum            waiting — on you, or on nothing
pulse · flicker · twinkle     attention — something is off, or many-at-once
sweep · pop · wipe            terminal — they END, and that is the message
typewriter · marquee          position rather than colour — these survive 1-bit
```

**Every travelling ramp moves LEFT TO RIGHT** — the direction of reading, and the direction a
bar fills. *A highlight running backwards reads as undoing rather than doing.* In CSS that means
a delay that is negative (so there is no first-cycle stutter) but **increases** with the
character index: `calc(var(--i)*60ms - 10800ms)`, not `calc(var(--i)*-60ms)`.

**An animation says what is happening, never *look at this*.** Below 8-bit the motion stops —
three colours moving is a flicker.

### What terminals can actually do, measured

**One colour per cell. You cannot ramp within a glyph.** Claude Code was captured byte for byte:
its shimmer is two fixed colours and a 1–3 character band, addressed per character, with no
sub-cell anywhere. **The reference does less than this design allows.**

**Sub-cell exists only where the glyph is a block** — `▀` carries a foreground and a background,
which is two stops per cell. Bars and borders get it; text does not.

### Streaming text

**The ramp is anchored to the point of arrival**, so it slides right as text streams. **The
cursor is the agent's own mark**, one space past the head: *the trail says what just arrived, the
bloom says more is coming.* Two facts, two carriers — and the trail stops saying the second one
the moment the stream pauses.

**So the mark lives wherever the agent is acting** — in the activity region while it reasons or a
tool runs, **at the head while it writes**. One bloom on screen; two is two things claiming to be
live. When the stream ends the bloom goes and **nothing replaces it**.

**Five trails, and HOT EDGE is the default:**

```
hot edge   overshoots the ACCENT at the head, holds, then cools to the body
           colour — the head reads even when the stream is slow
fade       the newest character IS the ground and emerges toward the ink
hue trail  arrives in the accent and cools — needs the mark least, because
           the accent is already the agent's
ripple     a brightness wave propagating BACKWARDS from the head
weight     bold, then ONE HARD STEP. No settle. The only 1-bit survivor
```

**A run keeps its OWN ink as the trail's target.** The reasoning is dim, so its trail cools to
dim — a trail with a fixed target repaints every run to the body colour, *which is a bug that
looks like a styling choice.*

**Two things a terminal cannot do, and both were tried.** A per-character **fade over time**:
there is no per-cell timeline, so an age-based fade means every character in the trail repainted
every frame — at a 100 ms window, ten repaints per character. And a glyph **rising into** its
cell: there is no sub-cell position to animate toward. **What is affordable is a fixed band at
the head**, where the cost is a function of the band width rather than the reply length.

**And chrome is never revealed and never ramped.** The reveal is a property of the stream; the
ramp is a property of a character's age. **A header has no age**, so it exists whole or not at
all. The `●` mark and `▾ thinking · 4s` appear complete.

---

## 11 · Progress

**Two alphabets, and the difference is what the bar IS.**

```
██████████████░░░░░░░░░░    a BUDGET being consumed — ctx, step, disk
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱    an OPERATION in progress — compacting, indexing
```

**A budget is a state you glance at. It never finishes.** An operation starts and ends and has a
spinner beside it. **So a reader never has to ask whether a bar will finish.**

Both collapse to the same ASCII rung, so the distinction is a 24-bit and 8-bit affordance and
**the spinner carries it when the alphabet cannot.**

**An operation's bar SHIMMERS along its fill. A budget's does not move.** Which is the second
channel separating the two alphabets — the glyph says it, and the motion says it again in a
channel that survives when the alphabet collapses. **At ascii both are `##..`, and only one is
still moving.**

**The fill shimmers; the remainder does not.** The empty half hasn't happened yet, so nothing in
it is moving — *a shimmer across the whole bar would say the whole bar is active, which is the
one thing a progress bar must not say.*

```
⠿ Compacting conversation…  (5m 38s · ↓ 8.0k tokens)
  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱  77%
```

**The head names what is HAPPENING, not a tool** — a gerund, because an operation is a process
rather than a call. And the aside carries **a delta in the operation's own units** — `↓ 8.0k
tokens`, `4,102 of 9,318 files` — because *a percentage is the same word for everything, and the
unit is what tells you whether 44% is nearly done or nowhere near.*

**When it ends the bar is gone**, and the outcome is the delta finished: `41k → 12k tokens`, not
"done". A 100% bar on a finished thing is a row spent on nothing.

**An indeterminate bar is not a bar** — use the spinner and the elapsed counter.

---

## 12 · The frame

```
agent-tui   ✦ qwen3-coder-next   effort high        localhost:8000   22:13
────────────────────────────────────────────────────────────────────────────
  … the transcript …
────────────────────────────────────────────────── calcium/count ─
❯ ▌
────────────────────────────────────────────────────────────────────────────
» auto   ✦ qwen3-coder-next   effort high            localhost:8000   22:13
██████████████░░░░░░░░░░  62%  31k/50k   step ████░░░░░░ 4/10   28 tok/s
~/code/calcium   ⎇ feat/c26   +124/-18 ~1   ✎ 3          malachy   31m
```

**The prompt's top rule carries a label**, right-aligned with one trailing dash, **painted** —
a name is a thing and things take a ground. It is identity: it does not change during a turn.

**`/colour` tints the label's ground and the three rules, nothing else.** Ten vivid hues, a
colormap, or a hex — **and here a hex is taken literally**, because you are picking a colour to
tell this terminal apart and one that shifted with the theme would be broken.

**The context bar is segmented by what the parts ARE** — system, tools, turns, that one file
read. A percentage says 78% full; it does not say one file read is 60% of it.

---

## 13 · The permission postures

```
❯ manual          grey     every call comes back to you
? accept-edits    purple   edits go; it still asks about commands
❙❙ plan           blue     nothing is written
» auto            yellow   nothing asks
!! skip           red      no permission check at all
```

**None of them is painted.** The error tag is the only painted label, so a posture drawn in text
can never be mistaken for one however red it is — **the distinction is the channel, not the
hue.** And skip does not flash: it is telling you what is true, once.

**`❙❙` because `⏸` U+23F8 is an emoji. `!!` because `‼` is one and `⚡` is wide.**

---

## 14 · Degradation

**Two high-contrast themes, dark and light**, every tone clearing AAA against its ground —
`#fff`/`#000` at 21:1 down to the quietest muted at 7.8:1.

**And the ink on a painted ground is chosen by MEASURED contrast**, never by a luminance
threshold. A fixed cut at `lum > .38` picks white on a bright ground and lands at **2.7:1** —
which is exactly what high contrast exists to prevent. Compare both and take the winner; the
worst pairing anywhere in nine themes is then 4.6:1.

```
24-bit      as designed
8-bit       tones quantised. Ramps survive
4-bit       the curated pair per tone. Ramps become steps, motion stops
1-bit       structure only. Tone becomes weight, selection becomes inverse
ascii       every glyph takes its 1:1 substitution. Colour is unchanged
```

**`ascii` and `colourDepth` are independent axes.** `ambiguousWidth` is a third.

**A capability makes things BETTER, never POSSIBLE.**

---

## 15 · The checklist

```
1   every call has a head, a gutter and a bounded body
2   a call's shape does not depend on its duration
3   every call enters its running state for at least one commit window
4   nothing hand-composes a notice
5   every nested level costs exactly three columns
6   a blank row separates entries and nothing else
7   a block emits no leading or trailing blank row
8   content stops one column before the right edge
9   a number carries its unit
10  a dash is not a zero
11  error is the only red; accent is the only highlight
12  three tones on a screen; five is a smell
13  every glyph comes from the table and has an ASCII rung
14  every distinction survives to one bit
15  nothing animates unless its subject is moving
16  a stale reading says when it was taken
17  a bounded body says how many rows are hidden
18  a list that filters says how many it filtered
19  things take a ground; facts take a tone
20  a refusal states its reason and is never red
```

**The audit is reading frames. Two surfaces that read as different products is a defect, and no
assertion in this repository can see it.**
