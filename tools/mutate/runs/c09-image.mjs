// C04 I73 · C09 I36 — the image block, its geometry and its dither.
//
// **The mutations attack what a row count cannot see.** The dither's whole claim
// is that it is *readable*, and a banded gradient, an inverted ramp and a
// correctly-shaped one all measure the same height and draw the same number of
// glyphs. Four of these six leave `measure` equal to `render` and change only the
// picture.
//
// **The clamp is the one the mosaic taught.** An image that over-draws its width
// addresses part of a picture the terminal is not drawing there, so the geometry
// is the guarantee and there is no clip behind it.
//
// Anchors checked for uniqueness before the pass (F219), atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DITHER = "src/presentation/image/dither.ts";
const IMAGE = "src/presentation/blocks/kinds/image.ts";
const CODEC = "src/presentation/image/codec.ts";

// **`contract/blocks.test.ts` is here because T2.1b lives in it.** The first run
// of this pass named that row as the expected killer and did not include the file
// holding it — so the clamp mutation survived against a suite that could not have
// caught it, which is a fact about the harness and not about the code.
const FILES =
  "test/unit/image-dither.test.ts test/unit/image-kitty.test.ts test/unit/image-placeholder.test.ts " +
  "test/contract/blocks.test.ts test/golden/blocks.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: DITHER,
    from: 'export const DITHER_ASCII = " .:-=+*#@";',
    to: 'export const DITHER_ASCII = "@#*+=-:. ";',
    why: "the ramp inverted — every ascii frame in the corpus becomes its own negative",
  },
  mutations: [
    {
      // **The matrix flattened.** Every threshold becomes the same, so a
      // gradient bands into stripes instead of resolving into texture — and
      // every count is unchanged.
      name: "the threshold does not vary with position",
      file: DITHER,
      from: "  const row = BAYER8[((y % n) + n) % n] ?? BAYER8[0] ?? [];",
      to: "  const row = BAYER8[0] ?? [];",
      expect: "ID5",
    },
    {
      // **8x8 back to 4x4**, which is the frame's own ruling reversed: the
      // period would again equal a braille cell's height.
      name: "the matrix is 4x4 again",
      file: DITHER,
      from: "const BAYER8 = grow(grow(BAYER2));",
      to: "const BAYER8 = grow(BAYER2);",
      expect: "ID4",
    },
    {
      // **Point-sampled rather than averaged**, which is where a dither at a
      // fraction of the source resolution turns a photograph into aliasing.
      name: "a sample reads one pixel rather than its rectangle",
      file: DITHER,
      from: "  return n === 0 ? 0 : sum / n;",
      to: "  return luminance(px, lo, top);",
      expect: "ID6",
    },
    {
      // **The width clamp removed** (C04 I73 §3g.3). `measure` and `render`
      // still agree with each other and the frame runs past its region.
      name: "an image is not scaled to its region",
      file: IMAGE,
      from: "  if (natural <= w) return { cols: natural, rows: declared };",
      to: "  return { cols: natural, rows: declared };",
      expect: "T2.1b",
    },
    {
      // **The unfilter's Paeth arm**, which is the one a decoder gets wrong
      // quietly: rows 0 and 1 of a gradient still decode, and everything after
      // drifts.
      name: "Paeth predicts from the left neighbour alone",
      file: CODEC,
      from: "      const near = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;",
      to: "      const near = a;",
      expect: "ID2",
    },
    {
      // **Ancillary chunks assumed absent** (F248). `sharp` writes `pHYs`
      // before `IDAT`, so a decoder that stops at the first non-IHDR chunk
      // finds no pixels at all.
      name: "the chunk walk stops at the first unknown chunk",
      file: CODEC,
      from: '    else if (type === "IEND") break;',
      to: '    else break;',
      expect: "ID1",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
