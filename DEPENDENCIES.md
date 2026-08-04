# Dependencies

Every runtime dependency is attack surface (A04 §2, §3). **The strongest supply-chain
control is not having dependencies** — a scanner tells you about a compromised package
after it is installed; an absent package cannot be compromised.

`make enforce` (SS31) asserts this file and `package.json` agree exactly.

## Runtime — four

| Package | Why it cannot be internal | Owner |
|---|---|---|
| `ink` | The React reconciler for terminals, plus Yoga layout. Reimplementing it is the project, not a dependency of it. **It supplies layout, and its width computation must agree with `cells()`** — C09 breaks and truncates every line itself (C09 §3), but Ink still measures text for box sizing, with its own implementation. Two implementations of one number, and this one cannot be deduplicated away: the row below says why a width library is not a dependency, and that reasoning does not stop Ink having one. C09 T2.16 asserts the agreement over the adversarial corpus; a divergence is a finding about which of the two is right | — |
| `react` | Ink's reconciler target. Not optional | — |
| `lowlight` | Emits token roles as an AST, not styled output, so C10 keeps ownership of colour. `shiki`, `highlight.js` used directly and `prismjs` all bake colours into what they emit; `lowlight` returns a hast tree of `hljs-*` classes that C09 maps to palette slots (C09 §4a). A hand-written YAML tokeniser is ~150 lines that will be wrong about anchors, multi-line scalars and flow mappings, and wrong quietly. 6 packages, 0 vulnerabilities; only the needed grammars are registered — `createLowlight({ yaml, json })`, not the full highlight.js set | — |
| `highlight.js` | **What it does**: the two grammars `lowlight` tokenises with — `yaml` and `json`, imported one file each. **Why internal is worse**: the row above already argues it; a hand-written YAML tokeniser is ~150 lines that will be wrong about anchors, multi-line scalars and flow mappings, and wrong quietly. **Why it is a row rather than a transitive**: `lowlight` depends on it, so it is already in the tree — but C09 §4a imports `highlight.js/lib/languages/yaml` *directly*, and an import of a package we have not declared is a phantom dependency that a hoisting change breaks. Declaring it adds no attack surface and removes a lie. `lowlight`'s own `common` bundle would have avoided the row and statically imported thirty-seven grammars to do it, which is the weight §4a exists to refuse. **Transitive count**: 0. **Maintenance signal**: 11.11.1, the reference implementation, last published 2025-08-26. **Owner**: — |

## Development

| Package | Why | Owner |
|---|---|---|
| `typescript` | — | — |
| `vitest` | Test runner | — |
| `node-pty` | Real pseudo-terminals for C01–C03's tier-5 tests. There is no other way to test terminal restoration honestly. **Needs a native build**: it ships darwin and win32 prebuilds only, so every devcontainer and all of CI compiles it. `make install` invokes that build by name — `--ignore-scripts` stays set for the tree, and A03 SS32 carries `node-pty` as its single named exception (A04 §3) | — |
| `eslint` | — | — |
| `@types/node` | — | — |
| `@types/react` | **What it does**: the type declarations for `react`, which ships none of its own. **Why internal is worse**: C09's `render` returns a `ReactElement` (C09 §2) and Ink's own `.d.ts` files import from `react`; hand-declaring the corner of React that Ink's types reach would be a second, smaller React type surface that drifts against the real one on every upgrade — and `skipLibCheck` hides the drift rather than reporting it. **Transitive count**: 1 (`csstype` 3.2.3, itself dependency-free) — 2 packages total. **Maintenance signal**: DefinitelyTyped, published by Microsoft's types account, 19.2.17 tracking `react` 19.2.x, last published 2026-06-05. **Owner**: — |

## What is deliberately NOT a dependency

Each of these is the kind of thing a project normally installs. The specs make each unnecessary.

| Not installed | Instead | Because |
|---|---|---|
| A grapheme splitter | `Intl.Segmenter` | Built into Node 18+ (C09, C17) |
| An East Asian width table | ~60 lines, internal | Static Unicode data; a dependency for a lookup table is not worth its supply chain |
| A colour library | Internal arithmetic | C10 defines the quantisation; a third-party one would not be the same implementation the theme validates against |
| A date library | Injected `() => number` | The no-ambient-clock rule (A03 SS1) removes the need entirely |
| A width/truncation library | `cells()` | Must be the same implementation the measurer uses, or measurement drifts (C09 I6) |
| A styling library (chalk) | Ink | Ink already owns styling |
| An NDJSON parser | `node:readline` | Built in (C06) |
| A local registry (verdaccio) | `npm publish --dry-run` + `npm pack` + install the tarball | **316 packages** (verdaccio 6.9.2) to verify a `files` array, in a file that opens by saying the strongest supply-chain control is not having dependencies and spends four paragraphs refusing typescript-eslint's 87 for a real lint rule. `make proof` reaches the same four things `file:` cannot — a file missing from `files`, an unbuilt `dist/`, a broken `exports` path, an undeclared dependency — by packing the identical tarball a publish would upload and installing it into a clean tree. **The named gap: it does not prove that a publish to a live registry succeeds, or that authentication is configured.** Nothing in this repository does, and CI's publish step is where that becomes visible. Reopen if a packaging defect ever survives `make proof`, which would mean the round trip matters after all |
| A TypeScript linter (typescript-eslint) | `tsc --strict`, plus A03 scans | 87 packages, and every rule it would give us over strict TypeScript is replaceable by a source scan — `no-console` moved to A03 SS33 and got stronger, catching `console.error` and `console.warn` too. **The one exception is `no-floating-promises`, and it is not replaceable by a regex.** C02 has no async at all, so deciding this at C02 decides it at the wrong moment. **Reopen at C06**: cancellation and streaming are where a floating promise is a real bug rather than a style one, and if the answer is still no there, it is no for good reasons rather than for want of a case. Until then `src/` is not linted — see `eslint.config.js`. **The trigger passed unnoticed at C06, and again at C21 and C23** — a deferral with a named trigger and no mechanism, which is the class `waitsOn` closes for enforcement rules and `TD2` closes for tests, arriving in a dependency row where nothing was watching. **And the rule now has a demonstrated catch rather than a hypothetical one.** C23 routes are started as `void runRoute(...)`, and an async route that throws *before* its own `try` rejects with nobody awaiting: no entry, no commit, nothing reported. The containment paths had a window with no containment, and C23 I1 — every submission produces exactly one outcome — was violated silently while the suite was green. A real defect lived in that window (every `warn` and `error` notice threw at construction for want of a glyph, C04 I6) and was invisible because of it. Fixed in the code by wrapping each route, which is the mitigation a rule would have made unnecessary. So the question is now 87 dev packages against one rule with a measured catch, which is a different trade from 87 against a style preference — and it has a real answer either way. Decide after C23 lands; mid-component is the wrong moment, which was the original argument |

## An advisory against something we did not install

`make all` runs `npm audit --audit-level=high`, so an advisory published against
anything in the tree turns the build red without a commit having been made. The
first one was `brace-expansion`, reached only as
`eslint → minimatch → brace-expansion`.

**A transitive bump does not get a row, and the reason is the same one the rows
exist for.** A row is an argument that a *choice* was correct — what it does, why
internal is worse, its transitive count, its maintenance signal, an owner. Nothing
was chosen here: the package arrived under one we did chose, and the fix restores
the version that dependency already permitted. A row would be an argument for a
decision nobody made, and `make enforce` (SS31) compares this file against
`package.json`, which a lockfile bump does not touch — so a row would also make
the two disagree.

**What the commit must show instead**, because a lockfile change is invisible to
review otherwise:

- **The path.** `npm ls <package>` — which declared dependency reaches it, and
  whether it is `dev`. A dev-only transitive does not ship, and saying so is the
  difference between an urgent commit and a tidy one.
- **The diff is one package.** `npm audit fix` may bump more than the advisory
  names, and may edit `package.json`. Read `git diff --name-only` before
  committing: if `package.json` moved, this is no longer a transitive bump and it
  needs the section above.
- **That it was pre-existing.** An advisory arriving during a feature branch is
  not that branch's, and the way to know is to stash and re-run rather than to
  assume. Fixing it in passing hides both the advisory and the feature.
- **`make all`, not `npm audit`.** The point of the bump is that nothing else
  moved.

**What is not acceptable**: `--audit-level` raised, the package pinned by
`overrides` without saying why, or the advisory suppressed. Each turns a red build
into a quiet one, which is the failure mode A03 §2 is about, arriving through the
supply chain.

## Adding one

Open an MR containing: what it does, why the internal alternative is worse, its own
transitive count, its maintenance signal, and a named owner. Add a row above.
`make enforce` fails until this file and `package.json` match.
