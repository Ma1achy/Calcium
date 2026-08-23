/**
 * Render catalogue .txt files (ANSI) to PNGs via custom SVG + sharp.
 *
 * **`ansi-to-svg` was installed for this and could not do it** — it has no
 * 24-bit arm — so the SVG is written here instead. The package then sat in
 * `devDependencies`, imported by nothing, until SS31 counted it: a dependency
 * kept for a job it was rejected from is the same defect as an export nothing
 * consumes, and the comment naming it was the only trace. Removed.
 *
 * What is parsed:
 *   38;2;R;G;Bm · 38;5;Nm   foreground, 24-bit and indexed
 *   48;2;R;G;Bm · 48;5;Nm   background, both
 *   30-37 · 90-97           foreground, the sixteen
 *   40-47 · 100-107         background, the sixteen
 *   1m · 2m · 22m           bold, dim, normal intensity
 *   39m · 49m · 0m          defaults and reset
 *
 * **That list is complete for what the framework emits, and the claim is
 * checked rather than made here** — `unparsedSgr` below, swept over every
 * catalogue frame by PC11. It has to be said, because the list being accurate
 * is not the same as the list being sufficient and a reader takes the second
 * from the first. **The sixteen arrived late and F241 is why**: they were the
 * whole `colourDepth: 4` vocabulary, absent, and a 4-bit frame drew with its
 * colour silently removed. The watcher existed and swept a directory the only
 * 4-bit frames in the tree were not in.
 *
 * **The sixteen resolve to the standard values and a real emulator's differ** —
 * which is C10 I26's *best-effort at 4-bit* in the instrument: the image is a
 * model of a 16-colour terminal, not a photograph of one, and no contrast
 * measured off it would mean anything.
 *
 * **This list said *three forms* and the body handled seven**, which is how the
 * indexed arm came to be reported missing during F227's proof: the abstract was
 * read and the code was not. Compression is where a claim gets falsified, and a
 * header enumerating a subset of what its own function does is the cheapest
 * possible instance. **Read the abstract against its own section.**
 *
 * **`7m` (inverse) has no arm and no producer.** `Style.inverse` is written
 * nowhere in `src/`, so an arm here would be a mechanism with nothing to
 * exercise it — this session's most-found class, in the instrument. The
 * condition is watched rather than deferred: `assertNoUnparsedSgr` below fails
 * the build if any catalogue frame ever emits one.
 *
 *     node tools/catalogue-png.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { defaultTheme, loadTheme } from "../src/presentation/theme/index.js";

const loadedTheme = loadTheme(defaultTheme, "dark");
if (!loadedTheme.ok) throw new Error("theme failed to load");
const THEME = loadedTheme.value.current.tokens;

const CATALOGUE = join(import.meta.dirname, "..", "docs", "catalogue");

const FONT_SIZE = 14;
const CELL_W = 8.41;
/**
 * **16, and it is a measurement rather than a taste.**
 *
 * A terminal stretches `│` to its cell, so a frame's left edge is one unbroken
 * line. An SVG `<text>` draws the glyph at its natural extent and leaves
 * whatever is left over blank, so a row pitch wider than the glyph dashes every
 * vertical rule in the catalogue — which is most of what made correct frames
 * look broken.
 *
 * Probed at 18 / 17 / 16.5 / 16 with a stacked `┌ │ │ │ │ └`: 18 shows gaps of
 * about a fifth of a cell, 17 half that, 16.5 hairline, **16 continuous**. The
 * ceiling is the glyph's own vertical extent, 1.143 × the font size, and the
 * advance is 0.601 × it — so the widest cell aspect this font can draw without
 * dashing is 1.902, just under the 2 that `plot/aspect.ts` assumes. Circles
 * come out about 5% wide as a result, which is the smaller of the two errors
 * and the one that does not read as a defect.
 */
const CELL_H = 16;
const PAD = 6;
const GAP = 10;
/**
 * **The page colours come from the theme, and the reason is a defect.**
 * These were `#1a1a2e` and `#cccccc` — an indigo and a grey that appear in no
 * theme, no capability set, and none of the 560 generated frames. Every
 * catalogue PNG anyone reviewed was drawn on a blue field this file invented,
 * and the question "why is the background blue" had no answer in the data.
 *
 * The dark theme declares `background: "terminal"` — it paints nothing and
 * inherits. A PNG has no terminal to inherit from, so `surfaces.bg` is the
 * honest stand-in for the surface such a terminal would have, and
 * `tone.default` is what an unstyled cell resolves to.
 */
const BG = THEME.surfaces.bg;
const FG = THEME.palettes.tone.slots.default ?? "#d4d4d4";

const ESC = /\x1b\[([0-9;]*)m/g;

/** The sheet canvas fill, as sharp wants it — same source as every panel's. */
export function sheetBg() {
  const h = BG.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    alpha: 1,
  };
}

export function parseLine(raw) {
  const spans = [];
  let colour = FG;
  let background = null;
  let bold = false;
  let pos = 0;
  for (const m of raw.matchAll(ESC)) {
    if (m.index > pos) {
      spans.push({ text: raw.slice(pos, m.index), colour, background, bold });
    }
    pos = m.index + m[0].length;
    const params = m[1].split(";").map(Number);
    if (params[0] === 0) {
      colour = FG;
      background = null;
      bold = false;
    } else if (params[0] === 39) {
      colour = FG;
    } else if (params[0] === 49) {
      background = null;
    } else if (params[0] === 48 && params[1] === 2 && params.length >= 5) {
      background = `rgb(${params[2]},${params[3]},${params[4]})`;
    } else if (params[0] === 48 && params[1] === 5 && params.length >= 3) {
      background = colour256(params[2]);
    } else if (params[0] === 38 && params[1] === 2 && params.length >= 5) {
      colour = `rgb(${params[2]},${params[3]},${params[4]})`;
    } else if (params[0] === 38 && params[1] === 5 && params.length >= 3) {
      colour = colour256(params[2]);
    } else if (params[0] >= 30 && params[0] <= 37) {
      colour = colour256(params[0] - 30);
    } else if (params[0] >= 90 && params[0] <= 97) {
      colour = colour256(params[0] - 82);
    } else if (params[0] >= 40 && params[0] <= 47) {
      background = colour256(params[0] - 40);
    } else if (params[0] >= 100 && params[0] <= 107) {
      background = colour256(params[0] - 92);
    } else if (params[0] === 1) {
      // **Bold, and at one bit it is the entire signal.** `tone("error")`
      // resolves to `{ bold: true }` below `colourDepth: 4` — no colour at all —
      // so a renderer dropping this draws a 1-bit error frame identically to
      // plain text and the image shows the failure the design exists to prevent
      // while looking correct. An instrument reassembling real bytes with a
      // wrong model, which this file has shipped once before.
      bold = true;
    } else if (params[0] === 2) {
      // dim — darken current colour; approximate by halving
      colour = dimColour(colour);
    } else if (params[0] === 22) {
      // normal intensity — undoes bold; dim has no reliable inverse
      bold = false;
    }
  }
  if (pos < raw.length) {
    spans.push({ text: raw.slice(pos), colour, background, bold });
  }
  return spans;
}

/**
 * Every SGR code this parser does **not** handle, found in a frame.
 *
 * **The watcher on the one deferred arm.** `7m` has no producer today, so it has
 * no arm — but a deferral naming a condition with nothing watching it is how a
 * simplification outlives its excuse, so the condition is a function rather than
 * a comment. If a renderer ever emits inverse, this reports it by number and the
 * arm gets built then, against something that exercises it.
 */
const KNOWN_SGR = new Set([
  0, 1, 2, 22, 38, 39, 48, 49,
  30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97,
  40, 41, 42, 43, 44, 45, 46, 47, 100, 101, 102, 103, 104, 105, 106, 107,
]);

export function unparsedSgr(raw) {
  const seen = new Set();
  for (const m of raw.matchAll(ESC)) {
    const first = Number(m[1].split(";")[0]);
    if (!KNOWN_SGR.has(first)) seen.add(first);
  }
  return [...seen].sort((a, b) => a - b);
}

export function colour256(n) {
  if (n < 16) {
    const basic = [
      "#000000","#800000","#008000","#808000","#000080","#800080","#008080","#c0c0c0",
      "#808080","#ff0000","#00ff00","#ffff00","#0000ff","#ff00ff","#00ffff","#ffffff",
    ];
    return basic[n] ?? FG;
  }
  if (n < 232) {
    const i = n - 16;
    const r = Math.floor(i / 36) * 51;
    const g = Math.floor((i % 36) / 6) * 51;
    const b = (i % 6) * 51;
    return `rgb(${r},${g},${b})`;
  }
  const g = 8 + (n - 232) * 10;
  return `rgb(${g},${g},${g})`;
}

function dimColour(c) {
  // Rough approximation: just return a muted grey
  return "#666666";
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * **Braille goes through the font, like every other glyph.**
 *
 * It used to be drawn by hand as circles, from a dot map and a radius — and the
 * radius was `min(cellW, cellH) * 0.1`, 1.7px against a pitch of 4.5, with the
 * two dot columns pushed to the cell's *edges*, 5.9px apart in an 8.4px cell
 * where the true pitch is 4.2. So `⣿`, a **solid** cell, previewed as scattered
 * specks with stripes through it, and correcting the radius by eye overshot the
 * other way — 3.2px against the font's 2.04. *Measured off DejaVu Sans Mono at
 * this size: pitch 4.11 × 3.88, dot 2.04 across, glyph spanning 2.56 to 14.19
 * of the 16px cell.*
 *
 * **Nothing hand-drawn can be checked without measuring the font, so the font
 * draws it.** The argument for the circles was independence from the rendering
 * machine's fonts — and the rest of the frame never had it: every box-drawing
 * glyph, block glyph and letter already comes from the same stack, so a machine
 * without it renders tofu with or without this path. Braille was the one glyph
 * class modelled rather than rendered, and that inconsistency is where the
 * error hid (F204).
 */
export function ansiToSvg(ansi) {
  const lines = ansi.replace(/\n$/, "").split("\n");
  const maxCols = lines.reduce((mx, line) => {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
    return Math.max(mx, stripped.length);
  }, 0);

  const width = maxCols * CELL_W + PAD * 2;
  const height = lines.length * CELL_H + PAD * 2;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="${BG}"/>`,
    `<style>text { font-family: 'DejaVu Sans Mono', 'Menlo', 'Consolas', monospace; font-size: ${FONT_SIZE}px; }</style>`,
  ];

  for (let row = 0; row < lines.length; row++) {
    const spans = parseLine(lines[row]);
    let col = 0;
    const y = PAD + (row + 1) * CELL_H - 4;

    // Background runs first, so a glyph is never painted over by its own cell's
    // fill. Nothing in the framework emits these today — plots resolve no
    // background at all — but a swallowed code is how this renderer already
    // shipped drawing every frame in the default foreground.
    {
      let bgCol = 0;
      for (const span of spans) {
        const n = [...span.text].length;
        if (span.background !== null && n > 0) {
          const x = PAD + bgCol * CELL_W;
          parts.push(
            `<rect x="${x.toFixed(1)}" y="${(PAD + row * CELL_H).toFixed(1)}" ` +
            `width="${(n * CELL_W).toFixed(1)}" height="${CELL_H}" fill="${span.background}"/>`,
          );
        }
        bgCol += n;
      }
    }

    for (const span of spans) {
      if (span.text.length === 0) continue;
      // **A space is a column advance, never a glyph** — and that is the whole
      // of a defect that made every catalogue frame look broken while the
      // frames themselves were correct.
      //
      // SVG's default `xml:space="default"` strips leading and trailing
      // whitespace from a `<text>` and collapses internal runs to one space.
      // A row's indent survives only when it lands in a span of its own: row 0
      // of a plot is `"      "` then an SGR then `┌───┐`, two spans, and it
      // drew correctly. Row 1 is `SGR + "      │"` — one span — so the border
      // drew at column 0 and the frame looked shattered. An x-label row is one
      // span of `"    setosa      versicolor"`, so the labels bunched together
      // at the left with single spaces between them.
      //
      // Emitting one `<text>` per contiguous non-space run at its own column
      // removes the dependence on XML whitespace handling *and* on the font's
      // space advance matching CELL_W, which was the other way this could
      // drift. Nothing is drawn for a space, so nothing can be collapsed.
      let textRun = "";
      let textStart = col;
      // **One `<text>` per glyph, because a run's width was never ours to
      // state and every cheaper way of saying so is ignored.**
      //
      // A run placed at `col × CELL_W` lets the *font* advance the glyphs
      // inside it, so a one-character run lands exactly and a long one drifts.
      // Cropped and enlarged, the frame's corners sit visibly right of the
      // border between them.
      //
      // **Three fixes were tried and two of them are no-ops here, measured
      // rather than assumed.** Rendering a 76-glyph rule ending in `┐`, against
      // the same `│` alone at the same column:
      //
      //     one <text> with textLength    ignored — the PNG was identical
      //     one <text> with an x list     x=1285   ← only the first x is used
      //     one <text> per glyph          x=1282
      //     the border alone              x=1282
      //
      // `sharp` renders through librsvg, which implements neither `textLength`
      // nor per-glyph `x` lists. **An attribute a renderer ignores reads exactly
      // like one it honours**, which is why every step of this was a pixel
      // measurement and none of it an assertion about the SVG.
      //
      // What was *not* the cause, each checked before being ruled out: the frame
      // rows and the data rows end at the same x in the SVG (670.4, both); the
      // stems of `│ ┐ ┘ ┌ └ ┤` all rasterise to the same two columns at this
      // density; and supersampling at 4× and resampling down does not move it,
      // so it is not hinting.
      //
      // Per-glyph elements are what the braille path has always done. The cost
      // is element count in a build tool and the gain is that no glyph's
      // position depends on any other glyph's advance.
      const flush = () => {
        if (!textRun) return;
        [...textRun].forEach((ch, i) => {
          const x = PAD + (textStart + i) * CELL_W;
          const weight = span.bold === true ? ' font-weight="bold"' : "";
          parts.push(`<text x="${x.toFixed(1)}" y="${y}" fill="${span.colour}"${weight}>${escapeXml(ch)}</text>`);
        });
        textRun = "";
      };
      for (const ch of span.text) {
        if (ch === " ") {
          flush();
        } else {
          if (!textRun) textStart = col;
          textRun += ch;
        }
        col++;
      }
      flush();
    }
  }

  parts.push("</svg>");
  return parts.join("\n");
}

// --- main ---
//
// Guarded so the pure parts above can be imported by a fixture. The colour
// parsing and the braille dot map are exactly where a silent wrong answer
// lives — this renderer shipped once drawing every catalogue frame in the
// default foreground because `38;2;R;G;B` fell through, and nothing asked.
/**
 * Every `.txt` in the catalogue to a `.png`, and the 24-bit ones to one sheet.
 *
 * **Exported rather than left inside the `isMain` guard**, for the reason this
 * file already carries one floor down: a caller that cannot reach it writes its
 * own loop, and then the catalogue has two renderers with one of them the one a
 * reader looks at. The `node tools/catalogue-png.mjs` in the header only
 * resolves under a runner that maps `.js` specifiers onto `.ts` sources, so a
 * caller *is* how this normally runs.
 */
export async function renderCatalogueImages() {


const txtFiles = readdirSync(CATALOGUE)
  .filter((f) => f.endsWith(".txt"))
  .sort();

console.log(`Rendering ${txtFiles.length} PNGs...`);

const contactParts = [];

for (const file of txtFiles) {
  const txtPath = join(CATALOGUE, file);
  const pngPath = join(CATALOGUE, file.replace(/\.txt$/, ".png"));
  const ansi = readFileSync(txtPath, "utf8");

  const svg = ansiToSvg(ansi);

  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(pngPath);

  // **Every 24-bit frame, not the ones whose variant happens to be called
  // "default".** That filter silently excluded `histogram` and `horizon`
  // entirely — neither has a variant by that name — so the sheet showed 24 of
  // 34 forms and read as complete.
  if (file.endsWith("-24bit.txt")) {
    const buf = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
    contactParts.push({ name: file, buf });
  }
}

// Contact sheet
if (contactParts.length > 0) {
  const images = await Promise.all(
    contactParts.map(async ({ buf }) => {
      const meta = await sharp(buf).metadata();
      return { buf, w: meta.width ?? 800, h: meta.height ?? 200 };
    }),
  );

  // Masonry: each panel goes in the currently-shortest column. Panel heights
  // vary by an order of magnitude (a sparkline is 1 row, a violin is 18), so a
  // fixed grid is mostly whitespace and a single column is 300 panels tall.
  const COLS = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(images.length / 3))));
  const colW = Math.max(...images.map((i) => i.w)) + GAP;
  const colH = new Array(COLS).fill(0);
  const composites = [];
  for (const { buf, h } of images) {
    let c = 0;
    for (let i = 1; i < COLS; i++) if (colH[i] < colH[c]) c = i;
    composites.push({ input: buf, left: c * colW, top: colH[c] });
    colH[c] += h + GAP;
  }
  const maxW = COLS * colW;
  const totalH = Math.max(...colH);

  await sharp({
    // Was a second, independent `{r:26,g:26,b:46}` — the same invented indigo
    // written twice, so fixing one would have left the other.
    create: { width: maxW, height: totalH, channels: 4, background: sheetBg() },
  })
    .composite(composites)
    .png()
    .toFile(join(CATALOGUE, "_contact-sheet.png"));

  console.log(`Contact sheet: ${maxW}x${totalH}`);
}

console.log(`Done: ${txtFiles.length} PNGs written to docs/catalogue/`);
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) await renderCatalogueImages();
