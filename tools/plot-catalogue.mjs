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
import { block } from "../src/data/viewmodel/index.js";
import { CATALOGUE_FORMS } from "./catalogue-forms.js";

const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error("theme failed to load");
const theme = loaded.value.current;

const FULL = { colourDepth: 24, unicode: "full", ambiguousWidth: "narrow", synchronisedUpdate: true, bracketedPaste: true, mouse: true, imageProtocol: "none", altScreen: true };
const EIGHT = { ...FULL, colourDepth: 8 };
const ASCII_WIDE = { ...FULL, unicode: "ascii", ambiguousWidth: "wide", colourDepth: 1 };
const MONO = { ...FULL, colourDepth: 1 };

export const CAPS = [
  { name: "24bit", caps: FULL },
  { name: "8bit", caps: EIGHT },
  { name: "ascii-wide", caps: ASCII_WIDE },
  { name: "1bit", caps: MONO },
];

const registry = createBlockRegistry({});
registry.register(plotDefinition);

export const FORMS = CATALOGUE_FORMS;

export function stripSgr(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * One rendered frame, as lines — the part with no filesystem in it.
 *
 * Separated so a fixture can ask whether a form renders without writing four
 * hundred files to do it, and so `n/m rows` counts something observed.
 */
export function frameFor(spec, caps, width) {
  return renderToLines(registry, block({ kind: "plot", id: "cat", ...spec }), width, {
    theme, capabilities: caps,
  });
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;

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
    if (/\.(txt|plain|png)$/.test(f)) {
      rmSync(join(dir, f));
      removed += 1;
    }
  }
  return removed;
}

if (isMain) {
const outDir = join(import.meta.dirname, "..", "docs", "catalogue");
mkdirSync(outDir, { recursive: true });
const stale = clearGenerated(outDir);

let totalFiles = 0;

for (const [formName, variants] of Object.entries(FORMS)) {
  for (const [variantName, spec] of Object.entries(variants)) {
    for (const { name: capsName, caps } of CAPS) {
      const id = `cat-${formName}-${variantName}`;
      const width = capsName === "ascii-wide" ? 60 : 80;
      const b = block({ kind: "plot", id, ...spec });

      const lines = renderToLines(registry, b, width, { theme, capabilities: caps });
      const header = `── ${formName} · ${variantName} · ${capsName} · ${width}w`;
      const frame = [header, ...lines].join("\n");

      const basename = `${formName}-${variantName}-${capsName}`;
      writeFileSync(join(outDir, `${basename}.txt`), frame + "\n");
      writeFileSync(join(outDir, `${basename}.plain`), stripSgr(frame) + "\n");
      totalFiles += 2;
    }
  }
}

console.log(`catalogue: ${totalFiles} files written to docs/catalogue/ (${stale} stale cleared first)`);
}
