/**
 * SF1–SF8, WF1–WF9 and T2.4h/T3.57–T3.60 — the surface carrier and its cull
 * (C12 I94, C12 I95, C04 I79, C04 I80, §6h, §6i).
 *
 * **The rows are indexed by §6h's table**, and the two the design note said to
 * write first are SF1 and SF2 — which are the *same* case in the note and two
 * different cases in fact (F456). An edge-on plane keeps its normals and loses
 * its projected area; a zero-width range loses its normals through `unitOf` and
 * keeps everything else. One is answered by stroking and the other by ambient,
 * and a suite that tested the note's version would have tested neither.
 */
import { describe, expect, it } from "vitest";

import { validateBlock } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import {
  basisOf, createDepth, extentOf, project, viewDir, type Vec3,
} from "../../src/presentation/plot/project3.js";
import {
  backfaceCulled, densityGlyph, drawTri, edgeIntensity, lightDirOf, shade,
  surfacePoints, trianglesOf, type Tri3,
} from "../../src/presentation/plot/surface3.js";
import { ladderFor } from "../../src/presentation/plot/ramp.js";
import { COLORMAPS, continuousColour, shadeColour } from "../../src/presentation/theme/colormap.js";
import { defaultTheme, loadTheme } from "../../src/presentation/theme/index.js";
import { slot } from "../../src/presentation/blocks/paint.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";
import { parseLine } from "../../tools/catalogue-png.mjs";

const CAP = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const capsFor = (name: string): Record<string, unknown> =>
  CAP.find((c) => c.name === name)?.caps ?? {};
const frame = frameFor as (s: unknown, c: unknown, w: number, id?: string) => readonly string[];
const strip = stripSgr as (s: string) => string;
const runsOf = parseLine as (l: string) => readonly { text: string; colour: string | null }[];

const errorsOf = (blk: unknown): readonly string[] => {
  const v = validateBlock(blk) as { ok: boolean; error?: readonly string[] };
  return v.ok ? [] : (v.error ?? []);
};

const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error("theme");
const theme = loaded.value.current;

const rgb = (v: unknown): string => {
  const hex = (v as { hex?: string } | undefined)?.hex ?? "";
  const n = Number.parseInt(hex.replace("#", ""), 16);
  // eslint-disable-next-line no-bitwise
  return `rgb(${String((n >> 16) & 255)},${String((n >> 8) & 255)},${String(n & 255)})`;
};
const slotRgb = (ref: string): string => rgb(slot(ref as never, theme, capsFor("24bit") as never).colour);

/** Every inked cell of a frame, with its colour. */
const cellsOf = (rows: readonly string[]): { text: string; colour: string | null }[] => {
  const out: { text: string; colour: string | null }[] = [];
  for (const line of rows) {
    for (const run of runsOf(line)) for (const ch of [...run.text]) out.push({ text: ch, colour: run.colour });
  }
  return out.filter((c) => c.text !== " ");
};

/** A parsed `rgb(...)` run's relative luminance, or `-1` for no colour. */
const lumOf = (c: string | null): number => {
  const m = /rgb\((\d+),(\d+),(\d+)\)/u.exec(c ?? "");
  return m === null ? -1 : 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]);
};

/**
 * How much brighter the frame is up-and-right of its own centre than
 * down-and-left — **the studio light's direction, read off the picture**.
 *
 * The one statistic that says the shading is *right* rather than merely varied.
 * Everything else about a shaded sphere — a range of colours, a terminator, an
 * ambient floor — is satisfied by a normal in the wrong space.
 */
const litRatio = (rows: readonly string[]): number => {
  const cells: { r: number; c: number; l: number }[] = [];
  rows.forEach((line, r) => {
    let c = 0; // cells-ok — a column index
    for (const run of runsOf(line)) {
      for (const ch of [...run.text]) {
        if (ch !== " ") cells.push({ r, c, l: lumOf(run.colour) });
        c += 1; // cells-ok — a column index
      }
    }
  });
  if (cells.length === 0) return 0; // cells-ok — a cell count
  const cr = cells.reduce((a, x) => a + x.r, 0) / cells.length; // cells-ok — a cell count
  const cc = cells.reduce((a, x) => a + x.c, 0) / cells.length; // cells-ok — a cell count
  const mean = (f: (x: { r: number; c: number }) => boolean): number => {
    const set = cells.filter(f);
    return set.length === 0 ? 0 : set.reduce((a, x) => a + x.l, 0) / set.length; // cells-ok — a cell count
  };
  const lo = mean((x) => x.r > cr && x.c < cc);
  return lo === 0 ? 0 : mean((x) => x.r < cr && x.c > cc) / lo;
};

const inked = (rows: readonly string[]): number =>
  rows.map((r) => strip(r)).join("").replace(/\s/gu, "").length; // cells-ok — a cell count

/** No reference frame, so a row about the data says which picture it means. */
const bare = (over: Record<string, unknown>): Record<string, unknown> => ({
  form: "scatter3d", height: 12, series: [], axes3: false, box3: "none", colormap: "viridis", ...over,
});

type Mesh = {
  vertices: { x: number; y: number; z: number; value?: number }[];
  faces: [number, number, number][];
};

/** A grid of quads on the plane `x = 0`, spanning `y` and `z`. */
function planeX0(n: number): Mesh {
  const vertices: Mesh["vertices"] = [];
  for (let j = 0; j <= n; j += 1) { // cells-ok — a grid index
    for (let i = 0; i <= n; i += 1) vertices.push({ x: 0, y: i / n, z: j / n }); // cells-ok — a grid index
  }
  return { vertices, faces: quadFaces(n, n) };
}

/** A UV sphere: rings of longitude by bands of latitude, `value` its latitude. */
function sphere(rings: number, bands: number): Mesh {
  const vertices: Mesh["vertices"] = [];
  for (let j = 0; j <= bands; j += 1) { // cells-ok — a band index
    const phi = (j / bands) * Math.PI;
    for (let i = 0; i <= rings; i += 1) { // cells-ok — a ring index
      const th = (i / rings) * 2 * Math.PI;
      vertices.push({
        x: Math.sin(phi) * Math.cos(th), y: Math.sin(phi) * Math.sin(th),
        z: Math.cos(phi), value: j / bands,
      });
    }
  }
  return { vertices, faces: quadFaces(rings, bands) };
}

/** Two triangles per cell of an `(n+1) × (m+1)` grid of vertices. */
function quadFaces(n: number, m: number): [number, number, number][] {
  const faces: [number, number, number][] = [];
  const at = (i: number, j: number): number => j * (n + 1) + i; // cells-ok — a grid offset
  for (let j = 0; j < m; j += 1) { // cells-ok — a row index
    for (let i = 0; i < n; i += 1) { // cells-ok — a column index
      faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)]);
      faces.push([at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
    }
  }
  return faces;
}

/**
 * A grid with **unevenly spaced columns**, so adjacent faces differ in area.
 *
 * A UV sphere's faces are near-equal away from the poles, so area-weighted and
 * unit-averaged normals agree there to within a degree or two and the mutation
 * that swaps them survives. Graded, the two schemes differ by up to 49°.
 */
function graded(n: number, power: number): Mesh {
  const vertices: Mesh["vertices"] = [];
  for (let j = 0; j <= n; j += 1) { // cells-ok — a row index
    for (let i = 0; i <= n; i += 1) { // cells-ok — a column index
      const u = (i / n) ** power; // cells-ok — a column index
      vertices.push({ x: u * 2 - 1, y: (j / n) * 2 - 1, z: Math.sin(u * 6) * 0.5 }); // cells-ok — a row index
    }
  }
  return { vertices, faces: quadFaces(n, n) };
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x,
});
const norm3 = (a: Vec3): Vec3 => {
  const n = Math.hypot(a.x, a.y, a.z);
  return n === 0 ? a : { x: a.x / n, y: a.y / n, z: a.z / n };
};

/**
 * The raw sample mask of one surface — **edge samples against interior ones**,
 * read off `drawTri` rather than off a frame.
 *
 * The half-block arm folds two samples into a cell and keeps one colour, so a
 * frame cannot say how many samples were edges. This is the quantity §6i row 9
 * is about, and 150 × 90 is wide enough for a cell to have an interior at all —
 * at 62 × 14 a 9 × 9 grid leaves **1%**, and the wireframe is the surface.
 */
const maskOf = (s: unknown): { edge: number; fill: number } => {
  const grid = { width: 150, height: 90 };
  const basis = basisOf({}, grid.width / grid.height);
  const surf = s as Parameters<typeof trianglesOf>[0];
  const tris = trianglesOf(surf, extentOf(surfacePoints(surf)), 0);
  const depth = createDepth(grid.width, grid.height);
  const kind = new Int8Array(grid.width * grid.height).fill(-1); // cells-ok — a sample count
  for (const t of tris) {
    drawTri(t, basis, grid, depth, lightDirOf(undefined, basis), { nearD: 4, farD: 8 }, (i, sm) => {
      kind[i] = sm.edge ? 1 : 0;
    });
  }
  let edge = 0;
  let fill = 0;
  for (const k of kind) { // cells-ok — a sample count
    if (k === 1) edge += 1; // cells-ok — a sample count
    if (k === 0) fill += 1; // cells-ok — a sample count
  }
  return { edge, fill };
};

const gaussian = (n: number): number[][] =>
  Array.from({ length: n }, (_, j) => Array.from({ length: n }, (_, i) => { // cells-ok — a grid index
    const x = (i / (n - 1)) * 4 - 2; // cells-ok — a grid index
    const y = (j / (n - 1)) * 4 - 2; // cells-ok — a grid index
    return Math.exp(-(x * x + y * y));
  }));

describe("plot — the surface carrier", () => {
  it("T2.4h (C04 I79): `surfaces3` and `light3` are refused off the form, and a surface alone is accepted", () => {
    const sf = [{ heights: [[0, 1], [1, 0]], xRange: [0, 1], yRange: [0, 1] }];
    for (const [bad, message] of [
      [{ form: "scatter", height: 4, series: [], surfaces3: sf }, /"surfaces3" on form "scatter"/u],
      [{ form: "line", height: 4, series: [{ values: [1, 2] }], light3: "studio" }, /"light3" on form "line"/u],
    ] as const) {
      expect(errorsOf({ kind: "plot", id: "s", ...bad }).join(" ")).toMatch(message);
      expect(() => b.plot(bad as never)).toThrow(message);
    }
    // **The accept half is the row** (C12 §6h row 13, §6g row 2's third
    // instance). A loss landscape has no cloud and no path, and the gate that
    // reads a widened pair of names rather than the carrier *set* refuses it.
    for (const good of [
      { form: "scatter3d", height: 4, series: [], surfaces3: sf },
      { form: "scatter3d", height: 4, series: [], surfaces3: sf, light3: "headlight" },
    ]) {
      expect(errorsOf({ kind: "plot", id: "s", ...good }), JSON.stringify(good)).toEqual([]);
      expect(() => b.plot(good as never), JSON.stringify(good)).not.toThrow();
    }
    // And the set's own refusal names all three.
    expect(errorsOf({ kind: "plot", id: "s", form: "scatter3d", height: 4, series: [] }).join(" "))
      .toMatch(/has none of "points3", "lines3", "surfaces3"/u);
  });

  it("T3.57 (C04 I79): the arm refusals fire, and both arms alone are accepted", () => {
    const grid = { heights: [[0, 1], [1, 0]], xRange: [0, 1], yRange: [0, 1] };
    const mesh = { vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }], faces: [[0, 1, 2]] };
    const at = (s: unknown): string =>
      errorsOf({ kind: "plot", id: "s", form: "scatter3d", height: 4, series: [], surfaces3: [s] }).join(" ");
    expect(at({ ...grid, ...mesh })).toMatch(/has both "heights" and "vertices"/u);
    expect(at({ label: "empty" })).toMatch(/has neither "heights" nor "vertices"/u);
    expect(at({ vertices: mesh.vertices })).toMatch(/has "vertices" and no "faces"/u);
    expect(at({ ...grid, field: [[0, 1, 2], [1, 0, 1]] })).toMatch(/"field" whose shape is not/u);
    expect(at({ heights: [[0, 1]], xRange: [0, 1], yRange: [0, 1] })).toMatch(/1x2 "heights" grid/u);
    expect(at({ ...mesh, faces: [[0, 1, 9]] })).toMatch(/names vertex 9 of 3/u);
    // **The controls, and they are the half that says the rule is not *refuse
    // everything*** — one arm each, accepted.
    expect(at(grid)).toBe("");
    expect(at(mesh)).toBe("");
    expect(at({ ...grid, field: [[2, 3], [4, 5]] })).toBe("");
  });

  it("T3.58 (C04 I79): the `colourBy: \"value\"` walk reaches the third carrier", () => {
    const base = { kind: "plot", id: "s", form: "scatter3d", height: 4, series: [], colourBy: "value" };
    const grid = { heights: [[0, 1], [1, 0]], xRange: [0, 1], yRange: [0, 1] };
    // The controls first, or this row passes against a validator refusing the arm.
    expect(errorsOf({ ...base, surfaces3: [{ ...grid, field: [[1, 2], [3, 4]] }] })).toEqual([]);
    expect(errorsOf({ ...base, surfaces3: [{
      vertices: [{ x: 0, y: 0, z: 0, value: 1 }, { x: 1, y: 0, z: 0, value: 2 }, { x: 0, y: 1, z: 0, value: 3 }],
      faces: [[0, 1, 2]],
    }] })).toEqual([]);
    expect(errorsOf({ ...base, surfaces3: [{ ...grid, field: [[1, 2], [3, Number.NaN]] }] }).join(" "))
      .toMatch(/surfaces3\[0\]\.field\[1\]\[1\] is not finite/u);
    expect(errorsOf({ ...base, surfaces3: [{
      vertices: [{ x: 0, y: 0, z: 0, value: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0, value: 3 }],
      faces: [[0, 1, 2]],
    }] }).join(" ")).toMatch(/surfaces3\[0\]\.vertices\[1\] has no finite "value"/u);
    // The other two arms accept the same incomplete surface.
    for (const by of ["depth", "series"]) {
      expect(errorsOf({ ...base, colourBy: by, surfaces3: [{ ...grid, field: [[1, 2], [3, Number.NaN]] }] }), by)
        .toEqual([]);
    }
  });

  it("SF1 (C12 I94, F456): an edge-on plane draws a line, and its control fills", () => {
    const mesh = planeX0(6);
    const shot = (camera: Record<string, number>): number =>
      inked(frame(bare({ surfaces3: [mesh], camera }), capsFor("24bit"), 50, "sf1"));
    // **The camera is *in* the plane**, which is what edge-on means: azimuth
    // π/2 puts the eye on `+y` and `x = 0` contains the view direction.
    const edge = shot({ azimuth: Math.PI / 2, elevation: 0, distance: 6 });
    const oblique = shot({ azimuth: 0.9, elevation: 0.5, distance: 6 });
    // **The control must fill, and it is not optional**: an empty frame
    // satisfies *no `NaN` reached the raster* exactly as a correct one does, so
    // a row asserting only that the edge-on case did not crash asserts nothing.
    expect(oblique, "the plane fills from a camera not in it").toBeGreaterThan(edge * 3);
    // And the line is drawn rather than dropped — §6h row 4's whole content.
    // A barycentric fill writes nothing here: the projected area is exactly
    // zero, `1/area` is `−Infinity`, and every weight is `NaN`.
    expect(edge, "the edge-on plane keeps its line").toBeGreaterThan(0);
    // **A camera *nearly* in the plane, which is the half the exact case
    // cannot say.** At exactly edge-on a threshold of `area === 0` behaves
    // identically to one stated in samples, so the row as first written could
    // not tell the two apart — and the difference between them is a surface
    // that vanishes a hair before it goes edge-on and reappears as a line.
    const nearly = shot({ azimuth: Math.PI / 2 - 0.004, elevation: 0.002, distance: 6 });
    expect(nearly, "a plane a hair off edge-on still draws").toBeGreaterThan(0);
    expect(nearly, "and it is still a line rather than a fill").toBeLessThan(oblique / 2);
  });

  it("SF2 (C12 I94, F456): a zero-width range shades at ambient, and the degenerate is the projector's", () => {
    // **Constant along the axis that collapses, and that is the condition.**
    // A zero-width `xRange` alone is *not* enough — after the collapse the cross
    // product is `(−Δz_x · Δy, 0, 0)`, so a grid whose heights vary along `x`
    // keeps its normals. This row failed on its first run against a varying
    // grid, which is what narrowed the rule from the one first written (F456).
    const heights = [[0.2, 0.2, 0.2], [0.5, 0.5, 0.5], [0.9, 0.9, 0.9]];
    // **The normals are the assertion, because they are what the finding is
    // about.** In data space this mesh has perfectly good faces; `unitOf`
    // collapses `x` to the axis's centre and every face becomes collinear.
    const flat = trianglesOf(
      { heights, xRange: [0, 0], yRange: [0, 2] },
      { min: { x: 0, y: 0, z: 0.1 }, max: { x: 0, y: 2, z: 0.9 } },
      0,
    );
    const zero = flat.filter((t) => Math.hypot(t.a.n.x, t.a.n.y, t.a.n.z) === 0);
    expect(zero.length, "every face's normal is the zero vector").toBe(flat.length);
    // **The second control, and it is the one that narrowed the rule**: the same
    // collapsed axis with heights that vary along it keeps every normal.
    const varying = trianglesOf(
      { heights: [[0.2, 0.5, 0.9], [0.3, 0.7, 0.4], [0.1, 0.6, 0.8]], xRange: [0, 0], yRange: [0, 2] },
      { min: { x: 0, y: 0, z: 0.1 }, max: { x: 0, y: 2, z: 0.9 } },
      0,
    );
    expect(
      varying.filter((t) => Math.hypot(t.a.n.x, t.a.n.y, t.a.n.z) === 0).length,
      "a collapsed axis the surface varies along is not degenerate",
    ).toBe(0);
    // The control: the same heights over a real range keep their normals.
    const wide = trianglesOf(
      { heights, xRange: [0, 2], yRange: [0, 2] },
      { min: { x: 0, y: 0, z: 0.1 }, max: { x: 2, y: 2, z: 0.9 } },
      0,
    );
    expect(wide.every((t) => Math.hypot(t.a.n.x, t.a.n.y, t.a.n.z) > 0.5), "the control has normals").toBe(true);
    // **And it renders rather than throwing or vanishing** — I86 draws a
    // collapsed set rather than refusing it, and `unit` returns the zero vector
    // unchanged, so nothing divides by a normal's length. The picture is a line
    // at ambient, which is the truth about a surface with no width.
    const rows = frame(bare({ surfaces3: [{ heights, xRange: [0, 0], yRange: [0, 2] }] }), capsFor("24bit"), 50, "sf2");
    expect(inked(rows), "a collapsed surface still draws").toBeGreaterThan(0);
  });

  it("SF3 (C12 I94): flat and smooth differ on a sphere and agree on a planar quad", () => {
    const ball = sphere(10, 8);
    const shades = (s: Record<string, unknown>): Set<string> => {
      const rows = frame(bare({ surfaces3: [s], height: 14 }), capsFor("24bit"), 50, "sf3");
      return new Set(cellsOf(rows).map((c) => c.colour ?? ""));
    };
    const smooth = shades({ ...ball, shading: "smooth" });
    const faceted = shades({ ...ball, shading: "flat" });
    // **Smooth interpolates the normal per sample**, so a meridian passes
    // through more distinct colours than a faceted sphere, whose triangles are
    // each one intensity.
    expect(smooth.size, "smooth carries more distinct shades").toBeGreaterThan(faceted.size);
    // **The control is a single planar quad**, where the two face normals are
    // identical, so the vertex normals average to them and the two arms must
    // agree exactly. A difference on every input is a difference that says
    // nothing about shading.
    const quad: Mesh = {
      vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0.3 }, { x: 1, y: 1, z: 0.3 }, { x: 0, y: 1, z: 0 }],
      faces: [[0, 1, 2], [0, 2, 3]],
    };
    expect([...shades({ ...quad, shading: "smooth" })].sort())
      .toEqual([...shades({ ...quad, shading: "flat" })].sort());
    // **Area-weighted rather than unit-averaged** (§6h row 6), asserted against
    // the **rejected alternative** rather than between two fixtures. The first
    // version compared a graded grid's shading to an even grid's, which differs
    // under both schemes — so the mutation swapping them survived a row that
    // cited the ruling. Restating the alternative here is the point: the claim
    // is that the shipped normals are *not* it.
    const unitAverage = (mesh: Mesh): Vec3[] => {
      const e = extentOf(surfacePoints(mesh as never));
      const ax = (v: number, lo: number, hi: number): number =>
        hi === lo ? 0 : ((v - lo) / (hi - lo)) * 2 - 1;
      const pts = surfacePoints(mesh as never).map((p) => ({
        x: ax(p.x, e.min.x, e.max.x), y: ax(p.y, e.min.y, e.max.y), z: ax(p.z, e.min.z, e.max.z),
      }));
      const acc: Vec3[] = pts.map(() => ({ x: 0, y: 0, z: 0 }));
      for (const [ia, ib, ic] of mesh.faces) {
        const u = norm3(cross3(sub3(pts[ib] as Vec3, pts[ia] as Vec3), sub3(pts[ic] as Vec3, pts[ia] as Vec3)));
        for (const k of [ia, ib, ic]) {
          const a = acc[k] as Vec3;
          acc[k] = { x: a.x + u.x, y: a.y + u.y, z: a.z + u.z };
        }
      }
      return acc.map(norm3);
    };
    const apart = (mesh: Mesh): number => {
      const avg = unitAverage(mesh);
      const tris = trianglesOf(mesh as never, extentOf(surfacePoints(mesh as never)), 0);
      let worst = 0;
      tris.forEach((t, i) => {
        const face = mesh.faces[i] as [number, number, number];
        [t.a, t.b, t.c].forEach((w, k) => {
          const u = avg[face[k] as number] as Vec3;
          const d = Math.min(1, Math.max(-1, w.n.x * u.x + w.n.y * u.y + w.n.z * u.z));
          worst = Math.max(worst, (Math.acos(d) * 180) / Math.PI);
        });
      });
      return worst;
    };
    // Quintic column spacing: the faces around a shared vertex differ ~30× in area.
    expect(apart(graded(8, 5)), "area weighting moves a shared normal").toBeGreaterThan(30);
    // **The control is a single planar quad**, where every face normal is the
    // same vector, so the two schemes must agree exactly — without it this row
    // would pass against any normal that merely differs.
    expect(apart(quad), "on a planar quad the two schemes coincide").toBeLessThan(0.001);
  });

  it("SF3a (C12 I94, F456): the studio light's direction is on the frame", () => {
    // **The row the world-space normal needed and did not have.** Every other
    // assertion about the shading — a range of colours, a terminator, an
    // ambient floor that is never zero — is satisfied by a normal dotted with a
    // light in the wrong frame, because the product of two unit vectors is in
    // `[−1, 1]` whichever frames they are in. What is *not* satisfied is the
    // light coming from a particular direction. Measured: 1.47× correct
    // against 1.02× with the normal left in world space.
    const ball = sphere(28, 20);
    const shot = (light?: unknown): number => litRatio(frame(
      bare({ surfaces3: [{ ...ball, label: "ball" }], colourBy: "series", height: 16,
             ...(light === undefined ? {} : { light3: light }) }),
      capsFor("24bit"), 60, "sf3a",
    ));
    expect(shot(), "studio lights the upper right").toBeGreaterThan(1.25);
    // **The control is `headlight`**, whose whole defect is that it has no
    // direction: the normal and the view coincide at the centre and fall off
    // symmetrically, so a sphere reads as a flat disc and the ratio is ~1.
    // Without it this row would pass against any shading that happens to
    // brighten upward.
    expect(shot("headlight"), "a headlight has no direction to find").toBeLessThan(1.15);
  });

  it("SF4 (C12 I94, F457): the terms sum to 1, so the clamp is a guard and the specular survives", () => {
    // **The shipped `shade`, not a copy of it.** The first version of this row
    // recomputed the formula here with the coefficients written out, so
    // mutating the constants in `surface3.ts` changed nothing it measured — a
    // probe rebuilt from intent agreeing with itself, and it survived the
    // mutation that puts `0.2 / 0.8 / 0.4` back.
    const basis = basisOf(undefined, 1);
    const l = lightDirOf(undefined, basis);
    const span = { nearD: 0, farD: 0 };
    const norm = (a: Vec3): Vec3 => {
      const n = Math.hypot(a.x, a.y, a.z);
      return n === 0 ? a : { x: a.x / n, y: a.y / n, z: a.z / n };
    };
    // **A view *position*, not a direction.** `shade` takes where the sample is
    // in view space and derives the direction to the eye from it, so a sample in
    // front of the camera has a **positive** `z` — passing the direction here
    // inverts it and the sweep comes back 0.80 instead of 0.9619, which is a
    // plausible number and the wrong one.
    const front: Vec3 = { x: 0, y: 0, z: 1 };
    // **Swept, and the sweep is the half that matters.** The figure at the
    // maximum says the specular survives; only the sweep says the clamp cannot
    // fire, which is what makes F455's 0.2–1.0 measurement cover what ships.
    let hi = -Infinity;
    let n = 0;
    for (let a = 0; a < 128; a += 1) { // cells-ok — a sweep index
      for (let c = 0; c < 64; c += 1) { // cells-ok — a sweep index
        const th = (a / 128) * 2 * Math.PI; // cells-ok — a sweep index
        const ph = (c / 63) * Math.PI; // cells-ok — a sweep index
        hi = Math.max(hi, shade(viewDir(basis, {
          x: Math.sin(ph) * Math.cos(th), y: Math.sin(ph) * Math.sin(th), z: Math.cos(ph),
        }), front, l, 0, span));
        n += 1; // cells-ok — a sweep count
      }
    }
    expect(n).toBe(8192); // cells-ok — a sweep count
    expect(hi, "no normal exceeds 1, so the clamp never fires on the design").toBeLessThanOrEqual(1);
    expect(hi).toBeCloseTo(0.9619, 3);
    // **The half-vector, where the specular is exactly maximal**, and the
    // contribution measured against the same normal with the reflection turned
    // away. `0.1971` of a possible `0.2`, against `0.0499` of `0.4` under the
    // old terms — the whole of why they were rebalanced (F457).
    const h = norm({ x: l.x, y: l.y, z: l.z - 1 });
    expect(shade(h, front, l, 0, span)).toBeCloseTo(0.9625, 3);
    // **A pure differential, so nothing here restates a coefficient.** The same
    // normal and the same light seen from far off the axis: the diffuse term
    // does not depend on the view, so what the two calls differ by *is* the
    // specular. Writing `0.2 + 0.6 · n·l` here instead would be the copy this
    // row was rewritten to remove.
    const offAxis: Vec3 = { x: 100, y: 0, z: 1 };
    expect(
      shade(h, front, l, 0, span) - shade(h, offAxis, l, 0, span),
      "the specular contributes its whole 0.2 rather than 12.5% of 0.4",
    ).toBeGreaterThan(0.19);
  });

  it("SF5 (C12 I94, C04 I79): `colourBy: \"value\"` reads the field and not the heights", () => {
    const heights = gaussian(9);
    // **Not the transpose, and the first draft was.** `exp(−(x² + y²))` is
    // symmetric under transpose, so a renderer reading the heights and one
    // reading the field draw the identical frame and the row passes against the
    // defect. A ramp along `y` shares nothing with the height.
    const shot = (field?: number[][]): string =>
      cellsOf(frame(
        bare({ surfaces3: [{ heights, xRange: [-2, 2], yRange: [-2, 2], ...(field === undefined ? {} : { field }) }], colourBy: "value" }),
        capsFor("24bit"), 50, "sf5",
      )).map((c) => c.colour ?? "").join("|");
    // **The transpose keeps the geometry and moves the reading.** A renderer
    // colouring by height draws the same frame for both; one reading the field
    // draws two, because the Gaussian's grid is not symmetric under transpose
    // once it is sampled on nine points.
    const byHeight = shot();
    const byField = shot(heights.map((_, j) => heights.map(() => j)));
    expect(byField, "the field is a different reading from the heights").not.toBe(byHeight);
    // **And the control**: the field set *to* the heights must reproduce the
    // height reading exactly, or this row is passing on the member being read at
    // all rather than on which member.
    expect(shot(heights.map((r) => [...r])), "field = heights is the height reading").toBe(byHeight);
  });

  it("SF6 (C12 I94, I90, C04 I79): the extent is over the fourth carrier too", () => {
    // **Scale invariance, and a surfaces-only block** — LN1's shape one carrier
    // along. The first version of this row put a full-extent cloud beside the
    // surface, so removing the surface from the extent changed nothing: the
    // cloud already spanned the cube. `extentOf([])` is the unit cube, so a
    // surface that already spans it normalises identically under both readings
    // and the row passes against the defect.
    const small = { heights: [[0, 0.06, 0.02], [0.05, 0.2, 0.08], [0.01, 0.07, 0.03]],
                    xRange: [0, 0.2] as const, yRange: [0, 0.2] as const };
    const scaled = { heights: small.heights.map((r) => r.map((v) => v * 5)),
                     xRange: [0, 1] as const, yRange: [0, 1] as const };
    const shot = (s2: unknown): string =>
      frame(bare({ surfaces3: [s2] }), capsFor("24bit"), 50, "sf6").map((r) => strip(r)).join("\n");
    expect(shot(scaled), "a surface scaled by five draws the same picture").toBe(shot(small));
    // **And the frame's own coincidence**, which is F452's ruling where it is
    // structural: a full-extent surface's rim lies on the box by construction,
    // so the box loses those cells to it.
    const muted = slotRgb("tone.muted");
    const boxed = (over: Record<string, unknown>): number =>
      cellsOf(frame({
        form: "scatter3d", height: 12, series: [], box3: "full", axes3: false, colormap: "viridis",
        points3: [{ points: [
          { x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: -1 }, { x: 1, y: -1, z: 1 },
        ] }],
        ...over,
      }, capsFor("24bit"), 50, "sf6b")).filter((c) => c.colour === muted).length; // cells-ok — a cell count
    const alone = boxed({});
    expect(alone, "the box draws on its own").toBeGreaterThan(0);
    expect(
      boxed({ surfaces3: [{ heights: [[-1, -1], [-1, -1]], xRange: [-1, 1], yRange: [-1, 1] }] }),
      "the surface takes the box's coincident cells",
    ).toBeLessThan(alone);
  });

  it("SF7 (C12 I94, I88): below the half-block arm a surface takes density glyphs", () => {
    const caps = capsFor("ascii");
    const ladder = new Set([...ladderFor("density", caps as never).steps]);
    expect([...ladder].join(""), "the ASCII ladder, read rather than restated").toBe(".:-=+*#@");
    const rows = frame(
      bare({ surfaces3: [{ heights: gaussian(12), xRange: [-2, 2], yRange: [-2, 2] }] }),
      caps, 50, "sf7",
    );
    const drawn = new Set(cellsOf(rows).map((c) => c.text));
    expect(drawn.size, "the surface inked something").toBeGreaterThan(1);
    for (const g of drawn) {
      expect(ladder.has(g), `${g} is on the density ladder`).toBe(true);
    }
    // **And never a marker from the tier table** (§6g row 5 one carrier along):
    // `glyph[]` packs `tier × clouds + series`, and a surface is neither.
    expect(densityGlyph(0.2, caps as never), "ambient is the ladder's second rung").toBe(":");
    expect(densityGlyph(1, caps as never), "full light is its last").toBe("@");
  });

  it("SF9 (C12 I94, F455, F480): the field's hue ratio under shading, per colormap", () => {
    // **The measurement F436 deferred to step 6, which ran and had no row**
    // (F480). Its result is written in five places — F455, the design note's
    // §3c, C12 I94, `shadeColour`'s doc comment and `scatter3.ts`'s call site —
    // and `shadeColour` was named by no test file. What would notice a change
    // is a golden frame, which moves for any change to the colour path and
    // cannot say which property was lost.
    //
    // **OKLab is computed here and not in `src/`**, because nothing in the
    // renderer needs it: an export nothing consumes is what this repo forbids,
    // and the conversion is this measurement's own instrument.
    //
    // **And the instrument is checked against F455's published table rather
    // than trusted.** If the coefficients below were wrong the ratios would not
    // reproduce, so the row verifies its own reader before it verifies the
    // claim — which is the only defence a reimplemented conversion has.
    const lin = (c: number): number =>
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const oklabHue = (hex: string): { L: number; hue: number; chroma: number } => {
      const n = Number.parseInt(hex.replace("#", ""), 16);
      // eslint-disable-next-line no-bitwise
      const r = lin(((n >> 16) & 255) / 255);
      // eslint-disable-next-line no-bitwise
      const g = lin(((n >> 8) & 255) / 255);
      // eslint-disable-next-line no-bitwise
      const b = lin((n & 255) / 255);
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q;
      const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q;
      return {
        L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q,
        hue: Math.atan2(B, A),
        chroma: Math.hypot(A, B),
      };
    };
    const wrap = (d: number): number => Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));

    const hexOf = (c: unknown): string => (c as { hex?: string } | undefined)?.hex ?? "#000000";
    const FIELDS = 21; // cells-ok — a sweep count
    const SHADES = 11; // cells-ok — a sweep count

    /** Hue drift as the shading sweeps, and the smallest step between fields. */
    const ratioFor = (
      map: string,
    ): { drift: number; step: number; chroma: number; stepAnyShade: number } => {
      const base: string[] = [];
      for (let i = 0; i < FIELDS; i += 1) { // cells-ok — a sweep index
        base.push(
          hexOf(
            continuousColour(
              COLORMAPS[map] as never,
              i / (FIELDS - 1), // cells-ok — a sweep index
              { colourDepth: 24 } as never,
            ),
          ),
        );
      }
      let drift = 0;
      let chroma = 0;
      for (const hex of base) {
        const hues: number[] = [];
        for (let k = 0; k < SHADES; k += 1) { // cells-ok — a sweep index
          // **0.2 to 1.0, which is what ships** — F457's interval, and F455's.
          const i = 0.2 + (0.8 * k) / (SHADES - 1); // cells-ok — a sweep index
          const o = oklabHue(hexOf(shadeColour({ kind: "rgb", hex } as never, i)));
          hues.push(o.hue);
          chroma = Math.max(chroma, o.chroma);
        }
        for (const h of hues) drift = Math.max(drift, wrap(h - (hues[0] as number)));
      }
      let step = Infinity;
      let stepAnyShade = Infinity;
      for (let i = 1; i < base.length; i += 1) { // cells-ok — a sweep index
        step = Math.min(
          step,
          wrap(oklabHue(base[i] as string).hue - oklabHue(base[i - 1] as string).hue),
        );
        for (let k = 0; k < SHADES; k += 1) { // cells-ok — a sweep index
          const it = 0.2 + (0.8 * k) / (SHADES - 1); // cells-ok — a sweep index
          const a = oklabHue(hexOf(shadeColour({ kind: "rgb", hex: base[i] as string } as never, it)));
          const b = oklabHue(hexOf(shadeColour({ kind: "rgb", hex: base[i - 1] as string } as never, it)));
          stepAnyShade = Math.min(stepAnyShade, wrap(a.hue - b.hue));
        }
      }
      return { drift, step, chroma, stepAnyShade };
    };

    // **The instrument's own check, and it is the whole defence a reimplemented
    // conversion has**: the figures below are F455's published table, and eleven
    // of twelve reproduce to four decimal places. If the OKLab coefficients were
    // wrong they would not.
    //
    // **And reproducing them is what corrected the reading.** *The minimum hue
    // step between adjacent field values* was first taken at full intensity,
    // which gave magma 0.0720 against the published 0.0005 — a factor of 144.
    // The quantity is the minimum over the whole field × shading grid, and that
    // is the one the claim needs: recoverability asks whether two field values
    // can be told apart **at any shading**, and at low intensity a dark map's
    // neighbours converge. The weaker reading is the one that flatters the
    // scheme.
    const M = {
      viridis: ratioFor("viridis"),
      plasma: ratioFor("plasma"),
      inferno: ratioFor("inferno"),
      coolwarm: ratioFor("coolwarm"),
      magma: ratioFor("magma"),
      gray: ratioFor("gray"),
    };

    // Drift under shading — five of six exact against F455.
    expect(M.viridis.drift).toBeCloseTo(0.033, 3);
    expect(M.plasma.drift).toBeCloseTo(0.0168, 4);
    expect(M.inferno.drift).toBeCloseTo(0.1223, 4);
    expect(M.magma.drift).toBeCloseTo(0.1522, 4);
    expect(M.gray.drift, "gray has no hue to drift").toBeLessThan(1e-6);
    // **`coolwarm` is the sixth and it is not asserted to F455's 0.1179.**
    // Measured here at 0.0899, and the map is the one F455 itself names as
    // passing through a white midpoint where chroma is zero and hue is
    // undefined — so its drift is a maximum over samples whose hue is noise.
    // Bounded rather than pinned, because a figure taken where the quantity is
    // undefined is not a figure to hold a row to.
    expect(M.coolwarm.drift, "coolwarm's drift is real but not reproducible to 4dp").toBeGreaterThan(0.05);

    // The minimum field step over the whole grid — all six exact.
    expect(M.viridis.stepAnyShade).toBeCloseTo(0.1292, 4);
    expect(M.plasma.stepAnyShade).toBeCloseTo(0.1231, 4);
    expect(M.inferno.stepAnyShade).toBeCloseTo(0.0015, 4);
    expect(M.coolwarm.stepAnyShade).toBeCloseTo(0.0016, 4);
    expect(M.magma.stepAnyShade).toBeCloseTo(0.0005, 4);
    expect(M.gray.stepAnyShade, "and no hue to step").toBeLessThan(1e-6);

    // **Per map is the assertion** (F455). A row asserting only viridis passes
    // for a renderer that has lost the property everywhere else, and the split
    // is what the finding *is*: the field survives the shading exactly when the
    // map travels in hue, which is a property of the caller's `colormap` and
    // not a rung of the terminal.
    for (const map of ["viridis", "plasma"] as const) {
      expect(M[map].stepAnyShade / M[map].drift, `${map} keeps the field in hue`).toBeGreaterThan(3);
    }
    for (const map of ["magma", "inferno", "coolwarm"] as const) {
      expect(M[map].stepAnyShade / M[map].drift, `${map} does not`).toBeLessThan(0.1);
    }
    // And `gray` has no chroma to carry anything, which is a fact about the map
    // rather than about the conversion — it would not come out at zero if the
    // OKLab were wrong.
    expect(M.gray.chroma, "gray carries no chroma").toBeLessThan(0.005);
  });

  it("SF8 (C12 I94, I91): a straddling face is clipped rather than dropped", () => {
    // **Asserted on the mechanism, and the frame comparison it replaces was
    // invalid.** The obvious control — the same mesh with the straddling faces
    // removed — goes back through `unitOf` against its own smaller extent, so it
    // is a *different* geometry rather than the same one drawn differently, and
    // the two frames came out at 382 cells each. AX6's ruling one primitive
    // along: assert what the clip produced, not what the frame shows.
    const camera = { azimuth: 0, elevation: 0, distance: 1 };
    const basis = basisOf(camera, 1);
    const grid = { width: 40, height: 24 };
    const zOf = (p: Vec3): number =>
      (p.x - basis.eye.x) * basis.forward.x + (p.y - basis.eye.y) * basis.forward.y
      + (p.z - basis.eye.z) * basis.forward.z;
    const vert = (p: Vec3) => ({ p, n: { x: 0, y: 0, z: 1 }, v: undefined });
    const plain = {
      fn: { x: 0, y: 0, z: 1 },
      edges: [true, true, true] as const,
      series: 0,
      skin: { cull: 0, wire: false } as const,
    };
    // One corner behind the eye and two in front, at the default `distance: 1`.
    const straddle = {
      a: vert({ x: -1, y: -1, z: 0 }), b: vert({ x: 1, y: 1, z: 0 }), c: vert({ x: 1, y: -1, z: 0 }),
      ...plain,
    };
    expect(
      [straddle.a, straddle.b, straddle.c].filter((w) => zOf(w.p) <= 0.01).length,
      "the triangle really does straddle the near plane",
    ).toBeGreaterThan(0);
    expect(
      [straddle.a, straddle.b, straddle.c].filter((w) => zOf(w.p) > 0.01).length,
      "and it really does have a front half",
    ).toBeGreaterThan(0);
    const painted = (t: typeof straddle): number => {
      const d = createDepth(grid.width, grid.height);
      let n = 0;
      drawTri(t, basis, grid, d, lightDirOf(undefined, basis), { nearD: 0, farD: 2 }, () => { n += 1; });
      return n; // cells-ok — a sample count
    };
    expect(painted(straddle), "the front half is drawn rather than the face dropped").toBeGreaterThan(0);
    // **The control is a face entirely behind**, which must draw nothing — or
    // the row above passes against a clip that never refuses anything.
    // Past the eye along `+x`, where the camera sits at `distance: 1`.
    const away = {
      a: vert({ x: 2, y: -1, z: 0 }), b: vert({ x: 3, y: 1, z: 0 }), c: vert({ x: 3, y: -1, z: 1 }),
      ...plain,
    };
    expect(
      [away.a, away.b, away.c].every((w) => zOf(w.p) <= 0.01),
      "the control is entirely behind the near plane",
    ).toBe(true);
    expect(painted(away), "a face entirely behind draws nothing").toBe(0);
  });

  // ---- step 7: the cull and the wireframe (C12 I95, C04 I80, §6i) ----------

  it("WF1 (C12 I95, §6i rows 1–2): the cull's direction is the face's, and the constant cannot see the eye", () => {
    const s = { ...sphere(48, 24), closed: true };
    const tris = trianglesOf(s, extentOf(surfacePoints(s)), 0);
    // **The rejected alternative, computed here** — the design note's
    // `dot(normal, view) < 0` with `view` a view-space constant. Comparing the
    // shipped rule against a restatement of itself finds nothing (F459).
    //
    // **Both are oriented by the volume**, or the comparison measures §6i row
    // 3's ruling instead of row 1's and reports 92.7% at every distance. This
    // row is about the *direction* alone, so the sign is held fixed.
    const byConstant = (t: Tri3, basis: ReturnType<typeof basisOf>): boolean =>
      viewDir(basis, t.fn).z * t.skin.cull > 0;
    const at = (distance: number): { dis: number; kept: number; keptConst: number } => {
      const basis = basisOf({ distance }, 2);
      let dis = 0;
      let kept = 0;
      let keptConst = 0;
      for (const t of tris) {
        const ship = backfaceCulled(t, basis);
        const con = byConstant(t, basis);
        if (!ship) kept += 1; // cells-ok — a face count
        if (!con) keptConst += 1; // cells-ok — a face count
        if (ship !== con) dis += 1; // cells-ok — a face count
      }
      return { dis, kept, keptConst };
    };
    const near = at(1.5);
    const far = at(6);
    const pct = (n: number): number => (n / tris.length) * 100; // cells-ok — a face count
    expect(pct(far.dis), "at distance 6 the two answers are close").toBeLessThan(10);
    expect(pct(near.dis), "at 1.5 a third of the faces are wrong").toBeGreaterThan(30);
    // **The half that says what is wrong with the constant, and it is not the
    // disagreement**: a view-space `z` test cannot read the eye's position, so
    // it returns the same count at every distance while the truth halves.
    expect(far.keptConst, "the constant answers identically at both distances").toBe(near.keptConst);
    expect(far.kept, "and the shipped rule does not").not.toBe(near.kept);
    // And *removes ~half* is the `d → ∞` limit. 44.5% by face count at distance
    // 6, against the 41.7% by area that `(1 − r/d)/2` gives — a UV sphere's
    // polar faces are slivers, so the two figures are not the same measurement.
    expect(pct(far.kept)).toBeGreaterThan(43);
    expect(pct(far.kept)).toBeLessThan(46);
  });

  it("WF2 (C12 I95, §6i rows 3–4): reversing the winding keeps the same faces and inks the same samples", () => {
    const natural = { ...sphere(24, 12), closed: true };
    const reversed = {
      ...natural,
      faces: natural.faces.map(([x, y, z]) => [x, z, y] as [number, number, number]),
    };
    const ext = extentOf(surfacePoints(natural));
    const ta = trianglesOf(natural, ext, 0);
    const tb = trianglesOf(reversed, ext, 0);
    const basis = basisOf({}, 2);
    const keep = (tris: readonly Tri3[]): boolean[] => tris.map((t) => !backfaceCulled(t, basis));
    const ka = keep(ta);
    const kb = keep(tb);
    expect(ka, "the two windings keep the same faces").toEqual(kb);
    expect(ka.filter(Boolean).length, "and culling actually happened").toBeLessThan(ka.length * 0.5);
    // **The control is the cull that trusts the winding**, computed here. It is
    // the whole content of the ruling, and it disagrees almost everywhere —
    // which is why the frame is no help: two-sided shading lights the far
    // hemisphere correctly and a sphere's silhouette is the same either way.
    const naive = ta.map((t) => {
      const c = {
        x: (t.a.p.x + t.b.p.x + t.c.p.x) / 3,
        y: (t.a.p.y + t.b.p.y + t.c.p.y) / 3,
        z: (t.a.p.z + t.b.p.z + t.c.p.z) / 3,
      };
      return !(t.fn.x * (c.x - basis.eye.x) + t.fn.y * (c.y - basis.eye.y)
        + t.fn.z * (c.z - basis.eye.z) > 0);
    });
    const agree = naive.filter((v, i) => v === ka[i]).length; // cells-ok — a face count
    expect(agree / ka.length, "trusting the winding draws the other hemisphere").toBeLessThan(0.15);
    // **The drawn sample mask, which is the claim I95 makes** — and asserting
    // the *frame* instead is F464: two of 3449 characters differ under
    // `smooth`, because a sample lying exactly on a shared edge goes to
    // whichever triangle rounds its barycentric weight non-negative and the two
    // windings compute that weight from different operands. That is the
    // rasteriser's tie, not the cull's, and this renderer has no fill rule.
    const drawnBy = (tris: readonly Tri3[]): string => {
      const grid = { width: 140, height: 64 };
      const bs = basisOf({}, grid.width / grid.height);
      const d = createDepth(grid.width, grid.height);
      const m = new Uint8Array(grid.width * grid.height); // cells-ok — a sample count
      for (const t of tris) {
        drawTri(t, bs, grid, d, lightDirOf(undefined, bs), { nearD: 5, farD: 7 }, (i) => { m[i] = 1; });
      }
      return m.join("");
    };
    expect(drawnBy(ta), "the two windings ink exactly the same samples").toBe(drawnBy(tb));
    // **The frame, compared cell by cell rather than by string position** —
    // one differing cell early in a line shifts every SGR after it, and the
    // first version of this row reported 71% for a six-cell difference. Aligned
    // at 140 × 30: `flat` is identical under the two windings (0 of 300), and
    // `smooth` differs in 6 of 300 from the rasteriser's shared-edge tie.
    const at = (sf: unknown, shading: string): (string | null)[][] =>
      frame(bare({ surfaces3: [{ ...(sf as object), shading }], height: 30 }),
        capsFor("24bit"), 140, "wf2").map((line) => {
        const row: (string | null)[] = [];
        for (const run of runsOf(line)) for (const ch of [...run.text]) row.push(ch === " " ? null : run.colour);
        return row;
      });
    const apart = (x: (string | null)[][], y: (string | null)[][]): [number, number] => {
      let d = 0; // cells-ok — a cell count
      let ink = 0; // cells-ok — a cell count
      for (let r = 0; r < Math.max(x.length, y.length); r += 1) { // cells-ok — a row index
        const rx = x[r] ?? [];
        const ry = y[r] ?? [];
        for (let c = 0; c < Math.max(rx.length, ry.length); c += 1) { // cells-ok — a column index
          const p = rx[c] ?? null;
          const q = ry[c] ?? null;
          if (p !== null || q !== null) ink += 1; // cells-ok — a cell count
          if (p !== q) d += 1; // cells-ok — a cell count
        }
      }
      return [d, ink];
    };
    expect(apart(at(natural, "flat"), at(reversed, "flat"))[0], "flat is identical").toBe(0);
    const [dSmooth, inkSmooth] = apart(at(natural, "smooth"), at(reversed, "smooth"));
    expect(dSmooth / inkSmooth, "and smooth differs only in the rasteriser's own tie")
      .toBeLessThan(0.05);
    // The second half of the ruling's reason, and the whole of why the frame is
    // no help: culling a **convex** closed mesh is very nearly invisible — 6
    // cells of 306, all at the silhouette — so nothing on screen could report
    // which hemisphere drew.
    const [dCull, inkCull] = apart(at(natural, "flat"), at(sphere(24, 12), "flat"));
    expect(dCull / inkCull, "culling a sphere is all but invisible").toBeLessThan(0.05);
  });

  it("WF3 (C12 I95, §6i row 5): a mesh whose winding cancels its own volume is not culled", () => {
    const s = sphere(24, 12);
    // Half reversed, by latitude — the shape that cancels to floating-point
    // zero and is therefore the one the guard catches.
    const half = {
      ...s,
      closed: true,
      faces: s.faces.map((f, i) =>
        i >= s.faces.length / 2 ? [f[0], f[2], f[1]] as [number, number, number] : f), // cells-ok — a face count
    };
    const ext = extentOf(surfacePoints(s));
    const basis = basisOf({}, 2);
    const tris = trianglesOf(half, ext, 0);
    expect(tris.every((t) => !backfaceCulled(t, basis)), "nothing is culled").toBe(true);
    expect(tris[0]?.skin.cull, "and the sign is refused rather than guessed").toBe(0);
    // The control: consistently wound, the same mesh culls.
    const whole = trianglesOf({ ...s, closed: true }, ext, 0);
    expect(whole.some((t) => backfaceCulled(t, basis)), "a consistent mesh does cull").toBe(true);
  });

  it("WF4 (C12 I95, C04 I80, §6i rows 6 and 15): `closed` is refused on a grid and `wireframe` is not", () => {
    const grid = { heights: [[0, 1], [1, 0]], xRange: [0, 1], yRange: [0, 1] };
    const mesh = {
      vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
      faces: [[0, 1, 2]],
    };
    const at = (sf: unknown): string =>
      errorsOf({ kind: "plot", id: "s", form: "scatter3d", height: 4, series: [], surfaces3: [sf] }).join(" ");
    expect(at({ ...grid, closed: true })).toMatch(/"closed" on a height field/u);
    expect(() => b.plot({ form: "scatter3d", height: 4, series: [], surfaces3: [{ ...grid, closed: true }] } as never))
      .toThrow(/"closed" on a height field/u);
    // **The three accepts are the row**, not decoration: a refusal copied from
    // one member onto the other reads exactly like a rule, and the two arrived
    // together (§6i row 15).
    expect(at({ ...mesh, closed: true })).toBe("");
    expect(at({ ...grid, wireframe: true })).toBe("");
    expect(at({ ...mesh, wireframe: "over" })).toBe("");
    // T3.60: with neither arm resolved, the arm refusal is what a caller reads.
    expect(at({ closed: true, label: "empty" })).toMatch(/has neither "heights" nor "vertices"/u);
    expect(at({ closed: true, label: "empty" })).not.toMatch(/"closed" on a height field/u);
  });

  it("WF5 (C12 I95, §6i row 9): a height field's wireframe is its grid lines and not its triangulation's", () => {
    const n = 6;
    const heights = gaussian(n);
    const asGrid = { heights, xRange: [-2, 2], yRange: [-2, 2], wireframe: "over" as const };
    // The same surface handed over as an explicit mesh, where every triangle
    // edge IS the caller's structure — the control, and the rejected alternative.
    const vertices: { x: number; y: number; z: number }[] = [];
    for (let j = 0; j < n; j += 1) { // cells-ok — a row index
      for (let i = 0; i < n; i += 1) { // cells-ok — a column index
        vertices.push({
          x: (i / (n - 1)) * 4 - 2, // cells-ok — a column index
          y: (j / (n - 1)) * 4 - 2, // cells-ok — a row index
          z: (heights[j] as number[])[i] as number,
        });
      }
    }
    const faces: [number, number, number][] = [];
    const at2 = (i: number, j: number): number => j * n + i; // cells-ok — a grid offset
    for (let j = 0; j + 1 < n; j += 1) { // cells-ok — a row index
      for (let i = 0; i + 1 < n; i += 1) { // cells-ok — a column index
        faces.push([at2(i, j), at2(i + 1, j), at2(i + 1, j + 1)]);
        faces.push([at2(i, j), at2(i + 1, j + 1), at2(i, j + 1)]);
      }
    }
    const asMesh = { vertices, faces, wireframe: "over" as const };
    const g = maskOf(asGrid);
    const m = maskOf(asMesh);
    expect(g.edge, "the grid marks fewer samples than every triangle edge").toBeLessThan(m.edge);
    expect(g.fill, "and leaves interior for the cells to be visible in").toBeGreaterThan(0);
    // The two draw the same geometry, or the counts above compare two pictures.
    expect(g.edge + g.fill).toBe(m.edge + m.fill);
    // And with the member unset nothing is an edge at all.
    expect(maskOf({ heights, xRange: [-2, 2], yRange: [-2, 2] }).edge).toBe(0);
    // **The band's width, in samples, and it is the half the counts above
    // cannot see** (§6i row 8). A mutation widening `EDGE_HALF` from 0.7 to
    // **three** survived every assertion here: the cells are 15 samples across
    // at this size, so a six-sample band still leaves interior and the grid
    // still marks fewer samples than the mesh. What the constant claims is a
    // band about **one sample wide**, and that is a ratio against the projected
    // perimeter rather than a count — measured `0.916` at 0.7, and four times
    // that at 3.
    const big = {
      a: { p: { x: 0, y: -0.8, z: -0.8 }, n: { x: 0, y: 0, z: -1 }, v: undefined },
      b: { p: { x: 0, y: 0.8, z: -0.8 }, n: { x: 0, y: 0, z: -1 }, v: undefined },
      c: { p: { x: 0, y: 0, z: 0.8 }, n: { x: 0, y: 0, z: -1 }, v: undefined },
      fn: { x: 1, y: 0, z: 0 },
      edges: [true, true, true] as const,
      series: 0,
      skin: { cull: 0, wire: "over" } as const,
    };
    const box = { width: 200, height: 200 };
    const bs = basisOf({ azimuth: 0, elevation: 0, distance: 6 }, 1);
    let band = 0; // cells-ok — a sample count
    drawTri(big, bs, box, createDepth(box.width, box.height), lightDirOf(undefined, bs),
      { nearD: 5, farD: 7 }, (_i, sm) => { if (sm.edge) band += 1; }); // cells-ok — a sample count
    const corners = [big.a, big.b, big.c].map((w) => {
      const pr = project(bs, w.p) as { x: number; y: number };
      return { x: pr.x * box.width, y: pr.y * box.height }; // cells-ok — a sample coordinate
    });
    const perimeter = corners.reduce((sum, q, i) => {
      const r = corners[(i + 1) % 3] as { x: number; y: number };
      return sum + Math.hypot(r.x - q.x, r.y - q.y);
    }, 0);
    expect(band / perimeter, "the edge band is about one sample wide").toBeGreaterThan(0.5);
    expect(band / perimeter, "and not three").toBeLessThan(2);
  });

  it("WF6 (C12 I95, §6i row 11): a cage still occludes what is behind it", () => {
    const cage = { ...sphere(16, 8), closed: true, wireframe: true as const };
    const behind = { x: 0, y: 0, z: -6 };
    const front = { x: 0, y: 0, z: 6 };
    // **The two blocks differ in one number**, which is what makes this a row
    // about occlusion: adding the cloud at all changes the palette and the
    // legend, so a comparison against a surface-only frame measures that
    // instead.
    const shot = (p: { x: number; y: number; z: number }, sf: unknown): string =>
      frame(
        bare({ surfaces3: [sf], points3: [{ label: "p", points: [p] }], colourBy: "series" }),
        capsFor("24bit"), 60, "wf6",
      ).join("\n");
    expect(shot(front, cage), "the two positions are not the same picture")
      .not.toBe(shot(behind, cage));
    expect(inked(shot(front, cage).split("\n")), "a point in front of the cage draws")
      .toBeGreaterThan(inked(shot(behind, cage).split("\n")));
    // **The control is the member**: with `wireframe` unset the same pair
    // behaves the same way, so the row is about the cage's depth write and not
    // about the surface being there at all.
    const solid = { ...sphere(16, 8), closed: true };
    expect(inked(shot(front, solid).split("\n")))
      .toBeGreaterThan(inked(shot(behind, solid).split("\n")));
  });

  it("WF7 (C12 I95, §6i row 13): an edge is its own face at half the intensity, and a constant cannot be", () => {
    const g = { heights: gaussian(5), xRange: [-2, 2] as const, yRange: [-2, 2] as const };
    const solid = frame(bare({ surfaces3: [g] }), capsFor("24bit"), 110, "wf7a");
    const over = frame(bare({ surfaces3: [{ ...g, wireframe: "over" }] }), capsFor("24bit"), 110, "wf7b");
    const lums = (rows: readonly string[]): number[] =>
      cellsOf(rows).map((c) => lumOf(c.colour)).filter((l) => l >= 0);
    const a = lums(solid);
    const bl = lums(over);
    expect(a.length, "both frames draw the same surface").toBe(bl.length);
    // **Cell by cell rather than by extremes.** The brightest cell may itself
    // be an edge, so *the maximum is unchanged* is a claim about where the
    // grid lines fall — the claim about the rule is that nothing brightens.
    expect(bl.filter((l, i) => l > (a[i] as number)).length, "no cell brightens").toBe(0);
    expect(bl.filter((l, i) => l < (a[i] as number)).length, "and the edges darken")
      .toBeGreaterThan(0);
    // **The edges go below the solid frame's floor**, which is what a ratio buys
    // and a constant cannot: the fill's own intensity spans 0.1332–0.7871, so
    // any absolute edge value collides with the fill somewhere inside it.
    expect(Math.min(...bl), "the dimmed edges sit under the fill's darkest cell")
      .toBeLessThan(Math.min(...a));
    // The ratio itself, asserted against the rejected alternative rather than
    // restated: halving separates at every intensity the fill reaches.
    for (const i of [0.1332, 0.5, 0.7871, 1]) {
      expect(edgeIntensity(i, "over"), String(i)).toBeLessThan(i);
      expect(edgeIntensity(i, true), "and `true` does not dim, having no fill to separate from")
        .toBe(i);
    }
  });

  it("WF8 (C12 I95, §6i row 10): the near-plane clip's own edge is not one of the caller's", () => {
    // A big triangle with one vertex behind the eye. Its clipped form is one
    // triangle whose third side is the cut — and the cut must not be an edge.
    const wire = { cull: 0, wire: "over" } as const;
    const vert = (p: Vec3) => ({ p, n: { x: 0, y: 0, z: -1 }, v: undefined });
    const basis = basisOf({ distance: 1 }, 2);
    const grid = { width: 90, height: 44 };
    const edgesOf = (tri: Tri3): number => {
      const d = createDepth(grid.width, grid.height);
      let n = 0; // cells-ok — a sample count
      drawTri(tri, basis, grid, d, lightDirOf(undefined, basis), { nearD: 0, farD: 2 }, (_i, sm) => {
        if (sm.edge) n += 1; // cells-ok — a sample count
      });
      return n;
    };
    const straddle = {
      a: vert({ x: -1, y: -1, z: 0 }), b: vert({ x: 1, y: 1, z: 0 }), c: vert({ x: 1, y: -1, z: 0 }),
      fn: { x: 0, y: 0, z: -1 }, series: 0, skin: wire,
    };
    const none = edgesOf({ ...straddle, edges: [false, false, false] });
    const all = edgesOf({ ...straddle, edges: [true, true, true] });
    expect(none, "with no caller edge the clip contributes none of its own").toBe(0);
    expect(all, "and the surviving originals still draw").toBeGreaterThan(0);
    // **The row**: exactly the two edges that survive the clip are marked, so
    // marking a third — the cut — would add samples. Asserted against the
    // rejected alternative: one caller edge at a time, summing to the whole.
    const one = ([0, 1, 2] as const).map((k) =>
      edgesOf({ ...straddle, edges: [k === 0, k === 1, k === 2] }));
    expect(one.filter((v) => v > 0).length, "two of the three original sides survive").toBe(2);
    expect(one.reduce((x, y) => x + y, 0), "and together they are the whole edge set")
      .toBeGreaterThanOrEqual(all);
  });

  it("WF9 (C12 I95, §6i row 12): the cull reads the face normal under both shading arms", () => {
    const s = { ...sphere(24, 12), closed: true };
    const ext = extentOf(surfacePoints(s));
    const basis = basisOf({}, 2);
    const set = (shading: "flat" | "smooth"): boolean[] =>
      trianglesOf({ ...s, shading }, ext, 0).map((t) => backfaceCulled(t, basis));
    expect(set("smooth"), "smooth and flat cull the same faces").toEqual(set("flat"));
    // **The control is the substitution**, or the row passes against a cull
    // that reads a vertex normal: on a sphere the two are close, so *something
    // was culled* is satisfied either way.
    const smooth = trianglesOf({ ...s, shading: "smooth" }, ext, 0);
    const byVertex = smooth.map((t) => {
      const c = {
        x: (t.a.p.x + t.b.p.x + t.c.p.x) / 3,
        y: (t.a.p.y + t.b.p.y + t.c.p.y) / 3,
        z: (t.a.p.z + t.b.p.z + t.c.p.z) / 3,
      };
      return t.a.n.x * (c.x - basis.eye.x) + t.a.n.y * (c.y - basis.eye.y)
        + t.a.n.z * (c.z - basis.eye.z) < 0;
    });
    expect(byVertex, "and a vertex normal answers differently").not.toEqual(set("smooth"));
  });
});
