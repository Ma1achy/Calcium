# Selection and copy — the design

Roadmap entry 15. The artefacts are `C16 §5a` (classification table), `C16 §5b`
(sequence trace) and `C17 §5a` (the clipboard ruling); this document does not
restate them, it builds on what they settled.

**Status: designed, not built.** Four steps, and step 0 exists because a
measurement taken during this design found a defect in shipped code.

---

## 1. The shape, which A5 changed

The entry said *three scopes, one mechanism*. The classification table put all
three at rest against one key and the count was wrong:

- **The prompt** has a selection: a character range over C17's buffer.
- **The transcript** has a selection: a set of elements, which C26's `elements`
  already addresses.
- **Copy mode has none, deliberately.** It is the mode in which the app stops
  reading the selection because the terminal is doing it. That is not a third
  scope to build — it is a scope removed.

**So the shared mechanism is not the region. It is where the text lands**, and
that is one clipboard: C17's kill buffer, ruled in C17 §5a.

This is what reduces the entry. There is no abstract `Selection` type spanning
three consumers, because the two real ones have nothing in common but their
destination — a character range and a set of element addresses do not unify into
anything a caller wants. **Two selection types and one clipboard**, and the
clipboard is the seam.

---

## 2. Step 0 — the decoder, before any binding

**Not in the original order, and it is here because the measurement moved it.**
Four bindings were checked through the built decoder before being designed
against. Two survived, two did not, and one of the failures was a defect rather
than a collision.

| binding | verdict |
|---|---|
| `⌥a` select all | **clear** — `m+a`, and `a` is free on the meta path |
| `⇧←` `⇧→` extend by character | **clear** — `s+left`, `s+right` |
| `⌥⇧←` `⌥⇧→` extend by word | **blocked by a decoder defect**, see below |
| `⇧⌃a` `⇧⌃e` extend to line start/end | **dead** — Ctrl-Shift-letter is the same `0x01` that killed `⌃⇧a`, and `⌃a` is bound to `home` |
| `⇧Home` `⇧End` extend to line start/end | **clear** — `s+home`, `s+end`, and the replacement for the row above |

**The defect** is recorded in full at C16 §2: `modifiersOf` reads three of
xterm's four modifier bits and never bit 8, so `CSI 1;10D` — Meta-Shift-Left —
decodes as `s+left`. Not a missing key: **a different, live key.** On a terminal
sending Meta rather than Alt, extend-by-word would extend by character and every
test about `⇧←` would pass while it happened.

One line to fix, and it lands first. With it absent the two wire forms of one
binding disagree about which binding was pressed, and no test above the decoder
can see it.

**Four bindings lost to this check across the project now** — `⌃_`, `⌃⇧a`,
`⇧⌃a`, `⇧⌃e` — all before anything was built, and one decoder defect found by
running it against keys that did not exist yet.

---

## 3. Step 1 — copy mode reachable and leavable

**One commit, and B1 is why the parts cannot be split.** `session.ts:547–548`
holds two stubs. A producer without an exit gives the reader a mode that consumes
`⌃c` and does not end — the rung is already registered at `router.ts:215` and
already calls the stub.

Four pieces, together:

- **The producer.** Real state behind `copyMode: () => boolean`, owned by L4
  beside the other frame queries.
- **The exit.** `exitCopyMode` clears it. The `⌃c` rung needs no change.
- **A binding to enter.** Not designed here — it wants the rebindable-keys row
  and one free key, and it is the smallest open piece.
- **The chrome indicator.** The mode belongs on screen exactly as `NAV`/`EDIT`
  does. A mode with no indicator is a reader wondering why the mouse stopped
  working.

### The mouse toggle is added here, with its own reason

`MOUSE` is a single mode string (`escapes.ts:37`) and `mouseEnabled()` reads
capabilities. Copy mode does not inherit a toggle; it **adds** one, and the
reason is the whole feature: with tracking on, the terminal's native selection is
unavailable in the alternate screen.

The toggle is `terminal/escapes.ts`'s to express and `terminal/lifecycle.ts`'s to
apply — nowhere else writes an escape sequence. `mouseEnabled()` keeps reading
capabilities and gains no copy-mode arm: **a capability and a mode are different
questions**, and folding them would make one predicate answer both.

### B4's ruling — output arriving under a native selection

**The trace's open question, ruled here rather than left.** In copy mode the
terminal owns a selection over painted cells. If the app keeps painting, the
selection silently comes to cover different text — the exact failure the feature
exists to prevent.

**Ruling: copy mode suspends frame commits. It does not pause data.**

Nothing is dropped and nothing accumulates unboundedly: C13 keeps appending under
its own eviction rules, and exiting composes one frame that catches up. The
reader gets a stable screen, which is the only thing a native selection can be
taken against.

**Why not I46's pause**, which was the obvious reuse. C23 I46 pauses *sources*
when no visible host refers to them, and its semantics fit — *paused means no
fetch, no derivation, no render and no patch, and on return the source is due
immediately.* But its predicate is per-host visibility, and copy mode is global;
more importantly **it reaches polled parts and not a live stream.** A verb
streaming output is C23's transport pushing patches, not a poller, and that is
precisely the case a reader most wants to copy from. A pause that covers half the
sources would be correct about the half it covers and wrong about the screen.

**Suspending the commit covers both**, because every path to the screen goes
through one scheduler.

### The seam this needs, and the alternative refused

`FrameScheduler` has `commit`, `flush`, `invalidate`, `pending`, `contaminated`
and no way to be suspended. Two candidates:

1. **`suspend()` / `resume()` on `FrameScheduler`.** A new member on an L0
   published interface, and freeze-relevant.
2. **A no-op `render` callback** while copy mode is up — zero new surface, since
   `render` is injected by L4 already.

**(1), and the argument against (2) is that it lies to the scheduler.** A `render`
that returns without composing leaves `pending` and `contaminated` describing a
screen that was never written, so the scheduler's own state stops being about the
terminal. Suspension is a state it can reason about; a silent no-op is a state it
cannot see. That is the same reason C15's `kind === "view"` was replaced by the
property rather than a proxy for it (C16 I8).

**Owed before code:** what `flush()` means while suspended, and whether a resize
overrides suspension. A resize probably must — a wrapped line corrupts the
alternate screen, which is the one failure the application can no longer see.

---

## 4. Step 2 — the prompt's selection range

**The entry's real size**, and it is C17's alone.

C17 has no anchor, no mark, no region. A selection model is:

- **An anchor and a head**, both buffer offsets in C17's existing coordinate
  system. The region is the span between them; equal offsets is no selection.
- **Every motion gains a shifted variant** that moves the head and leaves the
  anchor. The unshifted motions all exist, so each shifted form is *move, and do
  not move the anchor* — not a second implementation.
- **Typing replaces the region**, as one undo unit. So does a paste.
- **An unshifted motion collapses the selection**, which is what makes the model
  invisible when nobody is using it.
- **Select-all is the degenerate case** — anchor at 0, head at the end — which is
  why it cannot ship alone without building the model for one binding and then
  generalising it.

### Rendering, which is free

**I17 with I9, not I14.** Presence and height must not vary with focus, because a
height that moves without `rev` moving defeats C14's cache and `measure` never
sees focus at all. **Appearance may vary; geometry never does.**

A full-row background wash changes no cell count and the patch renderer already
proves it. Reverse video is the 1-bit rung and needs no colour. A row of chrome —
a marker line, a status row, a bracket — is forbidden by the same invariant, and
that is the constraint to hold at every step rather than a note about this one.

Selection wants to be a palette entry with `carries: "meaning"` so C10 checks the
foreground/background pair against the contrast floor, rather than an ad-hoc
style that gets the floor checked nowhere.

---

## 5. Step 3 — copy writes the kill buffer

C17 §5a, and it is small because the ruling did the work. `y` fills the same
buffer `⌃k` fills; `⌃y` yanks it. A copy replaces rather than appending, ends any
kill run, and is not an undo unit.

**OSC 52 is a separate axis and stays separate.** Whether a copy also reaches the
*system* clipboard is a capability question about the terminal and changes nothing
about where the text lands inside the process. It can land in this step or later
without changing anything above it, which is what makes it a different axis
rather than a part of this one.

---

## 6. Step 4 — the transcript's element selection

**C26's, and it wants `elements`, which exists.** Copy as a verb on a focused
thing: `y` on a focused element copies what the element *is* — the code, the row,
the diff — which is the thing a raw terminal cannot offer and the reason the
semantic path is the answer to inner-scroll tension rather than a nicety.

The selection here is a set of `ElementAddress` values, not a character range.
Extending it is C26's navigation with the anchor held, exactly as step 2 extends
C17's motions.

**A4 of the classification table is the constraint**: no framework key may be
bound inside `mode: "interact"`, because a block's declared keys are an open set.
`y` lives in `navigate` only.

---

## 7. What every step checks

- **Selection is appearance, never geometry** — I17 with I9. Checked by reading
  the frame, not the numbers: an arithmetically consistent viewport can still be
  describing a different document.
- **Every binding through the real decoder before it is written down** — T2.13,
  and it has now cost four bindings and found one defect.
- **The walk artefacts re-run when a rung is added.** C16 §5's table lost the
  `interaction` rung this way once already.
- **Mutation on landing**, and a survivor gets a reason with a staleness arm.

## 8. What this design does not answer

- **The key that enters copy mode.** Left open deliberately; it wants the
  rebindable-keys row.
- **`flush()` and resize under a suspended scheduler.** Named in §3, owed before
  step 1's code.
- **Whether a transcript selection may span the boundary of a scrolled inner
  container** — entry 46's question, and it stays there.
- **Shift-click passthrough**, which most terminals give free and which is
  documentation rather than work.
