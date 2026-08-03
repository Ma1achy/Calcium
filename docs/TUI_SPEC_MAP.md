# Prism TUI — spec map

| | |
|---|---|
| **Packages** | `packages/tui-kit/` (the framework) · `packages/prism-tui/` (Prism's app) |
| **Supersedes** | The 15-journey decomposition. Journeys were the wrong form — most of what needs specifying here has no narrative |
| **Companions** | `TUI_SCRATCHPAD.md` (architecture, 30 settled), `TUI_SCRATCHPAD_2_surface.md` (surface, resolved) |
| **Status** | 23 component specs written. Surfaces and behaviours outstanding |

> **`L4` and `M-T4` are different things.** `L0`–`L5` are **layers** in the architecture (A02 §1). `M-T1`–`M-T6` are **milestones**. C22 and C23 are L4 *components* and land in the **Interaction** milestone, not the fourth one. Where it matters, use the milestone's name rather than its number.

---

## Why not journeys

Journeys work for the Python CLI because each verb is a discrete user action with a story — dev types, dev sees, done. The TUI is a system of parts that interact, and most of what needs specifying has no story. Nobody has a journey through the wrap cache.

Four artefact types instead. Journeys survive as the smallest of the four, because the things that genuinely *are* narrative deserve narrative — a system assembled purely from component contracts is internally consistent and feels wrong to use.

| Type | Count | Answers | Form |
|---|---|---|---|
| **Component** `C` | 21 | What is this module, what does it expose, what does it own | Interface + invariants |
| **Surface** `S` | 15 | What does this screen show, in what arrangement, in what states | Render + state table |
| **Behaviour** `B` | 3 |
| **Reference app** `R` | 1 | What happens across components that no one component owns | Narrative |
| **Architecture** `A` | 1 | Why is it shaped this way, what is the boundary | Prose + decisions |

Every document ends with a numbered **commitments** list. That is the one thing worth keeping from the journey format — it is what makes tasks derivable.

---

## Two packages

The TUI is built so a teammate can stand up their own with minimal effort. Going through the 21 components, **20 are generic** — only the fixture world is Prism-shaped. The seam is almost already there; what it costs is discipline about where app-specific things live.

| | `tui-kit` | `prism-tui` |
|---|---|---|
| Contains | C01–C07, C09–C21, frame structure, block defaults | C08, all surfaces, adapters, manifest content, theme tokens, policies |
| Knows about | Terminals, blocks, transcripts, input, subprocesses | Runs, model versions, deployments, GitOps |
| Versioned | Independently | Depends on a `tui-kit` major |

### The extension surface

**A consumer never writes a component.** Everything renders through the block vocabulary, so extending the framework means writing a function from your CLI's JSON to blocks. React is only reached for pushed views, and most apps will not have any.

```typescript
createTui({
  name:     "kubectl",
  binary:   "kubectl",
  manifest: "./kubectl.manifest.json",
  adapters: { get: adaptGet, describe: adaptDescribe },
  theme:    tokens,
});
```

That is the whole integration for a working shell with transcript, history, completion, themes, overlays and every block type. Verbs without an adapter fall through to the fallback renderer, so the app is usable before a single adapter is written.

### What this changes in the design

| # | Change | Was |
|---|---|---|
| F1 | Blocks are a **registry**, not a closed union. Register a renderer plus a measurer; the 16 ship as defaults | Closed 16-block union (C04) |
| F2 | Command classification is a **pluggable policy**. `/` is Prism's choice; another app may want `:` or no prefix | `/` prefix hardcoded (C18) |
| F3 | The error shape generalises to `ErrorLike` — only `message` required. Prism's `{code, stage, message, details}` is a specialisation | Prism envelope in the core (C04) |
| F4 | Themes are **data files**, not code | Two themes in the theme module (C10) |
| F5 | Header and footer **content** is app-supplied; the framework owns the structure | Frame content fixed (S01) |

### Discipline

**The framework gets an extension point when Prism needs it, or when it is obviously zero-cost. Nothing speculative.** There is no second consumer yet, and designing for imaginary ones is how frameworks go bad. When a real second app wants something, that is when it gets designed.

### Forcing function

A reference app under `examples/`, roughly 50 lines, wrapping something real — `git` or `kubectl`. If it is not trivial, the abstraction is wrong. It is built **alongside** the framework from M-T1, not after it — see Phasing. A far better test of the reusability claim than intent is.

---

## Components

Every component is `tui-kit` except **C08**. Where a row says *+ app*, the framework owns the mechanism and the app supplies the content.

### Terminal

| | Component | Pkg | Owns |
|---|---|---|---|
| C01 | Terminal lifecycle | kit | Alt-screen, cursor, raw mode, bracketed paste, mouse, scroll region. Acquire/release, signal handlers, suspend/resume. Single-owner discipline |
| C02 | Capability detection | kit | The capability record, environment probes, config overrides, the degradation matrix |
| C03 | Frame scheduler | kit | Commit coalescing by class, synchronised update, contamination flag, forced repaint |

### Data

| | Component | Pkg | Owns |
|---|---|---|---|
| C04 | View model | kit | `ViewDocument`, the **block registry** (F1), `Tone`, `Action`, `ErrorLike` (F3), the height-given-width contract |
| C05 | Tool manifest | kit + app | Schema, loader, arg/flag validation, local-vs-spawn marking. App supplies the manifest |
| C06 | Transport | kit | The interface, `SubprocessTransport`, the fixture harness, per-verb selection, timeouts, cancellation, NDJSON streaming |
| C07 | Adapter registry | kit + app | Registry mechanism, fallback adapter, purity discipline, schema versioning. App supplies adapters |
| C08 | Fixture world | **app** | Prism's emulated backend — seeded state, log/event/pod/pipeline generators, the background tick |

### Render

| | Component | Pkg | Owns |
|---|---|---|---|
| C09 | Block library | kit | The 16 default block renderers and their measurement functions |
| C10 | Theme resolution | kit + app | Tone → colour, degradation to 256 / 16 / none, user overrides. App supplies token files (F4) |
| C11 | Table engine | kit | Column priority and drop order, minimum widths, sort, expand rows, row focus |
| C12 | Plot renderer | kit | Braille line plots with axes, block sparklines, ASCII fallbacks |

### Viewport

| | Component | Pkg | Owns |
|---|---|---|---|
| C13 | Transcript store | kit | The block list, live-vs-frozen, caps and FIFO eviction, the dropped-content marker |
| C14 | Viewport | kit | Scroll state, virtualisation, wrap cache and its invalidation key, follow-tail, resize anchoring |
| C15 | Overlay manager | kit | Transient positional layers — completion menu, reverse-i-search, confirms, context help |

### Input

| | Component | Pkg | Owns |
|---|---|---|---|
| C16 | Input router | kit | Focus stack, input priority, keymap, hierarchical `⌃c` |
| C17 | Line editor | kit | Cursor model, word motions, kill/yank, multi-line, bracketed paste |
| C18 | Command parser | kit + app | Tokenise, **pluggable classification policy** (F2), pipes and redirects, `$_` expansion. App supplies the prefix policy |
| C19 | Completion engine | kit + app | Source registry, cache TTL, common-prefix, ghost text. App supplies dynamic sources |
| C20 | History store | kit | Persistence and sidecar, redaction heuristic, search, cap and rotation |

### Process

| | Component | Pkg | Owns |
|---|---|---|---|
| C21 | Process runner | kit | argv-array spawn, `spawnShell`, process groups, stream decoding, handoff, signal delivery |

### Shell (L4)

| | Component | Pkg | Owns |
|---|---|---|---|
| C22 | Composition root and session | kit | `createTui`, construction order, startup gates, session state, chrome wiring, shutdown |
| C23 | Execution pipeline | kit | Route dispatch, the app path, action dispatch, the submission guard, every cross-layer sequence, all time-driven updates |
| C24 | Public API | kit | The façade — exports, builders, `b.live`, the testing kit, startup validation |

**Twenty-four components.** C22 and C23 were added after the first twenty-one were written, when it became clear that twelve specs were deferring obligations to an "L4" that nothing defined.

---

## Surfaces

All `prism-tui`, except **S01** — the framework owns the frame structure and the app supplies its header/footer content (F5).

Each is a screen plus a state table: **loading · empty · error · degraded · narrow**.

| | Surface | Tier |
|---|---|---|
| S01 | The frame — header, footer, prompt chrome, live gutter marker | chrome |
| S02 | Welcome | transcript |
| S03 | `/ps` list | live |
| S04 | Run detail — kind-aware (training · evaluation · inference · study) | live |
| S05 | `/serving` list and deployment detail | live |
| S06 | `/models` — families → versions → detail | live |
| S07 | `/diff` | live |
| S08 | `/validate` output — success and failure paths | transcript |
| S09 | `/test` output | transcript |
| S10 | GitOps verb output — submit · promote · scale · undeploy (shared shape) | transcript |
| S11 | Local execution output — `/run` · `/local up` · `/build` | live |
| S12 | Logs view | pushed |
| S13 | Dashboard | pushed |
| S14 | `/config` — editable view | live |
| S15 | Identity output — `/login` · `/whoami` · `/secrets` | transcript |

---

## Behaviours

The four things that are genuinely narrative. These are where the product decisions live.

| | Behaviour | Covers |
|---|---|---|
| B01 | Session lifecycle | The session's arc across eight components, and the cross-component failure table — the only place that picture exists |
| B03 | The drill chain | Live block → row focus → detail → pushed view → `Esc` → back with selection preserved |
| B04 | Degradation | Offline cluster, expired token, terminal too small, no colour, no Unicode, Python absent |

---

## Architecture

| | Document |
|---|---|
| A03 | Enforcement suite — every lint rule, source scan, module-graph and compile-level check in one inventory |
| A01 | Architecture and boundary contract — the promoted scratchpads, the integration checklist, the conformance suite definition, and the **extraction appendix** (the ten decisions that exist only in the HTML mockup) |

---

## Templates

**Component**

```
metadata (id · layer · depends on · consumed by · status)
1. Purpose            one paragraph
2. Public interface   types and signatures, no bodies
3. State owned        what is mutable, who may mutate it
4. Invariants         what must always hold
5. Behaviour notes    only where the interface does not say it
6. Commitments        numbered
7. Tests              six tiers
```

**Surface**

```
metadata (id · tier · data source · status)
1. Purpose
2. The screen         concrete render at 100 columns
3. Fields             field → source → format
4. States             loading · empty · error · degraded · narrow
5. Interactions       keys, actions, focus order
6. Column priority    if it has a table
7. Commitments
8. Tests              including golden frames at 80/100/120/160
```

**Behaviour**

```
metadata (id · components involved · status)
1. Narrative
2. Sequence
3. Failure modes      table: failure → where it surfaces → what the user does
4. Commitments
5. Tests
```

---

## Phasing

Two phases. **The framework is built and proven before Prism goes on it.**

### Phase 1 — the framework

`tui-kit` plus the reference app, which is built **alongside** the framework rather than after it. A framework with no consumer produces abstractions that are wrong in ways you cannot see until the first consumer arrives — and if that consumer is Prism, every mistake is expensive by the time you find it.

**Reference app: `docker`.** `docker ps --format json` and `docker images --format json` give real tabular data and live-ish state. Everyone has it, no auth, no cluster. Close enough to Prism's shape to be quick, different enough in content that Prism-isms leaking into the framework are visible.

| | Name | Contains | Exit criterion |
|---|---|---|---|
| **M-T1** | It opens and closes cleanly | C01 C02 C03 · frame structure · B01 · A01 · reference app skeleton | Fullscreen frame opens, resizes, degrades, exits leaving the shell byte-identical on all five paths. PTY-tested |
| **M-T2** | It renders | C04 C05 C06 C07 C09 C10 C11 C12 · C08's harness half | Every block type renders from fixtures in both themes at four widths. Reference app renders `docker ps` |
| **M-T3** | It takes input | C13 C14 C15 C16 C17 C18 C19 C20 C21 · **C22 C23** | 10,000 blocks stay responsive; commands parse, route, execute and commit; history and completion behave. Reference app is fully usable |

**Phase 1 is done when** the example app works and someone who is not its author can build a TUI from the README without asking a question.

### Phase 2 — Prism

`prism-tui` goes on the finished framework. **C08 straddles the two phases**: its harness — the `Fixture` model, recording, redaction, the seeded RNG, the resolver — is `tui-kit` and lands in Phase 1; only the world half is Prism's and lands here.

| | Name | Contains | Exit criterion |
|---|---|---|---|
| **M-T4** | Prism surfaces | C08's world half · S01–S11 · S14 · S15 · B03 · B04 | Every verb in the manifest renders its surface; the drill chain works; degradation is exercised |
| **M-T5** | Full-screen views | S12 · S13 | Logs tails without starving keystrokes; dashboard live-updates with per-panel failure isolation |

**The Phase 2 rule: every framework change forced by Prism is a Phase 1 defect, and gets logged as one.** A low count means the abstraction was right. A high count is worth knowing early and cheaply, rather than discovering it when a teammate tries to use it.

### Phase 3 — gated

| | Name | Exit criterion |
|---|---|---|
| **M-T6** | Compositor | Not scheduled. Written from M-T3's measured baseline, built only if that baseline shows a limit |

**Wiring** is not a milestone — it is the conformance suite (A01) going green against the real Python CLI, at whatever point that happens.

### One consumer cannot validate a framework

With a single app you cannot tell a general abstraction from a specialisation of that app. Two is the minimum, which is why both the reference app and Prism matter: the framework is not proven until the second one goes on cleanly.

---

## State of play

| | Written | Outstanding |
|---|---|---|
| Components | **23 of 23** — 300 invariants, 313 commitments, 1,441 tests | — |
| Surfaces | **15 of 15** — S01–S15 | — |
| Behaviours | **3 of 3** — B01, B03, B04 | — **B02 dropped** — its content is C23, and two documents describing one thing is how A02 §2 drifted |
| Architecture | A01, A02, A03, A04 | — |
| Reference app | R01 | — |

C22 and C23 close the last structural gap: every "L4 orchestrates" obligation deferred by C01, C05, C07, C09, C10, C14, C15, C16, C17, C19, C20 and C21 now resolves somewhere named.

---

## Build order

```
PHASE 1 — tui-kit + reference app

C01 ─ C02 ─ C03 ──────────────────── frame ── B01        M-T1

C04 ─┬─ C05 ─ C06 ─ C07                                  M-T2
     └─ C09 ─┬─ C10
             ├─ C11
             └─ C12

C13 ─ C14 ─ C15                                          M-T3
C16 ─ C17 ─ C18 ─┬─ C19
                 └─ C20
C21 ─────────────────── C22 ─ C23


PHASE 2 — prism-tui

C08 ── S01 … S15 ── B03 ── B04                          M-T4 / M-T5
```

C04 through C07 have no dependency on the terminal at all — pure data, testable headlessly. That whole column can be built in parallel with M-T1 and is where a second agent goes first.

---

## Reclassifying what is already written

| File | Becomes |
|---|---|
| `JOURNEY_T02_terminal_substrate.md` | Splits into **C01**, **C02**, **C03**. Already close to component shape; mostly a carve |
| `JOURNEY_T03_view_model_and_transport.md` | Splits into **C04**, **C05**, **C06**, **C07**. The schema section is C04 nearly verbatim |
| `JOURNEY_T01_shell_session.md` | Becomes **B01** (narrative) plus **S01** and **S02** (the frame and the welcome). The only one that stays a story |

Nothing is binned. All three predate the surface decisions, so each needs a pass for the `/` prefix, live-vs-frozen blocks, and the transport interface.

---

## Open

All resolved.

| Question | Resolution |
|---|---|
| Framework name | **`tui-kit`** |
| Split up front or extract later | **Up front**, two packages from the first commit. 20 of 21 components are already generic, so extraction would be mechanical and the discipline costs the same either way |
| Does C11 stay separate from C09 | **Separate.** The table engine is the only block with real state; folding it in would make C09 half table logic |
| Where the fixture world lives | **In-package**, reachable via `--demo` or `PRISM_TUI_TRANSPORT=fixture`. Bundle weight is irrelevant for a Node binary and demoing without a cluster is worth far more |
| Where the mockup-only decisions land | **A01 appendix**, captured before the specs are written so they are not lost |

### Nothing structural left

The next move is writing A01 — it carries the promoted scratchpads, the boundary contract, the conformance suite definition, and the extraction appendix. Everything else derives from it.

