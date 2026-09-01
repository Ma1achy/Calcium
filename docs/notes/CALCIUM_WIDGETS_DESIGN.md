# Widgets — interactive controls, and the binding that makes them worth having

**Not a plot feature.** A widget system that plots happen to be the first consumer of — and
the second is every form, table and view already built.

**The use case that decides the design**: an agent draws a plot and the reader turns a knob to
see what changes. **The agent is not there when the knob turns**, so the binding cannot
require app code, or every interactive plot needs a handler nobody wrote.

---

## 1 · The kinds

### The ones named

```
slider          a value in a range          ├──────●────────┤  0.42
button          an action                   [ Recompute ]
checkbox        a boolean                   [✓] show grid
radio           one of a few                (●) linear  ( ) log  ( ) log₂
dial            a value, angular            ◐ 0.42      — a slider that reads as a rotation
switch          a boolean, stateful         [ on ●]  /  [● off]
```

**`checkbox` and `switch` are the same fact with different affordances**, and both should
exist: a checkbox is a *setting in a list*, a switch is a *thing that is on or off right
now*. The distinction is real and every UI toolkit keeps both.

### The ones missing, and three matter a great deal

```
SERIES TOGGLE     which series are visible          ✓ train  ✓ val  ✗ test
                  THE most common plot interaction, and it is a legend that clicks

XY PAD            two values at once                ┌────────┐
                                                    │    ✛   │   azimuth × elevation
                                                    └────────┘   — the 3D camera control

RANGE SLIDER      two handles, a min and a max      ├───●─────●──┤  2.0 – 7.5
                  filtering, zooming an axis, a date window

select            one of many                       [ viridis        ▾ ]
                  radio above ~5 options, and colormap choice is the case

multi-select      several of many                   [ x, y, z       ▾ ]
                  which dimensions to plot, which facets to show

stepper           a number with ± buttons           [ − ]  12  [ + ]
                  an integer where a slider is imprecise — bin count, band count

text input        a string                          [ epoch          ]
                  an axis label, a filter, a formula

segmented         one of a few, horizontal          [ linear │ log │ log₂ ]
                  radio's compact form — the same fact, one row instead of three
```

**The series toggle is the one to build first.** It is what a reader reaches for on any
multi-series plot, it costs almost nothing, and **the legend is already the right surface** —
it names the series and it is already drawn.

**The XY pad is what makes a 3D plot usable.** Azimuth and elevation are two coupled values
and two sliders read as unrelated; a pad reads as *where the camera is*.

### The ones that are output, not input

```
readout      a live value, no interaction        loss  0.0412
gauge        a bounded value, no interaction     ▓▓▓▓▓▓░░░░  62%
status       a state with a tone                 ● running
```

**Worth naming so they are not built as disabled widgets.** A readout is a `keyValue` row and
a gauge is `progress`, both of which ship — **they belong in the same layout as the controls
and they are not controls.**

---

## 2 · Where the state lives, and it is the whole design

**A widget is stateful and C12 owns no state.** So the split is the one the crosshair and the
scroll offset already use:

```
the BLOCK          immutable, declarative, JSON — the widget's kind, range, label, binding
the VALUE          interaction-layer state, keyed by widget id, in RenderContext
```

**A widget block declares what it is; the interaction layer remembers where it is set.** Same
shape as `scrollOffsets` and `cursorPositions`, and it inherits their rules — droppable, per
entry, restored by no resume.

**Which means the render stays pure**: `render(block, width, ctx)` where `ctx` carries the
value. Two renders with the same value produce the same bytes.

---

## 3 · Binding — the part that makes it work without app code

**Two modes, and the first covers more than it sounds.**

### 3a · Declarative — drives a FIELD, needs no function

```ts
bind: { target: "plot-1", field: "yScale" }
```

**A widget writes a field on another block, and the framework patches it.** No callback, no
app code, and it works when an agent generated the document and left.

**What this covers, and it is most of what a reader wants to change:**

```
which series are visible      series[].hidden
the colormap                  colormap
the palette                   palette
linear vs log                 yScale · xScale
the camera                    camera.azimuth · camera.elevation · camera.distance
the detail level              plotDetail
the frame style               plotFrame
the legend placement          legend
axis range                    yMin · yMax — a range slider drives both handles
bin count                     binning · a stepper
band count                    bands
annotations on or off         annotations[].hidden
```

**Every one of those is a field on `Plot` that changes the RENDERING, not the data.** No
recomputation, no function, nothing that cannot be serialised. **The document stays a
document.**

**And the patch is the mechanism that already exists** — `replace` on the target block, `rev`
bumps, the cache misses, the row is rewritten. **Nothing new.**

### 3b · Computed — drives DATA, and needs the app

```ts
bind: { target: "plot-1", compute: (value) => Series[] }
```

**A slider that changes a frequency has to recompute the series**, and a function is not
JSON. So this mode requires app code and **is refused in a document that arrived over the
wire** — an agent cannot ship a closure.

**Say that plainly rather than discovering it**: declarative binding works for a
generated document; computed binding is for an app that owns its own data.

### 3c · The escape hatch

```ts
onChange: (value) => void
```

**An event, for everything else.** The app handles it and does whatever it likes — including
patching three blocks at once, or calling a far side.

**Precedence: `bind` if present, else `onChange`, else the value is stored and nothing
happens** — which is legal, because a widget whose value is only read by a readout is a
reasonable thing.

---

## 4 · Layout and focus

### The panel

**Widgets live in a `controls` block** — a row or column of them, sized like any other block,
so they compose with `b.group` and inherit the existing layout.

```
┌ controls ─────────────────────────────────────┐
  frequency  ├──────●────────┤  0.42
  scale      ( ) linear  (●) log
  series     ✓ train  ✓ val  ✗ test
             [ Recompute ]
└───────────────────────────────────────────────┘
```

**Above, below or beside the plot** — `b.group("row", [plot, controls])` and the existing
weights do the sizing.

### Focus

**A widget is an element, and C26 already has elements.** `↑`/`↓` moves between widgets in a
panel, exactly as it moves between table rows.

**And then the widget's own keys apply once focused:**

```
slider · dial · stepper     ← → adjust · ⇧← ⇧→ coarse · home/end to the ends
checkbox · switch           space toggles
radio · segmented           ← → selects
button                      ⏎ or space fires
xy pad                      ← → ↑ ↓ moves, and it needs both axes so it is the one
                            widget that takes all four
range slider                tab switches handle, ← → adjusts the focused one
select                      ⏎ opens the popup — which already exists, five consumers
text input                  the prompt's own editing, scoped to the field
```

**This is A01 D4's shape**: a block binds letters only once focus has moved into it, and
`mergeBlock` is how those bindings arrive. **The widget system is the consumer D4 was written
for and never had** — which is worth checking rather than assuming, because that ruling has
been re-derived twice.

### Mouse

**A click sets the value directly** — on a slider's track, a checkbox, a radio option. The
hit test already resolves layers by `Placed`, so this is wiring rather than mechanism.

**And every mouse affordance has a keyboard equivalent**, which is C02's rule and the reason
the key table above exists first.

---

## 5 · Degradation

```
24-bit    the full affordance — a filled track, a coloured handle
1-bit     structure carries it: ├──●──┤ is a slider at any depth
ascii     |--O--|  ·  [x] / [ ]  ·  (*) / ( )  ·  [ON ]/[ OFF]
no mouse  every widget is keyboard-reachable, which is the design not a fallback
```

**Nothing here needs colour.** A widget's state is carried by *position* and *glyph*, which is
F34 satisfied by construction rather than by a fallback — **the one part of this system that
degrades for free.**

**The dial is the exception worth checking.** An angular value at cell resolution is `◐ ◓ ◑
◒` — four positions — which is not enough to read a value from. **Either braille it, or accept
that the dial is a slider wearing a costume and label it numerically.**

---

## 6 · What this actually enables

**A notebook in the terminal.** An agent writes a document containing a plot and three
sliders; the reader turns them and watches the plot respond — **with no app code, because the
bindings are declarative and the fields are rendering fields.**

```
❯ show me how learning rate affects the loss curve

⏺ Here are three runs at different rates. Drag the slider to compare.

  ⎿  loss
     │ ╭─╮
     │╭╯ ╰──╮
     └──────────────────
     lr    ├────●──────┤  3e-4
     scale ( ) linear (●) log
     runs  ✓ a  ✓ b  ✗ c
```

**That is the thing no chat interface can do** — and it falls out of tools-are-the-manifest
plus declarative binding, both of which already exist.

**And it is the strongest argument for the whole plot system**: a static chart is a picture, a
chart with a knob is an explanation.

---

## 7 · What to refuse

```
nested widgets          a slider inside a checkbox is not a thing
free-form layout        widgets are rows in a panel; absolute positioning is a canvas
                        and that is a different block
a widget driving a widget   bind targets a plot or a table, not another control —
                        that is a state machine and it wants a real one
animation on a widget   a slider that moves by itself is a progress bar
```

**And the one to think hardest about: a widget whose binding target does not exist.** An
agent generates `bind: { target: "plot-1" }` and the plot is called `plot-2`. **Refuse at
construction** — the ids are in the same document and the check is a lookup.

---

## 8 · Build order

```
1   the block kinds, the value store in RenderContext, the render
2   SERIES TOGGLE — the legend that clicks. Highest value, lowest cost, and it
    proves the binding without a slider's arithmetic
3   checkbox · switch · radio · segmented — booleans and small choices, all trivial
4   slider · stepper — the range arithmetic, and ⇧ for coarse
5   declarative binding, and the refusals: missing target, wrong field type
6   focus and the key table — and check A01 D4's mergeBlock is the seam
7   button and onChange — the escape hatch
8   select · multi-select — the popup is already there, this is a sixth consumer
9   XY PAD — and the 3D camera bound to it, which is when 3D becomes usable
10  range slider · text input · dial
11  mouse — click to set, drag to adjust
12  the catalogue: every widget at four capability sets, and one worked notebook
```

**Step 2 ships something useful on its own.** A legend that toggles series is worth having
even if nothing else in this document is ever built — which is the test of whether the order
is right.
