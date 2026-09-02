// C12 I94 and C04 I79 — the surface carrier. Mutated.
//
// **Four of these eleven put back a defect that was in the tree during this
// step**, which is the point of anchoring them: the world-space normal against
// a view-space light (found by reading a frame, not by an assertion — the dot
// product of two unit vectors is in `[−1, 1]` whichever frames they are in, so
// the ambient floor holds and nothing is `NaN`), the fill that refuses to stroke
// a degenerate triangle, the intensity clamp that deletes seven eighths of the
// specular, and the extent that leaves the fourth carrier out.
//
// **And two are about a rule that reads correctly and is the wrong shape.** The
// carrier constant restored to a hand-widened pair of names, and the smooth
// accumulation restored to an average of unit normals by count — which loses the
// area weighting on faces of unequal size.
//
// **Five of these survived their first pass and none because the code was
// untested** (F459). Four ran on the input where the rule's two branches agree —
// a sphere whose faces are near-equal, a plane exactly edge-on, a block with a
// cloud already spanning the extent — and one was a row that recomputed the
// shading formula with the coefficients written out. The rows below name what
// each of them was moved to.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-surface3d.test.ts";
const F = "src/presentation/plot/surface3.ts";
const S = "src/presentation/plot/scatter3.ts";
const V = "src/data/viewmodel/validate.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: S,
    // Every triangle dropped. Ten of the eleven rows below read a rendered
    // surface or a refusal about one, so a pass in which no face can be drawn
    // cannot observe a kill.
    from: "  const lit = lightDirOf(block.light3, scene.basis);\n  for (const t of scene.tris) {",
    to: "  const lit = lightDirOf(block.light3, scene.basis);\n  for (const t of [] as typeof scene.tris) {",
    why: "every row reads a drawn surface or a refusal about one; a pass where no face draws sees nothing",
  },
  mutations: [
    {
      // **The normal left in world space** — the defect that was in the tree,
      // and the frame is what found it. `dot` of two unit vectors is in
      // `[−1, 1]` whichever frames they are in, so the ambient floor holds,
      // nothing is `NaN`, and every assertion about the intensity passes. What
      // it draws is a Gaussian with its peak at ambient and its rim lit.
      name: "the normal is dotted with the light in world space",
      file: F,
      from: "    n: viewDir(basis, w.n),",
      to: "    n: w.n,",
      // **SF3a and not SF3.** SF3 asserts smooth carries more shades than flat,
      // which is true under this defect — it survived that row, and the row it
      // needed is the one about the light's *direction* (F459).
      expect: "SF3a",
    },
    {
      // **The stroke arm removed** (§6h row 4). A barycentric fill writes
      // nothing when the projected area is zero — `1/area` is `−Infinity` and
      // every weight is `NaN` — so an edge-on plane vanishes rather than
      // keeping its line.
      name: "a degenerate triangle is filled rather than stroked",
      file: F,
      from: "  if (!(Math.abs(area) >= 1)) {\n    strokeThin(s, tri, e, grid, depth, light, span, paint);\n    return;\n  }",
      to: "  if (!(Math.abs(area) >= 1)) {\n    return;\n  }",
      expect: "SF1",
    },
    {
      // **The threshold at exact zero**, which is the version a reader writes
      // first. It leaves a discontinuity a hair before edge-on and fills a
      // dense mesh with holes, and it is the reason the rule is stated in
      // samples rather than as `!== 0`.
      name: "the stroke arm fires only at exactly zero area",
      file: F,
      from: "  if (!(Math.abs(area) >= 1)) {",
      to: "  if (area === 0) {",
      expect: "SF1",
    },
    {
      // **The intensity clamp doing the work** (F457). Restores `0.2 / 0.8 /
      // 0.4`, which sums to 1.4, so the clamp deletes 87.5% of the specular at
      // its own maximum — 0.0499 of 0.4000, three parts in 255 on viridis.
      name: "the shading terms sum to 1.4 again",
      file: F,
      from: "const AMBIENT = 0.2;\nconst DIFFUSE = 0.6;\nconst SPECULAR = 0.2;",
      to: "const AMBIENT = 0.2;\nconst DIFFUSE = 0.8;\nconst SPECULAR = 0.4;",
      expect: "SF4",
    },
    {
      // **`unit`'s zero rule undone** (F456). The design note's own remedy —
      // divide by the length — which is `NaN` on a face with no normal, and
      // every sample it touches then fails every comparison silently.
      name: "a zero-length normal divides by its length",
      file: "src/presentation/plot/project3.ts",
      from: "  return n === 0 ? a : { x: a.x / n, y: a.y / n, z: a.z / n };",
      to: "  return { x: a.x / n, y: a.y / n, z: a.z / n };",
      expect: "SF2",
    },
    {
      // **Smooth averaged by count rather than accumulated** (§6h row 6). Reads
      // as the same thing and is not: the raw cross products are area-weighted,
      // so a large face moves a shared vertex's normal more than a sliver — 13.7°
      // apart on an even grid and 49.2° at quintic column spacing.
      //
      // **It survived a sphere, which is what corrected the ruling's reason**
      // (F459). The reason given was the degenerate face, and `unit` returns the
      // zero vector unchanged, so that face contributes nothing under *either*
      // scheme: the reason named the one input on which the two options agree.
      name: "smooth normals are unit-averaged rather than accumulated",
      file: F,
      from: "      const n = faceN[f] as Vec3;\n      for (const k of idx[f] as readonly [number, number, number]) {",
      to: "      const n = unit(faceN[f] as Vec3);\n      for (const k of idx[f] as readonly [number, number, number]) {",
      expect: "SF3",
    },
    {
      // **Flat shading taking the vertex normals** — the default arm answering
      // for both, which is a member accepted and ignored.
      name: "`shading: \"flat\"` uses the vertex normals",
      file: F,
      from: "  const flat = s.shading === \"flat\";",
      to: "  const flat = false;",
      expect: "SF3",
    },
    {
      // **The extent leaving the fourth carrier out** (§6h row 10, and §6g
      // row 1 one carrier along). A surfaces-only block then normalises against
      // `extentOf([])`'s unit cube — on screen, in bounds, wrong scale.
      name: "the extent is taken without the surfaces",
      file: S,
      from: "  for (const sf of skins) for (const p of surfacePoints(sf)) all.push(p);",
      to: "  for (const sf of [] as typeof skins) for (const p of surfacePoints(sf)) all.push(p);",
      expect: "SF6",
    },
    {
      // **The carrier constant back to a hand-widened pair** (C04 I79, §6h
      // row 13). This is the shape the rule had for two carriers and it reads
      // as correct: a loss landscape is refused as a document with no data.
      name: "the gate reads two carrier names rather than the set",
      file: V,
      from: "const CARRIERS_3D = Object.freeze([\"points3\", \"lines3\", \"surfaces3\"] as const);",
      to: "const CARRIERS_3D = Object.freeze([\"points3\", \"lines3\"] as const);",
      expect: "T2.4h",
    },
    {
      // **The completeness walk not reaching the third carrier** (§6g row 3's
      // third instance). Passes T3.53 and T3.55 and every row derived from them.
      name: "the value walk covers two carriers",
      file: V,
      from: "  walkSurfaces3(sfs, by, at, e);",
      to: "  walkSurfaces3(sfs, undefined, at, e);",
      expect: "T3.58",
    },
    {
      // **The field read as the heights** (C04 I79). One member meaning both,
      // which draws a plausible picture at every input where they agree — and
      // they agree on every symmetric surface, which is most fixtures.
      name: "the field falls back to the heights before it is read",
      file: F,
      from: "  const src = s.field ?? s.heights;",
      to: "  const src = s.heights ?? s.field;",
      expect: "SF5",
    },

    // ---- step 7: the cull and the wireframe (C12 I95, C04 I80, §6i) --------

    {
      // **The view direction back to the constant** (§6i row 1). The design
      // note's own form, and it is the orthographic limit: the two disagree on
      // 7.29% of a sphere's faces at distance 6 and 34.03% at 1.5, and the
      // constant answers the *same* visible count at every distance because it
      // cannot read the eye's position.
      name: "the cull tests a view-space constant rather than the face's own direction",
      file: F,
      from: "  return dot(tri.fn, sub(c, basis.eye)) * tri.skin.cull > 0;",
      to: "  return dot(tri.fn, basis.forward) * tri.skin.cull > 0;",
      expect: "WF1",
    },
    {
      // **The winding trusted** (§6i row 3, F461). The obvious UV sphere is
      // wound inward at −4.16, so this culls the front and draws the back —
      // and two-sided shading lights it correctly, which is why the frame does
      // not say so.
      name: "`closed` trusts the caller's winding",
      file: F,
      from: "  return Math.abs(v) < VOLUME_EPS ? 0 : v < 0 ? -1 : 1;",
      to: "  return 1;",
      expect: "WF2",
    },
    {
      // **The degenerate-volume guard removed** (§6i row 5). A mesh whose
      // winding cancels its own volume then gets a sign from `1e-15` — a
      // confident answer read off floating-point noise.
      name: "a cancelled volume still orients the cull",
      file: F,
      from: "  return Math.abs(v) < VOLUME_EPS ? 0 : v < 0 ? -1 : 1;",
      to: "  return v < 0 ? -1 : 1;",
      expect: "WF3",
    },
    {
      // **`closed` accepted on a height field** (C04 I80, §6i row 6). T6.79's
      // named revert: the block type-checks, renders, and draws a *plausible*
      // surface with the underside of every fold culled away.
      name: "`closed` is accepted on the height-field arm",
      file: V,
      from: "    if (grid && sf[\"closed\"] !== undefined) {",
      to: "    if (false && sf[\"closed\"] !== undefined) {",
      expect: "WF4",
    },
    {
      // **The wireframe follows the triangulation** (§6i row 9). Every triangle
      // edge marked, so a height field's cell diagonals draw — 64 edges the
      // caller never drew on a 9×9, and no cell is legible.
      name: "a height field's cell diagonals are edges",
      file: F,
      from: "    out.push([true, true, false], [false, true, true]);",
      to: "    out.push([true, true, true], [true, true, true]);",
      expect: "WF5",
    },
    {
      // **The edge band wide enough to swallow the cells.** In samples rather
      // than as a fraction, so this is the same defect at any mesh density: the
      // interior disappears and the wireframe is the surface.
      name: "the edge band is three samples rather than 0.7",
      file: F,
      from: "const EDGE_HALF = 0.7;",
      to: "const EDGE_HALF = 3;",
      expect: "WF5",
    },
    {
      // **The cage turned see-through** (§6i row 11). `wireframe: true` stops
      // clearing its interior, so a point behind the surface draws through it —
      // and every assertion about the wireframe itself still passes.
      name: "`wireframe: true` does not clear the samples it claims",
      file: S,
      from: "      if (wire === true && !sm.edge) {",
      to: "      if (wire === \"over\" && !sm.edge) {",
      expect: "WF6",
    },
    {
      // **The edge no longer dims** (§6i row 13). An edge over its own face has
      // the same normal, so it takes the same colour and `\"over\"` draws
      // nothing — the defect the ratio exists to prevent.
      name: "an edge over the fill takes its face's own intensity",
      file: F,
      from: "const EDGE_DIM = 0.5;",
      to: "const EDGE_DIM = 1;",
      expect: "WF7",
    },
    {
      // **The clip's own edge marked** (§6i row 10). `clipNear` makes vertices
      // the caller never supplied, and passing the mask through unchanged draws
      // a seam across every face entering the camera.
      name: "a near-plane cut counts as one of the caller's edges",
      file: F,
      from: "      if (shared === 0) return false;",
      to: "      if (shared === 0) return true;",
      expect: "WF8",
    },
    {
      // **The cull reading a vertex normal** (§6i row 12). On a sphere the
      // vertex and face normals are close, so *something was culled* is
      // satisfied and the set is wrong at the silhouette.
      name: "the cull reads a shading normal rather than the face's",
      file: F,
      from: "  return dot(tri.fn, sub(c, basis.eye)) * tri.skin.cull > 0;",
      to: "  return dot(tri.a.n, sub(c, basis.eye)) * tri.skin.cull > 0;",
      expect: "WF9",
    },
  ],
});

console.log(report(results));
