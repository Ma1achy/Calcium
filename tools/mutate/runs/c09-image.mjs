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
const SEAM = "src/shell/transmit-image.ts";
const KITTY = "src/presentation/image/kitty.ts";
const OVERLAY = "src/presentation/image/overlay.ts";

// **`contract/blocks.test.ts` is here because T2.1b lives in it.** The first run
// of this pass named that row as the expected killer and did not include the file
// holding it — so the clamp mutation survived against a suite that could not have
// caught it, which is a fact about the harness and not about the code.
const FILES =
  "test/unit/image-dither.test.ts test/unit/image-kitty.test.ts test/unit/image-placeholder.test.ts test/unit/image-seam.test.ts " +
  "test/unit/image-overlay.test.ts test/unit/image-compositions.test.ts " +
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
    {
      // **The seam's dedup removed.** Every frame re-sends the payload, which is
      // correct on the wire — `a=T` replaces at that id — and wrong about cost:
      // a megabyte per frame for a picture that has not changed.
      name: "the transmission is not deduplicated by digest",
      file: SEAM,
      from: "    if (sent.has(key)) continue;",
      to: "    if (false) continue;",
      expect: "IK7",
    },
    {
      // **The protocol guard removed**, so every terminal receives an APC it
      // cannot read — printed as text on anything but kitty.
      name: "the seam transmits at every protocol",
      file: SEAM,
      from: '  if (capabilities.imageProtocol !== "kitty") return "";',
      to: '  if (false) return "";',
      expect: "IK7",
    },
    {
      // **The recursive walk flattened**, so an image inside a mosaic or a panel
      // places without transmitting — which draws nothing, on the one path a
      // reader would blame the image for.
      name: "the walk does not descend into containers",
      file: SEAM,
      from: "  if (kids !== undefined) for (const child of kids) imagesIn(child, out);",
      to: "  void kids;",
      expect: "IK8",
    },
    {
      // **The picture's identity collapsed back onto the image's** (F251). Two
      // blocks of one image with different overlays transmit once and both draw
      // the first — the wrong picture, with every count agreeing.
      name: "the transmission is keyed by the data rather than by the picture",
      file: KITTY,
      from: "  return block.overlay === undefined",
      to: "  return true\n    ? block.digest\n    : block.overlay === undefined",
      expect: "IO5",
    },
    {
      // **The chunking removed.** One escape carrying the whole payload is
      // correct for the 8x8 fixture and illegal for every real image (F252),
      // which is why the row asserts the *bound* rather than the mechanism.
      name: "a transmission is emitted as one escape",
      file: KITTY,
      from: "  for (let i = 0; i < body.length; i += room) parts.push(body.slice(i, i + room)); // cells-ok — a byte index",
      to: "  parts.push(body);",
      expect: "IO6",
    },
    {
      // **The overlay painted at kitty too.** The cell's rendering is the
      // terminal's, so this draws a colour nothing will show — and the frame
      // still measures and renders the same height.
      name: "the overlay is placed at kitty as well as at the dither",
      file: IMAGE,
      from: "    if (placed !== null && \"rows\" in placed) {",
      to: "    if (false && placed !== null && \"rows\" in placed) {",
      expect: "IO4",
    },
    {
      // **The resample point-sampled instead of averaged.** A gradient becomes
      // a staircase and a single hot cell can vanish between two samples — the
      // defect ID4 already paid for once, in the other resampler.
      name: "the field is point-sampled rather than averaged",
      file: OVERLAY,
      from: "  return n === 0 ? 0 : sum / n;",
      to: "  return values[Math.floor(y0)]?.[Math.floor(x0)] ?? 0;",
      expect: "IO2",
    },
    {
      // **The declared scale ignored.** Every panel normalises to its own
      // extent again, which is exactly the residual that lies (F253).
      name: "a declared scale falls back to the derived one",
      file: "src/data/viewmodel/overlay.ts",
      from: "  if (overlay.min !== undefined && overlay.max !== undefined) {",
      to: "  if (false) {",
      // C2 catches it too — the residual's hottest cell goes from 13 back to
      // 202 — but the named killer is the one that reads the range directly.
      expect: "IO9",
    },
    {
      // **The 8-bit floor removed by drawing the ramp's top everywhere below
      // it.** A binary mask wearing a continuous field's clothes, which is the
      // substitution I74 refuses.
      name: "the overlay draws a fixed tone below the colour floor",
      file: OVERLAY,
      from: "  return map === undefined ? undefined : continuousColour(map, t, caps);",
      to: '  return map === undefined ? undefined : (continuousColour(map, t, caps) ?? { kind: "ansi", index: 1 });',
      expect: "IO3",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
