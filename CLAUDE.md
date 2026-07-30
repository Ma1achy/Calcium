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
