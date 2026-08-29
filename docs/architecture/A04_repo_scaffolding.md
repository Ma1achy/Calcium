# A04 — Repository scaffolding

| Field | Value |
|---|---|
| **Type** | Architecture |
| **Covers** | Calcium · `docker-tui` · `prism-tui` |
| **Source** | A02 §1 · A03 · R01 §8 · C24 §2 |
| **Status** | Draft |

---

## 1. Three deliverables, two repositories

| Deliverable | Where it lives | Contains | Publishes |
|---|---|---|---|
| Calcium | `Calcium/` | C01–C25, the framework | A package to GitHub Packages, private |
| `docker-tui` | `Calcium/examples/docker/` | R01, the reference app | Nothing — proof, plus an import manifest |
| `plots-tui` | `Calcium/examples/plots/` | C12's forms in a terminal, built through `b.plot` | Nothing — the one gate that reads a frame rather than comparing bytes |
| `prism-tui` | its own repository | Prism's adapters, manifest, theme, world, surfaces | Nothing — an internal app |

**`plots-tui` is a third consumer and it exists for what the gates cannot see.** Every instrument
this repository has compares bytes — golden frames, the collision sweep, the pair sheet, the arm
disagreement record, the terminal baseline — so none of them can report a flicker, a jump, or a
colour that reads badly on a real emulator. That is the whole of its subject, and it is why it is
an application rather than a fixture: a document built and asserted against never calls
`createTui`, which is the surface F7 was about.

**It builds through `b.plot` deliberately.** The catalogue, every fixture and every golden frame
use `block({ … })`, the viewmodel constructor, which is transparent to any field — so the
published builder is the one surface no artefact exercises for these forms, and F335's eight
missing members were invisible from inside by construction. A row in its own suite asserts that no
figure reaches past the builder, because the day one does, the example stops being able to find
this class.

**The examples are discovered rather than listed**, in `make check`, `make test` and `enforce`'s
by-use population. All three named the two by hand, and two of them carry comments recording that
they were added *because an example's declared script was invoked by nothing* — so a third example
arriving unlisted is the same defect one turn later. The population is `examples/*/package.json`
and the exception is named.

Separate rather than a monorepo because R01 §8's argument generalises: **a workspace path alias proves nothing about the package being a package.** Missing files in `files`, a wrong `exports` map, unresolvable type declarations, a peer dependency that is really a hard one — all invisible from inside a workspace, all immediately visible from outside.

**`docker-tui` resolved differently, and the argument above is why it could.** R01 §8 moved it to `Calcium/examples/docker/` on the finding that separation was never the goal — *building against the packaged artefact* was, and separation was one way to get it. Two mechanisms buy the same guarantee inside the workspace:

- **The seal.** `"@fmx/calcium": "file:../.."` plus `"files": ["dist"]` and an `exports` map locked to three entry points, so `import "@fmx/calcium/src/…"` is a resolution error enforced by npm rather than by discipline.
- **The proof.** `make proof` packs the real tarball, installs it into a tree that has never seen this repository, and runs the app's suite against it — refusing to proceed if npm resolved a symlink instead.

**The distinction that makes this safe is what a repository boundary was actually protecting.** It was never the file layout; it was the resolution path. A boundary enforced by `exports` fails the same way a boundary enforced by separation does — at install, not at review — and it fails on every developer's machine rather than only in CI.

`prism-tui` could be a workspace member of the Prism monorepo. It should not be, and the reason does not transfer from `docker-tui`: it is a *different organisation's* application, so the boundary being protected there is ownership rather than resolution, and no `exports` map enforces that one.

---

## 2. Dependency posture

**Calcium has three runtime dependencies: `react`, `ink` and `lowlight`.**

It had two for most of the specification, and that was worth saying because **two was a property that fell out of the specs rather than a target we were defending.** Every other candidate had an internal alternative the specs made better: `Intl.Segmenter` over a grapheme splitter, C10's own arithmetic over a colour library, an injected `() => number` over a date library.

`lowlight` is the first capability that genuinely cannot be internal, which is the bar DEPENDENCIES.md sets rather than a number. C10 defines a `syntax` palette and nothing produced the token spans it colours; a hand-written tokeniser for YAML would be wrong about anchors, multi-line scalars and flow mappings, and wrong quietly. The count moved because a spec needed something real, not because the discipline slipped — and the discipline is the justification, never the integer.

Everything else is already in Node or is arithmetic the specs define, and that is what keeps the list this short:

| Capability | Source |
|---|---|
| Grapheme segmentation (C09, C17) | `Intl.Segmenter` — Node 18+ |
| East Asian width (C09) | A static Unicode table, ~60 lines, internal |
| Colour quantisation (C10) | Pure arithmetic, internal |
| Braille rasterisation (C12) | Pure arithmetic, internal |
| NDJSON parsing (C06) | `node:readline` |
| Subprocess (C21) | `node:child_process` |
| Filesystem (C20, C22) | Injected; `node:fs` at the boundary only |
| Clock (C22) | Injected `() => number` — **no date library, ever** |
| Terminal escapes (C01, C03) | String literals in one module |

**The strongest supply-chain control is not having dependencies.** A scanner tells you about a compromised package after it is installed; an absent package cannot be compromised. A short direct-dependency list is a security property before it is an engineering one — which is why the bar for adding one is an argument, not a budget.

The no-ambient-clock rule (A03 SS1) removes the date library that most projects carry. The palette rule (C10) removes the colour library. The measurement contract (C09) removes the width library, because a third-party one would not be the same implementation the measurer uses.

### Adding one

A new runtime dependency requires: what it does, why the ~60 lines of doing it internally is worse, its own dependency count, its maintenance signal, and a named owner. **Recorded in `DEPENDENCIES.md` and enforced** — A03 gains a scan asserting `package.json`'s runtime deps match that file exactly.

Dev dependencies are looser but not free: `typescript`, `vitest`, `node-pty` (C01–C03's PTY tests), a linter. Each still justified in the same file.

---

## 3. Supply-chain controls

| Control | Why |
|---|---|
| `npm ci`, never `npm install`, in CI | Installs the lockfile exactly; `install` can silently resolve differently |
| Lockfile committed, reviewed like code | A lockfile diff in an unrelated PR is the signal |
| `--ignore-scripts` on install | **Postinstall is the primary npm attack vector.** One dev dependency needs a build; see below |
| `npm audit --audit-level=high` as a gate | Fails the build, not a warning nobody reads |
| Exact versions for direct dependencies | No `^`; a patch release is a decision |
| Dependency review on every PR | A new transitive dependency is visible and justified |
| SBOM per release | CycloneDX, attached to the release |
| Build attestation | GitHub Actions attestation links the artefact to its commit and workflow. **Not npm `--provenance`** — that is a public-registry feature |
| Publish from CI only, using `GITHUB_TOKEN` | No laptop holds a publish credential; the token is workflow-scoped and expires with the run |

**`--ignore-scripts` is the one that matters most.** It is also the one that breaks builds that assumed a postinstall, which is why it is set from the first commit rather than retrofitted.

**`--ignore-scripts` stays. One dev dependency — `node-pty` — needs a native build, and it is rebuilt by an explicit named step rather than by re-enabling install scripts for the whole tree. The distinction is that we invoke the build; no package's hook runs unsupervised.**

`make install` is therefore two commands, not one:

```
npm ci --ignore-scripts
npm rebuild node-pty --ignore-scripts=false
```

**`--ignore-scripts=false` is required on the rebuild.** `.npmrc`'s global setting applies to `npm rebuild` too, which then succeeds without building and reports success. This is why the rebuild is a Makefile target rather than a note: a clean checkout would otherwise fail much later, at a `require`, with no connection to the cause.

That is the exact shape of failure this section exists to prevent, produced by this section's own control. `make install` verifies the build afterwards — `node -e "require('node-pty')"` — because a step whose failure mode is a success message needs an assertion, not a flag.

`node-pty` ships prebuilds for darwin and win32 only. On Linux — which is every devcontainer and all of CI — there is no binary and the toolchain compiles one. A03 SS32 carries `node-pty` as its single named exception so that a second package acquiring an install script still fails the build.

---

## 4. Devcontainers

**One per thing that needs a different machine, not one per repository.**
**Required for development, never required for consumption** — and those are
different claims that an earlier draft ran together.

The rule used to read *one per repo*, which was the same sentence as the one
above for as long as §1's three deliverables lived in three repositories. Once
`docker-tui` moved into `Calcium/examples/`, the two came apart, and the wrong
half was the one that got followed: the docker feature was added to the
framework's container, which is the only reading *one per repo* allows and the
one this section's own next paragraph forbids.

**An example that needs a far side gets its own container, and the framework's
must not acquire it.** That is the rule, and it is the concrete form of the
paragraph below: a container the framework does not need is a dependency the
framework does not have, and the whole value of "never required for consumption"
is that nothing under `src/` may come to assume the container is there. A socket
in the framework's container is exactly how that assumption gets made — not
deliberately, but by someone reaching for `docker` in a test because it happened
to be on `PATH`.

**The separation is in what is installed, not in where the file sits.** Both
configs live under `.devcontainer/`, because a devcontainer config in a
subdirectory makes that subdirectory the workspace — and the example's
dependency is `"@fmx/calcium": "file:../.."`, which then points outside the
mount and fails to install. `.devcontainer/<name>/devcontainer.json` is the
supported multi-container layout and each mounts the repository root, so the
path resolves to the thing it names. **This is the rule's cheapest possible
failure**: an example's container placed beside the example, for the obvious
reason, that cannot install the example.

The cost is real and is the reason it was not done first: a full pass now needs
both containers up, and every working note that names one has to say which.
`examples/docker/VERIFYING.md` carries that mapping.

Contributors and agents work inside the container: Node parity with CI, the
`node-pty` toolchain, reproducibility, and blast radius. Consumers must never need
it — R01 R4.4 commits that a clean clone plus `npm install` gives a working shell,
and if that only held inside a container, "a teammate can build a TUI easily" would
quietly become "if they adopt our container".

Concretely, R4.4 is `clean clone → npm install → npm start → running shell, no further steps`, and the container appears nowhere in it.

| Container | Config | Base | Adds | For |
|---|---|---|---|---|
| Calcium | `.devcontainer/` | Node 22 | `node-pty` build deps · an explicit node feature pinning 22 | C01–C03's PTY tests |
| `docker-tui` | `.devcontainer/docker-tui/` | Node 22 | `docker-outside-of-docker` · a built `dist/` · the `docker-tui` bin linked | R4.2's real-docker run |
| `prism-tui` | its repo's `.devcontainer/` | Node 22 | Python 3.12 + the Prism CLI | Conformance and `record --against`, locally |

**Outside-of-docker, not in-docker, and not a read-only socket.** An earlier
draft of this row said *"Docker socket mounted read-only"*, and it was wrong
twice. The feature mounts the host socket read-write — it must, because the CLI
writes requests to it — so the row described a configuration nobody had. And a
read-only bind of a unix socket restricts nothing anyway: `ro` governs the
directory entry, not the byte stream, so a reader who believed the row would
have believed in a control that cannot exist. **A sentence naming a security
property is a claim about a mechanism, and this one named neither the mechanism
in use nor a mechanism that works.** The real control is that the socket is in
one container, reachable by one example, and the framework cannot see it.

Nested docker is refused for a different reason: a nested daemon gives the app
an empty container list, which reads as *a working app with nothing to show*
rather than as a misconfiguration. The frames must be read against real
containers.

`prism-tui`'s carries Python **because the container exists to make local testing possible**, and conformance is the test you most want to run before pushing. A container that forced a CI round-trip to check the boundary would defeat its purpose.

**Pin the Node version with a feature, not only the image tag.** The
`typescript-node:22` image can still resolve a different default through nvm, and
the symptom is `EBADENGINE` warnings at install rather than a failure.
`engine-strict=true` in `.npmrc` turns that warning into an error, which is what
you want — Ink 7 requires Node ≥ 22 and a silently-20 container fails later and
less clearly.

Each declares its terminal as `xterm-256color` with a UTF-8 locale, and each also runs the suite under `TERM=dumb` and `LANG=C` — the degradation axes are not tested by hoping someone's laptop is misconfigured.

---

## 5. The Makefile contract

**CI runs the same targets a developer runs.** Not equivalent commands — the same ones. A CI pipeline that invokes something else is a second build nobody tests.

| Target | Does | Budget |
|---|---|---|
| `make install` | `npm ci --ignore-scripts`, then the one named build, then verify it (§3) | — |
| `make check` | Type-check and lint | < 20 s |
| `make enforce` | **A03's assertions** — module graph, source scans, exhaustiveness | < 5 s |
| `make test` | Tiers 1–4 | < 60 s |
| `make golden` | Golden frames, four widths × two themes × two unicode modes | minutes |
| `make e2e` | Tier 5, PTY harness | minutes |
| `make audit` | `npm audit --audit-level=high`, dependency-manifest check | < 10 s |
| `make hooks` | Points `core.hooksPath` at `.githooks`; run by `make install` | — |
| `make all` | Everything above | — |
| `make conformance` | `prism-tui` only — the boundary contract (A01 §6) | — |
| `make record` | `prism-tui`, `docker-tui` — fixture recording and `--diff` | — |

**A `pre-commit` hook runs `make enforce` too, and running it three times is the point.** CI catches it, the pre-MR habit catches it, and the hook catches it before either — because the two gates above it are discipline and discipline is what fails on the commit where someone is concentrating on something else. That is not hypothetical here: a commit landed on a red `make enforce` during C16's build, because the only gate was an `&&` chain in a typed command and the chain ran past the failure.

A layer violation committed is a layer violation that has had time to be depended upon, and five seconds is cheaper than the revert. `--no-verify` still works deliberately: a hook that cannot be bypassed gets uninstalled, and one that can be bypassed gets bypassed visibly, in a flag someone has to type.

`make enforce` is the target that makes A03 real. Seventy-one assertions specified and never executed are an honour system; a five-second target that fails an MR is a rule.

---

## 6. CI

Same shape in all three, differing only in what the last stage can reach.

```
install → check → enforce → audit → test → golden → e2e → [repo-specific]
```

**Split by cost.** Private repos have a monthly Actions budget, and golden frames at sixteen configurations plus PTY e2e is where it goes.

| Trigger | Stages |
|---|---|
| Every push to a branch | `install → check → enforce → audit → test` — under two minutes |
| **Pull request**, push to `main`, and tags | The above plus `golden → e2e → [repo-specific]` |

`enforce` stays on every push regardless: it costs five seconds and catches the violations that become load-bearing fastest.

**The pull-request row is new, and it is here because the table's first form made `main` the only place the expensive tier could run — so `main` was the only place it could break, and nothing could stop it.**

`main`'s CI failed on **five consecutive merges** (#12, #13, #14, #15, #16) while every pre-merge check was green, because the pre-merge check does not run the tier that was failing. `make test` excludes tier 5; `full` and `degraded` were conditioned on `github.ref == 'refs/heads/main'`, which a `pull_request` event never satisfies. Every one of those merges was made on a green that had not run the failing test, and the failure was reported afterwards to a branch nobody was gating.

The costs were read the right way round and the trigger was not. **A pull request is not "every push" — it is the merge gate**, and it is the one moment where the expensive tier changes a decision. Branch pushes keep the two-minute promise, which is what that promise was for: the inner loop, where the answer is wanted in seconds and a wrong one costs a re-run.

The budget argument survives intact, because a PR runs the expensive tier once per merge rather than once per push, and it was already running once per merge — on the far side of the merge, where it could only report.

**The general form is the one already recorded in `examples/docker/VERIFYING.md`**: a result read through a channel that cannot express it. Here the channel is a CI job that does not run the test, and green meant *did not run* while reading as *passed* — A03 §2's vacuity class arriving in a pipeline.

| Repo | Last stage |
|---|---|
| Calcium | Publish on tag to GitHub Packages, with attestation and SBOM |
| `docker-tui` | Real-docker run **where available; the skip is recorded, not silent** (R01 §8) · publish the import manifest on release |
| `prism-tui` | Conformance against the real CLI where available; `record --diff` reporting structural drift. **No CI yet — local `make all` for now** |

**A recorded skip matters.** A suite that silently skips its only real-integration test looks identical to one that passes it, and the difference is discovered at the worst moment.

`enforce` runs before `test` deliberately: a layer violation should fail in five seconds, not after a two-minute suite.

---

## 7. `CLAUDE.md`

One per repo. Not a style guide — **the rules an agent will violate because they are invisible.**

Every rule below is invisible in the sense that violating it produces code that compiles, passes review and works today.

```markdown
## Layers
L0 foundation · L1 presentation · L2 viewport · L3 interaction · L4 shell · L5 app
Imports go DOWN only. Never up, never sideways within a layer.
L0's two halves — terminal/ and data/ — never import each other.
If a component needs something from above, L4 orchestrates it. See A02 Seam 4.

## Never
- Read a clock outside C22. Injected `() => number`, always.
- Read process.env outside C02.
- Embed a colour. Name a palette slot.
- Write an escape sequence outside terminal/escapes.ts.
- Let `measure` see anything `render` sees but geometry must not — no `tick`.
- Add a dependency without an entry in DEPENDENCIES.md.
- Add an export nobody consumes.

## Always
- Six test tiers: unit, contract, edge, integration, e2e, fail-on-revert.
- A fail-on-revert test names the change that makes it fail, not just the assertion.
- `make enforce` before opening an MR.
- British English in prose: artefact, behaviour, normalise, colour, initialise.

## The spec is the contract
Each component has a spec with numbered commitments and invariants.
Implement to the spec. If the spec is wrong, change the spec first —
a spec and an implementation that disagree is worse than either being wrong.
```

The last paragraph is the one that matters most for agentic work: an agent that silently diverges from a spec leaves 46 documents describing something that no longer exists.

---

## 8. One skill

**`implement-component`** — takes a component spec and produces the implementation plus its six tiers.

It encodes: read the spec's commitments and invariants first; one test per invariant minimum; fail-on-revert tests name the reversion; run `make enforce` before finishing; and if the spec is ambiguous, say so rather than choosing.

**One skill, not several.** A spec-writing skill is unnecessary now that 46 exist as worked examples, and a skill per component type would fragment a discipline that is the same everywhere.

---

## 9. Distribution

**Not published publicly.** Calcium publishes on tag from CI to **GitHub Packages**, private.

Consumers install it as an ordinary npm dependency pointed at that registry:

```
@<scope>:registry=https://npm.pkg.github.com/
```

`GITHUB_TOKEN` covers it in Actions; a PAT with `read:packages` covers it locally.

### Local iteration

Publishing between edits is intolerable when both packages are moving. **`npm link` locally; CI always installs from the registry.**

That split keeps the property that matters: the "is it really a package" test — missing `files`, wrong `exports`, unresolvable types — runs on every CI build, where a link cannot mask it. Locally the link is a convenience and its divergence from reality is caught within one push.

This is unchanged in every way that matters for R01's argument. Installing from a private registry exercises the same `files` list, the same `exports` map and the same type resolution as a public one — **only the audience differs, not the packaging.** `docker-tui` remains a real external consumer.

### Why not a git dependency

`"@fmx/calcium": "git+ssh://git@gitlab.fmx/…#v0.3.0"` avoids a registry entirely and is tempting. It does not work here.

**Git dependencies install from source and need a `prepare` script to build** — and A04 §3 bans install scripts outright, because postinstall is the primary npm attack vector. Allowing one for this would be trading the single most valuable supply-chain control for the convenience of not configuring a registry.

The alternative — committing build output to the repository — makes every MR diff contain compiled artefacts and makes the reviewed source and the installed source two different things. A registry is cheaper than either.

### What private distribution costs

Two commitments have to be honest about it:

- **No npm provenance.** `--provenance` produces a signed attestation verifiable by anyone; it is a public-registry feature. GitHub Actions attestation links the artefact to its workflow, which is the useful part privately, but it is not the same guarantee and should not be described as one.
- **`npm audit` still works**, because it queries the advisory database rather than the registry the package came from. The gate is unaffected.

Calcium publishes on tag from CI, never a laptop.

| | |
|---|---|
| Versioning | Semver, and R01 R4.5 is the test — a minor bump that requires reference-app changes was not minor |
| Attestation | GitHub Actions attestation, linking artefact to workflow. Not npm provenance |
| SBOM | CycloneDX, attached to the release |
| Credential | `GITHUB_TOKEN`, workflow-scoped, expiring with the run |
| Changelog | Generated from commits; breaking changes named explicitly |

The reference app bumping is the release gate. It lives in another repo precisely so that bumping it is a real test rather than a compile check.

---

## 10. Commitments

1. Every package is exercised as a package — by separation where the boundary is ownership, and by a sealed `exports` map plus a pack-and-install gate where it is resolution. `docker-tui` takes the second route (§1); `prism-tui` takes the first.
2. Calcium has three runtime dependencies; the specs require no more. The count is an outcome of the justification bar, not a target.
3. A new dependency needs a justification in `DEPENDENCIES.md`, and A03 asserts the file matches `package.json`.
4. `--ignore-scripts` from the first commit, for the whole tree. One dev dependency needs a native build, and it is invoked by name from `make install` rather than by re-enabling install scripts; A03 SS32 names it as its single exception.
5. `npm ci` in CI, lockfile committed and reviewed.
6. `npm audit --audit-level=high` is a gate, not a warning.
7. Devcontainers are required for development and never required for consumption.
8. `prism-tui`'s devcontainer carries Python, so conformance is runnable locally.
9. CI runs the same Makefile targets a developer runs — not equivalents.
10. `make enforce` executes A03; it runs before the test suite so violations fail in seconds.
11. A skipped real-integration run is recorded, never silent.
12. Distribution is to GitHub Packages, private, from CI on tag using `GITHUB_TOKEN`; no laptop holds a credential.
13. Not a git dependency — that would require an install script, trading the most valuable supply-chain control for a saved configuration step.
14. GitHub Actions attestation is not npm provenance, and is not described as it.
15. `npm link` locally, registry install in CI — the packaging test runs where a link cannot mask it.
16. Heavy stages run on `main` and tags; `enforce` runs on every push regardless.
17. `CLAUDE.md` states the invisible rules, and instructs that a wrong spec is changed before the code.
18. One skill — `implement-component`.
19. One container per thing that needs a different machine, not one per repository. An example needing a far side gets its own; the framework's acquires nothing the framework does not have.
20. The socket lives in one container, and no claim is made that it is read-only — a read-only bind of a unix socket is not a control (§4).

---

## 11. Out of scope

| Not here | Where |
|---|---|
| The rules themselves | A03 and the component specs |
| What each component does | Its spec |
| Registry choice, org naming | Implementation |
| Release cadence | Implementation |
| Prism's own monorepo integration | The Prism repo |
