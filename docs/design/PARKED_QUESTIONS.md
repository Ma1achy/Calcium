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

**Open: none.** Ruled 2026-09-27: 18, 23, 32, 36, 37, 39–54. Every other entry is ruled or retracted. *Recounted 2026-09-27 from the headings*: the line read *18, 23, 32, 36, 37, 39, 40* while 41–51 were headed OPEN below it, so eleven open questions were missing from the summary that says which are open. A ruled entry keeps its body, with the ruling directly above it and a premise note wherever the ruling rested on something the entry or the design contradicts.

> **Ruled 2026-09-24.** Already answered, by the chain rule. The repo-side spec (C09 §4, I5) carries the narrowed rule and the registry does not. That assumption stands as the answer.

**1 · RULED — `R-GLY-001` cannot carry the fixed-column restriction.** The rule is
released: its text is sealed by the baseline anchor, and it cannot be superseded
either, because three released history rules name it as their successor and a
successor must be `current` — a link the immutability lint forbids redirecting.
Adding a bare new `current` rule would leave two `current` rules contradicting
each other, which is worse. **Done under assumption:** the repo-side spec
(C09 §4, I5) carries the narrowed rule and the registry does not.

> **Ruled 2026-09-24.** Each rung takes its **natural width**. The fixture's `⋯ 5 more` is exact at two cells, and the no-column-moves guarantee is given up. **Owed:** the three-cell slot is retired, and the plot legend and residue goldens move. **Built** in 263a10cc1 (M4): `FREE_WIDTH_SLOTS` holds `residue`, C09 §4 records the scope, and the pie-legend baselines draw `⋯ 5 more`.

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

> **Ruled 2026-09-24.** Semantic mode reads **`copy`** and native handoff reads **`native`**. **Checked:** fixture 044 draws `⌥⇧C native`, and §103's footer opens `copy ←→↑↓`. **Owed:** the label. **Built** in aae861a0 (C14 I55): the copy rung's footer leads `copy` or `native`, and the header chip `COPY` or `NATIVE`.

**4 · RULED — The copy-mode chrome label's wording.** Both modes now read
`owner === "copy"`, so shipping a second `COPY` would ship a collision. The
seam is built and the label waits on the word.

> **Ruled 2026-09-24.** The label is **`RECT 12×4 · cells, not source`**. **Premise note:** no fixture or HTML page draws this. `cells, not source` is `R-SEL-007`'s own rule text, and `RECT 12×4` appears nowhere in the kit. It was not already answered; it is answered now, and the wording is yours. **Owed.** **Waits on 36, 2026-09-25**: `rectBetween` is built and tested (`copy-rect.test.ts`) and nothing in the session calls it — no action, binding or chord enters a rectangle, which is 36's question. The label has no surface until 36 is answered.

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

> **Ruled 2026-09-24.** Already answered: **the frame is the container's.** A sub-panel's border is not the block's enclosure, and focus lights the container's frame. **Premise measured 2026-09-25: the ruling has no subject in the tree yet.** `smallmultiples` and `pairplot` publish no elements (`registry.elementsOf` answers `[]` for both), so focus never lands on either, and a render handed focus on the block or on a facet draws all four sub-frames `muted` exactly as unfocused. Nothing to build until one of them declares `elements` — **the condition to grep is `elements` on the facet forms in `src/presentation/plot/`**; the day it holds, the container's frame lights and the sub-frames do not. R-COL-005's other frame subject, `panel`, is unaffected and stays in its ledger row.

**14 · RULED — Whether a sub-panel's border is the block's enclosure.** §017 says *a
FRAME takes its border*, and `smallmultiples` and `pairplot` have four. The
design does not say which, and lighting four sub-frames at once is a visible
choice.

> **Ruled 2026-09-24.** Chord glyphs fall back to **text names**, free-width, in help and footer only: `C-`, `M-`, `S-`, `Enter`, `Esc`, `Tab`, `Up`, `Down`, `Left`, `Right`. **Premise note:** that list covers nine of the eleven. It leaves out `⌘` (Super) and `⌫` (Backspace). The proposal, in Emacs's spelling to match the rest, is `s-` and `Backspace`, in the batch. **Owed:** `chordText`'s shorthand (`s+enter`, `m+C`) is replaced. **Specified 2026-09-25** as C16 I58, with `⌘`/`⌫` spelled `s-`/`Backspace` under the batch proposal's assumption. **Built 2026-09-25** (aba41404), with `Home End PageUp PageDown Delete` added to the list — the first draft stopped at `Backspace` and `/help` printed `C-home`. **A finding on the way**: the owner line held its own ASCII table, which spelled `↑↓` two ways and wrote `⌃c` against the registry's `⌃C` at the Unicode rung — so it now asks `chordText` too.

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

> **Ruled 2026-09-24.** Register `↺` with a proposed ASCII fallback, which is in the batch. **Owed:** the glyph record. **Specified 2026-09-25** as C09 I114: `GlyphSet.revert`, ASCII `<` proposed. **Premise note:** `~`, the first reach, is `nested`'s ASCII in `row-lead`, and `content-row` holds both `row-lead` and `inline` — so the fallback had to be free in both, and twenty-one marks plus the registry's `@ # $` were already spent.

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

> **Ruled 2026-09-27.** **Neither list.** Postures are the agent application's concept; the framework reserves `posture.cycle` and nothing else, so it does not hard-code five. **The rule that matters is recorded instead: an application declares its postures, and a posture that skips permission checks is drawn loudest — `error` tone plus a mark — is never the default, and is never reached silently by cycling.** Both conflicting lists — §071's five with `skip` and the registry's `permissionPostures` with `ask` — are superseded by that rule, and the application (agent-tui) defines the actual five. **The rules it disposes of**: `R-PER-001` (the posture registry) becomes a registry of the application's declared postures rather than the framework's five, and `R-COL-001`'s blocked clause — *override red means unsafe override* — is answered: the skipping posture is the override, and its red is the `error` tone this ruling gives it. **Owed:** the rule registered as a successor through the builder (released records are not edited in place), the `permissionPostures` records marked superseded, and a `posture.cycle` that refuses to land on a skipping posture without saying so.

**18 · RULED — The two normative sources disagree about the five permission postures,
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

> **Ruled 2026-09-24.** Already answered: **`+n`**, and the mark is itself a target (focusable; `⏎` expands what it stands for). **Premise note:** the entry records that §104's row is classified `app`. The ruling adopts `+n` as the framework's mark regardless, and that is recorded here so it isn't later read as inferred. **Owed:** `ShedResult.mark` gains an id; C09 I108's reservation goes, because `+` is ASCII at both rungs. **Premise note, 2026-09-25:** `+` makes the reservation's *rung dependence* moot, not the reservation — `shedRow` must still take the mark's cells out of the budget first, or the clamp cuts the mark (I108's `..~`). The reservation stays at `1 + digits`. The id lands on the element and not on `ShedResult`: the mark is published as a `row` element whose `detail` lists the withheld parts, on the table's dropped-column precedent (C09 I113). *Focus lands on the `+n`* has no subject yet — these kinds' parts are not elements. `⏎`'s expansion form is parked as **42**. **Built 2026-09-25** (C09 I113, T1.80–T1.82, T4.59).

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
> **Tree built 2026-09-25** (C04 §3ap, I129–I131). Its twisty is the hollow disclosure pair, not §105's filled one, because `▸` has been focus since R-BLK-928. Its indent is capped by the widest visible name, one number for the whole block. A tree is kept whole in a bounded box: its ladder is chosen over every row, so a slice would pick a different rung. **Toast built 2026-09-25** (C22 §6l.13, I116). It lives in the footer's tail for 2 s, as §012 draws it, and its first consumer is `y`'s copy. §105's `3s` is not drawn: §105 does not say what the figure counts, and §012 draws the same toast without one. **Split built 2026-09-25** (C04 §3aq, I132–I134): the divider is block data, a blank column follows it, and `⌥←→` moves it. **Form built 2026-09-25** (C04 §3ar, I135–I137, C22 I118): a field borrows the prompt's one editor, a key it does not own passes to `global`, and no action dispatches while it holds the line; its one-cell indent is parked as 47. **The palette is the one still owed, and it waits on 45** — everything it draws is built, and the way in is the question.

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

> **Ruled 2026-09-24.** Each scrollable box draws **its own bar in its own last column**. **Premise note:** `R-BLK-165` (`example`) calls two bars for one document a layout error. The ruling overrides an example, which does not bind, so no `current` rule is contradicted. **Owed.** **Measured 2026-09-25: the tree already draws it** — `barOf` decides per box, and each box narrows its own content by one column, so a nested pair draws the inner's bar at `w − 2` and the outer's at `w − 1`. Nothing held it. **Specified** as C09 I115, T1.83.

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

> **Ruled 2026-09-27** (by the person). **Keep six rows; carry the second property on the layer.** *Where a printable key goes* and *whether the prompt is drawn underneath* are two properties that part in one cell, so the layer declares the second one rather than a kind or an id standing in for it, and `promptUnderMenu`'s hard-coded exemption is replaced by reading that field. **Built in:** review batch 4 (M15).

**23 · RULED — Does §101's `completion` row answer twice?** M15's last deliverable is
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

> **Ruled 2026-09-24.** Build the mechanism and the display now; the missing sources arrive with their producers. **Premise note: this doesn't answer the entry's first sub-question.** Both earning tables are `example` prose, so no tie-break decides between them. Taken unless you say otherwise: §088 §3's five rows **plus** §014's *the model failed*, because a silent drop is not a decision. The rungs are §014's as drawn (bell, OSC 9 / OSC 777, OSC 2). The reader-declared watch is built as a declaration that producers fill. **Owed.** **Specified 2026-09-25** as C22 §6n (I126–I130), C01 I23–I24, C02 I16–I17 and C16 I61. **Premises taken and one corrected**: a *turn* is an entry, the ~30 s row is 30 000 ms of `meta.durationMs`, and §014's *tool call* row has no subject here. OSC 777 is not built — every terminal the identification names takes OSC 9 by its own documentation, and the one that takes 777 alone cannot be detected. **The watch's producers and footer row are parked as 50; the return line as 51; the rate is 49's.**

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

> **Ruled 2026-09-24.** Build the mechanism and the display now. `default` shows today; `config`, `env` and `flag` rows arrive with their producers. **Owed.** **Specified 2026-09-25** as C22 I115 and C23 I80. **Premise taken:** a `TuiConfig` value is `default` whether the framework or the application supplied it — the reader chose neither. **The verb is parked as 43**: docker-tui ships its own `/config`, and a framework verb of that name is a parse error for it. **And the ladder's two loud rungs as 44**: C04 I6 refuses `warn` and `error` on a cell without a glyph.

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


> **Ruled 2026-09-24.** An ARIA-derived role vocabulary, with linear output per the access spec in M12. **Premise contradicted:** the plan's M12 is **the trust boundary** (escaping untrusted text), not access. The access spec is §107. Taken as: the ARIA table proposed in this entry, and the linear line form it proposes, both under §107. **Owed.** **Specified 2026-09-25, first cut** as C09 §7h (I116–I118): the node, the role table, and five kinds the table did not name — `keyValue`, `comparison` → `table`; `events` → `log`; `patch` → `document`; `tip` → `note`, by ARIA's nearest. The linear renderer and announcements follow.

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

> **Ruled 2026-09-27.** **Counted work uses posts**, per `R-PRG-002` (*discrete steps use posts*); the tree's `granularity: "segmented"` → slant mapping is the thing that changes, and §035/§036's slant specimens are examples (R-SEC-036). **The sub-cell braille bar is owed a proposal, drawn before anything is registered**: a ramp in eighth-cell steps — the left dot column filling bottom to top, then the right — with its ASCII fallback, shown as frames for review first. Batch 4 M16 item 3 carries the posts half.

> **Amended 2026-09-28** (by the person). **The braille sub-cell ramp is approved and registered: `⡀⡄⡆⡇⣇⣧⣷⣿`** (U+2840, 2844, 2846, 2847, 28C7, 28E7, 28F7, 28FF) — eighth-cell steps, the left dot column filling bottom to top, then the right; an empty cell is a blank. The ASCII rung stays whole-cell `#`/`-`. **Owed:** the registry record through the builder and a release, and the bar alphabet's frames, in batch 4's M16 lane.

**32 · RULED — Posts or slant for counted work, and no glyphs for a sub-cell braille
bar.** `R-PRG-002` says *discrete steps use posts* and *sub-cell progress uses
braille*. §033 draws `▮▮▮▮▮▯▯▯ discrete steps — five of eight` in posts; §035 and
§036 draw counted work in slant — *compacting ▰▰… 3 of 5 turns*, *indexing …
412 of 1,847 files*. The tree maps `granularity: "segmented"` to slant. And the
registry's braille bar is whole-cell `⣿` or space, with no sequence for *eight
positions per column*. Two visible choices: which alphabet counted work takes,
and the sub-cell braille ramp.

---

> **Ruled 2026-09-24.** Selection's second carrier is **the `▌` selection rail** (§017). `R-THM-003`'s *only carrier* is superseded to *only ground-level carrier*, and the rail is asserted. **Note:** `▌` is also the prompt's caret (the `bar` slot). The two are in different domains (the transcript's gutter and the prompt), so this is not a collision, but the rail's domain has to say so. **Owed.** **Premise note, 2026-09-25:** the ruling names the mark and not its column, and no column is free on every selected row — a selected row is its block's first row (C14 I39), whose column 1 holds the head mark (`●`, `❯`) on a top-level block, the one carrier of a call's state at 1-bit. §017's figure draws the rail only on code rows with a free left edge. The column is parked as **41**; the registry half — *only carrier* → *only ground-level carrier* — does not depend on it. **Registry half built 2026-09-25**: `R-THM-003` → `R-THM-005` (`tools/design/supersede-thm-003.mjs`), 61 citations moved, the ledger row parked on 41.

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

> **Ruled 2026-09-24.** The count reads **`418 chars · 9 rows · 2 entries`**, in the footer. **Premise note:** no fixture draws a count. §103's footer has none, which is why this was parked. The wording is new and yours. **And the mechanism differs:** `semanticSelectionCount` counts blocks, while the ruled form counts the copy text's characters and rows and its entries. **Owed.** **Built** in aae861a0 (C14 I55): one chip, `418 chars · 9 rows · 2 entries`.

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

> **Ruled 2026-09-27** (by the person). **`⇧←` / `⇧→` extend the selection from its anchor, and rectangular selection toggles on `⌃V` in copy mode.** This is not the entry's proposal (a), which had `⇧←`/`⇧→` begin a rectangle; the horizontal extend is what they do, and the rectangle gets its own toggle, so the `RECT 12×4 · cells, not source` label has a state to be drawn in. **Built in:** review batch 4 (M10 items 2–3).

**36 · RULED — `R-SEL-007`'s rectangular selection has a label and no way in.** Ruling
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

> **Ruled 2026-09-27** (by the person). **A flat trend gets `→` (ASCII `=`); an absent trend stays `-`. No arrow is not *flat*.** A reading that held is a fact with a direction of its own, and leaving it unmarked makes it indistinguishable from a reading with no comparison at all. The registry gains the mark through the builder. **Built in:** review batch 2 (M4). **Built** in 8fd66890 (C11 I30, C09 I111): a reading that held draws `→`, `=` at ASCII, through a registered `trend-flat` glyph; a cell with no trend draws nothing.

**37 · RULED — A trend with no movement.** §088 §4 draws a trend going down and a
trend going up, and `R-COL-006` gives each a tone from the metric's polarity. It
draws no reading that did not move, and `from === to` is ordinary data — a metric
that held. **Taken unless you say otherwise** (C11 I30): no arrow, the text alone
(`from 0.41`), in the default tone, since a flat reading has no direction to be
good or bad about. The alternative is a third mark (`→`, or `=` at ASCII), which
is a glyph the registry does not record.

> **Ruled 2026-09-27 (review batch 1, item 22).** **(a)** — `trendDown` takes **`V`** at ASCII; `trendUp` keeps `^`, and `collapse` keeps `v`. The case-only difference between `v` and `V` is accepted as the cost, since both alternatives cost more: (b) moves every ASCII golden with an expanded row, and (c) reads as *low* rather than *down*. **Premise note:** C09 I111 said *the registry records them as `trend-up` and `trend-down`*, and no registry glyph carries `↑` or `↓` — the ruling in 26 was written and the records never were. They land with `GLYPH_TABLE`'s rows in one commit, because SS65 refuses a current record the tree cannot draw.

**38 · RULED — Ruling 26's `v` collides with disclosure's `v` in a content row.**
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

> **Ruled 2026-09-27** (by the person). **A set's ASCII frames must not all be one character.** The within-set rule is that the ASCII rung *moves*; downsampling several Unicode frames onto one ASCII frame is allowed, which is what the 12 of 27 SS64 hits are. A set whose ASCII rung is a single repeated character is a still mark in a slot that says *live*. **Built in:** review batch 2 (M4, with item 7's glyph gate). **Built** in 07746cc2 (C09 I98): T2.190 beside the glyph gate checks the tree's sets and the registry's — a set whose ASCII frames are all one character fails it.

**39 · RULED — What a collision inside a spinner set is.** Ruling 11 put spinner frames
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

> **Ruled 2026-09-27** (by the person). **120 ms for every ASCII alphabet.** One cadence for the ASCII rung — the entry's proposal (a) — which is §039's *nothing varies its rate*. **Built in:** review batch 2 (M4). **Built** in 729ca488 and 0bd29cc9 (C09 I112): the registry records `spinnerPolicy.asciiIntervalMs = 120` and every ASCII rung steps at it. **The cost, measured:** fit-cycle is lost at ASCII, and `toggle` turns in 240 ms.

**40 · RULED — Which interval a shared ASCII alphabet takes.** Ruling 30 applies
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

> **Ruled 2026-09-27** (by the person). **The selection rail takes the live gutter's column** — the entry's proposal (a). It is the one column that displaces no head mark, and the head mark is the call state's only glyph carrier at 1-bit. **Built in:** review batch 4 (M11 item 1).

**41 · RULED — Which column the `▌` selection rail takes.** Ruling 33 makes `▌` selection's
second carrier. §017 (`R-BLK-127`, `R-BLK-129`) draws it as the first two cells of a
selected row, `▌ ` on the band, before the focus mark's column — on search-result rows
whose left edge is blank. In the transcript a selected row is its block's first row (C14
I39): column 1 holds the head mark on a top-level block (`● help`, `❯ /help` in
`SF1 · transcript`), column 2 is the gap after it, and a nested block starts at column 3.
So the rail has no column that is free on every row it must mark, and drawing it over
column 1 displaces the head mark — which at 1-bit is the call state's only glyph carrier
(`R-COR-003`), so the fix would break the rule it serves. **Proposed, (a) recommended**:

- **(a) The live gutter's column** — C14 D6 already carries a frame-chrome `▌` beside a
  live entry's rows at no geometric cost (*C14 marks; S01 draws*). Selection takes the
  same column with the same glyph: one column that means *this row is marked*, drawn
  by the frame, never by a block, so no head mark moves. It needs the column to exist
  on every row, which is the frame's to reserve.
- **(b) Column 2, the head mark's gap**, which is blank on every row the golden shows —
  `●▌help`. No geometry moves, but the rail reads as part of the mark it abuts.
- **(c) Over column 1 only where column 1 is blank**, the ground alone elsewhere — which
  leaves a selected call head with one carrier, the case the ruling exists to close.

---

> **Ruled 2026-09-27** (by the person). **`⏎` on a shed row gives the table's expanded-row form** — the entry's proposal (a): `expand` for the block, `expanded` on the block, the withheld parts drawn beneath each row as `label  value`. It lands with in-place expansion, which is the same mechanism. **Built** in 016bcaad and 94331d36 (C09 I124, I125; C23 I84; C25 I14 amended): `⏎` on a shed row expands the block in place through the registry's `fold`, and `actions.ts` names no kind. A far side's `replace` drops `expanded`, as it drops a table row's (C23 I84).

**42 · RULED — What `⏎` on a shed row expands into.** Ruling 19: *`⏎` expands what it
stands for*; §104 says the same and draws only the collapsed row (`val loss  0.0372
+1`). C09 I113 makes the withheld parts reachable through the peek, which is the
table's dropped-column precedent and exists. The in-place form does not: the four
kinds' rows carry no ids and no `expanded` flag, and the only in-place expansion in the
tree is a table row's (`op: "expand"`, C04 I34). **Proposed, (a) recommended**:

- **(a) The table's expanded row** — `⏎` on `shed-${i}` sends `expand` for the block,
  `expanded` flips on the block (as `Scroll.collapsed` does, so C04 I34's *a block id*
  already admits the target), and each shedding row draws its withheld parts beneath
  it as `label  value`, the form a table row's dropped columns take. Block-wide
  because the plan is block-wide: every row sheds the same parts.
- **(b) Per row**, which needs an id on the four kinds' items that the documents do not
  carry today.
- **(c) No in-place form** — the peek is the expansion, and `⏎` does nothing on these
  rows; which is §104's *reachable* without its *`⏎`*.

---

> **Ruled 2026-09-27** (by the person). **The example's verb is renamed to `/filediff`**, so §075's `/config` stays the framework's. The 106 references, `demo.cast` and the media tools move with it. **Built** in 18573f94 (the example's verb is `/filediff`) and 70913a44 (the framework's ninth verb, `/config`). **Owed:** the docker demo and media re-recorded from the main tree.

**43 · RULED — §075's `/config` collides with docker-tui's `/config`.** Ruling 28 builds the provenance display, and §075 names its verb `/config`. `examples/docker/src/manifest/read.ts:163` already declares a `config` verb — a container's config file against its image's original (S8) — and C05 I6 makes a framework verb of the same name a **parse error** for that manifest, so the example would not start. The design decides the framework's name; it does not decide the example's new one, and the rename reaches **106 references across 19 files**, a recorded `demo.cast` and the media tools among them.

**Built meanwhile** (C22 I115, C23 I80): the provenance record, the ladder and the table. What waits is the verb and its manifest row. **The one-word answer** is the example's new name — `/filediff` is the proposal — or a different framework verb, which would depart from §075.

---

> **Ruled 2026-09-27** (by the person). **C04 I6 exempts a closed vocabulary.** A word drawn from a declared, closed set — `env`, `flag` — carries its own fact, and the tone is its second carrier (tie-break 4, carriers count per fact). The exemption is by declared vocabulary, never by free text, so a cell's text cannot opt itself out. **Built** in 2ab225a4 and 7003e78f: `ColumnDef.vocabulary` declares the closed set, checked at `block()` and the wire; a cell outside it is refused whatever its tone.

**44 · RULED — §075's ladder puts `warn` and `error` on a word, and C04 I6 refuses both without a glyph.** §075: `env` is *warn — your shell chose it*, `flag` is *error — this invocation chose it*. C04 I6 (D29) throws for a cell whose tone is `warn` or `error` and whose glyph is empty — *colour alone does not survive 1-bit or a colour-blind reader*. Here colour is not alone: the word `env` or `flag` **is** the fact, and the tone is its second carrier, which is tie-break 4's per-fact count. The design is consistent; C04 I6 counts per effect.

**Why parked, not ruled**: making C04 I6 accept a word that carries its own fact weakens an invariant, and *which words qualify* has no field to answer from — a free-text cell cannot say whether its text is a label or the fact. **Nothing reaches it today**: `env` and `flag` have no producer (ruling 28). **The one-word answers**: (a) C04 I6 exempts a cell drawn from a closed vocabulary the block declares; (b) the ladder's two loud rungs take a glyph (`warn`'s `▲`, `error`'s `✗`) beside the word; (c) the ladder stops at `meta`.


> **Ruled 2026-09-27** (by the person). **`>` opens the palette only at an EMPTY prompt — the same exception `/` already has — and that limit is written into the rule.** A `>` typed anywhere else is text. **Built in:** review batch 2 (M6).

**45 · RULED — How the palette opens, and where its query is typed.** Ruling 20 builds §105's five primitives. The registry defines the palette as *an overlay whose rows are filtered actions* (R-PRI-001), and §105 draws it as `❯ open▌  3 of 61` above action rows carrying their chords, with `+58 more` beneath. **Everything it draws is built already**, as §105 says: C19's menu is §097's panel between two rules, with a detail column and the `+ N more` residue, and the registry's 40 actions are the rows. **What the design does not give is the way in.** No action opens a palette and no binding names one. §105's `❯ open▌` is a prompt row, so the query may be typed in the prompt, but the figure does not say what turns a prompt into a palette.

**Why parked, not ruled**: the opener is a key or a word the reader has to learn. That is a visible choice, and every candidate collides with something: `⌃⇧P` collapses to `⌃P` in the base profile; `⌥p` is `posture.cycle`; `/` already opens the verb menu.

**The proposal**: `>` typed as the first character of an empty prompt switches the menu's source from verbs to actions, as in VS Code's quick-open. That costs no chord, keeps the query in the prompt as §105 draws it, and the base and enhanced profiles agree. The alternatives: (b) an action `palette.open` on `⌃⇧P` enhanced and `⌥k` base; (c) a verb `/actions`.


> **Ruled 2026-09-27** (by the person). **Keep what's built**: the divider is the left pane's bar and takes the accent under §021's rule; the right pane's focus shows on its own bar. **Built in:** nothing to build.

**46 · RULED — Whether the divider takes the accent while the right pane holds focus.** §105: *the focused pane takes the accent ON the divider, so which side owns the arrows is visible without a label.* The figure shows one state, with a `┃` segment in the divider. Built (C04 §3aq S7): the divider is the left pane's bar (ruling 22 and §021, read together), so it takes the accent under §021's rule, *the thumb takes the accent when its container has focus*, while focus is in the left pane. It is `muted` otherwise. With focus in the right pane, the accent is on that pane's own bar in its last column, and only where the pane overflows.

**Why parked, not ruled**: *which side owns the arrows is visible* asks for a difference between the two sides, and a single column in one tone gives only two states for three conditions (left pane, right pane, neither). With focus in a right pane that fits, the divider reads the same as with no focus in the split. The focus mark on the focused row still shows the side, but that is a mark, not the divider.

**The proposal**: keep what is built. Every alternative spends a second carrier on one column. One is a half-cell edge (`▕`/`▏`) facing the focused pane, which is a glyph the registry does not have. Another is accent on the divider whenever either pane is focused, which says *in the split* and not *which side*.


> **Ruled 2026-09-27** (by the person). **Keep what's built**: the fields flush at column 0. C09 I87 stands and the figure's one-cell indent is the specimen's (R-SEC-036). **Built in:** nothing to build.

**47 · RULED — §105's form indents its fields one cell right of the button row, and C09 I87 forbids it.** §105 draws ` name        prism-serve` over `› save    cancel`: every field row starts one cell right of the button row's `›`. C09 I87 says nothing is drawn left of a block's **head**, its first drawn row, on any row — a naive drag picks up whatever sits in that gutter as though it were text (`R-SEL-016`). With the fields first, the head is the first field row at column 1, and the button row starts at column 0, left of it.

**Built meanwhile** (C04 §3ar): the fields flush at column 0, so the button row is exactly the figure's and every field column is the figure's less one. **Why parked, not ruled**: keeping the figure's cell means weakening I87, and the obvious weakening — measure from the leftmost row rather than the head — is the tautology I87 records its own control catching. **The one-word answers**: (a) keep it flush; (b) indent the button row with the fields, so `›` sits at column 1 under the labels' first letter; (c) I87 exempts a row whose first cell is a mark the block declares, which is a list.


> **Ruled 2026-09-27** (by the person). **Linear mode reports a long call at 10 s, 30 s, 1 min, then every minute** — the entry's proposal. **Built in:** review batch 4 (M11, linear mode).

**48 · RULED — How often a running call says it is still running, in linear mode.** §107: *a running call announces start, useful elapsed milestones, blockage and completion — not spinner frames.* Start, blockage (a question) and completion are built (C22 §6m). **A milestone needs an interval**, and the design gives none — `R-MOT-*` fixes spinner intervals, which are frames, and §107 excludes frames by name. It is a visible timing value, which is why it is here. **The proposal**: at 10 s, 30 s, 1 min and every minute after — `entry 7: pytest tests/unit — running, 30s` — a doubling-ish ladder that says *still going* often early and rarely late, and is silent for a call that finishes inside ten seconds. **Built meanwhile**: nothing between start and completion, so a long call is silent in linear until it ends.

> **Ruled 2026-09-27** (by the person). **Polite events within 250 ms are written as one batch**; `assertive` is not limited. The entry's proposal. **Built in:** review batch 4 (M11, linear mode).

**49 · RULED — The rate limit on linear announcements.** §107: *announce is none / polite / assertive, with deduplication and rate limits.* Deduplication is built (C22 I120): a fact is written once per id. **A rate limit is a number** — events per second, or a minimum gap between polite events — and the design gives none. **The proposal**: no limit on `assertive`; `polite` events inside 250 ms of each other are written as one batch, which is §107's *coherent batches* reached from the other side. **Built meanwhile**: every event is written as it happens. **Widened 2026-09-25 by ruling 27** (C22 §6n): a notification rung repeated while the reader is away is the same number asked of a second stream — every earning fact rings once until this is answered.

> **Ruled 2026-09-27** (by the person). **`/watch` is a reserved framework verb, and watches get built.** Framework verb names are reserved **in the manifest schema**, so an app declaring one gets a validation error rather than a parse failure found at start; **`/capabilities` is confirmed on the same basis.** The grep of every manifest the entry names is the first step. **Built in part** in f10e7a3f (C05 I28): `watch`, `unwatch` and `config` are reserved, refused at `parseManifest` with the reservation named. **Owed:** `/watch` and `/unwatch` themselves, the footer watch row and `watch.jump[n]`. **Built** in 1004d067 (review batch 3; C22 I135–I140, C16 I76–I77, R-KEY-009, registry 0.16): the tenth and eleventh verbs — `/config` came first — the watch row above the owner line (R-OWN-001 outranks §085's specimen), and `watch.jump[n]` as bare `1`–`9` at the focused row, since every modified digit is an agent jump or undeliverable without the protocol. Scope is the four owed pieces; the application-side `watch(id)` producer stays with answer (b), unbuilt. F1338: the verb cannot yet pin the invoke it was typed during.

**50 · RULED — Who fills a watch, and where it is shown.** Ruling 27 built the watch as *a declaration that producers fill* (C22 I130): a streaming entry can be watched, the watch drops at settle, and its completion earns a notification always. **Nothing in the tree fills it.** §085 names two producers — `/watch` to *pin one that is not yours*, and *a long-running job you started* — and one display, the footer's watch row (`⋯ › a3f9b21 █████░ 43%`, `⇧⇥` to focus it, `←→` among watches, `⏎` to scroll to its entry and open it). **`/watch` and `/unwatch` would be the ninth and tenth framework verbs**, and C05 §3 makes each a breaking change for any app declaring the name — the process is a grep of every manifest first, and the brief puts the manifest out of scope. The row is `example` display with a binding (`watch.jump[n]`) the registry does not hold. **The one-word answers**: (a) build `/watch` and `/unwatch` as framework verbs after the grep; (b) a producer declares it — an application calling a `watch(id)` on `TuiInstance`, which is C24 surface; (c) both, and the footer row with them. **Built meanwhile**: the declaration and its earning; no producer, no row.

> **Ruled 2026-09-27** (by the person). **"While you were away" is a transcript entry** — the entry's answer (c). It is what R-BLK-314's detach summary is too, so the two share one form. **Built** in de2fcd48 and 71734de1 (C23 I85–I87, C14 I56): the away and detach ledgers append one entry at close, nothing when nothing settled, each settlement reported once by the first mark to close.

**51 · RULED — Where the return line goes.** §014: *when you come back, the transcript says what you missed* — `● 3 entries settled while you were away   ⌘↓ to the bottom`. The transcript holds entries, and every line in it is one: a line appended on return is either an entry the reader never ran, with a `seq` and a place in `/history`'s neighbour, or a second kind of row that §6m's stream and C13's eviction would both have to learn. Nothing in the tree counts arrivals while away — the `N waiting` chip counts what a **frozen** view holds back (C14 I34). **The one-word answers**: (a) a chip on the owner line, beside `N waiting`, shown from the focus-in until the reader reaches the bottom; (b) a transient toast (§6j's) on focus-in; (c) a notice entry, accepting that it is one. **Built meanwhile**: nothing on return; the rungs are what reached the reader.
---

> **Ruled 2026-09-27** (review batch 3, M7 item 9). **The quiet window.** An activation is refused only if it arrives within ~250 ms of the question appearing; while guarded, the guard holds for as long as activation keys keep arriving inside the window, so a held key's auto-repeat stays caught however long it is held. A deliberate `⏎` after the window answers at once. This replaces the refuse-the-first-activation rule, and it is also M7 item 3's remedy (auto-repeat defeating a guard that disarms after one refusal). **Owed:** C16's guard amended spec-first when batch 3 opens, with a 30 Hz synthetic repeat and a deliberate press after quiet as the two rows.

> **Amended 2026-09-28** (by the person), correcting the window found short by batch 3's walk. **Two numbers, not one.** Without key-release reporting, a question refuses activations during an **arrival grace of 750 ms** — at least the OS repeat delay, covering X11's 660 ms default — and then stays guarded while activation keys keep arriving **within 250 ms of each other**. Under the kitty protocol the guard uses the held-key set from release events and **no timers**. *Why the first form failed:* a 250 ms window from arrival closes before a held key's first repeat, so the commonest case — `⏎` submitting a verb that asks at once — still answered. **Owed:** C16 amended spec-first in batch 3, and a row holding a key across arrival with a 660 ms first repeat then 30 Hz repeats, where none may answer.

**52 · RULED — How long a newly arrived question refuses an activation.** R-OWN-002 arms a new owner so the first activation after it is refused out loud. Refusing exactly one is defeated by a held key's repeats without key-release reporting (M7 item 3), and refusing every first `⏎` costs a deliberate reader a press on every question. Raised by review batch 3 as *for Malachy*.

---

> **Ruled 2026-09-27** (review batch 4, M13 item 2). **`⏎` always sends.** The chip preview takes its own registered bindings, shown in its footer: **`⌃↑` / `⌃↓` scroll** it, and **`⌥o` opens the chip in the editor** — not `⌃E`, which is the prompt's end-of-line. Both are registered as registry bindings with base-terminal routes. **Measured free on 2026-09-27**: `⌥o`, `⌃↑` and `⌃↓` have no binding in `calcium-registry.json` (41 bindings; the same search finds `⌥p` → `binding.035` and `⌥↑` → `page.up`), none in `docs/KEYS.md`, and the shipped keymap is generated from the registry through `chordOf`. `⌥o` arrives as `ESC o` and `⌃↑`/`⌃↓` as `CSI 1;5A`/`B`, so all three are deliverable without the Kitty protocol. **Owed:** the bindings through the builder, the collision gate run over them, the preview's footer, and a row that pastes a chip and presses `⏎` and asserts the prompt was sent.

> **Amended 2026-09-28** (by the person). **`⌃↑`/`⌃↓` are dropped: the preview scrolls on `⌥⇧↑`/`⌥⇧↓`**, with base-terminal routes (`CSI 1;4A`/`B`, deliverable without the protocol); `⌥o` stays for open. *Why the first pick failed:* on default macOS `⌃↑`/`⌃↓` are Mission Control and App Exposé, and the OS takes them before the terminal sees a byte. **The collision check cannot see OS-level shortcuts** — it reads the registry, the keymap and KEYS.md — **so every future chord is also checked by hand against macOS, Windows and the common Linux desktops' defaults.** Measured free on 2026-09-28: `⌥⇧↑`/`⌥⇧↓` have no current binding in `calcium-registry.json`, no row in `keymap.ts` and no entry in `docs/KEYS.md`. **Owed:** a decode row asserting `CSI 1;4A` is `{up, shift, meta}`, and the bindings through M6's supersession script.

**53 · RULED — The chip preview's keys.** R-BLK-825's specimen shows the preview with `↑↓ scroll · ⏎ open in editor`. `chipAt()` counts a chip on either side of the caret, and the caret sits after a chip just pasted, so giving the preview `⏎` breaks paste-then-send — the commonest flow. The design's keys are a specimen (R-SEC-036); the departure is recorded here.

---

> **Ruled 2026-09-27** (review batch 4, M11 item 4). **A chosen choice takes its mark plus bold**, so it keeps two carriers at 1-bit — the mark and the weight — where a focused unchosen choice has `›` alone. Bold and not inverse, because inverse is selection's 1-bit rendering. **Owed:** C10's carrier table and the choice renderer, spec-first when batch 4 opens.

**54 · RULED — Choice's second carrier.** R-COR-003 wants two independent carriers for every interaction distinction; at 1-bit *chosen* and *focused* were distinguished by one mark each.

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M4 item 8). **The band predicate's two latent cells are closed at the validator too.** `validateBands` checks C10 I61's pair before its `isHex(bg)` early return, and refuses a `bandFourBit` key with no `bandInk` partner. *Reason:* a consistent picture beats a lone rule — once the resolver and `isBand` share `bandAt`, a theme the validator admits must not be able to make them disagree. **Owed:** C10 I61's sentence and T2.73, in batch 2's M4 item 8.

**55 · RULED — Does the validator close X1 and X3?** The M4 item 8 walk found two theme shapes no shipped theme reaches: a `bandInk` with no `bandFourBit` pair (the pair check sits after an early return), and an orphan `bandFourBit` (never iterated).

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M4 item 8). **A head on a receded (stale) panel takes its state's mark**, because tone does not carry there: every ink resolves to `dim`, so five states would otherwise draw one mark in one ink. The predicate is the existing one — *does tone carry here* — asked of the panel as well as the ground. *Reason:* carrier rules count per fact (R-COR-003, R-HON-002); a receded tone is tone that has stopped carrying. **Owed:** measure the frame first (the walk did not render it); build in the same lane, or record the measurement if the premise is false.

**56 · RULED — A call head inside a `staleForMs` panel.** Found by the M4 item 8 walk as X2, outside the band claim and the same class.

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M4 item 9). **The `Glyph` token is spelled `"work-unit"`, the registry's id**, and SS64's three key parsers widen to accept a quoted hyphenated key, with a row asserting the parsed `GLYPH_TABLE` keys equal `GLYPH_TOKENS` by equality. *Reason:* structured data beats prose — the registry id is the name, and `workUnit` would be a second spelling of it. **Owed:** batch 2's M4 item 9.

**57 · RULED — `work-unit` or `workUnit`.** The first hyphenated `Glyph` token drops silently out of SS64's `(\w+)` parsers.

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M4 item 10 and M5 item 10). **A root `CHANGELOG.md`, kept by hand under `## Unreleased`**, breaking changes named explicitly; A04 §9's row is amended first to say so until a generator exists. *Reason:* the repo is right about what ships — no generator exists, and a changelog row naming a generator that does not exist is a claim with no source. **Owed:** A04 §9 spec-first, then the file, carrying `live`, `step`, `running`→`work-unit`, `ChromeContext.copyMode`→`owner`, and each later batch's public breaks.

**58 · RULED — Where the changelog lives.** A04 §9 says *generated from commits*; nothing generates it and no file exists.

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M5 item 1 — the item the person sent). **`⌃c` is refused at a question and in either copy mode**: the table's `reject` consumes and explains and runs no rung. The question stays open and unanswered; copy mode stays on. C16 ruling A, §5b B1/B2, §5d D5, I51 and C23 I36's `⌃c` half are amended, not cited. *Reason:* the design decides (§103 — *QUESTION and COPY MODE reject*), and the review item asks for exactly this. *Cost, stated:* in copy mode `⌃c` no longer cancels a running verb; the reader presses `esc` first.

**59 · RULED — `⌃c` at a question and in copy mode.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M5). **How a refusal explains itself.** At a question: `▲ answer this first`, warn-toned, on the question's own row, triggered by the first non-answer input and **held until the question resolves**; later non-answers change nothing and invalidate nothing; the inspection state is silent (its only key is leave). In semantic copy mode: a one-shot warn chip on the owner line. In native selection the scheduler is suspended and nothing can be drawn — **stated as the limit**, not papered over; the toast is `ok`-toned and is not used for a refusal. *Reason:* fixture 061 is the picture, and a consistent picture beats a lone rule.

**60 · RULED — The refusal notice's form, persistence and home in each owner.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M5 item 3). **Layer owners.** `history-clear-confirm` is retired: it has no `src` consumer and nothing could answer it under a declared `question` owner. The chip preview declares `owner: "substate"` named `preview`, which subsumes `promptUnderMenu`'s id switch. *Reason:* the repo is right about what ships — a layer only a test pushes is not a subject.

**61 · RULED — Two layers with no owner to declare.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M5 item 8). **Shell delegation consumes keys at the `child` rung**; F1 and every other key no rung binds stop there instead of falling to `global` (C16 I49). Forwarding bytes to the delegated child's stdin needs a C21/C23 mechanism that does not exist and is **recorded as a finding, not built** here. A question raised while a surface child is attached cannot be answered today; it is **owed to batch 3's M9 item 4** (the host escape read before the child rung), whose symbol is `interceptOf`'s `host.detach` arm. *Reason:* C16 I49 is the rule; the minimum that makes it true is consumption.

**62 · RULED — What a `child` owner does with keys it cannot deliver.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M5 item 5). **Hints come from the keymap, so the keymap gains the rows it lacks**: a prompt `submit` row for `⏎` and a field `keep` row, and a question's hints come from its own declared vocabulary. *Reason:* one source — a hint that is not a binding is C16 I19's second keymap.

**63 · RULED — Hinted keys with no keymap row.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M6 item 1). **Reserved actions pass through.** The hook is `TuiConfig.keyActions?: Partial<Record<ReservedKeyAction, () => boolean | void>>`, keyed by registry id; a handler returning `false` falls through; an unknown id is a construction error. With no handler a reserved row resolves as though absent, except `queue.drop`, whose displaced meaning `killWordLeft` is its `fallback`. `⌥v` with no handler is **dropped**, not restored to copy mode, which stays on `⌥⇧C` — one verb, one chord. *Reason:* the review item's rule, and a consistent picture.

**64 · RULED — The reserved-action hook's shape, and `⌥v`.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M6 item 4). **Registry-global bindings.** `?` and `selection.*` are `global` rows; `copy` is an owner row at every owner with a copy verb — prompt, focused block (`copyElement`), semantic selection, and at `interaction` the focused element — and native selection passes it to the terminal. `?` in native selection passes (the frame is frozen, so an entry would land unseen). `selection.native`/`selection.semantic` from the other copy mode switches mode; from the same mode it is a no-op. **`⌃c` recognition is exact**: `⌃⇧C` under kitty is copy, never interrupt or exit-arming; on the base profile the bytes are `⌃c` and interrupt wins (ruling 3 of the reconciliation, unchanged). `⇧⏎` stays bound in both profiles, listed by equality, because an unbound `⇧⏎` submits. *Reason:* the registry's scope is `global`, and the design decides.

**65 · RULED — Where the registry-global bindings fire.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 2, M6). **Ruling 53's chip-preview chords land in batch 4 with the preview**, not in M6: the two-direction gate M6 builds requires every registry binding to resolve to an action at a target, and the preview's target and verbs do not exist yet. Registering them now would need an *owed* arm in the gate, which is the exemption M6 item 3 removes. *Reason:* a consistent picture beats a lone rule.

**66 · RULED — When ruling 53's chords are registered.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; ruling 45's build). **Ruling 45 corrected on one premise: `/` has no empty-prompt exception** — it switches namespace at any command position (`context.ts:218-225`, C19 T3.17). So `>`'s limit is written fresh: C19's slot classification tests `input[0] === ">"` **before** tokenising, a `>`-led line is never handed to C18 on submit, and the rule lands as **R-KEY-008** through `release.mjs`. **Measured by the walk: `> notes` then `⏎` today is delegated to the user's shell and truncates the file `notes`** — the submit guard closes that. Built as the last step of batch 2's M6. *Reason:* the ruling's intent stands; only its "same as `/`" premise was false, and a guard that stops a truncation strengthens a safety default.

**67 · RULED — Ruling 45's premise about `/`.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 4, M11 item 1 — applying ruling 41). **Ruling 41's premise is corrected and the ruling stands: the frame reserves column 0 of the transcript region on every row, and the `▌` selection rail is drawn there.** Measured: no live gutter is drawn and no column is reserved today (`containers.ts:163-170`; SF1 row 07 starts `● help` in column 1), so ruling 41's *at no geometric cost* was false. The live gutter of A01 D6 and C14 D6/I18 is superseded — liveness is the spinner (R-GLY-003). The rail's ASCII form is `|` in a new `gutter` domain; it is never inverted at 1-bit. *Reason:* the ruling's intent — the rail takes the gutter column — is kept; only its cost claim was wrong. *Cost, stated:* every composed-session golden moves one column.

**68 · RULED — Ruling 41 rested on a column that does not exist.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 4, M11 item 2). **Two carriers where the gate finds one.** Disclosure: `collapsed` carries its hidden count (`+N`) beside the mark, so collapsed and leaf differ by mark and word; `expanded` carries the content's position. Prompt selection is a **ruled exception** on the gate's equality list — the `▌` that would be its second carrier is the caret there — carried by ground (inverse at 1-bit) with the caret at one end. *Reason:* carrier rules count per fact; a named exception is the form the gate already has (`linear`).

**69 · RULED — Disclosure and the prompt selection under the two-carrier gate.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 4, M10 item 3). **R-SEL-003/015 decide: a block stays atomic in semantic copy mode.** Ruling 36's `⇧←`/`⇧→` extend columns **in rectangle mode**, from the anchor, clamped to the block; there is no character caret over prose. *Reason:* when pictures disagree the rule decides, and the rendered column of markdown is not its source offset (R-SEL-001: copy takes the source). M10 item 3 is answered by the rectangle, not by a prose caret.

**70 · RULED — Caret keys over prose.**

---

> **Ruled 2026-09-27** (by Claude under the person's standing authority; review batch 4, M12). **The trust boundary.** Neutralise once, at the block registry's resolve, memoised on identity; `cat -v` notation for C0/DEL/C1 and `<U+XXXX>` for every bidi format character including LRM/RLM/ALM (C04 I110 widened to refuse them in `terminal` lines). No raw-copy action. Switching C07's ingress from strip to escape, ANSI SGR to spans, and rebuilt OSC 8 are a **follow-up lane after the core**, because escaping ingress without the colour table makes coloured CLI output worse. OSC 52 is written only through `escapes.ts`, capped near 100 KB, and the toast says *sent by OSC 52*, never *copied*. ⏎ on an empty selection stays and says so; ⌃V off discards the rectangle. *Reason:* R-TRU-001 binds (*escaped*); R-BLK-898/900 are examples. *Cost, stated:* legitimate right-to-left text shows its marks.

**71 · RULED — The trust boundary's mechanism and notation, and the copy destinations.**

---

> **Ruled 2026-09-28** (by the person; review batch 4, M10 item 1). **The local clipboard is approved as an optional runtime tool, not a package.** Order: **OSC 52 first** (it works over SSH), then a platform tool if present — `pbcopy`; `wl-copy`, `xclip` or `xsel`; `clip.exe` — detected at runtime and never required, spawned with a **fixed argv, no shell, payload on stdin**. If none is available the reader is offered file export and told so. OSC 52's success cannot be observed, so that path is worded honestly: *sent to the terminal's clipboard*, never *copied*. **Owed:** a `DEPENDENCIES.md` row for the optional tools, with batch 4's M10 lane.

**72 · RULED — The local clipboard's mechanisms.** Batch 4's M10–M12 walk found copy reaching only the kill buffer, and spawning a platform clipboard tool is a dependency in practice, so it was the person's to decide.

---

> **Ruled 2026-09-28** (by Claude under the person's standing authority; review batch 3, M9 item 1). **C07 I18 stands, and `Patch.cap` is a row budget its producer declares; the framework derives no default.** Lane b3-d measured D12's premise and it does not hold: `ProducerContext.height` is non-null only on the view route (C07 I18), and R-EXA-082 retired that route, so no framework producer can compute *one viewport*. The two remedies were to give an entry a height, or to have C22 write the cap onto a far side's block. The first is I18's own refusal — a transcript entry is windowed by rows and has no bound, and the terminal's height standing in for one is the guess I18 was written against. The second is D12's own objection, a shell rewriting another producer's block. **Tie-breaks:** the repo is right about what ships (I18's argument is measured and current), and D12 was the lone rule. So *one viewport* is a producer's choice, never the framework's guess; a patch with no `cap` draws whole, as it did.

**73 · RULED — Who writes a patch's cap, when no producer can see a height.**

---

> **Ruled 2026-09-28** (by Claude under the person's standing authority; review batch 4, M11 item 8, folded into batch 2). **`examples/docker/FINDINGS.md` stays tracked, where it is.** The review called it an agent log and asked for it to be removed or moved out of the tree with M4 item 5's clean-up. It is also the register the gates resolve against: SP5 resolves every cited finding number against it — 7,465 citations in 832 files under `docs/`, `src/`, `test/` and `tools/` at e1a8d608 — and SP6, SP12 and SP14 gate `TRIAGE.md`'s keys, open set and tallies against its ids. Removing it deletes the evidence those citations point at; moving it changes a path and nothing about what it is. **Tie-breaks:** the repo is right about what ships, and a consistent picture beats a lone rule. **What the review's point does buy**, and is not refused: the file's size is real (56 k lines), and its growth is the thing to watch — a split by range behind the same resolver is a change SP5 can carry, if it is ever wanted.

**74 · RULED — Whether the findings register leaves the tree.**

---

> **Ruled 2026-09-28** (by Claude under the person's standing authority; review batch 4, M11 item 7). **The quantiser holds the contrast floor, as it already holds rank (C10 I6); the registry's values do not move.** Lane b4-contrast measured 193 text cells across all ten themes below their floor at 8 bits, every one clearing it at 24: the quantiser takes the nearest cube entry and nearness ignores the floor. For 167 a clearing entry exists near the authored ink; for hcDark's focus band (`#234f92` → `#005faf`, white at 6.45 against 7) no cube ink clears on the quantised ground. So an ink whose nearest entry misses its floor takes the nearest entry that clears, and a ground takes the nearest entry on which its declared inks clear. **Tie-breaks:** a consistent picture beats a lone rule — the quantiser already holds one property of the authored palette, and this is the same mechanism holding a second; the 24-bit values are the design's and are right, so 193 value edits would move the design to suit a terminal's limit. Closing the class in the mechanism is also the only remedy the next theme inherits.

**75 · RULED — Whether an 8-bit shortfall moves the token or the quantiser.**

---

> **Ruled 2026-09-28** (by Claude under the person's standing authority; review batch 4, M11 item 7). **`ANSI16_HEX` is labelled as the VGA palette it is, and the 4-bit reference does not change.** Lane b4-contrast found the table that C10 I61 and `colormap.ts` call *the xterm defaults* holds the VGA/Windows values; xterm's own differ at indices 1, 4, 7, 8 and 12. Any 4-bit reference is a stand-in for a palette the terminal owns, so which one is measured matters less than that it is named truly. **Tie-break:** structured data beats prose — the table is the fact and the label is the error. Changing the reference would move T2.64's list and both 4-bit lists for no gain in truth. **Corrected 2026-09-29 — the premise named the wrong palette** (a correction, not a reversal). Lane b4-quant, building this ruling, found the table is not VGA: VGA's levels are `0xaa` and `0x55`, and `ANSI16_HEX` holds `0x80` and `0xc0` — the **legacy Windows console palette**, the same values as HTML 4's sixteen named colours. It differs from xterm's defaults at indices 1–8 and 12, not only at the five this ruling listed, which were F1321's sample. The ruling stands — name the table truly, move no list — and what was built names it for what it is: `ANSI16_WINDOWS_HEX`, across `colormap.ts`, `contrast.ts`, the test support and the curated pin, with C10 I61, the `module-graph.mjs` comment and the registry note saying *the legacy Windows console's sixteen* (c6240116, 8b7a6ffe; registry 0.17).

**76 · RULED — Which palette the 4-bit reference is.**

---

> **Ruled 2026-09-28** (by Claude under the person's standing authority; review batch 3, F1284). **The wire enforces C04 I6's glyph rule exactly as `block()` does.** A `warn` or `error` cell, or a notice, that carries no glyph is refused by `validateDocument`, unless its text is a word of its column's declared closed vocabulary (ruling 44). Lane b3-g probed the wire and found it accepting a colour-only document that the builder refuses — one document with two verdicts, and the far side is the producer the rule exists for (D29). **Tie-breaks:** a consistent picture beats a lone rule, and the design's two-carrier rule (R-COR-003) is normative. **The cost, stated:** a far side sending a colour-only warning is refused where it passed; the refusal names the rule, and the adapters and fixtures in this repository are measured before it lands. It refuses more and approves nothing, so it weakens no safety default. **Built** in c58228d1 and 9d7db83d (C04 I6 amended in place, T2.139 at both doors, C04 T6.106): measured before landing, no producer in the repository is newly refused — the six refusals the new check met were all test rows building documents already invalid.

**77 · RULED — Whether the wire enforces the glyph a builder requires.**

---

> **Ruled 2026-09-28** (by Claude under the person's standing authority; review batch 3, F1327). **`profileDeck` is unpublished.** C24 I33 says a published pane helper has a consumer, and since the pushed view retired (R-EXA-082) nothing in `src`, `examples` or `tools` calls it — `/profile <section>` walks `deckOf` and draws with `profileCard`, and only C24 T1.11 names `profileDeck`. Keeping it "for consumers with their own navigation" names no consumer and none is queued, which is the export the repository's own rule forbids. **Tie-breaks:** the repo is right about what ships, and the rule decides when the pictures disagree. **The cost, stated:** a public export is removed at 0.x with no deprecation cycle, on ruling 1's precedent (`PushedSurface`), and CHANGELOG records it. It removes surface and approves nothing, so it weakens no safety default. **Built in:** review batch 3's tail lane.

**78 · RULED — Whether a pane helper with no consumer stays published.**

---

> **Ruled 2026-09-28** (by Claude under the person's standing authority; review batch 4). **No fact shares an index with `muted`.** C10 I17's distinctness set gains `muted`: the kept-distinct set is the five meaning tones plus `muted`. **The yield ladder stays** — the floor, then distinctness, then rank (C10 §4c.4 row 4). *Reason:* carrier rules count per fact. On `paper`, `info` rendered as `muted` loses the one carrier that tells a notice from nothing to see at 8-bit, and a consistent picture beats rank. It is a mechanism answer inside the quantiser, so no registry value moves. *Rejected:* CIEDE2000 as the quantiser's distance, and re-valuing `paper` — each changes more than the one collision. **Corrected 2026-09-29 — the record states the mechanism, not the headline** (a correction, not a reversal). *No fact shares an index with `muted`* is the intent; what was built is narrower: **I17's kept-distinct set gains `muted`, and where two members of the set claim one index the lighter claimant moves** (the repair walks the set darkest first; C10 §4c.4 row 12). So on `paper`'s page it is `muted` that moves (242 → 243, `#767676`, 3.91 : 1) and `info` keeps its grey (242, `#6c6c6c`, ΔE76 30.1 from `#1f6b94`, 4.53 : 1); the two are 1.16 : 1 apart, so the carrier is distinct by index and close by eye, and that stays open. Eight picks move across the shipped set, and **three indices are shared with a tone outside the set**, measured at 8 bits against the tokens:

| theme · ground | shares | a band? | 24-bit values | recorded as |
|---|---|---|---|---|
| `hcLight` · `diffRemove` | `muted` = `meta`, index 89 | **no** — `hcLight`'s bands are `focusGround` and `selection` | `#454545` and `#8a006e`, different | **syntax colour**: `meta` is outside C10 I17's six and is a tone syntax roles and a paste chip resolve through (R-BLK-614, R-BLK-116), so the collision is decoration with one carrier, not a fact |
| `nord` · `selection` | `info` = `identifier`, index 195 | **no** — `nord` declares no band | `#c4e1ff` and `#bfeaf4`, different | **syntax colour**: `identifier` is the tone of a name (R-BLK-614), and a link keeps its underline as the second carrier (R-BLK-384) |
| `nord` · `selection` | `muted` = `default` = `dim`, index 254 | **no** | all three `#d8dee9` | **not a collision**: one value is one ink (C10 §4c.4 row 6) — the theme composed the three alike on that ground, and `default` and `dim` are outside the set by design |

**And the silent case the ladder leaves is now loud** (C10 I70, §4c.4 row 13): where a floor leaves one entry for two of the six, the set is refused at load rather than painted alike.

**79 · RULED — Whether `muted` is kept apart from the meaning tones at 8-bit.** Review batch 4 found that C10 I17 kept `{ok, warn, error, info, accent}` apart and left `muted` free to collapse, and on `paper`'s page the floor turned `info` into `muted`'s grey, so the two facts rendered as one colour.

---

> **Ruled 2026-09-29** (by Claude under the person's standing authority; review batch 4, M14.1, the M13–M16 plan's D9). **On a tape, `←`/`→` moves focus, not the producer's `current`; the tape's window follows focus while focus is in the tape, and `⏎` activates the focused member.** The shell cannot write a producer's `current` — it is the far side's field, and the repo is right about what ships. The pictures disagree: R-BLK-853 has `←`/`→` *move BETWEEN elements on the row*, and R-BLK-857 says *nothing moves the tape's window without moving the current*; both are `example`, and R-INT-004 (`current`) is that focus pulls the viewport by the minimum displacement. AUTHORITY.md leaves pictures that disagree to the rule. **Tie-breaks:** the repo is right about what ships, and when pictures disagree the rule decides. It answers F1303's direction: `pullTapes` follows `block.current` and never focus, so a focused member off screen is never pulled into view; the pull follows focus. **Built meanwhile:** nothing — M14.1's wiring is the shell lane's, after lane C and the editor lane, where the plan measured, at a4502d3c, that `↓` walks tape members in reading order (`rowDown`) and no `←`/`→` effect exists at a live block.

**80 · RULED — Which a tape's `←`/`→` moves: focus or the producer's `current`.** The M13–M16 plan's walk of M14.1 (row 2: `→` onto an off-screen member) found the window has to slide on focus, where R-BLK-857 says it moves only with the current.

---

> **Ruled 2026-09-29** (by Claude under the person's standing authority; review batch 4, round 2 of the blocks lane, F1380). **A trail whose form animates with a one-shot stamps `since` at each arrival, so `ripple` runs once and holds its final frame.** The M2 amendment to C04 I109 made every one-shot timeable by storing its start, and the render reads elapsed time against the injected clock; the streaming trail was the one place that was not carried through — its ramp is derived at render with no `since`, so the ripple held its not-started frame for the life of the stream. The trail's ramp has no address in the document, and C22 §6o row 6 retired a per-frame `RenderContext.since`, so **the stamp travels on the notice as `Notice.trailSince`**. The shell stamps it at the first frame that draws each new arrival — the arrival is the text's length — from the session's tick, which `session.ts` advances from the injected clock; a re-emission keeps it, and a producer's own value is kept. It is refused on a notice whose trail names no one-shot, as `since` is on a periodic effect, and it is not tied to `streaming`, because the settle strip keeps the other fields. **Tie-break:** a consistent picture beats a lone rule — making `ripple` periodic only inside a trail would give one animation name two behaviours by where it sits. **The cost, stated** (C22 §6o.4's residue, F1388): a producer that replaces the text with a different text of the same length is the same arrival and does not replay. **Built in** 276dd7d9 and e29c613e (spec: C04 I109 and T2.153; C09 I133, T1.150 and T6.188; C22 I131 and §6o.4's third bullet struck), ce7f0604 (`TRAIL_ANIMATION`, `Notice.trailSince`, `src/shell/one-shots.ts`, `c22-trail-stamp`: nine mutations, nine caught) and c8c7a77e (C22 T1.173 and T6.138–T6.141, renumbered off the watch lane's ids).

**81 · RULED — Whether a streaming trail's one-shot starts.** The blocks lane found the `ripple` trail never starts (F1380) — already on record in C22 §6o.4 (F1387) — and asked whether the trail should stamp `since`, or `ripple` should be periodic as a trail.

---

> **Ruled 2026-09-29** (by Claude under the person's standing authority; review batch 4, M11 item 2, F1367). **C11 reserves the `expand` column at the widest disclosure marker it will draw.** Ruling 69 gives disclosure a second carrier, the `+N` count beside the mark, and every shipping table declared its expand column one cell wide, so `▹+3` was cut to `▹` and C10 I71's gate would have recorded a word that is never drawn. **The marker is framework-drawn, so the framework sizes it**: the producer declares the column, and C11 draws `▹+N` into it. **N is what expansion reveals** — `plan.dropped.length + (row.detail?.length ?? 0)` — and at N = 0 the count is not drawn, because nothing is hidden. **C11 I15 is amended, not cited**: `planColumns` stays role-blind (T2.9), and `planDisclosed` reads the one role, `expand`, to reserve a marker it draws itself; an existing rule is not a reason to leave a carrier undrawn. The reservation is a **two-pass bound**, not a fixed point: the first plan reserves for everything that could be hidden, the second for what that plan hid, and because admission is a prefix of the priority order the reservation only shrinks between passes — it terminates and the drawn count always fits. A window pins the table it was cut from, so its columns do not shift as rows with detail scroll past. **A count that would be cut draws the mark alone** (F1368): `▹+12` cut at the edge reads `▹+1`, a wrong number rather than a short one. *Rejected:* (b) producers declare a wider column — any application's `minWidth: 1` would silently drop the carrier the gate claims; (c) the count elsewhere on the row — a departure from ruling 69's placement for no measured reason. **The cost, stated:** S03, S05, S06 and S14's drop totals each rise by 2 and no stated drop set moves; the table goldens move (table 8, fallback-docker 1, design-surfaces 3). **Built in** 3d4b2241 (C11 spec: I15 amended, I32, §3a's classification walk, the S-series restated), 4e3c7153 (`disclosureCells`, `planDisclosed`, the window pin, `c11-disclosure`: 9 of 9 caught), and 9836240c and f6b7c136 (C10 I71 counts carriers per fact, with prompt selection its one ruled exception).

**82 · RULED — Where ruling 69's disclosure count gets its width.** Lane C stopped at M11.2: the `+N` ruling 69 gives disclosure could not be drawn in any shipping table, and C11 I15 forbade the planner from reading `role` to make room for it.

---

## Not yet recovered

The gap between the entries and the running count in the per-MR reports was chased and closed: some questions had been counted twice. The list is the count. **No total is stated here in prose**, because the one that used to be here said *sixteen* long after that stopped being true — this file's own subject, arriving inside it.
