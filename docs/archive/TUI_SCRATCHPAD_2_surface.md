# Prism TUI — surface scratchpad

| | |
|---|---|
| **Status** | **Superseded.** Retained as the reasoning archive for the surface decisions. Where this and a surface spec disagree, the spec wins. |
| **Companion** | `TUI_SCRATCHPAD.md` (architecture). This one is **what is on screen and how it behaves.** |
| **Reference** | The live `prism-cli` 0.1.0 verb map |

---

## 0. The reframe

"Eventually this replaces the Python CLI" changes three things:

| | Before | Now |
|---|---|---|
| Transport | Global — fixtures or subprocess | **Per-verb.** `/ps` native TS while `/promote` still spawns Python. Verbs migrate one at a time |
| Entry points | Interactive shell only | **Three off one manifest** — interactive shell, one-shot bash (`prism ps --json`), agent door later |
| Python's role | The implementation | A transport that gets hollowed out. The manifest is the thing that survives |

So the Node binary must work non-interactively from day one. `prism ps --json | jq` has to behave whether `ps` is native or spawning. That is a design constraint on the surface, not just the plumbing: **every view must have a flat, non-interactive rendering.**

---

## 1. The interaction model *(the central call)*

Three candidates:

**A — Transcript.** Type a command, output appends, scroll back through the session. The HTML mockup, `j22`, a normal shell.
**B — k9s.** Views you enter and leave. No transcript. Arrow-navigate, Enter drills, Esc pops.
**C — Hybrid.**

A is wrong for `/ps` — a list you want to sort, filter and drill into is not a printout. B is wrong for `/validate` and `/promote` — those are events you read once and want a record of. Most tools pick one and are bad at the other half.

### Recommendation — three tiers over one transcript

**The transcript is the spine.** Every command appends a block. Nothing is lost, everything is scrollable, the session is a record.

**The last block is live.** Arrow keys navigate its rows, Enter drills in, actions fire. No mode switch, no Enter-to-activate — you run `/ps` and you are already in it.

**Older blocks are frozen** — rendered, scrollable, not focusable. `Ctrl-↑` refocuses the previous live-capable block if you want it back.

**Some verbs push a full-screen view** over the transcript: `dashboard`, `--watch`, `--logs` tail, `--exec`, `diff`. `Esc` pops back to the transcript with the pushed view collapsed into a one-line summary block.

Why this shape: it matches how a shell actually feels — the last output is the one you care about — while giving full interactivity without a mode the dev has to track. It answers the non-interactive constraint for free, because a frozen block *is* the flat rendering.

**Popping a pushed view returns to a still-live block with selection preserved.** The drill chain `/ps` → Enter → detail → Esc lands you back on the row you left. The only thing that freezes a live block is typing a different command — which is the shell contract, and not surprising.

**Frozen means read-only, deliberately.** A frozen table holds stale data: a row that said `running` four minutes ago may be `failed` now. Arrowing into it and firing `↑ promote` would be a footgun in a system whose whole point is that things move. Re-running is `↑↑ ⏎` and gives data that is true. There is no refocus-older-block gesture.

**Live state is marked, not inferred.** The live block carries a left gutter marker (`▌`); frozen blocks do not. The footer switching to row keys is a second signal, not the only one.

### Live block vs pushed view — the actual line

Not "needs the screen". Plenty of blocks are tall. The distinction is **input ownership**:

| | Live block | Pushed view |
|---|---|---|
| Prompt | Still there. Every printable character types | Gone |
| Keys | Arrows / Enter / Space / Tab navigate; letters type | Every key is a binding, including plain letters |
| Height | Content-sized, scrolls with the transcript | Viewport, own scroll |
| Leaving | Type a new command; it freezes | `Esc` |

**The test: does it need single-letter keybindings?** If `l` has to mean "cycle log level" rather than typing `l`, a prompt cannot coexist with it, so it is a view. Height and scrolling fall out of that rather than being separate criteria.

Applied honestly, the third tier is small:

| Verb | Needs letter keys? | Verdict |
|---|---|---|
| `/dashboard` | Tab panels, Enter drill, letter jumps | **view** |
| `/ps <uuid> --logs` | `/` filter, `l` level, `⌃s` pause, `g`/`G` seek | **view** |
| `/ps <uuid> --exec` | — | **neither** — suspend-and-handoff, a different mechanism |
| `/ps <uuid> --watch` | `Esc` stops it; nothing else | **live block** that re-renders on a tick |
| `/diff a b` | Needs width, not keys | **block** — tall is fine, it scrolls |
| `/modelserver` | It is a stream | **block** |
| `/run` | `⌃c` cancels; that is all | **block** |

Two pushed views total: dashboard and logs. Both genuinely cannot coexist with a prompt; the rest were misfiled on a "needs the screen" intuition that does not hold.

`--watch` as a self-updating live block is the best fallout — no mode switch to watch something, and `Esc` freezes it in place in the transcript.

---

## 2. Verb classification

Every verb in the current CLI, by tier.

### Transcript blocks — read once, keep the record

| Verb | Renders as |
|---|---|
| `/validate` | steps → result kv → warnings → tip |
| `/test` | steps (smoke) → test list → summary |
| `/build`, `/new` | steps → result kv |
| `/experiment submit`, `/submit` | steps → success kv with UUID |
| `/production submit` | steps → YAML code block → MR notice |
| `/promote` | steps → YAML code block → MR notice (human-review warning) |
| `/experiment deploy`, `/undeploy`, `/cancel` | steps → notice |
| `/serving scale`, `/serving undeploy` | steps → diff of the YAML change → MR notice |
| `/login`, `/logout` | steps → identity kv |
| `/whoami` | kv |
| `/secrets` | small table |
| `/local up/down/reset` | steps (long) → status kv |
| `/config set`, `/use-context`, `/reset` | notice |

### Live blocks — navigable in place

| Verb | Why live |
|---|---|
| `/ps` | Sort, filter, expand rows, drill in |
| `/models` | Family → version navigation |
| `/serving ps` | Same as `ps`, deployment-shaped |
| `/experiment ps`, `/production ps` | Pinned-filter aliases of `/ps` |
| `/config get-contexts` | Selectable — Enter switches context |
| `/local status` | Component list with per-component drill-in |

Add to the live tier, per the input-ownership test:

| Verb | Why live rather than pushed |
|---|---|
| `/ps <uuid> --watch` | Re-renders on a tick; `Esc` freezes it in place |
| `/run` | Live epoch progress; `⌃c` cancels and leaves a partial block. Comparing this run's epochs against the last one in the same scrollback is the reason |
| `/local up`, `/build` | Same shape — long, streaming, no keybindings |
| `/diff a b` | Wide, not interactive. Tall is fine; it scrolls |
| `/modelserver` | Foreground stream |

### Pushed views — the prompt goes away, `Esc` pops

| Verb | Which letter keys force it |
|---|---|
| `/dashboard` | Tab between panels, Enter to drill, letter jumps |
| `/ps <uuid> --logs` | `/` filter, `l` level, `⌃s` pause, `g`/`G` seek |

Two. `/ps <uuid> --exec` is neither — it is suspend-and-handoff to a child process.

---

## 3. The frame

```
┌────────────────────────────────────────────────────────────────────────┐
│ ▲ prism   fmx-prod · malachy              ● live              14:23:07 │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   transcript — frozen blocks above, live block at the bottom           │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ ❯ /ps --mine                                                           │
├────────────────────────────────────────────────────────────────────────┤
│ ⏎ run   ↹ complete   ↑↓ history   ⌃r search   / commands   ? help      │
└────────────────────────────────────────────────────────────────────────┘
```

The footer is context-sensitive on one axis only — when the last block is live, it switches to row keys:

```
│ ↑↓ rows   ⏎ drill in   ␣ expand   f filter   s sort   ⌃↑ prev block   │
```

That is the only chrome that reflects state. Everything else stays put.

---

## 4. Screens

### `/ps --mine`

```
── ps · 4 of 11 · --mine · last 24h ────────────────────────────────────

  all ×11    training ×9    evaluation ×2
  ● running ×1   ✓ succeeded ×6   ✗ failed ×2   ○ queued ×1   --all

     uuid      kind       family              status              metric      age    owner    mr
 ▸ ● a3f9b21  candidate  digit-classifier    running · ep 17/40   0.0372 ▁▂▃▅▆  23m   malachy  !1248
 ▸ ✓ 7c2d4e1  experiment decoder-zoom        succeeded            0.0089        41m   malachy  —
 ▸ ✗ 2e8a04c  experiment graphsage           failed · OOM ep 3    —           1h 12m  malachy  —
 ▸ ○ f410d99  candidate  flow-predictor      queued               —             3m    malachy  !1251

  ⏎ detail   ␣ expand   ≡ logs   ⚡ events   ↑ promote   ⊘ cancel
```

Row `▸` expands in place to a detail strip — epoch progress bar, metric deltas, node, action buttons. Enter pushes the full detail view.

Sparkline sits inline on the metric cell for running rows only. Filter pills are `exec` actions — clicking or `f` re-runs with the filter applied, which keeps the transcript honest: the filtered result is a new block, and the unfiltered one is still above it.

### `/ps a3f9b21` — run detail

```
── run · a3f9b21-c821-4f3a-9e8d-44a1b2c3d4e5 ──────────────────────────

  kind        candidate · TrainingJob
  family      digit-classifier
  status      ● running · epoch 17 / 40
  owner       malachy@fmx.io
  submitted   14:00:14 UTC   (23m ago)
  mr          !1248  auto-merged (CODEOWNERS)
  image       registry.fmx.io/fraud-detection/prism-executor:a3f9b21
  resources   2×GPU · 16Gi · gpu-04.fmx.internal

── loss · 17 / 40 · 43% ────────────────────────────────────────────────

  0.82 │⠉⠲⢄
       │    ⠑⠢⣀
  0.43 │       ⠉⠒⠤⣀⡀
       │            ⠉⠒⠦⠤⣀⣀
  0.04 │                   ⠉⠉⠒⠒⠤⠤⠤⣀⣀⣀
       └──────────────────────────────────────
        epoch 0            epoch 20         now

  loss 0.0372 ↓    val_acc 0.968 ↑    eta 18m

  ≡ logs   ⚡ events   ◉ watch   ⊘ cancel   { } json
```

Kind-aware: evaluation shows a gate tree, inference shows throughput, study shows the Phase-2 placeholder.

### `/validate fmx_models.jobs.training:job`

```
── validate · fmx_models.jobs.training:job · T1 · in-process ───────────

  ✓ importing target                    job resolved
  ✓ tier-1 rules                        22 rules · 0 errors · 587ms

  model         fmx_models.models:DigitClassifier
  train_data    fmx_models.data.pipeline:train_pipeline
  resources     1×GPU · 8Gi        (model floor 1×GPU 8Gi — satisfied)
  callbacks     3                  MLflowLogger · Checkpoint · EarlyStopping
  estimated     ~14 minutes        based on similar runs · confidence high

  ▲ W004  ESCAPE_HATCH_USED
          MultiMetricEarlyStopping replaces=prism.EarlyStopping
          Forfeited: built-in EarlyStopping behaviour

  next: /test …   /experiment submit …            587ms
```

Failure path keeps the same skeleton — the step turns `✗`, and each error renders as code / file+line / field / fix:

```
  ✗ tier-1 rules                        22 rules · 2 errors

  T1-008  TrainingConfig requires at least one of: max_epochs, total_steps
          file    fmx_models/jobs/training.py:18
          field   config=TrainingConfig(batch_size=128, mixed_precision=True)
          fix     add max_epochs=N or total_steps=N

  Rule 5  Callback supports mismatch
          file      fmx_models/jobs/training.py:24
          callback  fmx_models.callbacks:MultiMetricEarlyStopping
          issue     supports={"inference"}, job is a TrainingJob
          fix       add "training" to the callback's supports set

  ? T1-008 for the full rule                              exit 1
```

`? T1-008` at the prompt is the drill-in — context help keyed on the code.

### `/promote v_b4f0c12 --open-mr`

```
── promote · v_b4f0c12 ─────────────────────────────────────────────────

  ✓ kind check                          kind=candidate
  ✓ registry lookup                     found in model_version
  ✓ draft ModelServer YAML              serving/digit-classifier.yaml
  ✓ open MR                             !1252

  # glass_environment/prism/research-infra/serving/digit-classifier.yaml
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: digit-classifier-v_b4f0c12
    namespace: prism-serving
  spec:
    replicas: 2
    ...

  ▲ MR !1252 requires HUMAN REVIEW
    CODEOWNERS auto-merge is off on serving/. This is the promotion
    boundary — the CLI cannot bypass it.

  ↗ open MR   ≡ /ps v_b4f0c12
```

### `/ps a3f9b21 --logs` — pushed view

```
┌ logs · a3f9b21 · gpu-04 · following ──────────────────── ⏸ paused ─┐
│ 14:23:01.882  INFO   [trainer] epoch 17 started                    │
│ 14:23:02.104  INFO   [dataloader] batch 41/256 loaded (148 samples)│
│ 14:23:02.339  DEBUG  [memory] gpu_mem=52GiB/80GiB host_mem=91GiB   │
│ 14:23:02.551  WARN   [dataloader] slow batch (87ms · 95p)          │
│ 14:23:02.774  INFO   [trainer] step 2417 · loss=0.0372 · lr=3e-4   │
│                                                                    │
│ /grep dataload    level≥WARN off    1,284 lines    ⏎ follow        │
└─ esc back   / filter   l level   ⌃s pause   g/G top/bottom ────────┘
```

`Esc` pops and leaves a one-line summary in the transcript: `logs a3f9b21 — 1,284 lines, 2 warnings (Esc'd 14:24:08)`. A pushed view always leaves a trace, so a session reads end to end.

---

## 5. The HTML mockup as a source

Authoritative on **what a block looks like**. Near-useless on **how you interact with one** — every affordance in it is a mouse click, and there is no focus model, no arrow navigation, no Enter-to-drill anywhere in the file.

### Lifted more or less verbatim

| From the mockup | Lands in |
|---|---|
| Block vocabulary — rules, kv grids, tables with expand rows, badges, log lines, event lines, plots, sparklines, steps/spinner, pipeline stages, diff tables, code blocks, pills, tips, timing readout | block library |
| The braille plot — `BRAILLE_MAP`, Bresenham line-draw, axis label placement | block library. A real implementation, not a sketch |
| Unicode block sparkline (`▁▂▃▄▅▆▇█`) mapped over a windowed series | block library |
| Both palettes, already token-shaped (`--fg-dim`, `--fg-mute`, `--ok`, `--warn`) | themes — as token seeds |
| Status glyph set and action glyph set, used consistently throughout | cross-cutting rules (§5 above) |
| Density rhythm — no gap between a rule and its content, one line between blocks | block library |
| Column sets for `ps`, `serving`, `models` | the respective views |
| Verb output shapes — validate success + failure, submit success kv, promote YAML-plus-review-warning, epoch progress, test smoke output | §4 screens |
| `STATE`, `generateLogs`, `generateEvents`, `generatePods`, `generatePipeline`, the background tick | the fixture world (architecture S22) |

### Re-derived — concept is right, implementation does not survive

| Mockup does | Has to become | Why |
|---|---|---|
| `data-fill` / `data-exec` / `data-expand` click handlers | Focus model + keyboard, mouse as parity | Nothing in the mockup is reachable without a pointer |
| Hover-revealed row actions (`opacity` transition) | Focus-revealed | No hover in a terminal |
| CSS `grid-template-columns` for kv, log lines, event lines | Yoga flex with explicit widths | Not the same layout engine; `ch` units do not behave identically |
| Direct colour on elements | Tone tokens resolved by theme | Palette is token-shaped; usage is not |
| `pulse` / `fill-flash` CSS keyframes | Frame-level animation state on a tick | No CSS |
| Implicit browser layout heights | Explicit height-given-width contracts | Virtualisation cannot work without them |
| Dashboard rendered inline into the buffer | Pushed view | §1 |
| Completion menu appended as a block | Overlay | It is transient and positional |
| Reverse-i-search swapping the input bar | Overlay | Same |
| Theme toggle via a root CSS class | Context provider | Same effect, different mechanism |

### Dropped

Fixed 1100px canvas; the assumption of truecolour, full Unicode and a mouse; native browser text selection; native scroll.

### Extract before it is lost

Design decisions that exist **only** in that JavaScript and are in no journey:

- Levenshtein "did you mean" on unknown verbs and deployment names, with a distance-2 cutoff
- Two-row filter pill layout — kind row, then status row
- Sort indicators, and client-side sort that keeps detail rows paired to their parent
- The `$_`-unset error wording: *"no previous result · submit or promote something first"*
- Empty-state strings
- Completion common-prefix algorithm — auto-complete to the longest shared prefix, menu beyond that
- `serving list` / `secrets list` deprecation wording: *"list is no longer a subverb"*
- Promote's kind-mismatch refusal, including the "resubmit via production submit" follow-up
- The dirty-tree asymmetry — experiment submit **warns**, production submit **refuses** — with both messages written

### Gaps it cannot help with

- **Column priority at narrow widths.** The `ps` table has 11 columns at 1100px. At 80 columns something drops, and the mockup never has to decide which. This needs designing.
- Keyboard navigation, focus order, overlay positioning, virtualisation, capability degradation, live-vs-frozen block distinction, pushed-view lifecycle.

---

## 6. Cross-cutting display rules

**Status vocabulary** — one set everywhere, glyph plus tone, never colour alone:

| Status | Glyph | Tone |
|---|---|---|
| pending | `◌` | muted |
| queued | `○` | muted |
| running | `●` | warn |
| succeeded | `✓` | ok |
| failed | `✗` | error |
| cancelled | `⊘` | dim |
| halted | `▪` | warn |

**Action glyphs** — fixed meanings: `≡` logs · `⚡` events · `◉` watch · `↑` promote · `⊘` cancel/undeploy · `↕` scale · `↗` open external · `{ }` json · `▸/▾` expand.

**Truncation** — right-truncate with `…`, never wrap inside a table cell. UUIDs show 7 chars in lists, full in detail. Paths truncate from the left (the tail is the informative end).

**Empty state** — every list says what it looked for and how to widen it: `no runs match --mine --status=running --since=24h  ·  try --all or --since=7d`.

**Errors** — one shape for every verb, from the `{code, stage, message, details}` envelope: code and message on the first line, details as a kv block, `remediation` as a `fill` action.

**Timing** — every command's duration, right-aligned, dim, after the block. Free, and it makes slowness visible instead of vague.

**Filtering and sorting are view state, not commands.** Clicking a pill or pressing `s` mutates the live block in place; it does not append a new one. Five filter clicks producing five transcript blocks is noise. Two things keep it honest:

- The rule header records the applied state, so the frozen record reads `── ps · 2 of 11 · --mine --status=failed · sorted by age ──`
- The input bar mirrors the equivalent command as a **fill**, so the command is always visible and `⏎` turns exploration into a real invocation against fresh data

**Column priority — no horizontal scroll, ever.** Each column carries a priority integer and a minimum width; columns drop lowest-priority-first until the table fits. **The expand row is the overflow** — anything dropped appears there, so no field is ever unreachable, only one keystroke further away. Priority alone produces layouts nobody designed, so each table pins golden-frame tests at 80 / 100 / 120 / 160 columns and the layouts get reviewed rather than emerging.

For `/ps` the order is: always `glyph · uuid · family · status`; then `metric · age`; then `kind · owner · mr`. Status never truncates — it carries the glyph and the failure reason.

**Density** — no blank line between a rule and its content; one blank line between blocks. The mockup's `0.5lh` spacing translates to this.

---

## 7. Changes to the verb surface worth making

Invited, so here they are. Each is a break from the Python CLI as it stands.

| Change | Reason |
|---|---|
| `/config` becomes a **live block whose rows fill the prompt**, not `get`/`set`/`use-context`/`get-contexts` | Four verbs to read and change a settings file is a CLI compromise. Selecting a row fills `/config set ui.theme dark` into the prompt, ready to edit and submit. **Not an editable view** — see below. Keep the flat verbs for non-interactive use |

**Why not a genuinely editable view.** Blocks are read-only by design: they carry no cursor, no input focus, no validation state. An editable block would need all three, which is a second line editor living inside the render tree — and then two components own a cursor, two own undo, and two own what `Esc` means. The `fill` action gets the same outcome with zero new machinery: the row composes the command, the existing editor edits it, the existing pipeline runs it, and history records it like anything else. If a real form surface is ever wanted, it belongs as a pushed view with its own input handling, not as a block.
| `/secrets TARGET` instead of `/secrets list TARGET` | `list` is the only subverb; the noun is the command |
| `/experiment ps`, `/production ps`, `/serving ps` become **filter presets** on `/ps` | Same renderer, pinned filter. Presets are pills in the `/ps` view, so the namespaces are a keystroke rather than three verbs |
| `/local status` folds into `/dashboard` when the context is local | One overview, whichever cluster |
| `/help` demoted, `?` promoted | Context help beats a wall of verbs. `/help` stays for the full list |
| `--json` inside the shell prints raw JSON in a `code` block | The dev is inspecting the contract; rendering it would defeat the purpose |
| `submit` alias dropped | `/experiment submit` is explicit and the `/` prefix removed the typing pressure that justified an alias |

Not proposing changes to: the local loop (`validate`/`test`/`run`), the experiment/production split, or anything GitOps-shaped. Those are governance and the journeys are load-bearing.

---

## 8. Open

All of O1–O7 resolved. Recorded here so the reasoning is not re-litigated.

| # | Question | Resolution |
|---|---|---|
| O1 | Is the three-tier model right? | **Yes**, with two additions: popping a view returns to a live block with selection preserved, and the live block carries a `▌` gutter marker |
| O2 | Refocus older blocks with `⌃↑`? | **No.** Frozen blocks hold stale data; firing an action from one is a footgun. Read-only is deliberate |
| O3 | Is `/run` a view or a block? | **Block.** The distinction is input ownership, not height — `/run` never needed the keyboard. Same for `/diff`, `/modelserver`, `/local up`, `/build`, and `--watch` |
| O4 | Does a pushed view leave a trace? | **Yes**, a one-line summary. A session should read end to end |
| O5 | Filter pills: exec or in-place? | **In-place.** Filtering is view state, like sorting. Rule header records it; input bar mirrors the equivalent command as a fill |
| O6 | `/ps` default with no args? | **Keep `--mine --since=24h`.** Redundancy on the first command beats an empty screen |
| O7 | Column priority at narrow widths? | **Priority integer + minimum width, drop lowest-first, expand row is the overflow.** No horizontal scroll. Golden frames at 80/100/120/160 |

### Still open

- **Nothing structural.** Remaining unknowns are per-view detail — evaluation and inference detail layouts, dashboard panel contents at narrow widths, and the `/config` editable-view interaction — which belong in their journeys rather than here.
