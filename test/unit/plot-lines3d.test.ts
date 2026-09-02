/**
 * LN1–LN6 — the polyline carrier (C12 I93, C04 I78, §3ao, §6g).
 *
 * **The rows are indexed by §6g's table, and three of them are about the
 * carrier that was already there.** LN1 is the extent, and it is the row this
 * step exists for: a rule correctly written against `points3` draws a
 * lines-only block against `extentOf([])`'s unit cube — on screen, inside the
 * box, at the wrong scale, and invisible to every bounds assertion.
 */
import { describe, expect, it } from "vitest";

import { validateBlock, type Point3 } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import { COLORMAPS, continuousColour } from "../../src/presentation/theme/colormap.js";
import { markers3 } from "../../src/presentation/blocks/glyphs.js";
import { basisOf } from "../../src/presentation/plot/project3.js";
import { clipProject } from "../../src/presentation/plot/axes3.js";
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

/** Every colour on the frame, by cell, with the glyph beside it. */
const cellsOf = (rows: readonly string[]): { text: string; colour: string | null }[] => {
  const out: { text: string; colour: string | null }[] = [];
  for (const line of rows) {
    for (const run of runsOf(line)) {
      for (const ch of [...run.text]) out.push({ text: ch, colour: run.colour });
    }
  }
  return out.filter((c) => c.text !== " ");
};

const inked = (rows: readonly string[]): string =>
  rows.map((r) => strip(r)).join("").replace(/ /gu, "");

/** The columns a frame puts ink in, so an extent can be measured rather than counted. */
const columnSpan = (rows: readonly string[]): number => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const line of rows) {
    const s = strip(line);
    for (let c = 0; c < s.length; c += 1) { // cells-ok — a column index
      if (s[c] !== " " && s[c] !== undefined) {
        lo = Math.min(lo, c);
        hi = Math.max(hi, c);
      }
    }
  }
  return hi < lo ? 0 : hi - lo + 1; // cells-ok — a column count
};

const seg = (a: Point3, c: Point3): { points: Point3[] } => ({ points: [a, c] });

/**
 * A palette colour in the form the SVG reader emits.
 *
 * **The two representations are the reason this exists**: `parseLine` returns
 * `rgb(r,g,b)` and `slot`/`continuousColour` return a `ColourValue`, so a row
 * comparing them directly fails on the encoding and reads as a colour defect —
 * a matcher that sees one encoding, one file over from where it was written.
 */
const rgb = (v: unknown): string => {
  const hex = (v as { hex?: string } | undefined)?.hex ?? "";
  const n = Number.parseInt(hex.replace("#", ""), 16);
  // eslint-disable-next-line no-bitwise
  return `rgb(${String((n >> 16) & 255)},${String((n >> 8) & 255)},${String(n & 255)})`;
};
const slotRgb = (ref: string): string => rgb(slot(ref as never, theme, capsFor("24bit") as never).colour);

/** No reference frame, so the rows about the data say which picture they mean. */
const bare = (over: Record<string, unknown>): Record<string, unknown> => ({
  form: "scatter3d", height: 10, series: [], axes3: false, box3: "none", ...over,
});

describe("plot — the polyline carrier", () => {
  it("T2.4g (C04 I78): `lines3` is refused off the form, and either carrier alone is accepted", () => {
    const path = [seg({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 })];
    const pts = [{ points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }] }];
    for (const bad of [
      { form: "scatter", height: 4, series: [], lines3: path },
      { form: "line", height: 4, series: [{ values: [1, 2] }], lines3: path },
    ]) {
      expect(errorsOf({ kind: "plot", id: "s", ...bad }).join(" ")).toMatch(/"lines3" on form/u);
      expect(() => b.plot(bad as never)).toThrow(/"lines3" on form/u);
    }
    // **Neither carrier is the refusal, and this is the half that is the row**
    // (C12 §6g row 2). The member rule alone reads as correct and refuses a
    // wireframe, which is a complete document. **The message names the carrier
    // set** since C04 I79 — the third carrier is where the pair of hand-widened
    // names became one constant, and `T2.4h` is where that is the row.
    expect(errorsOf({ kind: "plot", id: "s", form: "scatter3d", height: 4, series: [] }).join(" "))
      .toMatch(/has none of "points3", "lines3", "surfaces3"/u);
    expect(() => b.plot({ form: "scatter3d", height: 4, series: [] } as never))
      .toThrow(/has none of "points3", "lines3", "surfaces3"/u);
    for (const good of [
      { form: "scatter3d", height: 4, series: [], lines3: path },
      { form: "scatter3d", height: 4, series: [], points3: pts },
      { form: "scatter3d", height: 4, series: [], points3: pts, lines3: path },
    ]) {
      expect(errorsOf({ kind: "plot", id: "s", ...good }), JSON.stringify(good)).toEqual([]);
      expect(() => b.plot(good as never), JSON.stringify(good)).not.toThrow();
    }
  });

  it("T3.55 (C04 I78): the `colourBy: \"value\"` walk reaches the other carrier", () => {
    const withValue = [{ x: 0, y: 0, z: 0, value: 1 }, { x: 1, y: 1, z: 1, value: 2 }];
    const missing = [{ x: 0, y: 0, z: 0, value: 1 }, { x: 1, y: 1, z: 1 }];
    const base = { kind: "plot", id: "s", form: "scatter3d", height: 4, series: [], colourBy: "value" };
    // **The control first**: the same block with the reading supplied must be
    // accepted, or this row passes against a validator that refuses the arm.
    expect(errorsOf({ ...base, lines3: [{ points: withValue }] })).toEqual([]);
    const msg = errorsOf({ ...base, lines3: [{ points: missing }] }).join(" ");
    expect(msg, "the message names the carrier and the index").toMatch(/lines3\[0\]\.points\[1\] has no finite "value"/u);
    // And the other two arms accept the same incomplete path — the reading is
    // only a fault for the arm that spends colour on it.
    for (const by of ["depth", "series"]) {
      expect(errorsOf({ ...base, colourBy: by, lines3: [{ points: missing }] }), by).toEqual([]);
    }
  });

  it("T3.56 (C04 I78): `closed` emits a segment at three points and not at two or one", () => {
    // **Asserted on what is drawn, because a retraced segment is invisible in a
    // frame by construction.** A closed two-point path draws the same cells as
    // an open one; a closed three-point path draws strictly more.
    const p = (n: number): Point3[] => [
      { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: 0 }, { x: 0, y: 1, z: 1 },
    ].slice(0, n);
    for (const n of [1, 2]) {
      expect(
        inked(frame(bare({ lines3: [{ points: p(n), closed: true }] }), capsFor("24bit"), 60)).length,
        `${String(n)} points closed draws the same as open`,
      ).toBe(inked(frame(bare({ lines3: [{ points: p(n) }] }), capsFor("24bit"), 60)).length); // cells-ok
    }
    const open = inked(frame(bare({ lines3: [{ points: p(3) }] }), capsFor("24bit"), 60)).length; // cells-ok
    const shut = inked(frame(bare({ lines3: [{ points: p(3), closed: true }] }), capsFor("24bit"), 60)).length; // cells-ok
    expect(shut, "the third point closes the ring").toBeGreaterThan(open);
  });

  it("LN1 (C12 I93, C04 I78): the extent is over both carriers, or the picture is at the wrong scale", () => {
    // **A small path, which is the whole discriminator.** A path already
    // spanning `[-1, 1]` normalises identically under both readings, because
    // `extentOf([])` *is* the unit cube — so the row that would have been
    // written first passes against the defect.
    // **Not a single diagonal**: the default camera looks nearly along
    // `(1, 1, 1)`, so a segment on that axis projects to almost a point and a
    // row asserting an extent measures the camera instead.
    const small = [{ points: [
      { x: 0, y: 0, z: 0 }, { x: 0.2, y: 0, z: 0.05 }, { x: 0.2, y: 0.2, z: 0.2 },
    ] }];
    // **Asserted as scale invariance, not as a column count.** `unitOf`
    // normalises the data's own extent, so a path scaled by five is the *same
    // picture* — and with the extent taken from the clouds alone the two are
    // different pictures, because `extentOf([])` is a fixed unit cube that one
    // of them fills and the other sits in the middle of. No threshold to pick,
    // and the row says which rule it is about.
    const big = [{ points: (small[0] as { points: Point3[] }).points.map(
      (q) => ({ x: q.x * 5, y: q.y * 5, z: q.z * 5 }),
    ) }];
    const one = frame(bare({ lines3: small }), capsFor("24bit"), 80).map((r) => strip(r));
    const five = frame(bare({ lines3: big }), capsFor("24bit"), 80).map((r) => strip(r));
    expect(one.join("\n"), "the same path scaled draws the same picture").toBe(five.join("\n"));
    const span = columnSpan(one);
    expect(span, "and it is a picture rather than a speck").toBeGreaterThan(4); // cells-ok — a column count
    // **And it shrinks when a wider cloud arrives**, which is the same rule
    // read from the other side: the extent is the *union* and not the path's
    // own, so the path stops filling the frame the moment something larger
    // shares it.
    const wide = frame(
      bare({ lines3: small, points3: [{ points: [{ x: -5, y: -5, z: -5 }, { x: 5, y: 5, z: 5 }] }] }),
      capsFor("24bit"), 80,
    ).map((r) => strip(r));
    expect(columnSpan(wide), "a wider cloud rescales the path").toBeLessThan(span);
  });

  it("LN2 (C12 I93): colour runs along a segment on the ramp arms and is flat on the categorical one", () => {
    const long = [{ points: [
      { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 },
    ] }];
    const depth = cellsOf(frame(bare({ lines3: long, camera: { distance: 3 } }), capsFor("24bit"), 80));
    const shades = new Set(depth.map((c) => c.colour));
    expect(shades.size, "the ramp runs along the segment").toBeGreaterThan(1); // cells-ok — a colour count
    // **Compared against the ramp's own end, not counted.** A count of two is
    // satisfied by any two wrong colours; the near end of the segment must be
    // the near end of the map.
    const map = COLORMAPS["viridis"];
    const near = rgb(continuousColour(map as never, 1, capsFor("24bit") as never));
    const far = rgb(continuousColour(map as never, 0, capsFor("24bit") as never));
    expect(near, "the ramp's two ends are different colours").not.toBe(far);
    expect([...shades], "the nearest sample is the top of the ramp").toContain(near);
    // The categorical arm: one colour for the whole line, and it is the
    // **second** slot, because the cloud holds the first (C04 I78).
    const both = cellsOf(frame(
      bare({ colourBy: "series", points3: [{ points: [{ x: -1, y: -1, z: -1 }] }], lines3: long }),
      capsFor("24bit"), 80,
    ));
    expect(new Set(both.map((c) => c.colour)), "two identities, two slots")
      .toEqual(new Set([slotRgb("categorical.c2"), slotRgb("categorical.c1")]));
  });

  it("LN3 (C12 I93): the points draw first, so a path through a cloud leaves every marker", () => {
    // **Two points and the segment between them**, so the only cells where the
    // two tie are the markers themselves — a helix would let a segment pass in
    // front of an unrelated point and occlude it legitimately.
    const a: Point3 = { x: -1, y: -1, z: -1 };
    const c: Point3 = { x: 1, y: 1, z: 1 };
    const caps = capsFor("1bit");
    const marks = markers3(caps as never);
    const all = new Set([...marks.near, ...marks.mid, ...marks.far]);
    const only = new Set([...inked(frame(bare({ points3: [{ points: [a, c] }] }), caps, 60))]
      .filter((g) => all.has(g)));
    expect(only.size, "the control draws markers at all").toBeGreaterThan(0); // cells-ok — a glyph count
    const withPath = new Set([...inked(frame(bare({ points3: [{ points: [a, c] }], lines3: [seg(a, c)] }), caps, 60))]
      .filter((g) => all.has(g)));
    expect(withPath, "the line swallows no marker").toEqual(only);
  });

  it("LN4 (C12 I93): a line writes a literal glyph and never a tier code", () => {
    const caps = capsFor("1bit");
    const marks = markers3(caps as never);
    const all = new Set([...marks.near, ...marks.mid, ...marks.far]);
    const drawn = new Set([...inked(frame(bare({ lines3: [seg({ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 })] }), caps, 60))]);
    expect(drawn.size, "the path is drawn").toBeGreaterThan(0); // cells-ok — a glyph count
    // **The row that fails if a line index reaches `glyph[]`**: `glyphRows`
    // reads the tier code before the mark, so a line encoded there would come
    // out as a marker.
    expect([...drawn].filter((g) => all.has(g)), "no marker glyph on a lines-only frame").toEqual([]);
  });

  it("LN5 (C12 I93, I91): an interior vertex behind the eye clips twice, to two different places", () => {
    // **The mechanism and not the frame** (F450's lesson): the two adjacent
    // segments each clip to the near plane, and they land at *different*
    // points on it — which is the gap, and is what a line passing behind the
    // reader looks like.
    const basis = basisOf({ distance: 0.5, azimuth: 0.6, elevation: 0.3 } as never, 80 / 20);
    const a = { x: -1, y: -1, z: -1 };
    const mid = { x: 1, y: 1, z: 1 };
    const c = { x: -1, y: 1, z: -1 };
    const first = clipProject(basis, { a, b: mid });
    const second = clipProject(basis, { a: mid, b: c });
    expect(first, "the first half survives").not.toBeNull();
    expect(second, "the second half survives").not.toBeNull();
    const one = first as NonNullable<typeof first>;
    const two = second as NonNullable<typeof second>;
    // The shared vertex is behind the eye, so both clips moved it — and the
    // parameters say so rather than the coordinates.
    expect(one.tb, "the first segment's far end moved").toBeLessThan(1);
    expect(two.ta, "the second segment's near end moved").toBeGreaterThan(0);
    const apart = Math.hypot(one.b.x - two.a.x, one.b.y - two.a.y);
    expect(apart, "and they landed in different places").toBeGreaterThan(0.01);
  });

  it("LN6 (C12 I93, F452): the frame is drawn last, so data at the box's own depth keeps its cells", () => {
    // **A path lying exactly on a box edge**, which is not a curiosity: the
    // extent *is* the data's, so a wireframe of a bounding volume coincides
    // with the reference box entirely.
    const corners: Point3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push({ x, y, z });
    const edge = [seg({ x: -1, y: -1, z: -1 }, { x: -1, y: -1, z: 1 })];
    const shot = (withPath: boolean): { text: string; colour: string | null }[] => cellsOf(frame(
      { form: "scatter3d", height: 12, series: [], box3: "full", axes3: false,
        colourBy: "series", points3: [{ points: corners }],
        ...(withPath ? { lines3: edge } : {}) },
      capsFor("24bit"), 80,
    ));
    const muted = slotRgb("tone.muted");
    const mutedCells = (withPath: boolean): number =>
      shot(withPath).filter((c) => c.colour === muted).length; // cells-ok — a cell count
    // **A differential and not a membership test.** The coincidence is not
    // sample-exact: `boxEdges` may hand the same edge back the other way round,
    // and a stroke walked from the far end lands on a few different cells — so
    // *the path appears in its own colour* is satisfied whichever order draws
    // first, and the mutation survived the row written that way. What only the
    // right order gives is the frame **losing** cells it would otherwise hold.
    expect(mutedCells(false), "the reference box is drawn").toBeGreaterThan(0); // cells-ok
    expect(mutedCells(true), "and the coincident path takes cells from it")
      .toBeLessThan(mutedCells(false));
    expect(new Set(shot(true).map((c) => c.colour)), "in its own colour")
      .toContain(slotRgb("categorical.c2"));
  });
});
