/**
 * A Wavefront OBJ reader, **test-only and never in `src/`** — the design note's
 * §7 says so and the reason is that Calcium consumes a `Surface3`, not a file.
 *
 * **Positions and faces, and nothing else.** No normals, no materials, no
 * groups: `Surface3` derives its normals from the geometry (C12 I94) and its
 * colour from `field` or the ramp, so a `vn` line read here would be data the
 * renderer must then ignore. Faces of more than three vertices are fanned from
 * the first, which is the same triangulation the height-field arm uses.
 *
 * **Each mesh carries the sha256 of the text it decompresses to, and the loader
 * checks it.** The vendored files are gzipped — 887 KB against 2.6 MB — and
 * gzip's output is not reproducible across implementations, so the digest that
 * means anything is the one over the *content*. It is also the only link back
 * to the source: `SOURCES.md` records where each file came from and this is what
 * says the bytes are still those. An instrument that cannot fail cannot witness,
 * and a fixture read from disk is an instrument.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "fixtures", "meshes");

export type ObjMesh = Readonly<{
  vertices: readonly Readonly<{ x: number; y: number; z: number }>[];
  faces: readonly (readonly [number, number, number])[];
}>;

/** The three vendored meshes, with the digest of the text each expands to. */
export const MESHES = Object.freeze({
  teapot: "1b5396fedd74b577e32cef41146582c2f2e1a050d5b4915193c0ac1ad4187ed4",
  "stanford-bunny": "1eb35d1e21ce99e5ce911353b6be278990713448dd9e8f5c9387f9de39b32205",
  suzanne: "d8684326f9bd8cfc24d3d302c1042fa16f63d2e66e49ed56b413fa20bed271e6",
} as const);

export type MeshName = keyof typeof MESHES;

const cache = new Map<MeshName, ObjMesh>();

/** Parse OBJ text. Only `v` and `f` lines; `f` may name `v/vt/vn` triples. */
export function parseObj(text: string): ObjMesh {
  const vertices: { x: number; y: number; z: number }[] = [];
  const faces: [number, number, number][] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("v ")) {
      const p = line.trim().split(/\s+/u);
      vertices.push({ x: Number(p[1]), y: Number(p[2]), z: Number(p[3]) });
    } else if (line.startsWith("f ")) {
      const idx = line
        .trim()
        .split(/\s+/u)
        .slice(1)
        .map((t) => {
          // **Negative indices are relative to the vertices seen so far**, which
          // is the OBJ spec and the one detail a naive reader gets wrong
          // silently — every face lands on vertex `-1` and the mesh is a point.
          const n = Number((t.split("/")[0] ?? "0").trim());
          return n < 0 ? vertices.length + n : n - 1;
        });
      for (let k = 1; k + 1 < idx.length; k += 1) {
        faces.push([idx[0] as number, idx[k] as number, idx[k + 1] as number]);
      }
    }
  }
  return { vertices, faces };
}

/** A vendored mesh, checked against its recorded digest and cached. */
export function loadMesh(name: MeshName): ObjMesh {
  const held = cache.get(name);
  if (held !== undefined) return held;
  const text = gunzipSync(readFileSync(join(DIR, `${name}.obj.gz`))).toString("utf8");
  const sha = createHash("sha256").update(text, "utf8").digest("hex");
  if (sha !== MESHES[name]) {
    throw new Error(`${name}.obj.gz expands to ${sha}, not the recorded ${MESHES[name]}`);
  }
  const mesh = zUp(parseObj(text));
  cache.set(name, mesh);
  return mesh;
}

/**
 * **Y-up to Z-up, and it is not a convenience** (F476).
 *
 * OBJ carries no up-axis and the convention in every file here is Y-up;
 * `basisOf` builds its eye from `elevation` about **z**. Loaded unchanged, all
 * three meshes are drawn lying on their backs — and at the sizes this renderer
 * produces **you cannot tell**, which is the whole difficulty. The teapot on its
 * side inks 188 cells and reads as a plausible egg; upright it inks 192 and has
 * a lid knob. The measurement that settles it is the interior holes, because a
 * silhouette seen along an axis of near-symmetry has none and one seen across
 * the body has several: as-is the bunny leaves **18** and Suzanne **6**, and
 * rotated they leave **0** and **1**.
 *
 * So the rotation is applied here, once, with the numbers — rather than in each
 * fixture, where the next one added would inherit the default and nothing would
 * say so.
 */
const zUp = (m: ObjMesh): ObjMesh => ({
  vertices: m.vertices.map((v) => ({ x: v.x, y: -v.z, z: v.y })),
  faces: m.faces,
});
