# The rule ledger — every `current` rule, resolved against the tree

**Why this file exists, and it is the eighth blind spot arriving at this
reconciliation's own record.** The sixteen MRs were checked, MR by MR, against
**the plan's** text — the deliverables each one names. The plan is not the
registry. `AUTHORITY.md` puts `status: current` at the top of the precedence
ladder and the plan nowhere on it, so a rule the plan never mentioned could be
unbuilt, uncited and invisible to every per-MR report, and forty-one of them
were. Measured:

    118 current rules in docs/design/language/calcium-registry.json
     70 named somewhere outside docs/design/language/   (cited)
      7 discharged under another name, with the subject  (covered)
     41 resolved by nothing yet                          (owed)

**A count in prose is a snapshot with no mechanism** (F142), which is the
argument for `tools/rule-status.mjs` rather than for this table alone. The tool
re-derives all four figures and fails when any row's claim stops holding.

## The three states, and why `covered` is separate from `cited`

- **`cited`** — the rule's `R-XXX-NNN` appears in `src/`, `test/`, `tools/`,
  `docs/components/`, `docs/architecture/`, `docs/design/layout/`,
  `PARKED_QUESTIONS.md` or `CALCIUM_ROADMAP.md`. The R-ID is the resolution and
  nothing more is claimed here: **cited is not the same as satisfied**, and this
  file does not pretend otherwise. What it rules out is a rule nothing in the
  repository has ever looked at.
- **`covered`** — the rule is discharged by a mechanism that predates it and
  carries another name, so no R-ID appears and none should be added merely to
  make a table green. The row names the subject, and the tool resolves it: every
  path must exist and every identifier must appear in a file the row cites,
  which is `roadmap-status.mjs`'s check and the one that caught a row naming a
  real mechanism in the wrong file.
- **`owed`** — resolved by nothing yet. **This is a remainder, not a
  divergence.** Nothing here is recorded as knowingly divergent; each is work
  the reconciliation has not reached, and the row is what makes it countable
  instead of invisible.

## The check that keeps this honest

An `owed` row whose rule **has** since been cited is a failure, not a pass. A
ledger that only checked its positive claims would certify whichever subset
chose to carry one, and the stale half is the half that reads as coverage —
`roadmap-status.mjs` §2's argument, in the other direction. So the three sets
partition the 118 **by equality**, both ways, and a rule that lands fails here
on the day it lands until its row moves.

**What this file does not check**, stated rather than left as an omission: a
`cited` row proves a reference, not a behaviour. The instrument that asks
whether a rule is *satisfied* is the carrier matrix, the golden frames and the
mutation runs — this one asks the prior question, which nothing asked before.

---

| rule | state | resolved by |
|---|---|---|
| **R-SPC-001** — Registry authority | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-COR-001** — Three histories | `owed` | searched `src/` and C13 for a durable record distinct from the rendered window and a model context: the first two exist as C13's transcript and C14's viewport, and **the third has no subject in this repository** — a model context is the application's, and C04–C08 keep their own authority under `AUTHORITY.md`. Resolving this needs the scope question answered first |
| **R-COR-002** — Render does not seize ownership | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-COR-003** — Independent carriers | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-STA-001** — Orthogonal state axes | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-STA-002** — One ground per cell | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-STA-003** — Hover is not focus | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-OWN-001** — Owner routing verdicts | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-OWN-002** — Owner epochs | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-OWN-003** — Pointer commit | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-QST-001** — Question form and placement | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-QST-002** — Inspection suspends | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-QST-003** — Editor state isolation | `owed` | **one owner exists, so the isolation has nothing to be wrong about.** `createEditor` is called once (`src/shell/construct.ts:1128`) and the prompt is its only owner. The second owner is M15's typed reply, which is what makes *isolated by owner* falsifiable — A03 §2's vacuity class, and the honest reading is that this is unbuilt rather than satisfied |
| **R-QST-004** — Single approval overflow path | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-MOT-001** — Motion preference | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-MOT-002** — Spinner timing | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-MOT-003** — Reduced-motion mapping | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-MOT-004** — Semantic frame contrast | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-MOT-005** — One-cell animation carriers | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-PRG-001** — Meter semantics | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-TXT-001** — Text coordinate systems | `covered` | `src/interaction/editor/graphemes.ts` `sliceBetween` · `src/interaction/parser/classify.ts` `tokens` · `src/presentation/text.ts` `cells` — the four systems are four modules and the editor's own header says so: *`graphemes` takes text apart, `words` classifies it, `layout` places it on* cells. Editing goes through `sliceBetween`/`splitAt`, which are grapheme-indexed, so a public span cannot land inside a cluster |
| **R-GLY-003** — Glyph registry and reserved cells, which bind in fixed columns | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-CAP-001** — Capability vector | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-ACC-001** — Linear semantic rendering | `owed` | nothing in the tree names it |
| **R-TRU-001** — Terminal control boundary | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-THM-001** — Theme tokens | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-PRI-001** — Primitive index | `owed` | nothing in the tree names it |
| **R-TAB-001** — Component state tables | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-PER-001** — Permission posture registry | `owed` | nothing in the tree names it |
| **R-STR-001** — Call shape | `covered` | `src/shell/documents.ts` `callHead` and `callBody` — the head is one block, the gutter is `src/presentation/blocks/kinds/simple.ts` `glyphLead`'s two cells, and `callBody` emits the settled `notice` plus **at most one** `scroll`, guarded by `call.output !== undefined && call.output.length > 0`. *At most one bounded body when output exists* is that condition |
| **R-STR-002** — Sibling spacing | `owed` | nothing in the tree names it |
| **R-STR-003** — Width-bounded nesting | `owed` | `GLYPH_INDENT`/`prefixCells` (`blocks/kinds/simple.ts:68`) give the head two cells and `⎿` four, not three — so the tree has a nesting cost and it is **not** the rule's number. Resolving this needs the three-column figure checked against §096 before anything is claimed |
| **R-STR-004** — Inline-end breathing cell | `covered` | C22 I109 · `CONTENT_MARGIN_R` — `region.width = max(1, size.columns - 1)`, with the three exemptions each already an invariant (C22 I81, C22 I86, C22 I87) |
| **R-COL-001** — Red semantics | `owed` | nothing in the tree names it |
| **R-COL-002** — Regional tone budget | `owed` | nothing in the tree names it |
| **R-COL-003** — Ground and mark | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-COL-004** — Ground redundancy | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-COL-005** — Shape-specific focus | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-MOT-006** — Semantic motion | `owed` | nothing in the tree names it |
| **R-MOT-007** — Duration-independent shape | `covered` | C09 I8 · `src/presentation/blocks/kinds/containers.ts:135` — *`measure` never sees the tick*, so a block's geometry cannot vary with elapsed time. The call's shape is its measured rows, and the duration reaches only the spinner and the tone |
| **R-MOT-008** — Agent bloom ownership | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-INT-001** — Scopes are visible | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-INT-002** — No typing-scope single keys | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-INT-003** — Scroll is not focus | `covered` | C26 §7a · `src/shell/construct.ts` `ScrollOffsets` — the offset is view state of its own, so a scroll writes `ScrollOffsets` and never the focus address; §7a carries the sentence in its heading |
| **R-INT-004** — Minimum focus reveal | `covered` | C26 §7a · `src/shell/pull.ts` `pullIntoView` — the file's own opening line is *FOCUS PULLS THE VIEWPORT, BY THE MINIMUM, one row for one row*, and `pullIntoView(held, from, to, window)` is the minimum computed as one number |
| **R-INT-005** — Continuous control commit | `owed` | nothing in the tree names it |
| **R-INT-006** — Pointer parity | `owed` | nothing in the tree names it |
| **R-INT-007** — Escape owner path | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-INT-008** — No unsolicited reader motion | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-HON-001** — Dash is unknown | `covered` | `src/presentation/plot/ramp.ts` `absent` — the ramp alphabet carries `absent` as a member beside `empty`, `—` U+2014 dropping to ASCII `-`, with the reason on the line: *there is no braille glyph that reads as nothing was reported*. An unreported value and a value of zero take different marks by construction |
| **R-HON-002** — Staleness timestamp | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-HON-003** — Bounded-window residue | `covered` | C04 I49 · `src/presentation/blocks/kinds/containers.ts` `residueRow` — *a bounded window says what it dropped* is the residue row, `⋯ N above, M below` / `⋯ +N more`, measured at `height+1` independent of the offset |
| **R-HON-004** — Refusal reason | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-HON-005** — Numbers have units | `owed` | **the obvious grep lands on a homonym** (F161's shape). `unitsOf` in `src/presentation/table/definition.ts` is a table's *divisible units* — header, row, detail — and has nothing to do with a number's unit. Nothing carries a unit alongside a displayed value |
| **R-HON-006** — Copy source | `covered` | `src/shell/semantic-selection.ts` `copyTextOf` — it takes the entries' `Block`s and hands them to `copySequence`, the per-kind copy form (R-SEL-004). The frame is never a parameter, so *the source, never the rendering* is a property of the signature rather than of a rule the copy path follows |
| **R-HON-007** — Histories stay distinct | `owed` | the same subject as R-COR-001 from the honesty side, and blocked on the same missing third history |
| **R-DEG-001** — One-bit survival | `covered` | C10 I56 · §4k.5's carrier table — *every distinction survives to one-bit* is the table's own test of independence and its only one: `mark`, `word`, `weight`, `position` and `inverse` survive the rung, `tone` and `ground` do not, so a pair drawn from the second set is one carrier written twice. Twelve rows, each traced to a field and a renderer, held to the registry's axes by equality (C10 T2.57) |
| **R-DEG-002** — Capabilities enhance | `owed` | nothing in the tree names it |
| **R-DEG-003** — Set-level width check | `covered` | C09 I93 · `test/unit/blocks.test.ts` T1.61 — the row is named *the set degrades whole, and the check is on the set*; `scrollbarSet` returns one whole set or the other, so no member can take an ASCII rung alone |
| **R-INT-009** — Immediate feedback | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-INT-010** — Reversible action | `owed` | nothing in the tree names it |
| **R-KEY-002** — Repeat is scoped and declared | `owed` | searched `src/interaction/router/` for a declared delay or repeat rate: one comment about held-key repeats at `router.ts:784` and no field. A repeating action declaring its own rate does not exist |
| **R-MOT-009** — Ping-pong endpoints occur once | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-MOT-010** — ASCII motion preserves semantics | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-MOT-011** — Shared alphabets share timing | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-NTF-001** — Watched completion earns notification | `owed` | nothing in the tree names it |
| **R-COL-006** — Metric polarity drives trend tone | `owed` | searched `src/presentation/` and `src/data/viewmodel/types.ts` for `polarity`, `higherIsBetter`, `goodDirection`, `trend`: no hits. A metric declaring whether up is good does not exist, so trend tone has nothing to read |
| **R-EVT-001** — Input windows coalesce by identity | `owed` | **a homonym again.** The `coalesc` hits are all `src/interaction/editor/undo.ts`'s *structural coalescing* of text edits. This rule is about high-rate **pointer** samples inside a declared window not replaying against a new owner epoch — M7 built `ownerEpoch` and `pointerArm` (`router.ts:1049`), and no sample window sits above them |
| **R-HON-008** — Configuration values name provenance | `owed` | nothing in the tree names it |
| **R-FOC-001** — Unpainted box focus | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-FOC-002** — Continuous-control focus | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-FOC-003** — Choice-control focus | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-FOC-004** — Picture focus | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-FOC-005** — Focus is not row-shaped | `owed` | nothing in the tree names it |
| **R-PTR-001** — Focus-first activation | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-PTR-002** — Remembered focus re-resolves | `owed` | the two `remember` hits in `src/shell/construct.ts` are prose about the transcript record and about *a keyboard equivalent made structural rather than remembered* — the second is the opposite of this rule. No store holds a stable focus identity across a view's departure and return |
| **R-PTR-003** — Hover may preview | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-PTR-004** — Legend click toggles a series | `owed` | nothing in the tree names it |
| **R-PTR-005** — Press arms and release commits | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-PTR-006** — Unpaired context click is inert | `owed` | nothing in the tree names it |
| **R-REF-001** — No leader sequences | `owed` | nothing in the tree names it |
| **R-REF-002** — Platform chords remain owned | `owed` | nothing in the tree names it |
| **R-REF-003** — Bindings do not change availability | `owed` | nothing in the tree names it |
| **R-TBL-001** — Table alignment follows value kind | `owed` | `align` is **declared by the column author** (`src/presentation/table/cells.ts:232`, `"right"`/`"decimal"`), not derived from the value's kind. The rule says alignment *follows* the kind, which is a default the framework does not compute — so the mechanism exists and the rule's direction does not |
| **R-TBL-002** — Decimal alignment | `covered` | C11 I26 · `src/presentation/table/cells.ts:106` `decimalPoints` — `align: "decimal"` is a column kind of its own and the point's cell is computed per column. **The plan's reconciliation table says this is unbuilt and that is now false** |
| **R-TBL-003** — Missing numeric value is unknown | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-TBL-004** — Numeric grouping and units | `owed` | nothing in the tree names it |
| **R-TBL-005** — Column-local tail truncation | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-TBL-006** — Sorting belongs to the header | `covered` | `src/presentation/table/cells.ts:191` — the header row carries `sortAsc`/`sortDesc` on the active column, so the sort state is drawn on the header and nowhere else |
| **R-KEY-003** — Conventional key vocabulary | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-KEY-004** — Bindings remain discoverable | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-PRI-002** — Primitive definitions stay locatable | `owed` | nothing in the tree names it |
| **R-PRG-002** — Bar alphabets declare placement | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-MOT-012** — Ramp meaning precedes appearance | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-KEY-005** — Help is a durable generated entry | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-KEY-006** — Key choices retain their rationale | `owed` | nothing in the tree names it |
| **R-GLY-002** — Reservations are verified in the composed grid | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-KEY-007** — Generated action-map surfaces | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-REG-002** — Normative authority is explicit | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-001** — Two selections, and the mouse belongs to the emulator | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-002** — The render must survive a naive drag | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-003** — A block is atomic in a selection | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-004** — A block's copy form, per kind | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-005** — esc clears the selection; a second esc leaves the rung | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-006** — Selection owns the ground, focus keeps its mark | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-007** — Rectangular copies cells, and says so | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-008** — a, A, and no whole-record key | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-009** — Three things redraw while frozen | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-010** — Buffered arrivals are announced on exit | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-011** — No clipboard is stated, never silent | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-012** — A drag scrolls the container the anchor is in | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-013** — Three autoscroll bands, and it stops at the container's end | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-014** — A container you pass through is taken whole and does not scroll | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-SEL-015** — All-or-none applies continuously | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-THM-002** — A high-contrast theme keeps 7 : 1, and says so | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-THM-003** — A high-contrast theme takes focus and selection as bands | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-THM-004** — A floor's scope is every ground the theme paints text on | `cited` | the R-ID is named outside `docs/design/language/` |
| **R-STA-004** — Availability ranks above a semantic extent | `cited` | the R-ID is named outside `docs/design/language/` |

---

**No total is stated here as prose.** The four figures above are the tool's
output and go stale the moment a row moves; to count them is to run it:

    node tools/rule-status.mjs

