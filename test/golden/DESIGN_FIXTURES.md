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

## The four classes, and why the last two are not excuses

| class | what it means |
|---|---|
| **frame** | a golden file draws this surface **today**; the fixture is its target appearance |
| **owed** | the design specifies a surface the repo does not have yet, and the named MR builds it — the row is what makes the absence visible rather than a gap nobody totals |
| **prose** | a rule table or an explanation. Nothing is drawn, so there is nothing for a frame to be wrong about |
| **app** | the reference application's surface, drawn by `examples/`, not by the framework |

**The class cannot be derived from the fixture, and the obvious derivation is wrong in
both directions.** `corpus.test.ts` derives its kind from the file's imports and says
why — *otherwise the row asserts itself* — so the first draft of this table tried the
same thing: a fixture is prose when its own text carries no drawn frame. Measured, it
fails twice. **Ten `frame` fixtures carry no box-drawing at all**, because a call head
is a line of text and not a box; **eight `prose` fixtures carry plenty**, because a
rule table is often drawn in one. §063 has 312 box-drawing characters and specifies no
surface; §030 — the head mark, the whole of M4 — has none and specifies the most-drawn
line in the application.

So the class is a **judgement**, and that is stated rather than dressed up. What the
gate can hold instead is the part that rots on its own: **every row names a fixture and
every fixture has a row, by equality**, and every `frame` row's target **exists**. A
golden file renamed leaves a row pointing at nothing, and that is caught.

**`owed` is the class that would rot quietly**, because it names an MR and an MR can
land without its rows moving — leaving this table claiming work is outstanding when it
is done. The census prints the count per class and the gate compares it against the
figure written here, so the number moves only on purpose.

## The table

| § | class | target | what the fixture specifies |
|---|---|---|---|
| 1 | prose | `—` | the rule list itself |
| 2 | prose | `—` | where each primitive is defined |
| 3 | frame | `session-frame.test.ts` | the five regions with activity present |
| 4 | frame | `session-frame.test.ts` | idle — the activity region and its rule gone |
| 5 | frame | `session-frame.test.ts` | cancelled — the spinner stops, the region stays |
| 6 | owed | `M4` | the twelve canonical marks, as a glyph census |
| 7 | frame | `states.test.ts` | a subagent's nested calls |
| 8 | frame | `blocks.test.ts` | a message entry |
| 9 | frame | `states.test.ts` | queued, and what a queue draws |
| 10 | frame | `session-frame.test.ts` | startup and resume |
| 11 | owed | `M13` | @ mentions are chips, and the chip's halves have never met |
| 12 | frame | `blocks.test.ts` | multi-line and transient feedback |
| 13 | frame | `states.test.ts` | reviewing what auto wrote |
| 14 | frame | `session-frame.test.ts` | away, and what the frame says while you are |
| 15 | prose | `—` | four interaction principles |
| 16 | prose | `—` | scopes, as an ownership table |
| 17 | owed | `M3` | the focus treatment follows the shape — `focusGround` |
| 18 | owed | `M3` | focus on things that are not rows |
| 19 | owed | `M6` | the keys — `docs/KEYS.md`, generated from the registry |
| 20 | prose | `—` | DAS and ARR as figures |
| 21 | owed | `M14` | the scrollbar, absent from `src/` entirely |
| 22 | owed | `M9` | the help view, which becomes a transcript entry |
| 23 | frame | `blocks.test.ts` | at 40 columns |
| 24 | frame | `states.test.ts` | reasoning |
| 26 | owed | `M13` | the trail and the mark at the head — §025's live specimen |
| 27 | frame | `plot-forms.test.ts` | the context composition bar |
| 28 | frame | `question-slot.test.ts` | approval replaces the prompt — C23 I74 |
| 29 | frame | `session-frame.test.ts` | completion expands the prompt |
| 30 | owed | `M4` | the dot, the cursor and the running state — the head mark's three rungs |
| 31 | owed | `M4` | every reusable spinner set at its own interval |
| 32 | prose | `—` | the four spinner rules |
| 33 | owed | `M4` | nine alphabets, and where each belongs |
| 34 | owed | `M4` | active progress bars |
| 35 | owed | `M4` | quantity, granularity and liveness as three axes |
| 36 | owed | `M4` | the operation and budget presets |
| 37 | owed | `M2` | every ink ramp, including the four one-shots |
| 38 | owed | `M2` | the agent's mark and the verb's ramp |
| 39 | prose | `—` | one interval, one family |
| 41 | prose | `—` | the spinner is chosen by the verb |
| 42 | frame | `blocks.test.ts` | widgets |
| 43 | prose | `—` | spans, as the substrate four things wait on |
| 44 | owed | `M10` | two kinds of selection, one clipboard |
| 45 | frame | `blocks.test.ts` | the live terminal block |
| 46 | frame | `session-frame.test.ts` | history, search and ghost text |
| 47 | frame | `containment.test.ts` | empty, too small, stale, interrupted, refused |
| 48 | owed | `M3` | block states, including the `empty` form the repo has no shape for |
| 49 | frame | `blocks.test.ts` | one block of every kind |
| 50 | frame | `blocks.test.ts` | the tool-result gallery |
| 51 | frame | `question-slot.test.ts` | approval overflow — the inspection (C23 I75) |
| 52 | frame | `question-slot.test.ts` | a question that wants a sentence (C23 I73) |
| 53 | prose | `—` | the mouse, as a ruling table |
| 54 | frame | `blocks.test.ts` | links |
| 55 | frame | `states.test.ts` | a link's states |
| 56 | prose | `—` | six pointer rulings |
| 57 | prose | `—` | ⌃C across five contexts |
| 58 | owed | `M10` | what copy takes |
| 59 | frame | `session-frame.test.ts` | find |
| 60 | frame | `session-frame.test.ts` | resize |
| 61 | prose | `—` | eight cases that are not edge cases |
| 62 | prose | `—` | latency, and the window that causes it |
| 63 | prose | `—` | three refusals, and what stays rebindable |
| 64 | prose | `—` | undo |
| 65 | prose | `—` | compaction — which turns go |
| 66 | frame | `states.test.ts` | tool failures against model failures |
| 67 | frame | `session-frame.test.ts` | scrolled back while a turn runs |
| 68 | frame | `compositions.test.ts` | one exchange at three capability rungs |
| 69 | owed | `M13` | the labelled rule — the prompt's top rule, unlabelled today |
| 70 | owed | `M2` | /colour, tinting the chrome |
| 71 | prose | `—` | the five permission postures |
| 72 | owed | `M3` | the background as a second channel |
| 73 | owed | `M3` | painted chrome — buttons, titles, widgets, headers |
| 74 | owed | `M3` | weight, and why it is not free |
| 75 | frame | `blocks.test.ts` | /config, and where a value came from |
| 76 | owed | `M2` | per-token values |
| 77 | frame | `blocks.test.ts` | syntax highlighting |
| 78 | frame | `table.test.ts` | tables |
| 79 | owed | `M2` | tones and surfaces, across ten themes |
| 80 | app | `examples/` | Prism — the rework in one sentence |
| 81 | app | `examples/` | Prism — /ps |
| 82 | owed | `M9` | no pushed views |
| 83 | app | `examples/` | Prism — submit |
| 84 | app | `examples/` | Prism — logs, as a block |
| 85 | app | `examples/` | Prism — the six-hour run |
| 86 | app | `examples/` | Prism — which plots it actually needs |
| 87 | prose | `—` | reconciling with C16 and C26 |
| 88 | prose | `—` | four major things this document owed |
| 89 | prose | `—` | one hierarchy, and what sits beside it |
| 90 | prose | `—` | semantic names against visual aliases |
| 91 | prose | `—` | state tables — seven core facts per component |
| 92 | prose | `—` | state tables — six more |
| 93 | prose | `—` | three major rules it broke in its own examples |
| 94 | prose | `—` | three tiers — content, representation, decoration |
| 95 | owed | `M14` | a tape, where a row of peers would shed |
| 96 | owed | `M3` | a status has three parts, and the frame is separate |
| 97 | owed | `M8` | a transient panel floats, between two rules |
| 98 | prose | `—` | input ownership — what was in flight |
| 99 | owed | `M13` | wrapping, truncation and the atomic chip |
| 100 | frame | `table.test.ts` | a table that cannot shed, and two columns |
| 101 | frame | `question-slot.test.ts` | replace or float; the chip preview is M13's |
| 102 | prose | `—` | view state is not liveness |
| 103 | prose | `—` | the ownership ladder |
| 104 | prose | `—` | focus survives a drop, and ←→'s five jobs |
| 105 | prose | `—` | five primitives the harness never needed |
| 106 | prose | `—` | where two rules meet — six composition cases |
| 107 | prose | `—` | the semantic tree and the terminal boundary |
| 108 | prose | `—` | capability vectors resolve actions |
| 109 | prose | `—` | responsive space and international text |
| 110 | prose | `—` | three records, a state product and the extension door |
| 111 | prose | `—` | the rules, condensed |

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

    frame 35 · owed 31 · prose 37 · app 6 · total 109
