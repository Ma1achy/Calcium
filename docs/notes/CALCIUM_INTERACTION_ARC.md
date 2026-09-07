> **Reconciled against HEAD, 2026-09-06, at `10ed2733` on `feat/plot-arm-unification`** — from the
> substrate-arc drop (`README_SUBSTRATE_ARC.md`). The text below is the drop's, unchanged; this
> preface is what the tree says where the note and the tree differ. A `file:line` is where the
> symbol was on the day — grep the symbol.
>
> **Status: landed, 2026-09-03 → 2026-09-05, in seven rounds of rulings** (`1e7c325c` … `98abe25d`):
> the mouse carrying every bit (C16 I30), `entryAtRow`, selection and copy mode (`⌃a`, Esc), the
> keyboard protocol with kitty under Xvfb as the fixture, `Scroll.follow`, the peek, the running card,
> and the call grammar as step 6. **§0's premise moved before this note was read**: the live-entry
> ceiling landed on 2026-09-03 and the record did not catch up — read §0 as the state it corrected,
> not the state at HEAD. `CALCIUM_NOTE_AUDIT.md` §Arcs row 6 records the three ceilings and which
> two landed.
>
> | the note says | the tree, measured |
> |---|---|
> | §0, *`elementsIn` has exactly one caller and it reads `liveId`*; *exactly one kind declares `elements`* | five kinds declare `elements` (`table`, `pills`, `scroll`, `mosaic`, `plot`) and the `step` notice is a sixth (C09 I47); `elementsOf(entryId)` reaches every entry, `tab`/`⇧tab` between them (C26 I19, I21) |
> | §6, `⏺ pytest · 4.2s · 47 passed` | `⬤` U+2B24 — `⏺` U+23FA has an emoji presentation form (F823); the row is otherwise the shipped shape |
> | §6, `+392 more · ⏎ to attach` | `⋯ +392 more` — no key name in the row (C16 I19, C04 I104); attach is the live terminal's and is a `pushedView`, not this residue |
> | §6, *a border earns its place on an attached session* | upheld and out of scope: no attach mechanism in `src/` (call-grammar plan, out of scope) |

# The interaction arc — a GUI's model in a terminal, then a consistent surface on top of it

**Direction, not a task list. Sequence it yourself.**

The plot system, the block library, the transcript, the viewport, the theme and the enforcement
suite are built and gated. **What is not built is a coherent way to touch any of it.**

Today the interaction model is a prompt with a transcript above it. **Everything else — focus,
selection, copy, the mouse, a plot's readout, a button — is either absent, table-only, or
reachable exclusively inside the live entry.** That is not a terminal's limitation; it is a gap
in this framework, and the gap has a measured ceiling.

**The standard to hold this to is an ordinary GUI**, and for the agent surface specifically,
Claude Code. **Consistency is the whole requirement**: the same key does the same thing
everywhere, every mouse gesture has a keyboard equal, every element can be reached, and a tool
call looks like a tool call wherever it appears.

---

## 0 · The ceiling, and nothing else can be built until it moves

`elementsIn` has **exactly one caller**, and it reads `liveId`. **So no element outside the live
entry can be focused at all.**

**And exactly one kind declares `elements`** — `table`. Navigation is table-only in practice,
and the seam has been exercised by its author and nobody else.

**Every item below is unreachable until both change.** A cursor that moves through the
transcript, a selection spanning entries, a clickable button in a settled block, a plot's
readout — **all of them are elements outside the live entry.**

**This is the first thing built and it is the arc's real design work.** Widen the walk; make
every kind that has addressable parts declare them; and expect the focus model to need a real
ruling rather than a wider grep, because C26 was written when the answer was *the live entry*.

---

## 1 · The keyboard, properly — and it needs a capability

**Terminals do not send key-up events.** So auto-repeat rate and delay are the operating
system's, the app sees indistinguishable presses, and `Esc` versus `Alt` is ambiguous by
timing. **A framework cannot implement ARR/DAS on that.**

**The kitty keyboard protocol sends press, repeat and release**, with unambiguous modifiers and
disambiguated escapes. Ghostty, kitty, WezTerm and foot support it.

```
detected            like imageProtocol, from the terminal
declared            like ambiguousWidth, because detection is imperfect
a ladder            with it: the app owns repeat, sees ⇧ alone, and Esc is not a prefix
                    without it: the OS owns repeat, and every affordance still works
```

**The ladder is the requirement, not the protocol.** Nothing may be reachable only with it —
**it makes interaction better, never possible.**

**And this is `imageProtocol`'s pattern exactly**, including its lesson: the arm shipped once
and had never run, because every assertion was structural. **Measure it against a real terminal
before believing it.**

---

## 2 · One cursor, and it moves through the document

**Not a per-entry focus.** A single position that traverses the transcript — entry to entry,
block to block, element to element — the way a caret traverses a document.

```
↑ ↓ ← →      move by element, and the viewport follows — C14's anchor rule
tab          move by block, or by interactive element, and RULE WHICH
⇞ ⇟ home end pages and ends, and they already have bindings that mean something else
             in the transcript. The collision is real and it is a ruling
```

**And a focused element outside the window is legal** — scrolling away does not move the
cursor, and the next move brings the view back. *Focus is where you are; the window is where
you are looking.*

**The camera's store is the proven shape** for anything the cursor needs to carry: a store, a
binding, a render-key axis, with the key axis and its writer landing together.

---

## 3 · Selection is a set of elements, not a character range

**This is already ruled and the ruling is the design.** `copyElement` copies **the element's
source, never its rendering** — so a selection is *which elements*, and copying is *ask each for
its text.*

```
a plot          copies its data
a table row     copies its values
a code block    copies its source, not its highlighted rendering
a chip          copies its content, not its label
a terminal      copies the emulator's text, not its cells
```

**Which makes three hard things fall out rather than needing work:**

**Selection across a scroll container** — the elements are addressable whether or not they are
on screen, and copying past a boundary takes what the box hides. **Already ruled: truncating at
the window would make copy depend on scroll position.**

**Selection across entries** — an entry boundary is not special once the cursor is not
per-entry.

**And *select all* means something** — every element in the entry, or in the transcript, asked
for its source.

**Say plainly what it does NOT do**: this is not the terminal's own text selection. **A reader
dragging with the terminal's native selection still gets cells**, and the two coexist. Some
terminals need a modifier to reach the native one when the app is capturing the mouse; **that
is worth documenting rather than fighting.**

---

## 4 · The mouse, and every gesture has a keyboard equal

**C02's rule is what keeps this one system rather than two.** *Every mouse affordance has a
keyboard equivalent* — so the mouse is a faster way to reach a state, **never the only way.**

```
click               focus that element — the same state ↓ reaches
click again /
double-click        activate it — the same state ⏎ reaches
drag                extend the selection — the same state ⇧↓ reaches
wheel               scroll the container under the pointer — ⇞ ⇟ reach it
hover               a readout or a tooltip — WHICH THE CURSOR ALSO SETS
```

**Hover is the one to get right and the plot already ruled it.** The readout is a **crosshair
position**, and the pointer is one way to set it. **A tooltip that only appears under a pointer
has no keyboard equal and fails the rule** — so a tooltip is *the focused element's detail*,
shown whether focus arrived by key or by click.

**The hit test resolves layers by `Placed` already**, so this is wiring more than mechanism.

**And mouse capture has a cost worth stating**: while the app captures the mouse, the terminal's
own selection needs a modifier. **That is a real trade and it should be a declared setting, not
a silent one.**

---

## 5 · The affordances, once 0–4 exist

```
buttons             a focusable element that activates. In a notice, in a block,
                    in a footer
tooltips            the focused element's detail, on a delay for the pointer and
                    immediately for the keyboard
the plot readout    the crosshair, the live legend, the highlighted series — designed
                    and unbuilt
widgets             sliders, toggles, series toggles, and the declarative binding that
                    lets an agent ship an interactive plot with no app code.
                    ALL OF THEM ARE ELEMENTS, so §0 is their prerequisite
the attached
terminal            a PTY block, attach as a pushed view, ⌃c to the child
```

**Widgets are designed and the design predates §0's measurement.** Check it against the ceiling
before building — **a note describing widgets as focusable was written when that was not
possible.**

---

## 6 · Then the surface — and consistency is the whole standard

**Once things can be touched, they have to look like one product.**

### Tool calls

**The machinery is there and the appearance is not.** Bounded output is the scroll container; a
400-line result in an 8-row block with `+392 more` already works. **What is missing is the
grammar that makes a transcript skimmable:**

```
⏺ pytest · 4.2s · 47 passed
  ⎿ ============== test session starts ==============
    ............................................ [2%]
    +392 more · ⏎ to attach
```

**A header that says what ran, how long it took and how it ended. A continuation mark that says
this belongs to the line above.** `AGENT_TUI_DESIGN.md` rules the grammar and the design carries
step 0's four corrections beside their originals.

**Borderless by default** — `⎿` plus a left rule costs one column and no rows, where a box costs
two of each. **The border earns its place on an attached session**, where keystrokes are going
somewhere other than the prompt.

**And live output must not move the frame.** Streaming into a fixed-height block scrolls inside
it; the prompt stays where it is. **That is a bigger difference than the border.**

### Everything else

```
one grammar for state       error · loading · retrying already share a kind. Every
                            surface uses it and nothing hand-rolls a notice
one grammar for chrome      a header, a continuation, a residue row, a count. The
                            same shapes everywhere they appear
one answer per key          ⏎, Esc, ⌃c, tab and the arrows mean one thing per scope,
                            and the scopes are a ladder rather than a set of
                            exceptions
one layout vocabulary       group · mosaic · scroll · panel, and a form picks among
                            them rather than inventing a fifth
```

**The audit is: read the frames, and anything that reads as a different product is a defect.**
The comparison catalogue is the instrument — it exists for the plot arms and the same shape
serves here.

---

## What this arc is not

**Not the agent-tui app.** That is a consumer and it comes after — but **it is the thing this
arc is for**, and *make it consistent, like Claude Code* is the standard.

**Not new blocks.** Every kind that exists gets reachable; none is added.

**And not a redesign of anything that ships.** The terminal's current frames are the baseline
and a moved one is a finding.

---

## How to work

**Keep the gates.** `make all` per target, exits read directly, anchors before mutations, read
every diff, read every moved frame as a picture.

**Drop the per-step ceremony where it does not earn its weight.** A walk artefact for every
small repair is what let the last residue accumulate between the steps.

**Measure before ruling and report what you measured.** A finding with a number survives being
re-read; one with an argument gets re-litigated.

**And the specific failures this campaign kept producing, so they are not produced again:**

```
containment is not correctness       a row asserting ink is inside the area is
                                     satisfied by every wrong answer that is also inside
conservation is not attribution      counts that balance are satisfied by moving a
                                     thing from one place to another
a consequence is reachable           the rows that survive assert the mechanism
by other mechanisms
a fixture that cannot construct      every slope series had two values, so "first and
its own subject tests nothing        last" was the identity
a cost argument is not a fit         four refusals were reversed this campaign and all
argument                             four read as considered
check the mechanism exists           the pinwheel, the selection readout, rampFor —
before building against it           each read as a reference and existed nowhere
```

**And read the frame.** Nine of eleven 3D steps corrected something the design asserted, and
**every one of those corrections came from a picture rather than from a number.**
