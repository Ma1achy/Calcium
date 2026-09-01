// C12 §3al — the projection's degenerates, the sample grid and the depth buffer.
//
// **Written before the implementation, and PR1 before the rest.** Four of the
// five degenerate cases are loud: a divide by zero gives `Infinity`, then `NaN`,
// and everything downstream stops. The fifth draws a **plausible** picture — a
// sample behind the eye divides to a finite coordinate inside the frame — so it
// is invisible to a bounds assertion and to a frame read, and it is the one an
// implementation written test-last would ship.
import { describe, expect, it } from "vitest";

import { CAMERA_DEFAULT } from "../../src/data/viewmodel/index.js";
import {
  basisOf,
  createDepth,
  extentOf,
  project,
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
      expect(sampleGrid(w, h, "half"), `half at ${String(w)}x${String(h)}`).toEqual({ width: w, height: h * 2 });
      expect(sampleGrid(w, h, "braille"), `braille at ${String(w)}x${String(h)}`).toEqual({ width: w * 2, height: h * 4 });
    }
    expect(sampleGrid(80, 24, "half"), "the measurement's own figure").toEqual({ width: 80, height: 48 });
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
});
