> **Reconciled against HEAD, 2026-09-06, at `10ed2733` on `feat/plot-arm-unification`** — from the
> substrate-arc drop (`README_SUBSTRATE_ARC.md`). The text below is the drop's, unchanged; this
> preface is what the tree says where the note and the tree differ. A `file:line` is where the
> symbol was on the day — grep the symbol.
>
> **Status: implemented as the call-grammar plan, S0–S5 specs then C1–C4 code, 2026-09-05/06.** The
> authoritative statement is `docs/design/AGENT_TUI_DESIGN.md` §9c (corrections 5–8), C09 I45–I49,
> C04 I104/I105, C22 I88–I90 and C23 I58–I62; F823–F833 in `examples/docker/FINDINGS.md` are the
> findings the walk produced before code. Where the tree ruled differently from a sentence below,
> the tree is right and the reason is in the finding named.
>
> | the note says | the tree, measured |
> |---|---|
> | rule 3, *the outcome is a number, not a status word*; §6's `check · 8.1s · ok` | a count where one exists, a word (`denied`, `cancelled`, `truncated`, `failed`) where none does, and **never `ok`** — `verb · 4s` with the tone carrying success (C23 I59). The note's own §6 example breaks its own rule 3 |
> | §7, *`⏎ (again)` re-runs* | reversed: `⏎` is expand/collapse only; re-run stays on `⇧⏎`/`⌥⏎` (`keymap.ts`). *`⏎` again* is an arming machine, C16's measured defect class (design §9c correction 5, C26 §5) |
> | `+392 more · ⏎ to expand` | the residue row names no key (C16 I19): open box `⋯ N above, M below`, collapsed `⋯ +N more`; the footer shows the `expand` label (C04 I104, design §9c correction 6) |
> | §10, `⎿` ASCII `` `- `` | `` ` `` — one character, because a substitution keeps its cell count (C09 I5); the two-character rung is a recorded deviation, not adopted |
> | §10, `├─`/`└─` with distinct ASCII rungs | both flatten to `+` through `glyphForMask` at `ascii || wide` (F293); the last-child distinction vanishes at the ASCII arm and is recorded, not repaired |
> | §10, `⚠` *and it is ▲ in this tree* | correct, and stronger: `⚠` has an emoji presentation form and SS57 refuses it in any `src/` literal (F833 — fifteen bases in four families on the rule's first run) |
> | §6b, subagents open as a pushed view | spec'd and deferred: no subagent producer or transcript type in `src/` (walk S14). The nested card, the tree gutter, `rollUp`, start order and head-only running children landed (C22 I89, C23 I62) |
> | §8, approval as a layer | `approvalPrompt` + `PipelineDeps.approval?` land with a test consumer only; the far-side signal is the named blocker (C23 I60). Denied settles with history code 126 |
> | the spinner in the running head | the readout's tick is the elapsed second and is the spinner's frame; below one second the spinner alone (C23 I58). Not a 120 ms live part — the 1 Hz readout is the honest cadence |

# The call grammar — what every tool call and command looks like

**One shape, everywhere.** A command the reader typed, a tool an agent invoked, a job the
platform ran — **they are the same object and they look the same.** The differences are what
they say, not how they are drawn.

**The standard is Claude Code**, and the measurement behind that is real: its transcript is
skimmable because every call has a marked head, a gutter that says *this belongs above*, and a
body that is bounded rather than poured.

---

## 1 · The shape

```
⬤ pytest tests/unit
  ⎿ ============== test session starts ==============
    ............................................ [2%]
    ...............ssss..........................[4%]
    +392 more · ⏎ to expand
```

**Three parts, and each has one job:**

```
THE HEAD      ⬤ and what ran. One line, always present, always the same shape
THE GUTTER    ⎿ and a left rule — this belongs to the head above it
THE BODY      bounded, scrollable, with a residue row saying what is hidden
```

**Nothing else.** No box by default, no title bar, no separator, no blank line above or below.
**The gutter is the grouping and it costs one column.**

---

## 2 · The head, in three fields

```
⬤ pytest tests/unit · 4.2s · 47 passed
  │       │            │      └── the OUTCOME, once known
  │       │            └── the DURATION, once known
  │       └── the ARGUMENT, truncated from the tail
  └── the VERB
```

**The verb is what was invoked** — a command name, a tool name, a job kind. **Never a sentence,
never a gerund.** `pytest`, not `Running pytest`.

**The argument is the shortest thing that distinguishes this call from the next one.** A path, a
target, a query. **Truncated from the tail with the ellipsis the glyph table gives**, because a
cut head reads as a different word — `betal_length` is a word and `petal_leng…` is not.

**The duration appears when the call ends, not while it runs** — a counter that ticks in the
head competes with the spinner beside it, and the elapsed number belongs to the running state.

**The outcome is one clause and it is the reader's summary, not the tool's exit code.**
`47 passed`, `3 files changed`, `no matches`. **A number, not a status word** — *succeeded* says
nothing a green tone does not.

### The running head

```
⬤ pytest tests/unit · ⠋ 12s
```

**The spinner sits where the duration will be**, so nothing moves when the call finishes. **And
the elapsed counter is the number that matters** — a spinner says *something is happening*; a
spinner at 47s says *this is wrong*.

---

## 3 · The gutter, and why it is not a box

```
⬤ verb · args · outcome
  ⎿ the body
    more body
```

**`⎿` marks the first body row; the rest carry the left rule or nothing.** One column, zero
rows.

**A box costs two columns and two rows.** Three calls on a 24-row terminal is **six rows of
chrome — a quarter of the screen spent on lines.** `plotFrame`'s ruling applies: ship both,
default to the cheap one.

**The border earns its place at exactly one moment**: an attached session, where keystrokes are
going somewhere other than the prompt. **A border there is the clearest possible signal that
the reader's input has moved.**

---

## 4 · The body is bounded, always

**A 400-line result is not 400 rows.** It is eight rows and a residue line, and the reader opens
it if they care.

```
    +392 more · ⏎ to expand
```

**This is the single biggest improvement to a busy transcript** and it needs no new mechanism —
the scroll container and its residue row already do it.

**And the residue row is the existing one, not a third count string.** One mechanism for *what
is hidden*, everywhere it appears.

### Live output does not move the frame

**Streaming into a fixed-height block scrolls inside the block.** The prompt stays where it is,
the head stays where it is, and only the body moves.

**That is a bigger difference than the border**, and it is why bounded output is the default
rather than an option: a transcript that jumps while a command runs is a transcript nobody can
read during a run.

**Tail-follow is on until the reader pages up, and back on at the bottom** — the semantics
already exist one component away and want sharing rather than reinventing.

---

## 5 · States use the state kind, and nothing hand-rolls a notice

**A call can be in four states and three of them already have a kind.**

```
RUNNING      the head's spinner and elapsed; the body streams
DONE         the head's duration and outcome; the body is bounded
FAILED       the status block — the ERROR rule, the mark, the message, at the
             block's committed height
RETRYING     the same, plus the countdown and the attempt
```

**`status` is the kind and it is one implementation.** A surface that composes its own red line
of text is the defect this grammar exists to remove — **and an enforce rule should say so.**

**And a failed call keeps its head.** `⬤ pytest · 4.2s · failed` above the error box, because
*what ran* is the first thing a reader needs and the error is the second.

---

## 6 · Nesting, and the gutter is what carries it

**A call that produces calls indents by its gutter.**

```
⬤ make all
  ⎿ ⬤ check · 8.1s · ok
    ⬤ enforce · 12.4s · 324 files
    ⬤ test · 41.0s · 5127 rows
    ⬤ golden · 6.2s · 407 frames
```

**One column per level and no more.** Two levels is the working depth; **three is a signal the
composition is wrong rather than a rendering to support.**

**And a nested call's outcome rolls up.** The parent's outcome is derived from its children —
*4 of 4 ok* — rather than restated by hand.

---

## 6b · Many calls at once, and subagents

**Two different situations that look alike and are not.**

```
SEQUENTIAL      calls that happened one after another. The transcript's own order
                is the whole answer and nothing is owed
CONCURRENT      calls running at the same time — parallel tools, a fan-out, N
                subagents. The transcript's order is arbitrary and says nothing
```

**The transcript is a sequence and concurrency is not.** So a concurrent group needs a
container, and the container is the parent call's gutter.

### A fan-out is a tree, and the gutter draws it

**`⎿` is a corner, so a single child reads correctly and a set does not.** With N children the
gutter is a tree's own vocabulary — **the same `├` `└` `│` the `tree` form already draws, from
the same glyph table.**

```
⬤ search · 3 patterns · 41 matches
  ├─ ⬤ grep "elementsIn" · 6 files
  ├─ ⬤ grep "focusedEntryId" · 18 files
  └─ ⬤ grep "liveId" · 17 files
```

**`├` for every child but the last, `└` for the last.** That is the whole rule, and it does what
`⎿` cannot: **the last child is visibly last**, so a reader knows the group has ended without
counting.

**And a child with a body carries the rule down its own left edge:**

```
⬤ search · 3 patterns · 41 matches
  ├─ ⬤ grep "elementsIn" · 6 files
  │  ⎿ construct.ts:1263
  │    keys.ts:863
  │    +4 more · ⏎ to expand
  ├─ ⬤ grep "focusedEntryId" · 18 files
  └─ ⬤ grep "liveId" · 17 files
```

**`│` continues the parent's line past a child's body**, which is what stops a two-row child
looking like two children. **The body's own `⎿` sits inside it.**

**A single child keeps `⎿`** — a tree of one is a corner, and drawing `└─` for it would spend a
column saying nothing.

**Three vocabularies, one glyph table:**

```
⎿   one child, or a call's own body      the corner
├─  a child with siblings after it
└─  the last child
│   the parent's line, continued past a child's body
```

**The parent's outcome is derived** — *41 matches* is the sum, not a restatement — **and its
duration is the wall clock, not the total.** Three calls taking 2s each in parallel took 2s,
and a head reading `6.0s` would be lying about the thing a reader most wants from parallelism.

**Say that plainly**: the parent's duration is elapsed, the children's are their own, **and they
do not add up.** A reader who notices is noticing the truth.

### While they run, the children do not each stream

**N streaming bodies is N moving regions and the frame is unreadable.**

```
⬤ search · ⠋ 4s · 2 of 3
  ├─ ⬤ grep "elementsIn" · 1.2s · 6 files
  ├─ ⬤ grep "focusedEntryId" · 0.9s · 18 files
  └─ ⬤ grep "liveId" · ⠋ 4s
```

**One line per child while running — head only, no body.** A child's body appears when it
settles, bounded as always, **and only the focused child expands.**

**And the parent's head carries the count**: `2 of 3`. That is the progress a reader wants from
a fan-out, and it is the one number that is not derivable from looking.

### Subagents are a fan-out whose children are transcripts

**The difference is depth, and it is the reason for the two-level rule.**

```
⬤ 3 agents · 8m 12s · 3 of 3
  ├─ ⬤ explore the unwired seams · 2m 53s · 4 findings
  ├─ ⬤ explore the plot-arm repairs · 3m 46s · 3 corrections
  └─ ⬤ verify the refusal count · 8m 12s · 1 disproved
```

**A subagent's own calls are not drawn in the parent.** They are the subagent's transcript, and
**the parent shows what it was asked and what came back.**

**Because the alternative is a transcript of transcripts**, and three levels of gutter is a
composition problem wearing a rendering problem's clothes. **The two-level rule is what
prevents it.**

**Opening a subagent is a pushed view, not an expansion.** `⏎` on a subagent's line pushes its
transcript full-screen — **the same mechanism an attached terminal uses**, and for the same
reason: *a nested transcript is a different document, not a longer block.*

### The outcome of a fan-out where one child failed

```
⬤ search · 3.1s · 2 of 3 · 1 failed
  ├─ ⬤ grep "elementsIn" · 6 files
  ├─ ⬤ grep "focusedEntryId" · 18 files
  └─ ⬤ grep "liveId" · failed
     ⎿ ───── ERROR ─────
       ▲ pattern too long
```

**The last child's body has no `│` above it**, because nothing follows — which is the tree
saying *this is the end* twice, correctly.

**The parent says how many and how many failed.** It does not adopt the child's error — **the
error belongs to the child that produced it**, and a parent that surfaces one child's message
hides the other two.

**And a failed child keeps its head**, exactly as a failed call does, with the status block in
its own gutter.

### The ordering rule

**Children appear in the order they were STARTED and never reorder.**

**A list that resorts as results arrive is a list a reader cannot track** — they look away, look
back, and the thing they were watching has moved. **Completion is carried by the head's
duration and outcome, not by position.**

---

## 7 · The reader can act on a call

**Every call is an element**, so it can be focused, copied and acted on.

```
⏎          expand or collapse the body
y          copy — the SOURCE, never the rendering. A call copies its invocation
           and its output as text
⏎ (again)  re-run, where the entry knows its invocation and the far side permits it
⌃c         cancel, while running
```

**Copy copies the invocation with the output**, because a result without its command is
unattributable six months later — **the same argument the notebook's *keep this cell* takes.**

**And re-run is a real ruling with two named consumers** — the notebook and the agent harness
both need it, and actions are currently refused from settled entries. **That is a decision to
take deliberately rather than inherit.**

---

## 8 · Approval is a layer, not a body

**A call that needs a decision does not draw the decision in its own gutter.** It goes to the
overlay — **the same surface that carries questions, image previews and pasted content.**

```
⬤ rm -rf build/ · ⠋ waiting

    ┌────────────────────────────────────────┐
    │  rm -rf build/                         │
    │  ▲ this will delete 1,204 files        │
    │                                        │
    │  › approve                             │
    │    deny                                │
    │    always allow rm                     │
    └────────────────────────────────────────┘
```

**Because the reader is being asked, not shown.** A body is something you read at your own pace;
**a decision is something the session is stopped on**, and the two want different surfaces.

**And it is one surface for a reason**: a reader learns one place where the session asks them
something. **A question, an approval, a paste to confirm and an image to look at are the same
interruption with different content** — and drawing approvals inline would make one of the four
special for no reason a reader can see.

### The call's head says it is waiting

```
⬤ rm -rf build/ · ⠋ waiting
```

**So the transcript still shows what is happening** even when the overlay is dismissed or the
reader has scrolled away. **The call is not hidden behind the decision.**

### What the overlay carries

```
the invocation      what is about to happen, in the head's own words
the consequence     the warning, if the caller supplied one
the choices         a list, navigated and selected the way every other choice list is
```

**The choices are the overlay's existing mechanism** — same navigation, same selection, same
dismissal. **Nothing about approval is a new interaction.**

**And `always allow` is a choice like any other**, not a checkbox or a modifier. A list is what
a reader can read.

### On resolve

**The overlay closes, the head updates, and the body appears if there is one.**

```
⬤ rm -rf build/ · 0.4s · 1,204 files removed
```

**A denied call settles as denied and keeps its head** — `⬤ rm -rf build/ · denied` — because a
decision the reader made is part of the record, **and a call that vanishes when refused leaves
them wondering whether they refused it.**

## 9 · What differs between a command and a tool call

**Almost nothing, and that is the point.**

```
a command the reader typed     the head's verb is what they typed
a tool an agent invoked        the head's verb is the tool's name
a job the platform ran         the head's verb is the job kind
```

**Same head, same gutter, same bounded body, same states, same actions.** A reader who has
learnt one has learnt all three.

**The only real difference is attribution**, and the transcript already carries it: a reader's
command follows their prompt line; an agent's tool call follows the agent's text. **Nothing in
the call itself needs to say who asked for it.**

---

## 10 · Glyphs, and every one has an ASCII rung

```
⬤   the head mark          ASCII: *   — U+2B24, NOT U+23FA (emoji form)
⎿   the gutter mark        ASCII: `-
├─  a child, more follow   ASCII: |-
└─  the last child         ASCII: `-
│   the parent's line      ASCII: |
│   the left rule          ASCII: |
⚠   the warning mark       ASCII: !     — and it is ▲ in this tree, not ⚠
⠋   the spinner            ASCII: the set's own pair, matched by shape of motion
…   the truncation mark    ASCII: ~
```

**From the glyph table, never as literals**, and every one measured for ambiguous width before
it ships — **that risk has produced four defects in this project and it produces a fifth on the
next unmeasured glyph.**

---

## 11 · The rules, restated as rules

```
1   one head, one gutter, one bounded body — for every call, everywhere
2   the verb is a name, not a sentence
3   the outcome is a number, not a status word
4   the argument truncates from the tail
5   borderless by default; a border means "your keys go here now"
6   a bounded body and a residue row, always — never a poured result
7   live output scrolls inside the block and never moves the frame
8   states come from the status kind and nothing composes a notice by hand
9   a call is an element: focusable, copyable, actionable
10  copy takes the source with the invocation
11  two levels of nesting, and the parent's outcome is derived
12  every glyph from the table, with its ASCII rung
```

**The audit is reading frames.** A transcript where two calls read as different products is a
defect, **and no assertion in this repository can see it.**
