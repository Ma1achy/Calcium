# A01 — Architecture and boundary contract

| Field | Value |
|---|---|
| **Type** | Architecture |
| **Packages** | `tui-kit` (framework) · `prism-tui` (Prism's app) |
| **Consumed by** | Every component, surface and behaviour spec |
| **Supersedes** | `TUI_SCRATCHPAD.md`, `TUI_SCRATCHPAD_2_surface.md` as the thing to consult. Those remain the reasoning archive |
| **Status** | Draft |

---

## 1. The system

```
                      keyboard / mouse
                             │
                        input router ─── focus stack ─── overlays
                             │
                       command parser ─── manifest (validate before spawn)
                             │
              ┌──────────────┴──────────────┐
              │              │              │
         local command   Prism verb    system command
              │              │              │
              │        transport ──── process runner (argv array)
              │              │              │
              │        adapter registry     │
              │              │              │
              └──────► ViewDocument ◄───────┘
                             │
                    transcript store ─── live / frozen
                             │
                     viewport ─── virtualisation ─── wrap cache
                             │
                       block library ─── theme ─── capabilities
                             │
                      frame scheduler ─── coalescing ─── sync update
                             │
                     terminal lifecycle ─── single-owner stdout
```

Two rules hold the shape together. **Everything renders through the block vocabulary** — nothing draws to the terminal directly, which is what makes theming, degradation and virtualisation mechanical rather than per-feature. **One module writes to stdout** — which is what makes the terminal recoverable.

---

## 2. Package split

| | `tui-kit` | `prism-tui` |
|---|---|---|
| Contains | C01–C07, C09–C21, frame structure, 16 default blocks | C08, S01–S15, adapters, manifest content, theme tokens, prefix policy |
| Knows about | Terminals, blocks, transcripts, input, subprocesses | Runs, model versions, deployments, GitOps |

**Extension surface — five hooks.** Manifest content, adapters, theme tokens, prefix policy, dynamic completion sources. A consumer never writes a component: everything renders through blocks, so extending means writing a function from JSON to blocks. React is reached only for pushed views.

```typescript
createTui({
  name: "docker", binary: "docker",
  manifest: "./docker.manifest.json",
  adapters: { ps: adaptPs, images: adaptImages },
  theme: tokens,
});
```

Verbs without an adapter fall through to the fallback renderer, so an app is usable before a single adapter is written.

---

## 3. Decision register

Reasoning lives in the scratchpads. These are the decisions.

### Presentation

| | |
|---|---|
| D1 | Fullscreen alternate-screen with an application-owned viewport |
| D2 | Native scrollback and native text selection are surrendered and reimplemented |
| D3 | Transcript is the spine; the last block is live; two verbs push full-screen views |
| D4 | Live vs pushed is decided by **input ownership**, precisely: a pushed view takes letter keys *while the prompt would otherwise hold focus*, so the prompt must go. A live block may bind letters too, but only once focus has been moved into it (`↓`), and C16 merges those bindings into the `liveBlock` target and withdraws them on freeze. `/ps`'s `f` and `s` are the latter, not the former |
| D5 | Frozen blocks are read-only. They hold stale data; firing an action from one is a footgun |
| D6 | Live state is marked with a `▌` gutter, not inferred from the footer alone |
| D7 | Popping a pushed view returns to a live block with selection preserved, and leaves a one-line trace |
| D8 | Filtering and sorting are view state, not commands — in place, with the rule header recording the applied state and the input bar mirroring the equivalent command as a fill |

### Runtime

| | |
|---|---|
| D9 | Verb logic is not the TUI's. The TUI is presentation and input |
| D10 | The TUI owns a canonical view model; verb JSON is an input to it. The schema is framework-named (`tui.view/1`) — `tui-kit` ships no Prism-branded identifier |
| D11 | Per-verb adapters, pure and fixture-tested, **disposable** — deleting one because the far side converged is a success |
| D12 | A fallback adapter renders any JSON legibly, so neither side blocks the other |
| D13 | Transport is **per-verb**, not global — verbs migrate from subprocess to native independently |
| D14 | Three entry points off one manifest: interactive shell, one-shot bash, agent door later |
| D15 | Every view has a flat non-interactive rendering. A frozen block *is* that rendering |

### Boundary

| | |
|---|---|
| D16 | **argv in, JSON envelope out.** JSON travels one direction |
| D17 | Structure is local: the manifest lets the TUI parse and validate before spawning |
| D18 | Spawn with an argv **array**, never a shell string. The shell is never in the loop |
| D19 | Subprocess, not daemon or FFI. Process isolation and bash parity for 200–400 ms startup |

### Command surface

| | |
|---|---|
| D20 | `/` prefix required for app commands; bare text is a system command |
| D21 | No `!` escape — the collision it existed for cannot occur |
| D22 | App verbs and meta-commands share one flat `/` namespace, marked local-vs-spawn |
| D23 | A token containing a slash after position 0 is a path, not a verb |
| D24 | Displayed `/verb`; spawned `["prism", "verb", …]`; copy-out yanks the prefixed form |
| D24a | The prompt is `❯ ` alone. `(prism) ❯` marked shell mode, which D20 makes unambiguous and the header already carries — it is redundant, and costs nine cells at the 60-column minimum |
| D25 | Tab after `/` completes the manifest; Tab on bare text completes PATH and filesystem |

### Self-containment

| | |
|---|---|
| D41 | The package builds, tests and runs from a clean clone with no Python, no cluster, no monorepo and no network |
| D42 | Transport is an interface with **three** implementations — `EmulatedTransport` for development, `FixtureTransport` for tests, `SubprocessTransport` for production — selected by one environment variable. Nothing else branches on mode |
| D43 | **Tests run against the recorded corpus, never the emulator.** An animated world serving tests becomes the thing tests agree with, and emulator drift then masks regressions silently |
| D44 | The emulator is stateful and animated, because live views, progress bars, sparklines and follow-tail built against static responses are untested until they meet a real cluster |
| D45 | Fixtures are **recordings, not compositions**, carrying provenance. Authoring is the marked, justified, counted exception |
| D46 | `record --diff` scopes the reconciliation before it starts: every delta is one adapter line, and the count is printed before the work |
| D47 | State paths resolve from `PRISM_TUI_STATE_DIR`, so standalone development never writes to a real install |
| D48 | Integration is the five ordered steps of §5, gated on a green conformance suite. If it requires component rewrites or monorepo imports, a rule was broken |
| D49 | **The invocation record lives in `meta`, and `origin` is required.** `argv`, `stderr` and `transport` answer what actually ran without re-running it; they belong in `meta` because a block is content and the invocation is *about* the document, so any inspector reaches them uniformly. `origin` is not a debugging field: shipped optional it would be unset, then unreliable, and the first agent feature is the one that must trust it |
| D50 | **`patch` is a distinct block kind from `diff`, and they never merge.** One is rows of field comparisons, the other hunks of text with line numbers and two palettes. A merged kind's height would depend on which mode it is in, and C09 I1 — measured height equals rendered height — is the invariant that cannot bend. Rendered by C25, registered through C09 exactly as C11 and C12 do |
| D51 | **`status: "proposed"` is reserved now and unused in v1.** Adding a `status` value later is a `tui.view/2` bump under C04 I2's rules, and the bump is the expensive part rather than the field. No adapter produces it: C07 constructs documents from what a command returned, and a proposed change has not run |
| D52 | **The approval half of an agent harness already exists, because `fill` is propose-then-approve.** D8 made `fill` the default so a command is read before it runs; that is the same shape as an agent proposing and a human approving, with the human composing. An agent producing a document whose rows carry `fill` actions needs no new approval mechanism — approval is `fill`, refusal is not submitting, and the audit trail is the transcript. This is the reason the agent direction is cheap, and it will not be obvious to anyone reading this register later |
| D53 | **`SIGCONT` re-acquires and reports; it sets no flag.** C01 owns terminal state and C03 owns contamination, so a `SIGCONT` re-acquisition needs an outbound channel or it is invisible to the only layer that could repaint after one. `onResume` is that channel, and it is the same shape as `onResize`: C01 states a fact about the terminal, L4 decides what it means. The rejected alternative — C01 setting `contaminated` — put one flag under two owners, which is the failure C01 exists to prevent, applied to itself |
| D54 | **Exit codes are 128 + signal, per signal: 130, 143, 129.** One shutdown *path* is a property worth having; one shutdown *code* is a lie to whoever is supervising the process. A fixed 130 reports a user pressing Ctrl-C when the supervisor is what sent the signal |

These were settled before the specs were written and lived only in the working scratchpad, which declares itself uncommitted. They are load-bearing — D43 in particular — and belong in the register.

### Terminal

| | |
|---|---|
| D26 | One module owns every piece of terminal state the process takes from the shell; no escape sequence is written elsewhere. C01 §3 names the keys rather than counting them — three places once said "six" and meant three different sets |
| D27 | Cleanup handlers registered before acquisition; release before printing on fault paths |
| D28 | Alternate screen is the only hard capability. Everything else degrades |
| D29 | No information is carried by colour alone, anywhere |
| D30 | Minimum 60 × 16, with a layout-engine-free fallback below it |
| D31 | Dimensions read as one snapshot, the sole input to a frame. Resize is not debounced |
| D32 | stdout is redirected at startup; every write not made through **C01's `writer`** goes to the debug sink. C01 owns both. "Non-renderer" is defined structurally — the renderer is whoever holds the privileged handle — because once `write` is replaced, no caller is distinguishable from inside it |
| D33 | Contamination forces a full repaint from a cleared screen |
| D34 | Mouse on by default; `/mouse` toggles; copy mode is mandatory; Shift-drag documented as the native-selection bypass |

### Rendering

| | |
|---|---|
| D35 | Blocks are a **registry**, not a closed union; the 16 ship as defaults |
| D36 | Blocks name a **palette slot**, never a colour value. Three palettes ship — `tone` (semantic), `syntax` (code), `spectrum` (decorative art) — and apps may add more, each declaring whether it carries meaning |
| D37 | Every block reports height as a pure function of width. A block that cannot does not enter the vocabulary |
| D38 | No horizontal scroll. Column priority plus minimum width, drop lowest-first, **the expand row is the overflow** |
| D39 | Golden frames at 80 / 100 / 120 / 160 per table, so layouts are reviewed rather than emergent |
| D40 | Caps: 10,000 blocks per document, 100,000 per session, FIFO with a dropped-content marker |

---

## 4. The boundary contract

What the far side must do for `SubprocessTransport` to work. Not our build — asserted by the conformance suite (§6).

| | Requirement |
|---|---|
| B1 | Accepts argv; `--json` is appended by the transport |
| B2 | Emits exactly one JSON document on **stdout** for a non-streaming verb; NDJSON patches for a streaming one |
| B3 | Never writes the payload to stderr. stderr is diagnostics only |
| B4 | Exit codes: `0` ok · `1` operation failed · `2` invocation problem · `130` cancelled. **Cancellation renders as `partial`, not `error`** — the user asked for the stop, and output produced before it stays useful (C07 §4) |
| B5 | A failure carries `ErrorLike` — `message` required; `code`, `stage`, `details`, `remediation` optional. Prism's `{code, stage, message, details}` is a specialisation |
| B6 | Exposes its own tool surface at `<binary> __manifest__ --json` |
| B7 | One operation per verb, reached identically by both front doors — text rendering and JSON envelope differ only in presentation |
| B8 | Honours `SIGINT` within 2 s |

---

## 5. Integration checklist

**Host assumptions.** Node ≥ 22 — Ink 7's floor, not ours; it is a runtime dependency and its requirement is the package's. A TTY whose `TERM` supports the alternate screen. For subprocess transport, the target binary on `PATH`.

**Wiring, in order.** Seven steps, of which one — step 5 — is real work.

1. Point `binary` at the real CLI.
2. Fetch the manifest via B6; replace the shipped fixture manifest.
3. Flip the default transport from fixture to subprocess.
4. Run `record --against <cli>` then `record --diff`. Every structural delta is one adapter line, and the count is printed before any of it is done (C08 §2, D46).
5. Patch the adapters the diff named; re-run until clean; replace the authored corpus with the recorded one.
6. Run the conformance suite. Green means wired.
7. Register adapters for verbs whose fallback rendering is not good enough. Not a blocker — the app works without them.

Step 4 is the one that makes this a bounded job rather than an open-ended one: it prints the size of the work before the work starts.

**What is deliberately not here.** Credential storage, cluster configuration, and verb semantics belong to the far side. The TUI displays identity; it does not own it.

---

## 6. Conformance suite

The wiring gate. For every tool in the manifest, a set of `(argv, expected)` cases asserting:

| Assertion | Failure means |
|---|---|
| Exit code is in `{0, 1, 2, 130}` | B4 violated |
| stdout parses as JSON or NDJSON | B2 violated |
| stderr carries no payload | B3 violated |
| Envelope has the manifest-declared shape | Manifest is stale |
| Failures carry `ErrorLike` | B5 violated |
| `SIGINT` terminates within 2 s | B8 violated |
| Manifest endpoint responds | B6 violated |

Runs in two modes: against fixtures — always green, a regression test on the adapters — and against the real binary, which is the wiring gate. Failure output names the tool and the assertion, so "which tool is wrong" is answered rather than inferred.

---

## 7. Constraints

**Clean-room.** Any custom renderer work (M-T6) is a clean-room reimplementation of architecture and observable behaviour. The referenced tree in the Ink plan appears to contain reconstructed proprietary source; **no files are copied from it**. The techniques — fixed viewport, cell buffers, frame diffing, synchronised updates — are architectural ideas, not licensed code. This governs how M-T6 is built if it is ever built.

**Upstream first.** Layer B is not begun until a measured Layer A limitation is recorded (Appendix B).

**Single-owner stdout.** Diagnostics, subprocess output and debug logging never interleave with frame output.

---

## Appendix A — Extraction from the HTML mockup

Decisions that exist only in that JavaScript and CSS. Captured here so the mockup can be demoted to a visual check.

### A.1 Palettes

Tone resolution is the same in both; only the values change.

**These values were authored from the mockup and corrected to meet C10 §4's floors against both `bg` and `bgElev`.** Nine tones and two `syntax` slots moved; hue and saturation are held, and lightness is the minimum change that clears the floor. The measured ratios are recorded per value, and **C10 T2.4 recomputes them from the shipped tokens** — so this table is an assertion the suite upholds, not a record of intent. The mockup is still the thing anyone would compare against, and it now differs: do not restore its values without re-running that test.

Ratios are `bg / bgElev`. Floors are 4.5 : 1, except `dim` at 3 : 1 and `muted` at 2.5 : 1.

| Tone | Dark | | Light | |
|---|---|---|---|---|
| `default` | `#d4d4d4` | 11.74 / 10.73 | `#383a42` | 10.86 / 9.95 |
| `dim` | `#8a8a8a` | 5.04 / 4.61 | `#696c77` | 5.01 / 4.59 |
| `muted` | `#626262` | 2.85 / 2.61 | `#94959c` | 2.86 / 2.62 |
| `ok` | `#87b86c` | 7.54 / 6.90 | `#3c793c` | 5.04 / 4.62 |
| `warn` | `#d4b35a` | 8.62 / 7.88 | `#916301` | 5.04 / 4.62 |
| `error` | `#d47867` | 5.54 / 5.06 | `#cd2d1e` | 5.04 / 4.62 |
| `info` | `#7faecf` | 7.34 / 6.71 | `#0173a5` | 5.03 / 4.61 |
| `accent` | `#e8a87c` | 8.56 / 7.82 | `#1f60f0` | 5.04 / 4.62 |
| `meta` | `#b89cd2` | 7.23 / 6.61 | `#a626a4` | 5.86 / 5.37 |
| `identifier` | `#7fb8b8` | 7.83 / 7.16 | `#07768c` | 5.06 / 4.63 |

`muted` carries the thinnest margin in the table — 2.61 and 2.62 against a floor of 2.5 — and both variants moved to get there. The dark token was `#5a5a5a`, which measured 2.52 against `bg` and **2.31 against `bgElev`**: not "de-emphasised" but struggling, and struggling on the surface every panel and overlay paints. The figure is recorded rather than only the pass, because a nudge of a few points would break the check and nothing else would say so.

**`syntax`** — nine slots, `lowlight`'s classes mapped in C09 §4a. Same lineage as the tones, so the two read as one design rather than two:

| Slot | Dark | | Light | |
|---|---|---|---|---|
| `keyword` | `#c678dd` | 5.91 / 5.40 | `#a626a4` | 5.86 / 5.37 |
| `string` | `#98c379` | 8.63 / 7.89 | `#3c793c` | 5.04 / 4.62 |
| `comment` | `#676e7d` | 3.40 / 3.11 | `#86888f` | 3.39 / 3.11 |
| `number` | `#d19a66` | 7.07 / 6.46 | `#916301` | 5.04 / 4.62 |
| `key` | `#e06c75` | 5.45 / 4.98 | `#a8432c` | 5.74 / 5.26 |
| `type` | `#e5c07b` | 10.08 / 9.21 | `#7a5401` | 6.50 / 5.95 |
| `function` | `#61afef` | 7.37 / 6.73 | `#1f60f0` | 5.04 / 4.62 |
| `operator` | `#56b6c2` | 7.35 / 6.72 | `#0173a5` | 5.03 / 4.61 |
| `punctuation` | `#abb2bf` | 8.17 / 7.46 | `#383a42` | 10.86 / 9.95 |

`comment` takes the 3 : 1 floor rather than 4.5. Recessive is the requirement, not a compromise on it — a comment that met 4.5 would not be a comment.

Two collisions had to be broken, and C10 I17 is what found them. `lowlight` emits `hljs-attr` and `hljs-literal` in one colour, so **`key` and `number` were identical**; the ninth slot exists precisely because YAML keys had nowhere to go, and a `key` that renders as `number` buys nothing. It takes the attribute red in both variants.

**Light `number` and `type` are the second, and it is the less obvious one.** They were the same hue at different lightness, and correcting both to the floor collapsed them onto one value — the correction *created* the collision, so only recomputation could have found it. `type` moves to a darker gold. That looks arbitrary read cold, and it is not.

**Decorative** — the welcome art only (S02 §2), exempt from contrast floors:

| | Dark | Light |
|---|---|---|
| `spectrum.0`…`spectrum.7` | `#e8736b` `#e89866` `#e8c95e` `#a3d066` `#66c890` `#5fb5d4` `#7a8fe0` `#c187d4` | `#e45649` `#d19a66` `#c18401` `#50a14f` `#0997b3` `#0184bc` `#4078f2` `#a626a4` |
| `spectrum.outline` | `#e8e8e8` | `#383a42` |

`spectrum` keeps the mockup's values untouched. It declares `carries: "decoration"`, which is what exempts it (C10 I15) — several of its light entries are the tone values as they were *before* the correction above, and that is not an oversight. Art is not text, and a rule applied where it buys nothing is a rule people learn to ignore.

The welcome art is **77 cells × 8 rows**, three glyphs (`█` U+2588, `▒` U+2592, space), stored verbatim as a fixture and reproduced in S02 §2. Columns 1–15 are the prism triangle in `spectrum.outline` on every row; column 16 is an unstyled separator; columns 17–77 are the wordmark, its eight rows taking `spectrum[0…7]` top to bottom. Two coloured spans per row, never per-glyph.

Surfaces — dark `bg #1a1a1a`, `bg-elev #222222`, `bg-deep #141414`, `border #2c2c2c`, `border-hi #3a3a3a`; light `#fafafa`, `#f0f0f0`, `#e8e8e8`, `#d3d3d3`, `#c8c8c8`.

**Two diff surfaces**, added with C25 and the first text-bearing surfaces besides `bg` and `bgElev` (C10 §4a) — the line background of an added or removed row:

| | Dark | Light |
|---|---|---|
| `diffAdd` | `#002600` | `#d2ffd2` |
| `diffRemove` | `#490000` | `#fff0f0` |

**It was drafted with four and shipped with two.** The other pair was a stronger background for the precisely changed words within a changed line, which is how every real diff tool does word-level emphasis. Measuring it withdrew it: `syntax.comment` at 3 : 1 and `tone.muted` at 2.5 : 1 are recessive by design and already close to their floors, so the tint that fits is almost entirely spent by the first level — 6 units of one channel left on dark `diffAdd`, 9 on dark `diffRemove`, 7 on light `diffRemove`. That is not a second level. C10 §4a carries the table and names `underline` as what word-level emphasis has instead, it being the one style channel nothing else claims.

Twelve slots clear their floor against each of the two, in both variants — the nine `syntax` slots and `tone.ok`, `tone.error`, `tone.muted`, the three the gutter uses, because the background covers the whole row. **48 ratios, and C10 T2.14a recomputes every one from the shipped tokens**, so this table is an assertion the suite upholds exactly as the palettes above are.

| Slot | Floor | Dark `diffAdd` | Dark `diffRemove` | Light `diffAdd` | Light `diffRemove` |
|---|---|---|---|---|---|
| `syntax.keyword` | 4.5 | 5.58 | 5.56 | 5.52 | 5.52 |
| `syntax.string` | 4.5 | 8.16 | 8.12 | 4.75 | 4.75 |
| `syntax.comment` | 3 | 3.21 | 3.20 | 3.20 | 3.20 |
| `syntax.number` | 4.5 | 6.67 | 6.64 | 4.76 | 4.76 |
| `syntax.key` | 4.5 | 5.14 | 5.12 | 5.41 | 5.41 |
| `syntax.type` | 4.5 | 9.52 | 9.47 | 6.13 | 6.13 |
| `syntax.function` | 4.5 | 6.96 | 6.92 | 4.76 | 4.76 |
| `syntax.operator` | 4.5 | 6.94 | 6.91 | 4.75 | 4.75 |
| `syntax.punctuation` | 4.5 | 7.71 | 7.68 | 10.25 | 10.25 |
| `tone.ok` | 4.5 | 7.13 | 7.09 | 4.75 | 4.75 |
| `tone.error` | 4.5 | 5.23 | 5.21 | 4.76 | 4.76 |
| `tone.muted` | 2.5 | **2.70** | **2.68** | **2.70** | **2.70** |

`muted` carries the thinnest margin here as it does against `bg` and `bgElev`, and for the same reason: it is the quietest thing that must still be readable, so it is what every new surface is bounded by. The figures are recorded rather than only the pass, because a nudge of a few points would break the check and nothing else would say so.

**The two hues are not symmetric in channel terms, and that is arithmetic rather than an authoring slip.** Luminance weights green at 0.7152 and red at 0.2126, so the same luminance budget buys a dark theme 73 units of red tint and only 38 of green, and a light theme 45 of green and only 15 of red. The four values look balanced on screen and their hex does not.

**Authored against the check rather than before it**, deliberately. The palette correction above is the precedent: the light `number`/`type` collision was *created* by correcting both values to the floor, so only recomputation could have found it. Values chosen from a picture and recorded as if measured is the failure this appendix exists to prevent — and here the measurement did not move a value, it removed a design.

**Discrepancy:** `j22` commits to "Solarized Light". The mockup implements **Atom One Light**. The mockup's is the better-engineered palette and the one to keep; the journey's wording is wrong.

### A.2 Algorithms

- **"Did you mean"** — Levenshtein with a **distance-2 cutoff**, applied to unknown verbs, unknown slash commands and unknown deployment names. Below the cutoff, suggest; above it, fall back to a generic hint.
- **Completion common prefix** — with multiple matches, advance while every candidate shares the character at index `i`; complete to that prefix and show the menu beyond it.
- **Sparkline** — window the series to the last 8 points, map to `▁▂▃▄▅▆▇█` by normalised position within `[min, max]`.
- **Braille plot** — 2×4 dot mapping per cell, Bresenham line-draw between successive points, axis labels at max / midpoint / min, x-labels at left / centre / right.
- **Client-side sort** — must keep detail rows paired to their parent row when reordering.

### A.3 Wording

Verbatim from the mockup; these are considered messages, not placeholders.

| Situation | Message |
|---|---|
| `$_` unset | `no previous result · submit or promote something first` |
| Removed subverb | `use bare <verb> for the list. list is no longer a subverb.` |
| Unknown verb | `unknown verb: <x> — did you mean <y>?`, else `— /help for verbs` |
| Promote, wrong kind | `refused: <uuid> is kind=experiment` + `only kind=candidate ModelVersions can serve real traffic. resubmit via production submit.` |
| Promote, wrong status | `refused: candidate must be status=succeeded (currently <status>)` |
| Experiment submit, dirty tree | `⚠ uncommitted changes detected in <file> · cluster will run HEAD (<sha>), not your working tree` |
| Production submit, dirty tree | `✗ uncommitted changes detected in <file>` + `Production submissions require a clean working tree — the candidate YAML records HEAD's SHA as the immutable image tag.` + `hint: experiments accept dirty trees (experiment submit); this verb does not. Commit first.` |
| Promotion boundary | `CODEOWNERS auto-merge is OFF on serving/. tag a reviewer in the MR. this is the promotion boundary — the CLI cannot bypass it.` |

**The dirty-tree asymmetry is a designed decision, not an accident:** experiment submit *warns* and proceeds; production submit *refuses*. Both messages above are load-bearing.

### A.4 Layout

- **Filter pills are two rows** — kind row, then status row. Not one wrapped row.
- **Sort indicators** — ` ↑` / ` ↓` appended to the active column header.
- **Density** — no blank line between a rule and its content; one blank line between blocks.
- **Timing** — command duration right-aligned, dim, after the block; suppressed under 50 ms.
- **UUIDs** — 7 characters in lists, full in detail.

---

## Appendix B — M-T6 decision gate

M-T6 is not scheduled. It is built only if M-T3's measured baseline shows a limitation. Fill this from real numbers; do not estimate.

| Metric | Layer A result | Threshold suggesting Layer B |
|---|---|---|
| Bytes written per frame | | Sustained > 100 KB on a typical repaint |
| Median frame construction | | > 8 ms |
| p95 frame construction | | > 16 ms |
| Resize corruption count | | Any non-zero |
| 10k-line Page Down latency | | > 50 ms |
| Streaming CPU | | > 25% on a single core |

Any threshold crossed justifies the experiment. None crossed means upstream Ink is sufficient and M-T6 is closed.

---

## Commitments

1. Everything renders through the block vocabulary; nothing draws to the terminal directly.
2. One module writes to stdout.
3. Two packages from the first commit; `tui-kit` carries C01–C07 and C09–C21.
4. Five extension hooks; a consumer never writes a component.
5. The forty decisions in §3 are the register; the scratchpads are archive.
6. The far side satisfies B1–B8; the conformance suite asserts it.
7. Wiring is seven ordered steps, of which one is real work; `record --diff` scopes it beforehand and green conformance is the gate.
8. M-T6 is clean-room, and gated on Appendix B measured, not estimated.
9. Appendix A is authoritative for palettes, algorithms and wording; the mockup is demoted to a visual check.
10. Where `j22` and Appendix A disagree — the light theme — Appendix A wins.
11. The self-containment decisions D41–D48 are part of the register, not only of the working scratchpad.
12. Tests run against the recorded corpus and never against the emulator (D43).
