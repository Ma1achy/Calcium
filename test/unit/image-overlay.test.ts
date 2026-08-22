/**
 * IO1–IO8 — the overlay's two renderings (C04 I74, §3h.2 · C09 I36).
 *
 * **The two arms are asserted separately because they are two mechanisms.** At
 * the dither the assertion is about the frame: the glyphs must be the picture's,
 * unchanged, and the colours must be the field's. At `kitty` there is no frame
 * to read — the cell is the terminal's — so the assertion is about the bytes the
 * shell writes, and it is structural for IK's reason: a golden of a kitty image
 * is a base64 blob nobody can check.
 */
import { describe, expect, it } from "vitest";
import { b } from "../../src/shell/builders/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { transmitImage } from "../../src/shell/transmit-image.js";
import { imageKey, imageId, PLACEHOLDER } from "../../src/presentation/image/kitty.js";
import { compositeOverlay, overlayField } from "../../src/presentation/image/overlay.js";
import { decodePng } from "../../src/presentation/image/index.js";
import { overlayFault, overlayRange } from "../../src/data/viewmodel/index.js";
import { validateBlock } from "../../src/data/viewmodel/index.js";
import { COLORMAPS } from "../../src/data/colormaps/index.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import { rgbPng64, rgbPng } from "../support/png.js";
import type { Block, Image } from "../../src/data/viewmodel/index.js";

const ESC = String.fromCharCode(27);
const SGR = new RegExp(ESC + String.raw`\[[0-9;]*m`, "gu");
const KITTY = { ...FULL_CAPS, imageProtocol: "kitty" as const };
const NAMES = new Set(Object.keys(COLORMAPS));
const reg = createBlockRegistry();

/** Diagonal stripes: a picture with structure the dither can show. */
const PIC = rgbPng64(64, 32, (x, y) => {
  const v = ((x + y) % 16) * 16;
  return [v, 255 - v, (x * 4) & 0xff];
});
/** A blob in the upper-left — asymmetric, so a flipped field is a failing field. */
const BLOB = Array.from({ length: 8 }, (_, r) =>
  Array.from({ length: 8 }, (_, c) => Math.exp(-((r - 2) ** 2 + (c - 2) ** 2) / 6)),
);

const lines = (blk: Block, caps = FULL_CAPS, w = 40): readonly string[] =>
  renderToLines(reg, blk, w, { theme: DARK_THEME, capabilities: caps });
const glyphs = (blk: Block, caps = FULL_CAPS, w = 40): readonly string[] =>
  lines(blk, caps, w).map((l) => l.replace(SGR, ""));
/**
 * The foregrounds a frame carries, **in both forms**.
 *
 * `\[38;2;` alone was the first draft and it made IO3 report *nothing drawn* at
 * 8-bit — where `continuousColour` quantises to the 256-cube and emits `38;5;N`.
 * A matcher that sees one encoding cannot tell *the rung is absent* from *the
 * rung is a different escape*, which is the reading IO3 exists to make.
 */
const runs = (blk: Block, caps = FULL_CAPS, w = 40): readonly string[] =>
  lines(blk, caps, w)
    .flatMap((l) => [...l.matchAll(new RegExp(ESC + String.raw`\[38;(?:2;(\d+;\d+;\d+)|5;(\d+))m`, "gu"))])
    .map((m) => m[1] ?? m[2] ?? "");

const plain = b.image({ id: "p", data: PIC, height: 6, alt: "stripes" });
const over = b.image({ id: "o", data: PIC, height: 6, alt: "stripes", overlay: { values: BLOB } });

describe("IO — the overlay, per arm", () => {
  it("IO1 (C04 I74): at the dither the glyph is the picture and the colour is the field", () => {
    // **The whole ruling in one assertion.** If the overlay changed a glyph it
    // would be competing with the picture for the cell's one shape channel, and
    // the reader would have no way to tell which datum a dot belonged to.
    expect(glyphs(over), "the picture is untouched").toEqual(glyphs(plain));
    expect(runs(plain), "and a plain image carries no colour").toHaveLength(0);
    expect(runs(over).length, "an overlaid one does").toBeGreaterThan(8);
  });

  it("IO2 (C04 I74): the field is registered to the picture, not to the row", () => {
    // The blob sits at (2,2) of an 8x8 map over a 6-row block. **Hottest at the
    // top-left and coldest at the bottom-right** is the only reading that makes
    // a mask line up with what it masks — a transposed or flipped resample
    // passes every count and draws the wrong quadrant.
    const field = overlayField({ values: BLOB }, 24, 6);
    const at = (r: number, c: number): number => field[r]?.[c] ?? -1;
    expect(at(1, 6), "the peak").toBeGreaterThan(0.9);
    expect(at(5, 23), "the far corner").toBeLessThan(0.05);
    expect(at(1, 6)).toBeGreaterThan(at(1, 20));
    expect(at(1, 6)).toBeGreaterThan(at(5, 6));
  });

  it("IO3 (C04 I74, C10 I31): below 8-bit the overlay does not draw, and says nothing false", () => {
    // **The floor is inherited rather than invented.** A continuous map below
    // 8-bit is an ordering over sixteen indices whose luminances nobody reports,
    // so `continuousColour` gives nothing — and here there is no rung under it,
    // because the cell's other axis is spent on the picture. A threshold-to-tone
    // fallback would put a binary mask on screen wearing a continuous field's
    // clothes, which is the substitution this repository refuses everywhere.
    for (const depth of [1, 4] as const) {
      const caps = { ...FULL_CAPS, colourDepth: depth };
      expect(runs(over, caps), `at ${String(depth)}-bit`).toHaveLength(0);
      expect(glyphs(over, caps), "and the picture survives").toEqual(glyphs(plain, caps));
    }
    expect(runs(over, { ...FULL_CAPS, colourDepth: 8 }).length, "at 8-bit it draws").toBeGreaterThan(0);
  });

  it("IO4 (C04 §3h.2): at kitty the frame carries no overlay — the cell is not ours to draw", () => {
    const drawn = lines(over, KITTY).join("");
    expect(drawn.includes(PLACEHOLDER), "placeholders, as before").toBe(true);
    // Exactly one colour per row, and it is the **id**: `placeholderCell` spends
    // the foreground on it, which is why nothing else can be painted here.
    const seen = new Set(runs(over, KITTY));
    expect(seen.size, "one foreground, and it is the id").toBe(1);
    const id = imageId(imageKey(over));
    expect([...seen][0]).toBe(`${String((id >> 16) & 0xff)};${String((id >> 8) & 0xff)};${String(id & 0xff)}`);
  });

  it("IO5 (C04 I74): the picture's identity is not the image's, or two overlays draw as one", () => {
    // **A measured defect rather than an inefficiency.** Keyed on `digest`, two
    // blocks of one image with different overlays transmit once and both draw
    // the first — the wrong picture rather than none, which is the failure this
    // arm exists to avoid.
    const flipped = b.image({
      id: "f",
      data: PIC,
      height: 6,
      alt: "stripes",
      overlay: { values: BLOB.map((r) => [...r].reverse()) },
    });
    expect(over.digest, "the data is the same").toBe(flipped.digest);
    expect(imageKey(over), "the picture is not").not.toBe(imageKey(flipped));
    expect(imageKey(plain), "and an image with no overlay is keyed by its data").toBe(plain.digest);

    const sent = new Set<string>();
    const bytes = transmitImage([over, flipped], KITTY, sent);
    expect([...bytes.matchAll(new RegExp(`${ESC}_G[^;]*a=T`, "gu"))], "two pictures, two transmissions").toHaveLength(2);
    expect(sent.size).toBe(2);
    expect(transmitImage([over, flipped], KITTY, sent), "and a redraw owes nothing").toBe("");
  });

  it("IO6 (C04 §3h.2): the composited arm sends raw pixels, chunked, with the overlay in them", () => {
    const bytes = transmitImage([over], KITTY, new Set<string>());
    expect(bytes, "raw RGBA rather than a re-encoded PNG").toContain("f=32");
    expect(bytes, "with the source dimensions, which f=32 requires").toContain("s=64,v=32");
    expect(bytes, "deflated through the codec's own zlib").toContain("o=z");
    // **Chunked**: an escape past 4096 bytes is refused by the protocol, and the
    // continuation carries `m` alone. `m=0` closes it.
    expect(bytes).toContain("m=1;");
    expect(bytes.trimEnd().includes("m=0;"), "and a final chunk closes the payload").toBe(true);
    const escapes = [...bytes.matchAll(new RegExp(`${ESC}_G`, "gu"))].length;
    expect(escapes, "a 64x32 RGBA payload does not fit in one").toBeGreaterThan(1);
    for (const esc of bytes.split(`${ESC}_G`).slice(1)) {
      expect(esc.length + 2, "no escape exceeds the limit").toBeLessThanOrEqual(4096);
    }
    // An image with no overlay still goes as PNG, which is the cheaper path.
    expect(transmitImage([plain], KITTY, new Set<string>()), "unchanged where there is nothing to blend").toContain("f=100");
  });

  it("IO7 (C04 §3h.2): the composite blends toward the map and leaves the buffer alone", () => {
    const src = decodePng(rgbPng(8, 8, () => [0, 0, 0]));
    expect(src.ok).toBe(true);
    if (!src.ok) return;
    const before = Uint8Array.from(src.pixels.data);
    // **Declared, because a single value is a *constant* field** and reads at
    // the bottom of the ramp by IO9's ruling — which is right, and is not the
    // thing this row is asking about.
    const scale = { colormap: "inferno", min: 0, max: 1 } as const;
    const hot = compositeOverlay(src.pixels, { values: [[1]], ...scale, alpha: 1 });
    expect(src.pixels.data, "the decode is memoised and shared — never mutated").toEqual(before);
    // At alpha 1 over black the result *is* the colormap's top, which is the one
    // reading that pins the blend rather than merely observing it changed.
    const top = COLORMAPS["inferno"]?.data.at(-1) ?? [0, 0, 0];
    expect([hot.data[0], hot.data[1], hot.data[2]]).toEqual([top[0], top[1], top[2]]);
    const half = compositeOverlay(src.pixels, { values: [[1]], ...scale, alpha: 0.5 });
    expect(half.data[0]).toBe(Math.round((top[0] ?? 0) / 2));
  });

  it("IO8 (C04 I74): one refusal, thrown by the builder and pushed by the validator", () => {
    const bad: readonly [string, unknown][] = [
      ["ragged", { values: [[1, 2], [3]] }],
      ["empty", { values: [] }],
      ["not a number", { values: [["x"]] }],
      ["unknown map", { values: [[1]], colormap: "not-a-map" }],
      ["half a scale", { values: [[1]], min: 0 }],
      ["inverted", { values: [[1]], min: 5, max: 5 }],
      ["alpha past one", { values: [[1]], alpha: 2 }],
    ];
    for (const [why, overlay] of bad) {
      expect(overlayFault(overlay, NAMES), why).not.toBeNull();
      expect(
        () => b.image({ data: PIC, height: 2, alt: "x", overlay: overlay as never }),
        `b.image refuses ${why}`,
      ).toThrow(/b\.image:/u);
      const doc = { ...JSON.parse(JSON.stringify(plain)), overlay } as unknown;
      const v = validateBlock(doc);
      expect(v.ok, `validateDocument refuses ${why}`).toBe(false);
    }
    // The control: a legal one passes both, so the rows above are about the
    // faults rather than about the overlay field existing at all.
    expect(overlayFault({ values: BLOB }, NAMES)).toBeNull();
    expect(validateBlock(JSON.parse(JSON.stringify(over)) as unknown).ok).toBe(true);
  });

  it("IO9 (C04 I74): a declared scale is what a set of panels shares", () => {
    // **Both or neither**, because one alone is half a scale: a declared floor
    // with a derived ceiling still moves between panels.
    expect(overlayRange({ values: [[0], [10]] })).toEqual({ min: 0, max: 10 });
    expect(overlayRange({ values: [[0], [10]], min: -5, max: 100 })).toEqual({ min: -5, max: 100 });
    // A constant field has no extent, and reading it as *all maximum* would wash
    // the picture in the hottest colour while saying nothing.
    expect(overlayRange({ values: [[4], [4]] })).toEqual({ min: 4, max: 5 });
    const flat = b.image({ data: PIC, height: 3, alt: "x", overlay: { values: [[4, 4], [4, 4]] } }) as Image;
    expect(new Set(runs(flat)).size, "and it draws one colour rather than the ramp's top").toBe(1);
  });
});
