/**
 * A PNG encoder for fixtures — **hand-rolled, and every scanline filter used**.
 *
 * **Because a library encoder would not.** `sharp` wrote filter 0 on every row
 * of the gradient fixture — measured, `filters sharp used: 0` — so ID2 asserted
 * against a decoder path it never entered, and a mutation breaking Paeth
 * survived it. Choosing the filters here makes each arm reachable by
 * construction rather than by hoping an encoder picks one.
 *
 * **Colour, because the compositions need pictures rather than textures.** The
 * dither reduces to luminance, so a greyscale fixture and a colour one produce
 * the same braille — but the *composited* arm blends into the channels, and a
 * greyscale fixture cannot tell a correct blend from one that dropped a channel.
 */
import { deflateSync } from "node:zlib";

export type Rgb = readonly [number, number, number];

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xed_b8_83_20 & -(c & 1));
  }
  return ~c;
}

/** An 8-bit RGB PNG, `w` by `h`, cycling the five filter types down the rows. */
export function rgbPng(w: number, h: number, px: (x: number, y: number) => Rgb): Uint8Array {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  const prior = Buffer.alloc(stride);
  for (let y = 0; y < h; y += 1) {
    const kind = y % 5; // 0 None, 1 Sub, 2 Up, 3 Average, 4 Paeth
    const line = Buffer.alloc(stride);
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = px(x, y);
      line[x * 3] = r & 0xff;
      line[x * 3 + 1] = g & 0xff;
      line[x * 3 + 2] = b & 0xff;
    }
    raw[y * (stride + 1)] = kind;
    for (let i = 0; i < stride; i += 1) {
      const cur = line[i] ?? 0;
      const a = i >= 3 ? (line[i - 3] ?? 0) : 0;
      const b = prior[i] ?? 0;
      const c = i >= 3 ? (prior[i - 3] ?? 0) : 0;
      let out = cur;
      if (kind === 1) out = cur - a;
      else if (kind === 2) out = cur - b;
      else if (kind === 3) out = cur - ((a + b) >> 1);
      else if (kind === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        out = cur - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      raw[y * (stride + 1) + 1 + i] = out & 0xff;
    }
    line.copy(prior);
  }
  const chunk = (type: string, body: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tagged = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(tagged) >>> 0);
    return Buffer.concat([len, tagged, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

/** The same, base64, which is what `b.image({ data })` takes. */
export function rgbPng64(w: number, h: number, px: (x: number, y: number) => Rgb): string {
  return Buffer.from(rgbPng(w, h, px)).toString("base64");
}
