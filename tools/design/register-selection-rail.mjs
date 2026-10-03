// Registers the `▌` selection rail as a glyph record, and its `gutter`
// collision domain, on ruling 68 (C14 I57, I58).
//
// **A one-shot, kept for `supersede-rulings.mjs`'s reason**: the registry is the
// normative source and the edit has to be auditable after it has run.
// `R-THM-005` already names the mark — *its second is the `▌` selection rail
// (§017), a mark in the gutter's domain and not the prompt's caret* — and no
// record or domain existed for it. The ASCII half `|` is ruling 68's.
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
if (registry.glyphs.some((g) => g.id === "selection-rail")) fail("`selection-rail` already exists — this script has run");
if (registry.glyphs.some((g) => g.unicode === "▌")) fail("`▌` already has a record");
if ("gutter" in registry.collisionDomains) fail("the `gutter` domain already exists");
if (!registry.rules.some((r) => r.id === "R-THM-005" && r.status === "current" && r.text.includes("selection rail"))) {
  fail("R-THM-005 no longer names the selection rail — the record would cite a rule that does not ask for it");
}
const template = registry.glyphs.find((g) => g.id === "revert");
if (template === undefined) fail("no `revert` record to take the shape from");
if (failed > 0) { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); }

const record = {
  id: "selection-rail",
  unicode: "▌",
  ascii: "|",
  semanticRole: "selection rail",
  tone: "accent",
  widthByCapability: { unicode: 1, ascii: 1 },
  reservedCells: 1,
  collisionDomains: ["gutter"],
  accessibleName: "selected",
  status: "current",
  ruleIds: ["R-GLY-003", "R-THM-005"],
  canonical: true,
  // U+258C is East Asian Width A, so it is two cells under the wide convention.
  widthClass: "ambiguous",
};
// The same keys, in the same order, as a record already in the file.
const want = Object.keys(template).filter((k) => k in record);
if (JSON.stringify(Object.keys(record)) !== JSON.stringify(want)) {
  console.error(`FAIL · key order ${JSON.stringify(Object.keys(record))} against ${JSON.stringify(want)}`);
  process.exit(1);
}
registry.glyphs.push(record);
registry.collisionDomains.gutter = {
  contains: [],
  note: "column 0 of the transcript region, which the frame reserves on every row for the selection rail (ruling 68). Not inside `content-row`: the rail stands beside a row's lead, never in it, so a quote rail's or a tree guide's `|` one column along is a different column.",
  figure: false,
};
writeFileSync(registryPath, serialise(registry));

// **Asserted after the write**, so a script that changed nothing cannot report success.
const back = JSON.parse(readFileSync(registryPath, "utf8"));
if (!back.glyphs.some((g) => g.id === "selection-rail" && g.unicode === "▌" && g.ascii === "|")) {
  console.error("FAIL · the record is not in the file after the write");
  process.exit(1);
}
if (back.collisionDomains.gutter === undefined) {
  console.error("FAIL · the domain is not in the file after the write");
  process.exit(1);
}
console.log(`registered selection-rail ▌ / | in gutter; glyphs now ${String(back.glyphs.length)}`);
