/**
 * The comparison catalogue — **both arms, side by side, for a reader**
 * (C12 §3ak, F309).
 *
 * The unification pass's assertion is that the arms agree about everything
 * except resolution, and **nothing has looked.** `plot-arm-disagreement.test.ts`
 * compares five *decisions* per form; F297 is five instances of a reader
 * calibrated to an encoding nobody wrote. **A matrix is a claim about what the
 * arms decide; a frame is what a reader sees.** Both are needed and one existed.
 *
 * **There is no third renderer and no `svg-catalogue.mjs`** (F309). The plan
 * asked for phase-catalogue widened to the full corpus; measured, that tool
 * exists — `tools/svg-baseline.mjs` writes one `.svg` per form·variant over the
 * whole of `CATALOGUE_FORMS`, refusals included, into a **tracked** directory.
 * A second tool rendering the same 178 frames is the drift `frameFor` and
 * `everyFrame` exist to stop one floor down. So this reads two corpora that are
 * each already gated and composes them.
 *
 * Run AFTER the two that produce its inputs, and the order is not a preference
 * — `plot-catalogue.mjs` **clears** every generated file in `docs/catalogue/`
 * (F261):
 *
 *   npx tsx tools/plot-catalogue.mjs \
 *     && npx tsx tools/phase-catalogue.mjs \
 *     && npx tsx tools/catalogue-png.mjs \
 *     && npx tsx tools/svg-baseline.mjs \
 *     && npx tsx tools/pair-catalogue.mjs
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { CATALOGUE_FORMS } from "./catalogue-forms.js";
import { ansiToSvg, sheetBg } from "./catalogue-png.mjs";
import { representativeVariant } from "./plot-catalogue.mjs";
import { REFUSED, SVG_BASELINE_DIR, expectedSvgCount, svgName } from "./svg-baseline.mjs";

const CATALOGUE = join(import.meta.dirname, "..", "docs", "catalogue");

/**
 * **Equal width, and the plan said equal height** (F309).
 *
 * *"The SVG is scaled to the same pixel height — a comparison at different sizes
 * is a comparison of two pictures rather than two renderings."* The concern is
 * right and the axis is wrong, which is F303's shape one artefact along.
 *
 * A terminal frame is **wide and short by construction**: 80 cells across and
 * 3–20 rows down, so 685 × 92 for a 5-row form. Every SVG frame is **640 × 320**
 * whatever the block's `height` says. Matching heights scales that 5-row frame
 * by 3.3 and a 3-row heatmap by ten — a 6800-pixel tile of blocky cells, which
 * is not a rendering anybody compares. Matching widths leaves both at reading
 * size and makes the height difference **the visible thing**, which is what the
 * pair is for: it is a real disagreement and no row reaches it.
 *
 * **And width is the axis, not the fit** (F315). Fitting *each pair* to the slot
 * is the same mistake one level down, and the first sheet is where it showed: the
 * frames run **27 to 80 columns**, so a per-pair fit applies **0.99× to 2.84×**
 * and the waffle's 33-column grid arrives two and a half times the size of the
 * line's. Tiles stop being comparable with each other, which is what a contact
 * sheet is.
 *
 * So the scale is **constant per arm**: a cell is one size everywhere, an SVG
 * canvas is one size everywhere, and 80 columns is what fills the slot. A frame
 * narrower than that is drawn narrower, because it **is** narrower.
 */
export const PAIR_WIDTH = 680;

/**
 * What 80 columns costs, asked of the renderer rather than restated.
 *
 * `ansiToSvg`'s cell width and padding are its own; a second copy here is the
 * class this campaign has met four times, so the reference is measured by
 * rendering eighty columns and reading the `viewBox` back.
 */
const viewBoxWidth = (svg) => Number(/viewBox="0 0 ([\d.]+)/u.exec(svg)?.[1] ?? 1);
const REFERENCE_WIDTH = viewBoxWidth(ansiToSvg("x".repeat(80)));

/** The slot width a terminal frame of this natural width gets — linear, never fitted. */
export function terminalWidthFor(naturalWidth) {
  return Math.max(1, Math.round((PAIR_WIDTH * naturalWidth) / REFERENCE_WIDTH));
}
const GAP = 20;
const HEADER = 26;

/** Where the two halves and the caption sit, for a pair of rasterised halves. */
export function pairLayout(leftH, rightH) {
  const body = Math.max(leftH, rightH);
  return {
    width: PAIR_WIDTH * 2 + GAP,
    height: HEADER + body,
    left: { x: 0, y: HEADER },
    right: { x: PAIR_WIDTH + GAP, y: HEADER },
  };
}

/**
 * **The variant refusals, declared — because the record names two of five**
 * (F309).
 *
 * `svg-baseline.mjs` and SB4 both say `plotToSvg` returns `null` *for nineteen
 * forms, for `ohlc`, and for a non-default `origin`*. Measured over the
 * committed corpus: **77 refused frames, and 19 of them are not a refused
 * form.** Five discriminators, not three — the two above, plus an empty value
 * list, plus `flame`/`icicle`'s legacy `categories`+`series` datum (recorded one
 * tool along, in `phase-catalogue.mjs`), plus **`treeLayout: "outline"`, which
 * was in no document at all.**
 *
 * **The fifth is gone and this list is how it went** (F310). `outline` was the
 * layout with the *least* geometry above cells and the only one refused, which
 * is backwards from difficulty; it draws now, and the two declarations that had
 * named it came back as **dead decls** on the next run rather than sitting here
 * excusing a refusal nobody makes. That is the equality arm earning its place —
 * a subset check would have left them.
 *
 * Compared by **equality**, never as a subset: a subset check lets a dead entry
 * outlive its reason unread, and lets a new refusal in silently — which is the
 * one thing a `null` arm must not do (F259).
 */
export const VARIANT_REFUSALS = {
  flame: { default: "the legacy categories+series datum, not a hierarchy" },
  heatmap: { origin: "a non-default origin" },
  icicle: { default: "the legacy categories+series datum, not a hierarchy" },
  line: {
    // The four `ohlc` rows are gone: the candles draw (§3ak.31). They came back
    // as `dead decls` the moment the arm did, which is what the equality check
    // is for — a subset check would have left them. **The seven `empty` rows
    // went the same way** (F363, C12 I79): an empty figure is drawn now, so
    // *the series carries an empty value list* stopped being a refusal and the
    // counter said so on the first run.
    "origin-bottom-right": "a non-default origin",
    "origin-top-left": "a non-default origin",
    "origin-top-right": "a non-default origin",
  },
};

/** Every committed SVG frame, as `form → variant → refused?`. */
export function refusalMap(dir = SVG_BASELINE_DIR) {
  const out = {};
  for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
    out[form] = {};
    for (const variant of Object.keys(variants)) {
      const path = join(dir, svgName(form, variant));
      out[form][variant] = readFileSync(path, "utf8") === REFUSED;
    }
  }
  return out;
}

/**
 * The refusal partition — **`family` and `variant` are different units, and the
 * plan's counter compared one against the other** (F309).
 *
 * *"How many refusals were drawn, against `SVG_FAMILY`'s null count. They must
 * agree."* They cannot: the left is **frames** and the right is **forms**, and
 * even converted there are refusals no family holds. Restated as *every refused
 * frame is attributable to a named cause, and the causes are enumerated*, the
 * same counter finds the nine frames the record does not cover.
 */
export function partition(map = refusalMap()) {
  const family = [];
  const variant = [];
  const undeclared = [];
  const declaredUnused = [];
  for (const [form, variants] of Object.entries(map)) {
    const names = Object.keys(variants);
    const refused = names.filter((v) => variants[v]);
    if (refused.length === names.length && names.length > 0) {
      for (const v of refused) family.push(`${form}/${v}`);
      continue;
    }
    const declared = VARIANT_REFUSALS[form] ?? {};
    for (const v of refused) {
      if (Object.hasOwn(declared, v)) variant.push(`${form}/${v}`);
      else undeclared.push(`${form}/${v}`);
    }
    for (const v of Object.keys(declared)) {
      if (!variants[v]) declaredUnused.push(`${form}/${v}`);
    }
  }
  // **A form declared here that refuses every variant is a family refusal now**,
  // and its declaration is dead — the equality check has to see that too, or a
  // form sliding from variant-refused to family-refused reads as unchanged.
  for (const form of Object.keys(VARIANT_REFUSALS)) {
    const variants = map[form];
    if (variants === undefined) { declaredUnused.push(`${form}/*`); continue; }
    if (Object.keys(variants).every((v) => variants[v])) {
      for (const v of Object.keys(VARIANT_REFUSALS[form])) declaredUnused.push(`${form}/${v}`);
    }
  }
  const dedupe = (xs) => [...new Set(xs)].sort();
  return {
    family: family.sort(),
    variant: variant.sort(),
    undeclared: dedupe(undeclared),
    declaredUnused: dedupe(declaredUnused),
  };
}

/** Why a frame refuses, as the placard says it. */
export function reasonFor(form, variant, map = refusalMap()) {
  const variants = map[form] ?? {};
  if (Object.keys(variants).length > 0 && Object.keys(variants).every((v) => variants[v])) {
    return "no SVG emitter for this form";
  }
  return VARIANT_REFUSALS[form]?.[variant] ?? "refused, and no declared reason";
}

/**
 * The variant a form is shown by on the paired **defaults** sheet.
 *
 * **The first variant this arm can draw, not the one called `default`** — the
 * rule `phase-catalogue.mjs` already had to make, and for the same measured
 * reason: `flame` and `icicle` carry two datum shapes and their `default` is the
 * one this arm refuses. A sheet keyed on the name shows two claimed forms as
 * refused and reads as an arm working for fewer forms than it does. Read off the
 * committed corpus rather than by re-rendering, so there is one renderer.
 */
export function drawablePick(form, map = refusalMap()) {
  const variants = map[form] ?? {};
  const drawable = Object.keys(variants).find((v) => !variants[v]);
  // **The fallback is the shared rule, not a fourth copy of it** (F313) — a form
  // this arm refuses entirely still lands on its representative frame, under the
  // refusal placard.
  return drawable ?? representativeVariant(form);
}

const esc = (s) => String(s).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

/** The right half when there is nothing to draw — **a stated decision, not a gap.** */
export function placard(form, variant, reason) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320" width="640" height="320">`
    + `<rect width="100%" height="100%" fill="#141419"/>`
    + `<rect x="8" y="8" width="624" height="304" fill="none" stroke="#3a3a48" stroke-width="2" stroke-dasharray="8 6"/>`
    + `<text x="320" y="150" text-anchor="middle" font-family="monospace" font-size="24" fill="#c04a4a">refused</text>`
    + `<text x="320" y="182" text-anchor="middle" font-family="monospace" font-size="15" fill="#9aa0b4">${esc(reason)}</text>`
    + `<text x="320" y="206" text-anchor="middle" font-family="monospace" font-size="13" fill="#6a7086">${esc(form)} · ${esc(variant)}</text>`
    + `</svg>`;
}

const caption = (w, text, right) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${HEADER}">`
  + `<rect width="100%" height="100%" fill="${sheetBg()}"/>`
  + `<text x="4" y="18" font-family="monospace" font-size="13" fill="#d0d4e4">${esc(text)}</text>`
  + `<text x="${PAIR_WIDTH + GAP + 4}" y="18" font-family="monospace" font-size="13" fill="#7f88a8">${esc(right)}</text>`
  + `</svg>`;

const raster = async (svg, width) =>
  sharp(Buffer.from(svg), { density: 144 }).resize({ width }).png().toBuffer();

/** One pair, terminal left, SVG right, at equal width. */
async function pairFor(form, variant, map) {
  const txt = join(CATALOGUE, `${form}-${variant}-24bit.txt`);
  const ansi = readFileSync(txt, "utf8");
  const leftSvg = ansiToSvg(ansi);
  const left = await raster(leftSvg, terminalWidthFor(viewBoxWidth(leftSvg)));
  const svgPath = join(SVG_BASELINE_DIR, svgName(form, variant));
  const body = readFileSync(svgPath, "utf8");
  const refused = body === REFUSED;
  const right = await raster(refused ? placard(form, variant, reasonFor(form, variant, map)) : body, PAIR_WIDTH);
  const lm = await sharp(left).metadata();
  const rm = await sharp(right).metadata();
  const lh = lm.height ?? 1;
  const rh = rm.height ?? 1;
  const box = pairLayout(lh, rh);
  const buf = await sharp({ create: { width: box.width, height: box.height, channels: 4, background: sheetBg() } })
    .composite([
      { input: Buffer.from(caption(box.width, `${form} · ${variant} · terminal 80w · 24bit`, `svg · ${refused ? "refused" : "640×320"} · terminal ${String(lm.width ?? 0)}×${String(lh)}px, svg ${String(rm.width ?? 0)}×${String(rh)}px`)), left: 0, top: 0 },
      { input: left, left: box.left.x, top: box.left.y },
      { input: right, left: box.right.x, top: box.right.y },
    ])
    .png()
    .toBuffer();
  return { buf, refused, height: box.height, width: box.width };
}

export async function renderPairs() {
  mkdirSync(CATALOGUE, { recursive: true });
  const map = refusalMap();
  const part = partition(map);

  // **Read once.** The directory holds a few thousand files after
  // `catalogue-png.mjs`, and a `readdirSync` per frame is 178 walks of it.
  const onDisk = new Set(readdirSync(CATALOGUE));

  let produced = 0;
  let refusalsDrawn = 0;
  const missing = [];
  const defaults = [];
  for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
    const pick = drawablePick(form, map);
    for (const variant of Object.keys(variants)) {
      if (!onDisk.has(`${form}-${variant}-24bit.txt`)) {
        missing.push(`${form}/${variant}`);
        continue;
      }
      const { buf, refused } = await pairFor(form, variant, map);
      writeFileSync(join(CATALOGUE, `pair-${form}-${variant}.png`), buf);
      produced += 1;
      if (refused) refusalsDrawn += 1;
      if (variant === pick) defaults.push({ form, variant, buf });
    }
  }

  // The paired contact sheet — **the artefact to review first.**
  const metas = await Promise.all(defaults.map(async (d) => ({ ...d, m: await sharp(d.buf).metadata() })));
  const COLS = 3;
  const colW = Math.max(...metas.map((t) => t.m.width ?? 1)) + GAP;
  const colH = new Array(COLS).fill(0);
  const composites = [];
  for (const t of metas) {
    let c = 0;
    for (let i = 1; i < COLS; i += 1) if (colH[i] < colH[c]) c = i;
    composites.push({ input: t.buf, left: c * colW, top: colH[c] });
    colH[c] += (t.m.height ?? 1) + GAP;
  }
  const W = COLS * colW;
  const H = Math.max(...colH);
  await sharp({ create: { width: W, height: H, channels: 4, background: sheetBg() } })
    .composite(composites)
    .png()
    .toFile(join(CATALOGUE, "_contact-sheet-pairs.png"));

  return { produced, expected: expectedSvgCount(), refusalsDrawn, missing, part, sheet: { forms: metas.length, W, H } };
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const r = await renderPairs();
  // **The counters, read rather than the exit status** — an exit code is one bit
  // and it is the same bit for *clean* and for *did not run*.
  console.log(`pairs        ${String(r.produced)} produced / ${String(r.expected)} expected`);
  console.log(`missing      ${r.missing.length === 0 ? "none" : r.missing.join(" ")}`);
  console.log(`refusals     ${String(r.refusalsDrawn)} drawn · ${String(r.part.family.length)} family · ${String(r.part.variant.length)} variant`);
  console.log(`undeclared   ${r.part.undeclared.length === 0 ? "none" : r.part.undeclared.join(" ")}`);
  console.log(`dead decls   ${r.part.declaredUnused.length === 0 ? "none" : r.part.declaredUnused.join(" ")}`);
  console.log(`paired sheet ${String(r.sheet.forms)} forms · ${String(r.sheet.W)}x${String(r.sheet.H)}`);
}
