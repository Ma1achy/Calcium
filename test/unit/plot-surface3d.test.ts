/**
 * SF1–SF8 and T2.4h/T3.57/T3.58 — the surface carrier (C12 I94, C04 I79, §6h).
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
  basisOf, createDepth, extentOf, viewDir, type Vec3,
} from "../../src/presentation/plot/project3.js";
import {
  densityGlyph, drawTri, lightDirOf, shade, surfacePoints, trianglesOf,
} from "../../src/presentation/plot/surface3.js";
import { ladderFor } from "../../src/presentation/plot/ramp.js";
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
    // One corner behind the eye and two in front, at the default `distance: 1`.
    const straddle = {
      a: vert({ x: -1, y: -1, z: 0 }), b: vert({ x: 1, y: 1, z: 0 }), c: vert({ x: 1, y: -1, z: 0 }),
      series: 0,
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
      series: 0,
    };
    expect(
      [away.a, away.b, away.c].every((w) => zOf(w.p) <= 0.01),
      "the control is entirely behind the near plane",
    ).toBe(true);
    expect(painted(away), "a face entirely behind draws nothing").toBe(0);
  });
});
