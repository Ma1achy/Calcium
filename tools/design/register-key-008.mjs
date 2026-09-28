// Registers R-KEY-008 — the `>` palette's limit (ruling 45, corrected by ruling 67;
// C16 I68).
//
//     node tools/design/register-key-008.mjs [--dir <dir>]
//
// **A one-shot, kept for `register-sel.mjs`'s reason**: the registry is the
// normative source and the edit has to be auditable after it has run. The digest
// is the builder's own `ruleContentDigest`, so the two cannot disagree.
//
// **It lands with its ledger row, never alone.** `tools/rule-status.mjs` check 1
// compares the registry's current rules with `RULE_LEDGER.md`'s rows by equality,
// so a registry carrying R-KEY-008 without the row fails `make enforce` — measured
// on this lane before the script was handed over. Then `release.mjs 0.14` seals it.
//
// **Every write is asserted**: a run on a registry that already holds the rule is a
// no-op that says so, and anything else that does not match exits non-zero having
// written nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleContentDigest } from "../../docs/design/language/build-calcium.mjs";

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

const ID = "R-KEY-008";
const SECTION = "five-primitives-the-harness-never-needed-105";

if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2");
if (registry.rules.some((r) => r.id === ID)) {
  console.log(`already registered · ${ID} present, nothing written`);
  process.exit(0);
}
// The next free id, asserted rather than assumed: a later R-KEY rule means this
// number was spent by someone else and the ledger row names the wrong rule.
const keyIds = registry.rules.map((r) => r.id).filter((id) => id.startsWith("R-KEY-")).sort();
if (keyIds.at(-1) !== "R-KEY-007") fail(`the last R-KEY id is ${String(keyIds.at(-1))}, not R-KEY-007`);
if (!registry.sections.some((s) => s.key === SECTION)) fail(`section ${SECTION} missing`);
const template = registry.rules.find((r) => r.id === "R-KEY-007");
if (template === undefined) fail("no R-KEY-007 to take the shape from");
if (failed > 0) stop();

const rule = {
  id: ID,
  title: "The palette opens on a leading >, and a >-led line is never a command",
  text:
    "A > typed as the first character of the line switches the prompt's menu from verbs to " +
    "actions, and the query is the text after it; a > anywhere else is text and means what the " +
    "shell means by it. A line whose first character is > is never handed to the parser or the " +
    "shell: it runs the action it names, or says there is none and keeps the line.",
  status: "current",
  sectionKey: SECTION,
  tags: ["interaction"],
  supersedes: [],
  supersededBy: null,
  legacyIds: [],
  contentDigest: "",
};
rule.contentDigest = ruleContentDigest(rule);
// The same keys, in the same order, as a rule already in the file.
if (JSON.stringify(Object.keys(rule)) !== JSON.stringify(Object.keys(template))) {
  fail(`key order ${JSON.stringify(Object.keys(rule))} against ${JSON.stringify(Object.keys(template))}`);
  stop();
}
registry.rules.push(rule);
writeFileSync(registryPath, serialise(registry));

// Read back: the write is the claim, and this is what checks it.
const after = JSON.parse(readFileSync(registryPath, "utf8"));
const landed = after.rules.find((r) => r.id === ID);
if (landed === undefined || landed.contentDigest !== ruleContentDigest(landed)) {
  console.error(`FAIL · ${ID} did not land with a matching digest`);
  process.exit(1);
}
console.log(`registered ${ID}; rules now ${String(after.rules.length)}`);
