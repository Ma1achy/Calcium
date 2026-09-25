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

## Entries

**Open: 18, 23, 32, 36, 37, 38, 39, 40.** Every other entry is ruled or retracted. A ruled entry keeps its body, with the ruling directly above it and a premise note wherever the ruling rested on something the entry or the design contradicts.

> **Ruled 2026-09-24.** Already answered, by the chain rule. The repo-side spec (C09 §4, I5) carries the narrowed rule and the registry does not. That assumption stands as the answer.

**1 · RULED — `R-GLY-001` cannot carry the fixed-column restriction.** The rule is
released: its text is sealed by the baseline anchor, and it cannot be superseded
either, because three released history rules name it as their successor and a
successor must be `current` — a link the immutability lint forbids redirecting.
Adding a bare new `current` rule would leave two `current` rules contradicting
each other, which is worse. **Done under assumption:** the repo-side spec
(C09 §4, I5) carries the narrowed rule and the registry does not.

> **Ruled 2026-09-24.** Each rung takes its **natural width**. The fixture's `⋯ 5 more` is exact at two cells, and the no-column-moves guarantee is given up. **Owed:** the three-cell slot is retired, and the plot legend and residue goldens move.

**2 · RULED — The Unicode residue lead diverges from the design's own fixtures.** The
three-cell slot at every rung draws `⋯   5 more`; the fixtures draw `⋯ 5 more`,
two cells (§095, `R-BLK-867`). The design never shows an ASCII residue row, so
it does not contradict itself — it does not settle this. The visible cost is the
plot legend, where the residue row became the widest entry and the chart
shifted. **Alternative:** each rung takes its natural width, keeping the fixture
exact and losing the no-column-moves guarantee. **Done under assumption:** the
three-cell slot. One word flips it. *(This is also what a §016 fixture
comparison reads as a mismatch on every Unicode residue row — one question, two
arrivals.)*

> **Ruled 2026-09-24.** Delete `Placement.kind: "fill"` unless the design uses it. **Checked: it does not.** The registry's only `placement` fields are on bar records, where they mean something else. **Owed:** the deletion. C15 I20, I22 and I27 are retired as refusals of a thing that no longer exists, rather than left standing with no subject. **Premise note, 2026-09-25:** only the `fill` clause of each is a refusal of a thing that no longer exists. I20 still refuses a centred layer with no width, I22 a centred peek, I27 a centred, blocking or non-`escape` panel — all constructible. Retiring them would drop three live gates, so each is **amended** to lose its `fill` clause and keeps the rest; the ruling's aim, no refusal standing with no subject, holds. T1.11 and T4.4 had only `fill` for a subject and retire. **Built.**

**3 · RULED — `Placement.kind: "fill"` has no producer in `src/`.** Deleting it is the
tail of deleting the pushed view, but C15 I20, I22 and I27 are each written as a
*refusal* of a `fill` layer, so removing it **empties three refusals rather than
amending them** — which is the one shape the standing instruction says to stop
on. **Held.**

> **Ruled 2026-09-24.** Semantic mode reads **`copy`** and native handoff reads **`native`**. **Checked:** fixture 044 draws `⌥⇧C native`, and §103's footer opens `copy ←→↑↓`. **Owed:** the label.

**4 · RULED — The copy-mode chrome label's wording.** Both modes now read
`owner === "copy"`, so shipping a second `COPY` would ship a collision. The
seam is built and the label waits on the word.

> **Ruled 2026-09-24.** The label is **`RECT 12×4 · cells, not source`**. **Premise note:** no fixture or HTML page draws this. `cells, not source` is `R-SEL-007`'s own rule text, and `RECT 12×4` appears nowhere in the kit. It was not already answered; it is answered now, and the wording is yours. **Owed.**

**5 · RULED — `R-SEL-007`'s rectangular-selection mode label.** The registry gives the
rule and no chord: no rectangular action, no binding, and no wording in the
repo's prose either. The rule's two mechanical clauses — the clip and the cells
— are built; *says so in the mode label* is blocked on 4.

> **Ruled 2026-09-24.** Keep the design's bordered blocks. `R-SEL-002` clause 2 is superseded: semantic copy is the clean path, and a naive drag that includes the border is accepted. **Owed:** the registry supersession. **Built 2026-09-25:** `R-SEL-002` → `R-SEL-016` (`tools/design/supersede-rulings.mjs`).

**6 · RULED — `R-SEL-002` clause 2 contradicts the design's own fixtures.** *A bounded
block's content does not sit inside vertical rules*, read literally, forbids the
box drawn in §021, §045, §047, §048 and §096 — all five put content between two
`│`. The reading that survives is narrower than the sentence. Clauses 3 and 4
have their subject in the scrollbar; clause 1 is unambiguous and gated.

> **Ruled 2026-09-24.** Closed: the contrast gate is green on both themes (`validateHighContrast`, `validateBands`). The band ink (C10 I45) replaced the ten-overrides framing. **Not closed with it:** a renderer defect measured the same day. The semantic-selection wash lays the band's ground without its ink, which puts page inks at 1.25–1.68 : 1. That is `R-THM-003`'s selection half and is owed in the ledger. The tokens are correct; the renderer does not apply them.

**7 · RULED — `hcDark` has no overrides and `hcLight` has four.** The ten values that
would close `hcDark`'s `selection` are specified nowhere. Raising a tone to a
floor is arithmetic; choosing the ten is a visible colour decision.

> **Ruled 2026-09-24.** Measured from the design's own figure. The streaming demo (`<pre id="live">`) is driven by a script, not a CSS animation, and it sets **`const trail=14`**. **Owed:** 14 replaces the assumed 3. **Built 2026-09-25, with a finding:** the demo counts back through the whole stream, and C09 I90 already said *the last `TRAIL_CELLS` cells of the text* — but `withTrail` banded the last wrapped row only. Latent at 3, visible at 14 on every short last row, so the band now crosses rows (T1.76).

**8 · RULED — §026 gives no band width for the streaming trail.** Its own cost example
is worked at one cell and at three. **Done under assumption: 3.**

> **Ruled 2026-09-24.** My call, recorded as a ruling. **A layer declares whether it composes its own text**, and `promptUnderMenu`'s id list becomes a read of that declaration. It is built with 23's answer, because the completion menu is the one layer whose answer changes while it is up.

**9 · RULED — Nothing distinguishes a layer that composes its own text from one that
composes none.** A search composes; a completion menu and a chip preview do not.
`promptUnderMenu` therefore names two ids rather than reading a field, and §101
gives that field no name. Adding one is a visible mechanism the design does not
specify.

> **Ruled 2026-09-24.** **Tie-break 1: data beats prose.** The registry's `#`/`-` stands, which is what the tree already does. **Owed:** §035's `[#][#][.]` specimen is superseded in the registry. **Premise note, 2026-09-25:** the registry cannot supersede a specimen — the builder requires every section block to carry `example` status — and it never bound anything, since R-REG-002 makes an example block non-normative. The ruling lands as **`R-PRG-003`**, a current rule §035's section cites. **Built.**

**10 · RULED — §035's ASCII bar granularity contradicts the registry** — the first real
conflict between two normative sources rather than a gap. §035's degradation
block draws the segmented ASCII rung as `[#][#][#][.][.]`, three cells per
segment, under the sentence *the ASCII rung preserves granularity*. The
registry's `bars` carries a single `ascii` pair, `#`/`-` (C09 I94, landed from
the registry), and C09's substitution rule is 1:1 by column count. **Done under
assumption:** the tree collapses both granularities to `#-`, and the frame
records that.

> **Ruled 2026-09-24.** Spinner frames get **their own domain, the duration slot**, and collisions are checked only within a set. **Owed:** the domain in SS64 and in C09 I99. **Premise note, 2026-09-25:** the first clause is recorded in C09 I99. The second has no subject the static test can take — it fires on 12 of 27 sets, every one a downsampling — so it is parked as **39**, and SS64 reads no frame until it is answered.

**11 · RULED — Whether spinner frames belong in a collision domain.** `|` is now a
rotation frame, `quote`'s ASCII rail and `vertical`'s border. `SS64` cannot see
it — spinner frames are in neither `GLYPH_DOMAINS` nor `GLYPH_SET_DOMAINS`, so
they never enter a pair — while the collision model's own test, *does this pair
share a row*, says they do: a boxed status draws `| | retrying in 8s`, border
then spinner. F834's case was static against static; this is static against
**moving** — `|` for three ticks of ten and something else for seven, which is
an asymmetry that may make it legible rather than a rule that excuses it. The
design registers `|/-\` for rotation, draws `|` borders in its own fixtures, and
remarks on neither. (C09 I99 records this limit in place.)

> **Ruled 2026-09-24.** The verb → ramp key is to be proposed as one table, together with 31, for approval in a batch.

**12 · RULED — §038's verb → ramp table has no key.** The section pairs ten verbs with
ten ramps in prose — *a search sweeps, a write advances, a wait on YOU breathes
where a wait on the NETWORK drifts* — and supplies no field by which a producer
names one. The registry's `semantic` reads like the mechanism and is not one: it
is a free-text gloss, one per ramp (`motion`, `thinking`, `too wide`), not a
controlled vocabulary. A framework table would be this repository choosing an
English lexicon, which nothing else in the tree does. **Held** — it is the only
part of §038 still owed; the agent's mark is C09 I98 and the degradation table
is C09 I99.

> **Ruled 2026-09-24.** ASCII *absent* is **`-`**, because a dash is not a zero. The second bar pair is to be proposed from the free set. **Premise note:** the registry's own bar pair already uses `-` as the ASCII **empty** cell (`#`/`-`, C09 I94). So *absent* `-` and *empty* `-` are one character wherever a bar and a missing value share a row, such as a `keyValue` row or a table cell. Either the proposed second pair replaces the registry pair's empty wherever both can meet, or the two are separated by domain. Proposed in the batch.

**13 · RULED — A second ASCII bar pair, and the design names no ASCII *absent* mark.**
`plot/ramp.ts`'s `pairFor` is a second pair — `#` / `.` / absent `-` — and it is
what a `keyValue` row's bar draws through `valueBar`. Its `empty` cannot take
the registry's `-` without becoming its own `absent`, and §078's `R-TBL-003`
keeps *missing* and *empty* distinct on purpose. The two collide only because
this tree degrades the em dash where `ambiguousWidth` forbids it. A glyph
choice, not a divergence left standing.

> **Ruled 2026-09-24.** Already answered: **the frame is the container's.** A sub-panel's border is not the block's enclosure, and focus lights the container's frame.

**14 · RULED — Whether a sub-panel's border is the block's enclosure.** §017 says *a
FRAME takes its border*, and `smallmultiples` and `pairplot` have four. The
design does not say which, and lighting four sub-frames at once is a visible
choice.

> **Ruled 2026-09-24.** Chord glyphs fall back to **text names**, free-width, in help and footer only: `C-`, `M-`, `S-`, `Enter`, `Esc`, `Tab`, `Up`, `Down`, `Left`, `Right`. **Premise note:** that list covers nine of the eleven. It leaves out `⌘` (Super) and `⌫` (Backspace). The proposal, in Emacs's spelling to match the rest, is `s-` and `Backspace`, in the batch. **Owed:** `chordText`'s shorthand (`s+enter`, `m+C`) is replaced.

**15 · RULED — The chord glyphs have no ASCII rung.** The design draws eleven — `← ↑ →
↓ ⇥ ⇧ ⌃ ⌘ ⌥ ⌫ ⏎` — throughout §019 and the binding registry, and **registers
none of them in the glyph table**, so none has a declared fallback and the
section shows them degrading nowhere. Inventing eleven spellings is a visible
choice.

**Measured rather than asserted**, by sweeping every code point above U+2000 in
`fixtures/*.txt` against every `unicode`/`ascii` field of the registry's glyph,
spinner and bar records. Seven of the eleven are drawn **402 times** between them
and none is registered: `⏎` 102, `⌃` 74, `⇧` 71, `⌥` 53, `⌘` 47, `⇥` 46,
`⌫` 9. The sweep is the argument for the question's size: this is not one
figure's spelling, it is every key name the design prints. **Done under assumption:** `chordText` answers the existing shorthand
(`s+enter`, `m+C`) below the Unicode rung — the behaviour that already shipped,
held as the arm to revisit rather than as an answer.

**16 · RETRACTED — §070's ten hues have values, and the search that said
otherwise looked for the wrong shape.** The question read *no palette anywhere in
the registry*, and its own parenthesis is the tell: *searched for a record
carrying all ten; there is none*. It looked for a **record**. The registry stores
them as **theme rules** — one CSS rule per hue, per tier, per theme:

    300 hue tokens · c-h 100 · bg-h 100 · c-hi 100 · ten hues × ten themes

    blue   #3b82f6      violet  #d946ef
    orange #ff8c1a      yellow  #ffd21f
    cyan   #22d3ee      green   #22c55e
    pink   #ec4899      red     #ff4d4d
    lime   #a3e635      purple  #a855f7

Every theme carries all ten, including `mono` and the two high-contrast pairs.
**A matcher that sees one encoding reports absence when the value changes form**,
and M2's own plan text names the thing it missed — *10 `h-*`/`hi-*` hue pairs*.

**And §093 settles the order, which this question never knew was in doubt.** The
hues are listed *blue orange cyan pink lime violet yellow green red purple*, and
§093 says why: the first assignment was **spectral** — red, orange, yellow, lime,
green — *five identities a deuteranope cannot separate*, so the order is by
**perceptual separation** and *the first four are separable under every common
deficiency, which is where a session with three subagents lands*.

**So nothing about §070 is a visible choice any more.** Values: in the registry.
Order: ruled by §093 with its argument. What is actually missing is the **port** —
the hexes appear nowhere in `src/`, `test/` or `docs/components/`, and
`categorical` is a separate eight-slot cycle (C10 I37), not these. That is M2's
work left undone, not a question, and §070's census row says so.

> **Ruled 2026-09-24.** Register `↺` with a proposed ASCII fallback, which is in the batch. **Owed:** the glyph record.

**17 · RULED — `↺` is an affordance the design draws and the registry does not record.**
It is `↺ redo` on a reverted entry (§064), `↺ revert` on a stopped one (§005),
`↺ revert all` on a review row (§013), and `↺ on an entry` in §092's state table
— **22 occurrences in `calcium-registry.json`**, every one inside `sectionBlocks`
text or the projected HTML, painted `c-accent` beside a `c-muted` label, and
**none in a glyph record**. It is in no file in `src/` or `test/` either.

**This is F161's shape inverted, and that is why it survived.** F161 was a shared
mark with four named consumers whose character was in no file; here the character
is everywhere and the **record** is missing — so a reader going to the registry
for the mark finds it in the prose, which reads exactly like being registered.
Nothing could catch it: SS64's collision domains are built from glyph records, so
a mark with no record is in no domain and contests nothing.

Registering it needs an ASCII rung, which is a visible choice — the same choice
as 15 and reached by a different road. **Held.** The finding is the absence, and
it is recorded here rather than left to the next sweep.

**18 · The two normative sources disagree about the five permission postures,
and about the one that matters.** §071 measures five — `manual`,
`accept-edits`, `plan`, `auto`, **`skip`** — each with a symbol chosen against a
stated trap (`❯ ? ❙❙ » !!`, with `⏸` rejected because *it IS an emoji — the `⏺`
trap again*, `‼` and `⚡` likewise). The registry's `permissionPostures` carries
five ids and they are **`ask`, `auto`, `accept-edits`, `plan`, `manual`**. Four
agree; the registry has `ask` where §071 has `skip`.

**`skip` is in `calcium-registry.json` only inside `sectionBlocks` text**, never
as a record — which is `↺`'s shape again (question 17), and here it hides a
disagreement rather than an omission. The member they differ on is the one that
means *no permission check at all*, and §092 rules on it separately: *the skip
posture was error — it is a mode, not a failure*. A set of five where the
dangerous member exists in one source and not the other is not a gap to fill by
picking a side.

**And even the four they agree on have no symbol or tone in the registry.** The
`permissionPostures` records carry `id`, `status` and `ruleIds` and nothing else,
where §071 assigns five symbols and five tones (grey, purple, blue, yellow, red)
and rules that **none is painted** — *the distinction is the CHANNEL, not the hue*,
because the error tag is the only painted label that means a status.

**Held**, and §071's census row with it. Two questions in one and they resolve
differently: whether the fifth posture is `ask` or `skip` is the design
contradicting itself, and whether the symbols and tones belong on the records is
a question about the registry's completeness.

---

> **Ruled 2026-09-24.** Already answered: **`+n`**, and the mark is itself a target (focusable; `⏎` expands what it stands for). **Premise note:** the entry records that §104's row is classified `app`. The ruling adopts `+n` as the framework's mark regardless, and that is recorded here so it isn't later read as inferred. **Owed:** `ShedResult.mark` gains an id; C09 I108's reservation goes, because `+` is ASCII at both rungs.

**19 · RULED — What a framework kind draws when it sheds a part from a row.** `shedRow`
composes a bare `⋯n` — the `residue` lead and a count — for the four kinds that
shed: `keyValue`, `events`, `comparison`, `steps`. **The design draws that form
nowhere.** Every `⋯` in the fixtures carries a count *and* a noun (`⋯ 40
unchanged lines`, `⋯ 3 agents`, `⋯ 0 above, 1 below`), and the repo's container
residue row already draws exactly that — so the two agree and this question is
not about them.

What the design does draw, and why none of it settles the row:

- **`+n`** — §104's metric row, `val loss  0.0372  +1`, where `↓ from 0.41` was
  shed. The same row is §085's, and §085 is classified `app`: the application
  composes it, so `+1` may be the application's mark rather than the framework's.
- **`+N more`** — §049's table, §050's output with `⏎ expand`, §021's scrollback.
  All three close a **truncated vertical list**, which in the tree is the
  container residue row, not `shedRow`.
- **nothing at all** — §023, *at 40 columns the drill survives*, is the design's
  own narrow-width section and it declares a shed **order** with no mark: the
  label, the endpoint, the path row and the bar segments simply go.

So the three answers the design gives are for three other subjects, and the one
this row needs is in no fixture. **An earlier pass read §104's `+1` as settling
it and said so**; going to look for where the design draws `events` or
`comparison` shedding is what showed it does not, which is the difference
between a mark the design chose and a mark inferred from a neighbouring figure.

**Two things ride on the answer and are held with it.** §104 also says the shed
count is **focusable** and that `⏎` expands what it stands for — `ShedResult.mark`
is a bare string with no id, so neither is built — and the mark's width tier is
whatever the answer is: `+` is ASCII at both rungs, which would make C09 I108's
reservation correct and no longer load-bearing, where `⋯` keeps it so.

---

> **Ruled 2026-09-24.** Record the 4-bit slots from the repo's pinned maps. **Premise contradicted:** the pinned maps (`four-bit.ts`) hold **no hue entries**. `resolve` answers `NO_STYLE` for a hue at 4-bit (T2.56), and the mechanical map collapses ten hues to six. There is nothing pinned to record, so ten curated slots have to be chosen. A proposal for each theme variant is in the batch.

**21 · RULED — The ten hues at 4-bit — ten ANSI slots the registry does not record.**
C10 I55 landed the hue palette so a block can name `hue.blue` and C10 answers.
At 24-bit that is the registry's hex; at 1-bit it is nothing, which §070 settles
(*the tones mean something; this is you choosing what your terminal looks like*,
and *chrome only — a painted label is furniture*, so a hue is decoration and may
degrade to nothing). **The 4-bit rung is the one the design does not answer.**

**A mechanical map was measured and it is worse than the gap.** `nearestAnsi16`
over the ten inks:

    dark    blue 6  orange 11  cyan 14  pink 8  lime 11  violet 13
            yellow 11  green 6  red 9  purple 13        6 distinct
    light   7 distinct

`blue` and `green` both land on 6; `orange`, `lime` and `yellow` all on 11. Ten
identities become six, which is the failure §093 reordered the hues to prevent,
arriving at a different rung. **That is why `DARK_FOUR_BIT` is curated** rather
than quantised, and a curated hue map is the same kind of work: ten choices, of
which at least five have no ANSI name to fall back on — `orange`, `pink`, `lime`,
`violet`, `purple`.

**And 4-bit is the only rung that loses them.** At 8-bit the ten resolve to
**ten distinct `ansi256` indices in every one of the ten themes**, because
`quantiseSet` quantises a palette **as a set** and so can hold distinctness,
where a per-slot neighbour cannot. Sixteen colours leave no room for a set to
spread into; 256 do. So this is a question about one rung rather than about
degradation in general.

**What is in place meanwhile, so nothing is silent.** `resolve` answers
`NO_STYLE` at 4-bit and T2.56 asserts that rather than leaving it to be found;
the 4-bit gate's skip list is compared **by equality** against the palettes each
theme carries, so `hue` cannot be joined by a third in silence; and C10 I55
carries the measurement above.

**The question.** Is a curated ten-entry 4-bit hue map wanted — and if so, does
it belong in the registry beside the other 300 hue tokens, where the design
would own it, or in `four-bit.ts` beside the curated maps the repository already
holds? Both are defensible and the first is the one this reconciliation's
authority points at, which is why it is asked rather than taken.

> **Ruled 2026-09-24.** **Yes**: build §105's five primitives, together with the divider's chord and the scrollbar's. **Owed.**

**20 · RULED — Whether this reconciliation builds §105's five primitives.** §105 draws a
tree, a form, a split, a command palette and a toast, and says *each is built
from what already exists* and *the framework already had every part — what it
lacked was the name*. **Checked part by part, the claim holds.** The tree's
guides are `decoration` and its twisty is `content`, which is `shed.ts`'s `Tier`;
the form's error uses the registry's `failure` mark and C10's tone, introducing
no visual idea; the split's divider is drawn `│` with `┃`, which is the
**scrollbar's own `track`/`thumb` pair**, `| #` at the ASCII rung, degrading
whole by §021's rule already; the palette's parts are a panel, a ladder and a
residue, all shipped, and its `+58 more` is the container residue row the tree
already draws; the toast's rule is §13's argument about notifications restated.

**So nothing here is blocked on a missing part, and none of the five is a kind.**
The question is scope, not feasibility. The sixteen-MR plan names none of them,
and §105's own opening is that *a general app wants these and the agent surface
does not, so they were missing rather than refused* — which reads as a proposal
for a general application, not as a divergence this repository has. Five new
block kinds is the largest single piece left in the census and it is not on the
plan, so it is asked rather than taken.

**One thing the answer would settle either way**: §105 gives the divider
`⌥←→ from either side` and calls it *the SCROLLBAR's rule on the other axis* —
and the scrollbar has no such chord in the tree either. A split would land a
binding for both, or neither.

---

> **Ruled 2026-09-24.** Each scrollable box draws **its own bar in its own last column**. **Premise note:** `R-BLK-165` (`example`) calls two bars for one document a layout error. The ruling overrides an example, which does not bind, so no `current` rule is contradicted. **Owed.**

**22 · RULED — Which box draws the bar when two scrollables nest.** M14's plan says
*two bars for one document is a layout error and is asserted as one*, from
`R-BLK-165`: *two bars is legal when they are two documents. Two bars for one
document is a layout error.* Its catalogue is `["first-document",
"second-document"]`, so the legal case is one bar each in two documents.

**The broad reading was built and measured, and the measurement refused it.**
A document-wide count of `scroll` boxes went into `validateDocument` beside
C04 I14's id-uniqueness walk, which is the same shape — accumulate over the tree,
refuse at the document. Run against the full suite it failed **once in 7493**:

    FAIL test/unit/session-mouse.test.ts
      × T1.105 (C16 I48, R-SEL-012): a scroll inside a scroll takes the wheel
        at the depth the pointer is in
      TranscriptError: transcript.append: invalid document (C13 I10) —
        blocks: 2 "scroll" boxes in one document — "outer", "inner"

One failure, and it is the one that decides the reading. `R-SEL-012` is
**`status: "current"`** — *the wheel takes the **innermost** scrollable under
the pointer* — and the word *innermost* has no referent unless scrollables
nest. `R-BLK-165` is **`status: "example"`**, a §021 section-block specimen.
`AUTHORITY.md`'s precedence names `status: current` as the normative tier and
nothing below it, so the count over boxes is refused by the design's own ladder
rather than by the repository.

**What survives the ladder is not vacuous, and it is not buildable without a
choice.** Nesting is legal and the inner box takes the wheel; that leaves the
bar. `barOf` (`containers.ts:333`) decides per box from its own overflow, so a
nested pair that both overflow draws two — which is the picture `R-BLK-165`
calls a layout error, arriving through a layout `R-SEL-012` requires. The
reconciliation is available and the design does not make it:

- **the innermost box containing focus draws, the outer draws none** — §021
  already gives focus a rôle on the bar (*the thumb takes the accent when its
  container has focus*), so the reader's box is the one answering *where am I*;
- **the outermost draws and the inner declines** — the bar describes the
  larger extent, which is the one a reader is lost in;
- **both draw and the sentence is about the transcript's bar meeting a block's
  bar over the same rows** — a case the framework cannot construct, which
  makes the rule A03 §2's vacuity class rather than a gate.

Each is a **visible** difference — which bar is on screen — and §021 settles
none of the three. Taking one would be inventing the picture, so it is parked
rather than ruled. **Nothing is asserted in the meantime**, because the only
assertion available without the answer is the count the measurement just
refused.

---

**23 · Does §101's `completion` row answer twice?** M15's last deliverable is
`promptUnderMenu`'s hardcoded exemption, whose comment has long said what it
needed: *named rather than derived because no field distinguishes them from a
search — which is a gap worth closing and not a rule to guess at.* The walk is
now done and written as C22 §6l.9b, and it found the cell.

**Three sites ask *who owns the keystroke* by comparing a layer id** —
`promptUnderMenu`, the menu's forward (`construct.ts:3328`) and the search's
own arm (`:3336`) — and the kind cannot stand in for them, because `panel`
carries the chip preview, the menu and the search alike. So far this reads as
one rule with three instances.

**It is two properties, and they part in exactly one cell.** *Where a printable
key goes* and *whether the prompt is drawn underneath* agree on five of the six
layers. They disagree on the **completion menu holding a selection**, which
still forwards printable keys to the editor — C19 §8's keystroke cell narrows
it in place — and is nonetheless *a choice being made* rather than *a display
of what is available* (C19 I20), so the prompt is not drawn under it. A single
merged field either draws the prompt under a menu the reader is choosing from
or drops the keystroke that would narrow it, and no assertion about *the menu
is up* can tell either from correct.

**The build was started and stopped at the design's own table.**
`src/shell/question-routing.ts` is §101's six consumers — `approval`, `choice`,
`reply`, `peek`, `completion`, `find` — already answering `replaces`,
`blocking` and `dismissal` as a table rather than six decisions, and it is
plainly where two more columns belong. But `completion` must then answer
*prompt composing* **two ways**, by its selection. The file's own precedent
says how that is resolved — *`approval` and `choice` are kept apart because the
design names them apart*, and `questionConsumer` derives the consumer from
state — so the shape is a **seventh consumer**, split out of `completion`.

**§101's table has six rows, and adding a seventh is writing a row into the
design.** That is the question. Three answers, and the middle is the one I
would take:

- **split `completion`** into the available and the choosing states, as a
  seventh consumer the registry gains;
- **keep six rows and put the second property on the layer**, carried by
  `update` alongside `content` and `placement` when the selection moves — which
  works, and means one of the two properties lives outside the table that owns
  the other;
- **leave the three id comparisons**, on the grounds that five-of-six agreement
  is not shared shape enough to be one rule.

A field that is static where the menu's answer is not would read correct and be
stale the moment `↓` is pressed, which is worse than the ids — so nothing was
wired. The type change was written, compiled against the tree to find all six
construction sites, and reverted; C22 §6l.9b keeps the table that found the
cell.

---

**24 · RETRACTED — `R-TBL-001`'s violators are mostly inside the kit, and the
scope argument that parked this was measured on one of four.** `R-TBL-001` is
`status: current` — *text aligns to inline-start and numeric values align to
inline-end* — and it is stated as a fact about what happens, not as a default a
caller may override.

**The mechanism to implement it is already in C11 and carries its own
argument.** `src/presentation/table/cells.ts`'s `decimalPoints` derives a
column's point **from the column's own cells and never authored**, because *a
declared one is a number the planner can contradict when a column yields width,
with nothing to report the disagreement*. Alignment is the same sentence one
level up: a declared `left` on a column of numbers is a claim the data
falsifies, and nothing reports it.

**The obstacle was stated as a scope boundary, and the count is what refutes
it.** The question read `src/data/adapters/fallback.ts` `columnsFor` as *the one
place the framework itself builds columns out of data*, and that file is **C07**,
which `AUTHORITY.md` leaves untouched. Grepping the tree for the field rather
than for the adapter returns **four** authors of a hardcoded `align: "left"` on a
`ColumnDef`, and three of them are in scope:

| site | component | shape |
|---|---|---|
| `src/data/adapters/fallback.ts` `columnsFor` | C07 — out of scope | hardcoded, no override |
| `src/data/viewmodel/markdown.ts` `columnsOf` | C04 — **in scope** | hardcoded, no override |
| `src/shell/builders/index.ts` `col` | C22 — **in scope** | a **default**, overridden by the caller's spec |
| `src/shell/confirm.ts` | C22 — **in scope** | three columns, authored per use |

So the rule does not *hold where nobody was going to break it*: it is broken by
C04's markdown tables and by every table a surface builds through `col()` without
naming an alignment, both of which this work owns.

**And `col()`'s own comment says the field is a default there, not a
declaration** — `align: "left"` sits in the same object as *`priority` and
`minWidth` have no principled default — 50 and 8 are the middle of the range C11
plans over — so a surface that cares sets them, and one that does not gets a
column that survives planning.* The question's third shape — make `align`
optional, derive when absent, leave an explicit declaration alone — was dismissed
as *nothing would change*, and that is false for the same reason: it changes
every table built through `col()` that never names one, which is most of them.
C07 keeps its explicit `left` under that shape and needs no ruling, so the scope
boundary survives intact rather than being crossed.

**What the derivation is, and it already exists.**
`src/presentation/table/sort.ts` `kindOf` classifies a column
`numeric | duration | text` **from the values present in it**, with the agreement
rule stated — *one `AUC 0.912` in a column of numbers makes the whole column
text, because a comparator that returns null for some of its input is a
comparator with no defined order* — and with its own note on a window
re-classifying (F429). It is unexported and `sortedRows` is its only reader. That
is the same derived-from-the-cells shape C11 I26 argues for the decimal point,
one level up, already built and already tested.

**So this is not a question.** It is `align` becoming optional, `kindOf` becoming
C11's rather than the sort's, and the default following the kind.

---

> **Ruled 2026-09-24.** **Tie-break 2.** The premise holds: 28 figures draw two columns and none draw three. `R-STR-003` is superseded to **two**. **Owed:** the registry edit. No golden moves, because the tree already draws two. **Built 2026-09-25:** `R-STR-003` → `R-STR-005`; nine citations moved with it.

**25 · RULED — The design's own figures draw two columns where `R-STR-003` says
three.** The rule is `status: current` — *every nested level costs three
columns* — and it is the only place in the kit that says three.

**Measured over all 130 fixtures.** Taking every `⎿` row and the head above
it, and the step as the difference between the two content columns: **28
instances at two columns and none at three.** The nine remaining are step 0,
where the line above is the `✦` activity line, which is not a parent. So
the figure the rule states appears in no drawn frame the kit ships.

**The repository already draws the design's figure rather than the design's
prose.** `GLYPH_INDENT` and `prefixCells`
(`src/presentation/blocks/kinds/simple.ts`) give a head two cells and `⎿`
four, so content moves from column 2 to column 4 — the same two-column step, by
arithmetic rather than by coincidence, since `prefixCells` *is* the hanging
indent.

**Which leaves the question the brief reserves.** The design contradicts itself
here: 28 figures against one sentence. Taking the sentence changes every nested
row in every golden and puts the repo out of agreement with the kit's own
fixtures; taking the figures amends a `current` rule's text, which is a change
to the normative source and not mine to make. The second clause — *nesting is
limited by width while the deepest child still clears its own minimum width* —
is unaffected either way and stays owed on its own account.

---

> **Ruled 2026-09-24.** Register trend `↑`/`↓` with ASCII `^`/`v` in the **inline** domain. **Premise note:** `↑`/`↓` were never sort's. Sort is `▴`/`▾`, with ASCII `^`/`v` in `table-header`. What is freed is sort's *ASCII*: trend takes `^`/`v` in a different domain, which the domain model allows even though a trend cell and a sorted header sit in one table. **Owed.**

**26 · RULED — The trend arrow has no glyph record, and the sort marks are not it.**
§088 §4 draws a metric's trend as `↓ from 0.41` and `↑ from 0.62`, and
`R-COL-006` makes the arrow's **tone** carry the polarity. Everything else
about the rule is settled — §086 puts the metric in a table cell, so the
declaration belongs on the column, and the tone follows from the delta's sign
against the declared direction with nothing left to choose.

**The arrow is what has no record.** Searched every `glyphs` and `delimiters`
entry in the registry: **no record carries `↑` or `↓`.** The nearest pair is
`sort-asc` / `sort-desc`, which are `▴` / `▾` with `collisionDomains:
["table-header"]` — a different mark in a different domain, and substituting
them would be drawing a character the design did not draw, which is the thing
this reconciliation exists to stop.

**So the ASCII rung is the open choice**, and it is not free: `R-DEG-001` says
every distinction survives to one-bit, so the direction needs a carrier at the
ASCII rung whatever it is. `^`/`v` are taken by `sort-asc`/`sort-desc`'s ASCII,
which is the collision the domains exist to prevent — unless a table cell and a
table header are ruled to be one domain, which is itself the question.

I can build the polarity field and the tone resolution without it, but the row
cannot be drawn, so the rule would not be satisfied by what landed. Better to
ask than to mint a mark.

---

> **Ruled 2026-09-24.** Build the mechanism and the display now; the missing sources arrive with their producers. **Premise note: this doesn't answer the entry's first sub-question.** Both earning tables are `example` prose, so no tie-break decides between them. Taken unless you say otherwise: §088 §3's five rows **plus** §014's *the model failed*, because a silent drop is not a decision. The rungs are §014's as drawn (bell, OSC 9 / OSC 777, OSC 2). The reader-declared watch is built as a declaration that producers fill. **Owed.**

**27 · RULED — `R-NTF-001` says *the declared completion notification* and nothing
declares one.** The rule is `status: current` and it is the **only** current
rule in the registry about watching. Everything that would give it a subject is
`status: example`, which `AUTHORITY.md` says does not bind — and the two
examples disagree.

**The earning table, twice.** §014 lists four rows: a waiting question always,
a turn ended if it ran over ~30 s, **the model failed always**, a tool call
never. §088 §3 revises it to five — it adds *a WATCHED RUN ended* and *a
watched run FAILED*, both marked **new**, keeps the question, the turn and the
tool call — and **drops *the model failed* without saying so**. A later section
revising an earlier one is ordinary; a row vanishing silently in the revision is
not, and I cannot tell a decision from an omission.

**The rungs have no record either.** §014's three — the bell `␇` on turn end
when the window is unfocused, OSC 9 / OSC 777 where the terminal has it, OSC 2
for the title — are `example` text. There is no glyph, delimiter, capability or
catalogue record for any of them, so *which* terminals get OSC 9 against
OSC 777 is undeclared, as is the notification's wording. `escapes.ts` emits none
of the three today, so nothing in the tree contradicts the design; there is
simply nothing to build **to**.

**And the subject itself may be out of scope.** A *watched run* is a run the
reader has asked to be told about, and the tree has no such thing: the
`watch(id)` in `src/shell/refresh.ts` is the **stall detector's** map of
streaming entries watched for silence — a homonym, F161's shape a third time.
Building the reader-declared watch means building a run-lifecycle affordance,
and the brief puts process outside this work. The notification and the *without
moving the reader* clause are squarely interaction; the watch that earns one may
not be.

So three answers are needed before this can land: which earning table binds and
whether *the model failed* survives; what declares the rungs and their wording;
and whether the watch itself is mine to build.

> **Ruled 2026-09-24.** Build the mechanism and the display now. `default` shows today; `config`, `env` and `flag` rows arrive with their producers. **Owed.**

**28 · RULED — `R-HON-008`'s display is fully specified and three of its four sources do
not exist.** §075 — *`/config` — and the third column is the one that matters* —
draws the whole surface: a three-column table `key · value · source`, four
sources on a tone ladder (`default` muted *nobody chose it*, `config` meta, `env`
warn, `flag` error, ordered because *the later it is applied, the louder it is*),
per-directory precedence with the checkout's file winning, and the argument for
the column at all — *a config view without a source column is one you cannot
debug: the commonest question is not what is it, it is WHY is it that.*

**Nothing about the appearance is open.** The table, the ladder, the tones and
the wording are all drawn. What is missing is the subject: `src/shell/config.ts`
resolves a caller's value against a framework constant at a `??` that keeps
neither, the tree **reads no config file**, **parses no flags**, and reads
`process.env` only inside `src/terminal/capabilities.ts` because A02 forbids it
anywhere else. So three of the four sources have no producer, and the fourth —
`default` — is the only one a `/config` view could truthfully print today.

**This is the scope question, and it is why the item is here rather than
built.** Building config-file loading, environment reading and flag parsing is
configuration plumbing; the brief puts appearance, interaction and navigation in
scope and *transport, manifest, adapters, process, history and the profiler*
out, and this is not on either list. It is closest to the second.

**The two shapes it could take, so the answer is one word.** Either the four
sources are built and `/config` draws them — which is a real feature in a part
of the tree this work has not touched — or the rule is read as binding **where a
provenance exists**, in which case its capability half is the live subject:
`CapabilitySource` is `declared | stated | inferred | assumed | unreachable`,
`Answer<T>` returns a value with its source, all ten capability fields carry
one, and **nothing reads them** — `Detection` is unexported and `.sources` has
two test files as its only consumers. That half is a display over a record that
already exists, which is squarely appearance.

*(Not the same provenance. §075's four are configuration layering; the tree's
five are capability detection. A row reading them as one question would be the
homonym this ledger has now hit four times.)*


> **Ruled 2026-09-24.** An ARIA-derived role vocabulary, with linear output per the access spec in M12. **Premise contradicted:** the plan's M12 is **the trust boundary** (escaping untrusted text), not access. The access spec is §107. Taken as: the ARIA table proposed in this entry, and the linear line form it proposes, both under §107. **Owed.**

**29 · RULED — `R-ACC-001` — §107 fixes the semantic node's fields and neither its role
vocabulary nor a line of linear output.** Nothing of §107 exists in the tree: the
element record is `{id, level, rows, cols}` plus `activate` and `viewState`, so one
of the nine fields is built, and there is no linear renderer, no mode selection,
no announcement policy and no `/capabilities` for the route to appear in.

**What the design settles, and would be built unasked:** the nine fields (*id,
role, name, description, value + valueText, state, position, actions,
relations*), that **everything drawn** has a node rather than only what focus
reaches, that linear mode uses no alternate screen, mouse tracking, repaint or
animation and never rewrites an emitted event, and that announcements come from
semantic events with `none · polite · assertive`, deduplication and rate limits.

**What it does not, which is why the item is here — two wording gaps:**

- **Roles for the kinds §107 does not name.** It lists *entry · question · button
  · link · table · row · figure…* and the tree has twenty-five kinds. The
  proposal is **ARIA's vocabulary wherever §107 is silent**, because §107's own
  list is already mostly ARIA and a screen reader speaks those names: `progress →
  progressbar`, `status → status`, `rule → separator`, `logs → log`, `pills` and
  `steps → list`, `choice → radiogroup`, `control → slider`, `tape → tablist`,
  `notice → note` (`alert` when its tone is `error`), `plot`/`mosaic`/`image` →
  §107's own `figure`, `panel`/`scroll`/`group → group`, `code`/`raw`/`terminal →
  document`. One word — *yes* — adopts the table; anything else is a list to
  correct.
- **The text of a linear event.** §107 says what an event carries — numbered
  choices, a labelled line editor, start / milestones / blockage / completion,
  coherent batches of prose — and never how a line reads. The proposal is the
  node's own fields in a fixed order, no glyph and no colour: `entry 3 of 18:
  pytest tests/unit — running`, then `entry 3: pytest tests/unit — failed, 4s`;
  `question: which branch? 1 feat/c26, 2 main, 3 type a name`. §107's *name
  without colour, position or punctuation* is why the position is a separate
  clause rather than part of the name.

**And it inherits question 28.** §107 selects linear mode by `--linear`,
`CALCIUM_RENDER_MODE=linear` or persistent config, and the tree parses no flags
and reads no config file. The environment half is buildable today —
`src/terminal/capabilities.ts` is where A02 allows `process.env` — so if 28 is
answered *where a provenance exists*, linear mode is selectable by the
environment and by `auto`, and the flag and the file wait with 28.

**Held entirely rather than half-built.** A semantic tree with roles for five
kinds of twenty-five, or a linear stream with no settled line, is the frame with
nothing in it — and it would be read as coverage.
---

> **Ruled 2026-09-24.** `R-MOT-011` applies **per rung**: sets that collapse to one ASCII alphabet share an interval at that rung. **Owed.** **Premise note, 2026-09-25:** the ruling says the sets share an interval and not which, and the registry records none — `|/-\` is at 80, 90, 100, 110, 120, 120, 130, 140 and 140 ms across nine sets. Choosing one is a visible timing value, so the choice is parked as **40**. The strobe the entry named as *a defect either way* is specified as C09 I112 and C22 I74's amendment. **Strobe built 2026-09-25:** `tick` counts 80 ms `TICK_MS` ticks and every renderer steps through `spinnerFrameAt`, so `agent` walks at its 120 ms rather than the wake's 80 (T1.78, T1.79, T2.175, T4.17v). The interval half waits on 40.

**30 · RULED — The registry gives one ASCII alphabet to sets at different intervals, and
`R-MOT-011` says a shared alphabet shares an interval.** §039: *SETS THAT SHARE
GLYPHS SHARE AN INTERVAL* and *NOTHING varies its rate at runtime*. The registry's
own `asciiPattern` records give `|/-\` to nine sets between 80 and 140 ms
(braille, orbit, circleQuarters, boxBounce, boxBounce2, circleHalves, pipe,
braille2, arc), `.oO@Oo` to six (growVertical at 100, the rest at 120), and `0-f`
to hex at 110 and binary4 at 120. In the primary frames hex and decimal share
digits. `R-MOT-010`'s *fit-cycle* keeps each set's own cycle, which pulls against
one cadence per alphabet. **Which is it** — does the ASCII rung take one
interval per alphabet (and which), or are ASCII rungs outside the rule's domain?
The tree's own strobe (one tick at the fastest on-screen interval, so `toggle`
at 400 ms steps at 80) is a defect either way and is built regardless.

---

> **Ruled 2026-09-24.** To be proposed with 12 as one table, for approval in a batch.

**31 · RULED — Thirteen ramps declare `attentionGroup: "unclassified"`.** `R-MOT-012`
says every ramp declares its attention group, and the group is what decides what
`reduced` stops (C09 I99). `rampPolicy.attentionGroups` lists fifteen; the other
thirteen — eight of them animated: sweepbar, converge, heartbeat, typewriter,
marquee, ripple, neon, bookend, scatter — carry `unclassified`. Classifying them
is a visible choice (what still moves under `reduced`) the design has not made.
The direction clause of the same rule is built and checked separately.

---

**32 · Posts or slant for counted work, and no glyphs for a sub-cell braille
bar.** `R-PRG-002` says *discrete steps use posts* and *sub-cell progress uses
braille*. §033 draws `▮▮▮▮▮▯▯▯ discrete steps — five of eight` in posts; §035 and
§036 draw counted work in slant — *compacting ▰▰… 3 of 5 turns*, *indexing …
412 of 1,847 files*. The tree maps `granularity: "segmented"` to slant. And the
registry's braille bar is whole-cell `⣿` or space, with no sequence for *eight
positions per column*. Two visible choices: which alphabet counted work takes,
and the sub-cell braille ramp.

---

> **Ruled 2026-09-24.** Selection's second carrier is **the `▌` selection rail** (§017). `R-THM-003`'s *only carrier* is superseded to *only ground-level carrier*, and the rail is asserted. **Note:** `▌` is also the prompt's caret (the `bar` slot). The two are in different domains (the transcript's gutter and the prompt), so this is not a collision, but the rail's domain has to say so. **Owed.**

**33 · RULED — `R-THM-003` says the ground is selection's only carrier; `R-COR-003` and
`R-COL-004` say no interaction distinction has one.** R-THM-003: *the selection
band keeps 3 : 1 against the page, because the ground is selection's only
carrier*. R-COR-003: *every actionable, status, and interaction distinction has
two independent carriers*; R-COL-004: *an interaction ground is never the only
carrier*. C10 §4k.5's carrier table records selection as *ground alone*. At 1-bit
the tree answers with inverse (`selectionStyle`), which is a second rendering of
the same carrier rather than a second carrier. **Does selection owe a mark** —
§017's `▌` gutter is the candidate — **or is selection the named exception**, as
`linear` is for R-COR-003's matrix?

---

> **Ruled 2026-09-24.** **Tie-break 4.** Streaming is carried by the head spinner and the elapsed count, so the trail may be ground-only. **Owed:** `TRAIL_HEAD`'s *the gap is parked* comment is replaced with this ruling. **Built 2026-09-25** (d3f03faf).

**34 · RULED — §026's `fade` trail draws the sole carrier at the ground, and `R-MOT-004`
forbids exactly that.** §026: *the newest character IS the ground and emerges
toward the ink*. R-MOT-004: an animated frame on meaningful text is contrast-safe
in every frame and never the sole semantic carrier. `TRAIL_HEAD` gives `fade` a
`muted` head (floor 2.5, below the 4.5 text floor) and its comment says *the gap
is parked* — **and it was not**: no entry here named it until this one. Does
`fade`'s head clear the text floor (and so not reach the ground), or is a
streaming head exempt because the text is still arriving?

> **Ruled 2026-09-24.** The count reads **`418 chars · 9 rows · 2 entries`**, in the footer. **Premise note:** no fixture draws a count. §103's footer has none, which is why this was parked. The wording is new and yours. **And the mechanism differs:** `semanticSelectionCount` counts blocks, while the ruled form counts the copy text's characters and rows and its entries. **Owed.**

**35 · RULED — Semantic copy mode's count has no drawn form.** `R-SEL-009` names *the
count* among the three things that redraw while frozen, and `R-SEL-015` defines
it — *the size of what return would copy right now* — but no fixture draws it:
§103's copy footer is `copy ←→↑↓ extend ⏎ copy esc out · the screen is frozen`,
and §044 marks selected elements with `▌` and no total. The number exists
(`semanticSelectionCount`, `src/shell/session.ts`) and nothing reads it. Its
**wording** (`3 blocks`? `3 selected`? a bare `3`?) and its **place** (a chip in
the footer, beside `copy`, or in the prompt rule's label) are both visible
choices. Question 4's shared chip is adjacent and separate: that one is which
mode's label the rung shows, this one is what the count says and where.

**36 · OPEN — `R-SEL-007`'s rectangular selection has a label and no way in.** Ruling
5 gave the mode label, `RECT 12×4 · cells, not source`, and the clip and the
escape-free cells are built (`rectBetween`, `cellTextOf`, C14 I42, I43). But the
registry holds no rectangular action and no binding, and neither the HTML nor any
fixture names a chord for it, so the label has no state to be drawn in and the two
built functions have no caller. A chord is a visible choice the design does not
make. **Proposed, (a) recommended**:

- **(a) `⇧←` / `⇧→` in semantic copy mode begin a rectangle.** No new chord: the
  registry already binds `selection.left` and `selection.right` (binding.012,
  binding.013), and at block granularity they have nothing to extend. §103 draws
  the copy footer as `copy ←→↑↓ extend`, so the design's own footer gives the mode
  a horizontal axis the block selection cannot use. `⇧↑` / `⇧↓` stay block-wise
  until a horizontal key is pressed. ASCII: `S-left` / `S-right`, per ruling 15.
- **(b) `⌃v` in semantic copy mode toggles a rectangle**, vim's block-visual,
  beside the `v`/`V` the mode already takes. One new chord, delivered as `0x16` on
  every terminal, and free in the registry and the repo at that rung.

**37 · OPEN — A trend with no movement.** §088 §4 draws a trend going down and a
trend going up, and `R-COL-006` gives each a tone from the metric's polarity. It
draws no reading that did not move, and `from === to` is ordinary data — a metric
that held. **Taken unless you say otherwise** (C11 I30): no arrow, the text alone
(`from 0.41`), in the default tone, since a flat reading has no direction to be
good or bad about. The alternative is a third mark (`→`, or `=` at ASCII), which
is a glyph the registry does not record.

**38 · OPEN — Ruling 26's `v` collides with disclosure's `v` in a content row.**
Ruling 26 gave the trend `^`/`v` in the `inline` domain, on the premise that the
domain model separates it from sort's `^`/`v` in `table-header` — which it does.
**It does not separate it from `collapse`'s `v`**: the registry's
`collisionDomains` puts `row-lead` and `inline` both inside `content-row`, and a
table row can hold an expanded row's marker (`v`, the expand column) and a falling
trend in the same row. SS64 refuses exactly that pair (F1246). `^` is free in the
content row and stays. **Proposed, (a) recommended**:

- **(a) `trendDown` takes `V` at ASCII** — the same shape, a different character,
  free in every domain. The cost is that `v` and `V` differ by case alone, which is
  weaker than `^`/`v` differ.
- **(b) `collapse` moves off `v`** and the trend keeps ruling 26's pair. `v` has been
  disclosure's since before M4, and every ASCII golden with an expanded row moves.
- **(c) `trendDown` takes `_`** — free, and reads as *low* rather than *down*.

The rest of `R-COL-006` is specified (C04 I128, C09 I111, C11 I30) and waits on this
alone, because a glyph slot is a pair and has no ASCII half to ship without.

---

**39 · OPEN — What a collision inside a spinner set is.** Ruling 11 put spinner frames
in their own domain, the duration slot, and said collisions are checked only within a
set. **The premise that the static test applies inside a set does not hold.** Every
set's `ascii` aligns with its `frames` index for index (27 of 27), and SS64's test — one
ASCII character painted by two different Unicode marks — fires on **12 of 27**:
`agent`, `braille`, `braille2`, `orbit`, `grow`, `bloom`, `starfield`, `fullramp`, `arc`,
`growVertical`, `growHorizontal` and `pipe`. Every hit is the ASCII rung
downsampling on purpose — `braille`'s ten dots onto the four rotation frames,
`arc`'s `◜ ◠` held as `| |` — and none is a frame a reader mistakes for another mark.
Measured with a probe over `SPINNER_SETS` at HEAD. **Proposed, (a) recommended**:

- **(a) Within a set, the ASCII rung must move**: no set's ASCII frames are all one
  character, so a fallback cannot freeze an animation into a still mark. Nothing
  fires today, and a set added with a constant ASCII half would.
- **(b) Within a set, nothing is compared** — the domain is the whole ruling, and
  SS64 records the frames as classified so a new set cannot enter a static domain.
- **(c) Within a set, consecutive frames differ** at ASCII — which refuses the holds
  `arc` and `growVertical` draw on purpose, and so moves eleven fallbacks.

C09 I99 records the first clause, and SS64 reads no frame until this is answered,
because a set compared with nothing is a rule with nothing to be wrong about.

---

**40 · OPEN — Which interval a shared ASCII alphabet takes.** Ruling 30 applies
`R-MOT-011` per rung — sets that collapse to one ASCII alphabet share an interval at
that rung — and the registry records no ASCII interval to share. Measured from its
spinner records: `|/-\` is nine sets at 80, 90, 100, 110, 120, 120, 130, 140 and
140 ms; `.oO@Oo` is six, five at 120 and `growVertical` at 100; `0–f` is `hex` at 110
and `binary4` at 120. The number is visible — it is how fast the ASCII rung turns.
**Proposed, (a) recommended**:

- **(a) 120 ms for all three** — the mode of `.oO@Oo`, the median of `|/-\`, and one
  of the two members of `0–f`. One cadence for the ASCII rung, which is §039's
  *nothing varies its rate*.
- **(b) The alphabet's most common member**: 120 for `.oO@Oo`, 120 or 140 for
  `|/-\` (a tie), 110 or 120 for `0–f` (a tie) — which needs (a)'s rule to break
  both ties anyway.
- **(c) The slowest member's interval** — 140, 120, 120 — on the argument that an
  ASCII frame changes more of the character than a braille dot does, so it reads
  as busier at the same rate.

---

## Not yet recovered

The gap between the entries and the running count in the per-MR reports was chased and closed: some questions had been counted twice. The list is the count. **No total is stated here in prose**, because the one that used to be here said *sixteen* long after that stopped being true — this file's own subject, arriving inside it.
