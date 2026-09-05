# Specs

61 documents. This page says which are authoritative for **this** repo, which are
context, and what to read in what order.

---

## Read first, once

| | |
|---|---|
| [`architecture/A02`](architecture/A02_calcium_architecture.md) | **The layer rule.** Six layers, imports go down only, L0's two halves never touch. Everything else assumes it |
| [`architecture/A01`](architecture/A01_architecture_and_boundary.md) | 48 decisions and the boundary contract — argv in, JSON out |
| [`architecture/A03`](architecture/A03_enforcement_suite.md) | The 93 checks `make enforce` executes, each citing the spec that declared it |
| [`../CLAUDE.md`](../CLAUDE.md) | The same rules, distilled to the ones violated by accident |

---

## Authoritative here

**`components/` — C01 to C25.** These are the implementation contracts for this repo.
One spec is one component is one MR. Each carries numbered **commitments**,
**invariants**, and six test tiers. Cite invariant numbers in tests: `T3.7 (I5): …`.

**`architecture/` — A01 to A04.** A04 covers repo scaffolding, CI and supply chain.

**`behaviours/` — B01, B03, B04.** Cross-component paths no single component owns:
the session's arc and its failure table, the drill chain, degradation.

---

## Context, not authoritative here

**`surfaces/` — S01 to S15.** These belong to `prism-tui`. They are here because they
are the **acceptance criteria for the components** — an agent implementing C11's table
engine should read S03 to see what a table has to render, and C09's block library
makes far more sense beside S08's steps and S10's code blocks.

**`reference-app/` — R01.** Belongs to `docker-tui`. Read it to know what the public
API has to support.

---

## Not a spec, and the one to read before proposing work

**[`ROADMAP.md`](ROADMAP.md)** — four pieces of Calcium work, each with a real application
hitting it. Derived from `docker-tui`'s fifty-five findings by grouping them by shape and
ranking them by how many independent surfaces reached for the same thing.

It is **not authoritative**: nothing in it has been ruled, and two of the four entries name
a design question a spec edit has to answer first. It is here because it is the only
document in this tree that says what is *missing*, and because every entry has a consumer
behind it rather than a prediction.

**`archive/`** — six scratchpads. Superseded, and kept because the *reasoning* behind
several decisions is there and nowhere else. A01 records what was decided; these record
why the alternatives were rejected. **Where a scratchpad and a spec disagree, the spec wins.**

**`notes/`** — working notes, several on things since specified: resize is C03 I15 / C22 I8 and
image support is C04 I73 (this line named both as unspecified until 2026-09-03); the audit of every
note against the tree is `notes/CALCIUM_NOTE_AUDIT.md`. **Reference, not work.** A scratchpad is superseded and its
conclusions have landed somewhere; a note's have not landed anywhere, because there is
no component to land them in yet. Neither is authoritative, and the distinction matters
in one direction: reading a scratchpad tells you why a spec says what it says, and
reading a note tells you what nobody has decided.

**[`KEYS.md`](KEYS.md)** — the key ladder as one table, **generated** by `npx tsx tools/keymap-table.mjs`
from `defaultKeymap` (C16 §6) and drift-checked by `test/unit/keymap-table.test.ts`. Not edited by
hand: regenerate it when a binding changes, and the test says when the file and the keymap disagree.

---

## Build order

C01–C03 and C04–C07 are independent. That is deliberate — L0's two halves do not
import each other, so they can be built in parallel.

```
terminal    C01 lifecycle → C02 capabilities → C03 scheduler
data        C04 view model → C05 manifest → C06 transport → C07 adapters → C21 process
                    ↓
presentation        C09 blocks → C10 theme → C11 table → C12 plot → C25 patch
                    ↓
viewport            C13 transcript → C14 viewport → C15 overlays
                    ↓
interaction         C16 router → C17 editor → C18 parser → C19 completion → C20 history
                    ↓
shell               C22 composition → C23 execution → C24 public API
```

**Start with C01.** It is the highest-risk component — the one that can leave a
terminal broken — and it is the template the other twenty-four follow.

**C04 is the other good starting point** if two agents are working: pure data, no
terminal, testable headlessly, and it defines the vocabulary C09, C11, C12 and every
surface derive from.

---

## Conventions

| | |
|---|---|
| **Commitments** | Numbered, at the end of each spec. What the component promises |
| **Invariants** | `I1`, `I2`, … What must always hold. Every one deserves a test |
| **Test tiers** | `T1.x` unit · `T2.x` contract · `T3.x` edge · `T4.x` integration · `T5.x` e2e · `T6.x` fail-on-revert |
| **Fail-on-revert** | Names the *change* that makes it fail, not just the assertion |
| **State machines** | Every stateful component enumerates its full transition table, invalid cells included |
| **British English** | artefact, behaviour, normalise, colour, initialise |

---

## If a spec is wrong

**Change the spec first.** A spec and an implementation that disagree is worse than
either being wrong alone — and a silent divergence leaves 56 documents describing
something that no longer exists.

If a spec is ambiguous, say so rather than choosing. Ambiguity found during
implementation is the cheapest kind to fix.
