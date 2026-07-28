# Dependencies

Every runtime dependency is attack surface (A04 §2, §3). **The strongest supply-chain
control is not having dependencies** — a scanner tells you about a compromised package
after it is installed; an absent package cannot be compromised.

`make enforce` (SS31) asserts this file and `package.json` agree exactly.

## Runtime — two

| Package | Why it cannot be internal | Owner |
|---|---|---|
| `ink` | The React reconciler for terminals, plus Yoga layout. Reimplementing it is the project, not a dependency of it | — |
| `react` | Ink's reconciler target. Not optional | — |

## Development

| Package | Why | Owner |
|---|---|---|
| `typescript` | — | — |
| `vitest` | Test runner | — |
| `node-pty` | Real pseudo-terminals for C01–C03's tier-5 tests. There is no other way to test terminal restoration honestly | — |
| `eslint` | — | — |
| `@types/node` | — | — |

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

## Adding one

Open an MR containing: what it does, why the internal alternative is worse, its own
transitive count, its maintenance signal, and a named owner. Add a row above.
`make enforce` fails until this file and `package.json` match.
