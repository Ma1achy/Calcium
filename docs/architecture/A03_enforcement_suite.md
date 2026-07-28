# A03 — Enforcement suite

| Field | Value |
|---|---|
| **Type** | Architecture |
| **Package** | `tui-kit` — runs against both packages |
| **Collects** | Every lint rule, source scan, module-graph assertion and compile-level check declared across the 43 specs |
| **Status** | Draft |

---

## 1. Why this exists

Seventy-three assertions across twenty-five documents keep the architecture true rather than aspirational. Each is one line inside the spec that needed it, and none of them is where anyone would look for it.

Unwritten, they fail quietly. A component reads a clock and golden frames start flaking six weeks later; a renderer emits a hex colour and light mode is wrong for one block; a kind imports the registry and the module graph acquires a cycle nobody notices until the bundler complains. Every one of those is caught in under a second by a check that takes ten minutes to write.

**This document is the inventory, not a new set of rules.** Each row cites the spec that declared it. Where the two disagree, the spec wins and this is stale.

---

## 2. The six kinds of check

| Kind | Runs at | Cost | Catches |
|---|---|---|---|
| **Module graph** | Build | ~1 s | Layer violations, cycles, cross-package imports |
| **Source scan** | Build | ~1 s | Forbidden literals, ambient reads, escape hatches |
| **Exhaustiveness** | Compile | 0 | A union member added without its handler |
| **Type-level** | Compile | 0 | A shape that must not be constructible |
| **Corpus** | Test | seconds | Properties over fixtures — measurement, contrast, drop orders |
| **Vacuity** | Test | ~0 | A rule that matches nothing, and therefore passes |

The first four are **build gates**: they fail the build, not a test run, because a layer violation merged and fixed later has already had time to be depended upon.

**The sixth checks the other five.** Every rule ships with a test that fabricates a violation and asserts it fires, naming the rule. A rule with no such test is assumed vacuous until it has one.

This is not belt-and-braces. Every check here reports success the same way whether the tree is clean or the rule is broken, and a broken rule is indistinguishable from compliance at exactly the moment it matters. Two failure modes, and both have occurred in this repo:

- **A pattern that cannot match a real subject.** MG20 compared a resolved specifier against `src/terminal/escapes` while every NodeNext specifier ends `.js`. It matched nothing and reported compliance.
- **A scope that matches no files.** SS26 scopes to `src/data/process/`; the tree has `src/data/process.ts`, a file. `startsWith` never matches, so the rule has never once been evaluated.

A fabricated violation catches the first and not the second — the fabrication is written at a path inside the declared scope, so it fires whether or not that scope describes anything. Both checks are therefore required, and both are in `test/unit/enforce-rules.test.ts`. A rule whose scope is not yet real is listed there as **pending**, with the component that will create it; the pending entry is itself asserted, so it fails once the scope becomes real rather than outliving its reason.

---

## 3. Module graph

The layer rule (A02 §1) made executable. One test walks the compiled graph and asserts each edge.

| # | Assertion | Declared |
|---|---|---|
| MG1 | No module imports upward across layers | A02 §1 |
| MG2 | No cycle within a layer | A02 §1 |
| MG3 | `terminal/` ↮ `data/` — L0's halves never import each other | A02 §1, C01 T2.4, C03 T2.6 |
| MG4 | C04 imports nothing from `terminal/`, `presentation/` or above | C04 T2.9 |
| MG5 | C05 imports nothing from `terminal/` or above | C05 T2.6 |
| MG6 | C06 imports no C04 type | C06 T2.2 |
| MG7 | C07 imports nothing from `terminal/` or above | C07 T2.6 |
| MG8 | `tui-kit` imports nothing from `prism-tui` | C08 T2.6, T2.10 |
| MG9 | No block kind imports the registry | C09 T2.11 |
| MG10 | C13 imports nothing from `terminal/` or `presentation/` | C13 T2.4 |
| MG11 | C14 imports nothing from `terminal/` | C14 T2.5 |
| MG12 | C15 imports nothing from `terminal/` or C14 | C15 T2.6 |
| MG13 | C15 imports nothing from C13 | C15 T2.5 |
| MG14 | C16 imports nothing from `terminal/` | C16 T2.7 |
| MG15 | C17 imports nothing from `terminal/` | C17 T2.6 |
| MG16 | C18 imports nothing from `terminal/` or `presentation/` | C18 T2.4 |
| MG17 | C19 imports nothing from `terminal/` | C19 T2.5 |
| MG18 | C20 imports nothing from `terminal/`; no C17 import | C20 T2.5, T2.6 |
| MG19 | C21 imports nothing from `terminal/` | C21 T2.3 |
| MG20 | Each mode export of `terminal/escapes.ts` is imported by exactly its owner — the five persistent modes by C01, `2026` by C03 | C01 I1, T2.8 |

**MG3 and MG8 are the two that would be hardest to undo.** L0's halves touching collapses the parallel-build property; `tui-kit` reaching into `prism-tui` ends the reuse claim outright.

---

## 4. Source scans

Grep-class checks over built output. Each names a directory and a forbidden pattern.

### Ambient reads

| # | Forbidden | Where | Declared |
|---|---|---|---|
| SS1 | `Date`, `Date.now`, `performance.now`, `process.hrtime` | anywhere in `tui-kit` outside C22 | C22 T2.4 |
| SS2 | `Math.random` | C08 | C08 T2.3 |
| SS3 | clock reads | `adapters/` | C07 T2.2 |
| SS4 | clock reads | `transcript/` | C13 T2.2 |
| SS5 | clock reads | `viewport/` | C14 T2.4 |
| SS6 | clock reads | `input/` | C16 T2.3 |
| SS7 | clock reads | `editor/` | C17 T2.3 |
| SS8 | clock reads | `completion/` | C19 T2.3 |
| SS9 | clock, `fs`, `~/.prism` literal | `history/` | C20 T2.4 |
| SS10 | `process.env` reads of the seven terminal variables | outside C02 | C02 T2.5 |
| SS11 | `process.env` | `blocks/` | C09 T2.7 |
| SS12 | `process.env` | `theme/` | C10 T2.6 |
| SS13 | `fs`, clipboard shell-out | `viewport/` | C14 T2.4 |

**SS1 is the widest and the most valuable.** One injected clock, entering at C22 and nowhere else, is what makes golden frames reproducible and every timing test run on a fake.

### Forbidden literals

| # | Forbidden | Where | Declared |
|---|---|---|---|
| SS14 | `\x1b`, `\u001b` | outside `terminal/escapes.ts` | C01 I1, T2.5 |
| SS15 | Mode numbers `1049 25 2004 1002 1006 2026` | outside `terminal/escapes.ts` | C01 I1, T2.8 |
| SS16 | Hex, ANSI code, colour name | `viewmodel/` | C04 T2.7 |
| SS17 | Hex, ANSI, named colour | `blocks/` | C09 T2.8 |
| SS18 | Hex literal | any block-producing module | C10 T2.9 |
| SS19 | ANSI index or terminal-specific value | theme files | C10 T2.5 |
| SS20 | `syntax` palette reference | outside `code` and `patch` rendering | C10 T2.8 |
| SS21 | `spectrum` palette reference | outside declared art | C10 T2.8 |
| SS22 | Literal verb, flag or enum list | `completion/` | C19 T2.6 |

**SS22 is the anti-drift check.** A hardcoded enum in completion is how the manifest stops being the source of truth, and it looks harmless in review.

**SS15 scopes to `escapes.ts`, not to C01.** An earlier version said "outside C01", which contradicted SS14 and C01 I1: the literals are *required* to live in `escapes.ts`, so a rule forbidding them outside C01 fails on the one file that must contain them. Ownership of the *modes* is asserted separately, as MG20 — the escape module's named exports are imported only by their owning component. Two checks, because a single one cannot express both "the digits live in one file" and "the meaning belongs to one component".

### Structural prohibitions

| # | Forbidden | Where | Declared |
|---|---|---|---|
| SS23 | `.length`, `charAt`, `slice` on display text | outside the grapheme layer | C09 T2.9, C17 T2.4 |
| SS24 | Mutable module state | `table/`, `plot/`, `parser/` | C11 T2.6, C12 T2.5, C18 T2.2 |
| SS25 | Exit-code mapping or `ErrorLike` construction | `transport/` | C06 T2.3 |
| SS26 | Writes to real `process.stdout` | `process/` | C21 T2.2 · **pending, see below** |
| SS27 | Timer or escalation logic | `process/` | C21 T2.4 |
| SS28 | Scheduler calls | `input/`, `editor/`, `parser/`, `completion/`, `history/` | C16 T2.6, C17 T2.6, C18 T2.4, C19 T2.5, C20 T2.6 |
| SS29 | Multi-store access | outside local handlers | C23 T2.7 |
| SS30 | Second tokeniser or quoter | anywhere | C18 T2.3, C19 T2.4 |
| SS31 | A runtime dependency absent from `DEPENDENCIES.md` | `package.json` | A04 §2 |
| SS32 | A `postinstall`, `preinstall` or `prepare` script in any dependency | the install tree | A04 §3 |
| SS33 | `console.*` | `src/` | C01 I9, A04 §2 |
| SS34 | `render({ … alternateScreen … })` | `src/` | C01 I1, T2.9 |

**SS33 moved here from eslint's `no-console`, and got stronger for it.** It catches `console.error` and `console.warn`, which the lint rule did not, and it cannot fall silent because a parser could not read the file. It is also what makes C01's stdout redirection meaningful: a stray `console.log` in `src/` would be captured to the debug sink rather than corrupting a frame, but it should not exist in the first place.

**SS34 is the two-owners check.** Ink 7 accepts `render({ alternateScreen })` and will enter and leave it itself. C01 holds the alternate screen, so Ink must not — `held` would stop describing what was taken, and release would emit sequences for state something else already released. The framework's own option is the tempting shortcut precisely because it looks simpler at the call site.

**SS31 and SS32 are supply-chain gates.** `tui-kit` has three runtime dependencies because the specs need no more (A04 §2); a fourth appearing without justification is the change worth catching. SS32 catches the primary npm attack vector at the point it would first run.

**SS32 runs over the tree, not over our own manifest.** Checking only `package.json` would pass on a tree where every dependency ran code at install time, which is the thing the rule exists to prevent.

**It checks `preinstall`, `install` and `postinstall` on dependencies — not `prepare`.** `prepare` runs in a package's own directory and for a git dependency; it never runs on a published tarball. Eighteen packages in this tree declare one and none of them executes. Flagging them would train everyone to ignore SS32, which is worse than not having it. Our own manifest is still checked on all four, and A04 commitment 13 is what keeps git dependencies out.

**Two named exceptions, each with its reason recorded.** `node-pty` ships darwin and win32 prebuilds only, so Linux compiles it; `--ignore-scripts` stays set for the whole tree and `make install` invokes that one build by name, which is a different thing from letting every package run arbitrary code. `esbuild` is transitive under vitest and its postinstall is *suppressed* — npm installs the platform binary as an optional dependency and the hook is a fallback we never reach. Listed rather than silently skipped, so that if a vitest upgrade makes it load-bearing there is a place the reason already lives. Anything else acquiring an install script fails the build.

**SS26 is pending and has never been evaluated.** It scopes to `src/data/process/` and the scaffold created `src/data/process.ts` — a file, not a directory — so the prefix match finds nothing and the rule passes on every run. It came in with the scaffold and would not have fired had it been violated. The scope is corrected when C21 lands and creates the directory; until then the vacuity suite carries it as a named pending entry rather than counting it as enforcement. This is the defect the sixth kind of check exists to find, and it is recorded here rather than quietly fixed because the count of live rules should be honest.

**SS28 is the L4-orchestrates rule made checkable.** It caught four attempted violations during specification; as a scan it catches the fifth.

---

## 5. Exhaustiveness

Compile-time, zero cost, and each prevents a union member shipping without its handler.

| # | Union | Must have | Declared |
|---|---|---|---|
| EX1 | `Block` | a validator branch | C04 T2.10 |
| EX2 | `Block` | a registered definition | C09 T2.6 |
| EX3 | `Tone` | an entry in every shipped theme | C10 T2.7 |
| EX4 | `ArgType` | a validator | C05 T2.4 |
| EX5 | `ArgType` | **no** domain-specific member — frozen list | C05 T1.7c |
| EX6 | `CommitReason` | a window entry | C03 T2.5 |
| EX7 | `FocusTarget` | at least one default binding | C16 T2.5 |
| EX8 | `Motion` | an implementation | C17 T2.7 |
| EX9 | `ParseResult` | a route | C23 T2.6 |
| EX10 | `Change` | a documented cache effect | C14 T2.7 |
| EX11 | `OverlayChange` | emitted by some operation | C15 T2.7 |
| EX12 | Capability fields | a row in the degradation table with a named owner | C02 T2.6 |

**EX5 is the odd one and the most important for the framework claim.** It asserts a union stays *empty* of domain concepts — adding `uuid` or `target` back to `ArgType` fails the build, which is what keeps `tui-kit` general.

---

## 6. Type-level

Shapes that must not be constructible. Zero runtime cost.

| # | Rejects | Declared |
|---|---|---|
| TL1 | A React element in `Layer.content` | C15 T2.3 |
| TL2 | A React element in the completion menu | C19 T2.8 |
| TL3 | A React element in reverse-search content | C20 T2.7 |
| TL4 | View-state fields on a `merge` payload row | C04 T1.8b |
| TL5 | A shell string parameter on `spawn`; an argv form on `spawnShell` | C21 T2.5 |
| TL6 | A string `SpawnOptions.cwd` | C22 T2.6 |
| TL7 | A missing `onFatal` on the lifecycle | C22 T2.6 |

**TL5 is the security-relevant one.** The argv/shell boundary is D18, and a boolean flag would have made it invisible at the call site; two methods make it a type error to blur.

---

## 7. Corpus properties

Not build gates — they need fixtures — but they are the checks that catch the defects reading does not.

| # | Property | Declared |
|---|---|---|
| CP1 | `measure(b, w)` equals rendered rows, every kind × corpus × 7 widths | C09 T2.1 |
| CP2 | The same under `unicode: "ascii"` | C09 T2.2 |
| CP3 | Every substitution is 1:1 by cell count | C09 T2.5 |
| CP4 | Every shipped theme passes its contrast floors | C10 T2.4 |
| CP5 | The 4-bit mapping is injective across `{ok, warn, error, info, accent}` | C10 T2.3 |
| CP6 | Every stated column drop order equals `planColumns`' output | C11 T4.1, S03/S05/S06/S14/S15 |
| CP7 | Every produced document passes `validateDocument` | C07 T2.3 |
| CP8 | Every surface at 1-bit carries each distinction by glyph or word | B04 B4.3 |
| CP9 | Every field at 160 is reachable at 60 | B04 B4.2 |
| CP10 | Drop orders are identical under ASCII and UTF-8 | B04 B4.4 |

**CP6 already caught two defects during specification** — S06's drop table stated by analogy, and S14 and S15 specifying drops below the minimum width. It is three lines of code and it found errors three readings had missed.

**CP8 is the sweep worth running earliest.** A single colour-only distinction anywhere breaks the 1-bit axis invisibly for everyone whose terminal has colour.

---

## 8. Running them

| When | Which | Budget |
|---|---|---|
| Compile | EX, TL | 0 — the type-checker already runs |
| Pre-commit | MG, SS | < 3 s total |
| CI, every MR | MG, SS, EX, TL, CP | CP dominates; target < 60 s |
| CI, nightly | CP plus golden frames at four widths × two themes × two unicode modes | minutes |

**MG and SS run pre-commit because they are the ones whose violations become load-bearing.** A layer violation merged on Monday has three components depending on it by Friday.

Each check names, on failure: the rule, the file, the line, and the spec that declared it. A scan that says only "forbidden pattern found" wastes the time it was meant to save.

---

## 9. Commitments

1. Every enforcement assertion in the spec set is inventoried here, citing its source.
2. `make enforce` (A04 §5) is the runner; assertions specified and never executed are an honour system.
3. Where a spec and this document disagree, the spec wins and this is stale.
4. Module-graph and source scans are build gates, not test cases.
5. Exhaustiveness and type-level checks cost nothing and run at compile time.
6. `MG3` and `MG8` are the two whose violation is hardest to undo — L0's halves, and kit importing app.
7. `SS1` is the widest scan: one injected clock, entering at C22 and nowhere else.
8. `SS28` makes the L4-orchestrates rule checkable rather than conventional.
9. `EX5` asserts a union stays empty of domain concepts, which is what keeps the framework general.
10. `TL5` makes the argv/shell boundary a type error to blur.
11. `CP6` and `CP8` are the two corpus properties that have already found or would find defects reading does not.
12. Every failure names the rule, the file, the line and the declaring spec.
13. MG and SS run pre-commit, because their violations become depended-upon within days.
14. **Every rule ships with a test that fabricates a violation and asserts it fires, naming the rule.** A rule with no such test is assumed vacuous until it has one. Every scan's scope is separately asserted to match at least one file in the tree; a scope that matches nothing is listed as pending, with its blocking component, and the pending entry fails once the scope becomes real.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| The rules themselves | The spec that declares each |
| Per-component test tiers | Each component spec |
| Golden frame fixtures | The surfaces |
| Conformance against the far side | A01 §6 |
| Repo tooling choice | Implementation |
