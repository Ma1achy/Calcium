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

const CATALOGUE = join(import.meta.dirname, "..", "docs", "catalogue");

const FONT_SIZE = 14;
const CELL_W = 8.41;
const CELL_H = 18;
const PAD = 6;
const BG = "#1a1a2e";
const FG = "#cccccc";

const ESC = /\x1b\[([0-9;]*)m/g;

export function parseLine(raw) {
  const spans = [];
  let colour = FG;
  let pos = 0;
  for (const m of raw.matchAll(ESC)) {
    if (m.index > pos) {
      spans.push({ text: raw.slice(pos, m.index), colour });
    }
    pos = m.index + m[0].length;
    const params = m[1].split(";").map(Number);
    if (params[0] === 0) {
      colour = FG;
    } else if (params[0] === 39) {
      colour = FG;
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
    spans.push({ text: raw.slice(pos), colour });
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

  if (file.includes("-default-") && file.endsWith("-24bit.txt")) {
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

  const maxW = Math.max(...images.map((i) => i.w));
  const totalH = images.reduce((sum, i) => sum + i.h, 0);

  const composites = [];
  let y = 0;
  for (const { buf, h } of images) {
    composites.push({ input: buf, left: 0, top: y });
    y += h;
  }

  await sharp({
    create: { width: maxW, height: totalH, channels: 4, background: { r: 26, g: 26, b: 46, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toFile(join(CATALOGUE, "_contact-sheet.png"));

  console.log(`Contact sheet: ${maxW}x${totalH}`);
}

console.log(`Done: ${txtFiles.length} PNGs written to docs/catalogue/`);
}
