import { defaultKeymap, keyText } from "/workspace/src/interaction/router/keymap.js";
import { readFileSync, writeFileSync } from "node:fs";
const rows = defaultKeymap
  .map((b) => `${b.target}\t${keyText(b.key)}\t${b.action}\t${b.profile ?? "both"}`)
  .sort();
writeFileSync("/workspace/out/keymap-after.tsv", rows.join("\n") + "\n");
const before = readFileSync("/workspace/out/keymap-before.tsv", "utf8").trim().split("\n");
const after = rows;
console.log("before:", before.length, "after:", after.length);
const same = before.join("\n") === after.join("\n");
console.log("identical:", same);
if (!same) {
  const b = new Set(before), a = new Set(after);
  for (const r of before) if (!a.has(r)) console.log("  LOST", r);
  for (const r of after) if (!b.has(r)) console.log("  GAINED", r);
}
