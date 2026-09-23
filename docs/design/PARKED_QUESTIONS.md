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

---

## Not yet recovered

The running count reached **eighteen**. Twelve are above. **Six are not
recoverable** from the session transcript by the searches run against it
(`parked`, `yours to rule`, `on the ask list`, `the design does not specify`),
and they are recorded as missing rather than reconstructed, because a parked
question written from memory is a fabrication with a number attached — which is
the failure mode this file exists to prevent.

They were introduced between the counts 3 → 6, 6 → 9 and 14 → 18. Recovering
them means reading the per-MR reports in
`~/.claude/projects/-Users-malachy-src-tui-kit/a6f49b7a-*.jsonl` at those
boundaries; the count in each report's closing line is the index.
