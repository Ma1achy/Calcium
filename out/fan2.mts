import { defaultKeymap, keyText } from "/workspace/src/interaction/router/keymap.js";
import { readFileSync } from "node:fs";
const reg = JSON.parse(readFileSync("/workspace/docs/design/language/calcium-registry.json", "utf8"));
const CHORD: Record<string, string> = {
  "⏎": "return", "⇧⏎": "s+return", "esc": "escape", "⇥": "tab", "⇧⇥": "s+tab",
  "↑": "up", "↓": "down", "←": "left", "→": "right",
  "⇧↑": "s+up", "⇧↓": "s+down", "⇧←": "s+left", "⇧→": "s+right",
  "⌃⇧C": "cs+c", "⌃⇧V": "cs+v", "⌃C": "c+c", "F1": "f1", "?": "?",
  "⌃⇥": "c+tab", "⌃⇧⇥": "cs+tab",
  "⌘1": "u+1", "⌘2": "u+2", "⌘3": "u+3", "⌘4": "u+4", "⌘5": "u+5",
  "⌘6": "u+6", "⌘7": "u+7", "⌘8": "u+8", "⌘9": "u+9",
  "⌥↑": "m+up", "⌥↓": "m+down", "⌘↑": "u+up", "⌘↓": "u+down",
  "⌥p": "m+p", "⌥v": "m+v", "⌥⌫": "m+backspace", "⌥⇧C": "m+C", "⌥⇧V": "m+V",
};
const covered = new Set(Object.values(CHORD));
const uncovered = defaultKeymap.filter((r) => !covered.has(keyText(r.key)));
console.log(`tree rows: ${defaultKeymap.length}`);
console.log(`  chord appears in the registry:     ${defaultKeymap.length - uncovered.length}`);
console.log(`  chord appears nowhere in registry: ${uncovered.length}`);
const byT: Record<string, number> = {};
for (const r of uncovered) byT[r.target] = (byT[r.target] ?? 0) + 1;
console.log("  their targets:", JSON.stringify(byT));
console.log("  a sample:", uncovered.slice(0, 12).map((r) => `${r.target} ${keyText(r.key)}→${r.action}`).join(", "));
// registry bindings with no tree row at all
for (const b of reg.bindings) {
  if (b.kind !== "key") continue;
  const slot = CHORD[b.chord];
  if (slot === undefined || defaultKeymap.some((r) => keyText(r.key) === slot)) continue;
  console.log(`  NO TREE ROW: ${b.actionId} ${b.chord}`);
}
