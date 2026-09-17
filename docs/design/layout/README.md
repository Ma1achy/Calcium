# Calcium — the design language

Four files. **The markdown is the rules; the HTML is the pictures and the feel.** Where they
disagree, the drawing and the prototype win — they were measured, and the prose was written.

```
KICKOFF.md                           START HERE for the layout work
LAYOUT_BRIEF.md                      the steps — steps, gates, and what not to do
LAYOUT_ENGINE.md                     the model — sizing, passes, padding, overflow, the API
LAYOUT_PASS.md                       the reasoning and the measured Ink result (§4)
INK_INVESTIGATION.md                 the brief that produced §4
APPEARANCE.md                        the visual rules
INTERACTION.md                       the interaction rules
calcium-design-language.html         82 sections, 9 themes, every rule drawn
calcium-interaction-prototype.html   playable — click it and use it
```

## What is here, and what is not

**The two HTML files this README names are not in the repository.**
`calcium-design-language.html` (82 sections, every rule drawn) and
`calcium-interaction-prototype.html` are cited above as the authority — *when they disagree, the
drawing and the prototype win* — and neither is committed. So the tie-break these documents defer
to is unavailable, and a rule whose reason is *the picture was measured* cannot be checked against
the picture. Recorded here rather than left to be rediscovered: the markdown is usable on its own,
and where it is the only record, it is the record.

**The bare invariant citations were named on adoption.** `I1` throughout these files is **C09 I1**
— `measure(b, w)` equals the rendered row count at `w`, computed without rendering — and the eight
sites SP3 could not resolve now say so. The `§n` references are these documents' own numbering;
the enforcement resolver knows spec documents only, so they report as *names no document*, which
is accurate.

## The order

```
0  the cheap profiler phases   they decide how much of this is about Ink at all
1  LAYOUT                      a real box model. Everything below assumes one
2  APPEARANCE                  the language applied, and the old system deleted
3  INTERACTION                 the scope ladder, focus, key repeat, the mouse
```

**Layout is first because almost every rule in `APPEARANCE.md` is a statement about a box model
that does not exist yet.** `LAYOUT_BRIEF.md` is the step-by-step and `LAYOUT_ENGINE.md` is what to build — four sizing
modes, five passes, and the reproducibility rules that make a byte-exact golden possible. Interaction is last because focus is drawn over an element's extent,
and an extent is a layout fact. `LAYOUT_PASS.md` has the reasoning, the Ink finding, and what to
measure before deciding anything.

## Reading order

**If you are building something:** `APPEARANCE.md` §15 and `INTERACTION.md` §1 are the whole
thing in two pages. Then open the HTML for the surface you are building and read the drawing.

**If you are deciding something:** the HTML's last section is every rule condensed. Each one
has its reason beside it in the section it came from, and **a rule without its reason is a rule
that will be applied somewhere it does not belong.**

**If you are checking something:** play the prototype. Several rules in these files were
corrected by using it rather than by reading it.

## What is authoritative

**These files are the authority on SHAPE.** C16, C26, C09, C10 and C12 are the authority on
MECHANISM. A binding is a shape; the store it writes is a mechanism. See `INTERACTION.md` §15
for what to do when they disagree.

## What is drawn and not yet ruled

The Prism sections in the HTML show **the design language applied to the existing Prism
surfaces**. They answer *what would today's Prism look like under these rules* — not *what
should Prism be*, which is a separate pass that has to decide three things first: agent-first
or command-first, what the artefact is once there are notebooks, and what a run is once an
agent is submitting them.

**The language transfers regardless**, because it is about how things look and behave rather
than what exists.

## The two things most likely to be got wrong

**Focus and selection are different channels.** Focus is a lightness shift; selection is the
selection surface. Using one for both makes a frame where a range is selected and a cursor is
somewhere inside it unreadable.

**A rule's statement is usually wider than its reason.** *No single-letter commands on content*
was too wide and had to become *no single-key commands where typing is possible*. When a rule
seems to forbid something obviously fine, check the reason before writing an exception.
