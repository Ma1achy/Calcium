# Calcium — nits and ideas

Things noticed in passing that are not yet roadmap entries and are not work. Each carries
enough of its reasoning to be picked up cold, and the ones that turn into rows should move
out of here rather than be duplicated.

**Distributed 2026-08-13.** Ten of twelve left, and the file is what remains. What moved and
where is at the bottom, because a holding pen that does not shrink is a second roadmap.

---

## 1 · Where the pending notice belongs — framework or adapter

**The one open question inside entry 35, kept here because it is a ruling and not work.**

The framework knows the verb and the elapsed time; only the adapter knows what the far side
is actually doing — `docker pull`'s per-layer progress, a tool call's own name. A framework
default with an adapter override is the likely shape.

**But a framework that composes a notice the app did not ask for is the same class as
truncating an app's document without being asked** (F123). So it is a ruling before it is a
feature, and it is cheap to make now and expensive to reverse once an adapter depends on
either answer.

Entry 35 carries the question; this holds the argument.

---

## 2 · The policy vocabulary may have no value for a scroller

**Kept because it is a check, not a decision.** C26 §4 takes `ArrowPolicy`/`EscapePolicy`
from three kinds — `table`, `logs`, and `patch` in a pushed view — and the third exists
precisely because *two instances fitting a rule is the minimum for noticing one*.

**A scroller is a fourth kind, and it is the first with an interior that is not an element.**
Every other kind resolves `↓` at an *edge*; a scroller has an edge and a middle. So the check
is whether the vocabulary extends or whether the axis is wrong — the same question C13's
patch gate was re-founded three times over, and the answer there was that the axis was wrong
rather than the classification incomplete.

**Run the check before adopting the vocabulary for containers**, not after. Entry 7 carries
the question; this is why it is a check rather than a preference.

---

## What left, and where it went

| was | went to | note |
|---|---|---|
| selection motions | **entry 15** + *Selection in the prompt* | the mapping said 22; **22 is `b.art — banners`** |
| configurable cursor | **NEW entry 45** + its own section | nothing in `src/` does shape; `cursorSequence` is positioning |
| the nineteen unverified entries | **nowhere — already dead** | the verifier reports **3 unchecked, 25 confirmed OPEN**; the nineteen were checked in the second sweep |
| MG24 matches by name | **FINDINGS F160**, TRIAGE group 11 | not previously filed anywhere but the type's own comment |
| the blank pending entry | **entry 35** | the mapping said 26; **26 is `view trace in transcript`**. Verified: `execution.ts` step 3 appends with `blocks: []` |
| scrollable containers | **NEW entry 46** + its own section | and **the prompt half is already entry 28**, verbatim — *the window exists and is tail-anchored; the fix is threading `cursorCell`* |
| `↓` on a scroller · interact vs the view's keys · focus memory and the mode | **entry 7** | the mapping said 1; **1 is `PHASE 1`**. The navigation model is 7 |
| `copyMode` — target or mode | **entry 15, as RULED** | target, not a third mode: stage 1's argument for `interaction` applies unchanged |
| scrollbars + mouse | **entry 36** | ✓ as mapped |
| the chrome's fifth claimant | **entry 29** | ✓ as mapped — four became five |
| resume does not restore | **entry 44, as RULED** | the mapping said 34; **34 is `UX polish set`** |

**Six of thirteen destinations were wrong and one nit was already dead**, which is the
argument for checking a mapping rather than applying it. Five of the six are the same slip:
a number remembered from a body section's neighbourhood rather than read off the Order list,
which has been renumbered repeatedly — **F142's lesson arriving in a cross-reference.**
