/**
 * The eight image fixtures, written once and committed (C09 §4c, §8b).
 *
 * **Five are about placement and three are about the decoder**, and the split is
 * the reason there are eight rather than one. A photograph, a screenshot, a
 * diagram, a tall portrait and a single pixel exercise the *geometry* — aspect,
 * scaling, the clamp, the degenerate case — and every one of them is a question
 * only a terminal answers. The 16-bit, palette and interlaced files exercise the
 * **decoder**, and those are answered here: `decodePng` refuses two of them by
 * name and reads the third, which is checkable in a container and needs no
 * pixels at all.
 *
 * **Synthetic, and stated rather than implied.** None of these is a photograph
 * of anything; the first is continuous tone, which is the property under test —
 * the half-block rung exists because a gradient braille can only stipple arrives
 * as a gradient. A real photograph would test the same property and carry a
 * licence.
 *
 * Run with `node tools/fixtures.mjs` from `examples/plots`.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
mkdirSync(OUT, { recursive: true });

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** Deterministic value noise — no `Math.random`, so the bytes are reproducible. */
const hash = (x, y) => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
const smooth = (x, y, s) => {
  const xi = Math.floor(x / s);
  const yi = Math.floor(y / s);
  const fx = (x / s) - xi;
  const fy = (y / s) - yi;
  const ease = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  const u = ease(fx);
  const v = ease(fy);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
};

async function raw(w, h, px, name, opts = {}) {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = px(x, y);
      const i = (y * w + x) * 3;
      buf[i] = clamp(r);
      buf[i + 1] = clamp(g);
      buf[i + 2] = clamp(b);
    }
  }
  const out = await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png(opts).toBuffer();
  writeFileSync(join(OUT, name), out);
  return out.length;
}

// --- 1 · continuous tone, 2000x1500 -----------------------------------------
// A sky gradient, a sun, three ridges and a haze. **Every edge is soft**, which
// is what separates this rung from the dither: braille resolves the ridge line
// and cannot resolve the sky.
const photo = (x, y) => {
  const w = 2000;
  const h = 1500;
  const t = y / h;
  let r = 250 - 150 * t;
  let g = 190 - 60 * t;
  let b = 150 + 60 * t;
  const sun = Math.hypot(x - w * 0.72, y - h * 0.3) / (w * 0.11);
  if (sun < 1.6) {
    const k = Math.max(0, 1 - sun / 1.6) ** 2;
    r += 220 * k;
    g += 180 * k;
    b += 90 * k;
  }
  for (const [depth, base, tint] of [[0.62, 90, 40], [0.72, 60, 55], [0.84, 34, 70]]) {
    const ridge = h * depth + Math.sin(x / 260 + depth * 9) * h * 0.045 + smooth(x, depth * 900, 180) * h * 0.05;
    if (y > ridge) {
      const shade = base + (y - ridge) / h * 60 + smooth(x, y, 40) * 26;
      r = shade * 0.9;
      g = shade + tint * 0.35;
      b = shade * 0.75 + tint * 0.4;
    }
  }
  const haze = (smooth(x, y, 320) - 0.5) * 10;
  return [r + haze, g + haze, b + haze];
};

// --- 2 · a screenshot — flat fills, hard edges, small text bars ---------------
const screenshot = (x, y) => {
  const bg = [30, 33, 40];
  if (y < 34) return [46, 50, 60];                       // title bar
  if (x < 210) return y % 46 < 30 && x > 16 && x < 190   // sidebar rows
    ? [58, 64, 78] : [38, 42, 52];
  if (y > 60 && y < 300 && x > 240 && x < 1160) {        // a card
    if (y < 92) return [70, 120, 190];
    const bar = Math.floor((y - 100) / 26);
    if ((y - 100) % 26 < 14 && x < 260 + (bar * 137) % 820) return [120, 200, 150];
    return [44, 48, 58];
  }
  if (y > 330 && y < 760 && x > 240 && x < 1160) {       // a chart panel
    const cx = (x - 240) / 920;
    const line = 545 - Math.sin(cx * 7) * 150 - cx * 60;
    if (Math.abs(y - line) < 3) return [240, 170, 70];
    if (y > line && y < 760) return [40, 46, 60];
    return [34, 38, 48];
  }
  return bg;
};

// --- 3 · a diagram — one-pixel rules and blocky glyphs ------------------------
// **The case the half block is worse at**, and the ladder does not choose per
// image: this is here so the reading has something the braille arm wins on.
const diagram = (x, y) => {
  const white = [252, 252, 250];
  const ink = [24, 26, 32];
  const boxes = [[60, 60, 240, 130], [420, 60, 240, 130], [240, 320, 240, 130]];
  for (const [bx, by, bw, bh] of boxes) {
    const on = x >= bx && x < bx + bw && y >= by && y < by + bh;
    const edge = on && (x < bx + 2 || x >= bx + bw - 2 || y < by + 2 || y >= by + bh - 2);
    if (edge) return ink;
    if (on) {
      const row = Math.floor((y - by - 30) / 22);
      const inRow = (y - by - 30) % 22 < 9 && row >= 0 && row < 3;
      if (inRow && x > bx + 20 && x < bx + 20 + [150, 110, 180][row]) return [90, 96, 110];
      return white;
    }
  }
  if (Math.abs(y - 125) < 2 && x > 300 && x < 420) return ink;   // horizontal rule
  if (Math.abs(x - 360) < 2 && y > 190 && y < 320) return ink;   // vertical rule
  return white;
};

// --- 4 · a tall portrait ------------------------------------------------------
const portrait = (x, y) => {
  const t = y / 1600;
  const band = Math.floor(t * 9);
  const hue = [
    [200, 70, 90], [210, 110, 80], [220, 160, 80], [180, 190, 90], [110, 190, 120],
    [80, 180, 180], [80, 130, 200], [110, 90, 200], [160, 80, 180],
  ][band] ?? [128, 128, 128];
  const k = 0.75 + 0.25 * Math.cos((x / 600 - 0.5) * Math.PI);
  return [hue[0] * k, hue[1] * k, hue[2] * k];
};

/**
 * A 16-bit PNG, **hand-written because `sharp` will not emit one**.
 *
 * Measured: `sharp(raw, {depth:"ushort"}).png()` writes `bit depth 8` — the
 * pipeline downcasts, so asking the library for this fixture returns the fixture
 * next to it. Sixteen bits is two bytes a sample, big-endian, and the filter is
 * `None` on every row because the point is the header rather than the filters.
 */
function png16(w, h, px) {
  const crc32 = (buf) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xed_b8_83_20 & -(c & 1));
    }
    return ~c;
  };
  const stride = w * 6;
  const rawBytes = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y += 1) {
    rawBytes[y * (stride + 1)] = 0;
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = px(x, y);
      const at = y * (stride + 1) + 1 + x * 6;
      rawBytes.writeUInt16BE(r & 0xffff, at);
      rawBytes.writeUInt16BE(g & 0xffff, at + 2);
      rawBytes.writeUInt16BE(b & 0xffff, at + 4);
    }
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tagged = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(tagged) >>> 0);
    return Buffer.concat([len, tagged, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 16;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rawBytes)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const sizes = {};
sizes["photo.png"] = await raw(2000, 1500, photo, "photo.png", { compressionLevel: 9 });
sizes["screenshot.png"] = await raw(1200, 800, screenshot, "screenshot.png", { compressionLevel: 9 });
sizes["diagram.png"] = await raw(720, 480, diagram, "diagram.png", { compressionLevel: 9 });
sizes["portrait.png"] = await raw(600, 1600, portrait, "portrait.png", { compressionLevel: 9 });
sizes["pixel.png"] = await raw(1, 1, () => [220, 90, 70], "pixel.png");
// **`bitdepth: 8` explicitly, and the first version did not say it.** `sharp`
// picks the smallest depth a palette fits, so six colours came out at **depth 2**
// — which `decodePng` refuses on `depth !== 8`, making the file a third refusal
// wearing a control's label. The fixture that is meant to *decode* has to be
// shown to decode, which is what the verification pass below is for.
// **More than sixteen distinct colours, because `bitdepth` alone did not do it.**
// Asking for `bitdepth: 8` over a six-colour checkerboard still wrote **depth 4**:
// the option is a ceiling and the quantiser picks what the palette needs. A 12x12
// grid of 144 hues needs eight bits by construction, which is the honest way to
// ask for an 8-bit palette rather than to request one and hope.
sizes["palette.png"] = await raw(360, 360, (x, y) => {
  const i = Math.floor(x / 30);
  const j = Math.floor(y / 30);
  const n = j * 12 + i;
  return [40 + ((n * 17) % 210), 40 + ((n * 53) % 210), 40 + ((n * 97) % 210)];
}, "palette.png", { palette: true, colours: 200, bitdepth: 8 });
sizes["interlaced.png"] = await raw(320, 240, (x, y) => [x % 256, y % 256, (x + y) % 256], "interlaced.png", {
  progressive: true,
});

const sixteen = png16(320, 240, (x, y) => [(x * 205) & 0xffff, (y * 273) & 0xffff, 32000]);
writeFileSync(join(OUT, "depth16.png"), sixteen);
sizes["depth16.png"] = sixteen.length;

/**
 * **Each fixture put through the decoder it is a fixture for.**
 *
 * A header read alone is not enough: a file *claiming* to be a palette PNG and a
 * file the decoder actually reads are different claims, and the first version of
 * this script conflated them — `palette: true` gave depth 2, which `decodePng`
 * refuses, so the one fixture meant to succeed was a third refusal carrying a
 * control's name. **A fixture must be shown to respond to the thing under test
 * before it is asserted against** (`test/support/README.md`).
 */
const { readFileSync } = await import("node:fs");
const { decodePng } = await import("../../../dist/presentation/image/index.js");

const EXPECTED = {
  "photo.png": "reads",
  "screenshot.png": "reads",
  "diagram.png": "reads",
  "portrait.png": "reads",
  "pixel.png": "reads",
  "palette.png": "reads",
  "interlaced.png": "refuses",
  "depth16.png": "refuses",
};

let wrong = 0;
for (const [name, bytes] of Object.entries(sizes)) {
  const file = new Uint8Array(readFileSync(join(OUT, name)));
  const d = decodePng(file);
  const got = d.ok ? "reads" : "refuses";
  const want = EXPECTED[name];
  const mark = got === want ? "  " : "!!";
  if (got !== want) wrong += 1;
  const why = d.ok ? `${d.pixels.width}x${d.pixels.height}` : d.fault;
  console.log(
    `${mark} ${name.padEnd(16)} ${String(bytes).padStart(7)}B  ` +
      `depth=${String(file[24]).padStart(2)} colour=${file[25]} interlace=${file[28]}  ` +
      `${got.padEnd(8)} ${why}`,
  );
  // **The extent survives a refusal** (F413) — the property `/image` depends on.
  if (!d.ok && d.size === undefined && want === "refuses") {
    console.log(`   ^ NOTE: refused with no size — this one cannot be laid out at kitty`);
  }
}
if (wrong > 0) {
  console.error(`\n${String(wrong)} fixture(s) do not do what they are named for`);
  process.exit(1);
}
console.log("\nevery fixture does what it is named for");
