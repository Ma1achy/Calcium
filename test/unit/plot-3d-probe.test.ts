/**
 * Phase 4's opening measurement — **render one surface both ways and count what
 * the cell grid loses** (C12, phase 4).
 *
 * **The claim under test is in the repository and was never measured.**
 * `docs/notes/CALCIUM_IMAGES_NOTE.md` says *a 3D surface at 80×24 is 160×96
 * dots, and **a teapot in 160×96 is a smudge*** — carried from the note into the
 * phase ordering without a number behind it. That is the sixth blind spot's
 * shape, so it is measured rather than inherited.
 *
 * **The answer decides an architecture, not a renderer.** If the cell grid loses
 * the silhouette, 3D is an image form whose terminal arm is the dither the image
 * block already has. If it holds, 3D is a terminal form and the projection is
 * designed against braille.
 *
 * **On the teapot: there is no teapot in this repository and none is typed from
 * memory.** Thirty-two Bézier patches recited from recall is F161's shape — a
 * plausible wrong object that measures like a right one. The measurable content
 * of *the handle self-occludes* is self-occlusion, so the second case is a
 * sphere with a torus handle: the handle passes in front of and behind the body,
 * and the silhouette has a hole. **What a teapot adds over that is
 * recognisability, which is not a measurement this process can take** — so the
 * frames are written out for a reader to judge instead.
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const OUT = process.env["PROBE_OUT"] ?? "/tmp";

type V3 = readonly [number, number, number];
type Tri = Readonly<{ a: V3; b: V3; c: V3 }>;

/** Orthographic, after an azimuth then an elevation. Depth is the rotated z. */
function project(p: V3, azim: number, elev: number): V3 {
  const [x, y, z] = p;
  const ca = Math.cos(azim);
  const sa = Math.sin(azim);
  const x1 = x * ca - y * sa;
  const y1 = x * sa + y * ca;
  const ce = Math.cos(elev);
  const se = Math.sin(elev);
  return [x1, y1 * ce - z * se, y1 * se + z * ce];
}

function normal(t: Tri): V3 {
  const u = [t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]] as const;
  const v = [t.c[0] - t.a[0], t.c[1] - t.a[1], t.c[2] - t.a[2]] as const;
  const n: [number, number, number] = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const len = Math.hypot(...n) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

type Raster = Readonly<{
  w: number;
  h: number;
  shade: Float64Array;
  depth: Float64Array;
  hit: Uint8Array;
  /** Fragments the z-buffer rejected on an already-covered pixel — real occlusion. */
  hidden: number;
}>;

/** A z-buffer rasteriser. Lambert from a fixed light, so shade *is* the surface. */
function raster(tris: readonly Tri[], w: number, h: number, azim: number, elev: number): Raster {
  const shade = new Float64Array(w * h);
  const depth = new Float64Array(w * h).fill(-Infinity);
  const hit = new Uint8Array(w * h);
  let hidden = 0;
  const LIGHT: V3 = [0.4, -0.6, 0.7];
  // One projection pass, then a bounding box in normalised device space.
  const projected = tris.map((t) => ({
    a: project(t.a, azim, elev),
    b: project(t.b, azim, elev),
    c: project(t.c, azim, elev),
    n: normal(t),
  }));
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of projected) {
    for (const v of [p.a, p.b, p.c]) {
      lo = Math.min(lo, v[0], v[1]);
      hi = Math.max(hi, v[0], v[1]);
    }
  }
  const span = hi - lo || 1;
  const toScreen = (v: V3): readonly [number, number] => [
    ((v[0] - lo) / span) * (w - 1),
    (1 - (v[1] - lo) / span) * (h - 1),
  ];

  for (const p of projected) {
    const nl = project(p.n, azim, elev);
    const lambert = Math.max(0.08, nl[0] * LIGHT[0] + nl[1] * LIGHT[1] + nl[2] * LIGHT[2]);
    const [ax, ay] = toScreen(p.a);
    const [bx, by] = toScreen(p.b);
    const [cx, cy] = toScreen(p.c);
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den;
        const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < -0.001 || l2 < -0.001 || l3 < -0.001) continue;
        const z = l1 * p.a[2] + l2 * p.b[2] + l3 * p.c[2];
        const i = y * w + x;
        if (z <= (depth[i] ?? -Infinity)) {
          if (hit[i] === 1) hidden += 1;
          continue;
        }
        if (hit[i] === 1) hidden += 1;
        depth[i] = z;
        shade[i] = lambert;
        hit[i] = 1;
      }
    }
  }
  return { w, h, shade, depth, hit, hidden };
}

/** `z = sin(x)·cos(y)` over `[-π, π]²`, as triangles. */
function surface(n: number): readonly Tri[] {
  const at = (i: number, j: number): V3 => {
    const x = -Math.PI + (2 * Math.PI * i) / n;
    const y = -Math.PI + (2 * Math.PI * j) / n;
    return [x, y, Math.sin(x) * Math.cos(y)];
  };
  const out: Tri[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      out.push({ a: at(i, j), b: at(i + 1, j), c: at(i + 1, j + 1) });
      out.push({ a: at(i, j), b: at(i + 1, j + 1), c: at(i, j + 1) });
    }
  }
  return out;
}

/** A sphere body with a torus handle — self-occluding, and honestly not a teapot. */
function bodyAndHandle(n: number): readonly Tri[] {
  const out: Tri[] = [];
  const quad = (a: V3, b: V3, c: V3, d: V3): void => {
    out.push({ a, b, c }, { a, b: c, c: d });
  };
  const sphere = (i: number, j: number): V3 => {
    const u = (Math.PI * i) / n;
    const v = (2 * Math.PI * j) / n;
    return [Math.sin(u) * Math.cos(v) * 1.1, Math.sin(u) * Math.sin(v) * 1.1, Math.cos(u) * 1.1];
  };
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      quad(sphere(i, j), sphere(i + 1, j), sphere(i + 1, j + 1), sphere(i, j + 1));
    }
  }
  // The handle: a torus standing beside the body, so it passes in front of and
  // behind it as the view rotates.
  const torus = (i: number, j: number): V3 => {
    const u = (2 * Math.PI * i) / n;
    const v = (2 * Math.PI * j) / n;
    const r = 0.62 + 0.16 * Math.cos(v);
    return [r * Math.cos(u) + 1.35, 0.16 * Math.sin(v), r * Math.sin(u)];
  };
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      quad(torus(i, j), torus(i + 1, j), torus(i + 1, j + 1), torus(i, j + 1));
    }
  }
  return out;
}

const BRAILLE_BASE = 0x2800;
const DOT_BIT = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];

/** The braille frame a coverage mask draws, at 2×4 dots per cell. */
function brailleFrame(hit: Uint8Array, w: number, h: number): readonly string[] {
  const rows: string[] = [];
  for (let cy = 0; cy < h / 4; cy += 1) {
    let line = "";
    for (let cx = 0; cx < w / 2; cx += 1) {
      let bits = 0;
      for (let dy = 0; dy < 4; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          if (hit[(cy * 4 + dy) * w + cx * 2 + dx] === 1) bits |= DOT_BIT[dy * 2 + dx] ?? 0;
        }
      }
      line += String.fromCharCode(BRAILLE_BASE + bits);
    }
    rows.push(line.replace(/\s+$/u, ""));
  }
  return rows;
}

/** How many of a cell's eight dots the reference says are covered. */
function cellCoverage(ref: Raster, cellsX: number, cellsY: number): Int32Array {
  const out = new Int32Array(cellsX * cellsY);
  const sx = ref.w / (cellsX * 2);
  const sy = ref.h / (cellsY * 4);
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      let n = 0;
      for (let dy = 0; dy < 4; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const x = Math.min(ref.w - 1, Math.floor((cx * 2 + dx + 0.5) * sx));
          const y = Math.min(ref.h - 1, Math.floor((cy * 4 + dy + 0.5) * sy));
          if (ref.hit[y * ref.w + x] === 1) n += 1;
        }
      }
      out[cy * cellsX + cx] = n;
    }
  }
  return out;
}

function measure(name: string, tris: readonly Tri[], azim: number, elev: number): Record<string, number> {
  // The reference: the SVG path's own default size.
  const ref = raster(tris, 640, 320, azim, elev);
  // The cell grid: 80×24 cells is 160×96 dots, which is the note's figure.
  const cell = raster(tris, 160, 96, azim, elev);

  const refHit = ref.hit.reduce((n, v) => n + v, 0);
  const cellHit = cell.hit.reduce((n, v) => n + v, 0);

  // **Distinct shades.** The reference quantises to 8-bit luminance; a braille
  // cell without colour carries coverage only, which is nine levels.
  const refShades = new Set<number>();
  for (const [i, v] of ref.shade.entries()) if (ref.hit[i] === 1) refShades.add(Math.round(v * 255));

  // **The silhouette.** A cell whose eight dots are partly covered is a cell
  // that must choose, and every such cell is a place the outline is guessed.
  const cov = cellCoverage(ref, 80, 24);
  let interior = 0;
  let partial = 0;
  for (const n of cov) {
    if (n === 8) interior += 1;
    else if (n > 0) partial += 1;
  }

  // **Occlusion.** How much of the surface is hidden behind itself, measured as
  // fragments the z-buffer rejected, at both resolutions.
  // **Counted during rasterisation, not inferred afterwards.** The first form
  // compared triangle *vertices* against covered *pixels* and came out at
  // **-538%** — a number from a broken computation, which is the one kind that
  // must never reach a report. A fragment is occluded when it lands on a pixel
  // something already covered; that is the only reading the z-buffer has.
  const occlusion = (r: Raster): number => {
    let total = 0;
    for (let i = 0; i < r.hit.length; i += 1) if (r.hit[i] === 1) total += 1;
    return total === 0 ? 0 : r.hidden / (r.hidden + total);
  };

  writeFileSync(`${OUT}/3d-${name}-silhouette.txt`, brailleFrame(cell.hit, 160, 96).join("\n"), "utf8");

  // **The frame that actually decides, because coverage is not a picture.** A
  // filled silhouette says *where* the object is and nothing about its form.
  // Shading has to come from somewhere, and with no colour the only channel
  // left is dot density — so the dots are spent on the shade and the silhouette
  // is whatever falls out of it. Ordered-dithered against the same 8×8 Bayer
  // matrix the image block uses, so this is the arm that already ships.
  const bayer = (x: number, y: number): number => {
    let v = 0;
    let mask = 4;
    let shift = 0;
    for (let i = 0; i < 3; i += 1) {
      const bx = (x >> (2 - i)) & 1;
      const by = (y >> (2 - i)) & 1;
      v |= ((by * 2) ^ (bx * 3 * by + bx)) << (4 - 2 * i);
      void mask;
      void shift;
    }
    return (v + 0.5) / 64;
  };
  const shaded = new Uint8Array(160 * 96);
  for (let i = 0; i < shaded.length; i += 1) {
    if (cell.hit[i] !== 1) continue;
    const x = i % 160;
    const y = Math.floor(i / 160);
    shaded[i] = (cell.shade[i] ?? 0) > bayer(x, y) ? 1 : 0;
  }
  writeFileSync(`${OUT}/3d-${name}-shaded.txt`, brailleFrame(shaded, 160, 96).join("\n"), "utf8");
  writeFileSync(
    `${OUT}/3d-${name}.svg`,
    [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320" width="640" height="320">`,
      `<rect width="100%" height="100%" fill="#0b0b0f"/>`,
      ...[...ref.shade.entries()]
        .filter(([i]) => ref.hit[i] === 1)
        .map(([i, v]) => {
          const g = Math.round(Math.min(1, v) * 255);
          return `<rect x="${i % 640}" y="${Math.floor(i / 640)}" width="1" height="1" fill="rgb(${g},${g},${Math.min(255, g + 22)})"/>`;
        }),
      `</svg>`,
    ].join(""),
    "utf8",
  );

  return {
    refCovered: refHit,
    cellCovered: cellHit,
    spatialRatio: Math.round((refHit / Math.max(1, cellHit)) * 10) / 10,
    refShades: refShades.size,
    brailleShades: 9,
    interiorCells: interior,
    partialCells: partial,
    partialShare: Math.round((partial / Math.max(1, partial + interior)) * 1000) / 10,
    occlusionRef: Math.round(occlusion(ref) * 1000) / 10,
    occlusionCell: Math.round(occlusion(cell) * 1000) / 10,
  };
}

describe("phase 4 · the opening measurement", () => {
  it("counts what the cell grid loses, on a surface and on a self-occluding body", () => {
    const s = measure("surface", surface(48), Math.PI / 4, Math.PI / 6);
    const t = measure("body", bodyAndHandle(40), Math.PI / 3, Math.PI / 7);
    for (const [name, m] of [["surface", s], ["body+handle", t]] as const) {
      console.log(`\n[${name}]`);
      for (const [k, v] of Object.entries(m)) console.log(`  ${k.padEnd(16)} ${String(v)}`);
    }
    expect(s["refCovered"], "the reference drew something").toBeGreaterThan(1000);
    expect(t["refCovered"]).toBeGreaterThan(1000);
  });
});
