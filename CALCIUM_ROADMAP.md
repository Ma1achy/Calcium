# Calcium — roadmap

Two destinations, decided: **prism-tui**, the ML platform TUI this was always for, and
**Calcium as an open-source framework** other people use. Both, and the plan below serves
them in that order.

One principle overrides ordering by value or by enthusiasm:

> **The API freezes at publication.** Anything that changes a public type, a signature, or
> what a consumer is handed must land before the first publish, or it becomes a breaking
> change with users attached.

That is the `comparison`-rename-before-C24 argument at repo scale, and it puts the fixes
docker-tui proved ahead of every feature in this document.

**The work splits into two lists, and the first one wins on evidence:**

```
the triage    what docker-tui proved BROKEN — F1–F55, with real consumers behind each
the features  what Calcium should GAIN — the rest of this document
```

`examples/docker/TRIAGE.md` is authoritative for the findings. The features start at
"Already shipped" below.

---

## The second consumer, and why it comes before publishing

**prism-tui's first surfaces land before the freeze, not after.**

docker-tui found fifty-five findings by being a real consumer. **prism-tui is a genuinely
different consumer** — not a second instance of the same one. docker-tui exercised container
inspection: tables, comparisons, patches. prism-tui exercises ML output: tensors, heatmaps,
training curves, long-running jobs. Different blocks, different producers, different failure
modes. There is no reason to expect it finds nothing.

And every finding it produces after publication is a breaking change with users attached.

**Not the whole app** — enough surfaces to shake out second-consumer findings. An experiment
table, a training curve, one live job monitor. Weeks, not months.

Two things follow from it:

- **The ML output package moves up**, from post-publication to phase 2. prism-tui requires
  it, and it is the feature with the clearest consumer — tensors with shape/dtype headers,
  heatmaps for attention and confusion matrices. Built against prism-tui, which is the
  pattern that has worked throughout.
- **`b.live`'s `stream` arm finally gets a consumer.** F10 records that docker-tui never
  exercised it — `docker stats` streams as a screen redraw, so `/stats` polls. **A training
  job streaming metrics is exactly that arm's consumer**, so prism-tui closes a coverage gap
  docker-tui structurally could not. That is the strongest single argument for a second
  consumer before the freeze.

It also improves phase 3's outside-reader test. Same author, but a different domain written
against the *published* surface rather than alongside the framework — a much better proxy
than docker-tui was, though not a substitute for an actual stranger.

---

## Phase 1 — shape-changing. Before any publish.

### 1.1 The producer-context contract — F14, F43, F37, F36, F28

**The most important item in the whole list, and public release is why.**

Five surfaces could not reach a fact the framework holds, and **every one was worked around
by the app duplicating a Calcium module** — `codeRows` reimplementing the measurer, `main.ts`
sniffing `TERM` and `LANG` to redo C02, deep imports to reach the validator.

For an app whose author wrote the framework, that is a finding. **For a stranger, it is a
broken package** — they hit the same wall, cannot reach around it because the seal stops
them, and conclude the framework cannot do the thing. This is the single largest difference
between "works for us" and "works for them".

The contract question, as the triage frames it: **three of the five are about what a
producer is handed, not what is exported.** `AdapterContext` has width and no height and no
capabilities. `LocalContext` has only `command`. `LiveSpec.render` has neither.

The counter-argument is recorded and must be answered rather than ignored:
`AdapterContext.width` says *"never a layout decision"*. So the ruling is not "hand
producers everything" — it is **what may a producer legitimately know, and why is width
different from capabilities?** Answer it once, for all three producer kinds, or the next
consumer duplicates a sixth module.

This is a signature change on three public types. It cannot wait.

### 1.2 A change axis distinct from `Tone` — F30, F49, F51

**Three surfaces that knew nothing of each other converging on one absent concept** — the
comparison verdict, the diff marker, the event type. That is the highest-quality evidence a
framework gap can have.

`Tone` is a judgement axis (`ok`/`warn`/`error`). Added/deleted/modified, same/changed,
start/die are a **change axis**, and C04 I6 correctly refuses to carry them as tone — twice,
which is why F49's refusal *was right*.

Adds to a public type. Cheaper now than ever again.

### 1.3 The builder-surface audit — F27's shape

Three instances, **one closed with a frame as evidence** (`yMin`/`yMax`), so this is a
precedent rather than a guess. `collapsedAfter` and `gapBefore`-on-the-view-arm both have
consumers.

But the fix is not three more fields. It is **an audit with a rule**: every builder exposes
what its block can express, or the spec says why not. `b.plot` omitting `yFormat` *with the
reason written down* (percent expects a fraction — F31) is the model; omitting it silently
is the defect.

Additive per field, but the **audit** belongs before publication, because a builder surface
that is 80% of its block is a surface people work around.

### 1.4 The prompt — F55

`PROMPT = "❯ "`, hardcoded, on every frame the shell draws, on the line the reader types
into, **with nothing an application can do about it.** C22 §6 owns it and gives it no
capability-dependent form.

Small, and it is the kind of thing that reads badly in a framework others theme: a
degradation story that is complete except for the one character always on screen.

---

## Phase 2 — additive. Can follow the first publish.

### 2.1 The empty-block convention — F15, F35, C22 I47, `/drift`, `/config`

**Absence of output is the same picture as failure to produce output.** Four instances
across three layers, and `/drift` predicted it while `/config` reached it independently —
which is the threshold for calling it general.

**WALKED — C22 §13b, and the four are two classes with different remedies.** F15, F35 and
C22 I47 are a **destroyed diagnostic**: the framework knows exactly what happened and throws
it away, and the remedy is a channel. `/drift` agreeing and `/config` identical are **nothing
to say, said as nothing** — a success, with no diagnostic to preserve, whose remedy is a
*rendering*. The one sentence above is the statement of the confusion, not one fix.

**The diagnostic class is mostly closed and this entry does not own it.** F15 landed two
channels — a fault notice at the moment and `Pipeline.faults` at exit, two because the
reporting path is the path that failed. What this entry owns is the fourth instance.

**RULED: a documented convention, and the helper is refused.** A helper nothing is obliged to
use is the shape that produced this four times — two authors who had both read the convention
still shipped the empty frame — and `usageBlocks` is the measured case of a complete mechanism
nobody was obliged to call. The obligation belongs where the emptiness is *decidable*: only the
producer knows *agree* from *failed to compare*, and a helper would be handed the same empty
list C09 already sees. The convention is **a block whose emptiness is a result states the
result** — not *"no rows"* but *"3 keys, all matching"*.

**Residue, so 13b.3 is not read as closing it**: an empty block whose emptiness is a *failure
to compute* is the fourth instance wearing the first's clothes, and nothing in C22 can tell
them apart. C04 I3's vocabulary exists; the obligation to reach for it is the open half.
No public shape changes.

<a id="rendering-flags"></a>
### 2.2 Flags that select a rendering — F39

**CORRECTED — the first half of this entry closed and the prose kept the old state.** It read
*every declared flag is transmitted, so `--raw` reached docker and it exited 125*, and *the
shim absorbed it*. C05 I21 shipped: a `shellOnly` switch is absent from `argv`, and the shim
records the strip being **deleted** rather than commented, citing F39. F39 is now PARTIAL.

**CORRECTED AGAIN — and the second correction is the one worth reading.** The first said the
*second* half remained: no way to declare a flag that chooses a presentation. That sentence is
literally true and **names no defect**. Going to write the field showed all three wants this
entry lists already work — `--raw` and `--wide` are `shellOnly` switches the adapter reads
(`examples/docker/src/inspect.ts:192`), `--json` is transmitted because the far side understands
it. **F39 is CLOSED**, and the sentence named the wrong axis: it said *rendering* and the axis
it needed was *transmission*.

**WALKED — C05 §8b, and two things are settled before the design starts.**

- **It cannot be `shellOnly` widened.** I21 ruled *the axis is transmission, not presentation,
  and the two do not coincide*: `--json` selects a rendering **and** is transmitted, `--raw`
  selects one and is not. A field meaning both would be wrong about `--json` the day it landed.
- **`--help` and `--raw` are not the same kind of thing**, and two consumers that look alike is
  where a vocabulary gets fixed wrongly (`view`'s two declarations cost F118). `--raw` selects
  a rendering **of the result**, read after a document exists; `--help` selects a mode **of the
  invocation**, read before anything is spawned — and it is not a field at all but a reserved
  name (I22), because a per-app `--help` is a per-app discipline.

**RULED: the field is the result-rendering axis alone, and it arrives with the resolution that
reads it.** A presentation-selecting field today is a published member with no consumer —
MG24's founding class and F21's shape, *a field that existed, so nothing looked*. This repo
ruled the identical question three weeks ago on the identical kind of field: `NavElement.arrow`
and `.escape` are drawn in C26 §5 and absent from the tree because *"landing them before §4's
resolution exists would publish two fields with no reader"*. That withdrawal was re-measured
against the widened MG24 (F159) and holds. Inherited, not re-derived.

**Its consumer is entry 21.** `--help` per verb is the one party needing *this changes what you
see* as distinct from *this changes what runs*, because that is a grouping in rendered usage.

**And that dissolves the value question rather than answering it.** The value set is whatever
`--help` must be able to say, so it cannot be chosen before the consumer is written — picking a
vocabulary for a reader that does not exist is how `view` acquired two declarations and F118.
Whether the framework must understand every member, which is §2's test for a closed set, is a
question only entry 21 can answer, and it is the freeze-relevant part.

**Nothing is added to `FlagDef`, so the freeze is unaffected.** The entry was always additive;
that is now true of the deferral rather than of the field. And the naming fact stays discharged:
MG24 is exact for 376 of 1150 members, so a field called `kind`, `id`, `text` or `width` is one
the rule can say nothing about — a firing is trustworthy, a silence is not.

---

## Phase 3 — the things a public framework needs that neither list contains

These are not in the roadmap or the triage, and for the stated destination they matter more
than most of what is.

**The error path is the first-run experience.** Step 4 found three error documents, two
shipped, none ever run, 91 rows agreeing with all three. A stranger's first encounter with
Calcium is a misconfiguration — a manifest that will not parse, a missing adapter, a verb
with no transport. **Read every error message the framework can emit and ask whether it
tells someone how to fix it.** F7's *"the manifest is missing tui-kit's own verbs"* names
the problem and not the remedy.

**R01's own test has never been run by anyone who is not the author.** *"Someone who is not
its author builds a working TUI from the README."* docker-tui was written by the framework's
author, so it is not that test. Before publishing: **hand the README's smallest example to
someone who has not seen the codebase and watch.** That is the only way to find the F7 class
in advance rather than from an issue.

**Version 0.x, deliberately.** It does not remove the freeze — it makes breaking honest.
Say so in the README rather than implying stability the surface has not earned.

**And the docs are the product.** Eight drawings in the surfaces document were wrong about
the far side or the framework, corrected in place at ten sites — F11 is the most-instantiated
class in the project. For a public framework, a wrong doc is worse than a missing one,
because it costs a stranger an afternoon before they distrust it. **Every example in the
README must be run from the packaged tarball**, not the workspace, by CI.

---

---

# The features

## Already shipped, and the demo just hasn't shown them

- **Code block rendering with syntax highlighting** — `lowlight` is in, S5's `--raw`
  exercises it. Nothing to build.
- **Built-in commands** — `/help`, `/clear`, `/theme`, `/history`, `/debug`, `/exit` ship
  as framework verbs; C05 appends them to every parsed manifest.
- **Jump to bottom** — `⌃End` is already bound to `scrollBottom`, `⌃Home` to `scrollTop`.

---

## Already designed, not built

### Images — `docs/notes/TUI_NOTE_images.md`

The hard problem is solved and the note has it. C02 already detects `imageProtocol`
(`iterm2` | `kitty` | `sixel` | `none`) and C09 §4 has its degradation row.

**Kitty's Unicode placeholders (0.28.0+) are what make this tractable**, and the mechanism
fits the architecture exactly: transmit once, create a virtual placement, then print
`U+10EEEE` characters whose diacritics encode row and column and whose foreground colour
carries the image ID. The terminal sees ordinary text in its grid and draws the image tile
there.

| | |
|---|---|
| **Measurement is free** | the placeholder grid *is* `rows` × `cols` of ordinary characters, so `measure` returns `rows` because that is literally how many rows were emitted |
| **Scrolling is free** | placeholders are text; C14's virtualisation moves them like any content |
| **Resize is free** | they reflow, and C03's `contaminated` repaint re-emits them |
| **No probe** | quiet mode (`q=2`) exists to avoid responses, the same reason C02 refuses interactive probes |

Works through tmux. Supported: kitty, WezTerm, Ghostty, Rio, Konsole (partial).

**Phasing per the note: kitty-with-placeholders first**, because it is the only protocol
that composes with a scrolling transcript at all. iTerm2's character-like model is second
and only viable in a fixed layout. **Sixel needs a real encoder and is the whole expense.**

`rows` must be exact or measurement breaks; `cols` is advisory and clamped at plan time
like any other block's width.

**Four consumers for one mechanism**, which is what makes it worth building: pasted
screenshots, agent tool output, ML plots, and high-fidelity Mermaid.

---

## Cheap — fits the architecture as it stands

### Mermaid (text path) — much cheaper than it looks

Not a layout problem, because someone else solved it in TypeScript.
**`beautiful-mermaid`** renders Mermaid as ASCII with zero DOM dependencies, no browser or
Puppeteer, 100+ diagrams in under 500 ms, covering flowcharts, state, sequence, class and
ER. It is what OpenCode's mermaid plugin uses. `termaid` (Python, 18 diagram types) and
`mermaid-ascii` (Go) are the other prior art.

So a `mermaid` block is **a code block with a transform in front**: parse the source, call
the renderer, measure the lines. **No new mechanism.** Same dependency shape as `lowlight`.

*Vet the dependency first, as `lowlight` was vetted* — repo, licence, maintenance, and
output quality against real diagrams. If it does not hold up, `mermaid-ascii`'s approach
(parse to a grid, A* the edges) is reimplementable, but *that* is the component-sized
version and only worth it if the dependency fails.

Honest about quality: every text renderer's layout is approximate — grid-based barycenter
heuristics, Manhattan-only edge routing, dense graphs still cross. Diagrams render *well
enough to read*, not beautifully. Which is why the image path exists for when it matters.

**High-fidelity path is free once images land** — `mmdc` or headless Chrome to PNG, then
the image block. Only where `imageProtocol !== "none"`.

### Markdown

A translator producing `Block[]`, not one block that renders a document — headings, lists,
emphasis, code spans all map to blocks Calcium already draws, so measure/degrade/window
work for free. Prefer that over a monolithic markdown block for exactly that reason.

### Themes cannot be light — and `/help`'s verb list came back empty

**Both found while making the README gifs**, which is step 8's distribution one more time:
every finding came from a way of looking, not a test written to look for it.

<a id="theme-background"></a>
#### ★ A theme must be able to paint its own background — RULED

C10 **paints no background**, so `/theme light` sets dark foregrounds and emits nothing
behind them: **on a dark terminal it is dark-on-dark and unreadable.** The name is the lie —
`light` implies the app changes the background, and the implementation assumes the terminal
*already is* light.

**The strongest argument is not usability, it is that C10's own invariant is unprovable
without it.**

C10 enforces a **contrast floor**. Against what? If the theme does not paint the background,
the floor is computed against an *assumed* background that may not be the real one — so the
guarantee holds only when the terminal happens to match the assumption, **which is exactly
the case that is broken.** A framework that guarantees contrast and controls one end is
guaranteeing a guess.

**And the usual objection is weaker here than it reads.** *"Respect the terminal's colour
scheme"* is right for a line-oriented tool. **Calcium is in the alternate screen and already
owns every cell** — painting a background is not fighting the scrollback or another tab, it
is a full-screen app colouring its own screen, which is what every vim colorscheme, `htop`
and `k9s` do.

**But "always paint" is wrong too, for one real reason: transparency.** Plenty of people run
translucent or blurred terminals, and a painted background destroys that. **That is not a
preference to override.**

**Ruled: per-theme declaration, not a framework default.**

```
background: "terminal"     inherit — today's behaviour. Preserves transparency, and is
                           correct for a theme designed to sit in a dark terminal
background: <colour>       paint it. Required for any theme that cannot assume its host
```

**Which makes the contrast floor provable in both cases** — against the painted colour, or
against the *declared assumption* when inheriting. That declaration is also what lets C10
warn on a mismatch where `COLORFGBG` is available (non-interactive, so C02's refusal of
probes is untouched; OSC 11 stays out on the same grounds the image protocol's quiet mode was
chosen).

**And it resolves the bug directly**: the light theme **paints, because it cannot work
otherwise**. A dark theme sitting in a dark terminal keeps inheriting and keeps your
transparency.

#### And the user overrides it: `/theme <theme> --no-bg`

**The transparency argument is not the theme author's to make.** Someone running a blurred
terminal wants transparency across *every* theme they try — a per-theme declaration cannot
express that, and they would have to avoid every painting theme including the light one that
genuinely needs it.

**So two orthogonal things:**

```
the THEME declares    background: "terminal" | <colour>     what it was designed for
the USER overrides    /theme <theme> --no-bg                 never paint, whatever it says
```

**A flag on `/theme` rather than an env var**, and it costs nothing: `/theme` is one of the
framework's six verbs, so this is a `FlagDef` on that `ToolDef` — **and it appears in
`/theme --help` for free** once [per-verb `--help`](#help-per-verb) lands. No argv parser, no environment convention.

**Per invocation, not sticky.** `/theme light --no-bg` then `/theme dark` paints again.
A sticky flag is invisible state: you would switch themes later, get no background, and have
nothing on screen explaining why — whereas repeating it is one keystroke and `↑` recalls the
whole line.

**That argues for a second thing rather than against the flag**: once theme persistence lands
(C22 §12a, still assigned and unbuilt), **the persisted setting is where "I always want
transparency" belongs.** Flag for trying, preference for keeping.

#### Warn and comply, because the override re-enters the broken state

`/theme light --no-bg` on a dark terminal produces **exactly the unreadable state this ruling
exists to fix**, deliberately, at the user's request.

**Ruled: warn and comply.** A notice saying *"light assumes a light terminal; without a
background it may be unreadable"*, and then do it. The user asked, transparency is a real
reason, and **a framework refusing a preference because it knows better is worse than a
legible warning.**

**And the consequence must be written down rather than discovered:** the contrast floor is
**provable when painting, best-effort against the declared assumption when overridden.** That
is honest as long as it is stated.

**One mechanical note, and it is shared work:** painting means **padding every row to the
full region width**, or the wash ends ragged where the text does. That is the same mechanism
as [selection's full-row background](#selection-wash), one scope up — **build them together rather than
twice.**

<a id="help-bucketing"></a>
#### `/help` returned no verb summaries — narrow this before filing it

The report was *"`/help` emits zero verb summaries, contradicting the README's 'help
rendered from the same table dispatch uses'."* **That is one step too wide.**
`handlers.ts:80,86` maps app tools and shell tools to `{ label: "/name", value: summary }`,
so the mechanism exists and is wired.

**The finding is why both buckets came back empty**, not that summaries are unrendered.
Same shape as nearly filing "nothing reads `truncated`" when T4.5 falsified it — the field
was fine, the *view's use of it* was absent.

Check the bucketing first: the framework's six are `local: true` and may fall outside both
maps, and a session whose manifest carries only those would render exactly what was
observed. If that is it, the finding is about which tools `/help` considers rather than
about summaries at all.

**And the README's claim needs checking either way.** *"Help rendered from the same table
dispatch uses"* is the anti-drift property the keymap-derived help exists for. If `/help`
renders keybindings from the keymap and verbs from the manifest, the sentence describes
half of it — which is F11's class arriving in the framework's own front door.

<a id="output-diffing"></a>
### ~~★★ The frame is written whole, every time~~ — BUILT, Order 12

**Corrected 2026-08-13.** `shell/render-frame.ts` `body()` holds the previous frame,
addresses each changed row with `cursorTo(i, 0)` and writes only that row. Every row is
already `exact()`-padded to the frame's width, so a rewrite covers the row it replaces
cell for cell and no erase is needed; `SGR_RESET` leads each row (I57). The whole-frame
form survives as the no-record case — the first frame, a contaminated one, and one whose
predecessor was a different size — which is `previous() === null`, one expression rather
than a second reading of C03's flag.

**The diagnosis below is left standing because it is what the measurement was taken
against.**

`session.ts:367` writes `HOME` followed by every row joined, on every frame. **There is no
comparison against the previously written frame.** On a 200×50 terminal that is ~10,000
cells of styled output pushed to the terminal per keystroke, even when a single character
changed.

**And diffing was anticipated in the prose and never built.** `frame-scheduler.ts:175`
reasons about *"diffing against a screen whose contents nobody knows"* — a sentence that
only makes sense if diffing is the normal case. Specified in a comment, absent in the code:
the same shape as `copyMode`, `frameworkSources` and the rest.

**What it costs together with the render defect above:** a large diff renders 5,000 lines to
show 30, then writes 10,000 cells to change one. **Two multiplicative costs on the same
keystroke**, which is why the symptom is "unusable" rather than "slow".

**The fix is the standard one and it is contained:**

- keep the last frame as an array of rows
- write only the rows that differ, each preceded by a cursor move to its line
- **the `contaminated` flag already exists** for the case where the screen's contents are
  unknown — a child wrote over it, a resize happened — and forces a full repaint. That is
  precisely the invalidation story a diffing writer needs, **already built and already
  tested.**

**Row granularity is enough; cell granularity is not worth it.** A changed row is one cursor
move and one write; chasing changed *cells* within a row costs more arithmetic than it saves
bytes, and it interacts badly with SGR state which is per-row already.

**Ordering: this before the render cache.** It is smaller, it is contained to one file, the
invalidation mechanism exists, and it cuts the per-frame cost for *every* frame rather than
only for large blocks.

<a id="cells-fast-path"></a>
### ~~`cells()` has no ASCII fast path~~ — BUILT, Order 14

**Corrected 2026-08-13.** `presentation/text.ts:89–108`, and it is **an equality rather
than an approximation**: the path is taken only when every code unit is printable ASCII,
where `text.length` is provably the same answer as the walk below. That is what makes it
safe against the rule that `cells()` is the one measurer — a fast path that were merely
usually right would put the drift inside the function written to prevent it.

**Read, not guessed.** `cells()` is:

```ts
if (text === "") return 0;
let total = 0;
for (const { segment } of GRAPHEMES.segment(stripControl(text))) total += clusterCells(segment);
return total;
```

So every call **allocates a new string** (`stripControl`) and then **runs `Intl.Segmenter`
over every character** — for every string, in every row, of every frame. And it is called
everywhere: column planning, truncation, wrapping, padding, the compositor's splice.

**Virtually all of it is ASCII**, where the answer is `text.length` and the segmenter is
pure overhead. A guarded fast path — no character above `0x7e` and none below `0x20` → return
the length — is a few lines and correct by construction, because the two things the slow
path exists for (control characters and multi-cell clusters) are exactly what the guard
excludes.

**Measure it after the render cache lands**, not before: most calls disappear with the
cache, so profiling now would attribute the cost to the wrong layer. But the fast path is
cheap enough to be worth taking on the reading alone.

### Two candidates checked and cleared — recorded so nobody checks again

**Syntax highlighting is already memoised**, on `(text, language)`, and the comment says
precisely why: *"A transcript re-renders on every frame; tokenising it on every frame…"*.
So someone already knew about the per-frame re-render and mitigated its most expensive part.

**That is independent confirmation of the render diagnosis** — the memo exists *because*
rendering repeats, which is the defect above stated from the other side. Fixing the render
cache does not remove the memo's value; it makes it redundant on the hot path and leaves it
correct.

**And C14's Fenwick index is incremental.** `#rebuild()` is reserved for width changes,
with a comment arguing that a rebuild per change *"would make the Fenwick tree pointless"*.
The structure is right and it is used right.

**Recorded as checked-and-clear**, with the date, because a checked assumption that held is
worth not checking twice — the same disposal as C14's no-settled-fast-path result.

### Remaining, unmeasured — profile, do not build on suspicion

- **`lines.join("\r\n")` allocates the whole frame as one string every write.** Irrelevant
  once only changed rows are written; do not fix it separately.
- **`stripControl` allocating on every `cells()` call** — subsumed by the fast path above
  for the common case, still present for the rest.
- **Per-frame object allocation in the paint path** — plausible and unmeasured. The GC cost
  of a frame's worth of intermediate arrays is the kind of thing that shows in a profile and
  nowhere else.

**Measure, then fix.** The four defects above were found by reading the code and are
certain; these are hypotheses, and a performance fix aimed at the wrong layer is the same
class as a rule scoped to the wrong artefact.

**And a frame-read is the acceptance test, not a benchmark.** *"Type into a 5,000-line diff
and watch"* is what a user experiences; a microbenchmark that improves while the frame still
stutters has measured the wrong thing.

<a id="render-caching"></a>
### ~~★ Rendering is not cached~~ — BUILT, Order 13

**Corrected 2026-08-13.** `shell/render-cache.ts`, and it carries two axes the naive key
would have dropped. **Focus**, because `visibleRows` passes `focusFor(...)` into the
render and C11 draws the focused row in another tone (C11 I14) — moving a selection down
a table changes no `rev` and no width. **The theme's identity**, via `ResolvedTheme.name`,
which already moves on a variant switch and on an override — so the fact travels with the
value and cannot be left out of an `invalidate` call at a fourth site.

**A performance defect, measured in the code rather than guessed at.** `paint.ts:137` calls
`renderSequenceToLines(registry, blocks, width, …)` on every visible entry **every frame**,
and nothing anywhere caches rendered lines. Only `measure` is cached — C14, keyed on
`(entryId, rev, width)`.

So **the virtualisation is at entry granularity, not row granularity**: C14 selects *which
entries* are visible, and the renderer then renders each one **whole**. A 5,000-line patch
renders 5,000 lines per frame to show thirty — and with syntax highlighting, lowlight
tokenises all 5,000, per keystroke.

That is the reported symptom exactly: fine normally, unusable on a large diff.

**Three candidate fixes, and they are not alternatives — the first is necessary and the
others compound it:**

- **Cache rendered lines**, keyed the same way `measure` already is —
  `(entryId, rev, width)`. The invalidation story is solved; it is the same key. This is
  the smallest change with the largest effect, because the frame after the first is free.
- **Render only the visible window of a block.** Harder, and it is the heterogeneous-
  windowing question already recorded from step 3 — `windowPatch` reduces a `Patch` to a
  valid smaller `Patch`, and that pattern is available for the divisible kinds. This is
  where that finding's consumer arrives.
- **Highlight at construction, not at render.** If lowlight runs inside
  `renderSequenceToLines`, it runs per frame. Tokenising once when the block is built and
  caching the styled text moves it off the hot path entirely.

**Measure before choosing.** Time one frame with a small patch and with a large one, then
bisect: `measure` / `render` / `highlight`. The three fixes have very different costs and
the profile decides the order.

**This is phase-1-shaped, not a feature.** It changes no public type, but a framework that
degrades to unusable on a large document has a correctness problem in the thing it exists
to do, and every consumer hits it — docker-tui's `/config` on a real diff, `agent-tui`'s
streamed code, prism's long training logs.

<a id="text-selection"></a>
### Text selection, copy and paste — and `copyMode` already exists with no producer

**`copyMode` is a focus target that nothing can enter.** It is in `FocusTarget`, ordered in
the ladder at `focus.ts:42`, `register("copyMode", …)` is wired at `router.ts:215` — and
`session.ts:547` supplies `copyMode: () => false`, unconditionally. Routed, ordered,
unreachable: the eighteen-structural-gaps shape one more time, and this one was *anticipated
by name*.

**Two stubs, not one — and the second is worse.** `session.ts:548` supplies
`exitCopyMode: () => undefined`. So a producer alone would give the reader a mode that can be
entered and not left: the `⌃c` rung consumes the key and does nothing, which is a hang rather
than a gap. **The producer and the exit are one piece of state or neither ships** (C16 §5b
B1). Measured 2026-08-13; line numbers above were `router.ts:192` and `session.ts:409` when
this entry was written and had drifted.

**The problem it exists for is real.** In the alternate screen with mouse tracking on, the
terminal's native selection is disabled — mouse events go to the app — so a reader cannot
drag-select and copy the way they can in any other terminal program.

**Three mechanisms, and they are complementary rather than alternatives:**

- **`copyMode`** — a mode that turns mouse tracking *off*, so the terminal's own selection
  works normally. The target exists; it needs a producer, an exit, a binding to enter it, and
  a visible indicator (the mode belongs in the chrome, exactly as the navigation model's
  `NAV`/`EDIT` does).

  **And it needs the toggle, which does not exist.** `MOUSE` is a single mode string
  (`escapes.ts:37`) with no way to leave tracking off and come back, and `router.ts:271` gates
  mouse routing on `mouseEnabled()`, which reads **capabilities, not copy mode**. So *"turns
  tracking off"* describes a mechanism this entry would **add**, with its own reason — it is
  not a behaviour of the tree that copy mode would inherit. Measured 2026-08-13. The argument
  for the mode is unaffected: it rests on what a terminal's native selection does in the
  alternate screen with tracking on, which is true whether or not a toggle exists yet.
- **OSC 52** — the terminal clipboard escape, so the app can copy *programmatically*.
  Works over ssh and through tmux, which drag-select often does not.
- **Shift-click passthrough** — most terminals bypass mouse tracking while Shift is held.
  Free, undiscoverable, and worth documenting rather than building.

**And there is a Calcium-specific opportunity that is better than character selection.**
Because the transcript is *structured blocks*, the app knows what a thing **is** — so
`y` on a focused code block copies the code, `y` on a table row copies the row, `y` on a
patch copies the diff. **Semantic copy, which a raw terminal cannot offer**, and it serves
the actual use case (copy this command, copy this diff) better than dragging ever does.

That pairs with the navigation model: **copy is a verb on a focused thing**, which is what
focus is for. Build it there rather than as a separate mechanism.

### Animation — and the one rule that makes it safe

Animated text, colour transitions, a pulse on something new. Genuinely nice, and it collides
with two things already decided — so it needs a ruling before it needs a design.

**Rule: animation is decoration, never information.**

If a pulsing colour *means* "urgent", a 1-bit reader loses the meaning entirely — which is
**information carried by colour alone**, the exact thing `degradesTo1Bit` exists to catch and
the exact argument F49 and F34 already made twice. So animation may draw the eye to a fact
**that is already stated some other way**, and may never be the only statement of it.

That rule makes the degradation story free: at 1-bit and ASCII the animation simply does not
run, and nothing is lost because nothing was carried.

**Two mechanical consequences:**

- **It must ride the refresh driver, not a new timer.** Same as the spinner: C03 commits on
  events, and this layer must not grow a clock. An animated element is a `b.live` part or a
  driver tick.
- **It fights output diffing, and that is a real cost.** Every animated cell changes every
  frame, so those rows diff to nothing useful. Fine for a spinner glyph; **bad for a whole
  block pulsing**, which would defeat the fix that made the app fast. So: animate *small*
  things, and treat a full-block animation as a performance decision rather than a style one.

### Change highlighting — the distinctive one, and it is nearly free

**In a live dashboard the reader's real question is "what changed since I looked away", and
no terminal tool answers it well.**

Calcium can, because **it already knows.** `rev` moves when an entry changes; the refresh
driver knows which part it patched; the diff of two documents is computable. A brief
highlight on the rows that moved — a value that ticked, a container that appeared, a state
that flipped — is information the framework holds and currently throws away.

**A raw terminal cannot do this at all**, which puts it in the same category as semantic copy:
a capability that follows from structured blocks rather than from drawing characters.

And it obeys the animation rule cleanly — the *value* is the information; the highlight only
says *look here*.

### Notify when a long thing finishes — cheap, and almost nobody does it

A five-minute `build` finishes while the reader is in another window. **Nothing tells them.**

Terminals support this: `OSC 9` for a desktop notification, `\a` for a bell, and many
terminals mark a tab as having activity. **A few bytes on the wire**, gated on a threshold —
notify only if the operation ran longer than N seconds *and* the terminal is unfocused, where
that is knowable.

It is the kind of polish that is invisible when it works and conspicuous by its absence, and
it costs almost nothing.

### Structured export — copy as data, not as characters

`b.table` has rows and columns; `b.patch` has hunks; `b.comparison` has pairs. **So "copy
this as CSV" or "save this as JSON" is a projection the framework can already perform**, and
a terminal tool that only ever offers you characters cannot.

Pairs with semantic copy — the same focused-thing, a different verb — and it is the second
capability that exists *because* the transcript is structured rather than painted.

### Error remedies as `fill` actions — generalise a pattern already found

Step 10 found the case: `docker rm` on a running container refuses **and names the remedy**,
and the right response is a `fill` action writing `/rm <name> --force` into the prompt.

**That is a pattern, not a special case.** Any far side whose errors name a fix — most
mature CLIs do — can offer it as one keystroke instead of a re-type. The adapter recognises
the error and attaches the action; the framework already has `fill`.

### Empty states that teach

*"no containers"* is correct. *"no containers running — `/ps -a` shows 6 stopped"* answers the
question the reader actually has, and *"no volumes — `/volume create <name>`"* teaches the
verb.

**And the empty-block class says the same thing from the correctness side**: absence of
output and failure to produce output must not look alike. An empty state that *teaches* is
that rule paying a dividend rather than just avoiding a defect.

### Progress feedback while something is slow — the spinner is static, and deliberately so

**It exists and is frozen on purpose.** `paint.ts:89` is a single `⠋`, with the reasoning
written beside it:

> *One frame of it rather than an animation: C03 commits on events, not on a ticker, so a
> rotating spinner would need a timer this layer does not own and must not grow. The claim
> C19 §7 makes is that the wait is visible, and one glyph is that.*

A considered decision, not an oversight. **But the argument has a hole, and it is exactly
the one the feedback names.**

**A static glyph proves a wait *began*. It does not prove anything is still *happening*.**
After three seconds, a frozen `⠋` and a hung process are indistinguishable — and *"is it
working or is it dead"* is the question a user actually has. C19 §7's claim, that the wait
is visible, is satisfied; the claim a slow operation needs is different.

**And the timer objection no longer holds.** C23 §3b's refresh driver **is** a ticker — built,
shipped, with `schedule` as an ambient and `b.live` parts driven off it. The comment was true
when written and is not now. **Animating the spinner is a consumer of a mechanism that already
exists**, not a timer C03 has to grow.

**What "feedback" should mean, in three tiers — because motion alone is the weakest of them:**

- **Motion** — the spinner rotates, so the reader knows the process is alive. Cheapest, and
  it is what the feedback literally asks for.
- **Elapsed time** — `running · 4s`. Strictly better than motion: it distinguishes *slow*
  from *stuck* by a number rather than by a vibe, and it needs the same tick.
- **What it is doing**, where the far side says so. `docker pull` emits per-layer progress;
  a tool call knows its own name. **This is the tier that turns a wait into information**,
  and step 11's progress work is its first real consumer.

**The stall notice is the fourth tier and it is already built** — C23 §3b fires one when a
stream goes quiet past a threshold, and step 3's frame-read caught its default `renderError`
being unconstructable. So the machinery for *"this has been quiet too long"* exists; what is
missing is the ordinary case of *"this is still going."*

**One thing to get right:** the tick must not be a second scheduler. C03 commits on events
and the refresh driver already owns the clock — so an animated spinner is a `b.live` part or
it is a refresh-driver tick, **not a `setInterval` in `paint.ts`**. The comment's real point
survives even though its premise does not: this layer must not grow a timer.

### A scrollbar — the terminal cannot provide one, and C14 already has the numbers

**The terminal's scrollbar is not available, and not for a fixable reason.** The app runs in
the **alternate screen**, which by definition has no scrollback — the terminal shows exactly
the rows the app draws and nothing sits behind them. That is why vim, less and htop all draw
their own.

And even where one appeared it would be wrong: it scrolls the *terminal's* buffer, while the
transcript is a **virtual list of thousands of rows that were never sent to the terminal**.

**C14 already holds everything a scrollbar needs.** The Fenwick index knows the total height
of all entries, the current offset and the region height — so `thumb position = offset /
total` and `thumb size = region / total`. **Nothing needs computing. It needs drawing.**

**One ruling, and it is not the obvious choice: reserve the column always, never
conditionally.**

A scrollbar that appears only when the content overflows changes the available width when it
appears — which changes wrapping, which changes heights, which changes the total, **which
changes whether it overflows.** A feedback loop, and it would present as text reflowing while
you scroll. One cell of two hundred is not worth that.

So `measure` is called at `columns - 1` always, and the column is empty when there is nothing
to scroll.

**Degradation is trivial** and follows the existing pattern: `│` track with a `█` thumb at
depth, `|` and `#` at ASCII. Nothing structural changes, which is the easy case B04 is for.

**Mouse drag-to-seek pairs with motions that already exist.** The router hit-tests by region,
so a click or drag in the scrollbar column can seek — and `PgUp`/`PgDn`/`⌃Home`/`⌃End` are
already bound, which satisfies C02's rule that *every mouse affordance has a keyboard
equivalent*.

### And a cheaper partial fix that may matter more

The report is that the absence is **confusing**, and the confusing part is not the missing
bar — it is that **nothing says there is content above.** A reader cannot tell a short
session from a long one scrolled to the bottom.

**That indicator already exists as a pattern.** Step 5 built `▲ 8 more rows` for the document
view when a block exceeds its region — *"content stopping mid-object with no indicator is
indistinguishable from content ending"*, which is the same sentence one region over.

So: **the transcript's edges gain the same treatment**, and it is a fraction of a
scrollbar's cost. Worth doing first, and possibly worth doing *instead*, if the scrollbar's
reserved column turns out to be the more contentious half.

### Region separators — the frame marks none of its four regions

**Seen in a real frame**, not reasoned about: the header runs straight into the banner, the
transcript's last line runs straight into the prompt, and nothing says where one region ends
and the next begins.

**The layout, and the dividers are the point:**

```
HEADER  (optional)
──────────────────────────────────────────────────────



CONTENT



──────────────────────────────────────────────────────
❯ PROMPT
──────────────────────────────────────────────────────
FOOTER  (optional)
```

**The prompt is bracketed on both sides**, which is the part that matters and the part an
earlier version of this entry missed. One divider below the transcript is not enough — the
prompt is a *region*, and a region with a line above it and nothing below it reads as the
bottom of the content rather than as its own space. **Both, or neither.**

It matters because **the regions behave differently.** The transcript scrolls; the prompt does
not. Without the brackets a long transcript's last line reads as part of the prompt, and the
header's status line reads as content.

**And a drawn line is the only tool that works at every setting.** A theme *may* now paint
[its own background](#theme-background), but `background: "terminal"` remains legitimate — and a transparent
terminal has no fill to distinguish regions with. So separators cannot depend on a background
being present. **A drawn separator is not a workaround — it is the
consequence of a choice already made**, and the entry should say so rather than presenting it
as an addition.

**Cost, and it is the thing to weigh honestly.** Three dividers on a 40-row terminal is 7.5%
of the screen, and every row taken from the transcript is a row of content. So:

- **the prompt's two are the ones that earn it** — they mark the region whose behaviour
  differs most
- **the header's is the arguable one**, and it is the one to make optional alongside the
  header itself
- **the footer, if present, brackets the same way** — a footer with a line above it is
  chrome; one without reads as a trailing content row

**Belongs to C22 §6 and S01 §3**, with the optional-header/footer work and the [chrome row
budget](#chrome-row-budget) — all three are about what the frame's chrome may contain, and deciding them
separately is how four features end up fighting over one row.

<a id="scrollable-containers"></a>
### Scrollable containers — and the criterion is focus, not "is it a container"

**A correction to an earlier ruling here, and half of it still stands.** What was argued
against was **mid-row slicing and an independent viewport inside a block**, because
`measure(block, width) → height` is total and pure and every cache, the compositor and C14's
virtualisation rest on it. **That constraint is real** — it is what `windowPatch` and
`BlockDefinition.window` were designed around.

**What was wrong was reading it as "no inner scroll".** A scrollable container is three
things and two of the three are now built:

| piece | state |
|---|---|
| `window?` — reduces a block to a **valid smaller block of the same kind** | **built** (F134) |
| `elements?` — navigable positions with a row range | **built** (C26 stage 2) |
| a **view offset**, per container, owned by the focus model | **missing** — no `scrollOffset`, `containerOffset` or `innerOffset` in `src/` |

Nothing about the third breaks the measurement invariant, because **the container measures at
its declared height and windows its child** — the move `patch` and `logs` already make. The
expensive thing that was refused is not the thing being asked for.

#### Where it stops

> **A container scrolls if it is focusable and its content can exceed its declared height.**

**Scroll follows focus**, because a keystroke has to land somewhere the reader can see and a
container with an offset and no focus is a scroll nobody can aim. That criterion **admits**
the live block, a pushed view's inner blocks, the completion menu, a paste chip's peek and
the prompt; it **excludes** `row`, `panel` and `group`, which have no declared height of
their own and nothing to focus. A panel with its own offset wrapping a scrollable table is
two offsets where a reader expects one.

It needs **a declared height** — `b.row`'s `height: "fill"` question, and the same ruling:
*the block declares intent, the owner resolves it, and `measure` never sees the unresolved
form*. And the offset is **view state, not accumulated state**, per C23's rule from the
shared pollers work, which is what makes it droppable — the argument entry 44 now rests on.

#### The consumers, and one is nearly built

| consumer | today |
|---|---|
| **the prompt**, when the buffer outgrows `promptRows` | the window exists and is tail-anchored — **entry 28**, and the fix is threading `cursorCell` |
| the completion menu | `… N more` and no way to reach them — **the count exists and the motion does not** |
| a paste chip's peek | designed, unbuilt (entry 30) |
| **a live block** whose content outgrows its region | `logs`' whole purpose, and the case `window` was built for |
| a pushed view's inner blocks | nine flat bindings scroll **the document**, so `n` moves whole blocks past a table the reader is inside |

**The live block is the strongest, and it is the only one where the content moves under the
reader** — at the bottom, follow; scrolled up, hold. That is the scroll-anchor rule inside a
container rather than in the transcript, and **C14's `#anchor` already makes exactly that
distinction (entry 8, BUILT)**, so the rule exists and needs generalising rather than
inventing.

**One offset concept, five owners.** Build the rule once — *the window follows the reader's
attention, and says so when it is not showing everything* — and each consumer is wiring.

#### Selection across a scrolled boundary is the part that does not fall out

- **Does a selection extend past the visible window?** Dragging to an inner container's
  bottom edge either stops or auto-scrolls. Both defensible; **stopping silently is the one a
  reader reads as a bug.**
- **Does copy take the selected text or the selected elements?** Semantic copy is the
  advantage, and a selection spanning the boundary has to be a character range or an element
  range — which give different answers.
- **`copyMode` would turn mouse tracking off** so the terminal's own selection works, and the
  terminal **selects what is painted**. A container's hidden rows are not painted, so
  terminal-native selection cannot see an inner offset at all — and turning tracking off
  kills the wheel with it. **Terminal-native selection and inner scroll are in direct
  tension, and semantic copy is the way out rather than a nicety.**

  **Conditional, because the toggle does not exist yet** (entry 15, measured 2026-08-13):
  `MOUSE` is one mode string and `mouseEnabled()` reads capabilities. The tension is real and
  is a property of terminals rather than of this tree, so the conclusion stands — but stated
  as a prediction about a mechanism entry 15 would add, not as a defect in one that runs.

Build the container and the selection model together, or the second is retrofitted against
the first — they are one concept at two scopes, exactly as entry 15's three are.

#### Degraded, four affordances collapse onto one cell

ASCII draws the bar as `|` and `#` (entry 36's ruling). **At 1-bit the wash is gone, so the
filled bar cell is the only focus signal left** — more weight than reserve-and-fill was
carrying at truecolour. So **the focused container's border changes character**: a different
box-drawing weight, or `+`/`#` at ASCII. It survives every depth, it is one character rather
than a colour, and it is **F34's rule applied to a container** — a distinction must not be
carried by colour alone. Optional at truecolour, **not optional at 1-bit**, because nothing
else is left.

---

<a id="configurable-cursor"></a>
### A configurable cursor — two axes, and only one is trivial

**The glyph is really the shape, and the terminal draws it.** `cursorSequence` is C01's and
positions the cursor; *which character* is `DECSCUSR` — block, underline or bar, each steady
or blinking. **A capability-gated escape rather than something Calcium paints**, and it
degrades by being ignored. Cheap.

**The blink default is a state machine, not a terminal setting.** *Blinks when idle, steady
while typing* is the behaviour worth having and no terminal offers it: emit the steady
variant on a keystroke, emit the blinking variant after N ms of no input. **The refresh
driver already owns the clock** — the argument that closed the spinner's *this layer must not
grow a timer* premise — so this is a consumer of an existing mechanism rather than a new
timer in `paint.ts`. The constraint survives even though its premise did not.

**RULED: per focus target, not global.** The cursor is placed by whatever holds focus —
`Placed.cursor`, relative to the layer's own origin, absent means hidden (C15 I19). So shape
and blink are per target: **a bar in the prompt and a block in a pushed view is a legitimate
thing to want, and deciding it as one global setting forecloses it.**

---

<a id="horizontal-composition"></a>
### Horizontal composition — every block is full width, and the banner paid for it

**A row container: `b.row([a, b], { gap })`.** Its height is the tallest child at its
allotted width; children share the width. One block kind, not a layout engine — the same
containment `panel` and `group` already have, on the other axis.

**The consumer already exists, and it is instructive: the banner.** The whale and the
wordmark had to be **hand-composed into a single `raw` block** because Calcium cannot put
two blocks side by side. Everything that went wrong there is downstream of that:

- the whale had to be **padded to a uniform 40** by hand, and trimmed as well as padded
- the wordmark had to be **top-padded by one row** by hand, because the two arts have
  different heights
- a **tab character** in the art would have measured 1 and drawn 8 — a hazard that only
  exists because the app is doing its own cell arithmetic
- the composed width had to be **measured three times** before it was right

**Every one of those is work the framework would have done.** A `row` container measures its
children, aligns them, and pads to the tallest — which is precisely the list above.

Beyond the banner: side-by-side panels, a label and a value that are separate blocks, a
sparkline beside its number.

**Alignment and padding come with it**, and only with it — a full-width block has nothing to
align against. So `align: left | centre | right` on a row's children, and padding as a
general property rather than `gapBefore` being the only spacing that exists.

**The risk, stated plainly:** this complicates `measure`. Today a block's height is a
function of `(block, width)` and nothing else — which is the invariant every cache,
compositor and degradation path rests on. A row makes a child's width depend on its
siblings. **Containment is what keeps that safe**: the row computes its children's widths
and calls the same `measure` on each, so the function's shape never changes and no second
height codepath appears. A general 2D layout engine would not have that property, which is
why the ruling is a row container and not a layout engine.

### Dynamic sizing — two problems, and only one is cheap

*"Things fill the space they are given, or shrink down — a fraction of the width or the
height."* Those are two different features and they should not be planned as one.

#### Width fractions — cheap, and they ship with the row container

**A fraction of the width only means anything inside a row.** Outside one, a block is
full-width, so there is nothing to take a fraction of. So this is a property of a row's
children, and it is **the same `flex` concept C11 already has for table columns**, one level
up:

```
b.row([plot, stats], { flex: [2, 1] })     the plot takes two thirds
```

C11's precedent is worth following exactly, including its lesson: **F50 found that a column
with no `flex` gets its minimum and nothing more** — so a row's children need the same
opt-in, and the same care about where slack goes. The `/ps` NAME column carried that comment
three lines from where it was written again.

**F50 is cited here as precedent and is not fixed here.** It is an open finding against C11's
*columns*; a row container inherits the lesson and leaves the defect where it is. Saying so
matters because the citation reads as coverage — which is how a finding gets planned once and
fixed never.

**Ships with `b.row`. No new concept, no measurement change.**

#### Height flexibility — real, and it collides with two open things

*"Fill the remaining height"* is much harder, and the reasons are already on this list.

- **In a scrolling transcript it is meaningless.** There is no remaining height — the
  transcript is unbounded and a block's height is its content's. "Fill" has no referent.
- **It only means something in a pushed view**, where the content is the region's worth.
  S3's dashboard is the case: the plot is fixed at five rows and would rather grow into
  whatever the view has spare.
- **The producer cannot see the height.** `AdapterContext` carries width and no height —
  that is **F37**, and it is exactly the producer-context contract question phase 1.1 is
  about. So this is that contract's second consumer.
- **And it must not change `measure`'s shape.** A height that depends on the region breaks
  `measure(block, width)`, which every cache, compositor and degradation path rests on.

**Ruled, if it is built: the block declares flexibility, the owner resolves it, and
`measure` never sees it.**

```
b.plot({ height: "fill" })      the producer declares intent
                                the VIEW OWNER — which knows the region — rewrites it to
                                height: 12 before measuring
                                measure(block, width) is called unchanged
```

**Resolve, then measure** — the same containment principle that ruled the view windowing a
block-boundary operation rather than a mid-row slice, and that keeps `b.row` a container
rather than a layout engine. Three rulings now with the same shape, which is a good sign it
is the right one.

**Shrink-to-fit is the same mechanism from the other side** — a block declaring it *may* be
smaller, resolved by whoever knows the space. Do not plan it separately.

### A bar at 0% reads as a broken element

Small, and visible in the same frame. A CPU bar at `0.0%` renders as an **empty box** — and
an empty box is visually indistinguishable from a component that failed to draw. Four rows
of empty boxes beside four numbers reads as a defect.

Options: a minimum visible fill, a different glyph for zero, or no bar at all below a
threshold. **The empty-block class in miniature** — absence of a value is drawn the same as
absence of a component, which is the fifth instance of that pattern.

### ★ Syntax highlighting covers two languages — ship the mainstream set

`code.ts:31` is `createLowlight({ json, yaml })`. Everything else renders flat: TypeScript,
Python, a stack trace, a diff, SQL.

**The recorded objection is bundle weight, and it does not survive measurement.** Grammars
import individually — `diff` is 1.2 KB, `python` 9 KB, `typescript` 21 KB — and **24
mainstream grammars total 180 KB**. The 9.3 MB figure is the whole package, including 384
grammars, minified duplicates and CSS themes, none of which gets pulled in.

For a Node CLI that is noise, and **a highlighter that flattens the language you actually use
reads as broken rather than as economical.**

**Ship**: `json` `yaml` `diff` `bash` `typescript` `javascript` `python` `go` `rust` `java`
`c` `cpp` `csharp` `ruby` `php` `sql` `html` `xml` `css` `markdown` `toml` `ini` `dockerfile`
`nginx`.

**And expose registration** — it matters more with 24 than with 2, because the mainstream set
never covers a consumer's own domain. Prism wants its DSLs; an `agent-tui` user pastes
whatever they work in. **Exported block kinds, unexported grammars** is the same asymmetry as
`CommandPolicy` being pluggable and unreachable.

Amend the comment rather than deleting it: its principle holds — the full 384 *is* most of the
weight and none of the value. What changed is that *"actually needed"* was measured against
two consumers and now has more.

**And this is a regression against a stated design, not a scoping choice.** C09 §4a builds
the whole `code` block around languages *being added*:

> *"Measurement ignores syntax entirely… a `code` block measures identically whether or not
> its language is registered, so **a language shipping tomorrow does not reflow yesterday's
> transcript**."*
>
> *"An unregistered language renders as plain text, not an error… readable today and
> **highlighted whenever someone registers it**."*
>
> *"The fallback is a fallback, **not a filter**."*

Those sentences are pointless under a fixed two-language set. `measure` ignores tokenisation
**so that** adding a grammar later is safe; unregistered renders as text **so that** it is
readable until someone registers it. **The design assumed more would arrive.**

Then `createLowlight({ yaml, json })` shipped with no registration path, so *"whenever
someone registers it"* has **no someone**. The spec's own promise is unreachable.

**Why it happened:** C09 was built when the only consumers were `docker inspect` (JSON) and
an nginx config (YAML). Two grammars satisfied every test, and **nothing in the suite could
distinguish "we ship two" from "we ship two for now"** — §4a's promises about future
languages are prose, which no rule checks. The same class as `/help`'s README claim and
F58's four documents with no measurement behind them.

**So this is phase-1-shaped, not a feature.** The spec commits to registration; the
implementation shipped without it, and a stated extension point that does not exist is the
gap this project has now found eleven times.

### ~~The command prefix is unreachable~~ — CORRECTED: it is wired

**This entry was wrong and the correction is recorded rather than deleted.** `TuiConfig` has
`commandPolicy?: CommandPolicy`, threaded `config.ts:108 → construct.ts:673 →
execution.ts:174 → parse`. An app can supply its own prefix today.

I concluded otherwise from grepping `config.ts` for "policy", finding a comment about size
policy, and reading a miss as an absence — **a correct conclusion from incomplete evidence,
which is still wrong.** Same shape as F9 grepping for a field when the seam was a step.

**What survives is the prefix-*out* question below**, which is a genuine gap and a different
one.

### ~~No app can supply a `CommandPolicy`~~ — RETRACTED, and the Order list carried it anyway

**The mechanism exists, is well designed, and is reachable.** `CommandPolicy` is documented
as *"the whole of what is pluggable"* — a policy answers one question, *is this token the
app's verb and what is it*, while built-ins, operators and refusals stay identical under every
policy, *"which is what stops a replaceable prefix from becoming a replaceable parser."*
`prefixPolicy(":")` gives `:ps`, and both are exported from `src/index.ts`.

**This section used to claim no app could supply one. Measured at HEAD, that is false:**

```
src/shell/types.ts:318      commandPolicy?: CommandPolicy;
src/shell/config.ts:108     commandPolicy: config.commandPolicy ?? slashPolicy
src/shell/construct.ts:699  commandPolicy: config.commandPolicy
src/shell/execution.ts:174  policy: deps.commandPolicy
```

**Kept rather than deleted, because the deletion is the failure.** The section above already
corrected this once and **the correction never reached the Order list**, which summarised the
retracted half as *"CommandPolicy is exported and unreachable — a config field."* A struck
heading over a live body is exactly enough ambiguity for a summariser to take the wrong half.
FINDINGS F89.

**What survives is the next section, and it is a ruling rather than a field.**

### Prefix-*out*: prose by default, verbs by exception — and `agent-tui` needs it

**A different question, and only one of the two shapes is expressible today.**

```
prefix-in    "/ps is a verb, everything else goes to the shell"     slashPolicy — works
prefix-out   "everything is prose, /help is the exception"          nothing expresses it
```

`prefixPolicy("")` does not do it — an empty prefix makes *every* token a verb, so `ls -la`
gets looked up in the manifest.

**This is not a prefix change; it is an inversion of the default route.** A shell sends an
unrecognised line to `sh`; an agent harness sends it to the model. **`agent-tui`'s A1 needs
exactly this** — typing a message must not be parsed as a command — and it is the first
consumer that has ever wanted it.

**So the ruling to take is whether `CommandPolicy` can express it, or whether the default
route is a separate concern**: `defaultRoute: "shell" | "app" | (line) => …`, alongside the
policy rather than inside it. The second is likelier — the policy answers *"which verb is
this"* and the default route answers *"what if it is none"*, which are different questions.

<a id="completion-ranking"></a>
### Completion is prefix-matched and unranked — both are fixable and one is nearly free

**`engine.ts:115` is `candidates.filter(c => c.value.startsWith(prefix))`**, and nothing
sorts. Two consequences a user feels immediately:

- **`/con` finds `/container stats` and never `/compare`… but `/stats` is unreachable from
  `/st`+anything if the verb is `container stats`.** Prefix matching cannot find a word in
  the middle of a name, and sub-verbs put words in the middle by construction.
- **Order is source order.** The most-used verb and the one you have never run rank
  identically, so the useful candidate is wherever the manifest happened to put it.

**Three improvements, in increasing cost:**

- **Rank before filtering matters — sort by recency, then by usage, then alphabetically.**
  C20's history already holds what was run and when, so recency costs a lookup and no new
  state. **This is the cheapest and the most felt**: the verb you ran a minute ago should be
  first.
- **Substring, then subsequence.** Prefix → substring is one line and fixes the sub-verb
  problem (`stats` finds `container stats`). Subsequence — `cstats` → `container stats` — is
  the fuzzy-finder behaviour people expect from `fzf` and every editor's command palette, and
  it needs a scorer so that better matches sort higher. **Score the match quality; do not
  just accept more candidates**, or fuzzy matching makes the list worse rather than better.
- **Show *why* a candidate matched** — highlighting the matched characters, which every good
  fuzzy finder does and which is the difference between trusting the ranking and second-
  guessing it.

**And it compounds with as-you-type completion** (below): a menu that opens itself is only an
improvement if what it shows is ordered usefully. **Rank first, then trigger** — an
unranked menu appearing on every keystroke is worse than a ranked one on `Tab`.

### ★ One popup, four consumers — see `CALCIUM_POPUP_DESIGN.md`

The confirm, the completion menu, the paste peek and `agent-tui`'s question are **the same
thing**: a layer anchored to the prompt, showing content, answered with keys, dismissed with
`esc`. Built separately they drift — different flip logic, different truncation, different key
handling — which is the two-records-of-one-fact class in UI form.

```
              content            selection       resolves by            router may pop?
completion    candidates         arrow / type    inserting into buffer   yes
confirm       2–4 choices        arrow / letter  a promise               NO — would hang
question      choices or text    arrow / typing  a promise               NO — would hang
peek          content only       none            esc, or ⏎ to open       yes
```

**Ruling A already pushed the confirm most of the way there** — it is a *choice list, not a
yes/no box*, general enough for A3. A prompt-anchored choice list **is** the completion menu
with different content and a different resolution.

**Two parameters are the whole difference:**

```
onSelect       insert | resolve(key) | resolve(text) | none
dismissable    true for advisory layers, FALSE where an owner awaits an answer
```

#### What it unifies, concretely

C19's menu **already has** the list, the selection, keyboard navigation, the above/below flip,
width from the widest entry plus padding, and **`… N more` truncation reading
`Placed.truncated`** — which C19 renders because only C19 knows the remainder.

**The confirm reimplements or lacks all of it**, and the peek and the question would each
reimplement it again. The truncation matters most: a `/prune` confirm listing twenty
containers does not fit above a prompt, and **`… 5 more` with `⏎` to open the full list is
already the menu's convention.** Without it the popup grows unboundedly.

#### Anchored, not centred — and the reason is where the eye already is

**The confirm arrives because you just typed something**, so attention is at the prompt. A
centred box makes you look away and come back.

**Weight moves from position to content**: the `▲` glyph, the title, the safe default first
and selected, and **the prompt being unavailable while a question is open** — typing does
nothing, which is itself a strong signal.

#### Two things it must not lose

**`dismissable: false` stays false.** That ruling was about the *router* not popping a layer
whose owner is awaiting an answer — a silent pop hangs the verb forever, the layer vanishes,
the prompt stays unavailable, and nothing says why. **Only the anchor changes, not the flag**,
and it is worth one assertion because the symptom reads as *"the shell froze"* and the cause
is three components away.

**And the centred version's gravity**, replaced by the content above rather than lost.

### ★★ The worst case is one enormous block, and nothing bounds it

**Large patches, large command output, long lists — the requirement is that they render
quickly and do not lag the whole TUI.** Today they do lag it, and the reason is that
**nothing bounds a single block's size.**

```
D40's cap          bounds BLOCKS PER DOCUMENT — not rows within a block
MAX_ROWS = 2000    is the FALLBACK adapter's own limit — an app adapter has none
```

So one `patch` block from a 50,000-line `git diff`, one `code` block from a large file, one
`table` an app built without capping — each is a single block, and **every frame renders all
of it to show thirty rows.**

#### The four fixes are one chain, and their order matters

They are not independent items; each only pays off once the one before it lands.

**1. [Output diffing](#output-diffing) — write only changed rows.** Cuts the cost of *every* frame
regardless of block size. Smallest change, and the `contaminated` flag is already the
invalidation story it needs.

**2. [Render caching](#render-caching) — key on `(entryId, rev, width)`.** The frame *after* the first
becomes free. But the first frame still renders 50,000 lines, so on its own this converts
*continuous* lag into *one long stall* — better, and not enough.

**3. Render only the visible window of a block.** This is the one that actually fixes it, and
it is the heterogeneous-windowing finding from step 3 with its consumer finally present.
`windowPatch` already proves the pattern: **reduce a `Patch` to a valid smaller `Patch`**, so
the standard measurer measures it normally and no second height codepath appears.

**Per divisible kind** — `patch`, `table`, `keyValue`, `logs`, `code` all reduce cleanly. The
plot does not, and that is permanent (C12 I1: reducing a plot's data changes nothing about
its height). **Granular where the kind divides, atomic where it does not.**

**4. [`cells()`'s ASCII fast path](#cells-fast-path).** Only worth measuring after 1–3, because most calls
disappear with the cache.

#### And a bound, because a fix is not a guarantee

**Even windowed, `measure` still walks the whole block once** to know its height — and a
50,000-row table has to be measured before C14 can place it.

**So bound it, and make the bound the app's to raise.** `MAX_ROWS` exists for the fallback
adapter and nothing generalises it: a default cap per block with a visible marker
(*"2,000 of 50,000 rows"*), overridable where an app genuinely wants more. **The marker is
what keeps it honest** — D40's eviction already carries one, for exactly this reason, and a
silent truncation is the empty-block class again.

#### The acceptance test is a frame-read, not a benchmark

**Type into a 5,000-line diff and watch.** A microbenchmark that improves while the frame
still stutters has measured something other than what a user experiences — and the three
findings above were all found by reading code and frames, not by profiling.

<a id="shared-pollers"></a>
### ~~★★ Shared pollers~~ — BUILT, Order 18

**Corrected 2026-08-13.** `shell/refresh.ts` holds a `Source` per declared source, and
**every part refers to one** — a part with no declared `source` is still a source, which
is what keeps one code path rather than two. The derivation layer is `folds`, one entry
per derivation key holding the version it was computed at (I47); **the stagger is over
sources rather than parts**, so parts sharing a source are aligned by construction rather
than by two spreads agreeing. Backoff is the source's and rendering is the part's
(§8d D6).

**The correctness half is the reason it was worth doing, and it is what landed first.**

**Every `b.live` part owns its own `fetch`.** The landing dashboard, `/stats`, and a
single-container panel each spawn `docker stats --no-stream` on their own interval. Three
subprocesses, one endpoint, no coordination.

**And the correctness half is the stronger argument.** Two parts polling the same source at
different moments hold **different data** — one plot and one sparkline each keep their own
history and the two diverge. **Two views of the same thing showing different numbers is a
bug, not a cost.**

#### Three layers, and the split is the design

```
SOURCE       fetch, shared, versioned            one docker stats per tick
  ↓
DERIVATION   pure computation, shared, memoised  the ring buffer · window averages · the parse
  ↓
PART         view state + render, per instance   one expanded, one collapsed
```

**Different states, different views, different renderings — one fetch and one computation.**
Parts sharing a `source` key share both; only what is *drawn* is per-instance.

#### The rule that makes it clean

> **Per-part state is view state only. Anything that accumulates belongs in a derivation.**

Expanded/collapsed, selected, which tab — those are per part, and they are exactly the things
that **do not need updating when nobody is looking.** A ring buffer, a running average, a
count — those accumulate, so they are shared and they keep going.

**That is what makes "off screen does nothing" safe**: a paused part cannot fall behind,
because it holds nothing that could.

#### What falls out — four more wins, and they are consequences rather than additions

**1. Render is memoised on `(sourceVersion, viewState, width)`.** If none of the three moved,
the previous `Block` is still correct — **so skip the render, the measure and the diff.** This
is [the render cache](#render-caching) keyed more precisely, and it means a collapsed part on a ticking source
costs almost nothing.

**2. A derivation runs only if a visible part needs it.** If every consumer of the ring
buffer is off screen, the buffer's maintenance is skipped too — the source may still poll for
someone else, but nothing computes for nobody.

**3. All parts sharing a source patch in ONE batch.** Today three parts on the same data
patch independently and commit three frames. Shared, they tick together by construction, so
it is **one batch and one commit** — which the frame scheduler already coalesces, but only if
the patches arrive together.

**4. Stagger sources, not parts.** `assignOffsets` spreads parts to avoid a thundering herd.
With shared sources there are **far fewer things to stagger**, and parts sharing one are
aligned by construction rather than by arithmetic. The stagger gets simpler *and* has less to
do.

#### Off screen: pause, and catch up on return

**Ruled: pause.** No poll, no derivation, no render, no measure, no state update — and
nothing is lost, because per-part state does not accumulate.

**I9 is not violated**, and the distinction belongs in the ruling: I9 protects a *frozen*
entry — a newer entry appeared, the thing is still running — and says patches keep arriving.
**Scrolled-off is a different state**: nobody is looking, and the moment they look the part
refreshes. The `--watch` is still declared, still live, still in the transcript; it is not
polling for an empty room.

**With sharing this compounds**: one visible part keeps the source polling for everything
that shares it, so returning to a scrolled-off panel is frequently free.

#### Where to stop

**Two levels, not a general reactive graph.** `source → derivation → part` covers every case
here, and arbitrary dependency depth is a different and much larger thing — the same call as
`b.row` being a container rather than a layout engine, and block-boundary windowing rather
than mid-row slicing. **Three rulings with the same shape now.**

**And do not chase structural sharing of rendered blocks.** Two parts rendering identically
is rare, and the equality check costs more than the render it would save.

### Resize is never delayed, and it rebuilds the index every time

**C03 I2 makes `resize` immediate** — *"input, completion and resize are never delayed"* —
alongside the two reasons that genuinely cannot wait.

**But dragging a window emits dozens of SIGWINCHes**, and each one forces an immediate frame
*and* a **full Fenwick rebuild**: `viewport.ts:202` calls `#rebuild()` on a width change,
which is correct (heights change with width) and is the one operation the incremental index
cannot do incrementally.

**So a resize drag is: N full index rebuilds, N full re-renders, N full frame writes.** The
[render cache](#render-caching) and [output diffing](#output-diffing) do not help — every row genuinely changed.

**A short coalescing window is the fix, and it is a C03 I2 amendment rather than a bug fix.**
I2's reasoning is that a delayed resize means a visibly wrong frame; **the counter is that a
delayed resize by 16 ms means one correct frame instead of thirty wrong ones**, and the final
size is the only one anyone sees. Immediate for the *first* resize, coalesced for a run of
them, is the shape — which is what a terminal emulator does with its own repaints.

**Measure a real drag first.** If a rebuild at a realistic transcript size is sub-millisecond
the whole thing is moot, and the honest answer is a recorded negative.

### Checked and clear — recorded so nobody re-derives them

- **Frame commits coalesce.** C03 has `idle | pending | writing` with per-reason windows and
  a strictness ordering. Working as designed.
- **Completion cancels in flight.** Sequence-as-token-of-validity — a superseded request's
  result is discarded rather than raced.
- **Theme resolution is cached**, with a serial that invalidates on override so a warm cache
  cannot serve stale styles.
- **Entries scrolled off are not rendered.** C14 selects visible rows before `paint` sees
  them; the off-screen problem is *inside* a visible block, not between entries.

### ~~★ Off-screen work~~ — BUILT, Order 20

**Corrected 2026-08-13.** `refresh.ts:212` takes `visible: (host: RefreshHost) => boolean`
and `construct.ts:760` answers it from `stores.viewport.visible()`. The ruling it carries
is worth keeping in view: **a `view` host is visible while it is declared**, and *entries*
are what the viewport reports, so a part inside a partly-visible entry counts as visible.
Per-block offsets do not exist, and inventing them here would have been a second geometry.

*"Do not redraw what is not on screen"* is three separate questions with three different
answers.

```
entries scrolled off       ✓ HANDLED — C14 virtualises; paint gets rows already selected
rows off-screen INSIDE
  a visible block          ✗ a 5,000-line patch renders whole to show 30 — render caching
b.live parts scrolled off  ✗ THEY KEEP TICKING — no visibility check exists anywhere
```

**The third is new and nobody has raised it.** `refresh.ts` has **no reference to the
viewport, no visibility check, nothing**. A part ticks on its interval whether or not its
entry is on screen.

So scroll up past a `/stats` entry and it **keeps spawning `docker stats` every two seconds**
for a panel nobody can see. Ten live entries in a session is ten subprocesses a tick, most of
them invisible — and unlike the render cost, this one **spawns processes and hits the far
side**, which is the expensive kind.

#### Why it is not simply "pause when off screen"

**I9 is the constraint, and it was ruled deliberately**: *a frozen entry keeps receiving
patches*, because **a `--watch` scrolled out of view is still running** — that is the whole of
what I9 protects, and step 3's F17 nearly re-broke it.

**Scrolled-off is not the same as frozen**, though, and that distinction is the opening:

- **freeze** means a newer entry appeared. The thing is still *running* and the reader may
  scroll back to it — I9 says keep going.
- **scrolled off** means nobody is looking *right now*, and the reader may scroll back at any
  moment — so the data must be fresh **when they do**.

**Ruled: pause, and catch up on return** — see [shared pollers](#shared-pollers), which supersedes an earlier draft of this
paragraph that proposed throttling. Pausing is simpler, and the catch-up fetch on re-entry
means the reader never sees stale data either way.

**With a [shared source](#shared-pollers) this compounds**: one visible part keeps the source polling for
everything that shares it, so returning to a scrolled-off panel is frequently free.

#### What it needs

**The driver would have to know what is visible**, and today it does not — C14 selects
visible rows inside `paint`, and the result goes to the writer rather than back to the
driver. **That is a new seam**, and it should be one-directional: the driver *asks*
(`isVisible(entryId)`), rather than the viewport pushing changes, or every scroll becomes a
driver event.

**Measure before choosing an interval.** Slow-by-10× is a guess; the right number depends on
how expensive the fetch is, which is the app's business and not the framework's — so it is
probably a `b.live` field with a default rather than a constant.

<a id="help-per-verb"></a>
### ★ `--help` on every verb — the renderer exists and nothing can ask for it

**`usageBlocks(tool, id)` is built, exported, and has no caller in `src/`.** It generates
exactly the per-verb help you would want, from the manifest:

```
/stop <container> [flags]

Arguments:
  container  id or name

Flags:
  -t, --time  seconds to wait before killing
      --force  do not ask
```

And its own comment argues for it:

> *Exit 2 is an invocation problem, so the document says what a correct invocation looks
> like — **generated from the manifest, because a hardcoded usage string is wrong the first
> time a flag is added and nobody notices until someone reads it.***

**So it exists as the far side's usage-error path** — something for exit 2 — **and there is
no way for a user to ask for it.** Thirteenth instance of the class: the renderer built, the
reasoning written down, the trigger absent.

#### `--help` is the right trigger, and it hits F39

**Every declared flag is transmitted to the far side.** That is how `--raw` reached docker
and it exited 125 — **there is no way to declare a flag that selects a rendering rather than
an invocation** (F39 — [flags that select a rendering](#rendering-flags)).

So `--help` would be forwarded rather than intercepted. **Two consumers for one gap now**,
which is the strongest argument F39 has.

#### Two rulings

**Reserve `--help` framework-side; do not make apps declare it.** `/ps --help` should work on
every verb without the manifest listing it, the same way C05 appends the framework's six
verbs to every parsed manifest. **Otherwise it is a per-app discipline, and one app
forgetting it is a verb with no help** — which is exactly the failure the "generated from the
manifest" reasoning exists to prevent.

**And it shrinks `/help`'s problem rather than adding to it.** At fifty verbs a flat list is a
wall — [`/help`'s empty verb list](#help-bucketing). But if `/help` lists verbs with their summaries and `/verb --help` gives the
detail, **`/help` never needs to show flags at all** — two levels, and the second one is
already written.

**Check `/help`'s bucketing finding first** ([the bucketing finding](#help-bucketing)): a two-level help built over a broken
bucket inherits it.

### ASCII art and banners — sparse variants, graceful fallback, validation per variant

**The banner work is the evidence.** Three of the seven things it needed went wrong, two of
them in the spec I wrote: a tab that would have measured 1 and drawn 8, ragged line widths
that compose wrong against anything, and a composed width measured three times before it was
right. **All four failures were silent** — the art looked fine on the machine that made it.

**Art cannot be degraded automatically, and that is the premise.** A table drops columns; a
plot becomes stacked strips. Art has no structure to degrade *from* — a block-element
wordmark and an ASCII one are **two designs, not one design at two fidelities**. So the
framework's job is **the shape of the declaration and what happens when a variant is
missing**, never transformation.

#### Sparse variants, and one variant is a complete banner

```ts
b.art({
  text: "Docker",                    // the always-available fallback
  variants: {
    blocks: "▄▄▄▄▄   …",             // optional
    ascii:  " ____    …",            // optional
  },
})
```

**A variant declares its tier, not its capability requirements.** `ascii` and `blocks` is how
an app already thinks about its own art; mapping a tier to capabilities is a lookup the
framework owns, and it keeps the declaration from restating what the framework knows.

#### The fallback chain, and Calcium has already ruled on its shape

C09 §4a: *"an unregistered language renders as plain text, not an error"* and **"the fallback
is a fallback, not a filter."** Missing art degrades the same way — something readable,
never nothing and never a throw.

```
declared at this tier      use it
a LOWER tier is declared   use that — ASCII art is always safe at a higher depth
nothing declared           the text, styled. `Docker` in bold beats no banner
```

**The middle rung is what makes the API forgiving in the direction people use it.** Declare
only the ASCII variant and it works everywhere; declare only the fancy one and it works where
it can and falls to text where it cannot. **Neither is an error.**

#### Validation per variant — the cheap half, and the half that pays

Each variant is checked at construction, and each check catches a failure that is otherwise
silent:

| check | the failure it prevents |
|---|---|
| **no tab characters** | a tab measures 1 to `cells()` and draws 8 — **and the draw width varies by terminal**, so the art renders differently on different machines with no way to predict it |
| **uniform line width** | ragged art composes wrong against anything beside it. The whale was 40, 31, 31, 33, 40, 29, 26, 23 |
| **report measured cells** | so a tier threshold is a measurement, not an estimate. Mine was wrong twice |
| **row-count alignment** | two arts of different heights need explicit padding, and **a build step that trims blank lines silently undoes it** |

**Roughly thirty lines, and it would have caught every banner defect.** Worth having whether
or not anything else here is built.

#### Composition and tiers come free from work already planned

[`b.row`](#horizontal-composition) does the side-by-side that had to be hand-padded — measuring children, aligning
them, padding to the tallest, which *is* the list above. And **tier selection by measured
width is the block-boundary window's shape**: pick the variant that fits from a declared set,
rather than computing one.

#### Generated art, later and only for the text case

A wordmark is **text plus a font** — figlet's model, and figlet has hundreds of fonts, some
pure ASCII and some using block elements. So `banner("Docker", { font: byTier })` genuinely
*can* produce every tier from one source.

**A nicety, not the point**, and only worth it once a second app wants a banner. The
hand-drawn case is the one that needs the API to be good.

### Selection in the prompt — and `⌃a` stays where readline put it

**Select-all in the prompt does not exist**, and neither does selection: grep finds no
anchor, no mark, no region in C17. So there is nothing to select *into* — the binding is the
small half.

#### `⌃a` keeps line-start; select-all takes `⌥a` — checked, and `⌃⇧a` lost

**`⌃a` is line-start in bash, zsh, fish, every readline app, tmux's prefix, screen and
Emacs.** Changing it makes Calcium the one shell where it does something else, and the cost
lands on exactly the people most likely to try it.

The clash is real — **`⌘a`/`⌃a` is select-all in every GUI app** — but `Home` already does
line-start, so a user who does not know readline is not stuck. And moving `⌃a` alone would
break the `⌃a`/`⌃e` pair, since `⌃e` has no GUI conflict: **an asymmetric pair is worse than
either consistent choice.**

**Readline has no select-all because readline has no selection**, so there is no convention
to honour and the field is open. `⌃⇧a` reads as "the bigger `⌃a`", which is what it is, and
it is the same family as `⌃z`/`⌥z`.

**Checked against the decoder, 2026-08-13, and the answer is no** — per T2.13, the check that
already cost `⌃_`.

- `decode.ts:262` maps every byte 1–26 to `key(letter, …, {ctrl: true})`, and `key()` at
  `:118` defaults `shift` to `false`. **No shift information survives the legacy path**, so
  `⌃⇧a` and `⌃a` are one event.
- The two paths that *do* carry shift — CSI-u (`decode.ts:346`) and xterm's `modifyOtherKeys`
  (`:352`) — are parsed but never **requested**: nothing in `escapes.ts` or `lifecycle.ts`
  enables either protocol. They fire only where a terminal volunteers them, which is not a
  base a default binding can stand on.
- And `keymap.ts:193` already binds `{name: "a", ctrl: true}` → `home` on the prompt.

**So it is not merely a collision — the byte has a meaning.** A `⌃⇧a` row would resolve
against the same event as line-start and one of the two would silently never run.

**`⌥a` takes it, not as a fallback but as the binding.** The meta path exists
(`decode.ts:305`), and the meta bindings are `enter`, `backspace`, `d`, `b`, `f`, `z` — `a` is
free. It is the same family as `⌥b`/`⌥d`/`⌥f`, which is where the prompt's word motions
already live.

**Second binding lost to this check**, after `⌃_`, and both were found before anything was
built. That is the check working rather than a cost.

**And [rebindable keys](#rebindable-keys) is the real answer to "which default is right."** The keymap is
declarative data and this is one row either way — ship a default, let people change it.

#### The work is the selection, not the binding

C17 would need a **selection range**, every motion a shifted variant that extends it, typing
to replace it, and the renderer to show it — which is the [full-row background](#selection-wash), at
character granularity.

**The shifted motions belong with select-all, or the model gets built twice.** Select-all is
the *degenerate case* of a selection model — the whole buffer as one region — so shipping it
alone means shipping an anchor and a region for one binding and then generalising them:

```
⇧← ⇧→          extend by character       — CLEAR: s+left, s+right
⌥⇧← ⌥⇧→        extend by word            — BLOCKED by a decoder defect, C16 §2
⇧Home ⇧End     extend to line start/end  — CLEAR: s+home, s+end
⌥a             select all                — CLEAR: m+a
⇧⌃a ⇧⌃e        DEAD — ctrl+shift+letter is 0x01, the same collapse as ⌃⇧a
```

**Every row above was pressed through the built decoder, 2026-08-13**, per T2.13 — the check
that has now cost four bindings and, on this run, found a defect in shipped code:
`modifiersOf` reads three of xterm's four modifier bits, so `CSI 1;10D` (Meta-Shift-Left)
decodes as `s+left` — **a different, live binding rather than a missing one**. C16 §2 carries
the measurement. `⇧Home`/`⇧End` replace the dead ctrl-shift pair and are what GUI editors use
anyway.

**Every one of these has its unshifted motion already bound**, so the keys are not the work
and the list is short for the same reason select-all is: each shifted form is *move, and
extend the region from the anchor*, and typing replaces the region. That is the entire model.

**Check every shifted form against the decoder before binding it**, per T2.13 — `⇧←` is
`CSI 1;2D` and `⌥⇧←` is `CSI 1;10D` or an ESC-prefixed form depending on the terminal.
**A binding the decoder cannot produce is the fifteen-unexecuted-bindings class**, which has
already cost `⌃_` once and has now cost `⌃⇧a` — the check above, run.

**That is the same concept the copy story needs at two other scopes**: a selection in the
editor, a selection in the transcript ([`copyMode`](#text-selection)), and semantic copy of a focused
block. **One mechanism, three scopes — do not build it as a one-off for one binding.**

**Corrected by C16 §5a: it is two selection scopes and one mode that deliberately has none.**
The classification table put all three at rest against `⌥a` and nothing survives as a
*region* — the prompt's is a character range, the transcript's is a set of elements, and copy
mode is the app **not** reading a selection at all, because the terminal owns it. What
survives all three is where the text lands, which is the kill buffer (C17 §5a). **One
clipboard is the shared mechanism; one selection type is not.**

**And be precise about what is actually missing.** *Deleting* everything already works:
`⌃u` kills to start, `⌃a ⌃k` kills the line. What does not exist is **selecting** it — to
copy, or to replace by typing. If the want is "clear the prompt fast", that ships today.

<a id="selection-wash"></a>
### Selection needs a background, not just a tone — and that is free

**Correction to an earlier version of this entry**, which read C11 I14 too widely and ruled
out more than it forbids.

**I17 with I9 forbid anything that changes *size* — and I14 is not one of them.** Corrected
2026-08-13, a second pass over the same citation. I14 is about **ownership**: focus is drawn
by C11 and owned by C16, which is what keeps I11 true. It says nothing about geometry, so
pairing it with I17 here read as two invariants agreeing when only one was on the subject.
The rule is I17's, and it rests on I9:

> *"A height that varied with focus would move without `rev` moving, so C14's cache could not
> invalidate it — I9 broken in the one way measurement cannot catch, since **`measure` never
> sees focus at all**."*

**A background colour changes no dimensions.** It is a style over the same cells, exactly as
free as the tone change already happening — and **the patch renderer proves it**, since
added and removed lines get a background wash today and nothing about that touches
measurement.

So an *outline that grows a box* is out, and **a full-row background wash is in** — and it is
the strongest signal available without touching the cell grid.

#### The ladder, with a real answer at every depth

```
truecolour / 256   a background wash, foreground adjusted for contrast
16-colour          a coarser wash, or reverse video
1-bit              REVERSE VIDEO — swap fg and bg; needs no colour and works everywhere
ASCII              the reserved gutter glyph carries it alone
```

**Reverse video is the rung that makes this work**, because *"swap foreground and background"*
needs no colour at all and is supported essentially universally. So the degradation does not
fall straight from colour to a glyph — there is a strong middle.

#### The foreground must move with the background

**A wash under text that keeps its colour can drop below the contrast floor** C10 already
enforces everywhere else. So a selection style is **a pair, not a token**.

**Which argues for selection being a palette with `carries: "meaning"`** rather than an ad-hoc
style: it then gets the contrast floor and the required typographic fallback *for free*, from
machinery that exists, and C10 checks the pair the way it checks every other palette entry.

#### The glyph becomes the fallback, not the primary

**Better division than the earlier version had it.** Colour does the visible work where it
exists; the always-reserved gutter cell carries the distinction where it does not. Same rule
as F34 — a distinction must survive without colour — with colour doing the job when present.

The gutter cell is still **reserved always, filled only when focused**, so width never
changes. Same trick as the scrollbar's column.

#### One thing to get right when it is built

**Whether the wash spans the full row width or only the text.** Full-width reads as
*selected*; text-width reads as *highlighted* — and for a table row you almost certainly want
the former. That means **padding the row to the region width before styling**, which is a
rendering decision rather than a measurement one, so it stays inside I17 — the row is padded
to a width the layout already chose, and no cell count changes. (This line said "inside I14",
which is the ownership invariant and forbids nothing here.)

**And it pairs with the [navigation model](#navigation-model)**, where *selected* becomes a
state worth showing strongly because the reader is moving through things deliberately.

### Two themes ship, and one of them is broken

`ThemeSet = { dark: ThemeTokens; light: ThemeTokens }`. **Two, and `light` is the one that
renders dark-on-dark** on a dark terminal ([the background ruling](#theme-background)) because it sets foregrounds and paints
nothing behind them — which the background ruling fixes.

**More defaults, and the reason is not variety.** A theme is the framework's most visible
surface and the first thing anyone customises — shipping two, one of which is subtly wrong,
reads as an afterthought in a framework whose entire pitch includes a five-depth degradation
story.

**Worth shipping**: a high-contrast set (accessibility, and it is the one a degradation story
obliges), a solarised or gruvbox-alike (what people already use), and a genuinely neutral
low-saturation one for long sessions.

**Two things to get right, and both are already-decided rules:**

- **Every shipped theme passes the contrast floor and the 4-bit injectivity test** (C10 T2.3
  — the tones whose confusion is misleading rather than dull). A shipped theme that fails its
  own framework's checks is worse than not shipping it.
- **A theme declares the terminal background it assumes** ([the background ruling](#theme-background)). With more themes
  the naming problem multiplies — half of any popular set are light variants, and each will
  be dark-on-dark without that declaration.

**And `ThemeSet` being a two-field record is the structural half.** More than two means it
becomes a collection, which is a public type change — **freeze-relevant**, so it belongs
before publication rather than after.

### ★ Ghost text ghosts only a sole candidate — and *never drawn* is now closed

**~~Computed, acceptable, and never drawn~~ — CLOSED.** `paint.ts:269` reads the ghost; it
landed in `95fedee` (PR #27), which is one merge after the coverage audit that recorded it as
open. **Recorded rather than deleted**: this entry's headline was the sharpest instance of
exported-and-unreachable in the document, and an entry that quietly loses its headline reads
as though the rest was always the point.

**Two of the three improvements survive, and the second is the one a user feels.**

#### 1. ~~Draw it~~ — done

#### 2. Ghost the *best* candidate, not the *only* one

`engine.ts:152` is `candidates.length === 1 ? candidates[0] : undefined`. So with `stop`,
`start` and `stats` in the manifest, typing `/s` ghosts **nothing** — and it only starts
ghosting once you have typed enough to reach a single candidate, **which is exactly when you
no longer need the hint.**

The rule is *safe* rather than useful: it only ghosts when it cannot be wrong.

**With [ranking](#completion-ranking), "best" becomes meaningful** — the most recently used match — and
`/s` → `stats` in dim text is the affordance people expect. **Do ranking first**; ghosting an
arbitrary candidate from an unsorted list would be worse than ghosting nothing.

#### 3. Ghost dynamic sources

`ghost()` is **static-only, and says so**: *"static only, which means manifest-backed only —
so `path` and `executable` have no ghost text and `Tab` is required."* So completing a
container name never ghosts.

Dynamic ghosting means waiting on a source, which needs the **sequence-as-token-of-validity**
machinery — and that exists; it is what the spinner and `frameworkSources` were built around.
A stale ghost from a superseded request is the failure it guards.

#### And ghost and the menu are two answers to one question

**Design ghost and [as-you-type](#as-you-type) together, not separately.** Every good shell ghosts the top
candidate *while* the menu shows the rest — one hint with two levels of detail. Built apart,
they compete: a ghost saying one thing and a menu highlighting another is worse than either
alone.

<a id="as-you-type"></a>
### As-you-type completion — the trigger, not the engine

Type `/th` and the menu appears, showing `/theme`. A search-bar feel over the manifest.

**Almost all of it exists.** C19 sources candidates from the manifest — every verb, flag,
enum value and sub-verb, *"adding a flag on the far side makes it completable with no
TypeScript change"* — and there is a menu layer, ghost text, prefix filtering that
understands quoting and command position, and `Tab`/`→` bound to invoke and accept.

**What is missing is only the trigger.** Today completion is `Tab`-invoked. As-you-type is
one behaviour change, not a new subsystem: same engine, same menu, same acceptance path,
different moment.

And it is the feature that makes Calcium's central claim *visible*. Tab-completion assumes
you know the verb exists; as-you-type **teaches the verb set**. For a framework whose pitch
is "the manifest describes your app", a menu that surfaces the manifest while you type is
where that stops being an assertion.

**Three rulings, and they are why it is not trivial:**

- **When does it open?** On the bare `/` shows every verb, which is the discoverability
  case and arguably right — but the menu is then up constantly. Likely: **open on `/`,
  close when the prefix matches nothing, never open for `executable` slots** (bare words
  completing `PATH` would flood).
- **Does it steal keys?** Today `Tab` is a user action, so focus moving to the overlay is
  asked for. If the menu opens itself, `↑`/`↓` silently stop meaning history — the exact
  collision the navigation model's two modes exist to solve. Likely: **the menu appears
  but does not take focus until `Tab` or `↓`**, advisory until you reach for it.
- **Latency.** C19's sources can be async, and a filesystem or far-side source on every
  keystroke is a different cost profile from once per `Tab`. The debounce and the
  sequence-as-token-of-validity machinery already exist — so this is measurable rather than
  new, but it wants measuring.

**It largely subsumes typo detection** (below): that catches `/clea` after you submit; this
means you never typed it. Same manifest, same source.

**Second consumer, unprompted:** slash commands in an agent harness are exactly where
discoverability matters, and OpenCode's Ink-migration checklist names "slash command UI" as
something they had to build.

### Typo detection on commands

Levenshtein against the manifest's verb list, surfaced as a notice: `/clea` → *did you
mean `/clear`?*. Trivial, high value, and the verb list is already in hand for completion.

### Optional / customisable header and footer

C22 already takes an app-supplied `ChromeFn`. Making each optional is a config field plus
region arithmetic. Small and clearly right.

<a id="rebindable-keys"></a>
### Rebindable keys — precedence, not refusal, and unbind must be a value

The keymap is declarative data — that was C16's whole design. **The merge step is small; the
two rulings are the work**, and the current behaviour is the opposite of graceful in one
specific way.

#### A duplicate throws today, and that is right for exactly one case

I10 refuses a duplicate `(target, key)` at construction, reasoning that *"a duplicate here is
a programming error… a duplicate in the default keymap must not reach a user's session before
anyone notices."*

**Correct for the framework's own keymap, where a collision is a bug. Wrong the moment a user
supplies bindings** — because a user's override *is* a collision by definition: you rebind
`⌃k` precisely because something already has it. A construction throw says *"your config is
invalid"* when the user meant *"mine wins."*

**Ruled: a precedence ladder, not a refusal.**

```
framework default    lowest
app-supplied         overrides the default      an app knows its own domain
user-supplied        overrides both             it is their keyboard
two at the SAME level   still throws — that IS a programming error
```

**Which is the shape C10's theme resolution and C05's manifest merge already use** — global →
kind → override, by priority. A familiar mechanism rather than a new one.

**And `mergeBlock`'s existing refusal is a precedent to keep, not to change.** A block binding
colliding with a `global` slot is refused loudly — that is a *lower* priority shadowing a
*higher* one, which is genuinely an error, and it is a different situation from a user
overriding a default.

#### Unbinding has to be a distinct value, and this is where it goes wrong if undesigned

```ts
{ target: "prompt", key: { name: "k", ctrl: true }, action: null }   // an explicit UNBIND
```

**Omission cannot mean unbind**, because a user's keymap is a **patch, not a replacement** —
otherwise supplying one binding would silently drop the other thirty. **So absence means
inherit and `null` means remove**, and the two must be different values rather than the same
missing key.

**And an unbound key falls through to the next rung; it does not go inert.** Unbind `escape`
at `prompt` and it reaches `global`. That is what makes unbinding useful — you are not
disabling a key, you are **declining it at that level**, which is the only reading that
composes with a ladder.

**`KeyAction` is a closed union with a total effect table**, so an unbind cannot orphan an
action's implementation — the effect stays, nothing reaches it. Worth stating, because "the
action still exists and is unreachable" would otherwise read as the vacuity class rather than
as the intended result.

### Todo lists / tasks

A block kind with checkbox state. Rendering is easy; the interesting part is that ticking
one is a **mutation**, so it needs the action dispatch route (F21) that docker-tui found
missing. Build after that lands.

---

<a id="navigation-model"></a>
## Navigation — the biggest design opportunity, and mouse is already built

### What exists today

**Mouse is built, not planned.** SGR decoding (`decode.ts:394`), a `mouse` capability that
is off under tmux, lifecycle enter/leave, and a routing table that hit-tests layers by
`Placed` then falls through to the viewport (`router.ts:221`). Wheel scrolling works.

And it ships with its own constitution, which is the right rule:

> *"Every mouse affordance has a keyboard equivalent, so nothing is lost — only
> convenience"* — `capabilities.ts:65`

So the **plumbing** is done and the **affordances** are not. A click lands in the correct
component and nothing consumes it — the same shape as F21, where `Action` has an `open`
arm and `onAction` has no route from a keystroke, so none from a click either.

**Keyboard is thinner than it looks:**

| | roadmap, as written | counted from `defaultKeymap`, 2026-08-13 |
|---|---|---|
| `prompt` | 28 bindings — full readline | **28** |
| `overlay` | 6 | **6** |
| `global` | 4 | **4** |
| `liveBlock` | **3 only** — `escape`, `up`, `down` | **4** — and the fourth is `enter` → `rowActivate`, F21's close |
| `pushedView` | **zero.** A focus target with no keys | **9** — `n p g G pageup pagedown up down escape` (C16 I24) |
| `copyMode` | not in the table | **0**, and it is the one that actually has none |
| between blocks | no mechanism at all | unchanged |
| horizontal | nothing — no column or cell movement | unchanged |

**Corrected in place rather than rewritten, because two of five rows were wrong and one was
wrong by nine.** *Zero bindings* was the headline argument for the whole model — *"there is
nowhere for a richer set to live"* — and it had been nine bindings out of date since C16 I24
landed. **Wrong in both directions**, which is the shape to watch for: `copyMode` is the
target with no keys and it was not in the table at all.

**The premise survives on different evidence, which is why this is a correction and not a
retraction.** Nine `pushedView` keys are a flat list with no scope, no mode and no edge
semantics — `up` and `down` are bound to `viewPageUp` and `viewPageDown`, which is a list
that ran out of room rather than a navigation model — and `liveBlock` still cannot leave its
own rows. The design is written against the counted table, not this paragraph.

Row navigation inside the current live block works. **Navigating the transcript as a
structure — block to block, cell to cell — does not exist.**

### The model worth building: scopes + modes, from principia-ii

`principia-ii`'s `SMART_NAV_IMPLEMENTATION.md` has a navigation system whose core ideas
transfer well, and one that should be taken verbatim.

**The navigation / interaction split is the big one.** *Navigation mode* moves focus
between things; *interaction mode* sends keys **to** the thing. Calcium has no such split,
which is precisely why `liveBlock` has three bindings — there is nowhere for a richer set
to live. With modes, `↓` navigates, `⏎` enters interaction, `↓` then does whatever the
block does with it, `esc` leaves.

It also **solves key collision structurally**: a block in interaction owns its keys and the
prompt does not compete. Same trade as the `⌃Home` ruling, general rather than per-key.

**Two-level escape** — first escape exits interaction, second exits scope — is what makes
drilling in non-frustrating; you are never one keypress from losing your position. Same
shape as the Ctrl-C ladder, which the project already has as a pattern.

**`ArrowPolicy` and `EscapePolicy` as declarative per-kind metadata is the piece to take
verbatim:**

```
ArrowPolicy   navigate · escape-vertical · escape-horizontal · escape-all · custom
EscapePolicy  auto (two-level) · bubble · modal · custom
```

A small closed vocabulary answering *"what does `↓` do at the edge of this thing"* per
block kind, with no conditional in any handler. Calcium's keymap is already declarative
data and `KeyAction` is closed with a total effect table, so this sits in exactly the slot
`gapBefore` defaults per builder occupy. **Capability resolution by priority** — global →
kind → per-node override — is the same shape as C10's theme resolution and C05's manifest
merge.

### What the terminal changes

**Scopes are shallow, which is easier.** A transcript is `entry → block → row → cell` —
three or four levels, not an arbitrary DOM tree. The drill gesture has a small learnable
set of levels.

**Focus memory is closer to required than optional.** principia lists it as a *future*
enhancement; in a terminal, re-entering a table at row 1 every time is punishing. Entry
policy — which element you land on, and whether the scope remembers — matters more here.

**The visual language must respect C11 I14**: focus is *rendered, never owned* — it changes
tone and nothing else, no marker, no extra row, no width. That invariant is load-bearing
(focus changes without `rev` moving, so anything altering height breaks C14's cache).

So: **the chrome says the mode, the block says the focus.** A `NAV` / `EDIT` indicator in
the footer the way vim shows `-- INSERT --`, tone-only focus on the element, and the gutter
optionally marking the active scope. Expressible within I14, and a terminal idiom people
already read.

**Mouse becomes a first-class input in the same model** — clicking is *jump directly to
this scope or element*, the keyboard is *walk there*. Same target set, two routes, with the
keyboard-equivalent rule as the constraint. Two pieces are genuinely missing:

- **cell → element resolution.** The router knows which *block* a click hit, not which row
  or action label. Blocks must report their interactive regions — **which is the same
  information the keyboard model needs.** Build them together, from one declaration, or
  they will disagree.
- **click-to-focus versus click-to-activate** — probably focus on click, invoke on the
  action label or a second click. A ruling the mode model should own, not each block.

### Why this goes before the small navigation items

It is a **navigation model**, not a feature: it replaces the `FocusTarget` union with a
scope stack plus modes, so it is component-sized and wants designing before any bindings
are written — or they get written twice.

It also **subsumes** several roadmap items rather than sitting beside them: block-to-block
movement, horizontal/column navigation, the focusable-block concept, `pushedView`'s missing
bindings, and clickable buttons/links all fall out of it. And every future interactive
block — todo checkboxes, the question/menu primitive — gets a coherent home instead of
inventing its own keys.

<a id="scroll-anchor"></a>
### ~~The scroll-anchor rule — do this regardless, and first~~ — BUILT, Order 8

**If the user is scrolled up, a new entry must not move their viewport. If they are at the
bottom, it follows.** An anchor-preservation rule in C14, and the difference between a
transcript usable during streaming and one that is not.

**Corrected 2026-08-13, and it is C14 I4, I5 and I6.** `viewport.ts:347 #afterContent()`
runs after **every** C13 change — `append` included, not only `resize` — and while
detached it recomputes `topRow` from `(anchorId, rowOffset)` rather than keeping it.
`followTail` is derived from where the viewport ended up and never from which way the
reader scrolled (I5), and the anchor is an entry id plus an offset so eviction cannot
shift it (I6). `T5.3` is the row: *a live `--logs` tail at 1,000 lines/s while scrolled up
reading → the view does not move.*

**Found by reading rather than by grepping, and the symbol would have answered the wrong
question.** `#anchor` is captured before a resize *and* restored after an append; those
are two mechanisms sharing a field name, and only the second is this rule. A grep for the
field finds the first and says nothing about the second.

The floating jump-to-bottom button with a new-entry indicator is chrome on top of it, and
**it is what remains** — which puts it behind Order 29's chrome row rather than here.

---

## Medium — needs a real design pass

### Question / menu primitive for agents (highest value for agent UIs)

Single-select, multi-select, free-text — one abstraction, as you said. The layer machinery
exists (the completion menu is already a pushed layer), so rendering is solved.

**What is missing is a blocking input primitive**: the app asks, the transcript waits, the
answer arrives. Everything today is user-initiated. That is genuinely new and touches C23's
execution model — a verb that suspends pending an answer, and a ruling on Ctrl-C during it.

The single most useful thing on this list for agent-facing TUIs.

### A full-screen view leaves no trace in the transcript

**Scroll back and there is no record you ever opened one.** `/logs` pushes a view, you read,
you `esc`, and the transcript shows nothing — the same for `/inspect` and for the `/tty`
handoff. A session's history is missing every screen the reader actually looked at.

**Default behaviour for any full-screen command:**

```
❯ /logs api-gateway
  ⟩ logs opened
  ✓ logs closed · 2m14s · 342 lines
```

#### Why this shape and not a trace on pop

**B03's pop row rules a trace out explicitly**: a view appends nothing on return, because
*"a trace would freeze the block the pop returns to and clear the selection A01 D7
preserves."* That ruling stands.

**The two-line form sidesteps it entirely**, which is what makes it buildable:

- **The entry is appended at submission**, before anything is pushed — so it freezes exactly
  what an ordinary command freezes, and nothing surprising happens on return.
- **The exit line is a patch to that entry, not a new one.** `patch` with `origin: "shell"`
  is the mechanism, and it exists — it was built for the refusal notice, and C13's origin
  gate is what allows the shell to write to an entry after the far side has finished.

**One entry, no trace, no freeze on pop, D7 intact.**

#### Scope: every verb whose result is a view, plus the handoff

`/logs`, `/inspect`, C25's fullscreen patch view, and `/tty` — which today reports
`✓ exec exited 0` and could equally say what it opened. **Framework default rather than a
per-app choice**, since the gap is in the record and every app has the same one.

#### Two decisions when it is built

**What the exit line carries.** Duration is obvious and weak. The useful part is what
happened *in* there — `342 lines`, `exited 0`, `no changes`, `12 hunks` — which is
**per-verb rather than framework-generic**, so the view's owner supplies it and the
framework supplies the shape.

**And whether the record is re-enterable.** If the entry says *"logs closed"*, `⏎` on it
reopening the view is nearly free — the drill-in path exists and the view producer is built.
**That turns the transcript from a log of things you cannot get back to into navigable
history**, and it is the difference between this feeling designed and feeling dutiful.

### The prompt windows but does not scroll — and the fix is already named

**Multi-line input works and the window exists.** `promptWindow` caps at `frame.promptRows`
and draws `⋯` plus the tail, so a fifty-line paste does not eat the screen. **The cap is
built; what is missing is where the window sits.**

The comment says so outright:

> *Around the end rather than around the cursor, until C17's `cursorCell` is threaded
> through: the cursor is at the end for every case but a mid-buffer edit, and showing the
> wrong window is worse than showing the last rows. **Named here so it is a known
> simplification rather than a silent one.***

**So "the prompt should scroll independently" is not a new feature — it is threading
`cursorCell`**, which the code already identifies as the fix. Edit line three of a fifty-line
buffer today and the window stays at the bottom while the cursor is off-screen; the editor
knows where the cursor is and the window does not ask.

**And the tail-anchor is right for the common case**, which is why it was chosen — so the
change is *cursor-following when the cursor is not at the end*, not a replacement.

Worth doing with the [scroll-anchor rule](#scroll-anchor): both are *"the window should
follow the thing the reader is attending to"*, one in the transcript and one in the prompt.

<a id="chrome-row-budget"></a>
### Chrome is one row each, by design — and four features now want more

`frame.ts:4`: *"Calcium owns the structure — **one chrome row each, fixed, never scrolling**."*
Deliberate, and it is now the constraint several things are queuing behind:

```
the navigation model    NAV / EDIT, vim-style
progress feedback       running · 4s
queueing                ✳ 2 queued · 1 running
region separators       a rule between chrome and content
```

**Four features wanting the same one row is the signal to rule on it once**, rather than
letting them fight. The options:

- **Multi-row chrome**, app-declared height. Simple, and it costs transcript rows —
  which is the thing density was chosen against.
- **A composed single row**, with the framework owning the layout of segments the way a
  status bar does. Keeps the row count and needs a segment model.
- **Chrome as blocks**, so it composes like everything else and `b.row` gives it horizontal
  layout for free.

**The third is the interesting one** and it pairs with [`b.row`](#horizontal-composition): if chrome is a block
sequence, then multi-row, segmented and composed are all the same thing, and the framework
does not grow a second layout system for the header.

### Pasted content — Claude Code's idea, and Calcium can do it better

Claude Code collapses a large paste to a reference — `[Pasted text #1 +47 lines]` — so the
prompt stays legible and the content survives. **Good, and the right instinct: a paste is
*content*, not fifty lines of typing.**

**Calcium can go further, because the prompt is not the only structured thing.**

- **Detect what it is.** A paste that parses as JSON, or looks like a unified diff, or is a
  file path, is a *known kind* — and the framework already has a block for each. `[JSON ·
  47 lines]` is more useful than `[Pasted text]`, and it is one parse attempt.
- **Reference a block, not a string.** The chip in the prompt stands for a real `Block`, so
  submitting sends structured content and **the transcript can render it as what it is** — a
  code block with highlighting, a patch with hunks — rather than as a wall of text. That is
  the thing a text-only prompt cannot do.
- **Expand it in place** to check what you pasted, using the `expand` action that exists.
- **Several chips**, each referenced — `[JSON #1] [diff #2]` — which an agent harness wants
  immediately and a shell wants for `/config <this>`.

**And the paste path already has its own timing exception**, which matters here: C17's paste
window is the one place A01's immediate-feedback rule is relaxed to *fast enough* (30 ms).
Collapsing to a chip makes that cheaper rather than harder, because the editor holds a
reference instead of fifty lines of text to re-wrap on every keystroke.

**Worth checking before designing**: whether bracketed paste is detected, since chip-on-paste
needs to know a paste *was* a paste rather than fast typing.

### ★ Queueing, background work, and what agent harnesses already solved

**Agent harnesses have solved several transcript problems Calcium will hit**, and it is worth
stealing them deliberately rather than rediscovering them. Four things, and the first is a
stated must.

#### Queued commands ★ — submit while something runs

**Today the guard refuses.** `guard.take("app", verb)` and a second submit gets *"a command
is still running"* — deliberate, and the opposite of what every agent harness does. They
accept the input and hold it.

The queue itself is small. **The rulings are the work:**

- **What the prompt shows while queued.** `2 queued` in the chrome, or the queued lines
  visible somewhere? Agent harnesses show them, which is better — a queue you cannot see is
  a queue you forget you typed into.
- **Can a queued item be cancelled**, and how? It has no entry yet, so there is nothing to
  focus. Probably a chrome affordance rather than a transcript one.
- **What Ctrl-C means** — this is the sharp one. It is now ambiguous between *cancel the
  running verb* and *clear the queue*, and **step 9 has already had exactly this class**: two
  rungs with a genuine claim, where newest-first picks the wrong one. Rule it the same way —
  by asking which outcome leaves a record.
- **A queued command sees state after its predecessor**, which is the whole point and needs
  saying, because it means the queue is strictly sequential and cannot be reordered.

#### Background execution — related, larger, and a different thing

Queueing is *sequential*: it waits. Background is *concurrent*: it runs while you do
something else. Agent harnesses do both — Claude Code queues messages **and** shows a
running-tasks count for work continuing in the background.

**That is a real change to C23's model**, not a feature: the guard becomes per-something
rather than global, multiple entries are live at once, Ctrl-C must pick which, and the chrome
needs to say what is running. **Plan it separately from queueing** and do not let one block
the other — queueing alone is worth having.

#### Auto-collapse by age — the density fix the transcript needs

**Agent harnesses collapse old tool calls to a line.** The AI SDK TUI's default is
`auto-collapsed`: *show the latest tool expanded until another visible section appears.*

Calcium has **eviction** — an old entry is deleted at the cap — and nothing between "full
height forever" and "gone". **A conversation produces hundreds of entries** (agent-tui's A5
is the predicted case, and a long docker session is the real one), and scrolling back through
two hundred full-height entries is unusable where scanning two hundred one-line summaries is
easy.

Collapsing is gentler than eviction and answers a different pressure: eviction is about
memory, **collapse is about screen**. The `expand` action already exists, so a collapsed
entry is expandable by a mechanism that is built.

#### Block display modes — the AI SDK's four, generalised

`full` · `collapsed` · `auto-collapsed` · `hidden`, applied per block kind. That is really
**"a block declares it may be collapsed, and something decides"** — and the something is the
transcript's age policy above, or the app's preference, or the user's.

Worth taking as one concept rather than four features, and it is the same slot the
`expand` action already occupies.

#### A running-tasks indicator

`✳ 1 running task` in the chrome. Trivial once anything is in flight or queued, and it is the
piece that makes background work legible rather than mysterious. **The chrome is where "what
is happening" lives** — the same slot the navigation model wants for `NAV`/`EDIT` and the
progress work wants for elapsed time.

### Session resume / history

The transcript is already a store with a cap and eviction; persisting it is C20's shape one
level up. Tractable.

**Rewind / undo / redo is a different project** — it means every mutation is reversible, and
nothing currently is. Split these; do not let the second block the first.

### Auto-update

For Calcium and for apps built on it. Packaging and distribution rather than framework
design, and more interesting than it sounds: it is how a TUI ships to people who are not
developers.

---

## Plots and ML output — the biggest single opportunity

This is Prism's actual use case, so it is where Calcium earns its place over a general
framework.

By how much each fights the character grid:

```
easy       bar · histogram · line (exists) · sparkline (exists) · HEATMAP
medium     candlestick · pie (circle approximation, looks rough)
hard       sankey (edge routing — the same problem as Mermaid layout)
no         3D — perspective in a character grid is a novelty, not a tool
```

**Heatmap is the sleeper.** A grid of coloured cells is *exactly* what a terminal is. It
needs colour maps, and it degrades beautifully — colour → `░▒▓█` shading at 1-bit. For ML
output (attention matrices, confusion matrices, correlation) it is the highest-value plot
on the list and among the easiest.

**On wrapping matplotlib: don't.** The impedance mismatch is severe — matplotlib thinks in
pixels and DPI, you would render to a raster and downsample to characters, and you would
inherit a Python dependency into a TypeScript framework. **Take the colour maps** (viridis,
magma are lookup tables) **and the layout conventions. Leave the dependency.**

### The ML output package

Worth treating as one coherent piece rather than scattered features:

- **tensors / matrices / vectors** — shape and dtype headers, sensible truncation
  (`[2, 64, 768] float32`, corners shown, middle elided), the same discipline C11 applies to
  rows applied to axes
- **heatmaps** for attention and confusion matrices
- **plots** for training curves — exists, wants the history buffer docker-tui is building
- **images** for sample outputs, once the image block lands

That package is most of the easy tier and it is what makes Calcium the obvious choice for
an ML platform's TUI.

---

## Fights the architecture — deliberately not doing

- **Video / GIF.** Redrawing a rectangle at 15 fps inside a frame scheduler built around
  *one frame per input batch* fights the architecture at its root. **A GIF's first frame as
  an image, with a note, gets 90% of the value for 5% of the work.**
- **3D plots.** Perspective in a character grid is a novelty.
- **An embedded text editor.** `/tty vim` already hands the terminal over, vim runs, you
  come back — the handoff is built and correct. An embedded editor is a much larger thing
  for less.
- **Wrapping matplotlib** — above.

---

## Order

```
BUILT 0  step 8                    docker-tui packaged — README, play environment, screencast, CI
PART  1  PHASE 1                   producer context · change axis · builder audit · the prompt
                                   ↑ serves both destinations, must precede the freeze
      2  prism-tui's first         experiment table · training curve · one live job
         surfaces                  ↑ the second consumer, and b.live's stream arm's first
      3  the ML package            tensors, heatmaps — built with prism-tui as the consumer
      4  what 2 and 3 found        phase 1's equivalent, second round
PART  5  publication prep          error messages · the outside-reader test · 0.x · CI from the
                                   tarball
      —  PUBLISH 0.x               with two real consumers behind it
RULED 6  phase 2                   the empty-block convention · rendering flags. WALKED, and
                                   both halves ruled with no code. 2.1: the four instances are
                                   TWO CLASSES — F15/F35/I47 are a destroyed diagnostic (mostly
                                   closed, and this entry does not own it) and /drift agreeing
                                   is a SUCCESS with nothing to preserve. RULED a convention,
                                   HELPER REFUSED: only the producer knows agree from failed-to-
                                   compare, so a helper is handed the same empty list C09 sees,
                                   and a helper nothing must call is what produced this four
                                   times. 2.2: the first half CLOSED by C05 I21 and the prose
                                   kept the old state — F39 is now PARTIAL. It cannot be
                                   shellOnly widened (--json selects a rendering AND is
                                   transmitted), and --help is a mode of the INVOCATION where
                                   --raw is a rendering of the RESULT. THEN THE CODE STEP
                                   FALSIFIED THE WALK: the field has no instance. --raw and
                                   --wide are shellOnly switches the adapter reads, --json is
                                   transmitted, so all three wants work and F39 is CLOSED —
                                   its sentence named RENDERING and the axis it needed was
                                   TRANSMISSION. RULED: the field arrives with the resolution
                                   that reads it, which is 21's --help — AND 21 WAS ALREADY
                                   BUILT, so the question is answered rather than deferred.
                                   --help REPLACES the result rather than selecting among
                                   renderings of one, and usageBlocks lists every flag flat, so
                                   no reader needs the distinction. 6.2 CLOSES WITH NO FIELD:
                                   FlagDef is unchanged permanently, not pending, and §2's
                                   closed-set test is answered because there are NO MEMBERS —
                                   the framework understands exactly one presentation-selecting
                                   flag and does it by RESERVING THE NAME. C05 §8b, C22 §13b
PART  7  THE NAVIGATION MODEL      scopes + modes + policies + pointer — design first, it subsumes
                                   the small navigation items rather than sitting beside them.
                                   SPECIFIED as C26; stages 1–3 built (interaction is a focus
                                   target, blocks report elements, focus holds an address).
                                   THREE QUESTIONS A SCROLLABLE CONTAINER (46) OPENS AND C26
                                   DOES NOT ANSWER: (a) what ↓ means in navigate mode on a
                                   scroller — every other kind resolves ↓ at an EDGE by
                                   ArrowPolicy, and a scroller has an edge AND an interior
                                   that is not an element, so either scrolling needs interact
                                   mode or navigate scrolls and interact means something else.
                                   The policy vocabulary was designed before scrollers existed
                                   and may have no value here, which is a CHECK before
                                   adopting it. (b) a pushed view binds n p g G pageup pagedown
                                   and interact on a table inside it should give those to the
                                   TABLE — the first case where the outer scope's bindings and
                                   the inner one's are the SAME keys rather than different
                                   ones; esc reverting them may be the whole story and that is
                                   worth checking, since a key meaning two things in two modes
                                   is fine and in one mode is not. (c) I10 restores focus by
                                   address and says nothing about which MODE you return in —
                                   probably navigate, since re-entering a mode you left is
                                   surprising, but it is unruled and cheap to rule now
BUILT 8  the scroll-anchor rule    small, real usability — or earlier, it is cheap
      9  mermaid (text path)       cheap once the dependency is vetted, distinctive
PART  10 question / menu primitive biggest unlock for agent UIs — lands inside the navigation model
      11 markdown                  translates to existing blocks
BUILT 12 OUTPUT DIFFING          ★★ the whole frame is written every keystroke — ~10,000 cells
                                   to change one. Anticipated in a comment, never built.
                                   Smallest fix, biggest effect, invalidation already exists
BUILT 13 RENDER CACHING          ★ a large diff renders 5,000 lines to show 30. Multiplicative
                                   with the above, which is why it is "unusable" not "slow"
                                   (highlighting is already memoised — that memo exists BECAUSE
                                    rendering repeats, which confirms the diagnosis)
BUILT 14 cells() ASCII fast path  the hottest function walks Intl.Segmenter over ASCII. Cheap,
                                   but measure after the render cache — most calls vanish with it
BUILT 15 text selection + copy ★  BUILT 2026-08-13 in four steps plus a step 0.
                                   copyMode exists with no producer; OSC 52; and semantic copy,
                                   which pairs with the navigation model. THREE SCOPES, ONE
                                   MECHANISM — the editor's region, the transcript's, and copy
                                   as a verb on a focused thing; build one alone and the model
                                   is built three times. C17 has NO selection concept at all:
                                   no anchor, no mark, no region, so select-all is the
                                   degenerate case of a model that does not exist. RULED:
                                   copyMode stays a TARGET and is not a third mode beside
                                   navigate and interact — stage 1's argument for interaction
                                   (a flag read before dispatch gives C16 §5's ladder an order
                                   of its own) applies unchanged, and two mode concepts in one
                                   model is the cost of getting it wrong.
                                   WALKED 2026-08-13, both artefacts: C16 §5a (classification
                                   table, the three scopes at rest) and §5b (sequence trace).
                                   FOUR RULINGS — one clipboard, copy writes the kill buffer
                                   (C17 §5a); TWO selection scopes, not three, since copy mode
                                   is the app having none; ⌥a, not ⌃⇧a, which is 0x01 = ⌃a and
                                   bound to home; the mouse toggle is a mechanism this entry
                                   ADDS, not one it inherits. exitCopyMode is a second stub,
                                   so producer and exit ship together or neither does.
                                   DESIGNED 2026-08-13 — CALCIUM_SELECTION_DESIGN.md, four
                                   steps plus a step 0: the decoder check found modifiersOf
                                   reading 3 of xterm's 4 modifier bits, so Meta-Shift-Left
                                   decoded as ⇧← — a live binding, not a missing one (C16 §2).
                                   STEP 0 LANDED 2026-08-13: bit 8 read, T1.3e asserts the
                                   PAIR since either wire form alone passes broken, 4/4
                                   mutations caught.
                                   B4 ruled: copy mode suspends FRAME COMMITS, not data —
                                   C23 I46's pause reaches polled parts and not a live stream,
                                   which is the case a reader most wants to copy from
      16 ONE POPUP ★             confirm · completion · peek · question are one mechanism with
                                   THREE parameters. C19's menu already has the flip, the
                                   selection and `… N more`; the confirm reimplements or lacks
                                   all of it. READ 2026-08-13 and it survives, with two
                                   corrections: the confirm REIMPLEMENTS the selection
                                   (`selected`, arrow cycling, its own marker) and LACKS the
                                   flip and `… N more`, so one half is a merge and the other
                                   two are additions. And the design's parameter list said
                                   TWO — onSelect, dismissable — while the two consumers
                                   differ on a third, PLACEMENT: the confirm is
                                   `{kind: "centred"}` at `src/shell/confirm.ts:148` and the
                                   menu is anchored. The design's own §1 draws it anchored,
                                   so the figure and the list disagreed with the code in
                                   opposite directions and not with each other.
                                   WALKED 2026-08-13, both artefacts, and it resizes AGAIN.
                                   The cycling is IDENTICAL in both copies (`% length` at
                                   confirm.ts:194 and keys.ts:496) — the divergence is where
                                   the selection STARTS: menu at null-or-0, confirm at the
                                   `default` choice falling back to LAST, deliberately, so a
                                   merged store opening at 0 puts a destructive confirm on
                                   `yes` and passes every navigation assertion. `… N more` is
                                   NOT portable: the menu counts in a second pass after
                                   layout because it holds its own candidates, and the
                                   confirm's payload is a caller's block with no registry —
                                   so the shared piece is `Placed.truncated` and a confirm
                                   gets `…`. The parameters are TWO KINDS: placement and
                                   content are live through LayerUpdate, dismissable and
                                   onSelect are frozen at construction (C15 I14). And the
                                   empty list keeps two opposite dispositions — ask() rejects,
                                   menuBlocks draws nothing (C15 I15). FIFTH PRODUCER:
                                   clearConfirmLayer (history/layers.ts:95) is a second
                                   confirm, in L3, with `(y/N)` in a notice's text and no
                                   choice list — published, tested, and pushed by nothing in
                                   src/. CALCIUM_POPUP_DESIGN.md §6
PART  17 LARGE BLOCKS ★★         nothing bounds ONE block's size — D40 caps blocks per document,
                                   MAX_ROWS is the fallback adapter's alone. diffing → caching → window
                                   the block → cap with a marker. A CHAIN, in that order
BUILT 18 SHARED POLLERS ★★       source → derivation → part. One fetch AND one computation per
                                   source; only the render is per instance. A CORRECTNESS fix
                                   first. Render memoised on (sourceVersion, viewState, width),
                                   one batch per source, and the stagger gets less to do
PART  19 resize coalescing        never delayed by C03 I2, and every SIGWINCH rebuilds the Fenwick
                                   index. A drag is N rebuilds + N renders + N writes
BUILT 20 off-screen live parts ★  b.live keeps ticking when scrolled off — no visibility check
                                   exists. Throttle, not pause (I9 protects a scrolled-away
                                   --watch), and fetch on re-entry. Spawns processes for nobody
BUILT 21 --help per verb ★        BUILT, and the row described the state before it. --help is
                                   reserved framework-side (C05 I22, shellOnly), routed on both
                                   the app and local paths at execution.ts:1300 gated on
                                   validation.ok, answered by usageDoc from the manifest with
                                   nothing spawned, and T4.8 asserts BOTH halves. /help is
                                   already two-level: grouped by C05 §3's partition, with
                                   /help keys as a second question. THE DEPENDENCY ON 6 WAS
                                   INVERTED AND BOTH ROWS WERE STALE — this said it needs 6's
                                   flag, then 6.2 was found to need this, and this was already
                                   built. So 6.2 is answered rather than blocked: --help
                                   REPLACES the result rather than selecting among renderings,
                                   and usageBlocks lists every flag flat, so nothing needs the
                                   distinction. C05 §8b.7
      22 b.art — banners          sparse variants, fallback ends at styled text, and VALIDATION
                                   PER VARIANT (no tabs, uniform width, measured cells) — ~30
                                   lines that would have caught every banner defect
BUILT 23 selection styling ★      BUILT 2026-08-13 — `surfaces.selection` with a
                                   `selectionPairs` sibling in `contrast.ts`, `selectionSpans`
                                   in `editor/layout.ts`, and the wash applied in
                                   `shell/paint.ts` after the row is squared off.
                                   a full-row BACKGROUND WASH — free, since it changes no size
                                   (the patch renderer already does it). Reverse video at 1-bit,
                                   gutter glyph as the fallback. Selection as a `meaning` palette
                                   so C10's contrast floor checks the fg/bg pair.
                                   BUILT 2026-08-13 with one ruling CORRECTED: a `meaning`
                                   PALETTE cannot be a wash — resolveBackground refuses any
                                   ref that is not surface.*, so the entry named a mechanism
                                   C10 does not have. `surfaces.selection` plus a
                                   `selectionPairs` sibling delivers the guarantee it wanted
                                   (C10 §4b). dark #264057 at 7.25 : 1, light #c9ddf5 at 8.18
      24 more default themes      two ship and `light` is dark-on-dark. ThemeSet is a two-field
                                   record, so more is a PUBLIC TYPE change — freeze-relevant
PART  25 ghost text ★            drawn since PR #27. What remains: it ghosts only a SOLE
                                   candidate, which is when the hint is least needed, and it
                                   is static-only. Design with as-you-type — one hint, two levels
      26 view trace in transcript a full-screen view leaves no record. Append on push, PATCH on
                                   pop — sidesteps B03's no-trace-on-pop ruling, one entry, D7
                                   intact. And ⏎ to re-enter is nearly free
PART  27 syntax highlighting ★    a REGRESSION against C09 §4a, not a scoping choice — the spec
                                   promises "highlighted whenever someone registers it" and there
                                   is no someone. 24 mainstream = 180 KB, measured. Phase-1-shaped
      28 prompt cursor-following  the window exists and is tail-anchored; the fix is threading
                                   cursorCell, which the code already names
      29 chrome row budget        one row each by design, and FIVE features now want it: the
                                   mode indicator, elapsed time, the queued count, region
                                   separators (37) and now WHERE IN THIS CONTAINER AM I (46),
                                   which is the scrollbar at container scope rather than
                                   transcript scope. Rule once — chrome-as-blocks pairs with
                                   b.row
      30 paste as a chip          Claude Code's idea; Calcium can reference a BLOCK rather than
                                   a string, so the transcript renders what it actually is
PART  31 completion ranking       prefix-matched and unranked today. Recency-first is nearly
                                   free (C20 has it) and is the most-felt. RANK BEFORE
                                   as-you-type, or the menu is worse for opening itself
      32 prefix-out / defaultRoute      prefix-IN is expressible and CommandPolicy is reachable
                                   (retracted — F89). Prefix-OUT is not: prose by default, verbs
                                   by exception. A RULING on defaultRoute, not a config field
      33 QUEUEING ★              submit while something runs — a stated must. Small queue,
                                   real rulings, and Ctrl-C is ambiguous the way step 9's was
PART  34 UX polish set            animation (decoration never information) · change highlighting ·
                                   finish notifications · structured export · error remedies as
                                   fill actions · empty states that teach
RULED 35 progress feedback        the spinner is static by a ruling whose premise expired — the
                                   refresh driver IS the ticker now. Motion, then elapsed time,
                                   then what it is doing. AND THE PENDING ENTRY IS BLANK: the
                                   row is appended at once with blocks: [] (execution.ts step
                                   3), so a five-second tool shows an empty entry under a live
                                   prompt and reads as NOTHING HAPPENED rather than as waiting.
                                   settle(id, doc) already replaces the whole document, so the
                                   mechanism is there and nothing puts content in before it.
                                   Elapsed time is the useful tier — a number separates slow
                                   from stuck where a rotating glyph only proves the process is
                                   alive. RULED: THE FRAMEWORK COMPOSES IT, AN ADAPTER THAT
                                   KNOWS MORE REPLACES IT. The framework knows both things a
                                   blank entry is missing — the verb and how long it has been
                                   running — and only the adapter can say PULLING LAYER 3 OF 7,
                                   because the far side is the only place that fact exists.
                                   NOT F123's class, and that distinction IS the ruling: F123
                                   was the framework TRUNCATING AN APP'S DOCUMENT, deciding
                                   something the app had already decided. This fills a blank
                                   the app has never had a way to fill — the pending entry is
                                   composed at append, before the adapter has returned
                                   anything, so there is nothing to override until there is.
                                   And no default means every app reimplements the same
                                   notice, which is the producer-context family's whole
                                   finding: five surfaces duplicating a Calcium module because
                                   the framework withheld a fact it held. The elapsed tick
                                   comes from the refresh driver, never a setInterval in
                                   paint.ts
      36 scrollbar + edge markers the terminal cannot provide one (alt screen has no scrollback)
                                   and C14 already has the numbers. The edge marker is the cheap
                                   half and may matter more than the bar. AT CONTAINER SCOPE
                                   (46) it is one cell of the container's own width, not a
                                   second bar in the frame's reserved column, and ONLY THE
                                   FOCUSED CONTAINER FILLS IT — reserve always, fill on focus,
                                   which is the focus gutter's trick and keeps width constant
                                   so the cache stays safe. Mouse: click-to-seek and drag are
                                   plumbing that exists (Placed hit-testing + elements' row
                                   ranges) with no affordance; the WHEEL is the new one and it
                                   resolves BY POSITION where focus resolves BY FOCUS, so the
                                   two devices can legitimately disagree about which container
                                   a gesture addresses. And copyMode turns tracking off, which
                                   kills the wheel — another argument that terminal-native
                                   selection and inner scroll are in tension
      37 region separators        the prompt bracketed on BOTH sides, header/footer optional and
                                   bracketed with them. C10's no-background choice means a drawn
                                   line is the only tool available
PART  38 horizontal composition   b.row — the banner already paid for its absence by hand
                                   (width fractions ship with it; height fill is separate and
                                    waits on phase 1.1's producer-context contract)
RULED 39 theme background ★      RULED: theme declares `background: "terminal" | <colour>`, user
                                   overrides with `/theme <theme> --no-bg` (a FlagDef, free in
                                   --help, per-invocation not sticky; warn and comply). Painting
                                   makes
                                   C10's contrast floor provable rather than assumed against a
                                   guess; inheriting preserves transparency. The light theme
                                   paints, because it cannot work otherwise. Shares row-padding
                                   with selection's wash. Plus: /help's verb list came
                                   back empty — both found by looking
BUILT 40 as-you-type completion    the trigger, not the engine — and it makes the manifest
                                   claim visible. Largely subsumes the next line
BUILT 41 typo detection            trivial, delightful — smaller once 40 lands. BOTH BUILT, and
                                   both found by the sixth sweep because NEITHER NAMES A
                                   SYMBOL — a grep sweep passes over an entry with nothing to
                                   grep and records a confirmation it did not make
      42 rebindable keys          precedence ladder (framework < app < user), not a refusal —
                                   a user override IS a collision. Unbind is `action: null`, a
                                   VALUE not an absence, and it falls through to the next rung
PART  43 images (kitty)            designed already; unlocks mermaid HD + ML samples
      44 session resume            tractable half of the persistence story. RULED: a resumed
                                   session opens at the BOTTOM and restores no scroll offset,
                                   no container offset and no focus. C23's rule from the shared
                                   pollers work — per-part state is view state only, anything
                                   that accumulates belongs in a derivation — and an offset
                                   accumulates nothing, so it is dropped freely and the reader
                                   gets the newest thing. Stated so it is not re-decided and
                                   nobody builds persistence for it
      45 configurable cursor       shape is DECSCUSR and the TERMINAL draws it, so it is a
                                   capability-gated escape that degrades by being ignored.
                                   Blink is a state machine no terminal offers — steady on a
                                   keystroke, blinking after N ms — and the refresh driver
                                   already owns the clock. RULED: per focus target, not
                                   global. Placed.cursor is per layer (C15 I19), so a bar in
                                   the prompt and a block in a pushed view is legitimate and
                                   one global setting forecloses it
PART  46 SCROLLABLE CONTAINERS     a container scrolls IF IT IS FOCUSABLE and its content can
                                   exceed its declared height — so scroll follows focus, and
                                   row/panel/group are excluded (no declared height, nothing
                                   to focus). window? and elements? are both built; what is
                                   missing is a per-container offset as VIEW STATE. Blocked
                                   on 7: scroll follows focus, so it cannot be designed until
                                   focus is. Five consumers — the prompt (28), the completion
                                   menu, a paste chip's peek (30), a live block, a pushed
                                   view's inner blocks — and the render cache key is wrong
                                   the day one scrolls (13). Selection across a scrolled
                                   boundary is the part that needs ruling, with 15
      48 MG24 IS BLIND ON THE       the freeze protects the surface `src/index.ts` names, and
         PUBLIC SURFACE ★           MG24 matches members BY NAME — so a published field with
                                   no reader passes the moment any type anywhere declares
                                   that name. THREE MEASURED INSTANCES, the third on
                                   `NavElement.copy`, which is block vocabulary an app
                                   declares. FOUR TIGHTENINGS MEASURED AND REFUSED, the
                                   fourth here: gating on public types alone is 31.6% exact
                                   against 32.6% for everything — no better, and 151 of the
                                   219 collisions are public-vs-public. The axis is wrong
                                   rather than the threshold: a coherent API reuses its
                                   vocabulary across types DELIBERATELY, so this population
                                   selects FOR name reuse. What could work is not a rule
                                   change — a SECOND CONSUMER written from the public
                                   surface names every field it uses, and the residue is the
                                   candidates, by USE rather than by name. F160
      —  video · 3D · embedded editor · matplotlib wrapper · rewind/undo
```

### How to read the status column — checked 2026-08-13

**A count in prose is a snapshot with no mechanism** (F142), and this list has been
renumbered repeatedly. So the column is not a memory: every non-OPEN row names the symbol
that would have to exist, and the check is re-running that grep rather than reading this
table. A row whose evidence does not reproduce is the row to fix.

**Written, then re-run — and the re-run found one.** 35 claims, and the first pass reported
34: the row for 17 cited `logs` in `blocks/kinds/simple.ts`, where its definition is not.
`logs` declares its window in `structured.ts` and `patch` in `presentation/patch/definition.ts`,
which is a correction to this table and not to the status. **The point is that reading the
table would not have found it.** A row can name a real mechanism and the wrong file, and that
is indistinguishable from a correct row until something resolves the reference — which is
SP5's argument, arriving in the document SP5 does not scan.

This is not wired into `make instruments`, and that is a decision rather than an oversight:
it would need a fixture of its own, since the inventory is compared by equality. Worth doing
if the column outlives one session.

**Four values, and PART is the load-bearing one.** *A citation reads as coverage* — marking
17 BUILT because `patch` landed would drop `keyValue` and `code` out of the remainder
silently. The test is never *did something land here*; it is **would this entry be closed by
what landed**.

| # | status | evidence in the tree | residue |
|---|---|---|---|
| 0 | BUILT | `examples/docker/README.md` (F157), the media (F158), `.github/workflows/ci.yml` `fast`/`proof` (F150, F154, F156) | — |
| 1 | PART | **1.2 change axis** built: `change?: "unchanged" \| "changed" \| "added" \| "removed"`, `src/data/viewmodel/types.ts:440` | 1.1, 1.3, 1.4 not checked in this pass |
| 5 | PART | **CI from the tarball** built: `.github/workflows/ci.yml` `proof` job + `make regime`. **0.x** said: `README.md:472` | error messages: F151 fixed, **F152 and F153 open**. The outside-reader test is **owed and unrunnable from inside the repository** (R01 R4.4) |
| 7 | PART | **specified as C26, and three stages built.** `ElementAddress` — `interaction/router/types.ts:84` — and one shared resolver, `resolveFocus` — `interaction/router/focus.ts:122` — so focus holds an address and render and keys answer from the same place. Stage 1 made `interaction` a focus target, stage 2 gave blocks `elements`, stage 3 the address; the ⏎ ruling followed. `docs/components/C26_navigation.md` | **§4's policy resolution and the modes.** `ArrowPolicy` and `EscapePolicy` are absent from `src/` — withdrawn under MG24 because `NavElement.arrow` and `.escape` had no reader, **re-checked against the widened rule (F159) and the withdrawal holds**, so §4 is still a design question. The scroller is the fourth kind that check runs against (46) |
| 6 | RULED | **the ruling is in the entry, and the walk is in two specs.** `docs/components/C05_tool_manifest.md` §8b and `docs/components/C22_composition_root.md` §13b. 2.2's first half is built and the prose had not caught up: `shellOnly` — `data/manifest/types.ts:88` — is absent from `argv` via `validateInvocation`, `data/manifest/validate.ts:254`, and `examples/docker/bin/docker-json` records the shim's strip being deleted rather than commented | **2.2 is closed with no field; 2.1's convention is what remains.** The convention is unwritten and its residue is an empty block whose emptiness is a *failure to compute*, which C22 cannot tell from a success. 2.2 needs nothing: `--help` replaces the result rather than selecting among renderings, and `usageBlocks` — `src/data/adapters/mapping.ts:169` — lists every flag flat |
| 8 | BUILT | **C14 I4/I5/I6.** `src/viewport/viewport/viewport.ts:347` — `#afterContent()` restores from the anchor on **every** content change, not only on resize; `T5.3` is the tier-5 row — *a `--logs` tail at 1,000 lines/s while scrolled up → the view does not move* | the floating jump-to-bottom indicator, which is chrome and belongs to 29 |
| 10 | PART | `ask: (opts: AskOptions) => Promise<string>` with `choices` — `src/shell/local/registry.ts:59`, reached as `ctx.ask` at `src/shell/execution.ts:616` | the in-transcript menu block, and the popup unification (16) |
| 12 | BUILT | `src/shell/render-frame.ts:153` `body()` — `previous()`, per-row `cursorTo(i, 0)`, `SGR_RESET` per row (I57) | — |
| 13 | BUILT | `src/shell/render-cache.ts`, keyed on entry · `rev` · width · **focus** · theme name | — |
| 14 | BUILT | `src/presentation/text.ts:108` — an equality, not an approximation | — |
| 17 | PART | `logs` — `src/presentation/blocks/kinds/structured.ts:123` — **and** `patch` — `src/presentation/patch/definition.ts:211` — declare `BlockDefinition.window` (F134, CLOSED: 13–21× opening, 90–102× per drag step) | **two implementers, not four.** `keyValue` and `code` declare none and render whole at every offset |
| 18 | BUILT | `src/shell/refresh.ts` — `Source`, the `folds` memo (I47), stagger by source not by part | — |
| 19 | PART | **the first claim holds and the second does not.** `resize` is an immediate commit reason, never coalesced (C03 §, I2). But *every SIGWINCH rebuilds the Fenwick index* is false: `src/viewport/viewport/viewport.ts:197` rebuilds **only when the width changed** — C14 I8, *a height change invalidates none, and doing both would make dragging a terminal's bottom edge cost a full remeasure per frame* — and step 0 refuses a resize to the size already held (C14 I21) | a **horizontal** drag is still N rebuilds + N renders + N writes, which is the half that survives |
| 20 | BUILT | `visible: (host: RefreshHost) => boolean`, `src/shell/refresh.ts:212`, wired at `src/shell/construct.ts:760` | — |
| 21 | BUILT | **the user-invokable path exists and is tested.** `src/shell/execution.ts:1300` routes `--help` on both paths before any spawn; `usageDoc` — `src/shell/documents.ts:211` — composes from the manifest with `status: "ok"`; `--help` is reserved by `FRAMEWORK_FLAGS`, `src/data/manifest/framework.ts:126`, `shellOnly`; `/help` is two-level at `src/shell/local/handlers.ts:110`. T4.8 asserts the document **and** that nothing spawned | — |
| 25 | PART | drawn: `src/shell/paint.ts:303` reads `ghost()` fresh per paint (I50) | sole-candidate only, and static |
| 27 | PART | **16 languages** registered in `src/presentation/blocks/kinds/code.ts`, up from 2 | the entry's own target is 24 |
| 31 | PART | **recency-first landed.** `rank` — `src/interaction/completion/engine.ts` — runs after `dedupe` at both call sites over an injected `recency`, and C22 supplies it from C20's history at `src/shell/construct.ts`. `null` sorts last and stably, so it refines source order rather than replacing it. C19 I26, §3a; five mutations in `tools/mutate/runs/c19-ranking.mjs` | **substring and subsequence.** Substring is **refused** and I27 says why: the verb source emits one word at a time, so the whole name never reaches the filter and widening it changes nothing. Subsequence wants a match-quality scorer, which is a separate ruling |
| 34 | PART | animation exists as `RenderContext.tick` — `src/presentation/blocks/types.ts:39`, and `measure` never receives it (C09 I8) | structured export: no `exportAs`/`toJSON` anywhere in `src/` |
| 38 | PART | `Group` ships with `direction: "row" \| "column"` — `src/data/viewmodel/types.ts:556`, `b.group`, `src/presentation/blocks/kinds/containers.ts:236` | **the width fractions this entry says ship with it do not.** `childWidths` gives every child the same width — `src/data/viewmodel/measure.ts:122` |
| 35 | RULED | **the ruling is in the entry.** The spinner is one frame by a premise that has expired — `src/shell/paint.ts:110` says a ticker is *"a timer this layer does not own and must not grow"*, and the refresh driver has owned one since 18 landed; the `steps` block already animates off `ctx.tick` (`src/presentation/blocks/kinds/structured.ts:403`). The pending entry is appended blank — `src/shell/execution.ts:895`, `blocks: []` | nothing composes the notice, and there is no elapsed-time part. **The adapter override has no surface yet** |
| 39 | RULED | the ruling is in the entry; `Style.background` exists at `src/presentation/theme/types.ts:87`, set only by `resolveBackground` | `--no-bg` matches nothing in `src/` |
| 46 | PART | **two of the three pieces exist.** `window` — `presentation/blocks/kinds/structured.ts:123` — and `elements` — `presentation/blocks/types.ts` — are both declared, which is what the entry itself says | **the third is the missing one**: nothing holds a per-container offset as view state — no `scrollOffset`, `containerOffset` or `innerOffset` in `src/`. And it stays blocked on 7, because scroll follows focus |
| 40 | BUILT | `afterEdit()` — `src/shell/keys.ts:185` — called by the composition root after every printable key and every paste, static sources only (C19 I3, T2.1a), which is the boundary this entry called *"the trigger, not the engine"*. `test/e2e/editor.test.ts` watches the menu open on a flag prefix in a real PTY | — |
| 41 | BUILT | **both populations, one suggester.** `suggestName` — `src/data/manifest/validate.ts:147` — is the single distance-2 cutoff (C05 I18), read for unknown flags at `src/data/manifest/validate.ts:284` and unknown verbs at `src/interaction/parser/parse.ts:183`, sharing the tie-break so a second implementation cannot diverge. `test/unit/parser.test.ts` asserts distance 3 outside and 2 inside | — |
| 23 | BUILT | **a surface with its own pairing, and the ruling it corrected.** `surfaces.selection` — `src/presentation/theme/tokens-dark.ts:36`, `#264057` at 7.25 : 1 against `tone.default` — is checked by `selectionPairs`, `src/presentation/theme/contrast.ts:158`, a **sibling** of `diffPairs` rather than an entry in it. The cells come from `selectionSpans` — `src/interaction/editor/layout.ts:167` — off the same walk `layout` uses, and `washed` in `src/shell/paint.ts:291` applies them after `exact` squares the row, which is where full-row rather than text-width comes from. `inverse` is the 1-bit rung. T4.22–T4.26 and T1.37–T1.41 | a `carries: "meaning"` **palette** cannot be a wash — `resolveBackground` refuses any ref that is not `surface.*`, so the entry named a mechanism C10 does not have (C10 §4b) |
| 15 | BUILT | **four steps and a step 0, and the mode is a target throughout.** Copy mode: `#setCopyMode` holds the state at `src/shell/session.ts:586`, C03 gains `suspend`/`resume` at `src/terminal/frame-scheduler.ts:263` (§4a), C01 gains `setMouseTracking` at `src/terminal/lifecycle.ts:348` because nowhere else writes an escape. The prompt: an anchor plus the cursor, with `⌥a`/`⇧←`/`⇧Home` bound after `modifiersOf` — `src/interaction/router/decode.ts:113` — learned xterm's fourth bit. One clipboard: `copyText`, `src/interaction/editor/editor.ts:377`, written by `⌥w` and by the transcript's `copyElement`, `src/shell/keys.ts:778`, over a range held by `extendRow`, `src/interaction/router/focus.ts:246`, copying `rowCopyText`'s source text, `src/presentation/table/definition.ts:290`. The wash is entry 23 | OSC 52 is a separate axis and is not built: whether a copy **also** reaches the system clipboard is a capability question about the terminal, and it changes nothing about where the text lands in-process |
| 43 | PART | `imageProtocol: "none" \| "iterm2" \| "kitty" \| "sixel"` detected — `src/terminal/capabilities.ts:19` | no renderer |

**Checked and confirmed OPEN**, which is evidence rather than an absence of it. **Second sweep, 2026-08-13** — the symbols these entries name are absent from `src/`: **9** · **11** · **16** (the confirm and the completion menu are two mechanisms, which is the state the entry describes) · **22** · **24** (`defaultTheme` is `{ dark, light }`, `src/presentation/theme/index.ts:43`) · **29** (and `chromeRows` in `src/viewport/viewport/types.ts:80` is C14's per-entry chrome, **not** this row's header/footer budget — it reads as coverage and is not) · **30** · **33** · **36** · **37** · **42**. **48** joins them measured rather than
grepped, 2026-08-13: `nameExactnessSignal` reports 382 of 1171 members exact, and the
public-surface variant this entry proposes measures 101 of 320 — no better, so the entry
is open with its first candidate already refused. · **26**, **32** — the symbols the entries name are
absent · **45** — no `DECSCUSR`, no cursor-style escape and no `cursorStyle` anywhere in `src/`; `cursorSequence` (`src/terminal/lifecycle.ts:48`) is *positioning*, which reads as coverage and is not · **28** — `paint.ts:241` still reads *"around the end rather than around the cursor,
until C17's `cursorCell` is…"*, and `cursorCell` exists at `editor/layout.ts:134` · **44** —
`interaction/history/persist.ts` is C20's *history* persistence and is not session resume,
which is worth saying because it reads as coverage.

**SIXTH SWEEP, 2026-08-13 — every OPEN entry taken to the reader rather than to the symbol.**
Nineteen of twenty-one survive. Two did not, and **both are in the same class**: they name no
symbol a grep could resolve.

| entry | at HEAD |
|---|---|
| **40** as-you-type completion | **BUILT.** `afterEdit()` — `src/shell/keys.ts:185` — is called by the composition root after every printable key and every paste; static sources only (C19 I3, T2.1a), which is the boundary the entry called *"the trigger, not the engine"*. `test/e2e/editor.test.ts:54` watches the menu open on a flag prefix in a real PTY |
| **41** typo detection | **BUILT**, and for **both** populations. One distance-2 suggester (C05 I18) — `src/data/manifest/validate.ts:147` — used for unknown flags at `validate.ts:284` and unknown verbs at `src/interaction/parser/parse.ts:183`, sharing the cutoff *and* the tie-break so a second implementation cannot diverge. `test/unit/parser.test.ts:213` asserts distance 3 is outside and 2 inside |

**The class is the finding, and it indicts the method rather than the entries.** Every earlier
sweep's claim was *"the symbols these entries name are absent from `src/`"* — which is exact
when an entry names one. **40 and 41 name none**: *"the trigger, not the engine"* and *"typo
detection — trivial, delightful"* have nothing to grep, so the sweep passed over them and
recorded a confirmation it had not made. An entry with no symbol reads exactly like one whose
symbol is absent, which is A03 §2's vacuity class arriving in the sweep instead of in the list.

**Two arms this sweep used that no rule has**, both from entry 21's shape and both a *read*:

- **A citation that resolves and describes a superseded state.** The question is whether the
  sentence still describes the file, not whether the line exists. Five confirmed-OPEN entries
  cite code that exists — 24, 28, 29, 44, 45 — and all five survive: `paint.ts:241` still says
  *"until C17's `cursorCell` is threaded through"*, `chromeRows` is still C14's per-entry chrome
  and not the frame budget, `cursorSequence` is still positioning, `persist.ts` is still C20's
  history.
- **A deferral chain.** *Would landing this close it* asked of a deferral, which only going to
  the downstream reader answers.

**And one cascade, which is what a stale entry costs beyond itself.** 31 says *"RANK BEFORE
as-you-type, or the menu is worse for opening itself"* — and 40 landed without it, so that
ordering was violated by a build nobody recorded. 41's *"smaller once 40 lands"* had already
resolved.

**And the class is now counted, because a finding about a method deserves a number.**
`tools/roadmap-status.mjs` reports it every run:

```
grep reach · 6/19 confirmed-OPEN entries carry their own symbol; the rest rest on a blanket claim
```

**Six of nineteen.** The other thirteen sit under *"the symbols these entries name are absent
from `src/`"* with no clause of their own, and **both stale entries were in that thirteen**.
Reported and never gated: an entry is allowed to name no symbol, and demanding one would push
rows into inventing a citation that means nothing — the trap the optional `:line` already
avoids.

**The first version of that signal measured the Order row and said 4 of 19, and it was wrong in
both directions** — 9 and 11 carry no backticks and their titles, `mermaid` and `markdown`, are
perfectly greppable. The question is not what an entry contains but **what the sweep wrote
down**, so the text to read is the sweep's own sentence. Recorded because a measurement that
was nearly taken against the convenient text is the same error one layer down.

**Seventeen stale claims across six sweeps — fourteen of forty-four entries, 32%.** The rate
has risen at every sweep, and a rate that rises is not a list converging on the truth. **What
the sixth sweep changes is which instrument the number indicts**: nineteen of twenty-one
survived a read, so the *list* is sound and the *method* was not. On the criterion set before
the sweep — *if it is most of them, the list is sound and entry 9 is next* — it is most of them.

**Not checked, and named rather than left to look checked:** 2, 3, 4. Three of forty-five, and
they are the three that **cannot** be checked from here: each names `prism-tui`, a consumer
repository that does not exist in this tree. That is a different state from *not looked at* and
it is said rather than folded into the other two — an OPEN nobody verified reads exactly like
one somebody did, and so does one nobody could.

**The second sweep found a ninth stale entry**, which is the argument for having run it: 19's
*every SIGWINCH rebuilds the Fenwick index* has been false since C14 I8 landed. Nine of
forty-two checked — 21% — and the rate did not fall between sweeps.

**The third sweep, 2026-08-13, found two more — and it was a check rather than a reading.**
7 and 46 were both blank while their own descriptions said something was built: 7's
*"stages 1–3 built"*, 46's *"`window?` and `elements?` are both built"*. Both are now PART
with evidence rows. **Eleven of forty-four checked — 25% — and the rate has now risen
across three sweeps**, which is worth saying plainly rather than reporting the two finds as
diligence.

**What made 7 invisible is the hole this list was built with.** Its confirmed-OPEN evidence
was *"has no `src/interaction/navigation/`"*, and that grep still resolves — the work landed
in `router/` and `shell/`, because that is where focus lives. **The citation was true and the
sentence it carried was false**, which no resolution check reaches: check 1 resolves a
*marked* row's evidence and check 2 only asks that no entry falls out of the partition, so
both watch rows that make a claim. **A blank row makes none and resolves trivially** — A03
§2's vacuity class arriving inside the instrument written to catch stale rows.

`tools/roadmap-status.mjs` now carries the arm that closes it, and it needs nothing outside
this document: **a row that says something is built is not OPEN.** Its first run fired on
four rows, two real and two using a built-word without asserting anything exists — 3's
*built with prism-tui as the consumer* and 15's *is built three times*. The pattern is not
narrowed to fit them; they are named exemptions quoting the sentence, with an equality arm,
so a row that changes its wording has to re-earn the exemption.

**And the fourth sweep found one the column could not have.** Entry 6's status was OPEN and
its evidence was **correct** — `FlagDef` genuinely has no presentation-selecting field. What
was stale was §2.2's **body**: *"every declared flag is transmitted, so `--raw` reached docker
and it exited 125"*, false since C05 I21 shipped, with `examples/docker/bin/docker-json`
recording the shim's strip being deleted and citing F39 by name. F39's own body had gone stale
in the same direction while its title still read true.

**That is a surface neither instrument covers, and saying so is the point of counting.** The
verifier resolves the Order list's citations and the evidence table's; **nothing resolves a
body section**, and a body section is where a claim goes stale most quietly, because the entry
above it is still open and reads as coverage. Twelve stale claims across four sweeps — eleven
of forty-four entries, 25%, plus this one, which is not an entry. The rate has risen at every
sweep, which is what says the column is being verified rather than maintained.

**The fifth sweep found the largest one yet, and two kinds no resolver reaches.**

**Entry 21 was PART and is BUILT** — every claim in it, including the second one nobody had
re-read: `/help`'s flat wall is already two-level, grouped by C05 §3's partition with
`/help keys` beside it. Its evidence cited `documents.ts:215` *"on `raw.exitCode === 2`"*, and
215 is inside `usageDoc`, whose own comment says the exit-2 framing is the state it replaced.
**A citation can resolve, point at real code, and describe the thing that code was written to
end.** That is a fifteenth stale claim and the biggest so far — a whole entry, not a sentence.

**The two new kinds, because neither is a stale claim and neither is checkable.**

- **An inverted dependency.** 21 said it needs 6's flag; 6.2 was then found to need 21. Both
  sentences were true when written and the arrow between them was backwards. A citation
  resolver checks citations; **a dependency is a claim about two entries and neither one is
  wrong.** Only building one of them settles it.
- **A deferral chain.** 6.2's value set was deferred three times — to C09/C22, then to entry
  21, then answered by finding 21 built. Each link was correct and each read as coverage.
  **Would landing this close it applies to a deferral as much as to a fix**, and nothing in
  either instrument asks it of one.

Fifteen stale claims across five sweeps — twelve of forty-four entries, **27%**, plus the body
section and these two. The rate has risen at every sweep, which is what says the column is
verified rather than maintained.

**Entry 7's four subsumed rows stand.** `docs/components/C26_navigation.md` — specified, and
stages 1–3 built. **10** (the question / menu
primitive), **15** (selection, copy, semantic copy), **16** (one popup) and the unnumbered
block-to-block, column and cell movement are subsumed, and C26 §11 lists them with the
evidence. They keep their rows: *would landing this close it* is answered **no** for all four
until C26 is built, and a row deleted on the strength of a design is a row nobody is owed.

**Step 8 stays at the top** because the README and the play environment are prerequisites
for the outside-reader test, and because CI running examples from the tarball is the
mechanism that keeps the docs true — which matters more than usual, since eight drawings in
the surfaces document were wrong about the far side or the framework.

**Phase 1 is the same work for both destinations.** prism-tui will hit the producer-context
contract exactly as docker-tui did; so will a stranger. It is not destination-dependent, it
is simply before the freeze.
