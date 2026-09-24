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
| 11 | surface | `insertChip` | — | @ mentions are chips, and the chip's halves have never met |
| 12 | surface | `questionNotice` | `blocks.test.ts` | multi-line and transient feedback |
| 13 | surface | `CALL_STATE_GLYPH` | `states.test.ts` | reviewing what auto wrote |
| 14 | surface | `emptySnapshot` | `session-frame.test.ts` | away, and what the frame says while you are |
| 15 | prose | — | — | four interaction principles |
| 16 | prose | — | — | scopes, as an ownership table |
| 17 | surface | no | `design-surfaces.test.ts` | focus treatment follows the shape — `design-surfaces` §017, a census of what each kind publishes against what it draws, because *follows the shape* is checkable only as a table of shape against treatment. **The old row here was wrong three ways and is corrected by measurement**: it said *`scroll` and `plot` answer block focus and the other thirty-four do not* — there are **23** kinds in `ONE_PER_KIND`, not 36; `table`, `pills` and `tape` answer as well; and the cause is not a missing treatment but that **17 kinds publish no focusable element at all**, so §017's RUN and FRAME rungs have no subject in this tree rather than an unbuilt one. Six kinds publish elements and five draw a treatment. **`mosaic` was the sixth** — four focusable elements, nothing drawn for any of them — closed by C09 I100: a pane is a *region* in §017's own vocabulary and takes `focusGround`, painted by the container because a child's own predicate tests the child's block id, which a mosaic-scoped focus never matches |
| 18 | surface | no | — | focus on things that are not rows — its three cases are a button, a slider and a checkbox, and none is a block kind |
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
| 36 | surface | no | — | the operation and budget presets — the two triples are expressible now (C09 I97); what is owed is the operation SURFACE around them: the gerund head, the elapsed-and-delta aside, and the settlement that removes the bar |
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
| 64 | prose | — | — | undo |
| 65 | prose | — | — | compaction — which turns go |
| 66 | surface | `FAILURE_WORDS` | `states.test.ts` | tool failures against model failures |
| 67 | surface | `viewport` | `session-frame.test.ts` | scrolled back while a turn runs |
| 68 | surface | `degradesTo1Bit` | `compositions.test.ts` | one exchange at three capability rungs |
| 69 | surface | `labelSpansOf` | `session-frame.test.ts` | the prompt's upper rule, labelled — three scenes, and the 1-bit one needed a capability override because no environment reaches the rung |
| 70 | surface | `REGISTRY_THEMES` | — | /colour and /label, tinting the chrome — **parked, not merely unbuilt**. The mechanism is specified in detail (chrome only, per directory in `.calcium/config.toml`, a name resolved per theme against a hex taken literally, the hex gated by a choice-only contrast question, animation an explicit decoration exception suppressed under reduced and off) and the **ten hues have no values**: named and described as VIVID, with no palette anywhere in the registry. Ten vivid colour values is the ask list's own example. Held whole — the hex arm needs no new values, but a verb that refuses three of the six forms its help lists is not a smaller version of this |
| 71 | prose | — | — | the five permission postures |
| 72 | surface | `resolveBackground` | `design-surfaces.test.ts` | the background as a second channel — a ground census, one mask character per cell, because a stripped read calls a washed row and a bare one the same picture; three kinds paint and `meterFill` has no reader |
| 73 | surface | `bgElev` | `design-surfaces.test.ts` | painted chrome — `design-surfaces` §073, the section's own test run over the tree as a **classification table**: *am I painting a THING or a FACT about a thing?* §072 takes four hand-picked subjects and asks how far each ground runs; a rule quantified over every kind can only be answered by asking every kind, because two correct statements overlap in each cell — *this kind grounds something* and *what it grounded is a thing*. **Measured: four of twenty-three paint anything**, and each is a THING (the table header, C11 I24), the one FACT the section sanctions (`status`'s error tag), `patch`'s changed lines (§072 ex. 1) or pixels. Nineteen paint nothing and none of §073's four never-paint cases is violated, so the governing rule holds. **The button did not.** Measured at 24-bit before the change: resting was bare text, focused was `focusGround` with no padding and no mark, ascii was bare text — so *the ground is the affordance* had no subject, and at one bit a button carried **zero** carriers. C09 I102 takes the three rungs the registry's projection draws; C10 I51 declares `pick`/`pickInk`, which had shipped in all ten themes since the port with the type naming neither. **The remainder, named**: §073's titles (painted, inset, bare) and its widgets — slider, segmented, switch — want block kinds the tree has none of, which is a build rather than a reconciliation and belongs with M13's chips and M15's questions |
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
| 99 | surface | `chipSpans` | `design-surfaces.test.ts` | wrapping, truncation and the atomic chip — `design-surfaces` §099, drawn as a **ladder** because one width proves nothing: an end cut and a middle cut are the same number of cells and both begin with the path's head, and what tells them apart is whether any of the tail is left. **The tree cut from the end**: `fitRuns` passed `"end"` to `truncate`, so `read_file(src/integration/parser/parse.ts)` kept *where* and threw *what* away — the one cut §099 names as wrong — and by 24 cells `parse.ts` was already gone. C09 I103 gives `truncate` a third arm on I79's walk; `truncateParts` deliberately does **not** get one, because a middle cut keeps two pieces and its contract promises one substring at one offset. **The split is this repository's and `R-SEC-099` is why**: *the prescriptive statements are current; specimen values and sample content remain examples* — and measured against the section's own figures, its 21-cell specimen ends `/rser/parse.ts`, which is not a suffix of the path at all. What the three do settle is the bias toward the tail; a third to the head reproduces one exactly and the others within a cell. **The remainder, named**: decimal-point alignment wants `ColumnDef.align`, which is `"left" | "right"` and is exactly §099's complaint that *align: r lines up the LAST character*; the atomic chip is M13's, where the editor's sentinel meets `Atom`; and *prose in a cell wraps at the cell width, height never feeding back into width* is C11's solved-width pass and already holds |
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

    surface 66 · prose 37 · app 6 · total 109
    of the surfaces: built 60 · unbuilt 6 · framed 61

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
