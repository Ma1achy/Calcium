/**
 * ID1–ID6 — the codec and the ordered dither (C04 I73, C09 I36 · §4c).
 *
 * **Three of these read the figure rather than a count**, because *genuinely
 * readable* is the dither's whole claim and no assertion about intensities can
 * check it. A gradient that bands and a gradient that does not have identical
 * means, identical extremes and identical dot counts — the difference is the
 * arrangement, and only the frame shows it.
 */
import { describe, expect, it } from "vitest";
import { rgbPng } from "../support/png.js";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { decodePng, ditherAscii, ditherBraille, bayer, luminance, DITHER_ASCII, type Pixels } from "../../src/presentation/image/index.js";

/** A PNG from `sharp`, which already drives `tools/catalogue-png.mjs`. */
function png(script: string, out: string): Uint8Array {
  execFileSync("node", ["-e", script], { encoding: "utf8" });
  return new Uint8Array(readFileSync(out));
}

/** A raw RGBA image, for the cases a generator makes clearer than a file. */
function synth(w: number, h: number, f: (x: number, y: number) => readonly [number, number, number, number]): Pixels {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b, a] = f(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width: w, height: h, data };
}

/** The per-row filter byte of every scanline, read off the inflated stream. */
function filterTypes(png: Uint8Array): readonly number[] {
  const idat: Buffer[] = [];
  let at = 8;
  let stride = 0;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (at + 8 <= png.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(png[at + 4] ?? 0, png[at + 5] ?? 0, png[at + 6] ?? 0, png[at + 7] ?? 0);
    if (type === "IHDR") stride = view.getUint32(at + 8) * ((png[at + 17] ?? 0) === 6 ? 4 : 3);
    if (type === "IDAT") idat.push(Buffer.from(png.subarray(at + 8, at + 8 + len)));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += stride + 1) out.push(raw[i] ?? 0);
  return out;
}

const show = (label: string, rows: readonly string[]): void => {
  console.log(`\n--- ${label}\n${rows.map((r) => `|${r}|`).join("\n")}`);
};

describe("ID — the codec", () => {
  it("ID1 (C04 I73): a real PNG decodes, and the pixels are the ones sharp wrote", () => {
    const out = "/tmp/id1.png";
    const bytes = png(
      `const s=require("sharp");s({create:{width:6,height:4,channels:3,background:{r:255,g:0,b:0}}}).png().toFile(${JSON.stringify(out)}).then(()=>0)`,
      out,
    );
    const r = decodePng(bytes);
    expect(r.ok, r.ok ? "" : r.fault).toBe(true);
    if (!r.ok) return;
    expect([r.pixels.width, r.pixels.height]).toEqual([6, 4]);
    expect([...r.pixels.data.subarray(0, 4)], "pure red, opaque").toEqual([255, 0, 0, 255]);
    // Every pixel, so a decoder that got the stride right for row 0 and wrong
    // after is caught — the filter pass is sequential and row 1 is the first
    // that can go wrong.
    for (let i = 0; i < 6 * 4; i += 1) {
      expect([...r.pixels.data.subarray(i * 4, i * 4 + 4)], `pixel ${String(i)}`).toEqual([255, 0, 0, 255]);
    }
  });

  it("ID2 (C04 I73): an RGBA PNG with a filtered gradient survives the unfilter pass", () => {
    // **A gradient is what exercises the filters.** A flat colour encodes as
    // filter 0 on every row; a gradient makes the encoder reach for Sub, Up and
    // Paeth, which is where a decoder that never read the row above breaks.
    const bytes = rgbPng(32, 16, (x, y) => {
      const v = (x * 8 + y * 16) & 0xff;
      return [v, v, v];
    });
    const r = decodePng(bytes);
    expect(r.ok, r.ok ? "" : r.fault).toBe(true);
    if (!r.ok) return;
    expect([r.pixels.width, r.pixels.height]).toEqual([32, 16]);

    // **The fixture is shown to reach the arm before it is asserted against.**
    // A mutation breaking Paeth survived five sampled pixels, because nothing
    // said the encoder had used Paeth at all — the filter bytes are read off the
    // inflated stream so the row fails loudly if the encoder ever changes.
    const filters = new Set(filterTypes(bytes));
    console.log(`filters exercised: ${[...filters].sort().join(", ")}`);
    expect([...filters].sort(), "all five arms, by construction").toEqual([0, 1, 2, 3, 4]);

    // **Every pixel, not five.** A wrong predictor drifts progressively, so a
    // sampled check passes on the rows that happen to agree.
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const i = (y * 32 + x) * 4;
        const want = (x * 8 + y * 16) & 0xff;
        expect(r.pixels.data[i], `at ${String(x)},${String(y)}`).toBe(want);
      }
    }
  });

  it("ID3 (C09 I36): every refusal names its own reason rather than drawing a wrong picture", () => {
    const cases: readonly (readonly [string, Uint8Array, RegExp])[] = [
      ["not a PNG", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), /signature/u],
      ["truncated to the signature", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), /no IHDR/u],
    ];
    for (const [name, bytes, fault] of cases) {
      const r = decodePng(bytes);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.fault, name).toMatch(fault);
    }
    // A real PNG whose IDAT has been corrupted: the inflate must fail rather
    // than produce garbage pixels, because a wrong picture is the failure mode
    // this arm is most careful about.
    const out = "/tmp/id3.png";
    const good = png(
      `const s=require("sharp");s({create:{width:8,height:8,channels:3,background:{r:1,g:2,b:3}}}).png().toFile(${JSON.stringify(out)}).then(()=>0)`,
      out,
    );
    const broken = Uint8Array.from(good);
    const idat = good.indexOf(0x49, 40);
    broken[idat + 12] = (broken[idat + 12] ?? 0) ^ 0xff;
    broken[idat + 13] = (broken[idat + 13] ?? 0) ^ 0xff;
    const r = decodePng(broken);
    console.log(`corrupt IDAT -> ${r.ok ? "DECODED (bad)" : r.fault}`);
    expect(r.ok, "a corrupt image is refused, not drawn").toBe(false);
  });
});

describe("ID — the ordered dither", () => {
  it("ID4 (C09 I36): the Bayer offset varies with position, which is the whole point", () => {
    const seen = new Set<number>();
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) seen.add(bayer(x, y));
    // **Sixty-four rather than sixteen**, and that is the level resolution the
    // frame chose: at 0.28 a 4x4 draws one glyph everywhere and this resolves
    // two (C09 §4c).
    expect(seen.size, "sixty-four distinct thresholds").toBe(64);
    expect(bayer(0, 0)).not.toBe(bayer(1, 0));
    expect(bayer(0, 0), "and it tiles at 8").toBe(bayer(8, 8));
    expect(bayer(0, 0), "not at 4 — the period is what a braille cell must not divide").not.toBe(bayer(4, 4));
    expect(Math.min(...seen) > 0 && Math.max(...seen) < 1, "strictly inside [0,1]").toBe(true);
  });

  it("ID5 (C09 I36): a gradient reads as texture rather than bands — READ THE FIGURE", () => {
    const g = synth(160, 64, (x) => [Math.round((x / 159) * 255), Math.round((x / 159) * 255), Math.round((x / 159) * 255), 255]);
    const braille = ditherBraille(g, 40, 8);
    const ascii = ditherAscii(g, 40, 8);
    show("gradient · braille 40x8", braille);
    show("gradient · ascii 40x8", ascii);

    expect(braille, "one string per row").toHaveLength(8);
    expect(ascii).toHaveLength(8);

    // **Two row patterns, and the number is the matrix's period rather than the
    // image's.** A horizontal gradient is uniform vertically, so anything the
    // rows do comes from the dither: the 8x8's y-period is 8 dots, a braille
    // cell is 4 tall, so cell rows alternate between exactly two resolutions.
    //
    // **This is the row that moved when the matrix did.** Under the 4x4 it was
    // 1 — the period equalled the cell height and every row resolved the same,
    // which is the defect C09 §4c records. Asserting the number rather than
    // "more than one" is what makes it say which matrix is installed.
    expect(new Set(braille).size, "the 8x8's period is two cell rows").toBe(2);

    // **So the matrix is tested against a source that does vary**, which is the
    // case that would falsify the reading above.
    const vertical = synth(160, 64, (_x, y) => {
      const v = Math.round((y / 63) * 255);
      return [v, v, v, 255];
    });
    const down = ditherBraille(vertical, 40, 8);
    show("vertical gradient · braille 40x8", down);
    expect(new Set(down).size, "a vertical gradient must not dither to one row").toBeGreaterThan(1);
    // And the left edge must be empty where the right is full, or the ramp is
    // inverted — which a frame shows instantly and a mean does not.
    expect(ascii[0]?.[0], "dark at the left").toBe(" ");
    expect(ascii[0]?.at(-1), "and heavy at the right").toBe("@");
  });

  it("ID5b (C09 I36): a flat mid-grey shows texture and not a locked pattern — READ THE FIGURE", () => {
    // **Where a 4x4 matrix could go wrong.** Its y-period is 4 and a braille
    // cell is 4 dots tall, so the pattern cannot shift between cell rows — a
    // flat field is exactly where that would read as a regular grille rather
    // than as texture. The disc's interior is saturated and shows nothing.
    for (const level of [64, 128, 192]) {
      const flat = synth(80, 32, () => [level, level, level, 255]);
      show(`flat ${String(level)}/255 · braille 40x8`, ditherBraille(flat, 40, 8));
    }
    const half = synth(80, 32, () => [128, 128, 128, 255]);
    const rows = ditherBraille(half, 40, 8);
    // Half grey must be roughly half the dots — the number under the frame.
    const dots = rows.join("").split("").reduce((n, ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp < 0x2800 ? n : n + [...(cp - 0x2800).toString(2)].filter((b) => b === "1").length;
    }, 0);
    const total = 40 * 8 * 8;
    console.log(`flat 128/255: ${String(dots)} dots of ${String(total)} = ${(dots / total).toFixed(3)}`);
    expect(dots / total, "half grey is about half the dots").toBeGreaterThan(0.35);
    expect(dots / total, "and not more").toBeLessThan(0.65);
  });

  it("ID6 (C09 I36): a disc reads as a disc, at both arms — READ THE FIGURE", () => {
    const d = synth(120, 120, (x, y) => {
      const dx = x - 60;
      const dy = y - 60;
      const inside = dx * dx + dy * dy < 52 * 52;
      return inside ? [255, 255, 255, 255] : [0, 0, 0, 255];
    });
    show("disc · braille 30x8", ditherBraille(d, 30, 8));
    show("disc · ascii 30x8", ditherAscii(d, 30, 8));
    const rows = ditherAscii(d, 30, 8);
    // The middle row is wider than the top, which is what makes it a disc and
    // not a square — asserted so the frame read has a number under it.
    const ink = (r: string): number => [...r].filter((c) => c !== " ").length; // cells-ok — a glyph count
    expect(ink(rows[4] ?? ""), "the middle is the widest").toBeGreaterThan(ink(rows[0] ?? ""));
    expect(luminance(d, 60, 60), "the centre is white").toBeCloseTo(1, 5);
    expect(luminance(d, 0, 0), "and the corner is not").toBeCloseTo(0, 5);

    // **A hard-edged disc cannot see point-sampling**, which a mutation proved:
    // reading one pixel instead of averaging its rectangle changed nothing,
    // because a binary source has no detail to alias. **Fine stripes at a
    // fraction of the output resolution is the case that does** — averaged they
    // resolve to an even mid-tone, point-sampled they alias into bands.
    const stripes = synth(240, 32, (x) => {
      const v = x % 2 === 0 ? 255 : 0;
      return [v, v, v, 255];
    });
    const striped = ditherAscii(stripes, 30, 4);
    show("1px stripes · ascii 30x4 — averaged, this is flat mid-tone", striped);

    // **The value, not the variety.** Counting distinct glyphs accepts both
    // readings: point-sampling lands on the even pixel of every cell, so it
    // returns one glyph — `@` — and averaging returns one or two mid-ramp ones.
    // A "few distinct glyphs" assertion passes either way, which is what let the
    // mutation survive. What separates them is *which* glyph.
    const mid = Math.floor((DITHER_ASCII.length - 1) / 2); // cells-ok — a ramp index
    for (const ch of new Set(striped.join(""))) {
      const at = DITHER_ASCII.indexOf(ch);
      expect(Math.abs(at - mid), `${JSON.stringify(ch)} is mid-ramp, not an extreme`).toBeLessThanOrEqual(2);
    }
  });
});
