# Parked questions — the design-language reconciliation

Questions the reconciliation hit and did **not** rule, per the standing
instruction to park a visible choice the design does not specify, a place the
design contradicts itself, or anything that would weaken a gate rather than
amend it.

**Why this file exists.** These lived only in per-MR reports across thirty
compactions, which is the *ask where a settled claim is written down* failure
this repository names about itself: a claim carried between steps acquires the
authority of a ruling without ever having been one, and a claim that exists in
no file cannot be checked. Each entry below names its subject in the tree so it
can be resolved against HEAD rather than trusted.

**Nothing here is "knowingly divergent."** Each is a question with the work
either done under a stated assumption (say so, and it flips with one word) or
held at the point where a choice would be mine to invent.

---

## Open

**1 · `R-GLY-001` cannot carry the fixed-column restriction.** The rule is
released: its text is sealed by the baseline anchor, and it cannot be superseded
either, because three released history rules name it as their successor and a
successor must be `current` — a link the immutability lint forbids redirecting.
Adding a bare new `current` rule would leave two `current` rules contradicting
each other, which is worse. **Done under assumption:** the repo-side spec
(C09 §4, I5) carries the narrowed rule and the registry does not.

**2 · The Unicode residue lead diverges from the design's own fixtures.** The
three-cell slot at every rung draws `⋯   5 more`; the fixtures draw `⋯ 5 more`,
two cells (§095, `R-BLK-867`). The design never shows an ASCII residue row, so
it does not contradict itself — it does not settle this. The visible cost is the
plot legend, where the residue row became the widest entry and the chart
shifted. **Alternative:** each rung takes its natural width, keeping the fixture
exact and losing the no-column-moves guarantee. **Done under assumption:** the
three-cell slot. One word flips it. *(This is also what a §016 fixture
comparison reads as a mismatch on every Unicode residue row — one question, two
arrivals.)*

**3 · `Placement.kind: "fill"` has no producer in `src/`.** Deleting it is the
tail of deleting the pushed view, but C15 I20, I22 and I27 are each written as a
*refusal* of a `fill` layer, so removing it **empties three refusals rather than
amending them** — which is the one shape the standing instruction says to stop
on. **Held.**

**4 · The copy-mode chrome label's wording.** Both modes now read
`owner === "copy"`, so shipping a second `COPY` would ship a collision. The
seam is built and the label waits on the word.

**5 · `R-SEL-007`'s rectangular-selection mode label.** The registry gives the
rule and no chord: no rectangular action, no binding, and no wording in the
repo's prose either. The rule's two mechanical clauses — the clip and the cells
— are built; *says so in the mode label* is blocked on 4.

**6 · `R-SEL-002` clause 2 contradicts the design's own fixtures.** *A bounded
block's content does not sit inside vertical rules*, read literally, forbids the
box drawn in §021, §045, §047, §048 and §096 — all five put content between two
`│`. The reading that survives is narrower than the sentence. Clauses 3 and 4
have their subject in the scrollbar; clause 1 is unambiguous and gated.

**7 · `hcDark` has no overrides and `hcLight` has four.** The ten values that
would close `hcDark`'s `selection` are specified nowhere. Raising a tone to a
floor is arithmetic; choosing the ten is a visible colour decision.

**8 · §026 gives no band width for the streaming trail.** Its own cost example
is worked at one cell and at three. **Done under assumption: 3.**

**9 · Nothing distinguishes a layer that composes its own text from one that
composes none.** A search composes; a completion menu and a chip preview do not.
`promptUnderMenu` therefore names two ids rather than reading a field, and §101
gives that field no name. Adding one is a visible mechanism the design does not
specify.

**10 · §035's ASCII bar granularity contradicts the registry** — the first real
conflict between two normative sources rather than a gap. §035's degradation
block draws the segmented ASCII rung as `[#][#][#][.][.]`, three cells per
segment, under the sentence *the ASCII rung preserves granularity*. The
registry's `bars` carries a single `ascii` pair, `#`/`-` (C09 I94, landed from
the registry), and C09's substitution rule is 1:1 by column count. **Done under
assumption:** the tree collapses both granularities to `#-`, and the frame
records that.

**11 · Whether spinner frames belong in a collision domain.** `|` is now a
rotation frame, `quote`'s ASCII rail and `vertical`'s border. `SS59` cannot see
it — spinner frames are in neither `GLYPH_DOMAINS` nor `GLYPH_SET_DOMAINS`, so
they never enter a pair — while the collision model's own test, *does this pair
share a row*, says they do: a boxed status draws `| | retrying in 8s`, border
then spinner. F834's case was static against static; this is static against
**moving** — `|` for three ticks of ten and something else for seven, which is
an asymmetry that may make it legible rather than a rule that excuses it. The
design registers `|/-\` for rotation, draws `|` borders in its own fixtures, and
remarks on neither. (C09 I99 records this limit in place.)

**12 · §038's verb → ramp table has no key.** The section pairs ten verbs with
ten ramps in prose — *a search sweeps, a write advances, a wait on YOU breathes
where a wait on the NETWORK drifts* — and supplies no field by which a producer
names one. The registry's `semantic` reads like the mechanism and is not one: it
is a free-text gloss, one per ramp (`motion`, `thinking`, `too wide`), not a
controlled vocabulary. A framework table would be this repository choosing an
English lexicon, which nothing else in the tree does. **Held** — it is the only
part of §038 still owed; the agent's mark is C09 I98 and the degradation table
is C09 I99.

**13 · A second ASCII bar pair, and the design names no ASCII *absent* mark.**
`plot/ramp.ts`'s `pairFor` is a second pair — `#` / `.` / absent `-` — and it is
what a `keyValue` row's bar draws through `valueBar`. Its `empty` cannot take
the registry's `-` without becoming its own `absent`, and §078's `R-TBL-003`
keeps *missing* and *empty* distinct on purpose. The two collide only because
this tree degrades the em dash where `ambiguousWidth` forbids it. A glyph
choice, not a divergence left standing.

**14 · Whether a sub-panel's border is the block's enclosure.** §017 says *a
FRAME takes its border*, and `smallmultiples` and `pairplot` have four. The
design does not say which, and lighting four sub-frames at once is a visible
choice.

**15 · The chord glyphs have no ASCII rung.** The design draws eleven — `← ↑ →
↓ ⇥ ⇧ ⌃ ⌘ ⌥ ⌫ ⏎` — throughout §019 and the binding registry, and **registers
none of them in the glyph table**, so none has a declared fallback and the
section shows them degrading nowhere. Inventing eleven spellings is a visible
choice. **Done under assumption:** `chordText` answers the existing shorthand
(`s+enter`, `m+C`) below the Unicode rung — the behaviour that already shipped,
held as the arm to revisit rather than as an answer.

**16 · §070's ten hues have no values.** `/colour` and `/label` are unbuilt end
to end, and the section's mechanism is specified in detail — chrome only, per
directory in `.calcium/config.toml`, a name resolved per theme against a hex
taken literally, the hex gated by a choice-only contrast question with the safe
answer focused and `esc` resolving to it, animation as an explicit decoration
exception suppressed under `reduced` and `off`. What it does not give is **the
ten hues**: *blue orange cyan pink lime violet yellow green red purple*, named
and described only as *VIVID*, with no values in the section and **no palette
anywhere in the registry** (searched for a record carrying all ten; there is
none).

Ten vivid colour values is the park list's own example of a visible choice.
**Held whole rather than part-built**: the hex arm alone needs no new values,
but a `/colour` that accepts a literal and refuses `blue`, `blue..pink` and the
picker — three of the six forms its own help text lists — is not a smaller
version of this feature. `viridis` would work, since the colormaps ship.

---

## Not yet recovered

**Sixteen distinct questions are above, and the running count in the reports
reached eighteen.** The gap was chased rather than left: the reports state a
total at six, nine, twelve, fourteen, fifteen and eighteen, and the message
ranges between *nine → twelve* and *twelve → fourteen* were read in full. **They
name no new question.** So the discrepancy is in the counting, not in the
record: the residue question was reported twice — once as a divergence from the
fixtures and once as the diff a fixture comparison would read — and counted
twice, and the same is true of at least one M13 item reported as still-open and
as parked.

The right reading is that **fourteen is the number**, and it is the one to
work from. The count is not repeated anywhere as a figure, because a total that
no longer resolves against a list is the thing this file was written to stop.
