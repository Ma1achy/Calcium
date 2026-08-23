/**
 * Phases 1–3, rendered for reading — **the visual pass nothing has had.**
 *
 * The plot catalogue covers forms. Three phases have shipped since its last full
 * read: the image block, plots of images, and the SVG renderer. This writes the
 * frames those phases actually produce, as `.txt` for diffing, and leaves the
 * PNGs to `catalogue-png.mjs` — which already converts every `.txt` here.
 *
 * **The kitty frames are placeholders and cannot be rasterised.** A placement is
 * drawn by the terminal from a payload written outside the frame, so a PNG of
 * one shows the diacritics and no picture. Those `.txt` files are written with
 * the transmission's size beside them, and a real terminal is the only reader.
 *
 * **Run AFTER `plot-catalogue.mjs`, and the order is not a preference.** That
 * tool clears every generated file in `docs/catalogue/` before it writes, so
 * running it second deletes all of this — measured, once, by watching 66 files
 * become 1. The two write into one directory and only one of them sweeps it.
 *
 * Run: npx tsx tools/plot-catalogue.mjs && npx tsx tools/phase-catalogue.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { createBlockRegistry } from "../src/presentation/blocks/index.js";
import { plotDefinition } from "../src/presentation/plot/index.js";
import { renderToLines } from "../src/presentation/render-lines.js";
import { defaultTheme, loadTheme } from "../src/presentation/theme/index.js";
import { b } from "../src/shell/builders/index.js";
import { transmitImage } from "../src/shell/transmit-image.js";
import { plotToSvg, svgLayout, SVG_FAMILY } from "../src/presentation/plot/svg.js";
import { sharedRange } from "../src/data/viewmodel/range.js";
import { CAPS } from "./plot-catalogue.mjs";
import { CATALOGUE_FORMS } from "./catalogue-forms.js";
import { block } from "../src/data/viewmodel/index.js";
import { ansiToSvg } from "./catalogue-png.mjs";

const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error("theme failed to load");
const theme = loaded.value.current;

const OUT = join(import.meta.dirname, "..", "docs", "catalogue");
mkdirSync(OUT, { recursive: true });

const registry = createBlockRegistry({});
registry.register(plotDefinition);

const capsBy = Object.fromEntries(CAPS.map((c) => [c.name, c.caps]));
const KITTY = { ...capsBy["24bit"], imageProtocol: "kitty" };

let written = 0;
const write = (name, text) => {
  writeFileSync(join(OUT, `${name}.txt`), `${text}\n`, "utf8");
  written += 1;
};
const draw = (blk, caps, width = 72) =>
  renderToLines(registry, blk, width, { theme, capabilities: caps }).join("\n");

// ── pictures ────────────────────────────────────────────────────────────────
// **Synthetic rather than a photograph, and said plainly.** There is no photo in
// this repository and one downloaded is a dependency on the network. What a
// photo tests here is *smooth tone* — whether the Bayer matrix bands — so a
// shaded sphere and a radial gradient test exactly that and are reproducible.
async function png(w, h, f) {
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, bl] = f(x, y);
      const i = (y * w + x) * 3;
      raw[i] = Math.max(0, Math.min(255, Math.round(r)));
      raw[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      raw[i + 2] = Math.max(0, Math.min(255, Math.round(bl)));
    }
  }
  const out = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  return out.toString("base64");
}

const SPHERE = await png(160, 120, (x, y) => {
  const nx = (x - 80) / 55;
  const ny = (y - 60) / 55;
  const r2 = nx * nx + ny * ny;
  if (r2 > 1) return [12, 12, 18];
  const nz = Math.sqrt(1 - r2);
  const l = Math.max(0.05, nx * -0.4 + ny * -0.5 + nz * 0.77);
  const spec = Math.pow(Math.max(0, l), 24) * 180;
  return [l * 210 + spec, l * 180 + spec, l * 235 + spec];
});
const GRADIENT = await png(160, 120, (x, y) => {
  const t = Math.hypot(x - 80, y - 60) / 100;
  const v = 255 * Math.max(0, 1 - t);
  return [v, v, v];
});
const CHECKER = await png(96, 96, (x, y) => {
  const v = ((x >> 4) + (y >> 4)) % 2 === 0 ? 225 : 35;
  return [v, v * 0.85, v * 0.6];
});

// ── phase 1 · the image block ───────────────────────────────────────────────
for (const name of ["24bit", "8bit", "ascii", "1bit"]) {
  write(`phase1-sphere-${name}`, draw(b.image({ data: SPHERE, height: 12, alt: "a shaded sphere" }), capsBy[name]));
  write(`phase1-gradient-${name}`, draw(b.image({ data: GRADIENT, height: 12, alt: "a radial gradient" }), capsBy[name]));
}
write("phase1-sphere-kitty", draw(b.image({ data: SPHERE, height: 12, alt: "a shaded sphere" }), KITTY));
write(
  "phase1-transmission-kitty",
  `# the payload the shell writes beside the placement — not part of any frame\n` +
    `${transmitImage([b.image({ data: SPHERE, height: 12, alt: "s" })], KITTY, new Set()).length} bytes`,
);
write(
  "phase1-bordered-24bit",
  draw(b.panel("an image inside a bordered block", [b.image({ data: SPHERE, height: 8, alt: "s" })]), capsBy["24bit"]),
);
write(
  "phase1-scrolled-24bit",
  draw(
    b.scroll(6, [b.raw("above"), b.image({ data: SPHERE, height: 10, alt: "s" }), b.raw("below")]),
    capsBy["24bit"],
  ),
);

// ── phase 2 · plots of images ───────────────────────────────────────────────
const SAMPLES = [
  { data: SPHERE, alt: "a", label: "cat 0.98" },
  { data: GRADIENT, alt: "b", label: "dog 0.91" },
  { data: CHECKER, alt: "c", label: "fox 0.77" },
  { data: SPHERE, alt: "d", label: "owl 0.64" },
];
write("phase2-samples-24bit", draw(b.samples({ items: SAMPLES, columns: 2, cellRows: 5 }), capsBy["24bit"]));
write("phase2-samples-kitty", draw(b.samples({ items: SAMPLES, columns: 2, cellRows: 5 }), KITTY));

const blob = Array.from({ length: 10 }, (_, r) =>
  Array.from({ length: 10 }, (_, c) => Math.exp(-(((r - 3) ** 2 + (c - 3) ** 2) / 8))),
);
write(
  "phase2-overlay-placed-24bit",
  draw(b.image({ data: SPHERE, height: 10, alt: "s", overlay: { values: blob } }), capsBy["24bit"]),
);
write("phase2-overlay-composited-kitty", draw(b.image({ data: SPHERE, height: 10, alt: "s", overlay: { values: blob } }), KITTY));

// **The pair that matters most.** Both frames are internally consistent.
const field = (f) => Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => f(r, c)));
const before = field((r, c) => 120 + 40 * Math.sin(c / 2) * Math.cos(r / 2));
const after = field((r, c) => 120 + 40 * Math.sin(c / 2 + 0.4) * Math.cos(r / 2));
const residual = before.map((row, r) => row.map((v, c) => Math.abs(v - (after[r]?.[c] ?? 0))));
const pin = sharedRange([before, after, residual]);
const panels = (shared) =>
  b.group("row", [before, after, residual].map((values, i) =>
    b.image({
      id: `p${i}`,
      data: SPHERE,
      height: 8,
      alt: ["before", "after", "residual"][i],
      overlay: shared ? { values, yMin: pin.min, yMax: pin.max } : { values },
    }),
  ));
write("phase2-residual-WITHOUT-shared-scale-24bit", draw(panels(false), capsBy["24bit"]));
write("phase2-residual-WITH-shared-scale-24bit", draw(panels(true), capsBy["24bit"]));

const classes = ["cat", "dog", "fox"];
const pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop";
const rowsSpec = [];
const kids = [];
let next = 0;
const head = [];
for (let c = 0; c <= classes.length; c += 1) {
  head.push(pool[next++]);
  kids.push(b.raw(c === 0 ? "" : classes[c - 1], { id: `h${c}` }));
}
rowsSpec.push(head.join(""));
for (const [i, klass] of classes.entries()) {
  const band = [];
  for (let c = 0; c <= classes.length; c += 1) {
    band.push(pool[next++]);
    kids.push(
      c === 0
        ? b.raw(klass, { id: `r${i}` })
        : b.image({ id: `c${i}${c}`, data: [SPHERE, GRADIENT, CHECKER][(i + c) % 3], height: 4, alt: `${klass}` }),
    );
  }
  rowsSpec.push(band.join(""));
}
write(
  "phase2-confusion-24bit",
  draw(
    b.mosaic({ height: 1 + classes.length * 4, areas: rowsSpec.join("/"), rows: [{ cells: 1 }, ...classes.map(() => ({ cells: 4 }))], columns: [{ cells: 6 }, 1, 1, 1], children: kids }),
    capsBy["24bit"],
  ),
);

const lum = [];
for (let y = 0; y < 120; y += 3) for (let x = 0; x < 160; x += 3) lum.push(255 * Math.max(0, 1 - Math.hypot(x - 80, y - 60) / 100));
write(
  "phase2-image-histogram-24bit",
  draw(
    b.group("row", [
      b.image({ id: "pic", data: GRADIENT, height: 10, alt: "the sample" }),
      b.plot({ id: "hist", form: "histogram", height: 10, series: [{ label: "luminance", values: lum }] }),
    ]),
    capsBy["24bit"],
  ),
);

// ── phase 3 · plots as images, side by side ─────────────────────────────────
// **The same fixtures the plot catalogue uses**, so a side-by-side compares two
// renderings and never two datasets — and so a form with its own shape (a
// hierarchy, a graph, OHLC bars) is built correctly rather than by this file
// guessing at a series.
const fixture = (form) => {
  const variants = CATALOGUE_FORMS[form];
  const key = "default" in variants ? "default" : Object.keys(variants)[0];
  return { ...variants[key], id: form };
};

/**
 * The first variant this arm can actually draw, or the default.
 *
 * **`flame` and `icicle` have two datum shapes and every fixture in both
 * corpora picks the other one.** Their default variant carries `categories` +
 * `series` — the terminal's `legacyDepthBars` — and the SVG arm draws the
 * *tiles*, which come from `hierarchy`. So a claimed form produced no
 * side-by-side at all, and the sheet showed the arm working for one of the
 * three forms it had claimed.
 *
 * Choosing by *can this be drawn* rather than by name is the fix, and it says
 * what it skipped rather than quietly picking: a form with no drawable variant
 * still falls through to `default` and lands in the refused list, which is the
 * honest answer.
 */
const drawableFixture = (form, variants) => {
  for (const [name, spec] of Object.entries(variants)) {
    const { id: _drop, cursor: _c, ...rest } = spec;
    try {
      if (plotToSvg(block({ kind: "plot", id: form, ...rest }), theme, layout) !== null) {
        return { ...spec, id: form, variant: name };
      }
    } catch { /* a variant the builder refuses is not a candidate */ }
  }
  return { ...fixture(form), variant: "default" };
};

const supported = Object.entries(SVG_FAMILY).filter(([, f]) => f !== null);
const refused = Object.entries(SVG_FAMILY).filter(([, f]) => f === null).map(([f]) => f);

const layout = svgLayout(560, 260);
for (const [form] of supported) {
  const variants = CATALOGUE_FORMS[form] ?? {};
  const spec = drawableFixture(form, variants);
  const { id: _drop, ...rest } = spec;
  const blk = block({ kind: "plot", id: form, ...rest });
  const cells = draw(blk, capsBy["24bit"], 68);
  write(`phase3-${form}-cells`, cells);
  const svg = plotToSvg(blk, theme, layout);
  if (svg === null) continue;
  // **Side by side, which is the phase's whole argument.** The terminal frame
  // goes through the same `ansiToSvg` the catalogue uses, so what is compared is
  // two renderings and not two tools.
  const left = await sharp(Buffer.from(ansiToSvg(cells))).png().toBuffer();
  const right = await sharp(Buffer.from(svg)).png().toBuffer();
  const lm = await sharp(left).metadata();
  const rm = await sharp(right).metadata();
  const h = Math.max(lm.height ?? 1, rm.height ?? 1);
  await sharp({
    create: { width: (lm.width ?? 1) + (rm.width ?? 1) + 24, height: h, channels: 3, background: "#0b0b0f" },
  })
    .composite([
      { input: left, left: 0, top: Math.floor((h - (lm.height ?? 1)) / 2) },
      { input: right, left: (lm.width ?? 1) + 24, top: Math.floor((h - (rm.height ?? 1)) / 2) },
    ])
    .png()
    .toFile(join(OUT, `phase3-${form}-SIDE-BY-SIDE.png`));
}

// **The refused half, rendered terminal-only so the boundary is visible.**
for (const form of refused) {
  try {
    const { id: _id, ...rest } = fixture(form);
    write(`phase3-REFUSED-${form}-cells`, draw(block({ kind: "plot", id: form, ...rest }), capsBy["24bit"], 68));
  } catch (e) {
    write(`phase3-REFUSED-${form}-cells`, `# ${form}: ${String(e?.message ?? e).slice(0, 200)}`);
  }
}
writeFileSync(
  join(OUT, "phase3-REFUSED.md"),
  `# Forms \`plotToSvg\` returns \`null\` for\n\n${refused.map((f) => `- \`${f}\``).join("\n")}\n\n` +
    `Not "unimplemented": each carries geometry the four families do not have — cumulative\n` +
    `position, a shape derived from the samples, structure rather than value, or its own\n` +
    `domain. A treemap drawn by the curve family measures, rasterises and reads as a chart\n` +
    `of something, which is the plausible wrong figure the \`null\` refuses.\n`,
  "utf8",
);

console.log(`phase catalogue: ${written} .txt written, ${supported.length} side-by-side PNGs, ${refused.length} refused forms listed`);
