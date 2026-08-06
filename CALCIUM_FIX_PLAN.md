# The fix plan

Built from `examples/docker/TRIAGE.md`, both coverage audits, `CALCIUM_GAP_PLAN.md`, and the
ledger completed at F93. **96 findings, 58 open.** Against `main` at `80bd50b`.

Ordered by the triage's own rule — a public-type change sorts above a larger group that is
not one, because the freeze makes the first expensive afterwards and cheap now.

---

## What filing the six changed

**Two of the six did not survive being written down**, and the instruction was that filing
was transcription rather than investigation. It was, for four of them. The two:

- **`usageBlocks` has a caller.** `mapping.ts:237`, inside `if (raw.exitCode === 2)`. The
  roadmap says *"no caller in `src/`"* and its Order entry compresses that to *"uncallable"*.
  The body two paragraphs down says the true thing. **F92 is filed at the narrower gap** —
  only an exit code can ask for it — which is still real and is F39's second consumer.
- **`refresh.ts` has "no reference to the viewport"** is loosely false and substantively
  true: it imports `TranscriptStore` from under `viewport/`, and holds no visibility check of
  any kind. Filed precisely in F91.

**That is the third pass in a row where a summary overstated a body it sat above** — F86,
F89, now F92. The pattern is stable enough to name: **compression is where the falsification
enters**, because a summary drops the qualifier that made the sentence true.

**And the ranking moved twice.** F92 gives F39 a **second independent consumer**, which is
this project's threshold — F39 leaves the "one consumer, absorbed by a shim" position it has
held since step 5. F90 has no public type and every consumer, which under the triage's rule
puts it below the type changes and above everything else.

---

## Tier 0 — the instruments · ~1 day

Nothing else is measured except through these, and both are cheap.

| | closes | change |
|---|---|---|
| **MG24's consumer definition** | F83 | Count a consumer **outside the declaring component**, not outside the declaring file. A02 Seam 4 is about a component complete on its own side; the implementation is the *same* side. Expect the 28 to resolve into allow-list rows or removals — `HistoryStore.rerun` has no caller at all |
| **MG24's scope** | F84 | Walk `export type` object members as well as `export interface` — 798 against the 280 watched. **Land the scope, then triage the contents**: 0 are dead outright and 3 glyph slots survive filtering, so this is a guarantee rather than a defect list |
| **A fixture per instrument** | group 9 (7) | Known bytes in, stated frame out, committed. `screen.py` first — F86 leaves it with one falsified mechanism and one reproducible defect. **11 tools, 1 covered** |

**Acceptance is the counters, not the exit status.** Each rule reports what it walked;
a flat count against a widened scope is the vacuity signal. F82 is why that sentence is here.

---

## Tier 1 — before the freeze · the public types

### 1 · The producer-context ruling — 12 findings, ⚠ C07 · C24

F14 F43 F54 F37 F36 F28 F13 F58b F77 F85 · **F24 F25**

**The largest item on the list, and the roadmap has it as a question.** A plan owes the
shape, so here is the proposal rather than a restatement of the question.

**Split *what a producer may know* from *what a producer may decide*.** The recorded
counter-argument — `AdapterContext.width` says *"never a layout decision — C11's"* — is about
**authority**, and it has been answered as though it were about **knowledge**. Withholding a
fact does not prevent the decision; it produced five apps' worth of duplicated modules
instead, which is the measured outcome.

- **One `ProducerContext`** carrying width, capabilities, a document validator, and height
  **where a bound exists** — a pushed view's producer is defined by the region and has no
  other bound, which is the reply the triage already records. `LiveSpec.render` gets it too,
  which is F24 and F25 and is why this ruling is twelve findings rather than ten.
- **Say in the spec that layout authority stays with C11**, and do not enforce it by
  omission. The framework does not police a producer that computes with width today.

**F13, F58b and F85 are the other half and their fix is a *narrower* type**, which is the
direction nobody would guess from the group's name:

```ts
Omit<RenderContext, "measureChild" | "renderChild">     // the registry overwrites both
meta: Pick<DocumentMeta, "exitCode" | "durationMs" | "verb">   // the three honoured keys
```

Supplying a discarded field should **fail to compile rather than fail to matter**. Today an
adapter computes seven values thrown away and one caller supplies a stub that throws.

**Freeze-critical.** Three producer kinds, two public types, and every consumer after
publication pays a breaking change.

### 2 · A change axis distinct from `Tone` — 4, ⚠ C04 · C09 · C10

F30 F49 F51 F81. Four surfaces that knew nothing of each other. **Decide the 1-bit rendering
first, not last** — `/diff` shipped `+ - ~` as text and `/build` shipped a word in a column,
independently, which is the answer arriving twice before the design does.

### 3 · A block cannot express what the surface needs — 4, ⚠ C04, **no roadmap entry**

F33 F34 F18 F50. `Comparison` is two of the four — column labels and a verdict glyph — and
with F30 that is three questions about one block. **Rule them together.** F50 is C11's column
flex; entry 38 cites it as precedent and fixes nothing about it.

### 4 · Everything else that changes a public type

| | closes | |
|---|---|---|
| `interactive` as a predicate over the invocation | **F80** ⚠ C05 | one slot cannot describe `docker run`'s two terminal contracts. Not a per-flag field — C05 already rejects that shape for `view` |
| `FlagDef` gains a rendering flag | **F39 · F92** | **two consumers now.** `--raw` reached docker and it exited 125; `--help` would be forwarded the same way |
| the action dispatch route | **F21** ⚠ C23 | entry 42, the navigation model and todo blocks all *depend* on it and none closes it |
| the builder-surface audit | F22 F41 F78 F23 ⚠ C04 | an audit with a rule, then the four mechanisms. **F78's pair of throws is not a field** — `b.live` throws with neither arm and throws with both, policing a choice where one option is inert |
| the prompt and `loading…` | **F55** | C22 §6 text with nothing between it and the terminal, on every frame, on the line the reader types into |

---

## Tier 2 — correctness, no public type

### 5 · The render chain — F90, four stages, in order

**Every consumer hits it and none of it is freeze-relevant**, which is exactly why it sorts
here rather than first. Do not reorder: stage 2 alone converts continuous lag into one long
stall.

1. **Output diffing** — last frame as rows, write only what differs. `contaminated` is
   already the invalidation story.
2. **Render caching** on `(entryId, rev, width)` — the same key `measure` already uses.
3. **Window the block** — `windowPatch` proves the pattern in a pushed view; the transcript
   has no equivalent. Per divisible kind; the plot does not divide and that is permanent.
4. **Cap with a marker** — `MAX_ROWS` is the fallback adapter's alone.

**Acceptance is a frame-read**: type into a 5,000-line diff and watch. A microbenchmark that
improves while the frame stutters has measured the wrong thing.

### 6 · Shared pollers — F91

**Filed as a correctness fix that happens to be an optimisation**, and the ordering follows:
two views of one source holding different numbers is the defect; three subprocesses is the
symptom. `source → derivation → part`, two levels and not a reactive graph. The visibility
seam falls out of it — `refresh.ts` has no visibility check, so a scrolled-off `/stats`
spawns a process every two seconds for nobody.

### 7 · Grammar registration — F93

Ship the 24-grammar mainstream set (**180 KB measured**, not 9.3 MB) **and expose
registration**, which is what C09 §4a promised and never built. The registration export is
public surface, so it is the one tier-2 item with a freeze argument; it is additive.

### 8 · Absence distinguishable from failure — F15, F67, F64

**F15 is the mechanism the other five were seen through**, and fixing five instances did not
fix it: `appendAndCommit`'s bare catch is documented and deliberate, and the consequence is
that a malformed document is indistinguishable from a verb that did nothing. **F67 is the
first instance where the framework itself says nothing** — 100×12 produces zero bytes on both
channels with the process alive. C02 I7 is the same argument with a different subject.

---

## Tier 3 — smaller, real

F8 (omitting `env` stops the shell opening where the spec says it degrades) · F31 · F53 ·
F79 and F86's `screen.py` repair, which tier 0's fixture makes checkable.

---

## Tier 4 — method, and it does not belong in this plan

**Groups 7 and 10 go to `CLAUDE.md`.** Nineteen findings with no diff between them. What
should land there, and only this:

> **Going to find where a claim was written down** has now disproved three findings and
> produced three — F58b, F66's replacement reason, and F92. **Compression is where the
> falsification enters**: F86, F89 and F92 are all a summary that dropped the qualifier
> making its body true.

**Group 12 stays out of both** — F69 and F73 are a guard with two recorded measurements,
which is a rule and already written down.

---

## Sequencing

```
tier 0   instruments                     ~1 day, and everything after is measured through it
tier 1   the freeze work                 producer context · change axis · block expressiveness
                                         · F80 · F39+F92 · F21 · builder audit · the prompt
—        prism-tui's first surfaces      the second consumer, before the freeze not after
tier 1b  what prism-tui finds            the same work, second round
—        PUBLISH 0.x
tier 2   render chain · pollers · grammars · absence
tier 3   the rest
```

**prism-tui sits inside tier 1 deliberately.** Every finding a second consumer produces after
publication is a breaking change with users attached, and docker-tui produced 96 by being
one. The roadmap's own strongest argument for it is that `LiveSpec.stream` — F78, declared
and validated and never driven — gets its first real consumer from a training job streaming
metrics, which docker-tui structurally could not provide.

---

## What this plan does not do

- **It does not rewrite `CALCIUM_ROADMAP.md`.** That is real work with three known defects
  filed against it — F88's twelve wrong cross-references, F89's entry 32, and entry 25 whose
  headline closed in PR #27 — and it should follow the tier 0 and tier 1 rulings rather than
  precede them, because the rulings are what the entries will say.
- **It does not retire `docs/ROADMAP.md`**, though the partition established it should be:
  all four of its do-first entries sit inside the newer file's phases 1 and 2. Its 43 finding
  citations are the part worth carrying across; the ranking is not.
- **It does not size anything past tier 0.** Every tier-1 item is a ruling before it is a
  diff, and estimating a ruling is how a ruling becomes a guess.
- **It cannot see a gap nobody filed.** Six were filed this step from one document's prose,
  and the honest expectation is that reading `session.ts` against `paint.ts` — which is what
  produced F90 — has an equivalent in components nobody has read that way.
