/**
 * A normative registry edit: `mono`'s `accent` moves off `#fff`.
 *
 * **The design was wrong here and this records the correction at source.** `mono`
 * shipped `accent: #fff` and `error: #ffffff` — one colour in two spellings — so a
 * warning and an error rendered identically at 24-bit, which is exactly what C10's
 * *two slots of one palette must not render as one another* exists to stop. A
 * monochrome theme has no hue to distinguish with, but it has luminance, and `mono`
 * was spending white twice while nothing sat between `#d0d0d0` and `#e0e0e0`.
 *
 * `error` keeps white, because it should be the loudest thing on the ramp.
 *
 * **Asserted by value, not by replacement count.** A script that reports success
 * having changed nothing is a failure, so this throws unless the old value is what
 * it expects AND the whole tone palette comes out with ten distinct values.
 */
import { readFileSync, writeFileSync } from "node:fs";

const path = "docs/design/language/calcium-registry.json";
const registry = JSON.parse(readFileSync(path, "utf8"));

let hits = 0;
for (const rule of registry.themeRules) {
  if (rule.selector !== '[data-theme="mono"] .c-accent') continue;
  if (rule.declarations !== "color:#fff") throw new Error(`unexpected value: ${rule.declarations}`);
  rule.declarations = "color:#f0f0f0";
  hits += 1;
}
if (hits !== 1) throw new Error(`expected exactly one mono .c-accent rule, changed ${hits}`);

const norm = (hex) => {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
};
const tones = new Map();
for (const rule of registry.themeRules) {
  const match = rule.selector.match(/^\[data-theme="mono"\] \.c-([a-zA-Z]+)$/);
  if (match === null) continue;
  const colour = rule.declarations.match(/color:(#[0-9a-fA-F]+)/);
  if (colour !== null) tones.set(match[1], norm(colour[1]));
}
const TONE = ["default", "dim", "muted", "ok", "warn", "error", "info", "accent", "meta", "identifier"];
const values = TONE.map((t) => tones.get(t));
if (new Set(values).size !== TONE.length) {
  throw new Error(`mono tones still collide: ${values.join(" ")}`);
}

const asciiOnly = (text) => text.replace(/[-￿]/g, (c) =>
  `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`);
writeFileSync(path, `${asciiOnly(JSON.stringify(registry, null, 1))}\n`);
console.log(`mono .c-accent #fff -> #f0f0f0 · ${new Set(values).size} distinct of ${TONE.length} tones`);
