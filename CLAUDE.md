# tui-kit

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
  behind all three walks and it is now three for three: C16's rung table takes the rows
  where two rungs could both apply, C17's edit trace the sequences where two coalescing
  clauses meet, C18's classification table the inputs where two classification rules
  meet. A row governed by one rule is a restatement of that rule and finds nothing;
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

  The figure that argues for the whole discipline is C16's: **seven defects from the
  by-hand walks before any code, four more from mutation during it, three
  enforcement rules changed shape under the pressure, and one new rule that found
  three further instances in shipped code on its first run.** Eight spec commits
  before a line of implementation looked disproportionate at the time, and every one
  of those seven pre-code defects would otherwise have been a rewrite.

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
