import { defaultKeymap, keyText } from "/workspace/src/interaction/router/keymap.js";
import { readFileSync } from "node:fs";

const reg = JSON.parse(readFileSync("/workspace/docs/design/language/calcium-registry.json", "utf8"));

/** Registry chord → the tree's keyText spelling. Hand-written, and that is the point. */
const CHORD: Record<string, string> = {
  "⏎": "return", "⇧⏎": "s+return", "esc": "escape", "⇥": "tab", "⇧⇥": "s+tab",
  "↑": "up", "↓": "down", "←": "left", "→": "right",
  "⇧↑": "s+up", "⇧↓": "s+down", "⇧←": "s+left", "⇧→": "s+right",
  "⌃⇧C": "cs+c", "⌃⇧V": "cs+v", "⌃C": "c+c", "F1": "f1", "?": "?",
  "⌃⇥": "c+tab", "⌃⇧⇥": "cs+tab",
  "⌘1": "u+1", "⌘2": "u+2", "⌘3": "u+3", "⌘4": "u+4", "⌘5": "u+5",
  "⌘6": "u+6", "⌘7": "u+7", "⌘8": "u+8", "⌘9": "u+9",
  "⌥↑": "m+up", "⌥↓": "m+down", "⌘↑": "u+up", "⌘↓": "u+down",
  "⌥p": "m+p", "⌥v": "m+v", "⌥⌫": "m+backspace",
  "⌥⇧C": "m+C", "⌥⇧V": "m+V",
};

let oneToOne = 0, oneToMany = 0, unmatched = 0;
const fan: string[] = [];
for (const b of reg.bindings) {
  if (b.kind !== "key") continue;
  const slot = CHORD[b.chord];
  if (slot === undefined) { unmatched += 1; fan.push(`UNMAPPED ${b.chord}`); continue; }
  const rows = defaultKeymap.filter((r) => keyText(r.key) === slot);
  const targets = [...new Set(rows.map((r) => r.target))];
  const actions = [...new Set(rows.map((r) => r.action))];
  if (rows.length === 0) unmatched += 1;
  else if (rows.length === 1) oneToOne += 1;
  else { oneToMany += 1; fan.push(`${b.actionId.padEnd(20)} ${b.chord.padEnd(5)} scope=${String(b.scope).padEnd(10)} when=${String(b.when)}  →  ${rows.length} rows / ${targets.length} targets / ${actions.length} actions: ${actions.join(", ")}`); }
}
console.log(`registry key bindings: ${reg.bindings.filter((b: {kind: string}) => b.kind === "key").length}`);
console.log(`  one tree row:      ${oneToOne}`);
console.log(`  many tree rows:    ${oneToMany}`);
console.log(`  no tree row:       ${unmatched}`);
console.log();
for (const l of fan) console.log(l);
