/**
 * LN1–LN6 — the box-drawing arm, and the row the whole refusal turned on (C12 I101, §3am).
 *
 * **LN2 is that row.** §3am refused this arm on four arguments, and the one that
 * was a *mechanism* rather than a reason reads: a mask cell accumulates up to
 * four edge bits resolved after all strokes, and a strictly-nearer depth test
 * refuses the second edge at exactly the shared vertex a join needs. Its own
 * remedy — equal-or-nearer for the mask, strictly-nearer for the colour, on one
 * buffer — is what LN2 asserts, and the only way to assert it is to look for a
 * glyph that **cannot exist** unless two edges reached one cell. That glyph is
 * the **tee** and not the corner, which the first draft had wrong: a lone
 * diagonal staircases, and the corner cell it routes through is `╭` from one
 * stroke. 36 corners against 8 tees on the cube, and 0 of each on one edge.
 *
 * Every other row here passes with the tie rule reverted: the alphabet is still
 * box drawing, the corners still degrade, the markers still win their cells. The
 * figure simply comes apart at its vertices, which reads as a rendering artefact
 * rather than as a wrong rule.
 */
import { describe, expect, it } from "vitest";

import { validateBlock, type Point3 } from "../../src/data/viewmodel/index.js";
import { createDepth, strokeSeg } from "../../src/presentation/plot/project3.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const CAP = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const capsFor = (name: string): Record<string, unknown> =>
  CAP.find((c) => c.name === name)?.caps ?? {};
const frame = frameFor as (s: unknown, c: unknown, w: number, id?: string) => readonly string[];
const strip = stripSgr as (s: string) => string;
const text = (rows: readonly string[]): string => rows.map(strip).join("\n");

/**
 * A glyph that **cannot** be drawn from one edge — three bits in one cell.
 *
 * **A corner is not one of these and the first draft thought it was.** A single
 * diagonal edge staircases, and the corner cell it routes through carries a
 * horizontal bit and a vertical one — `╭` from one stroke. Measured on the cube:
 * 36 corners, **8 tees**, 0 crossings; on one edge, 0 of each. So the tee is what
 * says two edges reached one cell, and LN2's whole subject is the tee.
 */
const TEES = "├┤┬┴┼";
/** Corners and tees together — everything that is not a straight run or a stub. */
const JOINS = "╭╮╰╯┌┐└┘├┤┬┴┼";
/** The straight runs and stubs, which one edge can produce on its own. */
const STRAIGHTS = "│─╴╶";

const countOf = (rows: readonly string[], set: string): number => {
  let n = 0;
  for (const ch of text(rows)) if (set.includes(ch)) n += 1; // cells-ok — a cell count
  return n;
};

const cube = (r: number): readonly Point3[] => {
  const c: Point3[] = [];
  for (const x of [-r, r]) for (const y of [-r, r]) for (const z of [-r, r]) c.push({ x, y, z });
  return c;
};

/** The cube's twelve edges, each its own path — so eight vertices are shared. */
const cubeEdges = (r: number): readonly { label: string; points: readonly Point3[] }[] => {
  const c = cube(r);
  const out: { label: string; points: readonly Point3[] }[] = [];
  for (let i = 0; i < 8; i += 1)
    for (let j = i + 1; j < 8; j += 1) {
      const a = c[i] as Point3;
      const b = c[j] as Point3;
      const d = (a.x !== b.x ? 1 : 0) + (a.y !== b.y ? 1 : 0) + (a.z !== b.z ? 1 : 0);
      if (d === 1) out.push({ label: `e${String(out.length)}`, points: [a, b] });
    }
  return out;
};

const spec = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  form: "scatter3d",
  height: 14,
  series: [],
  colormap: "viridis",
  axes3: false,
  box3: "none",
  lines3: cubeEdges(0.9),
  ...over,
});

const shot = (over: Record<string, unknown> = {}, cap = "24bit"): readonly string[] =>
  frame(spec(over), capsFor(cap), 60, "ln");

const errorsOf = (b: Record<string, unknown>): readonly string[] => {
  const r = validateBlock(b as never) as { ok: boolean; error?: readonly string[] };
  return r.ok ? [] : (r.error ?? ["refused with no message"]);
};

describe("plot — the box-drawing arm", () => {
  it("LN1 (C12 I101, I87): the member reaches box drawing where the terminal would not", () => {
    const auto = shot();
    const masked = shot({ plotStyle: "line" });
    expect(text(auto), "auto takes the half-block rung at 24-bit").toMatch(/[▀▄]/u);
    expect(text(masked), "and the named arm takes none of it").not.toMatch(/[▀▄]/u);
    expect(countOf(masked, JOINS + STRAIGHTS), "it draws box drawing instead")
      .toBeGreaterThan(0); // cells-ok — a cell count
    expect(text(masked), "the two arms draw different pictures").not.toBe(text(auto));
  });

  it("LN2 (C12 I101, §3am): the tie is painted for the mask and refused for the colour", () => {
    // **The mechanism, at the function** — because the picture cannot say it
    // categorically and it took three fixtures to find that out. An L, a closed
    // triangle and a four-way star all draw *identically* under the two rules
    // (0/0, 19/1 against 18/1, 2/0). What the rule is actually worth is measured
    // on the cube below; what it *is* is exact, and this is where to assert it.
    const grid = { width: 8, height: 8 };
    const depth = createDepth(grid.width, grid.height);
    const a = { x: 0.1, y: 0.5, depth: 3 };
    const b = { x: 0.9, y: 0.5, depth: 3 };
    // First stroke claims the row.
    strokeSeg(a, b, grid, depth, () => { /* claim */ }, false);

    // A second stroke over exactly the same samples, at exactly the same depth.
    const strict: boolean[] = [];
    strokeSeg(a, b, grid, depth, (_i, _t, _z, nearer) => { strict.push(nearer); }, false);
    expect(strict, "strictly nearer: the tie is not painted at all").toEqual([]);

    const equal: boolean[] = [];
    strokeSeg(a, b, grid, depth, (_i, _t, _z, nearer) => { equal.push(nearer); }, true);
    expect(equal.length, "equal-or-nearer: every tied sample is painted").toBeGreaterThan(0); // cells-ok — a sample count
    expect(
      equal.every((n) => !n),
      "and every one of them reports that it merely tied",
    ).toBe(true);

    // **The control: a genuinely nearer second stroke is painted under both**,
    // which is what says the first assertion read the tie rather than the arm.
    for (const onEqual of [false, true]) {
      const nearerHits: boolean[] = [];
      strokeSeg(
        { ...a, depth: 2 }, { ...b, depth: 2 }, grid, createDepth(grid.width, grid.height),
        (_i, _t, _z, nearer) => { nearerHits.push(nearer); }, onEqual,
      );
      expect(nearerHits.every((n) => n), `onEqual=${String(onEqual)}: a nearer stroke paints`).toBe(true);
      expect(nearerHits.length, `onEqual=${String(onEqual)}: and it paints`).toBeGreaterThan(0); // cells-ok — a sample count
    }
  });

  it("LN2b (C12 I101, §3am): and the arm is wired to it, worth 7 corners and 3 tees", () => {
    // **The wiring, and the number is the honest form of §3am's claim.** That
    // refusal says a strict test refuses the second edge *at exactly the shared
    // vertex a join needs*, which reads as a figure coming apart. Measured on
    // the cube's twelve edges, the two rules give:
    //
    //     equal-or-nearer   36 corners ·  8 tees · 55 straights
    //     strictly nearer   29 corners ·  5 tees · 57 straights
    //
    // So the mechanism is exact and its consequence is **7 corners and 3 tees**
    // — about a tenth of the drawn glyphs — rather than the presence of joins.
    // The threshold is between the two measurements and both are written here,
    // because a bound whose other side is unrecorded is a bound nobody can
    // check. A row asserting the mechanism at the function would not have caught
    // the call site passing `false`, which is why this row exists beside LN2.
    const rows = shot({ plotStyle: "line" });
    expect(countOf(rows, "╭╮╰╯"), "the cube's corners").toBeGreaterThan(32); // cells-ok — a cell count
    expect(countOf(rows, TEES), "and its tees").toBeGreaterThan(5); // cells-ok — a cell count
    // **The control is one edge**, which draws and has no vertex to share.
    const single = shot({
      plotStyle: "line",
      lines3: [{ label: "one", points: [{ x: -0.9, y: -0.9, z: 0 }, { x: 0.9, y: 0.9, z: 0 }] }],
    });
    expect(countOf(single, STRAIGHTS + JOINS), "one edge draws").toBeGreaterThan(0); // cells-ok — a cell count
    expect(countOf(single, TEES), "and a single stroke draws no tee").toBe(0); // cells-ok — a cell count
  });

  it("LN3 (C12 I101, I54): the alphabet degrades and the arm does not", () => {
    // **No capability floor, because `glyphForMask` already has one.** It falls
    // to `+ - |` at `ascii` and at `ambiguousWidth: "wide"` — both are the same
    // question one layer down — so a named arm never refuses for a terminal.
    for (const cap of ["ascii", "wide"]) {
      const rows = shot({ plotStyle: "line" }, cap);
      expect(text(rows), `${cap} draws no box drawing`).not.toMatch(/[╭╮╰╯┌┐└┘├┤┬┴┼│─]/u);
      expect(text(rows), `${cap} draws the ASCII substitute`).toMatch(/[+\-|]/u);
    }
    // The converse, so the row is reading the alphabet rather than the arm.
    expect(text(shot({ plotStyle: "line" })), "24-bit keeps the box drawing").toMatch(/[╭╮╰╯]/u);
  });

  it("LN4 (C12 I101, I54): `plotCorners` chooses within the alphabet", () => {
    const rounded = shot({ plotStyle: "line" });
    const sharp = shot({ plotStyle: "line", plotCorners: "sharp" });
    expect(countOf(rounded, "╭╮╰╯"), "the default is rounded").toBeGreaterThan(0); // cells-ok — a cell count
    expect(countOf(rounded, "┌┐└┘"), "and draws none of the sharp ones").toBe(0); // cells-ok — a cell count
    expect(countOf(sharp, "┌┐└┘"), "`sharp` swaps them").toBeGreaterThan(0); // cells-ok — a cell count
    expect(countOf(sharp, "╭╮╰╯"), "and drops the rounded ones").toBe(0); // cells-ok — a cell count
  });

  it("LN5 (C12 I101, F488, F452): a marker keeps its cell against a line through it", () => {
    // **Data, then the mask, then the frame.** A trajectory's vertices sit at
    // exactly its own cloud's depths, so the two meet in one cell by
    // construction — and the marker wins, which is `glyphRows`' precedence and
    // *the axes never occlude the data* one carrier along.
    const path = cube(0.9);
    const both = shot({
      plotStyle: "line",
      points3: [{ label: "cloud", points: path }],
      lines3: [{ label: "path", points: path, closed: true }],
    });
    expect(text(both), "the markers draw").toMatch(/[●◆▲■★○◇△□☆]/u);
    expect(countOf(both, JOINS), "and the path still joins where the cloud is not")
      .toBeGreaterThan(0); // cells-ok — a cell count
  });

  it("LN6 (C12 I101): a diagonal routes through its corner rather than crossing", () => {
    // **Read off the frame before it was asserted.** `strokeSeg` steps on the
    // dominant screen axis, so a diagonal advances both — a move across a
    // *corner* the walk does not visit. Linking the two cells directly gives
    // each of them both axes' bits, and a run of diagonal steps came out as a
    // column of `┼`. Routing through the corner, depth-tested like any other
    // sample, is what makes a staircase read as one.
    // **The count, because the fallback is not a crossing.** `step` takes one
    // axis, so an unrouted diagonal links horizontally alone and the vertical
    // half of every staircase is simply lost — dashes rather than `┼`, which is
    // why the first draft's *crossings below corners* survived its own mutation.
    // Measured with the routing: **36 corners against 8 tees and 55 straights**
    // on the cube, whose twelve edges are all diagonal on screen.
    const rows = shot({ plotStyle: "line" });
    const corners = countOf(rows, "╭╮╰╯"); // cells-ok — a cell count
    expect(corners, "a diagonal staircase is corners and not a dashed run")
      .toBeGreaterThan(20); // cells-ok — a cell count
    expect(corners, "and they outnumber the vertices' own tees")
      .toBeGreaterThan(countOf(rows, TEES)); // cells-ok — a cell count
    // **And the arm is still a document the gate accepts**, which is what says
    // `plotStyle: "line"` is listed rather than tolerated.
    expect(errorsOf({ kind: "plot", id: "p", ...spec({ plotStyle: "line" }) })).toEqual([]);
  });
});
