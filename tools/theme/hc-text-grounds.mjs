/**
 * `R-THM-002` over `R-THM-004`'s whole scope — the high-contrast promise, landed
 * on the grounds the scope used to leave out (C10 I60).
 *
 * **The measurement.** Against the 7 : 1 both high-contrast themes declare, the
 * diff grounds and `bgDeep` carried no composed ink at all: `hcDark` sat at
 * 4.77–4.82 on `diffAdd` and 6.08–6.14 on `diffRemove`, `hcLight` at 6.27–6.66
 * and 5.73–6.68, and `tone.meta` under the prompt chip at 6.38 and 6.51. The
 * scope was a list, so nothing reported it.
 *
 * **Two authors, as I46 rules.** The tones are the registry's, so their
 * compositions are registry theme rules — the normative source. `hcDark`'s
 * syntax palette is **lent** from `HIGH_CONTRAST` and the registry holds none,
 * so its compositions are written into the lender beside the values they
 * replace. `hcLight`'s syntax is derived from its tones, and the generator
 * solves that residue itself once it reads the theme's promise (`PROMISES`).
 *
 * **By the least that clears** — `clearFloor`, the move the generator already
 * makes for a derived palette's residue, from `wcag.mjs` so there is one answer
 * to *the least*.
 *
 * **Every replacement asserts it matched** (CLAUDE.md): this exits non-zero and
 * writes nothing if a composition already exists, if a ground or a flat ink is
 * missing, or if an ink cannot reach the floor.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clearFloor, contrast } from "./wcag.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(here, "../../docs/design/language/calcium-registry.json");
const lenderPath = resolve(here, "../../src/presentation/theme/tokens-high-contrast.ts");
const raw = readFileSync(registryPath, "utf8");
const registry = JSON.parse(raw);
/**
 * **The file's own format, proved before anything is written.** The first run
 * of this script serialised at one space where the file is at two, passed a
 * shape check written against its own output, and rewrote 46,000 lines. So the
 * unmodified registry must round-trip byte-identically first.
 */
const serialise = (value) => `${JSON.stringify(value, null, 2)}\n`;
if (serialise(JSON.parse(raw)) !== raw) {
  console.error("FAIL · the registry does not round-trip through this serialiser; nothing written");
  process.exit(1);
}
let lender = readFileSync(lenderPath, "utf8");

const FLOOR = 7;
const THEMES = ["hcDark", "hcLight"];
/** `DIFF_SLOTS`' tones on the diff grounds, and the chip's tone on `bgDeep` (C10 I60). */
const TONE_GROUNDS = [
  ["diffAdd", ["ok", "error", "muted"]],
  ["diffRemove", ["ok", "error", "muted"]],
  ["bgDeep", ["meta"]],
];
const SYNTAX = ["keyword", "string", "comment", "number", "key", "type", "function", "operator", "punctuation"];

let failed = 0;
const fail = (m) => { console.error("  " + m); failed += 1; };
const rule = (selector) => registry.themeRules.find((r) => r.selector === selector);
const hex = (decls, prop) => decls?.match(new RegExp(`${prop}:(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();

// --- 1 · the tones, in the registry --------------------------------------
const added = [];
const report = [];
for (const theme of THEMES) {
  for (const [ground, tones] of TONE_GROUNDS) {
    const groundHex = hex(rule(`[data-theme="${theme}"] .bg-${ground}`)?.declarations, "background");
    if (groundHex === undefined) { fail(`${theme}: no ${ground} ground`); continue; }
    for (const tone of tones) {
      const selector = `[data-theme="${theme}"] .bg-${ground} .c-${tone},[data-theme="${theme}"] .c-${tone}.bg-${ground}`;
      if (rule(selector) !== undefined) { fail(`${theme}: ${tone} already composed on ${ground}`); continue; }
      const flat = hex(rule(`[data-theme="${theme}"] .c-${tone}`)?.declarations, "color");
      if (flat === undefined) { fail(`${theme}: no flat ${tone}`); continue; }
      if (contrast(flat, groundHex) >= FLOOR) continue;
      const ink = clearFloor(flat, groundHex, FLOOR);
      if (ink === null) { fail(`${theme}: ${tone} cannot reach ${FLOOR} : 1 on ${ground}`); continue; }
      added.push({ selector, declarations: `color:${ink}`, status: "current", ruleIds: ["R-THM-001"] });
      report.push(`${theme.padEnd(8)} tone.${tone.padEnd(7)} on ${ground.padEnd(10)} ${flat} ${contrast(flat, groundHex).toFixed(2)} -> ${ink} ${contrast(ink, groundHex).toFixed(2)}`);
    }
  }
}

// --- 2 · hcDark's lent syntax, in the lender -----------------------------
const syntaxAt = lender.indexOf("    syntax: Object.freeze({");
const syntaxBlock = syntaxAt < 0 ? "" : lender.slice(syntaxAt, lender.indexOf("      classes: Object.freeze({", syntaxAt));
const lent = Object.fromEntries(SYNTAX.map((slot) => {
  const m = syntaxBlock.match(new RegExp(`\\n\\s+${slot}: "(#[0-9a-f]{6})"`));
  if (m === null) fail(`HIGH_CONTRAST: no syntax.${slot}`);
  return [slot, m?.[1]];
}));
if (lender.includes("  composed: Object.freeze({")) fail("HIGH_CONTRAST already has a composed record — this script has run");
const composed = {};
for (const ground of ["diffAdd", "diffRemove"]) {
  const groundHex = hex(rule(`[data-theme="hcDark"] .bg-${ground}`)?.declarations, "background");
  for (const slot of SYNTAX) {
    const flat = lent[slot];
    if (flat === undefined || groundHex === undefined) continue;
    if (contrast(flat, groundHex) >= FLOOR) continue;
    const ink = clearFloor(flat, groundHex, FLOOR);
    if (ink === null) { fail(`hcDark: syntax.${slot} cannot reach ${FLOOR} : 1 on ${ground}`); continue; }
    (composed[ground] ??= []).push([slot, ink, contrast(ink, groundHex)]);
    report.push(`hcDark   syntax.${slot.padEnd(11)} on ${ground.padEnd(10)} ${flat} ${contrast(flat, groundHex).toFixed(2)} -> ${ink} ${contrast(ink, groundHex).toFixed(2)}`);
  }
}

if (failed > 0) { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); }

const block =
  `\n  /**\n` +
  `   * **The syntax palette, composed for the diff grounds** (R-THM-002, C10 I60).\n` +
  `   *\n` +
  `   * \`hcDark\` lends its syntax from here and the registry holds none, so the\n` +
  `   * composition that keeps 7 : 1 on a diff row is authored beside the values it\n` +
  `   * replaces (I46). Measured before: 4.78–4.80 on \`diffAdd\`, 6.09–6.12 on\n` +
  `   * \`diffRemove\`. Written by \`tools/theme/hc-text-grounds.mjs\`, the least that clears.\n` +
  `   */\n` +
  `  composed: Object.freeze({\n` +
  Object.entries(composed).map(([ground, inks]) =>
    `    "surface.${ground}": Object.freeze({\n` +
    inks.map(([slot, ink, r]) => `      "syntax.${slot}": "${ink}", // ${r.toFixed(3)} : 1, floor ${FLOOR}\n`).join("") +
    `    }),\n`).join("") +
  `  }),\n`;
const anchor = "\n  fourBit: HIGH_CONTRAST_FOUR_BIT,\n});";
if (lender.split(anchor).length !== 2) { console.error("FAIL · the lender's closing anchor is not unique"); process.exit(1); }
lender = lender.replace(anchor, `${block}${anchor}`);

registry.themeRules.push(...added);
writeFileSync(registryPath, serialise(registry));
writeFileSync(lenderPath, lender);

console.log(`composed ${added.length} registry inks and ${Object.values(composed).flat().length} lent syntax inks`);
for (const line of report) console.log("  " + line);
