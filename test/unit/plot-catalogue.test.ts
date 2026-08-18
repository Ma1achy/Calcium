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
import { brailleDots, colour256, isBraille, parseLine } from "../../tools/catalogue-png.mjs";

const forms = FORMS as Record<string, Record<string, Record<string, unknown>>>;
const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number) => readonly string[];
const strip = stripSgr as (s: string) => string;
const spans = parseLine as (s: string) => readonly { text: string; colour: string }[];
const dots = brailleDots as (ch: string) => readonly (readonly [number, number])[];

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
