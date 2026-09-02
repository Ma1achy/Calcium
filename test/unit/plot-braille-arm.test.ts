/**
 * BR1–BR6 — the braille arm, and the row that would have caught F489 (C12 I100, §6m).
 *
 * **BR6 is a histogram and it looks over-specified.** Every other row here is
 * satisfied by a renderer whose surface stipples: the glyphs are braille, the
 * colours are right, the grid is finer, and the picture is *plausible* — a
 * reader half-expecting the dot grid to stipple a fill would accept it. What
 * separated the two was counting which of the eight dot positions were actually
 * set, where the bottom row measured **3 against 76** for the rows above it
 * (F489). A count of inked cells agrees with both.
 *
 * **The wireframe is the control in that row**, because a genuinely sparse
 * figure must come out uneven-but-present across all eight — otherwise the
 * evenness assertion is passing on an instrument that cannot see a dot row.
 */
import { describe, expect, it } from "vitest";

import { validateBlock, type Point3 } from "../../src/data/viewmodel/index.js";
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

const text = (rows: readonly string[]): string => rows.map(strip).join("\n");

/** Every braille cell's mask, as a bag. `0` — the blank glyph — is never emitted. */
const masks = (rows: readonly string[]): readonly number[] => {
  const out: number[] = [];
  for (const ch of text(rows)) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0x2800 || cp > 0x28ff) continue;
    out.push(cp - 0x2800);
  }
  return out;
};

/** Bit -> which of the 2x4 dot positions it is. Read off the standard mapping. */
const DOTS: readonly (readonly [number, string])[] = [
  [0x01, "r0c0"], [0x02, "r1c0"], [0x04, "r2c0"], [0x40, "r3c0"],
  [0x08, "r0c1"], [0x10, "r1c1"], [0x20, "r2c1"], [0x80, "r3c1"],
];

/** How often each of the eight dot positions is set across the frame. */
const dotCounts = (rows: readonly string[]): Readonly<Record<string, number>> => {
  const out: Record<string, number> = {};
  for (const [, at] of DOTS) out[at] = 0;
  for (const m of masks(rows)) {
    for (const [bit, at] of DOTS) if ((m & bit) !== 0) out[at] = (out[at] ?? 0) + 1;
  }
  return out;
};

/** Every inked cell's colour, as a set. */
const inkColours = (rows: readonly string[]): ReadonlySet<string> => {
  const out = new Set<string>();
  for (const line of rows)
    for (const run of runsOf(line))
      for (const ch of [...run.text]) {
        if (ch === " " || run.colour === null) continue;
        out.add(run.colour);
      }
  return out;
};

const cube = (r: number): readonly Point3[] => {
  const c: Point3[] = [];
  for (const x of [-r, r]) for (const y of [-r, r]) for (const z of [-r, r]) c.push({ x, y, z });
  return c;
};

/** The cube's twelve edges as separate paths — outline all the way through. */
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

/** A Gaussian height field — a fill, which is what the surface rows need. */
const dome = (n: number): readonly (readonly number[])[] =>
  Array.from({ length: n }, (_r, r) =>
    Array.from({ length: n }, (_c, c) => {
      const x = (c / (n - 1)) * 4 - 2;
      const y = (r / (n - 1)) * 4 - 2;
      return Math.exp(-(x * x + y * y) / 2);
    }));

const spec = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  form: "scatter3d",
  height: 14,
  series: [],
  colormap: "viridis",
  points3: [{ label: "corners", points: cube(0.8) }],
  ...over,
});

const shot = (over: Record<string, unknown> = {}, cap = "24bit"): readonly string[] =>
  frame(spec(over), capsFor(cap), 60, "br");

const errorsOf = (b: Record<string, unknown>): readonly string[] => {
  const r = validateBlock(b as never) as { ok: boolean; error?: readonly string[] };
  return r.ok ? [] : (r.error ?? ["refused with no message"]);
};

describe("plot — the braille arm", () => {
  it("BR1 (C12 I100, I87): the member reaches the dot grid where the terminal would not", () => {
    const auto = shot();
    const dots = shot({ plotStyle: "braille" });

    expect(text(auto), "auto takes the half-block rung at 24-bit").toMatch(/[▀▄]/u);
    expect(text(dots), "and the named arm takes none of it").not.toMatch(/[▀▄]/u);
    expect(masks(dots).length, "it draws braille cells instead").toBeGreaterThan(0); // cells-ok — a cell count
    // **The control**, without which a renderer with one arm satisfies every
    // assertion above by drawing whatever the branch would have chosen anyway.
    expect(text(dots), "the two arms draw different pictures").not.toBe(text(auto));

    // **The frame keeps its own glyphs** (§6m row 2). Its samples are withheld
    // from the dot grid, so an axis line is still `│` or `─` — lighting them
    // would draw the axis twice, once as a stroke and once as dots.
    expect(text(dots), "the frame is box glyphs and not dots").toMatch(/[│─]/u);

    // **An empty cell is a space and not `⠀`.** U+2800 is a blank braille glyph:
    // it measures one cell and reads as ink-less texture rather than as nothing,
    // and every other sparse raster in this component emits a space.
    expect(text(dots), "no blank braille glyph is emitted").not.toMatch(/\u2800/u);
  });

  it("BR2 (C12 I100, I84): the grid is four dot rows deep, which is the whole claim", () => {
    // **The arm's claim is resolution, so the row asserts resolution.** A cell
    // carries four dot rows; a renderer that rasterised into the half rung's
    // grid and folded it to braille would light at most two of them and every
    // other row here would still pass.
    const seen = new Set<string>();
    const counts = dotCounts(shot({ plotStyle: "braille", lines3: cubeEdges(0.8), points3: [] }));
    for (const [, at] of DOTS) if ((counts[at] ?? 0) > 0) seen.add(at);
    expect([...seen].sort(), "every one of the eight dot positions is reachable").toEqual(
      [...DOTS].map(([, at]) => at).sort(),
    );
  });

  it("BR3 (C12 I100): a cell's colour is a sample's and never a mean of two", () => {
    // **The assertion is the *absence* of a third colour.** Two clouds, two
    // palette slots; a renderer averaging a cell's samples produces colours that
    // are neither, and the count is what says so — where asserting that each
    // cloud's colour appears is satisfied by an averaging renderer too.
    const two = shot({
      plotStyle: "braille",
      colourBy: "series",
      points3: [
        { label: "a", points: cube(0.8).slice(0, 4) },
        { label: "b", points: cube(0.4).slice(4) },
      ],
      axes3: false,
      box3: "none",
    });
    expect(inkColours(two).size, "two clouds, two colours, no third").toBe(2);
  });

  it("BR4 (C12 I100): the marker tiers double, so apparent size survives the rung", () => {
    // **A bounding box in cells, not a count of them.** The first draft counted
    // inked cells and read 2 against 4 — which looks like a marker at twice the
    // size and is a marker at the same size straddling a finer lattice: a
    // half-block sample is a whole cell wide and cannot straddle horizontally,
    // where two braille dots starting at an odd dot column occupy two cells.
    // The claim is that the mark is the same **size**, so the box is what to
    // measure.
    const boxOf = (rows: readonly string[]): readonly [number, number] => {
      let r0 = Infinity;
      let r1 = -1;
      let c0 = Infinity;
      let c1 = -1;
      rows.map(strip).forEach((line, r) => {
        [...line].forEach((ch, c) => {
          if (ch === " ") return;
          r0 = Math.min(r0, r); // cells-ok — a row index
          r1 = Math.max(r1, r); // cells-ok — a row index
          c0 = Math.min(c0, c); // cells-ok — a column index
          c1 = Math.max(c1, c); // cells-ok — a column index
        });
      });
      return r1 < 0 ? [0, 0] : [c1 - c0 + 1, r1 - r0 + 1]; // cells-ok — a cell extent
    };
    const bare = (points: readonly Point3[]): Record<string, unknown> => ({
      points3: [{ label: "a", points }], axes3: false, box3: "none",
    });
    // **The assertion that bites is a full cell, and the box is the second
    // half.** The first draft was the box alone, and the mutation pass killed
    // it: a mark is at least one cell whatever the tier says, so quartering the
    // area moves a bounding box by nothing the straddle tolerance can see. A
    // **near** marker at the doubled table is `4 × 4` dots — exactly one cell,
    // all eight positions — and at the half rung's table it is `2 × 2`, which
    // cannot fill a cell at any alignment. Measured: 8 full cells against 0.
    const near = [
      ...Array.from({ length: 30 }, (_v, i) => {
        const t = (i / 30) * Math.PI * 2;
        return { x: Math.cos(t) * 0.9, y: Math.sin(t) * 0.9, z: -0.9 };
      }),
      ...Array.from({ length: 10 }, (_v, i) => {
        const t = (i / 10) * Math.PI * 2;
        return { x: Math.cos(t) * 0.3, y: Math.sin(t) * 0.3, z: 0.9 };
      }),
    ];
    const cloud = shot({ ...bare(near), plotStyle: "braille" });
    const cellMasks = masks(cloud).filter((m) => m !== 0);
    expect(
      cellMasks.filter((m) => m === 0xff).length, // cells-ok — a cell count
      "a near marker fills its cell, which needs all four dot rows",
    ).toBeGreaterThan(0);
    // **The control: it is not filling everything.** Without it the assertion
    // above passes against a renderer that lights every dot of every cell it
    // touches, which is a different defect wearing the same number.
    expect(
      cellMasks.filter((m) => m !== 0xff).length, // cells-ok — a cell count
      "and the farther tiers do not",
    ).toBeGreaterThan(0);

    // Two fixtures: one point takes the mid tier, three spread along the view
    // ray take all three — so the row reads the table rather than one row of it.
    for (const [name, points] of [
      ["mid alone", [{ x: 0, y: 0, z: 0 }]],
      ["every tier", [{ x: -1, y: -1, z: -1 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }]],
    ] as const) {
      const half = boxOf(shot(bare(points)));
      const dots = boxOf(shot({ ...bare(points), plotStyle: "braille" }));
      expect(half[0] * half[1], `${name}: the half rung draws the marker`).toBeGreaterThan(0); // cells-ok — a cell area
      for (const axis of [0, 1] as const) {
        // **Never smaller, and never more than a cell larger.** Measured
        // `[1,2]` against `[2,2]` and `[2,2]` against `[2,3]`; without the
        // doubling the dot grid's mid tier is one dot by two, which cannot
        // reach the half rung's box on either axis.
        expect(
          dots[axis], `${name}: axis ${String(axis)} is not shrunk by the finer rung`,
        ).toBeGreaterThanOrEqual(half[axis] as number); // cells-ok — a cell extent
        expect(
          dots[axis], `${name}: axis ${String(axis)} is not grown either`,
        ).toBeLessThanOrEqual((half[axis] as number) + 1); // cells-ok — a cell extent
      }
    }
  });

  it("BR5 (C12 I100, §6m row 6): below its floor the arm degrades and does not refuse", () => {
    // **A capability is not a document error.** Refusing here would make one
    // block valid on one terminal and invalid on another, which C04 cannot
    // express — so the gate accepts the member and the renderer falls to `auto`.
    expect(
      errorsOf({ kind: "plot", id: "p", ...spec({ plotStyle: "braille" }) }),
      "the gate accepts the member",
    ).toEqual([]);
    const ascii = shot({ plotStyle: "braille" }, "ascii");
    expect(masks(ascii).length, "and ascii draws no braille").toBe(0); // cells-ok — a cell count
    expect(text(ascii).trim().length, "but it does draw").toBeGreaterThan(0);
    // The converse: the same block at a terminal above the floor does.
    expect(masks(shot({ plotStyle: "braille" }, "1bit")).length, "1-bit is above the floor")
      .toBeGreaterThan(0); // cells-ok — a cell count
  });

  it("BR6 (C12 I100, §6m rows 1 and 2): a fill is solid, and the eight positions are even", () => {
    // **The row F489 exists in.** Every other row passes against a renderer
    // whose surface stipples; only counting which dot positions are set can tell
    // a fill from a plausible texture, and the defect measured 3 against 76.
    const surface = shot({
      plotStyle: "braille",
      axes3: false,
      box3: "none",
      points3: [],
      surfaces3: [{ heights: dome(21) }],
    });
    const counts = dotCounts(surface);
    const values = [...DOTS].map(([, at]) => counts[at] ?? 0);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    expect(lo, "every dot position is set by a fill").toBeGreaterThan(0); // cells-ok — a dot count
    // **Evenness, as a ratio rather than an equality** — a silhouette makes the
    // edge rows slightly lighter, and the defect was two orders out.
    expect(hi / lo, "and no position is starved").toBeLessThan(1.5);
    expect(
      masks(surface).filter((m) => m === 0xff).length, // cells-ok — a cell count
      "the interior is full cells",
    ).toBeGreaterThan(0);

    // **The control: a genuinely sparse figure is uneven and still reaches all
    // eight.** Without it the evenness above could be an instrument that cannot
    // see a dot row, which is the shape the defect actually had.
    const wire = dotCounts(shot({
      plotStyle: "braille", axes3: false, box3: "none", points3: [], lines3: cubeEdges(0.8),
    }));
    const wireValues = [...DOTS].map(([, at]) => wire[at] ?? 0);
    expect(Math.min(...wireValues), "the wireframe reaches every position").toBeGreaterThan(0); // cells-ok — a dot count
    expect(
      Math.max(...wireValues) / Math.min(...wireValues),
      "and is uneven, which is what a sparse figure looks like",
    ).toBeGreaterThan(1.2);
  });
});
