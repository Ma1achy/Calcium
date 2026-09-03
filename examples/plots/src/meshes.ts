/**
 * The three vendored meshes, loaded by the example rather than by the framework.
 *
 * **Calcium does not parse OBJ and should not.** `surfaces3` takes vertices and
 * faces; where they come from is the consumer's business, and a plot library
 * that grew a mesh loader would be answering a question nobody asked it. So this
 * file is what a real consumer has to write, and writing it is the point —
 * **a second consumer, built from the public surface, is an instrument**: the
 * framework's own fixtures import `test/support/obj.ts`, and anything that
 * module gets right on their behalf is a thing the published surface has never
 * been asked for.
 *
 * The assets are the same three files, vendored under `assets/meshes/` because a
 * consumer ships its own data and cannot reach into a dependency's test tree.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "meshes");

/**
 * The three, with the digest of the text each archive expands to.
 *
 * **A corrupt asset draws a plausible figure**, which is why the digest is here
 * and not left to a comment: a truncated OBJ parses to a smaller mesh rather
 * than to an error, and a smaller mesh is a picture. The framework's fixtures
 * check the same digests for the same reason.
 */
export const MESHES = Object.freeze({
  teapot: "1b5396fedd74b577e32cef41146582c2f2e1a050d5b4915193c0ac1ad4187ed4",
  bunny: "1eb35d1e21ce99e5ce911353b6be278990713448dd9e8f5c9387f9de39b32205",
  suzanne: "d8684326f9bd8cfc24d3d302c1042fa16f63d2e66e49ed56b413fa20bed271e6",
} as const);

/** Which archive holds each — `bunny` is shorter to type than the file's name. */
const FILE: Readonly<Record<MeshName, string>> = Object.freeze({
  teapot: "teapot",
  bunny: "stanford-bunny",
  suzanne: "suzanne",
});

export type MeshName = keyof typeof MESHES;

export type Mesh = Readonly<{
  vertices: readonly Readonly<{ x: number; y: number; z: number }>[];
  faces: readonly (readonly [number, number, number])[];
}>;

const cache = new Map<MeshName, Mesh>();

/**
 * Parse OBJ text — only `v` and `f`, which is all `surfaces3` reads.
 *
 * **Two details a naive reader gets wrong silently.** A face index may be
 * negative, and then it counts back from the vertices seen so far rather than
 * from the end — read as positive, every face lands on vertex `-1` and the mesh
 * draws as a point. And a face may have more than three corners, so it is fanned
 * into triangles here; dropped, a quad-based model loses most of its surface and
 * still draws something.
 */
export function parseObj(text: string): Mesh {
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

/**
 * **Y-up to Z-up, and a consumer hits this before it hits anything else.**
 *
 * OBJ carries no up-axis and the convention in all three files is Y-up;
 * `camera.elevation` is measured about **z**. Loaded unchanged, every mesh is
 * drawn lying on its back — and at the size a terminal gives you **it still
 * looks like a mesh**, which is the whole difficulty. A teapot on its side reads
 * as a plausible egg.
 *
 * The framework's own note records the measurement that settles it: the
 * silhouette's interior holes. A view along an axis of near-symmetry has none
 * and a view across the body has several — as loaded the bunny leaves 18 and
 * Suzanne 6, rotated they leave 0 and 1.
 */
const zUp = (m: Mesh): Mesh => ({
  vertices: m.vertices.map((v) => ({ x: v.x, y: -v.z, z: v.y })),
  faces: m.faces,
});

/**
 * Centred on the origin and scaled so the longest axis spans `[-1, 1]`.
 *
 * **One camera then frames all three**, which a catalogue needs and a fixture
 * does not: the teapot is about 6 units across in its own file and Suzanne
 * about 2.7, so a distance chosen for one puts the other off the plot or inside
 * the near plane. The framework has no opinion here — the extent is the data's,
 * so a consumer that wants comparable figures normalises them itself.
 */
function unitCube(m: Mesh): Mesh {
  if (m.vertices.length === 0) return m;
  let lo = { x: Infinity, y: Infinity, z: Infinity };
  let hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const v of m.vertices) {
    lo = { x: Math.min(lo.x, v.x), y: Math.min(lo.y, v.y), z: Math.min(lo.z, v.z) };
    hi = { x: Math.max(hi.x, v.x), y: Math.max(hi.y, v.y), z: Math.max(hi.z, v.z) };
  }
  const mid = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
  const span = Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) || 1;
  return {
    vertices: m.vertices.map((v) => ({
      x: ((v.x - mid.x) / span) * 2,
      y: ((v.y - mid.y) / span) * 2,
      z: ((v.z - mid.z) / span) * 2,
    })),
    faces: m.faces,
  };
}

/** One of the three, upright, centred and unit-scaled. Cached: the bunny is 69k faces. */
export function mesh(name: MeshName): Mesh {
  const held = cache.get(name);
  if (held !== undefined) return held;
  const text = gunzipSync(readFileSync(join(DIR, `${FILE[name]}.obj.gz`))).toString("utf8");
  const sha = createHash("sha256").update(text, "utf8").digest("hex");
  if (sha !== MESHES[name]) {
    throw new Error(`${FILE[name]}.obj.gz expands to ${sha}, not the recorded ${MESHES[name]}`);
  }
  const built = unitCube(zUp(parseObj(text)));
  cache.set(name, built);
  return built;
}
