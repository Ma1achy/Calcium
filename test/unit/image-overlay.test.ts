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
import { samplesScale, type Sample } from "../../src/shell/builders/samples.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { transmitImage } from "../../src/shell/transmit-image.js";
import { imageKey, imageId, PLACEHOLDER } from "../../src/presentation/image/kitty.js";
import { compositeOverlay, overlayColour, overlayField } from "../../src/presentation/image/overlay.js";
import { decodePng } from "../../src/presentation/image/index.js";
import { overlayFault, overlayRange, sharedRange } from "../../src/data/viewmodel/index.js";
import { validateBlock } from "../../src/data/viewmodel/index.js";
import { COLORMAPS } from "../../src/data/colormaps/index.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import { rgbPng64, rgbPng } from "../support/png.js";
import type { Block } from "../../src/data/viewmodel/index.js";

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
    const scale = { colormap: "inferno", yMin: 0, yMax: 1 } as const;
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
      ["a non-finite pin", { values: [[1]], yMin: Number.NaN }],
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

  it("IO9 (C04 I29, I74): the scale is the plot family's pin, resolved by the family's function", () => {
    expect(overlayRange({ values: [[0], [10]] })).toEqual({ min: 0, max: 10 });
    expect(overlayRange({ values: [[0], [10]], yMin: -5, yMax: 100 })).toEqual({ min: -5, max: 100 });
    // **Independently optional** — the family's rule, and the one this section's
    // first draft forbade. `yMin: 0` alone says *zero means zero* rather than
    // *the least value observed means zero*, exactly as a loss curve pins a floor.
    expect(overlayRange({ values: [[2], [10]], yMin: 0 })).toEqual({ min: 0, max: 10 });
    expect(overlayRange({ values: [[2], [10]], yMax: 20 })).toEqual({ min: 2, max: 20 });
    // **A pinned bound replaces rather than widens**, which is the only reason
    // to pin: a value outside it clamps at the reader and never grows the range.
    expect(overlayRange({ values: [[-50], [500]], yMin: 0, yMax: 10 })).toEqual({ min: 0, max: 10 });
    // A reversed pin collapses rather than throwing (C12 I2).
    expect(overlayRange({ values: [[1], [9]], yMin: 8, yMax: 2 })).toEqual({ min: 8, max: 8 });
    // **A constant field is `{v, v}` and draws mid-ramp**, which is what
    // `heatmap.ts` does with a zero span. The first draft returned `{v, v + 1}`
    // — the ramp's *bottom* — and said *all minimum* about a field that never
    // varied.
    expect(overlayRange({ values: [[4], [4]] })).toEqual({ min: 4, max: 4 });
    const flat = b.image({ data: PIC, height: 3, alt: "x", overlay: { values: [[4, 4], [4, 4]] } });
    const seen = [...new Set(runs(flat))];
    expect(seen, "one colour").toHaveLength(1);
    // **Asserted against `continuousColour` at three points rather than against
    // the table.** Indexing `data[128]` re-derives the sampler and gets a
    // different answer — it interpolates between adjacent entries — so the row
    // would be testing my arithmetic instead of the ruling. Pinning *which* `t`
    // is the claim; how a `t` becomes a colour is C10's.
    const at = (t: number): string => {
      const c = overlayColour({ values: [[4]], colormap: "inferno" }, t, FULL_CAPS);
      return c !== undefined && c.kind === "rgb"
        ? [1, 3, 5].map((i) => Number.parseInt(c.hex.slice(i, i + 2), 16)).join(";")
        : "";
    };
    expect(seen[0], "the middle of the ramp").toBe(at(0.5));
    expect(seen[0], "not the bottom, which is what the first draft drew").not.toBe(at(0));
    expect(seen[0], "and not the top").not.toBe(at(1));
  });

  it("IO10 (C04 I74, F253): `sharedRange` is what a SET is read on, and the residual stops lying", () => {
    // **The field makes a shared scale expressible; this makes it correct.** A
    // consumer composing three `b.image` blocks by hand can write the pin on
    // each — computing it is the part nobody should do three times, and the part
    // where a fourth panel arrives and one call site is missed.
    const before = [[100, 140], [120, 150]];
    const after = [[104, 138], [126, 149]];
    const residual = before.map((r, i) => r.map((v, j) => Math.abs(v - (after[i]?.[j] ?? 0))));
    const pin = sharedRange([before, after, residual]);
    expect(pin, "the union of all three").toEqual({ min: 1, max: 150 });

    const hottest = (values: number[][], shared: boolean): number => {
      const blk = b.image({
        data: PIC,
        height: 3,
        alt: "x",
        overlay: shared ? { values, yMin: pin.min, yMax: pin.max } : { values },
      });
      return Math.max(
        0,
        ...runs(blk).map((c) => {
          const p = c.split(";").map(Number);
          return 0.2126 * (p[0] ?? 0) + 0.7152 * (p[1] ?? 0) + 0.0722 * (p[2] ?? 0);
        }),
      );
    };
    // **Own extent: the residual burns as bright as the panel it came from.**
    expect(hottest(residual, false)).toBeGreaterThan(hottest(before, false) * 0.9);
    // Shared: it sits where a difference of 6 against a range of 149 belongs.
    expect(hottest(residual, true)).toBeLessThan(hottest(before, true) * 0.5);
    // The control — the *pictures* are identical either way, so the rows above
    // are about the scale and not about the blocks differing.
    expect(glyphs(b.image({ data: PIC, height: 3, alt: "x", overlay: { values: residual } }))).toEqual(
      glyphs(b.image({ data: PIC, height: 3, alt: "x", overlay: { values: residual, yMin: pin.min, yMax: pin.max } })),
    );
  });

  it("IO11 (C04 §3h.4): the sample grid pins one scale across its set, and a caller's bound wins", () => {
    // **The builder half of the ruling.** A grid of attention maps each
    // normalised to its own extent draws N scales that look like one — F253
    // arriving in the composition this builder exists for.
    const items: readonly Sample[] = [
      { data: PIC, alt: "a", label: "a", overlay: { values: [[0, 1], [2, 3]] } },
      { data: PIC, alt: "b", label: "b", overlay: { values: [[10, 20], [30, 40]] } },
    ];
    const scaled = samplesScale(items);
    for (const item of scaled) {
      expect(item.overlay?.yMin, "the set's floor").toBe(0);
      expect(item.overlay?.yMax, "the set's ceiling").toBe(40);
    }
    // **A caller's own bound is a statement about the world and is kept.** The
    // computed range fills only what nobody named — `pinnedRange`'s rule one
    // level up, and the reason this is a default rather than an override.
    const mine = samplesScale([
      { data: PIC, alt: "a", label: "a", overlay: { values: [[0, 1]], yMax: 5 } },
      items[1] as Sample,
    ]);
    expect(mine[0]?.overlay?.yMax, "kept").toBe(5);
    expect(mine[0]?.overlay?.yMin, "and the other bound still filled").toBe(0);

    // The control: a set with no overlays is handed back untouched, so the rows
    // above are about the scale rather than about the builder rewriting items.
    const plainItems: readonly Sample[] = [{ data: PIC, alt: "a", label: "a" }];
    expect(samplesScale(plainItems), "no overlay, no rewrite").toBe(plainItems);

    // And it reaches the frame: the grid's two pictures differ, and their
    // overlays are read on one scale rather than two.
    const grid = b.samples({ items, columns: 2, cellRows: 3 });
    const drawn = renderToLines(reg, grid, 40, { theme: DARK_THEME, capabilities: FULL_CAPS });
    const seen = new Set(
      drawn.flatMap((l) => [...l.matchAll(new RegExp(ESC + String.raw`\[38;2;(\d+;\d+;\d+)m`, "gu"))]).map((m) => m[1]),
    );
    expect(seen.size, "one ramp across both cells").toBeGreaterThan(1);
  });
});
