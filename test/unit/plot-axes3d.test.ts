/**
 * AX1–AX12 — the 3D reference frame (C12 I90, I91, I92, §3an).
 *
 * **The frame is the only check for most of this**, which is the design note's
 * own claim and the reason two of these rows compare rendered cells rather than
 * numbers: a label's legibility under rotation is not a quantity, and both
 * defects this suite was written after — the corner at the figure's centre and
 * `10.5` — are legal geometry with correct arithmetic.
 */
import { describe, expect, it } from "vitest";

import { validateBlock, type Point3 } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import { CAMERA_DEFAULT } from "../../src/data/viewmodel/index.js";
import { basisOf, project } from "../../src/presentation/plot/project3.js";
import {
  axisCorner, axisLines, boxEdges, clipProject, farCorner, originOf,
} from "../../src/presentation/plot/axes3.js";
import { plotHeight } from "../../src/presentation/plot/height.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const CAP = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const capsFor = (n: string): Record<string, unknown> => CAP.find((c) => c.name === n)?.caps ?? {};
const frame = frameFor as (s: unknown, c: unknown, w: number, id?: string) => readonly string[];
const strip = stripSgr as (s: string) => string;

const errorsOf = (x: unknown): readonly string[] => {
  const v = validateBlock(x) as { ok: boolean; error?: readonly string[] };
  return v.ok ? [] : (v.error ?? []);
};

const helix = (n: number): Point3[] =>
  Array.from({ length: n }, (_v, i) => { // cells-ok — a point count
    const t = (i / (n - 1)) * Math.PI * 4; // cells-ok — a point index
    return { x: Math.cos(t), y: Math.sin(t), z: (i / (n - 1)) * 2 - 1, value: t }; // cells-ok
  });

const spec = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  form: "scatter3d", height: 16, series: [],
  points3: [{ label: "helix", points: helix(160) }], ...over,
});

const text = (rows: readonly string[]): string => rows.map((r) => strip(r)).join("\n");
const inked = (rows: readonly string[]): number =>
  rows.reduce((n, r) => n + [...strip(r)].filter((c) => c !== " ").length, 0); // cells-ok — an ink count

/** Eight cameras, one per octant, so no row tests a single convenient view. */
const OCTANTS = [0, 1, 2, 3].flatMap((i) =>
  [Math.PI / 6, -Math.PI / 6].map((elevation) => ({
    azimuth: Math.PI / 4 + (i * Math.PI) / 2, elevation, // cells-ok — an octant index
  })),
);

describe("AX: the 3D reference frame", () => {
  it("AX1 (C12 I90): the far corner is measured, and the axes anchor at a different one", () => {
    for (const cam of OCTANTS) {
      const basis = basisOf({ ...CAMERA_DEFAULT, ...cam }, 80 / 32);
      // **Measured rather than restated**: the vertex of greatest view depth,
      // found by projecting all eight, must be the one the formula names.
      let deepest = { v: { x: 0, y: 0, z: 0 }, d: -Infinity };
      for (const x of [-1, 1]) {
        for (const y of [-1, 1]) {
          for (const z of [-1, 1]) {
            const p = project(basis, { x, y, z });
            if (p !== null && p.depth > deepest.d) deepest = { v: { x, y, z }, d: p.depth };
          }
        }
      }
      expect(farCorner(basis), `far corner at ${JSON.stringify(cam)}`).toEqual(deepest.v);
      // **And the axes do not anchor there** (F448): near in x and y, far in z.
      const a = axisCorner(basis);
      expect(a).toEqual({ x: -deepest.v.x, y: -deepest.v.y, z: deepest.v.z });
    }
  });

  it("AX1b (C12 I90, F448): the far corner projects to the figure's centre and the axis corner does not", () => {
    // **The measurement the rule was corrected on.** The design note says draw
    // from the furthest corner *so the axes never occlude the data*; the
    // furthest corner is the middle of the picture.
    const basis = basisOf(CAMERA_DEFAULT, 80 / 32);
    const far = project(basis, farCorner(basis));
    const near = project(basis, axisCorner(basis));
    expect(far).not.toBeNull();
    expect(near).not.toBeNull();
    expect(far?.x, "the far corner is horizontally centred").toBeCloseTo(0.5, 2);
    expect(far?.y, "and vertically near the centre too").toBeCloseTo(0.5, 1);
    // The axis corner is on the silhouette — far from the centre in y.
    expect(Math.abs((near?.y ?? 0.5) - 0.5), "the axis corner is on the outline")
      .toBeGreaterThan(0.3);
  });

  it("AX2 (C12 I90): `back` is nine edges and the three it omits meet the near corner", () => {
    const basis = basisOf(CAMERA_DEFAULT, 80 / 32);
    const corner = farCorner(basis);
    const all = boxEdges(corner, "full");
    const back = boxEdges(corner, "back");
    expect(all.length, "a cube has twelve edges").toBe(12); // cells-ok — an edge count
    expect(back.length, "and nine of them touch a back face").toBe(9); // cells-ok — an edge count
    expect(boxEdges(corner, "none"), "`none` draws nothing").toEqual([]);
    // **The omitted set, not the count** — nine wrong edges would satisfy a
    // count. Each omitted edge holds both its fixed coordinates on the near
    // side, which is what *meeting the near corner* means.
    const key = (e: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }): string =>
      JSON.stringify([e.a, e.b]);
    const omitted = all.filter((e) => !back.some((k) => key(k) === key(e)));
    expect(omitted.length).toBe(3); // cells-ok — an edge count
    for (const e of omitted) {
      for (const k of ["x", "y", "z"] as const) {
        if (e.a[k] === e.b[k]) expect(e.a[k], "both fixed coordinates are near-side").toBe(-corner[k]);
      }
    }
  });

  it("AX3 (C12 I90): the back faces contain the far corner, and the axis corner shares one sign", () => {
    for (const cam of OCTANTS) {
      const basis = basisOf({ ...CAMERA_DEFAULT, ...cam }, 80 / 32);
      const far = farCorner(basis);
      // Every back edge has at least one fixed coordinate on the far side.
      for (const e of boxEdges(far, "back")) {
        const fixed = (["x", "y", "z"] as const).filter((k) => e.a[k] === e.b[k]);
        expect(fixed.some((k) => e.a[k] === far[k]), "a back edge touches a back face").toBe(true);
      }
      // **One shared sign, and exactly one** — the z the two readings agree on.
      const a = axisCorner(basis);
      const shared = (["x", "y", "z"] as const).filter((k) => a[k] === far[k]);
      expect(shared, "the two readings agree on z alone").toEqual(["z"]);
    }
  });

  it("AX4 (C12 I90): a zero eye component names one corner, not a third one", () => {
    // At azimuth 0 the eye's `y` is exactly zero. `Math.sign(0)` is 0 and names
    // no corner; the tie must land on one side deterministically, or a camera
    // crossing the plane jumps twice.
    const at = (azimuth: number): string =>
      JSON.stringify(farCorner(basisOf({ ...CAMERA_DEFAULT, azimuth }, 80 / 32)));
    const seen = new Set([at(-1e-9), at(0), at(1e-9)]);
    expect(seen.size, "two corners across the crossing, not three").toBe(2); // cells-ok — a corner count
    expect(at(0), "and zero takes the negative side's answer").toBe(at(1e-9));
  });

  it("AX5 (C12 I91, F448): edge-on is orthographic, and perspective is the control", () => {
    const extentOfZ = (projection: "perspective" | "orthographic"): number => {
      const basis = basisOf(
        { ...CAMERA_DEFAULT, elevation: Math.PI / 2, projection }, 80 / 32,
      );
      const z = axisLines("corner", basis, originOf("auto", { x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }))
        .find((l) => l.axis === "z");
      const p = clipProject(basis, (z as NonNullable<typeof z>).seg);
      return p === null ? 0 : Math.hypot((p.b.x - p.a.x) * 80, (p.b.y - p.a.y) * 16); // cells-ok
    };
    // **Exactly zero without a divide.**
    expect(extentOfZ("orthographic"), "orthographic collapses it").toBeCloseTo(0, 6);
    // **And not zero with one**, because the near end is nearer and larger —
    // the control, and the reason the rule hands off to the collision rule.
    expect(extentOfZ("perspective"), "perspective keeps extent").toBeGreaterThan(2);

    const flat = frame(
      spec({ camera: { elevation: Math.PI / 2, projection: "orthographic" }, axisStyle3: { z: { label: "ZED" } } }),
      capsFor("24bit"), 80,
    );
    expect(text(flat), "the edge-on axis drops its label").not.toContain("ZED");
    expect(inked(flat), "and keeps its ink").toBeGreaterThan(
      inked(frame(spec({ camera: { elevation: Math.PI / 2, projection: "orthographic" }, axes3: false, box3: "none" }), capsFor("24bit"), 80)),
    );
    // The control: the same axis at the default camera keeps its label.
    expect(
      text(frame(spec({ axisStyle3: { z: { label: "ZED" } } }), capsFor("24bit"), 80)),
      "a legible axis keeps it",
    ).toContain("ZED");
  });

  it("AX5b (C12 I92, F449): two labels do not abut", () => {
    // **Asserted against the rendered row.** `10.5` is two disjoint claims —
    // `1` and `0.5` at adjacent columns — so an assertion about the occupancy
    // set agrees with the defect and only the frame does not.
    // **The legitimate strings, not a length bound.** The first draft asserted
    // *no run longer than four characters* and the mutation survived it: `10.5`
    // is four. A tick label is one of a known set, so every maximal run of label
    // characters must **be** a member of it — `10.5` is not, and that is the
    // only assertion that separates two labels touching from one label.
    const LEGAL = new Set(["-1", "-0.5", "0", "0.5", "1"]);
    let swept = 0;
    for (const cam of [{ elevation: Math.PI / 2 - 0.001 }, {}, { elevation: -Math.PI / 3 }]) {
      const rows = frame(spec({ camera: cam }), capsFor("24bit"), 80);
      for (const r of rows) {
        const t = strip(r);
        for (const run of t.match(/[-0-9.]+/gu) ?? []) {
          swept += 1; // cells-ok — a label count
          expect(LEGAL.has(run), `"${run}" in "${t.trim()}" is two labels touching`).toBe(true);
        }
      }
    }
    expect(swept, "the sweep saw labels at all").toBeGreaterThan(10); // cells-ok — a label count
  });

  it("AX6 (C12 I91, F450): a straddling segment is clipped to the near plane, and no frame can see it", () => {
    // **A unit row and not a frame row, and the measurement is why** (F450).
    // The clip fires — 3 segments straddle at `distance: 1.7` and 9 at `0.5` —
    // and the clipped remainder reaches the screen at **one** of the six
    // distances swept. A frame comparison is therefore identical at five of
    // them, which is what the first draft of this row asserted and why it
    // passed against a clip that dropped every segment it was written to save.
    const view = (basis: ReturnType<typeof basisOf>, p: { x: number; y: number; z: number }): number =>
      (p.x - basis.eye.x) * basis.forward.x
      + (p.y - basis.eye.y) * basis.forward.y
      + (p.z - basis.eye.z) * basis.forward.z;
    const o = originOf("auto", { x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 });
    let straddled = 0;
    let offScreen = 0;
    for (const distance of [1.7, 1.5, 1.2, 1, 0.5]) {
      const basis = basisOf({ ...CAMERA_DEFAULT, distance }, 80 / 32);
      const segs = [
        ...boxEdges(farCorner(basis), "full"),
        ...axisLines("corner", basis, o).map((l) => l.seg),
      ];
      for (const seg of segs) {
        const za = view(basis, seg.a);
        const zb = view(basis, seg.b);
        if ((za <= 0.01) === (zb <= 0.01)) continue;
        straddled += 1; // cells-ok — a segment count
        const p = clipProject(basis, seg);
        // **Clipped, not dropped**: the pair comes back and the behind endpoint
        // has been moved to the near plane rather than the segment refused.
        expect(p, "a straddling segment survives").not.toBeNull();
        const kept = p as NonNullable<typeof p>;
        expect(Number.isFinite(kept.a.x) && Number.isFinite(kept.b.x)).toBe(true);
        // **Just inside the plane and not on it** (F450): `project` culls on
        // `z <= NEAR`, so a clip landing exactly on it is refused by the
        // function the clip exists to satisfy.
        expect(Math.min(kept.a.depth, kept.b.depth), "the near end is just inside the plane")
          .toBeGreaterThan(0.01);
        expect(Math.min(kept.a.depth, kept.b.depth), "and only just")
          .toBeLessThan(0.0100001);
        // **Sampled densely, because the visible part is a sliver.** Three
        // samples along the segment found none and 201 found one — the clipped
        // remainder enters the frame briefly and leaves, so a coarse sweep
        // measures its own step size.
        const on = Array.from({ length: 201 }, (_v, i) => i / 200).some((t) => { // cells-ok — a sample index
          const x = kept.a.x + (kept.b.x - kept.a.x) * t;
          const y = kept.a.y + (kept.b.y - kept.a.y) * t;
          return x >= 0 && x <= 1 && y >= 0 && y <= 1;
        });
        if (!on) offScreen += 1; // cells-ok — a segment count
      }
    }
    expect(straddled, "segments do straddle, so the row has a subject").toBeGreaterThan(10); // cells-ok
    // **And the clip has a visible subject, narrowly.** One of them reaches the
    // frame; the rest are thrown outside `[0,1]²` by the divide, because
    // `basisOf` always targets the origin so the near region is behind the
    // data. Asserted as *at least one*, because zero is what a broken clip
    // gives and the count itself is a property of the sweep.
    expect(straddled - offScreen, "at least one clipped segment is visible").toBeGreaterThan(0); // cells-ok
    // Both endpoints behind is the one case with nothing to draw.
    const inside = basisOf({ ...CAMERA_DEFAULT, distance: 0 }, 80 / 32);
    expect(clipProject(inside, { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0.5 } })).toBeNull();
  });

  it("AX7 (C12 I92, C12 I1): the frame costs no row and no gutter", () => {
    const base = plotHeight({ form: "scatter3d", height: 16 } as never);
    for (const axes3 of ["corner", "origin", "centre", false] as const) {
      for (const box3 of ["none", "back", "full"] as const) {
        const over = axes3 === "origin" ? { axes3, box3, origin3: "auto" } : { axes3, box3 };
        for (const w of [40, 80, 120]) {
          const rows = frame(spec(over), capsFor("24bit"), w);
          expect(rows.length, `${String(axes3)}/${box3} @ ${w}`).toBe(base);
        }
      }
    }
  });

  it("AX8 (C12 I92): a label is drawn over the cloud, whole", () => {
    // A long name at an anchor the cloud surrounds — it appears intact or not
    // at all, never in pieces, because the test is at the anchor.
    const t = text(frame(spec({ axisStyle3: { x: { label: "LONGITUDE" } } }), capsFor("24bit"), 120));
    expect(t, "the whole string appears").toContain("LONGITUDE");
    // **Never in pieces**: every occurrence of the first letters is the whole
    // string, which is what *tested at the anchor, drawn over* buys — a
    // per-cell test would leave the halves the cloud does not cover.
    expect((t.match(/LONGI/gu) ?? []).length, "and only as the whole string")
      .toBe((t.match(/LONGITUDE/gu) ?? []).length); // cells-ok — a match count

    // **The anchor test's own subject is recorded as absent rather than
    // asserted** (F450). A first draft compared this block against the same one
    // with an empty cloud, expecting the difference to be the labels the data
    // hides. The difference is **three** and stays three with the guard
    // removed: `extentOf([])` answers the unit cube while the helix's extent is
    // `±0.9995`, so the two blocks get different `niceAxis` ticks and the row
    // was measuring **tick clamping**. The guard fires on no fixture measured,
    // because the anchors are pushed *outward* — toward the reader — by
    // construction, so nothing is in front of them. It stays for C12 I92's reason,
    // and the run file records the mutation that kills nothing.
  });

  it("AX9 (C12 I92): turning the axes on does not move the data", () => {
    // **The row that fails if the box is niced rather than the data's extent.**
    // Compared over the cells the frame does not occupy: the cloud's own ink is
    // at the same coordinates either way.
    const bare = frame(spec({ axes3: false, box3: "none" }), capsFor("24bit"), 80).map((r) => strip(r));
    const framed = frame(spec(), capsFor("24bit"), 80).map((r) => strip(r));
    let checked = 0;
    for (const [r, line] of bare.entries()) {
      for (let c = 0; c < line.length; c += 1) { // cells-ok — a column index
        if (line[c] === " ") continue;
        checked += 1; // cells-ok — a cell count
        expect((framed[r] ?? "")[c], `cell ${String(r)},${String(c)} moved`).not.toBe(" ");
      }
    }
    expect(checked, "the comparison ran over the cloud").toBeGreaterThan(50); // cells-ok — a cell count
  });

  it("AX10 (C04 I77): `origin3` is refused wherever it decides nothing, at both gates", () => {
    for (const axes3 of ["corner", "centre", false] as const) {
      const bad = { kind: "plot", id: "o", ...spec({ axes3, origin3: "centre" }) };
      expect(errorsOf(bad).join(" "), String(axes3)).toMatch(/"origin3" with "axes3"/u);
      expect(() => b.plot({ ...spec({ axes3, origin3: "centre" }) } as never)).toThrow(/"origin3" with "axes3"/u);
    }
    // The converses: legal where it decides something, and absent everywhere.
    expect(errorsOf({ kind: "plot", id: "o", ...spec({ axes3: "origin", origin3: "centre" }) })).toEqual([]);
    expect(errorsOf({ kind: "plot", id: "o", ...spec({ axes3: "origin" }) }), "the member has a default").toEqual([]);
    expect(errorsOf({ kind: "plot", id: "o", ...spec({ axes3: "corner" }) })).toEqual([]);
  });

  it("AX11 (C12 I92): `show: false` takes the axis and leaves the box", () => {
    const shown = frame(spec({ axisStyle3: { x: { label: "XX" } } }), capsFor("24bit"), 80);
    const hidden = frame(spec({ axisStyle3: { x: { label: "XX", show: false } } }), capsFor("24bit"), 80);
    expect(text(shown)).toContain("XX");
    expect(text(hidden), "the axis and its labels are gone").not.toContain("XX");
    // **And the box stayed** — a row asserting only the removal passes against
    // a renderer that removed the reference frame with it.
    const noBox = frame(
      spec({ axisStyle3: { x: { label: "XX", show: false } }, box3: "none" }), capsFor("24bit"), 80,
    );
    expect(inked(hidden), "the box is still drawn").toBeGreaterThan(inked(noBox));
  });

  it("AX12 (C12 I92): the labels are the same strings on both arms", () => {
    const only = (rows: readonly string[]): string =>
      text(rows).replace(/[^A-Za-z0-9.\-\n ]/gu, " ").replace(/ +/gu, " ");
    const raster = only(frame(spec({ axisStyle3: { x: { label: "ALPHA" } } }), capsFor("24bit"), 80));
    const glyph = only(frame(spec({ axisStyle3: { x: { label: "ALPHA" } } }), capsFor("ascii"), 80));
    expect(raster, "the raster arm names the axis").toContain("ALPHA");
    expect(glyph, "and so does the marker arm").toContain("ALPHA");
    // The arm changes the marks, not the words: every tick string in one is in
    // the other. Asserted as the set, because a subset is satisfied by none.
    const ticksOf = (t: string): readonly string[] =>
      [...new Set((t.match(/-?\d+(?:\.\d+)?/gu) ?? []))].sort();
    expect(ticksOf(glyph), "the same tick strings on both arms").toEqual(ticksOf(raster));
  });

  it("AX13 (C04 I77): `arrow` draws a head, and the ASCII rung is a different glyph", () => {
    const headsAt = (azimuth: number, cap = "24bit"): string => {
      const t = text(frame(spec({ camera: { azimuth }, axisStyle3: { x: { arrow: true } } }), capsFor(cap), 80));
      return [...new Set([...t].filter((ch) => "→←↑↓><^v".includes(ch)))].join("");
    };
    expect(headsAt(Math.PI / 2), "a head appears").toMatch(/[→←↑↓]/u);
    expect(text(frame(spec(), capsFor("24bit"), 80)), "and only when asked for").not.toMatch(/[→←↑↓]/u);
    // **The direction is identified, not the presence.** A head that is always
    // `→` satisfies *a head appears* and says the wrong thing about half the
    // orbit; two cameras that point x opposite ways must not agree.
    expect(headsAt(Math.PI / 2), "east and west are different heads")
      .not.toBe(headsAt((3 * Math.PI) / 2));
    const ascii = text(frame(spec({ camera: { azimuth: Math.PI / 2 }, axisStyle3: { x: { arrow: true } } }), capsFor("ascii"), 80));
    expect(ascii, "the ASCII rung is required, not optional").not.toMatch(/[→←↑↓]/u);
    expect(ascii).toMatch(/[><^v]/u);
  });

  it("AX14 (C04 I77): `box3` and `axes3` are independent members", () => {
    // The walk's row 9: a bare box with no axes is a legitimate render, not a
    // state to refuse.
    const boxOnly = frame(spec({ axes3: false, box3: "back" }), capsFor("24bit"), 80);
    const nothing = frame(spec({ axes3: false, box3: "none" }), capsFor("24bit"), 80);
    expect(inked(boxOnly), "the box draws with no axes").toBeGreaterThan(inked(nothing));
    expect(text(boxOnly), "and it carries no labels").not.toMatch(/[xyz]/u);
    expect(errorsOf({ kind: "plot", id: "bx", ...spec({ axes3: false, box3: "back" }) })).toEqual([]);
  });
});
