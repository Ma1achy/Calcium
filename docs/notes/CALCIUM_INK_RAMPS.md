> **Reconciled against HEAD, 2026-09-06, at `10ed2733` on `feat/plot-arm-unification`** — from the
> substrate-arc drop (`README_SUBSTRATE_ARC.md`). The text below is the drop's, unchanged; this
> preface is what the tree says where the note and the tree differ. A `file:line` is where the
> symbol was on the day — grep the symbol.
>
> **Status: built 2026-09-06, round one** — a text run (grapheme extent) and the progress bar (axis
> extent), the three fills, five of the nine loops. Design and both walks in
> `CALCIUM_INK_RAMPS_DESIGN.md`; contract in C04 §3am.2, C09 §5 *Ramps*, C10 §4h. **Three departures
> from this note, each with its reason there**: text ramps take slot pairs and palettes while colormaps
> stay on the bar (C10 I26's floor is per slot); 1-bit resolves to `from`, not a midpoint; `palette`
> takes no name (F837). The one-shots and the position effects are deferred with symbols (design §7).
> Every mechanism the note names was checked for existence before this was filed — the drop's own
> warning is that a definite article is the tell.
>
> | the note says | the tree, measured |
> |---|---|
> | §9, *spans are the prerequisite — a line is runs of `{text, style}` today* | **landed 2026-09-04** as `TextSpan` on `Raw`/`Notice` text (`src/data/viewmodel/types.ts`, C04 §3am, I85–I91, I105): `{from, to, bold?, italic?, underline?, tone?, value?, elide?}` in code units, cut into runs by `runsOf` (`src/presentation/runs.ts`). `CALCIUM_SPANS_DESIGN.md` carries both walks. **The prerequisite is met and the grapheme question is already answered there**: a span boundary inside a cluster is the design's §3 ruling, not this note's to re-take |
> | `continuousColour(map, t)` | exists — `src/presentation/theme/colormap.ts:71`; `COLORMAPS` at `:30`, `viridis`/`inferno` present; `okabe-ito` in `src/data/colormaps/qualitative/` |
> | `ANIMATES` *is the per-kind record* | exists — `src/presentation/blocks/animation.ts:18`, `Record<BlockKind, boolean>`, with `animationIntervalOf`/`tickIntervalOf` beside it |
> | `#armSpinner`, `spinnerIntervalMs` | both exist — `src/shell/session.ts:740`, `src/presentation/blocks/glyphs.ts:858` |
> | `RAMP_EXTENT` | **built** — `src/presentation/blocks/ramp.ts`, an exhaustive `Record<BlockKind, "none" | "clusters" | "axis">` (C09 I50) |
> | §1, *a plot line is `refOf(i)` once* | measured: a polyline `Mark` carries **one** `ref` (`plot/marks.ts`), so a line coloured along its length is a mark-shape change and not a per-point call; deferred with the symbol `Mark.refs` (design §7) |
> | §3, *the render cache carries the tick axis* | measured **true**: `session.ts:1196` keys the slot on the tick when `animationIntervalOf` is non-null (C22 I60, F233). The comment in `render-cache.ts` said the opposite and was F836 |
> | §2, *the waffle and the pie already cycle a palette* | they cycle the theme's categorical slots through `refOf`; `QUALITATIVE_PALETTES` has no consumer in `src/` — F837, and why `palette` takes no name |
> | §6b, one colour per cell, two stops through a block glyph | consistent with C10/C09 as built; `TextSpan.value` already paints a **background** through the block's `colormap` (C04 I90), which is the first per-grapheme colour channel and the seam a ramp would share |

# Ink ramps — a colour that varies over an extent

**One mechanism, not three features.** The framework already resolves `[0,1] → Colour` for
heatmaps, colormaps, the 3D surface and the overlay. **The gap is that only *field* forms can
reach it** — text, borders, bars, lines and every other ink take one resolved tone and hold it
for their whole length.

**So the change is: an ink can be a ramp rather than a tone.** Everything else — gradients,
shimmer, a stepped border, a palette-cycled bar — is *where you are allowed to say it* and
*what the extent means there.*

---

## 1 · Why it is one mechanism

**A gradient across a title, a plot line coloured by value, a bar shaded along its length and a
shimmer moving through text are the same object**: a function from a normalised position to a
colour, evaluated per unit of some extent.

```
a run of text       vary over CHARACTER INDEX
a plot line         vary over SAMPLE INDEX — already value → [0,1] in the shared layer
a bar               vary over ITS OWN LENGTH
a border            vary along ITS EDGE
a block's ink       vary over whatever the kind declares
```

**The plot half is nearly free.** The shared layer already produces normalised positions, so a
gradient line is `continuousColour(map, t)` per point where a solid line is `refOf(i)` once.

---

## 2 · Three fills, and all three are `[0,1] → Colour`

```
gradient    smooth interpolation — two tones, or across a colormap
step        N discrete bands — the horizon's key and the contour's levels already
            do this, and a band that claims continuity it has not got is a defect
            this project has already ruled against
palette     cycle a categorical palette — the waffle and the pie already do it
```

**Three kinds rather than one because they mean different things.** A gradient says *this
varies continuously*; a step says *these are N groups*; a palette says *these are unordered
identities*. **Drawing one as another is the encoding-rule violation C12's ramp types exist to
prevent.**

**And each takes the existing vocabulary**: a colormap name for `gradient` and `step`, a palette
name for `palette`, or an explicit pair of `ColourRef`s. **Never a hex literal** — C10 owns
colour and the SVG arm already learnt this the hard way.

---

## 3 · Animation is one field on top, and the static case is the same code

### The set

**Every one is `t' = f(t, tick)` — one line of arithmetic before the ramp is sampled.** That is
what makes them a set rather than a feature each.

```
none        t' = t                                   the default

shimmer     a narrow bright band slides through       ← Claude Code's, measured
            the extent. t' = t, but the ramp is
            sampled AT the band and at the base
            elsewhere

wave        the whole ramp translates through the     a gradient that flows
            extent: t' = (t + φ) mod 1

breathe     the whole run moves together between      slow, calm, no position
            two points: t' = ½(1 + sin φ),
            constant across the extent

pulse       breathe, but the ramp is stepped —        a discrete on/off rather
            two states, not a slide                   than a fade

heartbeat   two quick beats then a rest —             attention without alarm
            a double-bump envelope, ~1.2s cycle

sweep       one pass of a band, then stop.            a completion, a landing —
            NOT a loop                                and the only one that ends

typewriter  the ramp reveals left to right and        an arrival, and it is a
            holds. Also not a loop                    mask more than a colour

marquee     the ramp translates and wraps — wave      when the run is wider than
            with the phase tied to the extent          the region

ripple      a band from the centre outward,           a confirmation, and it
            or from a named index                     needs an origin
```

**Nine plus none, and three of them do not loop** — `sweep`, `typewriter` and one arm of
`ripple`. **That is a real distinction**: a looping animation is a state, and a one-shot is an
event. **They belong to different things and the field should say which.**

### What each is FOR, because a set with no purpose becomes decoration

```
shimmer     working — a spinner's text, a running call's head
wave        a gradient that is already there, given motion. Static is the default
breathe     waiting on the reader, not on the machine. An unanswered question
pulse       a state that changed and has not been seen
heartbeat   alive, when nothing else says so — a stream with no output
sweep       done. It ends because the thing ended
typewriter  arrived — new content, once
marquee     text that does not fit, and the reader needs the rest of it
ripple      acknowledged — a keypress landed, a value was set
```

**And the rule that keeps it honest**: an animation says *what is happening*, never *look at
this*. **A decorative loop on a settled thing is noise**, and a transcript full of motion is a
transcript nobody reads.

### Timing belongs to the effect, not the caller

```
shimmer     one cell per tick               tied to the extent, so a long run
                                            takes longer — which is correct
wave        one cell per tick, wrapping
breathe     ~2.0s per cycle                 slow enough to be calm
pulse       ~1.0s                           fast enough to be noticed
heartbeat   ~1.2s, two beats front-loaded
sweep       ~0.6s, once
typewriter  ~30ms per grapheme, capped      so a long run does not crawl
marquee     one cell per tick, paused ~1s   at each end
ripple      ~0.4s, once
```

**One number per effect, in the effect, the way `spinnerIntervalMs` belongs to the set.** A
caller choosing a period gets two callers choosing differently for the same meaning — **which is
the drift the spinner sets already refused.**

**And C03's 100 ms window is the floor for all of them.** An effect asking for 30 ms gets 100
and **the reason is the scheduler's, not the effect's** — the same correction the orbit's frame
rate needed.

### The degradation, per effect

```
24 · 8-bit    as designed
4-bit         the RAMP steps and the MOTION stops. Three colours moving is a
              flicker, and a flicker is worse than a static tone
1-bit         one tone, no motion. The ramp resolves to its midpoint
```

**Except `typewriter` and `marquee`**, which are position rather than colour — **they survive to
one bit**, because a reveal and a scroll need no palette at all.

**That distinction is worth stating**: an effect that carries meaning through *colour* dies at
4-bit; one that carries it through *position* does not. **Two classes, and the record should
say which each is.**

**`t` gains a term from `tick`.** The static case is the same evaluation with that term at zero,
**so there is one code path and animation is a parameter rather than a mode.**

**And the animation half already exists.** `tick` advances (S4), `status` and `steps` animate
through it, `ANIMATES` is the per-kind record, and the render cache carries the tick axis. **A
shimmering block joins the list; nothing new is built for the motion.**

**The render stays pure** — the frame is a function of `tick` rather than of a clock, which is
the ruling that made the GIF catalogue deterministic and committable.

---

## 4 · Declarative, not a callback

**A caller names a ramp; it does not supply a function.**

```
✓   { fill: "gradient", from: "tone.accent", to: "tone.muted" }
✓   { fill: "gradient", colormap: "viridis" }
✓   { fill: "step", colormap: "inferno", bands: 5 }
✓   { fill: "palette", palette: "okabe-ito" }
✗   { fill: (t) => …  }
```

**Because a document has to stay serialisable.** An agent should be able to ship a shimmering
block or a gradient-lined plot **with no app code**, which is the same argument the widget
bindings took — and the same reason `plotToSvg` takes a block rather than a sequence.

**A closure would also put appearance behind a function `measure` cannot see**, which is the
class C12 I11 forbids.

---

## 5 · The extent is per kind, and that is the design's real content

**A ramp needs to know what it varies over, and there is no universal answer.**

```
text            character index — and it must be GRAPHEME index, not code units,
                or a ramp across an emoji or a combining sequence tears
a plot series   sample index, or the sample's VALUE. Two different pictures and
                the caller picks
a bar           its own filled length, so the ramp compresses as the bar shortens —
                or the axis, so bars of different lengths share a scale. RULE WHICH
a border        perimeter distance, which is not the same as x or y
a block's ink   the kind declares its extent or it declares none, and a kind with
                none simply cannot take a ramp
```

**So `RAMP_EXTENT` is a `Record<BlockKind, …>` or a per-member declaration**, exhaustive, and a
kind that has no meaningful extent says so rather than silently taking the first colour.

**This is where the design work is.** Everything else is composition.

---

## 6 · Degradation, and the rule is C10's own

```
24-bit      the ramp as computed
8-bit       quantised through the 256-cube — already how colormaps degrade
4-bit       three or four distinguishable steps at best. A GRADIENT BECOMES A STEP
            and a shimmer becomes a flicker
1-bit       one tone. The ramp resolves to its midpoint
```

**The ruling: a ramp that cannot resolve distinct colours at a rung falls to its midpoint** —
which is `continuousColour`'s existing answer at 4-bit (C10 I26) and needs no new mechanism.

**And an effect that reads as noise at a rung does not draw at that rung.** A shimmer across
four colours is a flicker, and a flicker is worse than a static tone. **`animate` resolves to
`"none"` below 8-bit**, stated as a rung rather than discovered in a frame.

**The SVG arm has no ladder**, so it draws the 24-bit answer always — and **an animated ramp in
SVG is the static one**, per the re-emit-per-frame ruling. Say so, or the arms disagree about a
thing neither is wrong about.

---

## 6b · What a terminal can actually do, measured

**One colour per cell. You cannot ramp within a glyph** — the terminal draws a character in a
single foreground colour and that is the medium's floor.

**Claude Code was captured byte for byte to check this**, and the result is stronger than
expected:

```
its shimmer          TWO fixed colours — a dim base and one lighter tone — with a
                     1–3 character band sliding one cell per tick through an
                     otherwise uniform string
per character        each redraw addresses individually: an SGR plus a column jump
                     per changed cell. NOT a gradient, and not a run
no sub-cell          every span had background: null across 75 sampled frames
```

**So the reference is doing less than this design allows**, and one colour per cell is not the
limitation it looks like. **A 40-character ramp at 24-bit is 40 steps over ~320 pixels — a few
RGB units each, which is below what reads as banding.**

**Two things make it look finer than it is, and both are the renderer's:** font antialiasing
blends each glyph's edges toward the background, **and glyph density varies** — an `i` and an
`m` at one colour already differ in apparent brightness before any ramp.

### Where sub-cell IS available, and the same capture confirms it

**A block glyph shows its background as well as its foreground**, so `▌` carries two colour
stops in one cell. **Claude Code's progress bars use exactly this** — `48;2` and `38;2` together
on a block — while its shimmer does not.

```
text        one colour per grapheme. Smooth at 24-bit; STEPPED at 8-bit and below
bars ·      sub-cell through block glyphs — TWO stops per cell, genuinely finer
borders     than text can be
plot lines  one colour per cell, and the cells ARE the samples — so the ramp's
            resolution is the plot's resolution rather than a limit
```

**Say this in the spec.** *A smooth gradient over text* is the kind of expectation that reads as
a defect when it turns out to be per-grapheme at 8-bit — **and the honest statement is that it
is per-grapheme everywhere and that is enough.**

---

## 7 · What it costs, and the discipline it needs

**A ramped run misses the cache every tick and re-emits its whole line.**

```
a shimmering title          one row, ~80 cells of SGR at 10fps. Free
a screenful of shimmer      24 rows of two-colour-per-cell SGR at 10fps.
                            NOT FREE, and it looks like a hang if it stalls
```

**Same discipline the orbit got**: the animation is a deliberate choice, it defaults off, **and
a frame with nothing animating schedules nothing** — which `#armSpinner` already does.

**And the interval is the set's, not the caller's.** The spinner's 100 ms window is C03's floor
and it applies here too — **an animation asking for 16 ms gets 100 and the reason is the
scheduler's, not the effect's.**

---

## 8 · What this unblocks

```
a gradient title or banner          the polish case, and the one that asked for it
a plot line coloured by value       matplotlib's LineCollection, and it is the
                                    single most-wanted plot feature this does not have
a bar shaded along its length       a progress bar that reads as a temperature
a stepped border                    a status region whose edge carries a level
a shimmering spinner or label       "working" that looks like it is
token rendering                     a per-token colour over prose — the ML block that
                                    needs the same span mechanism
```

**And the last one is the argument for building it with spans rather than after them.** A
per-token confidence colour and a shimmering title are the same object: **a colour that varies
over the characters of a run.**

---

## 9 · The prerequisite, stated plainly

**Spans.** A line is runs of `{text, style}` today, **so there is nowhere to put a value that
differs at character 3 and character 4.**

**That one view-model change is what blocks this, inline emphasis, structured diff and token
rendering alike** — four designed features behind one mechanism, which is why it is named as
the large substrate arc.

**Ink ramps should be designed with spans rather than after them**, because a ramp over a run is
the second consumer that finds the seam — **and this campaign's record is that the second
consumer is where the first one's assumptions break.**

---

## 10 · What to refuse, and why

```
a per-character explicit    a caller listing 80 colours is not a ramp, it is a
colour list                 rendering, and it defeats the degradation ladder
arbitrary easing            a ramp is a lookup. Easing is a function, and a function
                            is not serialisable
animation on measure        geometry never animates. A ramp changes appearance only,
                            and if it ever changed an extent it would be C12 I1's
                            violation
a ramp on 1-bit             it resolves to a tone. Not refused — resolved, which is
                            the difference between a gap and a rung
```

**And the one to think hardest about**: a ramp whose extent is *the value* rather than *the
position*. **That is a second encoding channel on a form that may already spend one** — a
line coloured by value where the y-axis is also the value says one thing twice, and where they
differ it says two things a reader cannot separate. **Worth a ruling rather than an option.**
