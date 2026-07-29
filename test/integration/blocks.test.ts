// C09 tier 4 — with C10 and C02.
//
// Geometry is C09's; colour is C10's; what a terminal can do is C02's. These
// are the assertions that hold at the joins, and the reason they are here
// rather than in either component is that each of them is false in a way
// neither component can see alone.
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { cells } from "../../src/presentation/text.js";
import { CORPUS, ONE_PER_KIND } from "../support/blocks.js";
import {
  ASCII_CAPS,
  DARK_THEME,
  FULL_CAPS,
  LIGHT_THEME,
  MONO_CAPS,
  measurable,
  visible,
} from "../support/render.js";

const ESC = String.fromCharCode(27);

describe("C09 × C10", () => {
  it("T4.2 (with C10): the same block in both themes produces identical row counts", () => {
    // Colour never changes row count (C04 §5). Without this, C14 could not
    // cache a measured height across a theme switch.
    for (const fixture of CORPUS) {
      for (const width of [40, 80]) {
        expect(
          measurable({ theme: LIGHT_THEME }).renderToLines(fixture, width).length,
          `${fixture.id} at ${width}`,
        ).toBe(measurable({ theme: DARK_THEME }).renderToLines(fixture, width).length);
      }
    }
  });

  it("T4.3 (with C10, D29): at depth 1 status stays distinguishable by glyph alone", () => {
    // C10 collapses ten tones onto three typographic classes at 1-bit, so the
    // colour carries nothing. The promise that makes that safe is that the
    // glyph already carried the meaning — this is where it is checked.
    const steps = block({
      kind: "steps",
      id: "s-mono",
      steps: [
        { label: "resolve", state: "done" },
        { label: "build", state: "failed" },
        { label: "push", state: "pending" },
      ],
    });

    const lines = measurable({ capabilities: MONO_CAPS }).renderToLines(steps, 40).map(visible);
    const markers = lines.map((line) => [...line][0]);

    expect(new Set(markers).size, "three states, three distinguishable glyphs").toBe(3);
    for (const line of lines) {
      expect(line.includes(ESC), "no colour at all at 1-bit").toBe(false);
    }
  });

  it("T4.3b (with C10): at depth 4 the three statuses resolve to distinct sequences", () => {
    const kit = measurable({ capabilities: { ...FULL_CAPS, colourDepth: 4 } });
    const notices = (["ok", "warn", "error"] as const).map((tone) =>
      kit.renderToLines(
        block({ kind: "notice", id: `n-${tone}`, tone, glyph: "*", text: "status" }),
        40,
      )[0] ?? "",
    );

    const sequences = notices.map((line) => line.slice(0, line.indexOf("m") + 1));
    expect(new Set(sequences).size, "three tones, three colours").toBe(3);
    for (const sequence of sequences) {
      expect(sequence, "four-bit terminals get 30–37 / 90–97, never 38;5").not.toContain("38;5;");
      expect(sequence, "and never truecolour").not.toContain("38;2;");
    }
  });

  it("T4.3c (with C10): at depth 24 a tone is written as truecolour", () => {
    const line =
      measurable().renderToLines(
        block({ kind: "notice", id: "n-24", tone: "ok", glyph: "+", text: "done" }),
        40,
      )[0] ?? "";

    expect(line, "the tag decides the form, and here it is rgb").toContain("38;2;");
  });
});

describe("C09 × C02", () => {
  it("T4.4 (with C02): one capability record drives every kind to the same set", () => {
    // No kind renders Unicode while another renders ASCII. A renderer that
    // probed for itself instead of reading ctx is exactly how that happens
    // (I3), and it looks fine in whichever terminal the author used.
    // Over the canonical fixtures, whose *content* is ASCII. The rule governs
    // the glyphs C09 chooses — borders, ticks, spinners, the truncation marker
    // — and not a tool's output: a log line about a Japanese hostname is data,
    // and transliterating it would be a different and much worse bug than
    // drawing it in a terminal that may not have the font.
    const kit = measurable({ capabilities: ASCII_CAPS });

    for (const fixture of Object.values(ONE_PER_KIND)) {
      for (const line of kit.renderToLines(fixture, 60)) {
        const text = visible(line);
        const astral = [...text].find((ch) => (ch.codePointAt(0) ?? 0) > 0x7f);
        expect(astral, `${fixture.id} drew ${astral ?? ""} under unicode:"ascii"`).toBeUndefined();
      }
    }
  });

  it("T4.4b (with C02): the ASCII frame is the same shape as the Unicode one", () => {
    // 1:1 by cell count means the two frames are the same size, glyph for
    // glyph — which is what makes the height identical rather than merely
    // similar (I5).
    const panel = block({
      kind: "panel",
      id: "p-caps",
      title: "cluster",
      children: [{ kind: "raw", id: "p-caps-r", text: "nodes 12\ngpu 71%" }],
    });

    const unicode = measurable().renderToLines(panel, 30).map(visible);
    const ascii = measurable({ capabilities: ASCII_CAPS }).renderToLines(panel, 30).map(visible);

    expect(ascii).toHaveLength(unicode.length);
    for (let i = 0; i < unicode.length; i += 1) {
      expect(cells(ascii[i] ?? ""), `row ${i}`).toBe(cells(unicode[i] ?? ""));
    }
    expect(ascii[0]?.startsWith("+")).toBe(true);
    expect(unicode[0]?.startsWith("┌")).toBe(true);
  });
});

describe("C09 × C04", () => {
  it("T4.7 (with C04): every fixture in the corpus measures and renders without error", () => {
    const kit = measurable();

    for (const fixture of CORPUS) {
      for (const width of [1, 40, 80, 200]) {
        expect(() => kit.renderToLines(fixture, width), `${fixture.id} at ${width}`).not.toThrow();
        expect(kit.renderToLines(fixture, width).length, `${fixture.id} at ${width}`).toBe(
          kit.measure(fixture, width),
        );
      }
    }
  });
});
