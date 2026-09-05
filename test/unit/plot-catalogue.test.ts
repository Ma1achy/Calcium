// `tools/plot-catalogue.mjs` and `tools/catalogue-png.mjs` — the catalogue's own fixture.
//
// **Both of these have already produced a silent wrong answer.** The PNG
// renderer drew every frame in the default foreground because `38;2;R;G;B` fell
// through its SGR parser, and the frames were reviewed as images without anyone
// asking whether the colour was there. So the rows below are mostly about the
// two things that fail quietly: a corpus that renders nothing, and a parser
// that returns a plausible answer for an input it does not handle.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cells as width } from "../../src/presentation/text.js";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, FORMS, clearGenerated, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";
// **This carried a `@ts-expect-error` and no longer needs one**: `catalogue-png`
// gained a `.d.mts` when `animation-proof.test.ts` came to consume `gifFrom`,
// and `tsc` reported the directive as unused — which is the declaration file
// doing exactly what it is for. `plot-catalogue.mjs` above still has none.
import { ansiToSvg, colour256, parseLine, sheetBg, unparsedSgr } from "../../tools/catalogue-png.mjs";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";

/** The rendered catalogue, which is what PC11 sweeps. */
const CATALOGUE = join(import.meta.dirname, "..", "..", "docs", "catalogue");
import { ALL_FORMS } from "../support/plot-forms.js";

const forms = FORMS as Record<string, Record<string, Record<string, unknown>>>;
const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number) => readonly string[];
const strip = stripSgr as (s: string) => string;
const spans = parseLine as (s: string) => readonly { text: string; colour: string }[];
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

  it("AA1 (C12 I54): every frame at `unicode: \"ascii\"` is ASCII, at both widths", () => {
    // **One row for four mechanisms** (C12 §3af, F216). `lineDrawRows` picked
    // its glyph table with no capability at all, `styleRasteriser` branched on
    // `ambiguousWidth` where the question is `unicode`, and the contour and
    // violin arms read `plotStyle` while holding the record. Four different
    // decisions, one shared output — so the assertion is about the output.
    //
    // Measured before the fix: **49 of 159 variants at narrow, 24 at wide**, and
    // thirty-two of the wide ones were committed catalogue files nobody read.
    const base = { colourDepth: 1, unicode: "ascii", ambiguousWidth: "narrow",
      synchronisedUpdate: true, bracketedPaste: true, mouse: true,
      imageProtocol: "none", keyboardProtocol: "none", altScreen: true } as const;

    const offenders: string[] = [];
    let rendered = 0; // cells-ok — a frame count
    for (const [arm, over, w] of [
      ["narrow", {}, 80],
      ["wide", { ambiguousWidth: "wide" }, 60],
    ] as const) {
      for (const [form, variants] of Object.entries(forms)) {
        for (const [variant, spec] of Object.entries(variants)) {
          rendered += 1; // cells-ok — a frame count
          const body = frame(spec, { ...base, ...over }, w).map(strip).join("\n");
          const bad = [...new Set([...body].filter((c) => (c.codePointAt(0) ?? 0) > 127))];
          if (bad.length > 0) offenders.push(`${arm} ${form}·${variant} ${bad.join("")}`);
        }
      }
    }

    // The corpus was rendered, so an empty offender list means *checked and
    // clean* rather than *nothing ran* — the arm PC1 exists for, restated here
    // because this row's whole content is an absence.
    expect(rendered, "frames rendered").toBeGreaterThan(200); // cells-ok — a frame count
    expect(offenders.join("\n")).toBe("");
  });

  it("AA1b (C12 I54, F364): caller text is not degraded, and AA1 is clean because the corpus has none", () => {
    // **C12 I54 is vacuous over this corpus and AA1 inherits it** — *a gate
    // phrased over a corpus inherits its blind spots*. Every frame at the ascii
    // rung is ASCII because no fixture puts a non-ASCII character in a string
    // the *caller* supplied; the renderer degrades its own glyph tables and
    // passes the caller's words through.
    //
    // **Measured on five members, and all five leak**, so it is a class rather
    // than one path. Asserted as the measured state, naming the finding, so the
    // day caller text is degraded this row moves rather than quietly agreeing.
    const base = { colourDepth: 1, unicode: "ascii", ambiguousWidth: "narrow",
      synchronisedUpdate: true, bracketedPaste: true, mouse: true,
      imageProtocol: "none", keyboardProtocol: "none", altScreen: true } as const;
    const leaks = (spec: Record<string, unknown>): boolean =>
      [...frame(spec, base, 60).map(strip).join("\n")].some((c) => (c.codePointAt(0) ?? 0) > 127);

    const cases: readonly (readonly [string, Record<string, unknown>])[] = [
      ["emptyMessage", { form: "line", height: 5, axes: true, series: [{ values: [] }], emptyMessage: "wait\u2026" }],
      ["xTitle", { form: "line", height: 6, axes: true, series: [{ values: [1, 2, 3] }], xLabels: ["a", "b", "c"], xTitle: "sec\u2026" }],
      ["xLabels", { form: "line", height: 6, axes: true, series: [{ values: [1, 2, 3] }], xLabels: ["a\u2026", "b", "c"] }],
      ["series label", { form: "line", height: 6, axes: true, legend: "right", series: [{ label: "al\u2026", values: [1, 2, 3] }] }],
      ["categories", { form: "bar", height: 5, axes: true, categories: ["c\u2026"], series: [{ values: [3] }] }],
    ];
    expect(cases.map(([name, spec]) => `${name} ${leaks(spec) ? "leaks" : "degraded"}`),
      "F364: every caller-supplied string reaches the ascii frame unchanged")
      .toEqual([
        "emptyMessage leaks", "xTitle leaks", "xLabels leaks",
        "series label leaks", "categories leaks",
      ]);
  });

  it("AA2 (C12 I54): a line at ASCII is still *connected*, in `+ - |`", () => {
    // **Falling back to the density ramp satisfies AA1 and loses the figure.**
    // `plotStyle: "line"` means *draw this as a connected line*, so the row
    // asserts the substitution C02 §4 names rather than merely the absence of
    // box-drawing — `lineDrawRows` degrades in place instead of yielding.
    const spec = {
      form: "line",
      series: [{ label: "a", values: [1, 3, 2, 6, 4, 8, 5, 9, 7, 10, 6, 3] }],
      height: 6,
    };
    const ascii = { colourDepth: 1, unicode: "ascii", ambiguousWidth: "narrow",
      synchronisedUpdate: true, bracketedPaste: true, mouse: true,
      imageProtocol: "none", keyboardProtocol: "none", altScreen: true } as const;

    const body = frame(spec, ascii, 60).map(strip).join("\n");
    expect(body).toContain("+");
    expect(body).toContain("|");
    expect(body).toContain("---");
    // Not the ramp: `.:-=+*#@` shares `-` and `+` with the box set, so the
    // distinguishing rung is asserted instead.
    expect(body, "the ramp's own glyphs are not what drew this").not.toContain("@");

    // **The fixture responds**: the same series at full unicode is the rounded
    // set, so the row is about the capability and not about this series.
    const full = frame(spec, { ...ascii, unicode: "full", colourDepth: 24 }, 60)
      .map(strip)
      .join("\n");
    expect(full).toContain("╭");
    expect(full).toContain("╯");
  });

  it("AA3 (C12 I54): a style the terminal cannot honour degrades and never refuses", () => {
    // **I18's precedent** — a caller cannot avoid the terminal they are on, so
    // the block stays valid and only the alphabet changes. The row exists
    // because the other reading is available and wrong: refusing
    // `plotStyle: "braille"` at ASCII would make a document render on one
    // terminal and fail on another for a reason the author cannot act on.
    const ascii = { colourDepth: 1, unicode: "ascii", ambiguousWidth: "narrow",
      synchronisedUpdate: true, bracketedPaste: true, mouse: true,
      imageProtocol: "none", keyboardProtocol: "none", altScreen: true } as const;

    const cases = {
      "violin braille": {
        form: "violin",
        plotStyle: "braille",
        categories: ["a", "b"],
        series: [{ values: [1, 2, 2, 3, 3, 3, 4, 5] }, { values: [2, 3, 3, 4, 4, 5, 5, 6] }],
        height: 10,
      },
      contour: {
        form: "contour",
        series: [
          { values: [1, 2, 3, 4, 5, 4] },
          { values: [2, 4, 6, 5, 3, 2] },
          { values: [3, 6, 4, 2, 1, 3] },
        ],
        height: 6,
      },
    };

    for (const [name, spec] of Object.entries(cases)) {
      const lines = frame(spec, ascii, 60);
      // It rendered — no throw, and a figure rather than a blank.
      expect(lines.length, `${name} rendered`).toBeGreaterThan(3); // cells-ok — a row count
      const body = lines.map(strip).join("\n");
      expect(body.trim().length, `${name} drew something`).toBeGreaterThan(20); // cells-ok — a glyph count
      expect(
        [...body].filter((c) => (c.codePointAt(0) ?? 0) > 127),
        `${name} at ascii`,
      ).toEqual([]);
    }

    // **The fixture responds**: the violin's braille arm is a real arm, so the
    // same spec at full unicode must come back in braille — otherwise the row
    // above is asserting about a style nothing implements.
    const full = frame(cases["violin braille"], { ...ascii, unicode: "full", colourDepth: 24 }, 60)
      .map(strip)
      .join("");
    expect(
      [...full].some((c) => { const p = c.codePointAt(0) ?? 0; return p >= 0x2800 && p <= 0x28ff; }),
      "the braille arm draws braille where the terminal has it",
    ).toBe(true);
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
  /**
   * Every glyph the renderer placed, in order.
   *
   * **One element per glyph** since the corners stopped meeting the border —
   * librsvg implements neither `textLength` nor a per-glyph `x` list, so the
   * only way a column is honoured is to be its own `<text>`. The rows below
   * search for a word across those elements rather than for a `<text>` holding
   * it, which is what they were doing when a run was one element.
   */
  const glyphsOf = (svg: string): readonly { x: number; ch: string }[] =>
    [...svg.matchAll(/<text x="([-0-9.]+)"[^>]*>([^<]*)<\/text>/gu)]
      .map((m) => ({ x: Number(m[1]), ch: m[2] ?? "" }));

  const xOf = (svg: string, text: string): number => {
    const gs = glyphsOf(svg);
    const want = [...text];
    for (let i = 0; i + want.length <= gs.length; i += 1) { // cells-ok — a glyph count
      if (want.every((c, k) => gs[i + k]?.ch === c)) return gs[i]!.x;
    }
    throw new Error(`no glyph run for ${text}`);
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

  it("PC14: every glyph is placed at its own column", () => {
    // **PC9 and PC10 assert where a run *starts* and nothing asserted where it
    // ends.** A `<text>` holding a run lets the font advance the glyphs inside
    // it, so a one-character run lands exactly and a long one drifts — the
    // frame's corners sat three pixels right of the border between them, about
    // a third of a cell, and the frame read as not meeting itself.
    //
    // **Two cheaper fixes are no-ops and only a pixel measurement says so.**
    // Rendering a 76-glyph rule ending in `┐`, against the same `│` alone at
    // the same column: `textLength` produced a byte-identical PNG, an `x` list
    // put the corner at 1285, one `<text>` per glyph at 1282, and the lone
    // border at 1282. `sharp` renders through librsvg, which implements neither
    // `textLength` nor per-glyph `x` lists — and **an attribute a renderer
    // ignores reads exactly like one it honours.**
    //
    // So the assertion is on the shape of the output rather than on an
    // attribute: one element per glyph, each at its own column, which is what
    // the braille path has always done.
    const svg = svgOf(`${GREY}┌${"─".repeat(20)}┐\x1b[39m`);
    const runs = [...svg.matchAll(/<text x="([-0-9.]+)"[^>]*>([^<]*)<\/text>/gu)];
    expect(runs.length).toBe(22); // cells-ok — a glyph count
    runs.forEach(([, x, ch], i) => {
      expect([...(ch ?? "")].length).toBe(1); // cells-ok — a glyph count
      expect(Number(x)).toBeCloseTo(ORIGIN + i * CELL, 0); // cells-ok — a column position
    });
  });

  it("PC14a: the last glyph of a run is one column from the one before it", () => {
    // The property the drift violated: a glyph's column must not depend on how
    // many glyphs precede it. **Asserted as a gap between neighbours rather
    // than against `CELL`**, which is derived through `toFixed(1)` and so is
    // 8.4 where the renderer's constant is 8.41 — over 74 glyphs that rounding
    // is 0.74px, and the first form of this row failed on it while the renderer
    // was right.
    const gap = (n: number): number => {
      const gs = glyphsOf(svgOf(`${GREY}${"─".repeat(n)}│\x1b[39m`));
      return gs[gs.length - 1]!.x - gs[gs.length - 2]!.x; // cells-ok — a glyph count
    };
    const base = gap(2);
    for (const n of [3, 20, 74]) expect(gap(n)).toBeCloseTo(base, 2); // cells-ok — a glyph count
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

  it("PC5: a braille cell is drawn from its own mask, because the mono face has none", () => {
    // **F204 was right about the defect and wrong about the remedy, and the
    // font is what says so** (F502).
    //
    // It found braille modelled as eight circles at a guessed radius, out by
    // 2.4× in area for the tool's whole life, and ruled that the model go and
    // the glyph emit a `<text>` *exactly as a box-drawing glyph does*. The
    // second half assumed a fact nobody had measured. Measured:
    //
    //     fc-list ":charset=2502" → DejaVu Sans Mono, among others
    //     fc-list ":charset=2800" → DejaVu Sans, DejaVu Serif — and **no mono face**
    //
    // Box drawing, the block elements, the quadrants and the markers all resolve
    // in the family this stylesheet asks for. Braille alone falls through to a
    // **proportional** font, whose dots are small and widely spaced. So every
    // braille frame the instrument has produced since showed that fallback's
    // design, and a reader — including the one who wrote the ruling — read it as
    // the renderer drawing a thin dotted line.
    //
    // **The remedy that survives both findings is geometry that is not a
    // guess.** A braille cell *is* a 2×4 coverage mask; eight rects laid on the
    // cell's own halves and quarters is the character's definition rather than
    // an estimate of a font's design, which is the property F204 actually
    // wanted and could not get from a radius.
    const svg = (ansiToSvg as (l: string) => string)("\u001b[38;2;255;0;0m⣿⠁\u001b[0m");
    expect(svg, "no radius, which is the finding that stands").not.toContain("<circle");
    expect(svg, "and no text, which is the half that did not").not.toContain(">⣿</text>");

    // **Eight dots and one**, read off the two masks rather than counted loosely
    // — `⣿` is every dot and `⠁` is the first alone.
    const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)"/gu)]
      .map((m) => [Number(m[1]), Number(m[2])] as const);
    expect(rects.length, "eight dots and one").toBe(9); // cells-ok — a dot count

    // **Derived from the cell, which is the whole claim.** The two glyphs sit a
    // cell apart and the dots divide that cell in halves across and quarters
    // down; nothing here is a measurement of a typeface.
    const xs = [...new Set(rects.map(([x]) => x))].sort((a, b) => a - b);
    expect(xs.length, "two dot columns in the full cell and one in the sparse").toBe(3); // cells-ok — a column count
    expect(xs[1]! - xs[0]!, "half a cell between the dot columns").toBeCloseTo(8.41 / 2, 1);
    expect(xs[2]! - xs[0]!, "and a whole cell between the glyphs").toBeCloseTo(8.41, 1);
    const ys = [...new Set(rects.map(([, y]) => y))].sort((a, b) => a - b);
    expect(ys.length, "four dot rows").toBe(4); // cells-ok — a row count
  });

  it("PC10 (F227): bold survives to the SVG, and it is all a one-bit frame has", () => {
    // **The load-bearing arm.** `tone("error")` resolves to `{ bold: true }`
    // below `colourDepth: 4` — no colour at all — so a renderer dropping `1m`
    // draws a 1-bit error frame identically to plain text. The image would show
    // the failure the design exists to prevent while looking correct, which is
    // an instrument reassembling real bytes with a wrong model. This file has
    // shipped that once: every catalogue frame in the default foreground,
    // because `38;2;R;G;B` fell through and nothing asked.
    const svg = (ansiToSvg as (l: string) => string)("\u001b[1mERR\u001b[22m ok");
    const bolded = [...svg.matchAll(/<text[^>]*font-weight="bold"[^>]*>(.)<\/text>/gu)].map(
      (m) => m[1],
    );
    expect(bolded.join(""), "the bold run and only the bold run").toBe("ERR");

    // **And the assertion that says the arm is doing work**: a one-bit frame and
    // a plain one must not produce the same image. Without it the row above
    // could pass on a tool that emitted `font-weight` for everything.
    const plain = (ansiToSvg as (l: string) => string)("ERR ok");
    expect(svg, "one bit and no styling are different images").not.toBe(plain);
  });

  it("PC11 (F227): nothing in the catalogue emits an SGR code the parser drops", () => {
    // **This was the watcher on the one arm deliberately not built, and it paid
    // out.** `7m` had *no producer — `Style.inverse` is written nowhere in
    // `src/`* — so no arm was built and this row named the number the day one
    // appeared. It appeared with arc3's interaction catalogue (the transcript's
    // selection is reverse video at 1-bit, C11 I14), the 1-bit PNG showed no
    // selection while the bytes carried one, and the arm landed in
    // `catalogue-png.mjs`. The row stays: it is the same watcher over the next
    // code nobody has built an arm for.
    const unknown = new Set<number>();
    let swept = 0;
    let withSgr = 0;
    let fourBit = 0;
    // **Recursive, and F241 is the whole reason.** `readdirSync` over the
    // catalogue root skips its subdirectories, and `status/` is where the only
    // frames rendered at `colourDepth: 4` live — so the one corpus carrying the
    // sixteen-colour vocabulary was the one this sweep could not open. A gate's
    // coverage is where its target sits relative to its default path.
    for (const entry of readdirSync(CATALOGUE, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;
      const raw = readFileSync(join(entry.parentPath, entry.name), "utf8");
      swept += 1;
      if (raw.includes(String.fromCharCode(27))) withSgr += 1;
      if (/\u001b\[(?:3[0-7]|9[0-7]|4[0-7]|10[0-7])[;m]/u.test(raw)) fourBit += 1;
      for (const n of (unparsedSgr as (s: string) => readonly number[])(raw)) unknown.add(n);
    }

    // **The counters, because an exit status is one bit and it is the same bit
    // for *clean* and for *did not run*.** A sweep over no files, or over files
    // carrying no escapes at all, reports exactly this green — and three
    // instruments in this repository have reported a completion they never
    // observed.
    expect(swept, "the sweep found catalogue frames").toBeGreaterThan(0);
    expect(withSgr, "and they carry SGR, so there was something to parse").toBeGreaterThan(0);
    // **The third counter is F241's own.** Across the 880 top-level frames the
    // distinct first-parameters were exactly `KNOWN_SGR`, so this row was green
    // because nothing it read was 4-bit rather than because the parser was
    // complete — coverage as a property of the fixtures. Asserting a 4-bit
    // frame is *present* is what makes the arms below load-bearing.
    expect(fourBit, "and at least one is rendered at colourDepth 4").toBeGreaterThan(0);
    expect([...unknown], "every SGR code in the catalogue has an arm").toEqual([]);
  });
});
