import { defaultKeymap, keyText } from "/workspace/src/interaction/router/keymap.js";
import { writeFileSync } from "node:fs";
const rows = defaultKeymap
  .map((b) => `${b.target}\t${keyText(b.key)}\t${b.action}\t${b.profile ?? "both"}`)
  .sort();
writeFileSync("/workspace/out/keymap-before.tsv", rows.join("\n") + "\n");
console.log("rows:", rows.length);
