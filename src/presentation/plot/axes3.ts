/**
 * The 3D reference frame — three lines, a wireframe box, and labels that turn
 * (C12 I90, I91, I92, §3an).
 *
 * **This is more work than the renderer it decorates.** The design note says so
 * and the build agreed: three projected lines whose labels stay legible in a
 * coordinate system the reader is moving.
 *
 * Everything here is in **normalised** space — the unit cube `[-1, 1]³` that
 * `unitOf` maps the data into (I86) — so nothing in this file knows what the
 * data means, and the box is the data's own extent rather than a niced one.
 */
import type { AxisSpec3, Plot } from "../../data/viewmodel/index.js";
import { formatReadout, niceAxis } from "./axes.js";
import { NEAR, project, type Basis, type Projected, type Vec3 } from "./project3.js";

/** The three axes, in the order they are drawn and named. */
export const AXES3 = ["x", "y", "z"] as const;
export type Axis3 = (typeof AXES3)[number];

const at3 = (v: Vec3, k: Axis3): number => (k === "x" ? v.x : k === "y" ? v.y : v.z);
const with3 = (v: Vec3, k: Axis3, n: number): Vec3 =>
  k === "x" ? { ...v, x: n } : k === "y" ? { ...v, y: n } : { ...v, z: n };

/**
 * The sign that decides a corner, **tied to the negative end at zero**
 * (C12 I90).
 *
 * `Math.sign(0)` is `0`, which names no corner at all — and at azimuth 0 the
 * eye's `y` is exactly zero. Without a tie a camera crossing the plane makes
 * the axes jump **twice**: once into the degenerate state and once out.
 */
const sgn = (v: number): number => (v < 0 ? -1 : 1);

/**
 * The three signs every placement here is derived from (C12 I90).
 *
 * **Three sign tests, not three dot products.** The design note asks for dot
 * products and in a world-aligned box `eye · x̂` *is* `eye.x` — saying so is the
 * difference between a rule a reader can check and one they have to trust.
 *
 * **One computation and two readings of it**, which is the F444 point kept: the
 * box's far corner and the axes' anchor are different corners and they are not
 * different derivations. Both are these three numbers, combined differently.
 */
export function signsOf(basis: Basis): Vec3 {
  return { x: sgn(basis.eye.x), y: sgn(basis.eye.y), z: sgn(basis.eye.z) };
}

/**
 * The box corner furthest from the eye — the three back faces meet here.
 */
export function farCorner(basis: Basis): Vec3 {
  const s3 = signsOf(basis);
  return { x: -s3.x, y: -s3.y, z: -s3.z };
}

/**
 * The corner the axes anchor at — **near in x and y, far in z** (C12 I90).
 *
 * **Not the far corner, and the design note's rule is wrong about which.** It
 * says *compute which of the eight box corners is furthest from the camera and
 * draw from there*, and the reason it gives is right — *so the axes never
 * occlude the data*. Measured at the default camera, the far corner projects to
 * screen **(0.500, 0.527)**: the exact centre of the figure. Axes drawn from it
 * run outward across the data, which is the opposite of the rule's purpose.
 *
 * **The silhouette is what the reason asks for.** The corner near in x and y and
 * far in z projects to **(0.500, 0.888)** — the bottom vertex of the cube's
 * outline — and the two bottom edges leaving it are the outline's lower left and
 * right. That is where every 3D library a reader has seen puts x and y, and it
 * is still three sign tests: the same three, combined differently.
 */
export function axisCorner(basis: Basis): Vec3 {
  const s3 = signsOf(basis);
  return { x: s3.x, y: s3.y, z: -s3.z };
}

/** A segment in normalised space. */
export type Seg3 = Readonly<{ a: Vec3; b: Vec3 }>;

/** The twelve edges of the unit cube, each as its two endpoints. */
function cubeEdges(): readonly Seg3[] {
  const out: Seg3[] = [];
  for (const k of AXES3) {
    const others = AXES3.filter((o) => o !== k);
    for (const s1 of [-1, 1]) {
      for (const s2 of [-1, 1]) {
        let lo: Vec3 = { x: 0, y: 0, z: 0 };
        lo = with3(lo, others[0] as Axis3, s1);
        lo = with3(lo, others[1] as Axis3, s2);
        out.push({ a: with3(lo, k, -1), b: with3(lo, k, 1) });
      }
    }
  }
  return out;
}

/**
 * The box's edges for a mode (C12 I90).
 *
 * **`"back"` is nine of twelve**, and the three it omits are the ones meeting
 * the **near** corner — an edge belongs to a back face exactly when one of its
 * two fixed coordinates is on the far side. Asserting a count of nine would be
 * satisfied by nine wrong edges, which is why AX2 asserts the omitted set.
 */
export function boxEdges(corner: Vec3, mode: NonNullable<Plot["box3"]>): readonly Seg3[] {
  if (mode === "none") return [];
  const all = cubeEdges();
  if (mode === "full") return all;
  return all.filter((e) => {
    // The two coordinates this edge holds fixed are the ones its endpoints agree on.
    const fixed = AXES3.filter((k) => at3(e.a, k) === at3(e.b, k));
    return fixed.some((k) => at3(e.a, k) === at3(corner, k));
  });
}

/**
 * Where coordinate zero sits, in normalised space (C04 I77).
 *
 * `"auto"` is the rule worth having: a range of `[2, 8]` puts the origin at the
 * corner because zero is not interesting, and `[-3, 5]` puts it at zero because
 * it is. **The data says which, and the caller overrides.**
 */
export function originOf(
  mode: NonNullable<Plot["origin3"]>,
  lo: Vec3,
  hi: Vec3,
): Vec3 {
  const norm = (v: number, a: number, b: number): number =>
    b === a ? 0 : Math.max(-1, Math.min(1, ((v - a) / (b - a)) * 2 - 1));
  if (typeof mode === "object") {
    return {
      x: norm(mode.x, lo.x, hi.x), y: norm(mode.y, lo.y, hi.y), z: norm(mode.z, lo.z, hi.z),
    };
  }
  if (mode === "centre") return { x: 0, y: 0, z: 0 };
  if (mode === "min") return { x: -1, y: -1, z: -1 };
  // `"auto"` — zero where the range straddles it, the minimum where it does not.
  const auto = (a: number, b: number): number => (a < 0 && b > 0 ? norm(0, a, b) : -1);
  return { x: auto(lo.x, hi.x), y: auto(lo.y, hi.y), z: auto(lo.z, hi.z) };
}

/** One axis line, with the point its ticks hang off. */
export type AxisLine = Readonly<{ axis: Axis3; seg: Seg3; outward: Vec3 }>;

/**
 * The three axis lines for a placement (C12 I90).
 *
 * At `"corner"` they are the three cube edges meeting the far corner, so the
 * frame sits behind the data. At `"origin"` and `"centre"` they cross at a
 * point and span the box, which is what a signed field needs — axes at the
 * corner put the reference frame nowhere near the thing it references.
 *
 * `outward` is the direction a tick points: away from the box on the axes the
 * other two hold fixed, which keeps it visually perpendicular as the camera
 * orbits.
 */
export function axisLines(
  placement: Exclude<NonNullable<Plot["axes3"]>, false>,
  basis: Basis,
  origin: Vec3,
): readonly AxisLine[] {
  const c = axisCorner(basis);
  // **The z axis takes a side edge and not the anchor's own**, because the
  // vertical edge at the bottom vertex is the one pointing at the reader: its
  // ticks would run into the figure and its labels would sit on top of it. The
  // two candidates are the outline's left and right verticals, and the left is
  // taken — a fixed side rather than a nearest, so the axis does not swap
  // sides mid-orbit for a difference of a fraction of a cell.
  const sides: readonly Vec3[] = [{ ...c, y: -c.y }, { ...c, x: -c.x }];
  const px = sides.map((v) => project(basis, v)?.x ?? 0.5);
  const zAt = ((px[0] as number) <= (px[1] as number) ? sides[0] : sides[1]) as Vec3;
  return AXES3.map((axis) => {
    const anchor = placement === "corner" ? (axis === "z" ? zAt : c) : origin;
    const base = with3(anchor, axis, 0);
    // **The tick points away from the box centre**, which keeps it visually
    // perpendicular as the camera orbits and puts the label outside the figure.
    // At `"origin"` and `"centre"` there is no outside, so it takes the same
    // direction the corner would have given: one rule, so a tick never means
    // two things.
    const from = placement === "corner" ? anchor : c;
    const out = AXES3.reduce<Vec3>(
      (acc, k) => (k === axis ? acc : with3(acc, k, at3(from, k))),
      { x: 0, y: 0, z: 0 },
    );
    return { axis, seg: { a: with3(base, axis, -1), b: with3(base, axis, 1) }, outward: out };
  });
}

/**
 * A segment projected, **clipped to the near plane rather than dropped**
 * (C12 I91).
 *
 * `project` refuses a point behind the near plane and an axis is not a point.
 * Dropping the segment makes the reference frame **vanish as the camera
 * approaches** — a legal frame, a self-consistent geometry, and no axes — which
 * is I86's plausible picture in a second place.
 *
 * `null` is *both endpoints behind*, which is the only case with nothing to
 * draw.
 *
 * **The two parameters come back with the pair** (C12 I93). A clip moves an
 * endpoint, so any reading carried along the segment — a polyline's per-point
 * `value` — has to be moved with it, and computing the same parameter a second
 * time at the call site is F444's shape: one rule, two derivations. `ta` and
 * `tb` are both measured from `a` toward `b`, so an unclipped segment is `0`
 * and `1` and the caller's interpolation needs no special case.
 */
export function clipProject(basis: Basis, seg: Seg3): Clipped | null {
  const view = (p: Vec3): number =>
    (p.x - basis.eye.x) * basis.forward.x
    + (p.y - basis.eye.y) * basis.forward.y
    + (p.z - basis.eye.z) * basis.forward.z;
  const za = view(seg.a);
  const zb = view(seg.b);
  if (za <= NEAR && zb <= NEAR) return null;
  const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
  });
  // **Just inside the plane, not on it, and the difference is the whole clip**
  // (F450). `project` culls on `z <= NEAR` — inclusive — so a point moved to
  // *exactly* the near plane is refused by the very function the clip exists to
  // get it past, and every segment this was written to save was dropped anyway.
  // The clip target is therefore the first depth the projector accepts.
  //
  // **It was invisible because the remainder is a sliver, not because it is
  // never drawn** — and the first wording here said *never at any distance this
  // camera model can produce*, which is a universal claim promoted from one
  // sweep (F451). Measured over `CAMERA_DEFAULT` at six distances, the clipped
  // remainder **does** reach the frame at `distance: 1.7` and at none of the
  // other five. So a frame comparison agrees at five of six — enough to have
  // hidden the defect, and not enough to say a frame row is impossible, which
  // is what the stronger sentence would have told the next reader.
  const IN = NEAR * (1 + 1e-6);
  const ta = za <= NEAR ? (IN - za) / (zb - za) : 0;
  // **Measured from `a`, not from `b`.** The lerp below runs `b` toward `a`, so
  // its own parameter is the complement — and a reading interpolated with the
  // wrong end's parameter is a colour that is exactly backwards on precisely
  // the segments nobody looks at.
  const tb = zb <= NEAR ? 1 - (IN - zb) / (za - zb) : 1;
  const a = za <= NEAR ? lerp(seg.a, seg.b, ta) : seg.a;
  const b = zb <= NEAR ? lerp(seg.a, seg.b, tb) : seg.b;
  const pa = project(basis, a);
  const pb = project(basis, b);
  return pa === null || pb === null ? null : { a: pa, b: pb, ta, tb };
}

/** A clipped, projected segment and where its ends sit along the original. */
export type Clipped = Readonly<{ a: Projected; b: Projected; ta: number; tb: number }>;

/** A tick: where it sits on the axis, where its mark ends, and what it says. */
export type Tick3 = Readonly<{ on: Vec3; out: Vec3; text: string }>;

/** How far a tick mark reaches, in normalised units. Short, and the same on all three. */
const TICK_LEN = 0.07;

/**
 * The ticks for one axis (C12 I92).
 *
 * **`niceAxis`'s values, clamped inside the box** — a tick that would land
 * outside the data's extent is dropped rather than the box being grown to meet
 * it. The alternative rescales the picture under a reader who only asked for a
 * reference frame.
 */
export function ticks3(
  axis: Axis3,
  line: AxisLine,
  lo: number,
  hi: number,
  spec: AxisSpec3 | undefined,
  format: Plot["yFormat"],
): readonly Tick3[] {
  if (spec?.ticks === false) return [];
  const want = typeof spec?.ticks === "number" ? Math.max(2, Math.floor(spec.ticks)) : 4;
  const [rlo, rhi] = spec?.range ?? [lo, hi];
  if (!(rhi > rlo)) return [];
  const nice = niceAxis({ min: rlo, max: rhi }, want, {});
  const out: Tick3[] = [];
  for (const v of nice.ticks) {
    if (v < rlo || v > rhi) continue;
    const t = ((v - rlo) / (rhi - rlo)) * 2 - 1;
    const on = with3(line.seg.a, axis, t);
    out.push({
      on,
      out: {
        x: on.x + line.outward.x * TICK_LEN,
        y: on.y + line.outward.y * TICK_LEN,
        z: on.z + line.outward.z * TICK_LEN,
      },
      text: labelFor(v, format),
    });
  }
  return out;
}

/**
 * A tick's text, **through the plot family's own formatter** (C04 I77).
 *
 * `formatReadout` is what every other axis in this component prints with, so a
 * `format` of `"percent"` or `"bytes"` means here exactly what it means there.
 * Writing a second number formatter beside it is how two axes come to disagree
 * about what `1024` is.
 *
 * The only thing added is the negative-zero fold: `niceAxis` can land a tick on
 * `-0`, which `formatReadout` prints as `-0` and a reader reads as a defect.
 */
function labelFor(v: number, format: Plot["yFormat"]): string {
  return formatReadout(Math.abs(v) < 1e-12 ? 0 : v, format);
}
