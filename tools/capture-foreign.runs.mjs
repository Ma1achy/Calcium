import { painter } from "../test/support/pty.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { atCsiBoundary, sanitizeForPainter, trackAndTranslateCursor } from "./capture-foreign.mjs";
import { parseLine } from "./catalogue-png.mjs";

const dir = process.argv[2];
const row = Number(process.argv[3]);
const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
const rawBytes = readFileSync(join(dir, "raw.bin"));
const timings = readFileSync(join(dir, "timings.jsonl"), "utf8").split("\n").filter((l) => l).map((l) => JSON.parse(l));

const paint = painter(meta.cols, meta.rows);
const cursor = { row: 0, col: 0, saved: null };
const decoder = new TextDecoder("utf-8");
let held = "";
let pos = 0;
let lastRow = null;
let frameIdx = 0;
for (const { tMs, len } of timings) {
  const chunk = decoder.decode(rawBytes.subarray(pos, pos + len), { stream: true });
  pos += len;
  const { ready, partial } = atCsiBoundary(held + chunk);
  held = partial;
  const translated = trackAndTranslateCursor(ready, cursor);
  const { clean } = sanitizeForPainter(translated);
  paint.apply(clean);
  const styled = paint.styled()[row];
  if (styled !== lastRow) {
    lastRow = styled;
    const spans = parseLine(styled).filter((s) => s.text.trim().length > 0);
    console.log(`--- frame ${frameIdx} t=${tMs.toFixed(0)}ms`);
    for (const s of spans) console.log(`  ${JSON.stringify(s.text)} colour=${s.colour} bg=${s.background}`);
  }
  frameIdx += 1;
}
