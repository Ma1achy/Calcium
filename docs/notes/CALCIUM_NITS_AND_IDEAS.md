# Calcium — nits and ideas

**Empty as of 2026-08-13.** Kept rather than deleted, because the next batch wants somewhere
to land and a file recreated from memory loses the rule below.

---

## What this is for

Things noticed in passing that are **not yet roadmap entries and are not work**. A nit
carries enough of its reasoning to be picked up cold — the observation, why it matters, and
what it would cost — without being a plan.

## What it is not for

**Anything that has a destination.** A nit that names an entry belongs *inside* that entry
(F11: correct in place, so the change is checkable). A nit about an instrument belongs in
`examples/docker/FINDINGS.md` with a group in `TRIAGE.md`. A nit that is a decision is a
`RULED` row, not a note.

**The file must shrink.** A holding pen that only grows is a second roadmap with no status
column, and the two disagree the first time anyone reads them apart.

## The rule the last distribution produced

**Check the mapping before applying it.** Distributing twelve nits found **six of thirteen
destinations naming the wrong entry** — five of them the same slip, a number remembered from
a body section's neighbourhood rather than read off the Order list, which has been renumbered
repeatedly. F142's lesson arriving in a cross-reference.

**And one nit was already dead**, having been written mid-pass against a figure the pass
itself then changed. **If a nit turns out already built, already ruled or already an entry,
that is the result** — the scrollable container's prompt half was entry 28 verbatim.

## The drop's copy was refused — 2026-08-15

A design drop carried a 517-line `CALCIUM_NITS_AND_IDEAS.md`. **It is the snapshot from before
the distribution below**, and its eleven sections map onto entries and findings that already
have them: item 4 is F160, item 5 is entry 35, items 6 and 10 are 15 and 46, item 8 is 36, item
9 is 29, and item 11 — *`⎿` is a glyph slot with more than one consumer* — is one of the two
claims the drop's own README records as invented. **Four were unmapped when this was written and
are mapped 2026-09-03, so that *eleven* is true**: item 1 (selection) is the roadmap's three selection
sections and `selectionSpans` in `src/interaction/editor/layout.ts` — built, roadmap 15; item 2
(configurable cursor) is `src/shell/cursor-style.ts` — built; item 3 (nineteen unverified roadmap
entries) is `tools/roadmap-status.mjs`, which today reports 52 entries, 42 resolving, 8 confirmed
OPEN and 2 unchecked — the nineteen were the confirmed-OPEN list's *symbols absent* tail and the
roadmap's own sweep says *six of nineteen* carry a symbol; item 7 (the four seams the modes and
containers open) is entry 46's three questions, answered in C26 §4b, and entry 15's boundary ruling.

**Not merged, and the reason is this file's own rule**: a holding pen that only grows is a
second roadmap with no status column, and the two disagree the first time anyone reads them
apart. Restoring it would resurrect eleven items that were dispatched, one of them known false.
The zip is where it remains if a destination is ever disputed.

## Where the last batch went — 2026-08-13

Twelve nits, all distributed. Ten to `CALCIUM_ROADMAP.md` (entries 7, 15, 29, 35, 36, 44, and
new entries 45 and 46), one to C26 §4 as a step in the policy check, one to `FINDINGS.md` as
F160. Two were ruled on the way out: the pending notice is composed by the framework and
replaced by an adapter that knows more (35), and `copyMode` stays a target rather than
becoming a third mode (15).
