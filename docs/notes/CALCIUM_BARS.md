# Bars — the styles, the widths, and the categorical palette

For a `bar` style set alongside `spinnerFrames(caps, name)`. Sibling to
`CALCIUM_SPINNERS.md`, and the two share a shape: **a named set, capability-tiered, carrying
its own metadata, resolved by the framework rather than assembled by each app.**

---

## The constraint that shapes everything below

**There is no narrow full block.**

```
narrow    ▐ ░ ▬ ▪ ▫ ▮ ▯ ▰ ▱ ◼ ◻ ⣿ ⡇ ⢸ ⠿
unsafe    █ ▉ ▊ ▋ ▌ ▍ ▎ ▏ ▒ ▓ ━ ─ ■ □ ● ○ ◾ ◽
```

`█` is **EA=Ambiguous** and **so is every eighth-block** — `▏▎▍▌▋▊▉`. So **sub-cell horizontal
fill is not expressible at all**, and the smooth bar every progress library ships is unsafe:
two cells in a CJK locale, on a machine nobody who built it is using.

**`▐` is narrow and `▌` is not**, which is Unicode's own inconsistency rather than a design
choice — and it is why the reference statusline's gradient bar doubles wherever ambiguous is
treated as wide.

**Assert it at construction**: every glyph of every registered style is one cell and has no
emoji form. That is the row that stops the next addition being `▓ ▒ ░`.

---

## ★ Measured against `ambiguousWidth`, 2026-08-15 — and it is a fifth catalogue error

**Every style in this document was checked with `cells()` at both conventions, now that the
field exists.** The result is stronger than the correction section below predicted, and it
contradicts the framing of the determinate table:

```
halfblock  ▐ ░   narrow 1 1   wide 2 2   AMBIGUOUS
rectangle  ▬ ░   narrow 1 1   wide 2 2   AMBIGUOUS
beads      ▪ ▫   narrow 1 1   wide 2 2   AMBIGUOUS
posts      ▮ ▯   narrow 1 1   wide 2 2   AMBIGUOUS
slant      ▰ ▱   narrow 1 1   wide 2 2   AMBIGUOUS
squares    ◼ ◻   narrow 1 1   wide 2 2   AMBIGUOUS
comet      ▬▪▫░  narrow 1111  wide 2222  AMBIGUOUS
braille    ⣿ ␠   narrow 1 1   wide 1 1   stable
ascii      # -   narrow 1 1   wide 1 1   stable
arrow      = ␠ > narrow 1 1 1 wide 1 1 1 stable
```

**Six of the seven unicode styles are ambiguous throughout, and `braille` is the only unicode
style that is width-stable.** The table below says *`▐` is the only narrow half block*, which is
true and is about a different question — which glyph is one cell **at the narrow convention** —
and it reads as though the others were the wide ones. They are not: they are *Ambiguous*, so
every one of them is one cell on a terminal that says narrow and two on one that says wide, and
a bar whose glyphs double is not a bar.

**So `ambiguousWidth` is a tier here and not a filter**, exactly as `spinnerFrames` already
treats it: each style declares `narrowOnly`, and a `wide` terminal falls to `ascii`. Six styles
carry the flag, `braille` does not, and that is the whole of the field's effect on this
document. **The refusal list is therefore not a list of styles that cannot ship** — it is the
narrow tier, which is what the correction section argues and what this measurement makes exact.

**The fifth catalogue error, and it is the same shape as the other four**: a statement true
about the glyph it names, generalised to the set it sits in.

## Determinate — a total is known

| name | on | off | notes |
|---|---|---|---|
| `halfblock` | `▐` | `░` | `▐` is the only narrow half block. Reads as a striped bar |
| `rectangle` | `▬` | `░` | reads as a solid line — the closest thing to a filled bar |
| `beads` | `▪` | `▫` | dotted and quiet |
| `posts` | `▮` | `▯` | heavier beads |
| `slant` | `▰` | `▱` | distinctive, and it reads as motion at rest |
| `squares` | `◼` | `◻` | the same pair as the todo checkbox — one vocabulary, two uses |
| `braille` | `⣿` | ` ` | `⡇` is the left column, so **half-cell resolution — the finest available** |
| `ascii` | `#` | `-` | wrapped in `[ ]`. The fallback, and it needs no substitution |
| `arrow` | `=` | ` ` | with a `>` head. ASCII, and it reads as travelling |

**`braille` is the only style with sub-cell precision**, and it is half a cell rather than an
eighth. **That is the ceiling**, not a shortcoming of the style.

---

## Indeterminate — a different question, not a degenerate case

**No total means no fill.** These are motion sets rather than bars, and they answer *something
is happening* where a determinate bar answers *how far*.

| name | notes |
|---|---|
| `travel` | a single cell walking, wrapping at the end |
| `bounce` | ping-pong, so there is no wrap jump |
| `comet` | a head with a two-cell tail — `▬ ▪ ▫ ░` |
| `wave` | braille at four levels, which is the only style with vertical range |

**No `pulse`.** A whole bar changing character is more motion than the state deserves, and it
draws the eye harder than anything it could be reporting.

### And a model call has no percentage

**Which is why a compaction bar would be fake.** `/compact` is a summarising call plus a drop —
the call has no progress and the drop is instant.

**The honest display is the context bar before and after:**

```
❯ /compact

⏺ summarising 8 turns                              4s · 1.2k tok
  ⎿ ▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░  62%  31k/50k
    ▐▐▐▐▐▐░░░░░░░░░░░░░░░░░░  19%   9k/50k     ← after
    8 turns → 1 summary · 22k freed
```

**A spinner while it generates and the bar shown twice.** The question is not *how far through*
— it is **how much did that buy me**, and two bars answer it directly.

---

## Segmentation is a colouring, orthogonal to the style

**Every style segments.** The glyph pair and the colouring are two independent properties, so
this is `style × segmentation` rather than a segmented style.

```
bar(style, value)          plain
bar(style, runs)           segmented — same style, a run list
```

**`beads` and `posts` segment better than `halfblock`**, and the reason is worth knowing: **the
gaps between discrete marks make a colour boundary read as a boundary**, where a continuous bar
makes the same boundary read as a gradient.

### The palette is a third axis, and `Tone` cannot carry it

```
Tone         judgement      ok · warn · error
change axis  a change       added · removed · modified          F30/F49/F51
CATEGORY     distinctness   n classes, no order, no meaning     ← this
```

**"These are eight different kinds of thing" is not a judgement**, so a categorical palette is
a *qualitative* palette in the dataviz sense and has no expression here today.

**Okabe-Ito at the top rungs** — eight colours designed for colour-vision deficiency, and the
standard for exactly this problem.

### The tiers follow 39's ladder

```
24-bit · 8-bit   8–12 distinct, provable
4-bit            capped at 8, curated indices, DISTINCTNESS ONLY
1-bit            zero — characters or nothing
```

**The 4-bit rung is the high-contrast theme's finding again**: *the rung an accessibility claim
most needs is the one it can least guarantee.* At 4-bit the colours are whatever the emulator
says, so **distinctness is what the curated map promises instead of contrast.**

### The palette caps the consumer, and that is the ruling

**A segmented bar declares its categories, and the framework refuses more than the palette can
distinguish.** Silently reusing a colour is **a segmentation that lies**, which is worse than a
refusal at construction.

**And the cap has a real consequence rather than being theoretical.** An agent's context splits
ten ways or more — system prompt, tool schemas, user turns, assistant turns, reasoning, tool
results, pastes, images, compaction summaries, files read. **Eight is not enough for the finest
split**, so the framework caps and **the app groups** — which is the correct division rather
than a limitation.

---

## Character segmentation — the 1-bit carrier

```
[###+++======***----]
 sys tools  turns file
```

**The only form that carries composition at every depth.**

**An option rather than the default**, because it is noisier where colour works. The existing
ruling stands — *the composition is an explanation, not a safety signal, so losing it at 1-bit
is honest* — **but a consumer that wants it has a way.**

---

## Degradation

**Each style carries its own ASCII fallback, paired by shape rather than by name.**

```
halfblock · rectangle  →  #-      a fill is a fill
beads · posts · squares →  o.      discrete marks stay discrete
slant                  →  //      the lean survives
braille                →  #-      sub-cell precision is lost and cannot be kept
travel · bounce        →  a single character walking
comet                  →  >=-     the head and tail survive as characters
wave                   →  ~       or it falls to `travel`, which is honest
```

**Degradation preserves meaning, not appearance** — but a bar that fills should not fall to a
bar that travels, and a discrete style should not become continuous.

---

## Where a bar goes, and where it does not

**The context bar is the footer's, segmented, and it is the composition's only home** — a
second row for labels is a chrome row nobody has (roadmap #29).

**A tool's progress is a block**, because `docker pull`'s per-layer output is N bars advancing
independently and **rows that complete rather than merely change** — which is the difference
from a live table and the reason `progress` and `steps` exist as kinds.

**And an indeterminate bar is usually the wrong answer.** If the far side reports nothing, a
**spinner in the gutter plus elapsed time** says the same thing in one cell — and *elapsed time
distinguishes slow from stuck where a bouncing bar does not.*

---

## ★ Correction — ambiguous width is a capability, not a refusal

**Everything above treats an ambiguous-width glyph as unusable. That is wrong, and it is the
same error this project has corrected four times: a hard no where the tree has a tier.**

**Ambiguous width is not a property of the character.** It is a property of *the terminal*:
Unicode's `East_Asian_Width=Ambiguous` means **the renderer decides**, and it decides by locale
and by configuration. A Western terminal draws `▌` in one cell. A CJK-configured one draws it
in two. **The character is one cell or two depending on where it is drawn, which is exactly
what a capability is.**

### `TerminalCapabilities` has no field for it, and that is the gap

```
colourDepth  1 | 4 | 8 | 24
unicode      full | bmp | ascii
mouse · imageProtocol · altScreen · bracketedPaste · synchronisedUpdate
```

**Nothing about width.** So `cells()` assumes narrow, every ambiguous glyph is a silent hazard,
and the framework's only defence has been to refuse them — which costs the entire block-element
and box-drawing repertoire for a case most consumers are not in.

### The field, and it cannot be detected

```
ambiguousWidth: "narrow" | "wide"
```

**No probe.** `COLORFGBG` does not carry it, C02 refuses interactive probes, and the DSR
cursor-position trick that *would* answer it is exactly the round trip C02 exists to avoid.

**So it is declared, not detected** — and that is fine, because **it is a setting the user
already has.** tmux, iTerm2, Konsole and WezTerm all expose it, and a reader in a CJK locale
knows they are. `narrow` is the honest default because it is the common case; `wide` is the
one-line opt-out.

### What it unlocks, which is most of what has been refused

```
█ ▉ ▊ ▋ ▌ ▍ ▎ ▏     eighth-blocks — sub-cell horizontal fill, and a smooth bar
▁ ▂ ▃ ▄ ▅ ▆ ▇       the eight-level vertical ramp — the sparkline's own RAMP_UNICODE
░ ▒ ▓ █             the four-level shade ramp — the heatmap's planned degradation
┼ ┤ ─ ╰ ╭ ╮ ╯ │     box drawing — CONNECTED LINE CHARTS with proper joins
● ○ ■ □ ◐ ◑         the round and square pairs
```

**The connected-line aesthetic is the one worth naming.** Proper line joins require
box-drawing, box-drawing is ambiguous throughout, and braille cannot make a joined line — so
**a chart that looks like `simple-ascii-chart`'s or `asciichart`'s is only expressible under
`ambiguousWidth: "narrow"`.** That is a real capability tier, not a style preference.

### The shape it takes, which is the ladder this project already uses

```
narrow (default)   the full repertoire — eighth-blocks, box drawing, shade ramps
wide               the narrow-only set, which is what CALCIUM_BARS.md lists today
```

**Every set gains a second arm rather than losing its first.** `RAMP_UNICODE` becomes
`▁▂▃▄▅▆▇█` at narrow and the braille density ramp at wide. A line plot becomes box-drawing at
narrow and braille at wide. **The braille forms already exist and become the fallback rather
than the ceiling.**

### And it makes the four findings tiers rather than defects

`▌` in the reference statusline, `RAMP_UNICODE` in `sparkline`, `░▒▓█` in the heatmap plan,
and `┼─╰╭` in every ASCII chart library — **all four are correct under `narrow` and wrong
under `wide`**, which is a much more useful statement than *unsafe*.

**`sparkline` is still a defect**, because C11 calls it for a table cell and **it declares no
assumption at all** — but the fix is *declare the tier*, not *lose four levels of resolution*.

### The cost, stated

**A second arm per set is real work** — every ramp, every bar style, every chart renderer.
**And the default carries the risk**: `narrow` is right for most and silently wrong for a CJK
reader who has not set it, whose tables will misalign exactly as they do today.

**Which is why the default is the honest half of the ruling**, and it should be argued rather
than assumed: **narrow, because it is the common case and the failure is visible immediately**
— a doubled bar is obvious, where a refused character is a permanent absence nobody sees.
