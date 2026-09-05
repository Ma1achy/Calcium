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
- **Video / GIF.** **BUILT 2026-09-04**, on the re-ruling of 2026-09-03 that said the reason this
  row carried — *a frame scheduler built around one frame per input batch* — was false at HEAD:
  C03 commits a `stream` rung with a 33 ms window and a 3D plot under an orbit is already a
  continuous redraw on it (`ORBIT_RATE` in `src/shell/session.ts`, C22 I74). The re-ruling priced
  it at a codec and ~350 lines against zero consumers and called it a cost refusal; the owed pass
  then admitted the carrier (C04 I93: `Image.data` is PNG **or GIF**, the frame is view state), and
  this is what it cost, measured. **(1) The decoder** — `decodeGif` in
  `src/presentation/image/gif.ts`, **299 lines** including its comments, LZW and frame compositing
  in-tree, no dependency row (`omggif` was the alternative at 38.5 KB); every fixture decodes pixel
  for pixel to `sharp`'s composited pages (`test/edge/image-frames.test.ts` IF2). **(2) The
  carrier** — no new field: a GIF is one `Image` and its frames are its own; `Frames` in
  `src/shell/frames.ts` (**133 lines**) holds the frame each on-screen image is on, advanced by
  elapsed time on the orbit's own wake — one timer path and one stamp (`#motionAt`), ~110 lines of
  change in `session.ts` (C22 I77), the render key's eighth axis, and a measured wake cadence: a
  still PNG arms **no** timer, a 100/200 ms GIF wakes **six** times in 990 ms and not thirty,
  because the timer is armed for the next frame change and floored at the `stream` rate. **(3) The
  kitty cost this row named does not exist**, and measuring it is what settled the ruling: a
  retransmission at a stable id every tick would be **75 bytes a tick for an 8x8 and 29,662 for a
  320x240** (297 KB/s at 10 fps); kitty's animation protocol (`a=f` per frame, one `a=a`) uploads
  **once** — 116,509 bytes for four 320x240 frames — and the terminal runs the loop, so on that
  arm the session arms no wake at all (C09 I39). **Still no consumer** in `src/`, docker-tui or
  `examples/plots`; it was built because the owed pass admitted the member, not because one
  arrived, and the row says so. SS54 R18 and R19 now watch it the other way round: `decodeGif(`
  **present**, `ORBIT_RATE` present.

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

**VETTED 2026-08-15, AND THE SHAPE HOLDS WHILE THE WEIGHT DOES NOT.**

*What is right, measured by installing it outside the tree.* `renderMermaidASCII` returns a
**grid of text lines** — so a `mermaid` block is a `code` block with a transform in front,
exactly as this section says, and it waits on nothing: not images, not 43. A four-node
flowchart renders in **19 ms**, synchronously, one call. `AsciiRenderOptions.useAscii` maps
straight onto C02's `unicode` capability, and `colorMode: "none"` keeps C10's ownership of
colour — which is the property that made `lowlight` acceptable and `shiki` not. MIT, and the
repo is `lukilabs/beautiful-mermaid` (Craft Docs).

*What is wrong, and it is the comparison this section makes.* **`lowlight`'s row rests on
importing only what is needed — sixteen grammars measured at 121 KB against the package's
9.2 MB.** There is no subset here: the ASCII path **is** the layout engine, so `elkjs`
arrives whole. Measured: **11 MB installed, three packages** — `beautiful-mermaid` 2.1 MB in
185 files, `elkjs` 8.1 MB, `entities` 0.4 MB. That is not *the same dependency shape as
`lowlight`*; it is two orders of magnitude away from what that row actually approved.

*And two smaller things.* `elkjs` is **EPL-2.0**, which would be the first non-permissive
licence in `DEPENDENCIES.md`. And the maintenance signal is thin in a specific way: ten
releases between 2026-01-28 and 2026-02-26, then **nothing for five and a half months** on a
package six months old — finished and abandoned look identical at this range.

**REVERSED 2026-08-15, AND THE REVERSAL IS THE CORRECTION.** The refusal above rested on a
misapplied precedent: `lowlight`'s 121 KB is **evidence of a subset import path** — a claim
about composability — and it was recorded as a number and then applied as a size limit. It is
not one. **11 MB of dev dependency in a terminal framework is not a cost anyone ships**, and a
comparison that treats it as one is comparing the wrong property.

**EPL-2.0 is file-level copyleft**: it reaches modifications to EPL-licensed files, and
depending on the package triggers nothing. It gets a row in `DEPENDENCIES.md` saying so, as the
first non-permissive entry — recorded rather than treated as a bar.

**ADOPTED AND BUILT.** `mermaidCode(source, caps)` in `src/presentation/mermaid.ts`, published
from `src/index.ts` because the app is the caller: a diagram arrives as text from a far side and
becomes a block on the way in, which is an adapter's or a live part's decision.

**The transform is one call wide, and the maintenance signal is why** — ten releases then five
and a half months of silence. If the package dies, what is lost is a function body: the block,
the capability mapping and T2.80–T2.83 all survive a replacement, and none of the renderer's
options reach the block's shape.

**And its ASCII switch is the tier `ambiguousWidth` built.** The unicode output is box drawing,
ambiguous throughout, so `useAscii` is the **wide** arm as well as the ASCII one — the
renderer's own switch and C02 I9's are the same switch, which is what `glyphs()` already does
for the framework's own set. `colorMode: "none"`, because C10 owns colour and a diagram is not
the exception.

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
background: "surface"      paint `surfaces.bg`. Required for any theme that cannot assume
                           its host
```

**CORRECTED BY THE WALK — a choice, not a colour** (C10 §4c row 1, I25). This read
`background: <colour>`, which is a second source of truth for the one surface every floor
is already measured against: a theme could paint `#ffffff` and prove its floor against
`#fafafa`, **which is this entry's own defect entered from the other side.** The precedent
is one entry back — `AskOptions.placement` is a choice between placements rather than a
`Placement`.

**Which makes the contrast floor provable in both cases** — against the painted colour, or
against the *declared assumption* when inheriting. **CORRECTED: provability is a rung of the
ladder, not a branch of the declaration** (C10 I26). Provable at 24-bit; at 8-bit provable
against the cube's defined RGB, which obliges computing the floor against the **quantised**
value rather than the token; **best-effort at 4-bit**, where `surface.bg` is a curated index
and 0–15 are whatever the emulator's palette says; and vacuous at 1-bit, where nothing is
painted and nothing is coloured. So the override is one clause of four and
the only optional one, where this entry named it as the whole statement. That declaration is also what lets C10
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

**DISCHARGED, AND BY NEITHER OF THEM** (C22 §6g.1, I65). `exact()` squares every row and
predates both; `render-frame` already depends on it, and entry 23's wash *consumes* it —
`washed` runs after `exact`, which is where its own full-row half comes from. So there is
nothing to build together, and **the mechanism the two actually share is one layer below
where this note points**: a wash is a span with a start and an end, a background is a
default, and **every reset in the tree returns to the terminal's default rather than to
ours.** Four reset sites, measured, one of them in L1. A shared-work note that is already
discharged reads as coverage of the interaction it names while the real one sits at the
reset.

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
b.group("row", [plot, stats], { flex: [2, 1] })     the plot takes two thirds
```

~~C11's precedent is worth following exactly~~ — **CORRECTED BY THE WALK, and it cannot be
followed at all** (C04 §3, I42). `Column.flex` is a **boolean** over a minimum derived from the
column's content: absorb the residual, or do not. A group knows `measure(block, width) →
height` and **no preferred width**, so there is nothing for a child to absorb residual *from*,
and a declared proportion is the only allocation this level can express. Following it exactly
would give `flex: [true, false]`, which says nothing about a 2 : 1 row — **the two share a name
and not a mechanism.**

Its lesson still lands: **F50 found that a column with no `flex` gets its minimum and nothing
more** — so a row's children need the same opt-in, which is why absent weights are an equal
split and a weight is declared rather than inferred. The `/ps` NAME column carried that comment
three lines from where it was written again.

**F50 is cited here as precedent and is not fixed here.** It is an open finding against C11's
*columns*; a row container inherits the lesson and leaves the defect where it is. Saying so
matters because the citation reads as coverage — which is how a finding gets planned once and
fixed never.

~~**Ships with `b.row`.**~~ **`b.row` is the table-row builder**, so this ships as `flex` on
`group` — the shape C04 §3 deferred anyway: *add weights*, not *add a container*. No new
concept, no measurement change. **BUILT 2026-08-14.**

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
**the seam is built and wired — two kinds of five have taken it.** `C09 I25`'s
`BlockDefinition.window` exists, `registry.windowSequence` composes it across a run counting
`gapBefore` correctly, and `session.ts:921` calls it on the transcript render path with the
range keyed into the render cache. A kind that declares no `window` is kept whole and paid for
out of `skipRows`, so the seam is optional and silent — which is why its state is not
obvious from either end.

```
patch      WINDOWS   presentation/patch/definition.ts:214 → windowRows
logs       WINDOWS   presentation/blocks/kinds/structured.ts:172
code       kept whole
table      kept whole
keyValue   kept whole
plot       atomic, permanently (C12 I1)
```

**MEASURED 2026-09-01, and the gap is 1 400×.** Registry against `dist/`, one block, painting
the top 40 rows. **The render path's own figure is C14 §4a's (2026-09-03), and that is the one
to cite**: it measures `windowSequence` as `session.ts` calls it, its absolute numbers differ from
these by an order of magnitude because the method differs, and it carries the ruling (C14 I23) —
the table below is kept as the measurement that first named the gap, not as the figure:

```
kind    rows      measure ms   paint 40 rows ms   window keeps
code     5 000        2.68            82.96        5 000 of 5 000
logs     5 000        0.00             0.35           40 of 5 000
code    50 000       14.68           913.79       50 000 of 50 000
logs    50 000       0.00             0.65           40 of 50 000
```

**The kind that took the seam paints a 50 000-row block in 0.65 ms; the kind that did not takes
914 ms for the same forty rows.** `logs` also measures in 0.00 ms because its height is
`lines.length` arithmetic, where `code` must wrap-measure every line — so the remaining cost
splits into a `window` and a `measure` and the second is not free for every kind.

**So the work is three windows, not a mechanism**: `code`, `table`, `keyValue` — **all three landed** (`table` 2026-08, `keyValue` at `structured.ts:125`, `code` with `raw` on 2026-09-04 under C14 §4a; `lineRange` is `code`'s pin). `windowPatch`
proved the pattern and `windowRows` is the pattern *in `BlockDefinition.window`'s own shape* —
its doc reasons the `skipRows` accounting through C25 I18 and I19 and states why the pushed
view and the transcript need two functions rather than one parameter. That is the template the
three follow, and the non-trivial half is `skipRows` rather than the slice.

**The plot does not divide, and that is permanent** (C12 I1: reducing a plot's data changes
nothing about its height). **Granular where the kind divides, atomic where it does not.**

**A survey by directory got this wrong first.** Globbing `presentation/blocks/kinds/` reported
`logs` alone, because `patch`'s definition lives in `presentation/patch/`. *A scan covers the
directory and names its exceptions*; the reliable question is asked of the registry — window a
tall block and see whether it shrank.

**4. [`cells()`'s ASCII fast path](#cells-fast-path).** Only worth measuring after 1–3, because most calls
disappear with the cache.

#### And a bound, because a fix is not a guarantee

**Even windowed, `measure` still walks the whole block once** to know its height — and a
50,000-row table has to be measured before C14 can place it.

**So bound it, and make the bound the app's to raise.** `MAX_ROWS` exists for the fallback
adapter and nothing generalises it: a default cap per block with a visible marker
(*"2,000 of 50,000 rows"*), overridable where an app genuinely wants more. **The marker is
what keeps it honest** — D40's eviction already carries one, for exactly this reason, and a
silent truncation is the empty-block class again. **Built 2026-09-04 as C14 §4b** — and the
premise above was measured wrong on the way: whole-block `measure` is 0.6 ms for 50 000 table
rows and 20 ms for 50 000 `raw` lines, so it was never the cost; paint is ~0.25 ms/row and linear,
so no figure picks the number and 2 000 is a reading-length policy pinned to `MAX_ROWS`.

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

**MEASURED 2026-09-01, and this entry named the free part. F423.** The defect is real and
larger than the entry claimed; its stated cause is **0.07%** of it. Against `dist/`, real
registry, real transcript, monotonic width sweep — a drag never revisits a width, so nothing
is reusable even in principle:

```
                     per drag event      a 30-event drag     Fenwick rebuild     tree's share
N =   200 entries     3.8 – 5.8 ms            115 ms            0.001 ms            0.03%
N = 1 000 entries    18.1 – 20.0 ms           544 ms       0.007 – 0.013 ms         0.07%
```

**The cost is `#cache.clear()`, one line above the rebuild** — a width change invalidates every
cached height (C14 I8), so the path re-measures **every entry**. `#rebuild()` is called, it is
correct, and the Fenwick tree over N integers is free.

**The falsification condition this entry stated would have closed it.** It read *"if a rebuild
at a realistic transcript size is sub-millisecond the whole thing is moot, and the honest
answer is a recorded negative"* — and the rebuild **is** sub-millisecond, by three orders of
magnitude. Rigorous, numeric, falsifiable, and pointed at the 0.07%. Kept here rather than
deleted, because a check aimed at the wrong artefact reads exactly like a good one and this is
the measured instance.

**And the fix is not where this entry put it.** `construct.ts:914` is the handler:

```
stores.viewport.resize(...)   ← the remeasure. 20 ms at N=1000
refreshAnchors()
scheduler.commit("resize")    ← the frame
```

The expensive work runs **before the scheduler is told**, so a C03 window defers the third line
and leaves the first running per SIGWINCH: it saves the N writes and the N renders and none of
the N measures. **The coalescing belongs in C22's handler, above `viewport.resize`.**

**The asymmetry to carry**: C14 virtualises, so a resize's render is `O(visible)` — recorded
below as checked-and-clear, correctly — but the index needs a height for every entry, so the
measure stays `O(transcript)`. **A width change is the one event whose cost scales with the
whole transcript rather than the screen.**

**The C03 citation is also wrong.** I2's text is *"`input` and `completion` commits are never
delayed by any amount"* — it does not mention `resize`, and this entry quoted it as though it
did. Three places in C03 cite I2 for `resize` (§3's prose, rule 1, T3.13); `make enforce`
resolves the citation and cannot check what the invariant says. And *never delayed* is already
false for `resize` — T3.17 defers one arriving during a write.

**Still worth doing, for the reason the entry gave**: a delayed resize by 16 ms means one
correct frame instead of thirty wrong ones, and the final size is the only one anyone sees.
Immediate for the first, coalesced for a run — what a terminal emulator does with its own
repaints. The acceptance is a drag, not a benchmark.

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

#### §8a · The walk, 2026-08-15 — and it is a table because there are no events

**The artefact's shape is a decision.** `art(spec, caps, width)` is a pure function of its
three arguments; nothing is in flight, nothing arrives between two rules, and there is no
sequence to trace. Every interaction it has is **structural** — two rules that both hold at
rest — which is C18 §8a's shape and not C16's. Choosing a trace here because the fallback
chain reads like a ladder would have indexed the artefact by rungs, and every row would have
been governed by one rule and found nothing.

The rules, named so the cells can cite them:

- **A1** a variant declares its tier; use the one for this tier.
- **A2** a lower tier is safe at a higher depth; use it when this tier's is missing.
- **A3** nothing declared → the text, styled. Never nothing and never a throw.
- **A4** *the tier threshold is each variant's own measured width* — docker-tui's, measured
  while building the banner rather than assumed.
- **A5** each variant is validated at construction.

| # | state | rules meeting | ruling |
|---|---|---|---|
| 1 | both declared · ASCII terminal · both fit | A1, A2 | ascii. A1 excludes blocks by tier and A2 supplies the answer |
| 2 | both declared · full terminal · **both fit** | A1, A4 | blocks — **tier wins when width does not decide** |
| 3 | both declared · full terminal · **blocks too wide, ascii fits** | A1, A4 | **A4 wins.** Eligibility is tier **and** fits, and the chain resumes at the next rung |
| 4 | only blocks declared · ASCII terminal | A2, A3 | the text. A2 has no lower rung to offer |
| 5 | only ascii declared · full terminal | A1, A2 | ascii — the forgiving direction, and the middle rung's whole purpose |
| 6 | every declared variant too wide · the text fits | A4, A3 | the text. **A3's rung is reached by width and not only by absence**, which the chain above does not say |
| 7 | the text is itself wider than the terminal | A3, A4 | it **wraps**. A4 does not reach the last rung, because there is nothing below to fall to |
| 8 | `text` empty and nothing declared | A3, A5 | a construction error. *The always-available fallback* that is empty makes the declaration able to produce nothing, which is A3's own refusal |
| 9 | a declared variant contains a tab | A5, A3 | **throws**, and A3 does not forbid it |
| 10 | what the throw in 9 leaves behind | A5 | nothing — and it is asked rather than assumed |

**Row 3 is the one that pays for the table, and the entry above does not have it.** The
declaration form is `variants: { blocks, ascii }` — tiers, with no width anywhere in it —
while A4 says the threshold is each variant's own measurement. Both are correct and they
overlap in exactly one cell: a blocks variant that is eligible and does not fit. docker-tui
measured the consequence from the other side: whale + **ASCII** wordmark is **76 cells**, which
sits comfortably inside the tier its own document reserved for the whale alone, so a fixed
threshold would have drawn a lone whale on an 80-column terminal with room for the name beside
it. Selection is therefore **tier-eligible ∧ fits, in declared order**, and *report measured
cells* stops being a report.

**Row 9 is two failures under one sentence.** *The fallback is a fallback, not a filter* is
about art that is **missing**; a variant carrying a tab is a **programming error**, and C04
already throws `BlockShapeError` for shape. Reading A3 as covering both would mean a tab
silently selecting the next rung — the art would render, correctly, on the machine that wrote
it, which is the failure class this entry exists for.

**Row 10 because a ruling that throws owes it.** C13's `settle(id, doc)` is the measured case:
a correct decision to throw created a state two components away that C23 I9 forbids. Here the
answer is *nothing* — `art` holds no store and mutates nothing — and that is worth one line
rather than being left as obvious, because obvious is what it looked like there too.

#### §8b · Three of the four validation checks are no longer the entry's to build

Measured against the tree rather than inferred, and this is the deferral table's own column:
**the condition is written where the claim is and what met it is written somewhere else.**

| the check | disposition at HEAD | what met it |
|---|---|---|
| **no tab characters** | **the only one that survives**, and it is the sharpest | nothing. Measured: `stripControl` keeps a tab **by design** — its own comment says *tab is expanded rather than dropped* — and `cells("a\tb")` is **3** while the terminal advances eight |
| **uniform line width** | **closed by roadmap 38** | `rawDefinition.render` is `fit(line, width)` per row, so a ragged art in a `group` column is padded to the column. The failure was hand-concatenation, which is what `group` replaced |
| **report measured cells** | **absorbed rather than delivered** | it is A4, the selection mechanism. An app that never writes a threshold cannot write a wrong one |
| **row-count alignment** | **closed by roadmap 38** | `Group.align?: readonly Valign[]` |

**And the fourth row is a contradiction live in the tree, which the walk found by going to
look.** `examples/docker/src/banner.ts` says *"What is still the app's: the wordmark's leading
blank row, which is a vertical alignment a row group has no opinion about (a short child sits
at the top)."* `Valign` in `src/data/viewmodel/types.ts` says *"The banner is its consumer: the
wordmark carries a blank first row so its seven lines sit on the whale's hull, which is
`bottom` written into the art by hand."*

**Both sentences are correct about their own half and they contradict each other.** The type's
author knew precisely which hand-padding the field replaced and named it; the consumer went on
paying for it and recorded that the framework had no opinion. Neither was looking at the other,
which is the third instance of that shape and the first found live rather than in a diff.

#### §8b2 · The axis the walk did not have, and what found it

**`ambiguousWidth`, and A03's SS50 found it rather than §8a's table.** The table indexes tier
against width and has no third column; `▄ ▀ █ ░ ▐ ▖` are `East_Asian_Width=Ambiguous`, **every
one of them**, so a terminal declaring `wide` draws a block-element wordmark at double. A
wordmark whose glyphs double is not a wordmark, which is the sentence `mermaid.ts` already
makes about box drawing — and this is the second consumer to need the same switch.

**Width alone does not reach it**, which is why the *tier* is what refuses: a doubled wordmark
that still fits is drawn, twice as wide as its author measured it, on a terminal nobody
developing the art was using. That is the entry's own failure class, arriving on an axis its
walk did not have.

**The instrument beat the artefact here, and that is worth saying plainly.** §8a's shape was
chosen deliberately and was still indexed by the two rules the entry names — so the walk was
exhaustive over the wrong pair. A rule table finds what two *stated* rules do together; it
cannot supply a rule nobody stated. The enforcement scan can, because it reads the code rather
than the document.

**And the mutation pass then wrote a row.** Removing the convention from `widthOf` survived
every assertion, because the only ambiguous art in the fixtures was the `blocks` variant and
the tier arm already refuses that at `wide` — **the two rules masked each other exactly**. The
ruling was stated in a comment and constrained nothing, which is A03 §2's vacuity class in
prose. The state that separates them is art an app declares under `ascii` and draws with box
characters: the tier has no objection, so only the measurement can be wrong. T2.84n.

#### §8c · What is built, and what it is not

- **A builder, not a block kind.** `art()` in `src/presentation/art.ts`, published from
  `src/index.ts`. `mermaidCode` is the precedent and the argument is the same one: art is
  **pre-composed text**, nothing about it needs a renderer, and a seventeenth kind in the
  published vocabulary before the freeze — with one consumer — is the disposal 50 got.
- **The last rung is a `notice`, tone `accent`, no glyph**, and the mechanism was checked
  before the ruling was written down. `raw` cannot carry a style, so *the text, styled* named
  an operation the layer below does not have — C23 §8a A4's class. `accent`'s mono class is
  `emphasised`, so the rung is bold at 1-bit and coloured where there is colour, and a notice
  **wraps** where `raw` would truncate, which is row 7.
- **It never returns nothing.** Deciding there is no room for a banner at all stays the app's,
  and already is: `FLOOR` in `banner.ts` is 40 columns.
- **No `artVariants()` export.** The measured widths are the selection and are asserted in the
  rows; a table for an app to read is an export nothing consumes until something reads it.

#### Generated art, later and only for the text case

A wordmark is **text plus a font** — figlet's model, and figlet has hundreds of fonts, some
pure ASCII and some using block elements. So `banner("Docker", { font: byTier })` genuinely
*can* produce every tier from one source.

**A nicety, not the point**, and only worth it once a second app wants a banner. The
hand-drawn case is the one that needs the API to be good.

### Selection in the prompt — and `⌃a` stays where readline put it

**Select-all in the prompt does not exist — but selection now does.** This section said *grep finds no anchor, no mark, no region in C17*; measured 2026-09-03, `selectionSpans` is exported from `src/interaction/editor/layout.ts` (C17 I18, I21) and roadmap 15 is BUILT, so there is something to select *into* and the binding below is the whole of what remains.

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
### Chrome is one row each, by design — and the claimants are counted once, in entry 29

`frame.ts:4`: *"Calcium owns the structure — **one chrome row each, fixed, never scrolling**."*
Deliberate, and it is now the constraint several things are queuing behind:

```
the navigation model    NAV / EDIT, vim-style
progress feedback       running · 4s
queueing                ✳ 2 queued · 1 running
region separators       a rule between chrome and content
```

**Several features wanting the same one row is the signal to rule on it once**, rather than letting them fight. The list above is the one this section opened with; the current count is kept in entry 29 alone (reconciled 2026-09-03), because four documents carrying four numbers was the defect. The options:

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

#### §8a · What indexes the buffer, measured 2026-08-15 — and it decides the type

**Bracketed paste is detected**, so the pre-design check above is answered: `router/decode.ts`
carries both machines — bracketed and heuristic — and a `PasteState`, and `keys.ts:441` already
fires `afterEdit()` on every paste.

**Everything in C17 indexes by grapheme, and that is the whole reason this is tractable.**
`#text` is a `string`; the cursor is a grapheme index; `count`, `clamp`, `splitAt`,
`sliceBetween`, `removeBetween`, `wordLeft` and `wordRight` are all grapheme-indexed. **A chip
that occupies one grapheme changes nothing in motion, deletion, word jumps or the selection
anchor** — not one of them has to learn what a chip is.

**So: one grapheme to the editor, a block to the renderer**, and the sentinel is a value in the
string with a side map from it to the `Block`. Which is the prediction, confirmed rather than
assumed.

##### The buffer stays a string, and that is the finding

The tempting move is a structured buffer — an array of `string | ChipRef`. **It is not one
component's change, it is four**, because `editor.text` leaves C17 as a plain string at seven
sites and every one of them would need its own answer:

| reader | what it does with the string |
|---|---|
| `shell/construct.ts:1215` | `pipeline?.submit(stores.editor.text)` — **C23 takes a string** |
| `shell/keys.ts:293`, `:563` | `contextAt(text, cursor, manifest)` — C19 completes against it |
| `shell/keys.ts:612`, `:800` | `history.previous(text)`, `searchOpen(text)` — **C20 stores strings** |
| `shell/session.ts:549`, `:579` | `selectionSpans(text, …)` — C09's wash |
| `shell/construct.ts:1576` | `promptHasText` |

A structured buffer makes C19, C20, C22 and C23 all take a new shape before a single chip is
drawn. A sentinel grapheme plus a side map is **C17-local**, and the seven readers keep working
on the day the chip exists — which is what makes the first version reversible.

##### The table lists readers of `text`, and three of them read an INDEX with it

**Found going to place the sentinel, 2026-08-15, and it moves the design.** The seven-reader
table above is a list of *what consumes the string*, and it is the wrong axis for the question
it was answering. **Three of the seven pass a buffer index alongside it**:

```
keys.ts:293    contextAt(editor.text, editor.cursor, manifest)
keys.ts:563    contextAt(editor.text, editor.cursor, manifest)
session.ts:579 contextAt(editor.text, editor.cursor, manifest)   — the ghost
session.ts:549 selectionSpans(editor.text, sel.anchor, sel.head, …)
```

**So the obvious implementation of *the seven readers keep working* does not work.** The
tempting move is to have the `text` getter **resolve** chips to their content — every reader
sees a plain string, nothing else changes, and the sentinel never escapes. It is wrong for a
reason the table cannot show: `cursor`, `anchor` and `head` are indices into the **raw** buffer,
and the moment a chip precedes one of them the pair disagrees. Completion would complete at the
wrong offset and the selection wash would paint the wrong run — **both silently, and both only
in a frame.**

**So resolution is at the submission site and nowhere else** (`construct.ts:1215`), and the
sentinel is therefore visible to `contextAt`, `selectionSpans` and C20. Each has to tolerate it,
and each tolerates it differently:

| reader | what a sentinel does there |
|---|---|
| `selectionSpans` | **fine by construction** — one grapheme, and the walk seam gives it the label's width |
| `contextAt` | a sentinel inside a token, which C18's classifier has never seen. **The row that has to exist** |
| `history.previous`, `searchOpen` | a sentinel reaching **C20's store**, which persists to a file. The second row the entry owes |
| `promptHasText` | a buffer holding only a chip is non-empty, and a length check on the raw buffer and one on the resolved string **can disagree by construction** |

**That last one is the state that separates the two readings**, and it is why *resolve in the
getter* reads as harmless: with a chip-only buffer, `text.length > 0` is true either way, and
every other assertion agrees too. It is the cheapest row and it is the one that would have been
left out.

**And the finding generalises past this entry**: a table indexed by *who consumes X* is blind to
a consumer that reads X **and something derived from X's shape**. The seven-reader table is a
correct answer to *how many components see the string* and the wrong instrument for *can the
string change*.

##### The submission ruling, and the tree makes it forced rather than likely

**A chip resolves to its content at submission.** Not *almost certainly right* — the alternative
is not reachable from here: `construct.ts:1215` hands C23 a `string`, C18 classifies a string,
C20 stores strings, and C05's manifest describes `argv`. *The manifest gains a way to carry a
block* is therefore a change to four components to deliver something the transport cannot take,
since the far side receives argv either way.

**What is genuinely gained is on the way back, not the way out** — the transcript renders the
submitted content as what it is, and that needs the *entry's* document to carry the block, which
is C23's business and not the buffer's. **Written down because the two halves read as one
feature and only one of them touches the prompt.**

##### The one place *one grapheme, N cells* actually bites

`layout.ts`'s `walk` is the single measurer — *one walk, for the reason there is one `cells()`*
— and `layout`, `displayRows`, `cursorCell` and `selectionSpans` all go through it. A chip is one
grapheme and draws as `[JSON · 47 lines]`, so `walk` measures the sentinel and the frame draws
the label: **that is the gutter's class and it is not circular.** A chip's width is its own
label's, fixed and independent of the terminal width, so `walk` needs a per-cluster width
function rather than a second pass — **one seam, and all four callers inherit it** because they
already share the walk.

##### The peek is the popup's sixth consumer and needs no ruling

`detail` with no choices — the `none` arm, already legal by A7's ruling and already the shape
the confirm, the completion menu and `agent-tui`'s question use. Named so it is not re-derived.

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

#### §8a · The walk, 2026-08-15 — and it needs both shapes

**The state machine is the obvious artefact and taking it alone is the recorded mistake.** A
submission arriving while something runs is event-mediated and wants a **trace**; what a
submission *is* — builtin, local, verb, view — is structural, holds at rest, and wants a
**table**. C19 needed both and had one, and its `--flag=value` defect was in the half it did
not build. Both are below.

**Where the seam is, measured before anything was designed.** `src/shell/execution.ts:365`
refuses today — `refuse(line, "${verb} is still running")` — and `Guard.release()` carries the
comment *every exit from `running` goes through here, including a stage failure*. **One
refusal site and one funnel** is the whole of what the queue attaches to, and it is why this
entry is smaller than its neighbours rather than larger. `inFlight` already reports the route
rather than a boolean, *for C16's Ctrl-C rung* — the entry's hardest question already has a
handle built for it.

##### The trace

| # | sequence | rules meeting | ruling |
|---|---|---|---|
| 1 | A runs · B submitted · A settles | I1, `release()` | B drains **in `release()`**, which is the only place every exit is guaranteed to pass |
| 2 | A runs · B submitted · A **fails** | I1, `release()` | B still drains. *Including a stage failure* is already written on the funnel, and a queue that survived success only would be the more natural bug |
| 3 | A runs · B submitted · **shutdown begins** | I12 | the queue is dropped and nothing appends. I12 precedes the guard in `submit` today and must precede the drain too |
| 4 | A runs · B, C submitted · A settles | I1 | **B only.** Strictly sequential is not an aesthetic: C sees the state B leaves |
| 5 | A runs · B submitted · B cancelled · A settles | I5, `release()` | nothing drains, and A's own settlement is untouched — the queue and the in-flight invocation are two subjects |
| 6 | A runs · a blank Enter | I1's first exception | nothing queues, silently. The `empty` check precedes the guard today and must precede the enqueue |
| 7 | A runs · B submitted — **when does B's entry appear** | I1, I28 | **immediately, as a queued entry that becomes live.** Below |
| 8 | A runs · B submitted · **Ctrl-C** | I5, C16's ladder | the stated ambiguity. Below |
| — | A settles · then B submitted | one rule | **not a row.** It is the path with no interaction in it, and it would restate `submit` |

**Row 7 is the one that removes this entry's dependency on 29.** The entry says *a queue you
cannot see is a queue you forget you typed into*, and the obvious reading is a chrome counter —
which is 29's contested budget, and 29 is last. It does not need one. An entry appended at
**submission** and made live at **drain** is one entry with two states, which is C13's
live-entry lifecycle and already exists. The transcript is where agent harnesses show it, the
entry itself says so, and reading it as a chrome row is what put 29 in front of it.

**Row 8 is step 9's class and C16's rung table is the precedent.** Two subjects under one key —
*cancel the running verb* and *clear the queue*. The first answer was two rungs by scope:
something running → cancel it and **leave the queue**; nothing running and a non-empty queue →
clear it. Disjoint by construction, no mode, two presses for an irreversible action.

**REVERSED 2026-08-15, BY BUILDING IT.** The two-rung answer needs a **held** queue — after the
first press, nothing is running and the queue is full, which is exactly the state rung 2 reads —
and **nothing restarts a held queue.** Every drain hangs off `Guard.release()`, and the release
that would have drained is the one the cancel just consumed. So the reader's options after one
press are: press again to discard the work, or submit something else, which then runs *ahead* of
items submitted before it and breaks the sequentiality this whole entry rests on. Take the other
branch and let the cancel drain, and rung 2 becomes **unreachable** — each press kills one item,
the queue is never non-empty with nothing running, and a rung no state can construct is C16's
own §8a finding arriving in the ladder written from it.

**So: one press stops everything the reader started.** `cancel()` cancels the in-flight
invocation *and* clears the queue, and each queued entry settles as cancelled rather than
vanishing. The cost the two-rung version was protecting against — *discarding work the reader
typed* — is paid by row 7 rather than by a second press: the entries are already on screen,
already have ids, and settle in place saying what happened to them. **The affordance the
alternative was buying was a second press; what it actually buys is a stall.**

This is the walk being falsified by the first thing that could falsify it. The rule interaction
it missed is not between two of its rules — it is between one ruling and the **funnel**, and
neither artefact shape indexes the mechanism a ruling depends on.

##### The table, and it is the half a trace cannot reach

| # | state | rules meeting | ruling |
|---|---|---|---|
| 1 | a `builtin` — `cd` — submitted while a verb runs | *a builtin needs nothing the guard holds* + *strictly sequential* | **it queues** |
| 2 | a `local` handler — `/help` — while a verb runs | the same pair | **it queues**, and this is the one that will feel wrong |
| 3 | a **view** invocation while a verb runs | C15's push + sequential | it queues; a view pushed out of order is a view over state its predecessor has not produced |
| 4 | nothing running, queue empty | one rule | not a row |

**Row 1 is why the table exists.** I5 refuses *whole-line and unconditionally*, and its own
comment says why: *a refused line that silently moved the working directory is a lie about what
the tool did.* A queue makes the mirror image available — a `cd` that **jumps** the queue
changes the directory every queued item afterwards runs in. Both rules are correct and neither
mentions the other, and no event sits between them.

**Row 2 is the residue, and it is named rather than ruled.** `/help` waiting behind a
thirty-second build is obviously wrong to a reader, and the tempting rule is *a submission
queues iff it can observe or change what a running verb can* — the **who is writing** axis, and
the same axis C13's patch gate needed. **It is inferred from two cases and has therefore been
tested against one.** C13's was re-founded three times and the third case broke it, so the rule
here is the conservative one — **everything queues** — and the axis is written down as the
question it is. It is reversible in the direction that matters: letting something jump later is
additive, and taking the jump away once someone relies on it is not.

##### Row 7's mechanism does not exist, and that is the third blocker

**Measured by building it, 2026-08-15.** *An entry appended at submission and made live at
drain* needs the drained submission's document to arrive at an entry that **already has an id**.
C13 has the operation — `append(doc, { streaming: true })` then `settle(id, doc)`, and
`execution.ts:904` already uses exactly that pair for the app route's pending entry. **What does
not exist is a place to put it.**

There is no single point at which a submission's document reaches the transcript. The section
above said *one refusal site and one funnel*, and that is true of **taking** the queue and of
**draining** it and false of the entry:

```
appendAndCommit          19 call sites
route's own arms          6, each appending its own document
the async runners         5, two of which append their pending entry
                             DIRECTLY rather than through appendAndCommit
```

So `into` — *settle here rather than appending* — has to be threaded through `route`,
`runLocal`, `runApp`, `runShell`, `runHandoff` and `runIntoView`, each site sitting under an
invariant (I1 one entry per submission, I3 the pending entry precedes the transport, I29 history
at settlement) that has to be re-read against the change. **That is a C23 seam change, not a
list in a file**, and it is the entry's third blocker — the first two being the two questions
§8a settled.

**The alternative was measured and refused.** A module-scoped *settle into this next time*
variable reaches every arm with no threading and is consumed by whichever `appendAndCommit`
fires first — a refresh notice, an identity notice, an action's refusal. That is a flag two
components can set where the codebase's own argument (`op: "expand"` over `viewState: true`)
says a named operation is the only unforgeable form.

**This is the class the walk keeps finding, in the walk.** C23 §8a A4's ruling assumed a delete
`ViewPatch` does not have; C04's `weights` deferral was met by a field its own doc named. Here
§8a row 7 named an operation that exists **and no seam to call it from**, and §8b then said *so
the build is mechanical* — a summary that kept the body's claim and dropped the condition making
it true, which is F86/F89/F92's mechanism arriving in a section written the same hour.

**What is unblocked by this**: nothing in §8a or §8b changes except the cost. The rulings stand,
including row 8's reversal, and the queue's two hard questions are settled. **What is owed**:
the `into` thread, as its own step, read against C23's invariants site by site.

##### And classifying the nineteen makes the seam narrower than the count does

**Asked before designing, and the answer moved the design.** The question is whether the arms
differ in *which document they compose* or in *when they append relative to the guard*, and it
is the second — which is the narrower variation, and it partitions the nineteen exactly:

| group | n | when, relative to the guard | carries `line` |
|---|---|---|---|
| not a submission | 4 | never takes it — an action's refusal, `notify`, a refresh notice, the greeting | **no** |
| synchronous in `route` | 5 | never takes it — usage, a parse error, a builtin, a failed builtin, invalid app validation | yes |
| terminal, inside a runner | 9 | taken, and released by the `finally` | yes |
| the refusal at the guard | 1 | **the site the queue replaces** | yes |

**So the fifteen are one thing: the document this submission produced, arriving at the moment
the submission is done.** They differ in which document and in whether an entry is already
open — `runApp` appends a pending one at C23 I3's step 3, and no other runner does. That is a
destination with two cases, which is what a target parameter is.

**And the thread is not new — it is already there, under another name.** `line` reaches every
one of the fifteen and no one of the four, because I29 needs it at exactly the sites that settle
a submission. **The population `into` has to reach is the population `line` already reaches**,
which turns *thread a parameter through six runners* into *widen a thread that is load-bearing
already*, with the compiler enumerating the sites.

**The four that do not carry `line` are the check that the partition is real.** A queued
submission must never settle into a refresh notice or the greeting, and the existing
`line === undefined` test already separates them — so the seam inherits its own guard rather
than needing one.

##### The seam was built, and it does not land alone

**Built and measured, 2026-08-15.** `Settle = { line, into }` replacing `line: string` on
`refuse`, `runShell`, `runHandoff`, `runLocal`, `runIntoView`, `runApp`, `start` and `route`;
`appendAndCommit` settling into `into` when it is set and appending when it is not. The
compiler enumerated **exactly the fifteen** the classification predicted, which is the
prediction being tested rather than restated, and the whole suite passed **unchanged** —
2968 rows, no test edited. A seam that changes no behaviour is what a seam should be.

**And that is also why it cannot be committed by itself.** `into` is `null` at every call site
until the queue exists, and a branch nothing reaches is A03 §2's vacuity class in code — the
thing this repo refuses in rules, refused in the same way here. So the seam lands **with** its
consumer or not at all.

**The near-miss is worth recording, because it looks like a second consumer and is not.**
`runApp` already does the `into` thing at `execution.ts:1045` and `:1062` — `settleWithDocument(
pendingId, doc)` then `recordHistory(line, doc)` then a commit — which is `appendAndCommit`'s
body with two deliberate differences: it does **not** `resetFocus`, because a settlement is not
an append and focus must not jump out of the entry the reader is in, and it commits
`"completion"` rather than `"input"`. Converting it would be a behaviour change wearing a
refactor's clothes, and the two differences are exactly the ones a green suite would not show.

**What is left of 33 is therefore one commit and not two**: C23's own ruling first — I5's
*disposition* moves from a refusal to a deferral while its property, *no part of the submission
takes effect now*, is what a strictly sequential queue preserves — then the seam, the list, the
drain and the four rows that assert the refusal today.

#### §8b · What the rulings are, and the build is a seam change rather than a list

- **The queue is a list in `src/shell/execution.ts` and nothing else.** No published type, no
  `TuiConfig` field, no chrome row. It touches `src/index.ts` not at all, which is what makes
  this buildable before the freeze without spending any of it. **The list is the cheap half and
  it is not the work** — see the row above: the entry needs `into` threaded through six
  runners, and that is a C23 seam change.
- **Enqueue replaces the refusal at the guard**, after I12's shutdown check and after `empty`,
  both of which precede it today for reasons that survive.
- **Drain happens in `Guard.release()`**, because it is the one place every exit is guaranteed
  to pass, and the comment saying so was written before this entry needed it.
- **One entry, appended at submission, live at drain**, so the queue is visible in the
  transcript and 29 is not a blocker.
- **Ctrl-C stops everything the reader started**: `cancel()` cancels the in-flight invocation
  and clears the queue, each queued entry settling as cancelled in place. Not two rungs — see
  row 8, which was ruled that way and reversed by building it.
- **Everything queues**, and the `/help` case is a named residue with its axis stated.

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

**Rewind / undo / redo is a different project** — it means every **transcript** mutation is
reversible, and none is. *Every mutation … and nothing currently is* was this sentence until
2026-09-03, and it was false at HEAD: the editor's mutations are reversible —
`src/interaction/editor/undo.ts`, two stacks, structural coalescing, `UNDO_LIMIT = 200` (C17 §6,
I11). What has no inverse is the transcript: C13 is append-only with eviction (`op: "evict"`,
C13 §5), `ViewPatch` has `append`, `replace`, `merge`, `status`, `expand` and `reserve` and no
delete (C04, C25), and `settle` freezes an entry (C23 I9). Rewind is those three reversed, which
is the same reversal of C13's shape that arc 7 (cell ordering) needs. Split these; do not let
the second block the first. SS54 R22 holds the narrowed premise: `UNDO_LIMIT` present.

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
hard       sankey (edge routing — the same problem as Mermaid layout) · 3D
           ← sankey RE-RULED 2026-09-03: the edge-routing premise expired twice (`graph`
             ships a layered router, `elkjs` is in the tree) and it is NOT a fold over
             `graph` — C12 §3d, *Sankey*. A new form over `graphLayers`, no consumer
           ← BUILT 2026-09-04 as `sankey`, C12 §3ap: the consumer arrived as C04 I92
             (`GraphEdge.weight`), and the form is `graphLayers` plus a placement and a
             drawing, as §3d predicted. SS54 R20 expired as designed and is removed; R21 stays
```

**3D was the `no` row, on *perspective in a character grid is a novelty, not a tool* — and
that is a fit argument asserted rather than measured.** Measured (F431): one surface and one
teapot-shaped solid at 80×24 cells, three arms. Four metrics said the braille dot grid held it
— 0.3% and 1.5% silhouette disagreement against the pixel truth, the handle's hole four dots
clear, 163 distinct shade levels of 186 — **and the picture disagreed with all four**, because
**6931 of 7254 lit dots are interior and every one of them is on**. A 3D form is not its
outline; a lid seam and the trough of a ripple are shading discontinuities, and the braille
channel is a constant inside the silhouette. On the **half-block** rung — `▀`, two full colours
a cell, a *quarter* of braille's samples — every structure the image arm has is there.

So it moves to `hard` for the reason sankey is there: **the 3D axis layout is the work.** The
renderer is a projection, a depth buffer and one light, and the last stage is `halfBlockRows`,
which already ships for images. `docs/notes/CALCIUM_3D_DESIGN.md` carries the design and entry
52 orders it.

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
- **heatmaps** for attention and confusion matrices. **The planned `colour → ░▒▓█` degradation
  is unsafe and is replaced**: `▒ ▓ █` are all `East_Asian_Width=Ambiguous`, so the fallback
  designed for the highest-value plot doubles in width wherever a terminal treats ambiguous as
  wide — a heatmap that stops being a grid. **The braille density ramp replaces it and is
  better on its own terms**: `⠀ ⠄ ⠆ ⠖ ⠶ ⠷ ⠿ ⣿`, eight levels against four, every one narrow.
  Measured with the rest of the ambiguous-width finding in entry 51
- **plots** for training curves — exists, wants the history buffer docker-tui is building
- **images** for sample outputs, once the image block lands

That package is most of the easy tier and it is what makes Calcium the obvious choice for
an ML platform's TUI.

---

## Fights the architecture — deliberately not doing

- **An embedded text editor.** `/tty vim` already hands the terminal over, vim runs, you
  come back — the handoff is built and correct. An embedded editor is a much larger thing
  for less.
- **Wrapping matplotlib** — above.

**3D plots were on this list and have been retracted, not deleted.** *Perspective in a character
grid is a novelty* was refused without measuring; the measurement overturned it (F431, above).
Recorded here rather than removed silently, because **a refusal that vanishes is one somebody
restores** — and because this list is the one `roadmap-status.mjs` cannot see: it skips every row
whose order column is `—`, so a refusal outliving its reason sits outside every gate. Entry 52.

---

## Order

```
BUILT 0  step 8                    docker-tui packaged — README, play environment, screencast, CI
PART  1  PHASE 1                   producer context · change axis · builder audit · the prompt
                                   ↑ serves both destinations, must precede the freeze
      2  prism-tui's first         experiment table · training curve · one live job
         surfaces                  ↑ the second consumer. (This said *b.live's stream arm's
                                   first*; the arm was deleted — F78, 2026-09-03 — see
                                   `src/shell/builders/types.ts`.)
PART  3  the ML package            tensors, heatmaps. TWO CORRECTIONS, 2026-08-15, and the
                                   first removes this entry's gate. *Built with prism-tui as
                                   the consumer* says who validates the design, not who has to
                                   exist first — and the stronger reading is false in the tree
                                   anyway: `examples/docker/src/container.ts` calls `b.plot`
                                   today, so the machinery this entry extends has a real
                                   consumer that is not prism. A GATE THAT WAS NEVER ONE, and
                                   3 therefore leaves the unchecked list. THE SECOND IS THIS
                                   ROW'S OWN CHECK, WHICH EXPIRED ONE COMMIT AFTER IT WAS
                                   WRITTEN: it recorded that no `CALCIUM_PLOT_PRIOR_ART.md`
                                   was in the repository, and
                                   `docs/notes/CALCIUM_PLOT_PRIOR_ART.md` has been there since
                                   6611f9f — the very next commit after fc5ff14, which wrote
                                   the check. Nothing re-read it, because NOTHING CHECKS A
                                   NEGATIVE CLAIM: check 1 resolves a marked row's citations
                                   and its verdict is inverted here, since resolution is what
                                   this sentence denied. `roadmap-status.mjs` now carries the
                                   arm that closes it. THE PLANNING PASS IS THE REAL BLOCKER
                                   and the document says so in its own header — *when roadmap
                                   #3 comes up, plan it before building it*: ~40 chart types
                                   listed, consumers named for about a dozen, so this entry
                                   could produce forty of F21's shape. Two of the five
                                   decisions it owes are public types, which puts the pass
                                   ahead of the freeze rather than after it
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
                                   surprising, but it is unruled and cheap to rule now.
                                   TWO OF THE THREE ARE ANSWERED, 2026-08-15. (a) is C26 §4b
                                   and §4c: elements are the unit of movement, the window
                                   follows, PgUp/PgDn move the window and not focus; and a
                                   boundary is a NEIGHBOUR question, not a direction — the
                                   sequence is the entry's, so a block's edge is not an edge.
                                   (c) is C26 I20: a fall-forward is a MOVE to a different
                                   element, so it lands in navigation, which is the rule
                                   focusRow already states. Vacuous until interaction has
                                   bindings, and said so. §4 IS SHORT OF NOTHING — both policy
                                   vocabularies are now checked, both fail on the same axis
                                   error, and §4d records that not one value of either has an
                                   inhabitant. (b) IS THE WHOLE REMAINDER and it is C16's, not
                                   §4's: the day a kind inside a pushed view declares
                                   `elements`, the view's n p g G pageup pagedown and the
                                   inner kind's arrows want the same keys at one target.
                                   BLOCKER CHECKED FROM THE SATISFIER'S SIDE AND IT IS NOT THE
                                   ONE ASSUMED: a table inside a view is constructible today —
                                   `documentView.fill(doc)` takes an arbitrary ViewDocument and
                                   `table` declares `elements`. What is missing is that NOTHING
                                   ASKS: `elementsIn` has exactly one caller, `liveElements` in
                                   `src/shell/construct.ts`, and it reads
                                   `stores.transcript.liveId`. So no element inside a view can
                                   be focused at all, and (b)'s key collision cannot occur until
                                   a second caller exists. Blocker as a symbol: `liveElements`.
                                   LIFTED 2026-09-03, C26 §4g: `elementsOf(entryId)` has three
                                   callers and the stored location names its entry; `tab`/`⇧tab`
                                   move between entries. (b)'s collision cannot occur for the
                                   reason given there and a second reason — `mergeBlock` places
                                   a colliding key at `interaction` rather than throwing (C16
                                   I27).
                                   (b)'s WALK IS RUN — C26 §4e, both artefacts — AND THE
                                   COLLISION CANNOT HAPPEN AT ALL: `activeTarget` returns
                                   `pushedView` whenever a view is open, BEFORE any element
                                   check, so a block inside a view never sees the key. Not two
                                   scopes binding the same keys — one scope taking every key.
                                   (b) needs a RUNG above `pushedView`, not a binding, and
                                   `FOCUS_ORDER` is the one artefact that would change. AND
                                   THE PRODUCER QUESTION HAS AN ANSWER THAT IS WORSE THAN
                                   *not yet*: A01 D4 sends a block's keys to `liveBlock`, so
                                   `Keymap.mergeBlock` is NOT interact's producer and there is
                                   no candidate for one. Either D4 changes or interaction
                                   mode's purpose is not handing the block its keys — a ruling
                                   upstream of C26. RULED 2026-08-15, C26 §4f: D4 STANDS and
                                   the mode is NOT empty. §2's justification — *the prompt does
                                   not compete* — is delivered by focus alone, since
                                   `activeTarget` returns `liveBlock` once focus is in the
                                   block. The mode's real subject is the keys `mergeBlock`
                                   REFUSES: it throws on a collision with `global` or with an
                                   existing `liveBlock` binding, so the ten liveBlock rows and
                                   the four global ones are closed to every adapter by
                                   construction, and interaction is the only rung where they
                                   are not. Real, expressible, UNINHABITED. §8b.8's refusal
                                   kept its condition — until a block needs a key liveBlock or
                                   global already binds — and the condition is MET BY
                                   MECHANISM 2026-09-03, C16 I27: a colliding key is merged at
                                   interaction and a free one at liveBlock, so mergeBlock no
                                   longer throws and the mode has a producer route. STILL
                                   UNINHABITED: `BlockKeymap` has no producer in `src/` (T2.6a
                                   holds). (b) IS CLOSED AS
                                   UNINHABITED rather than deferred — both halves need a
                                   consumer that does not exist and both triggers report
                                   themselves. ALL THREE QUESTIONS ANSWERED
BUILT 8  the scroll-anchor rule    small, real usability — or earlier, it is cheap
BUILT 9  mermaid (text path)       cheap once the dependency is vetted, distinctive.
                                   VETTED 2026-08-15 AND THE ANSWER IS WEIGHT, NOT SHAPE.
                                   `renderMermaidASCII` returns a grid of lines, so the block
                                   maps with no new mechanism and waits on nothing — 19 ms for
                                   a four-node flowchart, `useAscii` maps to C02's `unicode`,
                                   `colorMode: "none"` keeps colour with C10. But there is NO
                                   SUBSET IMPORT: the ASCII path IS the layout engine, so
                                   `elkjs` comes whole — 11 MB installed across three packages
                                   against `lowlight`'s approved 121 KB of a 9.2 MB package,
                                   and `elkjs` is EPL-2.0, which would be the first
                                   non-permissive licence in DEPENDENCIES.md. Ten releases in
                                   its first month, then nothing for five and a half. NOT
                                   ADOPTED AND BUILT 2026-08-15 — the refusal was a
                                   misapplied precedent, since `lowlight`'s 121 KB is evidence
                                   of a SUBSET IMPORT PATH rather than a size limit, and 11 MB
                                   of dev dependency is not a cost anyone ships. EPL-2.0 is
                                   file-level copyleft and depending on the package triggers
                                   nothing; it is DEPENDENCIES.md's first non-permissive row,
                                   recorded rather than treated as a bar. `mermaidCode` in
                                   `src/presentation/mermaid.ts`, published from
                                   `src/index.ts`, ONE CALL WIDE — the maintenance signal is
                                   the real risk, so a replacement costs a function body and
                                   the block, the capability mapping and T2.80–T2.83 survive
                                   it. `useAscii` is the WIDE arm as well as the ASCII one,
                                   which is C02 I9's tier arriving in a renderer that already
                                   had the switch
PART  10 question / menu primitive biggest unlock for agent UIs — lands inside the navigation model
BUILT 11 markdown                  translates to existing blocks. CHECKED 2026-08-15 AND THE
                                   GREP RESOLVES AGAINST SOMETHING ELSE: `markdown` is in
                                   `src/` — as a highlight.js LANGUAGE registered by C09's
                                   `code` block, `presentation/blocks/kinds/code.ts`. That is
                                   syntax colouring for a fenced markdown source, not a
                                   translation to blocks, and nothing turns a document into
                                   `notice`/`table`/`code`. Third instance of a sweep term
                                   resolving against an unrelated thing (29's `chromeRows`,
                                   44's `history/persist.ts`), and the reason the blanket
                                   claim *the symbols these entries name are absent* is wrong
                                   about this row while its conclusion is right.

                                   PLANNED 2026-08-15, AND THE SPAN HALF DECIDES THE SHAPE.
                                   MEASURED FIRST, because the mapping follows from it:

                                   (1) NO SPAN-LEVEL STYLING EXISTS IN THE VIEW MODEL. Tone
                                   attaches to a BLOCK, a Cell, a keyValue row, an events row
                                   or a pill — never to a run inside text, and there is no
                                   `{text, tone}[]` shape anywhere in
                                   `src/data/viewmodel/types.ts`. So inline emphasis is a NEW
                                   MECHANISM, not a mapping, and that is the entry's whole
                                   shape rather than a detail of it.

                                   (2) BOLD IS NOT A COLOUR AND SURVIVES 1-BIT. `MONO` in
                                   `presentation/theme/resolve.ts` is what a meaning palette
                                   collapses to at depth 1: emphasised → `{bold: true}`,
                                   deemphasised → `{dim: true}`. So the degradation question
                                   for bold does not arise — bold IS the 1-bit answer, at every
                                   depth, and no typographic fallback is owed.

                                   (3) ITALIC HAS NO REPRESENTATION AT ANY DEPTH. `Style` is
                                   colour · background · bold · dim · inverse · underline. That
                                   is a C10 public-type question, not a degradation one, and it
                                   needs a consumer before it is asked.

                                   (4) THE BLOCK HALF MAPS ALMOST ONE-TO-ONE, and every target
                                   exists: headings → `rule`, which already carries `label`;
                                   fenced code → `code`, language resolved by the 16 registered
                                   with highlight.js; tables → `table`; blockquote → `notice`
                                   with a glyph gutter, which `prefixCells` in
                                   `presentation/blocks/kinds/simple.ts` already draws for
                                   `notice` and `tip`.

                                   RULED, SIX THINGS:

                                   (a) SPLIT THE ENTRY. Block-level markdown is a mapping and
                                   lands with NO new type. Inline emphasis is a view-model
                                   change and is a separate entry. Landing them together
                                   conflates a translation with a vocabulary extension, and the
                                   second is the one that touches a frozen public type.

                                   (b) SHIP THE BLOCK HALF FIRST, INLINE AS LITERAL TEXT.
                                   `**bold**` renders as `**bold**`. It needs no mechanism, it
                                   is the same at every depth, a terminal reader already reads
                                   markdown source, and it is reversible — which is what makes
                                   it the right first answer rather than a placeholder.

                                   (c) NO ITALIC IN `Style` — **REVERSED 2026-08-15, AND THE
                                   RULING WAS PREMATURE IN TWO WAYS.** It read *bold takes
                                   `Style.bold` and italic takes `underline` or stays literal*,
                                   which DECIDED A FALLBACK BEFORE ANYTHING NEEDED ONE — and
                                   decided it onto a channel already spoken for: C10 §4a's own
                                   comment says *word-level emphasis is `underline`'s* (C25
                                   I10), so a diff's marker and a markdown emphasis would have
                                   been one attribute meaning two things. AND *no consumer* IS
                                   NOT AN ARGUMENT ABOUT A `Style` MEMBER: `Style` is what a
                                   renderer reads, not a published palette surface, and *there
                                   is none* was true of a field nobody could use BECAUSE IT DID
                                   NOT EXIST. `Style.italic` and `SgrStyle.italic`, SGR 3 in
                                   `escapes.ts` and nowhere else, T1.19/T1.19b and
                                   `tools/mutate/runs/c10-italic.mjs` — 3 mutations, 3 caught.
                                   NOT A `MonoClass`, and that is checked rather than omitted:
                                   `MONO` is the typographic fallback a PALETTE SLOT falls to,
                                   and a slot resolving to italic would be the framework
                                   deciding some tone is emphatic in a cursive way — which is
                                   the app-domain knowledge `PaletteSpec.classes` refuses. It
                                   survives every depth for the reason `bold` does: `sgr()`
                                   writes attributes unconditionally and consults no depth. At
                                   ASCII it renders as plain text, costs no cells, and NO
                                   TYPOGRAPHIC FALLBACK IS OWED

                                   (d) LISTS → `raw` WITH A MARKER, not a new kind and not
                                   `keyValue`, whose shape is label/value and not a bullet. The
                                   marker is a C09 glyph slot and never a literal (F6).

                                   (e) NO DEPENDENCY FOR THE BLOCK SUBSET, and this is NOT
                                   lowlight's shape. `lowlight` was taken because the domain is
                                   large and rendering is incidental — a lexer per language,
                                   180 KB measured. The markdown SUBSET an agent CLI emits is
                                   small and closed: ATX headings, fenced code, pipe tables,
                                   bullet lists, blockquotes, paragraphs. Scope it as that
                                   named subset rather than as "markdown", and a full CommonMark
                                   parser stays out by the entry's own terms. If inline spans
                                   later need CommonMark semantics — reference definitions,
                                   entities, emphasis precedence — the domain IS large there and
                                   the question is asked again with `micromark` as the candidate.

                                   (f) NO TABLE ALIGNMENT SYNTAX until a consumer asks.

                                   WHAT WOULD CHANGE (b): a consumer that needs emphasis
                                   RENDERED rather than literal. Then the view-model change goes
                                   first and the mapping follows it, in that order — the reverse
                                   builds a translator against a vocabulary that cannot express
                                   its output.
                                   THE INLINE HALF LANDED 2026-09-04, WITH 50: `inline` in
                                   `src/data/viewmodel/markdown.ts` — `**` → bold, `*` and `_`
                                   → italic, as `TextSpan`s over the marker-stripped text, on
                                   paragraphs, list items, quotes, headings and pipe cells and
                                   never inside a fence; a backtick run is literal and an
                                   unpaired marker is text. T2.33 and T2.34 replace T2.44.
                                   STILL PART, AND THE RESIDUE IS NAMED. (i) AND (ii)
                                   CLOSED 2026-09-04, the day after they were written —
                                   `DELIMITER` now takes one cell and requires a pipe, so
                                   `| h |` over `|---|` is a one-column table (T2.48), and
                                   inline code is an `identifier`-toned span now that
                                   `TextSpan.tone` exists (C04 I89, T2.33). WHAT REMAINS is
                                   (iii): heading levels, the quote gutter and the nesting
                                   cap, as before — none of the three has a symbol, because
                                   each is a decision about what to draw rather than a
                                   mechanism that is missing
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
BUILT 16 ONE POPUP ★             confirm · completion · peek · question are one mechanism with
                                   THREE parameters. C19's menu already has the flip, the
                                   selection and `… N more`; the confirm reimplements or lacks
                                   all of it. READ 2026-08-13 and it survives, with two
                                   corrections: the confirm REIMPLEMENTS the selection
                                   (`selected`, arrow cycling, its own marker) and LACKS the
                                   flip and `… N more`, so one half is a merge and the other
                                   two are additions. And the design's parameter list said
                                   TWO — onSelect, dismissable — while the two consumers
                                   differ on a third, PLACEMENT: the confirm is
                                   `{kind: "centred"}` at `src/shell/confirm.ts:234` and the
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
                                   src/. CALCIUM_POPUP_DESIGN.md §6.
                                   STEP 1 BUILT 2026-08-13: the choices are a table, so the
                                   marker is a slot and `capabilities` left ConfirmDeps with
                                   the character it was there for. STEP 2 BUILT: C15 I20 — a
                                   centred layer declares a width, refused at push AND at
                                   update, which found the tree's second instance
                                   (clearConfirmLayer declared none); and AskOptions gains
                                   `placement: "centred" | "anchored"` — a CHOICE between
                                   placements rather than a `Placement`, since anchored
                                   carries row/rows that only the session can compute.
                                   A7 ANSWERED and it is not a fourth parameter: an empty
                                   list is a construction error exactly when the list is the
                                   only path to the answer, which `resolve(text)` shows is
                                   not a partition over onSelect's four values.
                                   STEP 3 BUILT and it found TWO SHIPPED DEFECTS, both
                                   invisible to every assertion and both read from a frame.
                                   The compositor writes lines[0..height), so whatever an
                                   owner puts last is what it loses: C19's `+ N more` and its
                                   bottom edge were in the cut on EVERY occasion the
                                   indicator fired — a mechanism observable exactly never —
                                   and the remainder was wrong by the chrome it assumed was
                                   drawn. The confirm lost its CHOICES: measured on a 24-row
                                   terminal with a 20-row payload, the reader was asked a
                                   question with no [y], no [n] and no bottom border, keys
                                   still working. So C19 windows its own list (`menuWindow`)
                                   and the confirm drops its payload for `…` rather than
                                   appending an indicator that would be the first row lost.
                                   The FLIP needed nothing: `prefer` is already a field of
                                   the anchored arm alone, so the type said it without a
                                   comment. And the filed resize defect is fixed —
                                   `refreshAnchors` before the commit — read from the screen,
                                   since the menu sat at row 21 with the prompt at 37.
                                   STEP 4 BUILT — `createChoiceSelection`, and the walk had
                                   it right: the cycling was identical in both copies, so
                                   this is a store plus one SUPPLIED start rather than a
                                   merge. The start is never inferred, which is the safety
                                   argument: a store that guessed would pick 0, which passes
                                   every navigation assertion and puts a destructive confirm
                                   on `yes`. And `defaultChoice` now goes through
                                   `defaultStart`, because *the marked one, else the last*
                                   was written twice — a question that opens on `no` and
                                   escapes to `yes` is the worst possible pair. ENTRY CLOSED
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
BUILT 22 b.art — banners          sparse variants, fallback ends at styled text, and
                                   validation per variant. WALKED THEN BUILT 2026-08-15, and
                                   the walk moved it twice before a line existed. A CLASSIFICATION TABLE, not a
                                   trace: `art` is a pure function of spec, caps and width, so
                                   every interaction it has is structural. Row 3 is the cell
                                   the entry did not have — *a variant declares its tier* meets
                                   *the threshold is each variant's own measured width*, and
                                   selection is tier-eligible AND FITS rather than by tier
                                   alone. THREE OF THE FOUR VALIDATION CHECKS ARE NO LONGER
                                   THIS ENTRY'S: uniform width and row-count alignment are
                                   closed by roadmap 38's `fit` and `Valign`, measured cells is
                                   absorbed into selection, and only the tab check survives —
                                   `stripControl` keeps a tab by design and `cells` reads it as
                                   1 against the terminal's 8. A BUILDER RATHER THAN A KIND,
                                   on `mermaidCode`'s precedent, so the published vocabulary
                                   gains nothing before the freeze. The last rung is a `notice` because `raw` cannot
                                   carry a style — the operation was checked before the ruling
                                   was written down
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
BUILT 24 more default themes      two ship and `light` WAS dark-on-dark — CLOSED by 39, which
                                   is what unblocked this. ThemeSet is a two-field record, so
                                   more is a PUBLIC TYPE change — freeze-relevant.
                                   WALKED 2026-08-14, both artefacts, C10 §5a. THE FORK THE
                                   ENTRY DOES NOT DECIDE: a third theme is a third VARIANT or
                                   a NAMED SET, and it is a measurement rather than a
                                   preference. `"dark" | "light"` is written at NINE sites and
                                   every reader of `.variant` uses it as a KEY or as identity
                                   — five readers, all in store.ts, none in the ladder, the
                                   floors or resolveBackground, and no consumer in src/ at
                                   all. So the check that would have sent the fork the other
                                   way comes back empty. RULED: a named set, each theme
                                   declaring its own polarity. THE KEY BECAME A NAME THE
                                   MOMENT I25 LANDED — the keys were carrying "the background
                                   this assumes" and a theme now declares it, which is a field
                                   whose meaning was absorbed by something else. AND THE
                                   STRONGER FORM: polarity is DERIVABLE from
                                   luminance(surfaces.bg), so `variant` is a second record of
                                   a fact the tokens carry — and one NOTHING CHECKS: a theme
                                   declaring `light` over #000000 loads, resolves and clears
                                   every floor, because I9 compares tones TO bg and has no
                                   opinion about what bg is. Kept and checked rather than
                                   derived, since a token cannot express INTENT for a
                                   mid-luminance theme. THE ROW THAT WOULD HAVE SHIPPED is the
                                   /theme enum: FRAMEWORK_TOOLS is a module-scope constant
                                   with values ["dark","light"], so a named set makes
                                   `/theme high-contrast` a validation error for a theme the
                                   session HOLDS — visible in no diff, and every existing test
                                   asks for one of the two names the literal already has.
                                   Migration is NOTHING: the two literals stay valid names.
                                   AND THE CONTRAST SUITE'S COVERAGE SET IS A LITERAL IN THE
                                   TEST FILE — `const VARIANTS = ["dark","light"]`, looped for
                                   eleven rows including the 4-bit injectivity and floor rows
                                   this entry names as already-decided. A third theme ships
                                   unchecked and the suite stays green. C10 I27 I28,
                                   commitments 24–25, T1.20 T1.21 T2.22 T2.23, T6.24–T6.26.
                                   MECHANISM BUILT 2026-08-14, CONTENT NOT: the named set,
                                   the checked variant, the derived enum and the derived
                                   coverage set all ship and NO THIRD THEME USES THEM, which
                                   is F21's shape inside the entry that added it. 11
                                   mutations, 11 caught — and THREE SURVIVORS FIRST, each a
                                   gap rather than a false alarm: nothing covered the
                                   persisted guard's membership form (both names a literal
                                   knows are in the shipped set), nothing drove a third name
                                   through the HANDLER, and T2.23 WAS VACUOUS — asserting
                                   `VARIANTS` equals the set's keys is satisfied by the
                                   literal for exactly as long as the set has two members, so
                                   the row passed against its own defect and would have
                                   started failing at the moment it was meant to protect. It
                                   is now a source assertion, with its limit stated.
                                   HIGH-CONTRAST SHIPPED 2026-08-14 AND CLOSES THIS ENTRY —
                                   the set's first consumer, a third THEME declaring `dark`,
                                   which a set keyed by variant could not have held beside
                                   the first. AUTHORED TO THE FLOORS RATHER THAN ADJUSTED
                                   UNTIL THEY PASS, which is the distinction the entry
                                   wanted: every value is solved for the lowest lightness
                                   meeting 7 : 1 — AAA — against both grounds, on pure black,
                                   and every floor passed on the first run. `muted` is the
                                   slot it exists to answer: 2.14–2.42 on light against every
                                   candidate wash and under its own 2.5 floor, and 7.93 here
                                   while still quieter than dim at 12.4 and default at 21 —
                                   recessive and readable were in tension on #fafafa and are
                                   not on #000000. TWO THINGS IT FOUND. The 7 : 1 promise is
                                   NOWHERE EXPRESSIBLE: FLOORS is a minimum, so a theme that
                                   promises more cannot declare it and one test row is all
                                   that holds this one to it — a per-theme floor is named as
                                   the next theme's argument rather than widened for the
                                   first. And the diff surfaces keep the framework's floors,
                                   because at 7 : 1 the darkest of the twelve admits a ground
                                   of luminance 0.006 — 21 units of one channel, a rounding
                                   error with a hue. At 4-BIT THE CLAIM STOPS: the values are
                                   the emulator's, so only DISTINCTNESS survives, which is
                                   the rung an accessibility theme most owes and can least
                                   guarantee. A01 A.1, C10 T2.24; 15 mutations, 15 caught
PART  25 ghost text ★            drawn since PR #27. What remains: it ghosts only a SOLE
                                   candidate, which is when the hint is least needed, and it
                                   is static-only. 40 (as-you-type) is BUILT, so *design with
                                   as-you-type* has expired (2026-09-03): `ghost()` in
                                   `src/interaction/completion/engine.ts` is still
                                   sole-candidate. Design the two together — one hint, two levels
      26 view trace in transcript a full-screen view leaves no record. Append on push, PATCH on
                                   pop — sidesteps B03's no-trace-on-pop ruling, one entry, D7
                                   intact. And ⏎ to re-enter is nearly free. RE-CHECKED
                                   2026-08-15 and unmoved, with the evidence exact rather than
                                   blanket: a successful push touches the transcript on NO
                                   path. THAT SENTENCE EXPIRED 2026-08-16, and by roadmap 33
                                   rather than by anything done to this entry: a DEFERRED view
                                   invocation owns an entry before it runs, so `runIntoView`
                                   settles it — `<verb> opened a view`, muted, carrying the
                                   continuation mark — and the comment that WAS the evidence is
                                   the comment that had to change. The entry stands and the
                                   argument narrows: no patch on pop, no `⏎` to re-enter, and a
                                   view pushed DIRECTLY still leaves nothing. Symbol:
                                   `documentView.open`
PART  27 syntax highlighting ★    a REGRESSION against C09 §4a, not a scoping choice — the spec
                                   promises "highlighted whenever someone registers it" and there
                                   is no someone. 24 mainstream = 180 KB, measured. Phase-1-shaped
BUILT 28 prompt cursor-following  the window exists and is tail-anchored; the fix is threading
                                   cursorCell, which the code already names. AND THE ROW WAS
                                   RIGHT ABOUT THE JOB AND WRONG ABOUT THE SIZE: threading it
                                   uncovered TWO SHIPPED DEFECTS AT REST — the terminal cursor
                                   drawn ON the elision marker, and a selection span washing
                                   it — from ONE comparison, membership tested in painted
                                   coordinates where a marker row and a content row are the
                                   same kind of number. Both measured in a frame; neither
                                   visible to any assertion, because every number agreed with
                                   every other. C22 §6e, I62, commitment 33
BUILT 29 chrome row budget        one row each by design, and FIVE features now want it: the
                                   mode indicator, elapsed time, the queued count, region
                                   separators (37) and now WHERE IN THIS CONTAINER AM I (46),
                                   which is the scrollbar at container scope rather than
                                   transcript scope. Rule once — chrome-as-blocks pairs with
                                   b.row. RE-CHECKED 2026-08-15 FROM THE SATISFIER SIDE and it
                                   has NOT moved: `setMode` has exactly one caller in `src/`
                                   and it passes `"navigate"`, so the mode indicator would
                                   display a value that cannot change — and that is RULED
                                   rather than missing (C26 §8b.8: `⏎` does not enter
                                   interaction while the mode has no bindings and
                                   `Keymap.mergeBlock` has no caller). The queued count no
                                   longer waits on 33: 33 closed that question and rules the counter not
                                   owed (2026-09-03). So 29 is still a slot with nothing to put in
                                   it, and the reason is now a grep rather than a memory.
                                   RE-CHECKED A THIRD TIME 2026-08-15, unmoved, and a SIXTH
                                   consumer arrived: entry 15's boundary ruling wants a
                                   selection row count — *selected 40, copied 400* — and the
                                   readout it would sit on DOES NOT EXIST IN ANY FILE (F161).
                                   **SIX FEATURES WANT THIS ROW AND NOT ONE OF THEM CAN
                                   LAND**, which is a different fact from *open*: the entry
                                   is not waiting on a decision, it is the place six separate
                                   deferrals have come to rest. FOURTH CHECK, 2026-08-15, AND
                                   IT MOVED — DOWNWARD. The mode indicator is not a consumer
                                   waiting on this row: C26 §4e finds interaction mode has no
                                   CANDIDATE producer, because A01 D4 sends a block's keys to
                                   `liveBlock` rather than to `interaction`. So its second
                                   value is blocked on a ruling upstream of C26 and not on a
                                   chrome row. FIVE consumers, not six, and the row is asserted
                                   rather than described: T1.3j scans `src/` and expires the
                                   day anything sets `"interact"`. RECONCILED 2026-09-03: the
                                   count was four here (§Chrome is one row each), five, six
                                   and five in this entry, six then seven in
                                   `docs/design/AGENT_TUI_DESIGN.md`. ONE LIST, kept here:
                                   FOUR roadmap consumers — elapsed time (35), region
                                   separators (37), where-in-this-container (46), the
                                   selection row count (15) — the queued count having left
                                   with 33 and the mode indicator with the fourth check.
                                   RULED AND BUILT 2026-09-05 — C22 §6k, I79, I80,
                                   commitments 50–51; `TuiConfig.chrome.footerRows` in
                                   `src/shell/types.ts`, resolved in `src/shell/config.ts`,
                                   honoured by `compose`/`heightsSum` in `src/shell/frame.ts`
                                   and drawn on `footerRows` rows by `src/shell/paint.ts`.
                                   The budget is DECLARED PER SESSION, default 1, at most
                                   `MAX_FOOTER_ROWS` = `MIN_ROWS − 1 − ⌊MIN_ROWS/2⌋ − 1` (6),
                                   derived from the size gate rather than chosen; a `ChromeFn`
                                   returns blocks and never a height (the per-frame option was
                                   walked in §6k.3 and refused). The default frame is
                                   byte-identical (T3.36). WOULD LANDING THIS CLOSE IT: 35, 37
                                   and 15 each wanted a chrome row and now have one to ask for
                                   — closed AS A BUDGET, each still owing its content; 46 is a
                                   scrollbar at container scope, wants no chrome row, and is
                                   RE-FILED out of this entry (F739). Residue, named: the
                                   activity region A7 is a fifth region and not a footer
                                   (symbol: `Composed.activity`, absent); `footerRows: 0` is
                                   not offered (§6k.4 E); `construct.ts:652` still calls
                                   `initialRegionHeight(size)` without the budget and the
                                   first frame corrects it by `footerRows − 1` rows (I34,
                                   T1.37).
                                   PLUS TWO from the agent-tui design, which are not roadmap
                                   entries: the activity region (§3 A7) and the three-line
                                   footer (§3 A8). Every other document points here.
PART  30 paste as a chip          Claude Code's idea; Calcium can reference a BLOCK rather than
                                   a string, so the transcript renders what it actually is.
                                   MEASURED 2026-08-15 IN §8a, no code. Bracketed paste IS
                                   detected — `decode.ts` carries both machines and a
                                   `PasteState` — so the entry's own pre-design check is
                                   answered. EVERYTHING IN C17 INDEXES BY GRAPHEME, so a chip
                                   occupying one changes nothing in motion, deletion, word
                                   jumps or the selection anchor: one grapheme to the editor, a
                                   block to the renderer. THE BUFFER STAYS A STRING, and that
                                   is the finding — `editor.text` leaves C17 as a string at
                                   seven sites, so a structured buffer is a change to C19, C20,
                                   C22 and C23 before one chip is drawn, while a sentinel plus
                                   a side map is C17-local and reversible — BUT NOT BY
                                   RESOLVING IN THE `text` GETTER, which is §8a's correction:
                                   THREE OF THE SEVEN READ A BUFFER INDEX ALONGSIDE THE STRING
                                   (`contextAt` three times, `selectionSpans`), so a resolving
                                   getter disagrees with `cursor`, `anchor` and `head` the
                                   moment a chip precedes one — completion at the wrong offset
                                   and the wash on the wrong run, both only in a frame. A CHIP RESOLVES TO
                                   ITS CONTENT AT SUBMISSION, and the tree makes that forced
                                   rather than likely: `construct.ts:1215` hands C23 a string,
                                   C18 classifies a string, C20 stores strings, and the far
                                   side receives argv either way. The *render it as what it is*
                                   half is the ENTRY's document, which is C23's business and
                                   not the buffer's — two halves that read as one feature.
                                   `layout.ts`'s `walk` is the one place *one grapheme, N
                                   cells* bites, and it is not circular: a chip's width is its
                                   own label's, so `walk` takes a per-cluster width function
                                   and its four callers inherit it
PART  31 completion ranking       prefix-matched and unranked today. Recency-first is nearly
                                   free (C20 has it) and is the most-felt. RANK BEFORE
                                   as-you-type, or the menu is worse for opening itself
      32 prefix-out / defaultRoute      prefix-IN is expressible and CommandPolicy is reachable
                                   (retracted — F89). Prefix-OUT is not: prose by default, verbs
                                   by exception. A RULING on defaultRoute, not a config field
BUILT 33 QUEUEING ★              submit while something runs — a stated must. Small queue,
                                   real rulings, and Ctrl-C is ambiguous the way step 9's was.
                                   WALKED 2026-08-15 IN §8a-§8b, with no code, and it needed
                                   BOTH SHAPES: the trace for what happens while something is
                                   in flight, the table for what a submission IS. The seam is
                                   one refusal site — `execution.ts:365` — and one funnel,
                                   `Guard.release()`, whose own comment already says every exit
                                   passes through it. IT NEEDS NOTHING OF 29: an entry appended
                                   at submission and made live at drain is C13's live-entry
                                   lifecycle, so the queue is visible in the transcript and the
                                   chrome row a counter would want is not owed. Ctrl-C answers
                                   BY SCOPE — running → cancel it, nothing running and a queue
                                   → clear it — REVERSED 2026-08-15 BY BUILDING IT, because
                                   the two-rung answer needs a HELD QUEUE and nothing restarts
                                   one: every drain hangs off `Guard.release()`, and the release
                                   that would drain is the one the cancel consumed. The other
                                   branch makes rung 2 unreachable. So one press stops
                                   everything the reader started, and row 7 is what pays for it
                                   — the entries are on screen and settle as cancelled rather
                                   than vanishing.
                                   AND ROW 7'S MECHANISM HAS NO SEAM, measured by building
                                   it: C13 has `append(streaming)` + `settle(id, doc)` and
                                   `execution.ts:904` already uses the pair, but a submission's
                                   document has NO SINGLE ARRIVAL POINT — `appendAndCommit` has
                                   19 call sites, `route` has six arms each appending its own,
                                   and two async runners append their pending entry directly.
                                   So `into` threads through six runners under I1, I3 and I29,
                                   which is a C23 SEAM CHANGE rather than a list, and §8b's
                                   *the build is mechanical* was a summary that dropped the
                                   condition making it true. THE RULINGS STAND; only the cost
                                   moved. THE RESIDUE IS `/help` QUEUEING behind a long build: the
                                   tempting rule is the WHO IS WRITING axis, it is inferred
                                   from two cases, and C13's was re-founded three times before
                                   the third case broke it — so everything queues and the axis
                                   is written down as a question. BUILT 2026-08-15 IN ONE
                                   COMMIT, in the order the seam demanded: C23's I5 first —
                                   the mechanism moves from a refusal to a deferral and THE
                                   PROPERTY IS UNCHANGED, *no part of the submission takes
                                   effect now* — then `Settle`, the list, the drain and the
                                   rows. TWO SITES THE COMPILER COULD NOT CHECK, and both were
                                   found by running rather than by reading: `runApp` appends
                                   its own pending entry at I3 step 3, so it must REUSE the
                                   queued one or the queued row lives for ever with a second
                                   beneath it; and `enqueue` appends OUTSIDE the funnel's
                                   catch, so a throwing transcript escaped `submit` — C23 I2
                                   admits no escaping failure and T1.46 is what found it
                                   RE-CHECKED 2026-08-15: no queue of any kind in `src/shell/`
                                   — the word does not appear. Blanket claims are what the
                                   grep-reach signal counts, and this one is exact because the
                                   entry names a structure rather than a symbol: there is
                                   nothing to grep FOR until it exists, which is the shape the
                                   signal reports rather than gates
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
PART  36 scrollbar + edge markers the terminal cannot provide one (alt screen has no scrollback)
                                   and C14 already has the numbers. The edge marker is the cheap
                                   half and may matter more than the bar. AT CONTAINER SCOPE
                                   (46) it is one cell of the container's own width, not a
                                   second bar in the frame's reserved column, and ONLY THE
                                   FOCUSED CONTAINER FILLS IT — reserve always, fill on focus,
                                   which is the focus gutter's trick and keeps width constant.
                                   CHECKED FROM THE SATISFIER'S SIDE 2026-08-15, AND THE
                                   CONTAINER HALF IS ANSWERED IN A DIFFERENT SHAPE: 46 shipped
                                   with C04 I49, a RESIDUE ROW — `⋯ N above, M below`, both
                                   directions, one row, condition on `(block, width)` and never
                                   on the offset. So *a bounded region says what it is hiding*
                                   is already answered at container scope, in a row rather than
                                   in a column. What is left here is POSITION rather than
                                   existence — where in the content you are, which the row does
                                   not say. THE CONSTRAINT THAT FOLLOWS: a container-scope bar
                                   must read from I49's numbers or replace the row, never sit
                                   beside it. Two mechanisms answering *is there more* at one
                                   scope is the two-sources-for-one-fact shape C04 I50 refuses
                                   for `copy`. Symbol: `residue` in
                                   `src/presentation/blocks/glyphs.ts`
                                   so the cache stays safe. Mouse: click-to-seek and drag are
                                   plumbing that exists (Placed hit-testing + elements' row
                                   ranges) with no affordance; the WHEEL is the new one and it
                                   resolves BY POSITION where focus resolves BY FOCUS, so the
                                   two devices can legitimately disagree about which container
                                   a gesture addresses. And copyMode turns tracking off, which
                                   kills the wheel — another argument that terminal-native
                                   selection and inner scroll are in tension
      37 region separators        the prompt bracketed on BOTH sides, header/footer optional and
                                   bracketed with them. THIS ROW WAS STALE AND ITS OWN PROSE
                                   WAS NOT: it said "C10's no-background choice means a drawn
                                   line is the only tool available", which entry 39 makes
                                   false — a theme may declare `background: "surface"`. The
                                   entry's body already carries the correction and reaches
                                   the same conclusion by the surviving half: `"terminal"`
                                   stays legitimate and a transparent terminal has no fill,
                                   so a separator cannot depend on one. The summary kept the
                                   claim and the body kept the condition, which is the
                                   compression class in a row rather than in prose.
                                   RE-CHECKED 2026-08-15 FROM THE OTHER SIDE — *was the row
                                   fixed, or only the body* — AND THE ROW CARRIES IT. That is
                                   the question worth asking of every correction this session
                                   made, because F86/F89/F92 are three instances of a
                                   retraction that reached a body and not the summary above
                                   it. This one reached both
BUILT 38 horizontal composition   b.row — the banner already paid for its absence by hand
                                   (width fractions ship with it; height fill is separate and
                                    waits on phase 1.1's producer-context contract).
                                   WALKED 2026-08-14, C04 §3 — a classification table and a
                                   STATED DECISION not to write a trace: layout is pure over
                                   (block, width), nothing accumulates, and a resize is the
                                   same table at a second width. FOUR CORRECTIONS. (1) `b.row`
                                   IS TAKEN — it builds a TABLE ROW and every example calls
                                   it, so the feature is a field on `group` and always was:
                                   C04 §3 deferred WEIGHTS, not a container. (2) THE
                                   CONTAINER SHIPS: b.group("row", …) measures, splits and
                                   drops what does not fit, and its equal split is a ruled
                                   policy with a stated expiry — "add weights when a surface
                                   needs them, and not before". The surface needed them: the
                                   banner is 15/1/61 against a 38/38 split, could not say so,
                                   and hand-composed a raw block. Third deferral this session
                                   whose condition was met elsewhere. (3) C11'S PRECEDENT
                                   CANNOT BE FOLLOWED, and the entry says to follow it
                                   exactly: Column.flex is a BOOLEAN over a content-derived
                                   minimum, and a group knows measure(block,width)→height and
                                   NO PREFERRED WIDTH — nothing to absorb residual from, so a
                                   proportion is the only expressible allocation. The two
                                   share a name and not a mechanism. (4) F37 IS STALE:
                                   ProducerContext.height is number|null, non-null iff the
                                   document is bound by a region — exactly the pushed-view
                                   case the entry names — so height:"fill" is unblocked and
                                   is a step of its own, as `padding` is. AND direction:"row"
                                   HAS NO CALLER anywhere: six b.group sites, every one
                                   "column". C04 I42 I43, commitments 39–40, T1.20,
                                   T3.16–T3.19, T6.20–T6.22.
                                   WEIGHTS BUILT 2026-08-14 — `flex?: readonly number[]` on
                                   Group, refused at the builder AND the validator for 0,
                                   negatives, non-finites and a length mismatch. 7 mutations,
                                   7 caught, AFTER TWO SURVIVORS THAT WERE BOTH FINDINGS
                                   ABOUT MY OWN ROWS: the by-position fixture could not
                                   construct the difference — shares always sum inside the
                                   budget, so nothing drops until the floor raises one, and
                                   among floored children every width is 1, so the two rules
                                   diverge only where a wide child sits beside several
                                   floored ones, and the fixture was SEARCHED FOR rather
                                   than guessed — and the validator row passed on a document
                                   already invalid three ways over, so ok===false held
                                   whatever flex did. AND R5 WAS CORRECTED BY THE CODE: the
                                   remainder is UNSPENT, as it is today, because giving it
                                   to the leftmost contradicts R4 and would make [1,1]
                                   differ from absent — the trap the equal-weights row
                                   exists to catch. THE BANNER DOES NOT CLOSE: two
                                   multi-line raw blocks DO compose side by side, measured —
                                   but the whale is padded to a fixed 40 with a fixed 4-cell
                                   gap, and a proportion cannot pin a cell count, so the gap
                                   widens with the terminal. The measured consumer needs a
                                   FIXED width and weights are a ratio — R1's finding
                                   arriving as a consequence, and the next argument.
                                   INTRINSIC WIDTHS BUILT AND THE BANNER CONVERTED
                                   2026-08-14 — `Share = number | {cells: n}`, fixed taken
                                   off the budget before any weight, and PLACEMENT
                                   UNCHANGED: a fixed child that does not fit is dropped
                                   like any other, because privileging it would make the
                                   rendered set depend on a declaration rather than on the
                                   author's order. Allocation and placement answer different
                                   questions, so the fork was not one. THE ACCEPTANCE TEST
                                   IS THE BANNER'S OWN FRAME: `bannerRow` renders IDENTICAL
                                   to the hand-composed golden in DOCKER_TUI_BANNER.md at
                                   120 columns, and the dashboard now builds it — so
                                   `direction: "row"` HAS A CALLER and F21's shape is closed
                                   in the entry that added it. 11 mutations, 11 caught; five
                                   ANCHOR MISSES first, which the harness names distinctly
                                   from survivors — the earlier half's anchors moved when
                                   this one landed.
                                   ALIGN BUILT 2026-08-14 AND RULED AS TWO AXES, BUILT AS
                                   ONE. The vertical axis has the shipped consumer: the
                                   wordmark's BLANK FIRST ROW is bottom alignment written
                                   into the art, the same way the padded whale was a fixed
                                   width written into it — and the container reproduces it,
                                   asserted both framework-side (T3.22) and against the
                                   banner's own golden (K6). THE HORIZONTAL AXIS DOES NOT
                                   EXIST: every renderer fits its output to the width it is
                                   handed, so a child allocated ten cells emits ten-cell rows
                                   and aligning a ten-cell box inside a ten-cell one is a
                                   no-op — measured. Placing it would need the content's own
                                   width, which measure(block,width)→height does not answer.
                                   R1 A THIRD TIME: heights are measurable and widths are not.
                                   AND A FOURTH DEAD GUARD, the first I added myself: an
                                   explicit height passed to the aligned child, justified by
                                   a true sentence about justifyContent and diagnosed against
                                   a STALE dist/ — the child already stretches, which the
                                   file's own comment says twenty lines below. PADDING IS
                                   RULED AND NOT BUILT: it would give a document two ways to
                                   say "a blank row above", so if it lands `gapBefore` becomes
                                   its top edge — and the note is on `gapBefore` rather than
                                   in this entry, because a condition written beside the
                                   deferral is the one nobody reads. HEIGHT:"fill" IS
                                   UNBLOCKED AND UNBUILT, with a reason rather than a
                                   deferral: its only consumer is S3's dashboard figure, and
                                   a feature whose consumer is a drawing is F21's shape —
                                   which is what this entry just spent two steps closing.
                                   C04 I45, commitment 42, T3.22–T3.23, T6.25–T6.26
BUILT 39 theme background ★      RULED: theme declares `background: "terminal" | <colour>`, user
                                   overrides with `/theme <theme> --no-bg` (a FlagDef, free in
                                   --help, per-invocation not sticky; warn and comply). Painting
                                   makes
                                   C10's contrast floor provable rather than assumed against a
                                   guess; inheriting preserves transparency. The light theme
                                   paints, because it cannot work otherwise. Shares row-padding
                                   with selection's wash. Plus: /help's verb list came
                                   back empty — both found by looking
                                   WALKED 2026-08-14, BOTH ARTEFACTS — C10 §4c (structural:
                                   a declaration, a surface, a depth and an override all
                                   hold at rest) and C22 §6g (event-mediated: what the next
                                   frame writes). FOUR CORRECTIONS TO THE RULING, none of
                                   which changes what it decided. (1) THE DECLARATION IS A
                                   CHOICE, NOT A COLOUR: `<colour>` is a second source of
                                   truth for `surfaces.bg`, the one surface every floor is
                                   already measured against, so a theme could paint one
                                   value and prove its floor against another — this entry's
                                   own defect from the other side. (2) PROVABILITY IS A RUNG
                                   OF THE LADDER, NOT A BRANCH OF THE DECLARATION: provable
                                   at 24, provable against the cube's defined RGB at 8 and
                                   the floor must be recomputed against the QUANTISED value,
                                   best-effort at 4 where the index is the emulator's, and
                                   vacuous at 1 where nothing is painted AND nothing is
                                   coloured. The override is one clause of four and the
                                   only optional one. (3) THE SHARED PADDING IS ALREADY BUILT AND
                                   OWED BY NEITHER ENTRY — `exact()` predates both and 23's
                                   wash consumes it — and what the two actually share is one
                                   layer down: a wash is a span, a background is a default,
                                   and every reset returns to the TERMINAL's default. Four
                                   reset sites, measured, one in L1. (4) READING `--no-bg`
                                   IS A PUBLIC TYPE CHANGE: declaring it is free and free in
                                   --help as claimed, but a local handler sees argv with
                                   `shellOnly` flags stripped and its only other surface is
                                   the line as typed — so `LocalContext` gains the validated
                                   args, which is freeze-relevant and closes /theme's own
                                   re-derivation of an argument validation had parsed.
                                   AND ONE DEFECT THE TRACE FOUND: `/theme light --no-bg`
                                   then `/theme light` commits NO FRAME, because setVariant
                                   is a no-op when the variant is unchanged and the flag is
                                   a SECOND AXIS on the same command — every assertion about
                                   the state passes and the background does not come back.
                                   Plus I57's four-bytes-a-row prefix, kept on asymmetry
                                   against a failure never observed, stops being inert on
                                   the day this lands and is what makes reset-then-base
                                   expressible. C10 §4c I25 I26, C22 §6g I65 I66
                                   BUILT 2026-08-14, AND THE CODE CORRECTED THE
                                   WALK THREE TIMES. (1) THE REPAIR SET IS NOT
                                   `SGR_RESET`: L1's rows carry no full reset at
                                   all — Ink closes a foreground run with `39`,
                                   which a base survives, and a BACKGROUND run
                                   with `49`, which returns it to the TERMINAL's
                                   default and is what a patch row ends with. The
                                   walk counted the sites that write `0m`; the
                                   property is *returns a channel to the
                                   terminal's default*. Found by checking a
                                   fixture against the thing under test — a
                                   notice row was the first draft and carries no
                                   reset. (2) FOUR SITES, ONE REPAIR: by the time
                                   a row reaches the painter every reset it holds
                                   is inside that string, and render-frame's
                                   prefix is answered by the row's own leading
                                   base. (3) NO LIFECYCLE CHANGE: the walk ruled
                                   a reset at suspend() and release() on the
                                   cursor's third-category path — right about the
                                   hazard, wrong about the remedy. A row that
                                   CLOSES ITSELF makes the escaping attribute
                                   unreachable for the same four bytes and covers
                                   exit, fault, signal and handoff at once. A
                                   shape is terminal state; a base is bytes in a
                                   row, and that is where the two part.
                                   13 mutations, 12 caught, 1 listed survivor
                                   with its reason — reading the variant from
                                   argv is a DUPLICATION REMOVED rather than a
                                   defect fixed, since `shellOnly` and the args
                                   read are each sufficient and only the pair is
                                   lethal. The pass also found T1.23's assertion
                                   VACUOUS in its first form: it skipped the last
                                   part of the split, which is everything when a
                                   row holds one occurrence, so both mutations it
                                   exists for survived sixteen passing
                                   assertions. And SS14 caught the repair pattern
                                   living in the painter rather than in
                                   escapes.ts, on its first run
BUILT 40 as-you-type completion    the trigger, not the engine — and it makes the manifest
                                   claim visible. Largely subsumes the next line
BUILT 41 typo detection            trivial, delightful — smaller once 40 lands. BOTH BUILT, and
                                   both found by the sixth sweep because NEITHER NAMES A
                                   SYMBOL — a grep sweep passes over an entry with nothing to
                                   grep and records a confirmation it did not make
PART  42 rebindable keys          precedence ladder (framework < app < user), not a refusal —
                                   a user override IS a collision. Unbind is `action: null`, a
                                   VALUE not an absence, and it falls through to the next rung.
                                   CHECKED 2026-08-15 AND THE SEAM ALREADY EXISTS:
                                   `createKeymap(bindings)` takes the list rather than owning
                                   it — `src/interaction/router/keymap.ts` — with exactly one
                                   caller passing `defaultKeymap`, `src/shell/construct.ts`.
                                   So this is not *the table is hard-coded*. Two things are
                                   missing and they are different sizes: the conflict rule
                                   THROWS on a duplicate (`KeymapError`, same file), which is
                                   the refusal this entry says must become a ladder; and no
                                   config surface carries overrides. Symbol: `createKeymap`
PART  43 images (kitty)            designed already; unlocks mermaid HD + ML samples
BUILT 44 session resume            tractable half of the persistence story. RULED: a resumed
                                   session opens at the BOTTOM and restores no scroll offset,
                                   no container offset and no focus. C23's rule from the shared
                                   pollers work — per-part state is view state only, anything
                                   that accumulates belongs in a derivation — and an offset
                                   accumulates nothing, so it is dropped freely and the reader
                                   gets the newest thing. Stated so it is not re-decided and
                                   nobody builds persistence for it
BUILT 45 configurable cursor       shape is DECSCUSR and the TERMINAL draws it, so it is a
                                   capability-gated escape that degrades by being ignored.
                                   Blink is a state machine no terminal offers — steady on a
                                   keystroke, blinking after N ms — and the refresh driver
                                   already owns the clock. RULED: per focus target, not
                                   global. Placed.cursor is per layer (C15 I19), so a bar in
                                   the prompt and a block in a pushed view is legitimate and
                                   one global setting forecloses it
BUILT 46 SCROLLABLE CONTAINERS     a container scrolls IF IT IS FOCUSABLE and its content can
                                   exceed its declared height — so scroll follows focus, and
                                   row/panel/group are excluded (no declared height, nothing
                                   to focus). SHIPPED as the scroll kind: a declared height,
                                   an offset held by L4 as view state, PgUp/PgDn at the
                                   liveBlock target, and the offset as the render cache's
                                   fourth axis. Five consumers — the prompt (28), the
                                   completion menu, a paste chip's peek (30), a live block, a
                                   pushed view's inner blocks — and the render cache key WAS
                                   wrong
                                   the day one scrolls (13). Selection across a scrolled
                                   boundary is the part that needs ruling, with 15.
                                   WHEN TO REACH FOR ONE, because a container is a choice to
                                   hide content and after C04 §3c cell 6 it hides it
                                   until focused — C26 §4g; a settled scroll is aimed with
                                   `⇧tab` and paged with `PgUp`/`PgDn`: a bounded
                                   region where BOUNDING IS THE POINT — a view, the live
                                   entry, a dashboard, the activity region. IN THE SCROLLING
                                   TRANSCRIPT A LONG BLOCK IS ALREADY FINE, because the
                                   transcript is what scrolls; an app that wraps a 400-line
                                   result in a container there has chosen to hide 380 rows and
                                   probably did not mean to. SPECIFIED as C04 §3c with both
                                   walk artefacts, I47-I49 and commitments 44-46
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
                                   candidates, by USE rather than by name. F160.
                                   FOURTH INSTANCE, 2026-08-14, and it moved the WRONG WAY:
                                   adding `AskOptions.placement` — a well-named field on a
                                   PUBLIC type — collided with `Layer.placement` and took an
                                   existing exact member OUT of exactness. Members 1177→1179,
                                   exact 382→381. So the blind spot grows as the API grows,
                                   which is the vocabulary argument arriving as a measurement
                                   rather than as a prediction.
                                   THE SIGNAL THE ENTRY ASKED FOR EXISTS, 2026-08-14:
                                   `publicSurfaceUseSignal`, printed by `make enforce`
                                   beside the other two, over the members of the types
                                   `src/index.ts` exports against both examples' sources.
                                   86 of 325 named by neither. The rule stays as it is —
                                   THE SAME NAME-MATCHING IN THE DIRECTION WHERE IT CANNOT
                                   LIE: MG24's verdict is UNCONSUMED and needs the cleared
                                   side exact, which it is not; this verdict is CANDIDATE
                                   and needs the LISTED side exact, and a collision can
                                   only ever clear. 144 of 226 clearings are ambiguous and
                                   not one can list. A03 §9 carries the walk, five cells;
                                   six fixture rows in `test/unit/enforce-rules.test.ts`;
                                   `tools/mutate/runs/enforce-public-surface.mjs`, 6/6.
                                   The build falsified the walk's second cell — MG24's
                                   keyword split does not carry, because `CompletionSource`
                                   is an interface an app BUILDS — and that was the residue
                                   over-reporting, which the first cell forbids.
                                   THE READ, AND ITS FIRST PAYOUT: the 86 stratify by
                                   WHAT AN APP WOULD HAVE TO DO to reach them — write a
                                   custom block kind (`RenderContext`, `Style`,
                                   `TerminalCapabilities`, `PaletteSpec` — 19), author a
                                   theme (`ThemeTokens` — 4), supply a transport or
                                   adapter (`VerbTransport`, `TransportRouter`,
                                   `Adapter`, `Invocation` — 7), drive a fixture world
                                   (`WorldDriver` — 3), or take an injection seam only a
                                   test wants (`TuiConfig.clock`/`fs`/`stdin` and the
                                   rest of `TuiConfig`, `SessionSnapshot`, `Identity` —
                                   20). NONE OF THOSE IS A DEFECT. What is left is the
                                   block and manifest fields neither app sets, and the
                                   first one read produced F165: `ErrorLike.details` is
                                   in the residue, and reading it found `code` and
                                   `stage` beside it — three of five members set by
                                   three producers, the adapter mapping and the app's
                                   own twelve sites, rendered by nothing. THE OTHER TWO
                                   WERE CLEARED, which is the residue's stated direction
                                   paying out: a candidate is where to look and not what
                                   is wrong
      49 GOLDEN HAS NEVER SEEN A     `test/golden/README.md` says "frames at 4 widths x 2
         FRAME ★★                    themes x 2 unicode modes" and NOT ONE OF THEM IS A
                                   FRAME: blocks, table, patch and plot all go through
                                   renderToLines, and no golden test imports from src/shell/.
                                   So the theme's background base, the prompt window and its
                                   elision markers, the selection wash, the chrome rows, the
                                   frame's height arithmetic, the cursor sequences and the
                                   write-as-a-diff have never appeared in a snapshot — the
                                   category whose whole job is catching exactly this class
                                   stops one layer below it. FOUND BY RE-MEASURING A RESIDUE: 39 recorded
                                   "every golden frame is still drawn on the inheriting
                                   branch", whose stated reason was true and was not the
                                   reason, and which made the gap look smaller than it is.
                                   NOT 24's TO FIX — a golden frame needs a session's deps and
                                   a snapshot stable across changes to any of them, which is
                                   test infrastructure with more consumers than a theme, and
                                   three defects that reached the tree would have shown at review in one
                                   (C22 §6e's two, entry 16 step 3's cut choices). F163.
                                   THE COUNT CLAIM WENT 2026-08-16 AND THE GAP DID NOT:
                                   `test/golden/continuation.test.ts` imports `commandRows`,
                                   `noticeDoc` and `PROMPT_GUTTER`, so a golden frame reaches
                                   `src/shell/` for the first time — and it covers ONE of the
                                   eight things above (the chrome rows). The other seven are
                                   untouched: background base, prompt window, elision markers,
                                   selection wash, height arithmetic, cursor sequences,
                                   write-as-a-diff. IT ALSO WENT THE WAY THE ENTRY PREDICTS —
                                   the frame was written because a mark's PLACEMENT was wrong
                                   in a way every block-indexed assertion passed
BUILT 50 INLINE EMPHASIS          span-level styling, which the vocabulary has NO
         (span-level styling)      REPRESENTATION FOR at any depth: tone attaches to a block,
                                   a Cell, a keyValue row, an events row or a pill and never
                                   to a run inside text. FILED AND NOT IMPLEMENTED — it is a
                                   change to published types before the freeze with no consumer,
                                   which is the disposal `code`/`details` got for the same
                                   reason. Two halves and they are different sizes: BOLD has a
                                   representation already — `MONO.emphasised` is `{bold: true}`
                                   in `presentation/theme/resolve.ts`, so bold survives 1-bit
                                   and is not a colour — while ITALIC is absent from `Style`
                                   entirely (colour · background · bold · dim · inverse ·
                                   underline). So the question is not *how does italic
                                   degrade*, it is *does italic exist*, and the answer today is
                                   no at every depth. ORDER IF PICKED UP: the view model gains
                                   spans first, then 11's translator stops keeping markers
                                   literal — the reverse builds a translator against a
                                   vocabulary that cannot express its output. Blocker as a
                                   symbol: `Style` in `src/presentation/theme/types.ts`.
                                   ITALIC IS NO LONGER THE THING WAITING, 2026-08-15:
                                   `Style.italic` is built, and 50's ORDER STANDS MINUS THAT
                                   BLOCKER — spans in the view model first, then 11's
                                   translator. A span is a published-type change across every
                                   text-bearing kind and is the real work; `markdown.ts`
                                   already names the condition, *the day spans exist*, so the
                                   trigger is markdown's inline half having a reason rather
                                   than a consumer for a boolean.
                                   AND THE RE-CHECKING STOPS HERE. This and `Rule.level` (11)
                                   have now been checked for a consumer three times — 9 was the
                                   third and does not want one, since a diagram's title is one
                                   level and `rule`'s single `label` fits. A filed public type
                                   with no consumer does not become more filed by being asked
                                   again: THE TRIGGER IS A CONSUMER APPEARING, both entries name
                                   their blocker as a symbol, and a grep is what answers it. Any
                                   further round that re-checks these two is spending the
                                   satisfier-side habit where nothing can have moved.
                                   BUILT 2026-09-04, AND THE ORDER WAS KEPT — spans first,
                                   then 11's translator. `TextSpan` — `{from, to, bold?,
                                   italic?, underline?}`, UTF-16 code units, half-open — in
                                   `src/data/viewmodel/types.ts` on `Raw`, `Notice`, `Rule`
                                   and `Cell`, refused to `code` (C04 §3am, I83–I88);
                                   `checkSpans` at the gate; `src/presentation/runs.ts`
                                   (`runsOf`, `sliceRuns`, `wrapRuns`) and `paintRuns` in
                                   `src/presentation/blocks/paint.ts`, coalesced by style
                                   reference so no golden frame moved (C09 §5). The first
                                   frame that writes SGR 3 is C04 T2.31, and MG24's
                                   `SgrStyle.italic` row is gone. Design and both walks in
                                   `docs/notes/CALCIUM_SPANS_DESIGN.md`. DEFERRED WITH
                                   SYMBOLS, and neither is this entry's: a span tone as
                                   `TextSpan.tone` (inline code's, 11's residue) and a span
                                   value as `TextSpan.value` (ML-1's)
BUILT 51 MOTION AND MEASURE SETS ★  spinners · bar styles · A CATEGORICAL PALETTE — and one
                                   finding underneath all three. THE PALETTE IS THE
                                   FREEZE-RELEVANT HALF: *n distinct things, no order, no
                                   judgement* is a third axis beside `Tone` and the change
                                   axis, and `Tone` structurally cannot carry it — its members
                                   are ok/warn/error/dim/muted/default, every one a judgement.
                                   The sets are additive and can land after. Content:
                                   `docs/notes/CALCIUM_SPINNERS.md` (24 sets, 8 refused with
                                   reasons) and `docs/notes/CALCIUM_BARS.md`.
                                   AND THE FINDING: AMBIGUOUS WIDTH IS A CAPABILITY, NOT A
                                   REFUSAL. `East_Asian_Width=Ambiguous` means the TERMINAL
                                   decides — one cell in a Western locale, two in a CJK one —
                                   so it is a property of where a glyph is drawn, which is what
                                   a capability is, and `TerminalCapabilities` has no field for
                                   it. Four instances of one cause, and one is
                                   ALREADY IN THE TREE:
                                   `RAMP_UNICODE = "▁▂▃▄▅▆▇█"` in
                                   `src/presentation/plot/ramp.ts` is ambiguous in all eight
                                   glyphs, and `sparkline` is what C11 calls for a TABLE CELL
                                   (`src/presentation/table/detail.ts`), so a table's columns
                                   stop aligning rather than a chart looking odd. Measured:
                                   `cells()` returns 1 for every one of them and has no
                                   ambiguous handling at all, so the framework's own measurer
                                   and a CJK-locale terminal disagree by a factor of two —
                                   C25 I1's class, on a setting the framework cannot see.
                                   `sparkline.ts`'s own comment says *every ramp glyph is one
                                   cell wide in both modes*, forty lines below the ramp.
                                   The other three: the heatmap's planned `░▒▓█` (three of
                                   four ambiguous), box drawing throughout every ASCII chart
                                   library, and `▌`/`⚡` in `claude-statusline` — where `⚡` is
                                   WIDE rather than ambiguous, so it is two cells on every
                                   conforming terminal. PROPOSED: `ambiguousWidth: "narrow" |
                                   "wide"`, DECLARED rather than detected — no probe C02 would
                                   allow, and it is a setting the user already has in tmux,
                                   iTerm2, Konsole and WezTerm. It unlocks the eighth-blocks
                                   and sub-cell fill, the eight-level vertical ramp, the shade
                                   ramp, and box drawing — which means connected line charts
                                   with proper joins — and makes braille the fallback rather
                                   than the ceiling. FREEZE-RELEVANT, so it belongs before
                                   publication and in the same ruling as the palette. NOT
                                   TAKEN: `ambiguousWidth: "narrow" | "wide"` is on
                                   `TerminalCapabilities` (C02 I9, commitment 12), DETECTED
                                   from the locale's language subtag — ja/zh/ko → wide, POSIX
                                   precedence, declaration overriding — because a
                                   declared-only field would have shipped and changed nothing
                                   for the users it exists for. `cells(text, ambiguous)` takes
                                   it as an argument rather than reading it, since only L1
                                   measures and L0's data half must not learn about terminals.
                                   THE FIRST CONSUMER IS THE SHIPPED DEFECT: `ladderFor` returns
                                   `RAMP_BRAILLE` — every glyph narrow — where the capability
                                   says wide, and `sparkline` pads with the capability, so the
                                   ramp and its measurement agree. T2.50–T2.54, five mutations
                                   in `tools/mutate/runs/c02-ambiguous.mjs`, constancy on
                                   T4.18d rather than a second row.
THE SWEEP IS DONE, AND THE RULE CAME FIRST.
                                   SS50 fires on a `cells()` call naming neither the
                                   convention nor `// narrow-ok`, which turned forty blind
                                   edits into a list that reported itself and shrank visibly:
                                   43 → 37 → 17 → 0. `truncate`, `truncateParts`, `wrapCells`,
                                   `hardWrapCells`, `sliceCells`, `fitStyled`, `displayCells`
                                   and `expandTabs` all take the convention now, so a WRAPPED
                                   PARAGRAPH is right and not only a sparkline — the common
                                   case as well as the sharp one. FOUR SITES ARE ANNOTATED,
                                   NOT THREADED, each with its reason on the line: a glyph
                                   slot's two renderings compared with each other, a line
                                   number, a confirm key, the prompt gutter's substitution
                                   pair. THREE FILES ARE ALLOW-LISTED — C19's menu, C20's
                                   history layers, the fallback adapter — because giving them
                                   a capability means widening a builder signature in a
                                   component this change does not touch; a prefix list is
                                   auditable where seven `// narrow-ok` markers meaning *not
                                   yet* would teach the annotation two meanings. THE PALETTE'S CONSUMER
                                   QUESTION IS ANSWERED AND THE ANSWER IS NEITHER OPTION:
                                   it does not wait for a consumer and the sparkline is not
                                   it. C12 ALREADY HAS ONE AND IT IS ALREADY LYING —
                                   `SERIES_TONES = ["accent", "info", "ok", "warn"]` in
                                   `src/presentation/plot/definition.ts`, cycled by
                                   `toneOf(series, index)` at `index % 4`. Two defects, both
                                   the ones this entry predicts in the abstract, in shipped
                                   code: SEMANTIC BLEED — series three is `ok` and series four
                                   is `warn`, so a plot of four unrelated quantities tells the
                                   reader one is good and one needs attention, which is D29's
                                   own rule inverted — and SILENT REUSE, since a fifth series
                                   is `accent` again and the frame says two things are the
                                   same thing. THAT IS THE CAP'S ARGUMENT, MEASURED RATHER
                                   THAN REASONED: *silently reusing a colour is a segmentation
                                   that lies* is not a prediction here, it is `% 4`.
                                   SO THE RULING: the palette is warranted NOW, Okabe-Ito at
                                   the top rungs, capped at eight, and a surface declaring more
                                   categories than the palette distinguishes is REFUSED at
                                   construction rather than wrapped — the same disposal C04
                                   I47 gives an unaimable container. `Tone` cannot carry it:
                                   its members are ok/warn/error/dim/muted/default and every
                                   one is a judgement, so a categorical value would be a sixth
                                   judgement meaning *no judgement*. NOT BUILT HERE: it mints
                                   a public palette surface before the freeze, which is the
                                   one class of decision this session does not take alone —
                                   and unlike the ambiguous-width field, nothing about it is
                                   fixed by detection, so there is no half that lands early.
                                   BUILT 2026-08-15, and the disposal changed with the
                                   measurement: *mints a public surface with no detection half*
                                   is the right caution for a SPECULATIVE palette, and this is
                                   a fix for a plot that lies at four series and again at five.
                                   For a fix, the surface IS the fix. `categorical` is a
                                   `PaletteSpec` in both themes — Okabe-Ito, eight, adjusted
                                   per theme against its own background, every slot clearing
                                   5.1 measured — with `carries: "decoration"`, curated 4-bit
                                   indices in all three maps, `SERIES_TONES` replaced by
                                   `CATEGORY_REFS` and THE CYCLE REMOVED RATHER THAN WIDENED,
                                   and C04 I50a refusing a ninth series at both gates.
                                   THE 1-BIT RUNG IS VACUOUS BY CONSTRUCTION, checked rather
                                   than assumed: `definition.ts` forces stacked strips at
                                   `colourDepth === 1` for a multi-series plot, so nothing
                                   asks for a colour there and the strips are the answer
                                   already. If markers ever land — four independent arrivals:
                                   plotille, ratatui, termplot, the 1-bit highlight — the
                                   strips ruling is re-tested, which is a bigger change than
                                   the palette and belongs to whoever picks that up.
                                   TWO THINGS THE BUILD FOUND. The 24-bit distinctness had a
                                   keeper already: C10 refuses two slots of one palette
                                   rendering as one another at theme LOAD, which is stronger
                                   than the row asserting it and was found by trying to mutate
                                   it. And `carries: "decoration"` vs `"meaning"` is NOT
                                   observable at any depth without `classes` — both resolve
                                   through `MONO["normal"]` — so that mutation was withdrawn
                                   rather than scored. T2.60–T2.64; every golden frame that
                                   moved was checked and the diff is colour-only, no geometry.
THE SETS LANDED 2026-08-15 AND 51 IS
                                   COMPLETE. `SPINNER_SETS` in
                                   `src/presentation/blocks/glyphs.ts` — sixteen sets, each
                                   carrying ITS OWN INTERVAL (a caller picking a 28-frame set
                                   and getting a 10-frame default makes it frantic) and ITS
                                   OWN ASCII PAIR, matched by shape of motion so a bloom falls
                                   to a pulse and a rotation to a rotation. `spinnerFrames(caps,
                                   name)` is the existing signature with one argument;
                                   `spinnerIntervalMs(name)` is the same lookup, so frames and
                                   interval cannot come from different sets.
                                   THE WIDTH RULE HAS TWO ARMS RATHER THAN ONE REFUSAL, which
                                   is what C02 I9 bought: the refusal list becomes a TIER.
                                   `boxBounce`, `circleQuarters`, `arc`, `growVertical` are
                                   available where the terminal says ambiguous is narrow and
                                   take their ASCII pair where it says wide. Asserted at
                                   construction over what `spinnerFrames` RETURNS, not over the
                                   table — the only form that catches a set offered on the
                                   wrong arm.
                                   AND `▌` IS THE FRAMEWORK'S OWN FOURTH INSTANCE: box drawing
                                   is ambiguous throughout, so `glyphs(caps)` now returns the
                                   ASCII set on a wide terminal. A panel border, a rule and a
                                   progress bar were all twice the width they were measured at
                                   there. A third narrow-safe set is the better answer the day
                                   someone measures one; *mostly ASCII dressed as Unicode* is
                                   not.
                                   FOUR THINGS THE CATALOGUE GOT WRONG, FOUND BY ASSERTING ITS
                                   OWN RULES: `dots2` at 640 ms and `arc` at 600 ms are outside
                                   the 800–1600 band the same document states; `⋅ ∘ ◦` are
                                   recorded as narrow substitutes for the ambiguous `·` and are
                                   themselves ambiguous (U+22C5, U+2218, U+25E6), as is `⊶`;
                                   and the band itself is a SPINNER's — a counter and a
                                   two-frame toggle are other categories, which is why one band
                                   over all three reported three false rows. T2.70–T2.75
BUILT 52 3D PLOTS                  RETRACTED FROM *deliberately not doing*, and the refusal
                                   was a fit argument asserted rather than measured (F431).
                                   HALF-BLOCK RUNG: `▀`, two full colours a cell. The sample
                                   grid is `width × 1` by `height × 2` — 80×48 at 80×24 cells,
                                   120×60 at 120×30 — so nothing is hardcoded to a viewport,
                                   and every absolute figure in the design note is a
                                   measurement at 80×24 rather than a threshold. THE DITHER IS
                                   NOT PORTED: it is a function of `colourDepth`, not of this
                                   form, measured at 1.09× / 1.43× / 3.51× / 7.84× and worth
                                   nothing where the rung lives (F433). Steps 1–3 of §10 ship a
                                   3D scatter, which is where it stops being speculative.
                                   THE CAMERA IS THE PART WITH A SCAR: `cursorPositions` is
                                   read in `src/presentation/plot/definition.ts` and written by
                                   nothing in `src/` — a complete mechanism with nothing on the
                                   other side (C12 §3s) — so a camera on `RenderContext` with no
                                   writer repeats it exactly. The field, the cache-key axis and
                                   one binding land together or none does.
      —  video · embedded editor · matplotlib wrapper · rewind/undo
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
| 52 | BUILT | **the field, the cache-key axis and one binding landed together, which is the condition the entry set** — `cameras` on the render context (`src/presentation/blocks/types.ts:134`), the store `Cameras` with its `key` (`src/shell/cameras.ts:59`), `nudge` bound to the orbit keys (`src/shell/construct.ts:1426`), `plot3d` a validated form (`src/data/viewmodel/validate.ts:1657`), `azimuth` and `elevation` the projection's own angles (`src/presentation/plot/project3.ts:171`) and `halfBlockRows` the rung (`src/presentation/plot/scatter3.ts`). Re-measured 2026-09-04 | the dither is still not ported and is worth nothing at this rung (F433); the fit argument the refusal rested on was asserted rather than measured (F431) and stays retracted |
| 3 | PART | **three of the entry's four names are built** — `heatmap` (`src/presentation/plot/heatmap.ts`), `confusion`, `correlation` all in `PLOT_FORM_MEMBERS` (`src/data/viewmodel/validate.ts:2328`); the planning pass this entry said was *the real blocker* exists as `docs/notes/CALCIUM_PLOT_SYSTEM_PLAN.md` (2026-09-03) | **Gate**: `tensor` occurs zero times in `src/` — re-measured 2026-09-04, still zero, and red the day the ML half starts. Design at `docs/notes/CALCIUM_ENTRY3_KICKOFF.md` — one slice as a heatmap, plus a header |
| 1 | PART | **1.2 change axis** built: `change?: "unchanged" \| "changed" \| "added" \| "removed"`, `src/data/viewmodel/types.ts:2553` | 1.1, 1.3, 1.4 not checked in this pass |
| 5 | PART | **CI from the tarball** built: `.github/workflows/ci.yml` `proof` job + `make regime`. **0.x** said: `README.md:472` | error messages: F151 fixed, **F152 and F153 open**. The outside-reader test is **owed and unrunnable from inside the repository** (R01 R4.4) |
| 7 | PART | **specified as C26, and three stages built.** `ElementAddress` — `interaction/router/types.ts:84` — and one shared resolver, `resolveFocus` — `interaction/router/focus.ts:122` — so focus holds an address and render and keys answer from the same place. Stage 1 made `interaction` a focus target, stage 2 gave blocks `elements`, stage 3 the address; the ⏎ ruling followed. `docs/components/C26_navigation.md` | **§4's policy resolution and the modes.** `ArrowPolicy` and `EscapePolicy` are absent from `src/` — withdrawn under MG24 because `NavElement.arrow` and `.escape` had no reader, **re-checked against the widened rule (F159) and the withdrawal holds**, so §4 is still a design question — **but the check it owed first has been run, and it refuses the vocabulary**: `docs/components/C26_navigation.md` §4a, four kinds against the tree, **zero fit and for two different reasons**. `table` needs *escape up, stop down* and every `ArrowPolicy` value names an axis rather than a direction; `logs`, `patch` and a scroller never step an element, so the edge question does not arise. The discrimination the vocabulary was for is already carried by which of `elements` and `window` a kind declares, and the cell that was left open — a kind declaring both — is **ruled in §4b**: elements are the unit of movement and the window is a consequence, so the cell dissolves without a field (C26 I18, commitment 12, I7 gains the content of the agreement). §4's resolution shape (global → kind → per-node) is untouched and is now what a kind wanting `↓` to scroll uses. **The boundary was owed here and has since been ruled** — C26 §4c (2026-08-15): a boundary is a neighbour question, the sequence is the entry's, and §4g (2026-09-03) made that entry the *focused* one; §4d then records §4 short of nothing. **What remains is `ArrowPolicy` and `EscapePolicy`, withheld under MG24, and nothing else** — no reader for `NavElement.arrow`/`.escape` (F159), and after §4a/§4d no inhabitant for any value of either. (a)–(c) are answered in the Order entry, and the block-to-block ceiling it cited lifted 2026-09-03 (§4g) — re-read 2026-09-04 |
| 6 | RULED | **the ruling is in the entry, and the walk is in two specs.** `docs/components/C05_tool_manifest.md` §8b and `docs/components/C22_composition_root.md` §13b. 2.2's first half is built and the prose had not caught up: `shellOnly` — `data/manifest/types.ts:88` — is absent from `argv` via `validateInvocation`, `data/manifest/validate.ts:254`, and `examples/docker/bin/docker-json` records the shim's strip being deleted rather than commented | **2.2 is closed with no field; 2.1's convention is what remains.** The convention is unwritten and its residue is an empty block whose emptiness is a *failure to compute*, which C22 cannot tell from a success. 2.2 needs nothing: `--help` replaces the result rather than selecting among renderings, and `usageBlocks` — `src/data/adapters/mapping.ts:169` — lists every flag flat |
| 8 | BUILT | **C14 I4/I5/I6.** `src/viewport/viewport/viewport.ts:347` — `#afterContent()` restores from the anchor on **every** content change, not only on resize; `T5.3` is the tier-5 row — *a `--logs` tail at 1,000 lines/s while scrolled up → the view does not move* | the floating jump-to-bottom indicator, which is chrome and belongs to 29 |
| 10 | PART | `ask: (opts: AskOptions) => Promise<string>` with `choices` — `src/shell/local/registry.ts:59`, reached as `ctx.ask` at `src/shell/execution.ts:806` | the in-transcript menu block, and the popup unification (16) |
| 12 | BUILT | `src/shell/render-frame.ts:153` `body()` — `previous()`, per-row `cursorTo(i, 0)`, `SGR_RESET` per row (I57) | — |
| 13 | BUILT | `src/shell/render-cache.ts`, keyed on entry · `rev` · width · **focus** · theme name | — |
| 14 | BUILT | `src/presentation/text.ts:108` — an equality, not an approximation | — |
| 17 | PART | **four implementers** — `keyValue` (`src/presentation/blocks/kinds/structured.ts:125`), `logs` (`src/presentation/blocks/kinds/structured.ts:217`), `patch` (`src/presentation/patch/definition.ts:213`) and `table` (`src/presentation/table/definition.ts:157`) declare `BlockDefinition.window` (F134, CLOSED: 13–21× opening, 90–102× per drag step). This cell said *two, not four; `keyValue` and `code` declare none* — re-measured 2026-09-03: `keyValue` declares, `table` was uncounted, and row 7 above already reasoned about the `table` kind this row denied | **`code` and `raw` declare `window` as of 2026-09-04** (C14 §4a, C09 I25a, C04 I82 — `lineRange` is the pin, because a parse cannot be sliced); C14 §4a carries the before/after table rather than this row restating a figure. **The cap landed 2026-09-04** under C14 §4b (I24–I26, `TuiConfig.maxBlockRows`, default 2 000, marker `… 2,000 of 50,000 rows`); F601 measured whole-block `measure` at 0.6 ms for a 50 000-row `table`, so the bound is on rows painted and not on the cost the paragraph at *And a bound* named. Residue: the `code` block's whole-text control strip per frame named in §4a (a window opening at line 0 now slices, C09 I25a) |
| 18 | BUILT | `src/shell/refresh.ts` — `Source`, the `folds` memo (I47), stagger by source not by part | — |
| 19 | PART | **the first claim holds and the second does not.** `resize` is an immediate commit reason, never coalesced (C03 §, I2). But *every SIGWINCH rebuilds the Fenwick index* is false: `src/viewport/viewport/viewport.ts:197` rebuilds **only when the width changed** — C14 I8, *a height change invalidates none, and doing both would make dragging a terminal's bottom edge cost a full remeasure per frame* — and step 0 refuses a resize to the size already held (C14 I21) | a **horizontal** drag is still N rebuilds + N renders + N writes, which is the half that survives |
| 20 | BUILT | `visible: (host: RefreshHost) => boolean`, `src/shell/refresh.ts:327`, wired at `src/shell/construct.ts:1183` | — |
| 21 | BUILT | **the user-invokable path exists and is tested.** `src/shell/execution.ts:1300` routes `--help` on both paths before any spawn; `usageDoc` — `src/shell/documents.ts:211` — composes from the manifest with `status: "ok"`; `--help` is reserved by `FRAMEWORK_FLAGS`, `src/data/manifest/framework.ts:153`, `shellOnly`; `/help` is two-level at `src/shell/local/handlers.ts:110`. T4.8 asserts the document **and** that nothing spawned | — |
| 25 | PART | drawn: `src/shell/paint.ts:303` reads `ghost()` fresh per paint (I50) | sole-candidate only, and static — `ghost()` in `src/interaction/completion/engine.ts` returns a hint only when `staticCandidates` has exactly one. The *design with 40* dependency expired: 40 is BUILT (2026-09-03) |
| 27 | PART | **16 languages** registered in `src/presentation/blocks/kinds/code.ts`, up from 2 | the entry's own target is 24 |
| 31 | PART | **recency-first landed.** `rank` — `src/interaction/completion/engine.ts` — runs after `dedupe` at both call sites over an injected `recency`, and C22 supplies it from C20's history at `src/shell/construct.ts`. `null` sorts last and stably, so it refines source order rather than replacing it. C19 I26, §3a; five mutations in `tools/mutate/runs/c19-ranking.mjs` | **substring and subsequence.** Substring is **refused** and I27 says why: the verb source emits one word at a time, so the whole name never reaches the filter and widening it changes nothing. Subsequence wants a match-quality scorer, which is a separate ruling |
| 34 | PART | animation exists as `RenderContext.tick` — `src/presentation/blocks/types.ts:39`, and `measure` never receives it (C09 I8) | structured export: no `exportAs`/`toJSON` anywhere in `src/` — and **that phrase is this table's own grep term, not the entry's** (F166). The entry lists *structured export* among six UX items, where it means letting a user export what is on screen. It is **not** a `ViewDocument` codec, which is what 44's row read it as |
| 38 | BUILT | `Group` ships with `direction: "row" \| "column"` — `src/data/viewmodel/types.ts:2029`, `b.group`, `groupDefinition` in `src/presentation/blocks/kinds/containers.ts` — and the weights C04 §3 deferred are built: `flex?: readonly Share[]` at `src/data/viewmodel/types.ts:2050`, `groupChildWidths` at `src/data/viewmodel/measure.ts:79`, refused at `b.group` and by `checkFlex` — `src/data/viewmodel/validate.ts:280`. C04 §3, I42, I43, commitments 39–40, T1.20, T3.16–T3.19, T6.20–T6.22; `tools/mutate/runs/c04-weights.mjs` — and `Share` closes it: `examples/docker/src/banner.ts:187` builds a row group whose frame is identical to the composed golden, and `examples/docker/src/dashboard.ts:434` puts it in the document, so **`direction: "row"` has a caller**. C04 I44, commitment 41, T3.20, T3.21, T6.23, T6.24 | **CHECKED FROM THE SATISFIER'S SIDE 2026-08-15 AND TWO OF THE THREE HAVE MOVED.** `align` **is built and this row said it was not**: `Valign` at `src/data/viewmodel/types.ts`, `align?: readonly Valign[]` on `Group`, accepted by `b.group` and read by `groupDefinition` — `block.align?.[index]` into `justifyContent`. **And no test names it**: zero matches for `Valign` or `align` under `test/` for a group, so a published field with a renderer shipped untested while the record said it did not exist — two documents wrong about one field in opposite directions. T3.22 is the row it lacked. **`height: "fill"`'s blocker is met**, which is the deferral CLAUDE.md already names: the condition was *the producer cannot see the height*, and `ProducerContext.height` is granted at `producerContext(deps.region().height)` in `src/shell/execution.ts`, non-null exactly on the view route and `null` for a live part inside one. **Both line citations were already wrong before they were corrected 2026-09-01** — 580 pointed at a doc comment and 612 at a member of the plot-form union, neither of them the field named — and `roadmap-status` only noticed when an unrelated edit pushed 612 onto a *blank* line. That is F401a's class: a line citation passes on non-blankness, so it is wrong silently until the file shortens under it. The type name was stale too — `flex` is `readonly Share[]`, not `readonly number[]`. **`padding` is the only one of the three still a separate step.** The wordmark's leading blank row stays the app's until `padding` lands, and that is now the whole of the remainder |
| 35 | RULED | **the ruling is in the entry.** The spinner is one frame by a premise that has expired — `src/shell/paint.ts:110` says a ticker is *"a timer this layer does not own and must not grow"*, and the refresh driver has owned one since 18 landed; the `steps` block already animates off `ctx.tick` (`src/presentation/blocks/kinds/structured.ts:403`). The pending entry is appended blank — `src/shell/execution.ts` `compose({ … blocks: [] })` in the shell route (re-measured 2026-09-03, still so) | nothing composes the notice, and there is no elapsed-time part — **the rendering half exists** (`continuation` `⎿` is a `GLYPH_TABLE` slot with `prefixCells` in `kinds/simple.ts`), so what is missing is the composer, not the glyph. **The adapter override has no surface yet** |
| 36 | PART | **the container half is answered, in a different shape.** C04 I49's residue row — `⋯ N above, M below`, both directions, one row, `residue` in `src/presentation/blocks/glyphs.ts` — already says *this region is bounded and there is more* at container scope. What is left is **position rather than existence** | **the transcript-scope bar is untouched**, and the constraint the answer creates is the real content: a container bar must read I49's numbers or replace the row. Two mechanisms answering *is there more* at one scope is the shape C04 I50 refuses for `copy` |
| 42 | PART | **the seam exists and is not what the entry assumed.** `createKeymap(bindings)` takes the list rather than owning it — `src/interaction/router/keymap.ts` — with one caller passing `defaultKeymap` in `src/shell/construct.ts` | **two missing pieces of different sizes**: the conflict rule throws (`KeymapError`) where this entry says it must become a ladder, and no config surface carries overrides. Not *the table is hard-coded*, which is what the row said before it was checked |
| 11 | BUILT | **the block half and the inline half are built** — `markdownBlocks` in `src/data/viewmodel/markdown.ts`, exported from the barrel and reachable as `b.markdown`. Headings → `rule`, fences → `code` with the info string as the language, pipe tables → `table` with **positional** keys, bullets → `notice` with the `bullet` glyph slot and its hanging gutter, ordered items → `notice` with the number as text, quotes → muted `notice`, everything else → `raw`. `inline` in the same file (2026-09-04, with 50): `**` → bold, `*` and `_` → italic, as `TextSpan`s over the marker-stripped text; **a backtick run is a `tone: "identifier"` span with the backticks gone** (2026-09-04, C04 I89, C09 §5 — `identifier` because the tree uses it for a name one refers back to, and `meta` for secondary detail). **A one-cell delimiter row is a table** (2026-09-04): `DELIMITER` requires a pipe somewhere and one dash cell, so `| h |` over `|---|` is a one-column table while a bare `---` and a `|` in prose over a dash line stay paragraphs (T2.48). T2.40–T2.47 with T2.44 replaced by T2.33 and T2.34, T2.48 added; mutations in `tools/mutate/runs/md-subset.mjs` **The last three residues are closed** (2026-09-04, C04 §3an, I94, I95, I96, C09 I40, I41): `Rule.level` is `1 | 2 | 3` with the **fill** as the axis — heavy, light, blank — chosen against frames at 80 and 40 in both alphabets, `#` → 1, `##` → 2, `###`–`######` → 3, and the type refuses a fourth tier so a level nothing draws differently cannot exist; `Glyph.quote` is a **rail**, drawn on *every* row of the notice rather than on the first, in the columns `prefixCells` already reserves, so it costs no geometry — `⎸` U+23B8 measured Neutral where `▌` and every box-drawing vertical are Ambiguous and draw two at `ambiguousWidth: "wide"`, which is the second reason F161's argument does not reach; `Glyph.nested` marks an item past the depth cap on both list arms, so depth 3 and depth 4 stopped being one frame. **The cap's own reason was replaced by a measurement**: uncapped at width 40 an item past about depth 15 does not draw a wide indent, it draws *none* — the leading spaces are the wrapper's break and the first row is the mark alone. T2.106–T2.109; ten further mutations in `tools/mutate/runs/md-subset.mjs`, and four of its rows re-anchored | **one thing is stated rather than built**: a blockquote's body is prose — `> # Heading` keeps its `#` — and that is unexpressible rather than unbuilt, because one notice has one `glyph` and `rule`, `code` and `table` have no slot to hold a rail (C04 I95). A recursive quote wants a block vocabulary in which every kind can carry a gutter, which is a different change from this one |
| 51 | BUILT | **all three halves.** `ambiguousWidth: "narrow" \| "wide"` on `TerminalCapabilities`, detected from the locale's language subtag under POSIX precedence with C02 I4's override; `cells(text, ambiguous)` in `src/presentation/text.ts` with an `isAmbiguous` range table; `RAMP_BRAILLE` in `src/presentation/plot/ramp.ts` returned by `ladderFor` where the capability says wide, and `sparkline` padding with it. C02 I9, commitment 12, §3, §4's degradation row; T2.50–T2.54; `tools/mutate/runs/c02-ambiguous.mjs`, five mutations **The sweep is done** — SS50 in `tools/enforce/source-scans.mjs` fires on a `cells()` call naming neither the convention nor `// narrow-ok`, and it ran 43 → 0 with four annotated sites and three allow-listed files. **The palette is built** — `categorical` in `src/presentation/theme/tokens-dark.ts` and `src/presentation/theme/tokens-light.ts`, `CATEGORY_REFS` replacing the cycle in `src/presentation/plot/marks.ts`, C04 I50a refusing a ninth series in `src/data/viewmodel/validate.ts`. **The sets are built** — `SPINNER_SETS` in `src/presentation/blocks/glyphs.ts` with per-set intervals and shape-paired fallbacks, the refusal list turned into a narrow tier, and `glyphs` falling to ASCII on a wide terminal because box drawing is ambiguous throughout | **a third narrow-safe glyph set** is the refinement this leaves: `⋅ ∘ ◦` have no narrow form and `─ │ ┌` have none either, so a third set is mostly ASCII with a few survivors — worth building the day someone measures which survive. And the bar *styles* remain a catalogue: `Progress` has no `style` field and minting one with no consumer is the shape four entries this session were spent closing |
| 33 | BUILT | **the refusal became a deferral and I5's property did not move.** `Settle = { line, into }` on `refuse`, `runShell`, `runHandoff`, `runLocal`, `runIntoView`, `runApp`, `start` and `route`; `appendAndCommit` settles into `into` or appends. The queue is a list in `src/shell/execution.ts`, `enqueue` at the guard, `drain` on `Guard.release()` gated on *nothing is running*, `clearQueue` before the release in `cancel`. T1.6, T1.21b, T1.46, T3.17 rewritten against the new mechanism; T3.18–T3.21 added; `tools/mutate/runs/c23-queue.mjs` — 8 mutations, 8 caught | **the seam's own branch had no row and a mutation is what said so**: `/ps` is the app route, which reuses the queued entry as its pending one and settles it directly, so ignoring `into` inside `appendAndCommit` survived every row until T1.6 queued a `builtinThenShell`. `runApp` is **not** converted to the seam — its pair differs by not calling `resetFocus` and by committing `"completion"` rather than `"input"`, and a green suite shows neither. **A third site came from reading the diff**: a queued *view* invocation owns an entry and this route has no settlement of its own, so C22 §13a's *it pops rather than settling, because there is no entry to settle* stopped covering it — true of a view submitted directly, false of a deferred one, and the entry would have streamed for ever marked *queued behind* something long finished. T3.21 |
| 30 | PART | **the prompt half is built; the transcript half is not.** A chip is one PUA code point in the buffer — `insertChip` in `src/interaction/editor/editor.ts`, a side map to `{label, content}`, and `resolved` expanding it at `src/shell/construct.ts`'s submit and nowhere else. The walk seam is `ClusterText` in `src/interaction/editor/layout.ts`, serving `layout`, `displayRows`, `cursorCell` and `selectionSpans`. A paste of `CHIP_LINES` or more becomes one. T2.40–T2.47; `tools/mutate/runs/c17-chip.mjs` — 6 mutations, 6 caught | **the defect that happened is now the first mutation**: `clusterWidth(shown)` measures a cluster BY ITS BASE CODE POINT, right about clusters and wrong about a substituted string, so a twenty-cell label counted as `[`. Every index assertion passed while it was broken and only the two frame rows failed. **Two residues**: the wiring at `session.ts:549` has no row — T2.45 calls `selectionSpans` directly, so a seam-level row passes on the day nothing calls it — and the entry's *detect what it is* (`[JSON · 47 lines]`, one parse attempt) is a second decision with its own failure mode. **C23's half is untouched**: the transcript rendering the content as what it is needs the ENTRY's document to carry the block |
| 51b | BUILT | **the bar half, and `ambiguousWidth` is a tier over what `barStyle` RETURNS.** `Progress.style` in `src/data/viewmodel/types.ts`, `barStyle(caps, name)` and `barStyleNames` in `src/presentation/blocks/glyphs.ts` on `spinnerFrames`'s shape, wired in `progressDefinition` and exposed by `b.progress`. T2.90–T2.93; `tools/mutate/runs/c09-bars.mjs` — 4 mutations, 4 caught | **the rows measure the returned pair, never the table** — a flag somebody wrote and a flag something consults differ exactly when the lookup is wrong, which is what caught the spinner sets. Six of seven unicode styles fall to ASCII at `wide` and `braille` does not, which `CALCIUM_BARS.md` did not say. `GlyphSet.progressFull` and `progressEmpty` are **removed**: one pair fixed in the glyph set was the single-style version of a table, and MG24 said so the moment the table arrived |
| 50 | BUILT | **spans in the view model, and italic's first writer** (2026-09-04). `TextSpan` in `src/data/viewmodel/types.ts` on `Raw`, `Notice`, `Rule` and `Cell`, refused to `code`; `checkSpans` in `src/data/viewmodel/validate.ts`; `runsOf` · `wrapRuns` · `sliceRuns` in `src/presentation/runs.ts`; `withSpan` and `paintRuns` in `src/presentation/blocks/paint.ts`, coalesced by style reference so no golden frame moved; `inline` in `src/data/viewmodel/markdown.ts` is the writer. C04 T1.23–26 · T2.31–34 · T3.62–67 · T6.81–85 and C10 T1.22 · T2.25 · T3.11 · T6.84, in the four spans test files, one per tier; T2.31 is the first frame that writes SGR 3, and MG24's `SgrStyle.italic` row came out the same day. Design and both walks: `docs/notes/CALCIUM_SPANS_DESIGN.md` | — the two deferrals this row carried are discharged (2026-09-04): `TextSpan.tone` by inline code (row 11, C04 I89) and `TextSpan.value` by the per-token channel (C04 I90), with `Run` carrying both, `paintRuns` taking the render context, `wrapCellsParts` taking atoms and `notice` measuring through the wrapper it renders with (C09 §5 *Runs*, C10 §4e). `TextOpts` is split so `b.rule` cannot take a `colormap` it has nowhere to put (F207) |
| 22 | BUILT | **a builder in front of two existing kinds, and no seventeenth kind.** SS50 and MG24 both fired on the first `make enforce` and both were right — `art` in `src/presentation/art.ts`, published from `src/index.ts`; `ArtTier` and `ArtSpec` beside it. Selection is tier-eligible **and** fits, measured with `cells` — `widthOf` — so a `blocks` variant this terminal can draw and cannot fit falls to the next rung. The last rung is a `notice` with `tone: "accent"`, because `raw` carries no style. T2.84a–T2.84n, one per cell of §8a's table plus the two SS50 added, and `tools/mutate/runs/c09-art.mjs` — 9 mutations, 9 caught after one survivor wrote T2.84n | **three of the four validation checks were no longer this entry's**, which the walk found rather than the build: uniform line width and row-count alignment are roadmap 38's `fit` and `Valign`, and *report measured cells* is the selection rather than a report. Only the tab check survives. **MG24's answer was the consumer**: `wordmarkFor` in `examples/docker/src/banner.ts` was `art`'s loop written by hand — preference order, tier, fit — and is now the call, at the same threshold, since a composed row is `WHALE_CELLS + GAP` plus the wordmark's widest. It is `UNCONSUMED_MEMBERS`' first out-of-tree entry, a category the header counted at 1 and never wrote down. **What is NOT done**: `banner.ts` still hand-writes the vertical alignment `Valign` was added for and still says the framework has no opinion about it, and the composed `bannerRow` is a two-column group `art` cannot express — one block is its whole vocabulary |
| 9 | BUILT | **a `code` block with a transform in front, one call wide.** `mermaidCode` in `src/presentation/mermaid.ts`, published from `src/index.ts`, calling `renderMermaidASCII` with `useAscii` from the capabilities and `colorMode: "none"`. `beautiful-mermaid` has a row in `DEPENDENCIES.md`, the first naming a non-permissive transitive licence. T2.80–T2.83 | **thin against a maintenance risk rather than a design one**: ten releases then five and a half months' silence, so a replacement costs a function body and nothing else. The rows assert the seam — the capability mapping, the colour refusal, the block's shape — and deliberately not what a flowchart looks like, which would fail on the package's next release for no reason anyone here cares about |
| 44 | BUILT | **session resume, policy-gated.** `src/shell/construct.ts` reads `persistPolicy(manifest, config)`, and when anything is declared it loads `${stateDir}/transcript.ndjson`, seeds `createTranscriptWriter` and appends the saved documents in order. C13 I20, commitment 18; T1.28 asserts the default — an app that declares nothing persists nothing | **the ruling falls out rather than being enforced**: opening at the bottom with no offsets and no focus is what appending in order does, because none of them is written. A dropped line is announced (F35's class) rather than silently reducing the session |
| 39 | BUILT | **the declaration is a choice**: `ThemeTokens.background: "terminal" \| "surface"` at `src/presentation/theme/types.ts:89`, painting `surfaces.bg` — the one surface every floor is already measured against, so a colour here would let a theme paint one value and prove its floor against another. `LIGHT` declares `surface` (`src/presentation/theme/tokens-light.ts`) and `DARK` inherits (`src/presentation/theme/tokens-dark.ts`). `resolveBase` and `validatePaintedFloors` at `src/presentation/theme/resolve.ts`; the 8-bit floor is recomputed against the **quantised** base, because indices 16–255 are what a terminal paints and the token is not. The base is applied by `based` in `src/shell/paint.ts` — one pass over a finished row, re-establishing it after every `toTerminalDefault()` match and **closing the row**, which is what leaves every lifecycle path untouched. `--no-bg` is a `shellOnly` `FlagDef` on `/theme` (`src/data/manifest/framework.ts`) read through `LocalContext.args`. C10 §4c I25 I26 commitments 22–23, C22 §6g I65 I66 commitments 36–37; T1.17–T1.19, T1.23–T1.23d, T4.27–T4.29, T4.34; `tools/mutate/runs/c22-background.mjs` | **the painting arm ships with one theme exercising it**, since dark inherits by decision — every golden frame is still drawn on the inheriting branch. And the foreground's own 8-bit quantisation is deliberately not in the recomputed floor: it predates this entry and is unchanged by it |
| 29 | BUILT | **the budget, ruled and built — C22 §6k, I79, I80, commitments 50–51.** `TuiConfig.chrome.footerRows` at `src/shell/types.ts:446`, resolved with every other default in `src/shell/config.ts` and bounded by `MAX_FOOTER_ROWS` at `src/shell/config.ts:53` — derived from `MIN_ROWS` as the largest footer leaving one region row at the size gate with the prompt at its cap (6), not chosen; carried on the composed frame at `src/shell/frame.ts:44`, re-asserted by `heightsSum` at `src/shell/frame.ts:151`, drawn on `footerRows` rows by `src/shell/paint.ts:559`. A `ChromeFn` returns blocks and never a height — the per-frame option was walked in §6k.3 and refused. T1.35–T1.37, T3.38, T3.39, T6.95–T6.97; `tools/mutate/runs/c22-footer-budget.mjs`, four mutations, all killed by hand 2026-09-05. **The default frame is byte-identical** (T3.38) and the terminal baseline's chrome frames did not move. **Would landing this close it**: 35, 37 and 15 wanted a chrome row and now have one to ask for — closed as a *budget*, each still owing its content; 46 is a scrollbar at container scope and is re-filed out of this entry (F739) | the activity region A7 is a fifth region and not a footer — nothing here; `footerRows: 0` is not offered (§6k.4 E); `construct.ts:652` still calls `initialRegionHeight(size)` without the budget and the first frame corrects it by `footerRows − 1` rows (I34, T1.37) |
| 46 | BUILT | **all three pieces exist, and the third was the one that fails silently.** `window` — `presentation/blocks/kinds/structured.ts:123` — and `elements` — `presentation/blocks/types.ts` — are both declared, which is what the entry itself says | **the third is the missing one**: nothing holds a per-container offset as view state — no `scrollOffset`, `containerOffset` or `innerOffset` in `src/`. And it stays blocked on **7 §4 specifically**, not on 7: stages 1–3 gave focus an address and none of 46's three questions is answered by one. **The check §4 owed is now run** (`docs/components/C26_navigation.md` §4a) and **§4b then answers 46's question (a)**: elements are the unit of movement and the window is a rendering consequence, so `↓`/`↑` step and the window follows (C14 I6 at block scope) while `PgDn`/`PgUp` move the window and never focus. **Two keys, not two readings of one** — so the scroller needs no interact mode and no new field, the default is read off which of `elements` and `window` the kind declares, and a focused element outside the window is a legal state. C26 I18, commitment 12. **The offset landed as view state** — `ScrollOffsets` in `src/shell/scroll-offsets.ts`, dropped on `rendered`'s own subscription, clamped at read and never at write, canonical key with zeros omitted; the `scroll` kind at `src/data/viewmodel/types.ts` with `scrollDefinition` in `src/presentation/blocks/kinds/containers.ts`; `blockPageUp`/`blockPageDown` at the `liveBlock` target; and the offset as the render cache's **fourth axis** in `src/shell/session.ts`. C04 §3c, I47–I50, commitments 44–47; T2.20–T2.36, T4.18c–T4.18f, T4.41, T4.42; `tools/mutate/runs/c04-scroll.mjs`, ten mutations. **The residue marker is the entry's own ruling made visible** (I49) | **the settled entry keeps its offset and cannot be moved**, which is a ruling rather than a remainder: block-to-block focus above the live entry is C26 §11's deferral, and the marker saying *N above, M below* is the visible symptom it did not have. **And a container in the transcript is a choice to hide content** — reach for one where bounding is the point, not to shorten a long result |
| 40 | BUILT | `afterEdit()` — `src/shell/keys.ts:441` — called by the composition root after every printable key and every paste, static sources only (C19 I3, T2.1a), which is the boundary this entry called *"the trigger, not the engine"*. `test/e2e/editor.test.ts` watches the menu open on a flag prefix in a real PTY | — |
| 41 | BUILT | **both populations, one suggester.** `suggestName` — `src/data/manifest/validate.ts:147` — is the single distance-2 cutoff (C05 I18), read for unknown flags at `src/data/manifest/validate.ts:284` and unknown verbs at `src/interaction/parser/parse.ts:183`, sharing the tie-break so a second implementation cannot diverge. `test/unit/parser.test.ts` asserts distance 3 outside and 2 inside | — |
| 23 | BUILT | **a surface with its own pairing, and the ruling it corrected.** `surfaces.selection` — `src/presentation/theme/tokens-dark.ts:36`, `#264057` at 7.25 : 1 against `tone.default` — is checked by `selectionPairs`, `src/presentation/theme/contrast.ts:158`, a **sibling** of `diffPairs` rather than an entry in it. The cells come from `selectionSpans` — `src/interaction/editor/layout.ts:167` — off the same walk `layout` uses, and `washed` in `src/shell/paint.ts:291` applies them after `exact` squares the row, which is where full-row rather than text-width comes from. `inverse` is the 1-bit rung. T4.22–T4.26 and T1.37–T1.41 | a `carries: "meaning"` **palette** cannot be a wash — `resolveBackground` refuses any ref that is not `surface.*`, so the entry named a mechanism C10 does not have (C10 §4b) |
| 45 | BUILT | **both halves, and the walk's first row was the seam that did not exist.** `DECSCUSR` is a third category in the escape file — `CURSOR_SHAPE` at `src/terminal/escapes.ts:94`, a **setting**: persistent state like a mode, no inverse like an SGR sequence, and an undo that is a third value, so writing it as a `mode()` would make `held` and C01 I6 false about the same bytes. `cursorShapeSequence` at `src/terminal/lifecycle.ts:472` holds the record and emits **on change only**, because the cursor sequence goes out with every frame. The style keys on the **focus target** — `cursorStyleFor`, `src/shell/cursor-style.ts:57` — and not on `Layer`, since `FOCUS_ORDER` has seven members and two are layers, and the prompt, the entry's own example, is not one. `TuiConfig.cursor` at `src/shell/types.ts:418`, filled in by `examples/docker/src/main.ts`. C22 §6f walks it in both artefacts; I63 and commitment 34, C01 I20 and commitment 22; T1.22–T1.22d, T1.25–T1.27c, T6.52–T6.56; `tools/mutate/runs/c22-cursor-shape.mjs`. **The blink half subtracts**: `steadyWhileTyping` — `src/shell/cursor-style.ts:104` — only ever *removes* blink, so a style declared steady is never made to blink and a `null` one is untouched, which is the shape half's boundary reached a second way. *Steady on a keystroke* is free because a keystroke already composes a frame (I27); the idle edge is a wake on the composition root's scheduler rather than a timer inside the paint, armed only where a declared style blinks, since the spinner's unconditional arm follows a *request* and this one would follow every keystroke. I64 and commitment 35; T1.22e–T1.22h, T6.57–T6.61 | **`CURSOR_BLINK_MS` is 600 ms and the declaration says it is unmeasured**, with the reasoning a re-measurement would test — and it is not the VT100's ~530 ms blink *period*, which is a coincidence worth naming. And the resolution's **argument** is untested: a listed survivor, because no tier-1-to-4 harness runs `session.ts`'s private frame deps, and the blink half wrapped that call without moving it |
| 28 | BUILT | **one comparison, and it was holding two shipped defects at rest.** `promptWindow` — `src/shell/paint.ts:242` — takes the cursor's editor row and returns its content range; `shows()` is the membership test both consumers use, in **editor** coordinates. It was `0 ≤ within < cap`, painted coordinates, where a marker row and a content row are the same kind of number — so the editor row immediately above a marked window mapped to painted 0 and both writers landed on the elision marker: the terminal cursor drawn on it (`cursorFor`, `src/shell/paint.ts:551`) and a selection span washing it (`promptRegion`, `src/shell/paint.ts:369`). Measured in a frame at `cap` 4; neither is visible to any assertion, because the arithmetic is self-consistent throughout. Elision is now marked at **both** ends, which is what makes the clipped wash honest, and the spinner and ghost moved to the cursor's painted row — the row `out.length − 1` only was while the window was tail-anchored. C22 §6e walks it in both artefacts, I62, commitment 33; T1.21–T1.21e, T6.48–T6.51; `tools/mutate/runs/c22-prompt-window.mjs` | the ghost's **column** is unchanged: it is written into the padding after the row's text, which on a mid-buffer edit is not where the cursor is. The row is right and the column is a separate question. And at `cap` 2 mid-buffer, rows below elide with no marker — one content row beats two markers, and T1.5b already ruled that direction |
| 16 | BUILT | **four steps, and step 3 found two shipped defects.** Step 1: the choices are a table — `choiceBlock` at `src/shell/confirm.ts:101` — so the marker is a `bullet` slot L1 resolves and `ConfirmDeps` no longer takes a capability record at all. Step 2: `assertPlaceable` at `src/viewport/overlay/manager.ts:167` refuses a centred layer with no width at **both** entry points (C15 I20), which found the tree's second instance — `clearConfirmLayer` at `src/interaction/history/layers.ts:95` declared none — and `AskOptions.placement` at `src/shell/local/registry.ts:44` is a choice between placements, resolved by `placementOf` in `src/shell/confirm.ts`. Step 4: `createChoiceSelection` at `src/shell/choice-selection.ts:36`, with `defaultStart` supplying the confirm's start and `Esc`'s answer alike. Step 3: `menuWindow` at `src/interaction/completion/menu.ts:186` windows the list to what the placement holds, and `refreshAnchors` in `src/shell/keys.ts` re-places the anchored layers on a resize. T1.21, T1.22, T4.12–T4.18, T4.28–T4.33 | — |
| 15 | BUILT | **four steps and a step 0, and the mode is a target throughout.** Copy mode: `#setCopyMode` holds the state at `src/shell/session.ts:586`, C03 gains `suspend`/`resume` at `src/terminal/frame-scheduler.ts:263` (§4a), C01 gains `setMouseTracking` at `src/terminal/lifecycle.ts:424` because nowhere else writes an escape. The prompt: an anchor plus the cursor, with `⌥a`/`⇧←`/`⇧Home` bound after `modifiersOf` — `src/interaction/router/decode.ts:113` — learned xterm's fourth bit. One clipboard: `copyText`, `src/interaction/editor/editor.ts:481`, written by `⌥w` and by the transcript's `copyElement`, `src/shell/keys.ts:1024`, over a range held by `extendRow`, `src/interaction/router/focus.ts:283`, copying `rowCopyText`'s source text, `src/presentation/table/definition.ts:290`. The wash is entry 23 | OSC 52 is a separate axis and is not built: whether a copy **also** reaches the system clipboard is a capability question about the terminal, and it changes nothing about where the text lands in-process |
| 24 | BUILT | **the mechanism ships and `high-contrast` uses it.** `ThemeSet` is `Readonly<Record<string, ThemeTokens>>` — `src/presentation/theme/types.ts:125` — and the store switches by name: `setTheme` at `src/presentation/theme/store.ts:104`, with `names` beside it. `validateVariant` in `src/presentation/theme/contrast.ts:224` checks the declaration against `luminance(bg)`, which nothing did. `withThemeNames` — `src/data/manifest/parse.ts:570` — supplies `/theme`'s `enum` where the composition root holds both facts, and the parse declares none, so a manifest that skips it refuses every invocation rather than quietly accepting two. The premise is closed too: `light` declares `background: "surface"` at `src/presentation/theme/tokens-light.ts:22`, and `HIGH_CONTRAST` — `src/presentation/theme/tokens-high-contrast.ts:52` — is the set's first consumer, solved to 7 : 1 with A01 A.1 carrying every measured ratio. C10 §5a walks it in both artefacts; I27 and I28, commitments 24–25, T1.20, T1.21, T1.21a, T2.22, T2.23, T4.35, T4.36, T6.24–T6.26; `tools/mutate/runs/c10-named-set.mjs` | **a theme cannot declare a floor above the framework's minimum.** `high-contrast`'s 7 : 1 is authored and checked by one row, and `validateTokens` would accept a later edit dropping any slot to 4.5. Named as the next theme-with-a-promise's argument (C10 §5a.6). A solarised-alike and a neutral low-saturation set are unbuilt and are not blocked on anything |
| 49 | OPEN | none, and that is the finding: **no file under `test/golden/` imports from `src/shell/`**, so nothing there reaches `paint.ts`. `test/golden/README.md` says *frames*. F163 | the whole entry — a golden frame category does not exist |
| 43 | PART | `imageProtocol: "none" \| "iterm2" \| "kitty" \| "sixel"` detected — `src/terminal/capabilities.ts:19`; **and the renderer** — `src/presentation/blocks/kinds/image.ts`, `src/presentation/image/` (six files: codec, dither, halfblock, kitty, overlay, index), `src/shell/transmit-image.ts`, eight `test/unit/image-*.test.ts` (this cell said *no renderer*; re-measured 2026-09-03) | `sixel` detected and not emitted, correctly; the sample-grid kind and an image inside a `Cell` — see `docs/notes/CALCIUM_NOTE_AUDIT.md` §7 |

**Checked and confirmed OPEN**, which is evidence rather than an absence of it. **The blanket
sentence went 2026-09-04.** It read *the symbols these entries name are absent from `src/`* and it
covered 26, 32 and 37, none of which had been grepped — F435's class exactly: a blanket claim
expires unnoticed because there is nothing in it that can go red. Every clause below now carries a
measurement, a date, and — where a symbol can carry the entry at all — a `**Gate**` that
`roadmap-status.mjs` resolves against the tree and fails when the symbol appears. Where no symbol
can, the clause says so and is counted rather than dropped.
**37** — **Unverifiable by a symbol**, ruled 2026-09-04, and this entry is what the grep-reach
signal exists to report: it names a feature and no name. The refusal register's ruling applies
verbatim — *a negative-existence premise gets a row and a gate; a taste premise is marked
unverifiable and is not gated* — and 37 is both at once. *Should the prompt be bracketed* is
taste; *is it bracketed* is negative-existence and **no single symbol carries it**. A separator is
a row the shell composes, and every candidate name measured — `separatorRow`, `regionSeparator`,
`divider`, all zero in `src/` — is one this session would be inventing. Inventing it is F161's
cost precisely: a symbol, a count and a date are what a ruling looks like from outside, and all
three can be present with nothing behind them. What was measured instead is the satisfier side,
and both halves of the entry's own correction hold: `ThemeTokens.background` is
`"terminal" | "surface"` (`src/presentation/theme/types.ts:137`), so 39's correction landed and a
theme may declare a fill — and `"terminal"` stays legitimate, so a separator still cannot depend
on one. The blocker is 29's budget, not a ruling.
**48** — re-read a sixth time, 2026-09-04, and the figure is `nameExactnessSignal`'s own:
566 of 1759 members exact, 32.2%. The four readings before it were 382/1171 (32.6%), 388/1219,
389/1220 (31.9%). **The composition reading the entry asked for is taken on the increment, which
is the half that was free**: the base moved 1220 → 1759 and the exact count 389 → 566, so the 539
members that arrived are 32.8% exact against a standing 32.2% — new members carry the ratio rather
than diluting it, and *the blind spot is proportional* is now measured on the margin as well as on
the whole. **What that still does not answer**, and the entry's note is right to ask for it, is
whether members moved *out* of exactness while others moved in — `AskOptions.placement` is the one
instance anybody has: 1177 → 1179 members, 382 → 381 exact. Reaching it needs the set and not the
total, which is one added field on `nameExactnessSignal`'s return in
`tools/enforce/module-graph.mjs` plus a worktree at the 2026-08-15 commit to diff against — cheap,
not free, and named here rather than done because the signal is not this document's to change.
The by-use signal beside it also moved: 114 of 433 published members named by neither example
(86 of 325 when the entry was written), 170 of 302 clearings ambiguous and none able to list, and
17 named only in an example's *tests*, which is a third category the earlier reading had no row
for.
**26** — **Unverifiable by a symbol**, ruled 2026-09-04, **and the entry's own recorded symbol has
the wrong sign.** The body ends *Symbol: `documentView.open`*, and `documentView.open` is called
at `src/shell/execution.ts:1099` — present, on the one path that pushes a view. An entry carrying
a symbol that exists satisfies the grep-reach count above, which counts backticks and cannot count
signs; that is the count's blind spot, found by resolving the first symbol it certified. The live
claim measures instead, and it is a *relationship between two call sites*: the only settlement a
view ever writes is `deps.transcript.settle(settle.into, noticeDoc(line, `${verb} opened a view`
…))` at `src/shell/execution.ts:983`, guarded by `settle.into !== null` — so a **deferred**
invocation leaves a record because roadmap 33 gave it an entry before it ran, and a directly
submitted one leaves none. The direct push is `pushView` (`src/shell/actions.ts:141`) and it
appends nothing; both pop sites — `viewPop` (`src/shell/keys.ts:900`) and `cancelThis`
(`src/shell/execution.ts:895`) — patch nothing, and the second says so in its own comment. No
single name can be absent for that: `append on push, patch on pop` is a pair of missing calls, not
a missing symbol, and `DocumentViewDeps` names no transcript at all — `transcript` occurs once in
`src/shell/document-view.ts` and the once is a comment, which is why the gate arm strips comments
before it resolves anything.
**32** — the retraction reached the body and **not** this clause, which is F86/F89/F92's own
mechanism landing on the sentence that cites them. F89 retracted *CommandPolicy is exported and
unreachable — a config field*: `CommandPolicy` is exported (`src/index.ts:278`) and reachable,
`TuiConfig.commandPolicy` (`src/shell/types.ts:430`) threading through `src/shell/config.ts:108`
to `src/shell/execution.ts:174`, so an app supplies its own prefix today. Confirmed at HEAD
2026-09-04. **The surviving half is the whole entry**: prefix-*out* — prose by default, verbs by
exception — is inexpressible, because `prefixPolicy("")` makes every token a verb
(`src/interaction/parser/policy.ts:33`), and what it needs is a ruling about where the default
route lives rather than a field. **Gate**: `defaultRoute` occurs zero times in `src/` — measured
2026-09-04, and red the day the name appears, whichever way the ruling goes.
**49** — re-measured 2026-09-04 and **the count claim was stale in the direction that flatters the
tree**: `test/golden/` holds **twelve** test files, not five, and **two** import from `src/shell/`
— `continuation.test.ts` (`commandRows`, `noticeDoc`, `PROMPT_GUTTER`) and `patch.test.ts` (`b`,
a builder rather than paint). A grep for `shell/` says three; `containment.test.ts`'s hit is the
string `shell/session.ts` inside a stack-trace fixture, which is the encoding trap this document
has met before and the reason the figure is imports and not matches. **The gap is unmoved at one
of eight**: chrome rows are covered and the background base, the prompt window, the elision
markers, the selection wash, the height arithmetic, the cursor sequences and the write-as-a-diff
are not — so seven golden files were added without a frame among them, which is the entry
demonstrating itself a second time rather than being restated. F163.

**3 left this list on 2026-09-04, and the record was disagreeing with itself in three places.**
The evidence table said `| 3 | PART |`, the Order column said nothing — which means OPEN — and this
paragraph both listed 3 as confirmed-OPEN and said in its own prose that *3 is PART in the table
above … rather than open*. **`roadmap-status.mjs` agreed with all three**, because its
two-records-of-one-fact check (F667) iterated the *marked* rows and a blank column is not one. The
column now says PART, the arm now iterates the table and reads a blank column as OPEN, and the
entry's residue carries a gate rather than a sentence: `tensor` occurs zero times in `src/`,
re-measured 2026-09-04. The sentence this paragraph used to carry — *`tensor` and `heatmap` occur
zero times in `src/`* — is kept above in the record of its own correction, and it is the second of
the two instances that argued for the gate arm at all.

**52 left this list on 2026-09-04**, by being built rather than by being re-read, and its clause is
the measured case the gate arm was written from. It said `camera`, `azimuth`, `elevation` and
`halfBlockRows` occur zero times in `src/presentation/plot/`; they occur 33, 7, 7 and 1. The entry
set its own condition — *the field, the cache-key axis and one binding land together or none does*
— and all three landed: `RenderContext.cameras` (`src/presentation/blocks/types.ts:134`),
`Cameras.key` (`src/shell/cameras.ts:126`) and the orbit bindings (`src/shell/construct.ts:1426`).
BUILT in the column and in the table as of 2026-09-04.

**33 left this list on 2026-08-15**, and its evidence expired the moment the code landed —
*no queue of any kind in `src/shell/`, the word does not appear* is now false by construction.
**That is the instance `roadmap-status.mjs`'s new negative-claim arm names as its own blind
spot**, becoming false in the same session that named it: the arm reaches file paths and not
symbols, so nothing would have caught this but the suite going red for another reason.

**22 left this list on 2026-08-15**, and it is the second entry this month to leave it by
being built rather than by being re-read. Its evidence was *there is no `art` builder*, which
was true and is the shape that reads as coverage: an entry whose blocker is *nothing has been
written* stays confirmable indefinitely, and confirming it is not work. What moved it was
writing the thing.

**44 left this list on 2026-08-15**, and its evidence was true to the end:
`interaction/history/persist.ts` **is** C20's history persistence and is not session resume.
Something else is — `src/shell/construct.ts` loads a saved transcript behind a declared policy,
seeds the writer and appends the documents in order, so the session opens at the bottom on the
newest of them and restores no offsets and no focus, which is 44's own ruling falling out of
`append` rather than needing a rule. **Second entry this session whose citation resolved while
its conclusion had expired**, after 11's.

**And its first placement moved a number, for the second time in one session.** The paragraph
was written where the list names **26** and **32**, so the signal read `construct.ts` as
**32**'s symbol — the identical proximity defect that had put `code.ts` against **37** an hour
earlier, reintroduced by the fix's own author. A signal attributed by adjacency is one that
prose placement can move, and knowing that is not the same as remembering it while writing.

**9 left this list on 2026-08-15**, and by a reversal rather than a build finding: the refusal
rested on `lowlight`'s 121 KB read as a size limit when it is evidence of a subset import path.
The dependency is adopted, `mermaidCode` is published, and `DEPENDENCIES.md` gains its first
non-permissive row.

**The satisfier-side pass, 2026-08-15, over all eleven.** Nine are unmoved and their evidence is
exact rather than blanket: **22** has no `art` builder; **26**'s successful push touches the transcript on
no path; **30** has no block-valued paste; **32** carries F89's retraction; **50**'s `Style` still has no italic; **29** is unmoved on
its fifth check. **Two moved and neither is a build**: 48's base is 389 of 1220 and its *ratio*
has not moved across three readings, and 49's count held at five golden files with none importing
from `src/shell/` — through a capability field, a palette and sixteen spinner sets, which is the
entry demonstrating its own claim.

**The satisfier-side pass, 2026-08-16, and it is the first one where the satisfiers were built
in the same session.** 30, 33, 50 and 51 landed since the last pass, plus the `⎿` mark. Three
entries moved and none of them by being worked on — which is the whole argument for running this
from the satisfier's side rather than the entry's.

**26 — its evidence expired, and by two entries away.** The row read *a successful push touches
the transcript on NO path*, exact rather than blanket, with `execution.ts`'s own comment as the
citation. **False at HEAD.** Roadmap 33's queue made a deferred view invocation own an entry
before it runs, so `runIntoView` now settles it — `${verb} opened a view`, muted, carrying the
continuation mark — and the comment that was the evidence is the comment that had to change.
**Disposition: partial.** It does not close 26: there is still no patch on pop, no `⏎` to
re-enter, and a view pushed *directly* still leaves nothing. What it removes is the entry's
strongest sentence. The record for a queued push is now two rows, which is a trace of a view in
the transcript arriving on one path, by another entry's mechanism, for another entry's reason.

**49 — falsified in the same session that re-measured it.** Its evidence held at *five golden
files and not one imports from `src/shell/`*, re-measured on 2026-08-15 as the entry
demonstrating its own claim. `test/golden/continuation.test.ts` imports `commandRows`,
`noticeDoc` and `PROMPT_GUTTER`. **Disposition: partial, and the fraction is the point** — it
covers **one** of the eight things the entry names (the chrome rows) and none of the other seven:
the theme's background base, the prompt window, its elision markers, the selection wash, the
frame's height arithmetic, the cursor sequences, the write-as-a-diff. A frame that reaches
`src/shell/` at all is what the entry said did not exist, so the count claim goes; the gap does
not.

**35 — not moved, but its blocker stopped being a design.** The entry says the pending entry is
blank, that `settle(id, doc)` already replaces the whole document, and that *nothing puts content
in before it*. What was missing was not the mechanism but the **rendering**: a line that says
what an entry is doing, under that entry's command, marked as subordinate to it. That is now the
`⎿` mark and its two consumers, built for the queue and for the stall detector. So 35's remaining
work is a `noticeDoc(line, …, "muted", …)` at `execution.ts` step 3 and the elapsed-time tier it
ranks second — **a call, not a shape.** Recorded here rather than in 35, because the satisfier is
what moved and nothing in 35 would have said so.

**48 — a fifth reading, and the first one where the ratio moved.** 388/1219, then 389/1220, then
389/1220 again: the entry's subject is that the ratio holds while the base grows. This session
added nine published members and exactness held at **389 of 1229**, so the ratio fell from 31.9%
to 31.6% for the first time across four readings. **The two totals do not say which members
changed**, and that is the fourth instance's own mechanism rather than a gap in this reading:
adding `AskOptions.placement` took an *existing* exact member out, so a net of zero is consistent
with several moving in both directions. Worth a sixth reading with the composition rather than
the totals — which is a measurement the entry does not currently ask for.

**Unmoved and re-checked: 3, 17, 29, 32, 34, 37, 50.** 29 is on its sixth check and 33 already
recorded why it needs nothing of it.

**And 37 was checked from the other side**: not *is the body right* but *was the row fixed*. It
was. That is the question F86, F89 and F92 exist to make routine, and it is the first time this
session it came back clean on the first ask.

**11 left this list on 2026-08-15** with its block half landed and its inline half filed as **50**;
its stay here was corrected first — the word `markdown` **is** in `src/`, as a highlight.js
language on C09's `code` block, so the claim was right and its evidence was not, and the
sentence saying so was first written at the end of this list, where the signal read `code.ts` as
**37**'s symbol and reported a carrier that carries nothing.

**36 and 42 left this list on 2026-08-15**, both marked PART, and both by the same check: reading
the entry's premise against the tree rather than grepping the symbols it names. 36's *edge marker
at container scope* was answered by 46's residue row in a different shape — a row, not a column —
so what is left is position rather than existence. 42's *the keymap is hard-coded* was never true:
`createKeymap` takes the list and has one caller. **Neither would have been found by the sweep's
own method**, because both entries name a feature and not a symbol, which is exactly what the
grep-reach signal reports.

**16 left this list on 2026-08-14**, marked PART. Two of its four steps landed, and the row it
left on was *the confirm and the completion menu are two mechanisms* — which is still true of
the selection and is no longer true of the marker, the placement or the width rule.

**SIXTH SWEEP, 2026-08-13 — every OPEN entry taken to the reader rather than to the symbol.**
Nineteen of twenty-one survive. Two did not, and **both are in the same class**: they name no
symbol a grep could resolve.

| entry | at HEAD |
|---|---|
| **40** as-you-type completion | **BUILT.** `afterEdit()` — `src/shell/keys.ts:441` — is called by the composition root after every printable key and every paste; static sources only (C19 I3, T2.1a), which is the boundary the entry called *"the trigger, not the engine"*. `test/e2e/editor.test.ts:54` watches the menu open on a flag prefix in a real PTY |
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

**SEVENTH PASS, 2026-08-14 — entry 16's cost table taken to the rows, and it asks a different
question.** All six sweeps ask *is this row still true*. This asks **does this row describe the
job the tree has** — and the two failures are independent, which is why a sweep cannot find
this one: **a row can be exactly right about what does not exist and still be wrong about what
building it means.** Entry 16 is the measured case, because every one of its four estimates was
checked against the tree as it was built rather than after:

| the row said | what it was |
|---|---|
| *merge* the selection — "the confirm reimplements it, which is the two-records-of-one-fact class" | a change of **block kind**. The two selections already agreed exactly — `% length` in both directions, in `confirm.ts` and in `keys.ts` alike — so nothing merged, and the two records did not disagree |
| the flip is C19's and the confirm lacks it | **no code at all.** `prefer` is a field of C15's `anchored` arm and of nothing else, so the confirm inherited it the moment step 2 let it be anchored. The row attributed a mechanism to the wrong component |
| `… N more` moves across with it | **not portable.** Only C19 holds a remainder, so the count stays C19's and the confirm drops its payload for a bare `…` |
| *"two parameters are the whole difference"* | three — and `placement` had to be a **choice between** placements rather than a `Placement`, because `anchored` carries a row only the session can compute |

**The shape is one thing said four ways.** A row names an **operation between two existing
things** — merge, share, generalise, widen, move across — and the operation presumes a mechanism
the tree does not have, or a difference that does not exist. It is written from the **surfaces**,
where the two things look different, rather than from the tree, where they may already be the
same code or may share no seam at all.

**Run over the rows it is four entries, not one**, which is what makes it a pass rather than a
note on 16:

| entry | the operation the row named | what the tree had |
|---|---|---|
| **16** one popup | *merge* the selection, *move* the flip and the truncation | one identical implementation, one field of a third component, and one thing that does not travel |
| **23** selection needs a background | a `carries: "meaning"` **palette** applied as a wash | `resolveBackground` refuses any ref that is not `surface.*` — the entry named a mechanism C10 does not have (C10 §4b) |
| **31** completion is unranked | *widen* the filter, prefix → substring, **"one line"** | the verb source emits one word at a time, so the whole name never reaches the filter and widening it changes nothing (C19 I27) |
| **6** flags that select a rendering (§2.2) | *select among* renderings with a flag | `--help` **replaces** the result, and `usageBlocks` lists every flag flat. 2.2 closes with no field |

**Three of the four were found after the entry was picked, and that is the cost.** A stale row
wastes a read; a kind-wrong row wastes the plan built on it. 35 is **not** on this list and the
distinction is the point: its spinner premise is a claim about the tree that *expired*, which is
the sweeps' class and which a sweep did catch. This one was never true.

**The check is one question asked before sizing, and it is entry 48's residue again**: *what do
these two share today* — measured, not read. Entry 16 step 4 is what running it looks like. The
walk asked, found `% length` in both directions in both files, and the step became a store plus
one supplied field rather than a merge of two mechanisms.

**Run over the five symbol-carrying OPEN entries before picking one, 2026-08-14 — and it
moved the pick.** Its first live use, on 24, 29, 44, 45 and 48. Every one of the five symbols
resolves as the sixth sweep said, so a sweep would have passed all five; two do not survive
this question.

| entry | the operation the row names | what the tree has |
|---|---|---|
| **44** session resume | *"the transcript is already a store with a cap and eviction; **persisting it is C20's shape one level up**"* | **A kind error, and the blocker is unnamed.** C20's `persist.ts` writes two **line-oriented text files** through `commandLine`/`metaLine` codecs — `join("")` of rows, append-only, index-aligned sidecar. A transcript entry is a `ViewDocument`: a tree of blocks. The **policy** generalises beautifully — one chain, rewind rather than drop, drain from the last confirmed write — and the **codec does not**. What it actually needs is a document serialiser — **and the rest of this row was wrong, measured 2026-08-14 (F166).** *There is none in `src/`* is false in the direction that made 44 look blocked: a `ViewDocument` is **JSON by construction**, with no function, `Map`, `Set` or `Date` in the block union, and it round-trips byte-identically through `JSON.stringify` and `validateDocument` — which C13's store already calls on every append and every settle. The serialiser is `JSON.stringify`; the hard half exists. What is missing is **one export line** — `validateDocument` is in the component barrel and not in `src/index.ts` — and a round-trip row per kind, of which there are 24 and three are measured. **44 is not blocked on 34**, and it never was: 34's *structured export* is a UX item in a six-item bundle, and this row read it as a codec. **And the walk found what the row is silent about, 2026-08-14 (F168)**: C20's persistence has a *redactor*, and it does not generalise. `redact.ts` is a tokeniser over a **command line**; a transcript document holds what the far side **printed**, and `examples/docker/src/inspect.ts:152` puts every container environment variable into a `keyValue` block — so this as written puts secrets in `stateDir` in plain text, and a rendered document has no tokens to redact. **A ruling is owed and nothing is built until it is taken.** The second finding moves the design rather than blocking it: a history entry is immutable once appended and a transcript entry is **not** — it is patched and settled after it would have been written — so *persist settled entries only*, which makes the file append-only in fact and drops the `live` and `streaming` questions with it. C13 §5b carries both artefacts |
| **24** more default themes | *`light` is dark-on-dark "**which the background ruling fixes**"* | **A deferral chain reading as availability.** The premise is exactly right and better than stated: `surfaces.bg` is declared in both themes and is read **only by the contrast checker** — `theme/contrast.ts` — so nothing paints it anywhere. But the fix it points at is entry **39**, which is RULED and **not built** (`--no-bg` matches nothing in `src/`). The row presents its blocker as done |
| **29** chrome row budget | *rule once — "**FIVE features now want it**"* | Not falsified, and **F161 is the question to ask it**: a count of consumers is an argument only if the consumers share a shape, and two of these five are separate entries with one (46) blocked on 7. Worth checking before it is picked, not before it is read. **Asked and ruled 2026-09-05** (C22 §6k): three share a shape and got a declared footer budget (`chrome.footerRows`); 46 did not and is re-filed |
| **45** configurable cursor | a capability-gated `DECSCUSR` escape, and a blink state machine on the refresh driver's clock | **Survives.** Every mechanism it names exists and is in the right component: `escapes.ts` already holds `mode()` pairs and a `CURSOR` show/hide, so the shape is one more constant of a kind already there; `refresh.ts` owns intervals; `Placed.cursor` is per layer (C15 I19), which is what makes *per focus target* a seam rather than a preference |
| **48** MG24 on the public surface | *tighten the rule* | **Refused by the entry itself**, four times measured, and a fifth in the other direction when entry 16 added `AskOptions.placement`. Its own conclusion is that the fix is a **second consumer** rather than a rule change — which is phase-1 work, so it is not pickable as an entry |

**RUN AGAIN BEFORE THE NEXT PICK, 2026-08-14 — and 29 was the one it was owed.** The first
run left 29 alone with *F161 is the question to ask it: a count of consumers is an argument
only if the consumers share a shape.* Asked, and they do not. **None of the five exists in
`src/`**, so this is about what each would need rather than about what is there:

| the consumer | what it actually wants |
|---|---|
| mode indicator (`NAV`/`EDIT`) | a **label** in a chrome row |
| queued count (`✳ 1 running task`) | a **label** in a chrome row |
| elapsed time | **misfiled.** Entry 35 puts it on the **pending entry** — *nothing composes the notice, and there is no elapsed-time part* — which is a block in the transcript and not chrome at all |
| region separators (**37**) | **whole rows**, three of them, and the entry prices them at 7.5% of a 40-row terminal. Not a label and not a slot |
| where in this container am I (**46**) | a **column.** The scrollbar entry already rules it — *reserve the column always, never conditionally* — with the reason: a column that appears on overflow changes the width, which changes wrapping, which changes whether it overflows |

**Two of five share a shape, one is in the wrong entry, and two are different geometry — one of
those already ruled.** The count was assembled from *things that want screen space* rather than
*things that want the same slot*, which is F161's mechanism arriving in a roadmap row instead of
in a plan. *Rule once* is still the right instinct and its subject is **two** consumers.

**And both of those two are themselves unbuilt** — the mode indicator waits on C26 §4's modes
and the queued count on **33** — so 29 today is a slot with nothing to put in it, which is the
vacuity an invariant has until its subject exists.

**Where that leaves the four symbol-carrying OPEN entries: none is pickable as it stands.**
24 waits on 39, 44 on 34, 48 is refused by its own conclusion, and 29's two real consumers are
unbuilt. **That is a fact about the frontier rather than about the entries**, and the useful
reading of it is that the next move is to unblock rather than to pick: **39** is already RULED,
is the smaller of the two blockers, and closes a *shipped* defect — the light theme sets
foregrounds and paints nothing behind them, and `surfaces.bg` is declared in both themes and
read only by the contrast checker.

**Two of five, and both would have passed a sweep**, which is the case for the pass being a
question and not a rule. Neither is a stale citation: 44's sentence about C20 is true, and 24's
sentence about the background ruling is true. **What is wrong is the job each implies.**

**Not mechanised, and that is a ruling rather than a gap.** The operation verbs are greppable and
a rule over them would report rows rather than errors — every row on a roadmap names an
operation, so the population is the whole list and the signal says nothing about any member of
it. That is A03 §2's vacuity class arriving in the instrument again, which is the shape the
grep-reach signal was nearly built in. This is a **read**, like the sixth sweep's two arms, and
nothing reaches it but running it.

**Not checked, and named rather than left to look checked:** 2, 4. Two of fifty-one, and they
are the two that **cannot** be checked from here: each names `prism-tui`, a consumer repository
that does not exist in this tree. That is a different state from *not looked at* and it is said
rather than folded into the other two — an OPEN nobody verified reads exactly like one somebody
did, and so does one nobody could.

**The third left this list rather than being checked in it**, and the distinction is the
paragraph's own subject. Entry 3 was here because it named `prism-tui`, and naming a consumer
is not the same as waiting on one: *with prism-tui as the consumer* says who validates the
design. Nothing in the entry needed that repository to exist, and the tree says so —
`examples/docker/src/container.ts` calls `b.plot` today. **A membership test that reads for a
name rather than for a dependency will hold whichever entries mention the right word**, which
is how an entry sat in the uncheckable set while carrying a check somebody had run and dated.

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
