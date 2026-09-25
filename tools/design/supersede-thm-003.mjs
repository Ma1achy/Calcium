// Supersedes R-THM-003 on ruling 33: the ground is selection's only
// *ground-level* carrier, and the `▌` selection rail is its second (§017).
//
// **A one-shot, kept for `supersede-rulings.mjs`'s reason**: the registry is the
// normative source, `contentDigest` comes from the builder's own
// `ruleContentDigest`, and the edit has to be auditable after it has run.
//
// **The text changes in one clause and nothing else**, and the script asserts
// that: the old clause is present exactly once, and the successor's text is the
// old text with that clause replaced. A rewording smuggled in beside the ruling
// would be a second decision nobody took.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleContentDigest } from "../../docs/design/language/build-calcium.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(here, "../../docs/design/language/calcium-registry.json");

const OLD = "R-THM-003";
const NEXT = "R-THM-005";
const CLAUSE = "the selection band keeps 3 : 1 against the page, because the ground is selection's only carrier;";
const REPLACEMENT =
  "the selection band keeps 3 : 1 against the page, because the ground is selection's only ground-level " +
  "carrier — its second is the `▌` selection rail (§017), a mark in the gutter's domain and not the " +
  "prompt's caret;";

const raw = readFileSync(registryPath, "utf8");
const registry = JSON.parse(raw);
const serialise = (r) => `${JSON.stringify(r, null, 2)}\n`;
let failed = 0;
const fail = (m) => { console.error("  " + m); failed += 1; };

if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2 — nothing written");
const byId = new Map(registry.rules.map((r) => [r.id, r]));
const old = byId.get(OLD);
if (old === undefined) fail(`${OLD} missing`);
else if (old.status === "superseded") fail(`${OLD} is already superseded — this script has run`);
else if (old.text.split(CLAUSE).length !== 2) fail(`${OLD}'s text does not carry the clause exactly once`);
if (byId.has(NEXT)) fail(`${NEXT} already exists`);
if (failed > 0) { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); }

const next = {
  id: NEXT,
  title: old.title,
  text: old.text.replace(CLAUSE, REPLACEMENT),
  status: "current",
  sectionKey: old.sectionKey,
  tags: old.tags,
  supersedes: [OLD],
  supersededBy: null,
  ...(old.condensedGroup === undefined ? {} : { condensedGroup: old.condensedGroup }),
  legacyIds: [],
  contentDigest: "",
};
next.contentDigest = ruleContentDigest(next);
old.status = "superseded";
old.supersededBy = NEXT;
registry.rules.splice(registry.rules.indexOf(old) + 1, 0, next);

// Citations move to the successor, counted so an expected one that was not found
// is visible. The sections' own blocks name their records, not rules, and stay.
let moved = 0;
const walk = (node) => {
  if (Array.isArray(node)) { node.forEach(walk); return; }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "ruleIds" && Array.isArray(value)) {
      node[key] = value.map((id) => (id === OLD ? (moved += 1, NEXT) : id));
    } else if (key !== "rules" && key !== "sectionBlocks") walk(value);
  }
};
walk(registry);

writeFileSync(registryPath, serialise(registry));
console.log(`superseded ${OLD} → ${NEXT}; ${String(moved)} citation(s) moved`);
console.log(`current rules now ${registry.rules.filter((r) => r.status === "current").length}`);
