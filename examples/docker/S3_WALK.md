# S3 — the walk

The live single-container view, walked by hand before any of it was written.

S3 has **state** (a ring of samples, a tick count, the view's offset) and **structure**
(four blocks at document level, two of them live parts holding composed children). Those
are different kinds of rule interaction and they need different artefacts:

- a **sequence trace**, for rules that meet because something happened in between;
- a **classification table**, for rules that both hold at rest.

Taking the trace alone because the ticking is the obvious thing is how the structural half
goes unexamined — C19 is the measured case, and its `--flag=value` defect was structural in
a component walked only by sequence.

Every row below is a cell where **two rules overlap**. A row governed by one rule restates
that rule and finds nothing.

---

## §1 The rules in play

| | rule | source |
|---|---|---|
| R1 | The ring caps at N samples; the oldest drops | this walk, §3 |
| R2 | `form: "line"` does no windowing — the whole series spreads across the width | C12 |
| R3 | The cap is fixed when the document is built; `render` receives no width | `builders/types.ts:126` |
| R4 | A part's `render` runs exactly once per successful `fetch` | `refresh.ts:306` |
| R5 | A failed fetch renders `renderError` and backs off; nothing is sampled | `refresh.ts:319` |
| R6 | Staleness re-titles from the *current child*; it does not re-render | `refresh.ts:356` |
| R7 | `put` returning false releases the **host**, not the part | `refresh.ts:317` |
| R8 | Pop releases the parts before dismissing the layer | `keys.ts`, T1.4h4 |
| R9 | The view windows at block boundaries, and always shows at least one block | C22 I46 |
| R10 | `render` returns exactly **one** block | C23 I34 |
| R11 | One view at a time | C15 I1 |
| R12 | A document may not hold two blocks with one id | C04 I14 |
| R13 | `Series.values` is `readonly number[]` — there is no gap value | `viewmodel/types.ts:257` |
| R14 | Absent is not zero | DASHBOARD_WALK A3 |

---

## §2 The sequence trace

### A1 · a fetch resolves after the pop — R4 × R8

The push happens inside `fetch`, which has already run to completion by the time the
driver's `.then` sees it. So a tick in flight at the moment of the pop **still samples**,
into a ring nothing will ever render.

Harmless, and only because of what the ruling makes true: **the ring is created inside the
adapter call, never at module scope.** Module scope would make this row a real defect —
the second drill-in would open holding the first container's samples, drawn as its own
history, with every assertion about the plot passing. The ring's lifetime is the
invocation's, and the pop drops both.

### A2 · a failed fetch between two good ones — R4 × R5 × R13

The interesting row, and the reason the axis caption exists.

`Series.values` has no gap value (R13), so a tick that produced nothing cannot be
represented in the series. Three candidates:

1. **push the last sample again** — draws a flat run that never happened;
2. **push zero** — draws a cliff to idle, which is R14's error exactly: absent is not zero;
3. **push nothing** — the series closes the gap up and 60 samples spanning 90 seconds are
   drawn identically to 60 spanning 60.

**Ruled: (3), and the compression is made visible rather than warned about.** The ring
counts *samples*; a separate counter counts *ticks*, incremented in `fetch` **before** the
await so a rejection still counts. The caption reports both. `58 samples · 63 ticks` is a
reader-checkable statement that a stall happened; a caption saying "the axis is unreliable
across a stall" is a disclaimer nobody can act on.

This is the ruling the frame-read has to attempt to exercise, because in the healthy case
the two numbers are equal and the mechanism is indistinguishable from its absence.

### A3 · `render` throws while the buffer has advanced — R4 × R5

The sample is already in the ring, because it was pushed in `fetch`. `renderError` replaces
the child; the next good tick draws the full ring, including the sample whose render failed.

**This is the argument for pushing in `fetch` rather than in `render`**, and it is not the
obvious one. Pushing in `render` would lose the sample *and* leave the tick count right,
which is the worst of the three: a hole in the data and no evidence of one.

### A4 · staleness re-titles while the buffer has advanced — R4 × R6

`currentChild` re-puts the last rendered block under a new title, so a stale part shows an
old plot captioned with old counts and titled `· 14s ago`.

**Checked, and correct.** The child is a snapshot and the title carries its age; a caption
that updated while the plot beneath it did not would be the F16 defect inverted — a header
describing a moment the body is not from. Recorded because it reads like a bug.

### A5 · a resize between ticks — R2 × R3

The cap does not move; the same number of samples re-spreads across the new width. A view
opened at 120 and read at 80 draws two samples per column.

Visible rather than wrong, and not fixable from here: `render` has no width. **F24.**

### A6 · one part's put fails while its sibling is healthy — R7

`release(host)` is host-wide, so a false from the CPU part stops the MEM part too.

**Checked, and correct on this arm.** `putBlock` returns false only when the view is gone
or the block id is absent, and both ids are in the document the view was filled with — so
on a view host, false means *the view has gone*, and stopping the sibling is the right
answer. Recorded because host-wide teardown from a per-part signal is the shape that is
wrong elsewhere.

### A7 · a second drill-in while one is open — R11

`open` refuses, the refusal appends an error entry, and the adapter never runs — so no
second ring is created. The refusal path is the one place a view verb touches the
transcript, and it leaves nothing behind.

### A8 · the container stops while the view is open — R5 × R14

`docker container stats --no-stream` on a stopped container exits 0 and reports `--` for
every measurement. `percent("--")` is `null`.

**Ruled: a null reading samples nothing and counts a tick — the same treatment as a failed
fetch.** Pushing zero would draw the container idling; it is not idling, it is gone. One
mechanism covers both, and A2's caption reports both, which is why the ruling is cheap.

---

## §3 The classification table

Structural interactions — both rules hold at rest, with no event between them.

### B1 · the caption and the plot it explains — R9 × R10

`b.plot` cannot label its x-axis (F27), so the axis text must be a separate block. R9
windows at block boundaries, so **a window boundary can fall between a plot and the caption
that gives its units** — a frame that reads as complete and is missing the only thing that
says what the horizontal axis measures.

**Ruled: the caption rides inside the part's child, not at document level.** R10 gives one
block per part, so the child is a `group("column", [plot, caption])` — one block for
windowing, and the boundary cannot fall inside it.

**And the hazard is real for a document that does it differently.** S3 cannot demonstrate
it: the group closes it here, and S3 measures 30 rows against a region a view fills, so no
boundary falls anywhere at all. So this row is a **ruling inherited by the first surface
that can reach it** — a caption authored as a document-level sibling — rather than a hazard
this surface exercises. Written that way on purpose: a table row that reads as covered and
is not is A03 §2's vacuity class, and the alternative to naming the gap is the next surface
rediscovering the interaction from a frame.

### B2 · four ids at document level, two more inside the parts — R12

The live panel's id **is** the part id, and the child inside it needs its own. DASHBOARD_WALK
hit this: the panel is `running` and its table is `running-rows`, because `ViewPatch`
addresses by id and a duplicate has no correct target.

| block | id | who writes it |
|---|---|---|
| header | `container-head` | the adapter, once |
| CPU part (panel) | `cpu` | the driver, every tick |
| — its plot | `cpu-plot` | inside the part's child |
| — its caption | `cpu-axis` | inside the part's child |
| IO part (panel) | `io` | the driver, every tick |
| ports and mounts | `container-static` | the adapter, once |

### B3 · which blocks are static and which are not — R4

Only a `b.live` panel ticks. The header and the ports/mounts block are built once from the
`stats` result the verb ran, and they do not update — deliberately, because ports and mounts
do not change while a container runs, and a block that re-renders identically forever costs
a frame per tick for nothing.

**The consequence to state: the header's state is from the moment of the drill-in.** A
container that stops while the view is open still shows `running` in the header, while the
CPU part's caption reports ticks with no samples. Two blocks disagreeing, both correct. The
IO part carries the live state so the disagreement resolves where a reader is looking.

### B4 · `gapBefore` at document level — F22

`put` reads the gap from the block currently in place, and on the view arm `currentPanel`
*reconstructs* one via `livePanel`, which sets no `gapBefore`. So the carry is structurally
dead on this arm, and S3 is the first document with enough blocks at view level for it to
be observable. Asserted rather than reasoned about.

---

## §4 What this walk changed before any code existed

1. **The ring is per-invocation, not module-level** (A1) — the alternative renders one
   container's history as another's, silently.
2. **Ticks are counted separately from samples, and the caption reports both** (A2) — the
   difference between a warning and an observation.
3. **The tick counter increments before the await** (A2) — otherwise a rejection is not a
   tick and the stall is invisible again.
4. **A null reading is treated as a missing tick, not as zero** (A8) — R14 arriving in a
   second component.
5. **The caption rides inside the part's child** (B1) — the plan had it as a document-level
   sibling, which R9 can separate from its plot.
6. **Pushing in `fetch` is load-bearing, not stylistic** (A3).

---

## §5 What the frame-read changed that the walk could not

Three, and the first is the one that indicts the method rather than extending it.

**A2's ruling named an effect and assumed a mechanism that would be on screen.** The caption
reports the misses — true, and unreachable during a stall, because `renderError` replaces a
part's **whole child** and the caption lives inside it. So the mechanism built for the stall
was gone in exactly the case it existed for, and the healthy frame could not show that
because nothing was replaced.

Neither artefact reaches it. A trace indexes what happens *between* two rules; this is a rule
about what a frame *contains*, and containment only becomes visible when something replaces
the container. C23 §8a A4 is the nearest precedent — a ruling right about the interaction and
wrong about a mechanism it assumed existed — and the general form is worth stating: **when a
ruling says "X reports it", ask what is on screen at the moment X would have to report.**
Fixed by overriding `renderError` to draw the failure *beside* the history rather than
instead of it (B5).

**The empty arm lied about the world.** `docker stats` reports `Container` as the argument it
was handed, so a view opened by name read `Container: "dtui-busy"` where `ID` held the real
id. The details part filtered `docker ps` on `id=dtui-busy`, matched nothing, and rendered
its empty arm: *"no details — the container has gone"*. A sentence about docker, produced by
a bug here, in a frame where all 75 assertions passed — and the suite stayed green through
the fix, so nothing covered it (D5 does now). **A block whose absent state is phrased as a
fact about the far side will misattribute this app's own faults to it.**

**And a Calcium defect that only a failure could reach.** The framework's default
`renderError` constructs an `error` notice with no glyph, which C04 I6 refuses — so it threw,
unhandled, one tick after any fetch failure on any part that did not override it. Two healthy
frame-reads at two widths saw nothing. `docker rm -f` on the watched container, mid-capture,
is what produced it. FINDINGS F29.
