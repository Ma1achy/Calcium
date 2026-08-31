/**
 * HB1–HB8 — the half-block rung and the decode refusal (C09 I37, I38 · §4c, §8b).
 *
 * **These read the frame in colour, and the reason is the rule itself.** The
 * half block's whole claim is that the *colour* carries the picture: strip the
 * SGR and every row is `▀▀▀▀▀`, identical for a photograph and for black. Every
 * other image test in this directory strips SGR before asserting, which is
 * correct for an arm whose glyph is the datum and would report this one as a
 * wall of one character.
 *
 * The rows are C09 §8b's table, one apiece where the table has a cell.
 *
 * **Stated blind spot: the golden corpus is weaker for this arm than for the
 * one below it.** `ONE_PER_KIND.image` is *an eight by eight red square* — flat
 * — and the Bayer threshold varies with position, so braille turned that flat
 * field into `⠕⠅⠕⠅⠕⠅` and the golden row encoded the **matrix**. A flat field in
 * half blocks is one colour repeated, so the golden row records one colour pair
 * and would not move under a transposed sample, a swapped top and bottom, or a
 * dropped column. **HB2 is what covers that** — red over blue, where the two
 * halves disagree — and the corpus fixture is deliberately not changed for it:
 * it is shared by every kind's row, and buying coverage here by perturbing it
 * would move frames that have nothing to do with this arm.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { imageCells } from "../../src/presentation/blocks/kinds/image.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { HALF_BLOCK, halfBlockEligible, halfBlockRows } from "../../src/presentation/image/index.js";
import { MAX_PLACEHOLDER_SPAN, PLACEHOLDER } from "../../src/presentation/image/kitty.js";
import { decodePng } from "../../src/presentation/image/index.js";
import { rgbPng64 } from "../support/png.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import { b } from "../../src/shell/builders/index.js";
import type { Image } from "../../src/data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const ESC = String.fromCharCode(27);
const SGR = new RegExp(ESC + String.raw`\[[0-9;]*m`, "gu");

/** Rows **with** their escapes — see the header. */
const draw = (
  block: Image,
  caps: TerminalCapabilities = FULL_CAPS,
  w = 20,
): readonly string[] =>
  renderToLines(createBlockRegistry(), block, w, { theme: DARK_THEME, capabilities: caps });

const stripped = (rows: readonly string[]): readonly string[] => rows.map((l) => l.replace(SGR, ""));

/** Half red over half blue — so a top/bottom mix-up is a different frame. */
const SPLIT = (h: number): string =>
  rgbPng64(8, h, (_x, y) => (y < h / 2 ? [255, 0, 0] : [0, 0, 255]));

const image = (data: string, height: number, extra: Partial<Image> = {}): Image =>
  ({ ...b.image({ id: "img", data, height, alt: "a caption" }), ...extra }) as Image;

/**
 * A block **not** built by `b`, which is the only way to reach half of C09 I38.
 *
 * `b.image` refuses a bad signature at construction — *a format this cannot draw
 * rather than an image that is broken* — so `not a PNG` is unreachable through
 * the builder and perfectly reachable through an adapter's document, which is
 * where images arrive from over a transport (C04 I73).
 */
const raw = (data: string, height: number): Image =>
  // **A real hash, and the first version was a prefix.** `d-${data.slice(0, 12)}`
  // is identical for every PNG — the signature and the IHDR length are the first
  // nine bytes of all of them — so the decode memo, which keys on the digest,
  // returned the 16-bit refusal for the interlaced block. A collision is a
  // dropped input, and the frame said `bit depth 16` for a file that is not.
  ({
    kind: "image",
    id: "img",
    data,
    height,
    alt: "a caption",
    digest: createHash("sha256").update(data).digest("hex").slice(0, 16),
  }) as Image;

describe("C09 §8b · the glyph axis", () => {
  it("HB1 (C09 I37): the top rung draws two colours a cell, and both channels are set", () => {
    const rows = draw(image(SPLIT(8), 4));
    // The glyph is the same in every cell, which is the point: the picture is
    // not in the glyph.
    expect(stripped(rows).every((l) => [...l.trim()].every((c) => c === HALF_BLOCK))).toBe(true);
    expect(stripped(rows)[0]?.trim().length).toBeGreaterThan(0);
    // 38 is the foreground and 48 the background — a rung that set only one
    // would draw the top pixel and let the terminal's background be the bottom,
    // which is a picture at half the vertical resolution that still looks like
    // a picture.
    expect(rows[0]).toContain("38;2;");
    expect(rows[0]).toContain("48;2;");
  });

  it("HB2 (C09 I37): the colours are the picture, top over bottom and not the reverse", () => {
    // Eight pixel rows into four cell rows: cell row 0 covers pixel rows 0-1,
    // both red; cell row 3 covers 6-7, both blue.
    const rows = draw(image(SPLIT(8), 4));
    expect(rows[0]).toContain("38;2;255;0;0");
    expect(rows[0]).toContain("48;2;255;0;0");
    expect(rows[3]).toContain("38;2;0;0;255");
    expect(rows[3]).toContain("48;2;0;0;255");
    // Row 1 is the seam: pixel rows 2-3, still red; row 2 is 4-5, blue. The
    // boundary lands between cells here, which is what makes the two extremes
    // above unambiguous.
    expect(rows[1]).toContain("38;2;255;0;0");
    expect(rows[2]).toContain("38;2;0;0;255");
  });

  it("HB3 (C09 I37): each of the three gates demotes on its own, and only its own", () => {
    // **The set, not its first member.** A gate collapsed onto another — say
    // `colourDepth >= 8` written as `unicode !== "ascii"` — passes any row that
    // varies one field, because the eligible case and one demotion agree.
    const eligible = { caps: FULL_CAPS, overlay: false };
    expect(halfBlockEligible(eligible.caps, eligible.overlay)).toBe(true);

    const demotions: readonly (readonly [string, boolean])[] = [
      ["ambiguousWidth: wide", halfBlockEligible({ ...FULL_CAPS, ambiguousWidth: "wide" }, false)],
      ["colourDepth: 4", halfBlockEligible({ ...FULL_CAPS, colourDepth: 4 }, false)],
      ["colourDepth: 1", halfBlockEligible({ ...FULL_CAPS, colourDepth: 1 }, false)],
      ["unicode: ascii", halfBlockEligible({ ...FULL_CAPS, unicode: "ascii" }, false)],
      ["an overlay", halfBlockEligible(FULL_CAPS, true)],
    ];
    expect(demotions.filter(([, v]) => v).map(([n]) => n)).toEqual([]);
    // And 8 is the floor rather than a synonym for 24 (§8b, the colour gate).
    expect(halfBlockEligible({ ...FULL_CAPS, colourDepth: 8 }, false)).toBe(true);
  });

  it("HB4 (C09 I37): the overlay gate is the block's decision, and the frame takes braille", () => {
    // §8b G5. The terminal honours every rung and the *block* cannot use the
    // top one, because both colour channels are already the picture.
    const plain = draw(image(SPLIT(8), 4));
    const withField = draw(
      image(SPLIT(8), 4, {
        overlay: { values: [[0, 1], [1, 0]], colormap: "viridis" },
      } as Partial<Image>),
    );
    // **The fixture responds to the thing under test before it is asserted
    // against** (`test/support/README.md`). An invalid overlay makes the renderer
    // throw and the containment box draws ` ERROR ` — which contains no braille
    // and no `▀`, so both assertions below would have passed on a broken fixture.
    expect(stripped(withField).join(" "), "the overlay must render, not throw").not.toMatch(/ERROR/u);
    expect(stripped(plain)[0]).toContain(HALF_BLOCK);
    expect(stripped(withField)[0]).not.toContain(HALF_BLOCK);
    // Braille, which still has a free foreground for the field.
    expect(stripped(withField).join("")).toMatch(/[⠀-⣿]/u);
  });

  it("HB5 (C09 I37, F409): a refused placement re-enters the ladder at the top, not the bottom", () => {
    // §8b G3, and the row that had no frame to show it. A kitty terminal is
    // non-ascii and at least 8-bit **by construction**, so this branch is
    // reached only by a terminal qualifying for every rung — and it fell to
    // `ditherBraille`, two rungs down.
    // **Sized against `imageCells` rather than against the constant.** The first
    // draft took `MAX_PLACEHOLDER_SPAN + 40` as a *pixel* width, and the derived
    // column count came out at 253 — under the span, placement accepted, and the
    // row asserted nothing. A 1000x8 image three rows tall derives 750.
    const kitty: TerminalCapabilities = { ...FULL_CAPS, imageProtocol: "kitty" };
    const blk = image(rgbPng64(1000, 8, () => [200, 40, 40]), 3);
    const rows = draw(blk, kitty, 800);
    expect(imageCells(blk, 800).cols).toBeGreaterThan(MAX_PLACEHOLDER_SPAN);
    // The placement really is refused — and the control is `PLACEHOLDER` itself,
    // not a code point guessed from memory. The first version looked for
    // U+10FFFD; the placeholder is U+10EEEE, so the assertion held over a frame
    // made entirely of placeholders.
    expect(stripped(rows).join("")).not.toContain(PLACEHOLDER);
    expect(stripped(rows)[0]).toContain(HALF_BLOCK);
    expect(stripped(rows).join("")).not.toMatch(/[⠀-⣿]/u);
  });

  it("HB6 (C09 I37): a one-pixel-tall image samples row 0 twice rather than off the end", () => {
    // §8b G9. `y * 2 + 1` is past the last row of a one-pixel image, and the
    // naive read of `data[i] ?? 0` turns that into black — a picture with a
    // dark band that looks like a picture.
    const px = decodePng(Uint8Array.from(Buffer.from(rgbPng64(4, 1, () => [255, 255, 255]), "base64")));
    expect(px.ok).toBe(true);
    if (!px.ok) return;
    const cells = halfBlockRows(px.pixels, 4, 1, 24);
    expect(cells).toHaveLength(1);
    for (const cell of cells[0] ?? []) {
      expect(cell.top).toEqual({ kind: "rgb", hex: "#ffffff" });
      expect(cell.bottom).toEqual({ kind: "rgb", hex: "#ffffff" });
    }
  });

  it("HB7 (C09 I37): 8-bit is the 24-bit picture quantised, not a second rendering", () => {
    const px = decodePng(Uint8Array.from(Buffer.from(SPLIT(8), "base64")));
    expect(px.ok).toBe(true);
    if (!px.ok) return;
    const deep = halfBlockRows(px.pixels, 8, 4, 24);
    const eight = halfBlockRows(px.pixels, 8, 4, 8);
    // Same geometry, both channels, every cell — only the tag differs.
    expect(eight).toHaveLength(deep.length);
    expect(eight[0]).toHaveLength((deep[0] ?? []).length);
    expect(new Set(eight.flat().map((c) => c.top.kind))).toEqual(new Set(["ansi256"]));
    expect(new Set(deep.flat().map((c) => c.top.kind))).toEqual(new Set(["rgb"]));
  });
});

describe("C09 I38 · a refusal draws the refusal", () => {
  /** A PNG header with the fields the decoder refuses on, and real IDAT bytes. */
  const mutated = (field: "interlace" | "depth"): string => {
    const bytes = Buffer.from(rgbPng64(4, 4, () => [10, 20, 30]), "base64");
    // IHDR body starts at byte 16; depth is +8, interlace is +12 from there.
    bytes[field === "depth" ? 24 : 28] = field === "depth" ? 16 : 1;
    return bytes.toString("base64");
  };

  it("HB8 (C09 I38, F410): each refusal reaches the frame as its own sentence", () => {
    const cases: readonly (readonly [string, string, RegExp])[] = [
      ["not a PNG", Buffer.from("plainly not a png at all").toString("base64"), /eight-byte signature/u],
      ["16-bit", mutated("depth"), /bit depth 16/u],
      ["interlaced", mutated("interlace"), /Adam7|interlaced/u],
    ];
    for (const [name, data, expected] of cases) {
      const rows = stripped(draw(raw(data, 4), FULL_CAPS, 60));
      expect(rows.join(" "), `${name} must say which refusal`).toMatch(expected);
      // **The box, not a bare line.** At four rows the box takes three and C09's
      // ladder gives it a border and no tag — so the border is what says this is
      // the framework's `status` here, and the rung below asserts the tag.
      expect(rows[0], `${name} must draw the box's border`).toMatch(/^┌─+┐$/u);
      expect(rows.join(" "), `${name} carries the warning mark`).toContain("▲");
    }
  });

  it("HB8b (C09 I38): it is a `status` on C09's ladder, so height buys the tag", () => {
    // The row that makes HB8's border assertion mean something: if the box were
    // a bespoke frame drawn by the image kind, height would change nothing. Six
    // rows for the box is `FULL_FIGURE_ROWS`, which is where ` ERROR ` arrives.
    const bad = Buffer.from("not a png").toString("base64");
    const short = stripped(draw(raw(bad, 4), FULL_CAPS, 60));
    const tall = stripped(draw(raw(bad, 7), FULL_CAPS, 60));
    expect(short.join(" ")).not.toMatch(/ERROR/u);
    expect(tall.join(" ")).toMatch(/ERROR/u);
    expect(tall).toHaveLength(7);
  });

  it("HB9 (C09 I38): the `alt` is the caption beneath the box, and yields the row at height 1", () => {
    const bad = Buffer.from("not a png").toString("base64");
    const tall = stripped(draw(raw(bad, 4), FULL_CAPS, 60));
    expect(tall.join(" ")).toContain("a caption");
    expect(tall).toHaveLength(4);

    // At one row there is nothing to caption with: the refusal is the thing a
    // reader cannot recover any other way, and `alt` is in the document.
    const flat = stripped(draw(raw(bad, 1), FULL_CAPS, 60));
    expect(flat).toHaveLength(1);
    expect(flat.join(" ")).not.toContain("a caption");
  });
});
