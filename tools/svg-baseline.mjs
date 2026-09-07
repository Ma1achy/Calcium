/**
 * T2 — **the SVG arm's full output, committed, so its moves can be read**
 * (C12 §3ak.10, F275).
 *
 * T1 exists because §6b says the terminal arm must not move. **This exists for
 * the opposite reason**: the SVG arm is *supposed* to move, on every commit of
 * step 4, and the pass's rule is that **every move is read**. Nothing could read
 * one.
 *
 * **What was believed, and what is true** (F275). F264's remedy split the
 * catalogue digest into two populations and its doc says *the 66 `phase*` frames
 * are the SVG arm's own output*. Measured: `digestOf` hashes `.txt` only, and
 * **zero** of those 66 contain `<svg` — the `phase3-*` ones are `-cells.txt`,
 * terminal renderings of the forms this arm *refuses*. The SVG output lives in
 * `phase3-*-SIDE-BY-SIDE.png`, which nothing hashes. No golden snapshot holds
 * SVG either.
 *
 * So the arm's frame-level gate did not exist. What did gate it is
 * `plot-arm-disagreement.test.ts`, and that is a **cell** gate: it compares five
 * decisions and is blind to shape, which is the blind spot §3ak already records
 * for D14 and F268. A commit could change every ticked form's axis and move no
 * tracked byte — measured, doing exactly that.
 *
 * **One `.svg` per form and variant, at 24-bit only, and the depth is the whole
 * reason there is no capability axis.** This arm has no ladder (§3aj hazard 5):
 * it is always 24-bit and always `unicode: "full"`, so crossing capability sets
 * would write five identical copies of every frame and report five times the
 * coverage it has. T1 crosses widths because the terminal's truncation rungs are
 * width decisions; this arm's layout is *fractions*, so a second width is the
 * same picture at a different `viewBox` — one size, stated.
 *
 * Run: npx tsx tools/svg-baseline.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOGUE_FORMS } from "./catalogue-forms.js";
import { clearGenerated } from "./plot-catalogue.mjs";
import { plotToSvg } from "../src/presentation/plot/svg.js";
import { defaultTheme, loadTheme } from "../src/presentation/theme/index.js";

export const SVG_BASELINE_DIR = join(import.meta.dirname, "..", "test", "golden", "svg-baseline");

/** The name a frame is committed under. */
export function svgName(form, variant) {
  return `${form}-${variant}.svg`;
}

/**
 * **The refusals are frames too, and they are the half a picture cannot show.**
 *
 * `plotToSvg` returns `null` for nineteen forms, for `ohlc`, and for a
 * non-default `origin` — every one a *decision* (F259: refuse a false figure,
 * record an incomplete one). A corpus that skipped them would let a refusal
 * appear or vanish silently, which is the one thing a `null` arm must not do.
 * So a refusal is written as its own one-line frame and a form that starts or
 * stops drawing shows up as a diff rather than as a missing file.
 */
export const REFUSED = "REFUSED — plotToSvg returned null\n";

/** Every frame the SVG baseline holds, as `name → bytes`. */
export function svgFrames() {
  // **The shipped theme, loaded the way a consumer loads it** — not the raw
  // tokens. `resolve()` reads the *current* variant, and a corpus built from
  // something no application holds is a corpus of a theme nobody sees.
  const loaded = loadTheme(defaultTheme, "dark");
  if (!loaded.ok) throw new Error("the shipped theme does not load");
  const theme = loaded.value.current;
  const out = new Map();
  for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
    for (const [variant, spec] of Object.entries(variants)) {
      const { cursor, ...rest } = spec;
      void cursor;
      const block = { kind: "plot", id: "svgb", ...rest };
      const svg = plotToSvg(block, theme);
      out.set(svgName(form, variant), svg === null ? REFUSED : `${svg}\n`);
    }
  }
  return out;
}

/**
 * How many frames the corpus should hold — **derived, never a literal** (F256).
 *
 * Adding a form or a variant must move this, or the gate reports full coverage
 * of a corpus it has stopped covering.
 */
export function expectedSvgCount() {
  let n = 0;
  for (const vs of Object.values(CATALOGUE_FORMS)) n += Object.keys(vs).length;
  return n;
}

export function writeSvgBaseline(dir = SVG_BASELINE_DIR) {
  mkdirSync(dir, { recursive: true });
  const stale = clearGenerated(dir);
  const frames = svgFrames();
  for (const [name, bytes] of frames) writeFileSync(join(dir, name), bytes);
  return { written: frames.size, stale };
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const i = process.argv.indexOf("--dir");
  const dir = i === -1 ? SVG_BASELINE_DIR : process.argv[i + 1];
  const { written, stale } = writeSvgBaseline(dir);
  const refused = [...svgFrames().values()].filter((v) => v === REFUSED).length;
  console.log(`svg baseline: ${String(written)} frames written (${String(refused)} refusals, ${String(stale)} stale cleared first)`);
}
