# The design notes read against the tree — feature by feature

| | |
|---|---|
| **Date** | 2026-09-03, at `86d3b191` on `feat/plot-arm-unification` |
| **Line citations** | as of that commit. **They will drift.** A `file:line` here is where the symbol was on the day; the symbol is the durable half, so grep the symbol when a line no longer matches. |
| **What this is** | every design note and design document in `docs/notes/` and `docs/design/`, read one designed feature at a time, with a verdict measured against `src/` and `test/` rather than against another document |
| **What it is not** | a plan. Nothing here is scheduled by being listed. The *disposition* column says what the absence means, and only `owed now` names work |

**Why a fourth column.** BUILT / PARTIAL / ABSENT is the measurement. It is not the finding, because
an absent feature is four different things: a forward feature whose absence is not a gap
(`planned`); a feature that shipped under a name the note does not know (`built under another
name`, and the symbol is named); a sentence in the note that is false, with the figure that
falsifies it (`note was wrong — figure`); or a small, clearly-substrate piece that a lane or a
symbol is already responsible for (`owed now`). Three notes treat the widget system as present
and it is zero lines; one note says 3D is refused and it has four source files. Those are the
same verdict — ABSENT, BUILT — and opposite dispositions, and a table with three columns cannot
say so.

**The method** is the one CLAUDE.md records under *ask where a settled claim is written down*:
a claim carried from note to roadmap to spec acquires the authority of a ruling without having
been one, so each row below resolves to a symbol or to the grep that establishes absence, and a
row that resolves only to another document is marked as such. Spot-checks run by hand before
writing: `markdownBlocks`, `CHIP_LINES`, `AskOptions`, `putBlock`, the `East_Asian_Width`
comments in `glyphs.ts`, `selectionSpans`, the `camera`/`azimuth`/`elevation`/`halfBlockRows`
counts, the four `window` declarers, `frame.ts`'s four regions, `GLYPH_TABLE`, `ACTION_KINDS`,
`elementsIn`'s single caller, `cursorPositions`'s missing writer, `confirm.ts`'s empty-choice
rejection, both `QUADRANT` tables, `pulse` in `tools/spinner.js`, `dither.ts`'s header,
`PLOT_FORM_MEMBERS`, `horizonFigure`, `usageBlocks`, the `beautiful-mermaid` declarations. One
of the twenty-one disagreed with the reading it was checking — `putBlock` — and that row carries
the correction.

**Disagreements between notes are their own rows**, in the last section before the arcs. Where
two notes disagree, at most one of them is right and often neither; the roadmap's own status
table is treated as a third witness rather than as the arbiter, because two of its rows are
wrong about the tree (17 and the `camera` count) and are corrected in this pass.

---

## 1 · `docs/design/AGENT_TUI_DESIGN.md`, `AGENT_TUI_STEP0.md`, `PRISM_TUI_REDESIGN_NOTE.md`

**Headline.** There is no agent-tui. No `examples/agent`, no package, no workspace entry —
`package.json:6-9` lists `examples/docker` and `examples/plots`; the `examples/` directory holds
`docker`, `minimal`, `plots`. Step 0 ran (probes at `AGENT_TUI_STEP0.md:154-259`; `:27` "Nothing
was installed"); steps 1–9 produced nothing; the only residue in the tree is `tools/spinner.js`.
The design is `planned` as a whole, and what follows is which of its *framework* asks landed.

### 1a · The grammar — §9a

| what | verdict | measurement | disposition |
|---|---|---|---|
| `⏺` step marker (`:524`, `:527-531`) | ABSENT | zero hits for `⏺` in `src/` and `test/`; `GLYPH_TABLE` (`src/presentation/blocks/glyphs.ts:790-813`) has 14 slots and none is a step; `running: ["●","*"]` is a homonym | planned — two glyph slots ≈10 lines, but the rendering that uses them is the app's |
| `⏺ → *` ASCII pair (`:539`) | ABSENT | same grep | planned, with the slot |
| `⎿` continuation (`:524`, `:545`) | BUILT | `glyphs.ts:812 continuation: ["⎿","`"]`; `prefixCells` in `kinds/simple.ts`; `test/contract/continuation.test.ts` | — |
| `▸`/`▾` collapse pair (`:541`) | BUILT | `glyphs.ts:807-808 expand/collapse`; the `expand` action `types.ts:196,236`, dispatched `shell/actions.ts` | — |
| `⟩` open question (`:530`, `:543`) | ABSENT | no slot; the confirm draws `glyph: "warn"` (`shell/confirm.ts:193`) | planned |
| `❯` prompt gutter (`:531`) | BUILT | `shell/config.ts:42 PROMPT_FORMS` | — |

### 1b · The activity region — §3 A7, §9a, §17

| what | verdict | measurement | disposition |
|---|---|---|---|
| a fifth frame region above the prompt | ABSENT | `src/shell/frame.ts:33-46` builds four (`header`, `region`, prompt, `footer`); `frame.ts:128` asserts `HEADER_ROWS + region.height + promptRows + FOOTER_ROWS === rows`; `activityLine` in `kinds/status.ts` is a homonym | planned — own arc, downstream of roadmap 29 |
| in-flight-only · held-when-cancelled · collapse-at-cap | ABSENT | no producer; the prompt cap at `frame.ts:81` is real and unreused | planned, with the region |
| todo checklist `◻ ◼ ⋅ ✻` (`:1420-1456`) | ABSENT | `◼`/`◻` exist only as the `squares` bar style (`glyphs.ts:734`), `narrowOnly` | planned |
| "`◻` `◼` `⋅` are narrow" (`:1423-1425`, `:1440`) | — | **note was wrong**: `glyphs.ts:685-690` measures `◼ ◻` `East_Asian_Width=Ambiguous`; `glyphs.ts:400-402` measures `⋅` U+22C5 Ambiguous, "exactly like the character they were chosen to replace" | note was wrong — figure; corrected in place 2026-09-03 |
| "`▐ ░` narrow" (`:1036-1037`) | — | **note was wrong**: `glyphs.ts:685` lists `▐ ░` among the eleven Ambiguous bar glyphs; `braille` is the only width-stable unicode bar style | note was wrong — figure; corrected in place 2026-09-03 |
| chrome seam "already takes a `ChromeFn`" (`:1508`) | PARTIAL | `ChromeFn` (`shell/types.ts`, `shell/chrome.ts`) is block-returning, true; but `HEADER_ROWS = 1` / `FOOTER_ROWS = 1` (`frame.ts:65-66`) are constants, so a region returning more than one row's worth has nowhere to go | planned — this is roadmap 29 |

### 1c · The three-line footer — §3 A8, §16

| what | verdict | measurement | disposition |
|---|---|---|---|
| three footer rows | ABSENT, structurally refused | `frame.ts:66 FOOTER_ROWS = 1`; default footer empty (`chrome.ts`) | planned — own arc, downstream of 29 |
| context-bar segments | ABSENT | bar primitive exists (`BAR_STYLES glyphs.ts:717-740`); no segment model | planned |
| `calls n/max` / `stopWhen` | ABSENT | no `ai` package in `package.json` | planned, with the app |
| permission mode `~ ? + » !!` | ABSENT | every `"auto"` in `src/` is `plotStyle`/`plotDetail`/`treeLayout` | planned |
| tok/s · cost · git dirty | ABSENT | — | planned |
| width audit (`:1036-1043`) | BUILT as knowledge | `glyphs.ts:685-690`; `test/contract/spinners.test.ts` T2.71 `EMOJI_FORMS` incl `⚡` — with the one correction in 1b above | — |
| §16 carries two layouts | — | `:1292` strikes *The layout — one row* and `:1293` re-declares it live; the drop rules at `:1155-1158` and `:1299-1319` differ | note is inconsistent with itself; reconcile before building 3 |

### 1d · Step 0's findings, and whether each landed

`AGENT_TUI_DESIGN.md:15-17` says four findings moved the document; `AGENT_TUI_STEP0.md` produced six.

| finding | landed in the design? | in the tree |
|---|---|---|
| S0-1 fifteen part types; three verbs over an id | yes, §2 `:96-102` | `append`/`patch`/`settle` on `TranscriptStore` (`src/viewport/transcript/types.ts:110,128,142`). **`putBlock` exists but is not this**: it is `DocumentView.putBlock` (`src/shell/document-view.ts:107,316`), the pushed view's total block replace, and it is not a C13 verb. The design's *"`putBlock` then `settle`"* names the wrong component's method — corrected in place 2026-09-03 |
| S0-2 tool-call arguments stream; A2 has no state for *name known, arguments partial* (`STEP0:73-83`) | **no** — §3 A2 `:155-169` and §9c `:578-588` still draw three states with complete arguments | — (the app's) |
| S0-3 reasoning 90 parts to text 22 | yes, `:18-21`, §6 | — |
| S0-4 ids collide across steps; address is `(step, part id)` (`STEP0:106-122`) | yes, §2 `:104-107` | `transcript.patch(id)` is keyed on a flat `EntryId`, so the silent merge the finding warns about is available; no composite type | planned, with the app |
| S0-5 parser risk | yes, §5 | — |
| S0-6 | recorded, not acted on | — |

### 1e · The spinner — §13

| what | verdict | measurement | disposition |
|---|---|---|---|
| `pulse` `✢ ✲ ✱ ✻ ✱ ✲` (`:748-755`) | ABSENT from the product | `tools/spinner.js:30` only; `SPINNER_SETS` in `glyphs.ts` has no `pulse`; `grow` is a different sequence | planned — ~6 lines if wanted |
| `bloom` (`:759-761`) | PARTIAL | the name landed (`glyphs.ts` `bloom`), the sequence differs (14 frames against the note's eight) | built under another name — same name, different frames; record rather than change |
| one-cell / no-emoji assertion | BUILT | T2.70–T2.72 in `test/contract/spinners.test.ts` | — |
| ASCII fallback | BUILT | `glyphs.ts:529-536` | — |
| tick from the refresh driver | BUILT | `shell/refresh.ts:160-163` | — |

### 1f · Everything else in the design

| what | verdict | measurement | disposition |
|---|---|---|---|
| `AskOptions` carries `placement`, `dismissable`, `onSelect`; `resolve(text)` (`:24-25`) | — | **note was wrong**: `src/shell/local/registry.ts:32-52` — `question`, `detail`, `choices`, `placement` only; `onSelect` occurs nowhere in `src/`; `dismissable` is a `Layer` field (`viewport/overlay/types.ts:51`) and the registry's `:109` says it is *deliberately absent* from `ask`; `ask` resolves a choice key | note was wrong — figure; corrected in place 2026-09-03 |
| markdown "still absent … the only hard gate left" (`:28-29`, `:288`) | PARTIAL | `markdownBlocks` (`src/data/viewmodel/markdown.ts:107`), exported `viewmodel/index.ts:95`, `b.markdown` (`shell/builders/index.ts:1659`), `test/contract/markdown.test.ts`; roadmap 11 PART — the block half landed, inline stays literal (entry 50) | note was wrong — figure; corrected in place |
| scrollable containers "blocked on C26" (`:291`, `:974`) | BUILT | roadmap 46 BUILT (`CALCIUM_ROADMAP.md:3974`); `Scroll` kind, `scroll-offsets.ts` | note was wrong — figure; corrected in place |
| paste chip "Designed, unbuilt" (`:686-688`) | PARTIAL | `CHIP_LINES = 5` (`src/shell/construct.ts:151`), `[#n pasted · N lines]` emitted at `:1531-1534`; roadmap 30 PART — the prompt half; the transcript half is not | note was wrong — figure; corrected in place |
| stall notice "the driver fires a notice when a stream goes quiet" (`:1630`) | BUILT | **this row said ABSENT for a few hours on 2026-09-03 and the grep it cited was wrong**: `grep -rni stall src/` returns fifteen hits — `src/shell/refresh.ts` `STALL_MS`, the per-entry watched map, the re-arming tick, `resolveStall`; wired at `execution.ts` (`refresh.watch`, `refresh.sawPatch`, `refresh.settled`); C23 §3b, I25, T1.30/T1.37/T6.30; `tools/mutate/runs/c23-refresh.mjs`. The streaming *timeout* of 0 is a different mechanism (the child's lifetime, not its silence) | note was right; the audit was wrong — restored in place, with the one residue: the threshold is a constant, not per far side |
| popup with five consumers (§15 `:894-900`) | PARTIAL | roadmap 16 BUILT; `confirm.ts:259-263` rejects an empty choice list, so the `none` arm §15 `:938` calls legal is refused | planned |
| payload replaced, not marked (§15 `:944-954`) | BUILT | `confirm.ts:173-204` | — |
| fullscreen patch view (§15 `:961`) | BUILT | `src/shell/patch-view.ts`; `construct.ts` wiring | — |
| "panel has no collapsed state" (§4 `:286`, `:818`) | ABSENT and correct | `Panel` `types.ts:2515-2545`; `collapsedBefore/After` on `Hunk` is a homonym | — |
| semantic copy (§11 `:673`) | BUILT | `shell/keys.ts` copy-mode handlers; roadmap 15 BUILT | — |
| scroll anchor (§3 A5 `:222`) | BUILT | `viewport.ts #afterContent` | — |
| C13 cap (§3 A5 `:220`) | BUILT | `transcript/cap.ts SESSION_BLOCK_CAP` | — |
| elapsed tick (§9c `:585`) | BUILT | `refresh.ts` | — |
| "the pending entry" (§17 `:1415`) | ABSENT as named | nearest is `append(doc, { streaming: true })` | definite article in no file |
| "the block docker-tui built for `/drift`" (§11 `:684`) | — | `/drift` is a verb over `table` + `change`, not a block | definite article in no file |
| `ToolDef.approval` (§18 `:1537`, §21 `:1694`) | ABSENT | zero hits; `shellOnly` is real (`src/data/manifest/types.ts:88`, `validate.ts`) | planned, with the app |
| ten slash verbs (§10 `:620-638`) | ABSENT | only `/clear`, with different semantics (`local/handlers.ts`) | planned, with the app |
| prefix-out "(#27)" (`:622`) | — | roadmap 27 is syntax highlighting (`:3552`); prefix-out is **32** (`:3627`) | mis-citation; corrected in place |
| "#28 — the chrome row budget" (`:1769`, `:1785`) | — | roadmap 28 is prompt cursor-following, BUILT (`:3555`); the chrome budget is **29** (`:3565`) | mis-citation; corrected in place |
| §24 AI SDK items | ABSENT | no `ai` dependency | planned, with the app |
| `PRISM:107-114` manifest as tool schema | PARTIAL | `ToolDef` carries name/summary/args/flags; no bridge to any model API | planned |

### 1g · Definite articles that resolve to no file

`putBlock` as a transcript verb (a different component's method exists); `AskOptions.dismissable`
and `.onSelect`; the `/drift` block; the pending entry. The **pinwheel** exists
— as a mosaic tiling (`types.ts:2797,2823`) — and has nothing to do with agent-tui.

---

## 2 · `docs/notes/CALCIUM_LIVE_TERMINAL.md`

Framing the note leans on: `Block` is a closed union of **21** kinds
(`src/data/viewmodel/types.ts:2917-2938`); the builder `b` exports **39** keys at `dist/index.js`,
of which the block builders are about thirty and the rest are `id`/`ok`/`warn`/`error`/`dim`/
`meta`/`fill`/`exec`/`open` helpers. `node-pty` is a devDependency with **zero importers in
`src/`** — its only importer is `test/support/pty.ts` — so the note's *already built: node-pty in
the tree* is true of the harness and not of the product.

| what | verdict | measurement | disposition |
|---|---|---|---|
| A1 terminal emulator (`:46`, `:56-62`) | ABSENT | no parser, grid or mode set anywhere; `terminal/escapes.ts` is emit-only | planned — own arc, 1,500–3,000 lines or a dependency (new C27); step 1 *measure `@xterm/headless`* is the gate |
| A2 constrained parser | ABSENT | `router/decode.ts` decodes keyboard input — the opposite direction; `stripControls` discards | planned, with A1 |
| A3 PTY block kind | ABSENT | `logs` windows already-captured text (`structured.ts:217`) | planned, with A1 |
| A4 `/tty` handoff is this | — | **confirmed not this**: `execution.ts:714 runHandoff` suspends, hands over, appends a notice, keeps nothing | — |
| A5 alt-screen detection | ABSENT | `1049` appears only in `escapes.ts` as the app's own | planned, with A1 |
| A6 "a line-oriented block is a scroll container" | PARTIAL | `Scroll` (`types.ts:2653`), `kinds/containers.ts`, `ctx.scrollOffsets`, `b.scroll` all built; the content *source* is not | planned — the container is done |
| A7 attach = a `pushedView` push | PARTIAL | `"pushedView"` `FocusTarget` (`router/types.ts:26`), `createDocumentView` open/fill/patch/pop, ten bindings in `router/keymap.ts`; every caller pushes a `ViewDocument`, nothing attaches a process | planned — ~150 lines after A1 |
| A8 "⏎ to attach" | ABSENT | `ACTION_KINDS` closed at five (`types.ts:250-256`: `fill exec open expand view`) — a sixth is a C04 spec change | planned |
| A9 what-changed line on detach | ABSENT | `TranscriptEntry` (`transcript/types.ts:18-31`) has `seq`, no timestamp | planned, ~60 lines |
| A10 `⌃c` split | ABSENT | — | planned, ~20 lines after A7 |
| A11 escape policy (`:225`) | ABSENT | stated as an invariant with no register to hold it | planned |
| A13 SIGWINCH "coalesce on the frame scheduler's window" | ABSENT | **note was wrong**: roadmap 19 PART `:3411` — resize is *never* coalesced (C03 I2/I15) | note was wrong — figure |
| A14 declared height | BUILT | `Scroll.height` (`types.ts:2657-2661`) | — |
| A15 settle policy | ABSENT | `transcript-persist.ts` persists whole documents | planned |
| A16 scrollback cap "D40's shape" | PARTIAL | D40 caps *blocks* not rows (`transcript/cap.ts`); rows-in-one-block is roadmap 17 PART | planned |
| A17 §6b bounded-by-default (`:286-290`) | REFUSED | roadmap 46's own text `:3990-3994`: *an app that wraps a 400-line result in a container there has chosen to hide 380 rows*; `types.ts:2647-2651` | note was wrong — the roadmap ruled the opposite on the same example |
| A18 borderless default | PARTIAL | `plotFrame` is Plot's only | planned |
| A19 "the activity region" (`:211`) | — | `types.ts:2648` says *an* activity region in a prose list; no surface | definite article in no file |
| A20 golden of a live block | ABSENT | — | planned, with A1 |

---

## 3 · `docs/notes/CALCIUM_WIDGETS_DESIGN.md`

| what | verdict | measurement | disposition |
|---|---|---|---|
| B1 slider | ABSENT | zero matches | planned |
| B2 checkbox · radio · switch · segmented · stepper · dial · text input | ABSENT | zero matches each | planned |
| B3 button | PARTIAL | **built under another name**: `Action` (`types.ts:232-248`) on `TableRow.actions`, `Pills.actions`, `Tip.actions`, dispatched `shell/actions.ts:73-101`; `Table.actionBar` — the note does not know | built under another name — `Action` |
| B4 series toggle, "build first" | ABSENT and the target field is missing | `Series` (`types.ts:845-885`) has no `hidden`; the legend (`plot/definition.ts:636-677`) declares no `elements` | planned — ~250 lines across C04/C12/C26; **not** the cheapest first step the note says it is |
| B5 XY pad · range slider | ABSENT | — | planned |
| B5 select | PARTIAL | the popup is roadmap 16 BUILT; `ask` is a promise the app awaits, not a widget | planned |
| B6 readout · gauge · status | BUILT | `KeyValue`, `Progress`, `Status` | — |
| B7 value store | ABSENT, pattern exact | `RenderContext.scrollOffsets`/`cursorPositions` (`blocks/types.ts:107-108`), threaded `render-lines.ts:45`, owned by `construct.ts`, evicted — but **`cursorPositions` has a reader (`plot/definition.ts:2112`) and no writer** (`blocks/types.ts:150` says so), so the pattern is half-dead | owed now — ~120 lines, the keystone; build the writer with it |
| B8 `bind:` | ABSENT | `ViewPatch` replace exists (`types.ts:2944-2947`), so the mechanism half is real | planned |
| B9 bind-target list | 11 of 14 exist | `series[].hidden`, `annotations[].hidden` absent; `palette` **removed on a ruling** — `plot/marks.ts:56-72` *"a knob that turns nothing"*, roadmap 51 fixed the categorical set | note was wrong about `palette` — figure |
| B10 computed binding | — | the note correctly states its own impossibility (a closure is not JSON; `Series.values` `types.ts:850-856` same reasoning) | — |
| B11 `onChange` | ABSENT | `viewport.ts` hits are unrelated | planned |
| B12 controls block | ABSENT | — | planned |
| B13 "a widget is an element" | PARTIAL and thinner | `NavElement`/`ElementAddress` (`router/types.ts:84`), `resolveFocus` (`focus.ts:122`) exist; **exactly one kind declares `elements`** (`table/definition.ts:111`); `elementsIn` has **one caller**, `liveElements` (`construct.ts:1213`), reading the live entry only — so no element outside the live entry is focusable; roadmap `:3125-3128` names that by symbol | planned — widen `liveElements` first |
| B14 `mergeBlock` | BUILT symbol, UNINHABITED | `router/keymap.ts:74`; roadmap `:3145-3155` — throws on collision with `global`/`liveBlock`; the note's key table (`:189-199`) binds up/down/pageup/pagedown/escape, all already at `liveBlock`/`pushedView`, so every widget trips the throw | planned — the collision rule must be re-ruled first |
| B15 mouse | ABSENT | — | planned |
| B16 degradation | ABSENT / untested | — | planned |
| B17 refuse-at-construction | ABSENT, seam exists | `validate.ts` | planned |
| "the popup … five consumers" (`:197`) | — | resolves to roadmap 16 BUILT; entry 10 PART's residue is the in-transcript form the note wants | definite article resolves, to a different thing |
| "the hit test" (`:208`) | — | `focus.ts:72` returns `pushedView` before the element check; `elementsIn` reads `liveId` | definite article — half exists |
| "the legend is already the right surface" (`:60`) | — | drawn, yes; no `elements`, no field | half true |

---

## 4 · `docs/notes/CALCIUM_DATAFRAME_IDEA.md`

| what | verdict | measurement | disposition |
|---|---|---|---|
| C1 column profiler | ABSENT | zero for `profiler`/`dtype`/`cardinality`/`nullCount`; nearest `summariseSeries` (`distribution.ts`), one dtype | planned |
| C2 `b.table` computes something | — | `b.table` (`builders/index.ts:242-292`) computes nothing | — |
| C3 sparkline header | ABSENT | inputs BUILT — `Cell.spark` (`types.ts:266`), `Cell.bar` (`:280`); `Table` header has only `showHeader` | planned |
| C4 "C11 with virtualisation" | BUILT | `table/definition.ts:157 window` — **the note is right and roadmap row 17 was wrong** (corrected 2026-09-03) | — |
| C5 lazy rows | PARTIAL | render is lazy; the model is materialised | planned |
| C6 file reader | ABSENT | the note itself says profiling is remote (`:110-121`) | planned |
| C7 header as a control | PARTIAL | `Action "view"` (`types.ts:248`); `ColumnDef.sortable`/`role`; the header is not an element | planned |
| C8 filter model | ABSENT | runs into the `presorted` trap (`types.ts:507-524`; `kindOf` reclassifies a slice) | planned — own arc, after C1 |
| "35 forms" (`:52`) | — | `PLOT_FORM_MEMBERS` (`validate.ts:2159-2173`) has **47** | note was wrong — figure (it was true when written) |
| `Cell.spark`/`Cell.bar` "already shipping" (`:50`, `:54`) | BUILT | resolves fully | — |

---

## 5 · `docs/notes/PRISM_NOTEBOOKS_IDEA.md`

An idea, and `:1` says so. Two sections are designs: §the editable cell (`:154-179`) and §the keep
checkbox (`:185-211`).

| what | verdict | measurement | disposition |
|---|---|---|---|
| D1 N editors | ABSENT | `createEditor()` is called once (`construct.ts`) | planned — and should not be built; D2 instead |
| D2 movable anchor (`:177-179`) | ABSENT | `resolveFocus` exists; ~300 lines | planned — the cheap version of D1 |
| D3 keep flag | ABSENT | `TranscriptEntry` has no `keep`; `persists(policy, doc)` (`src/shell/transcript-persist.ts:92`) is already a per-document predicate | owed now — ~80 lines, the smallest real item in these four notes |
| D4 re-run from a settled entry (`:88`) | — | `rerun(index)` (`history/store.ts`) returns a string, unrelated; `actions.ts:77` **refuses actions from frozen entries** — the exact rule a re-run must overturn | Lane D is ruling |
| D5 cell ordering | ABSENT structurally | `TranscriptStore` is append/patch only (`transcript/types.ts:100-120`); Fenwick index in `viewport.ts` | planned — own arc |
| D6 notebook file | PARTIAL | `PersistedRow` (`transcript-persist.ts:237-255`) | planned, small |
| D7 export | ABSENT | zero for `asciinema`/`toHtml`; `plot/svg.ts` is the uncited precedent | planned — own arc |
| D8 sharing | BUILT by construction | persistence writes whole `ViewDocument`s | — |
| "four things landed independently — widgets" (`:14`) | — | **note was wrong**: widgets are zero lines (§3) | note was wrong — figure |

---

## 6 · `docs/notes/CALCIUM_ML_BLOCKS.md`

| what | verdict | measurement | disposition |
|---|---|---|---|
| ML-1 per-token value text block (`:24`) | ABSENT | 30 `kind:` literals in `types.ts`, none token/span; `Cell` is `{text,tone,glyph,spark,bar}`; `Raw` is `{text}`; no `Span[]` | planned — own arc; the same mechanism roadmap 50's inline emphasis wants |
| ML-2 structured diff (`:66`) | ABSENT | `Patch` is line-oriented (`types.ts:2441,2450`); `patch/collapse.ts` fold reusable | planned, after ML-1 |
| ML-3 progress throughput / ETA (`:82`) | ABSENT | `Progress` (`types.ts:2372-2392`): `kind id label current total style` — no rate, eta, elapsed or spark | planned, small |
| ML-4a metrics table with `Cell.spark` | BUILT | `types.ts:266` | — |
| ML-4b ridgeline / histogram | BUILT | `PLOT_FORM_MEMBERS` | — |
| ML-4c line | BUILT | — | — |
| ML-4d utilisation | BUILT | `types.ts:986` | — |
| ML-5a lineage "blocked on graph layout" (`:147`, `:178`) | PARTIAL | **the blocker is gone**: `graph` is a `PlotForm` (`types.ts:985`, `src/presentation/plot/graph.ts`), `tree` too; no lineage vocabulary | planned; blocker corrected in place 2026-09-03 |
| ML-5b cost | ABSENT as a feature | substrate BUILT (`KeyValue`, `Progress`) | planned, smallest |
| "worth measuring whether beautiful-mermaid can be handed a generated graph" (`:149-150`) | — | moot: Calcium has `graph` | superseded |
| ML-T tensor (roadmap 3's other half) | ABSENT | zero hits for `tensor`/`dtype` in `src/`; roadmap `:4377` said *`tensor` and `heatmap` occur zero times* — `heatmap` is now BUILT (`plot/heatmap.ts`; `confusion`, `correlation`), so of entry 3's names three of four are built | planned — multi-day, not an arc; design at `CALCIUM_ENTRY3_KICKOFF.md:262-263` |

---

## 7 · Images — `docs/notes/TUI_NOTE_images.md`, `CALCIUM_IMAGES_NOTE.md`

| what | verdict | measurement | disposition |
|---|---|---|---|
| IM-1 `Image` type | BUILT, shape changed | `types.ts:2683-2701`: `data` (base64), `height` (not rows/cols), `alt`, `digest`; `path` read at construction | — |
| IM-2 `alt` required | BUILT | `types.ts` `alt: string` | — |
| IM-3 kitty placeholders | BUILT | `image/kitty.ts PLACEHOLDER`; `test/unit/image-placeholder.test.ts` | — |
| IM-4 dither | BUILT larger than designed | `image/dither.ts` `bayer` over `BAYER8` (8×8, `:72`), not the 2×4 the images note cites; `dither.ts:31-34` says why 4×4 was wrong; `dither.ts:1-8` — *the first arm rather than the last* | — |
| IM-5 half-block rung | BUILT | `image/halfblock.ts` `HALF_BLOCK`, `HALF_BLOCK_LOWER`, `halfBlockEligible`, `halfBlockRows`; consumed `kinds/image.ts` | — |
| IM-6 overlay fork | BUILT and decided per arm | `types.ts:2702-2720`, `alpha`; `image/overlay.ts` | — |
| IM-7 sample grid | PARTIAL | composed and tested via `Group`/`Mosaic` (`test/unit/image-grid.test.ts`); no kind; `Cell` cannot hold an image | planned |
| IM-8 plots as images | BUILT | `plot/svg.ts` exported from `src/index.ts`; `plotStyle` has no `"svg"` member — the second renderer is a sibling entry point, not a style | — |
| IM-9 regression gate | BUILT | `plot-shared-geometry`, `plot-arm-disagreement`, `plot-arm-unification` tests | — |
| IM-10 Mermaid HD | ABSENT | `src/presentation/mermaid.ts` ~60 lines, one render call at `:54`, `colorMode: "none"` | planned, small |
| IM-11 sixel | ABSENT, correctly | — | — |
| `TUI_NOTE_images.md:5` "Nothing committed. Phase 1B at the earliest" | — | **note was wrong at HEAD**: six files in `src/presentation/image/`, eight `test/unit/image-*.test.ts` | corrected in place 2026-09-03 |
| "the 3D renderer's ordered-dither over a 2×4 Bayer matrix" (`TUI_NOTE_images.md:145`) | — | false when written (`CALCIUM_IMAGES_NOTE.md:9-13` says so); built anyway at 8×8 in `image/dither.ts`; 3D never got a dither and `CALCIUM_3D_DESIGN.md:715-718` says correctly why | definite article in no file, since filled by a different file |

**The two notes disagree on order and the tree followed the later one.** `TUI_NOTE_images.md:77,133`
puts kitty placeholders first and dither *"later, optional"* (`:85`); `CALCIUM_IMAGES_NOTE.md:155-160`
puts the block with dither first, then `:174-178` revises to *images, plots of images, plots as
images, 3D*. `dither.ts:1-8` records that the tree took the second. It took the **union** on the
floor — `alt` required *and* dither — and 3D shipped as a terminal form before any `plotStyle: svg`
existed, against `CALCIUM_IMAGES_NOTE.md:180-184`'s sequencing. The iTerm2 reason is corrected in
`CALCIUM_IMAGES_NOTE.md`'s own errata `:15-21`.

---

## 8 · `docs/notes/CALCIUM_MERMAID_THEMING.md`

The note ends on three questions (`:97-99`) and says they take an afternoon. They take a read of
`node_modules/beautiful-mermaid/dist/index.d.ts`, and the answers are recorded under the questions
in the note itself (2026-09-03).

| question | answer | measurement |
|---|---|---|
| Q1 does it expose anything beyond the rendered string? | **yes and no** | `parseMermaid(text): MermaidGraph` (`index.d.ts:191`) exposes structure — nodes, edges, subgraphs, `classDefs`; but `renderMermaidASCII(text, options): string` (`:267`) returns a bare string, and `PositionedGraph` is pixel geometry for the SVG path. **There is no cell→node map**, so the note's designed shape — colour a cell by which node it belongs to — is refused by the API |
| Q2 what does `colorMode` accept, and what does it change? | **an injection point the note missed** | `ColorMode = 'none' \| 'ansi16' \| 'ansi256' \| 'truecolor' \| 'html'` (`:216`), plus `'auto'` (`:237`). It colours **by role, not by node**: `AsciiRenderOptions.theme?: Partial<AsciiTheme>` (`:238`) with eight roles `fg border line arrow accent bg corner junction` (`:197-213`) |
| Q3 does `classDef` / `:::` survive? | **into the parse only** | `classDefs` (`:6`), `classAssignments` (`:8`), `nodeStyles` (`:9`), `linkStyles` (`:11`), `PositionedNode.inlineStyle` — on `MermaidGraph`/`PositionedGraph`, not on the ASCII path |

| what | verdict | measurement | disposition |
|---|---|---|---|
| cell→tone theming (the note's design) | REFUSED by the API | Q1 | note re-scoped |
| role→palette-slot theming | ABSENT, available | Q2; `src/presentation/mermaid.ts` consumes none of it (`:16,20,26,54`, `colorMode: "none"`) | planned — ~80 lines, C09/C10; `test/contract/mermaid.test.ts` exists, no catalogue frames |
| "`colorMode` other than none suggests it knows which cells are which" (`:39`) | — | **note was wrong**: it colours by role | note was wrong — figure; answered in place |

---

## 9 · `docs/notes/CALCIUM_3D_DESIGN.md`

| what | verdict | measurement | disposition |
|---|---|---|---|
| 3D-1 the eleven steps | BUILT | `src/presentation/plot/project3.ts`, `axes3.ts`, `scatter3.ts`, `surface3.ts`; `plot3d` form (`types.ts:994`); `Camera` (`:941-978`); `AxisSpec3.tone` (`:828`) — the member the note's table at `:1101` called *nowhere* | — |
| 3D-2 camera writer | BUILT | `src/shell/cameras.ts`; `construct.ts` wiring — the gate `cursorPositions` still fails, passed here | — |
| 3D-3 half blocks | BUILT, both paths | `scatter3.ts`; `kinds/image.ts` | — |
| 3D-4 two channels one glyph | BUILT | `image.ts` emits `HALF_BLOCK` with `colour: cell.top, background: cell.bottom`; `HalfCell` in `halfblock.ts` | — |
| Q1 quarter blocks | BUILT **twice** | `plot/linedraw.ts:306 QUADRANTS` (16 entries U+2596–259F, `quadrantGlyph`) and `plot/scatter3.ts:1373 QUADRANT` (the same 16, consumed `:1573`) | owed now — collapse the duplicated table; two copies drift |
| Q2 quarter blocks for the image arm | ABSENT | `kinds/image.ts` imports only `HALF_BLOCK`/`halfBlockEligible`/`halfBlockRows` and emits `HALF_BLOCK` unconditionally; `halfblock.ts:39-44` defends the dense case, which is not an argument about diagonal edges | planned — 150–250 lines, after Q1's collapse; `scatter3.ts:1379-1398` records triangles tried and refused |
| 3D-5 dither | ABSENT from 3D, correctly | `:715,718` | — |
| 3D-6 pipeline table "width × 1 by height × 2" (`:104`) | — | **note contradicts itself**: `:76` and `project3.ts:74` say `w * 2` by `h * AREA_ROWS` | corrected in place 2026-09-03 |
| 3D-7 §12 perf tier | ABSENT as a bench | `:1499` *none of them is 3D* | planned |
| 3D-8 P20/P21 | parked, with reason | `:1442` | — |
| two-channel claim (`:399`) | — | retracted in place `:400`; F455 `:406-413`; `halfblock.ts:74-78` consumes the correction | — |

---

## 10 · The plot notes — `CALCIUM_PLOT_PRIOR_ART.md`, `CALCIUM_SVG_COMPLETION.md`

| what | verdict | measurement | disposition |
|---|---|---|---|
| "3D … the roadmap already refuses it" (`PRIOR_ART:166,251,375,765,950`) | — | **note was wrong at HEAD**: F435 retracted the refusal; `plot3d` is a form with four source files. The retraction reached the roadmap and not this note | corrected in place 2026-09-03, each site |
| violin · ridgeline · candlestick "later" (`:373`); pie · radar "rough and wanted anyway" (`:374`) | BUILT except one | `violin`, `ridgeline`, `pie`, `radar` are in `PLOT_FORM_MEMBERS`; **`dendrogram` is not**; `candlestick` is not a form name — check the catalogue before assuming | corrected in place |
| sankey blocked on "the Mermaid ruling" (`:252`, `:950`) | — | the ruling was **reversed** (`CALCIUM_ROADMAP.md:324`) and a layered router ships as the `graph` form; `sankey`, `arc`, `chord` remain absent | corrected in place; sankey stays planned on its own merits |
| "a record and not a contract" (`:352`) | — | kept — a record that is wrong is corrected, not rewritten | — |
| `horizon` unmet, "nineteen forms are refused" (`SVG_COMPLETION:147-190`) | — | **note was wrong at HEAD**: `horizonFigure` exists (`svg.ts:50,422`; `figure.ts`) and `svg.ts:321-332` routes it; `SVG_FAMILY` (`svg.ts:183`) has 47 keys and exactly **one** is `null` — `plot3d` — so the arm refuses one form, not nineteen | corrected in place with the recount |
| F305's missing fixtures (`:93`) | BUILT | `pie/merged` (`tools/catalogue-forms.ts:1831`), `waffle/under-100` and `over-100` (`:1109,1113`); `over-100` exposed a defect — Lane B is fixing it | corrected in place |

---

## 11 · Disagreements between notes, and between notes and the roadmap

Each is its own row because the disagreement is the finding: two documents cannot both be right,
and the one a reader happens to open first becomes the truth.

| the two claims | who is right | measurement |
|---|---|---|
| chrome-row claimant count — `CALCIUM_ROADMAP.md:2499` *four*, `:3565` *FIVE*, `:3580` *SIX*, `:3592` *FIVE, not six*; `AGENT_TUI_DESIGN.md:1290` *six* then `:1773` *seven* | none of them, at HEAD | reconciled to one list in roadmap 29 (2026-09-03) |
| the design's blocker is "#28" (`AGENT_TUI_DESIGN.md:1769,1785`); "#27" for prefix-out (`:622`) | the roadmap | 28 is prompt cursor-following BUILT; the chrome budget is 29; 27 is syntax highlighting; prefix-out is 32 |
| scrollable containers — `AGENT_TUI_DESIGN.md:291,974` *blocked on C26*; `PRISM_TUI_REDESIGN_NOTE.md:15` *landed*; roadmap 46 BUILT | PRISM and the roadmap | `Scroll`, `scroll-offsets.ts` |
| markdown — design *absent*; roadmap 11 PART; `src/` has it | the roadmap | `markdownBlocks` |
| the 400-line bounded block — `CALCIUM_LIVE_TERMINAL.md:286-290` *the single biggest improvement*; roadmap 46 `:3990-3994` *has chosen to hide 380 rows* | the roadmap ruled; the note did not know | same example, opposite verdict |
| C11 virtualisation — `CALCIUM_DATAFRAME_IDEA.md` *C11 with virtualisation, built*; roadmap row 17 *two implementers, not four; `keyValue` and `code` declare none* | the note | `window` declared by `keyValue` (`structured.ts:125`), `logs` (`:217`), `patch` (`patch/definition.ts:213`), `table` (`table/definition.ts:157`) — **four**; only `code` declares none. Roadmap row 7 reasons correctly about the kind row 17 denies. Corrected 2026-09-03 |
| `palette` as a bind target (`CALCIUM_WIDGETS_DESIGN.md`) | removed on a ruling | `plot/marks.ts:56-72` |
| roadmap entry 2 `:3027` cites *`b.live`'s stream arm's first* consumer | stale | the arm was deleted (`src/shell/builders/types.ts:160-177`, F78); corrected 2026-09-03 |
| four interaction notes, zero roadmap rows | — | only *embedded editor* appears, in the `—` tail `:4295`; the notes are `planned` and the roadmap does not know they exist |
| three notes treat widgets as present — `WIDGETS:238`, `NOTEBOOKS:14`, `DATAFRAME:76` | none | zero lines |
| build order — `AGENT_TUI_DESIGN.md` §6 `:334-350` ranks A7 third; `:356-361` says A7 is load-bearing for step 1 | neither renumbered | — |
| §16's two footer layouts (`:1155-1158` vs `:1299-1319`) | — | superseded and un-superseded in adjacent lines |
| the images notes' order | `CALCIUM_IMAGES_NOTE.md` | `dither.ts:1-8` |
| `CALCIUM_3D_DESIGN.md:104` vs `:76` | `:76` | `project3.ts:74` |
| roadmap `:4377` *`camera`, `azimuth`, `elevation`, `halfBlockRows` occur zero times in `src/presentation/plot/`* | false | `camera` 33, `azimuth` 7, `elevation` 7, `halfBlockRows` 1 — 48 whole-word occurrences across six files; corrected 2026-09-03 |
| `docs/components/C24_public_api.md:359` *`emptyMessage` has no consumer* vs `:531` in the same file | `:531` | `b.plot` declares it (`builders/index.ts:522`) and forwards it (`:970`) since 6c61593d, 2026-08-30 |

---

## 12 · Disproven claims — from the verification pass

Carried here because each was about to be built on.

**`table.pinColumns`.** Zero hits in the tree and in `git log --all -S'pinColumns'`. The real
`undefined` a reader may have met is `registry.ts:421`:
`windowable = floorOf(block) > 0 ? undefined : resolved.definition.window` — deliberate (C09 I33,
C04 I68; the comment at `:408-420` says why). The real window-only pins are `table.actionBar`
(`types.ts:503`) and `table.presorted` (`:524`), written only by `table/definition.ts`, read by
`sort.ts`, and refused to builders in `BUILDER_OMISSIONS`. Fully reachable. **Untested corner**: no
test constructs a *floored* table — fifteen `minHeight` hits in `test/`, none on a table. Lane F
owns that test.

**`emptyMessage`.** `b.plot` declares it (`builders/index.ts:522`) and forwards it (`:970`), since
6c61593d on 2026-08-30; `BUILDER_OMISSIONS` closes it. Stale prose said otherwise in three places:
`docs/components/C24_public_api.md:359` (corrected 2026-09-03), `docs/architecture/A03_*.md:829`
(Lane E owns A03 — in requests), and the comment at `test/unit/plot-svg-path.test.ts:1143-1153`
(corrected). **No test constructs `b.plot({ emptyMessage })`** — `test/contract/builders.test.ts:536`
is `b.table`'s — and that row is in requests.

**How many things are refused.** The answer depends on what a refusal is, and the four answers
should be reported together rather than one picked:

| counted as | count |
|---|---|
| the word — *refused*, *deliberately not doing* — by vocabulary grep | 31 |
| structured non-code slots: 170 out-of-scope rows across 25 specs (incl. 3 C26 bullets) + 10 `DEPENDENCIES.md` rows + 14 roadmap `—`/struck rows | **194** |
| + code lists: `UNCONSUMED_MEMBERS` 80, `BUILDER_OMISSIONS` 6, `BUILDER_NEVER` 1, `MARK_EXEMPTIONS` 14, `ACKNOWLEDGED_BACKLOG` ~26 | 321 |
| + `examples/docker/FINDINGS.md` sections that bear a refusal without a verdict field: 176 of 519 | ~450 |

---

## Arcs, sequenced

An **arc** is a piece of work that is its own campaign — it changes a public type or adds a
component, and it cannot be landed as a row. Everything not listed here is either `planned` and
small, or `owed now` and named above.

| # | arc | depends on | what it is |
|---|---|---|---|
| 1 | **the chrome seam** — roadmap 29 | nothing | `frame.ts:65-66`'s constants become app-declared. ~200–300 lines across C22/C15/C14. The roadmap's fourth re-check says five of its six consumers cannot land, so the justification now rests on the two agent-tui regions below |
| 2 | **the activity region** | 1 | a fifth region above the prompt; the checkbox-glyph decision must be re-taken, because the note's width claims were wrong |
| 3 | **the three-line footer** | 1 | §16 must first be reconciled with itself |
| 4 | **agent-tui, the app** | 1–3; an AI SDK row in `DEPENDENCIES.md`; `ToolDef.approval`; a composite `(step, part)` address | its own package |
| 5 | **the emulator** — `CALCIUM_LIVE_TERMINAL.md` A1 | nothing; gate is *measure `@xterm/headless`* | new component or a dependency; A2, A3, A5, A7, A9, A10, A20 follow it |
| 6 | **the widget system** | widening `liveElements` (`construct.ts:1213`) beyond the live entry; re-ruling `mergeBlock`'s collision throw; B7's value store **with its writer** | B1–B5, B8, B11–B17 |
| 7 | **cell ordering** — notebooks D5 | nothing, but it reverses C13's append-only shape | a C13 spec change first |
| 8 | **export** — notebooks D7 | nothing | `plot/svg.ts` is the precedent |
| 9 | **the dataframe filter** — C8 | C1 the profiler; the `presorted` trap ruled | — |
| 10 | **the span channel** — ML-1 | nothing | a view-model change (C04/C09/C12/C25/C26); it is what ML-2 and roadmap 50's inline emphasis both want |

**Multi-day, not arcs**: ML-T tensor (roadmap 3's residue; design at `CALCIUM_ENTRY3_KICKOFF.md`);
Q2 quarter blocks for the image arm (after Q1's table collapse); ML-2 structured diff (after 10).

**Small, and `owed now` or nearly**: D3 keep flag (~80 lines); B7 value store with a writer for
`cursorPositions` (~120); Q1 collapse the duplicated `QUADRANT` table; `pulse` spinner set (~6);
`step`/`question` glyph slots (~10); S0-2 correction to A2's drawing; ML-5b cost; ML-3 progress
rate/eta; ML-5a lineage vocabulary; M5 role→slot Mermaid theming (~80); IM-10 Mermaid HD; D6.

**Should not be built**: D1 N editors — D2 instead. A17 bounded-by-default — roadmap 46 ruled it.
