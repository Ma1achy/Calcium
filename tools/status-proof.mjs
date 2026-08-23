/**
 * The `status` box and F227's spinner, as images.
 *
 *     npx tsx tools/status-proof.mjs
 *
 * **A spinner is the one thing a static frame cannot prove**, which is why the
 * GIFs are here rather than a note saying the counter advances. `steps` is the
 * regression proof: the same block that drew one glyph across ten real frames
 * before F227 was fixed, and the whole set after.
 *
 * **Deterministic, so the output can be committed.** Every frame is a pure
 * function of `(block, width, ctx)` with `tick` in `ctx`, so the images are
 * generated without a session and the same input gives the same bytes. A GIF
 * that changed between runs would be the `Math.random()` finding in a new file.
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
import { createBlockRegistry, spinnerFrames, spinnerIntervalMs } from "../src/presentation/blocks/index.js";
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

/**
 * N frames at successive ticks, assembled at the set's own cadence.
 *
 * **The delay is `spinnerIntervalMs`, not a number chosen here**, so the GIF
 * plays at the rate a reader would see — modulo C03's 100 ms window, which
 * floors it in a live session and is recorded in C22 I60a.
 */
async function gif(name, frames, delayMs) {
  const pages = await Promise.all(
    frames.map((ansi) => sharp(Buffer.from(ansiToSvg(ansi)), { density: 144 }).png().toBuffer()),
  );
  const metas = await Promise.all(pages.map((buf) => sharp(buf).metadata()));
  const w = Math.max(...metas.map((m) => m.width ?? 0));
  const h = Math.max(...metas.map((m) => m.height ?? 0));
  const raw = await Promise.all(
    pages.map((buf) =>
      sharp(buf)
        .resize({ width: w, height: h, fit: "contain", position: "left top", background: "#1e1e1e" })
        .raw()
        .toBuffer(),
    ),
  );
  // **A raw buffer carries no page metadata**, so the strip is joined and the
  // page height declared here rather than inferred — `n-pages` is a libvips
  // field only a decoded animated image has, and asking a raw one for it is the
  // error this first produced.
  // **`pageHeight` belongs to the raw *input* options, not to `.gif()`.** Given
  // to the encoder it is accepted and ignored, and the file writes as a single
  // tall frame — a GIF that looks like a GIF and does not move. `metadata()` is
  // what said so, and only when read with `{ animated: true }`: a plain read
  // reports `pages 1` for an animated file too, so the first check agreed with
  // the defect either way. **An instrument answering the same for both cases.**
  await sharp(Buffer.concat(raw), {
    raw: { width: w, height: h * frames.length, channels: 3, pageHeight: h },
  })
    .gif({ delay: frames.map(() => delayMs), loop: 0 })
    .toFile(join(OUT, `${name}.gif`));
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

// --- the animation ----------------------------------------------------------
const setFrames = spinnerFrames(CAPS["24bit"]).length;
const delay = spinnerIntervalMs();

await gif(
  "status-retrying",
  Array.from({ length: setFrames }, (_, tick) =>
    ansiFor(
      block({ state: "retrying", height: 7, message: "connection refused", retryInMs: 8000, attempt: 2 }),
      WIDTH,
      CAPS["24bit"],
      tick,
    ),
  ),
  delay,
);

await gif(
  "status-loading",
  Array.from({ length: setFrames }, (_, tick) =>
    ansiFor(
      block({ state: "loading", height: 7, message: "fetching", elapsedMs: 4000 }),
      WIDTH,
      CAPS["24bit"],
      tick,
    ),
  ),
  delay,
);

// **`steps.gif`, and it is the one that matters.** F227's whole subject is that
// `tick` never advanced, so the *before* GIF is every frame at tick 0 — which is
// exactly what a session drew, measured — and the *after* is the counter moving.
{
  const steps = { kind: "steps", id: "s", steps: [{ label: "building", state: "active" }] };
  await gif(
    "steps-before",
    Array.from({ length: setFrames }, () => ansiFor(steps, 30, CAPS["24bit"], 0)),
    delay,
  );
  await gif(
    "steps-after",
    Array.from({ length: setFrames }, (_, tick) => ansiFor(steps, 30, CAPS["24bit"], tick)),
    delay,
  );
}

console.log(`status proof — ${OUT}`);
