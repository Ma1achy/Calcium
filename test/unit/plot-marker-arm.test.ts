/**
 * MK1–MK6 — the marker arm, and the refusal whose premise was wrong (C12 I99, §6m).
 *
 * **MK6 is the row the whole feature turns on and it looks like the least
 * interesting one.** `Point3Series` refused a `marker` for four steps on the
 * ground that *the mark **is** the depth reading, so a caller's shape and the
 * tier's shape are one cell with two claims on it*. The table is `3 × 5` and the
 * two index different dimensions of it, so the premise is checkable and false
 * (F486) — and the only way to say so in a test is to fix the shape and watch
 * the **row** still vary with depth. Every other row here would pass against a
 * renderer that had thrown the tier away.
 */
import { describe, expect, it } from "vitest";

import { validateBlock, type Point3 } from "../../src/data/viewmodel/index.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const CAP = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const capsFor = (name: string): Record<string, unknown> =>
  CAP.find((c) => c.name === name)?.caps ?? {};
const frame = frameFor as (s: unknown, c: unknown, w: number, id?: string) => readonly string[];
const strip = stripSgr as (s: string) => string;

/** The unicode table, read from the spec's own listing rather than from the module. */
const NEAR = ["●", "◆", "▲", "■", "★"] as const;
const MID = ["○", "◇", "△", "□", "☆"] as const;
const FAR = ["·", "∙", "•", "˙", "‧"] as const;

const text = (rows: readonly string[]): string => rows.map(strip).join("\n");
/** Every glyph of the table that appears, as a set. */
const drawnGlyphs = (rows: readonly string[]): ReadonlySet<string> => {
  const all = new Set<string>();
  const body = text(rows);
  for (const g of [...NEAR, ...MID, ...FAR]) if (body.includes(g)) all.add(g);
  return all;
};

/** A cloud spread along the view ray, so all three depth tiers are occupied. */
const deep = (n: number, x: number): readonly Point3[] =>
  Array.from({ length: n }, (_v, i) => ({ x, y: (i / (n - 1)) * 2 - 1, z: (i / (n - 1)) * 2 - 1 }));

const spec = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  form: "scatter3d",
  height: 14,
  series: [],
  box3: "none",
  axes3: false,
  colormap: "viridis",
  points3: [{ label: "a", points: deep(24, -0.6) }],
  ...over,
});

const shot = (over: Record<string, unknown> = {}, cap = "24bit"): readonly string[] =>
  frame(spec(over), capsFor(cap), 60, "mk");

const errorsOf = (b: Record<string, unknown>): readonly string[] => {
  // `error`, not `errors` — the key is the one `plot-scatter3d.test.ts` reads,
  // and a helper guessing the plural returns `[]` for every refusal.
  const r = validateBlock(b as never) as { ok: boolean; error?: readonly string[] };
  return r.ok ? [] : (r.error ?? ["refused with no message"]);
};

describe("plot — the marker arm", () => {
  it("MK1 (C12 I99, I87): the member reaches the glyph table at a capability that would not", () => {
    // **The point of the arm.** At 24-bit `auto` takes the colour raster, so the
    // whole marker table — five shapes, three sizes — was unreachable on every
    // terminal anyone actually uses. The row is a pair: same block, same caps,
    // one member.
    const auto = shot();
    const marked = shot({ plotStyle: "marker" });

    expect(text(auto), "auto draws the half-block raster at 24-bit").toMatch(/[▀▄]/u);
    expect(text(marked), "and the named arm draws none").not.toMatch(/[▀▄]/u);
    expect(drawnGlyphs(marked).size, "it draws marker glyphs instead").toBeGreaterThan(0);
    // **The control**, and without it a renderer with one arm passes: the two
    // pictures have to differ, not merely each be non-empty.
    expect(text(marked), "the two arms draw different pictures").not.toBe(text(auto));
  });

  it("MK2 (C12 I99): `marker` names the column, and an unnamed cloud keeps its index's", () => {
    // Two clouds. The first names a shape, the second names none — so the row
    // asserts the lookup *and* its fallback in one frame, which is what stops a
    // renderer that ignores the field and one that applies it to everything
    // from both passing.
    const two = {
      plotStyle: "marker",
      points3: [
        { label: "a", points: deep(24, -0.6), marker: "square" },
        { label: "b", points: deep(24, 0.6) },
      ],
    };
    const g = drawnGlyphs(shot(two));

    expect(g.has(NEAR[3]) || g.has(MID[3]), "the named cloud draws squares").toBe(true);
    expect(g.has(NEAR[1]) || g.has(MID[1]), "and the unnamed one draws its index's diamond").toBe(true);
    expect(g.has(NEAR[0]) || g.has(MID[0]), "and nothing draws series 0's circle").toBe(false);
  });

  it("MK3 (C12 I99): the default is the series index, so an unset block is unchanged", () => {
    // **The row that fails if the field acquires a default of its own.** The
    // shape within a tier has always been the series' position; a caller who
    // names nothing must get exactly the frame they had, which is also why no
    // committed golden moves on this commit.
    const many = {
      plotStyle: "marker",
      points3: [0, 1, 2].map((i) => ({ label: `s${String(i)}`, points: deep(18, i * 0.6 - 0.6) })),
    };
    const g = drawnGlyphs(shot(many));
    for (const [i, name] of [[0, "circle"], [1, "diamond"], [2, "triangle"]] as const) {
      expect(
        g.has(NEAR[i] as string) || g.has(MID[i] as string),
        `series ${String(i)} draws ${name} with no marker set`,
      ).toBe(true);
    }
    expect(g.has(NEAR[3]) || g.has(MID[3]), "and no fourth shape appears").toBe(false);
  });

  it("MK4 (C12 I99, F484): the shape is spent at the far tier", () => {
    // **A stated limit rather than a silence.** `· ∙ • ˙ ‧` is one dot drawn
    // five ways, so a named shape is honoured at near and mid and is a dot at
    // far. The row exists so a reader finds the decision rather than filing it
    // as a bug against behaviour that is right.
    const g = drawnGlyphs(shot({
      plotStyle: "marker",
      points3: [{ label: "a", points: deep(30, -0.6), marker: "square" }],
    }));
    // **The first draft asserted nothing.** It filtered the drawn glyphs down to
    // the far row and then asserted every one of them was in the far row — true
    // by construction, and it would have passed against a renderer that drew a
    // single dot. What the limit actually says is that the column *is* honoured
    // here and does not help, so the row asserts the column.
    expect(g.has(FAR[3]), "the far tier draws the square's own column").toBe(true);
    expect(g.has(FAR[0]), "and not column zero's").toBe(false);
    expect(g.has(NEAR[3]) || g.has(MID[3]), "while the nearer tiers carry the square").toBe(true);
    // **And this is the sentence the row exists for**: the five far glyphs are
    // one reading. Nothing here can assert *looks like a dot*, so what is
    // asserted is that the lookup is correct and the finding records why that
    // is not the same as the feature working (F484).
  });

  it("MK5 (C12 I99, C04 I76): an unknown marker name is refused, unlike an unknown tone", () => {
    // **The difference from F479 is the ruling** (§6m row 7). A tone resolves
    // through `slot`, answers `{}`, and the mark draws uncoloured; a marker name
    // indexes a table, so an unknown one draws *nothing*. Absence
    // indistinguishable from failure, so it is a document error here.
    const bad = errorsOf({
      kind: "plot", id: "p",
      ...spec({ points3: [{ label: "a", points: deep(8, 0), marker: "hexagon" }] }),
    });
    expect(bad.join(" "), "the gate names the member and its legal values").toMatch(/marker/u);
    // The converse, so the refusal is not firing on everything.
    expect(
      errorsOf({
        kind: "plot", id: "p",
        ...spec({ points3: [{ label: "a", points: deep(8, 0), marker: "star" }] }),
      }),
      "a known name is accepted",
    ).toEqual([]);
    // And the field is optional, which the fallback row depends on.
    expect(errorsOf({ kind: "plot", id: "p", ...spec() }), "and absent is legal").toEqual([]);
  });

  it("MK6 (C12 I99, I88, F486): a fixed shape leaves the depth tier varying", () => {
    // **The refusal's premise, checked.** `Point3Series` refused `marker` on the
    // ground that a caller's shape and the tier's shape are *one cell with two
    // claims on it*. The table is `3 × 5`: the tier picks the row and this picks
    // the column. So fix the column across the whole cloud and the row must
    // still vary — which is the one assertion no other row here makes, and the
    // one that fails if a renderer packs the marker over the tier.
    const g = drawnGlyphs(shot({
      plotStyle: "marker",
      points3: [{ label: "a", points: deep(30, -0.6), marker: "triangle" }],
    }));
    const rows = [
      { name: "near", hit: g.has(NEAR[2]) },
      { name: "mid", hit: g.has(MID[2]) },
      { name: "far", hit: [...FAR].some((f) => g.has(f)) },
    ];
    expect(
      rows.filter((r) => r.hit).map((r) => r.name),
      "one shape, and every depth tier still draws its own row",
    ).toEqual(["near", "mid", "far"]);
    // **And no other column appears**, which is what says the column really is
    // fixed rather than the row assertion being satisfied by a spread of shapes.
    for (const i of [0, 1, 3, 4]) {
      expect(
        g.has(NEAR[i] as string) || g.has(MID[i] as string),
        `column ${String(i)} is not drawn`,
      ).toBe(false);
    }
  });
});
