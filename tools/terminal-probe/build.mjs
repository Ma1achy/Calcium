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

// --- the replace case, because six documents assert it and none measured it --
//
// **`a=T` at a stable id replaces the image at that id** is written in
// `kitty.ts:12`, `transmit-image.ts:62`, C09 §4c:834, `c09-image.mjs:114` and
// FINDINGS twice — six statements across four files, every one of them ours,
// none citing kitty's documentation and none citing a reading. *Repetition
// across documents is not corroboration*: six restatements of an unmeasured
// claim are one unmeasured claim.
//
// **F421 rests on it and cannot.** That finding's other half — our path derives
// the id rather than passing it — is measured, at four call sites. This half
// never has been, and the two fail differently: a protocol refusal would close
// the question, and a derivation we wrote would not.
//
// **The probe could not have answered it before now.** Every case above gets
// `imageId(imageKey(block))`, a digest, so no two transmissions in this file
// have ever shared an id; the only fixed one is the control's hand-rolled 909.
//
// **What this measures and what it does not.** The manifest loop transmits and
// reads the reply, so it answers *does the terminal refuse a second transmission
// at a live id* — an error here is the protocol saying no. It does not answer
// *which picture is displayed*, which needs a placement in front of a human;
// `replace.place` is written for exactly that and the driver's case reads it.
//
// Two pictures nobody could confuse — a sixteen-colour swatch and a photograph —
// so the reading is which one appears rather than whether anything changed.
{
  const ID = 911;
  for (const [name, file] of [["replace-a.png", "palette.png"], ["replace-b.png", "photo.png"]]) {
    const block = b.image({ id: `x-${file}`, path: join(ASSETS, file), height: 8, alt: file });
    const box = imageCells(block, WIDTH);
    const real = transmitImage([block], KITTY, new Set(), WIDTH);
    // The id is substituted the way `q=2 → q=0` is, and asserted the same way.
    // `,i=N,` cannot occur in the payload: base64 carries no commas.
    const derived = `,i=${String(imageId(imageKey(block)))},`;
    const hits = real.split(derived).length - 1;
    if (hits !== 1) throw new Error(`${name}: expected exactly one ${derived}, found ${String(hits)}`);
    const held = real.split("q=2").join("q=0").split(derived).join(`,i=${String(ID)},`);
    if (held === real) throw new Error(`${name}: the id substitution changed nothing`);
    if (held.includes(derived)) throw new Error(`${name}: a derived id survived the substitution`);
    writeFileSync(join(OUT, `${name}.transmit`), held);
    manifest.push({
      file: name, cols: box.cols, rows: box.rows, bytes: held.length, placement: "ok",
      why: `THE REPLACE PAIR — both at i=${String(ID)}; an error here is the protocol refusing`,
    });
    // The second one's geometry is what a working replace should display.
    if (name === "replace-b.png") {
      const placed = placementRows(ID, box.cols, box.rows);
      writeFileSync(join(OUT, "replace.place"), "rows" in placed ? placed.rows.join("\n") : "");
      console.log(`replace pair      both at i=${String(ID)}, place ${String(box.cols)}x${String(box.rows)}`);
    }
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
}
