# `plot3d` — a 3D renderer for the terminal

**The refusal was wrong and it was wrong for a stated reason.** *A novelty, not a tool* is a
fit argument asserted without checking whether it holds — and it does not: a 3D scatter of an
embedding space and a surface plot of a loss landscape are both things people screenshot,
and nothing in a terminal draws either.

**Billboard rendering is the right frame**, and it makes the hard part tractable: a label
never rotates, it only moves, so the 3D text problem collapses into a 2D layout problem this
component has already solved twice.

---

## The fact that makes this work: braille dots are square

```
a cell        1 wide × 2 tall        (roughly, in every monospace font)
braille       divides it 2 × 4
ONE DOT       1/2 wide × 1/2 tall    ← SQUARE
```

**So a projection into the braille dot grid needs no aspect correction at all.** The cell's
2:1 distortion and braille's 2:4 subdivision cancel exactly — the same cancellation that
makes `circle.ts`'s pie genuinely round where granite's is an ellipse.

**Every other terminal 3D attempt fights this.** This one gets it free, and it is the reason
to build on the dot grid rather than on cells.

**At cell resolution the correction returns** — `rx = 2·ry`, already the rule in `circle.ts`
— which is the `plotStyle: "line"` arm and is a real second tier rather than a fallback.

---

## The pipeline

```
world  →  view      one 3×3 rotation from (azimuth, elevation), then translate by distance
view   →  clip      frustum cull: drop what is behind the camera or outside the view
clip   →  NDC       perspective divide (x/z, y/z), or drop z entirely for orthographic
NDC    →  dots      scale to the dot grid. NO ASPECT CORRECTION (braille)
dots   →  raster    depth-tested writes into the grid
raster →  shade     glyph from the density ramp, colour from the continuous palette
```

**Six stages, four of which already exist in some form.** The new work is the rotation, the
depth buffer, and the shading — and the shading reuses two mechanisms built for other forms.

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
auto-orbit     azimuth += δ per frame — the stream window is 33ms, so 30fps is free
manual         ← → azimuth · ↑ ↓ elevation · + − distance · r resets
```

**The render cache key gains the camera**, which is the third instance of that story after
the scroll offset and the crosshair. **Add it with the feature.** A cached frame served after
an orbit is a plot that does not move, and it looks like a hang rather than a bug.

**Auto-orbit and the readout cursor are mutually exclusive** — a moving camera and a fixed
sample index disagree about what the reader is pointing at. **Orbit pauses while the cursor
is active**, which is a ruling rather than an accident.

---

## 2 · Depth

```ts
const depth = new Float32Array(dotWidth * dotHeight);   // 80×24 → 15,360 floats
```

**Sixty kilobytes at a typical size.** That buys exact hidden-surface removal — no painter's
algorithm, no sorting, no artefacts at intersections.

```
write(x, y, z, glyphData):
    if (z < depth[y * dotWidth + x])  { depth[...] = z; grid.set(x, y, glyphData); }
```

**Cleared to +∞ per render**, and it is per-render state inside a pure function, which is
allowed — I11 forbids state that *survives* a render, not a local buffer.

### Culling, in order

```
1  frustum        drop primitives entirely behind the camera or outside the view volume.
                  BEFORE projection — a point behind the eye projects to a valid-looking
                  coordinate with a negative z, and that is the classic bug
2  backface       for closed surfaces: dot(normal, view) < 0 → drop. Removes ~half the
                  faces of a sphere and is what makes a solid look solid
3  depth test     per dot, as above
```

**Backface culling is opt-in per surface** (`closed?: boolean`), because an open surface — a
height field, a plane — has no inside and culling it drops half the picture depending on
which way you orbit.

### Two depth rules that need stating

**A label's depth is its anchor's, and a label draws over.** A label is *cells* where the
buffer is *dots*, so writing every label cell's depth is expensive and wrong at the edges.
**Test the anchor, then draw unconditionally** — a label is annotation, not geometry, and a
label hidden behind a surface is a label nobody can read.

**A wireframe edge on a surface z-fights.** The edge and the face are at the same depth by
construction. **Bias edges toward the camera by a small constant** — one number, stated in
the spec rather than tuned until it looks right.

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

### 3b · Lines — `strokePolyline` with a depth test

**The existing function walks a path in the dot grid setting dots.** The only change is
`write(x, y, z, …)` instead of an unconditional set, with `z` interpolated along the segment.

**Everything else is inherited**: the box-drawing arm at cell resolution, `glyphForMask`, the
ASCII fallback. **A wireframe with real box-drawing joins is what `plotStyle: "line"` gives
you here**, and it is a genuinely different picture from the braille one rather than a
coarser copy.

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
  closed?: boolean;                          // enables backface culling
  wireframe?: boolean | "over";              // edges only, or edges over the fill
}>;
```

**Two independent inputs, and this is where it beats matplotlib:**

```
field (or height)  →  the continuous palette   →  COLOUR
face normal · light →  intensity 0..1          →  GLYPH DENSITY
```

**Multiply them.** A loss landscape coloured by *loss* and shaded by *slope*, both readable
at once. **matplotlib's surface plot has one colour channel; this has colour and dither
pattern**, which is more information per cell rather than less.

#### Dithering is what makes it look 3D

**A braille cell is 8 subcells, so an ordered dither over a 2×4 Bayer matrix gives 9
intensity levels per cell with no banding.**

```
intensity 0.0   ⠀        intensity 0.5   ⠳ ⣄ ⡜  (pattern varies by position)
intensity 0.25  ⠌        intensity 0.75  ⣷
intensity 1.0   ⣿
```

**The pattern depends on the cell's grid position**, which is what makes it a dither rather
than a ramp — adjacent cells at the same intensity use different sub-patterns, so a gradient
reads smooth instead of stepping.

**This is a fourth ramp axis and it must declare itself**: `rampFor("dither", caps)` beside
height, density and column. **A dither ramp indexed as a density ramp is the encoding-rule
violation the type exists to prevent**, and the two look interchangeable at a glance.

**At ASCII, `.:-=+*#@` ordered-dithered by the same matrix.** Coarser, still smooth.

#### Lighting

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
diffuse     0.8 · max(0, dot(normal, lightDir))          Lambertian
specular    0.4 · pow(max(0, dot(reflect, view)), 16)    a highlight on curvature
distance    × (1 − 0.3 · normalisedDepth)                far is dimmer
```

**The ambient term is not optional**: without it a face turned fully away is black and reads
as a **hole** rather than a surface, which is worse than being wrong about the light.

**The specular term is cheap and buys more than it costs.** On a sphere it is **the difference
between a disc and a ball** — and at nine dither levels there is enough range to show a
highlight without it blowing out to solid white.

**Depth attenuation is one multiply and a free depth cue.** It stacks with the dither rather
than competing, because both write to the same intensity channel and the reader sees one
result.

**Clamped to `[0, 1]` before the dither ramp indexes it** — a specular highlight can push past
1 and the ramp's top rung is `⣿`, so an unclamped value is an array overrun rather than a
brighter cell.

#### What is refused, and why

**Cast shadows.** They need a second depth pass from the light's position, and at nine
intensity levels the result is banding rather than shadow. **Ambient occlusion is the cheaper
lie** if contact darkening is ever wanted, and neither belongs here.

**A second light.** It doubles the shading code and the terminal cannot show the difference —
nine levels is not enough range for two directions to be separable.

#### Normals

**From a height field**: the cross product of the two tangent vectors at each grid point —
four subtractions and one cross product per cell.

**From an explicit mesh**: the face normal, or vertex normals averaged from adjacent faces for
smooth shading. **Face normals give a faceted look and vertex normals give a smooth one**, and
a sphere needs the second to read as a sphere rather than a geodesic dome. Both are worth
having; `shading?: "flat" | "smooth"`, defaulting to `"smooth"`.

**And the degenerate case is the edge-on plane's**: a zero-area face has no normal, and the
cross product is the zero vector. **Refuse the face rather than dividing by its length** —
which is the first test written.

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
plotStyle: "braille"      the dot grid — 2×4 per cell, square dots, no aspect correction.
                          THE DEFAULT. Points, lines and dithered surfaces
plotStyle: "line"         cell resolution with box drawing. Wireframes with real joins;
                          surfaces fall to solid blocks. rx = 2·ry aspect correction returns
plotStyle: "ascii"        the ASCII arm — . : - = + * # @ ordered-dithered, and the
                          marker set's ASCII rung
```

**And the capability ladder crosses it:**

```
24-bit    colour + dither, both channels
8-bit     quantised colour + dither
4-bit     DITHER ONLY — the colormap is vacuous at 4-bit (C10 I26), which is already ruled
1-bit     dither only, and depth reads through marker size for points
```

**The 4-bit rung is the one to state explicitly**, because it is where colour exists and
cannot carry magnitude — the same rung the heatmap has and the same answer.

---

## 7 · The test cases, and each catches something different

**Your list, with what each one is for:**

```
SPHERE            normals vary smoothly — catches shading discontinuities, and
                  backface culling (exactly half the faces should survive)

CUBE              flat faces, hard edges — catches z-fighting at the seams and
                  normal calculation on a degenerate quad. Also: the six faces
                  should be six distinct intensities under one light

AXIS PLANES       x=0, y=0, z=0 — THE EDGE-ON CASE. A plane projects to a LINE,
                  every face has zero area, the normal is undefined and the
                  lighting divides by zero. WRITE THIS TEST FIRST

TILTED PLANE      the general case, and where dithering banding shows if the
                  Bayer matrix is wrong

z = sin(x)·cos(y) a known egg-carton — verifiable by eye, and the standard
                  surface-plot demo everywhere

z = x² − y²       a saddle — catches the case where the surface passes through
                  itself in projection

a Gaussian        smooth, single peak — the cleanest test of the colour/shading
                  separation, because height and field can be set independently
```

**The edge-on plane is the one that will break things.** Zero-area faces, undefined normals,
a divide by zero in the lighting, and a projected extent of zero for the axis. **First test
written, and the degenerate row every field form owes.**

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
strokePolyline        lines, wireframes, axis lines — plus a depth test
glyphForMask          the box-drawing arm at cell resolution
createGrid / setDot   the raster, plus the depth buffer beside it
the continuous palette   colour by height, depth or field
the density ramp      the dither ramp is a fourth axis beside it
niceAxis              tick selection on all three axes, unchanged
formatReadout         axis labels and the readout
the frame scheduler   auto-orbit at 30fps, free
RenderContext         the camera, exactly as the crosshair
```

**Genuinely new: the rotation, the depth buffer, the dither ramp, the 3D axis layout.**
Everything else is a fold over what exists.

---

## 9 · Honest cost and honest value

**Roughly 1,500 lines plus tests** — comparable to a third of the plot system, and
self-contained. It touches nothing existing except `RenderContext` and the render cache key.

**What is genuinely useful:**

```
3D scatter        embeddings, PCA, t-SNE, a three-parameter sweep. NOTHING in a
                  terminal does this and people screenshot embedding plots constantly
surface plot      loss landscapes, response surfaces, any z = f(x,y). The colour+dither
                  separation makes it MORE informative than matplotlib's, not less
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
1   the camera type, RenderContext wiring, the cache key
2   projection + the depth buffer + frustum culling
3   POINTS — the cheapest primitive and the most useful. A 3D scatter ships here
4   the 3D axis layout, billboarded labels, the back-face box
5   LINES — strokePolyline with a depth test. Wireframes
6   the dither ramp as a fourth encoding axis
7   SURFACES — normals, lighting, the colour/shading separation
8   backface culling, the wireframe-over-surface mode and its depth bias
9   auto-orbit and manual camera controls
10  the test suite: sphere, cube, axis planes, tilted plane, the three equations
11  golden frames at four capability sets, catalogue fixtures, the animated example
```

**Steps 1–3 ship a working 3D scatter.** That is the point at which it stops being
speculative — everything after it is improvement rather than proof.

---

## 11 · Animation — and 3D breaks the assumption 2D rests on

**The 2D animation story is measured and holds**: the render cache keys on `(rev, width,
focus, theme)`, a `replace` patch bumps one entry's `rev`, and `render-frame.ts` diffs the
composed frame row by row so **only changed rows are written.** A line plot updating one
sample rewrites a handful of rows.

**None of that helps here, and the reason is structural.**

### Output diffing saves nothing during an orbit

**A camera change moves every projected vertex, so every cell changes.** The row-by-row diff
compares two frames that differ everywhere and writes all of them. **The mechanism that makes
2D animation cheap is exactly the mechanism that does nothing in 3D.**

**So the budget is the per-frame RENDER cost, not the diff size** — which is the opposite of
every other form and needs measuring rather than assuming.

**And the cache is a pure miss during orbit.** The key gains the camera (§1), so every frame
is a new key. **That is correct and it means the cache contributes nothing while orbiting** —
worth stating so nobody later reads a 100% miss rate as a defect.

### The two update paths are different work

```
CAMERA changed, data same     re-project everything, re-shade everything.
                              The full pipeline, every frame
DATA changed, camera same     the same full pipeline — a surface is ONE object, so
                              a changed height field re-projects all of it
```

**Both are a full redraw.** There is no partial-update path in 3D and pretending otherwise
would be the optimisation that produces a wrong picture.

### The budget, measured rather than asserted

**At 80×24**: 160×96 dots, 15,360 depth entries. A 40×40 height field is ~3,200 triangles.

**Per triangle**: three vertex rotations (9 multiplies each), one cross product for the
normal, one dot for the lighting, then rasterisation across however many dots it covers.

**What to measure before designing around it:**

```
projection only        3,200 triangles, no rasterisation — is the matrix maths the cost?
+ rasterisation        with the depth test — is the fill the cost?
+ shading              normals, lighting, dither — is the per-cell work the cost?
the whole frame        and against the frame scheduler's 33ms stream window
```

**One of those three is the bottleneck and only the measurement says which.** The 69k-triangle
bunny is the same test at twenty times the load, which is what separates *slow* from *does not
scale*.

**If a full-detail frame exceeds the budget, drop the FRAME RATE before the resolution.** A
10fps orbit at full quality reads better than a 30fps orbit that is visibly coarser — and the
resolution is the thing the reader is looking at.

### Synchronised update is not optional here

**A full-frame rewrite without DEC 2026 tears.** In 2D a few changed rows land within one
terminal refresh and nobody sees it; **a 24-row rewrite at 30fps will show a horizontal seam
every frame on a terminal that does not support it.**

`synchronisedUpdate` is already a declared capability. **Where it is absent, cap the orbit
frame rate lower** — the tear is worse than the slower rotation, and that is a ruling rather
than a fallback.

### The depth buffer and purity

**A `Float32Array(15360)` allocated per render is 60KB, thirty times a second — 1.8MB/s of
allocation.** Trivial for the GC and it keeps the render a pure function.

**Do not reach for a module-level scratch buffer.** C12 I11 forbids it, and the measurement
above will say whether the allocation is even visible in the profile. **If it turns out to
matter, the buffer belongs in `RenderContext` as caller-owned scratch** — which keeps the
function pure and makes the ownership explicit, rather than hiding state in the module.

### What auto-orbit costs when nothing else is happening

**A live 3D plot orbiting at 30fps is a continuous full-frame redraw for as long as it is on
screen.** That is a real cost in a way a live line chart is not, and it should be a deliberate
choice rather than a default.

**So auto-orbit defaults to OFF.** A static 3D plot is free — one render, cached, and the
cache holds until the width or theme changes. **The reader turns rotation on when they want
it**, and that is the honest shape given what it costs.

### Tests

```
AN1   a static 3D plot renders once and hits the cache on the second render
AN2   a camera change misses the cache — asserted, because it is meant to
AN3   an orbit frame writes the full plot area, not a subset — the diff saves nothing,
      and the test says so rather than someone discovering it
AN4   plotHeight is identical across every camera position — C12 I1 unchanged
AN5   with synchronisedUpdate absent, the orbit rate is capped
AN6   the render is pure — same block, same camera, same context, identical bytes
AN7   the budget rows: projection, rasterisation and shading timed separately at
      3,200 and at 69,000 triangles
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
| **P1** | rotation + projection only, no writes | 3,200 triangles |
| **P2** | + rasterisation with the depth test | 3,200 triangles |
| **P3** | + normals, lighting, dither | 3,200 triangles |
| **P4** | the whole frame, end to end | 3,200 triangles |
| **P5** | P1–P4 again at 69,451 | the Stanford bunny |
| **P6** | points only, no faces | 10,000 points |
| **P7** | lines only | 5,000 segments |

**P4 minus P3 is the compositing cost**, P3 minus P2 the shading, P2 minus P1 the fill.
**Three subtractions and the bottleneck names itself.**

**P5 is what separates *slow* from *does not scale*.** Twenty times the triangles: if the
whole frame scales linearly the renderer is fine and the input is large; if it scales worse,
something is per-triangle that should be per-frame.

### Allocation

```
P8   the depth buffer — 60KB per render at 80×24. Assert it is allocated once per
     render and not per triangle
P9   sustained orbit — 300 frames at 30fps. Heap at frame 1 against frame 300.
     Flat is the pass; growth is a retained buffer and a purity violation
P10  no module-level state — the grep C12 I11 already requires, as a row
```

**P9 is the one that catches a scratch buffer smuggled in as an optimisation**, which is the
tempting fix the design already refuses.

### Bytes to the terminal

```
P11  a static 3D render — bytes written once
P12  an orbit frame — bytes written per frame. EXPECTED to be the full plot area;
     the row exists so the number is known rather than assumed
P13  the same at colourDepth 1 — no SGR, so the floor
P14  with synchronisedUpdate absent — assert the frame rate is capped
```

**P12 is not a regression test, it is a measurement.** The design already says the diff saves
nothing during an orbit; **the row records what that costs in bytes** so a future change that
makes it worse is visible.

### Scaling, per axis

```
P15  width      40 · 80 · 120 · 200 columns at a fixed mesh
P16  mesh       100 · 1,000 · 10,000 · 69,451 triangles at a fixed width
P17  height     8 · 24 · 48 rows
```

**Width and height scale the dot grid quadratically; mesh size scales the geometry
linearly.** If the measured curves disagree with that, the loop structure is wrong and the
row says which one.

### The comparison rows

```
P18  a 3D scatter against the 2D scatter, same point count — the cost of the
     third dimension, stated as a multiple
P19  a surface against a heatmap of the same grid — the cost of shading over
     colouring
```

**These are the rows that answer *is 3D worth it* in numbers rather than in argument.** If a
3D scatter is 40× a 2D one, that is a finding about the design; if it is 3×, it is fine and
nobody needs to wonder.

### Degradation under budget

```
P20  a mesh that exceeds 33 ms — assert the frame rate drops and the RESOLUTION
     does not. The design's ruling, as a test rather than as prose
P21  the cap is announced, not silent — a reader who is getting 10fps should be
     able to find out why
```

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
