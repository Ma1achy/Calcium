/**
 * A **defaults-only** contact sheet — every form once, tiled and labelled.
 *
 * `catalogue-png.mjs` already builds a sheet and it is 5520×18682: every
 * *variant* of every form at 24-bit, which is the right instrument for reading a
 * form's arms and the wrong one for scanning the system. **A sheet you cannot
 * take in at once is a directory listing with extra steps.**
 *
 * So this is one tile per form, at its `default` variant, in a grid — and the
 * two sheets answer different questions rather than one being a smaller copy.
 *
 * Run after `catalogue-png.mjs`: npx tsx tools/contact-defaults.mjs
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const OUT = join(import.meta.dirname, "..", "docs", "catalogue");

export const COLS = 5;
const PAD = 14;
const LABEL = 22;

/**
 * Where tile `i` sits, and where its caption's baseline goes.
 *
 * **Exported so the geometry has a fixture** — the sheet itself is 2 MB of
 * pixels and asserting against it would be asserting a picture, which is what
 * `make instruments` exists to stop a generator getting away with. What can be
 * wrong here is arithmetic: a caption colliding with the row below it, a tile
 * past the sheet's edge, a wrap at the wrong column.
 */
export function tileAt(i, cellW, cellH) {
  const left = PAD + (i % COLS) * (cellW + PAD);
  const top = PAD + Math.floor(i / COLS) * (cellH + LABEL + PAD);
  return { left, top, labelY: top + cellH + 15 };
}

/** The sheet's extent for `count` tiles of that size. */
export function sheetSize(count, cellW, cellH) {
  const rows = Math.ceil(count / COLS);
  return { width: COLS * (cellW + PAD) + PAD, height: rows * (cellH + LABEL + PAD) + PAD, rows };
}

/**
 * **Behind an `isMain` guard, and it was not** (F261).
 *
 * The whole sheet build sat at module top level with a top-level `await`, so
 * `import { tileAt } from "./contact-defaults.mjs"` **rendered two megabytes of
 * PNG as a side effect**. Its own fixture did that, and passed — because
 * `docs/catalogue` happened to hold 956 tiles at the time. Running
 * `plot-catalogue.mjs` clears every `.png` in that directory, so the next full
 * suite found none, `Math.max(...[])` returned `-Infinity`, and sharp refused
 * the width. **A test that passes because of the state of a generated
 * directory** — and the tool that generates it sweeps.
 *
 * `catalogue-hash.mjs` got its guard in the same commit and this one did not,
 * which is the shape: the fix was applied where the flaw was noticed rather
 * than to the pair.
 */
async function buildSheet() {
  const tiles = readdirSync(OUT).filter((f) => f.endsWith("-default-24bit.png")).sort();
  // **Named rather than thrown at by sharp.** An empty directory is the
  // ordinary state after `plot-catalogue.mjs` and before `catalogue-png.mjs`,
  // and *Expected valid width, height and channels* says nothing about that.
  if (tiles.length === 0) {
    throw new Error(`no default tiles in ${OUT} — run catalogue-png.mjs first`);
  }

const metas = await Promise.all(
  tiles.map(async (f) => ({ file: f, name: f.replace(/^cat-|-default-24bit\.png$/gu, ""), m: await sharp(join(OUT, f)).metadata() })),
);
const cellW = Math.max(...metas.map((t) => t.m.width ?? 1));
const cellH = Math.max(...metas.map((t) => t.m.height ?? 1));
const { width: W, height: H } = sheetSize(metas.length, cellW, cellH);

const labels = metas
  .map((t, i) => {
    const { left: x, labelY: y } = tileAt(i, cellW, cellH);
    return `<text x="${x}" y="${y}" font-family="monospace" font-size="13" fill="#9aa0b4">${t.name}</text>`;
  })
  .join("");

await sharp({ create: { width: W, height: H, channels: 3, background: "#0b0b0f" } })
  .composite([
    ...metas.map((t, i) => {
      const { left, top } = tileAt(i, cellW, cellH);
      return { input: join(OUT, t.file), left, top };
    }),
    { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${labels}</svg>`), left: 0, top: 0 },
  ])
  .png()
  .toFile(join(OUT, "_contact-sheet-defaults.png"));

console.log(`defaults sheet: ${metas.length} forms, ${W}x${H}`);
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) await buildSheet();
