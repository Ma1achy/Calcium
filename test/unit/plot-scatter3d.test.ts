/**
 * SC1–SC12 — `scatter3d`, the form step 3 ships (C12 I87, I88, I89, §3am).
 *
 * **The rows are indexed by the walk's table, not by the inputs.** §6e's twelve
 * cells are where two rules meet; a row governed by one rule restates that rule
 * and finds nothing. The three that matter most are SC3 (the tier means a
 * sample count on one arm and a glyph on the other), SC6 (one rule decides the
 * colour's meaning *and* the legend) and SC11 (the picture is the colour, so a
 * stripped capture cannot judge this arm at all).
 */
import { describe, expect, it } from "vitest";

import { block, validateBlock, type Plot, type Point3 } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import { COLORMAPS, continuousColour } from "../../src/presentation/theme/colormap.js";
import { plotHeight } from "../../src/presentation/plot/height.js";
import { measurable } from "../support/render.js";
import { plotDefinition } from "../../src/presentation/plot/definition.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";
import { parseLine } from "../../tools/catalogue-png.mjs";

const CAP = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const capsFor = (name: string): Record<string, unknown> =>
  CAP.find((c) => c.name === name)?.caps ?? {};
const frame = frameFor as (s: unknown, c: unknown, w: number, id?: string) => readonly string[];
const strip = stripSgr as (s: string) => string;
const runsOf = parseLine as (l: string) => readonly { text: string; colour: string }[];

/** `validateBlock` returns a `Validity`, so the messages are behind the tag. */
const errorsOf = (b: unknown): readonly string[] => {
  const v = validateBlock(b) as { ok: boolean; error?: readonly string[] };
  return v.ok ? [] : (v.error ?? []);
};

const cloud = (points: readonly Point3[], label?: string): Record<string, unknown> =>
  label === undefined ? { points } : { points, label };

/** A helix, deterministic, spanning all three axes. */
const helix = (n: number): Point3[] =>
  Array.from({ length: n }, (_v, i) => { // cells-ok — a point count
    const t = (i / (n - 1)) * Math.PI * 4; // cells-ok — a point index
    return { x: Math.cos(t), y: Math.sin(t), z: (i / (n - 1)) * 2 - 1, value: t }; // cells-ok
  });

const spec = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  form: "scatter3d", height: 10, series: [], points3: [cloud(helix(160), "helix")], ...over,
});

/**
 * The same block with **no reference frame**, for the rows whose subject is the
 * data.
 *
 * **Step 4 turned `axes3` and `box3` on by default and every row here could
 * suddenly see furniture.** SC1 asserted the raster arm's alphabet is exactly
 * `▀▄`, SC4 that the raster arm has fewer than three distinct glyphs, SC8 that a
 * zero value span draws one colour — all true of the *cloud* and none of them
 * true of a frame with labels in it. The rows about the arm, the tier and the
 * ramp say which picture they mean rather than inheriting whatever the default
 * happens to be; the rows about composition (`SC11`, `SC12`) keep the default,
 * because the composite is their subject.
 */
const bare = (over: Record<string, unknown> = {}): Record<string, unknown> =>
  spec({ axes3: false, box3: "none", ...over });

const inked = (rows: readonly string[]): string =>
  rows.map((r) => strip(r)).join("").replace(/ /gu, "");

const HEIGHT = plotHeight({ form: "scatter3d", height: 10 } as never);

describe("SC: the 3D scatter", () => {
  it("SC1 (C12 I87): the arm is the terminal's, and the two arms disagree in the frame", () => {
    for (const name of ["24bit", "8bit"]) {
      const ink = inked(frame(bare(), capsFor(name), 80));
      expect([...new Set(ink)].sort().join(""), `${name} draws the colour raster`).toBe("▀▄");
    }
    for (const name of ["4bit", "ascii"]) {
      const ink = inked(frame(bare(), capsFor(name), 80));
      expect(ink, `${name} draws marker glyphs`).not.toMatch(/[▀▄]/u);
      expect(ink.length, `${name} draws something`).toBeGreaterThan(0); // cells-ok — a glyph count
    }
    // **The control, and it is what says the row read a capability.** Without
    // it every assertion above is satisfied by a renderer with one arm that
    // happens to use the glyph the branch would have chosen.
    expect(
      inked(frame(bare(), capsFor("24bit"), 80)),
      "the two arms draw different pictures",
    ).not.toBe(inked(frame(bare(), capsFor("ascii"), 80)));
  });

  it("SC2 (C12 I87, C04 I59): every plotStyle is refused on this form, over the whole union", () => {
    // **Over every member and not one**, because an empty `STYLE_ARMS` entry and
    // a missing one produce different errors, and a row testing `"braille"`
    // alone passes against a record that happens to list it.
    for (const ps of ["braille", "line", "candlestick", "solid"] as const) {
      expect(
        errorsOf({ kind: "plot", id: "s", ...spec({ plotStyle: ps }) }).join(" "),
        `plotStyle: ${ps}`,
      ).toMatch(/no style arms/u);
    }
    // **The converse**, so the refusal is not firing on everything: `"auto"` is
    // the unset value and is accepted on every form.
    expect(
      errorsOf({ kind: "plot", id: "s", ...spec({ plotStyle: "auto" }) }),
      "`auto` is the unset value and is legal everywhere",
    ).toEqual([]);
  });

  it("SC2b (C04 I76): the four member refusals fire at both gates, each with its converse", () => {
    const pts = [cloud(helix(8))];
    const cases: readonly [Record<string, unknown>, RegExp][] = [
      [{ form: "scatter", height: 4, series: [], points3: pts }, /"points3" on form "scatter"/u],
      // **Widened to *no carrier at all* by C04 I78 and I79** — a wireframe is
      // edges with no cloud and a loss landscape has neither, so the refusal
      // reads the carrier *set*. `T2.4g` and `T2.4h` are where the converses
      // live, one per carrier.
      [{ form: "scatter3d", height: 4, series: [] }, /form "scatter3d" has none of "points3", "lines3", "surfaces3"/u],
      [{ form: "line", height: 4, series: [], colourBy: "depth" }, /"colourBy" on form "line"/u],
      [{ form: "scatter3d", height: 4, series: [], points3: pts, axes: true }, /"axes" on form "scatter3d"/u],
    ];
    for (const [bad, message] of cases) {
      expect(errorsOf({ kind: "plot", id: "s", ...bad }).join(" "), String(message)).toMatch(message);
      // **The builder is the second gate**, which is where `vectors`' own four
      // live. The walk over every point for a finite `value` is the validator's
      // alone: a statement about members belongs at both gates, and a walk over
      // the data belongs at the gate that reports rather than throws.
      expect(() => b.plot(bad as never), String(message)).toThrow(message);
    }
    // The converses: each member in its legal position is accepted.
    expect(errorsOf({ kind: "plot", id: "s", form: "scatter3d", height: 4, series: [], points3: pts, colourBy: "series" })).toEqual([]);
    expect(() => b.plot({ form: "scatter3d", height: 4, series: [], points3: pts } as never)).not.toThrow();
    expect(() => b.plot({ form: "scatter", height: 4, series: [{ values: [1, 2] }] } as never)).not.toThrow();
  });

  it("SC3 (C12 I88): three tiers, and a tier is a sample count on one arm and a glyph on the other", () => {
    // The glyph arm: three distinct marks over a cloud spanning the depth range.
    const marks = new Set(inked(frame(bare(), capsFor("ascii"), 80)));
    expect(marks.size, "three tiers, three glyph rows").toBeGreaterThanOrEqual(3); // cells-ok — a tier count
    // The raster arm: a tier is how many samples a point paints, so a nearer
    // cloud inks strictly more cells than one pushed away from the eye.
    const near = inked(frame(bare({ camera: { distance: 4 } }), capsFor("24bit"), 80)).length; // cells-ok
    const far = inked(frame(bare({ camera: { distance: 20 } }), capsFor("24bit"), 80)).length; // cells-ok
    expect(near, "a nearer cloud paints more samples").toBeGreaterThan(far);
  });

  it("SC4 (C12 I88): at one bit the tier is the whole picture, and it still reads as 3D", () => {
    const mono = inked(frame(bare(), capsFor("1bit"), 80));
    // Three distinct marks with no colour at all — the honest degradation.
    expect(new Set(mono).size, "all three tiers present at one bit").toBeGreaterThanOrEqual(3); // cells-ok
    // **The control**: at 24-bit the same block is the raster arm, whose marks
    // are two glyphs and whose depth is in the colour. Without it the row above
    // passes against a renderer that has only the glyph arm.
    expect(
      new Set(inked(frame(bare(), capsFor("24bit"), 80))).size,
      "the raster arm has two glyphs, not three",
    ).toBeLessThan(3); // cells-ok — a glyph count
  });

  it("SC5 (C12 I88, I86): a point at the frame's edge clips per sample and does not throw", () => {
    // **The vertical edge and not the horizontal one, and the reason is the
    // aspect divide.** Screen x carries `/ aspect`, so on an 80x10 block a
    // normalised coordinate of 1 reaches about column 31 and the left and right
    // edges are **unreachable by construction** — the first draft of this row
    // asserted column 0 and was measuring that, not the clip. Screen y has no
    // such divide, so the top and bottom edges are where a block can straddle.
    const pts = [
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
      { x: 1, y: 1, z: 0 }, { x: -1, y: -1, z: 0 },
    ];
    const at = (distance: number): readonly string[] =>
      frame(
        spec({ camera: { azimuth: 0, elevation: 0, distance }, points3: [cloud(pts)] }),
        capsFor("24bit"), 80,
      );
    const close = at(3);
    expect(close.length, "the declared height either way").toBe(HEIGHT);
    expect(strip(close[0] ?? "").trim(), "the top row is inked").not.toBe("");
    expect(strip(close[close.length - 1] ?? "").trim(), "and the bottom row").not.toBe("");
    // **The control**: from further back nothing reaches either edge, so the
    // assertions above are reading the clip rather than passing always.
    const back = at(6);
    expect(strip(back[0] ?? "").trim(), "and from further back it is not").toBe("");
    expect(inked(back).length, "while the cloud still draws").toBeGreaterThan(0); // cells-ok
  });

  it("SC6 (C12 I89): colourBy decides the legend's contents and its presence, from one rule", () => {
    const three = [cloud(helix(40), "alpha"), cloud(helix(40), "beta"), cloud(helix(40), "gamma")];
    const named = frame(spec({ colourBy: "series", points3: three }), capsFor("24bit"), 80)
      .map((r) => strip(r)).join("\n");
    for (const label of ["alpha", "beta", "gamma"]) {
      expect(named, "the key names the clouds").toContain(label);
    }
    for (const by of ["depth", "value"] as const) {
      const other = frame(spec({ colourBy: by, points3: three }), capsFor("24bit"), 80)
        .map((r) => strip(r)).join("\n");
      expect(other, `${by} draws no categorical key`).not.toContain("alpha");
    }
  });

  it("SC7 (C12 I89): two clouds in one cell resolve to the nearer one's colour", () => {
    // **This row counted colours and the mutation pass said so.** Its first
    // draft asserted `new Set(colours).size > 1` — *both clouds appear* — which
    // is satisfied by a renderer with no depth test at all, because the loser
    // still draws everywhere the winner is not. Containment is not correctness,
    // and a count is not an identity.
    //
    // Eye on +x looking at the origin, so world x is depth and two points
    // differing only in x share a screen position.
    const near = { x: 1, y: 0, z: 0 };
    const far = { x: -1, y: 0, z: 0 };
    const spread = [{ x: 0, y: -1, z: -1 }, { x: 0, y: 1, z: 1 }];
    const at = (points3: readonly Record<string, unknown>[], name: string): readonly string[] =>
      frame(
        spec({
          colourBy: "series", height: 6, points3,
          camera: { azimuth: 0, elevation: 0, distance: 6 },
        }),
        capsFor("24bit"), 80, name,
      );
    // Slot 0 is the first cloud's colour and slot 1 the second's, so the order
    // of the two arms is what tells them apart.
    const nearWins = at([cloud([far, ...spread], "far"), cloud([near], "near")], "a");
    const farAlone = at([cloud([far, ...spread], "far")], "b");
    const nearAlone = at([cloud([...spread], "spread"), cloud([near], "near")], "c");

    /** The colour of the one cell both clouds want. */
    const contested = (rows: readonly string[]): string | undefined => {
      for (const [r, line] of rows.entries()) {
        for (const run of runsOf(line)) {
          if (/[▀▄]/u.test(run.text)) {
            void r;
            return run.colour;
          }
        }
      }
      return undefined;
    };
    // **Asserted as an identity**: the contested cell carries the near cloud's
    // colour and not the far one's, which is what a depth test decides and what
    // a count cannot say.
    const centreOf = (rows: readonly string[]): string => {
      const mid = Math.floor(rows.length / 2); // cells-ok — a row index
      const line = strip(rows[mid] ?? "");
      const col = line.search(/[▀▄]/u);
      const styled = runsOf(rows[mid] ?? "").find((x) => /[▀▄]/u.test(x.text));
      void col;
      return styled?.colour ?? "";
    };
    expect(centreOf(nearAlone), "the near cloud alone inks the shared cell").not.toBe("");
    expect(centreOf(farAlone), "and so does the far one alone").not.toBe("");
    expect(centreOf(nearAlone), "the two clouds are told apart by colour")
      .not.toBe(centreOf(farAlone));
    expect(centreOf(nearWins), "the nearer cloud wins the contested cell")
      .toBe(centreOf(nearAlone));
    expect(contested(nearWins), "and the frame is not empty").toBeDefined();
  });

  it("SC8 (C12 I89, C04 I74): a zero value span is mid-ramp, and a zero position extent is the centre", () => {
    // **This row counted colours and the mutation pass said so.** Its first
    // draft asserted *one reading, one colour* — true at the floor, true at the
    // top, true anywhere. A zero span has exactly one colour whatever rule
    // picks it, so the count says nothing about **which** and the rule this row
    // exists for is which.
    const flat = helix(60).map((p) => ({ ...p, value: 7 }));
    const rows = frame(bare({ colourBy: "value", points3: [cloud(flat)] }), capsFor("24bit"), 80);
    const cs = new Set(
      rows.flatMap((r) => runsOf(r)).filter((x) => /[▀▄]/u.test(x.text)).map((x) => x.colour),
    );
    expect(cs.size, "one reading, one colour").toBe(1); // cells-ok — a colour count
    // **Mid-ramp, identified against the ramp itself** (C04 I74). The expected
    // colour is `continuousColour(map, 0.5)` — the field family's own rule read
    // rather than restated — and the floor is asserted to be a *different*
    // colour, so the row fails on a renderer that picks either end.
    const map = COLORMAPS["viridis"];
    const rgb = (t: number): string => {
      const v = continuousColour(map!, t, capsFor("24bit") as never);
      const hex = (v as { hex?: string } | undefined)?.hex ?? "";
      const n = Number.parseInt(hex.replace("#", ""), 16);
      // eslint-disable-next-line no-bitwise
      return `rgb(${String((n >> 16) & 255)},${String((n >> 8) & 255)},${String(n & 255)})`;
    };
    expect(rgb(0.5), "the ramp's middle and its floor are different colours").not.toBe(rgb(0));
    expect([...cs][0], "a zero value span draws mid-ramp").toBe(rgb(0.5));
    // **And the other zero, which is a different question** (C12 I86): a
    // coplanar cloud takes the axis's centre and draws a plane, not one colour.
    const plane = frame(
      bare({ points3: [cloud(helix(60).map((p) => ({ ...p, z: 0.25 })))] }), capsFor("24bit"), 80,
    );
    expect(inked(plane).length, "the coplanar cloud still draws").toBeGreaterThan(0); // cells-ok
  });

  it("SC9 (C12 I86, I24): every sample culled draws a blank block of the declared height", () => {
    const rows = frame(bare({ camera: { distance: 0 } }), capsFor("24bit"), 80);
    expect(rows.length, "the declared height, not zero rows").toBe(HEIGHT);
    expect(inked(rows), "and nothing in it").toBe("");
  });

  it("SC10 (C12 I84, I11): the depth buffer does not survive a render", () => {
    const kit = measurable({
      definitions: [plotDefinition],
      capabilities: capsFor("24bit") as never,
    });
    const b = block({ kind: "plot", id: "sc10", ...spec() } as unknown as Plot);
    const first = kit.renderToLines(b, 80);
    const second = kit.renderToLines(b, 80);
    // **Asserted on the second**, because a surviving buffer is correct on the
    // first by construction.
    expect(second, "two renders of one block agree").toEqual(first);
    const moved = kit.renderToLines(
      block({ kind: "plot", id: "sc10", ...spec({ camera: { azimuth: 1.1 } }) } as unknown as Plot),
      80,
    );
    expect(moved, "and a second camera does not").not.toEqual(first);
  });

  it("SC11 (C12 I87, I88): the frame read in colour — a stripped capture cannot judge this arm", () => {
    const runs = frame(bare(), capsFor("24bit"), 80)
      .flatMap((r) => runsOf(r))
      .filter((x) => /[▀▄]/u.test(x.text));
    expect(runs.length, "the raster arm emits coloured runs").toBeGreaterThan(0); // cells-ok
    const distinct = new Set(runs.map((x) => x.colour));
    // **The depth ramp is the picture.** A cloud spanning the depth range draws
    // many colours; the stripped frame is the same two glyphs either way, which
    // is why no text assertion reaches this.
    expect(distinct.size, "the depth ramp spans the cloud").toBeGreaterThan(8); // cells-ok — a colour count
    // **The control that makes the count mean something**: a cloud whose depth
    // does not vary draws one colour, and its stripped frame is a legal picture
    // too — so the number above is reading the ramp and not the glyph.
    const flatDepth = frame(
      bare({
        camera: { azimuth: 0, elevation: 0, distance: 6 },
        points3: [cloud([
          { x: 0, y: -1, z: -1 }, { x: 0, y: 1, z: 1 }, { x: 0, y: -1, z: 1 }, { x: 0, y: 1, z: -1 },
        ])],
      }),
      capsFor("24bit"), 80,
    ).flatMap((r) => runsOf(r)).filter((x) => /[▀▄]/u.test(x.text));
    expect(new Set(flatDepth.map((x) => x.colour)).size).toBeLessThan(distinct.size);
  });

  it("SC12 (C12 I87, I2): measure equals the row count over both arms, at every width", () => {
    for (const name of ["24bit", "ascii"]) {
      const kit = measurable({ definitions: [plotDefinition], capabilities: capsFor(name) as never });
      for (const w of [20, 40, 60, 80, 120]) {
        const b = block({ kind: "plot", id: "sc12", ...spec() } as unknown as Plot);
        expect(kit.renderToLines(b, w).length, `${name} @ ${w}`).toBe(kit.measure(b, w));
      }
    }
  });
});
