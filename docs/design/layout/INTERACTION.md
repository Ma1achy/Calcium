# Calcium — the interaction rules

**Companion to `calcium-interaction-prototype.html`, which is playable.** This file is the
rules; the prototype is the feel. **Where the prototype and this disagree, play the prototype
first** — several of these were corrected by using it.

---

## 1 · Four principles

**1 · Use the keys people already know.** Arrows move. `⏎` confirms. `esc` backs out. `⇥` moves
focus. `⇧`+arrow selects. `⌃⇧C` copies. Every GUI agrees, and a terminal app disagreeing with
all of them is a terminal app people avoid.

**2 · Scopes, not modes.** A mode is something you ENTER and forget you are in. A scope is
WHERE FOCUS IS, and focus is drawn.

**3 · No single-key commands in any scope where typing is possible.** A letter key types a
letter. This is the expensive one and it is worth it: **you can always type, from anywhere,
without checking what has focus.** It bites only at the prompt — inside a block nothing is
typed, so `1`–`9` toggling a plot's series and `r` resetting a camera are legal.

**4 · Nothing hidden.** Every key live in the current scope is in the footer's last line, and
the full set is one `?` away.

---

## 2 · The scopes

```
PROMPT      typing. The default, and where you return to
TRANSCRIPT  a block is focused
BLOCK       inside one — a table's rows, a scroller's lines, a widget's value
OVERLAY     a question. It takes everything
TAB         a parallel document — a subagent, with its own prompt and context
```

```
⇧⇥    OUT of the prompt, into the transcript — what shift-tab does in every
      form on the web
⇥     forward through the ring, and back to the prompt. In the prompt it
      COMPLETES and does nothing else
esc   out one scope: block → transcript → prompt. Always
```

**`⇥` never changes meaning.** A key that guesses what you meant is a key you cannot trust with
a half-typed path.

### Scrolling is not a scope

**`⌥↑ ⌥↓`, the wheel and the trackpad scroll WITHOUT moving focus.** The prompt keeps it and
you keep typing.

**This is the single biggest thing terminal apps get wrong.** Reading is the commonest thing
anyone does here and it should cost no mode change — every chat application works this way and
nobody has had to learn it.

`⇞ ⇟` are not on a laptop keyboard, so they are the second way in rather than the first;
`fn+↑↓` sends them. `⌘↑ ⌘↓` go to the ends, as in every text field.

---

## 3 · The keys

### Universal — the same in every scope

```
⏎          confirm · send · activate · open
⇧⏎         newline
esc        out one scope · cancel · clear
⇥ ⇧⇥       move focus forward and back
↑↓←→       move within the focused thing
⇧ + arrow  extend the selection
⌃⇧C        copy · ⌘C where the terminal passes it
⌃⇧V        paste
⌃C         interrupt — the ONE terminal meaning we keep
?          the full keymap, current scope first
```

### Ours

```
⌃⇥ ⌃⇧⇥   switch agent or watch — they are TABS, and this is what tabs use
⌘1–9     jump to one, as a browser does
⌥↑ ⌥↓    scroll a page
⌘↑ ⌘↓    top and bottom
⌥p       cycle the posture
⌥v       per-token values on the entry under the cursor
⌥⌫       drop the last queued message
⌘Z ⌘⇧Z   undo and redo IN THE LINE EDITOR — never the agent's edits
```

### What we broke, and why

```
⌥⏎ newline   →  ⇧⏎     it is what people type, and the protocol detects it
y copy       →  ⌃⇧C    a letter types a letter
G bottom     →  ⌃↓     it was never a mode
n / p        →  ↑↓     they were always arrows
⌃r search    →  ⌃⇧F    find, as everywhere else
⌃C           →  kept   the one terminal convention worth more than the GUI one
```

**`⌥←` and `⌥→` stay word-left and word-right**, because that is what they are in every text
field on the platform. Agent switching could not have them, which is why it took `⌃⇥` — and
`⌃⇥` is better anyway, because agents ARE tabs.

---

## 4 · Focus

**Focus is a WASH, and the wash shrinks as you go deeper.**

```
transcript scope   the whole ENTRY takes focusGround      you have the block
block scope        the entry drops to bgElev, the ROW     you are INSIDE it,
                   takes focusGround                       on this row
```

**It is a lightness ladder with no hue.** `bg` → `bgElev` (what you are inside) →
`focusGround` (where the cursor is). **`selection` is NOT focus** — it is what will be copied.

**Focus and selection are different questions and take different channels.** *Where you are* is
a lightness shift, because position has no colour. *What you selected* is the selection surface,
because it is about content. **Both can be true at once and read correctly.**

**The `▸` mark stays and is not redundant:** it survives 1-bit, it survives an overridden
background, and **it points** — in a four-row entry the mark says which row is the head.

### Focus on things that are not rows

```
a button    already has bgElev; focus lifts it to focusGround. A button is a
            row that happens to be short
a widget    focus the WIDGET, enter to change the VALUE. A value cannot change
            from outside — arrowing past three sliders must not move three
            sliders. The handle changes shape on entry (● → ◉)
a picture   the FRAME washes, the figure does not. A ground across braille is
            not a highlight, it is a different picture
a 3D plot   entering gives the arrows to the camera, at the orbit repeat rate
a choice    lightness and ›, and there is no INSIDE — the ladder has a floor
```

**The channel never changes; the target follows the content.**

### Focus pulls the viewport. Scrolling never moves focus.

**The two directions are not symmetric** and treating them as if they were is the commonest
scrolling bug in a TUI. Move focus past the edge → the view follows **by the minimum**. Scroll
away from focus → focus stays, and is still there when you come back.

**Focus is remembered, and restoring is a re-resolution.** Leave a table on row 14, come back on
row 14 — but resolve by id and **fall forward to the nearest survivor**, because the element may
not exist (evictions, replaced blocks, width-dependent element lists).

---

## 5 · Key repeat — ours, not the OS's

**A terminal sends no key-up**, so a held key arrives at the operating system's rate — typically
500 ms then 30 ms, and neither number is ours. **The kitty keyboard protocol sends press, repeat
and release**, so the rate becomes a decision.

```
              DAS   ARR   accelerates
type          350    35   NO — a character key that sped up would produce a
                          burst you cannot stop in time
erase         300    30   yes
row           170    25   yes — 1 → 4 → 16
page          250    90   yes
orbit           0    16   NO — a camera is analogue. It turns while held
```

**Acceleration: 1 step under a second, 4 under three, 16 beyond** — so a 10,000-row table is
crossable by holding an arrow and a 2-row one is not overshot.

**Without the protocol everything still works** at the OS's rate, with no acceleration and no
orbit-by-hold. **A capability makes things better, never possible.**

---

## 6 · The mouse

**Every gesture lands on a state a key already reaches**, so there is no second set of
behaviours to design, test or degrade.

```
click an entry           focus it — the state ↓ reaches
click the focused one    activate — the state ⏎ reaches
drag                     extend the selection — ⇧↓'s state
wheel                    scroll, and FOCUS DOES NOT MOVE
wheel inside a container that container's, because a wheel is positional
click the scrollbar      jump there — focus still does not move
click a chip or button   focus and activate in one — it is atomic
drag a slider            jump to where you clicked, then follow
drag a plot              enter it and orbit; the wheel dollies
click an agent chip      switch — the footer row is a control, not a readout
```

### Six rulings

**Click-again is a state test, not a timing one.** No double-click speed, so a slow
double-click works and there is no number to tune.

**Hover moves a plot's crosshair and nothing else.** It passes the keyboard-equal rule because
`←→` set the same store. **Leaving the area leaves the cursor where it was** — a readout that
vanished with the pointer would have no keyboard equal. **Consumed only when the sample index
changes.**

**Clicking a legend entry toggles that series.** The key equal is `↓` then `1`–`9`.

**A release does nothing.** The press did the work; every drag would otherwise end in a second
click.

**Right-click has no key equal, so it has no effect.** Same for `⌘` and `⌃` clicks — which is
also what leaves `⌘click` to the terminal.

**A click on a row that is no element is unconsumed.** That is a state the keys never produce
and the frame never highlights, so storing it would change state invisibly.

### The capture trade, declared

While the app tracks the mouse, the terminal's own selection needs a modifier. **Copy mode is
the framework's answer** — tracking off, the terminal owns the mouse — and `mouse: "off"` is a
config value.

---

## 7 · Links

**A link is atomic, so a plain click opens it. Not `⌘click`.**

A terminal needs `⌘click` because it cannot tell a link from text — it is guessing with a regex.
**This app knows exactly where its links are, so it does not have that excuse.** And `⌘click`
stays the terminal's gesture, which would fire anyway.

Links are underlined and in the identifier tone, **so you know it is a link before you click** —
which is what makes a plain click safe. Clicking the sentence around one focuses the entry.

```
⇥      links are in the focus ring
⏎      opens the focused one
⌃⇧C    copies the TARGET, not the label
```

```
parse.ts:41        an entry showing the file, at the line
https://…          the platform opener — and it ASKS first
↑ the call above   scroll to it and focus it
an agent chip      switch to that agent
```

**A link opens, reveals or navigates. It never executes** — the moment one does, every plain
click in the transcript becomes something a reader has to think about.

---

## 8 · Questions

**A question replaces the prompt.** There is no inline yes/no anywhere in this system, whoever
is asking — a tool wanting approval, a command checking a value, the app confirming a delete.

```
completion   the prompt stays, the panel grows above it, full width
search       the prompt stays, the panel grows above it
a question   the prompt is GONE — you cannot type anyway
```

**Three inherited rules:** the safe answer opens selected, `esc` resolves to it, and **the
third choice is the overflow path** — a 200-line patch does not fit above a prompt, so without
it a reader approves a change they cannot see.

**A question that wants a sentence is the prompt, relabelled.** No second editor: same history,
same paste chips, same `⇧⏎`, same `⌥←`. Only the label, what `⏎` targets, and what `esc` cancels
change.

**A question surfaces in the frame you are looking at**, labelled with who is asking. There is
one of you and three of them, and a child cannot wait for you to open it.

---

## 9 · `⌃C` means four things

```
a tool is running       cancel the tool. The turn continues
the agent is thinking   stop the turn. The partial reply STAYS
a question is open      nothing — esc answers it
the prompt has text     clear the line — the shell's meaning, kept
nothing is happening    NOTHING. It does not quit
```

**The last row is the important one.** `⌃C` twice on an idle session quits in a shell, and that
habit will kill sessions here by accident. **So it never quits**, and the footer says the way
out: `⌃C nothing to interrupt · /exit to leave`.

**`⌃C` inside a subagent cancels that agent**, not all of them and not the parent.

---

## 10 · Copy takes the source

```
the prompt, no selection   the whole line
the prompt, a selection    the selected characters
transcript scope           the focused entry, whole
block scope, one row       that row's source
block scope, a range       those rows, in order
a focused link             the target, not the label
```

**Source means the thing, never the rendering.** A table row gives tab-separated values, not
padded cells. A plot gives its data, not braille. A patch gives a unified diff. **A call gives
its invocation AND its output**, because a result without its command is unattributable.

**Which is what a raw terminal cannot offer**, and the reason element selection exists at all.

---

## 11 · Eight cases that are not edge cases

**1 · New content arrives.** At the bottom → follow. Scrolled up → **do not move**, and the
chrome counts what arrived. Navigating → **do not move**. *One of these is wrong in most
terminal apps and it is always the second.*

**2 · Typing while a question is open.** A silent no-op reads as a frozen app, so the first
non-answer keystroke puts `▲ answer this first` on the question, once.

**3 · Paste goes where typing goes.** Small → text at the caret. Large → a chip. Not focused →
focus the prompt first. **Never submitted by its own newlines.**

**4 · A grapheme is one index and two columns.** `←→` move one index and the caret jumps two.
`⌫` removes the whole cluster.

**5 · The window loses focus.** Held keys stop repeating, the cursor stops blinking, spinners
keep going — the work has not stopped. *A held arrow that keeps repeating after you alt-tab is
a scroll position you did not choose, and the release never arrives.*

**6 · A focused block is replaced or evicted.** Resolve by id, fall forward. If the whole entry
went, land on its neighbour — **being moved is survivable, being ejected is not.**

**7 · The connection drops mid-turn.** The partial reply stays. The queue is **held** and says
so — a queue that silently fired on reconnect is the worst of the three outcomes.

**8 · A resize.** Scroll by anchor, focus by id, **caret by character index rather than column**.
None of the three is a screen position. **A resize may not change the scope** — one that dumps
you back to the prompt is one that made you start again.

**The thread through all eight: nothing moves the reader without their asking, and nothing
silently does nothing.**

---

## 12 · Latency

**The coalescing window is also the input latency floor.** C03 coalesces into one frame per
100 ms, and 100 ms is the number at which a person stops believing they caused the thing.

**So input does not go through the window.** A keystroke that changes the prompt or moves focus
draws now; a stream patch, a tick and a document change take the window. **The split is
causation, not urgency** — and the cost is bounded, because a person types at ten a second and a
stream arrives at ninety.

```
echo                 ≤ 16ms     slower and typing feels laggy
a key moving focus   ≤ 50ms     slower and the arrows feel sticky
a frame              ≤ 16ms     slower and a stream stutters
a turn               no budget  the elapsed counter is the honest answer
```

**Only the first three are the framework's.** Confusing them with the fourth is how a tool ends
up feeling slow while every number in it is green.

---

## 13 · Three refusals

**No leader keys, no two-key sequences.** A sequence is a mode you are in for 400 ms without
being told, and the way you discover it is that the next key did something else. **Every binding
is one chord, so the footer can show all the live ones.**

**No chords the platform owns.** `⌥←→` is word movement, `⌘←→` is line ends, `⌘C` is the
terminal's copy, `⌃↑` is Mission Control. **Taking one wins an argument with the reader's own
machine, and the machine wins.**

**No key that only works sometimes.** If `⏎` means open, it opens in every scope that has
something to open, and it is absent from the footer where it does not. **A key that silently
does nothing in one place is worse than a key that does not exist.**

**Everything except the universal set is rebindable.** `⏎`, `esc`, `⇥`, the arrows and `⌃C` are
structural — rebinding them breaks the scope ladder itself. **A conflict is answered before it
is written**, not discovered when the old binding stops working.

---

## 14 · There are no pushed views

**A pushed view takes the screen, you do something, you come back — and the transcript has a
hole where that work was.**

```
THE TRANSCRIPT   everything that happened. Work belongs in it
AN OVERLAY       a question. It interrupts, is answered, is gone
A TAB            a parallel document with its own prompt and its own context
```

```
a run's detail    EXPANDS IN PLACE
logs              A BLOCK with follow
the help view     AN ENTRY — ? emits the keymap into the scrollback
an attached PTY   A MODE of its block; the transcript stays above it
a subagent        A TAB, which it already was
```

**The test: does it have its own prompt and its own context?** Yes → a tab. No → a block, an
entry, or a question.

**The MECHANISM still exists, and that is not a contradiction.** C15 carries
`kind: "overlay" | "view" | "peek"` with `placement: "fill"` for views, and `LAYOUT_ENGINE.md` §10
composes them: **a ring of tabs, a stack of views within a tab, layers within a frame.** This
section rules on *usage* — content that belongs in the record must not leave it — not on whether
a page can exist. **If nothing but a subagent ever passes the test, each tab's frame stack has one
member and costs nothing**, which is the right outcome rather than a wasted mechanism.

---

## 15 · The state tables

**Fourteen components, seven facts each, in the HTML.** Prose said all of this; a table makes a
**missing cell visible**, which is the failure this document kept finding — a rule stated in one
section and quietly unstated in the next.

```
ENTRY        what puts it on screen
CARRIERS     what says what it is — and there are always two
ACTIONS      what a key or a click does to it
ESC          where esc lands, by the published order
MOTION OFF   its form with no animation at all
1-BIT        its form with no colour at all
RESIDUE      what is left once it settles
```

**Five cells were blank until the table existed**, and each was a real hole:

**A streaming reply's MOTION OFF form.** The trail and the bloom are both motion, and with both
gone nothing said the reply was still arriving. The elapsed counter had to be promoted — which is
why **every live thing shows an elapsed count** is now a rule rather than an accident.

**A watch's RESIDUE.** It drops itself, so being away meant it vanished with no trace. That is
what put watched-run completion on the notification ladder.

**A table's RESIDUE had to say its sort.** Once sorted, the rows are not in the document's order,
and a reader who scrolled past the header has no way to know.

**A plot's 1-BIT form** could not use colour to separate series, and nothing said what did. The
legend's *marks* do — **which means a plot with more series than marks cannot degrade**, and that
is a limit the plot arm should enforce.

**An attached PTY's ESC belongs to the CHILD.** Every other row says esc is ours; this one cannot
be, so it needs its own chord (`⌥esc`) and the footer has to say so. **Without the table, that
cell was simply never asked.**

---

## 16 · Reconciling with C16 and C26

**The specs are the authority on MECHANISM. This file is the authority on SHAPE.** A binding is
a shape; the store it writes is a mechanism. Eight chords moved and **not one changed what a key
does.**

**What this adds that the specs have no row for:** `focusGround`, `keyboardProtocol` as C02's
tenth capability (it is *unconsidered* there, not deferred), per-binding repeat, and the
scope footer.

**What the specs got right and this imported unchanged:** click-again as a state test, focus
memory falling forward, the hover crosshair, a release doing nothing, right-click having no
effect, a non-element click being unconsumed, a selection not straddling entries, and the wheel
acting on the box under the pointer.

### When they conflict

```
a CHORD conflict      this file wins; the spec's row is updated
a MECHANISM conflict  the spec wins; this file is wrong
a RULE conflict       neither wins. Find the rule's reason and check whether
                      it reaches the case
```

**The third is the common one**, which is why a rule without its reason beside it is a rule
that will be applied somewhere it does not belong.
