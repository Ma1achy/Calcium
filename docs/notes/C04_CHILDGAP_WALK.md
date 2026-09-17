# Phase 2b — `childGap`, and the four surface rules

The walk before the code, CLAUDE.md's scheduled step. Phase 2a put a block's own space
inside the block (C04 §3a, C09 I80). 2b is the other half of the plan's sentence — *`childGap`
at the sequence level, alignment and cross-axis stretch, and then the surfaces stop
remembering: `padding.l = 3` per nested level, root `padding.r = 1`, `childGap = 1` between
entries*.

**This component has structure and no state of its own**, so the classification table is the
primary artefact (CLAUDE.md: a structural interaction is two rules that both hold at rest). It
gets a short sequence trace as well, because one of its four rules is about a row *between* two
things that arrive at different times, and that is event-mediated by definition.

---

## §0 · The premises, measured before anything was built

The plan's own instruction, and the reason it is written down: *four of §21's nine lines are
already true and must not be rebuilt*. That check was run for §21 and never for §5 and §15. Run
now, **three of the four move**.

| the design says | the tree says |
|---|---|
| *a blank row separates entries* → **`childGap = 1` at the sequence level** (`LAYOUT_ENGINE.md:667`) | **Already built, by the mechanism the sequence rule forbids.** `ENTRY_GAP = 1` and a blank *run* per entry (`entry-layout.ts:71`, C22 I85), whose own comment carries the argument: *the entry's own, so C14 measures it through the wrapper and the frame draws it through the same layout — a composer adding spacing of its own is the C04 I25 shape one layer up.* Nothing to build, and the design's spelling is the one C09 I17 rules out |
| *every nested level costs exactly three columns* → **`padding.l = 3`** | **Four, and derived rather than chosen.** `GUTTER_UNIT = BODY_INDENT = HOOK_INDENT + 2` (`entry-layout.ts:44,52`) — the hook's column, the mark and its trailing space — held to the body's indent by a row that draws both, *because two constants agreeing is not the claim*. `padding.l = 3` would move every nested frame and replace a derivation with a literal |
| *content stops one column before the right edge* → **root `padding.r = 1`** | **Not built.** The transcript renders at the frame's full width. **This is the one genuine item in 2b's surface list** |
| *a block emits no leading or trailing blank row* (rule 7) | **False since 2a, deliberately.** A padded block emits exactly that. Rule 7 and rule 5's `padding` are one document contradicting itself, and §1 cell A2 rules it |
| `childGap` as arithmetic | **Built, in the engine.** `solve.ts:157,193,310` already spends `max(0, n − 1) × childGap` on both axes. What is missing is the **C04 field**, not the arithmetic — and `ROW_GUTTER = 1` (`measure.ts:77`) is today's hard-coded answer for a row group, read at `measure.ts:121,168` |

**So 2b is two edits and not five**: a `childGap` field on the containers that have children,
replacing `ROW_GUTTER`'s constant; and a right margin on the root. The rest is a plan describing
a tree that moved on, which is *ask where a settled claim is written down* pointed at a design
document instead of a finding.

---

## Artefact A — the classification table

Indexed by rule interaction: each row is a cell where two rules that both hold at rest could
both claim the same row or column. A cell governed by one rule is a restatement of that rule
and finds nothing.

| # | the two rules | today | under 2b | ruled |
|---|---|---|---|---|
| A1 | `childGap` is *between* children (§6) × `padding` is *around* the block (C09 I80) | one field | both, on one container | **no interaction at the edges, and that is the whole reason both exist.** `n` children take `n − 1` gaps and the padding takes `t + b` outside all of them, so a container with `childGap: 1, padding: { t: 1 }` is one row above the first child and one row between each pair — never two above the first. The engine already spends it this way (`solve.ts:193`); the field is what is new |
| A2 | *a block emits no leading or trailing blank row* (§15 rule 7) × a padded block emits one | rule 7 true | rule 7 **false** | **rule 7 is retired and rule 5 replaces it.** It was a rule about *who owns vertical space* written when the answer was *the sequence*, and its content survives as C09 I17's *a composer inserts no spacing of its own*. A document saying both is the shape F1224 found in a spec, one layer up |
| A3 | `childGap` on a `row` group × `ROW_GUTTER = 1` | the constant, read in two places | the field, defaulting to 1 | **the field replaces the constant and the default keeps every frame.** `ROW_GUTTER` is not a policy anybody chose — it is the horizontal `childGap` with no way to say so, which is why `measure.ts:168`'s admission loop has to re-derive it. A default of 1 makes this a pure refactor with a byte-exact gate, exactly as 1.2 was |
| A4 | `childGap` on a **column** group × `sequenceHeight` counts nothing (C09 I17) | no vertical gap exists | the container counts it | **the container, never the composer** — which is I17 as 2a rewrote it, and the cell that proves the rewrite was worth making. `groupHeight` spends `childGap`; `sequenceHeight` stays a bare fold. A document's top level has no container, so it can have no `childGap`, which is A5 |
| A5 | *a blank row between entries* × *a sequence has no owner* | `ENTRY_GAP`, the entry's own blank run | unchanged | **the design's mechanism is unavailable and the built one is better.** There is no object between the transcript and an entry for a `childGap` to sit on; the entry's own closing run is a block-shaped answer, which is why C14 can measure it. **And they are not the same rule**: a closing blank on every entry puts one after the last, where *between* would not. The tree's behaviour is the specified one (C22 §6l.8 rows 18–19 — the blank sits above the rule), so the design's wording is what is wrong |
| A6 | `childGap` × a container with 0 or 1 children | — | `max(0, n − 1)` | already right in the engine and stated as the guard it is. The degenerate cell is where §16 says the model is falsifiable: a one-child column with `childGap: 5` is **five rows shorter** than a naive `n × gap`, and a zero-child one is not negative |
| A7 | `childGap` × `placeable` (a row drops children that do not fit) | gutters counted for placed children only (`measure.ts:168`) | the same, with the field | **the gap belongs to the pair, so it is counted per *placed* child and not per declared one.** The admission loop already has this right and it is the cell most easily got wrong: `(declared − 1) × gap` charges for gaps between children that were never drawn |
| A8 | root `padding.r = 1` × every kind's `width` answer (C09 I43) | kinds answer at the frame's width | at `width − 1` | **one subtraction at the root, and every kind is already told the width it gets.** The hazard is not the arithmetic, it is *who* the root is: the transcript's rows, the prompt, the overlays and the rule are four composers at the frame's width, and a margin applied at three of four is a ragged edge nobody declared. Ruled: it is a property of the **region** C14 hands down, not of the document — so it lands where the width is already narrowed, not as a `padding` on a block |
| A9 | root `padding.r = 1` × a mosaic's cell widths | cells divide the frame's width | divide `width − 1` | falls out of A8: narrow the region and every divider reads the narrowed number. This is the cell that would have been wrong if the margin were a block's `padding.r`, because a mosaic divides *before* a child's padding is applied |

---

## Artefact B — the sequence trace, over the row between two entries

Short, because only A5's subject is event-mediated — a row between two things that arrive at
different times, one of which does not exist yet when the other is drawn.

| # | boundary | what crosses it | the interaction |
|---|---|---|---|
| S1 | entry *n* settles → entry *n+1* appends | the blank row | it is entry *n*'s closing run and is already drawn; nothing is inserted when *n+1* arrives. A `childGap` would have to be re-decided on every append, and the frame between the two appends would be a row short |
| S2 | the last entry → the lower rule | the blank row | it is drawn, above the rule (C22 §6l.8 row 19). *Between entries* would leave it undrawn and the rule would sit against the last content row. **The built behaviour is the specified one and the design's wording contradicts it** |
| S3 | an entry evicted from the front (C13's cap) | the evicted entry's blank | it goes with the entry, because it is the entry's. Under a sequence-level `childGap` the surviving first entry would gain or lose a leading row depending on how the composer counts, which is a frame moving on an eviction — the class F1212 measured |
| S4 | a window over a container with `childGap` | the gap rows | **windowable, and the first ruling here was wrong** — see S4a. The gap rows are the *definition's*, not the registry's, so the definition's own `window` can slice them and `windowRefused` gains no third arm |

### S4a · the correction — a ruling correct about the interaction and wrong about the mechanism

**This walk made the mistake CLAUDE.md names, on its own first pass.** S4 originally ruled that a
container with `childGap` is refused a window on padding's ground — *the gap rows are the
container's, outside anything `definition.window` can reach* — and the interaction it names is
real. The mechanism is not. Padding is refused because the **registry** emits it, in `#padded`,
around whatever the definition returned; `childGap` is read *inside* the definition —
`containers.ts:800` builds the engine box with it and `:1090` advances the element walk by it, both
in `groupDefinition`, and `measure.ts:121,168` are called from there. Nothing about it is outside
the definition's reach.

So a gapped container stays windowable and its own `window` counts its own gaps, which is the
answer that costs nothing. Had the first ruling landed, every column group any surface gapped
would have been kept whole — the transcript's cache losing its per-child parts for a field with a
default of zero.

**The tell was available before the code**: the wrong ruling cited C09 I80, and I80 is a statement
about *the registry*. A ruling that borrows another rule's reason inherits that rule's subject, and
the check is one grep — *which file emits this row*. C23 §8a A4 is the recorded instance and this is
the second; both times the artefact was right about which two rules met and wrong about who holds
one of them.

### S5 · the finding — `ROW_GUTTER` is a field with no name, read in four places

`measure.ts:121` charges `(n − 1) × ROW_GUTTER` for a row's widths, `measure.ts:168`'s admission
loop adds one per child after the first, `containers.ts:1095`'s element walk offsets by it — and
`registry.ts`'s own column cursor in `elementsIn` does too. **Four, and this section said three
until T3.92 caught the fourth.** Three of them are in one file; the cursor is in another, and a
count of readers taken by reading one file is a count of that file. The row that found it is the
one asserting the *element* moves with the gap: the widths and the admission loop were converted,
the frame was right, and the focus ring stayed where the constant put it — which no assertion about
a width could see. Four readers of one constant, which is what a field looks like before it has a
name — and the reason
A3's refactor is worth doing even though it moves no frame. The day a surface wants a row group
with no gutter, today's answer is a `raw` block hand-composed at three widths, which is the
workaround C04 §3's `weights` deferral was paid for at (the third instance in CLAUDE.md's table).

### S6 · what this walk did not settle, stated rather than assumed

**Alignment and cross-axis stretch are in the plan's phase 2 sentence and are already built** —
`Group.align` with T3.22 (C04 I100, fifteen entries, both axes) and C29's `align.x: "stretch"`
resolving in pass 2 (F1221). Nothing here touches them, and a step that re-declared them would
be rebuilding §21's already-true lines with the check in hand.
