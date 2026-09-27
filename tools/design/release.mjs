// Releases the design registry: seals every rule the baseline lacks and bumps the
// revision (AUTHORITY.md §Release).
//
//     node tools/design/release.mjs <revision> [--dir <dir>]
//
// **The one writer of `released-baseline.json`.** A release only adds: an entry
// already sealed is compared, never rewritten, and a run that would change or
// drop one refuses and writes nothing. That is the whole of what makes a
// baseline a record rather than a mirror — a writer that re-derived every entry
// from the registry would seal whatever the registry now says, including the
// rewrite the baseline exists to catch.
//
// **Every write is asserted after the fact** (CLAUDE.md, *an edit script asserts
// every replacement matched*): the files are read back, and the run fails unless
// every `current` rule is sealed and both revisions read the new value.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dirAt = args.indexOf("--dir");
const dir = dirAt >= 0 ? resolve(args[dirAt + 1]) : resolve(here, "../../docs/design/language");
const revision = args.find((a, i) => !a.startsWith("--") && (dirAt < 0 || i !== dirAt + 1));

let failed = 0;
const fail = (m) => { console.error(`  ${m}`); failed += 1; };
const stop = () => { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); };

const registryPath = join(dir, "calcium-registry.json");
const baselinePath = join(dir, "released-baseline.json");
const registryRaw = readFileSync(registryPath, "utf8");
const baselineRaw = readFileSync(baselinePath, "utf8");
const registry = JSON.parse(registryRaw);
const baseline = JSON.parse(baselineRaw);

// The two files' own layouts, each checked to round-trip before anything is written,
// so a release never reformats a file it did not mean to change.
const serialiseRegistry = (r) => `${JSON.stringify(r, null, 2)}\n`;
const serialiseBaseline = (b) => JSON.stringify(b, null, 1).replace(/^ +/gmu, "");
if (serialiseRegistry(registry) !== registryRaw) fail("the registry does not round-trip at indent 2");
if (serialiseBaseline(baseline) !== baselineRaw) fail("the baseline does not round-trip in its own layout");

if (revision === undefined) fail("usage: release.mjs <revision> [--dir <dir>]");
else if (revision === registry.meta.revision) fail(`revision ${revision} is the current one — a release bumps it`);
if (failed > 0) stop();

const norm = (v) => (!v ? [] : Array.isArray(v) ? [...v].sort() : [v]);
const entryOf = (r) => ({
  digest: r.contentDigest,
  status: r.status,
  supersedes: norm(r.supersedes),
  supersededBy: norm(r.supersededBy),
});

// **A sealed entry is compared, never rewritten.** Its status and `supersededBy`
// may have moved legally since — `lint-immutable.mjs` owns that judgement — so
// the release asserts only what can never move: that the rule is still there
// and its content is the content that was sealed.
const byId = new Map(registry.rules.map((r) => [r.id, r]));
for (const [id, sealed] of Object.entries(baseline.rules)) {
  const r = byId.get(id);
  if (r === undefined) fail(`${id}: sealed and no longer in the registry`);
  else if (r.contentDigest !== sealed.digest) fail(`${id}: sealed digest changed — supersede it, do not edit it`);
}
if (failed > 0) stop();

const added = registry.rules.filter((r) => !(r.id in baseline.rules));
const rules = { ...baseline.rules };
for (const r of added) rules[r.id] = entryOf(r);

const canon = JSON.stringify(Object.fromEntries(Object.keys(rules).sort().map((k) => [k, rules[k]])));
const released = {
  releasedAt: new Date().toISOString().slice(0, 10),
  registryRevision: revision,
  rules,
  count: Object.keys(rules).length,
  anchor: { ...baseline.anchor, sha256: createHash("sha256").update(canon).digest("hex") },
};
registry.meta.revision = revision;

writeFileSync(baselinePath, serialiseBaseline(released));
writeFileSync(registryPath, serialiseRegistry(registry));

// Read back, and assert the release is what AUTHORITY.md says a release is.
const after = JSON.parse(readFileSync(baselinePath, "utf8"));
const reg = JSON.parse(readFileSync(registryPath, "utf8"));
if (reg.meta.revision !== revision || after.registryRevision !== revision) fail("the two revisions do not read the new value");
for (const r of reg.rules) if (r.status === "current" && !(r.id in after.rules)) fail(`${r.id}: current and unsealed after the release`);
if (after.count !== reg.rules.length) fail(`sealed ${after.count} of ${reg.rules.length} rules`);
if (failed > 0) { console.error(`FAIL · ${failed} problems after writing — inspect both files`); process.exit(1); }
console.log(`released ${revision} · ${added.length} rules sealed (${added.filter((r) => r.status === "current").length} current) · ${after.count} in the baseline`);
