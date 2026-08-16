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
| `lowlight` | Emits token roles as an AST, not styled output, so C10 keeps ownership of colour. `shiki`, `highlight.js` used directly and `prismjs` all bake colours into what they emit; `lowlight` returns a hast tree of `hljs-*` classes that C09 maps to palette slots (C09 §4a). A hand-written YAML tokeniser is ~150 lines that will be wrong about anchors, multi-line scalars and flow mappings, and wrong quietly. 6 packages, 0 vulnerabilities; only the needed grammars are registered — sixteen, **measured at 121 KB against the package's 9.2 MB**, not the full 384. The objection is to the full set and it survives; what changed is that *needed* had been measured against two consumers (F93, C09 I23) | — |
| `beautiful-mermaid` | **What it does**: renders a Mermaid source to a grid of text lines — `renderMermaidASCII`, one call, at one site. **Why internal is worse**: layout is the whole problem. `mermaid-ascii`'s approach — parse to a grid, A* the edges — is a component-sized piece of work, and the alternative to a dependency here is not 150 lines but a layout engine. **Why the weight is accepted**: 11 MB installed across three packages, against `lowlight`'s 121 KB of a 9.2 MB package. That comparison was applied as a size limit and it is not one — `lowlight`'s figure is evidence of a **subset import path**, a claim about composability, and 11 MB of dev dependency in a terminal framework is not a cost anyone ships. **Transitive count**: 2 — `elkjs` 0.11 (8.1 MB) and `entities` 7.0 (0.4 MB). **Licence**: MIT, and `elkjs` is **EPL-2.0 — the first non-permissive entry in this file.** EPL-2.0 is *file-level* copyleft: it reaches modifications to EPL-licensed files, and depending on the package triggers nothing. Recorded because a licence nobody looked at is how one gets found at publication. **Maintenance signal**: 1.1.3, ten releases between 2026-01-28 and 2026-02-26, then nothing — which is why the transform is one call wide and its options do not reach the block's shape. **Owner**: — |
| `highlight.js` | **What it does**: the grammars `lowlight` tokenises with, imported one file each. Sixteen by the rule in C09 §4a — what a terminal user plausibly reads in this window — at 121 KB, and an app registers its own through `registerGrammar` (C24 I22). It was `yaml` and `json` alone, which made §4a's promise that a grammar could arrive later unreachable (F93). **Why internal is worse**: the row above already argues it; a hand-written YAML tokeniser is ~150 lines that will be wrong about anchors, multi-line scalars and flow mappings, and wrong quietly. **Why it is a row rather than a transitive**: `lowlight` depends on it, so it is already in the tree — but C09 §4a imports `highlight.js/lib/languages/yaml` *directly*, and an import of a package we have not declared is a phantom dependency that a hoisting change breaks. Declaring it adds no attack surface and removes a lie. `lowlight`'s own `common` bundle would have avoided the row and statically imported thirty-seven grammars to do it, which is the weight §4a exists to refuse. **Transitive count**: 0. **Maintenance signal**: 11.11.1, the reference implementation, last published 2025-08-26. **Owner**: — |

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
| A chart library (`simple-ascii-chart`) | C12's `line` and `sparkline`, and the three forms it does not have staying unbuilt | **This is a fit refusal and the cost passed, which is the distinction worth recording.** Measured, not guessed: **656 KB installed, one package, zero transitive dependencies**, MIT, four years of releases (2022-02-01 to 6.0.0 on 2026-07-21), one maintainer, `engines: node >=22` matching ours. Nothing in that paragraph refuses it. **What refuses it is that it owns three things this framework owns**, and each was measured against the tree rather than argued. **1 · It emits SGR itself** — 17 escape literals in `dist/index.js`, and a coloured heatmap comes back as `ESC[32m.ESC[0m`. Put through `stripControl`, the ESC byte goes and `[32m` stays as **visible text**: `cells()` reads 18 where the eye reads 6, so the block misreports its own width to the measurer *and* draws `[32m` on screen. A block names a palette slot and C10 resolves it; a library that has already decided cannot be themed. **2 · Its width model is narrow-only and hardcoded** — a fixed `FULLWIDTH_RANGES` table with no `ambiguousWidth` input anywhere. Its bar chart is **exactly 65 cells on every row at narrow, and eleven different widths from 65 to 127 at wide**; the axis row doubles. That is not misalignment, it is a wrapped line, which is the one failure that scrolls the alternate screen. **3 · `width: 'auto'` reads `process.stdout.columns`** (`dist/index.js:2346`) — avoidable by passing a number, and the rule is that width is handed down. **The residue is named rather than dismissed**: C12 has `line` and `sparkline`, and `progress` is a single row, so **a categorical bar chart on axes, a heatmap and a candlestick are three forms C12 cannot draw** — the prediction that its bars were redundant was measured and is false *of C12*. **Sharpened the same day by taking those three through the planning pass** (`docs/notes/CALCIUM_PLOT_PRIOR_ART.md`, first instalment), and one of the three did not survive: the bar chart's consumer is **already served**, because `Cell.spark` puts a sparkline in a table cell and *compare N entities* is a table with a magnitude column. *A form C12 cannot draw* and *a form the tree cannot draw* are different claims and the second is the one that matters — the compression class, caught before anything was built on it. The heatmap survived and got harder: its consumer is real and its blocker is a **nullable ordinate**, a published type. The candlestick has no consumer anywhere. Those are roadmap entries about block kinds, not an argument for this package, whose output would need re-measuring, re-colouring and re-wrapping before a block could hold it |
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
