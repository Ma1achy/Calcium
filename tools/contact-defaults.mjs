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
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { FORMS, representativeVariant } from "./plot-catalogue.mjs";

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
 * One tile per form, **enumerated from the corpus and never from filenames**
 * (F313).
 *
 * This collected `*-default-24bit.png`, which is a substring test standing in for
 * *is this the form's representative frame* — and it is wrong in both directions.
 * It **drops** every form with no variant called `default`: `horizon` (bands-2,
 * bands-3, bands-5, folded-1x3, signed) and `pie` (whose `default` became
 * `default-40` during this campaign). It **adds** every *variant* whose name ends
 * in `-default`: `violin/bimodal-default`, tiled a second time and labelled
 * `violin-bimodal` as though it were a form.
 *
 * 44 distinct forms, one of them twice, two absent — reported as **45 forms**
 * against a corpus of 46. `catalogue-png.mjs`'s contact sheet carries a comment
 * about this exact filter naming `horizon` as its victim; it was fixed there and
 * not here, which is the same file pair and the same relationship F261 caught.
 */
export function defaultTiles() {
  return Object.keys(FORMS).map((form) => {
    const variant = representativeVariant(form);
    return {
      form,
      variant,
      file: `${form}-${variant}-24bit.png`,
      // **The variant is in the label when it is not `default`**, or a reader
      // takes `horizon` for a form with one arm when the sheet is showing one of
      // five. The old label could not say this: it had thrown the variant away.
      name: variant === "default" ? form : `${form} · ${variant}`,
    };
  });
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
  const tiles = defaultTiles();
  // **Named rather than thrown at by sharp.** An empty directory is the
  // ordinary state after `plot-catalogue.mjs` and before `catalogue-png.mjs`,
  // and *Expected valid width, height and channels* says nothing about that.
  const absent = tiles.filter((t) => !existsSync(join(OUT, t.file)));
  if (absent.length === tiles.length) {
    throw new Error(`no default tiles in ${OUT} — run catalogue-png.mjs first`);
  }
  // **A partial set is named too.** The old filter could not tell *this form has
  // no representative frame* from *this form is not in the corpus*, which is how
  // two forms went missing without a number moving.
  if (absent.length > 0) {
    throw new Error(`${String(absent.length)} forms have no 24-bit frame: ${absent.map((t) => t.file).join(", ")}`);
  }

const metas = await Promise.all(
  tiles.map(async (t) => ({ ...t, m: await sharp(join(OUT, t.file)).metadata() })),
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
