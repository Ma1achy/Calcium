# `plot3d` — a 3D renderer for the terminal



**The refusal was wrong and it was wrong for a stated reason.** *A novelty, not a tool* is a
fit argument asserted without checking whether it holds — and it does not: a 3D scatter of an
embedding space and a surface plot of a loss landscape are both things people screenshot,
and nothing in a terminal draws either.

**Billboard rendering is the right frame**, and it makes the hard part tractable: a label
never rotates, it only moves, so the 3D text problem collapses into a 2D layout problem this
component has already solved twice.

---

## The rung, and it was measured rather than assumed

**This document used to open on *braille dots are square, so a projection into the dot grid needs
no aspect correction — every other terminal 3D attempt fights this and this one gets it free*.**
That sentence is true. It is off by 5%. And it argues for the wrong rung, which is why it was
measured before anything here was built (F431).

### What was measured

One surface and one teapot-shaped solid, three arms, **one screen area of 80×24 cells**. The cell
box is the repo's own frame renderer's — `8.41 × 16` — so this compares against the thing that
draws every catalogue sheet rather than an assumed cell.

| arm | samples | what it shows |
|---|---|---|
| braille | 160×96 binary dots **+** 80×24 cells of colour | a smudge: the surface's rings gone, the teapot with no lid seam and no volume |
| half block `▀` | 80×48 full-colour samples | every structure the image arm has |
| image protocol | 673×384 full-colour samples | the form, with detail |

**Four numbers said the dot grid held it** — 0.3% and 1.5% silhouette disagreement against the
pixel truth, the handle's hole four dots clear, 163 distinct shade levels of 186 — and the picture
disagreed with all four. **One line explains it:**

```
surface   7254 dots lit ·  323 on the boundary (4.5%)  ·  6931 interior, every one of them on
teapot    2021 dots lit ·  219 on the boundary (10.8%) ·  1802 interior, every one of them on
```

**Inside the outline the braille channel is a constant.** 89–96% of the lit dots carry nothing, so
the whole interior — which is where a 3D form lives — is the **cell colours**, and the silhouette
metric was measuring the one thing that was fine. A 3D form is not its outline: a lid seam, a
shoulder, the trough of a ripple are shading discontinuities.

### The ruling, and the repo had already written it

**C09 commitment 35 (I37):** *a half block spends a cell on two full colours where braille spends
it on eight dots, so a photograph arrives as a photograph and a diagram is better served one rung
down.* That sentence is about images. **A shaded 3D render is a photograph**, and nobody had
applied it because this document predates the ladder.

**So 3D is a terminal form on the half-block rung.** The half-block arm at a **quarter** of the
braille arm's samples shows the teapot's lid seam, its knob, its spout and an open handle hole.

**And the premise buys nothing, which is the part to keep.** A braille dot is `4.205 × 4.0` px —
1.051 : 1, not square — and a half-block cell is `8.41 × 8.0`, **the same ratio**. The aspect is a
property of the *cell*, and every rung on the ladder has it. A correct sentence justifying the
wrong decision, which review cannot catch because the sentence is true.

---

## The sample grid — a rule, and the numbers here are measurements of it

**`80×48` is not a constant and must not be read as one.** It is the sample grid at the size the
measurement ran in — 80×24 cells — and the rung gives two vertical samples per cell:

```
                 across            down          at 80×24      at 120×30
braille          cells × 2         cells × 4     160 × 96      240 × 120
half blocks      cells × 1         cells × 2      80 × 48      120 ×  60
```

**So it is `width × 1` by `height × 2`**, and nothing about 3D is hardcoded to a viewport. The
projection scales to the sample grid, the sample grid to the block, and the block to whatever the
region gives it — **the same chain every other form already uses**, and the one `imageCells` and
every raster in C12 use.

**Every absolute figure in this document is a measurement at 80×24 and none of them is a
threshold.** 7254 dots, 6931 interior, 673×384, the triangle counts in §7 — all of them scale with
the region, and a reader who takes one as a limit will build a renderer that is correct at one
terminal size.

---

## The pipeline

```
world  →  view      one 3×3 rotation from (azimuth, elevation), then translate by distance
view   →  clip      frustum cull: drop what is behind the camera or outside the view
clip   →  NDC       perspective divide (x/z, y/z), or drop z entirely for orthographic
NDC    →  samples   scale to the sample grid — width × 1 by height × 2, the cell's own
                    1.051 : 1 and not a correction the rung avoids
sample →  raster    depth-tested writes into the buffer
raster →  paint     a cell is `▀` with two colours: the upper sample as foreground, the
                    lower as background. NO GLYPH CHOICE — the shade is the colour
```

**Six stages, four of which already exist in some form.** The new work is the rotation, the depth
buffer and the lighting — and **the last stage got smaller rather than larger**: on the dot grid
the shade had to be encoded in a glyph from a density ramp, and on this rung the shade *is* the
colour. The ramp does not appear in the pipeline at all.

---

## 1 · The camera

**It is interaction state, not block state.** C12 I11 — *C12 owns no state; every render is a
pure function of block, width and context* — so the camera reaches the renderer through
`RenderContext`, exactly as the crosshair position does.

```ts
type Camera = Readonly<{
  azimuth: number;      // radians, rotation about the vertical axis
  elevation: number;    // radians, −π/2 (below) to +π/2 (above)
  distance: number;     // eye distance in world units; ignored for orthographic
  projection: "perspective" | "orthographic";
}>;
```

**A block declares its INITIAL camera; the interaction layer owns the current one.**

```ts
camera?: Partial<Camera>;    // on Plot — the starting view, not the live one
```

**Two control modes, and both are the frame scheduler doing what it already does:**

```
auto-orbit     one revolution in 12 seconds, from ELAPSED TIME rather than per frame
manual         [ ] azimuth · { } elevation · + − distance · r resets · o orbits
```

**Both lines were corrected by building them** (C22 §6i, I73–I75, F466). *Per frame* makes an
animation's speed depend on what else is on screen — the ticker is armed at the fastest cadence
anything visible wants — and it fails in both directions at once: an orbit beside an 80 ms spinner
turns 25% fast, and a 33 ms orbit spins that spinner three times too quickly. And *the stream
window is 33ms* names a window the ticker has never used: `#armSpinner` raises `commit("spinner")`,
whose window is **100 ms**, so the reason is the frame rate and the interval is not.

**The arrows do not survive the keymap.** `↑` and `↓` at `liveBlock` are `rowUp` and `rowDown` and
a duplicate is refused at construction; `←` and `→` fall through to the prompt, so claiming them
takes two keys from every focused block for a feature one kind has. `[` and `]` were chosen on that
argument when the writer landed, and the rest of the family follows them.

**The render cache key gains the camera — and so does the shell, which is the half this
sentence used to miss.** It read *the third instance of that story after the scroll offset and
the crosshair*, and **the crosshair is not an instance of it**:

```
                   read by                        written by                in a key
scrollOffsets      containers                     construct.ts's nudge       yes
cursorPositions    plot/definition.ts             NOTHING in src/            no
```

C12 §3s already says so — *a complete mechanism with nothing on the other side, the shape MG24
exists for*. So the crosshair is not the precedent; **it is the failure this must not repeat.**
The four real axes are `focus`, `theme`, the scroll offset and `tick`, and `session.ts` names
each beside the way it fails — silently for the offset, intermittently for the tick.

**So the camera is two stories at once and they land in one commit.** A key axis with no writer
is vacuous until the orbit exists; a context field with no writer is `cursorPositions` again.
The field, the axis and one binding go together. **Add it with the feature** — a cached frame
served after an orbit is a plot that does not move, and it looks like a hang rather than a bug.

**Auto-orbit and the readout cursor are mutually exclusive** — a moving camera and a fixed
sample index disagree about what the reader is pointing at. **Orbit pauses while the cursor
is active**, which is a ruling rather than an accident.

---

## 2 · Depth

```ts
// Sized from the block, never from a constant. `sampleWidth = width` and
// `sampleHeight = height × 2` on the half-block rung (see The sample grid).
const depth = new Float32Array(sampleWidth * sampleHeight);
```

**Allocated per render, and sized from the block's actual width and its declared height.** C12 I11
forbids state that *survives* a render and permits a local buffer, so this is allowed — and it is
the reason it must be allocated rather than kept: a module-level buffer would be exactly the state
I11 forbids, and would also be the wrong size the first time a region changed.

**About 60 KB at 120×30** — `120 × 60 × 4` — which the earlier note measured as trivial for the
GC. The figure moves with the region; it is not a budget.

That buys exact hidden-surface removal — no painter's algorithm, no sorting, no artefacts at
intersections.

```
write(x, y, z, shade):
    if (z < depth[y * sampleWidth + x])  { depth[...] = z; samples.set(x, y, shade); }
```

**Cleared to +∞ per render.** A sample carries a shade and a colour, not a glyph: the glyph is
always `▀` and the two samples in a cell become its foreground and background.

### Culling, in order

```
1  frustum        drop primitives entirely behind the camera or outside the view volume.
                  BEFORE projection — a point behind the eye projects to a valid-looking
                  coordinate with a negative z, and that is the classic bug
2  backface       for closed surfaces: dot(normal, centroid - eye) > 0 → drop, with the
                  sign taken from the mesh's own signed volume. Removes 58% of a
                  sphere's faces at distance 6 and 83% at 1.5, and is what makes
                  a solid look solid
3  depth test     per dot, as above
```

**Backface culling is opt-in per surface** (`closed?: boolean`), because an open surface — a
height field, a plane — has no inside and culling it drops half the picture depending on
which way you orbit.

**Two corrections this section carried until step 7 drew it** (F460, F461):

- **`dot(normal, view)` with a constant `view` is the orthographic limit.** Under perspective
  every face has its own direction to the eye, and the two answers disagree on **7.29%** of a
  sphere's faces at distance 6 and **34.03%** at 1.5. The constant answers *48.18% visible* at
  **every** distance, because a view-space `z` test cannot read the eye's position — while the
  truth, `(1 − r/d)/2`, falls from 41.67% to 16.67%. *Removes ~half* is the same limit: it is
  what the cull approaches as `d → ∞`.
- **`closed` licenses a second power, and it is the one a reader will miss.** The obvious UV
  sphere is wound **inward** — rings by segments in grid order measures a signed volume of
  **−4.16** — so trusting the winding culls the front and draws the back, which two-sided
  shading (§3c) then lights correctly. The picture is a plausible hollow shell and nothing in
  it says otherwise. So `closed` enables culling *and* licenses orienting it from the mesh's
  own signed volume, `Σ dot(a, cross(b, c)) / 6`. What it does **not** cover is locally
  inconsistent winding, and the sensitivity there is inverted relative to the damage: a
  half-reversed sphere cancels to `1e-15` and is refused, while one face in eight reversed
  leaves a confident `−3.12` and gets about 32 faces wrong in silence.

### Two depth rules that need stating

**A label's depth is its anchor's, and a label draws over.** A label is *cells* where the
buffer is *dots*, so writing every label cell's depth is expensive and wrong at the edges.
**Test the anchor, then draw unconditionally** — a label is annotation, not geometry, and a
label hidden behind a surface is a label nobody can read.

**A wireframe edge on a surface does not z-fight, because it is not a separate primitive**
(F462). This section used to say *the edge and the face are at the same depth by construction,
so bias edges toward the camera by a small constant — one number, stated in the spec rather
than tuned until it looks right.* **They are not at the same depth**: `strokeSeg` floors both
coordinates and steps on the dominant screen axis where `fill` samples at `+0.5` centres, so an
edge disagrees with its **own** face by a median `1.60e-2` and a maximum `4.31e-1` — against a
sample row of `4.17e-2` on a figure spanning 2. Swept, no constant works: bias 0 draws 22.6% of
edge samples, `1e-3` draws 27.6%, and the ceiling of 55.4% costs `3e-1`, which is 15% of the
whole figure's depth.

**The edge is the fill's own sample.** `w0` is twice the sub-triangle's area, so `w0 / |ab|` is
the perpendicular distance to edge `ab` **in samples**, and a sample is on the edge below 0.7 of
one. No second rasteriser, no bias, no z-fight constructible — and hidden-line removal is exact
rather than approximate, because an edge sample is occluded exactly when its face's sample is.

---

## 3 · Primitives

### 3a · Points — nearly free

**Project, depth-test, plot.** A 3D scatter is the cheapest thing here and the most
immediately useful: embeddings, PCA, t-SNE, a parameter sweep in three dimensions.

```ts
type Point3 = Readonly<{
  x: number; y: number; z: number;
  value?: number;        // for colour, independent of position
  label?: string;        // a billboarded text label
  marker?: MarkerKind;   // per point, or per series
}>;
```

**Marker size is three depth tiers, not continuous scaling:**

```
far      ·  ▪  ▫  ⁺           one dot, or one cell at its smallest
mid      ●  ◆  ▲  ✕  ○        one cell, solid
near     a braille 2×2 block, or a 2×2 cell arrangement
```

**Three tiers is the ceiling** — a terminal cannot scale smoothly and a reader cannot read
more than three sizes. **Bucket by depth**, exactly as the density ramp buckets by value.

**The marker set is a glyph table with an ASCII rung**, never literals — SS47, and every
marker glyph here (`● ◆ ▲ ○ ✕`) is `East_Asian_Width=Ambiguous`, so the wide arm is
required rather than optional.

**Colour is depth OR value, and the caller picks:**

```
colourBy: "depth"    the continuous palette over the z range — reads as recession
colourBy: "value"    the continuous palette over point.value — reads as a field
colourBy: "series"   the categorical palette — reads as identity
```

**At 1-bit, depth becomes the marker tier and value is lost.** Say so — a 3D scatter at one
bit still reads as three-dimensional because near points are bigger, and that is the honest
degradation.

### 3b · Lines — a depth-tested stroke, and the primitive was built at step 4

> **This section was three claims about the tree and all three were wrong** — measured when
> step 5 came to build it (C12 §3ao, I93). The corrected version is below; the original said
> the change was `write(x, y, z, …)` in place of an unconditional set in `strokePolyline`,
> that the box-drawing arm and `glyphForMask` came free with it, and that
> `plotStyle: "line"` selected them.

**The primitive already exists and it is `strokeSeg`** — projected segment, dominant screen
axis, `z` interpolated, `writeDepth` per sample. It landed with the axis lines and the box at
step 4, so the work this step schedules was done one step early as a means to something else.
**What step 5 owes is the carrier**: `Line3` and `lines3`, and the three rules written against
`points3` that a second carrier falsifies.

**There are two line functions and this section named one while describing the other.**
*Walks a path in the dot grid setting dots* is `drawLine` (`raster.ts`, Bresenham into a dot
`Uint8Array`). `strokePolyline` (`linedraw.ts`) walks a **cell mask** setting **edge bits**,
consumed by `glyphForMask`. Both are *the line function*; nothing above forced a choice.

**So the substitution has nowhere to live.** A mask cell accumulates up to four bits from up
to four segments and `glyphForMask` resolves it after all strokes — there is no `set` to
replace, and a strictly-nearer test refuses the second edge at exactly the shared vertex a
join needs. Joins want a second depth rule on one buffer, not a swapped call.

**And `plotStyle` is not this form's selector**: `STYLE_ARMS.scatter3d` is `[]`, and the arm
is `halfBlockEligible`'s — the terminal's, not the caller's. The fifth residue the rung change
left, after §6's tier list.

**The argument for the box-drawing arm dies with the rung, and that is the part worth
keeping.** On the dot grid, braille and box drawing were two full-capability choices a caller
picked between, which is what made box drawing *a genuinely different picture rather than a
coarser copy*. Here the glyph arm is what a terminal gets when it **cannot** do colour. It is
the coarser copy. A claim can be exactly right about the design it was written for and false
about the one it was carried into — F433's own lesson, arriving a second time.

**So a line on the glyph arm is one directional glyph a sample**, `│` or `─`, which is what
the box and the axis lines have drawn since step 4.

```ts
type Line3 = Readonly<{
  points: readonly Point3[];
  closed?: boolean;      // connect last to first
  label?: string;
}>;
```

**Consumers**: trajectories, parametric curves, the edges of a wireframe, a path through a
loss landscape.

### 3c · Surfaces — the one worth building for

```ts
type Surface3 = Readonly<{
  // a height field: z = f(x, y) over a regular grid
  heights: readonly (readonly number[])[];
  xRange: readonly [number, number];
  yRange: readonly [number, number];

  // OR an explicit mesh, for spheres and closed shapes
  vertices?: readonly Point3[];
  faces?: readonly (readonly [number, number, number])[];   // triangle indices

  field?: readonly (readonly number[])[];   // colour source, INDEPENDENT of height
  shading?: "flat" | "smooth";               // face normals or vertex normals
  closed?: boolean;                          // mesh arm only: culling, oriented from the volume
  wireframe?: boolean | "over";              // edges only, or edges over the fill
}>;
```

**`heights` is optional and so is `vertices`, with exactly one of them per surface.** The sketch
above had `heights` required, which makes every mesh caller supply a grid it does not have. The
refusal is `origin3`'s shape — a member that decides nothing on the arm it is given is refused
rather than ignored.

**`closed` and `wireframe` landed at step 7 with the culling that reads them** — the bias that
was scheduled with them does not exist (F462). A member accepted and ignored tells the caller
nothing, and an export nothing consumes is what the repo's own rule forbids, which is why they
were not declared at step 6.

**`closed` is refused on the height-field arm** (F463). The renderer cannot detect an open
surface: this note's own premise — *an open surface's signed volume is exactly 0* — was measured
on a flat quad, and a 9×9 Gaussian measures **0.1742**. The zero belongs to `unitOf`, which
centres each axis on the extent so that every *planar* surface normalises onto a plane through
the origin. So the arm decides it and the gate says so.

**Two inputs, and whether they are two CHANNELS is now open — the rung change falsified the
claim and this is the one residue that is not a stale noun.**

```
                       on the dot grid                  on this rung
field (or height)  →   the palette      → COLOUR    →   the palette   ┐
face normal · light →  intensity 0..1   → DENSITY   →   intensity     ┘ ONE colour
```

**On the dot grid they were genuinely independent**, because the cell had two carriers: a
foreground colour and a glyph chosen from a density ramp. Here both readings write the *same*
sample, so a dark cell is a low field value **or** a face turned away and nothing in the picture
says which. *matplotlib's surface plot has one colour channel; this has colour and dither
pattern* was true and is not.

**And the collision is worst on the map that was chosen to avoid collisions.** A perceptually
uniform colormap makes lightness monotonic in the value — that is what viridis is *for* — so
multiplying it by a Lambertian intensity puts the field and the slope on the same perceptual
axis by construction.

**Measured at step 6, and the candidate is refused — for a reason two steps earlier than the one
this paragraph expected** (F455). Hue and chroma for the field, lightness for the shading: it does
not reach a terminal's quantisation, because **sRGB's gamut refuses it at 24 bits**. Holding
`(a, b)` while sweeping OKLab `L` leaves the gamut at both ends, the clamp that brings it back
rotates the hue, and the scheme designed to put the field *in* hue destroys hue on every map
measured — minimum separation between adjacent field values **0.0000 rad on six of six**, against a
drift under shading of up to 0.93 rad.

**And half the separation it wanted is already there, on the maps that travel in hue.** Scaling a
colour in linear light is exactly *hold chromaticity, change luminance*, so under one channel the
field's hue barely moves as the shading does. Measured at 24-bit over 21 field values × 11
intensities:

```
map        hue drift under shading   min hue step between fields    ratio
viridis            0.0330                     0.1292                3.9x
plasma             0.0168                     0.1231                7.3x
inferno            0.1223                     0.0015                0.01x
coolwarm           0.1179                     0.0016                0.01x
magma              0.1522                     0.0005                0.00x
gray               0.0000                     0.0000                 —
```

**So the honest statement is per map, not per rung**, and neither the old claim nor its
replacement is shaped that way. **The field is recoverable from hue under shading exactly when the
map travels in hue**, and three of the six shipped maps do not: magma and inferno run black →
purple → orange → white with almost no hue step at the ends, coolwarm passes through a white
midpoint where chroma is zero and hue is undefined, and `gray` has no chroma to carry anything.
That is a property of the **caller's colormap** rather than of the terminal, so it is a documented
consequence of `colormap` and not a branch in the renderer.

**At 8-bit it collapses on every map** — hue drift 1.57–5.83 rad, minimum field step 0.0000
everywhere — which is C10's rung rather than this form's, and is what `CUBE_LEVELS`' own comment
already says: scaling a colour and requantising compresses the dark end harder than the light.

#### Shading — and the dither that used to be here is gone

**This section used to say *dithering is what makes it look 3D*, and it was right about the dot
grid.** A braille cell is eight subcells, so an ordered dither over a 2×4 matrix gives nine
intensity levels per cell — which is a lot when the alternative is one bit, and nothing when the
alternative is a 24-bit colour. On this rung the shade is the colour: no ramp is indexed, no
pattern is chosen, and adjacent cells at the same intensity are the same colour because they are
the same intensity.

**Measured before it was removed rather than after** (F433). The question was reopened against
`colourDepth` rather than against the rung, because C02 answers 1 / 4 / 8 / 24 and the rung is the
same at all four:

```
depth  greys   4×4 block-mean MAE, plain → dithered      ratio
  24     256   0.0002 → 0.0002                           1.09×
   8      26   0.0025 → 0.0018                           1.43×
   4       4   0.0473 → 0.0135                           3.51×
   1       2   0.2528 → 0.0323                           7.84×
```

**1.09× at 24-bit is nothing**, and at 4-bit — where the ratio is real — the plain quantisation
still reads more cleanly, because a 4×4 Bayer cell is 1/20 of an 80-wide raster and this rung's
scarce axis is space, not tone. See §6 for the disposition: **it is C10's business at low colour
depth and applies to every raster equally.**

**And the section named a mechanism that does not exist.** `rampFor("dither", caps)` — the tree
has `ladderFor` over `LadderAxis`, which is `Extract<Encoding, "height" | "density">`: **two** axes
of `Encoding`'s four, not three, and `Serves` is a `Record` over them, so widening it is a compile
error at every existing ladder. Nothing is widened, because the ruling adds no axis.

#### Lighting — **and this is the load-bearing section now**

**On the dot grid the silhouette carried the form and lighting was a refinement.** On this rung the
silhouette is 4–11% of the samples and every interior sample is a colour, so **the lighting *is* the
picture**: studio, the specular term and the depth attenuation below are what a half-block surface
is read by. Where braille had nine dither levels and no colour, this has two full colours per cell
and no dither at all (F433, and §6).


**One directional light, and where it lives decides everything.**

```ts
light?: "studio" | "headlight" | Readonly<{ azimuth: number; elevation: number }>;
```

**`"studio"` is the default: camera-relative with a fixed offset.** The light lives in *view
space* rather than world space, so it is always up-and-right of wherever the reader is
looking. This is the standard key-light setup and it is right for the same reason it is right
in a studio.

```
headlight     lightDir = (0, 0, -1)                    in VIEW space
studio        lightDir = normalise(0.5, 0.7, -1)       in VIEW space, up-right   ← DEFAULT
world-fixed   lightDir = rotate(worldLight, view)      transformed every frame
```

**Why studio rather than headlight.** A pure headlight lights everything facing the reader
equally, so **a sphere reads as a flat disc** — the normal and the view direction coincide at
the centre and fall off symmetrically, giving a radial gradient with no sense of direction.
**Offset 45° up and 30° right and a terminator crosses the surface**, which is the shading
that makes it read as round rather than circular.

**Why studio rather than world-fixed.** Orbit to the dark side of a world-fixed light and the
subject is a black blob — technically correct and useless. **Studio has no dead angle**,
because the light rotates with the camera.

**The trade, stated rather than hidden:** because the light moves with the camera, **orbiting
does not change the shading pattern** — a face keeps its brightness as the reader rotates
around it. World-fixed shading changing under rotation is a genuine depth cue and studio gives
it up. **That is the right default anyway**, because most terminal 3D views are static
screenshots rather than a live orbit, and `light: { azimuth, elevation }` is there for the
case that is not.

**The implementation difference is one vector.** Studio and headlight apply their direction
*after* the world-to-view rotation; world-fixed applies it *before*. One branch, no second
code path.

#### The shading terms

```
ambient     0.2                                          a floor, never zero
diffuse     0.6 · max(0, dot(normal, lightDir))          Lambertian
specular    0.2 · pow(max(0, dot(reflect, view)), 16)    a highlight on curvature
distance    × (1 − 0.3 · normalisedDepth)                far is dimmer
```

**The coefficients were `0.2 / 0.8 / 0.4` and they summed to 1.4** — which made the clamp below
the load-bearing part of the formula rather than a guard, and it cost the specular almost all of
itself (F457). Measured at the specular's own maximum, where the normal is the half-vector between
the light and the view: diffuse and ambient reach **0.9501** on their own, the specular takes it to
**1.3501**, and clamping the intensity to 1 leaves **0.0499 of 0.4000 — 12.5%**. On viridis's mid
entry that is `(33, 145, 140)` against `(32, 142, 137)`, three parts in 255 and invisible. **The
term §3c argues is the difference between a disc and a ball was being deleted by the line three
paragraphs down.**

**And the obvious repair is worse, for a reason F455 already measured.** Clamping the *colour
component* instead lets the intensity run to 1.4 and gives a real highlight — `(39, 166, 161)` on
the same entry — and it clips a channel, and **a clipped channel rotates hue**: viridis's field
ratio falls from **3.91× to 0.01×**, plasma's from 9.20× to 0.00×. That is F455's own gamut
mechanism arriving on the scheme F455 *endorsed*, because scaling past 1 leaves the gamut exactly
as forcing `L` did.

**So the terms are rebalanced to sum to 1.** The specular keeps its full 0.2 instead of 12.5% of
0.4, the intensity never leaves `[0, 1]`, and F455's measurement applies to the range that ships —
which it did not before, since **F455 measured intensities 0.2–1.0 and neither document records
that**. The diffuse range narrows from 5:1 to 4:1 and the terminator is unaffected at that ratio.

**The ambient term is not optional**: without it a face turned fully away is black and reads
as a **hole** rather than a surface, which is worse than being wrong about the light.

**The specular term is cheap and buys more than it costs.** On a sphere it is **the difference
between a disc and a ball**, and this rung has the range to show one: a highlight is a step in a
24-bit colour rather than a rung on a nine-level ladder, so it can be *bright* without being
*white*. That is a stronger argument than the one this paragraph used to make, and it is the
same term.

**Depth attenuation is one multiply and a free depth cue.** Every term above writes the same
intensity and this multiplies it, so the reader sees one result rather than two channels
competing for a cell.

**Clamped to `[0, 1]` before the colour is resolved**, and **the reason changed with the rung**.
On the dot grid the sentence said *an array overrun*, because the intensity indexed a ramp whose
top rung is `⣿`. There is no ramp here and no array to run off: past 1 is a colour component
past 255, and the failure is a wrap or a silent saturate — **diagnosable only by looking at the
picture**, where an overrun throws. Same line, different failure, and worth stating because a
reader sent to a ramp would go looking for one that this rung does not have.

**With the terms summing to 1 the clamp is a guard and cannot fire on the design** — which is the
point of rebalancing them rather than a weakness in the clamp. It reaches exactly 1 under
`light: "headlight"`, where the light and the view coincide so a face pointing at the reader takes
`0.2 + 0.6 + 0.2`; it exceeds it never. **It stays because three floating-point products do not sum
to exactly 1**, and the cost of the alternative is a colour component past 255 in a renderer whose
whole output is colour. A `Math.min` against a defect that is diagnosable only by eye is the
asymmetry rule, and the figures are here so the next reader does not delete it after failing to
reproduce one.

#### What is refused, and why

**Both refusals below were argued from nine dither levels, and that argument is gone.**
Re-argued rather than kept, because a refusal whose reason has been falsified is one the next
reader deletes.

**Cast shadows.** A second depth pass from the light's position — **and under `studio` the light
is camera-relative**, so the shadow map is rebuilt on every orbit frame rather than cached with
the scene. That doubles the per-frame cost on the one path §11 says is already the budget, and
it buys a cue the lighting already gives. The *banding* half of the old reason survives only at
4-bit and 1-bit, which is C10's rung rather than this form's (F433). **Ambient occlusion is the
cheaper lie** if contact darkening is ever wanted, and neither belongs here.

**A second light.** *The terminal cannot show the difference* was true of nine levels and is
false of two 24-bit colours. What refuses it now is narrower and is the `studio` ruling itself:
a second light **in view space** rotates with the first, so it changes a constant rather than
the picture, and a second light **in world space** reintroduces exactly the dead angle the
default exists to avoid. So it is refused as *no second view-space light, and world-fixed is
already the escape hatch* — `light: { azimuth, elevation }`, one of them.

#### Normals

**From a height field**: the cross product of the two tangent vectors at each grid point —
four subtractions and one cross product per cell.

**From an explicit mesh**: the face normal, or vertex normals averaged from adjacent faces for
smooth shading. **Face normals give a faceted look and vertex normals give a smooth one**, and
a sphere needs the second to read as a sphere rather than a geodesic dome. Both are worth
having; `shading?: "flat" | "smooth"`, defaulting to `"smooth"`.

**And the degenerate case is not the edge-on plane's — measured, and it is wrong in both
directions** (F456). The plane `x = 0` seen from a camera inside it: 32 faces, **every one with a
3D area of 0.125**, **zero degenerate normals of 32**, and the first normal `(0.25, 0, 0)` — the
plane's own, pointing along `x`. Nothing about the geometry is undefined and nothing divides by
anything. **The zero is in the projection**: every face's *screen* area is exactly `0`, `1/area`
is `−Infinity` — a **signed** zero — and the barycentric weights a rasteriser computes from it are
`NaN`. So the divide-by-zero this paragraph scheduled as the first test is real and it is in the
**rasteriser**, two stages away from the lighting it sends a reader to.

**And the divide it names does not exist.** `project3.ts`'s `unit` already returns a zero-length
vector unchanged rather than `NaN` — one dimension up from `axis`'s zero-extent rule, and written
three steps before this — so nothing divides by a normal's length anywhere in the pipeline. A face
with no normal shades at **ambient only**, which is the honest reading: `dot(0, l)` is `0`, and
C12 I86 already draws a collapsed set rather than refusing it.

**The genuinely degenerate face is produced by the normalisation, not by the caller** — and the
condition is narrower than the first version of this paragraph said. A zero-width `xRange` alone is
**not** enough:

```
xRange 0, heights vary along x        0 of 8 zero normals
xRange 0, heights constant along x    8 of 8
xRange 0, heights constant along y    0 of 8
xRange 0, heights all flat            8 of 8
xRange 0 AND yRange 0                 8 of 8
normal ranges, heights all flat       0 of 8
```

After `unitOf` the collapsed axis contributes nothing to either edge vector, so the cross product is
`(−Δz_x · Δy, 0, 0)` — zero exactly when the surface is **also** constant along the axis that
collapsed. Two collapsed axes always do it, because then the cell is collinear.

**The first wording here was *a zero-width `xRange` gives 8 of 8*, which is true of the grid it was
measured on and false of the next one** — F451's own class, arriving in the paragraph written to
record F456. It cost nothing because the row that asserts it failed on the first run; it would have
cost a reader the belief that a range check at the gate could catch this.

The case arrives through the **projector** rather than through the input either way, so a caller
cannot avoid it by validating their mesh and the gate cannot refuse it without refusing a legal
document.

The two zeros and their rulings are C12 §6h rows 1–4.

---

## 4 · Axes — the actually hard part

**This is more work than the surface renderer**, and every 3D plotting library gets some of
it wrong.

**Three projected axis lines**, each with ticks and labels, drawn in a coordinate system that
moves under the reader.

### The rules

**Labels are billboarded — always horizontal, never rotated.** They move with their anchor
and that is all. **This is the ruling that makes the whole thing tractable.**

**An axis edge-on hides its labels.** When an axis projects to near-zero length, its ticks
collapse into one point and its labels overlap. **Hide the labels, keep the line** — the axis
is still information about orientation even when its scale is unreadable.

**Ticks project like everything else.** A tick is a short segment perpendicular to the axis
in the plane of the other two — so it stays visually perpendicular as the camera orbits.

**Label collision drops the later one**, same rule as `niceAxis` already uses. **And the
axis with the most visible extent gets priority** when two axes' labels compete.

**Which corner the axes draw at depends on the camera.** matplotlib picks the back-left
corner as seen from the current view, so the axes never occlude the data. **Same rule:
compute which of the eight box corners is furthest from the camera and draw from there.**

### Placement — and it is not one choice, it is two

**Where the axes sit and where the origin sits are independent.** Conflating them is how a
plot ends up unable to show a signed field.

```ts
axes3?: "corner" | "origin" | "centre" | false;
origin3?: "auto" | "min" | "centre" | Readonly<{ x: number; y: number; z: number }>;
```

**`axes3` — where the three axis LINES are drawn:**

| value | shape | for |
|---|---|---|
| `"corner"` *(default)* | along the back-left edges of the bounding box | a surface, a scatter of positive data — the axes never occlude |
| `"origin"` | three lines crossing at the data's origin, extending both ways | a signed field, a vector space, anything centred on zero |
| `"centre"` | crossing at the data's midpoint | when zero is not in range but a reference frame still helps |
| `false` | none | a bare surface, a decorative render |

**`"origin"` is the one the design was missing.** A 3D scatter of an embedding is centred on
nothing in particular; a plot of a signed field is centred on zero, and **axes at the corner
put the reference frame nowhere near the thing it references.** matplotlib cannot do this
without work; it should be one field here.

**`origin3` — where the coordinate zero SITS in the box:**

```
"auto"     the data's own minimum, unless the range crosses zero, in which case zero
"min"      always the data minimum — the corner. Positive-only data
"centre"   the box's midpoint regardless of the data
{x,y,z}    explicit, and refused if outside the data range
```

**`"auto"` is the rule worth having**: a range of `[2, 8]` puts the origin at the corner
because zero is not interesting; a range of `[-3, 5]` puts it at zero because it is. **The
data says which, and the caller overrides.**

### Axis styling — per axis, not per plot

```ts
axisStyle3?: Readonly<{
  x?: AxisSpec; y?: AxisSpec; z?: AxisSpec;
}>;

type AxisSpec = Readonly<{
  label?: string;
  show?: boolean;              // hide one axis without hiding all three
  ticks?: boolean | number;    // false, or a maximum count
  format?: Plot["yFormat"];
  scale?: ScaleType;           // per axis — log z with linear x and y is the common case
  range?: readonly [number, number];   // pinned, rather than derived
  arrow?: boolean;             // an arrowhead at the positive end
}>;
```

**Per-axis rather than per-plot, because the axes genuinely differ.** A loss landscape wants
**log z** with linear x and y. A time-indexed 3D scatter wants a **time axis** on x and
numbers on the other two. **One `ScaleType` for all three is the wrong shape** and it is the
same mistake `xScale`/`yScale` already avoids in 2D.

**`arrow` matters for `axes3: "origin"`**, where an axis extends in both directions and the
reader needs to know which end is positive. `→ ↑ ↗` are all Ambiguous, so the ASCII arm is
`> ^ /`.

**And `show: false` per axis is not the same as `axes3: false`.** A height field over a
regular grid often wants z labelled and x/y unlabelled — the grid is the x/y reference and
the labels are noise.

### The bounding box

**An optional wireframe box around the data**, which is what makes a 3D plot readable at all
— it gives the eye a reference frame for the rotation.

```
box: "none" | "back" | "full"      default "back"
```

**`"back"` draws only the three faces furthest from the camera**, so the box never occludes
the data and the reader still gets the frame. **Recompute which three on every camera
change** — it is three dot products.

---

## 5 · Text in the scene

**Beyond axis labels: arbitrary anchored text.**

```ts
type Label3 = Readonly<{
  x: number; y: number; z: number;
  text: string;
  anchor?: "centre" | "left" | "right" | "above" | "below";
}>;
```

**Billboarded, depth-tested at the anchor, drawn over.** Consumers: naming a cluster in an
embedding, marking a minimum in a loss landscape, labelling a face of a cube.

**Collision handling is the 2D problem** — sort by depth, draw front-to-back, skip a label
whose cells are already occupied by another label. **Not by geometry** — a label over a
surface is fine and intended.

---

## 6 · The style tiers

```
plotStyle: "half"         `▀`, two full colours per cell — width × 1 by height × 2.
                          THE DEFAULT, and the measurement is why (F431)
plotStyle: "braille"      the dot grid — 2×4 per cell. NOT for surfaces: the interior
                          samples are all lit and carry nothing. Points and lines,
                          where the whole primitive IS its outline
plotStyle: "line"         cell resolution with box drawing. Wireframes with real joins
plotStyle: "ascii"        the ASCII arm, and the marker set's ASCII rung
```

**Braille is demoted rather than deleted, and the split is by primitive rather than by taste.** A
scatter and a wireframe are outline all the way through — every dot they light is a boundary dot —
so the dot grid's 4× sample count is entirely spent on signal. A *surface* is 89–96% interior, and
there the dot grid is a stipple over a colour the cell was going to paint anyway.

**And the capability ladder crosses it:**

```
24-bit    colour, and that is the whole channel
8-bit     colour quantised to the 26-grey ramp — 1.43× from a dither, so still colour
4-bit     the dither earns its place here (3.51×) and it is C10's, not 3D's
1-bit     the dither, at 7.84×, and depth reads through marker size for points
```

### The dither is not ported, and it was measured rather than assumed

**It was in this design because braille had one channel** — eight dots, nine levels, no colour. The
premise is gone, so the question was reopened and measured against `colourDepth` rather than
against the rung (F433):

```
depth  greys   4×4 block-mean MAE, plain → dithered      ratio
  24     256   0.0002 → 0.0002                           1.09×
   8      26   0.0025 → 0.0018                           1.43×
   4       4   0.0473 → 0.0135                           3.51×
   1       2   0.2528 → 0.0323                           7.84×
```

**At 24-bit it buys nothing.** And at 4-bit, where it buys 3.51× on tone, the plain quantisation
still *reads* more cleanly — posterised contours but a sharp cone — because a 4×4 Bayer cell is
**1/20 of an 80-wide raster**. A dither buys tone by spending space, and space is the axis this rung
has least of: 1/67 of the image protocol's samples.

**So: the dither is a function of colour depth, not of this form.** Where it earns its place it
belongs to whatever quantises a colour and helps a heatmap, an image and a surface identically —
**a technique that helps every raster equally is not a property of the form that noticed it.** It is
not on `Serves` either: `Serves` is `Record<LadderAxis, boolean>` over the **two** axes that are
ladders (`height`, `density`) out of `Encoding`'s four, and the half-block rung is colour rather
than a ladder step, so no axis is added and no existing ladder changes.

---

## 7 · The test cases, and each catches something different

**Your list, with what each one is for:**

**Every figure in this section is at 80×24 cells** — the size the measurement ran in — and none of
them is a threshold. A triangle count that is comfortable at 80×24 is four times the work at
160×48, and the sample grid scales with the region rather than with a constant.

```
SPHERE            normals vary smoothly — catches shading discontinuities, and
                  backface culling (exactly half the faces should survive)

CUBE              flat faces, hard edges — catches z-fighting at the seams and
                  normal calculation on a degenerate quad. Also: the six faces
                  should be six distinct intensities under one light

AXIS PLANES       x=0, y=0, z=0 — THE EDGE-ON CASE. A plane projects to a LINE
                  and its faces keep their area, their normals and their
                  lighting; the rasteriser is what divides by zero. WRITE THIS
                  TEST FIRST  (three of this row's four clauses were false — F456)

TILTED PLANE      the general case, and where BANDING shows. On the dot grid the
                  suspect was the Bayer matrix; on this rung there is no matrix,
                  so a band is the colour quantisation and the row reads the
                  `colourDepth` it ran at

z = sin(x)·cos(y) a known egg-carton — verifiable by eye, and the standard
                  surface-plot demo everywhere

z = x² − y²       a saddle — catches the case where the surface passes through
                  itself in projection

a Gaussian        smooth, single peak — the cleanest test of the colour/shading
                  separation, because height and field can be set independently
```

**The edge-on plane is the one that will break things, and not in the place this said.**
Measured (F456): the faces have area `0.125`, the normals are the plane's own `(1, 0, 0)`, and
**zero of 32** are degenerate — so there is no undefined normal and no divide in the lighting.
What is zero is the **projected** area, exactly, giving `1/area = −Infinity` and `NaN` barycentric
weights. **First test written, and the degenerate row every field form owes** — pointed at the
rasteriser. The undefined normal is a real case and it belongs to a **zero-width range**, where
`unitOf` collapses an axis and 8 of 8 faces come back with the zero vector.

### And then real meshes, because synthetic geometry is too well-behaved

**A sphere generated from spherical coordinates has consistent winding, no degenerate faces
and no holes. A real mesh has all three**, and they are what break a renderer.

| mesh | size | what it catches |
|---|---|---|
| **Utah teapot** | ~1,000 quads | a KNOWN silhouette — wrong is instantly visible. The handle self-occludes, which is the z-buffer's real test rather than its synthetic one |
| **Stanford bunny** | 69,451 triangles | scale, and **it has holes in the base** from the original scan — so it tests backface culling on a mesh that is not closed but looks like it should be |
| **Suzanne** (Blender) | ~500 quads | sharp and smooth regions in ONE mesh — flat versus smooth shading side by side, in a single frame |
| **Cornell box** | 36 faces | the lighting reference. Published correct renders exist, so the shading has an external check rather than an internal one |

**All four are public domain or freely licensed.** OBJ parsing is vertices, faces and optional
normals — **about fifty lines, test-only, never in `src/`.**

**Three things they catch that the synthetic list cannot:**

**Inconsistent winding.** Real meshes have faces wound both ways, so backface culling drops
random triangles and the surface fills with holes. **Every renderer hits this once and
synthetic geometry never shows it.**

**Degenerate triangles scattered at random.** Zero-area faces from the modelling tool — the
same class as the edge-on plane, but **in unknown places rather than a known one**, which is
the difference between a test that passes and a renderer that works.

**Scale.** 69k triangles at 80×24 is roughly 2,000 triangles per cell. **That is the
performance test**, and it is where the projection loop and the shading loop separate — one
of them is the bottleneck and only a real mesh says which.

**And the visual check is unambiguous.** A teapot either looks like a teapot or it does not.
No arguing about whether the shading is subtly wrong.

**They are fixtures, not catalogue entries.** A teapot in `docs/catalogue/` is fun and it is
not what the catalogue is for — the catalogue shows what a form does for a reader, and a
reader does not plot teapots.

---

## 8 · What this reuses

```
strokeSeg             lines, wireframes, axis lines — BUILT at step 4, not step 5 (§3b)
glyphForMask          the box-drawing arm at cell resolution
createGrid / setDot   the raster, plus the depth buffer beside it
the continuous palette   colour by height, depth or field
halfBlockRows         the LAST STAGE, shipped: `▀` with two colours, and `image.ts` paints it
niceAxis              tick selection on all three axes, unchanged
formatReadout         axis labels and the readout
the frame scheduler   auto-orbit at 30fps, free
RenderContext         the camera — the crosshair's SLOT, and not its wiring (§1)
```

**Genuinely new: the rotation, the depth buffer, the lighting, the 3D axis layout.**
**And `strokePolyline` is not on this list any more** — it was, and it walks a cell mask
rather than a dot grid, so the row was reuse of a function that does something else (§3b).
Everything else is a fold over what exists.

---

## 9 · Honest cost and honest value

**Roughly 1,500 lines plus tests** — comparable to a third of the plot system, and
self-contained. It touches nothing existing except `RenderContext` and the render cache key.

**What is genuinely useful:**

```
3D scatter        embeddings, PCA, t-SNE, a three-parameter sweep. NOTHING in a
                  terminal does this and people screenshot embedding plots constantly
surface plot      loss landscapes, response surfaces, any z = f(x,y). NOT claimed to be
                  more informative than matplotlib's — that rested on the dither (§3c)
```

**What is marginal:**

```
wireframe         pretty, and rarely the clearest way to show anything
parametric curves a niche within a niche
```

**And the argument that decides it is the one you made**: *we will not know until we try*,
and **a framework that can do this is a framework people want to use.** The refusal was a fit
argument asserted rather than measured, which is the class this project has now corrected
four times.

---

## 10 · Build order

```
1   the camera type, RenderContext wiring, the cache key — AND ONE WRITER (§1)
2   projection + the depth buffer + frustum culling
3   POINTS — the cheapest primitive and the most useful. A 3D scatter ships here
4   the 3D axis layout, billboarded labels, the back-face box
5   LINES — the CARRIER; the depth-tested stroke landed at step 4 (§3b)
6   SURFACES — normals, lighting, the colour/shading separation
7   backface culling and the wireframe mode — the bias it was scheduled with does not exist
8   auto-orbit and manual camera controls — and §11's two arguments did not survive it
9   the test suite: sphere, cube, axis planes, tilted plane, the three equations
10  golden frames at four capability sets, catalogue fixtures, the animated example
11  a colour per axis — `AxisSpec3.tone`, the one of three that is not built
```

**Step 11 is one member and the other two asks it arrived with are already shipped**, which is why
it is one row rather than three. Checked against the tree rather than against this list:

| asked for | where it is |
|---|---|
| the origin in the middle, with positive **and** negative axes | `axes3: "origin"` — crosses at the data's origin and extends both ways, and `arrow` exists *because* it does: an axis running both ways has to say which end is positive |
| the origin somewhere else | `origin3: "auto" \| "min" \| "centre" \| {x, y, z}`, plus `axes3: "centre"` for the box's midpoint when zero is out of range |
| a colour per axis | **nowhere.** `AxisSpec3` carries `label`, `show`, `ticks`, `format`, `range` and `arrow`, and every axis is drawn in `tone.muted` |

**And the third is not a fourth member on the plot.** `AxisSpec3` is already per axis, so it is a
`tone` there — the same field `Point3Series`, `Line3` and `Surface3` each carry, resolved by the
same `slot`. What needs deciding when it lands is the **default**: `tone.muted` for all three is
what ships now, and three different tones by default would make the frame compete with the data,
which is the thing `box3: "back"` exists to avoid. So the member is opt-in and the default does not
move — the shape `arrow` already has.

**Steps 1–3 ship a working 3D scatter.** That is the point at which it stops being
speculative — everything after it is improvement rather than proof.

**Steps 1–3 have landed, and four things this note said turned out to need correcting** — which
is what building it was for:

- **`CAMERA_DEFAULT.distance` was 10 and it frames the data at 11% of an 80-column frame.** The
  number was set one step before anything could project, so nothing could be wrong about it.
  Measured over the normalised cube's corners at six cameras: **6** is the largest distance whose
  worst case clears the frame edge. F440.
- **§3a's marker table is the *glyph arm's* and does not port to the raster.** On the half-block
  rung every cell is `HALF_BLOCK` and the whole picture is the two colours, so a tier there is a
  **sample count** — `2×2`, `1×2`, `1×1` — rather than a glyph. One table cannot serve both arms
  (C12 I88).
- **§6's tier list conflates a caller's choice with a capability rung.** `plotStyle: "half"` and
  `"ascii"` are not members of `plotStyle` and should not be: `halfBlockEligible` reads `unicode`,
  `ambiguousWidth` and `colourDepth`, so the arm is the terminal's. `STYLE_ARMS.scatter3d` is
  empty, and that is a ruling (C12 I87).
- **The rung needed a glyph it did not have.** A photograph inks every cell so the image arm needs
  only `HALF_BLOCK`; a scatter is mostly empty, and a cell inked only below needs `▄`. Found by
  writing the second consumer. F443.

**And the external check**: `make refdiff` puts the form beside matplotlib's `scatter3D` at
**7.8% ink disagreement, fourth of 31 compared forms** — behind `dotplot`, `step` and `scatter`.
The remaining difference is a framing convention: matplotlib stretches the data box to fill the
axes and this preserves the cube's proportions, which is what makes a sphere look like a sphere.

**The old step 6 — *the dither ramp as a fourth encoding axis* — is gone, and its removal is the
residue worth naming.** §3c and §6 were rewritten to refuse the dither and this list was not, so
the build order kept a step for a mechanism the document two sections up had ruled out. **A
ruling reaches the section it is argued in and not the list that schedules it** — F86, F89 and
F92's mechanism running the other way round, and the thing that surfaced it was a reader's own
step list silently disagreeing with this one.

**And the degenerate rows cannot be parked.** `tools/enforce/todo-expiry.mjs` matches a blocker
as `C\d{2}` or `L\d` only, and C12 exists — so `it.todo("… waits on surfaces")` cannot be
written and `waits on C12` expires the day it is written. The edge-on plane therefore splits by
step: its **projected extent of zero** is writable at step 2 and its **zero-area face, undefined
normal and divide-by-zero lighting** at step 6. First within its own step, both times.

---

## 11 · Animation — and 3D breaks the assumption 2D rests on

> **Both this section and §12 were costed on the dot grid, and step 8 re-ran them.** Every figure
> below is now measured on the half-block rung — 80×48 full-colour samples at 80×24 cells, load
> 0.14–0.30 — and where the old reading survives it says so. **Two of the arguments did not
> survive, and it was not the numbers that moved.** *One of those three stages is the bottleneck*
> was wrong about all three (F469), and *every cell changes* was wrong by about a third (F468).
> The standing reminder holds and points the other way: a number carried across a changed premise
> can be exactly correct about the wrong thing (F433), and so can an argument that never had a
> number at all.


**The 2D animation story is measured and holds**: the render cache keys on `(rev, width,
focus, theme)`, a `replace` patch bumps one entry's `rev`, and `render-frame.ts` diffs the
composed frame row by row so **only changed rows are written.** A line plot updating one
sample rewrites a handful of rows.

**None of that helps here, and the reason is structural.**

### Output diffing saves less during an orbit, and *less* is not *nothing*

**This section used to read *a camera change moves every projected vertex, so every cell
changes*.** The premise is true and the conclusion does not follow: most vertices move less than
a sample, and most cells were blank to begin with. Measured cell against cell, row-aligned, over a
40×40 surface at 80×24 — 876 cells, **302 of them inked** (F468):

```
step        rows differing     cells differing
π/256           14 / 24          193 / 876   22.0%
π/64            17 / 24          265 / 876   30.3%
π/32            17 / 24          308 / 876   35.2%
π/8             19 / 24          466 / 876   53.2%
```

At the rate an orbit actually turns — 1° a frame at 30fps — the row diff writes about 14 rows of
24 and skips 10. That is far less than 2D gets and it is not nothing.

**So the budget is still the per-frame RENDER cost and not the diff size**, which is the part of
the old argument that holds: 30% of rows saved does not change which side of 33 ms a frame falls.

**And the cache is a pure miss during orbit — for a stronger reason than the key.** `RenderCache`
holds **one slot per entry**: `set` overwrites, so a repeated key hits only when it is the
*immediately previous* one. Normalising azimuth into `[0, 2π)` would therefore buy nothing, and an
orbit cannot grow the cache either. **Worth stating so nobody later reads a 100% miss rate as a
defect**, and worth stating with the right reason so nobody later tries to fix it by wrapping.

### The two update paths are different work

```
CAMERA changed, data same     re-project everything, re-shade everything.
                              The full pipeline, every frame
DATA changed, camera same     the same full pipeline — a surface is ONE object, so
                              a changed height field re-projects all of it
```

**Both are a full redraw.** There is no partial-update path in 3D and pretending otherwise
would be the optimisation that produces a wrong picture.

### The budget, measured — and none of the three candidates is the cost

**At 80×24 on this rung**: 80×48 samples, 3,840 depth entries. A 40×40 height field is 3,200
triangles. **The three stages this section named as candidates are 28% of the frame between
them** (F469):

```
P1  projection only                        0.170 ms    1.3%
P2  + rasterisation (INCLUDES the shading) 2.932 ms   22.6%
P3  shade alone, at 1,916 paint calls      0.589 ms    4.5%
P4  the whole frame                       12.969 ms
```

**And P2 and P3 do not separate at any seam that ships.** `fill` builds the interpolated normal
and calls `shade` inside the depth-tested branch, unconditionally — so §12's *P3 minus P2 is the
shading* subtracts two rows that measure the same code. The 0.589 ms is `shade` timed on its own
inputs at the measured call count: a proxy, and stated as one.

**Where the frame actually goes:**

```
chrome only — the block with an empty surface list        3.216 ms   24.8%
span composition and the rest of scatter3dArea            ~3.1  ms   ~24%
rasterise + shade                                         2.932 ms   22.6%
the 3D axes — axes3 default 13.265 against false 11.108   2.157 ms   16.6%
trianglesOf — camera-independent, rebuilt every frame     1.265 ms    9.8%
projection, surfacePoints, extentOf                       0.311 ms    2.4%
paint — spans to strings, 5.340 against 5.284             0.056 ms    0.4%
```

**Scaling holds and is better than linear.** 3,200 → 69,192 triangles is 21.6× the geometry and
**9.6×** the frame, 12.97 ms to 124.2 — because the block's own cost is fixed. **But at that size
`trianglesOf` alone is 36.1 ms**, over the whole 33 ms budget for a computation the camera does not
move, so a 69k mesh does not orbit at any rate the scheduler offers. The remedy is caller-owned
scratch on `RenderContext`, which this section already rules for the depth buffer.

**If a full-detail frame exceeds the budget, drop the FRAME RATE before the resolution.** A
10fps orbit at full quality reads better than a 30fps orbit that is visibly coarser — and the
resolution is the thing the reader is looking at. **That is also the shape the capability cap
takes**, one heading down.

### Synchronised update is not optional here

**A full-frame rewrite without DEC 2026 tears.** In 2D a few changed rows land within one
terminal refresh and nobody sees it; **a 24-row rewrite at 30fps will show a horizontal seam
every frame on a terminal that does not support it.**

`synchronisedUpdate` is already a declared capability. **Where it is absent, cap the orbit
frame rate lower** — the tear is worse than the slower rotation, and that is a ruling rather
than a fallback.

**And the cap is the commit reason, not a second number** (C22 I73, F466). A live orbit commits
`stream` and everything else keeps `spinner`, whose 100 ms window is a floor under the ticker
(C22 I60a) — so absent the capability the orbit ticks at 100 ms and commits `spinner`, which is
10fps rather than 30 with nothing invented. One switch with two effects, and the capped rate is
the one this section already calls acceptable at full quality.

### The depth buffer and purity

**A `Float32Array(3840)` allocated per render is 15KB, thirty times a second — 0.45MB/s of
allocation.** The old figures were the dot grid's 160×96; this rung's sample grid is 80×48, a
quarter of the entries. Trivial for the GC either way, and it keeps the render a pure function.

**Do not reach for a module-level scratch buffer.** C12 I11 forbids it, and the measurement
above will say whether the allocation is even visible in the profile. **If it turns out to
matter, the buffer belongs in `RenderContext` as caller-owned scratch** — which keeps the
function pure and makes the ownership explicit, rather than hiding state in the module.

### What auto-orbit costs when nothing else is happening

**A live 3D plot orbiting at 30fps is a continuous full-frame redraw for as long as it is on
screen.** That is a real cost in a way a live line chart is not, and it should be a deliberate
choice rather than a default. **It is now a number rather than an argument**: 12.97 ms a frame
over 3,200 triangles, so 30fps is **39% of a core** for as long as the plot is on screen — and
124 ms at 69,192, which no rate holds.

**So auto-orbit defaults to OFF.** A static 3D plot is free — one render, cached, and the
cache holds until the width or theme changes. **The reader turns rotation on when they want
it**, and that is the honest shape given what it costs.

### Tests

```
AN1   a static 3D plot renders once and hits the cache on the second render
AN2   a camera change misses the cache — asserted, because it is meant to
AN3   an orbit step changes a MEASURED FRACTION of the frame's cells — compared row
      against row and index against index, never by string position. The row records
      the fraction; "every cell changes" is what it replaces (F468)
AN4   plotHeight is identical across every camera position — C12 I1 unchanged
AN5   with synchronisedUpdate absent, the orbit ticks at 100 ms and commits `spinner`;
      present, 33 ms and `stream`. BOTH ARMS — a cap that always applies and one that
      never does read the same from a passing suite
AN6   the render is pure — same block, same camera, same context, identical bytes
AN7   the budget rows — and P2 and P3 do not separate, so the third is a proxy (F469)
```

---

## 12 · Performance tests — the tier, and what each row is for

**Written before the renderer, because a budget discovered afterwards is a budget nobody
meets.** Every row measures one stage in isolation, because *the frame is slow* is not a
finding — *the rasteriser is slow* is.

### The budgets

```
16 ms    one frame at 60fps — the ceiling for a cursor-rate interaction
33 ms    the FrameScheduler's stream window — the real target for orbit
100 ms   a static render nobody is orbiting. Above this it feels stuck
```

**33 ms is the number that matters**, because it is what the scheduler already coalesces to.
A render under it orbits smoothly; a render over it drops frames and the scheduler's
coalescing hides the cause.

### The stages, timed separately

**This is the design's own instruction and it is the whole point of the tier.** Time each in
isolation, on the same input, so the profile names a stage rather than a total.

| row | measures | input |
|---|---|---|
| row | measures | input | **measured** |
|---|---|---|---|
| **P1** | rotation + projection only, no writes | 3,200 triangles | **0.170 ms** |
| **P2** | + rasterisation with the depth test | 3,200 triangles | **2.932 ms** |
| **P3** | shading — a **proxy**, see below | 1,916 paint calls | **0.589 ms** |
| **P4** | the whole frame, end to end | 3,200 triangles | **12.969 ms** |
| **P5** | P1–P4 again at 69,192 | a 187×187 field | **4.5 / 54.9 / — / 124.2 ms** |
| **P6** | points only, no faces | 10,000 points | **5.835 ms** |
| **P7** | lines only | 5,000 segments | **3.375 ms** |

**The three subtractions do not work and that is a finding rather than a measurement problem**
(F469). `fill` calls `shade` inside the depth-tested branch unconditionally, so P2 already
contains P3 and no seam separates them; P3 above is `shade` timed on its own inputs at the
measured call count. **And the bottleneck does not name itself, because it is none of the three**
— P1, P2 and P3 are 28% of the frame between them and the rest is the block: chrome 3.216 ms,
the 3D axes 2.157, `trianglesOf` 1.265, span composition ~3.1, and the paint from spans to
strings **0.056**.

**P5 separates *slow* from *does not scale*, and it scales.** 21.6× the triangles costs 9.6× the
frame. **What it exposes instead is `trianglesOf` at 36.1 ms of 124.2** — camera-independent, and
recomputed identically on every orbit frame.

**The bunny is not the fixture.** 69,192 triangles from a 187×187 height field, because the
question is the triangle count and a mesh file would be a dependency with a licence.

### Allocation

```
P8   the depth buffer — 15KB per render at 80×24 on this rung, not 60KB: the sample
     grid is 80×48 rather than 160×96, a quarter of the entries. Assert it is
     allocated once per render and not per triangle
P9   sustained orbit — 300 frames at 30fps. Heap at frame 1 against frame 300.
     Flat is the pass; growth is a retained buffer and a purity violation
P10  no module-level state — the grep C12 I11 already requires, as a row
```

**P9 is the one that catches a scratch buffer smuggled in as an optimisation**, which is the
tempting fix the design already refuses.

### Bytes to the terminal

```
P11  a static 3D render — bytes written once.       MEASURED 8,372 B over 24 rows
P12  an orbit frame — cells changed per frame.      MEASURED 22.0%–53.2%, above
P13  the same at colourDepth 1 — no SGR, the floor. MEASURED 1,073 B, so colour is 7.8x
P14  with synchronisedUpdate absent — assert the reason is `spinner` and the interval
     100 ms, and with it present that they are `stream` and 33. Both arms
```

**P12 is not a regression test, it is a measurement — and it changed the claim it was written to
record.** *The diff saves nothing during an orbit* is what this section used to say; the row says
22% of cells at the rate an orbit turns and 53% at a jump (F468). The bytes are still the thing to
watch, and now the fraction is too.

### Scaling, per axis

```
P15  width      40 · 80 · 120 · 200 columns at a fixed mesh
     MEASURED  10.104 · 10.646 · 12.375 · 12.736 ms   — 5x the width costs 1.26x
P16  mesh      3,200 · 69,192 triangles at a fixed width
     MEASURED  12.969 · 124.213 ms                    — 21.6x the mesh costs 9.6x
P17  height     8 · 24 · 48 rows
     MEASURED   6.144 · 11.062 · 18.958 ms            — 6x the rows costs 3.09x
```

**The prediction was *width and height scale the sample grid quadratically* and the curves
disagree**, which is what this row was for. Neither axis is quadratic and width is nearly flat,
because the sample grid is not what the frame is spending on (F469): **the axis that costs is the
one that adds rows**, not the one that adds samples. The loop structure is not wrong; the model
of where the time goes was.

### The comparison rows

```
P18  a 3D scatter against the 2D scatter, same point count — the cost of the
     third dimension, stated as a multiple
     MEASURED  2.485 against 2.402 ms at 2,000 points — 1.03x
P19  a surface against a heatmap of the same grid — the cost of shading over
     colouring
     MEASURED  11.183 against 15.044 ms at 40x40 — 0.74x, the surface is CHEAPER
```

**These are the rows that answer *is 3D worth it* in numbers rather than in argument**, and the
answer is that the third dimension is free. *If a 3D scatter is 40× a 2D one, that is a finding
about the design; if it is 3×, it is fine and nobody needs to wonder* — it is **1.03×**, and a
surface is cheaper than a heatmap of the same grid. Both for the same reason: the frame's cost is
mostly the block, and both forms pay it.

### Degradation under budget

```
P20  a mesh that exceeds 33 ms — assert the frame rate drops and the RESOLUTION
     does not. The design's ruling, as a test rather than as prose
P21  the cap is announced, not silent — a reader who is getting 10fps should be
     able to find out why
```

**Neither row has a subject yet, and saying so is the disposition** (C22 §6i.4). A cap *chosen
under load* presupposes something that sheds load, and nothing does; the capability cap in C22 I73
is taken once from `synchronisedUpdate` and not per frame, and it is announced by nothing — which
is right, because a reader on a terminal without DECSET 2026 has nothing to do about it. **A row
written now would pass by having no subject**, which is A03 §2's vacuity class, so these wait for
the mechanism rather than for the will.

### How the rows run

**Not in the main suite.** Performance rows are load-sensitive — this project has already
recorded `4.08 at load 19.6 against 6.0 at load 5.2`, so **the ratio is bimodal and its
magnitude says nothing about how busy the box is.**

**So: a separate target, run deliberately, and every row records the load average beside its
number.** A row that fails once and passes on a rerun is a load artefact; a row that fails at
low load is a finding. **Recording the load is what separates them**, and this project has
had to learn that three times.

**And the budgets are assertions, not observations.** `expect(ms).toBeLessThan(33)` fails
loudly and gets investigated. A row that merely prints a number is a row nobody reads.
