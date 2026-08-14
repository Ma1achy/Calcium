# Calcium

A framework for building terminal user interfaces over JSON-emitting CLIs.
The specs are the contract: 25 component specs, 4 architecture documents.

---

## Run everything in the devcontainer

`node`, `npm`, `make`, tests — all of it, inside `.devcontainer`. Never on the host.

Four reasons, and the first has already bitten:

- **Node parity.** Ink 7 requires Node ≥ 22. A host on 20 gets different results
  from CI, and `EBADENGINE` is a warning people scroll past. `engine-strict=true`
  turns it into an error, but only inside a correctly built container.
- **`node-pty` needs a build toolchain.** C01–C03's tier-5 PTY tests will not run
  without it, and a missing toolchain looks like a failing test rather than a
  missing dependency.
- **Reproducibility.** "It passes locally" means nothing if locally is not what CI
  runs.
- **Blast radius.** `npm install` and arbitrary scripts belong in a container, not
  on the host.

First command in any session:

    node --version        # expect v22.x — if not, rebuild the container

**This does not contradict A04 §4.** That section says the devcontainer is never
the *supported path*, and it means for consumers: R01 R4.4 commits that a clean
clone plus `npm install` gives a working shell with no container, and that is the
reuse claim. It says nothing about how this repo is developed. Contributors and
agents use the container; consumers must not need it.

---

## Layers

```
L0 foundation    terminal/ · data/     (two halves — see below)
L1 presentation  presentation/
L2 viewport      viewport/
L3 interaction   interaction/
L4 shell         shell/
```

**Imports go DOWN only.** Never up, and **never cyclically within a layer** —
A02 §1's wording, which this line used to render as "never sideways". Sideways
edges inside L1 are required rather than tolerated: C11 and C12 both import C09's
paint helpers and C10's tones, and C11 imports C12's `sparkline` for a table cell.
A rule the tree must break is a rule people learn to ignore. The enforceable
version is acyclicity, and it is what MG1 and MG22 implement.

**L0's two halves never import each other.** `terminal/` knows nothing of view
models; `data/` knows nothing of terminals. That independence is what allows them
to be built in parallel, and it is the rule most easily broken by accident.

If a component needs something from above, **L4 orchestrates it** — see A02 Seam 4.
That rule has already caught four attempted violations during specification.

---

## Never

Each of these produces code that compiles, passes review, and is wrong.

- **Read a clock** outside `shell/session.ts`. It is injected as `() => number`.
- **Read `process.env`** outside `terminal/capabilities.ts`.
- **Read the terminal's width** outside `terminal/lifecycle.ts`. It is handed down. Width
  is the axis that wraps, and a wrapped line scrolls the alternate screen — the one
  failure that corrupts state the application can no longer see. C01 I12 covers the
  signal path; nothing covers the frame path, and C01 §5 says so.
- **Embed a colour.** A block names a palette slot; C10 resolves it.
- **Write an escape sequence** outside `terminal/escapes.ts`.
- **Use `.length` for display width.** Use `cells()` — the same implementation the
  measurer uses, or measurement drifts.
- **Let `measure` see anything that animates.** Appearance animates; geometry never does.
- **Add a dependency** without a row in `DEPENDENCIES.md`.
- **Add an export** nothing consumes.
- **Commit a frame** from L1, L2 or L3. L4 does that.

---

## Always

- **Six test tiers**: unit, contract, edge, integration, e2e, fail-on-revert.
- **A fail-on-revert test names the change that makes it fail**, not just the assertion.
  "Removing the idempotency guard → T3.14 fails" is the form.
- **`make enforce` before opening an MR.** Five seconds. It is A03 executed.
- **An edit script asserts every replacement matched.** `assert old in s` before every
  `.replace()`, and a script that reports success having changed nothing is a failure.
  Twelve invariants across four specs were lost this way — the commitments landed and
  the invariants silently did not — and later an `SS` rule never reached `SCANS` while
  `make enforce` stayed green, because the anchor named a rule that is inventoried and
  unimplemented. Both scripts printed `ok`. This is the fabricated-violation discipline
  applied to the tool that writes the rules, which is where it was missing: ask whether
  the change fired, not whether the suite is still green.
- **Walk the component by hand before implementing it**, as a named step in the plan.
  For a renderer, draw the figure; for a store, step a sequence — append, patch, evict,
  settle, clear — and assert the *whole* state after each step. It is not a courtesy
  extended to components that look tricky: it has found something on every component
  it has been run against, and the two classes it catches are caught by nothing else.
  A03 §2 records three classes, and each invariant constrains one operation while none
  constrains the history — so all three are invisible to a reader checking statements
  one at a time. **The rule is right and the moment is missing**: C12's downsampling,
  C25's height, C13's `overCap`, C14's cache and index. **Deltas read as state**: C13
  emits two changes for one call and C14's handler ran against a half-applied store,
  producing a blank screen that every assertion passed. **A citation resolving against
  the wrong invariant**, which no mechanism can catch — `docs/COMMITMENT_INVARIANT_AUDIT.md`
  §Fourth pass says why one should not be built.
  **C16 is the measured case: seven defects from two artefacts on one component, six of
  them invisible to a reader checking statements one at a time, and all seven found
  before any code existed.** The Ctrl-C rung table found three — a rung no state could
  construct, an order contradicting A02 §2, and a missing rung that made the ladder
  answer wrongly and silently. The dispatch trace found three — the `global` fallback
  ignoring modality, the ladder being a second priority list at all, and an arming
  machine that answered for one event kind of three. The seventh fell out of applying
  the first ruling. Every one would have been a rewrite if found after the build, which
  is the argument for this being scheduled rather than diligent.
  **Index the artefact by rule interaction, not by input coverage.** This is the method
  behind all three walks and it is now four for four: C16's rung table takes the rows
  where two rungs could both apply, C17's edit trace the sequences where two coalescing
  clauses meet, C18's classification table the inputs where two classification rules
  meet, C19's sequence trace the events where a request is in flight and something else
  happens.

  **Rule interactions come in two kinds, and the two artefact shapes catch different
  ones.** This is the second half of the principle, and C19 is what forced it.

  - A **sequence trace** finds *event-mediated* interactions: two rules that meet
    because something happened in between. C16's rung table, C17's edit trace and
    C19's §8a are all this shape.
  - A **classification table** finds *structural* interactions: two rules that both
    hold at rest, with no event between them. C18's §8a is this shape.

  **C19 needed both and had one.** Its `--flag=value` defect is a structural
  interaction — "the engine filters by prefix" meets "a flag value is half of a token"
  — and a trace indexed by events cannot reach it however many rows it has. The menu
  came back empty and no assertion about a source would have shown why. C18's table
  would have caught it, and C18's table was already in the repo.

  **An artefact can be correct about the interaction it found and wrong about a
  mechanism it assumed existed.** C23 §8a A4 found that a stall notice outlives its
  condition — a real interaction, and the trace's job. Its ruling said *settlement
  removes the notice*, and `ViewPatch` has no delete and should not have one. The
  assumption came from §3b's prose, which described one moment twice: *replaced on the
  next real patch **and removed if output resumes**.* Only the first half was ever
  expressible, and the walk inherited the second. No index by rule interaction surfaces
  that, because the flaw is not between two rules — it is a verb the prose uses and the
  layer below does not have. So when a ruling names an operation, check the operation
  exists before the ruling is written down; the finding survives either way, and only
  the remedy has to change.

  **Two instances fitting a rule is not evidence for the rule — it is the minimum for
  noticing one.** C13's patch gate was re-founded three times. `settle(id, doc)` and
  `op: "expand"` both looked like *view state versus data*, and the classification held
  because both happen to be view-state-ish. The third case broke it: a refusal notice
  **is** data, so no partition of the operations could have covered it, and the axis was
  wrong rather than the classification incomplete. The right axis was **who is writing**
  — the far side, or the shell — which only became findable by stopping at the third
  instance and asking instead of adding a second arm. A rule inferred from two cases has
  been tested against one, and the cheapest moment to discover that is before the code
  that assumes it.

  **And when a ruling chooses to throw, the walk asks what the throw leaves behind.**
  Both artefact shapes index rule interactions on the **accepted** paths — which rules
  could both claim a cell, which sequences produce a contradiction. The rejection path
  is where a decision leaves state, and neither shape asks about it. A throw mid-
  operation abandons whatever the function had already mutated, and the invariant that
  forbids the resulting state usually lives in a different component from the decision
  that produced it. C13's `settle(id, doc)` is the measured case: ruling that an invalid
  document throws rather than returning was correct, and it created a way to leave an
  entry **unpatchable and unsettled** — a state C23 I9 says cannot exist, two components
  away from the choice that could produce it. Nothing in the ruling implied it and no
  row of either artefact covered it.

  So the artefact's *shape* is a decision, not a consequence of the component looking
  like a state machine. Ask which kinds of interaction the component has before
  choosing: a component with state and structure needs a trace **and** a table, and
  taking the trace alone because the state machine is the obvious thing is how the
  structural half goes unexamined. A row governed by one rule is a restatement of that rule and finds nothing;
  every one of the eleven pre-code defects across those three components lived in a
  cell where two correct statements overlap. That is also why they were invisible to
  review — a reader checks statements one at a time by construction, so a suite indexed
  by inputs tests each rule against itself and agrees.
  Where the component composes a frame, **read the frame, not only the numbers**: an
  arithmetically self-consistent viewport can still be describing a different document
  than the one it holds. And a fixture must be shown to respond to the thing under test
  before it is asserted against — `test/support/README.md` carries that rule and the two
  instances that produced it.
- **Mutate before trusting a green suite.** A test file is not verified by passing;
  it is verified by breaking the thing it covers and watching it fail. Every module
  in C16 was mutated on landing — the priority order swapped, the arming machine
  moved into a handler, the paste window turned into a gap timer, `/help` given its
  own copy of the table — and **four defects came out of it**, none visible from a
  green run. Two of them were in tests that had just passed sixteen and ten
  assertions respectively. A mutation that fails nothing is a finding about the
  tests, not a licence.

  **And sometimes about the spec — this is A03 §2's vacuity class arriving in prose.**
  A03 §2 is written about rules: a rule with nothing to be wrong about passes exactly
  like a rule that is satisfied. The same thing happens to a sentence. C19's §7 said
  the spinner's stamp is taken "per source call, not per sequence", and swapping the
  two fails nothing, because a source call begins synchronously inside `request`. The
  sentence named a distinction that does not exist, so it forbade nothing while reading
  as though it forbade the defect — and a reader could satisfy it exactly while holding
  the single overwritten stamp it was written against.

  Review cannot tell the two apart, because both read as correct. **The mutation pass
  is the only thing that asks a sentence whether it can be violated.** So when a
  mutation fails nothing, ask which artefact it indicts before rewriting the test, and
  prefer wordings that name the observable mechanism ("the earliest call still in
  flight") over ones that name where a value is computed.

  The figure that argues for the whole discipline is C16's: **seven defects from the
  by-hand walks before any code, four more from mutation during it, three
  enforcement rules changed shape under the pressure, and one new rule that found
  three further instances in shipped code on its first run.** Eight spec commits
  before a line of implementation looked disproportionate at the time, and every one
  of those seven pre-code defects would otherwise have been a rewrite.

- **Ask where a settled claim is written down.** This is the sixth blind spot and it is
  the only one about the *record* rather than about an artefact — every other instrument
  checks a thing that exists. The frame-read checks output. The mutation pass checks
  tests. The audit checks code. **Nothing checks whether a belief has a source.**

  **A claim repeated across steps acquires the authority of a ruling without ever having
  been one.** docker-tui's frame-read #5 was carried through four steps as a stated
  impossibility — *docker refuses to remove an image a running container references and it
  cannot be forced* — and re-stated each time as *already recorded, keep it recorded*.
  Going to find the record turned up nothing, so it was measured instead: `rmi` does not
  refuse, it untags without `-f` while the container runs, and the read was reachable the
  whole time. Running it, the surface **worked**, because the app resolves the image by
  digest rather than by tag.

  **Wrong in both directions, which is the shape to watch for.** It was not impossible for
  the reason given, and it *was* impossible for a reason nobody had stated — a container
  pins its image blob by digest for as long as it exists, so the reference cannot dangle.
  The old reason would be falsified by any docker release changing `rmi`; the real one only
  by a container outliving its own image. Twenty minutes to check. FINDINGS F66.

  **The second instance came from the other direction: not one plan, but four documents.**
  F58 said `?? 0` reports a signal death as a clean exit, and it was written in FINDINGS,
  ROADMAP, C24 §8a and R01's table — each citing the situation rather than a measurement.
  It was one commit from widening `DocumentMeta.exitCode`, a public type, when measuring
  showed the registry overwrites `exitCode` on every route: an adapter returning `999`
  yields `0`, and `SIGTERM` already yielded `143`. **Repetition across documents is not
  corroboration**; four restatements of an unmeasured claim are one unmeasured claim.

  Wrong in both directions again, and again concealing a real defect nobody had stated —
  the adapter's return type demands ten `meta` fields and the registry honours three, so
  seven are computed and thrown away. That is F58b, and its fix is a **narrower** type
  where the old finding asked for a wider one.

  **Watch for a conflation rather than a mistake.** F58's second premise read the
  *container's* exit code — 137, a field in the payload — as the *CLI's*, which is 0.
  Both readings are about "an exit code", nothing in the prose forced a choice, and that
  is how it survived four documents and two authors.

  So: when a claim is about to be carried into another step, ask which file holds it. If
  the answer is *a previous plan* or *several documents that cite each other*, it is a
  belief and not a ruling, and the cheapest moment to find that out is before something is
  built on it.

  **And the answer can be *no file at all*, which is the strongest form and reads as the
  weakest.** F161 is the measured case: a shared mark with four named consumers, one of them
  said to ship, cited against a real finding — and the character it proposes is in no file in
  the repository. **A count, a finding number and a shipped instance are what a ruling looks
  like from outside**, and all three can be present with nothing behind them. Going to each
  of the four consumers, none could take the mark: one already has the slot, one is text
  inside a `code` block and would need a block-kind change first, one has no renderer at all,
  and the fourth was a homonym — a log *level* named `trace`. **A count of consumers is an
  argument only if the consumers share a shape.**

  **The instrument's running total, because a habit that costs twenty minutes deserves a
  number**: it has now **disproved three claims and produced four** — F58b, F66's
  replacement reason, F92 and F161. It is the only one that checks the *record* rather than an
  artefact; the frame-read checks output, the mutation pass checks tests, the audit checks
  code.

  **And where to point it: compression is where the falsification enters.** F86, F89 and
  F92 are one mechanism three times — a summary that kept a body's claim and dropped the
  condition making it true. F86's finding named a mechanism it never ran; F89's retraction
  never reached the Order list that cited it; F92's *"no caller in `src/`"* sat above a
  body correctly saying *"it exists as the far side's usage-error path"*. **A claim is
  falsified by being summarised, not by being wrong**, which is why the summary is where
  to look — the body usually still reads as correct, and does not have to be re-derived to
  see it. **Read the abstract against its own section before reading the section against
  the code.**

- **A deferral names a condition and nothing watches it.** *"Until C17's `cursorCell` is
  threaded through"* is a good comment — it names the simplification, the blocker and the
  cost, which is everything a reader needs except the day it stopped being true.
  `cursorCell` had existed for some time, was on the editor's public interface, and was
  **read forty lines below the deferral in the same file**; two shipped defects lived in the
  simplification it was still excusing.

  **The instances are of three kinds and no instrument reaches more than one** — a code
  comment (`paint.ts`), a roadmap row (25's *do ranking first*, whose ranking landed), and a
  chain of citations (6.2's value set, deferred three times and answered by finding 21
  already built). A rule is not obviously buildable: the condition is prose, and matching
  *"until X is threaded through"* against *X exists* is the citation-resolves-against-the-
  wrong-thing class the audit argues against automating.

  So it is a habit rather than a gate: **a deferral states its blocker as a symbol, and
  picking up the entry begins by grepping it.** Grepping `src/` for forward-looking
  deferrals returns one line today, which is the number that makes the habit cheap.

- **A correct sentence justifying the wrong decision survives being read carefully.**
  MG24 was scoped to `export interface` because *"a type alias is structural and can be
  satisfied without being named"* — which is **true**, about satisfying a type, and
  irrelevant to consuming a *member* of one. The distinction was real, correctly stated,
  and not the one the rule needed, so the scope excluded three-quarters of its subject
  while reading as deliberate. Twenty-five components went past it.

  **This is harder to catch than a wrong sentence**, because review checks whether a
  justification is true and this one is. The question that reaches it is *does this
  sentence constrain the decision it is attached to* — the same question the mutation pass
  asks of a test, and F84 is the measured case at 276 members against 1055.

- **A citation reads as coverage, and that is how a finding gets planned once and fixed
  never.** The sibling of the rule above, and it fails in the other direction: not a claim
  weakened by compression, but a *reference* mistaken for a *disposition*. Roadmap entry 38
  quotes F50 — *a column with no `flex` gets its minimum and nothing more* — as the precedent
  its width fractions should follow, and fixes nothing about C11's columns. A partition
  reading generously drops it; a reader skimming for coverage sees the number and moves on.

  **So the test is never *does this mention the finding*. It is *would landing this close
  it*** — and the three answers are **closes**, **reframes** (the entry restates it as a
  question still owed) and **partial** (some instances, not the class). Only the first
  removes it from the remainder, and the residue is named in the other two.
  `CALCIUM_GAP_PLAN.md` is that test run over 51 entries: three that read as fixes are
  questions, and **six findings of fifty-four are closed by a document citing twenty-four.**

- **Where the findings actually came from, measured over one step.** Eleven findings across
  docker-tui's step 8, and **not one came from a test written to look for it**:

  | how it was found | count |
  |---|---|
  | reading a frame | 4 |
  | writing a second consumer from the public surface | 3 |
  | the mutation pass | 2 |
  | an untouched file appearing in a diff | 1 |
  | asking where a settled claim was written | 1 |

  **Every instrument that found something is a way of looking rather than a thing
  asserted.** That is the case for the whole discipline in one table, and it is why the
  scheduled steps are *walk*, *read the frame*, *mutate* — verbs — rather than a list of
  properties to assert. A suite indexed by what you already suspect tests each rule against
  itself and agrees.

  The two rare ones are worth naming because nothing else reaches them. **A file you did
  not touch appearing in a diff is evidence about a mechanism you did not know was
  running** — `src/main.ts` arrived with a mode change and no content change, which is how
  it emerged that npm chmods a `bin` target and that a missing shebang, not the mode, was
  the whole of F56. And the sixth blind spot above is the other.

- **A guard whose trigger did not fire keeps its place on asymmetry, not on odds — with
  both figures and the date.** `make fixtures` starts a load generator, and `make
  load-down` exists because a busy container once made tier 5's `T5.3a` fail. Re-measured
  when the target was written, it **did not reproduce**: tier 5 ran green with the load up.

  Both measurements are real and neither cancels the other. Deleting the guard on the
  strength of the second is wrong, and so is leaving a comment that claims a reproducible
  failure — **a justification the next person checks and cannot reproduce is a justification
  they delete.** What keeps it is the asymmetry: running it costs a second, and a timing
  failure diagnosed as a code change costs a session, and did. Record both numbers, say
  which argument the rule rests on, and it survives being checked.

- **British English** in prose and identifiers: artefact, behaviour, normalise, colour,
  initialise, serialise.

---

## The spec is the contract

Specs live in [`docs/`](docs/). Start with [`docs/README.md`](docs/README.md) —
it says what to read first, what is authoritative here, and where to start.

Each component has a spec with numbered **commitments** and **invariants**.
Implement to the spec, and cite invariant numbers in tests: `T3.7 (I5): …`.

**If the spec is wrong, change the spec first.** A spec and an implementation that
disagree is worse than either being wrong on its own — and an agent that silently
diverges leaves 56 documents describing something that no longer exists.

If a spec is ambiguous, **say so rather than choosing**. Ambiguity found during
implementation is the cheapest kind to fix.

---

## Where things are

| Path | Components |
|---|---|
| `src/terminal/` | C01 lifecycle · C02 capabilities · C03 frame scheduler |
| `src/data/` | C04 view model · C05 manifest · C06 transport · C07 adapters · C08 fixtures · C21 process |
| `src/presentation/` | C09 blocks · C10 theme · C11 table · C12 plot · C25 patch |
| `src/viewport/` | C13 transcript · C14 viewport · C15 overlays |
| `src/interaction/` | C16 router · C17 editor · C18 parser · C19 completion · C20 history |
| `src/shell/` | C22 composition · C23 execution |
| `src/index.ts` | C24 public API |

Full index at [`docs/INDEX.md`](docs/INDEX.md).

Build order: C01–C03 and C04–C07 are independent and can go in parallel — L0's two
halves do not import each other, which is what makes that true rather than convenient.

**Start with C01.** Highest risk, and the template the other twenty-four follow.
