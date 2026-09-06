/**
 * GM1–GM9 — the geometry suite (C12 I96, §6j).
 *
 * **Seven shapes, and every row is about the fixture as much as the renderer.**
 * The design note's §7 names the shapes and says what each one catches; C12 §6j
 * is the walk run before these fixtures existed, and six of the note's clauses
 * did not survive being measured on the shape they name. Two of the six are
 * findings — F473's uncullable faces and F474's symmetric camera — and the rest
 * are the reason each row below asserts what it does rather than what the note
 * asked for.
 *
 * **The reference camera is off `azimuth: π/4`** (C12 I96). That is the plane in
 * which the horizontal axes exchange: a view-space light gives two of a cube's
 * three visible faces identical intensity there, and a mesh and its own `x`/`y`
 * transpose ink the same number of cells while drawing different frames. Every
 * row that must use `π/4` compares the frame, never a count.
 */
import { describe, expect, it } from "vitest";

import { basisOf, extentOf, project } from "../../src/presentation/plot/project3.js";
import {
  backfaceCulled,
  surfacePoints,
  trianglesOf,
  type Tri3,
} from "../../src/presentation/plot/surface3.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, groundRgb, stripSgr } from "../../tools/plot-catalogue.mjs";
import { parseLine } from "../../tools/catalogue-png.mjs";

const CAP = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const capsFor = (name: string): Record<string, unknown> =>
  CAP.find((c) => c.name === name)?.caps ?? {};
const frame = frameFor as (s: unknown, c: unknown, w: number, id?: string) => readonly string[];
const strip = stripSgr as (s: string) => string;
const runsOf = parseLine as (l: string) => readonly { text: string; colour: string | null }[];

const WIDTH = 50;

const inked = (rows: readonly string[]): number =>
  rows.map((r) => strip(r)).join("").replace(/\s/gu, "").length; // cells-ok — a cell count
const rowsTouched = (rows: readonly string[]): number =>
  rows.filter((l) => strip(l).trim() !== "").length; // cells-ok — a row count
const colsTouched = (rows: readonly string[]): number => {
  const cols = new Set<number>(); // cells-ok — a column index set
  for (const l of rows) [...strip(l)].forEach((c, i) => void (c === " " ? null : cols.add(i)));
  return cols.size;
};
const text = (rows: readonly string[]): string => rows.map(strip).join("\n");

const rgbOf = (c: string | null): readonly [number, number, number] | null => {
  const m = /rgb\((\d+),(\d+),(\d+)\)/u.exec(c ?? "");
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
};

/**
 * **The plot's ground is a foreground now, and it is not a colour** (F501).
 *
 * Unicode's block elements fill from the bottom, so a cell whose covered mass
 * sits at the *top* is drawn as its complement with the two colours exchanged —
 * and the exchange needs an ink for the empty part, or the terminal paints it in
 * the default foreground. The ground therefore appears as a run colour while
 * painting exactly what was already behind it, so a reader cannot see it and a
 * count of colours must not either.
 *
 * Every row below that counts colours is asking about the **data's**, and the
 * two that broke were reading a third face on a two-faced cube and a third hue
 * on a one-hue field. **Resolved from the theme rather than written down**, so
 * a palette change moves the frames and this together; on a rung with no RGB,
 * `rgbOf` is `null` and nothing is filtered.
 */
const GROUND = groundRgb(capsFor("24bit")) as readonly [number, number, number] | null;
const isGround = (c: string | null): boolean => {
  const v = rgbOf(c);
  return v !== null && GROUND !== null
    && v[0] === GROUND[0] && v[1] === GROUND[1] && v[2] === GROUND[2];
};

/** Every distinct colour over the inked cells, the ground aside. */
const colours = (rows: readonly string[]): readonly string[] => {
  const set = new Set<string>();
  for (const line of rows)
    for (const run of runsOf(line))
      for (const ch of [...run.text]) if (ch !== " " && !isGround(run.colour)) set.add(run.colour ?? "none");
  return [...set];
};
const lumOf = (c: string | null): number => {
  const v = rgbOf(c);
  return v === null ? -1 : 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};

/**
 * The luminances present, grouped by a gap of a tenth of their own range.
 *
 * **A count of distinct colours cannot answer *how many intensities*** — the
 * specular term reads the view direction per sample, so a flat-shaded face
 * carries a spread rather than a value (§6j row 3). Clusters can.
 */
const clusters = (rows: readonly string[]): readonly number[] => {
  const ls: number[] = [];
  for (const line of rows)
    for (const run of runsOf(line))
      for (const ch of [...run.text]) if (ch !== " " && !isGround(run.colour)) ls.push(lumOf(run.colour));
  ls.sort((a, b) => a - b);
  const span = (ls[ls.length - 1] ?? 0) - (ls[0] ?? 0);
  const out: number[][] = [];
  for (const v of ls) {
    const last = out[out.length - 1];
    if (last === undefined || v - (last[last.length - 1] ?? 0) > span * 0.1) out.push([v]);
    else last.push(v);
  }
  return out.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
};

/** Blank cells lying *between* inked ones on their own row. */
const holes = (rows: readonly string[]): number => {
  let n = 0; // cells-ok — a cell count
  for (const line of rows) {
    const t = strip(line);
    const first = t.search(/\S/u);
    if (first < 0) continue;
    const last = t.replace(/\s+$/u, "").length - 1; // cells-ok — a column index
    for (let i = first; i <= last; i += 1) if (t[i] === " ") n += 1; // cells-ok — a cell count
  }
  return n;
};

const bare = (over: Record<string, unknown>): Record<string, unknown> => ({
  form: "plot3d",
  height: 14,
  series: [],
  axes3: false,
  box3: "none",
  colormap: "viridis",
  ...over,
});

type Mesh = {
  vertices: { x: number; y: number; z: number; value?: number }[];
  faces: [number, number, number][];
};

/** Two triangles per cell of an `(n+1) × (m+1)` grid of vertices. */
function quadFaces(n: number, m: number): [number, number, number][] {
  const faces: [number, number, number][] = [];
  const at = (i: number, j: number): number => j * (n + 1) + i; // cells-ok — a grid offset
  for (let j = 0; j < m; j += 1) // cells-ok — a row index
    for (let i = 0; i < n; i += 1) { // cells-ok — a column index
      faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)]);
      faces.push([at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
    }
  return faces;
}

/** A grid of quads on one of the three coordinate planes. */
function axisPlane(axis: "x" | "y" | "z", n: number): Mesh {
  const vertices: Mesh["vertices"] = [];
  for (let j = 0; j <= n; j += 1) // cells-ok — a grid index
    for (let i = 0; i <= n; i += 1) { // cells-ok — a grid index
      const u = i / n; // cells-ok — a grid index
      const v = j / n; // cells-ok — a grid index
      vertices.push(
        axis === "x" ? { x: 0, y: u, z: v } : axis === "y" ? { x: u, y: 0, z: v } : { x: u, y: v, z: 0 },
      );
    }
  return { vertices, faces: quadFaces(n, n) };
}

/** A unit cube centred on the origin, wound outward, two triangles a face. */
function cube(): Mesh {
  const v: Mesh["vertices"] = [];
  for (const z of [-1, 1]) for (const y of [-1, 1]) for (const x of [-1, 1]) v.push({ x, y, z });
  const quads: readonly [number, number, number, number][] = [
    [0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5],
  ];
  const faces: [number, number, number][] = [];
  for (const [a, b, c, d] of quads) {
    faces.push([a, b, c]);
    faces.push([a, c, d]);
  }
  return { vertices: v, faces };
}

/** A UV sphere: rings of longitude by bands of latitude, degenerate at the poles. */
function sphere(rings: number, bands: number): Mesh {
  const vertices: Mesh["vertices"] = [];
  for (let j = 0; j <= bands; j += 1) { // cells-ok — a band index
    const phi = (j / bands) * Math.PI; // cells-ok — a band index
    for (let i = 0; i <= rings; i += 1) { // cells-ok — a ring index
      const th = (i / rings) * 2 * Math.PI; // cells-ok — a ring index
      vertices.push({
        x: Math.sin(phi) * Math.cos(th),
        y: Math.sin(phi) * Math.sin(th),
        z: Math.cos(phi),
        value: j / bands, // cells-ok — a band index
      });
    }
  }
  return { vertices, faces: quadFaces(rings, bands) };
}

/** `z = f(x, y)` sampled on an `n × n` grid over `[-2, 2]²`. */
const gridOf = (n: number, f: (x: number, y: number) => number): number[][] =>
  Array.from({ length: n }, (_, j) => // cells-ok — a grid index
    Array.from({ length: n }, (_, i) => // cells-ok — a grid index
      f(-2 + (4 * i) / (n - 1), -2 + (4 * j) / (n - 1)), // cells-ok — a grid index
    ),
  );

const field3 = (heights: number[][]): Record<string, unknown> => ({
  heights,
  xRange: [-2, 2],
  yRange: [-2, 2],
});

/**
 * The reference camera — **off the symmetry plane, and that is C12 I96's first
 * half** (F474). `π/4` is where `x` and `y` exchange.
 */
const REF = { azimuth: 0.5, elevation: Math.PI / 6, distance: 6 } as const;
/** The symmetric camera, used only by the rows that are about it. */
const SYM = { azimuth: Math.PI / 4, elevation: Math.PI / 6, distance: 6 } as const;

const tris = (s: Record<string, unknown>): readonly Tri3[] => {
  const surf = s as unknown as Parameters<typeof trianglesOf>[0];
  return trianglesOf(surf, extentOf(surfacePoints(surf)), 0);
};
const zeroNormal = (t: Tri3): boolean => Math.hypot(t.fn.x, t.fn.y, t.fn.z) < 1e-12;
const kept = (s: Record<string, unknown>, camera: Record<string, number>): number => {
  const basis = basisOf(camera as never, WIDTH / 28);
  let n = 0; // cells-ok — a face count
  for (const t of tris(s)) if (!backfaceCulled(t, basis)) n += 1; // cells-ok — a face count
  return n;
};

describe("plot — the geometry suite", () => {
  it("GM1 (C12 I96, I94, §6j row 1): each coordinate plane keeps its own normal", () => {
    // **F456 measured `x = 0`; the row is the three together.** A quad's
    // diagonal runs one way, so a rule that held for `x` could fail for `y` —
    // and the normals are the thing `unitOf` is most likely to take.
    const expected: Record<string, readonly [number, number, number]> = {
      x: [1, 0, 0],
      y: [0, -1, 0],
      z: [0, 0, 1],
    };
    for (const axis of ["x", "y", "z"] as const) {
      const ts = tris(axisPlane(axis, 6) as unknown as Record<string, unknown>);
      expect(ts.length, `${axis}=0 face count`).toBe(72);
      expect(ts.filter(zeroNormal).length, `${axis}=0 has no zero normal`).toBe(0);
      const [ex, ey, ez] = expected[axis] as readonly [number, number, number];
      const n = ts[0]?.fn as { x: number; y: number; z: number };
      const len = Math.hypot(n.x, n.y, n.z);
      expect(n.x / len, `${axis}=0 normal x`).toBeCloseTo(ex, 6);
      expect(n.y / len, `${axis}=0 normal y`).toBeCloseTo(ey, 6);
      expect(n.z / len, `${axis}=0 normal z`).toBeCloseTo(ez, 6);
    }
  });

  it("GM2 (C12 I96, I94, §6j row 2): edge-on draws a line, and the row asserts its direction", () => {
    // **Direction, because *not blank* passes on all three with the axes
    // transposed.** Every face projects to zero area in each case, so what is
    // left is F456's stroke and the only thing distinguishing the planes is
    // which way the line runs.
    const cams = {
      x: { azimuth: Math.PI / 2, elevation: 0, distance: 6 },
      y: { azimuth: 0, elevation: 0, distance: 6 },
      z: { azimuth: 0.9, elevation: 0, distance: 6 },
    } as const;
    for (const axis of ["x", "y", "z"] as const) {
      const m = axisPlane(axis, 6);
      const basis = basisOf(cams[axis] as never, WIDTH / 28);
      let flat = 0; // cells-ok — a face count
      for (const t of tris(m as unknown as Record<string, unknown>)) {
        const p = [t.a.p, t.b.p, t.c.p].map((v) => project(basis, v));
        if (!p.every((q) => q !== null)) continue;
        const [A, B, C] = p as unknown as readonly [
          { x: number; y: number },
          { x: number; y: number },
          { x: number; y: number },
        ];
        const area = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
        if (area < 1e-12) flat += 1; // cells-ok — a face count
      }
      expect(flat, `${axis}=0 projects flat`).toBe(72);

      const f = frame(bare({ surfaces3: [m], camera: cams[axis] }), capsFor("24bit"), WIDTH, "gm2");
      expect(inked(f), `${axis}=0 is drawn rather than dropped`).toBeGreaterThan(0);
      if (axis === "z") {
        expect(colsTouched(f), "z=0 runs across").toBeGreaterThan(rowsTouched(f) * 4);
      } else {
        expect(rowsTouched(f), `${axis}=0 runs up`).toBeGreaterThan(colsTouched(f) * 4);
      }
    }
  });

  it("GM3 (C12 I96, C04 I79, §6j rows 3 and 6): the cube's faces, and the camera that hides one", () => {
    // **Both halves in one row, because they are two readings of one picture.**
    // The cluster count is the light and the face counts are the cull, and a
    // suite that saw only the first would report a shading defect at `π/4`.
    const c = { ...cube(), closed: true, shading: "flat" } as unknown as Record<string, unknown>;
    const shot = (camera: Record<string, number>): readonly string[] =>
      frame(bare({ surfaces3: [c], camera, colourBy: "series" }), capsFor("24bit"), WIDTH, "gm3");

    // A closed convex body shows one, two or three faces and never more.
    expect(kept(c, { azimuth: 0, elevation: 0, distance: 6 }), "face-on: one face").toBe(2);
    expect(kept(c, { azimuth: Math.PI / 4, elevation: 0, distance: 6 }), "edge-on: two").toBe(4);
    expect(kept(c, SYM), "corner: three").toBe(6);

    // **And *half* is the corner camera's coincidence**, which is what the three
    // figures together say and no one of them does.
    expect(kept(c, SYM) / 12, "half is one camera's answer").toBe(0.5);

    expect(clusters(shot(REF)).length, "three faces, three intensities").toBe(3);
    expect(clusters(shot(SYM)).length, "and two at the symmetry plane (F474)").toBe(2);
  });

  it("GM4 (C12 I96, I95, §6j rows 4 and 5): the visible fraction names its denominator", () => {
    // **F473.** `backfaceCulled` is a sign test on a dot product and a zero
    // normal fails both signs, so the sphere's polar degeneracies survive every
    // camera — and change no cell, which is why this is recorded rather than
    // repaired.
    const s = sphere(24, 12);
    const closed = { ...s, closed: true } as unknown as Record<string, unknown>;
    const all = tris(closed);
    const degenerate = all.filter(zeroNormal).length;
    expect(all.length, "faces").toBe(576);
    expect(degenerate, "degenerate at the poles").toBe(42);

    const far = { azimuth: 0.5, elevation: Math.PI / 6, distance: 100 };
    const basis = basisOf(far as never, WIDTH / 28);
    const survivingDegenerate = all.filter((t) => zeroNormal(t) && !backfaceCulled(t, basis)).length;
    expect(survivingDegenerate, "none of them can be culled").toBe(degenerate);

    // **Over the faces the cull can decide** — which is the note's *half*.
    const decidable = all.length - degenerate;
    const keptDecidable = kept(closed, far) - degenerate;
    expect(keptDecidable / decidable, "about half, over the decidable faces").toBeGreaterThan(0.47);
    expect(keptDecidable / decidable, "and not over half").toBeLessThan(0.51);
    // And the raw figure, which is the one that reads as a defect and is not.
    expect(kept(closed, far) / all.length, "the raw figure exceeds half").toBeGreaterThan(0.5);

    // **The consequence is arithmetic and not visual**, and this is the half a
    // reader would otherwise go looking for in the frame.
    const pruned = { ...s, faces: s.faces.filter((_, k) => !zeroNormal(all[k] as Tri3)), closed: true };
    const shot = (surface: unknown, camera: Record<string, number>): readonly string[] =>
      frame(bare({ surfaces3: [surface], camera }), capsFor("24bit"), WIDTH, "gm4");
    for (const camera of [REF, { azimuth: 0, elevation: Math.PI / 2 - 0.01, distance: 6 }]) {
      const withThem = shot(closed, camera);
      expect(inked(withThem), "the sphere draws").toBeGreaterThan(0);
      expect(text(withThem), "and the 42 change no cell").toBe(text(shot(pruned, camera)));
    }
  });

  it("GM5 (C12 I96, §6j row 7): the tilted plane's slope is chosen against the camera", () => {
    // **The general case chosen carelessly is the degenerate one.** `unitOf`
    // normalises each axis independently, so a gentle slope over a small height
    // range comes back steep — and this one lies nearly along the view
    // direction at the corner camera.
    const flat = field3(gridOf(17, () => 0));
    const tilted = field3(gridOf(17, (x, y) => 0.3 * x + 0.15 * y));
    const at = (s: Record<string, unknown>, camera: Record<string, number>): number =>
      inked(frame(bare({ surfaces3: [s], camera }), capsFor("24bit"), WIDTH, "gm5"));

    const edgeish = at(tilted, SYM);
    const control = at(flat, SYM);
    expect(edgeish, "the same plane tilted inks a fraction of the flat one").toBeLessThan(control / 2);

    // **And it fills from a camera chosen for it**, which is the half that says
    // the first number is about the camera rather than about the tilt.
    const chosen = { azimuth: 0.5 + Math.PI / 2, elevation: Math.PI / 3, distance: 6 };
    expect(at(tilted, chosen), "from a camera not along it, the plane fills").toBeGreaterThan(control);
  });

  it("GM6 (C12 I96, I94, §6j row 8): a constant field is one hue at many luminances", () => {
    // **Both directions, because each alone names a different failure.** One
    // colour says the shading is gone; many *hues* say the field is being read
    // where it should not be.
    const h = gridOf(17, (x, y) => Math.exp(-(x * x + y * y)));
    const shot = (field: number[][]): readonly string[] =>
      frame(
        bare({ surfaces3: [{ ...field3(h), field }], camera: REF, colourBy: "value" }),
        capsFor("24bit"),
        WIDTH,
        "gm6",
      );

    const flatField = shot(gridOf(17, () => 1));
    expect(colours(flatField).length, "shading still varies the frame").toBeGreaterThan(4);
    const hues = new Set(
      colours(flatField)
        .map(rgbOf)
        .filter((v): v is readonly [number, number, number] => v !== null)
        .map(([r, g, b]) => {
          const m = Math.max(r, g, b);
          return m === 0 ? "0" : `${(r / m).toFixed(1)},${(g / m).toFixed(1)},${(b / m).toFixed(1)}`;
        }),
    );
    expect(hues.size, "and every one of them is the same hue").toBeLessThanOrEqual(2);

    // The control: a field that does vary carries more than one hue.
    const ramp = shot(gridOf(17, (x) => x));
    const rampHues = new Set(
      colours(ramp)
        .map(rgbOf)
        .filter((v): v is readonly [number, number, number] => v !== null)
        .map(([r, g, b]) => {
          const m = Math.max(r, g, b);
          return m === 0 ? "0" : `${(r / m).toFixed(1)},${(g / m).toFixed(1)},${(b / m).toFixed(1)}`;
        }),
    );
    expect(rampHues.size, "and a varying field does not").toBeGreaterThan(hues.size);
  });

  it("GM7 (C12 I96, §6j row 9): banding is the colourDepth, and ascii is two rungs at once", () => {
    // **On the dot grid the suspect was the Bayer matrix; on this rung there is
    // no matrix.** So a band is the quantisation, and the row reads the
    // capability it ran at rather than asserting one number.
    const saddle = field3(gridOf(17, (x, y) => x * x - y * y));
    const at = (cap: string): readonly string[] =>
      frame(bare({ surfaces3: [saddle], camera: REF }), capsFor(cap), WIDTH, "gm7");

    const deep = colours(at("24bit")).length;
    const eight = colours(at("8bit")).length;
    expect(deep, "24-bit carries the shading whole").toBeGreaterThan(50);
    expect(eight, "8-bit bands it").toBeLessThan(deep / 4);
    expect(eight, "and still varies").toBeGreaterThan(4);
    expect(colours(at("ascii")).length, "ascii has no colour").toBe(1);
    expect(colours(at("1bit")).length, "nor does 1bit").toBe(1);

    // **Two rungs at once**: `ascii` and `1bit` agree on colour and differ from
    // the others in glyph, so a row naming *the ASCII arm* for a colour claim
    // is naming the wrong axis.
    expect(inked(at("ascii")), "and the glyph arm inks differently").not.toBe(inked(at("24bit")));
  });

  it("GM8 (C12 I96, §6j row 10): interior holes are the silhouette, and the zeros say so", () => {
    // **The control is not optional.** A crack between triangles scales with
    // the triangle count; a silhouette does not. Without the flat plane's and
    // the Gaussian's zeros the saddle's holes read as a rasteriser defect.
    const at = (f: (x: number, y: number) => number, n: number): number =>
      holes(frame(bare({ surfaces3: [field3(gridOf(n, f))], camera: REF }), capsFor("24bit"), WIDTH, "gm8"));

    for (const n of [9, 17, 33, 65]) {
      expect(at(() => 0, n), `flat plane at n=${String(n)}`).toBe(0);
      expect(at((x, y) => Math.exp(-(x * x + y * y)), n), `gaussian at n=${String(n)}`).toBe(0);
    }
    // **And the two that do have them do not scale with the triangle count**,
    // which is the whole discriminator: from `n = 9` to `n = 65` the mesh grows
    // 64-fold and the hole counts fall. A crack would go the other way.
    const saddle = [9, 17, 33, 65].map((n) => at((x, y) => x * x - y * y, n));
    const egg = [9, 17, 33, 65].map((n) => at((x, y) => Math.sin(x) * Math.cos(y), n));
    expect(saddle, "the saddle's holes are the same at every resolution").toEqual([4, 4, 4, 4]);
    expect(egg[0], "the egg-carton has them at the coarsest grid").toBeGreaterThan(0);
    expect(egg[3] as number, "and no more at 64x the faces").toBeLessThanOrEqual(egg[0] as number);
  });

  it("GM9 (C12 I96, §6j row 1, C04 I79): the egg-carton and the Gaussian, against each other", () => {
    // **The pair is the assertion.** A renderer drawing either as a single
    // mound satisfies every scalar both of them carry — an inked count, a
    // colour range, a terminator. What separates them is the *silhouette*: the
    // egg-carton dips between its crests and the Gaussian does not, which is
    // the note's own criterion of *verifiable by eye* made into a number.
    const dips = (f: (x: number, y: number) => number): number => {
      const rows = frame(
        bare({ surfaces3: [field3(gridOf(33, f))], camera: { azimuth: 0.5, elevation: 0.25, distance: 6 } }),
        capsFor("24bit"),
        WIDTH,
        "gm9",
      );
      const lines = rows.map(strip);
      const cols = Math.max(...lines.map((l) => l.length)); // cells-ok — a column count
      // The topmost inked row of each column: the silhouette, as a profile.
      const top: number[] = [];
      for (let c = 0; c < cols; c += 1) { // cells-ok — a column index
        let seen = -1; // cells-ok — a row index
        for (let r = 0; r < lines.length; r += 1) { // cells-ok — a row index
          const ch = (lines[r] ?? "")[c];
          if (ch !== undefined && ch !== " ") { seen = r; break; }
        }
        if (seen >= 0) top.push(seen);
      }
      // Runs of equal height collapsed, then the interior local *maxima* — a
      // larger row index is lower on screen, so a maximum is a dip.
      const run: number[] = [];
      for (const v of top) if (v !== run[run.length - 1]) run.push(v);
      let n = 0; // cells-ok — a dip count
      for (let i = 1; i < run.length - 1; i += 1) // cells-ok — a profile index
        if ((run[i] as number) > (run[i - 1] as number) && (run[i] as number) > (run[i + 1] as number)) n += 1; // cells-ok — a dip count
      return n;
    };

    expect(dips((x, y) => Math.exp(-(x * x + y * y))), "one mound, no dip").toBe(0);
    expect(dips((x, y) => Math.sin(x) * Math.cos(y)), "and the egg-carton dips").toBeGreaterThan(0);
  });
});
