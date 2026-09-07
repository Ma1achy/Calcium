/**
 * Plot catalogue — renders every form and writes to docs/catalogue/.
 *
 * Fixtures live in catalogue-forms.ts — a `Record<PlotForm, …>`, so a form
 * with no entry fails to compile. It drifted to 26 of 34 when it did not.
 * At four capability sets: 24-bit narrow, 8-bit narrow, ASCII wide, 1-bit narrow.
 *
 * Run: node tools/plot-catalogue.mjs
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBlockRegistry } from "../src/presentation/blocks/index.js";
import { plotDefinition } from "../src/presentation/plot/index.js";
import { renderToLines } from "../src/presentation/render-lines.js";
import { defaultTheme, loadTheme } from "../src/presentation/theme/index.js";
import { slot } from "../src/presentation/blocks/paint.js";
import { block } from "../src/data/viewmodel/index.js";
import { CATALOGUE_FORMS } from "./catalogue-forms.js";

const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error("theme failed to load");
const theme = loaded.value.current;

const FULL = { colourDepth: 24, unicode: "full", ambiguousWidth: "narrow", synchronisedUpdate: true, bracketedPaste: true, mouse: true, imageProtocol: "none", altScreen: true };
const EIGHT = { ...FULL, colourDepth: 8 };
/**
 * **One capability per arm** (C12 I54, §3af, F212, F216).
 *
 * This was a single `ascii-wide` arm varying `unicode`, `ambiguousWidth` **and**
 * `colourDepth` together, and two capabilities that always move together cannot
 * be told apart by any number of frames. The corpus therefore had:
 *
 * - no `ascii · narrow` frame at all, which is where the box-drawing rasteriser
 *   lives — 49 of 159 variants were emitting `╭─╯` into a frame labelled ascii
 *   and nothing rendered it;
 * - no `full · wide` frame at all, which is where the braille ramps live and
 *   where F171's `RAMP_BRAILLE` defect lived.
 *
 * So `ascii` is narrow and a new `wide` arm carries the full repertoire. Each
 * capability now varies on its own axis, and `1bit` keeps depth separate from
 * both.
 */
const ASCII = { ...FULL, unicode: "ascii", colourDepth: 1 };
const WIDE = { ...FULL, ambiguousWidth: "wide" };
const MONO = { ...FULL, colourDepth: 1 };

export const CAPS = [
  { name: "24bit", caps: FULL },
  { name: "8bit", caps: EIGHT },
  { name: "ascii", caps: ASCII },
  { name: "wide", caps: WIDE },
  { name: "1bit", caps: MONO },
];

const registry = createBlockRegistry({});
registry.register(plotDefinition);

export const FORMS = CATALOGUE_FORMS;

/**
 * The plot's own ground, as `[r, g, b]` — resolved from the same theme the
 * frames are drawn with (F501).
 *
 * **A frame carries this colour as a *foreground*, and a reader cannot see it.**
 * Unicode's block elements fill from the bottom, so a cell whose covered mass
 * sits at the top is drawn as its complement with the two colours exchanged —
 * and the exchange needs an ink for the empty part. Left unset the terminal
 * paints it in the default foreground, which streaked a Gaussian's base white.
 * So the ground goes in explicitly, painting exactly what was already there.
 *
 * Exported because two test files were counting it as a distinct colour and
 * reading a third face on a two-faced cube. **Resolved rather than written
 * down**, so a theme change moves the frames and this together.
 */
export function groundRgb(caps) {
  const c = slot("surface.bg", theme, caps).colour;
  if (c === undefined || c.kind !== "rgb") return null;
  const v = Number.parseInt(c.hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function stripSgr(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * One rendered frame, as lines — the part with no filesystem in it.
 *
 * Separated so a fixture can ask whether a form renders without writing four
 * hundred files to do it, and so `n/m rows` counts something observed.
 */
export function frameFor(spec, caps, width, id = "cat") {
  // **`cursor` is context and not a block field** (C12 §3s). Stripped here
  // rather than tolerated by `block()`, which is transparent to excess
  // properties (F104) — a fixture field that reached the document would be a
  // `Plot` carrying something C04 never declared, and nothing would say so.
  //
  // **And the catalogue goes through this function**, which it did not. The
  // main loop built its own block and called `renderToLines` itself, so this
  // was a second renderer that only `export-fixtures.ts` used: a `cursor`
  // added here drew a crosshair in refdiff's half and nothing in the frames the
  // catalogue writes. Two paths, one of them the one a reader looks at.
  const { cursor, ...rest } = spec;
  return renderToLines(registry, block({ kind: "plot", id, ...rest }), width, {
    theme,
    capabilities: caps,
    ...(cursor === undefined ? {} : { cursorPositions: { [id]: cursor } }),
  });
}

/**
 * **Cleared before writing, because a removed fixture leaves its frame behind.**
 *
 * `histogram · sturges` outlived the variant that produced it and sat in the
 * catalogue through the whole rebuild — bare bin edges, the `rule` frame, and
 * the `░` meter track this component deleted. So a reader comparing the
 * histogram family across binning strategies was comparing three current frames
 * against one drawn by a renderer that no longer exists, and the difference
 * looked like an inconsistency in the *current* code.
 *
 * A generator that only ever writes cannot say what it did not write. The same
 * correction `tools/refdiff/reference.py` needed, one directory along, which is
 * the second instance and the reason this is a named function rather than four
 * lines inside the main block.
 */
export function clearGenerated(dir) {
  let removed = 0;
  for (const f of readdirSync(dir)) {
    // `.svg` joined when T2 landed: the SVG baseline is generated the same way
    // and a removed fixture must leave a deletion in the diff there too (F275).
    if (/\.(txt|plain|png|svg)$/.test(f)) {
      rmSync(join(dir, f));
      removed += 1;
    }
  }
  return removed;
}

/**
 * The catalogue's width policy — **one width per capability set.**
 *
 * The wide arm draws every ambiguous glyph two cells, so a figure needs the
 * narrower frame to stay inside a comparable footprint. `ascii` is narrow and
 * takes the ordinary width, which it never could before.
 */
export const CATALOGUE_WIDTHS = (capsName) => [capsName === "wide" ? 60 : 80];

/**
 * **The variant that stands for a form**, when a reader wants one tile per form.
 *
 * `default` if the form has one, else its first variant — and it is a function
 * because the rule was written three times and one copy was a **filename match**
 * (F313). `contact-defaults.mjs` collected `*-default-24bit.png`, which drops
 * every form with no variant by that name and picks up every *variant* whose
 * name ends in `-default`. Measured: `horizon` and `pie` absent, `violin` twice
 * as `violin` and `violin-bimodal`, and the sheet reporting **45 forms** for 44.
 *
 * `catalogue-png.mjs` carries a comment saying this filter *silently excluded
 * `histogram` and `horizon` entirely — so the sheet showed 24 of 34 forms and
 * read as complete.* It was fixed there and not in the sibling, which is the same
 * pair and the same relationship F261 already caught once.
 *
 * **A rule about the corpus is answered from the corpus**, never from the names
 * of files a previous step happened to write.
 */
export function representativeVariant(form) {
  const variants = FORMS[form];
  if (variants === undefined) throw new Error(`no fixtures for form ${form}`);
  return "default" in variants ? "default" : Object.keys(variants)[0];
}

/**
 * Every form × variant × capability set × width, as frames — **the loop, once.**
 *
 * `frameFor` already exists so that nobody renders a second way; this exists so
 * that nobody *enumerates* a second way. The catalogue and the terminal baseline
 * want the same corpus at different widths, and the difference between them is
 * `widthsFor` and nothing else. A second copy of this loop is how the two corpora
 * come to disagree about which forms they cover, which is the drift
 * `CATALOGUE_FORMS` was made a `Record<PlotForm, …>` to stop one level up.
 *
 * **The header is part of the frame**, so a frame that moved between widths is
 * not silently comparable with one that did not.
 */
export function* everyFrame(widthsFor = CATALOGUE_WIDTHS) {
  for (const [formName, variants] of Object.entries(FORMS)) {
    for (const [variantName, spec] of Object.entries(variants)) {
      for (const { name: capsName, caps } of CAPS) {
        for (const width of widthsFor(capsName)) {
          const id = `cat-${formName}-${variantName}`;
          const lines = frameFor(spec, caps, width, id);
          const header = `── ${formName} · ${variantName} · ${capsName} · ${width}w`;
          yield {
            formName, variantName, capsName, width,
            frame: [header, ...lines].join("\n"),
          };
        }
      }
    }
  }
}

/**
 * Every form x variant x capability set, written to `docs/catalogue/`.
 *
 * **Exported rather than left inside the `isMain` guard**, for the same reason
 * `frameFor` is a function: a caller that cannot reach this writes the loop
 * again, and then the frames a reader looks at came from the second copy. The
 * header's `node tools/plot-catalogue.mjs` only resolves under a runner that
 * maps `.js` specifiers onto `.ts` sources, so a caller is how this runs.
 */
export function renderCatalogue() {

const outDir = join(import.meta.dirname, "..", "docs", "catalogue");
mkdirSync(outDir, { recursive: true });
const stale = clearGenerated(outDir);

let totalFiles = 0;

for (const { formName, variantName, capsName, frame } of everyFrame(CATALOGUE_WIDTHS)) {
  const basename = `${formName}-${variantName}-${capsName}`;
  writeFileSync(join(outDir, `${basename}.txt`), frame + "\n");
  writeFileSync(join(outDir, `${basename}.plain`), stripSgr(frame) + "\n");
  totalFiles += 2;
}

console.log(`catalogue: ${totalFiles} files written to docs/catalogue/ (${stale} stale cleared first)`);
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) renderCatalogue();
