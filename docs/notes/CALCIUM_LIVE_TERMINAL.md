# Live terminal blocks — a running process inside the transcript

**Not scheduled. A design note**, because this is larger than any other item on the current
lists and its shape is decided by one question that has a measurable answer.

```
❯ can you run the unit tests please?

⬤ Sure, let me run the unit tests.

⬤ pytest
  ⎿ ┌───────────────────────────────────────────────────┐
    │ ============== test session starts ============== │
    │ ............................................ [2%] │
    │ ...............ssss..........................[4%] │
    │ .............................                     │
    └───────────────────────────────────────────────────┘
    ⏎ to attach · ⌃c to cancel

─────────────────────────────────────────────────────────────
❯ ▌
```

**Today a subprocess's output is captured and rendered as `logs`.** This is different in kind:
the process gets a **real terminal**, so it draws progress bars, moves its cursor, clears
lines and repaints — and the reader can **type into it**.

---

## 1 · What is new, and what is not

**Already built:**

```
node-pty                 in the tree — the e2e suite spawns PTYs today
the scroll container     a bounded region with a residue row, per-container offset
C26's focus model        elements, focus moving into a block
A01 D4                   a live block binds letters once focus is inside it
⌃c cancels               entry 33's ruling: one press stops everything
the queue                a submission while something runs
```

**Genuinely new, and one of them is a component:**

```
A TERMINAL EMULATOR      the hard part. See §2
input capture as a mode  every keystroke to the child, including the ones Calcium binds
SIGWINCH on resize       the child's idea of its size must track the block's
what a SETTLED block keeps   the final screen, or the scrollback — they differ
```

---

## 2 · The emulator — and this is the decision the rest hangs on

**A block cannot pass the child's bytes through.** `pytest`'s `\r` and `\x1b[K` would reach the
outer terminal and corrupt the frame around it. **The child's escapes must be interpreted into
a screen buffer, which Calcium then renders as cells** — which is what `tmux` does and is why
`tmux` contains a terminal emulator.

**So the block holds emulator state**: a grid of cells with attributes, a cursor, a scroll
region, a mode set, and a scrollback ring.

**Three ways to get one, and the middle is probably right:**

```
WRITE ONE            a vt100/xterm parser. Real work — the CSI/OSC/DCS grammar, the
                     mode set, wide characters, and the long tail of programs that
                     rely on quirks. NOT a weekend
A HEADLESS LIBRARY   @xterm/headless is xterm.js without the DOM — a real emulator,
                     maintained, and it exposes a buffer. MEASURE its weight and
                     whether the buffer API gives cells with attributes
CONSTRAIN THE CHILD  refuse the alt screen, handle only \r \n \b and SGR. Covers
                     pytest, npm, cargo, make — and NOT vim, htop, less
```

**The third is genuinely worth considering as a first version.** The named consumers — a test
run, a build, a training job — are all line-oriented programs that never enter the alt screen.
**`TERM=dumb` even tells them to behave**, and the ones that ignore it mostly still do.

**And it has an honest boundary**: `⏎ to attach` on a program that would need a full emulator
is refused with a message, rather than rendering it wrongly.

**Measure before choosing.** `@xterm/headless`'s installed weight and buffer API decide whether
the full version is a dependency or a project — and this project's last five dependency
decisions were settled by measurement.

---

## 3 · Scrollback against the alt screen — and the emulator already knows which

**Two kinds of program and they want opposite renderings:**

```
LINE-ORIENTED     pytest, npm, cargo, make. Output accumulates; the box shows the
                  LAST N lines and the reader scrolls back through the rest
FULL-SCREEN       vim, htop, less. The program owns the screen; the box shows
                  EXACTLY the emulator's grid and there is no scrollback to have
```

**The signal is free: entering the alt screen is `\x1b[?1049h`.** A program that sends it is
declaring which kind it is, **so the block switches rendering on the escape rather than on a
guess or a field.**

**And the two have different scroll semantics**, which is the finding:

```
line-oriented     the scroll container's offset, over the scrollback ring — and
                  it is the SAME mechanism entry 46 already built
full-screen       no offset. The grid IS the content and scrolling it is meaningless
```

**So a line-oriented terminal block is a `scroll` container whose content happens to be
emulator output**, and the whole of 46 — the offset store, the residue row, the cache axis —
applies unchanged.

---

## 4 · Attaching — a pushed view, and it collapses most of the problem

**★ CORRECTION to this section's first draft.** It designed attach as *input capture inside
the block*, with a detach key and a mode. **That was wrong and the right answer already
ships: attach is a `pushedView` push, and detach is a pop.**

`pushedView` is fullscreen, has its own bindings, sits on its own focus rung, and
`activeTarget` returns it **before any element check** — so a pushed view already captures
every key by construction. **No new mode, no detach key stolen from the child, no capture
rule to invent.**

### What the push answers for free

```
two cursors on screen        gone — the prompt is not drawn in a pushed view
attaching to a block that     gone — the view IS the screen, so there is nothing
has scrolled out of view      to scroll into
copy semantics inside the     the view's question, not the transcript's
terminal
a failed attach              the push refuses and the reader stays where they were
```

**And the size problem inverts into the reason the view exists.** A 6-row block cannot host
`vim`; **a fullscreen view can.** So the alt-screen case stops being refused — the PTY gets
the whole terminal, `TIOCSWINSZ` is the frame's size, and a full emulator has somewhere to
put its grid.

### Which changes the build's shape

**The inline block and the attached view are TWO RENDERINGS OF ONE EMULATOR STATE**, not one
thing that grows into the other. The block shows a bounded window over the scrollback; the
view shows the grid. **Neither is a special case of the other, and the emulator is the shared
part** — a cleaner split than treating the block as the primary and the view as an escape
hatch.

### The three that the push does NOT answer

## 4a · A second command settles while you are attached

**The transcript changes under the reader while they are elsewhere**, and popping back to a
different transcript with no explanation is the surprise.

**RULED: a what-changed line on detach, and nothing while attached.**

```
detached back to the transcript
  ⬤ 2 entries settled while attached · pytest · 47 passed
```

**No notification while in the view.** That is an interruption in someone else's terminal, and
**it would corrupt a full-screen child's frame** — an overlay drawn over `vim` is a defect,
not a courtesy.

**And it composes with a ruling that exists.** Entry 33's queue means submissions accumulate
while something runs; this is the same *you missed things* problem with a different cause,
**and it should say so the same way** rather than inventing a second vocabulary for it.

## 4b · `⌃c` goes to the child. Always. No exception.

**RULED, and the alternative is worse.** A `⌃c` that sometimes cancels the queue and sometimes
reaches the process is a `⌃c` nobody can predict — **and the one thing every reader knows
about an attached terminal is that `⌃c` interrupts what is running.**

```
in the transcript      ⌃c stops everything — entry 33's rule, UNCHANGED and now SCOPED
in the attached view   ⌃c goes to the child. To cancel the queue: detach first
```

**The footer says exactly that**, so the scoping is told rather than discovered. **Entry 33's
ruling is not weakened — it is given a boundary it did not previously need.**

## 4c · Escapes — honour in the view, absorb in the block, and two are never forwarded

**RULED by where the child is:**

```
IN THE VIEW      the child owns the terminal. Mouse tracking, bracketed paste,
                 cursor shape, scroll regions — all pass through. It owns the
                 screen; let it
IN THE BLOCK     the child owns nothing. Every escape is absorbed into emulator
                 state and none reaches the outer terminal
```

**Mouse tracking in a bounded block is refused outright.** The outer hit test owns the mouse,
and two consumers of one event is the two-answers class this project has now caught five
times. **A child that requests it in a block gets no mouse events and the block says so on
attach.**

### Two that are never forwarded, in either place

**The bell.** **A background block ringing the terminal because a build finished is a
notification the reader did not ask for** — and the activity region is the right surface for
*something happened*. Absorbed, always.

**The title.** **The outer app owns its title.** A child renaming the reader's window from
inside a block is the same class as a nested Calcium: it works, and the failure modes are
absurd. Absorbed, always.

### And the rule for everything else

**An escape the emulator does not understand is DROPPED, not passed through.**

**Passing an unknown sequence to the outer terminal is how a block corrupts the frame around
it** — and *unknown* is most of the long tail. A parser that forwards what it cannot parse is
a parser that has given up on containment, which is the whole reason the emulator exists.

**Stated as an invariant**, because the tempting implementation is a passthrough default and
it is wrong in a way that only shows on the twentieth program.

---

## 5 · Resize

**The child's `TIOCSWINSZ` must track the block's inner width**, or a program that wraps at 80
will wrap wrongly in a 60-cell box.

```
block width changes    → set the PTY size → the kernel sends SIGWINCH → the child repaints
```

**And a repaint invalidates the block**, which is the same `rev` bump every live block already
does. **No new mechanism, and one real hazard**: a resize storm during a window drag sends a
SIGWINCH per frame, and some programs repaint expensively. **Coalesce on the frame scheduler's
window**, which already coalesces everything else.

**The block's height is declared** — C04's contract — so the PTY's row count is the block's
declared inner height and never derived from the child.

---

## 6 · What a settled block keeps, and the two answers differ

**When the process exits, the entry settles. To what?**

```
THE FINAL SCREEN     what the program last drew. For pytest that is the summary
                     line — correct and tiny
THE SCROLLBACK       everything it printed. For pytest that is every test —
                     correct and long
```

**They are different artefacts and the reader wants different ones on different days.**

**The ruling worth taking**: a settled line-oriented block keeps **the scrollback, windowed by
the scroll container**, because that is what the reader would have scrolled to see. A settled
full-screen block keeps **the final screen**, because it has no scrollback and the last frame
is what the program left behind.

**And that is the alt-screen signal again**, deciding a second thing — which is the argument
for reading it rather than adding a field.

**Persistence (44) then has a size question**: a settled terminal block's scrollback may be
megabytes. **Cap it, and say so in the residue row** — `+ 12,481 lines dropped at the session
cap` is D40's existing shape.

---

## 6b · What it does to the transcript's appearance — and it is most of the value

**A tool call's output is undifferentiated text today.** Ten commands is ten runs of prose you
have to read to find the boundaries of. **Ten bounded blocks is a shape you can skim**, and the
one still running is the one with a border and no result line.

**Three things it fixes, and the third is the quality-of-life win:**

**Scannability.** The eye finds a command's start and end without reading either. **A
transcript becomes a list of things that happened** rather than a wall.

**Bounded height by default.** A `pytest` run that prints 400 lines *is* 400 lines of
scrollback today. **In a bounded block it is 8 rows and `+392 more`** — and the reader opens
it if they care. **This is the single biggest improvement to a busy transcript** and it needs
no emulator at all: entry 46's container does it.

**And live output stops the frame jumping.** Streaming output currently pushes everything
upward as it arrives. **In a fixed-height block the frame does not move** — the content
scrolls inside it and the prompt stays where it is. That is why Warp's blocks feel different
from a plain terminal, and it is a bigger difference than the border is.

### The chrome, and it is the `⬤`/`⎿` grammar with a bounded region under it

```
⬤ pytest · 4.2s · 47 passed
  ⎿ ┌───────────────────────────────────────────────────┐
    │ ============== test session starts ============== │
    │ ............................................ [2%] │
    └───────────────────────────────────────────────────┘
      +392 more · ⏎ to attach
```

**A bordered box with no header is just a box.** The header is what makes the skim work —
the verb, the elapsed time, the outcome — and `AGENT_TUI_DESIGN.md` already rules that
grammar. **So this is not new chrome; it is the existing grammar with a bounded region
underneath instead of free-flowing text.**

### Borderless is the default, and the border is the option

**A border costs two columns and two rows per block.** Three tool calls on a 24-row terminal
is six rows of chrome, which is a quarter of the screen spent on lines.

**`⎿` plus a left rule costs one column and no rows:**

```
⬤ pytest · 4.2s · 47 passed
  ⎿ ============== test session starts ==============
    ............................................ [2%]
    +392 more · ⏎ to attach
```

**Same bound, same residue, same attach affordance, no chrome.** The border is worth having
as a style for the case where a block needs to stand out — a failure, an attached session —
and **`plotFrame`'s ruling applies unchanged: ship both, default to the cheap one.**

**And the attached state should look different**, because it is the one moment when
keystrokes are going somewhere other than the prompt. **A border on attach is the clearest
possible signal** and it costs nothing when detached.

---

## 7 · Why it matters for the three named consumers

**The agent harness.** An agent runs a command; today the reader sees captured output after
the fact. **With this, the reader watches it happen and can intervene** — attach, answer a
prompt, cancel. `AGENT_TUI_DESIGN.md`'s approval model becomes *approve, then watch, then
attach if it goes wrong.*

**The Prism CLI.** A training job's live logs are the case, and today they are `logs`. **A
terminal block means a job that asks a question can be answered** rather than timing out.

**The notebook.** This is the biggest one: **a cell whose output is a live terminal is a cell
that runs an interactive process.** The notebook idea's open question was *where does code
run*, and a terminal block does not answer it — but it does mean a cell can hold a REPL, a
debugger or a shell, and **the transcript keeps the session rather than a transcript of it.**

---

## 8 · What to refuse

```
nested Calcium         a Calcium app inside a Calcium terminal block. It would work
                       and the failure modes are absurd
mouse passthrough      a child that wants mouse events competes with the outer app's
                       hit test. Refuse it and say so
the alt screen in the  a full-screen program in a 6-row box is unusable. Either the
first version          block declares enough rows or attaching is refused
unbounded scrollback   a cap, with a residue row, on D40's existing shape
```

---

## 9 · Build order

```
1   MEASURE the emulator options — @xterm/headless's weight and buffer API, against
    writing a constrained parser. This decides everything below
2   the constrained parser — \r \n \b and SGR only, no alt screen. Covers pytest,
    npm, cargo, make, and the named consumers
3   the block: a scroll container whose content is the emulator's scrollback,
    with the offset, residue and cache axis all inherited from 46
4   SIGWINCH on resize, coalesced on the frame scheduler
5   the settled ruling — scrollback for line-oriented, final screen for alt
6   ATTACHING: input capture, the detach key, the footer line, and ⌃c's split
7   the alt screen, if step 1 said a full emulator is affordable
8   the catalogue and the goldens — and a golden of a LIVE block is a frame at a
    known point in a deterministic script, which needs the script to be deterministic
```

**Step 3 ships something useful without step 6.** A live, scrollable, correctly-rendered
command output block is worth having even if nobody can ever type into it — **which is the
test of whether the order is right.**

---

## 10 · The one that decides it

**Whether the emulator is a dependency or a project.**

**If `@xterm/headless` is small and its buffer API gives cells with attributes**, this is
composition — a PTY, an emulator, and a scroll container, all of which exist or ship.

**If it is not**, the constrained parser is a real first version and the full one is a
separate decision. **Either way step 2 is worth building**, because the named consumers are
all line-oriented and `TERM=dumb` is a lever this project already knows how to pull.
