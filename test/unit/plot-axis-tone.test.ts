/**
 * AT1–AT5 — a colour per axis (C12 I98, §6l).
 *
 * **The trap is the depth test and it is why AT1 looks over-specified.** The
 * frame draws last and `writeDepth` is strictly nearer (F452), so an axis only
 * carries its own cells where the data did not take them — at the wrong camera
 * a per-axis tone is correct and *invisible*, and a row taken there passes for a
 * renderer that ignores the field entirely. The rows use a sparse cloud so the
 * axes own their cells, and `box3` is a **parameter** rather than a constant:
 * the box draws first and occludes the axis lines it coincides with, measured 9
 * accent cells down to 1, which is the same tie rule one carrier along.
 */
import { describe, expect, it } from "vitest";

import { validateBlock, type Point3 } from "../../src/data/viewmodel/index.js";
import { slot } from "../../src/presentation/blocks/paint.js";
import { defaultTheme, loadTheme } from "../../src/presentation/theme/index.js";
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

const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error("theme");
const theme = loaded.value.current;

const rgbOfTone = (t: string): string => {
  const hex = (slot(`tone.${t}` as never, theme, capsFor("24bit") as never).colour as
    | { hex?: string }
    | undefined)?.hex;
  const n = Number.parseInt((hex ?? "").replace("#", ""), 16);
  // eslint-disable-next-line no-bitwise
  return `rgb(${String((n >> 16) & 255)},${String((n >> 8) & 255)},${String(n & 255)})`;
};

/** Every inked cell's colour, as a bag. */
const colourCounts = (rows: readonly string[]): Map<string, number> => {
  const out = new Map<string, number>();
  for (const line of rows)
    for (const run of runsOf(line))
      for (const ch of [...run.text]) {
        if (ch === " ") continue;
        const k = run.colour ?? "none";
        out.set(k, (out.get(k) ?? 0) + 1);
      }
  return out;
};
const text = (rows: readonly string[]): string => rows.map(strip).join("\n");

/** Eight points at the corners of the cube — sparse, so the axes keep their cells. */
const SPARSE: readonly Point3[] = [
  { x: -1, y: -1, z: -1 },
  { x: 1, y: -1, z: -1 },
  { x: -1, y: 1, z: -1 },
  { x: 1, y: 1, z: -1 },
  { x: -1, y: -1, z: 1 },
  { x: 1, y: -1, z: 1 },
  { x: -1, y: 1, z: 1 },
  { x: 1, y: 1, z: 1 },
];

const spec = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  form: "plot3d",
  height: 16,
  series: [],
  // **`box3: "none"` and a sparse cloud**, so the frame's cells are the axes'
  // own — §6l row 3, and without it the row is about the camera.
  box3: "none",
  axes3: "corner",
  colormap: "viridis",
  points3: [{ label: "corners", points: SPARSE }],
  ...over,
});

const shot = (over: Record<string, unknown> = {}, cap = "24bit"): readonly string[] =>
  frame(spec(over), capsFor(cap), 60, "at");

describe("plot — a colour per axis", () => {
  it("AT1 (C12 I98, §6l rows 1 and 3): the line takes the tone, and the box does not", () => {
    // **Two arms, and the first draft had neither.** It counted accent cells and
    // asserted the muted count fell by exactly what the accent gained — which
    // looks like the strongest form and is invariant under *moving* colour
    // between frame parts. The mutation pass killed it twice: dropping the ink
    // from the line survived, because the ticks and the label still carried it;
    // and giving the box the axis's tone survived, because the fixture had
    // `box3: "none"` and there was no box to colour. A conservation assertion is
    // satisfied by any redistribution (F481).
    const muted = rgbOfTone("muted");
    const accent = rgbOfTone("accent");
    expect(accent, "the two tones are distinguishable at 24-bit").not.toBe(muted);

    // **Arm one: the line alone.** Ticks off and no label, so every accented
    // cell in the frame is the axis line's own — which is what makes dropping
    // the ink from the stroke visible.
    const lineOnly = { axisStyle3: { x: { tone: "accent", ticks: false } } };
    const bare = shot({ box3: "none", ...lineOnly });
    const plain = shot({ box3: "none" });
    const lineCells = colourCounts(bare).get(accent) ?? 0;
    expect(colourCounts(plain).get(accent) ?? 0, "the plain frame carries no accent").toBe(0);
    expect(lineCells, "the axis line is drawn in its own tone").toBeGreaterThan(2);
    expect(colourCounts(bare).get(muted) ?? 0, "and the other two axes are not").toBeGreaterThan(0);

    // **Arm two: the box is not an axis** (§6l row 1). Turning the box on can
    // only *take* accent cells — the box draws first and a tie goes to whoever
    // drew first (F452), so its edges occlude the axis lines they coincide with,
    // measured 9 down to 1. So the assertion is a **ceiling**: the box adds no
    // accent, and a box edge that took a direction's tone would put its twelve
    // edges well above it.
    const boxed = shot({ box3: "full", ...lineOnly });
    expect(
      colourCounts(boxed).get(accent) ?? 0,
      "the box adds no accent — it can only occlude",
    ).toBeLessThanOrEqual(lineCells);
    expect(
      colourCounts(boxed).get(muted) ?? 0,
      "and it does add muted cells, so the box is really drawn",
    ).toBeGreaterThan(colourCounts(bare).get(muted) ?? 0);
  });

  it("AT2 (C12 I98, §6l row 2): the label carries its axis's tone", () => {
    // **The label is drawn by a separate pass with its own ink**, so it is the
    // one part of the frame that could keep the old colour while the line
    // changed — which is what makes the pair the assertion rather than the
    // presence of any accent cell at all.
    const withLabel = shot({
      axisStyle3: { x: { tone: "accent", label: "XX", ticks: false } },
    });
    const noTone = shot({ axisStyle3: { x: { label: "XX", ticks: false } } });

    const accent = rgbOfTone("accent");
    const labelCells = (rows: readonly string[]): number => {
      let n = 0;
      for (const line of rows)
        for (const run of runsOf(line))
          for (const ch of [...run.text]) if (ch === "X" && run.colour === accent) n += 1;
      return n;
    };
    expect(text(withLabel), "the label is drawn").toContain("XX");
    expect(labelCells(withLabel), "and it is in the axis's tone").toBeGreaterThan(0);
    expect(labelCells(noTone), "and it is not when the axis has none").toBe(0);
  });

  it("AT3 (C12 I98, §6l row 5): the tone is a colour rung's and nothing below it", () => {
    const styled = { axisStyle3: { x: { tone: "accent" }, y: { tone: "ok" }, z: { tone: "warn" } } };
    // The control first: at 24-bit the tones change the frame.
    expect(text(shot(styled)), "24-bit is unchanged in text").toBe(text(shot()));
    expect(
      colourCounts(shot(styled)).size,
      "and carries more colours than the untoned frame",
    ).toBeGreaterThan(colourCounts(shot()).size);

    // At 1bit there is no colour to carry, so the frame is identical — the
    // labels are what keep the axes apart on that rung, as they already did.
    for (const cap of ["1bit", "ascii"]) {
      expect(text(shot(styled, cap)), `${cap} text`).toBe(text(shot({}, cap)));
      expect(
        [...colourCounts(shot(styled, cap)).keys()].sort(),
        `${cap} colours`,
      ).toEqual([...colourCounts(shot({}, cap)).keys()].sort());
    }
  });

  it("AT4 (C12 I98, C04 I77): an unknown tone is refused nowhere, and that is asserted", () => {
    // **A known limit rather than a silence** (F479). No `Tone` is validated
    // anywhere in the tree — six carriers were measured and all accept an
    // invented one — so checking this field alone would teach a rule that holds
    // in one of seven places. The row exists so a reader finds the decision.
    const bad = validateBlock({
      kind: "plot",
      id: "p",
      ...spec({ axisStyle3: { x: { tone: "chartreuse" } } }),
    } as never) as { ok: boolean };
    expect(bad.ok, "the gate accepts an unknown tone").toBe(true);
    // And `slot` answers with no colour rather than throwing, so the mark draws
    // uncoloured — the third outcome, and the one that leaves no trace.
    expect(
      slot("tone.chartreuse" as never, theme, capsFor("24bit") as never).colour,
      "and slot resolves it to nothing",
    ).toBeUndefined();
    // The frame still draws, which is what makes the failure silent.
    expect(text(shot({ axisStyle3: { x: { tone: "chartreuse" } } })).trim().length).toBeGreaterThan(0);
  });

  it("AT5 (C12 I98): the default is the frame's own colour", () => {
    // **The row that fails if the field acquires a default of its own.** A
    // caller who sets a label and no tone must get the frame they had.
    const styled = shot({ axisStyle3: { x: { label: "x" }, y: { label: "y" }, z: { label: "z" } } });
    const counts = colourCounts(styled);
    const muted = rgbOfTone("muted");
    expect(counts.get(muted) ?? 0, "every frame cell is muted").toBeGreaterThan(0);
    for (const tone of ["accent", "ok", "warn", "info", "error"]) {
      expect(counts.get(rgbOfTone(tone)) ?? 0, `no ${tone} appears by default`).toBe(0);
    }
  });
});
