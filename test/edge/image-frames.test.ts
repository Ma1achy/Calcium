/**
 * IF1–IF12 and C04 T2.39's GIF half — the GIF decoder, the frame store, the
 * wake, and the kitty ruling (C04 I93 · C09 I39 · C22 I77).
 *
 * **Every fixture is real and its generator is beside it.** A hand-typed blob is
 * the instrument-before-subject class (`test/support/README.md`): the first
 * image fixture in this repository was typed from memory and every row took the
 * `alt` fallback. These were written by `sharp` 0.35.3 in the devcontainer on
 * 2026-09-04 and are compared, frame by frame, against `sharp`'s own composited
 * pages — a second decoder that shares no code with this one.
 *
 *   sharp(raw, { raw: { width, height: h * n, channels: 4, pageHeight: h } })
 *     .gif({ loop: 0, ...opts }).toBuffer()
 *
 * **What each one exercises is read from its bytes, not assumed** (IF2's scan):
 * A has a local colour table on frame 2; B has two sub-rectangle frames with a
 * transparent index and delays of 0 and 10 hundredths; C is interlaced; D has
 * a local table per frame. Disposal 2 and 3 are reached by patching one byte of
 * B's Graphic Control Extension at an offset the scan finds, because `sharp`
 * writes disposal 1 only.
 *
 * **And the blobs were checked against the generator's output by a script, not
 * by eye**: the first transcription of D carried one extra `A` at offset 1207,
 * and IF2 refused it as *LZW minimum code size 0* — a real fixture, wrongly
 * copied, is the same class as a fabricated one and fails the same way.
 */
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createBlockRegistry, type BlockDefinition } from "../../src/presentation/blocks/index.js";
import { framesOf, imageCells } from "../../src/presentation/blocks/kinds/image.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import {
  decodeGif,
  decodeImage,
  decodePng,
  DEFAULT_DELAY_MS,
  MIN_DELAY_MS,
  type Pixels,
} from "../../src/presentation/image/index.js";
import { transmitAnimation, transmitRgba } from "../../src/presentation/image/kitty.js";
import { transmitImage } from "../../src/shell/transmit-image.js";
import { Frames } from "../../src/shell/frames.js";
import { b } from "../../src/shell/builders/index.js";
import type { Image } from "../../src/data/viewmodel/index.js";
import { rows as inkRows } from "../../src/presentation/blocks/paint.js";
import { rgbPng64 } from "../support/png.js";
import { DARK_THEME, DITHER_CAPS, FULL_CAPS, measurable } from "../support/render.js";
import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const ESC = String.fromCharCode(27);
const SGR = new RegExp(ESC + String.raw`\[[0-9;]*m`, "gu");
const KITTY_CAPS: TerminalCapabilities = { ...FULL_CAPS, imageProtocol: "kitty" };

// --- the fixtures ----------------------------------------------------------

/** 8x8, two frames: red then green, `delay: [100, 200]`. */
const A =
  "R0lGODlhCAAIAIAAAExpcf8AACH/C05FVFNDQVBFMi4wAwEAAAAh+QQFCgAAACwAAAAACAAIAAACB4yPqcvtXQAAIfkEBRQAAAAsAAAAAAgACACATGlxAP8AAgeMj6nL7V0AADs=";
/** 8x8, three frames: a 2x2 white dot walking down the diagonal, `delay: [0, 10, 50], interFrameMaxError: 0`. */
const B =
  "R0lGODlhCAAIAIEAAExpcf///wAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQFAAAAACwAAAAACAAIAAACCUyEacntD6NEBQAh+QQFAQAAACwAAAAABAAEAAACB5QAhhjBUQAAIfkEBQUAAAAsAgACAAQABAAAAgeUAIYYwVEAADs=";
/** 16x16, one frame, a gradient, `progressive: true` — interlaced. */
const C =
  "R0lGODlhEAAQAIcAABAggAAQgCAggBAwgCAAgAAwgAAggBAQgDAAgCAQgDAQgABAgCAwgFAAgBBAgEAQgDAggEAAgABQgFAwgDBQgBDwgCBggGAQgBBQgDAwgGAggCDggFAggBBwgCBAgDDwgHAQgBDQgBBggBDggDBAgEAggEAwgFAQgCDwgCBQgIAAgHAAgGAAgACAgADAgABwgADQgABggADggADwgIAwgPBAgMAwgBCAgDCggFBwgPAggCDQgCCggEBQgHBQgMAggIAQgBCwgKAQgOAQgNAwgEDggCCQgEBggDBggDCQgCCwgOBAgBDAgHAwgGBQgMAAgDDAgLAwgEBwgNAggKAAgDDggEDAgPAQgKAggCDAgEDQgBCQgNAQgECAgCBwgNBAgLAggLAQgBCggJAQgFBAgHBAgGAwgCCAgOAggMBAgFBggKAwgFBQgJAggIBAgGBggGBAgJAwgOAwgPAwgHAggIAggEDwgEBAgDCwgDBwgDDQgDCAgMAQgPAAgNAAgOAAgLAAgJAAgACwgACQgACggHBwgFDwgKBwgFCwgFDAgJBAgHCQgIBwgNBQgPBggKBggGDQgHCwgGCQgNBggGDwgFDggOBQgIBggJBwgPBQgLBQgGCggECwgFCAgHBggHDggHDAgICQgICAgGCAgMBggLBwgJBQgFDQgECggECQgOBwgOBggNBwgPBwgMBwgJBggLBggLBAgKBAgKBQgMBQgJCAgIBQgHDQgHDwgHCggHCAgGCwgGDggGDAgGBwgFCggFCQgPDwgPCAgIDwgICggPCwgMDwgMCggIDQgNCAgLCggMDQgPDQgNCwgKDwgKCQgKDAgKDQgOCggIDAgODwgNDQgKCwgMCAgNCQgNCggLCwgLDggKDggNDggLDAgKCAgMDggODggIDggPDAgODAgMDAgJCwgPCggMCQgOCAgPDggJCggKCggPCQgOCQgOCwgODQgNDwgNDAgMCwgLCAgJDAgJDggICwgJDQgJDwgJCQgLDQgLDwgLCQgAkAgAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQEAAAAACwAAAAAEAAQAEAI/wD9+SOAIEIDFitUBKIC6ImfP31a3Dizp0unUbpE1fpG71qydMIWOPBA4g4ZOGXcKJIVK82XJTVcMMkCxUqiXqCm1YPmrZw8cuMMABAAoQQHDXTqtMEC5scUNDpiiLCA5IiaN54uvXoEi9SkVY4IieGBA9WvTbmIrWOn7Fg2aedkjNhQpUglXp/E2eO2DVy3cOoCHEig4MGJCyCAjBEShg+XIVcKDGCQwcQEM01oxFkTxQYROXMkYEhBoQcbJz5smZqliVYjS5ledPCSR0oOX4UYYTpUyhUrVa0GbTGSJBUwSYtC6XvWDx02d+0EBVGChxOiXZHumbOmbV6zd8VghCTYoUfLKUi3kOGLtm9ZNXjMZlRA8cGOIUq4huVzxs9YPGrBBAQAOw==";
/** 8x8, two frames with disjoint palettes, `delay: [100, 100], interPaletteMaxError: 0`. */
const D =
  "R0lGODlhCAAIAIYAAExpcWk8FC1aFEtaFIceFC08FEs8FC0eFEseFGkeFC0AFEsAFGkAFIcAFKUAFKUeFIc8FGlaFC14FEt4FMMAFMMeFOEeFP8eFKU8FMM8FOE8FP88FIdaFOFaFP9aFGl4FOEAFP8AFKVaFMNaFId4FKV4FMN4FOF4FP94FC2WFEuWFGmWFC20FEu0FC3SFIeWFKWWFMOWFOGWFGm0FIe0FKW0FEvSFP+0FMPSFOHSFP+WFMO0FOG0FGnSFIfSFKXSFP/SFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQFCgAAACwAAAAACAAIAAAHQoAhIBQODQwLChcWFQ8ECQgHGxoZGBABBgUeHSMiHBEDAignJiUkHxMSOjIxMC8rKik3PDs1NDMtLEA5OD8+PTYugQAh+QQFCgAAACwAAAAACAAIAIZMaXE8S8haS8gAachaLcgAS8geS8gALcgeLcg8Lcgeacg8acgAh8geh8gApcgAw8h4Lchaacg8h8gepcg8pcgew8gA4ch4S8h4achah8hapcg8w8haw8ge4cg84cha4ciWLci0LcjSLcgA/8ge/8g8/8ha/8h4/8iWS8i0S8jSS8iWaci0acjSach4h8iWh8i0h8h4pciWpci0pcjSpch4w8iWw8jS4ciW/8i0/8jSh8jSw8i04ci0w8h44ciW4cjS/8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHQoAjJCUmJzg5QBYdHh8+Pzw3DxUbHDU2PTsOExQaMTIzNAwNEhkuLzA6AwoLERgrLC0FBgECFygpKgcICQQQICEigQA7";

const FIXTURES: readonly (readonly [string, string])[] = [["A", A], ["B", B], ["C", C], ["D", D]];
const bytesOf = (b64: string): Uint8Array => Uint8Array.from(Buffer.from(b64, "base64"));

/**
 * A scan of the block structure, so a row can say what its fixture carries
 * rather than believe the comment above it. Independent of `decodeGif` by
 * construction: it reads headers and skips data.
 */
type Scan = Readonly<{
  frames: readonly Readonly<{ left: number; top: number; w: number; h: number; local: boolean; interlaced: boolean; gceAt: number | null; delayHundredths: number; disposal: number; transparent: number | null }>[];
}>;
function scan(bytes: Uint8Array): Scan {
  const u16 = (a: number): number => (bytes[a] ?? 0) | ((bytes[a + 1] ?? 0) << 8);
  let at = 13;
  if (((bytes[10] ?? 0) & 0x80) !== 0) at += 3 << (((bytes[10] ?? 0) & 7) + 1);
  const frames: Scan["frames"][number][] = [];
  let gce: { at: number; delay: number; disposal: number; transparent: number | null } | null = null;
  while (at < bytes.length) {
    const k = bytes[at] ?? 0x3b;
    at += 1;
    if (k === 0x3b) break;
    if (k === 0x21) {
      const label = bytes[at] ?? 0;
      at += 1;
      if (label === 0xf9) {
        const f = bytes[at + 1] ?? 0;
        gce = { at: at + 1, delay: u16(at + 2), disposal: (f >> 2) & 7, transparent: (f & 1) !== 0 ? (bytes[at + 4] ?? 0) : null };
      }
      while (at < bytes.length) {
        const n = bytes[at] ?? 0;
        at += 1 + n;
        if (n === 0) break;
      }
      continue;
    }
    const left = u16(at);
    const top = u16(at + 2);
    const w = u16(at + 4);
    const h = u16(at + 6);
    const f = bytes[at + 8] ?? 0;
    at += 9;
    if ((f & 0x80) !== 0) at += 3 << ((f & 7) + 1);
    at += 1;
    while (at < bytes.length) {
      const n = bytes[at] ?? 0;
      at += 1 + n;
      if (n === 0) break;
    }
    frames.push({
      left, top, w, h,
      local: (f & 0x80) !== 0,
      interlaced: (f & 0x40) !== 0,
      gceAt: gce?.at ?? null,
      delayHundredths: gce?.delay ?? 0,
      disposal: gce?.disposal ?? 0,
      transparent: gce?.transparent ?? null,
    });
    gce = null;
  }
  return { frames };
}

const framesAndDelays = (b64: string): { frames: readonly Pixels[]; delays: readonly number[] } => {
  const d = decodeImage(bytesOf(b64));
  if (!d.ok) throw new Error(d.fault);
  return d.animation ?? { frames: [d.pixels], delays: [] };
};

/** RGBA at a pixel, for reading a frame rather than counting it. */
const at = (px: Pixels, x: number, y: number): readonly number[] => [...px.data.subarray((y * px.width + x) * 4, (y * px.width + x) * 4 + 4)];

const draw = (block: Image, caps: TerminalCapabilities, width: number, frame?: number): readonly string[] =>
  renderToLines(createBlockRegistry(), block, width, {
    theme: DARK_THEME,
    capabilities: caps,
    ...(frame === undefined ? {} : { frames: { [block.id]: frame } }),
  });
const stripped = (rows: readonly string[]): readonly string[] => rows.map((l) => l.replace(SGR, ""));

/** A block **not** built by `b`, which is the route an adapter's document takes. */
const raw = (data: string, height: number): Image =>
  ({ kind: "image", id: "img", data, height, alt: "a caption", digest: `raw-${String(data.length)}-${data.slice(-12)}` }) as Image;

describe("C04 I93 — the signature chooses the decoder", () => {
  it("IF1 (C04 I93): a PNG, a GIF and neither are three answers from one front door", () => {
    const png = decodeImage(bytesOf(rgbPng64(8, 8, () => [255, 0, 0])));
    expect(png.ok, "a PNG decodes").toBe(true);
    if (png.ok) expect(png.animation, "and a PNG is a still").toBeUndefined();

    const gif = decodeImage(bytesOf(A));
    expect(gif.ok).toBe(true);
    if (gif.ok) {
      expect(gif.animation?.frames.length, "two frames").toBe(2);
      expect(gif.pixels, "and `pixels` is frame 0, so a still consumer sees one picture").toBe(gif.animation?.frames[0]);
    }

    const one = decodeImage(bytesOf(C));
    expect(one.ok).toBe(true);
    if (one.ok) expect(one.animation, "a one-frame GIF is a still too").toBeUndefined();

    const neither = decodeImage(Buffer.from("plainly not an image"));
    expect(neither.ok).toBe(false);
    if (!neither.ok) expect(neither.fault).toMatch(/PNG or a GIF/u);
    // **`decodePng` is unchanged** — the front door dispatches to it and does
    // not replace it, so its own refusal keeps its own words (HB8 reads them).
    expect(decodePng(bytesOf(A)).ok).toBe(false);
  });

  it("IF2 (C09 I39): every fixture decodes pixel for pixel to sharp's composited pages", async () => {
    let compared = 0;
    for (const [name, b64] of FIXTURES) {
      const bytes = bytesOf(b64);
      const { frames } = framesAndDelays(b64);
      const meta = await sharp(bytes, { animated: true }).metadata();
      expect(frames.length, `${name}: as many frames as sharp reads`).toBe(meta.pages ?? 1);
      for (const [k, ours] of frames.entries()) {
        const ref = await sharp(bytes, { page: k }).ensureAlpha().raw().toBuffer();
        expect(ours.data.length, `${name}[${String(k)}]: RGBA of the logical screen`).toBe(ref.length);
        let differing = 0;
        for (let i = 0; i < ref.length; i += 4) {
          if (ref[i + 3] === 0 && ours.data[i + 3] === 0) continue;
          if (ref[i] !== ours.data[i] || ref[i + 1] !== ours.data[i + 1] || ref[i + 2] !== ours.data[i + 2] || ref[i + 3] !== ours.data[i + 3]) differing += 1;
        }
        expect(differing, `${name}[${String(k)}]: pixels that disagree with sharp`).toBe(0);
        compared += 1;
      }
    }
    // **The sweep says how many it ran** (C04 T2.18's rule).
    expect(compared).toBe(8);

    // **The fixtures carry what the header claims**, read from the bytes.
    const a = scan(bytesOf(A)).frames;
    const bScan = scan(bytesOf(B)).frames;
    const c = scan(bytesOf(C)).frames;
    const d = scan(bytesOf(D)).frames;
    expect(a.map((f) => f.local), "A: a local table on frame 2").toEqual([false, true]);
    expect(bScan.map((f) => [f.left, f.top, f.w, f.h]), "B: sub-rectangle frames").toEqual([[0, 0, 8, 8], [0, 0, 4, 4], [2, 2, 4, 4]]);
    expect(bScan.every((f) => f.transparent !== null), "B: every frame names a transparent index").toBe(true);
    expect(c[0]?.interlaced, "C: interlaced").toBe(true);
    expect(d.map((f) => f.local), "D: local tables").toEqual([false, true]);

    // **The control**: a byte of LZW data flipped changes the picture or refuses
    // it — so the comparison above can see a decoder that is wrong.
    const broken = bytesOf(A);
    broken[broken.length - 6] = (broken[broken.length - 6] ?? 0) ^ 0x5a;
    const r = decodeImage(broken);
    const same = r.ok && r.animation !== undefined && Buffer.compare(Buffer.from(r.animation.frames[1]?.data ?? []), Buffer.from(framesAndDelays(A).frames[1]?.data ?? [])) === 0;
    expect(same, "a corrupted stream does not decode to the same frame").toBe(false);
  });

  it("IF3 (C09 I39): delays are milliseconds, and the ones under the floor become the browsers' hundred", () => {
    expect(framesAndDelays(A).delays).toEqual([100, 200]);
    // **B's bytes carry 0, 1 and 5 hundredths** — read, not assumed.
    expect(scan(bytesOf(B)).frames.map((f) => f.delayHundredths)).toEqual([0, 1, 5]);
    expect(framesAndDelays(B).delays).toEqual([DEFAULT_DELAY_MS, DEFAULT_DELAY_MS, 50]);
    expect(MIN_DELAY_MS, "the floor is above 10 ms — a 20 ms frame is over the 30 fps ceiling").toBe(20);
    expect(DEFAULT_DELAY_MS).toBe(100);
    // **Interlace is read**: clearing the bit permutes the rows of C.
    const flat = bytesOf(C);
    const s = scan(flat);
    const descriptor = s.frames[0];
    expect(descriptor?.interlaced).toBe(true);
    const before = framesAndDelays(C).frames[0];
    // The image descriptor's flag byte is 8 past the introducer; find it by the
    // sub-rectangle the scan reported rather than by a literal offset.
    let idx = -1;
    for (let i = 13; i < flat.length - 9; i += 1) {
      if (flat[i] === 0x2c && flat[i + 5] === 16 && flat[i + 7] === 16 && ((flat[i + 9] ?? 0) & 0x40) !== 0) { idx = i + 9; break; }
    }
    expect(idx, "the descriptor was found").toBeGreaterThan(0);
    flat[idx] = (flat[idx] ?? 0) & ~0x40;
    const permuted = decodeGif(flat);
    expect(permuted.ok).toBe(true);
    if (permuted.ok && before !== undefined) {
      expect(Buffer.compare(Buffer.from(permuted.frames[0]?.data ?? []), Buffer.from(before.data)), "rows land elsewhere").not.toBe(0);
    }
  });

  it("IF4 (C09 I39): disposal 2 clears the frame's rectangle and disposal 3 restores the screen before it", () => {
    const reference = framesAndDelays(B).frames;
    const s = scan(bytesOf(B));
    const gce2 = s.frames[1]?.gceAt;
    expect(gce2, "frame 2 has a control block").not.toBeNull();
    if (gce2 === null || gce2 === undefined) return;

    // Frame 2 painted a dot at (2..3, 2..3) inside a 4x4 at (0,0). With
    // disposal 2, frame 3 must find that rectangle transparent where it does not
    // paint; with disposal 1 (as written) frame 3 inherits frame 2's pixels.
    const two = bytesOf(B);
    two[gce2] = ((two[gce2] ?? 0) & ~0x1c) | (2 << 2);
    const d2 = decodeGif(two);
    expect(d2.ok).toBe(true);
    if (d2.ok) {
      const f3 = d2.frames[2];
      expect(f3).toBeDefined();
      if (f3 !== undefined) {
        // (0,0) is inside frame 2's rectangle and outside frame 3's (2..5): cleared.
        expect(at(f3, 0, 0)[3], "alpha at (0,0) after disposal 2").toBe(0);
        // (6,6) is outside both: whatever frame 1 left there, unchanged.
        expect(at(f3, 6, 6), "outside both rectangles").toEqual(at(reference[0] as Pixels, 6, 6));
        // and frame 3's own dot is drawn.
        expect(at(f3, 4, 4).slice(0, 3), "frame 3's dot").toEqual([255, 255, 255]);
      }
    }

    const three = bytesOf(B);
    three[gce2] = ((three[gce2] ?? 0) & ~0x1c) | (3 << 2);
    const d3 = decodeGif(three);
    expect(d3.ok).toBe(true);
    if (d3.ok) {
      const f3 = d3.frames[2];
      const f1 = reference[0];
      if (f3 !== undefined && f1 !== undefined) {
        // Restored to frame 1 everywhere frame 3 did not paint: the (0,0) dot is back.
        expect(at(f3, 0, 0), "frame 1's dot is restored").toEqual(at(f1, 0, 0));
        expect(at(f3, 0, 0).slice(0, 3)).toEqual([255, 255, 255]);
        // and frame 2's dot at (2,2) — which frame 3's rectangle covers and
        // paints black — is gone.
        expect(at(f3, 2, 2).slice(0, 3), "frame 2's dot under frame 3").toEqual([0, 0, 0]);
      }
    }

    // **Control**: the unpatched bytes give frame 3 with the (0,0) dot painted
    // over black by frame 2's delta, and opaque — which is what disposal 1 means.
    const f3 = reference[2];
    expect(f3 && at(f3, 0, 0)[3]).toBe(255);
  });

  it("IF5 (C09 I39, I38): a GIF that cannot be read says which refusal, and keeps its extent when it has one", () => {
    const short = decodeImage(bytesOf(A).subarray(0, 10));
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.size, "no logical screen, no extent").toBeUndefined();

    const zero = bytesOf(A);
    zero[6] = 0;
    zero[7] = 0;
    const z = decodeImage(zero);
    expect(z.ok).toBe(false);
    if (!z.ok) expect(z.fault).toMatch(/0x8/u);

    // A minimum code size the format forbids, with the screen already read.
    const bad = bytesOf(A);
    const s = scan(bytesOf(A));
    let idx = -1;
    for (let i = 13; i < bad.length - 9; i += 1) if (bad[i] === 0x2c && bad[i + 5] === 8 && bad[i + 7] === 8) { idx = i; break; }
    expect(idx).toBeGreaterThan(0);
    const flags = bad[idx + 9] ?? 0;
    const lct = (flags & 0x80) !== 0 ? 3 << ((flags & 7) + 1) : 0;
    bad[idx + 10 + lct] = 13;
    const r = decodeImage(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fault).toMatch(/code size 13/u);
      expect(r.size, "the extent survives a corrupt frame").toEqual({ width: 8, height: 8 });
    }
    void s;

    // **And the block draws the reason**, in the status box, as every refusal does (C09 I38).
    const rows = stripped(draw(raw(Buffer.from(bad).toString("base64"), 4), FULL_CAPS, 60));
    expect(rows.join(" ")).toMatch(/code size 13/u);
    expect(rows[0]).toMatch(/^┌─+┐$/u);
  });
});

describe("C04 I93 — the frame is view state, never geometry", () => {
  const gif = b.image({ id: "g", data: A, height: 3, alt: "red then green" });
  const still = b.image({ id: "p", data: rgbPng64(8, 8, () => [255, 0, 0]), height: 3, alt: "red" });

  it("T2.39 (C04 I93): measure of a GIF equals measure of its first frame as a PNG, at every width", () => {
    const r = measurable({});
    for (const width of [1, 2, 3, 8, 40, 120]) {
      expect(r.measure(gif, width), `width ${String(width)}`).toBe(r.measure(still, width));
      expect(imageCells(gif, width)).toEqual(imageCells(still, width));
    }
    // **And the frame never reaches `measure`** (C09 I8): the same rows at
    // every index, and as many as `measure` committed.
    for (const frame of [0, 1, 2, 7]) {
      const rows = draw(gif, FULL_CAPS, 40, frame);
      expect(rows.length, `frame ${String(frame)} draws the committed rows`).toBe(r.measure(gif, 40));
    }
  });

  it("IF6 (C04 I93, C09 I39): the half-block arm draws the frame the context names — read in colour", () => {
    // 24-bit, no overlay, narrow: the half-block rung, whose colour *is* the picture.
    const zero = draw(gif, FULL_CAPS, 40, 0).join("");
    const one = draw(gif, FULL_CAPS, 40, 1).join("");
    const absent = draw(gif, FULL_CAPS, 40).join("");
    expect(zero, "frame 0 is red").toContain("38;2;255;0;0");
    expect(zero, "and not green").not.toContain("38;2;0;255;0");
    expect(one, "frame 1 is green").toContain("38;2;0;255;0");
    expect(one, "and not red").not.toContain("38;2;255;0;0");
    expect(absent, "no field is frame 0 — a PNG never notices it").toBe(zero);
    // **Wraps rather than refuses**: index 2 of two frames is frame 0.
    expect(draw(gif, FULL_CAPS, 40, 2).join("")).toBe(zero);
  });

  it("IF7 (C09 I39): the dither arm draws the frame too, and the kitty arm ignores it", () => {
    const walking = b.image({ id: "w", data: B, height: 4, alt: "a walking dot" });
    const f0 = stripped(draw(walking, DITHER_CAPS, 40, 0));
    const f2 = stripped(draw(walking, DITHER_CAPS, 40, 2));
    expect(f0.length).toBe(f2.length);
    expect(f0.join("\n"), "the dot moved").not.toBe(f2.join("\n"));

    const k0 = draw(gif, KITTY_CAPS, 40, 0);
    const k1 = draw(gif, KITTY_CAPS, 40, 1);
    expect(k0, "placeholders do not change with the frame — the terminal holds every frame").toEqual(k1);
    expect(framesOf(gif)?.delays, "and the wake reads the delays from the block").toEqual([100, 200]);
    expect(framesOf(still), "a still has none").toBeNull();
  });
});

describe("C22 I77 — the frame store", () => {
  it("IF8 (C22 I77, I74): the index is a function of elapsed time; zero is omitted from the key", () => {
    const delays = [100, 200];
    const a = new Frames();
    for (let i = 0; i < 4; i += 1) a.advance("e", "g", delays, 25);
    a.advance("e", "g", delays, 100);
    const c = new Frames();
    c.advance("e", "g", delays, 200);
    expect(a.indexOf("e", "g"), "200 ms is 200 ms however it is cut up").toBe(c.indexOf("e", "g"));
    expect(a.indexOf("e", "g")).toBe(1);
    expect(a.due("e", "g", delays), "and the remainder is kept").toBe(c.due("e", "g", delays));
    expect(a.due("e", "g", delays)).toBe(100);
    expect(a.key("e")).toBe("g=1");

    // **Control**: a different total must differ.
    const d = new Frames();
    d.advance("e", "g", delays, 300);
    expect(d.indexOf("e", "g"), "a full loop is frame 0 again").toBe(0);
    expect(d.key("e"), "and frame 0 keys as untouched — it draws what untouched draws").toBe("");
    expect(new Frames().due("e", "g", delays), "untouched is due after frame 0's whole delay").toBe(100);

    // A minute idle comes back to where the clock says, not to a minute of catching up.
    const idle = new Frames();
    idle.advance("e", "g", delays, 60_000 + 150);
    expect(idle.indexOf("e", "g")).toBe(1);
    expect(idle.due("e", "g", delays)).toBe(150);

    // Stills and nothing are no-ops.
    const s = new Frames();
    s.advance("e", "g", [100], 500);
    s.advance("e", "g", delays, 0);
    expect(s.size).toBe(0);
    expect(s.forEntry("e")).toEqual({});

    // Two blocks in one entry key separately, sorted.
    const two = new Frames();
    two.advance("e", "z", delays, 100);
    two.advance("e", "a", delays, 100);
    expect(two.key("e")).toBe("a=1,z=1");
    expect(two.forEntry("e")).toEqual({ a: 1, z: 1 });
    two.delete("e");
    expect(two.size).toBe(0);
  });
});

describe("C09 I39 — the kitty arm uploads once and the terminal animates", () => {
  it("IF9 (C09 I39): the escapes are one placement, a frame per later frame with its gap, and a start", () => {
    const { frames, delays } = framesAndDelays(A);
    const out = transmitAnimation(7, frames, delays, 4, 2);
    const escapes = out.split(`${ESC}\\`).filter((s) => s !== "");
    expect(escapes[0], "the placement, as raw pixels").toMatch(/^\u001b_Ga=T,f=32,t=d,o=z,s=8,v=8,i=7,U=1,c=4,r=2,q=2/u);
    const frameEscapes = escapes.filter((e) => e.includes("a=f,"));
    expect(frameEscapes.length, "one per frame after the first").toBe(frames.length - 1);
    expect(frameEscapes[0]).toMatch(/a=f,i=7,f=32,o=z,s=8,v=8,z=200,q=2/u);
    expect(escapes.at(-2), "the root frame's gap").toMatch(/a=a,i=7,r=1,z=100,q=2$/u);
    expect(escapes.at(-1), "then run, looping").toMatch(/a=a,i=7,s=3,v=1,q=2$/u);
    for (const e of escapes) expect(e.length, "every chunk under the direct-transmission limit").toBeLessThanOrEqual(4096);

    // **The ruling's arithmetic, on this fixture**: one upload against a
    // retransmission every tick. Measured 189 bytes once against 75 a tick — a
    // quarter of a second of 10 fps pays for the whole animation.
    const perTick = transmitRgba(7, frames[0] as Pixels, 4, 2).length;
    expect(out.length).toBeLessThan(perTick * 10);
  });

  it("IF10 (C09 I39): `transmitImage` sends a GIF as its frames, once, and a PNG as its bytes", () => {
    const gif = b.image({ id: "g", data: A, height: 3, alt: "red then green" });
    const png = b.image({ id: "p", data: rgbPng64(8, 8, () => [255, 0, 0]), height: 3, alt: "red" });
    const sent = new Set<string>();
    const first = transmitImage([gif, png], KITTY_CAPS, sent, 80);
    expect(first, "the GIF goes as frames").toContain("a=f,");
    expect(first, "never as `f=100`, which kitty would fail to decode").not.toMatch(/f=100[^]*a=f/u);
    expect(first, "the PNG goes as its bytes").toContain("f=100");
    expect(transmitImage([gif, png], KITTY_CAPS, sent, 80), "and neither goes twice").toBe("");
    expect(transmitImage([gif], FULL_CAPS, new Set(), 80), "nothing at all off the protocol arm").toBe("");

    // An overlay composites into every frame and the frame count is unchanged.
    const over = b.image({ id: "o", data: A, height: 3, alt: "overlaid", overlay: { values: [[0, 1], [1, 0]], colormap: "viridis" } });
    const withOverlay = transmitImage([over], KITTY_CAPS, new Set(), 80);
    expect(withOverlay.split("a=f,").length - 1).toBe(1);
  });
});

// --- the session's wake -----------------------------------------------------


function watching(): { definition: BlockDefinition; frames: () => readonly number[] } {
  const seen: number[] = [];
  return {
    frames: () => seen,
    definition: {
      kind: "count",
      measure: () => 1,
      render: (_b, ctx) => {
        // Absent is frame 0 — `Frames.forEntry` is empty until something advances.
        seen.push(ctx.frames?.["g"] ?? 0);
        return inkRows(["counted"]);
      },
    },
  };
}

async function session(definition: BlockDefinition, blocks: readonly unknown[], overrides: Record<string, unknown> = {}) {
  const stdin = fakeStdin();
  const built = await buildSession(
    {
      stdin: stdin as never,
      blocks: [definition],
      manifest: { schema: "tui.manifest/1", binary: "prism", version: "1.0.0", tools: [{ name: "show", local: true, summary: "an image", args: [], flags: [] }] },
      localHandlers: { show: () => ({ schema: "tui.view/1", status: "ok", blocks }) },
      ...overrides,
    } as never,
    { columns: 80, rows: 20 },
  );
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await Promise.resolve();
    await Promise.resolve();
  };
  await type("/show\r");
  await Promise.resolve();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
  return { ...built, type };
}

/**
 * Advance the injected clock and the timers together, **a millisecond at a
 * time** — a wake with time in it, and no more time than it has.
 *
 * `orbit-wiring.test.ts` advances the clock by the whole step and then runs the
 * timers, which is right for its rows (the angle is a function of the total)
 * and wrong for these: a timer firing inside the step reads a clock already at
 * the step's end, so a wake at 333 ms saw 400 and walked one frame too far. The
 * frame index is a function of *when the wake happened*, so the two clocks have
 * to agree at every firing (`two clocks in a harness must agree`).
 */
const wake = async (built: { clock: { advance: (ms: number) => void } }, ms: number): Promise<void> => {
  for (let i = 0; i < ms; i += 1) {
    built.clock.advance(1);
    await vi.advanceTimersByTimeAsync(1);
  }
};

describe("C22 I77 — the wake", () => {

  it("T4.17o (C22 I77): a still arms no wake, a two-frame GIF wakes at its delays, and the frame follows the clock", async () => {
    vi.useFakeTimers();
    try {
      const gif = b.image({ id: "g", data: A, height: 3, alt: "red then green" });
      const png = b.image({ id: "p", data: rgbPng64(8, 8, () => [255, 0, 0]), height: 3, alt: "red" });

      // **The still.** One frame after the entry lands, then nothing for a second.
      const s = watching();
      const bs = await session(s.definition, [{ kind: "count", id: "c" }, png]);
      const stillBefore = s.frames().length;
      expect(stillBefore, "it rendered at all").toBeGreaterThan(0);
      for (let i = 0; i < 30; i += 1) await wake(bs, 33);
      expect(s.frames().length - stillBefore, "a still costs nothing: no wake, no render").toBe(0);

      // **The animation, on a rasterising arm.** Frame 0 shows for 100 ms and
      // frame 1 for 200, so the frame changes at 100, 300, 400, 600, 700 and
      // 900 ms — six changes in 990 ms, so about six renders and not thirty:
      // the ticker is armed for the next frame, not for the floor. Measured
      // with the validator patched: 6.
      const g = watching();
      const bg = await session(g.definition, [{ kind: "count", id: "c" }, gif]);
      const before = g.frames().length;
      expect(g.frames().at(-1) ?? 0, "frame 0 at first").toBe(0);
      for (let i = 0; i < 30; i += 1) await wake(bg, 33);
      const renders = g.frames().length - before;
      expect(renders, "it woke at all").toBeGreaterThanOrEqual(5);
      expect(renders, "and at its delays rather than every 33 ms").toBeLessThanOrEqual(8);
      // **The frame follows the clock**: the sequence of indices the renders saw
      // alternates, and the last render — at 900 ms — is frame 0, which shows
      // until 1000. (The first draft of this row said frame 1 and the run said
      // 0: the assertion was wrong about the arithmetic, the store was not.)
      const seen = g.frames().slice(before);
      expect(seen[0], "the first wake is frame 1").toBe(1);
      expect(seen.at(-1), "and at 990 ms it is frame 0, from the 900 ms change").toBe(0);
      expect(seen, "alternating, one render per change").toEqual([1, 0, 1, 0, 1, 0]);
      expect(new Set(seen), "both frames were drawn").toEqual(new Set([0, 1]));

      // **At kitty the same document arms nothing** — the terminal holds every frame.
      const k = watching();
      const bk = await session(k.definition, [{ kind: "count", id: "c" }, gif], { capabilities: { imageProtocol: "kitty" } });
      const kittyBefore = k.frames().length;
      for (let i = 0; i < 30; i += 1) await wake(bk, 33);
      expect(k.frames().length - kittyBefore, "no wake on the protocol arm").toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.17q (C22 I77, I74): a GIF beside a spinner keeps its own cadence", async () => {
    vi.useFakeTimers();
    try {
      const gif = b.image({ id: "g", data: A, height: 3, alt: "red then green" });
      const spinner = { kind: "steps", id: "s", steps: [{ label: "building", state: "active" }] };
      // **Synchronised update pinned on**, for T4.17j's reason: the floor under
      // the wake is 33 ms with it and 100 without, and a frame boundary is seen
      // at the first wake after it — so without the capability a change at 100
      // ms is drawn at 160 (the spinner's next wake) and this row would measure
      // the cap rather than the cadence.
      const g = watching();
      const bg = await session(g.definition, [{ kind: "count", id: "c" }, spinner, gif], {
        capabilities: { synchronisedUpdate: true },
      });
      const before = g.frames().length;
      // 80 ms spinner and a 100/200 GIF: the timer fires at 80 for the spinner
      // and the frame must **not** move — a step per wake would show frame 1
      // from that wake and frame 0 again from the next. **Two windows sit
      // between a boundary and its picture**: a `stream` commit flushes 33 ms
      // after its wake (C03 §3), and the ticker is re-armed from that render,
      // not from the wake. So: wake 80 → render 113 → armed for `due` 20,
      // floored to 33 → wake 146 (frame 1) → render 179; wake 259 (spinner) →
      // render 292 → armed 41 → wake 333 (frame 0) → render 366. Measured with
      // the validator patched. Two earlier drafts of this row were wrong about
      // the harness rather than the store: one assumed the re-arm ran from the
      // wake, and one advanced the clock by whole steps so the 333 ms wake read
      // 400 and walked a frame too far — which is why `wake` above is a loop.
      await wake(bg, 80);
      expect(g.frames().at(-1), "80 ms in: still frame 0").toBe(0);
      await wake(bg, 120);
      expect(g.frames().at(-1), "200 ms in: frame 1, rendered at 179").toBe(1);
      await wake(bg, 80);
      expect(g.frames().at(-1), "280 ms in: still frame 1").toBe(1);
      await wake(bg, 120);
      expect(g.frames().at(-1), "400 ms in: frame 0, rendered at 366").toBe(0);
      expect(g.frames().length - before, "and the spinner kept the frames coming").toBeGreaterThan(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
