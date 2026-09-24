# 00b · Acceptance criteria, by MR

**What this file is for, and what it is not.** The sixteen MRs reconciling this
repository with the design language are planned elsewhere; this holds only the
items that are **owed to a later MR by an earlier one** — a blocker named when it
was found, so the MR that lifts it knows the work is its.

**The reason it exists is a row that goes red.** C10 T2.48 asserts, against the
tree, that four of §4k's six compositions have no subject. The day one acquires
one, that row fails — and a failing row whose remedy is written down in the MR
that caused it is scheduled work. A failing row whose remedy is in nobody's list
is a surprise at the end of an unrelated change, and the first thing anyone does
with a surprise is widen the assertion.

Each item names **what goes red**, so the criterion is checkable rather than
remembered. A deferral names a condition and nothing watches it (CLAUDE.md); the
watcher here is the row, and this file is what the watcher points back to.

---

## The landing record — one row per MR, and the symbol that proves it

**Why this table exists, and what it is not.** Everything above is *owed by an
earlier MR to a later one*. Nothing recorded whether an MR **landed**, so the
question *is M5 finished?* was answerable only by reading the tree again, and a
survey that has to be redone is a belief rather than a record. Asked eight times
across one session, it was re-derived eight times.

**What each row asserts is the seam's existence and nothing more.** A symbol
resolving does not mean the MR is correct — that is what its own invariants and
rows are for, and they number in the hundreds. What it means is that the seam the
MR introduced is **still there**, so a revert, a rename or a merge that quietly
drops it goes red here rather than being discovered by a survey. The limit is the
point: this is a **revert detector**, not a completeness proof, and a row that
claimed more would be the kind of green that reads as thoroughness.

| MR | the seam it landed | symbol | file |
|---|---|---|---|
| **M4** | the spinner sets, whole at every rung | `SPINNER_SETS` | `src/presentation/blocks/glyphs.ts` |
| **M5** | one ownership ladder, with explicit verdicts | `Verdict` | `src/interaction/router/types.ts` |
| **M6** | the keymap checked against the registry | `REGISTRY_BINDINGS` | `src/interaction/router/keymap.ts` |
| **M7** | arming and pointer commit on one epoch | `ownerEpoch` | `src/interaction/router/router.ts` |
| **M8** | `blocking` and `dismissal` made independent | `dismissal` | `src/viewport/overlay/types.ts` |
| **M8b** | the wheel takes the innermost scrollable | `innermostScrollUnder` | `src/shell/construct.ts` |
| **M9** | no pushed views — the surface re-homed onto `child` | `ChildSurface` | `src/shell/surface.ts` |
| **M10** | copy mode renamed to native selection | `nativeSelection` | `src/shell/frame.ts` |
| **M11** | the carrier table, one row per state axis | `4k.5` | `docs/components/C10_theme_resolution.md` |
| **M12** | the trust boundary, over every escape class | `R-TRU-001` | `test/unit/trust-boundary.test.ts` |
| **M13** | the chip, minted as one undo unit | `ChipInsert` | `src/interaction/editor/editor.ts` |
| **M13b** | the prompt's labelled rule | `labelSpansOf` | `src/shell/paint.ts` |
| **M14** | the scrollbar, drawing nothing where it cannot move | `scrollbarColumn` | `src/presentation/blocks/scrollbar.ts` |
| **M14b** | the pull — focus moves the window by the minimum | `pull` | `src/shell/pull.ts` |
| **M15** | the typed reply, over the one editor | `AskOptions` | `src/shell/local/registry.ts` |
| **M15's remainder** | *who owns the keystroke* asked by id at three sites | `CHIP_PREVIEW_ID` | `src/shell/construct.ts` |
| **M16** | the design fixtures, by equality against the corpus | `design-fixtures` | `test/golden/DESIGN_FIXTURES.md` |

**Gated by C10 T2.58**, which reads this table and resolves every symbol against
the named file. A row naming a file that does not exist, or a symbol that is no
longer in it, fails — and the control is a fabricated row, because a table of
sixteen true statements passes exactly like a checker that reads nothing.

## The deliverable record — the named deliverables, not the seam

**One symbol per MR answers *did it land*, never *are its deliverables built*.**
That distinction cost four separate by-hand sweeps before it was written down,
and each sweep found something the seam symbol could not: M11's carrier half,
M14's accent-on-focus taken at the consumer rather than the primitive, M15's
`LineState`. A sweep that has to be redone is a memory, so these are symbols
too, resolved against the tree by the same gate.

**M4 is absent on purpose.** Its six rulings have a file of their own —
`test/unit/m4-rulings.test.ts`, seven rows — written because *M4 landed* was
carried across several sessions as a settled fact and disputed again each
time. Each row reads the thing the ruling is about rather than a mention of
it: a grep for `live` answers on a comment, where what the ruling says is that
the **slot** is gone. Duplicating those rows here would be a second record of
one fact, which is what this document argues against everywhere else.

**Five deliverables landed differently from the plan**, three of them better,
and one because the plan is looser than the design — which is why every row
names the tree's answer rather than the plan's words:

| MR | the deliverable, in the plan's words | how the tree answers it | symbol | file |
|---|---|---|---|---|
| **M5** | *`FOCUS_ORDER` becomes the design's rungs* | the design's six are the **published** vocabulary and what the footer draws; `FOCUS_ORDER` keeps finer internal targets that map onto them — `nativeSelection` and `semanticSelection` are both `copy` | `OWNER_RUNGS` | `src/interaction/router/types.ts` |
| **M5** | *verdicts become explicit* (`R-OWN-001`) | the four, as a union | `Verdict` | `src/interaction/router/types.ts` |
| **M6** | *`defaultKeymap` becomes generated data* | generated, and `super` canonicalises as `u` so two chords cannot share a slot | `REGISTRY_BINDINGS` | `src/interaction/router/keymap.ts` |
| **M8** | *split into `blocking` and `dismissal`* | `dismissal` is **three-valued**, not the plan's boolean — `escape`, `focus`, `answer` | `dismissal` | `src/viewport/overlay/types.ts` |
| **M8** | *the innermost-scrollable walk is built here* | and it is what R-SEL-012's *innermost* needs to have a referent | `innermostScrollUnder` | `src/shell/construct.ts` |
| **M9** | *`kind: "view"` is deleted* | retired by `R-EXA-082`, with the note kept in place rather than the line deleted | `R-EXA-082` | `src/viewport/overlay/types.ts` |
| **M9** | *`PushedSurface` → `ChildSurface`* | with the handle renamed to match; 0.x, no deprecation cycle | `ChildSurfaceHandle` | `src/shell/surface.ts` |
| **M7** | *press arms `(stableId, ownerEpoch)`, release commits* | one epoch shared by keys and pointer, so a raise invalidates a press already in flight | `pointerArm` | `src/interaction/router/router.ts` |
| **M7** | *the safe default of a question is deny* | the fallback is the **last** choice, not the first — for a destructive verb the safe option is conventionally last, and a caller that forgets should forget safely | `defaultChoice` | `src/shell/confirm.ts` |
| **M10** | *`v`/`V`/`a`/`A`* | **the plan is looser than the design here.** `R-SEL-008` is *a, A, and no whole-record key*, so `v`/`V` are not owed and their absence is the rule being followed | `selectAllLoadedEntries` | `src/interaction/router/keymap.ts` |
| **M10** | *a block is atomic in a selection* (`R-SEL-003`) | the copy walks whole blocks and drops an entry whose selected blocks all decline, rather than contributing a blank paragraph | `copyTextOf` | `src/shell/semantic-selection.ts` |
| **M11** | *contrast generated over every tone × surface × theme* | including `selection`, across all ten themes, with the ground taken by lookup rather than by a conditional — the shape that answered wrongly for a third band | `validateBands` | `src/presentation/theme/contrast.ts` |
| **M12** | *a malicious-content fixture suite covering every escape class* | a payload covering SGR, erase-display, OSC-with-BEL and C1 CSI appended to every string in every block kind | `R-TRU-001` | `test/unit/trust-boundary.test.ts` |
| **M13** | *§026's trails attach to streaming text* | declared on the notice rather than inferred, so the trail and the mark degrade separately — at 1-bit the trail is gone and the mark is not | `streaming` | `src/data/viewmodel/types.ts` |
| **M13** | *the chip is one wrap unit, never half-painted* | and the delimiter travels **inside** the one edit, which is what the frame could not show: a second `insert` let `⌘_` take back the space and leave the chip | `ChipInsert` | `src/interaction/editor/editor.ts` |
| **M13** | *the prompt's top rule gains §069's label* | painted as a ground and not as text, shedding first at 60 columns | `labelSpansOf` | `src/shell/paint.ts` |
| **M16** | *the design fixtures onto the golden frames* | one row per surface, each carrying its evidence and its named remainder, with the census driven rather than written | `ONE_PER_KIND` | `test/support/design-surfaces.ts` |
| **M14** | *the thumb takes `accent` when its container has focus* | at the **consumer**, not the primitive — which is why a grep of `scrollbar.ts` alone reports it missing | `scrollbarSet` | `src/presentation/blocks/kinds/containers.ts` |
| **M15** | *`Snapshot` widens past `{text, cursor}`* | **three types, not one widened** — one type would have to be the widest of the three and would make the other two's exclusions unstateable (C17 I22 drops the region on purpose, C20 §4 holds text alone) | `LineState` | `src/interaction/editor/editor.ts` |
| **M15** | *the overflow path replaces eliding the evidence* | the `...` arm is the **entry** to a suspended state that bounds the payload with C04 I49's residue row, rather than the whole answer | `inspection` | `src/shell/confirm.ts` |

**M15's remainder is a row rather than a comment, because it was a comment.**
Seven of M15's eight deliverables resolve; the eighth is `promptUnderMenu`'s
hardcoded exemption, which the plan says is *subsumed — it was this rule with
one consumer*. Half of it was: `confirm.replacing !== null` landed and is
§101's table. The other half names two ids, under a comment saying they are
*named rather than derived because no field distinguishes them from a search —
which is a gap worth closing and not a rule to guess at*.

**The search is the third instance, and it is what makes the axis findable.**
`construct.ts:3336` asks the same question of `SEARCH_ID`, so three sites now
answer *who owns the keystroke* by comparing an id. Two instances would have
been a coincidence; the third is this repository's own stopping point — and it
is also what refutes the obvious fix. A boolean `composes` cannot carry all
three: the search's answer is unconditional, the chip preview's is
unconditional the other way, and the completion menu's is conditional on
`keys.selected` (C19 I20). The distinction wants a **declaration the layer
makes**, and choosing its shape is a walk, not an edit.

So it is named here, with its symbol, where `C10 T2.58` resolves it against
HEAD — rather than living in the comment that already knew.

**And its population is this plan, which is not the registry** — so there is a
second record beside it, and the pair is the point. `AUTHORITY.md` puts
`status: current` at the top of the precedence ladder and this document nowhere
on it, so a rule the plan never named is invisible here however green the table
is: the landing record can only answer *did the MR land*, never *is the rule
answered by anything*. `RULE_LEDGER.md` holds the other population — all 118
`current` rules, `cited`, `covered` or `owed` — and `tools/rule-status.mjs`
gates it under `make design-check` (A03 SS66). The first run of that instrument
read **70 cited, 7 covered, 41 owed** against a landing record that was
complete, which is the measurement that argues for keeping both.

---

## M4 · Glyphs — the head mark, `agent`, reservations

| Owed by | Item | What goes red when it lands |
|---|---|---|
| C10 §4k (F1240's MR) | **Composition 5 — `disabled` + `error`.** `disabled` is an availability fact and no block carries the field. Once it does, draw the frame at all three rungs in `test/golden/compositions.test.ts` and discharge **C10 T2.47**, which is `it.todo` on exactly this blocker. | C10 T2.48's availability clause · the composition file's derived count, which asserts `(6 − owed) × 3` frames |
| C10 §4k (F1240's MR) | **Composition 6 — `stale` + `running`.** `stale` is a freshness fact and no block carries the field. Same remedy, same two rows. | as above |
| C10 §4k.4 | **The selection mark `▌` needs a glyph slot of its own.** The slot is taken by `GlyphSet.bar` (`glyphs.ts:276`). **The reason this row used to give was `live` is taken, and `live` was retired at M4's close**, so the occupant it named is gone and the conclusion survives on a different occupant — which is why the reason is written as a line the reader can go to. Recorded when §017's copy gutter was read; not ruled here, because whether a gutter column is added beside the wash is a width question C11 I14 owns, and `▌` is `East_Asian_Width=Ambiguous` besides (`glyphs.ts:462`, the finding that a 40-cell bar drew 80). | nothing yet — this is the one item with no watcher, and it is named as such |

## M7 · Arming, epochs and pointer commit

| Owed by | Item | What goes red when it lands |
|---|---|---|
| C10 §4k (F1240's MR) | **Composition 2 — hover beside focus.** No block declares `hovered`, so the fact cannot arise. Draw the frame at all three rungs the day one does, and discharge **C10 T2.46**, whose hover half is exercised through a constructed state until then. **The reason this row used to give was falsified by the tree and was wrong in both directions** — it read *mouse mode 1002 sends no motion, so the fact cannot arise*, and `lifecycle.ts:125` has taken **1003** behind a `hover?: boolean` option since, with the decoder reading a no-button move at `router/types.ts:312`. A pointer move can arrive. What stops the fact is the other end: the router discards a hover **by rule** (`router.ts:377`, `:525`, `:766` — §4a row t, *a hover is not a gesture and clears nothing*) and no block carries the field. So the mode was never the condition, and an MR picking this row up would have found the transport already there and drawn a frame for a fact nothing produces. | C10 T2.48's hover clause, which asserts the **field's** absence and is the condition that can actually change · the composition file's derived count |

## M9 · No pushed views

| Owed by | Item | What goes red when it lands |
|---|---|---|
| C10 §4k (F1240's MR) | **Composition 3 — selection over a diff ground.** Both facts ship — `patch/lines.ts` paints the grounds and the `+` / `−` marks, `selectionStyle` paints the wash — and they cannot meet, because `patch` **declares no elements and reads `ctx.focus` nowhere**. The ground is not missing; the **addressability** is. It is the only one of the four whose remedy does not begin with a new field. | C10 T2.48's addressability clause, which asserts the seam and not the slot · the composition file's derived count |

## M11 · The carrier matrix and the contrast gate

| Owed by | Item | What goes red when it lands |
|---|---|---|
| C10 §4k.4 | **`semantic extent` is a single rung for two axes** — outcome and validity — so a pair drawn from those two is ranked against everything else and against nothing else. Whether choice and disclosure ever contest a ground is unasked. | nothing yet; it is a gap of the same shape as the one that produced R-STA-004 |

---

**A row here is discharged by deleting it**, in the MR that lands the item, in the
same commit as the frame or the scan it names. A row that outlives its item is the
deferral this file exists to stop, one level up.
