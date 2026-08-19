// `tools/plot-catalogue.mjs` and `tools/catalogue-png.mjs` — the catalogue's own fixture.
//
// **Both of these have already produced a silent wrong answer.** The PNG
// renderer drew every frame in the default foreground because `38;2;R;G;B` fell
// through its SGR parser, and the frames were reviewed as images without anyone
// asking whether the colour was there. So the rows below are mostly about the
// two things that fail quietly: a corpus that renders nothing, and a parser
// that returns a plausible answer for an input it does not handle.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cells as width } from "../../src/presentation/text.js";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, FORMS, clearGenerated, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { ansiToSvg, brailleDots, colour256, isBraille, parseLine, sheetBg } from "../../tools/catalogue-png.mjs";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
import { ALL_FORMS } from "../support/plot-forms.js";

const forms = FORMS as Record<string, Record<string, Record<string, unknown>>>;
const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number) => readonly string[];
const strip = stripSgr as (s: string) => string;
const spans = parseLine as (s: string) => readonly { text: string; colour: string }[];
const dots = brailleDots as (ch: string) => readonly (readonly [number, number])[];
const pageBg = sheetBg as () => { r: number; g: number; b: number; alpha: number };

describe("plot-catalogue — the corpus renders", () => {
  it("PC1: the corpus is non-empty, and so is every frame in it", () => {
    // The fabricated-from-nothing arm: an empty corpus writes zero files and
    // exits clean, which is the same exit status as a complete run.
    const names = Object.keys(forms);
    expect(names.length, "forms in the corpus").toBeGreaterThan(20); // cells-ok — a form count
    expect(caps.length, "capability sets").toBeGreaterThan(1); // cells-ok — a caps count

    let rendered = 0;
    for (const [name, variants] of Object.entries(forms)) {
      for (const [variant, spec] of Object.entries(variants)) {
        const lines = frame(spec, caps[0]!.caps, 80);
        expect(lines.length, `${name}/${variant} rendered no rows`).toBeGreaterThan(0); // cells-ok — a row count
        rendered += 1;
      }
    }
    console.log(`plot-catalogue — ${String(rendered)}/${String(rendered)} rows`);
    expect(rendered).toBeGreaterThan(30); // cells-ok — a frame count
  });

  it("PC12a: some banded fixture reaches the padding loop, or PC12 is about nothing", () => {
    // **The corpus's coverage of `bandedForm`'s leftover rows is a property of
    // one fixture's height, and nothing asserted it.** `rowsPer` is
    // `⌊areaRows ÷ n⌋`, so only a height a band count does not divide leaves
    // rows to pad — and every banded fixture divided evenly until `flat-whisker`
    // landed, so the loop had never drawn a row and PC12 was green about a path
    // it never took.
    //
    // A mutation restoring an evenly-dividing height passes PC12, which is what
    // this row exists to fail.
    // **The two forms that call `bandedForm`, and horizontal only** — measured
    // rather than listed by shape. The first form of this row named five
    // plausible-looking forms and passed on `ridgeline` and three *vertical*
    // fixtures, none of which take this path at all: `ridgeline` composes its
    // own rows and a vertical arm goes through `categoricalColumnForm`. A
    // coverage assertion satisfied by a fixture that does not reach the code is
    // the proxy failure it exists to prevent.
    const banded = new Set(["boxplot", "violin"]);
    const reaching: string[] = [];
    for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
      if (!banded.has(form)) continue;
      for (const [variant, spec] of Object.entries(variants)) {
        if (spec.orientation === "vertical") continue;
        const bands = (spec.categories?.length ?? 0) || spec.series.length; // cells-ok — a band count
        const rows = typeof spec.height === "number" ? spec.height : 0; // cells-ok — a row count
        if (bands > 1 && rows > 0 && rows % bands !== 0) reaching.push(`${form}/${variant}`); // cells-ok — a row count
      }
    }
    expect(reaching, "a horizontal boxplot or violin whose height its band count does not divide")
      .not.toEqual([]);
  });

  it("PC12: every frame's *both* borders sit in one column, and no row overruns", () => {
    // **The whole corpus looked shattered once and the frames were correct.**
    // The defect was in the PNG renderer (PC9/PC10), and the only way to know
    // that without reading 388 images was to ask the text whether it was
    // aligned. This is that question, kept.
    //
    // Anchored on the frame's *own* rules — `^┌───┐$` — and not on the
    // characters, because a boxplot draws `└────┴────┘` inside the plot area
    // and matching the codepoint alone reported six correct frames as broken.
    const bad: string[] = [];
    for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
      for (const [variant, spec] of Object.entries(variants)) {
        const rows = frame(spec, caps[0]!.caps, 80).map((r) => strip(r));
        const colOf = (line: string, ch: string): number => {
          const chars = [...line];
          let c = 0;
          for (const g of chars) {
            if (g === ch) return c;
            c += width(g);
          }
          return -1; // cells-ok — a sentinel column
        };
        const top = rows.find((r) => /^\s*┌─[─┬]*┐$/u.test(r));
        const bottoms = rows.filter((r) => /^\s*└─[─┬┴]*┘$/u.test(r));
        const bottom = bottoms[bottoms.length - 1];
        const where = `${form}/${variant}`;
        if (top !== undefined && bottom !== undefined && colOf(top, "┌") !== colOf(bottom, "└")) {
          bad.push(`${where}: top at ${String(colOf(top, "┌"))}, bottom at ${String(colOf(bottom, "└"))}`);
        }
        if (top !== undefined) {
          const sides = [...new Set(rows.filter((r) => /^\s*│/u.test(r)).map((r) => colOf(r, "│")))];
          if (sides.length > 1 || (sides.length === 1 && sides[0] !== colOf(top, "┌"))) {
            bad.push(`${where}: left border in column(s) ${sides.join(", ")}, corner at ${String(colOf(top, "┌"))}`);
          }
          // **And the right one, which this row is named for and did not
          // check.** A banded form pads its leftover rows with the gutter and
          // the right border and nothing between them, so the two sit adjacent
          // — `││` — and the *left* border is still in the correct column. The
          // arm above passes it. Measured over the whole corpus, every banded
          // fixture happened to have a height its band count divides, so no
          // frame reached the padding loop at all.
          const rightAt = colOf(top, "┐"); // cells-ok — a column index
          const closers = [...new Set(
            rows.filter((r) => /^\s*│.*│$/u.test(r)).map((r) => width(r) - 1), // cells-ok — a column index
          )];
          const strayed = closers.filter((c) => c !== rightAt);
          if (rightAt >= 0 && strayed.length > 0) {
            bad.push(`${where}: right border in column(s) ${strayed.join(", ")}, corner at ${String(rightAt)}`);
          }
        }
        const over = rows.filter((r) => width(r) > 80); // cells-ok — the render width
        if (over.length > 0) bad.push(`${where}: ${String(over.length)} row(s) over 80 cells`);

        // **The rows below the rule live in the plot area's columns.** Added
        // because shifting `xLabelRowFor`'s indent by one failed nothing: the
        // arms above check the border and the corners, and the x-labels are
        // neither. That is the symptom this whole row was written for — labels
        // that do not sit under what they name.
        if (bottom !== undefined) {
          const start = colOf(bottom, "└");
          const end = colOf(bottom, "┘");
          for (const r of rows.slice(rows.lastIndexOf(bottom) + 1)) {
            const ink = r.replace(/\s+$/u, "");
            if (ink.trim() === "") continue;
            const first = width(ink) - width(ink.replace(/^\s+/u, ""));
            if (first <= start) bad.push(`${where}: a row below the rule starts at ${String(first)}, inside the gutter`);
            if (end >= 0 && width(ink) - 1 > end) bad.push(`${where}: a row below the rule ends at ${String(width(ink) - 1)}, past ${String(end)}`);
          }

          // **A label is centred on the tick it names**, which is the one
          // statement that fails when the x-label row drifts by a single
          // column — the containment arms above both pass a one-cell shift,
          // and a one-cell shift is what a mutation of `xLabelRowFor`'s indent
          // produces. Known limit: only frames whose rule carries `┬` ticks,
          // and only when no label was dropped for collision, so the counts
          // still correspond.
          const ticks: number[] = [];
          for (let i = 0, c = 0; i < [...bottom].length; i++) {
            if ([...bottom][i] === "┬") ticks.push(c);
            c += width([...bottom][i]!);
          }
          const labelRow = rows.slice(rows.lastIndexOf(bottom) + 1).find((r) => r.trim() !== "");
          if (ticks.length > 0 && labelRow !== undefined) {
            const words: { at: number; text: string }[] = [];
            for (const m of labelRow.matchAll(/\S+/gu)) {
              words.push({ at: width(labelRow.slice(0, m.index)), text: m[0] });
            }
            if (words.length === ticks.length) {
              for (let i = 0; i < ticks.length; i++) {
                const centre = words[i]!.at + (width(words[i]!.text) - 1) / 2;
                if (Math.abs(centre - ticks[i]!) > 1) {
                  bad.push(`${where}: "${words[i]!.text}" centred at ${centre.toFixed(1)}, tick at ${String(ticks[i])}`);
                }
              }
            }
          }
        }
      }
    }
    expect(bad, `misaligned frames:\n${bad.join("\n")}`).toEqual([]);
  });

  it("PC13: a removed fixture's frame does not outlive it", () => {
    // **`histogram · sturges` sat in the catalogue through the whole rebuild.**
    // Its variant was gone; its four frames were not, and they were drawn by the
    // pre-rebuild renderer — bare bin edges, the `rule` frame, the `░` meter
    // track. A reader comparing the histogram family across binning strategies
    // read the difference as an inconsistency in the current code, which is an
    // instrument manufacturing evidence rather than merely missing some.
    //
    // Asserted against a temp directory rather than `docs/catalogue`, which is
    // gitignored and empty in a fresh clone — a disk assertion there would fail
    // for everyone who had not run the generator.
    const dir = mkdtempSync(join(tmpdir(), "calcium-catalogue-"));
    try {
      writeFileSync(join(dir, "ghost-24bit.plain"), "stale\n");
      writeFileSync(join(dir, "ghost-24bit.png"), "stale\n");
      writeFileSync(join(dir, "keep.md"), "not generated\n");
      const removed = (clearGenerated as (d: string) => number)(dir);
      expect(removed).toBe(2); // cells-ok — a file count
      expect(readdirSync(dir)).toEqual(["keep.md"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("PC2: at least one frame carries 24-bit colour, or the corpus proves nothing about it", () => {
    const line = frame(forms["line"]!["default"], caps[0]!.caps, 80).join("\n");
    expect(line).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/u);
    expect(strip(line)).not.toMatch(/\x1b/u);
  });
});

describe("catalogue-png — the parser that failed silently", () => {
  it("PC3: 24-bit foreground is parsed, not dropped to the default", () => {
    // The exact defect: this returned one default-coloured span for the whole
    // line, which renders as a legible image and a wrong one.
    const parsed = spans("\x1b[38;2;230;159;0mAB\x1b[39mCD");
    expect(parsed.some((sp) => sp.colour === "rgb(230,159,0)"), "the 24-bit run").toBe(true);
    expect(parsed.map((sp) => sp.text).join("")).toBe("ABCD");
  });

  it("PC4: the 256-colour cube maps to its own corners", () => {
    expect(colour256(16)).toBe("rgb(0,0,0)");
    expect(colour256(231)).toBe("rgb(255,255,255)");
  });

  it("PC6: every PlotForm has a catalogue entry, and every entry renders", () => {
    // **The gap this closes was a quarter of the component.** `FORMS` used to be
    // an untyped literal in a `.mjs`, and eight forms — flame, icicle, calendar,
    // spectrogram, latency, density2d, smallmultiples, pairplot — had no frame at
    // all, so every visual review of "the catalogue" was reading 26 of 34 forms
    // and could not tell. PC1 could not see it: it asserts `> 20` forms, and 26
    // is more than 20.
    //
    // The `Record<PlotForm, …>` in catalogue-forms.ts makes a *missing* form a
    // compile error. This row is the other direction — that the entry actually
    // draws something — and it is the half a type cannot check.
    const catalogued = Object.keys(CATALOGUE_FORMS);
    expect([...catalogued].sort()).toEqual([...ALL_FORMS].sort());

    const barren: string[] = [];
    for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
      for (const [variant, spec] of Object.entries(variants)) {
        const rows = frame(spec, caps[0]!.caps, 80);
        const ink = rows.map((r) => strip(r).trim()).join("");
        if (variant.includes("empty")) continue;
        if (ink.length === 0) barren.push(`${form}/${variant}`);
      }
    }
    expect(barren, "catalogued but rendering nothing").toEqual([]);
  });

  it("PC7: the page background comes from the theme, not from this file", () => {
    // **`#1a1a2e`.** An indigo that appears in no theme, no capability set and
    // none of the generated frames — invented here, written twice, and the
    // answer to "why is the background blue" for as long as anyone asked.
    // The dark theme's surface is #1a1a1a. The two differ only in the blue
    // channel, which is exactly why nobody spotted it as wrong rather than dim.
    const bg = pageBg();
    expect({ r: bg.r, g: bg.g, b: bg.b }).toEqual({ r: 0x1a, g: 0x1a, b: 0x1a });
    expect(bg.b, "the invented indigo's blue channel").not.toBe(0x2e);
  });

  it("PC8: a background SGR is parsed rather than swallowed", () => {
    // The parser tracked foreground only, so `48;…` fell through its if/else
    // chain as a no-op — the same shape as the `38;2` defect this file was
    // written for, one code along.
    const runs = parseLine("\x1b[48;2;10;20;30mAB\x1b[49mCD") as readonly {
      text: string; colour: string; background: string | null;
    }[];
    expect(runs.map((r) => r.text).join("")).toBe("ABCD");
    expect(runs.find((r) => r.text === "AB")?.background).toBe("rgb(10,20,30)");
    expect(runs.find((r) => r.text === "CD")?.background).toBe(null);
  });

  // --- placement ---------------------------------------------------------
  //
  // **This renderer made every correct frame look shattered**, which is the
  // third shape of instrument failure and the worst one to review by eye: the
  // frames on disk were right in every byte, and the images said otherwise.

  const svgOf = (line: string): string => ansiToSvg(line) as string;
  const xOf = (svg: string, text: string): number => {
    const m = new RegExp(`<text x="([-0-9.]+)"[^>]*>${text}</text>`, "u").exec(svg);
    if (m === null) throw new Error(`no <text> run for ${text}`);
    return Number(m[1]);
  };
  // Derived rather than imported, so the rows below assert placement and not a
  // constant — and derived across an **SGR boundary** rather than a space,
  // because a fixture must not be built out of the mechanism it measures. Two
  // adjacent runs split by a colour change are one column apart under any
  // whitespace handling; split by a space they are not, and deriving it that
  // way took the whole file down at module scope instead of failing the row.
  const PROBE = svgOf(`A\x1b[38;2;98;98;98mB`);
  const CELL = xOf(PROBE, "B") - xOf(PROBE, "A");
  const ORIGIN = xOf(PROBE, "A");
  const GREY = "\x1b[38;2;98;98;98m";

  it("PC9: an indent inside an SGR run places the same as a bare one", () => {
    // The two forms a plot frame actually emits. Row 0 of a box frame is bare
    // spaces then an SGR; every other row is the SGR then the spaces, because
    // the gutter and the border are one painted span. SVG's default
    // `xml:space` strips leading whitespace inside a `<text>`, so only the
    // second form lost its indent — the border drew at column 0 with the frame
    // top correctly indented above it.
    const bare = svgOf(`             ${GREY}\u2502\x1b[39m`);
    const inside = svgOf(`${GREY}             \u2502\x1b[39m`);
    expect(xOf(inside, "\u2502")).toBeCloseTo(xOf(bare, "\u2502"), 0);
    expect(xOf(inside, "\u2502")).toBeCloseTo(ORIGIN + 13 * CELL, 0); // cells-ok — an indent
  });

  it("PC10: a gap between two words is its columns, not a collapsed space", () => {
    // An x-label row is one span. Collapsed, the four labels of a vertical
    // boxplot bunched together at the left under a plot whose columns were
    // spread correctly across all 80 cells.
    const row = svgOf(`${GREY}         setosa           versicolor\x1b[39m`);
    expect(xOf(row, "setosa")).toBeCloseTo(ORIGIN + 9 * CELL, 0); // cells-ok — a label column
    expect(xOf(row, "versicolor")).toBeCloseTo(ORIGIN + 26 * CELL, 0); // cells-ok — a label column
  });

  it("PC11: the row pitch does not exceed the glyph's own extent", () => {
    // A pitch wider than the glyph dashes every vertical rule, which reads as a
    // shattered frame over frames that are correct. 1.143 is measured, not
    // nominal: a stacked `┌ │ │ └` is continuous at 16px pitch on a 14px
    // DejaVu Sans Mono and gapped at 17.
    const two = svgOf("\u2502\n\u2502");
    const ys = [...two.matchAll(/<text [^>]*y="([-0-9.]+)"/gu)].map((m) => Number(m[1]));
    expect(ys.length).toBe(2); // cells-ok — a row count
    const size = Number(/font-size: ([0-9.]+)px/u.exec(two)?.[1]);
    expect(ys[1]! - ys[0]!).toBeLessThanOrEqual(1.143 * size);
  });

  it("PC5: braille dots land where the codepoint says", () => {
    // U+2801 is dot 1 alone — top-left. U+28FF is all eight. A dot map that is
    // merely plausible draws a recognisable curve in the wrong places.
    expect(isBraille("⠁")).toBe(true);
    expect(isBraille("A")).toBe(false);
    expect(dots("⠁")).toEqual([[0, 0]]);
    expect(dots("⣿").length).toBe(8); // cells-ok — a dot count
    expect(dots("⠀").length).toBe(0); // cells-ok — a dot count
  });
});
