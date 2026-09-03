/**
 * RM1–RM6 — the three real meshes (C12 I97, §6k).
 *
 * **The walk ran before these fixtures existed and two of the design note's
 * three reasons for the meshes did not survive it.** They carry no degenerate
 * faces and no inconsistently wound edges; what they carry, and what nothing
 * named, is **openness** — 1,036, 223 and 42 boundary edges. So every row here
 * asserts what the meshes have rather than what they were chosen for, and RM3
 * is the row that states the difference outright.
 *
 * **The orientation is the loader's** (F476). OBJ has no up-axis, all three
 * files are Y-up, and `basisOf` builds its eye about `z` — so a mesh loaded
 * unchanged lies on its back, and at these sizes it reads as a plausible solid.
 * `test/support/obj.ts` rotates once, with the hole counts that say so.
 */
import { describe, expect, it } from "vitest";

import { basisOf, createDepth, extentOf } from "../../src/presentation/plot/project3.js";
import {
  backfaceCulled,
  drawTri,
  lightDirOf,
  surfacePoints,
  trianglesOf,
  type Tri3,
} from "../../src/presentation/plot/surface3.js";
import { loadMesh, MESHES, parseObj, type MeshName } from "../support/obj.js";
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

const inked = (rows: readonly string[]): number =>
  rows.map((r) => strip(r)).join("").replace(/\s/gu, "").length; // cells-ok — a cell count
const text = (rows: readonly string[]): string => rows.map(strip).join("\n");
const colours = (rows: readonly string[]): number => {
  const set = new Set<string>();
  for (const line of rows)
    for (const run of runsOf(line))
      for (const ch of [...run.text]) if (ch !== " ") set.add(run.colour ?? "none");
  return set.size;
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
  height: 24,
  series: [],
  axes3: false,
  box3: "none",
  colormap: "viridis",
  ...over,
});

const NAMES = ["teapot", "stanford-bunny", "suzanne"] as const;
const REF = { azimuth: 0.5, elevation: 0.3, distance: 6 } as const;

const surfaceOf = (name: MeshName, over: Record<string, unknown> = {}): Record<string, unknown> => {
  const m = loadMesh(name);
  return { vertices: m.vertices, faces: m.faces, ...over };
};

const shot = (
  s: Record<string, unknown>,
  camera: Record<string, number> = REF,
  width = 120,
  height = 24,
): readonly string[] => frame(bare({ surfaces3: [s], camera, height }), capsFor("24bit"), width, "rm");

const trisOf = (s: Record<string, unknown>): readonly Tri3[] => {
  const surf = s as unknown as Parameters<typeof trianglesOf>[0];
  return trianglesOf(surf, extentOf(surfacePoints(surf)), 0);
};

/** Edges of a triangle soup, counted by how many faces use them and which way. */
const edgesOf = (
  faces: readonly (readonly [number, number, number])[],
): { boundary: number; nonManifold: number; inconsistent: number; consistent: number } => {
  const seen = new Map<string, { fwd: number; rev: number }>();
  for (const [a, b, c] of faces) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = p < q ? `${String(p)},${String(q)}` : `${String(q)},${String(p)}`;
      const e = seen.get(key) ?? { fwd: 0, rev: 0 };
      if (p < q) e.fwd += 1;
      else e.rev += 1;
      seen.set(key, e);
    }
  }
  let boundary = 0; // cells-ok — an edge count
  let nonManifold = 0; // cells-ok — an edge count
  let inconsistent = 0; // cells-ok — an edge count
  let consistent = 0; // cells-ok — an edge count
  for (const e of seen.values()) {
    const n = e.fwd + e.rev; // cells-ok — a use count
    if (n === 1) boundary += 1; // cells-ok — an edge count
    else if (n > 2) nonManifold += 1; // cells-ok — an edge count
    else if (e.fwd === 1 && e.rev === 1) consistent += 1; // cells-ok — an edge count
    else inconsistent += 1; // cells-ok — an edge count
  }
  return { boundary, nonManifold, inconsistent, consistent };
};

describe("plot — the real meshes", () => {
  it("RM1 (C12 I97, §6k row 1): each mesh loads to its digest and is drawn upright", () => {
    // **The digest first, because a fixture read from disk is an instrument.**
    // `loadMesh` throws on a mismatch, so reaching the assertions below is
    // itself the check; the counts are here so a *silently different* mesh —
    // one whose digest was updated with it — still fails.
    const sizes: Record<MeshName, readonly [number, number]> = {
      teapot: [3644, 6320],
      "stanford-bunny": [35947, 69451],
      suzanne: [507, 968],
    };
    for (const name of NAMES) {
      const m = loadMesh(name);
      expect([m.vertices.length, m.faces.length], name).toEqual(sizes[name]);
      expect(MESHES[name], `${name} digest is recorded`).toMatch(/^[0-9a-f]{64}$/u);
    }

    // **The orientation, and it cannot be read off an ink count** (F476). A
    // solid and the same solid on its back ink within a few percent of each
    // other and both look plausible. What separates them is the interior
    // holes, because a silhouette along an axis of near-symmetry has none.
    const asIs: Record<MeshName, number> = { teapot: 0, "stanford-bunny": 0, suzanne: 0 };
    for (const name of NAMES) {
      const m = loadMesh(name);
      // Undo the loader's rotation to get the file's own orientation back.
      const back = {
        vertices: m.vertices.map((v) => ({ x: v.x, y: v.z, z: -v.y })),
        faces: m.faces,
        closed: true,
      };
      asIs[name] = holes(shot(back));
      expect(holes(shot(surfaceOf(name, { closed: true }))), `${name} upright`).toBeLessThanOrEqual(1);
    }
    expect(asIs["stanford-bunny"], "and on its back the bunny is full of holes").toBeGreaterThan(10);
    expect(asIs.suzanne, "as is Suzanne").toBeGreaterThan(3);
  });

  it("RM2 (C12 I97, §6k row 2): the silhouette needs rows, and widening is not a substitute", () => {
    // **The note's *wrong is instantly visible* needs a size and gives none.**
    // A transcript block is 12 to 20 rows; a recognisable teapot wants about 24.
    const teapot = surfaceOf("teapot", { closed: true });
    const cam = { azimuth: Math.PI, elevation: 0.2, distance: 6 };
    const at = (height: number, width: number): number => inked(shot(teapot, cam, width, height));

    const grown = [12, 20, 32, 48].map((h) => at(h, h * 5));
    for (let i = 1; i < grown.length; i += 1) {
      expect(grown[i] as number, `height ${String([12, 20, 32, 48][i])} draws more`).toBeGreaterThan(
        grown[i - 1] as number,
      );
    }

    // **And the half a reader would try instead**: the figure is aspect-bound
    // to the height (§3p), so four times the columns is the same teapot.
    expect(at(24, 240), "widening changes nothing").toBe(at(24, 120));
  });

  it("RM3 (C12 I97, I95, §6k rows 3 and 6): what the meshes have is not what they were chosen for", () => {
    // **The row that states the difference outright** (F475). Two of the design
    // note's three reasons are false of all three meshes, and the property
    // present in all three is the one it never named.
    const boundary: Record<MeshName, number> = { teapot: 1036, "stanford-bunny": 223, suzanne: 42 };
    for (const name of NAMES) {
      const m = loadMesh(name);
      const e = edgesOf(m.faces);
      expect(e.inconsistent, `${name} is consistently wound`).toBe(0);
      expect(e.boundary, `${name} is open`).toBe(boundary[name]);

      const ts = trisOf(surfaceOf(name, { closed: true }));
      expect(ts.filter((t) => Math.hypot(t.fn.x, t.fn.y, t.fn.z) < 1e-12).length, `${name} degenerate`).toBe(0);
      // And the orientation the volume gives, which is what `closed` reads.
      expect(ts[0]?.skin.cull, `${name} is oriented outward`).toBe(1);
    }
  });

  it("RM4 (C12 I97, I95, I105, §6k row 4): the cull cannot be witnessed by the closed-looking mesh", () => {
    // **The pair is the assertion.** On the bunny `closed: true` drops more than
    // a third of the faces and the frame does not move — every culled face was
    // behind one that draws, so the depth test would have rejected it anyway. A
    // cull row driven by the bunny alone passes against a cull that does
    // nothing at all.
    const basis = basisOf(REF as never, 120 / 48);
    const bunny = surfaceOf("stanford-bunny", { closed: true });
    const ts = trisOf(bunny);
    const culled = ts.filter((t) => backfaceCulled(t, basis)).length;
    expect(culled / ts.length, "a third of the bunny is culled").toBeGreaterThan(0.33);
    // **Three cells of 234, and the three are the finding** (F502).
    //
    // This asserted the frames were *identical*, which held while a cell carried
    // two sample rows and stopped holding at eight: the silhouette is where a
    // closed mesh's front and back faces meet tangentially, so their projected
    // extents are equal only in the limit and at finite sampling one of them
    // reaches a sample further. Culling it moves that cell by an eighth. The
    // ladder made a difference visible that the old alphabet quantised away.
    //
    // One of the three is a cell *disappearing*, which no amount of sampling
    // explains — a back face was the only thing covering it. The Stanford bunny
    // is **not watertight**; it has holes in the base, and `closed: true` is a
    // claim the caller makes rather than one the mesh keeps.
    //
    // The row's point is untouched and is why it is stated as a fraction: 3 of
    // 234 is not a witness. A cull that did nothing at all would also pass here,
    // which is what the open meshes below are for.
    const before = [...text(shot(surfaceOf("stanford-bunny")))];
    const after = [...text(shot(bunny))];
    const moved = after.filter((ch, i) => ch !== before[i]).length; // cells-ok — a cell count
    const inkedBefore = before.filter((ch) => ch !== " " && ch !== "\n").length; // cells-ok — a cell count
    expect(after.length, "the frames are the same size").toBe(before.length); // cells-ok — a cell count
    expect(moved / inkedBefore, "and the frame barely moves").toBeLessThan(0.05);

    // **The open meshes are where it shows**, which is what the fixture has to
    // be: the interior surface visible through the spout and the eye sockets.
    for (const name of ["teapot", "suzanne"] as const) {
      expect(text(shot(surfaceOf(name, { closed: true }))), `${name} moves`).not.toBe(
        text(shot(surfaceOf(name))),
      );
    }
  });

  it("RM5 (C12 I97, §6k row 7): Suzanne shades flat and smooth over the same geometry", () => {
    // **The note's one surviving claim**, and asserted as *same cells, different
    // colours* rather than as a count — a mutation moving both arms cannot
    // satisfy the first half, and one removing the shading cannot satisfy the
    // second.
    const at = (shading: "flat" | "smooth"): readonly string[] =>
      frame(
        bare({
          surfaces3: [surfaceOf("suzanne", { closed: true, shading })],
          camera: REF,
          colourBy: "series",
        }),
        capsFor("24bit"),
        120,
        "rm5",
      );
    const flat = at("flat");
    const smooth = at("smooth");
    expect(inked(smooth), "the same geometry").toBe(inked(flat));
    expect(colours(smooth), "and a different shading").not.toBe(colours(flat));
  });

  it("RM6 (C12 I97, §6k row 5): a triangle count is the wrong unit for the budget", () => {
    // **Counted, not timed** (F478). The claim is that the budget tracks
    // depth-tested samples rather than triangles, and a millisecond figure is a
    // machine's — so this counts the samples each mesh actually writes at one
    // grid, which is deterministic and is the quantity the claim is about.
    const grid = { width: 120, height: 48 };
    const writes = (s: Record<string, unknown>): number => {
      const basis = basisOf(REF as never, grid.width / grid.height);
      const depth = createDepth(grid.width, grid.height);
      const light = lightDirOf(undefined, basis);
      let n = 0; // cells-ok — a sample count
      for (const t of trisOf(s)) {
        drawTri(t, basis, grid, depth, light, { nearD: 4, farD: 8 }, () => {
          n += 1; // cells-ok — a sample count
        });
      }
      return n;
    };

    // A subdivided grid at the same triangle count: 2 × 186² = 69,192.
    const n = 187;
    const heights = Array.from({ length: n }, (_, j) => // cells-ok — a grid index
      Array.from({ length: n }, (_, i) => // cells-ok — a grid index
        Math.sin((i / n) * 6) * Math.cos((j / n) * 6), // cells-ok — a grid index
      ),
    );
    const synthetic = { heights, xRange: [-2, 2], yRange: [-2, 2] };
    const bunny = surfaceOf("stanford-bunny", { closed: true });

    expect(trisOf(bunny).length, "the bunny's triangles").toBe(69451);
    expect(trisOf(synthetic).length, "and the grid's, within 0.4%").toBe(69192);

    // **The counts are equal and the work is not — in the direction that
    // surprises.** `drawTri`'s callback fires only for samples that *win* the
    // depth test, so this counts the frame's output rather than its cost: the
    // bunny is a closed body whose far side is rejected everywhere, and its
    // 69,451 triangles are sub-pixel and overlap. It produces a **sixth** of
    // the grid's surviving samples while costing 1.56x the time (F478's
    // protocol: same frame, three warm calls, median of five). So the budget is
    // proportional to neither the triangle count nor the output, and the work
    // is in the samples that lose.
    const ratio = writes(bunny) / writes(synthetic);
    expect(ratio, "the real mesh produces far fewer surviving samples").toBeLessThan(0.5);
    expect(ratio, "and not none of them").toBeGreaterThan(0.05);
  });

  it("RM7 (C12 I97, I104, C04 I79, §6k row 9): the teapot read in colour, and the stripped control cannot", () => {
    // **The picture is the colour on this rung.** The half-block arm paints `▀`
    // in every inked cell and puts both colours in the SGR, so a text frame
    // carries one character class and everything else is in the escape codes.
    const rows = shot(surfaceOf("teapot", { closed: true }), {
      azimuth: Math.PI,
      elevation: 0.2,
      distance: 6,
    });

    // **The control first: stripped, the frame carries shape and no shading**
    // (F502).
    //
    // This said *one character class*, which was true of a raster that drew `▀`
    // in every inked cell. The silhouette alphabet gives a partial cell nine
    // levels, so a stripped teapot now carries **9** glyphs over 204 cells —
    // and every one of them is a block element saying how much of its cell the
    // surface covers. Not one of them says how brightly it is lit.
    //
    // So the control is restated in the terms that were always meant: the
    // glyphs are a small closed alphabet describing *coverage*, and a reader
    // holding them cannot tell the lit side from the dark one. The colour
    // assertions below are where the picture is.
    const BLOCKS = "▀▁▂▃▄▅▆▇█▌▐▖▗▘▝▚▞▙▟▛▜";
    const glyphs = new Set([...text(rows)].filter((c) => c !== " " && c !== "\n"));
    const inkedCells = [...text(rows)].filter((c) => c !== " " && c !== "\n").length; // cells-ok — a cell count
    for (const g of glyphs) expect(BLOCKS.includes(g), `${g} is a block element`).toBe(true);
    expect(glyphs.size * 10, "a closed alphabet, not a per-cell reading")
      .toBeLessThan(inkedCells); // cells-ok — a cell count

    // **The studio light's direction, read off the picture.** Up and to the
    // right of the figure's own centre against down and to the left — the one
    // statistic that says the shading is *right* rather than merely varied.
    const lit: { r: number; c: number; l: number }[] = [];
    rows.forEach((line, r) => {
      let col = 0; // cells-ok — a column index
      for (const run of runsOf(line)) {
        for (const ch of [...run.text]) {
          if (ch !== " ") {
            const m = /rgb\((\d+),(\d+),(\d+)\)/u.exec(run.colour ?? "");
            if (m !== null) {
              lit.push({
                r,
                c: col,
                l: 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]),
              });
            }
          }
          col += 1; // cells-ok — a column index
        }
      }
    });
    expect(lit.length, "the frame carries colour at all").toBeGreaterThan(80);

    const midR = lit.reduce((t, x) => t + x.r, 0) / lit.length;
    const midC = lit.reduce((t, x) => t + x.c, 0) / lit.length;
    const mean = (f: (x: { r: number; c: number }) => boolean): number => {
      const set = lit.filter(f);
      return set.reduce((t, x) => t + x.l, 0) / Math.max(1, set.length);
    };
    const upRight = mean((x) => x.r < midR && x.c > midC);
    const downLeft = mean((x) => x.r > midR && x.c < midC);
    // **Against the light's direction rather than a constant**: a light pointing
    // the other way fails, and a brighter light does not.
    expect(upRight / downLeft, "up and right is the lit side").toBeGreaterThan(1.2);
  });

  it("RM1 control (C12 I97): the parser is what the digest is protecting", () => {
    // **A digest over text nobody parses correctly protects nothing.** The two
    // things a naive OBJ reader gets wrong silently are `v/vt/vn` triples and
    // *negative* indices, which are relative to the vertices seen so far — get
    // that wrong and every face lands on one vertex and the mesh is a point.
    const m = parseObj(["v 0 0 0", "v 1 0 0", "v 0 1 0", "f -3/1/1 -2/2/2 -1/3/3"].join("\n"));
    expect(m.vertices.length).toBe(3);
    expect(m.faces).toEqual([[0, 1, 2]]);
    // And a quad fans from the first vertex, as the height-field arm does.
    const q = parseObj(["v 0 0 0", "v 1 0 0", "v 1 1 0", "v 0 1 0", "f 1 2 3 4"].join("\n"));
    expect(q.faces).toEqual([
      [0, 1, 2],
      [0, 2, 3],
    ]);
  });
});
