/**
 * Render catalogue .txt files (ANSI) to PNGs via custom SVG + sharp.
 *
 * ansi-to-svg does not handle 24-bit colour. This writes the SVG directly,
 * parsing only the three SGR forms the framework emits:
 *   38;2;R;G;Bm   24-bit foreground
 *   39m            default foreground
 *   0m             reset
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
const CELL_H = 18;
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
  let pos = 0;
  for (const m of raw.matchAll(ESC)) {
    if (m.index > pos) {
      spans.push({ text: raw.slice(pos, m.index), colour, background });
    }
    pos = m.index + m[0].length;
    const params = m[1].split(";").map(Number);
    if (params[0] === 0) {
      colour = FG;
      background = null;
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
    } else if (params[0] === 2) {
      // dim — darken current colour; approximate by halving
      colour = dimColour(colour);
    } else if (params[0] === 22) {
      // normal intensity — no reliable way to undo dim; reset to FG
    }
  }
  if (pos < raw.length) {
    spans.push({ text: raw.slice(pos), colour, background });
  }
  return spans;
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

// Braille U+2800–U+28FF: each codepoint encodes 8 dots as a bitmask.
// Dot positions in the 2×4 cell (col, row):
//   bit 0 → (0,0)  bit 3 → (1,0)
//   bit 1 → (0,1)  bit 4 → (1,1)
//   bit 2 → (0,2)  bit 5 → (1,2)
//   bit 6 → (0,3)  bit 7 → (1,3)
const BRAILLE_DOT_MAP = [
  [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3],
];

export function isBraille(ch) {
  const cp = ch.codePointAt(0);
  return cp !== undefined && cp >= 0x2800 && cp <= 0x28ff;
}

export function brailleDots(ch) {
  const bits = ch.codePointAt(0) - 0x2800;
  const dots = [];
  for (let i = 0; i < 8; i++) {
    if (bits & (1 << i)) {
      dots.push(BRAILLE_DOT_MAP[i]);
    }
  }
  return dots;
}

function renderBrailleCell(x, y, ch, colour, cellW, cellH) {
  const dots = brailleDots(ch);
  if (dots.length === 0) return "";
  const dotR = Math.min(cellW, cellH) * 0.1;
  const padX = cellW * 0.15;
  const padY = cellH * 0.08;
  const stepX = cellW - 2 * padX;
  const stepY = (cellH - 2 * padY) / 3;
  return dots.map(([dc, dr]) => {
    const cx = x + padX + dc * stepX;
    const cy = y + padY + dr * stepY;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${colour}"/>`;
  }).join("\n");
}

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
      // Split into braille and non-braille runs
      let textRun = "";
      let textStart = col;
      for (const ch of span.text) {
        if (isBraille(ch)) {
          // Flush any pending text run
          if (textRun) {
            const x = PAD + textStart * CELL_W;
            parts.push(`<text x="${x.toFixed(1)}" y="${y}" fill="${span.colour}">${escapeXml(textRun)}</text>`);
            textRun = "";
          }
          // Render braille as dots
          const cx = PAD + col * CELL_W;
          const cy = PAD + row * CELL_H;
          parts.push(renderBrailleCell(cx, cy, ch, span.colour, CELL_W, CELL_H));
          textStart = col + 1;
        } else {
          if (!textRun) textStart = col;
          textRun += ch;
        }
        col++;
      }
      if (textRun) {
        const x = PAD + textStart * CELL_W;
        parts.push(`<text x="${x.toFixed(1)}" y="${y}" fill="${span.colour}">${escapeXml(textRun)}</text>`);
      }
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
const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {

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
