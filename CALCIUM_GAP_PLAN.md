# The partition — roadmap entries × filed findings

**Not a merge.** For each roadmap entry, which findings landing it would close; everything no
entry closes, ordered, is the gap-fix plan.

Inputs: `CALCIUM_ROADMAP.md` (45 Order entries, phases 1–2 expanded to 51 rows),
`examples/docker/TRIAGE.md` (redone at F82), `CALCIUM_COVERAGE_AUDIT.md` and `_2.md`.
Against `main` at `cfa8833`. Nothing is fixed here.

---

## Result

| | |
|---|---|
| **89 findings, 54 open** | 35 fixed, absorbed, retracted or resolved app-side |
| **6 closed by an entry** | F30 F49 F51 F81 (1.2) · F55 (1.4) · F39 (2.2) |
| **17 reframed or partial** | the entry restates the finding as a question or fixes a part — **they stay in the remainder** |
| **31 no entry at all** | 17 of them with no roadmap presence of any kind |
| **⚠ 4 entries do not earn their place** | 25, 32, 38 and the `#NN` scheme itself — F88, F89 |
| **the ordering claim, undercut** | MG24 has produced **zero** findings; the tier survives on a different argument, stated below |

---

## 0 · The test applied, and the two words that carry it

**Would landing this entry close the finding?** Not *does it mention the area*. Three verdicts:

| | | remainder? |
|---|---|---|
| **closes** | landing the entry retires the finding | no |
| **reframes** | the entry restates the finding as a question still owed | **yes**, residue named |
| **partial** | the entry fixes some instances, not the class | **yes**, residue named |

**Three entries moved from *closes* to *reframes* on the second reading**, which is the check
that decides whether this file is trustworthy:

- **1.1** — the largest entry on the list, and its own text is a question: *"what may a
  producer legitimately know, and why is width different from capabilities?"* It also records
  a counter-argument that *"must be answered rather than ignored"*. Landing 1.1 as written
  closes nothing; it converts twelve findings into one owed ruling.
- **1.3** — *"the fix is **not** three more fields. It is an audit with a rule."* An audit
  does not land F22's one line.
- **2.1** — *"mostly a documented convention, possibly one helper."* A convention does not
  touch `appendAndCommit`'s bare catch, which is F15, which is the mechanism the other five
  were seen through.

**One entry moved the other way and is worth naming.** 1.2 also owes a ruling, but it names
the answer's shape and commits to the public-type change; the constraint it must respect —
what the 1-bit rendering is — is part of landing it rather than prior to it. Marked **closes**,
and that is a judgement rather than a reading.

**And one entry cites a finding without fixing it**, which is the generous-reading trap in its
purest form: **entry 38** (`b.row`) quotes F50 — *"a column with no `flex` gets its minimum and
nothing more"* — as the precedent its width fractions should follow. It fixes nothing about
C11's columns. F50 stays in the remainder.

---

## 1 · The mapping — all 51 rows

`★` never was about a finding · `⚠` framed as a fix and closes nothing

### Phase 1 and 2, expanded

| # | entry | closes | reframes / partial | residue |
|---|---|---|---|---|
| 0 | step 8 — docker-tui packaged | — | — | ★ milestone; F2 F56 F59 F60 came *from* it and are closed |
| **1.1** | **the producer-context contract** | **none** | **F14 F43 F54 F37 F36 F28 F13 F58b F77 F85 · F24 F25** | **the ruling, taken.** F58b's and F85's is a *narrower* type |
| **1.2** | **a change axis distinct from `Tone`** | **F30 F49 F51 F81** | — | the 1-bit rendering, inside the change |
| **1.3** | the builder-surface audit | none | F22 F41 F78 F23 | the four mechanisms; F78's pair of throws is not a field |
| **1.4** | the prompt | **F55** | — | — |
| 2 | prism-tui's first surfaces | — | — | ★ and it is the only entry that can *produce* findings |
| 3 | the ML package | — | — | ★ |
| 4 | what 2 and 3 found | — | — | ★ placeholder |
| 5 | publication prep (phase 3) | — | F59, and group 7's habit | the other 13 artefact findings |
| **2.1** | the empty-block convention | none | **F15** | the mechanism; reaches neither F64 nor F67 |
| **2.2** | flags that select a rendering | **F39** | — | — · unblocks entry 21 |

### The Order list

| # | entry | verdict |
|---|---|---|
| 7 | the navigation model | ★ — subsumes several entries; closes nothing filed |
| 8 | the scroll-anchor rule | ★ |
| 9 | mermaid (text path) | ★ |
| 10 | question / menu primitive | ★ |
| 11 | markdown | ★ |
| 12 | output diffing | ★ — found by reading code, never filed |
| 13 | render caching | ★ — same |
| 14 | `cells()` ASCII fast path | ★ |
| 15 | text selection + copy | ★ — carries audit F-A (`copyMode`), which **stands at HEAD** |
| 16 | one popup | ★ |
| 17 | large blocks | ★ — its step 3 windowing finding was never filed |
| 18 | shared pollers | ★ — a correctness fix with no filed finding |
| 19 | resize coalescing | ★ — **not** F24/F25; a different axis |
| 20 | off-screen live parts | ★ |
| 21 | `--help` per verb | ★, **blocked on 2.2** — the class of group 2, unfiled |
| 22 | `b.art` — banners | **partial: F43** — the framework owns tier→capability, so this consumer stops sniffing. Residue: the class |
| 23 | selection styling | ★ |
| 24 | more default themes | ★ — ⚠ public type (`ThemeSet`), freeze-relevant, no finding |
| **25** | **ghost text** | **⚠ its headline is closed** — F-C landed in `95fedee` (PR #27). Sub-items 2 and 3 survive |
| 26 | view trace in transcript | ★ — F75's fact, but F75 is a fixed instrument finding |
| 27 | syntax highlighting | ★ — a C09 §4a regression, **never filed as an `Fnn`** |
| 28 | prompt cursor-following | ★ |
| 29 | chrome row budget | ★ |
| 30 | paste as a chip | ★ |
| 31 | completion ranking | ★ |
| **32** | **prefix-out / `defaultRoute`** | **⚠ half falsified by its own document — F89.** The surviving half is real and is not "a config field" |
| 33 | queueing | ★ |
| 34 | UX polish set | ★ |
| 35 | progress feedback | ★ — cites F29, which is fixed |
| 36 | scrollbar + edge markers | ★ |
| 37 | region separators | ★ |
| **38** | **horizontal composition (`b.row`)** | **⚠ cites F50 as precedent and fixes nothing about it** |
| 39 | theme background | ★ |
| 40 | as-you-type completion | ★ |
| 41 | typo detection | ★ |
| 42 | rebindable keys | ★ |
| 43 | images (kitty) | ★ — carries audit F-B (`imageProtocol`), which **stands at HEAD** |
| 44 | session resume | ★ |
| — | video · 3D · embedded editor · matplotlib | ★ deliberately not doing |
| | *correction 2026-09-03, this document being pinned:* **3D left this row** — F435 retracted the refusal and `plot3d` is a built form (`src/presentation/plot/`). The row above is kept as written; the cell is wrong at HEAD and this line says so | |

**36 of 51 entries close nothing, and 32 of those are fine** — they are features that were
never about a finding, which is what a roadmap is mostly for. The four ⚠ rows are the result.

**The reverse direction is the louder number: 6 findings of 54 are closed by the roadmap as
written.** The roadmap cites 24 findings and the ledger holds 89, and the gap is not
inattention — it is that most of the ledger arrived after the roadmap was drawn.

---

## 2 · The remainder, ordered

### Tier 1 — instruments, because other verdicts rest on them

**F83 · F84 — MG24's consumer definition and its scope.** No entry.

**The stated argument for this tier was wrong and the measurement is reported instead.** The
claim to check was *MG24 is the instrument several other dispositions were checked with*.
Measured:

| | |
|---|---|
| findings MG24 produced | **0** — it appears in `FINDINGS.md` only inside F83 and F84 |
| findings in group 2, the class MG24 exists for | 12, **all** found by writing docker-tui |
| dispositions resting on MG24 having **fired** | 18 — 15 `UNCONSUMED_MEMBERS` rulings, 3 C24 export drops |
| of those, falsified by F83 or F84 | **0** — both are false-*negative* defects |
| dispositions resting on a **clean** MG24 result | **1** — the first audit's pass 4 |

**So "instruments first" does not survive on the argument I would have given it.** Nothing
already decided is unproven. What is true is narrower and still sufficient: the rule's clean
result is the evidence *future* dispositions will rest on, three-quarters of its subject is
invisible to it (798 `export type` members against 280 watched), and it has caught none of the
twelve findings in its own class. **A rule with a perfect record of not firing is
indistinguishable from a rule that works** — F82's sentence about a counter, applied to a
scope. That is why it goes first, and the tier is one argument thinner than it reads.

**Group 9 — the instrument, 7 findings, no entry.** F79 and F86 open. The disposition is
already ruled — *every instrument gets a fixture it must reproduce* — and audit 2 covered
**1 tool of 11**. Same class as F83/F84 one layer out: the apparatus every other finding was
measured through.

### Tier 2 — public-type changes, because the freeze makes them expensive

| | ⚠ | |
|---|---|---|
| **F33 F34 F18 F50** | C04 | **group 3 has no roadmap entry at all.** A block cannot express what the surface needs — distinct from 1.3, which is about builders reaching blocks that already can |
| **F80** | C05 | `interactive` is a property of the verb; `docker run` has two terminal contracts per invocation |
| **F21** | C23 | the action model, unreachable from a keystroke. Entry 42 and the navigation model both **depend** on it; neither closes it. The roadmap's todo-list entry says *"build after that lands"* |
| **1.1's residue** | C07 · C24 | the ruling — see tier 3, where its consumer count puts it |

### Tier 3 — correctness with consumers, by independent consumer count

| consumers | | |
|---|---|---|
| **12** | **1.1's ruling** | the largest single item on this list, and the entry exists. What is owed is the answer, for all three producer kinds at once |
| **4** | **1.3's residue** | F22 F41 F78 F23 — the audit rules the shape, the mechanisms are still absent |
| **1, and it is the mechanism** | **2.1's residue — F15** | an invalid document produces no entry, no error, no clue. Five instances were fixed; the thing that hid them was not |
| **1** | **F67** | below 16 rows the shell draws nothing, says nothing, stays alive. No entry, and C02 I7 is the argument with a different subject |
| **1** | **F43's residue** | entry 22 removes this consumer's need; the next consumer wanting capabilities for a non-art reason still cannot reach them |

### Tier 4 — correctness without a consumer

**F28** (the live parts just declared — no surface has needed it) · **F64** (`b.logs` has no
consumer and a document claims otherwise — a claim, not a feature) · **F8** (omitting `env`
stops the shell opening where the spec says it degrades) · **F31** · **F53**.

### Tier 5 — the rest

- **Group 12 — F69, F73.** Time-based assertions under contention, Calcium's own suite. The
  guard stays on the asymmetry, not the odds, and both measurements are already recorded.
- **Group 7 — 14 artefact findings.** Entry 5 reaches the habit through *every README example
  run from the tarball*; the other thirteen are discipline.
- **Group 10 — 5, all disproved.** Method. **This does not enter the gap-fix plan** — see §4.
- **F87 F88 F89** — filed by this pass; F88 and F89 are about the roadmap itself.

---

## 3 · What the mapping found about the roadmap

**1.1's scope is wider than either document states.** Its own text names *"`LiveSpec.render`
has neither"* — which is F24 and F25, the triage's group 6, a separate group ranked separately.
Twelve findings behind one ruling, not ten. Neither the triage nor the roadmap says so, because
each was grouped by its own axis.

**`docs/ROADMAP.md` is superseded, not in conflict.** Its four do-first entries all sit inside
`CALCIUM_ROADMAP.md`'s phases 1 and 2 — 1 → 1.1, 2 → 1.3, 3 → 2.1, 4 → 1.2. It cites 43
findings against the newer file's 24 and is the better record of *why*; the newer file is the
better record of *order*. **3b's answer is retire and point**, not reconcile two rankings — and
the citations worth carrying across are the 43, not the ranking.

**Three defects in the roadmap as an artefact**, all filed:

- **F88** — 12 of 31 `#NN` cross-references resolve to the wrong entry after a renumber that
  did not propagate. Several are dependency statements, so a reader following them builds in
  the wrong order.
- **F89** — Order entry 32 carries *"CommandPolicy is exported and unreachable"*, which the
  same document corrects forty lines earlier and which measurement at HEAD contradicts:
  `TuiConfig.commandPolicy` is threaded through four files.
- **F87** — the triage's partition claim, found while deriving this file's inventory.

---

## 4 · Where the method findings go — decided

**Groups 7 and 10 do not enter the gap-fix plan. They belong in `CLAUDE.md`.**

The gap-fix plan is a list of changes to code and to rules; a method finding has no diff.
`CLAUDE.md`'s **Always** section is already where *ask where a settled claim is written down*
lives, and group 10's five disproved findings are that rule's evidence. Group 7's fourteen are
the same shape one artefact out.

**What 3b should carry there, and only this:** group 10's instrument has now **disproved three
findings and produced two**, which makes it the highest-yield habit in the toolkit and is worth
stating as a number rather than a paragraph. It found F89 in this pass, which is a sixth
result.

**Group 12 stays in the plan** despite being about the suite rather than the framework, because
its disposition is a guard with a cost and both its measurements are recorded — that is a rule,
not a habit.

---

## 5 · What this partition cannot see

**Required, not optional.** The first audit's equivalent section is why step 2 existed, and the
triage's is why this one does.

- **A gap nobody filed is invisible by construction.** The remainder is the ledger minus the
  roadmap; anything in neither cannot appear. **This is not hypothetical and the count is
  large**: entry 12 (output diffing), 13 (render caching), 17's block windowing, 18 (shared
  pollers), 21 (`usageBlocks` uncallable) and 27 (the C09 §4a regression) are all real gaps
  with no `Fnn`, and every one is marked ★ above — *never was about a finding* — when the
  honest reading is *was never filed as one*. **F81 spent a whole step as a source comment**,
  which is that class with a measured instance and the reason the ★ mark should be read as a
  question.
- **This is a fifth document citing four others**, which is group 10's exact shape pointed at
  itself. Two of its inputs — the triage and the roadmap — were found wrong about themselves
  *while it was being written*, by resolving their claims rather than reading them.
- **The "closes" verdicts are a judgement and 1.2 is the one to challenge.** It is marked
  *closes* on the grounds that its ruling is uncontested; if the 1-bit rendering turns out to
  be the hard part, 1.2 joins 1.1 and 1.3 and the closed count drops from 6 to 2.
- **Consumer count ranks tier 3 and cannot produce a consumer.** The triage's own limit,
  unchanged. `examples/minimal` hit F58's wall on its first compile; nothing in a sorted list
  does that.
- **Nothing here reads prose against behaviour** — the standing gap across all three passes,
  and now demonstrated a third time: F89 is prose against behaviour, and it was found by hand
  because no instrument reaches it.

---

## 6 · Step 3b

**Done — `CALCIUM_FIX_PLAN.md`.** The blind spot below was filed first, as F90–F93, so the
plan was built from a complete ledger: 96 findings, 58 open. Two of the six did not survive
transcription, which is recorded there. Three things, in this order, and the first is not the
largest:

1. **The instruments** — F83, F84, and a fixture per instrument. Cheapest, and every later
   verdict is measured through them.
2. **The ruling 1.1 owes**, for all three producer kinds at once. Twelve findings, two public
   types, and the counter-argument answered rather than ignored.
3. **The roadmap rewritten from this partition** — retire `docs/ROADMAP.md`, carry its 43
   citations, fix the `#NN` scheme or remove it, and correct entries 25, 32 and 38.

`CALCIUM_ROADMAP.md`, `CALCIUM_PASTE_DESIGN.md` and `CALCIUM_POPUP_DESIGN.md` are committed
with this file so the mapping's subject is in the tree and SP5 reaches their citations.
`CALCIUM_COVERAGE_AUDIT 2.md` is **byte-identical** to `CALCIUM_COVERAGE_AUDIT.md` — a copy
artefact, not a divergence — and is not committed.
