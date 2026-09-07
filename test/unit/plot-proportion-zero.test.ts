/**
 * PZ — a zero total is one thing in the proportion family (C12 I108, §3ak.26
 * finding 5).
 *
 * **Measured before the rule**: the waffle drew a hundred unowned squares
 * beside `0%` legends while the pie answered the same list with *No data.* in
 * the terminal and `null` in the SVG — `sharesOf` returned `[]` for a zero
 * total and each form did its own thing with nothing. The rows read both arms.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { sharesOf } from "../../src/presentation/plot/figure.js";
import { plotToSvg } from "../../src/presentation/plot/svg.js";
import { DARK_THEME } from "../support/render.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number) => readonly string[];
const strip = stripSgr as (s: string) => string;
const capsNamed = (name: string): Record<string, unknown> => caps.find((c) => c.name === name)!.caps;

const ZERO = CATALOGUE_FORMS.pie["all-zero"]!;

describe("C12 I108 — a zero total is every segment at nought", () => {
  it("PZ1 (C12 I108): sharesOf names every segment at fraction 0 rather than returning nothing", () => {
    const shares = sharesOf(ZERO.segments ?? []);
    expect(shares.map((s) => s.label)).toEqual(["None", "Nil", "Zero"]);
    expect(shares.map((s) => s.fraction)).toEqual([0, 0, 0]);
    // A list with no segments is still nothing — that is `hasDatum`'s refusal.
    expect(sharesOf([])).toEqual([]);
    // Mutation: `if (!(total > 0)) return [];` restored → the first two fail.
  });

  it("PZ2 (C12 I108, I79): the terminal pie draws a rim and a legend of 0%s, not No data.", () => {
    for (const name of ["24bit", "1bit"]) {
      const lines = frame(ZERO, capsNamed(name), 80);
      const text = lines.map(strip).join("\n");
      expect(text, `${name}: not a refusal`).not.toMatch(/No data/);
      for (const sg of ZERO.segments ?? []) expect(text, `${name}: ${sg.label} at 0%`).toMatch(new RegExp(`${sg.label} +0%`));
      // The rim: braille dots on the disc side, and no wedge fill — a filled
      // disc at this size puts ink in most of its cells; a rim in a few.
      const inked = lines.map(strip).join("").replace(/[^\u2800-\u28ff]/g, "").replace(/\u2800/g, "").length;
      expect(inked, `${name}: a rim has ink`).toBeGreaterThan(8);
    }
    // The ascii ladder lists every segment at 0% with no bar.
    const asciiText = frame(ZERO, capsNamed("ascii"), 80).map(strip).join("\n");
    expect(asciiText).not.toMatch(/No data/);
    for (const sg of ZERO.segments ?? []) expect(asciiText).toMatch(new RegExp(`${sg.label} +0%`));
    // Mutation: `mergeShares` merging zero shares again → every arm reads No data.
  });

  it("PZ3 (C12 I108, I79): the SVG pie is a document with a rim and a 0% legend, not a refusal", () => {
    const svg = plotToSvg(block({ kind: "plot", id: "z", ...ZERO } as never) as never, DARK_THEME);
    expect(svg, "drawn, not refused").not.toBeNull();
    expect(svg ?? "", "an unfilled full turn is the rim").toMatch(/<circle [^>]*fill="none"/);
    expect(svg ?? "", "no wedge").not.toMatch(/<path d="M[^"]*A[^"]*Z"/);
    const texts = [...(svg ?? "").matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    for (const sg of ZERO.segments ?? []) expect(texts).toContain(`${sg.label} 0%`);
    // Mutation: the rim mark not pushed → `plotToSvg` returns null (I64) and the first line fails.
  });
});
