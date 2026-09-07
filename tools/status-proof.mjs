/**
 * The `status` box and F227's spinner, as images.
 *
 *     npx tsx tools/status-proof.mjs
 *
 * **The still frames only — the animations moved to `animation-proof.mjs`.**
 * Four GIFs were assembled here, and two of them were wrong in a way this file
 * could not see: `status-loading` held `elapsedMs: 4000` and `status-retrying`
 * held `retryInMs: 8000` for **every** frame, so the spinner turned and the
 * numbers beside it stood still — F227's own failure mode, in the artefact built
 * to prove F227 fixed. The fixture asserts distinctness over `steps`, which
 * carries no numbers, so it agreed.
 *
 * What is left here is the ladder: three states at four capability sets, six
 * heights and six widths, all at `tick: 0`. Those are frames where nothing is
 * supposed to move, which is why they belong apart from the ones where
 * everything is.
 *
 * **The frames go through `ansiToSvg`**, which is the catalogue's own renderer,
 * so an SGR arm missing there is missing here too — and the 1-bit frames are the
 * ones that depend on it. `tone("error")` resolves to `{ bold: true }` below
 * `colourDepth: 4` and to nothing else, so a renderer dropping `1m` would draw
 * the 1-bit frames identically to plain text and the images would look correct
 * while showing the failure the design exists to prevent.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

import { ansiToSvg } from "./catalogue-png.mjs";
import { createBlockRegistry } from "../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../src/presentation/render-lines.js";
import { defaultTheme, loadTheme } from "../src/presentation/theme/index.js";

const OUT = join(import.meta.dirname, "..", "docs", "catalogue", "status");
mkdirSync(OUT, { recursive: true });

const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error("theme failed to load");
const THEME = loaded.value.current;

const BASE = {
  unicode: "full",
  ambiguousWidth: "narrow",
  colourDepth: 24,
  altScreen: true,
  mouse: false,
  hyperlinks: false,
  synchronised: false,
  bracketedPaste: false,
  cursorShape: true,
};

const CAPS = {
  "24bit": { ...BASE },
  "8bit": { ...BASE, colourDepth: 8 },
  "1bit": { ...BASE, colourDepth: 1 },
  ascii: { ...BASE, unicode: "ascii", colourDepth: 4 },
};

const registry = createBlockRegistry();

const block = (over) => ({
  kind: "status",
  id: "s",
  state: "error",
  message: "plot failed to render: Cannot read properties of undefined",
  height: 7,
  ...over,
});

const ansiFor = (b, width, caps, tick) =>
  renderSequenceToLines(registry, [b], width, { theme: THEME, capabilities: caps, tick }).join("\n");

async function png(name, ansi) {
  const svg = ansiToSvg(ansi);
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(join(OUT, `${name}.png`));
  writeFileSync(join(OUT, `${name}.txt`), `${ansi}\n`);
  return svg;
}


const WIDTH = 52;

// --- the three states, at four capability sets ------------------------------
for (const [depth, caps] of Object.entries(CAPS)) {
  for (const state of ["error", "loading", "retrying"]) {
    const b = block({
      state,
      height: 7,
      message:
        state === "error"
          ? block({}).message
          : state === "retrying"
            ? "connection refused"
            : "fetching container stats",
      ...(state === "retrying" ? { retryInMs: 8000, attempt: 2 } : {}),
      ...(state === "loading" ? { elapsedMs: 4000 } : {}),
    });
    await png(`status-${state}-${depth}`, ansiFor(b, WIDTH, caps, 0));
  }
}

// --- the height ladder, at 24-bit -------------------------------------------
for (const h of [1, 2, 3, 4, 5, 6]) {
  await png(`status-error-h${String(h)}`, ansiFor(block({ height: h }), WIDTH, CAPS["24bit"], 0));
}

// --- the width ladder, at one height ----------------------------------------
for (const w of [30, 13, 11, 9, 8, 3]) {
  await png(`status-error-w${String(w)}`, ansiFor(block({ height: 6 }), w, CAPS["24bit"], 0));
}

// **There is no before/after pair here, and the reason is worth keeping.**
// One was built: a hand-written ANSI string of a message row followed by
// nineteen blanks, captioned as what the boundary drew before F223. It rendered
// nothing — it was a drawing of a belief about old code, assembled from a
// template literal in this file — and it carried the literal brackets that the
// same session had just established were never meant to exist, so it was a
// fabrication that was also wrong about its subject.
//
// **An instrument can manufacture evidence, and this is the shape that makes it
// from nothing.** A real before/after needs the old code actually run, which
// means a checkout; short of that, no image at all is the honest answer. The
// twenty-row frame below is a real render and stands on its own.
await png("status-error-h20", ansiFor(block({ height: 20 }), WIDTH, CAPS["24bit"], 0));

// **The animations are `tools/animation-proof.mjs`'s**, and the split is by
// what moves rather than by subject. A still ladder and a spinner want opposite
// things from a fixture: one is asserted frame by frame against a committed
// picture, the other is worthless unless successive frames *differ*.

console.log(`status proof — ${OUT}`);
