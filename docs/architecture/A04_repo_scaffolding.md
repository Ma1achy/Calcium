# A04 — Repository scaffolding

| Field | Value |
|---|---|
| **Type** | Architecture |
| **Covers** | `tui-kit` · `docker-tui` · `prism-tui` |
| **Source** | A02 §1 · A03 · R01 §8 · C24 §2 |
| **Status** | Draft |

---

## 1. Three repositories

| Repo | Contains | Publishes |
|---|---|---|
| `tui-kit` | C01–C24, the framework | A package to GitHub Packages, private |
| `docker-tui` | R01, the reference app | Nothing — proof, plus an import manifest |
| `prism-tui` | Prism's adapters, manifest, theme, world, surfaces | Nothing — an internal app |

Separate rather than a monorepo because R01 §8's argument generalises: **a workspace path alias proves nothing about the package being a package.** Missing files in `files`, a wrong `exports` map, unresolvable type declarations, a peer dependency that is really a hard one — all invisible from inside a workspace, all immediately visible from outside.

`prism-tui` could be a workspace member of the Prism monorepo. It should not be, for the same reason.

---

## 2. Dependency posture

**`tui-kit` has two runtime dependencies: `react` and `ink`.**

That is not an aspiration; it falls out of the specs. Everything else is already in Node or is arithmetic the specs define:

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

**The strongest supply-chain control is not having dependencies.** A scanner tells you about a compromised package after it is installed; an absent package cannot be compromised. Two direct dependencies is a security property before it is an engineering one.

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
| `--ignore-scripts` on install | **Postinstall is the primary npm attack vector.** Nothing here needs one |
| `npm audit --audit-level=high` as a gate | Fails the build, not a warning nobody reads |
| Exact versions for direct dependencies | No `^`; a patch release is a decision |
| Dependency review on every PR | A new transitive dependency is visible and justified |
| SBOM per release | CycloneDX, attached to the release |
| Build attestation | GitHub Actions attestation links the artefact to its commit and workflow. **Not npm `--provenance`** — that is a public-registry feature |
| Publish from CI only, using `GITHUB_TOKEN` | No laptop holds a publish credential; the token is workflow-scoped and expires with the run |

**`--ignore-scripts` is the one that matters most.** It is also the one that breaks builds that assumed a postinstall, which is why it is set from the first commit rather than retrofitted.

---

## 4. Devcontainers

One per repo. **Required for development, never required for consumption** — and
those are different claims that an earlier draft ran together.

Contributors and agents work inside the container: Node parity with CI, the
`node-pty` toolchain, reproducibility, and blast radius. Consumers must never need
it — R01 R4.4 commits that a clean clone plus `npm install` gives a working shell,
and if that only held inside a container, "a teammate can build a TUI easily" would
quietly become "if they adopt our container".

Concretely, R4.4 is `clean clone → npm install → npm start → running shell, no further steps`, and the container appears nowhere in it.

| Repo | Base | Adds | For |
|---|---|---|---|
| `tui-kit` | Node 22 | `node-pty` build deps · an explicit node feature pinning 22 | C01–C03's PTY tests |
| `docker-tui` | Node 22 | Docker socket mounted read-only | R4.2's real-docker run |
| `prism-tui` | Node 22 | Python 3.12 + the Prism CLI | Conformance and `record --against`, locally |

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
| `make install` | `npm ci --ignore-scripts` | — |
| `make check` | Type-check and lint | < 20 s |
| `make enforce` | **A03's assertions** — module graph, source scans, exhaustiveness | < 5 s |
| `make test` | Tiers 1–4 | < 60 s |
| `make golden` | Golden frames, four widths × two themes × two unicode modes | minutes |
| `make e2e` | Tier 5, PTY harness | minutes |
| `make audit` | `npm audit --audit-level=high`, dependency-manifest check | < 10 s |
| `make all` | Everything above | — |
| `make conformance` | `prism-tui` only — the boundary contract (A01 §6) | — |
| `make record` | `prism-tui`, `docker-tui` — fixture recording and `--diff` | — |

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
| Every push | `install → check → enforce → audit → test` — under two minutes |
| Push to `main`, and tags | The above plus `golden → e2e → [repo-specific]` |

`enforce` stays on every push regardless: it costs five seconds and catches the violations that become load-bearing fastest.

| Repo | Last stage |
|---|---|
| `tui-kit` | Publish on tag to GitHub Packages, with attestation and SBOM |
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

**Not published publicly.** `tui-kit` publishes on tag from CI to **GitHub Packages**, private.

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

`"tui-kit": "git+ssh://git@gitlab.fmx/…#v0.3.0"` avoids a registry entirely and is tempting. It does not work here.

**Git dependencies install from source and need a `prepare` script to build** — and A04 §3 bans install scripts outright, because postinstall is the primary npm attack vector. Allowing one for this would be trading the single most valuable supply-chain control for the convenience of not configuring a registry.

The alternative — committing build output to the repository — makes every MR diff contain compiled artefacts and makes the reviewed source and the installed source two different things. A registry is cheaper than either.

### What private distribution costs

Two commitments have to be honest about it:

- **No npm provenance.** `--provenance` produces a signed attestation verifiable by anyone; it is a public-registry feature. GitHub Actions attestation links the artefact to its workflow, which is the useful part privately, but it is not the same guarantee and should not be described as one.
- **`npm audit` still works**, because it queries the advisory database rather than the registry the package came from. The gate is unaffected.

`tui-kit` publishes on tag from CI, never a laptop.

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

1. Three repositories, not a monorepo, so each package is exercised as a package.
2. `tui-kit` has exactly two runtime dependencies; the specs require no more.
3. A new dependency needs a justification in `DEPENDENCIES.md`, and A03 asserts the file matches `package.json`.
4. `--ignore-scripts` from the first commit; nothing here needs a postinstall.
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

---

## 11. Out of scope

| Not here | Where |
|---|---|
| The rules themselves | A03 and the component specs |
| What each component does | Its spec |
| Registry choice, org naming | Implementation |
| Release cadence | Implementation |
| Prism's own monorepo integration | The Prism repo |
