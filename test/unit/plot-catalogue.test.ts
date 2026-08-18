// `tools/plot-catalogue.mjs` and `tools/catalogue-png.mjs` — the catalogue's own fixture.
//
// **Both of these have already produced a silent wrong answer.** The PNG
// renderer drew every frame in the default foreground because `38;2;R;G;B` fell
// through its SGR parser, and the frames were reviewed as images without anyone
// asking whether the colour was there. So the rows below are mostly about the
// two things that fail quietly: a corpus that renders nothing, and a parser
// that returns a plausible answer for an input it does not handle.
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, FORMS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { brailleDots, colour256, isBraille, parseLine, sheetBg } from "../../tools/catalogue-png.mjs";
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
