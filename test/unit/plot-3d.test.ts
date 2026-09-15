// C12 §3al — the projection's degenerates, the sample grid and the depth buffer.
//
// **Written before the implementation, and PR1 before the rest.** Four of the
// five degenerate cases are loud: a divide by zero gives `Infinity`, then `NaN`,
// and everything downstream stops. The fifth draws a **plausible** picture — a
// sample behind the eye divides to a finite coordinate inside the frame — so it
// is invisible to a bounds assertion and to a frame read, and it is the one an
// implementation written test-last would ship.
import { describe, expect, it } from "vitest";

import { block, CAMERA_DEFAULT, type Plot } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/definition.js";
import { geometryOf, surfacePoints } from "../../src/presentation/plot/surface3.js";
import type { RenderScratch } from "../../src/presentation/blocks/types.js";
import { measurable } from "../support/render.js";
import {
  basisOf,
  boundsOf,
  createDepth,
  extentOf,
  project,
  unionOf,
  AREA_ROWS,
  sampleGrid,
  unitOf,
  writeDepth,
  type Projected,
  type Vec3,
} from "../../src/presentation/plot/project3.js";

/** A cell is 8.41 x 16 px, so a plot area of `w x h` cells is this wide against tall. */
const ASPECT = (w: number, h: number): number => (w * 8.41) / (h * 16);

const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const finite = (n: number): boolean => Number.isFinite(n);

describe("C12 I86 — the projection's degenerate cases", () => {
  it("PR1 (C12 I86): a sample behind the eye is culled, and its coordinate would have been IN BOUNDS", () => {
    // **The first row written, because it is the only one that draws something.**
    // The default camera looks at the origin from `azimuth π/4, elevation π/6,
    // distance 10`. A sample four units behind the eye has a negative view `z`;
    // dividing by it mirrors the point through the origin into a finite `(x, y)`.
    const basis = basisOf(CAMERA_DEFAULT, ASPECT(80, 24));

    // The control first: a sample in front projects, or this row is asserting
    // that a broken projector culls everything.
    const front = project(basis, at(0, 0, 0));
    expect(front, "the control projects").not.toBeNull();

    // The subject. `eye` is where the camera is; twice that is four units the
    // other side of it along the same line.
    const behind = at(basis.eye.x * 2, basis.eye.y * 2, basis.eye.z * 2);
    expect(project(basis, behind), "a sample behind the eye is culled").toBeNull();

    // **And this is what makes the row necessary rather than obvious.** Without
    // the cull the divide gives a coordinate *inside the frame*, so a rule of
    // the form *every projected sample is within [0,1]* is satisfied by the
    // defect. Computed here the way an unculled projector would, and asserted
    // to be in range — the assertion is that the WRONG answer looks right.
    const d = behind;
    const rel = { x: d.x - basis.eye.x, y: d.y - basis.eye.y, z: d.z - basis.eye.z };
    const vz = rel.x * basis.forward.x + rel.y * basis.forward.y + rel.z * basis.forward.z;
    const vx = rel.x * basis.right.x + rel.y * basis.right.y + rel.z * basis.right.z;
    expect(vz, "it really is behind").toBeLessThan(0);
    const unculled = ((vx * basis.f) / basis.aspect / vz) * 0.5 + 0.5;
    expect(finite(unculled), "and the wrong answer is finite").toBe(true);
    expect(unculled, "and inside the frame, which is why bounds cannot see it").toBeGreaterThan(0);
    expect(unculled, "and inside the frame").toBeLessThan(1);
  });

  it("PR2 (C12 I86): a sample at the eye is culled rather than dividing by zero", () => {
    const basis = basisOf(CAMERA_DEFAULT, ASPECT(80, 24));
    expect(project(basis, basis.eye), "the eye itself").toBeNull();

    // Its control: one unit in front of the eye, which is past the near plane.
    const ahead = at(
      basis.eye.x + basis.forward.x,
      basis.eye.y + basis.forward.y,
      basis.eye.z + basis.forward.z,
    );
    const p = project(basis, ahead);
    expect(p, "a sample past the near plane projects").not.toBeNull();
    expect(finite(p?.x ?? NaN) && finite(p?.y ?? NaN), "and it is finite").toBe(true);
  });

  it("PR3 (C12 I86): a camera at distance zero draws nothing, and is not refused", () => {
    // The eye sits on the target, so every sample is at or behind the near
    // plane. An empty picture is what standing inside the data looks like.
    const basis = basisOf({ ...CAMERA_DEFAULT, distance: 0 }, ASPECT(80, 24));
    const cube: readonly Vec3[] = [
      at(-1, -1, -1), at(1, -1, -1), at(-1, 1, -1), at(1, 1, -1),
      at(-1, -1, 1), at(1, -1, 1), at(-1, 1, 1), at(1, 1, 1), at(0, 0, 0),
    ];
    expect(cube.map((p) => project(basis, p)), "every sample culled").toEqual(cube.map(() => null));
  });

  it("PR4 (C12 I86): coplanar data maps its zero axis to the CENTRE, and draws a line", () => {
    // z is constant, so its extent is zero. **Over the set rather than element
    // zero**: a collapse-onto-the-first mutation survives a row that checks one.
    const plane: readonly Vec3[] = [at(-2, -3, 5), at(4, -3, 5), at(4, 7, 5), at(-2, 7, 5)];
    const e = extentOf(plane);
    const unit = plane.map((p) => unitOf(p, e));

    expect(unit.every((p) => p.z === 0), "every sample at the axis's centre").toBe(true);
    expect(unit.every((p) => finite(p.x) && finite(p.y) && finite(p.z)), "and none is NaN").toBe(true);
    // The live axes still spread, or the rule has flattened the wrong thing.
    expect(new Set(unit.map((p) => p.x)).size, "x still spreads").toBeGreaterThan(1);
    expect(new Set(unit.map((p) => p.y)).size, "y still spreads").toBeGreaterThan(1);
  });

  it("PR5 (C12 I86): collinear is zero on two axes and coincident is zero on three", () => {
    // **Two cases in one row and three rows would be better** — but the count of
    // degenerate axes is the whole difference, and a parameterised row tests
    // whichever value it is given last. Both sets are asserted here in full.
    const line: readonly Vec3[] = [at(-2, 4, 9), at(0, 4, 9), at(6, 4, 9)];
    const lu = line.map((p) => unitOf(p, extentOf(line)));
    expect(lu.every((p) => p.y === 0 && p.z === 0), "two axes at the centre").toBe(true);
    expect(new Set(lu.map((p) => p.x)).size, "and one still spreads").toBe(3);

    const dot: readonly Vec3[] = [at(3, 3, 3), at(3, 3, 3), at(3, 3, 3)];
    const du = dot.map((p) => unitOf(p, extentOf(dot)));
    expect(du, "all three at the centre").toEqual([at(0, 0, 0), at(0, 0, 0), at(0, 0, 0)]);
    expect(du.every((p) => finite(p.x) && finite(p.y) && finite(p.z)), "and none is NaN").toBe(true);
  });

  it("PR6 (C12 I86, §4): a plane viewed edge-on projects to a LINE, and the line is not axis-aligned", () => {
    // **A different zero from PR4, and this row took three drafts.** The first
    // asserted *a zero extent on one screen axis*; the second over-corrected to
    // *both screen axes spread*; both were true of the plane they were written
    // against and false of the family. Measured over five in-plane directions,
    // collinearity holds in all of them and a zero screen extent in two — so it
    // is a special case of the image being a line rather than the rule, and the
    // spec sentence was corrected rather than the test bent to fit it.
    //
    // **The plane is built from the basis**, spanned by `forward` and a
    // direction halfway between `right` and `up`: it therefore contains the eye
    // — which is what edge-on means — and its image is diagonal.
    //
    // **The camera is pinned rather than defaulted, and F440 is why.** This row
    // built its plane against `CAMERA_DEFAULT` and spans +/-3 along the view
    // axis, which was comfortably inside the frustum at a distance of 10 and put
    // one control point **behind the near plane** the day the default became 6.
    // Nothing about the projection changed; a framing constant moved under a
    // geometry fixture. The rules this row asserts do not depend on where the
    // default camera stands, so it says where its own stands.
    const basis = basisOf({ ...CAMERA_DEFAULT, distance: 10 }, ASPECT(80, 24));
    const h = Math.SQRT1_2;
    const d: Vec3 = {
      x: basis.right.x * h + basis.up.x * h,
      y: basis.right.y * h + basis.up.y * h,
      z: basis.right.z * h + basis.up.z * h,
    };
    const on = (s2: number, t: number): Vec3 => ({
      x: d.x * s2 + basis.forward.x * t,
      y: d.y * s2 + basis.forward.y * t,
      z: d.z * s2 + basis.forward.z * t,
    });
    const plane: readonly Vec3[] = [on(-1, -3), on(1, -3), on(1, 3), on(-1, 3)];

    /** Twice the triangle's area — zero exactly when three points are collinear. */
    const area2 = (a: Projected, b: Projected, c: Projected): number =>
      Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));

    const shown = plane.map((q) => project(basis, q)).filter((q) => q !== null);
    expect(shown.length, "the whole figure is in front of the camera").toBe(4);

    // **Every triple, not the first.** Three collinear points say nothing about a
    // fourth, and element zero is the degenerate member of any such check.
    const a0 = shown[0] as Projected;
    const a1 = shown[1] as Projected;
    for (let i = 2; i < shown.length; i += 1) {
      expect(area2(a0, a1, shown[i] as Projected), `triple 0,1,${String(i)} is collinear`).toBeCloseTo(0, 9);
    }

    // **And the line is diagonal**, which is what says collinearity is the claim
    // rather than a zero extent on one screen axis.
    const spread = (vs: readonly number[]): number => Math.max(...vs) - Math.min(...vs);
    expect(spread(shown.map((q) => q.x)), "screen x spreads").toBeGreaterThan(0.01);
    expect(spread(shown.map((q) => q.y)), "and so does screen y").toBeGreaterThan(0.01);

    // **The control: a plane the eye is NOT in must not be collinear**, or this
    // row passes against a projector that flattens everything.
    const off = plane.map((q) => project(basis, { x: q.x, y: q.y, z: q.z + 2 * (q.x + 1) }))
      .filter((q) => q !== null);
    expect(off.length, "still in front").toBe(4);
    expect(area2(off[0] as Projected, off[1] as Projected, off[2] as Projected), "and it is a figure, not a line")
      .toBeGreaterThan(1e-4);
  });
});

describe("C12 I84 — the sample grid and the depth buffer", () => {
  it("PR7 (C12 I84): the grid is width x 1 by height x 2, at three widths and two heights", () => {
    // **Three widths and two heights, because 80x48 is a measurement of a rule
    // and not a constant.** The control is that the two rungs disagree: a
    // function returning a fixed pair satisfies either arm alone.
    for (const [w, h] of [[80, 24], [120, 30], [40, 8], [80, 30], [120, 24], [40, 24]] as const) {
      // **One grid, and its absence of a rung is the assertion** (F498). This
      // row asserted `w × h·2` for half blocks against `w·2 × h·4` for braille,
      // because those were two rasters at two resolutions. The silhouette
      // alphabet took the half rung onto the dot grid — one buffer, one depth
      // test, `kind` naming which primitive owns a sample — so a grid that still
      // varied by rung would be describing a distinction the renderer no longer
      // has, and every constant written to compensate for it was a defect the
      // day it went away.
      expect(sampleGrid(w, h), `the sub-cell grid at ${String(w)}x${String(h)}`)
        .toEqual({ width: w * 2, height: h * AREA_ROWS });
    }
    // **The measurement's own figure, restated at the grid it now returns.**
    // 80×24 cells was `80 × 48` when a cell held two samples down; it is
    // `160 × 192` at two across and `AREA_ROWS` down, and the point of the row
    // is unchanged — the number is a measurement of the rule at one size and
    // not a constant anything may assume.
    expect(sampleGrid(80, 24), "the measurement's own figure")
      .toEqual({ width: 160, height: 24 * AREA_ROWS });
  });

  it("PR8 (C12 I84, C12 I11): the depth buffer is allocated per render, not reused", () => {
    // **The row exists before the optimisation does.** C12 I11 permits a local
    // buffer and forbids one that survives, and a module-level scratch array is
    // what a 30fps orbit invites — while SS24's pattern is `let|var` and cannot
    // see one declared `const`.
    const a = createDepth(4, 4);
    writeDepth(a, 1, 1, 0.5);
    expect(a.z[1 * 4 + 1], "the write landed").toBe(0.5);

    const b = createDepth(4, 4);

    // **The assertion is NON-INTERFERENCE, and the first draft asserted a
    // proxy.** It required `b.z !== a.z` and `b` cleared to `+Infinity`, and the
    // mutation pass walked through both: a scratch array handed out as
    // `SCRATCH.subarray(0, n)` returns a **fresh view object** every call, so the
    // identity check passes, and the mutation's own `fill` clears the view, so
    // the `Infinity` check passes. Two green assertions over one shared buffer.
    //
    // What a shared buffer cannot survive is an **earlier** render still being
    // readable: allocating `b` wipes the memory `a` is looking at.
    expect(a.z[1 * 4 + 1], "allocating a second buffer did not disturb the first").toBe(0.5);

    // Kept beside it rather than instead of it: identity is a necessary
    // condition and the row above is the sufficient one.
    expect(b.z, "a distinct buffer").not.toBe(a.z);
    expect([...b.z].every((v) => v === Infinity), "cleared to +Infinity").toBe(true);
  });

  it("PR8b (C12 I84): the depth test keeps the nearer sample and is idempotent at equal depth", () => {
    const d = createDepth(2, 2);
    expect(writeDepth(d, 0, 0, 5), "the first write wins").toBe(true);
    expect(writeDepth(d, 0, 0, 9), "a farther one does not").toBe(false);
    expect(writeDepth(d, 0, 0, 1), "a nearer one does").toBe(true);
    expect(writeDepth(d, 0, 0, 1), "and an equal one does not, so a tie is stable").toBe(false);
    expect(d.z[0], "the nearest depth held").toBe(1);

    // Out of bounds is ignored rather than throwing, which is `setDot`'s rule
    // one file over — a rasteriser that has to bounds-check every call is a
    // rasteriser with the check in the wrong place.
    expect(writeDepth(d, -1, 0, 0), "left of the grid").toBe(false);
    expect(writeDepth(d, 0, 2, 0), "below it").toBe(false);
  });

  it("PR9 (C12 I106, F503): the two arms agree exactly at the target plane and diverge either side", () => {
    // **An equality, not a bound.** Every wrong scale that happens to fit is
    // inside a bound, and this arm's own containment held on the golden frames
    // for as long as it shipped with no scale at all.
    const camera = { azimuth: Math.PI / 4, elevation: 0.3, distance: 6 };
    const persp = basisOf({ ...camera, projection: "perspective" }, 1);
    const ortho = basisOf({ ...camera, projection: "orthographic" }, 1);

    // A point *on* the target plane: its view depth is exactly `distance`,
    // which is the one place the two divisors are the same number.
    //
    // **Displaced inside the plane, and the first draft was not.** A point on
    // the view axis has a zero `up` and a zero `right` component, so both arms
    // answer `0.5` whatever either divides by — the row passed against the
    // scale-free arm it was written to kill. A test must construct the state it
    // claims, and the convenient point is the one where every scale agrees.
    const onPlane: Vec3 = {
      x: persp.eye.x + persp.forward.x * camera.distance + persp.up.x * 0.8 + persp.right.x * 0.5,
      y: persp.eye.y + persp.forward.y * camera.distance + persp.up.y * 0.8 + persp.right.y * 0.5,
      z: persp.eye.z + persp.forward.z * camera.distance + persp.up.z * 0.8 + persp.right.z * 0.5,
    };
    const a = project(persp, onPlane);
    const b = project(ortho, onPlane);
    expect(a, "the target plane is in front of the eye").not.toBeNull();
    expect(b).not.toBeNull();
    expect((a as Projected).depth, "and its depth is the distance").toBeCloseTo(camera.distance, 6);
    expect((b as Projected).x, "x agrees at the plane").toBeCloseTo((a as Projected).x, 12);
    expect((b as Projected).y, "y agrees at the plane").toBeCloseTo((a as Projected).y, 12);

    // Either side of it they must not agree, or the arms are one arm.
    for (const k of [0.5, 2]) {
      const off: Vec3 = {
        x: persp.eye.x + persp.forward.x * camera.distance * k + persp.up.x * 0.6,
        y: persp.eye.y + persp.forward.y * camera.distance * k + persp.up.y * 0.6,
        z: persp.eye.z + persp.forward.z * camera.distance * k + persp.up.z * 0.6,
      };
      const pa = project(persp, off);
      const pb = project(ortho, off);
      expect(pa).not.toBeNull();
      expect(pb).not.toBeNull();
      expect(
        Math.abs((pa as Projected).y - (pb as Projected).y),
        `off the plane at ${String(k)}x the arms separate`,
      ).toBeGreaterThan(1e-3);
      expect(
        (pa as Projected).y !== 0.5 && (pb as Projected).y !== 0.5,
        "and neither sits on the view axis, where any two scales agree",
      ).toBe(true);
    }
  });

  it("PR9b (C12 I106, F503): `distance` frames the orthographic arm, and the cube fits", () => {
    // **The half that shipped broken.** The survivor this kills is a projection
    // that ignores `distance`, and it passed every containment assertion the
    // suite had, because it was out of bounds by the same amount every time.
    const corners: Vec3[] = [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) => [-1, 1].map((z) => ({ x, y, z }))));
    const spanAt = (distance: number): number => {
      const basis = basisOf({ azimuth: Math.PI / 4, elevation: 0.3, distance, projection: "orthographic" }, 1);
      const ys = corners.map((c) => project(basis, c)).filter((p): p is Projected => p !== null).map((p) => p.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    const near = spanAt(4);
    const far = spanAt(20);
    expect(near, "moving back shrinks the figure").toBeGreaterThan(far);
    // Measured `-0.187 … 1.187` — span 1.373 — at every distance before the fix.
    expect(far, "and at 20 the cube is comfortably inside the plot").toBeLessThan(0.5);
    expect(spanAt(4) / spanAt(8), "the scale is exactly reciprocal in distance").toBeCloseTo(2, 9);
  });
});

describe("C12 I107 — the geometry scratch", () => {
  /**
   * A `RenderScratch` that counts, because **the build count is what the row is
   * about and elapsed time is not** — a timing assertion is what F507 is about.
   * `set` is called exactly once per build, so `writes` *is* the number of times
   * `geometryOf` ran.
   *
   * One slot per owner, which is the implementation the invariant names and the
   * cheapest thing that can be wrong in the right direction: a store keeping
   * every key would pass every row here and leak.
   */
  const counting = (): RenderScratch & { writes: () => number; reads: () => number; writesTo: (owner: object) => number } => {
    const held = new WeakMap<object, { key: string; value: unknown }>();
    const perOwner = new WeakMap<object, number>();
    let writes = 0;
    let reads = 0;
    return {
      get: (owner, key) => {
        reads += 1;
        const slot = held.get(owner);
        return slot !== undefined && slot.key === key ? slot.value : undefined;
      },
      set: (owner, key, value) => {
        writes += 1;
        perOwner.set(owner, (perOwner.get(owner) ?? 0) + 1);
        held.set(owner, { key, value });
      },
      writes: () => writes,
      reads: () => reads,
      // **Per owner, because I126 gives a cloud its own slot** — a total counts
      // the cloud's write beside the surface's, and the row is about the surface.
      writesTo: (owner) => perOwner.get(owner) ?? 0,
    };
  };

  /** The bunny is not needed and a 9x9 grid is: the row counts builds, not milliseconds. */
  const MESH = Object.freeze({
    vertices: Array.from({ length: 81 }, (_v, i) => ({ // cells-ok — a vertex count
      x: ((i % 9) / 4) - 1, // cells-ok — a vertex index
      y: (Math.floor(i / 9) / 4) - 1, // cells-ok — a vertex index
      z: Math.sin((i % 9) / 2) * Math.cos(Math.floor(i / 9) / 2), // cells-ok — a vertex index
    })),
    faces: Array.from({ length: 64 }, (_v, k) => { // cells-ok — a cell count
      const r = Math.floor(k / 8); // cells-ok — a cell index
      const c = k % 8; // cells-ok — a cell index
      const a = r * 9 + c; // cells-ok — a vertex offset
      return [a, a + 1, a + 9] as [number, number, number];
    }),
  });

  const plot = (over: Record<string, unknown> = {}): Plot =>
    block({
      kind: "plot",
      id: "pr10",
      form: "plot3d",
      height: 12,
      series: [],
      axes3: false,
      box3: "none",
      colormap: "viridis",
      camera: { azimuth: Math.PI / 4, elevation: 0.3, distance: 6 },
      surfaces3: [{ vertices: MESH.vertices, faces: MESH.faces, closed: true }],
      ...over,
    } as unknown as Plot);

  const kit = (scratch?: RenderScratch) =>
    measurable({
      definitions: [plotDefinition],
      ...(scratch === undefined ? {} : { scratch }),
    });

  it("PR10 (C12 I107): the camera moves, the triangles are built once, and the frame is unchanged", () => {
    // **The control comes first and it is the row's real claim**: a cache whose
    // absence changes a picture is not a cache. Both cameras are rendered with
    // and without the scratch and the bytes must agree, or nothing below means
    // anything.
    const here = plot();
    const there = plot({ camera: { azimuth: Math.PI / 4 + 0.4, elevation: 0.3, distance: 6 } });
    const bare = kit();
    const coldHere = bare.renderToLines(here, 60);
    const coldThere = bare.renderToLines(there, 60);
    expect(coldHere, "the two cameras draw different pictures").not.toEqual(coldThere);

    const s = counting();
    const warm = kit(s);
    expect(warm.renderToLines(here, 60), "the scratch changes no byte").toEqual(coldHere);
    expect(warm.renderToLines(there, 60), "at either camera").toEqual(coldThere);

    // **The assertion the whole entry exists for** (§6o row 5). Two cameras,
    // one build — the carriers did not move and the camera is not one of
    // `geometryOf`'s arguments.
    expect(s.writes(), "two cameras, one build").toBe(1);
  });

  it("PR10b (C12 I107): a new surface around the same arrays hits, and a moved extent misses", () => {
    const s = counting();
    const warm = kit(s);
    warm.renderToLines(plot(), 60);
    expect(s.writes(), "the first render builds").toBe(1);

    // **The live path** (§6o row 2). C23 I34 replaces a part's block every tick,
    // so the surface is a new wrapper around the same two arrays. Keyed on the
    // wrapper this misses and the cache buys nothing where it renders most.
    warm.renderToLines(plot(), 60);
    expect(s.writes(), "a fresh Surface3 around the same carriers still hits").toBe(1);

    // **The row nothing else would find** (§6o row 1). The extent is taken over
    // every carrier, so a cloud beside the surface moves the surface's own
    // triangles. Keyed on the surface alone this hits and draws the figure at
    // the wrong scale, inside the box, with every arithmetic assertion passing.
    warm.renderToLines(plot({ points3: [{ points: [{ x: 9, y: 9, z: 9 }] }] }), 60);
    expect(s.writesTo(MESH.faces), "a cloud gaining a point moves the extent, so the surface misses").toBe(2);
    // The third write is the cloud's own slot (C12 I126), not a second miss.
    expect(s.writes(), "the surface twice and the cloud once").toBe(3);
  });

  it("PR10c (C12 I107): two surfaces in one block do not share a slot", () => {
    // **`series` is in the key** (§6o row 6). It is written into every `Tri3`
    // and read by `colourOf`, so a shared slot colours the second surface as the
    // first — and the two carriers are distinct objects here, which is what
    // makes this a test of the key rather than of the WeakMap.
    const second = {
      vertices: MESH.vertices.map((v) => ({ ...v, z: v.z + 0.5 })),
      faces: MESH.faces.map((f) => [...f] as [number, number, number]),
    };
    const s = counting();
    kit(s).renderToLines(
      plot({ surfaces3: [
        { vertices: MESH.vertices, faces: MESH.faces, closed: true },
        { vertices: second.vertices, faces: second.faces, closed: true },
      ] }),
      60,
    );
    expect(s.writes(), "one slot each").toBe(2);
  });
});

describe("C12 I127 — the span over referenced vertices", () => {
  const counting = (): RenderScratch & { writes: () => number } => {
    const held = new WeakMap<object, { key: string; value: unknown }>();
    let writes = 0;
    return {
      get: (owner, key) => {
        const slot = held.get(owner);
        return slot !== undefined && slot.key === key ? slot.value : undefined;
      },
      set: (owner, key, value) => { writes += 1; held.set(owner, { key, value }); },
      writes: () => writes,
    };
  };
  /** The 9×9 grid PR10 uses; its faces reference 80 of the 81 vertices, so a stray already exists (index 80) and a second is added on purpose. */
  const VERTICES = Array.from({ length: 81 }, (_v, i) => ({ // cells-ok — a vertex count
    x: ((i % 9) / 4) - 1, // cells-ok — a vertex index
    y: (Math.floor(i / 9) / 4) - 1, // cells-ok — a vertex index
    z: Math.sin((i % 9) / 2) * Math.cos(Math.floor(i / 9) / 2), // cells-ok — a vertex index
  }));
  const FACES = Array.from({ length: 64 }, (_v, k) => { // cells-ok — a cell count
    const r = Math.floor(k / 8); // cells-ok — a cell index
    const c = k % 8; // cells-ok — a cell index
    const a = r * 9 + c; // cells-ok — a vertex offset
    return [a, a + 1, a + 9] as [number, number, number];
  });
  const CAMERA = { azimuth: Math.PI / 4, elevation: 0.3, distance: 6 };
  const referenced = new Set(FACES.flat());
  const zs = VERTICES.map((v) => v.z);
  const zLo = Math.min(...zs);
  const zHi = Math.max(...zs);
  /**
   * The stray: inside the mesh's own extent so the extent is unchanged with or
   * without it, and **nearer the eye than every referenced vertex** so a span
   * that read every vertex would move the depth ramp. Chosen among the cube's
   * near corners by measuring, and the precondition is asserted, because a row
   * whose fabricated violation could not have moved the frame proves nothing.
   */
  const extent = extentOf(VERTICES);
  const basis = basisOf(CAMERA, 1);
  const depthOf = (p: { x: number; y: number; z: number }): number => project(basis, unitOf(p, extent))?.depth ?? Infinity;
  const candidates = [-0.999, 0.999].flatMap((x) => [-0.999, 0.999].flatMap((y) => [zLo + 1e-6, zHi - 1e-6].map((z) => ({ x, y, z }))));
  const STRAY = candidates.reduce((best, c) => (depthOf(c) < depthOf(best) ? c : best));
  const nearestReferenced = Math.min(...[...referenced].map((k) => depthOf(VERTICES[k] as { x: number; y: number; z: number })));

  const plot = (surface: Record<string, unknown>, over: Record<string, unknown> = {}): Plot =>
    block({
      kind: "plot", id: "pr12", form: "plot3d", height: 12, series: [], axes3: false, box3: "none",
      colormap: "viridis", colourBy: "depth", camera: CAMERA,
      surfaces3: [{ faces: FACES, closed: true, ...surface }],
      ...over,
    } as unknown as Plot);
  const kit = (scratch?: RenderScratch) =>
    measurable({ definitions: [plotDefinition], ...(scratch === undefined ? {} : { scratch }) });

  it("PR12 (C12 I127): a stray vertex no face references is in the extent and not in the span — the frame equals the mesh without it", () => {
    expect(depthOf(STRAY), "the stray is nearer than every referenced vertex").toBeLessThan(nearestReferenced);
    const withStray = [...VERTICES, STRAY];
    expect(extentOf(withStray), "and inside the extent, so the extent is unchanged").toStrictEqual(extent);
    const bare = kit();
    const alone = bare.renderToLines(plot({ vertices: VERTICES }), 60);
    expect(bare.renderToLines(plot({ vertices: withStray }), 60), "a span over every vertex would move the depth ramp; this one does not").toEqual(alone);
    // The same through the scratch, which holds the referenced set beside the triangles.
    expect(kit(counting()).renderToLines(plot({ vertices: withStray }), 60)).toEqual(alone);
  });

  it("PR12b (C12 I127, §6o row 15): geometryOf holds one corner per distinct referenced vertex, the triangles' own p objects, the stray absent, and the orbit's write count unchanged", () => {
    const surface = { vertices: [...VERTICES, STRAY], faces: FACES, closed: true } as const;
    const g = geometryOf(surface as never, extentOf(surfacePoints(surface as never)), 0);
    expect(g.corners.length, "one per distinct referenced vertex").toBe(referenced.size); // cells-ok — a vertex count
    const held = new Set<object>();
    for (const t of g.tris) { held.add(t.a.p); held.add(t.b.p); held.add(t.c.p); }
    expect(held.size, "the triangles hold exactly that many distinct positions").toBe(referenced.size); // cells-ok — a vertex count
    for (const c of g.corners) expect(held.has(c.p), "a corner's p is the very object a triangle holds").toBe(true);
    const strayUnit = unitOf(STRAY, extentOf(surfacePoints(surface as never)));
    expect(g.corners.some((c) => c.p.x === strayUnit.x && c.p.y === strayUnit.y && c.p.z === strayUnit.z), "the stray is not a corner").toBe(false);
    expect(g.corners.some((c) => c.v !== undefined), "a mesh without values carries none").toBe(false);

    const s = counting();
    const warm = kit(s);
    warm.renderToLines(plot({ vertices: VERTICES }), 60);
    warm.renderToLines(plot({ vertices: VERTICES }, { camera: { ...CAMERA, azimuth: CAMERA.azimuth + 0.4 } }), 60);
    expect(s.writes(), "two cameras, one build — the second resident costs no write").toBe(1);
  });
});

describe("C12 I126 — the extent scratch", () => {
  const counting = (): RenderScratch & { writes: () => number; writesTo: (owner: object) => number } => {
    const held = new WeakMap<object, { key: string; value: unknown }>();
    const perOwner = new WeakMap<object, number>();
    let writes = 0;
    return {
      get: (owner, key) => {
        const slot = held.get(owner);
        return slot !== undefined && slot.key === key ? slot.value : undefined;
      },
      set: (owner, key, value) => {
        writes += 1;
        perOwner.set(owner, (perOwner.get(owner) ?? 0) + 1);
        held.set(owner, { key, value });
      },
      writes: () => writes,
      writesTo: (owner) => perOwner.get(owner) ?? 0,
    };
  };

  /** A 9×9 mesh, the same shape PR10 uses; the rows count writes, not milliseconds. */
  const MESH = Object.freeze({
    vertices: Array.from({ length: 81 }, (_v, i) => ({ // cells-ok — a vertex count
      x: ((i % 9) / 4) - 1, // cells-ok — a vertex index
      y: (Math.floor(i / 9) / 4) - 1, // cells-ok — a vertex index
      z: Math.sin((i % 9) / 2) * Math.cos(Math.floor(i / 9) / 2), // cells-ok — a vertex index
    })),
    faces: Array.from({ length: 64 }, (_v, k) => { // cells-ok — a cell count
      const r = Math.floor(k / 8); // cells-ok — a cell index
      const c = k % 8; // cells-ok — a cell index
      const a = r * 9 + c; // cells-ok — a vertex offset
      return [a, a + 1, a + 9] as [number, number, number];
    }),
  });
  /** A 5×5 height field — one carrier, which is the row 11 shape. */
  const HEIGHTS: readonly (readonly number[])[] = Object.freeze(
    Array.from({ length: 5 }, (_r, j) => Object.freeze(Array.from({ length: 5 }, (_c, i) => Math.sin(i) * Math.cos(j)))), // cells-ok — a grid
  );
  const CLOUD = Object.freeze([{ x: 0.2, y: -0.4, z: 0.6 }, { x: -0.7, y: 0.1, z: -0.3 }, { x: 0.5, y: 0.5, z: 0.5 }]);
  const PATH = Object.freeze([{ x: -0.9, y: -0.9, z: 0 }, { x: 0, y: 0.3, z: 0.4 }, { x: 0.8, y: -0.2, z: -0.6 }]);
  const EMPTY: readonly { x: number; y: number; z: number }[] = Object.freeze([]);
  const FAR = { azimuth: Math.PI / 4 + 0.4, elevation: 0.3, distance: 6 };

  const plot = (over: Record<string, unknown> = {}): Plot =>
    block({
      kind: "plot",
      id: "pr11",
      form: "plot3d",
      height: 12,
      series: [],
      axes3: false,
      box3: "none",
      colormap: "viridis",
      camera: { azimuth: Math.PI / 4, elevation: 0.3, distance: 6 },
      ...over,
    } as unknown as Plot);

  const kit = (scratch?: RenderScratch) =>
    measurable({
      definitions: [plotDefinition],
      ...(scratch === undefined ? {} : { scratch }),
    });

  it("PR11 (C12 I126): the extent scratch changes no byte over a cloud, a path, a mesh and an empty cloud at two cameras, and each carrier is written once", () => {
    const carriers = {
      points3: [{ points: CLOUD }, { points: EMPTY }],
      lines3: [{ points: PATH }],
      surfaces3: [{ vertices: MESH.vertices, faces: MESH.faces, closed: true }],
    };
    const here = plot(carriers);
    const there = plot({ ...carriers, camera: FAR });
    const bare = kit();
    const coldHere = bare.renderToLines(here, 60);
    const coldThere = bare.renderToLines(there, 60);
    expect(coldHere, "the two cameras draw different pictures").not.toEqual(coldThere);

    // **The control first**: a cache whose absence changes a picture is not a cache.
    const s = counting();
    const warm = kit(s);
    expect(warm.renderToLines(here, 60), "the scratch changes no byte").toEqual(coldHere);
    expect(warm.renderToLines(there, 60), "at either camera").toEqual(coldThere);

    // **Each carrier once, and the empty cloud takes no slot** (§6o row 12).
    expect(s.writesTo(CLOUD), "the cloud's points").toBe(1);
    expect(s.writesTo(PATH), "the path's points").toBe(1);
    expect(s.writesTo(MESH.faces), "the surface's triangle owner").toBe(1);
    expect(s.writesTo(EMPTY), "an empty carrier holds nothing").toBe(0);
    expect(s.writes(), "three writes, no fourth").toBe(3);
  });

  it("PR11b (C12 I126, §6o row 12): an empty carrier contributes nothing — a surface beside an empty cloud renders as the surface alone, and the unit cube's corners as points move the frame", () => {
    // A mesh inside [−1, 1] already spans the cube; scale it into [0, 0.5] so a
    // unit-cube contribution would be visible as a smaller figure inside the box.
    const small = Object.freeze({
      vertices: MESH.vertices.map((v) => ({ x: v.x / 4 + 0.25, y: v.y / 4 + 0.25, z: v.z / 4 + 0.25 })),
      faces: MESH.faces.map((f) => [...f] as [number, number, number]),
    });
    const alone = plot({ surfaces3: [{ vertices: small.vertices, faces: small.faces, closed: true }] });
    const beside = plot({
      surfaces3: [{ vertices: small.vertices, faces: small.faces, closed: true }],
      points3: [{ points: EMPTY }],
    });
    const bare = kit();
    const reference = bare.renderToLines(alone, 60);
    expect(bare.renderToLines(beside, 60), "an empty cloud is invisible, without the scratch").toEqual(reference);
    expect(kit(counting()).renderToLines(beside, 60), "and with it").toEqual(reference);

    // **The fabricated violation, at the union**: what the frame would be if an
    // empty carrier contributed the unit cube.
    const cube = plot({
      surfaces3: [{ vertices: small.vertices, faces: small.faces, closed: true }],
      points3: [{ points: [{ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }], marker: "none" }],
    });
    expect(bare.renderToLines(cube, 60), "the unit cube in the extent shrinks the figure").not.toEqual(reference);
  });

  it("PR11c (C12 I126, §6o rows 10, 11, 13): a height field has one slot and one write per build; a cloud gaining a point rebuilds the geometry inside the held slot and the frame equals the bare frame", () => {
    const field = (over: Record<string, unknown> = {}): Plot =>
      plot({ surfaces3: [{ heights: HEIGHTS, xRange: [0, 1], yRange: [0, 1] }], ...over });
    const s = counting();
    const warm = kit(s);
    const bare = kit();

    expect(warm.renderToLines(field(), 60), "cold, byte-identical").toEqual(bare.renderToLines(field(), 60));
    expect(s.writesTo(HEIGHTS), "one carrier, one slot, one write").toBe(1);
    expect(s.writes(), "and nothing else written").toBe(1);

    expect(warm.renderToLines(field({ camera: FAR }), 60), "a second camera, byte-identical")
      .toEqual(bare.renderToLines(field({ camera: FAR }), 60));
    expect(s.writes(), "the camera writes nothing").toBe(1);

    // **The block extent moves under a cloud** — the slot is still valid (its
    // carriers and ranges did not move), the geometry inside it is not.
    const cloud = [{ x: 3, y: 3, z: 3 }];
    const moved = field({ points3: [{ points: cloud }] });
    expect(warm.renderToLines(moved, 60), "rebuilt inside the held slot — asserted on the frame")
      .toEqual(bare.renderToLines(moved, 60));
    expect(s.writesTo(HEIGHTS), "one more write, carrying the new geometry").toBe(2);
    expect(s.writesTo(cloud), "and the cloud's own").toBe(1);
  });

  it("PR11d (C12 I126): xRange moved on a height field misses and matches the bare frame; a new Surface3 around the same heights and ranges hits", () => {
    const field = (xRange: readonly [number, number]): Plot =>
      plot({ surfaces3: [{ heights: HEIGHTS, xRange, yRange: [0, 1] }] });
    const s = counting();
    const warm = kit(s);
    const bare = kit();
    warm.renderToLines(field([0, 1]), 60);
    expect(s.writesTo(HEIGHTS), "cold").toBe(1);

    const wide = field([0, 2]);
    expect(warm.renderToLines(wide, 60), "the range is in the key, and the frame is the bare one")
      .toEqual(bare.renderToLines(wide, 60));
    expect(s.writesTo(HEIGHTS), "a moved range misses").toBe(2);

    // **The live path** (§6o row 2): a fresh wrapper, the same carrier and ranges.
    warm.renderToLines(field([0, 2]), 60);
    expect(s.writesTo(HEIGHTS), "a new Surface3 around the same heights hits").toBe(2);
  });

  it("PR11e (C12 I126, §6o row 12): the union over per-carrier bounds equals extentOf over the concatenation to the bit, and boundsOf([]) is undefined", () => {
    expect(boundsOf([]), "never the unit cube").toBeUndefined();
    expect(unionOf(undefined, undefined), "the union of nothing").toBeUndefined();

    const sets: (readonly { x: number; y: number; z: number }[])[] = [
      [],
      [{ x: -0, y: 0, z: 1 }],
      [{ x: 0, y: -0, z: -1 }, { x: 0, y: -0, z: -1 }],
      [{ x: 2.5, y: -3.25, z: 0.125 }, { x: -2.5, y: 3.25, z: -0.125 }, { x: 1e-9, y: 1e9, z: -1e-9 }],
      [{ x: Number.NaN, y: 4, z: 4 }],
      [],
      [{ x: 7, y: -7, z: 0.3 }],
    ];
    // Every prefix, and every pair — the fold's order is the thing under test.
    for (let n = 0; n <= sets.length; n += 1) { // cells-ok — a set count
      const chosen = sets.slice(0, n);
      const folded = chosen.reduce<ReturnType<typeof boundsOf>>((acc, set) => unionOf(acc, boundsOf(set)), undefined);
      const together = extentOf(chosen.flat());
      expect(folded ?? extentOf([]), `over the first ${String(n)} sets`).toStrictEqual(together);
      // `toStrictEqual` treats −0 and 0 as different, which is what "to the bit" means here.
    }
  });
});
