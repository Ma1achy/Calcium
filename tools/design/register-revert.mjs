// Registers `↺` as a glyph record on ruling 17 (C09 I114).
//
// **A one-shot, kept for `supersede-rulings.mjs`'s reason**: the registry is the
// normative source and the edit has to be auditable after it has run. The ASCII
// half `<` is the batch proposal; if it is not approved, the record's `ascii` is
// the one field that changes.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(here, "../../docs/design/language/calcium-registry.json");

const raw = readFileSync(registryPath, "utf8");
const registry = JSON.parse(raw);
const serialise = (r) => `${JSON.stringify(r, null, 2)}\n`;
let failed = 0;
const fail = (m) => { console.error("  " + m); failed += 1; };

if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2 — nothing written");
if (registry.glyphs.some((g) => g.id === "revert")) fail("`revert` already exists — this script has run");
if (registry.glyphs.some((g) => g.unicode === "↺")) fail("`↺` already has a record");
const inlineAscii = registry.glyphs
  .filter((g) => g.collisionDomains.some((d) => d === "inline" || d === "row-lead"))
  .map((g) => g.ascii);
if (inlineAscii.includes("<")) fail("`<` is already spent in the content row");
const template = registry.glyphs.find((g) => g.id === "meter-fill");
if (template === undefined) fail("no `meter-fill` record to take the shape from");
if (failed > 0) { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); }

const record = {
  id: "revert",
  unicode: "↺",
  ascii: "<",
  semanticRole: "undo affordance",
  tone: "accent",
  widthByCapability: { unicode: 1, ascii: 1 },
  reservedCells: 1,
  collisionDomains: ["inline"],
  accessibleName: "undo affordance",
  status: "current",
  ruleIds: ["R-GLY-003"],
  canonical: true,
  widthClass: "ambiguous",
};
// The same keys, in the same order, as a record already in the file.
const want = Object.keys(template).filter((k) => k in record);
if (JSON.stringify(Object.keys(record)) !== JSON.stringify(want)) {
  console.error(`FAIL · key order ${JSON.stringify(Object.keys(record))} against ${JSON.stringify(want)}`);
  process.exit(1);
}
registry.glyphs.push(record);
writeFileSync(registryPath, serialise(registry));
console.log(`registered revert ↺ / <; glyphs now ${String(registry.glyphs.length)}`);
