import { readFileSync } from "node:fs";
const reg = JSON.parse(readFileSync("/workspace/docs/design/language/calcium-registry.json", "utf8"));

const NAMED: Record<string, string> = {
  "⏎": "enter", "esc": "escape", "⇥": "tab", "↑": "up", "↓": "down",
  "←": "left", "→": "right", "⌫": "backspace", "F1": "f1", "?": "?",
};
type Key = { name: string; ctrl?: true; meta?: true; shift?: true; super?: true };

function parse(chord: string): Key | null {
  let rest = chord;
  const mods: Partial<Key> = {};
  for (;;) {
    if (rest.startsWith("⌃")) { mods.ctrl = true; rest = rest.slice(1); continue; }
    if (rest.startsWith("⌥")) { mods.meta = true; rest = rest.slice(1); continue; }
    if (rest.startsWith("⌘")) { mods.super = true; rest = rest.slice(1); continue; }
    if (rest.startsWith("⇧")) { mods.shift = true; rest = rest.slice(1); continue; }
    break;
  }
  const named = NAMED[rest];
  if (named !== undefined) return { name: named, ...mods };
  if (rest.length === 1) {
    // A bare letter with ⇧ is the shifted character and sets no shift bit — ESC C.
    if (mods.shift === true && /[A-Za-z]/u.test(rest) && mods.meta === true) {
      const { shift: _drop, ...m } = mods;
      return { name: rest.toUpperCase(), ...m };
    }
    return { name: rest.toLowerCase(), ...mods };
  }
  return null;
}

let ok = 0;
for (const b of reg.bindings) {
  if (b.kind !== "key") continue;
  const k = parse(b.chord);
  if (k === null) console.log(`UNPARSED ${b.actionId} ${b.chord}`);
  else { ok += 1; console.log(`${b.chord.padEnd(6)} → ${JSON.stringify(k)}`); }
}
console.log(`parsed ${ok}`);
