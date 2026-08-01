# A03 — Enforcement suite

| Field | Value |
|---|---|
| **Type** | Architecture |
| **Package** | `tui-kit` — runs against both packages |
| **Collects** | Every lint rule, source scan, module-graph assertion and compile-level check declared across the 43 specs |
| **Status** | Draft |

---

## 1. Why this exists

Seventy-three assertions across twenty-five documents keep the architecture true rather than aspirational. Each is one line inside the spec that needed it, and none of them is where anyone would look for it.

Unwritten, they fail quietly. A component reads a clock and golden frames start flaking six weeks later; a renderer emits a hex colour and light mode is wrong for one block; a kind imports the registry and the module graph acquires a cycle nobody notices until the bundler complains. Every one of those is caught in under a second by a check that takes ten minutes to write.

**This document is the inventory, not a new set of rules.** Each row cites the spec that declared it. Where the two disagree, the spec wins and this is stale.

---

## 2. The six kinds of check

| Kind | Runs at | Cost | Catches |
|---|---|---|---|
| **Module graph** | Build | ~1 s | Layer violations, cycles, cross-package imports |
| **Source scan** | Build | ~1 s | Forbidden literals, ambient reads, escape hatches |
| **Exhaustiveness** | Compile | 0 | A union member added without its handler |
| **Type-level** | Compile | 0 | A shape that must not be constructible |
| **Corpus** | Test | seconds | Properties over fixtures — measurement, contrast, drop orders |
| **Vacuity** | Test | ~0 | A rule that matches nothing, and therefore passes |

The first four are **build gates**: they fail the build, not a test run, because a layer violation merged and fixed later has already had time to be depended upon.

**The sixth checks the other five.** Every rule ships with a test that fabricates a violation and asserts it fires, naming the rule. A rule with no such test is assumed vacuous until it has one.

This is not belt-and-braces. Every check here reports success the same way whether the tree is clean or the rule is broken, and a broken rule is indistinguishable from compliance at exactly the moment it matters.

**One failure mode here is not about a rule that cannot fire, and its mitigation is different.** A rule that fires *correctly* on an edge the design requires does not get fixed — it gets **routed around**, by renaming the variable or restructuring the import until the pattern misses. That is worse than no rule, because it reports compliance while the practice continues under another name, and nothing in the suite can tell the two apart: the tree is clean either way.

MG23 is where this was named. It counts a component's store imports, and C11 and C12 import C09's paint helpers and C10's tones — an edge CLAUDE.md records as *required rather than tolerated*. A rule that flagged it would have been defeated within a week and left looking enforced.

**The mitigation is not a fabricated violation.** A fabrication proves the rule fires; this failure is the rule firing. What catches it is asserting the **required edges do not trip it** before landing — a boundary test per legitimate practice the rule sits next to, written from the design rather than from the rule. MG23 carries two: type-only imports count, and paint helpers and tones do not.

**The failure mode of an enforcement suite is not a rule that is wrong — it is a rule that cannot fire.** Sixteen have been found this way, and none of them was a wrong rule; each was a rule with nothing to be wrong about, and each passed:

- **A pattern that cannot match a real subject.** MG20 compared a resolved specifier against `src/terminal/escapes` while every NodeNext specifier ends `.js`. It matched nothing and reported compliance.
- **A scope that matches no files.** SS26 scopes to `src/data/process/`; the tree has `src/data/process.ts`, a file. `startsWith` never matches, so the rule has never once been evaluated.
- **Ownership rows naming absent exports.** MG20's `MODE_OWNERS` assigned `SYNC_UPDATE` and `SCROLL_REGION` to C03 while `escapes.ts` exported neither. The rows governed names that did not exist, so they could not have fired whatever the tree contained.
- **A rule inventoried here and never implemented.** SS3 had a row in this document from the start and no entry in `source-scans.mjs`. It could not fire, could not be fabricated against, and appeared in no report — and it also carried SS26's defect, scoping to `adapters/` while the tree held `adapters.ts`, a file. Two of the four failures in one rule, which is what a rule nobody built looks like.

- **A checker that resolves one item and passes on the rest.** SP1 read a single invariant per parenthetical, so a commitment citing `(I5, I99)` resolved one and ignored the other: a dangling citation could ride alongside a good one and the rule reported it enforced. It shipped and was found the same day by the pass that reads its own output. Two instances of this in one day — the other was a fabricated fixture written as `- **I1 — text**` rather than `- **I1** — text`, so it parsed as no invariants at all and every citation in it read as dangling. **In both the rule was broken by what it was tested against rather than by what it checked**, which is a failure a fabricated violation invites rather than prevents: the fabrication is written by the same person, in the same sitting, under the same misreading as the rule.

- **A fixture reader agreeing with itself.** The surface-audit parser — the tool built to stop illustrations and tables drifting apart — read each column table *by position*. Declaring `Align` in five surface specs shifted `Flex` one column right, so the parser read `left` as the flex flag: truthy, so every flex column became `false`. Nothing failed, because `flex` changes column *widths* and not which columns drop, and every assertion in the suite was about drop orders. **Only a field-specific assertion could see it** — one per parsed field, against something only that field can produce — and that is what the parser carries now, alongside reading by header name. This is C21's harness class arriving in a fixture reader rather than in a test helper: the same defect, in the code that exists to catch the family.

- **A vacuity check with a narrow pattern.** The inventory equality above — the mechanism for the fourth failure, the one nothing else can reach — read `/^\|\s*(SS\d+)\s*\|/`. It saw 41 of 93 inventoried rules. Adding an `MG` row and implementing nothing passed `make enforce`, `make test` and every fire-test in the suite. **The check written to catch a rule that cannot fire could not see two thirds of the inventory**, which is the same defect as a narrow scope one level up: a pattern excludes what nobody thought about, and a family covered with named exceptions does not. It now reads every family implemented as data, and the two it cannot speak for are named below rather than left looking covered.

- **A rule correct about a syntax nobody writes.** SS20 forbids a `syntax` palette reference outside `code` and `patch` rendering, and its pattern is ``/["'`]syntax\.\w|palettes\s*\.\s*syntax/``. Its one consumer, C09's `code.ts`, writes ``slot(`syntax.${token.slot}`, …)`` — `$` is not `\w`, so the rule has never matched the form the only caller uses, and its allow-list has never been exercised either. **This is not MG20's class.** MG20's pattern could match nothing at all; this one matches a form that is legal, idiomatic, and unwritten, while the idiom in use walks past. A rule can be correct about a syntax nobody uses.

  **The mitigation differs, which is why it is a separate line.** MG20's class is caught by a fabricated violation; this one is not, because a fabrication written by the same author in the same sitting uses the same idiom the rule was written against. What catches it is a fabrication written in **the form the real consumer uses** — so the standing rule for the fabrication table is: where a rule targets a code idiom, the fabricated violation is **copied from a real call site**, not written fresh. If there is no real call site yet, the fabrication is copied from the first one that appears, and the rule is pending until then.

- **A set equality that cannot see a duplicate.** The inventory check compares the ids in these tables against the ids implemented — as sets, so **two rows carrying one id collapse into one member and the check passes.** Found by collision rather than by reasoning: a new ambient-read rule was written as SS41, which C21 already holds, and the check went green with an inventoried rule nobody had implemented, because the id it was looking for was present for a different reason. The remedy is one assertion — the inventory declares no id twice — and it is the cheapest of all of them, which is why it had never been written. It reads the rows rather than the id set, because the set is precisely what cannot see this.

**The family has an inverse, and it belongs here rather than in a section of its own.** Everything above is a check that *cannot fire*. The mirror image is a branch that *fires wrongly because nothing declared it* — and it is the same defect seen from the other side, with the same detection method and the same invisibility to review.

**In any total function with a fall-through, the absence of a case is indistinguishable from a decision to route it downward.** C16's Ctrl-C ladder had no rung for focus being in the live block, so Ctrl-C while navigating a table cleared the prompt behind it: a side effect on a surface the user cannot see. Nothing was broken. Every rung above it correctly declined, the ladder returned an answer, and the answer was wrong — confidently and silently, because a ladder always returns something. It is C16 I5 ("unconsumed events are never inserted into a lower target") broken by omission rather than by broadcast, which is why no test of I5 could have caught it.

A vacuous rule reports success it has not earned; an undeclared branch reports a decision nobody took. Both were found by attempting the work rather than by reviewing it, and neither is visible to a reader checking statements one at a time. Where a component resolves an event through an ordered ladder, the table of rungs against constructing states (C16 §5) is what makes both kinds legible: an unreachable rung has an empty column, and a missing rung has a constructible state with no row.

- **Code self-consistent enough to hide its own defect.** C16's keymap built a lookup slot with one function and took it apart with another. The separator both used was a literal NUL rather than the space it reads as — and because *both* halves used it, every one of ten tests passed. A test exercising both sides of a round trip cannot see a separator both sides get wrong; it is the arithmetically-self-consistent viewport one layer down, in a string.

  **What found it was a scan looking for something else.** SS40's stated concern is `.length` in the editor, and it fired on the string surgery beside the NUL. That is an argument for scans being cheap and broad rather than precisely aimed: a rule targeted exactly at its own subject would have walked past a NUL masquerading as a space, and the cost of the broad version is a comment explaining an exception.

  SS43 is the rule the class earned, and its first run found **three more instances in shipped code** — a memo key in C09, a dedup key in C05, and five `sequence` literals in C16's own decoder. All four read as spaces. Three were deliberate and defensible, which is the point: the rule is not "NUL is wrong" but "an invisible character is invisible", and the remedy is an escape rather than an allowance.

- **A subject too uniform to tell the code from the defect.** Fifth instance, and the first counted as a class rather than as five separate fixture repairs. Every one is the same shape: an assertion whose *subject* cannot exhibit the difference, so the assertion is about the code and the fixture is about nothing.

  - C22's fallback measured with `cells()`, and every string it renders is ASCII by design — it runs where the capability record may say nothing is supported — so `.length` agrees on all of them and the swap survived every assertion about the rendered output.
  - The same file terminated lines with `\r\n`, asserted as `toContain("\r\n")` against a three-line render. The join, the trailing terminator and a spare newline all satisfy that, so **three** distinct mutations survived one assertion.
  - C22's `T1.14` asserted `lifecycle.size()`, which reads the terminal directly and is therefore true whatever the viewport was handed; a hardcoded `80 x 24` survived.
  - C16's keymap round trip used one separator on both sides, so a NUL masquerading as a space passed ten tests.
  - C14's viewport fixture used `raw` blocks, whose measurer ignores width, so a width-sensitive claim was asserted against content that measures the same at every width.

  **The remedy is always the same and it is never "add more assertions".** It is to find the input on which the two readings differ and assert *there* — a wide character, a one-row terminal, two widths, a real separator. Where the component's own vocabulary cannot produce that input, the unit that can is extracted and tested directly: `fitCells` is exported for exactly this, and the export is justified by the discrimination rather than by a caller.

  **Narrow corpora are where this breeds**, which is the tell worth carrying. A component that deliberately restricts what it handles — ASCII only, one block kind, a fixed set of strings — has a subject that agrees with itself, and a suite over that subject reports coverage it does not have. So: after any mutation survives in such a component, sweep the rest of the file rather than repairing the one row. C22's fallback returned three more on that sweep, and one of them was a real defect — a lone newline written into a terminal reporting zero rows.

- **A harness that cannot see a kill, reporting thoroughness.** The mutation pass is the only thing that asks whether a test can fail, so a mutation runner that cannot detect a failing suite deletes that check and leaves a report that reads like a rigorous one. C22's runner read `/Tests\s+\d+ failed/` against vitest output carrying ANSI codes between "Tests" and "1 failed": **eight live mutants reported as survivors**, which is nine lines of "no failure" — indistinguishable from the finding a mutation pass exists to produce.

  **It is the edit-script defect in the instrument built to apply the remedy**, and it fails in the direction that reads as diligence. An edit script that prints `ok` having changed nothing at least looks like nothing happened; a mutation report full of survivors looks like work. Neither is caught by review, because both outputs are the shape the reader expects.

  So the control pair lives **inside** the harness (`tools/mutate/mutate.mjs`) rather than in each component's run: before any row is reported, the clean tree must pass and a caller-supplied mutation whose kill is not in doubt must be seen to be killed. The caller supplies that mutation and says why it cannot survive, because a generic sentinel is the harness marking its own homework. `test/unit/mutate-harness.test.ts` fabricates a blind runner and asserts it refuses, and its ANSI fixture is the real output rather than an invented one — the first version tested its regex against a string it wrote itself, with no codes in it, so the fixture and the regex agreed and the tree did not.

- **A test over an ordered structure that checks its members one at a time.** C16 T1.3 asserts each of the six focus conditions resolves to its documented target — six correct assertions that pass under *any* permutation of the priority they exist to protect. It is not vacuity: every assertion fires, and the subject responds. It is a suite that is individually right and jointly silent about the one property the structure has, which no amount of adding more per-member cases repairs.

  **This project had already solved it once and did not carry it across.** CP6 compares each surface's *stated* column drop order against `planColumns`' actual output rather than checking each column's priority in isolation, precisely because a per-member check cannot see a sequence — and it caught two defects three readings had missed. C16's priority list is the same shape one component over.

  So: **ordered structures need pairwise or sequence assertions, not per-member ones** — priority lists, fall-through chains, drop orders, ladders, keymap precedence. The per-member test is worth keeping; it simply is not the test of the order, and the two are easy to mistake for each other because the first is longer. Found by mutating rather than by counting green: swapping two rows of C16's priority left the six-condition test passing.

- **A scan scoped to a directory, assuming every file in it wants the same remedy.** Three instances now, which is what makes it a class rather than a coincidence. **A fourth was caught before it landed**, which is the first time this class has been stopped rather than recorded: C19 §2 claimed `completion/` as a third SS40 allowance, on reasoning that holds for `context.ts` — span arithmetic over C18's code-unit offsets — and fails for `menu.ts`, where a candidate's column width is `cells()` and a `.length` is the exact mistake SS40 exists to catch. The discriminator was already written into SS40's own note: *no allowed file measures display width*. The allowance is the file — two of them, `context.ts` and `sources.ts`, with `menu.ts` left in scope.

  **Per file rather than per directory, and the direction is what makes it safe.** An allow-list denies by default, so a file added to `completion/` later is caught and has to be argued on rather than inheriting an allowance nobody re-examined. That is the exact opposite of SS26's failure, where a narrow *scope* silently stopped seeing new files — and it is why the remedy for this class is always a named exception rather than a wider scope. SS23 forbade `.length` in `src/presentation/blocks/` and left the editor unpoliced while recording it as covered. SS40 then forbade `.length` across `src/interaction/` — correct for C17, where the answer is a grapheme index, and wrong for C16's decoder, where the measure genuinely *is* a code-unit count over a byte stream. SS14 forbade escape literals across `src/`, which is right for everything that writes one and wrong for the one component whose job is recognising them.

  **A directory is a packaging decision, not a semantic one.** Files live together because they ship together, and a scan that takes the directory as its unit is asserting they share a remedy — which is a stronger claim than anyone made when creating the folder. The tell is that the fix is never "delete the rule": each of the three was right about most of its scope, and the split preserved both halves with their reasons attached. **Where a rule's advice differs between two files in one directory, that is two rules**, and writing it as one gives whichever file is in the minority the wrong advice at exactly the moment someone reaches for the quick fix.

- **A scope exclusion resting on a false premise.** SP3's corpus walked `src`, `test`, `tools` and every documentation directory **except `docs/components/`** — the twenty-five densest citation files in the project. This is not SS26's class: that scope reached nothing by accident, and this one excluded something deliberately, with the rule's own message explaining the exclusion. **The documentation is what made it look considered.** The premise was that a component spec's citations were covered elsewhere, and nothing covered them: SP1 checks that a commitment cites an invariant and SP2 checks ordering, and neither resolves a cross-spec reference. `C13 I99` in a component spec passed while the identical line in a behaviour spec failed. Closing it took a directory and two resolver rules and moved the corpus from 1,794 references to 3,805 — **more than half of what SP3 exists to check had never been checked**, while its report read the same either way. A documented exclusion earns the same fabricated violation as a rule: assert that the excluded corpus is excluded *for the stated reason*, and the reason dies the first time someone tries.

- **A branch of specified behaviour that no state constructs.** The class is not confined to rules, fixtures and checkers — it reaches the specs themselves. C16 §5's Ctrl-C ladder had a rung for a running pass-through child, and a pass-through child runs through `handoff`, which C21 I6 refuses unless raw mode is off; with raw mode suspended C16 receives no stdin and the terminal signals the foreground group directly. The rung could not fire for the children it named. **A branch guarded by a condition no path constructs looks exactly like one that is simply rare** — it is never reported, never exercised, and its absence from a coverage report reads as "that case is uncommon". C15 carried the same defect as a fail-on-revert test; C16's was live behaviour. The mitigation is not a mechanism but an artefact: where a component resolves a key or an event through an ordered ladder, **the spec carries a table of every rung against the state that constructs it**, and a rung whose state column cannot be written is a finding. C16 §5 carries the first one, and writing it found two defects before any code existed.

- **A pending entry whose reason was false at birth.** The inverse of a deferral that outlives its reason, and it needs saying because the remedy is opposite. `PENDING_RULES.SS6 = "C16"` recorded a clock-read rule waiting on the input router — so 14b's equality was satisfied and always would be. But SS6's scope is `input/`, a directory that has never existed and that C16 does not create, and SS1 already bans clock reads across all of `src/`; building SS6 on C16's arrival would recreate the SS4/SS5 defect exactly. **No event can retire it, because the event it names was never the blocker.** SS7, SS8 and SS9's clock clause are the same entry three more times. A pending record needs a reason that some future thing can make true, and "waiting on C16" is not one when the scope names a directory C16 will not produce — so a pending entry is written against a *file or directory that will exist*, never against a component name alone.

  **And the fold is the only exit, which is the third instance of this now closed.** SS5 was folded into SS4 and SS12 into SS11, both for the same reason: a rule whose scope is contained by a broader rule with the same pattern can never fire on anything the broader one misses. SS7 is the third — its scope is `editor/` and SS1 bans clock reads across all of `src/` with one named exception — and C17's arrival was the moment to see it, because the component that was supposedly blocking it is the one that proves it could never fire. **A pending rule whose reason was false when it was written cannot expire on its own; something has to retire it deliberately, and the fold is what that looks like.** SS8 and SS9 wait on C19 and C20 and are the same entry twice more; each is folded or built when its component lands, and neither is left to expire by itself.

  **SS8 is now folded, on the day C19 landed, and it went exactly as this paragraph predicted.** Its scope was `completion/` and its pattern was clock reads, which SS1 already forbids across all of `src/` with one named exception — so it could never fire on anything SS1 missed, and the component supposedly blocking it was again the one that proved it. C19 T2.3 declares SS1's coverage of `completion/` rather than a rule of its own. **SS9 is the last of the four**, and it is not the same case: its scope adds `fs` and a `~/.prism` literal, neither of which SS1 covers, so C20 builds it rather than folding it.

  **Built, on the day C20 landed — and half of it was folded after all.** The rule as inventoried read "clock, `fs`, `~/.prism` literal", and the clock clause is the same dead entry the other three were: SS1 bans clock reads across all of `src/`, so a `history/`-scoped clause could not fire on anything SS1 misses. It is gone rather than carried, and C20 T2.4's clock half declares SS1's coverage. What was built is the half SS1 does not speak for. **The lesson the four of them add up to is that a pending rule is a claim about scope, not about a component**, and the honest thing to check when the blocker arrives is not "can I write this now" but "would it ever have fired".

  **The half a machine can see is now checked, and it found two on its first run.** A reason false at birth cannot expire and needs the fold; a reason that *becomes* false has a moment, and nothing was watching that moment. So a pending entry is now one of two shapes: a bare string, which is a fold or a condition no arrival satisfies, or `{ waitsOn, why }`, which is a claim — and "the component named by `waitsOn` is built" is a question `defaultIsImplemented` already answers. **MG14 had waited on C16 through C16's landing and C17's**, unenforced, reporting exactly like a satisfied rule; SS6 had waited on C16 for a fold it should have taken at the same moment. Both were found by writing the check, neither by reading the list.

- **A scope column that drifted from the scope.** 14b's inventory equality compares rule **ids**, so a row may name a directory the rule does not scan and omit one it does — in both directions, indefinitely. SS24 said `table/`, `plot/`, `parser/` while the code said `table/`, `plot/`, `patch/`: one scope inventoried and unimplemented, one implemented and uninventoried, and every set comparison in the suite satisfied by the id alone. The equality now runs over the scope column too, **and over allow-lists**, which is the worse half — a granted exemption that no document records is indistinguishable from a rule that has no exemptions. Nine rows were wrong on the first run, SS28's five-subdirectory list against a code scope of `src/interaction/` among them, and every one was the row rather than the code.

- **A check that existed as a habit rather than a mechanism.** The other side of SS3: not a rule written down and never built, but one performed reliably and never written down. Invariant ordering was verified by ad-hoc script while the specs were written, caught every time, and never became a rule — so when the habit stopped, twenty of twenty-five specs drifted out of order and nothing went red, because nothing was missing and no citation dangled. **It is the hardest of these to notice, because there is no artefact to inspect.** The other eight are a rule that is present and broken; this is a rule that was never an artefact at all, and the only evidence it existed is that the corpus was clean while someone was watching. What made it findable was reading C04's invariant list end to end for an unrelated reason. SP2 is the mechanism it should have been.

Generalising it turned up three things the narrow pattern had been hiding, and none of them was a violated rule:

| What | Why it survived |
|---|---|
| `SS31`, `SS32`, `SS38` listed **pending while implemented**, each entry saying "implemented in `dependencies.mjs`" | The staleness check compared against `SCANS` alone, so a rule implemented in a sibling module read as unimplemented forever. Three entries asserting a rule was off while it was on |
| `MG4`, `MG5`, `MG7`, `MG8`, `MG9` looked unimplemented and were not | They are enforced by the contract test their own "Declared" column names. A **third category**, now tracked as one |
| A pending entry for a rule no table declares would have been invisible | Neither the missing-rule check (no row) nor the staleness check (not implemented) can see it. A fourth direction, now asserted |

**The third category is worth its own paragraph, because the distinction is the one this section opens with.** A rule enforced by a contract test *is* enforced — but not at the gate, and this section's first claim is that the build gates fail the build rather than a test run "because a layer violation merged and fixed later has already had time to be depended upon". A table recording only "implemented" cannot say which side of that line a rule sits on. So each test-enforced rule now names the file that carries it, and the claim is asserted rather than believed: the test's own name must cite the rule id, which fails if the test is renamed away or the file is split. `EX`, `TL`, `CP` and `SP` point at test ids across a different corpus and are **not** checked — named here as an unchecked family, which is the only honest state for them.

`MG2` — no cycle within a layer — is the one genuinely unbuilt rule in the family. It blocks on nothing; it is listed pending with "nothing" as its blocker, because a rule not yet built and a rule nobody remembers are indistinguishable unless one of them is written down.

**One gap is recorded here with no mechanism, because none is tractable.** SP1 and the pairing audit ask whether each commitment has an invariant and each invariant has a commitment. Neither asks whether two invariants can both be satisfied at once. C12 I5 and I14 are the first known instance: I5 kept a column's minimum and maximum under downsampling, I14 joined successive points with Bresenham, and keeping only the extremes leaves the join nothing to work from — **each correct alone, jointly unsatisfiable, and both pass every check in this document.** It is resolved by a composition clause on both (C12 §3), and it was found by trying to implement them rather than by any rule.

A mechanism would be n² prose comparison across 25 specs, which is not a check but a second reading of everything. So this is a note to the reader rather than a row in a table: **pairwise consistency between invariants is unenforced**, and the place it surfaces is the first time someone tries to satisfy two at once.

**A second instance, one component later, and it was found the same way.** C25 I2 claimed height is independent of width; §3 chose the layout by width; and split layout pairs a removed line with its added counterpart on one row, so the row count differs across the breakpoint. Each defensible alone. It surfaced while drawing the illustration — the two figures gave ten rows and eleven from one block — and the resolution kept the invariant that carries load (I1, measurement equals rendered rows) and weakened the one that was a convenience (I2a, constant *within* a layout).

**Two instances in two consecutive components, and both were found the same way: by one implementation having to satisfy both at once.** C12's surfaced while writing the rasteriser, C25's while drawing the figure the renderer would be written against. In neither case did reading the invariants side by side reveal anything, because in both cases each invariant was true.

That is the closest thing to a detection method there is, and it is worth stating as one rather than leaving it as a coincidence: **the contradiction surfaces when something must satisfy both simultaneously, and nowhere earlier.** A reader looking for the third instance should expect it at the moment of implementation, and should recognise the shape — two true statements, one impossible object — rather than concluding that one of the two is simply wrong. Neither was, either time.

**A third instance, one layer later, and the method is now three for three.** C13's cap, its never-evict rule and `overCap` are three claims about one situation: the cap bounds blocks, the live and streaming entries are exempt from eviction, and the excess is reported for L4 to act on. Each is correct alone. What none of them said is *when* the figure is computed — §4 ran the sweep inside `append` only, so after a `settle` relieved the pressure `overCap` still described the overshoot from before, and L4's warning outlived the condition. It surfaced while walking a sequence by hand against the three rules at once, which is the same moment as the other two: not while reading them, but while making one object satisfy all of them.

**A fourth and a fifth, in the next component, and both are the same shape as C13's.** C14 I3 fixes a cached height's validity as `(entryId, rev, width)` and says nothing about the value's *lifetime* — read as a composite map key it holds one slot per revision, so a `--watch` accumulates a thousand slots for one entry while every other claim in the spec stays true. And §4's "eviction from the front is handled by an offset rather than a rebuild" is correct for one eviction and silent about a session: C13's cap evicts continuously, so the index grows with total appends ever. Each rule right, each *when* unstated.

**The class has a single sentence now: the rule is correct and the moment is missing.** C12's I5/I14 and C25's I2 were two true statements and one impossible object; C13's `overCap`, C14's cache and C14's index are three rules that hold at the instant they are written and not across the sequence that follows. Both halves are invisible to a reader checking each statement, and both surface the moment one implementation has to satisfy all of them at once.

**A second class, found the same way and needing two components rather than two invariants.** C13 emits `append` *and then* `evict` for one `transcript.append()` — a stream of deltas. C14's invalidation table reads each `Change` as a description of the store's current state, and the two contracts look perfectly compatible: every variant is handled, every handler is correct for the change it names. What is unstated is that one call produces two changes, so the first handler runs against a list that has already lost its front and gained the eviction marker.

The symptom was `totalRows` of 0 over a transcript holding three entries — **a blank screen that every assertion reports as a pass**, because `topRow` really was 0 and the visible range really was consistent with it. Nothing was inconsistent. The viewport was describing a different document than the one it held.

**The detection method differs from the contradiction class, which is why it is its own line.** A contradiction surfaces when one implementation must satisfy two invariants; this surfaces when one component consumes another's event stream and reads deltas as state. Both need the work done. Only this one needs two components, which means it cannot be found while either is being specified — and it is invisible to the module graph, which sees a legal downward edge, and to both test suites, which are each correct about their own component.

The remedy generalises: **a consumer of a change stream tracks what it currently mirrors and diffs, rather than inferring the shape of the change from its kind.** C14 keeps the entry ids its index holds. The common shapes stay incremental and anything unexpected rebuilds, which is correct at any cost and reached only by a change the producer does not currently emit.

**So the expectation is now a step rather than a hope.** Six instances across four components — five contradictions and one delta-versus-state — every one found by attempting the work and none by reading. A component's plan includes the walk: for a renderer, drawing the figure; for a store, stepping a sequence and asserting the whole state after each step; for anything that composes a frame, **reading the frame beside the numbers.** That last one is not interchangeable with the others. C14's blank screen was arithmetically self-consistent, so the walk that catches it is the one that looks at the output rather than at the values describing it.

It is named as a step in `CLAUDE.md`'s Always list rather than left to whoever finds the component tricky, because it has found something on every component it has been run against.

The mechanism remains n² prose comparison and remains untractable. What is tractable is the expectation.

**The class extends past rules into the harnesses they run in.** A rule executes inside a fake terminal, a fake clock or a pseudo-terminal, and a harness parameter nobody has exercised is a mechanism that cannot be *seen* to have worked — the same defect from the other side. `runInPty` accepted an `env` record and hard-coded node-pty's `name`, which *is* the child's TERM, so `TERM=dumb` ran under `xterm-256color`; the parameter had never been passed until C02's tier 5 passed it. The standing rule is in `test/support/README.md`: **every helper parameter that shapes the environment under test carries an assertion that fails if the parameter is ignored**, and a parameter with no observable effect is reported rather than skipped, because it may mean the parameter should not exist.

**The fourth is the one the other three do not catch, and it is a defect of this document rather than of the code.** A missing rule is invisible from the source side: `checkSourceScans` iterates the rows it has, so a row that was never written is not a rule that fails but a rule that is not there. The inventory is the only place it exists, and the inventory is prose. The check is therefore set equality — the ids in these tables equal the ids implemented plus the ids explicitly pending — so **a rule inventoried and never built fails on the commit that inventories it**, which is the commit where someone still remembers what it was for.

Every rule therefore ships with four things: an implementation reachable from the inventory, a fabricated violation, an assertion that its scope reaches the tree, and — where the rule governs named entities — an assertion that those names exist. The three catch different failures. A fabricated violation is written at a path inside the declared scope, so it fires whether or not that scope describes anything; and a scope full of real files says nothing about whether the names a rule enumerates are real. All three are in `test/unit/enforce-rules.test.ts`.

A rule whose scope or names are not yet real is listed there as **pending**, with the component that will create them; the pending entry is itself asserted, so it fails once the scope becomes real rather than outliving its reason.

### Records that cannot outlive their reason

That pending entry is one of a family, and the family is worth naming because its members look unrelated and are the same idea: **a record of a gap, written so that closing the gap breaks the record.** Four mechanisms now:

| | Records | Fails when |
|---|---|---|
| A **pending** rule entry | a scope or a name that is not real yet | the scope becomes real |
| `ACKNOWLEDGED_BACKLOG` | deferrals whose blocker already exists | one is written, or a new one appears |
| `UNSCAFFOLDED` | a component with no file in the tree at all | the file appears |
| **A test that asserts a defect** | behaviour that is wrong and not yet fixable here | the defect is fixed |

The fourth is new with C01 T5.8 and it inverts the usual reading, which is why it needs saying loudly rather than quietly. **That test is green because the bug exists.** A frame composed at 100 and written into an 80-column terminal wraps; it asserts the wrap, and the wrap is the failure C01 §5 documents and deliberately does not fix, because the per-frame snapshot belongs to whoever writes the frame path.

So when the gap closes, the test fails — and **the danger is that someone reads a red test beside a fix and deletes it**, which loses the only notification that the boundary moved. A skipped test, a todo and a pending entry all announce themselves as incomplete; this one announces itself as passing. It therefore has to carry the inversion in its own name and in its body, both of which say what a failure means: not that the fix is wrong, but that the documented behaviour is no longer the behaviour, and the test is now describing history.

The same discipline SS26's pending entry has, pointed at a defect rather than at a rule.

### Open: a tier-6 claim can be unreachable, and nothing checks

**Found in C15, and it is the vacuity class in a location nobody has swept.** A tier-6 test states that a specific change breaks a named test — "sorting purely by push order → T1.4 and T5.3 fail". C15's T6.2 said that, and the change was unreachable: `push(view)` is rejected onto any non-empty stack, so a view only ever lands on an empty one, overlays always follow it in push order, and I2 holds by construction. Neither named test can construct a stack in the wrong order. The revert breaks nothing they can see, and the claim is decoration.

This is not the fabricated-violation problem in a new coat. A fabricated violation proves a *rule* can fire; nothing proves a *revert* can. And the two failure modes differ: a rule that cannot fire reports compliance, while a tier-6 claim that cannot fire reports that a hazard is guarded when it is not — the test stays green under the very change it names.

**Roughly two hundred and fifty such claims exist across twenty-five specs, and none is verified.** The verification sections have said since A03 was written that the reverts are run by hand as a checklist, and how consistently that has happened is not knowable from here.

Deliberately not scheduled as a pass. Recorded because a finding taken between commits and not written down evaporates, and because the shape of the remedy is already known from C15: **make the revert reachable rather than delete the test.** T6.2's hazard is real — a confirm behind a dashboard — and the fix was to keep the sort as real code and reach it through a hand-built stack, which is possible because placement is a pure function of one. A tier-6 claim that cannot be reached is usually telling you the component has no seam at which the hazard is observable, and that is worth knowing whether or not the test survives.

Whoever runs the pass should expect the answer to be a mix: some claims reachable and unverified, some reachable only through a seam that does not exist yet, and some — like T6.2 — describing a hazard that a *different* invariant already makes unreachable, where the honest edit is to say so rather than to keep the sentence.

---

## 3. Module graph

The layer rule (A02 §1) made executable. One test walks the compiled graph and asserts each edge.

| # | Assertion | Declared |
|---|---|---|
| MG1 | No module imports upward across layers | A02 §1 |
| MG2 | No cycle within a layer | A02 §1 |
| MG3 | `terminal/` ↮ `data/` — L0's halves never import each other | A02 §1, C01 T2.4, C03 T2.6 |
| MG4 | C04 imports nothing from `terminal/`, `presentation/` or above | C04 T2.9 |
| MG5 | C05 imports nothing from `terminal/` or above | C05 T2.6 |
| MG6 | C06 imports no C04 type | C06 T2.2 |
| MG7 | C07 imports nothing from `terminal/` or above | C07 T2.6 |
| MG8 | `tui-kit` imports nothing from `prism-tui` | C08 T2.6, T2.10 |
| MG9 | No block kind imports the registry | C09 T2.11 |
| MG10 | C13 imports nothing from `terminal/` or `presentation/` | C13 I18, T2.4 |
| MG11 | C14 imports nothing from `terminal/` | C14 T2.5 |
| MG12 | C15 imports nothing from `terminal/` or C14 | C15 I12, T2.6 |
| MG13 | C15 imports nothing from C13 — the table's first *sideways* prohibition | C15 I9, T2.5 |
| MG14 | C16 imports nothing from `terminal/` | C16 T2.7 |
| MG15 | C17 imports nothing from `terminal/` — the reachable form is reading a width rather than being handed one | C17 I10 · C17 T2.6 |
| MG16 | C18 imports nothing from `terminal/` or `presentation/` | C18 T2.4 |
| MG17 | C19 imports nothing from `terminal/` | C19 T2.5 |
| MG18 | C20 imports nothing from `terminal/`; no C17 import | C20 T2.5, T2.6 |
| MG19 | C21 imports nothing from `terminal/` | C21 T2.3 |
| MG20 | Each mode export of `terminal/escapes.ts` is imported by exactly its owner — the five persistent modes by C01, `2026` by C03 | C01 I1, T2.8 |
| MG21 | `presentation/` imports nothing from `terminal/` but `escapes.js`; type-only imports are not edges | C09 I15, T2.17 |
| MG22 | `presentation/plot/` imports nothing from `presentation/table/` — the C11 → C12 edge is one-directional | A02 §1, C12 §2 |
| MG23 | A component in L1–L3 imports at most one **store**; several at once is L4's, through C23 | C23 §2, C23 I14, A02 Seam 4 |

**MG10 is the sharpest instance of MG6's third kind, because both its edges go *downward*.** C13 is L2, `terminal/` is L0 and `presentation/` is L1, so MG1 reports an import of either as legal and MG2 sees no cycle. Every rule in this document passes an edge C13 I18 forbids outright — which is why it is a row here and not a consequence of the layer walk. What it guards is knowledge rather than layering: a store that can measure a document will eventually evict by height, and "evict the tallest" reads as more correct than "evict the oldest" while making the transcript depend on a width it has no honest way to obtain. The cap is on blocks (C13 I17) precisely so this component never renders to do its job.

**MG22 is a cycle rule, not a layer rule.** C11 imports C12's `sparkline` for a `Cell.spark` (C12 §2), which is legal: A02 §1 forbids importing *upward* and importing *cyclically*, and both directories are L1, so the layer walk sees nothing either way. What must never exist is the return edge — a plot reaching into the table engine for a column width or a truncation helper, which is exactly the shape a reader would reach for and which would close the cycle. Type-only counts, as MG6 and MG19 both record: a reference is a dependency whether or not it survives the build.

MG2 would catch the cycle once closed; MG22 catches the edge that would close it, one commit earlier. That is the MG13/MG18 precedent and the reason the table holds specific prohibitions alongside the general walk.

**MG23 is SS29, folded — and it is the SS7/SS8/SS12 pattern a fourth time: a rule whose scope was covered by a broader mechanism at birth.** It was inventoried as a source scan for "multi-store access outside local handlers", and neither half survived being written.

Scoped to `src/shell/` it fires on the component it exists to permit. C23 reaches the transcript, the scheduler, the runner and the manifest by design — Seam 4 is the reason — so its only in-scope file would have been its own exception, which is not a rule.

Scoped to L1–L3, which is the sentence C23 §2 actually argues, *reaching a store* means **importing** one — a module-graph question this family already answers per component. MG10 forbids C13 from `terminal/` and `presentation/`, MG18 covers C20, and each L2/L3 component has a row. **Those rows are prohibitions between named pairs; MG23 is the property they are instances of**, so the twenty-sixth component cannot reach two stores merely because nobody has written its row yet. SS40 covering a directory rather than naming files, one family across.

Two things it defines rather than leaving to inference, because both were undetermined in SS29's row:

- **The stores are enumerated** — `STORE_SYMBOLS`, `MODE_OWNERS`'s precedent. A rule governing named entities whose names are never checked is §2's third clause, so `storeNamesAreReal` asserts every symbol is one the tree exports.
- **"Above L0" qualifies the component, not the store.** C05's manifest and C07's adapter registry are L0 and are still stores; what the sentence forbids is an L1–L3 component holding two stateful things at once. So they are in the list and `src/data/` is not in scope: C06 reaching C05 is L0 business with no component above it involved.

It counts imports of the **store itself**, not any symbol from a module that happens to hold one. C11 and C12 import C09's paint helpers and C10's tones, which is required rather than tolerated, and neither imports a registry or a theme store. A component's own store is not a reach either — `viewport.ts` naming `Viewport` was the first run's only finding, and it is the false positive that gets a rule deleted.

**MG13 is that precedent armed, and it is the first *sideways* prohibition in the table.** MG10 and MG11 are downward edges the layer walk permits; C13, C14 and C15 are all L2, so C15 → C13 is not merely permitted, it is invisible to every other rule at once — the walk sees no direction to object to and MG2 sees no cycle, because there is none. MG12 is its neighbour and covers the same component's other two reaches, C14 and `terminal/`.

What MG13 guards is a fix the C15 spec pass rejected, and the fabrication is copied from it rather than invented (commitment 14a). C15's I10 asked the overlay manager to dismiss a layer whose anchor row had been evicted, and the only way to notice an eviction is to subscribe to the store. One import buys the detection and pays with C15's statelessness, `layout()`'s purity, and a second component in the tree reading a change stream as a description of current state — the class §2 records and C14 paid for in a blank screen. The reason is recorded by whoever raised the layer instead, and this rule is what stops the one-line version being rediscovered by someone reading I10 without §5 beside it.

**MG3 and MG8 are the two that would be hardest to undo.** L0's halves touching collapses the parallel-build property; `tui-kit` reaching into `prism-tui` ends the reuse claim outright.

---

## 4. Source scans

Grep-class checks over built output. Each names a directory and a forbidden pattern.

### Ambient reads

| # | Forbidden | Where | Declared |
|---|---|---|---|
| SS1 | `Date`, `Date.now`, `performance.now`, `process.hrtime` | anywhere in `tui-kit` outside C22 | C22 T2.4 |
| SS2 | `Math.random` | anywhere in `src/`; C08 is where it would be reached for | C08 T2.3 |
| SS3 | `Math.random`, `fs`, `process` — clock reads are SS1's | `src/data/adapters/` | C07 T2.2 |
| SS4 | clock reads | `src/viewport/` | C13 I9, T2.2 · C14 T2.4 |
| SS5 | — folded into SS4 | — | C14 T2.4 |
| SS6 | — folded into SS1 | — | C16 T2.3 |
| SS7 | — folded into SS1 | — | C17 T2.3 |
| SS8 | — folded into SS1 | — | C19 T2.3 |
| SS9 | `fs`, `~/.prism` literal — the clock clause dropped, being SS1's | `history/` | C20 T2.4 |
| SS10 | `process.env` reads of the seven terminal variables | outside C02 | C02 T2.5 |
| SS11 | `process.env` | `src/presentation/` | C09 T2.7 |
| SS12 | `process.env` | `theme/` | C10 T2.6 |
| SS13 | `fs`, clipboard shell-out | `viewport/` | C14 T2.4 |
| SS42 | `.columns` / `.rows` on a stream handle | outside `terminal/lifecycle.ts` | C01 I13, T2.10 |
| SS44 | `PRISM_TUI_*` | `src/` | C06 I18, C22 I20, C22 T2.9 |

**SS4 and SS5 were written as two rules over nested scopes, which is one rule and one rule that can never fire.** SS4 named `transcript/` and SS5 named `viewport/`, with the same pattern — so anything SS4 could catch, SS5 caught first, and `transcript/` was a *file* until C13 landed, which is SS3's defect on top. SS4 now scopes to `src/viewport/` and SS5 is folded into it, the SS12-into-SS11 precedent. **It is not redundant with SS1**, which allows `src/shell/session.ts`: the claim these two tests make is that L2 has no clock exception and never acquires one.

**SS1 is the widest and the most valuable.** One injected clock, entering at C22 and nowhere else, is what makes golden frames reproducible and every timing test run on a fake.

**SS44 closes the family by name rather than by variable.** C06 I18 forbade `PRISM_TUI_TRANSPORT` and C22 I20 added `PRISM_TUI_STATE_DIR`; a rule per variable is a list that grows one incident at a time, and the third would be written after it shipped. The prefix is what means "the app's", so the prefix is what the rule matches — and `tui-kit` ships no binary to read one from.

**SS42 is the fourth member of that family and the last ambient value that had no owner.** The clock enters at C22, `process.env` at C02, escape literals live in `escapes.ts` — and the terminal's dimensions were read wherever anyone wanted them, which today is one place by luck rather than by rule.

**The rule is satisfied and the gap it guards is not closed, and both halves are deliberate.** C01 I12 gives a coherent snapshot per `SIGWINCH`; nothing gives one per frame, because `writer` is a `Proxy` over the real stdout and its `columns` is a read the consumer performs at whatever moment it performs it — and C01 exposes no initial size at all, so that handle is the only route to a width there is. **C01 T5.8 demonstrates it in a PTY**: a frame composed at 100 and written into 80 wraps, one row more than a control run at a stable width, and a wrap inside the alternate screen scrolls content the application has no record of.

What SS42 buys is that a **second** live reader cannot appear quietly beside the one legitimate one. It does not buy the snapshot, and an accessor added with one caller and no rule requiring its use would look like it had. The fix belongs with whoever writes the frame path (M-T6), and C01 §5 states the boundary so it is not inferred from the absence of an accessor.

**Keyed on the receiver, and that is the other direction of SS20's defect.** A bare `.columns` matches `block.columns` in `table/` and `plan.columns` in its planner — nine sites with nothing to do with a terminal — and annotating them would put a claim about terminal width on lines about table columns. So the receiver is named. The residual gap is stated rather than left to be found: a handle stored under a name outside that list escapes, and what closes it is the per-frame snapshot rather than a cleverer pattern.

### Forbidden literals

| # | Forbidden | Where | Declared |
|---|---|---|---|
| SS14 | `\x1b`, `\u001b` | outside `terminal/escapes.ts`, allowing `interaction/router/decode.ts` | C01 I1, T2.5 |
| SS15 | Mode numbers `1049 25 2004 1002 1006 2026` | outside `terminal/escapes.ts` | C01 I1, T2.8 |
| SS16 | Hex, ANSI code, colour name | `viewmodel/` | C04 T2.7 |
| SS17 | Hex, ANSI, named colour | `blocks/` | C09 T2.8 |
| SS18 | Hex literal | any block-producing module | C10 T2.9 |
| SS19 | ANSI index or terminal-specific value | `presentation/theme/`, allowing `four-bit.ts` | C10 I13, T2.5 |
| SS20 | `syntax` palette reference | outside `presentation/theme/`, `blocks/kinds/code.ts` and `presentation/patch/` | C10 T2.8 |
| SS21 | `spectrum` palette reference | outside `presentation/theme/`, where the art is declared | C10 T2.8 |
| SS22 | Literal verb, flag or enum list | `src/interaction/completion/`, allowing `completion/types.ts` | C19 I4, T2.6, T4.1 |

**SS22 is the anti-drift check**, and it became real on the day `completion/` did. A hardcoded enum in completion is how the manifest stops being the source of truth, and it looks harmless in review — the list is *correct* on the day it is written, which is why nothing else in the suite would notice it. C19 T4.1 keeps passing against a literal list, because the fixture manifest still holds the same values.

Two shapes, because there are two ways to write one: a `"--flagname"` literal is a flag by itself, and three or more lowercase word strings in an array literal is a verb or enum list. `"--"` alone is not matched — the prefix test in `context.ts` is a question about syntax, not a flag name — and a one-entry `slots:` list is a source declaring which slot it serves. Both near-misses are asserted in `test/revert/completion.test.ts`, because a rule widened until it is ignored is worse than no rule.

`types.ts` is allowed by name: `SLOT_KINDS` is C19's own closed union, enumerated so T2.7 can be exhaustive over it, and it is not manifest data.

**SS19 scopes to the directory with one named exception, not to the token files.** C10 I13 forbids an ANSI index in token data, while C10 §3 requires a curated 4-bit map per theme — so exactly one file in `theme/` must contain indices, and it is named in the allow-list. Scoping the rule to `tokens-*.ts` instead would read as tighter and be looser: it stops seeing a new token file the day someone adds one, which is SS26's failure arriving through a different door. An allow-list of one exception is auditable; a glob that might not match anything is not.

**SS15 scopes to `escapes.ts`, not to C01.** An earlier version said "outside C01", which contradicted SS14 and C01 I1: the literals are *required* to live in `escapes.ts`, so a rule forbidding them outside C01 fails on the one file that must contain them. Ownership of the *modes* is asserted separately, as MG20 — the escape module's named exports are imported only by their owning component. Two checks, because a single one cannot express both "the digits live in one file" and "the meaning belongs to one component".

### Structural prohibitions

| # | Forbidden | Where | Declared |
|---|---|---|---|
| SS23 | `.length`, `charAt`, `slice` on display text | `src/presentation/`, allowing `presentation/theme/` | C09 T2.9 |
| SS40 | The same, in the editor | `src/interaction/`, allowing `router/decode.ts`, `interaction/parser/`, `completion/context.ts` and `completion/sources.ts` by name, and six of C20's seven — `history/codec.ts`, `history/navigate.ts`, `history/persist.ts`, `history/redact.ts`, `history/search.ts`, `history/store.ts` — with the seventh, the layer builder, left in scope, being the one that measures display width | C17 I2, T2.4 |
| SS24 | Mutable module state | `src/presentation/table/`, `plot/`, `patch/`, `src/interaction/parser/` | C11 T2.6, C12 T2.5, C25 T2.4, C18 T2.2 |
| SS25 | Exit-code mapping or `ErrorLike` construction | `transport/` | C06 T2.3 |
| SS26 | Writes to real `process.stdout` | `process/` | C21 T2.2 · **pending, see below** |
| SS27 | Timer or escalation logic, including a `SIGTERM` literal | `process/` | C21 I8, I11, T2.4 |
| SS41 | `process.env` or `process.stdin` | `process/` | C21 I14, T2.7 |
| SS28 | Scheduler calls | `src/interaction/`, allowing `history/types.ts`, `history/persist.ts` and `history/store.ts`, whose `flush` is C20's write to disk and not C03's frame | C16 T2.6, C17 T2.6, C18 T2.4, C19 T2.5, C20 T2.6 |
| SS30 | A second implementation of a shared text primitive — tokeniser, quoter, edit distance | `src/`, allowing `interaction/parser/tokenise.ts`, `data/manifest/validate.ts` and `blocks/kinds/code.ts` | C18 T2.3, C18 T2.10, C19 T2.4, C05 T2.9 |
| SS31 | A runtime dependency absent from `DEPENDENCIES.md` | `package.json` | A04 §2 |
| SS32 | A `postinstall`, `preinstall` or `prepare` script in any dependency | the install tree | A04 §3 |
| SS33 | `console.*` | `src/` | C01 I9, A04 §2 |
| SS43 | A literal C0 control character (tab and newline excepted) | `src/` | C16 T2.10 |
| SS34 | `render({ … alternateScreen … })` | `src/` | C01 I1, T2.9 |
| SS35 | A second `type Result` declaration | `src/` outside `data/viewmodel/types.ts` | C04 I26 |
| SS36 | A string literal assigned to a `colour` field | `src/` | C10 I24, T2.19 |
| SS37 | An Ink `color=` or `backgroundColor=` prop | `src/presentation/` | C09 I15, T2.17 |
| SS39 | A character literal in a `glyph` position | `src/` outside C09's glyph table | C04 I6, C09 §4 |
| SS38 | A bare import of a package that is not a declared runtime dependency | `src/` | A04 §2, C09 §4a |

**SS33 moved here from eslint's `no-console`, and got stronger for it.** It catches `console.error` and `console.warn`, which the lint rule did not, and it cannot fall silent because a parser could not read the file. It is also what makes C01's stdout redirection meaningful: a stray `console.log` in `src/` would be captured to the debug sink rather than corrupting a frame, but it should not exist in the first place.

**SS34 is the two-owners check.** Ink 7 accepts `render({ alternateScreen })` and will enter and leave it itself. C01 holds the alternate screen, so Ink must not — `held` would stop describing what was taken, and release would emit sequences for state something else already released. The framework's own option is the tempting shortcut precisely because it looks simpler at the call site.

**SS31 and SS32 are supply-chain gates.** `tui-kit` has three runtime dependencies because the specs need no more (A04 §2); a fourth appearing without justification is the change worth catching. SS32 catches the primary npm attack vector at the point it would first run.

**SS32 runs over the tree, not over our own manifest.** Checking only `package.json` would pass on a tree where every dependency ran code at install time, which is the thing the rule exists to prevent.

**It checks `preinstall`, `install` and `postinstall` on dependencies — not `prepare`.** `prepare` runs in a package's own directory and for a git dependency; it never runs on a published tarball. Eighteen packages in this tree declare one and none of them executes. Flagging them would train everyone to ignore SS32, which is worse than not having it. Our own manifest is still checked on all four, and A04 commitment 13 is what keeps git dependencies out.

**Two named exceptions, each with its reason recorded.** `node-pty` ships darwin and win32 prebuilds only, so Linux compiles it; `--ignore-scripts` stays set for the whole tree and `make install` invokes that one build by name, which is a different thing from letting every package run arbitrary code. `esbuild` is transitive under vitest and its postinstall is *suppressed* — npm installs the platform binary as an optional dependency and the hook is a fallback we never reach. Listed rather than silently skipped, so that if a vitest upgrade makes it load-bearing there is a place the reason already lives. Anything else acquiring an install script fails the build.

**SS26 is pending and has never been evaluated.** It scopes to `src/data/process/` and the scaffold created `src/data/process.ts` — a file, not a directory — so the prefix match finds nothing and the rule passes on every run. It came in with the scaffold and would not have fired had it been violated. The scope is corrected when C21 lands and creates the directory; until then the vacuity suite carries it as a named pending entry rather than counting it as enforcement. This is the defect the sixth kind of check exists to find, and it is recorded here rather than quietly fixed because the count of live rules should be honest.

**SS23 scopes to `src/presentation/`, not to `blocks/`.** Its reason — display width comes from `cells()`, the same implementation the measurer uses, or measurement drifts — is a fact about presentation and not about one directory of it. Scoped to `blocks/`, it stopped seeing `src/presentation/table/` the day C11 created it, and C11 is the largest consumer of measurement in the tree. That is SS26's failure with a longer fuse: narrower reads as tighter and is looser, because it stops seeing new files. The same argument SS2 records, arriving through the same door twice.

**SS24 names `src/presentation/table/` in full, and C11 creates the directory to match.** The inventory said `table/` while the scaffold held `src/presentation/table.ts` — a file — so the prefix match would have found nothing and the rule would have reported compliance from the day it was written. That is SS26 exactly, and it is recorded here because the fix was to choose the *implementation* layout to suit the rule rather than to loosen the rule: C11 implements into a directory. A rule with nothing to be wrong about passes exactly like a rule that is satisfied.

**SS28 is the L4-orchestrates rule made checkable.** It caught four attempted violations during specification; as a scan it catches the fifth.

**SS36 exists because a tag that is droppable gets dropped.** C10 resolves a colour to a value that names its own depth — `rgb`, `ansi256`, `ansi16` — so the writer downstream switches on a tag rather than inferring the depth from the format, and the consumer that infers wrong emits truecolour to a sixteen-colour terminal. Types hold that inside the tree. What types do not hold is a cast, and a `Style` assembled by hand in a renderer with `colour: "#7faecf"` is one `as` away from compiling. The scan is what makes the untagged form unwritable rather than merely discouraged.

**SS37 is SS36's other half.** SS36 makes an untagged colour unwritable inside the tree; SS37 stops the tag being discarded on the way out of it. Ink's `color` prop takes a string and re-derives the depth from its *format* — so a renderer handing it `"#7faecf"` has asked one question and got two answers, and the one that reaches the terminal is Ink's. Worse for the suite than for the frame: the colour library behind that prop decides how much colour to emit from its own environment detection, which reports none at all under a test runner. Every golden frame would render monochrome and pass, while production rendered truecolour. A rendering nobody ships, verified thoroughly. Renderers emit SGR from `terminal/escapes.ts` instead (C09 §3).

**MG21 keeps the new edge singular.** C09 §3's `escapes.sgr` is the first runtime import from L1 to L0-terminal — legal under MG1, which forbids upward imports and not downward ones, and required rather than tolerated. What makes it safe is that it is one narrow import and not the beginning of a habit: the rule permits `escapes.js` and type-only capability imports, and fails on anything else `src/presentation/` reaches for in `src/terminal/`. It is an MG rule rather than an SS one because it is a question about the import graph, which the grep-class scans cannot ask: a multi-line `import type` spans lines, and only the graph checker knows a type-only import is not an edge. Recorded as a rule rather than a paragraph because "tidy that import away" and "add one more like it" are both reasonable-looking edits.

**SS38 is the hole SS31 leaves.** SS31 compares `package.json` against `DEPENDENCIES.md`, and both were clean while `src/` imported `highlight.js`, which was in neither: `lowlight` depends on it, npm hoisted it, the import resolved, and every gate passed. That is a **phantom dependency**, and its whole failure mode is that *it resolved, so it must be declared* is exactly the reasoning that does not hold. It breaks on someone else's release — the day the intermediate drops the dependency or a package manager stops hoisting — and in the meantime it is a package nobody reviewed, pinned or wrote a row for, executing in the product. Scoped to `src/`, which ships: a test may import `vitest`, and `src/` may not, because a consumer's install has no devDependencies.

**SS39 is SS36's shape applied to glyphs.** C04 I6 closes `Glyph` to a vocabulary, and the type holds that inside the tree — but a `Notice` assembled with `as` is one cast away from compiling with a character in it, which is exactly how `colour: "#7faecf"` would have survived without SS36. The rule is what makes the untokenised form unwritable rather than merely discouraged. It matters more than the colour case in one respect: a wrong colour is visible to whoever wrote it, and a glyph that breaks the 1:1 rule is visible only under `LANG=C`, only to users who cannot easily say what they are seeing.

**SS35 is SS30's shape applied to a type name.** C05's first draft declared its own `Result<T, E>` with `errors` plural where C04's has `error` singular — same name, same half of L0, and both compile. Nothing would have failed until a call site read `r.error` on the wrong one, which is a runtime `undefined` rather than a type error. One `Result` in the tree, declared in `data/viewmodel/types.ts`; a component wanting a plural puts it in the type argument.

---

## 5. Exhaustiveness

Compile-time, zero cost, and each prevents a union member shipping without its handler.

| # | Union | Must have | Declared |
|---|---|---|---|
| EX1 | `Block` | a validator branch | C04 T2.10 |
| EX2 | `Block` | a registered definition | C09 T2.6 |
| EX3 | `Tone` | an entry in every shipped theme | C10 T2.7 |
| EX4 | `ArgType` | a validator | C05 T2.4 |
| EX5 | `ArgType` | **no** domain-specific member — frozen list | C05 T1.7c |
| EX6 | `CommitReason` | a window entry | C03 T2.5 |
| EX7 | `FocusTarget` | at least one default binding | C16 T2.5 |
| EX8 | `Motion` | an implementation | C17 T2.7 |
| EX9 | `ParseResult` | a route | C23 T2.6 |
| EX10 | `Change` | a documented cache effect | C14 T2.7 |
| EX11 | `OverlayChange` | emitted by some operation | C15 T2.7 |
| EX12 | Capability fields | a row in the degradation table with a named owner | C02 T2.6 |

**EX5 is the odd one and the most important for the framework claim.** It asserts a union stays *empty* of domain concepts — adding `uuid` or `target` back to `ArgType` fails the build, which is what keeps `tui-kit` general.

---

## 6. Type-level

Shapes that must not be constructible. Zero runtime cost.

| # | Rejects | Declared |
|---|---|---|
| TL1 | A React element in `Layer.content` | C15 T2.3 |
| TL2 | A React element in the completion menu | C19 T2.8 |
| TL3 | A React element in reverse-search content | C20 T2.7 |
| TL4 | View-state fields on a `merge` payload row | C04 T1.8b |
| TL5 | A shell string parameter on `spawn`; an argv form on `spawnShell` | C21 T2.5 |
| TL6 | A string `SpawnOptions.cwd` | C22 T2.6 |
| TL7 | A missing `onFatal` on the lifecycle | C22 T2.6 |

**TL5 is the security-relevant one.** The argv/shell boundary is D18, and a boolean flag would have made it invisible at the call site; two methods make it a type error to blur.

---

## 7. Corpus properties

Not build gates — they need fixtures — but they are the checks that catch the defects reading does not.

| # | Property | Declared |
|---|---|---|
| CP1 | `measure(b, w)` equals rendered rows, every kind × corpus × 7 widths | C09 T2.1 |
| CP2 | The same under `unicode: "ascii"` | C09 T2.2 |
| CP3 | Every substitution is 1:1 by cell count | C09 T2.5 |
| CP4 | Every shipped theme passes its contrast floors | C10 T2.4 |
| CP5 | The 4-bit mapping is injective across `{ok, warn, error, info, accent}` | C10 T2.3 |
| CP6 | Every stated column drop order equals `planColumns`' output | C11 T4.1, S03/S05/S06/S14/S15 |
| CP7 | Every produced document passes `validateDocument` | C07 T2.3 |
| CP8 | Every surface at 1-bit carries each distinction by glyph or word | B04 B4.3 |
| CP9 | Every field at 160 is reachable at 60 | B04 B4.2 |
| CP10 | Drop orders are identical under ASCII and UTF-8 | B04 B4.4 |

**CP6 already caught two defects during specification** — S06's drop table stated by analogy, and S14 and S15 specifying drops below the minimum width. It is three lines of code and it found errors three readings had missed.

**CP8 is the sweep worth running earliest.** A single colour-only distinction anywhere breaks the 1-bit axis invisibly for everyone whose terminal has colour.

---

## 7a. Spec properties

The suite governs the source. **SP1 governs the documents the source is written against**, because a commitment nothing enforces diverges from the implementation without anything going red — and there is no reason the enforcement suite should stop at the `src/` boundary when the specs are the contract.

| # | Rule | Scope | Declared |
|---|---|---|---|
| SP1 | Every commitment cites an invariant, several, or another spec's | `docs/components/` | A02 §1 |
| SP2 | Invariants are numbered 1..n, in order, a lettered variant beside its base | `docs/components/` | A02 §1 |
| SP3 | Every invariant reference resolves against the spec that owns it | `src/`, `test/`, `tools/`, `docs/` outside `components/` and `archive/` | A02 §1 |
| SP4 | A02 Seam 4 and each owner's orchestration table hold the same rows, **both directions** | A02 Seam 4 · C22 §3c · C23 §4 | A02 §Seam 4 |

They run in `make enforce` and their fire-tests are `test/unit/enforce-commitments.test.ts`.

**SP2 is a check that existed as a habit rather than a mechanism**, which is the same class as SS3 (§2) approached from the other side: not a rule written down and never built, but a rule performed reliably and never written down. Ordering was verified by ad-hoc script while the specs were written and caught every time. When the habit stopped, the drift resumed — twenty of twenty-five specs, C04 declaring `…17, 22, 23, 24, 25, 26, 27, 28, 19, 29, 18, 20, 20a, 33, 32, 31, 30, 21` — and nothing went red, because nothing was missing and no citation dangled. The list had simply stopped locating anything.

Every instance came from appending an invariant to the end of a *related group* rather than the end of the list, which is the right editorial instinct. So the rule's remedy is to renumber in document order and keep the grouping: **the numbers move, not the prose.**

**SP3 is the surface SP1 was never asked about.** SP1 resolves citations inside `docs/components/`. The 367 qualified and 1133 bare references in `src/`, `test/`, `tools/`, the architecture documents and the surfaces were resolved by nothing at all — a test named `T3.7 (I5)` could cite an invariant that does not exist and stay green, which is SP1's own "reads as backed and is not" on a surface an order of magnitude larger. It found nine defects on the commit that introduced it, three of them a C02 test citing C01's invariants.

Resolution is by explicit qualifier (`C10 I22`) first, then by a declared file-to-spec owner map, and a file with references and no owner **fails rather than being skipped** — §2's vacuity class, since a check that cannot find what it was asked about passes exactly like one that is satisfied. In a markdown document an id inside a code span or fenced block is a *form* being illustrated (`(I3, I4)`, `T3.7 (I5): …`) and is not read as a reference; every such occurrence in the corpus is an illustration and none is real.

**Its boundary, stated rather than assumed.** SP3 proves a reference resolves against its owner. It cannot prove the owner is the intended one: a bare id in a misattributed file resolves silently when the number happens to exist in both specs, and the C02 test above was caught only because C02 happens to declare no invariant of that number. Qualified references are immune, and are preferred wherever a file's owner is not obvious from its path.

**And the boundary is reached often enough to be a defect class rather than a caveat. Five known members as of 2026-07-30** — a C22 pair citing `C01 I17` for C01 I5, two C13 tests citing I14 for a `rev` rule, a C13 test citing I13 for the module graph, and C14 citing `C13 I13` for the marker. Every one resolves; every one points at the wrong rule. The members are tabulated once, in [`../COMMITMENT_INVARIANT_AUDIT.md` §Fourth pass](../COMMITMENT_INVARIANT_AUDIT.md), together with why no mechanism follows and why a qualified reference is immune — that document is where the citation findings live, and a second copy here is a second thing to keep true.

Two things belong here rather than there. **This document has been on the other end of it**: SS37 declared C09 I4 for behaviour that is C09 I15, and MG21 declared a § where an invariant now exists. Both fired correctly the whole time and both were mislabelled, which is what these five are — so the population is one class and not two, and a rule's "Declared" column is as citable-and-wrong as a test's parenthetical. And **the detection method is §2's**: both this and the contradiction class surface when someone implements against the spec and by nothing else, each now three times or more, which is the argument for the by-hand walk being a scheduled step rather than a courtesy.

**A dangling reference is not inert — it arms itself when the number gets used.** C22 §3 cited `C01 I17` twice, about `beforeRelease` running once before the first release, which is C01 I5 and always was. For months C01 declared no I17 at all, so both citations were dangling and nothing looked. Then the C25 commit added a real I17 — the width rule — and the two silently became *resolving* citations pointing at an unrelated invariant. SP3 would have caught them on any day before that one and on no day after, and what found them in the end was reading the renumber's diff. This is the boundary above with a date attached: the rule proves resolution, and resolution is exactly what the new invariant supplied. Qualifying all eleven hundred is not the remedy — that is a diff of pure noise, and `T3.7 (I5)` in `test/unit/capabilities.test.ts` is unambiguous to a reader. Saying where the rule stops is what keeps it from being read as stronger than it is, which is the failure mode of everything in §2's list.

**SP4 is the class SP1 closes, in the architecture rather than in a spec.** A02 Seam 4 lists every cross-layer sequence and names an owner; each owner's spec lists the same sequences again. Two copies, and nothing compared them — so the table was wrong or incomplete at **every component that touched it**, in a different way each time: six rows missing by C20, `resetFocus` recorded as a subscription at C16, no owner column until C22, and at C23 a stale submit order, `Scroll` with two owners, and three C23-owned rows absent while C23 I13 claims the table holds them all.

Six errors of six different kinds is not a run of bad luck. It is the signature of a duplicated source of truth with no reconciliation — the class SS30 closes for text primitives, SS35 for a type name, C05 T1.7c for a derived list and C22's `STEPS` for an ordering. Seam 4 was the only artefact several components write to and none owns; everything else shared already had a mechanism.

**Equality, both directions, and that is the design rather than a detail.** Containment in either direction misses one of the two failures actually observed: C15–C20's rows were missing *from the table*, C23's were missing *from the spec*. Writing the rule found four more of the second kind — `Pop a pushed view`, `Stall detected`, `View refresh tick` and `cd` / `export` — before it ran, which is TD0's and ACKNOWLEDGED_BACKLOG's lesson arriving in a third place: a set compared by containment only ever grows.

The mutation pass measured the cost of getting that wrong. Implementing SP4 as a subset leaves the first fabrication **passing** — so a single fixture would have shown a green suite over a rule checking half of what it claims. That is why there is one fabrication per direction and a third asserting two findings from one document.

**It also found the asymmetry underneath.** C23 had a §4 listing what it orchestrates; C22 had nothing equivalent, so five of Seam 4's rows had no counterpart at all. Half a table cannot be checked against half a convention, and C22 §3c exists because the rule could not otherwise be written.

Two things it deliberately does not do. It compares **row keys, not sequences** — that both tables spell out `append → resetFocus → commit` identically is not checkable without parsing prose, and the stale ordering C23 found would have survived it; what SP4 guarantees is that both tables know about the same rows, and the ordering is a reader's job on one row rather than on twelve. And markdown differences are normalised away — `` `cd` / `export` `` against `cd / export` is one row written by two hands, while "Submit" against "Command submit" is drift and still fails. Failing on backticks would make the rule about markdown.

Deriving Seam 4 from the component specs was the alternative and is rejected: the table sits inside an argument, and generated content in argued prose goes stale in the other direction, where nothing is looking.

**Why this is exact where a heuristic was not.** The 2026-07-29 pairing audit read 355 invariants against 358 commitments by hand and found 103 mismatches — 57 commitments nothing enforced, 46 invariants nothing agreed to. A word-overlap check over the corpus cannot replace that reading: a commitment is the *readable* form, so it deliberately shares few words with the invariant it summarises, and the noise floor is higher than the signal.

What makes a mechanical rule possible is that the audit produced **categories**, and a category becomes a marker the spec writes down:

```
3. …text… (I5)            backed by one invariant — the common case
7. …text… (I3, I4)        the readable form of several
6. …text… (→ C09 I5)      someone else's rule, cross-referenced
```

The check is then citation resolution rather than similarity: a commitment with no marker fails, a local citation naming an invariant the spec does not declare fails, and a cross-reference that does not resolve fails. That last one is the failure mode a citation rule invites — without it the rule degrades from "cites an invariant" to "contains a bracket", which is worse than no rule because it reads as enforced.

**Architecture documents are cited by section.** A01–A04 declare no invariants, deliberately: A03's own SS and MG rules *are* the architecture's invariants in enforceable form, and giving those documents an invariant list would duplicate this one. So `(→ A01 A.1)` is accepted and not chased for an `I<n>`.

The rule's own vacuity risk is specific and worth naming: **a document with no Commitments section produces no findings and looks compliant.** The fire-test asserts twenty-five specs and more than three hundred commitments before asserting that none of them fails.

SP4 carries the same risk in its own shape — **a heading that stopped matching yields no rows, no disagreements and a green run**, passing for exactly the reason it cannot see the table. It is closed twice: the rule returns a violation when Seam 4 reads as empty, and the fire-test asserts the row count and that both owners declare a table before asserting cleanliness.

---

## 8. Running them

| When | Which | Budget |
|---|---|---|
| Compile | EX, TL | 0 — the type-checker already runs |
| Pre-commit | MG, SS | < 3 s total |
| CI, every MR | MG, SS, EX, TL, CP | CP dominates; target < 60 s |
| CI, nightly | CP plus golden frames at four widths × two themes × two unicode modes | minutes |

**MG and SS run pre-commit because they are the ones whose violations become load-bearing.** A layer violation merged on Monday has three components depending on it by Friday.

Each check names, on failure: the rule, the file, the line, and the spec that declared it. A scan that says only "forbidden pattern found" wastes the time it was meant to save.

---

## 9. Commitments

1. Every enforcement assertion in the spec set is inventoried here, citing its source.
2. `make enforce` (A04 §5) is the runner; assertions specified and never executed are an honour system.
3. Where a spec and this document disagree, the spec wins and this is stale.
4. Module-graph and source scans are build gates, not test cases.
5. Exhaustiveness and type-level checks cost nothing and run at compile time.
6. `MG3` and `MG8` are the two whose violation is hardest to undo — L0's halves, and kit importing app.
7. `SS1` is the widest scan: one injected clock, entering at C22 and nowhere else.
8. `SS28` makes the L4-orchestrates rule checkable rather than conventional.
9. `EX5` asserts a union stays empty of domain concepts, which is what keeps the framework general.
10. `TL5` makes the argv/shell boundary a type error to blur.
11. `CP6` and `CP8` are the two corpus properties that have already found or would find defects reading does not.
12. Every failure names the rule, the file, the line and the declaring spec.
13. MG and SS run pre-commit, because their violations become depended-upon within days.
14. **Every rule ships with a test that fabricates a violation and asserts it fires, naming the rule.** A rule with no such test is assumed vacuous until it has one. Every scan's scope is separately asserted to match at least one file in the tree; and where a rule enumerates named entities — mode owners, export names, file paths — those names are separately asserted to exist. A scope or a name that matches nothing is listed as pending, with its blocking component, and the pending entry fails once it becomes real.
14a. **Where a rule targets a code idiom, its fabricated violation is copied from a real call site rather than written fresh.** A fabrication written by the author of the rule, in the same sitting, reproduces the author's assumption about how the code is written — which is how SS20 came to be correct about a syntax its only consumer does not use (§2). Where no real call site exists yet, the rule is pending until one does.
14b. **The inventory in this document equals what is implemented plus what is explicitly pending**, asserted as set equality over the rule ids. A rule listed here and never built is invisible to every other check — there is no code for a fabricated violation to fire against — so it fails at the point of being written down instead.
15. **The deferral rule reports mislabelled blockers, not only expired ones.** That is its second value, and it is the one nobody designs for. For surface deferrals it is a check rather than a consequence: TD4 asserts the named blocker's kind appears in that surface's own composition, which is the one form of "wrong blocker" that is derivable from two things a surface spec already states (§9a).
15a. **A surface deferral's blocker is the right component** (TD4, §9a), checked from two things a surface spec already states: which section holds its illustration, and what the surface composes to. Half of it has no live subject once C25 lands, and the suite asserts that rather than leaving it to be assumed.
15b. **No rule id appears twice in this document.** Every other check here compares sets, so a duplicated id is one member and the second rule is invisible to all of them (§2).
16. **Every path the deferral map names exists** (TD3, §9a). A mapped file that is not there reports compliance because it cannot find what it was asked about, which is commitment 14's vacuity class inside the deferral machinery itself.
17. **A spec's invariants are numbered 1..n, in order** (SP2, §7a). The numbers are what a citation resolves against, so a list that has stopped ascending has stopped locating anything — and this one drifted for twenty specs because it was a habit rather than a mechanism (§2). A lettered variant sits beside its base, because adjacency is the whole of what the letter says.
18. **Every invariant reference resolves, everywhere, not only in the specs** (SP3, §7a). SP1 stops at `docs/components/`; the eleven hundred bare references in `src/`, `test/` and the other documents were resolved by nothing. **The rule states where it stops**: it proves a reference resolves against its owner, not that the owner is the intended one, and a qualified reference is preferred wherever a file's owner is not obvious from its path.

---

## 9a. What a deferral rule finds that nobody expects

`tools/enforce/todo-expiry.mjs` was written to answer one question: which deferred tests became writable when a component landed. It answers a second, and the second is worth more.

**A blocker that is wrong is indistinguishable from a blocker that is pending.** A test deferred "waits on C10" when the work is actually C09's looks exactly like one legitimately waiting — for as long as C10 does not exist. Nothing distinguishes them, because both are simply not-yet.

The moment C10 landed, three such deferrals surfaced: one about glyph substitution under ASCII, one about a measurer, one about a registry — all C09's work, and C10 §10 says as much in its own out-of-scope table. Each had been mislabelled at the moment it was written, and each would have sat mislabelled until someone re-read two specs side by side and noticed.

The rule reports them because it cannot tell the difference either: it fires on *implemented blocker, test still deferred*, and a mislabelled deferral satisfies that exactly. **The fix is not to make the rule cleverer.** A wrong blocker is a claim about which component owns a piece of work, and the only thing that can settle it is a person reading both specs — which is precisely what the failure forces, at the one moment the answer is cheap to establish.

So the response to TD2 is two-branched, and both branches are ordinary: write the test, or restate what it is actually waiting for. An exemption is neither.

### TD3 — a mapped source path must exist

`COMPONENT_SOURCES` maps each component to the file whose existence means "implemented", and `defaultIsImplemented` returns false for a file that is not there. So **a mapped path that never existed exempts every deferral waiting on that component, silently and permanently** — the rule reports compliance, and the reason it reports compliance is that it cannot find the component it was asked about.

This is not hypothetical. `C07` mapped to `src/data/adapters.ts` while C07 landed as `src/data/adapters/index.ts`, so every `waits on C07` todo has been exempt since the map was written. SS26's defect, inside the machinery built to catch SS26's defect — which is the honest reason it is a rule and not a correction: the class recurs, so the check covers the class.

TD3 asserts every mapped path is a file that exists, with exceptions named and reasoned rather than tolerated — a component with no scaffold at all (C25 today) is a legitimate absence and is listed as one. It catches a mapping that was wrong when written and a mapping that a later component's own layout invalidates: C11 moving `src/presentation/table.ts` to `src/presentation/table/` to satisfy SS24 would otherwise have exempted C11's seven deferrals on the commit that made them writable.

### TD4 — a surface deferral's blocker must appear in that surface's own composition

The paragraphs above say a wrong blocker cannot be told from a pending one and that the fix is a person reading two specs. **That is true of the general case and false of one important special case**, and the special case is where both known instances occurred.

A surface deferral says "this illustration cannot be composed until C*nn* registers its kind". The surface's own spec declares the block sequence it composes to, and the surface tests already parse it. So the claim is checkable: if a deferral names C25 and the surface's sequence contains no `patch`, the deferral is wrong — not pending, wrong, and wrong on the day it was written.

Both instances:

| Deferral | Sequence | Named | Verdict |
|---|---|---|---|
| S09 §2 | `rule, rule, steps, notice, rule, table, notice` | C11 **and C12** | became writable with C11 and stayed exempt for a whole component |
| S07 §3 | S07 draws two `diff` blocks; §3 is a verdict table with no illustration at all | C25 | never had a patch region; the surface that draws one is S10 §4a |

The second is worse than the first and was found by looking once rather than by any rule. When S09's was corrected, the note here read that a wrong blocker is rarer than a missing one and that this was the first. It was the second within one component, which is the standing signal for covering the class instead of the instance.

**Scoped to surface deferrals, deliberately.** The general form — does this blocker own this work — needs to know which component owns which behaviour, and that is this document's `Declared` column rather than anything derivable. The narrow form needs only two things a surface spec already states: what it composes to, and what it says it is waiting for. TD1 checks the blocker is *known*, TD3 that its path *exists*, and TD4 that it is the *right* component. Three directions, and TD4 is the one that had no mechanism.

**The clause the blocker is read from now ends at a sentence delimiter, and that is the third incident of one shape.** Twice the parse was too wide on the left — matching the words after "waits on", then matching identifiers across the whole title — and the third time it was too wide on the right: reading to end of line meant a sentence *explaining* a correction parsed as part of the claim, so restating a deferral as "waits on L4 … C18 produces both results now" left it waiting on C18. The standing remedy was to write the explanation before the clause, which is a habit; an em dash, a period or an unmatched closing paren is a mechanism, and it keeps the multi-blocker form `waits on L4 and C20` that taking the first identifier would have broken.

### TD5 — the locator, and the half of the parse nobody had tested

The paragraph above records three incidents and calls them one shape. They are one shape, and they are all in the same **half**: what is read *after* "waits on". Twice too wide on the left, once too wide on the right. Every fix tightened the clause.

The fourth incident is in the other half — reaching the title at all — and it had never been tested in any direction. The locator was a single regex requiring a quote immediately after `it.todo(`, modulo whitespace, and it silently found nothing whenever anything else sat there. **Five deferrals were invisible to every TD rule**, which means TD0's equality, TD1's typo check, TD2's expiry and TD4's surface check all reported compliance about a corpus with holes in it.

The shape is the finding, not the regex. A comment appears between `it.todo(` and its title exactly when someone has **re-triaged that deferral and written down why** — so the rule stopped seeing precisely the deferrals that had been read most carefully. Both of C22's triage notes that ended up in that form were about local handlers: `/clear`'s and `/help`'s.

Four forms now reached, each with a fabrication:

| Form | Was |
|---|---|
| A line comment, a block comment, or a trailing comment on the call line | invisible — the five |
| `describe.todo`, `test.todo` | invisible; no instances today, and `describe.todo` defers a whole block from one line |
| `it.skip` whose title declares a wait | invisible. **Ruled a deferral** — a skip that says what it waits for is a deferral wearing a different verb, and todo-means-unwritten / skip-means-written-and-not-run is a distinction the blocker clause already makes moot. A skip with no clause names no blocker and falls out as everything without one does, so this adds a verb rather than a code path |
| A title built by `+` concatenation | **located and truncated**, which is worse |

The last is TD5 proper, and it is the one that survives the obvious verification. A concatenated title *is* found, so a count against `grep -c` agrees — while only the first fragment is read. That fragment rarely contains "waits on", so the deferral files as declaring no wait at all: exempt, and indistinguishable from a test that never claimed to be waiting. So the rule **rejects** a concatenated title rather than reading it. Joining the operands was the alternative and it is the worse one: a clause split across the join reassembles into something nobody wrote, and a rejection is visible where a truncation is not.

**The verification is two assertions, and the second is the point.** A count catches every locator miss and is blind to TD5. So the suite also asserts that nothing collected is a fragment — the half with no live subject in the tree today, which the mutation pass surfaced and which is stated there rather than left to look covered.

**A note on where the rows for new rules live.** SS and MG rows are inventoried in §4 and §3 *with their implementation*, not ahead of it — commitment 14b makes an inventoried-and-unbuilt rule fail on the commit that inventories it, which is deliberate and is the opposite of the usual spec-first order. This section is prose, so it lands with the finding; the row lands with the code.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| The rules themselves | The spec that declares each |
| Per-component test tiers | Each component spec |
| Golden frame fixtures | The surfaces |
| Conformance against the far side | A01 §6 |
| Repo tooling choice | Implementation |
