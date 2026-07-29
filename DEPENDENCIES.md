# Dependencies

Every runtime dependency is attack surface (A04 §2, §3). **The strongest supply-chain
control is not having dependencies** — a scanner tells you about a compromised package
after it is installed; an absent package cannot be compromised.

`make enforce` (SS31) asserts this file and `package.json` agree exactly.

## Runtime — three

| Package | Why it cannot be internal | Owner |
|---|---|---|
| `ink` | The React reconciler for terminals, plus Yoga layout. Reimplementing it is the project, not a dependency of it. **It supplies layout, and its width computation must agree with `cells()`** — C09 breaks and truncates every line itself (C09 §3), but Ink still measures text for box sizing, with its own implementation. Two implementations of one number, and this one cannot be deduplicated away: the row below says why a width library is not a dependency, and that reasoning does not stop Ink having one. C09 T2.16 asserts the agreement over the adversarial corpus; a divergence is a finding about which of the two is right | — |
| `react` | Ink's reconciler target. Not optional | — |
| `lowlight` | Emits token roles as an AST, not styled output, so C10 keeps ownership of colour. `shiki`, `highlight.js` used directly and `prismjs` all bake colours into what they emit; `lowlight` returns a hast tree of `hljs-*` classes that C09 maps to palette slots (C09 §4a). A hand-written YAML tokeniser is ~150 lines that will be wrong about anchors, multi-line scalars and flow mappings, and wrong quietly. 6 packages, 0 vulnerabilities; only the needed grammars are registered — `createLowlight({ yaml, json })`, not the full highlight.js set | — |

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
| A TypeScript linter (typescript-eslint) | `tsc --strict`, plus A03 scans | 87 packages, and every rule it would give us over strict TypeScript is replaceable by a source scan — `no-console` moved to A03 SS33 and got stronger, catching `console.error` and `console.warn` too. **The one exception is `no-floating-promises`, and it is not replaceable by a regex.** C02 has no async at all, so deciding this at C02 decides it at the wrong moment. **Reopen at C06**: cancellation and streaming are where a floating promise is a real bug rather than a style one, and if the answer is still no there, it is no for good reasons rather than for want of a case. Until then `src/` is not linted — see `eslint.config.js` |

## Adding one

Open an MR containing: what it does, why the internal alternative is worse, its own
transitive count, its maintenance signal, and a named owner. Add a row above.
`make enforce` fails until this file and `package.json` match.
