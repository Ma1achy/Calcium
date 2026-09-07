/**
 * TC1–TC6 — **the SVG arm's colour is C10's** (C12 §3aj hazard 5).
 *
 * Phase 3 shipped four families and four hex literals: a five-slot `SERIES_INK`
 * beside C10's eight, plus a ground, a rule and a label chosen by hand. So the
 * two arms were **the same picture in two colour schemes**, and a sixth series
 * wrapped to a different slot in each — the legend saying one thing and the
 * figure another, with nothing able to see it because every assertion about a
 * colour was made against a colour the same file chose.
 *
 * **The rows are named `TC` and not `C`.** `image-compositions.test.ts` already
 * has a C1, C1b, C2 and C3 from phase 2, and two different C1s in one suite is a
 * citation that resolves against the wrong thing.
 */
import { describe, expect, it } from "vitest";
import { plotToSvg } from "../../src/presentation/plot/svg.js";
import { refOf } from "../../src/presentation/plot/marks.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { COLORMAPS, continuousColour } from "../../src/presentation/theme/colormap.js";
import { resolve } from "../../src/presentation/theme/index.js";
import { b } from "../../src/shell/builders/index.js";
import { themeHexes } from "../support/theme.js";
import { DARK_THEME, LIGHT_THEME, FULL_CAPS, registry } from "../support/render.js";
import { fires, sourceOf, HEX_LITERAL } from "../support/source.js";
import type { Plot } from "../../src/data/viewmodel/index.js";
import type { ResolvedTheme } from "../../src/presentation/theme/index.js";

const DEPTH = { colourDepth: 24 } as const;
const SVG_SRC = "src/presentation/plot/svg.ts";

const hexOf = (ref: string, theme: ResolvedTheme): string => {
  const { colour } = resolve(ref as `${string}.${string}`, theme, DEPTH);
  if (colour === undefined || colour.kind !== "rgb") throw new Error(`no rgb for ${ref}`);
  return colour.hex.toLowerCase();
};

/** Every `fill=` and `stroke=` value in an SVG, lowercased, `none` dropped. */
// **A `url(#…)` is a reference and not a colour, so it is followed rather than
// skipped** (§3ak.37). The colour key fills its bar from a `<linearGradient>`,
// and the paint that reaches the page is the gradient's **stops** — so dropping
// the reference and taking the stops keeps this row's claim true and makes it
// stronger: it now checks the colours actually painted rather than the name of
// the thing painting them. Skipping the reference and stopping there would have
// let a whole ramp of foreign colours through under one unchecked attribute.
const paints = (svg: string): readonly string[] => [
  ...[...svg.matchAll(/(?:fill|stroke)="([^"]*)"/gu)]
    .map((m) => (m[1] ?? "").toLowerCase())
    .filter((v) => v !== "none" && !v.startsWith("url(")),
  ...[...svg.matchAll(/stop-color="([^"]*)"/gu)].map((m) => (m[1] ?? "").toLowerCase()),
];

// **`axes: true`, and it is load-bearing rather than tidy** (C12 I67). This arm
// used to draw a gridline per tick whatever the block said, so a fixture with no
// furniture still produced one and `TC1` could assert its colour. The furniture
// is the figure's now — `frameOf` answers `"none"` when `axes` is unset, which is
// what the terminal does — so a block that asks for no furniture has none to
// paint, and a colour row needs a block that has some.
const series = (n: number, values: readonly number[]): Plot =>
  b.plot({
    id: "tc", form: "line", height: 8, axes: true,
    series: Array.from({ length: n }, (_, i) => ({ label: `s${i}`, values: [...values] })),
  });

/** The terminal arm's own frame, as one string with its SGR intact. */
const terminalFrame = (block: Plot, theme: ResolvedTheme): string =>
  renderToLines(registry([plotDefinition as never]), block, 60, {
    theme, capabilities: FULL_CAPS,
  }).join("\n");

/**
 * Every truecolour in a frame — **foreground and background both**.
 *
 * The first draft read `38;2` alone and reported that the terminal had not
 * painted a single colormap value. It had painted all four: a heatmap fills its
 * cells with `48;2` and a space, because a field's datum is the cell rather than
 * a glyph in it. **A matcher that sees one encoding reports absence when the
 * value changes form**, and the absence reads exactly like a real divergence.
 */
const sgrHexes = (frame: string): ReadonlySet<string> => {
  const out = new Set<string>();
  for (const m of frame.matchAll(/\x1b\[[0-9;]*?[34]8;2;(\d+);(\d+);(\d+)/gu)) {
    const [r, g, bl] = [Number(m[1]), Number(m[2]), Number(m[3])];
    out.add(`#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
  }
  return out;
};

describe("TC — the SVG arm takes its colour from the theme", () => {
  it("TC1: a series's ink is the slot C10 resolves, not a colour this file chose", () => {
    const svg = plotToSvg(series(3, [1, 5, 2, 9, 4]), DARK_THEME) ?? "";
    const strokes = [...svg.matchAll(/<path [^>]*stroke="(#[0-9a-f]{6})"/gu)].map((m) => m[1]);
    expect(strokes.length, "one path per series").toBe(3);
    for (const [i, stroke] of strokes.entries()) {
      expect(stroke, `series ${i} takes ${refOf(i)}`).toBe(hexOf(refOf(i), DARK_THEME));
    }

    // **The furniture's three slots, named.** `TC5` only asks that a colour is
    // *in* the theme, and a tone is in the theme — so a label drawn in
    // `tone.error` passes every membership check while telling the reader
    // something is wrong with the axis. **Which slot is a separate claim from
    // which palette**, and the terminal's own reason is the one being matched:
    // *furniture is not a series*, so it is muted, and the rule and the ground
    // are surfaces because they are drawn on the page rather than said about
    // the data.
    // **`surface.bg` and not `surface.bgDeep`** (C10 I34, §4f): the page carries
    // every label this arm writes, and `bgDeep` is the one surface C10 §4
    // excludes from every floor. The ref is asserted, not the hex.
    expect(svg, "the ground is a surface").toContain(`fill="${hexOf("surface.bg", DARK_THEME)}"`);
    expect(svg, "the frame is the border surface").toContain(`stroke="${hexOf("surface.border", DARK_THEME)}"`);
    expect(svg, "the tick labels are muted, not toned").toContain(`fill="${hexOf("tone.muted", DARK_THEME)}"`);
    expect(svg.includes(hexOf("tone.error", DARK_THEME)), "nothing here carries meaning").toBe(false);
  });

  it("TC2: eight series take eight distinct slots, and there is no ninth", () => {
    // **The measured defect, in one assertion.** `SERIES_INK` held five colours
    // and `CATEGORY_REFS` holds eight, so series six was `c6` in the terminal
    // and `SERIES_INK[0]` — series one's colour — in the SVG. That is *two
    // series reading as one*, which is the exact failure C04 I50a caps the
    // count to prevent, arriving through the second renderer's back door.
    //
    // **The wrap point was five and the cap is eight, so the defect is
    // reachable at six** — and invisible on any plot with five or fewer, which
    // is every fixture the per-form corpus has.
    const svg = plotToSvg(series(8, [1, 3, 2]), DARK_THEME) ?? "";
    const strokes = [...svg.matchAll(/<path [^>]*stroke="(#[0-9a-f]{6})"/gu)].map((m) => m[1]);
    expect(strokes.length).toBe(8);
    expect(new Set(strokes).size, "eight series, eight colours — five would be the old palette").toBe(8);
    for (const [i, stroke] of strokes.entries()) expect(stroke).toBe(hexOf(refOf(i), DARK_THEME));

    // **And the ninth is refused rather than wrapped**, which is why the row
    // above is the whole of the boundary: the builder throws at 9 (C04 I50a),
    // so no arm ever has to decide what a repeat means.
    expect(() => series(9, [1, 3, 2])).toThrow(/categorical palette distinguishes 8/u);
  });

  it("TC3: a colormap value is the same RGB in both arms", () => {
    const values = [0, 1, 2, 3];
    const heat = b.plot({
      id: "h", form: "heatmap", height: 4, colormap: "viridis",
      series: [{ label: "r", values }],
    });
    const svg = plotToSvg(heat, DARK_THEME) ?? "";
    const fills = [...svg.matchAll(/<rect [^>]*fill="(#[0-9a-f]{6})"/gu)].map((m) => (m[1] ?? "").toLowerCase());
    const map = COLORMAPS["viridis"];
    const expected = values.map((v) => {
      const c = continuousColour(map!, (v - 0) / 3, DEPTH);
      return c !== undefined && c.kind === "rgb" ? c.hex.toLowerCase() : "";
    });
    // The ground is the first rect; the cells follow.
    expect(fills.slice(1), "each cell is the colormap's own answer").toEqual(expected);

    // And the terminal paints the same values from the same table.
    const painted = sgrHexes(terminalFrame(heat, DARK_THEME));
    for (const hex of expected) {
      expect(painted.has(hex), `the terminal painted ${hex} too`).toBe(true);
    }
  });

  it("TC4: the renderer writes no hex literal — and the matcher fires on one", () => {
    const stripped = sourceOf(SVG_SRC);
    expect(fires(stripped, HEX_LITERAL), "no colour is chosen in the renderer").toBe(false);

    // **The control, and it is what makes the row mean anything.** A stripper
    // that ate the code would pass the line above on an empty string, and a
    // clean file and a blind scan read identically from outside. So: a file that
    // *should* match still does after the same stripping.
    expect(fires(sourceOf("src/presentation/theme/tokens-dark.ts"), HEX_LITERAL),
      "the stripper leaves code alone — the theme is nothing but hex literals").toBe(true);
    expect(stripped.includes("plotToSvg"), "and the subject survived its own stripping").toBe(true);

    // **The fabricated violation**, on this file's own text: the matcher can see
    // the thing the rule forbids, in the shape it would actually arrive in.
    expect(fires(stripped.replace('fill="none"', 'fill="#6ea8fe"'), HEX_LITERAL),
      "a literal spliced into the subject is caught").toBe(true);
  });

  it("TC5: every colour in the output is one the theme holds", () => {
    // *Not a chosen red* — the general form. A foreign colour of any origin
    // fails this: a literal, a web keyword, a computed tint, a second palette.
    const held = themeHexes(DARK_THEME);
    const map = COLORMAPS["viridis"];
    for (const [form, extra] of [["line", false], ["bar", false], ["scatter", false], ["heatmap", true]] as const) {
      const blk = b.plot({
        id: form, form, height: 6, ...(extra ? { colormap: "viridis" as const } : {}),
        series: [{ label: "s", values: [1, 4, 2, 8] }, { label: "t", values: [3, 1, 5, 2] }],
      });
      const svg = plotToSvg(blk, DARK_THEME) ?? "";
      const drawn = paints(svg);
      expect(drawn.length, `${form} paints something`).toBeGreaterThan(0);
      for (const paint of drawn) {
        const fromMap = extra && continuousColourHexes(map).has(paint);
        expect(held.has(paint) || fromMap, `${form}: ${paint} comes from C10`).toBe(true);
      }
    }
  });

  it("TC5b: no element is drawn without a paint", () => {
    // A mistyped `ColourRef` compiles — the type is `${string}.${string}` — and
    // `resolve` is total, so the ink comes back `undefined` and the element is
    // skipped. **A missing rectangle is what a test can count; an invisible one
    // is not**, which is why the skip is the ruling and this is the row.
    const svg = plotToSvg(series(2, [1, 4, 2]), DARK_THEME) ?? "";
    const elements = [...svg.matchAll(/<(rect|path|circle|line|text)\b[^>]*>/gu)].map((m) => m[0]);
    expect(elements.length, "the frame has furniture and marks").toBeGreaterThan(4);
    for (const el of elements) {
      expect(/(?:fill|stroke)="[^"]+"/u.test(el), `painted: ${el.slice(0, 60)}`).toBe(true);
    }
  });

  it("TC6: a theme switch moves both arms", () => {
    const blk = series(1, [1, 4, 2, 8]);
    const dark = plotToSvg(blk, DARK_THEME) ?? "";
    const light = plotToSvg(blk, LIGHT_THEME) ?? "";
    expect(dark, "the same block draws differently under two themes").not.toBe(light);

    const strokeOf = (svg: string): string =>
      (/<path [^>]*stroke="(#[0-9a-f]{6})"/u.exec(svg)?.[1] ?? "").toLowerCase();
    expect(strokeOf(dark)).toBe(hexOf("categorical.c1", DARK_THEME));
    expect(strokeOf(light)).toBe(hexOf("categorical.c1", LIGHT_THEME));
    expect(strokeOf(dark)).not.toBe(strokeOf(light));

    // And the terminal moved with it, which is the half that makes this a
    // statement about *both* arms rather than about the SVG's own consistency.
    const [dp, lp] = [sgrHexes(terminalFrame(blk, DARK_THEME)), sgrHexes(terminalFrame(blk, LIGHT_THEME))];
    expect(dp.has(hexOf("categorical.c1", DARK_THEME)), "dark terminal paints dark c1").toBe(true);
    expect(lp.has(hexOf("categorical.c1", LIGHT_THEME)), "light terminal paints light c1").toBe(true);
  });
});

/** Every colour a colormap can produce at 24-bit, for TC5's membership check. */
function continuousColourHexes(map: Parameters<typeof continuousColour>[0] | undefined): ReadonlySet<string> {
  const out = new Set<string>();
  if (map === undefined) return out;
  for (let i = 0; i <= 1000; i += 1) {
    const c = continuousColour(map, i / 1000, DEPTH);
    if (c !== undefined && c.kind === "rgb") out.add(c.hex.toLowerCase());
  }
  return out;
}
