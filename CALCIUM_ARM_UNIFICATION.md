# The arms disagree — a unification pass, before family 3

**The plan said the terminal and SVG arms are two rasterisers over one geometry. Measured
against what shipped, that is not what was built.**

**What is shared today is coordinates**: `normalisedOf`, `normalisedSummary`, the hierarchy
layout. **Everything above coordinates is decided twice** — which mark, which orientation,
which default, which furniture, which colour, which tick, which label.

**And the campaign's own reports are the evidence.** Three defects in two families were *the
SVG arm disagreeing with the terminal*, not the SVG arm being wrong on its own terms:

```
the orientation default    `!== "horizontal"` drew vertically in SVG, horizontally in cells
the mean's mark            a grey circle in SVG; a diamond in the series colour in cells
origin                     all four values byte-identical in SVG — `invert: true`
                           unconditionally, so the same data upside down between the arms
```

**None is a rasterisation difference.** They are two renderers making the same decision
separately and getting different answers, **which is what *shared logic, different rasteriser*
was supposed to prevent.**

---

## 1 · The seam is one level too low

```
TODAY       shared: value → [0,1]          each arm decides mark, orientation, furniture,
                                           colour, ticks, labels, the frame
SHOULD BE   shared: value → A DRAWING      each arm decides only how a drawing becomes ink
```

**A drawing is: this primitive, at these normalised positions, in this role, in this tone.**
*A diamond at 0.4, in the series colour.* **Then the terminal picks a glyph and the SVG picks a
`<path>`, and neither decides it is a diamond.**

---

## 2 · The partition, stated exhaustively

**This list is the pass's specification. Anything in the first column that differs between the
arms is a defect; anything in the second that is shared is over-sharing.**

### MUST be identical — decided once, in the shared layer

```
colour              every ref, every slot, both palettes. Both arms resolve the same
number format       the same value prints the same string — yFormat, precision, SI
                    prefixes, and the axis's uniform-precision rule
tick SELECTION      the same nice numbers at the same count. Not similar — the SAME LIST
tick PLACEMENT      the same normalised positions
axis labels         the same strings, on the same axis, on the same side
the legend          the same entries, the same order, the same swatch or mark per series
the frame           which edges, which ticks, whether there is a border at all
the gutter          the same fraction of the box
MARKS               a diamond is a diamond. Which mark, per role, per series index
orientation         the same default, from the same field
the origin          which end is zero, and WHICH WAY Y GROWS
what is DROPPED     the same labels dropped, the same +N notice, the same threshold
degenerate cases    a constant series, an empty series, one category — the same answer
annotations         the same kinds at the same positions
```

### MAY differ — and this list is short and closed

```
the rasteriser      a braille dot against an antialiased path
resolution          a curve is smooth in SVG and stepped in cells
stroke width        a cell is 1 unit wide; an SVG stroke is a RATIO of the box
font metrics        the terminal's font is the reader's; SVG names a family
THE LADDER          the SVG arm is always 24-bit and has no degradation rungs
```

**The ladder is the only structural difference**, and it has a consequence to state rather than
discover: **a form whose terminal rendering relies on a rung — stacked strips at 1-bit,
`CATEGORY_MARKS` where colour cannot carry — draws the 24-bit answer in SVG and never the
fallback.**

**So the arms are not comparable below 24-bit.** Every cross-arm assertion compares at 24-bit or
compares the drawing rather than the output.

---

## 3 · What a drawing is

**A first sketch, to be measured against what the two renderers actually need rather than
adopted as written:**

```ts
type Mark =
  | { kind: "polyline"; points: readonly Pt[]; closed?: boolean }
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: boolean }
  | { kind: "circle"; cx: number; cy: number; r: number; fill?: boolean }
  | { kind: "arc"; cx: number; cy: number; r: number; from: number; to: number }
  | { kind: "glyph"; x: number; y: number; role: GlyphRole }
  | { kind: "text"; x: number; y: number; text: string; anchor: Anchor };

type Drawn = Readonly<{
  mark: Mark;
  role: "series" | "furniture" | "annotation" | "label";
  seriesIndex?: number;      // the CATEGORICAL slot, unresolved
  ref?: ColourRef;           // or an explicit ref, unresolved
}>;
```

**Positions are normalised — `[0,1]` in both axes, uninverted.** The inversion is the
renderer's, and that is the origin defect's fix: **it is decided once and applied twice.**

**`GlyphRole` rather than a glyph.** *Median · mean · outlier · point · cap · target · absent.*
**The terminal maps a role to a character from C09's table; the SVG maps it to a shape.**
Neither holds a literal, and the mapping is a `Record` so a new role fails to compile in both.

**And `ref` stays unresolved.** The shared layer says *the series colour*; each arm calls
`resolve()` with its own capabilities — 24-bit pinned for SVG, the real ones for the terminal.
**One resolution rule, two depths.**

---

## 4 · The test that proves it, and it is stronger than any frame comparison

**Render the same block through both arms and compare THE DRAWING LISTS, not the output.**

```
U1   the same block yields an identical `Drawn[]` for both arms — deep equality,
     including roles, refs and normalised positions
U2   the lists are identical across every form in ONE_PER_FORM
U3   identical across every variant the corpus holds — and where a form has two
     data shapes, both
U4   identical across themes — the refs are unresolved, so a theme change moves
     nothing in the list
U5   the SVG arm's list is identical at every capability set, because it has no ladder
U6   the terminal's list is identical at every capability set ABOVE the rungs that
     genuinely change it, and where it differs, the difference is a stated rung
```

**U1 is the assertion the whole pass exists for.** *Identical, or the seam is in the wrong
place* — and no frame comparison can say that, because two frames can differ for a legitimate
reason and a drawing list cannot.

**U6 is the interesting one.** It measures **which forms actually degrade** — and the campaign
has already noted that the terminal arm's degradation is unaudited. **This row is that audit,
arriving for free.**

---

## 5 · Timing — now, and not at the end

**Two families exist and two do not. That is the cheapest point.**

```
each family adds decisions to unify      two families, three defects already
the unification changes what the later    building them first means building them twice
families build
```

**And do not stop mid-family.** Finish family 2b — `tree` and `graph` — **then this pass,
before family 3.** Half the families is enough to see the shape and half is what the pass
saves.

**The pass is retroactive**, like commit 0's colour: it fixes the four shipped families and
sets the seam the remaining four are built against.

---

## 6 · Order

```
0   MEASURE THE DISAGREEMENTS     before designing the type. Render every form in
                                  ONE_PER_FORM through both arms and diff what they
                                  decide — mark, orientation, colour, ticks, labels,
                                  frame, drops. THE LIST OF DISAGREEMENTS IS THE
                                  SPECIFICATION, and it will be longer than three

1   THE TYPE                      `Drawn`, `Mark`, `GlyphRole`. Spec first, alone —
                                  it is a shared surface and C04's precedent applies

2   THE SHARED EMITTERS           per family, one function producing `Drawn[]`. The
                                  four shipped families first, and ZERO FRAMES MOVE
                                  in either arm

3   THE TWO RENDERERS             each walks a `Drawn[]`. The terminal's is a
                                  refactor of what exists; the SVG's is smaller than
                                  what exists, because most of its decisions move out

4   U1–U6                         and U1 is what says the pass worked

5   THE REMAINING FAMILIES        proportion, composite, image-as-plot — built against
                                  the seam rather than refactored onto it
```

**Step 0 is not optional and it is the step most likely to be skipped.** Three disagreements
were found by building; **the rest are found by looking**, and the pass is designed against the
list rather than against the three.

---

## ★ 6b · The terminal arm does not change. At all. This is the hardest constraint.

**The terminal arm is a refactor and nothing else.** Every glyph, every column, every colour,
every dropped label, at every capability rung, **byte-identical before and after.**

**This is not a preference and it is not "minimise churn".** The terminal arm is what shipped,
what the goldens record, what the catalogue is a picture of, and what every visual decision in
this project was made against. **If it moves, the pass has changed the product while claiming
to reorganise it** — and a moved frame in a refactor is indistinguishable from a moved frame in
a redesign.

### The gate, and it is absolute

```
377 golden rows compared, 0 snapshots written
890 catalogue frames at 64b8845e6408c819, unchanged
```

**Per commit. Not per family, not at the end.** A commit that moves one frame stops and the
frame is read before anything else happens.

**And `-u` is forbidden for the duration.** Regenerating a golden is how a refactor's defect
becomes the new baseline, and there is no legitimate reason for the terminal's frames to move
in this pass. **If one moves, the refactor is wrong** — that is the whole point of doing the
extraction first and separately.

### The counters, because zero-moved is not zero-checked

**F256 measured the gate passing against a broken refactor**, because the branch it moved is
taken by no frame in either corpus. **So *zero frames moved* is evidence about the cases the
frames construct and nothing else.**

**Each commit reports HOW MANY were compared**, and the catalogue's evidence is the split hash
(F264) rather than `git status` — **`docs/catalogue/` is gitignored** (F257), so a
frame that vanished and a frame that never existed look identical to git.

### The rungs are where this will actually break

**The `Drawn[]` list is capability-independent by design — and the terminal arm's rendering is
not.** So the refactor has to preserve, exactly:

```
which glyph at which unicode rung      full · bmp · ascii, per role, per form
CATEGORY_MARKS below the colour floor  the mark that carries identity when colour cannot
stacked strips at 1-bit                a multi-series plot's whole answer at depth 1
the ambiguousWidth arms                narrow-only sets falling to their ASCII pair
the ramp per axis                      height · density · column · dither
the truncation ladder                  which labels drop, at which width, with which mark
the +N notices                         the same count, the same wording, the same row
```

**Every one of those is a decision the terminal makes AFTER the drawing list**, and every one
is a place where "the shared layer now says a diamond" can quietly become a different
character.

**The `GlyphRole` mapping is where they live**, and it must be a `Record` keyed exhaustively so
a missing rung is a compile error rather than a silently different glyph.

### The rows that hold it

```
T1   every form, every capability set, byte-identical to the pre-refactor frame —
     and this is a snapshot of the OLD renderer's output, captured BEFORE the pass
     begins and committed as a fixture
T2   the glyph chosen for each role at each unicode rung is unchanged
T3   the 1-bit arm's stacked strips are unchanged
T4   the truncation ladder drops the same labels at the same widths
T5   ambiguousWidth: "wide" produces the same substitutions
```

**T1 is the one to build first and it is cheap.** Capture the terminal's full output for every
form at every capability set **before the first line of the pass**, commit it as a fixture, and
diff against it at every commit. **The golden suite is a subset of this** — it does not cover
every form at every rung.

**That fixture is the pass's actual gate.** The golden count is a proxy for it and this is the
thing itself.

### And if a disagreement resolves the SVG's way

**Then the terminal changes in its OWN commit, alone, with the frame read and the reason
recorded** — never inside a refactor commit. **The tie-break rule says the terminal is right by
default**, so this should be rare; when it is not, it is a product decision wearing a
refactor's clothes and it gets committed as one.

---

## 7 · The gate, and the counters

**Zero golden frames and zero catalogue frames move**, per commit — the terminal arm is a
refactor and the SVG arm is a re-expression.

**And read the counters, not the exit code.** F256 measured the gate passing against a broken
refactor because no frame took the branch; **so each commit reports how many frames were
compared**, and the catalogue's evidence is the hash — **now split into terminal and SVG, per
F264, because an addition to one read as a change to both.**

**Plus the timeout is real now** (F262), so a green suite is evidence again — **which it was
not for most of this campaign.**

---

## 8 · What this pass is not

```
not new forms           it re-expresses what exists
not the terminal's      U6 measures which forms degrade and where. FIXING them is a
degradation audit       separate pass with its own findings
not a visual redesign   if the arms disagree, the TERMINAL is right by default — it
                        shipped first, it has the goldens, and its decisions were made
                        against a working figure. The SVG arm moves to meet it unless
                        there is a stated reason
```

**That last is the tie-break rule and it should be in the spec**, because every disagreement
needs an answer and *which one is wrong* is otherwise a judgement per case.

---

## 9 · What it buys

**The stated goal, in one sentence:** *the only difference should be smoother, more accurate
lines on complex graphs and shapes.*

**And phase 4.** A 3D surface is a projection producing a `Drawn[]` — **the same architecture
one dimension up**, with the terminal walking it into braille and the SVG walking it into
polygons. **Phase 4's own first measurement — does the cell grid hold a silhouette — is asked
against two arms that already agree about everything except resolution.**
