# The design fixtures, mapped

**109 fixtures across 111 sections, and every one has a row here.** The table is
parsed by `design-fixtures.test.ts` and compared against
`docs/design/language/fixtures/` **by equality**, so a fixture with no row is a
failure and a row naming no fixture is a failure. That is the whole reason this is a
file rather than a paragraph: *mapped, surface by surface* is a claim about a corpus,
and a claim about a corpus that nothing counts is one nobody can check (F163, and
`corpus.test.ts` is the precedent).

**The plan said 130 and the number is 109.** A count is what a reader checks coverage
against, so a wrong one reads as a bigger corpus than exists and makes any partial
mapping look worse than it is. 111 sections, 109 with a fixture — §025 and §040 have
none, and that is **not** a gap: both are the design's live animations (*"Drag the
clock to scrub it"*), so their specimen is motion rather than a frame. The corpus omits
exactly the two that could not be a picture.

## Three facts, and the first draft carried them in two columns

**This table was wrong when it was written, and wrong in the way it warns about.**
Its first version had one column that meant both *is this surface built* and *does a
golden frame draw it*, and it answered the first from the **plan** rather than from the
tree. Measured against HEAD, most of what it called outstanding was already built:
`focusGround` has 53 references, `dismissal` is split, `kind: "view"` is retired with
its finding number on it, `nativeSelection` has 31, and `scrollbar.ts`, `tape.ts`,
`headMark` and `REGISTRY_THEMES` all exist. Two columns carrying three facts is
exactly what `dismissable` was doing before M8 split it, and the fix is the same one.

| column | what it answers | how |
|---|---|---|
| **class** | is there a surface here at all | a judgement, stated as one |
| **built** | does the subject exist in the tree | a **probe** — a symbol whose presence is checked |
| **target** | does a golden frame draw it, with the fixture as its target appearance | a path that must exist |

**And a probe answers less than it looks like it does.** It says *a subject with this
name is in the tree*; it does not say the subject matches the design. That is what the
**target** column is for, and it is why raising `built` is not the remaining work of
this MR — raising `target` is.

**A third probe answered from the wrong subject entirely.** §076 is *per-token
values* — a shaded run over the model's own output, whose own fixture says *the
symbol is reserved* and *it is the SAME mechanism spans needed*. It is a valued
span, not a theme token, and its probe was `REGISTRY_THEMES`: a symbol that
resolves in abundance and has nothing to do with the fixture. A probe can be
wrong by naming a spelling that does not exist (§069's was), by naming a word
that occurs for unrelated reasons (§035's), or by naming a real symbol belonging
to a different subject — and only the third reads as *built* while being about
something else altogether. Its row is `no` and its MR is M13, where the valued
span belongs.

**`granularity` was the example that sentence used, and it turned out to be an
instance rather than an illustration.** §035 and §036 both probed it, and the probe
resolved: eight times in `src/`, five of them inside `new Intl.Segmenter(undefined, {
granularity: "grapheme" })`. `Progress` carries `style` and `ramp` and no third member,
so the three independent axes §035 specifies are **unbuilt**, and the column said they
were built for as long as it has existed. Both rows read `no` now. **Nothing caught
it** — `design-fixtures.test.ts` now strips comments before searching, which is a real
narrowing and does not reach this case, because an option key of a standard-library
call is code. What found it was reading the type. So `unbuilt` goes from 2 to 4, and a
figure moving the wrong way is the honest half of the same measurement.

**Seven of sixty-five probes were wrong on their first run, and a probe that does not
resolve indicts the probe before the tree.** `ONE_PER_KIND` lives in `test/` and the
probe searched `src/`. There is no `link` or `widget` block kind, so two probes named
nothing the repo ever had. And §069's labelled rule — which the plan lists as unbuilt —
is built as `rule(width, deps, label)` with `labelSpansOf` and §069's own 60-column
shed; the probe simply guessed the wrong symbol. Every one of those reads, from the
outside, exactly like an absence.

**What is genuinely absent is links** (§054, §055). OSC 8 appears in the tree once, in
`decode.ts`, as a comment about bytes arriving *from* a terminal-aware pager. Nothing
emits one.

## The classes

| class | what it means |
|---|---|
| **surface** | the design draws something here; `built` and `target` say how far it has come |
| **prose** | a rule table or an explanation. Nothing is drawn, so there is nothing for a frame to be wrong about |
| **app** | the reference application's surface, drawn by `examples/`, not by the framework |

**The class cannot be derived from the fixture, and the obvious derivation fails in
both directions.** `corpus.test.ts` derives its kind from imports and says why —
*otherwise the row asserts itself* — so the first draft tried the same: prose is a
fixture whose own text carries no drawn frame. Wrong twice. **Ten surface fixtures
carry no box-drawing**, because a call head is a line of text and not a box; **eight
prose fixtures carry plenty**, because a rule table is often drawn in one. §063 draws
312 box characters and specifies no surface; §030 draws none and specifies the
most-drawn line in the application.

## The table

| § | class | built | target | what the fixture specifies |
|---|---|---|---|---|
| 1 | prose | — | — | the rule list itself |
| 2 | prose | — | — | where each primitive is defined |
| 3 | surface | `overlayRegion` | `session-frame.test.ts` | the five regions with activity present |
| 4 | surface | `spinning\|SPINNER_SETS` | `session-frame.test.ts` | idle — the activity region and its rule gone |
| 5 | surface | `spinning\|SPINNER_SETS` | `session-frame.test.ts` | cancelled — the spinner stops, the region stays |
| 6 | surface | `GLYPH_TABLE` | `design-surfaces.test.ts` | the canonical marks, as a glyph census |
| 7 | surface | `descendants` | `states.test.ts` | a subagent's nested calls |
| 8 | surface | `questionNotice` | `blocks.test.ts` | a message entry |
| 9 | surface | `CALL_STATE_GLYPH` | `states.test.ts` | queued, and what a queue draws |
| 10 | surface | `emptySnapshot` | `session-frame.test.ts` | startup and resume |
| 11 | surface | `insertChip` | `design-surfaces.test.ts` | a mention is a chip — `design-surfaces` §11, drawn because the whole claim is a **form**: what crosses the seam are the parts, and the label is C17's composer's (C17 I25, C19 I28). An assertion on the string is satisfied by a source that handed one over; only a picture shows it did not. **Both halves shipped and had never met** — C17 has minted chips since roadmap 30 and the only caller was a large paste, while every candidate this engine produced accepted as a string, so a mention was expressible in neither direction. **The census settled a form the repository had wrong**: §011 draws `[parse.ts · 184L]` and §101 draws `[#1 json · 47L]`, and the composer wrote the ordinal in both. The discriminator is the name — a paste's is its *detected kind*, so two pastes of JSON are one word twice and the number is all that tells them apart; a file and an image name themselves. C17 I25 amended, and minting untouched, since the number is still the map's key. **And the build was wrong about the undo unit in a way the frame could not see**: the delimiter went in a second `insert`, so `⌘_` took back the space and left the chip — caught by reading the whole buffer back, and the delimiter now travels inside the one edit (`ChipInsert`). **The remainders, named**: the `@` trigger and the file source are the application's, not the framework's; the size warning past a threshold is M15's question work. **§101's preview panel is NOT owed and a first draft of this row said it was** — C22 I113 with T1.69 and T1.70, built and gated, which is what going to the tree rather than to the previous row answers. What the chip still owes is the **presentation** side: `Atom` is `text.ts`'s wrap-unit mechanism and the editor's own walk is a second implementation of atomicity, so a chip's label drawn inside a rendered block — rather than inside the prompt — can still be half-painted |
| 12 | surface | `questionNotice` | `blocks.test.ts` | multi-line and transient feedback |
| 13 | surface | `CALL_STATE_GLYPH` | `states.test.ts` | reviewing what auto wrote |
| 14 | surface | `emptySnapshot` | `session-frame.test.ts` | away, and what the frame says while you are |
| 15 | prose | — | — | four interaction principles |
| 16 | prose | — | — | scopes, as an ownership table |
| 17 | surface | no | `design-surfaces.test.ts` | focus treatment follows the shape — `design-surfaces` §017, a census of what each kind publishes against what it draws, because *follows the shape* is checkable only as a table of shape against treatment. **The old row here was wrong three ways and is corrected by measurement**: it said *`scroll` and `plot` answer block focus and the other thirty-four do not* — there are **23** kinds in `ONE_PER_KIND`, not 36; `table`, `pills` and `tape` answer as well; and the cause is not a missing treatment but that **17 kinds publish no focusable element at all**, so §017's RUN and FRAME rungs have no subject in this tree rather than an unbuilt one. Six kinds publish elements and five draw a treatment. **`mosaic` was the sixth** — four focusable elements, nothing drawn for any of them — closed by C09 I100: a pane is a *region* in §017's own vocabulary and takes `focusGround`, painted by the container because a child's own predicate tests the child's block id, which a mosaic-scoped focus never matches |
| 18 | surface | no | `design-surfaces.test.ts` | focus on things that are not rows — `design-surfaces` §018, drawn as **two tables** because both subjects fail structurally: the cells differ by *which channel moved*, and in both the wrong build is at rest in every frame a trace would produce. **Three of the five cases were already built** and the §17 census says so — the unpainted box is §073's button, and `plot` and `mosaic` both publish an element and draw a treatment. The map row that stood here was wrong about the button. **What was owed is `R-FOC-002` and `R-FOC-003`, and neither was a block kind**: `choice` (C09 I105) and `control` (C09 I106) land here. A choice is one shape — its mark and its label together — with the mark carrying *chosen* and the wash carrying *focused*, two channels that never substitute; the cell that separates a correct build from a plausible one is **focused and NOT chosen**, *which is the whole point of a radio group*, and a wash read off `chosen` draws three of four correctly. All four marks are the registry's already. A control has three states and three mechanisms and *the VALUE is INFO and it never changes* — the clause a plausible build loses, since toning the reading with focus reads well and says the reading is chrome. `FocusState` gains `inside`, which C16's ladder has had a rung for since M5 and the renderer could never read. **Two rulings taken against §018's own principles.** The inside handle's ASCII arm is the resting one's, declared rather than discovered: the track carries inside at every rung, `─` against `━` and `-` against `=`, which is why §018 names the weight first. And the track does **not** widen when the reader enters it — §018 draws the inside line two cells longer, and its own case 4 refuses that on the other axis: *drawing a border on focus is REFUSED: it changes the height, and measure already committed to one*. The spaces are the fixture showing emphasis in plain text, as its indentation of a focused option is. **The remainder, named**: case 5's mosaic and case 4's axes are built and drawn; §018's ★ — *an inside-bearing continuous control cannot commit its domain value from outside* — holds at the router already, since `interaction` answers for the `inside` rung, and this is what lets a frame say so |
| 19 | surface | `keyboardProtocol` | `design-surfaces.test.ts` | the resolved keymap, the reader's own rung first — 121 bindings across eight scopes, drawn through the `rule` + `keyValue` pair `/help keys` draws and ordered by `scopesInReadingOrder`, which is `R-KEY-005`'s own seam (C16 §6a clause 4). The census draws what ships rather than the registry's 39, because the resolved keymap is the registry's bindings plus the routes and the block rungs — the check is that the grouping and the order are the design's |
| 20 | prose | — | — | DAS and ARR as figures |
| 21 | surface | `scrollbar` | `design-surfaces.test.ts` | the scrollbar — the set degrading whole, and the bar beside a box that overflows |
| 22 | surface | `R-KEY-005` | `design-surfaces.test.ts` | the help view as an entry — the same listing §019 frames, and the section that settles its order: *the active scope is rendered first, then preserves registry order for the remaining scopes*, which the tree had as alphabetical and §022's own picture could not discriminate (`global` before `transcript` satisfies both). C16 §6a clause 4, T1.100 |
| 23 | surface | `displayRows` | `blocks.test.ts` | at 40 columns |
| 24 | surface | `CALL_STATE_GLYPH` | `states.test.ts` | reasoning |
| 26 | surface | `hotEdge\|hot-edge` | `design-surfaces.test.ts` | the trail and the mark at the head — `design-surfaces` §026, four passes read on the FOREGROUND, which is the channel this section lives in: a ground mask draws the whole block as one letter. **Two carriers with two jobs** — *the TRAIL says what just arrived, the MARK says more is coming* — and the trail was built (C09 I90/I91) while the mark was not. **What settled the mark is the registry's projection and not the plain-text fixture**: `sectionBlocks[181]` draws it as `[c-accent sp sp-agent]''` — an **empty span**, a CSS-rendered spinner — so `R-BLK-183`'s text lost the glyph entirely and a reader going to the picture would have drawn a static `✦`. C09 I101: the `agent` set at `glyphTick`, in `accent`, one space past the head, with its two cells **reserved in `noticeRows`' budget** so `measure` and the render see one wrap. The 1-bit pass is what makes the pair two carriers rather than one fact twice — colour dies, shape does not — and the 48-column pass is the reservation, at the one width where it moves a word; at 40 and at 80 both wrap identically, so a caption claiming it there would be §076's defect again. It also repaired a carrier that had never moved: `ANIMATES.notice` is `false` and the trail's ramp is derived at render rather than sitting on a span, so **neither the mark nor `ripple` had ever asked C03 for a tick** |
| 27 | surface | `barCells\|BAR_STYLES` | `plot-forms.test.ts` | the context composition bar |
| 28 | surface | `promptReplaced` | `question-slot.test.ts` | approval replaces the prompt — C23 I74 |
| 29 | surface | `menuWindow` | `session-frame.test.ts` | completion expands the prompt |
| 30 | surface | `headMark` | `design-surfaces.test.ts` | the dot, the cursor and the running state — the head mark's three rungs |
| 31 | surface | `SPINNER_SETS` | `design-surfaces.test.ts` | every reusable spinner set at its own interval |
| 32 | prose | — | — | the four spinner rules |
| 33 | surface | `BAR_STYLES` | `design-surfaces.test.ts` | nine alphabets, and where each belongs — where `ascii`'s empty was found to be `.`; `plot/ramp.ts` holds a second ASCII pair whose empty cannot follow without colliding with its absent mark, and that is a parked question |
| 34 | surface | `BAR_STYLES` | `design-surfaces.test.ts` | active progress bars — and the painted rung beside the drawn one, as a mask, because the whole of the closing figure is in the channel a stripped read folds away |
| 35 | surface | `granularity` | `design-surfaces.test.ts` | quantity, granularity and liveness as three axes — five triples, two of them the presets and one that is neither; the segmented ASCII rung is PARKED, because §035 draws `[#][.]` where the registry's `bars.ascii` is one `#`/`-` pair |
| 36 | surface | no | `design-surfaces.test.ts` | the operation surface — `design-surfaces` §036, drawn as a **table** because the two heads differ by which rule applies rather than by a value, and nothing happens between them that a sequence could key on. The two triples were already expressible (C09 I97); what was owed was the surface. **C23 I76**: while it runs, the elapsed and the delta are one grouped field — *the parentheses group the two as an aside, so the eye reads the VERB first and the numbers second* — and once it stops the group is gone and the same numbers are flat peers. That flattening is the walk's finding: *the aside groups the two* and *a head joins its fields with the separator* are both true, and a row asserting only the running line passes against a build that brackets the settled one. The bar goes in **three** stopped states by one predicate, because *a 100% bar on a finished thing is a row spent on nothing* and *a stopped bar is a claim about progress that is not being made any more* do not substitute for each other. **C09 I104** came with it: the meter's label column was `width / 3` unconditionally, so the bar row — which carries no label, the verb being on the head above it — spent nineteen cells of fifty-six on blank, and §036's shape was unreachable from outside. **Read the frame**: the running head wrapped where the settled head fitted, because only the settled one carried a `state` and so only it was a head (C09 I46); at 28 cells the aside fell to a second row at column zero. **The remainders, named**: the bar's two-cell indent under the verb is a relation between two blocks, which is C22's `entryLayout` and not a block field — the tree's only indent mechanism, `GLYPH_INDENT`, is per glyph token and a meter has no glyph; and the duration reads `64s` where §036 draws `1m 04s`, which is `elapsed()`'s 99-second threshold — a **specimen** value, since no `current` rule in the registry prescribes a duration format, against a shipped format every call head and every golden in the tree agrees with |
| 37 | surface | `RampAnimation` | `design-surfaces.test.ts` | every registered effect, on four axes — the five fills across an extent, the ladder from 24 bits to 1, the animations at a tick, and the same effects through time, which is the only axis six position-free effects are visible on; `centred` is the fill the registry registered and the type could not express |
| 38 | surface | `RampAnimation` | — | **two of its three blocks landed and the third is parked.** The agent's mark — the bloom family walked continuously, 82 frames, reserved to `agent` — is C09 I98 with T2.164 as the grep-gate the fixture asks for; the degradation table at its foot (`below 8-bit`, `motion reduced`, `motion off`) is C09 I99 with T2.166-T2.168. What is owed is the middle block alone: ten verbs against ten ramps. **It is parked and not unbuilt** — the design pairs them in prose and supplies no key a producer could name one by. The registry's `semantic` field is a free-text gloss (`motion`, `thinking`, `too wide`), one per ramp, not a controlled vocabulary; so a framework table would be this repository choosing an English lexicon, which is a visible choice §038 does not settle and nothing else in the tree does |
| 39 | prose | — | — | one interval, one family |
| 41 | prose | — | — | the spinner is chosen by the verb |
| 42 | surface | `kind: "pills"` | `blocks.test.ts` | widgets — and `design-surfaces.test.ts` draws it against §042 as well |
| 43 | prose | — | — | spans, as the substrate four things wait on |
| 44 | surface | `nativeSelection` | `design-surfaces.test.ts` | two selections, one clipboard — `R-SEL-006`'s four states as grounds, in two passes because one figure has one head. **The fixture's `▌` is a ground, not a mark**, which the registry settles and the picture cannot: `R-SEL-006` says *selected takes selectionGround and no mark; focused and selected keeps the mark*, so the gutter block is a plain-text depiction of a background. Read through `styledScreenFrom`, because a stripped frame folds the channel away and would draw four identical rows under four different rules |
| 45 | surface | `kind: "terminal"` | `blocks.test.ts` | the live terminal block |
| 46 | surface | `searchOpen` | `session-frame.test.ts` | history, search and ghost text |
| 47 | surface | `assertContainerPremise\|containment` | `containment.test.ts` | empty, too small, stale, interrupted, refused |
| 48 | surface | `CALL_STATE_GLYPH` | `design-surfaces.test.ts` | block states, including the `empty` form |
| 49 | surface | `kind: "panel"` | `blocks.test.ts` | one block of every kind |
| 50 | surface | `kind: "panel"` | `blocks.test.ts` | the tool-result gallery |
| 51 | surface | `confirm-source` | `question-slot.test.ts` | approval overflow — the inspection (C23 I75) |
| 52 | surface | `questionConsumer` | `question-slot.test.ts` | a question that wants a sentence (C23 I73) |
| 53 | prose | — | — | the mouse, as a ruling table |
| 54 | surface | no | `blocks.test.ts` | links |
| 55 | surface | no | `states.test.ts` | a link's states |
| 56 | prose | — | — | six pointer rulings |
| 57 | prose | — | — | ⌃C across five contexts |
| 58 | surface | `nativeSelection` | `design-surfaces.test.ts` | what copy takes — the source beside the rendering, which is the only form that carries the claim: a copy text asserted alone reads as correct and a drawn row alone says nothing about what `y` takes. The table draws `par…` and copies the full TSV; the patch draws a gutter view and copies a unified diff; the rule declines and is absent from the join rather than empty in it (C09 I86, R-SEL-004). Tabs and newlines are shown as `⇥` and `↵` so the terminal cannot re-align the copy column into something resembling the padded one |
| 59 | surface | `searchOpen` | `session-frame.test.ts` | find |
| 60 | surface | `refreshAnchors` | `session-frame.test.ts` | resize |
| 61 | prose | — | — | eight cases that are not edge cases |
| 62 | prose | — | — | latency, and the window that causes it |
| 63 | prose | — | — | three refusals, and what stays rebindable |
| 64 | surface | no | — | undo — **reclassified from `prose`, and the classification was the finding.** §064's own sentence is *undo is a transcript entry, because an invisible undo is one you do twice*, which is a claim about a drawn form: `● reverted · parse.ts · +2 −2 undone   ↺ redo` over a `⎿` continuation, muted *because nothing went wrong and nothing is pending*. Every part is the framework's — the head grammar (C23 I76), the delta, the gutter, the tone, and a row affordance through `Action` (`types.ts:629`, whose bar is derived from `rows.some(r => r.actions)`). What is NOT the framework's is when to produce one, and §064 rules that too: an edit yes, a whole turn yes, **a command it ran NO** — *rm does not come back, and offering an undo that cannot work is worse than having none*. **Blocked on parked question 17**: `↺` is drawn 22 times in the registry and carried by no glyph record, so drawing this surface means inventing its ASCII rung |
| 65 | surface | no | `design-surfaces.test.ts` | the context fills — `design-surfaces` §65, **reclassified from `prose`, and drawing it found a live defect.** Two bars in one figure because they are the section's argument: the context is a **capacity** (`██░░`, still, a budget being spent) and the compaction an **operation** (segmented, active), which is §035's independent axes landing in one place — a figure drawing both with one alphabet would say the distinction does not exist. The compaction rows are §036's head unchanged, running and settled, which is what says the two are one grammar (C23 I76) rather than two specimens. **The frame-read finding**: `ctx` spent eighteen cells of fifty-six on a three-cell label, because C09 I104's `width / 3` was a *reservation*; the design draws `ctx` and `disk` in a column four wide plus a gap, so the third is a **ceiling** now. Thirty goldens moved, and `table`'s were the worst case — `epoch`, five cells, reserving forty-eight. **The remainders, named**: which turns drop and the panel listing them are the application's (§065's own sentence is that only a harness holds the turns to say it); the shared column across sibling meters is C22's `entryLayout`, the seam §036's bar indent is owed to; and `39k/50k` wants a unit abbreviation the framework does not have, where it draws `94/100` |
| 66 | surface | `FAILURE_WORDS` | `states.test.ts` | tool failures against model failures |
| 67 | surface | `viewport` | `session-frame.test.ts` | scrolled back while a turn runs |
| 68 | surface | `degradesTo1Bit` | `compositions.test.ts` | one exchange at three capability rungs |
| 69 | surface | `labelSpansOf` | `session-frame.test.ts` | the prompt's upper rule, labelled — three scenes, and the 1-bit one needed a capability override because no environment reaches the rung |
| 70 | surface | `REGISTRY_THEMES` | — | /colour and /label, tinting the chrome — **parked, not merely unbuilt**. The mechanism is specified in detail (chrome only, per directory in `.calcium/config.toml`, a name resolved per theme against a hex taken literally, the hex gated by a choice-only contrast question, animation an explicit decoration exception suppressed under reduced and off) and the **ten hues have no values**: named and described as VIVID, with no palette anywhere in the registry. Ten vivid colour values is the ask list's own example. Held whole — the hex arm needs no new values, but a verb that refuses three of the six forms its help lists is not a smaller version of this |
| 71 | surface | no | — | the five permission postures — **reclassified from `prose`, and the second classification the sweep caught.** §071 is not a rule table: it draws the footer in each of five postures, measures each symbol against a named trap (`⏸` rejected because *it IS an emoji — the `⏺` trap again*, `‼` and `⚡` likewise), and rules the channel — *NOT ONE of them is painted*, because the error tag is the only painted label that means a status, so the distinction is the channel and not the hue. `»` here is the mode line's lead, which is the second rôle M4's ruling put on the record (`glyphs.ts:213`). **Blocked on parked question 18**: the registry's `permissionPostures` names `ask` where §071 names `skip`, and `skip` is in the registry only inside `sectionBlocks` text — the two normative sources disagree on the member that means *no permission check at all* |
| 72 | surface | `resolveBackground` | `design-surfaces.test.ts` | the background as a second channel — a ground census, one mask character per cell, because a stripped read calls a washed row and a bare one the same picture; three kinds paint and `meterFill` has no reader |
| 73 | surface | `bgElev` | `design-surfaces.test.ts` | painted chrome — `design-surfaces` §073, the section's own test run over the tree as a **classification table**: *am I painting a THING or a FACT about a thing?* §072 takes four hand-picked subjects and asks how far each ground runs; a rule quantified over every kind can only be answered by asking every kind, because two correct statements overlap in each cell — *this kind grounds something* and *what it grounded is a thing*. **Measured: four of twenty-three paint anything**, and each is a THING (the table header, C11 I24), the one FACT the section sanctions (`status`'s error tag), `patch`'s changed lines (§072 ex. 1) or pixels. Nineteen paint nothing and none of §073's four never-paint cases is violated, so the governing rule holds. **The button did not.** Measured at 24-bit before the change: resting was bare text, focused was `focusGround` with no padding and no mark, ascii was bare text — so *the ground is the affordance* had no subject, and at one bit a button carried **zero** carriers. C09 I102 takes the three rungs the registry's projection draws; C10 I51 declares `pick`/`pickInk`, which had shipped in all ten themes since the port with the type naming neither. **The remainder, named**: §073's titles (painted, inset, bare) and its widgets — segmented and switch — want block kinds the tree has none of. **The slider is off this list**: it is `kind: "control"` (C09 I106), landed with §018, and a remainder naming it was true when written and is not now, which is a build rather than a reconciliation and belongs with M13's chips and M15's questions |
| 74 | surface | `weight` | `theme-tokens.test.ts` | weight, and why it is not free — the 1-bit rung of the same table, where `identifier` was off the ladder |
| 75 | surface | `kind: "table"` | `blocks.test.ts` | /config, and where a value came from |
| 76 | surface | no | `design-surfaces.test.ts` | per-token values — the valued run, `design-surfaces` §076, two passes. **Two of the section's three needs are built**: *a per-token VALUE driving a ground* is `TextSpan.value` through the block's `colormap` — **not a theme token**, which is this row's standing correction — and *tokens survive wrapping* is `atomsOf`, which emits a wrap atom for every valued run. The second pass uses `notice` and not `raw` because `raw` clips rather than wraps, so a caption about a token moving down whole was claiming what the picture did not show. **The remainder, named**: the reader's side. §076 says *⌥v toggles it on the entry under the cursor*; `valuesToggle` is a reserved chord with an explicit no-op (C16 I38), the shape `selection.semantic` held before M10b built it, and a producer that declares a colormap paints today with no reader axis to suppress it per entry |
| 77 | surface | `registerGrammar` | `blocks.test.ts` | syntax highlighting |
| 78 | surface | `kind: "table"` | `table.test.ts` | tables |
| 79 | surface | `REGISTRY_THEMES` | `theme-tokens.test.ts` | tones and surfaces, across ten themes — the corpus's first frame of colour |
| 80 | app | — | `examples/` | Prism — the rework in one sentence |
| 81 | app | — | `examples/` | Prism — /ps |
| 82 | surface | `R-EXA-082` | `design-surfaces.test.ts` | no pushed views — a row expanded in place, `design-surfaces` §082, two passes. The section's argument is architectural and its picture is one table; what it settles that the tree did not hold is a ground's **extent** — `R-BLK-941` opens the focused row's ground under the `▸` and puts the detail on `bgElev`, where the tree painted the gutter on the page and the detail on nothing. C11 §5c and I25. The second pass expands a row nothing is focused on, which is what says the detail's ground follows expansion rather than the head's spilling downward |
| 83 | app | — | `examples/` | Prism — submit |
| 84 | app | — | `examples/` | Prism — logs, as a block |
| 85 | app | — | `examples/` | Prism — the six-hour run |
| 86 | app | — | `examples/` | Prism — which plots it actually needs |
| 87 | prose | — | — | reconciling with C16 and C26 |
| 88 | prose | — | — | four major things this document owed |
| 89 | prose | — | — | one hierarchy, and what sits beside it |
| 90 | prose | — | — | semantic names against visual aliases |
| 91 | prose | — | — | state tables — seven core facts per component |
| 92 | prose | — | — | state tables — six more |
| 93 | prose | — | — | three major rules it broke in its own examples |
| 94 | prose | — | — | three tiers — content, representation, decoration |
| 95 | surface | `tapeStart` | `design-surfaces.test.ts` | a tape, where a row of peers would shed |
| 96 | surface | `MESSAGE_LINE_CAP\|widthRung` | `design-surfaces.test.ts` | a status has three parts, and the frame is separate |
| 97 | surface | `kind: "panel"` | `design-surfaces.test.ts` | a transient panel floats, between two rules |
| 98 | prose | — | — | input ownership — what was in flight |
| 99 | surface | `chipSpans` | `design-surfaces.test.ts` | wrapping, truncation and the atomic chip — `design-surfaces` §099, drawn as a **ladder** because one width proves nothing: an end cut and a middle cut are the same number of cells and both begin with the path's head, and what tells them apart is whether any of the tail is left. **The tree cut from the end**: `fitRuns` passed `"end"` to `truncate`, so `read_file(src/integration/parser/parse.ts)` kept *where* and threw *what* away — the one cut §099 names as wrong — and by 24 cells `parse.ts` was already gone. C09 I103 gives `truncate` a third arm on I79's walk; `truncateParts` deliberately does **not** get one, because a middle cut keeps two pieces and its contract promises one substring at one offset. **The split is this repository's and `R-SEC-099` is why**: *the prescriptive statements are current; specimen values and sample content remain examples* — and measured against the section's own figures, its 21-cell specimen ends `/rser/parse.ts`, which is not a suffix of the path at all. What the three do settle is the bias toward the tail; a third to the head reproduces one exactly and the others within a cell. **Decimal-point alignment landed with it**: `ColumnDef.align` gains `"decimal"` (C11 I26, T2.14-T2.15), the point **derived** from the column's own widest integer part rather than authored, and a column with no room for `int + frac` falling back **as a column** to `right`. That fallback is the frame's correction: clamping each cell's lead to its own slack put `0.0372` and `0.941` one cell apart, every count agreeing and the column wrong. **The remainder, named — and it has NO SUBJECT in this tree, which is the finding**: *the atomic chip is M13's, where the editor's sentinel meets `Atom`* is a deferral watching a remedy rather than a condition. Measured: `chipLabel` has exactly two consumers in `src/` — the editor's own `drawAs` (`editor.ts:266`), which wraps atomically through the editor's walk and is gated by C17 T1.45, and the preview panel's **title** (`construct.ts:2042`), which lives in the top border and **truncates rather than wraps**. `Atom` is joined to runs (`runs.ts:233`, `atomsOf`) and a chip's label reaches no run, because the editor resolves a sentinel to its **content** on submit, so no producer emits a label into a `TextSpan`. A half-painted chip therefore has nowhere to happen. The row that would create the subject is a transcript echo drawing the label, and it does not exist; and *prose in a cell wraps at the cell width, height never feeding back into width* is C11's solved-width pass and already holds |
| 100 | surface | `kind: "table"` | `table.test.ts` | a table that cannot shed, and two columns |
| 101 | surface | `routingFor` | `question-slot.test.ts` | replace or float; the chip preview is M13's |
| 102 | prose | — | — | view state is not liveness |
| 103 | prose | — | — | the ownership ladder |
| 104 | prose | — | — | focus survives a drop, and ←→'s five jobs |
| 105 | prose | — | — | five primitives the harness never needed |
| 106 | prose | — | — | where two rules meet — six composition cases |
| 107 | prose | — | — | the semantic tree and the terminal boundary |
| 108 | prose | — | — | capability vectors resolve actions |
| 109 | prose | — | — | responsive space and international text |
| 110 | prose | — | — | three records, a state product and the extension door |
| 111 | prose | — | — | the rules, condensed |

## The two with no fixture

| § | why |
|---|---|
| 25 | `streaming-the-ramp-trails-the-head-025` — a live animation, so its specimen is motion rather than a frame |
| 40 | `thinking-escalates-040` — a live animation, so its specimen is motion rather than a frame |

## The census

**Compared by equality, not by bound.** A subset check lets a class drain into another
one without anything saying so, and the direction that matters here is `owed` → `frame`:
that is the reconciliation working, and it should be visible as a number moving rather
than inferred from a suite staying green.

    surface 69 · prose 34 · app 6 · total 109
    of the surfaces: built 60 · unbuilt 9 · framed 65

**`framed` is the figure this MR moves, and `built` is the one that went backwards.**
Seven surface rows carry no probe now, not two. §054 and §055 want OSC 8 hyperlinks
nothing in the tree emits, and they were the only absence the first sweep found; §035
and §036 join them because their probe answered from `Intl.Segmenter`'s options rather
than from `Progress`, which has no member for either axis; §076 because its probe
named the theme registry for a fixture about valued spans; and §017 and §018 because
theirs named `focusGround`, a surface slot that resolves in all ten themes — it is in
`theme-tokens.test.ts`'s table — for two fixtures about **treatments**. A slot existing
is not a treatment reaching a renderer, and `focus-shapes.test.ts` measures the
difference: `scroll` and `plot` answer block focus and the other thirty-four kinds draw
a focused block byte for byte as they draw an unfocused one. Raising `built` is not the
work — a probe says a subject exists and not that it matches the design. Raising
`framed` is.
