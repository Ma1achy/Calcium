// Build the terminal probe's byte files from the SHIPPED encoder.
//
// **Captured, not rebuilt.** `transmitImage` is called for real and its output
// used verbatim except for one token: `q=2` suppresses every response the
// terminal would send, including errors, so a probe that wants an answer has to
// ask for one. The substitution is asserted, because a script reporting success
// having changed nothing is a failure (CLAUDE.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { b } from "../../dist/shell/builders/index.js";
import { transmitImage } from "../../dist/shell/transmit-image.js";
import { imageCells } from "../../dist/presentation/blocks/kinds/image.js";
import { imageId, imageKey, placementRows } from "../../dist/presentation/image/kitty.js";

const OUT = "/workspace/tools/terminal-probe/bytes";
const ASSETS = "/workspace/examples/plots/assets";
mkdirSync(OUT, { recursive: true });

const KITTY = {
  colourDepth: 24, unicode: "full", ambiguousWidth: "narrow",
  backgroundPolarity: "dark", synchronisedUpdate: true, bracketedPaste: true,
  mouse: true, imageProtocol: "kitty", altScreen: true,
};

const WIDTH = 80;
const CASES = [
  ["palette.png", 8, "CONTROL — our decoder reads this one"],
  ["photo.png", 10, "CONTROL — ordinary 8-bit RGB, 2000x1500"],
  ["depth16.png", 6, "we refuse: bit depth 16"],
  ["interlaced.png", 6, "we refuse: Adam7"],
];

const manifest = [];
for (const [file, height, why] of CASES) {
  const block = b.image({ id: `p-${file}`, path: join(ASSETS, file), height, alt: file });
  const box = imageCells(block, WIDTH);
  const real = transmitImage([block], KITTY, new Set(), WIDTH);
  if (real === "") throw new Error(`${file}: transmitImage produced nothing`);
  if (!real.includes("q=2")) throw new Error(`${file}: expected q=2 in the shipped escape`);
  const asking = real.split("q=2").join("q=0");
  if (asking === real) throw new Error(`${file}: the q substitution changed nothing`);

  const placed = placementRows(imageId(imageKey(block)), box.cols, box.rows);
  writeFileSync(join(OUT, `${file}.transmit`), asking);
  writeFileSync(join(OUT, `${file}.place`), "rows" in placed ? placed.rows.join("\n") : "");
  manifest.push({
    file, why, cols: box.cols, rows: box.rows,
    bytes: real.length,
    placement: "rows" in placed ? "ok" : placed.fault,
  });
  console.log(`${file.padEnd(16)} box=${String(box.cols)}x${String(box.rows)}  escape=${String(real.length)}B  ${"rows" in placed ? "placed" : "REFUSED"}`);
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

// A bare placeholder row, for the width measurement — one cell each, is the claim.
const oneRow = placementRows(1, 20, 1);
writeFileSync(join(OUT, "twenty-cells.txt"), "rows" in oneRow ? oneRow.rows[0] : "");
console.log("\nwrote", OUT);

// --- the control, without which every OK above is unreadable ----------------
//
// **A probe that answers OK to everything measures nothing.** `a=T` reporting
// success for a 16-bit PNG is evidence only if the same path reports failure for
// bytes that are not a picture. So: a real PNG with its IDAT scrambled — our own
// decoder calls that *IDAT does not inflate*, and a terminal that still says OK
// is a terminal not decoding at the moment it answers.
import { readFileSync } from "node:fs";
{
  const good = readFileSync(join(ASSETS, "palette.png"));
  const bad = Buffer.from(good);
  const at0 = Math.floor(bad.length * 0.6);
  for (let i = at0; i < at0 + 64; i += 1) bad[i] = (bad[i] ?? 0) ^ 0xff;
  if (bad.equals(good)) throw new Error("the corruption changed nothing");
  const ESC = String.fromCharCode(27);
  const ST = ESC + String.fromCharCode(92);
  const b64 = bad.toString("base64");
  const opts = "a=T,f=100,t=d,i=909,U=1,c=16,r=8,q=0";
  const CHUNK = 4096;
  let out = "";
  for (let at = 0; at < b64.length; at += CHUNK) {
    const piece = b64.slice(at, at + CHUNK);
    const more = at + CHUNK < b64.length ? 1 : 0;
    const head = at === 0 ? `${opts},m=${String(more)}` : `m=${String(more)}`;
    out += `${ESC}_G${head};${piece}${ST}`;
  }
  writeFileSync(join(OUT, "corrupt.png.transmit"), out);
  manifest.push({
    file: "corrupt.png",
    why: "THE CONTROL — a real PNG with its IDAT scrambled; this MUST fail",
    cols: 16, rows: 8, bytes: out.length, placement: "ok",
  });
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("corrupt.png      control written, " + String(out.length) + "B");
}
