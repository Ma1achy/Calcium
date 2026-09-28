// Registers the `trend-flat` glyph — a reading that held (question 37; C09 I111,
// C11 I30).
//
//     node tools/design/register-trend-flat.mjs [--dir <dir>]
//
// **A one-shot, kept for `register-sel.mjs`'s reason**: the registry is the
// normative source and the edit has to be auditable after it has run.
//
// **It lands with the tree's `trendFlat` slot, never alone.** SS65 refuses a
// current record the tree cannot draw, and T2.189 reads every current record
// through its home — the same reason `trend-up` and `trend-down` landed with
// their `GlyphSet` members (C09 I111).
//
// **The record is `trend-down`'s with four fields changed**: the characters, the
// role and the accessible name. Every other field — tone, width, reservation,
// domain, rule, class — is the pair's, asserted rather than restated, so a
// flat trend cannot differ from a moving one in anything but what it says.
//
// **Every write is asserted**: a run on a registry that already holds the record
// is a no-op that says so, and anything else that does not match exits non-zero
// having written nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dirAt = args.indexOf("--dir");
const dir = dirAt >= 0 ? resolve(args[dirAt + 1]) : resolve(here, "../../docs/design/language");
const registryPath = join(dir, "calcium-registry.json");

const raw = readFileSync(registryPath, "utf8");
const registry = JSON.parse(raw);
const serialise = (r) => `${JSON.stringify(r, null, 2)}\n`;
let failed = 0;
const fail = (m) => { console.error(`  ${m}`); failed += 1; };
const stop = () => { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); };

const ID = "trend-flat";
const UNICODE = "→";
const ASCII = "=";

if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2");
if (registry.glyphs.some((g) => g.id === ID)) {
  console.log(`already registered · ${ID} present, nothing written`);
  process.exit(0);
}
const at = registry.glyphs.findIndex((g) => g.id === "trend-down");
const template = registry.glyphs[at];
if (template === undefined) fail("no trend-down to take the shape from");
else {
  if (template.unicode !== "↓" || template.ascii !== "V") fail(`trend-down is ${template.unicode}/${template.ascii}, not ↓/V`);
  if (JSON.stringify(template.collisionDomains) !== JSON.stringify(["inline"])) fail("trend-down is not in the inline domain alone");
  if (JSON.stringify(template.ruleIds) !== JSON.stringify(["R-COL-006"])) fail("trend-down does not cite R-COL-006 alone");
}
// Neither half is spent on another record: the Unicode half anywhere, and the
// ASCII half anywhere a content row can meet it (SS64 decides the domains; this
// is the registry's own half of the question).
for (const g of [...registry.glyphs, ...registry.delimiters]) {
  if (g.unicode === UNICODE) fail(`${g.id} already draws ${UNICODE}`);
  if (g.ascii === ASCII) fail(`${g.id} already draws ${ASCII} at ASCII`);
}
if (failed > 0) stop();

const record = {
  ...template,
  id: ID,
  unicode: UNICODE,
  ascii: ASCII,
  semanticRole: "trend held",
  accessibleName: "unchanged",
};
if (JSON.stringify(Object.keys(record)) !== JSON.stringify(Object.keys(template))) {
  fail(`key order ${JSON.stringify(Object.keys(record))} against ${JSON.stringify(Object.keys(template))}`);
  stop();
}
const changed = Object.keys(record).filter((k) => JSON.stringify(record[k]) !== JSON.stringify(template[k]));
if (JSON.stringify(changed) !== JSON.stringify(["id", "unicode", "ascii", "semanticRole", "accessibleName"])) {
  fail(`changed fields ${JSON.stringify(changed)}`);
  stop();
}
registry.glyphs.splice(at + 1, 0, record);
writeFileSync(registryPath, serialise(registry));

// Read back: the write is the claim, and this is what checks it.
const after = JSON.parse(readFileSync(registryPath, "utf8"));
const landed = after.glyphs.findIndex((g) => g.id === ID);
if (landed !== at + 1 || after.glyphs[landed].unicode !== UNICODE || after.glyphs[landed].ascii !== ASCII) {
  console.error(`FAIL · ${ID} did not land beside trend-down`);
  process.exit(1);
}
console.log(`registered ${ID} (${UNICODE} / ${ASCII}); glyphs now ${String(after.glyphs.length)}`);
