import { painter } from "../test/support/pty.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { atCsiBoundary, sanitizeForPainter, trackAndTranslateCursor } from "./capture-foreign.mjs";

const dir = process.argv[2];
const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
const rawBytes = readFileSync(join(dir, "raw.bin"));
const timings = readFileSync(join(dir, "timings.jsonl"), "utf8").split("\n").filter((l) => l).map((l) => JSON.parse(l));

const paint = painter(meta.cols, meta.rows);
const cursor = { row: 0, col: 0, saved: null };
const decoder = new TextDecoder("utf-8");
let held = "";
let pos = 0;
const snapshots = [];
for (const { tMs, len } of timings) {
  const chunk = decoder.decode(rawBytes.subarray(pos, pos + len), { stream: true });
  pos += len;
  const { ready, partial } = atCsiBoundary(held + chunk);
  held = partial;
  const translated = trackAndTranslateCursor(ready, cursor);
  const { clean } = sanitizeForPainter(translated);
  paint.apply(clean);
  snapshots.push({ tMs, rows: paint.rows() });
}
const at = Number(process.argv[3] ?? snapshots.length - 1);
console.log(`frame ${at} of ${snapshots.length}, t=${snapshots[at].tMs.toFixed(0)}ms`);
snapshots[at].rows.forEach((r, i) => {
  if (r.trim()) console.log(`${String(i).padStart(2)}: ${JSON.stringify(r)}`);
});
