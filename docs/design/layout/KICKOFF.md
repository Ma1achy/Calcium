# Kick-off — the layout engine

**Read in this order:** `LAYOUT_ENGINE.md` (the model) → `LAYOUT_BRIEF.md` (the steps and gates) →
`LAYOUT_PASS.md` §4 (the measured Ink result, which supersedes §1 and the original §4) →
`APPEARANCE.md` and `INTERACTION.md` for what the engine is FOR.

**The decision already taken, after three surveys: finish the rows arm.** No Yoga, no Clay as a
dependency. Panel, scroll and group already compose child rows themselves — that was a measured
win (C09 I73, F1168/F1170) and adopting a solver would revert it. **The sizing model and the pass
structure are ported from `nicbarker/clay` (Zlib) — attribute it in the module header with the
version read.**

---

## What you are building

**Not "remove Ink".** Ink is already off the frame path for `/all`, `stress text`, `mixed` and
`session`. **You are building the box model the appearance rules need, and the last two container
kinds stop reaching for Ink as a side effect.**

**The one-sentence version, and everything else follows from it:**

> **Children declare their natural size; parents derive theirs from their children. Nothing is
> imposed downward until pass 2, and pass 2 only distributes slack or deficit.**

The current code has this backwards — `mosaicRects` divides a given width by shares and clips each
child into its rect, which is why cells get cut off. `LAYOUT_ENGINE.md` §3 works that through.

---

## Plan first, and what the plan must answer

**Do not start coding. Produce a plan that answers these, because each one changes the shape of
the code and is cheaper to decide than to undo:**

1. **The `SolvedBox` type** — what pass 5 produces and what `compose` consumes. Everything else
   is written against it.
2. **Where the engine lives** and what it may import. It must not import from `presentation/`;
   the dependency runs the other way.
3. **How a `paint` leaf declares itself** — a plot, an image, an attached PTY. `LAYOUT_ENGINE.md` §19's shape is a
   starting point, not a ruling.
4. **The cache's identity** — `LAYOUT_ENGINE.md` §13 says the key is `(box identity, available width)`. What IS box
   identity for a box rebuilt every frame? This is the hardest question here and it decides
   whether that section works at all.
5. **The order you will take the kinds in**, and which one is step 1. `LAYOUT_BRIEF.md` suggests
   an order; you have read the code and I have not.

**Ask before you start if any of those has no good answer.** A wrong `SolvedBox` is a rewrite.

---

## Subagents — where they genuinely help

**Three of these are independent and can run in parallel. The rest are sequential and must not
be.**

### Parallel, and safe to fan out

```
A  THE CONFORMANCE FIXTURES
   Freeze the Ink arm's output as fixtures BEFORE anything moves. Three suites
   currently prove the rows arm by comparing it to the Ink arm \u2014 deleting Ink
   deletes the oracle. This is the single highest-value task here and it blocks
   step 6. Do it first and do it whole.

B  THE minWidth AND dropPriority SURVEY
   Every kind needs a declared minWidth (\u00a76) and every container a drop order
   (\u00a712). Read the renderers, propose a table, flag the ones with no defensible
   answer. Output is a table, not code.

C  THE REPRESENTATION SURVEY
   Which kinds have more than one form (\u00a712)? Sidebar, table, tab bar, footer are
   named. Find the rest. Output is a table.
```

### Sequential, one agent, in order

```
0  yoga-layout is NOT taken. Confirm nothing in the plan needs it
1  the box type + measure for ONE kind. Heights match on every golden
2  that kind's render. Byte-identical frames
3  group, panel, table
4  scroll   \u2014 read the scroll finding first; do not rewrite it
5  mosaic   \u2014 \u00a73 is the whole point; this is where it pays off
6  delete elementOf, render-lines, the six Ink imports
7  padding, gap, alignment, stretch, representations as properties
8  layers and frames (\u00a710) \u2014 C15 stays the owner
```

**Steps 1\u20135 each land green. Step 6 is the one that cannot half-land.**

---

## The gate, and the one rule about it

**458 byte-exact frames in the tight tier, ~2,130 in the wider set, 11 snapshot files.** A
compositor swap is exactly what those were built for.

> **Every frame either moves or it does not, and a moved frame is a finding.**
> **If a step turns a frame, STOP and explain it before regenerating.** A regenerated snapshot
> with no written reason is the pass failing silently.

---

## Delete as you go

**Do not build alongside.** A parallel new system means every surface has two possible renderings
and no audit can tell which shipped — **which is the exact failure this project keeps finding**,
where the section that argues and the section that draws disagree. When a kind moves, its Ink
branch goes in the same commit.

---

## Known, ruled, and NOT to be reopened

```
scroll over an unsliceable child   ruled, tested with a number, finding is
                                   closed. The open part is corpus coverage
                                   only. Do NOT rewrite scroll for it
NavElement's shape                 deferred deliberately. One rectangle stays.
                                   Nothing produces a fragmented element today
                                   and the conformance checker's predicates ARE
                                   the specification of one rectangle
baseline, negative margin, order   refused, \u00a717. Do not port them
```

---

## What to report

```
per step   the code, its Ink branch deleted in the same commit, goldens green
           or a written explanation per moved frame
steps 4\u20136  a measured before/after on the mosaic scroll frame
at the end ONE number: that frame, before and after
```

**The ceiling is ~87 ms of 145.** If the pass lands under half of that, **say so plainly** — an
honest partial is worth more than a rounded-up claim, and this repo has a record of the instrument
being wrong more often than the renderer.

**And if a premise in these documents turns out to be false, say that too.** Three surveys have
already killed several of mine: the arm table was wrong, `image`'s element arm is dead code, there
are six Ink imports and not seven, and four of the five `NavElement` consumers I named either read
no geometry or do not exist. **Expect more of that, and report it rather than working around it.**
