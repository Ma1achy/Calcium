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
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { decodePng, ditherAscii, ditherBraille, bayer, luminance, type Pixels } from "../../src/presentation/image/index.js";

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
    const out = "/tmp/id2.png";
    const bytes = png(
      `const s=require("sharp");const w=32,h=16;const b=Buffer.alloc(w*h*4);` +
        `for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;b[i]=x*8;b[i+1]=y*16;b[i+2]=128;b[i+3]=255;}` +
        `s(b,{raw:{width:w,height:h,channels:4}}).png().toFile(${JSON.stringify(out)}).then(()=>0)`,
      out,
    );
    const r = decodePng(bytes);
    expect(r.ok, r.ok ? "" : r.fault).toBe(true);
    if (!r.ok) return;
    expect([r.pixels.width, r.pixels.height]).toEqual([32, 16]);
    for (const [x, y] of [[0, 0], [31, 0], [0, 15], [31, 15], [17, 9]] as const) {
      const i = (y * 32 + x) * 4;
      expect([r.pixels.data[i], r.pixels.data[i + 1]], `at ${String(x)},${String(y)}`).toEqual([x * 8, y * 16]);
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
  });
});
